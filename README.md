# russ-panel-tui

Goal of this project is to create a TUI Command Center using openspec and claude as the primary drivers.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) on plain Node + TypeScript.

## Install

Published as [`@rmacshane-lw/russ-panel-tui`](https://www.npmjs.com/package/@rmacshane-lw/russ-panel-tui) on npm. Requires Node >=22.

```sh
npm i -g @rmacshane-lw/russ-panel-tui   # install globally
russ-panel                              # run it
```

Or run it without installing:

```sh
npx @rmacshane-lw/russ-panel-tui
```

## Run it from a checkout

```sh
npm install     # install dependencies
npm run build   # compile src/ -> dist/ with tsc
npm start       # run the app (node dist/cli.js)
```

The app takes over your terminal (alternate screen buffer) and stays running until you quit. It restores your screen and scrollback on the way out.

| Key   | Action                                          |
| ----- | ------------------------------------------------ |
| `q`   | quit (normal mode only)                          |
| `r`   | refresh the weather panel                        |
| `l`   | open the location search                         |
| `Esc` | cancel the location search, changing nothing     |

Ctrl-C quits from any mode, including while the location search is open.
San Antonio, Texas is the default location until you set one with `l`.

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

**Setting the location** — press `l` to open the location search. Type a city name and press Enter to search (typing alone does not trigger a request); pick a result with the arrow keys and Enter, or press Escape to cancel and leave things as they were. The selected location is used immediately and saved for next launch. San Antonio, Texas is the default and is only ever a fallback: until you pick a location nothing is written to disk.

## Configuration

The location is stored at `$XDG_CONFIG_HOME/russ-panel-tui/config.json`, falling back to `~/.config/russ-panel-tui/config.json` when `XDG_CONFIG_HOME` is unset.

```json
{
  "location": {
    "name": "San Antonio",
    "admin1": "Texas",
    "country": "United States",
    "latitude": 29.42412,
    "longitude": -98.49363,
    "timezone": "America/Chicago"
  }
}
```

`name`, `latitude`, and `longitude` are required; `admin1`, `country`, and `timezone` are optional — a city-state like Singapore has no `admin1`. The location lives under a `location` key so other settings can be added later without reshaping the file.

If the file doesn't exist, the app runs on the default location and writes nothing. If it exists but is malformed or unreadable, the app falls back to the default, shows a one-line warning, and leaves the file untouched until you pick a new location through `l`. If saving a new selection fails (an unwritable config directory, say), the selection still applies for the current session, and a warning notes that it won't be remembered.

## Layout

```
src/
  cli.tsx       entry point; owns terminal state and exit paths
  app.tsx       shell: viewport sizing, active location, key bindings, footer
  terminal.ts   alternate screen buffer enter/restore
  config.ts     default location, units, request timeout
  location/     geocoding client, location picker, config file read/write
  shell/        input modes, notice area, viewport-bounding helpers
  weather/      Open-Meteo client, state machine, panel
  *.test.ts(x)  tests, colocated with what they cover
test/
  support/      shared test harness (fake terminal, Ink render, fetch stub)
```
