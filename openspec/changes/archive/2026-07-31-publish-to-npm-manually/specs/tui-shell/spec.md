## ADDED Requirements

### Requirement: Interactive input is required to run
The application depends on raw-mode keyboard input, which the terminal provides only when standard input is an interactive terminal. When standard input is not an interactive terminal, the application SHALL refuse to start, reporting a single readable diagnostic on standard error and exiting with a non-zero status, rather than failing from inside the rendering library with an internal stack trace. This requirement concerns standard *input* and is independent of whether standard output is a terminal.

#### Scenario: Refusing to start without interactive input
- **WHEN** the app is launched with its standard input connected to a pipe, a file, or `/dev/null` rather than a terminal
- **THEN** it writes one readable message to standard error stating that an interactive terminal is required, exits with a non-zero status, and never mounts the rendering layer

#### Scenario: The refusal precedes any change to terminal state
- **WHEN** the app refuses to start because standard input is not interactive
- **THEN** no alternate screen buffer sequence and no cursor visibility sequence has been written to standard output, because the check runs before the switch is attempted

#### Scenario: The refusal is a diagnostic, not an internal error
- **WHEN** the app refuses to start because standard input is not interactive
- **THEN** the reported message is a deliberate diagnostic naming the actual requirement, and is not an unhandled exception or a stack trace originating inside the rendering library

#### Scenario: An interactive launch is unaffected
- **WHEN** the app is launched with an interactive standard input
- **THEN** it starts and behaves exactly as specified elsewhere in this capability, emitting no additional output

## MODIFIED Requirements

### Requirement: Application entry point
The system SHALL provide an executable entry point that mounts a root React component into the terminal using Ink's `render`. The compiled entry point SHALL begin with an interpreter directive so that it can be executed directly, and SHALL be reachable both as a script passed to Node and as an installed command.

#### Scenario: Launching the app
- **WHEN** the user runs the built entry point (`node dist/cli.js`)
- **THEN** Ink mounts the root `<App>` component and renders it to the terminal without errors

#### Scenario: The compiled entry point carries an interpreter directive
- **WHEN** the first line of the compiled entry point `dist/cli.js` is inspected after a build
- **THEN** it is `#!/usr/bin/env node`, preserved from the source file rather than added by a separate post-build step

#### Scenario: Launching as an installed command
- **WHEN** the package is installed and the user runs the installed command in an interactive terminal
- **THEN** Ink mounts the root `<App>` component and renders it, with behaviour indistinguishable from running `node dist/cli.js` from a checkout

### Requirement: Alternate screen buffer
When standard output is an interactive terminal, the application SHALL render into the terminal's alternate screen buffer, so that its output does not enter the user's scrollback. When standard output is not an interactive terminal, the application SHALL NOT emit screen-buffer or cursor control sequences, so that captured or redirected output is not polluted with escape codes.

#### Scenario: Taking over the screen on launch
- **WHEN** the app starts with an interactive terminal attached
- **THEN** the terminal switches to the alternate screen buffer before the first frame is painted, and the cursor is hidden

#### Scenario: Scrollback is left untouched
- **WHEN** the user quits the app
- **THEN** the terminal displays the same scrollback content it had before the app was launched, with no frames of app output left behind

#### Scenario: No control sequences when output is redirected
- **WHEN** the app is launched with its standard output redirected to a file or a pipe rather than a terminal
- **THEN** no alternate screen buffer sequence and no cursor visibility sequence is written to that output

#### Scenario: A redirected-output launch with interactive input does not crash
- **WHEN** the app is launched with an interactive standard input but with its standard output redirected to a file or a pipe
- **THEN** the process does not crash on startup, it writes no screen-buffer or cursor control sequences to that output, and it remains terminable by a signal

### Requirement: Terminal restoration on every exit path
The application SHALL restore the primary screen buffer and cursor visibility on every exit path, including abnormal ones, whenever it switched away from them. Restoration SHALL be idempotent, so that running it more than once is harmless, and SHALL be harmless when standard output is not an interactive terminal and no switch occurred.

#### Scenario: Restoring after a normal quit
- **WHEN** the user quits with the quit key
- **THEN** the primary screen buffer is restored and the cursor is visible

#### Scenario: Restoring after a termination signal
- **WHEN** the process receives SIGINT or SIGTERM
- **THEN** the primary screen buffer is restored and the cursor is visible before the process exits

#### Scenario: Restoring after an unhandled error
- **WHEN** an uncaught exception or unhandled promise rejection occurs while the app is running
- **THEN** the primary screen buffer is restored, the cursor is visible, the error is printed to the restored terminal where the user can read it, and the process exits with a non-zero code

#### Scenario: Restoration is inert when no switch occurred
- **WHEN** the app exits after having been launched with a non-interactive standard output
- **THEN** restoration writes no control sequences, and the exit path completes without error

#### Scenario: An error is still reported when output is redirected
- **WHEN** an uncaught exception occurs while the app is running with a non-interactive standard output
- **THEN** the error is still reported where the user can read it and the process still exits with a non-zero code

### Requirement: Build step
The project SHALL compile TypeScript sources in `src/` to runnable JavaScript in `dist/` via `tsc`. The compiled `dist/` output SHALL be the only artifact distributed, and SHALL be produced from sources at publish time rather than reused from the working tree.

#### Scenario: Building the project
- **WHEN** the user runs `npm run build`
- **THEN** `tsc` compiles `src/*.tsx` to `dist/` with no type errors and produces a runnable `dist/cli.js`

#### Scenario: Compiled output is what ships
- **WHEN** the package is published
- **THEN** the distributed artifact contains the compiled `dist/` output and does not contain the TypeScript sources it was built from

#### Scenario: Compiled output is not reused from the working tree at publish time
- **WHEN** a publish is initiated while `dist/` is absent, stale, or partially built
- **THEN** sources are recompiled before the artifact is created, so the working tree's build state cannot determine what is published
