import * as fs from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {DEFAULT_LOCATION} from '../config.js';
import type {Location} from './types.js';

/**
 * `XDG_CONFIG_HOME` when set, `~/.config` otherwise — the conventional Unix
 * config-directory resolution. Honouring the variable is correct on its own
 * merits, and it doubles as the seam that lets tests point at a disposable
 * directory without any filesystem mocking (see design decision 6).
 */
export function resolveConfigPath(): string {
	const base = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
	return join(base, 'russ-panel-tui', 'config.json');
}

/**
 * `absent` and `invalid` are kept distinct so a caller warns only for the
 * second: a first run with no file is normal, but a file that exists and
 * cannot be understood is worth telling the user about.
 */
export type ConfigReadResult =
	| {status: 'absent'}
	| {status: 'invalid'}
	| {status: 'ok'; location: Location};

/**
 * Reads and validates the stored location. Never throws: an unreadable file
 * (missing, malformed JSON, or missing required fields) is reported through
 * the return value rather than an exception, so callers can implement the
 * "fall back and warn" contract without a try/catch of their own. A read
 * failure other than "file does not exist" (e.g. `EACCES`) collapses into
 * `invalid` too — from the caller's perspective it is just as unusable.
 */
export async function readConfig(
	path: string = resolveConfigPath(),
): Promise<ConfigReadResult> {
	let raw: string;
	try {
		raw = await fs.readFile(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return {status: 'absent'};
		}

		return {status: 'invalid'};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {status: 'invalid'};
	}

	const location = parseLocation(
		(parsed as {location?: unknown} | null)?.location,
	);
	if (!location) {
		return {status: 'invalid'};
	}

	return {status: 'ok', location};
}

/** Requires only `name`/`latitude`/`longitude`; the rest stay optional. */
function parseLocation(value: unknown): Location | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}

	const {name, latitude, longitude, admin1, country, timezone} =
		value as Record<string, unknown>;

	if (
		typeof name !== 'string' ||
		typeof latitude !== 'number' ||
		!Number.isFinite(latitude) ||
		typeof longitude !== 'number' ||
		!Number.isFinite(longitude)
	) {
		return undefined;
	}

	if (
		(admin1 !== undefined && typeof admin1 !== 'string') ||
		(country !== undefined && typeof country !== 'string') ||
		(timezone !== undefined && typeof timezone !== 'string')
	) {
		return undefined;
	}

	return {
		name,
		latitude,
		longitude,
		...(admin1 !== undefined && {admin1}),
		...(country !== undefined && {country}),
		...(timezone !== undefined && {timezone}),
	};
}

/**
 * Writes exactly the six `Location` fields, nested under a `location` key so
 * a future sibling setting (`units`, say) can be added without reshaping the
 * file (design decision 6). Creates the parent directory if needed. Returns
 * `false` rather than throwing on failure — the caller's contract (task 2.6)
 * is to keep a selection active for the session and warn, not to crash.
 */
export async function writeConfig(
	location: Location,
	path: string = resolveConfigPath(),
): Promise<boolean> {
	const stored: Location = {
		name: location.name,
		latitude: location.latitude,
		longitude: location.longitude,
		...(location.admin1 !== undefined && {admin1: location.admin1}),
		...(location.country !== undefined && {country: location.country}),
		...(location.timezone !== undefined && {timezone: location.timezone}),
	};

	try {
		await fs.mkdir(dirname(path), {recursive: true});
		await fs.writeFile(
			path,
			JSON.stringify({location: stored}, null, '\t') + '\n',
			'utf8',
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * The startup-time orchestration: absent config uses `DEFAULT_LOCATION` in
 * memory with no warning and nothing written to disk (design decision 5); an
 * invalid config falls back to the default with a warning, and the existing
 * file is left untouched until the user selects a new location.
 */
export async function loadActiveLocation(
	path: string = resolveConfigPath(),
): Promise<{location: Location; warning?: string}> {
	const result = await readConfig(path);

	switch (result.status) {
		case 'ok': {
			return {location: result.location};
		}

		case 'invalid': {
			return {
				location: DEFAULT_LOCATION,
				warning: 'Could not read saved location; using the default.',
			};
		}

		case 'absent': {
			return {location: DEFAULT_LOCATION};
		}
	}
}

/**
 * Called when the user confirms a candidate (Phase 7). On a failed write the
 * selection still becomes active for the current session — only persistence
 * failed, not the selection itself — and a warning is returned for the
 * shell's notice area.
 */
export async function selectLocation(
	location: Location,
	path: string = resolveConfigPath(),
): Promise<{warning?: string}> {
	const wrote = await writeConfig(location, path);
	if (!wrote) {
		return {warning: 'Could not save location; this session only.'};
	}

	return {};
}
