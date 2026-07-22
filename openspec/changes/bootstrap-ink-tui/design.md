## Context

Greenfield repo, no `package.json` yet. Node 24 and npm 11 are installed; no bun/pnpm/yarn present. The end goal is a "TUI Command Center" built in React through the OpenSpec workflow. This first change only needs to prove the toolchain and establish a shell; it should optimize for a simple, low-friction edit-run loop ("go slow") over production polish.

## Goals / Non-Goals

**Goals:**
- A running React TUI rendering "Hello, world".
- A minimal, conventional project layout future panels plug into.
- Plain Node + npm toolchain — nothing new to install globally.

**Non-Goals:**
- Any actual command-center panels, input handling, or navigation.
- Packaging/publishing a binary, `bin` linking, or global install.
- Tests, CI, linting, hot-reload dev tooling (deferred to later changes).

## Decisions

**Framework: Ink (v7).** React reconciler for the terminal, flexbox layout via Yoga, runs on plain Node. It is the de facto standard (Claude Code, Gemini CLI, Prisma, Wrangler are built on it) and has a large component ecosystem for later panels.
- *Alternatives:* **OpenTUI** (`@opentui/react`) — a Zig-core renderer, exciting but at `0.4.x`, a moving target, and steers toward Bun; revisit for heavy/animated UIs later. **react-blessed** — legacy, blessed itself is semi-abandoned; rejected.

**Language/runtime: TypeScript compiled with `tsc`.** Sources in `src/`, output to `dist/`, run with `node dist/cli.js`.
- *Alternative:* `tsx` (no build step) is simpler but a `tsc` build gives type-checking up front and a more production-shaped loop; chosen deliberately by the user.

**Package manager: npm.** Already installed, zero setup, matches the plain-Node choice.

**React 19 + `jsx: "react-jsx"`, ESM (`"type": "module"`, `module: "nodenext"`).** Ink 7 is ESM-only; matching module settings avoids interop friction.

## Risks / Trade-offs

- [Ink 7 / React 19 peer-version mismatch] → Pin `ink@7` and `react@19`; verify install resolves peers cleanly.
- [ESM + `tsc` config drift causing runtime import errors] → Use `module: "nodenext"`/`moduleResolution: "nodenext"` and confirm `node dist/cli.js` runs before marking done.
- [Build step adds friction vs. `tsx`] → Accepted; a single `npm run build && npm start` is cheap at this size, and a watch mode can be added later.

## Open Questions

- None blocking. A `dev`/watch script and `bin` entry are deferred to a later change when the app is worth launching frequently.
