// Live (round-by-round) tournament viewing. The whole event is simulated up front by runEvent(G, spec, { keep: true }), which records every
// match with its dependency round (`l`). These helpers only decide how much of that record the user has REVEALED so far.
//   t.rv = { cnt: { weight: matches revealed }, feed: [[weight, matchIndex], ...], done }
// Rule: round N can't be revealed anywhere until round N-1 is finished at EVERY weight (so `wround` only works for weights still in the current round).
import { WEIGHTS } from '../data/gen.js';

const PLACE_PTS = { 1: 16, 2: 12, 3: 10, 4: 9, 5: 7, 6: 6, 7: 4, 8: 3 };
const BONUS_PTS = { 'Fall': 2, 'Tech Fall': 1.5, 'Major Decision': 1 };
const cache = new WeakMap();

export const hasBracket = t => !!(t.result && t.result.weights[WEIGHTS[0]].matches);
export function initLive(t) { t.rv = { cnt: Object.fromEntries(WEIGHTS.map(wt => [wt, 0])), feed: [], done: false }; }
export const isLive = t => !!(t.rv && !t.rv.done);

// matches of one weight in reveal order: by round, then bracket order
export function orderOf(t, wt) {
  const m = t.result.weights[wt].matches; let o = cache.get(m);
  if (!o) { o = m.slice().sort((a, b) => a.l - b.l || a.i - b.i); cache.set(m, o); }
  return o;
}
export const totalOf = t => WEIGHTS.reduce((s, wt) => s + t.result.weights[wt].matches.length, 0);
export const revealedTotal = t => WEIGHTS.reduce((s, wt) => s + t.rv.cnt[wt], 0);
export const nextMatch = (t, wt) => orderOf(t, wt)[t.rv.cnt[wt]] || null;
export function currentRound(t) {            // the lowest round that still has unrevealed matches at any weight
  let min = Infinity;
  for (const wt of WEIGHTS) { const n = nextMatch(t, wt); if (n && n.l < min) min = n.l; }
  return min === Infinity ? null : min;
}
export const maxRound = t => Math.max(...WEIGHTS.map(wt => { const o = orderOf(t, wt); return o.length ? o[o.length - 1].l : 0; }));
export const canRoundAt = (t, wt) => { const n = nextMatch(t, wt), c = currentRound(t); return !!n && n.l === c; };   // may this weight's round be finished now?
export function revealedSet(t, wt) {
  const o = orderOf(t, wt), s = new Set();
  for (let k = 0; k < t.rv.cnt[wt]; k++) s.add(o[k].i);
  return s;
}

// mode: 'match' (next match), 'wround' (rest of the current round at one weight), 'round' (rest of the current round, all weights), 'all' (everything)
export function advanceLive(t, mode, wt) {
  const out = [];
  const take = w => { const m = nextMatch(t, w); if (!m) return false; t.rv.cnt[w]++; t.rv.feed.push([w, m.i]); out.push({ wt: w, m }); return true; };
  if (mode === 'all') { for (const w of WEIGHTS) while (take(w)); }
  else if (mode === 'match') {
    const L = currentRound(t);
    if (L != null) for (const w of WEIGHTS) { const n = nextMatch(t, w); if (n && n.l === L) { take(w); break; } }
  } else if (mode === 'wround') {
    const L = currentRound(t);
    if (L != null && canRoundAt(t, wt)) while (nextMatch(t, wt) && nextMatch(t, wt).l === L) take(wt);
  } else if (mode === 'round') {
    const L = currentRound(t);
    if (L != null) for (const w of WEIGHTS) while (nextMatch(t, w) && nextMatch(t, w).l === L) take(w);
  }
  if (t.rv.feed.length > 60) t.rv.feed = t.rv.feed.slice(-60);
  if (revealedTotal(t) >= totalOf(t)) t.rv.done = true;
  return out;
}

// Team scores from what has been revealed: match points (+bonus) for each revealed match, placement points once a placer's last match is revealed.
export function liveScores(G, t) {
  const pts = {}, add = (tid, p) => { pts[tid] = (pts[tid] || 0) + p; };
  for (const wt of WEIGHTS) {
    const W = t.result.weights[wt], o = orderOf(t, wt), n = t.rv.cnt[wt], last = {};
    o.forEach((m, k) => { last[m.a] = k; last[m.b] = k; });
    for (let k = 0; k < n; k++) { const m = o[k]; add(G.wrestlers[m.w === 'A' ? m.a : m.b].team, (m.c ? 1 : 0.5) + (BONUS_PTS[m.m] || 0)); }
    for (const e of W.top) if (last[e.id] != null && last[e.id] < n) add(e.team, PLACE_PTS[e.place]);
  }
  return Object.entries(pts).map(([team, p]) => ({ team, pts: p })).sort((a, b) => b.pts - a.pts);
}

// The user's wrestlers: record so far, next match (only once his previous match is revealed, so nothing leaks), and place when known.
export function myStatus(G, t) {
  const out = [];
  for (const wt of WEIGHTS) {
    const W = t.result.weights[wt], rev = revealedSet(t, wt), o = orderOf(t, wt);
    for (const e of W.ent.filter(x => x.team === G.userTeam)) {
      let w = 0, l = 0;
      for (const m of W.matches) if (rev.has(m.i) && (m.a === e.id || m.b === e.id)) ((m.w === 'A' ? m.a : m.b) === e.id ? w++ : l++);
      const next = o.find(m => !rev.has(m.i) && (m.a === e.id || m.b === e.id) && (m.a === e.id ? m.pa : m.pb) === -1 || (!rev.has(m.i) && (m.a === e.id || m.b === e.id) && rev.has(m.a === e.id ? m.pa : m.pb))) || null;
      const placed = W.top.find(x => x.id === e.id);
      out.push({ wt, id: e.id, seed: e.seed, w, l, next, place: next ? null : placed ? placed.place : 0 });
    }
  }
  return out;
}

// The match "Next match" would reveal, without revealing it ({wt, m} or null).
export function peekNext(t) {
  const L = currentRound(t); if (L == null) return null;
  for (const w of WEIGHTS) { const n = nextMatch(t, w); if (n && n.l === L) return { wt: w, m: n }; }
  return null;
}
export const userMatchesAhead = t => WEIGHTS.some(wt => orderOf(t, wt).slice(t.rv.cnt[wt]).some(m => m.u >= 0));
// Reveal everything before the user's next match and return that match (still unrevealed), or null if he has none left.
export function advanceToUser(t) {
  for (let guard = 0; guard < 5000; guard++) {
    const p = peekNext(t); if (!p) return null;
    if (p.m.u >= 0) return p;
    advanceLive(t, 'match');
  }
  return null;
}
