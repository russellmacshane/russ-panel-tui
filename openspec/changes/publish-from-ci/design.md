## Context

`publish-to-npm-manually` shipped `0.0.1` by hand and left eleven questions deferred to this change, with the reasoning for each deferral recorded rather than lost. This document answers all eleven. Several are answered by dissolving them: they were consequences of a structure this change does not adopt.

Two facts were verified before designing, both of which were flagged as assumptions rather than knowledge:

**The OIDC bootstrap was real.** npm's trusted publishing is configured per package at `npmjs.com/package/<name>/access`, and that page does not exist until the package does. The community workaround (`setup-npm-trusted-publish`) exists specifically to publish a *dummy* package so the settings page can be created before the real first release. So there was no CI-first route, and the phasing was forced rather than chosen. The bootstrap is now spent: the package exists, the settings page exists, and this constraint cannot recur.

**The current CI configuration cannot publish.** Trusted publishing requires npm ≥ 11.5.1 and Node ≥ 22.14.0. Measured against the Node release index:

```
  node v22.23.2   (latest 22.x, LTS Jod)   bundles npm 10.9.8    ✗  below the floor
  node v24.18.1   (latest 24.x)            bundles npm 11.16.0   ✓
  node v26.5.1                             bundles npm 11.17.0   ✓
```

`ci.yml:18` pins `node-version: '22.x'`. A publish job copied from it fails on the npm version before authentication is even attempted — and would fail with an error about the CLI, not about OIDC, which is the kind of misdirection that costs an afternoon.

The asymmetry that shaped the previous change still shapes this one: registry writes are close to irreversible, versions are immutable, and unpublishing is restricted after 72 hours. What changes is that the checks now run on a machine nobody is watching, so they have to be structural rather than remembered.

## Goals / Non-Goals

**Goals:**

- A released version is cryptographically traceable to the commit it was built from.
- No credential capable of publishing exists anywhere outside GitHub's OIDC exchange.
- A release is a deliberate act, distinguishable from merging.
- A tag and a published version can never disagree about what shipped.
- Routine pushes — spec syncs, task checkoffs, README fixes — cannot turn `main` red by way of the release path.
- Every one of the eleven deferred questions is answered or explicitly dissolved.

**Non-Goals:**

- Version derivation from commit messages, generated changelogs, conventional commits.
- Any write access to the repository from CI.
- Publishing on merge, or from any branch.
- A GitHub Environment or approval gate.
- Dist-tags, prerelease channels, GitHub Releases, release notes.
- A reusable workflow or composite action.
- Reopening package identity, `bin` name, tarball allowlist, source maps, or import surface.

## Decisions

### 1. `package.json` is the source of truth, the tag is the trigger, and a guard asserts they agree

The deferred question offered three rival answers to "where does the version number come from." Two of them are not actually available, and the reason is mechanical rather than a matter of taste:

```
   git tag v0.2.0   ──────►  a trigger. npm never sees it. Not once.
   package.json     ──────►  THE version that gets published. Always.
```

`npm publish` reads `version` out of `package.json` and uploads that. A git tag is a ref in the repository; it never crosses the wire. So `package.json` is authoritative under every option, and "tag-triggered where the tag carries the version" cannot be implemented literally — something must transcribe the tag into `package.json` first.

That leaves exactly three ways to handle a disagreement between the two:

| | Resolution | Cost |
|---|---|---|
| Tag wins | CI runs `npm version` from the tag and commits back to `main` | Needs `contents: write` — semantic-release's machinery for tag-triggering's ergonomics |
| Ignore it | Push `v0.2.0` against `package.json` `0.1.0` → publishes **0.1.0**, tag is a permanent lie | Silent. Unacceptable. |
| **Guard** | Compare; fail the job before the registry is touched | One comparison step, zero write access |

The guard is chosen. It is what makes the tag push safe to perform from a laptop without review: a tag cannot *inject* a version, only agree with one that was already set in a reviewed pull request alongside the change that earned it.

The failure this prevents is not exotic. Bumping `package.json` and mistyping the tag, or tagging before merging the bump, both produce a disagreement, and both are silent without the comparison.

### 2. Tag-triggered, not merge-triggered — and the deciding argument is this repository's commit mix

The deferred question "what happens on a push to `main` that is not a release?" only exists under merge-triggered publishing. Look at what actually lands here:

```
  ab49b0c  Sync npm-distribution and tui-shell specs, archive publish-to-npm-manually
  3b85727  Check off remaining publish-to-npm-manually tasks
  9ca7e06  Make the package publishable to npm and fix non-interactive launch   ← the only release-worthy one
  4572014  Check off CI verification in add-configurable-location tasks
  31aace3  Implement configurable weather location
```

Four of five are planning-artifact churn, and OpenSpec's rhythm guarantees more of it: every change produces task checkoffs and a spec sync. Under merge-triggered publishing, each one is a push where the workflow must query the registry and decide not to publish. The check's *normal* outcome becomes "skip," which is the shape of control flow that quietly stops working — a skip that fires when it should not looks exactly like a skip that should have fired.

Tag-triggered inverts it. The registry never needs interrogating as routine; a version that already exists means the same tag was pushed twice, which is an anomaly that should fail loudly. Same check, opposite meaning.

Three deferred questions dissolve rather than being answered:

- **"Tag before or after a successful publish?"** The tag is the cause, so it necessarily precedes. The remaining failure mode is "tag exists, nothing shipped," which is trivially detectable (`npm view` lacks the version) and trivially repaired (delete and re-push the tag — nothing consumed it). The opposite failure, a shipped version with no tag, becomes structurally impossible. This is precisely the `0.0.1` risk the previous change accepted.
- **"Which branch triggers a release?"** None. Tags are not branches, so the silent-failure class the previous change worried about — a workflow keyed to `master` in a repository whose default is `main` — cannot occur. It also stays correct with work happening on `development`.
- **"What happens on a non-release push to `main`?"** Nothing. `ci.yml` tests it; no publish path is reachable.

The honest cost is that releasing is two acts rather than one: a bump merged, then a tag pushed. And a bump can sit merged and unreleased if the tag is forgotten — detectable by comparing `package.json` against the registry, and arguably a feature, since it lets the number be set when the change lands and the release happen when it is wanted.

### 3. Changesets and semantic-release are declined on merit, not on dependency count

This project's dependency list is small as a bootstrap artifact, not as a policy, so "it adds a dependency" is not an argument. The argument is what it buys against what it costs.

It buys automation of a decision made a handful of times a year. It costs a commit-message discipline applied to every commit, `contents: write` so a bot can push a bump to `main`, that bot push interacting with branch protection, and a generated changelog that duplicates what `openspec/changes/archive/` already records in more detail.

Changesets earns its keep with many contributors shipping many releases, or a monorepo with interdependent versions. Neither is true. Additive later, and nothing here forecloses it — the version still lives in `package.json`, which is exactly what those tools manipulate.

### 4. Two jobs, and `id-token: write` exists in only one of them

`npm ci` executes install scripts from the entire transitive dependency tree. If that runs in the job holding the publishing identity, a compromised dependency is one `postinstall` away from a token exchange it should never see.

```
  ┌────────────────────────────────┐
  │ job: test                      │
  │   permissions: contents: read  │
  │   build → typecheck → test     │
  └──────────────┬─────────────────┘
                 │ needs: test
  ┌──────────────▼─────────────────┐
  │ job: publish                   │
  │   permissions:                 │
  │     contents:  read            │
  │     id-token:  write   ← only here
  └────────────────────────────────┘
```

The split is not free — the publish job re-runs `npm ci` and, via `prepublishOnly`, the suite again. That duplication is the price of not co-locating the identity with arbitrary dependency code, and at a handful of releases a year it is cheap. It also means the OIDC exchange happens in a job whose only other content is a version comparison.

### 5. Upgrade npm explicitly rather than moving the publish job to a newer Node

Two ways to clear the 11.5.1 floor:

| | |
|---|---|
| Publish on Node 24.x | Zero extra steps. The npm requirement becomes *incidental* to a Node choice — invisible in the file, and silently broken by anyone who pins back to 22. |
| **Keep 22.x, add `npm i -g npm@11`** | One step, and the constraint is stated where it applies. Survives any future Node change. Keeps the artifact built on the Node version `engines` actually claims. |

The second. The deciding argument is the invisibility of the first: a future reader bumping or lowering the Node pin has no way to know they are also changing whether publishing works.

The npm version is pinned to a major rather than `@latest`, for the reason `ci.yml:16-17` already wrote down about Node — "pinned rather than floating so a Node release cannot turn a green branch red." A floating `@latest` on the one job that performs an irreversible operation is the worst place to accept that risk.

### 6. `prepublishOnly` stays, and is the publish job's build step

The deferred question framed this as defence-in-depth versus a faster pipeline. There is a third answer: it is *load-bearing* in CI, not redundant.

`dist/` is gitignored, so the publish job's checkout has no compiled output. Something must build. Letting `prepublishOnly` be that something means the publish job is checkout → `npm ci` → upgrade npm → guard → publish, with the build, typecheck, and test running inside the one-way operation itself. The guarantee it was written for — the tarball cannot be older than the sources — holds identically whether the sources came from a working tree or a tag checkout.

It also remains the only guard if anyone ever publishes from a laptop again, which decision 12 makes unlikely but not impossible.

`prepack` is still refused, for the reason the previous change gave: it fires on `npm pack`, and the local validation loop's value depends on being cheap enough to run repeatedly.

### 7. The workflow filename is a registered identifier

npm's trusted publisher configuration takes a bare workflow **filename** — no path, `.yml` or `.yaml` only. That makes the filename part of the security boundary: the OIDC claim is validated against it, so renaming the file breaks publishing until npm's settings are updated to match.

This is the same class of one-way mistake as renaming a `bin`, which the previous change deliberately settled before shipping rather than after. So it is settled here: **`release.yml`**. Named for the outcome rather than the mechanism, pairing with the existing `ci.yml`, and leaving room if the job ever grows beyond publishing.

The knock-on effect is decision 11: a reusable workflow would introduce a distinction between the caller's `workflow_ref` and the called workflow's `job_workflow_ref`, and which one npm validates is a detail this change would have to establish empirically. Not worth it to deduplicate four steps.

### 8. No GitHub Environment, for now

An environment adds two things: npm can require the OIDC claim to name it, and GitHub can require an approval before the job runs.

With one maintainer, required reviewers means approving one's own release — ceremony, not control. The tag push is already the deliberate act, and it is already the point at which a human decides.

The reason to revisit is specific rather than vague: the moment a second person has push access, an environment gate becomes the difference between "can push" and "can publish," which is worth real money. Recorded here so the trigger is recognisable. Adding it later touches npm's settings page as well as the workflow, so it is not purely a repository change.

### 9. Pass `--provenance` explicitly, despite the documentation saying it is automatic

npm's documentation states provenance is generated automatically when publishing from GitHub Actions under trusted publishing. Field reports from practitioners contradict this and find the flag necessary. Both cannot be relied on, and the flag is idempotent with the documented behaviour: if provenance is automatic, passing it changes nothing.

So it is passed. An explicit flag also documents intent in the workflow file, where a reader can see that provenance is expected — which matters because its *absence* is silent. `0.0.1` has no attestation and nothing anywhere says so except the previous change's task list.

Verified as available here rather than assumed: provenance requires an OIDC-verified runner publishing a public package from a public repository. `russellmacshane/russ-panel-tui` is public, the package is public, and `repository.url` is already `git+https://github.com/russellmacshane/russ-panel-tui.git` — the exact form npm matches against, and a common cause of provenance failure when it drifts.

### 10. Omit `registry-url` from `setup-node` in the publish job

`actions/setup-node` with `registry-url` writes an `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`. Under trusted publishing there is no `NODE_AUTH_TOKEN`, and an `.npmrc` pointing at an unset variable can produce an authentication error rather than falling back to the OIDC exchange.

npm defaults to the public registry with no configuration, so the parameter buys nothing here. Omitted.

**Decision 16 partially defuses this, and the omission stands anyway.** `setup-node@v7.0.0` removes a dummy `NODE_AUTH_TOKEN` export — the upstream fix for exactly this class of failure — so on v7 the risk is materially lower than the paragraph above describes. The parameter is still omitted, because the argument for omitting it was never only the failure mode: it configures a registry that is already the default. What changes is the confidence, not the choice, and the failure mode is documented here because it is version-dependent rather than eliminated.

Flagged as the most likely first-run failure alongside a filename mismatch, and treated as something to observe on the first real run rather than to design around: if authentication fails, this and the trusted-publisher configuration are the first two things to check.

### 11. Duplicate the four test steps into `release.yml`

`ci.yml` and `release.yml` will both contain checkout, `setup-node`, `npm ci`, build, typecheck, test. Four duplicated steps.

The alternatives both cost more than they save at this size. A reusable workflow raises the unresolved OIDC-claim question from decision 7. A composite action adds a directory, a metadata file, and an indirection to look through. Duplicated steps are immediately legible and cannot break authentication.

The risk accepted is drift: a change to the test pipeline in one file and not the other. Bounded by the fact that a drifted `release.yml` fails the release rather than passing it silently — the test job either runs the suite or does not compile.

### 12. Close the token path last, and revoke the token that published `0.0.1`

npm recommends enabling *require two-factor authentication and disallow tokens* once trusted publishing works. Here that recommendation has more force than usual: the previous change's task 6.4 records that `0.0.1` was published with a granular access token specifically because the account uses passkey-based 2FA with no OTP path for a CLI publish. So the laptop path already depends on a long-lived token, which is exactly the credential OIDC exists to eliminate.

Enabling it makes CI the only way to publish. That is the intended posture, and it is also a hard dependency on the workflow being correct — so the ordering matters:

```
  1.  register the trusted publisher on npmjs.com     ← prerequisite
  2.  bump to 0.1.0, merge, tag v0.1.0, push          ← first real release
  3.  confirm the publish and the provenance badge
  4.  enable "require 2FA and disallow tokens"        ← only now
  5.  revoke the granular token used for 0.0.1
```

Enabling step 4 before step 3 would remove the fallback precisely when a debugging session might need it. Step 5 is the point of the whole change: after it, no credential capable of publishing this package exists outside GitHub's OIDC exchange.

### 13. `latest` only

A single-user terminal application with no consumers pinning majors needs one channel. Recorded as a decision rather than a default so a future reader knows it was considered: the argument for declaring a maintenance line early is that retrofitting one after users exist is harder, and it is outweighed here by there being no users to maintain a line for.

### 14. `npm publish --dry-run` on pull requests

Cheap, and it catches one case nothing else does. The `files` allowlist is default-deny, so new directories are excluded automatically and the printed list will almost always be the same four entries — which is exactly why the case worth catching is a pull request that edits the allowlist itself. That is the change most likely to newly ship something unwanted, and the least likely to look dangerous in a diff.

### 15. First CI release is `0.1.0`

`0.0.1` was chosen to be cheap to burn while proving the registry round-trip, and it did its job. `0.1.0` is the first release with a tag and an attestation behind it, and the previous change already named it "the natural first version to tell anyone about."

`0.0.2` was considered, on the argument that the pipeline is itself unproven and might warrant another disposable number. Rejected: the pipeline's failure modes are authentication and the version guard, both of which fail *before* anything is uploaded, so a botched first run costs a re-run rather than a version. `1.0.0` stays unclaimed until there is a compatibility promise worth making.

### 16. Bump both actions to v7, pinned by major tag

`actions/checkout@v4` and `actions/setup-node@v4` target Node 20, which GitHub has deprecated and is already force-running on Node 24. That is a warning on every run today. It became this change's business rather than a separate cleanup for a specific reason: `release.yml` pins the same two actions, so writing it at v4 would *duplicate* the warning into a new file, and a reader would reasonably assume the new file was written against current guidance.

**The deciding detail is not the deprecation.** `setup-node@v7.0.0` removes a dummy `NODE_AUTH_TOKEN` export, which is the upstream fix for the failure mode decision 10 exists to avoid. The one job in this repository where that behaviour matters is the publish job. Choosing the major that fixes it, on the change that introduces that job, is the cheapest time it will ever be available.

`v7.0.0` also added upstream documentation for publishing with a trusted publisher, which is a useful signal: the OIDC path this change depends on is now a documented use case of the action rather than something inferred from its behaviour.

Verified against this repository rather than assumed, because every major from v5 onward carries a breaking change:

| Major | Breaking change | Effect here |
|---|---|---|
| checkout v5 | Requires runner ≥ v2.327.1 | None — GitHub-hosted runners are well past it |
| setup-node v5 | Auto-caches when `package.json` declares `packageManager` | None — no such field, and `cache: npm` is already explicit |
| setup-node v6 | Automatic caching limited to npm | None — npm is the package manager |
| checkout v7 | Blocks fork PR checkout for `pull_request_target` / `workflow_run` | None — neither trigger is used |

Both majors are recent (July 2026), and that is the real cost. Weighed against it: these are first-party actions, the v7 changes are an ESM migration plus dependency bumps rather than a behavioural rewrite, checkout already has a `v7.0.1` patch out, and a defect would surface as a failed run rather than a bad publish — decision 4's ordering means the test job runs first and the version guard runs before the upload.

**Pinned by major tag (`@v7`), not by commit SHA.** SHA pinning was considered, and it is the stronger posture: it protects against a major tag being re-pointed at compromised code in the one job holding the publishing identity, which is thematically exactly what this change cares about. Declined for now on consistency and maintenance — `ci.yml` already floats within a major for both the actions and the Node pin (`'22.x'`), and SHA pinning without Dependabot configured means the pins silently rot. Recorded as a deliberate trade rather than an oversight, with a recognisable trigger: adopt SHA pinning if Dependabot is ever configured, since that removes the maintenance objection entirely.

## Risks / Trade-offs

- **[The trusted-publisher configuration lives outside the repository and no artifact can assert it]** → Accepted; it is the one irreducible manual step. Mitigated by naming the exact four values in the tasks (org `russellmacshane`, repo `russ-panel-tui`, workflow `release.yml`, no environment) and by decision 7 pinning the filename so it cannot drift casually. A mismatch fails the release before upload, so the cost is a failed run rather than a bad publish.
- **[Releasing is now two acts, and the second can be forgotten]** → A merged bump with no tag means an unreleased version. Detectable by comparing `package.json` against the registry, and preferable to the inverse failure, where a routine doc push publishes something nobody meant to release.
- **[The publish job duplicates the test job's work]** → Real, and the direct cost of decision 4's isolation. A handful of releases a year makes it irrelevant, and passing `dist/` between jobs as an artifact would mean the publish job uploads something it did not build.
- **[`ci.yml` and `release.yml` will drift]** → Accepted per decision 11. A drifted release workflow fails the release rather than silently weakening it.
- **[Enabling "disallow tokens" makes a broken workflow a total release outage]** → Sequenced last (decision 12) so the pipeline is proven first. The escape hatch is that the setting is reversible on npm's settings page by the account owner; it is not a one-way door like a published version.
- **[`--provenance` might be rejected as an unknown flag on some npm version]** → Bounded by decision 5's explicit `npm@11` pin, which is well above the version that introduced it.
- **[A tag pushed against the wrong commit publishes the wrong tree]** → The guard compares versions, not commits, so tagging the wrong commit at the right version would publish that commit. Mitigated by provenance rather than prevented: the attestation records exactly which commit produced the tarball, so the mistake is discoverable after the fact. Preventing it would require CI to own tagging, which decision 3 rules out.
- **[Both action majors are only weeks old, and are floating tags rather than SHAs]** → Accepted per decision 16. Bounded by these being first-party actions whose v7 changes are an ESM migration rather than a rewrite, and by the failure mode being a failed run rather than a bad publish. The floating-tag exposure is a deliberate trade with a stated trigger for revisiting, not an oversight.
- **[Scope creep from "we are touching CI anyway" — a Node matrix, GitHub Releases, changelog generation]** → Refused in Non-goals. GitHub Releases is the most tempting, because a tag makes it feel expected; it is unrelated to distribution and belongs with a decision about what release notes are for.

## Migration Plan

Nothing to migrate. No consumer is affected, no configuration format changes, and `0.0.1` stays on the registry exactly as it is — it simply remains the one version without an attestation.

The manual publish path continues to work until decision 12's step 4, and every step before that is reversible: the workflow can be deleted, and the trusted publisher can be removed from npm's settings page. The first irreversible act is publishing `0.1.0`, and the first hard-to-reverse configuration change is disallowing tokens, which is why they are ordered last.

## Open Questions

**None blocking.** All eleven questions deferred by `publish-to-npm-manually` are resolved: decision 1 (version source), decision 2 (non-release pushes, tag ordering, release branch — dissolved), the Context section (OIDC bootstrap — verified real), decision 12 and the credential model (OIDC over token), decision 4 (job separation), decision 9 (provenance), decision 6 (`prepublishOnly`), decision 14 (`--dry-run` on pull requests), and decision 13 (dist-tags).

Two items are deliberately deferred, with recognisable triggers rather than vague intentions:

- **A GitHub Environment with required approval** — decision 8. Trigger: a second person gains push access to the repository.
- **Changesets or an equivalent** — decision 3. Trigger: release frequency rising to where hand-bumping is the bottleneck, or a second package appearing in the repository.
- **SHA pinning for the workflow actions** — decision 16. Trigger: Dependabot being configured for GitHub Actions, which removes the maintenance objection that is the only reason it was declined.

One item is an observation to make on the first run rather than a decision to take now:

- **Whether omitting `registry-url` is correct, and whether `--provenance` was needed** — decisions 9 and 10. Both are cheap to confirm from the first release's logs, and both should be recorded here afterwards so the next reader does not re-derive them.
