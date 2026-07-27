/**
 * KNOWN LIMITATION: the location is hardcoded. Making it configurable — via a
 * flag, a config file, or an in-app setting — is deliberately deferred to a
 * later change, so that the decision is made with a real app to judge it
 * against. Until then, edit these three values to point somewhere else.
 */
export const LOCATION = {
	name: 'Lansing, MI',
	latitude: 42.7325,
	longitude: -84.5555,
} as const;

/** Requested from the API directly rather than converted locally. */
export const TEMPERATURE_UNIT = 'fahrenheit';

/** Fallback only — the API reports the unit symbol alongside the reading. */
export const TEMPERATURE_SYMBOL = '°F';

/** A hung connection must not leave the panel loading forever. */
export const REQUEST_TIMEOUT_MS = 8000;
