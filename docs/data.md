# Data: real rosters, ratings, logos, colours (js/data/, tools/)

## Real rosters pipeline
- Sources: (1) WrestleStat starters-only per-weight pages **saved by the user from their browser** into `WrestlerNames/` (WrestleStat 403s automated fetches: do NOT try to bypass it; ask the user to re-save the pages to refresh) — 78 teams x 10 weights with class, last-season record and WS ELO. (2) Official Sidearm roster pages fetched politely by `tools/fetch_rosters.py` (cache `tools/cache/`, output `tools/rosters.json`, parser `tools/rosterparse.py`); 6 schools without usable pages use WrestleStat TEAM pages saved into `WrestlerNames/`. All 78 schools have real rosters.
- `py tools/build_realteams.py` -> `js/data/realteams.js` (`REAL_TEAMS[school]` lines `Name|weight|class|ovr|S|hometown / high school`; do not edit by hand). Starters: ELO -> percentile within the weight -> OVR 9.0-18.8 (p50 12.6, p80 14.8, p98 17.6). Backups 2.0+0.9k below the starter (-0.9 for freshmen), max 4 per weight.
- In game: `applyRealTeams` (core.js) builds those rosters through `rateReal` (attributes generated, pulled onto the target with the LEGACY overall formula), adds walk-ons so every weight has 2 (rated off the starter). `applyRealTop` (Flo top-16, data/realtop.js) only for schools without real data. Start-screen checkbox `opts.real` off = fully generated.
- `data/ncaa2026.js`: rating FLOOR for real 2026 NCAA placers (1st 17.8 ... 7-8th 16.2) via `ncaaFloor`.
- `data/overrides.js` `REAL_OVERRIDES` (name -> `{ ovr, set, pot? }`): hand-set ratings (Bo Bassett 19.0 with tdo/speed 20; Masanosuke Ono 18.0, pot 19: neutral attributes 19-20, Top Turning / Bottom Resistance 12, Top Control / Bottom Control 8 -> FS OVR 18.45, #7 nationally; freestyle World Champion with no folkstyle background, 2026-11-14). New careers only. The player editor's edits (localStorage) replace these per name for new careers; pasted "Copy edits" JSON can be merged into this file.
- League = 78 teams (Cal Baptist, Cleveland State, Eastern Michigan, Fresno State removed — dropped wrestling; 13 smaller D1 programs added, prestige approximate). Prestige in data/schools.js is approximate. Tarleton State (WAC) is on the real D1 list but not in the game (no roster data).

## Conference alignment (data/schools.js)
- 2026-27 alignment from the "Conference" column of Wikipedia's *List of NCAA Division I men's wrestling programs* (2026-11-13): Big Ten 14, Big 12 9, ACC 7, EIWA 12, Ivy League 6, MAC 11, Pac-12 9 (NDSU, SDSU, UNC, Air Force, NIU, Oregon State, Cal Poly, Bakersfield, Little Rock), SoCon 9, Independent 1 (Mercyhurst, transitioning: no conference tournament, at-large NCAA bids only).
- `LIST` (school + prestige) keeps the **old generation order**, `ALIGN` maps school -> conference, so rosters for a seed are identical to before (verified vs the previous commit, seeds 1 and 7, real and generated).
- `confsOf(G)` (display order) and `tourneyConfs(G)` (conferences with 2+ teams that are not "Independent...") replace the global `CONFERENCES` in game code. NCAA auto bids per weight `CONF_BIDS` (data/tournaments.js): Big Ten 8, Big 12 5, ACC 3, EIWA 2, Ivy 2, MAC 2, Pac-12 2, SoCon 1 = 25 + 8 at-large; read through `confBids(G, conf)`. Teams with no conference tournament put their lineup starter into the at-large pool (`computeNcaaField`).
- Saves made before the realignment (`G.align !== 2`) keep their conferences and the old bid table until the offseason: `realign(G)` (core.js) runs in `buildNext` (offseason start) and `startNewSeason` (drops a stale draft), moves teams and posts a "Conference realignment" inbox note.
- Venues: Ivy League / Pac-12 / SoCon mats use text badges (no logo files); unknown (custom) conferences get a generic blue mat with the name.

## Custom leagues (js/game/league.js, start screen "Custom league")
- One uploaded league per browser (localStorage `wc.league`), chosen under New career (League dropdown). New careers only; the career keeps `G.league = {name, confs:[{name,bids}], tournaments?}` (rosters only matter at newGame). Default careers have no `G.league`.
- League file (JSON): `{ name, conferences:[{name, bids}], teams:[{name, conference, prestige, region, academics, state, roster:[{name, weight, class, rating, starter, hometown}]}], tournaments:[{name, tier, location, conferences, month, week, day, days}] }`. Only team name + conference are required; missing bids = default table or teams/4; no `tournaments` = default events. Templates (Download buttons) hold the default league; uploading the unchanged template gives a game identical to the default one (verified: rosters and schedule, seed 3).
- Rosters CSV `team,name,weight,class,rating,starter,hometown`: replaces the rosters of the listed teams in the custom league (or a copy of the default). rating = target in-game OVR (through `rateReal`, so the player editor / overrides by name still apply); blank = team level (9 + prestige x 0.065, backups -2). Weights with < 2 wrestlers get walk-ons; teams without a roster get real rosters (name match, real names on) or generated ones.
- Validation (`parseLeague`, `mergeRosterCsv`): >= 16 teams (National Duals bracket), unique names, valid weights, auto bids <= 33; soft issues become warnings. Custom teams have no logos/colours (initials badge, neutral mats).
- Verified headlessly: 24-team custom league with an Independent, custom roster and 3 custom tournaments played 2 full seasons + offseasons.

- Calibration vs the real 2026 NCAAs: engine win% by OVR gap matches Elo within ~3-5 pts; real top-8 placers mostly inside the game's top 8. The real-roster mapping tops out ~18.3-18.8, so real outliers sit near 18.5 rather than 20 (stretching it would change real attributes: ask first).

## Logos and colours
- `py tools/fetch_logos.py` -> `assets/logos/<id>.png` + `js/data/logos.js` (`LOGOS_ENABLED`, `LOGO_IDS`). Trademarks: fine privately, turn off before sharing.
- `py tools/fetch_orglogos.py` -> `assets/logos/org/` (NCAA from Wikimedia, Big Ten / Big 12 / ACC / MAC from ESPN) for the bout viewer's mat centre (`js/data/venues.js`). No EIWA logo source (text badge).
- `tools/teamcolors.html` + `tools/make_teamcolors.py` -> `js/data/teamcolors.js` (dominant logo colour, lightened; overrides for Iowa, Minnesota).

## Generated names (js/data/names.js)
- Recruits, walk-ons, fully generated rosters and generated US RTC athletes get `randomName` (gen.js) -> `usName`: 429 first names (boys' names popular for 2004-09 births) x 1,065 US surnames (roughly Census rank order, plus some Midwest / wrestling-country names at the end), each picked rank-weighted (weight 1/sqrt(rank)) from one uniform draw, so the rng draw count is the same as the old `rng.pick` lists (36 x 50, replaced 2026-11-14).
- Measured (newGame seeds 1, 7 real / 3, 11 generated): exact duplicate full-name pairs per 340-recruit class 0-4 (was ~28); fully generated league 16-30 pairs among ~2,300 names (was ~1,500). Everything except names identical for a seed. Over 100k draws: 79k distinct names; most common "Jacob Smith" 0.04%.
- International recruits and foreign freestyle athletes still use the per-country `NAME_POOLS` (fsdata.js; its `usa` pool is unused). Generated names can occasionally match a real wrestler's name (no check).

## Recruit geography
`data/states.js`: FloWrestling 2025 NCAA qualifiers by home state (PA 41, OH 27, NJ 26, CA 26, IL 24, ...).
