import {REQUEST_TIMEOUT_MS} from '../config.js';
import type {Candidate} from './types.js';

const ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

/** Below this, Open-Meteo's own matching is too loose to be useful. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Distinguishes three outcomes a picker must render differently: a query
 * rejected before any request (`query-too-short`), and a completed search
 * (`ok`), which itself may carry zero candidates — a successful search with
 * no results is not an error (design decision 7). Transport and parsing
 * failures are not part of this union; they reject the promise instead, same
 * as `fetchCurrentWeather`.
 */
export type SearchLocationsResult =
	| {status: 'query-too-short'}
	| {status: 'ok'; candidates: Candidate[]};

/**
 * Search Open-Meteo's geocoding API for place names matching `query`.
 *
 * The caller's signal aborts on unmount or mode-exit; it is combined with a
 * timeout so a hung connection cannot strand a search indefinitely (same
 * pattern as `fetchCurrentWeather`, same `REQUEST_TIMEOUT_MS`).
 */
export async function searchLocations(
	query: string,
	signal?: AbortSignal,
): Promise<SearchLocationsResult> {
	if (query.length < MIN_QUERY_LENGTH) {
		return {status: 'query-too-short'};
	}

	const url = new URL(ENDPOINT);
	url.searchParams.set('name', query);
	url.searchParams.set('count', '10');
	url.searchParams.set('language', 'en');
	url.searchParams.set('format', 'json');

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

	const candidates = parseCandidates(body);
	return {status: 'ok', candidates: sortCandidates(candidates, query)};
}

/**
 * An absent `results` key is a *successful* search with zero rows, not an
 * error — the live API returns exactly this for a query that matches nothing
 * (design decision 7), rather than `{"results": []}` or an error status. This
 * is the one place this client is deliberately less strict than
 * `fetchCurrentWeather`'s parser: a typo returning zero rows is normal, not
 * exceptional.
 *
 * Once `results` is present, parsing stays strict: a single malformed row
 * fails the whole search rather than silently dropping it (task 4.4).
 */
function parseCandidates(body: unknown): Candidate[] {
	const results = (body as {results?: unknown} | null)?.results;
	if (results === undefined) {
		return [];
	}

	if (!Array.isArray(results)) {
		throw new Error('Open-Meteo returned a `results` field that is not a list');
	}

	return results.map(parseCandidate);
}

/**
 * Requires `name`/`latitude`/`longitude`; the rest — `admin1`, `admin2`,
 * `country`, `timezone`, `population` — stay optional but must be the right
 * type when present. Everything else the API returns (`postcodes`, the
 * `*_id` fields, `feature_code`, `elevation`) is discarded simply by not
 * being read (design decision 9).
 */
function parseCandidate(value: unknown): Candidate {
	if (typeof value !== 'object' || value === null) {
		throw new Error('Open-Meteo returned a malformed candidate');
	}

	const {
		name,
		latitude,
		longitude,
		admin1,
		admin2,
		country,
		timezone,
		population,
	} = value as Record<string, unknown>;

	if (
		typeof name !== 'string' ||
		typeof latitude !== 'number' ||
		!Number.isFinite(latitude) ||
		typeof longitude !== 'number' ||
		!Number.isFinite(longitude)
	) {
		throw new Error(
			'Open-Meteo returned a candidate missing a name or coordinates',
		);
	}

	if (
		(admin1 !== undefined && typeof admin1 !== 'string') ||
		(admin2 !== undefined && typeof admin2 !== 'string') ||
		(country !== undefined && typeof country !== 'string') ||
		(timezone !== undefined && typeof timezone !== 'string') ||
		(population !== undefined && typeof population !== 'number')
	) {
		throw new Error('Open-Meteo returned a candidate with a malformed field');
	}

	return {
		name,
		latitude,
		longitude,
		...(admin1 !== undefined && {admin1}),
		...(admin2 !== undefined && {admin2}),
		...(country !== undefined && {country}),
		...(timezone !== undefined && {timezone}),
		...(population !== undefined && {population}),
	};
}

/**
 * Exact name matches (case-insensitive, full-string, against the submitted
 * query) sort ahead of fuzzy matches; within each group, more populous
 * places sort first. A missing population is modelled as `-Infinity` rather
 * than `0` — it must sort behind every candidate with a known population,
 * including a genuinely tiny one, and never be mistaken for an actual zero.
 *
 * Exported and pure so ordering is testable without going through `fetch`
 * (task 4.6).
 */
export function sortCandidates(
	candidates: readonly Candidate[],
	query: string,
): Candidate[] {
	const normalizedQuery = query.trim().toLowerCase();
	const isExactMatch = (candidate: Candidate) =>
		candidate.name.trim().toLowerCase() === normalizedQuery;

	return [...candidates].sort((a, b) => {
		const aExact = isExactMatch(a);
		const bExact = isExactMatch(b);
		if (aExact !== bExact) {
			return aExact ? -1 : 1;
		}

		const aPopulation = a.population ?? -Infinity;
		const bPopulation = b.population ?? -Infinity;
		if (aPopulation === bPopulation) {
			return 0;
		}

		return aPopulation > bPopulation ? -1 : 1;
	});
}
