## Why

The app is only runnable by cloning the repo, installing dependencies, and running `npm run build && npm start`. Nothing about it is distributable: `package.json` carries `"private": true`, `"version": "0.0.0"`, no `bin`, no `files`, and no license — so `npm publish` would refuse to run, and if it did run it would ship the wrong contents.

The eventual goal is publishing from CI on every green push to `main`. This change deliberately does *not* do that. Two reasons, and the second is the important one:

1. **npm's trusted publishing (OIDC) is configured per package on npmjs.com, and that settings page does not exist until the package does.** A CI-first approach has to bootstrap through a token it would then throw away, or through a manual publish anyway.
2. **Whether a full-screen TUI even survives being installed from a registry is unverified.** Every launch path today is `node dist/cli.js` from a repo checkout with a real TTY. An installed executable is a different path: a shebang has to survive compilation, a `bin` symlink has to resolve, and `npx` in a pipe or a CI log has no TTY at all — where [`src/cli.tsx`](../../../src/cli.tsx) currently writes alternate-buffer escape codes unconditionally. Building a release pipeline before knowing the artifact works is automating an unknown.

So: prove the artifact by hand, then automate delivery. The follow-up change `publish-from-ci` is already on the board and every deferred question is recorded there and in this change's Open Questions.

## What Changes

- **Add an `npm-distribution` capability.** The project becomes a publishable npm package: `@rmacshane-lw/russ-panel-tui`, installing a single executable named `russ-panel`. First published version is `0.0.1`.
- **The tarball ships `dist/` only.** An allowlist (`"files": ["dist"]`), not an ignore file. Measured today, omitting it would publish ~850K instead of ~104K, and — the actual reason it matters — would publish `openspec/` (336K of internal planning documents) and `.claude/` (140K of agent configuration) to a public registry, permanently, on every version.
- **No source maps, no `src/` in the tarball.** Stack traces from an installed copy will point at compiled `dist/*.js`. Accepted: 16 files of readable compiled output plus a line number is enough to locate a fault, the beneficiary of source maps is a maintainer debugging a machine they cannot reach, and `.map` files are inert unless the process also runs with `--enable-source-maps`. Additive later, in any version, non-breaking.
- **The entry point becomes directly executable.** A `#!/usr/bin/env node` shebang leads `src/cli.tsx`, and `dist/cli.js` is exposed through `bin`. `node dist/cli.js` keeps working; `russ-panel` joins it.
- **Fix non-interactive launches — two independent defects, one on each stream.** Reachable today only by deliberately piping the app; reachable *by accident* the moment `npx @rmacshane-lw/russ-panel-tui` appears in a script, a CI job, or a `| head`. Same shape as the latent weather-state defects that `add-configurable-location` fixed because publishing made them reachable. Both reproduced against the real build (design.md decision 9):
  - **Non-TTY stdout** — [`src/cli.tsx`](../../../src/cli.tsx) calls `enter()` before the first frame with no check, and `src/terminal.ts` writes escape sequences unconditionally, so alternate-buffer and cursor codes land in whatever captured the output. Fixed by gating on `process.stdout.isTTY`.
  - **Non-TTY stdin** — the app's `useInput` calls put stdin in raw mode, and Ink throws `Raw mode is not supported on the current process.stdin` when `stdin.isTTY` is false, surfacing a React stack trace. Unaffected by the stdout gate: different stream, different code, inside a dependency. Fixed by refusing to start — one readable line on stderr and a non-zero exit, checked before `enter()`. A script and a CI job both lack a stdin, so this is the half that most of the newly reachable invocations actually hit.
- **Add the publishable metadata a public package needs**: `description`, `keywords`, `author`, `license`, `repository`, `bugs`, `homepage`, `engines: {node: ">=22"}` matching Ink 7's own floor, and `publishConfig: {access: "public"}` — without which a scoped package's first publish fails against a paid-plan requirement.
- **Add a `LICENSE` file.** None exists. Publishing without one leaves the package's terms undefined, and npm surfaces the license prominently.
- **Add a `prepublishOnly` guard that rebuilds and retests.** `dist/` is gitignored (`.gitignore:83`), so the working tree can hold a stale or absent build indefinitely. A manual publish is exactly the moment that bites. The guard makes shipping a stale `dist/` impossible rather than merely unlikely.
- **Validate locally through `npm pack` before publishing at all.** The tarball is built, its contents inspected, and installed globally from the `.tgz`. This exercises the real install path — shebang, `bin` symlink, `PATH` resolution, TUI launch — with no registry involvement and no version numbers consumed. Published versions are immutable and unpublishing is restricted after 72 hours, so the cheap loop runs first.
- **Document installation in the README.** It currently only explains cloning.

### Non-goals

- **No CI/CD publishing.** The whole point of the phasing. `.github/workflows/ci.yml` is not modified by this change — it keeps testing, and it does not publish.
- **No git tag.** Tagging is only meaningful once a release is automated and reproducible from a ref. Tagging by hand alongside a manual publish adds a step that can silently disagree with what was shipped.
- **No OIDC trusted publishing, no stored npm token, no GitHub secret, no Environment.** This change authenticates with an interactive `npm login` on the maintainer's own machine and stores no credential anywhere in the repo.
- **No provenance attestation.** Not a decision — it is *impossible* here. Provenance requires an OIDC-verified CI runner. The badge simply will not appear on `0.0.1`, and that is expected rather than a defect.
- **No version-bump automation, no changelog generation, no conventional-commit adoption, no dist-tags or prerelease channels.** `0.0.1` is typed by hand into `package.json`.
- **No `main` or `types` field, and no type declarations in the tarball.** This is a terminal application, not a library. Nothing imports it. Adding an import surface would create a compatibility promise with no consumer.
- **No CLI flags, no `--version`, no `--help`.** Worth having, unrelated to distribution, and the app's key handling is the wrong place to litigate it inside this change.
- **No Windows support claim.** Untested. `engines` constrains Node, not platform.

## Capabilities

### New Capabilities

- `npm-distribution`: what the published package is and what it contains — package identity and scope, the executable name installed onto `PATH`, the tarball allowlist and the exclusion of internal planning material, the publishable metadata and license, the freshness guard that prevents shipping a stale build, and the local `npm pack` validation loop that must pass before any registry publish.

### Modified Capabilities

- `tui-shell`: gains a new requirement, `Interactive input is required to run` — a launch with a non-interactive stdin refuses with a readable diagnostic and a non-zero exit instead of throwing from inside the rendering library. `Application entry point` gains a second, equal launch path — an installed `russ-panel` executable — and the requirement that the compiled entry point carries an interpreter directive and is executable. `Alternate screen buffer` and `Terminal restoration on every exit path` become conditional on stdout being a TTY, so a piped or redirected run does not emit escape sequences into captured output. `Build step` gains the requirement that the compiled output is what ships and is rebuilt from sources at publish time.

## Impact

**Affected code**

- `package.json` — remove `private`; set the scoped `name` and `version`; add `bin`, `files`, `engines`, `publishConfig`, `description`, `keywords`, `author`, `license`, `repository`, `bugs`, `homepage`, and `prepublishOnly`. Deliberately no `main`, no `types`.
- `src/cli.tsx` — shebang as line 1; a `process.stdin.isTTY` refusal guard above the `enter()` call.
- `src/terminal.ts` — `enter()` becomes a no-op when stdout is not a TTY, which leaves `restore()` inert via its existing `active` guard, keeping `restore()` idempotent as its existing requirement demands.
- **New**: `LICENSE`.
- `README.md` — an install-and-run section for the published package.

**No new dependencies, runtime or dev.** Everything here is `npm` and `tsc` behaviour that already exists.

**Almost no new spec surface for the app's behaviour.** The TUI itself does not change: interactive launches behave identically. What changes is how it is packaged, plus two genuine bug fixes on the non-interactive paths that packaging makes reachable — which do add one requirement to `tui-shell`, covering a launch the app previously handled by crashing.

**Registry side effects, and their reversibility.** `@rmacshane-lw/russ-panel-tui@0.0.1` becomes public and permanent. Version numbers are immutable — a botched publish burns that number rather than being overwritten — and unpublishing is restricted after 72 hours. This is why `npm pack` validation precedes publishing and why the first version is `0.0.1` rather than `0.1.0`: it is deliberately cheap to supersede.

**Verified against the live registry.** `@rmacshane-lw` is an existing personal scope on the `rmacshane-lw` account; nothing named `russ-panel-tui` exists in it; and `russ-panel` collides with nothing on npm or on the maintainer's `PATH`.

**User-visible.** A new, easier install path. Nothing existing breaks: `git clone` → `npm run build` → `npm start` continues to work unchanged.
