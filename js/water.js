/* Car Buddy water tank — the jellyfish's home. The screen is a tank of water whose surface sloshes
 * with the car: it piles up on the outside of a turn, surges on braking, and splashes on bumps.
 *
 *   const water = Water.create(canvas);
 *   water.setOn(true);
 *   water.frame(dt, nowMs, { side, fwd, ascii });   side: -1..1 (the way things get thrown), fwd: braking + / gas -
 *   water.kick(strength);                            a jolt: waves on the surface
 *   water.splash(x, strength);                       droplets flying up from the surface at screen x
 *   water.bubbles(x, y, n);                          bubbles rising from a point
 *   water.surfaceAt(x) → y                           screen y of the surface (for anything that floats)
 */
(function () {
  "use strict";
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const FONT = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';

  function create(canvas) {
    const ctx = canvas.getContext("2d");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let on = false, W = 0, H = 0, dpr = 1, unit = 16, owed = 0;
    // the surface: a tilt and a height offset on springs, plus ripples that die away
    let tilt = 0, vTilt = 0, lift = 0, vLift = 0, ripple = 0, phase = 0;
    let bubbles = [], drops = [], fish = null, nextFish = 0, weeds = [];
    const sprites = new Map();

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      unit = Math.max(13, Math.min(W, H) * 0.05);
      sprites.clear();
      weeds = [];
      for (let x = unit; x < W; x += rnd(unit * 3, unit * 7)) weeds.push({ x, h: Math.round(rnd(2, 5)), ph: rnd(0, TAU), col: pick(["#2E9E6B", "#3BBF7A", "#238A6A"]) });
    }
    function sprite(ch, color, size) {
      const key = ch + color + Math.round(size);
      let s = sprites.get(key);
      if (!s) {
        const px = Math.ceil(size * dpr * (ch.length > 1 ? 0.75 * ch.length + 0.6 : 1.5));
        s = document.createElement("canvas"); s.width = px; s.height = Math.ceil(size * dpr * 1.5);
        const c = s.getContext("2d");
        c.font = `800 ${Math.round(size * dpr)}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = color; c.fillText(ch, s.width / 2, s.height / 2);
        sprites.set(key, s);
      }
      return s;
    }
    function put(ch, color, size, x, y, alpha) {
      const s = sprite(ch, color, size);
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.drawImage(s, x * dpr - s.width / 2, y * dpr - s.height / 2);
    }

    const base = () => Math.max(unit * 1.1, H * 0.08);
    function surfaceAt(x) {
      const k = TAU / Math.max(260, W * 0.55);
      return base() - lift - Math.tan(tilt) * (x - W / 2)       // piles up on the side things are thrown toward
        + Math.sin(x * k + phase) * (2.5 + ripple * unit * 0.9) + Math.sin(x * k * 2.3 - phase * 1.6) * (1.2 + ripple * unit * 0.45);
    }

    function setOn(v) { on = !!v; canvas.style.display = on ? "block" : "none"; if (on) { resize(); bubbles = []; drops = []; fish = null; nextFish = performance.now() + 5000; } }
    function kick(a) { ripple = Math.min(1.6, ripple + a); }
    function splash(x, a) {
      if (!on || still) return;
      kick(a * 0.8);
      for (let i = 0; i < Math.round(6 + a * 10); i++) drops.push({ x: x + rnd(-unit * 2, unit * 2), y: surfaceAt(x), vx: rnd(-160, 160) * a, vy: -rnd(180, 460) * a, ch: pick(["o", ".", "'", "°"]) });
      if (drops.length > 60) drops.splice(0, drops.length - 60);
    }
    function addBubbles(x, y, n) {
      if (!on) return;
      for (let i = 0; i < (n || 1); i++) bubbles.push({ x: x + rnd(-unit, unit), y: y + rnd(-unit * 0.5, unit * 0.5), v: rnd(40, 95), ph: rnd(0, TAU), ch: pick(["o", "o", "°", "O", "."]), s: rnd(0.7, 1.2) });
      if (bubbles.length > 70) bubbles.splice(0, bubbles.length - 70);
    }

    function frame(dt, now, o) {
      if (!on) return;
      // surface physics every frame (cheap); drawing at ~30 fps
      const side = still ? 0 : Math.max(-1.25, Math.min(1.25, o.side || 0)), fwd = still ? 0 : Math.max(-1.2, Math.min(1.2, o.fwd || 0));
      const tTilt = side * 0.27, tLift = fwd * unit * 1.1;                // radians; px (braking → surges up)
      const before = vTilt;
      vTilt += (26 * (tTilt - tilt) - 2.6 * vTilt) * dt; tilt += vTilt * dt;      // loose spring → it overshoots and rocks back
      vLift += (30 * (tLift - lift) - 3.2 * vLift) * dt; lift += vLift * dt;
      ripple = Math.min(1.6, ripple + Math.abs(vTilt - before) * 0.6 + Math.abs(vTilt) * dt * 0.8);
      ripple *= Math.exp(-dt / 1.1);
      phase += dt * (1.3 + ripple * 5);
      owed += dt;
      if (owed < 0.03) return;
      dt = Math.min(owed, 0.066); owed = 0;

      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      // the water itself
      const step = Math.max(10, W / 60), pts = [];
      for (let x = -step; x <= W + step; x += step) pts.push([x, surfaceAt(x)]);
      ctx.beginPath(); ctx.moveTo(pts[0][0] * dpr, pts[0][1] * dpr);
      for (const [x, y] of pts) ctx.lineTo(x * dpr, y * dpr);
      ctx.lineTo((W + step) * dpr, H * dpr); ctx.lineTo(-step * dpr, H * dpr); ctx.closePath();
      const g = ctx.createLinearGradient(0, base() * dpr, 0, H * dpr);
      g.addColorStop(0, "#0E4C78"); g.addColorStop(0.45, "#0A2F58"); g.addColorStop(1, "#051733");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fill();

      if (o.ascii) {                                         // the surface as a row of wave characters
        for (let x = unit * 0.3; x < W; x += unit * 0.62) {
          const y = surfaceAt(x), slope = surfaceAt(x + 6) - y;
          put(slope > 1.2 ? "\\" : slope < -1.2 ? "/" : ((x / unit + phase * 2) | 0) % 3 ? "~" : "≈", ((x / unit) | 0) % 4 ? "#7FD8FF" : "#C9F1FF", unit, x, y, 0.95);
        }
      } else {                                               // or a soft bright line
        ctx.beginPath(); ctx.moveTo(pts[0][0] * dpr, pts[0][1] * dpr);
        for (const [x, y] of pts) ctx.lineTo(x * dpr, y * dpr);
        ctx.strokeStyle = "#9BE4FF"; ctx.lineWidth = 3 * dpr; ctx.lineJoin = "round"; ctx.globalAlpha = 0.9; ctx.stroke();
        ctx.beginPath();
        for (const [x, y] of pts) ctx.lineTo(x * dpr, (y + 7) * dpr);
        ctx.strokeStyle = "#3FA9E0"; ctx.lineWidth = 2 * dpr; ctx.globalAlpha = 0.5; ctx.stroke();
      }

      // seaweed along the bottom, leaning with the slosh
      for (const w of weeds) for (let i = 0; i < w.h; i++) {
        const lean = (tilt * 60 + (still ? 0 : Math.sin(now / 900 + w.ph + i * 0.5) * 3)) * (i / w.h) * (i + 1) * 0.35;
        put(i % 2 ? "(" : ")", w.col, unit * 1.1, w.x + lean, H - unit * (0.5 + i * 0.85), 0.75);
      }

      // a little fish wanders past now and then
      if (!fish && now > nextFish && !still) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        fish = { x: dir > 0 ? -unit * 2 : W + unit * 2, y: rnd(base() + unit * 3, H - unit * 3), dir, v: rnd(45, 90), col: pick(["#FFB347", "#FF7AD9", "#9BE7A8", "#FFE066"]), ph: rnd(0, TAU) };
      }
      if (fish) {
        fish.x += fish.dir * fish.v * dt + tilt * 140 * dt;                // carried along a little by the slosh
        put(fish.dir > 0 ? "><>" : "<><", fish.col, unit * 1.15, fish.x, fish.y + Math.sin(now / 500 + fish.ph) * unit * 0.4, 0.9);
        if (fish.x < -unit * 3 || fish.x > W + unit * 3) { fish = null; nextFish = now + rnd(7000, 20000); }
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y -= b.v * dt; b.x += (Math.sin(now / 350 + b.ph) * 14 + tilt * 120) * dt;
        if (b.y < surfaceAt(b.x) + unit * 0.3) { bubbles.splice(i, 1); ripple = Math.min(1.6, ripple + 0.01); continue; }
        put(b.ch, "#BDEBFF", unit * b.s, b.x, b.y, 0.8);
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.vy += 1300 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.vy > 0 && d.y > surfaceAt(d.x)) { drops.splice(i, 1); continue; }
        put(d.ch, "#C9F1FF", unit, d.x, d.y, 0.95);
      }
      ctx.globalAlpha = 1;
    }

    addEventListener("resize", () => { if (on) resize(); });
    canvas.style.display = "none";
    return { setOn, frame, kick, splash, bubbles: addBubbles, surfaceAt, isOn: () => on, get tilt() { return tilt; } };
  }

  window.Water = { create };
})();
