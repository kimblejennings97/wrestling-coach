// Balance harness: runs thousands of bouts and reports distributions. Open harness.html (add ?auto to run on load).
import { simulateBout, ATTR_KEYS, ATTR_LABELS } from './engine/bout.js';
import { flatWrestler } from './data/gen.js';
import { makeRng } from './engine/rng.js';

function batch(mkA, mkB, n, seed0 = 1) {
  const r = { tdPts: 0, escPts: 0, nfPts: 0, decScore: 0, decN: 0, falls: 0, n, winsA: 0, methods: {}, pts: 0, sec: 0, tdPer: 0, shotsPer: 0, nfPer: 0, escPer: 0, revPer: 0, ot: 0, scoreSum: 0 };
  for (let i = 0; i < n; i++) {
    const a = mkA(), b = mkB();
    const res = simulateBout(a, b, { seed: seed0 + i * 7919 });
    if (res.winner === 'A') r.winsA++;
    r.methods[res.method] = (r.methods[res.method] || 0) + 1;
    r.sec += res.elapsed;
    r.scoreSum += res.score.A + res.score.B;
    for (const s of ['A', 'B']) {
      const st = res.stats[s];
      r.tdPer += st.takedowns; r.shotsPer += st.shots; r.nfPer += st.nfPoints; r.escPer += st.escapes; r.revPer += st.reversals;
    }
    r.tdPts += (res.stats.A.takedowns + res.stats.B.takedowns) * 3; r.escPts += res.stats.A.escapes + res.stats.B.escapes + 2 * (res.stats.A.reversals + res.stats.B.reversals);
    r.nfPts += res.stats.A.nfPoints + res.stats.B.nfPoints;
    if (res.method === 'Decision' || res.method === 'Major Decision') { r.decScore += res.score.A + res.score.B; r.decN++; }
    if (['Sudden Victory', 'Tiebreaker', 'Ultimate Tiebreaker'].includes(res.method)) r.ot++;
  }
  return r;
}
const pct = (x, n) => (100 * x / n).toFixed(1) + '%';
const f1 = x => x.toFixed(1);

export function runAll(N = 3000, quick = false) {
  const out = [];
  const ln = s => out.push(s);
  ln('=== 1. MIRROR MATCHES (all 14 attributes equal) ===');
  ln('Targets (D1 reality, roughly): Decision ~50-55%, Major ~20%, Tech Fall ~7-10%, Fall ~8-10%, OT ~5-8%, ~2 TD/wrestler, ~7 pts/bout combined (excl. pins).');
  for (const q of [8, 12, 16]) {
    const r = batch(() => flatWrestler(q), () => flatWrestler(q), N);
    const m = r.methods;
    const mm = k => pct(m[k] || 0, N);
    ln(`q=${q}: Dec ${mm('Decision')} | MD ${mm('Major Decision')} | TF ${mm('Tech Fall')} | Fall ${mm('Fall')} | OT ${pct(r.ot, N)} | A wins ${pct(r.winsA, N)}`);
    ln(`      avg time ${f1(r.sec / N / 60)}m | TD/wrestler ${f1(r.tdPer / N / 2)} | shots/wrestler ${f1(r.shotsPer / N / 2)} | esc/wr ${f1(r.escPer / N / 2)} | rev/wr ${f1(r.revPer / N / 2)} | NF pts/wr ${f1(r.nfPer / N / 2)} | total score ${f1(r.scoreSum / N)} | dec/MD combined ${f1(r.decScore / Math.max(1, r.decN))}`);
    const tot = r.tdPts + r.escPts + r.nfPts;
    ln(`      point shares: takedown ${pct(r.tdPts, tot)} (target ~59%) | takedown+escape/reversal ${pct(r.tdPts + r.escPts, tot)} (target ~83%) | near-fall ${pct(r.nfPts, tot)}`);
  }
  if (quick) return out.join('\n');

  ln('\n=== 2. WIN RATE BY OVERALL RATING GAP (A = 12 + gap vs B = 12) ===');
  for (const gap of [0, 1, 2, 3, 4, 6, 8]) {
    const r = batch(() => flatWrestler(12 + gap), () => flatWrestler(12), N);
    ln(`gap +${gap}: A wins ${pct(r.winsA, N)} | A pins/TF/MD/Dec (any winner): Fall ${pct(r.methods['Fall'] || 0, N)} TF ${pct(r.methods['Tech Fall'] || 0, N)} MD ${pct(r.methods['Major Decision'] || 0, N)}`);
  }

  ln('\n=== 3. SINGLE-ATTRIBUTE SENSITIVITY (A has +5 in one attribute, base 12, vs flat 12) ===');
  const rows = [];
  for (const k of ATTR_KEYS) {
    const r = batch(() => flatWrestler(12, { [k]: 17 }), () => flatWrestler(12), N, 99);
    rows.push([k, r.winsA / N]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  for (const [k, w] of rows) ln(`${ATTR_LABELS[k].padEnd(20)} +5 -> A wins ${(100 * w).toFixed(1)}%`);

  ln('\n=== 4. CARDIO FATIGUE (A cardio 20 vs B cardio 6, everything else 12) ===');
  const r4 = batch(() => flatWrestler(12, { cardio: 20 }), () => flatWrestler(12, { cardio: 6 }), N, 5);
  ln(`A wins ${pct(r4.winsA, N)}`);
  const sample = simulateBout(flatWrestler(12, { cardio: 20 }), flatWrestler(12, { cardio: 6 }), { seed: 4 });
  ln(`sample end-of-bout energy: cardio20 ${sample.stats.A.energy.toFixed(0)} / cardio6 ${sample.stats.B.energy.toFixed(0)} (after ${(sample.elapsed / 60).toFixed(1)} min)`);
  const long = [0, 0]; let c = 0;
  for (let i = 0; i < 300; i++) { const s = simulateBout(flatWrestler(12, { cardio: 20 }), flatWrestler(12, { cardio: 6 }), { seed: 1000 + i }); if (s.elapsed > 400) { long[0] += s.stats.A.energy; long[1] += s.stats.B.energy; c++; } }
  if (c) ln(`avg energy in full-length bouts: cardio20 ${(long[0] / c).toFixed(0)} / cardio6 ${(long[1] / c).toFixed(0)}`);

  ln('\n=== 5. GAME PLAN (balanced vs aggressive vs conservative, equal 12s) ===');
  for (const [pa, pb] of [['aggressive', 'balanced'], ['conservative', 'balanced'], ['aggressive', 'conservative']]) {
    const r = batch(() => ({ ...flatWrestler(12), plan: pa }), () => ({ ...flatWrestler(12), plan: pb }), N, 17);
    ln(`${pa} vs ${pb}: ${pa} wins ${pct(r.winsA, N)}, avg total score ${f1(r.scoreSum / N)}, falls ${pct(r.methods['Fall'] || 0, N)}`);
  }
  return out.join('\n');
}

if (typeof document !== 'undefined') {
  const pre = document.getElementById('out');
  const btn = document.getElementById('run');
  const go = () => { pre.textContent = 'Running...'; setTimeout(() => { pre.textContent = runAll(+document.getElementById('n').value || 3000, location.search.includes('quick')); document.title = 'DONE'; }, 20); };
  btn.onclick = go;
  if (location.search.includes('auto')) go();
}
