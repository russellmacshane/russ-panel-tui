import {defineConfig} from 'vitest/config';

export default defineConfig({
	// Test files are colocated with sources; shared primitives live in
	// test/support/ and carry their own tests.
	test: {
		include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
		// Installs the default-deny fetch stub before any test runs, so an
		// unprogrammed request can never reach the network.
		setupFiles: ['./test/support/setup.ts'],
		// `client.ts` stamps readings with `new Date()` and the panel formats
		// them with `toLocaleTimeString()`. Pinning the zone keeps any
		// incidental formatting identical on every machine and in CI.
		env: {TZ: 'UTC'},
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,tsx}'],
			exclude: ['src/**/*.test.{ts,tsx}'],
		},
	},
	// Node strips TypeScript types but does not transform JSX, so the .tsx
	// tests depend on Vitest's transform. Declared explicitly rather than
	// inherited from tsconfig.json, which covers only src/ — test/ has .tsx
	// files too. Vitest 4 transforms with oxc; `esbuild: {...}` is silently
	// ignored.
	oxc: {
		jsx: {runtime: 'automatic', importSource: 'react'},
	},
});
