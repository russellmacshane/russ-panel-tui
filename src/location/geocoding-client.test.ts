import {describe, expect, test} from 'vitest';
import {
	fetchCallCount,
	fetchCalls,
	respondWhenTold,
	respondWithBody,
	respondWithError,
	respondWithJson,
	respondWithStatus,
} from '../../test/support/fetch-stub.js';
import {searchLocations, sortCandidates} from './geocoding-client.js';
import type {Candidate} from './types.js';

/** A well-formed raw Open-Meteo geocoding result, with the fields decision 9
 * says to discard included so tests can prove they are actually dropped. */
function rawResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 5375480,
		name: 'San Antonio',
		latitude: 29.42412,
		longitude: -98.49363,
		elevation: 198,
		feature_code: 'PPLA2',
		country_code: 'US',
		admin1_id: 4736286,
		admin2_id: 4726206,
		admin3_id: 4726205,
		admin4_id: 0,
		timezone: 'America/Chicago',
		population: 1526656,
		postcodes: ['78201', '78202', '78203'],
		country_id: 6252001,
		country: 'United States',
		admin1: 'Texas',
		admin2: 'Bexar',
		...overrides,
	};
}

describe('the request', () => {
	test('carries the endpoint and the documented parameters', async () => {
		respondWithJson({results: [rawResult()]});

		await searchLocations('San Antonio');

		const url = new URL(fetchCalls()[0]!);
		expect(url.origin + url.pathname).toBe(
			'https://geocoding-api.open-meteo.com/v1/search',
		);
		expect(url.searchParams.get('name')).toBe('San Antonio');
		expect(url.searchParams.get('count')).toBe('10');
		expect(url.searchParams.get('language')).toBe('en');
		expect(url.searchParams.get('format')).toBe('json');
	});

	test('carries no key or credential', async () => {
		respondWithJson({results: []});

		await searchLocations('San Antonio');

		const url = new URL(fetchCalls()[0]!);
		for (const name of url.searchParams.keys()) {
			expect(name).not.toMatch(/key|token|secret|auth|apikey|password/i);
		}
	});
});

describe('the short-query guard', () => {
	test('a query shorter than two characters is rejected without a request', async () => {
		const result = await searchLocations('a');

		expect(result).toEqual({status: 'query-too-short'});
		expect(fetchCallCount()).toBe(0);
	});

	test('an empty query is rejected without a request', async () => {
		const result = await searchLocations('');

		expect(result).toEqual({status: 'query-too-short'});
		expect(fetchCallCount()).toBe(0);
	});

	test('a two-character query is not rejected', async () => {
		respondWithJson({results: []});

		const result = await searchLocations('NY');

		expect(result.status).toBe('ok');
		expect(fetchCallCount()).toBe(1);
	});
});

describe('projection to Candidate', () => {
	test('a well-formed result is projected to exactly the Candidate fields', async () => {
		respondWithJson({results: [rawResult()]});

		const result = await searchLocations('San Antonio');

		expect(result).toEqual({
			status: 'ok',
			candidates: [
				{
					name: 'San Antonio',
					latitude: 29.42412,
					longitude: -98.49363,
					admin1: 'Texas',
					admin2: 'Bexar',
					country: 'United States',
					timezone: 'America/Chicago',
					population: 1526656,
				},
			],
		});
	});

	test('a result with no optional fields projects to just name and coordinates', async () => {
		respondWithJson({
			results: [{id: 1880252, name: 'Singapore', latitude: 1.28967, longitude: 103.85007}],
		});

		const result = await searchLocations('Singapore');

		expect(result).toEqual({
			status: 'ok',
			candidates: [{name: 'Singapore', latitude: 1.28967, longitude: 103.85007}],
		});
	});
});

// A search that matches nothing is a *successful* search with zero rows, not
// an error — the live API returns exactly this shape (design decision 7).
describe('no matching places', () => {
	test('an absent `results` key is a successful search with zero candidates', async () => {
		respondWithJson({generationtime_ms: 0.569582});

		const result = await searchLocations('Zzzqqxyzzy');

		expect(result).toEqual({status: 'ok', candidates: []});
	});

	test('an explicit empty `results` array is also zero candidates', async () => {
		respondWithJson({results: []});

		const result = await searchLocations('Zzzqqxyzzy');

		expect(result).toEqual({status: 'ok', candidates: []});
	});
});

// Unlike the absent-`results`-key case above, once results are present the
// parser stays as strict as the weather client: one malformed row fails the
// whole search rather than silently dropping it.
describe('defensive parsing', () => {
	test('a result missing `name` makes the whole search fail', async () => {
		const malformed = rawResult();
		delete malformed['name'];
		respondWithJson({results: [rawResult(), malformed]});

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned a candidate missing a name or coordinates',
		);
	});

	test('a result missing `latitude` makes the whole search fail', async () => {
		const malformed = rawResult();
		delete malformed['latitude'];
		respondWithJson({results: [rawResult(), malformed]});

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned a candidate missing a name or coordinates',
		);
	});

	test('a result missing `longitude` makes the whole search fail', async () => {
		const malformed = rawResult();
		delete malformed['longitude'];
		respondWithJson({results: [rawResult(), malformed]});

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned a candidate missing a name or coordinates',
		);
	});

	test('a non-string `admin1` makes the whole search fail', async () => {
		respondWithJson({results: [rawResult({admin1: 42})]});

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned a candidate with a malformed field',
		);
	});

	test('a `results` field that is not a list fails the search', async () => {
		respondWithJson({results: 'nope'});

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned a `results` field that is not a list',
		);
	});
});

describe('transport failures', () => {
	test('a non-ok status throws with the status and status text', async () => {
		respondWithStatus(503, 'Service Unavailable');

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned 503 Service Unavailable',
		);
	});

	test('a body that is not valid JSON throws', async () => {
		respondWithBody('<html>gateway timeout</html>');

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'Open-Meteo returned a response that is not valid JSON',
		);
	});

	test('a rejected request propagates', async () => {
		respondWithError('fetch failed', 'TypeError');

		await expect(searchLocations('San Antonio')).rejects.toThrow('fetch failed');
	});

	// The client passes the same timeout-combined signal `fetchCurrentWeather`
	// does; a real 8s wait is not exercised here (this repo has no injectable
	// clock), but a `TimeoutError`-named rejection — what `AbortSignal.timeout`
	// produces on the real path — must propagate just like any other failure.
	test('a timeout-shaped rejection propagates', async () => {
		respondWithError('The operation timed out', 'TimeoutError');

		await expect(searchLocations('San Antonio')).rejects.toThrow(
			'The operation timed out',
		);
	});
});

describe('abort', () => {
	test('a caller-supplied signal is combined with the timeout and aborts the request', async () => {
		const pending = respondWhenTold();
		const controller = new AbortController();

		const promise = searchLocations('San Antonio', controller.signal);
		const request = await pending;

		expect(request.signal?.aborted).toBe(false);
		controller.abort();
		expect(request.signal?.aborted).toBe(true);

		request.reject('This operation was aborted', 'AbortError');
		await expect(promise).rejects.toThrow('This operation was aborted');
	});
});

describe('candidate ordering', () => {
	test('exact matches sort ahead of fuzzy matches, then by population descending, live-API San Antonio fixture', async () => {
		const sanAntonioTx = rawResult(); // exact, pop 1,526,656
		const sanAntonioCl = rawResult({
			name: 'San Antonio',
			admin1: 'Valparaíso',
			admin2: undefined,
			country: 'Chile',
			timezone: 'America/Santiago',
			population: 87675,
		});
		delete sanAntonioCl['admin2'];
		const sanAntonioDePale = rawResult({
			name: 'San Antonio de Palé',
			admin1: 'Annobón Province',
			country: 'Equatorial Guinea',
			timezone: 'Africa/Malabo',
			population: 4433,
		});
		delete sanAntonioDePale['admin2'];
		const santoAntonio = rawResult({
			name: 'Santo António',
			admin1: 'Príncipe',
			country: 'Sao Tome and Principe',
			timezone: 'Africa/Sao_Tome',
			population: 1156,
		});
		delete santoAntonio['admin2'];
		const sanAntonioSuchitepequez = rawResult({
			name: 'San Antonio Suchitepéquez',
			admin1: 'Suchitepéquez',
			country: 'Guatemala',
			timezone: 'America/Guatemala',
			population: 13666,
		});
		delete sanAntonioSuchitepequez['admin2'];

		respondWithJson({
			// API relevance order, deliberately not the expected sorted order.
			results: [
				sanAntonioTx,
				sanAntonioDePale,
				santoAntonio,
				sanAntonioCl,
				sanAntonioSuchitepequez,
			],
		});

		const result = await searchLocations('San Antonio');
		if (result.status !== 'ok') {
			throw new Error('expected ok');
		}

		expect(result.candidates.map(c => `${c.name}, ${c.country}`)).toEqual([
			'San Antonio, United States',
			'San Antonio, Chile',
			'San Antonio Suchitepéquez, Guatemala',
			'San Antonio de Palé, Equatorial Guinea',
			'Santo António, Sao Tome and Principe',
		]);
	});

	test('Springfield fixture: all exact matches, sorted by population descending', async () => {
		const mo = rawResult({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Greene',
			country: 'United States',
			population: 170188,
		});
		const il = rawResult({
			name: 'Springfield',
			admin1: 'Illinois',
			admin2: 'Sangamon',
			country: 'United States',
			population: 114394,
		});
		const ma = rawResult({
			name: 'Springfield',
			admin1: 'Massachusetts',
			admin2: 'Hampden',
			country: 'United States',
			population: 154341,
		});
		const oh = rawResult({
			name: 'Springfield',
			admin1: 'Ohio',
			admin2: 'Clark',
			country: 'United States',
			population: 59680,
		});
		const tn = rawResult({
			name: 'Springfield',
			admin1: 'Tennessee',
			admin2: 'Robertson',
			country: 'United States',
			population: 16808,
		});

		respondWithJson({results: [mo, il, ma, oh, tn]});

		const result = await searchLocations('Springfield');
		if (result.status !== 'ok') {
			throw new Error('expected ok');
		}

		expect(result.candidates.map(c => c.admin1)).toEqual([
			'Missouri',
			'Massachusetts',
			'Illinois',
			'Ohio',
			'Tennessee',
		]);
	});
});

// `sortCandidates` is exported specifically so ordering is testable in
// isolation, without a fetch stub in the way.
describe('sortCandidates (pure, no fetch)', () => {
	function candidate(overrides: Partial<Candidate> & {name: string}): Candidate {
		return {latitude: 0, longitude: 0, ...overrides};
	}

	test('an exact match outranks a fuzzy match regardless of population', () => {
		const exactSmall = candidate({name: 'Springfield', population: 10});
		const fuzzyLarge = candidate({name: 'Springfield Township', population: 1_000_000});

		expect(sortCandidates([fuzzyLarge, exactSmall], 'Springfield')).toEqual([
			exactSmall,
			fuzzyLarge,
		]);
	});

	test('matching is case-insensitive and trims whitespace', () => {
		const exact = candidate({name: 'san antonio', population: 5});
		const fuzzy = candidate({name: 'San Antonio de Palé', population: 1_000_000});

		expect(sortCandidates([fuzzy, exact], '  San Antonio  ')).toEqual([exact, fuzzy]);
	});

	test('a missing population sorts behind any known population, within the same group', () => {
		const withPopulation = candidate({name: 'Somewhere Fuzzy Match', population: 1});
		const withoutPopulation = candidate({name: 'Somewhere Else Fuzzy Match'});

		expect(sortCandidates([withoutPopulation, withPopulation], 'Somewhere')).toEqual([
			withPopulation,
			withoutPopulation,
		]);
	});

	test('does not mutate the input array', () => {
		const input = [candidate({name: 'B', population: 1}), candidate({name: 'A', population: 2})];
		const copy = [...input];

		sortCandidates(input, 'query');

		expect(input).toEqual(copy);
	});
});
