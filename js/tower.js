/* ==========================================================================
   TOWER GEOMETRY — after Schöffer, La Tour Lumière Cybernétique (1973),
   pp. 26–27 (inventory) and Annexe 7 (structure, p. 125).
   Units: metres. y up, +x east, -z north. Level 0 = top of the socle.
   ========================================================================== */
const TOWER = (function () {
  'use strict';
  // seeded PRNG (mulberry32) so the tower is the same on every load
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const H = 307;                                   // ossature height (p. 26)
  const LEVELS = [0, 20, 35, 59, 78, 92, 118, 144, 165, 201, 236, 272, 307]; // 13 planes (p. 125)
  const PLATFORMS = [92, 144, 236, 272, 307];      // platform loads listed p. 126
  const COLOURS = ['bleu', 'rouge', 'jaune', 'orange', 'violet', 'blanc'];
  const RGB = {
    bleu: [0.22, 0.42, 1.0], rouge: [1.0, 0.12, 0.10], jaune: [1.0, 0.86, 0.18],
    orange: [1.0, 0.50, 0.08], violet: [0.62, 0.22, 1.0], blanc: [1.0, 0.97, 0.92]
  };
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];  // E, S, W, N (four orthogonal directions)
  const DIRNAME = ['E', 'S', 'O', 'N'];

  function build(seed) {
    const R = rng(seed || 1973);
    const members = [];   // {a:[x,y,z], b:[x,y,z], w}
    const arms = [];      // horizontal arms: {o:[x,y,z], d:dirIndex, len, tip:[x,y,z]}
    const organs = [];    // controllable parameters
    const axes = [];      // vertical rotating axes
    const curved = [];    // 14 fixed curved mirrors
    const smoke = [];     // smoke-bomb emitters (gaz fumigènes)
    const beacons = [];   // aviation lamps (signalisation aérienne)

    // ==== TRACED from "Façade et circulation verticale", p. 132 (Façade 2 / Section 6).
    // Scale read off the platforms: 0.232 m per drawing unit; platforms fall at 91, 142, 231, 267, 300 m
    // against 92, 144, 236, 272, 307 m in Annex 7. Core 36 m (façade 2, along x) × 23 m (section 6, along z).
    const CX = 18, CZ = 11.5;
    // [height m, reach toward −axis, reach toward +axis] measured from the core's centre line
    const FACADE = [[273, 26, 38], [254, 26, 37], [240, 38, 37], [228, 38, 29], [212, 32, 35], [195, 32, 35], [170, 35, 0], [159, 35, 31], [143, 21, 30], [132, 21, 31], [106, 0, 35], [89, 0, 35]];
    const SECTION = [[300, 25, 0], [260, 29, 31], [242, 29, 31], [231, 24, 21], [224, 29, 21], [200, 34, 19], [192, 34, 19], [161, 20, 26], [141, 20, 25], [108, 0, 19], [90, 0, 19]];
    const posts = [];
    [-CX, 3, CX].forEach(x => [-CZ, -2.3, CZ].forEach(z => posts.push([x, z])));
    posts.forEach(p => members.push({ a: [p[0], 0, p[1]], b: [p[0], H, p[1]], w: 2 }));
    // the wider frame of the lower 76 m (façade 2: bays at 18, 33, 58, 76 m)
    [[-25, -CZ], [-25, CZ], [32, -CZ], [32, CZ]].forEach(p => members.push({ a: [p[0], 0, p[1]], b: [p[0], p[0] < 0 ? 76 : 62, p[1]], w: 2 }));
    [18, 33, 58].forEach(y => [-CZ, CZ].forEach(z => members.push({ a: [-25, y, z], b: [32, y, z], w: 1.6 })));
    [-CZ, CZ].forEach(z => members.push({ a: [-25, 76, z], b: [CX, 76, z], w: 1.6 }));
    // 13 horizontal planes around the core
    LEVELS.forEach(y => {
      [-CZ, CZ].forEach(z => members.push({ a: [-CX, y, z], b: [CX, y, z], w: 1.6 }));
      [-CX, CX].forEach(x => members.push({ a: [x, y, -CZ], b: [x, y, CZ], w: 1.6 }));
    });
    // lift shaft (right bay of façade 2) with its rungs
    for (let y = 8; y < H; y += 7.5) [-CZ, CZ].forEach(z => members.push({ a: [3, y, z], b: [CX, y, z], w: 0.6 }));
    // lift housing above platform 5
    members.push({ a: [6, H, -6], b: [6, H + 14, -6], w: 3 }); members.push({ a: [14, H, 6], b: [14, H + 10, 6], w: 3 });

    // envelope per direction (E=+x, S=+z, W=−x, N=−z), interpolated from the traced arms
    const env = [FACADE.map(r => [r[0], r[2]]), SECTION.map(r => [r[0], r[2]]), FACADE.map(r => [r[0], r[1]]), SECTION.map(r => [r[0], r[1]])];
    function reach(d, y) {
      const pts = env[d].filter(p => p[1] > 0).sort((a, b) => a[0] - b[0]);
      const core = d % 2 ? CZ : CX;
      if (!pts.length) return core + 6;
      let best = pts[0], bd = 1e9; pts.forEach(p => { const dd = Math.abs(p[0] - y); if (dd < bd) { bd = dd; best = p; } });
      const fall = Math.max(0, 1 - bd / 40);
      return core + 4 + (best[1] - core - 4) * fall;
    }
    function addArm(d, y, len, along, traced) {
      const dx = DIRS[d][0], dz = DIRS[d][1];
      const o = [dx ? dx * CX : along, y, dz ? dz * CZ : along];
      const tip = [o[0] + dx * len, y, o[2] + dz * len];
      arms.push({ o, d, len, tip, y, traced });
      members.push({ a: dx ? [-dx * CX, y, along] : [along, y, -dz * CZ], b: tip, w: 1.6 }); // beam runs through the core
    }
    // the traced arms: façade arms lie on the front or back face, section arms on the east or west face
    FACADE.forEach(([y, l, r], k) => { const z = k % 2 ? CZ : -CZ; if (r) addArm(0, y, r - CX, z, true); if (l) addArm(2, y, l - CX, z, true); });
    SECTION.forEach(([y, l, r], k) => { const x = k % 2 ? CX : -CX; if (r) addArm(1, y, r - CZ, x, true); if (l) addArm(3, y, l - CZ, x, true); });
    // the remaining arms of the 200 (p. 26) within the traced envelope; the sheet shows only those in its plane
    let tries = 0;
    while (arms.length < 200 && tries < 20000) {
      tries++;
      const y = 80 + R() * (H - 82);
      const d = Math.floor(R() * 4); const core = d % 2 ? CZ : CX;
      const maxL = reach(d, y) - core; if (maxL < 3) continue;
      const len = 2 + R() * maxL;
      const span = d % 2 ? CX : CZ;
      const along = (R() * 2 - 1) * span;
      if (arms.some(A => A.d === d && Math.abs(A.y - y) < 3 && Math.abs((d % 2 ? A.o[0] : A.o[2]) - along) < 4)) continue;
      addArm(d, y, len, along, false);
    }

    // ---- 114 vertical rotating axes, first between the traced pairs of arms, 263 mirrors ----
    const speedGroups = ['lent', 'moyen', 'rapide'];
    function placeAxis(A, B) {
      const reachAB = Math.min(A.len, B.len); if (reachAB < 3) return false;
      const t = 1.5 + R() * (reachAB - 1.5);
      const dx = DIRS[A.d][0], dz = DIRS[A.d][1];
      const x = A.o[0] + dx * t + (dz ? (R() - 0.5) * 6 : 0), z = A.o[2] + dz * t + (dx ? (R() - 0.5) * 6 : 0);
      if (axes.some(q => Math.hypot(q.x - x, q.z - z) < 3.5 && q.y1 > A.y && q.y0 < B.y)) return false;
      axes.push({ x, z, y0: A.y, y1: B.y, d: A.d, speed: speedGroups[Math.floor(R() * 3)], mirrors: [] });
      return true;
    }
    const traced = arms.filter(a => a.traced);
    for (let i = 0; i < traced.length; i++) for (let j = 0; j < traced.length; j++) {
      const A = traced[i], B = traced[j];
      if (A.d !== B.d || B.y <= A.y || B.y - A.y > 26) continue;
      for (let k = 0; k < 3 && axes.length < 114; k++) placeAxis(A, B);
    }
    let axTries = 0;
    while (axes.length < 114 && axTries < 50000) {
      axTries++;
      const A = arms[Math.floor(R() * arms.length)], B = arms[Math.floor(R() * arms.length)];
      if (A.d !== B.d || B.y <= A.y + 5 || B.y - A.y > 30) continue;
      placeAxis(A, B);
    }
    let mirrorCount = 0;
    axes.forEach(ax => { ax.mirrors.push(null); mirrorCount++; });
    while (mirrorCount < 263) { const ax = axes[Math.floor(R() * axes.length)]; if (ax.mirrors.length < 4) { ax.mirrors.push(null); mirrorCount++; } }
    let biggestDone = false;
    axes.forEach(ax => {
      const n = ax.mirrors.length, span = ax.y1 - ax.y0;
      ax.mirrors = ax.mirrors.map((_, k) => {
        let area = Math.exp(Math.log(2) + R() * (Math.log(60) - Math.log(2)));
        if (!biggestDone && span > 18) { area = 150; biggestDone = true; }
        const hgt = Math.min(span / n * 0.9, Math.sqrt(area) * (0.9 + R() * 0.5));
        const wid = area / hgt;
        const yc = ax.y0 + span * (k + 0.5) / n;
        return { yc, w: Math.min(wid, 14), h: hgt, phase: R() * Math.PI * 2 };
      });
      members.push({ a: [ax.x, ax.y0, ax.z], b: [ax.x, ax.y1, ax.z], w: 0.5 });
    });

    // ---- 14 curved mirrors near the theoretical central axis (p. 26) ----
    for (let i = 0; i < 14; i++) {
      const y = 30 + (H - 50) * (i + R() * 0.8) / 14;
      const ang = R() * Math.PI * 2, r = 2 + R() * 10;
      curved.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, y, rad: 4 + R() * 6, h: 6 + R() * 10, rot: R() * Math.PI * 2 });
    }

    // ---- light organs ----
    // helper: random point on a random member, weighted by length, biased toward arms
    const armMembers = members.filter(m => m.w === 1.6);
    function pointOnStructure(preferArms) {
      const pool = preferArms && R() < 0.75 ? armMembers : members;
      const m = pool[Math.floor(R() * pool.length)];
      const t = R();
      return [m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t, m.a[2] + (m.b[2] - m.a[2]) * t];
    }
    function dirOf(p) { // which of the four directions this point faces most
      if (Math.abs(p[0]) > Math.abs(p[2])) return p[0] > 0 ? 0 : 2;
      return p[2] > 0 ? 1 : 3;
    }
    function add(type, fam, p, extra) {
      organs.push(Object.assign({ id: organs.length, type, fam, p, h: Math.max(0, Math.min(1, p[1] / H)), d: dirOf(p) }, extra || {}));
    }
    // 2,250 medium-power spotlights with coloured devices (p. 26); about 600 with trichrome shutters (p. 28; Annexe 2)
    for (let i = 0; i < 2250; i++) {
      const p = pointOnStructure(true);
      const col = COLOURS[i % 6];
      if (i < 600) {
        const trio = [COLOURS[(i) % 6], COLOURS[(i + 2) % 6], COLOURS[(i + 4) % 6]];
        add(4, 'obt', p, { colour: col, trio, motor: [300, 150, 100, 50, 25, 15][i % 6] });
      } else add(3, 'proj', p, { colour: col });
    }
    // 2,085 electronic flashes, 60 of them high-powered, plus one 10 MW laser flash at the summit (p. 26)
    for (let i = 0; i < 2084; i++) {
      const p = pointOnStructure(false);
      const big = i < 60;
      const col = big ? 'blanc' : (R() < 0.6 ? 'blanc' : COLOURS[Math.floor(R() * 6)]);
      add(2, 'flash', p, { colour: col, big });
    }
    add(2, 'flash', [0, H + 2, 0], { colour: 'blanc', big: true, laserFlash: true });
    // 40 marine projectors, 2 km beams; 9 at the summit (Annexe 2: "40 projecteurs Bréguet, dont 9 au sommet")
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * Math.PI * 2;
      const vertical = i < 3;
      const tilt = vertical ? 0.02 + i * 0.03 : 0.25 + R() * 0.35;
      add(5, 'marine', [Math.cos(ang) * 6, H + 1, Math.sin(ang) * 6], {
        colour: 'blanc', aim: [Math.cos(ang) * Math.sin(tilt), Math.cos(tilt), Math.sin(ang) * Math.sin(tilt)], summit: true
      });
    }
    const tipArms = arms.slice().sort((a, b) => b.len - a.len).slice(0, 31);
    tipArms.forEach((A, i) => {
      const dx = DIRS[A.d][0], dz = DIRS[A.d][1];
      const el = -0.05 + R() * 0.55, sw = (R() - 0.5) * 0.9;
      const ax = dx * Math.cos(sw) - dz * Math.sin(sw), az = dz * Math.cos(sw) + dx * Math.sin(sw);
      add(6, 'marine', A.tip.slice(), { colour: COLOURS[i % 6], aim: [ax * Math.cos(el), Math.sin(el), az * Math.cos(el)], summit: false });
    });
    // 24 lasers whose rays are sent back, multiplied, by the fixed and rotating mirrors (p. 27)
    for (let i = 0; i < 24; i++) {
      const ax = axes[Math.floor(R() * axes.length)];
      const m = ax.mirrors[Math.floor(R() * ax.mirrors.length)];
      const src = pointOnStructure(false);
      add(7, 'laser', src, { colour: ['rouge', 'bleu', 'violet', 'blanc'][i % 4], target: { ax: axes.indexOf(ax), mi: ax.mirrors.indexOf(m) } });
    }
    // 263 mirrors as organs (type 1), one per mirror, sharing the axis motor
    axes.forEach((ax, ai) => ax.mirrors.forEach((m, mi) => {
      add(1, 'miroir', [ax.x, m.yc, ax.z], { axis: ai, mi, speed: ax.speed });
    }));
    // smoke-bomb emitters distributed through the framework (p. 34); type 8
    for (let i = 0; i < 48; i++) add(8, 'fumee', pointOnStructure(false), {});
    // aviation lamps, outside the programme
    [[18, H, -11.5], [-18, H, 11.5], [18, H, 11.5], [-18, H, -11.5], [6, H + 15, -6], [18, 201, -11.5], [-18, 201, 11.5], [18, 118, 11.5], [-18, 118, -11.5]].forEach(p => beacons.push(p));

    return { CX, CZ, SOCLE: { top: 70, bottom: 40, h: 26 }, H, LEVELS, PLATFORMS, members, arms, axes, curved, organs, smoke, beacons, COLOURS, RGB, DIRS, DIRNAME };
  }
  return { build, rng, COLOURS, RGB };
})();
if (typeof module !== 'undefined') module.exports = TOWER;
