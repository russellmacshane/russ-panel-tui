import {expect, test} from 'vitest';
import {render} from '../../test/support/render.js';
import {LOCATION} from '../config.js';
import type {WeatherReading} from './client.js';
import {WeatherPanel} from './weather-panel.js';

function reading(overrides: Partial<WeatherReading> = {}): WeatherReading {
	return {
		temperature: 71.4,
		temperatureUnit: '°F',
		weatherCode: 3,
		retrievedAt: new Date('2026-07-28T14:35:00Z'),
		...overrides,
	};
}

/**
 * Renders the panel wide enough that nothing wraps — a truncated frame would
 * fail these assertions for reasons that have nothing to do with the panel.
 */
async function renderPanel(state: Parameters<typeof WeatherPanel>[0]['state']) {
	const harness = render(<WeatherPanel state={state} />, {
		columns: 100,
		rows: 30,
	});
	await harness.waitUntilRenderFlush();
	return harness.lastFrame();
}

test('every state shows the panel heading and location', async () => {
	const frame = await renderPanel({status: 'loading'});

	expect(frame).toContain('WEATHER');
	expect(frame).toContain(LOCATION.name);
});

test('loading shows a loading indication and no placeholder values', async () => {
	const frame = await renderPanel({status: 'loading'});

	expect(frame).toContain('Loading current conditions');
	// The whole point of the defensive parser is that a half-populated panel
	// never appears; `undefined` or `NaN` on screen would mean it leaked.
	expect(frame).not.toMatch(/undefined|NaN|null/);
	expect(frame).not.toContain('Updated');
	expect(frame).not.toContain('Stale');
});

test('ready shows the temperature with its unit, the conditions, and a timestamp', async () => {
	const frame = await renderPanel({
		status: 'ready',
		reading: reading({temperature: 71.4, temperatureUnit: '°F'}),
	});

	expect(frame).toContain('71.4°F');
	expect(frame).toContain('Overcast');
	expect(frame).toContain(LOCATION.name);
	// Asserts a timestamp is present, not what it reads: `toLocaleTimeString`
	// output varies by machine and locale, so pinning it would be a test that
	// passes locally and fails elsewhere.
	expect(frame).toMatch(/Updated\s+\S+/);
	expect(frame).not.toMatch(/undefined|NaN/);
});

test('an unrecognised weather code still shows the temperature and reports the raw code', async () => {
	const frame = await renderPanel({
		status: 'ready',
		reading: reading({temperature: 58.2, weatherCode: 123}),
	});

	expect(frame).toContain('58.2°F');
	expect(frame).toContain('Unknown conditions (WMO code 123)');
});

test('error shows the failure message and tells the user r retries', async () => {
	const frame = await renderPanel({
		status: 'error',
		message: 'Request timed out after 8s',
	});

	expect(frame).toContain('Could not load weather');
	expect(frame).toContain('Request timed out after 8s');
	expect(frame).toContain('Press r to retry');
	// Nothing to show a reading from, so no stale reading may appear.
	expect(frame).not.toContain('Updated');
});

test('stale shows the previous reading, a stale marker, and why the refresh failed', async () => {
	const frame = await renderPanel({
		status: 'stale',
		reading: reading({temperature: 63.9, weatherCode: 61}),
		message: 'fetch failed — getaddrinfo ENOTFOUND api.open-meteo.com',
	});

	expect(frame).toContain('63.9°F');
	expect(frame).toContain('Slight rain');
	expect(frame).toMatch(/Updated\s+\S+/);
	expect(frame).toContain('Stale');
	expect(frame).toContain('refresh failed');
	expect(frame).toContain('getaddrinfo ENOTFOUND api.open-meteo.com');
});

test('stale keeps the reading visible rather than replacing it with the error', async () => {
	const frame = await renderPanel({
		status: 'stale',
		reading: reading(),
		message: 'Open-Meteo is unreachable',
	});

	expect(frame).toContain('71.4°F');
	expect(frame).not.toContain('Could not load weather');
});
