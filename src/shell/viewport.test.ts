import {describe, expect, test} from 'vitest';
import {availableContentHeight} from './viewport.js';

// The full end-to-end "a list longer than the terminal is bounded" scenario
// lands with Phase 7's real candidate list; this only proves the height
// arithmetic it will be built on.
describe('availableContentHeight', () => {
	test('subtracts the footer and the content area\'s top padding when there is no notice', () => {
		expect(availableContentHeight(24, {hasNotice: false})).toBe(22);
	});

	test('subtracts the footer, the notice, and the top padding when a notice is present', () => {
		expect(availableContentHeight(24, {hasNotice: true})).toBe(21);
	});

	test('scales with a different terminal size', () => {
		expect(availableContentHeight(30, {hasNotice: false})).toBe(28);
		expect(availableContentHeight(30, {hasNotice: true})).toBe(27);
	});

	test('never goes negative when the terminal is smaller than the chrome', () => {
		expect(availableContentHeight(1, {hasNotice: true})).toBe(0);
	});
});
