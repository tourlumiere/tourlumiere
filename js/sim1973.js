/* ==========================================================================
   LISTING — Schöffer's own reduced simulation (Appendix 6, pp. 112–124),
   run as specified and printed as a line-printer listing.

   What the book fixes: 5-minute passes, ΔT = 5 s (60 instants); 10 binary
   sensors (4 noise, 4 wind, 2 road); 33 outputs — 18 groups of 3 coloured
   projectors, 12 groups of 3 small coloured flashes, 1 group of 3 shutter
   projectors, 2 groups each with one large coloured flash — in 6 windows
   (table p. 123); F_i = Σ_j C_i^j X_e^j − B_i, validated by a uniform draw
   below 0.60 / 0.75 / 0.90; "rouges B_i = max" in the blue régime and
   "bleues B_i = max" in the red (organigramme p. 121); shutter table p. 124;
   results printed at each instant T as "une image physique" of the façades
   by landing and of each of the six windows, "en évitant la codification"
   (pp. 113, 116). Mirrors were not simulated (p. 113).
   What it does not fix: the listings' layout, which was not published
   "à cause de sa longueur" (p. 113, n. 1). The page below is a reconstruction.
   ========================================================================== */
const SIM73 = (function () {
  'use strict';
  const W = 100; // columns
  const WIN = [ // p. 123
    { n: 1, proj: ['BLANCS', 'BLEU CLAIR', 'JAUNES'], fl: null, big: null, obt: false },
    { n: 2, proj: ['ROUGES', 'BLEU FONCE', 'VIOLETS'], fl: ['BLEUS', 'JAUNES', 'BLANCS'], big: null, obt: false },
    { n: 3, proj: ['ORANGE', 'BLEU CLAIR', 'JAUNES'], fl: null, big: null, obt: true },
    { n: 4, proj: ['VIOLETS', 'BLEU FONCE', 'ORANGE'], fl: ['ROUGES', 'ORANGES', 'VIOLETS'], big: null, obt: true },
    { n: 5, proj: ['JAUNES', 'BLANCS', 'ROUGES'], fl: ['BLANCS', 'JAUNES', 'BLANCS'], big: 'BLEU', obt: true },
    { n: 6, proj: ['BLANCS', 'VIOLETS', 'BLEU FONCE'], fl: ['ROUGES', 'ORANGE', 'VIOLETS'], big: 'ROUGE', obt: false }
  ];
  // the 33 outputs, numbered in the order of p. 114
  const OUT = [];
  WIN.forEach(w => w.proj.forEach(c => OUT.push({ kind: 'PROJ', win: w.n, col: c })));             // S01–S18
  WIN.forEach(w => w.fl && w.fl.forEach(c => OUT.push({ kind: 'FLASH', win: w.n, col: c })));        // S19–S30
  OUT.push({ kind: 'OBT', win: [3, 4, 5], col: 'TRICHROME' });                                       // S31
  WIN.forEach(w => w.big && OUT.push({ kind: 'GRAND', win: w.n, col: w.big }));                       // S32–S33
  OUT.forEach((o, i) => o.s = i + 1);
  const warm = c => /ROUGE|ORANGE|VIOLET/.test(c), cool = c => /BLEU/.test(c);

  const S = { pass: 0, instant: 0, C: [], B: [], pages: [], allText: [], startT: null };
  function newPass(t) {
    S.pass++; S.instant = 0; S.startT = t;
    // C_i^j "aléatoires ou prédéterminés": drawn at random for each pass; B_i constant within the pass
    S.C = OUT.map(() => Array.from({ length: 10 }, () => Math.round(Math.random() * 100) / 100));
    S.B = S.C.map(c => Math.round(c.reduce((s, v) => s + v, 0) * (0.35 + Math.random() * 0.2) * 100) / 100);
  }
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n), rpad = (s, n) => (' '.repeat(n) + s).slice(-n);
  const f2 = v => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(2);

  function step(t, bits) {
    if (!S.startT || S.instant >= 60) newPass(t);
    S.instant++;
    const D = bits.reduce((s, b) => s + b, 0);
    const reg = D <= 3 ? 'BLEU' : D >= 8 ? 'ROUGE' : 'NORMAL';
    const seuil = { BLEU: 0.60, NORMAL: 0.75, ROUGE: 0.90 }[reg], inten = { BLEU: 60, NORMAL: 75, ROUGE: 90 }[reg];
    const res = OUT.map((o, i) => {
      const Bmax = (reg === 'BLEU' && warm(o.col)) || (reg === 'ROUGE' && cool(o.col));
      const sum = S.C[i].reduce((s, c, j) => s + c * bits[j], 0);
      const F = Bmax ? -Infinity : sum - S.B[i];
      let u = null, X = 0;
      if (F > 0) { u = Math.random(); X = u < seuil ? 1 : 0; }
      return { o, F, sum, u, X, Bmax };
    });
    // shutter projectors follow the table of p. 124
    const obt = res[30]; const obtLit = obt.X && reg !== 'BLEU', obtMotor = obt.X && reg === 'ROUGE';
    const page = print(t, bits, D, reg, seuil, inten, res, obtLit, obtMotor);
    S.pages.push(page); if (S.pages.length > 60) S.pages.shift();
    S.allText.push(page); if (S.allText.length > 3000) S.allText.shift();
    return page;
  }

  function cell(r) { // nine-character window cell: one mark per lamp of the group
    const k = r.o.kind; if (!r.X) return k === 'FLASH' ? '. . .' : '...';
    return k === 'FLASH' ? '* * *' : '###';
  }
  function print(t, bits, D, reg, seuil, inten, res, obtLit, obtMotor) {
    const L = [];
    const mm = Math.floor((S.instant - 1) * 5 / 60), ss = ((S.instant - 1) * 5) % 60;
    const clock = new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
    if (S.instant === 1) {
      L.push('1' + '*'.repeat(W - 1));
      L.push(' *' + pad('  T.L.C.  SIMULATION DU FONCTIONNEMENT ET VISUALISATION DE CERTAINS ELEMENTS DE LA TOUR', W - 3) + '*');
      L.push(' *' + pad(`  PASSAGE ${rpad(String(S.pass), 3)}   DUREE 5 MN   DT = 5 S   10 CAPTEURS   33 SORTIES   6 FENETRES`, W - 3) + '*');
      L.push(' *' + pad('  COEFFICIENTS C(I,J) TIRES AU HASARD POUR CE PASSAGE   SEUILS B(I) CONSTANTS', W - 3) + '*');
      L.push(' *' + pad('  MIROIRS NON SIMULES (P. 113)   MISE EN PAGE RECONSTITUEE, LES LISTINGS N\'AYANT PAS ETE PUBLIES', W - 3) + '*');
      L.push(' ' + '*'.repeat(W - 1));
      L.push('');
    }
    L.push((S.instant === 1 ? ' ' : '1') + pad(`T.L.C. SIMULATION   PASSAGE ${rpad(String(S.pass), 3)}`, 40) + pad(`INSTANT ${rpad(String(S.instant), 2)}/60   T = ${String(mm).padStart(2, '0')} MN ${String(ss).padStart(2, '0')} S`, 38) + rpad(`HEURE ${clock}`, W - 79));
    L.push(' ' + '-'.repeat(W - 1));
    const b = i => bits[i] ? 'X' : '.';
    L.push(` CAPTEURS    BRUIT  1 2 3 4      VENT  1 2 3 4      CIRCULATION  1 2        X = EXCITE`);
    L.push(`             ETAT   ${b(0)} ${b(1)} ${b(2)} ${b(3)}            ${b(4)} ${b(5)} ${b(6)} ${b(7)}                   ${b(8)} ${b(9)}`);
    L.push(` D = SOMME A(J).XE(J) = ${rpad(String(D), 2)}     REGIME ${pad(reg, 7)}   SEUIL DE VALIDATION ${seuil.toFixed(2)}   INTENSITE ${inten} PCT   SORTIES ACTIVES ${rpad(String(res.filter(r => r.X).length), 2)}/33`);
    if (reg === 'BLEU') L.push('             REGIME BLEU : SORTIES ROUGES, ORANGES, VIOLETTES  B(I) = MAX');
    if (reg === 'ROUGE') L.push('             REGIME ROUGE : SORTIES BLEUES  B(I) = MAX');
    L.push('');
    // façade overview: the six windows by landing, front and back faces (p. 116, p. 121)
    const win = n => {
      const rs = res.filter(r => r.o.win === n);
      const pj = rs.filter(r => r.o.kind === 'PROJ').map(cell).join(' ');
      const fl = rs.filter(r => r.o.kind === 'FLASH'); const flS = fl.length ? fl.some(r => r.X) ? ' * ' : ' . ' : '   ';
      const g = rs.find(r => r.o.kind === 'GRAND'); const gS = g ? (g.X ? '@' : 'o') : ' ';
      const o = [3, 4, 5].includes(n) ? (obtLit ? (obtMotor ? '%' : '=') : '-') : ' ';
      return `${pj}${flS}${gS}${o}`;
    };
    const face = (title, ns) => [
      `      ${pad(title, 30)}`,
      `             |    |    |`,
      `       ======+====+====+======  PALIER 3`,
      `       |  ${pad(win(ns[2]), 18)}|  FEN ${ns[2]}`,
      `       ======+====+====+======  PALIER 2`,
      `       |  ${pad(win(ns[1]), 18)}|  FEN ${ns[1]}`,
      `       ======+====+====+======  PALIER 1`,
      `       |  ${pad(win(ns[0]), 18)}|  FEN ${ns[0]}`,
      `      /|____________________|\\`,
      `     /________ SOCLE _________\\`
    ];
    const A = face('FACE AVANT', [1, 2, 3]), Bk = face('FACE ARRIERE', [4, 5, 6]);
    A.forEach((l, i) => L.push(' ' + pad(l, 48) + Bk[i]));
    L.push('    ### PROJECTEURS ALLUMES  ... ETEINTS  * PETITS FLASHES  @ GRAND FLASH  = OBTURATEURS  % AVEC MOTEUR');
    L.push('');
    // detail of each window, in words
    WIN.forEach(w => {
      L.push(` FENETRE ${w.n}   ${w.n <= 3 ? 'FACE AVANT' : 'FACE ARRIERE'}, PALIER ${((w.n - 1) % 3) + 1}`);
      res.filter(r => r.o.win === w.n || (Array.isArray(r.o.win) && r.o.win.includes(w.n))).forEach(r => {
        const name = r.o.kind === 'PROJ' ? `3 PROJECTEURS ${r.o.col}` : r.o.kind === 'FLASH' ? `3 PETITS FLASHES ${r.o.col}` : r.o.kind === 'GRAND' ? `1 GRAND FLASH ${r.o.col}` : '1 PROJECTEUR A OBTURATEUR';
        const Fs = r.Bmax ? 'B = MAX    ' : `F = ${f2(r.F)}`;
        const draw = r.u == null ? ' '.repeat(18) : `TIRAGE ${r.u.toFixed(2)} ${r.u < seuil ? '<' : '>'} ${seuil.toFixed(2)}`;
        let st;
        if (r.o.kind === 'OBT') st = obtLit ? (obtMotor ? 'ALLUME, MOTEUR BRANCHE' : 'ALLUME, MOTEUR DEBRANCHE') : (r.X ? 'ETEINT (REGIME DESEXCITE)' : 'ETEINT, MOTEUR DEBRANCHE');
        else if (r.o.kind === 'FLASH' || r.o.kind === 'GRAND') st = r.X ? 'ECLAIRS' : 'AU REPOS';
        else st = r.X ? `ALLUMES ${inten} PCT` : 'ETEINTS';
        L.push(`    S${String(r.o.s).padStart(2, '0')}  ${pad(name, 30)} ${pad(Fs, 11)}  ${draw}   ${st}`);
      });
    });
    L.push('');
    if (S.instant === 60) { L.push(' T = T + DT     FIN SIMULATION ?  OUI     STOP'); L.push(''); L.push(' NOUVEAU PASSAGE AVEC DE NOUVEAUX COEFFICIENTS'); }
    else L.push(' T = T + DT     FIN SIMULATION ?  NON');
    return L.join('\n');
  }
  function text() { return S.allText.join('\n\n'); }
  return { step, S, text, OUT, WIN };
})();
