import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {DEFAULT_LOCATION} from '../../src/config.js';
import {
	loadActiveLocation,
	readConfig,
	selectLocation,
} from '../../src/location/config-store.js';
import type {Location} from '../../src/location/types.js';
import {breakNextConfigWrite, configHomeDir, writeMalformedConfig} from './config-fs.js';

const PORTLAND: Location = {
	name: 'Portland',
	admin1: 'Oregon',
	country: 'United States',
	timezone: 'America/Los_Angeles',
	latitude: 45.51224,
	longitude: -122.67563,
};

// First, and deliberately before any other test in this file writes
// anything, so it proves first-run behaviour rather than merely benefiting
// from `config-fs.ts`'s afterEach cleanup.
describe('first run', () => {
	test('absent config falls back to the default with no warning, called with no explicit path', async () => {
		await expect(loadActiveLocation()).resolves.toEqual({
			location: DEFAULT_LOCATION,
		});
	});
});

describe('reads and writes through the real resolved path', () => {
	test('a selection persists to a real file under the disposable directory and reads back', async () => {
		const result = await selectLocation(PORTLAND);
		expect(result.warning).toBeUndefined();

		await expect(loadActiveLocation()).resolves.toEqual({location: PORTLAND});

		// Proves the write actually landed on disk, under the disposable
		// directory rather than the developer's real ~/.config.
		const onDisk = await fs.readFile(
			join(configHomeDir(), 'russ-panel-tui', 'config.json'),
			'utf8',
		);
		expect(JSON.parse(onDisk)).toEqual({location: PORTLAND});
	});

	test('a config file left by one test is gone in the next', async () => {
		await expect(readConfig()).resolves.toEqual({status: 'absent'});
	});
});

describe('malformed config', () => {
	test('loadActiveLocation falls back to the default and warns', async () => {
		await writeMalformedConfig();

		const result = await loadActiveLocation();

		expect(result.location).toEqual(DEFAULT_LOCATION);
		expect(result.warning).toBeTruthy();
	});

	test('readConfig reports invalid through the real resolved path', async () => {
		await writeMalformedConfig('{not json');

		await expect(readConfig()).resolves.toEqual({status: 'invalid'});
	});
});

describe('write failure', () => {
	test('selectLocation warns instead of throwing when the write is blocked', async () => {
		await breakNextConfigWrite();

		const result = await selectLocation(PORTLAND);

		expect(result.warning).toBeTruthy();
	});
});
