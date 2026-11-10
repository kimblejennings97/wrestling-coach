// In-dual coaching: lineup changes between bouts of a dual meet (the dual is simulated bout by bout, see core.js beginDual/stepDual).
//   * CLINCHED: once the dual is (almost) won, the coach rests the starter at the next weight and lets a healthy backup wrestle.
//   * TRAILING: when behind and the dual is in doubt, the coach re-optimises the remaining weights against the opponent's known lineup, including
//     bumping a better wrestler up a class (natural weight or one above; the usual bump penalty applies) and moving his old slot to a backup.
// A wrestler can wrestle only once per dual. Both teams' lineups for the remaining weights are public (as at a real dual).
import { overall, wrestlerAt, canWrestle, FATIGUE } from './core.js';
import { ELO_PER_OVR } from './stats.js';

export const COACH = { rest: true, trail: true, restP: 0.985, restFrom: 5, maxRest: 3, trailP: 0.45, minBouts: 2, gain: 0.006 };   // a coach rests at most `maxRest` starters, and only from bout `restFrom` on
const T = 3.7;   // average team points of a decided bout (decision 3, major 4, tech 5, fall 6)

const erf = x => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)); };
const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));

// rating he would bring to this weight right now (bump penalty, injury and fatigue included)
function ovrAt(G, memo, id, wt) {
  const k = id + '@' + wt; let v = memo.get(k);
  if (v === undefined) { v = overall(wrestlerAt(G, id, wt)) - (G.wrestlers[id].fatigue || 0) * FATIGUE.lineupK; memo.set(k, v); }
  return v;
}
// P(this side wins the dual) from the current score and the lineups still to wrestle (normal approximation of the remaining team-point margin)
export function winProb(G, memo, d, side, mine, opp) {
  const P = d.prog;
  let mu = side === 'A' ? P.sa - P.sb : P.sb - P.sa, v = 0.25;
  for (const wt of d.order.slice(P.k)) {
    const a = mine[wt], b = opp[wt];
    if (a && b) { const p = 1 / (1 + 10 ** (-(ELO_PER_OVR / 400) * (ovrAt(G, memo, a, wt) - ovrAt(G, memo, b, wt)))), m = (2 * p - 1) * T; mu += m; v += T * T + 1.2 - m * m; }
    else if (a) mu += 6; else if (b) mu -= 6;
  }
  return Phi(mu / Math.sqrt(v));
}

const note = (P, tid, wt, out, inn, why) => P.subs.push({ k: P.k, tid, wt, out: out || null, in: inn || null, why });

// Called before each bout for a team the coach controls. Returns the number of changes made.
export function coachMoves(G, d, side) {
  const P = d.prog, tid = side === 'A' ? d.a : d.b, other = side === 'A' ? 'B' : 'A';
  const line = P['line' + side], opp = P['line' + other], used = P['used' + side], rem = d.order.slice(P.k);
  if (!rem.length) return 0;
  const memo = new Map(), p0 = winProb(G, memo, d, side, line, opp);
  const pool = () => G.teams[tid].roster.map(id => G.wrestlers[id]).filter(w => !w.injury && !used.includes(w.id) && !rem.some(x => line[x] === w.id));   // healthy, unused, not slotted
  let changed = 0;
  // 1) clinched: rest the starter at the upcoming weight
  if (COACH.rest && P.k >= COACH.restFrom && p0 >= COACH.restP && P.subs.filter(x => x.why === 'rest' && x.tid === tid).length < COACH.maxRest) {
    const wt = rem[0], cur = line[wt];
    if (cur) {
      const back = pool().filter(w => canWrestle(w, wt)).sort((a, b) => (b.natural === wt) - (a.natural === wt) || ovrAt(G, memo, b.id, wt) - ovrAt(G, memo, a.id, wt))[0];
      if (back) { line[wt] = back.id; if (winProb(G, memo, d, side, line, opp) >= 0.95) { note(P, tid, wt, cur, back.id, 'rest'); return 1; } line[wt] = cur; }
    }
    return 0;
  }
  // 2) behind and in doubt: re-optimise the remaining weights against the opponent's lineup (local search on win probability)
  if (COACH.trail && P.k >= COACH.minBouts && rem.length >= 2 && p0 < COACH.trailP && (side === 'A' ? P.sa < P.sb : P.sb < P.sa)) {
    const before = Object.fromEntries(rem.map(x => [x, line[x] || null]));
    let cur = p0;
    for (let pass = 0; pass < 4; pass++) {
      let best = null;
      for (const wt of rem) {
        const old = line[wt];
        const cands = G.teams[tid].roster.map(id => G.wrestlers[id]).filter(w => !w.injury && !used.includes(w.id) && canWrestle(w, wt) && w.id !== old);
        for (const w of cands) {
          const at = rem.find(x => x !== wt && line[x] === w.id);   // already slotted at another remaining weight: swap with him
          if (at && !(old && canWrestle(G.wrestlers[old], at))) continue;
          const saveOld = line[wt], saveAt = at ? line[at] : null;
          line[wt] = w.id; if (at) line[at] = old;
          const p = winProb(G, memo, d, side, line, opp);
          line[wt] = saveOld; if (at) line[at] = saveAt;
          if (p > cur + COACH.gain && (!best || p > best.p)) best = { wt, id: w.id, at, old, p };
        }
      }
      if (!best) break;
      line[best.wt] = best.id; if (best.at) line[best.at] = best.old; cur = best.p;
    }
    for (const wt of rem) if ((line[wt] || null) !== before[wt]) { note(P, tid, wt, before[wt], line[wt], 'matchup'); changed++; }
  }
  return changed;
}
