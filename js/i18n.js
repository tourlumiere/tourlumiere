/* ==========================================================================
   I18N — French / English. Static text in the page carries both languages
   (lang="fr" / lang="en" spans, data-en on options and titles); text built by
   the programme is French internally and translated on display with tx().
   ========================================================================== */
const I18N = (function () {
  'use strict';
  let lang = 'en';
  try { lang = localStorage.getItem('tlc.uiLang') || ((navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'); } catch (e) { }
  const subs = [];
  const T = (fr, en) => lang === 'fr' ? fr : en;

  const STATUS = { 'DIRECT': 'LIVE', 'DIFFÉRÉ': 'DELAYED', 'DÉRIVÉ': 'DERIVED', 'SIMULÉ': 'SIMULATED', 'CLÉ': 'KEY', 'ARCHIVE': 'ARCHIVE', 'ATTENTE': 'WAITING' };
  const st = s => lang === 'fr' ? s : (STATUS[s] || s);

  // channel names and sources in English
  const CH = {
    photo: ['Photocell', 'Open-Meteo · global radiation, La Défense'],
    couleur: ['Colour-sensitive cell', 'derived: sun height × cloud cover'],
    thermo: ['Thermometer', 'Open-Meteo · 2 m, La Défense'],
    hygro: ['Hygrometer', 'Open-Meteo · relative humidity'],
    vent10: ['Anemometer 10 m', 'Open-Meteo · wind at 10 m (+ gusts)'],
    vent80: ['Anemometer 80 m', 'Open-Meteo · wind at 80 m'],
    vent120: ['Anemometer 120 m', 'Open-Meteo · wind at 120 m'],
    vent180: ['Anemometer 180 m', 'Open-Meteo · wind at 180 m'],
    micro: ['Microphones', 'road noise estimated (CoRTN) from the Paris counts · or local microphone'],
    contraintes: ['Frame stress monitoring', 'wind load (calculations pp. 126–127) + EMSC seismicity'],
    bourse: ['The Bourse', 'Alpha Vantage (free key)'],
    meteo: ['Weather forecast', 'Open-Meteo · forecast for tomorrow'],
    metro: ['Métro · SNCF', 'IDFM PRIM · disruption messages (free key)'],
    presse: ['The A.F.P. · the press', 'franceinfo (RSS feed) + press accounts on Bluesky'],
    circulation: ['Police prefecture (traffic)', 'Ville de Paris · permanent road counters (≈2,970 sensors)'],
    saturation: ['Saturated routes', 'Ville de Paris · traffic state per sensor'],
    hopitaux: ['Hospital services', 'Santé publique France · emergency visits, Île-de-France'],
    telephone: ['P.T.T. · telephones', 'Bluesky Jetstream · French-language posts/min'],
    telegraphe: ['P.T.T. · telegraphs', 'Wikimedia · edits to fr.wikipedia/min'],
    chambre: ['Noise at the back of the Chamber', 'LCP (feed) + Bluesky posts naming the “Assemblée” + sitting hours'],
    aerien: ['Air navigation · Aéroport de Paris', 'aeronautical weather derived at Roissy (Open-Meteo)'],
    radio: ['O.R.T.F. · radio', 'France Inter, live stream · RMS level'],
    tele: ['O.R.T.F. · news', 'franceinfo, live stream · RMS level'],
    banque: ['Banque de France', 'ECB via Frankfurter · EUR/USD (60 days)'],
    velib: ['R.A.T.P. · journeys (Vélib’)', 'Vélib’ Métropole · bikes in use'],
    observatoire: ['The Observatory', 'calculated: sun and moon above La Défense'],
    seisme: ['Seismicity', 'EMSC · earthquakes over 24 h, intensity estimated at La Défense'],
    pompiers: ['Fire brigade', 'no open real-time source — simulated (Poisson, μ = 3.7)']
  };
  const chName = c => lang === 'fr' ? c.fr : (CH[c.id] ? CH[c.id][0] : c.en);
  const chSrc = c => lang === 'fr' ? c.src : (CH[c.id] ? CH[c.id][1] : c.src);

  // phrases produced by the programme, longest first; uppercase variants are derived for the teletype and listing
  const P = [
    // displays and notes
    ['véh/h/capteur', 'veh/h/sensor'], ['% des capteurs saturés', '% of sensors saturated'], ['rien de ressenti (24 h)', 'nothing felt (24 h)'], ['rien de ressenti', 'nothing felt'],
    ['dépêches / 60 min', 'items / 60 min'], ['perturbations en cours', 'disruptions now'], ['messages/min', 'posts/min'], ['modifications/min', 'edits/min'],
    ['en séance probable', 'probably sitting'], ['hors séance', 'not sitting'], ['vélos à quai', 'bikes docked'], ['bornes', 'docks'],
    ['dB(A) estimés', 'dB(A) estimated'], ['dB (micro local)', 'dB (local mic)'], ['moy. jour', 'day mean'], ['effort tranchant', 'shear'], ['interventions / 5 s (simulé)', 'call-outs / 5 s (simulated)'],
    ['consultations fr.wikipedia/h', 'fr.wikipedia views/h'], ['J+1 : code', 'tomorrow: code'], ['soleil', 'sun'], ['lune', 'moon'], ['sem.', 'wk'], ['bas', 'low'], ['simulé', 'simulated'],
    ['Données de la veille, à la même heure.', 'Yesterday’s data, at the same hour.'], ['Série hebdomadaire.', 'Weekly series.'], ['Cours de référence quotidien.', 'Daily reference rate.'],
    ['Aucune source de trafic aérien n’accepte de requête depuis un navigateur.', 'No air-traffic source accepts requests from a browser.'],
    ['En archive : consultations horaires, faute de modification', 'In archive: hourly page views, since edits are not archived'], ['Échec', 'Failed'], ['clé requise', 'key required'], ['en attente', 'waiting'],
    // programme
    ['Miroirs mobiles', 'Moving mirrors'], ['Petits projecteurs à obturateurs', 'Small shutter projectors'], ['Petits projecteurs', 'Small projectors'], ['Gros projecteurs au sommet', 'Large projectors at the summit'],
    ['Gros projecteurs latéraux', 'Large side projectors'], ['Les 24 lasers', 'The 24 lasers'], ['Gaz fumigènes', 'Smoke gas'], ['Flashes', 'Flashes'],
    ['du milieu vers les extrémités', 'from the middle outward'], ['des extrémités vers le milieu', 'from the ends inward'], ['de gauche à droite', 'left to right'], ['de droite à gauche', 'right to left'],
    ['d’avant en arrière', 'front to back'], ['ascensionnel', 'rising'], ['descendant', 'falling'], ['en zigzag', 'zigzag'], ['points épars', 'scattered points'], ['simultané', 'simultaneous'],
    ['progressif', 'crescendo'], ['dégressif', 'decrescendo'], ['alterné', 'alternating'], ['ponctuel', 'punctual'], ['étale', 'steady'],
    ['DISPARITION DE LA TOUR DANS UN NUAGE DE FUMÉE', 'THE TOWER DISAPPEARS IN A CLOUD OF SMOKE'], ['RÉAPPARITION DE LA TOUR', 'THE TOWER REAPPEARS'],
    ['CELLULE D’INDIFFÉRENCE', 'INDIFFERENCE CELL'], ['PERTURBATION ACCIDENTELLE', 'ACCIDENTAL PERTURBATION'], ['RÉAFFECTATION', 'REASSIGNMENT'], ['tête de série', 'head number'],
    ['fonctions redessinées', 'functions redrawn'], ['flashes antagonistes', 'antagonist flashes'], ['fonctions', 'functions'], ['groupes', 'groups'], ['fonction', 'function'], ['seuil', 'threshold'],
    ['commande manuelle', 'manual command'], ['périodique', 'periodic'], ['répétition', 'repetition'], ['stagnation', 'stagnation'], ['saturation', 'saturation'],
    ['régime tenu plus de dix minutes', 'régime held over ten minutes'], ['événement exceptionnel', 'exceptional event'], ['séisme ressenti', 'earthquake felt'], ['seuil d’excitation de la ville', 'the city’s excitation threshold'],
    ['seuil d’excitation de la ville dépassé', 'the city’s excitation threshold passed'], ['séisme ressenti', 'earthquake felt'], ['périodicité détectée', 'periodicity detected'], ['période', 'period'],
    ['des groupes commandés', 'of groups commanded'], ['moyenne', 'mean'], ['inchangé depuis', 'unchanged for'], ['régime', 'régime'], ['frein', 'braking'], ['accélération', 'acceleration'],
    ['PRÉVISION DU WEEK-END', 'WEEKEND FORECAST'], ['PRÉVISION DU LENDEMAIN', 'FORECAST FOR TOMORROW'], ['MAUVAIS TEMPS (ROUGE, MOUVEMENTS ACCÉLÉRÉS)', 'BAD WEATHER (RED, FAST MOVEMENTS)'],
    ['BEAU TEMPS (BLEU, MOUVEMENTS LENTS)', 'FAIR WEATHER (BLUE, SLOW MOVEMENTS)'], ['TEMPS INTERMÉDIAIRE', 'MIXED WEATHER'], ['DIRECTIONS SATURÉES / DÉGAGÉES', 'ROUTES SATURATED / CLEAR'],
    ['LANGAGE CONVENTIONNEL', 'CONVENTIONAL LANGUAGE'], ['MÉTÉO DE DEMAIN', 'TOMORROW’S WEATHER'], ['CIRCULATION', 'TRAFFIC'], ['RÉGIME', 'RÉGIME'],
    ['BLEU', 'BLUE'], ['ROUGE', 'RED'], ['bleu', 'blue'], ['rouge', 'red'], ['jaune', 'yellow'], ['violet', 'violet'], ['blanc', 'white'],
    // teletype
    ['CENTRE CYBERNETIQUE T.L.C. — MISE SOUS TENSION', 'T.L.C. CYBERNETIC CENTRE — POWER ON'], ['TELESCRIPTEURS EN LIGNE', 'TELEPRINTERS ON LINE'],
    ['RESEAU INACCESSIBLE — LIGNES EN SIMULATION (METHODE DE 1973) — NOUVEL ESSAI CHAQUE MINUTE', 'NETWORK UNREACHABLE — LINES SIMULATED (1973 METHOD) — RETRYING EVERY MINUTE'],
    ['HORS SERVICE', 'OUT OF SERVICE'], ['LIGNE', 'LINE'], ['MÉTÉO', 'WEATHER'], ['RAFALES', 'GUSTS'], ['VENT', 'WIND'], ['NEBUL', 'CLOUD'], ['PREFECTURE', 'PREFECTURE'],
    ['VEH/H MOY', 'VEH/H MEAN'], ['SATURES', 'SATURATED'], ['AXE MAILLOT', 'MAILLOT AXIS'], ['BRANCHEMENT', 'CONNECTED'], ['ECHEC LECTURE', 'PLAYBACK FAILED'],
    ['AUDIO INDISPONIBLE', 'AUDIO UNAVAILABLE'], ['MICROPHONE LOCAL BRANCHE (NON ETALONNE, +94 DB)', 'LOCAL MICROPHONE CONNECTED (UNCALIBRATED, +94 DB)'], ['MICROPHONE REFUSE', 'MICROPHONE REFUSED'],
    ['CHARGEMENT DU', 'LOADING'], ['CHARGEES', 'LOADED'], ['LACUNES', 'GAPS'], ['RETOUR AU DIRECT', 'BACK TO LIVE'], ['ARCHIVES DU', 'ARCHIVES FOR'], ['ARCHIVES', 'ARCHIVES'],
    // listing
    ['COEFFICIENTS C(I,J) TIRES AU HASARD POUR CE PASSAGE', 'COEFFICIENTS C(I,J) DRAWN AT RANDOM FOR THIS RUN'], ['SEUILS B(I) CONSTANTS', 'THRESHOLDS B(I) CONSTANT'],
    ['MIROIRS NON SIMULES (P. 113)', 'MIRRORS NOT SIMULATED (P. 113)'], ['MISE EN PAGE RECONSTITUEE, LES LISTINGS N\'AYANT PAS ETE PUBLIES', 'LAYOUT RECONSTRUCTED, THE LISTINGS WERE NEVER PUBLISHED'],
    ['SORTIES ROUGES, ORANGES, VIOLETTES', 'RED, ORANGE, VIOLET OUTPUTS'], ['SORTIES BLEUES', 'BLUE OUTPUTS'], ['FACE AVANT', 'FRONT FACE'], ['FACE ARRIERE', 'BACK FACE'], ['FENETRE', 'WINDOW'], ['PALIER', 'LANDING'],
    ['ALLUME, MOTEUR BRANCHE', 'ON, MOTOR ENGAGED'], ['ALLUME, MOTEUR DEBRANCHE', 'ON, MOTOR DISENGAGED'], ['ETEINT (REGIME DESEXCITE)', 'OFF (RÉGIME DE-EXCITED)'], ['ETEINT, MOTEUR DEBRANCHE', 'OFF, MOTOR DISENGAGED'],
    ['ECLAIRS', 'FLASHING'], ['AU REPOS', 'AT REST'], ['ALLUMES', 'ON'], ['ETEINTS', 'OFF'], ['PCT', 'PCT'], ['FIN SIMULATION ?', 'END OF SIMULATION?'], ['OUI', 'YES'],
    ['NOUVEAU PASSAGE AVEC DE NOUVEAUX COEFFICIENTS', 'NEW RUN WITH NEW COEFFICIENTS'], ['BLANCS', 'WHITE'], ['BLEU CLAIR', 'LIGHT BLUE'], ['BLEU FONCE', 'DARK BLUE'], ['JAUNES', 'YELLOW'],
    ['ROUGES', 'RED'], ['VIOLETS', 'VIOLET'], ['ORANGES', 'ORANGE'], ['BLEUS', 'BLUE'], ['TRICHROME', 'THREE-COLOUR'], ['PROJECTEURS', 'PROJECTORS'], ['GRANDS FLASHES', 'LARGE FLASHES'], ['PETITS FLASHES', 'SMALL FLASHES'],
    ['OBTURATEUR', 'SHUTTER'], ['INSTANT', 'INSTANT'], ['CAPTEURS', 'SENSORS'], ['BRUIT', 'NOISE'], ['SIMULATION DU FONCTIONNEMENT DE LA T.L.C.', 'SIMULATION OF THE OPERATION OF THE T.L.C.'], ['SORTIE', 'OUTPUT'], ['SEUIL', 'THRESHOLD'],
    ['SIMULATION DU FONCTIONNEMENT ET VISUALISATION DE CERTAINS ELEMENTS DE LA TOUR', 'SIMULATION OF THE OPERATION AND VISUALISATION OF CERTAIN ELEMENTS OF THE TOWER'],
    ['PROJECTEUR A OBTURATEUR', 'SHUTTER PROJECTOR'], ['OBTURATEURS', 'SHUTTERS'], ['AVEC MOTEUR', 'WITH MOTOR'], ['GRAND FLASH', 'LARGE FLASH'], ['PETITS FLASHES', 'SMALL FLASHES'],
    ['SEUIL DE VALIDATION', 'VALIDATION THRESHOLD'], ['SORTIES ACTIVES', 'ACTIVE OUTPUTS'], ['INTENSITE', 'INTENSITY'], ['SOMME', 'SUM'], ['EXCITE', 'EXCITED'], ['ETAT', 'STATE'],
    ['SOCLE', 'SOCLE'], ['FEN', 'WIN'], ['HEURE', 'TIME'], ['DUREE', 'DURATION'], ['FENETRES', 'WINDOWS'], ['SORTIES', 'OUTPUTS'], ['PASSAGE', 'RUN'], ['NON', 'NO'], ['ALLUMES', 'ON'],
    ['TIRAGE', 'DRAW'], ['uniforme', 'uniform'], ['exponentielle', 'exponential'], ['intensité', 'intensity'], ['VALIDE', 'VALID'], ['REFUSE', 'REFUSED'], ['NORMAL', 'NORMAL']
  ];
  const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let RX = null;
  function build() {
    const all = [];
    P.forEach(([f, e]) => { all.push([f, e]); const fu = strip(f).toUpperCase(); if (fu !== f) all.push([fu, e.toUpperCase()]); });
    all.sort((a, b) => b[0].length - a[0].length);
    const map = new Map(); all.forEach(([f, e]) => { if (!map.has(f)) map.set(f, e); });
    RX = { map, re: new RegExp('(?<![\\p{L}])(' + [...map.keys()].map(esc).join('|') + ')(?![\\p{L}])', 'gu') };
  }
  function tx(s) {
    if (lang === 'fr' || s == null) return s;
    if (!RX) build();
    return String(s).replace(RX.re, m => RX.map.get(m));
  }

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-en]').forEach(el => { if (el.dataset.fr == null) el.dataset.fr = el.textContent; el.textContent = lang === 'fr' ? el.dataset.fr : el.dataset.en; });
    document.querySelectorAll('[data-title-en]').forEach(el => { if (el.dataset.titleFr == null) el.dataset.titleFr = el.title; el.title = lang === 'fr' ? el.dataset.titleFr : el.dataset.titleEn; });
    document.querySelectorAll('[data-ui]').forEach(b => b.classList.toggle('on', b.dataset.ui === lang));
    document.title = T('Tour Lumière Cybernétique — prototype en données réelles', 'Tour Lumière Cybernétique — a prototype on live data');
    subs.forEach(f => { try { f(lang); } catch (e) { } });
  }
  function set(l) { lang = l; try { localStorage.setItem('tlc.uiLang', l); } catch (e) { } apply(); }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-ui]').forEach(b => b.addEventListener('click', () => set(b.dataset.ui)));
    apply();
  });
  if (document.readyState !== 'loading') setTimeout(() => { document.querySelectorAll('[data-ui]').forEach(b => b.onclick = () => set(b.dataset.ui)); apply(); }, 0);
  return { T, tx, st, chName, chSrc, set, on: f => subs.push(f), get lang() { return lang; }, locale: () => lang === 'fr' ? 'fr-FR' : 'en-GB' };
})();
