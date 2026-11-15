/* Car Buddy dog — draws the traced drawing with moving parts.
 *   Dog.draw(ctx, pose)   ctx already scaled so 1 unit = 1 drawing unit (see Dog.viewBox)
 * pose: {
 *   earL, earR: degrees of swing (+ = tip swings outward/up),
 *   eyes: "open" | "wide" | "happy" | "closed" | "tired" | "spiral" | "angry" | "wink",
 *   mouth: null | "o",
 *   spin: seconds (for spiral eyes)
 * }
 */
(function () {
  "use strict";
  const D = window.DOG_PATHS;
  const P = {};
  ["coat", "highlights", "ink", "earL", "earLInk", "earR", "earRInk", "whiskers"].forEach((k) => { P[k] = new Path2D(D[k]); });

  const COAT = "#C9813A", EAR = "#A9682C", CREAM = "#FFF8EE", INK = "#141010";
  // Eye centres and size in drawing units (eyes were enlarged 1.4x around these points)
  const EYES = [{ x: 408, y: 343, r: 94 }, { x: 893, y: 309, r: 94 }];
  const EAR_PIVOT = { L: [300, 135], R: [1040, 135] };
  const MOUTH = { x: 673, y: 815 };

  function ear(ctx, side, deg) {
    const [px, py] = EAR_PIVOT[side];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(((side === "L" ? 1 : -1) * deg * Math.PI) / 180);
    ctx.translate(-px, -py);
    ctx.fillStyle = EAR; ctx.fill(P["ear" + side], "evenodd");
    ctx.fillStyle = INK; ctx.fill(P["ear" + side + "Ink"], "evenodd");
    ctx.restore();
  }

  // Paint over an eye with fur, then draw a different eye shape
  function cover(ctx, e) { ctx.fillStyle = COAT; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2); ctx.fill(); }
  function line(ctx, pts, w) {
    ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
  function eye(ctx, e, state, spin, side) {
    const { x, y, r } = e;
    switch (state) {
      case "open": return;                                    // the drawing's own eye
      case "wide":
        cover(ctx, e);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(x - r * 0.38, y - r * 0.4, r * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.42, r * 0.13, 0, Math.PI * 2); ctx.fill();
        return;
      case "happy":                                           // ^ ^
        cover(ctx, e);
        ctx.strokeStyle = INK; ctx.lineWidth = 26; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(x, y + r * 0.35, r * 0.75, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        return;
      case "closed":                                          // sleepy curve
        cover(ctx, e);
        ctx.strokeStyle = INK; ctx.lineWidth = 24; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(x, y - r * 0.25, r * 0.75, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
        return;
      case "tired": {                                         // half-closed: lower half of the eye under a heavy lid
        cover(ctx, e);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(x - r * 0.35, y + r * 0.3, r * 0.16, 0, Math.PI * 2); ctx.fill();
        line(ctx, [[x - r * 1.0, y], [x + r * 1.0, y]], 18);
        return;
      }
      case "angry": {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r + 8, 0, Math.PI * 2); ctx.clip();
        const dir = side === "L" ? 1 : -1;                    // lids slope down toward the nose
        ctx.fillStyle = COAT; ctx.beginPath();
        ctx.moveTo(x - r - 10, y - r - 10); ctx.lineTo(x + r + 10, y - r - 10);
        ctx.lineTo(x + r + 10, y - r * 0.1 + dir * r * 0.45); ctx.lineTo(x - r - 10, y - r * 0.1 - dir * r * 0.45); ctx.closePath(); ctx.fill();
        ctx.restore();
        line(ctx, [[x - r, y - r * 0.1 - dir * r * 0.45], [x + r, y - r * 0.1 + dir * r * 0.45]], 18);
        return;
      }
      case "spiral": {
        cover(ctx, e);
        ctx.strokeStyle = INK; ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.beginPath();
        const a0 = (spin || 0) * 6 * (side === "L" ? 1 : -1);
        for (let a = 0; a <= Math.PI * 5; a += 0.2) {
          const rr = (r * 0.95 * a) / (Math.PI * 5);
          const px = x + Math.cos(a + a0) * rr, py = y + Math.sin(a + a0) * rr;
          a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
        return;
      }
    }
  }

  function draw(ctx, pose) {
    pose = pose || {};
    ctx.fillStyle = COAT; ctx.fill(P.coat, "evenodd");
    ctx.fillStyle = CREAM; ctx.fill(P.highlights, "evenodd");
    ctx.fillStyle = INK; ctx.fill(P.ink, "evenodd");
    const st = pose.eyes || "open";
    eye(ctx, EYES[0], st === "wink" ? "happy" : st, pose.spin, "L");
    eye(ctx, EYES[1], st === "wink" ? "open" : st, pose.spin, "R");
    if (pose.mouth === "o") {
      ctx.fillStyle = COAT; ctx.beginPath(); ctx.ellipse(MOUTH.x, MOUTH.y + 10, 150, 70, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(MOUTH.x, MOUTH.y + 20, 46, 58, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#E86F7E"; ctx.beginPath(); ctx.ellipse(MOUTH.x, MOUTH.y + 52, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = CREAM; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.stroke(P.whiskers);
    ear(ctx, "L", pose.earL || 0);
    ear(ctx, "R", pose.earR || 0);
  }

  // Map the moods used by the app to the dog's eye/mouth shapes
  const MOOD = {
    neutral: { eyes: "open" }, excited: { eyes: "wide" }, starstruck: { eyes: "wide" },
    wow: { eyes: "wide", mouth: "o" }, scared: { eyes: "wide", mouth: "o" },
    happy: { eyes: "happy" }, giggle: { eyes: "happy" }, "in-love": { eyes: "happy" }, winking: { eyes: "wink" },
    flustered: { eyes: "spiral" }, exhausted: { eyes: "tired" }, tired: { eyes: "tired" }, bored: { eyes: "tired" },
    sassy: { eyes: "tired" }, mischievous: { eyes: "tired" }, snoozing: { eyes: "closed" },
    "realized-something": { eyes: "wide" }, thinking: { eyes: "open" },
    annoyed: { eyes: "angry" }, furious: { eyes: "angry", mouth: "o" },
  };

  const vb = D.viewBox;
  window.Dog = {
    draw, MOOD, viewBox: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] },
    nose: { x: 673, y: 600, r: 150 }, eyes: EYES,
  };
})();
