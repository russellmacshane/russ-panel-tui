## Why

The weather panel's location is a hardcoded constant, and `add-persistent-weather-panel` recorded exactly why it was left that way: *"Deciding between a config file, a CLI flag, and an in-app settings panel is a real decision that should be made when there is enough app to judge it — not blind, at panel #1."* There is now an app to judge it against, plus a test harness to build against. This is that change.

The deciding argument is ambiguity. Users think in city names; the API needs coordinates. Geocoding "Springfield" returns Missouri, Illinois, Massachusetts, Ohio, and Tennessee — someone has to choose. A flag or a hand-edited file can only take the first result and hope, or make the user paste coordinates, which is the problem we started with. A candidate list is the natural shape for this problem, and a candidate list means in-app.

## What Changes

- **Add a `location-settings` capability.** The user presses `l`, types a city name, and picks from a list of real candidates resolved through Open-Meteo's geocoding API (`https://geocoding-api.open-meteo.com/v1/search`, no API key, same vendor as the weather call). Selection persists to `$XDG_CONFIG_HOME/russ-panel-tui/config.json`.
- **The default location becomes San Antonio, Texas** and is a *fallback*, not a seed: with no config file the app uses it in memory and writes nothing to disk. The app therefore always has something to render, and there is no "no location configured" state.
- **BREAKING** `weather-panel` no longer has a fixed location. The `Fixed location` requirement — whose scenarios state that *"no interface is offered for changing the location"* and that the app *"does not read a location from arguments, environment, or a config file"* — is replaced.
- **Fix two latent defects in the weather state machine**, both of which only become reachable once location is dynamic:
  - A failed fetch after a location change would keep the *previous* city's reading and render it under the *new* city's name, because [`weather-panel.tsx`](../../../src/weather/weather-panel.tsx) reads the location from config while `WeatherReading` carries none. A location change now resets to `loading` instead of preserving a cross-location reading.
  - A location change while a request is in flight is silently dropped by the refresh de-duplication guard in [`use-weather.ts`](../../../src/weather/use-weather.ts). Refresh de-duplicates; a location change aborts and restarts.
- **Add input modes to `tui-shell`.** The current global bindings actively prevent text entry: `q` quits, `r` refreshes, and `Esc` — the conventional cancel key — also quits, so typing "Portland" fires a spurious refresh and "Albuquerque" exits the app. Key routing becomes mode-scoped, and the footer is derived from the active mode rather than hardcoded.
- **Add a notice area to `tui-shell`.** The two config warnings (unreadable and unwritable configuration) have no surface today: the unreadable-config warning fires at startup in normal mode, where the only regions are the weather panel — another capability's state model — and a bindings-only footer. A single-line, state-driven notice area holds them, cleared by a successful config write rather than a timer, so no injectable clock is reopened.
- **Add filesystem isolation to `test-harness`.** Tests point `XDG_CONFIG_HOME` at a temporary directory, so config I/O is exercised against the real filesystem while the developer's own `~/.config` is unreachable — the same intercept-at-the-real-boundary approach as the default-deny `fetch` stub.
- **Search is triggered by Enter, not per keystroke.** A debounced live search would need a fake clock, reopening a decision `add-test-harness` made deliberately (*"no injectable clock, no injectable timeout"*) for a field users type once.

### Non-goals

- **No CLI flag, environment variable, or hand-edited location.** The in-app picker plus a persisted file covers the need; adding parallel input paths multiplies the precedence rules for no gain. Config precedence stays two layers: config file, else the default.
- **No settings framework.** `TEMPERATURE_UNIT` is the obvious second resident of the config file, but making units configurable is a separate change. The file schema nests location under a `location` key so that change does not have to reshape it.
- **No automatic polling on a timer.** Still deferred, and still the change that has to resolve the fake-clock question.
- **No IP-based auto-detection.** Worth its own proposal: it adds a third-party service outside Open-Meteo, carries privacy implications, and is wrong behind a VPN. It would be additive to this change, not a replacement for it.
- **No reverse geocoding or raw coordinate entry.** Coordinates are stored, never typed.
- **No multi-location support or saved favourites.** One active location.

## Capabilities

### New Capabilities
- `location-settings`: resolving a user-typed city name to real places via Open-Meteo geocoding, presenting candidates for disambiguation, selecting one, persisting the resolved location to a config file, and falling back to a shipped default when no configuration exists — including the corrupt-config and unwritable-config failure modes.

### Modified Capabilities
- `weather-panel`: **BREAKING** — `Fixed location` is replaced by sourcing the location from `location-settings`. Adds the requirement that a location change discards any previous reading rather than presenting it as stale, and extends `Bounded requests` to cover a location change arriving while a request is in flight.
- `tui-shell`: adds mode-scoped input routing so a text field can receive `q`, `r`, and `Esc` as literal input, makes the keybinding footer reflect the active mode instead of a fixed string, and adds a single-line notice area — a slot for the config warnings that has no home in the weather panel or the bindings-only footer.
- `test-harness`: adds filesystem isolation, so config reads and writes are testable without touching the developer's real config directory.

## Impact

**Affected code**

- `src/config.ts` — `LOCATION` becomes `DEFAULT_LOCATION`, restructured to the same shape as a geocoded result (`name`, `admin1`, `country`, `latitude`, `longitude`). The "KNOWN LIMITATION" comment is removed because it is no longer true.
- `src/weather/use-weather.ts` — accepts a location; distinguishes refresh from location change; both defects above.
- `src/weather/weather-panel.tsx` — renders the active location rather than importing the constant. Header format shifts from `Lansing, MI` to `San Antonio, Texas`; the geocoding API returns full region names and no abbreviations.
- `src/app.tsx` — mode state, mode-scoped key routing, mode-derived footer, and mounting the picker.
- **New**: a geocoding client, the picker component and its state machine, and config file read/write.

**New spec surface, no new runtime dependencies.** `ink-text-input` (last published 2024-05-21, one day before the already-rejected `ink-testing-library`) and `ink-select-input` (2025-04-29) are evaluated in design.md and declined on fit rather than freshness: the field needs only append and backspace, and the list needs structured multi-field rows that a `{label, value}` item shape cannot express.

**External API.** A second Open-Meteo endpoint, called only while the user is actively choosing a location. Because the *resolved coordinates* are persisted rather than the search string, application startup still makes exactly one network request, and a geocoding outage cannot prevent the app from launching.

**User-visible.** Existing users move from Lansing to San Antonio unless they set a location. Nothing to migrate — no config file exists yet, so every user is a first-run user.
