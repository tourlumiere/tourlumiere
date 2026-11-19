/* ==========================================================================
   LA VILLE CYBERNÉTIQUE — a simulation after Nicolas Schöffer, La Ville
   cybernétique (Paris: Tchou, 1969), pp. 130–194, fed by live Paris data.
   Units: metres; +x east, +z south. One rendered inhabitant stands for TEN.
   ========================================================================== */
const VILLE = (function () {
  'use strict';
  const R = Math.random, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------- layout (the plan is imagined; the elements and their rules are Schöffer's)
  // residential city: bands of two-storey cells on high pylons (10–30 m), façades east–west in a temperate climate,
  // so the bands run north–south (pp. 137, 147, 178); 16 bands of 500 cells = 8,000 cells
  const NB = 16, BX0 = -1400, BDX = 125, BZ0 = 1500, BLEN = 1000, SLOT = 4, SLOTS = BLEN / SLOT;
  const bands = Array.from({ length: NB }, (_, i) => ({ i, x: BX0 + i * BDX, h: 10 + 20 * (((i * 7) % 5) / 4), lifts: [125, 375, 625, 875].map(d => BZ0 + d) }));
  const PL = {
    univ: { x: -230, z: -70, fr: 'Centre universitaire vertical', en: 'Vertical university centre', zone: 'travail', page: 173 },
    admin: { x: 190, z: -200, fr: 'Centre administratif', en: 'Administrative centre', zone: 'travail', page: 203 },
    rech: { x: 210, z: 190, fr: 'Centre de recherche scientifique', en: 'Scientific research centre', zone: 'travail', page: 205 },
    relax: { x: 0, z: 560, fr: 'Centre de relaxation intégré', en: 'Integrated relaxation centre', zone: 'loisirs', page: 175, generic: true },
    theatre: { x: -600, z: 1080, fr: 'Théâtre spatiodynamique', en: 'Spatiodynamic theatre', zone: 'loisirs', page: 186 },
    cls: { x: 1500, z: 2000, fr: 'Centre de loisirs sexuels', en: 'Centre de loisirs sexuels', zone: 'loisirs', page: 176 },
    ecole: { x: -420, z: 2660, fr: 'École', en: 'School', zone: 'residence', page: 175, generic: true },
    agri: { x: -2250, z: 2000, fr: 'Centre agricole', en: 'Agricultural centre', zone: 'travail', page: 173, generic: true },
    ccc: { x: 60, z: 60, fr: 'Commande cybernétique centrale (C.C.C.)', en: 'Central cybernetic command (C.C.C.)', zone: 'travail', page: 182, generic: true }
  };
  const ZONES = ['travail', 'residence', 'loisirs'];
  const TOPO = ['lumiere', 'son', 'climat', 'odeur'];
  const zoneOf = (x, z) => z > 1400 && x < 900 && x > -1600 ? 'residence' : (Math.hypot(x - PL.theatre.x, z - PL.theatre.z) < 260 || Math.hypot(x - PL.cls.x, z - PL.cls.z) < 420 || Math.hypot(x - PL.relax.x, z - PL.relax.z) < 120) ? 'loisirs' : 'travail';

  // ---------------- road graph
  const N = {}, E = {};
  const node = (id, x, z) => { N[id] = { id, x, z }; E[id] = E[id] || []; };
  const edge = (a, b) => { E[a].push(b); E[b].push(a); };
  node('P', 0, 0); node('U', -150, -40); node('A', 120, -140); node('Rr', 140, 130); node('C', 60, 60);
  edge('P', 'U'); edge('P', 'A'); edge('P', 'Rr'); edge('P', 'C');
  node('X', 0, 560); node('J', 0, 1450); edge('P', 'X'); edge('X', 'J');
  node('DW', -1560, 1450); node('DE', 760, 1450); node('SW', -1560, 2550); node('SE', 760, 2550);
  const dRow = ['DW'], sRow = ['SW'];
  bands.forEach(b => { node('D' + b.i, b.x + 18, 1450); node('S' + b.i, b.x + 18, 2550); edge('D' + b.i, 'S' + b.i); dRow.push('D' + b.i); sRow.push('S' + b.i); });
  dRow.push('DE'); sRow.push('SE');
  dRow.sort((a, b) => N[a].x - N[b].x); sRow.sort((a, b) => N[a].x - N[b].x);
  // the main road from the work city meets the distributor
  const jx = dRow.reduce((best, id) => Math.abs(N[id].x) < Math.abs(N[best].x) ? id : best, dRow[0]);
  for (let k = 0; k < dRow.length - 1; k++) edge(dRow[k], dRow[k + 1]);
  for (let k = 0; k < sRow.length - 1; k++) edge(sRow[k], sRow[k + 1]);
  edge('DW', 'SW'); edge('DE', 'SE'); edge('J', jx);
  node('TJ', -600, 1450); node('T', -600, 1200); edge('T', 'TJ');
  { const a = dRow.filter(id => N[id].x < -600).pop(), b = dRow.find(id => N[id].x > -600); E[a] = E[a].filter(x => x !== b); E[b] = E[b].filter(x => x !== a); edge(a, 'TJ'); edge('TJ', b); }
  node('K1', 1250, 1650); node('K', 1440, 1860); edge('DE', 'K1'); edge('K1', 'K');
  node('G1', -1950, 1700); node('G', -2180, 1960); edge('DW', 'G1'); edge('G1', 'G');
  node('Eo', -420, 2550); node('Ec', -420, 2620); edge('Eo', 'Ec');
  { const a = sRow.filter(id => N[id].x < -420).pop(), b = sRow.find(id => N[id].x > -420); E[a] = E[a].filter(x => x !== b); E[b] = E[b].filter(x => x !== a); edge(a, 'Eo'); edge('Eo', b); }
  const ACCESS = { univ: 'U', admin: 'A', rech: 'Rr', relax: 'X', theatre: 'T', cls: 'K', ecole: 'Ec', agri: 'G', ccc: 'C' };
  function shortest(a, b) {
    if (a === b) return [a];
    const dist = { [a]: 0 }, prev = {}, Q = new Set(Object.keys(N));
    while (Q.size) {
      let u = null, best = Infinity; Q.forEach(q => { if ((dist[q] ?? Infinity) < best) { best = dist[q]; u = q; } });
      if (u == null || u === b) break; Q.delete(u);
      E[u].forEach(v => { const d = best + Math.hypot(N[u].x - N[v].x, N[u].z - N[v].z); if (d < (dist[v] ?? Infinity)) { dist[v] = d; prev[v] = u; } });
    }
    const p = [b]; while (p[0] !== a && prev[p[0]]) p.unshift(prev[p[0]]); return p;
  }
  const routeCache = {};
  const roadPath = (a, b) => routeCache[a + '>' + b] || (routeCache[a + '>' + b] = shortest(a, b));

  // ---------------- inhabitants: the categories the text names (pp. 132, 135, 174–175)
  // travailleur "quels que soient son grade ou sa spécialité"; enfants "se rendant à l'école"; étudiants of the
  // vertical university; residence as a place of retreat "temporaire ou définitif, selon l'âge" → retirees;
  // couples, for whom the centre de loisirs sexuels is intended; the personnel of collective food and leisure.
  const TYPES = {
    travailleur: { fr: 'travailleur', en: 'worker', col: [0.95, 0.72, 0.35] },
    personnel: { fr: 'personnel des loisirs', en: 'leisure staff', col: [0.95, 0.45, 0.55] },
    etudiant: { fr: 'étudiant', en: 'student', col: [0.55, 0.85, 0.95] },
    enfant: { fr: 'enfant', en: 'child', col: [0.6, 0.95, 0.5] },
    retraite: { fr: 'retraité', en: 'retired', col: [0.8, 0.75, 0.95] }
  };
  const WORKPLACE = [['univ', 0.28], ['admin', 0.34], ['rech', 0.26], ['agri', 0.12]];
  const ACT = {
    sommeil: ['sommeil', 'asleep'], maison: ['dans sa cellule', 'in their cell'], stimulant: ['centre stimulant', 'stimulating centre'], trajet: ['en route', 'on the way'],
    travail: ['au travail', 'at work'], repas: ['repas collectif', 'collective meal'], relaxation: ['centre de relaxation', 'relaxation centre'], theatre: ['théâtre spatiodynamique', 'spatiodynamic theatre'],
    cls: ['centre de loisirs sexuels', 'centre de loisirs sexuels'], ecole: ['à l’école', 'at school'], promenade: ['promenade au sol', 'walk on the ground'], service: ['en service', 'on duty']
  };
  const THIRD = { sommeil: 'sommeil', maison: 'loisirs', stimulant: 'loisirs', trajet: 'trajet', travail: 'travail', repas: 'loisirs', relaxation: 'loisirs', theatre: 'loisirs', cls: 'loisirs', ecole: 'travail', promenade: 'loisirs', service: 'travail' };
  let agents = [];
  function makePopulation(nA) {
    agents = []; let cellIdx = 0;
    const cellPos = k => { const b = bands[k % NB], s = Math.floor(k / NB / 2) % SLOTS, st = Math.floor(k / NB) % 2; return { b: b.i, slot: s, storey: st }; };
    while (agents.length < nA) {
      const c = cellPos(cellIdx * 37 % (NB * SLOTS * 2)); cellIdx++;
      const r = R(), fam = [];
      if (r < 0.42) { fam.push('travailleur', R() < 0.8 ? 'travailleur' : 'personnel'); if (R() < 0.55) fam.push('enfant'); if (R() < 0.25) fam.push('enfant'); }
      else if (r < 0.58) fam.push(R() < 0.6 ? 'travailleur' : 'personnel');
      else if (r < 0.74) fam.push('etudiant', ...(R() < 0.3 ? ['etudiant'] : []));
      else fam.push('retraite', ...(R() < 0.6 ? ['retraite'] : []));
      const couple = fam.filter(t => t !== 'enfant').length >= 2;
      fam.forEach((t, k) => {
        if (agents.length >= nA) return;
        const wp = t === 'travailleur' ? pickW() : t === 'etudiant' ? 'univ' : t === 'personnel' ? ['theatre', 'relax', 'cls', 'theatre'][Math.floor(R() * 4)] : null;
        agents.push({ id: agents.length, type: t, home: c, work: wp, couple: couple && t !== 'enfant' ? agents.length - k : -1, ton: 0.3 + R() * 0.2, want: 0.1, act: 'sommeil', path: null, seg: 0, segT: 0, pos: [0, 0, 0], plan: [], step: 0, day: '', votes: 0, lastVote: null, third: { sommeil: 0, travail: 0, loisirs: 0, trajet: 0 }, mode: R() < 0.3 ? 'air' : 'sol', phase: R() });
      });
    }
    agents.forEach(a => { const p = cellXYZ(a.home); a.pos = p.slice(); });
  }
  function pickW() { let r = R(), k = 0; while (r > WORKPLACE[k][1]) r -= WORKPLACE[k++][1]; return WORKPLACE[k][0]; }
  // at home, the dot sits at the cell's glazed east or west façade, where it shows as an occupied window
  function cellXYZ(c) { const b = bands[c.b]; return [b.x + (c.slot % 2 ? 6.4 : -6.4), b.h + 2.5 + c.storey * 3, BZ0 + c.slot * SLOT + 2]; }
  function interior(id) {
    const p = PL[id];
    switch (id) {
      case 'univ': return [p.x + (R() - 0.5) * 36, 8 + R() * 380, p.z + (R() - 0.5) * 36];
      case 'admin': { const up = R() < 0.5; return [p.x + (R() - 0.5) * 120, (up ? 150 : 70) + (R() - 0.5) * 30, p.z + (R() - 0.5) * 60]; }
      case 'rech': { const k = Math.floor(R() * 4); return [p.x + [-28, 28, -20, 20][k] + gauss() * 8, [95, 95, 30, 30][k] + gauss() * 8, p.z + [-15, 15, 10, -10][k] + gauss() * 8]; }
      case 'theatre': { const a = R() * Math.PI * 2, r = 30 + R() * 45; return [p.x + Math.cos(a) * r, 18 + R() * 16, p.z + Math.sin(a) * r * 0.7]; }
      case 'cls': { const t = R(); const a = t * Math.PI * 8, r = 18 + 12 * Math.sin(Math.PI * t); return [p.x + Math.cos(a) * r, 8 + (1 - t) * 60, p.z + Math.sin(a) * r]; }
      case 'relax': return [p.x + (R() - 0.5) * 70, 2 + R() * 6, p.z + (R() - 0.5) * 24];
      default: return [p.x + (R() - 0.5) * 30, 1.5 + R() * 4, p.z + (R() - 0.5) * 30];
    }
  }

  // ---------------- daily plan: the three thirds (p. 133), in Paris time
  function planDay(a, P) {
    const wk = P.wd === 0 || P.wd === 6, J = (m, s) => m + gauss() * s, pl = [];
    const home = { k: 'cell' };
    if (a.type === 'enfant') {
      const wake = J(7, 0.2); pl.push([0, 'sommeil', home], [wake, 'maison', home]);
      if (!wk) pl.push([wake + 0.4, 'stimulant', { k: 'stim' }], [J(8.1, 0.1), 'ecole', { k: 'pl', id: 'ecole' }], [J(16.2, 0.2), 'promenade', { k: 'ground' }], [J(17.5, 0.3), 'maison', home]);
      else pl.push([J(10, 1), 'promenade', { k: 'ground' }], [J(12.5, 0.5), 'maison', home], [J(15, 1), 'theatre', { k: 'pl', id: 'theatre' }], [J(18, 0.5), 'maison', home]);
      pl.push([J(20.5, 0.3), 'sommeil', home]);
    } else if (a.type === 'retraite') {
      pl.push([0, 'sommeil', home], [J(7.5, 0.5), 'maison', home], [J(10, 1), 'promenade', { k: 'ground' }], [J(12, 0.3), 'maison', home]);
      pl.push([J(15, 1), R() < 0.5 ? 'theatre' : 'relaxation', R() < 0.5 ? { k: 'pl', id: 'theatre' } : { k: 'pl', id: 'relax' }], [J(18.5, 0.5), 'maison', home], [J(22, 0.5), 'sommeil', home]);
    } else if (a.type === 'personnel') {
      // collective food and leisure as an industry with trained personnel (pp. 173–174): shifts into the evening
      pl.push([0, 'sommeil', home], [J(8.5, 0.5), 'maison', home]);
      if (!wk || R() < 0.5) pl.push([J(13.5, 0.2), 'service', { k: 'pl', id: a.work }], [J(21.8, 0.2), 'maison', home]);
      else pl.push([J(15, 1), 'theatre', { k: 'pl', id: 'theatre' }], [J(19, 0.5), 'maison', home]);
      pl.push([J(0.5 + 24, 0.3), 'sommeil', home]);
    } else {
      const wake = J(6.6, 0.3); pl.push([0, 'sommeil', home], [wake, 'maison', home]);
      if (!wk) {
        const wp = a.work;
        pl.push([wake + 0.45, 'stimulant', { k: 'stim' }], [J(7.6, 0.15), 'travail', { k: 'pl', id: wp }], [J(12, 0.1), 'repas', { k: 'pl', id: wp, meal: 1 }], [J(13, 0.1), 'travail', { k: 'pl', id: wp }]);
        // leaving work through the integrated relaxation centre (p. 175)
        pl.push([J(16.4, 0.25), 'relaxation', { k: 'pl', id: 'relax' }]);
        const r = R();
        if (r < 0.35) pl.push([J(17.6, 0.3), 'theatre', { k: 'pl', id: 'theatre' }], [J(20, 0.4), 'maison', home]);
        else pl.push([J(17.4, 0.3), 'maison', home]);
      } else pl.push([J(11, 1), 'promenade', { k: 'ground' }], [J(13, 0.5), 'maison', home], [J(16, 1), 'theatre', { k: 'pl', id: 'theatre' }], [J(19.5, 0.5), 'maison', home]);
      // couples in the evening, a few at a time (p. 175)
      if (a.couple >= 0 && R() < (wk ? 0.12 : 0.05)) pl.push([J(21, 0.3), 'cls', { k: 'pl', id: 'cls' }], [J(23.2, 0.3), 'maison', home]);
      pl.push([J(22.8, 0.4) + (pl[pl.length - 1][0] > 22.5 ? 1 : 0), 'sommeil', home]);
    }
    pl.sort((x, y) => x[0] - y[0]); a.plan = pl; a.step = 0;
  }

  // ---------------- routes
  function cellExit(a, up) { // from the cell along the deck to the nearest lift, down (or up to the roof pad)
    const b = bands[a.home.b], cz = BZ0 + a.home.slot * SLOT + 2, y = b.h + 2.5 + a.home.storey * 3;
    const lz = b.lifts.reduce((m, l) => Math.abs(l - cz) < Math.abs(m - cz) ? l : m, b.lifts[0]);
    const pts = [[b.x, y, cz], [b.x + 4, b.h + 1, cz], [b.x + 4, b.h + 1, lz]];
    if (up) pts.push([b.x + 9, b.h + 9, lz], [b.x, b.h + 9, BZ0 + BLEN / 2]); else pts.push([b.x + 9, b.h + 1, lz], [b.x + 9, 0.5, lz], [b.x + 18, 0.5, lz]);
    return { pts, lz };
  }
  const speedOf = (p, q) => (q[1] > 60 && p[1] > 60) ? 38 : (Math.abs(q[1] - p[1]) > Math.hypot(q[0] - p[0], q[2] - p[2])) ? 3 : (Math.hypot(q[0] - p[0], q[2] - p[2]) > 60 ? 13 : 1.4);
  function groundNodeOfBand(b, z) { return z < BZ0 + BLEN / 2 ? 'D' + b : 'S' + b; }
  function buildRoute(a, dest) {
    const pts = [a.pos.slice()];
    const here = a.loc || { k: 'cell' };
    // destination descriptor
    let tNode = null, tPt = null, tAir = null;
    if (dest.k === 'cell') { tPt = cellXYZ(a.home); }
    else if (dest.k === 'stim') { const b = bands[a.home.b]; tPt = [b.x + 22 + R() * 8, 1.5, b.lifts[1] + R() * 10]; }
    else if (dest.k === 'ground') { const b = bands[a.home.b]; tPt = [b.x + (R() - 0.5) * 100, 0.8, BZ0 + R() * BLEN]; }
    else { tNode = ACCESS[dest.id]; tPt = dest.meal ? [PL[dest.id].x + (R() - 0.5) * 50, 2, PL[dest.id].z + (R() - 0.5) * 50] : interior(dest.id); if (a.mode === 'air' && ['univ', 'admin', 'rech'].includes(dest.id)) tAir = [PL[dest.id].x, dest.id === 'univ' ? 412 : 205, PL[dest.id].z]; }
    const fromCell = here.k === 'cell', toCell = dest.k === 'cell';
    const fromPl = here.k === 'pl' ? here.id : null;
    // helibus between the roof pads of the bands and the summits of the vertical centres (pp. 135, 146)
    if (a.mode === 'air' && ((fromCell && tAir) || (toCell && fromPl && ['univ', 'admin', 'rech'].includes(fromPl)))) {
      if (fromCell) { cellExit(a, true).pts.forEach(p => pts.push(p)); pts.push([pts[pts.length - 1][0], 150, pts[pts.length - 1][2]], [tAir[0], 150, tAir[2]], tAir, tPt); }
      else { const top = [PL[fromPl].x, fromPl === 'univ' ? 412 : 205, PL[fromPl].z]; pts.push(top, [top[0], 150, top[2]]); const ex = cellExit(a, true).pts.reverse(); pts.push([ex[0][0], 150, ex[0][2]]); ex.forEach(p => pts.push(p)); }
      return pts;
    }
    let sNode;
    if (fromCell) { const ex = cellExit(a, false); ex.pts.forEach(p => pts.push(p)); sNode = groundNodeOfBand(a.home.b, ex.lz); pts.push([N[sNode].x, 0.5, N[sNode].z]); }
    else if (here.k === 'stim' || here.k === 'ground') { const b = bands[a.home.b]; sNode = groundNodeOfBand(b.i, a.pos[2]); pts.push([b.x + 18, 0.5, a.pos[2]], [N[sNode].x, 0.5, N[sNode].z]); }
    else { sNode = ACCESS[fromPl]; pts.push([N[sNode].x, 0.5, N[sNode].z]); }
    if (toCell || dest.k === 'stim' || dest.k === 'ground') {
      const b = bands[a.home.b], tz = toCell ? BZ0 + a.home.slot * SLOT + 2 : tPt[2];
      const lz = toCell ? b.lifts.reduce((m, l) => Math.abs(l - tz) < Math.abs(m - tz) ? l : m, b.lifts[0]) : tz;
      const eNode = groundNodeOfBand(b.i, lz);
      roadPath(sNode, eNode).slice(1).forEach(id => pts.push([N[id].x, 0.5, N[id].z]));
      if (toCell) { cellExit(a, false).pts.reverse().forEach(p => pts.push(p)); pts.push(tPt); }
      else { pts.push([b.x + 18, 0.5, tz]); pts.push(tPt); }
      return pts;
    }
    roadPath(sNode, tNode).slice(1).forEach(id => pts.push([N[id].x, 0.5, N[id].z]));
    pts.push(tPt); return pts;
  }

  // ---------------- the central brain: quantified votes, rhythms, Paris data → five topologies (pp. 150–163)
  const B = {
    V: {}, S: {}, light: {}, pulse: {}, climate: 0, odour: {}, agitation: 0, info: 0, theatre: 0.5, log: [], votesMin: 0, desync: 0,
    hist: [], inputs: { temp: 12, wind: 10, hum: 70, cloud: 50, alt: 0, rain: 0, noise: 0.4, traffic: 0.5, forecastBad: 0.3, infoRate: 0.5, hosp: 0.5 }
  };
  ZONES.forEach(z => { B.V[z] = {}; B.S[z] = {}; TOPO.forEach(t => { B.V[z][t] = 0; B.S[z][t] = 0; }); B.light[z] = 0; B.pulse[z] = 0.5; B.odour[z] = 0; });
  // topology of rhythms: density of events by zone and hour — dense in the work city by day, "détendus et distendus" at home
  function rhythmBase(z, h, wk) {
    if (z === 'travail') return wk ? -0.3 : (h > 7.5 && h < 17 ? 0.55 : -0.35);
    if (z === 'residence') return h >= 21.5 || h < 6.3 ? -0.7 : h < 8 ? 0.35 : h > 18 ? -0.25 : 0;
    return h > 17 && h < 23.5 ? 0.45 : h > 9 && h < 17 ? 0.1 : -0.4;
  }
  let lastBrain = 0;
  function brain(t, P) {
    const C = DATA.byId, x = DATA.ctx, h = P.h + P.mi / 60, wk = P.wd === 0 || P.wd === 6;
    const dtMin = lastBrain ? (t - lastBrain) / 60000 : 0.25; lastBrain = t;
    // Paris → the city's environment
    const temp = C.thermo.raw != null ? +C.thermo.raw : 12, wind = C.vent10.raw != null ? +C.vent10.raw : 10, hum = C.hygro.raw != null ? +C.hygro.raw : 70;
    const cloud = x.cloud != null ? x.cloud : 50, alt = x.sun ? x.sun.alt : 0, rain = x.precip || 0;
    const noise = C.micro.x, traffic = C.circulation.x, forecastBad = C.meteo.x, infoRate = (C.presse.x + C.telephone.x + C.telegraphe.x + (C.bourse.x || 0)) / 4, hosp = C.hopitaux.x;
    B.inputs = { temp, wind, hum, cloud, alt, rain, noise, traffic, forecastBad, infoRate, hosp };
    const decay = Math.pow(0.5, dtMin / 10);
    ZONES.forEach(z => TOPO.forEach(tp => { B.V[z][tp] *= decay; }));
    const pop = { travail: 1, residence: 1, loisirs: 1 }; agents.forEach(a => pop[zoneOf(a.pos[0], a.pos[2])]++);
    const orders = [];
    ZONES.forEach(z => {
      const base = rhythmBase(z, h, wk);
      TOPO.forEach(tp => {
        let s = base + 0.45 * Math.tanh(B.V[z][tp] / (pop[z] * 0.1 + 5));
        if (tp === 'son' && z === 'residence') s -= 0.25 * noise;            // human and technical noise to be neutralised (p. 160)
        if (tp === 'lumiere' && z === 'travail') s += 0.15 * (infoRate - 0.5); // dense information, dense light in the contact city
        B.S[z][tp] = clamp(s, -1, 1);
      });
      // light: compensation of an abnormally low daylight "du fait d'un plafond très bas" (p. 156), night lighting, pulsed lighting
      const day = clamp((alt + 4) / 14), comp = alt > 0 ? clamp((cloud - 70) / 30) * 0.6 : 0;
      const nightNeed = (1 - day) * (z === 'residence' && (h >= 23 || h < 6) ? 0.25 : 0.85);
      B.light[z] = clamp(Math.max(comp, nightNeed));
      B.pulse[z] = 0.15 + 1.6 * (B.S[z].lumiere + 1) / 2;                   // Hz: slow pulses relax, fast pulses stimulate
      B.odour[z] = B.S[z].odeur;
    });
    // climates: blown-air partitions, heat walls, water curtains round the dwellings when the weather is harsh (p. 161)
    B.climate = clamp(Math.max(0, Math.abs(temp - 20) - 5) / 12 + Math.max(0, wind - 25) / 40 + (rain > 0.2 ? 0.4 : 0) + Math.max(0, hum - 88) / 30);
    // sculpture-towers: agitation announcing bad weather at certain hours, information at others (p. 184)
    const baroHours = (h > 6.5 && h < 9) || (h > 18 && h < 20.5);
    B.agitation = baroHours ? clamp(0.15 + forecastBad * 0.85) : clamp(0.2 + infoRate * 0.6);
    B.towerMode = baroHours ? 'baro' : 'info';
    // theatre: the spectators' orders, "sans cesse quantifiés", steer the programme (p. 187)
    B.theatre = clamp(0.5 + 0.5 * Math.tanh(B.V.loisirs.lumiere + B.V.loisirs.son) / 3 + 0.2 * B.S.loisirs.son);
    // desynchronisation: individual rhythms against collective ones (p. 145)
    let d = 0, n = 0; agents.forEach(a => { if (a.act !== 'sommeil') { d += Math.abs(a.want - a.ton); n++; } }); B.desync = n ? d / n : 0;
    B.hosp = hosp;
    // log a few orders
    ZONES.forEach(z => { const v = B.S[z].son; if (Math.abs(v - (B._ls || {})[z] || 0) > 0.35) orders.push([z, 'son', v]); });
    B._ls = Object.fromEntries(ZONES.map(z => [z, B.S[z].son]));
    const cOn = B.climate > 0.3; if (orders.length || (B._lc !== undefined && cOn !== B._lc)) { B.log.unshift({ t, orders, climate: B.climate, cChange: cOn !== B._lc ? (cOn ? 1 : -1) : 0 }); B.log.length = Math.min(B.log.length, 60); } B._lc = cOn;
  }

  // ---------------- tonus: contraction / decontraction (pp. 137–138) — the model and its constants are mine
  const WANT = { sommeil: 0.08, maison: 0.32, stimulant: 0.6, trajet: 0.5, travail: 0.68, repas: 0.45, relaxation: 0.25, theatre: 0.5, cls: 0.45, ecole: 0.6, promenade: 0.4, service: 0.6 };
  const EFFECT = { sommeil: -0.5, maison: -0.05, stimulant: 0.9, trajet: 0.05, travail: 0.12, repas: -0.05, relaxation: -0.9, theatre: 0.15, cls: 0.05, ecole: 0.1, promenade: -0.05, service: 0.1 };
  const POSTS = { maison: 1, travail: 1, theatre: 1, service: 1, ecole: 0.3 }; // control posts with pointing buttons (pp. 151, 190)
  function agentStep(a, dtH, P) {
    const z = zoneOf(a.pos[0], a.pos[2]);
    a.want = WANT[a.act];
    const env = TOPO.reduce((s, tp) => s + B.S[z][tp], 0) / TOPO.length;
    a.ton = clamp(a.ton + dtH * (EFFECT[a.act] * (a.act === 'relaxation' || a.act === 'sommeil' ? a.ton : 1 - a.ton) + 0.35 * env * (a.act === 'sommeil' ? 0.2 : 1) + 0.04 * (B.inputs.noise - 0.5) + 0.03 * (B.climate - 0.2)));
    a.third[THIRD[a.act]] += dtH;
    if (POSTS[a.act] && a.act !== 'sommeil') {
      const diff = a.want - a.ton;
      if (Math.abs(diff) > 0.12 && R() < dtH * 60 * 0.04 * POSTS[a.act] * Math.abs(diff) * 4) {
        // which phenomenon: the environment that bears most on them now
        const w = { lumiere: 1 + (B.inputs.alt < 0 || B.inputs.cloud > 80 ? 1 : 0), son: 1 + 2 * B.inputs.noise, climat: 0.6 + 3 * B.climate, odeur: 0.6 };
        let r = R() * (w.lumiere + w.son + w.climat + w.odeur), tp = 'lumiere'; for (const k of TOPO) { if ((r -= w[k]) <= 0) { tp = k; break; } }
        const v = diff > 0 ? 1 : -1; B.V[z][tp] += v; a.votes++; a.lastVote = { tp, v, t: simT }; voteCount++;
      }
    }
  }

  // ---------------- three.js scene
  let renderer, scene, camera, canvas, clock = 0, simT = Date.now(), speed = 30, lastReal = performance.now(), voteCount = 0, voteRate = 0;
  const cam = { az: 0.6, el: 0.42, dist: 3600, target: new THREE.Vector3(-400, 0, 1200), follow: -1 };
  const M = {}; // materials and dynamic meshes
  let agentPts, agentGeo, sculptures = [], towers = [], curtains = [], puffs, labels = [], roadLights;
  function mat(c, o = {}) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o)); }
  function box(w, h, d, m, x, y, z, parent = scene) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; }
  function gridTex(cols, rows, line, bg, glow) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    if (glow) { for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,${200 + R() * 40 | 0},${140 + R() * 60 | 0},${0.4 + R() * 0.6})`; g.fillRect(R() * 128, R() * 128, 128 / cols, 128 / rows); } }
    g.strokeStyle = line; g.lineWidth = 2; for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * 128 / cols, 0); g.lineTo(i * 128 / cols, 128); g.stroke(); } for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * 128 / rows); g.lineTo(128, j * 128 / rows); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function init(cv) {
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x9aa4ae, 0.00009);
    camera = new THREE.PerspectiveCamera(45, 1, 2, 40000);
    M.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x5a5a48, 0.8); scene.add(M.hemi);
    M.sun = new THREE.DirectionalLight(0xfff2dd, 0.8); scene.add(M.sun);
    buildGround(); buildRoads(); buildResidential(); buildWork(); buildLeisure(); buildSculptures();
    // inhabitants as points
    agentGeo = new THREE.BufferGeometry();
    agentGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(agents.length * 3), 3));
    agentGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(agents.length * 3), 3));
    agentPts = new THREE.Points(agentGeo, new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, vertexColors: true, depthTest: true, transparent: true, opacity: 0.95 }));
    agentPts.frustumCulled = false; agentPts.renderOrder = 10; scene.add(agentPts);
    M.sel = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })); M.sel.visible = false; scene.add(M.sel);
    resize(); addEventListener('resize', resize); controls();
  }
  function buildGround() {
    const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
    g.fillStyle = '#5f6b4c'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 260; i++) { const tone = ['#6f7a52', '#7d8457', '#58653f', '#8a8a5c', '#66724a'][i % 5]; g.fillStyle = tone; g.save(); g.translate(R() * 1024, R() * 1024); g.rotate((R() - 0.5) * 0.3); g.fillRect(0, 0, 30 + R() * 90, 20 + R() * 60); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
    M.ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshLambertMaterial({ map: t })); M.ground.rotation.x = -Math.PI / 2; scene.add(M.ground);
    // the ground left free under the bands: gardens, fields, forests (p. 145); woods round the C.L.S. park
    const tree = new THREE.ConeGeometry(4, 12, 6), tm = mat(0x3c4d2e), n = 1600, inst = new THREE.InstancedMesh(tree, tm, n), o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      let x, z; const r = R();
      if (r < 0.35) { const a = R() * Math.PI * 2, d = 120 + R() * 330; x = PL.cls.x + Math.cos(a) * d; z = PL.cls.z + Math.sin(a) * d; }
      else if (r < 0.75) { x = BX0 - 60 + R() * (NB * BDX + 60); z = BZ0 + R() * BLEN; if ((x - BX0) % BDX < 30) x += 40; }
      else { x = -2600 + R() * 5000; z = 700 + R() * 2600; if (Math.abs(x) < 80) x += 160; }
      o.position.set(x, 6, z); o.scale.setScalar(0.7 + R() * 0.8); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
    }
    scene.add(inst);
  }
  function buildRoads() {
    const rm = mat(0x2d2d2f), seen = new Set(), lightsP = [];
    Object.keys(E).forEach(a => E[a].forEach(b => {
      const k = [a, b].sort().join('|'); if (seen.has(k)) return; seen.add(k);
      const A = N[a], Bn = N[b], L = Math.hypot(Bn.x - A.x, Bn.z - A.z), w = (a === 'J' || b === 'J' || a === 'X' || b === 'X' || (a === 'P' && b === 'X')) ? 26 : 12;
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, L), rm); r.rotation.x = -Math.PI / 2; r.rotation.z = -Math.atan2(Bn.x - A.x, Bn.z - A.z); r.position.set((A.x + Bn.x) / 2, 0.15, (A.z + Bn.z) / 2); scene.add(r);
      for (let s = 0; s < L; s += 40) { const f = s / L; lightsP.push(lerp(A.x, Bn.x, f) + w / 2, 7, lerp(A.z, Bn.z, f)); }
    }));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lightsP, 3));
    g.setAttribute('zone', new THREE.Float32BufferAttribute(Array.from({ length: lightsP.length / 3 }, (_, i) => ZONES.indexOf(zoneOf(lightsP[i * 3], lightsP[i * 3 + 2]))), 1));
    const cols = new Float32Array(lightsP.length); g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    roadLights = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true })); scene.add(roadLights);
    // round plazas of the vertical centres
    [['univ', 95], ['admin', 110], ['rech', 95], ['ccc', 30]].forEach(([id, r]) => { const d = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat(0x8c8a84)); d.rotation.x = -Math.PI / 2; d.position.set(PL[id].x, 0.3, PL[id].z); scene.add(d); });
    const pd = new THREE.Mesh(new THREE.RingGeometry(80, 140, 48), mat(0x8c8a84)); pd.rotation.x = -Math.PI / 2; pd.position.set(0, 0.25, 0); scene.add(pd);
  }
  function buildResidential() {
    // pylons, decks, two-storey cells with east–west windows, lift towers, roof pads, stimulating centres (pp. 137, 146–148, 175)
    const pyl = new THREE.BoxGeometry(2.4, 1, 2.4), pm = mat(0xd8d6cf), o = new THREE.Object3D();
    const count = NB * (BLEN / 25 + 1) * 2, inst = new THREE.InstancedMesh(pyl, pm, count); let k = 0;
    M.bandMats = [];
    bands.forEach(b => {
      for (let z = 0; z <= BLEN; z += 25) for (const dx of [-5, 5]) { o.position.set(b.x + dx, b.h / 2, BZ0 + z); o.scale.set(1, b.h, 1); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix); }
      box(16, 1, BLEN, mat(0xcfccc4), b.x, b.h + 0.5, BZ0 + BLEN / 2);
      const win = gridTex(16, 2, '#6d7378', '#e4e2dc'); win.repeat.set(BLEN / 64, 1);
      const lit = gridTex(16, 2, '#000', '#000', true); lit.repeat.set(BLEN / 64, 1);
      const m = new THREE.MeshLambertMaterial({ map: win, emissiveMap: lit, emissive: new THREE.Color(0, 0, 0) });
      M.bandMats.push(m);
      const cells = new THREE.Mesh(new THREE.BoxGeometry(12, 6, BLEN), [m, m, mat(0xe8e6e0), mat(0xe8e6e0), mat(0xd9d6cf), mat(0xd9d6cf)]);
      cells.position.set(b.x, b.h + 4, BZ0 + BLEN / 2); scene.add(cells);
      box(16, 0.6, BLEN, mat(0xbab7ae), b.x, b.h + 7.3, BZ0 + BLEN / 2);
      b.lifts.forEach(lz => box(7, b.h + 12, 7, mat(0xa9a6a0), b.x + 9, (b.h + 12) / 2, lz));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 24), mat(0x7d8790)); pad.position.set(b.x, b.h + 8, BZ0 + BLEN / 2); scene.add(pad);
      box(18, 5, 26, mat(0xc9b48f), b.x + 26, 2.5, b.lifts[1] + 6);  // stimulating centre + small distribution centre (form not drawn)
    });
    inst.instanceMatrix.needsUpdate = true; scene.add(inst);
    // school: not drawn in the book
    box(70, 8, 40, mat(0xc9b48f), PL.ecole.x, 4, PL.ecole.z + 20);
    // agricultural centre: not drawn — silos and sheds
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 30, 16), mat(0xb9b2a2)); s.position.set(PL.agri.x - 40 + i * 18, 15, PL.agri.z - 30); scene.add(s); }
    box(90, 10, 40, mat(0xa59a84), PL.agri.x, 5, PL.agri.z + 20);
  }
  function openFrame(w, d, h, levels, x, z, m, y0 = 0, beam = 2.2) {
    const g = new THREE.Group();
    [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([i, j]) => box(beam * 1.6, h, beam * 1.6, m, i * w / 2, y0 + h / 2, j * d / 2, g));
    for (let l = 1; l <= levels; l++) { const y = y0 + h * l / levels; box(w + 8, beam, beam, m, 0, y, -d / 2, g); box(w + 8, beam, beam, m, 0, y, d / 2, g); box(beam, beam, d + 8, m, -w / 2, y, 0, g); box(beam, beam, d + 8, m, w / 2, y, 0, g); }
    g.position.set(x, 0, z); scene.add(g); return g;
  }
  function buildWork() {
    const steel = mat(0xe7e4dc), glass = new THREE.MeshLambertMaterial({ map: gridTex(6, 6, '#3c4650', '#9fb2c2'), emissive: new THREE.Color(0, 0, 0), emissiveMap: gridTex(6, 6, '#000', '#000', true), transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
    M.workGlass = glass;
    // vertical university: apparent frame, suspended cells, amphitheatres in the middle, heliports at the top (pp. 134–135, plate p. 172)
    const U = PL.univ, H = 400;
    openFrame(40, 40, H, 20, U.x, U.z, steel);
    const capsG = new THREE.BoxGeometry(1, 1, 1), caps = new THREE.InstancedMesh(capsG, glass, 70), o = new THREE.Object3D();
    for (let i = 0; i < 70; i++) { const side = i % 4, y = 14 + (i * 53) % (H - 30); const off = 18 + R() * 10; o.position.set(U.x + [off, -off, 0, 0][side] + (side > 1 ? (R() - 0.5) * 20 : 0), y, U.z + [0, 0, off, -off][side] + (side < 2 ? (R() - 0.5) * 20 : 0)); o.scale.set(10 + R() * 8, 7 + R() * 9, 10 + R() * 8); o.rotation.y = 0; o.updateMatrix(); caps.setMatrixAt(i, o.matrix); }
    scene.add(caps);
    for (let y = 40; y < H; y += 60) { const amph = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 10, 20), glass); amph.position.set(U.x, y, U.z); scene.add(amph); }
    [[0, 0], [20, 14]].forEach(([dx, dz], i) => { const p = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 22), mat(0x6f6a62)); p.position.set(U.x + dx - 8, H + 6 + i * 8, U.z + dz - 8); scene.add(p); });
    // administrative centre: two great glazed ovoids on concrete cores (plate p. 203)
    const A = PL.admin, conc = mat(0xd9d6cf);
    [[-40, 0], [30, -10], [10, 30]].forEach(([dx, dz], i) => box(14, 200 + i * 15, 14, conc, A.x + dx, (200 + i * 15) / 2, A.z + dz));
    const ov1 = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), glass); ov1.scale.set(95, 34, 52); ov1.position.set(A.x, 70, A.z); ov1.rotation.z = 0.06; scene.add(ov1);
    const ov2 = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), glass); ov2.scale.set(95, 34, 50); ov2.position.set(A.x + 10, 150, A.z - 5); ov2.rotation.z = -0.12; ov2.rotation.y = 0.35; scene.add(ov2);
    // scientific research: open frames of inclined members holding glazed spheres (plate p. 204)
    const Rz = PL.rech;
    const fr = new THREE.Group(); const fm = mat(0xebe8e0);
    [[0, 60, 1], [60, 125, -1]].forEach(([y0, y1, s]) => {
      const w0 = s > 0 ? 70 : 100, w1 = s > 0 ? 100 : 70, d = 55;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => { const a = new THREE.Vector3(i * w0 / 2, y0, j * d / 2), b = new THREE.Vector3(i * w1 / 2, y1, j * d / 2); const L = a.distanceTo(b); const m = new THREE.Mesh(new THREE.BoxGeometry(5, L, 5), fm); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.lookAt(b); m.rotateX(Math.PI / 2); fr.add(m); });
      [y0, y1].forEach(y => { const w = y === y0 ? w0 : w1; box(w, 5, 5, fm, 0, y, -d / 2, fr); box(w, 5, 5, fm, 0, y, d / 2, fr); box(5, 5, d, fm, -w / 2, y, 0, fr); box(5, 5, d, fm, w / 2, y, 0, fr); });
    });
    fr.position.set(Rz.x, 0, Rz.z); scene.add(fr);
    [[-28, 95, -15, 26], [28, 95, 15, 24], [-20, 30, 10, 22], [20, 30, -10, 20]].forEach(([dx, y, dz, r]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), glass); s.position.set(Rz.x + dx, y, Rz.z + dz); scene.add(s); });
    // C.C.C.: not drawn in the book — a low block at the main crossroads
    box(40, 10, 26, mat(0x4a4d55), PL.ccc.x, 5, PL.ccc.z);
    // restaurants integrated in the work city: pavilions on the plazas (not drawn)
    [['univ', 50, 40], ['admin', -70, 60], ['rech', 60, -55]].forEach(([id, dx, dz]) => box(30, 6, 18, mat(0xc9b48f), PL[id].x + dx, 3, PL[id].z + dz));
  }
  function buildLeisure() {
    // spatiodynamic theatre: an ovoid acoustic shell 100–250 m across, a central cylinder holding the shopping centre,
    // the control tower at its top (pp. 186–190, plates pp. 167, 189)
    const T = PL.theatre;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshLambertMaterial({ color: 0xf2f0ea, emissive: new THREE.Color(0, 0, 0) }));
    shell.scale.set(105, 38, 72); shell.position.set(T.x, 34, T.z); scene.add(shell); M.theatreShell = shell;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; box(6, 14, 6, mat(0xd8d5ce), T.x + Math.cos(a) * 55, 7, T.z + Math.sin(a) * 38); }
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 90, 24), mat(0xbcb8ae)); cyl.position.set(T.x, 45, T.z); scene.add(cyl);
    const ct = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 14, 16), new THREE.MeshLambertMaterial({ color: 0x5b6470, emissive: new THREE.Color(0, 0, 0) })); ct.position.set(T.x, 96, T.z); scene.add(ct); M.theatreTower = ct;
    // centre de loisirs sexuels: "la forme d'un sein gonflé placé sur un socle évasé", smooth and closed, "d'un rose atténué",
    // in a park with many secluded paths (p. 175, plates pp. 170–171)
    const C = PL.cls, prof = [];
    const pts = [[0, 0], [42, 0], [40, 3], [30, 12], [24, 24], [26, 34], [36, 46], [44, 60], [45, 72], [41, 84], [32, 94], [20, 101], [10, 104], [7, 107], [5, 110], [0, 111]];
    pts.forEach(([r, y]) => prof.push(new THREE.Vector2(r, y)));
    const cls = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshLambertMaterial({ color: 0xe7c9c3, emissive: new THREE.Color(0, 0, 0) })); cls.position.set(C.x, 0, C.z); scene.add(cls); M.cls = cls;
    const ring = new THREE.Mesh(new THREE.RingGeometry(60, 80, 48), mat(0x8c8a84)); ring.rotation.x = -Math.PI / 2; ring.position.set(C.x, 0.3, C.z); scene.add(ring);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4, r = new THREE.Mesh(new THREE.PlaneGeometry(10, 300), mat(0x2d2d2f)); r.rotation.x = -Math.PI / 2; r.rotation.z = a; r.position.set(C.x + Math.sin(a) * 230, 0.2, C.z + Math.cos(a) * 230); scene.add(r); }
    // integrated relaxation centre at the exit of the work city: not drawn — a pavilion astride the road
    box(110, 12, 40, new THREE.MeshLambertMaterial({ color: 0xbfc8cc, emissive: new THREE.Color(0, 0, 0) }), PL.relax.x, 16, PL.relax.z); M.relax = scene.children[scene.children.length - 1];
    [-50, 50].forEach(dx => box(8, 10, 40, mat(0xd8d5ce), PL.relax.x + dx, 5, PL.relax.z));
  }
  function spatiodynamic(x, z, h, scale = 1) {
    // a sculpture-tower of the Liège type: apparent frame, parallel arms carrying turning axes with plates (p. 181)
    const g = new THREE.Group(), m = mat(0xeeeeea), plates = [];
    box(3 * scale, h, 3 * scale, m, -4 * scale, h / 2, 0, g); box(3 * scale, h, 3 * scale, m, 4 * scale, h / 2, 0, g);
    for (let y = 8; y < h; y += 7 * scale) {
      box(16 * scale, 1.2 * scale, 1.2 * scale, m, 0, y, 0, g);
      const p = new THREE.Mesh(new THREE.BoxGeometry(6 * scale, 4 * scale, 0.4), new THREE.MeshLambertMaterial({ color: [0xd94a3a, 0x3a64c8, 0xe9c23d, 0xffffff, 0x222222][Math.floor(R() * 5)], emissive: new THREE.Color(0, 0, 0) }));
      p.position.set((R() < 0.5 ? -1 : 1) * 9 * scale, y + 2 * scale, 0); g.add(p); plates.push(p);
    }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8 * scale, 6), m); ant.position.set(0, h + 4 * scale, 0); g.add(ant);
    g.position.set(x, 0, z); scene.add(g); return { g, plates, h };
  }
  function buildSculptures() {
    // sculpture-towers at the great crossroads, signals of their sector (p. 184)
    [[0, 0, 70], [0, 1450, 55], [-600, 1450, 45], [760, 1450, 45], [PL.agri.x + 80, PL.agri.z - 80, 35], [PL.admin.x + 120, PL.admin.z - 80, 60]].forEach(([x, z, h]) => towers.push(spatiodynamic(x + 8, z + 8, h, 1.4)));
    // autonomous cybernetic sculptures circulating among the passers-by, with radar and antenna (pp. 181–182)
    for (let i = 0; i < 12; i++) {
      const home = i < 5 ? [0, 0, 180] : i < 10 ? [BX0 + (i - 5) * 3 * BDX + 60, BZ0 + BLEN / 2, 300] : [PL.theatre.x, PL.theatre.z + 130, 60];
      const s = spatiodynamic(0, 0, 10, 0.5); box(5, 1.6, 5, mat(0x555a60), 0, 0.8, 0, s.g);
      s.g.position.set(home[0], 0, home[1]); s.home = home; s.tgt = [home[0], home[1]]; sculptures.push(s);
    }
    // climate partitions round the residential units (p. 161) and odour diffusers (p. 162)
    bands.forEach(b => { const c = new THREE.Mesh(new THREE.PlaneGeometry(BLEN, b.h + 22), new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); c.rotation.y = Math.PI / 2; c.position.set(b.x - 22, (b.h + 22) / 2, BZ0 + BLEN / 2); scene.add(c); curtains.push(c); });
    const pp = [], pz = [];
    bands.forEach(b => b.lifts.forEach(l => { for (let k = 0; k < 6; k++) { pp.push(b.x + 16, 2 + k * 3, l); pz.push(1); } }));
    [PL.univ, PL.admin, PL.rech].forEach(p => { for (let k = 0; k < 18; k++) { pp.push(p.x + (R() - 0.5) * 120, 2 + R() * 10, p.z + (R() - 0.5) * 120); pz.push(0); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pp.length), 3));
    g.userData = { base: pp.slice(), zone: pz };
    puffs = new THREE.Points(g, new THREE.PointsMaterial({ size: 9, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false })); scene.add(puffs);
    // labels
    Object.entries(PL).forEach(([id, p]) => labels.push({ id, x: p.x, y: { univ: 430, admin: 190, rech: 140, theatre: 115, cls: 125, relax: 30, ecole: 14, agri: 36, ccc: 16 }[id], z: p.z }));
    labels.push({ id: 'bandes', x: BX0 + BDX * 7, y: 40, z: BZ0 - 10 });
    labels.push({ id: 'tours', x: 8, y: 105, z: 8 });
  }

  // ---------------- controls
  function controls() {
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el, t: cam.target.clone(), shift: e.shiftKey || e.button === 2, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.shift) { const k = cam.dist / 900, s = Math.sin(cam.az), c = Math.cos(cam.az); cam.target.set(drag.t.x - (dx * c - dy * s) * k, 0, drag.t.z + (dx * s + dy * c) * k * -1); cam.follow = -1; }
      else { cam.az = drag.az - dx * 0.005; cam.el = clamp(drag.el + dy * 0.004, 0.03, 1.45); }
    });
    canvas.addEventListener('pointerup', e => { if (drag && drag.moved < 4 && onPick) onPick(pickAgent(e.offsetX, e.offsetY)); drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 60, 9000); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  let onPick = null;
  function pickAgent(px, py) {
    const v = new THREE.Vector3(); let best = -1, bd = 12;
    agents.forEach((a, i) => { v.set(a.pos[0], a.pos[1], a.pos[2]).project(camera); if (v.z > 1) return; const x = (v.x + 1) / 2 * canvas.clientWidth, y = (1 - v.y) / 2 * canvas.clientHeight, d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * canvas.clientWidth, y: (1 - v.y) / 2 * canvas.clientHeight, vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1, d: camera.position.distanceTo(new THREE.Vector3(x, y, z)) }; }
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const PRESETS = {
    ensemble: { az: 0.6, el: 0.42, dist: 3600, t: [-400, 0, 1200] }, travail: { az: 0.9, el: 0.22, dist: 950, t: [0, 120, 0] },
    residence: { az: -0.5, el: 0.3, dist: 1100, t: [-600, 20, 1900] }, theatre: { az: 0.3, el: 0.25, dist: 520, t: [PL.theatre.x, 30, PL.theatre.z] },
    cls: { az: -0.2, el: 0.2, dist: 420, t: [PL.cls.x, 50, PL.cls.z] }
  };
  function preset(k) { const p = PRESETS[k]; cam.az = p.az; cam.el = p.el; cam.dist = p.dist; cam.target.set(...p.t); cam.follow = -1; }

  // ---------------- simulation loop
  let started = false, dayKey = '';
  function start(n) { makePopulation(n || 2000); started = true; }
  function parts(t) { return DATA.parisParts(new Date(t)); }
  function advanceAgents(dtMs) {
    const P = parts(simT), h = P.h + P.mi / 60 + P.s / 3600, key = `${P.y}-${P.mo}-${P.d}`, dtH = dtMs / 3600000;
    if (key !== dayKey) { dayKey = key; agents.forEach(a => { planDay(a, P); a.third = { sommeil: 0, travail: 0, loisirs: 0, trajet: 0 }; }); agents.forEach(a => { while (a.step + 1 < a.plan.length && a.plan[a.step + 1][0] <= h) a.step++; settle(a); }); }
    agents.forEach(a => {
      // next activity due?
      if (a.step + 1 < a.plan.length && a.plan[a.step + 1][0] <= h && !a.path) {
        a.step++; const [, act, dest] = a.plan[a.step];
        if (act === 'sommeil' && a.act === 'maison') { a.act = 'sommeil'; return; }
        a.path = buildRoute(a, dest); a.seg = 0; a.segT = 0; a.next = act; a.nextLoc = dest.k === 'pl' ? { k: 'pl', id: dest.id } : { k: dest.k }; a.act = 'trajet';
      }
      if (a.path) {
        let left = dtMs / 1000;
        while (left > 0 && a.path) {
          const p = a.path[a.seg], q = a.path[a.seg + 1];
          if (!q) { a.path = null; a.act = a.next; a.loc = a.nextLoc; break; }
          const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), v = speedOf(p, q) * (L > 60 && q[1] < 2 ? 1 / (0.7 + 0.6 * B.inputs.traffic || 1) : 1);
          const need = (L - a.segT) / v;
          if (need <= left) { left -= need; a.seg++; a.segT = 0; a.pos = q.slice(); }
          else { a.segT += left * v; const f = a.segT / L; a.pos = [lerp(p[0], q[0], f), lerp(p[1], q[1], f), lerp(p[2], q[2], f)]; left = 0; }
        }
      } else if (a.act === 'promenade' && R() < dtMs / 60000) { a.pos[0] += (R() - 0.5) * 30; a.pos[2] += (R() - 0.5) * 30; }
      agentStep(a, dtH, P);
    });
  }
  function settle(a) { const [, act, dest] = a.plan[a.step]; a.act = act; a.path = null; a.loc = dest.k === 'pl' ? { k: 'pl', id: dest.id } : { k: dest.k }; a.pos = dest.k === 'cell' ? cellXYZ(a.home) : dest.k === 'pl' ? interior(dest.id) : (() => { const b = bands[a.home.b]; return [b.x + 24, 1.5, b.lifts[1] + 8]; })(); }

  let brainAcc = 0, histAcc = 0;
  function frame(nowReal) {
    const dtReal = Math.min(0.25, (nowReal - lastReal) / 1000); lastReal = nowReal; clock += dtReal;
    if (!started) { render(); return; }
    const dtMs = dtReal * 1000 * speed; simT += dtMs;
    DATA.tick(simT);
    // sub-steps keep the walkers on their paths at high speed
    const steps = Math.ceil(dtMs / 20000); for (let s = 0; s < steps; s++) advanceAgents(dtMs / steps);
    brainAcc += dtMs; if (brainAcc > 15000) { brain(simT, parts(simT)); brainAcc = 0; }
    histAcc += dtMs; if (histAcc > 600000) { histAcc = 0; recordHist(); }
    voteRate = voteRate * 0.98 + voteCount * 0.02 / Math.max(1e-6, dtMs / 60000); voteCount = 0;
    render();
  }
  function recordHist() {
    const c = counts(); B.hist.push({ t: simT, c, S: JSON.parse(JSON.stringify(B.S)), desync: B.desync, climate: B.climate });
    if (B.hist.length > 300) B.hist.shift();
  }
  function counts() { const c = { sommeil: 0, travail: 0, loisirs: 0, trajet: 0 }; agents.forEach(a => c[a.act === 'trajet' ? 'trajet' : THIRD[a.act]]++); return c; }

  function render() {
    const x = DATA.ctx, alt = x.sun ? x.sun.alt : 20, day = clamp((alt + 4) / 14), cl = (x.cloud || 30) / 100;
    // sky and light
    const sky = new THREE.Color().setRGB(lerp(0.03, 0.55 - 0.12 * cl, day), lerp(0.04, 0.66 - 0.1 * cl, day), lerp(0.08, 0.78 - 0.05 * cl, day));
    if (alt > -6 && alt < 6) sky.lerp(new THREE.Color(0.85, 0.5, 0.35), 0.35 * (1 - Math.abs(alt) / 6));
    scene.background = sky; scene.fog.color.copy(sky);
    M.hemi.intensity = 0.25 + 0.6 * day; M.sun.intensity = 0.9 * day * (1 - 0.6 * cl);
    if (x.sun) { const az = x.sun.az * Math.PI / 180, el = Math.max(0.05, alt * Math.PI / 180); M.sun.position.set(Math.sin(az) * Math.cos(el) * 1000, Math.sin(el) * 1000, -Math.cos(az) * Math.cos(el) * 1000); }
    const night = 1 - day, t = clock;
    // light topology: windows by occupancy, pulsed lighting on circulation, glass of the work city, leisure buildings
    if (started) {
      const awake = new Array(NB).fill(0), home = new Array(NB).fill(1);
      agents.forEach(a => { if (a.loc && a.loc.k === 'cell' && !a.path) { home[a.home.b]++; if (a.act !== 'sommeil') awake[a.home.b]++; } });
      M.bandMats.forEach((m, i) => m.emissive.setScalar(night * (0.15 + 1.2 * awake[i] / home[i])));
      const occW = agents.filter(a => a.act === 'travail' || a.act === 'repas').length / Math.max(1, agents.length);
      M.workGlass.emissive.setScalar(Math.max(B.light.travail * 0.6, night * occW * 1.6));
      const th = agents.filter(a => a.act === 'theatre').length;
      const tp = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * B.pulse.loisirs * 0.5);
      const k = night * (th ? 1 : 0.4); M.theatreShell.material.emissive.setRGB(k * (0.05 + 0.16 * B.theatre * tp), k * (0.05 + 0.09 * B.theatre * tp), k * (0.07 + 0.16 * B.theatre * (1 - tp)));
      M.theatreTower.material.emissive.setScalar(night * 0.8);
      const cv = agents.filter(a => a.act === 'cls').length, slow = 0.5 + 0.5 * Math.sin(t * 0.6);           // "pulsés sur un rythme très lent", rouge clair
      M.cls.material.emissive.setRGB(night * (0.05 + (cv ? 0.14 * slow : 0)), night * (0.03 + (cv ? 0.03 * slow : 0)), night * (0.03 + (cv ? 0.04 * slow : 0)));
      const rx = agents.filter(a => a.act === 'relaxation').length;
      M.relax.material.emissive.setRGB(0.05 + 0.25 * night + (rx ? 0.1 : 0), 0.08 + 0.3 * night + (rx ? 0.15 : 0), 0.15 + 0.4 * night + (rx ? 0.25 : 0));
      const lc = roadLights.geometry.attributes.color, lz = roadLights.geometry.attributes.zone;
      for (let i = 0; i < lc.count; i++) {
        const z = ZONES[lz.getX(i)], L = B.light[z] || 0, s = B.S[z] ? B.S[z].lumiere : 0, f = B.pulse[z] || 0.5;
        const p = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 * f + i * 0.7);
        const warm = (s + 1) / 2; lc.setXYZ(i, L * p * lerp(0.45, 1, warm), L * p * lerp(0.6, 0.85, warm), L * p * lerp(1, 0.55, warm));
      }
      lc.needsUpdate = true;
      // climate partitions and odour diffusers
      curtains.forEach((c, i) => { c.material.opacity = B.climate * (0.12 + 0.05 * Math.sin(t * 2 + i)); c.visible = B.climate > 0.05 && SHOW.climat; });
      const pc = puffs.geometry.attributes.color, pb = puffs.geometry.userData;
      for (let i = 0; i < pc.count; i++) { const z = pb.zone[i] ? 'residence' : 'travail', o = B.odour[z] || 0, a = Math.abs(o) > 0.25 && SHOW.climat ? (Math.abs(o) - 0.25) * 1.3 : 0; const w = 0.5 + 0.5 * Math.sin(t * 1.5 + i); pc.setXYZ(i, a * w * (o > 0 ? 1 : 0.5), a * w * 0.8, a * w * (o > 0 ? 0.45 : 1)); }
      pc.needsUpdate = true;
      // sculptures: agitation of the towers, wandering of the mobile sculptures
      towers.forEach((tw, k) => tw.plates.forEach((p, j) => { p.rotation.y += dtRot(B.agitation, j); p.material.emissive.setScalar(night * 0.35 * (0.5 + 0.5 * Math.sin(t * (1 + 3 * B.agitation) + j))); }));
      sculptures.forEach((s, k) => {
        const g = s.g.position, dx = s.tgt[0] - g.x, dz = s.tgt[1] - g.z, d = Math.hypot(dx, dz);
        if (d < 3) s.tgt = [s.home[0] + (R() - 0.5) * s.home[2] * 2, s.home[1] + (R() - 0.5) * s.home[2] * 2];
        else { const v = Math.min(d, 0.8 * Math.min(60, speed) * 0.016 * 4); g.x += dx / d * v; g.z += dz / d * v; s.g.rotation.y = Math.atan2(dx, dz); }
        s.plates.forEach((p, j) => p.rotation.y += 0.02 + 0.06 * B.agitation * (j % 2 ? 1 : -1));
      });
      // inhabitants
      const pos = agentGeo.attributes.position, col = agentGeo.attributes.color;
      agents.forEach((a, i) => { pos.setXYZ(i, a.pos[0], a.pos[1] + 1.2, a.pos[2]); const c = TYPES[a.type].col, k = a.act === 'sommeil' ? 0.35 : 1; col.setXYZ(i, c[0] * k, c[1] * k, c[2] * k); });
      pos.needsUpdate = true; col.needsUpdate = true; agentPts.visible = SHOW.habitants;
      if (cam.follow >= 0) { const a = agents[cam.follow]; cam.target.lerp(new THREE.Vector3(a.pos[0], a.pos[1], a.pos[2]), 0.15); M.sel.visible = true; M.sel.position.set(a.pos[0], a.pos[1] + 1.2, a.pos[2]); M.sel.scale.setScalar(Math.max(2, cam.dist / 120)); } else M.sel.visible = false;
    }
    const ce = Math.cos(cam.el);
    camera.position.set(cam.target.x + Math.sin(cam.az) * ce * cam.dist, cam.target.y + Math.sin(cam.el) * cam.dist, cam.target.z + Math.cos(cam.az) * ce * cam.dist);
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
  }
  const dtRot = (ag, j) => (0.004 + 0.07 * ag * ag) * (j % 2 ? 1 : -1) * (1 + 0.3 * Math.sin(clock * 0.7 + j));
  const SHOW = { habitants: true, climat: true };

  return {
    init, start, frame, preset, project, cam, B, PL, TYPES, ACT, ZONES, TOPO, labels, SHOW, bands, counts, zoneOf, WANT,
    get agents() { return agents; }, get simT() { return simT; }, set simT(v) { simT = v; dayKey = ''; }, get speed() { return speed; }, set speed(v) { speed = v; },
    get voteRate() { return voteRate; }, setOnPick: f => onPick = f, follow: i => { cam.follow = i; if (i >= 0) cam.dist = Math.min(cam.dist, 260); }
  };
})();
