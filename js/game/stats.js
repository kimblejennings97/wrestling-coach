// Wrestler stats, ratings and weight-class polls.
//  - w.st   : this season's counters (array, see KEYS). w.hist: [[season, ...counters], ...] for past seasons. Career = hist + st.
//  - w.elo  : rating that starts from OVR and moves with results; drives the weight-class top-25 polls.
//  - G.rkCur / G.rkPrev : weekly poll snapshots {weight: [ids]} (movement = previous rank - current rank).
// Nothing here feeds back into the bout engine, so match results stay deterministic.
import { WEIGHTS } from '../data/gen.js';
import { overall } from './core.js';

export const KEYS = ['w', 'l', 'fall', 'tf', 'md', 'dec', 'td', 'esc', 'rev', 'nf', 'pf', 'pa', 'aa', 'ch'];
export const IDX = Object.fromEntries(KEYS.map((k, i) => [k, i]));
export const POLL_SIZE = 25, K_ELO = 20, ELO_PER_OVR = 105;   // engine: ~118 Elo per OVR point after the 2026-11-09 neutral-position/elite-defense changes (was 80)
export const MIN_WINS = 3;        // a wrestler with no results from a previous season (freshman, walk-on) is only ranked after this many wins
export const ELO_KEEP = 0.75;     // share of last season's results rating (distance from 1500) carried into the next preseason
const METHOD_IDX = { 'Fall': 2, 'Tech Fall': 3, 'Major Decision': 4 };
const METHOD_MULT = { 'Fall': 1.25, 'Tech Fall': 1.2, 'Major Decision': 1.1 };

export const eloInit = w => 1500 + (overall(w) - 12) * ELO_PER_OVR;
export const eloOf = w => (w.elo ??= eloInit(w));
const stOf = w => (w.st ??= KEYS.map(() => 0));
const add = (a, b) => a.map((v, i) => v + (b[i] || 0));

// Results are QUEUED when a match is simulated and only applied (flushStats) once the event is over, so the Stats and Rankings
// screens keep showing the pre-event numbers while the user is still watching a dual or tournament.
export function recordBout(G, ida, idb, wt, r) {
  const q = r.stats;
  (G.sq ||= []).push([ida, idb, wt, r.winner, r.method, r.score.A, r.score.B, q.A.takedowns, q.A.escapes, q.A.reversals, q.A.nearFalls, q.B.takedowns, q.B.escapes, q.B.reversals, q.B.nearFalls]);
}
export function recordPlacement(G, id, place) { (G.sq ||= []).push(['p', id, place]); }
export const pendingStats = G => (G.sq ? G.sq.length : 0);

function applyBout(G, [ida, idb, wt, winner, method, scA, scB, tdA, escA, revA, nfA, tdB, escB, revB, nfB]) {
  const W = { A: G.wrestlers[ida], B: G.wrestlers[idb] };
  if (!W.A || !W.B) return;
  const ea = 1 / (1 + 10 ** ((eloOf(W.B) - eloOf(W.A)) / 400)), mult = METHOD_MULT[method] || 1;
  const side = { A: { sc: scA, op: scB, td: tdA, esc: escA, rev: revA, nf: nfA }, B: { sc: scB, op: scA, td: tdB, esc: escB, rev: revB, nf: nfB } };
  for (const s of ['A', 'B']) {
    const w = W[s], st = stOf(w), won = winner === s, x = side[s];
    st[won ? 0 : 1]++;
    if (won) st[METHOD_IDX[method] ?? 5]++;
    st[6] += x.td; st[7] += x.esc; st[8] += x.rev; st[9] += x.nf; st[10] += x.sc; st[11] += x.op;
    w.lw = wt; w.lwk = G.week;   // last weight + week he wrestled (poll inactivity rule)
    const exp = s === 'A' ? ea : 1 - ea;
    w.elo = Math.round((eloOf(w) + K_ELO * (won ? mult : 1) * ((won ? 1 : 0) - exp)) * 10) / 10;
  }
}
function applyPlacement(G, id, place) {
  const w = G.wrestlers[id]; if (!w) return;
  const st = stOf(w);
  if (place <= 8) st[12]++;
  if (place === 1) st[13]++;
}
export function flushStats(G) {
  const q = G.sq; if (!q || !q.length) return 0;
  G.sq = [];
  for (const e of q) { if (e[0] === 'p') applyPlacement(G, e[1], e[2]); else if (e[0] === 'd') applyDual(G, e[1], e[2], e[3], e[4]); else applyBout(G, e); }
  return q.length;
}

export const seasonOf = w => w.st || KEYS.map(() => 0);
export const careerOf = w => (w.hist || []).reduce((a, h) => add(a, h.slice(1)), seasonOf(w));
export const bouts = st => st[0] + st[1];
export const derived = st => {
  const n = bouts(st);
  return { n, pct: n ? st[0] / n : 0, bonus: st[0] ? (st[2] + st[3] + st[4]) / st[0] : 0, tdb: n ? st[6] / n : 0, margin: n ? (st[10] - st[11]) / n : 0 };
};

// season rollover (call before G.season++): archive counters, regress ratings toward the grown wrestler's OVR
export function rollSeasonStats(G) {
  flushStats(G);
  for (const id in G.wrestlers) {
    const w = G.wrestlers[id];
    if (w.st && bouts(w.st) + w.st[12] > 0) (w.hist ??= []).push([G.season, ...w.st]);
    w.prior = !!(w.st && w.st[0] >= MIN_WINS);   // has results from a finished season: ranked in the next preseason poll
    w.st = null; w.lwk = null;
    w.elo = Math.round((1500 + ELO_KEEP * (eloOf(w) - 1500)) * 10) / 10;   // preseason rating comes from last year's RESULTS (no pull toward the new OVR)
  }
}

// ---------- weight-class polls ----------
// each wrestler is assigned to ONE weight: the last one he wrestled this season, else his current lineup spot
function pollMembers(G) {
  const by = {}; for (const wt of WEIGHTS) by[wt] = [];
  const done = new Set();
  // Rankings follow RESULTS: a wrestler is eligible if he has results from a previous season (w.prior !== false; initial rosters count) or has won MIN_WINS
  // matches this season. Newcomers (freshmen, walk-ons) flow in once they have some wins. Rated by Elo, which moves only with results.
  const ok = w => w.prior !== false || (w.st && w.st[0] >= MIN_WINS);
  for (const id in G.wrestlers) { const w = G.wrestlers[id]; if (w.st && bouts(w.st) > 0 && by[w.lw] && ok(w)) { by[w.lw].push(w); done.add(id); } }
  for (const tid in G.teams) for (const wt of WEIGHTS) { const s = G.teams[tid].lineup[wt]; if (s && G.wrestlers[s] && !done.has(s) && !(G.wrestlers[s].st && bouts(G.wrestlers[s].st) > 0) && G.wrestlers[s].prior !== false) { by[wt].push(G.wrestlers[s]); done.add(s); } }
  return by;
}
// Poll eligibility: a wrestler who has wrestled this season drops out of the poll if he has not wrestled for POLL_IDLE_WEEKS,
// or is hurt with POLL_INJ_WEEKS+ weeks still to go. (Preseason / lineup-only entries have no bouts yet and are not idle-checked.)
export const POLL_IDLE_WEEKS = 3, POLL_INJ_WEEKS = 3;
function pollEligible(G, w) {
  if (w.injury && w.injury.weeks >= POLL_INJ_WEEKS) return false;
  if (w.st && bouts(w.st) > 0 && w.lwk != null && G.week - w.lwk >= POLL_IDLE_WEEKS) return false;
  return true;
}
// A school gets ONE ranked wrestler per weight: its best eligible one (Elo, then OVR). If he drops out, the next man up is considered.
export function snapshotPolls(G) {
  const by = pollMembers(G), cur = {};
  for (const wt of WEIGHTS) {
    const seen = new Set(), out = [];
    for (const w of by[wt].filter(w => pollEligible(G, w)).sort((a, b) => eloOf(b) - eloOf(a) || overall(b) - overall(a))) {
      if (seen.has(w.team)) continue;
      seen.add(w.team); out.push(w.id);
      if (out.length >= POLL_SIZE) break;
    }
    cur[wt] = out;
  }
  return cur;
}
// call once a week after results are in (and at season start)
export function updatePolls(G) {
  G.rkPrev = G.rkCur || null;
  G.rkCur = snapshotPolls(G);
  if (G.dualSeason !== G.season) initDualRatings(G);   // preseason: dual ratings start from the lineups' poll ranks
  G.tkPrev = G.tkCur || null; G.tkCur = snapshotTeamRanks(G);
}

// ---------- team rankings ----------
// TOURNAMENT rankings: a prediction of NCAA team points from each team's starting lineup and the weight-class poll rank of every starter.
// RANK_PTS = average NCAA points (placement + advancement + bonus) won by a qualifier who entered the NCAAs ranked #1..#25 in his weight poll
// (calibrated on 8 simulated seasons, 2,600 entries; see CLAUDE.md); an unranked starter is worth a little (he may qualify), an injured one nothing.
export const RANK_PTS = [19.4, 15.4, 14.4, 11.8, 9.6, 8.5, 6.8, 6.2, 5.2, 4.6, 3.7, 3.2, 2.7, 2.3, 2.1, 1.9, 1.8, 1.6, 1.4, 1.1, 1.0, 0.9, 0.85, 0.8, 0.75];   // blend of the 8-season fit before tournament form and the 6-season fit after it
export const UNRANKED_PTS = 0.4;
export const pollRank = (G, w) => (ensurePolls(G)[w.lw || w.natural] || []).indexOf(w.id) + 1;
export function lineupProjection(G, tid) {
  const t = G.teams[tid], out = { pts: 0, ranks: {}, ranked: 0, top8: 0 };
  for (const wt of WEIGHTS) {
    const w = t.lineup[wt] && G.wrestlers[t.lineup[wt]]; if (!w) { out.ranks[wt] = null; continue; }
    const r = pollRank(G, w); out.ranks[wt] = r || 0;
    if (w.injury && w.injury.weeks >= POLL_INJ_WEEKS) continue;
    out.pts += r ? RANK_PTS[r - 1] : UNRANKED_PTS; if (r) out.ranked++; if (r && r <= 8) out.top8++;
  }
  return out;
}
// DUAL rankings: a team rating that starts each season from the lineup projection above (z-scored onto an Elo scale) and then moves ONLY with dual results
// (opponent-adjusted, margin-aware; tournament duals count). Updates are queued like wrestler stats so the screens stay frozen while a dual is being watched.
export function initDualRatings(G) {
  const ids = Object.keys(G.teams), sc = ids.map(id => lineupProjection(G, id).pts), mean = sc.reduce((a, b) => a + b, 0) / sc.length, sd = Math.sqrt(sc.reduce((a, b) => a + (b - mean) ** 2, 0) / sc.length) || 1;
  ids.forEach((id, i) => { G.teams[id].drate = Math.round((1500 + 150 * (sc[i] - mean) / sd) * 10) / 10; });
  G.dualSeason = G.season;
}
export function ensureDualRatings(G) {
  if (G.dualSeason === G.season && Object.values(G.teams).every(t => t.drate != null)) return;
  initDualRatings(G);
  const done = G.schedule.concat(...(G.tournaments || []).map(t => t.duals || [])).filter(d => d.done && d.result).sort((a, b) => a.week - b.week);   // old saves: replay this season's duals
  for (const d of done) applyDual(G, d.a, d.b, d.result.sa, d.result.sb);
}
export function recordDual(G, d) { (G.sq ||= []).push(['d', d.a, d.b, d.result.sa, d.result.sb]); }
function applyDual(G, a, b, sa, sb) {
  const A = G.teams[a], B = G.teams[b]; if (!A || !B) return;
  A.drate ??= 1500; B.drate ??= 1500;
  const ea = 1 / (1 + 10 ** ((B.drate - A.drate) / 400)), s = 1 / (1 + Math.exp(-0.12 * (sa - sb))), dlt = 36 * (s - ea);   // margin-aware result: 10 points ~ .77, 25 ~ .95
  A.drate = Math.round((A.drate + dlt) * 10) / 10; B.drate = Math.round((B.drate - dlt) * 10) / 10;
}

// team-ranking snapshots for the movement arrows: { dual: [ids best first], tourn: [ids] }
export function snapshotTeamRanks(G) {
  const ids = Object.keys(G.teams);
  return { dual: ids.slice().sort((a, b) => G.teams[b].drate - G.teams[a].drate).slice(0, 40), tourn: ids.map(id => [id, lineupProjection(G, id).pts]).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 40) };
}
export function ensurePolls(G) { if (!G.rkCur) { G.rkCur = snapshotPolls(G); G.rkPrev = null; } return G.rkCur; }
