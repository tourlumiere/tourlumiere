/* ==========================================================================
   RENDER — the tower at La Défense, three.js r128 (+ bloom if available).
   ========================================================================== */
function makeView(sharedCam, opts) {
  const DRIVER = !opts || opts.driver !== false;
  'use strict';
  let renderer, scene, camera, composer, bloom, T, canvas;
  let memberMesh, mirrorMesh, curvedMesh, lightPts, lightGeo, beaconPts, beams = [], lasers = [], smokePts, smokeGeo, sky, stars, cityPts, hemi, sun, bandLights = [];
  const cam = sharedCam || { az: 0.32, el: 0.1, dist: 720, target: new THREE.Vector3(0, 165, 0), auto: true };
  const mirrorAngle = new Float32Array(400);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let lightColAttr, lightIAttr, lightSizeAttr;
  const SMOKE_N = 5000; let smokeHead = 0; const smokeVel = new Float32Array(SMOKE_N * 3), smokeLife = new Float32Array(SMOKE_N), smokeAge = new Float32Array(SMOKE_N);
  const GROUND = -26;
  let hasBloom = false;

  function init(el, tower) {
    T = tower; canvas = el;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0d14, 0.00018);
    camera = new THREE.PerspectiveCamera(38, 1, 1, 30000);

    // ----- sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x02030a) }, uHor: { value: new THREE.Color(0x101624) }, uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uSunCol: { value: new THREE.Color(0xffc080) }, uFlash: { value: 0 }, uTowerDir: { value: new THREE.Vector3(0, 0, -1) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 uTop,uHor,uSunDir,uSunCol,uTowerDir; uniform float uFlash; varying vec3 vP;
        void main(){ float h = clamp(vP.y,0.,1.); vec3 c = mix(uHor,uTop,pow(h,0.55));
          float s = max(dot(normalize(vP),normalize(uSunDir)),0.); c += uSunCol*pow(s,24.)*0.6 + uSunCol*pow(s,3.)*0.08;
          vec2 a = normalize(vP.xz + 1e-5), b = normalize(uTowerDir.xz + 1e-5); float toward = pow(max(dot(a,b),0.),14.); float low = exp(-h*9.);
          c += vec3(0.9,0.92,1.)*uFlash*toward*low*0.22; gl_FragColor = vec4(c,1.); }`
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), skyMat); scene.add(sky);
    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 2500; i++) { const u = Math.random(), v = Math.random() * 0.95; const th = u * Math.PI * 2, ph = Math.acos(1 - v); sp.push(Math.sin(ph) * Math.cos(th) * 18000, Math.cos(ph) * 18000, Math.sin(ph) * Math.sin(th) * 18000); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    scene.add(stars);

    hemi = new THREE.HemisphereLight(0x8899bb, 0x221811, 0.2); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffeedd, 0.0); scene.add(sun);
    for (let b = 0; b < 6; b++) { const L = new THREE.PointLight(0xffffff, 0, 220, 1.6); L.position.set(0, 25 + b * 52, 0); scene.add(L); bandLights.push(L); }

    // ----- ground, the city, the historic axis
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: 0x15171a }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; scene.add(ground);
    const cg = new THREE.BufferGeometry(), cp = [], cc = [];
    for (let i = 0; i < 9000; i++) {
      const toParis = Math.random() < 0.55;
      const r = 300 + Math.pow(Math.random(), 0.7) * 9000, a = toParis ? (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      cp.push(x, GROUND + 1 + Math.random() * (r < 1500 ? 60 : 12), z);
      const w = Math.random(); cc.push(1, 0.62 + w * 0.25, 0.28 + w * 0.35);
    }
    // the voie triomphale toward the Étoile (east–south-east)
    for (let i = 0; i < 900; i++) { const d = 120 + i * 9; const side = i % 2 ? 1 : -1; cp.push(d * 0.985, GROUND + 3, d * 0.17 + side * 22); cc.push(1, 0.85, 0.6); }
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    cityPts = new THREE.Points(cg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    scene.add(cityPts);
    // a few 1970s towers of La Défense, and the CNIT vault
    const bmat = new THREE.MeshLambertMaterial({ color: 0x2a2e36 });
    // zone A of La Défense, about 1 km to the east (p. 70): a few towers of the 1970s
    [[900, 120, 75, 30], [960, -60, 90, 32], [1040, 160, 82, 28], [1120, 40, 70, 34], [1180, -140, 95, 30], [1250, 90, 60, 26], [1320, -40, 88, 30], [980, 260, 55, 28], [1400, 150, 70, 24]].forEach(([x, z, h, w]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h * 2.2, w * 0.6), bmat); m.position.set(x, GROUND + h * 1.1, z); scene.add(m);
    });
    const cnit = new THREE.Mesh(new THREE.SphereGeometry(120, 3, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5a5f66 }));
    cnit.scale.set(1, 0.38, 1); cnit.rotation.y = Math.PI / 6; cnit.position.set(1000, GROUND, 40); scene.add(cnit); // C.N.I.T., ~1 km east

    // ----- socle (70 m × 70 m slab, trapezoidal)
    // socle as drawn on p. 132: an inverted trapezoid, 70 m at the slab, about 40 m at the ground, 26 m high
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(70 / Math.SQRT2, 40 / Math.SQRT2, -GROUND, 4, 1), new THREE.MeshLambertMaterial({ color: 0x6d6a64 }));
    socle.rotation.y = Math.PI / 4; socle.position.y = GROUND / 2; scene.add(socle);

    // ----- the ossature: square Corten tubes
    const box = new THREE.BoxGeometry(1, 1, 1);
    memberMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x7a685a }), T.members.length);
    T.members.forEach((m, i) => {
      const a = new THREE.Vector3(...m.a), b = new THREE.Vector3(...m.b);
      const d = b.clone().sub(a), len = d.length();
      tmpQ.setFromUnitVectors(up, d.clone().normalize());
      tmpM.compose(a.clone().add(b).multiplyScalar(0.5), tmpQ, tmpS.set(m.w, len, m.w));
      memberMesh.setMatrixAt(i, tmpM);
    });
    scene.add(memberMesh);
    // platforms
    T.PLATFORMS.forEach(y => { const p = new THREE.Mesh(new THREE.BoxGeometry(2 * T.CX + 2, 1.2, 2 * T.CZ + 2), new THREE.MeshLambertMaterial({ color: 0x3b3d42 })); p.position.y = y; scene.add(p); });

    // ----- mirrors on their 114 vertical axes
    const mirrors = []; T.axes.forEach((ax, ai) => ax.mirrors.forEach((m, mi) => mirrors.push({ ax, ai, m })));
    mirrorMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false }), mirrors.length);
    mirrorMesh.userData.list = mirrors;
    mirrors.forEach((q, i) => { mirrorAngle[i] = q.m.phase; mirrorMesh.setColorAt(i, new THREE.Color(0.2, 0.22, 0.25)); });
    scene.add(mirrorMesh);
    // 14 curved mirrors
    curvedMesh = new THREE.Group();
    T.curved.forEach(c => {
      const g = new THREE.CylinderGeometry(c.rad, c.rad, c.h, 12, 1, true, 0, 1.3);
      const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0x9aa4ae, specular: 0xffffff, shininess: 160, side: THREE.DoubleSide, emissive: 0x000000 }));
      m.position.set(c.x, c.y, c.z); m.rotation.y = c.rot; curvedMesh.add(m);
    });
    scene.add(curvedMesh);

    // ----- light organs as glowing points (one draw call)
    const lights = T.organs.filter(o => o.type >= 2 && o.type <= 7);
    lightGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(lights.length * 3), col = new Float32Array(lights.length * 3), I = new Float32Array(lights.length), size = new Float32Array(lights.length);
    lights.forEach((o, k) => {
      pos.set(o.p, k * 3);
      const c = T.RGB[o.colour || 'blanc']; col.set(c, k * 3);
      size[k] = o.type === 2 ? (o.laserFlash ? 90 : o.big ? 28 : 9) : o.type === 5 || o.type === 6 ? 20 : o.type === 7 ? 7 : 12;
    });
    lightGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lightColAttr = new THREE.BufferAttribute(col, 3); lightIAttr = new THREE.BufferAttribute(I, 1); lightSizeAttr = new THREE.BufferAttribute(size, 1);
    lightGeo.setAttribute('aColor', lightColAttr); lightGeo.setAttribute('aI', lightIAttr); lightGeo.setAttribute('aSize', lightSizeAttr);
    lightGeo.userData.list = lights;
    lightPts = new THREE.Points(lightGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 600 }, uDay: { value: 0 }, uVanish: { value: 0 } },
      vertexShader: `attribute vec3 aColor; attribute float aI; attribute float aSize; uniform float uScale; varying vec3 vC; varying float vI;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vC = aColor; vI = aI;
          gl_PointSize = aI > 0.01 ? clamp(aSize*(0.55+0.45*aI)*uScale/-mv.z, 1.5, 160.) : 0.;
          gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uDay,uVanish; varying vec3 vC; varying float vI;
        void main(){ vec2 d = gl_PointCoord-0.5; float r2 = dot(d,d)*4.; if(r2>1.) discard;
          float a = exp(-r2*14.)*1.4 + exp(-r2*3.2)*0.35;
          gl_FragColor = vec4(vC*a*vI*(1.-0.6*uDay)*(1.-0.92*uVanish), 1.); }`
    }));
    scene.add(lightPts);
    // aviation lamps
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(T.beacons.flat(), 3));
    beaconPts = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xff2010, size: 7, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(beaconPts);

    // ----- 40 marine projectors: 2 km beams
    const beamMat = () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(1, 1, 1) }, uI: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN,vV)),1.6); float f = pow(vY,2.2); gl_FragColor = vec4(uCol*uI*f*edge*0.55,1.); }'
    });
    T.organs.filter(o => o.type === 5 || o.type === 6).forEach(o => {
      const g = new THREE.CylinderGeometry(1.0, 34, 2000, 20, 1, true); g.translate(0, -1000, 0); // apex at origin, extends along -y
      const m = new THREE.Mesh(g, beamMat()); m.position.set(...o.p); m.userData.o = o; m.frustumCulled = false;
      beams.push(m); scene.add(m);
    });
    // ----- 24 lasers, each in two segments (source → mirror → sky)
    T.organs.filter(o => o.type === 7).forEach(o => {
      const mk = () => { const g = new THREE.CylinderGeometry(0.35, 0.35, 1, 6, 1, true); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(...T.RGB[o.colour]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); m.frustumCulled = false; scene.add(m); return m; };
      lasers.push({ o, a: mk(), b: mk() });
    });

    // ----- smoke particles
    smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE_N * 3).fill(-9999), 3));
    smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(SMOKE_N), 1));
    smokeGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(SMOKE_N), 1));
    smokePts = new THREE.Points(smokeGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 }, uCol: { value: new THREE.Color(0.5, 0.5, 0.52) } },
      vertexShader: 'attribute float aSize; attribute float aA; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vA = aA; gl_PointSize = clamp(aSize*uScale/-mv.z, 0., 400.); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float r2 = dot(d,d)*4.; if(r2>1.) discard; gl_FragColor = vec4(uCol, vA*(1.-r2)*(1.-r2)); }'
    }));
    smokePts.frustumCulled = false; scene.add(smokePts);

    // ----- bloom, if the example scripts loaded
    try {
      if (THREE.EffectComposer && THREE.UnrealBloomPass) {
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));
        bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 1.05, 0.55, 0.12);
        composer.addPass(bloom); hasBloom = true;
      }
    } catch (e) { hasBloom = false; }

    bindControls();
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setSize(w, h); }
    const s = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    lightPts.material.uniforms.uScale.value = s; smokePts.material.uniforms.uScale.value = s;
  }

  function bindControls() {
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button, az: cam.az, el: cam.el, ty: cam.target.y }; cam.auto = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.b === 2 || e.shiftKey) cam.target.y = Math.max(0, Math.min(330, drag.ty + dy * cam.dist / 900));
      else { cam.az = drag.az - dx * 0.005; cam.el = Math.max(-0.15, Math.min(1.45, drag.el + dy * 0.004)); }
    });
    canvas.addEventListener('pointerup', () => drag = null);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(40, Math.min(9000, cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  }
  function preset(name) {
    cam.auto = false;
    const P = {
      paris: { az: 0.32, el: 0.1, dist: 720, ty: 165 }, pied: { az: 0.9, el: -0.12, dist: 170, ty: 170 },
      lointain: { az: 0.2, el: 0.06, dist: 4200, ty: 220 }, facade: { az: 0, el: 0, dist: 780, ty: 150 }, plateforme: { az: 0.1, el: -0.05, dist: 40, ty: 272 }, plan: { az: 0.0, el: 1.42, dist: 900, ty: 150 }
    }[name]; if (!P) return;
    Object.assign(cam, { az: P.az, el: P.el, dist: P.dist }); cam.target.y = P.ty;
  }

  // ---------------------------------------------------------------- frame
  let last = performance.now();
  function frame(OUT, ctx, S, simT) {
    const nowp = performance.now(), dt = Math.min(0.1, (nowp - last) / 1000); last = nowp;
    if (cam.auto && DRIVER) cam.az += dt * 0.03;
    camera.position.set(cam.target.x + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist, cam.target.y + Math.sin(cam.el) * cam.dist, cam.target.z + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist);
    camera.lookAt(cam.target);

    // daylight from the photocell's sun
    const alt = ctx.sun.alt, dl = Math.max(0, Math.min(1, (alt + 4) / 14));
    const cl = (ctx.cloud || 50) / 100;
    const sk = ctx.skyRGB || [0.1, 0.1, 0.15];
    sky.material.uniforms.uHor.value.setRGB(0.02 + sk[0] * 0.9, 0.025 + sk[1] * 0.9, 0.04 + sk[2] * 0.95);
    sky.material.uniforms.uTop.value.setRGB(0.004 + sk[0] * 0.35 * (1 - cl * 0.4), 0.006 + sk[1] * 0.45, 0.015 + sk[2] * 0.8);
    const azr = ctx.sun.az * Math.PI / 180, altr = alt * Math.PI / 180;
    const sunDir = new THREE.Vector3(Math.sin(azr) * Math.cos(altr), Math.sin(altr), -Math.cos(azr) * Math.cos(altr)); // az from north, clockwise; +x east, +z south
    sky.material.uniforms.uSunDir.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(1000); sun.intensity = dl * (1 - cl * 0.6) * 0.9;
    hemi.intensity = 0.12 + 0.75 * dl;
    stars.material.opacity = Math.max(0, 1 - dl * 3) * (1 - cl * 0.85);
    cityPts.material.opacity = 0.9 * Math.max(0.05, 1 - dl * 1.6);
    const hum = (ctx.humidity || 70) / 100;
    scene.fog.color.copy(sky.material.uniforms.uHor.value);
    scene.fog.density = 0.00008 + 0.00022 * hum * hum + (ctx.precip > 0 ? 0.00015 : 0);

    // organ intensities and colours
    const list = lightGeo.userData.list, Ia = lightIAttr.array, Ca = lightColAttr.array;
    let flashE = 0; const band = Array.from({ length: 6 }, () => [0, 0, 0, 0]);
    for (let k = 0; k < list.length; k++) {
      const o = list[k]; let v = OUT.I[o.id];
      Ia[k] = Ia[k] * 0.55 + v * 0.45; if (o.type === 2) Ia[k] = v;           // flashes are instantaneous
      const ci = OUT.colour[o.id]; const c = T.RGB[ci !== 255 ? T.COLOURS[ci] : (o.colour || 'blanc')];
      Ca[k * 3] = c[0]; Ca[k * 3 + 1] = c[1]; Ca[k * 3 + 2] = c[2];
      if (o.type === 2 && v > 0) flashE += o.big ? 0.02 : 0.002;
      if (Ia[k] > 0.05) { const b = band[Math.min(5, Math.floor(o.h * 6))]; b[0] += c[0] * Ia[k]; b[1] += c[1] * Ia[k]; b[2] += c[2] * Ia[k]; b[3]++; }
    }
    lightIAttr.needsUpdate = true; lightColAttr.needsUpdate = true;
    lightPts.material.uniforms.uDay.value = dl; lightPts.material.uniforms.uVanish.value = OUT.vanish;
    // flashes light the haze around the tower only: direction from the viewer to the tower, fading with distance
    sky.material.uniforms.uTowerDir.value.set(-camera.position.x, 0, -camera.position.z);
    sky.material.uniforms.uFlash.value = Math.min(1, flashE) * (1 - dl) * Math.min(1, 900 / Math.max(300, Math.hypot(camera.position.x, camera.position.z)));
    bandLights.forEach((L, b) => { const B = band[b]; const n = Math.max(1, B[3]); L.color.setRGB(B[0] / n, B[1] / n, B[2] / n); L.intensity = Math.min(3, B[3] / 40) * (1 - dl * 0.8) * (1 - OUT.vanish); });
    beaconPts.material.opacity = (Math.floor(nowp / 700) % 2 ? 1 : 0.15);

    // mirrors: rotate, and glint toward the camera with the light around them
    const ml = mirrorMesh.userData.list; const camP = camera.position;
    for (let i = 0; i < ml.length; i++) {
      const q = ml[i]; let target = OUT.axisSpeed[q.ai];
      // optional, outside the text: an idle (unbraked) mirror swings in the gusts at its height
      if (ctx.mirrorWind && Math.abs(target) < 0.01) { const w = ctx.wind || {}; const v = ((q.m.yc > 150 ? w.v180 : q.m.yc > 100 ? w.v120 : w.v80) || 15) / 3.6; const g = (w.gust || 1.4) - 1; target = 0.012 * v * (1 + 2 * g) * Math.sin(nowp / 1000 * (0.35 + 0.2 * Math.sin(q.m.phase)) + q.m.phase * 5) * Math.sqrt(q.m.w * q.m.h / 20); }
      q.v = (q.v || 0) + (target - (q.v || 0)) * Math.min(1, dt * 0.8);       // motor inertia
      mirrorAngle[i] += q.v * dt;
      const ang = mirrorAngle[i] + q.m.phase;
      tmpQ.setFromAxisAngle(up, ang);
      tmpM.compose(tmpV.set(q.ax.x, q.m.yc, q.ax.z), tmpQ, tmpS.set(q.m.w, q.m.h, 1));
      mirrorMesh.setMatrixAt(i, tmpM);
      const nx = Math.sin(ang), nz = Math.cos(ang);
      const vx = camP.x - q.ax.x, vy = camP.y - q.m.yc, vz = camP.z - q.ax.z, vl = Math.hypot(vx, vy, vz);
      const facing = Math.abs((nx * vx + nz * vz) / vl);
      const glint = Math.pow(facing, 12);
      const B = band[Math.min(5, Math.floor(q.m.yc / T.H * 6))]; const nb = Math.max(1, B[3]); const lit = Math.min(1, B[3] / 60);
      const r = 0.08 + 0.25 * dl * sk[0] * 2 + glint * (lit * B[0] / nb * 1.6 + dl * 1.2);
      const g = 0.09 + 0.25 * dl * sk[1] * 2 + glint * (lit * B[1] / nb * 1.6 + dl * 1.2);
      const bb = 0.10 + 0.28 * dl * sk[2] * 2 + glint * (lit * B[2] / nb * 1.6 + dl * 1.2);
      mirrorMesh.setColorAt(i, tmpColor.setRGB(r * (1 - OUT.vanish), g * (1 - OUT.vanish), bb * (1 - OUT.vanish)));
      q.n = [nx, 0, nz];
    }
    mirrorMesh.instanceMatrix.needsUpdate = true; if (mirrorMesh.instanceColor) mirrorMesh.instanceColor.needsUpdate = true;

    // beams: summit inclined beams set in motion; lateral beams sweep slowly
    const t = simT / 1000;
    beams.forEach((m, k) => {
      const o = m.userData.o, v = OUT.I[o.id];
      m.userData.I = (m.userData.I || 0) * 0.9 + v * 0.1;
      const a = o.aim; let ax = a[0], ay = a[1], az = a[2];
      if (!(o.summit && ay > 0.95)) { const s = Math.sin(t * 0.07 + k) * 0.35 * (o.summit ? 2.5 : 1); const c = Math.cos(s), sn = Math.sin(s); const x2 = ax * c - az * sn, z2 = az * c + ax * sn; ax = x2; az = z2; }
      tmpQ.setFromUnitVectors(tmpV.set(0, -1, 0), tmpS.set(ax, ay, az).normalize());
      m.quaternion.copy(tmpQ);
      const ci = OUT.colour[o.id]; const c = T.RGB[ci !== 255 ? T.COLOURS[ci] : o.colour];
      m.material.uniforms.uCol.value.setRGB(c[0], c[1], c[2]);
      m.material.uniforms.uI.value = m.userData.I * (1 - dl) * (1 - OUT.vanish * 0.8);
      m.visible = m.material.uniforms.uI.value > 0.01;
    });
    // lasers reflected by the rotating mirrors
    lasers.forEach(L => {
      const v = OUT.I[L.o.id];
      const ax = T.axes[L.o.target.ax], mm = ax.mirrors[L.o.target.mi];
      if (L.idx == null) L.idx = ml.findIndex(q => q.ax === ax && q.m === mm); const idx = L.idx;
      const P0 = tmpV.set(...L.o.p).clone(), P1 = new THREE.Vector3(ax.x, mm.yc, ax.z);
      const d = P1.clone().sub(P0).normalize();
      const n = idx >= 0 && ml[idx].n ? new THREE.Vector3(...ml[idx].n) : new THREE.Vector3(1, 0, 0);
      const r = d.clone().sub(n.clone().multiplyScalar(2 * d.dot(n))).normalize();
      seg(L.a, P0, P1); seg(L.b, P1, P1.clone().add(r.multiplyScalar(4000)));
      const op = v * (1 - dl) * (1 - OUT.vanish) * (0.75 + 0.25 * Math.random());
      L.a.material.opacity = op; L.b.material.opacity = op * 0.85;
    });

    // smoke: programme-driven puffs, and the disappearance cloud
    stepSmoke(OUT, ctx, dt, dl);

    if (hasBloom) { bloom.strength = 0.6 + 0.8 * (1 - dl); composer.render(); } else renderer.render(scene, camera);
  }
  const tmpColor = new THREE.Color();
  function seg(mesh, a, b) {
    const d = b.clone().sub(a), len = d.length();
    tmpQ.setFromUnitVectors(up, d.normalize());
    mesh.position.copy(a.clone().add(b).multiplyScalar(0.5)); mesh.quaternion.copy(tmpQ); mesh.scale.set(1, len, 1);
  }
  function spawn(p, vel, life, size) {
    const i = smokeHead; smokeHead = (smokeHead + 1) % SMOKE_N;
    const P = smokeGeo.attributes.position.array; P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2];
    smokeVel[i * 3] = vel[0]; smokeVel[i * 3 + 1] = vel[1]; smokeVel[i * 3 + 2] = vel[2];
    smokeLife[i] = life; smokeAge[i] = 0; smokeGeo.attributes.aSize.array[i] = size;
  }
  function stepSmoke(OUT, ctx, dt, dl) {
    const wd = ((ctx.wind && ctx.wind.dir) || 250) * Math.PI / 180, ws = ((ctx.wind && ctx.wind.v10) || 10) / 3.6 * 0.6;
    const wx = -Math.sin(wd) * ws, wz = Math.cos(wd) * ws; // wind blows from dir
    T.organs.forEach(o => {
      if (o.type !== 8) return; const v = OUT.smoke[o.id];
      if (v > 0 && Math.random() < v * dt * 1.2) spawn(o.p, [wx + (Math.random() - .5) * 2, 0.6 + Math.random() * 1.5, wz + (Math.random() - .5) * 2], 10 + Math.random() * 10, 5 + Math.random() * 7);
    });
    if (OUT.vanish > 0) {
      const n = Math.floor(OUT.vanish * dt * 900);
      for (let k = 0; k < n; k++) {
        const y = Math.random() * T.H * 1.05; const r = 20 + Math.random() * 45 * (0.6 + y / T.H);
        const a = Math.random() * Math.PI * 2;
        spawn([Math.cos(a) * r, y, Math.sin(a) * r], [wx * 0.3 + (Math.random() - .5), 0.5 + Math.random(), wz * 0.3 + (Math.random() - .5)], 30 + Math.random() * 30, 35 + Math.random() * 45);
      }
    }
    const P = smokeGeo.attributes.position.array, A = smokeGeo.attributes.aA.array, Sz = smokeGeo.attributes.aSize.array;
    for (let i = 0; i < SMOKE_N; i++) {
      if (smokeLife[i] <= 0) { A[i] = 0; continue; }
      smokeAge[i] += dt; const f = smokeAge[i] / smokeLife[i];
      if (f >= 1) { smokeLife[i] = 0; A[i] = 0; P[i * 3 + 1] = -9999; continue; }
      P[i * 3] += smokeVel[i * 3] * dt; P[i * 3 + 1] += smokeVel[i * 3 + 1] * dt; P[i * 3 + 2] += smokeVel[i * 3 + 2] * dt;
      Sz[i] += dt * (Sz[i] > 30 ? 2.5 : 1.2); A[i] = Math.sin(Math.PI * f) * (Sz[i] > 30 ? 0.55 : 0.28);
    }
    smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.aA.needsUpdate = true; smokeGeo.attributes.aSize.needsUpdate = true;
    const g = 0.18 + 0.55 * dl; smokePts.material.uniforms.uCol.value.setRGB(g, g, g * 1.04);
  }

  function project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * canvas.clientWidth, y: (1 - v.y) / 2 * canvas.clientHeight }; }
  function dispose() { try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { } window.removeEventListener('resize', resize); }
  return { init, frame, preset, cam, resize, dispose, project, get hasBloom() { return hasBloom; } };
}
const VIEW = makeView();
