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

The geocoding request reuses the existing `REQUEST_TIMEOUT_MS` rather than introducing a second timeout constant — same vendor, one client shape, one availability story. The value is an abort *ceiling*, not a target: a search returns in well under a second on success, so a generous ceiling costs the user nothing and only bounds the failure path, which has no reason to bail faster than a weather request. `config.ts`'s comment on the constant is generalised from "leave the panel loading forever" to cover any Open-Meteo request.

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

The default must be **structurally identical to a geocoded pick**, or the code carries two location types and a formatting branch. One consequence is user-visible: the header becomes `San Antonio, Texas` rather than the current `Lansing, MI`, because the API returns full region names and offers no abbreviations. ("Structurally identical" is about the *active/stored* location; decision 15 adds a separate transient `Candidate` shape for search results, which is not an active location and does not violate this.)

### 6. `XDG_CONFIG_HOME` — a production feature that happens to give free testability

```
  production:  XDG_CONFIG_HOME unset  →  ~/.config/russ-panel-tui/config.json
  tests:       XDG_CONFIG_HOME=<tmp>  →  real file I/O in a disposable dir
```

Honouring the variable is correct behaviour on its own merits. That it also makes config I/O testable with **no injectable filesystem and no module mocking** is why it is preferred over a `ConfigStore` port. This is the same philosophy as the default-deny `fetch` stub: intercept at the real boundary, leave `src/` untouched by test concerns.

Setting it in `test/support/setup.ts` additionally guarantees no test can reach the developer's real `~/.config`, which is the filesystem analogue of default-deny.

JSON rather than TOML or YAML: `JSON.parse` is built in, and the format is not the interesting part of this change. The location nests under a `location` key so that `TEMPERATURE_UNIT` — the obvious next resident — can be added later without reshaping the file.

**No `version` field, deliberately.** A version marker's only value would be enabling a *silent migration* when the `Location` shape changes in some future change. Additive settings (a sibling `units` key) need no version — the nesting already covers them. A breaking shape change is handled adequately without one: the malformed path falls back to the default, warns, and — critically — **preserves the file** rather than destroying it, so the worst case is a warning and a one-keystroke re-pick, exactly the first-run cost the proposal already accepts for every user. Adding a version now is migration infrastructure with zero migrations, against a change that declines frameworks before their second consumer. The escape hatch is free when it is actually needed: a future breaking change can adopt the convention "absent `version` ⇒ v1" at that point and migrate from there.

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

The trade-off is that someone hunting a small hometown is pushed down the list — but exact-match-first blunts this more than it first appears. A small hometown searched by its exact name lands in the *exact-match group* and is therefore only ever pushed beneath *larger exact-name* matches; it is buried only if a name has more than ten larger exact matches, which is vanishingly rare. It stays within `count=10` and the list is scrollable regardless. This is why the ordering is confirmed rather than provisional: the failure mode of trusting API order (a 1,156-person village above an 87,675-person city on an exact query) is common and reads as broken, while the failure mode of re-sorting is rare and still visible.

### 9. Project the API payload; never store it raw

**Finding, from the live API:** San Antonio's result carries an **80-element `postcodes` array**, plus `id`, `admin1_id`, `admin2_id`, `country_id`, `feature_code`, and `elevation`. Storing the result object would give the user a config file consisting mostly of zip codes. (`San Antonio de Palé` also reports `elevation: 9999.0`, a sentinel — the payload is not clean.)

Project to exactly the six fields in decision 4. `timezone` is captured now, unused: it is free at selection time, and any future forecast or sunrise/sunset panel would need it, whereas adding it later means re-geocoding every saved location. (Decision 15 refines this into two projections: the payload first becomes a `Candidate` that also keeps `admin2` and `population` for ordering and disambiguation, and only the six fields survive the second projection to a stored `Location`.)

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

These are **two different mechanisms**, not one, and the distinction matters at implementation time:

```
  keying state by location   → reset to loading on a change  (fixes the stale-across-locations defect)
  a guard at the setState site → apply a result only if it is still current  (fixes the superseded-response race)
```

Keying alone does not prevent a request that has already passed its abort point from firing its `setState` under the new location's name. So each request tags the location it fetched for, and on arrival that tag is compared against the currently active location — read through a ref, because the async closure captured a stale value — and the result is discarded on mismatch. The location tag, not the abort, is the source of truth for "is this response still wanted".

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

### 14. A single-slot notice area in `tui-shell`, cleared by the write itself

The `location-settings` spec promises two on-screen warnings — *unreadable config* and *unwritable config* — but the existing surfaces cannot hold them. The unreadable-config warning fires at **startup, in normal mode, with no picker open**, and normal mode's only regions are the weather panel (another capability's state model, whose states are all about the reading) and the footer (bindings only, "never empty," designed as a keymap). There was no home for a normal-mode, non-modal notice.

```
  ┌──────────────────────────┐
  │  <WeatherPanel|Picker>   │  content area
  ├──────────────────────────┤
  │  ⚠ one line, or nothing  │  ← notice: 1 row present, 0 rows absent
  ├──────────────────────────┤
  │  q quit · r refresh · l  │  footer (unchanged)
  └──────────────────────────┘
```

So `tui-shell` gains a **notice area**, owned the same way it owns the footer: the shell renders the slot, the consumer supplies the text. The data model is deliberately one field — `notice: string | undefined`. It is a generic slot any future panel can post to, not a queue: no severities, no stacking, no dismiss key.

The behaviour is fixed by the same constraint that killed live-search and auto-refresh — **no injectable clock** (`add-test-harness`). A notice therefore cannot fade on a timer; it is **state-driven**, appearing when a condition holds and clearing when it resolves. That refusal is a feature here: it makes the notice assertable with the harness as-is (real fs + stdin, no time), and it is the same principled line the rest of the change draws.

Two warnings, one rule. Trace both lifecycles and they collapse:

```
  failed config READ   → set notice
  failed config WRITE  → set notice
  successful WRITE     → clear notice     ⇒  a successful config write clears it;
                                             a failed read or write sets it
```

A successful selection *is* a successful write, so the "repair" case (unreadable config → user picks a valid location → warning clears) needs no special path. **No dismiss key**: the notice reflects a real unresolved condition and should persist until that condition is actually resolved, which also avoids allocating more of the normal-mode keyspace (open question 4).

When both conditions occur — corrupt file at startup, then a selection whose write also fails — the slot is **single-slot, last-writer-wins**: the second warning ("couldn't save; this session only") replaces the first. It is the more recent and more actionable truth; the still-corrupt file resurfaces on the next launch. Stacking the two would mean committing to the notification framework this change is otherwise declining.

The one coupling this introduces: the notice consumes a viewport row exactly as the footer does, so the "Modal content fits the viewport" requirement must subtract it when present — a notice appearing while the picker is open reflows the candidate list by one row.

### 15. Two shapes — `Candidate` and `Location` — and how rows are kept distinct

A single `Location` type was being asked to be three things with different field requirements: the persisted identity in `config.json`, the active location the panel fetches for, and a search candidate the user picks from. Only the candidate needs `population` (to order, decision 8) and a finer subdivision (to disambiguate); only the persisted identity has to stay minimal (decision 9). Collapsing them produced two defects: the strict parse (task 4.4) requires only `name`/`latitude`/`longitude`, so a valid result can arrive with **no `admin1`** (Singapore, Monaco), yet the header helper assumed one — `"Singapore, undefined"`; and the "no two rows indistinguishable" requirement had no field to lean on, because decision 9 discards everything below `admin1`.

Split the payload into two projections:

```
   API payload (raw)
        │ project
        ▼
   Candidate  name, admin1?, admin2?, country?, timezone?, lat, lon, population?
        │ confirm → project again, dropping admin2 + population
        ▼
   Location   name, admin1?, country?, timezone?, lat, lon      ← persisted / active
```

`Candidate` is what the picker renders and sorts; `Location` is what becomes active and is written to disk. This does **not** reopen decision 5: that decision guarded against two competing *active/stored* location types, and `DEFAULT_LOCATION` and a confirmed pick are both `Location`, structurally identical. `Candidate` is a transient search result, a normal second type. It also strengthens decision 9: the projection now runs twice, and `admin2`/`population` — used only to render and order the list — never reach disk.

**`admin1`, `country`, and `timezone` are optional** on both shapes. The strict parser was already correct to require only `name`/`latitude`/`longitude`; it was the type declaration that implied otherwise. One display helper composes the header and rows from whatever is present, dropping absent segments: `San Antonio, Texas` / `Springfield, Missouri, United States` / `Singapore` — never `Singapore, undefined`.

**Keeping rows distinct is a two-tier rule with an absolute floor.** The requirement asserts that no two rows are indistinguishable, so the fallback must be a field that is both always present and always unique — the coordinates:

```
  rows identical under (name, admin1, country)?
      ├─ append admin2 where it differs   → "Springfield, Greene County, Missouri"   (readable, usual case)
      └─ admin2 absent or equal?
             └─ append coordinates        → "Springfield, Missouri (37.22, −93.30)"   (rare, guarantees the rule)
```

`admin2` is the human-friendly layer; coordinates are the last resort that makes the guarantee literal rather than best-effort. Because `admin2` is selection-only, two same-state Springfields in different counties persist as the same display string `"Springfield, Missouri"` — acceptable, because their **coordinates differ**, so the reading is correct even when the stored label is ambiguous to a human reading the file.

## Risks / Trade-offs

- **[Part of the deferred focus-management work arrives early, in `tui-shell` rather than at panel #2]** → Accepted deliberately. A modal overlay is a simpler first customer than two peer panels competing for focus, so the abstraction is arguably better informed here than it would be there. Bounded by decision 11: two modes, no general focus manager.
- **[Client-side re-ordering could bury a user's small hometown]** → Real. Mitigated by `count=10` and a scrollable list. Flagged as an open question below, since the alternative — trusting API order — has its own visible failure.
- **[The geocoder is a second external dependency]** → Confined to the moment the user is actively choosing a location. Because resolved coordinates are persisted, startup keeps its single request and a geocoder outage cannot prevent launch.
- **[Filesystem tests are slower and more platform-dependent than in-memory ones]** → Accepted; they are also the only ones that prove the real behaviour. The "write fails" scenario is the platform-sensitive one and must not be silently skipped where the arrangement is unavailable — the harness spec requires that explicitly.
- **[Existing users are silently relocated from Lansing to San Antonio]** → Stated rather than hidden. No configuration file exists yet, so there is nothing to migrate and every user is a first-run user; the footer advertises `l` and the change takes one keystroke plus a search.
- **["Make the two clients consistent" is an inviting future refactor that would break no-match handling]** → Recorded as decision 7 with the live API evidence, and pinned by a spec scenario asserting that an absent `results` key is not an error.
- **[Tests that assert the picker's rendered rows calcify its layout]** → Same mitigation as `add-test-harness` chose: assert against spec scenarios (candidates are distinguishable, exact matches come first) rather than exact frame text.
- **[Two location types if the default and a geocoded pick diverge]** → Prevented by decision 5: one shape, used for both.

**`test-harness` — not automatable (1):** "Disposable directories are cleaned up" (the `afterAll` sweep in `test/support/config-fs.ts`) can't be asserted from inside the suite whose own teardown it is — the same category `add-test-harness` recorded for `tui-shell`'s "scrollback is left untouched". Verified manually: running the suite leaves no stray directory under the OS temp root afterward.

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

All four were reviewed during exploration. The outcome of each is recorded inline; none blocks implementation.

- **Candidate ordering: re-sort client-side, or trust the API? — RESOLVED, confirmed.** Decision 8 stands and is no longer provisional. Exact-match-first specifically protects the small-hometown case (an exact-name match cannot fall below fuzzy matches), so the residual risk of re-sorting is smaller than the common, broken-looking failure of trusting API relevance order. The comparator is small and already has fixtures in task 4.9.
- **Is two modes enough, or should key routing be general now? — REVIEWED, staying minimal.** Confirmed decision 11. Designing a focus/routing contract now means designing against a still-unknown panel #2; decision 13's own finding (async panels share a skeleton but not a state enum) is the cautionary evidence that a blind abstraction would likely be wrong at consumer #2. The named module banks the real benefit — panel #2 extends a seam rather than rediscovering the inline-`app.tsx` problem. Hardening added to task 6.1: route by mode via a table/enum so a third mode is additive rather than another branch.
- **Should `location-settings` grow into `user-settings` when units become configurable? — DEFERRED, correctly.** This is a question for the future change that makes units configurable, not this one. Verified that this change forecloses neither path: the file nesting (decision 6) supports both adding a sibling `unit-settings` capability and renaming/widening to `user-settings`, and the specific name `location-settings` (rather than a premature `settings` catch-all) keeps the sibling option clean.
- **Does the `l` binding conflict with anything panel #2 will want? — REVIEWED, non-blocking, resolved by construction.** `l` for location is mnemonic and low-regret. The genuine mitigation is not choosing a different key now but decision 11's named routing module, which is exactly where a future conflict surfaces and is reassigned in one place. So this is downstream of the previous question: once the routing module lands, moving `l` if panel #2 wants it is a one-place change.
