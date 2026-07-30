import {useCallback, useState} from 'react';
import type {Key} from 'ink';

export type Mode = 'normal' | 'location';

export type ShellActions = {
	exit: () => void;
	refresh: () => void;
	enterLocation: () => void;
	dismiss: () => void;
};

type Handler = (input: string, key: Key, actions: ShellActions) => void;

// Keyed by mode, not branched on, so a third mode is an added entry rather
// than another `if (mode === ...)` in the middle of a growing function.
const handlers: Record<Mode, Handler> = {
	normal(input, _key, actions) {
		if (input === 'q') {
			actions.exit();
			return;
		}

		if (input === 'r') {
			actions.refresh();
			return;
		}

		if (input === 'l') {
			actions.enterLocation();
		}
	},

	// Only the shell-owned "leave the mode" binding lives here. Everything
	// else the picker needs (typing, arrows, Enter) is handled by its own
	// `useInput`, active only while it is mounted — keeping this table generic
	// across modes rather than growing picker-specific cases into it. That a
	// key otherwise bound in normal mode (q, r) is a no-op here is exactly
	// what proves normal-mode bindings can't leak through a text-entry mode.
	location(_input, key, actions) {
		if (key.escape) {
			actions.dismiss();
		}
	},
};

/** Dispatches a keypress to whichever mode is currently active. */
export function routeInput(
	mode: Mode,
	input: string,
	key: Key,
	actions: ShellActions,
): void {
	handlers[mode](input, key, actions);
}

const FOOTER_TEXT: Record<Mode, string> = {
	normal: 'q quit · r refresh · l location',
	location: 'Type to search · ↑↓ move · ⏎ select · Esc back',
};

/** The footer is derived from the active mode rather than hardcoded. */
export function footerFor(mode: Mode): string {
	return FOOTER_TEXT[mode];
}

/**
 * Owns the shell's mode state. Ctrl-C is deliberately not modeled here: Ink's
 * `exitOnCtrlC` (default `true`) intercepts it ahead of `useInput` regardless
 * of mode, so it already works everywhere and needs no routing entry.
 */
export function useShellMode() {
	const [mode, setMode] = useState<Mode>('normal');

	const enterLocation = useCallback(() => {
		setMode('location');
	}, []);

	// Discards whatever placeholder/future state the mode was holding —
	// leaving a mode never applies a change, it only returns to normal.
	const dismiss = useCallback(() => {
		setMode('normal');
	}, []);

	return {mode, enterLocation, dismiss};
}
