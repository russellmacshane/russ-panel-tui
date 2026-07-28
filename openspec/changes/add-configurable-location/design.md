## Context

`add-persistent-weather-panel` shipped a hardcoded `LOCATION` constant and stated the reason in both the spec and the design doc: choosing between a config file, a CLI flag, and an in-app settings panel is a real decision that deserved a real app to judge against. That app now exists, and so does a test harness built to be a panel's second consumer.

Three constraints from earlier changes shape this one:

- **The `weather-panel` spec forbids configurability**, not merely omits it. Its `Fixed location` requirement asserts that no interface is offered and that no location is read from arguments, environment, or a config file. This change is BREAKING in the same way `add-persistent-weather-panel` was when it overturned `tui-shell`'s "clean exit".
- **`add-test-harness` declined an injectable clock** — *"no injectable clock, no injectable timeout"* — and the `test-harness` spec forbids asserting on formatted wall-clock output. Any design here that needs a fake timer reopens that decision.
- **`add-persistent-weather-panel` declined a panel framework and focus management**, deferring both to panel #2. Text entry forces part of that bill early, because [`src/app.tsx`](../../../src/app.tsx) binds `q`, `r`, and `Esc` globally.

This change's investigation queried the live geocoding API rather than working from documentation, and three findings below contradict what the docs imply. They are recorded because each one drives a decision.

## Goals / Non-Goals

**Goals:**

- The user types a city name and picks from real candidates. No coordinates are ever typed.
- Ambiguous names (`Springfield`, `Portland`, `San Antonio`) resolve to the right place without guesswork.
- Application startup still makes exactly one network request, as it does today.
- The app always renders something on launch — no blocking first-run prompt, no empty state.
- The two latent defects in the weather state machine are fixed as part of this change, not left for a bug report.
- The harness gains filesystem isolation in the same spirit as its network isolation: intercept at the real boundary, no source seams.

**Non-Goals:**

- A settings framework, a settings panel, or configurable units. One setting does not justify a framework — the same reasoning that declined a panel framework at one panel.
- A shared data layer or store. The location has one consumer today.
- CLI flags or environment variables for the location. Two precedence layers, not four.
- Auto-refresh on a timer. Still the change that must resolve the fake-clock question.
- IP-based auto-detection. Additive, and its own proposal.
- Multiple saved locations or favourites.

## Decisions

### 1. `location-settings` is its own capability

Considered folding everything into `weather-panel`, which would have meant zero new capabilities and a smaller change on paper. Rejected because that spec's stated Purpose is *"where the reading comes from, how the panel is refreshed, and the display states it moves through"* — it would then also carry geocoding result ordering, a config file path, and a JSON schema. Also considered splitting further into `location-settings` plus a `user-settings` capability owning the file mechanism; rejected as inventing a settings framework before a second setting exists.

The practical test: a future forecast or air-quality panel would consume `location-settings` without touching `weather-panel`. That is what a capability boundary is for.

### 2. Open-Meteo geocoding, same vendor as the weather call

`https://geocoding-api.open-meteo.com/v1/search?name=<query>&count=10&language=en&format=json`. No API key for non-commercial use, matching the existing *"No credentials required"* requirement. Same vendor means one availability story and one client shape to maintain rather than a second provider's auth and rate-limit model.

`count=10` because ten rows plus chrome fits a conventional 80×24 terminal, and the maximum of 100 has no plausible use here.

### 3. Search on Enter, not per keystroke

| | debounced live search | search on Enter |
| --- | --- | --- |
| Requests for "Portland" | ~8 | 1 |
| Debounce timer | required | none |
| Out-of-order responses | must be handled | impossible |
| Testability | needs a fake clock | works with today's harness |

Live search would reopen the injectable-clock decision to add a nicety to a field users type once, and would put ~8 requests per search on a free API. Enter-to-search is also the conventional TUI idiom. This is the single decision that keeps the change inside the existing harness's capabilities.

### 4. Persist resolved coordinates, never the query string

```
  ✗  {"location": {"query": "San Antonio"}}
        → geocode on every launch
        → 2 network dependencies at startup instead of 1
        → geocoder outage becomes a launch failure
        → the API's fuzzy matching could silently resolve differently later

  ✓  {"location": {"name": "San Antonio", "admin1": "Texas",
                   "country": "United States", "timezone": "America/Chicago",
                   "latitude": 29.42412, "longitude": -98.49363}}
        → startup is exactly one request, as today
        → geocoding runs only while the user is actively choosing
```

A hard dependency on two services to display one temperature would be a real availability regression over the current app.

### 5. The default is a fallback, not a seed

`DEFAULT_LOCATION` is San Antonio, Texas (`29.42412, -98.49363`, from the live API). With no config file it is used in memory and nothing is written. Considered seeding the file on first launch; rejected because it creates a file the user never asked for, and makes "revert to the default" mean hand-editing or deleting rather than simply never having chosen.

This is also what removes an entire category of states: there is no "no location configured", no blocking first-run prompt, and no launch path that renders nothing. Discovery happens through the footer's `l location` binding instead.

The default must be **structurally identical to a geocoded pick**, or the code carries two location types and a formatting branch. One consequence is user-visible: the header becomes `San Antonio, Texas` rather than the current `Lansing, MI`, because the API returns full region names and offers no abbreviations.

### 6. `XDG_CONFIG_HOME` — a production feature that happens to give free testability

```
  production:  XDG_CONFIG_HOME unset  →  ~/.config/russ-panel-tui/config.json
  tests:       XDG_CONFIG_HOME=<tmp>  →  real file I/O in a disposable dir
```

Honouring the variable is correct behaviour on its own merits. That it also makes config I/O testable with **no injectable filesystem and no module mocking** is why it is preferred over a `ConfigStore` port. This is the same philosophy as the default-deny `fetch` stub: intercept at the real boundary, leave `src/` untouched by test concerns.

Setting it in `test/support/setup.ts` additionally guarantees no test can reach the developer's real `~/.config`, which is the filesystem analogue of default-deny.

JSON rather than TOML or YAML: `JSON.parse` is built in, and the format is not the interesting part of this change. The location nests under a `location` key so that `TEMPERATURE_UNIT` — the obvious next resident — can be added later without reshaping the file.

### 7. The geocoding client is deliberately *less* strict than the weather client

[`src/weather/client.ts`](../../../src/weather/client.ts) states its philosophy explicitly: *"Anything unexpected becomes an error rather than a partial reading — a panel showing `undefined°` is worse than one that admits it failed."* Correct there. Wrong here.

**Finding, from the live API:** a query that matches nothing returns **HTTP 200 with no `results` key at all** — not `{"results": []}`, and not the HTTP 400 the documentation implies.

```
  name=Zzzqqxyzzy  →  200  {"generationtime_ms":0.569582}
  name=a           →  200  {"generationtime_ms":0.08702278}
  name=            →  200  {"generationtime_ms":0.031352043}
```

Applying the weather client's strictness would turn every typo into a red error box. An absent `results` key is a *successful* search with zero rows. This is recorded prominently because "make the two clients consistent" is an inviting and wrong refactor.

The client stays strict about the *shape of results it does receive*: a result missing `latitude`, `longitude`, or `name` is malformed and the search fails, per the existing precedent.

### 8. Re-sort candidates client-side

**Finding, from the live API:** results are fuzzy-matched and ordered by relevance, which is neither exact-match-first nor population-sorted.

```
  name=San Antonio
  1. San Antonio          Texas             US   pop 1,526,656
  2. San Antonio de Palé  Annobón Province  GQ   pop     4,433
  3. Santo António        Príncipe          ST   pop     1,156   ← does not contain the query
  4. San Antonio          Valparaiso        CL   pop    87,675
  5. San Antonio Suchit…  Suchitepeque      GT   pop    13,666

  name=Springfield
  MO 170,188 · IL 114,394 · MA 154,341 · OH 59,680 · TN 16,808 · Palmyra MO
                             ▲ 114k ranked above 154k        ▲ not a Springfield
```

A 1,156-person village outranking an 87,675-person city will read as broken. Ordering exact name matches ahead of fuzzy ones, then by population descending within each group, puts San Antonio TX first and orders the Springfields sensibly.

The trade-off is that someone hunting a small hometown is pushed down the list — mitigated by `count=10` keeping it visible and by the list being scrollable.

### 9. Project the API payload; never store it raw

**Finding, from the live API:** San Antonio's result carries an **80-element `postcodes` array**, plus `id`, `admin1_id`, `admin2_id`, `country_id`, `feature_code`, and `elevation`. Storing the result object would give the user a config file consisting mostly of zip codes. (`San Antonio de Palé` also reports `elevation: 9999.0`, a sentinel — the payload is not clean.)

Project to exactly the six fields in decision 4. `timezone` is captured now, unused: it is free at selection time, and any future forecast or sunrise/sunset panel would need it, whereas adding it later means re-geocoding every saved location.

### 10. Two operations, not one: refresh de-duplicates, location change aborts

[`src/weather/use-weather.ts`](../../../src/weather/use-weather.ts) currently has one entry point guarded by `inFlight`:

```
  if (inFlight.current) { return; }   // correct for 'r', wrong for a location change
```

```
  refresh (same location)          location change
  ─────────────────────────        ──────────────────────────
  duplicate → drop it              abort in flight, restart
  keep last good on failure        discard previous reading
  (stale state)                    (loading state)
```

Both defects in the proposal fall out of conflating these. The fix is two distinct paths; the simplest implementation keys the hook's state by the active location so a change resets it rather than threading reset logic through the existing reducer. A superseded response must also be discarded on arrival, not merely aborted, since an abort can race a resolution.

### 11. Minimum viable input modes, but in a named place

The picker needs the shell to stop treating `q`, `r`, and `Esc` as global:

```
  P  o  r  t  l  a  n  d          A  l  b  u  q  u  e  r  q  u  e
        ▲                                     ▲     ▲     ▲
        spurious refresh                      application exits
```

Building only what this change needs — two modes, `normal` and `location` — rather than a general focus manager, consistent with how this repo has declined every premature abstraction. But the routing lives in a named module rather than inline in `app.tsx`, so panel #2 extends it instead of rediscovering the problem. Ctrl-C stays global in every mode: it is the universal escape hatch and Ink's `exitOnCtrlC` already implements it.

The footer becoming mode-derived is a consequence, not a separate feature — it is currently a hardcoded string at [`src/app.tsx`](../../../src/app.tsx).

### 12. Hand-rolled text field and list, declined on fit rather than freshness

| Package | Last published | Peer range | Why declined |
| --- | --- | --- | --- |
| `ink-text-input@6.0.0` | 2024-05-21 | `ink: >=5` | Buys cursor movement, masking, and controlled-value plumbing. A city field needs append and backspace; nobody arrows into the middle of "Portland". |
| `ink-select-input@6.2.0` | 2025-04-29 | `ink: >=5.0.0` | Items are `{label, value}` with `label` a single string. Candidate rows need structured rendering — name, region dim, population right-aligned — which one string cannot express. |

Both drive Ink's own `useInput` rather than raw stdin, so unlike `ink-testing-library` they would likely survive Ink 7; `ink-text-input` was published one day before it, but staleness is not the argument. The argument is the same shape as the harness decision: built for a narrower case than these specs describe. Dependency count is explicitly *not* the reason — the field is too small to outsource and the list does not fit.

Both are testable through the harness as-is: `harness.write()` already sends raw stdin and Ink's `useInput` receives it.

### 13. Shape of the picker

```
┌─ NORMAL ─────────────────────┐        ┌─ LOCATION ────────────────────┐
│ ╭─ WEATHER ──────────────╮   │   l    │ ╭─ SET LOCATION ─────────╮    │
│ │ San Antonio, Texas     │   │ ────▶  │ │ City: Springfield▌     │    │
│ │                        │   │        │ │                        │    │
│ │ 71°F  Partly cloudy    │   │        │ │ ▸ Springfield  Missouri│    │
│ │ Updated 3:42 PM        │   │ ◀────  │ │   Springfield  Illinois│    │
│ ╰────────────────────────╯   │ Esc /  │ │   Springfield  Mass.   │    │
│                              │  ⏎     │ ╰────────────────────────╯    │
│ q quit · r refresh · l loc   │        │ ↑↓ move · ⏎ select · Esc back  │
└──────────────────────────────┘        └───────────────────────────────┘
```

Its state machine rhymes with the weather panel's but is not the same:

```
      enter ──▶ typing ◀──── edit query ─────┐
                  │ ⏎                        │
                  ▼                          │
              searching                      │
                  │                          │
        ┌─────────┼─────────┐                │
        ▼         ▼         ▼                │
     results  no matches  error ─────────────┤
        │ ⏎        └───────────────────────── ┘
        ▼
   persist → leave mode → refetch weather
```

No `stale` state — there is no prior search worth preserving — and a `no matches` state that is a *success* with zero rows rather than a failure. Worth noting as evidence for the deferred panel-abstraction question: async panels share a skeleton but not a state enum, so an abstraction that imposed `loading | ready | error | stale` on everything would already be wrong at consumer #2.

## Risks / Trade-offs

- **[Part of the deferred focus-management work arrives early, in `tui-shell` rather than at panel #2]** → Accepted deliberately. A modal overlay is a simpler first customer than two peer panels competing for focus, so the abstraction is arguably better informed here than it would be there. Bounded by decision 11: two modes, no general focus manager.
- **[Client-side re-ordering could bury a user's small hometown]** → Real. Mitigated by `count=10` and a scrollable list. Flagged as an open question below, since the alternative — trusting API order — has its own visible failure.
- **[The geocoder is a second external dependency]** → Confined to the moment the user is actively choosing a location. Because resolved coordinates are persisted, startup keeps its single request and a geocoder outage cannot prevent launch.
- **[Filesystem tests are slower and more platform-dependent than in-memory ones]** → Accepted; they are also the only ones that prove the real behaviour. The "write fails" scenario is the platform-sensitive one and must not be silently skipped where the arrangement is unavailable — the harness spec requires that explicitly.
- **[Existing users are silently relocated from Lansing to San Antonio]** → Stated rather than hidden. No configuration file exists yet, so there is nothing to migrate and every user is a first-run user; the footer advertises `l` and the change takes one keystroke plus a search.
- **["Make the two clients consistent" is an inviting future refactor that would break no-match handling]** → Recorded as decision 7 with the live API evidence, and pinned by a spec scenario asserting that an absent `results` key is not an error.
- **[Tests that assert the picker's rendered rows calcify its layout]** → Same mitigation as `add-test-harness` chose: assert against spec scenarios (candidates are distinguishable, exact matches come first) rather than exact frame text.
- **[Two location types if the default and a geocoded pick diverge]** → Prevented by decision 5: one shape, used for both.

## Migration Plan

No data migration. No configuration file format exists prior to this change, so there is no old format to read and every user is a first-run user.

Order of work, so that nothing is half-wired:

```
  1. Location type + DEFAULT_LOCATION            (no behaviour change yet)
  2. Config read/write + XDG resolution          + harness fs isolation
  3. Geocoding client                            (pure, fully unit-testable)
  4. use-weather takes a location; both defects fixed
  5. Input modes in tui-shell; footer becomes mode-derived
  6. The picker component, wired to 2–5
  7. README: replace the "Known limitation" section; document `l`
```

Steps 1–4 are invisible to the user and independently testable; the app keeps working throughout, on the default location. The user-visible change lands at 5–6.

Rollback is `git revert`. A stray `config.json` left on disk afterwards is inert — the reverted code never reads it.

## Open Questions

- **Candidate ordering: re-sort client-side, or trust the API?** Decision 8 commits to exact-matches-first-then-population and the specs are written to it, but the call is provisional. Trusting API relevance order is defensible and simpler; it just means a 1,156-person village can outrank an 87,675-person city on a `San Antonio` search. Worth confirming before the picker is built, since it is one spec scenario and a comparator either way.
- **Is two modes enough, or should key routing be general now?** Decision 11 builds the minimum in a named module. The alternative is defining a proper focus/routing contract in this change and having panel #2 be its second consumer rather than its first refactor. Deliberately left open: the answer depends on what panel #2 is, which is still unknown.
- **Should `location-settings` grow into `user-settings` when units become configurable?** The file schema is shaped so it can (decision 6), but whether the *capability* should be renamed and widened, or a second capability added alongside it, is a question for that change rather than this one.
- **Does the `l` binding conflict with anything panel #2 will want?** Not blocking. Noted because the normal-mode keyspace is now being allocated without a plan, and this is the second binding after `r`.
