## 1. Terminal lifecycle

- [x] 1.1 Add an alt-screen module exposing `enter()` and an idempotent `restore()` that write the alternate-buffer and cursor-visibility control sequences
- [x] 1.2 Call `enter()` in `src/cli.tsx` before `render()`, so no frame reaches the primary buffer
- [x] 1.3 Await `waitUntilExit()` and call `restore()` on normal unmount
- [x] 1.4 Register `restore()` on `process.on('exit')`, `SIGINT`, and `SIGTERM`
- [x] 1.5 Handle `uncaughtException` and `unhandledRejection`: restore first, then print the error to the restored terminal, then exit non-zero
- [x] 1.6 Manually verify each exit path leaves a usable terminal — `q`, Ctrl-C, `kill <pid>`, and a deliberately thrown error

## 2. Persistent shell

- [x] 2.1 Replace the `Hello, world` body of `src/app.tsx` with a root `<Box>` laid out as content area plus footer
- [x] 2.2 Size the root box to `stdout.columns`/`stdout.rows` via `useStdout`, and subscribe to the `resize` event to keep it current
- [x] 2.3 Add `useInput` handling for `q` (quit via `useApp().exit()`) and `r` (refresh)
- [x] 2.4 Add the keybinding footer showing `q quit` and `r refresh`
- [x] 2.5 Verify the app stays running and responsive after first render, and that resizing re-renders without smearing

## 3. Open-Meteo client

- [x] 3.1 Define location, units, and timeout constants in one place, with the fixed lat/lon commented as a known limitation
- [x] 3.2 Define the TypeScript type for a weather reading (temperature, unit, weather code, retrieval time)
- [x] 3.3 Implement the fetch call against Open-Meteo's current-conditions endpoint using global `fetch`, requesting Fahrenheit, with `AbortSignal.timeout` and an accepted external `AbortSignal`
- [x] 3.4 Validate the response defensively: non-OK status, non-JSON body, and missing expected fields all surface as an error rather than producing a partial reading
- [x] 3.5 Add the WMO weather-code lookup table mapping codes to human text, falling back to the raw code for unmapped values

## 4. Panel state machine

- [x] 4.1 Implement a hook owning the loading / ready / error / stale states plus a `refresh()` action
- [x] 4.2 Fetch once on mount
- [x] 4.3 On refresh success, replace the reading and clear any stale marking
- [x] 4.4 On refresh failure with a previous reading, keep that reading and mark it stale with the failure reason; on failure with no previous reading, enter the error state
- [x] 4.5 Ignore `refresh()` while a request is in flight
- [x] 4.6 Abort the in-flight request on unmount and ensure no state update occurs after teardown

## 5. Panel rendering

- [x] 5.1 Render the loading state
- [x] 5.2 Render the ready state: temperature with unit, conditions text, location name, and retrieval time
- [x] 5.3 Render the error state with the failure reason and a hint that `r` retries
- [x] 5.4 Render the stale state: the previous reading, its original retrieval time, and a visible stale marker
- [x] 5.5 Wire the shell's `r` binding to the panel's `refresh()`

## 6. Verification and docs

- [x] 6.1 Confirm `npm run build` type-checks clean and `npm start` runs
- [x] 6.2 Exercise the unhappy paths manually — offline (error state), offline after a successful reading (stale state), and a forced timeout
- [x] 6.3 Confirm `package.json` still lists only `ink` and `react` as dependencies
- [x] 6.4 Update `README.md`: the app is now persistent and full-screen, `q` quits and `r` refreshes, and the hello-world description is gone
- [x] 6.5 Validate the change with `openspec validate add-persistent-weather-panel`
