// Hand-set ratings for real wrestlers the WrestleStat-based mapping rates badly (e.g. true freshmen with no college Elo).
// Applied in applyRealTeams (core.js) after the usual rating: `ovr` = target overall (displayed OVR), `set` = attributes pinned to exact values,
// every other attribute is nudged until the overall hits the target. Keys are the roster name.
export const REAL_OVERRIDES = {
  'Bo Bassett': { ovr: 19.0, set: { tdo: 20, speed: 20 } },   // Virginia Tech 141, freshman: elite from day one (user request 2026-11-11)
};
