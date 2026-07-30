import {createElement} from 'react';
import {Box, Text} from 'ink';
import {describe, expect, test} from 'vitest';
import {render} from '../../test/support/render.js';
import {NoticeArea} from './notice.js';

/**
 * Rendered without a fixed-height root (unlike `App`), so the frame's own
 * line count reflects only what actually rendered — the precondition for
 * proving "no notice occupies no rows" by a row-count difference rather than
 * by content presence alone.
 */
function frameRows(frame: string): number {
	return frame.split('\n').length;
}

async function renderShell(notice: string | undefined) {
	const harness = render(
		createElement(
			Box,
			{flexDirection: 'column'},
			createElement(Text, null, 'content above'),
			createElement(NoticeArea, {notice}),
			createElement(Text, null, 'footer below'),
		),
		{columns: 80, rows: 24},
	);
	await harness.waitUntilRenderFlush();
	return harness.lastFrame();
}

describe('NoticeArea', () => {
	test('an absent notice adds no row to the layout', async () => {
		const withoutNotice = await renderShell(undefined);
		const withNotice = await renderShell('a warning');

		expect(frameRows(withNotice)).toBe(frameRows(withoutNotice) + 1);
	});

	test('renders the message on its own line between its siblings', async () => {
		const frame = await renderShell('a warning');
		const lines = frame.split('\n').map(line => line.trim());

		expect(lines).toContain('a warning');
		const noticeIndex = lines.indexOf('a warning');
		expect(lines[noticeIndex - 1]).toBe('content above');
		expect(lines[noticeIndex + 1]).toBe('footer below');
	});
});
