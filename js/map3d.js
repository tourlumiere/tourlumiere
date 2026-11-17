/* ==========================================================================
   MAQUETTE 3D — the traced tower extruded among the real buildings of
   Nanterre and La Défense (OpenStreetMap heights via OpenFreeMap, MapLibre).
   ========================================================================== */
const MAP3D = (function () {
  'use strict';
  let map = null, T = null, follow = true, sat = false;
  const SOCLE = 26; // the socle's height (p. 132): level 0 of the ossature stands on it

  function m2ll(e, n) { const lat0 = DATA.SITE.lat, lon0 = DATA.SITE.lon; return [lon0 + e / (111320 * Math.cos(lat0 * Math.PI / 180)), lat0 + n / 111320]; }
  // world: +x east, +z south → east = x, north = −z
  function rect(cx, cz, ux, uz, len, wid) { // centred rectangle with long axis (ux,uz)
    const vx = -uz, vz = ux, hl = len / 2, hw = wid / 2;
    const P = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]].map(([a, b]) => [cx + ux * a + vx * b, cz + uz * a + vz * b]);
    return P.map(([x, z]) => m2ll(x, -z));
  }
  function towerGeoJSON() {
    const F = [];
    const add = (ring, base, top, color, kind) => F.push({ type: 'Feature', properties: { base, top, color, kind }, geometry: { type: 'Polygon', coordinates: [ring] } });
    // socle: inverted trapezoid, 40 m at the ground to 70 m at the slab, in three steps
    [[0, 9, 46], [9, 18, 58], [18, SOCLE, 70]].forEach(([b, t, w]) => add(rect(0, 0, 1, 0, w, w), b, t, '#8a8780', 'socle'));
    T.members.forEach(m => {
      const [ax, ay, az] = m.a, [bx, by, bz] = m.b;
      const dx = bx - ax, dz = bz - az, horiz = Math.hypot(dx, dz);
      if (horiz < 0.01) add(rect(ax, az, 1, 0, m.w, m.w), SOCLE + Math.min(ay, by), SOCLE + Math.max(ay, by), '#b8a596', 'ossature');
      else { const y = (ay + by) / 2; add(rect((ax + bx) / 2, (az + bz) / 2, dx / horiz, dz / horiz, horiz, m.w), SOCLE + y - m.w / 2, SOCLE + y + m.w / 2, '#b8a596', 'ossature'); }
    });
    T.PLATFORMS.forEach(y => add(rect(0, 0, 1, 0, 2 * T.CX + 2, 2 * T.CZ + 2), SOCLE + y - 1.2, SOCLE + y, '#6c6f75', 'plateforme'));
    T.axes.forEach(ax => ax.mirrors.forEach(mm => add(rect(ax.x, ax.z, Math.cos(mm.phase), Math.sin(mm.phase), mm.w, 0.4), SOCLE + mm.yc - mm.h / 2, SOCLE + mm.yc + mm.h / 2, '#dfe7ee', 'miroir')));
    return { type: 'FeatureCollection', features: F };
  }

  // the same map lives either in the corner (small) or in the large panel
  let size = null;
  function place(where) {
    const el = $id('m3d-map');
    if (where === 'small') { $id('mm3d-slot').appendChild(el); $id('m3d').hidden = true; $id('minimap').classList.add('is3d'); }
    else { $id('m3d-slot').appendChild(el); $id('m3d').hidden = false; $id('minimap').classList.remove('is3d'); }
    size = where;
    if (map) setTimeout(() => { map.resize(); map.jumpTo(view(where)); }, 30);
  }
  function view(where) { return where === 'small' ? { zoom: 14.05, pitch: 42, center: [DATA.SITE.lon, DATA.SITE.lat], padding: { top: 90, bottom: 0, left: 0, right: 0 } } : { zoom: 15.2, pitch: 64, center: [DATA.SITE.lon, DATA.SITE.lat], padding: { top: 0, bottom: 0, left: 0, right: 0 } }; }
  function open(tower, where) {
    T = tower; place(where || 'large');
    if (map) { map.resize(); return; }
    if (typeof maplibregl === 'undefined') { $id('m3d-info').textContent = 'MapLibre n’a pas pu être chargé.'; return; }
    const site = [DATA.SITE.lon, DATA.SITE.lat];
    map = new maplibregl.Map(Object.assign({ container: 'm3d-map', style: 'https://tiles.openfreemap.org/styles/liberty', bearing: bearingNow(), maxPitch: 80, attributionControl: { compact: false } }, view(size)));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => {
      map.addSource('esri', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri, Maxar' });
      const firstSymbol = (map.getStyle().layers.find(l => l.type === 'symbol') || {}).id;
      map.addLayer({ id: 'esri', type: 'raster', source: 'esri', layout: { visibility: 'none' } }, firstSymbol);
      map.addSource('tlc', { type: 'geojson', data: towerGeoJSON() });
      map.addLayer({ id: 'tlc', type: 'fill-extrusion', source: 'tlc', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 1 } });
      if (map.getLayer('building-3d')) map.setPaintProperty('building-3d', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#d9d4cc', 60, '#c9c2b6', 150, '#a9b4c2']);
      tallest();
    });
    map.on('moveend', tallest);
    map.on('dragstart', () => { if (size === 'large') { follow = false; $id('m3d-follow').checked = false; } });
    map.on('mousemove', e => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['tlc', 'building-3d'].filter(l => map.getLayer(l)) })[0];
      const tip = $id('m3d-tip');
      if (!f) { tip.hidden = true; return; }
      tip.hidden = false; tip.style.left = (e.point.x + 12) + 'px'; tip.style.top = (e.point.y + 12) + 'px';
      tip.textContent = f.layer.id === 'tlc' ? `T.L.C. · ${f.properties.kind} · ${Math.round(f.properties.top)} m` : `bâtiment · ${Math.round(f.properties.render_height || 0)} m${f.properties.name ? ' · ' + f.properties.name : ''}`;
    });
  }
  function tallest() {
    if (!map || !map.getLayer('building-3d')) return;
    let best = 0; map.queryRenderedFeatures({ layers: ['building-3d'] }).forEach(f => { best = Math.max(best, f.properties.render_height || 0); });
    $id('m3d-info').innerHTML = `T.L.C. : <b>${SOCLE + T.H} m</b> au-dessus du sol (socle ${SOCLE} m + ossature ${T.H} m), sans les mâts · plus haut bâtiment dans le champ : <b>${Math.round(best)} m</b> (hauteurs OpenStreetMap, parfois estimées)`;
  }
  function bearingNow() { const c = VIEW.cam; return ((-c.az * 180 / Math.PI) % 360 + 360) % 360; }
  function sync() { if (map && follow && size) map.jumpTo({ bearing: bearingNow() }); }
  function close() { $id('m3d').hidden = true; $id('minimap').classList.remove('is3d'); size = null; }
  function shrink() { place('small'); }
  function isSmall() { return size === 'small'; }
  function toggleSat() { if (!map || !map.getLayer('esri')) return; sat = !sat; map.setLayoutProperty('esri', 'visibility', sat ? 'visible' : 'none'); $id('m3d-sat').classList.toggle('on', sat); }
  function setFollow(v) { follow = v; sync(); }
  function $id(i) { return document.getElementById(i); }
  return { open, close, shrink, isSmall, sync, toggleSat, setFollow };
})();
