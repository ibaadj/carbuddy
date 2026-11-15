/* Car Buddy sky layer — weather, Christmas lights, and little floating symbols (music notes, hearts),
 * all drawn as text characters on one full-screen canvas so they match the ASCII look.
 *
 *   const sky = Sky.create(canvas);
 *   sky.setWeather("sunny" | "night" | "windy" | "rainy" | "stormy" | "snowy" | null);
 *   sky.setFestive(true);                      // string of twinkling lights along the top
 *   sky.emit("♪", x, y, { color, vx, vy, life, size, sway });   // screen px
 *   sky.frame(dt, nowMs);                      // every animation frame
 *   sky.wind                                   // -1..1, current gust (for ears / lean)
 */
(function () {
  "use strict";
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), pick = (a) => a[Math.floor(Math.random() * a.length)];
  const FONT = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';

  function create(canvas) {
    const ctx = canvas.getContext("2d");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, unit = 16;
    let weather = null, festive = false, parts = [], extras = [], dirty = false, flash = 0, nextFlash = 0, stars = [];
    const sprites = new Map();
    const api = { wind: 0, setWeather, setFestive, emit, frame, resize, get weather() { return weather; } };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);     // soft is fine for moving specks, and much cheaper
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      unit = Math.max(13, Math.min(W, H) * 0.05);
      sprites.clear();
      seed();
    }

    // one little pre-drawn image per character + colour + size
    function sprite(ch, color, size) {
      const key = ch + color + Math.round(size);
      let s = sprites.get(key);
      if (!s) {
        const px = Math.ceil(size * dpr * 1.5);
        s = document.createElement("canvas"); s.width = s.height = px;
        const c = s.getContext("2d");
        c.font = `800 ${Math.round(size * dpr)}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillStyle = color; c.fillText(ch, px / 2, px / 2);
        sprites.set(key, s);
      }
      return s;
    }
    function put(ch, color, size, x, y, alpha, rot) {
      const s = sprite(ch, color, size), w = s.width;
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      if (rot) { ctx.setTransform(Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), x * dpr, y * dpr); ctx.drawImage(s, -w / 2, -w / 2); ctx.setTransform(1, 0, 0, 1, 0, 0); }
      else ctx.drawImage(s, x * dpr - w / 2, y * dpr - w / 2);
    }

    function spawn(p, anywhere) {
      if (weather === "rainy" || weather === "stormy") {
        Object.assign(p, { ch: pick(["|", "|", "/", "'"]), color: pick(["#7FB8FF", "#5C9BEA", "#A9D2FF"]), size: unit,
          x: rnd(-0.1, 1.15) * W, y: anywhere ? rnd(0, H) : -unit, vx: -rnd(90, 150), vy: rnd(650, 950), a: rnd(0.45, 0.9) });
      } else if (weather === "snowy") {
        Object.assign(p, { ch: pick(["*", "*", "+", "."]), color: "#FFFFFF", size: unit * rnd(0.7, 1.15),
          x: rnd(0, W), y: anywhere ? rnd(0, H) : -unit, vx: rnd(-12, 12), vy: rnd(35, 85), a: rnd(0.55, 1), ph: rnd(0, TAU), sw: rnd(10, 30) });
      } else if (weather === "windy") {
        const leafy = Math.random() < 0.22;
        Object.assign(p, { ch: leafy ? pick(["&", "%", "@"]) : pick(["~", "~", "-", "="]), color: leafy ? pick(["#E0913E", "#C96A2A", "#8FBF4A"]) : pick(["#9FB4C8", "#C8D6E4", "#7D93A8"]),
          size: unit * (leafy ? 1 : rnd(0.8, 1.2)), x: anywhere ? rnd(0, W) : -unit, y: rnd(0, H), vx: rnd(450, 900), vy: rnd(-30, 40), a: rnd(0.35, 0.8),
          ph: rnd(0, TAU), sw: leafy ? 60 : 10, spin: leafy ? rnd(-6, 6) : 0, rot: 0 });
      }
    }
    function seed() {
      parts = []; stars = [];
      const area = W * H;
      const n = weather === "rainy" || weather === "stormy" ? area / 4200 : weather === "snowy" ? area / 5200 : weather === "windy" ? area / 9000 : 0;
      for (let i = 0; i < Math.min(160, Math.round(n)); i++) { const p = {}; spawn(p, true); parts.push(p); }
      if (weather === "night") for (let i = 0; i < 26; i++) stars.push({ x: rnd(0, W), y: rnd(0, H * 0.75), ch: pick([".", "+", "*", "."]), ph: rnd(0, TAU), sp: rnd(0.6, 2.2) });
      dirty = true;
    }
    function setWeather(kind) { if (kind === weather) return; weather = kind || null; api.wind = 0; seed(); }
    function setFestive(on) { festive = !!on; dirty = true; }

    function emit(ch, x, y, o) {
      o = o || {};
      if (extras.length > 40) extras.shift();
      extras.push({ ch, x, y, color: o.color || "#FFFFFF", size: o.size || unit * 1.4, vx: o.vx == null ? rnd(-30, 30) : o.vx, vy: o.vy == null ? -rnd(70, 120) : o.vy,
        life: o.life || 1.4, age: 0, ph: rnd(0, TAU), sway: o.sway == null ? 24 : o.sway });
    }

    function sun(now) {
      const cx = W * 0.085, cy = H * 0.17, r = unit * 2.1, a0 = still ? 0 : now / 4000;
      put("O", "#FFD23F", unit * 2.6, cx, cy, 1); put("@", "#FFB300", unit * 1.5, cx, cy, 1);
      for (let i = 0; i < 12; i++) {
        const a = a0 + (i / 12) * TAU, long = i % 2 === 0, rr = r * (long ? 1.25 : 1.0) + (still ? 0 : Math.sin(now / 500 + i) * unit * 0.12);
        put(long ? "|" : "'", long ? "#FFD23F" : "#FFE89A", unit * (long ? 1.2 : 1), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.95, a + Math.PI / 2);
      }
    }
    function moon(now) {
      put(")", "#F4EDC4", unit * 3, W * 0.08, H * 0.17, 0.95, -0.35);
      for (const s of stars) put(s.ch, "#FFFFFF", unit * 0.9, s.x, s.y, still ? 0.7 : 0.35 + 0.6 * Math.abs(Math.sin(now / 1000 * s.sp + s.ph)));
    }
    const BULBS = ["#FF4B4B", "#FFD23F", "#4BE36A", "#4BA3FF", "#FF7AD9"];
    function lights(now) {
      const gap = Math.max(34, unit * 2.4), n = Math.ceil(W / gap) + 1, beat = still ? 0 : Math.floor(now / 600);
      for (let i = 0; i < n; i++) {
        const x = i * gap + gap * 0.3, sag = Math.sin((i % 4) / 4 * Math.PI) * unit * 0.7, on = still || (i + beat) % 3 !== 0;
        put("~", "#3E5A3E", unit * 0.9, x - gap / 2, unit * 0.45 + sag * 0.6, 0.9);
        put("o", BULBS[i % BULBS.length], unit * 1.25, x, unit * 0.95 + sag, on ? 1 : 0.3);
      }
    }

    let owed = 0;
    function frame(dt, now) {
      const busy = weather || festive || extras.length;
      if (!busy && !dirty) return;
      owed += dt;                                            // draw at ~30 fps: plenty for weather, half the work
      if (owed < 0.03 && !dirty) return;
      dt = Math.min(owed, 0.066); owed = 0;
      if (still) dt = Math.min(dt, 0);                       // reduced motion: a still picture of the weather
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      if (!busy) return;

      if (weather === "windy") api.wind = still ? 0.5 : 0.55 + 0.45 * Math.sin(now / 1700) * Math.sin(now / 530);
      if (weather === "sunny") sun(now);
      if (weather === "night") moon(now);
      if (weather === "stormy" && !still) {
        if (now > nextFlash) { flash = 1; nextFlash = now + rnd(5000, 14000); }
        if (flash > 0.02) { ctx.globalAlpha = flash * 0.3; ctx.fillStyle = "#DCE8FF"; ctx.fillRect(0, 0, canvas.width, canvas.height); flash *= Math.exp(-dt / 0.09); }
      }
      for (const p of parts) {
        const gust = weather === "windy" ? 0.5 + api.wind : 1;
        p.x += p.vx * gust * dt; p.y += p.vy * dt;
        if (p.spin) p.rot += p.spin * dt;
        const dx = p.sw ? Math.sin(now / 900 + p.ph) * p.sw : 0, dy = weather === "windy" && p.sw ? Math.cos(now / 400 + p.ph) * p.sw * 0.5 : 0;
        if (p.y > H + unit || p.x > W + unit * 2 || p.x < -unit * 3) {
          if ((weather === "rainy" || weather === "stormy") && p.y > H && Math.random() < 0.5) emit(pick([".", ","]), p.x, H - unit * 0.4, { color: p.color, vy: -rnd(60, 140), vx: rnd(-60, 60), life: 0.3, size: unit, sway: 0 });
          spawn(p, false);
        }
        put(p.ch, p.color, p.size, p.x + dx, p.y + dy, p.a, p.rot || 0);
      }
      if (weather === "snowy") for (let x = unit * 0.4; x < W; x += unit * 1.1) put(((x * 7) | 0) % 3 ? "*" : ".", "#FFFFFF", unit, x, H - unit * 0.35, 0.8);   // a little drift along the bottom
      if (festive) lights(now);
      for (let i = extras.length - 1; i >= 0; i--) {
        const e = extras[i];
        e.age += still ? 0.016 : dt;
        if (e.age >= e.life) { extras.splice(i, 1); dirty = true; continue; }
        e.x += e.vx * dt; e.y += e.vy * dt;
        const k = e.age / e.life;
        put(e.ch, e.color, e.size, e.x + Math.sin(e.age * 5 + e.ph) * e.sway * k, e.y, k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4));
      }
      ctx.globalAlpha = 1;
    }

    addEventListener("resize", resize);
    resize();
    return api;
  }

  window.Sky = { create };
})();
