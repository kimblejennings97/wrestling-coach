// Hand-set ratings for real wrestlers the WrestleStat-based mapping rates badly (e.g. true freshmen with no college Elo).
// Applied in applyRealTeams (core.js) after the usual rating: `ovr` = target overall (displayed OVR), `set` = attributes pinned to exact values,
// every other attribute is nudged until the overall hits the target. Keys are the roster name.
export const REAL_OVERRIDES = {
  'Bo Bassett': { ovr: 19.0, set: { tdo: 20, speed: 20 } },   // Virginia Tech 141, freshman: elite from day one (user request 2026-11-11)
  // Penn State 133: freestyle World Champion with no folkstyle background (user request 2026-11-14): elite on the feet, below average in the
  // folkstyle top/bottom game (riding, escapes ~8 vs a starter average ~13); turning / bottom resistance 12 since they also drive par terre
  'Masanosuke Ono': { ovr: 18.0, pot: 19, set: { tdo: 20, tdd: 20, speed: 20, hand: 20, big: 20, str: 19, iq: 19, flex: 19, cardio: 19, comp: 19, topt: 12, botRes: 12, topc: 8, botEsc: 8 } },
};
