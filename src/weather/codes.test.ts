import {expect, test} from 'vitest';
import {describeWeatherCode} from './codes.js';

test('a mapped code is described in words', () => {
	expect(describeWeatherCode(0)).toBe('Clear sky');
	expect(describeWeatherCode(61)).toBe('Slight rain');
	expect(describeWeatherCode(95)).toBe('Thunderstorm');
});

// An unmapped code must still leave the reading usable, so the fallback carries
// the raw number rather than swallowing it.
test('an unmapped code reports the raw WMO number', () => {
	expect(describeWeatherCode(4)).toBe('Unknown conditions (WMO code 4)');
	expect(describeWeatherCode(123)).toBe('Unknown conditions (WMO code 123)');
});
