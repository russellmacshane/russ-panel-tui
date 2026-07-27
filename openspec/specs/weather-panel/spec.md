# weather-panel Specification

## Purpose
The weather-panel capability provides the command center's current-conditions panel. It covers where the reading comes from (Open-Meteo, no API key), how the panel is refreshed, and the display states it moves through — loading, ready, error, and stale — including the rule that a failed refresh keeps the last good reading on screen rather than discarding it.

## Requirements

### Requirement: Current conditions source
The system SHALL retrieve current weather conditions from the Open-Meteo API without requiring an API key or user credentials.

#### Scenario: Fetching on launch
- **WHEN** the app starts
- **THEN** the panel requests current conditions from Open-Meteo for the configured location

#### Scenario: No credentials required
- **WHEN** the app is run on a machine with no configuration, environment variables, or stored secrets
- **THEN** the weather request succeeds, requiring only network access

### Requirement: Fixed location
The system SHALL request weather for a single location defined by a hardcoded latitude and longitude. Making the location configurable is explicitly out of scope for this capability's initial version.

#### Scenario: Requesting the configured location
- **WHEN** the panel fetches weather
- **THEN** it uses the hardcoded latitude and longitude, and the displayed reading is labelled with the corresponding place name

#### Scenario: Location cannot be changed at runtime
- **WHEN** the user is running the app
- **THEN** no interface is offered for changing the location, and the app does not read a location from arguments, environment, or a config file

### Requirement: Loading state
The panel SHALL indicate that a reading is being retrieved when it has no data to display yet.

#### Scenario: First fetch in progress
- **WHEN** the app has started and the initial request has not yet completed
- **THEN** the panel displays a loading indication rather than an empty area or placeholder values

### Requirement: Ready state display
When a reading has been retrieved successfully, the panel SHALL display the temperature, a human-readable description of conditions, the location name, and the time the reading was retrieved.

#### Scenario: Displaying a successful reading
- **WHEN** a weather request completes successfully
- **THEN** the panel displays the temperature with its unit, a text description of conditions, the location name, and the local time of the reading

#### Scenario: Unrecognized conditions code
- **WHEN** the API returns a weather code the system has no text mapping for
- **THEN** the panel still displays the temperature and indicates the raw code, rather than rendering nothing or an error

### Requirement: Manual refresh
The panel SHALL retrieve a fresh reading when the user presses `r`. Refresh requests SHALL NOT overlap.

#### Scenario: Refreshing on demand
- **WHEN** the user presses `r` while a reading is displayed
- **THEN** a new request is issued and, on success, the displayed reading and its retrieval time are updated

#### Scenario: Refresh pressed while a request is in flight
- **WHEN** the user presses `r` while a request is already in progress
- **THEN** the key press is ignored and no second concurrent request is issued

### Requirement: Error state
When no reading has ever been retrieved successfully and a request fails, the panel SHALL display an error that explains the failure and indicates how to retry.

#### Scenario: Initial fetch fails
- **WHEN** the first weather request fails because the network or the API is unavailable
- **THEN** the panel displays an error message and indicates that `r` retries, and the application remains running and quittable

#### Scenario: Unexpected response shape
- **WHEN** the API returns a response that is missing expected fields or is not valid JSON
- **THEN** the panel treats it as a failed request and displays the error state rather than rendering empty or undefined values

### Requirement: Stale state
When a refresh fails after a reading has previously been retrieved successfully, the panel SHALL continue to display the last good reading, marked as stale, rather than discarding it.

#### Scenario: Refresh fails after a successful reading
- **WHEN** a refresh request fails and a previous successful reading exists
- **THEN** the panel continues to display that reading along with its original retrieval time, and marks it as stale with an indication of why the refresh failed

#### Scenario: Recovering from stale
- **WHEN** a subsequent refresh succeeds while the panel is in the stale state
- **THEN** the stale marking is cleared and the panel displays the new reading and its retrieval time

### Requirement: Bounded requests
Weather requests SHALL time out, so that an unresponsive network cannot leave the panel waiting indefinitely, and SHALL be abandoned when the application exits.

#### Scenario: Request exceeds the timeout
- **WHEN** a weather request does not complete within the configured timeout
- **THEN** the request is aborted and the panel transitions to the error state or the stale state, according to whether a previous reading exists

#### Scenario: Quitting during a request
- **WHEN** the user quits while a weather request is in flight
- **THEN** the request is aborted, the app exits without waiting for it, and no display update is attempted after teardown
