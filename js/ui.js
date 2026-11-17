/* ==========================================================================
   INTERFACE — the cybernetic centre's console
   ========================================================================== */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const tower = TOWER.build(1973);
  const n = DATA.channels.length;
  const remoteIdx = DATA.channels.map((c, i) => c.grp === 'lointain' ? i : -1).filter(i => i >= 0);
  const LIVE_ST = ['DIRECT', 'DIFFÉRÉ', 'DÉRIVÉ', 'ARCHIVE'];
  PROG.init(tower, n);
  const S = PROG.S;
  let PB = null, VB = null; // comparison programme and view
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tlc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tlc.' + k, JSON.stringify(v)); } catch (e) { } }
  };
  const opt = { speed: 1, shutdownWindow: store.get('shutdown', [0, 8]), language: store.get('language', true), manualSmoke: false, dusk: false };
  Object.assign(DATA.cfg, { avKey: store.get('avKey', ''), avSymbol: store.get('avSymbol', 'EWQ'), primKey: store.get('primKey', '') });

  const counts = {}; tower.organs.forEach(o => counts[o.type] = (counts[o.type] || 0) + 1);
  $('#count-total').textContent = tower.organs.filter(o => o.type <= 7).length.toLocaleString('fr-FR');

  // ---------------- 3D
  let viewOK = true;
  try { VIEW.init($('#view'), tower); } catch (e) { viewOK = false; $('#view-error').hidden = false; $('#view-error').textContent = 'WebGL indisponible : ' + e.message; }

  // ---------------- recorder (always on, in memory)
  const REC = { rows: [], events: [], max: 30000, seen: new WeakSet() };
  let lastLitA = 0, lastLitB = 0;
  function record(t, bits) {
    const row = {
      t, mode: DATA.REPLAY.active ? 'archive ' + DATA.REPLAY.day : DATA.mode, regime: S.regime, D: S.D, tau: S.tau,
      act: S.hist.act[S.hist.act.length - 1] || 0, lit: lastLitA, X: S.fns.map(f => f.group ? f.X : '-').join(''),
      bits: bits.join(''), x: DATA.channels.map(c => c.x), st: DATA.channels.map(c => c.status)
    };
    if (PB) { row.actB = PB.S.hist.act[PB.S.hist.act.length - 1] || 0; row.litB = lastLitB; row.XB = PB.S.fns.map(f => f.group ? f.X : '-').join(''); }
    REC.rows.push(row); if (REC.rows.length > REC.max) REC.rows.shift();
    S.events.forEach(e => { if (!REC.seen.has(e)) { REC.seen.add(e); REC.events.push(Object.assign({ prog: 'A' }, e)); } });
    if (PB) PB.S.events.forEach(e => { if (!REC.seen.has(e)) { REC.seen.add(e); REC.events.push(Object.assign({ prog: 'B' }, e)); } });
  }

  // ---------------- loop
  let simT = Date.now(), lastReal = performance.now(), lastTick = -1e12, lastUI = 0, lastSeisT = null, started = false;
  function litCount(OUT) { let k = 0; for (let i = 0; i < OUT.I.length; i++) if (OUT.I[i] > 0.05) k++; return k; }
  function advance() { const nowp = performance.now(); const dt = (nowp - lastReal); lastReal = nowp; simT += dt * opt.speed; tickIfDue(); }
  setInterval(advance, 1000); // keeps the programme and the recorder running when the tab is in the background
  function tickIfDue() {
    if (started && simT - lastTick >= 5000) {
      lastTick = simT;
      const bits = DATA.tick(simT);
      const ctx = DATA.ctx;
      const ph = DATA.byId.photo; const rad = (ph.status === 'DIRECT' || ph.status === 'ARCHIVE') ? ph.raw : null;
      const dark = rad != null ? (rad < 12 && ctx.sun.alt < 3) : ctx.sun.alt < -2;
      const light = rad != null ? (rad > 25) : ctx.sun.alt > 0;
      if (!opt.dusk && dark) opt.dusk = true; else if (opt.dusk && light) opt.dusk = false;
      const seisNew = ctx.seismic.time && ctx.seismic.time !== lastSeisT && ctx.seismic.time > simT - 600000; if (ctx.seismic.time) lastSeisT = ctx.seismic.time;
      const x = DATA.channels.map(c => c.x);
      const o = { remoteIdx, paris: DATA.parisParts(new Date(simT)), dusk: opt.dusk, shutdownWindow: opt.shutdownWindow, seismicI: ctx.seismic.I || 0, seismicNew: seisNew, manualSmoke: opt.manualSmoke, language: opt.language };
      PROG.tick(simT, x, bits, ctx, o);
      if (PB) PB.tick(simT, x, bits, ctx, o);
      opt.manualSmoke = false;
      record(simT, bits);
      try { SIM73.step(simT, bits); lpDirty = true; } catch (e) { }
    }
  }
  function loop() {
    advance(); const nowp = performance.now();
    const OUT = PROG.sample(simT); lastOUT = OUT;
    if (viewOK) VIEW.frame(OUT, DATA.ctx, S, simT);
    lastLitA = litCount(OUT);
    if (PB && VB) { const OB = PB.sample(simT); lastOUTB = OB; VB.frame(OB, DATA.ctx, PB.S, simT); lastLitB = litCount(OB); }
    if (overlayOn) placeOverlay();
    if (nowp - lastUI > 500) { lastUI = nowp; updateUI(OUT); }
    teletypeStep();
    requestAnimationFrame(loop);
  }

  // ---------------- tabs
  $$('#tabs button').forEach(b => b.addEventListener('click', () => {
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + b.dataset.tab);
    if (b.dataset.tab === 'analyse') analyse();
    if (b.dataset.tab === 'listing') { lpDirty = true; }
  }));
  $('#panel-toggle').addEventListener('click', () => { document.body.classList.toggle('panel-closed'); setTimeout(resizeAll, 50); });

  // ---------------- sensors
  const sensBox = { proche: $('#sens-proche'), lointain: $('#sens-lointain') };
  const rows = {};
  DATA.channels.forEach((c, j) => {
    const r = document.createElement('div'); r.className = 'srow';
    r.innerHTML = `<div class="sname"><span class="j">x<sub>${j + 1}</sub></span> ${c.fr}<small>${c.en}</small></div>
      <div class="sval"></div><div class="sbar"><i></i></div><span class="badge"></span>
      <canvas class="spark" width="120" height="22"></canvas><div class="ssrc">${c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${c.src}</a>` : c.src}<span class="snote"></span></div>`;
    sensBox[c.grp].appendChild(r); rows[c.id] = r;
  });
  const stClass = s => 'badge st-' + s.normalize('NFD').replace(/[^A-Za-z]/g, '');
  function updateSensors() {
    DATA.channels.forEach(c => {
      const r = rows[c.id];
      r.querySelector('.sval').textContent = c.display;
      r.querySelector('.sbar i').style.width = (c.x * 100).toFixed(0) + '%';
      const b = r.querySelector('.badge'); b.textContent = c.status; b.className = stClass(c.status);
      r.querySelector('.snote').textContent = c.note ? ' — ' + c.note : '';
      const cv = r.querySelector('.spark'), g = cv.getContext('2d'); g.clearRect(0, 0, 120, 22);
      const h = c.hist.slice(-120); if (h.length < 2) return;
      g.strokeStyle = '#d9c7a0'; g.lineWidth = 1; g.beginPath();
      h.forEach((p, i) => { const x = i / 119 * 120, y = 21 - p[1] * 20; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    });
  }

  // ---------------- programme
  const BIT_LABELS = ['bruit 1', 'bruit 2', 'bruit 3', 'bruit 4', 'vent 10 m', 'vent 80 m', 'vent 120 m', 'vent 180 m', 'circul. 1', 'circul. 2'];
  BIT_LABELS.forEach(l => { const d = document.createElement('div'); d.className = 'bit'; d.innerHTML = `<i></i><span>${l}</span>`; $('#bits').appendChild(d); });
  const TYPE_COL = { 1: '#9fb3c8', 2: '#f4f1e8', 3: '#e2a03f', 4: '#c77dff', 5: '#ffffff', 6: '#f6d860', 7: '#ff5a4e', 8: '#8a8a8a' };
  let hoverFn = null;
  const gcv = $('#groups'), gctx = gcv.getContext('2d'); const GC = 24;
  gcv.addEventListener('mousemove', e => {
    const r = gcv.getBoundingClientRect(); const cw = gcv.width / GC; const x = (e.clientX - r.left) * gcv.width / r.width, y = (e.clientY - r.top) * gcv.height / r.height;
    const k = Math.floor(y / cw) * GC + Math.floor(x / cw); const g = S.groups[k]; hoverFn = g && g.fn >= 0 ? S.fns[g.fn] : null;
  });
  gcv.addEventListener('mouseleave', () => hoverFn = null);
  function updateProgramme() {
    $('#reg-name').textContent = S.regime.toUpperCase(); $('#reg-name').className = 'reg-' + S.regime;
    $('#reg-D').textContent = S.D; $('#reg-tau').textContent = S.tau.toFixed(2);
    $('#reg-seuil').textContent = (PROG.REGIME[S.regime].seuil * 100) + ' %';
    $('#pq').textContent = `${S.p} fonctions X_i · ${S.q} groupes (${S.centaines.length} centaines × ≤5 classes) · tête de série ${S.head}`;
    const bits = DATA.ctx.regimeBits; $$('#bits .bit').forEach((d, i) => d.classList.toggle('on', !!bits[i]));
    const fc = $('#fig1'), f = fc.getContext('2d'); const W = fc.width, H = fc.height; f.clearRect(0, 0, W, H);
    const hist = S.hist.bits, rowsN = 10, rh = H / rowsN;
    f.font = '17px IBM Plex Mono, monospace';
    for (let r = 0; r < rowsN; r++) {
      const y = r * rh + rh / 2; f.fillStyle = '#8c8577'; f.fillText(BIT_LABELS[r], 4, y + 5);
      f.strokeStyle = '#4a463e'; f.lineWidth = 1; f.setLineDash([3, 3]); f.beginPath(); f.moveTo(130, y); f.lineTo(W, y); f.stroke(); f.setLineDash([]);
      f.strokeStyle = '#efe6d2'; f.lineWidth = 6;
      hist.forEach((b, i) => { if (b[r]) { const x = 130 + i * (W - 130) / 60; f.beginPath(); f.moveTo(x, y); f.lineTo(x + (W - 130) / 60, y); f.stroke(); } });
    }
    const cw = gcv.width / GC; gctx.clearRect(0, 0, gcv.width, gcv.height);
    S.groups.forEach((g, k) => {
      const x = (k % GC) * cw, y = Math.floor(k / GC) * cw; const fn = g.fn >= 0 ? S.fns[g.fn] : null;
      gctx.fillStyle = !fn ? '#1d1c19' : fn.X ? TYPE_COL[g.type] : '#3a3730'; gctx.fillRect(x + 1, y + 1, cw - 2, cw - 2);
      if (fn && hoverFn === fn) { gctx.strokeStyle = '#fff'; gctx.strokeRect(x + 0.5, y + 0.5, cw - 1, cw - 1); }
    });
    const act = {}; S.fns.forEach(fn => { if (fn.group && fn.X) act[fn.group.type] = (act[fn.group.type] || 0) + fn.group.organs.length; });
    $('#types').innerHTML = Object.keys(PROG.TYPE_NAMES).map(t => `<div><i style="background:${TYPE_COL[t]}"></i>${t}) ${PROG.TYPE_NAMES[t]} <b>${act[t] || 0}</b>/${counts[t]}</div>`).join('');
    const fn = hoverFn || S.lastEval; if (!fn || !fn.group) return;
    const g = fn.group; const terms = [];
    for (let j = 0; j < n; j++) if (fn.A[j] > 0) terms.push(`<tr><td>x<sub>${j + 1}</sub></td><td>${DATA.channels[j].fr}</td><td>${fn.A[j].toFixed(2)}</td><td>${DATA.channels[j].x.toFixed(2)}</td></tr>`);
    $('#insp').innerHTML = `<div class="ih">X<sub>${fn.i}</sub> → centaine ${g.centaine}, classe ${g.cls} · ${PROG.TYPE_NAMES[g.type]} · N<sub>i</sub> = ${g.organs.length}</div>
      <table><tr><th></th><th>entrée</th><th>A<sub>ij</sub></th><th>x<sub>j</sub></th></tr>${terms.join('')}</table>
      <div class="ieq">f = Σ A<sub>ij</sub>x<sub>j</sub> = ${(fn.f + fn.K).toFixed(3)} · K = ${fn.K.toFixed(3)} · f − K = <b class="${fn.f > 0 ? 'pos' : 'neg'}">${fn.f >= 0 ? '+' : ''}${fn.f.toFixed(3)}</b></div>
      <div class="ieq">${fn.passed ? `tirage u = ${fn.u.toFixed(3)} ${fn.u < fn.seuil ? '<' : '≥'} ${fn.seuil} → ` : ''}X<sub>${fn.i}</sub> = <b>${fn.X}</b> · Y<sub>i</sub> = ${fn.Y.toFixed(1)} s · θ<sub>i</sub> = Y/N = ${fn.theta.toFixed(2)} s${fn.lively ? ' · tirage orienté' : ''}</div>
      ${fn.X ? `<div class="ieq">mode n° ${fn.mode.id} / 50 : <i>${fn.mode.name}</i></div>` : ''}`;
  }

  // ---------------- abacus
  function updateAbacus() {
    const cv = $('#abacus'), g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    const rods = [['repetition', 'répétition'], ['saturation', 'saturation'], ['stagnation', 'stagnation'], ['accident', 'perturbations accidentelles']];
    g.strokeStyle = '#6d5a3c'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
    rods.forEach(([k, label], r) => {
      const y = 52 + r * (H - 60) / 4; g.strokeStyle = '#8a7a5c'; g.lineWidth = 2; g.beginPath(); g.moveTo(14, y); g.lineTo(W - 14, y); g.stroke();
      const v = S.abacus[k]; const tens = Math.floor(v / 10), units = v % 10;
      for (let b = 0; b < 10; b++) {
        const right = b < units; const x = right ? W - 40 - b * 28 : 40 + (b - units) * 28;
        g.fillStyle = right ? (k === 'accident' ? '#c9a24a' : '#d4553f') : '#4a3f30';
        g.beginPath(); g.ellipse(x, y, 13, 15, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#cfc4ad'; g.font = '19px IBM Plex Mono, monospace'; g.fillText(`${label} · ${v}${tens ? ' (dizaines : ' + tens + ')' : ''}`, 22, y - 21);
    });
    const ev = S.events.filter(e => /INDIFFÉRENCE|ACCIDENTELLE|DISPARITION|RÉAPPARITION/.test(e.s)).slice(-12).reverse();
    $('#indiff-log').innerHTML = ev.map(e => `<div><time>${new Date(e.t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}</time> ${e.s}</div>`).join('') || '<div class="dim">aucune intervention pour l’instant</div>';
    const ac = $('#actchart'), a = ac.getContext('2d'); a.clearRect(0, 0, ac.width, ac.height);
    const draw = (h, col) => { a.strokeStyle = col; a.lineWidth = 2; a.beginPath(); h.forEach((v, i) => { const x = i / 239 * ac.width, y = ac.height - v * ac.height; i ? a.lineTo(x, y) : a.moveTo(x, y); }); a.stroke(); };
    draw(S.hist.act, '#e2a03f'); if (PB) draw(PB.S.hist.act, '#79b8d9');
    a.fillStyle = '#8c8577'; a.font = '17px IBM Plex Mono, monospace'; a.fillText('part des groupes commandés, X = 1 (20 min)' + (PB ? ' · A orange, B bleu' : ''), 8, 20);
  }

  // ---------------- schema
  function updateSchema() {
    $('#sch-tower').setAttribute('class', 'sch-tower reg-' + S.regime);
    const recent = e => e && simT - e.t < 6000;
    const ind = [...S.events].reverse().find(e => /INDIFFÉRENCE/.test(e.s)), acc = [...S.events].reverse().find(e => /ACCIDENTELLE/.test(e.s));
    $('#sch-ind').classList.toggle('fire', recent(ind)); $('#sch-acc').classList.toggle('fire', recent(acc));
    $('#sch-cap').textContent = `${DATA.channels.filter(c => LIVE_ST.includes(c.status)).length}/${n}`;
    $('#sch-env-x').textContent = `τ ${S.tau.toFixed(2)}`; $('#sch-reg').textContent = `D = ${S.D}`;
  }


  // ---------------- what does this light answer to? (click an organ)
  let lastOUT = null, lastOUTB = null, picked = null;
  const COLFR = ['bleu', 'rouge', 'jaune', 'orange', 'violet', 'blanc'];
  const DIRFR = ['est', 'sud', 'ouest', 'nord'];
  function choose(id, which) {
    if (id < 0) { picked = null; $('#pick').hidden = true; VIEW.select(-1); if (VB) VB.select(-1); return; }
    picked = { id, which }; VIEW.select(which === 'A' ? id : -1); if (VB) VB.select(which === 'B' ? id : -1);
    $('#pick').hidden = false; explain();
  }
  if (viewOK) VIEW.setOnPick(id => choose(id, 'A'));
  $('#pick-close').addEventListener('click', () => choose(-1));
  function explain() {
    if (!picked) return;
    const P = picked.which === 'B' && PB ? PB : PROG, SS = P.S, OUTp = picked.which === 'B' ? lastOUTB : lastOUT;
    const o = tower.organs[picked.id];
    const g = SS.groups.find(gr => gr.organs.indexOf(o) >= 0);
    const hm = (o.p[1]).toFixed(0);
    let what = PROG.TYPE_NAMES[o.type];
    if (o.type === 2) what += o.laserFlash ? ' — flash laser de 10 MW au sommet' : o.big ? ' — flash de grande puissance' : ' — petit flash';
    if (o.type === 4) what += ` — obturateur trichrome ${o.trio.join(' / ')}, moteur ${o.motor} tr/min`;
    if (o.type === 5 || o.type === 6) what += o.summit ? ' — au sommet, faisceau de 2 km' : ' — en bout de bras, faisceau de 2 km';
    if (o.type === 7) what += ` — renvoyé par un miroir de l’axe n° ${o.target.ax + 1}`;
    if (o.type === 1) what += ` — axe n° ${o.axis + 1}, groupe de vitesse « ${o.speed} »`;
    const I = OUTp ? OUTp.I[o.id] : 0;
    const colNow = OUTp && OUTp.colour[o.id] !== 255 ? COLFR[OUTp.colour[o.id]] : o.colour;
    let h = `<div class="pk-h">${what}</div>
      <div class="pk-s">à ${hm} m, face ${DIRFR[o.d]}${colNow ? ` · couleur ${colNow}` : ''} · organe n° ${o.id + 1} sur ${tower.organs.length}${picked.which === 'B' ? ' · tour B' : ''}</div>`;
    const on = o.type === 1 ? Math.abs(OUTp ? OUTp.axisSpeed[o.axis] : 0) > 0.01 : I > 0.05;
    h += `<div class="pk-state ${on ? 'on' : ''}">${o.type === 1 ? (on ? `en rotation, ${(Math.abs(OUTp.axisSpeed[o.axis]) * 60 / (2 * Math.PI)).toFixed(1)} tr/min` : 'à l’arrêt') : o.type === 2 ? (on ? 'éclair à cet instant' : 'éteint à cet instant') : (on ? `allumé, ${(I * 100).toFixed(0)} % de puissance` : 'éteint')}</div>`;
    if (o.type === 1) {
      const mates = tower.organs.filter(m => m.type === 1 && m.axis === o.axis && m !== o);
      if (mates.length) h += `<div class="pk-why">Les ${mates.length + 1} miroirs de cet axe partagent un seul moteur : il tourne dès que l’un d’eux est commandé, si bien que la rotation peut venir de la fonction d’un autre miroir du même axe.</div>`;
    }
    if (!g) { $('#pick-body').innerHTML = h; return; }
    h += `<h4>Groupe</h4><div>centaine ${g.centaine}, classe ${g.cls} · ${g.organs.length} organes tirés au sort ensemble (§ 5.II)</div>`;
    if (g.fn < 0) {
      h += `<div class="pk-why">Ce groupe est <b>au repos</b> : avec la tête de série ${SS.head}, son numéro dépasse p = ${SS.p}. Il ne répond à aucune entrée jusqu’à la prochaine réaffectation.</div>`;
    } else {
      const f = SS.fns[g.fn], left = Math.max(0, (f.t0 + f.Y * 1000 - simT) / 1000), ago = Math.max(0, (simT - f.t0) / 1000);
      h += `<h4>Fonction X<sub>${f.i}</sub> = ${f.X}</h4><div class="dim">décidée il y a ${ago.toFixed(0)} s, avec les entrées de ce moment-là (valeur actuelle entre parenthèses)</div><table class="pk-t"><tr><th>entrée</th><th>A<sub>ij</sub></th><th>x<sub>j</sub></th><th>A·x</th><th></th></tr>`;
      const rowsT = []; for (let j = 0; j < n; j++) if (f.A[j] > 0) rowsT.push([j, f.A[j], f.xs ? f.xs[j] : DATA.channels[j].x, DATA.channels[j].x]);
      rowsT.sort((a, b) => b[1] * b[2] - a[1] * a[2]);
      rowsT.forEach(([j, a, x, xn]) => { const c = DATA.channels[j]; h += `<tr><td>x<sub>${j + 1}</sub> ${c.fr}</td><td>${a.toFixed(2)}</td><td>${x.toFixed(2)} <span class="dim">(${xn.toFixed(2)})</span></td><td><b>${(a * x).toFixed(2)}</b></td><td><span class="${stClass(c.status)}">${c.status}</span></td></tr>`; });
      h += `</table><div>f = ${(f.f + f.K).toFixed(3)} · seuil K = ${f.K.toFixed(3)} (abaissé ou relevé par la tonalité τ = ${SS.tau.toFixed(2)}) · f − K = <b class="${f.f > 0 ? 'pos' : 'neg'}">${f.f >= 0 ? '+' : ''}${f.f.toFixed(3)}</b></div>`;
      if (f.passed) h += `<div>tirage de validation u = ${f.u.toFixed(3)} ${f.u < f.seuil ? '<' : '≥'} ${f.seuil} (régime ${f.reg || SS.regime} au moment du tirage) → ${f.u < f.seuil ? 'validé' : 'refusé'}</div>`;
      else h += `<div>f − K ≤ 0 : la fonction ne fonctionne pas, quel que soit le tirage.</div>`;
      if (f.X && f.mode) { const r = f.ranks ? f.ranks[g.organs.indexOf(o)] : 0; h += `<div>mode n° ${f.mode.id} : <i>${f.mode.name}</i> · cet organe est le ${r + 1}<sup>e</sup> sur ${g.organs.length}, commandé ${(f.mode.o === 9 ? 0 : r * f.theta).toFixed(1)} s après le début du cycle (r·θ, θ = ${f.theta.toFixed(2)} s)</div>`; }
      h += `<div class="dim">cycle de ${f.Y.toFixed(1)} s, nouveau calcul dans ${left.toFixed(0)} s${f.lively ? ' · tirage orienté (une entrée dépasse 0,85)' : ''}</div>`;
      // why it may still be dark
      const why = [];
      if (SS.shutdown) why.push('extinction nocturne');
      if (!SS.night && (o.type >= 5 && o.type <= 7)) why.push('de jour, gros projecteurs et lasers débranchés (p. 100)');
      if (o.type === 4 && SS.regime === 'bleu') why.push('régime bleu : projecteurs à obturateurs éteints (annexe 3)');
      if (colNow && SS.regime === 'bleu' && colNow === 'rouge') why.push('régime bleu : sorties rouges bloquées, B_i = max (organigramme)');
      if (colNow && SS.regime === 'bleu' && (colNow === 'orange' || colNow === 'violet')) why.push('régime bleu : priorité aux bleus, blancs et jaunes, cette couleur à 30 % (lecture de la p. 114)');
      if (colNow && SS.regime === 'rouge' && colNow === 'bleu') why.push('régime rouge : sorties bleues bloquées, B_i = max (organigramme)');
      if (colNow && SS.regime === 'rouge' && (colNow === 'jaune' || colNow === 'blanc')) why.push('régime rouge : dominante rouge, cette couleur atténuée (lecture de la p. 114)');
      if (o.type !== 2 && o.type !== 1) why.push(`plafond d’intensité du régime ${SS.regime} : ${({ bleu: 60, normal: 75, rouge: 90 })[SS.regime]} % (annexe 1)`);
      if (SS.special) why.push(SS.special.kind === 'meteo' ? 'langage conventionnel : annonce météo en cours' : 'langage conventionnel : signal de circulation en cours');
      if (SS.vanish) why.push('tour disparue dans la fumée');
      if (SS.antagonist) why.push(`flashes antagonistes (${SS.antagonist.kind})`);
      if (why.length) h += `<h4>Ce qui l’emporte en ce moment</h4><div>${why.join(' · ')}</div>`;
    }
    $('#pick-body').innerHTML = h;
  }
  setInterval(explain, 500);

  // ---------------- analysis: is the tower still interacting with its environment?
  const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
  function corr(a, b) { const ma = mean(a), mb = mean(b); let c = 0, va = 0, vb = 0; for (let i = 0; i < a.length; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return va && vb ? c / Math.sqrt(va * vb) : 0; }
  function r2(Y, Xs) { // ridge-stabilised least squares, R² of output on all inputs
    const N = Y.length, k = Xs[0].length + 1; if (N < k + 10) return null;
    const A = Array.from({ length: k }, () => new Float64Array(k)), b = new Float64Array(k);
    for (let i = 0; i < N; i++) { const row = [1, ...Xs[i]]; for (let p = 0; p < k; p++) { b[p] += row[p] * Y[i]; for (let q = 0; q < k; q++) A[p][q] += row[p] * row[q]; } }
    for (let p = 1; p < k; p++) A[p][p] += 1e-3 * N;
    for (let p = 0; p < k; p++) { let mx = p; for (let r = p + 1; r < k; r++) if (Math.abs(A[r][p]) > Math.abs(A[mx][p])) mx = r; [A[p], A[mx]] = [A[mx], A[p]]; [b[p], b[mx]] = [b[mx], b[p]]; const d = A[p][p] || 1e-12; for (let r = p + 1; r < k; r++) { const f = A[r][p] / d; for (let q = p; q < k; q++) A[r][q] -= f * A[p][q]; b[r] -= f * b[p]; } }
    const w = new Float64Array(k); for (let p = k - 1; p >= 0; p--) { let s = b[p]; for (let q = p + 1; q < k; q++) s -= A[p][q] * w[q]; w[p] = s / (A[p][p] || 1e-12); }
    const my = mean(Y); let ssr = 0, sst = 0; for (let i = 0; i < N; i++) { const row = [1, ...Xs[i]]; let yh = 0; for (let p = 0; p < k; p++) yh += w[p] * row[p]; ssr += (Y[i] - yh) ** 2; sst += (Y[i] - my) ** 2; }
    return sst ? 1 - ssr / sst : 0;
  }
  function analyse() {
    const R = REC.rows; const box = $('#ana');
    $('#rec-count').textContent = `${R.length} relevés (Δt = 5 s) · ${REC.events.length} événements · depuis ${R.length ? new Date(R[0].t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '—'}`;
    if (R.length < 60) { box.innerHTML = '<p class="dim">Il faut au moins cinq minutes de relevés. L’analyse se met à jour à l’ouverture de cet onglet.</p>'; return; }
    const total = tower.organs.filter(o => o.type <= 7).length;
    const lit = R.map(r => r.lit / total), act = R.map(r => r.act);
    const X = R.map(r => r.x);
    const cors = DATA.channels.map((c, j) => ({ c, r: corr(X.map(v => v[j]), lit) })).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    const rD = corr(R.map(r => r.D), lit);
    const R2 = r2(lit, X), R2a = r2(act, X);
    const wins = [[12, '1 min'], [60, '5 min'], [360, '30 min'], [1440, '2 h']].filter(([w]) => R.length >= w * 3);
    const tot = sd(lit);
    const wrows = wins.map(([w, l]) => { const m = []; for (let i = 0; i + w <= lit.length; i += w) m.push(mean(lit.slice(i, i + w))); return `<tr><td>${l}</td><td>${m.length}</td><td>${(mean(m) * 100).toFixed(1)} %</td><td>${(sd(m) * 100).toFixed(2)}</td><td>${tot ? (sd(m) / tot).toFixed(2) : '—'}</td></tr>`; }).join('');
    const reg = { bleu: 0, normal: 0, rouge: 0 }; R.forEach(r => reg[r.regime]++);
    let html = `<h3>Couplage ville → tour</h3>
      <p>Part de la variation des organes allumés expliquée linéairement par les ${n} entrées : <b>R² = ${R2 == null ? '—' : R2.toFixed(3)}</b> (organes allumés), <b>${R2a == null ? '—' : R2a.toFixed(3)}</b> (fonctions X = 1). Corrélation avec D : <b>${rD.toFixed(3)}</b>.</p>
      <table class="ana"><tr><th>entrée</th><th>r</th><th></th></tr>${cors.slice(0, 10).map(o => `<tr><td>${o.c.fr}</td><td>${o.r.toFixed(3)}</td><td><i style="width:${Math.abs(o.r) * 100}%;background:${o.r > 0 ? '#8fd18b' : '#d4553f'}"></i></td></tr>`).join('')}</table>
      <h3>Local / global (Stener Jørgensen & Laplante-Anfossi)</h3>
      <p>Écart-type des moyennes par fenêtre, rapporté à l’écart-type de la série brute. Un rapport qui tombe vite vers zéro décrit une tour imprévisible de près et semblable à elle-même de loin.</p>
      <table class="ana"><tr><th>fenêtre</th><th>n</th><th>moyenne</th><th>é.-t. (pts)</th><th>rapport</th></tr>${wrows}</table>
      <h3>Régimes</h3><p>bleu ${(reg.bleu / R.length * 100).toFixed(0)} % · normal ${(reg.normal / R.length * 100).toFixed(0)} % · rouge ${(reg.rouge / R.length * 100).toFixed(0)} % · interventions de la cellule : ${REC.events.filter(e => /INDIFFÉRENCE/.test(e.s)).length}</p>`;
    if (R[0].litB != null) {
      const litB = R.filter(r => r.litB != null).map(r => r.litB / total), XB = R.filter(r => r.litB != null).map(r => r.x);
      const R2b = r2(litB, XB);
      html += `<h3>Comparaison A / B</h3><p>R² A = ${R2 == null ? '—' : R2.toFixed(3)} · R² B = ${R2b == null ? '—' : R2b.toFixed(3)} · corrélation A↔B = ${corr(lit.slice(-litB.length), litB).toFixed(3)} · moyenne allumée A ${(mean(lit) * 100).toFixed(1)} %, B ${(mean(litB) * 100).toFixed(1)} %</p>`;
    }
    box.innerHTML = html;
  }
  function csv() {
    const head = ['temps_iso', 'heure_paris', 'source', 'regime', 'D', 'tau', 'part_X1', 'organes_allumes', 'capteurs_10', 'X_fonctions', ...DATA.channels.map((c, j) => `x${j + 1}_${c.id}`), ...DATA.channels.map(c => `etat_${c.id}`)];
    const hasB = REC.rows.some(r => r.litB != null); if (hasB) head.push('B_part_X1', 'B_organes_allumes', 'B_X_fonctions');
    const lines = [head.join(',')];
    REC.rows.forEach(r => { const l = [new Date(r.t).toISOString(), new Date(r.t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' }), r.mode, r.regime, r.D, r.tau.toFixed(4), r.act.toFixed(4), r.lit, "'" + r.bits, "'" + r.X, ...r.x.map(v => v.toFixed(4)), ...r.st]; if (hasB) l.push(r.actB != null ? r.actB.toFixed(4) : '', r.litB != null ? r.litB : '', r.XB ? "'" + r.XB : ''); lines.push(l.join(',')); });
    return lines.join('\n');
  }
  function csvEvents() { return ['temps_iso,programme,evenement', ...REC.events.map(e => `${new Date(e.t).toISOString()},${e.prog},"${e.s.replace(/"/g, '""')}"`)].join('\n'); }
  function download(name, text) {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    catch (e) { $('#rec-msg').textContent = 'Téléchargement impossible ici ; utilisez « copier ».'; }
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  $('#rec-dl').addEventListener('click', () => download(`tlc-releves-${stamp()}.csv`, csv()));
  $('#rec-dl-ev').addEventListener('click', () => download(`tlc-evenements-${stamp()}.csv`, csvEvents()));
  $('#rec-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(csv()); $('#rec-msg').textContent = 'Copié.'; } catch (e) { $('#rec-msg').textContent = 'Copie refusée par le navigateur.'; } });
  $('#rec-clear').addEventListener('click', () => { REC.rows = []; REC.events = []; analyse(); });
  $('#ana-run').addEventListener('click', analyse);

  // ---------------- comparison
  const CRIT = [
    ['Kmin', 'K : borne basse de κ', 'number', 0.05], ['Kspan', 'K : étendue de κ', 'number', 0.05], ['onScale', 'durée moyenne allumée ×', 'number', 0.1],
    ['meanOff', 'durée moyenne au repos (s)', 'number', 1], ['pq', 'part des groupes commandés p/q', 'number', 0.02], ['reassign', 'réaffectation (s)', 'number', 30],
    ['sMin', 'entrées par fonction (min)', 'number', 1], ['sMax', 'entrées par fonction (max)', 'number', 1],
    ['law', 'loi des durées Y', ['gamma', 'uniforme', 'exponentielle']], ['capMode', '60/75/90 % lus comme', ['intensité', 'proportion']]
  ];
  function critForm(id, P) {
    $(id).innerHTML = CRIT.map(([k, l, t, step]) => `<label>${l}</label>` + (Array.isArray(t) ? `<select data-k="${k}">${t.map(v => `<option${P.CR[k] === v ? ' selected' : ''}>${v}</option>`).join('')}</select>` : `<input type="number" data-k="${k}" step="${step}" value="${P.CR[k]}">`)).join('');
  }
  function readForm(id) { const o = {}; $$(id + ' [data-k]').forEach(el => o[el.dataset.k] = el.tagName === 'SELECT' ? el.value : +el.value); return o; }
  critForm('#critA', PROG);
  const PRESETS = {
    proportion: { capMode: 'proportion', label: 'B' }, uniforme: { law: 'uniforme' }, sobre: { sMin: 1, sMax: 2 },
    vive: { reassign: 60, onScale: 0.5, meanOff: 5 }, lente: { reassign: 1200, onScale: 2.5, meanOff: 30 }, ouverte: { pq: 0.95, Kmin: 0.4 }
  };
  function startCompare(critB) {
    if (!PB) {
      PB = makeProg(Object.assign({ label: 'B' }, critB)); PB.init(tower, n);
      document.body.classList.add('compare');
      try { VB = makeView(VIEW.cam, { driver: false }); VB.init($('#viewB'), tower); VB.setOnPick(id => choose(id, 'B')); } catch (e) { VB = null; }
      resizeAll();
    } else { PB.setCriteria(critB); PB.init(tower, n); }
    critForm('#critB', PB); $('#cmp-stop').disabled = false;
    $('#labelB-text').textContent = 'B — ' + Object.entries(PB.CR).filter(([k, v]) => !['label', 'quiet'].includes(k) && v !== ({ Kmin: 0.6, Kspan: 0.35, onScale: 1, meanOff: 10, pq: 0.72, reassign: 300, law: 'gamma', sMin: 3, sMax: 7, capMode: 'intensité' })[k]).map(([k, v]) => `${k} ${v}`).join(' · ');
  }
  $('#cmp-start').addEventListener('click', () => startCompare(PB ? readForm('#critB') : {}));
  $$('#cmp-presets button').forEach(b => b.addEventListener('click', () => startCompare(Object.assign(readFormSafe(), PRESETS[b.dataset.p]))));
  function readFormSafe() { return PB ? readForm('#critB') : Object.assign({}, PROG.CR, { label: 'B' }); }
  $('#critA-apply').addEventListener('click', () => { PROG.setCriteria(readForm('#critA')); PROG.init(tower, n); });
  $('#cmp-stop').addEventListener('click', () => { if (VB) VB.dispose(); VB = null; PB = null; document.body.classList.remove('compare'); $('#cmp-stop').disabled = true; $('#critB').innerHTML = ''; resizeAll(); });
  function resizeAll() { VIEW.resize(); if (VB) VB.resize(); }
  window.addEventListener('resize', resizeAll);

  // ---------------- archives (replay)
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  $('#rp-day').value = yest; $('#rp-day').max = yest;
  $('#rp-go').addEventListener('click', async () => {
    const day = $('#rp-day').value; if (!day) return;
    $('#rp-msg').textContent = 'Chargement des archives…';
    try {
      const r = await DATA.loadReplay(day);
      simT = r.t0 + (+$('#rp-hour').value) * 3600000; lastTick = -1e12;
      opt.speed = +$('#rp-speed').value; $('#speed').value = String(opt.speed);
      $('#rp-msg').textContent = `Archives du ${day} chargées.` + (r.notes.length ? ' Lacunes : ' + r.notes.join(' ; ') : '') + ' Les lignes sans archive (téléphones, radio, presse, Bourse, Métro, Vélib’, Chambre, pompiers) passent en simulation.';
      $('#rp-stop').disabled = false;
    } catch (e) { $('#rp-msg').textContent = 'Échec : ' + e.message; }
  });
  $('#rp-stop').addEventListener('click', () => { DATA.stopReplay(); simT = Date.now(); opt.speed = 1; $('#speed').value = '1'; $('#rp-stop').disabled = true; $('#rp-msg').textContent = 'Retour au direct.'; });

  // ---------------- documents
  const DOCS = [
    ['p86', 'Tour Lumière Cybernétique : maquette', 86], ['p87', 'Vue d’ensemble 1 (rendu de nuit)', 87], ['p89', 'Vue d’ensemble 2', 89], ['p91', 'La T.L.C. et la perspective de la Défense (maquettes de situation)', 91],
    ['p132', 'Façade et circulation verticale (façade 2, section 6)', 132], ['p131', 'Coupe générale ; plan du parking et sous-sol du socle', 131], ['p133', 'Plan de situation', 133],
    ['p98', 'Schéma du centre de contrôle et de régulation d’une ville cybernétique', 98], ['p99', 'Schéma théorique du fonctionnement de la T.L.C.', 99],
    ['p107', 'Salle des ordinateurs', 107], ['p116', 'Figure 1 : états des capteurs de bruit et de vent', 116], ['p121', 'Organigramme de principe', 121], ['p123', 'Description des six fenêtres simulées', 123]
  ];
  $('#docs').innerHTML = DOCS.map(([f, t, p]) => `<figure data-f="${f}"><img src="img/${f}.jpg" alt="${t}" loading="lazy" onerror="this.parentNode.classList.add('missing')"><figcaption>${t} <span class="dim">p. ${p}</span></figcaption></figure>`).join('');
  $$('#docs figure').forEach(fg => fg.addEventListener('click', () => { const [f, t, p] = DOCS.find(d => d[0] === fg.dataset.f); $('#lb-img').src = `img/${f}.jpg`; $('#lb-cap').textContent = `${t} — Schöffer, La Tour Lumière Cybernétique, 1973, p. ${p}. © ADAGP, Paris.`; $('#lightbox').hidden = false; }));
  $('#lightbox').addEventListener('click', () => $('#lightbox').hidden = true);
  // overlay of façade 2 (p. 132) on the rendered tower
  let overlayOn = false; const ov = $('#overlay-facade');
  $('#ov-toggle').addEventListener('click', () => { overlayOn = !overlayOn; ov.hidden = !overlayOn; if (overlayOn) { VIEW.preset('facade'); VIEW.cam.auto = false; } $('#ov-toggle').textContent = overlayOn ? 'retirer le dessin' : 'superposer la façade 2 (p. 132)'; });
  $('#ov-opacity').addEventListener('input', e => ov.style.opacity = e.target.value);
  function placeOverlay() {
    // drawing rows: level 0 at 1771.5 px, level 307 m at 70.8 px, core axis at 257.3 px (image 515 × 1929)
    const p0 = VIEW.project(0, 0, 0), p1 = VIEW.project(0, 307, 0);
    const k = (p0.y - p1.y) / (1771.5 - 70.8);
    ov.style.height = (1929 * k) + 'px'; ov.style.width = (515 * k) + 'px';
    ov.style.left = (p0.x - 257.3 * k) + 'px'; ov.style.top = (p0.y - 1771.5 * k) + 'px';
  }


  // ---------------- situation map: where the tower would have stood, and where we are looking from
  let MM = null, MM_mark = () => { }, MM_cur = () => 'ign';
  function initMap() {
    if (typeof L === 'undefined') { $('#minimap').hidden = true; return; }
    const site = [DATA.SITE.lat, DATA.SITE.lon];
    const map = L.map('mm', { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false }).setView(site, 15);
    const layers = {
      plan: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
      sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar' }),
      ign: L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS.1965-1980&STYLE=BDORTHOHISTORIQUE&TILEMATRIXSET=PM_3_18&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png', { maxZoom: 18, attribution: 'IGN, photographies aériennes 1965–1980' })
    };
    let cur = store.get('mmLayer', 'ign'); layers[cur].addTo(map);
    // four mutually exclusive modes: 1965–80, plan, satellite, 3D
    const mark = k => $$('#minimap .mmbar [data-l], #mm-3d').forEach(x => x.classList.toggle('on', (x.dataset.l || '3d') === k));
    $$('#minimap [data-l]').forEach(b => b.addEventListener('click', () => {
      if (MAP3D.isSmall()) { MAP3D.close(); setTimeout(() => map.invalidateSize(), 50); }
      map.removeLayer(layers[cur]); cur = b.dataset.l; layers[cur].addTo(map); store.set('mmLayer', cur); mark(cur);
    }));
    mark(cur);
    MM_mark = mark; MM_cur = () => cur;
    $('#mm-min').addEventListener('click', () => { $('#minimap').classList.toggle('min'); setTimeout(() => map.invalidateSize(), 50); });
    const m2ll = (e, nn) => [site[0] + nn / 111320, site[1] + e / (111320 * Math.cos(site[0] * Math.PI / 180))];
    const sq = (hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([e, s]) => m2ll(e, -s));
    L.polygon(sq(35, 35), { color: '#e2a03f', weight: 1, fillOpacity: 0.15 }).addTo(map);              // socle 70 × 70 m
    L.polygon(sq(tower.CX, tower.CZ), { color: '#ff3b2e', weight: 2, fillColor: '#ff3b2e', fillOpacity: 0.7 }).addTo(map); // core 36 × 23 m
    const cone = L.polygon([site, site, site], { color: '#ffe9b0', weight: 1.5, fillColor: '#ffe9b0', fillOpacity: 0.28, interactive: false }).addTo(map);
    const eye = L.circleMarker(site, { radius: 4, color: '#fff', fillColor: '#5b7cff', fillOpacity: 1, weight: 1.5 }).addTo(map);
    MM = { map, cone, eye, site, m2ll, lastZ: 15, lastC: site };
  }
  function updateMap() {
    if (!MM) return;
    const c = VIEW.cam, cv = $('#view');
    const flat = Math.cos(c.el) * c.dist;
    const e = Math.sin(c.az) * flat, nn = -Math.cos(c.az) * flat;          // camera offset from the tower (m)
    const eyeLL = MM.m2ll(e, nn); MM.eye.setLatLng(eyeLL);
    const bearing = Math.atan2(-e, -nn);                                 // direction of view, from north, clockwise
    const aspect = cv.clientWidth / Math.max(1, cv.clientHeight), hf = Math.atan(Math.tan(19 * Math.PI / 180) * aspect);
    const len = Math.max(900, flat * 1.8), pts = [eyeLL];
    for (let k = 0; k <= 8; k++) { const b = bearing - hf + 2 * hf * k / 8; pts.push(MM.m2ll(e + Math.sin(b) * len, nn + Math.cos(b) * len)); }
    MM.cone.setLatLngs(pts);
    // keep both the tower and the viewer in frame; refit only when the view has moved noticeably
    const key = Math.round(flat / 60) + ':' + Math.round(eyeLL[0] * 2000) + ':' + Math.round(eyeLL[1] * 2000);
    if (key !== MM.lastKey) { MM.lastKey = key; MM.map.fitBounds(L.latLngBounds([MM.site, eyeLL]).pad(0.35), { animate: false, maxZoom: 17 }); }
    $('#mm-cap').textContent = `regard vers ${Math.round(((bearing * 180 / Math.PI) % 360 + 360) % 360)}° · ${Math.round(flat)} m du pied`;
  }
  try { initMap(); } catch (e) { $('#minimap').hidden = true; }
  $('#mm-3d').addEventListener('click', () => { if (!MAP3D.isSmall()) { MAP3D.open(tower, 'small'); MM_mark('3d'); } });
  $('#mm-big').addEventListener('click', () => { MAP3D.open(tower, 'large'); MM_mark(MM_cur()); });
  $('#m3d-shrink').addEventListener('click', () => { MAP3D.shrink(); MM_mark('3d'); });
  $('#m3d-close').addEventListener('click', () => { MAP3D.close(); MM_mark(MM_cur()); setTimeout(() => MM && MM.map.invalidateSize(), 50); });
  $('#m3d-sat').addEventListener('click', () => MAP3D.toggleSat());
  $('#m3d-follow').addEventListener('change', e => MAP3D.setFollow(e.target.checked));
  setInterval(() => MAP3D.sync(), 120);
  setInterval(updateMap, 150);


  // ---------------- the listing of the 1973 simulation
  let lpDirty = false;
  function renderListing() {
    if (!lpDirty) return; lpDirty = false;
    const txt = SIM73.S.pages.slice(-12).join('\n\n');
    const vis = !$('#tab-listing').hidden, big = !$('#lpmodal').hidden;
    if (vis) { const el = $('#listing'); el.textContent = txt; el.parentNode.scrollTop = el.parentNode.scrollHeight; }
    if (big) { const el = $('#listing-big'); el.textContent = txt; el.parentNode.scrollTop = el.parentNode.scrollHeight; }
    if (!vis && !big) lpDirty = true;
  }
  setInterval(renderListing, 400);
  $('#lp-big').addEventListener('click', () => { $('#lpmodal').hidden = false; lpDirty = true; renderListing(); });
  $('#lp-close').addEventListener('click', () => $('#lpmodal').hidden = true);
  $('#lp-dl').addEventListener('click', () => { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([SIM73.text()], { type: 'text/plain;charset=utf-8' })); a.download = `tlc-listing-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); } catch (e) { } });


  // ---------------- plain-language summary of the inputs, every ten minutes
  let sumLang = store.get('sumLang', 'fr'), lastSum = 0;
  const live = id => ['DIRECT', 'DIFFÉRÉ', 'DÉRIVÉ', 'ARCHIVE'].includes(DATA.byId[id].status);
  function trend(id) { // compare with ten minutes ago
    const c = DATA.byId[id], h = c.hist; if (h.length < 3) return 0;
    const t0 = Date.now() - 600000; let old = h[0]; for (const p of h) { if (p[0] <= t0) old = p; else break; }
    const d = c.x - old[1]; return Math.abs(d) < 0.06 ? 0 : d > 0 ? 1 : -1;
  }
  const cut = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…';
  function summarise() {
    const fr = sumLang === 'fr', C = DATA.byId, x = DATA.ctx, L = [];
    const T = (a, b) => fr ? a : b;
    const tw = id => { const t = trend(id); return t > 0 ? T(' et en hausse', ', rising') : t < 0 ? T(' et en baisse', ', falling') : ''; };
    const lvl = (v, words) => words[Math.min(words.length - 1, Math.floor(v * words.length))];
    // weather and light
    if (live('thermo')) {
      const w = x.wind || {}, gust = Math.round((w.v10 || 0) * (w.gust || 1));
      const sky = x.cloud > 85 ? T('ciel couvert', 'overcast') : x.cloud > 50 ? T('nuageux', 'cloudy') : x.cloud > 20 ? T('quelques nuages', 'a few clouds') : T('ciel dégagé', 'clear sky');
      const rain = x.precip > 0 ? T(', il pleut', ', raining') : '';
      L.push(T(`<b>Météo</b> — ${C.thermo.raw.toFixed(0)} °C, ${sky}${rain}, humidité ${C.hygro.raw} %. Vent ${Math.round(w.v10 || 0)} km/h au sol (rafales vers ${gust}), ${Math.round(w.v180 || 0)} km/h à 180 m, à hauteur du sommet${tw('vent180')}.`,
        `<b>Weather</b> — ${C.thermo.raw.toFixed(0)} °C, ${sky}${rain}, humidity ${C.hygro.raw}%. Wind ${Math.round(w.v10 || 0)} km/h at ground level (gusts around ${gust}), ${Math.round(w.v180 || 0)} km/h at 180 m, the height of the upper tower${tw('vent180')}.`));
    }
    const alt = x.sun.alt;
    L.push(T(`<b>Lumière</b> — ${alt > 6 ? `plein jour, soleil à ${alt.toFixed(0)}° : les gros projecteurs et les lasers restent éteints` : alt > -6 ? `crépuscule : la tour allume ses projecteurs de nuit au passage du seuil` : `nuit : tous les effets jouent`}${x.moon.illum > 0.5 && alt < 0 ? `, lune à ${(x.moon.illum * 100).toFixed(0)} %` : ''}.`,
      `<b>Light</b> — ${alt > 6 ? `full daylight, sun at ${alt.toFixed(0)}°: the big projectors and lasers stay off` : alt > -6 ? `dusk: the tower switches on its night projectors as the threshold passes` : `night: every effect is in play`}${x.moon.illum > 0.5 && alt < 0 ? `, moon ${(x.moon.illum * 100).toFixed(0)}% full` : ''}.`));
    if (live('meteo') && x.forecast) L.push(T(`<b>Demain</b> — ${x.forecast.bad > .66 ? 'mauvais temps annoncé' : x.forecast.bad < .33 ? 'beau temps annoncé' : 'temps mitigé annoncé'} (c’est ce que la tour annonce le soir en rouge ou en bleu).`, `<b>Tomorrow</b> — ${x.forecast.bad > .66 ? 'bad weather forecast' : x.forecast.bad < .33 ? 'fair weather forecast' : 'mixed weather forecast'} (what the tower signals in the evening, red for bad, blue for fair).`));
    // the city
    if (live('circulation')) {
      const busy = lvl(C.circulation.x, fr ? ['très calme', 'calme', 'moyenne', 'chargée', 'très chargée'] : ['very quiet', 'quiet', 'average', 'busy', 'very busy']);
      L.push(T(`<b>Circulation</b> — ${busy} pour l’heure (relevés de la veille à la même heure) : ${Math.round(C.circulation.raw)} véhicules/h par point de comptage, ${(C.saturation.raw * 100).toFixed(1)} % des points saturés. C’est elle qui fait l’essentiel du « bruit » estimé, ${C.micro.raw.toFixed(0)} dB.`,
        `<b>Traffic</b> — ${busy} for the hour (yesterday's counts at the same hour): ${Math.round(C.circulation.raw)} vehicles/h per counter, ${(C.saturation.raw * 100).toFixed(1)}% of counters jammed. It also drives the estimated street noise, ${C.micro.raw.toFixed(0)} dB.`));
    }
    if (live('velib')) L.push(T(`<b>Vélib’</b> — environ ${Math.round(C.velib.x * 60)} % des vélos sont sortis de leurs bornes${tw('velib')}.`, `<b>Bikes</b> — about ${Math.round(C.velib.x * 60)}% of Vélib’ bikes are out on the streets${tw('velib')}.`));
    if (live('metro')) L.push(T(`<b>Métro, RER, trains</b> — ${C.metro.raw} perturbations signalées.`, `<b>Metro, RER, trains</b> — ${C.metro.raw} disruptions reported.`));
    // talk and news
    if (live('presse')) L.push(T(`<b>Presse</b> — ${C.presse.raw} dépêches dans l’heure${x.headline ? ` ; la plus récente : « ${cut(x.headline, 110)} »` : ''}.`, `<b>Press</b> — ${C.presse.raw} news items in the last hour${x.headline ? `; latest: “${cut(x.headline, 110)}”` : ''}.`));
    if (live('telephone') || live('telegraphe')) L.push(T(`<b>Conversations</b> — ${live('telephone') ? `${C.telephone.raw.toFixed(0)} messages en français par minute sur Bluesky` : ''}${live('telephone') && live('telegraphe') ? ', ' : ''}${live('telegraphe') ? `${C.telegraphe.raw.toFixed(0)} modifications par minute sur Wikipédia` : ''}${tw('telephone')} (les « téléphones » et « télégraphes » de la tour).`,
      `<b>Chatter</b> — ${live('telephone') ? `${C.telephone.raw.toFixed(0)} French-language posts a minute on Bluesky` : ''}${live('telephone') && live('telegraphe') ? ', ' : ''}${live('telegraphe') ? `${C.telegraphe.raw.toFixed(0)} edits a minute on French Wikipedia` : ''}${tw('telephone')} (the tower's “telephones” and “telegraphs”).`));
    if (live('chambre')) L.push(T(`<b>Assemblée</b> — ${/en séance/.test(C.chambre.display) ? 'probablement en séance' : 'hors séance'}${x.lcpHeadline ? ` ; LCP : « ${cut(x.lcpHeadline, 100)} »` : ''}.`, `<b>National Assembly</b> — ${/en séance/.test(C.chambre.display) ? 'probably sitting' : 'not sitting'}${x.lcpHeadline ? `; LCP: “${cut(x.lcpHeadline, 100)}”` : ''}.`));
    if (live('radio')) L.push(T(`<b>Radio</b> — France Inter ${C.radio.x > .6 ? 'parle fort' : C.radio.x < .3 ? 'est presque silencieuse' : 'à volume moyen'}.`, `<b>Radio</b> — France Inter is ${C.radio.x > .6 ? 'loud' : C.radio.x < .3 ? 'almost silent' : 'at an average level'}.`));
    if (live('hopitaux')) L.push(T(`<b>Urgences</b> — passages pour infections respiratoires en Île-de-France ${C.hopitaux.x > .66 ? 'élevés' : C.hopitaux.x < .33 ? 'bas' : 'moyens'} pour l’année (données hebdomadaires).`, `<b>Hospitals</b> — emergency visits for respiratory infections in Île-de-France are ${C.hopitaux.x > .66 ? 'high' : C.hopitaux.x < .33 ? 'low' : 'moderate'} for the year (weekly data).`));
    if (live('seisme')) L.push(x.seismic.I > 1 ? T(`<b>Séismes</b> — ${x.seismic.label}, à peine perceptible ici.`, `<b>Earthquakes</b> — ${x.seismic.label}, barely perceptible here.`) : T('<b>Séismes</b> — rien de ressenti dans les dernières 24 h.', '<b>Earthquakes</b> — nothing felt in the last 24 hours.'));
    // the tower's answer
    const R = REC.rows.filter(r => r.t > simT - 600000);
    if (R.length > 5) {
      const reg = { bleu: 0, normal: 0, rouge: 0 }; R.forEach(r => reg[r.regime]++);
      const main = Object.entries(reg).sort((a, b) => b[1] - a[1])[0][0];
      const lit = Math.round(R.reduce((s, r) => s + r.lit, 0) / R.length);
      const ind = REC.events.filter(e => e.t > simT - 600000 && /INDIFFÉRENCE/.test(e.s)).length;
      const name = { bleu: T('bleu (calme)', 'blue (calm)'), normal: T('normal', 'normal'), rouge: T('rouge (excité)', 'red (excited)') };
      L.push(T(`<b>La tour</b> — surtout en régime ${name[main]} ces dix dernières minutes (${Math.round(reg[main] / R.length * 100)} % du temps), en moyenne ${lit} lumières allumées${ind ? `, ${ind} intervention${ind > 1 ? 's' : ''} de la cellule d’indifférence` : ''}${S.vanish ? ', disparue dans la fumée' : ''}.`,
        `<b>The tower</b> — mostly in the ${name[main]} régime over the last ten minutes (${Math.round(reg[main] / R.length * 100)}% of the time), with ${lit} lights on average${ind ? `, ${ind} intervention${ind > 1 ? 's' : ''} by the indifference cell` : ''}${S.vanish ? ', hidden in smoke' : ''}.`));
    }
    const simIds = DATA.channels.filter(c => !['DIRECT', 'DIFFÉRÉ', 'DÉRIVÉ', 'ARCHIVE'].includes(c.status)).map(c => fr ? c.fr : (c.id.startsWith('vent') ? `${c.en} ${c.id.slice(4)} m` : c.en));
    if (simIds.length) L.push(`<span class="dim">${T('Pas en direct pour l’instant (simulé ou clé requise) : ', 'Not live at the moment (simulated or key needed): ')}${simIds.join(', ')}.</span>`);
    const now = new Date(simT).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    $('#sum-body').innerHTML = L.map(l => `<p>${l}</p>`).join('');
    $('#sum-time').textContent = T(`mis à jour ${now} · prochain dans 10 min`, `updated ${now} · next in 10 min`);
    lastSum = Date.now();
  }
  $$('#sumbox [data-lang]').forEach(b => { b.classList.toggle('on', b.dataset.lang === sumLang); b.addEventListener('click', e => { e.preventDefault(); sumLang = b.dataset.lang; store.set('sumLang', sumLang); $$('#sumbox [data-lang]').forEach(x => x.classList.toggle('on', x === b)); if (started) summarise(); }); });
  setInterval(() => { if (!started) return; const age = Date.now() - lastSum; if ((lastSum === 0 && REC.rows.length >= 8) || age >= 600000) summarise(); }, 5000);

  // ---------------- teletype
  let ttQueue = [], ttLine = null, ttShown = 0, lastLog = 0; const tt = $('#teletype');
  function teletypeStep() {
    DATA.log.forEach(l => { if (l.t > lastLog) ttQueue.push(l); }); if (DATA.log.length) lastLog = DATA.log[DATA.log.length - 1].t;
    if (!ttLine && ttQueue.length) {
      const l = ttQueue.shift(); ttLine = document.createElement('div');
      ttLine.dataset.full = `${new Date(l.t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}  ${l.s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()}`; ttShown = 0; tt.appendChild(ttLine);
      while (tt.children.length > 160) tt.removeChild(tt.firstChild);
    }
    if (ttLine) { ttShown = Math.min(ttLine.dataset.full.length, ttShown + (ttQueue.length > 8 ? 12 : 3)); ttLine.textContent = ttLine.dataset.full.slice(0, ttShown); if (ttShown >= ttLine.dataset.full.length) ttLine = null; tt.scrollTop = tt.scrollHeight; }
  }

  // ---------------- HUD
  function updateUI(OUT) {
    $('#clock').textContent = new Date(simT).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: DATA.REPLAY.active ? 'numeric' : undefined, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const m = DATA.REPLAY.active ? 'archive' : DATA.mode;
    $('#mode').textContent = DATA.REPLAY.active ? 'ARCHIVES ' + DATA.REPLAY.day : DATA.mode === 'live' ? 'DONNÉES RÉELLES' : 'SIMULATION'; $('#mode').className = 'mode-' + m;
    $('#hud-reg').textContent = S.regime; $('#hud-reg').className = 'chip reg-' + S.regime; $('#hud-D').textContent = S.D;
    $('#hud-lit').textContent = lastLitA.toLocaleString('fr-FR'); $('#hud-spin').textContent = Array.from(OUT.axisSpeed).filter(v => Math.abs(v) > 0.01).length;
    let st = S.vanish ? 'disparue dans la fumée' : S.shutdown ? 'extinction nocturne' : S.special ? (S.special.kind === 'meteo' ? 'langage conventionnel : météo' : 'langage conventionnel : circulation') : opt.dusk ? 'nuit — tous les paramètres jouent' : 'jour — gros projecteurs et lasers débranchés';
    if (S.antagonist) st += ` · flashes antagonistes (${S.antagonist.kind})`; $('#hud-state').textContent = st;
    if (PB) $('#labelB-stats').textContent = `${lastLitB.toLocaleString('fr-FR')} allumés`;
    $('#labelA-stats').textContent = `${lastLitA.toLocaleString('fr-FR')} allumés`;
    if (!$('#tab-capteurs').hidden) updateSensors(); if (!$('#tab-programme').hidden) updateProgramme(); if (!$('#tab-indifference').hidden) updateAbacus(); if (!$('#tab-schema').hidden) updateSchema();
    if (!$('#tab-analyse').hidden) $('#rec-count').textContent = `${REC.rows.length} relevés · ${REC.events.length} événements`;
    $('#live-count').textContent = `${DATA.channels.filter(c => LIVE_ST.includes(c.status)).length} / ${n} lignes réelles`;
  }

  // ---------------- settings
  $('#av-key').value = DATA.cfg.avKey; $('#av-sym').value = DATA.cfg.avSymbol; $('#prim-key').value = DATA.cfg.primKey;
  $('#keys-save').addEventListener('click', () => {
    DATA.cfg.avKey = $('#av-key').value.trim(); DATA.cfg.avSymbol = $('#av-sym').value.trim() || 'EWQ'; DATA.cfg.primKey = $('#prim-key').value.trim();
    store.set('avKey', DATA.cfg.avKey); store.set('avSymbol', DATA.cfg.avSymbol); store.set('primKey', DATA.cfg.primKey);
    if (DATA.mode === 'live') DATA.refreshKeys(); $('#keys-msg').textContent = 'Enregistré dans ce navigateur.';
  });
  $$('input[name=shut]').forEach(r => { r.checked = r.value === opt.shutdownWindow.join('-'); r.addEventListener('change', () => { opt.shutdownWindow = r.value.split('-').map(Number); store.set('shutdown', opt.shutdownWindow); }); });
  $('#speed').addEventListener('change', e => { opt.speed = +e.target.value; });
  $('#lang').checked = opt.language; $('#lang').addEventListener('change', e => { opt.language = e.target.checked; store.set('language', opt.language); });
  $('#btn-smoke').addEventListener('click', () => { opt.manualSmoke = true; });
  $('#btn-reassign').addEventListener('click', () => PROG.reassign(simT, 'commande manuelle'));
  $('#btn-now').addEventListener('click', () => { if (!DATA.REPLAY.active) simT = Date.now(); });
  $('#mic').addEventListener('change', e => { if (e.target.checked) DATA.startMic(); else DATA.stopMic(); });
  $('#radio').addEventListener('change', e => { DATA.cfg.radio = e.target.checked; if (e.target.checked) DATA.startAudio(); else ['inter', 'info'].forEach(k => { const r = DATA.ctx.radio[k]; if (r) r.el.pause(); }); });
  $$('#views button[data-v]').forEach(b => b.addEventListener('click', () => VIEW.preset(b.dataset.v)));
  $('#autorot').addEventListener('click', () => { VIEW.cam.auto = !VIEW.cam.auto; });
  DATA.ctx.mirrorWind = store.get('mirrorWind', false); $('#mwind').checked = DATA.ctx.mirrorWind;
  $('#mwind').addEventListener('change', e => { DATA.ctx.mirrorWind = e.target.checked; store.set('mirrorWind', e.target.checked); });

  // ---------------- start
  $('#start').addEventListener('click', async () => {
    $('#overlay').classList.add('going');
    DATA.cfg.radio = $('#start-radio').checked; $('#radio').checked = DATA.cfg.radio;
    DATA.cfg.mic = $('#start-mic').checked; $('#mic').checked = DATA.cfg.mic;
    const m = await DATA.start(); started = true; $('#overlay').hidden = true;
    if (m === 'sim' && !/github\.io$/.test(location.hostname)) $('#simnote').hidden = false;
  });
  $('#simnote-close').addEventListener('click', () => $('#simnote').hidden = true);
  window.TLC = { REC, analyse, get PB() { return PB; } };
  requestAnimationFrame(loop);
})();
