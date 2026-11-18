/* ==========================================================================
   DATA — the tower's two kinds of information, "proches et lointaines" (p. 27).
   Each channel yields x_j ∈ [0,1] "mirroring the degree of activity of the
   associated data" (computed, after Schöffer, by dividing a value by its maximum).
   Where no browser-reachable live source exists, the channel falls back to
   the method of Schöffer's own simulation (pp. 113–116): Poisson draws and
   random walks around a 24-hour "programme type de rythmes" (p. 29).
   ========================================================================== */
const DATA = (function () {
  'use strict';
  const SITE = { lat: 48.8974, lon: 2.2229, name: 'Nanterre, La Folie — environ 1 km à l’ouest du C.N.I.T. (pp. 14–15, 70, 133, 135)' };
  const CDG = { lat: 49.0097, lon: 2.5479 };
  const PARIS = { lat: 48.8530, lon: 2.3499 };
  const cfg = { avKey: '', avSymbol: 'EWQ', primKey: '', mic: false, radio: true };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const now = () => Date.now();
  let mode = 'live';           // 'live' | 'sim' (network blocked)
  const log = [];              // messages for the teletype
  function say(s) { log.push({ t: now(), s }); if (log.length > 400) log.shift(); }

  // ---------------- Paris clock ----------------
  function parisParts(d) {
    const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    const o = {}; f.formatToParts(d || new Date()).forEach(p => o[p.type] = p.value);
    const wd = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'].indexOf(o.weekday);
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd };
  }
  // the city's 24-hour rhythm, used only by simulated channels
  function rhythm(h) {
    const a = Math.exp(-Math.pow((h - 8.6) / 1.6, 2)), b = Math.exp(-Math.pow((h - 18.4) / 2.0, 2));
    const day = h > 6 && h < 23 ? 0.35 : 0.08;
    return clamp(day + 0.55 * a + 0.6 * b);
  }

  // ---------------- astronomy (Observatoire) ----------------
  // NOAA General Solar Position Calculations (accurate to about a minute in sunrise and sunset)
  function sunPosition(date, lat, lon) { // NOAA solar calculator (after Meeus), good to about a minute
    const rad = Math.PI / 180, t = new Date(date);
    const jd = +t / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(M * rad) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * rad) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * rad) * 0.000289;
    const lam = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * rad);
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos((125.04 - 1934.136 * T) * rad);
    const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad));
    const y = Math.tan(eps * rad / 2) ** 2;
    const eqt = 4 / rad * (y * Math.sin(2 * L0 * rad) - 2 * e * Math.sin(M * rad) + 4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) - 0.5 * y * y * Math.sin(4 * L0 * rad) - 1.25 * e * e * Math.sin(2 * M * rad));
    const hr = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600 + t.getUTCMilliseconds() / 3600000;
    const tst = ((hr * 60 + eqt + 4 * lon) % 1440 + 1440) % 1440;     // true solar time, minutes
    const ha = (tst / 4 - 180) * rad;
    const cz = Math.max(-1, Math.min(1, Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)));
    const zen = Math.acos(cz);
    let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat * rad) * Math.cos(zen) - Math.sin(dec)) / (Math.cos(lat * rad) * Math.sin(zen))))) / rad;
    az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;        // clockwise from north
    return { alt: 90 - zen / rad, az, dec: dec / rad };
  }
  function moonIllum(date) {
    const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14) ;
    const ph = (((date - ref) / 86400000) % syn + syn) % syn / syn;
    return { phase: ph, illum: (1 - Math.cos(2 * Math.PI * ph)) / 2 };
  }

  // ---------------- channels ----------------
  const channels = [], byId = {};
  function ch(spec) {
    const c = Object.assign({ status: 'ATTENTE', x: 0.5, raw: null, display: '—', hist: [], updated: 0, max: spec.max0 || 1, simState: Math.random() }, spec);
    channels.push(c); byId[c.id] = c; return c;
  }
  // proche — immediate environment (pp. 27, 122)
  ch({ id: 'photo', grp: 'proche', fr: 'Cellule photoélectrique', en: 'photocell', src: 'Open-Meteo · rayonnement global, La Défense', unit: 'W/m²', url: 'https://open-meteo.com' });
  ch({ id: 'couleur', grp: 'proche', fr: 'Cellule sensible aux couleurs', en: 'colour cell', src: 'dérivé : hauteur du soleil × nébulosité', unit: 'K' });
  ch({ id: 'thermo', grp: 'proche', fr: 'Thermomètre', en: 'thermometer', src: 'Open-Meteo · 2 m, La Défense', unit: '°C', url: 'https://open-meteo.com' });
  ch({ id: 'hygro', grp: 'proche', fr: 'Hygromètre', en: 'hygrometer', src: 'Open-Meteo · humidité relative', unit: '%', url: 'https://open-meteo.com' });
  ch({ id: 'vent10', grp: 'proche', fr: 'Anémomètre 10 m', en: 'anemometer', src: 'Open-Meteo · vent 10 m (+ rafales)', unit: 'km/h', url: 'https://open-meteo.com' });
  ch({ id: 'vent80', grp: 'proche', fr: 'Anémomètre 80 m', en: 'anemometer', src: 'Open-Meteo · vent 80 m', unit: 'km/h', url: 'https://open-meteo.com' });
  ch({ id: 'vent120', grp: 'proche', fr: 'Anémomètre 120 m', en: 'anemometer', src: 'Open-Meteo · vent 120 m', unit: 'km/h', url: 'https://open-meteo.com' });
  ch({ id: 'vent180', grp: 'proche', fr: 'Anémomètre 180 m', en: 'anemometer', src: 'Open-Meteo · vent 180 m', unit: 'km/h', url: 'https://open-meteo.com' });
  ch({ id: 'micro', grp: 'proche', fr: 'Microphones', en: 'microphones', src: 'bruit routier estimé (CoRTN) d’après les comptages Paris · ou micro local', unit: 'dB(A)' });
  ch({ id: 'contraintes', grp: 'proche', fr: 'Auscultation des contraintes', en: 'frame stresses', src: 'charge de vent (calculs p. 126–127) + sismicité EMSC', unit: '% charge' });
  // lointain — remote environment, by teletype (pp. 27, 122)
  ch({ id: 'bourse', grp: 'lointain', fr: 'La Bourse', en: 'stock exchange', src: 'Alpha Vantage (clé gratuite)', unit: '%', url: 'https://www.alphavantage.co' });
  ch({ id: 'meteo', grp: 'lointain', fr: 'La Météo (prévisions)', en: 'weather forecast', src: 'Open-Meteo · prévision J+1', unit: 'indice', url: 'https://open-meteo.com' });
  ch({ id: 'metro', grp: 'lointain', fr: 'Le Métro · SNCF', en: 'metro & rail', src: 'IDFM PRIM · messages de perturbation (clé gratuite)', unit: 'msgs', url: 'https://prim.iledefrance-mobilites.fr' });
  ch({ id: 'presse', grp: 'lointain', fr: 'L’A.F.P. · la presse', en: 'press', src: 'franceinfo (fil RSS) + comptes presse Bluesky', unit: 'dépêches/h', max0: 20 });
  ch({ id: 'circulation', grp: 'lointain', fr: 'Préfecture de police (circulation)', en: 'police traffic', src: 'Ville de Paris · comptages routiers permanents (≈2 970 capteurs)', unit: 'véh/h', url: 'https://opendata.paris.fr/explore/dataset/comptages-routiers-permanents/' });
  ch({ id: 'saturation', grp: 'lointain', fr: 'Directions saturées', en: 'saturated routes', src: 'Ville de Paris · état du trafic par capteur', unit: '%' });
  ch({ id: 'hopitaux', grp: 'lointain', fr: 'Services hospitaliers', en: 'hospitals', src: 'Santé publique France · passages aux urgences, Île-de-France', unit: '/100k', url: 'https://odisse.santepubliquefrance.fr' });
  ch({ id: 'telephone', grp: 'lointain', fr: 'P.T.T. · téléphones', en: 'telephones', src: 'Bluesky Jetstream · messages en français/min', unit: '/min', max0: 30 });
  ch({ id: 'telegraphe', grp: 'lointain', fr: 'P.T.T. · télégraphes', en: 'telegraphs', src: 'Wikimedia · modifications fr.wikipedia/min', unit: '/min', max0: 40 });
  ch({ id: 'chambre', grp: 'lointain', fr: 'Intensité sonore au fond de la Chambre', en: 'Chamber of Deputies', src: 'LCP (fil) + messages « Assemblée » Bluesky + heures de séance', unit: 'indice', max0: 6 });
  ch({ id: 'aerien', grp: 'lointain', fr: 'Navigation aérienne · Aéroport de Paris', en: 'air navigation', src: 'météo aéronautique dérivée à Roissy (Open-Meteo)', unit: 'catégorie' });
  ch({ id: 'radio', grp: 'lointain', fr: 'O.R.T.F. · radio', en: 'national radio', src: 'France Inter, flux en direct · niveau RMS', unit: 'dBFS' });
  ch({ id: 'tele', grp: 'lointain', fr: 'O.R.T.F. · information', en: 'national news channel', src: 'franceinfo, flux en direct · niveau RMS', unit: 'dBFS' });
  ch({ id: 'banque', grp: 'lointain', fr: 'Banque de France', en: 'central bank', src: 'BCE via Frankfurter · EUR/USD (60 j)', unit: 'USD', url: 'https://frankfurter.dev' });
  ch({ id: 'velib', grp: 'lointain', fr: 'R.A.T.P. · déplacements (Vélib’)', en: 'transport', src: 'Vélib’ Métropole · vélos en circulation', unit: '%', url: 'https://opendata.paris.fr' });
  ch({ id: 'observatoire', grp: 'lointain', fr: 'L’Observatoire', en: 'observatory', src: 'calcul : soleil et lune au-dessus de La Défense', unit: '°' });
  ch({ id: 'seisme', grp: 'lointain', fr: 'Sismicité', en: 'seismicity', src: 'EMSC · séismes 24 h, intensité estimée à La Défense', unit: 'MSK est.', url: 'https://www.seismicportal.eu' });
  ch({ id: 'pompiers', grp: 'lointain', fr: 'Sapeurs-pompiers', en: 'fire brigade', src: 'aucune source ouverte en temps réel — simulé (Poisson, μ = 3,7)', unit: 'interv.' });

  const ctx = { // derived quantities shared with the programme and renderer
    sun: { alt: 0, az: 0 }, moon: { illum: 0 }, cloud: 50, skyRGB: [0.1, 0.12, 0.2],
    wind: { v10: 10, v80: 15, v120: 17, v180: 20, gust: 1.4, means: [10, 15, 17, 20], dir: 250 }, humidity: 70, precip: 0,
    noiseDb: 62, trafficLambda: [1.2, 1.0], quadrantSat: [0, 0, 0, 0], quadrantHour: null,
    forecast: { bad: 0.3, label: '', weekend: null }, seismic: { I: 0, label: '' }, stress: { V: 0, M: 0, ratio: 0 },
    radio: { inter: null, info: null }, mic: null, regimeBits: new Array(10).fill(0)
  };

  function setCh(id, x, raw, display, status, note) {
    const c = byId[id]; if (!c) return;
    c.x = clamp(isFinite(x) ? x : 0.5); c.raw = raw; c.display = display; c.status = status; c.note = note || c.note; c.updated = now();
    c.hist.push([c.updated, c.x]); if (c.hist.length > 360) c.hist.shift();
  }
  function isLive(id) { const s = byId[id].status; return s === 'DIRECT' || s === 'DIFFÉRÉ' || s === 'DÉRIVÉ' || s === 'ARCHIVE'; }
  // "divides the number … by the maximum": decaying running maximum
  function byMax(c, v) { c.max = Math.max(v, c.max * 0.9995, (c.max0 || 1) * 0.25); return v / c.max; }

  // ---------------- fetch helpers ----------------
  async function getJSON(url, opt, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 20000);
    try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt || {})); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const OM = 'https://api.open-meteo.com/v1/forecast';

  // --- Open-Meteo at La Défense: photocell, thermometer, hygrometer, 4 anemometers, forecast
  async function fMeteo() {
    const u = `${OM}?latitude=${SITE.lat}&longitude=${SITE.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,shortwave_radiation,is_day,precipitation,weather_code&hourly=wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m&daily=weather_code,precipitation_sum,wind_speed_10m_max&timezone=Europe%2FParis&forecast_days=4`;
    const r = await getJSON(u);
    const c = r.current, hr = r.hourly;
    const P = parisParts();
    const idx = Math.max(0, hr.time.findIndex(t => +t.slice(11, 13) === P.h));
    const day = (k) => hr[k].slice(0, 24);
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
    ctx.wind = { v10: c.wind_speed_10m, v80: hr.wind_speed_80m[idx], v120: hr.wind_speed_120m[idx], v180: hr.wind_speed_180m[idx],
      gust: c.wind_gusts_10m && c.wind_speed_10m ? clamp(c.wind_gusts_10m / Math.max(1, c.wind_speed_10m), 1, 3) : 1.4,
      means: ['wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m', 'wind_speed_180m'].map(k => mean(day(k))), dir: c.wind_direction_10m };
    ctx.humidity = c.relative_humidity_2m; ctx.precip = c.precipitation;
    ctx.cloud = c.cloud_cover;
    setCh('photo', c.shortwave_radiation / 900, c.shortwave_radiation, `${c.shortwave_radiation} W/m²`, 'DIRECT');
    setCh('thermo', (c.temperature_2m + 10) / 50, c.temperature_2m, `${c.temperature_2m.toFixed(1)} °C`, 'DIRECT');
    setCh('hygro', c.relative_humidity_2m / 100, c.relative_humidity_2m, `${c.relative_humidity_2m} %`, 'DIRECT');
    // forecast badness for the "langage conventionnel" (p. 34)
    const sev = wc => wc >= 95 ? 1 : wc >= 85 ? .8 : wc >= 80 ? .65 : wc >= 71 ? .8 : wc >= 61 ? .65 : wc >= 51 ? .5 : wc >= 45 ? .4 : wc >= 2 ? .2 : 0;
    const bad = i => clamp(Math.max(sev(r.daily.weather_code[i]), r.daily.precipitation_sum[i] / 20, r.daily.wind_speed_10m_max[i] / 80));
    const tomorrow = bad(1), weekend = P.wd === 5 ? (bad(1) + bad(2)) / 2 : null;
    ctx.forecast = { bad: weekend != null ? weekend : tomorrow, tomorrow, weekend, code: r.daily.weather_code[1], precip: r.daily.precipitation_sum[1] };
    setCh('meteo', ctx.forecast.bad, ctx.forecast.bad, `J+1 : code ${r.daily.weather_code[1]}, ${r.daily.precipitation_sum[1]} mm`, 'DIRECT');
    // instantaneous noise level from rain hitting the microphones is ignored; heavy rain is in the hygrometer.
    say(`MÉTÉO LA DÉFENSE ${c.temperature_2m.toFixed(1)}C HR${c.relative_humidity_2m} VENT ${Math.round(c.wind_speed_10m)}KMH RAFALES ${Math.round(c.wind_gusts_10m)} NEBUL ${c.cloud_cover}`);
  }

  // --- aeronautical meteorology at Roissy as the air-navigation teletype (METAR-like flight category)
  async function fAero() {
    const u = `${OM}?latitude=${CDG.lat}&longitude=${CDG.lon}&current=visibility,cloud_cover_low,wind_speed_10m,wind_gusts_10m,weather_code&hourly=wind_speed_180m&forecast_days=1&timezone=Europe%2FParis`;
    const r = await getJSON(u); const c = r.current;
    const vis = c.visibility / 1000; // km
    const cat = vis < 1.6 || c.cloud_cover_low > 90 ? 'LIFR' : vis < 5 || c.cloud_cover_low > 75 ? 'IFR' : vis < 8 || c.cloud_cover_low > 55 ? 'MVFR' : 'VFR';
    const x = { VFR: .15, MVFR: .45, IFR: .75, LIFR: .95 }[cat] * 0.7 + clamp(c.wind_gusts_10m / 90) * 0.3;
    setCh('aerien', x, cat, `LFPG ${cat} · vis ${vis.toFixed(1)} km · bas ${c.cloud_cover_low} %`, 'DÉRIVÉ', 'Aucune source de trafic aérien n’accepte de requête depuis un navigateur.');
  }

  // --- EMSC seismicity → seismic channel and part of frame stresses
  async function fSeisme() {
    const since = new Date(now() - 86400000).toISOString().slice(0, 19);
    const r = await getJSON(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=200&lat=${SITE.lat}&lon=${SITE.lon}&maxradius=25&start=${since}`);
    let best = { I: 0, label: 'aucun' };
    (r.features || []).forEach(f => {
      const p = f.properties, [lon, lat] = f.geometry.coordinates;
      const Rkm = Math.max(10, hav(lat, lon, SITE.lat, SITE.lon) / 1000);
      const depth = Math.max(5, p.depth || 10);
      const hyp = Math.sqrt(Rkm * Rkm + depth * depth);
      // simple macroseismic attenuation: I = 1.5M − 3·log10(R) + 3.0 (order-of-magnitude estimate)
      const I = 1.5 * p.mag - 3 * Math.log10(hyp) + 3.0;
      if (I > best.I) best = { I, label: `M${p.mag.toFixed(1)} ${p.flynn_region} · ${Math.round(Rkm)} km`, mag: p.mag, R: Rkm, time: p.time };
    });
    ctx.seismic = best;
    setCh('seisme', (best.I - 0.5) / 5, best.I, best.I > 0 ? `I≈${best.I.toFixed(1)} · ${best.label}` : 'rien de ressenti (24 h)', 'DIRECT');
  }
  function hav(la1, lo1, la2, lo2) {
    const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }

  // --- Paris permanent road counters (the Préfecture's circulation information)
  // The open dataset is published about a day late; following Schöffer's remark that the city
  // runs a "programme type de rythmes qui se déroulent sur 24 heures" (p. 29), we read the most
  // recent day at the current clock hour.
  async function fTraffic() {
    const base = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents';
    const agg = await getJSON(`${base}/records?select=t_1h,sum(q)%20as%20q,avg(k)%20as%20k,count(q)%20as%20n&group_by=t_1h&order_by=t_1h%20desc&limit=48`);
    const rows = agg.results.filter(r => r.q != null);
    const P = parisParts();
    const hourOf = iso => parisParts(new Date(iso)).h;
    const pick = rows.find(r => hourOf(r.t_1h) === P.h) || rows[0];
    const qs = rows.map(r => r.q / Math.max(1, r.n));
    const qbar = pick.q / Math.max(1, pick.n), qmax = Math.max(...qs), qmin = Math.min(...qs);
    setCh('circulation', (qbar - qmin) / Math.max(1, qmax - qmin), qbar, `${Math.round(qbar)} véh/h/capteur · ${pick.t_1h.slice(0, 13).replace('T', ' ')}h UTC`, 'DIFFÉRÉ', 'Données de la veille, à la même heure.');
    // per-counter export for that hour: saturation share, quadrant saturation, axis flows
    const ex = await getJSON(`${base}/exports/json?select=libelle,q,etat_trafic,geo_point_2d&where=t_1h%3Ddate'${encodeURIComponent(pick.t_1h)}'`, null, 30000);
    let sat = 0, known = 0; const quad = [[0, 0], [0, 0], [0, 0], [0, 0]]; const flows = [], maillot = [];
    ex.forEach(r => {
      if (r.q != null) flows.push(r.q);
      if (/maillot|grande.arm|neuilly/i.test(r.libelle || '') && r.q != null) maillot.push(r.q);
      if (!r.etat_trafic || r.etat_trafic === 'Inconnu' || !r.geo_point_2d) return;
      known++; const s = /satur|bloqu/i.test(r.etat_trafic) ? 1 : 0; sat += s;
      const dx = r.geo_point_2d.lon - PARIS.lon, dy = r.geo_point_2d.lat - PARIS.lat;
      const qd = Math.abs(dx * 0.66) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 3 : 1); // E,S,W,N
      quad[qd][0] += s; quad[qd][1]++;
    });
    flows.sort((a, b) => b - a);
    const top = flows.slice(0, Math.max(1, Math.floor(flows.length / 10)));
    const qTop = top.reduce((s, v) => s + v, 0) / top.length;
    const qMai = maillot.length ? maillot.reduce((s, v) => s + v, 0) / maillot.length : qTop * 0.6;
    ctx.trafficLambda = [qTop / 720, qMai / 720];                 // vehicles per 5 s
    ctx.quadrantSat = quad.map(([s, n]) => n ? s / n : 0);
    ctx.quadrantHour = pick.t_1h;
    const share = known ? sat / known : 0;
    setCh('saturation', share * 4, share, `${(share * 100).toFixed(1)} % des capteurs saturés`, 'DIFFÉRÉ', 'Données de la veille, à la même heure.');
    // noise estimate (CoRTN: L10 = 42.2 + 10·log10 q, q in veh/h) — replaced by the local microphone if switched on
    ctx.noiseBase = 42.2 + 10 * Math.log10(Math.max(10, qbar));
    say(`PREFECTURE CIRCULATION ${Math.round(qbar)} VEH/H MOY · SATURES ${(share * 100).toFixed(1)}% · AXE MAILLOT ${Math.round(qMai)} VEH/H`);
  }

  async function fVelib() {
    const r = await getJSON('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?select=sum(numbikesavailable)%20as%20bikes,sum(capacity)%20as%20cap&limit=1');
    const { bikes, cap } = r.results[0];
    const out = clamp(1 - (bikes / cap) / 0.6);
    setCh('velib', out, bikes, `${bikes} vélos à quai / ${cap} bornes`, 'DIRECT');
  }

  async function fHopitaux() {
    const base = 'https://odisse.santepubliquefrance.fr/api/explore/v2.1/catalog/datasets/';
    const w = encodeURIComponent('region="11" and sursaud_cl_age_gene="Tous âges"');
    const [ira, tra] = await Promise.all([
      getJSON(`${base}infections-respiratoires-aigues-ira-passages-aux-urgences-et-actes-sos-medecins-region/records?limit=52&order_by=date_complet%20desc&where=${w}`),
      getJSON(`${base}traumatisme-passages-aux-urgences-et-actes-sos-medecins-region/records?limit=52&order_by=date_complet%20desc&where=${w}`)
    ]);
    const norm = (arr, k) => { const v = arr.map(r => r[k]).filter(x => x != null); const mn = Math.min(...v), mx = Math.max(...v); return [(v[0] - mn) / Math.max(1e-9, mx - mn), v[0]]; };
    const [a, av] = norm(ira.results, 'taux_passages_ira_sau'), [b, bv] = norm(tra.results, 'taux_passages_trauma_sau');
    setCh('hopitaux', (a + b) / 2, av, `IRA ${Math.round(av)} · trauma ${Math.round(bv)} /100k passages (sem. ${ira.results[0].semaine})`, 'DIFFÉRÉ', 'Série hebdomadaire.');
  }

  async function fBanque() {
    const end = new Date().toISOString().slice(0, 10), start = new Date(now() - 60 * 86400000).toISOString().slice(0, 10);
    const r = await getJSON(`https://api.frankfurter.dev/v1/${start}..${end}?base=EUR&symbols=USD`);
    const v = Object.values(r.rates).map(o => o.USD); const last = v[v.length - 1];
    const mn = Math.min(...v), mx = Math.max(...v);
    setCh('banque', (last - mn) / Math.max(1e-9, mx - mn), last, `EUR/USD ${last.toFixed(4)} (BCE)`, 'DIFFÉRÉ', 'Cours de référence quotidien.');
  }

  const RSS = 'https://api.rss2json.com/v1/api.json?rss_url=';
  const PRESS_BSKY = ['lemonde.fr', 'liberation.fr', 'franceinfo.fr', 'afp.com', 'mediapart.fr', 'humanite.fr', 'lefigaro.fr'];
  async function fPresse() {
    const hourAgo = now() - 3600000; let n = 0, ok = 0, last = '';
    try {
      const r = await getJSON(RSS + encodeURIComponent('https://www.francetvinfo.fr/titres.rss'));
      ok++; (r.items || []).forEach(it => { if (Date.parse(it.pubDate.replace(' ', 'T') + 'Z') > hourAgo) n++; });
      if (r.items && r.items[0]) last = r.items[0].title;
    } catch (e) { }
    await Promise.all(PRESS_BSKY.map(async h => {
      try {
        const r = await getJSON(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${h}&limit=30&filter=posts_no_replies`);
        ok++; (r.feed || []).forEach(f => { if (Date.parse(f.post.record.createdAt) > hourAgo) n++; });
      } catch (e) { }
    }));
    if (!ok) throw new Error('no press source');
    const c = byId.presse;
    setCh('presse', byMax(c, n), n, `${n} dépêches / 60 min`, 'DIRECT');
    if (last) { ctx.headline = last; say('AFP/PRESSE ' + last.toUpperCase().slice(0, 90)); }
  }

  async function fChambre() {
    let lcp = 0;
    try {
      const r = await getJSON(RSS + encodeURIComponent('https://lcp.fr/rss.xml'));
      const since = now() - 3 * 3600000;
      (r.items || []).forEach(it => { if (Date.parse(it.pubDate.replace(' ', 'T') + 'Z') > since) lcp++; });
      if (r.items && r.items[0]) { ctx.lcpHeadline = r.items[0].title; say('LCP ' + r.items[0].title.toUpperCase().slice(0, 90)); }
    } catch (e) { }
    stream.lcp = lcp;
  }

  async function fBourse() {
    if (!cfg.avKey) { byId.bourse.status = 'CLÉ'; return; }
    const r = await getJSON(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(cfg.avSymbol)}&apikey=${encodeURIComponent(cfg.avKey)}`);
    const q = r['Global Quote']; if (!q || !q['05. price']) throw new Error('quote');
    const pct = parseFloat(q['10. change percent']);
    setCh('bourse', 0.5 + pct / 4, pct, `${cfg.avSymbol} ${(+q['05. price']).toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)} %) · ${q['07. latest trading day']}`, 'DIRECT');
    say(`BOURSE ${cfg.avSymbol} ${q['10. change percent']}`);
  }

  async function fMetro() {
    if (!cfg.primKey) { byId.metro.status = 'CLÉ'; return; }
    const r = await getJSON('https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=ALL', { headers: { apikey: cfg.primKey } });
    const msgs = (((r.Siri || {}).ServiceDelivery || {}).GeneralMessageDelivery || [{}])[0].InfoMessage || [];
    const pert = msgs.filter(m => /perturb/i.test(m.InfoChannelRef && m.InfoChannelRef.value || JSON.stringify(m.InfoChannelRef || ''))).length;
    const c = byId.metro;
    setCh('metro', byMax(c, pert), pert, `${pert} perturbations en cours (${msgs.length} messages)`, 'DIRECT');
  }

  // ---------------- continuous streams: telephones, telegraphs, Chamber ----------------
  const stream = { fr: [], kw: [], wiki: [], ws: null, es: null, lcp: 0 };
  const KW = /assembl[ée]e nationale|\bd[ée]put[ée]|h[ée]micycle|49[\.\s-]?3|motion de censure|\bamendement|palais[- ]bourbon/i;
  function openStreams() {
    try {
      const ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post');
      ws.onmessage = m => {
        try {
          const d = JSON.parse(m.data); const rec = d.commit && d.commit.record;
          if (rec && rec.langs && rec.langs.indexOf('fr') >= 0) { stream.fr.push(now()); if (KW.test(rec.text || '')) stream.kw.push(now()); }
        } catch (e) { }
      };
      ws.onclose = () => { stream.ws = null; setTimeout(openStreams, 15000); };
      stream.ws = ws;
    } catch (e) { }
    try {
      if (!stream.es) {
        const es = new EventSource('https://stream.wikimedia.org/v2/stream/recentchange');
        es.onmessage = m => { try { if (JSON.parse(m.data).server_name === 'fr.wikipedia.org') stream.wiki.push(now()); } catch (e) { } };
        stream.es = es;
      }
    } catch (e) { }
  }
  function rateLast(arr, ms) { const t = now() - ms; while (arr.length && arr[0] < t - 600000) arr.shift(); let n = 0; for (let i = arr.length - 1; i >= 0 && arr[i] > t; i--) n++; return n; }
  let streamStart = 0;
  function updateStreams() {
    if (!streamStart) return;
    const span = Math.min(60000, now() - streamStart); if (span < 8000) return;
    const k = 60000 / span;
    const fr = rateLast(stream.fr, span) * k, wk = rateLast(stream.wiki, span) * k;
    if (stream.ws && stream.ws.readyState === 1) setCh('telephone', byMax(byId.telephone, fr), fr, `${fr.toFixed(1)} messages/min`, 'DIRECT');
    if (stream.es && stream.es.readyState === 1) setCh('telegraphe', byMax(byId.telegraphe, wk), wk, `${wk.toFixed(1)} modifications/min`, 'DIRECT');
    // the Chamber: sitting hours (Tue–Thu afternoons and evenings, Mon/Fri lighter) × the room's echo outside
    const P = parisParts(); const hm = P.h + P.mi / 60;
    const sitting = (P.wd >= 1 && P.wd <= 5) && ((hm >= 9.5 && hm < 13) || (hm >= 15 && hm < 20) || (hm >= 21.5 && hm < 24.5)) ? ([0, .6, 1, 1, 1, .5, 0][P.wd]) : 0;
    const kw = rateLast(stream.kw, 600000) / 10; // per minute over 10 min
    const v = sitting * 2 + kw + stream.lcp * 0.5;
    if (stream.ws && stream.ws.readyState === 1) setCh('chambre', byMax(byId.chambre, v), v, `${sitting ? 'en séance probable' : 'hors séance'} · ${kw.toFixed(1)} msg/min · LCP ${stream.lcp}/3 h`, 'DÉRIVÉ');
  }

  // ---------------- audio: France Inter, franceinfo, local microphone ----------------
  let AC = null;
  function audioLevel(an, buf) { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return 10 * Math.log10(s / buf.length + 1e-10); }
  function startAudio() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      AC.resume && AC.resume();
      const silent = AC.createGain(); silent.gain.value = 0; silent.connect(AC.destination);
      [['inter', 'https://icecast.radiofrance.fr/franceinter-midfi.mp3'], ['info', 'https://icecast.radiofrance.fr/franceinfo-midfi.mp3']].forEach(([k, url]) => {
        if (!cfg.radio || ctx.radio[k]) return;
        const el = new Audio(); el.crossOrigin = 'anonymous'; el.src = url; el.preload = 'none';
        const srcN = AC.createMediaElementSource(el); const an = AC.createAnalyser(); an.fftSize = 2048;
        srcN.connect(an); an.connect(silent);
        el.play().then(() => say(`ORTF BRANCHEMENT ${k === 'inter' ? 'FRANCE INTER' : 'FRANCEINFO'} OK`)).catch(e => say('ORTF ECHEC LECTURE ' + k));
        ctx.radio[k] = { el, an, buf: new Float32Array(2048), db: -60 };
      });
    } catch (e) { say('AUDIO INDISPONIBLE'); }
  }
  async function startMic() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const n = AC.createMediaStreamSource(s); const an = AC.createAnalyser(); an.fftSize = 2048; n.connect(an);
      ctx.mic = { an, buf: new Float32Array(2048), stream: s };
      say('MICROPHONE LOCAL BRANCHE (NON ETALONNE, +94 DB)');
    } catch (e) { say('MICROPHONE REFUSE'); cfg.mic = false; }
  }
  function stopMic() { if (ctx.mic) { ctx.mic.stream.getTracks().forEach(t => t.stop()); ctx.mic = null; } }
  function updateAudio() {
    [['inter', 'radio'], ['info', 'tele']].forEach(([k, id]) => {
      const r = ctx.radio[k]; if (!r) return;
      if (r.el.paused || r.el.readyState < 2) return;
      const db = audioLevel(r.an, r.buf); r.db = r.db * 0.6 + db * 0.4;
      setCh(id, (r.db + 50) / 45, r.db, `${r.db.toFixed(1)} dBFS`, 'DIRECT');
    });
  }

  // ---------------- per-tick computations (Δt = 5 s, as in the 1973 simulation) ----------------
  const simWalk = {};
  function walk(id, centre, sd) { const s = simWalk[id] = simWalk[id] == null ? centre : simWalk[id]; const v = clamp(s + (centre - s) * 0.08 + gauss() * sd); simWalk[id] = v; return v; }
  function gauss() { return Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random()); }
  function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }

  function tick(simTime) {
    const t = simTime || now(); const P = parisParts(new Date(t)); const h = P.h + P.mi / 60; const rh = rhythm(h);
    if (REPLAY.active) { applyReplay(t); channels.forEach(c => { if (c.status === 'DIRECT' || c.status === 'DIFFÉRÉ' || (c.status === 'DÉRIVÉ' && c.id !== 'aerien')) c.status = 'SIMULÉ'; }); }
    // Observatoire
    ctx.sun = sunPosition(t, SITE.lat, SITE.lon); ctx.moon = moonIllum(t);
    setCh('observatoire', clamp((ctx.sun.alt + 18) / 80), ctx.sun.alt, `soleil ${ctx.sun.alt.toFixed(1)}° · lune ${(ctx.moon.illum * 100).toFixed(0)} %`, 'DÉRIVÉ');
    // colour cell: correlated colour temperature from solar altitude and cloud cover
    const a = ctx.sun.alt, cl = ctx.cloud / 100;
    let K;
    if (a < -6) K = 2600 + 1400 * ctx.moon.illum * (1 - cl);             // night: sodium glow of the city, moonlight
    else if (a < 6) K = 2200 + (a + 6) * 140;                              // twilight
    else K = 5000 + 4500 * (1 - cl) * Math.min(1, a / 40) + 1500 * cl;    // day: blue sky vs. overcast
    ctx.skyK = K; ctx.skyRGB = kelvinRGB(K, a, cl);
    setCh('couleur', (K - 2000) / 9000, K, `${Math.round(K)} K`, isLive('photo') ? 'DÉRIVÉ' : 'SIMULÉ');

    // noise: local microphone, or traffic estimate with Poisson fluctuation per 5 s
    let db;
    if (ctx.mic) { db = audioLevel(ctx.mic.an, ctx.mic.buf) + 94; setCh('micro', (db - 40) / 45, db, `${db.toFixed(1)} dB (micro local)`, 'DIRECT'); }
    else {
      const base = ctx.noiseBase != null ? ctx.noiseBase : 52 + 16 * rh;
      const lam = Math.max(0.2, ctx.trafficLambda[0]); const k = poisson(lam);
      db = base + 10 * Math.log10((k + 0.5) / (lam + 0.5)) + gauss() * 1.2;
      setCh('micro', (db - 40) / 45, db, `${db.toFixed(1)} dB(A) estimés`, ctx.noiseBase != null ? 'DÉRIVÉ' : 'SIMULÉ');
    }
    ctx.noiseDb = db;
    // wind: hourly means from Open-Meteo with interpolated gusts every 5 s
    const W = ctx.wind, gf = (W.gust - 1) * 0.6;
    const vInst = [W.v10, W.v80, W.v120, W.v180].map((v, i) => Math.max(0, v * (1 + gf * gauss() * 0.5)));
    const wl = isLive('thermo');
    ['vent10', 'vent80', 'vent120', 'vent180'].forEach((id, i) => setCh(id, vInst[i] / 90, vInst[i], `${vInst[i].toFixed(0)} km/h (moy. jour ${W.means[i].toFixed(0)})`, wl ? (REPLAY.active ? 'ARCHIVE' : 'DIRECT') : 'SIMULÉ'));
    // frame stresses: NV 65 dynamic pressure q = V²/16.3 (daN/m², V in m/s), Schöffer's global coefficient 1.5
    // over the windward area Sv = 5,850 m² (p. 127); design shear 840 t at 143 kg/m².
    const v180 = vInst[3] / 3.6, qd = v180 * v180 / 16.3;   // daN/m² ≈ kg/m²
    const V = qd * 1.5 * 5850 / 1000;                        // tonnes
    const M = V * 307 / 2;                                   // t·m at the base (uniform load)
    ctx.stress = { V, M, ratio: V / 840, q: qd };
    const seis = clamp((ctx.seismic.I - 1) / 5);
    setCh('contraintes', Math.max(V / 840 * 1.6, seis), V, `effort tranchant ${V.toFixed(0)} t (${(V / 840 * 100).toFixed(1)} % de 840 t)`, wl ? 'DÉRIVÉ' : 'SIMULÉ');

    if (!REPLAY.active) { updateStreams(); updateAudio(); }

    // simulated fallbacks for every channel without a live reading
    channels.forEach(c => {
      if (isLive(c.id)) return;
      if (c.id === 'couleur' || c.id === 'micro' || c.id.startsWith('vent') || c.id === 'contraintes' || c.id === 'observatoire') return;
      let x;
      switch (c.id) {
        case 'photo': x = clamp(Math.sin(Math.max(0, ctx.sun.alt) * Math.PI / 180) * 0.9 * (1 - cl * 0.6)); break;
        case 'thermo': x = walk(c.id, 0.45 + 0.08 * Math.sin((h - 9) / 24 * 2 * Math.PI), 0.01); break;
        case 'pompiers': { const k = poisson(3.7); x = k / 8; c._k = k; break; }
        case 'circulation': case 'saturation': case 'velib': case 'metro': x = walk(c.id, rh, 0.04); break;
        case 'telephone': case 'telegraphe': case 'presse': case 'chambre': x = walk(c.id, 0.3 + 0.5 * rh, 0.06); break;
        case 'radio': case 'tele': x = walk(c.id, 0.6, 0.12); break;
        default: x = walk(c.id, 0.45, 0.03);
      }
      const st = (c.status === 'CLÉ') ? 'CLÉ' : 'SIMULÉ';
      c.x = x; c.status = st; c.display = c.id === 'pompiers' ? `${c._k} interventions / 5 s (simulé)` : 'simulé'; c.updated = now();
      c.hist.push([c.updated, x]); if (c.hist.length > 360) c.hist.shift();
    });

    // the ten binary sensors of the 1973 simulation (Annexe 1): 4 noise of increasing sensitivity,
    // 4 wind at different altitudes, 2 road-traffic sensors (Poisson draw exceeding its mean)
    const bits = [];
    [72, 68, 64, 60].forEach(th => bits.push(db > th ? 1 : 0));
    vInst.forEach((v, i) => bits.push(v > W.means[i] ? 1 : 0));
    ctx.trafficLambda.forEach(l => bits.push(poisson(l) > l ? 1 : 0));
    ctx.regimeBits = bits;
    return bits;
  }

  function kelvinRGB(K, alt, cl) {
    const t = K / 100; let r, g, b;
    r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
    g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755);
    b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
    const lum = alt < -6 ? 0.08 : alt < 6 ? 0.08 + (alt + 6) / 12 * 0.5 : 0.6 + 0.4 * (1 - cl * 0.5);
    return [r, g, b].map(v => clamp(v / 255) * lum);
  }

  // ---------------- replay of a past day ----------------
  // Archives that answer a browser: Open-Meteo historical forecasts (incl. 80/120/180 m winds), EMSC,
  // Paris counters (from 1 Oct 2025), Santé publique France, ECB, hourly fr.wikipedia page views.
  const REPLAY = { active: false, day: null, s: null, loading: false };
  const REPLAY_IDS = ['photo', 'thermo', 'hygro', 'meteo', 'aerien', 'seisme', 'circulation', 'saturation', 'hopitaux', 'banque', 'telegraphe'];
  function parisMidnightUTC(day) { // ISO of 00:00 Paris on that day
    for (const off of [1, 2]) { const iso = `${day}T00:00:00+0${off}:00`; const p = parisParts(new Date(iso)); if (p.h === 0) return new Date(iso); }
    return new Date(`${day}T00:00:00+01:00`);
  }
  async function loadReplay(day) {
    REPLAY.loading = true; say(`ARCHIVES — CHARGEMENT DU ${day}`);
    const t0 = parisMidnightUTC(day), t1 = new Date(t0.getTime() + 86400000);
    const next = new Date(t0.getTime() + 36 * 3600000).toISOString().slice(0, 10);
    const res = { t0: t0.getTime(), notes: [] };
    const HF = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
    const jobs = {
      site: getJSON(`${HF}?latitude=${SITE.lat}&longitude=${SITE.lon}&start_date=${day}&end_date=${next}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,shortwave_radiation,precipitation,wind_speed_80m,wind_speed_120m,wind_speed_180m&daily=weather_code,precipitation_sum,wind_speed_10m_max&timezone=Europe%2FParis`),
      cdg: getJSON(`${HF}?latitude=${CDG.lat}&longitude=${CDG.lon}&start_date=${day}&end_date=${day}&hourly=visibility,cloud_cover_low,wind_gusts_10m&timezone=Europe%2FParis`),
      emsc: getJSON(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=500&lat=${SITE.lat}&lon=${SITE.lon}&maxradius=25&start=${new Date(t0 - 86400000).toISOString().slice(0, 19)}&end=${t1.toISOString().slice(0, 19)}`),
      traf: getJSON(`https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/records?select=t_1h,sum(q)%20as%20q,count(q)%20as%20n&group_by=t_1h&where=${encodeURIComponent(`t_1h>=date'${t0.toISOString()}' and t_1h<date'${t1.toISOString()}'`)}&order_by=t_1h&limit=30`),
      big: getJSON(`https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/records?select=t_1h,avg(q)%20as%20q&group_by=t_1h&where=${encodeURIComponent(`q>800 and t_1h>=date'${t0.toISOString()}' and t_1h<date'${t1.toISOString()}'`)}&order_by=t_1h&limit=30`),
      sat: getJSON(`https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/records?select=t_1h,etat_trafic,count(*)%20as%20n&group_by=t_1h,etat_trafic&where=${encodeURIComponent(`t_1h>=date'${t0.toISOString()}' and t_1h<date'${t1.toISOString()}'`)}&limit=200`),
      hosp: getJSON(`https://odisse.santepubliquefrance.fr/api/explore/v2.1/catalog/datasets/infections-respiratoires-aigues-ira-passages-aux-urgences-et-actes-sos-medecins-region/records?limit=52&order_by=date_complet%20desc&where=${encodeURIComponent(`region="11" and sursaud_cl_age_gene="Tous âges" and date_complet<=date'${day}'`)}`),
      bank: getJSON(`https://api.frankfurter.dev/v1/${new Date(t0 - 60 * 86400000).toISOString().slice(0, 10)}..${day}?base=EUR&symbols=USD`),
      wiki: getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/fr.wikipedia.org/all-access/user/hourly/${t0.toISOString().slice(0, 13).replace(/[-T]/g, '')}/${new Date(t1 - 3600000).toISOString().slice(0, 13).replace(/[-T]/g, '')}`)
    };
    const got = {};
    await Promise.all(Object.entries(jobs).map(async ([k, p]) => { try { got[k] = await p; } catch (e) { res.notes.push(`${k} : ${e.message}`); } }));
    if (!got.site) { REPLAY.loading = false; throw new Error('pas de météo archivée pour ce jour'); }
    const H = got.site.hourly; res.site = H.time.slice(0, 24).map((_, i) => i);
    res.hour = k => Math.min(23, Math.max(0, k));
    res.H = H; res.daily = got.site.daily;
    // traffic quadrants for the 17–20 h signalling: three exports
    if (got.traf && got.traf.results.length) {
      res.traf = got.traf.results; res.big = got.big ? got.big.results : [];
      const sat = {}; (got.sat ? got.sat.results : []).forEach(r => { const k = r.t_1h; sat[k] = sat[k] || [0, 0]; if (r.etat_trafic !== 'Inconnu') { sat[k][1] += r.n; if (/satur|bloqu/i.test(r.etat_trafic)) sat[k][0] += r.n; } });
      res.sat = sat; res.quad = {};
      for (const hh of [17, 18, 19]) {
        const iso = new Date(t0.getTime() + hh * 3600000).toISOString();
        try {
          const ex = await getJSON(`https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/exports/json?select=etat_trafic,geo_point_2d&where=${encodeURIComponent(`t_1h=date'${iso}'`)}`, null, 30000);
          const quad = [[0, 0], [0, 0], [0, 0], [0, 0]];
          ex.forEach(r => { if (!r.etat_trafic || r.etat_trafic === 'Inconnu' || !r.geo_point_2d) return; const s = /satur|bloqu/i.test(r.etat_trafic) ? 1 : 0; const dx = r.geo_point_2d.lon - PARIS.lon, dy = r.geo_point_2d.lat - PARIS.lat; const qd = Math.abs(dx * 0.66) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 3 : 1); quad[qd][0] += s; quad[qd][1]++; });
          res.quad[hh] = quad.map(([s, n]) => n ? s / n : 0);
        } catch (e) { }
      }
    } else res.notes.push('circulation : aucune archive avant le 1er octobre 2025');
    res.cdg = got.cdg && got.cdg.hourly;
    res.quakes = got.emsc ? got.emsc.features.map(f => { const p = f.properties, [lon, lat] = f.geometry.coordinates; const R = Math.max(10, hav(lat, lon, SITE.lat, SITE.lon) / 1000); const hyp = Math.sqrt(R * R + Math.max(5, p.depth || 10) ** 2); return { t: Date.parse(p.time), I: 1.5 * p.mag - 3 * Math.log10(hyp) + 3, label: `M${p.mag.toFixed(1)} ${p.flynn_region} · ${Math.round(R)} km` }; }) : [];
    if (got.hosp && got.hosp.results.length) { const v = got.hosp.results.map(r => r.taux_passages_ira_sau); const mn = Math.min(...v), mx = Math.max(...v); res.hosp = { x: (v[0] - mn) / Math.max(1e-9, mx - mn), v: v[0], wk: got.hosp.results[0].semaine }; }
    if (got.bank) { const v = Object.values(got.bank.rates).map(o => o.USD); const mn = Math.min(...v), mx = Math.max(...v); res.bank = { x: (v[v.length - 1] - mn) / Math.max(1e-9, mx - mn), v: v[v.length - 1] }; }
    if (got.wiki) { res.wiki = got.wiki.items.map(i => i.views); res.wikiMax = Math.max(...res.wiki); }
    REPLAY.s = res; REPLAY.day = day; REPLAY.active = true; REPLAY.loading = false;
    say(`ARCHIVES DU ${day} CHARGEES${res.notes.length ? ' — LACUNES : ' + res.notes.join(' ; ').toUpperCase() : ''}`);
    return res;
  }
  function stopReplay() { REPLAY.active = false; REPLAY.s = null; say('RETOUR AU DIRECT'); jobs.forEach(j => run(j)); }
  function applyReplay(t) {
    const R = REPLAY.s; const hf = (t - R.t0) / 3600000; const k = Math.floor(hf), fr = hf - k;
    const H = R.H; const at = (key) => { const a = H[key]; if (!a) return null; const i = Math.min(a.length - 1, Math.max(0, k)); const j2 = Math.min(a.length - 1, i + 1); return a[i] + (a[j2] - a[i]) * fr; };
    const st = 'ARCHIVE';
    const rad = at('shortwave_radiation'), T = at('temperature_2m'), RH = at('relative_humidity_2m');
    setCh('photo', rad / 900, rad, `${rad.toFixed(0)} W/m²`, st);
    setCh('thermo', (T + 10) / 50, T, `${T.toFixed(1)} °C`, st);
    setCh('hygro', RH / 100, RH, `${RH.toFixed(0)} %`, st);
    const day24 = key => (H[key] || []).slice(0, 24); const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    ctx.wind = { v10: at('wind_speed_10m'), v80: at('wind_speed_80m'), v120: at('wind_speed_120m'), v180: at('wind_speed_180m'), gust: clamp(at('wind_gusts_10m') / Math.max(1, at('wind_speed_10m')), 1, 3), means: ['wind_speed_10m', 'wind_speed_80m', 'wind_speed_120m', 'wind_speed_180m'].map(k2 => mean(day24(k2))), dir: at('wind_direction_10m') };
    ctx.cloud = at('cloud_cover'); ctx.humidity = RH; ctx.precip = at('precipitation');
    const D = R.daily; const sev = wc => wc >= 95 ? 1 : wc >= 85 ? .8 : wc >= 80 ? .65 : wc >= 71 ? .8 : wc >= 61 ? .65 : wc >= 51 ? .5 : wc >= 45 ? .4 : wc >= 2 ? .2 : 0;
    if (D && D.weather_code.length > 1) { const b = clamp(Math.max(sev(D.weather_code[1]), D.precipitation_sum[1] / 20, D.wind_speed_10m_max[1] / 80)); ctx.forecast = { bad: b, tomorrow: b, weekend: null }; setCh('meteo', b, b, `J+1 : code ${D.weather_code[1]}`, st); }
    if (R.cdg) { const i = Math.min(23, Math.max(0, k)); const vis = R.cdg.visibility[i] / 1000, low = R.cdg.cloud_cover_low[i]; const cat = vis < 1.6 || low > 90 ? 'LIFR' : vis < 5 || low > 75 ? 'IFR' : vis < 8 || low > 55 ? 'MVFR' : 'VFR'; setCh('aerien', { VFR: .15, MVFR: .45, IFR: .75, LIFR: .95 }[cat] * 0.7 + clamp(R.cdg.wind_gusts_10m[i] / 90) * 0.3, cat, `LFPG ${cat} · vis ${vis.toFixed(1)} km`, st); }
    let best = { I: 0, label: 'rien de ressenti' }; R.quakes.forEach(q => { if (q.t <= t && q.t > t - 86400000 && q.I > best.I) best = q; });
    ctx.seismic = { I: best.I, label: best.label, time: best.t }; setCh('seisme', (best.I - 0.5) / 5, best.I, best.I > 0 ? `I≈${best.I.toFixed(1)} · ${best.label}` : 'rien de ressenti', st);
    if (R.traf) {
      const i = Math.min(R.traf.length - 1, Math.max(0, k)); const row = R.traf[i];
      const qs = R.traf.map(r => r.q / Math.max(1, r.n)); const qbar = row.q / Math.max(1, row.n); const mn = Math.min(...qs), mx = Math.max(...qs);
      setCh('circulation', (qbar - mn) / Math.max(1, mx - mn), qbar, `${Math.round(qbar)} véh/h/capteur`, st);
      const sat = R.sat[row.t_1h] || [0, 1]; const share = sat[0] / Math.max(1, sat[1]);
      setCh('saturation', share * 4, share, `${(share * 100).toFixed(1)} % des capteurs saturés`, st);
      const big = R.big.find(b => b.t_1h === row.t_1h); const qTop = big ? big.q : qbar * 3;
      ctx.trafficLambda = [qTop / 720, qTop * 0.6 / 720]; ctx.noiseBase = 42.2 + 10 * Math.log10(Math.max(10, qbar));
      const P = parisParts(new Date(t)); if (R.quad[P.h]) ctx.quadrantSat = R.quad[P.h];
    }
    if (R.hosp) setCh('hopitaux', R.hosp.x, R.hosp.v, `IRA ${Math.round(R.hosp.v)} /100k (sem. ${R.hosp.wk})`, st);
    if (R.bank) setCh('banque', R.bank.x, R.bank.v, `EUR/USD ${R.bank.v.toFixed(4)}`, st);
    if (R.wiki) { const i = Math.min(R.wiki.length - 1, Math.max(0, k)); setCh('telegraphe', R.wiki[i] / R.wikiMax, R.wiki[i], `${Math.round(R.wiki[i] / 1000)} k consultations fr.wikipedia/h`, st, 'En archive : consultations horaires, faute de modifications archivées à l’heure.'); }
  }

  // ---------------- scheduler ----------------
  const jobs = [
    ['meteo', fMeteo, 10 * 60e3, ['photo', 'thermo', 'hygro', 'meteo']],
    ['aero', fAero, 10 * 60e3, ['aerien']],
    ['seisme', fSeisme, 2 * 60e3, ['seisme']],
    ['traffic', fTraffic, 15 * 60e3, ['circulation', 'saturation']],
    ['velib', fVelib, 2 * 60e3, ['velib']],
    ['hopitaux', fHopitaux, 6 * 3600e3, ['hopitaux']],
    ['banque', fBanque, 6 * 3600e3, ['banque']],
    ['presse', fPresse, 10 * 60e3, ['presse']],
    ['chambre', fChambre, 10 * 60e3, []],
    ['bourse', fBourse, 60 * 60e3, ['bourse']],
    ['metro', fMetro, 5 * 60e3, ['metro']]
  ];
  const timers = [];
  async function run(job) {
    const [name, fn, , ids] = job;
    if (REPLAY.active) return;
    try { await fn(); }
    catch (e) {
      ids.forEach(id => { if (byId[id].status !== 'CLÉ') byId[id].status = 'SIMULÉ'; byId[id].note = 'Échec : ' + (e.message || e); });
      say(`LIGNE ${name.toUpperCase()} HORS SERVICE — ${String(e.message || e).toUpperCase().slice(0, 40)} — SIMULATION`);
    }
  }
  async function probe() {
    const urls = [`${OM}?latitude=${SITE.lat}&longitude=${SITE.lon}&current=temperature_2m`, 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD', 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=1'];
    for (let k = 0; k < 3; k++) {
      const ok = await Promise.any(urls.map(u => getJSON(u, null, 15000))).then(() => true, () => false);
      if (ok) return true;
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }
  function goLive() {
    mode = 'live';
    say('TELESCRIPTEURS EN LIGNE');
    jobs.forEach(j => { run(j); timers.push(setInterval(() => run(j), j[2])); });
    openStreams(); streamStart = now();
    if (cfg.radio) startAudio();
    if (cfg.mic) startMic();
  }
  async function start(opts) {
    Object.assign(cfg, opts || {});
    say('CENTRE CYBERNETIQUE T.L.C. — MISE SOUS TENSION');
    const ok = await probe();
    if (!ok) {
      mode = 'sim';
      channels.forEach(c => { c.status = c.id === 'bourse' || c.id === 'metro' ? 'CLÉ' : 'SIMULÉ'; });
      say('RESEAU INACCESSIBLE — LIGNES EN SIMULATION (METHODE DE 1973) — NOUVEL ESSAI CHAQUE MINUTE');
      const retry = setInterval(async () => { if (await probe()) { clearInterval(retry); goLive(); } }, 60000);
      return mode;
    }
    goLive();
    return mode;
  }
  function refreshKeys() { run(jobs.find(j => j[0] === 'bourse')); run(jobs.find(j => j[0] === 'metro')); }

  return { SITE, cfg, ctx, channels, byId, tick, start, loadReplay, stopReplay, REPLAY, log, say, parisParts, rhythm, startAudio, startMic, stopMic, refreshKeys, get mode() { return mode; }, poisson, gauss, sunPosition, moonIllum };
})();
if (typeof module !== 'undefined') module.exports = DATA;
