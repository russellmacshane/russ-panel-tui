import type {ReactElement} from 'react';
import {render as inkRender} from 'ink';
import {FakeStdin, FakeStdout, type FakeSize} from './fake-terminal.js';

export type RenderOptions = FakeSize & {
	/**
	 * Left to the caller because the `tui-shell` spec has a scenario for
	 * quitting with Ctrl-C, and Ink's default of `true` is what implements it.
	 * `ink-testing-library` hardcodes this to `false`.
	 */
	exitOnCtrlC?: boolean;
};

export type Rendered = {
	stdout: FakeStdout;
	stdin: FakeStdin;
	/** The most recent non-empty frame, as text. */
	lastFrame: () => string;
	/** Every frame written so far, oldest first. */
	frames: string[];
	/** Send input as if typed. See `keys` for non-printable keys. */
	write: (input: string) => void;
	/** Change the terminal size and emit `resize`. */
	resize: (size: FakeSize) => void;
	rerender: (node: ReactElement) => void;
	/**
	 * Resolves once pending render output has been flushed — Ink 7's answer to
	 * the `await delay(50)` that makes Ink tests flaky. Ink throttles at
	 * `maxFps: 30`, so frame assertions without this can coalesce.
	 */
	waitUntilRenderFlush: () => Promise<unknown>;
	/** Resolves with the value passed to `exit(value)`, hence `unknown`. */
	waitUntilExit: () => Promise<unknown>;
	unmount: () => void;
	cleanup: () => void;
};

const active = new Set<{cleanup: () => void}>();

/**
 * Render an Ink component against a fake terminal.
 *
 * A first-party replacement for `ink-testing-library`; see README.md in this
 * directory for why. Deliberately small, and built only on documented Ink
 * render options.
 */
export function render(node: ReactElement, options: RenderOptions = {}): Rendered {
	const stdout = new FakeStdout({
		columns: options.columns,
		rows: options.rows,
	});
	const stdin = new FakeStdin();

	const instance = inkRender(node, {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		stderr: stdout as unknown as NodeJS.WriteStream,
		// Unthrottles rendering (ink.js:193) so every update writes a full
		// frame and `lastFrame()` is meaningful.
		debug: true,
		// Vitest would otherwise lose test output to Ink's console patching.
		patchConsole: false,
		// Must be explicit. Ink's default resolves `!isInCi && stdout.isTTY`
		// (ink.js:707), so under CI env detection it would come out false —
		// and a non-interactive Ink skips its `resize` subscription entirely
		// (ink.js:264), silently turning the resize test into a no-op that
		// passes locally and proves nothing in CI.
		interactive: true,
		// Auto-detection writes a `CSI ? u` query into our frames and holds a
		// 200ms timer open waiting for a reply no fake terminal will send.
		kittyKeyboard: {mode: 'disabled'},
		// Omitted entirely rather than passed as `undefined` when the caller
		// doesn't set it: Ink's own `render()` spreads this options object
		// verbatim over its defaults, so an explicit `exitOnCtrlC: undefined`
		// key clobbers Ink's own default of `true` instead of falling back to
		// it — silently disabling the Ctrl-C escape hatch in every test that
		// doesn't opt in.
		...(options.exitOnCtrlC === undefined
			? {}
			: {exitOnCtrlC: options.exitOnCtrlC}),
	});

	const rendered: Rendered = {
		stdout,
		stdin,
		lastFrame: () => stdout.lastFrame(),
		frames: stdout.frames,
		write(input) {
			stdin.write(input);
		},
		resize(size) {
			stdout.resize(size);
		},
		rerender: instance.rerender,
		waitUntilRenderFlush: instance.waitUntilRenderFlush,
		waitUntilExit: instance.waitUntilExit,
		unmount: instance.unmount,
		cleanup() {
			instance.cleanup();
			active.delete(entry);
		},
	};

	const entry = {cleanup: rendered.cleanup};
	active.add(entry);

	return rendered;
}

/**
 * Tear down anything a test left mounted. Called from setup.ts `afterEach`, so
 * a forgotten `unmount()` cannot leak frames or timers into the next test —
 * Ink also treats reusing a stdout across renders without cleanup as
 * unsupported.
 */
export function cleanupRenders(): void {
	for (const entry of [...active]) {
		try {
			entry.cleanup();
		} catch {
			// Already torn down by the test; nothing to do.
		}

		active.delete(entry);
	}
}
