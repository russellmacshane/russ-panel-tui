import {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {useWeather} from './weather/use-weather.js';
import {WeatherPanel} from './weather/weather-panel.js';

/**
 * The alternate screen has no scrollback to absorb overflow, so the root box
 * is bound to the terminal's real size and follows it across resizes.
 */
// Some ptys report 0 (or nothing) for their size. Collapsing the root box to
// zero would render a blank screen, so fall back to a conventional 80x24.
const FALLBACK_COLUMNS = 80;
const FALLBACK_ROWS = 24;

function measure(stdout: NodeJS.WriteStream) {
	return {
		columns: stdout.columns || FALLBACK_COLUMNS,
		rows: stdout.rows || FALLBACK_ROWS,
	};
}

function useViewport() {
	const {stdout} = useStdout();
	const [size, setSize] = useState(() => measure(stdout));

	useEffect(() => {
		const onResize = () => {
			setSize(measure(stdout));
		};

		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	return size;
}

export default function App() {
	const {exit} = useApp();
	const {columns, rows} = useViewport();
	const {state, refresh} = useWeather();

	// `useInput` is also what holds the process open: it puts stdin in raw mode
	// and attaches a listener, so the event loop never drains on its own.
	useInput((input, key) => {
		if (input === 'q' || key.escape) {
			exit();
			return;
		}

		if (input === 'r') {
			refresh();
		}
	});

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Box flexGrow={1} flexDirection="column" paddingTop={1}>
				<WeatherPanel state={state} />
			</Box>
			<Text dimColor>q quit · r refresh</Text>
		</Box>
	);
}
