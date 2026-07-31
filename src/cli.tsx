#!/usr/bin/env node
import {render} from 'ink';
import App from './app.js';
import {enter, restore} from './terminal.js';

// The app depends on raw-mode keyboard input, which only an interactive
// stdin provides. Checked before enter() so a refusal never writes an
// alternate-screen or cursor-visibility sequence to stdout. This is exactly
// the condition Ink itself checks (ink/build/components/App.js:121), so it
// can never reject a launch Ink would have accepted.
if (!process.stdin.isTTY) {
	process.stderr.write(
		'russ-panel requires an interactive terminal to run.\n',
	);
	process.exit(1);
}

// Enter the alternate buffer before the first Ink frame, so nothing the app
// paints ever reaches the user's scrollback.
enter();

process.on('exit', restore);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		restore();
		process.exit(0);
	});
}

// Restore *before* printing: an error written into the alternate buffer is
// wiped the moment we switch back, which makes crashes invisible.
function crash(error: unknown): void {
	restore();
	console.error(error);
	process.exit(1);
}

process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

const {waitUntilExit} = render(<App />);

try {
	await waitUntilExit();
	restore();
} catch (error) {
	crash(error);
}
