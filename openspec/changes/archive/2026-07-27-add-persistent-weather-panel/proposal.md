## Why

The bootstrap change proved the Ink toolchain but produced a shell that paints one frame and exits — the `tui-shell` spec literally requires the process to terminate on its own. A command center is a long-lived, interactive process, so that requirement has to be overturned before any panel is worth building. This change replaces it with a persistent, full-screen shell and lands the first real panel (current weather) to prove the shape an async panel takes.

## What Changes

- **BREAKING** `tui-shell` no longer exits after rendering. The app runs until the user quits.
- Add a quit binding (`q`, plus Ctrl-C) that unmounts the app and returns exit code 0.
- Take over the terminal with the alternate screen buffer on start, and restore the primary buffer and cursor on **every** exit path — normal quit, Ctrl-C, SIGTERM, and uncaught exceptions.
- Size the root layout to the terminal viewport and track resizes, since alt-screen has no scrollback to absorb overflow.
- Add a persistent footer showing the active keybindings (`q` quit, `r` refresh).
- Add a `weather-panel` capability: fetch current conditions from Open-Meteo on launch, render temperature / conditions / last-updated time, and refresh on demand with `r`.
- Model the panel's full async lifecycle: loading, ready, error, and stale (a failed refresh keeps the last good reading on screen rather than blanking the panel).

Non-goals for this change: automatic polling on a timer, configurable location (a hardcoded lat/lon is a stated limitation), multiple panels, navigation or focus management between panels, and any test harness.

## Capabilities

### New Capabilities
- `weather-panel`: fetching current weather from Open-Meteo, rendering it, manual refresh, and the loading/ready/error/stale display states.

### Modified Capabilities
- `tui-shell`: the "Clean exit" requirement is replaced — the app persists until the user quits instead of terminating after render. Adds quit input handling, alternate-screen entry/restoration guarantees, viewport-sized layout, and the keybinding footer.

## Impact

- **Code**: `src/cli.tsx` (alt-screen enter/leave, exit-path cleanup, render lifecycle), `src/app.tsx` (root layout, input handling, footer), plus new source for the weather panel and its Open-Meteo client.
- **Dependencies**: none added. Node 24's global `fetch` covers the network call and the alt-screen control sequences are plain strings, so the project stays on `ink` + `react` only.
- **External services**: introduces a runtime dependency on the Open-Meteo API (`api.open-meteo.com`), which requires no API key. The app must remain usable — showing an error or stale state — when it is unreachable.
- **Specs**: `openspec/specs/tui-shell/spec.md` gains and loses requirements; a new `openspec/specs/weather-panel/spec.md` is created.
- **Risk**: a missed exit path leaves the user's terminal wedged in the alt buffer with a hidden cursor. Terminal restoration is treated as a spec-level requirement, not an implementation detail.
- **Deferred**: no automated tests. Input handling and async state are where tests will pay, but choosing a runner and a network-mocking approach is its own change.
