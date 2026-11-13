// Bout viewer mat: the colour and centre logo of the mat a bout is wrestled on (drawn by stage() in js/ui/anim.js).
// Duals at a school: the host's colour + logo. Conference tournaments / NCAAs: the organisation's mat (logos from tools/fetch_orglogos.py
// in assets/logos/org/, text badge where there is none). Opens, majors and the national duals: the neutral green mat, no logo.
// venue = { mat: base colour (dark), line: circle colour, logo: image url | null, text: badge text | null }
import { LOGOS_ENABLED, LOGO_IDS } from './logos.js';
import { TEAM_COLORS } from './teamcolors.js';

export const NEUTRAL_MAT = { mat: '#1c3b2c', line: '#2c5a43', logo: null, text: null };
// mat/line colours chosen to suit each logo
const ORG = {
  ncaa:      { logo: 'ncaa',    text: 'NCAA',    mat: '#0f3150', line: '#2fa6e0' },
  'Big Ten': { logo: 'big-ten', text: 'BIG TEN', mat: '#11263c', line: '#2b8ad0' },
  'Big 12':  { logo: 'big-12',  text: 'BIG 12',  mat: '#202429', line: '#c8323c' },
  ACC:       { logo: 'acc',     text: 'ACC',     mat: '#0e1d45', line: '#3a64d8' },
  MAC:       { logo: 'mac',     text: 'MAC',     mat: '#0d2140', line: '#1fa75a' },
  EIWA:      { logo: null,      text: 'EIWA',    mat: '#14213d', line: '#d4a73a' },
};
const dark = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');

// host school (team id = school id): mat = its colour darkened (its own wrestler's singlet stays readable on it), circles in the full colour
export function teamVenue(id, name = '') {
  const c = TEAM_COLORS[id]; if (!c) return NEUTRAL_MAT;
  const logo = LOGOS_ENABLED && LOGO_IDS.has(id) ? `assets/logos/${id}.png` : null;
  const text = logo ? null : name.replace(/[^A-Za-z& ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || null;
  return { mat: dark(c, 0.36), line: c, logo, text };
}
// tournament spec (G.tournaments entry) -> venue
export function tourneyVenue(t) {
  const o = !t ? null : t.kind === 'ncaa' ? ORG.ncaa : t.kind === 'conf' ? ORG[t.conf] : null;
  if (!o) return NEUTRAL_MAT;
  return { mat: o.mat, line: o.line, logo: LOGOS_ENABLED && o.logo ? `assets/logos/org/${o.logo}.png` : null, text: LOGOS_ENABLED && o.logo ? null : o.text };
}
