## ADDED Requirements

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
Content rendered by an active mode SHALL be bounded by the terminal's current dimensions, so that a list of options cannot overflow the visible area.

#### Scenario: A list longer than the available height
- **WHEN** a mode displays more options than the terminal has rows to show
- **THEN** the visible options are limited to what fits, and the highlighted option is always among those shown

#### Scenario: Resizing while a mode is active
- **WHEN** the terminal is resized while a mode is active
- **THEN** the mode's content re-renders within the new dimensions with no content exceeding the visible area

## MODIFIED Requirements

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
