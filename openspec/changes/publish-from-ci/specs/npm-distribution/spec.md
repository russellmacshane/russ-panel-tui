## ADDED Requirements

### Requirement: Pull requests report the tarball contents
Because the tarball's contents are governed by an allowlist that a change can itself edit, every pull request SHALL report the exact file list that would be published, so that a change which would newly ship something unwanted is visible during review rather than after a version exists.

#### Scenario: The file list is reported on a pull request
- **WHEN** a pull request is opened or updated
- **THEN** continuous integration performs a publish dry run and reports the list of files the tarball would contain, without contacting the registry to publish and without consuming a version number

#### Scenario: A change to the allowlist is visible in review
- **WHEN** a pull request modifies the `files` allowlist, or adds a file that the allowlist admits
- **THEN** the reported file list differs from the previous run, making the change in published contents reviewable

#### Scenario: The dry run does not publish
- **WHEN** the dry run runs on a pull request
- **THEN** no version is uploaded, no registry credential is requested, and the registry's contents are unchanged

## MODIFIED Requirements

### Requirement: Publishing cannot ship a stale build
Because compiled output is not tracked in version control, any tree from which a publish is initiated — a working tree or a checkout of a tagged commit in continuous integration — can hold a stale, partial, or absent build. Publishing SHALL therefore rebuild from sources and SHALL verify the test suite before any tarball is uploaded, and SHALL abort if either fails. This guard SHALL live with the package manifest rather than only in the automated pipeline, so that it holds on every publishing path.

#### Scenario: A fresh build is produced at publish time
- **WHEN** a publish is initiated
- **THEN** sources are recompiled before the tarball is created, so the published output cannot be older than the sources of the tree being published

#### Scenario: A failing test suite blocks publishing
- **WHEN** a publish is initiated and any test fails
- **THEN** the publish aborts and nothing is uploaded to the registry

#### Scenario: A type error blocks publishing
- **WHEN** a publish is initiated and the sources or tests contain a type error
- **THEN** the publish aborts and nothing is uploaded to the registry

#### Scenario: An automated publish builds from the released commit
- **WHEN** a publish is initiated from continuous integration against a clean checkout that contains no compiled output
- **THEN** the guard produces the build, so the uploaded tarball is compiled from the exact commit being released rather than from any earlier artifact

#### Scenario: The guard survives independently of the pipeline
- **WHEN** a publish is initiated from a maintainer's machine rather than from continuous integration
- **THEN** the same rebuild and the same verification run, because the guard is declared in the package manifest and is not a property of the workflow

### Requirement: Local tarball validation precedes any registry publish
Because published versions are immutable and cannot be replaced, the full install path SHALL be exercisable from a locally built tarball with no registry involvement. This validation SHALL be performed whenever packaging behaviour, the executable entry point, or the tarball's contents change, so that a defect in the install path is found before a release depends on it. It is a development practice rather than the last gate before the registry: the automated test gate and the pull-request file-list report hold the blocking role.

#### Scenario: The tarball is built and inspected locally
- **WHEN** the maintainer builds the package tarball locally
- **THEN** its contents can be listed and asserted against the allowlist before any publish occurs

#### Scenario: Installing from the local tarball
- **WHEN** the locally built tarball is installed globally
- **THEN** the `russ-panel` command resolves on `PATH` and launches the application, exercising the interpreter directive, the executable bit, and the command symlink without contacting the registry

#### Scenario: The validation loop consumes no version numbers
- **WHEN** local tarball validation is run repeatedly
- **THEN** no version number is consumed and no registry state changes, so the loop can be repeated freely until it passes

#### Scenario: The install path is revalidated when packaging changes
- **WHEN** a change modifies the tarball allowlist, the declared executable, the compiled entry point, or the build configuration
- **THEN** the local install loop is run before that change is released, because these are the changes an automated test suite cannot fully exercise

#### Scenario: The dry run is automatic rather than a remembered step
- **WHEN** a change that would alter the published file list is proposed
- **THEN** the publish dry run that reports the file list runs automatically on the pull request, rather than depending on a maintainer performing it immediately before publishing

### Requirement: Documented installation
The README SHALL document how to install and run the published package, in addition to the existing instructions for building from a checkout, and SHALL state how released versions are produced so that a reader can tell what a published version is verifiable against.

#### Scenario: Install instructions are present
- **WHEN** a reader consults the README
- **THEN** it states the published package name, the global install command, the `npx` invocation, the resulting `russ-panel` command, and the required Node version

#### Scenario: Building from source remains documented
- **WHEN** a reader consults the README
- **THEN** the existing clone-and-build instructions are still present and still correct

#### Scenario: How releases are produced is documented
- **WHEN** a reader consults the README
- **THEN** it states that released versions are published from continuous integration when a version tag is pushed, and that they carry a provenance attestation linking the package to the commit it was built from
