import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {DEFAULT_LOCATION} from '../config.js';
import {
	loadActiveLocation,
	readConfig,
	selectLocation,
	writeConfig,
} from './config-store.js';
import type {Location} from './types.js';

const SPRINGFIELD: Location = {
	name: 'Springfield',
	admin1: 'Missouri',
	country: 'United States',
	timezone: 'America/Chicago',
	latitude: 37.21533,
	longitude: -93.29824,
};

let dir: string;
let path: string;

// Real file I/O under a disposable per-test directory — no XDG_CONFIG_HOME
// manipulation here, since env-based isolation across the whole suite is
// Phase 3's job. `path` is passed explicitly as the seam these functions
// accept for exactly this purpose.
beforeEach(async () => {
	dir = await fs.mkdtemp(join(tmpdir(), 'russ-panel-tui-config-store-'));
	path = join(dir, 'russ-panel-tui', 'config.json');
});

afterEach(async () => {
	await fs.rm(dir, {recursive: true, force: true});
});

describe('readConfig', () => {
	test('reports absent when no file exists', async () => {
		await expect(readConfig(path)).resolves.toEqual({status: 'absent'});
	});

	test('reads back a valid config', async () => {
		await writeConfig(SPRINGFIELD, path);

		await expect(readConfig(path)).resolves.toEqual({
			status: 'ok',
			location: SPRINGFIELD,
		});
	});

	test('reports invalid for malformed JSON', async () => {
		await fs.mkdir(dirname(path), {recursive: true});
		await fs.writeFile(path, '{not json', 'utf8');

		await expect(readConfig(path)).resolves.toEqual({status: 'invalid'});
	});

	test('reports invalid when the location is missing required fields', async () => {
		await fs.mkdir(dirname(path), {recursive: true});
		await fs.writeFile(
			path,
			JSON.stringify({location: {name: 'Nowhere'}}),
			'utf8',
		);

		await expect(readConfig(path)).resolves.toEqual({status: 'invalid'});
	});

	test('reports invalid when the location key is absent entirely', async () => {
		await fs.mkdir(dirname(path), {recursive: true});
		await fs.writeFile(path, JSON.stringify({}), 'utf8');

		await expect(readConfig(path)).resolves.toEqual({status: 'invalid'});
	});
});

describe('writeConfig', () => {
	test('creates parent directories and writes the location under a `location` key', async () => {
		const wrote = await writeConfig(SPRINGFIELD, path);
		expect(wrote).toBe(true);

		const raw = await fs.readFile(path, 'utf8');
		expect(JSON.parse(raw)).toEqual({location: SPRINGFIELD});
	});

	test('projects down to exactly the six Location fields', async () => {
		await writeConfig(
			{...SPRINGFIELD, ...({extra: 'should not survive'} as object)},
			path,
		);

		const raw = await fs.readFile(path, 'utf8');
		expect(Object.keys(JSON.parse(raw).location).sort()).toEqual(
			['admin1', 'country', 'latitude', 'longitude', 'name', 'timezone'].sort(),
		);
	});

	test('omits optional fields that are absent rather than writing them as null', async () => {
		const minimal: Location = {
			name: 'Singapore',
			latitude: 1.28967,
			longitude: 103.85007,
		};

		await writeConfig(minimal, path);

		const raw = await fs.readFile(path, 'utf8');
		expect(JSON.parse(raw)).toEqual({location: minimal});
	});

	test('returns false, and leaves nothing behind, when the parent cannot be created', async () => {
		// A regular file sits where a directory is needed, so `mkdir` fails.
		const blockedDir = join(dir, 'blocked');
		await fs.writeFile(blockedDir, 'not a directory', 'utf8');
		const blockedPath = join(blockedDir, 'config.json');

		const wrote = await writeConfig(SPRINGFIELD, blockedPath);

		expect(wrote).toBe(false);
	});
});

describe('loadActiveLocation', () => {
	test('falls back to the default with no warning when absent', async () => {
		await expect(loadActiveLocation(path)).resolves.toEqual({
			location: DEFAULT_LOCATION,
		});
	});

	test('does not write anything to disk merely from falling back', async () => {
		await loadActiveLocation(path);

		await expect(fs.access(path)).rejects.toThrow();
	});

	test('returns the saved location, taking precedence over the default', async () => {
		await writeConfig(SPRINGFIELD, path);

		await expect(loadActiveLocation(path)).resolves.toEqual({
			location: SPRINGFIELD,
		});
	});

	test('falls back to the default and warns when the file is unreadable', async () => {
		await fs.mkdir(dirname(path), {recursive: true});
		await fs.writeFile(path, '{not json', 'utf8');

		const result = await loadActiveLocation(path);

		expect(result.location).toEqual(DEFAULT_LOCATION);
		expect(result.warning).toBeTruthy();
	});

	test('leaves a malformed file untouched on disk', async () => {
		await fs.mkdir(dirname(path), {recursive: true});
		await fs.writeFile(path, '{not json', 'utf8');

		await loadActiveLocation(path);

		await expect(fs.readFile(path, 'utf8')).resolves.toBe('{not json');
	});
});

describe('selectLocation', () => {
	test('persists the location with no warning on success', async () => {
		const result = await selectLocation(SPRINGFIELD, path);

		expect(result.warning).toBeUndefined();
		await expect(readConfig(path)).resolves.toEqual({
			status: 'ok',
			location: SPRINGFIELD,
		});
	});

	test('warns, without throwing, when the write fails', async () => {
		const blockedDir = join(dir, 'blocked');
		await fs.writeFile(blockedDir, 'not a directory', 'utf8');
		const blockedPath = join(blockedDir, 'config.json');

		const result = await selectLocation(SPRINGFIELD, blockedPath);

		expect(result.warning).toBeTruthy();
	});
});
