// Season rollover: graduation, class advance, offseason development, freshmen, transfer portal, next season setup.
import { makeRng } from '../engine/rng.js';
import { ATTR_KEYS } from '../engine/bout.js';
import { generateWrestler, WEIGHTS } from '../data/gen.js';
import { PRACTICE, FOCUS_SHARES } from '../data/practice.js';
import { seasonCalendar } from '../data/tournaments.js';
import { syncDualField } from './dualtourney.js';
import { overall, overallLegacy, sanitizeLineup, autoLineup, aiPlan, coachFactor, initDev, makeSchedule, useCalendar, rankings } from './core.js';
import { applyPrestige } from './prestige.js';
import { buildNext } from './sched.js';
import { rollSeasonStats, updatePolls, careerOf, flushStats } from './stats.js';
import { closeSeasonRecords, retire, pruneArchive } from './legacy.js';
import { finalizeRecruits, buildPortal, resolvePortal, generateRecruitClass, aidAvailable, AID_CAP, ROSTER_MAX, autoCut, cutsNeeded, pruneGone } from './recruit.js';

const nextWeight = wt => WEIGHTS[WEIGHTS.indexOf(wt) + 1] ?? null;

// Offseason development: big, broad and random. Each attribute closes a random share of its gap to potential.
// Share = class (young grow most) x program prestige x work ethic x luck. Luck = a persistent hidden trait (w.dev) + this year's roll,
// plus rare busts (potential drops) and breakouts (potential rises, an attribute may pass it). So some wrestlers never reach their
// potential and some exceed it; top programs push more of the gap and bust less.
export const DEV = { base: { 1: 0.29, 2: 0.24, 3: 0.17 }, bust: 0.07, breakout: 0.07 };
function growWrestler(G, w, tid, rng, plan) {
  const t = G.teams[tid], pr = t.prestige / 100;
  const base = DEV.base[w.cls] ?? 0.12;
  const prestigeF = 0.72 + 0.5 * pr;                         // 30 -> .87, 55 -> 1.0, 99 -> 1.21
  const ethicF = 0.7 + 0.6 * w.ethic / 20;
  let luck = Math.exp(0.22 * (w.dev || 0) + 0.3 * rng.gauss());
  let event = null;
  const r = rng();
  if (r < DEV.bust * (1.5 - pr)) { event = 'bust'; luck *= 0.25; w.pot = Math.max(Math.round(overallLegacy(w)), w.pot - 1); }
  else if (r > 1 - DEV.breakout * (0.6 + pr)) { event = 'breakout'; luck *= 1.7; w.pot = Math.min(20, w.pot + 1); }
  luck = Math.max(0.1, Math.min(2.6, luck));
  const frac = base * prestigeF * ethicF * luck * coachFactor(t) / 1.05;
  const focus = {};
  plan.focus.forEach((k, i) => { for (const [at, aw] of Object.entries(PRACTICE[k].attrs)) focus[at] = (focus[at] || 0) + FOCUS_SHARES[i] * aw; });
  const before = overall(w), gained = {};
  for (const at of ATTR_KEYS) {
    const room = w.pot - w.attrs[at];
    const e = Math.min(3, -Math.log(1 - rng()));               // exponential: most attributes move a little, a few jump
    if (room > 0) {
      const x = room * Math.min(1, frac * e * (1 + 0.6 * Math.min(1, focus[at] || 0)));
      const inc = Math.min(room, Math.floor(x + rng()));
      if (inc > 0) { w.attrs[at] += inc; gained[at] = inc; }
    }
    if (w.attrs[at] < 20 && w.attrs[at] >= w.pot && rng() < (0.03 + 0.07 * pr) * Math.min(1.5, luck)) { w.attrs[at]++; gained[at] = (gained[at] || 0) + 1; }   // pushes past potential
  }
  w.prog = {}; w.sg = {};
  return { gained, d: overall(w) - before, event };
}

// ---------- the offseason is 4 steps: cut -> progress -> recruit -> schedule ----------
export const OFF_STEPS = [['cut', 'Cut players'], ['progress', 'Wrestler progression'], ['recruit', 'Recruiting'], ['schedule', 'Customize schedule']];
export const offStep = G => (G.phase === 'offseason' ? (G.off && G.off.step) || 'recruit' : null);   // old saves (no G.off) land on recruiting

// Step 1 setup: seniors graduate, signed recruits join as freshmen, the portal fills with random transfers, AI programs cut to the roster limit.
// Ratings do NOT change yet (that is step 2), so cut decisions are made on last season's numbers.
export function beginOffseason(G) {
  const rng = makeRng(G.seed + G.season * 131 + 5);
  flushStats(G);
  closeSeasonRecords(G);   // single-season record books close before the seniors leave
  finalizeRecruits(G);
  const stats = { grads: 0, freshmen: 0 }, gradNames = [];
  G.alumni = G.alumni || [];
  for (const tid in G.teams) {
    const t = G.teams[tid], keep = [];
    for (const id of t.roster) {
      const w = G.wrestlers[id];
      if (w.cls >= 4) {
        retire(G, w);   // career record books, Halls of Fame, archive (keeps his profile reachable)
        if (tid === G.userTeam) { G.alumni.push({ id: w.id, name: w.name, season: G.season, weight: w.natural, ovr: Math.round(overall(w) * 10) / 10, car: careerOf(w) }); stats.grads++; gradNames.push(`${w.name} (${w.natural})`); }
        delete G.wrestlers[id]; continue;
      }
      delete w.fresh;   // last year's freshmen are now eligible to transfer
      keep.push(id);
    }
    for (const rid of t.incoming || []) {   // freshmen: committed recruits join
      const r = G.recruits[rid]; if (!r) continue;
      const w = { id: 'w' + G.nextId++, name: r.name, school: t.name, weight: r.weight, archetype: r.arch, attrs: { ...r.attrs }, team: tid, natural: r.weight, cls: 1, pot: r.pot,
        ethic: Math.max(3, Math.min(20, Math.round(11 + rng.gauss() * 3.5))), prone: Math.max(1, Math.min(20, Math.round(10 + rng.gauss() * 4))),
        fatigue: 0, injury: null, focus: null, prog: {}, sg: {}, dev: Math.round(rng.gauss() * 100) / 100, aid: r.offers[tid] || 0, fresh: true, stars: r.stars, hm: r.state || '', prior: false, elo: 1500 };   // no college results yet: unranked until he wins, starts at the neutral rating
      G.wrestlers[w.id] = w; keep.push(w.id); if (tid === G.userTeam) stats.freshmen++;
    }
    t.roster = keep; t.incoming = [];
  }
  G.recruits = {};
  G.portal = buildPortal(G, rng);
  let aiCuts = 0;
  for (const id in G.teams) if (id !== G.userTeam) aiCuts += autoCut(G, id).length;
  for (const id in G.teams) G.teams[id].lineup = autoLineup(G, id);
  G.phase = 'offseason';
  G.off = { step: 'cut', grads: gradNames, freshmen: stats.freshmen, aiCuts, prog: null };
  buildNext(G);   // next season's schedule, editable in step 4
  const mustCut = cutsNeeded(G);
  G.inbox.unshift({ week: G.week, title: 'Offseason', body: `${stats.grads} senior${stats.grads === 1 ? '' : 's'} graduated; ${stats.freshmen} freshmen joined. ${gradNames.length ? 'Graduated: ' + gradNames.join(', ') + '. ' : ''}Step 1 of 4: ${mustCut ? `your roster is ${G.teams[G.userTeam].roster.length} and the limit is ${ROSTER_MAX}, so you must cut ${mustCut}.` : 'your roster is within the limit; cut anyone else you want to release.'} Cut wrestlers enter the transfer portal (${G.portal.length} in it now${aiCuts ? `, ${aiCuts} of them AI roster cuts` : ''}).` });
  return stats;
}

// Step 2: every returning wrestler (rostered and in the portal) moves up a class and develops. Results are recorded for the progression screen.
export function runProgression(G) {
  const rng = makeRng(G.seed + G.season * 131 + 6), log = [];
  const one = (w, tid, released) => {
    const plan = tid === G.userTeam ? G.training : aiPlan(G, tid), pot0 = w.pot, o0 = overall(w), cls0 = w.cls, wt0 = w.natural;
    const gr = growWrestler(G, w, tid, rng, plan);
    w.cls++; w.fatigue = 0; w.focus = null; w.move = null; w.rehab = null;
    if (w.injury) { w.injury.weeks -= 14; if (w.injury.weeks <= 0) w.injury = null; }
    if (!w.injury && nextWeight(w.natural) && rng() < ({ 2: 0.03, 3: 0.015 }[w.cls] ?? 0.008)) {   // very rare growth into the next weight class
      const old = w.natural; w.natural = nextWeight(old); w.attrs.str = Math.min(20, w.attrs.str + 1); w.attrs.speed = Math.max(1, w.attrs.speed - 1);
    }
    if (tid === G.userTeam) log.push({ id: w.id, name: w.name, cls0, cls: w.cls, wt0, wt: w.natural, o0: +o0.toFixed(2), o1: +overall(w).toFixed(2), pot0, pot1: w.pot, gained: gr.gained, event: gr.event, released: !!released });
    return gr;
  };
  for (const tid in G.teams) for (const id of G.teams[tid].roster) { const w = G.wrestlers[id]; if (!w.fresh) one(w, tid, false); }
  for (const p of G.portal || []) { const w = G.wrestlers[p.id]; if (w && !w.fresh) one(w, p.from, true); }   // transfers also move up a class and develop
  for (const id in G.teams) G.teams[id].lineup = autoLineup(G, id);
  G.off.prog = log;
  const kept = log.filter(x => !x.released);
  for (const x of log) if (x.wt !== x.wt0 && !x.released) G.inbox.unshift({ week: G.week, title: `${x.name} outgrew ${x.wt0}`, body: `${x.name} has grown and will now wrestle at ${x.wt}.` });
  if (kept.length) {
    const top = [...kept].sort((a, b) => (b.o1 - b.o0) - (a.o1 - a.o0)), f = x => `${x.name} +${(x.o1 - x.o0).toFixed(1)} (${Object.keys(x.gained).length} ratings)`;
    const flat = kept.filter(x => x.o1 - x.o0 < 0.15 && x.pot1 - x.o1 >= 1.5).slice(0, 3);
    G.inbox.unshift({ week: G.week, title: 'Offseason development', body: 'Biggest jumps: ' + top.slice(0, 4).map(f).join(' · ') + '.' + (kept.some(x => x.event === 'breakout') ? ' Breakouts: ' + kept.filter(x => x.event === 'breakout').map(x => x.name).join(', ') + '.' : '') + (kept.some(x => x.event === 'bust') ? ' Stalled: ' + kept.filter(x => x.event === 'bust').map(x => x.name).join(', ') + '.' : '') + (flat.length ? ' Little progress: ' + flat.map(x => x.name).join(', ') + '.' : '') });
  }
  return log;
}

// Move to the next offseason step. Returns { ok, msg } (msg when blocked); after the last step the caller starts the season.
export function advanceOffseason(G) {
  const step = offStep(G);
  if (step === 'cut') {
    const need = cutsNeeded(G);
    if (need) return { ok: false, msg: `Your roster is ${G.teams[G.userTeam].roster.length}; the limit is ${ROSTER_MAX}. Cut ${need} more wrestler${need === 1 ? '' : 's'} first.` };
    runProgression(G); G.off.step = 'progress'; return { ok: true };
  }
  if (step === 'progress') { G.off.step = 'recruit'; return { ok: true }; }
  if (step === 'recruit') { G.off.step = 'schedule'; return { ok: true }; }
  return { ok: true, done: true };
}

function autoAid(G, tid) {
  const t = G.teams[tid];
  let free = aidAvailable(G, tid);
  const ws = t.roster.map(id => G.wrestlers[id]).filter(w => (w.aid || 0) < 0.75).sort((a, b) => overall(b) - overall(a));
  for (const w of ws) {
    if (free < 0.25) break;
    const add = Math.min(free, 0.75 - (w.aid || 0), 0.5); w.aid = +((w.aid || 0) + Math.floor(add * 4) / 4).toFixed(2); free -= Math.floor(add * 4) / 4;
  }
}

export function startNewSeason(G) {
  const rng = makeRng(G.seed + G.season * 977 + 11);
  if (offStep(G) === 'cut') { if (cutsNeeded(G)) autoCut(G, G.userTeam); runProgression(G); G.off.step = 'progress'; }   // safety net (UI walks the steps; headless sims skip them): trim, then progress
  resolvePortal(G);
  // prestige drift from this season's result
  applyPrestige(G);
  for (const tid in G.teams) {
    const t = G.teams[tid];
    // walk-ons so every weight has at least two bodies
    for (const wt of WEIGHTS) {
      let have = t.roster.filter(id => G.wrestlers[id].natural === wt).length;
      while (have < 2) {
        const w = generateWrestler(rng, { weight: wt, quality: 8 + t.prestige / 100 * 4 - have, archetype: 'balanced', school: t.name });
        w.id = 'w' + G.nextId++; w.team = tid; w.natural = wt; w.cls = rng.int(1, 3); delete w.plan; initDev(w, rng); w.aid = 0; w.prior = false; w.elo = 1500;
        G.wrestlers[w.id] = w; t.roster.push(w.id); have++;
      }
    }
    if (tid !== G.userTeam && t.roster.length > ROSTER_MAX) for (const id of autoCut(G, tid)) G.wrestlers[id].gone = true;   // walk-ons added above can push an AI roster over the limit: release the lowest-value extras (pruneGone removes them)
    if (tid !== G.userTeam) autoAid(G, tid);
    if (tid !== G.userTeam) t.lineup = autoLineup(G, tid);
  }
  // user lineup: keep valid starters, fill the rest with the best available
  const ut = G.teams[G.userTeam], best = autoLineup(G, G.userTeam), used = new Set();
  const lu = {};
  for (const wt of WEIGHTS) { const id = ut.lineup[wt]; if (id && G.wrestlers[id] && G.wrestlers[id].team === G.userTeam) { lu[wt] = id; used.add(id); } }
  for (const wt of WEIGHTS) if (!lu[wt] && best[wt] && !used.has(best[wt])) { lu[wt] = best[wt]; used.add(best[wt]); }
  ut.lineup = lu; sanitizeLineup(G, G.userTeam);
  rollSeasonStats(G);
  G.season++; G.cal = seasonCalendar(G.season); useCalendar(G);
  G.week = 1; G.phase = 'season'; G.entries = {}; G.portal = []; G.off = null;
  if (G.next && G.next.season === G.season) { G.schedule = G.next.schedule; G.tournaments = G.next.tournaments; } else G.schedule = makeSchedule(G, rng);   // the (possibly customized) draft
  syncDualField(G);   // National Dual Tournament field = top 16 by the NEW prestige (the draft predates the drift)
  G.next = null;
  G.ncaa = null;
  updatePolls(G); // preseason poll (movement is vs. last season's final poll)
  pruneGone(G);   // unsigned transfers who left the sport
  pruneArchive(G);
  G.recruits = generateRecruitClass(G, rng);
  G.rec = { hours: 20, board: [], mode: G.rec?.mode || "manual", noWarn: G.rec?.noWarn };   // keep the "Every week" mode and the warning preference across seasons
  for (const id in G.teams) G.teams[id].incoming = [];
  if (G.inbox.length > 80) G.inbox.length = 80;
  G.inbox.unshift({ week: 1, title: `${G.season}-${String(G.season + 1).slice(2)} season begins`, body: `Week 1 is ${new Date(G.cal.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}. A new recruiting class is available.` });
}
