import {describe, expect, test} from 'vitest';
import {
	fetchCallCount,
	fetchCalls,
	respondWhenTold,
	respondWithJson,
} from '../../test/support/fetch-stub.js';
import {keys} from '../../test/support/fake-terminal.js';
import {render} from '../../test/support/render.js';
import type {Location} from './types.js';
import {LocationPicker} from './location-picker.js';

function renderPicker(
	onConfirm: (location: Location) => void = () => {},
	height = 20,
) {
	return render(<LocationPicker height={height} onConfirm={onConfirm} />, {
		columns: 100,
		rows: 30,
	});
}

/**
 * Sends each character as its own write, awaiting a flush between them. Two
 * `stdin.write()` calls issued back to back with no yield in between can
 * coalesce into a single stdin chunk before Ink ever reads it (Node stream
 * semantics, not an Ink or app bug) — harmless for plain text, since a merged
 * run of printable characters is still just text, but it would corrupt a
 * chunk that mixes text with a following Enter/arrow/backspace, so every
 * keystroke in these tests is sent and flushed on its own.
 */
async function type(harness: ReturnType<typeof renderPicker>, text: string) {
	for (const char of text) {
		harness.write(char);
		await harness.waitUntilRenderFlush();
	}
}

async function press(harness: ReturnType<typeof renderPicker>, key: string) {
	harness.write(key);
	await harness.waitUntilRenderFlush();
}

/** A well-formed raw Open-Meteo result — same shape as the geocoding client's own fixtures. */
function rawResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		name: 'Springfield',
		latitude: 37.2153,
		longitude: -93.2982,
		admin1: 'Missouri',
		admin2: 'Greene',
		country: 'United States',
		timezone: 'America/Chicago',
		population: 170188,
		...overrides,
	};
}

describe('typing', () => {
	test('appends typed characters to the field', async () => {
		const harness = renderPicker();
		await harness.waitUntilRenderFlush();

		await type(harness, 'Spr');

		expect(harness.lastFrame()).toContain('City: Spr');
		expect(fetchCallCount()).toBe(0);
	});

	test('backspace removes the last character, including a held-key run delivered in one chunk', async () => {
		const harness = renderPicker();
		await type(harness, 'Springfield');

		harness.write(keys.backspace + keys.backspace);
		await harness.waitUntilRenderFlush();

		// Both events must be applied — a run of two, not a run reduced to one
		// by a stale, non-functional state update.
		expect(harness.lastFrame()).toContain('City: Springfie');
		expect(harness.lastFrame()).not.toContain('City: Springfiel');
	});

	test('submitting a query shorter than two characters issues no request and tells the user', async () => {
		const harness = renderPicker();
		await type(harness, 'a');
		await press(harness, keys.enter);

		expect(fetchCallCount()).toBe(0);
		expect(harness.lastFrame()).toContain('at least');
	});

	test('an empty query on Enter issues no request', async () => {
		const harness = renderPicker();
		await press(harness, keys.enter);

		expect(fetchCallCount()).toBe(0);
	});
});

describe('searching', () => {
	test('Enter issues exactly one request and shows a searching indicator', async () => {
		const arrived = respondWhenTold();
		const harness = renderPicker();
		await type(harness, 'Springfield');
		harness.write(keys.enter);

		const request = await arrived;
		await harness.waitUntilRenderFlush();

		expect(fetchCallCount()).toBe(1);
		expect(harness.lastFrame()).toContain('Searching');

		request.resolveJson({results: []});
	});

	test('typing issues no request until Enter is pressed', async () => {
		const harness = renderPicker();
		await type(harness, 'Springfield');

		expect(fetchCallCount()).toBe(0);
	});
});

describe('results', () => {
	test('candidates are rendered disambiguated, most likely match first, highlighted marker on the first row', async () => {
		respondWithJson({
			results: [
				rawResult({admin1: 'Illinois', admin2: 'Sangamon', population: 114394}),
				rawResult(),
			],
		});
		const harness = renderPicker();
		await type(harness, 'Springfield');
		await press(harness, keys.enter);

		const frame = harness.lastFrame();
		expect(frame).toContain('Springfield, Missouri');
		expect(frame).toContain('Springfield, Illinois');
		expect(frame).toContain('▸');
	});

	test('arrow keys move the highlighted row without running past either end', async () => {
		respondWithJson({
			results: [
				rawResult({name: 'A', admin1: 'One'}),
				rawResult({name: 'B', admin1: 'Two'}),
				rawResult({name: 'C', admin1: 'Three'}),
			],
		});
		const harness = renderPicker();
		await type(harness, 'AA');
		await press(harness, keys.enter);

		// Up from the first row does not move past the top.
		await press(harness, keys.up);
		let selectedLine = harness
			.lastFrame()
			.split('\n')
			.find(line => line.includes('▸'));
		expect(selectedLine).toContain('A, One');

		await press(harness, keys.down);
		await press(harness, keys.down);
		selectedLine = harness
			.lastFrame()
			.split('\n')
			.find(line => line.includes('▸'));
		expect(selectedLine).toContain('C, Three');

		// Down from the last row does not move past the bottom.
		await press(harness, keys.down);
		selectedLine = harness
			.lastFrame()
			.split('\n')
			.find(line => line.includes('▸'));
		expect(selectedLine).toContain('C, Three');
	});

	test('holding an arrow key (several events in one chunk) still moves one row at a time', async () => {
		respondWithJson({
			results: [
				rawResult({name: 'A', admin1: 'One'}),
				rawResult({name: 'B', admin1: 'Two'}),
				rawResult({name: 'C', admin1: 'Three'}),
			],
		});
		const harness = renderPicker();
		await type(harness, 'AA');
		await press(harness, keys.enter);

		harness.write(keys.down + keys.down);
		await harness.waitUntilRenderFlush();

		const selectedLine = harness
			.lastFrame()
			.split('\n')
			.find(line => line.includes('▸'));
		expect(selectedLine).toContain('C, Three');
	});

	test('Enter on the highlighted candidate confirms it, projected to a Location without admin2 or population', async () => {
		respondWithJson({results: [rawResult()]});
		let confirmed: Location | undefined;
		const harness = renderPicker(location => {
			confirmed = location;
		});
		await type(harness, 'Springfield');
		await press(harness, keys.enter);

		await press(harness, keys.enter);

		expect(confirmed).toEqual({
			name: 'Springfield',
			latitude: 37.2153,
			longitude: -93.2982,
			admin1: 'Missouri',
			country: 'United States',
			timezone: 'America/Chicago',
		});
	});

	test('editing the query after results are shown returns to typing and drops the stale results', async () => {
		respondWithJson({results: [rawResult()]});
		const harness = renderPicker();
		await type(harness, 'Springfield');
		await press(harness, keys.enter);
		expect(harness.lastFrame()).toContain('Springfield, Missouri');

		await type(harness, 'x');

		expect(harness.lastFrame()).toContain('City: Springfieldx');
		expect(harness.lastFrame()).not.toContain('Springfield, Missouri');
	});
});

// "Modal content fits the viewport" (tui-shell spec): a list longer than the
// available height must be windowed rather than overflow, and the
// highlighted row must always be among the rows shown.
describe('viewport bounding', () => {
	test('a candidate list taller than the available height is windowed, keeping the selection visible', async () => {
		respondWithJson({
			results: Array.from({length: 12}, (_, index) =>
				rawResult({name: `Town${index}`, admin1: `Region${index}`}),
			),
		});
		// height 8 - CHROME_ROWS(4) leaves room for 4 rows at a time.
		const harness = renderPicker(() => {}, 8);
		await type(harness, 'Town');
		await press(harness, keys.enter);

		const countRows = () =>
			harness.lastFrame().split('\n').filter(line => line.includes('Region')).length;

		expect(countRows()).toBeLessThanOrEqual(4);
		expect(harness.lastFrame()).toContain('Town0, Region0');

		for (let i = 0; i < 9; i++) {
			// eslint-disable-next-line no-await-in-loop
			await press(harness, keys.down);
		}

		expect(countRows()).toBeLessThanOrEqual(4);
		const selectedLine = harness
			.lastFrame()
			.split('\n')
			.find(line => line.includes('▸'));
		expect(selectedLine).toContain('Town9, Region9');
	});
});

describe('no matching places', () => {
	test('renders a message, not an error, and issues exactly one request', async () => {
		respondWithJson({results: []});
		const harness = renderPicker();
		await type(harness, 'Zzzqqxyzzy');
		await press(harness, keys.enter);

		const frame = harness.lastFrame();
		expect(frame).toContain('No places matched');
		expect(frame).not.toContain('Search failed');
		expect(fetchCallCount()).toBe(1);
	});

	test('an absent `results` key is also rendered as no matches', async () => {
		respondWithJson({generationtime_ms: 0.1});
		const harness = renderPicker();
		await type(harness, 'Zzzqqxyzzy');
		await press(harness, keys.enter);

		expect(harness.lastFrame()).toContain('No places matched');
	});

	test('editing and submitting again after no matches runs a new search', async () => {
		respondWithJson({results: []});
		const harness = renderPicker();
		await type(harness, 'Zzzqqxyzzy');
		await press(harness, keys.enter);

		respondWithJson({results: [rawResult()]});
		await type(harness, 'x');
		await press(harness, keys.enter);

		expect(harness.lastFrame()).toContain('Springfield, Missouri');
		expect(fetchCallCount()).toBe(2);
	});
});

describe('search failure', () => {
	test('a transport failure renders as an error, distinct from no matches', async () => {
		const arrived = respondWhenTold();
		const harness = renderPicker();
		await type(harness, 'Springfield');
		harness.write(keys.enter);
		const request = await arrived;

		request.reject('Open-Meteo is unreachable');
		await harness.waitUntilRenderFlush();

		const frame = harness.lastFrame();
		expect(frame).toContain('Search failed');
		expect(frame).toContain('Open-Meteo is unreachable');
		expect(frame).not.toContain('No places matched');
	});

	test('pressing Enter again after a failure retries the same query', async () => {
		const arrived = respondWhenTold();
		const harness = renderPicker();
		await type(harness, 'Springfield');
		harness.write(keys.enter);
		const first = await arrived;
		first.reject('Open-Meteo is unreachable');
		await harness.waitUntilRenderFlush();

		respondWithJson({results: [rawResult()]});
		await press(harness, keys.enter);

		expect(harness.lastFrame()).toContain('Springfield, Missouri');
		expect(fetchCalls()).toHaveLength(2);
	});
});

describe('abort', () => {
	test('unmounting while a search is in flight aborts the request', async () => {
		const arrived = respondWhenTold();
		const harness = renderPicker();
		await type(harness, 'Springfield');
		harness.write(keys.enter);
		const request = await arrived;

		expect(request.signal?.aborted).toBe(false);
		harness.unmount();
		expect(request.signal?.aborted).toBe(true);
	});
});
