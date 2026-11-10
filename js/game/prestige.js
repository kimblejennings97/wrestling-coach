// Program prestige drift. Judged against EXPECTATION: a team's prestige ranking says where it "should" finish,
// and over/under-achieving at the NCAA tournament (70%) and in the regular season (30%) nudges prestige.
// Ranks are compared on a log scale (#1 vs #4 matters more than #40 vs #43). One season is capped at +-MAX_STEP,
// so it takes several strong (or poor) years in a row to move a program a full tier.
import { records } from './core.js';

export const PRESTIGE_MIN = 30, PRESTIGE_MAX = 99;
export const K = 4;            // prestige points per 1.0 of performance gap
export const MAX_STEP = 2.0;   // largest one-season move either way
export const W_NCAA = 0.7, W_SEASON = 0.3;

const lvl = (rank, n) => 1 - Math.log(rank) / Math.log(n + 1);   // 1 = best ... ~0 = last

// Programs near the top have little room to climb (and a long runway of banners), small/mid programs move a lot:
// tier multiplier ~0.5 at prestige 98, 1.0 at ~80, 1.5 at ~65, 2.0 at ~50, 2.8 at 30. Losses are never damped for top programs.
export const tierScale = p => 0.5 + 2.3 * Math.pow(Math.max(0, 99 - p) / 69, 1.2);

// Pure: ranks are 1-based. ncaaRank is null if the team scored no NCAA points (treated as finishing last).
export function prestigeDelta({ expRank, ncaaRank, powerRank, n, p = 70 }) {
  const nc = lvl(ncaaRank ?? n, n) - lvl(expRank, n);
  const se = lvl(powerRank, n) - lvl(expRank, n);
  let d = K * (W_NCAA * nc + W_SEASON * se);
  // banners hang forever: a top-finish never costs prestige, and the very top gets a small bonus
  if (ncaaRank === 1) d = Math.max(d, 0.75);
  else if (ncaaRank != null && ncaaRank <= 3) d = Math.max(d, 0.4);
  else if (ncaaRank != null && ncaaRank <= 5) d = Math.max(d, 0.2);
  const sc = tierScale(p), up = sc, down = Math.max(1, sc);
  d = d >= 0 ? d * up : d * down;
  const capUp = Math.min(4.5, MAX_STEP * up), capDown = Math.min(4.5, MAX_STEP * down);
  return Math.max(-capDown, Math.min(capUp, d));
}

export function prestigeChanges(G) {
  const ids = Object.keys(G.teams), n = ids.length;
  const exp = {}; [...ids].sort((a, b) => G.teams[b].prestige - G.teams[a].prestige).forEach((id, i) => { exp[id] = i + 1; });
  // in-season success = dual record (win%, then point margin), not lineup strength (lineups change at graduation)
  const power = {}; Object.values(records(G)).map(r => ({ id: r.id, wp: r.w + r.l ? r.w / (r.w + r.l) : 0.5, m: (r.pf - r.pa) / Math.max(1, r.w + r.l) }))
    .sort((a, b) => b.wp - a.wp || b.m - a.m).forEach((r, i) => { power[r.id] = i + 1; });
  const ncaa = G.tournaments.find(t => t.kind === 'ncaa' && t.done && t.result);
  const finish = {}; if (ncaa) ncaa.result.teamScores.forEach((t, i) => { finish[t.team] = i + 1; });
  const out = {};
  for (const id of ids) {
    // no NCAA data (e.g. an old save) -> season component only
    const ncaaRank = ncaa ? (finish[id] ?? null) : null;
    out[id] = ncaa
      ? prestigeDelta({ expRank: exp[id], ncaaRank, powerRank: power[id], n, p: G.teams[id].prestige })
      : Math.max(-MAX_STEP, Math.min(MAX_STEP, K * (lvl(power[id], n) - lvl(exp[id], n))));
  }
  return out;
}

export function applyPrestige(G) {
  const ch = prestigeChanges(G);
  for (const id in ch) {
    const t = G.teams[id], before = t.prestige;
    t.prestige = Math.round(Math.max(PRESTIGE_MIN, Math.min(PRESTIGE_MAX, before + ch[id])) * 10) / 10;
    if (id === G.userTeam) {
      const d = Math.round((t.prestige - before) * 10) / 10;
      G.inbox.unshift({ week: G.week, title: `Program prestige ${d > 0 ? 'up' : d < 0 ? 'down' : 'steady'}: ${t.prestige.toFixed(1)}`, body: d === 0 ? 'Results matched expectations.' : `${d > 0 ? '+' : ''}${d} from this season's results against expectations.` });
    }
  }
  return ch;
}
