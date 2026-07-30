# tui-shell Specification

## Purpose
The tui-shell capability provides the terminal UI application shell built on Ink and React. It defines the executable entry point, the long-lived session and how the user leaves it, ownership of terminal state (the alternate screen buffer and its restoration), the viewport-sized root layout that panels render into, and the TypeScript build step that produces runnable output.

## Requirements

### Requirement: Application entry point
The system SHALL provide an executable entry point that mounts a root React component into the terminal using Ink's `render`.

#### Scenario: Launching the app
- **WHEN** the user runs the built entry point (`node dist/cli.js`)
- **THEN** Ink mounts the root `<App>` component and renders it to the terminal without errors

### Requirement: Persistent session
The application SHALL remain running after its first render, continuing to accept input and update the display, until the user explicitly quits.

#### Scenario: App stays open after rendering
- **WHEN** the app has finished its first render
- **THEN** the process remains alive, the display stays on screen, and the user is not returned to the shell prompt

#### Scenario: App keeps responding to input over time
- **WHEN** the app has been running with no input for an extended period
- **THEN** the process is still alive and still responds to key presses

### Requirement: Quit binding
The application SHALL provide a documented key binding that terminates the session when normal mode is active, and SHALL terminate on Ctrl-C regardless of which mode is active.

#### Scenario: Quitting with the quit key
- **WHEN** the user presses `q` in normal mode
- **THEN** the application unmounts, restores the terminal, and exits with code 0

#### Scenario: Quitting with Ctrl-C
- **WHEN** the user presses Ctrl-C
- **THEN** the application unmounts, restores the terminal, and exits

#### Scenario: Ctrl-C works from any mode
- **WHEN** the user presses Ctrl-C while a text-entry mode is active
- **THEN** the application still unmounts, restores the terminal, and exits, so there is always an escape hatch

#### Scenario: The quit key does not quit from a text-entry mode
- **WHEN** the user presses `q` while a text-entry mode is active
- **THEN** the application does not exit and the character is treated as input

### Requirement: Clean exit
The application SHALL terminate only in response to a user quit action or a termination signal, and SHALL return control to the shell with a success exit code when quit normally.

#### Scenario: Process exits cleanly
- **WHEN** the user quits the application
- **THEN** the process exits with code 0 and returns the user to their shell prompt

#### Scenario: Process does not exit on its own
- **WHEN** the app has finished rendering and the user has not quit
- **THEN** the process does not exit

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
The application SHALL display a persistent footer listing the key bindings available in the currently active input mode, so that the user can always see how to interact with and leave the app.

#### Scenario: Footer is visible
- **WHEN** the app is running in normal mode
- **THEN** a footer is displayed showing at minimum the quit binding, the refresh binding, and the binding that opens the location search

#### Scenario: Footer reflects the active mode
- **WHEN** a mode other than normal mode is active
- **THEN** the footer shows that mode's bindings rather than the normal-mode bindings, including how to leave the mode

#### Scenario: Footer is never empty
- **WHEN** any mode is active
- **THEN** the footer displays at least one binding, so the user is never left without a documented way forward

### Requirement: Input modes
The shell SHALL track which input mode is active and SHALL route key presses to that mode. A mode that accepts text entry SHALL receive printable characters as literal input, and SHALL NOT trigger the shell's normal-mode bindings.

#### Scenario: Printable keys reach a text field
- **WHEN** a text-entry mode is active and the user types characters that are bound in normal mode, such as `q` or `r`
- **THEN** those characters are inserted into the text being entered, the application does not quit, and no refresh is triggered

#### Scenario: Normal-mode bindings are inert while another mode is active
- **WHEN** a text-entry mode is active
- **THEN** the normal-mode bindings have no effect until that mode is left

#### Scenario: Normal-mode bindings resume
- **WHEN** the user leaves a text-entry mode and returns to normal mode
- **THEN** the normal-mode bindings take effect again

#### Scenario: Entering the location mode
- **WHEN** the user presses `l` in normal mode
- **THEN** the location search mode becomes active and takes over the content area

#### Scenario: Leaving a mode with Escape
- **WHEN** the user presses Escape while a text-entry mode is active
- **THEN** the mode is dismissed without applying a change, and the application does not exit

### Requirement: Modal content fits the viewport
Content rendered by an active mode SHALL be bounded by the terminal's current dimensions, so that a list of options cannot overflow the visible area. The space taken by the footer and by the notice area, when a notice is present, SHALL be excluded from the space available to the mode.

#### Scenario: A list longer than the available height
- **WHEN** a mode displays more options than the terminal has rows to show
- **THEN** the visible options are limited to what fits, and the highlighted option is always among those shown

#### Scenario: Resizing while a mode is active
- **WHEN** the terminal is resized while a mode is active
- **THEN** the mode's content re-renders within the new dimensions with no content exceeding the visible area

#### Scenario: A notice reduces the space available to a mode
- **WHEN** a notice is displayed while a mode renders more options than the remaining rows can show
- **THEN** the mode's content is bounded by the space left after the notice and footer, and the highlighted option remains visible

### Requirement: Notice area
The shell SHALL provide a single-line notice area, distinct from both the content area and the keybinding footer, where the application can post a short message such as a warning. The notice area SHALL be visible regardless of the active mode, SHALL display at most one message at a time, and SHALL occupy no space when there is no message. A posted message SHALL remain until the condition that raised it is resolved or another message replaces it, and SHALL NOT be removed on a timer.

#### Scenario: Posting a notice
- **WHEN** a component posts a notice message
- **THEN** the message is displayed on a single line, distinct from the footer and the content area, in whichever mode is active

#### Scenario: No notice occupies no space
- **WHEN** no notice message is posted, or the current notice has been cleared
- **THEN** the notice area occupies no rows and the content area reclaims that space, so the layout matches an app with nothing to report

#### Scenario: At most one notice at a time
- **WHEN** a notice is posted while an earlier notice is still displayed
- **THEN** the later message replaces the earlier one, so that only one notice is ever shown

#### Scenario: A notice is not dismissed on a timer
- **WHEN** a notice has been posted
- **THEN** it remains displayed until it is cleared or replaced by the application, rather than disappearing after an interval, so that no injectable clock is required to display or test it

### Requirement: Build step
The project SHALL compile TypeScript sources in `src/` to runnable JavaScript in `dist/` via `tsc`.

#### Scenario: Building the project
- **WHEN** the user runs `npm run build`
- **THEN** `tsc` compiles `src/*.tsx` to `dist/` with no type errors and produces a runnable `dist/cli.js`
