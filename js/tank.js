/* Car Buddy — Fish Tank
 * A procedurally generated aquarium that reacts to your driving.
 *   Smooth driving fills the calm meter; each full meter brings a new creature.
 *   Harsh braking, hard acceleration, sharp turns or jerky inputs scare everyone into
 *   hiding behind the rocks. Nobody is ever lost: they creep back out as you drive calmly.
 *
 * Drawn at a low resolution (180 px tall) and scaled up, so the look is chunky pixel art
 * and the same approach will port to a small ESP32 screen later.
 *
 *   const tank = Tank.create(canvas, { onToast, onHud });
 *   tank.drive({ fwd, lat, yaw, event, ready, activity })   // every motion update
 *   tank.setMoving(bool)  tank.addCalm(seconds)  tank.reset()  tank.cycleBiome()
 */
(function () {
  "use strict";

  const H = 180;                   // internal height in pixels; width follows the screen shape
  const SURF = 18;                 // resting water line
  const CALM_GOAL = 240;           // seconds of smooth driving per new creature
  const MAX_CREATURES = 24;
  const SAVE_KEY = "carbuddy.tank.v1";
  const HARD = { brake: -2.6, accel: 2.8, lat: 3.3, jerk: 7 };   // m/s², m/s³
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const lerp = (a, b, k) => a + (b - a) * k;
  const pick = (r, list) => list[(r() * list.length) | 0];
  const rand = Math.random;

  function shade(hex, k) {         // k < 0 darker, k > 0 lighter
    const f = (c) => clamp(Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k), 0, 255);
    return "#" + hexToRgb(hex).map((c) => f(c).toString(16).padStart(2, "0")).join("");
  }
  function hexToRgb(hex) { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgbStr(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }

  // ---------------------------------------------------------------- biomes
  const BIOMES = {
    reef: { name: "Coral reef", top: "#36b4e6", bot: "#0b4a86", sand: ["#ecd8a0", "#d6bd80", "#c8ad70"],
            rock: "#7a6890", plants: ["#ff6f91", "#ffa45c", "#ffd96a", "#c879ff", "#ff8fb8"], kind: "coral" },
    kelp: { name: "Kelp forest", top: "#4fb3a0", bot: "#0c3a40", sand: ["#bfae80", "#a39368", "#8f805a"],
            rock: "#6e7d77", plants: ["#6aa84f", "#8bc34a", "#4e8a32", "#a3c95a"], kind: "kelp" },
    deep: { name: "Deep sea", top: "#0d2246", bot: "#02060f", sand: ["#2f3650", "#232840", "#1b1f33"],
            rock: "#3d4868", plants: ["#3ff7d2", "#9b6bff", "#ff5fd2", "#5fd0ff"], kind: "glow", glow: true },
    ice:  { name: "Arctic", top: "#a6dcf2", bot: "#2b6896", sand: ["#f2f8fc", "#d6e7f1", "#bcd5e4"],
            rock: "#9db8cc", plants: ["#c4f3ff", "#86d8f7", "#e0fbff"], kind: "ice" },
  };
  const BIOME_ORDER = ["auto", "reef", "kelp", "deep", "ice"];

  const PALETTES = [
    ["#ff8a3d", "#ffffff", "#ffd2a8"], ["#ffd23f", "#2b59c3", "#fff4c2"], ["#4dd4ff", "#ffe14d", "#c9f3ff"],
    ["#ff4f6d", "#ffd0d8", "#ffc2cc"], ["#8a5cff", "#ffe066", "#d8c9ff"], ["#3ee08f", "#0f5e3a", "#c6f7dd"],
    ["#ff6ec7", "#6ef0ff", "#ffd1ef"], ["#f4f4f4", "#ff5a36", "#ffffff"], ["#ffb347", "#3a2a1a", "#ffe2b8"],
    ["#5a8dff", "#ff8fa3", "#cfe0ff"], ["#e8ff5a", "#2d8a4e", "#f7ffd0"], ["#ff3b3b", "#1a1a1a", "#ffb0b0"],
  ];
  const SYL = ["pip", "bo", "lu", "mo", "zi", "ka", "bu", "ni", "to", "fi", "ro", "su", "wi", "pe", "ba", "ko", "gu", "mi", "da", "jo"];
  const KIND_LABEL = { fish: "fish", snail: "snail", crab: "crab", shrimp: "shrimp", seahorse: "seahorse", jelly: "jellyfish", octopus: "octopus" };

  function makeName() {
    const s = pick(rand, SYL) + (rand() < 0.7 ? pick(rand, SYL) : "");
    return s[0].toUpperCase() + s.slice(1);
  }
  function makeGenes(kind) {
    const r = rand;
    return {
      len: kind === "fish" ? 9 + ((r() * 10) | 0) : kind === "seahorse" ? 12 : kind === "octopus" ? 14 : kind === "jelly" ? 12 : 9,
      h: 0.38 + r() * 0.34, tail: (r() * 3) | 0, fin: r() < 0.65, pattern: (r() * 4) | 0,
      pal: (r() * PALETTES.length) | 0, speed: 0.7 + r() * 0.7, school: r() < 0.7, brave: r(),
    };
  }
  function newCreature(kind) { return { kind, genes: makeGenes(kind), name: makeName(), born: Date.now() }; }

  function pickNewKind(earned) {
    const w = [["fish", 60]];
    if (earned >= 1) w.push(["snail", 10]);
    if (earned >= 2) w.push(["crab", 10], ["shrimp", 8]);
    if (earned >= 4) w.push(["seahorse", 7]);
    if (earned >= 5) w.push(["jelly", 6]);
    if (earned >= 8) w.push(["octopus", 4]);
    let t = rand() * w.reduce((s, x) => s + x[1], 0);
    for (const [k, n] of w) { if ((t -= n) < 0) return k; }
    return "fish";
  }

  // ---------------------------------------------------------------- the tank
  function create(canvas, opts) {
    const onToast = opts.onToast || function () {};
    const onHud = opts.onHud || function () {};
    const g = canvas.getContext("2d");
    let W = 320;

    let save = load();
    let biomeId = "reef", B = BIOMES.reef;
    let scene = null, bgCanvas = null, fgCanvas = null;
    let agents = [];
    let bubbles = [], puffs = [], food = [], labels = [];
    let stress = 0, inHarsh = false, moving = false, lastFwd = 0, jerk = 0;
    let drv = { fwd: 0, lat: 0, yaw: 0, event: "cruising", ready: false };
    let slosh = 0, sloshV = 0, wave = 0, shake = 0, t = 0, lastSaved = 0, lastHarshMsg = 0;
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
      const opts = m === 11 || m <= 1 ? ["reef", "kelp", "ice"] : ["reef", "kelp"];
      return pick(r, opts);
    }

    // -------------------------------------------------------- scene generation
    function floorAt(x) { return scene.floor[clamp(x | 0, 0, W - 1)]; }

    function build() {
      biomeId = save.biome === "auto" ? autoBiome() : save.biome;
      B = BIOMES[biomeId];
      const r = rng(save.seed * 7 + biomeId.length * 1013);
      const floor = new Float32Array(W);
      const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
      for (let x = 0; x < W; x++) {
        floor[x] = H - 20 + Math.sin(x / 37 + p1) * 3 + Math.sin(x / 13 + p2) * 1.2 + Math.sin(x / 71 + p3) * 4;
      }
      scene = { floor, rocks: [], back: [], front: [], bubbler: 0 };

      // Rocks — big enough to hide behind
      const nRocks = W > 360 ? 3 : 2;
      for (let i = 0; i < nRocks; i++) {
        const cx = W * (i + 0.5) / nRocks + (r() - 0.5) * W * 0.12;
        const rx = 26 + r() * 12, ry = 22 + r() * 8;
        const base = Math.min(floor[clamp(cx | 0, 0, W - 1)], H - 14);
        const pts = [];
        for (let k = 0; k < 16; k++) {
          const a = Math.PI + (k / 15) * Math.PI;           // top half of an ellipse
          const j = 0.82 + r() * 0.3;
          pts.push([cx + Math.cos(a) * rx * j, base + 4 + Math.sin(a) * ry * j]);
        }
        scene.rocks.push({ x: cx, y: base - ry * 0.45, rx, ry, base, pts });
      }
      // Plants
      const nPlants = Math.round(W / 26);
      for (let i = 0; i < nPlants; i++) {
        const x = 6 + r() * (W - 12);
        const p = { x, color: pick(r, B.plants), h: 0, phase: r() * 6, seed: (r() * 1e9) | 0 };
        if (B.kind === "kelp") p.h = 60 + r() * 90;
        else if (B.kind === "glow") p.h = 10 + r() * 16;
        else if (B.kind === "coral") p.h = 14 + r() * 22;
        else p.h = 10 + r() * 24;
        (r() < 0.75 ? scene.back : scene.front).push(p);
      }
      // a few short swaying tufts up front, for depth
      for (let i = 0; i < Math.round(W / 60); i++) {
        scene.front.push({ x: r() * W, color: shade(pick(r, B.plants), -0.15), h: 6 + r() * 8, phase: r() * 6, tuft: true, seed: 0 });
      }
      scene.bubbler = 10 + r() * (W - 20);

      bgCanvas = paintBackground(r);
      fgCanvas = paintRocks(r);
      spawnAgents();
    }

    function paintBackground(r) {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d");
      const grd = x.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, B.top); grd.addColorStop(1, B.bot);
      x.fillStyle = grd; x.fillRect(0, 0, W, H);
      // far silhouettes for depth
      x.fillStyle = rgbStr(hexToRgb(B.bot), 0.45);
      for (let i = 0; i < W; i += 2) {
        const hh = 18 + Math.sin(i / 23 + 1) * 8 + Math.sin(i / 9) * 3;
        x.fillRect(i, H - 30 - hh, 2, hh + 12);
      }
      // static corals / crystals in the back layer
      for (const p of scene.back) {
        if (B.kind === "coral") drawCoral(x, p, rng(p.seed));
        if (B.kind === "ice") drawCrystal(x, p, rng(p.seed));
      }
      // sand, dithered
      for (let i = 0; i < W; i++) {
        const top = scene.floor[i] | 0;
        for (let y = top; y < H; y++) {
          const n = (i * 7 + y * 13 + ((i * y) % 5)) % 9;
          x.fillStyle = y === top ? shade(B.sand[0], 0.25) : n < 5 ? B.sand[0] : n < 8 ? B.sand[1] : B.sand[2];
          x.fillRect(i, y, 1, 1);
        }
      }
      // pebbles and shells
      for (let i = 0; i < W / 9; i++) {
        const px = r() * W, py = scene.floor[px | 0] + 2 + r() * 12;
        x.fillStyle = pick(r, [B.sand[2], shade(B.rock, -0.1), "#ffffff99", shade(B.sand[1], -0.25)]);
        x.fillRect(px | 0, py | 0, 1 + ((r() * 2) | 0), 1);
      }
      return c;
    }

    function drawCoral(x, p, r) {
      x.strokeStyle = p.color; x.lineCap = "round";
      const branch = (bx, by, ang, len, w, d) => {
        const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        x.lineWidth = w; x.beginPath(); x.moveTo(bx, by); x.lineTo(ex, ey); x.stroke();
        if (d > 0) {
          branch(ex, ey, ang - 0.3 - r() * 0.4, len * 0.72, Math.max(1, w - 0.7), d - 1);
          branch(ex, ey, ang + 0.3 + r() * 0.4, len * 0.72, Math.max(1, w - 0.7), d - 1);
        } else { x.fillStyle = shade(p.color, 0.35); x.fillRect(ex - 0.5, ey - 0.5, 1.5, 1.5); }
      };
      const base = scene.floor[clamp(p.x | 0, 0, W - 1)] + 2;
      if (r() < 0.5) branch(p.x, base, -Math.PI / 2, p.h * 0.4, 3, 3);
      else {                                  // brain / table coral
        x.fillStyle = p.color; x.beginPath(); x.ellipse(p.x, base - 3, p.h * 0.45, p.h * 0.25, 0, Math.PI, 0); x.fill();
        x.strokeStyle = shade(p.color, -0.2); x.lineWidth = 1;
        for (let k = 1; k < 4; k++) { x.beginPath(); x.ellipse(p.x, base - 3, p.h * 0.45 * k / 4, p.h * 0.25 * k / 4, 0, Math.PI, 0); x.stroke(); }
      }
    }
    function drawCrystal(x, p, r) {
      const base = scene.floor[clamp(p.x | 0, 0, W - 1)] + 2;
      for (let k = 0; k < 3; k++) {
        const w = 2 + r() * 3, hh = p.h * (0.5 + r() * 0.5), ox = (r() - 0.5) * 8, lean = (r() - 0.5) * 6;
        x.fillStyle = k % 2 ? p.color : shade(p.color, -0.18);
        x.beginPath(); x.moveTo(p.x + ox - w, base); x.lineTo(p.x + ox + lean, base - hh); x.lineTo(p.x + ox + w, base); x.fill();
        x.fillStyle = "#ffffffaa"; x.fillRect(p.x + ox + lean * 0.6 - 0.5, base - hh * 0.8, 1, hh * 0.4);
      }
    }

    function paintRocks(r) {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d");
      for (const k of scene.rocks) {
        x.fillStyle = B.rock;
        x.beginPath(); x.moveTo(k.pts[0][0], k.base + 6);
        for (const p of k.pts) x.lineTo(p[0], p[1]);
        x.lineTo(k.pts[k.pts.length - 1][0], k.base + 6); x.closePath(); x.fill();
        // shading: highlight upper-left, shadow lower-right, a few cracks and moss
        x.save(); x.clip();
        x.fillStyle = shade(B.rock, 0.22);
        x.beginPath(); x.ellipse(k.x - k.rx * 0.35, k.y - k.ry * 0.35, k.rx * 0.55, k.ry * 0.4, -0.3, 0, Math.PI * 2); x.fill();
        x.fillStyle = shade(B.rock, -0.3);
        x.beginPath(); x.ellipse(k.x + k.rx * 0.4, k.base + 2, k.rx * 0.7, k.ry * 0.45, 0, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < 26; i++) {
          x.fillStyle = r() < 0.5 ? shade(B.rock, -0.18) : shade(B.rock, 0.1);
          x.fillRect((k.x - k.rx + r() * k.rx * 2) | 0, (k.base - k.ry + r() * k.ry * 1.4) | 0, 1, 1);
        }
        if (B.kind !== "ice") {
          x.fillStyle = B.kind === "glow" ? "#3ff7d255" : "#5fa84a88";
          for (let i = 0; i < 18; i++) {
            const a = Math.PI + 0.3 + r() * (Math.PI - 0.6);
            x.fillRect((k.x + Math.cos(a) * k.rx * 0.8) | 0, (k.base + 4 + Math.sin(a) * k.ry * 0.85) | 0, 2, 1);
          }
        } else {
          x.fillStyle = "#ffffffcc";
          x.fillRect(k.x - k.rx * 0.6, k.base + 4 - k.ry * 0.95, k.rx * 1.1, 2);
        }
        x.restore();
      }
      return c;
    }

    // -------------------------------------------------------- creatures in the scene
    function spawnAgents() {
      agents = save.creatures.map((c, i) => {
        const old = agents.find((a) => a.c === c);
        if (old) { old.x = Math.min(old.x, W - 6); old.hide = null; return old; }
        return makeAgent(c, i, false);
      });
    }
    function makeAgent(c, i, dropIn) {
      const a = { c, x: 20 + rand() * (W - 40), y: SURF + 15 + rand() * (H - 70), vx: (rand() - 0.5), vy: 0,
                  dir: rand() < 0.5 ? -1 : 1, phase: rand() * 6, wander: rand() * 6, hide: null, hidden: false,
                  arrive: dropIn ? 1 : 0, retract: 0 };
      if (c.kind === "crab" || c.kind === "shrimp" || c.kind === "octopus") a.y = floorAt(a.x) - 3;
      if (c.kind === "snail") { a.y = SURF + 20 + rand() * (H - 70); }
      if (dropIn) { a.y = SURF - 6; a.vy = 1.2; a.x = 30 + rand() * (W - 60); }
      return a;
    }
    const isSwimmer = (k) => k === "fish" || k === "seahorse" || k === "jelly";
    const isWalker = (k) => k === "crab" || k === "shrimp" || k === "octopus";

    function hideSpot(a) {
      let best = scene.rocks[0], bd = 1e9;
      for (const k of scene.rocks) { const d = Math.abs(k.x - a.x); if (d < bd) { bd = d; best = k; } }
      const L = a.c.genes.len;
      return { rock: best, ox: (rand() - 0.5) * Math.max(0, best.rx * 1.2 - L), oy: (rand() - 0.2) * best.ry * 0.3,
               side: a.x < best.x ? -1 : 1 };
    }

    // -------------------------------------------------------- driving input
    function driveInput(s) {
      drv = s;
      if (!s.ready) return;
    }

    function step(dt) {
      t += dt;
      const s = drv;
      const fwd = s.ready ? s.fwd : 0, lat = s.ready ? s.lat : 0;

      // jerk (how suddenly the push changes) — catches stabbing the pedals
      const j = (fwd - lastFwd) / Math.max(dt, 0.001); lastFwd = fwd;
      jerk += (1 - Math.exp(-dt / 0.15)) * (j - jerk);

      let harsh = 0, why = "";
      if (fwd < HARD.brake) { harsh = Math.max(harsh, 0.5 + (HARD.brake - fwd) / 2); why = "hard braking"; }
      if (fwd > HARD.accel) { harsh = Math.max(harsh, 0.5 + (fwd - HARD.accel) / 2); why = why || "hard acceleration"; }
      if (Math.abs(lat) > HARD.lat) { harsh = Math.max(harsh, 0.5 + (Math.abs(lat) - HARD.lat) / 2); why = why || "a sharp turn"; }
      if (Math.abs(jerk) > HARD.jerk && moving) { harsh = Math.max(harsh, 0.45); why = why || "a jerky move"; }

      if (harsh > 0 && !inHarsh) scare(harsh, why);
      inHarsh = harsh > 0;
      if (inHarsh) stress = Math.max(stress, 0.6);
      else stress = Math.max(0, stress - dt * (moving ? 0.028 : 0.05));   // ~20 s to settle after one scare

      // calm meter: only fills while actually driving smoothly
      if (moving && stress < 0.12 && !inHarsh) addCalm(dt);

      // bumps: everyone hops, sand puffs up
      if (s.event === "BUMP" && !step.bumped) bump();
      step.bumped = s.event === "BUMP";

      // water slosh: a damped spring pushed by sideways force (contents swing opposite the turn)
      const target = clamp(-lat * 1.6, -9, 9) * (RM ? 0.4 : 1);
      sloshV += ((target - slosh) * 14 - sloshV * 3.2) * dt;
      slosh += sloshV * dt;
      wave = Math.max(0, wave - dt * 1.5);
      shake = Math.max(0, shake - dt * 3);

      updateAgents(dt, lat, fwd);
      updateParticles(dt);

      if (performance.now() - lastSaved > 10000) { lastSaved = performance.now(); persist(); }
      onHud({ calm: save.calm / CALM_GOAL, count: save.creatures.length, stress, biome: B.name, jerk, fwd, lat, moving });
    }

    function scare(level, why) {
      stress = clamp(stress + 0.45 + level * 0.2, 0, 1);
      save.calm = Math.max(0, save.calm - 20);
      wave = 1; shake = RM ? 0 : 0.6;
      for (const a of agents) { a.vx += (rand() - 0.5) * 3; a.vy += (rand() - 0.5) * 2; }
      for (let i = 0; i < 14; i++) bubbles.push({ x: rand() * W, y: H - 30 - rand() * 60, r: 1 + rand() * 1.5, vy: -0.6 - rand() });
      const now = performance.now();
      if (now - lastHarshMsg > 6000) { lastHarshMsg = now; onToast("Eek, " + why + "! Everyone's hiding."); }
    }

    function bump() {
      shake = RM ? 0 : 0.8; wave = Math.max(wave, 0.7);
      for (const a of agents) a.vy -= isWalker(a.c.kind) ? 1.6 : 1.1;
      for (let i = 0; i < 40; i++) {
        const x = rand() * W;
        puffs.push({ x, y: floorAt(x) - 1, vx: (rand() - 0.5) * 0.8, vy: -0.4 - rand() * 1.2, life: 1, col: pick(rand, B.sand) });
      }
    }

    function addCalm(sec) {
      save.calm += sec;
      while (save.calm >= CALM_GOAL) { save.calm -= CALM_GOAL; arrive(); }
    }

    function arrive() {
      save.earned++;
      if (save.creatures.length >= MAX_CREATURES) { onToast("Smooth driving! The tank is full — everyone's happy."); persist(); return; }
      const c = newCreature(pickNewKind(save.earned));
      save.creatures.push(c);
      const a = makeAgent(c, agents.length, true);
      agents.push(a);
      for (let i = 0; i < 18; i++) bubbles.push({ x: a.x + (rand() - 0.5) * 10, y: SURF + rand() * 6, r: 1 + rand() * 1.5, vy: -0.2 - rand() * 0.4 });
      labels.push({ a, text: c.name + " the " + KIND_LABEL[c.kind], life: 4 });
      onToast("Smooth driving! " + c.name + " the " + KIND_LABEL[c.kind] + " joined the tank.");
      persist();
    }

    // -------------------------------------------------------- behaviour
    function updateAgents(dt, lat, fwd) {
      const k = dt * 60;
      const pushX = -lat * 0.012 * (RM ? 0.5 : 1);             // inertia: things slide opposite the turn
      const pushY = Math.max(0, -fwd) * 0.004;                  // braking tips everyone down a little
      for (const a of agents) {
        const G = a.c.genes, kind = a.c.kind;
        const threshold = 0.2 + G.brave * 0.25;
        const wantHide = stress > threshold;
        if (wantHide && !a.hide) a.hide = hideSpot(a);
        if (!wantHide && a.hide) { a.hide = null; a.hidden = false; }
        const peek = a.hide && stress < threshold + 0.12;

        a.phase += dt * (4 + Math.hypot(a.vx, a.vy) * 6);
        if (a.arrive > 0) a.arrive = Math.max(0, a.arrive - dt * 0.6);

        if (kind === "snail") { updateSnail(a, dt, wantHide); continue; }

        let ax = 0, ay = 0;
        if (a.hide) {
          const R = a.hide.rock;
          let tx = R.x + a.hide.ox, ty = isWalker(kind) ? floorAt(R.x) - 3 : R.y + a.hide.oy;
          if (peek) tx = R.x + a.hide.side * (R.rx * 0.95);
          const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
          const sp = (isWalker(kind) ? 0.5 : 1.4) * G.speed;
          ax += (dx / d * sp - a.vx) * 0.12; ay += (dy / d * sp - a.vy) * 0.12;
          if (d < 3) { a.vx *= 0.8; a.vy *= 0.8; a.hidden = true; }
          if (peek && d < 4) a.dir = -a.hide.side;     // face out, eyes peeking past the rock
        } else if (isSwimmer(kind)) {
          a.wander += (rand() - 0.5) * 0.25 * k;
          const sp = (kind === "fish" ? 0.55 : kind === "seahorse" ? 0.15 : 0.12) * G.speed;
          ax += Math.cos(a.wander) * sp * 0.05; ay += Math.sin(a.wander) * sp * 0.025;
          if (kind === "fish" && G.school) {           // boids: cohesion, alignment, separation
            let cx = 0, cy = 0, avx = 0, avy = 0, n = 0, sx = 0, sy = 0;
            for (const b of agents) {
              if (b === a || b.c.kind !== "fish" || b.hide) continue;
              const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
              if (d2 < 900) { cx += b.x; cy += b.y; avx += b.vx; avy += b.vy; n++; }
              if (d2 < 64) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
            }
            if (n) { ax += (cx / n - a.x) * 0.0008 + (avx / n - a.vx) * 0.03; ay += (cy / n - a.y) * 0.0008 + (avy / n - a.vy) * 0.03; }
            ax += sx * 0.5; ay += sy * 0.5;
          }
          if (kind === "jelly") ay += Math.sin(a.phase * 0.25) < -0.6 ? -0.03 : 0.006;   // pulse up, sink slowly
          if (kind === "seahorse") ay += Math.sin(t * 1.3 + a.wander) * 0.004;
          // food
          let best = null, bd = 1e9;
          for (const f of food) { const d = Math.hypot(f.x - a.x, f.y - a.y); if (d < bd) { bd = d; best = f; } }
          if (best && bd < 120 && kind === "fish") {
            ax += (best.x - a.x) / bd * 0.04; ay += (best.y - a.y) / bd * 0.04;
            if (bd < 3) { best.eaten = true; }
          }
          // soft walls
          const top = SURF + 8, bot = floorAt(a.x) - 6;
          if (a.x < 12) ax += 0.04; if (a.x > W - 12) ax -= 0.04;
          if (a.y < top) ay += 0.05; if (a.y > bot) ay -= 0.06;
        } else {                                        // walkers on the sand
          a.wander += (rand() - 0.5) * 0.08 * k;
          const sp = (kind === "octopus" ? 0.12 : kind === "shrimp" ? 0.22 : 0.3) * G.speed;
          ax += (Math.cos(a.wander) * sp - a.vx) * 0.05;
          if (kind === "shrimp" && rand() < 0.004 * k) a.vy -= 1.2;    // little hops
          if (a.x < 8) ax += 0.05; if (a.x > W - 8) ax -= 0.05;
        }

        ax += pushX * (isWalker(kind) ? 0.4 : 1); ay += pushY;
        a.vx += ax * k; a.vy += ay * k;
        if (isWalker(kind)) {                           // gravity and ground
          a.vy += 0.08 * k;
          const gy = floorAt(a.x) - 3;
          if (a.y >= gy) { a.y = gy; a.vy = Math.min(0, a.vy); }
        }
        const max = (a.hide ? 2.2 : kind === "fish" ? 1.1 : 0.6) * G.speed + Math.abs(pushX) * 20;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > max) { a.vx *= max / sp; a.vy *= max / sp; }
        a.vx *= Math.pow(0.985, k); a.vy *= Math.pow(isSwimmer(kind) ? 0.97 : 0.995, k);
        a.x = clamp(a.x + a.vx * k, 4, W - 4);
        a.y = clamp(a.y + a.vy * k, SURF + 4, H - 6);
        if (Math.abs(a.vx) > 0.05 && !(a.hide && peek)) a.dir = a.vx > 0 ? 1 : -1;
      }
      food = food.filter((f) => !f.eaten && f.y < floorAt(f.x));
    }

    function updateSnail(a, dt, wantHide) {
      // snails stick to the front glass; when scared they just pull into their shell
      a.retract = clamp(a.retract + (wantHide ? dt * 4 : -dt * 0.6), 0, 1);
      if (a.retract > 0.3) return;
      a.wander += (rand() - 0.5) * 0.05;
      a.x = clamp(a.x + Math.cos(a.wander) * 0.06 * dt * 60, 8, W - 8);
      a.y = clamp(a.y + Math.sin(a.wander) * 0.04 * dt * 60, SURF + 10, H - 30);
      a.dir = Math.cos(a.wander) > 0 ? 1 : -1;
    }

    function updateParticles(dt) {
      const k = dt * 60;
      if (rand() < 0.12 * k) bubbles.push({ x: scene.bubbler + (rand() - 0.5) * 2, y: floorAt(scene.bubbler) - 2, r: 0.6 + rand() * 1.4, vy: -0.35 - rand() * 0.3 });
      for (const b of bubbles) { b.y += b.vy * k; b.x += Math.sin(b.y * 0.15 + b.r) * 0.15 * k - slosh * 0.004 * k; }
      bubbles = bubbles.filter((b) => b.y > surfaceY(b.x) + 1).slice(-160);
      for (const p of puffs) { p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.02 * k; p.life -= dt * 0.7; }
      puffs = puffs.filter((p) => p.life > 0);
      for (const f of food) { f.y += 0.18 * k; f.x += Math.sin(t * 2 + f.s) * 0.05 * k - slosh * 0.003 * k; }
      for (const l of labels) l.life -= dt;
      labels = labels.filter((l) => l.life > 0);
    }

    function surfaceY(x) {
      return SURF - slosh * ((x / W) - 0.5) * 2 + Math.sin(x / 9 + t * 2.2) * (0.6 + wave * 2) + Math.sin(x / 23 - t * 1.3) * 0.6;
    }

    // -------------------------------------------------------- drawing
    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      const sx = shake ? (rand() - 0.5) * shake * 4 : 0, sy = shake ? (rand() - 0.5) * shake * 3 : 0;
      g.translate(sx | 0, sy | 0);
      g.drawImage(bgCanvas, 0, 0);
      drawRays();
      for (const p of scene.back) drawPlant(p);
      drawBubbles();
      for (const f of food) { g.fillStyle = "#c8742a"; g.fillRect(f.x | 0, f.y | 0, 1, 1); }
      for (const a of agents) if (a.c.kind !== "snail") drawAgent(a);
      g.drawImage(fgCanvas, 0, 0);
      for (const p of scene.front) drawPlant(p);
      for (const p of puffs) { g.globalAlpha = Math.min(1, p.life); g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, 1, 1); }
      g.globalAlpha = 1;
      drawSurface();
      for (const a of agents) if (a.c.kind === "snail") drawSnail(a);   // on the glass, in front of everything
      // murk when the tank is stressed
      if (stress > 0.05) { g.fillStyle = `rgba(60,70,60,${stress * 0.22})`; g.fillRect(0, 0, W, H); }
      // glass glare
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.beginPath(); g.moveTo(W * 0.08, 0); g.lineTo(W * 0.16, 0); g.lineTo(W * 0.04, H); g.lineTo(-W * 0.04, H); g.fill();
      for (const l of labels) {
        g.globalAlpha = Math.min(1, l.life);
        g.font = "7px system-ui, sans-serif"; g.textAlign = "center";
        const ty = Math.max(SURF + 8, l.a.y - 10);
        g.fillStyle = "#000a"; const tw = g.measureText(l.text).width + 6;
        g.fillRect((l.a.x - tw / 2) | 0, ty - 7, tw | 0, 9);
        g.fillStyle = "#fff"; g.fillText(l.text, l.a.x | 0, ty);
      }
      g.globalAlpha = 1;
    }

    function drawRays() {
      g.save();
      g.globalCompositeOperation = "lighter";
      const n = 4;
      for (let i = 0; i < n; i++) {
        const base = W * (i + 0.5) / n + (RM ? 0 : Math.sin(t * 0.15 + i * 2) * 20);
        g.fillStyle = B.glow ? "rgba(80,140,255,0.03)" : "rgba(255,255,255,0.045)";
        g.beginPath(); g.moveTo(base - 6, SURF); g.lineTo(base + 6, SURF);
        g.lineTo(base + 40, H); g.lineTo(base + 12, H); g.fill();
      }
      g.restore();
    }

    function drawPlant(p) {
      const base = floorAt(p.x) + 2;
      const sway = (seg, i) => (RM ? 0.3 : 1) * (Math.sin(t * 0.9 + p.phase + i * 0.45) * i * 0.35) + slosh * i * 0.08;
      if (B.kind === "kelp" || p.tuft) {
        const segs = Math.max(2, (p.h / 6) | 0);
        let x = p.x, y = base;
        g.strokeStyle = p.color; g.lineWidth = p.tuft ? 1 : 2; g.lineCap = "round";
        g.beginPath(); g.moveTo(x, y);
        const pts = [];
        for (let i = 1; i <= segs; i++) { x = p.x + sway(0, i); y = base - i * (p.h / segs); g.lineTo(x, y); pts.push([x, y]); }
        g.stroke();
        if (!p.tuft) {
          g.fillStyle = shade(p.color, 0.12);
          pts.forEach((q, i) => { if (i % 2 === 0) { g.beginPath(); g.ellipse(q[0] + (i % 4 ? 3 : -3), q[1], 3, 1.2, i % 4 ? 0.5 : -0.5, 0, Math.PI * 2); g.fill(); } });
          g.fillStyle = "#d9b24a"; if (pts.length > 3) g.fillRect(pts[2][0] | 0, pts[2][1] | 0, 2, 2);   // little float bulb
        }
      } else if (B.kind === "glow") {
        g.save(); g.globalCompositeOperation = "lighter";
        g.strokeStyle = p.color; g.lineWidth = 1;
        for (let k = -3; k <= 3; k++) {
          g.beginPath(); g.moveTo(p.x, base);
          const tipX = p.x + k * 2.2 + Math.sin(t * 1.5 + p.phase + k) * 2 + slosh * 0.3;
          g.quadraticCurveTo(p.x + k * 1.2, base - p.h * 0.6, tipX, base - p.h + Math.abs(k));
          g.stroke();
          g.fillStyle = p.color; g.fillRect(tipX | 0, (base - p.h + Math.abs(k)) | 0, 1, 1);
        }
        g.restore();
      } else if (B.kind === "coral" || B.kind === "ice") {
        // front-layer coral/ice: small sea fan that sways a touch
        if (scene.back.includes(p)) return;     // back ones are painted into the background
        g.strokeStyle = p.color; g.lineWidth = 1;
        for (let k = -2; k <= 2; k++) {
          g.beginPath(); g.moveTo(p.x, base);
          g.lineTo(p.x + k * 3 + Math.sin(t + p.phase) * 1, base - p.h * (0.6 + 0.1 * (2 - Math.abs(k))));
          g.stroke();
        }
      }
    }

    function drawBubbles() {
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 0.6;
      for (const b of bubbles) {
        if (b.r < 1) { g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(b.x | 0, b.y | 0, 1, 1); continue; }
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke();
      }
    }

    function drawSurface() {
      // air above the water, with the tank rim
      g.fillStyle = B.glow ? "#05080f" : "#0e1a24";
      g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
      for (let x = W; x >= 0; x -= 4) g.lineTo(x, surfaceY(x));
      g.closePath(); g.fill();
      g.strokeStyle = B.glow ? "rgba(120,170,255,0.5)" : "rgba(220,245,255,0.75)"; g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= W; x += 4) { const y = surfaceY(x); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = "#1c2a36"; g.fillRect(0, 0, W, 3);
    }

    // ---- creature sprites (all procedural, drawn in a local frame facing right)
    function drawAgent(a) {
      const G = a.c.genes, pal = PALETTES[G.pal];
      g.save();
      g.translate(Math.round(a.x), Math.round(a.y));
      if (a.arrive > 0) g.globalAlpha = 1 - a.arrive * 0.5;
      if (B.glow) { g.shadowColor = pal[1]; g.shadowBlur = 5; }
      g.scale(a.dir, 1);
      const K = a.c.kind;
      if (K === "fish") drawFish(G, pal, a);
      else if (K === "seahorse") drawSeahorse(G, pal, a);
      else if (K === "jelly") drawJelly(G, pal, a);
      else if (K === "crab") drawCrab(G, pal, a);
      else if (K === "shrimp") drawShrimp(G, pal, a);
      else if (K === "octopus") drawOctopus(G, pal, a);
      g.restore();
    }

    function eye(x, y, big) {
      g.shadowBlur = 0;
      g.fillStyle = "#fff"; g.fillRect(x - 1, y - 1, big ? 3 : 2, big ? 3 : 2);
      g.fillStyle = "#111"; g.fillRect(x, y, 1, 1);
    }

    function drawFish(G, pal, a) {
      const L = G.len, hh = L * G.h, flap = Math.sin(a.phase) * hh * 0.25;
      g.fillStyle = pal[1];
      // tail: 0 fan, 1 fork, 2 long flowing
      g.beginPath();
      const tx = -L * 0.42, tl = G.tail === 2 ? L * 0.55 : L * 0.32;
      g.moveTo(tx, 0);
      g.lineTo(tx - tl, -hh * 0.55 + flap);
      if (G.tail === 1) g.lineTo(tx - tl * 0.55, flap * 0.5);
      g.lineTo(tx - tl, hh * 0.55 + flap);
      g.closePath(); g.fill();
      if (G.fin) { g.beginPath(); g.moveTo(-L * 0.2, -hh * 0.4); g.lineTo(L * 0.05, -hh * 0.95); g.lineTo(L * 0.18, -hh * 0.4); g.fill(); }
      // body
      g.fillStyle = pal[0];
      g.beginPath(); g.ellipse(0, 0, L / 2, hh / 2, 0, 0, Math.PI * 2); g.fill();
      g.save(); g.clip(); g.shadowBlur = 0;
      if (G.pattern === 1) { g.fillStyle = pal[1]; for (let i = -1; i <= 1; i++) g.fillRect(i * L * 0.22 - 1, -hh, 2, hh * 2); }
      else if (G.pattern === 2) { g.fillStyle = pal[1]; for (let i = 0; i < 5; i++) g.fillRect(((i * 37) % L) - L / 2, ((i * 23) % hh) - hh / 2, 1.5, 1.5); }
      else if (G.pattern === 3) { g.fillStyle = pal[2]; g.fillRect(-L / 2, hh * 0.05, L, hh); }
      g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-L * 0.3, -hh * 0.42, L * 0.5, 1);
      g.restore();
      eye(L * 0.26, -hh * 0.12, L > 14);
    }

    function drawSeahorse(G, pal, a) {
      const bob = Math.sin(a.phase * 0.3) * 0.6;
      g.fillStyle = pal[0];
      g.beginPath(); g.ellipse(0, -5 + bob, 3, 2.4, 0, 0, Math.PI * 2); g.fill();      // head
      g.fillRect(2, -6 + bob, 3, 1.5);                                                  // snout
      g.beginPath(); g.ellipse(-1, 0 + bob, 2.6, 4, 0.2, 0, Math.PI * 2); g.fill();     // belly
      g.strokeStyle = pal[0]; g.lineWidth = 1.6; g.beginPath();
      g.moveTo(-2, 3 + bob); g.quadraticCurveTo(-3, 7, 0, 7.5); g.quadraticCurveTo(1.5, 6, 0, 5.5); g.stroke();  // curly tail
      g.fillStyle = pal[1]; g.fillRect(-4, -3 + bob, 1, 4);                             // back fin
      g.fillStyle = pal[2]; g.fillRect(0, -1 + bob, 1, 3);
      eye(1, -6 + bob, false);
    }

    function drawJelly(G, pal, a) {
      const p = Math.sin(a.phase * 0.25), w = 5 + p * 0.8, h = 4 - p * 0.6;
      g.globalAlpha *= 0.85;
      g.fillStyle = pal[0];
      g.beginPath(); g.ellipse(0, 0, w, h, 0, Math.PI, 0); g.fill();
      g.fillStyle = pal[2]; g.fillRect(-w + 1, -1, w * 2 - 2, 1);
      g.strokeStyle = pal[1]; g.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 2, 0);
        g.quadraticCurveTo(i * 2 + Math.sin(a.phase * 0.5 + i) * 2, 5, i * 2 + Math.sin(a.phase * 0.5 + i + 1) * 1.5, 9 + Math.abs(i));
        g.stroke();
      }
    }

    function drawCrab(G, pal, a) {
      const c = "#e8553b", walk = Math.sin(a.phase * 2) * 0.8;
      g.strokeStyle = shade(c, -0.2); g.lineWidth = 0.8;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 2, 0); g.lineTo(i * 3 - 1, 3 + (i % 2 ? walk : -walk)); g.stroke(); }
      g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, 4.5, 2.6, 0, Math.PI, 0); g.fill(); g.fillRect(-4.5, -0.5, 9, 1.5);
      g.fillRect(-7, -4 + walk * 0.5, 2.5, 2); g.fillRect(4.5, -4 - walk * 0.5, 2.5, 2);   // claws
      g.fillStyle = "#111"; g.fillRect(-1.5, -4, 1, 1); g.fillRect(1, -4, 1, 1);
    }

    function drawShrimp(G, pal, a) {
      const c = "#ff9f80";
      g.strokeStyle = c; g.lineWidth = 2;
      g.beginPath(); g.arc(0, -1, 3, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
      g.strokeStyle = shade(c, -0.25); g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(3, -2); g.lineTo(7, -5 + Math.sin(a.phase) * 0.6); g.stroke();
      g.fillStyle = "#111"; g.fillRect(2, -3, 1, 1);
    }

    function drawOctopus(G, pal, a) {
      const c = pal[0];
      g.strokeStyle = c; g.lineWidth = 1.4;
      for (let i = -3; i <= 3; i++) {
        g.beginPath(); g.moveTo(i * 1.4, -1);
        g.quadraticCurveTo(i * 2.6, 2, i * 3.2 + Math.sin(a.phase * 0.4 + i) * 1.4, 3 + Math.cos(a.phase * 0.4 + i));
        g.stroke();
      }
      g.fillStyle = c; g.beginPath(); g.ellipse(0, -5, 5, 5.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal[2]; g.fillRect(-2, -8, 2, 1);
      eye(-2, -4, true); eye(2, -4, true);
    }

    function drawSnail(a) {
      const G = a.c.genes, pal = PALETTES[G.pal];
      g.save(); g.translate(Math.round(a.x), Math.round(a.y)); g.scale(a.dir, 1);
      if (a.retract < 0.6) {
        g.fillStyle = "#d7c7a8"; g.fillRect(-3, 1, 9, 2);
        g.fillRect(5, -1, 1, 2); g.fillRect(4, -2, 1, 3);                // eye stalks
      }
      g.fillStyle = pal[0]; g.beginPath(); g.arc(0, -1, 3.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = shade(pal[0], -0.35); g.lineWidth = 0.8;
      g.beginPath(); g.arc(0, -1, 2.2, 0, Math.PI * 1.6); g.stroke();
      g.fillStyle = "#ffffff55"; g.fillRect(-2, -4, 2, 1);
      g.restore();
    }

    // -------------------------------------------------------- loop, sizing, input
    function resize() {
      const ratio = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      W = clamp(Math.round(H * ratio), 160, 480);
      canvas.width = W; canvas.height = H;
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
      return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H];
    }
    function tap(cx, cy) {
      const [x, y] = toWorld(cx, cy);
      let hit = null, hd = 1e9;
      for (const a of agents) { const d = Math.hypot(a.x - x, a.y - y); if (d < Math.max(8, a.c.genes.len * 0.7) && d < hd) { hd = d; hit = a; } }
      if (hit) { labels = labels.filter((l) => l.a !== hit); labels.push({ a: hit, text: hit.c.name + " the " + KIND_LABEL[hit.c.kind], life: 2.5 }); return; }
      if (y > surfaceY(x) && y < floorAt(x)) {
        if (stress > 0.3) { onToast("They're too nervous to eat. Drive smoothly for a bit."); return; }
        for (let i = 0; i < 5; i++) food.push({ x: x + (rand() - 0.5) * 8, y: Math.max(SURF + 2, y - 4 + rand() * 4), s: rand() * 6 });
      }
    }

    let lastSize = "";
    new ResizeObserver(() => { const k = canvas.clientWidth + "x" + canvas.clientHeight; if (k !== lastSize) { lastSize = k; resize(); } }).observe(canvas);
    resize();
    requestAnimationFrame(frame);

    return {
      drive: driveInput,
      setMoving: (m) => { moving = m; },
      addCalm: (sec) => { addCalm(sec); persist(); },
      tap,
      reset: () => { save = fresh(); agents = []; persist(); build(); onToast("New tank, four new fish."); },
      cycleBiome: () => {
        const i = BIOME_ORDER.indexOf(save.biome);
        save.biome = BIOME_ORDER[(i + 1) % BIOME_ORDER.length];
        persist(); build();
        return save.biome === "auto" ? "Auto (" + B.name + ")" : B.name;
      },
      reroll: () => { save.seed = (Math.random() * 1e9) | 0; persist(); build(); },
      biomeLabel: () => (save.biome === "auto" ? "Auto (" + B.name + ")" : B.name),
      scareTest: () => scare(1, "hard braking"),
      stats: () => ({ stress, calm: save.calm, earned: save.earned, count: save.creatures.length }),
    };
  }

  window.Tank = { create };
})();
