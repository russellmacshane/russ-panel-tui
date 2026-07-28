import {afterEach, beforeEach} from 'vitest';
import {installFetchStub, resetFetchStub} from './fetch-stub.js';
import {cleanupRenders} from './render.js';

// Registered as `setupFiles` in vitest.config.ts, so the stub is in place
// before any test body runs and no test can opt out of network isolation.
beforeEach(() => {
	installFetchStub();
});

afterEach(() => {
	// Unmount first: a still-mounted component can react to the pending
	// requests that `resetFetchStub` rejects.
	cleanupRenders();
	resetFetchStub();
});
