import {describe, expect, test} from 'vitest';
import {
	fetchCallCount,
	fetchCalls,
	respondWhenTold,
	respondWithError,
	respondWithJson,
	respondWithStatus,
} from './fetch-stub.js';

describe('default deny', () => {
	test('an unprogrammed request throws, naming the URL', async () => {
		await expect(fetch('https://api.open-meteo.com/v1/forecast')).rejects.toThrow(
			'unexpected fetch: https://api.open-meteo.com/v1/forecast',
		);
	});

	test('a programmed response is returned without a real request', async () => {
		respondWithJson({current: {temperature_2m: 71.5}});

		const response = await fetch('https://example.test/weather');

		expect(response.ok).toBe(true);
		await expect(response.json()).resolves.toEqual({
			current: {temperature_2m: 71.5},
		});
		expect(fetchCalls()).toEqual(['https://example.test/weather']);
	});

	test('a non-ok status is delivered rather than thrown', async () => {
		respondWithStatus(503, 'Service Unavailable');

		const response = await fetch('https://example.test/weather');

		expect(response.ok).toBe(false);
		expect(response.status).toBe(503);
		expect(response.statusText).toBe('Service Unavailable');
	});

	test('a programmed error rejects with the given name and cause', async () => {
		respondWithError('fetch failed', 'TypeError', new Error('ENOTFOUND'));

		await expect(fetch('https://example.test/weather')).rejects.toMatchObject({
			name: 'TypeError',
			message: 'fetch failed',
			cause: {message: 'ENOTFOUND'},
		});
	});
});

// The point of these two is ordering: the first programs a response and does
// not consume it, the second must still see default-deny. If `afterEach` in
// setup.ts stopped resetting, the second test would silently pass a request
// through to the leftover responder.
describe('no leakage between tests', () => {
	test('programs a response and deliberately leaves it unconsumed', () => {
		respondWithJson({leaked: true});
		expect(fetchCallCount()).toBe(0);
	});

	test('the next test sees default-deny and a clean call log', async () => {
		expect(fetchCalls()).toEqual([]);
		await expect(fetch('https://example.test/second')).rejects.toThrow(
			'unexpected fetch: https://example.test/second',
		);
	});
});

describe('deferred requests', () => {
	test('a held request stays pending until told to resolve', async () => {
		const arrived = respondWhenTold();

		let settled = false;
		const inFlight = fetch('https://example.test/held').then(response => {
			settled = true;
			return response;
		});

		const request = await arrived;
		expect(request.url).toBe('https://example.test/held');
		// Give the microtask queue every chance to settle it early.
		await Promise.resolve();
		expect(settled).toBe(false);

		request.resolveJson({temperature_2m: 42});
		await expect((await inFlight).json()).resolves.toEqual({
			temperature_2m: 42,
		});
	});

	test('a held request can be rejected with a chosen error name', async () => {
		const arrived = respondWhenTold();
		const inFlight = fetch('https://example.test/held');

		(await arrived).reject('The operation timed out', 'TimeoutError');

		await expect(inFlight).rejects.toMatchObject({
			name: 'TimeoutError',
			message: 'The operation timed out',
		});
	});

	test('a held request exposes the abort signal it was given', async () => {
		const arrived = respondWhenTold();
		const controller = new AbortController();
		const inFlight = fetch('https://example.test/held', {
			signal: controller.signal,
		});

		const request = await arrived;
		expect(request.signal?.aborted).toBe(false);

		controller.abort();
		expect(request.signal?.aborted).toBe(true);

		request.reject('Request cancelled', 'AbortError');
		await expect(inFlight).rejects.toMatchObject({name: 'AbortError'});
	});

	test('responses are handed out in the order they were programmed', async () => {
		respondWithJson({first: true});
		respondWithJson({second: true});

		await expect(
			(await fetch('https://example.test/a')).json(),
		).resolves.toEqual({first: true});
		await expect(
			(await fetch('https://example.test/b')).json(),
		).resolves.toEqual({second: true});

		expect(fetchCalls()).toEqual([
			'https://example.test/a',
			'https://example.test/b',
		]);
	});
});
