/**
 * A default-deny replacement for `globalThis.fetch`.
 *
 * `src/weather/client.ts` calls the global `fetch` directly, so replacing that
 * one global puts the whole weather stack under test — the real parser and the
 * real state machine, exercised together, with no module mocking.
 *
 * Default-deny is the important half. `src/app.tsx` calls `useWeather()`
 * unconditionally and `useWeather` fires a request from a mount effect, so any
 * render of `<App />` in a test would otherwise reach api.open-meteo.com. An
 * unprogrammed request throws instead, naming the URL, so accidental network
 * access is a loud immediate failure rather than intermittent flakiness.
 */

/** A request the test is holding open, to settle when it chooses. */
export type PendingRequest = {
	/** The URL the code under test asked for. */
	url: string;
	/** The signal `client.ts` passed, so a test can observe an abort. */
	signal: AbortSignal | undefined;
	/** Settle the request with a JSON body and a 200 status. */
	resolveJson: (body: unknown, init?: ResponseInit) => void;
	/** Settle the request with a raw body — for malformed-JSON cases. */
	resolveBody: (body: string, init?: ResponseInit) => void;
	/**
	 * Fail the request. `name` sets `error.name`, which is what
	 * `describeError` in use-weather.ts dispatches on, so passing
	 * `'TimeoutError'` or `'AbortError'` exercises those paths in
	 * milliseconds instead of waiting out a real 8s timeout.
	 */
	reject: (message: string, name?: string, cause?: unknown) => void;
};

// Derived from `fetch` itself rather than named directly: `RequestInfo` is a
// DOM-lib global, and this project's tsconfig deliberately includes no DOM lib.
type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];

type Responder = (url: string, init: FetchInit) => Promise<Response>;

let responders: Responder[] = [];
let calls: string[] = [];
let pending: PendingRequest[] = [];
let realFetch: typeof globalThis.fetch | undefined;
let installed = false;

function toUrl(input: FetchInput): string {
	if (typeof input === 'string') {
		return input;
	}

	return input instanceof URL ? input.toString() : input.url;
}

/** Replace `globalThis.fetch`. Idempotent, so setup order cannot double-wrap. */
export function installFetchStub(): void {
	if (installed) {
		return;
	}

	installed = true;
	realFetch = globalThis.fetch;

	globalThis.fetch = (async (
		input: FetchInput,
		init?: FetchInit,
	): Promise<Response> => {
		const url = toUrl(input);
		calls.push(url);

		const responder = responders.shift();
		if (!responder) {
			throw new Error(`unexpected fetch: ${url}`);
		}

		return responder(url, init);
	}) as typeof globalThis.fetch;
}

/**
 * Drop every programmed response and recorded call, and reject anything still
 * pending so a held-open request cannot land a `setState` in the next test.
 */
export function resetFetchStub(): void {
	responders = [];
	calls = [];

	const orphaned = pending;
	pending = [];
	for (const request of orphaned) {
		request.reject('test ended with a request still pending', 'AbortError');
	}
}

/** Put `globalThis.fetch` back. Used only if a test needs the real thing. */
export function uninstallFetchStub(): void {
	if (!installed) {
		return;
	}

	installed = false;
	if (realFetch) {
		globalThis.fetch = realFetch;
	}
}

/** Every URL requested since the last reset, in order. */
export function fetchCalls(): readonly string[] {
	return calls;
}

/** How many requests have been issued since the last reset. */
export function fetchCallCount(): number {
	return calls.length;
}

function response(body: string, init?: ResponseInit): Response {
	return new Response(body, {
		status: 200,
		headers: {'content-type': 'application/json'},
		...init,
	});
}

/** Program the next request to resolve with `body` serialised as JSON. */
export function respondWithJson(body: unknown, init?: ResponseInit): void {
	responders.push(async () => response(JSON.stringify(body), init));
}

/**
 * Program the next request to resolve with a raw body. Use for responses that
 * are not valid JSON.
 */
export function respondWithBody(body: string, init?: ResponseInit): void {
	responders.push(async () => response(body, init));
}

/** Program the next request to resolve with a non-ok HTTP status. */
export function respondWithStatus(
	status: number,
	statusText: string,
	body = '',
): void {
	responders.push(async () => new Response(body, {status, statusText}));
}

/**
 * Program the next request to reject. `name` sets `error.name`; `cause` is
 * what `fetch` uses to carry the real reason behind a bare "fetch failed".
 */
export function respondWithError(
	message: string,
	name?: string,
	cause?: unknown,
): void {
	responders.push(async () => {
		throw makeError(message, name, cause);
	});
}

function makeError(message: string, name?: string, cause?: unknown): Error {
	const error = new Error(message, cause === undefined ? undefined : {cause});
	if (name) {
		error.name = name;
	}

	return error;
}

/**
 * Program the next request to hang. Returns a promise for the handle, which
 * settles once the code under test actually issues the request — so a test can
 * assert on the pending state, then resolve or reject on demand.
 *
 * This is the primitive behind the in-flight de-duplication test, the
 * abort-on-unmount test, and the stale-then-recover sequence.
 */
export function respondWhenTold(): Promise<PendingRequest> {
	let handOver: (request: PendingRequest) => void;
	const arrived = new Promise<PendingRequest>(resolve => {
		handOver = resolve;
	});

	responders.push(
		async (url, init) =>
			new Promise<Response>((resolve, reject) => {
				const settle = (fn: () => void) => {
					pending = pending.filter(entry => entry !== request);
					fn();
				};

				const request: PendingRequest = {
					url,
					signal: init?.signal ?? undefined,
					resolveJson(body, responseInit) {
						settle(() => {
							resolve(response(JSON.stringify(body), responseInit));
						});
					},
					resolveBody(body, responseInit) {
						settle(() => {
							resolve(response(body, responseInit));
						});
					},
					reject(message, name, cause) {
						settle(() => {
							reject(makeError(message, name, cause));
						});
					},
				};

				pending.push(request);
				handOver(request);
			}),
	);

	return arrived;
}
