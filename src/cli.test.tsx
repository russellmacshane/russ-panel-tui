import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';

// Resolved from disk rather than imported, because the point is to inspect
// the compiled artifact tsc actually emits — a future compiler or config
// change that strips the directive must fail here, not go unnoticed.
const distCliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('dist/cli.js begins with a Node interpreter directive', () => {
	expect(existsSync(distCliPath)).toBe(true);
	const contents = readFileSync(distCliPath, 'utf8');
	expect(contents.startsWith('#!/usr/bin/env node\n')).toBe(true);
});

// `cli.tsx` mounts a real Ink app and registers process-level listeners as a
// side effect of being imported, so ink/App.js and terminal.js are mocked
// here to keep this a unit test of the stdin guard rather than an accidental
// end-to-end run.
const waitUntilExit = vi.fn();
const render = vi.fn(() => ({waitUntilExit}));
vi.mock('ink', () => ({render}));
vi.mock('./app.js', () => ({default: () => null}));

const enter = vi.fn();
const restore = vi.fn();
vi.mock('./terminal.js', () => ({enter, restore}));

/** Thrown by the mocked `process.exit` so a refusal unwinds the module's
 * top-level execution the same way a real `process.exit` would terminate the
 * process — without this, code after the mocked call would keep running. */
class ProcessExitSignal extends Error {
	constructor(public readonly code: unknown) {
		super(`process.exit(${String(code)})`);
	}
}

// cli.tsx registers listeners on the real `process` object as a side effect
// of a successful import (exit, signals, uncaughtException,
// unhandledRejection). Left attached, a later, unrelated test's exception
// could reach our mocked `crash()` after `process.exit` has been restored,
// which would kill the whole test run. Snapshot and prune per test instead.
const trackedEvents = [
	'exit',
	'SIGINT',
	'SIGTERM',
	'uncaughtException',
	'unhandledRejection',
] as const;
let baseline: Map<(typeof trackedEvents)[number], unknown[]>;

let stderrWrite: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let originalStdinIsTTY: boolean | undefined;

beforeEach(() => {
	baseline = new Map(
		trackedEvents.map(event => [event, process.listeners(event).slice()]),
	);

	render.mockClear();
	waitUntilExit.mockReset().mockResolvedValue(undefined);
	enter.mockClear();
	restore.mockClear();

	stderrWrite = vi
		.spyOn(process.stderr, 'write')
		.mockImplementation(() => true);
	originalStdinIsTTY = process.stdin.isTTY;
});

afterEach(() => {
	for (const event of trackedEvents) {
		for (const listener of process.listeners(event)) {
			if (!baseline.get(event)?.includes(listener)) {
				process.removeListener(
					event,
					listener as (...args: unknown[]) => void,
				);
			}
		}
	}

	stderrWrite.mockRestore();
	exitSpy?.mockRestore();
	process.stdin.isTTY = originalStdinIsTTY as boolean;
});

async function freshCli() {
	vi.resetModules();
	return import('./cli.js');
}

test('refuses to start when stdin is not a TTY, before ink ever mounts', async () => {
	process.stdin.isTTY = false;
	exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
		throw new ProcessExitSignal(code);
	}) as never;

	await expect(freshCli()).rejects.toThrow(ProcessExitSignal);

	expect(stderrWrite).toHaveBeenCalledTimes(1);
	expect(String(stderrWrite.mock.calls[0]?.[0])).toMatch(
		/interactive terminal/i,
	);
	expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);

	// The refusal must precede enter() and render(), so no escape sequence
	// and no Ink app is ever produced on this path.
	expect(enter).not.toHaveBeenCalled();
	expect(render).not.toHaveBeenCalled();
});

test('does not refuse when stdin is a TTY, and produces no extra output', async () => {
	process.stdin.isTTY = true;
	exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

	await freshCli();

	expect(stderrWrite).not.toHaveBeenCalled();
	expect(exitSpy).not.toHaveBeenCalled();
	expect(enter).toHaveBeenCalledTimes(1);
	expect(render).toHaveBeenCalledTimes(1);
});
