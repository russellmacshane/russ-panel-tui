import {describe, expect, test} from 'vitest';
import {breakNextConfigWrite, writeMalformedConfig} from '../test/support/config-fs.js';
import {
	fetchCallCount,
	respondWhenTold,
	respondWithJson,
} from '../test/support/fetch-stub.js';
import {keys} from '../test/support/fake-terminal.js';
import {render, type RenderOptions, type Rendered} from '../test/support/render.js';
import App from './app.js';
import {DEFAULT_LOCATION} from './config.js';
import {readConfig} from './location/config-store.js';
import {formatLocation} from './location/format.js';
import type {NoticeController} from './shell/notice.js';

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

/**
 * Nothing in production posts a notice yet — that lands with Phase 7 — so
 * tests reach the otherwise-private notice state through this callback prop,
 * the same role a `Probe` component plays for `useWeather` in its own tests.
 */
async function renderAppWithNotice(options: RenderOptions = {}) {
	respondWithJson(currentWeather());
	let controller!: NoticeController;
	const harness = render(
		<App
			onNoticeControllerReady={received => {
				controller = received;
			}}
		/>,
		{columns: 100, rows: 30, ...options},
	);
	await harness.waitUntilRenderFlush();
	return {harness, controller};
}

/**
 * A lone Escape byte could be the start of a longer escape sequence (an
 * arrow key, for instance), so Ink buffers it for a short window before
 * flushing it as a standalone Escape keypress (`App.js`'s
 * `pendingInputFlushDelayMilliseconds`, currently 20ms). A render flush right
 * after `write(keys.escape)` can therefore observe the pre-Escape state; this
 * waits out that window first.
 */
async function pressEscape(harness: Awaited<ReturnType<typeof renderApp>>) {
	harness.write(keys.escape);
	await new Promise(resolve => setTimeout(resolve, 30));
	await harness.waitUntilRenderFlush();
}

/**
 * Sends each character as its own write, flushing between them. Two
 * `stdin.write()` calls with no yield between them can coalesce into a
 * single stdin chunk before Ink reads it — harmless for plain text, but it
 * would corrupt a chunk that mixes typed text with a following Enter, so
 * every keystroke bound for the picker is sent on its own.
 */
async function type(harness: Rendered, text: string): Promise<void> {
	for (const char of text) {
		harness.write(char);
		await harness.waitUntilRenderFlush();
	}
}

async function press(harness: Rendered, key: string): Promise<void> {
	harness.write(key);
	await harness.waitUntilRenderFlush();
}

/**
 * Polls for a frame satisfying `predicate`. Needed only where a real async
 * effect (a config file read or write) must settle before the assertion —
 * `loadActiveLocation`/`selectLocation` run against a real disposable
 * directory (`config-fs.ts`), not a fake, so there is no seam to await
 * directly from a test that only holds the rendered `App`.
 */
async function waitForFrame(
	harness: Rendered,
	predicate: (frame: string) => boolean,
	{timeoutMs = 2000}: {timeoutMs?: number} = {},
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		await harness.waitUntilRenderFlush();
		if (predicate(harness.lastFrame())) {
			return;
		}

		if (Date.now() >= deadline) {
			throw new Error(
				`timed out waiting for a matching frame; last frame:\n${harness.lastFrame()}`,
			);
		}

		await new Promise(resolve => setTimeout(resolve, 5));
	}
}

/** A well-formed raw Open-Meteo geocoding result. */
function springfieldResult(): Record<string, unknown> {
	return {
		name: 'Springfield',
		latitude: 37.2153,
		longitude: -93.2982,
		admin1: 'Missouri',
		admin2: 'Greene',
		country: 'United States',
		timezone: 'America/Chicago',
		population: 170188,
	};
}

// Ink styles frame content with ANSI escape codes (bold, color, dim), which
// are invisible width but still count toward `String.prototype.length`.
// Measuring raw length is only safe when color happens to be off; stripping
// first makes the measurement correct regardless of the environment's color
// support (`FORCE_COLOR`/`COLORTERM`), rather than accidentally depending on it.
const ANSI_ESCAPE_PATTERN = /\[[0-9;?]*[a-zA-Z]/g;

function dimensions(frame: string) {
	const lines = frame.split('\n');
	return {
		rows: lines.length,
		widest: Math.max(
			...lines.map(line => line.replace(ANSI_ESCAPE_PATTERN, '').length),
		),
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
	test('lists the quit, refresh, and location bindings in normal mode', async () => {
		const harness = await renderApp();

		expect(harness.lastFrame()).toContain('q quit');
		expect(harness.lastFrame()).toContain('r refresh');
		expect(harness.lastFrame()).toContain('l location');
	});

	test('reflects location mode once entered, dropping the normal-mode text', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();

		expect(harness.lastFrame()).toContain('Esc back');
		expect(harness.lastFrame()).not.toContain('q quit');
	});
});

describe('key bindings', () => {
	test('q exits the app', async () => {
		const harness = await renderApp();

		harness.write('q');

		await expect(harness.waitUntilExit()).resolves.toBeUndefined();
	});

	// The modified `tui-shell` spec's quit scenarios name only `q` and Ctrl-C;
	// Escape's documented job is leaving a text-entry mode (see "input modes"
	// below), not quitting normal mode, so this supersedes the pre-mode
	// behaviour rather than merely predating it.
	test('Escape does not exit the app in normal mode', async () => {
		const harness = await renderApp();
		let exited = false;
		void harness.waitUntilExit().then(() => {
			exited = true;
		});

		harness.write(keys.escape);
		await harness.waitUntilRenderFlush();

		expect(exited).toBe(false);
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

describe('resizing while a mode is active', () => {
	test('a candidate list is re-windowed to fit after the terminal shrinks', async () => {
		const harness = await renderApp({columns: 100, rows: 30});

		harness.write('l');
		await harness.waitUntilRenderFlush();
		await type(harness, 'Town');

		respondWithJson({
			results: Array.from({length: 12}, (_, index) => ({
				name: `Town${index}`,
				admin1: `Region${index}`,
				latitude: 10 + index,
				longitude: 20 + index,
			})),
		});
		await press(harness, keys.enter);

		const rowCount = () =>
			harness.lastFrame().split('\n').filter(line => line.includes('Region')).length;
		const before = rowCount();
		expect(before).toBeGreaterThan(1);

		harness.resize({columns: 100, rows: 12});
		await harness.waitUntilRenderFlush();

		const after = rowCount();
		expect(after).toBeLessThan(before);
		// The highlighted row (still the first candidate — nothing moved the
		// selection) must stay among what's shown after the shrink.
		expect(harness.lastFrame()).toContain('▸ Town0, Region0');
		expect(dimensions(harness.lastFrame()).rows).toBe(12);
	});
});

describe('the weather panel is mounted', () => {
	test('the panel renders inside the shell', async () => {
		const harness = await renderApp();

		expect(harness.lastFrame()).toContain('WEATHER');
		expect(harness.lastFrame()).toContain('71.4°F');
	});
});

describe('input modes', () => {
	test('l enters location mode and shows the location picker', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();

		expect(harness.lastFrame()).toContain('SET LOCATION');
		expect(harness.lastFrame()).toContain('City:');
	});

	test('q and r are inert while location mode is active', async () => {
		const harness = await renderApp();
		let exited = false;
		void harness.waitUntilExit().then(() => {
			exited = true;
		});

		harness.write('l');
		await harness.waitUntilRenderFlush();
		expect(fetchCallCount()).toBe(1);

		harness.write('q');
		await harness.waitUntilRenderFlush();
		harness.write('r');
		await harness.waitUntilRenderFlush();

		expect(exited).toBe(false);
		expect(fetchCallCount()).toBe(1);
	});

	test('Escape leaves location mode without quitting', async () => {
		const harness = await renderApp();
		let exited = false;
		void harness.waitUntilExit().then(() => {
			exited = true;
		});

		harness.write('l');
		await harness.waitUntilRenderFlush();

		await pressEscape(harness);

		expect(exited).toBe(false);
		expect(harness.lastFrame()).toContain('WEATHER');
	});

	test('normal-mode bindings resume once location mode is left', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();
		await pressEscape(harness);

		respondWithJson(currentWeather(58.2, 61));
		harness.write('r');
		await harness.waitUntilRenderFlush();
		expect(fetchCallCount()).toBe(2);
		expect(harness.lastFrame()).toContain('58.2°F');

		harness.write('q');
		await expect(harness.waitUntilExit()).resolves.toBeUndefined();
	});

	test('Ctrl-C quits from location mode', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();

		harness.write(keys.ctrlC);

		await expect(harness.waitUntilExit()).resolves.toBeUndefined();
	});
});

describe('the location picker, wired into the app', () => {
	test('confirming a candidate persists it, makes it active so weather refetches, and leaves the mode', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();
		await type(harness, 'Springfield');

		respondWithJson({results: [springfieldResult()]});
		await press(harness, keys.enter);
		expect(harness.lastFrame()).toContain('Springfield, Missouri');

		respondWithJson(currentWeather(58.2, 61));
		await press(harness, keys.enter);
		// Confirming awaits the config write before leaving the mode, so the
		// dismissal is not necessarily visible in the very next flush.
		await waitForFrame(harness, frame => !frame.includes('SET LOCATION'));

		expect(harness.lastFrame()).not.toContain('SET LOCATION');
		expect(harness.lastFrame()).toContain(
			formatLocation({
				name: 'Springfield',
				admin1: 'Missouri',
				country: 'United States',
				latitude: 37.2153,
				longitude: -93.2982,
			}),
		);
		expect(harness.lastFrame()).toContain('58.2°F');

		await expect(readConfig()).resolves.toEqual({
			status: 'ok',
			location: {
				name: 'Springfield',
				admin1: 'Missouri',
				country: 'United States',
				timezone: 'America/Chicago',
				latitude: 37.2153,
				longitude: -93.2982,
			},
		});
	});

	test('a persisted location survives a fresh mount', async () => {
		const first = await renderApp();
		first.write('l');
		await first.waitUntilRenderFlush();
		await type(first, 'Springfield');
		respondWithJson({results: [springfieldResult()]});
		await press(first, keys.enter);
		respondWithJson(currentWeather());
		await press(first, keys.enter);
		await waitForFrame(first, frame => !frame.includes('SET LOCATION'));
		first.unmount();

		respondWithJson(currentWeather());
		const second = render(<App />, {columns: 100, rows: 30});
		await waitForFrame(second, frame => frame.includes('Springfield, Missouri'));
	});

	test('cancelling with Escape leaves the active location and the stored config unchanged', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();
		await type(harness, 'Springfield');
		respondWithJson({results: [springfieldResult()]});
		await press(harness, keys.enter);
		expect(harness.lastFrame()).toContain('Springfield, Missouri');

		await pressEscape(harness);

		expect(harness.lastFrame()).toContain(formatLocation(DEFAULT_LOCATION));
		await expect(readConfig()).resolves.toEqual({status: 'absent'});
	});

	test('an unreadable config warns at startup on the default location, and a successful selection clears it', async () => {
		await writeMalformedConfig();

		const harness = await renderApp();
		await waitForFrame(harness, frame =>
			frame.includes('Could not read saved location'),
		);
		expect(harness.lastFrame()).toContain(formatLocation(DEFAULT_LOCATION));

		harness.write('l');
		await harness.waitUntilRenderFlush();
		await type(harness, 'Springfield');
		respondWithJson({results: [springfieldResult()]});
		await press(harness, keys.enter);
		respondWithJson(currentWeather());
		await press(harness, keys.enter);
		await waitForFrame(harness, frame => !frame.includes('SET LOCATION'));

		expect(harness.lastFrame()).not.toContain('Could not read saved location');
	});

	test('a write failure keeps the pick active for the session, warns, and the app stays usable', async () => {
		await breakNextConfigWrite();

		const harness = await renderApp();
		harness.write('l');
		await harness.waitUntilRenderFlush();
		await type(harness, 'Springfield');
		respondWithJson({results: [springfieldResult()]});
		await press(harness, keys.enter);
		respondWithJson(currentWeather());
		await press(harness, keys.enter);

		await waitForFrame(harness, frame => frame.includes('Could not save location'));
		expect(harness.lastFrame()).toContain('Springfield, Missouri');

		respondWithJson(currentWeather(50, 0));
		harness.write('r');
		await harness.waitUntilRenderFlush();
		expect(harness.lastFrame()).toContain('50°F');
	});

	test('quitting while a search is in flight aborts it rather than crashing', async () => {
		const harness = await renderApp();

		harness.write('l');
		await harness.waitUntilRenderFlush();
		await type(harness, 'Springfield');

		const arrived = respondWhenTold();
		harness.write(keys.enter);
		const request = await arrived;

		harness.write(keys.ctrlC);

		await expect(harness.waitUntilExit()).resolves.toBeUndefined();
		expect(request.signal?.aborted).toBe(true);
	});
});

describe('the notice area', () => {
	test('a posted notice renders on its own line in normal mode', async () => {
		const {harness, controller} = await renderAppWithNotice();

		controller.post('Config file is corrupt — using defaults');
		await harness.waitUntilRenderFlush();

		expect(harness.lastFrame()).toContain(
			'Config file is corrupt — using defaults',
		);
	});

	test('a posted notice renders in location mode too', async () => {
		const {harness, controller} = await renderAppWithNotice();

		harness.write('l');
		controller.post('Could not save location — this session only');
		await harness.waitUntilRenderFlush();

		expect(harness.lastFrame()).toContain('SET LOCATION');
		expect(harness.lastFrame()).toContain(
			'Could not save location — this session only',
		);
	});

	// The root layout is locked to the terminal's full height (see "viewport
	// sizing" above), so the *total* frame here is always exactly `rows` lines
	// whether or not a notice is showing — Ink pads unused space either way.
	// That a present notice costs the content area exactly one row, and an
	// absent one costs it none, is proven directly against `NoticeArea` in
	// `src/shell/notice.test.tsx`, which isn't bound to a fixed-height root.
	test('a cleared notice removes the line the posted one added', async () => {
		const {harness, controller} = await renderAppWithNotice();
		const bareFrame = harness.lastFrame();

		controller.post('a notice');
		await harness.waitUntilRenderFlush();
		expect(harness.lastFrame()).toContain('a notice');

		controller.clear();
		await harness.waitUntilRenderFlush();
		expect(harness.lastFrame()).not.toContain('a notice');
		expect(dimensions(harness.lastFrame()).rows).toBe(
			dimensions(bareFrame).rows,
		);
	});

	test('a second notice replaces the first', async () => {
		const {harness, controller} = await renderAppWithNotice();

		controller.post('first notice');
		await harness.waitUntilRenderFlush();
		controller.post('second notice');
		await harness.waitUntilRenderFlush();

		expect(harness.lastFrame()).toContain('second notice');
		expect(harness.lastFrame()).not.toContain('first notice');
	});

	test('a notice is not removed by any timer', async () => {
		const {harness, controller} = await renderAppWithNotice();

		controller.post('still here later');
		await harness.waitUntilRenderFlush();

		await new Promise(resolve => setTimeout(resolve, 50));
		await harness.waitUntilRenderFlush();

		expect(harness.lastFrame()).toContain('still here later');
	});
});
