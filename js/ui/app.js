// Game shell: Football-Manager-style screens over the game core.
import { ATTR_KEYS, ATTR_LABELS, fmtClock } from '../engine/bout.js';
import { WEIGHTS, ARCHETYPES } from '../data/gen.js';
import { SCHOOLS, CONFERENCES } from '../data/schools.js';
import { PRACTICE, INTENSITY, FOCUS_SHARES } from '../data/practice.js';
import * as R from '../game/recruit.js';
import { beginOffseason, startNewSeason, advanceOffseason, offStep, OFF_STEPS } from '../game/offseason.js';
import {
  newGame, autoLineup, canWrestle, overall, ovr, wrestlerAt, playDual, beginDual, stepDual, userSub, subOptions, skipToWeek, replayBout, userDual, userEvent, playEvent, teamEvents, teamTournaments, finishWeek,
  records, rankings, tournamentRankings, teamStrength, fmtDate, startWeightMove, cancelWeightMove, canMove, CLASS_NAMES, potLabel, ethicLabel, coachFactor,
  INJURY_INFO, REHAB, AGGRAVATE, reinjuryMult, matchInjuryChance, durability,
} from '../game/core.js';
import { LOGOS_ENABLED, LOGO_IDS } from '../data/logos.js';
import * as L from '../game/live.js';
import * as SEL from '../game/selection.js';
import * as D from '../game/dualtourney.js';
const D_NAME = D.DUAL_NAME;
import { seedOrder } from '../game/tourney.js';
import * as S from '../game/sched.js';
import { TEAM_COLORS } from '../data/teamcolors.js';
import { seasonOf, careerOf, derived, KEYS, ensurePolls, flushStats, pendingStats } from '../game/stats.js';

import { initSaves, loadLast, loadSlot, saveGame, saveAs, copySlot, renameSlot, deleteSlot, listSaves, MAX_SLOTS } from '../game/saves.js';
const $app = document.getElementById('app');
await initSaves();
let G = await loadLast();
const ui = { rec: { tab: 'targets', msg: '', wt: 0, status: 'open', limit: 40, sel: null }, screen: 'home', sel: null, conf: null, dual: null, view: null, timer: null, vtimer: null, pick: null, pickConf: CONFERENCES[0], coach: 'Coach' };

const ABBR = { str: 'STR', cardio: 'CAR', speed: 'SPD', flex: 'FLX', tdo: 'TDO', tdd: 'TDD', hand: 'HND', topc: 'TPC', topt: 'TPT', botEsc: 'BTC', botRes: 'BTR', big: 'BIG', comp: 'CMP', iq: 'IQ' };
const tier = v => (v >= 18 ? 't4' : v >= 15 ? 't3' : v >= 11 ? 't2' : 't1');
const NAV = [['home', 'Home'], ['roster', 'Roster'], ['lineup', 'Lineup'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['rankings', 'Rankings'], ['stats', 'Stats'],
  ['train', 'Training'], ['injuries', 'Injuries'], ['recruit', 'Recruiting']];

// ---------- helpers ----------
const me = () => G.teams[G.userTeam];
const injBadge = () => { const n = me().roster.filter(id => G.wrestlers[id].injury).length; return n ? ` <span class="neg"><b>${n}</b></span>` : ''; };
const rankMap = () => Object.fromEntries(rankings(G).map(r => [r.id, r.rank]));
// ---------- school logos ----------
// A logo (assets/logos/<id>.png) when we have one, else a coloured initials badge. tn() = logo + team name, used wherever a team is listed.
const hue = str => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
function schoolLogo(id, name, px = 22) {
  if (LOGOS_ENABLED && LOGO_IDS.has(id)) return `<img class="logo" src="assets/logos/${id}.png" width="${px}" height="${px}" alt="" loading="lazy">`;
  const ini = name.replace(/[^A-Za-z& ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  return `<span class="logo badge" style="width:${px}px;height:${px}px;line-height:${px}px;font-size:${Math.round(px * 0.42)}px;background:hsl(${hue(name)} 42% 36%)">${ini}</span>`;
}
const tn = (id, px = 22) => `<span class="tn">${schoolLogo(id, G.teams[id].name, px)}<a class="wlink" data-act="team" data-v="${id}">${G.teams[id].name}</a></span>`;   // team name -> team profile
const tl = (name, label) => `<a class="wlink" data-act="tprofile" data-v="${String(name).replace(/"/g, "&quot;")}">${label ?? name}</a>`;   // tournament name -> tournament profile
// clickable wrestler name -> profile screen (idOrWrestler, optional label)
// Ratings are hidden outside Roster / Profile / Recruiting: elsewhere a wrestler shows his season record and top-25 poll rank.
const wrank = w => { const p = (ensurePolls(G)[w.lw || w.natural] || []).indexOf(w.id) + 1; return p || 0; };
const wtxt = w => { const st = seasonOf(w), p = wrank(w); return `${st[0]}-${st[1]}${p ? ' #' + p : ''}`; };
const wstat = w => { const st = seasonOf(w), p = wrank(w); return `<span class="muted">${st[0]}-${st[1]}</span>${p ? ` <b class="rk">#${p}</b>` : ''}`; };
const wl = (x, label) => { const id = typeof x === 'string' ? x : x.id, w = G.wrestlers[id]; const nm = label ?? (w ? w.name : '?'); return w ? `<a class="wlink" data-act="profile" data-v="${id}">${nm}</a>` : nm; };
const tag = (id, rm) => `#${rm[id]} ${tn(id)}`;
const attrCell = v => `<td class="ac ${tier(v)}">${v}</td>`;
const save = () => saveGame(G);
const stopTimers = () => { clearInterval(ui.timer); clearInterval(ui.vtimer); ui.timer = ui.vtimer = null; };
function go(screen) { if (!['profile', 'team', 'tprofile'].includes(screen)) ui.stack = []; stopTimers(); ui.screen = screen; ui.view = null; render(); }

// ---------- shell ----------
function render() {
  if (!G) { $app.innerHTML = startScreen(); bind(); return; }
  document.documentElement.style.setProperty('--tc', TEAM_COLORS[G.userTeam] || '#3fb27f');   // your team's colour, used to highlight your wrestlers
  const rec = records(G)[G.userTeam], ev = userEvent(G);
  const label = G.phase === 'seasonEnd' ? 'Begin offseason ▶' : G.phase === 'offseason' ? ({ cut: 'Done cutting → Progression ▶', progress: 'Continue → Recruiting ▶', recruit: 'Done recruiting → Schedule ▶' }[offStep(G)] || `Start ${G.season + 1} season ▶`) : ev && ev.type === 'tourney' && ev.ref.kind === 'dual' && D.inProgress(ev.ref) ? 'Resume tournament ▶' : ev && !ev.done ? (ev.type === 'dual' ? 'Go to dual day ▶' : 'Go to tournament ▶') : ev && liveTourney() ? 'Resume tournament ▶' : ev ? 'Finish week ▶' : G.week === G.cal.selWeek && SEL.selActive(G) ? 'Selection show ▶' : G.week === G.cal.selWeek ? 'Advance (selection week) ▶' : 'Advance (bye week) ▶';
  const body = { home, roster, lineup, schedule, standings, rankings: rankingsScreen, stats: statsScreen, profile, team: teamProfile, tprofile: tournamentProfile, offseason: offseasonScreen, dualday, dual, recruit: recruiting, train: training, injuries, tourneyday, tourney, selection, dtourney }[ui.screen]();
  $app.innerHTML = `
  <div class="top"><b>${tn(G.userTeam, 28)}</b><span class="muted">Coach ${G.coach}</span><span class="muted">${G.phase === 'seasonEnd' ? 'Season over' : G.phase === 'offseason' ? `Offseason ${G.season}` : `Week ${G.week} · ${fmtDate(G.week)}`}</span>
    <span class="muted">Record ${rec.w}-${rec.l}</span>
    <span style="margin-left:auto"></span>
    <button data-act="continue">${label}</button>
    <button class="secondary" data-act="save">Save</button><button class="secondary" data-act="saveas" title="Copy this career into a new save slot">Save as…</button><button class="secondary" data-act="menu">Menu</button></div>
  <div class="layout"><nav>${NAV.concat(G.phase === 'offseason' ? [['offseason', 'Offseason']] : G.phase === 'season' && G.ncaa && G.ncaa.show && G.week >= G.cal.selWeek ? [['selection', 'NCAA selection']] : []).map(([k, n, off]) => `<a data-act="nav" data-v="${k}" class="${ui.screen === k ? 'on' : ''} ${off ? 'off' : ''}">${n}${off ? ' <small>soon</small>' : ''}${k === 'injuries' ? injBadge() : ''}</a>`).join('')}
    <hr><a href="lab.html" class="off2">Match Lab</a><a href="harness.html" class="off2">Balance harness</a></nav>
  <section class="content">${body}</section></div>${ui.modal ? modalHtml() : ''}`;
  bind();
  const feed = document.getElementById('feed'); if (feed) feed.scrollTop = feed.scrollHeight;
}
function bind() {
  $app.querySelectorAll('[data-act]').forEach(el => el.onclick = e => { e.stopPropagation(); act(el.dataset.act, el.dataset, e); });
  $app.querySelectorAll('[data-chg]').forEach(el => el.onchange = () => chg(el.dataset.chg, el));
}

// ---------- advancing the week ----------
function advance() { finishWeek(G); ui.dual = null; ui.live = false; save(); return go('home'); }
// recruiting hours that would be thrown away by advancing now (0 = no warning needed)
function wastedHours() {
  if (G.phase !== 'season' || G.week > G.cal.lastWeek || G.rec.noWarn || (G.rec.mode || 'manual') !== 'manual') return 0;
  const h = G.rec.hours;
  return h >= 1 && Object.values(G.recruits).some(r => r.status === 'open') ? h : 0;
}
function tryAdvance() { const h = wastedHours(); if (h > 0) { ui.modal = { hours: h }; return render(); } return advance(); }
function modalHtml() {
  const h = ui.modal.hours, last = R.lastPlanSize(G), board = R.boardOf(G).filter(id => G.recruits[id] && G.recruits[id].status === 'open').length;
  return `<div class="modal-back"><div class="modal card"><h3 style="margin-top:0">⚠ Unused recruiting hours</h3>
    <p>You still have <b>${h}</b> of ${R.WEEKLY_HOURS} recruiting hours this week. Hours don't carry over, so they will be wasted if you advance now.</p>
    <p class="muted">${board ? `${board} open target${board === 1 ? '' : 's'} on your board.` : 'Your target board is empty.'}</p>
    <div class="row"><button data-act="modal_auto">⚡ Auto-recruit, then advance</button>${last ? `<button data-act="modal_rep">↻ Repeat last week, then advance</button>` : ''}</div>
    <div class="row" style="margin-top:8px"><button class="secondary" data-act="modal_go">Go to Recruiting</button><button class="secondary" data-act="modal_adv">Advance anyway</button><button class="secondary" data-act="modal_cancel">Cancel</button></div>
    <p class="hint" style="margin-top:10px"><label><input type="checkbox" data-chg="nowarn"> Don't warn me about this again</label></p></div></div>`;
}

// ---------- actions ----------
function act(a, d) {
  if (a === 'nav') return go(d.v);
  if (a === 'schedreset') { if (confirm('Throw away your changes and go back to the suggested schedule?')) { S.buildNext(G); save(); } return render(); }
  if (a === 'rec_auto') { const log = R.autoRecruit(G); ui.rec.autoMsg = log.actions ? R.describeAuto(log) : 'Nothing to do right now (no hours left, or no open recruits you can pursue).'; save(); return render(); }
  if (a === 'rec_repeat') { const log = R.repeatLastWeek(G); ui.rec.autoMsg = log.actions ? R.describeAuto(log) : 'None of last week\'s actions could be repeated (already done this week, no hours, or those recruits are gone).'; save(); return render(); }
  if (a === 'modal_cancel') { ui.modal = null; return render(); }
  if (a === 'modal_go') { ui.modal = null; ui.rec.tab = 'targets'; return go('recruit'); }
  if (a === 'modal_adv') { ui.modal = null; return advance(); }
  if (a === 'modal_auto') { ui.modal = null; R.autoRecruit(G); return advance(); }
  if (a === 'modal_rep') { ui.modal = null; R.repeatLastWeek(G); return advance(); }
  if (a === 'profile') return openProf('profile', 'prof', d.v);
  if (a === 'team') return openProf('team', 'tm', d.v);
  if (a === 'tprofile') return openProf('tprofile', 'tp', d.v);
  if (a === 'profback') { const b = (ui.stack || []).pop(); if (!b) return go('roster'); ui.prof = b.prof; ui.tm = b.tm; ui.tp = b.tp; return go(b.screen); }
  if (a === 'rkmode') { ui.rk.mode = d.v; return render(); }
  if (a === 'rkwt') { ui.rk.wt = +d.v; return render(); }
  if (a === 'stview') { ui.stat.view = d.v; return render(); }
  if (a === 'stscope') { ui.stat.scope = d.v; return render(); }
  if (a === 'stsort') { ui.stat.sort = d.v; return render(); }
  if (a === 'stcat') { ui.stat.cat = d.v; return render(); }
  if (a === 'continue') {
    if (G.phase === 'seasonEnd') { beginOffseason(G); save(); return go('offseason'); }
    if (G.phase === 'offseason') {
      const step = offStep(G);
      if (step === 'schedule') {
        if (!confirm('Start the new season? Portal decisions will be resolved and your offers and schedule are final.')) return;
        startNewSeason(G); save(); ui.rec.tab = 'targets'; return go('home');
      }
      const res = advanceOffseason(G);
      if (!res.ok) { alert(res.msg); return go('offseason'); }
      save(); const nxt = offStep(G); if (nxt === 'recruit') ui.rec.tab = 'portal';
      return go(nxt === 'recruit' ? 'recruit' : nxt === 'schedule' ? 'schedule' : 'offseason');
    }
    const ev = userEvent(G);
    if (ev && ev.type === 'tourney' && ev.ref.kind === 'dual' && D.inProgress(ev.ref)) { ui.tid = ev.ref.id; return go('dtourney'); }
    if (ev && !ev.done) return go(ev.type === 'dual' ? 'dualday' : 'tourneyday');
    const lt = liveTourney(); if (lt) { ui.tid = lt.id; ui.live = true; return go(lt.kind === 'dual' ? 'dtourney' : 'tourney'); }
    if (G.phase === 'season' && G.week === G.cal.selWeek && SEL.selActive(G)) return go('selection');   // watch the selection show first
    return tryAdvance();
  }
  if (a === 'save') { save(); const b = document.querySelector('[data-act=save]'); if (b) { b.textContent = 'Saved ✓'; setTimeout(() => b && (b.textContent = 'Save'), 1200); } return; }
  if (a === 'menu') { if (confirm('Return to the start screen? (Your game is saved first.)')) { stopTimers(); save(); G = null; render(); } return; }
  if (a === 'pickteam') { ui.pick = d.v; return render(); }
  if (a === 'begin') { G = newGame(ui.pick, ui.coach || 'Coach', undefined, { real: ui.useReal !== false }); save(); ui.screen = 'home'; return render(); }
  if (a === 'loadsave') { loadSlot(d.v).then(g => { if (g) { G = g; ui.screen = 'home'; ui.dual = null; ui.live = false; } render(); }); return; }
  if (a === 'delsave') { if (confirm('Delete this save permanently?')) { deleteSlot(d.v); render(); } return; }
  if (a === 'copysave') { copySlot(d.v).then(() => render()); return; }
  if (a === 'rensave') { const n = prompt('Name this save:', d.n); if (n && n.trim()) { renameSlot(d.v, n.trim().slice(0, 40)); if (G && G.slot === d.v) G.slotName = n.trim().slice(0, 40); render(); } return; }
  if (a === 'saveas') { const n = prompt('Save a copy as (you keep playing the copy):', `${G.coach} · ${G.teams[G.userTeam].name} · ${G.season}`); if (n && n.trim()) { const ok = saveAs(G, n.trim().slice(0, 40)); b2(ok ? 'Saved as new slot ✓' : `Slot limit (${MAX_SLOTS}) reached`); } return; }
  if (a === 'sel') { ui.sel = d.v; return render(); }
  if (a === 'autolineup') { me().lineup = autoLineup(G, G.userTeam); save(); return render(); }
  if (a === 'startdual') {
    const du = userDual(G); beginDual(G, du); if (du.prog) du.prog.manual = true; save();   // the dual is simulated bout by bout so you can coach it
    ui.dual = { id: du.id, shown: du.result.bouts.length, live: true }; return go('dual');
  }
  if (a === 'starttourney') {
    const ev = userEvent(G);
    if (ev.ref.kind === 'dual') { D.startDual(G, ev.ref); save(); ui.tid = ev.ref.id; return go('dtourney'); }
    playEvent(G, ev.ref, { keep: true }); L.initLive(ev.ref);   // simulated up front; revealed as you choose
    save(); ui.tid = ev.ref.id; ui.tview = 'team'; ui.live = true; ui.rwt = null; return go('tourney');
  }
  if (a === 'tadv') { const t = G.tournaments.find(x => x.id === ui.tid); if (t && L.isLive(t)) { L.advanceLive(t, d.v, +ui.rwt || WEIGHTS[0]); save(); } return render(); }
  if (a === 'skipgo') {
    const sk = ui.skip, sum = skipToWeek(G, sk.wk, { recruit: sk.rec, pause: sk.pause }); save(); ui.dual = null; ui.live = false;
    if (sum.paused) { ui.tid = null; }
    return go('home');
  }
  if (a === 'opentourney') { const tt0 = G.tournaments.find(x => x.id === d.v); if (tt0 && tt0.kind === 'dual' && tt0.br) { ui.tid = tt0.id; return go('dtourney'); } ui.tid = d.v; ui.tview = 'team'; ui.live = false; return go('tourney'); }
  if (a === 'selnext' || a === 'selweek' || a === 'selall') { const cw = SEL.curWeight(G); SEL.advanceSel(G, { selnext: 'next', selweek: 'weight', selall: 'all' }[a]); ui.selwt = a === 'selall' ? WEIGHTS[WEIGHTS.length - 1] : cw || ui.selwt; save(); return render(); }
  if (a === 'dtwatch' || a === 'dtsim' || a === 'dtround' || a === 'dtall') {
    const t = G.tournaments.find(x => x.id === ui.tid && x.kind === 'dual'); if (!t || t.done) return render();
    if (a === 'dtwatch') { D.settleDone(G, t); const ref = D.nextMatch(G, t); if (!ref) { save(); return render(); } const du = D.beginMatch(G, t, ref); if (du.prog) du.prog.manual = true; save(); ui.dual = { id: du.id, shown: du.result.bouts.length, live: true, tid: t.id }; return go('dual'); }
    if (a === 'dtsim') D.simNext(G, t); else if (a === 'dtround') D.simRound(G, t); else D.simAll(G, t);
    save(); return render();
  }
  if (a === 'opendtdual') { ui.dual = { id: d.v, shown: 10, live: false, tid: ui.tid }; return go('dual'); }
  if (a === 'backtourn') { ui.dual = null; const t = G.tournaments.find(x => x.id === ui.tid); if (t && t.kind === 'dual') { D.settleDone(G, t); save(); } return go('dtourney'); }
  if (a === 'selwt') { ui.selwt = +d.v; return render(); }
  if (a === 'tview') { ui.tview = d.v; return render(); }
  if (a === 'watchtb') {
    const t = G.tournaments.find(x => x.id === ui.tid), b = t.result.userBouts[+d.v];
    ui.view = { idx: +d.v, res: replayBout(b), shown: 0, playing: true }; return startFeed();
  }
  if (a === 'cancelmove') { cancelWeightMove(G, d.v); save(); return render(); }
  if (a === 'rectab') { ui.rec.tab = d.v; return render(); }
  if (a === 'recsel') { ui.rec.sel = d.v; ui.rec.msg = ''; return render(); }
  if (a === 'recmore') { ui.rec.limit += 40; return render(); }
  if (a === 'recadd') { const res = R.addTarget(G, d.v); ui.rec.msg = res.ok ? '' : res.msg; if (!res.ok) alert(res.msg); save(); return render(); }
  if (a === 'recrem') { R.removeTarget(G, d.v); save(); return render(); }
  if (a === 'recclear') { R.clearClosedTargets(G); save(); return render(); }
  if (a === 'recact') {
    const topic = d.t === 'pitch' ? document.getElementById('pitchsel')?.value : undefined;
    const res = R.doAction(G, d.v, d.t, Math.random, topic);
    ui.rec.msg = res.msg; ui.rec.sel = d.v; if (res.ok) R.addTarget(G, d.v); save(); return render();
  }
  if (a === 'recscout') { if (!R.scout(G, d.v)) alert('Not enough hours (or already fully scouted).'); save(); return render(); }
  if (a === 'reccontact') { if (!R.contact(G, d.v, Math.random)) alert('Need 2 hours.'); save(); return render(); }
  if (a === 'recvisit') { if (!R.visit(G, d.v, Math.random)) alert('Need 6 hours and at least 20 interest before a campus visit.'); save(); return render(); }
  if (a === 'recoffer') { const v = +document.getElementById('aidsel').value; if (!R.offer(G, d.v, v)) alert('Not enough scholarship room.'); save(); return render(); }
  if (a === 'cutw') { const w = G.wrestlers[d.v]; if (w && R.cutsNeeded(G) && confirm(`Cut ${w.name} (${w.natural}, ${CLASS_NAMES[w.cls]})? He will enter the transfer portal.`)) { R.cutToPortal(G, G.userTeam, d.v); save(); } return render(); }
  if (a === 'cutauto') { const n = R.cutsNeeded(G); if (n && confirm(`Auto-cut the ${n} lowest-value wrestler${n === 1 ? '' : 's'} (starters and depth at each weight are protected)?`)) { R.autoCut(G, G.userTeam); save(); } return render(); }
  if (a === 'recwithdraw') { R.withdraw(G, d.v); save(); return render(); }
  if (a === 'pofferv') { const v = +document.getElementById('pa-' + d.v).value; if (!R.portalOffer(G, d.v, v)) alert('Not enough scholarship room.'); save(); return render(); }
  if (a === 'pwithdraw') { R.portalWithdraw(G, d.v); save(); return render(); }
  if (a === 'opendual') { ui.dual = { id: d.v, shown: 10, live: false }; return go('dual'); }
  if (a === 'next') { const du = findDual(ui.dual.id); simTo(du, ui.dual.shown + 1, false); ui.dual.shown = Math.min(10, ui.dual.shown + 1); save(); return render(); }
  if (a === 'auto') {
    stopTimers(); ui.timer = setInterval(() => { const du = findDual(ui.dual.id); simTo(du, ui.dual.shown + 1, false); ui.dual.shown++; if (ui.dual.shown >= 10) { stopTimers(); save(); } render(); }, 1100); return;   // your lineup is honored while auto-running
  }
  if (a === 'dualjump') { stopTimers(); simTo(findDual(ui.dual.id), 10, false); ui.dual.shown = 10; save(); return render(); }
  if (a === 'finishweek') return tryAdvance();
  if (a === 'backsched') return go('schedule');
  if (a === 'watchbout') {
    stopTimers(); const du = findDual(ui.dual.id), b = du.result.bouts[+d.v];
    ui.view = { idx: +d.v, res: replayBout(b), shown: 0, playing: true }; return startFeed();
  }
  if (a === 'watchnext') {
    stopTimers(); const du = findDual(ui.dual.id), i = ui.dual.shown; simTo(du, i + 1, false); const b = du.result.bouts[i];
    if (!b || !b.seed) { ui.dual.shown = Math.min(10, i + 1); return render(); }   // vacant/forfeit: nothing to watch
    ui.view = { idx: i, res: replayBout(b), shown: 0, playing: true, reveal: i }; return startFeed();
  }
  if (a === 'viewjump') { clearInterval(ui.vtimer); ui.view.shown = ui.view.res.log.length; ui.view.playing = false; revealWatched(); return render(); }
  if (a === 'viewclose') { clearInterval(ui.vtimer); revealWatched(); ui.view = null; return render(); }
}
// a bout watched with "Watch next match" counts as revealed in the dual once the viewer finishes or closes
const simTo = (du, n, assist) => { while (!du.done && du.result.bouts.length < n) stepDual(G, du, { assist }); };
function revealWatched() { const v = ui.view; if (v && v.reveal != null && ui.dual) ui.dual.shown = Math.max(ui.dual.shown, Math.min(10, v.reveal + 1)); }
// profile screens (wrestler, team, tournament) chain: Back returns to the previous profile or screen
function openProf(screen, key, val) { (ui.stack ||= []).push({ screen: ui.screen, prof: ui.prof, tm: ui.tm, tp: ui.tp }); ui[key] = val; return go(screen); }
function startFeed() {
  clearInterval(ui.vtimer); render();
  ui.vtimer = setInterval(() => {
    if (!ui.view) return clearInterval(ui.vtimer);
    ui.view.shown++;
    if (ui.view.shown >= ui.view.res.log.length) { clearInterval(ui.vtimer); ui.view.playing = false; revealWatched(); }
    render();
  }, 1000);
}
function chg(k, el) {
  if (k === 'coach') { ui.coach = el.value; return; }
  if (k === 'usereal') { ui.useReal = el.checked; return; }
  if (k === 'recmode') { G.rec.mode = el.value; save(); return render(); }
  if (k === 'nowarn') { G.rec.noWarn = el.checked; save(); return; }
  if (k === 'pickconf') { ui.pickConf = el.value; ui.pick = null; return render(); }
  if (k === 'conf') { ui.conf = el.value; return render(); }
  if (k === 'alt') { const tid = el.dataset.t; G.entries[tid] = G.entries[tid] || {}; G.entries[tid][el.dataset.wt] = el.value ? [el.value] : []; save(); return; }
  if (k === 'aid') {
    const w = G.wrestlers[el.dataset.w], nv = +el.value, free = R.aidAvailable(G, G.userTeam) - R.pendingOffers(G, G.userTeam);
    if (nv - (w.aid || 0) > free + 1e-9) { alert('Not enough scholarship room (' + Math.max(0, free).toFixed(2) + ' available after pending offers).'); return render(); }
    w.aid = nv; save(); return render();
  }
  if (k === 'wmove') { if (el.value) startWeightMove(G, el.dataset.w, el.value); save(); return render(); }
  if (k === 'recwt') { ui.rec.wt = +el.value; ui.rec.limit = 40; return render(); }
  if (k === 'recstatus') { ui.rec.status = el.value; ui.rec.limit = 40; return render(); }
  if (k === 'sched') { const r = S.setWeek(G, +el.dataset.wk, el.value); if (!r.ok) alert(r.msg); save(); return render(); }
  if (k === 'twt') { ui.twt = +el.value; return render(); }
  if (k === 'rwt') { ui.rwt = +el.value; return render(); }
  if (k === 'skipwk') { ui.skip.wk = +el.value; return; }
  if (k === 'skiprec') { ui.skip.rec = el.value; return; }
  if (k === 'skippause') { ui.skip.pause = el.checked; return; }
  if (k === 'plan') { me().plan = el.value; save(); return; }
  if (k === 'assist') { G.assist = el.checked; save(); return; }
  if (k === 'dualsub') { const du = findDual(ui.dual.id), r = userSub(G, du, +el.dataset.wt, el.value || null); if (!r.ok) alert(r.msg); save(); return render(); }
  if (k === 'tfocus') { G.training.focus[+el.dataset.i] = el.value; save(); return render(); }
  if (k === 'tint') { G.training.intensity = el.value; save(); return render(); }
  if (k === 'wfocus') { G.wrestlers[el.dataset.w].focus = el.value || null; save(); return render(); }
  if (k === 'slot') {
    const wt = +el.dataset.wt, lu = me().lineup, wid = el.value || null;
    if (wid && !canWrestle(G.wrestlers[wid], wt)) return render();   // never below his natural weight
    if (wid) for (const w of WEIGHTS) if (lu[w] === wid) lu[w] = null; // a wrestler can only start at one weight
    lu[wt] = wid; if (wid) { const w = G.wrestlers[wid]; w.playHurt = !!w.injury; } save(); return render();
  }
}

// ---------- start screen ----------
const b2 = msg => { const b = document.querySelector('[data-act=saveas]'); if (b) { const o = b.textContent; b.textContent = msg; setTimeout(() => b && (b.textContent = o), 1800); } };
function saveList() {
  const L = listSaves(); if (!L.length) return '';
  const sch = id => (SCHOOLS.find(x => x.id === id) || {}).name || id, when = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `<div class="card"><h2>Saved careers <small class="muted">(${L.length}/${MAX_SLOTS})</small></h2><table class="tbl dense"><tr><th>Save</th><th>Team</th><th>Season</th><th>Last played</th><th></th></tr>${L.map((m, i) => `<tr><td><b>${m.name.replace(/</g, '&lt;')}</b></td><td>${schoolLogo(m.school, sch(m.school), 18)} ${sch(m.school)}</td><td>${m.season}${m.phase === 'offseason' ? ' offseason' : m.phase === 'seasonEnd' ? ' (final)' : ' · wk ' + m.week}</td><td class="muted">${when(m.ts)}</td>
    <td style="white-space:nowrap"><button data-act="loadsave" data-v="${m.id}">${i === 0 ? 'Continue' : 'Load'}</button> <button class="secondary" data-act="rensave" data-v="${m.id}" data-n="${m.name.replace(/"/g, '&quot;')}">Rename</button> <button class="secondary" data-act="copysave" data-v="${m.id}">Duplicate</button> <button class="secondary" data-act="delsave" data-v="${m.id}">Delete</button></td></tr>`).join('')}</table></div>`;
}
function startScreen() {
  const list = SCHOOLS.filter(s => s.conf === ui.pickConf).map(s =>
    `<tr data-act="pickteam" data-v="${s.id}" class="${ui.pick === s.id ? 'me' : ''}" style="cursor:pointer"><td>${schoolLogo(s.id, s.name, 22)} ${s.name}</td><td>${'★'.repeat(Math.max(1, Math.round(s.prestige / 20)))}</td><td class="muted">${s.prestige >= 85 ? 'Powerhouse' : s.prestige >= 65 ? 'Contender' : s.prestige >= 50 ? 'Mid-major' : 'Rebuilding'}</td></tr>`).join('');
  return `<div class="start"><h1>Wrestling Coach</h1><p class="muted">Take over a Division I program. Recruit, develop, schedule, and chase an NCAA title.</p>
    ${saveList()}
    <div class="card"><h2>New career</h2>
      <div class="row"><label>Your name <input data-chg="coach" value="${ui.coach}"></label>
      <label>Conference <select data-chg="pickconf">${CONFERENCES.map(c => `<option ${c === ui.pickConf ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
      <table class="tbl"><tr><th>School</th><th>Prestige</th><th></th></tr>${list}</table>
      <p><label><input type="checkbox" data-chg="usereal" ${ui.useReal !== false ? 'checked' : ''}> Use real wrestler names and rosters (2026-27 rosters from team sites, ratings from WrestleStat). Uncheck to play with fully generated names.</label></p>
      <p>${ui.pick ? `Selected: <b>${(sc => schoolLogo(sc.id, sc.name, 24) + ' ' + sc.name)(SCHOOLS.find(s => s.id === ui.pick))}</b>` : 'Pick a school.'} <button data-act="begin" ${ui.pick ? '' : 'disabled'}>Start career</button></p>
      <p class="hint">Real names and starters come from public 2026-27 roster and ranking data; each wrestler's ratings are estimated for the game, and backups are placed below their team's starter. Schools, prestige and conference alignment are approximate (js/data/schools.js).</p></div></div>`;
}

// ---------- screens ----------
function home() {
  const rm = rankMap(), t = me(), du = userDual(G), rk = rankings(G);
  let next;
  const ev = userEvent(G);
  if (G.phase === 'offseason') next = `<b>Offseason ${G.season}</b> — step ${Math.max(1, OFF_STEPS.findIndex(s => s[0] === offStep(G)) + 1)} of 4: <b>${(OFF_STEPS.find(s => s[0] === offStep(G)) || [])[1]}</b>. Go to the <a data-act="nav" data-v="offseason">Offseason</a> page, and use the top-right button to move to the next step. Roster has scholarships, Training has weight moves.`;
  else if (G.phase === 'seasonEnd') {
    const h = G.history[G.history.length - 1], rec = records(G)[G.userTeam];
    next = `<b>Season complete.</b> Dual record ${rec.w}-${rec.l}.` + (h ? `<br>NCAA champion: <b>${tn(h.champion)}</b>. ${h.userFinish ? `You finished <b>#${h.userFinish}</b> (${h.userPts} pts) with ${h.userAA} All-American${h.userAA === 1 ? '' : 's'} and ${h.userChamps} national champion${h.userChamps === 1 ? '' : 's'}.` : 'You had no NCAA qualifiers.'}` : '');
  } else if (ev && ev.type === 'tourney') {
    const tt = ev.ref;
    next = `<b>Week ${G.week} · ${tt.dates}</b><br><b>${tl(tt.name)}</b> — ${tt.loc}<br><span class="muted">${tt.teams.length} teams${tt.kind === 'dual' ? ' · single-elimination dual meet bracket, top 16 programs' : tt.kind === 'conf' ? ' · qualifies wrestlers for the NCAA Championships' : tt.kind === 'ncaa' ? ' · the national championships' : ''}</span>`;
  } else if (!ev) next = G.week === G.cal.selWeek ? (SEL.selActive(G) ? `<b>Week ${G.week} — NCAA selection week.</b> The committee has met. <a data-act="nav" data-v="selection">Open the selection show</a> to see who made the field.` : `<b>Week ${G.week} — NCAA selection week.</b> The field is set (see <a data-act="nav" data-v="selection">NCAA selection</a>). Taper or rest your qualifiers before the Championships.`) : `<b>Week ${G.week} — Bye week.</b> Nothing scheduled. Use the time to set your lineup and training.`;
  else {
    const du = ev.ref, opp = du.a === G.userTeam ? du.b : du.a, home = du.a === G.userTeam;
    const them = autoLineup(G, opp), mineAvg = teamStrength(G, G.userTeam);
    const tmp = G.teams[opp].lineup; G.teams[opp].lineup = them; const oppAvg = teamStrength(G, opp); G.teams[opp].lineup = tmp;
    next = `<b>Week ${G.week} · ${fmtDate(G.week)}</b><br>${home ? 'vs' : 'at'} <b>${tag(opp, rm)}</b> (${G.teams[opp].conf}${du.conf ? ' — conference dual' : ''})<br>
      <span class="muted">Lineup strength: you ${mineAvg.toFixed(1)} · them ${oppAvg.toFixed(1)}</span>`;
  }
  const top = rk.slice(0, 12).map(r => `<tr class="${r.id === G.userTeam ? 'me' : ''}"><td>${r.rank}</td><td>${tn(r.id)}</td><td>${r.w}-${r.l}</td><td>${Math.round(r.power)}</td></tr>`).join('');
  const mine = rk.find(r => r.id === G.userTeam);
  const injRows = t.roster.map(id => G.wrestlers[id]).filter(w => w.injury).map(w => `<div class="msg"><b>${wl(w)}</b> (${w.natural}) — ${w.injury.what}, ${w.injury.weeks}w</div>`).join('');
  const inbox = G.inbox.slice(0, 6).map(m => `<div class="msg"><b>${m.title}</b><div class="muted">${m.body}</div></div>`).join('');
  return `<div class="grid2"><div><div class="card"><h2>Next up</h2>${next}</div><div class="card"><h2>Injury report</h2>${injRows || '<span class="muted">Nobody injured.</span>'}</div><div class="card"><h2>Inbox</h2>${inbox || 'No messages.'}</div></div>
    <div class="card"><h2>Top 12 <small class="muted">(you: #${mine.rank})</small></h2><table class="tbl"><tr><th>#</th><th>Team</th><th>Rec</th><th>Pwr</th></tr>${top}</table></div></div>`;
}

function roster() {
  const t = me(), lu = new Set(Object.values(t.lineup));
  const ws = t.roster.map(id => G.wrestlers[id]).sort((a, b) => a.natural - b.natural || overall(b) - overall(a));
  const rows = ws.map(w => `<tr data-act="sel" data-v="${w.id}" class="${ui.sel === w.id ? 'me' : ''}" style="cursor:pointer"><td>${wl(w)}</td><td>${CLASS_NAMES[w.cls]}</td><td>${w.natural}</td>
    <td><b>${ovr(w)}</b></td><td>${lu.has(w.id) ? '★' : ''}</td><td>${Math.round((w.aid || 0) * 100)}%</td><td class="${w.fatigue > 60 ? 'neg' : 'muted'}">${Math.round(w.fatigue)}</td><td>${w.injury ? `<span class="neg">🩹 ${w.injury.weeks}w</span>` : ''}</td>${ATTR_KEYS.map(k => attrCell(w.attrs[k])).join('')}</tr>`).join('');
  const s = ui.sel && G.wrestlers[ui.sel];
  const det = s && s.team === G.userTeam ? `<div class="card"><h2>${s.name}</h2><div class="sub">${CLASS_NAMES[s.cls]} · ${s.natural} lbs · ${ARCHETYPES[s.archetype].label} · OVR ${ovr(s)} · Potential: ${potLabel(s)} · ${ethicLabel(s)}${s.injury ? ` · <span class="neg">Injured: ${s.injury.what}, ${s.injury.weeks}w</span>` : ''}</div>
    <div class="cols2">${ATTR_KEYS.map(k => `<div class="attr"><span>${ATTR_LABELS[k]}</span><div class="bar"><i class="${tier(s.attrs[k])}" style="width:${s.attrs[k] * 5}%"></i></div><b>${s.attrs[k]}</b></div>`).join('')}</div><div class="row" style="margin-top:8px"><label>Scholarship <select data-chg="aid" data-w="${s.id}">${[0, 0.25, 0.5, 0.75, 1].map(a => `<option value="${a}" ${Math.abs((s.aid || 0) - a) < 0.01 ? 'selected' : ''}>${a * 100}%</option>`).join('')}</select></label><span class="hint">Team aid used ${R.teamAidUsed(G, G.userTeam).toFixed(2)} of ${R.AID_CAP} (pending recruit offers ${R.pendingOffers(G, G.userTeam).toFixed(2)})</span></div><div class="row" style="margin-top:8px"><label>Individual training focus <select data-chg="wfocus" data-w="${s.id}"><option value="">Team plan</option>${Object.entries(PRACTICE).map(([k, p]) => `<option value="${k}" ${s.focus === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label><span class="hint">70% of this wrestler's training goes to it.</span></div></div>` : '<p class="hint">Click a wrestler for details. ★ = in the starting lineup.</p>';
  return `<div class="card" style="overflow-x:auto"><h2>Roster <small class="muted">${ws.length} wrestlers · limit ${R.ROSTER_MAX} (cut down in the offseason)</small></h2>
    <table class="tbl dense"><tr><th>Name</th><th>Cl</th><th>Wt</th><th>OVR</th><th></th><th>Aid</th><th>Fat</th><th>Status</th>${ATTR_KEYS.map(k => `<th title="${ATTR_LABELS[k]}">${ABBR[k]}</th>`).join('')}</tr>${rows}</table></div>${det}`;
}

function lineup() {
  const t = me(), du = userDual(G), opp = du && !du.done ? G.teams[du.a === G.userTeam ? du.b : du.a] : null;
  const oppLu = opp ? autoLineup(G, opp.id) : null;
  const ws = t.roster.map(id => G.wrestlers[id]).sort((a, b) => a.natural - b.natural || overall(b) - overall(a));
  const rows = WEIGHTS.map(wt => {
    const cur = t.lineup[wt], w = cur && wrestlerAt(G, cur, wt);
    const opts = ['<option value="">— Forfeit —</option>'].concat(ws.filter(x => canWrestle(x, wt) || x.id === cur).map(x => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''} ${x.injury && x.injury.sev === 'severe' ? 'disabled' : ''}>${x.injury ? '🩹 ' : ''}${x.name} · ${CLASS_NAMES[x.cls]} (${x.natural}) ${wtxt(x)} · F${Math.round(x.fatigue)}${x.natural !== wt ? ' ⚠' : ''}${x.injury ? ' · plays hurt' : ''}</option>`)).join('');
    let vs = '';
    if (opp) { const ow = oppLu[wt] && wrestlerAt(G, oppLu[wt], wt);
      vs = ow ? `${wl(ow)} <span class="muted">${CLASS_NAMES[ow.cls]}</span> ${wstat(ow)}` : '<span class="muted">forfeit</span>'; }
    return `<tr><td class="fit"><b>${wt}</b></td><td class="fit"><select data-chg="slot" data-wt="${wt}">${opts}</select></td><td class="fit">${w ? wstat(w) : '—'}</td><td>${vs}</td></tr>`;
  }).join('');
  const off = WEIGHTS.filter(wt => t.lineup[wt] && G.wrestlers[t.lineup[wt]].natural !== wt).length;
  return `<div class="card"><h2>Lineup</h2><div class="row"><button data-act="autolineup">Auto-fill best lineup</button>
    <label title="When a dual is simulated without you opening it (skipping ahead, tournament sims), the assistant rests starters in a clinched dual and re-optimises matchups when you are losing. Once you open a dual, your own lineup is used."><input type="checkbox" data-chg="assist" ${G.assist !== false ? 'checked' : ''}> Assistant coach makes in-dual lineup moves</label>
    <label>Team game plan <select data-chg="plan">${['aggressive', 'balanced', 'conservative'].map(p => `<option ${p === t.plan ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    <span class="muted">Strength ${teamStrength(G, G.userTeam).toFixed(2)}</span></div>
    <table class="tbl"><tr><th class="fit">Wt</th><th class="fit">Starter</th><th class="fit">Record / rank</th><th>${opp ? `Opponent (${tn(opp.id, 18)})` : 'Opponent'}: record / rank</th></tr>${rows}</table>
    <p class="hint">⚠ = bumped up one class from his natural weight (-3 Strength, -2 Cardio, -2 Speed, -1 Takedown Def. for the event, about -0.65 OVR; his weight class does not change). A wrestler can never start below his natural weight; to move him permanently (up or down) use a weight move in Training: about 5 weeks, then he is a real member of the new class with almost no penalty (a move up gives +1 Strength, -1 Speed; a cut down -1 Strength, -1 Cardio, +1 Speed). ${off ? `${off} off-weight starter(s).` : ''} An empty slot is a forfeit (6 points to the opponent).<br>
    Aggressive: more shots and pins, more fatigue and counter risk. Conservative: fewer mistakes, fewer points.</p></div>`;
}

function scheduleEditor() {
  const N = S.ensureNext(G), cal = N.cal, st = S.nextStats(G), me = G.userTeam, rows = [];
  for (let wk = 1; wk <= cal.lastWeek; wk++) {
    const w = S.weekState(G, wk);
    let cell;
    if (w.locked) cell = `<span class="muted">🔒 ${w.label}</span>`;
    else {
      const opts = S.weekOptions(G, wk), cur = S.currentValue(G, wk), groups = [...new Set(opts.map(o => o.group || ''))];
      cell = `<select data-chg="sched" data-wk="${wk}" style="max-width:640px">${groups.map(g => { const os = opts.filter(o => (o.group || '') === g).map(o => `<option value="${o.value}" ${o.value === cur ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${o.label}</option>`).join(''); return g ? `<optgroup label="${g}">${os}</optgroup>` : os; }).join('')}</select>`;
    }
    rows.push(`<tr><td>${wk}</td><td>${S.fmtNext(G, wk)}</td><td>${cell}</td></tr>`);
  }
  const load = st.warn === 'heavy' ? `<span class="neg">heavy</span>` : st.warn === 'light' ? `<span class="warn">light</span>` : `<span class="pos">good</span>`;
  return `<div class="card"><h2>${N.season} schedule <small class="muted">(offseason draft)</small></h2>
    <p>You can change your open/major tournaments and non-conference duals. 🔒 Conference duals, your conference tournament and the NCAA Championships are fixed.</p>
    <p><b>${st.duals}</b> duals (${st.conf} conference, ${st.nonConf} non-conference) · <b>${st.events}</b> of ${S.MAX_USER_EVENTS} open/major events + conference tournament · a starter should wrestle about <b>${st.est}</b> matches before the NCAAs (target ${S.TARGET[0]}–${S.TARGET[1]}): ${load}</p>
    <div class="row" style="margin-bottom:8px"><button class="secondary" data-act="schedreset">↺ Reset to suggested schedule</button></div>
    <table class="tbl"><tr><th>Wk</th><th>Date</th><th>Event</th></tr>${rows.join('')}</table>
    <p class="hint">Opponents shown are free that week and from other conferences. Majors invite only the top ${S.MAJOR_PRESTIGE_RANK} programs. Removing a dual just gives that opponent a bye. The schedule takes effect when you start the season.</p></div>`;
}
function weekNote(wk) {
  const cal = G.cal, t = teamTournaments(G, G.userTeam).find(x => x.week === wk), d = teamEvents(G, G.userTeam).find(x => x.week === wk);
  if (t) return `${t.name} (your event)`;
  if (d) { const home = d.a === G.userTeam; return `${home ? 'vs' : 'at'} ${G.teams[home ? d.b : d.a].name}`; }
  return wk === cal.selWeek ? 'NCAA selection week' : wk === cal.ncaaWeek ? 'NCAA Championships' : 'bye';
}
function skipControls() {
  if (G.phase !== 'season') return '';
  const sk = (ui.skip ||= { wk: null, rec: 'auto', pause: true }), cal = G.cal, opts = [];
  for (let wk = G.week + 1; wk <= cal.lastWeek + 1; wk++) opts.push([wk, wk > cal.lastWeek ? 'End of the season' : `Week ${wk} · ${fmtDate(wk)} — ${weekNote(wk)}`]);
  if (!opts.length) return '';
  if (!opts.find(o => o[0] === sk.wk)) sk.wk = opts[0][0];
  return `<div class="row" style="margin-bottom:10px;align-items:flex-end"><label>Skip ahead to <select data-chg="skipwk">${opts.map(([wk, n]) => `<option value="${wk}" ${wk === sk.wk ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Recruiting meanwhile <select data-chg="skiprec">${[['auto', 'Full auto (AI logic)'], ['repeat', "Repeat last week's plan"], ['keep', 'My weekly setting'], ['none', 'None (hours are lost)']].map(([k, n]) => `<option value="${k}" ${sk.rec === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label><input type="checkbox" data-chg="skippause" ${sk.pause ? 'checked' : ''}> Pause before my tournaments</label>
    <button data-act="skipgo">Skip ▶</button></div>
    <p class="hint" style="margin-top:-4px">Simulates every week up to (not including) the chosen one: your duals and tournaments, everyone else's events, training and injuries, and recruiting under the setting above. Results land in your inbox.</p>`;
}
function schedule() {
  if (G.phase === 'offseason') return offBar() + scheduleEditor();
  const rm = rankMap(), cal = G.cal, duals = Object.fromEntries(teamEvents(G, G.userTeam).map(d => [d.week, d])), tours = {};
  for (const t of teamTournaments(G, G.userTeam)) tours[t.week] = t;
  const rows = [];
  for (let wk = 1; wk <= cal.lastWeek; wk++) {
    const d = duals[wk], t = tours[wk], cur = wk === G.week && G.phase !== 'seasonEnd';
    if (t) {
      let res = '<span class="muted">—</span>';
      if (t.done && !L.isLive(t)) { const idx = t.result.teamScores.findIndex(x => x.team === G.userTeam); res = `<a data-act="opentourney" data-v="${t.id}">${idx < 0 ? 'no points' : t.kind === 'dual' ? `${ordinal(t.result.teamScores[idx].place)} · ${t.result.teamScores[idx].pts} dual win${t.result.teamScores[idx].pts === 1 ? '' : 's'}` : `#${idx + 1} · ${t.result.teamScores[idx].pts} pts`}</a>`; }
      rows.push(`<tr class="${cur ? 'me' : ''}"><td>${wk}</td><td>${t.dates}</td><td><b>${tl(t.name)}</b> <span class="muted">${t.tier === 'major' ? '· major' : t.kind === 'conf' ? '· conference' : t.kind === 'ncaa' ? '· NCAA' : t.kind === 'dual' ? '· national duals' : '· open'}</span></td><td>${t.loc}</td><td>${res}</td></tr>`);
    } else if (d) {
      const home = d.a === G.userTeam, opp = home ? d.b : d.a;
      let res = '<span class="muted">—</span>';
      if (d.done && !(wk === G.week && eventInProgress())) { const my = home ? d.result.sa : d.result.sb, th = home ? d.result.sb : d.result.sa, won = (d.result.winner === 'A') === home; res = `<a data-act="opendual" data-v="${d.id}" class="${won ? 'tcwin' : 'neg'}">${won ? 'W' : 'L'} ${my}-${th}</a>`; }
      rows.push(`<tr class="${cur ? 'me' : ''}"><td>${wk}</td><td>${fmtDate(wk)}</td><td>${home ? 'vs' : 'at'} ${tag(opp, rm)}</td><td>${d.conf ? 'Conference dual' : 'Dual'}</td><td>${res}</td></tr>`);
    } else {
      rows.push(`<tr class="${cur ? 'me' : ''}"><td>${wk}</td><td>${fmtDate(wk)}</td><td class="muted" colspan="3">${wk === cal.selWeek ? 'NCAA selection week' : wk === cal.ncaaWeek ? 'NCAA Championships (qualifiers only)' : 'Bye'}</td></tr>`);
    }
  }
  return `<div class="card"><h2>Schedule</h2>${skipControls()}<table class="tbl"><tr><th>Wk</th><th>Date</th><th>Event</th><th></th><th>Result</th></tr>${rows.join('')}</table></div>`;
}

function standings() {
  const conf = ui.conf || me().conf, rec = records(G), rm = rankMap();
  const rows = Object.values(G.teams).filter(t => t.conf === conf).map(t => ({ t, r: rec[t.id] }))
    .sort((a, b) => (b.r.cw - b.r.cl) - (a.r.cw - a.r.cl) || b.r.cw - a.r.cw || (b.r.w - b.r.l) - (a.r.w - a.r.l) || rm[a.t.id] - rm[b.t.id])
    .map(({ t, r }) => `<tr class="${t.id === G.userTeam ? 'me' : ''}"><td>${tn(t.id)}</td><td>${r.cw}-${r.cl}</td><td>${r.w}-${r.l}</td><td>${r.pf}-${r.pa}</td><td>#${rm[t.id]}</td></tr>`).join('');
  return `<div class="card"><h2>Standings</h2><label>Conference <select data-chg="conf">${CONFERENCES.map(c => `<option ${c === conf ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <table class="tbl"><tr><th>Team</th><th>Conf</th><th>Overall</th><th>Pts F-A</th><th>Rank</th></tr>${rows}</table></div>`;
}

const pill = (act, v, label, on) => `<button class="${on ? '' : 'secondary'}" data-act="${act}" data-v="${v}">${label}</button> `;

// Stats/Rankings hide results of an event that is still being watched; they apply once it is over (or at Finish week).
// only the user's dual of the CURRENT week can be mid-viewing; a stale viewer from an earlier week must never freeze the numbers
const liveTourney = () => G.tournaments.find(t => (L.isLive(t) || (t.kind === 'dual' && D.inProgress(t))) && t.week === G.week && t.teams.includes(G.userTeam)) || null;
const findDual = id => G.schedule.find(x => x.id === id) || (G.tournaments.find(t => t.duals && t.duals.some(d => d.id === id)) || { duals: [] }).duals.find(d => d.id === id);
const eventInProgress = () => { if (G.phase === 'season' && liveTourney()) return true; if (!(ui.dual && ui.dual.live && ui.dual.shown < 10)) return false; const du = findDual(ui.dual.id); return !!(du && du.week === G.week && G.phase === 'season'); };
function syncStats() {
  if (!eventInProgress()) { flushStats(G); return ''; }
  return pendingStats(G) ? '<p class="hint">⏳ An event is in progress — these numbers are from before it started and will update when it ends.</p>' : '';
}
function rankingsScreen() {
  const pend = syncStats();
  const rk = (ui.rk ||= { mode: 'dual', wt: WEIGHTS[0] }); if (rk.mode === 'teams') rk.mode = 'dual';
  const tabs = `<p>${pill('rkmode', 'dual', 'Dual rankings', rk.mode === 'dual')}${pill('rkmode', 'tourney', 'Tournament rankings', rk.mode === 'tourney')}${pill('rkmode', 'weights', 'Weight classes', rk.mode === 'weights')}</p>`;
  if (rk.mode === 'weights') {
    const cur = (ensurePolls(G)[rk.wt] || []).filter(id => G.wrestlers[id]), prev = G.rkPrev ? G.rkPrev[rk.wt] : null;   // graduated wrestlers are gone in the offseason
    const rows = cur.map((id, i) => {
      const w = G.wrestlers[id], st = seasonOf(w), pi = prev ? prev.indexOf(id) : -2, d = pi - i;
      const mv = !prev ? '' : pi < 0 ? '<span class="pos">NEW</span>' : d > 0 ? `<span class="pos">▲${d}</span>` : d < 0 ? `<span class="neg">▼${-d}</span>` : '<span class="muted">–</span>';
      return `<tr class="${w.team === G.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${mv}</td><td>${wl(w)}</td><td class="muted">${CLASS_NAMES[w.cls]}</td><td>${tn(w.team)}</td><td>${st[0]}-${st[1]}</td><td>${st[2]}</td></tr>`;
    }).join('');
    return `<div class="card"><h2>Weight-class rankings</h2>${tabs}${pend}<p>${WEIGHTS.map(wt => pill('rkwt', wt, wt, rk.wt === wt)).join('')}</p>
      <table class="tbl"><tr><th>#</th><th>Move</th><th>${rk.wt} lbs</th><th>Yr</th><th>School</th><th>Rec</th><th>Pins</th></tr>${rows || '<tr><td colspan="7" class="muted">No ranked wrestlers yet.</td></tr>'}</table>
      <p class="hint">Top ${cur.length} by results: a rating that moves only with wins and losses (who you beat, pins and tech falls count more, upsets count more). Preseason polls carry over last season's results. One ranked wrestler per school; freshmen and other newcomers are ranked after they have 3 wins; a wrestler who has not wrestled for 3 weeks or is out injured drops off. Movement is vs. the previous weekly poll; NEW = not ranked then. Records are this season, dual meets and tournaments.</p></div>`;
  }
  ensurePolls(G);
  const mvOf = (key, id, i) => { const prev = G.tkPrev && G.tkPrev[key]; if (!prev) return ''; const pi = prev.indexOf(id), d = pi - i; return pi < 0 ? '<span class="pos">NEW</span>' : d > 0 ? `<span class="pos">▲${d}</span>` : d < 0 ? `<span class="neg">▼${-d}</span>` : '<span class="muted">–</span>'; };
  if (rk.mode === 'tourney') {
    const rows = tournamentRankings(G).slice(0, 40).map((r, i) => {
      const cells = WEIGHTS.map(wt => { const x = r.ranks[wt]; return `<td class="${x && x <= 8 ? 'pos' : 'muted'}" style="text-align:center">${x === null ? '·' : x ? '#' + x : '–'}</td>`; }).join('');
      return `<tr class="${r.id === G.userTeam ? 'me' : ''}"><td>${r.rank}</td><td class="l">${mvOf('tourn', r.id, i)}</td><td class="l">${tn(r.id)}</td><td class="l muted">${G.teams[r.id].conf}</td><td><b>${r.proj.toFixed(1)}</b></td><td>${r.ranked}/10</td>${cells}</tr>`;
    }).join('');
    return `<div class="card"><h2>Tournament rankings <small class="muted">projected NCAA team points</small></h2>${tabs}${pend}
      <div style="overflow-x:auto"><table class="tbl dense"><tr><th>#</th><th class="l">Move</th><th class="l">Team</th><th class="l">Conf</th><th>Proj. pts</th><th>Ranked</th>${WEIGHTS.map(w => `<th>${w}</th>`).join('')}</tr>${rows}</table></div>
      <p class="hint">A prediction of each team's NCAA Championships score from its starting lineup: every starter is worth the average points won by NCAA qualifiers who entered ranked at his spot in his weight-class poll (#1 about 21 points, #4 about 14, #8 about 7, #16 about 2, unranked almost nothing; injured starters count zero). The columns show each starter's current rank (– unranked, · empty slot). It moves with the weekly weight-class polls and your lineup.</p></div>`;
  }
  const rows = rankings(G).slice(0, 40).map((r, i) => `<tr class="${r.id === G.userTeam ? 'me' : ''}"><td>${r.rank}</td><td>${mvOf('dual', r.id, i)}</td><td>${tn(r.id)}</td><td class="muted">${G.teams[r.id].conf}</td><td>${r.w}-${r.l}</td><td class="muted">${r.cw}-${r.cl}</td><td class="muted">${r.pf}-${r.pa}</td><td><b>${Math.round(r.power)}</b></td></tr>`).join('');
  return `<div class="card"><h2>Dual rankings <small class="muted">dual-meet results</small></h2>${tabs}${pend}<table class="tbl"><tr><th>#</th><th>Move</th><th>Team</th><th>Conf</th><th>Dual rec</th><th>Conf</th><th>Pts for-against</th><th>Rating</th></tr>${rows}</table>
    <p class="hint">Rated on dual meets only (tournament duals count): each result moves a team's rating by how it compares with the expectation from the two teams' ratings and by the margin of victory. The preseason ranking comes from the starting lineups: the weight-class poll rank of every starter (see Tournament rankings). Movement is vs. the previous weekly update.</p></div>`;
}

// ---------- stats ----------
const f1 = x => x.toFixed(1), pc = x => Math.round(x * 100) + '%';
const COLS = [
  { k: 'w', h: 'W-L', key: s => s[0], fmt: s => `${s[0]}-${s[1]}` },
  { k: 'pct', h: 'Win%', key: (s, d) => d.pct, fmt: (s, d) => (d.n ? pc(d.pct) : '–'), min: true },
  { k: 'fall', h: 'Pins', key: s => s[2], fmt: s => s[2] },
  { k: 'tf', h: 'TF', key: s => s[3], fmt: s => s[3] },
  { k: 'md', h: 'MD', key: s => s[4], fmt: s => s[4] },
  { k: 'bonus', h: 'Bonus%', key: (s, d) => d.bonus, fmt: (s, d) => (s[0] ? pc(d.bonus) : '–'), min: true },
  { k: 'td', h: 'TD', key: s => s[6], fmt: s => s[6] },
  { k: 'tdb', h: 'TD/bout', key: (s, d) => d.tdb, fmt: (s, d) => (d.n ? d.tdb.toFixed(2) : '–'), min: true },
  { k: 'esc', h: 'Esc', key: s => s[7], fmt: s => s[7] },
  { k: 'rev', h: 'Rev', key: s => s[8], fmt: s => s[8] },
  { k: 'nf', h: 'NF', key: s => s[9], fmt: s => s[9] },
  { k: 'margin', h: 'Margin', key: (s, d) => d.margin, fmt: (s, d) => (d.n ? (d.margin >= 0 ? '+' : '') + f1(d.margin) : '–'), min: true },
  { k: 'aa', h: 'AA', key: s => s[12], fmt: s => s[12] },
  { k: 'ch', h: 'Titles', key: s => s[13], fmt: s => s[13] },
];
const LEADER_KEYS = ['w', 'pct', 'fall', 'bonus', 'td', 'tdb', 'margin'];

function statsScreen() {
  const pend = syncStats();
  const s = (ui.stat ||= { scope: 'season', view: 'team', sort: 'w', cat: 'w' });
  const get = w => (s.scope === 'season' ? seasonOf(w) : careerOf(w));
  const minBouts = s.scope === 'season' ? 5 : 15;
  const head = `<p>${pill('stview', 'team', 'My team', s.view === 'team')}${pill('stview', 'leaders', 'National leaders', s.view === 'leaders')} &nbsp; ${pill('stscope', 'season', 'This season', s.scope === 'season')}${pill('stscope', 'career', 'Career', s.scope === 'career')}</p>`;
  if (s.view === 'leaders') {
    const col = COLS.find(c => c.k === s.cat);
    const all = Object.values(G.wrestlers).map(w => { const st = get(w); return { w, st, d: derived(st) }; }).filter(x => x.d.n > 0 && (!col.min || x.d.n >= minBouts));
    const top = all.sort((a, b) => col.key(b.st, b.d) - col.key(a.st, a.d) || b.d.n - a.d.n).slice(0, 20);
    const rows = top.map((x, i) => `<tr class="${x.w.team === G.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${wl(x.w)}</td><td class="muted">${CLASS_NAMES[x.w.cls]}</td><td>${tn(x.w.team)}</td><td>${x.w.lw || x.w.natural}</td><td>${x.st[0]}-${x.st[1]}</td><td><b>${col.fmt(x.st, x.d)}</b></td></tr>`).join('');
    return `<div class="card"><h2>Stat leaders — ${s.scope === 'season' ? 'this season' : 'career'}</h2>${head}${pend}<p>${LEADER_KEYS.map(k => pill('stcat', k, COLS.find(c => c.k === k).h, s.cat === k)).join('')}</p>
      <table class="tbl"><tr><th>#</th><th>Wrestler</th><th>Yr</th><th>School</th><th>Wt</th><th>Rec</th><th>${col.h}</th></tr>${rows || '<tr><td colspan="7" class="muted">No matches yet.</td></tr>'}</table>
      <p class="hint">${col.min ? `Rate stats need ${minBouts}+ matches. ` : ''}Career covers wrestlers still on a roster, counted from when you started this game.</p></div>`;
  }
  const col = COLS.find(c => c.k === s.sort) || COLS[0];
  const rows = me().roster.map(id => { const w = G.wrestlers[id], st = get(w); return { w, st, d: derived(st) }; })
    .sort((a, b) => col.key(b.st, b.d) - col.key(a.st, a.d) || a.w.natural - b.w.natural);
  const tot = rows.reduce((a, x) => a.map((v, i) => v + x.st[i]), KEYS.map(() => 0)), td = derived(tot);
  const line = (name, st, d, cls = '') => `<tr class="${cls}">${name}${COLS.map(c => `<td>${c.fmt(st, d)}</td>`).join('')}</tr>`;
  const body = rows.map(x => line(`<td>${wl(x.w)}</td><td class="muted">${CLASS_NAMES[x.w.cls]}</td><td>${x.w.natural}</td>`, x.st, x.d)).join('');
  const foot = line('<td><b>Team</b></td><td></td><td></td>', tot, td, 'me');
  return `<div class="card" style="overflow-x:auto"><h2>${tn(G.userTeam, 30)} — ${s.scope === 'season' ? G.season + ' season' : 'career'} stats</h2>${head}${pend}
    <table class="tbl"><tr><th>Wrestler</th><th>Yr</th><th>Wt</th>${COLS.map(c => `<th><a data-act="stsort" data-v="${c.k}" style="cursor:pointer${c.k === s.sort ? ';text-decoration:underline' : ''}">${c.h}</a></th>`).join('')}</tr>${body}${foot}</table>
    <p class="hint">Click a column to sort. Includes dual meets and tournaments (forfeits excluded). Bonus% = share of wins by pin, tech fall or major. TD includes counters. Career starts when you began the game (real wrestlers' pre-game careers aren't included); the Team row sums current wrestlers only.</p></div>`;
}

// ---------- injury center ----------
// ---------- wrestler profile ----------
function profile() {
  const w = G.wrestlers[ui.prof], back = `<button class="secondary" data-act="profback">◀ Back</button>`;
  if (!w) return `<div class="card"><p>This wrestler is no longer on a roster (graduated or left).</p>${back}</div>`;
  const pend = syncStats();
  const mine = w.team === G.userTeam, t = G.teams[w.team], wt = w.lw || w.natural;
  const poll = ensurePolls(G)[wt] || [], pr = poll.indexOf(w.id) + 1;
  const tierC = v => (v >= 18 ? 't4' : v >= 15 ? 't3' : v >= 11 ? 't2' : 't1');
  const bars = ATTR_KEYS.map(k => `<div class="attr"><span>${ATTR_LABELS[k]}</span><div class="bar"><i class="${tierC(w.attrs[k])}" style="width:${w.attrs[k] * 5}%"></i></div><b>${w.attrs[k]}</b></div>`).join('');
  const info = [
    ['Team', tn(w.team, 18)], ['Class', CLASS_NAMES[w.cls] + (w.real ? '' : '')], ['Weight', `${w.natural} lbs${wt !== w.natural ? ` (wrestling ${wt})` : ''}`],
    ['Hometown', w.hm ? w.hm.replace(' / ', ' · ') : '—'], ['Style', ARCHETYPES[w.archetype] ? ARCHETYPES[w.archetype].label : '—'],
    ['Weight-class rank', pr ? `#${pr} at ${wt}` : `unranked at ${wt}`],
    ['Status', w.injury ? `<span class="neg">Injured: ${w.injury.what}, ${w.injury.weeks}w</span>` : w.rehab ? `<span class="warn">Back from ${w.rehab.what} (re-injury risk raised, ${w.rehab.left}w)</span>` : '<span class="pos">Healthy</span>'],
    ['Fatigue', `${Math.round(w.fatigue)} / 100`],
    ['Potential', mine ? potLabel(w) : '<span class="muted">unscouted</span>'], ['Work ethic', mine ? ethicLabel(w) : '<span class="muted">unscouted</span>'],
    ['Durability', mine ? durability(w) : '<span class="muted">unscouted</span>'], ['Scholarship', mine ? `${Math.round((w.aid || 0) * 100)}%` : '<span class="muted">—</span>'],
  ].map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('');
  // stats: past seasons (w.hist) + this season + career
  const line = (label, st, cls = '') => { const d = derived(st); return `<tr class="${cls}"><td>${label}</td>${COLS.map(c => `<td>${c.fmt(st, d)}</td>`).join('')}</tr>`; };
  const seasons = (w.hist || []).map(h => line(h[0], h.slice(1))).join('');
  const cur = seasonOf(w);
  const statTable = `<div style="overflow-x:auto"><table class="tbl"><tr><th>Season</th>${COLS.map(c => `<th>${c.h}</th>`).join('')}</tr>${seasons}${line(G.season + ' (now)', cur)}${line('<b>Career</b>', careerOf(w), 'me')}</table></div>`;
  // match log: duals this season + the user's tournament matches (other tournaments keep no box scores)
  const hide = eventInProgress() ? G.week : -1, log = [];
  const nameOf = (id, fb) => (G.wrestlers[id] ? wl(id) : fb || '?');
  for (const d of G.schedule.concat(...G.tournaments.map(x => x.duals || []))) {
    if (!d.done || d.week === hide) continue;
    for (const b of d.result.bouts) {
      if (b.wa !== w.id && b.wb !== w.id) continue;
      const side = b.wa === w.id ? 'A' : 'B', oppId = side === 'A' ? b.wb : b.wa, oppTeam = side === 'A' ? d.b : d.a;
      if (b.m === 'Vacant') continue;
      log.push({ week: d.week, ev: `Dual vs ${tn(oppTeam, 16)}`, opp: oppId ? nameOf(oppId, side === 'A' ? b.nb : b.na) : '<span class="muted">forfeit</span>', res: b.w === side, d: b.d || b.m });
    }
  }
  for (const tr of G.tournaments) {
    if (!tr.done || !tr.result || tr.week === hide) continue;
    for (const b of tr.result.userBouts) {
      if (b.a !== w.id && b.b !== w.id) continue;
      const side = b.a === w.id ? 'A' : 'B', oppId = side === 'A' ? b.b : b.a;
      log.push({ week: tr.week, ev: `${tr.name} · ${b.label}`, opp: nameOf(oppId, side === 'A' ? b.bName : b.aName), res: b.w === side, d: b.d });
    }
  }
  log.sort((a, b) => b.week - a.week);
  const logRows = log.slice(0, 25).map(x => `<tr><td class="muted">wk ${x.week}</td><td>${x.ev}</td><td>${x.opp}</td><td class="${x.res ? (w.team === G.userTeam ? 'tcwin' : 'pos') : 'neg'}">${x.res ? 'W' : 'L'} ${x.d}</td></tr>`).join('');
  const cs = careerOf(w);
  return `<div class="card"><div class="row"><button class="secondary" data-act="profback">◀ Back</button></div>
    <div style="display:flex;align-items:center;gap:14px;margin-top:10px">${schoolLogo(w.team, t.name, 56)}
      <div><h2 style="margin:0">${w.name}${w.real ? '' : ''}</h2><div class="muted">${CLASS_NAMES[w.cls]} · ${w.natural} lbs · ${t.name}${pr ? ` · #${pr} at ${wt}` : ''}</div></div>
      <div style="margin-left:auto;text-align:right"><div class="muted" style="font-size:12px">OVERALL</div><div style="font-size:34px;font-weight:700;line-height:1">${ovr(w)}</div></div></div>${pend}
    <div class="cols2" style="margin-top:14px;align-items:start"><div><h3>Info</h3><table class="tbl">${info}</table></div><div><h3>Ratings</h3><div class="cols2">${bars}</div>${tourCard(w, hide)}</div></div>
    <h3 style="margin-top:14px">Stats</h3>${statTable}
    <p class="muted">Career: ${cs[0]}-${cs[1]}${cs[0] + cs[1] ? ` (${Math.round(cs[0] / (cs[0] + cs[1]) * 100)}%)` : ''} · ${cs[2]} pins · ${cs[12]} All-American finish${cs[12] === 1 ? '' : 'es'} · ${cs[13]} national title${cs[13] === 1 ? '' : 's'}. Career counts start when you began the game.</p>
    <h3 style="margin-top:14px">Recent matches</h3>
    ${logRows ? `<table class="tbl"><tr><th>When</th><th>Event</th><th>Opponent</th><th>Result</th></tr>${logRows}</table>` : '<p class="muted">No matches yet this season.</p>'}
    <p class="hint">Match log shows dual meets plus tournament matches you coached; other schools' tournament matches don't keep box scores.</p></div>`;
}

function injuries() {
  const t = me(), ws = t.roster.map(id => G.wrestlers[id]), inLu = id => WEIGHTS.find(wt => t.lineup[wt] === id);
  const hurt = ws.filter(w => w.injury).sort((a, b) => b.injury.weeks - a.injury.weeks);
  const rehab = ws.filter(w => !w.injury && w.rehab).sort((a, b) => reinjuryMult(b) - reinjuryMult(a));
  const healthy = ws.length - hurt.length;
  const sevCls = s => (s === 'severe' ? 'neg' : s === 'moderate' ? 'warn' : 'muted');
  const retWeek = w => { const wk = G.week + w.injury.weeks; return wk > G.cal.lastWeek ? 'rest of season' : `week ${wk} (${fmtDate(wk)})`; };
  const risk = w => { const m = reinjuryMult(w), p = matchInjuryChance(w) * 100; return { m, p, label: m >= 1.6 ? 'High' : m > 1.15 ? 'Elevated' : 'Normal' }; };
  const riskCell = w => { const r = risk(w); return `<span class="${r.label === 'High' ? 'neg' : r.label === 'Elevated' ? 'warn' : 'muted'}"><b>${r.label}</b></span> <span class="muted">${r.p.toFixed(1)}% per match${r.m > 1.01 ? ` (×${r.m.toFixed(2)} normal)` : ''}</span>`; };
  const hurtRows = hurt.map(w => {
    const i = w.injury, tot = i.total || i.weeks, wt = inLu(w.id), done = Math.max(0, tot - i.weeks);
    const status = wt ? (w.playHurt ? `<span class="warn">Playing hurt at ${wt}</span>` : `<span class="neg">Starter at ${wt}: replaced at week's end unless you play him hurt</span>`) : '<span class="muted">Sidelined</span>';
    return `<tr><td><b>${wl(w)}</b> <span class="muted">${CLASS_NAMES[w.cls]} · ${w.natural}</span></td>
      <td><b class="${sevCls(i.sev)}">${i.what}</b> <small class="${sevCls(i.sev)}">${i.sev}</small>${i.re ? ' <small class="neg">re-injury</small>' : ''}<br><span class="muted">${INJURY_INFO[i.what] || ''}</span></td>
      <td><b>${i.weeks}</b> more week${i.weeks === 1 ? '' : 's'}<br><span class="muted">back ${retWeek(w)}</span><div class="bar" style="width:110px"><i class="t2" style="width:${Math.round(done / tot * 100)}%"></i></div></td>
      <td>${status}<br><span class="muted">${w.playHurt ? `−physical attributes; ${Math.round(AGGRAVATE * 100)}% per week he wrestles to add 1–3 weeks` : 'Resting counts toward recovery; a Recovery focus can speed it up'}</span></td>
      <td>${riskCell({ ...w, rehab: { sev: i.sev, left: REHAB[i.sev].weeks, total: REHAB[i.sev].weeks } })}<br><span class="muted">after he returns</span></td>
      <td class="muted">${durability(w)}</td></tr>`;
  }).join('');
  const rehabRows = rehab.map(w => `<tr><td><b>${wl(w)}</b> <span class="muted">${CLASS_NAMES[w.cls]} · ${w.natural}</span>${inLu(w.id) ? ` <small class="muted">starter</small>` : ''}</td>
      <td>Back from ${w.rehab.what}</td><td>${w.rehab.left} week${w.rehab.left === 1 ? '' : 's'} left</td><td>${riskCell(w)}</td><td class="muted">${durability(w)}</td></tr>`).join('');
  const log = (G.injLog || []).slice(0, 12).map(x => `<tr><td class="muted">${x.season} wk ${x.week}</td><td>${x.name} <span class="muted">${x.wt}</span></td><td>${x.what}${x.re ? ' <small class="neg">re-injury</small>' : ''}</td><td class="${sevCls(x.sev)}">${x.sev}</td><td class="muted">${x.weeks}w</td></tr>`).join('');
  const fragile = ws.filter(w => w.prone >= 15).length;
  return `<div class="card"><h2>Injury center</h2>
    <p class="muted"><b style="color:var(--text)">${hurt.length}</b> injured · <b style="color:var(--text)">${rehab.length}</b> in rehab window · ${healthy} available · ${fragile} injury-prone on the roster</p>
    <h3>Currently injured</h3>
    ${hurt.length ? `<div style="overflow-x:auto"><table class="tbl"><tr><th>Wrestler</th><th>Injury</th><th>Out</th><th>Status</th><th>Re-injury risk</th><th>Durability</th></tr>${hurtRows}</table></div>` : '<p class="muted">No one is injured.</p>'}
    <h3 style="margin-top:14px">Back from injury — raised risk</h3>
    ${rehab.length ? `<table class="tbl"><tr><th>Wrestler</th><th>Returned from</th><th>Window</th><th>Injury risk now</th><th>Durability</th></tr>${rehabRows}</table>` : '<p class="muted">No one is in a rehab window.</p>'}
    <h3 style="margin-top:14px">Recent injuries</h3>
    ${log ? `<table class="tbl"><tr><th>When</th><th>Wrestler</th><th>Injury</th><th>Severity</th><th>Out</th></tr>${log}</table>` : '<p class="muted">None logged yet.</p>'}
    <p class="hint">Baseline injury chance is per match and depends on his durability and fatigue. After an injury heals, his chance is raised (up to ×${(1 + REHAB.severe.bonus).toFixed(1)} after a severe one) and fades over ${REHAB.minor.weeks}–${REHAB.severe.weeks} weeks, so ease a returning starter in or use a Recovery focus. Hurting himself again during the window adds a week.</p></div>`;
}


function training() {
  const tr = G.training, t = me(), ws = t.roster.map(id => G.wrestlers[id]).sort((a, b) => a.natural - b.natural || overall(b) - overall(a));
  const opts = sel => Object.entries(PRACTICE).filter(([k]) => k !== 'live' || true).map(([k, p]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${p.label}</option>`).join('');
  const names = ['Primary (50%)', 'Secondary (30%)', 'Tertiary (20%)'];
  const avgFat = ws.reduce((s, w) => s + w.fatigue, 0) / ws.length, inj = ws.filter(w => w.injury).length;
  const I = INTENSITY[tr.intensity];
  const trained = {};
  tr.focus.forEach((k, i) => { for (const [at, aw] of Object.entries(PRACTICE[k].attrs)) trained[at] = (trained[at] || 0) + FOCUS_SHARES[i] * aw; });
  const attrNote = Object.entries(trained).sort((a, b) => b[1] - a[1]).map(([at, v]) => `${ATTR_LABELS[at]} ${Math.round(v * 100)}%`).join(' · ') || 'none (recovery only)';
  const rows = ws.map(w => `<tr><td>${wl(w)}</td><td>${w.natural}</td><td>${wstat(w)}</td><td>${CLASS_NAMES[w.cls]}</td><td>${potLabel(w)}</td>
    <td style="width:110px"><div class="bar"><i class="${w.fatigue > 60 ? 't1' : w.fatigue > 35 ? 't2' : 't3'}" style="width:${Math.max(3, w.fatigue)}%"></i></div></td><td>${w.injury ? `<span class="neg">🩹 ${w.injury.what} (${w.injury.weeks}w)</span>` : ''}</td>
    <td><select data-chg="wfocus" data-w="${w.id}"><option value="">Team plan</option>${opts(w.focus)}</select></td>
    <td>${w.move ? `${w.move.dir === 'down' ? 'Cutting' : 'Gaining'} to ${w.move.to} (${w.move.weeks} wk) <a data-act="cancelmove" data-v="${w.id}">cancel</a>` : w.movedSeason === G.season ? '<span class="muted">moved this season</span>' : canMove(G, w) ? `<select data-chg="wmove" data-w="${w.id}"><option value="">Hold ${w.natural}</option>${WEIGHTS.indexOf(w.natural) > 0 ? `<option value="down">Cut to ${WEIGHTS[WEIGHTS.indexOf(w.natural) - 1]}</option>` : ''}${WEIGHTS.indexOf(w.natural) < 9 ? `<option value="up">Gain to ${WEIGHTS[WEIGHTS.indexOf(w.natural) + 1]}</option>` : ''}</select>` : '<span class="muted">—</span>'}</td></tr>`).join('');
  const rowsFixed = rows; // selected states are set per-wrestler via opts(w.focus)
  return `<div class="card"><h2>Team training plan <small class="muted">applies every week until you change it</small></h2>
    <div class="row">${[0, 1, 2].map(i => `<label>${names[i]} <select data-chg="tfocus" data-i="${i}">${opts(tr.focus[i])}</select></label>`).join('')}
    <label>Intensity <select data-chg="tint">${Object.entries(INTENSITY).map(([k, v]) => `<option value="${k}" ${k === tr.intensity ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>
    <p>Training: <b>${attrNote}</b></p>
    <p class="muted">Gain rate ×${I.gain} · fatigue load +${I.fat}/week before recovery · Coaching staff factor ×${coachFactor(t).toFixed(2)} · Team fatigue ${Math.round(avgFat)} · ${inj} injured</p>
    <p class="hint"><b>Periodization:</b> hard weeks build skills faster but pile up fatigue (lower starting energy in matches) and injury risk. Switch to Light or add Recovery before big duals and, later, the conference and NCAA tournaments. Younger, high-potential, hard-working wrestlers improve fastest; attributes near a wrestler's potential grow slowly. Live wrestling and big-move drills carry the most injury risk; film study and flexibility the least.<br><b>Weight moves:</b> a cut or gain takes about 5 weeks (extra fatigue, small attribute shifts) and each wrestler can make only one move per season.</p></div>
    <div class="card" style="overflow-x:auto"><h2>Individual focus <small class="muted">override the plan for one wrestler</small></h2>
    <table class="tbl dense"><tr><th>Name</th><th>Wt</th><th>Record</th><th>Cl</th><th>Potential</th><th>Fatigue</th><th>Status</th><th>Focus</th><th>Weight move</th></tr>${rowsFixed}</table></div>`;
}

function tourneyday() {
  const ev = userEvent(G); if (!ev || ev.type !== 'tourney' || ev.done) return '<div class="card">No tournament to run right now.</div>';
  const t = ev.ref, tm = me();
  let rows = '';
  if (t.kind === 'ncaa') {
    rows = WEIGHTS.map(wt => { const e = t.field[wt].find(x => x.team === G.userTeam); const w = e && G.wrestlers[e.id]; const seed = e ? t.field[wt].indexOf(e) + 1 : null;
      return `<tr><td><b>${wt}</b></td><td>${w ? `${wl(w)} <span class="muted">${CLASS_NAMES[w.cls]}</span> ${wstat(w)} <span class="muted">seed ${seed} · ${e.via}${w.injury ? ' · 🩹' : ''} · F${Math.round(w.fatigue)}</span>` : '<span class="muted">no qualifier</span>'}</td></tr>`; }).join('');
  } else {
    rows = WEIGHTS.map(wt => {
      const w = tm.lineup[wt] && G.wrestlers[tm.lineup[wt]];
      let alt = '';
      if (t.kind === 'open') {
        const cur = (G.entries[t.id] || {})[wt] || [];
        const opts = tm.roster.map(id => G.wrestlers[id]).filter(x => x.natural === wt && x.id !== tm.lineup[wt] && !x.injury).sort((a, b) => overall(b) - overall(a));
        alt = `<td><select data-chg="alt" data-t="${t.id}" data-wt="${wt}"><option value="">No 2nd entry</option>${opts.map(x => `<option value="${x.id}" ${cur[0] === x.id ? 'selected' : ''}>${x.name} ${CLASS_NAMES[x.cls]} ${wtxt(x)}</option>`).join('')}</select></td>`;
      }
      return `<tr><td><b>${wt}</b></td><td>${w ? `${wl(w)} <span class="muted">${CLASS_NAMES[w.cls]}</span> ${wstat(w)} <span class="${w.fatigue > 50 ? 'neg' : 'muted'}">F${Math.round(w.fatigue)}</span>` : '<span class="neg">empty</span>'}</td>${alt}</tr>`;
    }).join('');
  }
  return `<div class="card"><h2>${t.name}</h2><p class="muted">Week ${G.week} · ${t.dates} · ${t.loc} · ${t.teams.length} teams${t.tier === 'major' ? ' · major invitational' : ''}</p>
    ${t.kind === 'dual' ? '<p>Single-elimination bracket of dual meets for the top 16 programs: win your dual to advance. Your lineup is used for every dual, so set it first (you can change it between rounds). Fatigue and injuries carry from dual to dual.</p>' : t.kind === 'ncaa' ? '<p>Your NCAA qualifiers:</p>' : t.kind === 'conf' ? '<p>One entry per weight. Top finishers earn automatic NCAA berths; strong non-placers can still get at-large bids.</p>' : '<p>Your starters are entered. You may add a second wrestler at any weight.</p>'}
    <table class="tbl"><tr><th>Wt</th><th>Entry</th>${t.kind === 'open' ? '<th>Second entry</th>' : ''}</tr>${rows}</table>
    <div class="row" style="margin-top:10px"><button data-act="starttourney">Start tournament ▶</button><button class="secondary" data-act="nav" data-v="lineup">Edit lineup</button></div>
    <p class="hint">Fatigue builds with every match, so deep runs get tiring. Fatigue (F) lowers starting energy.</p></div>`;
}

// ---------- National Dual Tournament (bracket of dual meets) ----------
function dtourney() {
  const t = G.tournaments.find(x => x.id === ui.tid && x.kind === 'dual'); if (!t || !t.br) return '<div class="card">No tournament to show.</div>';
  if (!(ui.dual && ui.dual.tid === t.id && ui.dual.live && ui.dual.shown < 10)) D.settleDone(G, t);   // apply a dual that was watched to the end
  const R = t.br.rounds, me = G.userTeam, hid = ui.dual && ui.dual.tid === t.id && ui.dual.live && ui.dual.shown < 10 ? ui.dual.id : null;
  const nm = t.done ? null : D.nextMatch(G, t), seed = id => t.br.seeds.indexOf(id) + 1;
  const shown = m => !!m.w && m.d !== hid;                       // a dual being watched stays hidden until its viewer finishes
  const teamAt = (r, m, side) => (r === 0 ? (side === 0 ? m.a : m.b) : (f => (f.w && f.d !== hid ? f.w : null))(R[r - 1][m.i * 2 + side]));
  const slot = (r, m, side) => {
    const id = teamAt(r, m, side); if (!id) return '<div class="bs tbd"><span class="muted">TBD</span></div>';
    const d = D.dualOf(t, m), done = shown(m), win = done && m.w === id, lose = done && m.w !== id;
    const sc = done && d ? (id === d.a ? d.result.sa : d.result.sb) : '';
    return `<div class="bs dt ${win ? 'w' : lose ? 'l' : ''} ${id === me ? 'mine' : ''}"><span class="tn"><small class="muted">${seed(id)}</small> ${tn(id, 14)}</span><span class="sc">${sc}</span></div>`;
  };
  const box = (r, m) => {
    const d = D.dualOf(t, m), done = shown(m), next = nm && nm.m === m, ready = teamAt(r, m, 0) && teamAt(r, m, 1);
    const foot = done && d ? `<a data-act="opendtdual" data-v="${d.id}">View dual</a>${d.result.tiebreak ? ' <span class="muted">(tiebreaker)</span>' : ''}` : next ? '<b class="tcwin">Up next</b>' : ready ? '<span class="muted">Waiting</span>' : '<span class="muted">—</span>';
    return `<div class="bm ${next ? 'upnext' : ''}">${slot(r, m, 0)}${slot(r, m, 1)}<div class="bd">${foot}</div></div>`;
  };
  const cols = R.map((rd, r) => `<div class="bcol"><div class="bhead">${D.roundName(t, r)}</div>${rd.map(m => box(r, m)).join('')}</div>`).join('');
  const last = R[R.length - 1][0], over = t.done;
  // where is the user?
  let status = '';
  if (t.teams.includes(me)) {
    const lost = R.some(rd => rd.some(m => shown(m) && (m.a === me || m.b === me) && m.w !== me));
    status = over ? `Your team finished <b>${ordinal(t.result.teamScores.find(x => x.team === me).place)}</b>.` : lost ? 'Your team has been eliminated; the bracket plays on.' : nm && (nm.m.a === me || nm.m.b === me) ? 'Your dual is next.' : 'Your team is still alive.';
  }
  const curRound = nm ? D.roundName(t, nm.r) : 'Complete';
  const played = t.duals.filter(d => d.done).length, total = R.reduce((s, rd) => s + rd.length, 0);
  const nextLine = nm ? `Next dual: <b>${tn(nm.m.a, 16)}</b> (${seed(nm.m.a)}) vs <b>${tn(nm.m.b, 16)}</b> (${seed(nm.m.b)})${nm.m.a === me || nm.m.b === me ? ' · <b class="tcwin">your dual</b>' : ''}` : '';
  const ctrl = over ? `<b class="tcwin">Tournament complete.</b> Champion: ${tn(t.result.champion, 20)}. <button data-act="continue">Finish week ▶</button>`
    : `<button data-act="dtwatch">👁 Watch next dual</button><button data-act="dtsim">Sim next dual</button><button class="secondary" data-act="dtround">Sim round</button><button class="secondary" data-act="dtall">Skip to tournament end ▶▶</button>${t.teams.includes(me) ? '<button class="secondary" data-act="nav" data-v="lineup">Edit lineup</button>' : ''}`;
  const table = over ? `<div class="card"><h3 style="margin-top:0">Final standings</h3><table class="tbl dense"><tr><th>Place</th><th>Team</th><th>Dual wins</th></tr>${t.result.teamScores.map(x => `<tr class="${x.team === me ? 'me' : ''}"><td>${ordinal(x.place)}</td><td>${tn(x.team, 16)}</td><td>${x.pts}</td></tr>`).join('')}</table></div>` : '';
  return `<div class="card"><h2>${tl(t.name)} <small class="muted">${t.dates} · ${t.loc} · ${t.teams.length} teams</small></h2>
    <p>${over ? '' : `<b>${curRound}</b> · `}${played} of ${total} duals played. Single elimination: win your dual to advance. ${status}</p>
    ${nextLine ? `<p>${nextLine}</p>` : ''}<div class="row" style="flex-wrap:wrap;gap:6px">${ctrl}</div>
    ${over ? '' : '<p class="hint">Lineups carry over, and fatigue and injuries build from dual to dual, so you can change your lineup between rounds.</p>'}</div>
    <div class="card"><div class="bkt">${cols}</div></div>${table}`;
}

// ---------- NCAA selection show ----------
const ordinal = k => `${k}${['th', 'st', 'nd', 'rd'][(k % 100 > 10 && k % 100 < 14) ? 0 : (k % 10 < 4 ? k % 10 : 0)]}`;
function selection() {
  const n = G.ncaa; if (!n || !n.show || G.phase !== 'season') return '<div class="card">No selection show right now.</div>';
  const rv = n.rv, cw = SEL.curWeight(G), wt = +ui.selwt && WEIGHTS.includes(+ui.selwt) ? +ui.selwt : (cw || WEIGHTS[0]);
  const f = n.field[wt], cnt = rv.cnt[wt], N = f.length, sh = n.show[wt], full = cnt >= N;
  const pig = N === 33, nl = pig ? 32 : N, P = 2 ** Math.ceil(Math.log2(Math.max(2, nl))), order = seedOrder(P).map(x => (x <= nl ? x : null));
  const last = rv.last && rv.last[0] === wt ? rv.last[1] : -1;
  const sub = (e, i) => { const w = G.wrestlers[e.id], t = G.teams[e.team];
    return `<div class="bs sel ${e.team === G.userTeam ? 'mine' : ''} ${i === last ? 'pop' : ''}"><span class="sd">${i + 1}</span><span class="nm">${wl(w)}<small class="tag ${e.via === 'auto' ? 'aq' : 'al'}">${e.via === 'auto' ? 'AQ' : 'AL'}</small></span><span class="rt">${schoolLogo(e.team, t.name, 16)} <span class="muted">${e.rec[0]}-${e.rec[1]}</span>${e.rk ? ` <b class="rk">#${e.rk}</b>` : ''}</span></div>`; };
  const blank = txt => `<div class="bs sel empty"><span class="sd"></span><span class="nm muted">${txt || ''}</span></div>`;
  const slot = sd => { if (sd == null) return blank('bye'); if (pig && sd === 32) return cnt >= 33 ? blank('winner of the pigtail') : blank(); const i = sd - 1; return i < cnt ? sub(f[i], i) : blank(); };
  const boxes = []; for (let i = 0; i < order.length; i += 2) boxes.push(`<div class="bm">${slot(order[i])}${slot(order[i + 1])}</div>`);
  const pigBox = pig ? `<div class="bm pigbox"><div class="bd">Pigtail (play-in): the winner takes the 32 seed's place</div>${[31, 32].map(i => (i < cnt ? sub(f[i], i) : blank())).join('')}</div>` : '';
  const chips = WEIGHTS.map(w => { const c = rv.cnt[w], tot = n.field[w].length; return `<a data-act="selwt" data-v="${w}" class="chip ${w === wt ? 'on' : ''}">${w}${c >= tot ? ' ✓' : c ? ' …' : ''}</a>`; }).join('');
  const lastE = last >= 0 ? f[last] : null;
  const ann = lastE ? `<p class="ann">Seed <b>${last + 1}</b> at ${wt}: <b>${wl(lastE.id)}</b>, ${tn(lastE.team)} (${lastE.rec[0]}-${lastE.rec[1]}${lastE.rk ? ', ranked #' + lastE.rk : ''}): ${lastE.via === 'auto' ? `automatic qualifier (${ordinal(lastE.cp)} at conference)` : 'at-large bid'}</p>` : '';
  const bub = (title, arr) => arr.length ? `<div><h4 style="margin:10px 0 4px">${title}</h4><table class="tbl dense"><tr><th>Wrestler</th><th>School</th><th>Record</th><th>Rank</th><th>Resume</th></tr>${arr.map(e => `<tr class="${e.team === G.userTeam ? 'me' : ''}"><td>${wl(e.id)}</td><td>${tn(e.team, 14)}</td><td>${e.rec[0]}-${e.rec[1]}</td><td>${e.rk ? '#' + e.rk : '—'}</td><td>${e.ss.toFixed(1)}</td></tr>`).join('')}</table></div>` : '';
  const mineRows = SEL.myOutcomes(G).map(o => { const w = G.wrestlers[o.id]; return `<tr><td>${o.wt}</td><td>${wl(w)} ${wstat(w)}</td><td>${o.status === 'in' ? `<b class="tcwin">Qualified</b> · seed ${o.seed} · ${o.via === 'auto' ? 'automatic' : 'at-large'}` : `<span class="neg">Missed</span> · ${ordinal(o.pos)} wrestler out${o.pos <= 4 ? ' (first four out)' : ''}`}</td></tr>`; }).join('');
  let teams = '';
  if (rv.done) { const c = {}; for (const w of WEIGHTS) for (const e of n.field[w]) c[e.team] = (c[e.team] || 0) + 1; const ar = Object.entries(c).sort((a, b) => b[1] - a[1]); const mi = ar.findIndex(x => x[0] === G.userTeam);
    teams = `<div class="card"><h3 style="margin-top:0">Qualifiers by school</h3><table class="tbl dense"><tr><th>#</th><th>School</th><th>Qualifiers</th></tr>${ar.slice(0, 12).map((x, i) => `<tr class="${x[0] === G.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${tn(x[0], 16)}</td><td>${x[1]}</td></tr>`).join('')}${mi >= 12 ? `<tr class="me"><td>${mi + 1}</td><td>${tn(G.userTeam, 16)}</td><td>${ar[mi][1]}</td></tr>` : ''}</table><p class="hint">${ar.length} schools qualified at least one wrestler; ${SEL.totalCount(G)} wrestlers in all.</p></div>`; }
  const tot = SEL.totalCount(G), rc = SEL.revealedCount(G);
  return `<div class="card"><h2>NCAA Championships selection show <small class="muted">${G.season}</small></h2>
    <p class="muted">The committee fills 33 spots per weight: conference automatic qualifiers (AQ) plus at-large picks (AL) ranked by resume score (rating, win%, bonus points, conference finish). Seeds follow the resume score. ${rc} of ${tot} names revealed.</p>
    <div class="row" style="flex-wrap:wrap;gap:6px">${rv.done ? '<b class="tcwin">Selection complete.</b> <button data-act="continue">Continue ▶</button>' : '<button data-act="selnext">Reveal next name ▶</button><button class="secondary" data-act="selweek">Finish this weight ▶▶</button><button class="secondary" data-act="selall">Reveal everything</button>'}</div>
    <div class="chips" style="margin-top:10px">${chips}</div></div>
    <div class="card"><h3 style="margin-top:0">${wt} lbs <span class="muted">${cnt} of ${N} revealed</span></h3>${ann}<div class="selgrid">${boxes.join('')}${pigBox}</div>
    ${full ? `<div class="cols2">${bub('Last four in', sh.lastIn)}${bub('First four out', sh.firstOut)}</div>` : ''}</div>
    ${mineRows ? `<div class="card"><h3 style="margin-top:0">Your wrestlers</h3><table class="tbl"><tr><th>Wt</th><th>Wrestler</th><th>Result</th></tr>${mineRows}</table></div>` : ''}${teams}`;
}

// ---------- tournament screen: live (reveal as you choose) and final results ----------
// round names come from the matches (m.rl, set in tourney.js roundPlan): Round of N / Quarterfinals / Semifinals / Consolation n / Placement matches / Finals (Finals is always last)
function rname(t, l, wt) {   // name stored on the matches themselves (m.rl); falls back to the first weight that has this round
  for (const w of (wt ? [wt] : WEIGHTS)) { const m = (t.result.weights[w].matches || []).find(x => x.l === l && x.rl); if (m) return m.rl; }
  return `Round ${l}`;
}
function bracketHtml(t, wt) {
  const W = t.result.weights[wt], ms = W.matches, live = L.isLive(t);
  const rev = live ? L.revealedSet(t, wt) : new Set(ms.map(m => m.i));
  const slot = (m, side) => {
    const id = side === 'A' ? m.a : m.b, feeder = side === 'A' ? m.pa : m.pb, seed = side === 'A' ? m.sa : m.sb;
    if (!(feeder === -1 || rev.has(feeder))) return '<div class="bs tbd"><span class="muted">TBD</span></div>';
    const w = G.wrestlers[id], done = rev.has(m.i), win = done && m.w === side, lose = done && m.w !== side;
    return `<div class="bs ${win ? 'w' : lose ? 'l' : ''} ${w.team === G.userTeam ? 'mine' : ''}"><span class="tn">${schoolLogo(w.team, G.teams[w.team].name, 14)}<span><small class="muted">${seed}</small> ${wl(id)}</span></span></div>`;
  };
  const box = m => `<div class="bm">${slot(m, 'A')}${slot(m, 'B')}<div class="bd">${rev.has(m.i) ? `${m.lb} · ${m.d}` : `<span class="muted">${m.lb}</span>`}</div></div>`;
  const sect = (champ, title) => {
    const lv = [...new Set(ms.filter(m => !!m.c === champ).map(m => m.l))].sort((x, y) => x - y);
    return lv.length ? `<h4 style="margin:12px 0 6px">${title}</h4><div class="bkt">${lv.map(l => `<div class="bcol"><div class="bhead">${rname(t, l, wt)}</div>${ms.filter(m => !!m.c === champ && m.l === l).map(box).join('')}</div>`).join('')}</div>` : '';
  };
  // placers whose last match is already revealed
  const o = live ? L.orderOf(t, wt) : ms, n = live ? t.rv.cnt[wt] : ms.length, last = {};
  o.forEach((m, k) => { last[m.a] = k; last[m.b] = k; });
  const placed = W.top.filter(e => last[e.id] != null && last[e.id] < n).map(e => `<tr class="${e.team === G.userTeam ? 'me' : ''}"><td>${e.place}</td><td class="${e.team === G.userTeam ? 'tcname' : ''}">${wl(e.id, e.name)}</td><td>${tn(e.team, 16)}</td></tr>`).join('');
  return `${placed ? `<table class="tbl" style="max-width:420px"><tr><th>Place</th><th>Wrestler</th><th>Team</th></tr>${placed}</table>` : '<p class="muted">No placers decided yet.</p>'}
    ${sect(true, 'Championship bracket')}${sect(false, 'Consolation / placement matches')}`;
}

function tourney() {
  const t = G.tournaments.find(x => x.id === ui.tid); if (!t || !t.result) return '<div class="card">No results.</div>';
  const live = L.isLive(t), hasBr = L.hasBracket(t), r = t.result, wtSel = ui.twt || WEIGHTS[0];
  let view = ui.tview || 'team';
  const tabsDef = live ? [['team', 'Team scores & results'], ['bracket', 'Brackets'], ['mine', 'My wrestlers']] : [['team', 'Team scores'], ['weights', 'Weight classes'], ...(hasBr ? [['bracket', 'Brackets']] : []), ['mine', 'My wrestlers']];
  if (!tabsDef.find(x => x[0] === view)) view = 'team';
  const tabs = tabsDef.map(([k, n]) => `<button class="${view === k ? '' : 'secondary'}" data-act="tview" data-v="${k}">${n}</button>`).join(' ');
  const wsel = `<label>Weight <select data-chg="twt">${WEIGHTS.map(x => `<option ${x === wtSel ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`;
  let controls = '', body = '';
  const matchLine = (wt, m) => {
    const wId = m.w === 'A' ? m.a : m.b, lId = m.w === 'A' ? m.b : m.a, W = G.wrestlers[wId], Lw = G.wrestlers[lId], mineM = W.team === G.userTeam || Lw.team === G.userTeam;
    return `<tr class="${mineM ? 'me' : ''}"><td class="muted">${wt}</td><td>${rname(t, m.l, wt)} · ${m.lb}</td><td class="${W.team === G.userTeam ? 'tcname' : 'pos'}">${wl(wId)} ${schoolLogo(W.team, G.teams[W.team].name, 14)}</td><td>def.</td><td class="${Lw.team === G.userTeam ? 'neg' : ''}">${wl(lId)} ${schoolLogo(Lw.team, G.teams[Lw.team].name, 14)}</td><td class="muted">${m.d}</td></tr>`;
  };
  if (live) {
    const cr = L.currentRound(t), mr = L.maxRound(t), done = L.revealedTotal(t), total = L.totalOf(t), pct = Math.round(done / total * 100);
    const avail = WEIGHTS.filter(w => L.canRoundAt(t, w));
    let rwt = +ui.rwt; if (!avail.includes(rwt)) rwt = avail[0] || WEIGHTS[0]; ui.rwt = rwt;
    controls = `<div class="card"><h2>${tl(t.name)} <small class="muted">${t.dates} · ${t.loc}</small></h2>
      <p><b>${rname(t, cr)}</b> <span class="muted">(${cr > 0 ? `round ${cr} of ${mr}` : 'play-in round'})</span> · ${done} of ${total} matches revealed (${pct}%)<span class="muted"> — a round can't start anywhere until the previous round is finished at every weight.</span></p>
      <div class="bar" style="max-width:420px;margin-bottom:10px"><i class="t2" style="width:${pct}%"></i></div>
      <div class="row"><button data-act="tadv" data-v="match">Next match ▶</button>
        <label>Weight <select data-chg="rwt">${WEIGHTS.map(w => `<option value="${w}" ${w === rwt ? 'selected' : ''} ${avail.includes(w) ? '' : 'disabled'}>${w}${avail.includes(w) ? '' : ' (round done)'}</option>`).join('')}</select></label>
        <button data-act="tadv" data-v="wround" ${avail.length ? '' : 'disabled'}>Finish round at ${rwt} ▶</button>
        <button data-act="tadv" data-v="round">Finish round ${cr} (all weights) ▶</button>
        <button class="secondary" data-act="tadv" data-v="all">Finish tournament ▶▶</button></div></div>`;
    if (view === 'team') {
      const sc = L.liveScores(G, t), mi = sc.findIndex(x => x.team === G.userTeam), show = sc.slice(0, 14);
      if (mi >= 14) show.push(sc[mi]);
      const rows = show.map(x => { const i = sc.indexOf(x); return `<tr class="${x.team === G.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${tn(x.team)}</td><td>${x.pts}</td></tr>`; }).join('');
      const feed = t.rv.feed.slice(-12).reverse().map(([wt, i]) => matchLine(wt, r.weights[wt].matches[i])).join('');
      body = `<table class="tbl"><tr><th>#</th><th>Team</th><th>Points</th></tr>${rows || '<tr><td colspan="3" class="muted">No points yet.</td></tr>'}</table>
        <h3 style="margin-top:14px">Latest results</h3><table class="tbl">${feed || '<tr><td class="muted">Nothing revealed yet. Press Next match or Finish round.</td></tr>'}</table>`;
    } else if (view === 'bracket') {
      body = `${wsel} <span class="muted">${r.weights[wtSel].n} wrestlers</span>${bracketHtml(t, wtSel)}`;
    } else {
      const st = L.myStatus(G, t);
      const rows = st.map(x => { const w = G.wrestlers[x.id];
        const nx = x.next ? `Next: ${rname(t, x.next.l, x.wt)} · ${x.next.lb}` : x.place ? `<b class="${x.place === 1 ? 'tcwin' : ''}">Finished ${x.place}${['st', 'nd', 'rd'][x.place - 1] || 'th'}</b>` : '<span class="muted">Eliminated</span>';
        return `<tr><td>${x.wt}</td><td>${wl(x.id)} <small class="muted">seed ${x.seed}</small></td><td>${x.w}-${x.l}</td><td>${nx}</td></tr>`; }).join('');
      const seen = new Set(); for (const wt of WEIGHTS) for (const m of L.orderOf(t, wt).slice(0, t.rv.cnt[wt])) if (m.u >= 0) seen.add(m.u);
      const bouts = r.userBouts.map((b, i) => ({ b, i })).filter(x => seen.has(x.i)).map(({ b, i }) => { const mineA = b.aTeam === G.userTeam, won = (b.w === 'A') === mineA;
        return `<tr><td>${b.wt}</td><td>${b.label}</td><td>${wl(b.a, b.aName)} vs ${wl(b.b, b.bName)}</td><td class="${won ? 'tcwin' : 'neg'}">${won ? 'W' : 'L'} ${b.d}</td><td>${b.seed ? `<a data-act="watchtb" data-v="${i}">watch</a>` : ''}</td></tr>`; }).join('');
      body = `<table class="tbl"><tr><th>Wt</th><th>Wrestler</th><th>Record</th><th>Status</th></tr>${rows || '<tr><td colspan="4" class="muted">No entries</td></tr>'}</table>
        <h3 style="margin-top:14px">Your matches so far</h3><table class="tbl"><tr><th>Wt</th><th>Round</th><th>Match</th><th>Result</th><th></th></tr>${bouts || '<tr><td colspan="5" class="muted">None yet.</td></tr>'}</table>`;
    }
    return `${controls}<div class="card"><div class="row">${tabs}</div>${body}</div>${boutView()}`;
  }
  // finished (or an older event opened from the schedule)
  const idx = r.teamScores.findIndex(x => x.team === G.userTeam);
  if (view === 'team') {
    body = `<table class="tbl"><tr><th>#</th><th>Team</th><th>Points</th></tr>${r.teamScores.slice(0, 20).map((x, i) => `<tr class="${x.team === G.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${tn(x.team)}</td><td>${x.pts}</td></tr>`).join('')}</table>`;
    const champs = WEIGHTS.map(wt => { const c = r.weights[wt].top[0]; return c ? `<tr class="${c.team === G.userTeam ? 'me' : ''}"><td><b>${wt}</b></td><td class="${c.team === G.userTeam ? 'tcname' : ''}">${wl(c.id, c.name)}</td><td>${tn(c.team)}</td></tr>` : ''; }).join('');
    body += `<h3 style="margin-top:14px">Champions</h3><table class="tbl">${champs}</table>`;
  } else if (view === 'weights') {
    const w = r.weights[wtSel];
    body = `${wsel} <span class="muted">${w.n} wrestlers</span>
      <table class="tbl"><tr><th>Place</th><th>Wrestler</th><th>Team</th></tr>${w.top.map(e => `<tr class="${e.team === G.userTeam ? 'me' : ''}"><td>${e.place}</td><td class="${e.team === G.userTeam ? 'tcname' : ''}">${wl(e.id, e.name)}</td><td>${tn(e.team)}</td></tr>`).join('')}</table>`;
  } else if (view === 'bracket') {
    body = `${wsel} <span class="muted">${r.weights[wtSel].n} wrestlers · brackets are removed once the week moves on</span>${bracketHtml(t, wtSel)}`;
  } else {
    const places = r.userPlaces.map(p => `<tr class="me"><td>${p.wt}</td><td class="tcname">${wl(p.id)}</td><td>${p.place <= 8 ? `<b class="${p.place === 1 ? 'tcwin' : ''}">${p.place}${['st', 'nd', 'rd'][p.place - 1] || 'th'}</b>` : '<span class="muted">did not place</span>'}</td><td class="muted">of ${p.n}</td></tr>`).join('');
    const bouts = r.userBouts.map((b, i) => { const mineA = b.aTeam === G.userTeam, won = (b.w === 'A') === mineA;
      return `<tr><td>${b.wt}</td><td>${b.label}</td><td>${wl(b.a, b.aName)} vs ${wl(b.b, b.bName)}</td><td class="${won ? 'tcwin' : 'neg'}">${won ? 'W' : 'L'} ${b.d}</td><td>${b.seed ? `<a data-act="watchtb" data-v="${i}">watch</a>` : ''}</td></tr>`; }).join('');
    body = `<table class="tbl"><tr><th>Wt</th><th>Wrestler</th><th>Finish</th><th></th></tr>${places || '<tr><td colspan="4" class="muted">No entries</td></tr>'}</table>
      <h3 style="margin-top:14px">Your matches</h3><table class="tbl"><tr><th>Wt</th><th>Round</th><th>Match</th><th>Result</th><th></th></tr>${bouts}</table>`;
  }
  const finish = ui.live ? `<button data-act="finishweek">Finish week ▶</button>` : `<button class="secondary" data-act="backsched">Back to schedule</button>`;
  return `<div class="card"><h2>${tl(t.name)} <small class="muted">${t.dates} · ${t.loc}</small></h2>
    <p>${idx < 0 ? 'No team points.' : `Your team: <b>#${idx + 1}</b> with <b>${r.teamScores[idx].pts}</b> points.`} Winner: <b>${tn(r.teamScores[0].team)}</b>.${r.mow ? ` Outstanding Wrestler: <b>${wl(r.mow.id, r.mow.name)}</b> ${tn(r.mow.team, 14)} <span class="muted">(${r.mow.wt} lbs, ${r.mow.tpm} team points per match)</span>.` : ''}</p>
    <div class="row">${tabs} ${finish}</div>${body}</div>${boutView()}`;
}

const starStr = n => '★'.repeat(n);
function autoControls() {
  const last = R.lastPlanSize(G), mode = G.rec.mode || 'manual', msg = ui.rec.autoMsg;
  return `<div class="row" style="margin-top:8px"><button data-act="rec_auto" title="Uses the same ranking the AI uses to pick targets, then spends your hours on real actions">⚡ Auto-recruit this week</button>
    <button class="secondary" data-act="rec_repeat" ${last ? '' : 'disabled'}>↻ Repeat last week's plan${last ? ` (${last} actions)` : ''}</button>
    <label>Every week: <select data-chg="recmode">${Object.entries(R.REC_MODES).map(([k, n]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${msg ? `<p class="hint">${msg}</p>` : ''}
    <p class="hint">Auto-recruit ranks recruits the way the AI does (star level, fit, how realistic your prestige is), then pitches, calls, visits and DMs them with your hours and offers a scholarship once his interest is high enough. Set "Every week" to run a plan automatically when you advance, so no hours are lost.</p>`;
}
function recruiting() {
  const rc = ui.rec, tabs = [['targets', `My target board (${R.boardOf(G).length}/${R.BOARD_MAX})`], ['board', 'All recruits'], ['commits', 'Commits & classes'], ['portal', G.phase === 'offseason' ? `Transfer portal (${G.portal.length})` : 'Transfer portal']]
    .map(([k, n]) => `<button class="${rc.tab === k ? '' : 'secondary'}" data-act="rectab" data-v="${k}">${n}</button>`).join(' ');
  const aidFree = R.aidAvailable(G, G.userTeam), pend = R.pendingOffers(G, G.userTeam);
  const head = `<div class="card"><h2>Recruiting <small class="muted">class of ${G.season + 1}</small></h2>
    <div class="row">${tabs}</div>
    <p class="muted">Recruiting hours this week: <b style="color:var(--text)">${G.rec.hours}</b> of ${R.WEEKLY_HOURS} · Scholarship room: <b style="color:var(--text)">${aidFree.toFixed(2)}</b> of ${R.AID_CAP} (pending offers ${pend.toFixed(2)}, free to offer ${Math.max(0, aidFree - pend).toFixed(2)})</p>${autoControls()}</div>`;
  const bar = G.phase === 'offseason' ? offBar() : '';
  if (rc.tab === 'portal') return bar + head + portalTab();
  if (rc.tab === 'commits') return bar + head + commitsTab();
  if (rc.tab === 'targets') return bar + head + targetsTab();
  return bar + head + boardTab();
}
const standCls = s => ({ Leading: 'pos', 'Neck and neck': '', Trailing: 'neg', Lost: 'neg', 'Committed to you': 'pos' }[s] ?? 'muted');
function targetsTab() {
  const rc = ui.rec, list = R.boardOf(G).map(id => G.recruits[id]).filter(Boolean);
  list.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || a.rank - b.rank);
  const closed = list.filter(r => r.status !== 'open').length;
  const rows = list.map(r => {
    const me_ = r.interest[G.userTeam] || 0, offr = r.offers[G.userTeam], st = R.standing(G, r), cool = R.coolingWeeks(G, r), open = r.status === 'open';
    const ovrShow = r.scout >= 3 ? overall(r).toFixed(1) : `${R.estOvr(r).toFixed(1)}±${[2.6, 1.3, 0.5][r.scout]}`;
    const bar = `<div class="bar" style="min-width:70px;display:inline-block;vertical-align:middle"><i class="${me_ >= 70 ? 't4' : me_ >= 45 ? 't3' : me_ >= 20 ? 't2' : 't1'}" style="width:${me_}%"></i></div> ${me_}${open && cool >= 1 && me_ > 0 ? ` <span class="${cool >= 2 ? 'neg' : 'muted'}" title="No contact for ${cool} week(s); interest drops after 2">❄${cool}w</span>` : ''}`;
    const quick = open ? `${actBtn(r, 'dm', 'DM')} ${actBtn(r, 'call', 'Call')}` : '';
    const status = r.status === 'committed' ? `<span class="${r.team === G.userTeam ? 'pos' : 'neg'}">→ ${tn(r.team, 18)}</span>` : r.status === 'unsigned' ? '<span class="muted">unsigned</span>' : '';
    return `<tr data-act="recsel" data-v="${r.id}" class="${rc.sel === r.id ? 'me' : ''}" style="cursor:pointer"><td>${r.rank}</td><td>${r.name}</td><td>${r.weight}</td><td>${r.state}</td><td style="color:var(--gold)">${starStr(r.stars)}</td><td>${ovrShow}</td><td class="muted">${'●'.repeat(r.scout)}${'○'.repeat(3 - r.scout)}</td>
      <td>${bar}</td><td class="${standCls(st)}">${st}</td><td>${offr != null ? Math.round(offr * 100) + '%' : ''}</td><td>${quick} ${status}</td><td><button class="secondary" data-act="recrem" data-v="${r.id}" title="Remove from board">✕</button></td></tr>`;
  }).join('');
  const sel = rc.sel && G.recruits[rc.sel];
  const empty = `<p class="hint">Your board is empty. Open <a data-act="rectab" data-v="board">All recruits</a>, click <b>＋ Target</b> on the recruits you want, then work them here each week: DM and call to build interest, pitch what each one cares about, then visit and offer before a rival lands him.</p>`;
  return `<div class="card" style="overflow-x:auto"><div class="row"><span class="muted">Each action can be done once per recruit per week (visits once per season). Targets you ignore for 2+ weeks cool off.</span>${closed ? `<button class="secondary" data-act="recclear">Clear ${closed} closed</button>` : ''}</div>
    ${list.length ? `<table class="tbl dense"><tr><th>Rank</th><th>Name</th><th>Wt</th><th>St</th><th>★</th><th>OVR</th><th>Scout</th><th>Your interest</th><th>Standing</th><th>Offer</th><th>Quick</th><th></th></tr>${rows}</table>` : empty}</div>${sel ? recruitDetail(sel) : ''}`;
}
function actBtn(r, type, label, extra = '') {
  const block = R.actionBlock(G, r, type), a = R.ACTIONS[type];
  return `<button data-act="recact" data-v="${r.id}" data-t="${type}" ${block ? 'disabled' : ''} title="${(block || a.note).replace(/"/g, '&quot;')}">${label} (${a.hours}h)</button>`;
}
function boardTab() {
  const rc = ui.rec;
  let list = Object.values(G.recruits);
  if (rc.wt) list = list.filter(r => r.weight === rc.wt);
  if (rc.status === 'open') list = list.filter(r => r.status === 'open');
  else if (rc.status === 'mine') list = list.filter(r => r.interest[G.userTeam] || r.offers[G.userTeam] != null);
  list.sort((a, b) => a.rank - b.rank);
  const rm = rankMap();
  const rows = list.slice(0, rc.limit).map(r => {
    const me_ = r.interest[G.userTeam] || 0, offr = r.offers[G.userTeam];
    const rivals = Object.entries(r.interest).filter(([t]) => t !== G.userTeam).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, v]) => `${tn(t, 16)} ${v}`).join(', ');
    const status = r.status === 'committed' ? `<span class="${r.team === G.userTeam ? 'pos' : 'neg'}">→ ${tn(r.team, 18)}</span>` : r.status === 'unsigned' ? '<span class="muted">unsigned</span>' : 'open';
    const ovrShow = r.scout >= 3 ? overall(r).toFixed(1) : `${R.estOvr(r).toFixed(1)}±${[2.6, 1.3, 0.5][r.scout]}`;
    return `<tr data-act="recsel" data-v="${r.id}" class="${rc.sel === r.id ? 'me' : ''}" style="cursor:pointer"><td>${r.rank}</td><td>${r.name}</td><td>${r.weight}</td><td>${r.state}</td><td style="color:var(--gold)">${starStr(r.stars)}</td>
      <td>${ovrShow}</td><td>${r.scout >= 1 ? R.potWord(R.estPot(r)) : '?'}</td><td class="muted">${'●'.repeat(r.scout)}${'○'.repeat(3 - r.scout)}</td><td>${me_}</td><td>${offr != null ? Math.round(offr * 100) + '%' : ''}</td><td class="muted">${rivals}</td><td>${status}</td>
      <td>${r.status === 'open' ? (R.onBoard(G, r.id) ? `<button class="secondary" data-act="recrem" data-v="${r.id}">✓ On board</button>` : `<button data-act="recadd" data-v="${r.id}">＋ Target</button>`) : ''}</td></tr>`;
  }).join('');
  const filt = `<div class="row"><label>Weight <select data-chg="recwt"><option value="0">All</option>${WEIGHTS.map(w => `<option ${rc.wt === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
    <label>Show <select data-chg="recstatus"><option value="open" ${rc.status === 'open' ? 'selected' : ''}>Uncommitted</option><option value="mine" ${rc.status === 'mine' ? 'selected' : ''}>My targets</option><option value="all" ${rc.status === 'all' ? 'selected' : ''}>Everyone</option></select></label>
    <span class="muted">${list.length} recruits</span></div>`;
  const sel = rc.sel && G.recruits[rc.sel];
  return `<div class="card" style="overflow-x:auto">${filt}<table class="tbl dense"><tr><th>Rank</th><th>Name</th><th>Wt</th><th>St</th><th>★</th><th>OVR</th><th>Pot</th><th>Scout</th><th>Int.</th><th>Offer</th><th>Rival interest</th><th>Status</th><th>Board</th></tr>${rows}</table>
    ${list.length > rc.limit ? `<p><button class="secondary" data-act="recmore">Show 40 more</button></p>` : ''}</div>${sel ? recruitDetail(sel) : '<p class="hint">Click a recruit. Scouting narrows the OVR/potential uncertainty; contacts and visits build interest; scholarship offers (and playing time, prestige, academics, location) decide where he commits. Top recruits commit to programs they can realistically land.</p>'}`;
}
function recruitDetail(r) {
  const me_ = r.interest[G.userTeam] || 0, offr = r.offers[G.userTeam], open = r.status === 'open';
  const need = r.needs, caresShow = me_ > 0 || r.scout >= 2;
  const names = { pres: 'Program prestige', pt: 'Playing time', acad: 'Academics', loc: 'Staying close to home', aid: 'Scholarship money' };
  const cares = caresShow ? Object.entries(need).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${names[k]} ${Math.round(v * 100)}%`).join(' · ') : '<span class="muted">Contact him to learn what he cares about.</span>';
  const attrs = r.scout >= 2 ? `<div class="cols2">${ATTR_KEYS.map(k => `<div class="attr"><span>${ATTR_LABELS[k]}</span><div class="bar"><i class="${tier(R.shownAttr(r, k))}" style="width:${R.shownAttr(r, k) * 5}%"></i></div><b>${r.scout >= 3 ? '' : '~'}${R.shownAttr(r, k)}</b></div>`).join('')}</div>` : '<p class="muted">Scout him to level 2 to see attributes.</p>';
  const aidOpts = [0, 0.25, 0.5, 0.75, 1].map(a => `<option value="${a}" ${(offr ?? 0.5) === a ? 'selected' : ''}>${a * 100}%</option>`).join('');
  const pitch = open ? R.fit(G, r, G.userTeam, offr ?? 0) : null;
  const rivals = Object.entries(r.interest).filter(([t]) => t !== G.userTeam).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, v]) => `${tn(t, 16)} ${v}${r.offers[t] != null ? ' (offer)' : ''}`).join(' · ') || 'none yet';
  const pt = Math.round(R.ptScore(G, me(), overall(r), r.weight) * 100);
  const ws = R.weightSlots(G, G.userTeam, r.weight);
  const roomNote = `<p class="${ws.proj > R.ROSTER_MAX ? 'neg' : 'muted'}">Your ${r.weight} room: ${ws.inc} recruit${ws.inc === 1 ? '' : 's'} committed, ${ws.cur} returning non-seniors · class ${ws.total} · projected roster ${ws.proj} (limit ${R.ROSTER_MAX} — no cap on recruiting, but you must cut down in the offseason${ws.proj > R.ROSTER_MAX ? '; cuts go to the transfer portal' : ''})</p>`;
  return `<div class="card"><h2>${r.name} <small class="muted">#${r.rank} nationally · ${starStr(r.stars)} · ${r.weight} lbs · ${r.state} (${r.region}) · ${r.scout >= 1 ? ARCHETYPES[r.arch].label : 'style unknown'}</small></h2>
    <p>Estimated OVR <b>${r.scout >= 3 ? overall(r).toFixed(1) : R.estOvr(r).toFixed(1) + ' ±' + [2.6, 1.3, 0.5][r.scout]}</b> · Potential <b>${r.scout >= 1 ? R.potWord(R.estPot(r)) : '?'}</b> · Scouting level ${r.scout}/3 · Your interest <b>${me_}</b> · Playing time at ${me().name}: <b>${pt}%</b></p>
    <p>Cares about: ${cares}</p><p class="muted">Rival interest: ${rivals}</p>${open ? roomNote : ''}${attrs}
    ${open ? `${ui.rec.msg ? `<p class="pos"><b>${ui.rec.msg}</b></p>` : ''}
    <div class="row" style="margin-top:8px"><button data-act="recscout" data-v="${r.id}" ${r.scout >= 3 ? 'disabled' : ''}>Scout (${r.scout >= 2 ? 2 : 1}h)</button>${actBtn(r, 'dm', 'Social DM')}${actBtn(r, 'call', 'Phone call')}${actBtn(r, 'visit', 'Campus visit')}${actBtn(r, 'home', 'Home visit')}
    ${R.onBoard(G, r.id) ? `<button class="secondary" data-act="recrem" data-v="${r.id}">Remove from board</button>` : `<button data-act="recadd" data-v="${r.id}">＋ Add to board</button>`}</div>
    <div class="row" style="margin-top:8px"><label>Pitch <select id="pitchsel">${Object.entries(R.PITCH_TOPICS).map(([k, n]) => `<option value="${k}">${n}${r.pitched?.[k] ? ' ✓' : ''} — you score ${Math.round(R.teamStrengths(G, r, G.userTeam)[k] * 100)}%</option>`).join('')}</select></label>${actBtn(r, 'pitch', 'Sell pitch')}</div>
    <div class="row" style="margin-top:8px"><label>Offer <select id="aidsel">${aidOpts}</select></label><button data-act="recoffer" data-v="${r.id}">${offr != null ? 'Update offer' : 'Make offer'}</button>${offr != null ? `<button class="secondary" data-act="recwithdraw" data-v="${r.id}">Withdraw</button>` : ''}</div>
    <p class="hint">Your pitch score right now: <b>${pitch.toFixed(0)}</b>. He commits when his best-scoring school (among those who offered) reaches about 30 after his decision week, so keep building interest and match what he cares about.</p>` : `<p><b>${r.status === 'committed' ? `Committed to ${G.teams[r.team].name}` : 'Unsigned'}</b></p>`}</div>`;
}
function commitsTab() {
  const mine = Object.values(G.recruits).filter(r => r.team === G.userTeam).sort((a, b) => a.rank - b.rank);
  const rows = mine.map(r => `<tr><td>${r.rank}</td><td>${r.name}</td><td>${r.weight}</td><td>${r.state}</td><td style="color:var(--gold)">${starStr(r.stars)}</td><td>${Math.round((r.offers[G.userTeam] || 0) * 100)}%</td></tr>`).join('');
  const pts = {}; for (const r of Object.values(G.recruits)) if (r.team) pts[r.team] = (pts[r.team] || 0) + ({ 5: 10, 4: 6, 3: 3, 2: 1, 1: 0.3 }[r.stars]);
  const cls = Object.entries(pts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, v], i) => `<tr class="${t === G.userTeam ? 'me' : ''}"><td>${i + 1}</td><td>${tn(t)}</td><td>${v.toFixed(1)}</td><td>${Object.values(G.recruits).filter(r => r.team === t).length}</td></tr>`).join('');
  return `<div class="grid2"><div class="card"><h2>Your commits <small class="muted">${mine.length}</small></h2><table class="tbl"><tr><th>Rank</th><th>Name</th><th>Wt</th><th>St</th><th>★</th><th>Aid</th></tr>${rows || '<tr><td colspan="6" class="muted">No commits yet.</td></tr>'}</table></div>
    <div class="card"><h2>Recruiting class rankings</h2><table class="tbl"><tr><th>#</th><th>Team</th><th>Pts</th><th>Commits</th></tr>${cls || '<tr><td colspan="4" class="muted">No commits yet.</td></tr>'}</table></div></div>`;
}
// ---------- offseason (4 steps: cut, progression, recruiting, schedule) ----------
function offBar() {
  const idx = OFF_STEPS.findIndex(s => s[0] === offStep(G));
  return `<div class="card"><div class="row"><b>Offseason ${G.season}</b> ${OFF_STEPS.map(([k, n], i) => `<span class="${i === idx ? '' : 'muted'}" style="${i === idx ? 'font-weight:700;color:var(--tc)' : ''}">${i < idx ? '✓' : i + 1}. ${n}</span>`).join(' <span class="muted">›</span> ')}</div></div>`;
}
function offseasonScreen() {
  const step = offStep(G);
  let body;
  if (step === 'cut') body = cutPanel(Math.max(0, me().roster.length - R.ROSTER_MAX));
  else if (step === 'progress') body = progressPanel();
  else body = `<div class="card"><p>This step happens on the <a data-act="nav" data-v="${step === 'recruit' ? 'recruit' : 'schedule'}">${step === 'recruit' ? 'Recruiting' : 'Schedule'}</a> page.</p></div>`;
  return offBar() + body;
}
function progressPanel() {
  const off = G.off || {}, log = off.prog || [], kept = log.filter(x => !x.released).sort((a, b) => (b.o1 - b.o0) - (a.o1 - a.o0)), rel = log.filter(x => x.released);
  const sg = v => (v > 0.005 ? `<span class="pos">+${v.toFixed(1)}</span>` : v < -0.005 ? `<span class="neg">${v.toFixed(1)}</span>` : '<span class="muted">0.0</span>');
  const potCell = x => (x.pot1 > x.pot0 ? `<span class="pos">${x.pot0}→${x.pot1} ▲</span>` : x.pot1 < x.pot0 ? `<span class="neg">${x.pot0}→${x.pot1} ▼</span>` : `<span class="muted">${x.pot1}</span>`);
  const gains = x => Object.entries(x.gained).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ABBR[k]} +${v}`).join(' · ') || '<span class="muted">no rating gains</span>';
  const rows = kept.map(x => `<tr><td>${wl(x.id, x.name)}</td><td>${CLASS_NAMES[x.cls0]} → ${CLASS_NAMES[x.cls]}</td><td>${x.wt}${x.wt !== x.wt0 ? ` <span class="pos">(was ${x.wt0})</span>` : ''}</td><td>${x.o0.toFixed(1)} → <b>${x.o1.toFixed(1)}</b></td><td>${sg(x.o1 - x.o0)}</td><td>${potCell(x)}</td><td>${gains(x)}</td><td>${x.event === 'breakout' ? '<span class="pos">⭐ breakout</span>' : x.event === 'bust' ? '<span class="neg">stalled</span>' : ''}</td></tr>`).join('');
  const avg = kept.length ? kept.reduce((s, x) => s + (x.o1 - x.o0), 0) / kept.length : 0;
  return `<div class="card" style="overflow-x:auto"><h2>Wrestler progression <small class="muted">${kept.length} returning · average ${avg >= 0 ? '+' : ''}${avg.toFixed(2)} OVR</small></h2>
    ${off.grads && off.grads.length ? `<p class="muted">Graduated: ${off.grads.join(', ')}</p>` : ''}
    <table class="tbl dense"><tr><th>Name</th><th>Class</th><th>Wt</th><th>OVR</th><th>Δ</th><th>Potential</th><th>Rating gains</th><th></th></tr>${rows}</table>
    <p class="hint">Gains depend on class, program prestige, work ethic, practice focus and luck. ⭐ Breakouts raise potential; "stalled" wrestlers lose a point of potential and grow little. Ratings never drop in the current model, so "losses" show up as potential drops and stalls.</p>
    ${rel.length ? `<p class="muted">Released wrestlers (now in the portal) also developed: ${rel.map(x => `${x.name} ${x.o1 >= x.o0 ? '+' : ''}${(x.o1 - x.o0).toFixed(1)}`).join(', ')}.</p>` : ''}</div>`;
}
// Offseason roster cut-down: must reach ROSTER_MAX before progression; cuts enter the portal.
function cutPanel(need) {
  const t = me(), lu = new Set(Object.values(t.lineup));
  const ws = t.roster.map(id => G.wrestlers[id]).sort((a, b) => a.natural - b.natural || overall(b) - overall(a));
  const cnt = {}; for (const w of ws) cnt[w.natural] = (cnt[w.natural] || 0) + 1;
  const rows = ws.map(w => `<tr><td>${wl(w)}${w.fresh ? ' <small class="tag aq">incoming</small>' : ''}</td><td>${CLASS_NAMES[w.cls]}</td><td>${w.natural}</td><td><b>${ovr(w)}</b></td><td>${potLabel(w)}</td><td>${lu.has(w.id) ? '★' : ''}</td><td>${Math.round((w.aid || 0) * 100)}%</td><td class="muted">${cnt[w.natural]} at wt</td><td>${w.fresh ? '<span class="muted">signed recruit</span>' : `<button class="secondary" data-act="cutw" data-v="${w.id}">Cut</button>`}</td></tr>`).join('');
  return `<div class="card" style="overflow-x:auto"><h2>Cut your roster <small class="neg">${need} to go</small></h2>
    <p class="muted">Roster ${ws.length} · limit ${R.ROSTER_MAX}. Incoming freshmen count toward the limit but can't be cut. Cut ${need} more wrestler${need === 1 ? '' : 's'} before the transfer portal opens; they enter the portal and can sign with other programs. ★ = projected starter. Cutting frees his scholarship.</p>
    <div class="row"><button data-act="cutauto">Auto-cut the ${need} lowest-value</button></div>
    <table class="tbl dense"><tr><th>Name</th><th>Cl</th><th>Wt</th><th>OVR</th><th>Pot</th><th></th><th>Aid</th><th></th><th></th></tr>${rows}</table></div>`;
}
function portalTab() {
  if (G.phase !== 'offseason') return `<div class="card"><p>The transfer portal opens after the NCAA Championships. Wrestlers who are buried on their depth chart (and the occasional starter) enter it each offseason; you see their true ratings.</p></div>`;
  if (['cut', 'progress'].includes(offStep(G))) return `<div class="card"><p>The transfer portal opens in the Recruiting step, after you cut your roster and see wrestler progression. Go to the <a data-act="nav" data-v="offseason">Offseason</a> page.</p></div>`;
  const list = G.portal.slice().sort((a, b) => overall(G.wrestlers[b.id]) - overall(G.wrestlers[a.id]));
  const rows = list.map(p => {
    const w = G.wrestlers[p.id], off = p.offers[G.userTeam];
    const opts = [0.25, 0.5, 0.75, 1].map(a => `<option value="${a}" ${(off ?? p.ask) === a ? 'selected' : ''}>${a * 100}%</option>`).join('');
    return `<tr><td>${wl(w)}</td><td>${tn(p.from)}</td><td>${w.natural}</td><td>${CLASS_NAMES[w.cls]}</td><td><b>${ovr(w)}</b></td><td>${potLabel(w)}</td><td>${Math.round(p.ask * 100)}%</td>
      <td><select id="pa-${p.id}">${opts}</select></td><td><button data-act="pofferv" data-v="${p.id}">${off != null ? 'Update' : 'Offer'}</button> ${off != null ? `<a data-act="pwithdraw" data-v="${p.id}">withdraw</a>` : ''}</td></tr>`;
  }).join('');
  return `<div class="card" style="overflow-x:auto"><h2>Transfer portal</h2><p class="muted">Offers are resolved when you start the new season. Players weigh playing time, prestige and money; other programs are offering too. Anyone nobody signs may walk on somewhere (no aid) or leave college wrestling, the better ones are likelier to keep going.</p>
    <table class="tbl dense"><tr><th>Name</th><th>From</th><th>Wt</th><th>Cl</th><th>OVR</th><th>Pot</th><th>Asking</th><th>Your offer</th><th></th></tr>${rows}</table></div>`;
}

function soon() { return `<div class="card"><h2>Coming soon</h2><p>Recruiting arrives in Phase 5.</p></div>`; }

function dualday() {
  const du = userDual(G);
  if (!du || du.done) return `<div class="card">No dual to play right now.</div>`;
  const rm = rankMap(), home = du.a === G.userTeam, opp = G.teams[home ? du.b : du.a], t = me(), ol = autoLineup(G, opp.id);
  const rows = WEIGHTS.map(wt => {
    const w = t.lineup[wt] && wrestlerAt(G, t.lineup[wt], wt), o = ol[wt] && wrestlerAt(G, ol[wt], wt);
    return `<tr><td><b>${wt}</b></td><td>${w ? `${wl(w)} <span class="muted">${CLASS_NAMES[w.cls]}</span> ${wstat(w)} <span class="${w.fatigue > 50 ? 'neg' : 'muted'}">F${Math.round(w.fatigue)}</span>` : '<span class="neg">forfeit</span>'}</td><td>${o ? `${wl(o)} <span class="muted">${CLASS_NAMES[o.cls]}</span> ${wstat(o)}` : '<span class="pos">forfeit</span>'}</td></tr>`;
  }).join('');
  return `<div class="card"><h2>Dual day — ${home ? 'vs' : 'at'} ${tag(opp.id, rm)}</h2>
    <p class="muted">Week ${G.week} · ${fmtDate(G.week)} · ${du.conf ? 'Conference dual' : 'Non-conference dual'} · Your plan: <b>${t.plan}</b></p>
    <table class="tbl"><tr><th>Wt</th><th>${tn(t.id)}</th><th>${tn(opp.id)}</th></tr>${rows}</table>
    <div class="row" style="margin-top:10px"><button data-act="startdual">${du.prog ? 'Resume the dual ▶' : 'Start the dual ▶'}</button><button class="secondary" data-act="nav" data-v="lineup">Edit lineup</button></div></div>`;
}

function dual() {
  const du = findDual(ui.dual.id), r = du.result, n = ui.dual.shown, P = du.prog;
  const order = du.order || r.bouts.map(b => b.wt), total = order.length;
  let sa = 0, sb = 0;
  r.bouts.slice(0, n).forEach(b => { if (b.w === 'A') sa += b.tp; else if (b.w === 'B') sb += b.tp; });
  const A = G.teams[du.a], B = G.teams[du.b], final = n >= total;
  const subTag = on => (on ? ' <small class="tag al">sub</small>' : '');
  const rows = order.map((wt, i) => {
    const b = r.bouts[i];
    if (!b || i >= n) return `<tr class="muted"><td><b>${wt}</b></td><td colspan="4">…</td></tr>`;
    const wa = b.w === 'A', wb = b.w === 'B';
    return `<tr><td><b>${b.wt}</b></td><td class="${wa ? 'win' + (du.a === G.userTeam ? ' mine' : '') : wb && b.wa ? 'lose' : ''}">${b.wa ? wl(b.wa, b.na) : b.na}${subTag(b.subA)}</td><td class="${wb ? 'win' + (du.b === G.userTeam ? ' mine' : '') : wa && b.wb ? 'lose' : ''}">${b.wb ? wl(b.wb, b.nb) : b.nb}${subTag(b.subB)}</td><td>${b.m === 'Vacant' ? '—' : b.d}</td>
      <td>${b.tp ? `${b.w === 'A' ? A.name : B.name} +${b.tp}` : ''} ${b.seed ? `<a data-act="watchbout" data-v="${i}">watch</a>` : ''}</td></tr>`;
  }).join('');
  let ctrl;
  if (!final) ctrl = `<button class="secondary" data-act="auto" title="Plays the remaining bouts with the lineup you have set">${ui.timer ? 'Running…' : 'Auto-Run'}</button>${ui.dual.live ? '<button data-act="watchnext">👁 Watch Next Match</button>' : ''}<button data-act="next">Next Bout Result ▶</button><button class="secondary" data-act="dualjump" title="Plays the remaining bouts with the lineup you have set">⏭ Jump to Result</button>`;
  else ctrl = ui.dual.tid ? `<button data-act="backtourn">Back to tournament ▶</button>` : ui.dual.live ? `<button data-act="finishweek">Finish week ▶</button>` : `<button class="secondary" data-act="backsched">Back to schedule</button>`;
  const winName = r.winner === 'A' ? A.name : B.name;
  const nm = id => (id && G.wrestlers[id] ? G.wrestlers[id].name : 'no one');
  const why = { rest: 'resting a starter (dual clinched)', matchup: 'lineup change for a better matchup', coach: 'coach\'s call' };
  const moves = (r.subs || []).filter(s => s.k < n || s.tid === G.userTeam).map(s => `<li>${tn(s.tid, 14)} at <b>${s.wt}</b>: ${nm(s.in)} in for ${nm(s.out)} <span class="muted">· ${why[s.why] || s.why}</span></li>`).join('');
  // the user's coaching panel (live duals only): both lineups for the weights still to wrestle
  let coach = '';
  if (P && ui.dual.live && !final && !du.done && (du.a === G.userTeam || du.b === G.userTeam) && n === r.bouts.length) {
    const side = du.a === G.userTeam ? 'A' : 'B', mine = P['line' + side], theirs = P['line' + (side === 'A' ? 'B' : 'A')];
    const crow = order.slice(P.k).map(wt => {
      const o = theirs[wt] && G.wrestlers[theirs[wt]];
      const opts = ['<option value="">— Forfeit —</option>'].concat(subOptions(G, du, wt).map(w => `<option value="${w.id}" ${w.id === mine[wt] ? 'selected' : ''}>${w.name} · ${CLASS_NAMES[w.cls]} (${w.natural}) ${wtxt(w)} · F${Math.round(w.fatigue)}${w.natural !== wt ? ' ⚠ up' : ''}</option>`)).join('');
      return `<tr><td><b>${wt}</b></td><td><select data-chg="dualsub" data-wt="${wt}">${opts}</select></td><td>${o ? `${wl(o)} ${wstat(o)}` : '<span class="muted">forfeit</span>'}</td></tr>`;
    }).join('');
    coach = `<div class="card"><h3 style="margin-top:0">Coach's corner <small class="muted">change your lineup for the weights still to wrestle</small></h3>
      <table class="tbl"><tr><th>Wt</th><th>${tn(G.userTeam, 16)}</th><th>${tn(side === 'A' ? du.b : du.a, 16)}</th></tr>${crow}</table>
      <p class="hint">A wrestler wrestles once per dual. Rest a starter when the dual is won, or bump a better wrestler up a class (⚠ costs a little) when you are behind. Choosing someone already slotted at another weight? Replace him there first. Auto-Run and Jump to Result keep the lineup you have set here; the assistant coach only acts when a dual is simulated without you opening it.</p></div>`;
  }
  return `<div class="card"><div class="scoreboard"><div class="A"><div class="pts">${sa}</div><div class="nm">${tn(A.id, 38)}</div></div>
    <div class="clock"><span>${final ? 'FINAL' : `Bout ${n} / ${total}`}</span><small>Week ${du.week}</small></div><div class="B"><div class="pts">${sb}</div><div class="nm">${tn(B.id, 38)}</div></div></div>
    <div class="row">${ctrl}</div>
    ${final ? `<p><b>${winName}</b> wins ${Math.max(r.sa, r.sb)}-${Math.min(r.sa, r.sb)}${r.tiebreak ? ' (tie-break on bonus points)' : ''}.</p>` : ''}
    <table class="tbl"><tr><th>Wt</th><th>${tn(A.id)}</th><th>${tn(B.id)}</th><th>Result</th><th></th></tr>${rows}</table>
    ${moves ? `<h4 style="margin:12px 0 4px">Lineup moves</h4><ul class="moves">${moves}</ul>` : ''}</div>${coach}${boutView()}`;
}

// wrestler profile: conference / NCAA results by season + Outstanding Wrestler awards (w.tr = {season: {c, n}} place 1-8, 9 = competed without placing; w.aw = awards)
function tourCard(w, hide) {
  const ord = n => n + (['st', 'nd', 'rd'][n - 1] || 'th'), done = G.ncaa && G.ncaa.season === G.season && G.ncaa.rv && G.ncaa.rv.done;
  const seasons = [...new Set([...Object.keys(w.tr || {}).map(Number), G.season])].sort((x, y) => y - x);
  const confDone = G.tournaments.some(t => t.kind === 'conf' && t.done);
  const lab = (kind, s) => {
    const tr = (w.tr || {})[s] || {}, p = tr[kind], cur = s === G.season;
    if (cur && hide >= 0) return '<span class="muted">—</span>';
    if (p) return p === 1 ? `<b class="tcwin">${kind === 'n' ? 'National champion' : 'Champion'}</b>` : p <= 8 ? `<b>${ord(p)}</b>${kind === 'n' ? ' <span class="muted">All-American</span>' : ''}` : '<span class="muted">Qualified</span>';
    if (kind === 'n') return (cur ? done && tr.c : tr.c) ? '<span class="neg">Did not qualify</span>' : '<span class="muted">—</span>';
    return (cur && confDone && hide < 0) ? '<span class="muted">Did not compete</span>' : '<span class="muted">—</span>';
  };
  const rows = seasons.map(s => `<tr><td>${s}</td><td>${lab('c', s)}</td><td>${lab('n', s)}</td></tr>`).join('');
  const aw = (w.aw || []).filter(a => a.wk !== hide || a.season !== G.season).sort((x, y) => y.season - x.season);
  return `<h3 style="margin-top:14px">Tournament results</h3><table class="tbl"><tr><th>Season</th><th>Conference</th><th>NCAA Championships</th></tr>${rows}</table>
    ${aw.length ? `<p style="margin-top:8px"><b>Outstanding Wrestler</b> <span class="muted">${aw.length}×</span><br>${aw.map(a => `${a.ev} <span class="muted">${a.season}</span>`).join('<br>')}</p>` : ''}`;
}

// ---------- team + tournament profiles ----------
const seasonLbl = s => `${s}-${String(s + 1).slice(2)}`;
const ordn = n => n + (['st', 'nd', 'rd'][n - 1] || 'th');
// every past winner of an event: this game's record (G.tHist) plus the NCAA history of older saves
function pastWinners(name) {
  const list = [...((G.tHist || {})[name] || [])];
  if (name === 'NCAA Championships') for (const h of G.history || []) if (!list.some(x => x.season === h.season)) {
    list.push({ season: h.season, team: h.champion, pts: h.top?.[0]?.pts, champs: Object.fromEntries(Object.entries(h.champs || {}).map(([wt, c]) => [wt, { name: c.name, team: c.team }])) });
  }
  return list.sort((a, b) => b.season - a.season);
}
function teamProfile() {
  const id = ui.tm, t = G.teams[id], back = `<button class="secondary" data-act="profback">◀ Back</button>`;
  if (!t) return `<div class="card"><p>Team not found.</p>${back}</div>`;
  const pend = syncStats(), rec = records(G)[id], rk = rankMap()[id], hide = eventInProgress() ? G.week : -1, mine = id === G.userTeam;
  const winCls = mine ? 'tcwin' : 'pos', col = TEAM_COLORS[id] || '#3b82f6', polls = ensurePolls(G);
  const lu = new Set(Object.values(t.lineup || {}));
  const ws = t.roster.map(i => G.wrestlers[i]).filter(Boolean).sort((a, b) => a.natural - b.natural || overall(b) - overall(a));
  const rosterRows = ws.map(w => { const st = seasonOf(w), p = (polls[w.lw || w.natural] || []).indexOf(w.id) + 1;
    return `<tr><td>${wl(w)}</td><td>${CLASS_NAMES[w.cls]}</td><td>${w.natural}</td><td>${st[0]}-${st[1]}</td><td>${p ? '#' + p : ''}</td><td>${lu.has(w.id) ? '★' : ''}</td><td>${w.injury ? `<span class="neg">🩹 ${w.injury.weeks}w</span>` : ''}</td></tr>`; }).join('');
  const info = [
    ['Conference', t.conf], ['National rank', `#${rk}`], ['Prestige', Math.round(t.prestige)], ['Team strength', teamStrength(G, id).toFixed(1)],
    ['Dual record', `${rec.w}-${rec.l}`], ['Conference record', `${rec.cw}-${rec.cl}`], ['Points for / against', `${rec.pf} / ${rec.pa}`],
    ['Roster', `${ws.length} wrestlers · ${ws.filter(w => w.injury).length} injured`],
    ...(t.state ? [['State', t.state]] : []), ...(t.acad != null ? [['Academics', t.acad]] : []),
    ...(mine ? [['Scholarships used', `${R.teamAidUsed(G, id).toFixed(2)} of ${R.AID_CAP}`]] : []),
  ].map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('');
  // NCAA history inside this game
  const nc = (G.history || []).slice().reverse().map(h => { const i = (h.top || []).findIndex(x => x.team === id), ch = Object.values(h.champs || {}).filter(c => c.team === id).length;
    return `<tr><td>${seasonLbl(h.season)}</td><td>${h.champion === id ? `<b class="${winCls}">1st</b>` : i >= 0 ? ordn(i + 1) : h.aa?.[id] ? 'outside top 10' : '—'}</td><td>${i >= 0 ? h.top[i].pts : ''}</td><td>${h.aa?.[id] || 0}</td><td>${ch}</td></tr>`; }).join('');
  const titles = Object.keys(G.tHist || {}).concat(G.history?.length ? ['NCAA Championships'] : []).filter((n, i, a) => a.indexOf(n) === i)
    .flatMap(n => pastWinners(n).filter(x => x.team === id).map(x => ({ n, season: x.season }))).sort((a, b) => b.season - a.season);
  // this season
  const evs = teamTournaments(G, id).map(tt => { let res = '<span class="muted">—</span>';
    if (tt.done && tt.result && !L.isLive(tt) && tt.week !== hide) { const ix = tt.result.teamScores.findIndex(x => x.team === id); res = ix < 0 ? 'no points' : tt.kind === 'dual' ? `<b class="${ix === 0 ? winCls : ''}">${ordn(tt.result.teamScores[ix].place)}</b> · ${tt.result.teamScores[ix].pts} dual wins` : `<b class="${ix === 0 ? winCls : ''}">${ordn(ix + 1)}</b> · ${tt.result.teamScores[ix].pts} pts`; }
    return `<tr><td>${tt.week}</td><td>${tl(tt.name)}</td><td>${tt.dates}</td><td>${res}</td></tr>`; }).join('');
  const duals = G.schedule.filter(d => d.a === id || d.b === id).sort((a, b) => a.week - b.week).map(d => { const home = d.a === id, opp = home ? d.b : d.a; let res = '<span class="muted">—</span>';
    if (d.done && d.week !== hide) { const my = home ? d.result.sa : d.result.sb, th = home ? d.result.sb : d.result.sa, won = (d.result.winner === 'A') === home, txt = `${won ? 'W' : 'L'} ${my}-${th}`;
      res = `<span class="${won ? winCls : 'neg'}">${mine ? `<a data-act="opendual" data-v="${d.id}" class="${won ? 'tcwin' : 'neg'}">${txt}</a>` : txt}</span>`; }
    return `<tr><td>${d.week}</td><td>${fmtDate(d.week)}</td><td>${home ? 'vs' : 'at'} ${tn(opp, 18)}</td><td>${d.conf ? 'Conference' : ''}</td><td>${res}</td></tr>`; }).join('');
  return `<div class="card"><div class="row">${back}</div>
    <div style="display:flex;align-items:center;gap:14px;margin-top:10px;border-left:4px solid ${col};padding-left:12px">${schoolLogo(id, t.name, 56)}
      <div><h2 style="margin:0">${t.name}</h2><div class="muted">${t.conf} · #${rk} dual rank · #${(tournamentRankings(G).find(x => x.id === id) || {}).rank} tournament rank · ${rec.w}-${rec.l}${mine ? ' · your team' : ''}</div></div></div>${pend}
    <div class="cols2" style="margin-top:14px;align-items:start"><div><h3>Program</h3><table class="tbl">${info}</table></div>
      <div><h3>Titles won <small class="muted">(this game)</small></h3>${titles.length ? `<table class="tbl">${titles.map(x => `<tr><td>${seasonLbl(x.season)}</td><td>${tl(x.n)}</td></tr>`).join('')}</table>` : '<p class="muted">No team titles yet.</p>'}</div></div>
    <h3 style="margin-top:14px">Roster <small class="muted">${ws.length} wrestlers · ★ = starter</small></h3>
    <div style="overflow-x:auto"><table class="tbl dense"><tr><th>Name</th><th>Cl</th><th>Wt</th><th>W-L</th><th>Rank</th><th></th><th>Status</th></tr>${rosterRows}</table></div>
    <h3 style="margin-top:14px">${G.season} season</h3>
    <div style="overflow-x:auto"><table class="tbl"><tr><th>Wk</th><th>Date</th><th>Dual</th><th></th><th>Result</th></tr>${duals || '<tr><td colspan="5" class="muted">No duals scheduled</td></tr>'}</table></div>
    ${evs ? `<h3 style="margin-top:14px">Tournaments</h3><table class="tbl"><tr><th>Wk</th><th>Event</th><th>Dates</th><th>Team finish</th></tr>${evs}</table>` : ''}
    ${nc ? `<h3 style="margin-top:14px">NCAA Championships history</h3><table class="tbl"><tr><th>Season</th><th>Team finish</th><th>Pts</th><th>All-Americans</th><th>Champions</th></tr>${nc}</table>` : ''}</div>`;
}
function tournamentProfile() {
  const name = ui.tp, back = `<button class="secondary" data-act="profback">◀ Back</button>`;
  const t = G.tournaments.find(x => x.name === name), past = pastWinners(name);
  if (!t && !past.length) return `<div class="card"><p>No information on ${name} yet.</p>${back}</div>`;
  const kind = t ? t.kind : name === D_NAME ? 'dual' : 'ncaa', tierTxt = kind === 'ncaa' ? 'National championships' : kind === 'conf' ? 'Conference championships' : kind === 'dual' ? 'National dual tournament (top 16, single elimination)' : t.tier === 'major' ? 'Major invitational' : 'Open tournament';
  const start = t ? t.dates.split('-')[0] : '—';
  const info = [
    ['Type', tierTxt],
    ['Host location', t ? `${t.loc}${kind === 'conf' || kind === 'ncaa' ? ' <span class="muted">(host site varies)</span>' : ''}` : '—'],
    ['Start date', t ? `${start} <span class="muted">(${t.dates}${t.week ? ` · week ${t.week}` : ''})</span>` : 'Not set yet this season'],
    ['Teams entered', t ? t.teams.length : '—'], ['Status', t ? (t.done && !L.isLive(t) ? 'Completed' : L.isLive(t) ? 'In progress' : 'Upcoming') : '—'],
  ].map(([k, v]) => `<tr><td class="muted">${k}</td><td>${v}</td></tr>`).join('');
  const tally = (key, label) => { const c = {}; past.forEach(x => key(x).forEach(k => { c[k.k] = c[k.k] || { n: 0, html: k.html }; c[k.k].n++; })); const rows = Object.values(c).sort((a, b) => b.n - a.n).slice(0, 5);
    return rows.length ? `<table class="tbl"><tr><th>${label}</th><th>Titles</th></tr>${rows.map(r => `<tr><td>${r.html}</td><td>${r.n}</td></tr>`).join('')}</table>` : ''; };
  const teamTally = tally(x => x.team ? [{ k: x.team, html: tn(x.team, 18) }] : [], 'Most team titles');
  const indTally = tally(x => Object.values(x.champs || {}).map(c => ({ k: c.name, html: `${wl(c.id, c.name)} <span class="muted">${G.teams[c.team]?.name || ''}</span>` })), 'Most individual titles');
  const rows = past.map(x => `<tr><td>${seasonLbl(x.season)}</td><td>${x.team ? tn(x.team, 18) : '—'}</td><td>${x.pts ?? ''}</td><td>${x.mow ? `${wl(x.mow.id, x.mow.name)} <span class="muted">${x.mow.wt}</span>` : '<span class="muted">—</span>'}</td>
    <td><details><summary>${Object.keys(x.champs || {}).length} champions</summary><table class="tbl dense">${WEIGHTS.filter(wt => x.champs?.[wt]).map(wt => { const c = x.champs[wt], m = c.team === G.userTeam;
      return `<tr><td><b>${wt}</b></td><td class="${m ? 'tcname' : ''}">${wl(c.id, c.name)}</td><td>${G.teams[c.team] ? tn(c.team, 14) : ''}</td></tr>`; }).join('')}</table></details></td></tr>`).join('');
  const field = t && t.teams.length <= 40 ? `<h3 style="margin-top:14px">Teams entered</h3><p style="line-height:2">${t.teams.map(i => tn(i, 16)).join(' &nbsp; ')}</p>` : '';
  return `<div class="card"><div class="row">${back}</div><h2 style="margin-top:10px">${name}</h2>
    <div class="cols2" style="align-items:start"><div><h3>Details</h3><table class="tbl">${info}</table></div><div>${teamTally}${indTally}</div></div>
    <h3 style="margin-top:14px">Past winners</h3>
    ${rows ? `<div style="overflow-x:auto"><table class="tbl"><tr><th>Season</th><th>Team winner</th><th>Pts</th><th>Outstanding wrestler</th><th>Individual champions</th></tr>${rows}</table></div>` : '<p class="muted">No completed editions yet in this game. Winners are recorded as each tournament finishes.</p>'}
    ${field}</div>`;
}

function boutView() {
  const v = ui.view; if (!v) return '';
  const res = v.res, log = res.log.slice(0, v.shown), last = log[log.length - 1];
  const done = v.shown >= res.log.length;
  const feed = log.map(ev => `<div class="ev ${ev.type}"><span class="t">${ev.period} ${ev.clock}</span>${ev.text}</div>`).join('');
  const st = res.stats;
  return `<div class="card"><div class="scoreboard"><div class="A"><div class="pts">${last ? last.a : 0}</div><div class="nm">${res.wrestlers.A.name}</div></div>
    <div class="clock"><span>${last ? last.clock : '3:00'}</span><small>${last ? last.period : ''}</small></div><div class="B"><div class="pts">${last ? last.b : 0}</div><div class="nm">${res.wrestlers.B.name}</div></div></div>
    <div class="row"><button class="secondary" data-act="viewjump" ${done ? 'disabled' : ''}>⏭ Jump to result</button><button class="secondary" data-act="viewclose">Close</button></div>
    <div id="feed">${feed}</div>
    ${done ? `<div class="result"><b>${res.detail}</b> · ${res.teamPoints} team points · Takedowns ${st.A.takedowns}-${st.B.takedowns} · Escapes ${st.A.escapes}-${st.B.escapes} · Near-fall pts ${st.A.nfPoints}-${st.B.nfPoints} · Ride ${fmtClock(st.A.ride)}-${fmtClock(st.B.ride)}</div>` : ''}</div>`;
}

render();
