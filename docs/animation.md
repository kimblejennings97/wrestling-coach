# Bout animation (js/ui/anim.js) and the Move Viewer

## How it draws
- Jointed 3D skeletons, two-bone IK. A pose = hip `p [x, y]`, `z`, `yaw` (or `f: 1/-1`), `lean`, `roll`, limb targets `hL hR fL fR` as absolute `[x, y, z]`, facing-relative `{ r }`, body-relative `{ b: [up, forward, lateral] }` (hands from the shoulder, feet from the hip), or a joint of the other figure `{ o: 'knL', d }` / self `{ s }`; poles `pL pR qL qR`. `nb` = ankle band off.
- A clip (`CLIPS`) = keyframes `K(t, a, o, cam, extra)` for figures `a` (the event's `who`), `o` (opponent), `r` (referee); optional `a2/o2` (same body written another way for the next interval), `pr` (prop), `loop`, `n` frames, `dur`, `pin`, `aBottom` (escapes/reversal: 'a' is the bottom man, authored in the top man's frame), `noHg` (headgear in hand: hand raise + celebrations).
- Cameras `[yaw, pitch]`: `N = [0, 16]` side view, `M = [-22, 24]` mat view. Helpers: `S` stance, `UP`, `RT/RB` referee's position, `FT/FB` flattened, `SHOT`, `INLEGS`, `SPRAWL`, `SEAT`/`COVER`/`tail()` (leg-attack finish), `spin()` (go-behind ending at `rot180(RT)` with camera M+180), `rot180`, `mirZ`, `alt` (same body, reversed representation: used for rolls onto the back), `throwClip`, `roll()`.
- Frames are pre-rendered SVG groups shown in turn by CSS (`.fr`, `.lp lpN`, durations x `--spd`). `stage(res, last, col, opt)` returns the SVG; `opt = { band, champ, orient, clip, a, still, cam }`.
- Neutral clips always have 'a' on the left (XA -6.5) facing +x; mirroring by side (`MIRROR`) flips the whole stage.

## Event -> clip
`clipFor(res, last)`: td -> TD/THROW key or chain, nf/fall -> throw/turn, esc -> standup/sitout/granby/letup or chain, rev -> rev, stuff -> STUFF or chain, scramble, hand -> HAND set, stall, ride -> RIDE set, break -> brk, end -> end (or an NCAA title celebration when `opt.champ`: picked by bout seed from `CHAMP` = champJump, champCart, champToss, champFlex, champBack, champKneel).
Labels: `LABEL` by fx + `MOVE` by mv, `CHAIN_LBL` for chains.

## Clip list (Move Viewer groups)
- Hand fighting: idleN, ties, club, wrist, elbow, circle (swaps sides), snapdn, handfight, stall, brk.
- Takedowns: double, single, highc (own clip), itrip (inside trip), sweep, trip, ankle, snap, duck, counter, scr; counters to leg attacks: pancake, kickstand, hcswitch (see below).
- Throws: headlock, armthrow, lateral, fireman, lift. Defence: sprawl, whizzer, hipout, oob, throw, scramble.
- Top: idleT, breakdown, matret (slam with legs flung wide), hips, flat, spiral. Turns: half, cradle, tilt, turk, wing (= armbar).
- Escapes/reversal: standup, sitout, granby, letup, rev.
- End: end (hand raised, headgear in hand), 6 celebrations.

## Chains (2026-11-12)
Name with `+` = parts played in turn (`chainClip`): `sprawl+double` = shot, sprawl, re-shot double. `~part` = same move by the OTHER wrestler from the other side (rot180 + roles swapped): `sprawl+~sprawl` = shot, sprawl, counter-shot, sprawl. `!part` = roles swapped without turning (mat clips): `!matret+standup`. Joins: short beat, longer when poses differ; headings kept continuous; turn/loop/label from the last part (`tw` = remapped turn window). `known(name)` validates any combination; `CHAIN_NAMES` lists the 22 the engine produces. Engine side: `TD_CHAIN`/`PRE_TXT` (~40% of leg attacks get a pre-move: sprawl, club, whizzer, handfight, ties, snapdn), half of stuffed sprawls become sprawl chains, 1/3 of whizzers `sprawl+whizzer`, 1/3 of stand-up escapes `!matret+standup`.

## Counters to leg attacks (2026-11-12)
`pancake` (vs double/high-crotch), `kickstand` (vs single/sweep/trip), `hcswitch` (vs high-crotch: sit to the hip, switch). Authored from the SHOOTER's side then `flipClip()` (roles swapped, scene turned half round) so the scorer is 'a'. The camera holds a 3/4 view and swings (raised) to the riding view at the end — there is a brief end-on frame. Engine: counter variant by the shot's `MV` and `vk(6)`; per 3,000 bouts ~159 pancakes, 233 kickstands, 42 sit-and-switches, 248 sprawl-and-shoot-back, ~1,050 spin-behind.

## Orientation: cutting the corner, side of the mat
- Clips are authored on a straight line; the pair is rotated about the vertical axis on the SOLVED joints (`rotAll`, pivot = hip midpoint of the final pose). `TURN_DEG` = degrees a move turns while finishing (window `TURN_WIN` .42-.95): double 70, single/highc 60, ankle 55, trip/scr 50, hipout 45, itrip/lift/standup/sitout 40, sprawl/whizzer 35, sweep/granby/letup/matret 30, breakdown 15.
- `orientAt(log, i)` -> `{ flip, h, cut }` carried from event to event: circles flip sides, |h| > 90 hands over to flip, period breaks and the end reset. Cut direction chosen so the move FINISHES readable (`MAT_END` moves -75..+25 deg in the clip frame, standing +-60), alternating when both work. `flipAt` wraps it.

## Viewer pacing
Bout feed is a timeout chain: `feedDelay()` (app.js) waits max(line time, (clipTime + 0.2) x line time), so long chains (flurry 2.75 s x --spd) aren't cut off. Speeds Slow/Normal/Fast = 2600/1700/800 ms per line (`--spd` = ms/1000).

## Other visuals
Red/green ankle band on the left shin (home team green in duals; at neutral sites the singlet nearer red is red: `bandSides`), headgear (`HEADGEAR`), singlet colours from team colours (`singletColors`, B goes white/grey when too close).

## Tools and checks
- `moves.html` (deployed): every clip + Chains group (77 entries), prev/next, replay, play all (waits per clip), speed, mirrored, other side of the mat, cut the corner, start turned, freeze frame, Works / Needs work + notes (localStorage `wc.moves`), Copy report.
- `animsheet.html` (not deployed): grid of clips; `?c=a,b&t=0.2,0.5,1&w=216` frozen contact sheet for headless screenshots, `&a=B`, `&h=30&cut=1`. Chain names need `+` URL-encoded as `%2B`.
- Fuzz after any clip change: render every event of a few hundred bouts with `orientAt` and check for NaN/undefined and unknown clips.
- Rough spots: sweep single's middle, wrist/elbow subtle at small size, circle overlaps briefly mid-turn, counters' end-on camera frame, chain joins only seen as stills. Nothing hand-checked on the iPad.
