// Tournament engine: double-elimination brackets with wrestlebacks (NCAA style: champ bracket + consolation, top-8 placement),
// team scoring, conference tournaments, NCAA qualification (auto bids + at-large) and the NCAA Championships.
import { simulateBout } from '../engine/bout.js';
import { makeRng } from '../engine/rng.js';
import { WEIGHTS } from '../data/gen.js';
import { CONF_BIDS, NCAA_FIELD } from '../data/tournaments.js';
import { overall, wrestlerAt, sanitizeLineup, startEnergy, autoLineup, giveInjury, matchInjuryChance, FATIGUE } from './core.js';
import { runDual } from './dualtourney.js';
import { recordBout, recordPlacement, seasonOf, eloOf, ELO_PER_OVR, ensurePolls } from './stats.js';

const PLACE_PTS = { 1: 16, 2: 12, 3: 10, 4: 9, 5: 7, 6: 6, 7: 4, 8: 3 };
const BONUS_PTS = { 'Fall': 2, 'Tech Fall': 1.5, 'Major Decision': 1 };
// Tournament form: each entrant gets a per-event rating shift (peaking, a bad weekend, nagging injuries) whose spread shrinks for the true elite
// (sd = FORM.sd * clamp((FORM.hi - OVR) / FORM.span, FORM.min, 1)), so mid-tier wrestlers produce unseeded All-Americans and upsets while 19-20s stay reliable.
export const FORM = { sd: 1.3, hi: 19.5, span: 6, min: 0.15 };
const TEAM_PTS = { 'Fall': 6, 'Tech Fall': 5, 'Major Decision': 4 };

export function seedOrder(P) { let o = [1]; while (o.length < P) { const n = o.length * 2; o = o.flatMap(s => [s, n + 1 - s]); } return o; }
const roundName = (r, k) => (r === k ? 'Final' : r === k - 1 ? 'Semifinal' : r === k - 2 ? 'Quarterfinal' : `Round of ${2 ** (k - r + 1)}`);
// Reveal order of a double-elim bracket with 2^k slots (k >= 2). Top-side rounds T1..Tk, consolation rounds I<r> (losers of top round r paired among
// themselves / previous consolation winners) and P<r> (consolation winners vs the losers dropping out of top round r), then placement matches, then the Final LAST.
// Order: T1 T2, then consolation rounds as soon as their matchups exist, pulling in the next top round only when a P<r> needs its losers.
export function roundPlan(k) {
  const cons = []; if (k >= 3) cons.push('I1');
  for (let r = 2; r <= k - 1; r++) { cons.push('P' + r); if (r < k - 1) cons.push('I' + r); }
  const steps = ['T1']; let tops = 1;
  const need = r => { while (tops < r) steps.push('T' + ++tops); };
  if (k >= 3) need(2);
  for (const c of cons) { if (c[0] === 'P') need(+c.slice(1)); steps.push(c); }
  steps.push('PL', 'T' + k);
  return Object.fromEntries(steps.map((x, i) => [x, i + 1]));
}

// entries sorted by seed (best first). play(a, b, inChampBracket, label) -> { w, l } (entries). Returns Map(entry -> place); unlisted = 9+.
export function runBracket(entries, play) {
  const places = new Map(), N = entries.length;
  if (!N) return places;
  if (N === 1) { places.set(entries[0], 1); return places; }
  let list = entries;
  if (N === 33) { const r = play(entries[31], entries[32], true, 'Pigtail', 0, 'Pigtail'); places.set(r.l, 33); list = entries.slice(0, 31).concat([r.w]); }
  const n = list.length, k = Math.ceil(Math.log2(n)), P = 2 ** k;
  let cur = seedOrder(P).map(s => (s <= n ? list[s - 1] : null));
  const wbL = {}, plan = roundPlan(k);
  const topName = r => (r === k ? 'Finals' : r === k - 1 ? 'Semifinals' : r === k - 2 ? 'Quarterfinals' : `Round of ${2 ** (k - r + 1)}`);
  // consolation rounds are numbered in play order, skipping any that turn out empty (byes in small fields)
  const seq = Object.keys(plan).filter(x => x[0] === 'I' || x[0] === 'P').sort((a, b) => plan[a] - plan[b]), used = new Set(), consName = new Proxy({}, { get: (_, st) => { used.add(st); return 'Consolation ' + seq.filter(x => used.has(x)).length; } });
  for (let r = 1; r <= k; r++) {
    const next = [], losers = [];
    for (let i = 0; i < cur.length; i += 2) {
      const a = cur[i], b = cur[i + 1];
      if (a && b) { const x = play(a, b, true, roundName(r, k), plan['T' + r], topName(r)); next.push(x.w); losers.push(x.l); } else { next.push(a || b); losers.push(null); }
    }
    wbL[r] = losers; cur = next;
  }
  places.set(cur[0], 1); if (wbL[k][0]) places.set(wbL[k][0], 2);
  if (k === 1) return places;
  const pairs = (A, B, label, step) => { // elementwise A[i] vs B[i]
    const w = [], l = [];
    for (let i = 0; i < A.length; i++) {
      const a = A[i], b = B[i];
      if (a && b) { const x = play(a, b, false, label, plan[step], consName[step]); w.push(x.w); l.push(x.l); } else { w.push(a || b); l.push(null); }
    }
    return { w, l };
  };
  const internal = (A, label, step) => { const a = [], b = []; for (let i = 0; i < A.length; i += 2) { a.push(A[i]); b.push(A[i + 1]); } return pairs(a, b, label, step); };
  let lb = null, combineL = [], internalL = [];
  for (let r = 1; r <= k - 1; r++) {
    const L = wbL[r];
    if (r === 1) lb = L.slice();
    else { const x = pairs(lb, L.slice().reverse(), 'Consolation', 'P' + r); lb = x.w; if (r === k - 1) combineL = x.l; }
    if (r < k - 1) { const x = internal(lb, 'Consolation', 'I' + r); lb = x.w; if (r === k - 2) internalL = x.l; }
  }
  const settle = (arr, first, label) => {
    const a = arr.filter(Boolean);
    if (a.length === 2) { const x = play(a[0], a[1], false, label, plan.PL, 'Placement matches'); places.set(x.w, first); places.set(x.l, first + 1); }
    else if (a.length === 1) places.set(a[0], first);
  };
  settle(lb, 3, '3rd place match'); settle(combineL, 5, '5th place match'); settle(internalL, 7, '7th place match');
  return places;
}

// ---------- entries ----------
function entriesFor(G, spec, wt, rng) {
  if (spec.kind === 'ncaa') return (spec.field[wt] || []).map(e => ({ ...e }));
  const out = [];
  for (const tid of spec.teams) {
    const t = G.teams[tid], ids = [];
    if (t.lineup[wt] && (!G.wrestlers[t.lineup[wt]].injury || G.wrestlers[t.lineup[wt]].playHurt)) ids.push(t.lineup[wt]);
    if (spec.kind === 'open') { // alternates: user picks, AI sometimes brings a second wrestler
      let alt = tid === G.userTeam ? (G.entries?.[spec.id]?.[wt] || []) : [];
      if (tid !== G.userTeam && rng() < 0.55) {
        const b = t.roster.map(i => G.wrestlers[i]).filter(w => w.natural === wt && !w.injury && !ids.includes(w.id)).sort((a, b) => overall(b) - overall(a))[0];
        if (b) alt = [b.id];
      }
      for (const a of alt) if (!ids.includes(a) && !G.wrestlers[a].injury) ids.push(a);
    }
    for (const id of ids) out.push({ id, team: tid, ss: overall(G.wrestlers[id]) + rng.gauss() * 0.6 });
  }
  return out;
}

// ---------- run one tournament (open / conference / NCAA) ----------
export function runEvent(G, spec, opts = {}) {
  if (spec.kind === 'dual') return runDual(G, spec);   // National Dual Tournament: bracket of dual meets (dualtourney.js)
  const keep = !!opts.keep;   // keep every match (for the round-by-round viewer): only done for the user's own event
  const rng = makeRng(G.seed + spec.week * 99991 + spec.id.length * 131 + [...spec.id].reduce((a, c) => a + c.charCodeAt(0), 0) * 7);
  for (const tid of spec.teams) if (tid !== G.userTeam && spec.kind !== 'ncaa') G.teams[tid].lineup = autoLineup(G, tid);
  if (spec.kind !== 'ncaa' && spec.teams.includes(G.userTeam)) sanitizeLineup(G, G.userTeam);
  const res = { weights: {}, team: {}, userBouts: [], userPlaces: [] }, champs = [];
  const addPts = (tid, p) => { res.team[tid] = (res.team[tid] || 0) + p; };
  for (const wt of WEIGHTS) {
    const entries = entriesFor(G, spec, wt, rng).sort((a, b) => b.ss - a.ss);
    entries.forEach((e, i) => { e.seed = i + 1; e.bouts = 0; e.tp = 0; e.mg = 0; e.n = 0; const ov = overall(G.wrestlers[e.id]); e.form = FORM.sd ? rng.gauss() * FORM.sd * Math.max(FORM.min, Math.min(1, (FORM.hi - ov) / FORM.span)) : 0; });
    const matches = keep ? [] : null;
    const play = (a, b, champ, label, minR = 1, rl = '') => {
      const wa = wrestlerAt(G, a.id, wt), wb = wrestlerAt(G, b.id, wt);
      for (const [x, e] of [[wa, a], [wb, b]]) if (e.form) for (const k of Object.keys(x.attrs)) x.attrs[k] = Math.max(1, Math.min(20, x.attrs[k] + e.form));
      const eA = Math.max(FATIGUE.tourneyFloor, startEnergy(wa) - FATIGUE.tourneyDrain * a.bouts), eB = Math.max(FATIGUE.tourneyFloor, startEnergy(wb) - FATIGUE.tourneyDrain * b.bouts);
      const seed = rng.int(1, 2e9), pa = G.teams[a.team].plan, pb = G.teams[b.team].plan;
      const r = simulateBout(wa, wb, { seed, planA: pa, planB: pb, energyA: eA, energyB: eB });
      recordBout(G, a.id, b.id, wt, r);
      a.bouts++; b.bouts++;
      const win = r.winner === 'A' ? a : b, lose = win === a ? b : a;
      win.tp += TEAM_PTS[r.method] ?? 3; win.mg += Math.abs(r.score.A - r.score.B); win.n++; lose.n++;   // dominance bookkeeping for the Outstanding Wrestler award
      addPts(win.team, (champ ? 1 : 0.5) + (BONUS_PTS[r.method] || 0));
      const uIdx = (a.team === G.userTeam || b.team === G.userTeam) ? res.userBouts.length : -1;
      // round = 1 + the latest round either wrestler just came from (so consolation rounds line up with the championship rounds)
      const lvl = Math.max(minR, (a.lvl ?? -1) + 1, (b.lvl ?? -1) + 1);   // explicit reveal level (roundPlan); dependency is only a safety net
      if (keep) { const i = matches.length; matches.push({ i, l: lvl, rl, c: champ ? 1 : 0, lb: label, a: a.id, b: b.id, sa: a.seed, sb: b.seed, pa: a.lm ?? -1, pb: b.lm ?? -1, w: r.winner, m: r.method, d: r.detail, u: uIdx }); a.lm = b.lm = i; }
      a.lvl = b.lvl = lvl;
      if (a.team === G.userTeam || b.team === G.userTeam) {
        res.userBouts.push({ wt, label, a: a.id, b: b.id, aTeam: a.team, bTeam: b.team, aName: wa.name, bName: wb.name, w: r.winner, d: r.detail, sA: r.score.A, sB: r.score.B, seed, eA, eB, planA: pa, planB: pb,
          snapA: { name: wa.name, school: wa.school, weight: wt, attrs: wa.attrs }, snapB: { name: wb.name, school: wb.school, weight: wt, attrs: wb.attrs } });
      }
      for (const e of [a, b]) if (rng() < matchInjuryChance(G.wrestlers[e.id]) && !G.wrestlers[e.id].injury) giveInjury(G, G.wrestlers[e.id], rng, e.team === G.userTeam, 'at ' + spec.name);
      return { w: win, l: lose };
    };
    const places = runBracket(entries, play);
    const top = [], all = [];
    for (const e of entries) {
      const p = places.get(e) || 9, w = G.wrestlers[e.id];
      all.push({ id: e.id, team: e.team, place: p, seed: e.seed, ss: e.ss });
      if (p <= 8) { top.push({ id: e.id, name: w.name, team: e.team, place: p }); addPts(e.team, PLACE_PTS[p]); }
      if (spec.kind === 'ncaa') recordPlacement(G, e.id, p);
      w.fatigue = Math.min(100, w.fatigue + FATIGUE.tourneyBout * e.bouts);
      if (e.team === G.userTeam) res.userPlaces.push({ wt, id: e.id, place: p, n: entries.length });
      if (spec.kind === 'conf' || spec.kind === 'ncaa') ((w.tr ||= {})[G.season] ||= {})[spec.kind === 'conf' ? 'c' : 'n'] = p;   // personal tournament history (9 = competed, did not place)
      if (p === 1 && e.n) champs.push({ e, wt });
    }
    top.sort((x, y) => x.place - y.place);
    res.weights[wt] = { n: entries.length, top, all: spec.kind === 'conf' ? all : undefined, matches: matches || undefined, ent: keep ? entries.map(e => ({ id: e.id, team: e.team, seed: e.seed })) : undefined };
  }
  // Outstanding Wrestler: the champion who was most dominant (average team points per match: decision 3, major 4, tech fall 5, fall 6; ties by average margin)
  if (champs.length) {
    const best = champs.slice().sort((x, y) => (y.e.tp / y.e.n) - (x.e.tp / x.e.n) || (y.e.mg / y.e.n) - (x.e.mg / x.e.n))[0], w = G.wrestlers[best.e.id];
    res.mow = { id: best.e.id, name: w.name, team: best.e.team, wt: best.wt, tpm: Math.round(best.e.tp / best.e.n * 100) / 100, n: best.e.n };
    (w.aw ||= []).push({ season: G.season, ev: spec.name, wt: best.wt, wk: spec.week });
  }
  res.teamScores = Object.entries(res.team).map(([team, pts]) => ({ team, pts })).sort((a, b) => b.pts - a.pts);
  delete res.team;
  spec.result = res; spec.done = true;
  return res;
}

// ---------- conference -> NCAA ----------
export function makeConfTournaments(G, confs) {
  return confs.map((conf, i) => ({
    id: 'c' + i, name: conf + ' Championships', kind: 'conf', conf, week: G.cal.confWeek, tier: 'conf', loc: conf, dates: G.cal.confDates,
    teams: Object.values(G.teams).filter(t => t.conf === conf).map(t => t.id), done: false, result: null,
  }));
}

// Committee "resume score" (on an OVR-like scale, so it also seeds the bracket): Elo-equivalent rating (already reflects who he beat and lost to),
// win%, bonus-point rate, conference finish, minus a penalty for a thin schedule.
export function resumeScore(G, id, confPlace) {
  const w = G.wrestlers[id], st = seasonOf(w), n = st[0] + st[1];
  const eq = 12 + (eloOf(w) - 1500) / ELO_PER_OVR, pct = n ? st[0] / n : 0.5, bonus = st[0] ? (st[2] + st[3] + st[4]) / st[0] : 0;
  return eq + 2 * (pct - 0.5) + 0.8 * bonus + (confPlace <= 8 ? (9 - confPlace) * 0.12 : 0) - (n < 10 ? (10 - n) * 0.12 : 0);
}

// Builds the field (called once the conference results are applied to stats) and the data for the selection show; nothing is announced until it is revealed.
export function computeNcaaField(G) {
  const field = {}, show = {}, teamsIn = new Set(), polls = ensurePolls(G);
  const confTs = G.tournaments.filter(t => t.kind === 'conf' && t.done);
  for (const wt of WEIGHTS) {
    const autos = [], pool = [];
    for (const t of confTs) {
      const bids = CONF_BIDS[t.conf] ?? 1, w = t.result.weights[wt];
      for (const e of w.all) {
        const st = seasonOf(G.wrestlers[e.id]), rk = (polls[wt] || []).indexOf(e.id) + 1;
        const entry = { id: e.id, team: e.team, ss: Math.round(resumeScore(G, e.id, e.place) * 1000) / 1000, rec: [st[0], st[1]], rk, cp: e.place };
        if (e.place <= bids && e.place <= 8) autos.push({ ...entry, via: 'auto' }); else pool.push({ ...entry, via: 'at-large' });
      }
    }
    pool.sort((a, b) => b.ss - a.ss);
    const room = Math.max(0, NCAA_FIELD - autos.length), picked = pool.slice(0, room), rest = pool.slice(room);
    const f = autos.concat(picked).sort((a, b) => b.ss - a.ss).slice(0, NCAA_FIELD);
    field[wt] = f; f.forEach(e => teamsIn.add(e.team));
    show[wt] = { lastIn: picked.slice(-4).reverse(), firstOut: rest.slice(0, 4), out: rest.map(e => ({ id: e.id, team: e.team, ss: e.ss, rk: e.rk, rec: e.rec })) };
  }
  G.ncaa = { season: G.season, field, show, rv: { cnt: Object.fromEntries(WEIGHTS.map(wt => [wt, 0])), last: null, done: false } };
  const spec = { id: 'ncaa', name: 'NCAA Championships', kind: 'ncaa', tier: 'ncaa', week: G.cal.ncaaWeek, loc: 'NCAA Championships', dates: G.cal.ncaaDates, teams: [...teamsIn], field, done: false, result: null };
  G.tournaments.push(spec);
  return spec;
}

// the selection show is over (watched or skipped): everything is public, tell the user who got in
export function completeSelection(G) {
  const n = G.ncaa; if (!n || !n.rv || n.rv.done) return;
  for (const wt of WEIGHTS) n.rv.cnt[wt] = n.field[wt].length;
  n.rv.done = true;
  const mine = [];
  for (const wt of WEIGHTS) for (const e of n.field[wt]) if (e.team === G.userTeam) mine.push(`${G.wrestlers[e.id].name} (${wt}, #${n.field[wt].indexOf(e) + 1} seed${e.via === 'at-large' ? ', at-large' : ''})`);
  G.inbox.unshift({ week: G.week, title: `NCAA field set: ${mine.length} qualifier${mine.length === 1 ? '' : 's'} from ${G.teams[G.userTeam].name}`, body: mine.length ? mine.join(', ') : 'No qualifiers this year.' });
}

// keep each finished event's winners (team + weight champions) for the tournament profile; pruneReplays drops the rest
export function recordTHist(G, t) {
  if (t.logged || !t.done || !t.result) return;
  t.logged = true;
  const r = t.result, champs = {};
  if (t.kind === 'dual') { ((G.tHist ||= {})[t.name] ||= []).push({ season: G.season, team: r.champion, pts: r.teamScores[0]?.pts, champs }); return; }
  for (const wt of WEIGHTS) { const c = r.weights[wt]?.top[0]; if (c) champs[wt] = { id: c.id, name: c.name, team: c.team }; }
  ((G.tHist ||= {})[t.name] ||= []).push({ season: G.season, team: r.teamScores[0]?.team, pts: r.teamScores[0]?.pts, champs, mow: r.mow });
}

export function finalizeSeason(G, spec) {
  const r = spec.result, champs = {}, aa = {};
  for (const wt of WEIGHTS) {
    for (const e of r.weights[wt].top) {
      if (e.place === 1) champs[wt] = { name: e.name, team: e.team };
      aa[e.team] = (aa[e.team] || 0) + 1;
    }
  }
  const idx = r.teamScores.findIndex(t => t.team === G.userTeam);
  const mine = r.userPlaces.filter(p => p.place <= 8);
  G.history = G.history || [];
  G.history.push({ season: G.season, champion: r.teamScores[0]?.team, top: r.teamScores.slice(0, 16), champs, userFinish: idx < 0 ? null : idx + 1, userPts: idx < 0 ? 0 : r.teamScores[idx].pts, userAA: mine.length, userChamps: r.userPlaces.filter(p => p.place === 1).length, aa });
  const team = G.teams[G.userTeam].name;
  G.inbox.unshift({ week: G.week, title: `NCAA Championships: ${G.teams[r.teamScores[0].team].name} wins the team title`, body: idx < 0 ? `${team} had no qualifiers.` : `${team} finished #${idx + 1} with ${r.teamScores[idx].pts} points, ${mine.length} All-American${mine.length === 1 ? '' : 's'}, ${r.userPlaces.filter(p => p.place === 1).length} national champion(s).` });
}
