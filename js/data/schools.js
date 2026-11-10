// D1 wrestling programs: [name, conference, prestige 1-100]. Real school names for personal use.
// Conference alignment and prestige are APPROXIMATE (conference realignment changes yearly) — edit freely.
// To share the game later, replace this file's names with fictional ones; nothing else references real names.
const RAW = {
  'Big Ten': [['Penn State', 98], ['Iowa', 95], ['Ohio State', 90], ['Nebraska', 85], ['Minnesota', 82], ['Michigan', 78], ['Illinois', 70], ['Rutgers', 68],
    ['Northwestern', 65], ['Wisconsin', 62], ['Michigan State', 60], ['Purdue', 58], ['Indiana', 55], ['Maryland', 52]],
  'Big 12': [['Oklahoma State', 92], ['Iowa State', 84], ['Arizona State', 80], ['Missouri', 76], ['Oklahoma', 66], ['Northern Iowa', 66], ['North Dakota State', 64],
    ['Cal Poly', 60], ['South Dakota State', 58], ['Northern Colorado', 56], ['West Virginia', 55], ['Utah Valley', 54], ['Wyoming', 50], ['Air Force', 45], ['CSU Bakersfield', 40]],
  'ACC': [['NC State', 90], ['Virginia Tech', 86], ['Pittsburgh', 74], ['North Carolina', 60], ['Stanford', 58], ['Virginia', 50], ['Duke', 40]],
  'EIWA': [['Cornell', 88], ['Lehigh', 80], ['Princeton', 76], ['Penn', 66], ['Binghamton', 62], ['Army', 60], ['Navy', 56], ['Harvard', 52], ['Lock Haven', 52],
    ['Bucknell', 48], ['Brown', 46], ['Columbia', 44], ['American', 40], ['Hofstra', 38], ['Drexel', 38], ['Franklin & Marshall', 36], ['Sacred Heart', 34],
    ['Edinboro', 40], ['George Mason', 38], ['Clarion', 36], ['Bloomsburg', 34], ['Mercyhurst', 32], ['LIU', 30], ['Morgan State', 30]],
  'MAC': [['Central Michigan', 56], ['Rider', 52], ['Ohio', 52], ['Buffalo', 50], ['Kent State', 48], ['Northern Illinois', 46], ],
  'Independent / Other': [['Oregon State', 66], ['Little Rock', 52], ['SIU Edwardsville', 48], ['Campbell', 44], ['Gardner-Webb', 42], ['Appalachian State', 40], ['Chattanooga', 38], ['VMI', 36], ['The Citadel', 34], ['Bellarmine', 32], ['Davidson', 32], ['Presbyterian', 30]],
};

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

export const SCHOOLS = [];
for (const [conf, list] of Object.entries(RAW)) {
  for (const [name, prestige] of list) {
    SCHOOLS.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, conf, prestige, region: regionOf(name), acad: acadOf(name), state: STATE_OF[name] || '' });
  }
}
export const CONFERENCES = Object.keys(RAW);
