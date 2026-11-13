# Stats, records, Hall of Fame (js/game/stats.js, js/game/legacy.js)

## Stats
- `recordBout` / `recordPlacement` only QUEUE into `G.sq`; `flushStats(G)` applies them (finishWeek before polls, beginOffseason, rollSeasonStats, and the Stats/Rankings screens via `syncStats()` unless `eventInProgress()`). While your dual/tournament is being revealed those screens show pre-event numbers (no spoilers).
- Per wrestler `w.st` = 14 numbers in `KEYS` order: w, l, fall, tf, md, dec, td, esc, rev, nf, pf, pa, aa, ch. `w.hist = [[season, ...st]]` archived by `rollSeasonStats`; `careerOf` = hist + st. Forfeits excluded. Nothing here touches the engine rng.
- Real wrestlers' pre-game careers are unknown: books and careers start when the game does.

## Records and Halls of Fame (`G.lg = {done, rs, rc, ts, tc, hof, shof, arch}`)
- Record books: national single-season / career top 25 (`REC_N`) and per-school top 10 (`TEAM_N`) for wins, win% (20 / 60 bout minimum), pins, TF, MD, bonus wins, TD, NF, AA and titles (career only). Season books close at `beginOffseason` (before graduation; `closeSeasonRecords` is idempotent via `L.done`, `rollSeasonStats` is the fallback). Careers enter at `retire(G, w, season)` (graduation, `pruneGone`). Screens merge live numbers (`liveRecords`).
- Halls of Fame: national (2+ titles, or title + 3 AA, or 4 AA with a finals appearance), per school (title, or 3 AA, or 2 AA with 80+ wins at 85%+); `multiChamps` lists multi-time champions (retired + active).
- Archive `G.lg.arch`: compact profiles of departed Hall of Famers, NCAA champions, record holders and your alumni (`archProfile` in app.js; `wl()` links them), pruned each season by `pruneArchive`. ~+10 KB per season.
- **Gotcha:** legacy.js and stats.js import each other. A module in an import cycle must not use the other's exports at load time (a top-level `KEYS.map` blanked the whole app); legacy.js hardcodes the stat indices.

## UI
Stats screen: My team / National leaders (season / career), Records, Hall of Fame tabs; team profile shows its school Hall. Profiles: see ui.md.
