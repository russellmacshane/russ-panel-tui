## ADDED Requirements

### Requirement: Persistent session
The application SHALL remain running after its first render, continuing to accept input and update the display, until the user explicitly quits.

#### Scenario: App stays open after rendering
- **WHEN** the app has finished its first render
- **THEN** the process remains alive, the display stays on screen, and the user is not returned to the shell prompt

#### Scenario: App keeps responding to input over time
- **WHEN** the app has been running with no input for an extended period
- **THEN** the process is still alive and still responds to key presses

### Requirement: Quit binding
The application SHALL provide a documented key binding that terminates the session, and SHALL also terminate on Ctrl-C.

#### Scenario: Quitting with the quit key
- **WHEN** the user presses `q`
- **THEN** the application unmounts, restores the terminal, and exits with code 0

#### Scenario: Quitting with Ctrl-C
- **WHEN** the user presses Ctrl-C
- **THEN** the application unmounts, restores the terminal, and exits

### Requirement: Alternate screen buffer
The application SHALL render into the terminal's alternate screen buffer, so that its output does not enter the user's scrollback.

#### Scenario: Taking over the screen on launch
- **WHEN** the app starts
- **THEN** the terminal switches to the alternate screen buffer before the first frame is painted, and the cursor is hidden

#### Scenario: Scrollback is left untouched
- **WHEN** the user quits the app
- **THEN** the terminal displays the same scrollback content it had before the app was launched, with no frames of app output left behind

### Requirement: Terminal restoration on every exit path
The application SHALL restore the primary screen buffer and cursor visibility on every exit path, including abnormal ones. Restoration SHALL be idempotent, so that running it more than once is harmless.

#### Scenario: Restoring after a normal quit
- **WHEN** the user quits with the quit key
- **THEN** the primary screen buffer is restored and the cursor is visible

#### Scenario: Restoring after a termination signal
- **WHEN** the process receives SIGINT or SIGTERM
- **THEN** the primary screen buffer is restored and the cursor is visible before the process exits

#### Scenario: Restoring after an unhandled error
- **WHEN** an uncaught exception or unhandled promise rejection occurs while the app is running
- **THEN** the primary screen buffer is restored, the cursor is visible, the error is printed to the restored terminal where the user can read it, and the process exits with a non-zero code

### Requirement: Viewport-sized layout
The application SHALL size its root layout to the terminal's current dimensions and SHALL adapt when the terminal is resized, so that content never exceeds the visible area.

#### Scenario: Filling the terminal on launch
- **WHEN** the app starts
- **THEN** the root layout occupies the full width and height of the terminal

#### Scenario: Adapting to a resize
- **WHEN** the user resizes the terminal window while the app is running
- **THEN** the layout re-renders at the new dimensions with no leftover or smeared content from the previous size

### Requirement: Keybinding footer
The application SHALL display a persistent footer listing the currently available key bindings, so that the user can always see how to interact with and leave the app.

#### Scenario: Footer is visible
- **WHEN** the app is running
- **THEN** a footer is displayed showing at minimum the quit binding and the refresh binding

## MODIFIED Requirements

### Requirement: Clean exit
The application SHALL terminate only in response to a user quit action or a termination signal, and SHALL return control to the shell with a success exit code when quit normally.

#### Scenario: Process exits cleanly
- **WHEN** the user quits the application
- **THEN** the process exits with code 0 and returns the user to their shell prompt

#### Scenario: Process does not exit on its own
- **WHEN** the app has finished rendering and the user has not quit
- **THEN** the process does not exit

## REMOVED Requirements

### Requirement: Hello-world render
**Reason**: The bootstrap greeting was scaffolding to prove the toolchain. The shell now renders the weather panel and its keybinding footer instead.
**Migration**: None required — no consumer depends on the greeting. Display behavior is now covered by the `weather-panel` capability and the Keybinding footer requirement above.
