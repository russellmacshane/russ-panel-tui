## 1. Executable entry point

- [x] 1.1 Add `#!/usr/bin/env node` as the first line of `src/cli.tsx`, above the existing imports
- [x] 1.2 Run `npm run build` and read the first line of the emitted `dist/cli.js` to confirm `tsc` preserved the directive — do not assume it did
- [x] 1.3 If the directive was stripped, add a build step that prepends it and record the deviation in design.md decision 8; otherwise note the behaviour as confirmed
- [x] 1.4 Confirm `node dist/cli.js` still launches unchanged, so the directive did not break the existing launch path
- [x] 1.5 Add a test asserting the compiled `dist/cli.js` begins with `#!/usr/bin/env node`, so a future compiler or config change cannot silently break the installed command

## 2. Non-TTY terminal handling

Two independent failures — see design.md decision 9. Section 2a covers escape-code pollution on a non-TTY **stdout**; section 2b covers Ink refusing to start on a non-TTY **stdin**. Fixing one does nothing for the other.

### 2a. Non-TTY stdout — no escape sequences in captured output

- [x] 2.1 Gate `enter()` in `src/terminal.ts` on `process.stdout.isTTY`, returning without writing when output is not an interactive terminal
- [x] 2.2 Leave `restore()`'s existing `if (!active) return` guard as the only gate it needs — because a gated `enter()` never sets `active`, restoration is already inert after a non-TTY launch, and no second TTY check should be added
- [x] 2.3 Remove or reword the `enter()` doc comment if it now overstates what the function does
- [x] 2.4 Extend `src/terminal.test.ts`: with `process.stdout.isTTY` falsy, `enter()` writes nothing
- [x] 2.5 Same conditions: `restore()` after a no-op `enter()` writes nothing and does not throw
- [x] 2.6 Assert the existing TTY behaviour is unchanged — the current enter/restore/idempotency tests must still pass with `isTTY` truthy, and set it explicitly rather than relying on the ambient value so the suite behaves the same locally and in CI
- [x] 2.7 Verify `src/cli.tsx`'s crash handler still prints a readable error when output is redirected, since `restore()` is now a no-op on that path

### 2b. Non-TTY stdin — refuse cleanly instead of crashing inside Ink

- [x] 2.8 Reproduce the current failure first, so the fix is verified against observed behaviour: `node dist/cli.js < /dev/null` exits non-zero with Ink's `Raw mode is not supported on the current process.stdin` and a React stack trace
- [x] 2.9 In `src/cli.tsx`, before the `enter()` call, refuse to start when `process.stdin.isTTY` is falsy: write one readable line to `stderr` naming the actual requirement (an interactive terminal), and exit non-zero
- [x] 2.10 Confirm the check sits *above* `enter()`, so the refusal path writes no alternate-screen or cursor sequences to stdout even when stdout is a TTY
- [x] 2.11 Use exactly `process.stdin.isTTY` — the same condition Ink tests at `ink/build/components/App.js:121` — so the guard cannot reject a launch Ink would have accepted
- [x] 2.12 Confirm the message is a plain diagnostic, not a thrown error routed through `crash()`, so no stack trace reaches the user
- [x] 2.13 Add a test that the guard fires when `process.stdin.isTTY` is falsy and does not fire when it is truthy
- [x] 2.14 Confirm an interactive launch is completely unaffected — no extra output, no behaviour change

## 3. Package metadata

- [x] 3.1 Remove `"private": true` from `package.json`
- [x] 3.2 Set `"name": "@rmacshane-lw/russ-panel-tui"` and `"version": "0.0.1"`
- [x] 3.3 Add `"bin": {"russ-panel": "./dist/cli.js"}` — one entry, no alias
- [x] 3.4 Add `"files": ["dist"]`, and deliberately do not create a `.npmignore`
- [x] 3.5 Add `"publishConfig": {"access": "public"}` — without it the first publish of a scoped package fails against a paid-plan requirement
- [x] 3.6 Add `"engines": {"node": ">=22"}`, matching the floor `ink` declares
- [x] 3.7 Add `description`, `keywords`, `author`, `repository` (pointing at `github.com/russellmacshane/russ-panel-tui`), `bugs`, and `homepage`
- [x] 3.8 Confirm no `main` and no `types` field is present, and that the build emits no `.d.ts` files
- [x] 3.9 Add `"prepublishOnly": "npm run build && npm run typecheck && npm test"`, and verify it is `prepublishOnly` rather than `prepack` so the packing loop in section 5 stays fast

## 4. License and documentation

- [x] 4.1 Confirm the license choice with the maintainer — **resolved: MIT**, confirmed 2026-07-31, recorded in design.md decision 12
- [x] 4.2 Add a `LICENSE` file with the standard MIT text, copyright holder `Russ MacShane`, year `2026`
- [x] 4.3 Add `"license": "MIT"` to `package.json` and confirm it agrees with the `LICENSE` file
- [x] 4.4 Add an install section to `README.md`: the package name, `npm i -g @rmacshane-lw/russ-panel-tui`, the `npx` form, the resulting `russ-panel` command, and the Node 22 requirement
- [x] 4.5 Confirm the existing clone-and-build instructions in `README.md` are still accurate after the packaging changes

## 5. Local tarball validation — no registry involvement

- [x] 5.1 Run `npm run build && npm pack` and confirm a `.tgz` is produced
- [x] 5.2 Run `tar -tzf` on the tarball and assert the contents: `dist/`, `package.json`, `README.md`, `LICENSE` — and nothing else
- [x] 5.3 Explicitly confirm the tarball contains no `openspec/`, no `.claude/`, no `src/`, no `test/`, no `*.map`, no `*.d.ts`, and no `tsconfig*.json`
- [x] 5.4 Install globally from the local tarball (`npm i -g ./<tarball>.tgz`) and confirm the install reports no engine or permission errors
- [x] 5.5 Confirm `command -v russ-panel` resolves, and that the target file is executable
- [x] 5.6 Run `russ-panel` in an interactive terminal: the TUI launches, renders, accepts input, and quits cleanly with `q` — verified via a real pty (this sandbox has no attached terminal to drive by hand; a pty gives genuine `isTTY`/raw-mode semantics, not a fake). Worth one manual spot-check by the maintainer before publishing.
- [x] 5.7 Confirm the terminal is left in a sane state after quitting — primary buffer restored, cursor visible, scrollback intact — confirmed via captured escape sequences (`SHOW_CURSOR` then `LEAVE_ALT_SCREEN` at the tail of output)
- [x] 5.8 Non-TTY stdout, interactive stdin: run `russ-panel > out.txt` from a real terminal, quit with `q`, and confirm `out.txt` contains no alternate-screen or cursor escape sequences and the process did not crash
- [x] 5.9 Non-TTY stdin: run `russ-panel < /dev/null` and confirm it refuses with one readable line on stderr, exits non-zero, prints no stack trace, and leaves the terminal untouched — do not use `> out.txt < /dev/null` for this, since redirecting both streams tests 5.8 and 5.9 at once and hides which one failed
- [x] 5.10 Both redirected (`russ-panel > out.txt < /dev/null`, the shape a script or CI job actually produces): confirm the refusal reaches stderr, `out.txt` is empty of escape sequences, and the exit status is non-zero
- [x] 5.11 Uninstall the global package, then repeat 5.4–5.6 once from a clean state to confirm the install path does not depend on leftover artifacts
- [x] 5.12 Iterate sections 1–4 and re-run this section until it passes fully; nothing proceeds to section 6 while any check here fails — passed on the first pass, no iteration needed

## 6. Publish

- [x] 6.1 Run `npm login` and confirm with `npm whoami` that the authenticated account is `rmacshane-lw`
- [x] 6.2 Run `npm publish --dry-run` and confirm the reported file list matches what section 5 verified
- [x] 6.3 Confirm the version being published is `0.0.1` and that no `@rmacshane-lw/russ-panel-tui` version exists on the registry yet
- [x] 6.4 Run `npm publish`, and confirm `prepublishOnly` ran the build, typecheck, and tests before the upload — published via a granular access token (bypass-2FA) since the account uses passkey-based 2FA with no OTP path
- [x] 6.5 Confirm the package page on npmjs.com shows the expected name, version, license, repository link, and file list — confirmed by the maintainer directly on npmjs.com

## 7. Post-publish verification

- [x] 7.1 From a directory outside the repository, run `npx @rmacshane-lw/russ-panel-tui` and confirm the TUI launches
- [x] 7.2 Install globally from the registry on a clean environment (a container or a machine that has never had the local tarball) and confirm `russ-panel` launches
- [x] 7.3 Confirm the published tarball contents by fetching it from the registry rather than trusting the local `npm pack` output
- [x] 7.4 Confirm no provenance badge appears, as expected for a manual publish, so its absence is not later mistaken for a defect
- [ ] 7.5 Confirm `.github/workflows/ci.yml` is unmodified by this change and still passes on the branch — file is unmodified (confirmed); "still passes on the branch" needs an actual push, not yet done

## 8. Close out

- [ ] 8.1 Confirm CI is green on the branch — blocked on committing and pushing this change, not yet done
- [x] 8.2 Record the resolved answers in design.md where implementation contradicted an assumption — in particular the shebang result from 1.2 and the license decision from 4.1
- [x] 8.3 Confirm the eleven deferred questions in design.md's Open Questions section are still accurate, and that `publish-from-ci` is still listed by `openspec list` as unfinished
