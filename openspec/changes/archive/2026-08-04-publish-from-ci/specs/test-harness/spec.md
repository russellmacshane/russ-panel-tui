## MODIFIED Requirements

### Requirement: Continuous integration
The test suite SHALL run automatically in continuous integration on pushes and pull requests, together with the build, and a failure SHALL be reported as a failed check. The same suite SHALL additionally run as the gate on a release, where a failure SHALL prevent the release from publishing rather than only being reported.

#### Scenario: A pull request with a failing test
- **WHEN** a pull request contains a change that breaks a test
- **THEN** continuous integration reports a failing check for that pull request

#### Scenario: A pull request that does not compile
- **WHEN** a pull request contains a type error
- **THEN** the build step fails in continuous integration and is reported

#### Scenario: A passing pull request
- **WHEN** a pull request compiles and all tests pass
- **THEN** continuous integration reports a successful check

#### Scenario: The suite gates a release
- **WHEN** a release is triggered and the suite fails
- **THEN** the publish does not run and nothing is uploaded to the registry, so the consequence of a failure on the release path is a blocked release rather than a red check on an already-published version

#### Scenario: The release gate runs the same commands as the branch checks
- **WHEN** the release gate runs
- **THEN** it runs the same build, type check, and test commands that pushes and pull requests run, so a suite that passes on a branch is not gated differently when it is released
