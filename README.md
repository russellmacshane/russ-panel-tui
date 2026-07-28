# russ-panel-tui

Goal of this project is to create a TUI Command Center using openspec and claude as the primary drivers.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) on plain Node + TypeScript.

## Run it

```sh
npm install     # install dependencies
npm run build   # compile src/ -> dist/ with tsc
npm start       # run the app (node dist/cli.js)
```

The app takes over your terminal (alternate screen buffer) and stays running until you quit. It restores your screen and scrollback on the way out.

| Key      | Action                    |
| -------- | ------------------------- |
| `q`, Esc | quit                      |
| `r`      | refresh the weather panel |

Ctrl-C also quits.

## Testing

```sh
npm test           # run the whole suite once
npm run test:watch # re-run affected tests as you edit
npm run test:coverage
npm run typecheck  # typecheck sources *and* tests, without emitting
```

No build step is needed — tests run against the TypeScript sources directly.
CI runs the build, the typecheck, and the suite on every push and pull request.

Tests live next to what they test, as `*.test.ts(x)`. The shared harness every
panel is tested with lives in [`test/support/`](test/support/) — a fake terminal
with controllable dimensions, an Ink render wrapper, and a default-deny `fetch`
stub. Start with [`test/support/README.md`](test/support/README.md) before
writing tests for a new panel; it also records why the harness is first-party
rather than `ink-testing-library`.

Two things worth knowing before you write a test:

- **The suite never touches the network.** `globalThis.fetch` is replaced before
  any test runs, and an unprogrammed request throws `unexpected fetch: <url>`
  rather than reaching the real API.
- **Nothing asserts on formatted clock output.** Readings are stamped with
  `new Date()`, so tests check that a timestamp is *shown*, not what it says.
  `TZ` is pinned to UTC so any incidental formatting is stable.

## Panels

**Weather** — current conditions from [Open-Meteo](https://open-meteo.com/), which needs no API key. It fetches once on launch and then only when you press `r`. If a refresh fails, the last good reading stays on screen marked as stale rather than disappearing.

> **Known limitation:** the location is hardcoded. Edit `LOCATION` in [`src/config.ts`](src/config.ts) to point somewhere else. Making it configurable is deferred to a later change.

## Layout

```
src/
  cli.tsx       entry point; owns terminal state and exit paths
  app.tsx       shell: viewport sizing, key bindings, footer
  terminal.ts   alternate screen buffer enter/restore
  config.ts     location, units, request timeout
  weather/      Open-Meteo client, state machine, panel
  *.test.ts(x)  tests, colocated with what they cover
test/
  support/      shared test harness (fake terminal, Ink render, fetch stub)
```
