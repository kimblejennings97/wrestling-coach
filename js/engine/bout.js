// Folkstyle bout simulator. Pure logic, no DOM. Returns a result object plus a play-by-play log.
// Format: 3:00 / 2:00 / 2:00 periods, 1:00 riding-time point, 15-pt tech fall, SV-1 + TB-1 + TB-2 + UTB overtime.
import { makeRng } from './rng.js';

export const ATTR_KEYS = ['str', 'cardio', 'speed', 'flex', 'tdo', 'tdd', 'hand', 'topc', 'topt', 'botEsc', 'botRes', 'big', 'comp', 'iq'];
export const ATTR_LABELS = {
  str: 'Strength', cardio: 'Cardio', speed: 'Speed', flex: 'Flexibility',
  tdo: 'Takedown Offense', tdd: 'Takedown Defense', hand: 'Hand Fighting',
  topc: 'Top Control', topt: 'Top Turning', botEsc: 'Bottom Control', botRes: 'Bottom Resistance',
  big: 'Big Moves', comp: 'Composure', iq: 'Wrestling IQ',
};
// Scoring values in one place. Takedown = 3: NCAA Division I adopted the 3-point takedown (confirmed via Mat Stats analysis of 2024-26 data).
export const RULES = { takedown: 3, escape: 1, reversal: 2 };
// Pin odds per near-fall exposure: clamp(base + adv*skillGap + (str-10)*strK, min, max) x (pts>=3 ? bigMult : 1)
export const PIN = { base: 0.10, adv: 0.016, strK: 0.003, min: 0.015, max: 0.4, bigMult: 1.2 }; // retuned 2026-11-09 with the fewer-near-falls change (was base .035 / adv .008); before 2026-11-08: base .10 / adv .018 / bigMult 1.35 with ~1 near-fall per bout
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];
const cap = w => w[0].toUpperCase() + w.slice(1);
// skill amplifier: widens every attribute gap (around 10) so the better wrestler wins more often; 1 = original behaviour
export const SKILL = { amp: 1 };
// Elite separation: in a bout involving a top-tier wrestler the attribute DIFFERENCES between the two wrestlers are scaled up (their average is unchanged), so the
// true top of the sport pulls away from the pack instead of losing to 15-16 rated wrestlers as often as the linear model says.
//   gapAmp = 1 + ELITE.amp * clamp((best OVR in the bout - ELITE.from) / ELITE.span, 0, 1);  ELITE.amp = 0 turns it off.
// OVERALL = weighted average of the 14 attributes. Weights follow how much each attribute actually moves the bout winner in THIS engine (logistic regression of
// winners on attribute differences over ~24k simulated bouts, 2026-11-09, shrunk 20% toward uniform): the neutral position (takedown offense/defense, speed, hand
// fighting) is about half the rating, top/bottom skills and the rest share the other half. OVR_W_LEGACY is the pre-2026-11-09 formula; it is still used to turn target
// ratings into attributes at wrestler generation so every attribute stays exactly as before.
export const OVR_W = { tdd: 1.64, tdo: 1.59, speed: 1.5, iq: 0.8, hand: 0.78, str: 0.59, botEsc: 0.55, topc: 0.51, cardio: 0.48, comp: 0.47, flex: 0.39, botRes: 0.35, big: 0.27, topt: 0.24 };   // re-fit 2026-11-09 (night) after the tech-fall pass: speed up, top/bottom skills down again
export const OVR_W_LEGACY = { tdo: 1.3, tdd: 1.1, speed: 1.2, hand: 1.1, botEsc: 1, topc: 1, topt: 1, botRes: 1, big: 0.6, str: 0.8, cardio: 0.9, iq: 0.6, flex: 0.5, comp: 0.5 };
const OVR_SUM = Object.values(OVR_W).reduce((a, b) => a + b, 0);
export const ovrOfAttrs = at => Object.keys(OVR_W).reduce((s, k) => s + at[k] * OVR_W[k], 0) / OVR_SUM;
// Takedown success per shot from the attacker's neutral composite O and the defender's composite D (both on the 1-20 attribute scale).
// Mid-range wrestlers keep the old gentle curve; once either side is elite (composite > ~14.5) the curve gets steep: an elite defender (19-20 takedown
// defense) shuts out anyone more than ~1.5 points below him and gives up takedowns only to other elite attackers; an elite attacker is held to ~80% per shot
// against average defenders. TD.* are the knobs (see the 2026-11-09 engine notes in CLAUDE.md).
export const TD = { from: 14.5, span: 4, mid0: -1.3, midK: 0.17, e0: -1.27, posK: 0.8, posCap: 2.5, posTail: 0.1, negQ: 1.2 };
export function pTakedown(O, D) {
  const mid = TD.mid0 + TD.midK * (O - D), t = Math.max(0, Math.min(1, (Math.max(O, D) - TD.from) / TD.span));
  if (t === 0) return 1 / (1 + Math.exp(-mid));
  const d = O - D, elite = d >= 0 ? TD.e0 + TD.posK * Math.min(d, TD.posCap) + TD.posTail * Math.max(d - TD.posCap, 0) : TD.e0 - TD.negQ * d * d;
  return 1 / (1 + Math.exp(-((1 - t) * mid + t * elite)));
}
// Match flow knobs (2026-11-09 scoring retune): how often wrestlers shoot, get turned (near-falls), escape or reverse.
export const FLOW = { rideK: 0.5, letUp: 0.9, letLead: 3, shotPow: 3, act: 0.28, turn: 0.0035, level: 0.12, esc: 0.07, rev: 0.05 };   // 2026-11-09 tech-fall pass: letUp/letLead (dominant wrestlers let opponents up to score again), shotPow (stronger wrestler takes more of the shots); was act .58 / turn .014 / level 0 / esc .08 / rev .18 before the scoring retune
// pace by weight class: lighter weights are quicker and score more, heavyweights shoot less (real scoring falls steadily from 125 to 285)
export const PACE = new Proxy({ 125: 1.1, 133: 1.07, 141: 1.04, 149: 1.02, 157: 1.0, 165: 0.99, 174: 0.97, 184: 0.94, 197: 0.9, 285: 0.8 }, { get: (t, k) => t[k] ?? 1 });
export const ELITE = { amp: 0, from: 14, span: 4 };   // off: the elite takedown curve (TD) already separates the top tier
export const PERIODS = [{ label: '1st', len: 180 }, { label: '2nd', len: 120 }, { label: '3rd', len: 120 }];

const sig = x => 1 / (1 + Math.exp(-x));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const other = s => (s === 'A' ? 'B' : 'A');
const lastName = w => w.name.split(' ').slice(-1)[0];
export const fmtClock = sec => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

const FATIGUE_K = 0.115; // energy lost per second at activity 0 for cardio 0 (see calibration in harness)

export function simulateBout(wA, wB, opts = {}) {
  const seed = opts.seed ?? ((Math.random() * 4294967296) >>> 0);
  const rng = opts.rng || makeRng(seed);
  const W = { A: wA, B: wB };
  const plan = { A: opts.planA || wA.plan || 'balanced', B: opts.planB || wB.plan || 'balanced' };
  const E = { A: opts.energyA ?? 100, B: opts.energyB ?? 100 };
  const S = {
    score: { A: 0, B: 0 }, ride: { A: 0, B: 0 }, elapsed: 0, remaining: 0,
    periodLabel: '1st', periodNo: 1, pos: 'neutral', over: false, method: null, winner: null, mode: 'reg', tired: { A: false, B: false },
  };
  const mkStats = () => ({ shots: 0, takedowns: 0, escapes: 0, reversals: 0, nearFalls: 0, nfPoints: 0, bigMoves: 0, counters: 0 });
  const ST = { A: mkStats(), B: mkStats() };
  const log = [];

  const nm = s => lastName(W[s]);
  const say = (type, text) => log.push({ type, period: S.periodLabel, clock: fmtClock(S.remaining), a: S.score.A, b: S.score.B, text });
  const pick = arr => rng.pick(arr);

  // ---------- rating helpers ----------
  const pressure = s => {
    const clutch = (S.periodNo >= 3 || S.mode !== 'reg') && Math.abs(S.score.A - S.score.B) <= 3;
    return clutch ? 1 + (W[s].attrs.comp - 10) * 0.008 : 1;
  };
  const gapAmp = 1 + ELITE.amp * clamp((Math.max(ovrOfAttrs(wA.attrs), ovrOfAttrs(wB.attrs)) - ELITE.from) / ELITE.span, 0, 1);
  const val = (s, k) => { const a = W[s].attrs[k]; if (gapAmp === 1) return a; const m = (W.A.attrs[k] + W.B.attrs[k]) / 2; return m + (a - m) * gapAmp; };
  const e = (s, k) => (10 + (val(s, k) - 10) * SKILL.amp) * (0.72 + 0.28 * E[s] / 100) * pressure(s);
  const ssOf = s => 0.4 * e(s, 'tdd') + 0.3 * e(s, 'iq') + 0.3 * e(s, 'speed');
  // how likely `def` is to counter `att` relative to a mid-level pairing: ~1 for equals, ~0 when the counter-wrestler is far below the shooter, up to 1.5 when far above
  const counterScale = (def, att) => Math.min(1.5, pTakedown(ssOf(def), ssOf(att)) / sig(TD.mid0 + TD.midK * (ssOf(def) - ssOf(att))));
  const e0 = (s, k) => (10 + (W[s].attrs[k] - 10) * SKILL.amp) * (0.72 + 0.28 * E[s] / 100) * pressure(s);   // no elite separation: pin odds keep their league-wide calibration
  const planMult = s => {
    let m = { aggressive: 1.25, balanced: 1, conservative: 0.78 }[plan[s]] ?? 1;
    if (S.periodNo >= 3 && S.mode === 'reg') {
      const d = S.score[s] - S.score[other(s)];
      if (d < 0) m *= 1.15; else if (d > 2) m *= 0.88;
    }
    if (S.mode === 'sv') m *= 1.1;
    return m;
  };
  // Composure: when trailing by 3+ (more so in the 3rd period / overtime), low-composure wrestlers press, rush shots and lose efficiency; steady ones don't.
  const panic = s => {
    if (S.mode === 'tb') return 0;
    const d = S.score[other(s)] - S.score[s];
    if (d < 3) return 0;
    const late = S.periodNo >= 3 || S.mode === 'sv' ? 1 : 0.4;
    return late * clamp((12 - W[s].attrs.comp) / 12, -0.4, 1);
  };
  const stall = { A: 0, B: 0 };
  const drain = (dt, actA, actB) => {
    for (const [s, act] of [['A', actA], ['B', actB]]) {
      E[s] = Math.max(5, E[s] - FATIGUE_K * (1 - W[s].attrs.cardio / 30) * (1 + act) * dt * ({ aggressive: 1.2, conservative: 0.85 }[plan[s]] ?? 1));
    }
  };
  const advance = dt => { S.remaining -= dt; S.elapsed += dt; };
  const tiredCheck = () => {
    for (const s of ['A', 'B']) {
      if (E[s] < 48 && !S.tired[s]) { S.tired[s] = true; say('info', `${nm(s)} is breathing heavily now — the pace is catching up to him.`); }
    }
  };

  // ---------- scoring ----------
  const award = (s, pts) => {
    S.score[s] += pts;
    if (S.mode === 'reg' && Math.abs(S.score.A - S.score.B) >= 15) {
      S.over = true; S.method = 'TF'; S.winner = S.score.A > S.score.B ? 'A' : 'B';
    }
  };
  const doFall = t => { S.over = true; S.method = 'Fall'; S.winner = t; };
  const scoreLine = () => `${nm('A')} ${S.score.A}, ${nm('B')} ${S.score.B}`;

  // ---------- naming helpers ----------
  const shotName = att => {
    const a = W[att].attrs;
    const opts = [
      ['a blast double', a.str * 1.2 + a.tdo * 0.5], ['a low single', a.speed + a.tdo * 0.6], ['a high-crotch', a.tdo + a.flex * 0.4],
      ['an ankle pick', a.flex * 1.1 + a.speed * 0.4], ['a double leg', a.tdo + a.str * 0.3], ['a snap and go-behind', a.hand * 1.2 + a.iq * 0.3],
    ];
    return rng.weighted(opts, o => Math.pow(Math.max(1, o[1] - 5), 2))[0];
  };
  const turnName = t => {
    const a = W[t].attrs;
    const opts = [
      ['a half nelson', a.str + a.topt], ['a cradle', a.flex + a.topt], ['a tilt', a.iq + a.topt],
      ['a leg ride and turk', a.topc + a.str * 0.5], ['an arm bar', a.str + a.topt * 0.5], ['a cross-face cradle', a.flex + a.topc * 0.5],
    ];
    return rng.weighted(opts, o => Math.pow(Math.max(1, o[1] - 5), 2))[0];
  };
  const BIG = ['a huge arm throw', 'a headlock', 'a lateral drop', "a fireman's carry", 'a high-amplitude lift'];
  const fmtRT = sec => fmtClock(Math.abs(sec));

  // ---------- neutral ----------
  function takedown(att, def, how) {
    ST[att].takedowns++;
    award(att, RULES.takedown);
    S.pos = 'top' + att;
    const T = [
      `${nm(att)} finishes ${how} and takes ${nm(def)} down. ${cap(WORDS[RULES.takedown])} points.`,
      `${nm(att)} drives through ${how} — takedown!`,
      `${nm(def)} can't stop ${how}. ${nm(att)} scores the takedown.`,
    ];
    say('score', `${pick(T)} (${scoreLine()})`);
  }

  function exposure(t, b, src) {
    // Near-fall / pin attempt after getting position. src: 'turn' (normal) or 'throw' (big move, more dangerous)
    const adv = e0(t, 'topt') - e0(b, 'botRes') + (src === 'throw' ? 3 : 0);
    const r = rng() - adv * 0.012;
    const pts = r < 0.52 ? 2 : r < 0.88 ? 3 : 4;
    ST[t].nearFalls++; ST[t].nfPoints += pts;
    award(t, pts);
    const pPin = clamp(PIN.base + PIN.adv * adv + (e0(t, 'str') - 10) * PIN.strK, PIN.min, PIN.max) * (pts >= 3 ? PIN.bigMult : 1);
    return { pts, pin: rng.chance(pPin) };
  }

  function bigMove(att, def) {
    ST[att].shots++; ST[att].bigMoves++;
    const how = pick(BIG);
    const power = 0.5 * e(att, 'big') + 0.3 * e(att, 'str') + 0.2 * e(att, 'speed');
    const guard = 0.65 * e(def, 'tdd') + 0.10 * e(def, 'hand') + 0.10 * e(def, 'speed') + 0.08 * e(def, 'flex') + 0.07 * e(def, 'iq');
    if (rng.chance(Math.min(pTakedown(power, guard) * 1.1, 0.95))) {   // throws get a small edge over shots, but an elite takedown defender still shuts them down
      ST[att].takedowns++; award(att, RULES.takedown); S.pos = 'top' + att;
      if (S.over) { say('score', `${nm(att)} hits ${how}! (${scoreLine()})`); return; }
      const x = exposure(att, def, 'throw');
      if (x.pin) { say('fall', `${nm(att)} hits ${how} and lands ${nm(def)} right on his back — he's holding him there... FALL!`); doFall(att); return; }
      say('score', `${nm(att)} hits ${how}! ${nm(def)} is in trouble — takedown plus ${x.pts} near-fall points. (${scoreLine()})`);
    } else {
      if (rng.chance(0.4 * counterScale(def, att))) {   // a failed throw is only turned around by someone near the thrower's level
        ST[def].counters++; ST[def].takedowns++; award(def, RULES.takedown); S.pos = 'top' + def;
        say('score', `${nm(att)} goes for ${how} but ${nm(def)} turns it around and scores! (${scoreLine()})`);
      } else {
        say('info', `${nm(att)} tries ${how}, but ${nm(def)} rides it out and they reset.`);
      }
    }
  }

  function neutralTick() {
    const dt = Math.min(rng.range(8, 13), S.remaining);
    advance(dt);
    const pAct = clamp(FLOW.act * PACE[wA.weight] * (planMult('A') + planMult('B')) / 2, 0.15, 0.9);   // heavier weights are slower and score less
    if (!rng.chance(pAct)) {
      drain(dt, 0.3, 0.3);
      const staller = S.mode === 'reg' && S.periodNo >= 2 ? ['A', 'B'].find(x => S.score[x] > S.score[other(x)] && plan[x] === 'conservative') : null;
      if (staller && rng.chance(0.16)) {
        stall[staller]++;
        if (stall[staller] === 1) say('info', `${nm(staller)} is warned for stalling.`);
        else { award(other(staller), 1); say('score', `Stalling on ${nm(staller)} — one point to ${nm(other(staller))}. (${scoreLine()})`); }
        tiredCheck(); return;
      }
      const hf = e('A', 'hand') - e('B', 'hand');
      if (rng.chance(0.65)) {
        if (Math.abs(hf) > 3) { const w = hf > 0 ? 'A' : 'B'; say('info', `${nm(w)} is winning the hand fight, controlling ties in the center.`); }
        else say('info', pick([`${nm('A')} and ${nm('B')} trade ties in the center.`, `Both wrestlers feel each other out — no one commits.`, `${nm(pick(['A', 'B']))} snaps and circles, looking for an opening.`]));
      }
      tiredCheck(); return;
    }
    const hf = e('A', 'hand') - e('B', 'hand');
    const wt = s => planMult(s) * Math.pow(0.35 + e(s, 'tdo') / 20 * 0.45 + e(s, 'speed') / 20 * 0.25, FLOW.shotPow) * (1 + (s === 'A' ? hf : -hf) * 0.02);   // shotPow > 1: the stronger wrestler takes a bigger share of the shots in a mismatch
    const wa = wt('A'), wb = wt('B');
    const att = rng.chance(wa / (wa + wb)) ? 'A' : 'B', def = other(att);
    drain(dt, 0.9, 0.9);

    const pBig = clamp((e(att, 'big') - 9) / 55, 0, 0.28) * (plan[att] === 'aggressive' ? 1.2 : 1);
    if (rng.chance(pBig)) { bigMove(att, def); tiredCheck(); return; }

    ST[att].shots++;
    const how = shotName(att);
    const off = 0.65 * e(att, 'tdo') + 0.15 * e(att, 'speed') + 0.10 * e(att, 'hand') + 0.05 * e(att, 'str') + 0.05 * e(att, 'iq') - 1.4 * panic(att);
    const dfn = 0.65 * e(def, 'tdd') + 0.10 * e(def, 'hand') + 0.10 * e(def, 'speed') + 0.08 * e(def, 'flex') + 0.07 * e(def, 'iq');
    const pTD = pTakedown(off, dfn);
    if (rng.chance(pTD)) { takedown(att, def, how); tiredCheck(); return; }

    const ss = s => 0.4 * e(s, 'tdd') + 0.3 * e(s, 'iq') + 0.3 * e(s, 'speed');
    // counters follow the same elite curve: a wrestler is only countered by someone near his own level, an elite counter-wrestler counters weaker shooters more
    const cScale = counterScale(def, att);
    const pCounter = sig(0.12 * (ss(def) - ss(att)) - 2.0) * cScale * ({ aggressive: 1.5, conservative: 0.6 }[plan[att]] ?? 1);
    const r = rng();
    if (r < pCounter) {
      ST[def].counters++; ST[def].takedowns++; award(def, RULES.takedown); S.pos = 'top' + def;
      say('score', `${nm(att)} goes for ${how}, but ${nm(def)} counters and gets behind! ${cap(WORDS[RULES.takedown])} for ${nm(def)}. (${scoreLine()})`);
    } else if (r < pCounter + 0.2) {
      if (rng.chance(sig(0.15 * (ss(att) - ss(def))) * 0.7 * Math.max(0.02, Math.min(1.3, pTD / 0.3)))) takedown(att, def, 'out of a wild scramble');   // a shot the defender shuts down rarely turns into a scramble takedown
      else say('info', `Scramble! ${nm(att)} and ${nm(def)} spin around, but neither can finish — back to the feet.`);
    } else {
      const D = [
        `${nm(def)} sprawls and stuffs ${how} from ${nm(att)}.`, `${nm(att)} goes for ${how}; ${nm(def)} fights off the hands and stays on his feet.`,
        `${nm(def)} hips out of ${how} and circles away.`, `${nm(att)} gets in deep on ${how}, but ${nm(def)} whizzers and blocks it.`,
        `${nm(att)} goes for ${how} and they scramble out of bounds.`,
      ];
      say('info', pick(D));
    }
    tiredCheck();
  }

  // ---------- top / bottom ----------
  function topTick() {
    const T = S.pos === 'topA' ? 'A' : 'B', Bt = other(T);
    const dt = Math.min(rng.range(6, 11), S.remaining);
    advance(dt);
    drain(dt, T === 'A' ? 0.5 : 0.7, T === 'A' ? 0.7 : 0.5);
    // bonus hunting: a clearly dominant wrestler who is well ahead sometimes lets his opponent up (escape point) to go back to the feet and score again;
    // this is what turns lopsided matches into tech falls (equal wrestlers never qualify: it needs a big takedown-offense edge AND a lead)
    if (S.mode === 'reg' && FLOW.letUp > 0) {
      const lead = S.score[T] - S.score[Bt], gap = clamp((e(T, 'tdo') - e(Bt, 'tdd') - 2) / 6, 0, 1);
      if (lead >= FLOW.letLead && gap > 0 && rng.chance(FLOW.letUp * gap)) {
        ST[Bt].escapes++; award(Bt, RULES.escape); S.pos = 'neutral';
        say('score', `${nm(T)} lets ${nm(Bt)} up, looking for the bonus. Escape, one point. (${scoreLine()})`);
        tiredCheck(); return;
      }
    }
    const bDef = 0.7 * e0(Bt, 'botRes') + 0.3 * e0(Bt, 'flex');   // a good bottom wrestler is hard to turn at all: near-falls between two good wrestlers are rare
    const turnP = clamp(FLOW.turn * Math.exp(0.15 * ((0.8 * e0(T, 'topt') + 0.2 * e0(T, 'str')) - bDef)) * Math.exp(-FLOW.level * (bDef - 12)) * Math.sqrt(planMult(T)), 0.002, 0.3);
    const escDiff = (0.75 * e(Bt, 'botEsc') + 0.25 * e(Bt, 'speed')) - (0.75 * e(T, 'topc') + 0.25 * e(T, 'str'));
    const escP = clamp(FLOW.esc * Math.exp(0.10 * escDiff) * Math.sqrt(planMult(Bt)), 0.015, 0.4);
    const r = rng();
    if (r < turnP) {
      S.ride[T] += dt * FLOW.rideK;
      const how = turnName(T);
      const x = exposure(T, Bt, 'turn');
      if (x.pin) { say('fall', `${nm(T)} locks up ${how} and puts ${nm(Bt)} on his back... the referee is down — FALL!`); doFall(T); return; }
      say('score', `${nm(T)} catches ${nm(Bt)} with ${how} — near fall, ${x.pts} points. (${scoreLine()})`);
    } else if (r < turnP + escP) {
      const pRev = clamp(FLOW.rev + 0.015 * (e(Bt, 'speed') + e(Bt, 'iq') - 20), 0.02, 0.5);
      if (rng.chance(pRev)) {
        ST[Bt].reversals++; award(Bt, RULES.reversal); S.pos = 'top' + Bt; S.ride[Bt] += 0;
        say('score', `${nm(Bt)} sits out, turns the corner and reverses ${nm(T)}! ${cap(WORDS[RULES.reversal])} points. (${scoreLine()})`);
      } else {
        ST[Bt].escapes++; award(Bt, 1); S.pos = 'neutral';
        say('score', pick([`${nm(Bt)} stands up and breaks free — escape, one point. (${scoreLine()})`, `${nm(Bt)} hand-fights out of the bottom position. Escape! (${scoreLine()})`]));
      }
    } else {
      S.ride[T] += dt * FLOW.rideK;
      if (rng.chance(0.55)) {
        say('info', pick([`${nm(T)} rides tight, breaking ${nm(Bt)} down to the mat.`, `${nm(Bt)} tries to stand, but ${nm(T)} cuts him back down.`,
          `${nm(T)} keeps heavy hips on ${nm(Bt)}; the riding time clock is running.`, `${nm(Bt)} is flat to the mat as ${nm(T)} looks for a turn.`]));
      }
    }
    tiredCheck();
  }

  // ---------- period flow ----------
  function tick() { if (S.pos === 'neutral') neutralTick(); else topTick(); }

  function runPeriod(no, startPos) {
    S.periodNo = no; S.periodLabel = PERIODS[no - 1].label; S.remaining = PERIODS[no - 1].len; S.pos = startPos;
    while (S.remaining > 0 && !S.over) tick();
  }

  function chooseStart(c) {
    if (opts.chooser) { const r = opts.chooser(c, S, W); if (r) return r; }
    const o = other(c);
    const topVal = SKILL.amp * (0.5 * (W[c].attrs.topc + W[c].attrs.topt) - 0.5 * (W[o].attrs.botEsc + W[o].attrs.botRes));
    const botVal = SKILL.amp * (0.5 * (W[c].attrs.botEsc + W[c].attrs.botRes) - 0.5 * (W[o].attrs.topc + W[o].attrs.topt));
    const tdEdge = SKILL.amp * (W[c].attrs.tdo - W[o].attrs.tdd);
    if (S.periodNo === 3 && S.score[c] < S.score[o] && tdEdge >= 3) return 'neutral';
    if (topVal - botVal > 2.5) return 'top';
    return 'bottom';
  }
  const startPosFor = (c, choice) => (choice === 'top' ? 'top' + c : choice === 'bottom' ? 'top' + other(c) : 'neutral');

  const recover = () => { for (const s of ['A', 'B']) E[s] = Math.min(100, E[s] + 6 + W[s].attrs.cardio * 0.25); };

  // Intro
  S.remaining = PERIODS[0].len;
  say('period', `${W.A.name} (${W.A.school || 'unattached'}) vs ${W.B.name} (${W.B.school || 'unattached'}) at ${W.A.weight}. The referee blows the whistle.`);
  runPeriod(1, 'neutral');
  let choiceP2 = rng.chance(0.5) ? 'A' : 'B';
  if (!S.over) {
    say('period', `End of the first period. ${scoreLine()}.`);
    recover();
    const c = choiceP2, ch = chooseStart(c);
    S.periodNo = 2; S.periodLabel = '2nd'; S.remaining = PERIODS[1].len;
    say('period', `Second period. ${nm(c)} has the choice and chooses ${ch === 'neutral' ? 'neutral' : ch === 'top' ? 'top' : 'bottom'}.`);
    runPeriod(2, startPosFor(c, ch));
  }
  if (!S.over) {
    say('period', `End of the second period. ${scoreLine()}.`);
    recover();
    const c = other(choiceP2);
    S.periodNo = 3; S.periodLabel = '3rd'; S.remaining = PERIODS[2].len;
    const ch = chooseStart(c);
    say('period', `Third period. ${nm(c)} chooses ${ch}.`);
    runPeriod(3, startPosFor(c, ch));
  }

  if (!S.over) {
    S.remaining = 0;
    say('period', `Regulation ends. ${scoreLine()}. Riding time: ${nm('A')} ${fmtClock(S.ride.A)}, ${nm('B')} ${fmtClock(S.ride.B)}.`);
    // Assumption: the riding-time point is only awarded when the match is not tied after regulation.
    if (S.score.A !== S.score.B) {
      const adv = S.ride.A - S.ride.B;
      if (Math.abs(adv) >= 60) {
        const s = adv > 0 ? 'A' : 'B';
        S.score[s] += 1;
        say('score', `${nm(s)} earns the riding time point (${fmtRT(adv)} advantage). (${scoreLine()})`);
      }
    }
    if (S.score.A !== S.score.B) { S.winner = S.score.A > S.score.B ? 'A' : 'B'; S.method = 'Dec'; }
  }

  // ---------- overtime ----------
  if (!S.over && !S.winner) {
    S.mode = 'sv'; S.periodNo = 4; S.periodLabel = 'SV'; S.remaining = 60; S.pos = 'neutral';
    recover();
    say('period', `Tied ${S.score.A}-${S.score.B}! Sudden victory — first takedown wins.`);
    const base = { ...S.score };
    while (S.remaining > 0 && !S.over && S.score.A === base.A && S.score.B === base.B) tick();
    if (!S.over && (S.score.A !== base.A || S.score.B !== base.B)) {
      S.winner = S.score.A > S.score.B ? 'A' : 'B'; S.method = 'SV';
    }
  }
  if (!S.over && !S.winner) {
    S.mode = 'tb';
    const coin = rng.chance(0.5) ? 'A' : 'B';
    const tbSeg = (label, bottom) => {
      S.periodLabel = label; S.remaining = 30; S.pos = 'top' + other(bottom);
      const startPos = S.pos, before = { ...S.score };
      say('period', `${label}: ${nm(bottom)} starts on the bottom, 30 seconds.`);
      while (S.remaining > 0 && !S.over && S.pos === startPos) tick();
      return before;
    };
    S.periodNo = 5;
    tbSeg('TB-1', coin);
    if (!S.over) tbSeg('TB-2', other(coin));
    if (!S.over) {
      if (S.score.A !== S.score.B) { S.winner = S.score.A > S.score.B ? 'A' : 'B'; S.method = 'TB-2'; }
      else {
        const before = { ...S.score };
        const bottom = other(coin);
        tbSeg('UTB', bottom);
        if (!S.over) {
          if (S.score.A !== before.A || S.score.B !== before.B) S.winner = S.score.A > S.score.B ? 'A' : 'B';
          else S.winner = other(bottom); // rode out the full 30 seconds
          S.method = 'UTB';
        }
      }
    }
  }

  // ---------- result ----------
  const w = S.winner, l = other(w);
  const margin = S.score[w] - S.score[l];
  let teamPoints, detail, method;
  if (S.method === 'Fall') { teamPoints = 6; method = 'Fall'; detail = `Fall ${fmtClock(S.elapsed)}`; }
  else if (S.method === 'TF' || margin >= 15) { teamPoints = 5; method = 'Tech Fall'; detail = `TF ${S.score[w]}-${S.score[l]} ${fmtClock(S.elapsed)}`; }
  else if (margin >= 8) { teamPoints = 4; method = 'Major Decision'; detail = `MD ${S.score[w]}-${S.score[l]}`; }
  else {
    teamPoints = 3;
    method = S.method === 'Dec' ? 'Decision' : S.method === 'SV' ? 'Sudden Victory' : S.method === 'TB-2' ? 'Tiebreaker' : 'Ultimate Tiebreaker';
    detail = `${S.method === 'Dec' ? 'Dec' : S.method} ${S.score[w]}-${S.score[l]}`;
  }
  S.remaining = Math.max(0, S.remaining);
  say('end', `${W[w].name} (${W[w].school || 'unattached'}) wins by ${method.toLowerCase()}${S.method === 'Fall' || S.method === 'TF' ? ` at ${fmtClock(S.elapsed)}` : ` ${S.score[w]}-${S.score[l]}`}. ${teamPoints} team points.`);

  return {
    seed, winner: w, loser: l, method, detail, teamPoints, score: { ...S.score }, elapsed: S.elapsed,
    wrestlers: W, stats: { A: { ...ST.A, ride: S.ride.A, energy: E.A }, B: { ...ST.B, ride: S.ride.B, energy: E.B } }, log,
  };
}
