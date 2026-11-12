// Bout animation. Pure presentation: it only reads the tags the engine puts on each log event
// ({pos: 'neutral'|'topA'|'topB', fx: 'td'|'esc'|'rev'|'nf'|'fall'|'stuff'|'scramble'|'stall'|'ride'|'break'|null, who: 'A'|'B'|null, mv: move key|null})
// and plays a short clip of two jointed figures in team-colour singlets. Nothing here touches the simulation or the rng.
//
// How it works: a clip is a list of keyframes; a keyframe holds a pose per figure plus a camera [yaw, pitch]. A pose is the hip position, body angles
// (yaw = heading, lean = torso from vertical toward the heading, roll = about the spine) and a target for each hand and foot; arms and legs are solved
// with two-bone IK, so limb lengths never change. Poses are interpolated, sampled into N frames and shown one after the other with CSS (.fr), the last
// one looping between two or more poses (.lp). Neutral clips are seen from the side; on the mat the camera swings round so the wrestlers face down-right.
// World axes: x = right (wrestler 'a' faces +x), y = up, z = toward the viewer. Units: 1 = 3 px; a standing wrestler is ~16.5 tall.

const SKIN = '#a3a9b0', SHOE = '#565c64', INK = '#0a0e12', U = 3, GY = 74;
const T = { torso: 5.2, thigh: 3.7, shin: 3.7, uarm: 2.7, farm: 2.6, sw: 1.35, hw: 0.95 };
const D = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.sqrt(dot(a, a));
const mix = (a, b, t) => a + (b - a) * t, mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');

// ---------- skeleton ----------
const norm = P => ({ ...P, p: P.p, z: P.z || 0, yaw: P.yaw ?? (P.f === -1 ? 180 : 0), lean: P.lean || 0, roll: P.roll || 0 });
const LIMBS = ['hL', 'hR', 'fL', 'fR'], POLES = ['pL', 'pR', 'qL', 'qR'];
const DEF = { hL: { b: [-2.4, 1.4, 0] }, hR: { b: [-2.4, 1.4, 0] }, fL: { b: [-7.2, 0.5, 0] }, fR: { b: [-7.2, 0.5, 0] } };

function lerpPose(A, B, t) {
  const P = { p: [mix(A.p[0], B.p[0], t), mix(A.p[1], B.p[1], t)], z: mix(A.z, B.z, t), yaw: mix(A.yaw, B.yaw, t), lean: mix(A.lean, B.lean, t), roll: mix(A.roll, B.roll, t), vs: B.vs || A.vs, t, nb: t >= 0.5 ? B.nb : A.nb };   // nb = ankle band taken off
  for (const k of LIMBS) P[k] = [A[k] || DEF[k], B[k] || DEF[k]];
  for (const k of POLES) P[k] = [A[k] || null, B[k] || null];
  return P;
}
function core(P) {
  const yw = P.yaw * D, a = P.lean * D, ro = P.roll * D;
  const F = [Math.cos(yw), 0, Math.sin(yw)], Z = [-Math.sin(yw), 0, Math.cos(yw)];
  const u = [F[0] * Math.sin(a), Math.cos(a), F[2] * Math.sin(a)], f0 = [F[0] * Math.cos(a), -Math.sin(a), F[2] * Math.cos(a)];
  const lat = add(mul(Z, Math.cos(ro)), mul(f0, Math.sin(ro))), fr = sub(mul(f0, Math.cos(ro)), mul(Z, Math.sin(ro)));
  const hip = [P.p[0], P.p[1], P.z], neck = add(hip, mul(u, T.torso)), sh = add(hip, mul(u, T.torso - 0.6));
  return { P, F, Z, u, fr, lat, hip, neck, head: add(add(neck, mul(u, 1.9)), mul(fr, 0.45)), chest: add(hip, mul(u, 3.6)), belly: add(hip, mul(u, 1.6)),
    shL: add(sh, mul(lat, -T.sw)), shR: add(sh, mul(lat, T.sw)), hpL: add(hip, mul(lat, -T.hw)), hpR: add(hip, mul(lat, T.hw)) };
}
function target(s, me, root, all) {
  if (Array.isArray(s)) return [s[0], s[1], s[2] ?? root[2]];
  if (s.r) return add(root, add(add(mul(me.F, s.r[0]), [0, s.r[1], 0]), mul(me.Z, s.r[2] || 0)));
  if (s.b) return add(root, add(add(mul(me.u, s.b[0]), mul(me.fr, s.b[1])), mul(me.lat, s.b[2] || 0)));
  const src = s.o ? all[s.of || me.P.vs] : me, j = (src && src[s.o || s.s]) || root;
  return add(j, s.d || [0, 0, 0]);
}
function ik(a, t, l1, l2, pole) {
  let d = sub(t, a), L = len(d); const mx = l1 + l2 - 0.02;
  if (L > mx) { d = mul(d, mx / L); L = mx; }
  if (L < 0.3) { d = [0, -0.3, 0]; L = 0.3; }
  const dn = mul(d, 1 / L), x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let p = sub(pole, mul(dn, dot(pole, dn))); const pl = len(p); p = pl > 1e-3 ? mul(p, 1 / pl) : [0, 0, 1];
  return [add(add(a, mul(dn, x)), mul(p, h)), add(a, d), p];
}
function limb(me, all, key) {
  const arm = key[0] === 'h', s = key[1], root = me[(arm ? 'sh' : 'hp') + s], [s1, s2] = me.P[key], t = me.P.t;
  const tg = mix3(target(s1, me, root, all), target(s2, me, root, all), t);
  const dp = arm ? add(mul(me.fr, -1), [0, -0.4, 0]) : me.fr, [p1, p2] = me.P[(arm ? 'p' : 'q') + s];
  const pole = mix3(p1 || dp, p2 || dp, t);
  const [mid, end, pp] = arm ? ik(root, tg, T.uarm, T.farm, pole) : ik(root, tg, T.thigh, T.shin, pole);
  if (arm) { me['el' + s] = mid; me['ha' + s] = end; } else { me['kn' + s] = mid; me['ft' + s] = end; me['toe' + s] = add(end, mul(pp, 1.3)); }
}
function solve(figs) {   // figs: {name: interpolated pose} -> {name: joints}
  const all = {}, names = Object.keys(figs);
  for (const n of names) { all[n] = core(figs[n]); if (!all[n].P.vs) all[n].P.vs = names.find(x => x !== n); }
  for (let pass = 0; pass < 2; pass++) for (const n of names) { limb(all[n], all, 'fL'); limb(all[n], all, 'fR'); }
  for (let pass = 0; pass < 2; pass++) for (const n of names) { limb(all[n], all, 'hL'); limb(all[n], all, 'hR'); }
  return all;
}

// ---------- drawing ----------
export const HEADGEAR = true;   // ear guards + strap on both wrestlers
// prop = { p: [x, y, z], c: colour, rot } : a thrown ankle band (title celebration)
function drawFrame(all, cam, cols, prop) {
  const th = cam[0] * D, ph = cam[1] * D, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
  const pr = v => { const d = -v[0] * st + v[2] * ct; return [(v[0] * ct + v[2] * st) * U, (-v[1] * cp + d * sp) * U, d * cp + v[1] * sp]; };
  const n1 = x => Math.round(x * 10) / 10;
  const parts = [];
  const seg = (a, b, w, c, bias = 0) => { const A = pr(a), B = pr(b); parts.push({ d: (A[2] + B[2]) / 2 + bias + fb, w, c, s: `M${n1(A[0])} ${n1(A[1])}L${n1(B[0])} ${n1(B[1])}` }); };
  let fb = 0;
  for (const n in all) {
    fb = n === 'a' ? 0.7 : 0;   // when the two are level in depth the clip's main figure is drawn in front
    const J = all[n], c = cols[n], ref = n === 'r', far = s => dot(J.lat, [-st, 0, ct]) * (s === 'R' ? 1 : -1) < -0.15;
    const sk = s => far(s) ? shade(SKIN, 0.8) : SKIN, sc = s => far(s) ? shade(c, 0.78) : c;
    seg(J.hip, J.neck, 8, c);
    if (ref) for (const k of [-0.8, 0.8]) seg(add(J.hip, mul(J.lat, k)), add(J.neck, mul(J.lat, k)), 1.3, '#e8e8e8', 0.05);
    seg(J.shL, J.shR, 5, c, -0.02); seg(J.hpL, J.hpR, 5.4, ref ? '#30343a' : c, -0.02);
    for (const s of ['L', 'R']) {
      seg(J['hp' + s], J['kn' + s], 4.6, ref ? '#30343a' : sk(s)); seg(J['hp' + s], mix3(J['hp' + s], J['kn' + s], 0.5), 5, ref ? '#30343a' : sc(s), 0.01); seg(J['kn' + s], J['ft' + s], 3.8, ref ? '#30343a' : sk(s)); seg(J['ft' + s], J['toe' + s], 3.6, far(s) ? shade(SHOE, 0.8) : SHOE, 0.02);
      seg(J['sh' + s], J['el' + s], 3.6, sk(s)); seg(J['el' + s], J['ha' + s], 3.2, sk(s));
    }
    // ankle band (red or green) on the left ankle, unless he has taken it off
    if (!ref && cols.band && cols.band[n] && !J.P.nb) {   // sorted just above its own shin (a shorter segment's average depth would slip under it)
      const k0 = parts.length, sd = (pr(J.knL)[2] + pr(J.ftL)[2]) / 2;
      seg(mix3(J.knL, J.ftL, 0.79), mix3(J.knL, J.ftL, 0.9), 4.3, cols.band[n]);
      parts[k0].d = sd + fb + 0.015;
    }
    // head: a plain grey circle
    const h = pr(J.head);
    parts.push({ d: h[2] + 0.4 + fb, raw: `<circle cx="${n1(h[0])}" cy="${n1(h[1])}" r="5.2" fill="${SKIN}" stroke="${INK}" stroke-width="1"/>` });
    if (!ref && HEADGEAR && !cols.noHg) {   // headgear: an ear guard on each side (the far one hides behind the head) and a strap over the crown
      const hg = shade(c, 0.62), E = k => pr(add(J.head, mul(J.lat, k * 1.45))), top = pr(add(J.head, mul(J.u, 1.6))), eL = E(-1), eR = E(1);
      const cx = 2 * top[0] - (eL[0] + eR[0]) / 2, cy = 2 * top[1] - (eL[1] + eR[1]) / 2;
      parts.push({ d: h[2] + 0.41 + fb, raw: `<path d="M${n1(eL[0])} ${n1(eL[1])}Q${n1(cx)} ${n1(cy)} ${n1(eR[0])} ${n1(eR[1])}" stroke="${INK}" stroke-width="3.2"/><path d="M${n1(eL[0])} ${n1(eL[1])}Q${n1(cx)} ${n1(cy)} ${n1(eR[0])} ${n1(eR[1])}" stroke="${hg}" stroke-width="1.6"/>` });
      for (const e of [eL, eR]) parts.push({ d: e[2] + 0.42 + fb, raw: `<ellipse cx="${n1(e[0])}" cy="${n1(e[1])}" rx="2.5" ry="2.9" fill="${hg}" stroke="${INK}" stroke-width="0.9"/>` });
    }
    if (!ref && HEADGEAR && cols.noHg) {   // match over: headgear off, carried in the right hand (two ear guards hanging by the strap)
      const hg = shade(c, 0.62), q = pr(J.haR), x = n1(q[0]), y = n1(q[1]);
      parts.push({ d: q[2] + 0.06 + fb, raw: `<path d="M${n1(q[0] - 2.2)} ${n1(q[1] + 2.4)}Q${x} ${n1(q[1] - 2.6)} ${n1(q[0] + 2.2)} ${n1(q[1] + 2.4)}" stroke="${INK}" stroke-width="2.6"/><path d="M${n1(q[0] - 2.2)} ${n1(q[1] + 2.4)}Q${x} ${n1(q[1] - 2.6)} ${n1(q[0] + 2.2)} ${n1(q[1] + 2.4)}" stroke="${hg}" stroke-width="1.2"/>`
        + [-2.2, 2.2].map(dx => `<ellipse cx="${n1(q[0] + dx)}" cy="${n1(q[1] + 3.6)}" rx="2" ry="2.4" fill="${hg}" stroke="${INK}" stroke-width="0.9"/>`).join('') });
      void y;
    }
  }
  if (prop) {   // the ankle band in flight / on the mat
    const q = pr(prop.p), at = `cx="${n1(q[0])}" cy="${n1(q[1])}" rx="2.6" ry="1.2" transform="rotate(${Math.round(prop.rot || 0)} ${n1(q[0])} ${n1(q[1])})"`;
    parts.push({ d: q[2] + 3, raw: `<ellipse ${at} fill="none" stroke="${INK}" stroke-width="2.6"/><ellipse ${at} fill="none" stroke="${prop.c}" stroke-width="1.3"/>` });
  }
  parts.sort((a, b) => a.d - b.d);
  return parts.map(p => p.raw || `<path d="${p.s}" stroke="${INK}" stroke-width="${p.w + 1.8}"/><path d="${p.s}" stroke="${p.c}" stroke-width="${p.w}"/>`).join('');
}

// ---------- pose library ----------
const N = [0, 16], M = [-22, 24], XA = -6.5, XO = 6.5;
const S = (x, f, k) => ({ p: [x, 6.1], f, lean: 26, fL: [x + f * 2.3, 0], fR: [x - f * 1.7, 0], hL: { r: [3.1, -1.2] }, hR: { r: [2.5, -2.4] }, ...k });      // wrestling stance
const UP = (x, f, k) => ({ p: [x, 7.25], f, lean: 3, fL: [x + f * 0.4, 0], fR: [x - f * 0.5, 0], ...k });                                                // standing tall
const RT = k => ({ p: [1.6, 4.6], z: -2.6, lean: 56, fL: [-2.2, 0.3], fR: [-1.8, 0.3], hR: { o: 'belly', d: [0.4, -1.3, 1.4] }, hL: { o: 'elL', d: [0, 0.5, 0] }, ...k });   // top man, referee's position: beside and behind, arm round the waist, hand on the elbow
const RB = k => ({ p: [4.5, 3.7], lean: 78, fL: [0.9, 0.3], fR: [1.1, 0.3], hL: [10.3, 0], hR: [10.5, 0], ...k });                                         // bottom man on his base (hands and knees)
const FT = k => ({ p: [2.5, 2.9], z: -1.6, lean: 70, fL: [-2, 0.3], fR: [-1.6, 0.3], hR: { o: 'belly', d: [0.5, -0.5, 1.2] }, hL: { o: 'shL', d: [0, 0.7, 0] }, ...k });     // top man on a flattened opponent
const FB = k => ({ p: [5, 1.25], lean: 88, fL: { b: [-7.2, 0.2, 0] }, fR: { b: [-7.2, 0.2, 0] }, hL: [11.6, 0.5], hR: [11.9, 0.5], ...k });                 // bottom man broken down flat
const SHOT = k => ({ p: [-4.4, 4.3], lean: 40, fL: [-2, 0], fR: [-6.4, 0], hL: { r: [3.2, -1.4] }, hR: { r: [3, -2.2] }, ...k });                          // level change
const INLEGS = k => ({ p: [1.8, 3.2], lean: 60, fL: [3.6, 0], fR: [-2.4, 0.3], hL: { o: 'knR', d: [0.5, 0.4, 0] }, hR: { o: 'knL', d: [0.5, 0.4, 0] }, ...k });  // in on the legs, trail knee down
const SPRAWL = (x, f, k) => ({ p: [x, 3.7], f, lean: 62, fL: [x - f * 4.2, 0.2], fR: [x - f * 4.8, 0.2], hL: { o: 'belly', d: [0, 0.8, 0] }, hR: { o: 'chest', d: [0, 0.8, 0] }, ...k });   // legs kicked back, chest on his back

const swapLR = s => typeof s === 'string' && /[LR]$/.test(s) ? s.slice(0, -1) + (s.slice(-1) === 'L' ? 'R' : 'L') : s;
const mapSpec = (s, fAbs, fD, fRel, lr) => !s ? s : Array.isArray(s) ? fAbs(s) : { ...s, ...(s.d ? { d: fD(s.d) } : {}), ...(s.r ? { r: fRel(s.r) } : {}), ...(s.b ? { b: fRel(s.b) } : {}), ...(lr && s.o ? { o: swapLR(s.o) } : {}), ...(lr && s.s ? { s: swapLR(s.s) } : {}) };
// the same pose turned half a turn about the vertical axis through the origin
function rot180(P0) {
  const P = norm(P0), Q = { ...P, f: undefined, p: [-P.p[0], P.p[1]], z: -P.z, yaw: P.yaw + 180 };
  for (const k of LIMBS) Q[k] = mapSpec(P[k], s => [-s[0], s[1], s[2] === undefined ? undefined : -s[2]], d => [-d[0], d[1], -(d[2] || 0)], r => r);
  for (const k of POLES) if (P[k]) Q[k] = [-P[k][0], P[k][1], -P[k][2]];
  return Q;
}
// the same pose mirrored front-to-back (z -> -z): left and right limbs swap
function mirZ(P0) {
  const P = norm(P0), Q = { ...P, f: undefined, z: -P.z, yaw: -P.yaw, roll: -P.roll };
  for (const k of LIMBS) Q[swapLR(k)] = mapSpec(P[k], s => [s[0], s[1], s[2] === undefined ? undefined : -s[2]], d => [d[0], d[1], -(d[2] || 0)], r => [r[0], r[1], -(r[2] || 0)], true);
  for (const k of POLES) Q[swapLR(k)] = P[k] ? [P[k][0], P[k][1], -P[k][2]] : undefined;
  return Q;
}
// the same body position written the other way round (heading reversed, leaning backwards, rolled half a turn): used to hand over between
// "facing left, falling on his back" and "facing right, belly up", so the following roll onto the stomach interpolates cleanly
function alt(P0) {
  const P = norm(P0), Q = { ...P, f: undefined, yaw: P.yaw + 180, lean: -P.lean, roll: P.roll + 180 };
  for (const k of LIMBS) Q[k] = mapSpec(P[k], s => s, d => d, r => r.length && P[k].r ? [-r[0], r[1], -(r[2] || 0)] : r);
  return Q;
}
const K = (t, a, o, cam, x) => ({ t, a, o, cam, ...x });

// the usual finish of a leg attack: defender on his seat, attacker climbs up and covers as the defender turns to his base
const SEAT = k => ({ p: [8.6, 1.7], f: -1, lean: -62, fL: { b: [-5.6, 3, 0] }, fR: { b: [-6.4, 1.6, 0] }, hL: [11.2, 0.2], hR: [11.6, 0.2], ...k });
const COVER = k => ({ p: [5, 3.6], lean: 62, fL: [1.2, 0.3], fR: [1.8, 0.3], hL: { o: 'belly', d: [0, 0.6, 0] }, hR: { o: 'hip', d: [0, 0.8, 0] }, ...k });
const tail = (t0, seat = SEAT(), cover = COVER()) => [
  K(t0, cover, seat, [-12, 20], { o2: alt(seat) }),
  K(t0 + (1 - t0) * 0.55, { p: [3.4, 4], z: -1.6, lean: 62, fL: [-0.4, 0.3], fR: [0, 0.3], hR: { o: 'belly', d: [0.4, -0.6, 1.2] }, hL: { o: 'shL' } },
    { p: [6, 2.7], lean: 76, roll: 80, fL: { b: [-4.5, 2.6, 0] }, fR: { b: [-5.5, 1.5, 0] }, hL: [10.6, 0.2], hR: [11, 0.2] }, [-30, 26]),
  K(1, RT(), RB(), M)];
// spin behind a man who is down on his hands in front of you (snap-down, counter to a shot): ends in the riding position seen from the other side
const spin = (t0, x0) => [
  K(t0 + (1 - t0) * 0.45, { p: [x0 + 0.5, 4.6], z: 2.9, yaw: -80, lean: 50, fL: [x0 - 0.4, 0.3, 6.6], fR: [x0 + 1.6, 0.3, 6.2], hL: { o: 'belly', d: [0, 0.8, 0] }, hR: { o: 'chest', d: [0, 0.8, 0] } },
    { p: [-2.6, 3.6], f: -1, lean: 80, fL: [1, 0.3], fR: [1.2, 0.3], hL: [-8.4, 0], hR: [-8.6, 0] }, [55, 22]),
  K(1, rot180(RT()), rot180(RB()), [M[0] + 180, M[1]])];

const CLIPS = {
  idleN: () => ({ n: 1, loopDur: 2.2, loop: [
    { a: S(XA, 1), o: S(XO, -1) },
    { a: S(-4.3, 1, { hL: { o: 'neck', d: [0.4, 0.2, 0] } }), o: S(4.3, -1, { hR: { o: 'elL' } }) },
    { a: S(-3.6, 1, { hL: { o: 'neck', d: [0.4, 0.2, 0] }, hR: { o: 'elR' }, lean: 30 }), o: S(5, -1, { hL: { o: 'neck', d: [-0.4, 0.2, 0] }, hR: { o: 'elL' }, lean: 30 }) },
    { a: S(-5.2, 1, { hR: { r: [3.2, -3] } }), o: S(5.6, -1, { hL: { o: 'neck', d: [-0.4, 0.2, 0] } }) }] }),
  idleT: () => ({ n: 1, cam: M, loopDur: 1.8, loop: [{ a: RT(), o: RB() }, { a: RT({ p: [2.4, 4.1], lean: 63 }), o: RB({ p: [4.6, 3.9], lean: 75 }) }] }),
  brk: () => ({ n: 1, loop: [{ a: UP(-8, 1), o: UP(8, -1) }, { a: UP(-8, 1, { p: [-8, 7.1] }), o: UP(8, -1) }], loopDur: 1.6 }),
  end: () => ({ n: 1, noHg: true, loopDur: 0.9, cam: [0, 14], loop: [0, 0.5].map(j => ({
    a: UP(-5.2, 1, { yaw: 78, p: [-5.2, 7.25 + j], fL: [-5.9, j * 0.8], fR: [-4.5, j * 0.8], hL: { r: [0.4, 6.2, -1.6] }, pL: [0, 0, -1] }),
    o: UP(5.6, -1, { yaw: 100, lean: 8, p: [5.6, 7.1] }),
    r: UP(0, 1, { yaw: 90, z: -1.4, fL: [0.7, 0], fR: [-0.7, 0], hR: { o: 'haL', of: 'a', d: [0.5, -0.4, 0] }, pR: [0, 0, -1], hL: { o: 'haR', of: 'o', d: [0, 0.2, 0] } }) })) }),

  // ----- takedowns -----
  double: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.14, SHOT(), S(XO, -1, { hL: { r: [2.6, -3.2] }, hR: { r: [2.4, -3.6] } })),
    K(0.3, INLEGS(), { p: [6.9, 5.9], f: -1, lean: 40, fL: [5.2, 0], fR: [8.4, 0], hL: { o: 'chest', d: [0, 1, 0] }, hR: { o: 'belly', d: [0, 1, 0] } }),
    K(0.48, { p: [4.6, 5.2], lean: 36, fL: [6, 0], fR: [2.4, 0], hL: { o: 'knR' }, hR: { o: 'knL' } }, { p: [8.8, 6.9], f: -1, lean: -28, fL: { b: [-6.2, 2.6, 0] }, fR: { b: [-6.6, 1.6, 0] }, hL: { r: [1, 2.4] }, hR: { r: [0.4, 2] } }, N),
    ...tail(0.66)] }),
  single: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.13, SHOT(), S(XO, -1)),
    K(0.27, INLEGS({ hL: { o: 'knL', d: [0.6, 0.6, 0] }, hR: { o: 'knL', d: [0.4, -0.8, 0] } }), { p: [7, 6], f: -1, lean: 34, fL: [4.6, 0], fR: [8.4, 0], hL: { o: 'head' }, hR: { o: 'chest', d: [0, 1, 0] } }),
    K(0.44, { p: [3, 6.5], lean: 14, fL: [4, 0], fR: [1.8, 0], hL: { o: 'knL', d: [0.2, 0.4, 0] }, hR: { o: 'ftL', d: [0.4, 0.6, 0] } }, { p: [8.4, 6.7], f: -1, lean: 16, fL: [3.4, 6.3], fR: [8.8, 0], hL: { o: 'shL' }, hR: { r: [1, 1.5] } }),
    K(0.56, { p: [3.6, 6.3], lean: 20, fL: [5.2, 0], fR: [2.2, 0], hL: { o: 'knL', d: [0.2, 0.4, 0] }, hR: { o: 'ftL', d: [0.4, 0.6, 0] } }, { p: [9, 7.1], f: -1, lean: 4, fL: [3.8, 7], fR: [9.8, 0.6], hL: { r: [1.6, 1.6] }, hR: { r: [1, 2.2] } }, N),
    ...tail(0.7, SEAT({ fL: [4.8, 3.6] }), COVER({ hR: { o: 'knL' } }))] }),
  ankle: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.16, S(-3.4, 1, { hL: { o: 'head', d: [0.6, 0.4, 0] }, lean: 30 }), S(4.6, -1, { lean: 40, p: [4.6, 5.9] })),
    K(0.32, { p: [0.2, 3.1], lean: 58, fL: [2.2, 0], fR: [-3.6, 0.3], hL: { o: 'head', d: [0.6, 0.4, 0] }, hR: { o: 'ftR', d: [0.3, 0.5, 0] } }, { p: [5.2, 5.4], f: -1, lean: 56, fL: [6.6, 0], fR: [3.4, 0], hL: { r: [2.4, -3] }, hR: { r: [2.2, -3.4] } }),
    K(0.5, { p: [2.6, 3.8], lean: 50, fL: [4.4, 0], fR: [-0.6, 0.3], hL: { o: 'chest' }, hR: { o: 'ftR', d: [0.3, 0.5, 0] } }, { p: [7.6, 4.4], f: -1, lean: -18, fL: [8.8, 0], fR: [3.6, 4.2], hL: { r: [-0.5, -3.5] }, hR: { r: [1, 1.5] } }, N),
    ...tail(0.68, SEAT({ fR: [4.6, 3.4] }), COVER({ hR: { o: 'ftR' } }))] }),
  snap: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.18, S(-4.4, 1, { hL: { o: 'head', d: [0.5, 0.6, 0] }, hR: { o: 'elL' } }), S(4.4, -1)),
    K(0.4, { p: [-6.4, 5.9], z: 1.2, yaw: -20, lean: 34, fL: [-4.2, 0], fR: [-8, 0], hL: { o: 'head', d: [0, 0.8, 0] }, hR: { o: 'chest', d: [0, 0.8, 0] } },
      { p: [0.6, 3.7], f: -1, lean: 80, fL: [4.2, 0.3], fR: [4.4, 0.3], hL: [-5.2, 0], hR: [-5.4, 0] }, N),
    ...spin(0.4, -6)] }),
  duck: () => ({ kf: [   // duck under the arm and come out behind him
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.18, S(-4.2, 1, { hL: { o: 'elL', d: [0, 0.4, 0] }, hR: { o: 'neck' } }), S(4.2, -1, { hL: { o: 'neck', d: [-0.4, 0.2, 0] } })),
    K(0.42, { p: [0.4, 4.4], z: 2.6, yaw: -40, lean: 50, fL: [2, 0, 1.8], fR: [-2, 0, 3.4], hL: { o: 'belly', d: [0, 0.4, 0] }, hR: { o: 'elL', d: [0, 0.6, 0] } },
      { p: [-0.4, 5], f: -1, lean: 54, fL: [1.6, 0], fR: [-2.4, 0], hL: { r: [3, -2.4] }, hR: { r: [3.2, -3] } }, N),
    ...spin(0.42, 0)] }),
  counter: () => ({ kf: [   // 'o' shoots, 'a' sprawls and spins behind
    K(0, S(XA, 1), S(XO, -1), N), K(0.14, S(XA, 1, { hL: { r: [2.6, -3.2] } }), rot180(SHOT())),
    K(0.3, SPRAWL(-6.8, 1), { p: [-1.6, 3], f: -1, lean: 70, fL: [2.4, 0.3], fR: [3.2, 0.3], hL: { o: 'knL' }, hR: { o: 'knR' } }),
    K(0.44, SPRAWL(-7, 1, { p: [-7, 3.4], lean: 66 }), { p: [-2.2, 3.4], f: -1, lean: 82, fL: [1.6, 0.3], fR: [2, 0.3], hL: [-8, 0], hR: [-8.2, 0] }, N),
    ...spin(0.44, -6)] }),
  scr: () => ({ kf: [...roll(), K(0.74, { p: [1.2, 3.6], lean: 64, fL: [-2.4, 0.3], fR: [-2, 0.3], hL: { o: 'belly' }, hR: { o: 'hip' } }, SEAT({ p: [5.4, 1.7] }), [-12, 20], { o2: alt(SEAT({ p: [5.4, 1.7] })) }),
    K(0.88, { p: [2.4, 4.1], z: -1.8, lean: 62, fL: [-1.4, 0.3], fR: [-1, 0.3], hR: { o: 'belly', d: [0.4, -0.6, 1.2] }, hL: { o: 'shL' } }, { p: [4.8, 2.9], lean: 76, roll: 80, fL: { b: [-4.5, 2.6, 0] }, fR: { b: [-5.5, 1.5, 0] }, hL: [10, 0.2], hR: [10.4, 0.2] }, [-30, 26]),
    K(1, RT(), RB(), M)], n: 14, dur: 0.92 }),

  // ----- throws -----
  headlock: () => throwClip({ o: 'head', d: [-0.6, 0.2, 0] }),
  armthrow: () => throwClip({ o: 'elL', d: [0, 0.3, 0] }),
  lateral: () => throwClip({ o: 'chest', d: [-0.8, 0, 0] }),
  fireman: () => throwClip({ o: 'elL', d: [0, 0.3, 0] }, true),
  lift: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.13, SHOT(), S(XO, -1)),
    K(0.27, INLEGS({ p: [2.4, 3.6], hL: { o: 'hip', d: [0.8, 0, 0] }, hR: { o: 'hip', d: [0.8, -0.6, 0] } }), { p: [6.4, 6.2], f: -1, lean: 36, fL: [5, 0], fR: [8, 0], hL: { o: 'chest', d: [0, 1, 0] }, hR: { o: 'belly', d: [0, 1, 0] } }),
    K(0.46, UP(2.6, 1, { lean: -8, hL: { o: 'hip', d: [0.6, 0.4, 0] }, hR: { o: 'belly', d: [0.6, 0, 0] } }), { p: [4.8, 11], f: -1, lean: 52, fL: { b: [-6.6, 1.6, 0] }, fR: { b: [-5.8, 3, 0] }, hL: { o: 'neck' }, hR: { r: [1.5, 1] } }),
    K(0.6, UP(3.2, 1, { lean: 14, p: [3.2, 6.9], hL: { o: 'hip', d: [0.6, 0.4, 0] }, hR: { o: 'belly', d: [0.6, 0, 0] } }), { p: [6.6, 9.6], f: -1, lean: -40, fL: { b: [-6, 3, 0] }, fR: { b: [-6.8, 1.2, 0] }, hL: { r: [1, 2.5] }, hR: { r: [0, 2.5] } }, N),
    K(0.76, { p: [5.4, 3.4], lean: 66, fL: [1.4, 0.3], fR: [2, 0.3], hL: { o: 'chest' }, hR: { o: 'belly' } }, { p: [8.4, 1.5], f: -1, lean: -84, fL: { b: [-5.6, 3.2, 0] }, fR: { b: [-6.6, 1.4, 0] }, hL: [13.4, 0.6], hR: [13, 2.4] }, [-14, 22]),
    K(1, { p: [5.6, 2.9], lean: 72, fL: [1.2, 0.3], fR: [1.8, 0.3], hL: { o: 'head' }, hR: { o: 'chest' } }, { p: [8.4, 1.3], f: -1, lean: -88, fL: { b: [-4.6, 4, 0] }, fR: { b: [-6.6, 0.8, 0] }, hL: [13.2, 0.4], hR: [12.6, 1.6] }, [-30, 28])], pin: true }),

  // ----- shot defence -----
  sprawl: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.15, SHOT(), S(XO, -1, { hL: { r: [2.6, -3.2] }, hR: { r: [2.4, -3.6] } })),
    K(0.32, { p: [0.4, 2.9], lean: 72, fL: [-3.4, 0.3], fR: [-4, 0.3], hL: { o: 'knR' }, hR: { o: 'knL' } }, SPRAWL(6.4, -1)),
    K(0.52, { p: [0, 2.5], lean: 82, fL: [-3.8, 0.3], fR: [-4.4, 0.3], hL: [5.2, 0], hR: [5.6, 0] }, SPRAWL(6.2, -1, { p: [6.2, 3.3], lean: 68, hL: { o: 'head', d: [0, 0.8, 0] } })),
    K(0.72, { p: [-3.4, 3.6], lean: 55, fL: [-5.6, 0.3], fR: [-1.4, 0], hL: { r: [2.6, -2] }, hR: { r: [2.2, -2.8] } }, { p: [6.6, 4.9], f: -1, lean: 44, fL: [5, 0], fR: [8.8, 0], hL: { r: [3, -2] }, hR: { r: [2.6, -2.6] } }),
    K(1, S(XA, 1), S(XO, -1), N)] }),
  whizzer: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.14, SHOT(), S(XO, -1)),
    K(0.3, { p: [2.4, 4.4], lean: 46, fL: [4, 0], fR: [0.2, 0], hL: { o: 'knL', d: [0.3, 0.5, 0] }, hR: { o: 'knL', d: [0.2, -0.9, 0] } }, { p: [7, 6.2], f: -1, lean: 30, fL: [4.4, 3], fR: [8.4, 0], hL: { o: 'shR', d: [0, 0.6, 0] }, hR: { o: 'head', d: [0, 0.6, 0] }, pL: [0, 1, 0] }),
    K(0.5, { p: [2.8, 4.8], lean: 52, fL: [4.6, 0], fR: [0.8, 0], hL: { o: 'knL', d: [0.3, 0.5, 0] }, hR: { o: 'knL', d: [0.2, -0.9, 0] } }, { p: [7.8, 6], f: -1, lean: 44, fL: [5.4, 2.2], fR: [9.6, 0], hL: { o: 'shR', d: [0, 0.6, 0] }, hR: { o: 'head', d: [0, 0.6, 0] }, pL: [0, 1, 0] }),
    K(0.72, { p: [-1.6, 4.6], lean: 46, fL: [0.6, 0], fR: [-3.6, 0], hL: { r: [3, -1.6] }, hR: { r: [2.6, -2.6] } }, { p: [8.6, 5.9], f: -1, lean: 30, fL: [6.4, 0], fR: [10.4, 0], hL: { r: [3, -1.6] }, hR: { r: [2.6, -2.6] } }),
    K(1, S(XA, 1), S(XO, -1), N)] }),
  hipout: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.15, SHOT(), S(XO, -1, { hL: { r: [2.6, -3.2] }, hR: { r: [2.4, -3.6] } })),
    K(0.32, { p: [1, 3.3], lean: 64, fL: [3, 0], fR: [-3, 0.3], hL: { r: [3.6, -1.4] }, hR: { r: [3.4, -2] } }, { p: [8.4, 5.8], z: -3, yaw: 150, lean: 34, fL: [7, 0, -3.6], fR: [10.4, 0, -2.4], hL: { o: 'head', d: [0, 0.6, 0] }, hR: { o: 'shR', d: [0, 0.6, 0] } }),
    K(0.5, { p: [2.4, 2.7], lean: 78, fL: [-1, 0.3], fR: [-2, 0.3], hL: [7.6, 0], hR: [7.2, 0] }, { p: [9.6, 6.2], z: -4, yaw: 130, lean: 24, fL: [8.6, 0, -4.8], fR: [11, 0, -3.4], hL: { r: [2.8, -2.4] }, hR: { r: [2.4, -3] } }),
    K(0.75, { p: [-2.4, 4.6], lean: 44, fL: [-0.4, 0], fR: [-4.4, 0] }, { p: [8.2, 6.1], z: -1.6, yaw: 170, lean: 26, fL: [6, 0, -2], fR: [10, 0, -1.2], hL: { r: [3, -1.4] }, hR: { r: [2.5, -2.4] } }),
    K(1, S(XA, 1), S(XO, -1), N)] }),
  handfight: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.22, { p: [-3.6, 4.9], lean: 42, fL: [-1.2, 0], fR: [-5.6, 0], hL: { o: 'knL', d: [-1.4, 0.6, 0] }, hR: { o: 'knR', d: [-1.6, 0.4, 0] } }, S(6, -1, { p: [6, 5.6], lean: 36, hL: { o: 'haR', d: [0, 0.5, 0] }, hR: { o: 'head', d: [0, 0.6, 0] } })),
    K(0.45, { p: [-2.6, 4.5], lean: 50, fL: [-0.4, 0], fR: [-4.8, 0], hL: { o: 'knL', d: [-1.8, 0.2, 0] }, hR: { o: 'knR', d: [-2, 0.8, 0] } }, S(6.8, -1, { p: [6.8, 5.4], lean: 40, hL: { o: 'haR', d: [0, 0.5, 0] }, hR: { o: 'head', d: [0, 0.8, 0] } })),
    K(0.7, S(-5.4, 1, { hL: { r: [3.2, -0.4] } }), S(6.8, -1, { hL: { o: 'haL', d: [0.4, 0, 0] } })),
    K(1, S(XA, 1), S(XO, -1), N)], n: 10 }),
  oob: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N), K(0.13, SHOT(), S(XO, -1)),
    K(0.28, INLEGS(), { p: [6.9, 5.9], f: -1, lean: 40, fL: [5.2, 0], fR: [8.6, 0], hL: { o: 'chest', d: [0, 1, 0] }, hR: { o: 'belly', d: [0, 1, 0] } }),
    K(0.5, INLEGS({ p: [11, 3.4], fL: [12.8, 0], fR: [7, 0.3] }), { p: [16.4, 5.4], f: -1, lean: 48, fL: [15.4, 0], fR: [19, 0], hL: { o: 'chest', d: [0, 1, 0] }, hR: { o: 'belly', d: [0, 1, 0] } }),
    K(0.68, INLEGS({ p: [17, 3], lean: 70, fL: [18.6, 0], fR: [13, 0.3] }), { p: [22.6, 4.4], f: -1, lean: 58, fL: [23, 0], fR: [26.4, 0.2], hL: { o: 'chest', d: [0, 1, 0] }, hR: { o: 'belly', d: [0, 1, 0] } }),
    K(0.8, UP(2, 1, { yaw: 180, lean: 6, fL: [2.8, 0], fR: [1, 0] }), UP(9, -1, { lean: 6, fL: [8, 0], fR: [9.8, 0] }), N, { a2: UP(2, 1, { yaw: -180, lean: 6, fL: [2.8, 0], fR: [1, 0] }) }),
    K(1, S(XA, 1), S(XO, -1), N)] }),
  throw: () => ({ kf: [   // a failed throw: he steps in for the head, the defender drops his hips and blocks
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.2, { p: [-1.2, 6.4], lean: 12, fL: [0.8, 0], fR: [-2.8, 0], hR: { o: 'head', d: [-0.6, 0.2, 0] }, hL: { o: 'elR' } }, S(4.4, -1, { lean: 22 })),
    K(0.42, { p: [1.6, 5.4], yaw: 150, lean: 44, fL: [0.8, 0], fR: [2.8, 0], hR: { o: 'head', d: [-0.6, 0.2, 0] }, hL: { o: 'elR' } }, { p: [5.2, 4.9], f: -1, lean: 14, fL: [3.6, 0], fR: [7.4, 0], hL: { o: 'hip', d: [0.6, 0.6, 0] }, hR: { o: 'belly', d: [0.6, 0.4, 0] } }),
    K(0.62, { p: [1.2, 5.6], yaw: 140, lean: 50, fL: [0.6, 0], fR: [2.6, 0], hR: { o: 'head', d: [-0.6, 0.2, 0] }, hL: { o: 'elR' } }, { p: [5.6, 4.6], f: -1, lean: 8, fL: [3.8, 0], fR: [7.8, 0], hL: { o: 'hip', d: [0.6, 0.6, 0] }, hR: { o: 'belly', d: [0.6, 0.4, 0] } }),
    K(1, S(XA, 1), S(XO, -1), N)] }),
  scramble: () => ({ kf: [...roll(),
    K(0.76, { p: [-1.4, 3.4], lean: 58, fL: [0.6, 0], fR: [-4.4, 0.3], hL: { r: [3, -1.4] }, hR: { r: [2.6, -2.2] } }, { p: [5.4, 3.4], f: -1, lean: 58, fL: [3.4, 0], fR: [8.4, 0.3], hL: { r: [3, -1.4] }, hR: { r: [2.6, -2.2] } }, N),
    K(1, S(XA, 1), S(XO, -1), N)], n: 14, dur: 0.92 }),
  stall: () => ({ kf: [
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.4, { p: [-10, 6.7], lean: 10, fL: [-8.6, 0], fR: [-11, 0], hL: { r: [2.6, -0.4] }, hR: { r: [2.4, -1] } }, S(1.5, -1, { hL: { r: [3.6, -0.8] } })),
    K(0.7, { p: [-11.5, 6.7], lean: 8, fL: [-10.4, 0], fR: [-12.6, 0], hL: { r: [2.6, -0.4] }, hR: { r: [2.4, -1] } }, S(-1.5, -1, { hL: { r: [3.6, -0.8] } })),
    K(1, S(XA, 1), S(XO, -1), N)], n: 10 }),

  // ----- top / bottom: 'a' is the top man -----
  breakdown: () => ({ kf: [K(0, RT(), RB(), M), K(0.3, RT({ p: [2.8, 4], lean: 68, hL: { o: 'haL', d: [-0.4, 0.6, 0] } }), RB({ p: [4.9, 3.2], lean: 82, hL: [8.6, 0.4] })), K(0.6, FT(), FB()), K(1, FT(), FB(), M)], n: 9, dur: 0.6,
    loop: [{ a: FT(), o: FB() }, { a: FT({ p: [2.6, 2.7] }), o: FB({ fL: { b: [-6.6, 1.2, 0] }, hR: [11.4, 0.9] }) }] }),
  hips: () => ({ n: 1, cam: M, loopDur: 1.6, loop: [
    { a: FT({ p: [2.6, 2.6], z: -0.9, lean: 76, fL: [-4.4, 0.2], fR: [-4.2, 0.2] }), o: FB({ p: [5, 2.3], lean: 84, fL: [1.2, 0.3], fR: [1.4, 0.3], hL: [9.6, 0.3], hR: [9.9, 0.3] }) },
    { a: FT({ p: [2.8, 2.4], z: -0.9, lean: 78, fL: [-4.2, 0.2], fR: [-4, 0.2] }), o: FB({ p: [5, 2.8], lean: 80, fL: [1.2, 0.3], fR: [1.4, 0.3], hL: [9.6, 0.3], hR: [9.9, 0.3] }) }] }),
  flat: () => ({ n: 1, cam: M, loopDur: 1.6, loop: [
    { a: FT({ hL: { o: 'head', d: [0, 0.4, 0] } }), o: FB() },
    { a: FT({ p: [3.2, 3], z: -2, hL: { o: 'head', d: [0, 0.8, 0] } }), o: FB({ roll: 14, hL: [11, 0.9] }) }] }),
  matret: () => ({ kf: [
    K(0, RT(), RB(), M),
    K(0.2, { p: [2.8, 5.4], z: -0.8, lean: 34, fL: [1, 0], fR: [3.4, 0], hL: { o: 'belly', d: [1, 0, -0.4] }, hR: { o: 'belly', d: [1, -0.3, 0.6] } }, { p: [5.2, 5.4], lean: 42, fL: [6.6, 0], fR: [3.8, 0], hL: { s: 'belly', d: [1.2, -0.2, 0] }, hR: { s: 'belly', d: [1.2, -0.4, 0] } }),
    K(0.38, { p: [3.6, 6.7], z: -0.5, lean: 10, fL: [2.4, 0], fR: [4.4, 0], hL: { o: 'belly', d: [1, 0, -0.4] }, hR: { o: 'belly', d: [1, -0.3, 0.6] } }, { p: [5.4, 7], lean: 14, fL: [6.6, 0], fR: [4.6, 0], hL: { s: 'belly', d: [1.2, -0.2, 0] }, hR: { s: 'belly', d: [1.2, -0.4, 0] } }),
    // 2026-11-12: lifted higher and swung round, his legs flung out wide to the side before he is driven down (a slam, not a set-down)
    K(0.5, { p: [3.8, 7.1], z: -0.5, lean: -16, fL: [2.6, 0], fR: [5, 0], hL: { o: 'belly', d: [1, 0, -0.4] }, hR: { o: 'belly', d: [1, -0.3, 0.6] } }, { p: [5.2, 10.2], lean: 46, fL: { b: [-6.2, 2.6, 1.4] }, fR: { b: [-6.8, 0.6, 2.2] }, hL: { r: [2.6, -1] }, hR: { r: [3, 0] } }),
    K(0.63, { p: [4, 6.9], z: -0.3, yaw: -25, lean: -6, fL: [2.6, 0], fR: [5.2, 0, 0.6], hL: { o: 'belly', d: [1, 0, -0.4] }, hR: { o: 'belly', d: [1, -0.3, 0.6] } }, { p: [5.6, 9.4], z: 1.4, yaw: -40, lean: 84, roll: 30, fL: { b: [-6, 1.4, 4.6] }, fR: { b: [-6.8, -0.2, 3.4] }, hL: { r: [2.6, -1.6] }, hR: { r: [3, -0.6] } }),
    K(0.77, { p: [3.6, 4.2], z: -0.8, lean: 64, fL: [0.2, 0], fR: [1.4, 0], hL: { o: 'belly', d: [0.4, -0.6, -0.4] }, hR: { o: 'belly', d: [0.4, -0.8, 0.8] } }, { p: [6.4, 2.3], yaw: -8, lean: 98, roll: 6, fL: { b: [-6.2, 1.2, 3.6] }, fR: { b: [-6.8, 0.2, 2.2] }, hL: [12.2, 0.4], hR: [12.6, 0.4] }),
    K(0.88, { p: [3.4, 3.6], z: -0.9, lean: 66, fL: [0, 0], fR: [1.2, 0], hL: { o: 'belly', d: [0.4, -0.6, -0.4] }, hR: { o: 'belly', d: [0.4, -0.8, 0.8] } }, { p: [6.3, 1.5], lean: 92, fL: { b: [-7, 0.6, 1.4] }, fR: { b: [-7.1, 0.2, 0.8] }, hL: [12, 0.4], hR: [12.4, 0.4] }),
    K(1, FT(), FB(), M)], n: 16, dur: 1.0, loop: [{ a: FT(), o: FB() }, { a: FT({ p: [2.6, 2.7] }), o: FB({ hR: [11.4, 0.9] }) }] }),

  // ----- turns: 'a' is the top man -----
  half: () => ({ pin: true, kf: [
    K(0, RT(), RB(), M), K(0.2, FT({ hL: { o: 'head', d: [0, 0.6, 0] } }), FB()),
    K(0.45, { p: [5.4, 3], z: -3.2, yaw: 50, lean: 62, fL: { b: [-6.6, 1.4, 0] }, fR: { b: [-6, 2.6, 0] }, hL: { o: 'head', d: [0.4, 0, 0.6] }, hR: { o: 'belly', d: [0, 0, 1] } }, FB({ roll: -60, p: [5, 1.8], hL: [11, 2.4] })),
    K(0.72, { p: [6, 2.9], z: -3, yaw: 40, lean: 70, fL: { b: [-6.8, 1, 0] }, fR: { b: [-6.2, 2.2, 0] }, hL: { o: 'head', d: [0.4, 0, 0.6] }, hR: { o: 'belly', d: [0, 0.4, 0.6] } }, FB({ roll: -140, p: [5, 1.6], fL: { b: [-5, 3.4, 0] }, fR: { b: [-6.6, 1, 0] }, hL: { b: [-1, 2.4, 0] }, hR: { b: [0.6, 2, 0] } })),
    K(1, { p: [6.4, 2.7], z: -2.8, yaw: 48, lean: 74, fL: { b: [-6.8, 0.6, -1] }, fR: { b: [-6.6, 0.8, 1] }, hL: { o: 'head', d: [0.6, -0.4, 0.8] }, hR: { o: 'belly', d: [0, 0.2, 0.8] } }, FB({ roll: -178, p: [5, 1.3], fL: { b: [-4.6, 3.8, 0] }, fR: { b: [-6.8, 0.6, 0] }, hL: { b: [-0.6, 0.4, -2.6] }, hR: { b: [1.4, 1.2, 0] } }), M)] }),
  cradle: () => ({ pin: true, kf: [
    K(0, RT(), RB(), M),
    K(0.22, RT({ p: [3, 4.2], hL: { o: 'head', d: [0.6, -0.4, 0] }, hR: { o: 'knR', d: [0.4, 0, 0.4] } }), RB()),
    K(0.45, { p: [3, 3.8], z: -2.2, lean: 56, fL: [-0.8, 0.3], fR: [-0.4, 0.3], hL: { o: 'head', d: [0.6, -0.4, 0] }, hR: { o: 'knR', d: [0.4, 0, 0.4] } }, { p: [5, 2.9], lean: 58, roll: -30, fL: [1.6, 0.3], fR: { b: [-2.4, 3.6, 0] }, hL: [9, 0.4], hR: { b: [-1.6, 2.2, 0] } }),
    K(0.72, { p: [2.6, 3.4], z: 0.6, lean: 50, fL: [-1, 0.3], fR: [-0.4, 0.3], hL: { o: 'head', d: [0.2, -0.4, 0] }, hR: { o: 'knR', d: [0.2, 0, 0.4] } }, { p: [4.8, 2.3], lean: 48, roll: -150, fL: { b: [-3.4, 3.8, 0] }, fR: { b: [-2, 4, 0] }, hL: { b: [-1.6, 2.2, 0] }, hR: { b: [-1.2, 2.6, 0] } }),
    K(1, { p: [2.4, 3.2], z: 1.8, lean: 48, fL: [-1.4, 0.3], fR: [-0.6, 0.3], hL: { o: 'head', d: [0, -0.4, 0] }, hR: { o: 'knR', d: [0, 0, 0.4] } }, { p: [4.9, 1.9], lean: 52, roll: -178, fL: { b: [-3, 4.2, 0] }, fR: { b: [-1.8, 4.2, 0] }, hL: { b: [-1.6, 2.2, 0] }, hR: { b: [-1.2, 2.6, 0] } }, M)] }),
  tilt: () => ({ pin: true, kf: [
    K(0, RT(), RB(), M),
    K(0.25, RT({ p: [2.8, 3.8], z: -1.6, hL: { o: 'haL', d: [-0.6, 0.6, 0] } }), RB({ p: [4.6, 3.4], hL: [8.2, 1] })),
    K(0.55, { p: [3, 1.8], z: 0.6, lean: -20, fL: [7, 0.3, -1.2], fR: [6.4, 1.6, 1.6], hL: { o: 'haL', d: [0, 0, 0] }, hR: { o: 'belly', d: [0.6, 0, 0.8] } }, { p: [4.6, 3], lean: -14, roll: 30, fL: [8.8, 0.3], fR: { b: [-6, 2.6, 0] }, hL: { s: 'belly', d: [0.8, 0, -0.6] }, hR: { r: [2, 0.6] } }),
    K(1, { p: [3, 1.4], z: 1.3, lean: -60, fL: [7.4, 0.3, -0.8], fR: [6.8, 2.2, 2], hL: { o: 'haL', d: [0, 0, 0] }, hR: { o: 'belly', d: [0.7, 0, 0.6] }, qR: [0, 1, 0] }, { p: [4.7, 2.6], lean: -68, roll: 0, fL: { b: [-6.6, 2, 0] }, fR: { b: [-5.6, 3.6, 0] }, hL: { s: 'belly', d: [0.9, 0.2, -0.4] }, hR: { r: [2.4, 1.4] } }, M)] }),
  turk: () => ({ pin: true, kf: [
    K(0, RT(), RB(), M), K(0.2, FT({ hR: { o: 'knR', d: [0, 0.5, 0] } }), FB()),
    K(0.45, { p: [3.4, 4.6], z: -1, lean: 46, fL: [0.6, 0, -2], fR: [4.6, 0, 1.6], hL: { o: 'shL', d: [0, 0.6, 0] }, hR: { o: 'knR', d: [0, 0.6, 0] } }, FB({ roll: -40, p: [5.2, 1.6], fR: [3, 4.4, 1], qR: [0, 1, 0] })),
    K(0.72, { p: [5, 4], z: -1.4, lean: 60, fL: [1.6, 0, -2.2], fR: [5.6, 0, 1.6], hL: { o: 'head', d: [0.4, 0, 0.4] }, hR: { o: 'knR', d: [0, 0.6, 0] } }, FB({ roll: -130, p: [5.2, 1.6], fR: [2.6, 5, 0.6], qR: [0, 1, 0], hL: { b: [-0.6, 2.4, 0] }, hR: { b: [0.8, 2, 0] } })),
    K(1, { p: [6, 3.2], z: -2, yaw: 30, lean: 70, fL: [2.4, 0.2, -3], fR: { o: 'knR', d: [0.4, 0.2, 0] }, hL: { o: 'head', d: [0.5, -0.2, 0.6] }, hR: { o: 'chest', d: [0, 0.4, 0.8] } }, FB({ roll: -176, p: [5.2, 1.3], fR: [1.8, 4.6, 0.4], fL: { b: [-7, 0.5, 0] }, hL: { b: [-0.6, 0.4, -2.6] }, hR: { b: [1.2, 1.4, 0] } }), M)] }),
  wing: () => ({ pin: true, kf: [
    K(0, RT(), RB(), M), K(0.2, FT({ hL: { o: 'elL', d: [0, 0.4, 0] } }), FB({ hL: { s: 'belly', d: [0.6, 1.5, -0.3] }, pL: [0, 1, -0.4] })),
    K(0.42, { p: [4.4, 3.2], z: -3, yaw: 40, lean: 60, fL: { b: [-6.4, 1.6, 0] }, fR: { b: [-6, 2.6, 0] }, hL: { o: 'elL', d: [0, 0.3, 0] }, hR: { o: 'head', d: [0, 0.6, 0] } }, FB({ hL: { s: 'chest', d: [-0.6, 1.5, -0.2] }, pL: [0, 1, -0.4], roll: -20 })),
    K(0.7, { p: [8.6, 3.6], z: -3.4, yaw: 110, lean: 58, fL: { b: [-6.6, 1.2, 0] }, fR: { b: [-5.6, 3, 0] }, hL: { o: 'elL', d: [0, 0.3, 0] }, hR: { o: 'belly', d: [0, 0.6, 0] } }, FB({ p: [5, 1.7], roll: -120, hL: { s: 'chest', d: [-0.6, 0.6, -1.4] }, pL: [0, 1, -0.4], fL: { b: [-5.6, 2.8, 0] }, hR: { b: [1, 2, 0] } })),
    K(1, { p: [9.6, 3], z: -3, yaw: 140, lean: 66, fL: { b: [-6.8, 0.8, -1] }, fR: { b: [-6.4, 1.4, 1] }, hL: { o: 'elL', d: [0, 0.3, 0] }, hR: { o: 'chest', d: [0, 0.6, 0.6] } }, FB({ p: [5, 1.3], roll: -176, hL: { s: 'chest', d: [-1.4, -0.4, -1.6] }, fL: { b: [-4.8, 3.6, 0] }, fR: { b: [-6.8, 0.6, 0] }, hR: { b: [1.4, 1.2, 0] } }), M)] }),

  // ----- escapes and reversal: 'a' is the BOTTOM man, 'o' the top man (frame of the top man) -----
  standup: () => ({ aBottom: true, kf: [
    K(0, RB(), RT(), M),
    K(0.22, { p: [5.4, 5.4], lean: 42, fL: [6.8, 0], fR: [4, 0], hL: { s: 'belly', d: [1.2, -0.2, 0] }, hR: { s: 'belly', d: [1.2, -0.4, 0] } }, { p: [3, 5.4], z: -0.8, lean: 34, fL: [1.2, 0], fR: [3.6, 0], hL: { o: 'belly', d: [1, 0, -0.4] }, hR: { o: 'belly', d: [1, -0.3, 0.6] } }, [-30, 26]),
    K(0.42, { p: [5.8, 7], lean: 12, fL: [7, 0], fR: [5, 0], hL: { s: 'belly', d: [1.2, -0.2, 0] }, hR: { s: 'belly', d: [1.2, -0.4, 0] } }, { p: [4, 6.7], z: -0.5, lean: 12, fL: [2.8, 0], fR: [4.8, 0], hL: { o: 'belly', d: [1, 0, -0.4] }, hR: { o: 'belly', d: [1, -0.3, 0.6] } }, [-18, 21]),
    K(0.62, { p: [8.4, 6.6], yaw: 80, lean: 16, fL: [9.2, 0, -0.6], fR: [7.6, 0, 0.8], hL: { r: [2, -1.6] }, hR: { r: [2.4, -2.4] } }, { p: [2, 6.3], lean: 24, fL: [3.8, 0], fR: [0.4, 0], hL: { r: [3.6, -0.6] }, hR: { r: [3.2, -1.4] } }, [-8, 18]),
    K(1, S(XO, 1, { yaw: 180 }), S(XA, 1), N)] }),
  sitout: () => ({ aBottom: true, kf: [
    K(0, RB(), RT(), M),
    K(0.24, { p: [6.6, 1.7], lean: -12, fL: [11, 0.2], fR: [10.4, 1.6], hL: [5, 0.3], hR: [5.6, 0.3], qR: [0, 1, 0] }, RT({ p: [3, 4], hL: { o: 'chest' }, hR: { o: 'belly', d: [0.6, 0, 1] } }), [-30, 26]),
    K(0.46, { p: [8, 3], yaw: 100, lean: 58, fL: { b: [-6, 2.6, 0] }, fR: { b: [-6.6, 1.2, 0] }, hL: [9, 0, -1.6], hR: [8.4, 0, 1.6] }, { p: [3.4, 3.4], z: -1.4, lean: 70, fL: [-0.6, 0.3], fR: [-0.2, 0.3], hL: [8, 0.4], hR: [7.6, 0.6] }, [-18, 21]),
    K(0.7, { p: [8.4, 5.2], yaw: 170, lean: 38, fL: [6.6, 0], fR: [10.2, 0], hL: { r: [3, -1.4] }, hR: { r: [2.6, -2.2] } }, { p: [0.4, 4.6], lean: 44, fL: [2.4, 0], fR: [-1.8, 0.2], hL: { r: [3, -1.4] }, hR: { r: [2.6, -2.2] } }, [-8, 18]),
    K(1, S(XO, 1, { yaw: 180 }), S(XA, 1), N)] }),
  granby: () => ({ aBottom: true, kf: [   // Granby roll: tuck, roll across the shoulders, come up facing him
    K(0, RB(), RT(), M),
    K(0.2, { p: [5.4, 3.4], lean: 108, fL: { b: [-3, 3.2, 0] }, fR: { b: [-3.6, 2.6, 0] }, hL: [9.6, 0], hR: [9.8, 0] }, RT({ p: [2.6, 4], hR: { o: 'hip', d: [0, 0.6, 0.8] } }), [-20, 23]),
    K(0.4, { p: [8, 4.8], lean: 195, fL: { b: [-4.6, 3.4, 0] }, fR: { b: [-5.6, 2, 0] }, hL: { b: [-1.6, 2, 0] }, hR: { b: [-1.4, 2.4, 0] } }, { p: [3.4, 3.4], z: -1.4, lean: 70, fL: [-0.6, 0.3], fR: [-0.2, 0.3], hL: [8, 0.6], hR: [7.6, 1] }, [-14, 21]),
    K(0.58, { p: [10, 2.2], lean: 300, fL: { b: [-4, 3.6, 0] }, fR: { b: [-5, 2.6, 0] }, hL: { b: [-1.6, 2, 0] }, hR: { b: [-1.4, 2.4, 0] } }, { p: [2.4, 4.4], z: -0.8, lean: 50, fL: [-0.4, 0], fR: [1.6, 0.3], hL: { r: [3, -1.4] }, hR: { r: [2.6, -2.2] } }, [-8, 18]),
    K(0.72, { p: [9.4, 2.6], lean: 345, fL: [12.6, 0.2], fR: [12.2, 1.6], hL: { b: [-2, 1.6, 0] }, hR: { b: [-2, 1.8, 0] } }, { p: [0, 5.2], lean: 36, fL: [2, 0], fR: [-2, 0], hL: { r: [3, -1.4] }, hR: { r: [2.6, -2.2] } }, [-4, 17],
      { a2: { p: [9.4, 2.6], lean: -15, fL: [12.6, 0.2], fR: [12.2, 1.6], hL: { b: [-2, 1.6, 0] }, hR: { b: [-2, 1.8, 0] } } }),
    K(1, S(XO, 1, { yaw: 180 }), S(XA, 1), N)] }),
  letup: () => ({ aBottom: true, kf: [
    K(0, RB(), RT(), M),
    K(0.3, RB({ p: [5, 4.4], lean: 66, fL: [6.4, 0], fR: [1.6, 0.3] }), { p: [0.6, 6.2], lean: 16, fL: [2, 0], fR: [-0.8, 0], hL: { r: [2.6, -1] }, hR: { r: [2.4, -1.6] } }, [-28, 25]),
    K(0.62, { p: [6.4, 6.2], yaw: 90, lean: 22, fL: [7.2, 0, -0.6], fR: [5.6, 0, 0.8] }, S(-4, 1), [-10, 19]),
    K(1, S(XO, 1, { yaw: 180 }), S(XA, 1), N)], n: 10 }),
  rev: () => ({ aBottom: true, kf: [
    K(0, RB(), RT(), M),
    K(0.26, { p: [6.6, 1.7], lean: -12, fL: [11, 0.2], fR: [10.4, 1.6], hL: [5, 0.3], hR: [5.6, 0.3], qR: [0, 1, 0] }, RT({ p: [3.2, 3.8], hL: { o: 'chest' }, hR: { o: 'belly', d: [0.6, 0, 1] } }), [-60, 28]),
    K(0.52, { p: [5.4, 3.2], z: 2.8, yaw: 150, lean: 60, fL: [9, 0.3, 3.4], fR: [8.6, 0.3, 4.8], hL: { o: 'belly', d: [0, 0.8, 0] }, hR: { o: 'chest', d: [0, 0.8, 0] } }, { p: [4, 2.8], z: -1, lean: 82, fL: [0.2, 0.3], fR: [0.4, 0.3], hL: [9.4, 0.2], hR: [9.6, 0.2] }, [-95, 30]),
    K(0.78, { p: [2.8, 4.2], z: 2.6, yaw: 290, lean: 58, fL: [1.4, 0.3, 5.6], fR: [2.8, 0.3, 6], hL: { o: 'belly', d: [0, 0.8, 0] }, hR: { o: 'chest', d: [0, 0.8, 0] } }, mirZ(RB({ p: [4.4, 3.2], lean: 82 })), [-125, 30]),
    K(1, { ...mirZ(RT()), yaw: 360 }, mirZ(RB()), [-180 - M[0], M[1]])] }),
};
CLIPS.highc = CLIPS.single; CLIPS.armbar = CLIPS.wing;

// ----- more takedowns (2026-11-12) -----
// sweep single: level change low to the lead leg with the head outside, come up holding the leg out wide (shelved on the hip) and run round
// to the side; the trapped leg turns him until his back is to the attacker, who drives him forward to the mat and finishes behind him
CLIPS.sweep = () => ({ n: 16, dur: 1.1, kf: [
  K(0, S(XA, 1), S(XO, -1), N),
  K(0.12, { p: [-4.6, 3.6], lean: 50, fL: [-2.4, 0], fR: [-7, 0], hL: { r: [3.4, -1.9] }, hR: { r: [3, -2.6] } }, S(XO, -1, { hL: { r: [2.6, -3.2] }, hR: { r: [2.4, -3.6] } })),
  K(0.26, { p: [1.6, 2.5], z: 1.2, lean: 70, fL: [3.4, 0.3, 1.8], fR: [-3, 0.3, 0.8], hL: { o: 'ftL', d: [0, 0.7, 0] }, hR: { o: 'knL', d: [0.2, -0.2, 0] } },
    { p: [7.4, 5.7], f: -1, lean: 42, fL: [4.4, 0], fR: [8.8, 0], hL: { o: 'chest', d: [0, 1, 0] }, hR: { o: 'belly', d: [0, 1, 0] } }),
  K(0.42, { p: [1.6, 4.2], z: 3.4, yaw: -30, lean: 40, fL: [3, 0, 4.2], fR: [-0.6, 0, 3.2], hL: { o: 'ftL', d: [0, 0.4, 0] }, hR: { o: 'knL', d: [0, 0.2, 0] } },
    { p: [7.4, 6.2], yaw: 150, lean: 24, fL: [4, 3, 2.6], fR: [8, 0, -0.6], hL: { r: [2, -0.6, 1.4] }, hR: { r: [1.6, -2.4, -1.2] } }, [-24, 18]),
  K(0.56, { p: [2.2, 5.6], z: 3, yaw: -20, lean: 24, fL: [3.4, 0, 4], fR: [0.6, 0, 2.4], hL: { o: 'ftL', d: [0, 0.4, 0] }, hR: { o: 'knL', d: [0, 0.3, 0] } },
    { p: [7.2, 6.5], yaw: 95, lean: 18, fL: [4, 4.4, 2.6], fR: [7.4, 0, -0.6], hL: { r: [1.6, -1, 2.6] }, hR: { r: [1.4, -1.4, -2.6] } }, [-28, 18]),
  K(0.68, { p: [2.8, 5.6], z: 1.2, yaw: -6, lean: 26, fL: [4, 0, 2], fR: [1.4, 0, 0.2], hL: { o: 'ftL', d: [0, 0.3, 0] }, hR: { o: 'knL', d: [0, 0.3, 0] } },
    { p: [7.4, 6.3], yaw: 30, lean: 24, fL: [4, 4.4, 1.2], fR: [8, 0, -0.4], hL: { r: [3, -2.2] }, hR: { r: [2.8, -2.8] } }, [-24, 19]),
  K(0.84, { p: [3.4, 4.8], z: -0.6, lean: 48, fL: [1.4, 0, 0.4], fR: [3.4, 0, -1.2], hL: { o: 'ftL', d: [0, 0.3, 0] }, hR: { o: 'hip', d: [0, 0.6, 0] } },
    { p: [6.2, 4], yaw: 4, lean: 70, fL: [3.6, 3.2, 0.6], fR: [4.8, 0.3, -0.6], hL: [11, 0, -0.8], hR: [11.2, 0, 0.8] }, [-20, 21]),
  K(1, RT(), RB(), M)] });
// single leg trip: in on a single, stand up and elevate the leg high so he hops on one foot, then reap the standing leg: a big fall to his back
CLIPS.trip = () => ({ n: 16, dur: 1.1, kf: [
  K(0, S(XA, 1), S(XO, -1), N), K(0.11, SHOT(), S(XO, -1)),
  K(0.24, INLEGS({ hL: { o: 'knL', d: [0.6, 0.6, 0] }, hR: { o: 'knL', d: [0.4, -0.8, 0] } }), { p: [7, 6], f: -1, lean: 34, fL: [4.6, 0], fR: [8.4, 0], hL: { o: 'head' }, hR: { o: 'chest', d: [0, 1, 0] } }),
  K(0.4, UP(2.6, 1, { lean: 6, fL: [3.6, 0], fR: [1.2, 0], hL: { o: 'ftL', d: [0, 0.4, 0] }, hR: { o: 'knL', d: [0, 0.4, 0] } }),
    { p: [7.8, 7.1], f: -1, lean: -10, fL: [4.6, 9.4, 1.6], fR: [8.2, 0], hL: { r: [1.2, 1.6] }, hR: { r: [0.4, 2.2] }, qL: [0, 1, 0] }, [-20, 14]),
  K(0.5, UP(3, 1, { lean: -6, fL: [4, 0], fR: [1.6, 0], hL: { o: 'ftL', d: [0, 0.4, 0] }, hR: { o: 'knL', d: [0, 0.4, 0] } }),
    { p: [8.2, 7.8], f: -1, lean: -14, fL: [4.8, 11.2, 1.8], fR: [8.6, 1], hL: { r: [0.6, 2.6] }, hR: { r: [-0.4, 2.4] }, qL: [0, 1, 0] }, [-22, 14]),
  K(0.6, UP(4.4, 1, { lean: 10, fL: [9.2, 0.6, -0.4], fR: [2.4, 0], hL: { o: 'ftL', d: [0, 0.4, 0] }, hR: { o: 'knL', d: [0, 0.4, 0] } }),
    { p: [7.8, 6.8], f: -1, lean: -40, fL: [5.2, 11, 1.6], fR: [10.8, 1.8, -0.4], hL: { r: [-0.6, 2.6] }, hR: { r: [-1.4, 2] }, qL: [0, 1, 0] }, [-12, 15]),
  K(0.7, { p: [5.6, 5.4], lean: 34, fL: [7.2, 0], fR: [3, 0], hL: { o: 'knL' }, hR: { o: 'belly' } },
    { p: [8.8, 4], f: -1, lean: -82, fL: { b: [-6.6, 2, 0] }, fR: { b: [-6, 3.2, 0] }, hL: { r: [-3, 2.4] }, hR: { r: [-3.6, 1] } }),
  K(0.78, { p: [5.6, 3.4], lean: 64, fL: [1.8, 0.3], fR: [2.4, 0.3], hL: { o: 'chest' }, hR: { o: 'belly' } },
    { p: [9, 1.4], f: -1, lean: -86, fL: { b: [-5.4, 3.4, 0] }, fR: { b: [-6.6, 1.4, 0] }, hL: [13.6, 0.5], hR: [13.2, 2.4] }, [-10, 20]),
  ...tail(0.86, SEAT({ p: [8.8, 1.5], lean: -80 }), COVER())] });

// ----- hand fighting (2026-11-12): 'a' = the wrestler winning the exchange -----
// head club: an overhand club to the back of the neck snaps his head down; he recovers into his stance
CLIPS.club = () => ({ n: 12, dur: 0.9, kf: [
  K(0, S(XA, 1), S(XO, -1), N),
  K(0.24, S(-5, 1, { hR: { r: [1.4, 2.6, 0.4] }, hL: { o: 'elL', d: [0, 0.2, 0] } }), S(5.2, -1, { hL: { r: [2.8, -0.6] } })),
  K(0.42, S(-4.2, 1, { lean: 34, hR: { o: 'neck', d: [0.4, 0.4, 0] }, hL: { o: 'elL' } }), S(5, -1, { p: [5, 5.2], lean: 50, hL: { r: [2.4, -2.6] }, hR: { r: [2, -3.2] } })),
  K(0.6, S(-4.4, 1, { lean: 32, hR: { o: 'neck', d: [0.2, 0.6, 0] }, hL: { o: 'haL' } }), S(5.2, -1, { p: [5.2, 5.5], lean: 42, hL: { o: 'elR' } })),
  K(0.8, S(-5.2, 1, { hL: { o: 'elL', d: [0, 0.2, 0] } }), S(5.8, -1, { hR: { o: 'haR' } })),
  K(1, S(XA, 1), S(XO, -1), N)] });
// two-on-one wrist control: both hands on his wrist, drags him forward off balance
CLIPS.wrist = () => ({ n: 12, dur: 0.95, kf: [
  K(0, S(XA, 1), S(XO, -1), N),
  K(0.25, S(-5, 1, { hL: { o: 'haR', d: [-0.3, 0.2, 0] }, hR: { o: 'haR', d: [-0.9, -0.2, 0] } }), S(5.2, -1, { hR: { r: [4.2, -1.4] } })),
  K(0.5, S(-6.4, 1, { lean: 18, p: [-6.4, 6.3], hL: { o: 'haR', d: [-0.3, 0.2, 0] }, hR: { o: 'haR', d: [-0.9, -0.2, 0] } }), S(3.6, -1, { lean: 42, p: [3.6, 5.6], hR: { r: [5, -1.6] }, fL: [1.4, 0] })),
  K(0.72, S(-6.8, 1, { lean: 18, hL: { o: 'haR', d: [-0.3, 0.2, 0] }, hR: { o: 'elR' } }), S(3.2, -1, { lean: 46, p: [3.2, 5.4], hR: { r: [5, -1.8] }, fL: [1, 0] })),
  K(1, S(XA, 1), S(XO, -1), N)] });
// elbow pass: lifts his elbow, slides by to the side to take an angle, he spins to face up again
CLIPS.elbow = () => ({ n: 13, dur: 1.0, kf: [
  K(0, S(XA, 1), S(XO, -1), N),
  K(0.22, S(-4.6, 1, { hL: { o: 'elR', d: [0, -0.3, 0] }, hR: { o: 'haR' } }), S(4.8, -1, { hR: { r: [2, -0.6] } })),
  K(0.42, S(-3.2, 1, { lean: 30, hL: { o: 'elR', d: [0, 0.4, 0] }, hR: { o: 'belly' } }), S(5, -1, { lean: 20, hR: { r: [0.6, 2.6, 0] } })),
  K(0.6, { p: [2.2, 5.4], z: 2.6, yaw: -35, lean: 36, fL: [4, 0, 2.8], fR: [0.4, 0, 3.4], hL: { o: 'hip', d: [0, 0.4, 0] }, hR: { o: 'chest' } }, S(5.4, -1, { yaw: 160, hR: { r: [0.4, 2.4, 0] } }), [-10, 17]),
  K(0.78, { p: [1, 5.8], z: 1.4, yaw: -20, lean: 28, fL: [2.6, 0, 1.8], fR: [-1.2, 0, 1.6], hL: { r: [3, -1.2] }, hR: { r: [2.5, -2.4] } }, S(5.6, -1, { yaw: 195 }), [-6, 16]),
  K(1, S(XA, 1), S(XO, -1), N)] });
// collar ties: head to head, pushing and pulling
CLIPS.ties = () => ({ n: 12, dur: 1.0, kf: [
  K(0, S(XA, 1), S(XO, -1), N),
  K(0.25, S(-4.6, 1, { lean: 34, hL: { o: 'neck', d: [0.3, 0.3, 0] }, hR: { o: 'elL' } }), S(4.6, -1, { lean: 34, hR: { o: 'neck', d: [-0.3, 0.3, 0] }, hL: { o: 'elR' } })),
  K(0.5, S(-5.6, 1, { lean: 36, hL: { o: 'neck', d: [0.3, 0.1, 0] }, hR: { o: 'elL' } }), S(3.6, -1, { lean: 40, p: [3.6, 5.8], hR: { o: 'neck', d: [-0.3, 0.3, 0] }, hL: { o: 'elR' } })),
  K(0.75, S(-3.6, 1, { lean: 40, p: [-3.6, 5.8], hL: { o: 'neck', d: [0.3, 0.3, 0] }, hR: { o: 'elL' } }), S(5.6, -1, { lean: 34, hR: { o: 'neck', d: [-0.3, 0.2, 0] }, hL: { o: 'elR' } })),
  K(1, S(XA, 1), S(XO, -1), N)] });
// circling: the pair turns half way round the centre, stepping and feinting, and ends on the other sides of the mat (see flipAt)
CLIPS.circle = () => {
  const st = (x, z, yaw, lift, reach) => ({ p: [x, 6.1], z, yaw, lean: 26, fL: { r: [2.3, -6.1 + lift, 0.2] }, fR: { r: [-1.7, -6.1, -0.2] },
    hL: reach ? { o: 'haR', d: [0, 0.4, 0] } : { r: [3.1, -1.2] }, hR: { r: [2.5, -2.4] } });
  const kf = [];
  for (let i = 0; i <= 6; i++) {
    const th = i * 30, r = th * D, lift = i % 2 ? 0.9 : 0;
    kf.push(K(i / 6, st(-6.5 * Math.cos(r), 6.5 * Math.sin(r), -th, lift, i === 2), st(6.5 * Math.cos(r), -6.5 * Math.sin(r), 180 - th, 0.9 - lift, i === 4), [-12 * Math.sin(r), 16 + 30 * Math.sin(r)]));   // camera rises mid-circle so the far man shows above the near one
  }
  return { n: 14, dur: 1.3, kf };
};

// ----- NCAA title celebrations ('a' = the champion, 'o' = beaten finalist, 'r' = referee); they start from the hand-raise pose -----
const KNEEL = (x, f, k) => ({ p: [x, 3.7], f, lean: 24, fL: [x - f * 3.4, 0.3, 0.6], fR: [x - f * 3.2, 0.3, -0.8], hL: { s: 'knL', d: [0, 0.9, 0] }, hR: { s: 'knR', d: [0, 0.9, 0] }, ...k });   // beaten, on his knees
const RAISED = () => UP(-5.2, 1, { yaw: 78, fL: [-5.9, 0], fR: [-4.5, 0], hL: { r: [0.4, 6.2, -1.6] }, pL: [0, 0, -1] });   // the 'end' clip's raised-hand pose
const REF0 = () => UP(0, 1, { yaw: 90, z: -1.4, fL: [0.7, 0], fR: [-0.7, 0], hR: { o: 'haL', of: 'a', d: [0.5, -0.4, 0] }, pR: [0, 0, -1], hL: { o: 'haR', of: 'o', d: [0, 0.2, 0] } });
const REF1 = () => UP(-14, 1, { yaw: 40, z: -3, fL: [-13.4, 0, -2.6], fR: [-14.6, 0, -3.4], hL: { r: [1.4, -1.6] }, hR: { r: [1.4, -2] } });   // steps away to the side
const VUP = (x, y, k) => ({ p: [x, y], yaw: 90, lean: 0, fL: [x + 1, 0], fR: [x - 1, 0], hL: { b: [4.4, 0.5, -2.3] }, hR: { b: [4.4, 0.5, 2.3] }, ...k });   // facing the crowd, both arms up
const champStart = () => [K(0, RAISED(), UP(5.6, -1, { yaw: 100, lean: 8, p: [5.6, 7.1] }), [0, 14], { r: REF0() })];
// jumping up and down, fists in the air
CLIPS.champJump = () => {
  const lo = x => VUP(x, 6.2, { fL: [x + 1, 0], fR: [x - 1, 0] }), hi = x => VUP(x, 9.4, { fL: [x + 1, 2.2], fR: [x - 1, 2.2], hL: { b: [4.6, 0.8, -1.8] }, hR: { b: [4.6, 0.8, 1.8] } });
  const kf = [...champStart(), K(0.14, lo(-4.6), KNEEL(7, -1), [0, 14], { r: REF1() })];
  [0.26, 0.38, 0.5, 0.62, 0.74, 0.86, 1].forEach((t, i) => kf.push(K(t, i % 2 ? lo(-4.4 + i * 0.3) : hi(-4.4 + i * 0.3))));
  return { n: 26, dur: 2.2, noHg: true, cam: [0, 14], kf, loopDur: 0.8, loop: [{ a: hi(-2.6), o: KNEEL(7, -1), r: REF1() }, { a: lo(-2.6), o: KNEEL(7, -1), r: REF1() }] };
};
// a cartwheel across the mat. Body in the screen plane: heading +x with roll -90 (chest to the crowd), lean = rotation in that plane; arms and legs are
// spokes of a wheel, so the hip height is set by whichever hand or foot is lowest.
function wheel(t, lean, x) {
  const a = lean * D, off = (ku, kl) => ku * Math.cos(a) + kl * Math.sin(a), y = 0.3 - Math.min(off(9, -3.95), off(9, 3.95), off(-6.6, -3.55), off(-6.6, 3.55));
  return K(t, { p: [x, y], yaw: 0, roll: -90, lean, fL: { b: [-6.6, 0, -2.6] }, fR: { b: [-6.6, 0, 2.6] }, hL: { b: [4.4, 0, -2.6] }, hR: { b: [4.4, 0, 2.6] } });
}
CLIPS.champCart = () => {
  const kf = [...champStart(), K(0.12, VUP(-8, 7, { yaw: 0, roll: -90, fL: [-7, 0], fR: [-9, 0], hL: { b: [4.4, 0, -2.6] }, hR: { b: [4.4, 0, 2.6] } }), KNEEL(9.5, -1), [0, 14], { r: REF1() })];
  for (let i = 1; i <= 8; i++) kf.push(wheel(0.12 + i * 0.075, i * 45, -8 + i * 1.3));
  // (yaw 0, roll -90) faces the crowd exactly like (yaw 90, roll 0), so the finish stays in the wheel's representation (no spin when blending)
  const up = (y, k) => VUP(2.4, y, { yaw: 0, roll: -90, lean: 360, fL: [3.4, 0], fR: [1.4, 0], ...k });
  kf.push(K(1, up(7.25)));
  return { n: 30, dur: 2.4, noHg: true, cam: [0, 14], kf, loopDur: 0.9, loop: [{ a: up(7.25), o: KNEEL(9.5, -1), r: REF1() }, { a: up(7.6, { hL: { b: [4.7, 0.9, -1.6] }, hR: { b: [4.7, 0.9, 1.6] } }), o: KNEEL(9.5, -1), r: REF1() }] };
};
// pulls off his ankle band and throws it high in the air
CLIPS.champToss = () => {
  const x = -4.6, band = { f: 'a', j: 'haL' }, nb = { nb: 1 };
  const kf = [...champStart(),
    K(0.12, UP(x, 1, { yaw: 90, fL: [x + 0.8, 0], fR: [x - 0.8, 0] }), KNEEL(7, -1), [0, 14], { r: REF1() }),
    K(0.24, { p: [x, 5.6], yaw: 90, lean: 58, fL: [x + 0.9, 0, -0.4], fR: [x - 0.9, 0, 0.6], hL: { s: 'ftL', d: [0, 0.6, 0.2] }, hR: { s: 'knR', d: [0, 0.6, 0.4] } }),
    K(0.34, { p: [x, 5.8], yaw: 90, lean: 52, fL: [x + 0.9, 0, -0.4], fR: [x - 0.9, 0, 0.6], hL: { s: 'ftL', d: [0, 1.4, 0.4] }, hR: { s: 'knR', d: [0, 0.6, 0.4] }, ...nb }, null, null, { pr: band }),
    K(0.46, UP(x, 1, { yaw: 90, lean: -4, fL: [x + 0.9, 0], fR: [x - 0.9, 0], hL: { b: [-2.6, -1.8, -2.4] }, hR: { b: [-2.4, 0.6, 1.2] }, ...nb }), null, null, { pr: band }),
    K(0.56, UP(x, 1, { yaw: 90, lean: -8, p: [x, 7.4], fL: [x + 0.9, 0], fR: [x - 0.9, 0], hL: { b: [5, 0.8, -1.2] }, hR: { b: [-2.2, 0.8, 1.4] }, ...nb }), null, null, { pr: band }),
    K(0.66, VUP(x, 7.25, { lean: -6, ...nb }), null, null, { pr: [x + 1.2, 17, 0.6] }),
    K(0.8, VUP(x, 7.6, { lean: -10, hL: { b: [4.7, 0.9, -1.6] }, hR: { b: [4.7, 0.9, 1.6] }, ...nb }), null, null, { pr: [x + 2.4, 25, 1] }),
    K(0.9, VUP(x, 7.25, { lean: -6, ...nb }), null, null, { pr: [x + 3.2, 13, 1.4] }),
    K(1, VUP(x, 7.25, nb), null, null, { pr: [x + 3.8, 0.4, 1.8] })];
  return { n: 30, dur: 2.4, noHg: true, cam: [0, 14], kf, loopDur: 0.9, loop: [{ a: VUP(x, 7.25, nb), o: KNEEL(7, -1), r: REF1() }, { a: VUP(x, 7.6, { ...nb, hL: { b: [4.7, 0.9, -1.6] }, hR: { b: [4.7, 0.9, 1.6] } }), o: KNEEL(7, -1), r: REF1() }] };
};

// hip throw (headlock / arm throw / lateral drop / fireman's carry): step in, turn the back, load him on the hip, over he goes, legs above the thrower's head
function throwClip(grab, low) {
  const dy = low ? -2.2 : 0;
  const land = { p: [1.8, 2.6], yaw: 180, lean: 74, fL: [5.4, 0.3], fR: [6, 0.3], hR: grab, hL: { o: 'chest' } };
  return { pin: true, n: 14, dur: 0.92, kf: [
    K(0, S(XA, 1), S(XO, -1), N),
    K(0.14, { p: [-1.6, 6.4], lean: 12, fL: [0.6, 0], fR: [-3, 0], hR: grab, hL: { o: 'elR' } }, S(4.2, -1, { lean: 22, p: [4.2, 6.2] })),
    K(0.3, { p: [2.2, 5 + dy * 0.8], yaw: 180, lean: 52, fL: low ? [4.6, 0.3] : [1.2, 0], fR: low ? [5, 0.3] : [3.2, 0], hR: grab, hL: { o: 'elR' } },
      { p: [4.8, 6.7 + dy * 0.5], f: -1, lean: 50, fL: [6.2, 0], fR: [7.2, 0], hL: { o: 'belly', d: [0, 1, 0] }, hR: { r: [2, -2] } }),
    K(0.48, { p: [2, 4.6 + dy * 0.8], yaw: 180, lean: 72, fL: low ? [4.6, 0.3] : [1.2, 0], fR: low ? [5, 0.3] : [3.2, 0], hR: grab, hL: { o: 'elR' } },
      { p: [1.2, 11 + dy], f: -1, lean: 150, fL: { b: [-7.2, 0.4, 0] }, fR: { b: [-6.8, 1.6, 0] }, hL: { r: [1, -2] }, hR: { b: [1.6, 2, 0] } }, N),
    K(0.66, land, { p: [-3.5, 2.3], f: -1, lean: 255, fL: { b: [-6, 2.6, 0] }, fR: { b: [-6.6, 1, 0] }, hL: { b: [0.6, 2.4, 0] }, hR: { b: [1.6, 2, 0] } }, [12, 20], { a2: { ...alt(land), roll: -180 } }),
    // he finishes sitting out on his hip beside the head, chest across the other man's chest, legs sprawled the opposite way
    K(1, { p: [4.2, 1.5], z: 1.4, yaw: 360, lean: -30, roll: -100, fL: [11.4, 0.3, 0.2], fR: [10.6, 0.4, 2.8], hR: grab, hL: { o: 'chest', d: [0, 0.6, 0] } },
      { p: [-3.5, 1.3], f: -1, lean: 268, fL: { b: [-4.8, 3.8, 0] }, fR: { b: [-6.8, 0.8, 0] }, hL: { b: [0.4, 0.6, -2.4] }, hR: { b: [1.4, 1.4, 0] } }, [35, 28])] };
}
// scramble: in on a leg, the defender dives over the top and the two roll right through before coming apart
function roll() {
  const C = b => [3.4, 3.2 + 2.6 * Math.sin(b * D / 2) ** 2], rot = (v, b) => [v[0] * Math.cos(b * D) + v[1] * Math.sin(b * D), -v[0] * Math.sin(b * D) + v[1] * Math.cos(b * D)];
  const at = (b, t) => { const c = C(b), ra = rot([-1.5, 0.2], b), ro = rot([2.2, 2.4], b);
    return K(t, { p: [c[0] + ra[0], c[1] + ra[1]], lean: 62 + b, fL: { b: [-3, 3.2, 0] }, fR: { b: [-4.6, 2.4, 0] }, hL: { o: 'knL' }, hR: { o: 'hip' } },
      { p: [c[0] + ro[0], c[1] + ro[1]], f: -1, lean: 56 - b, fL: { b: [-5, 3, 0] }, fR: { b: [-6.4, 1.6, 0] }, hL: { o: 'ftR' }, hR: { o: 'belly' } }, N); };
  const last = at(360, 0.62), n = P => ({ ...P, lean: P.lean - 360 }), m = P => ({ ...P, lean: P.lean + 360 });
  return [K(0, S(XA, 1), S(XO, -1), N), K(0.1, SHOT(), S(XO, -1)), at(0, 0.2), at(90, 0.3), at(180, 0.41), at(270, 0.52), { ...last, a2: n(last.a), o2: m(last.o) }];
}

// ---------- clip -> frames ----------
const cache = {};
function getClip(name) {
  if (cache[name]) return cache[name];
  const c = (CLIPS[name] || CLIPS.idleN)(), kf = (c.kf || []).map(k => ({ ...k }));
  let cam = N, prev = {};
  for (const k of kf) {
    for (const f of ['a', 'o', 'r']) { if (k[f]) k[f] = norm(k[f]); else if (prev[f]) k[f] = prev[f]; if (k[f + '2']) k[f + '2'] = norm(k[f + '2']); if (k[f]) prev[f] = k[f + '2'] || k[f]; }
    cam = k.cam = k.cam || cam;
  }
  c.kf = kf; c.n = c.n || 12; c.dur = c.dur || 0.85;
  if (c.loop) c.loop = c.loop.map(l => Object.fromEntries(Object.entries(l).map(([f, P]) => [f, f[0] === '_' ? P : norm(P)])));
  return cache[name] = c;
}
function sample(c, t) {   // -> { figs: {name: interpolated pose}, cam }
  const kf = c.kf; let i = 0;
  while (i < kf.length - 2 && t > kf[i + 1].t) i++;
  const A = kf[i], B = kf[i + 1], s = Math.max(0, Math.min(1, (t - A.t) / Math.max(1e-6, B.t - A.t))), figs = {};
  for (const f of ['a', 'o', 'r']) if (B[f]) figs[f] = lerpPose(A[f + '2'] || A[f], B[f], s);
  const out = { figs, cam: [mix(A.cam[0], B.cam[0], s), mix(A.cam[1], B.cam[1], s)] };
  if (A.pr || B.pr) out.pr = [A.pr || B.pr, B.pr || A.pr, s];   // keyframe prop: [x, y, z] or a joint { f: 'a', j: 'haL' }
  return out;
}
function propAt(all, pr, cols, spin = 0) {
  if (!pr) return null;
  const at = q => (Array.isArray(q) ? [q[0], q[1], q[2] || 0] : add((all[q.f] || {})[q.j] || [0, 0, 0], q.d || [0, 0, 0]));
  return { p: mix3(at(pr[0]), at(pr[1]), pr[2]), c: (cols.band && cols.band.a) || '#e5534b', rot: spin };
}
const FIGS = ['a', 'o', 'r'];
// ---- turning the whole pair (2026-11-12) ----
// Clips are authored along a straight line; on top of that the pair can be turned about the vertical axis through a pivot. A move can 'cut the
// corner' (TURN_DEG: degrees it turns while it finishes, in the window TURN_WIN), and the orientation it ends in carries into the next event
// (orientAt), so the wrestlers move round the circle instead of always resetting to the same line. The rotation is applied to the SOLVED
// joints, so it is exact and costs nothing in the authoring.
export const TURN_DEG = { double: 70, single: 60, highc: 60, ankle: 55, trip: 50, scr: 50, lift: 40, sweep: 30, standup: 40, sitout: 40, granby: 30, letup: 30, sprawl: 35, whizzer: 35, hipout: 45, matret: 30, breakdown: 15 };
const TURN_WIN = [0.42, 0.95];
const MAT_END = { double: 1, single: 1, highc: 1, ankle: 1, trip: 1, scr: 1, lift: 1, sweep: 1, matret: 1, breakdown: 1 };   // moves that finish on the mat
const DIRS = ['F', 'Z', 'u', 'fr', 'lat'];
function rotAll(all, ang, cx, cz = 0) {
  if (!ang) return all;
  const a = ang * D, c = Math.cos(a), s = Math.sin(a);
  for (const n in all) { const J = all[n]; for (const k in J) { const v = J[k]; if (!Array.isArray(v) || v.length !== 3) continue;
    if (DIRS.includes(k)) J[k] = [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c];
    else { const x = v[0] - cx, z = v[2] - cz; J[k] = [cx + x * c - z * s, v[1], cz + x * s + z * c]; } } }
  return all;
}
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function pivotOf(c) {   // midpoint of the two hips in the clip's final pose
  const L = c.kf.length ? c.kf[c.kf.length - 1] : c.loop && c.loop[0]; if (!L) return [0, 0];
  const A = L.a2 || L.a, B = L.o2 || L.o; return A && B ? [(A.p[0] + B.p[0]) / 2, ((A.z || 0) + (B.z || 0)) / 2] : [0, 0];
}
const turnAt = (tn, t) => tn.h + tn.d * ease((t - TURN_WIN[0]) / (TURN_WIN[1] - TURN_WIN[0]));
const still = (set, cam, cols, tn) => { const all = solve(Object.fromEntries(FIGS.filter(f => set[f]).map(f => [f, lerpPose(set[f], set[f], 1)]))); if (tn) rotAll(all, tn.h + tn.d, tn.px, tn.pz); return drawFrame(all, cam, cols, set._pr ? propAt(all, [set._pr, set._pr, 0], cols, 20) : null); };
function loopSets(c) {   // the poses the clip settles into: given explicitly, or the last keyframe plus a slightly lower copy of it ("breathing"; a harder squeeze for pins)
  const L = c.kf[c.kf.length - 1];
  if (c.loop) return L && L.pr ? c.loop.map(s => ({ ...s, _pr: L.pr })) : c.loop;
  const set = {}, set2 = {};
  for (const f of FIGS) if (L[f]) { const P = L[f + '2'] || L[f]; set[f] = P; set2[f] = { ...P, p: [P.p[0], P.p[1] - (c.pin && f === 'a' ? 0.5 : P.p[1] > 2.2 ? 0.25 : 0)], lean: P.lean + (P.p[1] > 2.2 ? 2 : 0) }; }
  if (L.pr) set._pr = set2._pr = L.pr;
  return [set, set2];
}
function frames(name, cols, camO, tn) {   // tn = { h: orientation at the start, d: turn during the move, px, pz: pivot } in clip coordinates
  const c = getClip(name), out = [], n = c.kf.length ? c.n : 1, endCam = camO || c.cam || (c.kf.length ? c.kf[c.kf.length - 1].cam : N);
  for (let i = 0; i < n - 1; i++) { const t = i / (n - 1), s = sample(c, t), all = solve(s.figs); if (tn) rotAll(all, turnAt(tn, t), tn.px, tn.pz); out.push(drawFrame(all, s.cam, cols, propAt(all, s.pr, cols, i * 47))); }
  return { c, seq: out, loop: loopSets(c).map(set => still(set, endCam, cols, tn)) };
}

// which clip an event plays, and which wrestler is its 'a' figure
const TD = { double: 1, single: 1, highc: 1, ankle: 1, snap: 1, duck: 1, scr: 1, counter: 1, sweep: 1, trip: 1 }, THROW = { headlock: 1, armthrow: 1, lateral: 1, fireman: 1, lift: 1 };
const TURN = { half: 1, cradle: 1, tilt: 1, turk: 1, armbar: 1, wing: 1 }, STUFF = { sprawl: 1, handfight: 1, hipout: 1, whizzer: 1, oob: 1, throw: 1 }, RIDE = { breakdown: 1, matret: 1, hips: 1, flat: 1 };
const HAND = { club: 1, wrist: 1, elbow: 1, ties: 1, circle: 1 };
const other = s => (s === 'A' ? 'B' : 'A');
// Which side of the mat the pair is on when event i starts: every 'circle' clip ends with the two swapped, so from then on every clip
// (takedowns, mat work, escapes) is shown mirrored until they circle back; a period break resets it (they walk back to the centre).
export function flipAt(log, i) { return orientAt(log, i).flip; }
// Orientation of the pair when event i starts, in screen terms: { flip (on the other side of the mat), h (degrees turned), cut (+1 / -1 / 0:
// which way event i's move turns) }. A move cuts back toward the straight line once the pair is turned more than 15 deg, else alternates.
// Beyond +-90 deg the turn is handed to the mirrored side (flip) so h stays within +-90. Period breaks reset everything; the hand raise is
// always shown straight.
const MIRROR = (side, c, f) => (((side === 'B') !== !!c.aBottom) !== !!f ? -1 : 1);
export function orientAt(log, i) {
  let h = 0, f = 0;
  for (let k = 0; k < log.length; k++) {
    const e = log[k];
    if (e.fx === 'break' || e.type === 'end') { h = 0; f = 0; }
    const [name, side] = clipFor({ winner: 'A' }, e), deg = TURN_DEG[name] || 0;
    // pick the way the move cuts so it FINISHES at a readable angle: on the mat (camera already looking from the side) roughly -75..+25 deg in
    // the clip's own frame, standing +-60; when both ways read fine, alternate
    let cut = 0;
    if (deg) {
      const m = MIRROR(side, getClip(name), f), onMat = MAT_END[name], ctr = onMat ? -25 : 0, wid = onMat ? 50 : 60;
      const end = cu => (h + cu * deg) * m, ok = cu => Math.abs(end(cu) - ctr) <= wid, pref = k % 2 ? 1 : -1;
      cut = ok(pref) ? pref : ok(-pref) ? -pref : Math.abs(end(1) - ctr) < Math.abs(end(-1) - ctr) ? 1 : -1;
    }
    if (k === i) return { flip: !!f, h, cut };
    if (e.fx === 'hand' && e.mv === 'circle') f ^= 1;
    h += cut * deg;
    if (h > 90) { h -= 180; f ^= 1; } else if (h < -90) { h += 180; f ^= 1; }
  }
  return { flip: !!f, h, cut: 0 };
}
export function clipFor(res, last) {
  if (!last) return ['idleN', 'A'];
  const { pos, fx, who, mv } = last, top = pos === 'topA' ? 'A' : pos === 'topB' ? 'B' : null;
  if (last.type === 'end') return ['end', res.winner || 'A'];
  if (fx === 'break') return ['brk', 'A'];
  if (fx === 'td' && who) return [TD[mv] || THROW[mv] ? mv : 'double', who];
  if ((fx === 'nf' || fx === 'fall') && who) return [THROW[mv] || TURN[mv] ? mv : /takedown plus|hits/.test(last.text || '') ? 'headlock' : 'half', who];
  if (fx === 'esc' && who) return [mv === 'sitout' || mv === 'letup' || mv === 'granby' ? mv : 'standup', who];
  if (fx === 'rev' && who) return ['rev', who];
  if (fx === 'stuff' && who) return [STUFF[mv] ? mv : 'sprawl', who];
  if (fx === 'scramble' && who) return ['scramble', who];
  if (fx === 'hand' && !top) return [HAND[mv] ? mv : 'idleN', who || 'A'];
  if (fx === 'stall' && who && !top) return ['stall', who];
  if (fx === 'ride' && top) return [RIDE[mv] ? mv : 'idleT', top];
  return top ? ['idleT', top] : ['idleN', 'A'];
}

const LABEL = { td: 'TAKEDOWN!', esc: 'ESCAPE', rev: 'REVERSAL!', nf: 'NEAR FALL!', fall: 'FALL!', stall: 'STALLING', scramble: 'SCRAMBLE' };
const MOVE = { headlock: 'HEADLOCK', armthrow: 'ARM THROW', lateral: 'LATERAL DROP', fireman: "FIREMAN'S CARRY", lift: 'BIG LIFT', cradle: 'CRADLE', tilt: 'TILT', wing: 'CHICKEN WING', armbar: 'ARM BAR', half: 'HALF NELSON', turk: 'TURK',
  club: 'HEAD CLUB', wrist: 'WRIST CONTROL', elbow: 'ELBOW PASS', ties: 'COLLAR TIES', matret: 'MAT RETURN', counter: 'COUNTER', duck: 'DUCK-UNDER', granby: 'GRANBY ROLL', switch: 'SWITCH', ankle: 'ANKLE PICK', snap: 'GO-BEHIND', scr: 'SCRAMBLE', sweep: 'SWEEP SINGLE', trip: 'SINGLE LEG TRIP' };
const CHAMP = ['champJump', 'champCart', 'champToss'];

// opt.still (0..1): draw one frozen moment of the clip (used by test pages); opt.clip / opt.a: force a clip
export function stage(res, last, col, opt = {}) {
  const fx = last ? last.fx : null, who = last ? last.who : null, end = last && last.type === 'end';
  let [name, aSide] = opt.clip ? [opt.clip, opt.a || 'A'] : clipFor(res, last);
  const champ = !opt.clip && end && opt.champ;   // NCAA title: one of three celebrations instead of the plain hand raise
  if (champ) name = CHAMP[((res.seed >>> 0) % 7919) % CHAMP.length];
  if (!CLIPS[name]) name = 'idleN';
  const cols = { a: col[aSide], o: col[other(aSide)], r: '#1d2126', band: opt.band ? { a: opt.band[aSide], o: opt.band[other(aSide)] } : null };
  const c0 = getClip(name); if (c0.noHg) cols.noHg = true;
  // opt.orient = { flip, h, cut } (orientAt) or opt.flip alone: which side of the mat, how far the pair is turned, which way this move cuts
  const ori = opt.orient || { flip: !!opt.flip, h: 0, cut: 0 }, mirror = MIRROR(aSide, c0, ori.flip);
  const [px, pz] = pivotOf(c0), straight = end || c0.noHg;   // a mirrored clip turns the other way round in its own coordinates
  const tn = straight ? null : { h: (ori.h || 0) * mirror, d: (ori.cut || 0) * (TURN_DEG[name] || 0) * mirror, px, pz };
  const { c, seq, loop } = frames(name, cols, opt.cam, tn);
  let body;
  if (opt.still !== undefined) {
    const s = c.kf.length ? sample(c, opt.still) : null;
    body = s && opt.still < 1 ? (all => drawFrame(all, opt.cam || s.cam, cols, propAt(all, s.pr, cols)))(tn ? rotAll(solve(s.figs), turnAt(tn, opt.still), px, pz) : solve(s.figs)) : loop[s ? (opt.still > 1 ? 1 : 0) : Math.min(loop.length - 1, Math.floor(opt.still * loop.length))];
  } else {
    const n = seq.length, slot = n ? c.dur / n : 0, ld = c.loopDur || (c.pin ? 0.7 : 1.3), cs = x => `calc(${+x.toFixed(3)}s * var(--spd, 1))`;
    body = seq.map((f, i) => `<g class="fr" style="animation-delay:${cs(i * slot)};animation-duration:${cs(slot)}">${f}</g>`).join('')
      + `<g class="fr last" style="animation-delay:${cs(n * slot)};animation-duration:${cs(0.05)}">${loop.map((f, j) => `<g class="lp lp${loop.length}" style="animation-duration:${cs(ld)};animation-delay:${cs(-j * ld / loop.length)}">${f}</g>`).join('')}</g>`;
  }
  let label = fx ? LABEL[fx] || '' : '';
  const mvName = last && MOVE[last.mv];
  if (fx === 'nf') { const m = (last.text || '').match(/(\d) points/); label = m ? 'NEAR FALL +' + m[1] : label; if (/takedown plus/.test(last.text || '')) label = 'TD + NEAR FALL'; }
  if (mvName) label = label ? `${mvName} · ${label}` : mvName;
  const lblCol = fx && who ? col[who] : '#f5b942';
  const endTxt = end ? `${res.wrestlers[res.winner].name.split(' ').slice(-1)[0].toUpperCase()}${champ ? ' · NCAA CHAMPION!' : ` WINS${res.method === 'Fall' ? ' BY FALL' : ''}`}` : '';
  return `<svg class="stage" viewBox="0 -14 200 106" preserveAspectRatio="xMidYMid meet">
    <ellipse cx="100" cy="${GY + 2}" rx="99" ry="15" fill="#1c3b2c"/><ellipse cx="100" cy="${GY + 2}" rx="93" ry="12.5" fill="none" stroke="#2c5a43" stroke-width="1.5"/><ellipse cx="100" cy="${GY + 2}" rx="26" ry="4" fill="none" stroke="#2c5a43" stroke-width="1.5"/>
    <g transform="translate(100,${GY}) scale(${mirror},1)" fill="none" stroke-linecap="round">${body}</g>
    ${label && !end ? `<text class="lbl ${fx}" x="100" y="-3" text-anchor="middle" fill="${lblCol}"${label.length > 24 ? ' style="font-size:8px;letter-spacing:.5px"' : ''}>${label}</text>` : ''}
    ${endTxt ? `<text class="lbl end" x="100" y="-3" text-anchor="middle" fill="#3fb27f">${endTxt}</text>` : ''}</svg>`;
}
export const CLIP_NAMES = Object.keys(CLIPS);

// team colour per side: the wrestler's school -> team id -> logo colour; avoid two near-identical singlets
export function singletColors(G, res, TEAM_COLORS) {
  const idOf = name => Object.keys(G.teams || {}).find(id => G.teams[id].name === name);
  const get = (s, fb) => { const w = res.wrestlers[s], id = idOf(w.school); return (id && TEAM_COLORS[id]) || fb; };
  const A = get('A', '#4ea1ff'); let B = get('B', '#ff8a5c');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const d = rgb(A).reduce((s, v, i) => s + Math.abs(v - rgb(B)[i]), 0);
  if (d < 120) B = A === '#ffffff' ? '#ff8a5c' : '#e8e8e8';
  return { A, B };
}
