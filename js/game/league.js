// Custom leagues: a user-uploaded league file replaces the schools, conference alignment, NCAA bids, in-season tournaments and (optionally) rosters
// for NEW careers. Stored in this browser (localStorage wc.league). A career keeps its league's conferences/bids/tournaments in G.league
// (rosters are only needed at newGame). Format: see templateLeague() / docs/data.md (Custom leagues). Pure data, no DOM.
import { SCHOOLS, CONFERENCES, REGIONS, schoolId, regionOf, acadOf, isIndependent } from '../data/schools.js';
import { STATE_OF } from '../data/states.js';
import { TOURNAMENT_RULES, CONF_BIDS } from '../data/tournaments.js';
import { REAL_TEAMS } from '../data/realteams.js';
import { WEIGHTS } from '../data/gen.js';

const KEY = 'wc.league';
export const MIN_TEAMS = 16, MAX_TEAMS = 200;   // the National Duals bracket needs 16 programs
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const CLS = { fr: 1, so: 2, jr: 3, sr: 4, '5th': 5, gr: 5, grad: 5 };
const CLS_LBL = ['', 'Fr', 'So', 'Jr', 'Sr', '5th Yr'];

export function loadLeague() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function saveLeague(pack) { try { localStorage.setItem(KEY, JSON.stringify(pack)); return true; } catch (e) { return false; } }
export function clearLeague() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

// ---------- templates (the default league in the upload format) ----------
const ruleOut = r => ({ name: r.name, tier: r.tier, location: r.loc, conferences: r.confs.slice(), month: r.m + 1, week: r.nth === -1 ? 'last' : r.nth, day: DAYS[r.dow][0].toUpperCase() + DAYS[r.dow].slice(1), days: r.days });
const rosterOut = raw => raw.split('\n').map(line => { const [name, wt, cls, ovr, st, hm] = line.split('|');
  return { name, weight: +wt, class: CLS_LBL[+cls] || 'Fr', rating: +ovr, starter: st === '1', ...(hm ? { hometown: hm } : {}) }; });
export function templateLeague(withRosters = true) {
  return {
    name: 'My league',
    about: 'Wrestling Coach league file. Edit and upload it from the main menu (Custom league). Teams need name + conference; everything else is optional. '
      + 'rating = in-game overall (about 9 = walk-on, 12.6 = average D1 starter, 15 = All-American, 18+ = title contender). class = Fr/So/Jr/Sr/5th Yr. '
      + 'Teams without a roster get real rosters (if the school name matches and real names are on) or generated ones. Weights with fewer than 2 wrestlers get generated walk-ons. '
      + 'Conferences named "Independent..." (or with only 1 team) hold no conference tournament: their wrestlers can only earn at-large NCAA bids. '
      + 'Tournaments: month 11-2 (Nov-Feb), week 1-5 or "last" = which occurrence of that weekday in the month, days = length. Omit "tournaments" to keep the default events.',
    conferences: CONFERENCES.filter(c => SCHOOLS.some(s => s.conf === c)).map(c => ({ name: c, ...(isIndependent(c) ? {} : { bids: CONF_BIDS[c] ?? 1 }) })),
    teams: SCHOOLS.map(s => ({ name: s.name, conference: s.conf, prestige: s.prestige, region: s.region, academics: s.acad, state: s.state,
      ...(withRosters && REAL_TEAMS[s.name] ? { roster: rosterOut(REAL_TEAMS[s.name]) } : {}) })),
    tournaments: TOURNAMENT_RULES.map(ruleOut),
  };
}
// Rosters as CSV (one row per wrestler): team,name,weight,class,rating,starter,hometown
export const CSV_HEAD = ['team', 'name', 'weight', 'class', 'rating', 'starter', 'hometown'];
const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function rosterCsv(pack = templateLeague(true)) {
  const rows = [CSV_HEAD.join(',')];
  for (const t of pack.teams) for (const w of t.roster || []) rows.push([t.name, w.name, w.weight, w.class, w.rating, w.starter ? 'Y' : '', w.hometown || ''].map(csvCell).join(','));
  return rows.join('\n');
}
function parseCsv(text) {
  const rows = [], n = text.length; let row = [], cell = '', q = false;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

// ---------- validation ----------
const num = (v, lo, hi) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const clsOf = v => { if (typeof v === 'number') return v >= 1 && v <= 5 ? Math.round(v) : null; const m = String(v || '').toLowerCase().match(/(5th|grad|\bgr\b|fr|so|jr|sr)/); return m ? CLS[m[1]] : (num(v, 1, 5) != null ? Math.round(num(v, 1, 5)) : null); };
const truthy = v => v === true || /^(y|yes|true|1|s|starter)$/i.test(String(v ?? '').trim());
function cleanRoster(list, team, errs, warns) {
  const out = [];
  list.forEach((w, i) => {
    const where = `${team} roster #${i + 1}`;
    if (!w || typeof w !== 'object') return errs.push(`${where}: not an object`);
    const name = String(w.name || '').trim(), wt = +w.weight;
    if (!name) return errs.push(`${where}: missing name`);
    if (!WEIGHTS.includes(wt)) return errs.push(`${where} (${name}): weight must be one of ${WEIGHTS.join(', ')}`);
    const cls = clsOf(w.class); if (cls == null && w.class != null && w.class !== '') warns.push(`${where} (${name}): class "${w.class}" not recognised, using Fr`);
    const rating = w.rating == null || w.rating === '' ? null : num(w.rating, 1, 20); if (w.rating != null && w.rating !== '' && rating == null) warns.push(`${where} (${name}): rating "${w.rating}" is not a number, using the team default`);
    out.push({ name: name.replace(/\|/g, '/'), weight: wt, class: CLS_LBL[cls || 1], rating, starter: truthy(w.starter), ...(w.hometown ? { hometown: String(w.hometown).replace(/[|\n]/g, ' ').trim() } : {}) });
  });
  if (out.length > 40) warns.push(`${team}: ${out.length} wrestlers (big rosters get trimmed by the offseason roster limit)`);
  return out;
}
function cleanRule(r, i, errs, warns) {
  const where = `Tournament #${i + 1}${r && r.name ? ` (${r.name})` : ''}`;
  if (!r || typeof r !== 'object' || !String(r.name || '').trim()) { errs.push(`${where}: missing name`); return null; }
  const month = Math.round(num(r.month, 1, 12) ?? 12);
  if (![11, 12, 1, 2].includes(month)) warns.push(`${where}: month ${month} is outside the season (Nov-Feb); it is moved to the nearest season week`);
  const wk = String(r.week ?? 1).toLowerCase() === 'last' || +r.week === -1 ? -1 : Math.round(num(r.week, 1, 5) ?? 1);
  const dow = typeof r.day === 'number' ? Math.max(0, Math.min(6, r.day)) : Math.max(0, DAYS.indexOf(String(r.day || 'sat').slice(0, 3).toLowerCase()));
  const tier = String(r.tier || 'open').toLowerCase() === 'major' ? 'major' : 'open';
  return { name: String(r.name).trim(), tier, loc: String(r.location || r.loc || 'Neutral site'), confs: Array.isArray(r.conferences) ? r.conferences.map(String) : [], m: month - 1, nth: wk, dow, days: Math.round(num(r.days, 1, 3) ?? 1), ...(month <= 6 ? { yearOffset: 1 } : {}) };
}

// text (JSON league file) -> { pack, errors, warnings, summary }. pack is the cleaned league (null when there are errors).
export function parseLeague(text) {
  const errs = [], warns = [];
  let raw; try { raw = JSON.parse(text); } catch (e) { return { pack: null, errors: ['Not valid JSON: ' + e.message], warnings: [] }; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.teams)) return { pack: null, errors: ['The file needs a "teams" list (download the template to see the format).'], warnings: [] };
  const teams = [], ids = new Set();
  raw.teams.forEach((t, i) => {
    const name = String((t && t.name) || '').trim(), conf = String((t && (t.conference || t.conf)) || '').trim();
    if (!name) return errs.push(`Team #${i + 1}: missing name`);
    if (!conf) return errs.push(`${name}: missing conference`);
    const id = schoolId(name); if (!id) return errs.push(`${name}: the name needs letters or digits`);
    if (ids.has(id)) return errs.push(`${name}: duplicate team name`);
    ids.add(id);
    const region = REGIONS.includes(t.region) ? t.region : regionOf(name);
    if (t.region && !REGIONS.includes(t.region)) warns.push(`${name}: region "${t.region}" unknown (use ${REGIONS.join(', ')}), using ${region}`);
    const out = { name, conference: conf, prestige: Math.round(num(t.prestige, 1, 100) ?? 50), region, academics: Math.round(num(t.academics, 1, 20) ?? acadOf(name)), state: String(t.state || STATE_OF[name] || '').slice(0, 2).toUpperCase() };
    if (Array.isArray(t.roster) && t.roster.length) out.roster = cleanRoster(t.roster, name, errs, warns);
    teams.push(out);
  });
  if (teams.length < MIN_TEAMS) errs.push(`A league needs at least ${MIN_TEAMS} teams (it has ${teams.length}).`);
  if (teams.length > MAX_TEAMS) errs.push(`At most ${MAX_TEAMS} teams (it has ${teams.length}).`);
  const used = [...new Set(teams.map(t => t.conference))];
  const confs = [];
  for (const c of Array.isArray(raw.conferences) ? raw.conferences : []) {
    const name = String((c && c.name) || c || '').trim(); if (!name || confs.some(x => x.name === name)) continue;
    if (!used.includes(name)) { warns.push(`Conference "${name}" has no teams (ignored)`); continue; }
    const bids = c && c.bids != null ? num(c.bids, 0, 10) : null;
    confs.push({ name, ...(bids != null ? { bids: Math.round(bids) } : {}) });
  }
  for (const c of used) if (!confs.some(x => x.name === c)) confs.push({ name: c });
  for (const c of confs) {
    const n = teams.filter(t => t.conference === c.name).length;
    if (!isIndependent(c.name) && n < 2) warns.push(`${c.name} has only 1 team: no conference tournament (at-large NCAA bids only)`);
    if (c.bids == null && !isIndependent(c.name) && n >= 2) c.bids = CONF_BIDS[c.name] ?? Math.max(1, Math.min(8, Math.round(n / 4)));
  }
  const autos = confs.filter(c => !isIndependent(c.name) && teams.filter(t => t.conference === c.name).length >= 2).reduce((s, c) => s + (c.bids || 0), 0);
  if (autos > 33) errs.push(`Automatic bids add up to ${autos} per weight; the NCAA field is 33.`);
  let tournaments = null;
  if (Array.isArray(raw.tournaments)) tournaments = raw.tournaments.map((r, i) => cleanRule(r, i, errs, warns)).filter(Boolean);
  for (const r of tournaments || []) for (const c of r.confs) if (!used.includes(c)) warns.push(`${r.name}: conference "${c}" has no teams`);
  const pack = { name: String(raw.name || 'Custom league').trim().slice(0, 60), conferences: confs, teams, ...(tournaments ? { tournaments } : {}) };
  const rostered = teams.filter(t => t.roster).length;
  const summary = `${teams.length} teams, ${confs.length} conferences, ${tournaments ? tournaments.length : 'default'} tournaments, ${rostered} custom rosters`;
  return { pack: errs.length ? null : pack, errors: errs, warnings: warns, summary };
}

// Roster CSV merged into a league (the current custom one, or a copy of the default): replaces the rosters of the teams it lists.
export function mergeRosterCsv(text, base) {
  const rows = parseCsv(text); if (!rows.length) return { pack: null, errors: ['The CSV file is empty.'], warnings: [] };
  const head = rows[0].map(h => h.trim().toLowerCase()), col = k => head.indexOf(k);
  if (col('team') < 0 || col('name') < 0 || col('weight') < 0) return { pack: null, errors: [`The first row must be the header: ${CSV_HEAD.join(',')}`], warnings: [] };
  const pack = base ? JSON.parse(JSON.stringify(base)) : parseLeague(JSON.stringify(templateLeague(true))).pack, errs = [], warns = [], byTeam = {};
  for (const r of rows.slice(1)) {
    const g = k => (col(k) >= 0 ? (r[col(k)] ?? '').trim() : '');
    const team = g('team'); if (!team) continue;
    (byTeam[team] ||= []).push({ name: g('name'), weight: g('weight'), class: g('class'), rating: g('rating'), starter: g('starter'), hometown: g('hometown') });
  }
  for (const [team, list] of Object.entries(byTeam)) {
    const t = pack.teams.find(x => x.name.toLowerCase() === team.toLowerCase());
    if (!t) { errs.push(`"${team}" is not a team in the league (add it in the league file first)`); continue; }
    t.roster = cleanRoster(list, t.name, errs, warns);
  }
  const n = Object.keys(byTeam).length;
  return { pack: errs.length ? null : pack, errors: errs, warnings: warns, summary: `${n} roster${n === 1 ? '' : 's'} replaced (${rows.length - 1} wrestlers)` };
}
// a stored league back into the file format (for download/editing); null = the default league with real rosters
export function leagueToFile(pack) {
  if (!pack) return templateLeague(true);
  return { name: pack.name, conferences: pack.conferences, teams: pack.teams, ...(pack.tournaments ? { tournaments: pack.tournaments.map(ruleOut) } : {}) };
}

// ---------- used by newGame ----------
export const leagueSchools = pack => pack.teams.map(t => ({ id: schoolId(t.name), name: t.name, conf: t.conference, prestige: t.prestige, region: t.region, acad: t.academics, state: t.state }));
// custom rosters in the realteams line format (name|weight|class|rating|S|hometown); a missing rating = the team's level
export function leagueRosters(pack) {
  const out = {};
  for (const t of pack.teams) {
    if (!t.roster || !t.roster.length) continue;
    const lvl = 9 + t.prestige / 100 * 6.5, starter = {};
    for (const wt of WEIGHTS) {   // a weight with no flagged starter: the best-rated wrestler starts
      const ws = t.roster.filter(w => w.weight === wt); if (!ws.length) continue;
      starter[wt] = ws.find(w => w.starter) || ws.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
    }
    out[t.name] = t.roster.map(w => [w.name, w.weight, CLS[w.class.toLowerCase()] || 1, (w.rating ?? (starter[w.weight] === w ? lvl : lvl - 2)).toFixed(1), starter[w.weight] === w ? 1 : 0, w.hometown || ''].join('|')).join('\n');
  }
  return out;
}
// what a career keeps (small): name, conference list with bids, tournament rules
export const careerLeague = pack => ({ name: pack.name, confs: pack.conferences.map(c => ({ ...c })), ...(pack.tournaments ? { tournaments: pack.tournaments } : {}) });
