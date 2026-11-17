/* ==========================================================================
   PROGRAMME DU CALCULATEUR — Schöffer 1973, Appendix 5 (pp. 108–111) and
   the simulation of Appendix 6 (pp. 112–124), joined.

   §5.I    X_i = 1 if f(x_j) − K > 0, X_i = 0 otherwise; f = Σ_j A_ij x_j,
           A_ij "aléatoires ou nuls", K chosen for a given probability of
           functioning, "éventuellement aléatoire".
   §5.II   Organs divided into hundreds ("centaines"), each split at random
           into five classes; a random head number designates the function
           commanding the first class of the first hundred; numbering then runs
           on; groups numbered beyond p rest. Reassigned periodically.
   §5.III  For each X_i ≠ 0 a random time Y_i; θ_i = Y_i / N_i.
   §5.IV   A mode of operation (sub-programme, "50 environ") drawn at random;
           at time rθ the r-th organ is commanded. At t_i + Y_i, recompute X_i.
   Ann. 1  D = Σ A^j X_e^j over ten binary sensors: D ≤ 3 régime « bleu »,
           3 < D < 8 normal, D ≥ 8 « rouge »; when F_i > 0, a uniform draw on
           (0,1) below 0.60 / 0.75 / 0.90 validates the output. Organigramme:
           blue régime → red outputs B_i = max; red régime → blue outputs B_i = max.
   Ann. 3  Shutter projectors: désexcité off; normal on, motor off; excité on, motor on.
   Desc.   Cellule d'indifférence; perturbations accidentelles; night schedule;
           smoke; "langage conventionnel" (pp. 29, 34–35, 99–102, 115).
   ========================================================================== */
function makeProg(params) {
  'use strict';
  // "critères artistiques": everything Schöffer leaves open, gathered in one place
  const P0 = { label: 'A', Kmin: 0.6, Kspan: 0.35, onScale: 1, meanOff: 10, pq: 0.72, reassign: 300, law: 'gamma', sMin: 3, sMax: 7, capMode: 'intensité', quiet: false };
  const CR = Object.assign({}, P0, params || {});
  let T, organs, n, rand = Math.random;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  function gamma(k, mean) { // Marsaglia–Tsang, shape k ≥ 1, scaled to mean
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x, v; do { x = gauss(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rand();
      if (u < 1 - 0.0331 * x * x * x * x || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * mean / k; }
  }

  const TYPE_NAMES = { 1: 'Miroirs mobiles', 2: 'Flashes', 3: 'Petits projecteurs', 4: 'Petits projecteurs à obturateurs', 5: 'Gros projecteurs au sommet', 6: 'Gros projecteurs latéraux', 7: 'Les 24 lasers', 8: 'Gaz fumigènes' };
  const ORDERS = ['ascensionnel', 'descendant', 'du milieu vers les extrémités', 'des extrémités vers le milieu', 'de gauche à droite', 'de droite à gauche', 'd’avant en arrière', 'en zigzag', 'points épars', 'simultané'];
  const ENVS = ['progressif', 'dégressif', 'alterné', 'ponctuel', 'étale'];
  const MODES = []; ORDERS.forEach((o, oi) => ENVS.forEach((e, ei) => MODES.push({ id: MODES.length + 1, o: oi, e: ei, name: `${e}, ${o}` })));
  const MEAN_ON = { 1: 40, 2: 14, 3: 26, 4: 26, 5: 50, 6: 40, 7: 30, 8: 14 }; // artistic criteria (unspecified by Schöffer)
  const REGIME = { bleu: { seuil: 0.60, cap: 0.60 }, normal: { seuil: 0.75, cap: 0.75 }, rouge: { seuil: 0.90, cap: 0.90 } };
  const GATE = {
    bleu: { bleu: 1, blanc: 1, jaune: 1, orange: .3, violet: .3, rouge: 0 },
    normal: { bleu: 1, blanc: 1, jaune: 1, orange: 1, violet: 1, rouge: 1 },
    rouge: { rouge: 1, orange: 1, violet: 1, jaune: .55, blanc: .45, bleu: 0 }
  };

  const S = {                       // programme state (exposed for the interface)
    t: 0, lastTick: -1e9, tickN: 0, D: 0, regime: 'normal', regimeSince: 0, tau: 0.5,
    head: 1, p: 0, q: 0, groups: [], fns: [], centaines: [], lastReassign: 0,
    beads: [], abacus: { repetition: 0, saturation: 0, stagnation: 0, accident: 0 },
    hist: { act: [], D: [], bits: [], regime: [] },
    antagonist: null, vanish: null, lastVanish: -1e9, lastIndiff: -1e9, nextAccident: 0,
    special: null, night: false, shutdown: false, shutdownWindow: [0, 8], excitedSince: null,
    events: []
  };
  let OUT;                          // per-frame output buffers

  function init(tower, nInputs, rng) {
    T = tower; organs = tower.organs; n = nInputs; if (rng) rand = rng;
    // centaines: per programme-parameter type, organs ordered in space, cut into hundreds
    S.centaines = [];
    for (let type = 1; type <= 8; type++) {
      const list = organs.filter(o => o.type === type).sort((a, b) => a.h - b.h || a.d - b.d);
      for (let k = 0; k < list.length; k += 100) S.centaines.push({ type, organs: list.slice(k, k + 100) });
    }
    drawClasses();
    S.q = S.groups.length; S.p = Math.round(S.q * CR.pq);
    S.fns = []; for (let i = 0; i < S.p; i++) S.fns.push(newFunction(i));
    S.head = 1 + Math.floor(rand() * S.q);
    assign();
    OUT = {
      I: new Float32Array(organs.length), colour: new Uint8Array(organs.length).fill(255),
      axisSpeed: new Float32Array(tower.axes.length), axisDir: new Float32Array(tower.axes.length).fill(1),
      smoke: new Float32Array(organs.length), vanish: 0, beacons: 1
    };
    return S;
  }
  function drawClasses() {
    // "chacun de ces groupes sera réparti en cinq classes par tirage au sort (affectation d'un nombre aléatoire à chaque unité)"
    S.groups = [];
    S.centaines.forEach((c, ci) => {
      const ncls = Math.min(5, c.organs.length);
      const cls = Array.from({ length: ncls }, () => []);
      c.organs.forEach((o, k) => cls[k < ncls ? k : Math.floor(rand() * ncls)].push(o)); // first ncls seed each class
      cls.forEach((members, k) => S.groups.push({ gi: S.groups.length, type: c.type, centaine: ci + 1, cls: k + 1, organs: members, fn: -1 }));
    });
  }
  function newFunction(i) {
    const A = new Float32Array(n); drawA(A);
    return { i: i + 1, A, K: 0, Kk: CR.Kmin + rand() * CR.Kspan, X: 0, t0: -1e9, Y: 0, mode: MODES[0], theta: 1, ranks: null, group: null, f: 0, lively: false, evals: 0 };
  }
  function drawA(A) { // A_ij random or zero: each function is sensitive to a few inputs
    A.fill(0); const s = CR.sMin + Math.floor(rand() * (CR.sMax - CR.sMin + 1));
    for (let k = 0; k < s; k++) A[Math.floor(rand() * n)] = rand();
  }
  function assign() {
    // head number designates the function of the first class of the first hundred; numbering runs on
    S.groups.forEach(g => g.fn = -1); S.fns.forEach(f => f.group = null);
    S.groups.forEach((g, k) => {
      const num = ((S.head - 1 + k) % S.q) + 1;
      if (num <= S.p) { g.fn = num - 1; S.fns[num - 1].group = g; S.fns[num - 1].ranks = null; }
    });
  }
  function reassign(t, why) {
    // "en décalant périodiquement la liste des fonctions non utilisées … et en modifiant l'affectation à l'intérieur de groupes de 100"
    S.head = 1 + Math.floor(rand() * S.q);
    drawClasses(); assign(); S.lastReassign = t;
    event(t, `RÉAFFECTATION — tête de série ${S.head} · ${S.p} fonctions / ${S.q} groupes${why ? ' · ' + why : ''}`);
  }

  function event(t, s) { S.events.push({ t, s }); if (S.events.length > 300) S.events.shift(); if (!CR.quiet && typeof DATA !== 'undefined') DATA.say((CR.label !== 'A' ? `[${CR.label}] ` : '') + s.toUpperCase()); }

  // ---------------------------------------------------------------- per-tick (Δt = 5 s)
  function tick(t, x, bits, ctx, opts) {
    S.t = t; S.tickN++;
    // Annexe 1: excitation coefficient D and régime
    S.D = bits.reduce((s, b) => s + b, 0);
    const reg = S.D <= 3 ? 'bleu' : S.D >= 8 ? 'rouge' : 'normal';
    if (reg !== S.regime) { event(t, `RÉGIME ${reg.toUpperCase()} (D = ${S.D})`); S.regime = reg; S.regimeSince = t; }
    // remote environment gives the "tonalité générale"
    const remote = (opts.remoteIdx || []).map(j => x[j]);
    S.tau = remote.length ? remote.reduce((s, v) => s + v, 0) / remote.length : 0.5;
    // running means for K
    if (!S.mx) S.mx = Float32Array.from(x);
    for (let j = 0; j < n; j++) S.mx[j] = S.mx[j] * 0.97 + x[j] * 0.03;

    // day/night via photocells; shutdown window
    const P = opts.paris; const hm = P.h + P.mi / 60;
    S.night = opts.dusk;
    const [a, b] = opts.shutdownWindow || [0, 8];
    S.shutdown = hm >= a && hm < b;

    // periodic reassignment (period unstated by Schöffer; five minutes after Stener Jørgensen & Laplante-Anfossi)
    if (t - S.lastReassign >= CR.reassign * 1000) reassign(t);

    // perturbations accidentelles (Poisson process)
    if (!S.nextAccident) S.nextAccident = t + expo(240) * 1000;
    if (t >= S.nextAccident) {
      const f = S.fns[Math.floor(rand() * S.fns.length)];
      f.Kk *= 0.6 + rand() * 0.8; f.t0 = -1e9; S.abacus.accident++;
      S.beads.push({ t, kind: 'accident' });
      event(t, `PERTURBATION ACCIDENTELLE — fonction X${f.i}, seuil K × ${f.Kk.toFixed(2)}`);
      S.nextAccident = t + expo(240) * 1000;
    }

    // exceptional event: disappearance in smoke for ten minutes
    if (opts.manualSmoke || (opts.seismicI >= 3 && opts.seismicNew)) triggerVanish(t, opts.manualSmoke ? 'commande manuelle' : `séisme ressenti I≈${opts.seismicI.toFixed(1)}`);
    if (S.D >= 9 && S.tau >= 0.7) { S.excitedSince = S.excitedSince || t; if (t - S.excitedSince > 60000) triggerVanish(t, 'seuil d’excitation de la ville dépassé'); }
    else S.excitedSince = null;
    if (S.vanish && t > S.vanish.until) { event(t, 'RÉAPPARITION DE LA TOUR'); S.vanish = null; }

    // langage conventionnel: weather at 19:00 (autumn/winter) or 21:30 (spring/summer); traffic 17–20 h
    S.special = null;
    if (!S.shutdown && opts.language !== false) {
      const winter = P.mo >= 10 || P.mo <= 3; const wStart = winter ? 19 : 21.5;
      if (hm >= wStart && hm < wStart + 10 / 60) S.special = { kind: 'meteo', bad: ctx.forecast.bad, weekend: ctx.forecast.weekend != null };
      else if (hm >= 17 && hm < 20 && (P.mi % 15) < 3) S.special = { kind: 'circulation', quad: ctx.quadrantSat.slice() };
      if (S.special && (!S.lastSpecial || S.lastSpecial !== S.special.kind)) event(t, S.special.kind === 'meteo'
        ? `LANGAGE CONVENTIONNEL — PRÉVISION ${S.special.weekend ? 'DU WEEK-END' : 'DU LENDEMAIN'} : ${S.special.bad > .66 ? 'MAUVAIS TEMPS (ROUGE, MOUVEMENTS ACCÉLÉRÉS)' : S.special.bad < .33 ? 'BEAU TEMPS (BLEU, MOUVEMENTS LENTS)' : 'TEMPS INTERMÉDIAIRE'}`
        : `LANGAGE CONVENTIONNEL — DIRECTIONS SATURÉES / DÉGAGÉES (E ${pct(ctx.quadrantSat[0])} S ${pct(ctx.quadrantSat[1])} O ${pct(ctx.quadrantSat[2])} N ${pct(ctx.quadrantSat[3])})`);
      S.lastSpecial = S.special ? S.special.kind : null;
    } else S.lastSpecial = null;

    // §5: evaluate every function whose cycle has ended
    const R = REGIME[S.regime];
    S.fns.forEach(f => {
      if (!f.group) return;
      if (t < f.t0 + f.Y * 1000) return;
      evaluate(f, x, t, R);
    });

    // cellule d'indifférence: watch for repetition, saturation, stagnation
    const act = activeFraction(t);
    pushHist('act', act, 240); pushHist('D', S.D, 240); pushHist('bits', bits.slice(), 60); pushHist('regime', S.regime, 240);
    indifference(t);
    if (S.antagonist && t > S.antagonist.until) S.antagonist = null;
  }
  function pct(v) { return (v * 100).toFixed(0) + '%'; }
  function expo(mean) { return -Math.log(1 - rand()) * mean; }
  function pushHist(k, v, max) { S.hist[k].push(v); if (S.hist[k].length > max) S.hist[k].shift(); }

  function evaluate(f, x, t, R) {
    const g = f.group; f.evals++;
    let fx = 0; for (let j = 0; j < n; j++) fx += f.A[j] * x[j];
    f.xs = Float32Array.from(x); // the inputs as they stood when X_i was decided
    let mk = 0; for (let j = 0; j < n; j++) mk += f.A[j] * S.mx[j];
    // K "afin d'obtenir une probabilité de fonctionnement donnée", "éventuellement aléatoire";
    // lowered or raised by the remote environment's general tonality
    f.K = mk * f.Kk * (1 - 0.5 * (S.tau - 0.5)) * (1 + 0.04 * gauss());
    f.f = fx - f.K;
    // tirage orienté: if one of the composing x_j is high, the draw favours lively durations
    f.lively = false; for (let j = 0; j < n; j++) if (f.A[j] > 0 && x[j] > 0.85) f.lively = true;
    let on = f.f > 0; f.passed = on; f.u = null;
    if (on) { f.u = rand(); on = f.u < R.seuil; }                  // Annexe 1 validation draw
    if (g.type === 4 && S.regime === 'bleu') on = false;            // Annexe 3: shutter projectors off when désexcité
    f.X = on ? 1 : 0; f.t0 = t; f.seuil = R.seuil; f.reg = S.regime; S.lastEval = f;
    const mean = on ? MEAN_ON[g.type] * CR.onScale : CR.meanOff;
    const draw = CR.law === 'uniforme' ? mean * 2 * rand() : CR.law === 'exponentielle' ? expo(mean) : gamma(2.5, mean);
    f.Y = clamp(f.lively ? mean * (0.3 + 0.7 * rand()) : draw, 2, 180);
    f.theta = f.Y / Math.max(1, g.organs.length);                   // θ_i = Y_i / N_i
    if (on) {
      let m;
      do { m = MODES[Math.floor(rand() * MODES.length)]; } while (f.lively && (m.e === 1 || m.e === 4) && rand() < 0.6);
      f.mode = m; f.ranks = rankGroup(g, m.o);
    }
  }
  function rankGroup(g, o) {
    const L = g.organs.map((org, k) => ({ k, org }));
    const key = {
      0: a => a.org.h, 1: a => -a.org.h, 2: a => Math.abs(a.org.h - 0.5), 3: a => -Math.abs(a.org.h - 0.5),
      4: a => a.org.p[0], 5: a => -a.org.p[0], 6: a => a.org.p[2], 7: null, 8: () => rand(), 9: () => 0
    }[o];
    if (o === 7) { // zigzag: rows by height, alternate horizontal direction
      L.forEach(a => { const row = Math.floor(a.org.h * 24); a.v = row * 1000 + (row % 2 ? -a.org.p[0] : a.org.p[0]); });
    } else L.forEach(a => a.v = key(a));
    L.sort((a, b) => a.v - b.v);
    const ranks = new Uint16Array(g.organs.length); L.forEach((a, r) => ranks[a.k] = r);
    return ranks;
  }
  function activeFraction(t) {
    let on = 0, tot = 0;
    S.fns.forEach(f => { if (!f.group) return; tot += f.group.organs.length; if (f.X) on += f.group.organs.length; });
    return tot ? on / tot : 0;
  }
  function triggerVanish(t, why) {
    if (S.vanish || t - S.lastVanish < 30 * 60000) return;
    S.vanish = { from: t, until: t + 10 * 60000, why }; S.lastVanish = t;
    event(t, `DISPARITION DE LA TOUR DANS UN NUAGE DE FUMÉE — ${why}`);
  }

  function indifference(t) {
    if (S.tickN < 24 || t - S.lastIndiff < 60000) return;
    const a = S.hist.act, N = a.length; let why = null, kind = null;
    // repetition: periodicity in the activity series (autocorrelation)
    if (N >= 96) {
      const w = a.slice(-96), m = w.reduce((s, v) => s + v, 0) / w.length;
      const c0 = w.reduce((s, v) => s + (v - m) * (v - m), 0);
      // a true period: the autocorrelation first falls below 0.1, then rises again to a peak above 0.6
      if (c0 > 1e-4) {
        const acf = L => { let c = 0; for (let i = L; i < w.length; i++) c += (w[i] - m) * (w[i - L] - m); return c / c0; };
        let L0 = 0; for (let L = 1; L <= 30; L++) if (acf(L) < 0.1) { L0 = L; break; }
        if (L0) for (let L = L0 + 1; L <= 48; L++) { const r = acf(L); if (r > 0.6 && r >= acf(L - 1) && r >= acf(L + 1)) { why = `périodicité détectée (période ${L * 5} s)`; kind = 'repetition'; break; } }
      }
    }
    const avg = w => w.reduce((s, v) => s + v, 0) / w.length;
    const mean = avg(a.slice(-24)), longRun = avg(a);
    if (!why && !S.shutdown && (mean > 0.88 || (N >= 120 && mean > longRun + 0.09))) { why = `saturation (${(mean * 100).toFixed(0)} % des groupes commandés, moyenne ${(longRun * 100).toFixed(0)} %)`; kind = 'saturation'; }
    if (!why && !S.shutdown && (mean < 0.15 || (N >= 120 && mean < longRun - 0.11))) { why = `stagnation (${(mean * 100).toFixed(0)} % des groupes commandés, moyenne ${(longRun * 100).toFixed(0)} %)`; kind = 'stagnation'; }
    if (!why && t - S.regimeSince > 10 * 60000) { why = `régime ${S.regime} inchangé depuis ${Math.round((t - S.regimeSince) / 60000)} min`; kind = S.regime === 'rouge' ? 'saturation' : 'stagnation'; S.regimeSince = t; }
    if (!why) return;
    S.lastIndiff = t; S.abacus[kind]++; S.beads.push({ t, kind });
    // perturbation artificielle: redraw the sensitivities of a third of the functions …
    const k = Math.ceil(S.fns.length * 0.3);
    for (let i = 0; i < k; i++) { const f = S.fns[Math.floor(rand() * S.fns.length)]; drawA(f.A); f.Kk = CR.Kmin + rand() * CR.Kspan; f.t0 = -1e9; }
    // … and antagonist flashes: brake an environmental runaway, or accelerate a numbness (p. 29, p. 115)
    S.antagonist = { kind: kind === 'saturation' ? 'frein' : 'accélération', until: t + 20000 };
    event(t, `CELLULE D’INDIFFÉRENCE — ${why} → ${k} fonctions redessinées, flashes antagonistes (${S.antagonist.kind})`);
    if (kind === 'repetition') reassign(t, 'contre la répétition');
  }

  // ---------------------------------------------------------------- per-frame sampling
  function hash(i) { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); }
  function sample(t) {
    const I = OUT.I, col = OUT.colour; I.fill(0); col.fill(255); OUT.smoke.fill(0);
    const R = REGIME[S.regime], gate = GATE[S.regime];
    const day = !S.night;
    let brake = 1, accel = 0;
    if (S.antagonist) { if (S.antagonist.kind === 'frein') brake = 0.4; else accel = 1; }
    const nightCombined = S.night ? activeFraction(t) >= 0.15 : true;
    const axisOn = new Float32Array(T.axes.length), axisEnv = new Float32Array(T.axes.length).fill(1), axisRev = new Float32Array(T.axes.length).fill(1);

    for (const f of S.fns) {
      const g = f.group; if (!g || !f.X || !f.ranks) continue;
      const type = g.type;
      if (S.shutdown) continue;
      if (day && (type === 5 || type === 6 || type === 7)) continue;  // 40 big projectors and lasers off by day
      if (type === 8 && !nightCombined) continue; // at night smoke always combined with light
      const local = (t - f.t0) / 1000, Y = f.Y, th = f.theta, m = f.mode;
      if (local > Y) continue;
      const N = g.organs.length;
      for (let k = 0; k < N; k++) {
        const o = g.organs[k], r = f.ranks[k];
        const s = m.o === 9 ? 0 : r * th;
        let v = 0;
        switch (m.e) {
          case 0: v = local >= s ? clamp((local - s) / (Y * 0.35 + 0.01)) : 0; break;                       // progressif
          case 1: v = local < (m.o === 9 ? Y : (r + 1) * th) ? 1 - 0.4 * local / Y : 0; break;        // dégressif
          case 2: v = local >= s ? ((Math.floor((local - s) / Math.max(th * 4, 0.6)) + r) % 2 ? 1 : 0.12) : 0; break; // alterné
          case 3: v = local >= s && local < s + Math.max(3 * th, 0.4) ? 1 : 0; break;                         // ponctuel
          default: v = local >= s ? clamp((local - s) / 0.4) : 0;                                            // étale
        }
        if (!v) continue;
        if (type === 1) { axisOn[o.axis] = Math.max(axisOn[o.axis], v); axisEnv[o.axis] = m.e; if (m.e === 2) axisRev[o.axis] = (Math.floor(local / Math.max(th * 4, 2)) % 2) ? -1 : 1; continue; }
        if (type === 8) { OUT.smoke[o.id] = v; continue; }
        if (type === 2) { // flashes: strobe according to the envelope
          const hz = m.e === 4 ? 1.6 : m.e === 2 ? 3 : m.e === 0 ? 0.4 + 3 * v : m.e === 1 ? 3 * v : 0;
          v = m.e === 3 ? (local - s < 0.09 ? 1 : 0) : (((t / 1000) * hz + hash(o.id)) % 1 < 0.07 ? 1 : 0);
          if (o.colour && o.colour !== 'blanc') v *= gate[o.colour];
          I[o.id] = v * (accel ? 1 : brake); continue;
        }
        if (o.colour) v *= gate[o.colour];
        if (type === 4) { // shutter projectors (Annexe 3): motor engaged only in the excited régime
          const motor = S.regime === 'rouge';
          const trioIdx = motor ? Math.floor((t / 1000) * o.motor / 60 / 4 + hash(o.id) * 3) % 3 : 0;
          col[o.id] = T.COLOURS.indexOf(o.trio[trioIdx]);
          v = (S.regime === 'bleu' ? 0 : 1) * (motor ? 1 : 0.9);
          v *= gate[o.trio[trioIdx]] === 0 ? 0.2 : 1;
        }
        I[o.id] = (CR.capMode === 'proportion' ? (hash(o.id * 7.31 + 0.5) < R.cap ? v : 0) : v * R.cap) * brake;
      }
    }
    // mirror axes: speed group × envelope; arrest when inactive
    const base = { lent: 0.5, moyen: 1.5, rapide: 3.4 }; // rad/s: about 5, 14 and 32 turns a minute
    T.axes.forEach((ax, i) => {
      let sp = 0;
      if (axisOn[i] > 0 && !S.shutdown) {
        sp = base[ax.speed];
        const e = axisEnv[i];
        if (e === 0) sp *= axisOn[i]; else if (e === 1) sp *= Math.max(0.1, axisOn[i]); else if (e === 3) sp *= 1.6;
        sp *= axisRev[i];
      }
      if (accel && !S.shutdown) sp = (sp || base[ax.speed]) * 2.2; else sp *= brake < 1 ? 0.3 : 1;
      OUT.axisSpeed[i] = sp;
    });
    // antagonist acceleration: all flashes fire together
    if (accel && !S.shutdown) organs.forEach(o => { if (o.type === 2 && ((t / 1000) * 3 + hash(o.id)) % 1 < 0.08) I[o.id] = 1; });

    // night shutdown: only aviation lamps and, eventually, the vertical beams at the summit
    if (S.shutdown) organs.forEach(o => { if (o.type === 5 && o.summit && o.aim[1] > 0.95 && S.night) I[o.id] = 0.6; });

    // conventional language overrides
    if (S.special && S.special.kind === 'meteo') {
      const b = S.special.bad, ci = b > 0.66 ? 1 : b < 0.33 ? 0 : (b > 0.5 ? 4 : 5); // rouge / bleu / violet / blanc
      organs.forEach(o => { if (o.type === 3 || o.type === 4 || (o.type === 6 && S.night)) { I[o.id] = (hash(o.id) < 0.75 ? 0.9 : 0); col[o.id] = ci; } else if (o.type === 2) I[o.id] = 0; });
      T.axes.forEach((ax, i) => OUT.axisSpeed[i] = 0.15 + 2.6 * b);
    }
    if (S.special && S.special.kind === 'circulation') {
      const q = S.special.quad;
      organs.forEach(o => {
        if (o.type !== 3 && o.type !== 4 && o.type !== 6) return;
        const s = q[o.d]; col[o.id] = s > 0.08 ? 1 : s > 0.03 ? 3 : 5; I[o.id] = hash(o.id) < 0.7 ? 0.85 : 0;
      });
    }
    // smoke
    OUT.vanish = S.vanish ? clamp(Math.min((t - S.vanish.from) / 20000, (S.vanish.until - t) / 30000)) : 0;
    OUT.beacons = 1;
    return OUT;
  }

  function setCriteria(p) { Object.assign(CR, p); }
  return { init, tick, sample, S, CR, setCriteria, MODES, TYPE_NAMES, REGIME, triggerVanish: (t) => triggerVanish(t, 'commande manuelle'), reassign };
}
const PROG = makeProg();
if (typeof module !== 'undefined') { module.exports = PROG; module.exports.makeProg = makeProg; }
