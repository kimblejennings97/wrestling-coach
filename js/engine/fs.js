// Freestyle (UWW senior men) bout simulator. Pure logic, no DOM. Same log format as bout.js so the viewer, Match Lab and tournaments can reuse it.
// Rules (UWW rulebook, Dec 2025 edition, see docs/freestyle.md): 2 x 3:00 with a 0:30 break, every restart standing, 10-point technical superiority,
// fall, 3 cautions; ties go to criteria (highest-value move, number of them, fewer cautions, last technical point). No overtime.
// Points: step-out / reversal / fleeing / lost challenge / activity-period point 1, takedown 2, exposure 2, feet-to-danger 4, grand amplitude 4/5.
// Uses the same 14 attributes as folkstyle (never changed for freestyle); FS_OVR_W weighs them for freestyle.
import { makeRng } from './rng.js';
import { pTakedown, fmtClock } from './bout.js';

export const FS_WEIGHTS = [57, 61, 65, 70, 74, 79, 86, 92, 97, 125];
export const FS_OF_LBS = { 125: 57, 133: 61, 141: 65, 149: 70, 157: 74, 165: 79, 174: 86, 184: 92, 197: 97, 285: 125 };   // 1:1 college -> freestyle weight
export const FS_PERIODS = [{ label: '1st', len: 180 }, { label: '2nd', len: 180 }];
export const FS_TF = 10;
// Freestyle rating weights over the same attributes (first guess, to be refitted on engine impact like OVR_W): leg attacks, defence, speed, throws and
// par-terre skills count; riding (topc) and folkstyle escapes (botEsc) barely matter.
export const FS_OVR_W = { tdd: 1.6, tdo: 1.6, speed: 1.4, hand: 0.8, iq: 0.7, str: 0.7, topt: 0.6, botRes: 0.6, big: 0.6, cardio: 0.6, flex: 0.5, comp: 0.4, topc: 0.15, botEsc: 0.15 };
const FS_OVR_SUM = Object.values(FS_OVR_W).reduce((a, b) => a + b, 0);
// par-terre skill for display (wrestler profile): the same weights as ptAtt / ptDef in simulateFsBout, on the raw attributes (no fatigue)
export const FS_PT = { off: { topt: 0.65, str: 0.2, iq: 0.1, topc: 0.05 }, def: { botRes: 0.55, flex: 0.3, str: 0.15 } };
export const fsParTerre = at => Object.fromEntries(Object.entries(FS_PT).map(([k, W]) => [k, Object.keys(W).reduce((s, a) => s + at[a] * W[a], 0)]));
export const fsOvrOfAttrs = at => Object.keys(FS_OVR_W).reduce((s, k) => s + at[k] * FS_OVR_W[k], 0) / FS_OVR_SUM;

// Match flow knobs (fitted with fs_harness.html, see docs/freestyle.md for the targets).
export const FS = {
  act: 0.25,        // chance a neutral tick has a real attack (x pace x plans)
  push: 0.035,      // chance an attack-free tick ends with someone driven out (step-out), scaled by the pressure edge
  big: 0.05,        // share of attacks that are throws / headlocks at big 10 (rises with big)
  four: 0.06,       // share of leg-attack takedowns finished straight to the back (4 points), rises with str/big edge
  funk: 0.07,       // share of takedowns where the defender rolls the attacker through for 2 of his own on the way down
  cntr: 1.0,        // counter scaling (as folkstyle counters)
  turn: 0.12,       // par terre: chance per tick an even top man turns the bottom man (gut wrench / leg lace), before the skill edge
  turnK: 0.30,      // logistic slope of the turn chance on the par-terre skill edge
  turnDecay: 0.85,  // each further turn in the same sequence is a little harder
  again: { lace: 0.5, gator: 0.42, alace: 0.3, gut: 0.26, pinch: 0.22, armroll: 0.14 },   // chance to keep the lock and roll him again right away (x par-terre edge, x againK per extra roll); leg lace most, then the gator roll
  againK: 0.7,
  fhl: 0.16,        // share of counter takedowns that go from the front headlock straight to his back (gator roll / head pinch: 2 + 2), rises with big
  wrap: 0.35,       // share of counters to a high-crotch that are a chest wrap / crotch lift rolling the shooter through (2 to the defender, no takedown)
  standUp: 0.65,    // chance per failed par-terre tick that the referee stands them up
  rev: 0.03,        // bottom man reverses / rolls through (counter exposure) per par-terre tick, before skill
  pin: 0.02,        // fall chance per 2-point exposure at an even skill edge (4/5-pointers x pinBig)
  pinK: 0.005, pinBig: 2.2, pinMax: 0.35,
  passWarn: 0.06,   // chance per idle tick that the referee acts on a clearly passive wrestler
  chal: 0.05, chalWin: 0.35,   // challenge rate after conceding points in a close bout, and overturn rate
  shotPow: 2.5,
};
export const FS_PACE = new Proxy({ 57: 1.08, 61: 1.16, 65: 1.04, 70: 1.08, 74: 1.02, 79: 0.94, 86: 1.04, 92: 1.0, 97: 0.86, 125: 0.8 }, { get: (t, k) => t[k] ?? 1 });

const sig = x => 1 / (1 + Math.exp(-x));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const other = s => (s === 'A' ? 'B' : 'A');
const lastName = w => w.name.split(' ').slice(-1)[0];
const FATIGUE_K = 0.115;

export function simulateFsBout(wA, wB, opts = {}) {
  const seed = opts.seed ?? ((Math.random() * 4294967296) >>> 0);
  const rng = opts.rng || makeRng(seed);
  const W = { A: wA, B: wB };
  const kg = opts.kg || FS_OF_LBS[wA.weight] || wA.weight;
  const plan = { A: opts.planA || wA.plan || 'balanced', B: opts.planB || wB.plan || 'balanced' };
  const E = { A: opts.energyA ?? 100, B: opts.energyB ?? 100 };
  const S = {
    score: { A: 0, B: 0 }, elapsed: 0, remaining: 0, periodLabel: '1st', periodNo: 1, pos: 'neutral', over: false, method: null, winner: null,
    tired: { A: false, B: false }, caut: { A: 0, B: 0 }, moves: { A: [], B: [] }, lastTech: null, warned: { A: false, B: false }, passive: { A: 0, B: 0 },
    act: null,        // activity period: { who (the passive man), until (elapsed), base (his score when it began) }
    chalUsed: { A: false, B: false }, turns: 0,
  };
  const mkStats = () => ({ shots: 0, takedowns: 0, fourPts: 0, exposures: 0, expPoints: 0, stepOuts: 0, bigMoves: 0, counters: 0, reversals: 0, passPts: 0, cautions: 0, challenges: 0 });
  const ST = { A: mkStats(), B: mkStats() };
  const log = [];
  const nm = s => lastName(W[s]);
  const scoreLine = () => `${nm('A')} ${S.score.A}, ${nm('B')} ${S.score.B}`;
  const say = (type, text, fx, who, mv) => log.push({ type, period: S.periodLabel, clock: fmtClock(S.remaining), a: S.score.A, b: S.score.B, text, ride: [0, 0], pos: S.pos,
    fx: fx || null, who: who || null, ask: null, mv: mv || null, cau: [S.caut.A, S.caut.B], act: S.act ? { who: S.act.who, left: Math.max(0, Math.round(S.act.until - S.elapsed)) } : null });
  const pick = arr => rng.pick(arr);

  // ---------- ratings ----------
  const pressure = s => (S.periodNo === 2 && S.remaining < 60 && Math.abs(S.score.A - S.score.B) <= 3 ? 1 + (W[s].attrs.comp - 10) * 0.008 : 1);
  const e = (s, k) => W[s].attrs[k] * (0.72 + 0.28 * E[s] / 100) * pressure(s);
  const off = s => 0.6 * e(s, 'tdo') + 0.2 * e(s, 'speed') + 0.1 * e(s, 'hand') + 0.05 * e(s, 'str') + 0.05 * e(s, 'iq');
  const dfn = s => 0.6 * e(s, 'tdd') + 0.12 * e(s, 'hand') + 0.1 * e(s, 'speed') + 0.1 * e(s, 'flex') + 0.08 * e(s, 'iq');
  const ptAtt = s => 0.65 * e(s, 'topt') + 0.2 * e(s, 'str') + 0.1 * e(s, 'iq') + 0.05 * e(s, 'topc');   // gut wrench / leg lace
  const ptDef = s => 0.55 * e(s, 'botRes') + 0.3 * e(s, 'flex') + 0.15 * e(s, 'str');
  const pushOf = s => 0.35 * e(s, 'str') + 0.3 * e(s, 'hand') + 0.2 * e(s, 'cardio') + 0.15 * e(s, 'tdo');
  const ss = s => 0.4 * e(s, 'tdd') + 0.3 * e(s, 'iq') + 0.3 * e(s, 'speed');
  const counterScale = (d, a) => Math.min(1.5, pTakedown(ss(d), ss(a)) / sig(-1.3 + 0.17 * (ss(d) - ss(a))));
  const planMult = s => {
    let m = { aggressive: 1.25, balanced: 1, conservative: 0.78 }[plan[s]] ?? 1;
    const d = S.score[s] - S.score[other(s)];
    if (S.periodNo === 2) { if (d < 0) m *= 1.2 + (S.remaining < 60 ? 0.3 : 0); else if (d > 2) m *= 0.85; }
    if (S.act) m *= S.act.who === s ? 1.6 : 0.85;   // the passive man has to score
    return m;
  };
  const drain = (dt, aA, aB) => {
    for (const [s, a] of [['A', aA], ['B', aB]]) E[s] = Math.max(5, E[s] - FATIGUE_K * (1 - W[s].attrs.cardio / 30) * (1 + a) * dt * ({ aggressive: 1.2, conservative: 0.85 }[plan[s]] ?? 1));
  };
  const tiredCheck = () => { for (const s of ['A', 'B']) if (E[s] < 45 && !S.tired[s]) { S.tired[s] = true; say('info', `${nm(s)} is slowing down — the pace is getting to him.`); } };

  // ---------- scoring ----------
  // tech = a technical point (holds, step-outs): counts for "last technical point" and for "highest-value move"
  const award = (s, pts, tech = true) => {
    S.score[s] += pts;
    if (!S.firstPt && pts > 0) S.firstPt = s;   // first point of any kind (UWW 4.1: a 1-1 of two passivity points goes to the first scorer)
    if (tech) { S.moves[s].push(pts); S.lastTech = s; }
    if (S.act && s === S.act.who) S.act = null;   // the passive man scored: activity period over, no point
    if (Math.abs(S.score.A - S.score.B) >= FS_TF) { S.over = true; S.method = 'TF'; S.winner = S.score.A > S.score.B ? 'A' : 'B'; }
  };
  const unaward = (s, pts) => { S.score[s] -= pts; const i = S.moves[s].lastIndexOf(pts); if (i >= 0) S.moves[s].splice(i, 1); if (S.score.A + S.score.B === 0) S.firstPt = null; };
  const doFall = t => { S.over = true; S.method = 'Fall'; S.winner = t; };
  const caution = (s, why) => {
    S.caut[s]++; ST[s].cautions++;
    award(other(s), 1, false);
    if (S.caut[s] >= 3 && !S.over) { S.over = true; S.method = 'DQ'; S.winner = other(s); }
    say('score', `Caution on ${nm(s)} for ${why} — one point to ${nm(other(s))}. (${scoreLine()})`, 'caut', s, 'caut');
  };
  // the corner of the wrestler who just conceded may throw the challenge brick (one lost challenge per bout)
  function maybeChallenge(scorer, pts, base) {
    const c = other(scorer);
    if (S.over || S.chalUsed[c] || pts < 1 || Math.abs(S.score.A - S.score.B) > 6 || !rng.chance(FS.chal)) return;
    ST[c].challenges++;
    if (rng.chance(FS.chalWin)) {
      unaward(scorer, pts); if (base) S.lastTech = base.lastTech;
      if (base && base.kind === 'td') { ST[scorer].takedowns--; S.pos = 'neutral'; }   // no takedown: back to the feet
      if (base && base.kind === 'exp') { ST[scorer].exposures--; ST[scorer].expPoints -= pts; }
      say('score', `${nm(c)}'s corner challenges — the video review overturns it, no points. (${scoreLine()})`, 'chal', c, 'chal');
    } else {
      S.chalUsed[c] = true; award(scorer, 1, false);
      say('score', `${nm(c)}'s corner challenges the call — confirmed. Lost challenge: one more point to ${nm(scorer)}. (${scoreLine()})`, 'chal', c, 'chal');
    }
  }
  function exposure(t, b, pts, how, mv) {   // t scores pts by putting b in danger; may end in a fall
    ST[t].exposures++; ST[t].expPoints += pts;
    const before = { lastTech: S.lastTech, kind: 'exp' };
    award(t, pts);
    const adv = ptAtt(t) - ptDef(b);
    const pPin = clamp((FS.pin + FS.pinK * adv) * (pts >= 4 ? FS.pinBig : 1) * (0.8 + 0.02 * e(t, 'str')), 0.005, FS.pinMax);
    if (rng.chance(pPin)) { say('fall', `${nm(t)} ${how} and holds ${nm(b)}'s shoulders down — FALL!`, 'fall', t, mv); doFall(t); return false; }
    say('score', `${nm(t)} ${how} — ${pts} points. (${scoreLine()})`, pts >= 4 ? 'big' : 'exp', t, mv);
    if (!S.over) maybeChallenge(t, pts, before);
    return true;
  }

  // ---------- names (move -> animation key) ----------
  const shotName = s => {
    const a = W[s].attrs;
    return rng.weighted([
      ['a double leg', 'double', a.tdo + a.str * 0.4], ['a low single', 'single', a.speed + a.tdo * 0.6], ['a high-crotch', 'highc', a.tdo + a.flex * 0.4],
      ['an ankle pick', 'ankle', a.speed * 0.8 + a.hand * 0.6], ['a snap and go-behind', 'snap', a.hand * 1.2 + a.iq * 0.3], ['a duck-under', 'duck', a.speed * 0.8 + a.hand * 0.7],
      ['a sweep single', 'sweep', a.speed * 0.9 + a.tdo * 0.5], ['an arm spin', 'armspin', a.speed * 0.7 + a.iq * 0.6 + a.hand * 0.3], ['a slide-by', 'slideby', a.hand + a.speed * 0.5],
    ], o => Math.pow(Math.max(1, o[2] - 5), 2));
  };
  const turnName = s => {
    const a = W[s].attrs;
    return rng.weighted([
      ['rolls him with a gut wrench', 'gut', a.str + a.topt], ['laces the legs and turns him', 'lace', a.topt + a.flex * 0.5 + a.iq * 0.3],
      ['locks an ankle lace and rolls him through', 'alace', a.topt + a.speed * 0.5], ['traps the arm and turns him', 'armroll', a.topt + a.iq * 0.6],
    ], o => Math.pow(Math.max(1, o[2] - 5), 2));
  };
  const FOUR_OK = { double: 1.6, highc: 1.4, single: 0.8, sweep: 0.5 };   // shots that can be finished straight to the back (lift and dump)
  const BIG = [['a headlock', 'headlock'], ['a lateral drop', 'lateral'], ["a fireman's carry", 'fireman'], ['an arm throw', 'armthrow'], ['a suplex', 'suplex'], ['a duck-under to a belly-to-back suplex', 'bbsuplex']];

  // keep the lock and roll him again (leg laces most of all, then gator rolls); each extra roll is a separate 2-point exposure
  function rollAgain(T, Bt, mv, edge) {
    let k = 0;
    while (!S.over && rng.chance(clamp((FS.again[mv] || 0) * 2 * sig(0.25 * edge) * Math.pow(FS.againK, k), 0, 0.85))) {
      k++; S.turns++;
      const sec = Math.min(2, S.remaining); S.remaining -= sec; S.elapsed += sec;
      if (!exposure(T, Bt, 2, ['keeps the lock and rolls him again', 'rolls him a third time', 'keeps rolling — another turn'][Math.min(k - 1, 2)], mv)) break;
    }
  }

  // ---------- neutral ----------
  function takedown(att, def, how, mv) {
    ST[att].takedowns++;
    const before = { lastTech: S.lastTech, kind: 'td' };
    const edge = clamp(((0.5 * e(att, 'str') + 0.5 * e(att, 'big')) - (0.5 * e(def, 'str') + 0.5 * e(def, 'flex'))) / 6, -0.6, 1);
    if (rng.chance(FS.four * (1 + edge) * (FOUR_OK[mv] || 0))) {   // finished straight to the back
      ST[att].fourPts++; S.pos = 'top' + att;
      if (!exposure(att, def, 4, `finishes ${how} straight to the back`, mv + '4')) return;
    } else {
      award(att, 2); S.pos = 'top' + att;
      const funk = !S.over && rng.chance(FS.funk * clamp(counterScale(def, att), 0, 1.3));
      if (funk) {   // he gets the takedown, but is rolled through on the finish: 2 each
        ST[def].exposures++; ST[def].expPoints += 2; award(def, 2);
        say('score', `${nm(att)} gets in on ${how} and scores, but ${nm(def)} rolls him through — two each! (${scoreLine()})`, 'funk', att, 'funk');
        S.pos = 'neutral'; return;
      }
      say('score', `${nm(att)} finishes ${how} — takedown, two points. (${scoreLine()})`, 'td', att, mv);
      if (!S.over) maybeChallenge(att, 2, before);
    }
    S.turns = 0;
  }

  function bigMove(att, def) {
    ST[att].shots++; ST[att].bigMoves++;
    const [how, mv] = pick(BIG);
    const power = 0.5 * e(att, 'big') + 0.3 * e(att, 'str') + 0.2 * e(att, 'speed');
    if (rng.chance(Math.min(pTakedown(power, dfn(def)) * 1.1, 0.9))) {
      ST[att].takedowns++; S.pos = 'top' + att; S.turns = 0;
      const amp = rng.chance(clamp((e(att, 'big') - 10) / 25, 0.05, 0.35));   // grand amplitude
      const toBack = rng.chance(0.55);
      const pts = amp ? (toBack ? 5 : 4) : (toBack ? 4 : 2);
      if (pts === 2) { award(att, 2); say('score', `${nm(att)} hits ${how} and comes out on top — two points. (${scoreLine()})`, 'td', att, mv); return; }
      exposure(att, def, pts, `hits ${amp ? 'a huge ' + how.replace(/^an? /, '') : how}${toBack ? ' right to the back' : ''}`, mv + (pts === 5 ? '5' : ''));
    } else if (rng.chance(0.4 * counterScale(def, att))) {
      ST[def].counters++; ST[def].takedowns++; S.pos = 'top' + def; S.turns = 0;
      if (rng.chance(0.35)) exposure(def, att, 4, `turns ${nm(att)}'s ${how.replace(/^an? /, '')} around and puts him on his back`, 'counter4');
      else { award(def, 2); say('score', `${nm(att)} goes for ${how} but ${nm(def)} steps around and lands on top — two points. (${scoreLine()})`, 'td', def, 'counter'); }
    } else say('info', `${nm(att)} tries ${how}, but ${nm(def)} stays square.`, 'stuff', att, 'throw');
  }

  function neutralTick() {
    const dt = Math.min(rng.range(7, 12), S.remaining);
    S.remaining -= dt; S.elapsed += dt;
    const pAct = clamp(FS.act * FS_PACE[kg] * (planMult('A') + planMult('B')) / 2, 0.12, 0.85);
    if (!rng.chance(pAct)) {
      drain(dt, 0.35, 0.35);
      for (const s of ['A', 'B']) S.passive[s] += 1 / planMult(s) - 0.8;   // conservative / leading wrestlers drift passive
      // pressure: one man drives the other off the mat (step-out 1)
      const pd = pushOf('A') - pushOf('B');
      if (rng.chance(FS.push * (1 + Math.abs(pd) * 0.08))) {
        const s = rng.chance(sig(0.3 * pd)) ? 'A' : 'B';
        ST[s].stepOuts++; award(s, 1);
        say('score', `${nm(s)} drives ${nm(other(s))} out of bounds — step-out, one point. (${scoreLine()})`, 'so', s, 'push');
        tiredCheck(); return;
      }
      // passivity: the referee acts on the clearly more passive man (verbal warning first, then a 30 s activity period)
      if (!S.act && S.remaining > 30) {
        const p = S.passive.A - S.passive.B, s = p > 0 ? 'A' : 'B';
        const forced = S.score.A === 0 && S.score.B === 0 && ((S.periodNo === 1 && S.elapsed >= 120) || (S.periodNo === 2 && S.remaining <= 90));   // 0-0: the activity clock is forced (2:00 of the 1st; again with 1:30 left in the 2nd)
        if (forced || (Math.abs(p) > 1.5 && rng.chance(FS.passWarn * Math.min(3, Math.abs(p))))) {
          const who = Math.abs(p) > 0.3 ? s : (rng.chance(0.5) ? 'A' : 'B');
          S.passive[who] = 0;
          if (!S.warned[who] && !forced) { S.warned[who] = true; say('info', `The referee stops it: verbal warning to ${nm(who)} for passivity.`, 'warn', who, 'passive'); }
          else {
            S.warned[who] = true; S.act = { who, until: S.elapsed + 30 };
            say('info', `${forced ? `Still 0-0${S.periodNo === 1 ? ' at 2:00' : ''} — ` : ''}${nm(who)} is put on the activity clock: he must score in 30 seconds.`, 'act', who, 'passive');
          }
          tiredCheck(); return;
        }
      }
      // last 30 s of a period: the leader backing away is called for fleeing
      if (S.remaining < 30) {
        const lead = S.score.A > S.score.B ? 'A' : S.score.B > S.score.A ? 'B' : null;
        if (lead && plan[lead] === 'conservative' && rng.chance(0.08)) { caution(lead, 'fleeing the hold'); tiredCheck(); return; }
      }
      if (rng.chance(0.6)) {
        const hf = e('A', 'hand') - e('B', 'hand'), w = hf >= 0 ? 'A' : 'B', k = Math.round(S.elapsed) % 4;
        say('info', [`${nm(w)} controls the ties in the center.`, `${nm(w)} snaps ${nm(other(w))} down; he pops back up.`, `Hand fight in the middle — nobody commits.`, `${nm(w)} works for an underhook.`][k], 'hand', w, ['ties', 'snapdn', 'wrist', 'elbow'][k]);
      }
      tiredCheck(); return;
    }
    const hf = e('A', 'hand') - e('B', 'hand');
    const wt = s => planMult(s) * Math.pow(0.35 + e(s, 'tdo') / 20 * 0.45 + e(s, 'speed') / 20 * 0.25, FS.shotPow) * (1 + (s === 'A' ? hf : -hf) * 0.02);
    const wa = wt('A'), wb = wt('B');
    const att = rng.chance(wa / (wa + wb)) ? 'A' : 'B', def = other(att);
    S.passive[att] = Math.max(-2, S.passive[att] - 1);
    drain(dt, 0.9, 0.9);
    if (rng.chance(clamp(FS.big * (1 + (e(att, 'big') - 10) / 6), 0.01, 0.2))) { bigMove(att, def); tiredCheck(); return; }

    ST[att].shots++;
    const [how, mv] = shotName(att);
    const pTD = pTakedown(off(att), dfn(def));
    if (rng.chance(pTD)) { takedown(att, def, how, mv); tiredCheck(); return; }
    const pCounter = sig(0.12 * (ss(def) - ss(att)) - 2.0) * counterScale(def, att) * FS.cntr * ({ aggressive: 1.5, conservative: 0.6 }[plan[att]] ?? 1);
    const r = rng();
    if (r < pCounter && mv === 'highc' && rng.chance(FS.wrap)) {   // he locks a chest wrap (or lifts the crotch) and rolls the shooter through: exposure, no takedown
      ST[def].counters++; S.pos = 'neutral';
      const w = rng.chance(0.5);
      exposure(def, att, 2, w ? `chest wraps ${nm(att)} on the high-crotch and rolls him through to his back` : `lifts ${nm(att)}'s far leg on the high-crotch and rolls him through to his back`, w ? 'chestwrap' : 'crotchlift');
      if (!S.over) S.pos = 'neutral';
    } else if (r < pCounter) {
      ST[def].counters++; ST[def].takedowns++; S.pos = 'top' + def; S.turns = 0;
      const before = { lastTech: S.lastTech, kind: 'td' };
      award(def, 2);
      if (rng.chance(clamp(FS.fhl * (1 + (e(def, 'big') - 10) / 10), 0.03, 0.4))) {   // snapped into a front headlock and taken straight to his back
        say('score', `${nm(def)} sprawls on ${how}, snaps ${nm(att)} into a front headlock — takedown, two points. (${scoreLine()})`, 'td', def, 'fhl');
        const g = rng.chance(0.55);
        if (exposure(def, att, 2, g ? `rolls through with a gator roll, head and arm trapped` : `pinches the head, sits through and turns him to his back`, g ? 'gator' : 'pinch')) rollAgain(def, att, g ? 'gator' : 'pinch', ptAtt(def) - ptDef(att));
        tiredCheck(); return;
      }
      const v = Math.round(S.elapsed * 10) % 3;
      say('score', [`${nm(def)} sprawls on ${how}, spins behind — two points. (${scoreLine()})`, `${nm(def)} stuffs ${how} from ${nm(att)} and snaps him down to go behind. Two. (${scoreLine()})`,
        `${nm(att)} shoots ${how}; ${nm(def)} sprawls and shoots right back — takedown ${nm(def)}. (${scoreLine()})`][v], 'td', def, ['counter', 'counter', '~sprawl+double'][v]);
      if (!S.over) maybeChallenge(def, 2, before);
    } else if (r < pCounter + 0.04) {   // the shooter drives through, but they go out: step-out to whoever was driving
      ST[att].stepOuts++; award(att, 1);
      say('score', `${nm(att)} drives through on ${how} and runs ${nm(def)} out of bounds — step-out, one point. (${scoreLine()})`, 'so', att, 'oob');
    } else {
      const D = [[`${nm(def)} sprawls and stuffs ${how} from ${nm(att)}.`, 'sprawl'], [`${nm(att)} goes for ${how}; ${nm(def)} fights off the hands.`, 'handfight'],
        [`${nm(def)} hips out of ${how} from ${nm(att)} and circles away.`, 'hipout'], [`${nm(att)} gets in on ${how}, but ${nm(def)} whizzers and blocks it.`, 'whizzer']];
      const [t, smv] = pick(D);
      say('info', t, 'stuff', att, smv);
    }
    tiredCheck();
  }

  // ---------- par terre (only after a takedown; no riding: the top man turns or the referee stands them up) ----------
  function topTick() {
    const T = S.pos === 'topA' ? 'A' : 'B', Bt = other(T);
    const dt = Math.min(rng.range(4, 8), S.remaining);
    S.remaining -= dt; S.elapsed += dt;
    drain(dt, 0.6, 0.6);
    const edge = ptAtt(T) - ptDef(Bt);
    const pTurn = clamp(sig(Math.log(FS.turn / (1 - FS.turn)) + FS.turnK * edge) * Math.pow(FS.turnDecay, S.turns) * Math.sqrt(planMult(T)), 0.005, 0.85);
    const pRev = clamp(FS.rev * Math.exp(-0.12 * edge), 0.005, 0.15);
    const r = rng();
    if (r < pTurn) {
      S.turns++;
      const [how, mv] = turnName(T);
      if (exposure(T, Bt, 2, how, mv)) rollAgain(T, Bt, mv, edge);
    } else if (r < pTurn + pRev) {
      if (rng.chance(0.5)) { ST[Bt].reversals++; award(Bt, 1); S.pos = 'top' + Bt; S.turns = 0; say('score', `${nm(Bt)} comes out the back and reverses ${nm(T)} — one point. (${scoreLine()})`, 'rev', Bt, 'rev'); }
      else { S.pos = 'neutral'; exposure(Bt, T, 2, `catches ${nm(T)}'s turn and rolls him through`, 'rollthru'); if (!S.over) S.pos = 'neutral'; }
    } else if (rng.chance(FS.standUp)) {
      S.pos = 'neutral';
      say('info', `${nm(Bt)} flattens out and the referee stands them up.`, 'up', T, 'standup');
    } else if (rng.chance(0.5)) say('info', `${nm(T)} hunts for a gut wrench; ${nm(Bt)} stays flat.`, 'ride', T, 'flat');
    tiredCheck();
  }

  function activityCheck() {
    if (!S.act || S.elapsed < S.act.until || S.over) return;
    const p = S.act.who, o = other(p);
    S.act = null; ST[o].passPts++;
    award(o, 1, false);
    say('score', `${nm(p)} didn't score on the activity clock — one point to ${nm(o)}. (${scoreLine()})`, 'pass', o, 'passive');
  }

  // ---------- bout ----------
  const recover = () => { for (const s of ['A', 'B']) E[s] = Math.min(100, E[s] + 4 + W[s].attrs.cardio * 0.2); };
  say('period', `${W.A.name} (${W.A.team || W.A.school || 'unattached'}) vs ${W.B.name} (${W.B.team || W.B.school || 'unattached'}) at ${kg} kg. The referee blows the whistle.`);
  for (let p = 1; p <= 2 && !S.over; p++) {
    S.periodNo = p; S.periodLabel = FS_PERIODS[p - 1].label; S.remaining = FS_PERIODS[p - 1].len; S.pos = 'neutral';
    if (p === 2) { recover(); say('period', `Second period. ${scoreLine()}.`); }
    while (S.remaining > 0 && !S.over) {
      if (S.pos === 'neutral') neutralTick(); else topTick();
      activityCheck();
    }
    S.act = null;   // an activity period never runs on across the break
    if (!S.over && p === 1) { S.remaining = 0; say('period', `End of the first period. ${scoreLine()}.`, 'break'); }
  }
  let crit = null;
  if (!S.over) {
    S.remaining = 0;
    if (S.score.A !== S.score.B) S.winner = S.score.A > S.score.B ? 'A' : 'B';
    else {   // UWW criteria (rulebook Art. "victory by points"): 1 highest-value action/hold, 2 number of those, 3 fewer cautions, 4 last technical point;
      // only technical points count as holds (caution, passivity/activity and lost-challenge points do not); 4.1: with no technical point at all
      // (e.g. 1-1 from two passivity points) the first point scored decides
      const hi = s => Math.max(0, ...S.moves[s]), cnt = s => S.moves[s].filter(v => v === hi(s)).length;
      if (hi('A') !== hi('B')) { S.winner = hi('A') > hi('B') ? 'A' : 'B'; crit = `bigger move (${hi(S.winner)})`; }
      else if (cnt('A') !== cnt('B')) { S.winner = cnt('A') > cnt('B') ? 'A' : 'B'; crit = `more ${hi(S.winner)}-point moves`; }
      else if (S.caut.A !== S.caut.B) { S.winner = S.caut.A < S.caut.B ? 'A' : 'B'; crit = 'fewer cautions'; }
      else if (S.lastTech) { S.winner = S.lastTech; crit = 'last technical point'; }
      else if (S.firstPt) { S.winner = S.firstPt; crit = 'first point scored'; }
      else { S.winner = rng.chance(0.5) ? 'A' : 'B'; crit = 'referee decision'; }   // 0-0: practically unreachable (forced activity clocks in both periods)
    }
    S.method = 'Dec';
  }
  const w = S.winner, l = other(w), ws = S.score[w], ls = S.score[l];
  let method, detail, teamPoints;   // teamPoints = UWW classification points for the winner (5 fall / 4 tech / 3 points)
  if (S.method === 'Fall') { method = 'Fall'; detail = `Fall ${fmtClock(S.elapsed)}`; teamPoints = 5; }
  else if (S.method === 'DQ') { method = 'Disqualification'; detail = `3 cautions ${fmtClock(S.elapsed)}`; teamPoints = 5; }
  else if (S.method === 'TF') { method = 'Tech Fall'; detail = `VSU ${ws}-${ls} ${fmtClock(S.elapsed)}`; teamPoints = 4; }
  else { method = 'Decision'; detail = `Dec ${ws}-${ls}${crit ? ' (criteria)' : ''}`; teamPoints = 3; }
  say('end', `${W[w].name} wins ${method === 'Decision' ? `${ws}-${ls}${crit ? ` on criteria: ${crit}` : ''}` : `by ${method.toLowerCase()}${method === 'Fall' ? '' : ` ${ws}-${ls}`} at ${fmtClock(S.elapsed)}`}.`, 'end', w);
  const lpts = ls > 0 && method !== 'Fall' && method !== 'Disqualification' ? 1 : 0;
  return {
    style: 'fs', seed, kg, winner: w, loser: l, method, detail, teamPoints, cp: [teamPoints, lpts], crit, score: { ...S.score }, elapsed: S.elapsed,
    wrestlers: W, stats: { A: { ...ST.A, energy: E.A, cautions: S.caut.A }, B: { ...ST.B, energy: E.B, cautions: S.caut.B } }, log,
  };
}
