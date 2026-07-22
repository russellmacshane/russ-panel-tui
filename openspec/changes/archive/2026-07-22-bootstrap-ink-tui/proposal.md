## Why

The repo is an empty shell whose goal is a "TUI Command Center" driven by OpenSpec and Claude. Before any panels or features can exist, there needs to be a running React-based TUI to build on. This change stands up the smallest possible working app — a "hello world" — so the toolchain, project structure, and run loop are proven and every later feature is just another component dropped into a known shell.

## What Changes

- Introduce **Ink** (React for the terminal) as the TUI framework.
- Add a Node/TypeScript project: `package.json` (ESM), `tsconfig.json`, dependencies (`ink`, `react`) and dev deps (`typescript`, `@types/react`).
- Add source structure: `src/app.tsx` (the root `<App>` component) and `src/cli.tsx` (the entry point that calls Ink's `render`).
- Add a `tsc` build step compiling `src/` → `dist/`, plus `build` and `start` npm scripts.
- Running the app renders a green "Hello, world" to the terminal and exits cleanly.

## Capabilities

### New Capabilities
- `tui-shell`: The runnable TUI application shell — an Ink/React entry point that mounts a root component, renders it to the terminal, and exits cleanly. This is the foundation future command-center panels attach to.

### Modified Capabilities
<!-- None — this is the first change; no existing specs. -->

## Impact

- **New dependencies**: `ink@7`, `react@19`; dev: `typescript`, `@types/react`.
- **New files**: `package.json`, `tsconfig.json`, `src/app.tsx`, `src/cli.tsx`.
- **Build output**: `dist/` (gitignored; the repo already ignores build artifacts).
- **Runtime**: Node 24 (already installed), npm (already installed). No new global toolchain.
- No existing code or specs are affected.
