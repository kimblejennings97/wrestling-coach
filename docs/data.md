# Data: real rosters, ratings, logos, colours (js/data/, tools/)

## Real rosters pipeline
- Sources: (1) WrestleStat starters-only per-weight pages **saved by the user from their browser** into `WrestlerNames/` (WrestleStat 403s automated fetches: do NOT try to bypass it; ask the user to re-save the pages to refresh) — 78 teams x 10 weights with class, last-season record and WS ELO. (2) Official Sidearm roster pages fetched politely by `tools/fetch_rosters.py` (cache `tools/cache/`, output `tools/rosters.json`, parser `tools/rosterparse.py`); 6 schools without usable pages use WrestleStat TEAM pages saved into `WrestlerNames/`. All 78 schools have real rosters.
- `py tools/build_realteams.py` -> `js/data/realteams.js` (`REAL_TEAMS[school]` lines `Name|weight|class|ovr|S|hometown / high school`; do not edit by hand). Starters: ELO -> percentile within the weight -> OVR 9.0-18.8 (p50 12.6, p80 14.8, p98 17.6). Backups 2.0+0.9k below the starter (-0.9 for freshmen), max 4 per weight.
- In game: `applyRealTeams` (core.js) builds those rosters through `rateReal` (attributes generated, pulled onto the target with the LEGACY overall formula), adds walk-ons so every weight has 2 (rated off the starter). `applyRealTop` (Flo top-16, data/realtop.js) only for schools without real data. Start-screen checkbox `opts.real` off = fully generated.
- `data/ncaa2026.js`: rating FLOOR for real 2026 NCAA placers (1st 17.8 ... 7-8th 16.2) via `ncaaFloor`.
- `data/overrides.js` `REAL_OVERRIDES` (name -> `{ ovr, set, pot? }`): hand-set ratings (Bo Bassett 19.0 with tdo/speed 20). The player editor's edits (localStorage) replace these per name for new careers; pasted "Copy edits" JSON can be merged into this file.
- League = 78 teams (Cal Baptist, Cleveland State, Eastern Michigan, Fresno State removed — dropped wrestling; 13 smaller D1 programs added, prestige approximate). Schools/conferences/prestige in data/schools.js are approximate.
- Calibration vs the real 2026 NCAAs: engine win% by OVR gap matches Elo within ~3-5 pts; real top-8 placers mostly inside the game's top 8. The real-roster mapping tops out ~18.3-18.8, so real outliers sit near 18.5 rather than 20 (stretching it would change real attributes: ask first).

## Logos and colours
- `py tools/fetch_logos.py` -> `assets/logos/<id>.png` + `js/data/logos.js` (`LOGOS_ENABLED`, `LOGO_IDS`). Trademarks: fine privately, turn off before sharing.
- `py tools/fetch_orglogos.py` -> `assets/logos/org/` (NCAA from Wikimedia, Big Ten / Big 12 / ACC / MAC from ESPN) for the bout viewer's mat centre (`js/data/venues.js`). No EIWA logo source (text badge).
- `tools/teamcolors.html` + `tools/make_teamcolors.py` -> `js/data/teamcolors.js` (dominant logo colour, lightened; overrides for Iowa, Minnesota).

## Recruit geography
`data/states.js`: FloWrestling 2025 NCAA qualifiers by home state (PA 41, OH 27, NJ 26, CA 26, IL 24, ...).
