// National Dual Tournament: the top 16 programs from last season's NCAA team scores meet in week 2 in a single-elimination bracket of dual meets.
//   spec = { id:'nd', kind:'dual', week:2, teams:[16 ids], br, duals:[], done, result }
//   spec.br = { seeds:[ids best->worst], rounds:[[{ i, a, b, sa, sb, d: dualId|null, w: winnerTeam|null }]] }   (round 0 = round of 16 ... last = final)
// Duals are played ONE AT A TIME (the user may change the lineup between rounds), with the normal dual engine (playDual): AI teams re-optimise their lineup
// before every dual, and fatigue + match injuries are applied after each one. Results count toward dual records and wrestler stats.
import { playDual, beginDual, teamStrength, autoLineup, giveInjury, matchInjuryChance, FATIGUE } from './core.js';
import { seedOrder } from './tourney.js';
import { makeRng } from '../engine/rng.js';

export const DUAL_WEEK = 2, DUAL_FIELD = 16, DUAL_NAME = 'National Dual Tournament', DUAL_LOC = 'Stillwater, OK';
const DAY = 86400000;

// the top 16 teams from last season's NCAA team scores (G.history); the first season, or any gap, is filled by prestige
export function pickDualField(G) {
  const h = (G.history || [])[(G.history || []).length - 1], ids = [];
  for (const x of (h && h.top) || []) if (G.teams[x.team] && !ids.includes(x.team)) ids.push(x.team);
  for (const t of Object.values(G.teams).sort((a, b) => b.prestige - a.prestige || (a.id < b.id ? -1 : 1))) { if (ids.length >= DUAL_FIELD) break; if (!ids.includes(t.id)) ids.push(t.id); }
  return ids.slice(0, DUAL_FIELD);
}
export function makeDualSpec(G, teams, cal = G.cal) {
  const dates = new Date(cal.start + (DUAL_WEEK - 1) * 7 * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return { id: 'nd', name: DUAL_NAME, kind: 'dual', tier: 'dual', loc: DUAL_LOC, dates, week: DUAL_WEEK, teams: teams.slice(), done: false, result: null, br: null, duals: [] };
}

// New season: make sure the field matches last season's NCAA top 16 (normally the draft already does; this also covers old saves). Newcomers' other week-2 commitments are cancelled.
export function syncDualField(G) {
  const field = pickDualField(G); let spec = G.tournaments.find(t => t.kind === 'dual');
  if (!spec) { spec = makeDualSpec(G, [], G.cal); G.tournaments.push(spec); }
  const had = new Set(spec.teams), added = field.filter(id => !had.has(id)), notes = [];
  spec.teams = field;
  for (const id of added) {
    for (let i = G.schedule.length - 1; i >= 0; i--) { const d = G.schedule[i]; if (d.week === DUAL_WEEK && !d.done && (d.a === id || d.b === id)) { G.schedule.splice(i, 1); if (d.a === G.userTeam || d.b === G.userTeam) notes.push(`your week-${DUAL_WEEK} dual against ${G.teams[d.a === G.userTeam ? d.b : d.a].name} was cancelled`); } }
    for (const t of G.tournaments) if (t !== spec && t.week === DUAL_WEEK && t.teams.includes(id)) { t.teams = t.teams.filter(x => x !== id); if (id === G.userTeam) notes.push(`you were withdrawn from the ${t.name}`); }
  }
  if (field.includes(G.userTeam) && !had.has(G.userTeam)) G.inbox.unshift({ week: 1, title: `${G.teams[G.userTeam].name} invited to the ${DUAL_NAME}`, body: `You are among the top ${DUAL_FIELD} programs. ${notes.join('; ')}${notes.length ? '.' : ''}`.trim() });
  else if (had.has(G.userTeam) && !field.includes(G.userTeam)) G.inbox.unshift({ week: 1, title: `Not in the ${DUAL_NAME} field`, body: `Prestige changes dropped ${G.teams[G.userTeam].name} out of the top ${DUAL_FIELD}; week ${DUAL_WEEK} is open.` });
}

export const roundName = (spec, r) => { const left = spec.br.rounds.length - r; return left === 1 ? 'Final' : left === 2 ? 'Semifinals' : left === 3 ? 'Quarterfinals' : `Round of ${2 ** left}`; };
export const started = spec => !!spec.br;
export const inProgress = spec => !!(spec.br && !spec.done);

// Seed by current team strength (AI teams get a fresh best lineup first) and build round 1.
export function startDual(G, spec) {
  if (spec.br) return;
  for (const id of spec.teams) if (id !== G.userTeam) G.teams[id].lineup = autoLineup(G, id);
  const seeds = spec.teams.slice().sort((a, b) => teamStrength(G, b) - teamStrength(G, a) || (a < b ? -1 : 1));
  const n = seeds.length, P = 2 ** Math.ceil(Math.log2(Math.max(2, n))), order = seedOrder(P), rounds = [];
  const r0 = []; for (let i = 0; i < P; i += 2) { const sa = order[i], sb = order[i + 1]; r0.push({ i: i / 2, a: sa <= n ? seeds[sa - 1] : null, b: sb <= n ? seeds[sb - 1] : null, d: null, w: null }); }
  rounds.push(r0);
  for (let sz = P / 4; sz >= 1; sz /= 2) rounds.push(Array.from({ length: sz }, (_, i) => ({ i, a: null, b: null, d: null, w: null })));
  spec.br = { seeds, rounds }; spec.duals = [];
  for (const m of r0) if (m.a && !m.b) advance(spec, 0, m, m.a); else if (m.b && !m.a) advance(spec, 0, m, m.b);   // byes (never with 16)
}
const seedOf = (spec, id) => spec.br.seeds.indexOf(id) + 1;
function advance(spec, r, m, winner) {
  m.w = winner;
  const nxt = spec.br.rounds[r + 1]; if (!nxt) return;
  const t = nxt[m.i >> 1]; if (m.i % 2 === 0) t.a = winner; else t.b = winner;
}

// the next dual to play: first round with unplayed duals; the user's own dual goes first, then bracket order
export function nextMatch(G, spec) {
  if (!spec.br) return null;
  for (let r = 0; r < spec.br.rounds.length; r++) {
    const open = spec.br.rounds[r].filter(m => !m.w && m.a && m.b);
    if (open.length) return { r, m: open.find(m => m.a === G.userTeam || m.b === G.userTeam) || open[0] };
  }
  return null;
}
export const dualOf = (spec, m) => (m.d ? spec.duals.find(x => x.id === m.d) : null);

// create the dual for a match and start it (bout by bout, nothing simulated yet): used by "Watch next dual" so the user can coach it
export function beginMatch(G, spec, ref) {
  const { r, m } = ref;
  if (!m.d) {
    const n = 1000 + spec.duals.length;   // id 'n<number>' so the dual's rng seed stays unique
    spec.duals.push({ id: 'n' + n, week: spec.week, a: m.a, b: m.b, done: false, result: null, conf: false, tid: spec.id, r, i: m.i });
    m.d = 'n' + n;
  }
  const d = dualOf(spec, m); beginDual(G, d); return d;
}
// the dual is finished (all 10 bouts): fatigue + match injuries for everyone who wrestled (regular duals get this in runTraining), advance the winner
export function completeMatch(G, spec, ref) {
  const { r, m } = ref, d = dualOf(spec, m); if (!d || !d.done || m.w) return d;
  const rng = makeRng(G.seed + parseInt(d.id.slice(1), 10) * 31 + 5);
  for (const b of d.result.bouts) {
    if (b.m === 'Forfeit' || b.m === 'Vacant') continue;
    for (const [id, tm] of [[b.wa, d.a], [b.wb, d.b]]) {
      const w = id && G.wrestlers[id]; if (!w) continue;
      w.fatigue = Math.min(100, w.fatigue + FATIGUE.match);
      if (!w.injury && rng() < matchInjuryChance(w)) giveInjury(G, w, rng, tm === G.userTeam, 'at the ' + spec.name);
    }
  }
  advance(spec, r, m, d.result.winner === 'A' ? d.a : d.b);
  if (spec.br.rounds[spec.br.rounds.length - 1][0].w) finish(G, spec);
  return d;
}
// bracket sync only: duals that finished (e.g. watched to the end) but whose result has not been applied yet
export function settleDone(G, spec) {
  if (!spec.br) return;
  spec.br.rounds.forEach((rd, r) => rd.forEach(m => { if (m.d && !m.w) { const d = dualOf(spec, m); if (d && d.done) completeMatch(G, spec, { r, m }); } }));
}
export function playMatch(G, spec, ref) { const d = beginMatch(G, spec, ref); playDual(G, d); completeMatch(G, spec, ref); return d; }
// resolve duals that were started or watched but not yet settled in the bracket (a dual left half-way is finished by the assistant coaches)
export function settle(G, spec) {
  if (!spec.br) return;
  spec.br.rounds.forEach((rd, r) => rd.forEach(m => { if (m.d && !m.w) { const d = dualOf(spec, m); if (d) { playDual(G, d); completeMatch(G, spec, { r, m }); } } }));
}

export function simNext(G, spec) { settle(G, spec); const ref = nextMatch(G, spec); return ref ? playMatch(G, spec, ref) : null; }
export function simRound(G, spec) { settle(G, spec); const ref = nextMatch(G, spec); if (!ref) return 0; let n = 0; while ((nextMatch(G, spec) || {}).r === ref.r) { simNext(G, spec); n++; } return n; }
export function simAll(G, spec) { settle(G, spec); while (!spec.done && simNext(G, spec)); }

function finish(G, spec) {
  const R = spec.br.rounds, place = {}, wins = {};
  const k = R.length;
  for (let r = 0; r < k; r++) for (const m of R[r]) { if (!m.a || !m.b || !m.w) continue; wins[m.w] = (wins[m.w] || 0) + 1; const loser = m.w === m.a ? m.b : m.a; place[loser] = r === k - 1 ? 2 : r === k - 2 ? 3 : r === k - 3 ? 5 : r === k - 4 ? 9 : 17; }
  place[R[k - 1][0].w] = 1;
  const teamScores = Object.keys(place).map(team => ({ team, pts: wins[team] || 0, place: place[team] })).sort((x, y) => x.place - y.place || seedOf(spec, x.team) - seedOf(spec, y.team));
  spec.result = { teamScores, userBouts: [], userPlaces: [], weights: {}, champion: teamScores[0].team };
  spec.done = true;
  if (spec.teams.includes(G.userTeam)) {
    const mine = place[G.userTeam], w = wins[G.userTeam] || 0, lab = mine === 1 ? 'won the title' : mine === 2 ? 'finished second' : `finished ${mine === 3 ? 'in the semifinals' : mine === 5 ? 'in the quarterfinals' : 'in the first round'}`;
    G.inbox.unshift({ week: G.week, title: `${spec.name}: ${G.teams[G.userTeam].name} ${lab}`, body: `${w} dual win${w === 1 ? '' : 's'}. Champion: ${G.teams[teamScores[0].team].name}.` });
  }
}

// whole event at once (finishWeek / skipping ahead)
export function runDual(G, spec) { startDual(G, spec); simAll(G, spec); return spec.result; }
