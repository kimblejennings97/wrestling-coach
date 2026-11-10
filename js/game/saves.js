// Multiple save slots. Games live in IndexedDB (a full save is ~1.2MB, localStorage's ~5MB would fit only a few).
// Index (metadata list) is cached in memory after `await initSaves()`. The ACTIVE game is also mirrored to the legacy localStorage key
// so Match Lab (which reads core.loadGame) keeps working. Old single saves are imported into a slot on first run.
import { hydrate, loadGame as legacyLoad } from './core.js';

const DB = 'wrestlingCoach', STORE = 'saves', LEGACY_KEY = 'wrestlingCoach.save.v1', ACTIVE_KEY = 'wrestlingCoach.active';
let db = null, index = [], writing = Promise.resolve();
export const MAX_SLOTS = 30;

const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = (mode, fn) => new Promise((res, rej) => { const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
const idbPut = (k, v) => tx('readwrite', s => s.put(v, k));
const idbGet = k => tx('readonly', s => s.get(k));
const idbDel = k => tx('readwrite', s => s.delete(k));
const queue = fn => (writing = writing.then(fn).catch(e => console.warn('save failed', e)));
const meta = G => ({ id: G.slot, name: G.slotName || `${G.coach} · ${G.teams[G.userTeam].name}`, school: G.userTeam, season: G.season, week: G.week, phase: G.phase, ts: Date.now() });
const saveIndex = () => queue(() => idbPut('index', index));

export async function initSaves() {
  try { db = await open(); index = (await idbGet('index')) || []; } catch (e) { db = null; index = []; }
  if (db && !index.length) {   // import the old single-slot save
    try { const g = legacyLoad(); if (g) { g.slot = 's' + Date.now().toString(36); index.push(meta(g)); await idbPut(g.slot, JSON.stringify(g)); await idbPut('index', index); } } catch (e) { /* ignore */ }
  }
  return index;
}
export const listSaves = () => [...index].sort((a, b) => b.ts - a.ts);
export const activeSlot = () => { try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; } };
const setActive = id => { try { id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ } };

// Auto-load the most recently used slot at startup (null if none).
export async function loadLast() {
  const id = activeSlot(), m = index.find(x => x.id === id) || listSaves()[0];
  return m ? loadSlot(m.id).catch(() => null) : null;
}
export async function loadSlot(id) {
  const s = await idbGet(id); if (!s) return null;
  const G = hydrate(JSON.parse(s)); G.slot = id; setActive(id); mirror(s); return G;
}
function mirror(json) { try { localStorage.setItem(LEGACY_KEY, json); } catch (e) { /* too big or blocked: Match Lab just falls back to a fresh league */ } }

// Save the game into its slot (a new career gets a new slot, so it never overwrites another).
export function saveGame(G) {
  if (!db) { try { localStorage.setItem(LEGACY_KEY, JSON.stringify(G)); return true; } catch (e) { return false; } }
  if (!G.slot) G.slot = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const m = meta(G), i = index.findIndex(x => x.id === G.slot);
  if (i >= 0) index[i] = m; else index.push(m);
  const json = JSON.stringify(G); setActive(G.slot); mirror(json);
  const slot = G.slot; queue(() => idbPut(slot, json)); saveIndex();
  return true;
}
// Copy the current game into a new slot and continue playing the copy ("Save as").
export function saveAs(G, name) {
  if (index.length >= MAX_SLOTS) return false;
  G.slot = null; G.slotName = name || `${G.coach} · ${G.teams[G.userTeam].name} (copy)`; return saveGame(G);
}
export async function copySlot(id) {
  if (index.length >= MAX_SLOTS) return false;
  const s = await idbGet(id), m = index.find(x => x.id === id); if (!s || !m) return false;
  const g = JSON.parse(s); g.slot = 's' + Date.now().toString(36) + 'c'; g.slotName = m.name + ' (copy)';
  index.push({ ...m, id: g.slot, name: g.slotName, ts: Date.now() }); queue(() => idbPut(g.slot, JSON.stringify(g))); saveIndex(); return true;
}
export function renameSlot(id, name) { const m = index.find(x => x.id === id); if (!m) return; m.name = name; saveIndex(); idbGet(id).then(s => { if (!s) return; const g = JSON.parse(s); g.slotName = name; queue(() => idbPut(id, JSON.stringify(g))); }); }
export function deleteSlot(id) {
  index = index.filter(x => x.id !== id); saveIndex(); queue(() => idbDel(id));
  if (activeSlot() === id) { setActive(null); try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ } }
}
export const flushSaves = () => writing;
