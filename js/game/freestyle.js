// Freestyle season (optional mode, docs/freestyle.md): after the folkstyle offseason steps, an RTC roster phase and four events
// (Bill Farrell, US Open, World Team Trials with a best-of-3 final, World Championships / Olympic Games). Uses js/engine/fs.js.
// Post-college and foreign athletes live in G.fsw (never in G.wrestlers, so no college system sees them); current college wrestlers on an RTC
// stay in G.wrestlers and are referenced by id. Everything here draws from its own rng streams (seeded from G.seed), never the college ones.
import { makeRng } from '../engine/rng.js';
import { simulateFsBout, fsOvrOfAttrs, FS_OF_LBS, FS_WEIGHTS } from '../engine/fs.js';
import { generateWrestler, WEIGHTS, ARCHETYPES } from '../data/gen.js';
import { runBracket, seedOrder } from './tourney.js';
import { FS_REAL_US, FS_KG_OVERRIDE, FS_PREV, COUNTRIES, FARRELL_GUESTS, NAME_POOLS } from '../data/fsdata.js';
import { REAL_NAMES_ENABLED } from '../data/realtop.js';

export const FS_STEPS = [['roster', 'RTC rosters'], ['farrell', 'Bill Farrell'], ['open', 'US Open'], ['trials', 'World Team Trials'], ['worlds', 'World Championships']];
export const EV_NAME = { farrell: 'Bill Farrell International', open: 'US Open', trials: 'World Team Trials', worlds: 'World Championships', olympics: 'Olympic Games' };
export const FS_Q = { trialsTop: 6, trialsField: 16, aaPlace: 8 };   // top 6 at the Farrell / US Open qualify; Trials bracket size; AA place for AI RTC picks
const LBS_OF_KG = Object.fromEntries(Object.entries(FS_OF_LBS).map(([l, k]) => [k, +l]));
const CTRY = Object.fromEntries(COUNTRIES.map(c => [c[0], { code: c[0], name: c[1], str: c[2], cov: c[3], pool: c[4] }]));
export const countryName = c => (c === 'USA' ? 'USA' : CTRY[c] ? CTRY[c].name : c);
export const fsYear = G => G.season + 1;   // the summer after the 20xx-yy college season
export const isOlympic = G => fsYear(G) % 4 === 0;
export const worldsKey = G => (isOlympic(G) ? 'olympics' : 'worlds');
export const fsOn = G => !!(G.fs && G.fs.on);

// ---------- athletes ----------
export const ath = (G, id) => (G.fsw && G.fsw[id]) || G.wrestlers[id] || null;
export const kgOf = (G, id) => { const a = ath(G, id); return a ? a.kg || a.fsKg || FS_OF_LBS[a.natural] || 74 : 74; };
export const fsOvr = a => fsOvrOfAttrs(a.attrs);
export const ageOf = (G, id) => { const a = ath(G, id); return a ? a.age ?? (18 + (a.cls || 1)) : 0; };
export const isCollege = (G, id) => !!G.wrestlers[id] && !(G.fsw && G.fsw[id]);
export const rtcOf = (G, id) => { for (const tid in G.fs.rtc) if (G.fs.rtc[tid].includes(id)) return tid; return null; };
export const affil = (G, id) => { const a = ath(G, id); if (!a) return ''; if (a.ctry && a.ctry !== 'USA') return countryName(a.ctry); const t = rtcOf(G, id); return t ? G.teams[t].name + ' RTC' : 'Unattached'; };

function genName(rng, pool) { const P = NAME_POOLS[pool] || NAME_POOLS.usa; return `${rng.pick(P[0])} ${rng.pick(P[1])}`; }
function makeAth(G, rng, { name, kg, q, arch, age, ctry = 'USA', src = 'gen', real = false }) {
  const w = generateWrestler(rng, { weight: LBS_OF_KG[kg] || 157, quality: q, archetype: ARCHETYPES[arch] ? arch : 'balanced', school: 'RTC', name });
  const a = { id: 'f' + G.fs.nextId++, name: w.name, kg, age, attrs: w.attrs, arch: w.archetype, ctry, src, ...(real ? { real: 1 } : {}) };
  G.fsw[a.id] = a; return a;
}

// ---------- first freestyle season: build the pools ----------
export function initFreestyle(G) {
  if (G.fs.init) return;
  const rng = makeRng((G.seed ^ 0x51F7) + 7);
  Object.assign(G.fs, { init: true, nextId: G.fs.nextId || 1, rtc: {}, club: [], intl: {}, ev: {}, hist: G.fs.hist || [], honors: G.fs.honors || {}, ent: {}, moved: {}, grads: G.fs.grads || [] });
  G.fsw = G.fsw || {};
  for (const tid in G.teams) G.fs.rtc[tid] = [];
  const byName = name => Object.values(G.wrestlers).find(w => w.name === name);
  // real US seniors (generated names when real names are off)
  for (const line of FS_REAL_US.split('\n')) {
    const [name, kg, school, born, q, arch] = line.split('|'), tid = Object.keys(G.teams).find(id => G.teams[id].name === school);
    const a = makeAth(G, rng, { name: REAL_NAMES_ENABLED ? name : genName(rng, 'usa'), kg: +kg, q: +q, arch, age: fsYear(G) - +born, real: REAL_NAMES_ENABLED, src: 'real' });
    if (tid) G.fs.rtc[tid].push(a.id); else G.fs.club.push(a.id);
  }
  // college wrestlers whose real freestyle weight differs from the 1:1 mapping
  for (const [name, kg] of Object.entries(FS_KG_OVERRIDE)) { const w = byName(name); if (w) w.fsKg = kg; }
  // generated RTC athletes for schools with few real ones: count and level from prestige and the strength of the current roster
  const realCount = tid => G.fs.rtc[tid].length;
  for (const tid in G.teams) {
    const t = G.teams[tid], ovs = t.roster.map(id => G.wrestlers[id]).map(fsOvr).sort((x, y) => y - x).slice(0, 10), str = ovs.length ? ovs.reduce((s, v) => s + v, 0) / ovs.length : 12;
    const n = Math.max(0, Math.min(5, Math.round((t.prestige - 48) / 11 + (str - 14) * 0.6)) - realCount(tid));
    for (let i = 0; i < n; i++) {
      const kg = rng.pick(FS_WEIGHTS), q = 13.4 + (t.prestige - 50) / 50 * 1.8 + (str - 14) * 0.25 + rng.gauss() * 0.9;
      G.fs.rtc[tid].push(makeAth(G, rng, { name: genName(rng, 'usa'), kg, q: Math.min(16.2, q - 0.4), arch: rng.pick(Object.keys(ARCHETYPES)), age: rng.int(23, 29) }).id);
    }
  }
  // unattached US club wrestlers (fill US Open brackets)
  for (const kg of FS_WEIGHTS) for (let i = 0; i < 6; i++) G.fs.club.push(makeAth(G, rng, { name: genName(rng, 'usa'), kg, q: 11 + rng() * 3.2, arch: 'balanced', age: rng.int(22, 31) }).id);
  // the world: one wrestler per country per weight it enters
  for (const c of COUNTRIES) { G.fs.intl[c[0]] = {}; for (const kg of FS_WEIGHTS) G.fs.intl[c[0]][kg] = newIntl(G, rng, c[0], 0, kg).id; }
  // last season (2026) before the game began: World Team and medals (names -> athletes)
  const find = name => Object.values(G.fsw).find(a => a.name === name && a.ctry === 'USA') || byName(name);
  G.fs.prev = { team: {}, medal: {} };
  if (REAL_NAMES_ENABLED) for (const kg of FS_WEIGHTS) { const a = find(FS_PREV.team[kg]); if (a) { G.fs.prev.team[kg] = a.id; G.fs.prev.medal[kg] = FS_PREV.medal[kg]; } }
}
function newIntl(G, rng, code, young, kg) {
  const c = CTRY[code], q = c.str - (young ? 0.9 : 0) + rng.gauss() * 1.1;
  return makeAth(G, rng, { name: genName(rng, c.pool), kg, q, arch: rng.pick(Object.keys(ARCHETYPES)), age: young ? rng.int(20, 23) : rng.int(21, 31), ctry: code });
}

// ---------- graduation hook (offseason.js beginOffseason, before the senior is deleted) ----------
// A graduating senior good enough for senior freestyle (AA level) becomes a freestyle athlete with the same id; he starts at his school's RTC.
export function graduate(G, w) {
  if (!fsOn(G)) return;
  G.fsw = G.fsw || {};
  const f = fsOvr(w); if (f < 15.6) return;
  G.fsw[w.id] = { id: w.id, name: w.name, kg: w.fsKg || FS_KG_OVERRIDE[w.name] || FS_OF_LBS[w.natural], age: 22 + (w.id.length % 2), attrs: { ...w.attrs }, arch: w.archetype, ctry: 'USA', src: 'grad', from: w.team, ...(w.real ? { real: 1 } : {}) };
  (G.fs.grads = G.fs.grads || []).push({ id: w.id, from: w.team });
}

// ---------- step 1: RTC rosters ----------
export function startFsSeason(G) {
  initFreestyle(G);
  const rng = makeRng(G.seed + fsYear(G) * 7919 + 3), fs = G.fs;
  fs.year = fsYear(G); fs.step = 'roster'; fs.ev = {}; fs.ent = {}; fs.moved = {};
  for (const ids of Object.values(fs.intl)) for (const kg in ids) if (G.fsw[ids[kg]]) G.fsw[ids[kg]].kg = +kg;
  // college members must still be on that school's roster; drop the gone
  for (const tid in fs.rtc) fs.rtc[tid] = fs.rtc[tid].filter(id => (G.fsw[id] && !G.fsw[id].ret) || (G.wrestlers[id] && G.wrestlers[id].team === tid && !G.wrestlers[id].gone));
  // graduates: already on their school's RTC by id; AI graduates from weaker programs may move to a stronger RTC
  const strength = tid => fs.rtc[tid].reduce((s, id) => s + Math.max(0, fsOvr(ath(G, id)) - 14), 0);
  for (const g of fs.grads || []) {
    const a = G.fsw[g.id]; if (!a) continue;
    const from = g.from && G.teams[g.from] ? g.from : null;
    if (from === G.userTeam) { if (!fs.rtc[from].includes(a.id)) fs.rtc[from].push(a.id); continue; }   // yours stay unless you release them
    let to = from;
    if (!from || rng.chance(Math.max(0.05, Math.min(0.6, (92 - G.teams[from].prestige) / 80)))) {
      const opts = Object.keys(G.teams).filter(t => t !== G.userTeam).sort((x, y) => (G.teams[y].prestige + strength(y) * 2) - (G.teams[x].prestige + strength(x) * 2)).slice(0, 12);
      to = rng.pick(opts);
    }
    if (to) { for (const t in fs.rtc) fs.rtc[t] = fs.rtc[t].filter(x => x !== a.id); fs.rtc[to].push(a.id); a.moved = to !== from ? 1 : 0; }
  }
  fs.lastGrads = (fs.grads || []).map(g => ({ id: g.id, from: g.from, to: rtcOf(G, g.id) }));
  fs.grads = [];
  // AI RTCs add their All-Americans (NCAA top 8 this season) and last year's World Team members still in college
  const ncaa = G.tournaments.find(t => t.kind === 'ncaa' && t.result);
  const aa = new Set();
  if (ncaa) for (const wt of WEIGHTS) for (const e of (ncaa.result.weights[wt] || {}).top || []) if (e.place <= FS_Q.aaPlace) aa.add(e.id);
  for (const kg in fs.prev.team) if (G.wrestlers[fs.prev.team[kg]]) aa.add(fs.prev.team[kg]);
  // (your own All-Americans start on your RTC too; you can drop them in this step)
  for (const id of aa) { const w = G.wrestlers[id]; if (!w || !fs.rtc[w.team]) continue; if (!fs.rtc[w.team].includes(id)) fs.rtc[w.team].push(id); }
  // free agents: unattached US athletes (club, released) may be picked up by AI RTCs
  for (const id of fs.club.slice()) {
    const a = G.fsw[id]; if (!a || a.ret || fsOvr(a) < 15.5 || !rng.chance(0.5)) continue;
    const to = rng.pick(Object.keys(G.teams).filter(t => t !== G.userTeam && G.teams[t].prestige >= 60));
    fs.club = fs.club.filter(x => x !== id); fs.rtc[to].push(id);
  }
}
// user roster actions (roster step only)
export function rtcAdd(G, id) {
  const fs = G.fs, me = G.userTeam; if (fs.step !== 'roster') return 'Roster changes are only allowed in the RTC roster step.';
  if (G.wrestlers[id] && !G.fsw[id] && G.wrestlers[id].team !== me) return 'College wrestlers can only join their own school\'s RTC.';
  if (G.fsw[id] && G.fsw[id].ctry !== 'USA') return 'Only US athletes.';
  if (rtcOf(G, id) && rtcOf(G, id) !== me) return 'He is on another RTC.';
  fs.club = fs.club.filter(x => x !== id); if (!fs.rtc[me].includes(id)) fs.rtc[me].push(id); return null;
}
export function rtcDrop(G, id) {
  const fs = G.fs, me = G.userTeam; if (fs.step !== 'roster') return 'Roster changes are only allowed in the RTC roster step.';
  fs.rtc[me] = fs.rtc[me].filter(x => x !== id); if (G.fsw[id] && !fs.club.includes(id)) fs.club.push(id); return null;
}
// one weight move per freestyle season, chosen in the roster step, instant
export function setKg(G, id, kg) {
  const fs = G.fs, a = ath(G, id); if (!a || fs.step !== 'roster') return 'Weight moves are only allowed in the RTC roster step.';
  const base = a._kg0 ?? kgOf(G, id), i0 = FS_WEIGHTS.indexOf(base), i1 = FS_WEIGHTS.indexOf(kg);
  if (Math.abs(i1 - i0) > 1) return 'One weight class up or down per season.';
  if (a._kg0 === undefined) a._kg0 = base;
  if (a.ctry) a.kg = kg; else a.fsKg = kg;
  fs.moved[id] = kg !== base; return null;
}
export const freeAgents = G => G.fs.club.map(id => G.fsw[id]).filter(a => a && !a.ret).sort((x, y) => fsOvr(y) - fsOvr(x));

// ---------- events ----------
const usAthletes = G => { const out = []; for (const tid in G.fs.rtc) for (const id of G.fs.rtc[tid]) out.push(id); for (const id of G.fs.club) if (G.fsw[id] && !G.fsw[id].ret) out.push(id); return out; };
const userEnters = (G, ev, id) => !(G.fs.ent[ev] && G.fs.ent[ev][id] === false);
export const isMine = (G, id) => (G.fs.rtc[G.userTeam] || []).includes(id);
export function setEntry(G, ev, id, on) { (G.fs.ent[ev] = G.fs.ent[ev] || {})[id] = !!on; }

function snap(G, id) {
  const a = ath(G, id);
  return { name: a.name, school: affil(G, id), weight: LBS_OF_KG[kgOf(G, id)] || 157, attrs: { ...a.attrs }, plan: 'balanced' };
}
// one bout; keeps a replay record when one of the user's athletes wrestles
function bout(G, rng, store, a, b, label, kg) {
  const sA = snap(G, a.id), sB = snap(G, b.id), seed = (rng() * 4294967296) >>> 0;
  const r = simulateFsBout(sA, sB, { seed, kg });
  const win = r.winner === 'A' ? a : b, lose = win === a ? b : a;
  if (isMine(G, a.id) || isMine(G, b.id)) store.push({ kg, label, a: a.id, b: b.id, w: r.winner, d: r.detail, seed, snapA: sA, snapB: sB, sA: r.score.A, sB: r.score.B });
  return { w: win, l: lose, r };
}
const seedSort = (G, ids) => ids.map(id => ({ id, r: fsOvr(ath(G, id)) + ((G.fs.form || {})[id] || 0) })).sort((x, y) => y.r - x.r);
function formFor(G, rng, ids) { G.fs.form = G.fs.form || {}; for (const id of ids) G.fs.form[id] = rng.gauss() * 0.9; }

// US-style double-elimination bracket (runBracket: NCAA wrestlebacks, places 1-8)
function usBracket(G, rng, ids, kg, store, label) {
  const ents = seedSort(G, ids).map((x, i) => ({ id: x.id, seed: i + 1 }));
  const places = runBracket(ents, (a, b, champ, lab) => bout(G, rng, store, a, b, `${label} · ${lab}`, kg));
  return ents.map(e => ({ id: e.id, place: places.get(e) || 9, seed: e.seed })).sort((x, y) => x.place - y.place);
}
// UWW: single elimination (top 8 seeded, the rest drawn), repechage for everyone beaten by a finalist, two bronzes
function uwwBracket(G, rng, ids, kg, store, label) {
  const sorted = seedSort(G, ids), seeded = sorted.slice(0, 8).map(x => x.id), rest = sorted.slice(8).map(x => x.id);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const order = seeded.concat(rest), n = order.length, P = 2 ** Math.ceil(Math.log2(Math.max(2, n)));
  let cur = seedOrder(P).map(s => (s <= n ? { id: order[s - 1] } : null));
  const beatBy = {}, rounds = Math.log2(P), rn = r => (r === rounds ? 'Final' : r === rounds - 1 ? 'Semifinal' : r === rounds - 2 ? 'Quarterfinal' : `1/${2 ** (rounds - r)} final`);
  let semiL = [];
  for (let r = 1; r <= rounds; r++) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      const a = cur[i], b = cur[i + 1];
      if (a && b) { const x = bout(G, rng, store, a, b, `${label} · ${rn(r)}`, kg); (beatBy[x.w.id] = beatBy[x.w.id] || []).push(x.l.id); next.push(x.w); if (r === rounds - 1) semiL.push(x.l); }
      else next.push(a || b);
    }
    cur = next;
  }
  const champ = cur[0], places = new Map([[champ.id, 1]]);
  const final = beatBy[champ.id].slice(-1)[0]; places.set(final, 2);
  // repechage: the finalists' earlier victims (not the semifinal losers) wrestle in order; the winner meets the semifinal loser of the other half
  const rep = fid => { const L = (beatBy[fid] || []).slice(0, -2 + (fid === champ.id ? 0 : 1)); let w = null; for (const id of L) { if (!w) { w = { id }; continue; } w = bout(G, rng, store, w, { id }, `${label} · Repechage`, kg).w; } return w; };
  const fins = [champ.id, final].map(fid => ({ fid, rw: rep(fid) }));
  const sl = semiL.map(x => x.id);
  // semifinal loser of each half: the one beaten by that half's finalist
  const slOf = fid => sl.find(id => (beatBy[fid] || []).includes(id));
  for (let k = 0; k < 2; k++) {
    const rw = fins[k].rw, other = slOf(fins[1 - k].fid);
    if (rw && other) { const x = bout(G, rng, store, rw, { id: other }, `${label} · Bronze`, kg); places.set(x.w.id, 3); places.set(x.l.id, 5); }
    else if (other) places.set(other, 3); else if (rw) places.set(rw.id, 3);
  }
  return order.map(id => ({ id, place: places.get(id) || 7 + (beatBy[id] ? 0 : 2) })).sort((x, y) => x.place - y.place);
}

function enterUS(G, rng, ev, kg, pEnter) {
  return usAthletes(G).filter(id => kgOf(G, id) === kg && (isMine(G, id) ? userEnters(G, ev, id) : rng.chance(pEnter(id))));
}
// AI entry odds: medalists with a Trials bye skip the opens; qualified athletes often skip the US Open
const hasBye = (G, id) => { const kg = kgOf(G, id); return G.fs.prev.team[kg] === id && G.fs.prev.medal[kg] > 0; };
const qualified = (G, id) => !!(G.fs.q && G.fs.q[id]) || Object.values(G.fs.prev.team).includes(id);

export function runFsEvent(G) {
  const fs = G.fs, ev = fs.step === 'roster' ? 'farrell' : fs.step; if (!EV_NAME[ev] && ev !== 'worlds') return;
  const rng = makeRng(G.seed + fsYear(G) * 104729 + ev.length * 31 + ev.charCodeAt(0));
  fs.step = ev; fs.q = fs.q || {};
  const res = { kg: {}, bouts: [], year: fsYear(G) };
  for (const kg of FS_WEIGHTS) {
    let ids;
    if (ev === 'farrell') {
      ids = enterUS(G, rng, ev, kg, id => (hasBye(G, id) ? 0.15 : qualified(G, id) ? 0.35 : 0.55));
      for (const c of FARRELL_GUESTS) if (rng.chance(0.35) && fs.intl[c] && fs.intl[c][kg]) ids.push(fs.intl[c][kg]);
    } else if (ev === 'open') {
      ids = enterUS(G, rng, ev, kg, id => (hasBye(G, id) ? 0.1 : qualified(G, id) ? 0.45 : 0.85));
    } else if (ev === 'trials') { res.kg[kg] = trialsWeight(G, rng, kg, res.bouts); continue; }
    else { res.kg[kg] = worldsWeight(G, rng, kg, res.bouts); continue; }
    formFor(G, rng, ids);
    const pl = ids.length >= 2 ? usBracket(G, rng, ids, kg, res.bouts, EV_NAME[ev]) : ids.map(id => ({ id, place: 1 }));
    res.kg[kg] = { field: ids.length, places: pl.filter(p => p.place <= 8).map(p => ({ id: p.id, place: p.place, name: ath(G, p.id).name, aff: affil(G, p.id) })) };
    let n = 0;   // top 6 US athletes qualify for the Trials
    for (const p of pl) { const a = ath(G, p.id); if (a.ctry && a.ctry !== 'USA') continue; if (++n > FS_Q.trialsTop || p.place > 8) break; fs.q[p.id] = fs.q[p.id] || `${EV_NAME[ev]} ${p.place === 1 ? 'champion' : ordinal(p.place)}`; }
  }
  fs.ev[ev === 'worlds' ? worldsKey(G) : ev] = res;
  const nextStep = { farrell: 'open', open: 'trials', trials: 'worlds', worlds: 'done' }[ev];
  fs.step = nextStep;
  if (nextStep === 'done') endFsSeason(G);
}
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');

function trialsWeight(G, rng, kg, store) {
  const fs = G.fs, us = usAthletes(G).filter(id => kgOf(G, id) === kg), why = {};
  const bye = us.find(id => fs.prev.team[kg] === id && fs.prev.medal[kg] > 0 && (!isMine(G, id) || userEnters(G, 'trials', id)));
  for (const id of us) {
    if (id === bye || (isMine(G, id) && !userEnters(G, 'trials', id))) continue;
    if (Object.values(fs.prev.team).includes(id)) why[id] = `${fs.year - 1} World Team`;
    else if (fs.q[id]) why[id] = fs.q[id];
  }
  const hist = (G.history || []).find(h => h.season === G.season);
  if (hist) for (const wt in hist.champs) { const c = hist.champs[wt]; if (c && us.includes(c.id) && c.id !== bye && !why[c.id] && !(isMine(G, c.id) && !userEnters(G, 'trials', c.id))) why[c.id] = 'NCAA champion'; }
  const atl = us.filter(id => !why[id] && id !== bye && !(isMine(G, id) && !userEnters(G, 'trials', id))).sort((x, y) => fsOvr(ath(G, y)) - fsOvr(ath(G, x)));
  while (Object.keys(why).length < FS_Q.trialsField && atl.length) why[atl.shift()] = 'At-large';
  const ids = Object.keys(why);
  formFor(G, rng, ids);
  const pl = ids.length >= 2 ? usBracket(G, rng, ids, kg, store, 'Trials') : ids.map(id => ({ id, place: 1 }));
  const top = pl[0] && pl[0].id, second = pl[1] && pl[1].id;
  // best-of-3 final: the medalist (bye) against the bracket winner; without one, the bracket final counts as match 1 of the series
  let A = bye || top, B = bye ? top : second, wins = { [A]: bye ? 0 : 1, [B]: 0 }, series = [];
  if (!bye && A) series.push({ w: A, d: 'bracket final' });
  if (A && B) while (wins[A] < 2 && wins[B] < 2) { const x = bout(G, rng, store, { id: A }, { id: B }, `Trials · Final, match ${series.length + 1}`, kg); wins[x.w.id]++; series.push({ w: x.w.id, d: x.r.detail }); }
  const winner = A && B ? (wins[A] >= 2 ? A : B) : A || null;
  if (winner) fs.team = { ...(fs.team || {}), [kg]: winner };
  return { field: ids.length, bye: bye || null, quals: ids.map(id => ({ id, name: ath(G, id).name, aff: affil(G, id), why: why[id] })).sort((x, y) => fsOvr(ath(G, y.id)) - fsOvr(ath(G, x.id))),
    places: pl.filter(p => p.place <= 8).map(p => ({ id: p.id, place: p.place, name: ath(G, p.id).name, aff: affil(G, p.id) })),
    final: A && B ? { a: A, b: B, wins: [wins[A], wins[B]], series } : null, winner, winnerName: winner ? ath(G, winner).name : null };
}

function worldsWeight(G, rng, kg, store) {
  const fs = G.fs, oly = isOlympic(G), ids = [];
  if (fs.team && fs.team[kg]) ids.push(fs.team[kg]);
  const cs = COUNTRIES.filter(c => fs.intl[c[0]] && fs.intl[c[0]][kg]);
  for (const c of cs) if (oly ? true : rng.chance(c[3])) ids.push(fs.intl[c[0]][kg]);
  let field = ids;
  if (oly) field = [ids[0], ...seedSort(G, ids.slice(1)).slice(0, 15).map(x => x.id)].filter(Boolean);   // Olympics: 16 qualified athletes
  formFor(G, rng, field);
  const pl = uwwBracket(G, rng, field, kg, store, oly ? 'Olympics' : 'Worlds');
  return { field: field.length, places: pl.filter(p => p.place <= 5).map(p => ({ id: p.id, place: p.place, name: ath(G, p.id).name, aff: affil(G, p.id), usa: !ath(G, p.id).ctry || ath(G, p.id).ctry === 'USA' })),
    us: fs.team && fs.team[kg] ? { id: fs.team[kg], place: (pl.find(p => p.id === fs.team[kg]) || {}).place || null } : null };
}

// ---------- season end: honors, prestige, aging, retirements, next year's byes ----------
function endFsSeason(G) {
  const fs = G.fs, rng = makeRng(G.seed + fsYear(G) * 3571 + 9), wk = worldsKey(G), W = fs.ev[wk];
  const h = { year: fs.year, oly: isOlympic(G), team: {}, champs: {} };
  const hon = (id, f) => { const a = ath(G, id); const x = fs.honors[id] = fs.honors[id] || { name: a.name, aff: affil(G, id), usa: !a.ctry || a.ctry === 'USA', gold: 0, silver: 0, bronze: 0, teams: 0, oly: 0, opens: 0, years: [] }; x.aff = affil(G, id); f(x); };
  const prevTeam = {}, prevMedal = {};
  for (const kg of FS_WEIGHTS) {
    const r = W.kg[kg];
    for (const p of r.places) if (p.place <= 3) hon(p.id, x => { x[['', 'gold', 'silver', 'bronze'][p.place]]++; if (h.oly) x.oly++; x.years.push(`${fs.year} ${h.oly ? 'OG' : 'WC'} ${['', 'gold', 'silver', 'bronze'][p.place]}`); });
    const us = r.us; if (us) { h.team[kg] = { id: us.id, name: ath(G, us.id).name, aff: affil(G, us.id), place: us.place }; hon(us.id, x => { x.teams++; }); prevTeam[kg] = us.id; prevMedal[kg] = us.place && us.place <= 3 ? us.place : 0; }
    h.champs[kg] = r.places[0] ? { name: r.places[0].name, aff: r.places[0].aff } : null;
    const oc = fs.ev.open && fs.ev.open.kg[kg].places[0]; if (oc) hon(oc.id, x => { x.opens++; });
  }
  fs.hist.push(h);
  // RTC payoff: prestige bump for schools whose RTC athletes made the team / medalled (small; most for smaller programs)
  const gain = {};
  for (const kg in h.team) { const t = rtcOf(G, h.team[kg].id); if (!t) continue; const p = h.team[kg].place; gain[t] = (gain[t] || 0) + (p === 1 ? 0.6 : p === 2 ? 0.45 : p === 3 ? 0.35 : 0.2); }
  for (const kg of FS_WEIGHTS) { const oc = fs.ev.open && fs.ev.open.kg[kg].places[0]; const t = oc && rtcOf(G, oc.id); if (t) gain[t] = (gain[t] || 0) + 0.1; }
  fs.payoff = {};
  for (const t in gain) { const g = Math.min(1.5, gain[t]) * Math.max(0.2, 1 - G.teams[t].prestige / 120); G.teams[t].prestige = Math.min(99, Math.round((G.teams[t].prestige + g) * 10) / 10); fs.payoff[t] = Math.round(g * 100) / 100; }
  fs.prev = { team: prevTeam, medal: prevMedal };
  fs.q = {}; fs.team = {}; fs.form = {};
  // aging and development of the senior athletes; retirements (foreign spots are refilled with a young wrestler)
  const KEYS = Object.keys(Object.values(G.fsw)[0].attrs);
  for (const id in G.fsw) {
    const a = G.fsw[id]; if (a.ret) continue;
    a.age++;
    const up = a.age <= 24 ? 0.22 : a.age <= 27 ? 0.1 : 0.02, down = a.age >= 30 ? (a.age - 29) * 0.06 : 0, boom = rng.chance(0.02);   // big post-college jumps are rare
    for (const k of KEYS) {
      if (rng.chance(up * (boom ? 3 : 1)) && a.attrs[k] < 20) a.attrs[k]++;
      if (['speed', 'cardio', 'flex', 'tdd', 'tdo'].includes(k) && rng.chance(down) && a.attrs[k] > 1) a.attrs[k]--;
    }
    const f = fsOvr(a), retire = a.age >= 37 || (a.age >= 33 && rng.chance(0.45)) || (a.age >= 30 && f < 15.4 && rng.chance(0.45)) || (a.age >= 26 && f < 14.8 && rng.chance(0.45)) || (a.age >= 24 && f < 14 && rng.chance(0.6));   // keeps the US pool (and the save) from growing without end
    if (retire) a.ret = 1;
  }
  for (const code in fs.intl) for (const kg in fs.intl[code]) { const a = G.fsw[fs.intl[code][kg]]; if (!a || a.ret) { fs.intl[code][kg] = newIntl(G, rng, code, 1, +kg).id; } }
  for (const tid in fs.rtc) fs.rtc[tid] = fs.rtc[tid].filter(id => !(G.fsw[id] && G.fsw[id].ret));
  fs.club = fs.club.filter(id => G.fsw[id] && !G.fsw[id].ret);
  for (const kg of FS_WEIGHTS) { const live = fs.club.filter(id => G.fsw[id].kg === kg).length; for (let i = live; i < 6; i++) fs.club.push(makeAth(G, rng, { name: genName(rng, 'usa'), kg, q: 11 + rng() * 3.2, arch: 'balanced', age: rng.int(22, 26) }).id); }
  // retired athletes are deleted (their honors stay by name); weight-move markers reset
  for (const id in G.fsw) { if (G.fsw[id].ret) delete G.fsw[id]; else delete G.fsw[id]._kg0; }
  for (const id in G.wrestlers) delete G.wrestlers[id]._kg0;
  G.inbox.unshift({ week: G.week, title: `${fs.year} ${EV_NAME[wk]}`, body: worldsNote(G, h) });
}
function worldsNote(G, h) {
  const med = Object.entries(h.team).filter(([, t]) => t.place && t.place <= 3);
  const mine = Object.entries(h.team).filter(([, t]) => rtcOf(G, t.id) === G.userTeam);
  return `US team: ${med.length} medal${med.length === 1 ? '' : 's'} (${med.map(([kg, t]) => `${t.name} ${kg} kg ${['', 'gold', 'silver', 'bronze'][t.place]}`).join(', ') || 'none'}).${mine.length ? ` Your RTC: ${mine.map(([kg, t]) => `${t.name} (${kg} kg${t.place ? ', ' + ordinal(t.place) : ''})`).join(', ')}.` : ''}${G.fs.payoff[G.userTeam] ? ` Prestige +${G.fs.payoff[G.userTeam]}.` : ''}`;
}

// run whatever is left (headless sims, or the user starting the season early)
export function finishFsSeason(G) {
  if (!fsOn(G)) return;
  if (!G.fs.step || G.fs.step === 'done') return;
  let guard = 0; while (G.fs.step !== 'done' && guard++ < 6) runFsEvent(G);
}
