/* Car Buddy — Fish Tank
 * A procedurally generated aquarium that reacts to your driving.
 *
 *   Smooth driving fills the calm meter; each full meter brings a new creature (some are shiny).
 *   A long smooth streak throws a dance party (heart, conga line, spin).
 *   Gentle turns: everyone slides with the water and yells "wheee". Lots of turns: dizzy eyes.
 *   Bumps: everyone goes boing. Harsh driving: everyone panics and hides — puffers puff up,
 *   the octopus inks, crabs dig into the sand, snails pull in. Nobody is ever lost.
 *   Visitors swim past now and then (turtle, whale, submarine).
 *   Tap a creature to say hi, tap the water to feed, tap the duck or the treasure chest.
 *
 * Drawn at the screen's real resolution (like the main buddy). Positions live in a "world"
 * 180 units tall; the canvas transform scales that to device pixels.
 *
 *   const tank = Tank.create(canvas, { onToast, onHud });
 *   tank.drive(motionState)  tank.setMoving(bool)  tank.tap(clientX, clientY)
 *   tank.addCalm(sec)  tank.party()  tank.visitor()  tank.reset()  tank.cycleBiome()  tank.reroll()
 */
(function () {
  "use strict";

  const VH = 180;                  // world height; width follows the screen shape
  const SURF = 18;                 // resting water line
  const CALM_GOAL = 240;           // seconds of smooth driving per new creature
  const PARTY_FIRST = 180, PARTY_EVERY = 300;   // smooth-streak dance parties
  const MAX_CREATURES = 28;
  const SAVE_KEY = "carbuddy.tank.v1";
  const HARD = { brake: -2.6, accel: 2.8, lat: 3.3, jerk: 7 };   // m/s², m/s³
  const WHEEE_LAT = 1.4;
  const RM = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const TAU = Math.PI * 2;
  const SIZE = 1.35;               // creatures are drawn this much bigger than their "genes" length

  // ---------------------------------------------------------------- helpers
  function rng(seed) {             // mulberry32: small, fast, repeatable
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pick = (r, list) => list[(r() * list.length) | 0];
  const rand = Math.random;
  function hexToRgb(hex) { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function shade(hex, k) {         // k < 0 darker, k > 0 lighter
    const f = (c) => clamp(Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k), 0, 255);
    return "#" + hexToRgb(hex).map((c) => f(c).toString(16).padStart(2, "0")).join("");
  }
  function rgba(hex, a) { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  const sfx = (n) => { try { if (window.Sfx) Sfx.play(n); } catch (err) { /* ignore */ } };

  // ---------------------------------------------------------------- biomes & creatures
  const BIOMES = {
    reef: { name: "Coral reef", top: "#3cc0ee", bot: "#0a4685", sand: ["#f0dca6", "#d9bf84"], rock: "#8a77a3",
            plants: ["#ff6f91", "#ffa45c", "#ffd96a", "#c879ff", "#ff8fb8"], kind: "coral" },
    kelp: { name: "Kelp forest", top: "#55bba6", bot: "#0b3940", sand: ["#c8b788", "#a6966b"], rock: "#74847d",
            plants: ["#6aa84f", "#8bc34a", "#4e8a32", "#a3c95a"], kind: "kelp" },
    deep: { name: "Deep sea", top: "#0f2550", bot: "#020610", sand: ["#343b58", "#22273d"], rock: "#414c70",
            plants: ["#3ff7d2", "#9b6bff", "#ff5fd2", "#5fd0ff"], kind: "glow", glow: true },
    ice:  { name: "Arctic", top: "#aee0f5", bot: "#2a6795", sand: ["#f4f9fd", "#cfe2ee"], rock: "#a8c2d6",
            plants: ["#c4f3ff", "#86d8f7", "#e0fbff"], kind: "ice" },
  };
  const BIOME_ORDER = ["auto", "reef", "kelp", "deep", "ice"];

  const PALETTES = [   // body, accent, belly
    ["#ff8a3d", "#ffffff", "#ffd2a8"], ["#ffd23f", "#2b59c3", "#fff4c2"], ["#4dd4ff", "#ffe14d", "#c9f3ff"],
    ["#ff4f6d", "#ffd0d8", "#ffc2cc"], ["#8a5cff", "#ffe066", "#d8c9ff"], ["#3ee08f", "#0f5e3a", "#c6f7dd"],
    ["#ff6ec7", "#6ef0ff", "#ffd1ef"], ["#f4f4f4", "#ff5a36", "#ffffff"], ["#ffb347", "#3a2a1a", "#ffe2b8"],
    ["#5a8dff", "#ff8fa3", "#cfe0ff"], ["#e8ff5a", "#2d8a4e", "#f7ffd0"], ["#ff3b3b", "#1a1a1a", "#ffb0b0"],
  ];
  const SYL = ["pip", "bo", "lu", "mo", "zi", "ka", "bu", "ni", "to", "fi", "ro", "su", "wi", "pe", "ba", "ko", "gu", "mi", "da", "jo", "wob", "fin"];
  const KINDS = {
    fish:     { label: "fish", rarity: "Common" },
    puffer:   { label: "pufferfish", rarity: "Common" },
    snail:    { label: "snail", rarity: "Common" },
    crab:     { label: "crab", rarity: "Uncommon" },
    shrimp:   { label: "shrimp", rarity: "Uncommon" },
    seahorse: { label: "seahorse", rarity: "Rare" },
    jelly:    { label: "jellyfish", rarity: "Rare" },
    octopus:  { label: "octopus", rarity: "Legendary" },
  };
  const SWIM = { fish: 1, puffer: 1, seahorse: 1, jelly: 1 };
  const WALK = { crab: 1, shrimp: 1, octopus: 1 };
  const HI = ["Hi!", "Blub!", "Hey!", "Hello!", "Oh hi!", "Bloop!"];

  function makeName() {
    const s = pick(rand, SYL) + (rand() < 0.75 ? pick(rand, SYL) : "");
    return s[0].toUpperCase() + s.slice(1);
  }
  function makeGenes(kind) {
    const r = rand;
    const len = { fish: 10 + r() * 10, puffer: 9 + r() * 3, seahorse: 12, octopus: 14, jelly: 12, crab: 10, shrimp: 9, snail: 8 }[kind];
    return { len, h: 0.42 + r() * 0.3, tail: (r() * 3) | 0, fin: r() < 0.7, pattern: (r() * 5) | 0,
             pal: (r() * PALETTES.length) | 0, speed: 0.75 + r() * 0.6, school: r() < 0.7, brave: r() };
  }
  function newCreature(kind) {
    return { kind, genes: makeGenes(kind), name: makeName(), born: Date.now(), shiny: rand() < 0.08 };
  }
  function pickNewKind(earned) {
    const w = [["fish", 50]];
    if (earned >= 1) w.push(["puffer", 12]);
    if (earned >= 2) w.push(["snail", 9], ["crab", 9]);
    if (earned >= 3) w.push(["shrimp", 7]);
    if (earned >= 4) w.push(["seahorse", 6]);
    if (earned >= 5) w.push(["jelly", 6]);
    if (earned >= 7) w.push(["octopus", 4]);
    let t = rand() * w.reduce((s, x) => s + x[1], 0);
    for (const [k, n] of w) { if ((t -= n) < 0) return k; }
    return "fish";
  }

  // ---------------------------------------------------------------- the tank
  function create(canvas, opts) {
    const onToast = opts.onToast || function () {};
    const onHud = opts.onHud || function () {};
    const g = canvas.getContext("2d");
    let W = 320, S = 1;               // world width, world→pixel scale

    let save = load();
    let biomeId = "reef", B = BIOMES.reef;
    let scene = null, bgCanvas = null, fgCanvas = null;
    let agents = [];
    let fx = { bubbles: [], puffs: [], food: [], ink: [], stars: [], drops: [], coins: [] };
    let says = [];                    // speech bubbles
    let visitors = [];
    let party = null;
    let stress = 0, inHarsh = false, moving = false, lastFwd = 0, jerk = 0, dizzy = 0;
    let drv = { fwd: 0, lat: 0, yaw: 0, event: "cruising", ready: false, activity: 0 };
    let slosh = 0, sloshV = 0, wave = 0, shake = 0, t = 0;
    let streak = 0, nextParty = PARTY_FIRST, stillFor = 0, nextVisitor = 100 + rand() * 120;
    let lastSaved = 0, lastHarshMsg = 0, lastWheee = 0, lastDizzyMsg = 0, inWheee = false, bumped = false;
    let lastFrame = 0;

    function load() {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (s && Array.isArray(s.creatures)) return s;
      } catch (err) { /* fresh tank */ }
      return fresh();
    }
    function fresh() {
      return { seed: (Math.random() * 1e9) | 0, biome: "auto", calm: 0, earned: 0,
               creatures: [newCreature("fish"), newCreature("fish"), newCreature("fish"), newCreature("fish")] };
    }
    function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* ignore */ } }

    function autoBiome() {
      const d = new Date(), h = d.getHours(), m = d.getMonth();
      if (h >= 21 || h < 6) return "deep";
      const r = rng(save.seed + d.getFullYear() * 400 + m * 31 + d.getDate());   // changes daily
      return pick(r, m === 11 || m <= 1 ? ["reef", "kelp", "ice"] : ["reef", "kelp"]);
    }

    // -------------------------------------------------------- scene generation
    function floorAt(x) { const f = scene.floor; return f[clamp(Math.round(x * 2), 0, f.length - 1)]; }

    function build() {
      biomeId = save.biome === "auto" ? autoBiome() : save.biome;
      B = BIOMES[biomeId];
      const r = rng(save.seed * 7 + biomeId.length * 1013);
      const n = Math.ceil(W * 2) + 1;                        // floor height every half unit
      const floor = new Float32Array(n);
      const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
      for (let i = 0; i < n; i++) {
        const x = i / 2;
        floor[i] = VH - 20 + Math.sin(x / 37 + p1) * 3 + Math.sin(x / 13 + p2) * 1.2 + Math.sin(x / 71 + p3) * 4;
      }
      scene = { floor, rocks: [], back: [], front: [], props: [], chest: null, bubblers: [] };

      // Rocks: big enough to hide behind
      const nRocks = W > 360 ? 3 : 2;
      for (let i = 0; i < nRocks; i++) {
        const cx = W * (i + 0.5) / nRocks + (r() - 0.5) * W * 0.1;
        const rx = 30 + r() * 11, ry = 27 + r() * 8;
        const base = Math.min(floorAt(cx), VH - 14);
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const a = Math.PI + (k / 12) * Math.PI, j = 0.85 + r() * 0.25;
          pts.push([cx + Math.cos(a) * rx * j, base + 5 + Math.sin(a) * ry * j]);
        }
        scene.rocks.push({ x: cx, y: base - ry * 0.4, rx, ry, base, pts });
      }
      const clear = (x, pad) => scene.rocks.every((k) => Math.abs(k.x - x) > k.rx + pad) && scene.props.every((p) => Math.abs(p.x - x) > 22);
      const spot = (pad) => { for (let i = 0; i < 40; i++) { const x = 16 + r() * (W - 32); if (clear(x, pad)) return x; } return 16 + r() * (W - 32); };

      // Props: a treasure chest always, plus one surprise
      const cx = spot(10);
      scene.chest = { x: cx, open: 0, next: 12 + r() * 20, opening: 0 };
      scene.props.push({ type: "chest", x: cx });
      const extra = pick(r, ["car", "helmet", "castle", "anchor"]);
      const ex = spot(12);
      scene.props.push({ type: extra, x: ex });
      scene.bubblers.push(extra === "helmet" ? { x: ex, y: floorAt(ex) - 13 } : { x: spot(4), y: 0 });
      if (scene.bubblers[0].y === 0) scene.bubblers[0].y = floorAt(scene.bubblers[0].x) - 1;
      scene.duck = { x: W * (0.2 + r() * 0.6), vx: 0, spin: 0 };

      // Plants
      const nPlants = Math.round(W / 24);
      for (let i = 0; i < nPlants; i++) {
        const p = { x: 6 + r() * (W - 12), color: pick(r, B.plants), phase: r() * 6, seed: (r() * 1e9) | 0 };
        p.h = B.kind === "kelp" ? 60 + r() * 90 : B.kind === "glow" ? 10 + r() * 16 : B.kind === "coral" ? 14 + r() * 22 : 10 + r() * 24;
        (r() < 0.75 ? scene.back : scene.front).push(p);
      }
      for (let i = 0; i < Math.round(W / 50); i++) {
        scene.front.push({ x: r() * W, color: shade(pick(r, B.plants), -0.15), h: 6 + r() * 8, phase: r() * 6, tuft: true, seed: 0 });
      }

      // Caustic light blobs near the surface
      scene.caustics = [];
      for (let i = 0; i < 14; i++) scene.caustics.push({ x: r() * W, y: SURF + 4 + r() * 50, r: 6 + r() * 14, p: r() * 6, s: 0.3 + r() * 0.5 });

      bgCanvas = paintBackground(r);
      fgCanvas = paintForeground(r);
      spawnAgents();
    }

    function layer() {
      const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
      const x = c.getContext("2d"); x.setTransform(S, 0, 0, S, 0, 0);
      return [c, x];
    }

    function floorPath(x, depth) {
      x.beginPath(); x.moveTo(0, VH + 2);
      for (let i = 0; i <= W; i += 2) x.lineTo(i, floorAt(i) + depth);
      x.lineTo(W, VH + 2); x.closePath();
    }

    function paintBackground(r) {
      const [c, x] = layer();
      const grd = x.createLinearGradient(0, 0, 0, VH);
      grd.addColorStop(0, B.top); grd.addColorStop(1, B.bot);
      x.fillStyle = grd; x.fillRect(0, 0, W, VH);
      // far hills for depth
      x.fillStyle = rgba(B.bot, 0.5);
      x.beginPath(); x.moveTo(0, VH);
      for (let i = 0; i <= W; i += 3) x.lineTo(i, VH - 44 - Math.sin(i / 23 + 1) * 9 - Math.sin(i / 9) * 2.5);
      x.lineTo(W, VH); x.fill();
      for (const p of scene.back) {
        if (B.kind === "coral") drawCoral(x, p, rng(p.seed));
        if (B.kind === "ice") drawCrystal(x, p, rng(p.seed));
      }
      // sand: soft gradient, ripples, specks, pebbles, shells
      floorPath(x, 0);
      const sg = x.createLinearGradient(0, VH - 30, 0, VH);
      sg.addColorStop(0, shade(B.sand[0], 0.1)); sg.addColorStop(1, B.sand[1]);
      x.fillStyle = sg; x.fill();
      x.strokeStyle = shade(B.sand[0], 0.35); x.lineWidth = 0.7;
      x.beginPath(); for (let i = 0; i <= W; i += 2) { const y = floorAt(i); i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke();
      x.strokeStyle = rgba(shade(B.sand[1], -0.25), 0.35); x.lineWidth = 0.4;
      for (let k = 0; k < W / 10; k++) {
        const sx = r() * W, sy = floorAt(sx) + 4 + r() * 12, w = 4 + r() * 8;
        x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + w / 2, sy - 1, sx + w, sy); x.stroke();
      }
      for (let k = 0; k < W * 3; k++) {
        const sx = r() * W, sy = floorAt(sx) + 1 + r() * 20;
        x.fillStyle = r() < 0.5 ? rgba(shade(B.sand[1], -0.3), 0.5) : rgba("#ffffff", 0.45);
        x.beginPath(); x.arc(sx, sy, 0.18 + r() * 0.25, 0, TAU); x.fill();
      }
      for (let k = 0; k < W / 14; k++) {
        const sx = r() * W, sy = floorAt(sx) + 3 + r() * 12;
        if (r() < 0.3) {                                      // little shell
          x.fillStyle = pick(r, ["#ffd6e0", "#fff1d6", "#ffe0c2"]);
          x.beginPath(); x.arc(sx, sy, 1.4, Math.PI, 0); x.fill();
          x.strokeStyle = "#d9a98f"; x.lineWidth = 0.25;
          for (let a = -2; a <= 2; a++) { x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + a * 0.6, sy - 1.3); x.stroke(); }
        } else {
          x.fillStyle = pick(r, [shade(B.rock, -0.1), shade(B.rock, 0.15), shade(B.sand[1], -0.2)]);
          x.beginPath(); x.ellipse(sx, sy, 0.8 + r(), 0.5 + r() * 0.5, 0, 0, TAU); x.fill();
        }
      }
      return c;
    }

    function drawCoral(x, p, r) {
      x.strokeStyle = p.color; x.lineCap = "round";
      const branch = (bx, by, ang, len, w, d) => {
        const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        x.lineWidth = w; x.beginPath(); x.moveTo(bx, by);
        x.quadraticCurveTo(bx + Math.cos(ang + 0.3) * len * 0.5, by + Math.sin(ang + 0.3) * len * 0.5, ex, ey); x.stroke();
        if (d > 0) {
          branch(ex, ey, ang - 0.3 - r() * 0.4, len * 0.72, Math.max(0.8, w * 0.72), d - 1);
          branch(ex, ey, ang + 0.3 + r() * 0.4, len * 0.72, Math.max(0.8, w * 0.72), d - 1);
        } else { x.fillStyle = shade(p.color, 0.4); x.beginPath(); x.arc(ex, ey, w * 0.7, 0, TAU); x.fill(); }
      };
      const base = floorAt(p.x) + 2;
      if (r() < 0.55) branch(p.x, base, -Math.PI / 2, p.h * 0.4, 3, 3);
      else {                                                  // brain coral
        const rx = p.h * 0.45, ry = p.h * 0.28;
        const gr = x.createRadialGradient(p.x - rx * 0.3, base - ry, 1, p.x, base - 2, rx);
        gr.addColorStop(0, shade(p.color, 0.3)); gr.addColorStop(1, shade(p.color, -0.15));
        x.fillStyle = gr; x.beginPath(); x.ellipse(p.x, base - 1, rx, ry, 0, Math.PI, 0); x.fill();
        x.strokeStyle = shade(p.color, -0.25); x.lineWidth = 0.5;
        for (let k = 1; k < 4; k++) {
          x.beginPath();
          for (let a = 0; a <= 20; a++) {
            const ang = Math.PI + (a / 20) * Math.PI, w = Math.sin(a * 1.7 + k) * 0.6;
            const px = p.x + Math.cos(ang) * (rx * k / 4 + w), py = base - 1 + Math.sin(ang) * (ry * k / 4 + w);
            a ? x.lineTo(px, py) : x.moveTo(px, py);
          }
          x.stroke();
        }
      }
    }
    function drawCrystal(x, p, r) {
      const base = floorAt(p.x) + 2;
      for (let k = 0; k < 3; k++) {
        const w = 2 + r() * 3, hh = p.h * (0.5 + r() * 0.5), ox = (r() - 0.5) * 8, lean = (r() - 0.5) * 6;
        const gr = x.createLinearGradient(p.x + ox - w, 0, p.x + ox + w, 0);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.5, p.color); gr.addColorStop(1, shade(p.color, -0.2));
        x.fillStyle = gr;
        x.beginPath(); x.moveTo(p.x + ox - w, base); x.lineTo(p.x + ox + lean, base - hh); x.lineTo(p.x + ox + w, base); x.fill();
      }
    }

    function paintForeground(r) {
      const [c, x] = layer();
      for (const k of scene.rocks) {
        x.save();
        x.beginPath(); x.moveTo(k.pts[0][0], k.base + 8);
        x.lineTo(k.pts[0][0], k.pts[0][1]);
        for (let i = 1; i < k.pts.length; i++) {
          const a = k.pts[i - 1], b = k.pts[i];
          x.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        }
        const last = k.pts[k.pts.length - 1];
        x.lineTo(last[0], last[1]); x.lineTo(last[0], k.base + 8); x.closePath();
        const gr = x.createLinearGradient(k.x - k.rx, k.base - k.ry, k.x + k.rx * 0.6, k.base + 4);
        gr.addColorStop(0, shade(B.rock, 0.3)); gr.addColorStop(0.55, B.rock); gr.addColorStop(1, shade(B.rock, -0.4));
        x.fillStyle = gr; x.fill();
        x.clip();
        for (let i = 0; i < 40; i++) {                        // texture
          x.fillStyle = r() < 0.5 ? rgba(shade(B.rock, -0.35), 0.35) : rgba(shade(B.rock, 0.3), 0.35);
          x.beginPath(); x.ellipse(k.x - k.rx + r() * k.rx * 2, k.base - k.ry + r() * k.ry * 1.3, 0.5 + r() * 2, 0.4 + r() * 1.2, r() * 3, 0, TAU); x.fill();
        }
        // a crack and a cave mouth for flavour
        x.strokeStyle = rgba(shade(B.rock, -0.5), 0.6); x.lineWidth = 0.5;
        x.beginPath(); x.moveTo(k.x - k.rx * 0.2, k.base - k.ry * 0.7); x.lineTo(k.x, k.base - k.ry * 0.4); x.lineTo(k.x - k.rx * 0.1, k.base - k.ry * 0.15); x.stroke();
        x.fillStyle = rgba(shade(B.rock, -0.7), 0.8);
        x.beginPath(); x.ellipse(k.x + k.rx * 0.35, k.base + 2, k.rx * 0.22, k.ry * 0.22, 0, Math.PI, 0); x.fill();
        if (B.kind === "ice") { x.fillStyle = "#ffffffdd"; x.beginPath(); x.ellipse(k.x - k.rx * 0.15, k.base + 5 - k.ry * 0.92, k.rx * 0.65, 2.2, 0, 0, TAU); x.fill(); }
        else {
          x.fillStyle = B.kind === "glow" ? "rgba(63,247,210,0.45)" : "rgba(110,190,80,0.55)";
          for (let i = 0; i < 26; i++) {
            const a = Math.PI + 0.35 + r() * (Math.PI - 0.7);
            x.beginPath(); x.ellipse(k.x + Math.cos(a) * k.rx * 0.82, k.base + 5 + Math.sin(a) * k.ry * 0.85, 1.4, 0.6, a, 0, TAU); x.fill();
          }
        }
        x.restore();
      }
      for (const p of scene.props) if (p.type !== "chest") drawProp(x, p);
      return c;
    }

    function drawProp(x, p) {
      const base = floorAt(p.x) + 3;
      x.save(); x.translate(p.x, base);
      if (p.type === "car") {                                 // a little sunken car — a cousin of yours
        x.rotate(-0.08);
        x.fillStyle = "#d9423a";
        x.beginPath(); x.moveTo(-12, -2); x.lineTo(-12, -6); x.quadraticCurveTo(-10, -7, -7, -7); x.lineTo(-4, -11); x.lineTo(5, -11);
        x.lineTo(9, -7); x.quadraticCurveTo(12, -7, 12, -5); x.lineTo(12, -2); x.closePath(); x.fill();
        x.fillStyle = "#9fd8f0"; x.beginPath(); x.moveTo(-3, -10); x.lineTo(0.5, -10); x.lineTo(0.5, -7); x.lineTo(-5.5, -7); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(1.5, -10); x.lineTo(4.5, -10); x.lineTo(7.5, -7); x.lineTo(1.5, -7); x.closePath(); x.fill();
        x.fillStyle = "#ffe98a"; x.beginPath(); x.arc(11, -5, 0.9, 0, TAU); x.fill();
        x.fillStyle = "#222"; x.beginPath(); x.arc(-7, -2, 2.4, 0, TAU); x.arc(7, -2, 2.4, 0, TAU); x.fill();
        x.fillStyle = "#888"; x.beginPath(); x.arc(-7, -2, 1, 0, TAU); x.arc(7, -2, 1, 0, TAU); x.fill();
        x.fillStyle = "rgba(110,190,80,0.6)"; x.beginPath(); x.ellipse(-1, -11, 4, 0.8, 0, 0, TAU); x.fill();
      } else if (p.type === "helmet") {                       // diver's helmet (it's the bubbler)
        const gr = x.createRadialGradient(-3, -11, 1, 0, -7, 10);
        gr.addColorStop(0, "#ffe7a3"); gr.addColorStop(1, "#b07a2a");
        x.fillStyle = gr; x.beginPath(); x.arc(0, -7, 7.5, Math.PI * 0.95, Math.PI * 0.05); x.lineTo(7, 0); x.lineTo(-7, 0); x.fill();
        x.fillStyle = "#8a5a1a"; x.fillRect(-8, -1.5, 16, 2.5);
        x.fillStyle = "#1d3c4f"; x.beginPath(); x.arc(0, -7, 3.3, 0, TAU); x.fill();
        x.strokeStyle = "#ffe7a3"; x.lineWidth = 0.8; x.stroke();
        x.fillStyle = "rgba(255,255,255,0.5)"; x.beginPath(); x.arc(-1, -8.2, 1, 0, TAU); x.fill();
      } else if (p.type === "castle") {
        x.fillStyle = "#c9b79a";
        x.fillRect(-10, -14, 6, 14); x.fillRect(4, -14, 6, 14); x.fillRect(-5, -10, 10, 10);
        for (const tx of [-10, -6, 4, 8]) x.fillRect(tx, -16, 2, 2);
        x.fillStyle = "#3a2c22"; x.beginPath(); x.arc(0, -3, 2.5, Math.PI, 0); x.lineTo(2.5, 0); x.lineTo(-2.5, 0); x.fill();
        x.fillRect(-8, -10, 2, 3); x.fillRect(6, -10, 2, 3);
        x.fillStyle = "#ff5a7a"; x.beginPath(); x.moveTo(7, -16); x.lineTo(7, -22); x.lineTo(11, -20.5); x.lineTo(7, -19); x.fill();
      } else if (p.type === "anchor") {
        x.rotate(0.35);
        x.strokeStyle = "#4a4f57"; x.lineWidth = 2; x.lineCap = "round";
        x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -18); x.stroke();
        x.beginPath(); x.moveTo(-5, -14); x.lineTo(5, -14); x.stroke();
        x.beginPath(); x.arc(0, -4, 6, 0.2, Math.PI - 0.2); x.stroke();
        x.lineWidth = 1.2; x.beginPath(); x.arc(0, -20, 2, 0, TAU); x.stroke();
      }
      x.restore();
    }

    // -------------------------------------------------------- creatures in the scene
    function spawnAgents() {
      agents = save.creatures.map((c) => {
        const old = agents.find((a) => a.c === c);
        if (old) { old.x = Math.min(old.x, W - 6); old.hide = null; return old; }
        return makeAgent(c, false);
      });
    }
    function makeAgent(c, dropIn) {
      const a = { c, x: 20 + rand() * (W - 40), y: SURF + 15 + rand() * (VH - 70), vx: rand() - 0.5, vy: 0,
                  dir: rand() < 0.5 ? -1 : 1, phase: rand() * 6, wander: rand() * 6, hide: null,
                  arrive: dropIn ? 1 : 0, retract: 0, burrow: 0, puff: 0, spin: 0, mood: "ok", moodT: 0,
                  look: null, lookT: 0, blinkAt: rand() * 4, alarm: 0 };
      if (WALK[c.kind]) a.y = floorAt(a.x) - 4;
      if (dropIn) { a.y = SURF - 4; a.vy = 1.4; a.x = 30 + rand() * (W - 60); }
      return a;
    }

    function hideSpot(a) {
      let best = scene.rocks[0], bd = 1e9;
      for (const k of scene.rocks) { const d = Math.abs(k.x - a.x); if (d < bd) { bd = d; best = k; } }
      const L = a.c.genes.len * SIZE;
      return { rock: best, ox: (rand() - 0.5) * Math.max(0, best.rx * 1.1 - L), oy: (rand() - 0.1) * best.ry * 0.25,
               side: a.x < best.x ? -1 : 1 };
    }

    function say(a, text, life, big) {
      says = says.filter((s) => s.a !== a);
      says.push({ a, text, life: life || 1.6, max: life || 1.6, big: !!big });
    }
    function setMood(a, m, sec) { a.mood = m; a.moodT = sec; }
    function lookAt(a, x, y, sec) { a.look = { x, y }; a.lookT = sec; }

    // -------------------------------------------------------- driving
    function step(dt) {
      t += dt;
      const s = drv;
      const fwd = s.ready ? s.fwd : 0, lat = s.ready ? s.lat : 0;

      const j = (fwd - lastFwd) / Math.max(dt, 0.001); lastFwd = fwd;
      jerk += (1 - Math.exp(-dt / 0.15)) * (j - jerk);

      let harsh = 0, why = "";
      if (fwd < HARD.brake) { harsh = Math.max(harsh, 0.5 + (HARD.brake - fwd) / 2); why = "hard braking"; }
      if (fwd > HARD.accel) { harsh = Math.max(harsh, 0.5 + (fwd - HARD.accel) / 2); why = why || "flooring it"; }
      if (Math.abs(lat) > HARD.lat) { harsh = Math.max(harsh, 0.5 + (Math.abs(lat) - HARD.lat) / 2); why = why || "that sharp turn"; }
      if (Math.abs(jerk) > HARD.jerk && moving) { harsh = Math.max(harsh, 0.45); why = why || "that jerky move"; }

      if (harsh > 0 && !inHarsh) scare(harsh, why);
      inHarsh = harsh > 0;
      if (inHarsh) stress = Math.max(stress, 0.6);
      else stress = Math.max(0, stress - dt * (moving ? 0.028 : 0.05));

      // the fun stuff for gentle driving
      if (!inHarsh && Math.abs(lat) > WHEEE_LAT && !inWheee && stress < 0.2) wheee();
      inWheee = Math.abs(lat) > WHEEE_LAT * 0.8;
      dizzy = Math.max(0, dizzy + (Math.abs(lat) > 1.2 ? Math.abs(lat) * dt : -dt * 0.7));
      if (dizzy > 9) getDizzy();

      if (moving && stress < 0.12 && !inHarsh) {
        save.calm += dt; streak += dt;
        while (save.calm >= CALM_GOAL) { save.calm -= CALM_GOAL; arrive(); }
        if (streak >= nextParty) { startParty(); nextParty += PARTY_EVERY; }
        nextVisitor -= dt;
        if (nextVisitor <= 0) { spawnVisitor(); nextVisitor = 120 + rand() * 180; }
      }
      stillFor = moving ? 0 : stillFor + dt;

      if (s.event === "BUMP" && !bumped) bump();
      bumped = s.event === "BUMP";

      const target = clamp(-lat * 1.6, -9, 9) * (RM ? 0.4 : 1);   // water swings opposite the turn
      sloshV += ((target - slosh) * 14 - sloshV * 3.2) * dt;
      slosh += sloshV * dt;
      wave = Math.max(0, wave - dt * 1.5);
      shake = Math.max(0, shake - dt * 3);

      updateAgents(dt, lat, fwd);
      updateWorld(dt, lat);

      if (performance.now() - lastSaved > 10000) { lastSaved = performance.now(); persist(); }
      onHud({ calm: save.calm / CALM_GOAL, count: save.creatures.length, stress, biome: B.name, jerk, fwd, lat,
              moving, streak, party: !!party, sleepy: isSleepy() });
    }

    function isSleepy() { return stillFor > 90; }

    function scare(level, why) {
      stress = clamp(stress + 0.45 + level * 0.2, 0, 1);
      save.calm = Math.max(0, save.calm - 20);
      streak = 0; nextParty = PARTY_FIRST; party = null;
      wave = 1; shake = RM ? 0 : 0.6;
      agents.forEach((a, i) => {
        a.vx += (rand() - 0.5) * 3.5; a.vy += (rand() - 0.5) * 2.5;
        a.alarm = 1.4 + i * 0.03;
        setMood(a, "scared", 4);
        if (a.c.kind === "puffer") { a.puff = 1; }
        if (a.c.kind === "octopus") {
          for (let k = 0; k < 9; k++) fx.ink.push({ x: a.x + (rand() - 0.5) * 6, y: a.y + (rand() - 0.5) * 6, r: 3 + rand() * 4, grow: 6 + rand() * 6, life: 1 });
          say(a, "*squirt*", 1.4);
        }
        if (i % 3 === 0 && a.c.kind !== "octopus") say(a, pick(rand, ["!!", "Eek!", "AAH!", "!", "Yikes!"]), 1.3);
      });
      for (let i = 0; i < 18; i++) fx.bubbles.push({ x: rand() * W, y: VH - 30 - rand() * 60, r: 0.8 + rand() * 1.6, vy: -0.6 - rand() });
      sfx("blub");
      const now = performance.now();
      if (now - lastHarshMsg > 6000) { lastHarshMsg = now; onToast("Eek, " + why + "! Everyone's hiding."); }
    }

    function wheee() {
      const now = performance.now();
      if (now - lastWheee < 6000) return;
      lastWheee = now;
      const swimmers = agents.filter((a) => SWIM[a.c.kind] && !a.hide);
      for (let i = 0; i < Math.min(3, swimmers.length); i++) {
        const a = swimmers[(rand() * swimmers.length) | 0];
        say(a, pick(rand, ["wheee!", "wheeee!", "woo!", "yay!"]), 1.6); setMood(a, "happy", 1.6);
      }
      if (swimmers.length) sfx("wheee");
    }

    function getDizzy() {
      dizzy = 4;
      for (const a of agents) if (!a.hide) setMood(a, "dizzy", 3.5);
      const now = performance.now();
      if (now - lastDizzyMsg > 20000) {
        lastDizzyMsg = now;
        const a = agents.find((x) => !x.hide);
        if (a) say(a, "so… dizzy…", 2.5);
        onToast("All these turns — the fish are dizzy!");
      }
    }

    function bump() {
      shake = RM ? 0 : 0.8; wave = Math.max(wave, 0.7);
      for (const a of agents) { a.vy -= WALK[a.c.kind] ? 1.8 : 1.2; if (!a.hide && rand() < 0.35) say(a, pick(rand, ["boing!", "whoa!", "hup!"]), 1.1); }
      for (let i = 0; i < 60; i++) {
        const x = rand() * W;
        fx.puffs.push({ x, y: floorAt(x) - 0.5, vx: (rand() - 0.5) * 0.8, vy: -0.4 - rand() * 1.2, life: 1, col: pick(rand, B.sand), r: 0.3 + rand() * 0.5 });
      }
      scene.chest.opening = 0.6;
      scene.duck.vy = -1.5;
      sfx("boop");
    }

    function arrive() {
      save.earned++;
      if (save.creatures.length >= MAX_CREATURES) { onToast("Smooth driving! The tank is full — everyone's happy."); persist(); return; }
      const c = newCreature(pickNewKind(save.earned));
      save.creatures.push(c);
      const a = makeAgent(c, true);
      agents.push(a);
      splash(a.x);
      say(a, (c.shiny ? "✨ " : "") + "NEW!", 3.5, true);
      setMood(a, "happy", 3);
      for (const b of agents) if (b !== a && !b.hide) lookAt(b, a.x, a.y + 20, 2.5);
      const kind = KINDS[c.kind];
      onToast((c.shiny ? "✨ SHINY " : "") + kind.rarity + "! " + c.name + " the " + kind.label + " joined the tank.");
      sfx("splash"); setTimeout(() => sfx(c.shiny ? "jingle" : "ding"), 350);
      persist();
    }

    function splash(x) {
      for (let i = 0; i < 16; i++) fx.drops.push({ x: x + (rand() - 0.5) * 4, y: SURF - 1, vx: (rand() - 0.5) * 1.6, vy: -1 - rand() * 1.4, life: 1 });
      for (let i = 0; i < 20; i++) fx.bubbles.push({ x: x + (rand() - 0.5) * 12, y: SURF + 2 + rand() * 14, r: 0.6 + rand() * 1.6, vy: -0.2 - rand() * 0.4 });
      wave = Math.max(wave, 0.8);
    }

    function startParty(type) {
      type = type || pick(rand, ["heart", "conga", "spin"]);
      party = { type, t: 0, dur: 10 };
      const names = { heart: "heart", conga: "conga line", spin: "spin" };
      onToast("Smooth streak! 🎉 " + names[type] + " party!");
      sfx("jingle");
      for (const a of agents) { setMood(a, "happy", 10); if (!SWIM[a.c.kind]) say(a, "♪", 2); }
    }

    function partyTarget(a, i, n) {
      const cx = W / 2, cy = SURF + (VH - 20 - SURF) * 0.45, pt = party.t;
      if (party.type === "heart") {
        const th = (i / n) * TAU + pt * 0.35;
        const hx = 16 * Math.pow(Math.sin(th), 3);
        const hy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th));
        return [cx + hx * 2.1, cy + hy * 2.0];
      }
      if (party.type === "spin") {
        const th = (i / n) * TAU + pt * 1.1, r = 26 + (i % 2) * 10;
        return [cx + Math.cos(th) * r * 1.4, cy + Math.sin(th) * r];
      }
      const u = pt * 0.7 - i * 0.32;                        // conga: follow the leader in a figure eight
      return [cx + Math.sin(u) * W * 0.36, cy + Math.sin(2 * u) * 26];
    }

    function spawnVisitor(type) {
      type = type || pick(rand, ["turtle", "turtle", "whale", "sub"]);
      const dir = rand() < 0.5 ? 1 : -1;
      const v = { type, dir, x: dir > 0 ? -40 : W + 40, y: 0, t: 0, phase: 0 };
      if (type === "whale") { v.y = SURF + 30 + rand() * 30; v.speed = 7; }
      else if (type === "turtle") { v.y = SURF + 25 + rand() * 50; v.speed = 9; }
      else { v.y = SURF + 30 + rand() * 40; v.speed = 11; }
      visitors.push(v);
      const msg = { turtle: "A sea turtle is swimming by! 🐢", whale: "Is that… a whale?! 🐋", sub: "A tiny submarine is exploring your tank!" }[type];
      onToast(msg);
    }

    // -------------------------------------------------------- behaviour
    function updateAgents(dt, lat, fwd) {
      const k = dt * 60;
      const pushX = -lat * 0.012 * (RM ? 0.5 : 1);           // inertia: things slide opposite the turn
      const pushY = Math.max(0, -fwd) * 0.004;
      const sleepy = isSleepy();
      if (party) { party.t += dt; if (party.t > party.dur) party = null; }
      const dancers = party ? agents.filter((a) => SWIM[a.c.kind] && !a.hide) : [];

      for (const a of agents) {
        const G = a.c.genes, kind = a.c.kind;
        const threshold = 0.2 + G.brave * 0.25;
        const wantHide = stress > threshold;
        if (wantHide && !a.hide) a.hide = hideSpot(a);
        if (!wantHide && a.hide) { a.hide = null; if (stress > 0.05) say(a, pick(rand, ["phew…", "is it over?", "…ok"]), 1.6); }
        const peek = a.hide && stress < threshold + 0.12;

        a.phase += dt * (4 + Math.hypot(a.vx, a.vy) * 6);
        a.arrive = Math.max(0, a.arrive - dt * 0.6);
        a.alarm = Math.max(0, a.alarm - dt);
        a.spin = Math.max(0, a.spin - dt * 1.8);
        a.lookT = Math.max(0, a.lookT - dt); if (!a.lookT) a.look = null;
        a.moodT = Math.max(0, a.moodT - dt);
        if (!a.moodT) a.mood = a.hide ? "scared" : sleepy ? "sleep" : "ok";
        if (a.mood === "sleep" && rand() < dt * 0.25) fx.stars.push({ x: a.x + a.dir * 3, y: a.y - 4, vx: 0.05, vy: -0.12, life: 1.6, ch: "z" });
        if (kind === "puffer") a.puff = clamp(a.puff + (wantHide ? dt * 3 : -dt * 0.35), 0, 1);
        if (a.c.shiny && rand() < dt * 2) fx.stars.push({ x: a.x + (rand() - 0.5) * G.len, y: a.y + (rand() - 0.5) * 6, vx: 0, vy: -0.05, life: 0.8, ch: "✦" });

        if (kind === "snail") { updateSnail(a, dt, wantHide); continue; }
        if (kind === "crab") {                                // crabs dig in where they stand
          a.burrow = clamp(a.burrow + (wantHide ? dt * 3 : -dt * 0.5), 0, 1);
          if (a.burrow > 0.2) { a.vx *= 0.8; a.y = floorAt(a.x) - 4 + a.burrow * 3.5; continue; }
        }

        let ax = 0, ay = 0;
        const sp0 = sleepy && !party ? 0.35 : 1;
        if (a.hide && kind !== "crab") {
          const R = a.hide.rock;
          let tx = R.x + a.hide.ox, ty = WALK[kind] ? floorAt(R.x) - 4 : R.y + a.hide.oy;
          if (peek) tx = R.x + a.hide.side * (R.rx * 0.92);
          const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
          const sp = (WALK[kind] ? 0.7 : 1.8) * G.speed;
          ax += (dx / d * sp - a.vx) * 0.14; ay += (dy / d * sp - a.vy) * 0.14;
          if (d < 3) { a.vx *= 0.8; a.vy *= 0.8; }
          if (peek && d < 4) a.dir = -a.hide.side;
        } else if (party && SWIM[kind]) {
          const [tx, ty] = partyTarget(a, dancers.indexOf(a), dancers.length);
          const dx = tx - a.x, dy = ty - a.y;
          ax += (dx * 0.05 - a.vx) * 0.12; ay += (dy * 0.05 - a.vy) * 0.12;
          if (rand() < dt * 0.4) fx.stars.push({ x: a.x, y: a.y - 4, vx: (rand() - 0.5) * 0.1, vy: -0.15, life: 1.4, ch: pick(rand, ["♪", "♫", "♥"]) });
        } else if (SWIM[kind]) {
          a.wander += (rand() - 0.5) * 0.25 * k;
          const sp = { fish: 0.55, puffer: 0.3, seahorse: 0.15, jelly: 0.12 }[kind] * G.speed * sp0;
          ax += Math.cos(a.wander) * sp * 0.05; ay += Math.sin(a.wander) * sp * 0.025;
          if (kind === "fish" && G.school) {                // boids: cohesion, alignment, separation
            let cx = 0, cy = 0, avx = 0, avy = 0, n = 0, sx = 0, sy = 0;
            for (const b of agents) {
              if (b === a || b.c.kind !== "fish" || b.hide) continue;
              const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
              if (d2 < 900) { cx += b.x; cy += b.y; avx += b.vx; avy += b.vy; n++; }
              if (d2 < 81) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
            }
            if (n) { ax += (cx / n - a.x) * 0.0008 + (avx / n - a.vx) * 0.03; ay += (cy / n - a.y) * 0.0008 + (avy / n - a.vy) * 0.03; }
            ax += sx * 0.5; ay += sy * 0.5;
          }
          if (kind === "jelly") ay += Math.sin(a.phase * 0.25) < -0.6 ? -0.03 : 0.006;
          if (kind === "seahorse") ay += Math.sin(t * 1.3 + a.wander) * 0.004;
          if (sleepy && !party) ay += ((floorAt(a.x) - 18) - a.y) * 0.0006;      // drift down to nap
          // food
          let best = null, bd = 1e9;
          for (const f of fx.food) { const d = Math.hypot(f.x - a.x, f.y - a.y); if (d < bd) { bd = d; best = f; } }
          if (best && bd < 140 && kind !== "jelly") {
            ax += (best.x - a.x) / bd * 0.05; ay += (best.y - a.y) / bd * 0.05;
            lookAt(a, best.x, best.y, 0.3);
            if (bd < 3) { best.eaten = true; say(a, "nom!", 0.9); setMood(a, "happy", 1.5); if (rand() < 0.4) sfx("poke"); }
          }
          const top = SURF + 10, bot = floorAt(a.x) - 9;
          if (a.x < 12) ax += 0.04; if (a.x > W - 12) ax -= 0.04;
          if (a.y < top) ay += 0.05; if (a.y > bot) ay -= 0.06;
        } else {                                              // walkers on the sand
          a.wander += (rand() - 0.5) * 0.08 * k;
          const sp = (kind === "octopus" ? 0.12 : kind === "shrimp" ? 0.22 : 0.3) * G.speed * sp0;
          ax += (Math.cos(a.wander) * sp - a.vx) * 0.05;
          if (kind === "shrimp" && rand() < 0.004 * k) a.vy -= 1.2;
          if (party && rand() < 0.02 * k) a.vy -= 1.0;        // walkers hop along to the music
          if (a.x < 8) ax += 0.05; if (a.x > W - 8) ax -= 0.05;
        }

        ax += pushX * (WALK[kind] ? 0.4 : 1); ay += pushY;
        a.vx += ax * k; a.vy += ay * k;
        if (WALK[kind]) {
          a.vy += 0.08 * k;
          const gy = floorAt(a.x) - 4;
          if (a.y >= gy) { a.y = gy; a.vy = Math.min(0, a.vy); }
        }
        const max = (a.hide ? 2.6 : party ? 2 : kind === "fish" ? 1.1 : 0.6) * G.speed + Math.abs(pushX) * 20;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > max) { a.vx *= max / sp; a.vy *= max / sp; }
        a.vx *= Math.pow(0.985, k); a.vy *= Math.pow(SWIM[kind] ? 0.97 : 0.995, k);
        a.x = clamp(a.x + a.vx * k, 4, W - 4);
        a.y = clamp(a.y + a.vy * k, SURF + 4, VH - 6);
        if (Math.abs(a.vx) > 0.05 && !(a.hide && peek)) a.dir = a.vx > 0 ? 1 : -1;
      }
      fx.food = fx.food.filter((f) => !f.eaten && f.y < floorAt(f.x));
    }

    function updateSnail(a, dt, wantHide) {
      a.retract = clamp(a.retract + (wantHide ? dt * 4 : -dt * 0.6), 0, 1);
      if (a.retract > 0.3 || isSleepy()) return;
      a.wander += (rand() - 0.5) * 0.05;
      a.x = clamp(a.x + Math.cos(a.wander) * 0.06 * dt * 60, 8, W - 8);
      a.y = clamp(a.y + Math.sin(a.wander) * 0.04 * dt * 60, SURF + 10, VH - 30);
      a.dir = Math.cos(a.wander) > 0 ? 1 : -1;
    }

    function updateWorld(dt, lat) {
      const k = dt * 60;
      for (const b of scene.bubblers) if (rand() < 0.14 * k) fx.bubbles.push({ x: b.x + (rand() - 0.5) * 2, y: b.y, r: 0.4 + rand() * 1.4, vy: -0.35 - rand() * 0.3 });
      for (const b of fx.bubbles) { b.y += b.vy * k; b.x += Math.sin(b.y * 0.15 + b.r) * 0.12 * k - slosh * 0.004 * k; }
      fx.bubbles = fx.bubbles.filter((b) => b.y > surfaceY(b.x) + 1).slice(-200);
      for (const p of fx.puffs) { p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.02 * k; p.life -= dt * 0.7; }
      fx.puffs = fx.puffs.filter((p) => p.life > 0);
      for (const f of fx.food) { f.y += 0.16 * k; f.x += Math.sin(t * 2 + f.s) * 0.05 * k - slosh * 0.003 * k; }
      for (const p of fx.ink) { p.r += p.grow * dt; p.grow *= 0.97; p.life -= dt * 0.28; }
      fx.ink = fx.ink.filter((p) => p.life > 0);
      for (const p of fx.stars) { p.x += p.vx * k; p.y += p.vy * k; p.life -= dt; }
      fx.stars = fx.stars.filter((p) => p.life > 0).slice(-120);
      for (const p of fx.drops) { p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.09 * k; p.life -= dt * 1.2; }
      fx.drops = fx.drops.filter((p) => p.life > 0 && p.y < SURF + 3);
      for (const c of fx.coins) { c.x += c.vx * k; c.y += c.vy * k; c.vy += 0.05 * k; c.vx *= 0.98; c.life -= dt * 0.5; const f = floorAt(c.x) - 1; if (c.y > f) { c.y = f; c.vy *= -0.35; } }
      fx.coins = fx.coins.filter((c) => c.life > 0);
      for (const s of says) s.life -= dt;
      says = says.filter((s) => s.life > 0);

      // treasure chest burps a big bubble now and then
      const ch = scene.chest;
      ch.next -= dt;
      if (ch.next <= 0) { ch.opening = 2.2; ch.next = 25 + rand() * 30; }
      if (ch.opening > 0) {
        ch.opening -= dt;
        if (ch.open > 0.8 && rand() < dt * 3) fx.bubbles.push({ x: ch.x + (rand() - 0.5) * 4, y: floorAt(ch.x) - 7, r: 1.2 + rand() * 2.2, vy: -0.5 - rand() * 0.3 });
      }
      ch.open += ((ch.opening > 0 ? 1 : 0) - ch.open) * (1 - Math.exp(-dt * 6));

      // rubber duck rides the slosh
      const d = scene.duck;
      d.vx += (-lat * 0.02 + Math.sin(t * 0.3) * 0.002) * k;
      d.vx *= Math.pow(0.97, k); d.x += d.vx * k;
      if (d.x < 6) { d.x = 6; d.vx = Math.abs(d.vx) * 0.6; } if (d.x > W - 6) { d.x = W - 6; d.vx = -Math.abs(d.vx) * 0.6; }
      d.vy = (d.vy || 0) + 0.12 * k; d.bob = Math.min(0, (d.bob || 0) + d.vy * k); if (d.bob === 0) d.vy = 0;
      d.spin = Math.max(0, d.spin - dt * 2);

      for (const v of visitors) {
        v.t += dt; v.phase += dt * 3; v.x += v.dir * v.speed * dt;
        if (v.type === "sub" && rand() < dt * 6) fx.bubbles.push({ x: v.x - v.dir * 14, y: v.y + (rand() - 0.5) * 2, r: 0.4 + rand() * 0.8, vy: -0.4 });
        if (v.type !== "whale") for (const a of agents) if (!a.hide && Math.abs(a.x - v.x) < 50 && rand() < dt * 0.6) lookAt(a, v.x, v.y, 1.5);
      }
      visitors = visitors.filter((v) => v.x > -80 && v.x < W + 80);
    }

    function surfaceY(x) {
      return SURF - slosh * ((x / W) - 0.5) * 2 + Math.sin(x / 9 + t * 2.2) * (0.6 + wave * 2) + Math.sin(x / 23 - t * 1.3) * 0.6;
    }

    // -------------------------------------------------------- drawing
    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const sx = shake ? (rand() - 0.5) * shake * 4 * S : 0, sy = shake ? (rand() - 0.5) * shake * 3 * S : 0;
      g.drawImage(bgCanvas, sx, sy);
      g.setTransform(S, 0, 0, S, sx, sy);
      drawLight();
      for (const v of visitors) if (v.type === "whale") drawWhale(v);
      for (const p of scene.back) drawPlant(p);
      drawChest();
      drawBubbles();
      g.fillStyle = "#c8742a";
      for (const f of fx.food) { g.beginPath(); g.arc(f.x, f.y, 0.7, 0, TAU); g.fill(); }
      for (const v of visitors) if (v.type !== "whale") v.type === "turtle" ? drawTurtle(v) : drawSub(v);
      for (const a of agents) if (a.c.kind !== "snail") drawAgent(a);
      for (const c of fx.coins) { g.globalAlpha = Math.min(1, c.life * 2); g.fillStyle = "#ffd23f"; g.beginPath(); g.ellipse(c.x, c.y, 1.1 * Math.abs(Math.cos(c.x)), 1.1, 0, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, sx, sy);
      g.drawImage(fgCanvas, 0, 0);
      g.setTransform(S, 0, 0, S, sx, sy);
      for (const p of scene.front) drawPlant(p);
      for (const p of fx.ink) { g.fillStyle = `rgba(20,14,30,${p.life * 0.55})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
      for (const p of fx.puffs) { g.globalAlpha = Math.min(1, p.life); g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      drawSurface();
      drawDuck();
      for (const a of agents) if (a.c.kind === "snail") drawSnail(a);
      if (stress > 0.05) { g.fillStyle = `rgba(60,70,60,${stress * 0.2})`; g.fillRect(-10, -10, W + 20, VH + 20); }
      if (party) {                                            // party lights
        const hue = (t * 120) % 360;
        g.save(); g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const x = W * (0.2 + 0.3 * i) + Math.sin(t * 2 + i * 2) * 30;
          g.fillStyle = `hsla(${(hue + i * 120) % 360},90%,60%,0.07)`;
          g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x + 36, VH); g.lineTo(x - 36, VH); g.fill();
        }
        g.restore();
      }
      // glass glare
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.beginPath(); g.moveTo(W * 0.08, 0); g.lineTo(W * 0.15, 0); g.lineTo(W * 0.05, VH); g.lineTo(-W * 0.02, VH); g.fill();
      drawStars();
      drawSays();
    }

    function drawLight() {
      g.save(); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 4; i++) {
        const base = W * (i + 0.5) / 4 + (RM ? 0 : Math.sin(t * 0.15 + i * 2) * 20);
        const gr = g.createLinearGradient(0, SURF, 0, VH);
        gr.addColorStop(0, B.glow ? "rgba(80,140,255,0.07)" : "rgba(255,255,255,0.10)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(base - 6, SURF); g.lineTo(base + 6, SURF); g.lineTo(base + 42, VH); g.lineTo(base + 12, VH); g.fill();
      }
      if (!B.glow) {
        for (const c of scene.caustics) {
          const a = 0.035 + Math.sin(t * c.s + c.p) * 0.025;
          if (a <= 0) continue;
          g.fillStyle = `rgba(255,255,255,${a})`;
          g.beginPath(); g.ellipse(c.x + Math.sin(t * 0.4 + c.p) * 6, c.y, c.r, c.r * 0.35, Math.sin(t * 0.2 + c.p) * 0.4, 0, TAU); g.fill();
        }
      }
      g.restore();
    }

    function drawPlant(p) {
      const base = floorAt(p.x) + 2;
      const sw = (i) => (RM ? 0.3 : 1) * (Math.sin(t * 0.9 + p.phase + i * 0.45) * i * 0.35) + slosh * i * 0.08;
      if (B.kind === "kelp" || p.tuft) {
        const segs = Math.max(2, Math.round(p.h / 6));
        const pts = [[p.x, base]];
        for (let i = 1; i <= segs; i++) pts.push([p.x + sw(i), base - i * (p.h / segs)]);
        g.strokeStyle = p.color; g.lineWidth = p.tuft ? 0.8 : 1.8; g.lineCap = "round";
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const m = [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
          g.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], m[0], m[1]);
        }
        g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.stroke();
        if (!p.tuft) {
          g.fillStyle = shade(p.color, 0.12);
          for (let i = 1; i < pts.length; i += 1) {
            const q = pts[i], s = i % 2 ? 1 : -1;
            g.beginPath(); g.ellipse(q[0] + s * 3, q[1], 3.4, 1.1, s * 0.5 + Math.sin(t + i) * 0.1, 0, TAU); g.fill();
          }
          if (pts.length > 3) { g.fillStyle = "#d9b24a"; g.beginPath(); g.arc(pts[2][0], pts[2][1], 1.1, 0, TAU); g.fill(); }
        }
      } else if (B.kind === "glow") {
        g.save(); g.globalCompositeOperation = "lighter";
        g.strokeStyle = rgba(p.color, 0.85); g.lineWidth = 0.7; g.fillStyle = p.color;
        for (let q = -3; q <= 3; q++) {
          const tipX = p.x + q * 2.2 + Math.sin(t * 1.5 + p.phase + q) * 2 + slosh * 0.3, tipY = base - p.h + Math.abs(q);
          g.beginPath(); g.moveTo(p.x, base); g.quadraticCurveTo(p.x + q * 1.2, base - p.h * 0.6, tipX, tipY); g.stroke();
          g.beginPath(); g.arc(tipX, tipY, 0.7 + Math.sin(t * 3 + q) * 0.2, 0, TAU); g.fill();
        }
        g.restore();
      } else if (!scene.back.includes(p)) {                   // small swaying fans up front
        g.strokeStyle = p.color; g.lineWidth = 0.8; g.lineCap = "round";
        for (let q = -2; q <= 2; q++) {
          g.beginPath(); g.moveTo(p.x, base);
          g.quadraticCurveTo(p.x + q * 1.5, base - p.h * 0.3, p.x + q * 3 + Math.sin(t + p.phase) * 1, base - p.h * (0.6 + 0.1 * (2 - Math.abs(q))));
          g.stroke();
        }
      }
    }

    function drawBubbles() {
      g.lineWidth = 0.35;
      for (const b of fx.bubbles) {
        g.strokeStyle = "rgba(255,255,255,0.75)"; g.fillStyle = "rgba(255,255,255,0.12)";
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill(); g.stroke();
        if (b.r > 0.9) { g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, TAU); g.fill(); }
      }
    }

    function drawSurface() {
      g.fillStyle = B.glow ? "#05080f" : "#0e1a24";
      g.beginPath(); g.moveTo(-10, -10); g.lineTo(W + 10, -10);
      for (let x = W + 10; x >= -10; x -= 2) g.lineTo(x, surfaceY(x));
      g.closePath(); g.fill();
      g.strokeStyle = B.glow ? "rgba(120,170,255,0.55)" : "rgba(225,248,255,0.85)"; g.lineWidth = 0.6;
      g.beginPath();
      for (let x = -10; x <= W + 10; x += 2) { const y = surfaceY(x); x > -10 ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = "rgba(220,245,255,0.6)";
      for (const p of fx.drops) { g.beginPath(); g.arc(p.x, p.y, 0.6, 0, TAU); g.fill(); }
    }

    function drawDuck() {
      const d = scene.duck, y = surfaceY(d.x) - 1.5 + (d.bob || 0);
      const slope = (surfaceY(d.x + 3) - surfaceY(d.x - 3)) / 6;
      g.save(); g.translate(d.x, y); g.rotate(Math.atan(slope) + d.spin * TAU);
      const fd = d.vx < -0.02 ? -1 : 1; g.scale(fd, 1);
      g.fillStyle = "#ffd93b";
      g.beginPath(); g.ellipse(0, 0, 4.2, 2.6, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-4, -0.5); g.lineTo(-5.5, -2.5); g.lineTo(-3, -1.5); g.fill();
      g.beginPath(); g.arc(2.4, -3, 2.1, 0, TAU); g.fill();
      g.fillStyle = "#ff8c1a"; g.beginPath(); g.ellipse(4.6, -2.6, 1.3, 0.6, 0.15, 0, TAU); g.fill();
      g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(3, -3.5, 0.45, 0, TAU); g.fill();
      g.fillStyle = "#ffffffaa"; g.beginPath(); g.ellipse(-1, -1, 1.6, 0.6, -0.3, 0, TAU); g.fill();
      g.restore();
    }

    function drawChest() {
      const c = scene.chest, base = floorAt(c.x) + 2;
      g.save(); g.translate(c.x, base);
      g.fillStyle = "#7a4a22"; g.fillRect(-6, -6, 12, 6);
      g.fillStyle = "#c99a3b"; g.fillRect(-6, -6, 12, 1); g.fillRect(-0.8, -5, 1.6, 2.5);
      g.fillStyle = "#5b3518"; g.fillRect(-4, -6, 0.8, 6); g.fillRect(3.2, -6, 0.8, 6);
      if (c.open > 0.1) {                                    // gold glow inside
        g.save(); g.globalCompositeOperation = "lighter";
        g.fillStyle = `rgba(255,210,80,${c.open * 0.35})`; g.beginPath(); g.ellipse(0, -6, 7, 3 * c.open, 0, Math.PI, 0); g.fill();
        g.restore();
        g.fillStyle = "#ffd23f"; g.beginPath(); g.ellipse(0, -6, 4.8, 1, 0, Math.PI, 0); g.fill();
      }
      g.translate(-6, -6); g.rotate(-c.open * 1.2);
      g.fillStyle = "#8a5428"; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -2); g.quadraticCurveTo(6, -5, 12, -2); g.lineTo(12, 0); g.fill();
      g.fillStyle = "#c99a3b"; g.fillRect(0, -0.6, 12, 0.6);
      g.restore();
    }

    function drawStars() {
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const p of fx.stars) {
        g.globalAlpha = Math.min(1, p.life);
        g.font = (p.ch === "z" ? "bold 6px" : "7px") + " system-ui, sans-serif";
        g.fillStyle = p.ch === "♥" ? "#ff6b9a" : p.ch === "✦" ? "#ffe680" : p.ch === "z" ? "#cfe8ff" : "#ffffff";
        g.fillText(p.ch, p.x, p.y);
      }
      g.globalAlpha = 1;
    }

    function drawSays() {
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const s of says) {
        const a = s.a, life = s.life, k = Math.min(1, (s.max - life) * 8);  // pop in
        g.globalAlpha = Math.min(1, life * 2);
        const size = s.big ? 8 : 6.8;
        g.font = `bold ${size}px system-ui, sans-serif`;
        const tw = g.measureText(s.text).width + 6, th = size + 3.4;
        const x = clamp(a.x, tw / 2 + 2, W - tw / 2 - 2), y = Math.max(SURF + 3 + th, a.y - a.c.genes.len * SIZE * 0.55 - 7);
        g.save(); g.translate(x, y); g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
        g.fillStyle = s.big ? "#ffe14d" : "rgba(255,255,255,0.95)";
        g.beginPath(); g.roundRect(-tw / 2, -th / 2, tw, th, th / 2); g.fill();
        g.beginPath(); g.moveTo(-1.5, th / 2 - 0.2); g.lineTo(0, th / 2 + 2); g.lineTo(1.5, th / 2 - 0.2); g.fill();
        g.fillStyle = "#1b2433"; g.fillText(s.text, 0, 0.3);
        g.restore();
      }
      g.globalAlpha = 1;
    }

    // ---- creatures (drawn in a local frame facing right)
    function eye(a, x, y, r) {
      const m = a.mood, blink = (t + a.blinkAt) % 4.2 < 0.12 && m !== "scared";
      g.save(); g.translate(x, y);
      if (m === "happy" || m === "sleep" || blink) {         // ^ ^  or  – –
        g.strokeStyle = "#1b1b24"; g.lineWidth = Math.max(0.35, r * 0.35); g.lineCap = "round";
        g.beginPath();
        if (m === "happy") g.arc(0, r * 0.35, r * 0.75, Math.PI * 1.15, Math.PI * 1.85);
        else { g.moveTo(-r * 0.7, 0); g.lineTo(r * 0.7, 0); }
        g.stroke(); g.restore(); return;
      }
      const big = m === "scared" ? 1.25 : 1;
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, r * big, 0, TAU); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 0.2; g.stroke();
      if (m === "dizzy") {
        g.strokeStyle = "#1b1b24"; g.lineWidth = Math.max(0.25, r * 0.22);
        g.beginPath();
        for (let i = 0; i <= 18; i++) { const an = i * 0.75 + t * 8, rr = (i / 18) * r * 0.85; const px = Math.cos(an) * rr, py = Math.sin(an) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke(); g.restore(); return;
      }
      let lx = 0.3, ly = 0;                                  // pupils look where they're going, or at something
      if (a.look) { lx = (a.look.x - a.x) * a.dir; ly = a.look.y - a.y; const d = Math.hypot(lx, ly) || 1; lx /= d; ly /= d; }
      else if (Math.hypot(a.vx, a.vy) > 0.1) { ly = clamp(a.vy, -0.6, 0.6); }
      if (m === "scared") { lx = Math.sin(t * 23 + a.blinkAt) * 0.6; ly = Math.cos(t * 17) * 0.4; }
      const pr = m === "scared" ? r * 0.32 : r * 0.58, off = r * big - pr - r * 0.08;
      g.fillStyle = "#14141c"; g.beginPath(); g.arc(lx * off, ly * off, pr, 0, TAU); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(lx * off - pr * 0.35, ly * off - pr * 0.35, pr * 0.38, 0, TAU); g.fill();
      g.restore();
    }
    function mouth(a, x, y, r) {
      g.strokeStyle = "#1b1b24"; g.lineWidth = Math.max(0.25, r * 0.3); g.lineCap = "round";
      g.beginPath();
      if (a.mood === "happy") g.arc(x - r * 0.4, y - r * 0.3, r * 0.6, 0.2, Math.PI * 0.8);
      else if (a.mood === "scared") { g.fillStyle = "#3a1020"; g.ellipse(x - r * 0.3, y, r * 0.35, r * 0.5, 0, 0, TAU); g.fill(); return; }
      else { g.moveTo(x - r * 0.5, y); g.quadraticCurveTo(x - r * 0.2, y + r * 0.25, x, y); }
      g.stroke();
    }

    function drawAgent(a) {
      const G = a.c.genes, pal = PALETTES[G.pal];
      g.save();
      g.translate(a.x, a.y);
      if (a.arrive > 0) g.globalAlpha = 1 - a.arrive * 0.4;
      if (a.spin > 0) g.rotate((1 - a.spin) * TAU * a.dir);
      g.scale(a.dir * SIZE, SIZE);
      if (B.glow) {                                           // deep-sea glow, cheap: a soft halo behind
        g.save(); g.globalCompositeOperation = "lighter";
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, G.len * 0.9);
        gr.addColorStop(0, rgba(pal[1], 0.28)); gr.addColorStop(1, rgba(pal[1], 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, G.len * 0.9, 0, TAU); g.fill(); g.restore();
      }
      const K = a.c.kind;
      if (K === "fish") drawFish(a, G, pal);
      else if (K === "puffer") drawPuffer(a, G, pal);
      else if (K === "seahorse") drawSeahorse(a, G, pal);
      else if (K === "jelly") drawJelly(a, G, pal);
      else if (K === "crab") drawCrab(a, G, pal);
      else if (K === "shrimp") drawShrimp(a, G, pal);
      else if (K === "octopus") drawOctopus(a, G, pal);
      if (a.c.shiny) {                                        // shiny: golden rim sparkle
        g.globalCompositeOperation = "lighter";
        g.fillStyle = `rgba(255,230,120,${0.12 + Math.sin(t * 4 + a.phase) * 0.08})`;
        g.beginPath(); g.ellipse(0, 0, G.len * 0.6, G.len * 0.45, 0, 0, TAU); g.fill();
        g.globalCompositeOperation = "source-over";
      }
      g.restore();
      if (a.alarm > 0 && !a.hide) {                           // speed lines while fleeing
        g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 0.35;
        const L = a.c.genes.len * SIZE;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(a.x - a.dir * L * 0.6, a.y + i * 2.5); g.lineTo(a.x - a.dir * L * 1.2, a.y + i * 2.5); g.stroke(); }
      }
    }

    function fishBody(L, hh) {
      g.beginPath(); g.moveTo(L / 2, 0);
      g.bezierCurveTo(L * 0.45, -hh * 0.66, -L * 0.15, -hh * 0.66, -L * 0.42, -hh * 0.12);
      g.lineTo(-L * 0.42, hh * 0.12);
      g.bezierCurveTo(-L * 0.15, hh * 0.66, L * 0.45, hh * 0.66, L / 2, 0); g.closePath();
    }

    function drawFish(a, G, pal) {
      const L = G.len, hh = L * G.h, flap = Math.sin(a.phase) * hh * 0.22;
      // tail: 0 fan, 1 fork, 2 long flowing
      const tx = -L * 0.38, tl = G.tail === 2 ? L * 0.55 : L * 0.32;
      g.fillStyle = pal[1];
      g.beginPath(); g.moveTo(tx, 0);
      g.quadraticCurveTo(tx - tl * 0.5, -hh * 0.2 + flap * 0.5, tx - tl, -hh * 0.55 + flap);
      if (G.tail === 1) g.lineTo(tx - tl * 0.55, flap * 0.6);
      else g.quadraticCurveTo(tx - tl * 0.8, flap, tx - tl, hh * 0.55 + flap);
      if (G.tail === 1) g.lineTo(tx - tl, hh * 0.55 + flap);
      g.quadraticCurveTo(tx - tl * 0.5, hh * 0.2 + flap * 0.5, tx, 0); g.fill();
      if (G.fin) {
        g.beginPath(); g.moveTo(-L * 0.22, -hh * 0.45);
        g.quadraticCurveTo(-L * 0.05, -hh * 1.05, L * 0.15, -hh * 0.45); g.fill();
      }
      // body with soft shading
      if (!a.grad) {
        a.grad = g.createLinearGradient(0, -hh / 2, 0, hh / 2);
        a.grad.addColorStop(0, shade(pal[0], 0.15)); a.grad.addColorStop(0.55, pal[0]); a.grad.addColorStop(1, pal[2]);
      }
      g.fillStyle = a.grad; fishBody(L, hh); g.fill();
      g.save(); g.clip();
      g.fillStyle = pal[1];
      if (G.pattern === 1) { for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(i * L * 0.2 - L * 0.02, 0, L * 0.045, hh, 0, 0, TAU); g.fill(); } }
      else if (G.pattern === 2) { for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(((i * 37) % (L * 0.7)) - L * 0.32, ((i * 23) % (hh * 0.7)) - hh * 0.35, hh * 0.08 + 0.3, 0, TAU); g.fill(); } }
      else if (G.pattern === 3) { g.fillStyle = pal[2]; g.fillRect(-L / 2, hh * 0.08, L, hh); }
      else if (G.pattern === 4) { g.fillStyle = rgba(pal[1], 0.8); g.beginPath(); g.ellipse(-L * 0.1, -hh * 0.05, L * 0.12, hh * 0.18, 0, 0, TAU); g.fill(); }
      g.fillStyle = "rgba(255,255,255,0.28)"; g.beginPath(); g.ellipse(L * 0.05, -hh * 0.3, L * 0.28, hh * 0.08, -0.1, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = rgba(pal[1], 0.85);                       // little side fin paddling
      g.save(); g.translate(-L * 0.02, hh * 0.12); g.rotate(0.5 + Math.sin(a.phase * 1.3) * 0.5);
      g.beginPath(); g.ellipse(-L * 0.08, 0, L * 0.1, hh * 0.09, 0, 0, TAU); g.fill(); g.restore();
      const er = Math.max(1.2, hh * 0.19);
      eye(a, L * 0.24, -hh * 0.1, er);
      mouth(a, L * 0.46, hh * 0.12, er * 0.7);
    }

    function drawPuffer(a, G, pal) {
      const r = G.len * 0.42 * (1 + a.puff * 0.75), flap = Math.sin(a.phase * 1.5) * 0.6;
      const body = "#f5c242", belly = "#fff3c8";
      g.fillStyle = shade(body, -0.1);
      g.beginPath(); g.moveTo(-r * 0.9, 0); g.lineTo(-r * 1.35, -r * 0.35 + flap); g.lineTo(-r * 1.35, r * 0.35 + flap); g.fill();
      if (a.puff > 0.2) {                                     // spikes
        g.strokeStyle = shade(body, -0.35); g.lineWidth = 0.4;
        for (let i = 0; i < 16; i++) {
          const an = (i / 16) * TAU; g.beginPath();
          g.moveTo(Math.cos(an) * r * 0.95, Math.sin(an) * r * 0.95);
          g.lineTo(Math.cos(an) * r * (1 + 0.28 * a.puff), Math.sin(an) * r * (1 + 0.28 * a.puff)); g.stroke();
        }
      }
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
      gr.addColorStop(0, shade(body, 0.35)); gr.addColorStop(1, body);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r, r * (0.85 + a.puff * 0.15), 0, 0, TAU); g.fill();
      g.fillStyle = belly; g.beginPath(); g.ellipse(0, r * 0.4, r * 0.75, r * 0.4, 0, 0, Math.PI); g.fill();
      g.fillStyle = "#8a5a1a";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-r * 0.5 + i * r * 0.25, -r * 0.35 + (i % 2) * r * 0.15, r * 0.07, 0, TAU); g.fill(); }
      eye(a, r * 0.45, -r * 0.2, Math.max(1.3, r * 0.27));
      mouth(a, r * 0.92, r * 0.15, r * 0.22);
    }

    function drawSeahorse(a, G, pal) {
      const bob = Math.sin(a.phase * 0.3) * 0.6;
      g.translate(0, bob);
      g.fillStyle = pal[0];
      g.beginPath(); g.ellipse(-0.5, 0.5, 2.8, 4.3, 0.15, 0, TAU); g.fill();           // belly
      g.beginPath(); g.ellipse(0.5, -5, 3, 2.5, 0, 0, TAU); g.fill();                   // head
      g.beginPath(); g.moveTo(2.5, -6.2); g.lineTo(6, -5.8); g.lineTo(6, -4.4); g.lineTo(2.5, -4); g.fill();  // snout
      g.strokeStyle = pal[0]; g.lineWidth = 1.6; g.lineCap = "round";
      g.beginPath(); g.moveTo(-1.5, 4); g.quadraticCurveTo(-3, 8, 0, 8.3); g.quadraticCurveTo(1.6, 7, 0.2, 6.2); g.stroke();
      g.fillStyle = pal[2]; g.beginPath(); g.ellipse(0.6, 1, 1.4, 3, 0.15, 0, TAU); g.fill();
      g.fillStyle = rgba(pal[1], 0.85);
      g.beginPath(); g.ellipse(-3, 0, 1.2 + Math.sin(a.phase * 2) * 0.4, 2.2, 0, 0, TAU); g.fill();   // fluttering back fin
      g.beginPath(); g.moveTo(-1, -7.2); g.lineTo(0, -8.8); g.lineTo(1, -7.2); g.fill();               // crest
      eye(a, 1.2, -5.4, 1.3);
    }

    function drawJelly(a, G, pal) {
      const p = Math.sin(a.phase * 0.25), w = 5.2 + p * 0.8, h = 4.3 - p * 0.6;
      g.strokeStyle = rgba(pal[1], 0.7); g.lineWidth = 0.5;
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 2, 0);
        g.bezierCurveTo(i * 2 + Math.sin(a.phase * 0.5 + i) * 2, 4, i * 2 - Math.sin(a.phase * 0.5 + i) * 2, 7, i * 2 + Math.sin(a.phase * 0.5 + i + 1) * 1.5, 10 + Math.abs(i));
        g.stroke();
      }
      const gr = g.createRadialGradient(0, -h * 0.4, 0.5, 0, 0, w);
      gr.addColorStop(0, rgba(pal[2], 0.95)); gr.addColorStop(1, rgba(pal[0], a.mood === "scared" ? 1 : 0.75));
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, w, h, 0, Math.PI, 0);
      g.quadraticCurveTo(w * 0.5, 1.2, 0, 0.6); g.quadraticCurveTo(-w * 0.5, 1.2, -w, 0); g.fill();
      g.scale(a.dir, 1);                                       // jellies face you, not sideways
      eye(Object.assign({}, a, { dir: 1 }), -1.6, -1.6, 0.9); eye(Object.assign({}, a, { dir: 1 }), 1.6, -1.6, 0.9);
      if (a.mood === "happy") { g.fillStyle = "rgba(255,120,160,0.6)"; g.beginPath(); g.arc(-3, -0.6, 0.7, 0, TAU); g.arc(3, -0.6, 0.7, 0, TAU); g.fill(); }
    }

    function drawCrab(a, G, pal) {
      const c = "#ee5a3e", walk = Math.sin(a.phase * 2) * 0.8;
      if (a.burrow > 0.2) {                                   // dug in: just the eyes poke out
        g.fillStyle = c; g.fillRect(-1.6, -4 - (1 - a.burrow) * 2, 0.6, 2); g.fillRect(1, -4 - (1 - a.burrow) * 2, 0.6, 2);
        eye(a, -1.3, -4.5 - (1 - a.burrow) * 2, 0.9); eye(a, 1.3, -4.5 - (1 - a.burrow) * 2, 0.9);
        return;
      }
      g.strokeStyle = shade(c, -0.25); g.lineWidth = 0.6; g.lineCap = "round";
      for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * (2 + i), 0); g.lineTo(s * (4 + i), 1.5); g.lineTo(s * (4.5 + i), 3 + (i % 2 ? walk : -walk)); g.stroke(); }
      g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, 4.8, 3, 0, Math.PI, 0); g.quadraticCurveTo(0, 1.5, -4.8, 0); g.fill();
      for (const s of [-1, 1]) {                              // claws, waving
        g.save(); g.translate(s * 5.5, -2.5 + (s > 0 ? -walk : walk) * 0.5); g.rotate(s * 0.4);
        g.beginPath(); g.arc(0, 0, 1.7, 0.4, TAU - 0.4); g.lineTo(0, 0); g.fill(); g.restore();
      }
      g.fillRect(-1.6, -5, 0.6, 2.2); g.fillRect(1, -5, 0.6, 2.2);
      eye(a, -1.3, -5.3, 1); eye(a, 1.3, -5.3, 1);
      mouth(a, 0.3, -1, 0.8);
    }

    function drawShrimp(a, G, pal) {
      const c = "#ff9f80";
      g.strokeStyle = shade(c, -0.25); g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(3, -2.5); g.quadraticCurveTo(6, -6, 9, -5 + Math.sin(a.phase) * 0.8); g.stroke();
      g.beginPath(); g.moveTo(3, -2.2); g.quadraticCurveTo(6, -4, 8.5, -2 + Math.sin(a.phase + 1) * 0.8); g.stroke();
      g.strokeStyle = c; g.lineWidth = 2.2; g.lineCap = "round";
      g.beginPath(); g.arc(0, -1, 3, Math.PI * 0.85, Math.PI * 2.05); g.stroke();
      g.fillStyle = c; g.beginPath(); g.moveTo(-3, 0); g.lineTo(-4.8, 1.6); g.lineTo(-2.4, 1.4); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 0.3;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, -1, 3, Math.PI * (1.1 + i * 0.25), Math.PI * (1.12 + i * 0.25)); g.stroke(); }
      eye(a, 2.2, -2.6, 0.8);
    }

    function drawOctopus(a, G, pal) {
      const c = pal[0];
      g.strokeStyle = c; g.lineWidth = 1.5; g.lineCap = "round";
      for (let i = -3; i <= 3; i++) {
        g.beginPath(); g.moveTo(i * 1.4, -1);
        g.bezierCurveTo(i * 2.4, 1.5, i * 3.4 + Math.sin(a.phase * 0.4 + i) * 1.6, 3, i * 3.8 + Math.sin(a.phase * 0.4 + i) * 2, 2 + Math.cos(a.phase * 0.4 + i) * 1.2);
        g.stroke();
      }
      const gr = g.createRadialGradient(-2, -8, 1, 0, -5, 7);
      gr.addColorStop(0, shade(c, 0.3)); gr.addColorStop(1, c);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, -5.5, 5.2, 6, 0, 0, TAU); g.fill();
      g.fillStyle = rgba(pal[2], 0.6);
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-2.5 + i * 1.7, -9 + (i % 2), 0.55, 0, TAU); g.fill(); }
      g.scale(a.dir, 1);
      const fa = Object.assign({}, a, { dir: 1 });
      eye(fa, -2, -4.5, 1.6); eye(fa, 2, -4.5, 1.6);
      mouth(fa, 0.6, -1.6, 1.2);
      if (a.mood === "happy") { g.fillStyle = "rgba(255,120,160,0.55)"; g.beginPath(); g.arc(-3.6, -2.4, 0.9, 0, TAU); g.arc(3.6, -2.4, 0.9, 0, TAU); g.fill(); }
    }

    function drawSnail(a) {
      const pal = PALETTES[a.c.genes.pal];
      g.save(); g.translate(a.x, a.y); g.scale(a.dir * SIZE, SIZE);
      if (a.retract < 0.6) {
        g.fillStyle = "#d9c9a8";
        g.beginPath(); g.moveTo(-4, 2.4); g.quadraticCurveTo(2, 3.2, 6, 2.4); g.quadraticCurveTo(6.5, -0.5, 4.5, -0.5); g.lineTo(-3, 1); g.fill();
        g.strokeStyle = "#d9c9a8"; g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(5, -0.3); g.lineTo(5.6, -3.4); g.moveTo(4.3, -0.3); g.lineTo(4.2, -3); g.stroke();
        eye(a, 5.6, -3.6, 0.7); eye(a, 4.2, -3.2, 0.6);
      }
      const gr = g.createRadialGradient(-1, -2, 0.3, 0, -1, 4);
      gr.addColorStop(0, shade(pal[0], 0.3)); gr.addColorStop(1, shade(pal[0], -0.15));
      g.fillStyle = gr; g.beginPath(); g.arc(0, -1, 3.8, 0, TAU); g.fill();
      g.strokeStyle = shade(pal[0], -0.4); g.lineWidth = 0.45;
      g.beginPath(); for (let i = 0; i <= 30; i++) { const an = i * 0.4, rr = 3.2 - i * 0.1; const px = Math.cos(an) * rr, py = -1 + Math.sin(an) * rr; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
      if (a.retract > 0.6) { g.font = "bold 3.6px system-ui"; g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText("nope", 0, -6.5); }
      g.restore();
    }

    function drawTurtle(v) {
      g.save(); g.translate(v.x, v.y + Math.sin(v.phase * 0.4) * 2); g.scale(v.dir, 1);
      const fl = Math.sin(v.phase) * 0.6;
      g.fillStyle = "#7cc47a";
      for (const [fx_, fy, s] of [[4, 4, 1], [-5, 4, -1], [4, -4, -1], [-5, -4, 1]]) {
        g.save(); g.translate(fx_, fy * 0.7); g.rotate((fy > 0 ? 0.6 : -0.6) + fl * s);
        g.beginPath(); g.ellipse(fy > 0 ? 2 : 2, 0, 4, 1.4, 0, 0, TAU); g.fill(); g.restore();
      }
      g.beginPath(); g.ellipse(10, -0.5, 3.4, 2.6, 0, 0, TAU); g.fill();
      const gr = g.createRadialGradient(-2, -3, 1, 0, 0, 9);
      gr.addColorStop(0, "#c49a5a"); gr.addColorStop(1, "#7a5a2a");
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 8.5, 5.5, 0, 0, TAU); g.fill();
      g.strokeStyle = "rgba(60,40,15,0.6)"; g.lineWidth = 0.4;
      for (const [hx, hy] of [[0, 0], [-4, -2], [4, -2], [-4, 2.5], [4, 2.5]]) { g.beginPath(); g.arc(hx, hy, 1.8, 0, TAU); g.stroke(); }
      eye({ mood: "happy", blinkAt: 0, look: null, vx: 0, vy: 0, x: 0, y: 0, dir: 1 }, 11.3, -1.5, 0.8);
      g.restore();
    }

    function drawWhale(v) {
      g.save(); g.translate(v.x, v.y); g.scale(v.dir, 1);
      g.globalAlpha = 0.28; g.fillStyle = shade(B.bot, -0.4);
      g.beginPath(); g.ellipse(0, 0, 38, 10, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-34, 0); g.quadraticCurveTo(-44, -2 + Math.sin(v.phase * 0.5) * 3, -52, -9 + Math.sin(v.phase * 0.5) * 3);
      g.lineTo(-46, 0); g.lineTo(-52, 9 + Math.sin(v.phase * 0.5) * 3); g.quadraticCurveTo(-44, 2, -34, 0); g.fill();
      g.beginPath(); g.ellipse(4, 8, 8, 2, 0.4, 0, TAU); g.fill();
      g.globalAlpha = 0.35; g.fillStyle = "#ffffff"; g.beginPath(); g.arc(26, -2, 1, 0, TAU); g.fill();
      g.restore();
    }

    function drawSub(v) {
      g.save(); g.translate(v.x, v.y + Math.sin(v.phase * 0.5)); g.scale(v.dir, 1);
      g.save(); g.globalCompositeOperation = "lighter";      // headlight
      const gr = g.createLinearGradient(12, 0, 50, 0); gr.addColorStop(0, "rgba(255,250,200,0.35)"); gr.addColorStop(1, "rgba(255,250,200,0)");
      g.fillStyle = gr; g.beginPath(); g.moveTo(12, -1); g.lineTo(50, -10); g.lineTo(50, 10); g.lineTo(12, 1); g.fill(); g.restore();
      g.fillStyle = "#ffcc1a"; g.beginPath(); g.ellipse(0, 0, 13, 5.5, 0, 0, TAU); g.fill();
      g.fillRect(-3, -9, 6, 4); g.fillRect(1, -12, 1, 3); g.fillRect(1, -12, 3, 1);
      g.fillStyle = "#8ad8ff"; for (const px of [-6, 0, 6]) { g.beginPath(); g.arc(px, -0.5, 1.6, 0, TAU); g.fill(); }
      g.strokeStyle = "#c99a1a"; g.lineWidth = 0.5; for (const px of [-6, 0, 6]) { g.beginPath(); g.arc(px, -0.5, 1.6, 0, TAU); g.stroke(); }
      g.fillStyle = "#666"; g.save(); g.translate(-14, 0); g.scale(1, Math.cos(v.phase * 6)); g.fillRect(-0.6, -3.5, 1.2, 7); g.restore();
      g.restore();
    }

    // -------------------------------------------------------- loop, sizing, input
    function resize() {
      const cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      S = canvas.height / VH;
      W = canvas.width / S;
      build();
    }
    function frame(now) {
      const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0.001, 0.05) : 0.016;
      lastFrame = now;
      step(dt); draw();
      requestAnimationFrame(frame);
    }

    function toWorld(cx, cy) {
      const r = canvas.getBoundingClientRect();
      return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * VH];
    }
    function tap(cx, cy) {
      const [x, y] = toWorld(cx, cy);
      const d = scene.duck;
      if (Math.hypot(d.x - x, surfaceY(d.x) - 3 - y) < 8) { d.spin = 1; d.vy = -1.8; sfx("squeak"); return; }
      const ch = scene.chest;
      if (Math.abs(ch.x - x) < 8 && Math.abs(floorAt(ch.x) - 4 - y) < 8) {
        ch.opening = 2.5;
        for (let i = 0; i < 8; i++) fx.coins.push({ x: ch.x, y: floorAt(ch.x) - 6, vx: (rand() - 0.5) * 1.4, vy: -1 - rand(), life: 3 });
        for (const a of agents) if (!a.hide && Math.abs(a.x - ch.x) < 80) lookAt(a, ch.x, floorAt(ch.x), 2);
        sfx("ding"); return;
      }
      let hit = null, hd = 1e9;
      for (const a of agents) { const dd = Math.hypot(a.x - x, a.y - y); if (dd < Math.max(11, a.c.genes.len * SIZE * 0.75) && dd < hd) { hd = dd; hit = a; } }
      if (hit) {
        const k = KINDS[hit.c.kind];
        if (hit.c.kind === "puffer" && !hit.hide) { hit.puff = 1; say(hit, "hmph!", 1.5); sfx("poof"); }
        else if (hit.hide) { say(hit, "shh, hiding", 1.6); }
        else { hit.spin = 1; setMood(hit, "happy", 2); say(hit, pick(rand, HI) + " I'm " + hit.c.name, 2.2); sfx(rand() < 0.5 ? "blub" : "giggle"); }
        fx.stars.push({ x: hit.x, y: hit.y - 6, vx: 0, vy: -0.15, life: 1.3, ch: "♥" });
        onToast(hit.c.name + " · " + (hit.c.shiny ? "✨ shiny " : "") + k.label + " · " + k.rarity);
        return;
      }
      if (y > surfaceY(x) && y < floorAt(x)) {
        if (stress > 0.3) { onToast("They're too nervous to eat. Drive smoothly for a bit."); return; }
        for (let i = 0; i < 6; i++) fx.food.push({ x: x + (rand() - 0.5) * 8, y: Math.max(SURF + 2, y - 4 + rand() * 4), s: rand() * 6 });
        sfx("poke");
      }
    }

    let lastSize = "";
    new ResizeObserver(() => { const k = canvas.clientWidth + "x" + canvas.clientHeight; if (k !== lastSize) { lastSize = k; resize(); } }).observe(canvas);
    resize();
    requestAnimationFrame(frame);

    return {
      drive: (s) => { drv = s; },
      setMoving: (m) => { moving = m; },
      addCalm: (sec) => {
        save.calm += sec; streak += sec;
        while (save.calm >= CALM_GOAL) { save.calm -= CALM_GOAL; arrive(); }
        persist();
      },
      tap,
      party: () => startParty(),
      visitor: () => spawnVisitor(),
      reset: () => { save = fresh(); agents = []; streak = 0; nextParty = PARTY_FIRST; persist(); build(); onToast("New tank, four new fish."); },
      cycleBiome: () => {
        const i = BIOME_ORDER.indexOf(save.biome);
        save.biome = BIOME_ORDER[(i + 1) % BIOME_ORDER.length];
        persist(); build();
        return save.biome === "auto" ? "Auto (" + B.name + ")" : B.name;
      },
      reroll: () => { save.seed = (Math.random() * 1e9) | 0; persist(); build(); },
      biomeLabel: () => (save.biome === "auto" ? "Auto (" + B.name + ")" : B.name),
      stats: () => ({ stress, calm: save.calm, earned: save.earned, count: save.creatures.length, streak }),
    };
  }

  window.Tank = { create };
})();
