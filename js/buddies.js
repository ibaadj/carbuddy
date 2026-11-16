/* Car Buddy characters.
 *   Buddies.list                    → [{ id, name, ... }]  dog, ghost, santa, sasquatch, dumpling, radish
 *   Buddies.get(id)
 *   Buddies.draw(ctx, buddy, pose)  ctx scaled so 1 unit = 1 drawing unit (all buddies share Buddies.viewBox)
 *   Buddies.point(buddy, {x, y}, hatOn) → where a drawing point ends up (the buddy shrinks a little under a hat)
 *
 * pose: { eyes, mouth: null | "o" | "sing", sing: 0..1 (mouth openness), earL, earR (degrees of swing for
 *         ears / leaves / arms / tufts), spin (s), t (s), hat: bool }
 * Each buddy: { eyes: [{x,y,r} x2], nose: {x,y,r} (the BOOP spot), mouth: {x,y}, hat: {x,y,w,rot} | null,
 *               palette (for the ASCII renderer), say: { word, sound } }
 */
(function () {
  "use strict";
  const INK = "#141010", WHITE = "#FFF8EE", HAT_RED = "#D63A3A", HAT_DARK = "#A82828", BLUSH = "#F29BB0";
  const VB = window.Dog.viewBox;                       // x -260, y -60, w 1820, h 1265
  const CX = 650, BOTTOM = VB.y + VB.h;
  const TAU = Math.PI * 2;
  const rad = (d) => (d * Math.PI) / 180;
  const HAT_FIT = 0.86;                                // shrink toward the bottom to make room for a hat
  const HAT_COLORS = [[HAT_RED, "#FF4B4B"], [HAT_DARK, "#C93030"]];

  function circle(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, fill, rot) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill(); }
  function stroke(ctx, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); }

  // ---- shared eyes (everything except the dog, whose eyes come from the drawing)
  function eye(ctx, e, state, spin, side, skin) {
    const { x, y, r } = e;
    switch (state) {
      case "wide":
        circle(ctx, x, y, r * 1.2, INK);
        circle(ctx, x - r * 0.4, y - r * 0.42, r * 0.36, WHITE); circle(ctx, x + r * 0.38, y + r * 0.44, r * 0.14, WHITE);
        return;
      case "happy":
        ctx.beginPath(); ctx.arc(x, y + r * 0.4, r * 0.85, Math.PI * 1.15, Math.PI * 1.85); stroke(ctx, INK, r * 0.34);
        return;
      case "closed":
        ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.85, Math.PI * 0.15, Math.PI * 0.85); stroke(ctx, INK, r * 0.3);
        return;
      case "tired":
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.95, 0, Math.PI); ctx.closePath(); ctx.fill();
        circle(ctx, x - r * 0.35, y + r * 0.25, r * 0.17, WHITE);
        ctx.beginPath(); ctx.moveTo(x - r * 1.1, y - r * 0.1); ctx.lineTo(x + r * 1.1, y - r * 0.1); stroke(ctx, INK, r * 0.24);
        return;
      case "angry": {
        const dir = side === "L" ? 1 : -1;               // lids slope down toward the middle
        oval(ctx, x, y, r * 0.82, r, INK);
        circle(ctx, x - r * 0.25, y + r * 0.15, r * 0.2, WHITE);
        ctx.fillStyle = skin; ctx.beginPath();
        ctx.moveTo(x - r * 1.3, y - r * 1.4); ctx.lineTo(x + r * 1.3, y - r * 1.4);
        ctx.lineTo(x + r * 1.3, y - r * 0.15 + dir * r * 0.55); ctx.lineTo(x - r * 1.3, y - r * 0.15 - dir * r * 0.55); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - r * 1.15, y - r * 0.15 - dir * r * 0.5); ctx.lineTo(x + r * 1.15, y - r * 0.15 + dir * r * 0.5); stroke(ctx, INK, r * 0.26);
        return;
      }
      case "spiral": {
        ctx.beginPath();
        const a0 = (spin || 0) * 6 * (side === "L" ? 1 : -1);
        for (let a = 0; a <= Math.PI * 5; a += 0.2) {
          const rr = (r * 1.05 * a) / (Math.PI * 5), px = x + Math.cos(a + a0) * rr, py = y + Math.sin(a + a0) * rr;
          a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        stroke(ctx, INK, r * 0.2);
        return;
      }
      default:                                            // open
        oval(ctx, x, y, r * 0.82, r, INK);
        circle(ctx, x - r * 0.3, y - r * 0.38, r * 0.3, WHITE); circle(ctx, x + r * 0.28, y + r * 0.4, r * 0.12, WHITE);
    }
  }
  function eyes(ctx, b, pose, skin) {
    const st = pose.eyes || "open";
    eye(ctx, b.eyes[0], st === "wink" ? "happy" : st, pose.spin, "L", skin);
    eye(ctx, b.eyes[1], st === "wink" ? "open" : st, pose.spin, "R", skin);
  }

  // ---- shared mouth: little smile, surprised "o", or singing (opens with the sound)
  function mouth(ctx, m, pose, w) {
    const { x, y } = m;
    if (pose.mouth === "o" || pose.mouth === "sing") {
      const open = pose.mouth === "o" ? 0.75 : 0.2 + 0.8 * (pose.sing || 0);
      const rx = w * (0.3 + 0.08 * open), ry = w * (0.08 + 0.42 * open);
      oval(ctx, x, y + ry * 0.5, rx, ry, INK);
      if (open > 0.35) {
        ctx.save(); ctx.beginPath(); ctx.ellipse(x, y + ry * 0.5, rx, ry, 0, 0, TAU); ctx.clip();
        oval(ctx, x, y + ry * 1.35, rx * 0.75, ry * 0.6, "#E86F7E"); ctx.restore();
      }
    } else {
      ctx.beginPath(); ctx.arc(x, y - w * 0.18, w * 0.5, Math.PI * 0.2, Math.PI * 0.8); stroke(ctx, INK, Math.max(12, w * 0.13));
    }
  }

  // ---- Santa hat (seasonal, on anyone). h: { x, y: middle of the brim, w: brim width, rot: degrees }
  function hat(ctx, h, swing) {
    const w = h.w;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(rad(h.rot || 0));
    const tipX = w * 0.6, tipY = -w * 0.3 + (swing || 0) * w * 0.004;
    ctx.fillStyle = HAT_RED; ctx.beginPath();
    ctx.moveTo(-w * 0.45, 0);
    ctx.bezierCurveTo(-w * 0.4, -w * 0.55, w * 0.05, -w * 0.85, w * 0.4, -w * 0.62);
    ctx.quadraticCurveTo(w * 0.6, -w * 0.5, tipX, tipY);
    ctx.quadraticCurveTo(w * 0.36, -w * 0.42, w * 0.45, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = HAT_DARK; ctx.beginPath();           // a fold of shadow
    ctx.moveTo(w * 0.45, 0); ctx.quadraticCurveTo(w * 0.36, -w * 0.42, tipX, tipY);
    ctx.quadraticCurveTo(w * 0.22, -w * 0.4, w * 0.2, 0); ctx.closePath(); ctx.fill();
    circle(ctx, tipX + w * 0.02, tipY + w * 0.06, w * 0.13, WHITE);     // pompom
    ctx.fillStyle = WHITE; ctx.beginPath();              // fluffy brim
    const bh = w * 0.2;
    if (ctx.roundRect) ctx.roundRect(-w * 0.54, -bh * 0.55, w * 1.08, bh, bh / 2); else ctx.rect(-w * 0.54, -bh * 0.55, w * 1.08, bh);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- Dog (Ibaad's drawing)
  const dog = {
    id: "dog", name: "Dog", label: "a golden retriever",
    eyes: window.Dog.eyes, nose: window.Dog.nose, mouth: { x: 673, y: 815 },
    hat: { x: 668, y: 62, w: 600, rot: -4 },
    palette: { colors: [["#C9813A", "#F5A54E"], ["#A9682C", "#C9742A"], ["#8E5524", "#B86A2A"], ["#E0A060", "#FFC27A"],
                        ["#E86F7E", "#FF8C9A"], ["#B57434", "#E0913E"], ["#D99447", "#FFB45C"]], white: "#FFFFFF", ink: "#7A4318" },
    say: { word: "WOOF!", sound: "woof" },
    draw(ctx, pose) {
      const sing = pose.mouth === "sing";
      window.Dog.draw(ctx, sing ? Object.assign({}, pose, { mouth: null }) : pose);
      if (sing) {                                        // open the mouth with the sound
        const open = 0.2 + 0.8 * (pose.sing || 0), m = this.mouth;
        oval(ctx, m.x, m.y + 10, 150, 70, "#C9813A");
        oval(ctx, m.x, m.y + 4 + 26 * open, 40 + 10 * open, 12 + 50 * open, INK);
        if (open > 0.4) oval(ctx, m.x, m.y + 22 + 50 * open, 28, 16, "#E86F7E");
      }
    },
  };

  // ---------------------------------------------------------------- Ghost
  const ghost = {
    id: "ghost", name: "Ghost", label: "a friendly ghost",
    eyes: [{ x: 485, y: 430, r: 98 }, { x: 815, y: 430, r: 98 }],
    nose: { x: 650, y: 560, r: 130 }, mouth: { x: 650, y: 690 },
    hat: { x: 650, y: 78, w: 560, rot: -5 },
    palette: { colors: [["#C4D6F7", "#E2ECFF"], ["#A3BBEA", "#A9C2FF"], [BLUSH, "#FF9DB8"], ["#E86F7E", "#FF8C9A"]], white: "#FFFFFF", ink: "#6F86C4" },
    say: { word: "BOO!", sound: "boo" },
    draw(ctx, pose) {
      const t = pose.t || 0, L = 250, R = 1050, top = 60, hem = 1090;
      ctx.save(); ctx.translate(0, Math.sin(t * 1.6) * 16);              // ghosts float
      // little arms
      [[L + 20, pose.earL || 0, -1], [R - 20, pose.earR || 0, 1]].forEach(([x, sw, dir]) => {
        ctx.save(); ctx.translate(x, 640); ctx.rotate(rad(dir * (25 - sw * 0.9)));
        oval(ctx, dir * 70, 0, 110, 62, "#C4D6F7"); ctx.restore();
      });
      ctx.beginPath(); ctx.moveTo(L, hem);
      ctx.lineTo(L, top + 400); ctx.bezierCurveTo(L, top - 130, R, top - 130, R, top + 400); ctx.lineTo(R, hem);
      const n = 4, wv = (R - L) / n;                                     // wavy hem that ripples
      for (let i = 0; i < n; i++) {
        const x1 = R - i * wv, x2 = x1 - wv, dip = 70 + Math.sin(t * 3 + i * 1.7) * 22;
        ctx.quadraticCurveTo((x1 + x2) / 2 + wv * 0.25, hem + dip * 1.6, (x1 + x2) / 2, hem + dip * 0.2);
        ctx.quadraticCurveTo((x1 + x2) / 2 - wv * 0.25, hem - dip * 0.9, x2, hem);
      }
      ctx.closePath(); ctx.fillStyle = "#C4D6F7"; ctx.fill();
      ctx.save(); ctx.clip();
      oval(ctx, 650, 1180, 520, 260, "#A3BBEA");                       // shade toward the hem
      oval(ctx, 380, 250, 60, 150, WHITE, rad(28));                    // shine
      ctx.restore();
      oval(ctx, 360, 610, 62, 36, BLUSH); oval(ctx, 940, 610, 62, 36, BLUSH);
      eyes(ctx, this, pose, "#C4D6F7");
      mouth(ctx, this.mouth, pose, 200);
      ctx.restore();
    },
  };

  // ---------------------------------------------------------------- Santa
  const BEARD = "#CFD6E6";
  const santa = {
    id: "santa", name: "Santa", label: "Santa",
    eyes: [{ x: 505, y: 478, r: 66 }, { x: 795, y: 478, r: 66 }],
    nose: { x: 650, y: 590, r: 120 }, mouth: { x: 650, y: 742 },
    hat: null, fit: 0.88,                                 // brings his own hat
    palette: { colors: [["#F2C09A", "#FFCDA3"], ["#E3A77E", "#F0A878"], ["#E86F7E", "#FF7F92"], [BLUSH, "#FF9DB8"], [BEARD, "#EEF2FF"]], white: "#FFFFFF", ink: "#8E9BB5" },
    say: { word: "HO HO HO!", sound: "hoho" },
    draw(ctx, pose) {
      const sw = pose.earL || 0;
      // beard: a big scalloped cloud (just off-white, so ASCII draws it dense while the moustache stays light)
      ctx.fillStyle = BEARD; ctx.beginPath();
      ctx.moveTo(280, 470);
      ctx.bezierCurveTo(200, 700, 300, 1000, 520 + sw * 0.6, 1130);
      ctx.quadraticCurveTo(650 + sw * 1.2, 1230, 780 + sw * 0.6, 1130);
      ctx.bezierCurveTo(1000, 1000, 1100, 700, 1020, 470);
      ctx.closePath(); ctx.fill();
      [[300, 760], [380, 930], [520, 1060], [780, 1060], [920, 930], [1000, 760]].forEach(([x, y]) => circle(ctx, x, y, 105, BEARD));
      // face
      oval(ctx, 650, 500, 330, 300, "#F2C09A");
      oval(ctx, 440, 590, 70, 44, BLUSH); oval(ctx, 860, 590, 70, 44, BLUSH);
      eyes(ctx, this, pose, "#F2C09A");
      // eyebrows
      [[505, -1], [795, 1]].forEach(([x, d]) => { ctx.beginPath(); ctx.moveTo(x - 70, 372 + d * -8); ctx.quadraticCurveTo(x, 338, x + 70, 372 + d * 8); stroke(ctx, WHITE, 34); });
      // mouth under the moustache, then moustache and nose
      mouth(ctx, this.mouth, pose, 160);
      [[-1], [1]].forEach(([d]) => {
        ctx.fillStyle = WHITE; ctx.beginPath(); ctx.moveTo(650, 640);
        ctx.bezierCurveTo(650 + d * 60, 590, 650 + d * 250, 610, 650 + d * 290, 700);
        ctx.bezierCurveTo(650 + d * 200, 760, 650 + d * 70, 740, 650, 680); ctx.closePath(); ctx.fill();
      });
      circle(ctx, 650, 590, 62, "#E86F7E"); circle(ctx, 632, 572, 16, WHITE);
      hat(ctx, { x: 650, y: 265, w: 700, rot: -3 }, pose.earR || 0);
    },
  };

  // ---------------------------------------------------------------- Sasquatch
  const FUR = "#7A5433", FUR_DARK = "#5E3F26", FACE = "#C09566";
  // a shaggy outline: an egg with fur spikes, made once
  const shag = (() => {
    const pts = [], n = 44, cy = 640;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2, out = i % 2 === 0;
      const j = Math.sin(i * 12.9898) * 43758.5453, rnd = j - Math.floor(j);
      const rx = 540 * (out ? 1.02 + rnd * 0.05 : 0.9), ry = 590 * (out ? 1.02 + rnd * 0.05 : 0.9);
      pts.push([CX + Math.cos(a + (out ? 0.05 : 0)) * rx, cy + Math.sin(a + (out ? 0.05 : 0)) * ry + (out ? 26 : 0)]);
    }
    return pts;
  })();
  const sasquatch = {
    id: "sasquatch", name: "Sasquatch", label: "a sasquatch",
    eyes: [{ x: 500, y: 552, r: 76 }, { x: 800, y: 552, r: 76 }],
    nose: { x: 650, y: 668, r: 125 }, mouth: { x: 650, y: 830 },
    hat: { x: 650, y: 110, w: 620, rot: -5 },
    palette: { colors: [[FUR, "#D08F52"], [FUR_DARK, "#A66C3C"], [FACE, "#FFD09A"], ["#553726", "#8A5636"], ["#E86F7E", "#FF8C9A"]], white: "#FFFFFF", ink: "#6B4526" },
    say: { word: "RAWR!", sound: "growl" },
    draw(ctx, pose) {
      // hair tufts on top swing like ears
      [[-1, pose.earL || 0], [1, pose.earR || 0]].forEach(([d, sw]) => {
        ctx.save(); ctx.translate(CX + d * 110, 90); ctx.rotate(rad(d * (18 + sw * 0.8)));
        ctx.fillStyle = FUR_DARK; ctx.beginPath(); ctx.moveTo(-70, 40); ctx.quadraticCurveTo(-30, -120, d * 40, -150);
        ctx.quadraticCurveTo(50, -60, 70, 40); ctx.closePath(); ctx.fill(); ctx.restore();
      });
      ctx.fillStyle = FUR; ctx.beginPath(); shag.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
      // darker fur strokes
      ctx.save(); ctx.clip();
      for (let i = 0; i < 16; i++) {
        const j = Math.sin(i * 7.31) * 9999, r1 = j - Math.floor(j), k = Math.sin(i * 3.7) * 9999, r2 = k - Math.floor(k);
        const x = 160 + r1 * 980, y = 120 + r2 * 1050;
        if (Math.hypot((x - 650) / 330, (y - 640) / 320) < 1.1) continue;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 10, y + 60, x + 14, y + 120); stroke(ctx, FUR_DARK, 26);
      }
      ctx.restore();
      // face
      ctx.fillStyle = FACE; ctx.beginPath();
      ctx.moveTo(650, 380); ctx.bezierCurveTo(900, 330, 1010, 520, 950, 760); ctx.bezierCurveTo(900, 960, 400, 960, 350, 760);
      ctx.bezierCurveTo(290, 520, 400, 330, 650, 380); ctx.closePath(); ctx.fill();
      eyes(ctx, this, pose, FACE);
      // heavy brow
      ctx.beginPath(); ctx.moveTo(370, 432); ctx.quadraticCurveTo(510, 372, 650, 432); ctx.quadraticCurveTo(790, 372, 930, 432); stroke(ctx, FUR_DARK, 62);
      // nose
      ctx.fillStyle = "#553726"; ctx.beginPath(); ctx.moveTo(560, 640); ctx.quadraticCurveTo(650, 590, 740, 640);
      ctx.quadraticCurveTo(730, 725, 650, 725); ctx.quadraticCurveTo(570, 725, 560, 640); ctx.fill();
      mouth(ctx, this.mouth, pose, 220);
      if (pose.mouth !== "o" && pose.mouth !== "sing") {   // two little teeth
        ctx.fillStyle = WHITE; ctx.fillRect(590, 832, 34, 40); ctx.fillRect(676, 832, 34, 40);
      }
    },
  };

  // ---------------------------------------------------------------- Dumpling
  const DOUGH = "#F2DFBD", DOUGH_SHADE = "#DDBF8E", PLEAT = "#B8915A";
  const dumpling = {
    id: "dumpling", name: "Dumpling", label: "a squishy dumpling",
    eyes: [{ x: 470, y: 770, r: 74 }, { x: 830, y: 770, r: 74 }],
    nose: { x: 650, y: 810, r: 120 }, mouth: { x: 650, y: 900 },
    hat: { x: 650, y: 300, w: 470, rot: -6 },
    palette: { colors: [[DOUGH, "#FFF0D2"], [DOUGH_SHADE, "#F0C98C"], [PLEAT, "#D9A866"], [BLUSH, "#FF9DB8"], ["#E86F7E", "#FF8C9A"]], white: "#FFFFFF", ink: "#B8915A" },
    say: { word: "SQUISH!", sound: "squeak" },
    draw(ctx, pose) {
      const t = pose.t || 0, j = 1 + Math.sin(t * 2.6) * 0.018, sw = ((pose.earR || 0) - (pose.earL || 0)) * 0.5;
      ctx.save(); ctx.translate(CX, 1160); ctx.scale(j, 2 - j); ctx.translate(-CX, -1160);       // a gentle jiggle
      // steam
      [[480, 0], [820, 1.8]].forEach(([x, ph]) => {
        ctx.beginPath(); ctx.moveTo(x, 300);
        for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(t * 2 + ph + k * 0.9) * 26, 300 - k * 36);
        stroke(ctx, WHITE, 16);
      });
      ctx.beginPath(); ctx.moveTo(110, 960);
      ctx.bezierCurveTo(80, 700, 380, 520, 590, 330);
      ctx.quadraticCurveTo(650 + sw * 2, 250, 710, 330);
      ctx.bezierCurveTo(920, 520, 1220, 700, 1190, 960);
      ctx.bezierCurveTo(1170, 1180, 130, 1180, 110, 960);
      ctx.closePath(); ctx.fillStyle = DOUGH; ctx.fill();
      ctx.save(); ctx.clip();
      oval(ctx, 650, 1200, 640, 170, DOUGH_SHADE);
      oval(ctx, 330, 760, 50, 110, WHITE, rad(35));
      ctx.restore();
      // pleats fanning out from the top knot
      [-2, -1, 0, 1, 2].forEach((k) => {
        ctx.beginPath(); ctx.moveTo(650 + k * 22 + sw, 330);
        ctx.quadraticCurveTo(650 + k * 80, 440, 650 + k * 130, 600 - Math.abs(k) * 30); stroke(ctx, PLEAT, 20);
      });
      oval(ctx, 330, 910, 66, 38, BLUSH); oval(ctx, 970, 910, 66, 38, BLUSH);
      eyes(ctx, this, pose, DOUGH);
      mouth(ctx, this.mouth, pose, 150);
      ctx.restore();
    },
  };

  // ---------------------------------------------------------------- Radish
  const RAD = "#E8456B", RAD_DARK = "#C22F55", LEAF = "#4CAF50", LEAF_DARK = "#2E8B3A";
  function leaf(ctx, deg, len, w) {
    ctx.save(); ctx.translate(CX, 300); ctx.rotate(rad(deg));
    ctx.fillStyle = LEAF; ctx.beginPath(); ctx.moveTo(0, 20);
    ctx.bezierCurveTo(-w, -len * 0.3, -w * 0.8, -len * 0.9, 0, -len); ctx.bezierCurveTo(w * 0.8, -len * 0.9, w, -len * 0.3, 0, 20); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len * 0.8); stroke(ctx, LEAF_DARK, 18);
    ctx.restore();
  }
  const radish = {
    id: "radish", name: "Radish", label: "a radish",
    eyes: [{ x: 495, y: 630, r: 84 }, { x: 805, y: 630, r: 84 }],
    nose: { x: 650, y: 730, r: 125 }, mouth: { x: 650, y: 830 },
    hat: { x: 712, y: 322, w: 400, rot: 13 },
    palette: { colors: [[RAD, "#FF5C82"], [RAD_DARK, "#E0406A"], [LEAF, "#62D66C"], [LEAF_DARK, "#3BAF4D"], ["#F5A9BC", "#FFC2D0"]], white: "#FFFFFF", ink: "#B02A4E" },
    say: { word: "CRUNCH!", sound: "squeak" },
    draw(ctx, pose) {
      leaf(ctx, -42 - (pose.earL || 0) * 0.7, 330, 110);
      leaf(ctx, 42 + (pose.earR || 0) * 0.7, 330, 110);
      leaf(ctx, ((pose.earR || 0) - (pose.earL || 0)) * 0.3, 360, 120);
      ctx.beginPath(); ctx.moveTo(650, 280);
      ctx.bezierCurveTo(1010, 270, 1130, 560, 1030, 800);
      ctx.bezierCurveTo(960, 960, 760, 1040, 668, 1195);
      ctx.quadraticCurveTo(650, 1215, 632, 1195);
      ctx.bezierCurveTo(540, 1040, 340, 960, 270, 800);
      ctx.bezierCurveTo(170, 560, 290, 270, 650, 280);
      ctx.closePath(); ctx.fillStyle = RAD; ctx.fill();
      ctx.save(); ctx.clip();
      oval(ctx, 650, 1190, 330, 190, WHITE);                           // pale root tip
      oval(ctx, 650, 1010, 420, 60, "#F5A9BC");
      oval(ctx, 400, 470, 50, 120, WHITE, rad(32));
      ctx.restore();
      oval(ctx, 380, 780, 62, 36, RAD_DARK); oval(ctx, 920, 780, 62, 36, RAD_DARK);
      eyes(ctx, this, pose, RAD);
      mouth(ctx, this.mouth, pose, 180);
    },
  };

  // ---------------------------------------------------------------- Jellyfish (lives in the water tank)
  const JELLY = "#E88BC4", JELLY_RIM = "#C766A8", JELLY_SPOT = "#F2B6DA", TENT = "#B48CF0", TENT2 = "#8FA8F5";
  const jellyfish = {
    id: "jellyfish", name: "Jellyfish", label: "a jellyfish underwater", water: true, fit: 0.9,
    eyes: [{ x: 495, y: 400, r: 86 }, { x: 805, y: 400, r: 86 }],
    nose: { x: 650, y: 470, r: 125 }, mouth: { x: 650, y: 545 },
    hat: { x: 650, y: 92, w: 540, rot: -5 },
    palette: { colors: [[JELLY, "#FF9AD5"], [JELLY_RIM, "#E070BC"], [JELLY_SPOT, "#FFD0EA"], [TENT, "#C4A2FF"], [TENT2, "#9FBBFF"], ["#FF7FA8", "#FF86B0"]], white: "#FFFFFF", ink: "#B0509A" },
    say: { word: "BLUB!", sound: "blub" },
    draw(ctx, pose) {
      const t = pose.t || 0, pulse = Math.sin(t * 2.2);                 // the slow swimming pulse
      const drag = ((pose.earL || 0) - (pose.earR || 0)) * 2.2;         // tentacles trail behind sideways motion…
      const lift = ((pose.earL || 0) + (pose.earR || 0)) * 0.8;         // …and flare on bumps
      const rimY = 640;
      // tentacles first (behind the bell): thin ones, then two frilly arms
      const tent = (x0, len, w, col, ph, frill) => {
        ctx.beginPath(); ctx.moveTo(x0, rimY - 30);
        const n = 9;
        for (let k = 1; k <= n; k++) {
          const f = k / n, wig = Math.sin(t * 2.4 + ph + f * 5) * (18 + 46 * f) * (frill ? 0.6 : 1);
          ctx.lineTo(x0 + wig + drag * f * f + (x0 - CX) * 0.12 * f * (1 + pulse * 0.5 + lift * 0.02), rimY - 30 + (len - pulse * 26) * f);
        }
        stroke(ctx, col, w);
      };
      [[330, 470, 0.4], [470, 540, 1.7], [830, 540, 2.9], [970, 470, 4.2]].forEach(([x, len, ph], i) => tent(x, len, 30, i % 2 ? TENT2 : TENT, ph, false));
      tent(580, 500, 58, JELLY_SPOT, 0.9, true); tent(720, 500, 58, JELLY_SPOT, 3.3, true);
      tent(650, 420, 46, JELLY_RIM, 2.1, true);
      // the bell, squeezing gently as it swims
      ctx.save(); ctx.translate(CX, rimY); ctx.scale(1 + pulse * 0.035, 1 - pulse * 0.045); ctx.translate(-CX, -rimY);
      const L = 215, R = 1085;
      ctx.beginPath(); ctx.moveTo(L, rimY - 20);
      ctx.bezierCurveTo(L - 10, 250, 380, 55, CX, 55); ctx.bezierCurveTo(920, 55, R + 10, 250, R, rimY - 20);
      const n = 6, wv = (R - L) / n;                                     // scalloped skirt
      for (let i = 0; i < n; i++) { const x1 = R - i * wv; ctx.quadraticCurveTo(x1 - wv / 2, rimY + 95, x1 - wv, rimY - 20); }
      ctx.closePath(); ctx.fillStyle = JELLY; ctx.fill();
      ctx.save(); ctx.clip();
      oval(ctx, CX, rimY + 40, 470, 110, JELLY_RIM);                    // darker skirt band
      oval(ctx, 400, 215, 58, 130, WHITE, rad(38));                     // shine
      oval(ctx, 650, 150, 60, 34, JELLY_SPOT); oval(ctx, 820, 215, 44, 28, JELLY_SPOT, rad(30)); oval(ctx, 930, 330, 34, 24, JELLY_SPOT, rad(50));
      ctx.restore();
      oval(ctx, 365, 510, 64, 38, "#FF7FA8"); oval(ctx, 935, 510, 64, 38, "#FF7FA8");
      eyes(ctx, this, pose, JELLY);
      mouth(ctx, this.mouth, pose, 170);
      ctx.restore();
    },
  };

  const list = [dog, ghost, santa, sasquatch, dumpling, radish, jellyfish];
  list.forEach((b) => { b.palette = { colors: b.palette.colors.concat(HAT_COLORS), white: b.palette.white, ink: b.palette.ink }; });

  function hatOn(b, pose) { return !!(pose && pose.hat && b.hat); }
  function draw(ctx, b, pose) {
    pose = pose || {};
    const h = hatOn(b, pose), k = (b.fit || 1) * (h ? HAT_FIT : 1);
    ctx.save(); ctx.translate(CX, BOTTOM); ctx.scale(k, k); ctx.translate(-CX, -BOTTOM);
    b.draw(ctx, pose);
    if (h) hat(ctx, b.hat, pose.earR || 0);
    ctx.restore();
  }
  // Where a drawing point lands, as a fraction of the head box (0..1)
  function point(b, p, withHat) {
    const k = (b.fit || 1) * (withHat && b.hat ? HAT_FIT : 1);
    const x = CX + (p.x - CX) * k, y = BOTTOM + (p.y - BOTTOM) * k;
    return { x: (x - VB.x) / VB.w, y: (y - VB.y) / VB.h, k };
  }

  window.Buddies = { list, get: (id) => list.find((b) => b.id === id) || dog, draw, point, viewBox: VB };
})();
