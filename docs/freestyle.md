# Freestyle mode (optional, men's senior freestyle)

Status: design agreed with the user 2026-11-13; engine and animations are built first, career integration later.

## Design (agreed with the user, don't re-litigate)
- **Optional**: a "Freestyle season" switch on the new-game screen, off by default. Off = the game is exactly as before (`newGame` identical for a seed). Freestyle pools (foreign wrestlers, real US seniors, RTC rosters) use their own rng stream so college generation is identical even with it on.
- **Flow**: folkstyle season -> folkstyle offseason (5 steps) -> freestyle season -> next folkstyle season.
- **Freestyle season** = RTC roster phase, then 4 events in order: Bill Farrell (real: November, the first US qualifier for the Trials; kept as the opener, nothing between NCAAs and the US Open fits better), US Open, World Team Trials (Final X folded in), World Championships. Olympic years (2028, 2032, ...) replace Worlds with the Olympics, still 10 weights.
- **RTC**: one per school, no size cap. The user manages his own (drop / pick up, entries, weight). AI RTCs take college wrestlers who are All-American level and up; current college wrestlers can only be at their school's RTC; recent graduates stay or move to another RTC. Not everyone has to enter every event.
- **Weights**: 1:1 map 125->57, 133->61, 141->65, 149->70, 157->74, 165->79, 174->86, 184->92, 197->97, 285->125 kg. One move (up or down a class) per freestyle season, chosen in the RTC roster phase, instant.
- **Trials qualification** (game mix of real + fictional): top 6 at Farrell or US Open, prior-year World/Olympic team members, prior-year NCAA champions, plus at-large bids. Trials = bracket; the final is best-of-3. A prior-year World/Olympic medalist at that weight gets a bye straight into the best-of-3 final against the Trials bracket winner. Only the Trials winner per weight goes to Worlds.
- **Real 2026 procedure for reference** (USA Wrestling): US Open champions -> Final X; Challenge Tournament qualifiers: prior World/Olympic team members, U23/U20 world medalists, highest-placed US athlete (top 4) at the Farrell, NCAA top 3, US Open top 7, Pan-Am medalists; 2025 world medalists get an automatic Final X berth (best of 3).
- **Payoff**: RTC results give a small prestige bump and a recruiting pitch topic.
- **Ages**: post-college wrestlers keep developing slowly, then decline from a certain age; big post-college jumps are rare. Retirement around 30-34.
- **Foreign wrestlers**: real countries, strength by real-life national strength, generated names.
- **Real US seniors**: scrape current US freestyle wrestlers not already in the game, rate them from results, assign them to the most plausible school RTC (approximate: real RTCs/clubs are not 1:1 with schools).
- **Generated RTC athletes**: schools with no (or few) real RTC athletes get a few generated post-college wrestlers, count and quality scaled by school prestige and the strength of its current roster (wrestler rankings).
- **Stats**: separate freestyle records, Hall of Fame, multi-time World champions / medalists.

## Rules implemented (UWW rulebook, Dec 2025 edition)
- 2 x 3:00, 0:30 break, all restarts standing, no choices, no overtime.
- Points: 1 step-out, reversal, lost challenge, fleeing a hold (+caution), passivity point; 2 takedown, exposure (each gut wrench / leg-lace turn); 4 feet-to-danger from standing, short-amplitude lift to danger, grand amplitude not to danger; 5 grand amplitude to direct danger.
- Par terre only after a takedown: top man works, ref stands them up when the attack stalls; escapes score nothing; no riding time.
- Passivity: verbal warning, then a 30 s activity period (passive man must score or the opponent gets 1); 0-0 at 2:00 of period 1 forces a call; under 0:30 in a period, evading = caution + 1.
- Win: fall, 10-point technical superiority, 3 cautions, points. Tie criteria: highest-value move, number of highest-value moves, fewer cautions, last technical point.

## Engine (js/engine/fs.js, `simulateFsBout(wA, wB, opts)`)
- Same seeded rng and log format as bout.js (`type, period, clock, a, b, text, pos, fx, who, mv`, plus `cau` [cautions A, B] and `act` {who, left} for the activity clock; `ride` is always [0, 0]). Result adds `style: 'fs'`, `kg`, `cp` (UWW classification points winner:loser), `crit` (tie-break reason). Methods: Fall, Tech Fall (VSU, 10 points), Decision (incl. criteria), Disqualification (3 cautions). bout.js is untouched.
- Weight: `opts.kg`, else `FS_OF_LBS[w.weight]`.
- Composites (same 14 attributes): leg attack `.6 tdo .2 speed .1 hand .05 str .05 iq`; defence `.6 tdd .12 hand .1 speed .1 flex .08 iq`, through the folkstyle `pTakedown` curve (elite defence stays nearly unscorable). Par terre attack `.65 topt .2 str .1 iq .05 topc`, defence `.55 botRes .3 flex .15 str`. Push (step-outs) `.35 str .3 hand .2 cardio .15 tdo`. Throws `.5 big .3 str .2 speed`.
- Flow: neutral ticks 7-12 s. An attack (`FS.act` x pace x plans) is a throw (`FS.big`, rises with big: 2 / 4 / 5 points, counters 2 or 4) or a leg attack (takedown 2; `FS.four` to the back for 4 off double / high-crotch / single / sweep; `FS.funk` both score 2; counters 2; drive-out step-out 1). Quiet ticks: step-out push (`FS.push`), hand fighting, passivity. Par terre after a takedown: 4-8 s ticks, turn chance `FS.turn` logistic on the par-terre edge (`turnK`), each further turn x `turnDecay` (chains of leg laces / gut wrenches make the tech falls), bottom reversal / roll-through (`FS.rev`), else the referee stands them up (`FS.standUp`). Pins only from exposures (`FS.pin`, x `pinBig` for 4/5).
- Passivity: per-wrestler meter rises on quiet ticks (more for conservative / leading plans), falls when attacking; the referee acts at random on a clear gap: verbal warning first, then a 30 s activity clock (passive man x1.6 attack, opponent x.85); point to the opponent unless the passive man scores. Forced at 2:00 of the 1st if 0-0. Last 30 s: a conservative leader may be cautioned for fleeing (+1).
- Challenges: after conceding in a bout within 6, `FS.chal` 5%, overturned `FS.chalWin` 35% (takedown overturned -> back to neutral); lost = +1 to the opponent and no more challenges.
- `FS_OVR_W` / `fsOvrOfAttrs`: first-guess freestyle rating weights (not yet refitted on engine impact).
- `FS_PACE` by kg (61 1.16 ... 125 .80).

## Calibration (fs_harness.html, ?n=5000; generated wrestlers, 2026-11-13)
Real targets from Wikipedia brackets, World Championships 2022/23/25 + 2024 non-Olympic Worlds + 2024 Olympics (1,111 bouts; scraper kept in the session scratchpad, not the repo):
- All bouts: Dec 59%, TF 34.5%, Fall 6.3%; decisions average 6.3-2.6; 21% of bouts within 2; 5% of decisions tied (criteria); loser scoreless 39%; TF by weight 61 kg 44% ... 125 kg 26%.
- Both wrestlers won 2+ bouts at the event (n=294): Dec 63%, TF 28%, Fall 7.5%; decisions 6.5-2.8; within 2 24%; loser scoreless 34%.
Measured:
- Elite pairs (quality 16-18.5 both): Dec 64.1 / TF 30.2 / Fall 5.7; decisions 7.06-3.09; within 2 22.6%; criteria 5.0% (real ~1-3%, a bit high); loser scoreless 31%. Per bout: TD 3.0 (4-point .05), exposures 1.6, step-outs 1.1, activity points .24, challenges .15. Favourite by FS OVR: gap 0-1 76%, 1-2 91%, 2-3 98%.
- "Worlds" test mix (30% 16-18.5, 40% 13.5-16, 30% 10-13.5; invented): TF 43% / Fall 8.3% (real 34.5 / 6.3) — re-check once the country generator defines the real field.
- Unsourced: shares of step-outs / passivity points / exposures in real scoring; per-bout counts above are judgement.
- Open: FS_OVR_W refit; cautions only for conservative leaders (0 in the harness); criteria ties a bit high.

## Match Lab
lab.html has a Style switch (Folkstyle / Freestyle; `lab.html?style=fs`); weights show lbs and kg; the freestyle result table shows takedowns, 4-pointers, exposures, step-outs, activity points, cautions, challenges and FS OVR. No animation in the Lab (as before).
