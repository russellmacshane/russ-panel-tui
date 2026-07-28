import {describe, expect, test} from 'vitest';
import {
	fetchCalls,
	respondWithBody,
	respondWithError,
	respondWithJson,
	respondWithStatus,
} from '../../test/support/fetch-stub.js';
import {LOCATION, TEMPERATURE_SYMBOL, TEMPERATURE_UNIT} from '../config.js';
import {fetchCurrentWeather} from './client.js';

/** A minimal well-formed Open-Meteo payload. */
function payload(overrides: Record<string, unknown> = {}) {
	return {
		current: {temperature_2m: 71.4, weather_code: 3},
		current_units: {temperature_2m: '°F'},
		...overrides,
	};
}

describe('the request', () => {
	test('carries the configured latitude, longitude, and temperature unit', async () => {
		respondWithJson(payload());

		await fetchCurrentWeather();

		const url = new URL(fetchCalls()[0]!);
		expect(url.origin + url.pathname).toBe(
			'https://api.open-meteo.com/v1/forecast',
		);
		expect(url.searchParams.get('latitude')).toBe(String(LOCATION.latitude));
		expect(url.searchParams.get('longitude')).toBe(String(LOCATION.longitude));
		expect(url.searchParams.get('temperature_unit')).toBe(TEMPERATURE_UNIT);
		expect(url.searchParams.get('current')).toBe(
			'temperature_2m,weather_code',
		);
	});

	// Open-Meteo needs no credentials. This is as far as a test can go towards
	// the "no credentials required" scenario: it proves we send none.
	test('carries no key or credential', async () => {
		respondWithJson(payload());

		await fetchCurrentWeather();

		const url = new URL(fetchCalls()[0]!);
		const names = [...url.searchParams.keys()];
		expect(names).toEqual([
			'latitude',
			'longitude',
			'current',
			'temperature_unit',
		]);
		for (const name of names) {
			expect(name).not.toMatch(/key|token|secret|auth|apikey|password/i);
		}

		expect(url.username).toBe('');
		expect(url.password).toBe('');
	});
});

describe('transport failures', () => {
	test('a non-ok status throws with the status and status text', async () => {
		respondWithStatus(503, 'Service Unavailable');

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo returned 503 Service Unavailable',
		);
	});

	test('a body that is not valid JSON throws', async () => {
		respondWithBody('<html>gateway timeout</html>');

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo returned a response that is not valid JSON',
		);
	});

	test('a rejected request propagates', async () => {
		respondWithError('fetch failed', 'TypeError');

		await expect(fetchCurrentWeather()).rejects.toThrow('fetch failed');
	});
});

// A panel showing `undefined°` is worse than one that admits it failed, so each
// of these must throw rather than yield a partial reading.
describe('defensive parsing', () => {
	test('a missing `current` throws', async () => {
		respondWithJson({current_units: {temperature_2m: '°F'}});

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing current conditions',
		);
	});

	test('a null `current` throws', async () => {
		respondWithJson({current: null});

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing current conditions',
		);
	});

	test('a missing temperature throws', async () => {
		respondWithJson({current: {weather_code: 3}});

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing a usable temperature',
		);
	});

	test('a non-numeric temperature throws', async () => {
		respondWithJson({current: {temperature_2m: '71.4', weather_code: 3}});

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing a usable temperature',
		);
	});

	// JSON cannot carry a literal NaN, but `null` for a numeric field and an
	// out-of-range float both arrive as non-finite once parsed.
	test('a non-finite temperature throws', async () => {
		respondWithBody(
			'{"current":{"temperature_2m":1e999,"weather_code":3}}',
		);

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing a usable temperature',
		);
	});

	test('a missing weather code throws', async () => {
		respondWithJson({current: {temperature_2m: 71.4}});

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing a weather code',
		);
	});

	test('a non-numeric weather code throws', async () => {
		respondWithJson({current: {temperature_2m: 71.4, weather_code: 'rain'}});

		await expect(fetchCurrentWeather()).rejects.toThrow(
			'Open-Meteo response is missing a weather code',
		);
	});
});

describe('a successful reading', () => {
	test('reports the temperature and weather code from the response', async () => {
		respondWithJson(payload());

		const reading = await fetchCurrentWeather();

		expect(reading.temperature).toBe(71.4);
		expect(reading.weatherCode).toBe(3);
	});

	test('takes the unit symbol from `current_units` when present', async () => {
		respondWithJson(
			payload({current_units: {temperature_2m: 'degrees fahrenheit'}}),
		);

		const reading = await fetchCurrentWeather();

		expect(reading.temperatureUnit).toBe('degrees fahrenheit');
	});

	test('falls back to the configured symbol when `current_units` is absent', async () => {
		respondWithJson({current: {temperature_2m: 71.4, weather_code: 3}});

		const reading = await fetchCurrentWeather();

		expect(reading.temperatureUnit).toBe(TEMPERATURE_SYMBOL);
	});

	test('falls back when the reported unit is not a string', async () => {
		respondWithJson(payload({current_units: {temperature_2m: 12}}));

		const reading = await fetchCurrentWeather();

		expect(reading.temperatureUnit).toBe(TEMPERATURE_SYMBOL);
	});

	// Asserted as a Date, not as a formatted value — the suite must not depend
	// on the host clock, timezone, or locale.
	test('stamps the time we retrieved it', async () => {
		respondWithJson(payload());

		const reading = await fetchCurrentWeather();

		expect(reading.retrievedAt).toBeInstanceOf(Date);
		expect(Number.isNaN(reading.retrievedAt.getTime())).toBe(false);
	});

	test('a caller-supplied signal is passed to fetch', async () => {
		respondWithJson(payload());
		const controller = new AbortController();

		await expect(
			fetchCurrentWeather(controller.signal),
		).resolves.toMatchObject({temperature: 71.4});
	});
});
