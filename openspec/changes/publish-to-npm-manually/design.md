## Context

Four changes have shipped and the app works, but it is not distributable. `package.json` is still the bootstrap file it started as: `"private": true`, `"version": "0.0.0"`, no `bin`, no `files`, no license, no repository. `dist/` is gitignored (`.gitignore:83`), so the only artifact that matters is one nobody can obtain without cloning.

The stated end goal is publishing from GitHub Actions on a green push to `main`. That goal is not in this change, and the split is not arbitrary — two constraints force it:

- **The OIDC bootstrap.** npm's trusted publishing is configured on a package's settings page on npmjs.com. That page does not exist until the package does. So a CI-first path must either publish once with a throwaway token or publish once by hand; there is no route that starts with zero manual publishes. *(Marked for verification against current npm documentation — see Open Questions — because npm has been actively shipping changes in this area.)*
- **The artifact is unverified.** `tui-shell` specifies exactly one launch path: `node dist/cli.js`, from a checkout, with a TTY. An installed executable is a materially different path. Three things have never been exercised: whether `tsc` preserves a shebang into `dist/cli.js`, whether the `bin` symlink resolves and runs, and what happens when stdin or stdout is not a TTY. Automating delivery of an artifact whose install path has never been run is automating an unknown.

Registry writes are close to irreversible. Versions are immutable — a bad publish burns that number rather than being replaced — and unpublishing is restricted after 72 hours. That asymmetry shapes the whole design: every check that *can* happen before the registry is involved, does.

## Goals / Non-Goals

**Goals:**

- `npm i -g @rmacshane-lw/russ-panel-tui` installs a working `russ-panel` command.
- The tarball contains exactly what runs and nothing else — in particular, no internal planning material.
- Everything verifiable without touching the registry is verified without touching the registry.
- Publishing a stale build is structurally impossible, not merely unlikely.
- Every deferred CI/CD question is written down somewhere a future reader will find it.

**Non-Goals:**

- Automated publishing, git tags, version derivation, changelogs, dist-tags, prerelease channels.
- Provenance attestation — impossible outside an OIDC-verified runner, not declined.
- Any credential stored in the repository, in CI, or in a GitHub secret.
- An import surface. This is an application; nothing consumes it as a library.
- Windows support claims, or CLI flags such as `--help` and `--version`.

## Decisions

### 1. Manual publish first, CI second — and `publish-from-ci` exists now, not later

The bootstrap constraint means one manual publish is on the critical path regardless. Given that, doing it deliberately — and using it to validate the install path — costs nothing extra and retires the project's largest unknown.

The risk of phasing is that "later" never arrives and the reasoning evaporates. Mitigated structurally: `publish-from-ci` is created as a change directory *now*, with a goal and no artifacts, so it appears in every `openspec list` as unfinished work. An archived `design.md` is durable but silent; a change on the board is neither. The eleven deferred questions live in this document's Open Questions section and migrate into that change when it is picked up.

### 2. Scoped: `@rmacshane-lw/russ-panel-tui`

`rmacshane-lw` is a personal npm account with a working personal scope, and nothing named `russ-panel-tui` exists in it. The unscoped name is also free, so this is a genuine choice rather than a forced one.

Scoped wins on collision: the namespace is owned, so no future package can take a confusingly similar name, and it makes provenance self-evident once attestation lands in `publish-from-ci`. The usual objection — that scoped names are long to type — is answered by decision 3.

The cost is one real gotcha: **scoped packages default to restricted access**, and a restricted publish requires a paid plan. Without `publishConfig: {access: "public"}` the first publish fails against a paywall for reasons that have nothing to do with what went wrong. Pinned in the spec rather than left to memory.

### 3. The package name and the command name are independent, and only one of them matters daily

npm gives three separate strings, and conflating them is what makes the naming question feel harder than it is:

```
  package  @rmacshane-lw/russ-panel-tui   typed ONCE, at install
  bin      russ-panel                     typed EVERY TIME
  repo     russ-panel-tui                 already decided, unchanged
```

So verbosity in the package name is nearly free, and terseness in the command name is worth paying for. `russ-panel` is distinctive enough to be collision-proof (verified free on npm and on `PATH`), tab-completes after two characters, and stays self-describing in shell history months later.

`-tui` is dropped from the command deliberately: it names the implementation, not the thing. Nobody types `vim-tui`. A single `bin` entry, not an alias map — aliases double the collision surface on every user's machine to save keystrokes tab-completion already saves.

Renaming a `bin` later is the expensive mistake here: it orphans the old command on every machine that installed it. That is why this is settled before the first publish rather than after.

### 4. First version `0.0.1`, not `0.1.0`

The first publish's job is to prove the registry round-trip — that `npm publish` accepts the tarball, that `npm i -g @rmacshane-lw/russ-panel-tui` retrieves it, and that the installed command runs. `0.0.1` announces that: a version expected to be superseded, cheap to burn, carrying no semver promise to anyone.

`0.1.0` was the alternative, on the argument that `npm pack` validation (decision 11) makes the first publish already trustworthy. Rejected on the immutability asymmetry: if `0.0.1` is wasted, nothing is lost. If a version anyone might reference is wasted, the version history carries the mistake permanently. The cost of being wrong is lopsided, so the cheap option wins.

`0.1.0` remains the natural first version to tell anyone about, and `1.0.0` stays unclaimed until there is a compatibility promise worth making.

### 5. `files` allowlist, never `.npmignore`

Both control tarball contents. They fail in opposite directions:

| | Behaviour when a new directory appears |
|---|---|
| `"files": ["dist"]` | excluded automatically |
| `.npmignore` | **shipped silently** unless someone remembers to add it |

Default-deny is the only defensible choice for a repo that has gained `openspec/` and `.claude/` over four changes and will gain more. Measured today:

```
  with "files": ["dist"]        without (today's config)
  ┌───────────────────┐         ┌──────────────────────────────┐
  │ dist/      104K   │         │ dist/      104K              │
  │ package.json      │         │ src/       208K              │
  │ README.md         │         │ test/       64K              │
  │ LICENSE           │         │ openspec/  336K  ← published │
  └───────────────────┘         │ .claude/   140K  ← published │
       ~104K                    │ tsconfig, vitest.config …    │
                               └──────────────────────────────┘
                                    ~850K, 8×
```

Size is the uninteresting part. The reason this is a spec requirement is `openspec/` and `.claude/`: internal planning documents and agent configuration, published to a public registry, permanently, on every version. That was harmless in a single-file library and is not harmless here.

`package.json`, `README*`, and `LICENSE*` are force-included by npm regardless of the allowlist, so they are not listed.

### 6. No source maps — and the reason is not tarball size

The tradeoff as usually stated is diagnostics versus size. The detail that actually decides it is that **`.map` files are inert unless the process runs with `--enable-source-maps`.** Node ignores them otherwise. So "ship source maps" is really "ship maps, embed source text via `inlineSources` or ship `src/` too, and arrange for the flag on every launch" — three coupled changes and a startup cost, not one field.

Weighed against the benefit: the party helped by source maps is a maintainer diagnosing a crash on a machine they cannot reach. For a personal tool whose primary user has `src/` on disk, that case is rare, and when it happens 16 files of compiled output plus a line number locates the fault. Types are stripped and JSX is rewritten, but the result is readable, not minified.

Additive later, in any version, breaking nothing. Declining it now forecloses nothing.

### 7. No `main`, no `types` — a bin-only package

`main` declares an import entry point and `types` promises a type contract. Neither has a consumer: this is a full-screen terminal application, and importing it would mean mounting an Ink render tree inside someone else's process.

Adding either would create a compatibility surface that semver then obliges us to honour, in exchange for nothing. `bin` alone states precisely what the package is.

### 8. Shebang in the source file, verified in the compiled output

`#!/usr/bin/env node` goes at the top of `src/cli.tsx`, not into `dist/cli.js` by a post-build step. A post-build step is another moving part that can silently stop running.

TypeScript is *believed* to preserve a leading shebang, and this change treats that as unverified. The verification is a spec scenario asserting the directive is present in `dist/cli.js`, plus an explicit task to read the emitted file. Two independent failure modes are covered: `tsc` stripping the line, and the line surviving into a file that is not executable. npm sets the executable bit on `bin` targets at install time, so the `npm pack` loop in decision 11 is what actually proves this end to end.

If `tsc` turns out not to preserve it, the fallback is a build step that prepends it — recorded here so the discovery does not have to re-derive the options.

**Preliminary evidence that it does preserve it**, gathered while reviewing this change: compiling a throwaway `src/cli.ts` under this repo's `tsconfig.json` emitted `#!/usr/bin/env node` as line 1, ahead of the module prologue, with file mode `0664` — non-executable, exactly as this decision predicts. Treated as suggestive rather than conclusive: the throwaway lost the `type: module` context and emitted CJS, so the real `.tsx` ESM case is still what task 1.2 must read. The spec scenario and the explicit read stay in place regardless — they exist to catch a *future* compiler or config change, not only today's behaviour.

**Resolved (task 1.2, confirmed 2026-07-31): `tsc` preserves the shebang in the real `.tsx`/ESM build.** The emitted `dist/cli.js` begins with `#!/usr/bin/env node` exactly, with no postbuild step added. The `npm pack` → global install → `russ-panel` loop (decision 11) confirmed the executable bit and `bin` symlink resolve correctly end to end, both from a local tarball and from the published registry tarball. No fallback was needed.

### 9. Non-TTY handling is in scope — and it is two independent failures, not one

Today a non-interactive launch requires deliberately piping the app, which nobody does. After publishing, `npx @rmacshane-lw/russ-panel-tui` will land in scripts, CI logs, and `| head` pipelines — where escape codes get captured as garbage in someone's output, or the app misbehaves in a way that reads as a broken package.

This is the same argument `add-configurable-location` used when it fixed two latent weather-state defects: they were unreachable until the feature made them reachable, and shipping the feature without the fixes would ship the bugs.

**The subtlety this design initially missed: stdin and stdout are independently a TTY or not, and each one breaks differently.**

```
              stdin TTY?  stdout TTY?   what breaks
  russ-panel       yes        yes        nothing
  … | head         yes        NO         A
  … < /dev/null    NO         yes        B
  npx … in CI      NO         NO         A and B
```

**Failure A — our code pollutes captured output.** `src/cli.tsx:7` calls `enter()` before the first Ink frame with no check, and `src/terminal.ts:20` writes `ENTER_ALT_SCREEN + HIDE_CURSOR` unconditionally. Fixed by gating on `process.stdout.isTTY`.

**Failure B — Ink refuses to start.** `src/app.tsx:116` and `src/location/location-picker.tsx:148` call `useInput`, which puts stdin into raw mode. Ink checks `stdin.isTTY` (`ink/build/components/App.js:121`) and throws from inside a React effect when it is false (`:211`). Gating `enter()` on `stdout.isTTY` has no effect on this whatsoever — different stream, different code, inside a dependency.

Both were reproduced against the real build:

```
  $ node dist/cli.js > out.txt < /dev/null      → EXIT=1
    out.txt  ESC[?1049h ESC[?25l … ESC[?25h ESC[?1049l   ← A (4 sequences, enter/restore paired)
             plus Ink's error panel rendered into the file
    stderr   Error: Raw mode is not supported on the current process.stdin   ← B
```

Two failures in one command, which is why they first read as one. The pairing in `out.txt` is worth noting as good news: the existing enter/restore plumbing and the crash handler both behaved correctly — it is the *scope of the gate* that was wrong, not the machinery.

**Decision: fix both, and fix B by refusing cleanly.** A non-interactive stdin means the app cannot do the one thing it exists to do, so it declines to start: one line on stderr, non-zero exit, checked before `enter()` so the refusal path writes no escape sequences at all. Two of the three invocations decision 9 cited as motivation — a script and a CI job — have no stdin, so fixing only A would have addressed the less relevant half of the exposure.

Refusing is deliberately smaller than the alternatives, all of which stay refused: no fallback rendering mode, no non-interactive output format, no headless mode, no `--no-alt-screen` flag. Scope grows by exactly two conditionals.

`restore()` keeps its existing idempotency requirement, so gating must not make a second call harmful.

### 10. `prepublishOnly` rebuilds and retests, because `dist/` is gitignored

`dist/` is untracked, which means the working tree can hold a stale build, a partial build, or none at all, indefinitely and invisibly. A hand-run publish is precisely when that becomes a shipped artifact.

`"prepublishOnly": "npm run build && npm run typecheck && npm test"` makes it structurally impossible: `npm publish` cannot proceed without a fresh compile and a green suite. This substitutes a guarantee for a habit, which is the right trade for a one-way operation.

Note for `publish-from-ci`: this guard will duplicate work once a CI test job already gates publishing. Whether it becomes redundant or stays as defence-in-depth is that change's call — flagged, not decided.

**The guard did exactly its job once, against an unrelated bug.** Running `prepublishOnly` for real (via `npm publish --dry-run`) failed the suite: `src/app.test.tsx`'s `dimensions()` helper measured line width with raw `String.prototype.length`, not accounting for ANSI escape codes, so a colorized frame's invisible styling bytes counted as visible width and tripped the viewport-sizing assertions. It only failed when the actual shell environment forced color (`FORCE_COLOR`/`COLORTERM`), which this change's environment happened to set but earlier ad hoc `npm test` runs happened not to — a latent, pre-existing test fragility, unrelated to packaging or TTY handling, that this change did not introduce but that `prepublishOnly` was the first thing to actually exercise under a color-forcing shell. Fixed by stripping ANSI escape sequences before measuring width in `dimensions()`. Confirmed green both with the ambient environment and with `FORCE_COLOR=3 COLORTERM=truecolor` forced explicitly.

Chosen over `prepack` deliberately. `prepack` also fires on `npm pack`, which would make the decision-11 validation loop slow enough to discourage running it, and that loop's value depends on being cheap.

### 11. `npm pack` before the registry, always

`npm pack` produces the identical tarball `npm publish` would upload, and it can be installed directly:

```
  npm run build
  npm pack                 → rmacshane-lw-russ-panel-tui-0.0.1.tgz
  tar -tzf *.tgz           → assert contents: dist/ + package.json + README + LICENSE
  npm i -g ./*.tgz         → real global install, real bin symlink
  russ-panel               → does the TUI actually run?
  russ-panel < /dev/null   → does a non-TTY run behave?
```

This exercises the entire install path — tarball construction, shebang, `bin` symlink, `PATH` resolution, launch, non-TTY behaviour — with no registry involvement, no authentication, and no version numbers consumed. Fully repeatable.

Given immutability, the ordering is the design: everything checkable off-registry is checked off-registry, and `npm publish` becomes a formality that confirms rather than discovers. `npm publish --dry-run` still runs immediately before the real publish, as a last look at the file list.

### 12. Add a `LICENSE` file, and MIT unless overridden

No license exists. An unlicensed public package leaves its terms undefined — which, strictly, means no one has permission to use it — and npm surfaces the license field prominently on the package page.

**MIT — confirmed by the maintainer on 2026-07-31.** MIT is the most widely recognised permissive license and matches the expectations around a small published CLI. Apache-2.0 was considered and declined as overkill: its patent grant and change-statement requirements buy nothing here. ISC was considered and declined as functionally equivalent to MIT but less recognisable by name.

So: `"license": "MIT"` in `package.json`, and a `LICENSE` file carrying the standard MIT text, copyright **Russ MacShane**, year **2026**. The `license` field and the `LICENSE` file must agree; a mismatch is a common and confusing defect.

## Risks / Trade-offs

- **[Publishing `0.0.1` is irreversible after 72 hours]** → Accepted, and mitigated by ordering rather than by hope: decision 11 moves every verifiable check ahead of the registry, and decision 4 makes the first number deliberately disposable.
- **[`tsc` might not preserve the shebang]** → Not assumed either way. Covered by a spec scenario and an explicit read of the emitted file, with the fallback recorded in decision 8.
- **[A manual publish is unreproducible — no tag, no ref, no attestation ties `0.0.1` to a commit]** → Real, and accepted as the honest cost of phasing. `prepublishOnly` guarantees the artifact was built from the working tree and passed its tests, which is weaker than provenance. This is precisely what `publish-from-ci` exists to fix, and it is why `0.0.1` is a throwaway rather than a version anyone should reference.
- **[Adding TTY gates touches terminal handling, the one subsystem where a regression is user-visible on every launch]** → Bounded to two conditions: one on the existing enter/restore pair (`stdout.isTTY`), one refusal check before the first frame (`stdin.isTTY`). `restore()`'s idempotency requirement is preserved. `tui-shell`'s existing alternate-buffer and restoration scenarios stay in force for the interactive case and continue to guard it.
- **[The stdin refusal could fire on a launch that would otherwise have worked]** → The condition is exactly Ink's own (`stdin.isTTY`, `ink/build/components/App.js:121`), so it cannot reject a launch Ink would have accepted. It converts a guaranteed crash into a readable message; it does not narrow what runs.
- **[The tarball allowlist could omit something the app needs at runtime]** → Caught by construction: decision 11 installs from the tarball and launches the app, so a missing runtime file fails locally rather than in a user's install.
- **[Scope creep from "we are touching packaging anyway" — `--version`, `--help`, a `postinstall` notice]** → Explicitly refused in Non-goals. `--version` is the most tempting, because a published package makes it feel expected; it is unrelated to distribution and belongs with a real CLI-argument decision.

## Migration Plan

Nothing to migrate. No user has this installed, no config format changes, and the existing `git clone` → `npm run build` → `npm start` path is untouched — `bin` is additive, and `node dist/cli.js` remains a specified launch path.

The one-way step is the registry write. Sequenced so it comes last, after the local tarball loop has passed.

## Open Questions

Everything below is deliberately deferred to **`publish-from-ci`**, which exists as a change directory so this list has a destination. Ordered roughly by how much each one shapes that change's structure.

- **Where does the version number come from? — DEFERRED, and it is the question that determines the whole workflow's shape.** Three coherent answers, and they are not variations on a theme: (a) `package.json` is the source of truth, a PR bumps it, CI publishes only when the version is not already on the registry; (b) tag-triggered — merging never publishes, pushing `v1.2.3` does; (c) derived from conventional commits via Changesets or semantic-release, with CI committing the bump back to `main`. These differ in whether CI needs write access to the repository, whether a commit-message discipline is adopted, and whether releases are automatic or deliberate. Not prejudged here.
- **What happens on a push to `main` that is not a release? — DEFERRED, and coupled to the previous question.** A README fix or a CI tweak must not attempt to republish an existing version, which npm rejects with an error that would turn `main` red. Answer (a) needs an explicit registry check; answer (b) makes the question disappear.
- **Is the OIDC bootstrap real? — DEFERRED, and the one item here that should be verified before designing around it.** This change assumes a package's trusted-publisher settings cannot be configured before the package exists. That assumption is load-bearing for the phasing but was not confirmed against current npm documentation, and npm has been shipping changes to trusted publishing. If it is wrong, `publish-from-ci` could have gone first — worth knowing, though the artifact-verification argument in decision 1 stands on its own regardless.
- **OIDC trusted publishing, or a stored token? — DEFERRED, with a strong prior toward OIDC.** OIDC stores no credential: the runner requests a short-lived identity token GitHub signs with the repository, workflow, and ref, and npm verifies it. Nothing to rotate, nothing to leak. The token path needs a granular token scoped to this one package, a short expiry, and a GitHub Environment restricting it to `main` — and remains long-lived and readable by any workflow file in the repository, which is the exposure OIDC removes.
- **Should test and publish be separate jobs? — DEFERRED, with a security argument in favour.** `npm ci` executes lifecycle scripts from the whole dependency tree. If that runs in the same job that holds the publishing identity, a compromised transitive dependency can reach it. Splitting, with `id-token: write` granted only to the publish job, contains that.
- **Provenance attestation? — DEFERRED, and pure upside.** Requires OIDC, so it follows that decision rather than competing with it. Gives the package a cryptographic link from tarball to source commit, and the visible "Built and signed on GitHub Actions" badge. `0.0.1` will have none, which is expected.
- **Tag before or after a successful publish? — DEFERRED.** Tagging first can leave a tag pointing at a version that never shipped; tagging after can leave a shipped version with no tag if the tag push fails. Neither is free, and the choice depends on which inconsistency is easier to detect and repair.
- **Does `prepublishOnly` stay once CI gates publishing? — DEFERRED.** From decision 10. It becomes duplicated work; it also remains the only guard if someone ever publishes from a laptop again. Defence-in-depth versus a faster pipeline.
- **`npm publish --dry-run` on pull requests? — DEFERRED, and cheap.** Surfaces the exact file list on every PR, so a change that would newly ship something unwanted is visible in review rather than after the fact. Partly redundant with the `files` allowlist, but it catches the case where the allowlist itself is edited.
- **Are dist-tags or prerelease channels ever needed? — DEFERRED, and probably not.** `latest` alone is likely sufficient for a single-line application with no consumers pinning majors. Worth an explicit decision rather than a silent default, because retrofitting a maintenance line after users exist is harder than declaring one early.
- **Which branch triggers a release? — DEFERRED, trivial but a silent failure if wrong.** The originating note said "master" twice; this repository's default branch is `main`, and work happens on `development`. A workflow keyed to a branch that does not exist never runs and never errors.

**No questions remain open inside this change.** One was, and it is now resolved:

- **Which license? — RESOLVED: MIT**, confirmed by the maintainer on 2026-07-31. See decision 12 for the alternatives considered. The `license` field must be kept consistent with the `LICENSE` file.
