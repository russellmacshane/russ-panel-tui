import {describe, expect, test} from 'vitest';
import {disambiguateCandidates, formatLocation} from './format.js';
import type {Candidate} from './types.js';

function candidate(overrides: Partial<Candidate> & {name: string}): Candidate {
	return {latitude: 0, longitude: 0, ...overrides};
}

describe('formatLocation', () => {
	test('joins name, region, and country when all are present', () => {
		expect(
			formatLocation({
				name: 'Springfield',
				admin1: 'Missouri',
				country: 'United States',
				latitude: 37.21533,
				longitude: -93.29824,
			}),
		).toBe('Springfield, Missouri, United States');
	});

	// A candidate can validly arrive with no administrative region — the
	// strict parser (task 4.4) only requires name/latitude/longitude, so
	// city-states like Singapore must never render as "Singapore, undefined".
	test('omits an absent region rather than rendering it as "undefined"', () => {
		expect(
			formatLocation({name: 'Singapore', latitude: 1.28967, longitude: 103.85007}),
		).toBe('Singapore');
	});
});

describe('disambiguateCandidates', () => {
	test('a candidate that is already unique gets the plain formatLocation label', () => {
		const singapore = candidate({name: 'Singapore'});
		const springfield = candidate({name: 'Springfield', admin1: 'Missouri', country: 'United States'});

		expect(disambiguateCandidates([singapore, springfield])).toEqual([
			'Singapore',
			'Springfield, Missouri, United States',
		]);
	});

	test('appends a differing admin2 when it distinguishes otherwise-identical rows', () => {
		const greene = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Greene County',
			country: 'United States',
		});
		const christian = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Christian County',
			country: 'United States',
		});

		expect(disambiguateCandidates([greene, christian])).toEqual([
			'Springfield, Greene County, Missouri, United States',
			'Springfield, Christian County, Missouri, United States',
		]);
	});

	test('falls back to coordinates when identically named rows share the same admin2', () => {
		const a = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Greene County',
			country: 'United States',
			latitude: 37.21533,
			longitude: -93.29824,
		});
		const b = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Greene County',
			country: 'United States',
			latitude: 37.2,
			longitude: -93.3,
		});

		expect(disambiguateCandidates([a, b])).toEqual([
			'Springfield, Missouri, United States (37.22, -93.30)',
			'Springfield, Missouri, United States (37.20, -93.30)',
		]);
	});

	test('falls back to coordinates when identically named rows both lack admin2', () => {
		const a = candidate({
			name: 'San Antonio',
			admin1: 'Valparaíso',
			country: 'Chile',
			latitude: -33.5928,
			longitude: -71.6128,
		});
		const b = candidate({
			name: 'San Antonio',
			admin1: 'Valparaíso',
			country: 'Chile',
			latitude: -33.6,
			longitude: -71.6,
		});

		expect(disambiguateCandidates([a, b])).toEqual([
			'San Antonio, Valparaíso, Chile (-33.59, -71.61)',
			'San Antonio, Valparaíso, Chile (-33.60, -71.60)',
		]);
	});

	test('a three-way collision: two share admin2, one has a unique admin2', () => {
		const unique = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Greene County',
			country: 'United States',
			latitude: 37.21533,
			longitude: -93.29824,
		});
		const sharedA = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Webster County',
			country: 'United States',
			latitude: 37.1,
			longitude: -93.1,
		});
		const sharedB = candidate({
			name: 'Springfield',
			admin1: 'Missouri',
			admin2: 'Webster County',
			country: 'United States',
			latitude: 37.15,
			longitude: -93.15,
		});

		expect(disambiguateCandidates([unique, sharedA, sharedB])).toEqual([
			'Springfield, Greene County, Missouri, United States',
			'Springfield, Missouri, United States (37.10, -93.10)',
			'Springfield, Missouri, United States (37.15, -93.15)',
		]);
	});

	test('no two rows are ever identical, even across a mix of collision types', () => {
		const candidates = [
			candidate({name: 'Springfield', admin1: 'Missouri', admin2: 'Greene County', country: 'United States'}),
			candidate({name: 'Springfield', admin1: 'Illinois', country: 'United States'}),
			candidate({name: 'Singapore'}),
			candidate({name: 'San Antonio', admin1: 'Valparaíso', country: 'Chile', latitude: 1, longitude: 1}),
			candidate({name: 'San Antonio', admin1: 'Valparaíso', country: 'Chile', latitude: 2, longitude: 2}),
		];

		const labels = disambiguateCandidates(candidates);

		expect(new Set(labels).size).toBe(labels.length);
	});
});
