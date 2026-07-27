import {render} from 'ink';
import App from './app.js';
import {enter, restore} from './terminal.js';

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
