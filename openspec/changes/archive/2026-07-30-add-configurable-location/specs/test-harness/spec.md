## ADDED Requirements

### Requirement: Filesystem isolation
The test suite SHALL NOT read or write the developer's real configuration directory. Test execution SHALL redirect the configuration directory to a disposable location before any test runs, so that configuration reads and writes are exercised against a real filesystem without escaping into the developer's home directory.

#### Scenario: The real configuration directory is unreachable
- **WHEN** code under test resolves the configuration directory during a test
- **THEN** it resolves to a disposable test-owned directory, and the developer's own configuration directory is neither read nor written

#### Scenario: Configuration writes are exercised for real
- **WHEN** a test causes configuration to be written
- **THEN** a real file is written to the disposable directory and can be read back, rather than the write being mocked away

#### Scenario: Configuration does not leak between tests
- **WHEN** one test writes a configuration file and a later test does not
- **THEN** the later test observes no configuration file, and behaves as it would on a first run

#### Scenario: Suite passes on a machine with no prior configuration
- **WHEN** the suite is run on a machine that has never run the application
- **THEN** every test passes and no test is skipped as a result

#### Scenario: Disposable directories are cleaned up
- **WHEN** the suite finishes
- **THEN** the directories it created are removed, leaving no accumulating test data on the machine

### Requirement: Simulating unusable configuration
The harness SHALL let a test place the configuration in a state that cannot be read or cannot be written, so that the application's fallback and warning behaviour can be asserted.

#### Scenario: Asserting behaviour on a malformed configuration
- **WHEN** a test writes a configuration file whose contents are not valid for the application
- **THEN** the application's fallback to the default and its warning can both be asserted

#### Scenario: Asserting behaviour when a write fails
- **WHEN** a test arranges for the configuration write to fail
- **THEN** the application's session-only behaviour and its warning can both be asserted, without the test being skipped on platforms where the arrangement is unavailable
