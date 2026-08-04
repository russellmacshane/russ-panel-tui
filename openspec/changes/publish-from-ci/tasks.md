## 1. Release workflow — `.github/workflows/release.yml`

The filename is registered with npm and is not freely renameable afterwards (design.md decision 7). Create the file before configuring the registry in section 4, so the registered name and the real name are decided together.

- [x] 1.1 Create `.github/workflows/release.yml` triggered only on pushed tags matching `v*`, with no `push` branch trigger and no `pull_request` trigger
- [x] 1.2 Set workflow-level `permissions: contents: read` so both jobs default to read-only, and grant nothing at workflow level that only one job needs
- [x] 1.3 Add a `test` job holding `contents: read` and no `id-token` permission, running `actions/checkout@v7`, `actions/setup-node@v7` pinned to `node-version: '22.x'` with `cache: npm`, `npm ci`, `npm run build`, `npm run typecheck`, `npm test` — the same commands `ci.yml` runs, deliberately duplicated rather than factored out (design.md decision 11)
- [x] 1.4 Add a `publish` job with `needs: test`, holding exactly `contents: read` and `id-token: write` — the only place identity-token permission appears in the repository
- [x] 1.5 In `publish`, check out the tagged commit with `actions/checkout@v7` and run `actions/setup-node@v7` with `node-version: '22.x'` and **without** `registry-url`, because it writes an `.npmrc` referencing an unset `NODE_AUTH_TOKEN` that can fail instead of falling back to OIDC — v7 removes the dummy export that causes this, which lowers the risk without changing the decision (design.md decisions 10 and 16)
- [x] 1.6 Add `npm ci`
- [x] 1.7 Add a step installing a pinned `npm@11` — the latest Node 22.x bundles npm 10.9.8, below the 11.5.1 floor trusted publishing requires; pin the major rather than using `@latest` (design.md decision 5)
- [x] 1.8 Add a comment above that step recording *why* it exists, naming the 11.5.1 floor, so a future Node-version change does not remove it as apparently redundant
- [x] 1.9 Add the version guard: derive the tag's version by stripping the leading `v` from the tag ref, read `version` from `package.json`, and fail the job if they differ, printing both values
- [x] 1.10 Confirm the guard runs *before* the publish step and before anything contacts the registry, so a mismatch costs a failed run and not a version
- [x] 1.11 Add `npm publish --provenance` — passed explicitly even though npm documents provenance as automatic under trusted publishing, since practitioner reports disagree and the flag is idempotent (design.md decision 9)
- [x] 1.12 Confirm no step references a secret, a token, or `NODE_AUTH_TOKEN`, and that the repository has no npm token in its secrets
- [x] 1.13 Confirm neither job requests `contents: write` — CI never commits a version bump and never creates a tag (design.md decision 3)
- [x] 1.14 Confirm no `--tag` argument is passed to `npm publish`, so releases go to `latest` only (design.md decision 13)
- [x] 1.15 Do not add `prepack`; rely on the existing `prepublishOnly` to build, typecheck, and test inside the publish step (design.md decision 6)

## 2. Continuous integration — `.github/workflows/ci.yml`

Do the action bump first, so the dry-run step is added to an already-current workflow and a failure in either is unambiguous.

- [x] 2.1 Bump `actions/checkout` from `@v4` to `@v7` and `actions/setup-node` from `@v4` to `@v7` (design.md decision 16)
- [x] 2.2 Confirm `cache: npm` remains explicit on `setup-node`, since v5 changed automatic-caching behaviour — and confirm `package.json` still declares no `packageManager` field, which is what makes that change a no-op here
- [x] 2.3 Confirm both workflows use the same major for both actions, so `ci.yml` and `release.yml` cannot drift on action versions
- [x] 2.4 Confirm the run's annotations no longer report the Node 20 deprecation warning
- [x] 2.5 Confirm the bump changed no behaviour — the build, typecheck, and test steps report the same results, and the npm cache is still restored
- [x] 2.6 Add a `npm publish --dry-run` step that runs on pull requests, reporting the tarball file list
- [x] 2.7 Confirm the step cannot run on a tag push or interfere with the release workflow
- [x] 2.8 Confirm the dry run needs no credential and requests no `id-token` permission
- [x] 2.9 Confirm the existing Node pin at `ci.yml:18` and the comment above it are unchanged, and that the build, typecheck, and test steps are untouched
- [ ] 2.10 Open a scratch pull request and confirm the dry run's output actually shows the file list — `dist/`, `package.json`, `README.md`, `LICENSE` — rather than being swallowed by a lifecycle script running quietly
- [ ] 2.11 Confirm the dry run does not fail the check for a reason unrelated to packaging, such as `prepublishOnly` behaving differently under `--dry-run` than expected

## 3. Documentation

- [x] 3.1 Add a short release section to `README.md` stating that published versions come from CI on a pushed `v*` tag and carry a provenance attestation
- [x] 3.2 Confirm the existing install instructions and clone-and-build instructions remain accurate and unchanged
- [x] 3.3 Confirm the README does not document a manual publish path, since section 7 closes it

## 4. Registry configuration — manual, outside the repository

No artifact in this change can assert any of this. A mismatch here is the most likely single cause of a failed first release (design.md risks).

- [ ] 4.1 On `npmjs.com/package/@rmacshane-lw/russ-panel-tui/access`, add a trusted publisher for GitHub Actions
- [ ] 4.2 Set organisation/user to `russellmacshane`, repository to `russ-panel-tui`, workflow filename to `release.yml`, and leave the environment field empty (design.md decision 8)
- [ ] 4.3 Confirm the workflow filename entered matches `.github/workflows/release.yml` exactly, including extension, with no path prefix
- [ ] 4.4 Confirm the allowed action includes `npm publish`
- [ ] 4.5 Do **not** yet enable "require two-factor authentication and disallow tokens" — that is section 7, after the pipeline is proven (design.md decision 12)

## 5. Verify what can be verified before consuming a version

The guard is provable without touching the registry. OIDC authentication is not — it is only exercised by a real publish. That is acceptable: an authentication failure happens before any upload, so it costs a re-run rather than a version.

- [ ] 5.1 Merge sections 1–3 to `main` so the release workflow exists on the default branch and can be triggered by a tag
- [ ] 5.2 Prove the version guard fires: push a deliberately mismatched throwaway tag (a version that does not match `package.json`) and confirm the job fails at the guard, prints both versions, and never reaches the publish step
- [ ] 5.3 Confirm that run contacted the registry not at all — no authentication attempt, no upload
- [ ] 5.4 Delete the throwaway tag locally and on the remote
- [ ] 5.5 Confirm the `test` job ran and passed in that run, so the gate is known to work before it matters
- [ ] 5.6 Review the run's logs and confirm the `npm@11` step reports a version at or above 11.5.1
- [ ] 5.7 Confirm from the run that the `publish` job's permissions are as intended, and that the `test` job was granted no identity-token permission

## 6. First release — `0.1.0`

- [ ] 6.1 Raise `version` in `package.json` from `0.0.1` to `0.1.0` as an ordinary reviewable change (design.md decision 15)
- [ ] 6.2 Merge that change to `main`
- [ ] 6.3 Confirm `npm view @rmacshane-lw/russ-panel-tui versions` does not already contain `0.1.0`
- [ ] 6.4 Tag the merged commit on `main` as `v0.1.0` and push the tag
- [ ] 6.5 Confirm the `test` job passes and the `publish` job starts only after it
- [ ] 6.6 Confirm the version guard passes, comparing `v0.1.0` against `0.1.0`
- [ ] 6.7 Confirm `prepublishOnly` ran the build, typecheck, and tests inside the publish step, and that the publish uploaded output compiled from the tagged commit rather than from any cached artifact
- [ ] 6.8 Confirm the publish authenticated with no stored credential — the run should show an OIDC exchange, and no step should reference a token
- [ ] 6.9 If authentication fails, check the two most likely causes first: the trusted-publisher workflow filename from 4.3, and the `registry-url` omission from 1.5

## 7. Post-release verification

- [ ] 7.1 Confirm `0.1.0` is present on the registry and that `latest` points at it
- [ ] 7.2 Confirm the package page shows the provenance badge and that it links to the `v0.1.0` commit in `russellmacshane/russ-panel-tui`
- [ ] 7.3 Confirm via `npm view` or the package page that the attestation names the expected repository, workflow, and ref
- [ ] 7.4 Fetch the published tarball from the registry and confirm its contents match the allowlist — `dist/`, `package.json`, `README.md`, `LICENSE` and nothing else — rather than trusting the dry run
- [ ] 7.5 From outside the repository, run `npx @rmacshane-lw/russ-panel-tui@0.1.0` and confirm the TUI launches
- [ ] 7.6 Install `0.1.0` globally from the registry and confirm `russ-panel` launches and quits cleanly
- [ ] 7.7 Confirm `0.0.1` is untouched and still carries no attestation, so its absence is not later read as a defect
- [ ] 7.8 Confirm no version other than `0.1.0` was published by the run

## 8. Close the credential path

Ordered last deliberately. Enabling this before the pipeline is proven removes the fallback a debugging session would need (design.md decision 12).

- [ ] 8.1 On the package's registry settings, enable "require two-factor authentication and disallow tokens"
- [ ] 8.2 Confirm a subsequent release still works — either by the next real release or by confirming the setting does not affect the OIDC path, since token restrictions apply to token authentication only
- [ ] 8.3 Revoke the granular access token that published `0.0.1` (created because the account's passkey-based 2FA has no OTP path for a CLI publish — see `publish-to-npm-manually` task 6.4)
- [ ] 8.4 Confirm no other token in the account can publish this package
- [ ] 8.5 Confirm that publishing from a maintainer's machine is now refused, so the intended posture is real rather than assumed

## 9. Close out

- [ ] 9.1 Confirm CI is green on `main` after every change in this proposal has landed
- [ ] 9.2 Record the first-run observations in design.md decisions 9 and 10 — whether `--provenance` was required, and whether omitting `registry-url` was correct — so the next reader does not re-derive them
- [ ] 9.3 Record any other place where the first real release contradicted an assumption in this change
- [ ] 9.4 Confirm the eleven questions deferred by `publish-to-npm-manually` are all answered, and that design.md's Open Questions section reflects only the two genuinely deferred items and their triggers
- [ ] 9.5 Confirm no credential capable of publishing exists outside GitHub's OIDC exchange — the goal the whole change exists to reach
