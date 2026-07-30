import {createElement} from 'react';
import {Text} from 'ink';
import {describe, expect, test} from 'vitest';
import {
	fetchCallCount,
	respondWhenTold,
	respondWithError,
	respondWithJson,
} from '../../test/support/fetch-stub.js';
import {render} from '../../test/support/render.js';
import {DEFAULT_LOCATION, REQUEST_TIMEOUT_MS} from '../config.js';
import type {Location} from '../location/types.js';
import {useWeather, type WeatherState} from './use-weather.js';

const OTHER_LOCATION: Location = {
	name: 'Portland',
	admin1: 'Oregon',
	country: 'United States',
	latitude: 45.5152,
	longitude: -122.6784,
};

/**
 * These tests drive the state machine through the real client and the real
 * parser, with only `globalThis.fetch` replaced — so a regression in either
 * layer surfaces here, which is where it would actually hide.
 *
 * Written in a `.ts` file with `createElement` rather than JSX: the only
 * component involved is this one-line probe.
 */
type Harness = {
	/** Every state the hook has produced, oldest first. */
	states: WeatherState[];
	/** The most recent state. */
	state: () => WeatherState;
	refresh: () => void;
	/** Re-render with a new active location, simulating a location change. */
	rerender: (location: Location) => void;
	flush: () => Promise<unknown>;
	unmount: () => void;
};

function renderUseWeather(location: Location = DEFAULT_LOCATION): Harness {
	const states: WeatherState[] = [];
	let refresh = () => {};

	function Probe({location}: {location: Location}) {
		const weather = useWeather(location);
		states.push(weather.state);
		refresh = weather.refresh;
		return createElement(Text, null, weather.state.status);
	}

	const harness = render(createElement(Probe, {location}));

	return {
		states,
		state: () => states.at(-1)!,
		refresh: () => {
			refresh();
		},
		rerender: (newLocation: Location) => {
			harness.rerender(createElement(Probe, {location: newLocation}));
		},
		flush: () => harness.waitUntilRenderFlush(),
		unmount: harness.unmount,
	};
}

function reading(temperature: number, weatherCode = 3) {
	return {
		current: {temperature_2m: temperature, weather_code: weatherCode},
		current_units: {temperature_2m: '°F'},
	};
}

describe('initial load', () => {
	test('mounts in loading, then transitions to ready on success', async () => {
		const arrived = respondWhenTold();
		const harness = renderUseWeather();

		const request = await arrived;
		expect(harness.states[0]).toEqual({status: 'loading'});

		request.resolveJson(reading(71.4));
		await harness.flush();

		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 71.4, temperatureUnit: '°F', weatherCode: 3},
		});
	});

	test('a failure with no prior reading yields error', async () => {
		respondWithError('Open-Meteo is unreachable');
		const harness = renderUseWeather();
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message: 'Open-Meteo is unreachable',
		});
	});

	test('issues exactly one request on mount', async () => {
		respondWithJson(reading(71.4));
		const harness = renderUseWeather();
		await harness.flush();

		expect(fetchCallCount()).toBe(1);
		expect(harness.state().status).toBe('ready');
	});
});

async function mountReady(temperature = 71.4) {
	respondWithJson(reading(temperature));
	const harness = renderUseWeather();
	await harness.flush();
	expect(harness.state().status).toBe('ready');
	return harness;
}

describe('refreshing', () => {
	test('a successful refresh replaces the reading', async () => {
		const harness = await mountReady(71.4);

		respondWithJson(reading(58.2, 61));
		harness.refresh();
		await harness.flush();

		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 58.2, weatherCode: 61},
		});
	});

	// A failed refresh must not discard a good reading — showing it as stale
	// beats blanking the panel.
	test('a failed refresh yields stale, keeping the reading and its original retrieval time', async () => {
		const harness = await mountReady(71.4);
		const before = harness.state();
		expect(before.status).toBe('ready');
		const original =
			before.status === 'ready' ? before.reading.retrievedAt : undefined;

		respondWithError('Open-Meteo is unreachable');
		harness.refresh();
		await harness.flush();

		const after = harness.state();
		expect(after).toMatchObject({
			status: 'stale',
			reading: {temperature: 71.4},
			message: 'Open-Meteo is unreachable',
		});
		// The same Date instance, not merely an equal one: the displayed time
		// must still describe when the good reading was actually retrieved.
		expect(after.status === 'stale' && after.reading.retrievedAt).toBe(
			original,
		);
	});

	test('a successful refresh from stale clears the stale marking', async () => {
		const harness = await mountReady(71.4);

		respondWithError('Open-Meteo is unreachable');
		harness.refresh();
		await harness.flush();
		expect(harness.state().status).toBe('stale');

		respondWithJson(reading(63.9, 0));
		harness.refresh();
		await harness.flush();

		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 63.9, weatherCode: 0},
		});
		expect(harness.state()).not.toHaveProperty('message');
	});

	test('a second failure from stale keeps the original reading', async () => {
		const harness = await mountReady(71.4);

		respondWithError('first failure');
		harness.refresh();
		await harness.flush();

		respondWithError('second failure');
		harness.refresh();
		await harness.flush();

		expect(harness.state()).toMatchObject({
			status: 'stale',
			reading: {temperature: 71.4},
			message: 'second failure',
		});
	});

	// A second request would race the first and could apply an older reading
	// over a newer one, so extra presses are dropped rather than queued.
	test('a refresh while a request is in flight is dropped', async () => {
		const arrived = respondWhenTold();
		const harness = renderUseWeather();
		const request = await arrived;
		expect(fetchCallCount()).toBe(1);

		harness.refresh();
		harness.refresh();
		harness.refresh();

		expect(fetchCallCount()).toBe(1);

		request.resolveJson(reading(71.4));
		await harness.flush();
		expect(harness.state().status).toBe('ready');

		// Once settled, a refresh is accepted again.
		respondWithJson(reading(70));
		harness.refresh();
		await harness.flush();
		expect(fetchCallCount()).toBe(2);
	});
});

describe('location changes', () => {
	test('a location change while a request is pending issues a new request rather than being dropped', async () => {
		const arrivedFirst = respondWhenTold();
		const harness = renderUseWeather();
		await arrivedFirst;
		expect(fetchCallCount()).toBe(1);

		respondWithJson(reading(60));
		harness.rerender(OTHER_LOCATION);
		await harness.flush();

		expect(fetchCallCount()).toBe(2);
		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 60},
		});
	});

	test('a failed first fetch after a location change shows error, not stale', async () => {
		const harness = await mountReady(71.4);

		respondWithError('Open-Meteo is unreachable');
		harness.rerender(OTHER_LOCATION);
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message: 'Open-Meteo is unreachable',
		});
	});

	test('a superseded response is ignored once the location has moved on', async () => {
		const arrivedFirst = respondWhenTold();
		const harness = renderUseWeather();
		const firstRequest = await arrivedFirst;

		respondWithJson(reading(50));
		harness.rerender(OTHER_LOCATION);
		await harness.flush();
		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 50},
		});

		// The old location's request settles late — after abort, but abort can
		// race an already-in-flight resolution, so this must be caught by the
		// location tag rather than relying on the abort alone.
		firstRequest.resolveJson(reading(99));
		await harness.flush();

		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 50},
		});
	});

	test('returning to a previous location issues a fresh request rather than reusing its old reading', async () => {
		const harness = await mountReady(71.4);

		respondWithJson(reading(60));
		harness.rerender(OTHER_LOCATION);
		await harness.flush();
		expect(fetchCallCount()).toBe(2);

		respondWithJson(reading(71.4));
		harness.rerender(DEFAULT_LOCATION);
		await harness.flush();

		expect(fetchCallCount()).toBe(3);
		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 71.4},
		});
	});

	test('a stale reading is discarded on location change, not carried over relabelled', async () => {
		const harness = await mountReady(71.4);

		respondWithError('Open-Meteo is unreachable');
		harness.refresh();
		await harness.flush();
		expect(harness.state().status).toBe('stale');

		const arrivedNext = respondWhenTold();
		harness.rerender(OTHER_LOCATION);
		const nextRequest = await arrivedNext;
		await harness.flush();

		// The new location starts fresh at loading — no stale reading or
		// message survives from the location it replaced.
		expect(harness.state()).toEqual({status: 'loading'});

		nextRequest.resolveJson(reading(55));
		await harness.flush();

		expect(harness.state()).toMatchObject({
			status: 'ready',
			reading: {temperature: 55},
		});
	});
});

describe('unmount', () => {
	test('aborts the in-flight request and attempts no further state update', async () => {
		const arrived = respondWhenTold();
		const harness = renderUseWeather();
		const request = await arrived;
		expect(request.signal?.aborted).toBe(false);

		harness.unmount();

		expect(request.signal?.aborted).toBe(true);

		const stateCount = harness.states.length;
		// A late resolution must be ignored; if the hook still called
		// setState, React would warn and a new state would be recorded.
		request.resolveJson(reading(71.4));
		await Promise.resolve();
		await Promise.resolve();

		expect(harness.states.length).toBe(stateCount);
		expect(harness.state().status).toBe('loading');
	});

	test('a late rejection after unmount is ignored', async () => {
		const arrived = respondWhenTold();
		const harness = renderUseWeather();
		const request = await arrived;

		harness.unmount();
		const stateCount = harness.states.length;

		request.reject('Request cancelled', 'AbortError');
		await Promise.resolve();
		await Promise.resolve();

		expect(harness.states.length).toBe(stateCount);
	});
});

// `describeError` dispatches on `error.name`, so rejecting with a chosen name
// exercises the whole timeout path in milliseconds rather than waiting out a
// real 8s `AbortSignal.timeout`.
describe('error messages', () => {
	test('a TimeoutError reports the configured timeout', async () => {
		respondWithError('The operation timed out', 'TimeoutError');
		const harness = renderUseWeather();
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
		});
	});

	test('an AbortError reports a cancelled request', async () => {
		respondWithError('This operation was aborted', 'AbortError');
		const harness = renderUseWeather();
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message: 'Request cancelled',
		});
	});

	// `fetch` reports offline as a bare "fetch failed"; the cause carries the
	// part that actually tells the user what went wrong.
	test('a bare `fetch failed` surfaces its cause', async () => {
		respondWithError(
			'fetch failed',
			'TypeError',
			new Error('getaddrinfo ENOTFOUND api.open-meteo.com'),
		);
		const harness = renderUseWeather();
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message:
				'fetch failed — getaddrinfo ENOTFOUND api.open-meteo.com',
		});
	});

	test('an error with no cause reports its own message', async () => {
		respondWithError('fetch failed', 'TypeError');
		const harness = renderUseWeather();
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message: 'fetch failed',
		});
	});

	test('a parse failure surfaces as the parser message', async () => {
		respondWithJson({current: {temperature_2m: 71.4}});
		const harness = renderUseWeather();
		await harness.flush();

		expect(harness.state()).toEqual({
			status: 'error',
			message: 'Open-Meteo response is missing a weather code',
		});
	});
});
