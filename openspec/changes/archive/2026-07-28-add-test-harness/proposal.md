## Why

The `add-persistent-weather-panel` change shipped an async state machine and terminal input handling with no automated tests, and recorded the reason explicitly: *"choosing a runner and a network-mocking strategy is its own decision. Recorded as the natural follow-on change; every scenario in the specs is written to be directly testable when that lands."* This is that change.

The motivation is no longer just regression safety. The project is now meant to be expanded, and the weather panel is panel #1 of several. So the deliverable is not "coverage on the weather panel" — it is **the harness every future panel will be tested with**, proven by making the weather panel its first consumer. That also puts a net under the panel-abstraction refactor the design doc accepted as inevitable at panel #2.

## What Changes

- **Add Vitest** as the test runner, with `npm test` / `npm run test:watch` scripts and a `vitest.config.ts` that pins `TZ=UTC`.
- **Add a default-deny network stub.** A global setup file replaces `globalThis.fetch` with a stub that *throws* on any unprogrammed request. `src/weather/client.ts` calls the global `fetch` directly, so this intercepts the real boundary — no module mocking and no source changes. Accidental network access becomes a loud failure instead of silent flakiness.
- **Add a first-party Ink render harness** (~45 lines) rather than depending on `ink-testing-library`. See design.md for the investigation; briefly, that package was last published 2024-05-22 against `ink ^5` / `react ^18`, declares no `ink` peer dependency (so npm gives no compatibility signal), hardcodes `columns: 100` with no `rows` at all, hardcodes `exitOnCtrlC: false`, and cannot reach Ink 7's `waitUntilRenderFlush()`. Those four limits block three scenarios already written into the current specs.
- **Add tests mapped 1:1 onto existing spec scenarios**, concentrated on the loading/ready/stale/error state machine, defensive response parsing, refresh de-duplication, abort-on-unmount, the four panel render states, and terminal escape-sequence idempotency.
- **Add CI** running install, typecheck/build, and the test suite on push and pull request.
- **No changes to `src/`.** Testability is achieved through the existing global-`fetch` seam.

### Non-goals

- **No process-level (subprocess) test tier.** Verifying alternate-screen and restore guarantees by spawning the built binary and asserting raw stdout bytes is deliberately out of scope: it is the most fragile tier, it generalizes to no future panel, and Ink 7 now offers a native `alternateScreen` option that may make the hand-rolled implementation in `src/terminal.ts` obsolete. Testing code that is a candidate for deletion is the wrong order of operations. Recorded as a follow-on change.
- **No adoption of Ink 7's `alternateScreen`.** Identified during this change's investigation and worth its own proposal; it is not a testing concern.
- **No source changes for testability** — no injectable clock, no injectable timeout.
- **No coverage thresholds.** A gate is meaningless until there is history to calibrate it against.

## Capabilities

### New Capabilities

- `test-harness`: Automated verification of the application. Covers the test runner and how tests are invoked, network isolation during tests (requests must never leave the machine, and unprogrammed requests must fail loudly), the reusable harness for rendering Ink components against a controllable fake terminal, determinism requirements (fixed timezone, no assertions on wall-clock output), and execution in continuous integration.

### Modified Capabilities

None. This change adds no application behavior and alters no existing requirement. The `tui-shell` and `weather-panel` scenarios become the test targets exactly as written — that they are already phrased as WHEN/THEN pairs is what makes this change small. Where a scenario is *not* reachable by this change's tiers, design.md records it as a known gap rather than silently omitting it.

## Impact

- **Dependencies**: adds `vitest` and `@vitest/coverage-v8` as devDependencies. No runtime dependencies. Does not add `ink-testing-library`.
- **New files**: `vitest.config.ts`; `test/support/` (fake terminal + Ink harness, deferred-fetch stub, global setup); `*.test.ts(x)` colocated with sources; a CI workflow.
- **Modified files**: `package.json` (scripts + devDependencies), `.gitignore` (coverage output), `README.md` (a section on running tests).
- **Unmodified**: everything under `src/`.
- **Risk**: low. Nothing ships to users; the app's runtime behavior is untouched.
- **Follow-on changes identified**: adopt Ink 7 `alternateScreen` (and re-evaluate `src/terminal.ts`); process-level exit-path tests; configurable location (which this harness is intended to de-risk).
