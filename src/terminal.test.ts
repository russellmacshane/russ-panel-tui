import {afterEach, beforeEach, expect, test, vi} from 'vitest';

// Spelled out rather than imported from terminal.ts: the point is to pin the
// exact bytes sent to the terminal, and a test that shared a constant with the
// implementation could never detect that constant changing.
const ESC = '\u001B';
const ENTER_ALT_SCREEN = `${ESC}[?1049h`;
const LEAVE_ALT_SCREEN = `${ESC}[?1049l`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

/**
 * `terminal.ts` holds an `active` flag at module scope. Each test therefore
 * imports a fresh copy after `vi.resetModules()`, so idempotency is asserted
 * against known state rather than against whatever the previous test left
 * behind — test order must not be load-bearing here.
 */
async function freshTerminal() {
	vi.resetModules();
	return import('./terminal.js');
}

let writes: string[];
let write: ReturnType<typeof vi.spyOn>;
let originalIsTTY: boolean;

beforeEach(() => {
	writes = [];
	write = vi
		.spyOn(process.stdout, 'write')
		.mockImplementation((chunk: unknown) => {
			writes.push(String(chunk));
			return true;
		});
	originalIsTTY = process.stdout.isTTY;
});

afterEach(() => {
	write.mockRestore();
	process.stdout.isTTY = originalIsTTY;
});

test('enter() switches to the alternate screen and hides the cursor', async () => {
	process.stdout.isTTY = true;
	const {enter} = await freshTerminal();

	enter();

	expect(writes).toEqual([ENTER_ALT_SCREEN + HIDE_CURSOR]);
});

test('restore() shows the cursor and returns to the primary screen', async () => {
	process.stdout.isTTY = true;
	const {enter, restore} = await freshTerminal();
	enter();
	writes.length = 0;

	restore();

	expect(writes).toEqual([SHOW_CURSOR + LEAVE_ALT_SCREEN]);
});

// The cursor must be shown before leaving the alternate screen; the reverse
// order can leave the user's primary screen without a visible cursor.
test('restore() shows the cursor before leaving the alternate screen', async () => {
	process.stdout.isTTY = true;
	const {enter, restore} = await freshTerminal();
	enter();
	writes.length = 0;

	restore();

	const output = writes.join('');
	expect(output.indexOf(SHOW_CURSOR)).toBeLessThan(
		output.indexOf(LEAVE_ALT_SCREEN),
	);
});

test('enter() twice writes once', async () => {
	process.stdout.isTTY = true;
	const {enter} = await freshTerminal();

	enter();
	enter();

	expect(writes).toEqual([ENTER_ALT_SCREEN + HIDE_CURSOR]);
});

// `restore` is registered on every exit path, so a double run must be a no-op:
// a second restore that wrote again could leave the terminal wedged.
test('restore() twice writes once', async () => {
	process.stdout.isTTY = true;
	const {enter, restore} = await freshTerminal();
	enter();
	writes.length = 0;

	restore();
	restore();

	expect(writes).toEqual([SHOW_CURSOR + LEAVE_ALT_SCREEN]);
});

test('restore() without a preceding enter() writes nothing', async () => {
	process.stdout.isTTY = true;
	const {restore} = await freshTerminal();

	restore();

	expect(writes).toEqual([]);
});

test('enter() after restore() switches back to the alternate screen', async () => {
	process.stdout.isTTY = true;
	const {enter, restore} = await freshTerminal();
	enter();
	restore();
	writes.length = 0;

	enter();

	expect(writes).toEqual([ENTER_ALT_SCREEN + HIDE_CURSOR]);
});

// Failure A (design.md decision 9): a non-TTY stdout must never receive
// escape sequences, or captured/redirected output is polluted with garbage.
test('enter() writes nothing when standard output is not a TTY', async () => {
	process.stdout.isTTY = false;
	const {enter} = await freshTerminal();

	enter();

	expect(writes).toEqual([]);
});

// Because a gated enter() never sets the module-scope `active` flag,
// restore()'s existing `if (!active) return` guard is already correct here
// with no second TTY check needed — this test pins that behaviour.
test('restore() after a no-op enter() writes nothing and does not throw', async () => {
	process.stdout.isTTY = false;
	const {enter, restore} = await freshTerminal();
	enter();
	writes.length = 0;

	expect(() => {
		restore();
	}).not.toThrow();
	expect(writes).toEqual([]);
});
