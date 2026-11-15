// Freestyle season (optional mode, docs/freestyle.md): after the folkstyle offseason steps, an RTC roster phase and four events
// (Bill Farrell, US Open, World Team Trials with a best-of-3 final, World Championships / Olympic Games). Uses js/engine/fs.js.
// Post-college and foreign athletes live in G.fsw (never in G.wrestlers, so no college system sees them); current college wrestlers on an RTC
// stay in G.wrestlers and are referenced by id. Everything here draws from its own rng streams (seeded from G.seed), never the college ones.
import { makeRng } from '../engine/rng.js';
import { simulateFsBout, fsOvrOfAttrs, FS_OF_LBS, FS_WEIGHTS, FS_OVR_W } from '../engine/fs.js';
import { generateWrestler, WEIGHTS, ARCHETYPES } from '../data/gen.js';
import { runBracket, seedOrder } from './tourney.js';
import { FS_REAL_US, FS_REAL_INTL, FS_KG_OVERRIDE, FS_PREV, COUNTRIES, FARRELL_GUESTS, NAME_POOLS, COLLEGE_NAT, FS_COLLEGE_FLOOR } from '../data/fsdata.js';
import { REAL_NAMES_ENABLED } from '../data/realtop.js';
import { matchInjuryChance } from './core.js';
import { initLive } from './live.js';
import { rtcName } from '../data/rtcnames.js';
import { usName } from '../data/names.js';

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
export const natOf = (G, id) => { const a = ath(G, id); return (a && (a.ctry || a.nat || COLLEGE_NAT[a.name])) || 'USA'; };
export const affil = (G, id) => { const a = ath(G, id); if (!a) return ''; const c = natOf(G, id); if (c !== 'USA') { const t = G.fs.rtc && rtcOf(G, id); return countryName(c) + (t ? ` · ${rtcName(G.teams[t].name)}` : ''); } const t = rtcOf(G, id); return t ? rtcName(G.teams[t].name) : 'Unattached'; };

function genName(rng, pool) { if (pool === 'usa' || !NAME_POOLS[pool]) return usName(rng); const P = NAME_POOLS[pool]; return `${rng.pick(P[0])} ${rng.pick(P[1])}`; }
function makeAth(G, rng, { name, kg, q, arch, age, ctry = 'USA', src = 'gen', real = false }) {
  const w = generateWrestler(rng, { weight: LBS_OF_KG[kg] || 157, quality: q, archetype: ARCHETYPES[arch] ? arch : 'balanced', school: 'RTC', name });
  const a = { id: 'f' + G.fs.nextId++, name: w.name, kg, age, attrs: w.attrs, arch: w.archetype, ctry, src, ...(real ? { real: 1 } : {}) };
  G.fsw[a.id] = a; return a;
}

// move attributes one point at a time until the FS OVR hits the target (no rng): raise the lowest / lower the highest of `keys`
// (default: the attributes that matter in freestyle), ties to the bigger freestyle weight; floor = only ever raise
const FS_MAIN = Object.keys(FS_OVR_W).filter(k => FS_OVR_W[k] >= 0.5);
function pinFs(at, target, { floor = false, keys = FS_MAIN } = {}) {
  for (let it = 0; it < 400; it++) {
    const diff = target - fsOvrOfAttrs(at); if (diff < 0.04 && (floor || diff > -0.04)) break;
    const up = diff > 0, cand = keys.filter(k => (up ? at[k] < 20 : at[k] > 1)); if (!cand.length) { if (!up || keys.length >= Object.keys(at).length) break; keys = keys === FS_MAIN ? Object.keys(at) : FS_MAIN; continue; }   // widen: the given keys, then the main freestyle ones, then all
    const k = cand.sort((x, y) => (up ? at[x] - at[y] : at[y] - at[x]) || FS_OVR_W[y] - FS_OVR_W[x])[0];
    at[k] += up ? 1 : -1;
  }
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
    pinFs(a.attrs, +q);   // the listed FS OVR exactly (generation spread made World champions anywhere from 18 to 19.5)
    if (tid) G.fs.rtc[tid].push(a.id); else G.fs.club.push(a.id);
  }
  // college wrestlers whose real freestyle weight differs from the 1:1 mapping
  for (const [name, kg] of Object.entries(FS_KG_OVERRIDE)) { const w = byName(name); if (w) w.fsKg = kg; }
  // 2026 World Team members still in college (or just graduated): at least their listed FS OVR, through par terre / strength / big moves first
  for (const [name, f] of Object.entries(FS_COLLEGE_FLOOR)) { const w = byName(name) || Object.values(G.fsw).find(a => a.name === name); if (w) pinFs(w.attrs, f, { floor: true, keys: ['topt', 'botRes', 'big', 'str', 'flex', 'hand', 'iq', 'cardio'] }); }
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
  // real foreign wrestlers (2026 Worlds placers) take over their country's slot at that weight; no rng, so nothing else changes
  const MED = ['', 'gold', 'silver', 'bronze'];
  const seed2026 = (a, place) => {   // last season's World result: results history, and honors for medalists
    (G.fs.res[a.id] = G.fs.res[a.id] || []).push([FS_PREV.season, 'worlds', a.kg || kgOf(G, a.id), place]);
    if (place <= 3) { const x = G.fs.honors[a.id] = G.fs.honors[a.id] || { name: a.name, aff: affil(G, a.id), usa: isUSA(G, a.id), gold: 0, silver: 0, bronze: 0, teams: 0, oly: 0, opens: 0, years: [] }; x[MED[place]]++; x.years.push(`${FS_PREV.season} WC ${MED[place]}`); if (x.usa) x.teams++; }
  };
  G.fs.res = G.fs.res || {};
  if (REAL_NAMES_ENABLED) {
    for (const line of FS_REAL_INTL.split('\n')) {
      const [name, kg, code, born, f, place] = line.split('|'), slot = G.fs.intl[code] && G.fsw[G.fs.intl[code][+kg]];
      if (!slot) continue;
      Object.assign(slot, { name, age: fsYear(G) - +born, real: 1, src: 'real' }); pinFs(slot.attrs, +f);
      seed2026(slot, +place);
    }
    for (const kg of FS_WEIGHTS) { const id = G.fs.prev.team[kg]; if (id) seed2026(ath(G, id), G.fs.prev.medal[kg] || 9); }   // US team: medal, or 9 = no medal
  }
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
  const f = fsOvr(w); if (f < 15.6) { if (G.fs.st && G.fs.st[w.id]) retireAth(G, w.id, w); return; }
  G.fsw[w.id] = { id: w.id, name: w.name, kg: w.fsKg || FS_KG_OVERRIDE[w.name] || FS_OF_LBS[w.natural], age: 22 + (w.id.length % 2), attrs: { ...w.attrs }, arch: w.archetype, ctry: natOf(G, w.id), src: 'grad', from: w.team, ...(w.real ? { real: 1 } : {}) };
  (G.fs.grads = G.fs.grads || []).push({ id: w.id, from: w.team });
}

// ---------- step 1: RTC rosters ----------
export function startFsSeason(G) {
  initFreestyle(G);
  const rng = makeRng(G.seed + fsYear(G) * 7919 + 3), fs = G.fs;
  fs.year = fsYear(G); fs.step = 'roster'; fs.ev = {}; fs.ent = {}; fs.moved = {}; fs.sy = {}; fs.cb = {}; fs.carry = null; delete fs.live;
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
const rtcAthletes = G => { const out = []; for (const tid in G.fs.rtc) for (const id of G.fs.rtc[tid]) out.push(id); for (const id of G.fs.club) if (G.fsw[id] && !G.fsw[id].ret) out.push(id); return out; };
const usAthletes = G => rtcAthletes(G).filter(id => isUSA(G, id));   // US Open / Trials: US citizens only
const userEnters = (G, ev, id) => !(G.fs.ent[ev] && G.fs.ent[ev][id] === false);
export const isMine = (G, id) => (G.fs.rtc[G.userTeam] || []).includes(id);
export function setEntry(G, ev, id, on) { (G.fs.ent[ev] = G.fs.ent[ev] || {})[id] = !!on; }

function snap(G, id) {
  const a = ath(G, id);
  return { name: a.name, school: affil(G, id), weight: LBS_OF_KG[kgOf(G, id)] || 157, attrs: { ...a.attrs }, plan: 'balanced' };
}
// "your" athletes in an event: your RTC at the Farrell / US Open / Trials, every US athlete at the Worlds / Olympics (the user coaches Team USA there)
let CUR_EV = null, CUR_T = null;   // CUR_T: the live record of the event being run (fs.live)
export const isUSA = (G, id) => !!ath(G, id) && natOf(G, id) === 'USA';
export const isMineAt = (G, ev, id) => (ev === 'worlds' || ev === 'olympics' ? isUSA(G, id) : isMine(G, id));
// freestyle win-loss tallies: career (fs.st) and this season (fs.sy); w, l, tf = tech-fall wins, fa = fall wins
function tally(G, id, won, method) {
  if (!isUSA(G, id)) { const z = (G.fs.xs = G.fs.xs || {})[id] = (G.fs.xs[id] || { w: 0, l: 0, tf: 0, fa: 0 }); if (won) { z.w++; if (method === 'Tech Fall') z.tf++; if (method === 'Fall') z.fa++; } else z.l++;   // foreign athletes' career record (profiles only)
    if (G.wrestlers[id] && !G.fsw[id]) { const x = (G.fs.cb = G.fs.cb || {})[id] = (G.fs.cb[id] || { w: 0, l: 0 }); won ? x.w++ : x.l++; } return; }   // the record books are US-only; foreign college wrestlers' bouts still count for the college carryover (fs.cb)
  for (const k of ['st', 'sy']) {
    const m = G.fs[k] = G.fs[k] || {}, x = m[id] = m[id] || { w: 0, l: 0, tf: 0, fa: 0 };
    if (won) { x.w++; if (method === 'Tech Fall') x.tf++; if (method === 'Fall') x.fa++; } else x.l++;
  }
}
// one bout; keeps a replay record when one of the user's athletes wrestles (no extra rng draws: the record is only data)
// meta (live viewer): c = championship side, lv = reveal level (the bout is never revealed before both wrestlers' previous bouts), rl = round
// name shown for that level, lb = this bout's own label
function bout(G, rng, store, a, b, label, kg, meta = {}) {
  const sA = snap(G, a.id), sB = snap(G, b.id), seed = (rng() * 4294967296) >>> 0;
  const r = simulateFsBout(sA, sB, { seed, kg });
  const win = r.winner === 'A' ? a : b, lose = win === a ? b : a;
  tally(G, win.id, true, r.method); tally(G, lose.id, false, r.method);
  const mine = isMineAt(G, CUR_EV, a.id) || isMineAt(G, CUR_EV, b.id);
  if (mine) store.push({ kg, label, a: a.id, b: b.id, w: r.winner, d: r.detail, seed, snapA: sA, snapB: sB, sA: r.score.A, sB: r.score.B });
  if (CUR_T) {
    const W = CUR_T.result.weights[kg] = CUR_T.result.weights[kg] || { matches: [] }, i = W.matches.length;
    const l = Math.max(meta.lv ?? 1, (a.lv ?? -1) + 1, (b.lv ?? -1) + 1);
    W.matches.push({ i, l, c: meta.c ? 1 : 0, rl: meta.rl || '', lb: meta.lb || label, a: a.id, b: b.id, sa: a.seed ?? '', sb: b.seed ?? '', pa: a.mi ?? -1, pb: b.mi ?? -1, w: r.winner, d: r.detail, seed, u: mine ? 1 : -1 });
    for (const e of [a, b]) { e.mi = i; e.lv = l; }
    CUR_T.snaps[a.id] = CUR_T.snaps[a.id] || sA; CUR_T.snaps[b.id] = CUR_T.snaps[b.id] || sB;
  }
  return { w: win, l: lose, r };
}
const seedSort = (G, ids) => ids.map(id => ({ id, r: fsOvr(ath(G, id)) + ((G.fs.form || {})[id] || 0) })).sort((x, y) => y.r - x.r);
function formFor(G, rng, ids) { G.fs.form = G.fs.form || {}; for (const id of ids) G.fs.form[id] = rng.gauss() * 0.9; }

// US-style double-elimination bracket (runBracket: NCAA wrestlebacks, places 1-8)
function usBracket(G, rng, ids, kg, store, label) {
  const ents = seedSort(G, ids).map((x, i) => ({ id: x.id, seed: i + 1 }));
  const places = runBracket(ents, (a, b, champ, lab, lv, rl) => bout(G, rng, store, a, b, `${label} · ${lab}`, kg, { c: champ, lv, rl, lb: lab }));
  return ents.map(e => ({ id: e.id, place: places.get(e) || 9, seed: e.seed })).sort((x, y) => x.place - y.place);
}
// UWW: single elimination (top 8 seeded, the rest drawn), repechage for everyone beaten by a finalist, two bronzes
function uwwBracket(G, rng, ids, kg, store, label) {
  const sorted = seedSort(G, ids), seeded = sorted.slice(0, 8).map(x => x.id), rest = sorted.slice(8).map(x => x.id);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const order = seeded.concat(rest), n = order.length, P = 2 ** Math.ceil(Math.log2(Math.max(2, n)));
  let cur = seedOrder(P).map(s => (s <= n ? { id: order[s - 1], seed: s <= 8 ? s : '' } : null));
  const beatBy = {}, rounds = Math.log2(P), rn = r => (r === rounds ? 'Final' : r === rounds - 1 ? 'Semifinal' : r === rounds - 2 ? 'Quarterfinal' : `1/${2 ** (rounds - r)} final`);
  const lvOf = r => (r === rounds ? 10 : r + 6 - rounds);   // live viewer: semifinals at level 5, repechage 6-8, bronze 9, final 10
  let semiL = [];
  for (let r = 1; r <= rounds; r++) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      const a = cur[i], b = cur[i + 1];
      if (a && b) { const x = bout(G, rng, store, a, b, `${label} · ${rn(r)}`, kg, { c: 1, lv: lvOf(r), rl: rn(r) === 'Final' ? 'Finals' : rn(r) === 'Semifinal' ? 'Semifinals' : rn(r) === 'Quarterfinal' ? 'Quarterfinals' : rn(r), lb: rn(r) }); (beatBy[x.w.id] = beatBy[x.w.id] || []).push(x.l.id); next.push(x.w); if (r === rounds - 1) semiL.push(x.l); }
      else next.push(a || b);
    }
    cur = next;
  }
  const champ = cur[0], places = new Map([[champ.id, 1]]);
  const final = beatBy[champ.id].slice(-1)[0]; places.set(final, 2);
  // repechage: the finalists' earlier victims (not the semifinal losers) wrestle in order; the winner meets the semifinal loser of the other half
  const rep = fid => { const L = (beatBy[fid] || []).slice(0, -2 + (fid === champ.id ? 0 : 1)); let w = null; let k = 0; for (const id of L) { if (!w) { w = { id }; continue; } w = bout(G, rng, store, w, { id }, `${label} · Repechage`, kg, { lv: 6 + k, rl: 'Repechage', lb: `Repechage ${++k}` }).w; } return w; };
  const fins = [champ.id, final].map(fid => ({ fid, rw: rep(fid) }));
  const sl = semiL.map(x => x.id);
  // semifinal loser of each half: the one beaten by that half's finalist
  const slOf = fid => sl.find(id => (beatBy[fid] || []).includes(id));
  for (let k = 0; k < 2; k++) {
    const rw = fins[k].rw, other = slOf(fins[1 - k].fid);
    if (rw && other) { const x = bout(G, rng, store, rw, { id: other }, `${label} · Bronze`, kg, { lv: 9, rl: 'Bronze medal bouts', lb: 'Bronze' }); places.set(x.w.id, 3); places.set(x.l.id, 5); }
    else if (other) places.set(other, 3); else if (rw) places.set(rw.id, 3);
  }
  return order.map(id => ({ id, place: places.get(id) || 7 + (beatBy[id] ? 0 : 2) })).sort((x, y) => x.place - y.place);
}

function enterUS(G, rng, ev, kg, pEnter) {
  return (ev === 'farrell' ? rtcAthletes(G) : usAthletes(G)).filter(id => kgOf(G, id) === kg && (isMine(G, id) ? userEnters(G, ev, id) : rng.chance(pEnter(id))));
}
// AI entry odds: medalists with a Trials bye skip the opens; qualified athletes often skip the US Open
const hasBye = (G, id) => { const kg = kgOf(G, id); return G.fs.prev.team[kg] === id && G.fs.prev.medal[kg] > 0; };
const qualified = (G, id) => !!(G.fs.q && G.fs.q[id]) || Object.values(G.fs.prev.team).includes(id);

export function runFsEvent(G) {
  const fs = G.fs, ev = fs.step === 'roster' ? 'farrell' : fs.step; if (!EV_NAME[ev] && ev !== 'worlds') return;
  const rng = makeRng(G.seed + fsYear(G) * 104729 + ev.length * 31 + ev.charCodeAt(0));
  fs.step = ev; fs.q = fs.q || {}; CUR_EV = ev;
  const res = { kg: {}, bouts: [], year: fsYear(G), ev: ev === 'worlds' ? worldsKey(G) : ev };
  CUR_T = { ev: res.ev, wts: FS_WEIGHTS, result: { weights: {} }, snaps: {}, next: { farrell: 'open', open: 'trials', trials: 'worlds', worlds: 'done' }[ev] };
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
    for (const p of pl) { if (!isUSA(G, p.id)) continue; if (++n > FS_Q.trialsTop || p.place > 8) break; fs.q[p.id] = fs.q[p.id] || `${EV_NAME[ev]} ${p.place === 1 ? 'champion' : ordinal(p.place)}`; }
  }
  fs.ev[ev === 'worlds' ? worldsKey(G) : ev] = res;
  for (const kg of FS_WEIGHTS) CUR_T.result.weights[kg] = CUR_T.result.weights[kg] || { matches: [] };
  fs.live = CUR_T; CUR_T = null; initLive(fs.live);   // revealed round by round in the viewer (live.js); results above are already final
}
// the event's live record is open until it is closed: then the step moves on (after the Worlds / Olympics: the season-end work)
export const fsLiveOpen = G => !!(G.fs && G.fs.live && !G.fs.live.closed);
export function closeFsEvent(G) {
  const fs = G.fs, T = fs.live; if (!T || T.closed) return;
  T.closed = true; if (T.rv) T.rv.done = true;
  // results history per athlete (profiles): [year, event, kg, place] for every placer; at the Worlds also the US entry without a medal (9)
  const R = fs.ev[T.ev]; fs.res = fs.res || {};
  if (R) for (const kg in R.kg) { const r = R.kg[kg], seen = new Set();
    for (const p of r.places || []) { seen.add(p.id); (fs.res[p.id] = fs.res[p.id] || []).push([fs.year, T.ev, +kg, p.place]); }
    if (r.us && !seen.has(r.us.id)) (fs.res[r.us.id] = fs.res[r.us.id] || []).push([fs.year, T.ev, +kg, 9]);
    if (r.winner) (fs.res[r.winner] = fs.res[r.winner] || []).push([fs.year, 'team', +kg, 1]); }
  fs.step = T.next;
  if (T.next === 'done') endFsSeason(G);
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
  if (A && B) while (wins[A] < 2 && wins[B] < 2) { const x = bout(G, rng, store, { id: A }, { id: B }, `Trials · Final, match ${series.length + 1}`, kg, { c: 1, lv: 40 + series.length, rl: 'Final series (best of 3)', lb: `Final, match ${series.length + 1}` }); wins[x.w.id]++; series.push({ w: x.w.id, d: x.r.detail }); }
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
  const abroad = {}; for (const id of rtcAthletes(G)) { const c = natOf(G, id); if (c !== 'USA' && kgOf(G, id) === kg && !(G.wrestlers[id] && G.wrestlers[id].injury)) (abroad[c] = abroad[c] || []).push(id); }
  const best = code => [fs.intl[code][kg], ...(abroad[code] || [])].sort((x, y) => fsOvr(ath(G, y)) - fsOvr(ath(G, x)))[0];
  for (const c of cs) if (oly ? true : rng.chance(c[3])) ids.push(best(c[0]));
  let field = ids;
  if (oly) field = [ids[0], ...seedSort(G, ids.slice(1)).slice(0, 15).map(x => x.id)].filter(Boolean);   // Olympics: 16 qualified athletes
  formFor(G, rng, field);
  const pl = uwwBracket(G, rng, field, kg, store, oly ? 'Olympics' : 'Worlds');
  return { field: field.length, places: pl.filter(p => p.place <= 5).map(p => ({ id: p.id, place: p.place, name: ath(G, p.id).name, aff: affil(G, p.id), usa: isUSA(G, p.id) })),
    us: fs.team && fs.team[kg] ? { id: fs.team[kg], place: (pl.find(p => p.id === fs.team[kg]) || {}).place || null } : null };
}

// ---------- season end: honors, prestige, aging, retirements, next year's byes ----------
function endFsSeason(G) {
  const fs = G.fs, rng = makeRng(G.seed + fsYear(G) * 3571 + 9), wk = worldsKey(G), W = fs.ev[wk];
  const h = { year: fs.year, oly: isOlympic(G), team: {}, champs: {} };
  const hon = (id, f) => { const a = ath(G, id); const x = fs.honors[id] = fs.honors[id] || { name: a.name, aff: affil(G, id), usa: isUSA(G, id), gold: 0, silver: 0, bronze: 0, teams: 0, oly: 0, opens: 0, years: [] }; x.aff = affil(G, id); f(x); };
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
  seasonRecords(G);
  collegeCarry(G);
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
  // retired athletes are archived (records, Hall of Fame) and deleted (their honors stay by name); weight-move markers reset
  for (const id in G.fsw) { if (G.fsw[id].ret) { retireAth(G, id); delete G.fsw[id]; } else delete G.fsw[id]._kg0; }
  for (const id in fs.st) if (!G.fsw[id] && !G.wrestlers[id]) delete fs.st[id];
  for (const m of [fs.xs, fs.res]) for (const id in m || {}) if (!G.fsw[id] && !G.wrestlers[id]) delete m[id];   // college wrestlers who left without a senior career
  for (const id in G.wrestlers) delete G.wrestlers[id]._kg0;
  G.inbox.unshift({ week: G.week, title: `${fs.year} ${EV_NAME[wk]}`, body: worldsNote(G, h) });
}
// ---------- record books and Hall of Fame (separate from the college ones) ----------
const medals = x => (x ? x.gold + x.silver + x.bronze : 0);
export const hofWhy = x => { if (!x || !x.usa) return null; const og = x.years.some(s => s.includes('OG gold')); return og ? 'Olympic champion' : x.gold >= 2 ? `${x.gold}x World/Olympic champion` : medals(x) >= 4 ? `${medals(x)} World/Olympic medals` : null; };
// top-10 season lists: most wins, most tech falls
function seasonRecords(G) {
  const fs = G.fs, rec = fs.rec = fs.rec || { sw: [], stf: [] };
  const rows = Object.entries(fs.sy || {}).map(([id, x]) => { const a = ath(G, id); return a ? { id, name: a.name, aff: affil(G, id), usa: isUSA(G, id), year: fs.year, ...x } : null; }).filter(Boolean);
  rec.sw = rec.sw.concat(rows.filter(r => r.w >= 5)).sort((a, b) => b.w - a.w || a.l - b.l || b.tf - a.tf).slice(0, 10);
  rec.stf = rec.stf.concat(rows.filter(r => r.tf >= 3)).sort((a, b) => b.tf - a.tf || b.w - a.w).slice(0, 10);
}
// an athlete leaves for good: notable careers are kept for the career lists; US greats go into the Hall of Fame
function retireAth(G, id, a = ath(G, id)) {
  const fs = G.fs, st = (fs.st || {})[id], hon = (fs.honors || {})[id], usa = (a.ctry || a.nat || COLLEGE_NAT[a.name] || 'USA') === 'USA';
  if (st && usa && (st.w >= 15 || medals(hon))) {
    fs.arch = (fs.arch || []).concat([{ id, name: a.name, aff: hon ? hon.aff : affil(G, id), usa, ...st, ret: fs.year }]).sort((x, y) => y.w - x.w).slice(0, 60);
  }
  const why = hofWhy(hon);
  if (why && !(fs.hof || []).some(h => h.id === id)) (fs.hof = fs.hof || []).push({ cls: fs.year, id, name: a.name, aff: hon.aff, gold: hon.gold, silver: hon.silver, bronze: hon.bronze, oly: hon.oly, teams: hon.teams, opens: hon.opens, w: st ? st.w : 0, l: st ? st.l : 0, why });
  if (fs.st) delete fs.st[id];
}
// career leaders: active athletes (college or senior) plus the archive
// ---------- rankings (Freestyle page): results of the last two seasons (fs.res, written when an event closes, so no spoilers) + rating ----------
// score = result points (this season x1, last season x RANK.prev) + (FS OVR - RANK.base) x RANK.ovrK; best result per event counts
export const RANK = { pts: { worlds: [0, 14, 10, 8, 0, 5], olympics: [0, 16, 12, 9, 0, 6], open: [0, 4, 3, 2.5, 2, 1.5, 1.2, 1, 0.8], farrell: [0, 3, 2.2, 1.8, 1.5, 1.2, 1, 0.8, 0.6], trials: [0, 3, 2, 1.5, 1, 0.8, 0.6, 0.5, 0.4], team: [0, 4] },
  noMedal: 2, prev: 0.5, base: 16.5, ovrK: 3, college: 17.5 };
export function fsRankings(G, n = 10) {
  const fs = G.fs; if (!fs || !fs.init) return null;
  const ids = new Set(rtcAthletes(G));
  for (const code in fs.intl) for (const kg in fs.intl[code]) ids.add(fs.intl[code][kg]);
  for (const w of Object.values(G.wrestlers)) if (!w.gone && fsOvr(w) >= RANK.college) ids.add(w.id);   // college wrestlers good enough in freestyle, RTC or not
  const yr = Math.max(fs.year || 0, ...Object.values(fs.res || {}).flatMap(L => L.map(r => r[0])));   // the latest season with results
  const rows = [];
  for (const id of ids) {
    const a = ath(G, id); if (!a || a.ret || (G.wrestlers[id] && G.wrestlers[id].gone)) continue;
    let pts = 0, best = null;
    for (const [y, ev, kg, place] of (fs.res || {})[id] || []) {
      const k = y === yr ? 1 : y === yr - 1 ? RANK.prev : 0; if (!k) continue;
      const P = RANK.pts[ev] || [], p = place === 9 ? (ev === 'worlds' || ev === 'olympics' ? RANK.noMedal : 0) : P[place] || 0;
      pts += p * k;
      if (p * k > (best ? best.v : 0)) best = { v: p * k, y, ev, kg, place };
    }
    const ovr = fsOvr(a);
    rows.push({ id, name: a.name, kg: kgOf(G, id), usa: isUSA(G, id), nat: natOf(G, id), aff: affil(G, id), ovr, pts: Math.round(pts * 10) / 10, score: pts + (ovr - RANK.base) * RANK.ovrK, best });
  }
  const top = filter => Object.fromEntries(FS_WEIGHTS.map(kg => [kg, rows.filter(r => r.kg === kg && filter(r)).sort((x, y) => y.score - x.score).slice(0, n)]));
  return { year: yr, world: top(() => true), us: top(r => r.usa) };
}

export function careerRows(G) {
  const fs = G.fs, rows = [];
  for (const id in fs.st || {}) { const a = ath(G, id); if (a && isUSA(G, id)) rows.push({ id, name: a.name, aff: affil(G, id), usa: true, active: true, ...fs.st[id] }); }
  return rows.concat((fs.arch || []).filter(r => !rows.some(x => x.id === r.id)));
}
// college wrestlers who wrestled freestyle this summer: a little takedown / hand-fighting development, and an injury now and then.
// Most summer injuries heal by the fall; a serious one keeps him out of the first weeks of the college season. Own rng stream.
const FS_DEV = ['tdo', 'tdd', 'hand', 'speed', 'big'];
const SEVERE = ['torn meniscus', 'separated shoulder', 'torn ACL', 'broken wrist'];
export const FS_CARRY = { dev: 0.06, devMax: 2, severe: 0.3, weeks: [2, 10] };
function collegeCarry(G) {
  const fs = G.fs, rng = makeRng(G.seed + fsYear(G) * 6007 + 5), out = [];
  const cnt = { ...(fs.cb || {}), ...(fs.sy || {}) };
  for (const id of Object.keys(cnt).sort()) {
    const w = G.wrestlers[id]; if (!w || G.fsw[id] || w.gone) continue;
    const n = cnt[id].w + cnt[id].l, ups = [];
    for (let i = 0; i < n && ups.length < FS_CARRY.devMax; i++) if (rng.chance(FS_CARRY.dev)) { const k = rng.pick(FS_DEV); if (w.attrs[k] < Math.min(20, w.pot || 20)) { w.attrs[k]++; ups.push(k); } }
    let inj = null;
    for (let i = 0; i < n && !inj && !w.injury; i++) if (rng() < matchInjuryChance(w)) inj = rng.chance(FS_CARRY.severe) ? 'severe' : 'healed';
    if (inj === 'severe') { const weeks = rng.int(...FS_CARRY.weeks); w.injury = { what: rng.pick(SEVERE), weeks, total: weeks, start: 1, sev: 'severe', re: false, fs: true }; }
    if (ups.length || inj) out.push({ id, name: w.name, team: w.team, n, ups, inj, what: inj === 'severe' ? w.injury.what : null, weeks: inj === 'severe' ? w.injury.weeks : 0 });
  }
  fs.carry = out;
  const mine = out.filter(c => c.team === G.userTeam);
  if (mine.length) G.inbox.unshift({ week: G.week, title: 'Freestyle summer: your college wrestlers', body: mine.map(c => `${c.name}: ${[c.ups.length ? `improved (${c.ups.join(', ')})` : '', c.inj === 'severe' ? `${c.what}, out about ${c.weeks} week${c.weeks > 1 ? 's' : ''} into the season` : c.inj ? 'hurt, but healed over the summer' : ''].filter(Boolean).join('; ')}.`).join(' ') });
}
function worldsNote(G, h) {
  const med = Object.entries(h.team).filter(([, t]) => t.place && t.place <= 3);
  const mine = Object.entries(h.team).filter(([, t]) => rtcOf(G, t.id) === G.userTeam);
  return `US team: ${med.length} medal${med.length === 1 ? '' : 's'} (${med.map(([kg, t]) => `${t.name} ${kg} kg ${['', 'gold', 'silver', 'bronze'][t.place]}`).join(', ') || 'none'}).${mine.length ? ` Your RTC: ${mine.map(([kg, t]) => `${t.name} (${kg} kg${t.place ? ', ' + ordinal(t.place) : ''})`).join(', ')}.` : ''}${G.fs.payoff[G.userTeam] ? ` Prestige +${G.fs.payoff[G.userTeam]}.` : ''}`;
}

// run whatever is left (headless sims, or the user starting the season early)
export function finishFsSeason(G) {
  if (!fsOn(G)) return;
  if (fsLiveOpen(G)) closeFsEvent(G);
  let guard = 0; while (G.fs.step && G.fs.step !== 'done' && guard++ < 6) { runFsEvent(G); closeFsEvent(G); }
  delete G.fs.live;   // the brackets are only kept through the freestyle season
}
