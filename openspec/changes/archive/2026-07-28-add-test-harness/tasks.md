## 1. Runner setup

- [x] 1.1 Add `vitest` and `@vitest/coverage-v8` as devDependencies
- [x] 1.2 Add `test`, `test:watch`, and `test:coverage` scripts to `package.json`
- [x] 1.3 Create `vitest.config.ts`: include `src/**/*.test.ts(x)`, register the global setup file, set `env: {TZ: 'UTC'}`, and enable the JSX transform for `.tsx` test files
- [x] 1.4 Add coverage output to `.gitignore`
- [x] 1.5 Verify a trivial placeholder test runs via `npm test` against sources with no `dist/` present

## 2. Network isolation primitives

- [x] 2.1 Create `test/support/fetch-stub.ts` exposing install/reset plus a way to program a response per request
- [x] 2.2 Make the default behaviour throw `unexpected fetch: <url>` for any unprogrammed request
- [x] 2.3 Add deferred-request support so a test can hold a request in flight and resolve or reject it on demand, including rejecting with a chosen `error.name`
- [x] 2.4 Create `test/support/setup.ts` that installs the stub before every test and resets it after, and register it in `vitest.config.ts`
- [x] 2.5 Add tests for the stub itself: unprogrammed request throws, programmed response returns, and no leakage between tests

## 3. Ink component harness

- [x] 3.1 Create `test/support/fake-terminal.ts`: an `EventEmitter`-based stdout with settable `columns`/`rows`, `isTTY: true`, frame capture, and a method that changes dimensions and emits `resize`
- [x] 3.2 Add the matching fake stdin with `isTTY: true` and the no-op stream methods Ink's raw-mode path requires
- [x] 3.3 Create `test/support/render.ts` wrapping Ink's `render` with the fakes, passing `debug: true` and `patchConsole: false`, and leaving `exitOnCtrlC` caller-controllable
- [x] 3.4 Pass `waitUntilRenderFlush` and `waitUntilExit` through to callers, plus `lastFrame()`, `frames`, `unmount`, and `cleanup`
- [x] 3.5 Add a self-test for the harness: renders a trivial component, reports the configured size, delivers a key press, and flushes an async update without a fixed delay

## 4. Weather stack tests (Tier 1)

- [x] 4.1 `src/weather/codes.test.ts`: a representative mapped code, and an unmapped code that still reports the raw WMO number
- [x] 4.2 `src/weather/client.test.ts`: request URL carries the configured latitude, longitude, and temperature unit, and carries no key or credential
- [x] 4.3 `src/weather/client.test.ts`: non-ok HTTP status throws with status and status text
- [x] 4.4 `src/weather/client.test.ts`: body that is not valid JSON throws
- [x] 4.5 `src/weather/client.test.ts`: missing `current`, missing or non-finite temperature, and missing weather code each throw rather than yielding a partial reading
- [x] 4.6 `src/weather/client.test.ts`: unit symbol is taken from `current_units` when present and falls back to the configured symbol when absent
- [x] 4.7 `src/weather/use-weather.test.ts`: mounts in loading, then transitions to ready on success
- [x] 4.8 `src/weather/use-weather.test.ts`: refresh from ready replaces the reading on success
- [x] 4.9 `src/weather/use-weather.test.ts`: refresh failure after a successful reading yields stale, retaining the previous reading and its original retrieval time
- [x] 4.10 `src/weather/use-weather.test.ts`: refresh success from stale clears the stale marking
- [x] 4.11 `src/weather/use-weather.test.ts`: failure with no prior reading yields error
- [x] 4.12 `src/weather/use-weather.test.ts`: refresh while a request is in flight is dropped, with no second request issued
- [x] 4.13 `src/weather/use-weather.test.ts`: unmount aborts the in-flight request and no state update is attempted afterwards
- [x] 4.14 `src/weather/use-weather.test.ts`: rejection named `TimeoutError` produces the timeout message, and `AbortError` produces the cancelled message
- [x] 4.15 `src/weather/use-weather.test.ts`: a bare `fetch failed` error with a `cause` surfaces the cause in the message

## 5. Terminal tests (Tier 1)

- [x] 5.1 `src/terminal.test.ts`: `enter()` writes the alternate-screen and hide-cursor sequences
- [x] 5.2 `src/terminal.test.ts`: `restore()` writes the show-cursor and primary-screen sequences
- [x] 5.3 `src/terminal.test.ts`: `enter()` twice writes once, and `restore()` twice writes once — controlling module state explicitly rather than relying on test ordering

## 6. Component tests (Tier 2)

- [x] 6.1 `src/weather/weather-panel.test.tsx`: loading state shows a loading indication and no placeholder values
- [x] 6.2 `src/weather/weather-panel.test.tsx`: ready state shows temperature with unit, a conditions description, the location name, and a timestamp — asserting the timestamp is present, not its formatted value
- [x] 6.3 `src/weather/weather-panel.test.tsx`: unrecognised weather code still shows the temperature and reports the raw code
- [x] 6.4 `src/weather/weather-panel.test.tsx`: error state shows the failure message and tells the user `r` retries
- [x] 6.5 `src/weather/weather-panel.test.tsx`: stale state shows the previous reading, a stale marker, and the reason the refresh failed
- [x] 6.6 `src/app.test.tsx`: footer lists the quit and refresh bindings
- [x] 6.7 `src/app.test.tsx`: `q` and Escape each exit the app
- [x] 6.8 `src/app.test.tsx`: `r` issues a refresh, and is dropped while a request is in flight
- [x] 6.9 `src/app.test.tsx`: root layout uses the fake terminal's dimensions
- [x] 6.10 `src/app.test.tsx`: zero or absent dimensions fall back to 80x24
- [x] 6.11 `src/app.test.tsx`: a resize event re-renders at the new dimensions

## 7. Continuous integration

- [x] 7.1 Add a CI workflow running on push and pull request: install, `npm run build`, `npm test`
- [x] 7.2 Pin the Node version to one satisfying Ink's `>=22` engine requirement
- [x] 7.3 Verify the workflow fails on a deliberately broken test and on a deliberate type error, then revert both

## 8. Documentation and close-out

- [x] 8.1 Add a testing section to `README.md`: how to run the suite, and where the shared harness lives for future panels
- [x] 8.2 Add a `test/support/README.md` or header comment recording that the harness replaces `ink-testing-library` and why, so the decision is not silently reversed
- [x] 8.3 Confirm nothing under `src/` was modified
- [x] 8.4 Run the full suite twice in succession and confirm identical results
- [x] 8.5 Run the suite with networking disabled and confirm it still passes
- [x] 8.6 Run `openspec validate add-test-harness --strict` and resolve any findings
