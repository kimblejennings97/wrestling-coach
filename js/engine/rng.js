// Seedable RNG (mulberry32) so any bout can be replayed exactly from its seed.
export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.chance = p => f() < p;
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.gauss = () => (f() + f() + f() + f() - 2) * 1.7; // approx N(0,1)
  f.weighted = (items, weightFn) => {
    const ws = items.map(weightFn);
    let r = f() * ws.reduce((s, w) => s + w, 0);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  };
  return f;
}
