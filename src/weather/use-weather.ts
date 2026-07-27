import {useCallback, useEffect, useRef, useState} from 'react';
import {REQUEST_TIMEOUT_MS} from '../config.js';
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

export function useWeather(): Weather {
	const [state, setState] = useState<WeatherState>({status: 'loading'});
	const inFlight = useRef(false);
	const abortRef = useRef<AbortController | undefined>(undefined);
	const mounted = useRef(true);

	const refresh = useCallback(() => {
		// A second request would race the first and could apply an older
		// reading over a newer one, so extra presses are simply dropped.
		if (inFlight.current) {
			return;
		}

		inFlight.current = true;
		const controller = new AbortController();
		abortRef.current = controller;

		void (async () => {
			try {
				const reading = await fetchCurrentWeather(controller.signal);
				if (mounted.current) {
					setState({status: 'ready', reading});
				}
			} catch (error) {
				if (!mounted.current) {
					return;
				}

				const message = describeError(error);
				setState(previous => {
					// A failed refresh must not discard a good reading; showing
					// it as stale beats blanking the panel.
					const lastReading =
						previous.status === 'ready' || previous.status === 'stale'
							? previous.reading
							: undefined;

					return lastReading
						? {status: 'stale', reading: lastReading, message}
						: {status: 'error', message};
				});
			} finally {
				inFlight.current = false;
				abortRef.current = undefined;
			}
		})();
	}, []);

	useEffect(() => {
		mounted.current = true;
		refresh();

		return () => {
			mounted.current = false;
			abortRef.current?.abort();
		};
	}, [refresh]);

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
