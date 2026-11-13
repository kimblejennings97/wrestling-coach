# Match engine (js/engine/bout.js, rng.js)

`simulateBout(wA, wB, opts)` — seeded mulberry32 (`opts.seed`), so any bout replays exactly. Every bout is simulated BEFORE it is shown; the viewer only plays back the log. **Rule: anything added for the viewer (log tags, move names, chain variants) must not add, remove or reorder rng draws.** Pick variants from the clock/score (`vk(n)`, `S.elapsed % k`), or replace text after the existing `pick()`. Verify with an A/B page against the previous commit's bout.js (3,000 random bouts: winner, method, log length, per-event score/clock/fx/pos identical).

## Attributes and OVR
- 14 attributes (`ATTR_KEYS`): str, cardio, speed, flex, tdo, tdd, hand, topc, topt, botEsc, botRes, big, comp, iq. **Never change real/generated attributes when retuning** (user rule).
- `OVR_W` (bout.js, imported by core) is fitted to engine impact (~30k bouts): tdd 1.64, tdo 1.59, speed 1.5, iq .8, hand .78, str .59, botEsc .55, topc .51, cardio .48, comp .47, flex .39, botRes .35, big .27, topt .24. `OVR_W_LEGACY` + `overallLegacy` (core.js) are kept ONLY for generation-time targets (applyRealTeams, applyRealTop, initDev pot base, bust floor) so new games get identical attributes.
- `ELO_PER_OVR` 105 (fit 103). Favourite-by-OVR win rate by gap: 0-1 57%, 1-2 70%, 2-3 79%, 3-4 89%, 4-5 94%, 5-6 98%, 6+ ~100%.
- `SKILL.amp` 1 (off) and `ELITE.amp` 0 (off): gap amplifiers tried and superseded by the takedown curve.

## Neutral: takedowns (`pTakedown(O, D)`, knobs `TD`)
- Composites: `off = .65 tdo + .15 speed + .10 hand + .05 str + .05 iq` (minus panic), `dfn = .65 tdd + .10 hand + .10 speed + .08 flex + .07 iq`.
- Mid-range curve (equal wrestlers ~27% per shot); as either composite passes ~14.5 it blends into an elite curve: below the defender `logit = -1.27 - 1.2*d^2`, above `-1.27 + .8*min(d, 2.5) + tail`. `TD = { from 14.5, span 4, mid0 -1.3, midK .17, e0 -1.27, posK .8, posCap 2.5, posTail .1, negQ 1.2 }`.
- Elite defence: a tdd 19-20 defender gives up ~0-0.3 takedowns per 100 bouts to attackers <= 16, ~1 to 17s, ~20-30 to 18s, ~90-100 to 19s.
- Shots, scrambles (scaled by pTD/0.3), throws (`bigMove`, same curve x1.1) and counters (`counterScale`: only someone near the shooter's level counters him) all follow it.
- `FLOW.shotPow` 3: the stronger wrestler takes a bigger share of the shots in a mismatch. `PACE` by weight (125 1.10 ... 197 .90, 285 .80) multiplies `FLOW.act`.

## Top / bottom
- `FLOW = { act .28, turn .0035, level .12, esc .07, rev .05, shotPow 3, letUp .9, letLead 3, letMin 40, rideK .5 }`.
- Near falls: `turn` x exp(top vs bottom) x `exp(-level*(botDefense-12))` (a good bottom wrestler is hard to turn). Pins: `PIN = { base .10, adv .016, strK .003, min .015, max .4, bigMult 1.2 }`; near-fall/pin odds use un-amplified `e0()`.
- Bonus hunting: a top man leading by `letLead`+ with a big tdo-vs-tdd edge lets the bottom man up (prob `letUp * gap`) to score again; never with < `letMin` 40 s left in the period. This is what produces tech falls.
- Riding time: only `rideK` (half) of top time counts; the 1-point award at >= 1:00 net now in ~20% of bouts.
- Period choices `CHOICE = { top 7, p2Neutral 7, trailNeutral 3, defer 47 }` (McGarvey 2018: 2nd-period chooser picks bottom 89 / neutral 7 / top 4%; ~47% of toss winners defer, decided by a seed hash, no rng). Period 3 rule is a judgement call (no data). `opts.userSide` + `opts.choices` let the user choose in live duals (see ui.md).
- Stalling: only a conservative-plan leader in period 2+ (16% of his idle neutral ticks); 1st call warning, then +1. ~11% of bouts get a warning with a realistic plan mix. No sourced real rate.

## Measured results (current)
- NCAA-like pairs (two of the top 33 at a weight): ~11.4 pts/bout, TD 2.3, decisions 75%, MD 16%, TF 2%, falls 7%, 41% within 3. Top-3 vs top-3: TF 0.2%, MD 8%, 55% within 3.
- League mix (random same-weight pairs incl. mismatches): ~11-12.5 pts, TD ~2.6, MD ~18-19%, falls ~7%, TF ~4-5%. Escapes ~2.5-3/bout (probably high; no sourced rate).
- Tech falls are concentrated: 77% of wrestlers 0 per season, top 5% hold ~half; OVR gap 8+ -> 40% TF.
- OVR >= 18.3 win ~94% (1.4 losses/season); stronger lineup wins ~84% of duals; Penn State (strongest real roster) wins most simulated titles.
- `FORM` (tourney.js) adds a per-event rating shift `sd 1.3 * clamp((19.5-OVR)/6, .15, 1)` in individual tournaments: #1 seed wins ~49%, seeds 1-4 82%, unseeded AAs 14%.

## Open / known off
- MD in the league mix above real; escapes likely high; loser scores a bit low; real NCAA pin rate lower than duals (engine doesn't distinguish); no top-position stalling or 2-point stall ladder; reversals ~8-13% of points between good wrestlers.

## Viewer tags (no effect on results)
`say(type, text, fx, who, ask, mv)`; every event has `pos` (neutral/topA/topB), `fx` (td, esc, rev, nf, fall, stuff, scramble, stall, hand, ride, break), `who`, `mv` (move key), `ride: [A, B]`. Move names map to keys through `MV`. Chains (`mv: 'pre+move'`) are chosen by `vk(n)` = (clock x10 + score hash) % n — see animation.md.

## Tools
`harness.html` (`?auto&quick`, calibration), `lab.html` + js/ui/match.js (Match Lab: generated or real-roster sides), `diag.html?name=...&live=1` (one wrestler's log vs expectations, attribute sensitivity), `sim_balance.html?seeds=1,2&years=10&user=<id>` (league health), `longrun.html?seeds=1,2&years=4` (multi-season invariants). Throwaway sweep pages were deleted after use.
