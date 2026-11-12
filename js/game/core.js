// Game state and season logic. Pure data + functions (no DOM). State G is plain JSON so it can be saved.
import { simulateBout, ATTR_KEYS, OVR_W, OVR_W_LEGACY } from '../engine/bout.js';
import { makeRng } from '../engine/rng.js';
import { generateWrestler, WEIGHTS, ARCHETYPES } from '../data/gen.js';
import { SCHOOLS, CONFERENCES } from '../data/schools.js';
import { PRACTICE, INTENSITY, FOCUS_SHARES } from '../data/practice.js';
import { seasonCalendar, resolveTournaments } from '../data/tournaments.js';
import { pickDualField, makeDualSpec, DUAL_WEEK } from './dualtourney.js';
import { coachMoves } from './dualcoach.js';
import { REAL_TOP, TIER_OVR, REAL_NAMES_ENABLED } from '../data/realtop.js';
import { REAL_OVERRIDES } from '../data/overrides.js';
import { REAL_TEAMS } from '../data/realteams.js';
import { ncaaFloor } from '../data/ncaa2026.js';
import { runEvent, makeConfTournaments, computeNcaaField, completeSelection, finalizeSeason, recordTHist } from './tourney.js';
import { recordBout, updatePolls, flushStats, recordDual, ensureDualRatings, lineupProjection } from './stats.js';
import { generateRecruitClass, processRecruitingWeek, runWeeklyAuto } from './recruit.js';

// Calendar is per-season (G.cal): week 1 = first Saturday of November; tournaments follow weekday rules (see data/tournaments.js).
let CAL = seasonCalendar(2026);
export const useCalendar = G => { CAL = G.cal; };
export const CLASS_NAMES = ['', 'Fr', 'So', 'Jr', 'Sr'];
const SAVE_KEY = 'wrestlingCoach.save.v1';

// ---------- ratings ----------
const OVR_SUM = Object.values(OVR_W).reduce((a, b) => a + b, 0);
const OVR_SUM_LEGACY = Object.values(OVR_W_LEGACY).reduce((a, b) => a + b, 0);
// generation-time rating (old formula): keeps every generated attribute identical to before the 2026-11-09 OVR reweighting
export const overallLegacy = w => ATTR_KEYS.reduce((s, k) => s + w.attrs[k] * OVR_W_LEGACY[k], 0) / OVR_SUM_LEGACY;
export const overall = w => ATTR_KEYS.reduce((s, k) => s + w.attrs[k] * OVR_W[k], 0) / OVR_SUM;
// Accumulated fatigue lowers starting energy for a bout (fatigue 60 -> 89 energy, floor 70). Was 0.3 / floor 55 before the 2026-11-09 fatigue easing.
export const FATIGUE = { energyK: 0.18, energyFloor: 70, match: 4, tourneyBout: 2.5, lineupK: 0.012, tourneyDrain: 2, tourneyFloor: 50 };
export const startEnergy = w => Math.max(FATIGUE.energyFloor, 100 - (w.fatigue || 0) * FATIGUE.energyK);
export const ovr = w => Math.round(overall(w) * 10) / 10;

// ---------- helpers ----------
export const dateOfWeek = week => new Date(CAL.start + (week - 1) * 7 * 86400000);
export const fmtDate = week => dateOfWeek(week).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const teamName = (G, id) => G.teams[id].name;
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- new game ----------
export function newGame(userTeam, coach = 'Coach', seed = (Math.random() * 4294967296) >>> 0, opts = {}) {
  const rng = makeRng(seed);
  const G = { version: 4, recruits: {}, rec: { hours: 20, board: [] }, portal: [], nextRid: 0, alumni: [], cal: seasonCalendar(2026), tournaments: [], entries: {}, history: [], training: { focus: ['shots', 'tdd', 'conditioning'], intensity: 'normal' }, report: [], seed, coach, userTeam, season: 2026, week: 1, phase: 'season', teams: {}, wrestlers: {}, schedule: [], inbox: [], nextId: 1 };
  const archKeys = Object.keys(ARCHETYPES);
  for (const s of SCHOOLS) {
    const t = { id: s.id, name: s.name, conf: s.conf, prestige: s.prestige, region: s.region, acad: s.acad, state: s.state, incoming: [], roster: [], lineup: {}, plan: 'balanced' };
    const q0 = 9 + s.prestige / 100 * 6.5; // prestige 98 -> ~15.4, 40 -> ~11.6
    for (const wt of WEIGHTS) {
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const q = i === 0 ? q0 + rng.gauss() * 1.3 : q0 - 2 - i * 0.8 + rng.gauss() * 1.2;
        const w = generateWrestler(rng, { weight: wt, quality: q, archetype: rng.pick(archKeys), school: s.name });
        w.id = 'w' + G.nextId++; w.team = s.id; w.natural = wt; w.cls = rng.weighted([1, 2, 3, 4], c => (i === 0 ? [0.15, 0.25, 0.3, 0.3] : [0.35, 0.3, 0.22, 0.13])[c - 1]);
        delete w.plan; initDev(w, rng); G.wrestlers[w.id] = w; t.roster.push(w.id);
      }
    }
    G.teams[s.id] = t;
  }
  if (opts.real ?? REAL_NAMES_ENABLED) { applyRealTeams(G, rng); applyRealTop(G, rng); }
  for (const id in G.teams) distributeAid(G, id);
  for (const id in G.teams) G.teams[id].lineup = autoLineup(G, id);
  useCalendar(G);
  G.recruits = generateRecruitClass(G, rng);
  G.schedule = makeSchedule(G, rng);
  G.inbox.push({ week: 1, title: 'Welcome to ' + G.teams[userTeam].name, body: `The ${G.season}-${String(G.season + 1).slice(2)} season is underway, Coach ${coach}. Set your lineup, then press Continue to advance the calendar.` });
  return G;
}

// Build whole rosters from real data (data/realteams.js: WrestleStat starters with ratings + official roster pages for depth).
// Schools without data keep their generated roster (and still get the Flo top-16 overlay below).
function applyRealTeams(G, rng) {
  const archKeys = Object.keys(ARCHETYPES);
  for (const t of Object.values(G.teams)) {
    const raw = REAL_TEAMS[t.name]; if (!raw) continue;
    for (const id of t.roster) delete G.wrestlers[id];
    t.roster = [];
    const starters = {};
    for (const line of raw.split('\n')) {
      const [name, wtS, clsS, ovrS, stS, hm] = line.split('|'), wt = +wtS, ov = REAL_OVERRIDES[name], target = ov ? ov.ovr : Math.max(+ovrS, ncaaFloor(name, +wtS));   // 2026 NCAA placers are rated at least as high as their finish implies
      const w = generateWrestler(rng, { weight: wt, quality: target, archetype: rng.pick(archKeys), school: t.name, name });
      const delta = target - overallLegacy(w);                // pull the generated attributes onto the target rating (legacy formula: attributes unchanged)
      for (const k of ATTR_KEYS) w.attrs[k] = Math.max(1, Math.min(20, Math.round(w.attrs[k] + delta + rng.gauss() * 0.4)));
      if (ov) {   // hand-set rating: pin the listed attributes, then move the free ones until the overall hits the target (no rng, so nothing else shifts)
        const fixed = ov.set || {}; for (const k in fixed) w.attrs[k] = fixed[k];
        const free = ATTR_KEYS.filter(k => !(k in fixed));
        for (let it = 0; it < 400; it++) {
          const diff = ov.ovr - overall(w); if (Math.abs(diff) < 0.06) break;
          const cand = free.filter(k => (diff > 0 ? w.attrs[k] < 20 : w.attrs[k] > 1)); if (!cand.length) break;
          const k = cand.sort((x, y) => (diff > 0 ? w.attrs[x] - w.attrs[y] : w.attrs[y] - w.attrs[x]) || OVR_W[y] - OVR_W[x])[0];   // lift the lowest / lower the highest
          w.attrs[k] += diff > 0 ? 1 : -1;
        }
      }
      w.id = 'w' + G.nextId++; w.team = t.id; w.natural = wt; w.cls = +clsS; w.real = true; if (hm) w.hm = hm; delete w.plan;
      initDev(w, rng); G.wrestlers[w.id] = w; t.roster.push(w.id);
      if (stS === '1') starters[wt] = target;
    }
    // every weight needs at least two bodies: generated walk-ons just below the team's level
    const low = Math.min(...Object.values(starters), 12);
    for (const wt of WEIGHTS) {
      let have = t.roster.filter(id => G.wrestlers[id].natural === wt).length;
      while (have < 2) {
        const w = generateWrestler(rng, { weight: wt, quality: (starters[wt] ?? low) - 2.5 - have * 0.8, archetype: rng.pick(archKeys), school: t.name });
        w.id = 'w' + G.nextId++; w.team = t.id; w.natural = wt; w.cls = rng.int(1, 3); delete w.plan; initDev(w, rng);
        G.wrestlers[w.id] = w; t.roster.push(w.id); have++;
      }
    }
  }
}

// Overlay real ranked wrestlers (data/realtop.js) onto each school's best wrestler at that weight: real name + class, rating from rank tier.
function applyRealTop(G, rng) {
  const byName = Object.fromEntries(Object.values(G.teams).map(t => [t.name, t]));
  for (const r of REAL_TOP) {
    const t = byName[r.school]; if (!t || REAL_TEAMS[r.school]) continue;   // schools with full real rosters were built above
    const w = t.roster.map(id => G.wrestlers[id]).filter(x => x.natural === r.weight && !x.real).sort((a, b) => overall(b) - overall(a))[0];
    if (!w) continue;
    const delta = TIER_OVR[r.tier] - overallLegacy(w);
    for (const k of ATTR_KEYS) w.attrs[k] = Math.max(1, Math.min(20, Math.round(w.attrs[k] + delta + rng.gauss() * 0.8)));
    w.name = r.name; w.cls = r.cls; w.real = true; w.rank = r.tier; initDev(w, rng);
  }
}

// Development fields: hidden potential (ceiling for any attribute), work ethic, injury proneness; fatigue 0-100; injury; per-attr progress.
export function initDev(w, rng) {
  const base = overallLegacy(w), young = [0, 3, 2, 1, 0.5][w.cls] ?? 1;
  w.pot = Math.max(Math.round(base + 0.5), Math.min(20, Math.round(base + 0.8 + young + rng.gauss() * 1.6)));
  w.ethic = Math.max(3, Math.min(20, Math.round(11 + rng.gauss() * 3.5)));
  w.prone = Math.max(1, Math.min(20, Math.round(10 + rng.gauss() * 4)));
  w.fatigue = 0; w.injury = null; w.focus = null; w.prog = {}; w.sg = {};
  w.dev = Math.round(rng.gauss() * 100) / 100;   // hidden development trait: >0 tends to blossom, <0 tends to stall (offseason.js)
}
export const potLabel = w => (w.pot >= 18 ? 'Elite' : w.pot >= 16 ? 'High' : w.pot >= 13 ? 'Solid' : 'Limited');
export const ethicLabel = w => (w.ethic >= 16 ? 'Relentless' : w.ethic >= 12 ? 'Hard worker' : w.ethic >= 8 ? 'Average' : 'Coasts');

const MIN_DUALS = 10, MAX_DUALS = 14;   // duals per team per season
const EST_PER_EVENT = 4.5, MAX_LOAD = 33;   // projected matches for a starter = duals + 4.5 x (events + conference tournament)
const MAX_EVENTS = 4; // most open/major tournaments a team enters before its conference tournament and the NCAAs
export function makeSchedule(G, rng) {
  const ids = Object.keys(G.teams), cal = G.cal, played = new Set(), sched = [], attending = {};
  // Tournaments first. Real programs only enter a few events, and the stars of the sport are spread across the majors:
  //  - each team gets a season budget of 2-4 open/major events before conference and NCAAs (hard cap 4)
  //  - each event caps how many top-10 / top-25 programs it can have (majors: 4 / 8, opens: 1 / 3)
  //  - events are filled in random order so no event always gets first pick; only the NCAAs bring everyone together.
  // Attendees skip that week's duals.
  const dualField = pickDualField(G); attending[DUAL_WEEK] = new Set(dualField);   // National Dual Tournament (top 16 prestige): those teams are busy in week 2
  const prank = {}; [...ids].sort((a, b) => G.teams[b].prestige - G.teams[a].prestige).forEach((id, i) => { prank[id] = i + 1; });
  // elite programs (top-10 prestige) enter 2-3 events, everyone else 3-4
  const budget = {}, used = {}; for (const id of ids) { budget[id] = prank[id] <= 10 ? 2 + rng.int(0, 1) : 3 + rng.int(0, 1); used[id] = 0; }
  const defs = resolveTournaments(G.season, cal), built = new Array(defs.length);
  const order = shuffle(defs.map((_, i) => i), rng);
  for (const i of order) {
    const r = defs[i], att = (attending[r.week] = attending[r.week] || new Set());
    const major = r.tier === 'major', n = major ? rng.int(22, 30) : rng.int(10, 16), lim = major ? { top10: 4, top25: 8 } : { top10: 1, top25: 3 };
    const key = id => { const t = G.teams[id]; const wgt = major ? 0.3 + t.prestige / 100 * 1.2 : 0.5 + (r.confs.includes(t.conf) ? 2 : 0) + (1 - t.prestige / 100) * 0.5; return Math.pow(rng(), 1 / wgt); };
    const cands = ids.filter(id => !att.has(id)).map(id => ({ id, k: key(id) })).sort((x, y) => y.k - x.k).map(x => x.id);
    const teams = [], cnt = { top10: 0, top25: 0 };
    const tierOk = id => (prank[id] <= 10 ? cnt.top10 < lim.top10 : prank[id] <= 25 ? cnt.top25 < lim.top25 : true);
    const take = id => { teams.push(id); used[id]++; if (prank[id] <= 10) cnt.top10++; else if (prank[id] <= 25) cnt.top25++; };
    for (const id of cands) { if (teams.length >= n) break; if (used[id] < budget[id] && tierOk(id)) take(id); }
    for (const id of cands) { if (teams.length >= Math.ceil(n * 0.75)) break; if (!teams.includes(id) && used[id] < MAX_EVENTS && tierOk(id)) take(id); } // budgets exhausted: top up from teams that still have room in the tier caps
    teams.forEach(id => att.add(id));
    built[i] = { id: 't' + i, name: r.name, kind: 'open', tier: r.tier, loc: r.loc, dates: r.dates, week: r.week, teams, done: false, result: null };
  }
  G.tournaments = built;
  // every team gets at least 2 events: put under-booked teams into the emptiest open events they are free for (small programs, region first)
  for (const id of ids) {
    while (used[id] < (prank[id] <= 10 ? 2 : 3)) {
      const t = built.filter(x => !x.teams.includes(id) && !attending[x.week].has(id) && (prank[id] > 10 || x.teams.filter(i => prank[i] <= 10).length < (x.tier === 'major' ? 4 : 1)))
        .map(x => ({ x, k: x.teams.length - (defs[+x.id.slice(1)].confs.includes(G.teams[id].conf) ? 6 : 0) + rng() })).sort((p, q) => p.k - q.k)[0];
      if (!t) break;
      t.x.teams.push(id); attending[t.x.week].add(id); used[id]++;
    }
  }
  G.tournaments.push(...makeConfTournaments(G, CONFERENCES), makeDualSpec(G, dualField, cal));
  for (let week = 1; week <= cal.lastDualWeek; week++) {
    const pool = shuffle(ids.filter(id => !(attending[week] && attending[week].has(id)) && rng.chance(0.88)), rng), used = new Set();
    for (const t of pool) {
      if (used.has(t)) continue;
      const cands = pool.filter(o => o !== t && !used.has(o) && !played.has([t, o].sort().join('|')));
      const wantConf = week > 8;
      const pref = cands.filter(o => (G.teams[o].conf === G.teams[t].conf) === wantConf);
      const list = pref.length ? pref : cands;
      if (!list.length) continue;
      const o = rng.pick(list);
      used.add(t); used.add(o); played.add([t, o].sort().join('|'));
      sched.push({ id: 'd' + sched.length, week, a: t, b: o, done: false, result: null, conf: G.teams[t].conf === G.teams[o].conf });
    }
  }
  // ----- balance: every team ends up with MIN_DUALS..MAX_DUALS duals, so a starter's season lands around 18-35 matches (duals + 2-4 events + conference tournament) -----
  const busy = {}, mark = (wk, id) => (busy[wk] ||= new Set()).add(id), key2 = (x, y) => [x, y].sort().join('|');
  for (const wk in attending) attending[wk].forEach(id => mark(wk, id));
  for (const d of sched) { mark(d.week, d.a); mark(d.week, d.b); }
  const count = Object.fromEntries(ids.map(id => [id, 0])); for (const d of sched) { count[d.a]++; count[d.b]++; }
  const drop = d => { sched.splice(sched.indexOf(d), 1); count[d.a]--; count[d.b]--; busy[d.week].delete(d.a); busy[d.week].delete(d.b); played.delete(key2(d.a, d.b)); };
  for (const id of shuffle(ids, rng)) {                                             // trim over-booked teams (prefer non-conference duals, and opponents who can spare one)
    while (count[id] > MAX_DUALS) {
      const mine = sched.filter(d => (d.a === id || d.b === id) && count[d.a === id ? d.b : d.a] > MIN_DUALS);
      const d = mine.find(x => !x.conf) || mine[0]; if (!d) break; drop(d);
    }
  }
  const weeks = Array.from({ length: cal.lastDualWeek }, (_, i) => i + 1);
  for (const id of shuffle(ids, rng)) {                                             // fill under-booked teams in their free weeks
    for (const wk of shuffle(weeks, rng)) {
      if (count[id] >= MIN_DUALS) break;
      if (busy[wk] && busy[wk].has(id)) continue;
      const ok = o => o !== id && count[o] < MAX_DUALS && !(busy[wk] && busy[wk].has(o)) && !played.has(key2(id, o));
      let cands = ids.filter(o => ok(o) && (G.teams[o].conf === G.teams[id].conf) === (wk > 8));
      if (!cands.length) cands = ids.filter(ok);
      if (!cands.length) continue;
      const o = cands.sort((x, y) => count[x] - count[y])[0];
      sched.push({ id: '', week: wk, a: id, b: o, done: false, result: null, conf: G.teams[id].conf === G.teams[o].conf });
      mark(wk, id); mark(wk, o); played.add(key2(id, o)); count[id]++; count[o]++;
    }
  }
  // load rule: a starter wrestles ~1 match per dual and ~4.5 per event (conference tournament included). Over-loaded teams drop their biggest open event.
  for (const id of ids) {
    while (count[id] + EST_PER_EVENT * (used[id] + 1) > MAX_LOAD && used[id] > (prank[id] <= 10 ? 2 : 3)) {
      const mine = built.filter(x => x.kind === 'open' && x.teams.includes(id)).sort((x, y) => y.teams.length - x.teams.length)[0]; if (!mine) break;
      mine.teams.splice(mine.teams.indexOf(id), 1); attending[mine.week].delete(id); busy[mine.week] && busy[mine.week].delete(id); used[id]--;
    }
  }
  sched.sort((x, y) => x.week - y.week); sched.forEach((d, i) => { d.id = 'd' + i; });
  return sched;
}

// ---------- lineups ----------
// Scholarship split: top 10 wrestlers 75%, next 8 at 30% (= 9.9 equivalencies).
export function distributeAid(G, tid) {
  const ws = G.teams[tid].roster.map(id => G.wrestlers[id]).sort((a, b) => overall(b) - overall(a));
  ws.forEach((w, i) => { w.aid = i < 10 ? 0.75 : i < 18 ? 0.3 : 0; });
}

// Eligibility rule: a wrestler may compete at his natural weight or ONE class above it (a bump up, his natural weight is unchanged).
// He can never compete below his natural weight; getting there means a completed weight-cut (startWeightMove), which changes `natural`.
export function canWrestle(w, weight) { const d = WEIGHTS.indexOf(weight) - WEIGHTS.indexOf(w.natural); return d === 0 || d === 1; }
// Clear any slot whose wrestler is gone, on another team, or not allowed at that weight (also one slot per wrestler). Returns how many were cleared.
export function sanitizeLineup(G, teamId) {
  const t = G.teams[teamId], seen = new Set(); let bad = 0;
  for (const wt of WEIGHTS) {
    const id = t.lineup[wt], w = id && G.wrestlers[id];
    if (id && (!w || w.team !== teamId || !canWrestle(w, wt) || seen.has(id))) { t.lineup[wt] = null; bad++; }
    else if (id) seen.add(id);
  }
  return bad;
}

// Best healthy lineup. Considers fatigue (rest a worn-down starter when a fresher option is close) and bumping a wrestler one class up/down.
export function autoLineup(G, teamId, opts = {}) {
  const t = G.teams[teamId], tired = opts.noRest ? 0 : FATIGUE.lineupK;
  const ws = t.roster.map(id => G.wrestlers[id]).filter(w => !w.injury);
  const cand = [];
  WEIGHTS.forEach((wt, i) => {
    for (const w of ws) {
      if (!canWrestle(w, wt)) continue;   // natural weight, or bumped UP one class; never down
      const base = w.natural === wt ? overall(w) : overall(wrestlerAt(G, w.id, wt)) - 0.2;
      cand.push({ wt, id: w.id, s: base - (w.fatigue || 0) * tired });
    }
  });
  cand.sort((a, b) => b.s - a.s);
  const lineup = {}, used = new Set();
  for (const c of cand) { if (lineup[c.wt] || used.has(c.id)) continue; lineup[c.wt] = c.id; used.add(c.id); }
  for (const wt of WEIGHTS) if (!lineup[wt]) lineup[wt] = null;
  return lineup;
}
// A wrestler competing off his natural weight is a bit worse (cut or bump).
// Penalty (rating points) for wrestling one class above his natural weight in an event, about -0.65 OVR. A trained weight move up is ~ -0.03 OVR.
export const BUMP = { str: 3, cardio: 2, speed: 2, tdd: 1 };
export function wrestlerAt(G, wid, weight) {
  const w = G.wrestlers[wid], a = { ...w.attrs };
  // (illegal weights are prevented at lineup level; an entry that was legal when the field was set is allowed to finish the event)
  if (w.natural !== weight) for (const [k, v] of Object.entries(BUMP)) a[k] = Math.max(1, a[k] - v);   // wrestling up a class for one event: a real penalty (a trained weight move gives +1 str, -1 speed instead)
  // competing hurt: physical attributes -2, the rest -1
  if (w.injury) for (const k of ATTR_KEYS) a[k] = Math.max(1, a[k] - (['str', 'cardio', 'speed', 'flex'].includes(k) ? 2 : 1));
  return { ...w, weight, attrs: a };
}

// ---------- dual meets ----------
const BONUS = { 'Fall': 3, 'Tech Fall': 2, 'Major Decision': 1 };
// A dual is simulated BOUT BY BOUT so coaches can change lineups in the middle of it (see dualcoach.js):
//   beginDual -> d.prog (working lineups, who has wrestled, score, lineup changes) and d.result.bouts grows as stepDual runs; the dual is done after 10 bouts.
// playDual = the whole dual at once (AI duals, skipped weeks, tournament sims). The user's team gets assistant-coach moves there unless G.assist === false.
export function beginDual(G, d) {
  if (d.prog || d.done) return d;
  const rng = makeRng(G.seed + d.week * 7919 + d.id.length * 31 + parseInt(d.id.slice(1), 10) * 104729);
  for (const t of [G.teams[d.a], G.teams[d.b]]) if (t.id !== G.userTeam) t.lineup = autoLineup(G, t.id); else sanitizeLineup(G, t.id);   // AI teams re-optimize every dual
  const start = rng.int(0, WEIGHTS.length - 1);
  d.order = WEIGHTS.map((_, k) => WEIGHTS[(start + k) % WEIGHTS.length]);
  const lineA = { ...G.teams[d.a].lineup }, lineB = { ...G.teams[d.b].lineup };
  d.prog = { k: 0, sa: 0, sb: 0, bonA: 0, bonB: 0, lineA, lineB, origA: { ...lineA }, origB: { ...lineB }, usedA: [], usedB: [], subs: [], seedBase: rng.int(1, 2e9) };
  d.result = { sa: 0, sb: 0, winner: null, tiebreak: false, bouts: [], subs: d.prog.subs };
  return d;
}
// opts.assist: the user's team also gets assistant-coach moves (AI teams always coach themselves)
export function stepDual(G, d, opts = {}) {
  if (d.done) return d.result;
  if (!d.prog) beginDual(G, d);
  const P = d.prog, k = P.k, wt = d.order[k], userInvolved = d.a === G.userTeam || d.b === G.userTeam;
  // the user's team is coached by the assistant only in a dual that is simulated without the user entering it (P.manual = the user opened the dual screen)
  for (const side of ['A', 'B']) { const tid = side === 'A' ? d.a : d.b; if (tid === G.userTeam && !(opts.assist && G.assist !== false && !P.manual)) continue; coachMoves(G, d, side); }
  const A = G.teams[d.a], B = G.teams[d.b], ia = P.lineA[wt] || null, ib = P.lineB[wt] || null;
  const bout = { wt, wa: ia, wb: ib };
  if (ia && ia !== P.origA[wt]) bout.subA = true;
  if (ib && ib !== P.origB[wt]) bout.subB = true;
  if (ia && ib) {
    const wa = wrestlerAt(G, ia, wt), wb = wrestlerAt(G, ib, wt);
    const seed = (P.seedBase + k * 7919) % 2000000000 + 1, eA = startEnergy(wa), eB = startEnergy(wb);
    const userSide = d.a === G.userTeam ? 'A' : d.b === G.userTeam ? 'B' : null, choices = opts.choices || null;   // choices = the user's start-of-period picks for his own wrestler (watched bouts)
    const r = simulateBout(wa, wb, { seed, planA: A.plan, planB: B.plan, energyA: eA, energyB: eB, userSide, choices });
    recordBout(G, ia, ib, wt, r);
    Object.assign(bout, { w: r.winner, m: r.method, d: r.detail, tp: r.teamPoints, sA: r.score.A, sB: r.score.B, na: wa.name, nb: wb.name });
    if (userInvolved) Object.assign(bout, { seed, eA, eB, planA: A.plan, planB: B.plan, snapA: { name: wa.name, school: wa.school, weight: wt, attrs: wa.attrs }, snapB: { name: wb.name, school: wb.school, weight: wt, attrs: wb.attrs }, userSide, choices });
  } else if (ia || ib) {
    const w = ia ? 'A' : 'B';
    Object.assign(bout, { w, m: 'Forfeit', d: 'Forfeit', tp: 6, sA: 0, sB: 0, na: ia ? G.wrestlers[ia].name : '—', nb: ib ? G.wrestlers[ib].name : '—' });
  } else { Object.assign(bout, { w: null, m: 'Vacant', d: 'No contest', tp: 0, sA: 0, sB: 0, na: '—', nb: '—' }); }
  if (ia) P.usedA.push(ia);
  if (ib) P.usedB.push(ib);
  if (bout.w === 'A') { P.sa += bout.tp; P.bonA += BONUS[bout.m] || 0; } else if (bout.w === 'B') { P.sb += bout.tp; P.bonB += BONUS[bout.m] || 0; }
  d.result.bouts.push(bout); d.result.sa = P.sa; d.result.sb = P.sb; P.k++;
  if (P.k >= d.order.length) {
    const sa = P.sa, sb = P.sb, bonA = P.bonA, bonB = P.bonB;
    const winner = sa > sb ? 'A' : sb > sa ? 'B' : bonA > bonB ? 'A' : bonB > bonA ? 'B' : (makeRng(P.seedBase + 1).chance(0.5) ? 'A' : 'B');
    d.done = true; d.result.winner = winner; d.result.tiebreak = sa === sb; recordDual(G, d);
    if (!userInvolved) d.result.bouts = d.result.bouts.map(({ wt, wa, wb, w, m, d: dd, tp, subA, subB }) => ({ wt, wa, wb, w, m, d: dd, tp, subA, subB }));
    delete d.prog;
  }
  return d.result;
}
// ---- watching a bout of a live dual with a say in the start-of-period choices ----
// The bout is simulated up front (so the dual always has a result), then re-run from the same seed with the user's picks as he makes them:
// snapshot the dual before the bout, restore it, and step the bout again with `choices`. Choices use no rng, so everything before the choice repeats exactly.
export function watchSnapshot(G, d) { beginDual(G, d); return { prog: JSON.stringify(d.prog), result: JSON.stringify(d.result), done: !!d.done, sq: (G.sq || []).length }; }
export function redoBout(G, d, snap, choices) {
  d.prog = JSON.parse(snap.prog); d.result = JSON.parse(snap.result); d.result.subs = d.prog.subs; d.done = snap.done; if (G.sq) G.sq.length = snap.sq;
  const k = d.prog.k; stepDual(G, d, { assist: false, choices });
  return d.result.bouts[k];
}
export function playDual(G, d) {
  if (d.done) return d.result;
  beginDual(G, d);
  while (!d.done) stepDual(G, d, { assist: true });
  return d.result;
}
// the user's own lineup change between bouts: put `newId` (null = forfeit the weight) at a weight that has not wrestled yet
export function userSub(G, d, wt, newId) {
  const P = d.prog; if (!P) return { ok: false, msg: 'The dual is over.' };
  const side = d.a === G.userTeam ? 'A' : 'B', line = P['line' + side], used = P['used' + side], rem = d.order.slice(P.k);
  if (!rem.includes(wt)) return { ok: false, msg: 'That weight has already wrestled.' };
  if ((line[wt] || null) === (newId || null)) return { ok: true };
  if (newId) {
    const w = G.wrestlers[newId];
    if (!w || w.team !== G.userTeam) return { ok: false, msg: 'He is not on your roster.' };
    if (used.includes(newId)) return { ok: false, msg: `${w.name} has already wrestled in this dual.` };
    if (w.injury) return { ok: false, msg: `${w.name} is injured.` };
    if (!canWrestle(w, wt)) return { ok: false, msg: `${w.name} cannot wrestle at ${wt} (natural weight or one class up only).` };
    const at = rem.find(x => x !== wt && line[x] === newId);
    if (at) return { ok: false, msg: `${w.name} is already slotted at ${at}; replace him there first.` };
  }
  const out = line[wt] || null; line[wt] = newId || null;
  P.subs.push({ k: P.k, tid: G.userTeam, wt, out, in: newId || null, why: 'coach' });
  return { ok: true };
}
// who the user may send out at a weight right now (healthy, has not wrestled, legal, not slotted at another remaining weight)
export function subOptions(G, d, wt) {
  const P = d.prog; if (!P) return [];
  const side = d.a === G.userTeam ? 'A' : 'B', line = P['line' + side], used = P['used' + side], rem = d.order.slice(P.k);
  return G.teams[G.userTeam].roster.map(id => G.wrestlers[id]).filter(w => w.id === line[wt] || (!w.injury && !used.includes(w.id) && canWrestle(w, wt) && !rem.some(x => line[x] === w.id)))
    .sort((a, b) => (b.natural === wt) - (a.natural === wt) || overall(b) - overall(a));
}

export function replayBout(b) {
  return simulateBout({ ...b.snapA, plan: b.planA }, { ...b.snapB, plan: b.planB }, { seed: b.seed, planA: b.planA, planB: b.planB, energyA: b.eA, energyB: b.eB, userSide: b.userSide, choices: b.choices });
}

export const userDual = G => G.schedule.find(d => d.week === G.week && (d.a === G.userTeam || d.b === G.userTeam)) || null;
export const teamEvents = (G, id) => G.schedule.filter(d => d.a === id || d.b === id).sort((x, y) => x.week - y.week);
export const teamTournaments = (G, id) => G.tournaments.filter(t => t.teams.includes(id)).sort((x, y) => x.week - y.week);
export function userEvent(G) {
  const d = userDual(G); if (d) return { type: 'dual', ref: d, done: d.done };
  const t = G.tournaments.find(x => x.week === G.week && x.teams.includes(G.userTeam));
  return t ? { type: 'tourney', ref: t, done: t.done } : null;
}
export function playEvent(G, t, opts) { return runEvent(G, t, opts); }

// Called when the user is done with the current week: sim everyone else's events, then advance.
export function finishWeek(G) {
  const w = G.week, cal = G.cal;
  for (const d of G.schedule) if (d.week === w && !d.done && d.a !== G.userTeam && d.b !== G.userTeam) playDual(G, d);
  const mine = G.schedule.find(d => d.week === w && d.done && (d.a === G.userTeam || d.b === G.userTeam));
  if (mine) {
    const home = mine.a === G.userTeam, my = home ? mine.result.sa : mine.result.sb, th = home ? mine.result.sb : mine.result.sa;
    const opp = G.teams[home ? mine.b : mine.a].name, won = (mine.result.winner === 'A') === home;
    G.inbox.unshift({ week: w, title: `${won ? 'Win' : 'Loss'}: ${won ? 'beat' : 'fell to'} ${opp} ${my}-${th}`, body: `Week ${w} dual meet.` });
  }
  for (const t of G.tournaments.filter(x => x.week === w && !x.done)) {
    runEvent(G, t);
    if (t.teams.includes(G.userTeam) && t.kind !== 'dual') {
      const r = t.result, idx = r.teamScores.findIndex(x => x.team === G.userTeam), aa = r.userPlaces.filter(p => p.place <= 8).length, ch = r.userPlaces.filter(p => p.place === 1).length;
      G.inbox.unshift({ week: w, title: `${t.name}: team finish #${idx + 1} of ${r.teamScores.length}`, body: `${r.teamScores[idx]?.pts ?? 0} points, ${ch} champion${ch === 1 ? '' : 's'}, ${aa} placer${aa === 1 ? '' : 's'}. Winner: ${G.teams[r.teamScores[0].team].name}.` });
    }
  }
  for (const t of G.tournaments) if (t.week === w) recordTHist(G, t);   // keep winners for the tournament profile
  const ncaa = G.tournaments.find(x => x.kind === 'ncaa' && x.week === w);
  if (ncaa && ncaa.done) finalizeSeason(G, ncaa);
  flushStats(G); // apply this week's queued results (user's and AI events) before the weekly poll
  updatePolls(G);
  if (w === cal.confWeek) computeNcaaField(G);   // after this week's results are in stats: the committee uses records/ratings; revealed in selection week
  if (w === cal.selWeek) completeSelection(G);   // no-op if the user already watched the show
  if (w <= cal.lastWeek) { runWeeklyAuto(G); processRecruitingWeek(G); }
  runTraining(G);
  G.week++;
  pruneReplays(G);
  if (G.week > cal.lastWeek) { G.phase = 'seasonEnd'; }
}

// Skip ahead several weeks: your duals and tournaments are simulated, recruiting runs under the chosen mode, results land in the inbox.
// recruit: 'auto' (AI logic) | 'repeat' (last week's plan) | 'none' (hours are lost) | 'keep' (your "Every week" setting).
// pause: stop before a week where YOUR team has a tournament (so you can run it round by round).
export function skipToWeek(G, target, opts = {}) {
  const { recruit = 'auto', pause = true } = opts, cal = G.cal;
  target = Math.min(target, cal.lastWeek + 1);
  const sum = { from: G.week, to: G.week, weeks: 0, duals: [0, 0], tourneys: [], paused: null };
  const oldMode = G.rec.mode;
  G.rec.mode = recruit === 'none' ? 'manual' : recruit === 'keep' ? oldMode : recruit;
  try {
    while (G.phase === 'season' && G.week < target) {
      const ev = userEvent(G);
      if (ev && !ev.done && ev.type === 'tourney' && pause) { sum.paused = ev.ref; break; }
      if (ev && !ev.done) {
        if (ev.type === 'dual') { const r = playDual(G, ev.ref), home = ev.ref.a === G.userTeam; sum.duals[(r.winner === 'A') === home ? 0 : 1]++; }
        else { const res = runEvent(G, ev.ref), idx = res.teamScores.findIndex(x => x.team === G.userTeam); sum.tourneys.push(ev.ref.kind === 'dual' ? `${ev.ref.name}: ${idx < 0 ? 'not entered' : `finished ${res.teamScores[idx].place === 1 ? 'first' : '#' + res.teamScores[idx].place}`}` : `${ev.ref.name}: ${idx < 0 ? 'no team points' : `#${idx + 1} with ${res.teamScores[idx].pts} pts`}`); }
      }
      finishWeek(G); sum.weeks++;
    }
  } finally { G.rec.mode = oldMode; }
  sum.to = G.week;
  if (sum.weeks) G.inbox.unshift({ week: G.week, title: `Skipped ${sum.weeks} week${sum.weeks === 1 ? '' : 's'} (now week ${G.week})`, body: [`Duals ${sum.duals[0]}-${sum.duals[1]}.`, ...sum.tourneys, sum.paused ? `Paused before ${sum.paused.name}: your team is entered.` : '', `Recruiting during the skip: ${{ auto: 'full auto', repeat: "repeat last week's plan", none: 'none (hours lost)', keep: 'your weekly setting' }[recruit]}.`].filter(Boolean).join(' ') });
  return sum;
}

// Keep only box scores once an event is over: drop replay data (seeds, attribute snapshots) from past weeks to keep saves small.
const REPLAY_KEYS = ['snapA', 'snapB', 'seed', 'eA', 'eB', 'planA', 'planB'];
function pruneReplays(G) {
  const strip = b => { for (const k of REPLAY_KEYS) delete b[k]; };
  for (const d of G.schedule) if (d.done && d.week < G.week && d.result) d.result.bouts.forEach(strip);
  for (const t of G.tournaments) {
    if (!t.done || !t.result || t.week >= G.week) continue;
    t.result.userBouts.forEach(strip);
    if (t.duals) t.duals.forEach(d => d.result && d.result.bouts.forEach(strip));   // dual tournaments keep box scores only
    delete t.rv; for (const wt in t.result.weights) { delete t.result.weights[wt].matches; delete t.result.weights[wt].ent; }   // brackets are only kept until the week moves on
    if (t.kind === 'conf' && G.ncaa) for (const wt in t.result.weights) delete t.result.weights[wt].all;
  }
}

// ---------- standings & rankings ----------
export function records(G) {
  const r = {};
  for (const id in G.teams) r[id] = { id, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 };
  for (const d of G.schedule.concat(...G.tournaments.map(t => t.duals || []))) {   // dual-tournament duals count toward records too
    if (!d.done) continue;
    const win = d.result.winner === 'A' ? d.a : d.b, lose = win === d.a ? d.b : d.a;
    r[win].w++; r[lose].l++;
    if (d.conf) { r[win].cw++; r[lose].cl++; }
    r[d.a].pf += d.result.sa; r[d.a].pa += d.result.sb; r[d.b].pf += d.result.sb; r[d.b].pa += d.result.sa;
  }
  return r;
}
export function teamStrength(G, id) {
  const t = G.teams[id], vals = WEIGHTS.map(wt => (t.lineup[wt] ? overall(G.wrestlers[t.lineup[wt]]) : 5));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
// DUAL rankings: team rating that starts the season from the starting lineups' weight-class poll ranks and then moves only with dual results (stats.js).
export function rankings(G) {
  ensureDualRatings(G);
  const rec = records(G);
  return Object.keys(G.teams).map(id => ({ id, power: G.teams[id].drate, ...rec[id] })).sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1)).map((x, i) => ({ ...x, rank: i + 1 }));
}
// TOURNAMENT rankings: projected NCAA team points from each starter's weight-class poll rank (stats.js RANK_PTS); ties broken by dual rating.
export function tournamentRankings(G) {
  ensureDualRatings(G);
  return Object.keys(G.teams).map(id => { const p = lineupProjection(G, id); return { id, proj: p.pts, ranks: p.ranks, ranked: p.ranked, top8: p.top8, drate: G.teams[id].drate }; })
    .sort((a, b) => b.proj - a.proj || b.drate - a.drate).map((x, i) => ({ ...x, rank: i + 1 }));
}

// ---------- save / load ----------
export function saveGame(G) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); return true; } catch (e) { return false; } }
export function hydrate(raw) { const G = migrate(raw); for (const id in G.teams) sanitizeLineup(G, id); useCalendar(G); return G; }
export function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); return s ? hydrate(JSON.parse(s)) : null; } catch (e) { return null; } }
function migrate(G) {
  if (G.version < 3) {
    G.cal = seasonCalendar(G.season || 2026); G.tournaments = makeConfTournaments(G, CONFERENCES); G.entries = {}; G.history = []; G.version = 3;
    if (G.phase === 'seasonEnd' && G.week <= G.cal.lastWeek) G.phase = 'season';
  }
  if (G.version < 4) {
    const rng = makeRng(G.seed ^ 0x2f6b);
    for (const sch of SCHOOLS) if (G.teams[sch.id]) { G.teams[sch.id].region = sch.region; G.teams[sch.id].acad = sch.acad; G.teams[sch.id].state = sch.state; G.teams[sch.id].incoming = []; }
    for (const id in G.teams) distributeAid(G, id);
    G.rec = { hours: 20, board: [] }; G.portal = []; G.nextRid = 0; G.alumni = []; G.version = 4;
    G.recruits = G.phase === 'seasonEnd' ? {} : generateRecruitClass(G, rng);
  }
  if (G.version >= 2 && G.training) return G;
  const rng = makeRng(G.seed ^ 0x5bd1e995);
  for (const id in G.wrestlers) initDev(G.wrestlers[id], rng);
  G.training = { focus: ['shots', 'tdd', 'conditioning'], intensity: 'normal' }; G.report = []; G.version = 2;
  return G;
}
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

// ---------- training, fatigue, injuries (runs once per week when the user finishes the week) ----------
const INJURIES = {
  minor: ['jammed finger', 'bruised ribs', 'sprained ankle', 'sore shoulder', 'minor concussion check'],
  moderate: ['knee sprain', 'rib injury', 'shoulder strain', 'high ankle sprain', 'concussion'],
  severe: ['torn meniscus', 'separated shoulder', 'torn ACL', 'broken wrist'],
};
export const INJURY_INFO = {
  'jammed finger': 'Jammed finger. Taped up; mostly a nuisance and quick to clear.',
  'bruised ribs': 'Bruised ribs. Painful on the mat, needs a few days off.',
  'sprained ankle': 'Sprained ankle. Limits his movement and shots until it settles.',
  'sore shoulder': 'Sore shoulder. Overuse soreness, usually clears quickly.',
  'minor concussion check': 'Concussion protocol check. Cleared after symptom-free rest.',
  'knee sprain': 'Knee ligament sprain. Several weeks of rehab before shots feel right.',
  'rib injury': 'Rib injury (cartilage or strain). Painful in the clinch and on the mat.',
  'shoulder strain': 'Shoulder strain. Weakens hand fighting and bottom defence.',
  'high ankle sprain': 'High ankle sprain. Slow to heal and easy to re-aggravate.',
  'concussion': 'Concussion. Mandatory graduated return-to-play protocol.',
  'torn meniscus': 'Torn meniscus. Long layoff, often needs surgery.',
  'separated shoulder': 'Separated shoulder. Long layoff and a lingering weak spot.',
  'torn ACL': 'Torn ACL. Season-ending surgery and a long rehab.',
  'broken wrist': 'Broken wrist. Cast and a long layoff before gripping again.',
};
// After an injury heals there is a rehab window with a raised injury chance that fades out (bigger and longer for worse injuries).
export const REHAB = { minor: { weeks: 2, bonus: 0.4 }, moderate: { weeks: 4, bonus: 0.8 }, severe: { weeks: 8, bonus: 1.2 } };
export const AGGRAVATE = 0.35; // chance per week of wrestling hurt that he adds 1-3 weeks to the injury
export const reinjuryMult = w => (w.rehab ? 1 + REHAB[w.rehab.sev].bonus * (w.rehab.left / w.rehab.total) : 1);
export const matchInjuryChance = w => 0.012 * (0.6 + w.prone / 20 * 0.9) * reinjuryMult(w);
export const durability = w => (w.prone >= 15 ? 'Injury-prone' : w.prone >= 11 ? 'Slightly fragile' : w.prone >= 7 ? 'Average' : 'Durable');
const ATTR_SHORT = { str: 'Strength', cardio: 'Cardio', speed: 'Speed', flex: 'Flexibility', tdo: 'Takedown Off.', tdd: 'Takedown Def.', hand: 'Hand Fighting', topc: 'Top Control', topt: 'Top Turning', botEsc: 'Bottom Control', botRes: 'Bottom Resist.', big: 'Big Moves', comp: 'Composure', iq: 'IQ' };
export const coachFactor = t => 0.85 + t.prestige / 100 * 0.4;

// AI teams train their three weakest areas at normal intensity (easing off when worn down).
export function aiPlan(G, teamId) {
  const t = G.teams[teamId], ws = Object.values(t.lineup).filter(id => id && G.wrestlers[id]).map(id => G.wrestlers[id]);
  const cands = Object.entries(PRACTICE).filter(([k, p]) => !p.recover && k !== 'live' && k !== 'flexibility');
  const score = ([k, p]) => ws.reduce((s, w) => s + Object.entries(p.attrs).reduce((a, [at, wt]) => a + w.attrs[at] * wt, 0), 0) / Math.max(1, ws.length);
  const focus = cands.sort((a, b) => score(a) - score(b)).slice(0, 3).map(c => c[0]);
  const fat = ws.reduce((s, w) => s + w.fatigue, 0) / Math.max(1, ws.length), w = G.week, cal = G.cal;
  let intensity = fat > 60 ? 'light' : 'normal';
  if (G.phase === 'season') {
    const toConf = cal.confWeek - w, toNcaa = cal.ncaaWeek - w;
    if (toConf <= 1 && toConf >= 0 || toNcaa <= 1 && toNcaa >= 0) intensity = 'light';        // taper
    else if (w <= 7 && fat < 45) intensity = 'hard';                                          // early-season build
  }
  if (fat > 70) focus[2] = 'recovery';
  return { focus, intensity };
}

export const SEASON_RATE = 0.27, SEASON_CAP = 2;   // in-season gain per week (x intensity, coach, ethic, class); max points per attribute per season
function trainWrestler(G, w, t, plan, rng, isUser) {
  const I = INTENSITY[plan.intensity] || INTENSITY.normal, coach = coachFactor(t);
  // Share table: team focus slots, optionally overridden 70/30 by an individual focus.
  const slots = {};
  plan.focus.forEach((k, i) => { slots[k] = (slots[k] || 0) + FOCUS_SHARES[i] * (w.focus ? 0.3 : 1); });
  if (w.focus) slots[w.focus] = (slots[w.focus] || 0) + 0.7;
  let fatLoad = 0, injLoad = 0, recov = 0;
  for (const [k, sh] of Object.entries(slots)) { const p = PRACTICE[k]; fatLoad += sh * p.fat; injLoad += sh * p.inj; if (p.recover) recov += sh; }
  const ethicF = 0.6 + w.ethic / 20 * 0.8, classF = [0, 1.2, 1.0, 0.85, 0.7][w.cls] ?? 1;
  if (!w.injury) {
    for (const [k, sh] of Object.entries(slots)) {
      for (const [at, aw] of Object.entries(PRACTICE[k].attrs)) {
        // In-season practice = small, steady boosts to the trained attributes only: never past potential, at most SEASON_CAP points per attribute per season.
        const sg = (w.sg ||= {});
        if (w.attrs[at] >= w.pot || w.attrs[at] >= 20 || (sg[at] || 0) >= SEASON_CAP) continue;
        const head = Math.min(1, (w.pot - w.attrs[at]) / 3);
        w.prog[at] = (w.prog[at] || 0) + SEASON_RATE * I.gain * sh * aw * coach * ethicF * classF * head;
        while (w.prog[at] >= 1 && w.attrs[at] < w.pot && (sg[at] || 0) < SEASON_CAP) {
          w.prog[at] -= 1; w.attrs[at]++; sg[at] = (sg[at] || 0) + 1;
          if (isUser) G.report.push({ id: w.id, at, to: w.attrs[at] });
        }
      }
    }
  }
  // fatigue: practice load up, weekly recovery down (more with recovery focus)
  w.fatigue = Math.max(0, Math.min(100, w.fatigue + I.fat * (w.injury ? 0.3 : fatLoad) - 9 - w.fatigue * 0.15 - recov * 18));
  if (!w.injury) {
    const p = 0.006 * (1 + w.fatigue / 45) * (0.6 + w.prone / 20 * 0.9) * injLoad * I.inj * reinjuryMult(w);
    if (rng() < p) giveInjury(G, w, rng, isUser, 'in practice');
  }
}

export function giveInjury(G, w, rng, isUser, where) {
  const r = rng(), sev = r < 0.55 ? 'minor' : r < 0.88 ? 'moderate' : 'severe';
  const weeks = sev === 'minor' ? rng.int(1, 2) : sev === 'moderate' ? rng.int(3, 6) : rng.int(7, 14);
  const re = !!w.rehab, out = weeks + (re ? 1 : 0);
  w.rehab = null;
  w.injury = { what: rng.pick(INJURIES[sev]), weeks: out, total: out, start: G.week, sev, re };
  if (isUser) {
    G.inbox.unshift({ week: G.week, title: `${re ? 'Re-injury' : 'Injury'}: ${w.name} (${w.natural})`, body: `${w.name} ${re ? 'hurt himself again with' : 'suffered'} a ${w.injury.what} ${where}. Out about ${out} week${out > 1 ? 's' : ''} (${sev}).` });
    (G.injLog ||= []).unshift({ season: G.season, week: G.week, id: w.id, name: w.name, wt: w.natural, what: w.injury.what, sev, weeks: out, re });
    if (G.injLog.length > 40) G.injLog.length = 40;
  }
}

export function runTraining(G) {
  const rng = makeRng(G.seed + G.week * 31337 + 17);
  G.report = [];
  const wrestled = new Set();
  for (const d of G.schedule) {
    if (d.week !== G.week || !d.done) continue;
    for (const b of d.result.bouts) if (b.m !== 'Forfeit' && b.m !== 'Vacant') { if (b.wa) wrestled.add(b.wa); if (b.wb) wrestled.add(b.wb); }
  }
  for (const id in G.teams) {
    const t = G.teams[id], isUser = id === G.userTeam, plan = isUser ? G.training : aiPlan(G, id);
    for (const wid of t.roster) {
      const w = G.wrestlers[wid], wasInjured = !!w.injury;
      if (!wasInjured && w.rehab && --w.rehab.left <= 0) w.rehab = null;
      if (wrestled.has(wid) && w.injury && rng() < AGGRAVATE) { const extra = rng.int(1, 3); w.injury.weeks += extra; if (isUser) G.inbox.unshift({ week: G.week, title: `${w.name} aggravated his injury`, body: `Wrestling hurt cost him ${extra} more week${extra > 1 ? 's' : ''} (now ${w.injury.weeks}).` }); }
      if (wrestled.has(wid)) { w.fatigue = Math.min(100, w.fatigue + FATIGUE.match); if (!w.injury && rng() < matchInjuryChance(w)) giveInjury(G, w, rng, isUser, 'in competition'); }
      trainWrestler(G, w, t, plan, rng, isUser);
      if (w.move && !w.injury && !(w.move.weeks <= 1 && G.week >= G.cal.confWeek && G.week <= G.cal.ncaaWeek)) { w.move.weeks--; w.fatigue = Math.min(100, w.fatigue + (w.move.dir === 'down' ? 5 : 2)); if (w.move.weeks <= 0) completeMove(G, w, t, isUser); }
      if (wasInjured && w.injury) {
        w.injury.weeks--;
        if ((plan.focus.includes('recovery') || w.focus === 'recovery') && rng() < 0.5) w.injury.weeks--;
        if (w.injury.weeks <= 0) { const sv = w.injury.sev; w.rehab = { what: w.injury.what, sev: sv, left: REHAB[sv].weeks, total: REHAB[sv].weeks }; w.injury = null; if (isUser) G.inbox.unshift({ week: G.week, title: `Back: ${w.name}`, body: `${w.name} is healthy and available again, but has a raised re-injury risk for about ${REHAB[sv].weeks} weeks.` }); }
      }
    }
    if (!isUser) { if (G.week <= G.cal.lastDualWeek - 6 && rng() < 0.2) aiWeightMove(G, t, rng); t.lineup = autoLineup(G, id); }
  }
  // user lineup: replace any injured starter automatically (and say so)
  sanitizeLineup(G, G.userTeam);
  const ut = G.teams[G.userTeam], best = autoLineup(G, G.userTeam);
  for (const wt of WEIGHTS) {
    const cur = ut.lineup[wt];
    if (cur && G.wrestlers[cur].injury && !G.wrestlers[cur].playHurt) {
      const rep = best[wt] && !Object.values(ut.lineup).includes(best[wt]) ? best[wt] : null;
      ut.lineup[wt] = rep;
      G.inbox.unshift({ week: G.week, title: `Lineup change at ${wt}`, body: `${G.wrestlers[cur].name} is injured. ${rep ? G.wrestlers[rep].name + ' moves into the lineup.' : 'No healthy replacement, so the slot will be a forfeit.'}` });
    }
  }
  if (G.report.length) {
    const top = G.report.slice(0, 8).map(r => `${G.wrestlers[r.id].name} ${ATTR_SHORT[r.at]} to ${r.to}`);
    G.inbox.unshift({ week: G.week, title: `Training report: ${G.report.length} improvement${G.report.length > 1 ? 's' : ''}`, body: top.join(' · ') + (G.report.length > 8 ? ' …' : '') });
  }
}

// ---------- weight-class moves (max ONE per wrestler per season; takes ~5 weeks of cutting/gaining) ----------
export const canMove = (G, w) => !w.injury && !w.move && w.movedSeason !== G.season;
export function startWeightMove(G, wid, dir) {
  const w = G.wrestlers[wid], i = WEIGHTS.indexOf(w.natural), to = WEIGHTS[i + (dir === 'down' ? -1 : 1)];
  if (!w || !to || !canMove(G, w)) return false;
  w.move = { dir, to, weeks: 5 }; return true;
}
export const cancelWeightMove = (G, wid) => { G.wrestlers[wid].move = null; };
function completeMove(G, w, t, isUser) {
  const old = w.natural; w.natural = w.move.to; w.movedSeason = G.season;
  if (w.move.dir === 'down') { w.attrs.str = Math.max(1, w.attrs.str - 1); w.attrs.cardio = Math.max(1, w.attrs.cardio - 1); w.attrs.speed = Math.min(20, w.attrs.speed + 1); }
  else { w.attrs.str = Math.min(20, w.attrs.str + 1); w.attrs.speed = Math.max(1, w.attrs.speed - 1); }
  w.move = null;
  if (isUser) {
    if (t.lineup[old] === w.id) { t.lineup[old] = null; if (!t.lineup[w.natural]) t.lineup[w.natural] = w.id; }
    G.inbox.unshift({ week: G.week, title: `${w.name} is now a ${w.natural}`, body: `${w.name} finished moving from ${old} to ${w.natural}. Check your lineup.` });
  }
}
// AI: fill a hole (or upgrade a clearly weaker starter) by moving a spare wrestler from an adjacent class.
function aiWeightMove(G, t, rng) {
  const starters = new Set(Object.values(t.lineup).filter(Boolean));
  let best = null;
  for (const wt of WEIGHTS) {
    const cur = t.lineup[wt] ? overall(G.wrestlers[t.lineup[wt]]) : 0, i = WEIGHTS.indexOf(wt);
    for (const id of t.roster) {
      const w = G.wrestlers[id];
      if (starters.has(id) || !canMove(G, w)) continue;
      const d = WEIGHTS.indexOf(w.natural) - i;
      if (Math.abs(d) !== 1) continue;
      const gain = overall(w) - 0.4 - cur;
      if (gain > 1.5 && (!best || gain > best.gain)) best = { w, dir: d > 0 ? 'down' : 'up', gain };
    }
  }
  if (best) startWeightMove(G, best.w.id, best.dir);
}
