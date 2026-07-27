## Context

The repo currently holds the bootstrap result: `src/cli.tsx` calls `render(<App/>)`, `src/app.tsx` renders `<Text color="green">Hello, world</Text>`, and the process exits once the event loop drains. Toolchain is Ink 7.1.1, React 19, TypeScript compiled by `tsc` to `dist/`, run as `node dist/cli.js`. Node is 24.15, so global `fetch` is available and no HTTP client is needed.

This is the first change that makes the app an actual application rather than a script that paints once. Two things arrive together: the shell becomes long-lived and full-screen, and the first async panel establishes the pattern every later panel will copy. The bootstrap design deliberately deferred input handling and navigation to exactly this point.

## Goals / Non-Goals

**Goals:**
- A shell that persists until the user quits, and always leaves the terminal in the state it found it.
- One genuinely useful panel end-to-end, including the unhappy paths.
- An async-panel shape (loading / ready / error / stale) that panel #2 can follow without redesign.
- Still zero dependencies beyond `ink` and `react`.

**Non-Goals:**
- A panel framework, registry, or layout system. One panel does not justify an abstraction.
- Navigation, focus management, or panel-scoped keybindings — with a single panel, all keys are global.
- Automatic polling on a timer.
- Configurable location (file, flag, or env).
- Tests. Deliberately deferred; see Risks.

## Decisions

**Panel-first, not framework-first.** Build the weather panel concretely and extract shared shell pieces when a second panel proves what is actually shared. The alternative — designing a panel contract now — means guessing the contract before any panel exists, and the guess would be shaped by a sample size of one anyway.

**Persistence comes from `useInput`, not a keep-alive.** Ink puts stdin into raw mode and attaches a ref'd `data` listener when `useInput` is mounted, which is enough to hold the event loop open. Quitting calls `exit()` from `useApp()`, which unmounts the tree, releases stdin, drains the loop, and yields exit code 0.
- *Alternative:* an explicit `setInterval` or an unresolved promise to hold the process open — unnecessary once there is real input handling, and it would need tearing down anyway.
- *Consequence:* the quit binding is not a nicety layered on top of persistence; it is the same mechanism. There is no intermediate state where the app persists but cannot be quit.

**Alt-screen is entered in `cli.tsx`, before `render()`, and left after `waitUntilExit()`.** Writing `\x1b[?1049h` (alt buffer) and `\x1b[?25l` (hide cursor) before the first Ink frame ensures nothing paints into the user's scrollback. Restoration writes `\x1b[?1049l` and `\x1b[?25h`.
- *Alternative:* entering alt-screen from inside a React effect — rejected. It races with Ink's first paint and scatters terminal-state ownership across the component tree. Terminal state is a process concern, so it lives at the process boundary.

**Restoration is idempotent and registered on every exit path.** A single `restore()` function guarded by a "already restored" flag, invoked from: the normal `waitUntilExit()` resolution, `process.on('exit')`, `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection`. The `exit` handler can only do synchronous work, which a `process.stdout.write` of a short string satisfies.
- *Rationale:* this is the highest-consequence detail in the change. A missed path leaves the user staring at a blank alt buffer with no cursor and no obvious way back (`reset` is the escape hatch). Ink handles Ctrl-C by unmounting when `exitOnCtrlC` is on, so that path funnels through the normal resolution — but the handler is registered regardless rather than relying on that.
- *Consequence:* on `uncaughtException` the app must restore the terminal, print the error to the restored primary buffer, and exit non-zero. An error swallowed by the alt buffer is invisible.

**Root layout is sized to the viewport and tracks resize.** The root `<Box>` takes explicit `width`/`height` from `useStdout()`'s `stdout.columns`/`stdout.rows`, updated from a `resize` listener.
- *Rationale:* alt-screen has no scrollback. Content taller than the terminal cannot scroll, and Ink's frame diffing smears when it overflows. Bounding the root is what keeps the render correct rather than merely tidy.

**Weather source: Open-Meteo.** No API key, stable JSON, and a companion geocoding API when configurable location arrives later.
- *Alternatives:* **wttr.in** — zero-config and auto-geolocates, but it is one hobbyist-run host, rate-limited and occasionally down; too thin a foundation for a spec'd capability. **api.weather.gov** — no key but US-only and a two-hop lookup. **OpenWeatherMap** — requires an API key, which drags secret management, a config surface, and a "key missing" error state into a change that is really about lifecycle. Rejected on scope.
- *Consequence:* the app takes a runtime dependency on `api.open-meteo.com` and must stay usable when it is unreachable.

**Location is a hardcoded lat/lon constant, and the spec says so.** Deciding between a config file, a CLI flag, and an in-app settings panel is a real decision that should be made when there is enough app to judge it — not blind, at panel #1. Keeping it a named constant next to the units constant makes the later change a small one.

**Units and conditions text.** Request Fahrenheit explicitly via the API's `temperature_unit` parameter rather than converting locally. Open-Meteo returns a numeric WMO weather code, so a small local lookup table maps the code to human text ("Partly cloudy"); unmapped codes fall back to displaying the raw code rather than crashing or showing nothing.

**The panel owns its own fetching.** A hook local to the weather panel holds the state machine and calls the client. No store, context, or shared data layer.
- *Rationale:* a data layer exists to coordinate between consumers, and there is exactly one consumer. Introducing one now would be inventing a contract with no second party to negotiate against.

**Four display states, with stale as a first-class one:**

```
  LOADING ──▶ READY ◀──refresh ok──┐
     │          │                  │
     │          └──refresh fails──▶ STALE (last good reading + warning)
     │                                 │
     └──first fetch fails──▶ ERROR  ◀──┘ (refresh from stale can also fail)
```

A refresh failure after a successful fetch must keep the previous reading on screen with a staleness marker. Blanking a panel because one poll failed makes the app less useful than a frozen number, and this is the behaviour that is easy to omit and hard to notice.

**Requests are bounded and refreshes cannot overlap.** Every request carries `AbortSignal.timeout(...)` so a hung connection cannot leave the panel in LOADING forever, and `r` is ignored while a request is in flight rather than starting a second one. In-flight requests are aborted on unmount so no state update lands after teardown.

## Risks / Trade-offs

- [A missed exit path wedges the user's terminal in the alt buffer] → Single idempotent `restore()` registered on normal exit, `exit`, `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection`; restoration is a spec-level requirement with its own scenarios, not an implementation detail. Manually verified against each path, including a deliberately thrown error.
- [Content taller than the viewport smears in alt-screen] → Root box bound to `stdout.rows`/`stdout.columns` with a resize listener; the panel's content is a handful of lines, well inside any realistic terminal.
- [Open-Meteo unreachable, slow, or shape-changed] → Explicit ERROR and STALE states, a request timeout, and defensive parsing that treats a missing or unexpected field as an error rather than rendering `undefined`.
- [No tests, on exactly the code where tests pay] → Accepted for this change. Input handling and async state machines are prime test targets and `ink-testing-library` exists, but choosing a runner and a network-mocking strategy is its own decision. Recorded as the natural follow-on change; every scenario in the specs is written to be directly testable when that lands.
- [Hardcoded location is embarrassing within a week] → Accepted and stated in the spec as a known limitation rather than hidden. Isolated to a constant so the follow-on change is small.
- [Panel-first means a refactor when panel #2 arrives] → Accepted deliberately. The refactor is cheap at two panels and the abstraction is better informed; guessing the contract now is the more expensive mistake.

## Migration Plan

No data or users to migrate. The user-visible change is that `npm start` now takes over the terminal and stays running instead of printing a line and returning to the prompt; `q` returns to the shell. The README's "You should see a green Hello, world ... after which the process exits cleanly" becomes wrong and must be updated in this change.

Rollback is `git revert` — nothing persists outside the process.

## Open Questions

- None blocking. Automatic refresh on a timer, configurable location, and a test harness are all identified as follow-on changes rather than unknowns.
