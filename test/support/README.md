# Test support

Shared primitives for testing this app. Panel #2 should be able to use these
unchanged — if it can't, fix the harness rather than working around it.

| File | What it gives you |
| --- | --- |
| `setup.ts` | Registered as Vitest `setupFiles`. Installs the fetch stub before every test, tears down renders and resets the stub after. Not imported directly by tests. |
| `fetch-stub.ts` | A default-deny replacement for `globalThis.fetch`, plus deferred requests you settle on demand. |
| `fake-terminal.ts` | `FakeStdout` (settable size, real `resize` emit, frame capture) and `FakeStdin`. |
| `render.ts` | `render()` — mounts an Ink component against the fakes. |

## Writing a test

```tsx
import {respondWithJson} from '../../test/support/fetch-stub.js';
import {render} from '../../test/support/render.js';

const harness = render(<MyPanel />, {columns: 100, rows: 30});
await harness.waitUntilRenderFlush();
expect(harness.lastFrame()).toContain('...');
```

Two rules:

1. **Program every request you expect.** An unprogrammed `fetch` throws
   `unexpected fetch: <url>`. Any component that fires a request from a mount
   effect needs a response programmed before it renders.
2. **`await waitUntilRenderFlush()`, never `await delay(50)`.** Ink throttles
   renders at `maxFps: 30`, so frame assertions without an explicit flush can
   coalesce. Sleeps are the classic source of flaky Ink tests.

## Why this replaces `ink-testing-library`

**Do not swap this out for `ink-testing-library` without reading this.** It was
evaluated and rejected; the reasons are structural, not stylistic.

That package was last published **2024-05-22** against `ink ^5` / `react ^18`,
and declares **no `ink` peer dependency**, so npm gives no compatibility signal
against the `ink ^7` this project uses. Four hardcoded details block scenarios
this project's specs already require:

| Its behaviour | What it costs us |
| --- | --- |
| `get columns() { return 100 }`, and no `rows` property at all | `useViewport` in `src/app.tsx` can never see a size we chose, so "fills the terminal" is vacuous and the resize scenario is unwritable. |
| No `isTTY` on its fake stdout | Ink resolves `interactive` to false and skips its resize subscription entirely. |
| `exitOnCtrlC: false`, hardcoded | Switches off the very mechanism the "quitting with Ctrl-C" scenario tests. |
| Returns no `waitUntilExit` and predates Ink 7's `waitUntilRenderFlush()` | Forces `await delay(50)` for async transitions. |

Two further incompatibilities with Ink 7 were confirmed while building this,
which is what settles it:

- **Ink 7 reads stdin via the `'readable'` event and `stdin.read()`**
  (`ink/build/components/App.js:179`), not the `'data'` event an
  `EventEmitter`-based fake provides. Hence `FakeStdin` extends `PassThrough` —
  a real readable stream.
- **`interactive` must be passed explicitly.** Ink's default resolves
  `!isInCi && Boolean(stdout.isTTY)` (`ink/build/ink.js:707`), so under CI
  environment detection it comes out **false**, and a non-interactive Ink skips
  its `resize` subscription (`ink.js:264`). Without forcing `interactive: true`,
  the resize test would pass locally and silently prove nothing in CI.

`render.ts` also disables kitty keyboard detection, which otherwise writes a
`CSI ? u` query into the captured frames and holds a 200 ms timer open waiting
for a reply no fake terminal will send.

**The trade-off:** we own a small amount of Ink-version-coupled code. Accepted
deliberately — it is less coupled than depending on a package pinned to Ink 5,
because we control it. Keep it small, and keep it to documented Ink options.
