// Player editor (2026-11-12): hand-tuned ratings for real wrestlers, kept in THIS browser (localStorage) and applied only when a new career
// is created (core.newGame opts.edits -> applyRealTeams). Saved careers carry their own wrestlers, so they are never changed.
// An edit = { ovr?, set?: {attr: value}, pot? } — the same shape as REAL_OVERRIDES (data/overrides.js), which it replaces for that name.
import { REAL_TEAMS } from '../data/realteams.js';
import { REAL_OVERRIDES } from '../data/overrides.js';
import { ncaaFloor } from '../data/ncaa2026.js';
import { makeRng } from '../engine/rng.js';
import { rateReal, overall } from './core.js';

const KEY = 'wc.playerEdits';
export function loadEdits() { try { const e = JSON.parse(localStorage.getItem(KEY) || '{}'); return e && typeof e === 'object' ? e : {}; } catch (e) { return {}; } }
export function saveEdits(e) { try { localStorage.setItem(KEY, JSON.stringify(e)); return true; } catch (er) { return false; } }

let LIST = null;
// every real wrestler in the roster data: { name, school, wt, cls, base (data rating), starter }
export function realList() {
  if (LIST) return LIST;
  LIST = [];
  for (const [school, raw] of Object.entries(REAL_TEAMS)) for (const line of raw.split('\n')) {
    const [name, wtS, clsS, ovrS, stS] = line.split('|'); if (!name) continue;
    LIST.push({ name, school, wt: +wtS, cls: +clsS, base: Math.max(+ovrS, ncaaFloor(name, +wtS)), raw: +ovrS, starter: stS === '1' });
  }
  return LIST;
}
// the rating in force for a name: your edit, else the built-in override, else none (rated from the data)
export const effective = (name, edits) => edits[name] || REAL_OVERRIDES[name] || null;
export const builtIn = name => REAL_OVERRIDES[name] || null;
const hash = s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
// one sample of what a new career would give him (unpinned attributes vary a little between careers; pinned ones are exact)
export function preview(p, ov) {
  const { w } = rateReal(makeRng(hash(p.name)), { name: p.name, wt: p.wt, base: p.raw, school: p.school, ov });
  return { attrs: w.attrs, ovr: overall(w) };
}
