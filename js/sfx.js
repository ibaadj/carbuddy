/* Car Buddy sound effects — synthesized with the Web Audio API (no audio files).
 *   Sfx.unlock()      call from a tap/click (browsers only allow audio after a gesture)
 *   Sfx.play("bonk")  bonk clonk splat wheee giggle poke hmph ding snore blegh cool crumble rebuild boop
 *                     purr thump poof jingle woof boo hoho growl squeak
 *   Sfx.setOn(bool)   remembered on this device
 */
(function () {
  "use strict";
  const KEY = "carbuddy.sound";
  let ctx = null, master = null, noiseBuf = null;
  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch (err) { /* ignore */ }

  function unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
    } catch (err) { /* no audio available */ }
  }

  // A pitched blip: frequency sweeps f0 → f1, optional wobble (vibrato) and low-pass filter
  function tone(type, f0, f1, dur, vol, delay, opt) {
    opt = opt || {};
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (opt.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = opt.vib[0]; lg.gain.value = opt.vib[1];
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opt.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opt.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opt.lp; o.connect(f); node = f; }
    node.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Filtered noise burst (splats, thuds, snores)
  function noise(dur, freq, q, vol, delay, attack) {
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    bonk()  { tone("sine", 320, 70, 0.22, 0.9); noise(0.07, 1400, 1.2, 0.5); },
    clonk() { tone("triangle", 560, 240, 0.14, 0.7); tone("sine", 980, 420, 0.1, 0.35, 0.025); noise(0.05, 2500, 2, 0.3); },
    splat() { noise(0.4, 450, 0.6, 1.0); tone("sine", 220, 45, 0.3, 0.6); noise(0.15, 2200, 1, 0.25, 0.05); },
    wheee() { tone("sine", 480, 1500, 0.7, 0.35, 0, { vib: [9, 40], attack: 0.05 }); },
    giggle() { [0, 0.09, 0.18, 0.27].forEach((d, i) => tone("sine", i % 2 ? 760 : 900, i % 2 ? 700 : 840, 0.08, 0.3, d)); },
    poke()  { tone("sine", 480, 760, 0.08, 0.35); },
    hmph()  { tone("sawtooth", 170, 110, 0.3, 0.3, 0, { lp: 900 }); },
    ding()  { tone("sine", 1320, 1320, 0.7, 0.35); tone("sine", 1980, 1980, 0.45, 0.15, 0.02); },
    snore() { noise(1.3, 260, 1.5, 0.18, 0, 0.5); },
    blegh() { tone("sawtooth", 240, 85, 0.6, 0.35, 0, { vib: [11, 25], lp: 1100 }); },
    // speed-bump crumble: a clatter of little pieces, then a rising "zip" as they fly back
    crumble() { for (let i = 0; i < 14; i++) { const d = i * 0.045 + Math.random() * 0.03; noise(0.05, 1800 + Math.random() * 2500, 4, 0.35 * (1 - i / 16), d); tone("triangle", 900 + Math.random() * 900, 400, 0.05, 0.12, d); } },
    rebuild() { tone("sine", 300, 1500, 0.6, 0.25, 0, { attack: 0.08 }); [0.55, 0.65, 0.75].forEach((d, i) => tone("sine", 1500 + i * 300, 1500 + i * 300, 0.12, 0.12, d)); },
    boop()  { tone("sine", 700, 260, 0.16, 0.5); tone("sine", 1050, 1050, 0.08, 0.15, 0.12); },
    // scratching, changing buddy, Christmas, and each buddy's voice
    purr()  { tone("sawtooth", 62, 58, 0.42, 0.22, 0, { vib: [26, 9], lp: 420, attack: 0.08 }); },
    thump() { tone("sine", 130, 50, 0.1, 0.6); },
    poof()  { noise(0.35, 900, 0.5, 0.4, 0, 0.02); tone("sine", 500, 1400, 0.25, 0.2, 0.05); },
    jingle() { [0, 0.14, 0.28, 0.5].forEach((d, i) => { tone("sine", 2640 + (i % 2) * 330, 2600, 0.12, 0.16, d); tone("triangle", 3960, 3900, 0.08, 0.07, d); }); },
    woof()  { tone("sawtooth", 330, 150, 0.16, 0.5, 0, { lp: 1500 }); noise(0.1, 700, 1, 0.3); tone("sawtooth", 300, 140, 0.15, 0.45, 0.24, { lp: 1500 }); noise(0.1, 700, 1, 0.25, 0.24); },
    boo()   { tone("sine", 300, 620, 0.9, 0.3, 0, { vib: [6, 30], attack: 0.15 }); },
    hoho()  { [0, 0.26, 0.52].forEach((d, i) => tone("sawtooth", 150 - i * 14, 105 - i * 10, 0.2, 0.4, d, { lp: 800 })); },
    growl() { tone("sawtooth", 95, 60, 0.7, 0.45, 0, { vib: [30, 14], lp: 600, attack: 0.05 }); },
    squeak() { tone("sine", 900, 1700, 0.09, 0.3); tone("sine", 1700, 1100, 0.1, 0.25, 0.09); },
    cool()  { tone("sine", 1300, 480, 0.35, 0.25, 0, { attack: 0.02 }); tone("square", 660, 660, 0.06, 0.08, 0.38, { lp: 2500 }); },
  };

  function play(name) {
    if (!on || !ctx || ctx.state !== "running" || !SOUNDS[name]) return;
    try { SOUNDS[name](); api.lastAt = performance.now(); } catch (err) { /* ignore */ }
  }
  function setOn(v) { on = !!v; try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (err) { /* ignore */ } if (on) unlock(); }

  const api = { unlock, play, setOn, isOn: () => on, names: Object.keys(SOUNDS), lastAt: -1e9 };
  window.Sfx = api;
})();
