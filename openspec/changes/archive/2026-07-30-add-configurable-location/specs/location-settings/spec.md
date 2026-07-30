## ADDED Requirements

### Requirement: Geocoding source
The system SHALL resolve user-entered place names to geographic coordinates using the Open-Meteo geocoding API, without requiring an API key or user credentials.

#### Scenario: Resolving a place name
- **WHEN** the user submits a city name
- **THEN** the system requests candidates from the Open-Meteo geocoding endpoint and requires only network access, with no key, token, or stored secret

#### Scenario: Geocoding is not required to launch
- **WHEN** the application starts with a previously saved location
- **THEN** no geocoding request is made, because the saved location already carries its coordinates

### Requirement: Location search entry
The system SHALL let the user enter a place name as free text and submit it explicitly. The system SHALL NOT issue a request on every keystroke.

#### Scenario: Submitting a search
- **WHEN** the user types a place name and presses Enter
- **THEN** exactly one geocoding request is issued for the entered text

#### Scenario: Typing does not issue requests
- **WHEN** the user types a place name without pressing Enter
- **THEN** no geocoding request is issued, regardless of how many characters are typed

#### Scenario: Query too short to match
- **WHEN** the user submits a query shorter than two characters
- **THEN** no request is issued and the user is told that a longer query is needed

#### Scenario: Editing after a search
- **WHEN** the user edits the query after results are displayed and presses Enter again
- **THEN** a new search replaces the previous results

### Requirement: Candidate disambiguation
When a search returns candidates, the system SHALL present them as a selectable list, and SHALL display enough information for the user to tell same-named places apart.

#### Scenario: Presenting candidates
- **WHEN** a search returns one or more candidates
- **THEN** each candidate is displayed with its place name, and with its administrative region and its country where those are known, absent parts being omitted rather than shown as an empty value

#### Scenario: A place with no administrative region
- **WHEN** a candidate has no administrative region, as some city-states and small territories do not
- **THEN** it is displayed by its place name and whatever other details are known, without a placeholder or an empty region shown

#### Scenario: Distinguishing identically named places
- **WHEN** two or more candidates share the same place name, region, and country
- **THEN** the display appends a finer administrative subdivision to tell them apart where one is available, and appends their coordinates otherwise, so that no two rows in the list are ever indistinguishable from each other

#### Scenario: Most likely match first
- **WHEN** a search returns a mixture of exact name matches and looser fuzzy matches
- **THEN** exact name matches are ordered ahead of fuzzy matches, and within each group more populous places are ordered ahead of less populous ones

#### Scenario: Moving through candidates
- **WHEN** the user presses the up or down arrow keys with candidates displayed
- **THEN** the highlighted candidate moves accordingly and does not move beyond either end of the list

### Requirement: No matching places
The system SHALL treat a search that matches nothing as a successful search with no results, not as a failure.

#### Scenario: Query matches no places
- **WHEN** a search completes and the response contains no results
- **THEN** the user is told that no places matched the query, the previous configuration is left unchanged, and no error state is displayed

#### Scenario: Response omits the results field entirely
- **WHEN** the geocoding response contains no results field at all, rather than an empty list
- **THEN** the system treats it as no matching places rather than as a malformed response

#### Scenario: Retrying after no matches
- **WHEN** no places matched and the user edits the query and submits again
- **THEN** the new search runs normally

### Requirement: Search failure
When a geocoding request fails, the system SHALL report the failure, leave the active location unchanged, and allow the user to try again or leave.

#### Scenario: Network or API unavailable
- **WHEN** a geocoding request fails because the network or the API is unavailable
- **THEN** an error explaining the failure is displayed, the active location is unchanged, and the user can submit another search

#### Scenario: Malformed response
- **WHEN** the geocoding response is not valid JSON, or its results are not in the expected shape
- **THEN** the system reports a failed search rather than presenting empty or partial candidates

#### Scenario: Search request is bounded
- **WHEN** a geocoding request does not complete within the configured timeout
- **THEN** the request is aborted and the failure is reported, so the search cannot wait indefinitely

#### Scenario: Leaving during a search
- **WHEN** the user cancels or quits while a geocoding request is in flight
- **THEN** the request is aborted and no display update is attempted afterwards

### Requirement: Selecting a location
When the user confirms a candidate, the system SHALL make it the active location, persist it, and leave the search.

#### Scenario: Confirming a candidate
- **WHEN** the user presses Enter on a highlighted candidate
- **THEN** that place becomes the active location, the selection is persisted, and the search is dismissed

#### Scenario: Cancelling without selecting
- **WHEN** the user cancels the search rather than confirming a candidate
- **THEN** the active location and the persisted configuration are both left unchanged

### Requirement: Persisted location
The system SHALL persist the active location as resolved coordinates together with its display details, so that a later launch needs no geocoding request. The system SHALL NOT persist the user's search text in place of the resolved location.

#### Scenario: Location survives a restart
- **WHEN** the user selects a location, quits, and starts the application again
- **THEN** the previously selected location is active, and weather is requested for it

#### Scenario: Coordinates are stored, not the query
- **WHEN** a location has been persisted
- **THEN** the stored record contains the latitude and longitude and the place name, together with its region and country where those are known, and does not rely on re-running the user's original search text

#### Scenario: Selection-only details are not persisted
- **WHEN** a candidate that was disambiguated by a finer subdivision or by population is persisted
- **THEN** the stored record keeps only the location's own identity and coordinates; the finer subdivision and population used to choose and order candidates are not written to the file

#### Scenario: Configuration file location
- **WHEN** the system reads or writes the configuration
- **THEN** it uses a file under the user's configuration directory as given by `XDG_CONFIG_HOME`, falling back to `~/.config` when that variable is not set

#### Scenario: Room for future settings
- **WHEN** the configuration file is written
- **THEN** the location is stored under its own named key, so that unrelated settings can later be added without restructuring the file

### Requirement: Default location
The system SHALL ship a default location used when no configuration exists. The default SHALL be a fallback only, and SHALL NOT be written to disk.

#### Scenario: First run with no configuration
- **WHEN** the application starts and no configuration file exists
- **THEN** the shipped default location is active and weather is requested for it, with no prompt blocking the display

#### Scenario: Default is not written to disk
- **WHEN** the application has started with no configuration file and the user has not selected a location
- **THEN** no configuration file has been created

#### Scenario: Saved location takes precedence
- **WHEN** a configuration file specifies a location
- **THEN** that location is active and the default is not used

#### Scenario: Reverting to the default
- **WHEN** the user deletes the configuration file and starts the application again
- **THEN** the shipped default location is active again

### Requirement: Unusable configuration
When the configuration file exists but cannot be read or understood, the system SHALL fall back to the default location, tell the user, and SHALL NOT overwrite the file until the user selects a location.

#### Scenario: Malformed configuration file
- **WHEN** the configuration file is not valid JSON, or its stored location is missing required fields
- **THEN** the application starts on the default location, displays a warning that the saved configuration could not be read, and remains fully usable

#### Scenario: Malformed configuration is preserved
- **WHEN** the application has fallen back to the default because the configuration could not be read, and the user has not selected a location
- **THEN** the existing file is left on disk unmodified, so the user can inspect or repair it

#### Scenario: Repairing by selecting a location
- **WHEN** the user selects a location after an unreadable configuration was detected
- **THEN** the file is replaced with the new selection and the warning is cleared

### Requirement: Unwritable configuration
When the active location cannot be persisted, the system SHALL keep the user's selection for the current session and report that it will not be remembered.

#### Scenario: Configuration directory cannot be written
- **WHEN** the user selects a location and writing the configuration fails
- **THEN** the selected location becomes active for the current session, weather is requested for it, and the user is told the selection could not be saved

#### Scenario: Failure to save does not end the session
- **WHEN** persisting the configuration has failed
- **THEN** the application remains running, usable, and quittable
