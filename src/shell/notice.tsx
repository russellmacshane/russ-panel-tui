import {useCallback, useState} from 'react';
import {Text} from 'ink';

/** A handle for posting/clearing the notice from outside the component that owns it — a test seam (see `app.tsx`); Phase 7 will call these directly instead. */
export type NoticeController = {
	post: (message: string) => void;
	clear: () => void;
};

/**
 * Renders the single-line notice, or nothing at all. `undefined` must render
 * as no element rather than an empty `<Text>` — an empty string still
 * reserves a row, and the "no notice occupies no rows" requirement means the
 * slot itself must be absent from the tree.
 */
export function NoticeArea({notice}: {notice: string | undefined}) {
	return notice === undefined ? null : <Text>{notice}</Text>;
}

/**
 * The shell's single-slot notice: one field, no queue, no severities, no
 * dismiss key. `undefined` means the notice area renders nothing at all
 * (zero rows), not an empty line — callers must check for that themselves
 * when deciding whether to render the `<Text>`.
 */
export function useNotice() {
	const [notice, setNoticeState] = useState<string | undefined>(undefined);

	// A later message replaces an earlier one for free: this is just
	// `useState`, so posting again overwrites rather than queuing.
	const setNotice = useCallback((message: string) => {
		setNoticeState(message);
	}, []);

	const clearNotice = useCallback(() => {
		setNoticeState(undefined);
	}, []);

	return {notice, setNotice, clearNotice};
}
