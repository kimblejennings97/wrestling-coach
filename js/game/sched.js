// Offseason schedule customization. When the offseason begins we DRAFT next season's schedule (G.next = { season, cal, schedule, tournaments });
// the user may edit the open/major tournaments and non-conference duals; conference duals, the conference tournament and the NCAAs are locked.
// startNewSeason adopts the draft. All checks keep the schedule consistent for the other teams too (no team is ever double-booked).
import { makeRng } from '../engine/rng.js';
import { seasonCalendar } from '../data/tournaments.js';
import { makeSchedule } from './core.js';

export const MAX_USER_EVENTS = 5;        // open/major tournaments you may enter (conference tournament and NCAAs are extra)
export const MAJOR_PRESTIGE_RANK = 40;   // majors only invite the top-40 programs
export const EST_PER_EVENT = 4.5;        // matches a starter wrestles per tournament
export const TARGET = [18, 35];

// Draft next season's schedule (same builder the game uses, so it is balanced).
export function buildNext(G) {
  const saved = { cal: G.cal, season: G.season, tournaments: G.tournaments, schedule: G.schedule };
  try {
    G.season = saved.season + 1; G.cal = seasonCalendar(G.season);
    const rng = makeRng(G.seed + G.season * 977 + 31);
    const schedule = makeSchedule(G, rng);            // also sets G.tournaments (opens + conference tournaments)
    G.next = { season: G.season, cal: G.cal, schedule, tournaments: G.tournaments, edits: 0 };
  } finally { G.season = saved.season; G.cal = saved.cal; G.tournaments = saved.tournaments; G.schedule = saved.schedule; }
  return G.next;
}
export const ensureNext = G => (G.next && G.next.season === G.season + 1 ? G.next : buildNext(G));

export const dateOfNext = (G, wk) => new Date(G.next.cal.start + (wk - 1) * 7 * 86400000);
export const fmtNext = (G, wk) => dateOfNext(G, wk).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const prestigeRank = (G, id) => 1 + Object.values(G.teams).filter(t => t.prestige > G.teams[id].prestige).length;
const duelsOf = (N, id) => N.schedule.filter(d => d.a === id || d.b === id);
const eventsOf = (N, id) => N.tournaments.filter(t => t.kind === 'open' && t.teams.includes(id));
const busyAt = (N, wk, id) => N.schedule.some(d => d.week === wk && (d.a === id || d.b === id)) || N.tournaments.some(t => t.week === wk && t.teams.includes(id));

// What is the user's team doing in this week of the draft?
export function weekState(G, wk) {
  const N = ensureNext(G), me = G.userTeam, cal = N.cal;
  if (wk === cal.ncaaWeek) return { locked: true, kind: 'ncaa', label: 'NCAA Championships (qualifiers only)' };
  if (wk === cal.selWeek) return { locked: true, kind: 'sel', label: 'NCAA selection week' };
  const nd = N.tournaments.find(t => t.kind === 'dual' && t.week === wk && t.teams.includes(me));
  if (nd) return { locked: true, kind: 'natdual', t: nd, label: `${nd.name} (top ${nd.teams.length} programs, ${nd.loc})` };
  const conf = N.tournaments.find(t => t.kind === 'conf' && t.week === wk && t.teams.includes(me));
  if (conf) return { locked: true, kind: 'conf', t: conf, label: `${conf.name} (conference tournament)` };
  const d = N.schedule.find(x => x.week === wk && (x.a === me || x.b === me));
  if (d && d.conf) return { locked: true, kind: 'confdual', d, label: `${d.a === me ? 'vs' : 'at'} ${G.teams[d.a === me ? d.b : d.a].name} (conference dual)` };
  if (wk > cal.lastDualWeek) return { locked: true, kind: 'none', label: 'No events' };
  const t = N.tournaments.find(x => x.kind === 'open' && x.week === wk && x.teams.includes(me));
  if (t) return { locked: false, kind: 'tourney', t };
  if (d) return { locked: false, kind: 'dual', d };
  return { locked: false, kind: 'bye' };
}
export const currentValue = (G, wk) => { const s = weekState(G, wk); return s.kind === 'tourney' ? 'tourney:' + s.t.id : s.kind === 'dual' ? 'dual:' + (s.d.a === G.userTeam ? s.d.b : s.d.a) : 'bye'; };

// Choices for an editable week: [{ value, label, disabled?, group }]
export function weekOptions(G, wk) {
  const N = ensureNext(G), me = G.userTeam, st = weekState(G, wk), opts = [{ value: 'bye', label: 'Bye (no event)' }];
  if (st.locked) return opts;
  const myEvents = eventsOf(N, me).filter(t => !(st.kind === 'tourney' && st.t === t)).length;
  for (const t of N.tournaments.filter(x => x.kind === 'open' && x.week === wk)) {
    let why = '';
    if (st.kind === 'tourney' && st.t === t) { opts.push({ value: 'tourney:' + t.id, label: `${t.name} — ${t.loc}${t.tier === 'major' ? ' (major)' : ''} · entered`, group: 'Tournaments' }); continue; }
    if (myEvents >= MAX_USER_EVENTS) why = `limit of ${MAX_USER_EVENTS} events`;
    else if (t.tier === 'major' && prestigeRank(G, me) > MAJOR_PRESTIGE_RANK) why = `invitational: top ${MAJOR_PRESTIGE_RANK} programs only`;
    opts.push({ value: 'tourney:' + t.id, label: `Enter ${t.name} — ${t.loc}${t.tier === 'major' ? ' (major)' : ''} · ${t.teams.length} teams${why ? ` — ${why}` : ''}`, disabled: !!why, group: 'Tournaments' });
  }
  const mineDuals = duelsOf(N, me), cur = st.kind === 'dual' ? (st.d.a === me ? st.d.b : st.d.a) : null;
  const cands = Object.keys(G.teams).filter(o => o !== me && G.teams[o].conf !== G.teams[me].conf)
    .filter(o => o === cur || (!busyAt(N, wk, o) && !mineDuals.some(d => d.a === o || d.b === o) && duelsOf(N, o).length < 15))
    .sort((a, b) => G.teams[b].prestige - G.teams[a].prestige);
  for (const o of cands) opts.push({ value: 'dual:' + o, label: `${o === cur ? '' : 'Dual vs '}#${prestigeRank(G, o)} ${G.teams[o].name} (${G.teams[o].conf})${o === cur ? ' · scheduled' : ''}`, group: 'Non-conference duals' });
  return opts;
}

export function setWeek(G, wk, value) {
  const N = ensureNext(G), me = G.userTeam, st = weekState(G, wk);
  if (st.locked) return { ok: false, msg: 'That week is locked: conference duals, the conference tournament and the NCAA Championships cannot be changed.' };
  const opt = weekOptions(G, wk).find(o => o.value === value);
  if (!opt) return { ok: false, msg: 'That option is not available.' };
  if (opt.disabled) return { ok: false, msg: opt.label.split('—').pop().trim() };
  if (value === currentValue(G, wk)) return { ok: true };
  // clear what is there now
  if (st.kind === 'dual') N.schedule.splice(N.schedule.indexOf(st.d), 1);
  if (st.kind === 'tourney') st.t.teams = st.t.teams.filter(x => x !== me);
  const [kind, arg] = value.split(':');
  if (kind === 'tourney') N.tournaments.find(t => t.id === arg).teams.push(me);
  if (kind === 'dual') {
    const nid = 1 + Math.max(-1, ...N.schedule.map(d => parseInt(d.id.slice(1), 10)));
    const home = (wk + arg.length) % 2 === 0;
    N.schedule.push({ id: 'd' + nid, week: wk, a: home ? me : arg, b: home ? arg : me, done: false, result: null, conf: false });
    N.schedule.sort((x, y) => x.week - y.week);
  }
  N.edits++;
  return { ok: true };
}

export function nextStats(G) {
  const N = ensureNext(G), me = G.userTeam, ds = duelsOf(N, me), ev = eventsOf(N, me);
  const duals = ds.length, conf = ds.filter(d => d.conf).length, nd = N.tournaments.some(t => t.kind === 'dual' && t.teams.includes(me)), est = duals + EST_PER_EVENT * (ev.length + 1) + (nd ? 2.5 : 0);
  const warn = est < TARGET[0] + 3 ? 'light' : est > TARGET[1] - 1 ? 'heavy' : '';
  return { duals, conf, nonConf: duals - conf, events: ev.length, est: Math.round(est), warn };
}
