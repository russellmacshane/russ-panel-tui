import {useCallback, useEffect, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {DEFAULT_LOCATION} from './config.js';
import {loadActiveLocation, selectLocation} from './location/config-store.js';
import {LocationPicker} from './location/location-picker.js';
import type {Location} from './location/types.js';
import {footerFor, routeInput, useShellMode} from './shell/modes.js';
import {NoticeArea, type NoticeController, useNotice} from './shell/notice.js';
import {availableContentHeight, CONTENT_PADDING_TOP} from './shell/viewport.js';
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

export default function App({
	onNoticeControllerReady,
}: {
	/**
	 * Test-only seam: production wires nothing to this. Lets a test reach the
	 * notice state that is otherwise private to this component, the same role
	 * a `Probe` component plays for `useWeather` in its own tests.
	 */
	onNoticeControllerReady?: (controller: NoticeController) => void;
} = {}) {
	const {exit} = useApp();
	const {columns, rows} = useViewport();
	const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
	const {state, refresh} = useWeather(location);
	const {mode, enterLocation, dismiss} = useShellMode();
	const {notice, setNotice, clearNotice} = useNotice();

	useEffect(() => {
		onNoticeControllerReady?.({post: setNotice, clear: clearNotice});
	}, [onNoticeControllerReady, setNotice, clearNotice]);

	// A saved location takes precedence over the default (design decision 5);
	// an unreadable file falls back to the default and warns (tasks 2.5/7.9).
	// Starting from `DEFAULT_LOCATION` rather than blocking on this promise is
	// what keeps first launch prompt-free — `useWeather` above already has
	// something to fetch before this resolves.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const result = await loadActiveLocation();
			if (cancelled) {
				return;
			}

			setLocation(result.location);
			if (result.warning) {
				setNotice(result.warning);
			}
		})();

		return () => {
			cancelled = true;
		};
		// Runs once, on mount, like the effect it replaces in `useWeather`.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Persist first so a write failure's warning is what's left standing;
	// the location becomes active either way (task 7.6/7.9, and the
	// "unwritable configuration" requirement that a failed save still keeps
	// the pick active for the session).
	const handleConfirm = useCallback(
		async (selected: Location) => {
			const {warning} = await selectLocation(selected);
			setLocation(selected);
			dismiss();
			if (warning) {
				setNotice(warning);
			} else {
				clearNotice();
			}
		},
		[dismiss, setNotice, clearNotice],
	);

	// `useInput` is also what holds the process open: it puts stdin in raw mode
	// and attaches a listener, so the event loop never drains on its own.
	// Ctrl-C needs no entry in the routing table: Ink's `exitOnCtrlC` (default
	// `true`) intercepts it ahead of this handler regardless of mode.
	useInput((input, key) => {
		routeInput(mode, input, key, {exit, refresh, enterLocation, dismiss});
	});

	const contentHeight = availableContentHeight(rows, {
		hasNotice: notice !== undefined,
	});

	return (
		<Box flexDirection="column" width={columns} height={rows} paddingX={1}>
			<Box flexGrow={1} flexDirection="column" paddingTop={CONTENT_PADDING_TOP}>
				{mode === 'normal' ? (
					<WeatherPanel location={location} state={state} />
				) : (
					<LocationPicker height={contentHeight} onConfirm={handleConfirm} />
				)}
			</Box>
			<NoticeArea notice={notice} />
			<Text dimColor>{footerFor(mode)}</Text>
		</Box>
	);
}
