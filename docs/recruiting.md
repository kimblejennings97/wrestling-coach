# Recruiting, portal, rosters, prestige, development

## Recruiting (js/game/recruit.js)
- HS class 340/yr weighted by state (`data/states.js`: real 2025 NCAA qualifiers by home state drive counts and quality). Scouting uncertainty; scholarship cap 9.9 (`AID_CAP`).
- **Target board** `G.rec.board` (cap 25, reset each class); Recruiting opens on it. Weekly hours 20. `ACTIONS`/`doAction`: DM 1h, call 2h, pitch 3h (topic gain = his need x what your school delivers; aid pitch needs an offer), campus visit 6h (20+ interest), home visit 8h (40+); each once per recruit per week, visits once per season. Untouched targets lose 3 interest/week after 2 weeks; rival offers to board targets post inbox notes. `standing()` Leading / Neck and neck / Trailing (display only).
- Commit model: prestige, playing time, academics, location, aid + interest. `STAR_AID` 5★ .75 / 4★ .5 / 3★ .25 / 2★ .25 / 1★ 0. Signing-day scramble in `finalizeRecruits` (`r.late`). ~99% of a class signs, ~39% in the scramble.
- **AI-only caps** (`aiHasRoom`): `MAX_INCOMING_PER_WT` 2, `MAX_AT_WT` 4, `MAX_CLASS` 8, projected roster < `ROSTER_MAX` 30. **The user has no cap** (`hasWeightRoom` true for the user); the user's Auto/Repeat modes follow the AI caps.
- `targetScore` = shared AI ranking. `autoRecruit(G)` (user, "AI logic"), `repeatLastWeek(G)` (never offers), `G.rec.mode` manual | repeat | auto run by `runWeeklyAuto` in finishWeek; `tryAdvance()` warns about unused hours in manual mode (`G.rec.noWarn`). Mode and noWarn persist across seasons (a reset bug once killed auto-recruiting after year 1).
- Signees per team by prestige tier ~ A 7.5 / B 7.6 / C 4.1 / D 3.2 / E 2.7. Recruit stars vs outcomes (7 seasons): 5★ start ~16.0 OVR, AA 13/40/60/75% by class year, ~1 in 3 win a title; 4★ AA ~40% as seniors; 2★/1★ ~no AAs.

## Transfer portal and roster limit
- `ROSTER_MAX` 30, enforced in the offseason cut step. AI `autoCut` (lowest `keepValue`, starters protected, keeps 2 per weight; AI may cut a signed freshman as last resort); user cuts via the cut panel (`cutToPortal`, `cutsNeeded`, `autoCut`); the user's incoming freshmen (`w.fresh`) count toward 30 but can't be cut. Walk-ons added for empty weights; AI teams over 30 after that are cut again and the released are marked `gone`.
- `resolvePortal`: AI teams at 30+ can't sign; unsigned transfers stay in the sport with prob clamp(.3 + .09*(OVR-10), .08, .92) and walk on at the best-fit AI team (`ptScore` >= .3, roster < 29) else leave (`w.gone`, pruned by `pruneGone`). `p.fate` signed | walkon | left; user gets a note about wrestlers they released. 26-43 portal entries/yr, ~94% sign.

## Prestige (js/game/prestige.js)
`applyPrestige` in startNewSeason: expected finish = rank by prestige; actual = NCAA team finish (70%) + dual record rank (30%), log-rank scale, K=4. `tierScale(p) = 0.5 + 2.3*((99-p)/69)^1.2` multiplies gains (top programs barely move, small/mid move a lot), losses x max(1, scale), one-season cap 2*scale (max 4.5), banner floors (title +.75, top-3 +.4, top-5 +.2), clamp 30-99, one decimal. Penn State holds 98-99; mean 10-yr move 80+: ~1.5, 45-61: ~2.8 (range +-7).

## Player development (core.js trainWrestler, offseason.js growWrestler)
- In-season: `SEASON_RATE` .27, `SEASON_CAP` 2 points per attribute per season (`w.sg`), hard stop at `w.pot`, only practice-focus attributes. ~+0.1 OVR/season.
- Offseason (`DEV`): each attribute closes a random share of its gap to `pot` = class base (fr .29 / so .24 / jr .17) x prestige (.72+.5p) x ethic x luck x coachFactor; focus attributes x1.6; luck = exp(.22*`w.dev` + .3*gauss); `w.dev` hidden persistent trait; ~7%/yr bust (luck x.25, pot -1) or breakout (x1.7, pot +1); at-pot attributes can pass it by +1 (3-10%). ~+0.8-1.0 OVR/yr (fr 1.3, so .7, jr .4). Ratings never decrease. Inbox "Offseason development" note.

## Offseason (js/game/offseason.js)
4 steps `G.off.step`: **cut** (`beginOffseason`: graduate seniors (+`retire()` into the legacy archive), add freshmen, build portal, AI cuts; no rating changes) -> **progress** (`runProgression`: growth + class-up for rostered AND portal wrestlers, `G.off.prog` table) -> **recruit** (portal tab unlocked) -> **schedule** (editor, see season.md) -> `startNewSeason` (runs any skipped steps, resolves portal, walk-ons, prestige, new calendar/schedule/class; `pruneGone`, `pruneArchive`). Top-bar button = next step; nav item "Offseason".

## Fatigue / training
`FATIGUE` (core.js): energyK .18, energy floor 70, dual match +4, tournament +2.5/bout (in-tournament drain 2/bout, floor 50), autoLineup rest penalty .012. `INTENSITY.fat` light 2.5 / normal 7.5 / hard 11 (practice.js). AI `aiPlan` tapers before conference/NCAAs; the user's intensity is static (auto-taper idea not done). NCAA finish no longer depends much on intensity.

## Injuries
Injury Center screen; `INJURY_INFO`, `G.injLog` (last 40), `w.prone`. Rehab window after recovery `w.rehab` raises re-injury chance (`reinjuryMult`: bonus minor .4 / moderate .8 / severe 1.2 over 2/4/8 weeks). `AGGRAVATE` .35 for playing hurt. `matchInjuryChance` used in tournaments too.

## Weight classes
`canWrestle(w, wt)` = natural weight or exactly one class up (bump: -1 str/cardio/speed via `wrestlerAt`); never down. Dropping a class = weight move (`startWeightMove`, ~5 weeks, max 1/season; the last week of a cut is held between conference and NCAA weeks). `sanitizeLineup` runs in playDual, runEvent, runTraining, startNewSeason, loadGame.
