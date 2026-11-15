/* Car Buddy colored-ASCII renderer + speed-bump crumble.
 *
 *   const a = new AsciiRenderer(canvas, { cols: 80 });
 *   a.layout(cssW, cssH);            // when the head's on-screen size changes
 *   a.render((ctx) => Dog.draw(ctx, pose), viewBox);   // each frame (ASCII mode)
 *   a.renderPlain(drawFn, viewBox);  // "Drawing" mode: the dog itself, no characters
 *
 *   const c = new Crumble(overlayCanvas, a);
 *   c.start(rect, onDone);  c.frame(dt, homeRect)  // returns false when finished
 *
 * How ASCII works: the dog is drawn small (3x3 samples per character cell) every frame;
 * each cell becomes a character whose color is the average fur color there. Dense
 * characters for fur, lighter ones along outlines, cream * and - for whites, and black
 * ink (eyes, nose, smile) is left empty so it reads as holes cut in the fur.
 * Glyphs are pre-drawn into an atlas so a frame is just ~2000 small image copies.
 */
(function () {
  "use strict";
  const FILL = "%8&$#B", EDGE = ":;!|/\\()", WHITE = "*-+";
  const CHARS = FILL + EDGE + WHITE;
  const NF = FILL.length, NE = EDGE.length;
  // Default palette (the dog): [colour in the drawing, how it is shown — brighter, so it glows on black]
  const DOG_PALETTE = { colors: [["#C9813A", "#F5A54E"], ["#A9682C", "#C9742A"], ["#8E5524", "#B86A2A"], ["#E0A060", "#FFC27A"],
                                 ["#E86F7E", "#FF8C9A"], ["#B57434", "#E0913E"], ["#D99447", "#FFB45C"]], white: "#FFFFFF", ink: "#7A4318" };
  const SUB = 3;                       // samples per cell, each direction
  const CHAR_ASPECT = 1.62;            // cell height / width
  const hash = (i) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

  // color → nearest palette entry, via a 16x16x16 lookup table
  function buildLut(colors) {
    const rgb = colors.map(([h]) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    const lut = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) {
      const r = ((i >> 8) & 15) * 17, g = ((i >> 4) & 15) * 17, b = (i & 15) * 17;
      let best = 0, bd = 1e9;
      rgb.forEach(([R, G, B], k) => { const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < bd) { bd = d; best = k; } });
      lut[i] = best;
    }
    return lut;
  }

  class AsciiRenderer {
    constructor(canvas, opts) {
      this.cv = canvas; this.ctx = canvas.getContext("2d");
      this.cols = (opts && opts.cols) || 80;
      this.off = document.createElement("canvas");
      this.octx = this.off.getContext("2d", { willReadFrequently: true });
      this.atlas = document.createElement("canvas");
      this.boil = 0; this.lastBoil = 0;
      this.chars = null; this.colors = null;
      this.setPalette(DOG_PALETTE);
    }

    // Each buddy brings its own colours. Call layout() afterwards to rebuild the glyphs.
    setPalette(p) {
      this.show = p.colors.map((c) => c[1]).concat([p.white || "#FFFFFF", p.ink || "#555555"]);
      this.CREAM = p.colors.length; this.INKLINE = p.colors.length + 1;
      this.lut = buildLut(p.colors);
    }

    layout(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!(cssW > 8 && cssH > 8)) { this.chars = null; return; }       // hidden or squeezed to nothing: draw nothing
      this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
      this.cellW = cssW / this.cols; this.cellH = this.cellW * CHAR_ASPECT;
      this.rows = Math.max(1, Math.floor(cssH / this.cellH));
      this.cv.width = Math.round(cssW * dpr); this.cv.height = Math.round(cssH * dpr);
      this.off.width = this.cols * SUB; this.off.height = this.rows * SUB;
      this.chars = new Uint8Array(this.cols * this.rows).fill(255);
      this.colors = new Uint8Array(this.cols * this.rows);
      // glyph atlas: one row per palette color, one column per character
      const gw = Math.ceil(this.cellW * dpr), gh = Math.ceil(this.cellH * dpr);
      this.gw = gw; this.gh = gh;
      this.atlas.width = gw * CHARS.length; this.atlas.height = gh * this.show.length;
      const a = this.atlas.getContext("2d");
      a.font = `800 ${Math.round(gh * 0.98)}px ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace`;
      a.textAlign = "center"; a.textBaseline = "middle";
      this.show.forEach((col, r) => {
        a.fillStyle = col;
        for (let c = 0; c < CHARS.length; c++) {          // drawn twice, a hair apart, for bolder strokes
          a.fillText(CHARS[c], c * gw + gw / 2, r * gh + gh * 0.55);
          a.fillText(CHARS[c], c * gw + gw / 2 + Math.max(0.6, gw * 0.06), r * gh + gh * 0.55);
        }
      });
    }

    // Draw the dog small and turn every cell into a character
    render(drawFn, vb, now) {
      if (!this.chars) return;
      const o = this.octx, W = this.off.width, H = this.off.height;
      o.setTransform(1, 0, 0, 1, 0, 0); o.fillStyle = "#000"; o.fillRect(0, 0, W, H);
      const coverH = this.rows * this.cellH;                  // grid may be a touch shorter than the canvas
      o.scale(W / this.cssW, H / coverH);
      o.scale(this.cssW / vb.w, this.cssH / vb.h);
      o.translate(-vb.x, -vb.y);
      drawFn(o);
      const px = o.getImageData(0, 0, W, H).data;

      if (now - this.lastBoil > 280) { this.boil++; this.lastBoil = now; }   // a gentle shimmer, like redrawn lines
      const cols = this.cols, rows = this.rows, CREAM = this.CREAM, INKLINE = this.INKLINE, LUT = this.lut;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          let nDark = 0, nWhite = 0, nFur = 0, r = 0, g = 0, b = 0;
          for (let sy = 0; sy < SUB; sy++) {
            let p = ((cy * SUB + sy) * W + cx * SUB) * 4;
            for (let sx = 0; sx < SUB; sx++, p += 4) {
              const R = px[p], G = px[p + 1], B = px[p + 2], s = R + G + B;
              if (s < 150) nDark++;
              else if (s > 660) nWhite++;
              else { nFur++; r += R; g += G; b += B; }
            }
          }
          const i = cy * cols + cx;
          const shimmer = hash(i * 3.1) < 0.12 ? this.boil : 0;
          if (nWhite >= 1 && nFur + nWhite >= 3) {          // whites: shines, whiskers, fur streaks
            this.chars[i] = NF + NE + (nWhite >= 5 ? 0 : 1); this.colors[i] = CREAM;
          } else if (nFur >= 3) {
            const edge = nDark >= 2;                         // ink lines (smile, wrinkles) → dark stroke characters
            this.chars[i] = edge ? NF + Math.floor(hash(i + shimmer * 17) * NE) : Math.floor(hash(i * 7 + shimmer * 31) * NF);
            r = (r / nFur) | 0; g = (g / nFur) | 0; b = (b / nFur) | 0;
            this.colors[i] = edge && nDark >= 3 ? INKLINE : LUT[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)];
          } else this.chars[i] = 255;
        }
      }
      this.paint();
    }

    paint() {
      const c = this.ctx, dpr = this.dpr, gw = this.gw, gh = this.gh;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
      const cw = this.cellW * dpr, ch = this.cellH * dpr;
      for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
        const i = cy * this.cols + cx, k = this.chars[i];
        if (k === 255) continue;
        c.drawImage(this.atlas, k * gw, this.colors[i] * gh, gw, gh, cx * cw, cy * ch, cw, ch);
      }
    }

    // "Drawing" mode: the dog itself, smooth
    renderPlain(drawFn, vb) {
      if (!this.chars) return;
      const c = this.ctx, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(this.cssW * dpr), h = Math.round(this.cssH * dpr);
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
      c.scale(w / vb.w, h / vb.h); c.translate(-vb.x, -vb.y);
      drawFn(c);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);   // keep for the next layout()
    }

    // Every visible character with its position (CSS px inside the canvas)
    cells() {
      const out = [];
      for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
        const i = cy * this.cols + cx;
        if (this.chars[i] !== 255) out.push({ k: this.chars[i], col: this.colors[i], hx: cx * this.cellW, hy: cy * this.cellH });
      }
      return out;
    }
  }

  // ------------------------------------------------------------------ Crumble
  // The characters drop out of the dog, tumble to the bottom of the screen into a
  // pile, rest a moment, then fly back up and rebuild him.
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  class Crumble {
    constructor(canvas, ascii) { this.cv = canvas; this.ctx = canvas.getContext("2d"); this.a = ascii; this.active = false; }

    start(rect, onDone, onRebuild) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // tumbling pieces don't need to be razor sharp
      this.dpr = dpr; this.W = innerWidth; this.H = innerHeight;
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
      const k = rect.width / this.a.cssW;                    // the head may be scaled by physics
      this.cw = this.a.cellW * k; this.ch = this.a.cellH * k;
      this.parts = this.a.cells().map((c) => ({
        k: c.k, col: c.col, hx: c.hx, hy: c.hy,
        x: rect.left + c.hx * k, y: rect.top + c.hy * k,
        vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 320 - 40,
        delay: Math.random() * 0.18 + (1 - c.hy / this.a.cssH) * 0.08,
        spin: (Math.random() - 0.5) * 9, rot: 0, landed: false,
      }));
      this.colW = this.cw;
      this.heights = new Float32Array(Math.ceil(this.W / this.colW) + 1);
      this.t = 0; this.phase = "fall"; this.onDone = onDone; this.onRebuild = onRebuild; this.active = true;
    }

    land(p) {
      let c = Math.max(0, Math.min(this.heights.length - 1, Math.floor(p.x / this.colW)));
      // sand: slide off to a lower neighbour so it makes a pile, not towers
      for (let n = 0; n < 6; n++) {
        const l = this.heights[c - 1] ?? 1e9, r = this.heights[c + 1] ?? 1e9, h = this.heights[c];
        if (h > l + this.ch * 0.9 && l <= r) c--; else if (h > r + this.ch * 0.9) c++; else break;
      }
      p.x = c * this.colW + (Math.random() - 0.5) * 2;
      p.y = this.H - this.heights[c] - this.ch;
      this.heights[c] += this.ch * 0.55;
      p.landed = true; p.vx = p.vy = 0; p.rot = (Math.random() - 0.5) * 1.2; p.spin = 0;
      p.px = p.x; p.py = p.y;
    }

    // dt in seconds; homeRect = where the head is now (it rebuilds wherever he is)
    frame(dt, homeRect) {
      if (!this.active) return false;
      this.t += dt;
      const g = 2600;
      if (this.phase === "fall") {
        let all = true;
        for (const p of this.parts) {
          if (p.landed) continue;
          if (this.t < p.delay) { all = false; continue; }
          p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          const c = Math.max(0, Math.min(this.heights.length - 1, Math.floor(p.x / this.colW)));
          if (p.y >= this.H - this.heights[c] - this.ch) this.land(p); else all = false;
        }
        if (all || this.t > 2.6) { this.parts.forEach((p) => { if (!p.landed) this.land(p); }); this.phase = "hold"; this.t = 0; }
      } else if (this.phase === "hold" && this.t > 0.75) {
        this.phase = "rebuild"; this.t = 0; if (this.onRebuild) this.onRebuild();
        this.parts.forEach((p) => { p.delay = Math.random() * 0.5; p.rot0 = p.rot; });
      } else if (this.phase === "rebuild") {
        const k = homeRect.width / this.a.cssW;
        let done = true;
        for (const p of this.parts) {
          const t = Math.max(0, Math.min(1, (this.t - p.delay) / 0.75));
          if (t < 1) done = false;
          const e = ease(t), tx = homeRect.left + p.hx * k, ty = homeRect.top + p.hy * k;
          p.x = p.px + (tx - p.px) * e;
          p.y = p.py + (ty - p.py) * e - Math.sin(Math.PI * t) * 90;     // a little hop on the way up
          p.rot = p.rot0 * (1 - e);
        }
        if (done) { this.active = false; this.clear(); if (this.onDone) this.onDone(); return false; }
      }
      this.draw();
      return true;
    }

    draw() {
      const c = this.ctx, d = this.dpr, a = this.a;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
      const w = this.cw * d, h = this.ch * d;
      for (const p of this.parts) {
        if (p.rot) {
          c.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), (p.x + this.cw / 2) * d, (p.y + this.ch / 2) * d);
          c.drawImage(a.atlas, p.k * a.gw, p.col * a.gh, a.gw, a.gh, -w / 2, -h / 2, w, h);
        } else {
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.drawImage(a.atlas, p.k * a.gw, p.col * a.gh, a.gw, a.gh, p.x * d, p.y * d, w, h);
        }
      }
    }

    clear() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); }
  }

  window.AsciiRenderer = AsciiRenderer;
  window.Crumble = Crumble;
})();
