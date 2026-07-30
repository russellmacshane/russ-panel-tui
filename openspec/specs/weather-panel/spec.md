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

### Requirement: Location supplied by settings
The panel SHALL request weather for the location supplied by the `location-settings` capability, and SHALL display the details of that same location alongside the reading.

#### Scenario: Fetching for the active location
- **WHEN** the panel requests weather
- **THEN** it uses the coordinates of the currently active location rather than a compiled-in constant

#### Scenario: Displayed location matches the reading
- **WHEN** a reading is displayed
- **THEN** the location shown is the location that reading was retrieved for

### Requirement: Location change discards the previous reading
When the active location changes, the panel SHALL discard any existing reading and return to its loading state. A reading retrieved for one location SHALL NOT be displayed under a different location's name, in any state.

#### Scenario: Switching to a new location
- **WHEN** the active location changes while a reading for the previous location is displayed
- **THEN** the previous reading is discarded, the panel shows its loading state, and a request is issued for the new location

#### Scenario: The first request for a new location fails
- **WHEN** the active location changes and the request for the new location fails
- **THEN** the panel displays its error state for the new location, and does not display the previous location's reading as stale

#### Scenario: Returning to a previous location
- **WHEN** the user selects a location that was active earlier in the session
- **THEN** a fresh request is issued rather than an earlier reading being reused

### Requirement: Loading state
The panel SHALL indicate that a reading is being retrieved when it has no data to display yet.

#### Scenario: First fetch in progress
- **WHEN** the app has started and the initial request has not yet completed
- **THEN** the panel displays a loading indication rather than an empty area or placeholder values

### Requirement: Ready state display
When a reading has been retrieved successfully, the panel SHALL display the temperature, a human-readable description of conditions, the location the reading was retrieved for, and the time it was retrieved.

#### Scenario: Displaying a successful reading
- **WHEN** a weather request completes successfully
- **THEN** the panel displays the temperature with its unit, a text description of conditions, the name of the location the reading was retrieved for, and the local time of the reading

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
When a refresh for the active location fails after a reading for that same location has previously been retrieved successfully, the panel SHALL continue to display the last good reading, marked as stale, rather than discarding it. This SHALL apply only while the location is unchanged; a change of location is governed by "Location change discards the previous reading".

#### Scenario: Refresh fails after a successful reading
- **WHEN** a refresh request fails and a previous successful reading for the same location exists
- **THEN** the panel continues to display that reading along with its original retrieval time, and marks it as stale with an indication of why the refresh failed

#### Scenario: Recovering from stale
- **WHEN** a subsequent refresh succeeds while the panel is in the stale state
- **THEN** the stale marking is cleared and the panel displays the new reading and its retrieval time

#### Scenario: Stale readings are never carried across locations
- **WHEN** the panel is displaying a stale reading and the active location changes
- **THEN** the stale reading is discarded rather than being re-marked against the new location

### Requirement: Bounded requests
Weather requests SHALL time out, so that an unresponsive network cannot leave the panel waiting indefinitely, and SHALL be abandoned when the application exits or when the request's location is no longer the active one.

#### Scenario: Request exceeds the timeout
- **WHEN** a weather request does not complete within the configured timeout
- **THEN** the request is aborted and the panel transitions to the error state or the stale state, according to whether a previous reading exists

#### Scenario: Quitting during a request
- **WHEN** the user quits while a weather request is in flight
- **THEN** the request is aborted, the app exits without waiting for it, and no display update is attempted after teardown

#### Scenario: Location changes while a request is in flight
- **WHEN** the active location changes while a request for the previous location is in flight
- **THEN** the in-flight request is aborted and a request for the new location is issued, rather than the location change being ignored

#### Scenario: A superseded response is never applied
- **WHEN** a request for a previous location completes after the active location has already changed
- **THEN** its result is discarded and does not replace the state of the current location
