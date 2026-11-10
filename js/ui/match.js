// Match Lab UI: build two wrestlers, simulate, watch the play-by-play or jump to the result.
import { simulateBout, ATTR_KEYS, ATTR_LABELS, fmtClock } from '../engine/bout.js';
import { generateWrestler, WEIGHTS, ARCHETYPES } from '../data/gen.js';
import { makeRng } from '../engine/rng.js';
import { loadGame, newGame, wrestlerAt, overall, CLASS_NAMES, potLabel } from '../game/core.js';

// League for "From a team": the saved game if there is one, else a fresh league so every roster is available.
let LG = null, leagueNote = '';
try { LG = loadGame(); if (LG) leagueNote = `saved game (${LG.season}, ${LG.teams[LG.userTeam].name})`; } catch (e) { LG = null; }
if (!LG) { LG = newGame('penn-state', 'Lab', 20260101); leagueNote = 'fresh league (no saved game found)'; }
const teamList = Object.values(LG.teams).sort((a, b) => a.name.localeCompare(b.name));

const $ = id => document.getElementById(id);
const W = { A: null, B: null };
const cfg = { A: { src: 'gen', team: LG.teams['penn-state'] ? 'penn-state' : teamList[0].id, wid: null, quality: 14, archetype: 'leg_attacker', plan: 'balanced' },
  B: { src: 'gen', team: LG.teams['oklahoma-state'] ? 'oklahoma-state' : teamList[1].id, wid: null, quality: 14, archetype: 'rider', plan: 'balanced' } };
let result = null, timer = null, idx = 0;

const tier = v => (v >= 18 ? 't4' : v >= 15 ? 't3' : v >= 11 ? 't2' : 't1');

const rosterOf = tid => LG.teams[tid].roster.map(id => LG.wrestlers[id]).sort((x, y) => x.natural - y.natural || overall(y) - overall(x));
function pickerHtml(side) {
  const c = cfg[side];
  if (c.src !== 'team') return '';
  const ws = rosterOf(c.team);
  if (!ws.find(w => w.id === c.wid)) c.wid = (ws.find(w => w.natural === +$('weight').value) || ws[0]).id;
  const opts = WEIGHTS.map(wt => { const g = ws.filter(w => w.natural === wt); return g.length ? `<optgroup label="${wt}">${g.map(w => `<option value="${w.id}" ${w.id === c.wid ? 'selected' : ''}>${w.name} · ${CLASS_NAMES[w.cls]} · OVR ${overall(w).toFixed(1)}${w.injury ? ' (injured)' : ''}</option>`).join('')}</optgroup>` : ''; }).join('');
  return `<div class="row"><label>Team <select data-side="${side}" data-f="team">${teamList.map(t => `<option value="${t.id}" ${t.id === c.team ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
    <label>Wrestler <select data-side="${side}" data-f="wid">${opts}</select></label></div>`;
}
function cardHtml(side) {
  const w = W[side], c = cfg[side], isTeam = c.src === 'team';
  const rows = ATTR_KEYS.map(k => `<div class="attr"><span>${ATTR_LABELS[k]}</span><div class="bar"><i class="${tier(w.attrs[k])}" style="width:${w.attrs[k] * 5}%"></i></div><b>${w.attrs[k]}</b></div>`).join('');
  const arch = Object.entries(ARCHETYPES).map(([k, v]) => `<option value="${k}" ${k === c.archetype ? 'selected' : ''}>${v.label}</option>`).join('');
  const src = `<div class="row"><label>Source <select data-side="${side}" data-f="src"><option value="gen" ${isTeam ? '' : 'selected'}>Generated</option><option value="team" ${isTeam ? 'selected' : ''}>From a team roster</option></select></label></div>${pickerHtml(side)}`;
  const base = isTeam ? LG.wrestlers[c.wid] : null;
  const sub = isTeam ? `${w.school} · ${CLASS_NAMES[base.cls]} · natural ${base.natural} lbs${base.natural !== w.weight ? ` (competing at ${w.weight}: -3 str, -2 cardio, -2 speed, -1 tdd)` : ''} · OVR ${overall(w).toFixed(1)} · potential ${potLabel(base)}` : `${w.school} · ${w.weight} lbs · ${ARCHETYPES[w.archetype].label}`;
  const gen = isTeam ? '' : `<hr style="border:0;border-top:1px solid var(--line);margin:10px 0">
    <div class="row"><label>Quality <input type="range" min="6" max="19" value="${c.quality}" data-side="${side}" data-f="quality"> <b>${c.quality}</b></label></div>
    <div class="row"><label>Style <select data-side="${side}" data-f="archetype">${arch}</select></label></div>`;
  return `<h2 style="color:var(--${side === 'A' ? 'a' : 'b'})">${side === 'A' ? 'Wrestler A' : 'Wrestler B'}</h2>${src}
    <div class="name">${w.name}</div><div class="sub">${sub}</div>
    ${rows}${gen}
    <div class="row"><label>Game plan <select data-side="${side}" data-f="plan">${['aggressive', 'balanced', 'conservative'].map(p => `<option ${p === c.plan ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>`;
}

function build(side, rng) {
  const c = cfg[side];
  if (c.src === 'team') {                       // roster wrestler, healthy and rested, at the selected weight
    const base = LG.wrestlers[c.wid], inj = base.injury; base.injury = null;
    const w = wrestlerAt(LG, c.wid, +$('weight').value); base.injury = inj;
    w.fatigue = 0; w.injury = null; w.school = LG.teams[base.team].name; w.plan = c.plan;
    W[side] = w; return;
  }
  const w = generateWrestler(rng, { weight: +$('weight').value, quality: c.quality, archetype: c.archetype });
  w.plan = c.plan;
  W[side] = w;
}
function renderCards() {
  $('cardA').innerHTML = cardHtml('A'); $('cardB').innerHTML = cardHtml('B');
  document.querySelectorAll('[data-side]').forEach(el => el.onchange = el.oninput = onCfg);
  $('nA').textContent = W.A.name; $('nB').textContent = W.B.name;
}
function onCfg(e) {
  const { side, f } = e.target.dataset;
  cfg[side][f] = f === 'quality' ? +e.target.value : e.target.value;
  if (f === 'plan') { W[side].plan = cfg[side].plan; if (e.type === 'change') simulate(); return; }
  if (e.type !== 'change') return;
  const rng = makeRng((Math.random() * 4294967296) >>> 0);
  if (f === 'team' || f === 'src') cfg[side].wid = null;   // pickerHtml picks a starter at the current weight
  if (cfg[side].src === 'team') {
    pickerHtml(side);                                       // resolves cfg.wid
    // meet at the chosen wrestler's natural weight
    if (f === 'wid' || f === 'team' || f === 'src') $('weight').value = LG.wrestlers[cfg[side].wid].natural;
    const wtNow = +$('weight').value;
    for (const sd of ['A', 'B']) { if (cfg[sd].src === 'team' && sd !== side && LG.wrestlers[cfg[sd].wid]?.natural !== wtNow) cfg[sd].wid = null; if (cfg[sd].src === 'team') pickerHtml(sd); build(sd, rng); }
  } else build(side, rng);
  renderCards(); simulate();
}

function reset() {
  clearInterval(timer); timer = null; idx = 0;
  $('feed').innerHTML = ''; $('result').hidden = true;
  $('sA').textContent = '0'; $('sB').textContent = '0'; $('clk').textContent = '3:00'; $('per').textContent = 'Ready';
}
function simulate(newSeed = true) {
  if (newSeed) $('seed').value = (Math.random() * 1e9) | 0;
  W.A.plan = cfg.A.plan; W.B.plan = cfg.B.plan;
  result = simulateBout(W.A, W.B, { seed: +$('seed').value });
  reset();
}
function addEvent(ev) {
  const d = document.createElement('div');
  d.className = `ev ${ev.type}`;
  d.innerHTML = `<span class="t">${ev.period} ${ev.clock}</span>${ev.text}`;
  $('feed').appendChild(d); $('feed').scrollTop = $('feed').scrollHeight;
  $('sA').textContent = ev.a; $('sB').textContent = ev.b; $('clk').textContent = ev.clock; $('per').textContent = ev.period;
}
function showResult() {
  const r = result, a = r.stats.A, b = r.stats.B, w = r.wrestlers[r.winner];
  const row = (l, x, y) => `<tr><td>${l}</td><td>${x}</td><td>${y}</td></tr>`;
  $('result').hidden = false;
  $('result').innerHTML = `<b>${w.name}</b> (${w.school}) wins — <b>${r.detail}</b> · ${r.teamPoints} team points
    <table class="stats" style="margin-top:8px"><tr><th></th><th style="color:var(--a)">${W.A.name}</th><th style="color:var(--b)">${W.B.name}</th></tr>
    ${row('Final score', r.score.A, r.score.B)}${row('Shots', a.shots, b.shots)}${row('Takedowns', a.takedowns, b.takedowns)}${row('Escapes', a.escapes, b.escapes)}
    ${row('Reversals', a.reversals, b.reversals)}${row('Near-fall pts', a.nfPoints, b.nfPoints)}${row('Big moves tried', a.bigMoves, b.bigMoves)}
    ${row('Riding time', fmtClock(a.ride), fmtClock(b.ride))}${row('Energy at end', Math.round(a.energy), Math.round(b.energy))}</table>`;
}
function watch() {
  reset();
  const ms = +$('speed').value;
  $('watch').disabled = true;
  timer = setInterval(() => {
    if (idx >= result.log.length) { clearInterval(timer); timer = null; $('watch').disabled = false; showResult(); return; }
    addEvent(result.log[idx++]);
  }, ms);
}
function jump() {
  clearInterval(timer); timer = null; $('feed').innerHTML = '';
  result.log.forEach(addEvent); idx = result.log.length; $('watch').disabled = false; showResult();
}

$('leagueNote').textContent = 'Team rosters come from the ' + leagueNote + '. Choose "From a team roster" on either side to test real wrestlers; the weight box is the weight they compete at (changing it picks a starter at that weight).';
$('weight').innerHTML = WEIGHTS.map(w => `<option ${w === 157 ? 'selected' : ''}>${w}</option>`).join('');
$('weight').onchange = () => newMatchup();
function newMatchup() {
  const rng = makeRng((Math.random() * 4294967296) >>> 0);
  for (const sd of ['A', 'B']) if (cfg[sd].src === 'team') { cfg[sd].wid = cfg[sd].wid && LG.wrestlers[cfg[sd].wid]?.natural === +$('weight').value ? cfg[sd].wid : null; pickerHtml(sd); }
  build('A', rng); build('B', rng); renderCards(); simulate();
}
$('reroll').onclick = newMatchup;
$('rematch').onclick = () => simulate(true);
$('watch').onclick = watch;
$('jump').onclick = jump;
newMatchup();
