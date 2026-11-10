// NCAA selection show: the field and its seeds are computed up front (tourney.js computeNcaaField); this only tracks how much has been REVEALED.
//   G.ncaa.rv = { cnt: { weight: names revealed (in seed order, 1 -> N) }, last: [weight, index] | null, done }
import { WEIGHTS } from '../data/gen.js';
import { completeSelection } from './tourney.js';

export const selActive = G => !!(G.ncaa && G.ncaa.rv && !G.ncaa.rv.done && G.phase === 'season');   // a show is waiting to be watched
export const hasShow = G => !!(G.ncaa && G.ncaa.rv && G.ncaa.show);
export const curWeight = G => WEIGHTS.find(wt => G.ncaa.rv.cnt[wt] < G.ncaa.field[wt].length) || null;
export const revealedCount = G => WEIGHTS.reduce((s, wt) => s + G.ncaa.rv.cnt[wt], 0);
export const totalCount = G => WEIGHTS.reduce((s, wt) => s + G.ncaa.field[wt].length, 0);

// mode: 'next' (one name), 'weight' (finish the current weight), 'all' (everything)
export function advanceSel(G, mode) {
  const rv = G.ncaa.rv, f = G.ncaa.field;
  const take = wt => { if (rv.cnt[wt] >= f[wt].length) return false; rv.last = [wt, rv.cnt[wt]]; rv.cnt[wt]++; return true; };
  if (mode === 'next') { const wt = curWeight(G); if (wt) take(wt); }
  else if (mode === 'weight') { const wt = curWeight(G); if (wt) while (take(wt)); }
  else if (mode === 'all') { for (const wt of WEIGHTS) while (take(wt)); rv.last = null; }
  if (!curWeight(G)) completeSelection(G);
}

// where did a wrestler of the user's team land? (only for weights that are fully revealed)
export function myOutcomes(G) {
  const n = G.ncaa, out = [];
  for (const wt of WEIGHTS) {
    if (n.rv.cnt[wt] < n.field[wt].length) continue;
    const f = n.field[wt], sh = n.show[wt];
    for (const e of f) if (e.team === G.userTeam) out.push({ wt, id: e.id, status: 'in', seed: f.indexOf(e) + 1, via: e.via });
    sh.out.forEach((e, i) => { if (e.team === G.userTeam) out.push({ wt, id: e.id, status: 'out', pos: i + 1, ss: e.ss }); });
  }
  return out;
}
