## Context

The project has no tests. The `add-persistent-weather-panel` change deferred them deliberately, naming the two blocking decisions: a **runner** and a **network-mocking strategy**. Both are resolved here.

Current state: Node 24, `ink ^7.0.0`, `react ^19.0.0`, TypeScript with `nodenext` ESM, `tsc` to `dist/`. Two runtime dependencies. The dependency count is a bootstrap artifact, not a constraint — confirmed with the author — so "avoids a new dependency" carries no weight in the decisions below.

Two properties of the existing code shape everything:

1. **Every file with real logic is a `.ts` file.** Only `app.tsx` and `weather-panel.tsx` contain JSX. So the "do we need a transform?" question gates only the render assertions, not the state machine, parsing, or terminal escape sequences.

2. **The network seam is already a global.** `src/weather/client.ts:34` calls `globalThis.fetch` directly; nothing imports an HTTP client. The hardest part of testing ESM — module mocking — simply does not arise. Replacing one global puts the entire weather stack under test, exercising the real parser and the real state machine together.

```
   ┌─────────────┐    ┌──────────┐    ┌──────────────┐    ┌────────────┐
   │ use-weather │───▶│  client  │───▶│ parseReading │    │ globalThis │
   │ state mach. │    │   .ts    │    │  (private)   │    │  .fetch    │
   └─────────────┘    └──────────┘    └──────────────┘    └─────┬──────┘
          ▲                                                     │
     tests drive                                        ◀── STUB HERE ──▶
     from up here                                     the only seam needed
```

## Goals / Non-Goals

**Goals:**

- Lock down the loading → ready → stale → error state machine, which the prior design doc flagged as *"the behaviour that is easy to omit and hard to notice."*
- Produce reusable harness primitives, so testing panel #2 is a morning's work rather than a week's.
- Cover the existing `weather-panel` and `tui-shell` scenarios where reachable, and record where not.
- Run in CI on every push.

**Non-Goals:**

- Process-level (subprocess) tests of exit paths and alternate-screen restoration.
- Adopting Ink 7's native `alternateScreen` option.
- Any change to `src/`.
- Coverage thresholds.
- Auto-refresh, configurable location, or panel abstraction — all separate changes.

## Decisions

### 1. Vitest as the runner

**Chosen** over Node's built-in `node:test`.

Node 24 strips TypeScript types natively but **does not transform JSX**, so `node:test` cannot load `app.tsx` or `weather-panel.tsx` directly. The workarounds were: test only the `.ts` files and forgo render assertions, or run `node --test` against compiled `dist/` output. Both existed principally to avoid adding a dependency — a constraint that turned out not to apply. Vitest also brings a watch mode and snapshot support that suit a four-state panel, and is the runner this project would want at six panels regardless.

Rejected `node:test` + `--experimental-test-module-mocks`: experimental, and made unnecessary by decision 2.

### 2. Stub `globalThis.fetch`, default-deny

**Chosen** over mocking the `client` module, and over injecting a fetcher into `useWeather`.

Stubbing the global intercepts the real boundary, so tests exercise `parseReading`'s defensive branches and the state machine's stale/error branching *in the same test* — which is exactly where a regression would hide. Module mocking would bypass the parser entirely and couple tests to import paths. Dependency injection would change production code to serve tests, and the current zero-argument `useWeather()` API is genuinely nicer.

**Default-deny is the important half.** `src/app.tsx:43` calls `useWeather()` unconditionally, and `src/weather/use-weather.ts:64-72` fires a request from a mount effect — so *any* render of `<App>` in a test reaches `api.open-meteo.com`. Left unhandled that means: slow tests, failures offline, CI hammering a free no-key public API on every push, an 8-second `AbortSignal.timeout` stalling a test on a hung socket, and late resolutions landing `setState` in the middle of the *next* test. Therefore the global stub is installed in Vitest `setupFiles` and **throws `unexpected fetch: <url>`** unless the test explicitly programs a response. Accidental network access becomes a loud, immediate failure rather than intermittent flakiness.

A deferred-promise stub (resolve/reject on demand) is the primitive that unlocks the in-flight de-duplication test, the abort-on-unmount test, and the stale-then-recover sequence.

### 3. A first-party Ink render harness, not `ink-testing-library`

**Chosen** after reading both packages' published source.

`ink-testing-library@4.0.0` is *mechanically* compatible with Ink 7: all six render options it passes still exist under the same names, `debug: true` sets `unthrottled` (`ink/build/ink.js:193`) so every render writes a full frame and `lastFrame()` works, and it sets `stdin.isTTY = true`, which is what `isRawModeSupported` reads (`ink/build/components/App.js:121`) — so `useInput` works and keybinding tests are safe.

It is nonetheless the wrong choice here. It was last published **2024-05-22** against `ink ^5.0.0` / `react ^18.3.1`, and declares **no `ink` peerDependency**, so npm will never warn about a version mismatch. More concretely, four hardcoded details block work this project needs:

| `ink-testing-library` detail | Consequence for this app |
| --- | --- |
| `get columns() { return 100 }`, and **no `rows` property at all** | `measure()` in `src/app.tsx:15-20` always yields 100×24 (`rows` falls through to our own `FALLBACK_ROWS`). Terminal size cannot be varied, so "fills the terminal on launch" is vacuous. |
| no `isTTY` on its fake stdout | `interactive = interactive ?? (!isInCi && Boolean(stdout.isTTY))` resolves **false** (`ink/build/ink.js:707`), so Ink skips its resize subscription (`ink.js:264`). Our own listener in `useViewport` still attaches, but `columns` is a constant getter — firing `resize` changes nothing. The resize scenario is unwritable. |
| `exitOnCtrlC: false`, hardcoded | The `tui-shell` scenario "Quitting with Ctrl-C" tests a mechanism the library switches off. |
| returns only `{rerender, unmount, cleanup, stdout, stderr, stdin, frames, lastFrame}` | Drops `waitUntilExit`, and predates Ink 7's **`waitUntilRenderFlush()`** — precisely the tool for awaiting async transitions. Without it, tests fall back to `await delay(50)`, the classic source of flaky Ink tests. Ink's own docs also note `act()` may be needed under `concurrent`. |

The library is 96 lines. Ours is the same idea with three changes — settable `columns`/`rows` plus a real `resize` emit, `isTTY: true` on the fake stdout, and `waitUntilRenderFlush`/`waitUntilExit` passed straight through. Roughly 45 lines, no stale dependency, and it unblocks three scenarios already written into the specs. Since `test/support/` was going to be the reusable core of this change anyway, the harness belongs there.

**Trade-off accepted:** we now own a small amount of Ink-version-coupled code. It is far less coupled than the alternative, because we control it.

### 4. Determinism: no assertions on wall-clock output; pin `TZ=UTC`

`src/weather/client.ts:84` stamps `retrievedAt: new Date()`, and `src/weather/weather-panel.tsx:71` formats it with `toLocaleTimeString()` — output that varies by machine clock, timezone, and locale. A naive assertion passes locally and fails in CI.

**Chosen:** tests assert that a timestamp line is *present*, not what it reads, and `vitest.config.ts` pins `TZ=UTC` so any incidental formatting is stable.

**Rejected:** making the clock injectable. It is the stronger option and would allow exact assertions, but it changes production code to serve tests for a value that is not load-bearing. Revisit if timestamps ever become behaviour rather than decoration.

### 5. Test the timeout *path* by error name, not by real timers

`src/weather/client.ts:33` uses `AbortSignal.timeout(8000)`. Waiting that out, or faking timers around an API that uses real ones, is disproportionate. But `describeError` (`src/weather/use-weather.ts:77-96`) dispatches on `error.name` — so a stub that rejects with `new DOMException(..., 'TimeoutError')` exercises the whole timeout path in milliseconds.

**Accepted gap:** this verifies the handling, not that `REQUEST_TIMEOUT_MS` is actually wired into the signal. That is a much smaller thing to leave uncovered than the alternative cost.

### 6. Two tiers, not three

```
  ┌─ Tier 1 · unit ──────── weather stack (fetch stub) + terminal.ts
  │                         → the state machine, parsing, escape sequences
  ├─ Tier 2 · component ─── Ink harness + fake stdout + stdin.write
  │                         → 4 render states, footer, keybindings,
  │                           size fallback, resize
  └─ Tier 3 · process ───── DEFERRED. spawn dist/cli.js, assert raw
                            stdout bytes on q / Ctrl-C / SIGTERM / crash
```

Tier 3 guards the risk the prior design doc ranks first — a wedged terminal. It is deferred anyway, for a reason that emerged during this investigation: **Ink 7 ships `alternateScreen?: boolean`** natively ("Render the app in the terminal's alternate screen buffer... the original terminal content is restored when the app exits", `ink/build/render.d.ts`), plus `resolveAlternateScreenOption` (`ink.js:709`). Ink's `getWindowSize` also already implements the 80×24 fallback that `measure()` duplicates (`ink/build/utils.js:15-16`).

That overlaps `src/terminal.ts` in full and a chunk of `src/cli.tsx`. Building fragile subprocess tests that pin a hand-rolled contract we may delete is the wrong order of operations. Tier 2 additionally cannot substitute: it drives Ink through a fake stdout, so it observes frame content, never the real terminal's escape-sequence stream.

Tier 1 still unit-tests `src/terminal.ts`'s emitted sequences and its idempotency, because that is cheap and is an explicit spec requirement.

### 7. Layout

Test files colocated with sources as `*.test.ts(x)`; shared primitives in `test/support/`. Colocation keeps a panel's tests next to the panel — which matters once there are several — while the shared harness stays in one obvious place for panel #2 to find.

## Scenario coverage map

The existing specs are already WHEN/THEN pairs, so the mapping is close to 1:1. Recorded honestly, including what is missed:

| Spec | Scenarios | Covered here | Deferred to Tier 3 | Not automatable |
| --- | --- | --- | --- | --- |
| `weather-panel` | 16 | 15 | 0 | 1 |
| `tui-shell` | 17 | 8 | 6 | 3 |

**`weather-panel` — the one gap:** "No credentials required" is partly a negative claim about the environment; tests assert the request URL carries no key or token, which is as far as a test can go.

**`tui-shell` — deferred to Tier 3 (6):** process exits with code 0; process does not exit on its own; restoring after a normal quit at the real terminal; restoring after SIGINT/SIGTERM; restoring after an unhandled error with the message still readable; taking over the screen on launch.

**`tui-shell` — not automatable (3):** "scrollback is left untouched" and "app keeps responding to input over time" remain manual checks. "Building the project" is covered by CI running the build, not by a test.

Note that "Restoring after an unhandled error" is the scenario `src/cli.tsx:18-24` exists for — it restores *before* printing so a crash stays readable. Ink's docs state it "treats alternate-screen teardown output as disposable... does not preserve or replay teardown-time frames, hook writes, or `console.*` output after restoring the primary screen," which suggests the native option may **not** subsume that specific guarantee. Unverified: this change inspected Ink's option surface, not its `uncaughtException` behaviour. So `src/terminal.ts` is not obviously deletable, and this is the first question the follow-on change must answer.

## Risks / Trade-offs

- **[A stale-dependency problem traded for owned code]** → The Ink harness couples us to Ink's render options. Mitigated by keeping it to ~45 lines, in one file, exercising only documented options — and by the fact that the rejected alternative is coupled to Ink *5*.
- **[Tests that hit the real network would be slow and flaky, and rude to a free API]** → Default-deny fetch stub in global setup; unprogrammed requests throw with the offending URL.
- **[Async assertions in Ink are a classic flakiness source]** → Use Ink 7's `waitUntilRenderFlush()` rather than sleeps; this is a primary reason for decision 3. Note Ink throttles renders at `maxFps: 30` by default, so frame-level assertions without an explicit flush can coalesce.
- **[Tier 3 omission leaves the highest-severity failure mode unguarded]** → Accepted and stated, not hidden. Tier 1 covers `terminal.ts`'s sequences and idempotency; the residual risk is the wiring in `cli.tsx`, which is small, stable, and manually verified. Revisited by the `alternateScreen` follow-on.
- **[Module-level state leaks between tests]** → `src/terminal.ts:11` holds an `active` flag and `src/config.ts` is frozen at import. The idempotency test must control module state explicitly rather than rely on ordering.
- **[Tests calcify the current design and make the panel refactor harder]** → Real, and the reason tests are aimed at spec scenarios rather than at internals. A test that asserts observable behaviour survives the refactor; one that asserts private structure does not.
- **[A harness built for one panel fits the second badly]** → Accepted. Two consumers is the earliest point the abstraction can be judged honestly, which is the same reasoning the panel-first decision used.

## Migration Plan

Additive. No runtime behaviour changes, nothing ships to users, `src/` is untouched. Rollback is deleting the test files, `test/support/`, `vitest.config.ts`, the CI workflow, and the `package.json` additions.

Sequencing matters within the change: the support primitives land before the tests that consume them, and the weather-stack tests (highest value, no harness dependency) land before the component tests.

## Open Questions

- **Does Ink 7's `alternateScreen` preserve crash visibility?** Specifically, does an `uncaughtException` still surface a readable error after teardown, or is `src/cli.tsx:18-24`'s restore-before-print still required? Non-blocking for this change — it determines the shape of the follow-on, and is a ~10-minute spike.
- **Snapshots or explicit assertions for the four panel states?** Leaning explicit for the first pass: snapshots on a four-state panel are tempting but tend to be re-approved without being read. Decide when writing them.
- Nothing else blocking.
