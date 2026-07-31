# publish-from-ci

Automate npm publishing from GitHub Actions on a green push to `main`: a test gate, a git tag, OIDC trusted publishing, and provenance attestation.

**Placeholder. No artifacts yet, deliberately** — so this appears in `openspec list` as unfinished work rather than going quiet in the archive.

## Where the thinking already lives

`publish-to-npm-manually` published the package by hand and deferred every CI/CD question to this change. Its `design.md` **Open Questions** section records all eleven with the reasoning for each deferral. Start there — do not re-derive them:

- `openspec/changes/publish-to-npm-manually/design.md` → `## Open Questions`
- `openspec/changes/publish-to-npm-manually/proposal.md` → `### Non-goals`

Once that change is archived, the same files live under `openspec/changes/archive/<date>-publish-to-npm-manually/`.

## The two that shape everything else

1. **Where does the version number come from** — `package.json` as source of truth, tag-triggered, or derived from conventional commits. This determines whether CI needs write access to the repository and whether releases are automatic or deliberate.
2. **Is the OIDC bootstrap assumption real** — `publish-to-npm-manually` assumed a package's trusted-publisher settings cannot be configured before the package exists, and flagged it as unverified against current npm documentation. Verify before designing around it.

## Already settled, do not relitigate

Package name `@rmacshane-lw/russ-panel-tui`, command `russ-panel`, tarball is `dist/` only via a `files` allowlist, no source maps, no import surface. See that change's `design.md` decisions 2, 3, 5, 6, and 7.
