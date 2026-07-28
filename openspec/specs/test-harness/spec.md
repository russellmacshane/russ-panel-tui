# test-harness Specification

## Purpose
The test-harness capability provides the project's automated testing foundation. It defines the commands that run the suite, the network isolation that keeps tests off the wire, the reusable harness for rendering Ink components against a fake terminal (including controllable dimensions and simulated input), the determinism guarantees that make results independent of the host machine's clock and locale, and the continuous integration that runs the suite and the build on every push and pull request.

## Requirements

### Requirement: Test command
The project SHALL provide a single command that runs the whole automated test suite, and a watch variant for local development. The suite SHALL run without a prior build step.

#### Scenario: Running the suite
- **WHEN** a developer runs `npm test`
- **THEN** every test file in the project executes and the command exits non-zero if any test fails

#### Scenario: No build required
- **WHEN** the suite is run against a clean checkout with no `dist/` directory
- **THEN** the tests execute against the TypeScript sources directly, including files containing JSX

#### Scenario: Watching during development
- **WHEN** a developer runs the watch command and edits a source or test file
- **THEN** the affected tests re-run without restarting the command

### Requirement: Network isolation
The test suite SHALL NOT issue network requests. Test execution SHALL replace the global `fetch` before any test runs, and an unprogrammed request SHALL fail the test loudly rather than reaching the network or returning a silent default.

#### Scenario: Unprogrammed request fails loudly
- **WHEN** code under test calls `fetch` without the test having programmed a response
- **THEN** the call throws an error naming the requested URL, and the test fails

#### Scenario: Suite passes with no network access
- **WHEN** the suite is run on a machine with no network connectivity
- **THEN** every test passes and no test is skipped as a result

#### Scenario: Programmed response is returned
- **WHEN** a test programs a response for a request and the code under test calls `fetch`
- **THEN** the programmed response is returned without a real request being made

#### Scenario: Stub does not leak between tests
- **WHEN** one test programs a response and a later test does not
- **THEN** the later test sees the default-deny behaviour, not the earlier test's response

### Requirement: Controllable pending requests
The harness SHALL let a test hold a request in flight and resolve or reject it on demand, so that behaviour occurring while a request is pending can be asserted deterministically.

#### Scenario: Asserting state while a request is pending
- **WHEN** a test programs a request that has not yet settled
- **THEN** the test can make assertions about the pending state before choosing to resolve or reject it

#### Scenario: Rejecting with a specific failure
- **WHEN** a test rejects a pending request with a chosen error name, such as a timeout or an abort
- **THEN** the code under test observes that error and the resulting user-facing message can be asserted

### Requirement: Ink component harness
The project SHALL provide a reusable harness for rendering Ink components against a fake terminal, exposing the rendered frames and accepting simulated keyboard input. The harness SHALL be usable by any future panel without modification.

#### Scenario: Rendering a component and reading output
- **WHEN** a test renders a component through the harness
- **THEN** the test can read the most recently rendered frame as text

#### Scenario: Sending keyboard input
- **WHEN** a test writes a key to the harness's input stream
- **THEN** components using Ink's input handling receive that key and may update in response

#### Scenario: Awaiting an asynchronous update
- **WHEN** a test triggers an update that settles asynchronously
- **THEN** the test can await the rendered output being flushed rather than waiting a fixed delay

#### Scenario: Unmounting
- **WHEN** a test unmounts a rendered component
- **THEN** teardown effects run and no further frames are produced

### Requirement: Controllable terminal dimensions
The harness's fake terminal SHALL expose configurable dimensions and SHALL be able to emit a resize event, so that layout behaviour at a given size and across a size change can both be asserted.

#### Scenario: Rendering at a chosen size
- **WHEN** a test renders through the harness with specified columns and rows
- **THEN** components reading the terminal size observe those values

#### Scenario: Simulating a resize
- **WHEN** a test changes the fake terminal's dimensions and emits a resize event
- **THEN** components listening for resizes observe the new dimensions and re-render

#### Scenario: Reporting no size
- **WHEN** the fake terminal reports zero or absent dimensions
- **THEN** components relying on a fallback size can be asserted against that fallback

### Requirement: Deterministic results
The test suite SHALL produce the same result regardless of the host machine's timezone, locale, or the current time. Tests SHALL NOT assert on formatted wall-clock output.

#### Scenario: Timezone independence
- **WHEN** the suite is run on machines in different timezones
- **THEN** the results are identical

#### Scenario: Asserting a timestamp is displayed
- **WHEN** a test verifies that a retrieval time is shown to the user
- **THEN** it asserts that a timestamp is present rather than asserting its formatted value

#### Scenario: Repeated runs agree
- **WHEN** the suite is run twice in succession with no code changes
- **THEN** both runs produce the same result, with no test passing only on the first run

### Requirement: Continuous integration
The test suite SHALL run automatically in continuous integration on pushes and pull requests, together with the build, and a failure SHALL be reported as a failed check.

#### Scenario: A pull request with a failing test
- **WHEN** a pull request contains a change that breaks a test
- **THEN** continuous integration reports a failing check for that pull request

#### Scenario: A pull request that does not compile
- **WHEN** a pull request contains a type error
- **THEN** the build step fails in continuous integration and is reported

#### Scenario: A passing pull request
- **WHEN** a pull request compiles and all tests pass
- **THEN** continuous integration reports a successful check
