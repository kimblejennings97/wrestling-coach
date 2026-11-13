# UI (index.html, js/ui/app.js, css/style.css)

## Shell
- `render()` builds the whole screen from `G` + `ui`; `bind()` wires `[data-act]` (clicks -> `act(a, d)`) and `[data-chg]` (changes -> `chg(k, el)`). No G -> start screen (or the player editor when `ui.editor`).
- Top bar: team, coach, `Week N · date year` (`fmtDate(week, true)`; "Season over · 2026-27"), record, context button (next step / dual day / tournament / selection show / finish week), Save, Save as…, Menu. All week advances go through `tryAdvance()` (unused recruiting hours warning).
- Screens: Home, Roster, Lineup, Schedule (+ skip ahead, offseason editor), Standings, Rankings (Dual / Tournament / Weight classes), Stats (team, leaders, Records, Hall of Fame), Training, Recruiting (board, all, commits, portal / cut panel), Injuries, Offseason, NCAA selection, dual day + dual viewer, tournament day + live tournament, national dual bracket, profiles. Side menu links: Move viewer, Match Lab, Balance harness.

## Conventions
- **Links everywhere:** `wl(w)` wrestler (also archived ones), `tn(id, px)` logo + team name, `tnl(id)` team link without logo, `tl(name)` tournament, `linkify(text)` for inbox text (unique names only). Profiles use a back stack (`openProf`, `ui.stack`). Not linked: recruits, dropdown options, play-by-play, Match Lab.
- **Ratings hidden** outside Roster, Profile, Recruiting and the portal: elsewhere show record + poll rank (`wstat`/`wtxt`/`wrank`), never `ovr()`.
- Your team's colour `--tc` (`TEAM_COLORS`) highlights your rows, winners and bracket slots; dual results colour winners/losers.
- Logos: `schoolLogo(id, name, px)` (chip or initials badge). `LOGOS_ENABLED` / `REAL_NAMES_ENABLED` must go off before any public release.

## Profiles
- Wrestler (`profile()`): header (logo, OVR, class, weight, rank), info (hometown/HS; potential/ethic/durability/scholarship only for your own wrestlers), attribute bars, season-by-season stats + career, recent matches, tournament history card (`tourCard`) with Outstanding Wrestler awards, Hall of Fame badge. Archived wrestlers: `archProfile`.
- Team (`teamProfile`): dual rank + tournament rank, roster, duals, tournaments, NCAA history, school Hall of Fame. Tournament (`tournamentProfile`): past winners, champions, Outstanding Wrestler, title tallies.

## Bout viewer (`boutView`)
- Scoreboard `sbName`: logo, poll rank, linked name and school, record, gold **S** stall flag (count when > 1); red/green numbers by ankle band (`BAND`, `bandSides`: duals home = green; neutral sites by singlet colour); riding clock shows only the net advantage under the leader ("RT m:ss", gold +1 at a minute). Views carry `ids`, `rk`, `home`, `title`.
- Feed: speed slider (`ui.speed`, localStorage `wc.speed`, default Normal), Pause/Resume, Jump to result, timeout chain that waits for long clips (`feedDelay`). Stage from anim.js with `orient: orientAt(log, shown-1)` and `champ` for NCAA finals. `ui.view.venue` (set where the view opens: `dualVenue()` for duals, `tourneyVenue(t)` for tournament bouts) picks the mat colour and centre logo; see animation.md (Mat).
- Dual viewer: bout table with ranks, Watch next match (reveals when done), Coach's corner, lineup move log, choice prompts (`askPanel`) — see season.md.

## Saves (js/game/saves.js)
IndexedDB `wrestlingCoach`/`saves` (index + one key per slot, max 30); active game mirrored to localStorage `wrestlingCoach.save.v1` for Match Lab/diag. Start screen: saved careers (Continue/Load, Rename, Duplicate, Delete), Player editor, New career. Save ~1.3-1.5 MB between seasons (~2.8 MB at season end before pruning). `pruneReplays` drops play-by-play and brackets after an event; `hydrate` = migrate + sanitize. Saves are per browser (iPad: Add to Home Screen so Safari doesn't purge; export/import not built).

## Player editor (start screen)
`editorScreen`/`edAct` + js/game/playeredit.js. Lists real wrestlers from `REAL_TEAMS` (filters school/weight/name/edited only, top 80). Per wrestler: target overall (in-game OVR), potential, pinned attributes; Preview (sample seeded by name), Save, Reset, Clear all, Copy edits (JSON to paste to Claude to bake into `data/overrides.js`). Stored in localStorage `wc.playerEdits`, passed to `newGame(..., { edits })` -> `rateReal`; an edit replaces the built-in override for that name. **New careers only; saved careers are never touched.**

## Layout / devices
Responsive pass at the end of style.css: coarse-pointer sizes (42 px buttons, 16 px inputs), <= 1100 px narrower menu, portrait / < 560 px swipeable top menu, landscape keeps the side menu, safe-area padding. Checked by screenshots at iPad sizes only, never on the real device. Gotcha: headless screenshots are `pointer: fine`, so the coarse-pointer rules never show there; the touch rule `a[data-act]` (inline-block link padding) must exclude the menu (`:not([data-act=nav])`) or it out-specifies `nav a` and packs the side menu several links per line.
