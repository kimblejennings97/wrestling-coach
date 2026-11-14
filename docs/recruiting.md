# Recruiting, portal, rosters, prestige, development

## Recruiting (js/game/recruit.js)
- HS class 340/yr weighted by state (`data/states.js`: real 2025 NCAA qualifiers by home state drive counts and quality). Scouting uncertainty; scholarship cap 9.9 (`AID_CAP`).
- **Target board** `G.rec.board` (cap 25, reset each class); Recruiting opens on it. Weekly hours 20. `ACTIONS`/`doAction`: DM 1h, call 2h, pitch 3h (topic gain = his need x what your school delivers; aid pitch needs an offer; with freestyle mode on there is a sixth topic, "RTC / freestyle success", see freestyle.md), campus visit 6h (20+ interest), home visit 8h (40+); each once per recruit per week, visits once per season. Untouched targets lose 3 interest/week after 2 weeks; rival offers to board targets post inbox notes. `standing()` Leading / Neck and neck / Trailing (display only). The board and All recruits both show Rival interest (top 2 other programs + their interest, `rivalTxt` in app.js; open recruits only on the board).
- Commit model: prestige, playing time, academics, location, aid + interest. `STAR_AID` 5★ .75 / 4★ .5 / 3★ .25 / 2★ .25 / 1★ 0. Signing-day scramble in `finalizeRecruits` (`r.late`). ~99% of a class signs, ~39% in the scramble.
- **AI-only caps** (`aiHasRoom`): `MAX_INCOMING_PER_WT` 2, `MAX_AT_WT` 4, `MAX_CLASS` 8, projected roster < `ROSTER_MAX` 30. **The user has no cap** (`hasWeightRoom` true for the user); the user's Auto/Repeat modes follow the AI caps.
- `targetScore` = shared AI ranking. `autoRecruit(G)` (user, "AI logic"), `repeatLastWeek(G)` (never offers), `G.rec.mode` manual | repeat | auto run by `runWeeklyAuto` in finishWeek; `tryAdvance()` warns about unused hours in manual mode (`G.rec.noWarn`). Mode and noWarn persist across seasons (a reset bug once killed auto-recruiting after year 1).
- Signees per team by prestige tier ~ A 7.5 / B 7.6 / C 4.1 / D 3.2 / E 2.7. Recruit stars vs outcomes (7 seasons): 5★ start ~16.0 OVR, AA 13/40/60/75% by class year, ~1 in 3 win a title; 4★ AA ~40% as seniors; 2★/1★ ~no AAs.

## Transfer portal and roster limit
- `ROSTER_MAX` 30, enforced in the offseason cut step. AI `autoCut` (lowest `keepValue`, starters protected, keeps 2 per weight; AI may cut a signed freshman as last resort); user cuts via the cut panel (`cutToPortal`, `cutsNeeded`, `autoCut`); the user may cut up to `max(CUT_FREE 8, roster at the start of the cut step - 30)` in all (`cutAllowance`, start size in `G.off.cutStart`; 35 -> 5 required + 3 optional, 40 -> exactly 10; user request 2026-11-13, to make room for transfers); reaching 30 is still required to advance, auto-cut only does the required ones; the user's incoming freshmen (`w.fresh`) count toward 30 but can't be cut. Walk-ons added for empty weights; AI teams over 30 after that are cut again and the released are marked `gone`.
- `resolvePortal`: AI teams at 30+ can't sign; unsigned transfers stay in the sport with prob clamp(.3 + .09*(OVR-10), .08, .92) and walk on at the best-fit AI team (`ptScore` >= .3, roster < 29) else leave (`w.gone`, pruned by `pruneGone`). `p.fate` signed | walkon | left; user gets a note about wrestlers they released. 26-43 portal entries/yr, ~94% sign.

## Prestige (js/game/prestige.js)
`applyPrestige` in startNewSeason: expected finish = rank by prestige; actual = NCAA team finish (70%) + dual record rank (30%), log-rank scale, K=4. `tierScale(p) = 0.5 + 2.3*((99-p)/69)^1.2` multiplies gains (top programs barely move, small/mid move a lot), losses x max(1, scale), one-season cap 2*scale (max 4.5), banner floors (title +.75, top-3 +.4, top-5 +.2), clamp 30-99, one decimal. Penn State holds 98-99; mean 10-yr move 80+: ~1.5, 45-61: ~2.8 (range +-7).

## Player development (core.js trainWrestler, offseason.js growWrestler)
- In-season: `SEASON_RATE` .27, `SEASON_CAP` 2 points per attribute per season (`w.sg`), hard stop at `w.pot`, only practice-focus attributes. ~+0.1 OVR/season.
- Offseason (`DEV`): each attribute closes a random share of its gap to `pot` = class base (fr .29 / so .24 / jr .17) x prestige (.72+.5p) x ethic x luck x coachFactor; focus attributes x1.6; luck = exp(.22*`w.dev` + .3*gauss); `w.dev` hidden persistent trait; ~7%/yr bust (luck x.25, pot -1) or breakout (x1.7, pot +1); at-pot attributes can pass it by +1 (3-10%). ~+0.8-1.0 OVR/yr (fr 1.3, so .7, jr .4). Ratings never decrease. Inbox "Offseason development" note.

## Offseason (js/game/offseason.js)
- The finished recruiting class is snapshotted into `G.lastClass = {season, recs}` before `G.recruits` is cleared; during the offseason the Recruiting page shows only "Class of N: signings & rankings" (your class, full class rankings, top 50 recruits and where they signed) and the portal. Cleared by `startNewSeason`.
5 steps `G.off.step`: **leaving** (`beginOffseason`: graduate seniors (+`retire()` into the legacy archive), add freshmen, build portal, AI cuts; no rating changes. The screen lists your graduates + transfers out and the top 25 seniors leaving the sport, `G.off.leaving`) -> **cut** -> **progress** (`runProgression`: growth + class-up for rostered AND portal wrestlers, `G.off.prog` table) -> **recruit** (portal tab unlocked) -> **schedule** (editor, see season.md) -> `startNewSeason` (runs any skipped steps, resolves portal, walk-ons, prestige, new calendar/schedule/class; `pruneGone`, `pruneArchive`). Top-bar button = next step; nav item "Offseason".

## Fatigue / training
`FATIGUE` (core.js): energyK .18, energy floor 70, dual match +4, tournament +2.5/bout (in-tournament drain 2/bout, floor 50), autoLineup rest penalty .012. `INTENSITY.fat` light 2.5 / normal 7.5 / hard 11 (practice.js). AI `aiPlan` tapers before conference/NCAAs; the user's intensity is static (auto-taper idea not done). NCAA finish no longer depends much on intensity.

## Injuries
Injury Center screen; `INJURY_INFO`, `G.injLog` (last 40), `w.prone`. Rehab window after recovery `w.rehab` raises re-injury chance (`reinjuryMult`: bonus minor .4 / moderate .8 / severe 1.2 over 2/4/8 weeks). `AGGRAVATE` .35 for playing hurt. `matchInjuryChance` used in tournaments too.

## Weight classes
`canWrestle(w, wt)` = natural weight or exactly one class up (bump: -1 str/cardio/speed via `wrestlerAt`); never down. Dropping a class = weight move (`startWeightMove`, ~5 weeks, max 1/season; the last week of a cut is held between conference and NCAA weeks). `sanitizeLineup` runs in playDual, runEvent, runTraining, startNewSeason, loadGame.

## Recruiting difficulty (2026-11-14, `REC_DIFF` in recruit.js, `G.rec.diff`)
- Easy = the original model (old saves and headless sims without `diff`; longrun identical). New games default to Medium (new-game screen); changeable any time on the Recruiting page; kept across seasons.
- Medium / Hard (knobs in `REC_DIFF`):
  - **Level gap**: 3-5* recruits lose `gap` (Medium 0.8 / Hard 1.6) fit points per prestige point the school is below `STAR_PRES` (5* 92, 4* 76, 3* 58). The penalty is multiplied by `home` 0.35 (same state) / `region` 0.75-0.8, by `late` 0.35-0.4 from the last dual week - 1 when no program at his level (STAR_PRES - 8) has offered, by `sign` 0.25-0.3 on the final signing day.
  - **Money**: `aidK` 14 / 26 fit points per scholarship fraction below (usual ask - 0.25), scaled by stars.
  - **Attention counts less**: interest weight in fit `intK` .45 -> .38 / .32; your action gains x .9 / .8; neglected targets cool 4 / 5 a week (was 3); in-season commit needs fit 31 / 32 (was 30).
  - **Rivals push back**: for a 4-5* on your board at interest 40+, the two AI programs at his level (STAR_PRES - 6, with room) with the most interest gain +3 / +6 a week.
  - **AI funds elite recruits**: programs at a 4-5* recruit's level (STAR_PRES - 8) add their best two such recruits to the weekly targets and offer even when short of aid (at least 25%). This closed the main hole: with the original model the top programs' aid was used up by their rosters, so the 5* got NO AI offers and any team with money won them.
  - Recruiting board: "thinks you are below his level" under the standing when the penalty is 6+ (`belowLevel`).
- Measured (`rec_harness.html`, 2 seeds, one season): a greedy human strategy (board = top 14 by rank, full offers, all hours) signs per season, Easy / Medium / Hard: Virginia (prestige 50) 6.5 / 0.5 / 0 five-stars (top-50: 6.5 / 1 / 1.5); Missouri (76) 4 / 0.5 / 0 five-stars (top-50 4 / 2.5 / 2.5, now 4*); Penn State (98) 6 / 5 / 5. Auto-recruiting ("AI logic") classes: Penn State 6-7 top-50 on every difficulty, Missouri ~6 3*, signed class 7 / 6-7.5 / 5.5-7. AI average signee stars by prestige tier unchanged (A ~3.7, B ~3.1, C ~2.2, D ~1.5).
- Ideas not done: decommitments, official-visit weekends, in-state pipelines, NIL.

## International recruits (2026-11-14)
- `INTL_RECRUITS` (fsdata.js): share .03 of each class, countries weighted (Canada 4, Japan 2, Mexico, Puerto Rico, India, Mongolia, Georgia, Ukraine, South Korea, Nigeria, Australia, Colombia 1). Chosen by a hash of `G.seed:recruitId` after the class is generated (no rng draws; only those recruits change: name from the country's pool, `state` = country, `region` 'International' so 'Close to home' never applies, `nat` = code). 5-13 per class measured. `nat` carries to the college wrestler (`w.nat`, offseason.js), profile shows Country; freestyle eligibility in freestyle.md. Note: this changes newGame's recruit class (deliberately) vs before 2026-11-14.
