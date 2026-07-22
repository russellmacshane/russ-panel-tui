# tui-shell Specification

## Purpose
The tui-shell capability provides the terminal UI application shell built on Ink and React. It defines the executable entry point, the initial render, process lifecycle, and the TypeScript build step that produces runnable output.

## Requirements

### Requirement: Application entry point
The system SHALL provide an executable entry point that mounts a root React component into the terminal using Ink's `render`.

#### Scenario: Launching the app
- **WHEN** the user runs the built entry point (`node dist/cli.js`)
- **THEN** Ink mounts the root `<App>` component and renders it to the terminal without errors

### Requirement: Hello-world render
The system SHALL render a visible greeting to the terminal on launch.

#### Scenario: Greeting is displayed
- **WHEN** the app starts
- **THEN** the terminal displays the text "Hello, world" styled in green

### Requirement: Clean exit
The application SHALL terminate on its own after rendering, returning control to the shell with a success exit code.

#### Scenario: Process exits cleanly
- **WHEN** the app has finished rendering
- **THEN** the process exits with code 0 and returns the user to their shell prompt

### Requirement: Build step
The project SHALL compile TypeScript sources in `src/` to runnable JavaScript in `dist/` via `tsc`.

#### Scenario: Building the project
- **WHEN** the user runs `npm run build`
- **THEN** `tsc` compiles `src/*.tsx` to `dist/` with no type errors and produces a runnable `dist/cli.js`
