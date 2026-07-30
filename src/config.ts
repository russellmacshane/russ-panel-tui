import type {Location} from './location/types.js';

export const DEFAULT_LOCATION: Location = {
	name: 'San Antonio',
	admin1: 'Texas',
	country: 'United States',
	latitude: 29.42412,
	longitude: -98.49363,
	timezone: 'America/Chicago',
};

/** Requested from the API directly rather than converted locally. */
export const TEMPERATURE_UNIT = 'fahrenheit';

/** Fallback only — the API reports the unit symbol alongside the reading. */
export const TEMPERATURE_SYMBOL = '°F';

/**
 * A hung connection must not leave an Open-Meteo request — weather or
 * geocoding — pending forever.
 */
export const REQUEST_TIMEOUT_MS = 8000;
