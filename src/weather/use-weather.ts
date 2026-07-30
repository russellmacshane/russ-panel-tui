import {useCallback, useEffect, useRef, useState} from 'react';
import {REQUEST_TIMEOUT_MS} from '../config.js';
import type {Location} from '../location/types.js';
import {fetchCurrentWeather, type WeatherReading} from './client.js';

export type WeatherState =
	| {status: 'loading'}
	| {status: 'ready'; reading: WeatherReading}
	| {status: 'error'; message: string}
	| {status: 'stale'; reading: WeatherReading; message: string};

export type Weather = {
	state: WeatherState;
	refresh: () => void;
};

/**
 * A `Location` may be a fresh object every render even when it names the same
 * place, so identity is compared by coordinates rather than by reference.
 */
function locationKey(location: Location): string {
	return `${location.latitude},${location.longitude}`;
}

export function useWeather(location: Location): Weather {
	const [state, setState] = useState<WeatherState>({status: 'loading'});
	const inFlight = useRef(false);
	const abortRef = useRef<AbortController | undefined>(undefined);
	const mounted = useRef(true);
	// The location a settling request should be judged against. Read through a
	// ref rather than the `location` argument an in-flight request's closure
	// captured, which goes stale the moment the location changes again.
	const activeKey = useRef(locationKey(location));

	const runFetch = useCallback((target: Location) => {
		inFlight.current = true;
		const controller = new AbortController();
		abortRef.current = controller;
		const key = locationKey(target);

		void (async () => {
			try {
				const reading = await fetchCurrentWeather(target, controller.signal);
				// A response can arrive after the active location has moved on —
				// even after this request's own abort fired, since abort can race
				// an already-settled promise. The tag is the source of truth for
				// "is this result still wanted", not the abort.
				if (mounted.current && activeKey.current === key) {
					setState({status: 'ready', reading});
				}
			} catch (error) {
				if (!mounted.current || activeKey.current !== key) {
					return;
				}

				const message = describeError(error);
				setState(previous => {
					// A failed refresh must not discard a good reading from the
					// SAME location; showing it as stale beats blanking the panel.
					// (A location change never reaches this branch stale — it
					// resets to loading before a new request is even issued.)
					const lastReading =
						previous.status === 'ready' || previous.status === 'stale'
							? previous.reading
							: undefined;

					return lastReading
						? {status: 'stale', reading: lastReading, message}
						: {status: 'error', message};
				});
			} finally {
				// A superseded request's `finally` must not clear the flag for
				// the request that replaced it.
				if (abortRef.current === controller) {
					inFlight.current = false;
					abortRef.current = undefined;
				}
			}
		})();
	}, []);

	const refresh = useCallback(() => {
		// A second request would race the first and could apply an older
		// reading over a newer one, so extra presses are simply dropped.
		if (inFlight.current) {
			return;
		}

		runFetch(location);
	}, [runFetch, location]);

	const key = locationKey(location);

	useEffect(() => {
		mounted.current = true;
		const changed = key !== activeKey.current;
		activeKey.current = key;

		if (changed) {
			// A location change is not a duplicate refresh: discard whatever
			// reading (stale or otherwise) belonged to the location being
			// replaced, so it can never render under the new location's name.
			setState({status: 'loading'});
		}

		runFetch(location);

		return () => {
			mounted.current = false;
			// On unmount this is the hook's own request. On a location change
			// this runs first, as the cleanup of THIS effect invocation, and
			// aborts whatever was in flight for the location being replaced.
			abortRef.current?.abort();
		};
		// Keyed on the derived key, not `location` itself or `runFetch`: a
		// `Location` object may be recreated every render even when unchanged,
		// and refetching on every render would break "exactly one request on
		// mount".
	}, [key]);

	return {state, refresh};
}

function describeError(error: unknown): string {
	const name = (error as {name?: string} | null)?.name;

	if (name === 'TimeoutError') {
		return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`;
	}

	if (name === 'AbortError') {
		return 'Request cancelled';
	}

	if (error instanceof Error) {
		// `fetch` reports offline as a bare "fetch failed"; the cause carries
		// the part that actually tells the user what went wrong.
		const cause = (error.cause as {message?: string} | undefined)?.message;
		return cause ? `${error.message} — ${cause}` : error.message;
	}

	return 'Unknown error';
}
