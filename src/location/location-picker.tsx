import {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {REQUEST_TIMEOUT_MS} from '../config.js';
import {disambiguateCandidates} from './format.js';
import {MIN_QUERY_LENGTH, searchLocations} from './geocoding-client.js';
import type {Candidate, Location} from './types.js';

/**
 * Every variant carries `query` — the text a search ran (or will run) against
 * — so a single field can always be rendered regardless of state, and any
 * edit (append/backspace) can fall back to it uniformly (design decision 13's
 * state machine: `typing -> searching -> results | no matches | error`, with
 * an edit from any of the last three returning to `typing`).
 */
type PickerState =
	| {status: 'typing'; query: string; hint?: string}
	| {status: 'searching'; query: string}
	| {
			status: 'results';
			query: string;
			candidates: Candidate[];
			labels: string[];
			selected: number;
	  }
	| {status: 'no-matches'; query: string}
	| {status: 'error'; query: string; message: string};

// Border (top + bottom) + title + the field itself — the part of the layout
// that is always present, independent of state (task 6.7 / "modal content
// fits the viewport").
const CHROME_ROWS = 4;

/** Drops `admin2`/`population` — selection-only fields that never reach disk or the active location (design decision 15). */
function toLocation(candidate: Candidate): Location {
	return {
		name: candidate.name,
		latitude: candidate.latitude,
		longitude: candidate.longitude,
		...(candidate.admin1 !== undefined && {admin1: candidate.admin1}),
		...(candidate.country !== undefined && {country: candidate.country}),
		...(candidate.timezone !== undefined && {timezone: candidate.timezone}),
	};
}

/** Same dispatch as `use-weather.ts`'s `describeError` — this client mirrors that one's failure shape. */
function describeError(error: unknown): string {
	const name = (error as {name?: string} | null)?.name;

	if (name === 'TimeoutError') {
		return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`;
	}

	if (name === 'AbortError') {
		return 'Request cancelled';
	}

	if (error instanceof Error) {
		const cause = (error.cause as {message?: string} | undefined)?.message;
		return cause ? `${error.message} — ${cause}` : error.message;
	}

	return 'Unknown error';
}

/** The minimal scroll offset that keeps `selected` inside a `maxVisible`-row window. */
function windowStart(
	selected: number,
	length: number,
	maxVisible: number,
): number {
	if (maxVisible >= length) {
		return 0;
	}

	const start = Math.max(0, selected - maxVisible + 1);
	return Math.min(start, length - maxVisible);
}

export function LocationPicker({
	height,
	onConfirm,
}: {
	height: number;
	onConfirm: (location: Location) => void;
}) {
	const [state, setState] = useState<PickerState>({status: 'typing', query: ''});
	const mounted = useRef(true);
	const abortRef = useRef<AbortController | undefined>(undefined);

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			// Covers both ways a search can be left mid-flight: the mode is
			// dismissed (this component unmounts) or the app quits (same thing,
			// for every mounted component) — task 7.8.
			abortRef.current?.abort();
		};
	}, []);

	const search = useCallback((query: string) => {
		setState({status: 'searching', query});
		const controller = new AbortController();
		abortRef.current = controller;

		void (async () => {
			try {
				const result = await searchLocations(query, controller.signal);
				if (!mounted.current) {
					return;
				}

				if (result.status === 'query-too-short') {
					// Reached only if a caller skips the client-side length check;
					// kept as a fallback so the two can never disagree.
					setState({
						status: 'typing',
						query,
						hint: `Type at least ${MIN_QUERY_LENGTH} characters.`,
					});
					return;
				}

				if (result.candidates.length === 0) {
					// A successful search with zero rows is not an error (design
					// decision 7) — its own state, rendered as a message.
					setState({status: 'no-matches', query});
					return;
				}

				setState({
					status: 'results',
					query,
					candidates: result.candidates,
					labels: disambiguateCandidates(result.candidates),
					selected: 0,
				});
			} catch (error) {
				if (!mounted.current) {
					return;
				}

				setState({status: 'error', query, message: describeError(error)});
			}
		})();
	}, []);

	useInput((input, key) => {
		// No edit or retry is meaningful while a request is already in flight;
		// leaving (which aborts it) is handled by the shell, not here.
		if (state.status === 'searching') {
			return;
		}

		if (key.return) {
			if (state.status === 'typing') {
				const query = state.query.trim();
				if (query.length < MIN_QUERY_LENGTH) {
					setState({
						status: 'typing',
						query: state.query,
						hint: `Type at least ${MIN_QUERY_LENGTH} characters.`,
					});
					return;
				}

				search(query);
				return;
			}

			if (state.status === 'no-matches' || state.status === 'error') {
				search(state.query);
				return;
			}

			// results
			onConfirm(toLocation(state.candidates[state.selected]!));
			return;
		}

		if (key.upArrow || key.downArrow) {
			// A functional update, not a read of the closed-over `state`: Ink can
			// deliver more than one key event from a single chunk (holding an
			// arrow key, same as the holding-backspace case below), and those
			// land in the same React batch — so the second event must see the
			// first's result, not the state this render closure captured.
			const delta = key.upArrow ? -1 : 1;
			setState(previous => {
				if (previous.status !== 'results') {
					return previous;
				}

				const selected = Math.min(
					Math.max(previous.selected + delta, 0),
					previous.candidates.length - 1,
				);
				return {...previous, selected};
			});
			return;
		}

		if (key.backspace || key.delete) {
			// Same reasoning as the arrow-key branch: a held backspace key can
			// deliver several `backspace` events from one stdin chunk (Ink splits
			// them itself — see `input-parser.js`'s `splitBackspaceBytes`), and a
			// plain object update would drop all but one of them.
			setState(previous => ({
				status: 'typing',
				query: previous.query.slice(0, -1),
			}));
			return;
		}

		// Any other printable character. Named keys (arrows, Escape, Enter, …)
		// are reported with an empty `input` by Ink, so this can't double-fire.
		if (input && !key.ctrl && !key.meta) {
			setState(previous => ({
				status: 'typing',
				query: previous.query + input,
			}));
		}
	});

	const listHeight = Math.max(1, height - CHROME_ROWS);

	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			paddingX={1}
			height={height > 0 ? height : undefined}
		>
			<Text bold>SET LOCATION</Text>
			<Text>
				City: {state.query}
				<Text dimColor>▌</Text>
			</Text>
			<Body state={state} listHeight={listHeight} />
		</Box>
	);
}

function Body({
	state,
	listHeight,
}: {
	state: PickerState;
	listHeight: number;
}) {
	switch (state.status) {
		case 'typing': {
			return state.hint ? <Text color="yellow">{state.hint}</Text> : null;
		}

		case 'searching': {
			return <Text dimColor>Searching…</Text>;
		}

		case 'no-matches': {
			return <Text dimColor>No places matched "{state.query}".</Text>;
		}

		case 'error': {
			return (
				<>
					<Text color="red">! Search failed</Text>
					<Text color="red" dimColor>
						{state.message}
					</Text>
				</>
			);
		}

		case 'results': {
			const start = windowStart(
				state.selected,
				state.candidates.length,
				listHeight,
			);
			const visible = state.labels.slice(start, start + listHeight);

			return (
				<Box flexDirection="column">
					{visible.map((label, offset) => {
						const index = start + offset;
						const isSelected = index === state.selected;
						return (
							<Text key={label} color={isSelected ? 'cyan' : undefined}>
								{isSelected ? '▸ ' : '  '}
								{label}
							</Text>
						);
					})}
				</Box>
			);
		}
	}
}
