import {describe, expect, test} from 'vitest';
import {
	fetchCallCount,
	respondWhenTold,
	respondWithJson,
} from '../test/support/fetch-stub.js';
import {keys} from '../test/support/fake-terminal.js';
import {render, type RenderOptions} from '../test/support/render.js';
import App from './app.js';

function currentWeather(temperature = 71.4, weatherCode = 3) {
	return {
		current: {temperature_2m: temperature, weather_code: weatherCode},
		current_units: {temperature_2m: '°F'},
	};
}

/**
 * `App` fires a request from a mount effect, so every test here must program a
 * response — an unprogrammed one throws `unexpected fetch`, which is exactly
 * the point of the default-deny stub.
 */
async function renderApp(options: RenderOptions = {}) {
	respondWithJson(currentWeather());
	const harness = render(<App />, {columns: 100, rows: 30, ...options});
	await harness.waitUntilRenderFlush();
	return harness;
}

function dimensions(frame: string) {
	const lines = frame.split('\n');
	return {
		rows: lines.length,
		widest: Math.max(...lines.map(line => line.length)),
	};
}

/**
 * Ink does not emit the final column of a full-width box, so a frame laid out
 * at N columns measures N-1. Asserted as a range rather than pinning the
 * off-by-one, which is Ink's business and not this app's contract.
 */
function expectSize(
	frame: string,
	{columns, rows}: {columns: number; rows: number},
) {
	const actual = dimensions(frame);
	expect(actual.rows).toBe(rows);
	expect(actual.widest).toBeLessThanOrEqual(columns);
	expect(actual.widest).toBeGreaterThanOrEqual(columns - 1);
}

describe('the footer', () => {
	test('lists the quit and refresh bindings', async () => {
		const harness = await renderApp();

		expect(harness.lastFrame()).toContain('q quit');
		expect(harness.lastFrame()).toContain('r refresh');
	});
});

describe('key bindings', () => {
	test('q exits the app', async () => {
		const harness = await renderApp();

		harness.write('q');

		await expect(harness.waitUntilExit()).resolves.toBeUndefined();
	});

	test('Escape exits the app', async () => {
		const harness = await renderApp();

		harness.write(keys.escape);

		await expect(harness.waitUntilExit()).resolves.toBeUndefined();
	});

	test('an unrelated key does not exit', async () => {
		const harness = await renderApp();
		let exited = false;
		void harness.waitUntilExit().then(() => {
			exited = true;
		});

		harness.write('x');
		await harness.waitUntilRenderFlush();

		expect(exited).toBe(false);
	});

	test('r issues a refresh', async () => {
		const harness = await renderApp();
		expect(fetchCallCount()).toBe(1);

		respondWithJson(currentWeather(58.2, 61));
		harness.write('r');
		await harness.waitUntilRenderFlush();

		expect(fetchCallCount()).toBe(2);
		expect(harness.lastFrame()).toContain('58.2°F');
		expect(harness.lastFrame()).toContain('Slight rain');
	});

	// Extra presses are dropped rather than queued: a second request could
	// race the first and apply an older reading over a newer one.
	test('r is dropped while a request is already in flight', async () => {
		const harness = await renderApp();
		expect(fetchCallCount()).toBe(1);

		const arrived = respondWhenTold();
		harness.write('r');
		const request = await arrived;
		expect(fetchCallCount()).toBe(2);

		harness.write('r');
		await harness.waitUntilRenderFlush();
		harness.write('r');
		await harness.waitUntilRenderFlush();

		expect(fetchCallCount()).toBe(2);

		request.resolveJson(currentWeather(63.9, 0));
		await harness.waitUntilRenderFlush();
		expect(harness.lastFrame()).toContain('63.9°F');
	});
});

describe('viewport sizing', () => {
	// The alternate screen has no scrollback to absorb overflow, so the root
	// box must track the terminal's real size.
	test('the root layout uses the terminal dimensions', async () => {
		const harness = await renderApp({columns: 100, rows: 30});

		expectSize(harness.lastFrame(), {columns: 100, rows: 30});
	});

	test('a different size is honoured', async () => {
		const harness = await renderApp({columns: 60, rows: 18});

		expectSize(harness.lastFrame(), {columns: 60, rows: 18});
	});

	test('zero dimensions fall back to 80x24', async () => {
		const harness = await renderApp({columns: 0, rows: 0});

		expectSize(harness.lastFrame(), {columns: 80, rows: 24});
	});

	test('absent dimensions fall back to 80x24', async () => {
		const harness = await renderApp({columns: null, rows: null});

		expectSize(harness.lastFrame(), {columns: 80, rows: 24});
	});

	test('a resize re-renders at the new dimensions', async () => {
		const harness = await renderApp({columns: 100, rows: 30});
		expectSize(harness.lastFrame(), {columns: 100, rows: 30});

		harness.resize({columns: 60, rows: 18});
		await harness.waitUntilRenderFlush();

		expectSize(harness.lastFrame(), {columns: 60, rows: 18});
	});

	test('a resize to a larger terminal is followed too', async () => {
		const harness = await renderApp({columns: 60, rows: 18});

		harness.resize({columns: 120, rows: 40});
		await harness.waitUntilRenderFlush();

		expectSize(harness.lastFrame(), {columns: 120, rows: 40});
	});
});

describe('the weather panel is mounted', () => {
	test('the panel renders inside the shell', async () => {
		const harness = await renderApp();

		expect(harness.lastFrame()).toContain('WEATHER');
		expect(harness.lastFrame()).toContain('71.4°F');
	});
});
