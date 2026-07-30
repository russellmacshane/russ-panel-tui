import {
	REQUEST_TIMEOUT_MS,
	TEMPERATURE_SYMBOL,
	TEMPERATURE_UNIT,
} from '../config.js';
import type {Location} from '../location/types.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

export type WeatherReading = {
	temperature: number;
	temperatureUnit: string;
	weatherCode: number;
	/** When we retrieved it, not the observation time the API reports. */
	retrievedAt: Date;
};

/**
 * Fetch current conditions. Requires no API key.
 *
 * The caller's signal aborts on unmount; it is combined with a timeout so a
 * hung connection cannot strand the panel in its loading state.
 */
export async function fetchCurrentWeather(
	location: Location,
	signal?: AbortSignal,
): Promise<WeatherReading> {
	const url = new URL(ENDPOINT);
	url.searchParams.set('latitude', String(location.latitude));
	url.searchParams.set('longitude', String(location.longitude));
	url.searchParams.set('current', 'temperature_2m,weather_code');
	url.searchParams.set('temperature_unit', TEMPERATURE_UNIT);

	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	const response = await fetch(url, {
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	});

	if (!response.ok) {
		throw new Error(
			`Open-Meteo returned ${response.status} ${response.statusText}`,
		);
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new Error('Open-Meteo returned a response that is not valid JSON');
	}

	return parseReading(body);
}

/**
 * Anything unexpected becomes an error rather than a partial reading — a panel
 * showing `undefined°` is worse than one that admits it failed.
 */
function parseReading(body: unknown): WeatherReading {
	const current = (body as {current?: unknown} | null)?.current;
	if (typeof current !== 'object' || current === null) {
		throw new Error('Open-Meteo response is missing current conditions');
	}

	const {temperature_2m: temperature, weather_code: weatherCode} =
		current as Record<string, unknown>;

	if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
		throw new Error('Open-Meteo response is missing a usable temperature');
	}

	if (typeof weatherCode !== 'number') {
		throw new Error('Open-Meteo response is missing a weather code');
	}

	const units = (body as {current_units?: Record<string, unknown>} | null)
		?.current_units;
	const reportedUnit = units?.['temperature_2m'];

	return {
		temperature,
		temperatureUnit:
			typeof reportedUnit === 'string' ? reportedUnit : TEMPERATURE_SYMBOL,
		weatherCode,
		retrievedAt: new Date(),
	};
}
