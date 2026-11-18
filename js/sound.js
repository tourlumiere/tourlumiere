/* ==========================================================================
   SOUND — the sonorisation of the earlier towers, after Schöffer's account of
   Saint-Cloud (1955) and Liège (1961), pp. 10, 12–13: tape loops running
   continuously, from which the control system "piquait et mélangeait de façon
   aléatoire des séquences selon le degré d'excitation ou de relaxation de
   l'environnement". At Liège the four loops held metallic percussion played on
   the tower and reworked electronically, city noises, birdsong and bells. The
   tapes are lost or unavailable; the four loops here are synthesized stand-ins.
   The 1973 text gives the La Défense tower no automatic sound: this layer is an
   extrapolation, off by default.
   ========================================================================== */
const SOUND = (function () {
  'use strict';
  let ac = null, master = null, on = false, bands = [], voices = [], nextPick = 0, vol = 0.6;
  const LOOP = 24; // seconds per loop
  const R = Math.random;

  function buf(fn) {
    const sr = ac.sampleRate, n = Math.floor(sr * LOOP), b = ac.createBuffer(2, n, sr);
    const L = b.getChannelData(0), Rr = b.getChannelData(1); fn(L, Rr, sr, n);
    let mx = 1e-6; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(L[i]), Math.abs(Rr[i]));
    for (let i = 0; i < n; i++) { L[i] /= mx * 1.15; Rr[i] /= mx * 1.15; }
    return b;
  }
  // 1. metallic percussion struck on the frame, reworked: inharmonic modes, ring-modulated, with a delay
  function metal(L, Rr, sr, n) {
    const modes = [1, 2.76, 5.40, 8.93, 13.34];
    for (let k = 0; k < 70; k++) {
      const t0 = Math.floor(R() * n), f = 140 + R() * 900, dec = 0.25 + R() * 1.6, amp = 0.3 + R() * 0.7, pan = R(), ring = 30 + R() * 300;
      for (let m = 0; m < modes.length; m++) {
        const fm = f * modes[m] * (1 + (R() - 0.5) * 0.02), a = amp / (m + 1);
        const len = Math.min(n - t0, Math.floor(sr * dec * 2.5 / (1 + m * 0.4)));
        for (let i = 0; i < len; i++) {
          const t = i / sr, v = a * Math.exp(-t / (dec / (1 + m * 0.4))) * Math.sin(2 * Math.PI * fm * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * ring * t));
          L[t0 + i] += v * (1 - pan); Rr[t0 + i] += v * pan;
        }
      }
    }
    const d = Math.floor(sr * 0.37); for (let i = d; i < n; i++) { L[i] += Rr[i - d] * 0.35; Rr[i] += L[i - d] * 0.35; }
  }
  // 2. city noise: rumbling traffic, passing vehicles, a few horns
  function city(L, Rr, sr, n) {
    let b0 = 0, b1 = 0, c0 = 0, c1 = 0;
    const pass = Array.from({ length: 14 }, () => ({ t: R() * LOOP, d: 2 + R() * 4, p: R() }));
    for (let i = 0; i < n; i++) {
      const t = i / sr; b0 = 0.995 * b0 + 0.05 * (R() * 2 - 1); b1 = 0.995 * b1 + 0.05 * (R() * 2 - 1);
      let g = 0.5 + 0.2 * Math.sin(2 * Math.PI * t / 7.3), gl = 0, gr = 0;
      for (const q of pass) { const x = (t - q.t) / q.d; if (x > -1 && x < 1) { const e = Math.cos(x * Math.PI / 2) ** 2; gl += e * (1 - (q.p + x * 0.5)); gr += e * (q.p + x * 0.5); } }
      c0 = 0.9 * c0 + 0.1 * (R() * 2 - 1); c1 = 0.9 * c1 + 0.1 * (R() * 2 - 1);
      L[i] = b0 * g + c0 * gl * 0.5; Rr[i] = b1 * g + c1 * gr * 0.5;
    }
    for (let k = 0; k < 4; k++) {
      const t0 = Math.floor(R() * (n - sr)), f = 380 + R() * 140, len = Math.floor(sr * (0.2 + R() * 0.5)), pan = R();
      for (let i = 0; i < len; i++) { const v = 0.12 * Math.sign(Math.sin(2 * Math.PI * f * i / sr)) * Math.min(1, i / 200, (len - i) / 200); L[t0 + i] += v * (1 - pan); Rr[t0 + i] += v * pan; }
    }
  }
  // 3. birdsong: chirps, sweeps and trills
  function birds(L, Rr, sr, n) {
    for (let k = 0; k < 90; k++) {
      const t0 = Math.floor(R() * (n - sr)), f0 = 2200 + R() * 3500, sweep = (R() - 0.4) * 2500, len = Math.floor(sr * (0.04 + R() * 0.18)), trill = R() < 0.3 ? 25 + R() * 25 : 0, pan = R(), a = 0.2 + R() * 0.8;
      const reps = R() < 0.4 ? 2 + Math.floor(R() * 5) : 1;
      for (let r = 0; r < reps; r++) {
        const s0 = t0 + r * Math.floor(len * 1.6); let ph = 0;
        for (let i = 0; i < len && s0 + i < n; i++) {
          const x = i / len, f = f0 + sweep * x + (trill ? 300 * Math.sin(2 * Math.PI * trill * i / sr) : 0); ph += 2 * Math.PI * f / sr;
          const v = a * Math.sin(ph) * Math.sin(Math.PI * x) ** 2; L[s0 + i] += v * (1 - pan); Rr[s0 + i] += v * pan;
        }
      }
    }
  }
  // 4. bells: church-bell partials (hum, prime, minor third, fifth, nominal …)
  function bells(L, Rr, sr, n) {
    const P = [[0.5, 1], [1, 0.8], [1.2, 0.6], [1.5, 0.4], [2, 0.7], [2.5, 0.25], [3, 0.2], [4.2, 0.1]];
    const fund = [262, 294, 330, 392, 440, 196];
    for (let k = 0; k < 16; k++) {
      const t0 = Math.floor(R() * n), f = fund[Math.floor(R() * fund.length)], pan = 0.2 + R() * 0.6, len = Math.min(n - t0, sr * 7);
      for (const [r, a] of P) { const d = 4.5 / (1 + r); for (let i = 0; i < len; i++) { const t = i / sr, v = a * Math.exp(-t / d) * Math.sin(2 * Math.PI * f * r * t * (1 + 0.0007 * Math.sin(t * 5))); L[t0 + i] += v * (1 - pan); Rr[t0 + i] += v * pan; } }
    }
  }

  function start() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      bands = [metal, city, birds, bells].map(buf);
    }
    ac.resume(); on = true; master.gain.setTargetAtTime(vol, ac.currentTime, 0.5);
  }
  function stop() { on = false; if (ac) master.gain.setTargetAtTime(0, ac.currentTime, 0.3); }
  function setVolume(v) { vol = v; if (ac && on) master.gain.setTargetAtTime(v, ac.currentTime, 0.2); }

  // the command system picks a band and a sequence in it, at random, weighted by excitation
  function pick(ex, silent) {
    const t = ac.currentTime;
    voices = voices.filter(v => v.end > t);
    if (silent) return;
    const maxV = 1 + Math.round(ex * 3);
    if (voices.length >= maxV) return;
    // excited: percussion and city dominate; relaxed: birds and bells
    const w = [0.15 + ex * 0.9, 0.2 + ex * 0.5, 0.2 + (1 - ex) * 0.9, 0.15 + (1 - ex) * 0.7];
    let r = R() * w.reduce((a, b) => a + b), k = 0; while (r > w[k]) r -= w[k++];
    const dur = (2 + R() * 6) * (1.4 - ex * 0.8), off = R() * (LOOP - dur);
    const src = ac.createBufferSource(); src.buffer = bands[k];
    src.playbackRate.value = 1 + (R() - 0.5) * 0.08 * (1 + ex);
    const g = ac.createGain(), fade = Math.min(0.8, dur / 4), lvl = (0.25 + 0.75 * ex) * [0.9, 0.55, 0.6, 0.55][k];
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + fade); g.gain.setValueAtTime(lvl, t + dur - fade); g.gain.linearRampToValueAtTime(0, t + dur);
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) { p.pan.value = (R() - 0.5) * 0.8; src.connect(g).connect(p).connect(master); } else src.connect(g).connect(master);
    src.start(t, off, dur); voices.push({ end: t + dur, k });
  }
  // S: programme state (D 0–10, τ, régime, shutdown)
  function tick(S) {
    if (!on || !ac) return;
    const ex = Math.max(0, Math.min(1, (S.D || 0) / 10 * 0.7 + (S.tau || 0.5) * 0.3));
    const now = ac.currentTime;
    if (now >= nextPick) { pick(ex, S.shutdown); nextPick = now + (0.6 + R() * 2.5) * (1.5 - ex); }
  }
  return { start, stop, tick, setVolume, get on() { return on; }, get voices() { return voices.map(v => v.k); } };
})();
