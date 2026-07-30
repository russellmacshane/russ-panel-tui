/**
 * The filesystem-isolation analogue of `fetch-stub.ts`: instead of a fake
 * network, this points `XDG_CONFIG_HOME` at a disposable directory so
 * `src/location/config-store.ts`'s real path resolution — exercised through
 * its zero-argument overloads, exactly as production code calls it — can
 * never read or write the developer's actual `~/.config`.
 *
 * The directory is created once, at module load (top-level await), which is
 * why this must be registered in `vitest.config.ts`'s `setupFiles` ahead of
 * anything that might resolve a config path at import time. Vitest isolates
 * modules per test file by default, so "once" here means once per test file
 * — matching the per-file lifetime of the fetch stub's own module state.
 */

import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, afterEach} from 'vitest';
import {resolveConfigPath} from '../../src/location/config-store.js';

const configDir = await fs.mkdtemp(join(tmpdir(), 'russ-panel-tui-config-'));
process.env['XDG_CONFIG_HOME'] = configDir;

/** Set only while `breakNextConfigWrite` is in effect, so `afterEach` can restore it. */
let lockedDir: string | undefined;

afterEach(async () => {
	if (lockedDir) {
		await fs.chmod(lockedDir, 0o755);
		lockedDir = undefined;
	}

	// Only the file, not `configDir` itself — that is this file's own
	// suite-lifetime directory, torn down once in `afterAll` below.
	await fs.rm(resolveConfigPath(), {force: true});
});

afterAll(async () => {
	await fs.rm(configDir, {recursive: true, force: true});
});

/** The disposable directory standing in for `~/.config` in this test run. */
export function configHomeDir(): string {
	return configDir;
}

/**
 * Writes bytes that are not a valid config file directly to the real
 * resolved config path, so a test can exercise `readConfig`/`loadActiveLocation`'s
 * `invalid` handling end-to-end rather than only through config-store's own
 * explicit-path tests.
 */
export async function writeMalformedConfig(contents = '{not json'): Promise<void> {
	const path = resolveConfigPath();
	await fs.mkdir(dirname(path), {recursive: true});
	await fs.writeFile(path, contents, 'utf8');
}

/**
 * Makes subsequent config writes fail: strips write permission from the
 * `russ-panel-tui` directory (creating it first if it does not exist yet), so
 * `writeConfig`'s `fs.writeFile` cannot create a file inside it and fails with
 * `EACCES`. POSIX-only — this dev machine and CI are both Linux, which is all
 * this needs to cover. Restored automatically in `afterEach` above, so a test
 * never has to remember to chmod it back.
 */
export async function breakNextConfigWrite(): Promise<void> {
	const dir = dirname(resolveConfigPath());
	await fs.mkdir(dir, {recursive: true});
	await fs.chmod(dir, 0o444);
	lockedDir = dir;
}
