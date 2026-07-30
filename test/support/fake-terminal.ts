import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

/**
 * A terminal size. `null` for a dimension means the terminal reports nothing
 * for it, as some ptys do; omitting it leaves that dimension unchanged.
 */
export type FakeSize = {
	columns?: number | null | undefined;
	rows?: number | null | undefined;
};

/**
 * A fake stdout with settable dimensions.
 *
 * The settable `columns`/`rows` plus a real `resize` emit are the whole reason
 * this is first-party rather than `ink-testing-library`: that package hardcodes
 * `get columns() { return 100 }` and has no `rows` at all, which makes both
 * `useViewport` in src/app.tsx and the resize scenario untestable.
 *
 * `isTTY` is true so Ink subscribes to `resize` at all (ink.js:264) and so its
 * fullscreen detection reads our `rows` rather than a hardcoded 24.
 */
export class FakeStdout extends EventEmitter {
	readonly isTTY = true;
	/** Every frame Ink has written, oldest first. */
	readonly frames: string[] = [];
	/**
	 * Deliberately allowed to be `undefined` as well as `0`. Some ptys report
	 * nothing at all for their size, and the "reporting no size" scenario
	 * requires reproducing both — `src/app.tsx` guards with `||`, which treats
	 * them alike, but only a fake that can express both proves it.
	 */
	columns: number | undefined;
	rows: number | undefined;

	/** Pass `null` for a dimension to report nothing at all for it. */
	constructor({columns, rows}: FakeSize = {}) {
		super();
		this.columns = columns === null ? undefined : (columns ?? 80);
		this.rows = rows === null ? undefined : (rows ?? 24);
	}

	write = (
		chunk: string | Uint8Array,
		encodingOrCallback?: unknown,
		maybeCallback?: unknown,
	): boolean => {
		const frame =
			typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
		this.frames.push(frame);

		// Ink never passes a write callback today, but honouring one keeps this
		// a well-behaved WriteStream if that changes.
		const callback =
			typeof encodingOrCallback === 'function'
				? encodingOrCallback
				: maybeCallback;
		if (typeof callback === 'function') {
			(callback as () => void)();
		}

		return true;
	};

	/**
	 * The most recent non-empty frame. Ink writes a bare newline during
	 * teardown in debug mode, which is not a frame anyone wants to assert on.
	 */
	lastFrame(): string {
		for (let index = this.frames.length - 1; index >= 0; index--) {
			const frame = this.frames[index];
			if (frame && frame.trim() !== '') {
				return frame;
			}
		}

		return '';
	}

	/** Change the reported size and emit `resize`, as a real terminal does. */
	resize({columns, rows}: FakeSize): void {
		if (columns !== undefined) {
			this.columns = columns === null ? undefined : columns;
		}

		if (rows !== undefined) {
			this.rows = rows === null ? undefined : rows;
		}

		this.emit('resize');
	}
}

/**
 * A fake stdin.
 *
 * This is a real readable stream rather than an `EventEmitter`, because Ink 7
 * consumes input through the `'readable'` event and `stdin.read()`
 * (components/App.js:179) — not the `'data'` event an emitter-based fake would
 * provide. `isTTY` is what `isRawModeSupported` checks (App.js:121), so
 * `useInput` and every keybinding test depend on it.
 */
export class FakeStdin extends PassThrough {
	readonly isTTY = true;

	setRawMode(): this {
		return this;
	}

	ref(): this {
		return this;
	}

	unref(): this {
		return this;
	}
}

/** Escape sequences for keys that are not a single printable character. */
export const keys = {
	escape: '\u001B',
	ctrlC: '\u0003',
	enter: '\r',
	up: '\u001B[A',
	down: '\u001B[B',
	/** `0x7F` (DEL) — what a real terminal sends for Backspace; `parse-keypress.js` maps it to the `backspace` key name. */
	backspace: '\u007F',
} as const;
