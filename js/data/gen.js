// Wrestler generation. Real rosters can be imported later (see CLAUDE.md); until then everyone is generated.
import { ATTR_KEYS } from '../engine/bout.js';

export const WEIGHTS = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285];

export const ARCHETYPES = {
  balanced: { label: 'Balanced', mods: {} },
  leg_attacker: { label: 'Leg Attacker', mods: { tdo: 4, speed: 2, hand: 1, topc: -2, botRes: -1 } },
  scrambler: { label: 'Scrambler', mods: { speed: 3, iq: 2, flex: 2, botEsc: 2, tdd: 1, str: -2, topc: -2 } },
  rider: { label: 'Rider', mods: { topc: 4, str: 2, topt: 2, tdo: -2, speed: -2, botEsc: -1 } },
  pinner: { label: 'Pinner', mods: { topt: 5, str: 2, flex: 1, big: 1, cardio: -2, tdd: -1 } },
  grinder: { label: 'Grinder', mods: { cardio: 4, hand: 2, tdd: 2, topc: 1, big: -3, speed: -1 } },
  thrower: { label: 'Thrower', mods: { big: 5, str: 2, comp: 1, tdd: -2, cardio: -1 } },
};

export const SCHOOLS = [
  'Penn State', 'Iowa', 'Oklahoma State', 'Cornell', 'Iowa State', 'Ohio State', 'Michigan', 'Minnesota', 'Nebraska', 'Virginia Tech',
  'NC State', 'Arizona State', 'Missouri', 'Northwestern', 'Wisconsin', 'Oklahoma', 'Lehigh', 'Princeton', 'Pittsburgh', 'Stanford',
];

const FIRST = ['Jake', 'Cael', 'Tyler', 'Brandon', 'Austin', 'Mason', 'Logan', 'Connor', 'Dylan', 'Cole', 'Hunter', 'Ethan', 'Gavin', 'Landon', 'Carter', 'Brody',
  'Trey', 'Jaden', 'Colton', 'Wyatt', 'Isaiah', 'Marcus', 'Devin', 'Nolan', 'Garrett', 'Caleb', 'Tanner', 'Jordan', 'Riley', 'Zane', 'Owen', 'Kyle', 'Brock', 'Chase', 'Jesse', 'Luke'];
const LAST = ['Anderson', 'Brooks', 'Carlson', 'Dawson', 'Ellis', 'Foster', 'Garza', 'Hayes', 'Ingram', 'Jensen', 'Keller', 'Lawson', 'Mitchell', 'Novak', 'Olsen', 'Patterson',
  'Quinn', 'Reyes', 'Schmidt', 'Thompson', 'Underwood', 'Vance', 'Walker', 'Young', 'Zimmer', 'Bauer', 'Coleman', 'Dietz', 'Engel', 'Fischer', 'Grant', 'Hudson', 'Kowalski',
  'Larsen', 'Moreno', 'Nash', 'Ortega', 'Pruitt', 'Rhodes', 'Sullivan', 'Tate', 'Vogel', 'Webb', 'Yates', 'Bishop', 'Crowley', 'Decker', 'Frazier', 'Gibbons', 'Holt'];

export function randomName(rng) { return `${rng.pick(FIRST)} ${rng.pick(LAST)}`; }

// quality ~ average attribute (10 = weak, 14 = solid starter, 17+ = All-American). Returns a wrestler object.
export function generateWrestler(rng, { weight = 157, quality = 13, archetype = 'balanced', school = null, name = null, spread = 1.8 } = {}) {
  const arch = ARCHETYPES[archetype] || ARCHETYPES.balanced;
  const wi = WEIGHTS.indexOf(weight);
  const t = (wi < 0 ? 4.5 : wi - 4.5) / 4.5; // -1 (125) .. +1 (285)
  const wAdj = { speed: -2.5 * t, flex: -1.5 * t, str: 1.5 * t };
  const attrs = {};
  for (const k of ATTR_KEYS) {
    const v = quality + rng.gauss() * spread + (arch.mods[k] || 0) + (wAdj[k] || 0);
    attrs[k] = Math.max(1, Math.min(20, Math.round(v)));
  }
  return { name: name || randomName(rng), school: school || rng.pick(SCHOOLS), weight, archetype, attrs, plan: 'balanced' };
}

// Flat wrestler: every attribute = q, with optional overrides. Used by the balance harness.
export function flatWrestler(q, over = {}, name = 'Test Wrestler', weight = 157) {
  const attrs = {};
  for (const k of ATTR_KEYS) attrs[k] = q;
  return { name, school: 'Test', weight, archetype: 'balanced', attrs: { ...attrs, ...over }, plan: 'balanced' };
}
