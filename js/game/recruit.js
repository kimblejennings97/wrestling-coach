// Recruiting: HS class generation, scouting uncertainty, scholarship (aid) accounting, user actions, AI recruiting, commit decisions,
// and the transfer portal. All state lives in G (plain JSON): G.recruits, G.rec, G.portal.
import { makeRng } from '../engine/rng.js';
import { ATTR_KEYS } from '../engine/bout.js';
import { generateWrestler, WEIGHTS, ARCHETYPES, randomName } from '../data/gen.js';
import { STATE_NQ, STATE_REGION, stateBoost } from '../data/states.js';
import { overall, autoLineup } from './core.js';
import { retire } from './legacy.js';

export const AID_CAP = 9.9;
export const WEEKLY_HOURS = 20;
const STAR_PRES = { 5: 92, 4: 76, 3: 58, 2: 45, 1: 35 };           // prestige a team needs to be a realistic suitor
const STAR_AID = { 5: 0.75, 4: 0.5, 3: 0.25, 2: 0.25, 1: 0 };        // typical AI scholarship offer by star level
const AI_TARGETS = 4;                                               // new recruits each AI team works per week
const STATES = Object.keys(STATE_NQ);
const sig = x => 1 / (1 + Math.exp(-x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; };

// ---------- aid accounting ----------
export const teamAidUsed = (G, tid) => {
  const t = G.teams[tid];
  let used = 0;
  for (const id of t.roster) { const w = G.wrestlers[id]; if (w.cls < 4 || G.phase === 'offseason') used += w.aid || 0; } // seniors' aid frees up at graduation
  for (const rid of t.incoming || []) used += G.recruits[rid]?.offers[tid] ?? 0;
  for (const p of G.portal || []) if (p.signed === tid) used += p.aidGiven || 0;
  return used;
};
export const aidAvailable = (G, tid) => Math.max(0, +(AID_CAP - teamAidUsed(G, tid)).toFixed(2));
export const pendingOffers = (G, tid) => Object.values(G.recruits).filter(r => r.status === 'open' && r.offers[tid] != null).reduce((s, r) => s + r.offers[tid], 0);

// ---------- weight-class room ----------
// A program only brings in so many recruits per weight: at most MAX_INCOMING_PER_WT in one class, and
// (returning non-seniors at that weight + incoming) can't exceed MAX_AT_WT. Enforced when he commits.
export const MAX_INCOMING_PER_WT = 2;
export const MAX_AT_WT = 4;
export const MAX_CLASS = 8;  // total recruits in one signing class
export const ROSTER_MAX = 30; // NCAA roster limit: enforced at the end of the year (cut-down), not while recruiting
// These limits are SOFT-CAPS FOR THE AI ONLY (they stop top programs hoarding recruits). The user has no cap while recruiting:
// they cut down to ROSTER_MAX in the offseason and the cuts go to the transfer portal.
export function weightSlots(G, tid, wt) {
  const t = G.teams[tid]; let inc = 0, cur = 0, ret = 0;
  for (const rid of t.incoming || []) if (G.recruits[rid]?.weight === wt) inc++;
  for (const id of t.roster) { const w = G.wrestlers[id]; if (w.cls < 4) ret++; if (w.natural === wt && w.cls < 4) cur++; }
  const total = (t.incoming || []).length;
  return { inc, cur, total, proj: ret + total, room: inc < MAX_INCOMING_PER_WT && cur + inc < MAX_AT_WT && total < MAX_CLASS && ret + total < ROSTER_MAX };
}
export const projectedRoster = (G, tid) => weightSlots(G, tid, WEIGHTS[0]).proj;   // returning non-seniors + incoming recruits
const pendingByWt = (open, tid) => { const m = {}; for (const r of open) if (r.offers[tid] != null) m[r.weight] = (m[r.weight] || 0) + 1; return m; };
export const aiHasRoom = (G, tid, wt) => weightSlots(G, tid, wt).room;                       // the AI's soft caps (also used by the user's auto-recruiting)
export const hasWeightRoom = (G, tid, wt) => tid === G.userTeam || aiHasRoom(G, tid, wt);   // the user is never blocked

// ---------- roster cut-down (offseason) ----------
// incoming freshmen (w.fresh: signed recruits who just joined) count toward the 30 but can never be cut
// (AI teams may still cut a signed freshman as a last resort so they stay at the limit)
const cuttable = (G, tid) => G.teams[tid].roster.filter(id => tid !== G.userTeam || !G.wrestlers[id].fresh);
export const cutsNeeded = G => (G.phase === 'offseason' && G.off && G.off.step === 'cut' ? Math.max(0, Math.min(G.teams[G.userTeam].roster.length - ROSTER_MAX, cuttable(G, G.userTeam).length)) : 0);
export const portalAsk = w => (w.pot >= 15 ? 0.75 : w.pot >= 13 ? 0.5 : 0.25);
// Release a wrestler into the transfer portal.
export function cutToPortal(G, tid, id) {
  const t = G.teams[tid], w = G.wrestlers[id];
  if (!w || !t.roster.includes(id) || (w.fresh && tid === G.userTeam)) return false;
  t.roster = t.roster.filter(x => x !== id);
  for (const k of Object.keys(t.lineup || {})) if (t.lineup[k] === id) delete t.lineup[k];
  w.team = null; w.formerTeam = tid; w.move = null; w.focus = null;
  (G.portal = G.portal || []).push({ id, ask: portalAsk(w), offers: {}, interest: {}, signed: null, aidGiven: 0, from: tid, cut: true });
  return true;
}
// How much a coach wants to keep him (current ability + upside for the young; starters protected).
const keepValue = (G, t, w, starters) => overall(w) + Math.max(0, w.pot - overall(w)) * (w.cls <= 2 ? 0.45 : 0.15) + (starters.has(w.id) ? 6 : 0);
export function autoCut(G, tid, max = ROSTER_MAX) {
  const t = G.teams[tid], cut = [];
  const lu = Object.keys(t.lineup || {}).length ? t.lineup : autoLineup(G, tid), starters = new Set(Object.values(lu));
  while (t.roster.length > max) {
    const wt = {}; for (const id of t.roster) { const n = G.wrestlers[id].natural; wt[n] = (wt[n] || 0) + 1; }
    const able = cuttable(G, tid).map(id => G.wrestlers[id]); if (!able.length) break;   // only incoming freshmen left: nothing more to cut
    const pool = able.filter(w => wt[w.natural] > 2);   // keep at least two bodies per weight where possible
    const list = (pool.length ? pool : able).sort((a, b) => keepValue(G, t, a, starters) - keepValue(G, t, b, starters));
    cutToPortal(G, tid, list[0].id); cut.push(list[0].id);
  }
  return cut;
}

// ---------- scouting (what the user can see) ----------
const noiseK = [1, 0.5, 0.2, 0];
export const estOvr = r => overall(r) + r.noise * noiseK[r.scout];
export const estPot = r => r.pot + r.noise * noiseK[r.scout] * 0.8;
export const potWord = p => (p >= 17.5 ? 'Elite' : p >= 15.5 ? 'High' : p >= 13 ? 'Solid' : 'Limited');
export const shownAttr = (r, k) => (r.scout >= 3 ? r.attrs[k] : r.scout === 2 ? clamp(Math.round(r.attrs[k] + (hash(r.id + k) - 0.5) * 3), 1, 20) : null);

// ---------- class generation ----------
export function generateRecruitClass(G, rng) {
  const out = {}, archKeys = Object.keys(ARCHETYPES), list = [];
  for (const wt of WEIGHTS) {
    for (let i = 0; i < 34; i++) {
      const state = rng.weighted(STATES, s => STATE_NQ[s]);   // weighted by real 2025 NCAA qualifiers per state
      const w = generateWrestler(rng, { weight: wt, quality: 10.9 + stateBoost(state) + rng.gauss() * 2.1, archetype: rng.pick(archKeys), school: 'HS', spread: 1.6 });
      const ov = overall(w);
      const pot = clamp(Math.round(ov + 1.2 + rng() * 4.2 + (rng() < 0.08 ? 2 : 0)), Math.round(ov), 20);
      const needs = { pres: 0.4 + rng() * 1.2, pt: 0.4 + rng() * 1.2, acad: 0.3 + rng() * 1.2, loc: 0.3 + rng() * 1.2, aid: 0.4 + rng() * 1.2 };
      const sum = Object.values(needs).reduce((a, b) => a + b, 0); for (const k in needs) needs[k] /= sum;
      list.push({ name: w.name, weight: wt, state, region: STATE_REGION[state], arch: w.archetype, attrs: w.attrs, pot, needs, noise: rng.gauss() * 2.2, star: ov + 0.35 * (pot - ov) + rng.gauss() * 1.0 });
    }
  }
  list.sort((a, b) => b.star - a.star);
  list.forEach((c, i) => {
    const id = 'r' + (G.nextRid = (G.nextRid || 0) + 1);
    const stars = i < 12 ? 5 : i < 52 ? 4 : i < 152 ? 3 : i < 272 ? 2 : 1;
    out[id] = { id, name: c.name, weight: c.weight, state: c.state, region: c.region, arch: c.arch, attrs: c.attrs, pot: c.pot, needs: c.needs, noise: c.noise, stars, rank: i + 1,
      decideWeek: rng.int(4, G.cal.lastDualWeek), interest: {}, offers: {}, scout: 0, status: 'open', team: null, year: G.season + 1 };
  });
  return out;
}

// ---------- fit / decision model ----------
// How good a shot at the lineup would this recruit have next year? 1 = open spot, 0 = buried.
export function nextBest(G, t, wt) {
  let best = 0;
  for (const id of t.roster) { const w = G.wrestlers[id]; if (w.natural === wt && w.cls < 4) best = Math.max(best, overall(w)); }
  for (const rid of t.incoming || []) { const r = G.recruits[rid]; if (r && r.weight === wt) best = Math.max(best, overall(r)); }
  return best;
}
export const ptScore = (G, t, ov, wt) => clamp((ov - nextBest(G, t, wt) + 3) / 7, 0.05, 1);
export function fit(G, r, tid, offerAid) {
  const t = G.teams[tid], n = r.needs;
  const f = n.pres * (t.prestige / 100) + n.pt * ptScore(G, t, overall(r), r.weight) + n.acad * (t.acad / 20) + n.loc * (t.state === r.state ? 1 : t.region === r.region ? 0.6 : 0.2) + n.aid * clamp(offerAid ?? 0, 0, 1);
  return f * 60 + (r.interest[tid] || 0) * 0.45;
}

// ---------- user actions ----------
const hoursLeft = G => G.rec.hours;
export function scout(G, rid) {
  const r = G.recruits[rid], cost = r.scout >= 2 ? 2 : 1;
  if (r.scout >= 3 || hoursLeft(G) < cost) return false;
  r.scout++; G.rec.hours -= cost; return true;
}
export function contact(G, rid, rng) {
  const r = G.recruits[rid]; if (hoursLeft(G) < 2) return false;
  const cur = r.interest[G.userTeam] || 0;
  r.interest[G.userTeam] = Math.min(100, cur + Math.round((5 + rng() * 4) * (1 - cur / 130) * (1 + G.teams[G.userTeam].prestige / 250)));
  G.rec.hours -= 2; r.touch = G.week; return true;
}
export function visit(G, rid, rng) {
  const r = G.recruits[rid]; if (hoursLeft(G) < 6 || (r.interest[G.userTeam] || 0) < 20) return false;
  const cur = r.interest[G.userTeam] || 0;
  r.interest[G.userTeam] = Math.min(100, cur + Math.round((16 + rng() * 6) * (1 - cur / 160)));
  G.rec.hours -= 6; r.touch = G.week; (r.once = r.once || {}).visit = true; return true;
}
export function offer(G, rid, frac) {
  const r = G.recruits[rid], free = aidAvailable(G, G.userTeam) - pendingOffers(G, G.userTeam) + (r.offers[G.userTeam] || 0);
  if (frac > free + 1e-9) return false;
  if (r.offers[G.userTeam] == null) r.interest[G.userTeam] = Math.min(100, (r.interest[G.userTeam] || 0) + 8);
  r.offers[G.userTeam] = frac; r.touch = G.week; addTarget(G, rid); return true;
}
export const withdraw = (G, rid) => { delete G.recruits[rid].offers[G.userTeam]; };

// ---------- target board + weekly actions (NCAA-football-style recruiting loop) ----------
export const BOARD_MAX = 25;
export const PITCH_TOPICS = { pres: 'Program prestige', pt: 'Playing time', acad: 'Academics', loc: 'Close to home', aid: 'Scholarship money' };
// hour cost, interest range, weekly-repeatable?, minimum current interest
export const ACTIONS = {
  dm:    { label: 'Social media DM', hours: 1, min: 0,  note: 'Cheap, small bump.' },
  call:  { label: 'Phone call',      hours: 2, min: 0,  note: 'Reliable interest gain.' },
  pitch: { label: 'Sell a pitch',    hours: 3, min: 0,  note: 'Big gain if you pitch what he cares about and your school delivers it.' },
  visit: { label: 'Campus visit',    hours: 6, min: 20, note: 'Once per recruit per season. Needs 20+ interest.', once: true },
  home:  { label: 'Home visit',      hours: 8, min: 40, note: 'Once per recruit per season. Needs 40+ interest.', once: true },
};
export const boardOf = G => (G.rec.board = G.rec.board || []);
export const onBoard = (G, rid) => boardOf(G).includes(rid);
export function addTarget(G, rid) {
  const b = boardOf(G);
  if (b.includes(rid)) return { ok: true };
  if (b.length >= BOARD_MAX) return { ok: false, msg: `Board is full (${BOARD_MAX}). Remove someone first.` };
  b.push(rid); return { ok: true };
}
export const removeTarget = (G, rid) => { G.rec.board = boardOf(G).filter(x => x !== rid); };
export function clearClosedTargets(G) {
  G.rec.board = boardOf(G).filter(id => { const r = G.recruits[id]; return r && r.status === 'open'; });
}
// how well does MY school deliver on each thing a recruit might care about (0..1)?
export function teamStrengths(G, r, tid) {
  const t = G.teams[tid], off = r.offers[tid];
  return { pres: t.prestige / 100, pt: ptScore(G, t, overall(r), r.weight), acad: t.acad / 20, loc: t.state === r.state ? 1 : t.region === r.region ? 0.6 : 0.2, aid: off != null ? clamp(off, 0, 1) : 0 };
}
const thisWeek = (G, r) => { if (!r.done || r.done.w !== G.week) r.done = { w: G.week, t: [] }; return r.done.t; };
export const doneThisWeek = (G, r, type) => !!r.done && r.done.w === G.week && r.done.t.includes(type);
export function actionBlock(G, r, type) {   // why can't I do this right now? ('' = can)
  const a = ACTIONS[type], cur = r.interest[G.userTeam] || 0;
  if (r.status !== 'open') return 'He is no longer available.';
  if (G.rec.hours < a.hours) return `Needs ${a.hours}h (you have ${G.rec.hours}h).`;
  if (cur < a.min) return `Needs ${a.min}+ interest (he is at ${cur}).`;
  if (a.once ? (r.once || {})[type] : doneThisWeek(G, r, type)) return a.once ? 'Already done this season.' : 'Already done this week.';
  return '';
}
// Perform a target action. Returns { ok, msg, gain }.
export function doAction(G, rid, type, rng, topic) {
  const r = G.recruits[rid], a = ACTIONS[type], tid = G.userTeam, cur = r.interest[tid] || 0;
  const block = actionBlock(G, r, type); if (block) return { ok: false, msg: block };
  let gain, msg;
  if (type === 'dm') gain = 2 + rng() * 2.5;
  else if (type === 'call') gain = (5 + rng() * 4) * (1 + G.teams[tid].prestige / 250);
  else if (type === 'visit') gain = 16 + rng() * 6;
  else if (type === 'home') gain = 13 + rng() * 6;
  else {   // pitch
    if (!PITCH_TOPICS[topic]) return { ok: false, msg: 'Pick something to pitch.' };
    if (topic === 'aid' && r.offers[tid] == null) return { ok: false, msg: 'Make a scholarship offer before you pitch the money.' };
    const care = Math.min(1, r.needs[topic] * 2.5), deliver = teamStrengths(G, r, tid)[topic];
    gain = 2 + 11 * care * deliver;
    const react = care * deliver;
    msg = react >= 0.55 ? `${PITCH_TOPICS[topic]} landed — he lit up.` : react >= 0.25 ? `${PITCH_TOPICS[topic]}: he listened politely.` : care < 0.45 ? `${PITCH_TOPICS[topic]} isn't a big deal to him.` : `${PITCH_TOPICS[topic]} matters to him, but ${G.teams[tid].name} doesn't stack up.`;
  }
  // diminishing returns as interest climbs
  gain = Math.max(1, Math.round(gain * (1 - cur / (type === 'visit' || type === 'home' ? 160 : 130))));
  r.interest[tid] = Math.min(100, cur + gain);
  G.rec.hours -= a.hours; r.touch = G.week;
  if (a.once) (r.once = r.once || {})[type] = true; else thisWeek(G, r).push(type);
  if (type === 'pitch') { (r.pitched = r.pitched || {})[topic] = true; r.known = true; }
  (G.rec.cur = G.rec.cur || []).push({ rid, type, topic });   // this week's plan, for "repeat last week"
  return { ok: true, gain, msg: msg || `${a.label}: +${gain} interest.` };
}
// Where do I stand against the rivals he's actually considering? (display only)
export function standing(G, r) {
  const me = G.userTeam, mine = r.interest[me] || 0;
  if (r.status === 'committed') return r.team === me ? 'Committed to you' : 'Lost';
  if (r.status !== 'open') return 'Closed';
  if (!mine && r.offers[me] == null) return 'Not engaged';
  const myFit = fit(G, r, me, r.offers[me] ?? 0.5);
  let best = -1;
  for (const tid of new Set([...Object.keys(r.interest), ...Object.keys(r.offers)])) if (tid !== me && (r.offers[tid] != null || r.interest[tid] >= 15)) best = Math.max(best, fit(G, r, tid, r.offers[tid] ?? STAR_AID[r.stars]));
  if (best < 0) return 'Leading';
  const d = myFit - best; return d >= 3 ? 'Leading' : d >= -3 ? 'Neck and neck' : 'Trailing';
}
export const coolingWeeks = (G, r) => ((r.interest[G.userTeam] || 0) > 0 && r.touch != null ? G.week - r.touch : 0);

// ---------- weekly processing (AI actions + commitments) ----------
function commit(G, r, tid, why) {
  const t = G.teams[tid];
  let aid = r.offers[tid] ?? 0;
  if (tid !== G.userTeam) aid = Math.min(aid, aidAvailable(G, tid));
  r.offers[tid] = aid; r.status = 'committed'; r.team = tid;
  (t.incoming = t.incoming || []).push(r.id);
  if (tid === G.userTeam) G.inbox.unshift({ week: G.week, title: `Commit! ${r.name} (${r.weight}, ${r.stars}★) picks ${t.name}`, body: `${why} ${aid ? `Scholarship: ${Math.round(aid * 100)}%.` : 'Walk-on / no aid.'}` });
  else if ((r.interest[G.userTeam] || 0) >= 15 || r.offers[G.userTeam] != null) G.inbox.unshift({ week: G.week, title: `Lost: ${r.name} (${r.weight}, ${r.stars}★) commits to ${t.name}`, body: 'One of your recruiting targets chose another program.' });
}

// How attractive a recruit is as a target for a program (the AI's weekly ranking; auto-recruit uses the same function).
export function targetScore(G, tid, r, rng) {
  const t = G.teams[tid], pt = ptScore(G, t, overall(r), r.weight), attain = sig((t.prestige - STAR_PRES[r.stars]) / 9);
  return ((r.star ?? (overall(r) + 0.35 * (r.pot - overall(r)))) / 20) * (0.3 + pt) * attain + (hash(tid + r.id) - 0.5) * 0.14 + rng() * 0.06;
}

export function processRecruitingWeek(G) {
  const rng = makeRng(G.seed + G.week * 7717 + 3);
  const open = Object.values(G.recruits).filter(r => r.status === 'open');
  const ids = Object.keys(G.teams).filter(id => id !== G.userTeam);
  // AI teams: pick targets, build interest, make offers
  for (const tid of ids) {
    const t = G.teams[tid];
    // Only chase recruits at weights where there is still room, and who haven't been offered yet (keep rotating down the list).
    const pend = pendingByWt(open, tid), roomAt = {};
    for (const wt of WEIGHTS) roomAt[wt] = aiHasRoom(G, tid, wt) &&(pend[wt] || 0) < MAX_INCOMING_PER_WT + 1;
    const scored = open.filter(r => r.offers[tid] == null && roomAt[r.weight]).map(r => ({ r, s: targetScore(G, tid, r, rng) })).sort((a, b) => b.s - a.s).slice(0, AI_TARGETS);
    for (const { r } of scored) {
      r.interest[tid] = Math.min(100, (r.interest[tid] || 0) + Math.round((4 + rng() * 5) * (1 + t.prestige / 200)));
      if (r.interest[tid] >= 26 && r.offers[tid] == null) {
        const want = STAR_AID[r.stars], avail = aidAvailable(G, tid);
        const give = Math.min(want, Math.floor(avail * 4) / 4);
        if (give >= want - 0.26 && (want === 0 || give > 0)) {
          r.offers[tid] = give;
          if (onBoard(G, r.id)) G.inbox.unshift({ week: G.week, title: `Rival offer: ${t.name} offered ${r.name} (${r.weight}, ${r.stars}★)`, body: 'One of your board targets just got a scholarship offer from another program.' });
        }
      }
    }
  }
  // Targets you've neglected cool off (2+ weeks without any contact)
  const cooled = [];
  for (const id of boardOf(G)) {
    const r = G.recruits[id]; if (!r || r.status !== 'open') continue;
    const cur = r.interest[G.userTeam] || 0;
    if (cur > 0 && r.touch != null && G.week - r.touch >= 2) { r.interest[G.userTeam] = Math.max(0, cur - 3); cooled.push(r.name); }
  }
  if (cooled.length) G.inbox.unshift({ week: G.week, title: `Cooling interest: ${cooled.length} target${cooled.length > 1 ? 's' : ''}`, body: `${cooled.slice(0, 6).join(', ')}${cooled.length > 6 ? '…' : ''} ${cooled.length > 1 ? 'haven\'t' : 'hasn\'t'} heard from you in a while and lost interest.` });
  // Commit decisions
  for (const r of open) {
    if (G.week < r.decideWeek) continue;
    const cands = Object.keys(r.offers).filter(tid => hasWeightRoom(G, tid, r.weight));
    if (!cands.length) continue;
    const scored = cands.map(tid => ({ tid, s: fit(G, r, tid, r.offers[tid]) + rng() * 4 })).sort((a, b) => b.s - a.s);
    if (scored[0].s >= 30) commit(G, r, scored[0].tid, `He liked the mix of ${r.needs.pt > 0.25 ? 'playing time' : r.needs.pres > 0.25 ? 'program prestige' : r.needs.acad > 0.25 ? 'academics' : 'fit'} and your attention.`);
  }
  G.rec.hours = WEEKLY_HOURS;
}

// Final signing: every recruit with an offer picks (forced); the rest are unsigned.
export function finalizeRecruits(G) {
  const rng = makeRng(G.seed + 4242);
  // Signing-day scramble: programs with room and money pick up the best recruits still unattached.
  const aiIds = Object.keys(G.teams).filter(id => id !== G.userTeam);
  for (const r of Object.values(G.recruits).filter(x => x.status === 'open' && !Object.keys(x.offers).length).sort((a, b) => a.rank - b.rank)) {
    // Aid offered = the usual ask, or whatever the program can spare (down to a preferred-walk-on spot, at most one step below the ask).
    const give = tid => Math.min(STAR_AID[r.stars], Math.floor(aidAvailable(G, tid) * 4) / 4);
    const opts = aiIds.filter(tid => aiHasRoom(G, tid, r.weight) && give(tid) >= STAR_AID[r.stars] - 0.25)
      .map(tid => ({ tid, g: give(tid), s: fit(G, r, tid, give(tid)) + 30 * sig((G.teams[tid].prestige - STAR_PRES[r.stars]) / 14) + rng() * 4 })).sort((a, b) => b.s - a.s);
    if (opts.length) { r.late = true; r.offers[opts[0].tid] = opts[0].g; commit(G, r, opts[0].tid, 'He signed late on signing day.'); }
  }
  for (const r of Object.values(G.recruits)) {
    if (r.status !== 'open') continue;
    const cands = Object.keys(r.offers).filter(tid => hasWeightRoom(G, tid, r.weight));
    if (!cands.length) { r.status = 'unsigned'; continue; }
    const scored = cands.map(tid => ({ tid, s: fit(G, r, tid, r.offers[tid]) + rng() * 4 })).sort((a, b) => b.s - a.s);
    commit(G, r, scored[0].tid, 'He signed on the final signing day.');
  }
}

// ---------- transfer portal ----------
export function buildPortal(G, rng) {
  const portal = [];
  for (const tid in G.teams) {
    const t = G.teams[tid], starters = new Set(Object.values(t.lineup));
    for (const id of t.roster.slice()) {
      const w = G.wrestlers[id];
      if (w.fresh) continue; // this year's freshmen stay
      const starter = starters.has(id);
      if (rng() < (starter ? 0.012 : 0.11) * (w.real ? 0.2 : 1)) {
        t.roster = t.roster.filter(x => x !== id); w.team = null; w.formerTeam = tid;
        const ask = portalAsk(w);
        portal.push({ id, ask, offers: {}, interest: {}, signed: null, aidGiven: 0, from: tid });
      }
    }
    t.lineup = {};
  }
  return portal;
}

export function portalOffer(G, pid, frac) {
  const p = G.portal.find(x => x.id === pid), free = aidAvailable(G, G.userTeam) - G.portal.reduce((s, x) => s + (x.offers[G.userTeam] && x.signed == null && x.id !== pid ? x.offers[G.userTeam] : 0), 0);
  if (frac > free + 1e-9) return false;
  p.offers[G.userTeam] = frac; return true;
}
export const portalWithdraw = (G, pid) => { delete G.portal.find(x => x.id === pid).offers[G.userTeam]; };

export function resolvePortal(G) {
  const rng = makeRng(G.seed + 9191);
  // AI offers: teams where he would contend for the lineup, scaled to prestige
  for (const p of G.portal) {
    const w = G.wrestlers[p.id], ov = overall(w);
    for (const tid in G.teams) {
      if (tid === G.userTeam || tid === p.from) continue;
      const t = G.teams[tid];
      if (t.roster.length >= ROSTER_MAX) continue;   // a full AI roster can't take transfers
      if (ptScore(G, t, ov, w.natural) < 0.62 || aidAvailable(G, tid) < p.ask) continue;
      if (rng() < 0.55 && sig((t.prestige - (w.pot >= 16 ? 70 : w.pot >= 14 ? 55 : 40)) / 10) > rng()) p.offers[tid] = p.ask;
    }
  }
  const order = G.portal.slice().sort((a, b) => overall(G.wrestlers[b.id]) - overall(G.wrestlers[a.id]));
  for (const p of order) {
    const w = G.wrestlers[p.id], cands = Object.entries(p.offers).filter(([tid, a]) => aidAvailable(G, tid) + 1e-9 >= a);
    if (!cands.length) continue;
    const best = cands.map(([tid, a]) => ({ tid, a, s: (G.teams[tid].prestige / 100 * 0.35 + ptScore(G, G.teams[tid], overall(w), w.natural) * 0.45 + a * 0.2) * 60 + rng() * 4 })).sort((x, y) => y.s - x.s)[0];
    p.signed = best.tid; p.aidGiven = best.a;
    w.team = best.tid; w.aid = best.a;
    G.teams[best.tid].roster.push(w.id);
    p.fate = 'signed';
    if (best.tid === G.userTeam) G.inbox.unshift({ week: G.week, title: `Transfer signs: ${w.name} (${w.natural})`, body: `${w.name} (${['', 'Fr', 'So', 'Jr', 'Sr'][w.cls]}, OVR ${Math.round(overall(w) * 10) / 10}) joins from ${G.teams[p.from].name}.` });
  }
  // Nobody offered a scholarship: some latch on as walk-ons (no aid) where they could make the room, the rest leave college wrestling.
  const rng2 = makeRng(G.seed + 9292), fates = [];
  for (const p of order.filter(x => x.signed == null)) {
    const w = G.wrestlers[p.id], ov = overall(w);
    const stay = clamp(0.3 + 0.09 * (ov - 10), 0.08, 0.92);                       // better wrestlers are likelier to keep going
    let dest = null;
    if (rng2() < stay) {
      const opts = Object.values(G.teams).filter(t => t.id !== G.userTeam && t.id !== p.from && t.roster.length < ROSTER_MAX - 1 && ptScore(G, t, ov, w.natural) >= 0.3)
        .map(t => ({ t, s: ptScore(G, t, ov, w.natural) * 0.6 + (1 - t.prestige / 100) * 0.25 + rng2() * 0.3 })).sort((a, b) => b.s - a.s);
      if (opts.length) dest = opts[0].t;
    }
    if (dest) { p.signed = dest.id; p.aidGiven = 0; p.fate = 'walkon'; w.team = dest.id; w.aid = 0; dest.roster.push(w.id); }
    else { p.fate = 'left'; w.team = null; w.gone = true; }                      // leaves college wrestling (cleaned up at the next season start)
    fates.push(p);
  }
  // tell the user what became of the wrestlers they released
  const mine = G.portal.filter(p => p.from === G.userTeam && p.cut);
  if (mine.length) {
    const desc = p => { const w = G.wrestlers[p.id], t = p.signed ? G.teams[p.signed].name : ''; return `${w.name} (${w.natural}, OVR ${Math.round(overall(w) * 10) / 10}) — ${p.fate === 'signed' ? `signed with ${t} (${Math.round(p.aidGiven * 100)}% aid)` : p.fate === 'walkon' ? `walked on at ${t}` : 'left college wrestling'}`; };
    G.inbox.unshift({ week: G.week, title: `Your released wrestlers: ${mine.filter(p => p.fate !== 'left').length} landed, ${mine.filter(p => p.fate === 'left').length} left the sport`, body: mine.map(desc).join('; ') + '.' });
  }
}
// Remove wrestlers who left the sport (keeps saves small); anyone still referenced by last season's polls stays one more year.
export function pruneGone(G) {
  const inPoll = new Set(); for (const k of ['rkCur', 'rkPrev']) for (const wt in G[k] || {}) for (const id of G[k][wt]) inPoll.add(id);
  for (const id of Object.keys(G.wrestlers)) { const w = G.wrestlers[id]; if (w.gone && !inPoll.has(id)) { retire(G, w, G.season - 1); delete G.wrestlers[id]; } }
}


// ---------- auto-recruiting for the user's team ----------
// Modes: manual (default), 'repeat' (replay last week's actions each week), 'auto' (the AI's logic, spending your hours through the real actions).
export const REC_MODES = { manual: 'Manual', repeat: "Repeat last week's plan", auto: 'Full auto (AI logic)' };
const recRng = (G, salt) => makeRng(G.seed + G.week * 6151 + salt + Math.round(G.rec.hours));

// the pitch topic he cares about most that my school actually delivers on (null if nothing is worth the hours)
function bestPitch(G, r) {
  const st = teamStrengths(G, r, G.userTeam); let best = null;
  for (const k of Object.keys(PITCH_TOPICS)) {
    if (k === 'aid' && r.offers[G.userTeam] == null) continue;
    const v = Math.min(1, r.needs[k] * 2.5) * st[k];
    if (!best || v > best.v) best = { k, v };
  }
  return best && best.v >= 0.12 ? best.k : null;
}
// same offer rule the AI uses: once interest is 26+, offer the typical aid for his star level if it can be covered
function maybeOffer(G, r, log) {
  const me = G.userTeam;
  if (r.offers[me] != null || (r.interest[me] || 0) < 26 || !aiHasRoom(G, me, r.weight)) return;   // auto mode follows the AI's soft caps; manual play has none
  const want = STAR_AID[r.stars], free = aidAvailable(G, me) - pendingOffers(G, me), give = Math.min(want, Math.floor(Math.max(0, free) * 4) / 4);
  if (give >= want - 0.26 && (want === 0 || give > 0) && offer(G, r.id, give)) log.offers.push(`${r.name} (${r.weight}, ${r.stars}★) ${Math.round(give * 100)}%`);
}

export function autoRecruit(G, rng = recRng(G, 11)) {
  const me = G.userTeam, log = { actions: 0, hours: 0, offers: [], people: new Set(), mode: 'auto' };
  const open = Object.values(G.recruits).filter(r => r.status === 'open');
  const engaged = open.filter(r => onBoard(G, r.id) || (r.interest[me] || 0) > 0 || r.offers[me] != null).filter(r => r.offers[me] != null || aiHasRoom(G, me, r.weight));
  const seen = new Set(engaged.map(r => r.id));
  // new targets: the AI's own ranking of who to chase next
  const fresh = open.filter(r => !seen.has(r.id) && aiHasRoom(G, me, r.weight)).map(r => ({ r, s: targetScore(G, me, r, rng) })).sort((a, b) => b.s - a.s).map(x => x.r);
  const firstFresh = fresh.slice(0, AI_TARGETS);
  for (const r of firstFresh) addTarget(G, r.id);
  const ranked = [...engaged, ...firstFresh].map(r => ({ r, s: targetScore(G, me, r, rng) + (r.offers[me] != null ? 0.15 : 0) })).sort((a, b) => b.s - a.s).slice(0, 10).map(x => x.r);
  const run = (r, type) => {
    if (G.rec.hours < ACTIONS[type].hours || r.status !== 'open') return false;
    const topic = type === 'pitch' ? bestPitch(G, r) : undefined;
    if (type === 'pitch' && !topic) return false;
    const res = doAction(G, r.id, type, rng, topic);
    if (res.ok) { log.actions++; log.hours += ACTIONS[type].hours; log.people.add(r.id); maybeOffer(G, r, log); }
    return res.ok;
  };
  for (const r of ranked) { maybeOffer(G, r, log); run(r, 'pitch'); run(r, 'call'); }       // everyone gets a pitch and a call, best targets first
  for (const r of ranked.slice(0, 3)) { run(r, 'visit'); run(r, 'home'); }                   // the top three earn visits (once per season each)
  for (const r of ranked) run(r, 'dm');                                                       // cheap touches keep interest from cooling
  for (const r of fresh.slice(AI_TARGETS, AI_TARGETS + 8)) {                                  // spare hours: start on the next names down the list
    if (G.rec.hours < 2) break;
    addTarget(G, r.id); run(r, 'pitch'); run(r, 'call');
  }
  log.people = log.people.size;
  return log;
}

// Replay last week's actions (skipping anything no longer possible).
export function repeatLastWeek(G, rng = recRng(G, 17)) {
  const plan = G.rec.last || [], log = { actions: 0, hours: 0, skipped: 0, offers: [], people: new Set(), mode: 'repeat', reasons: {} };
  for (const a of plan) {
    const r = G.recruits[a.rid];
    const res = r && r.status === 'open' ? doAction(G, a.rid, a.type, rng, a.topic) : { ok: false, msg: 'no longer available' };
    if (res.ok) { log.actions++; log.hours += ACTIONS[a.type].hours; log.people.add(a.rid); }
    else { log.skipped++; log.reasons[res.msg] = (log.reasons[res.msg] || 0) + 1; }
  }
  // repeating never offers scholarships (those stay your call) - but say who is ready for one
  log.ready = [...new Set(plan.map(x => x.rid))].map(id => G.recruits[id]).filter(r => r && r.status === 'open' && r.offers[G.userTeam] == null && (r.interest[G.userTeam] || 0) >= 26).map(r => `${r.name} (${r.weight}, ${r.stars}★)`);
  log.people = log.people.size;
  return log;
}
export const lastPlanSize = G => (G.rec.last ? G.rec.last.length : 0);
export const describeAuto = log => [
  `${log.mode === 'auto' ? 'Auto-recruit' : "Repeated last week's plan"}: ${log.actions} action${log.actions === 1 ? '' : 's'} on ${log.people} recruit${log.people === 1 ? '' : 's'}, ${log.hours}h used.`,
  log.offers.length ? `New offers: ${log.offers.join('; ')}.` : '',
  log.ready && log.ready.length ? `Ready for a scholarship offer: ${log.ready.slice(0, 4).join(', ')}${log.ready.length > 4 ? '…' : ''}.` : '',
  log.skipped ? `${log.skipped} action${log.skipped === 1 ? '' : 's'} skipped (${Object.entries(log.reasons).map(([k, v]) => `${v}× ${k.replace(/\.$/, '').toLowerCase()}`).slice(0, 3).join('; ')}).` : '',
].filter(Boolean).join(' ');

// Called once as the week advances (before the AI's weekly processing): run the chosen auto mode, then roll the plan log over.
export function runWeeklyAuto(G) {
  const mode = G.rec.mode || 'manual';
  if ((mode === 'auto' || mode === 'repeat') && G.rec.hours > 0 && Object.values(G.recruits).some(r => r.status === 'open')) {
    const log = mode === 'repeat' && lastPlanSize(G) ? repeatLastWeek(G) : autoRecruit(G);
    if (log.actions) G.inbox.unshift({ week: G.week, title: `${log.mode === 'auto' ? 'Auto-recruit' : 'Repeated plan'}: ${log.actions} actions, ${log.hours}h`, body: describeAuto(log) });
  }
  if (G.rec.cur && G.rec.cur.length) G.rec.last = G.rec.cur;
  G.rec.cur = [];
}
