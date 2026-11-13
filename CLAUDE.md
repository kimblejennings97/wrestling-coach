# Wrestling Coach — project guide

Football-Manager-style college wrestling coach game (NCAA D1 men's folkstyle), text sim in the spirit of WMMA5, with an animated bout viewer. Browser app, plain ES modules, no build step.

**Read this file, then the topic file(s) for what you are working on:**

| Working on | Read |
|---|---|
| Match engine, balance, scoring, takedown model, calibration numbers | `docs/engine.md` |
| Bout animation, clips, chains, counters, celebrations, Move Viewer | `docs/animation.md` |
| Recruiting, portal, roster limit, prestige, development, offseason, fatigue, injuries, weight classes | `docs/recruiting.md` |
| Schedule, duals + dual coaching, tournaments, live brackets, selection show, national duals, rankings | `docs/season.md` |
| Stats, record books, Hall of Fame, archive | `docs/stats-legacy.md` |
| Screens, links, profiles, bout viewer, saves, player editor, iPad layout | `docs/ui.md` |
| Real rosters pipeline, rating overrides, logos, team colours | `docs/data.md` |

Keep these files current: when you change a system, update its topic file (current design + knobs + measured results), not a dated log. Add a new topic file if a new area grows big. The pre-split CLAUDE.md (dated session logs with every past measurement) is in git history at commit `193d11b`.

## Where things stand (2026-11-12)
- Playable end to end: preseason -> duals/tournaments -> selection show -> NCAAs -> 4-step offseason -> next season, multiple save slots, player editor.
- Almost everything was verified **headlessly** (sim harnesses, DOM click-throughs, Edge screenshots). The user has hand-tested little of it; the iPad is their test device. `dist/` must be rebuilt (`deploy.bat`) before iPad testing.
- Open ideas: export/import save file; auto-taper option for the user; top-position stalling / stall ladder; escapes and league-mix MD probably high; coach/staff, facilities, NIL; redshirts; women's / other divisions / freestyle mode; Match Lab has no animation.

## Decisions made with the user (don't re-litigate)
- Platform: browser app, no build step, **Node is NOT installed**; Python is `py` (not `python`).
- Scope v1: NCAA D1 men's folkstyle. Takedown = 3 points (`RULES`).
- Real school names, real rosters and logos ON for private testing; turn off `LOGOS_ENABLED` (js/data/logos.js) and `REAL_NAMES_ENABLED` (js/data/realtop.js) before any public release.
- Never bypass WrestleStat's blocking: ask the user to re-save the pages.
- When retuning, **keep wrestler attributes unchanged** (fit weights/curves instead).
- Match viewing = streamed play-by-play + animation + "Jump to result". Matches are simulated before they are shown; interactive choices only in watched live duals (re-sim from the same seed).
- No recruiting caps for the user (AI-only). Max one weight move per season.
- Tournament dates follow weekday rules; conference = first Saturday of March; NCAA = Thu-Sat of the third week of March.

## User preferences
Works autonomously and reports briefly; concise answers with a recommendation and **what was and wasn't verified**. Watches college wrestling closely and gives realism feedback (near falls rare, takedowns dominate, elite takedown defence nearly unscorable, transcendent wrestlers rarely lose, a few wrestlers rack up most tech falls). Often away: keep going and report at the end.

## Repo, git, deploy
- Local git repo, branch `main`, remote `https://github.com/kimblejennings97/wrestling-coach.git` (should be PRIVATE). **Claude may commit but cannot push** (the user pushes from a VS Code terminal). End commit messages with the Co-Authored-By line from the session's system reminder. autocrlf=true (LF->CRLF warnings are normal).
- `.gitignore`: `dist/`, `WrestlerNames/`, `tools/cache/`, `_*.html`.
- Deploy: `deploy.bat` / `py tools/build_deploy.py [--with-lab]` -> `dist/` (index.html, moves.html, css, js minus harness, logos, `_headers` no-cache) -> drag onto app.netlify.com/drop. `netlify.toml` does the same for git deploys. Test/diag pages are not deployed. Don't leave a server running inside `dist/`.
- Rollback copies: `C:\ClaudeProjects\wrestling-coach-backups\` (stable-2026-11-08, anim-2026-11-10).

## Layout
- `index.html` + `js/ui/app.js` (all screens), `css/style.css`, `js/ui/anim.js` (bout animation), `js/ui/match.js` + `lab.html` (Match Lab), `moves.html` (Move Viewer).
- `js/engine/bout.js` (+ rng.js): bout sim and tunables.
- `js/game/`: `core.js` (state G, new game, real rosters, lineups, duals, finishWeek, training, injuries, rankings, save/migrate), `tourney.js`, `live.js`, `selection.js`, `dualtourney.js`, `dualcoach.js`, `sched.js`, `recruit.js`, `offseason.js`, `prestige.js`, `stats.js`, `legacy.js`, `saves.js`, `playeredit.js`.
- `js/data/`: gen, schools, practice, tournaments, realteams (generated), realtop, overrides, ncaa2026, states, logos, teamcolors.
- Tools/tests kept: `animsheet.html`, `harness.html`, `diag.html`, `sim_balance.html`, `longrun.html`, `tools/*.py`.

## Invariants and gotchas
- **Viewer-only changes must not change rng draws** (engine tags, move names, chain/counter variants): verify 3,000 bouts identical vs the previous commit's bout.js.
- **New-game changes:** with no player edits, `newGame` must stay identical for a given seed (compare against the previous core.js).
- **Import cycles** (e.g. legacy.js <-> stats.js): never use the other module's exports at module load time — it blanks the whole app.
- Save size matters (IndexedDB, ~1.3-1.5 MB): replay data and brackets are pruned after events (`pruneReplays`); season rollover drops old schedule data.
- Lineups: `canWrestle` = natural weight or one up; `sanitizeLineup` wherever lineups are used.
- Stats are queued (`G.sq`) and flushed; Stats/Rankings freeze while an event is being revealed (no spoilers).

## How to test (no Node)
- Serve: `py serve.py` (port 8765, no-cache headers). It may already be running from an earlier session.
- Headless Edge from **PowerShell** (Git Bash launches stopped producing files): `Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList '--headless=new','--disable-gpu',"--user-data-dir=<scratch>\edgeprof",... -Wait -WindowStyle Hidden`. Logic tests: a throwaway `_t.html` (gitignored) imports modules and writes results into `<pre id="o">`; run with `--virtual-time-budget=600000 --dump-dom URL` and `-RedirectStandardOutput <file>`. Screenshots: `--screenshot=<png> --window-size=W,H` (no virtual time; `--force-device-scale-factor` breaks them). Separate `--user-data-dir` per kind of run; one headless job at a time.
- The app (index.html) won't render headless because of the IndexedDB top-level await: in a test page set `Object.defineProperty(window, 'indexedDB', { value: undefined })` before `import('./js/ui/app.js')` (start screen), or define a Map-backed fake IndexedDB; drive it by clicking `[data-act=...]` elements. To screenshot an app state, dump the DOM after the clicks, strip scripts, save it as a static `_w.html` (UTF-8, no BOM) and screenshot that. A temporary `window.__dbg = {...}` hook at the end of app.js also works (remove it afterwards).
- Animation: `animsheet.html?c=<clips>&t=0.2,0.5,1&w=300` contact sheets (chain names with `%2B`).
- Write patch scripts with the Write tool into the scratchpad and run them with `py` (bash heredocs with quotes/apostrophes break). Delete `_*.html` and copied `_old_*.js` modules afterwards.
- Long sims: run in the background and write output to a file (foreground commands stop at 10 minutes).
