## 1. Location type and default

- [ ] 1.1 Add a `Location` type (`name`, `latitude`, `longitude` required; `admin1`, `country`, `timezone` optional) in a module owned by `location-settings` rather than in `src/config.ts`. Add a `Candidate` type: a `Location` plus the selection-only `admin2` and `population` fields used to order and disambiguate search results (decision 15).
- [ ] 1.2 Replace `LOCATION` in `src/config.ts` with `DEFAULT_LOCATION`, using the `Location` shape and the live API values for San Antonio, Texas (`29.42412, -98.49363`, `America/Chicago`). Remove the "KNOWN LIMITATION" comment block, which is no longer true. Generalise the `REQUEST_TIMEOUT_MS` comment so it covers any Open-Meteo request, since the geocoding client now shares it.
- [ ] 1.3 Add a display helper that formats a `Location` by joining the parts that are present (`San Antonio, Texas`; `Singapore` when there is no region), so the format lives in one place and never renders an absent field as `undefined`.
- [ ] 1.4 Update `src/weather/client.ts` to take a `Location` argument instead of importing `LOCATION`. No behaviour change yet — callers pass `DEFAULT_LOCATION`.
- [ ] 1.5 Update `src/weather/weather-panel.tsx` to render a passed-in location rather than importing the constant.
- [ ] 1.6 Confirm `npm test` and `npm run typecheck` still pass; the app still runs on the default location.

## 2. Configuration persistence

- [ ] 2.1 Add config path resolution: `$XDG_CONFIG_HOME/russ-panel-tui/config.json`, falling back to `~/.config/russ-panel-tui/config.json` when the variable is unset.
- [ ] 2.2 Implement the config reader. Return the stored location when valid; signal "absent" and "unreadable" as distinct outcomes so the caller can warn only in the second case.
- [ ] 2.3 Implement the config writer, creating parent directories as needed, writing the location nested under a `location` key, and projecting to exactly the six `Location` fields.
- [ ] 2.4 Implement default fallback: absent config uses `DEFAULT_LOCATION` in memory and writes nothing to disk.
- [ ] 2.5 Implement unreadable-config handling: fall back to the default, surface a warning, and leave the existing file untouched until the user selects a location.
- [ ] 2.6 Implement write-failure handling: keep the selection for the current session and surface a warning that it was not saved.

## 3. Test harness filesystem isolation

- [ ] 3.1 Point `XDG_CONFIG_HOME` at a disposable per-run directory from `test/support/setup.ts`, before any test runs.
- [ ] 3.2 Remove any config file left behind between tests, so a later test observes first-run behaviour.
- [ ] 3.3 Clean up the disposable directory when the suite finishes.
- [ ] 3.4 Add helpers for writing a malformed config and for arranging a failing write, and skip nothing silently where the arrangement is unavailable on a platform.
- [ ] 3.5 Document filesystem isolation in `test/support/README.md` alongside the existing network-isolation rules.
- [ ] 3.6 Add tests for config read/write, absent config, malformed config, and write failure.

## 4. Geocoding client

- [ ] 4.1 Add the geocoding client calling `https://geocoding-api.open-meteo.com/v1/search` with `name`, `count=10`, `language=en`, `format=json`, reusing the existing `REQUEST_TIMEOUT_MS` as its bound rather than adding a second timeout constant.
- [ ] 4.2 Reject queries shorter than two characters without issuing a request.
- [ ] 4.3 Treat an absent `results` key as a successful search with zero rows — **not** an error. Guard this with a test, per design decision 7.
- [ ] 4.4 Parse each result strictly: a result missing `name`, `latitude`, or `longitude` makes the search fail rather than yielding a partial candidate.
- [ ] 4.5 Project results to the `Candidate` shape — keeping `admin2` and `population` for disambiguation and ordering — and discard `postcodes`, the various `*_id` fields, `feature_code`, and `elevation`. Persisting a chosen candidate projects it again to a `Location`, dropping `admin2` and `population` (decision 15).
- [ ] 4.6 Implement candidate ordering: exact name matches before fuzzy matches, then population descending within each group.
- [ ] 4.7 Ensure candidates are distinguishable when name, region, and country all coincide: append the finer subdivision (`admin2`) where available, and append coordinates otherwise, so no two rows are ever identical.
- [ ] 4.8 Support abort via a caller-supplied signal, combined with the timeout, matching the weather client's pattern.
- [ ] 4.9 Add tests covering: successful search, zero matches with no `results` key, malformed response, timeout, abort, ordering with the `San Antonio` and `Springfield` fixtures from design decision 8, the short-query guard, projection (a chosen candidate persists without `admin2`/`population`), the display helper on a place with no region (no `undefined`), and disambiguation falling back to coordinates when identically named rows share the same subdivision.

## 5. Weather state machine

- [ ] 5.1 Change `useWeather` to accept the active location.
- [ ] 5.2 Separate the two operations: refresh de-duplicates while in flight; a location change aborts the in-flight request and starts a new one.
- [ ] 5.3 Reset to `loading` on a location change, discarding any previous reading so it can never render under a different location's name.
- [ ] 5.4 Discard a superseded response on arrival, not only on abort, since an abort can race a resolution: tag each request with the location it fetched for, and on resolution apply the result only if that location still matches the active one (compared through a ref, not a captured value). This is a distinct mechanism from the location-keyed reset in 5.3.
- [ ] 5.5 Scope the stale rule to same-location refreshes; a stale reading is discarded when the location changes.
- [ ] 5.6 Add tests for: location change during a pending request is honoured rather than dropped, a failed first fetch after a location change shows `error` and not `stale`, a superseded response is ignored, and a stale reading is discarded on location change.

## 6. Input modes in tui-shell

- [ ] 6.1 Add mode state (`normal`, `location`) and mode-scoped key routing in a named module rather than inline in `src/app.tsx`. Route by mode through a table/enum rather than an `if (mode === 'location')` branch, so that adding a third mode later is additive.
- [ ] 6.2 Route printable characters to the active text-entry mode so `q` and `r` are literal input and do not quit or refresh.
- [ ] 6.3 Bind `l` in normal mode to enter the location mode.
- [ ] 6.4 Make `Esc` dismiss the active mode without applying a change, and quit only from normal mode.
- [ ] 6.5 Keep Ctrl-C quitting from every mode.
- [ ] 6.6 Derive the footer from the active mode, replacing the hardcoded string; include `l location` in the normal-mode footer.
- [ ] 6.7 Bound modal content to the viewport so a candidate list cannot overflow, keeping the highlighted row visible; subtract the notice row from the available height when a notice is present.
- [ ] 6.8 Add a single-line notice area to the shell chrome, distinct from the footer and the content area, rendering at most one posted message and collapsing to zero rows when empty. Model it as one field (`notice: string | undefined`) — no queue, no severities, no dismiss key.
- [ ] 6.9 Provide a way for the app to post and clear the notice, driven by config outcomes: a failed read or write sets it, a successful write clears it, and a later message replaces an earlier one (single-slot, last-writer-wins).
- [ ] 6.10 Add tests for: typing `q`/`r` in location mode does not quit or refresh, normal-mode bindings resume after leaving, Ctrl-C quits from location mode, the footer changes with the mode, and a list longer than the terminal is bounded on resize.
- [ ] 6.11 Add tests for the notice area: a posted notice renders on its own line in both modes, an empty notice occupies no rows, a second notice replaces the first, and the notice is not removed on a timer (no clock is involved in clearing it).

## 7. Location picker

- [ ] 7.1 Build the single-line text field (append and backspace only), per design decision 12.
- [ ] 7.2 Build the candidate list with arrow-key movement that does not run past either end.
- [ ] 7.3 Render each candidate with its name and whatever of region and country are known, plus the distinguishing detail (finer subdivision, else coordinates) when rows would otherwise coincide.
- [ ] 7.4 Implement the picker state machine: `typing → searching → results | no matches | error`, with editing the query returning to `typing`.
- [ ] 7.5 Search on Enter only; issue no request while typing.
- [ ] 7.6 On confirm: persist the selection, leave the mode, and make the new location active so weather refetches.
- [ ] 7.7 On cancel: leave the active location and the stored config unchanged.
- [ ] 7.8 Abort an in-flight geocoding request when the mode is dismissed or the app quits.
- [ ] 7.9 Post the config warnings from tasks 2.5 (unreadable) and 2.6 (unwritable) to the shell's notice area (tasks 6.8–6.9), and clear the notice when a selection is successfully persisted.
- [ ] 7.10 Add tests for each picker state, for confirm-persists and cancel-does-not, and for no-matches rendering as a message rather than an error.

## 8. Documentation

- [ ] 8.1 Replace the README's "Known limitation: the location is hardcoded" section with how to set a location.
- [ ] 8.2 Add `l` to the README's key table and note that San Antonio, Texas is the default.
- [ ] 8.3 Document the config file path and schema in the README.
- [ ] 8.4 Update the README's `src/` layout listing for the new modules.

## 9. Verification

- [ ] 9.1 `npm run build`, `npm run typecheck`, and `npm test` all pass.
- [ ] 9.2 Confirm every scenario in the four delta specs has a corresponding test, or is explicitly recorded as a manual check in the way `add-test-harness` recorded its three.
- [ ] 9.3 Run the app manually: default location renders on first launch with no config file present; `l` opens the picker; searching `Springfield` shows distinguishable ordered candidates; selecting one refetches weather; the choice survives a restart; deleting the config file returns to San Antonio.
- [ ] 9.4 Confirm no config file is created by simply launching and quitting without selecting a location.
- [ ] 9.5 Confirm CI passes on the pull request.
