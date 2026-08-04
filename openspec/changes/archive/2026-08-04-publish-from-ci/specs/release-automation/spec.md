## ADDED Requirements

### Requirement: Releases are triggered by a version tag
A release SHALL be initiated by pushing a version tag, and SHALL NOT be initiated by pushing or merging to any branch. Routine pushes that are not releases SHALL therefore require no registry interaction and SHALL have no path to publishing.

#### Scenario: Pushing a version tag triggers a release
- **WHEN** a tag matching the version pattern `v*` is pushed to the repository
- **THEN** the release workflow runs and, if every gate passes, publishes that version to the registry

#### Scenario: Merging to the default branch does not publish
- **WHEN** a commit is pushed or merged to `main`, including a commit that raises the version in `package.json`
- **THEN** no publish is attempted, no registry credential is requested, and the continuous integration checks run exactly as they do for any other branch

#### Scenario: A documentation-only push cannot reach the release path
- **WHEN** a push contains only changes to planning artifacts, the README, or other non-shipping files
- **THEN** no release workflow run is created, and no step queries the registry to decide whether to publish

#### Scenario: Re-pushing an already released tag fails loudly
- **WHEN** a tag naming a version that is already present on the registry is pushed
- **THEN** the release fails with a reported error rather than silently skipping, because a duplicate release is an anomaly and not a routine outcome

### Requirement: The published version comes from the manifest, and the tag must agree with it
The version that is published SHALL be the version declared in `package.json`, because that is the value the registry receives. The tag SHALL serve only as the trigger and SHALL be verified against the manifest before any upload, so that a tag can never name a version different from the one actually published.

#### Scenario: The tag and the manifest agree
- **WHEN** the pushed tag's version matches the `version` field in `package.json`
- **THEN** the release proceeds

#### Scenario: The tag and the manifest disagree
- **WHEN** the pushed tag's version does not match the `version` field in `package.json`
- **THEN** the release fails before the registry is contacted, reporting both values, and nothing is uploaded

#### Scenario: The tag cannot introduce a version of its own
- **WHEN** a release completes
- **THEN** the version present on the registry is the one that was declared in `package.json` at the released commit, and no step has rewritten that field

#### Scenario: The version is set separately from the release
- **WHEN** the version in `package.json` is raised
- **THEN** that change is an ordinary reviewable change to the repository, and it does not itself cause a release

### Requirement: A green test suite gates every publish
The release SHALL run the build, the type check, and the full test suite before any tarball is uploaded, and SHALL abort the publish if any of them fails. This gate SHALL run from the tagged commit rather than from any previously recorded result.

#### Scenario: A failing test blocks the release
- **WHEN** the test suite fails during a release
- **THEN** the publish does not run, nothing is uploaded, and the failure is reported against the tag

#### Scenario: A type error blocks the release
- **WHEN** the sources or the tests contain a type error during a release
- **THEN** the publish does not run and nothing is uploaded

#### Scenario: The gate runs against the released commit
- **WHEN** a release runs
- **THEN** the suite executes against a clean checkout of the tagged commit, so a previously green result on another commit cannot substitute for it

### Requirement: Publishing authenticates without a stored credential
Publishing SHALL authenticate to the registry by exchanging a short-lived workload identity token issued to the workflow run. No long-lived registry credential SHALL be stored in the repository, in a repository or organisation secret, or in the workflow environment.

#### Scenario: No registry token exists in the repository or its secrets
- **WHEN** the repository, its workflows, and its configured secrets are inspected
- **THEN** none contains a registry authentication token, and the publish step references none

#### Scenario: The workflow requests an identity token
- **WHEN** the publishing job runs
- **THEN** it is granted permission to write an identity token, and the registry accepts the resulting exchange as proof of the repository, workflow, and ref that produced the release

#### Scenario: A release from an unregistered source is refused
- **WHEN** a publish is attempted from a workflow, repository, or ref that the registry's trusted publisher configuration does not name
- **THEN** the registry refuses the publish, because the identity token cannot satisfy the configured claim

#### Scenario: Publishing outside continuous integration is closed off
- **WHEN** the release pipeline has been verified and the package's registry settings have been hardened to require two-factor authentication and disallow tokens
- **THEN** no credential capable of publishing the package exists outside the workflow identity exchange, and a publish attempted from a maintainer's machine is refused

### Requirement: The publishing identity is isolated from dependency installation
Because installing dependencies executes lifecycle scripts from the entire transitive dependency tree, the permission to request an identity token SHALL be granted only to the job that publishes, and SHALL NOT be granted to the job that runs the test suite.

#### Scenario: Only the publishing job can request an identity token
- **WHEN** the release workflow's permissions are inspected
- **THEN** identity-token write permission is granted to the publishing job alone, and the testing job holds read-only repository permission with no identity-token permission

#### Scenario: The publishing job runs only after the gate passes
- **WHEN** the testing job fails
- **THEN** the publishing job does not start, so no identity token is issued for a release that was never going to ship

#### Scenario: Neither job is granted write access to the repository
- **WHEN** the release workflow's permissions are inspected
- **THEN** no job holds write access to repository contents, because the release neither commits a version change nor creates a tag

### Requirement: The publishing toolchain meets the registry's trusted-publishing floor
Trusted publishing is rejected by registry-side validation below a minimum package-manager version, and the package manager bundled with the project's pinned runtime is below that minimum. The release SHALL therefore install a package-manager version that satisfies the floor before publishing, and that version SHALL be pinned rather than floating.

#### Scenario: The publish step runs a package manager that supports trusted publishing
- **WHEN** the publishing job reaches the publish step
- **THEN** the package manager in use is at or above the minimum version that trusted publishing requires, rather than the version bundled with the pinned runtime

#### Scenario: The requirement is stated in the workflow rather than implied by a runtime choice
- **WHEN** the release workflow is inspected
- **THEN** it contains an explicit step that installs the required package-manager version, so that changing the runtime version cannot silently remove the capability

#### Scenario: The installed version is pinned
- **WHEN** the package-manager install step is inspected
- **THEN** it names a pinned major version rather than the latest available release, so that an upstream release cannot change the behaviour of the one job that performs an irreversible operation

### Requirement: Published releases carry provenance
A release published from continuous integration SHALL carry a provenance attestation linking the uploaded tarball to the source repository and the commit it was built from, so that a published version is independently verifiable.

#### Scenario: A provenance attestation is generated
- **WHEN** a release is published
- **THEN** the registry records a provenance attestation for that version, and the package page reports that it was built and signed on continuous integration

#### Scenario: Provenance is requested explicitly
- **WHEN** the publish step is inspected
- **THEN** provenance is requested explicitly rather than relied upon as a default, so that its presence is visible in the workflow and its absence cannot go unnoticed

#### Scenario: The repository metadata supports attestation
- **WHEN** `package.json` is inspected
- **THEN** its `repository` field names the source repository in the form the registry matches against when validating an attestation

#### Scenario: The first manually published version has no attestation
- **WHEN** version `0.0.1` is inspected on the registry
- **THEN** it carries no provenance attestation, which is the expected consequence of its having been published by hand and is not a defect

### Requirement: The release workflow filename is a registered identifier
The registry's trusted publisher configuration names the release workflow by filename, and validation fails when the two disagree. The filename SHALL therefore be treated as part of the release's configuration rather than as a freely changeable detail.

#### Scenario: The workflow filename matches the registered configuration
- **WHEN** a release runs
- **THEN** the workflow's filename is the one named in the registry's trusted publisher configuration, and the identity claim is accepted

#### Scenario: Renaming the workflow breaks publishing until the registry is updated
- **WHEN** the release workflow file is renamed without updating the registry's trusted publisher configuration
- **THEN** the publish is refused, and restoring the ability to publish requires changing the registry configuration and not only the repository

### Requirement: A single release channel
The project SHALL publish to one release channel. No secondary distribution tag and no prerelease channel SHALL be maintained.

#### Scenario: Releases go to the default channel
- **WHEN** a release is published
- **THEN** it is published to the registry's default `latest` channel and no other distribution tag is set

#### Scenario: No prerelease channel exists
- **WHEN** the registry's distribution tags for the package are inspected
- **THEN** only `latest` is present
