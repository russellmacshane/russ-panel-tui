/** Both the footer and a present notice occupy exactly one row each. */
export const FOOTER_HEIGHT = 1;
export const NOTICE_HEIGHT = 1;
/** `app.tsx`'s content wrapper reserves one row above the mode's own content. */
export const CONTENT_PADDING_TOP = 1;

/**
 * The height left for a mode's content once the footer (always present), the
 * notice (present only while a message is posted), and the content area's own
 * top padding are subtracted. A mode that renders a fixed-height `Box` (the
 * location picker) must size itself to exactly this, or Ink's layout overflows
 * its allotted space and the frame overlaps rather than clipping.
 */
export function availableContentHeight(
	totalRows: number,
	{hasNotice}: {hasNotice: boolean},
): number {
	const reserved =
		FOOTER_HEIGHT + (hasNotice ? NOTICE_HEIGHT : 0) + CONTENT_PADDING_TOP;
	return Math.max(0, totalRows - reserved);
}
