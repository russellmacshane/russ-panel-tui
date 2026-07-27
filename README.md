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
```
