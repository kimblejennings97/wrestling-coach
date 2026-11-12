// Record books, Halls of Fame and the archive of notable departed wrestlers (added 2026-11-12).
//  G.lg = {
//    done:  last season whose single-season records are closed (written at beginOffseason, before seniors graduate),
//    rs/rc: NATIONAL single-season / career record lists  { key: [entry] }, best first, REC_N deep,
//    ts/tc: the same for the USER's school (TEAM_N deep),
//    hof:   national Hall of Fame [member], shof: { teamId: [member] } school Halls of Fame,
//    arch:  { id: compact profile } for departed wrestlers worth keeping (record holders, Hall of Famers, NCAA champions, your alumni),
//  }
// entry = [id, name, team, season (career: last season), value, weight]. Lists only hold CLOSED seasons / FINISHED careers; the screens merge
// in the live numbers of current wrestlers (liveRecords). Nothing here touches the simulation or the rng.
import { careerOf, bouts } from './stats.js';   // stats.js imports this module too: use its exports only inside functions (never at load time)

export const REC_N = 25, TEAM_N = 10;
const I = { w: 0, l: 1, fall: 2, tf: 3, md: 4, dec: 5, td: 6, esc: 7, rev: 8, nf: 9, pf: 10, pa: 11, aa: 12, ch: 13 };   // = stats.js KEYS order
// record categories: v(stats array) -> value; min = matches needed (rate stats); scope: which books it appears in
export const REC_CATS = [
  { k: 'w', h: 'Wins', v: s => s[I.w] },
  { k: 'pct', h: 'Win %', v: s => (bouts(s) ? s[I.w] / bouts(s) : 0), min: { season: 20, career: 60 }, fmt: v => (v * 100).toFixed(1) + '%' },
  { k: 'fall', h: 'Pins', v: s => s[I.fall] },
  { k: 'tf', h: 'Tech falls', v: s => s[I.tf] },
  { k: 'md', h: 'Major decisions', v: s => s[I.md] },
  { k: 'bonus', h: 'Bonus-point wins', v: s => s[I.fall] + s[I.tf] + s[I.md] },
  { k: 'td', h: 'Takedowns', v: s => s[I.td] },
  { k: 'nf', h: 'Near falls', v: s => s[I.nf] },
  { k: 'aa', h: 'All-American finishes', v: s => s[I.aa], only: 'career' },
  { k: 'ch', h: 'NCAA titles', v: s => s[I.ch], only: 'career' },
];
export const catsFor = scope => REC_CATS.filter(c => !c.only || c.only === scope);

export function ensureLegacy(G) {
  const L = (G.lg ||= {});
  for (const k of ['rs', 'rc', 'ts', 'tc', 'arch', 'shof']) L[k] ||= {};
  L.hof ||= [];
  return L;
}
const qualifies = (c, s, scope) => !c.min || bouts(s) >= c.min[scope];
function push(list, e, n) {   // keep the n best, best first; ties keep the earlier holder first
  const i = list.findIndex(x => x[0] === e[0] && x[3] === e[3]); if (i >= 0) list.splice(i, 1);
  let j = list.findIndex(x => x[4] < e[4]); if (j < 0) j = list.length;
  list.splice(j, 0, e); if (list.length > n) list.length = n;
}
function offer(G, scope, w, s, season) {
  const L = ensureLegacy(G), nat = scope === 'season' ? L.rs : L.rc, mine = scope === 'season' ? L.ts : L.tc;
  for (const c of catsFor(scope)) {
    if (!qualifies(c, s, scope)) continue;
    const v = Math.round(c.v(s) * 10000) / 10000; if (!(v > 0)) continue;
    const e = [w.id, w.name, w.team, season, v, w.lw || w.natural];
    push(nat[c.k] ||= [], e, REC_N);
    if (w.team === G.userTeam) push(mine[c.k] ||= [], e, TEAM_N);
  }
}

// Close the single-season books for the season just finished (idempotent). Call after the last flushStats of the season.
export function closeSeasonRecords(G) {
  const L = ensureLegacy(G); if (L.done === G.season) return;
  L.done = G.season;
  for (const id in G.wrestlers) { const w = G.wrestlers[id]; if (w.st && bouts(w.st) > 0) offer(G, 'season', w, w.st, G.season); }
}

// ---------- Halls of Fame ----------
// National: 2+ NCAA titles, a title plus 3+ All-American finishes, or 4 All-American finishes with a finals appearance.
// School: an NCAA title, 3+ All-American finishes, or 2 with 80+ wins at 85%+. Every national inductee is also in his school's Hall.
const ncaaPlaces = w => Object.entries(w.tr || {}).filter(([, x]) => x && x.n).map(([s, x]) => [+s, x.n]).sort((a, b) => a[0] - b[0]);
export function hofLevel(w, car = careerOf(w)) {
  const ch = car[I.ch], aa = car[I.aa], fin = ncaaPlaces(w).some(([, p]) => p <= 2), n = bouts(car), pct = n ? car[I.w] / n : 0;
  if (ch >= 2 || (ch >= 1 && aa >= 3) || (aa >= 4 && fin)) return 2;
  if (ch >= 1 || aa >= 3 || (aa >= 2 && car[I.w] >= 80 && pct >= 0.85)) return 1;
  return 0;
}
const why = (w, car) => {
  const ch = car[I.ch], aa = car[I.aa], t = ncaaPlaces(w).filter(([, p]) => p === 1).map(([s]) => s);
  return `${ch ? `${ch}× NCAA champion${t.length ? ` (${t.join(', ')})` : ''}` : ''}${ch && aa > ch ? ', ' : ''}${aa > ch || !ch ? `${aa}× All-American` : ''}`;
};
function member(G, w, car, season) {
  const yrs = (w.hist || []).map(h => h[0]).concat(w.st && bouts(w.st) ? [season] : []);
  return { id: w.id, name: w.name, team: w.team, wt: w.natural, from: yrs.length ? Math.min(...yrs) : season, to: season, ind: season + 1,
    w: car[I.w], l: car[I.l], fall: car[I.fall], aa: car[I.aa], ch: car[I.ch], nc: ncaaPlaces(w), why: why(w, car), real: !!w.real };
}

// A wrestler's college career is over (graduated, left the sport, released for good): career books, Halls of Fame, archive.
// season = the last season he competed in (G.season at graduation).
export function retire(G, w, season = G.season) {
  if (!w || w.retired) return;
  const L = ensureLegacy(G), car = careerOf(w);
  w.retired = true;
  if (bouts(car) > 0) offer(G, 'career', w, car, season);
  const lvl = hofLevel(w, car);
  if (lvl) {
    const m = member(G, w, car, season);
    if (lvl === 2 && !L.hof.some(x => x.id === w.id)) L.hof.push(m);
    const s = (L.shof[w.team] ||= []); if (!s.some(x => x.id === w.id)) s.push({ ...m, nat: lvl === 2 });
  }
  if (lvl || car[I.ch] || w.team === G.userTeam || referenced(G, w.id)) L.arch[w.id] = archiveOf(w, season);
}
function archiveOf(w, season) {
  const hist = (w.hist || []).slice();
  if (w.st && bouts(w.st) + w.st[I.aa] > 0 && !hist.some(h => h[0] === season)) hist.push([season, ...w.st]);
  return { id: w.id, name: w.name, team: w.team, natural: w.natural, cls: w.cls, hist, tr: w.tr || {}, aw: w.aw || [], hm: w.hm || '', real: !!w.real, last: season, arch: w.archetype };
}
const lists = L => [L.rs, L.rc, L.ts, L.tc].flatMap(b => Object.values(b));
function referenced(G, id) { const L = ensureLegacy(G); return lists(L).some(l => l.some(e => e[0] === id)); }

// ---------- reading the books (stored + live) ----------
// scope 'season' | 'career'; team = null (national) or the user's team id. Returns [{id, name, team, season, v, wt, live}] best first.
export function liveRecords(G, scope, cat, team = null) {
  const L = ensureLegacy(G), c = REC_CATS.find(x => x.k === cat), store = (team ? (scope === 'season' ? L.ts : L.tc) : (scope === 'season' ? L.rs : L.rc))[cat] || [];
  const out = store.map(e => ({ id: e[0], name: e[1], team: e[2], season: e[3], v: e[4], wt: e[5] }));
  const seen = new Set(out.map(e => e.id + '|' + e.season));
  const closed = L.done === G.season;
  for (const id in G.wrestlers) {
    const w = G.wrestlers[id]; if (w.retired || (team && w.team !== team)) continue;
    const s = scope === 'season' ? (closed ? null : w.st) : careerOf(w);
    if (!s || !bouts(s) || !qualifies(c, s, scope)) continue;
    const v = Math.round(c.v(s) * 10000) / 10000; if (!(v > 0)) continue;
    const k = id + '|' + G.season;
    if (scope === 'season' && seen.has(k)) continue;
    if (scope === 'career') { const i = out.findIndex(e => e.id === id); if (i >= 0) out.splice(i, 1); }   // a stored career entry of an active wrestler is impossible, but stay safe
    out.push({ id, name: w.name, team: w.team, season: G.season, v, wt: w.lw || w.natural, live: true });
  }
  return out.sort((a, b) => b.v - a.v || a.season - b.season).slice(0, team ? TEAM_N : REC_N);
}

// multi-time NCAA champions: retired (from the Halls of Fame) + active wrestlers with 2+ titles
export function multiChamps(G) {
  const L = ensureLegacy(G), out = L.hof.filter(m => m.ch >= 2).map(m => ({ ...m, active: false }));
  for (const id in G.wrestlers) {
    const w = G.wrestlers[id]; if (w.retired) continue;
    const car = careerOf(w); if (car[I.ch] >= 2) out.push({ ...member(G, w, car, G.season), active: true });
  }
  return out.sort((a, b) => b.ch - a.ch || b.aa - a.aa || a.to - b.to);
}

// keep the archive small: drop departed wrestlers that nothing points at any more (called once a season)
export function pruneArchive(G) {
  const L = ensureLegacy(G), keep = new Set();
  for (const l of lists(L)) for (const e of l) keep.add(e[0]);
  for (const m of L.hof) keep.add(m.id);
  for (const t in L.shof) for (const m of L.shof[t]) keep.add(m.id);
  for (const a of G.alumni || []) if (a.id) keep.add(a.id);
  for (const n in G.tHist || {}) if (n === 'NCAA Championships') for (const h of G.tHist[n]) for (const c of Object.values(h.champs || {})) if (c.id) keep.add(c.id);
  for (const id of Object.keys(L.arch)) if (!keep.has(id)) delete L.arch[id];
}
export const archived = (G, id) => (G.lg && G.lg.arch && G.lg.arch[id]) || null;
