/* UI for La Ville cybernétique */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const T = I18N.T, tx = I18N.tx, LOC = () => I18N.locale();
  const V = VILLE;
  const ZN = { travail: ['ville de travail', 'work city'], residence: ['ville résidentielle', 'residential city'], loisirs: ['loisirs', 'leisure'] };
  const TN = { lumiere: ['lumière', 'light'], son: ['son', 'sound'], climat: ['climat', 'climate'], odeur: ['odeurs', 'odours'] };
  const tn = (m, k) => T(m[k][0], m[k][1]);
  let started = false, pickId = -1, pickBld = null;

  try { V.init($('#city')); } catch (e) { $('#view-error').hidden = false; $('#view-error').textContent = 'WebGL: ' + e.message; }
  const setTitle = () => document.title = T('La Ville cybernétique — simulation sur données de Paris', 'La Ville cybernétique — a simulation on Paris data');
  I18N.on(setTitle); setTitle();

  // ---------------- start
  $('#start').addEventListener('click', async () => {
    $('#overlay').hidden = true; started = true;
    V.start(+$('#pop').value || 2000);
    DATA.start({ radio: false });
    if ($('#start-sound').checked && typeof SOUND !== 'undefined') { SOUND.start(); $('#snd-toggle').classList.add('on'); }
  });
  function loop(t) { V.frame(t); placeLabels(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  setInterval(() => { if (started) { updateHUD(); const tab = $$('#tabs button').find(b => b.classList.contains('on')).dataset.tab; if (tab === 'cerveau') updateBrain(); if (tab === 'habitants') updatePop(); explain(); } }, 700);

  // ---------------- tabs, panel, views
  $$('#tabs button').forEach(b => b.addEventListener('click', () => { $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); $$('.tab').forEach(s => s.hidden = s.id !== 'tab-' + b.dataset.tab); if (b.dataset.tab === 'cerveau') updateBrain(); if (b.dataset.tab === 'habitants') updatePop(); }));
  $('#panel-toggle').addEventListener('click', () => document.body.classList.toggle('panel-closed'));
  $$('#views [data-v]').forEach(b => b.addEventListener('click', () => { V.preset(b.dataset.v); pickId = -1; V.follow(-1); }));
  $('#follow').addEventListener('click', () => { const awake = V.agents.filter(a => a.act !== 'sommeil'); const a = (awake.length ? awake : V.agents)[Math.floor(Math.random() * (awake.length || V.agents.length))]; choose(a.id); });
  $('#speed').addEventListener('change', e => V.speed = +e.target.value);
  $('#btn-now').addEventListener('click', () => { V.simT = Date.now(); });
  $('#snd-toggle').addEventListener('click', () => { SOUND.on ? SOUND.stop() : SOUND.start(); $('#snd-toggle').classList.toggle('on', SOUND.on); });
  let showL = true; $('#bl-toggle').classList.add('on');
  $('#bl-toggle').addEventListener('click', () => { showL = !showL; $('#bl-toggle').classList.toggle('on', showL); $('#blabels').hidden = !showL; });
  $$('[data-show]').forEach(c => c.addEventListener('change', () => V.SHOW[c.dataset.show] = c.checked));
  const fitLegend = () => document.documentElement.style.setProperty('--vh', $('#views').offsetHeight + 'px'); addEventListener('resize', fitLegend); setInterval(fitLegend, 1000); fitLegend();

  // sound: the audible topology of the zone under the camera (p. 160) — the stimulating or relaxing background
  setInterval(() => {
    if (!started || typeof SOUND === 'undefined' || !SOUND.on) return;
    const z = V.zoneOf(V.cam.target.x, V.cam.target.z), s = V.B.S[z] ? V.B.S[z].son : 0;
    const P = DATA.parisParts(new Date(V.simT)), h = P.h + P.mi / 60, silence = z === 'residence' && (h >= 22.5 || h < 6);
    SOUND.tick({ D: (s + 1) * 5, tau: (s + 1) / 2, shutdown: silence });
  }, 400);

  // ---------------- HUD
  const RD = [['time', 'Paris', 'Paris'], ['thermo', 'Température', 'Temperature'], ['vent', 'Vent', 'Wind'], ['ciel', 'Nébulosité', 'Cloud cover'], ['trafic', 'Circulation', 'Traffic'],
    ['dort', 'Endormis', 'Asleep'], ['trav', 'Au travail', 'At work'], ['lois', 'En loisirs', 'At leisure'], ['traj', 'En route', 'On the way'], ['desync', 'Désynchronisation', 'Desynchronisation']];
  $('#readings').innerHTML = RD.map(([k]) => `<div class="rd" data-k="${k}"><span class="rk"><i></i><em></em></span><b></b></div>`).join('');
  const nameRD = () => RD.forEach(([k, f, e]) => $(`#readings [data-k="${k}"] em`).textContent = T(f, e)); nameRD(); I18N.on(nameRD);
  const LIVE = ['DIRECT', 'DIFFÉRÉ', 'DÉRIVÉ', 'ARCHIVE'];
  function updateHUD() {
    const C = DATA.byId, x = DATA.ctx, set = (k, v, ok, tip) => { const el = $(`#readings [data-k="${k}"]`); el.querySelector('b').textContent = v; el.classList.toggle('sim', ok === false); el.classList.toggle('city', ok === null); el.title = tip || ''; };
    const ok = id => LIVE.includes(C[id].status);
    set('time', new Date(V.simT).toLocaleString(LOC(), { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' }), true, T('heure de Paris, accélérée', 'Paris time, accelerated'));
    set('thermo', C.thermo.raw != null ? `${(+C.thermo.raw).toFixed(1)} °C` : '—', ok('thermo'), I18N.chSrc(C.thermo));
    set('vent', C.vent10.raw != null ? `${Math.round(C.vent10.raw)} km/h` : '—', ok('vent10'), I18N.chSrc(C.vent10));
    set('ciel', x.cloud != null ? `${Math.round(x.cloud)} %` : '—', ok('thermo'), 'Open-Meteo');
    set('trafic', C.circulation.raw != null ? `${Math.round(C.circulation.raw)} ${T('véh/h', 'veh/h')}` : '—', ok('circulation'), I18N.chSrc(C.circulation));
    const c = V.counts(), n = V.agents.length || 1, pc = v => `${Math.round(v / n * 100)} %`;
    set('dort', pc(c.sommeil), null); set('trav', pc(c.travail), null); set('lois', pc(c.loisirs), null); set('traj', pc(c.trajet), null);
    set('desync', V.B.desync.toFixed(2), null, T('écart moyen entre le tonus voulu et le tonus effectif des habitants éveillés (p. 145)', 'mean gap between wanted and actual tonus of the waking inhabitants (p. 145)'));
    $('#mode').textContent = DATA.mode === 'live' ? T('DONNÉES DE PARIS', 'PARIS DATA') : 'SIMULATION'; $('#mode').className = 'mode-' + DATA.mode;
    $('#hud-state').textContent = T(`${(V.agents.length * 10).toLocaleString(LOC())} habitants (1 point = 10) · ${V.voteRate.toFixed(0)} pressions de boutons / min · sculptures-tours : `, `${(V.agents.length * 10).toLocaleString(LOC())} inhabitants (1 dot = 10) · ${V.voteRate.toFixed(0)} button presses / min · sculpture-towers: `) + (V.B.towerMode === 'baro' ? T(`baromètre (${V.B.agitation > 0.55 ? 'mauvais temps annoncé' : 'beau temps annoncé'})`, `barometer (${V.B.agitation > 0.55 ? 'bad weather ahead' : 'fair weather ahead'})`) : T('informations', 'information'));
  }

  // ---------------- brain tab
  const bar = v => `<span class="bbar"><i style="left:${v < 0 ? 50 + v * 50 : 50}%;width:${Math.abs(v) * 50}%;background:${v < 0 ? '#5d8ad8' : '#e8a04a'}"></i></span>`;
  function updateBrain() {
    const B = V.B;
    let h = `<table class="ana"><tr><th></th>${V.TOPO.map(t => `<th>${tn(TN, t)}</th>`).join('')}</tr>`;
    V.ZONES.forEach(z => { h += `<tr><td>${tn(ZN, z)}</td>${V.TOPO.map(t => `<td>${bar(B.S[z][t])} <small>${B.S[z][t] >= 0 ? '+' : ''}${B.S[z][t].toFixed(2)}</small></td>`).join('')}</tr>`; });
    h += `</table><div style="font-size:12.5px;margin-top:6px">${T('Éclairage de la circulation', 'Lighting of circulation')} : ${V.ZONES.map(z => `${tn(ZN, z)} <b>${Math.round(B.light[z] * 100)} %</b>, ${T('pulsé à', 'pulsed at')} ${B.pulse[z].toFixed(1)} Hz`).join(' · ')}</div><p class="dim" style="font-size:12px">${T('Consignes de −1 (décontractant) à +1 (stimulant), par zone et par topologie : rythme horaire de la zone, plus les pressions de boutons quantifiées (demi-vie 10 min), plus les corrections tirées de Paris.', 'Setpoints from −1 (relaxing) to +1 (stimulating), per zone and topology: the zone’s hourly rhythm, plus the quantified button presses (10 min half-life), plus the corrections drawn from Paris.')}</p>`;
    h += `<h3>${T('Autres ordres', 'Other orders')}</h3><div>${T('Cloisons climatiques autour des habitations', 'Climate partitions round the dwellings')} : <b>${Math.round(B.climate * 100)} %</b> · ${T('agitation des sculptures-tours', 'agitation of the sculpture-towers')} : <b>${Math.round(B.agitation * 100)} %</b> (${B.towerMode === 'baro' ? T('baromètre', 'barometer') : T('information', 'information')}) · ${T('programme du théâtre', 'theatre programme')} : <b>${Math.round(B.theatre * 100)} %</b></div>`;
    const I = B.inputs || {}, C = DATA.byId, row = (id, what, v) => `<tr><td>${I18N.chName(C[id])}</td><td><span class="${'st-' + C[id].status.normalize('NFD').replace(/[̀-ͯ]/g, '')}">${I18N.st(C[id].status)}</span></td><td>${v}</td><td>${what}</td></tr>`;
    h += `<h3>${T('Paris → la ville', 'Paris → the city')}</h3><table class="ana"><tr><th>${T('ligne', 'line')}</th><th></th><th>${T('valeur', 'value')}</th><th>${T('effet dans la ville', 'effect in the city')}</th></tr>`;
    h += row('observatoire', T('jour et nuit, éclairage nocturne', 'day and night, night lighting'), `${(I.alt || 0).toFixed(0)}°`);
    h += row('photo', T('nébulosité forte de jour → lumière artificielle (p. 156)', 'heavy cloud by day → artificial light (p. 156)'), `${Math.round(I.cloud || 0)} %`);
    h += row('thermo', T('écart au confort → cloisons climatiques (p. 161)', 'distance from comfort → climate partitions (p. 161)'), `${(I.temp || 0).toFixed(1)} °C`);
    h += row('vent10', T('vent fort → cloisons d’air soufflé', 'strong wind → blown-air partitions'), `${Math.round(I.wind || 0)} km/h`);
    h += row('hygro', T('humidité extrême → cloisons climatiques', 'extreme humidity → climate partitions'), `${Math.round(I.hum || 0)} %`);
    h += row('meteo', T('mauvais temps annoncé → agitation des tours aux heures baromètres (p. 184)', 'bad weather forecast → agitation of the towers at barometer hours (p. 184)'), (I.forecastBad || 0).toFixed(2));
    h += row('circulation', T('densité des trajets routiers', 'density of road journeys'), (I.traffic || 0).toFixed(2));
    h += row('micro', T('bruit humain et technique → fonds décontractants en résidence (p. 160)', 'human and technical noise → relaxing backgrounds at home (p. 160)'), (I.noise || 0).toFixed(2));
    h += row('presse', T('information → lumière de la cité de contacts ; tours en mode information', 'information → light of the contact city; towers in information mode'), (I.infoRate || 0).toFixed(2));
    h += `</table><h3>${T('Journal de la C.C.C.', 'C.C.C. log')}</h3><div class="blog">${B.log.slice(0, 14).map(l => `<div><time>${new Date(l.t).toLocaleTimeString(LOC(), { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}</time> ${l.orders.map(([z, tp, v]) => `${tn(ZN, z)} · ${tn(TN, tp)} → ${v > 0 ? T('stimulant', 'stimulating') : T('décontractant', 'relaxing')} (${v.toFixed(2)})`).join(' ; ')}${l.cChange > 0 ? T('cloisons climatiques mises en service', 'climate partitions switched on') : l.cChange < 0 ? T('cloisons climatiques arrêtées', 'climate partitions switched off') : ''}</div>`).join('') || `<div class="dim">—</div>`}</div>`;
    $('#brain').innerHTML = h;
  }

  // ---------------- inhabitants tab
  function updatePop() {
    const A = V.agents, by = {};
    A.forEach(a => { const k = a.type; by[k] = by[k] || { n: 0, act: {}, th: { sommeil: 0, travail: 0, loisirs: 0, trajet: 0 }, ton: 0 }; by[k].n++; by[k].act[a.act] = (by[k].act[a.act] || 0) + 1; Object.keys(a.third).forEach(t => by[k].th[t] += a.third[t]); by[k].ton += a.ton; });
    let h = `<table class="ana"><tr><th></th><th>n</th><th>${T('sommeil', 'sleep')}</th><th>${T('travail', 'work')}</th><th>${T('loisirs', 'leisure')}</th><th>${T('trajets', 'travel')}</th><th>tonus</th></tr>`;
    Object.entries(by).forEach(([k, o]) => { const c = V.TYPES[k].col.map(v => Math.round(v * 255)).join(','); h += `<tr><td><i class="dot" style="background:rgb(${c})"></i>${T(V.TYPES[k].fr, V.TYPES[k].en)}</td><td>${(o.n * 10).toLocaleString(LOC())}</td>${['sommeil', 'travail', 'loisirs', 'trajet'].map(t => `<td>${(o.th[t] / o.n).toFixed(1)} h</td>`).join('')}<td>${(o.ton / o.n).toFixed(2)}</td></tr>`; });
    h += `</table><p class="dim" style="font-size:12px">${T('Heures passées aujourd’hui dans chacun des « trois tiers » (p. 133), en moyenne par catégorie, comptées depuis minuit ou depuis la mise en marche.', 'Hours spent today in each of the “three thirds” (p. 133), averaged by category, counted from midnight or from when the simulation started.')}</p>`;
    const acts = {}; A.forEach(a => acts[a.act] = (acts[a.act] || 0) + 1);
    h += `<h3>${T('En ce moment', 'At this moment')}</h3><div class="acts">${Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span>${T(V.ACT[k][0], V.ACT[k][1])} <b>${(v * 10).toLocaleString(LOC())}</b></span>`).join('')}</div>`;
    $('#pop-table').innerHTML = h; drawDay();
  }
  function drawDay() {
    const cv = $('#daychart'), g = cv.getContext('2d'), W = cv.width, H = cv.height, hist = V.B.hist; g.clearRect(0, 0, W, H);
    g.fillStyle = '#8f8775'; g.font = '11px monospace'; g.fillText(T('répartition des habitants (10 min) · désynchronisation', 'distribution of inhabitants (10 min) · desynchronisation'), 6, 12);
    if (hist.length < 2) { g.fillText(T('en attente de relevés…', 'waiting for readings…'), 6, 40); return; }
    const cols = { sommeil: '#3b4a6b', travail: '#e8a04a', loisirs: '#c96fa0', trajet: '#d8d2c0' }, n = V.agents.length, w = W / Math.max(hist.length, 48);
    hist.forEach((r, i) => { let y = H; ['sommeil', 'travail', 'loisirs', 'trajet'].forEach(k => { const hh = r.c[k] / n * (H - 22); g.fillStyle = cols[k]; g.fillRect(i * w, y - hh, Math.ceil(w), hh); y -= hh; }); });
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); hist.forEach((r, i) => { const y = H - r.desync * (H - 22) * 1.5; i ? g.lineTo(i * w + w / 2, y) : g.moveTo(w / 2, y); }); g.stroke();
  }

  // ---------------- pick: an inhabitant, or a building through its label
  V.setOnPick(i => { if (i >= 0) choose(i); });
  function choose(i) { pickId = i; pickBld = null; V.follow(i); $('#pick').hidden = false; explain(); }
  $('#pick-close').addEventListener('click', () => { $('#pick').hidden = true; pickId = -1; pickBld = null; V.follow(-1); });
  function explain() {
    if ($('#pick').hidden) return;
    if (pickBld) { $('#pick-head').textContent = T(BLD[pickBld].fr[0], BLD[pickBld].en[0]); $('#pick-body').innerHTML = T(BLD[pickBld].fr[1], BLD[pickBld].en[1]); return; }
    if (pickId < 0) return;
    const a = V.agents[pickId], P = DATA.parisParts(new Date(V.simT));
    $('#pick-head').textContent = T(`Habitant n° ${a.id + 1}`, `Inhabitant no. ${a.id + 1}`);
    const tp = V.TYPES[a.type], wpl = a.work ? T(V.PL[a.work].fr, V.PL[a.work].en) : null;
    let h = `<div class="pk-h">${T(tp.fr, tp.en)}${wpl ? ' · ' + wpl : ''}</div><div class="pk-s">${T(`bande ${a.home.b + 1}, cellule ${a.home.slot * 2 + a.home.storey + 1}, ${a.home.storey ? 'étage' : 'rez-de-bande'}`, `band ${a.home.b + 1}, cell ${a.home.slot * 2 + a.home.storey + 1}, ${a.home.storey ? 'upper storey' : 'lower storey'}`)} · ${T('représente 10 habitants', 'stands for 10 inhabitants')}${a.couple >= 0 ? T(' · en couple', ' · in a couple') : ''}${a.mode === 'air' ? T(' · se rend au travail en hélibus', ' · commutes by helibus') : ''}</div>`;
    const act = a.act === 'trajet' ? `${T(V.ACT.trajet[0], V.ACT.trajet[1])} → ${T(V.ACT[a.next][0], V.ACT[a.next][1])}` : T(V.ACT[a.act][0], V.ACT[a.act][1]);
    h += `<div class="pk-state on">${act} · ${tn(ZN, V.zoneOf(a.pos[0], a.pos[2]))} · ${a.pos[1] > 40 ? Math.round(a.pos[1]) + ' m' : T('au sol ou en bande', 'on the ground or in a band')}</div>`;
    h += `<h4>${T('Tonus', 'Tonus')}</h4><div>${T('effectif', 'actual')} <b>${a.ton.toFixed(2)}</b> · ${T('voulu pour cette activité', 'wanted for this activity')} <b>${(a.want ?? 0).toFixed(2)}</b> ${bar(a.ton * 2 - 1)}</div>`;
    h += `<h4>${T('Les trois tiers aujourd’hui', 'The three thirds today')}</h4><div>${T('sommeil', 'sleep')} ${a.third.sommeil.toFixed(1)} h · ${T('travail', 'work')} ${a.third.travail.toFixed(1)} h · ${T('loisirs', 'leisure')} ${a.third.loisirs.toFixed(1)} h · ${T('trajets', 'travel')} ${a.third.trajet.toFixed(1)} h</div>`;
    h += `<h4>${T('Poste de commande', 'Control post')}</h4><div>${a.votes} ${T('pressions aujourd’hui', 'presses today')}${a.lastVote ? ` · ${T('dernière', 'last')} : ${a.lastVote.v > 0 ? T('plus de', 'more') : T('moins de', 'less')} ${tn(TN, a.lastVote.tp)} (${new Date(a.lastVote.t).toLocaleTimeString(LOC(), { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })})` : ''}</div>`;
    h += `<h4>${T('Journée prévue', 'Planned day')}</h4><div class="plan">${a.plan.map(([t, k], j) => `<span class="${j === a.step ? 'on' : j < a.step ? 'past' : ''}">${String(Math.floor(t % 24)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')} ${T(V.ACT[k][0], V.ACT[k][1])}</span>`).join('')}</div>`;
    $('#pick-body').innerHTML = h;
  }
  I18N.on(explain);

  // ---------------- labels and building cards (descriptions after the text)
  const BLD = {
    univ: [['Centre universitaire vertical', 'Ville de travail. « Un centre universitaire vertical doit avoir dans son milieu un échelonnement, en superposition, d’amphithéâtres, autour desquels rayonnent laboratoires, salles de réunion, d’examens » ; l’administration près du sol, la direction au sommet, dans une ossature apparente qui sert aussi d’artères de communication ; plates-formes pour hélicoptères au sommet (p. 134–135, planche p. 172). Schöffer envisage 1 000 à 1 500 m et 10 000 à 30 000 personnes ; il est ici haut de 400 m.'],
      ['Vertical university centre', 'Work city. A vertical university should have at its centre a superposed series of amphitheatres, with laboratories and meeting and examination rooms radiating round them; administration near the ground, direction at the top, within an apparent frame that also serves as the arteries of communication; helicopter platforms at the summit (pp. 134–135, plate p. 172). Schöffer allows 1,000 to 1,500 m and 10,000 to 30,000 people; here it stands 400 m high.']],
    admin: [['Centre administratif', 'Ville de travail : deux grands volumes ovoïdes vitrés portés par des noyaux de béton (planche p. 203). La verticalité et la concentration servent une « ville de contacts » où les communications sont rapides parce que verticales et brèves (p. 135, 146).'],
      ['Administrative centre', 'Work city: two great glazed ovoid volumes carried on concrete cores (plate p. 203). Verticality and concentration serve a “ville de contacts” where communications are quick because vertical and brief (pp. 135, 146).']],
    rech: [['Centre de recherche scientifique', 'Ville de travail : des sphères vitrées tenues dans une ossature ouverte de membrures inclinées, une sculpture-tour à côté (planche p. 204). Les chercheurs sont « dispersés selon leurs spécialités dans des habitacles suspendus au sein de l’ossature » (p. 135).'],
      ['Scientific research centre', 'Work city: glazed spheres held in an open frame of inclined members, a sculpture-tower beside it (plate p. 204). Researchers are “dispersées selon leurs spécialités dans des habitacles suspendus au sein de l’ossature” (p. 135).']],
    bandes: [['Ville résidentielle', 'Le tiers sommeil est horizontal : des bandes de cellules préfabriquées, deux étages au plus, posées sur de hauts pylônes à 10–30 m, qui laissent le sol libre pour l’agriculture, les jardins et les forêts ; 100 à 500 cellules par bande, ascenseurs et escaliers roulants, coursives décalées, aires d’atterrissage, terrasses individuelles ; façades est-ouest en climat tempéré (p. 137, 146–148, 178 ; planche p. 168). Ici 16 bandes de 500 cellules, 20 000 habitants.'],
      ['Residential city', 'The sleeping third is horizontal: bands of prefabricated cells, two storeys at most, set on high pylons at 10–30 m and leaving the ground free for agriculture, gardens and forests; 100 to 500 cells to a band, lifts and escalators, staggered walkways, landing areas, individual terraces; east–west façades in a temperate climate (pp. 137, 146–148, 178; plate p. 168). Here 16 bands of 500 cells, 20,000 inhabitants.']],
    theatre: [['Théâtre spatiodynamique', 'Une enveloppe ovoïde de 100 à 250 m ; le public, au milieu, sur un dispositif hyperbolique qui tourne lentement dans les deux sens autour d’un fuseau cylindrique contenant le centre commercial ; ballets de sculptures cybernétiques et ballets humains sur une piste circulaire, projections luminodynamiques et cinématographiques, son stéréophonique ; programme dirigé d’une tour de contrôle au sommet du cylindre et infléchi par les tableaux de commande de chaque spectateur (p. 186–190 ; planches p. 167, 189).'],
      ['Spatiodynamic theatre', 'An ovoid shell 100 to 250 m across; the public in the middle on a hyperbolic structure turning slowly both ways round a cylindrical spindle that holds the shopping centre; ballets of cybernetic sculptures and human ballets on a circular track, luminodynamic and film projections, stereophonic sound; the programme directed from a control tower at the top of the cylinder and inflected by each spectator’s control panel (pp. 186–190; plates pp. 167, 189).']],
    cls: [['Centre de loisirs sexuels', 'Un centre de relaxation spécialisé, « assez loin de la ville de travail », « relativement proche de la ville résidentielle », isolé dans un parc aux chemins nombreux ; un bâtiment « en forme de sein gonflé placé sur un socle évasé », lisse, d’un rose atténué ; à l’intérieur un bain audio-visuel tiède et rouge clair pulsé « sur un rythme très lent », un ascenseur jusqu’au sommet et une longue rampe en spirale descendante à travers formes et projections, une salle de danse et un hôtel-restaurant au rez-de-chaussée (p. 175–176 ; planches p. 170–171). La simulation n’y représente que des allées et venues.'],
      ['Centre de loisirs sexuels', 'A specialised relaxation centre, “assez loin de la ville de travail”, “relativement proche de la ville résidentielle”, isolated in a park with many paths; a building “en forme de sein gonflé placé sur un socle évasé”, smooth, a muted pink; inside, a warm, light-red audio-visual bath pulsed “sur un rythme très lent”, a lift to the top and a long spiral ramp descending through forms and projections, a dance hall and a hotel-restaurant on the ground floor (pp. 175–176; plates pp. 170–171). The simulation shows only comings and goings.']],
    relax: [['Centre de relaxation intégré', 'En quittant son lieu de travail, le travailleur « quels que soient son grade ou sa spécialité » passe par des centres de relaxation intégrés, climats audio-visuels, lumineux, odorants, pour des relaxations « rapides mais graduées » (p. 175). Le livre ne dessine pas ce bâtiment : sa forme ici est un simple pavillon.'],
      ['Integrated relaxation centre', 'On leaving work, the worker “quels que soient son grade ou sa spécialité” passes through integrated relaxation centres, audio-visual, luminous and scented climates, for relaxations “rapides mais graduées” (p. 175). The book does not draw this building: its form here is a plain pavilion.']],
    ecole: [['École', 'Les enfants passent le matin par le centre stimulant de leur unité avant de se rendre à l’école (p. 175). L’école n’est pas dessinée dans le livre.'], ['School', 'Children pass through the stimulating centre of their unit in the morning on their way to school (p. 175). The school is not drawn in the book.']],
    agri: [['Centre agricole', 'Les centres agricoles dirigent la production dans un périmètre déterminé ; autour d’eux rayonnent des secteurs, chacun formé d’une ville de travail et de son satellite résidentiel (p. 173). Non dessiné.'], ['Agricultural centre', 'Agricultural centres direct production within a given perimeter; round them radiate sectors, each made of a work city and its residential satellite (p. 173). Not drawn.']],
    ccc: [['Commande cybernétique centrale', 'La C.C.C. reçoit les informations quantifiées des pupitres de commande disséminés dans l’ensemble habité et les transforme en « ordres souples » sur les cinq topologies : temps, lumière, son, climats, espace (p. 151–152, 157, 182). Le livre n’en dessine pas le bâtiment. Ici elle reçoit aussi les données de Paris.'], ['Central cybernetic command', 'The C.C.C. receives the quantified information from the control desks spread through the inhabited whole and turns it into “ordres souples” on the five topologies: time, light, sound, climates, space (pp. 151–152, 157, 182). The book does not draw its building. Here it also receives the Paris data.']],
    tours: [['Sculptures-tours', 'Aux grands carrefours, des sculptures cybernétiques fixes servent de signaux aux parcelles du territoire ; leurs mouvements, lumières et sonorisation sont commandés par le cerveau central, et leur agitation accrue peut annoncer le mauvais temps : à certaines heures elles sont des baromètres, à d’autres elles donnent des informations « économiques, sportives, politiques » (p. 184). Des sculptures autonomes plus petites circulent parmi les passants, munies de radars (p. 181–182).'], ['Sculpture-towers', 'At the great crossroads, fixed cybernetic sculptures act as signals of their parcels of territory; their movements, lights and sound are commanded by the central brain, and their increased agitation can announce bad weather: at certain hours they are barometers, at others they give “économiques, sportives, politiques” information (p. 184). Smaller autonomous sculptures, fitted with radar, circulate among the passers-by (pp. 181–182).']]
  };
  Object.keys(BLD).forEach(k => BLD[k] = { fr: BLD[k][0], en: BLD[k][1] });
  const lbox = $('#blabels'), lels = V.labels.map(L => { const d = document.createElement('div'); d.className = 'bl city'; lbox.appendChild(d); d.addEventListener('click', () => { pickBld = L.id; pickId = -1; V.follow(-1); $('#pick').hidden = false; explain(); }); return { L, d }; });
  const nameL = () => lels.forEach(({ L, d }) => { const b = BLD[L.id]; d.innerHTML = `${T(b.fr[0], b.en[0])}${V.PL[L.id] && V.PL[L.id].page ? ` <i>p. ${V.PL[L.id].page}</i>` : ''}`; }); nameL(); I18N.on(nameL);
  function placeLabels() {
    if (!showL) return; const placed = [];
    lels.forEach(({ L, d }) => { const p = V.project(L.x, L.y, L.z); if (!p.vis || p.d > 7000) { d.style.display = 'none'; return; } d.style.display = ''; const w = d.offsetWidth || 90, h = d.offsetHeight || 14, r = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h, y1: p.y }; if (placed.some(q => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) { d.style.display = 'none'; return; } placed.push(r); d.style.transform = `translate(${(p.x - w / 2).toFixed(0)}px,${(p.y - h).toFixed(0)}px)`; });
  }

  // ---------------- documents
  const DOCS = [['p168', 169, 'Ville résidence-dortoir (ville horizontale)', 'Residence-dormitory city (horizontal city)'], ['p172', 173, 'Centre universitaire vertical (ville de travail)', 'Vertical university centre (work city)'], ['p203', 203, 'Centre administratif (ville de travail)', 'Administrative centre (work city)'], ['p204', 205, 'Centre de recherche scientifique (ville de travail)', 'Scientific research centre (work city)'],
    ['p167', 167, 'Théâtre spatiodynamique', 'Spatiodynamic theatre'], ['p189', 189, 'Théâtre spatiodynamique, élévation et plan', 'Spatiodynamic theatre, elevation and plan'], ['p170', 170, 'Centre de loisirs sexuels', 'Centre de loisirs sexuels'], ['p171', 171, 'Centre de loisirs sexuels, coupe', 'Centre de loisirs sexuels, section'],
    ['p155', 155, 'Temps : topologie des rythmes', 'Time: topology of rhythms'], ['p156', 156, 'Lumière : topologie de la lumière', 'Light: topology of light'], ['p159', 159, 'Son : topologie de l’audible', 'Sound: topology of the audible'], ['p161', 161, 'Climats : topologie des courants', 'Climates: topology of currents'], ['p163', 163, 'Espace : topologie horizontale et verticale', 'Space: horizontal and vertical topology']];
  const drawDocs = () => { $('#docs').innerHTML = DOCS.map(d => `<figure data-f="${d[0]}"><img src="img/${d[0]}.jpg" alt="" loading="lazy"><figcaption>${T(d[2], d[3])} <span class="dim">p. ${d[1]}</span></figcaption></figure>`).join(''); $$('#docs figure').forEach(fg => fg.addEventListener('click', () => { const d = DOCS.find(x => x[0] === fg.dataset.f); $('#lb-img').src = `img/${d[0]}.jpg`; $('#lb-cap').textContent = `${T(d[2], d[3])} — Schöffer, La Ville cybernétique, 1969, p. ${d[1]}. © ADAGP, Paris.`; $('#lightbox').hidden = false; })); };
  drawDocs(); I18N.on(drawDocs);
  $('#lightbox').addEventListener('click', () => $('#lightbox').hidden = true);
  window.CITY = { choose };
})();
