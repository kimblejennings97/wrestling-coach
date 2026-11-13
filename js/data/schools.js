// D1 wrestling programs: [name, prestige 1-100], in a FIXED order (newGame generates rosters in this order: reordering changes every career's seed).
// Prestige is APPROXIMATE. To share the game later, replace this file's names with fictional ones; nothing else references real names.
const LIST = [['Penn State', 98], ['Iowa', 95], ['Ohio State', 90], ['Nebraska', 85], ['Minnesota', 82], ['Michigan', 78], ['Illinois', 70], ['Rutgers', 68],
  ['Northwestern', 65], ['Wisconsin', 62], ['Michigan State', 60], ['Purdue', 58], ['Indiana', 55], ['Maryland', 52],
  ['Oklahoma State', 92], ['Iowa State', 84], ['Arizona State', 80], ['Missouri', 76], ['Oklahoma', 66], ['Northern Iowa', 66], ['North Dakota State', 64],
  ['Cal Poly', 60], ['South Dakota State', 58], ['Northern Colorado', 56], ['West Virginia', 55], ['Utah Valley', 54], ['Wyoming', 50], ['Air Force', 45], ['CSU Bakersfield', 40],
  ['NC State', 90], ['Virginia Tech', 86], ['Pittsburgh', 74], ['North Carolina', 60], ['Stanford', 58], ['Virginia', 50], ['Duke', 40],
  ['Cornell', 88], ['Lehigh', 80], ['Princeton', 76], ['Penn', 66], ['Binghamton', 62], ['Army', 60], ['Navy', 56], ['Harvard', 52], ['Lock Haven', 52],
  ['Bucknell', 48], ['Brown', 46], ['Columbia', 44], ['American', 40], ['Hofstra', 38], ['Drexel', 38], ['Franklin & Marshall', 36], ['Sacred Heart', 34],
  ['Edinboro', 40], ['George Mason', 38], ['Clarion', 36], ['Bloomsburg', 34], ['Mercyhurst', 32], ['LIU', 30], ['Morgan State', 30],
  ['Central Michigan', 56], ['Rider', 52], ['Ohio', 52], ['Buffalo', 50], ['Kent State', 48], ['Northern Illinois', 46],
  ['Oregon State', 66], ['Little Rock', 52], ['SIU Edwardsville', 48], ['Campbell', 44], ['Gardner-Webb', 42], ['Appalachian State', 40], ['Chattanooga', 38], ['VMI', 36], ['The Citadel', 34], ['Bellarmine', 32], ['Davidson', 32], ['Presbyterian', 30]];

// Wrestling conference alignment for 2026-27, from the "Conference" column of Wikipedia's "List of NCAA Division I men's wrestling programs"
// (checked 2026-11-13). Mercyhurst is still transitioning to D1 (no wrestling conference): Independent = no conference tournament,
// its wrestlers can only reach the NCAAs with an at-large bid. Saved careers on the default league realign at their next offseason (core.js realign).
const ALIGN = {
  'Big Ten': ['Penn State', 'Iowa', 'Ohio State', 'Nebraska', 'Minnesota', 'Michigan', 'Illinois', 'Rutgers', 'Northwestern', 'Wisconsin', 'Michigan State', 'Purdue', 'Indiana', 'Maryland'],
  'Big 12': ['Oklahoma State', 'Iowa State', 'Arizona State', 'Missouri', 'Oklahoma', 'Northern Iowa', 'West Virginia', 'Utah Valley', 'Wyoming'],
  'ACC': ['NC State', 'Virginia Tech', 'Pittsburgh', 'North Carolina', 'Stanford', 'Virginia', 'Duke'],
  'EIWA': ['Lehigh', 'Binghamton', 'Army', 'Navy', 'Bucknell', 'American', 'Hofstra', 'Drexel', 'Franklin & Marshall', 'Sacred Heart', 'LIU', 'Morgan State'],
  'Ivy League': ['Cornell', 'Princeton', 'Penn', 'Harvard', 'Brown', 'Columbia'],
  'MAC': ['Central Michigan', 'Rider', 'Ohio', 'Buffalo', 'Kent State', 'Lock Haven', 'Bloomsburg', 'Clarion', 'Edinboro', 'George Mason', 'SIU Edwardsville'],
  'Pac-12': ['Oregon State', 'Cal Poly', 'CSU Bakersfield', 'North Dakota State', 'South Dakota State', 'Northern Colorado', 'Northern Illinois', 'Air Force', 'Little Rock'],
  'SoCon': ['Campbell', 'Gardner-Webb', 'Appalachian State', 'Chattanooga', 'VMI', 'The Citadel', 'Bellarmine', 'Davidson', 'Presbyterian'],
  'Independent': ['Mercyhurst'],
};
const confOf = n => Object.keys(ALIGN).find(c => ALIGN[c].includes(n)) || 'Independent';

// Region (recruits prefer home region) and academics 1-20 (APPROXIMATE, for recruiting decisions).
import { STATE_OF } from './states.js';
const REGION_OF = {
  East: ['Penn State', 'Rutgers', 'Maryland', 'Pittsburgh', 'Virginia Tech', 'Virginia', 'Cornell', 'Lehigh', 'Princeton', 'Penn', 'Binghamton', 'Army', 'Navy', 'Harvard', 'Lock Haven', 'Bucknell', 'Brown', 'Columbia', 'American', 'Hofstra', 'Drexel', 'Franklin & Marshall', 'Sacred Heart', 'Rider', 'West Virginia', 'Buffalo', 'Edinboro', 'George Mason', 'Clarion', 'Bloomsburg', 'Mercyhurst', 'LIU', 'Morgan State'],
  South: ['NC State', 'North Carolina', 'Duke', 'Campbell', 'Gardner-Webb', 'Appalachian State', 'Chattanooga', 'Little Rock', 'VMI', 'The Citadel', 'Bellarmine', 'Davidson', 'Presbyterian'],
  Midwest: ['Iowa', 'Ohio State', 'Michigan', 'Michigan State', 'Minnesota', 'Wisconsin', 'Illinois', 'Indiana', 'Purdue', 'Northwestern', 'Central Michigan', 'Ohio', 'Kent State', 'Northern Illinois', 'SIU Edwardsville', 'Iowa State', 'Northern Iowa'],
  Plains: ['Nebraska', 'Oklahoma', 'Oklahoma State', 'Missouri', 'North Dakota State', 'South Dakota State', 'Wyoming', 'Northern Colorado', 'Air Force'],
  West: ['Arizona State', 'Cal Poly', 'Stanford', 'Utah Valley', 'Oregon State', 'CSU Bakersfield'],
};
const ACAD_OF = { 18: ['Cornell', 'Princeton', 'Penn', 'Harvard', 'Columbia', 'Brown', 'Stanford', 'Duke', 'Northwestern', 'Navy', 'Army'],
  16: ['Virginia', 'North Carolina', 'Michigan', 'Air Force', 'Lehigh', 'Bucknell'],
  14: ['Pittsburgh', 'Wisconsin', 'Minnesota', 'Illinois', 'Maryland', 'Rutgers', 'Penn State', 'Purdue', 'Ohio State', 'Binghamton', 'Virginia Tech', 'NC State', 'American', 'Hofstra', 'Drexel', 'Franklin & Marshall'] };
export const REGIONS = Object.keys(REGION_OF);
const regionOf = n => Object.keys(REGION_OF).find(r => REGION_OF[r].includes(n)) || 'Midwest';
const acadOf = n => +(Object.keys(ACAD_OF).find(k => ACAD_OF[k].includes(n)) || 11);

export const schoolId = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const SCHOOLS = LIST.map(([name, prestige]) => ({ id: schoolId(name), name, conf: confOf(name), prestige, region: regionOf(name), acad: acadOf(name), state: STATE_OF[name] || '' }));
export const CONFERENCES = Object.keys(ALIGN);
export { regionOf, acadOf };

// A conference holds a championship tournament (and so earns automatic NCAA bids) when it has 2+ teams and is not an Independent group.
export const isIndependent = c => /^independent/i.test(c || '');
// Conferences of a career, in display order: the league's own list (custom leagues), else the default order, then any others its teams use.
export function confsOf(G) {
  const base = (G.league && G.league.confs ? G.league.confs.map(c => c.name) : CONFERENCES), have = new Set(Object.values(G.teams).map(t => t.conf));
  const out = base.filter(c => have.has(c));
  for (const t of Object.values(G.teams)) if (!out.includes(t.conf)) out.push(t.conf);
  return out;
}
export const tourneyConfs = G => confsOf(G).filter(c => !isIndependent(c) && Object.values(G.teams).filter(t => t.conf === c).length >= 2);
