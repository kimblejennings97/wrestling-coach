# Season: schedule, duals, tournaments, selection, national duals

## Calendar and schedule (core.js `makeSchedule`, js/game/sched.js)
- Tournament dates follow weekday rules (data/tournaments.js): Cliff Keen Dec 4-5, Midlands Dec 29-30 (2026); conference = first Saturday of March; NCAA = Thu-Sat of the third week of March.
- Builder: 10-14 duals per team (`MIN_DUALS`/`MAX_DUALS`), open/major events: top-10 prestige 2-3, others 3-4, hard cap `MAX_EVENTS` 4, per-event caps on top-10/top-25 programs (majors 4/8, opens 1/3), every team >= 2 events, load rule `count + 4.5*(events+1) <= MAX_LOAD 33`. ~90% of starters wrestle 18-35 matches.
- **Offseason schedule editor**: `beginOffseason` drafts next season into `G.next = {season, cal, schedule, tournaments}`; `startNewSeason` adopts it. Editable: open/major tournaments (max 5, majors only for top-40 prestige) and non-conference duals; locked: conference duals, conference tournament, selection week, NCAAs, the national dual week. `weekState/weekOptions/setWeek/nextStats/buildNext`.
- **Skip ahead** (`skipToWeek(G, target, {recruit, pause})`): sims weeks up to the target, optional pause before your tournaments, inbox summary.

## Duals (core.js, js/game/dualcoach.js)
- Bout by bout: `beginDual` -> `stepDual(G, d, {assist})` (one bout; `d.prog` holds working lineups, used, score, subs) ; `playDual` = whole dual. A wrestler wrestles once per dual; `bout.subA/subB`, `d.result.subs` log. Each bout stores `rk: [rankA, rankB]` (poll rank that day).
- **Coach AI** (`COACH`): win probability from score + remaining matchups. Clinched (P >= .985, from bout `restFrom` 5) -> rest the next starter (max `maxRest` 3); trailing (P < .45) -> local search of swaps/bump-ups vs the known opposing lineup. AI teams always; the user's team only when the dual is simulated without being opened and `G.assist !== false`.
- **User control** in a live dual: Next bout / Watch next match, Coach's corner dropdowns (`userSub`/`subOptions`), Auto-run (pausable) honors the lineup set there. Half-played duals are saved and resumable.
- **Start-of-period choices** in watched live duals: viewer pauses on `ask` events for your side; `watchSnapshot` + `redoBout` re-sim the bout with your `choices` (identical up to the choice because choices use no rng) and rebook the result. Not in tournaments.

## Individual tournaments (js/game/tourney.js, live.js)
- NCAA-style double elimination; `roundPlan(k)` sets reveal order (consolation rounds as soon as they exist, placement matches, **Finals last**; pigtail = level 0); matches store `l`, `rl` (round name).
- `runEvent(G, spec, {keep:true})` simulates everything up front and stores `res.weights[wt].matches` + `ent`, and a replay snapshot `bt` for every non-user match (so any match is watchable; pruned with the bracket).
- Live reveal `t.rv` (`advanceLive`: match / wround / round / all); round N can't show anywhere until round N-1 is done everywhere. `liveScores` = revealed points + **guaranteed placement points** (`floorPlace` reruns the bracket with the wrestler losing everything unrevealed; semifinal win = 2nd, quarterfinal win >= 6th). Equals final `teamScores` at the end.
- Watch next match / Watch next user match (`advanceToUser`); the match is revealed when the viewer finishes/jumps/closes.
- Outstanding Wrestler per individual event (`result.mow`: champion with the most team points per match). Per-wrestler history `w.tr[season] = {c, n}` (conference/NCAA place, 9 = competed without placing). `G.tHist[event]` winners + champions (with ids) via `recordTHist` in finishWeek.
- `FORM` per-event rating shift for upsets (see engine.md).

## NCAA selection (js/game/selection.js)
`computeNcaaField` runs at the end of conference week after stats flush/polls; `resumeScore` = Elo-equivalent rating + win% + bonus rate + conference place - thin schedule; picks at-large bids and seeds (33/weight, autos by `CONF_BIDS`). `G.ncaa = {season, field, show, rv}`; the show reveals names (`advanceSel`), last four in / first four out; `completeSelection` posts the inbox note (also in finishWeek for skips). Screen (`selection()` + `selBracket` in app.js): March-Madness style bracket per weight, top half down the left, bottom half mirrored on the right, names on lines with connectors through empty later rounds to a champion box; no consolation side; pigtail box under the centre. Absolute px layout ~916 px wide (fits iPad landscape; narrower screens scroll inside the card).

## National Dual Tournament (js/game/dualtourney.js)
Week 2, top 16 of LAST season's NCAA team scores (prestige fallback), single elimination of full duals + 3rd-place dual; places 1/2/3/4/5/9. Field fixed in `makeSchedule` (week 2 blocked first) and re-synced in `startNewSeason` (`syncDualField`). Duals played one at a time (`playMatch`, `beginMatch/completeMatch`), user's first; Watch / Sim next / Sim round / Skip; fatigue + injuries applied per dual. Counts in records, stats, rankings.

## Rankings
- Wrestler polls (stats.js): top 25 per weight by results-only Elo (`w.elo` moves only with results; offseason keeps 75% of the gap from 1500). Eligible: `w.prior` (had a real previous season) or >= 3 wins; one per school per weight; idle 3+ weeks or injured 3+ weeks drops out. `G.rkCur/rkPrev`.
- Dual rankings: team `drate` seeded from lineup projection, moved only by dual results (K 36, margin-aware). Tournament rankings: projected NCAA points from starters' poll ranks via `RANK_PTS` (#1 19.4, #2 15.4, #4 11.8, #8 6.2, #10 4.6, #16 1.9; unranked starter 0.4). Rank correlation with the real NCAA result ~0.93.
