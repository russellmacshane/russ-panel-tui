// Terminal state is a process concern, not a React one — it is owned here and
// at the cli.tsx process boundary, never from inside a component.

const ESC = '\u001B';

const ENTER_ALT_SCREEN = `${ESC}[?1049h`;
const LEAVE_ALT_SCREEN = `${ESC}[?1049l`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

let active = false;

/** Switch to the alternate screen buffer and hide the cursor. */
export function enter(): void {
	if (active) {
		return;
	}

	active = true;
	process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
}

/**
 * Return the terminal to the state we found it in. Registered on every exit
 * path, so it must be safe to call more than once — a missed or double-run
 * restore leaves the user staring at a blank buffer with no cursor.
 */
export function restore(): void {
	if (!active) {
		return;
	}

	active = false;
	process.stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN);
}
