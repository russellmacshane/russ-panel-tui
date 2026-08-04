## Why

`@rmacshane-lw/russ-panel-tui@0.0.1` is on the public registry, published by hand on 2026-07-31. It works, and it is unreproducible: no tag, no ref, no attestation ties that tarball to a commit. `publish-to-npm-manually` accepted that as the honest cost of proving the artifact first, and named this change as the thing that fixes it.

The constraint that forced the phasing is now discharged, and it was real. That change assumed a package's trusted-publisher settings cannot be configured before the package exists, and flagged the assumption as unverified. It holds: the workaround tooling that exists for this problem (`setup-npm-trusted-publish`) works by publishing a *throwaway* package purely to bring the settings page into being. So a CI-first path was never available, and the manual publish was on the critical path rather than merely convenient. That page now exists for this package, so the bootstrap is spent and cannot block anything again.

What remains is that publishing is a manual act performed with a long-lived credential. This change moves it into GitHub Actions, authenticated by OIDC with no stored credential, triggered by a tag, and attested with provenance.

## What Changes

- **Add a `release-automation` capability.** A new `.github/workflows/release.yml`, triggered by pushing a `v*` tag, running a test gate and then a publish job that authenticates to npm via OIDC trusted publishing. No token is stored in the repository, in a GitHub secret, or in CI.

- **`package.json` is the source of truth for the version; the tag is only a trigger; a guard asserts they agree.** This is not a preference — `npm publish` reads `version` from `package.json` and never sees the git tag, so `package.json` is authoritative whether or not anyone chooses it. The only real question is whether a tag is permitted to disagree silently, and the answer is no: the publish job compares the tag against `package.json` and fails before contacting the registry if they differ. Without that comparison, pushing `v0.2.0` against a `package.json` reading `0.1.0` publishes **0.1.0** and leaves the tag a permanent lie.

- **Merging never publishes.** Releases are triggered by a tag push, not by a push to `main`. Four of the five most recent commits are spec syncs and task checkoffs; under merge-triggered publishing every one of those becomes a push where CI must interrogate the registry and decide *not* to publish. Tag-triggered inverts that: the "version already exists" case stops being routine control flow whose normal outcome is a skip, and becomes an anomaly that should fail loudly.

- **Two jobs, with `id-token: write` scoped to the publish job alone.** `npm ci` executes lifecycle scripts from the entire dependency tree. Running that in the same job that holds the publishing identity puts a compromised transitive dependency next to it. The test job gets `contents: read` and nothing else.

- **The publish job upgrades npm explicitly.** Trusted publishing requires npm ≥ 11.5.1. The current CI pins `node-version: '22.x'` ([`ci.yml:18`](../../../.github/workflows/ci.yml)), and the latest 22.x bundles **npm 10.9.8** — below the floor. A publish job copied from today's config fails on the npm version alone, before any authentication is attempted. Fixed with a pinned `npm i -g npm@11` step rather than by moving the job to a newer Node line, so the requirement is stated where it applies instead of riding invisibly on a Node choice.

- **Provenance attestation.** Verified available here: provenance requires an OIDC-verified runner publishing a public package from a public repository, and the repository is public with `repository.url` already in the exact form npm matches against.

- **First CI-published release is `0.1.0`.** `0.0.1` was a deliberate throwaway to prove the registry round-trip. `0.1.0` is the first release carrying a tag and an attestation — the first version worth referencing, which is what `publish-to-npm-manually` predicted it would be.

- **`ci.yml` gains `npm publish --dry-run` on pull requests.** Prints the exact tarball file list in every PR. Largely redundant with the `files` allowlist — except when the allowlist itself is what a PR is editing, which is the case it exists to catch.

- **`prepublishOnly` stays, and becomes the publish job's build step.** `dist/` is gitignored, so the publish job must compile regardless. Letting the existing guard do it keeps the publish job to a handful of steps and preserves the property that the uploaded tarball cannot be older than the commit being released.

- **Close the token path last.** After the first successful CI publish, enable npm's *require two-factor authentication and disallow tokens* on the package, and revoke the granular token used for `0.0.1`. Sequenced last deliberately: enabling it first removes the fallback that a debugging session would need.

### Non-goals

- **No version derivation from commit messages.** No Changesets, no semantic-release, no conventional-commit adoption, no generated changelog. Declined on merit rather than on dependency count: it automates a decision this project makes a handful of times a year, and charges for it with a commit-message discipline and CI write access to `main`. Additive later if contributor volume ever justifies it.
- **No write access to the repository from CI.** CI never commits a version bump and never creates a tag. `contents: read` in both jobs. This is what rules out the variants where a tag is authoritative and CI transcribes it into `package.json`.
- **No publishing from a branch, and no publishing on merge.** A push to `main`, `development`, or any other branch cannot publish.
- **No GitHub Environment and no approval gate.** With a single maintainer, required reviewers means approving one's own release. Additive later — noting that adding it means updating npm's trusted-publisher configuration as well as the workflow.
- **No dist-tags and no prerelease channels.** `latest` only, stated as a decision rather than reached as a default.
- **No reusable workflow and no composite action.** The four test steps are duplicated into `release.yml` rather than factored out, because npm validates the OIDC claim against the top-level workflow filename and a caller/called split introduces mechanics this change would have to verify for no benefit at this size.
- **No GitHub Release creation, no release notes, no announcement automation.** Tag and registry only.
- **No Node version matrix in CI.** The pin at `ci.yml:18` and the reasoning above it are untouched.
- **No unpublish or yank automation.** Published versions stay immutable; that property is relied on, not managed.
- **Nothing about the package's identity or contents is reopened.** Package name, `bin` name, the `files` allowlist, the absence of source maps, and the absence of an import surface are all settled in `publish-to-npm-manually` design decisions 2, 3, 5, 6, and 7.

## Capabilities

### New Capabilities

- `release-automation`: how a release is triggered, authorized, and verified — the tag trigger and its relationship to the version in `package.json`, the test gate that precedes any upload, the OIDC trusted-publishing credential model and the absence of any stored secret, the separation of the testing and publishing jobs and the permissions each holds, the npm CLI floor that trusted publishing imposes, provenance attestation, and the workflow filename's status as a registered identifier that cannot be renamed freely.

### Modified Capabilities

- `npm-distribution`: two requirements were written around a maintainer at a laptop and change meaning once CI owns the publish. *Publishing cannot ship a stale build* keeps its guarantee but must now hold for an automated publish from a clean checkout rather than for a working tree that might be stale. *Local tarball validation precedes any registry publish* stops being the last line of defence before the registry and becomes a pre-merge development practice, with the automated gate taking over the blocking role. Gains a requirement that pull requests surface the tarball file list, and a requirement that the published package carries provenance and is publishable only from CI.
- `test-harness`: the *Continuous integration* requirement covers pushes and pull requests. It gains the release path — the suite also runs as the gate on a tag push, and a failure there blocks the publish rather than merely reporting a red check.

## Impact

**Affected code**

- **New**: `.github/workflows/release.yml` — the tag-triggered `test` → `publish` pipeline. Its filename is registered with npm and is not freely renameable afterwards.
- `.github/workflows/ci.yml` — add a `npm publish --dry-run` step on pull requests. The existing Node pin, its comment, and the build/typecheck/test steps are unchanged.
- `package.json` — `version` becomes `0.1.0` as part of the release itself. `prepublishOnly` is unchanged and takes on a second role. No other field changes.
- `README.md` — document that releases are published from CI on a tag, so the install instructions are not the only distribution documentation.

**No new dependencies, runtime or dev.** Everything here is GitHub Actions and npm CLI behaviour.

**No application behaviour changes.** No file under `src/` is touched. The TUI, the weather panel, and the configuration handling are all untouched, and the test suite's contents do not change — only where it runs.

**Configuration outside the repository, which no artifact here can assert.** The trusted publisher must be registered on npmjs.com against organisation `russellmacshane`, repository `russ-panel-tui`, workflow `release.yml`, no environment. This is a manual step, it is a prerequisite for the first release, and a mismatch between it and the workflow filename is the most likely single cause of a failed first run.

**Credential surface shrinks.** Today a granular access token exists that can publish this package — it was needed for `0.0.1` because the account uses passkey-based two-factor authentication with no OTP path for a CLI publish. After this change that token is revoked and no credential capable of publishing exists outside GitHub's OIDC exchange. The same passkey detail means *disallow tokens* genuinely closes the laptop path rather than merely discouraging it.

**Registry side effects.** `0.1.0` becomes public and permanent, and unlike `0.0.1` it carries a provenance attestation and a visible "Built and signed on GitHub Actions" badge linking the tarball to the tagged commit.

**User-visible.** Nothing changes about installing or running the app. `npm i -g @rmacshane-lw/russ-panel-tui`, `npx`, and the `russ-panel` command behave exactly as before; the difference is that future versions are verifiable.
