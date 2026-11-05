/* ---------- text supports: the reading column set on an object of the scene ---------- */
// A support says where the text goes and paints itself once, around that text area, on a canvas under the text.
//   box(W, H, u)   -> { top, bottom, side, spread?, gutter? }: bands kept free above and below the text, room kept on each
//                     side of it (frame, legs, page edges...). spread asks for a second page on the left (the book), gutter
//                     the gap between the two pages.
//   ink            -> the text colour (a string, or a function of the scene key); light: true when the ink is light.
//   draw(c, S, W, H, o) paints the support. S = { x, y, w, h } is the text area (the reading column, padding included).
//                     o = { u, scene, light, under, left, mini, R }: u = min(W, H); scene = scene key (for variants);
//                     light = the scene's main light { x, y, r, rgb, a } or null; under = average colour of the scene behind
//                     ([r, g, b] in 0..1) or null; left = the left page rect when the book is open on two pages, else null;
//                     mini = true for the small previews (about 112 x 70); R = seeded random.
//                     o.bg, o.fg: the reader's colours ('#rrggbb') when the support should take them (its surface takes
//                     bg, keeping its material and light; the text takes fg), else absent: the support keeps its own tones.
//   edge(u)        -> { t, r, b, l }: how far the object shows around the text area (for the move bar and the grip).
(() => {
  const { light, rad, grain, rrect, TAU } = window.LISEUSE_SCENES;
  const SUPPORTS = {};
  // Reading colours on a material: '#rrggbb' -> [r, g, b], perceived lightness 0..1, mixes.
  const hex3 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lumOf = (a) => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
  const mixRGB = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgbCss = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  // A dark surface needs its shading in black (a brown shade vanishes on it) and lighter, fewer highlights.
  const toneOf = (bg) => { const p = hex3(bg), l = lumOf(p); return { p, l, dark: l < 0.42 }; };
  // The support each scene suggests.
  const PRESET = { nook: 'book', hearth: 'frame', forest: 'frame', lake: 'easel', snow: 'book', fuji: 'easel', alpes: 'frame', lines: 'screen', topo: 'screen', halo: 'screen', dots: 'screen', dust: 'screen', image: 'frame' };

  /* support:easel:start */
  // Chevalet de campagne vu de face. Toile apprêtée tendue sur châssis (tranche visible côté lumière), mât avec pince haute,
  // deux pieds avant à peine écartés, pied arrière entrevu, tablette sous la toile. Le bois change avec la scène.
  const EASEL_WOOD = {
    weathered: { sh: [66, 62, 72], md: [148, 134, 112], lt: [204, 188, 158] }, // bois blanchi du lac
    indoor: { sh: [46, 29, 19], md: [106, 68, 41], lt: [166, 114, 68] }, // hêtre/noyer chaud
    natural: { sh: [170, 132, 92], md: [214, 178, 130], lt: [240, 214, 172] }, // bois clair
  };
  const EASEL_METAL = { sh: [56, 44, 30], md: [128, 104, 64], lt: [214, 184, 128] };
  const EASEL_DIR = { lake: 1 }; // sens de la lumière quand la scène n'en donne pas (aperçus)
  const easelKind = (s) => s === 'lake' ? 'weathered' : s === 'nook' || s === 'hearth' || s === 'forest' || s === 'snow' || s === 'washitsu' ? 'indoor' : 'natural';
  const easelRGB = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
  const easelMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const easelLin = (c, x0, y0, x1, y1, st) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (const s of st) g.addColorStop(s[0], s[1]); return g; };
  // A tapered bar of wood from (x0, y0) down to (x1, y1): shaded across, a warm rim on the lit edge, a few strokes of grain.
  function easelBar(c, x0, y0, x1, y1, w0, w1, P, dir, rim, R, grainN) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = dy / len, ny = -dx / len;
    const ax = x0 - nx * w0 / 2, ay = y0 - ny * w0 / 2, bx = x0 + nx * w0 / 2, by = y0 + ny * w0 / 2;
    const cx = x1 + nx * w1 / 2, cy = y1 + ny * w1 / 2, ex = x1 - nx * w1 / 2, ey = y1 - ny * w1 / 2;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mw = (w0 + w1) / 2;
    const fr0 = easelRGB(easelMix(P.sh, P.md, 0.6)), fr1 = easelRGB(P.md), sd = easelRGB(easelMix(P.lt, rim.split(',').map(Number), 0.22)), sd1 = easelRGB(easelMix(P.lt, rim.split(',').map(Number), 0.4));
    const st = dir > 0 ? [[0, fr0], [0.75, fr1], [0.751, sd], [1, sd1]] : [[0, sd1], [0.249, sd], [0.25, fr1], [1, fr0]]; // front face + the side face turned toward the light
    c.save();
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(cx, cy); c.lineTo(ex, ey); c.closePath();
    c.fillStyle = easelLin(c, mx - nx * mw / 2, my - ny * mw / 2, mx + nx * mw / 2, my + ny * mw / 2, st); c.fill();
    c.clip();
    if (grainN) { // grain: short broken strokes along the bar
      for (let i = 0; i < grainN; i++) {
        const t = R() - 0.5, s0 = R() * 0.7, s1 = Math.min(1, s0 + 0.12 + R() * 0.4), dark = R() < 0.7;
        const ox0 = nx * t * w0, oy0 = ny * t * w0, ox1 = nx * t * w1, oy1 = ny * t * w1;
        c.strokeStyle = dark ? `rgba(30,18,8,${0.05 + R() * 0.08})` : `rgba(255,240,215,${0.04 + R() * 0.05})`; c.lineWidth = 0.6 + R() * 0.7;
        c.beginPath(); c.moveTo(x0 + dx * s0 + ox0 + (ox1 - ox0) * s0, y0 + dy * s0 + oy0 + (oy1 - oy0) * s0);
        c.lineTo(x0 + dx * s1 + ox0 + (ox1 - ox0) * s1, y0 + dy * s1 + oy0 + (oy1 - oy0) * s1); c.stroke();
      }
    }
    // rim on the lit edge, a dark hairline on the other
    const lx0 = dir > 0 ? bx : ax, ly0 = dir > 0 ? by : ay, lx1 = dir > 0 ? cx : ex, ly1 = dir > 0 ? cy : ey;
    const kx0 = dir > 0 ? ax : bx, ky0 = dir > 0 ? ay : by, kx1 = dir > 0 ? ex : cx, ky1 = dir > 0 ? ey : cy;
    c.lineWidth = Math.max(1.2, mw * 0.12); c.strokeStyle = `rgba(${rim},.6)`; c.beginPath(); c.moveTo(lx0, ly0); c.lineTo(lx1, ly1); c.stroke();
    c.lineWidth = Math.max(1, mw * 0.12); c.strokeStyle = 'rgba(8,4,2,.28)'; c.beginPath(); c.moveTo(kx0, ky0); c.lineTo(kx1, ky1); c.stroke();
    c.restore();
  }
  // A brush lying on the tray: wooden handle, metal ferrule, a tip of bristles charged with paint.
  function easelBrush(c, x, y, len, th, slope, flip, tip, P) {
    c.save(); c.translate(x, y); c.rotate(slope); if (flip) c.scale(-1, 1);
    const hl = len * 0.66, fl = len * 0.2, bl = len * 0.14;
    c.fillStyle = easelRGB(easelMix(P.sh, [28, 18, 12], 0.6)); // handle, tapering to a thin end
    c.beginPath(); c.moveTo(0, -th * 0.28); c.lineTo(hl, -th * 0.5); c.lineTo(hl, th * 0.5); c.lineTo(0, th * 0.28); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,230,190,.22)'; c.fillRect(th, -th * 0.34, hl - th * 1.4, th * 0.2);
    c.fillStyle = '#9a9ca2'; c.fillRect(hl, -th * 0.55, fl, th * 1.1);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(hl, -th * 0.55, fl, th * 0.28);
    c.fillStyle = easelRGB(tip); c.beginPath(); c.moveTo(hl + fl, -th * 0.5); c.quadraticCurveTo(hl + fl + bl * 0.8, -th * 0.5, hl + fl + bl, 0);
    c.quadraticCurveTo(hl + fl + bl * 0.8, th * 0.5, hl + fl, th * 0.5); c.closePath(); c.fill();
    c.restore();
  }
  let easelWeave = null, easelWeaveL = null, easelNoise = null;
  SUPPORTS.easel = {
    name: 'Chevalet', ink: '#2e2721',
    box: (W, H, u) => ({ top: Math.max(H * 0.1, Math.min(58, H * 0.17)), bottom: H * 0.19, side: u * 0.04 }),
    edge: (u) => ({ t: 0, r: Math.max(6, u * 0.026) + Math.max(5, u * 0.0135), b: Math.max(7, u * 0.016) + Math.max(9, u * 0.0165), l: Math.max(6, u * 0.026) }),
    draw(c, S, W, H, o) {
      const mini = o.mini, u = o.u, R = o.R, L = o.light, cx = S.x + S.w / 2, yb = S.y + S.h;
      const k = (c.getTransform && c.getTransform().a) || 1, kind = easelKind(o.scene);
      const dir = L ? (L.x >= cx ? 1 : -1) : (EASEL_DIR[o.scene] || -1);
      const base = EASEL_WOOD[kind], ua = o.under ? [o.under[0] * 255, o.under[1] * 255, o.under[2] * 255] : null;
      const P = ua ? { sh: easelMix(base.sh, ua, 0.22), md: easelMix(base.md, ua, 0.08), lt: base.lt } : base;
      const Pb = { sh: easelMix(P.sh, [8, 6, 6], 0.35), md: easelMix(P.md, P.sh, 0.62), lt: easelMix(P.lt, P.sh, 0.58) }; // the back leg, in the shade
      const rim = o.scene === 'lake' ? '255,196,128' : L ? L.rgb : '255,238,212';
      const rimTop = L ? L.rgb : '255,244,226';
      // sizes
      const mw = Math.max(mini ? 2.2 : 8, u * 0.0165), lw = Math.max(mini ? 2.2 : 7, u * 0.0195), d = Math.max(mini ? 1.6 : 5, u * 0.0135);
      const tt = Math.max(mini ? 1 : 7, u * 0.016), tf = Math.max(mini ? 1.8 : 9, u * 0.0165);
      const ov = Math.max(mini ? 2.5 : 6, Math.min(u * 0.026, S.x - d - 3));
      const tx0 = S.x - ov - (dir < 0 ? d : 0), tx1 = S.x + S.w + ov + (dir > 0 ? d : 0), ty = yb, tb = ty + tt + tf; // tray: left, right, top of its top face, bottom of its front
      const mTop = S.y - Math.max(mini ? 3 : 20, S.y * 0.64), mEnd = tb + Math.max(mini ? 3 : 14, u * 0.06);
      const spread = S.w * 0.31, off = (y) => spread * (y - S.y) / (H - S.y);
      const gr = mini ? 0 : 1, wood = []; // the rectangles holding wood, for the film grain

      /* the shadow the whole easel throws on the scene: very soft, away from the light (blurred small, then scaled up) */
      {
        const out = kind === 'weathered', OFF = W + 400, q = mini ? 1 : 0.25, oc = document.createElement('canvas');
        const kk = mini ? k : 1; oc.width = Math.ceil(W * q * kk); oc.height = Math.ceil(H * q * kk);
        const g = oc.getContext('2d');
        g.scale(q * kk, q * kk);
        g.shadowColor = kind === 'natural' ? 'rgba(70,48,28,.26)' : out ? 'rgba(4,6,18,.34)' : 'rgba(6,3,2,.4)';
        g.shadowBlur = u * (out ? 0.05 : 0.035) * q * kk; g.shadowOffsetX = (OFF - dir * u * 0.016) * q * kk; g.shadowOffsetY = u * 0.012 * q * kk;
        g.translate(-OFF, 0); g.fillStyle = '#000'; g.beginPath();
        g.rect(S.x - 1, S.y - 1, S.w + 2 + d, S.h + 2); g.rect(tx0, ty, tx1 - tx0, tb - ty);
        g.rect(cx - mw / 2, mTop, mw, mEnd - mTop);
        for (const sg of [-1, 1]) { const y1 = tb - 8, y2 = H + 10; g.moveTo(cx + sg * off(y1) - lw / 2, y1); g.lineTo(cx + sg * off(y1) + lw / 2, y1); g.lineTo(cx + sg * off(y2) + lw / 2, y2); g.lineTo(cx + sg * off(y2) - lw / 2, y2); g.closePath(); }
        g.fill();
        const bl = u * 0.06 + 6, rx0 = Math.max(0, Math.floor(Math.min(tx0, S.x) - bl)), rx1 = Math.min(W, Math.ceil(tx1 + d + bl)), ry0 = Math.max(0, Math.floor(mTop - bl)); // only where the shadow can be
        c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low'; c.drawImage(oc, rx0 * q * kk, ry0 * q * kk, (rx1 - rx0) * q * kk, (H - ry0) * q * kk, rx0, ry0, rx1 - rx0, H - ry0); c.restore();
      }

      wood.push([cx - mw * 1.5, mTop, mw * 3, S.y - mTop], [cx - mw * 1.5, tb, mw * 3, mEnd - tb + 4], [cx - lw, mEnd, lw * 2, H - mEnd], [tx0 - 1, ty, tx1 - tx0 + 2, tb - ty + u * 0.03], [cx - Math.max(22, mw * 2.5) / 2 - 1, S.y - Math.max(15, u * 0.027), Math.max(22, mw * 2.5) + 2, Math.max(15, u * 0.027) + 7]);
      for (const sg of [-1, 1]) wood.push([Math.min(cx + sg * off(tb - 8), cx + sg * off(H + 12)) - lw, tb - 8, Math.abs(off(H + 12) - off(tb - 8)) + lw * 2, H - tb + 20]);

      /* back leg (in the shade, a hair to the lit side as it recedes), then the mast */
      easelBar(c, cx + dir * mw * 0.3, mEnd - 12, cx + dir * mw * 0.3, H + 10, mw * 0.78, mw * 0.9, Pb, dir, rim, R, gr * 3);
      easelBar(c, cx, mTop, cx, mEnd, mw, mw, P, dir, rim, R, gr * 7);
      if (!mini) { // the mast's end shades the back leg
        c.fillStyle = easelLin(c, 0, mEnd, 0, mEnd + mw * 1.4, [[0, 'rgba(0,0,0,.34)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(cx + dir * mw * 0.3 - mw * 0.39, mEnd, mw * 0.78, mw * 1.4);
      }
      c.fillStyle = `rgba(${rimTop},.5)`; c.fillRect(cx - mw / 2 + 0.5, mTop, mw - 1, mini ? 0.6 : 1.2); // the mast's top end catches the light

      /* front legs: they meet behind the canvas and open slightly as they come down, leaving the screen */
      for (const sg of [-1, 1]) {
        const y1 = tb - 8, y2 = H + 12;
        easelBar(c, cx + sg * off(y1), y1, cx + sg * off(y2), y2, lw * 0.86, lw * 1.04, P, dir, rim, R, gr * 8);
        if (!mini) { // a small metal collar on each leg
          const t = 0.34, yy = y1 + (y2 - y1) * t, xx = cx + sg * off(yy);
          easelBar(c, xx, yy, cx + sg * off(yy + lw * 0.36), yy + lw * 0.36, lw * 1.1, lw * 1.1, EASEL_METAL, dir, rim, R, 0);
        }
      }

      if (!mini) easelBar(c, cx, tb - 2, cx, tb + Math.max(9, u * 0.024), mw * 1.9, mw * 1.9, { sh: P.sh, md: easelMix(P.md, P.sh, 0.35), lt: easelMix(P.lt, P.md, 0.3) }, dir, rim, R, 2); // the tray's mount on the mast

      /* the tray: its top face (a thin trapezoid seen from above), its front, a light edge */
      {
        const lit = dir > 0;
        c.beginPath(); c.moveTo(tx0 + 2, ty - tt * 0.5); c.lineTo(tx1 - 2, ty - tt * 0.5); c.lineTo(tx1, ty + tt); c.lineTo(tx0, ty + tt); c.closePath();
        c.fillStyle = easelLin(c, tx0, 0, tx1, 0, [[0, easelRGB(lit ? easelMix(P.md, P.sh, 0.3) : P.lt)], [1, easelRGB(lit ? P.lt : easelMix(P.md, P.sh, 0.3))]]); c.fill();
        c.fillStyle = `rgba(${rimTop},.16)`; c.fill();
        c.fillStyle = easelLin(c, tx0, 0, tx1, 0, [[0, easelRGB(lit ? P.sh : easelMix(P.md, P.lt, 0.5))], [0.45, easelRGB(P.md)], [1, easelRGB(lit ? easelMix(P.md, P.lt, 0.55) : P.sh)]]);
        c.fillRect(tx0, ty + tt, tx1 - tx0, tf);
        c.fillStyle = easelLin(c, 0, ty + tt, 0, tb, [[0, 'rgba(255,235,200,.22)'], [0.35, 'rgba(255,235,200,0)'], [1, 'rgba(0,0,0,.26)']]); c.fillRect(tx0, ty + tt, tx1 - tx0, tf);
        c.fillStyle = `rgba(${rim},.55)`; c.fillRect(tx0, ty + tt, tx1 - tx0, mini ? 0.6 : 1); // front-top bevel
        if (!mini) {
          c.save(); c.beginPath(); c.rect(tx0, ty + tt, tx1 - tx0, tf); c.clip();
          for (let i = 0; i < 9; i++) { const y = ty + tt + 2 + R() * (tf - 4), x = tx0 + R() * (tx1 - tx0), l = 30 + R() * 140; c.strokeStyle = R() < 0.7 ? `rgba(30,18,8,${0.06 + R() * 0.07})` : `rgba(255,240,215,${0.05 + R() * 0.05})`; c.lineWidth = 0.6 + R() * 0.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (R() - 0.5) * 1.2); c.stroke(); }
          c.restore();
        }
        // lit end of the tray
        c.fillStyle = `rgba(${rim},.5)`; c.fillRect(lit ? tx1 - 1.2 : tx0, ty + tt, 1.2, tf);
        // the tray's shadow on what is below it
        c.fillStyle = easelLin(c, 0, tb, 0, tb + u * 0.022, [[0, 'rgba(0,0,0,.26)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(tx0 + 2, tb, tx1 - tx0 - 4, u * 0.022);
      }

      /* the canvas: primed linen, calm and even; a soft fall of light from the lit side. Primed in the reading colour when asked. */
      {
        const tone = o.bg ? toneOf(o.bg) : null, f0 = tone ? tone.p : kind === 'natural' ? [237, 228, 209] : [233, 224, 204], a = dir > 0 ? S.x + S.w : S.x, b = dir > 0 ? S.x : S.x + S.w;
        c.fillStyle = easelLin(c, a, 0, b, 0, [[0, easelRGB(easelMix(f0, [255, 240, 205], 0.11))], [0.45, easelRGB(easelMix(f0, [255, 240, 205], 0.02))], [1, easelRGB(easelMix(f0, tone && tone.dark ? [0, 0, 0] : [92, 70, 44], 0.1))]]); c.fillRect(S.x, S.y, S.w, S.h);
        if (!mini) { // a hint of weave: dark threads, and on a dark ground light ones, or the cloth would read as a flat board
          const weave = (dark) => {
            const tile = document.createElement('canvas'), n = 96, g = tile.getContext('2d'); tile.width = tile.height = Math.round(n * k); g.scale(tile.width / n, tile.width / n); tile.k = k;
            const th = dark ? '60,44,26' : '255,246,228';
            for (let i = 0; i < n; i += 3) { g.fillStyle = `rgba(${th},${0.006 + R() * 0.012})`; g.fillRect(0, i, n, 1); g.fillStyle = `rgba(${th},${0.006 + R() * 0.012})`; g.fillRect(i + 1, 0, 1, n); }
            for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,250,238' : '70,52,32'},${0.012 + R() * 0.016})`; g.fillRect(R() * n, R() * n, 4 + R() * 22, 1); }
            return tile;
          };
          if (!easelWeave || easelWeave.k !== k) easelWeave = weave(true);
          const n0 = 96, pat = c.createPattern(easelWeave, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(n0 / easelWeave.width));
          c.fillStyle = pat; c.fillRect(S.x, S.y, S.w, S.h);
          if (tone && tone.l < 0.6) {
            if (!easelWeaveL || easelWeaveL.k !== k) easelWeaveL = weave(false);
            const pl = c.createPattern(easelWeaveL, 'repeat'); if (pl.setTransform) pl.setTransform(new DOMMatrix().scale(n0 / easelWeaveL.width));
            c.save(); c.globalAlpha = Math.min(1, (0.6 - tone.l) * 2.6); c.fillStyle = pl; c.fillRect(S.x, S.y, S.w, S.h); c.restore();
          }
          // the canvas pulls slightly at its edges
          c.fillStyle = easelLin(c, 0, S.y, 0, S.y + 7, [[0, 'rgba(70,48,28,.07)'], [1, 'rgba(70,48,28,0)']]); c.fillRect(S.x, S.y, S.w, 7);
        }
        // the stretcher's side, on the lit side: the primed canvas turning round the edge
        const ex = dir > 0 ? S.x + S.w : S.x - d, p = d * 0.34;
        c.beginPath();
        if (dir > 0) { c.moveTo(ex, S.y); c.lineTo(ex + d, S.y + p); c.lineTo(ex + d, yb - p); c.lineTo(ex, yb); }
        else { c.moveTo(ex + d, S.y); c.lineTo(ex, S.y + p); c.lineTo(ex, yb - p); c.lineTo(ex + d, yb); }
        c.closePath();
        const side = tone ? [easelMix(f0, tone.dark ? [0, 0, 0] : [92, 70, 44], 0.14), easelMix(f0, tone.dark ? [0, 0, 0] : [92, 70, 44], 0.07), easelMix(f0, [255, 240, 205], 0.05)].map((v) => easelRGB(v)) : ['#d9cbb0', '#e4d6ba', '#f1e4c6'];
        c.fillStyle = easelLin(c, dir > 0 ? ex : ex + d, 0, dir > 0 ? ex + d : ex, 0, [[0, side[0]], [0.55, side[1]], [1, side[2]]]); c.fill();
        c.save(); c.clip();
        c.fillStyle = `rgba(${rim},.18)`; c.fillRect(ex, S.y, d, S.h);
        c.fillStyle = easelLin(c, 0, S.y, 0, yb, [[0, 'rgba(255,255,255,0)'], [0.85, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.16)']]); c.fillRect(ex, S.y, d, S.h);
        c.restore();
        c.fillStyle = 'rgba(90,64,38,.3)'; c.fillRect(dir > 0 ? S.x + S.w : S.x - 1, S.y, 1, S.h); // the crease where the face turns
        c.fillStyle = `rgba(${rim},.7)`; c.fillRect(dir > 0 ? ex + d - 1 : ex, S.y + p, 1, S.h - 2 * p); // the lit corner
        // where the canvas stands on the tray
        c.fillStyle = easelLin(c, 0, yb, 0, yb + tt, [[0, 'rgba(20,10,4,.28)'], [1, 'rgba(20,10,4,0)']]); c.fillRect(S.x, yb, S.w + (dir > 0 ? d : 0), tt);
      }

      /* the clamp at the top of the mast, biting on the canvas */
      {
        const cw = Math.max(mini ? 4 : 22, mw * 2.5), ch = Math.max(mini ? 2.4 : 15, u * 0.027), bite = mini ? 1.2 : 7, y1 = S.y + bite, y0 = y1 - ch;
        if (!mini) { c.fillStyle = easelLin(c, 0, y1, 0, y1 + 9, [[0, 'rgba(40,24,10,.3)'], [1, 'rgba(40,24,10,0)']]); c.fillRect(cx - cw * 0.46, y1, cw * 0.92, 9); }
        easelBar(c, cx, y0, cx, y1, cw, cw, P, dir, rim, R, gr * 4);
        c.fillStyle = `rgba(${rimTop},.45)`; c.fillRect(cx - cw / 2 + 1, y0, cw - 2, mini ? 0.6 : 1.2);
        if (!mini) { // the clamp's screw
          const r = mw * 0.3, sx = cx, sy = y0 + ch * 0.46;
          c.fillStyle = easelRGB(EASEL_METAL.sh); c.beginPath(); c.arc(sx, sy, r + 0.8, 0, TAU); c.fill();
          c.fillStyle = easelLin(c, sx - r, sy - r, sx + r, sy + r, [[0, '#e6dcc2'], [1, '#7c6c4a']]); c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(40,28,14,.5)'; c.fillRect(sx - r * 0.7, sy - 0.4, r * 1.4, 0.9);
        }
      }

      /* small things on the tray: two brushes on the shaded side, a smear of paint at the other end */
      if (!mini) {
        const sh = dir > 0 ? 1 : -1, bl = u * 0.125, bx = dir > 0 ? S.x + S.w * 0.05 : S.x + S.w * 0.95 - bl; // brushes: handles toward the end of the tray
        c.save(); c.beginPath(); c.rect(tx0, ty - 3, tx1 - tx0, tt + 3); c.clip();
        easelBrush(c, bx, ty + tt * 0.34, bl, 3.4, -0.02 * sh, dir < 0, [188, 138, 66], P);
        easelBrush(c, bx + sh * 11, ty + tt * 0.68, bl * 0.86, 3, 0.012 * sh, dir < 0, [58, 84, 128], P);
        c.restore();
        const px = dir > 0 ? S.x + S.w * 0.84 : S.x + S.w * 0.16, py = ty + tt * 0.6;
        for (const [dx, dy, rx, col] of [[0, 0, 5.2, [176, 126, 56]], [-sh * 10, 1, 3.4, [150, 66, 48]]]) {
          c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(px + dx, py + dy + 1.2, rx, rx * 0.4, 0, 0, TAU); c.fill();
          c.fillStyle = easelRGB(col); c.beginPath(); c.ellipse(px + dx, py + dy, rx, rx * 0.44, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,240,220,.38)'; c.beginPath(); c.ellipse(px + dx - rx * 0.25, py + dy - rx * 0.14, rx * 0.34, rx * 0.12, 0, 0, TAU); c.fill();
        }
      }

      /* a fine film grain over the object only */
      if (!mini) {
        if (!easelNoise) {
          const n = 128, tile = document.createElement('canvas'); tile.width = tile.height = n; const g = tile.getContext('2d'), id = g.createImageData(n, n);
          for (let i = 0; i < id.data.length; i += 4) { const v = R() < 0.5 ? 0 : 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = (R() ** 2) * 11; }
          g.putImageData(id, 0, 0); easelNoise = tile;
        }
        c.save(); c.globalCompositeOperation = 'source-atop'; const pat = c.createPattern(easelNoise, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / k)); c.fillStyle = pat; for (const r of wood) c.fillRect(r[0], r[1], r[2], r[3]); c.restore();
      }
    },
  };
  /* support:easel:end */

  /* support:frame:start */
  // Cadre: a moulding with a real profile (bands of light and dark, mitred corners) around a mat (passe-partout) on which the
  // text sits. Material by scene: gilt (hearth), raw dark wood (forest), thin black (image), walnut (everything else).
  // The scene's light decides which edges shine; a picture light (hearth, nook) or a hanging cord (the others) is the one detail.
  const frameClamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const frameLerp = (a, b, t) => a + (b - a) * t;
  // Total margin kept around the text area (moulding + mat border), and the headroom above it for the lamp or the cord.
  const frameExt = (u) => Math.max(5, u * 0.056);
  const frameHead = (u) => Math.max(3, u * 0.05);
  // Colour ramps by value 0..1: [v, r, g, b].
  const FRAME_RAMP = {
    gilt: [[0, 36, 24, 11], [0.2, 86, 61, 27], [0.4, 138, 103, 48], [0.6, 183, 146, 74], [0.8, 223, 190, 112], [1, 252, 234, 172]],
    walnut: [[0, 19, 11, 6], [0.25, 49, 30, 17], [0.5, 87, 57, 34], [0.75, 130, 91, 58], [1, 180, 136, 94]],
    raw: [[0, 10, 7, 5], [0.25, 28, 20, 14], [0.5, 53, 39, 27], [0.75, 84, 64, 46], [1, 124, 97, 70]],
    black: [[0, 3, 3, 3], [0.3, 14, 14, 15], [0.6, 32, 31, 31], [1, 108, 102, 94]],
  };
  const frameRgb = (kind, v, a = 1) => {
    const r = FRAME_RAMP[kind], t = frameClamp(v, 0, 1);
    let i = 1; while (i < r.length - 1 && r[i][0] < t) i++;
    const p = r[i - 1], q = r[i], f = frameClamp((t - p[0]) / (q[0] - p[0]), 0, 1);
    return `rgba(${Math.round(frameLerp(p[1], q[1], f))},${Math.round(frameLerp(p[2], q[2], f))},${Math.round(frameLerp(p[3], q[3], f))},${a})`;
  };
  // Profiles, outer edge to sight edge: [width, tone at the outer side, tilt there, tone at the inner side, tilt there]; the tilt is
  // how much the surface faces away from the wall's centre (+1) or toward it (-1): it decides how the light plays on the band.
  const FRAME_KIND = {
    gilt: {
      fw: 0.76, gain: 0.5, spec: 0.5, mat: ['233,222,199', '242,234,214'], beads: 4,
      prof: [[0.07, 0.5, 0.55, 0.52, 0.35], [0.27, 0.52, 1, 0.5, -1], [0.04, 0.72, 0, 0.72, 0], [0.19, 0.3, -0.9, 0.34, 0.9], [0.17, 0.5, 0, 0.5, 0], [0.03, 0.7, 0, 0.7, 0], [0.23, 0.52, -1, 0.5, -0.2]],
    },
    walnut: {
      fw: 0.7, gain: 0.42, spec: 0.16, mat: ['234,226,208', '242,236,221'], grain: 1,
      prof: [[0.06, 0.55, 0.6, 0.55, 0.4], [0.4, 0.5, 1, 0.52, -0.15], [0.04, 0.62, 0, 0.62, 0], [0.28, 0.46, 0, 0.46, 0], [0.22, 0.5, -0.9, 0.48, -0.5]],
    },
    raw: {
      fw: 0.8, gain: 0.36, spec: 0, mat: ['231,222,204', '240,233,217'], grain: 2,
      prof: [[0.14, 0.42, 1, 0.44, 0.6], [0.6, 0.45, 0.1, 0.45, 0.1], [0.26, 0.42, -0.9, 0.4, -0.7]],
    },
    black: {
      fw: 0.3, gain: 0.45, spec: 0.3, mat: ['241,238,231', '247,245,240'],
      prof: [[0.28, 0.34, 0.8, 0.22, 0.2], [0.44, 0.16, 0, 0.16, 0], [0.28, 0.26, -0.8, 0.3, -0.6]],
    },
  };
  // One side of a band as a trapezoid (so the corners come out mitred); g is the gradient line across it.
  function frameQuad(s, X0, Y0, X1, Y1, a, b) {
    switch (s) {
      case 0: return { p: [X0 + a, Y0 + a, X1 - a, Y0 + a, X1 - b, Y0 + b, X0 + b, Y0 + b], g: [0, Y0 + a, 0, Y0 + b] };
      case 1: return { p: [X1 - a, Y0 + a, X1 - a, Y1 - a, X1 - b, Y1 - b, X1 - b, Y0 + b], g: [X1 - a, 0, X1 - b, 0] };
      case 2: return { p: [X1 - a, Y1 - a, X0 + a, Y1 - a, X0 + b, Y1 - b, X1 - b, Y1 - b], g: [0, Y1 - a, 0, Y1 - b] };
      default: return { p: [X0 + a, Y1 - a, X0 + a, Y0 + a, X0 + b, Y0 + b, X0 + b, Y1 - b], g: [X0 + a, 0, X0 + b, 0] };
    }
  }
  function frameFill(c, q, fill) {
    c.fillStyle = fill; c.beginPath(); c.moveTo(q.p[0], q.p[1]);
    for (let i = 2; i < 8; i += 2) c.lineTo(q.p[i], q.p[i + 1]);
    c.closePath(); c.fill();
  }
  // A point on side s of the moulding: along its length, perp in from the outer edge.
  const framePt = (s, X0, Y0, X1, Y1, along, perp) => s === 0 ? [X0 + along, Y0 + perp] : s === 1 ? [X1 - perp, Y0 + along] : s === 2 ? [X0 + along, Y1 - perp] : [X0 + perp, Y0 + along];
  // Wood grain: long wavering strokes along each side, clipped to the moulding by the caller.
  function frameWood(c, X0, Y0, X1, Y1, F, kind, R, u) {
    const rough = kind === 2, n = Math.round(F * (rough ? 1.1 : 0.9));
    c.lineCap = 'round';
    for (let s = 0; s < 4; s++) {
      const len = s % 2 ? Y1 - Y0 : X1 - X0;
      for (let i = 0; i < n; i++) {
        const p = R() * F, a = p + R() * len * 0.1, b = len - p - R() * len * 0.1, dark = R() < 0.62;
        const seg = 5 + (R() * 4 | 0), amp = (rough ? 1.1 : 0.6) * (0.4 + R());
        c.beginPath();
        let q = framePt(s, X0, Y0, X1, Y1, a, p); c.moveTo(q[0], q[1]);
        for (let j = 1; j <= seg; j++) {
          const al = frameLerp(a, b, j / seg), w = (R() - 0.5) * 2 * amp;
          q = framePt(s, X0, Y0, X1, Y1, al, p + w); const m = framePt(s, X0, Y0, X1, Y1, al - (b - a) / seg / 2, p + w * 0.4);
          c.quadraticCurveTo(m[0], m[1], q[0], q[1]);
        }
        c.lineWidth = (rough ? 0.7 : 0.5) + R() * (rough ? 1.1 : 0.7);
        c.strokeStyle = dark ? `rgba(14,6,2,${(rough ? 0.1 : 0.07) + R() * (rough ? 0.16 : 0.1)})` : `rgba(215,165,115,${0.05 + R() * 0.07})`;
        c.stroke();
      }
    }
    if (rough) { // a couple of knots, and a few short checks in the grain
      for (let k = 0; k < 3; k++) {
        const s = (R() * 4) | 0, len = s % 2 ? Y1 - Y0 : X1 - X0, q = framePt(s, X0, Y0, X1, Y1, len * (0.18 + R() * 0.64), F * (0.3 + R() * 0.4)), r = F * (0.1 + R() * 0.08);
        for (let j = 3; j >= 0; j--) {
          c.beginPath(); c.ellipse(q[0], q[1], (s % 2 ? r : r * 2.2) * (1 + j * 0.55), (s % 2 ? r * 2.2 : r) * (1 + j * 0.55), 0, 0, TAU);
          c.strokeStyle = `rgba(8,4,2,${0.1 + (3 - j) * 0.04})`; c.lineWidth = 0.8; c.stroke();
        }
        c.fillStyle = 'rgba(6,3,1,.4)'; c.beginPath(); c.ellipse(q[0], q[1], s % 2 ? r * 0.5 : r, s % 2 ? r : r * 0.5, 0, 0, TAU); c.fill();
      }
      for (let k = 0; k < 7; k++) {
        const s = (R() * 4) | 0, len = s % 2 ? Y1 - Y0 : X1 - X0, a = len * (0.1 + R() * 0.8), p = R() * F, a2 = a + u * (0.008 + R() * 0.02);
        const q0 = framePt(s, X0, Y0, X1, Y1, a, p), q1 = framePt(s, X0, Y0, X1, Y1, a2, p + (R() - 0.5) * 1.2);
        c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.strokeStyle = 'rgba(5,2,1,.4)'; c.lineWidth = 0.7; c.stroke();
      }
    }
  }
  // A row of small pearls along the frieze of the gilt moulding (one per step, the corners shared).
  function frameBeads(c, X0, Y0, X1, Y1, ctr, dia, dx, dy) {
    const r = dia / 2, pitch = dia * 1.34, x0 = X0 + ctr, y0 = Y0 + ctr, x1 = X1 - ctr, y1 = Y1 - ctr;
    const bead = (x, y) => {
      const g = c.createRadialGradient(x + dx * r * 0.38, y + dy * r * 0.38, r * 0.05, x, y, r);
      g.addColorStop(0, frameRgb('gilt', 0.97)); g.addColorStop(0.42, frameRgb('gilt', 0.62)); g.addColorStop(1, frameRgb('gilt', 0.16));
      c.fillStyle = 'rgba(30,18,6,.35)'; c.beginPath(); c.arc(x - dx * r * 0.18, y - dy * r * 0.18 + r * 0.12, r * 1.08, 0, TAU); c.fill();
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    };
    const run = (ax, ay, bx, by) => { const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / pitch)); for (let i = 0; i < n; i++) bead(frameLerp(ax, bx, i / n), frameLerp(ay, by, i / n)); };
    run(x0, y0, x1, y0); run(x1, y0, x1, y1); run(x1, y1, x0, y1); run(x0, y1, x0, y0);
  }
  // The scene's light on the object: a broad, even pool with no hot spot where the lamp is close.
  function frameGlow(c, x, y, r, rgb, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = rad(c, x, y, r, [[0, `rgba(${rgb},${a * 0.8})`], [0.3, `rgba(${rgb},${a * 0.62})`], [0.65, `rgba(${rgb},${a * 0.22})`], [1, `rgba(${rgb},0)`]]);
    c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  }
  // The thin cord to a nail, drawn behind the moulding.

  function frameCord(c, cx, top, fw, F, rise, u, dark, sx, sy) {
    const spread = fw * 0.27, ny = top - rise, y0 = top + F * 0.5, lw = Math.max(1, u * 0.0016);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    const path = (ox, oy) => { c.beginPath(); c.moveTo(cx - spread + ox, y0 + oy); c.lineTo(cx + ox, ny + oy); c.lineTo(cx + spread + ox, y0 + oy); };
    path(sx * 0.35, Math.max(1.5, sy * 0.4)); c.strokeStyle = 'rgba(0,0,0,.1)'; c.lineWidth = lw * 1.6; c.stroke();
    path(0, 0); c.strokeStyle = dark ? 'rgba(78,58,38,.92)' : 'rgba(190,160,114,.9)'; c.lineWidth = lw; c.stroke();
    const nr = Math.max(1.6, u * 0.0034);
    c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.arc(cx + sx * 0.2, ny + Math.max(1, sy * 0.25), nr * 1.1, 0, TAU); c.fill();

    c.fillStyle = rad(c, cx - nr * 0.3, ny - nr * 0.3, nr * 1.3, [[0, '#f0dca2'], [0.5, '#a98446'], [1, '#4d3a1c']]); c.beginPath(); c.arc(cx, ny, nr, 0, TAU); c.fill();
    c.restore();
  }
  // The brass picture light: a tube on a short stem above the frame, and the soft cone of warm light it throws down.
  function frameLamp(c, cx, top, fw, fh, head, u, k, sx, sy, ring, mat) {
    const Lb = frameClamp(fw * 0.3, 24, u * 0.36), tb = Math.max(3.4, head * 0.17), gap = Math.max(4, head * 0.3), ty = top - gap - tb / 2;
    // the pool of light: brightest under the tube, easing out over the moulding and the mat
    const pool = (a, rx, ry) => {
      c.save(); c.translate(cx, ty + tb * 0.5); c.scale(1, ry / rx);
      c.fillStyle = rad(c, 0, 0, rx, [[0, `rgba(255,212,148,${a})`], [0.2, `rgba(255,208,142,${a * 0.68})`], [0.5, `rgba(255,200,130,${a * 0.28})`], [0.78, `rgba(255,196,124,${a * 0.07})`], [1, 'rgba(255,196,124,0)']]);
      c.fillRect(-rx, 0, rx * 2, rx); c.restore();
    };
    c.save(); c.globalCompositeOperation = 'lighter';
    c.save(); c.beginPath(); c.rect(...ring); c.rect(...mat); c.clip('evenodd'); pool(0.42, fw * 0.6, fh * 0.3); c.restore();
    c.save(); c.beginPath(); c.rect(...mat); c.clip(); pool(0.07, fw * 0.62, fh * 0.55); c.restore();
    c.save(); c.translate(cx, ty + tb * 0.5); c.scale(Lb * 0.012, head * 0.018); light(c, 0, 0, 60, '255,206,140', 0.3); c.restore();
    c.restore();
    // the fixture
    const brass = (x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); [[0, '#3a2a10'], [0.22, '#b48f48'], [0.42, '#f2dc98'], [0.62, '#b8923f'], [1, '#4a3512']].forEach(([t, col]) => g.addColorStop(t, col)); return g; };
    const sw = Math.max(2, tb * 0.42);
    c.fillStyle = brass(cx - sw, 0, cx + sw, 0); c.fillRect(cx - sw / 2, ty, sw, top - ty);
    c.fillStyle = brass(0, top - tb * 0.45, 0, top + 1); rrect(c, cx - tb * 0.95, top - tb * 0.5, tb * 1.9, tb * 0.6, 1); c.fill();
    c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = tb * 1.1 * k; c.shadowOffsetX = sx * 0.3 * k; c.shadowOffsetY = Math.max(2, sy * 0.45) * k;
    c.fillStyle = brass(0, ty - tb / 2, 0, ty + tb / 2); rrect(c, cx - Lb / 2, ty - tb / 2, Lb, tb, tb / 2); c.fill(); c.restore();
    for (const e of [-1, 1]) { // end caps
      c.fillStyle = brass(0, ty - tb / 2, 0, ty + tb / 2); rrect(c, cx + e * (Lb / 2 - tb * 0.55) - tb * 0.28, ty - tb * 0.56, tb * 0.56, tb * 1.12, tb * 0.2); c.fill();
    }
    c.fillStyle = 'rgba(255,238,196,.92)'; c.fillRect(cx - Lb / 2 + tb * 1.1, ty + tb * 0.34, Lb - tb * 2.2, Math.max(0.8, tb * 0.13));
  }

  SUPPORTS.frame = {
    name: 'Cadre', ink: '#2a221b',
    // Moulding + mat border (ext) on every side, headroom above for the lamp or the cord, the dock's room below.
    box: (W, H, u) => { const E = frameExt(u); return { top: E + frameHead(u), bottom: E + Math.max(4, H * 0.074)
, side: E + Math.max(6, u * 0.012) }; },
    edge: (u) => { const E = frameExt(u); return { t: E, r: E, b: E, l: E }; },
    draw(c, S, W, H, o) {
      const u = o.u, mini = o.mini, sc = o.scene, R = o.R;
      const kind = sc === 'hearth' ? 'gilt' : sc === 'forest' || sc === 'alpes' ? 'raw' : sc === 'image' ? 'black' : 'walnut', K = FRAME_KIND[kind], rk = kind;
      const E = frameExt(u), F = Math.max(mini ? 2.6 : 3, E * K.fw), m = E - F;
      const X0 = S.x - E, Y0 = S.y - E, X1 = S.x + S.w + E, Y1 = S.y + S.h + E, fw = X1 - X0, fh = Y1 - Y0, cx = S.x + S.w / 2, cy = S.y + S.h / 2;
      const mx0 = S.x - m, my0 = S.y - m, mx1 = S.x + S.w + m, my1 = S.y + S.h + m;
      // the light: the scene's, or a soft one from the top left
      const Lg = o.light;
      let lx, ly, lr, rgb;
      if (Lg) { lx = Lg.x; ly = Lg.y; lr = Lg.r; rgb = Lg.rgb; }
      else if (mini && sc === 'hearth') { lx = X0 - u * 1.4; ly = cy + u * 0.3; lr = u * 3; rgb = '255,170,90'; }
      else { lx = cx - u * 0.9; ly = Y0 - u * 1.1; lr = u * 2.6; rgb = '255,228,186'; }
      const dl = Math.hypot(lx - cx, ly - cy) || 1, dx = (lx - cx) / dl, dy = (ly - cy) / dl;
      const NRM = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const lit = NRM.map(([nx, ny]) => frameClamp(0.85 * (nx * dx + ny * dy) + 0.3 * -ny, -1, 1)); // how much each outer face is lit
      const k = c.getTransform ? c.getTransform().a : 1;
      // wall shadow, thrown away from the light, tinted by what's behind
      const un = o.under, ul = un ? 0.2126 * un[0] + 0.7152 * un[1] + 0.0722 * un[2] : 0.06;
      const shA = frameLerp(0.7, 0.5, frameClamp((ul - 0.15) / 0.5, 0, 1)), sg = un ? un.map((v) => Math.round(v * 255 * 0.08 + 3)) : [3, 2, 1];
      const sd = u * 0.02, sx = -dx * sd, sy = Math.max(-dy * sd * 0.8, sd * 0.45), shc = (a) => `rgba(${sg[0]},${sg[1]},${sg[2]},${a})`;
      c.save(); c.fillStyle = '#000';
      c.shadowColor = shc(shA); c.shadowBlur = u * 0.042 * k; c.shadowOffsetX = sx * k; c.shadowOffsetY = sy * k; c.fillRect(X0, Y0, fw, fh);
      c.shadowColor = shc(shA * 0.8); c.shadowBlur = Math.max(1.5, u * 0.007) * k; c.shadowOffsetX = sx * 0.2 * k; c.shadowOffsetY = Math.max(1, sy * 0.3) * k; c.fillRect(X0, Y0, fw, fh);
      c.restore();
      const head = frameHead(u), lamp = (sc === 'hearth' || sc === 'nook') && !mini;
      if (!lamp && !mini) frameCord(c, cx, Y0, fw, F, head * 0.62, u, ul > 0.4, sx, sy);
      // the moulding, band by band, each side lit by how it faces the light
      c.save(); c.beginPath(); c.rect(X0, Y0, fw, fh); c.rect(mx0, my0, mx1 - mx0, my1 - my0); c.clip('evenodd');
      c.fillStyle = frameRgb(rk, 0.4); c.fillRect(X0, Y0, fw, fh);
      const tot = K.prof.reduce((s, b) => s + b[0], 0);
      let acc = 0, beadAt = null;
      K.prof.forEach(([w, v0, t0, v1, t1], bi) => {
        const a = acc / tot * F, b = (acc + w) / tot * F; acc += w;
        if (K.beads === bi) beadAt = [a, b];
        for (let s = 0; s < 4; s++) {
          const q = frameQuad(s, X0, Y0, X1, Y1, a, b), L = lit[s], g = c.createLinearGradient(...q.g), st = [];
          const at = (f) => frameClamp(frameLerp(v0, v1, f) + frameLerp(t0, t1, f) * L * K.gain, 0, 1);
          for (let i = 0; i <= 4; i++) st.push([i / 4, at(i / 4)]);
          if (K.spec && t0 !== t1) { // a thin sheen where the roll turns toward the light
            const f = (L * 0.75 - t0) / (t1 - t0);
            if (f > 0.06 && f < 0.94) { const sp = K.spec * (0.45 + 0.55 * Math.abs(L)); st.push([f - 0.1, at(f - 0.1)], [f, frameClamp(at(f) + sp, 0, 1)], [f + 0.1, at(f + 0.1)]); }
          }
          st.sort((p, r) => p[0] - r[0]).forEach(([f, v]) => g.addColorStop(frameClamp(f, 0, 1), frameRgb(rk, v)));

          frameFill(c, q, g);
        }
      });
      if (beadAt && !mini && beadAt[1] - beadAt[0] >= 4.5) frameBeads(c, X0, Y0, X1, Y1, (beadAt[0] + beadAt[1]) / 2, (beadAt[1] - beadAt[0]) * 0.74, dx, dy);
      if (K.grain && !mini) frameWood(c, X0, Y0, X1, Y1, F, K.grain, R, u);
      // mitre joints
      c.lineWidth = Math.max(0.6, u * 0.0009);
      for (const [ax, ay, bx, by] of [[X0, Y0, X0 + F, Y0 + F], [X1, Y0, X1 - F, Y0 + F], [X1, Y1, X1 - F, Y1 - F], [X0, Y1, X0 + F, Y1 - F]]) {
        c.strokeStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        c.strokeStyle = 'rgba(255,235,190,.07)'; c.beginPath(); c.moveTo(ax + 0.8, ay); c.lineTo(bx + 0.8, by); c.stroke();
      }
      // far from the light the moulding falls into shade; near it, it warms
      const fg = c.createLinearGradient(cx + dx * fw * 0.5, cy + dy * fh * 0.5, cx - dx * fw * 0.5, cy - dy * fh * 0.5);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, `rgba(0,0,0,${kind === 'black' ? 0.2 : 0.32})`);
      c.fillStyle = fg; c.fillRect(X0, Y0, fw, fh);
      if (kind === 'gilt' && !mini) { // old gilding: the corners darkened by age, a few rubbed specks
        for (const [px, py] of [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]) { c.fillStyle = rad(c, px, py, F * 2.4, [[0, 'rgba(46,26,8,.3)'], [1, 'rgba(46,26,8,0)']]); c.fillRect(px - F * 2.4, py - F * 2.4, F * 4.8, F * 4.8); }
        for (let i = 0; i < 70; i++) { const px = X0 + R() * fw, py = Y0 + R() * fh, r = 0.6 + R() * 1.8; c.fillStyle = R() < 0.7 ? 'rgba(60,34,10,.16)' : 'rgba(255,236,180,.1)'; c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill(); }
      }
      frameGlow(c, lx, ly, lr, rgb, kind === 'black' ? 0.2 : 0.34);
      if (!mini) grain(c, W, H, kind === 'raw' ? 0.14 : 0.08);
      c.restore();
      // the mat: a board with a lighter sheet seen through the bevelled opening. In the reading colours, the sheet takes the
      // background and the board a breath off it (darker on a light ground, lighter on a dark one); the bevel shows its core.
      const bi = mini ? 1.6 : frameClamp(u * 0.0155, 8, 15), bw = mini ? 1 : frameClamp(u * 0.0026, 1.4, 2.4);
      const tone = o.bg ? toneOf(o.bg) : null, matSheet = tone ? tone.p : null;
      const matBoard = tone ? mixRGB(tone.p, tone.dark ? [255, 250, 240] : [70, 52, 30], tone.dark ? 0.05 : 0.06) : null;
      const matSh = tone && tone.dark ? '0,0,0' : '50,32,14', matShK = tone && tone.dark ? 1.7 : 1;
      c.save(); c.beginPath(); c.rect(mx0, my0, mx1 - mx0, my1 - my0); c.clip();
      c.fillStyle = matBoard ? rgbCss(matBoard) : `rgb(${K.mat[0]})`; c.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
      // the frame's shadow on the mat, strongest under the sides that face the light
      const sl = Math.max(2, m * 1.05);
      for (let s = 0; s < 4; s++) {
        const a = (0.07 + 0.2 * Math.max(0, lit[s])) * matShK;
        const g = s === 0 ? c.createLinearGradient(0, my0, 0, my0 + sl) : s === 1 ? c.createLinearGradient(mx1, 0, mx1 - sl, 0) : s === 2 ? c.createLinearGradient(0, my1, 0, my1 - sl) : c.createLinearGradient(mx0, 0, mx0 + sl, 0);
        g.addColorStop(0, `rgba(${matSh},${a})`); g.addColorStop(1, `rgba(${matSh},0)`); c.fillStyle = g;
        c.fillRect(s === 1 ? mx1 - sl : mx0, s === 2 ? my1 - sl : my0, s % 2 ? sl : mx1 - mx0, s % 2 ? my1 - my0 : sl);
      }
      const ox = S.x + bi, oy = S.y + bi, ow = S.w - bi * 2, oh = S.h - bi * 2;
      c.fillStyle = matSheet ? rgbCss(matSheet) : `rgb(${K.mat[1]})`; c.fillRect(ox, oy, ow, oh);
      // the cut: a bright core where it faces the light, a shaded one opposite, and a hairline on the board's edge
      const coreLit = tone ? mixRGB(tone.p, [255, 252, 244], tone.dark ? 0.3 : 0.62) : [255, 251, 240];
      const coreSh = tone ? mixRGB(tone.p, tone.dark ? [255, 252, 244] : [120, 100, 70], tone.dark ? 0.1 : 0.14) : [226, 215, 192];
      for (let s = 0; s < 4; s++) {
        const q = frameQuad(s, ox, oy, ox + ow, oy + oh, 0, bw), f = frameClamp(0.5 - 0.5 * lit[s] * 1.4 + 0.1, 0, 1);
        frameFill(c, q, rgbCss(mixRGB(coreLit, coreSh, f)));
      }
      c.lineWidth = mini ? 0.5 : 0.8; c.strokeStyle = 'rgba(80,58,34,.3)'; c.strokeRect(ox - 0.4, oy - 0.4, ow + 0.8, oh + 0.8);
      if (!mini) { // a breath of shadow under the cut, on the sheet
        for (const s of [0, 3]) {
          const g = s === 0 ? c.createLinearGradient(0, oy + bw, 0, oy + bw + 5) : c.createLinearGradient(ox + bw, 0, ox + bw + 5, 0);
          g.addColorStop(0, 'rgba(70,48,24,.1)'); g.addColorStop(1, 'rgba(70,48,24,0)'); c.fillStyle = g;
          if (s === 0) c.fillRect(ox + bw, oy + bw, ow - bw * 2, 5); else c.fillRect(ox + bw, oy + bw, 5, oh - bw * 2);
        }
      }
      // light across the board: a little warmer near the light, a little deeper opposite; a very fine paper grain
      const pg = c.createLinearGradient(cx + dx * S.w * 0.6, cy + dy * S.h * 0.6, cx - dx * S.w * 0.6, cy - dy * S.h * 0.6);
      pg.addColorStop(0, 'rgba(255,246,228,.06)'); pg.addColorStop(1, 'rgba(70,48,26,.06)'); c.fillStyle = pg; c.fillRect(mx0, my0, mx1 - mx0, my1 - my0);
      frameGlow(c, lx, ly, lr, rgb, sc === 'hearth' ? 0.05 : 0.03);
      if (!mini) grain(c, W, H, 0.035);
      c.restore();
      if (lamp) frameLamp(c, cx, Y0, fw, fh, head, u, k, sx, sy, [X0, Y0, fw, fh], [mx0, my0, mx1 - mx0, my1 - my0]);
    },
  };
  /* support:frame:end */

  /* support:book:start */
  // An open hardcover book seen from above: cover boards (leather or cloth), the stacked page edges, two pages sinking into the
  // spine, a silk ribbon. The right page is the text; the left page (when it fits) is calm paper too.
  const bookVariants = {
    nook: { tex: 'leather', texA: 1, cover: ['#5f3d25', '#432818', '#25140a'], gilt: '216,176,100', paper: '#f2e7cf', edge: '#d9c8a2', sh: '66,44,22', ink: '#2b2219', rib: ['#3a070c', '#86161c', '#c03a3b'] },
    snow: { tex: 'linen', texA: 1, cover: ['#8797a4', '#62748a', '#3b4756'], gilt: null, paper: '#edeade', edge: '#cfcdbd', sh: '52,52,58', ink: '#25292e', rib: ['#5a3f14', '#a07c33', '#d6b86e'] },
    base: { tex: 'linen', texA: 0.85, cover: ['#6f3531', '#4d2425', '#2c1415'], gilt: '208,170,98', paper: '#f2e9d5', edge: '#dacba7', sh: '62,42,22', ink: '#2c231a', rib: ['#5a3f14', '#a78236', '#d6ba6c'] },
  };
  // The variant in the reading colours: the paper takes the background; the page edges follow it, a little deeper; on dark
  // paper the shading turns black and the light lines on the edges are kept faint.
  function bookTone(V, bg, fg) {
    if (!bg) return V;
    const t = toneOf(bg);
    return Object.assign({}, V, { paper: bg, ink: fg || V.ink, dark: t.dark, edge: rgbCss(mixRGB(t.p, t.dark ? [0, 0, 0] : [150, 120, 70], t.dark ? 0.22 : 0.13)), sh: t.dark ? '0,0,0' : V.sh });
  }
  const bookSm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bookTiles = {};
  // A small seamless tile for the cover material: pebbled leather or a loose linen weave.
  function bookTile(kind) {
    if (bookTiles[kind]) return bookTiles[kind];
    const n = kind === 'linen' ? 96 : 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'); let s = kind === 'linen' ? 7 : 11;
    const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    if (kind === 'linen') {
      for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) for (let b = 0; b < n;) {
        const len = 4 + (r() * 26 | 0), al = (pass ? 0.07 : 0.11) * r();
        g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${al * 1.2})` : `rgba(255,255,255,${al})`;
        for (const o of [0, -n]) { if (pass) g.fillRect(a, b + o, 1, len); else g.fillRect(b + o, a, len, 1); }
        b += len;
      }
    } else {
      for (let i = 0; i < 560; i++) {
        const x = r() * n, y = r() * n, rr = 0.7 + r() * 1.5, a = 0.05 + r() * 0.12;
        g.fillStyle = r() < 0.62 ? `rgba(0,0,0,${a * 1.2})` : `rgba(255,228,188,${a * 0.4})`;
        for (const ox of [0, -n, n]) for (const oy of [0, -n, n]) {
          const X = x + ox, Y = y + oy; if (X < -rr || Y < -rr || X > n + rr || Y > n + rr) continue;
          g.beginPath(); g.arc(X, Y, rr, 0, TAU); g.fill();
        }
      }
    }
    return (bookTiles[kind] = cv);
  }
  // Appends a rounded rectangle as a sub-path (rrect() starts a new path each time).
  function bookPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // The outline of the page block grown by (ox, oy): the top and bottom edges sink toward the spine, as the paper curves down into it.
  function bookStack(c, p, ox, oy) {
    const { x0, y0, x1, y1, gx, gw, dip, two } = p, r = 1 + Math.max(ox, oy) * 0.35, xl = two ? x0 - ox : x0, xr = x1 + ox;
    const bump = (x) => 1 - dip * Math.exp(-(((x - gx) / gw) ** 2));
    const ty = (x) => y0 - oy * bump(x), by = (x) => y1 + oy * bump(x);
    c.beginPath();
    const a = xl + (two ? r : 0), b = xr - r;
    c.moveTo(a, ty(a));
    for (let x = a + 6; x < b; x += 6) c.lineTo(x, ty(x));
    c.lineTo(b, ty(b)); c.arcTo(xr, ty(b), xr, ty(b) + r, r); c.lineTo(xr, by(b) - r); c.arcTo(xr, by(b), b, by(b), r);
    for (let x = b - 6; x > a; x -= 6) c.lineTo(x, by(x));
    c.lineTo(a, by(a));
    if (two) { c.arcTo(xl, by(a), xl, by(a) - r, r); c.lineTo(xl, ty(a) + r); c.arcTo(xl, ty(a), a, ty(a), r); }
    c.closePath();
  }
  // The ribbon: rises out of the crease, passes over the foot of the book and hangs on the table, with a swallow-tail cut.
  // Painted on its own small layer so its upper end can melt into the fold.
  function bookRibbon(c, d, V, q) {
    const { x, ya, yEdge, yEnd, w, drift, sx, sy, mini } = q, hw = w / 2, notch = w * 0.7, skew = w * 0.12, k = mini ? 0.5 : 1;
    const cx = (y) => x + drift * bookSm(yEdge - 6, yEnd, y), P = [], pad = w * 2 + 12;
    for (let y = ya; y < yEnd - skew; y += 3) P.push([cx(y), y]);
    const ox = x - pad - Math.max(0, -drift), oy = ya - 4, lw = w * 4 + 24 + Math.abs(drift), lh = yEnd - ya + pad;
    const lc = document.createElement('canvas'); lc.width = Math.ceil(lw * d); lc.height = Math.ceil(lh * d);
    const l = lc.getContext('2d'); l.scale(d, d); l.translate(-ox, -oy);
    const me = cx(yEnd), L = P.map((p) => [p[0] - hw, p[1]]), Rr = P.map((p) => [p[0] + hw, p[1]]);
    const sil = () => {
      l.beginPath(); l.moveTo(L[0][0], L[0][1]);
      for (const p of L) l.lineTo(p[0], p[1]);
      l.lineTo(me - hw, yEnd + skew); l.lineTo(me, yEnd - notch); l.lineTo(me + hw, yEnd - skew);
      for (let i = Rr.length - 1; i >= 0; i--) l.lineTo(Rr[i][0], Rr[i][1]);
      l.closePath();
    };
    l.fillStyle = V.rib[1]; l.shadowColor = 'rgba(8,4,2,.5)'; l.shadowBlur = (mini ? 1.5 : 7) * d; l.shadowOffsetX = sx * 0.8 * d; l.shadowOffsetY = sy * 0.8 * d;
    sil(); l.fill(); l.shadowColor = 'rgba(8,4,2,.42)'; l.shadowBlur = 1.2 * d * k; l.shadowOffsetX = sx * 0.12 * d; l.shadowOffsetY = sy * 0.12 * d; l.fill();
    l.shadowColor = 'transparent'; l.save(); sil(); l.clip();
    const line = (pts, off, lwd, col) => { l.beginPath(); pts.forEach((p, i) => (i ? l.lineTo(p[0] + off, p[1]) : l.moveTo(p[0] + off, p[1]))); l.lineWidth = lwd; l.strokeStyle = col; l.lineJoin = 'round'; l.stroke(); };
    line(L, 0, hw * 0.8, 'rgba(0,0,0,.3)'); line(Rr, 0, hw * 0.8, 'rgba(0,0,0,.38)');          // rounded satin: the edges fall away
    line(P, -hw * 0.2, hw * 0.55, V.rib[2] + '99'); line(P, -hw * 0.24, hw * 0.14, 'rgba(255,238,228,.3)');
    line(L, hw * 0.8, 0.5 * k, 'rgba(255,255,255,.13)'); line(Rr, -hw * 0.8, 0.5 * k, 'rgba(255,255,255,.09)');   // selvedge
    const gr = l.createLinearGradient(0, yEdge - w * 0.5, 0, yEdge + w * 0.9);                  // the bend over the edge of the board
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = gr; l.fillRect(ox, yEdge - w * 0.5, lw, w * 1.4);
    l.restore();
    const fade = Math.min(70, (yEnd - ya) * 0.4), mg = l.createLinearGradient(0, ya - 4, 0, ya + fade);
    mg.addColorStop(0, 'rgba(0,0,0,0)'); mg.addColorStop(1, 'rgba(0,0,0,1)');
    l.globalCompositeOperation = 'destination-in'; l.fillStyle = mg; l.fillRect(ox, oy, lw, lh);
    c.drawImage(lc, ox, oy, lw, lh);
  }

  SUPPORTS.book = {
    name: 'Livre', ink: (k) => (bookVariants[k] || bookVariants.base).ink,
    box: (W, H, u) => ({ top: H * 0.08, bottom: H * 0.11, side: u < 200 ? u * 0.045 : Math.max(18, u * 0.045), spread: true, gutter: u * 0.06 }),
    edge: (u) => { const cv = Math.max(4, u * 0.012); return { t: cv + Math.max(2.5, u * 0.0115), r: cv + Math.max(3, u * 0.0165), b: cv + Math.max(2.5, u * 0.0115), l: cv + Math.max(3, u * 0.0165) }; },
    draw(c, S, W, H, o) {
      const V = bookTone(bookVariants[o.scene] || bookVariants.base, o.bg, o.fg), u = o.u, mini = !!o.mini, R = o.R, L = o.left, two = !!L;
      const d = (c.getTransform ? c.getTransform().a : 1) || 1;
      const x0 = two ? L.x : S.x, x1 = S.x + S.w, y0 = S.y, y1 = S.y + S.h, g = two ? S.x - (L.x + L.w) : 0, gx = two ? S.x - g / 2 : S.x;
      // sizes: the cover boards peek out past the page block, whose stacked edges are a little thicker on the sides
      const cv = mini ? u * 0.022 : Math.max(4, u * 0.012), ws = mini ? u * 0.018 : Math.max(3, u * 0.0165), wt = mini ? u * 0.013 : Math.max(2.5, u * 0.0115);
      const sp = two ? 0 : mini ? 2 : Math.max(9, Math.min(16, u * 0.026));       // rolled spine, single page
      const bx0 = two ? x0 - ws : x0, bx1 = x1 + ws, by0 = y0 - wt, by1 = y1 + wt;
      const cx0 = two ? bx0 - cv : x0 - sp, cx1 = bx1 + cv, cy0 = by0 - cv, cy1 = by1 + cv, cr = mini ? 1 : Math.max(2, u * 0.006);
      const pad = mini ? S.w * 0.12 : S.w < 520 ? 22 : 44, F = pad * 0.68, lift = pad * 0.32;   // shading stays out of the text's margin
      // light and shadow
      const lt = o.light, lx = lt ? lt.x : W * 0.3, ly = lt ? lt.y : -H * 0.3, lrgb = lt ? lt.rgb : '255,236,205', la = lt ? lt.a : 0.12;
      let dx = (cx0 + cx1) / 2 - lx, dy = (cy0 + cy1) / 2 - ly; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const sx = dx * u * 0.012, sy = u * 0.014 + Math.max(0, dy) * u * 0.016;
      const un = o.under, lum = un ? 0.2126 * un[0] + 0.7152 * un[1] + 0.0722 * un[2] : 0.5;
      const shc = un ? `${un[0] * 30 | 0},${un[1] * 26 | 0},${un[2] * 22 | 0}` : '16,11,8', sa = 0.3 + 0.34 * (1 - Math.min(1, lum * 1.15));
      const coverPath = () => { c.beginPath(); bookPath(c, cx0, cy0, cx1 - cx0, cy1 - cy0, cr); };
      const geo = { x0, y0, x1, y1, gx, gw: Math.max(g * 0.9, ws * 3), dip: 0.55, two };

      // 1. the shadow it casts on the surface behind: wide and soft, then tighter, then a contact line
      c.save(); c.fillStyle = V.cover[2];
      for (const [bl, k, a] of [[0.17, 3.4, 0.55], [0.07, 1.7, 0.8], [0.012, 0.3, 1]]) {
        c.shadowColor = `rgba(${shc},${sa * a})`; c.shadowBlur = u * bl * d * (mini ? 0.8 : 1); c.shadowOffsetX = sx * k * d; c.shadowOffsetY = sy * k * d; coverPath(); c.fill();
      }
      c.restore();

      // 2. the cover boards: material, mottling, sheen from the light, bevel, a gilt hairline
      c.save(); coverPath(); c.clip();
      const gb = c.createLinearGradient(cx0, cy0, cx1, cy1);
      gb.addColorStop(0, V.cover[0]); gb.addColorStop(0.5, V.cover[1]); gb.addColorStop(1, V.cover[2]);
      c.fillStyle = gb; c.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
      if (!mini) {
        for (let i = 0; i < 16; i++) {                                              // slow mottling of the hide / cloth
          const bx = cx0 + R() * (cx1 - cx0), by = cy0 + R() * (cy1 - cy0), br = u * (0.05 + R() * 0.12), dark = R() < 0.55;
          c.fillStyle = rad(c, bx, by, br, [[0, dark ? 'rgba(0,0,0,.09)' : 'rgba(255,220,170,.06)'], [1, 'rgba(0,0,0,0)']]); c.fillRect(bx - br, by - br, br * 2, br * 2);
        }
        c.globalAlpha = V.texA; c.fillStyle = c.createPattern(bookTile(V.tex), 'repeat'); c.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0); c.globalAlpha = 1;
      }
      light(c, lx, ly, Math.max(u * 0.9, lt ? lt.r * 0.6 : 0), lrgb, la * (lt ? 0.26 : 0.9));        // soft sheen
      if (two) {                                                                   // the hinge, where the boards meet the spine
        const gw = Math.max(3, u * 0.008) * (mini ? 0.6 : 1), hg = c.createLinearGradient(gx - gw, 0, gx + gw, 0);
        hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.3, 'rgba(0,0,0,.26)'); hg.addColorStop(0.5, 'rgba(0,0,0,.5)'); hg.addColorStop(0.7, 'rgba(0,0,0,.26)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = hg; c.fillRect(gx - gw, cy0, gw * 2, by0 - cy0 + 1); c.fillRect(gx - gw, by1 - 1, gw * 2, cy1 - by1 + 1);
      } else {                                                                      // single page: the spine rolls away on the left
        const sg = c.createLinearGradient(cx0, 0, x0, 0);
        sg.addColorStop(0, 'rgba(0,0,0,.4)'); sg.addColorStop(0.3, 'rgba(255,226,186,.18)'); sg.addColorStop(0.62, 'rgba(0,0,0,.04)'); sg.addColorStop(1, 'rgba(0,0,0,.5)');
        c.fillStyle = sg; c.fillRect(cx0, cy0, x0 - cx0, cy1 - cy0);
      }
      c.restore();
      const bv = c.createLinearGradient(cx0, cy0, cx1, cy1);                       // bevel: lit edge up-left, shaded edge down-right
      bv.addColorStop(0, 'rgba(255,232,196,.32)'); bv.addColorStop(0.5, 'rgba(255,232,196,.05)'); bv.addColorStop(1, 'rgba(0,0,0,.5)');
      c.beginPath(); bookPath(c, cx0 + 0.5, cy0 + 0.5, cx1 - cx0 - 1, cy1 - cy0 - 1, cr); c.lineWidth = 1; c.strokeStyle = bv; c.stroke();
      if (V.gilt && !mini && cv > 7) {
        c.beginPath(); bookPath(c, cx0 + cv * 0.34, cy0 + cv * 0.34, cx1 - cx0 - cv * 0.68, cy1 - cy0 - cv * 0.68, cr * 0.7);
        c.lineWidth = 0.8; c.strokeStyle = `rgba(${V.gilt},.5)`; c.stroke();
      }

      // 3. the page block: contact shadow on the board, stacked page edges
      const n = Math.max(2, Math.round(ws / (mini ? 0.5 : 1.4)));
      c.save(); coverPath(); c.clip();
      c.fillStyle = V.edge; c.shadowColor = 'rgba(8,4,2,.6)'; c.shadowBlur = (mini ? 1.5 : 6) * d; c.shadowOffsetX = sx * 0.25 * d; c.shadowOffsetY = sy * 0.3 * d;
      bookStack(c, geo, ws, wt); c.fill(); c.restore();
      c.save(); bookStack(c, geo, ws, wt); c.clip();
      c.fillStyle = V.edge; c.fillRect(bx0 - 2, by0 - 2, bx1 - bx0 + 4, by1 - by0 + 4);
      c.lineWidth = mini ? 0.35 : 0.6;
      for (let j = 1; j <= n; j++) {
        bookStack(c, geo, ws * j / n, wt * j / n);
        c.strokeStyle = j % 2 ? `rgba(${V.sh},.3)` : `rgba(255,251,238,${V.dark ? 0.14 : 0.42})`; if (j === n) c.strokeStyle = `rgba(${V.sh},.5)`; c.stroke();
      }
      const sg2 = c.createLinearGradient(bx0, by0, bx1, by1);                      // the edge turns from lit to shaded
      sg2.addColorStop(0, 'rgba(255,240,210,.14)'); sg2.addColorStop(1, `rgba(${V.sh},.2)`);
      c.fillStyle = sg2; c.fillRect(bx0 - 2, by0 - 2, bx1 - bx0 + 4, by1 - by0 + 4);
      c.fillStyle = V.paper; c.shadowColor = `rgba(${V.sh},.7)`; c.shadowBlur = (mini ? 1 : 4.5) * d; c.shadowOffsetX = sx * 0.12 * d; c.shadowOffsetY = sy * 0.2 * d; // the top sheet shades the edges below
      c.fillRect(x0, y0, x1 - x0, y1 - y0); c.restore();

      // 4. the pages: paper, a faint grain, the lamp's warmth on the near side
      c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      c.fillStyle = V.paper; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (!mini) {
        grain(c, x1, y1, 0.05);
        if (V.dark) grain(c, x1, y1, 0.04); // overlay grain is faint on dark paper: a second pass
        // each page is a hair darker on the spine side, a very broad falloff (a few percent) that never reaches the margin
        const bw = Math.min(S.w * 0.45, u * 0.3);
        for (const [pa, pb, side] of two ? [[L.x + L.w, L.x + L.w - bw, 1], [S.x, S.x + bw, 1]] : [[S.x, S.x + bw, 1]]) {
          const bg = c.createLinearGradient(pa, 0, pb, 0); bg.addColorStop(0, `rgba(${V.sh},.06)`); bg.addColorStop(1, `rgba(${V.sh},0)`);
          c.fillStyle = bg; c.fillRect(Math.min(pa, pb), y0, bw, y1 - y0);
        }
      }
      if (lt) light(c, lt.x, lt.y, lt.r * 0.8, lt.rgb, lt.a * 0.1);
      // the outer sides lift a little: a thin bright rim, softly fading inward
      const rk = V.dark ? 0.4 : 1, rim = (xa, ya, xb, yb, w2) => { const rg = c.createLinearGradient(xa, ya, xb, yb); rg.addColorStop(0, 'rgba(255,251,238,0)'); rg.addColorStop(0.82, `rgba(255,251,238,${0.16 * rk})`); rg.addColorStop(1, `rgba(255,253,244,${0.5 * rk})`); c.fillStyle = rg; return rg; };
      const lw = Math.max(1, lift);
      c.fillStyle = rim(x1 - lw, 0, x1, 0); c.fillRect(x1 - lw, y0, lw, y1 - y0);
      if (two) { c.fillStyle = rim(x0 + lw, 0, x0, 0); c.fillRect(x0, y0, lw, y1 - y0); }
      c.fillStyle = rim(0, y0 + lw, 0, y0); c.fillRect(x0, y0, x1 - x0, lw);
      c.fillStyle = rim(0, y1 - lw, 0, y1); c.fillRect(x0, y1 - lw, x1 - x0, lw);
      c.restore();

      // 5. the ribbon, from the crease
      const rw = mini ? Math.max(1.5, u * 0.025) : Math.max(6.5, u * 0.0125);
      bookRibbon(c, d, V, { x: two ? gx : x0 + rw * 0.8 + 2, ya: y1 - Math.min(S.h * 0.2, 150 * u / 900 + 20), yEdge: cy1, yEnd: cy1 + (mini ? u * 0.05 : Math.max(26, u * 0.072)), w: rw, drift: (sx >= 0 ? 1 : -1) * rw * 0.9, sx, sy, u, mini });

      // 6. the paper curving into the spine: darker toward the fold, a faint crest of light before it
      const h1 = g / 2, Hw = two ? h1 + F : F, lwid = Math.ceil(Hw * (two ? 2 : 1) * d), lhei = Math.ceil((y1 - y0) * d);
      if (lwid > 0 && lhei > 0) {
        const lc = document.createElement('canvas'); lc.width = lwid; lc.height = lhei; const l = lc.getContext('2d'); l.scale(d, d);
        const wL = lwid / d, hL = lhei / d, N = 28;
        const hwd = Hw, end = (t) => 1 - bookSm(0.62, 1, t / hwd);
        const dark = (t) => two ? 0.36 * Math.exp(-Math.pow(t / (hwd * 0.56), 2)) * end(t) : 0.4 * Math.exp(-Math.pow(t / (F * 0.5), 2)) * end(t);
        const crest = (t) => { const e = (t - (h1 + F * 0.42)) / (F * 0.32); return t > h1 - F * 0.1 ? 0.1 * Math.pow(Math.max(0, 1 - e * e), 2) : 0; };
        for (const hi of [true, false]) {
          const lg = l.createLinearGradient(0, 0, wL, 0);
          for (let i = 0; i <= N; i++) {
            const p = i / N, t = two ? Math.abs(p * 2 - 1) * Hw : p * F, a = hi ? crest(t) : dark(t);
            lg.addColorStop(p, hi ? `rgba(255,250,236,${a})` : `rgba(${V.sh},${a})`);
          }
          l.fillStyle = lg; l.fillRect(0, 0, wL, hL);
        }
        if (two && !mini) {                                                          // the crease itself
          const cg = l.createLinearGradient(wL / 2 - 2.5, 0, wL / 2 + 2.5, 0);
          cg.addColorStop(0, 'rgba(255,248,230,0)'); cg.addColorStop(0.3, 'rgba(255,248,230,.07)'); cg.addColorStop(0.5, 'rgba(28,16,6,.3)'); cg.addColorStop(0.7, 'rgba(255,248,230,.05)'); cg.addColorStop(1, 'rgba(255,248,230,0)');
          l.fillStyle = cg; l.fillRect(wL / 2 - 2.5, 0, 5, hL);
        }
        if (!mini) {                                                                 // lighter toward the ends of the block
          const e = Math.min(48, hL * 0.12), vg = l.createLinearGradient(0, 0, 0, hL);
          vg.addColorStop(0, 'rgba(0,0,0,.5)'); vg.addColorStop(e / hL, 'rgba(0,0,0,1)'); vg.addColorStop(1 - e / hL, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
          l.globalCompositeOperation = 'destination-in'; l.fillStyle = vg; l.fillRect(0, 0, wL, hL);
        }
        c.drawImage(lc, two ? gx - Hw : x0, y0, wL, hL);
      }
    },
  };
  /* support:book:end */

  /* support:screen:start */
  // A tablet / e-reader held upright, in night mode. The display is the text area; the object is a black-glass face in a thin
  // metal rim (graphite in the dark, warm titanium over a pale field), a faint diagonal glass sheen, a warm light spilling from
  // the display, and a soft shadow. Its helpers are prefixed `screen`.
  const screenB = (u) => Math.max(3, Math.min(18, Math.round(u * 0.021))); // the bezel
  const screenPath = (c, x, y, w, h, r) => { if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  const screenLin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (const s of stops) g.addColorStop(s[0], s[1]); return g; };
  // Perceived brightness (0..1) of what is behind the device; the small previews know it only for the abstract fields.
  function screenLum(o) {
    let un = o.under;
    if (!un && (o.scene === 'lines' || o.scene === 'topo' || o.scene === 'halo' || o.scene === 'dots' || o.scene === 'dust')) {
      try {
        const m = /^#?([0-9a-f]{6})$/i.exec(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
        if (m) { const n = parseInt(m[1], 16); un = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
      } catch (e) { /* keep the dark default */ }
    }
    return un ? 0.2126 * un[0] + 0.7152 * un[1] + 0.0722 * un[2] : 0.05;
  }
  // What the device casts on the scene: its shadow and the light of its display. Everything here is soft, so it is painted at a
  // quarter of the size on one small canvas and scaled up once, which looks the same and costs a fraction of the time. Each cast
  // is a blurred halo of the device's shape; the shape itself is kept off the small canvas, only its blur lands on it.
  function screenCasts(c, W, H, D, R, mini, list, halo) {
    const f = Math.max(...list.map((l) => l.blur || 0)) * 1.7 + 4;
    let x0 = D.x - f, y0 = D.y - f, x1 = D.x + D.w + f, y1 = D.y + D.h + f + (mini ? 6 : 60);
    if (halo) { x0 = Math.min(x0, halo.x - halo.rx); x1 = Math.max(x1, halo.x + halo.rx); y0 = Math.min(y0, halo.y - halo.ry); y1 = Math.max(y1, halo.y + halo.ry); }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    const q = mini ? 1 : 0.25, cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.ceil((x1 - x0) * q)); cv.height = Math.max(2, Math.ceil((y1 - y0) * q));
    const g = cv.getContext('2d'), sx = cv.width / (x1 - x0), sy = cv.height / (y1 - y0), off = D.x + D.w - x0 + 40;
    const cast = (l) => {
      g.save(); g.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
      g.shadowColor = l.col; g.shadowBlur = l.blur * sx; g.shadowOffsetX = off * sx; g.shadowOffsetY = (l.dy || 0) * sy;
      g.fillStyle = '#000'; g.beginPath(); const e = l.grow || 0; screenPath(g, D.x - off - e, D.y - e, D.w + e * 2, D.h + e * 2, R + e); g.fill(); g.restore();
    };
    for (const l of list) {
      if (l.halo && halo) { // the wide ellipse of light goes between the shadows and the tight glow
        g.save(); g.setTransform(sx * halo.rx, 0, 0, sy * halo.ry, (halo.x - x0) * sx, (halo.y - y0) * sy);
        g.fillStyle = rad(g, 0, 0, 1, [[0, `rgba(${halo.rgb},${halo.a})`], [0.3, `rgba(${halo.rgb},${halo.a * 0.42})`], [1, `rgba(${halo.rgb},0)`]]);
        g.fillRect(-1, -1, 2, 2); g.restore();
      } else cast(l);
    }
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low'; c.drawImage(cv, x0, y0, x1 - x0, y1 - y0); c.restore();
  }
  SUPPORTS.screen = {
    name: 'Écran', ink: '#e6dccb', light: true,
    box: (W, H, u) => { const b = screenB(u); return { top: b + H * 0.045, bottom: b + H * 0.065, side: b + Math.max(8, u * 0.012) }; },
    edge: (u) => { const b = screenB(u); return { t: b, r: b, b, l: b }; },
    draw(c, S, W, H, o) {
      const mini = o.mini, b = mini ? 3 : screenB(o.u);
      // In the reading colours the display shows the background; a bright display lights the room more, in its own colour.
      const tone = o.bg ? toneOf(o.bg) : null, spill = tone ? rgbCss(mixRGB(tone.p, [255, 200, 140], 0.45)).replace(/^rgba\((.*),1\)$/, '$1') : '255,200,140';
      const glow = tone ? Math.max(0.6, Math.min(1.8, 0.85 + 1.6 * (tone.l - 0.09))) : 1;
      const D = { x: S.x - b, y: S.y - b, w: S.w + b * 2, h: S.h + b * 2 }; // the whole device
      const cx = D.x + D.w / 2, cy = D.y + D.h / 2;
      const R = mini ? 7 : Math.max(10, Math.min(34, D.w * 0.045)), r = Math.max(2, R - b); // outer and display corner radii
      const lum = screenLum(o), night = !/^(lines|topo|halo|dots|dust|image)$/.test(o.scene);
      // 1 in the dark, 0 over a pale field; the painted scenes are always at night, even where their sky is light
      const dark = Math.max(night ? 0.7 : 0, Math.min(1, 1.4 - lum * 2.4)), pale = lum > 0.5;
      const k = Math.min(1, D.w / 656);
      // Where the light comes from: the scene's lamp when there is one, else the upper left.
      let lx = -0.6, ly = -0.8;
      if (o.light) { const dx = o.light.x - cx, dy = o.light.y - cy, n = Math.hypot(dx, dy) || 1; lx = dx / n; ly = dy / n; }

      // 1. the shadow, and the light of the display spilling on the scene
      const t = Math.round(58 * (1 - dark)), sh = (a) => `rgba(${t},${Math.round(t * 0.7)},${Math.round(t * 0.42)},${a})`, hr = Math.max(D.w, D.h) * (mini ? 0.9 : 1.1);
      const casts = mini
        ? [{ blur: 10, dy: 4, col: sh(0.5 * (0.5 + dark * 0.5)) }]
        : [{ blur: 100 * k + 16, dy: 40 * k + 6, col: sh(0.34 + dark * 0.26) }, { blur: 30 * k + 6, dy: 14 * k + 2, col: sh(0.2 + dark * 0.26) }];
      let halo = null;
      if (dark > 0.02) {
        halo = { x: cx, y: cy + D.h * 0.05, rx: hr, ry: hr * 0.82, rgb: spill, a: 0.26 * dark * glow };
        casts.push({ halo: true }, { blur: 70 * k + 10, col: `rgba(${spill},${0.34 * dark * glow})`, grow: 2 }, { blur: 16 * k + 4, col: `rgba(${spill},${0.18 * dark * glow})`, grow: 1 });
      }
      screenCasts(c, W, H, D, R, mini, casts, halo);
      { // a close contact shadow, at full resolution
        const d = c.getTransform().a || 1;
        c.save(); c.shadowColor = sh(0.3); c.shadowBlur = 6 * d; c.shadowOffsetY = 2 * d; c.fillStyle = '#000';
        c.beginPath(); screenPath(c, D.x, D.y, D.w, D.h, R); c.fill(); c.restore();
      }

      // 2. the rim and the black glass face
      const e = Math.max(1.3, b * 0.15), span = Math.hypot(D.w, D.h) / 2;
      const rim = pale
        ? [[0, '#e2dbcc'], [0.42, '#a39a89'], [0.7, '#938a7a'], [1, '#cdc4b3']]
        : [[0, '#6a665f'], [0.4, '#2d2b29'], [0.7, '#232220'], [1, '#4b4844']];
      c.fillStyle = screenLin(c, cx - lx * span, cy - ly * span, cx + lx * span, cy + ly * span, rim);
      c.beginPath(); screenPath(c, D.x, D.y, D.w, D.h, R); c.fill();
      c.fillStyle = screenLin(c, cx - lx * span, cy - ly * span, cx + lx * span, cy + ly * span, [[0, '#1b1a19'], [0.5, '#0e0d0c'], [1, '#161514']]);
      c.beginPath(); screenPath(c, D.x + e, D.y + e, D.w - e * 2, D.h - e * 2, R - e); c.fill();
      // the chamfer: a fine highlight on the edge, brightest toward the light
      const lw = Math.max(0.8, e * 0.5), hi = pale ? [0.85, 0.45] : mini ? [0.3, 0.14] : [0.5, 0.22];
      c.lineWidth = lw;
      c.strokeStyle = screenLin(c, cx + lx * span, cy + ly * span, cx - lx * span, cy - ly * span, [[0, `rgba(255,250,240,${hi[0]})`], [0.35, 'rgba(255,250,240,.07)'], [0.65, 'rgba(255,250,240,.04)'], [1, `rgba(255,250,240,${hi[1]})`]]);
      c.beginPath(); screenPath(c, D.x + lw / 2, D.y + lw / 2, D.w - lw, D.h - lw, R - lw / 2); c.stroke();

      // 3. the display: very dark warm grey, a touch lighter at its heart
      c.fillStyle = screenLin(c, 0, S.y, 0, S.y + S.h, tone ? [[0, rgbCss(mixRGB(tone.p, [255, 255, 255], 0.025))], [0.5, o.bg], [1, rgbCss(mixRGB(tone.p, [0, 0, 0], 0.07))]] : [[0, '#1e1b18'], [0.5, '#1b1815'], [1, '#171411']]);
      c.beginPath(); screenPath(c, S.x, S.y, S.w, S.h, r); c.fill();
      if (!mini) {
        c.save(); c.beginPath(); screenPath(c, S.x, S.y, S.w, S.h, r); c.clip();
        c.fillStyle = rad(c, cx, S.y + S.h * 0.42, Math.max(S.w, S.h) * 0.75, [[0, 'rgba(255,214,168,.028)'], [1, 'rgba(255,214,168,0)']]);
        c.fillRect(S.x, S.y, S.w, S.h);
        c.restore();
      }
      c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.6)';
      c.beginPath(); screenPath(c, S.x - 0.5, S.y - 0.5, S.w + 1, S.h + 1, r + 0.5); c.stroke();

      // 4. the front camera
      const cr = mini ? 0.9 : Math.max(1.5, b * 0.17), cyy = D.y + b / 2 + e * 0.3;
      c.fillStyle = rad(c, cx - cr * 0.3, cyy - cr * 0.3, cr * 1.3, [[0, '#2a2d3a'], [0.45, '#0a0b10'], [1, '#050507']]);
      c.beginPath(); c.arc(cx, cyy, cr, 0, TAU); c.fill();
      if (!mini) { c.fillStyle = 'rgba(150,170,255,.55)'; c.beginPath(); c.arc(cx - cr * 0.32, cyy - cr * 0.34, cr * 0.22, 0, TAU); c.fill(); }

      // 5. the glass: a faint diagonal sheen, a little stronger on the face than over the display
      const sheen = (a) => screenLin(c, D.x, D.y, D.x + D.w, D.y + D.h, [
        [0, 'rgba(255,255,255,0)'], [0.2, 'rgba(255,255,255,0)'], [0.34, `rgba(255,248,238,${a})`], [0.5, 'rgba(255,255,255,0)'],
        [0.58, 'rgba(255,255,255,0)'], [0.63, `rgba(255,248,238,${a * 0.5})`], [0.68, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]);
      c.save(); c.beginPath(); screenPath(c, D.x, D.y, D.w, D.h, R); screenPath(c, S.x, S.y, S.w, S.h, r); c.clip('evenodd');
      c.fillStyle = sheen(0.085); c.fillRect(D.x, D.y, D.w, D.h); c.restore();
      c.save(); c.beginPath(); screenPath(c, S.x, S.y, S.w, S.h, r); c.clip();
      c.fillStyle = sheen(0.03); c.fillRect(S.x, S.y, S.w, S.h); c.restore();

      // 6. a light film grain over the whole object
      if (!mini) { c.save(); c.beginPath(); screenPath(c, D.x, D.y, D.w, D.h, R); c.clip(); c.translate(D.x, D.y); grain(c, D.w, D.h, 0.05); c.restore(); }
    },
  };
  /* support:screen:end */

  /* support:bubble:start */
  // A bubble floating in the middle of the scene: a soft, misshapen oval that holds the text, the scene seen through it sharp
  // at its rim and blurring more and more toward its heart, its outline slowly swelling and twisting, the scene flowing a
  // little inside it (its size, shape, blur, undulation and fade are the reader's to set: bubOpt). On the GPU (WebGL 2,
  // bubGL) the scene's picture under it is uploaded when it changes, with its mipmaps, each level a blur twice as wide; one
  // small program reads it between two levels at each pixel and draws the outline and the flowing from a few sines of the
  // time, a few dozen times a second while it moves (the app runs that: frame). Without WebGL 2, and in the previews, it is
  // painted in 2D: the picture halved again and again, the levels blended back through masks, its outline still. Over a
  // dark scene the glass is smoked (a faint frost in the night) and the ink light, over a bright one it is milky and the
  // ink dark; in the reader's colours it takes their background.
  // Its edge has two styles (bubOpt.edge). 'glass' is the smooth rim above. 'portail' is an opening torn in the scene: the
  // outline frayed at several scales on top of the lobes (bubFray), lit on the GPU by a broken line of light, a violet glow,
  // glowing smoke and a dust of tiny specks, all in the bubble's own program (no pass of its own), and crowded by a few
  // hundred brighter particles on a small 2D canvas over it (bubSpk) that twinkle and drift out. All of it lives at the rim
  // and only outward of the plain rim: the text's mask ends inside it, so the text never pokes out.
  // Its helpers are prefixed `bub`.
  const bubSm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bubClamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // What the reader sets (the app's bubble panel). Its background ('clear': none, only the scene's light held back behind
  // the text, 'glass': frosted, 'color'), the colour, how dense the background; how long its lines are (cols, in signs; 0:
  // as the reader's measure, 46 at most), its height on the screen (a fraction of the window's; 0: by the window's shape),
  // its shape (the superellipse's exponent: 2 an ellipse, 6 nearly a rounded rectangle; 0: rounded) and its floating (the
  // app's). The size of its text is the scale the reader gives it with the grip (the app's S.place). The blur: how strong at the heart, where it starts (still sharp there,
  // in radii: 1 the rim), where it is full, its curve, and how far a light blur reaches out past the rim. The undulation:
  // how far the rim swells out, in how many lobes, how irregular, how fast (0: still, misshapen all the same), and how much
  // and how widely the scene flows inside. The fade: how soft the rim, how opaque the bubble, how much the scene's light is
  // held behind the text, and a faint line of light along the rim. The edge: 'glass' or 'portail', and for the latter how
  // many sparkles crowd its rim (and how bright its light) and how torn it is.
  const BUB_DEF = {
    bg: 'clear', col: '#f1ebe1', veil: 0, cols: 0, h: 0, round: 0, float: 1,
    blur: 0.3, start: 1, end: 0.15, ease: 1, halo: 0.06,
    amp: 0.09, lobes: 3, irr: 0.55, speed: 1, img: 0.5, iscale: 1,
    fade: 0.08, op: 1, hold: 0, rim: 0.1,
    edge: 'glass', spark: 0.6, fray: 0.6, ptint: '#a387ff',
  };
  const bubOpt = Object.assign({}, BUB_DEF);
  const BUB_IN = 0.9; // (the previews: the text's width, as a fraction of the bubble's)
  // The bubble is cut to its text. The text box takes its whole height: the lines run up to its rim and fade there, over a
  // band from BUB_BAND[0] to BUB_BAND[1] line heights inside it (measured across the rim, so that at the rounded corners
  // the lines fade along the curve). Its width is the lines' and a margin: wide enough that the lines' ends stay clear of
  // that band over the middle BUB_CORE of its height (the rounder the shape, the wider the margin). bubFit: its half-axes
  // from the last layout on the screen (in the text layer's own units, before the reader's scale), from the text column
  // the app laid out; the previews, and the screen before a layout, estimate them from the window.
  const BUB_BAND = [0.3, 1.9], BUB_CORE = 0.6, BUB_COLS = 46, BUB_ROUND = 4.4;
  let bubFit = null, bubEnv = null; // ({ W, H, a, b }; the app's measures: { s, ch, lh, pad, measure })
  const bubN = () => bubClamp(+bubOpt.round || BUB_ROUND, 1.6, 8);
  const bubHv = (W, H) => Math.min(H - 12, bubClamp(+bubOpt.h || (W < H ? 0.66 : 0.5), 0.15, 1) * H); // its height on the screen
  const bubKappa = (n) => (1 - BUB_CORE ** n) ** (1 / n); // (how far in the rim is at the core's top, at the lines' ends)
  function bubGeom(W, H) {
    const n = bubN(), f = bubFit;
    if (f && f.W === W && f.H === H) return { a: f.a, b: f.b, n };
    const b = bubHv(W, H) / 2, r = f ? f.a / f.b : W < H ? 0.95 : 1.45;
    return { a: Math.min(0.49 * W, b * r), b, n };
  }
  // The settings, read safely (a missing or odd value takes its default).
  function bubPar() {
    const v = (k, a, b) => bubClamp(Number.isFinite(+bubOpt[k]) && bubOpt[k] !== '' ? +bubOpt[k] : BUB_DEF[k], a, b);
    const P = {
      blur: v('blur', 0, 1.5), start: v('start', 0.4, 1.6), end: v('end', 0, 1.2), ease: v('ease', 0.3, 3), halo: v('halo', 0, 1),
      amp: v('amp', 0, 0.3), lobes: Math.round(v('lobes', 2, 9)), irr: v('irr', 0, 1), speed: v('speed', 0, 3), img: v('img', 0, 1), iscale: v('iscale', 0.25, 3),
      fade: v('fade', 0.01, 0.5), op: v('op', 0, 1), hold: v('hold', 0, 1), rim: v('rim', 0, 1),
      portail: bubOpt.edge === 'portail', spark: v('spark', 0, 1), fray: v('fray', 0, 1),
      auto: bubOpt.ptint === 'meteo' || bubOpt.ptint === 'scene' ? bubOpt.ptint : '',
      tint: /^#[0-9a-f]{6}$/i.test(bubOpt.ptint) ? bubOpt.ptint.toLowerCase() : bubOpt.ptint === 'meteo' || bubOpt.ptint === 'scene' ? bubAuto.tint : BUB_DEF.ptint,
    };
    P.end = Math.min(P.end, P.start - 0.05);
    // Portail: how far its fray swells the rim (of the radius), and how far its light and its sparks reach past it
    P.F = P.portail ? BUB_FRAY * P.fray : 0;
    P.reach = P.portail ? BUB_REACH : 0;
    return P;
  }
  // The outline: how far out it swells (0..1 of the amplitude) at the angle a and the time t. Two waves of as many lobes
  // turning against each other (the lobes grow, shrink and drift), its neighbours for the irregular, the whole slowly
  // swinging to and fro (a twist). The same as wave() in the shader.
  function bubWave(a, t, k, g) {
    const f = a + 0.3 * Math.sin(0.19 * t + 0.5);
    const v = 0.6 * Math.sin(k * f + 0.6 * t) + 0.4 * Math.sin(k * f - 0.45 * t + 1.7)
      + g * (0.8 * Math.sin((k + 1) * f + 0.37 * t + 0.6) + 0.5 * Math.sin((2 * k - 1) * f - 0.83 * t + 2.3) + 0.35 * Math.sin((k + 3) * f + 1.1 * t + 4));
    const x = bubClamp(v / (0.95 + 0.75 * g), -1, 1); // (softly clipped: the rarest peaks)
    return 0.5 + 0.5 * x * (1.5 - 0.5 * x * x);
  }
  // Portail's fray. BUB_FRAY: how far it swells the rim at most (of the radius, at full « Effilochage »); BUB_REACH: how far
  // past it its glow, its smoke and its sparks go.
  const BUB_FRAY = 0.34, BUB_REACH = 0.36;
  // An integer hash, the same bits as bh() in the shader: the particles find the very outline the GPU draws.
  function bubHash(x, y) {
    let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h = (h ^ (h >>> 15)) >>> 0;
    return h / 4294967296;
  }
  // Value noise in cells, periodic every P cells along x (around the rim) and every 4096 along y (the time); as nz().
  const bubMod = (v, p) => v - p * Math.floor(v / p);
  function bubNz(x, y, P) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = bubMod(i, P), x1 = bubMod(i + 1, P), y0 = bubMod(j, 4096), y1 = bubMod(j + 1, 4096);
    const a = bubHash(x0, y0), b = bubHash(x1, y0), c = bubHash(x0, y1), d = bubHash(x1, y1);
    return a + (b - a) * sx + (c - a + (a - b - c + d) * sx) * sy;
  }
  // The fray (0..1) at the angle a and the time t, on top of the lobes: a few slow bulges (noise in six cells around the
  // rim), two slow sines for its scallops, then noise in three finer sizes, each one smaller and boiling faster, the two
  // finest ridged (sharp tips: torn, not wavy), all three stronger in a few patches and calmer between them. It only ever
  // swells the rim outward. The same as fray() in the shader.
  function bubFray(a, t) {
    const f = a + 0.3 * Math.sin(0.19 * t + 0.5), u = f * 0.15915494 + 0.5;
    const s = 0.5 + 0.25 * Math.sin(5 * f + 0.21 * t + 0.4) + 0.25 * Math.sin(9 * f - 0.27 * t + 2.2);
    const big = bubNz(u * 6, 0.05 * t + 1, 6), env = bubNz(u * 4, 0.04 * t + 7, 4), r = (v) => 1 - Math.abs(2 * v - 1);
    const n1 = bubNz(u * 13, 0.09 * t + 3, 13), n2 = r(bubNz(u * 29, 0.15 * t + 9, 29)), n3 = r(bubNz(u * 79, 0.27 * t + 17, 79));
    return 0.08 * s + 0.3 * big + (0.2 + 0.8 * env) * (0.18 * n1 + 0.3 * n2 * n2 * n2 + 0.14 * n3 * n3);
  }
  // The whole outline's radius (1: the plain rim) at the angle a: the glass's lobes, and Portail's fray on them.
  const bubRho = (a, t, P) => 1 + P.amp * bubWave(a, t, P.lobes, P.irr) + (P.F > 0 ? P.F * bubFray(a, t) : 0);
  const BUB_LV = 6, BUB_BLUR = 0.7; // (2D: the levels; the blur at the heart, in radii at ×1)
  let bubLast = { W: 1, H: 1 };
  const bubMood = { milky: false, mix: 0, t: 0, seen: false }; // its glass the last time it was painted on the screen
  // Small canvases kept from one painting to the next (the previews have their own).
  const bubPool = {};
  function bubCv(id, w, h) {
    let cv = bubPool[id];
    if (!cv) { cv = bubPool[id] = document.createElement('canvas'); cv.g = cv.getContext('2d', id.endsWith('P') ? { willReadFrequently: true } : undefined); } // (only the 1-pixel probes are read back)
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    else { const g = cv.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); }
    return cv;
  }
  // The lamps' glows (on the screen they are above the scene) go into the picture: seen through the bubble too. g is set
  // to draw in the screen's px.
  function bubGlows(g, glows) {
    if (!glows || !glows.length) return;
    g.globalCompositeOperation = 'screen';
    for (const gl of glows) {
      const r = gl.r * 0.48;
      if (!(r > 0)) continue;
      g.fillStyle = rad(g, gl.x, gl.y, r, [[0, `rgba(${gl.rgb},${gl.a})`], [0.44, `rgba(${gl.rgb},${gl.a * 0.36})`], [1, `rgba(${gl.rgb},0)`]]);
      g.fillRect(gl.x - r, gl.y - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = 'source-over';
  }
  // The glass: smoked over a dark scene, milky over a bright one (from one to the other in a second and a half, as the ink
  // changes), or the reading background; and behind the text, the scene's brightness held on the ink's side.
  function bubLook(o, lum, mini, P) {
    // (lum is the scene's mean in sRGB values: the smoked glass keeps it under 0.27 for the light ink, 7:1 and more, the
    // milky one over 0.58 for the dark ink. On the bare scene both inks stand out about as much near 0.46; the light one,
    // with its shadow, keeps reading well around it, the dark one soon reads poorly under it: the ink turns dark only over
    // 0.48 and light again under 0.40.)
    let mix = lum > 0.44 ? 1 : 0;
    if (!mini) {
      const now = performance.now(), dt = Math.min(100, now - bubMood.t);
      bubMood.milky = bubMood.milky ? lum > 0.4 : lum > 0.48;
      const want = bubMood.milky ? 1 : 0;
      bubMood.mix = bubMood.seen ? bubMood.mix + bubClamp(want - bubMood.mix, -dt / 1600, dt / 1600) : want;
      bubMood.t = now; bubMood.seen = true; mix = bubMood.mix;
      SUPPORTS.bubble.settling = mix !== want; // the app paints it again soon
    } else if (bubMood.seen) mix = bubMood.mix;
    const un = o.under ? o.under.map((v) => v * 255) : [30, 27, 24];
    // over a very dark scene the smoked glass turns into a faint frost, a little lighter than the night behind it
    const lift = bubSm(0.16, 0.05, lum), frost = mixRGB(un, [150, 158, 178], 0.4);
    const dark = mixRGB(mixRGB(un, [9, 11, 16], 0.6), frost, lift), pale = mixRGB(un, [250, 248, 244], 0.72);
    const smoke = bubClamp((lum - 0.27) / Math.max(0.05, lum - lumOf(dark)), 0.26, 0.82);
    const G = [ // smoked, milky
      { tone: dark, veil: smoke + (0.3 - smoke) * lift, sheen: 0.06 },
      { tone: pale, veil: bubClamp((0.58 - lum) / Math.max(0.05, lumOf(pale) - lum), 0.34, 0.85), sheen: 0.1 },
    ];
    const lerp = (a, b) => a + (b - a) * mix;
    let tone = mixRGB(G[0].tone, G[1].tone, mix), veil = lerp(G[0].veil, G[1].veil), sheen = lerp(G[0].sheen, G[1].sheen);
    const clear = bubOpt.bg !== 'glass' && bubOpt.bg !== 'color';
    if (bubOpt.bg === 'color') { tone = hex3(bubOpt.col); veil = 0.9; sheen = 0.08; }
    else if (clear) { veil = 0; sheen = 0.04; }
    else if (o.bg) { tone = hex3(o.bg); veil = 0.9; sheen = 0.08; }
    veil = Math.min(0.97, veil * bubClamp(+bubOpt.veil || 0, 0, 2));
    // Behind the text, the scene's brightness is held on the ink's side, place by place: no brighter than 0.42 under a
    // light ink (darken: what is darker stays), no darker than 0.62 under a dark one; in its own hue. As much as asked.
    let dk = [un, 0], lt = [un, 0];
    if (!(bubOpt.bg === 'glass' && o.bg)) {
      const toward = (t) => { // the scene's mean colour brought to the luminance t (sRGB): darkened, or lightened toward white
        const l = Math.max(1e-3, lumOf(un));
        return l >= t ? un.map((v) => (v * t) / l) : un.map((v) => v + (255 - v) * ((t - l) / (1 - l)));
      };
      const col = bubOpt.bg === 'color', inkLight = col ? lumOf(tone) < 0.45 : true;
      dk = [toward(0.42), (col ? (inkLight ? 1 : 0) : 1 - mix) * P.hold];
      lt = [toward(0.62), (col ? (inkLight ? 0 : 1) : mix) * P.hold];
    }
    return { tone, veil, sheen, dk, lt };
  }
  // Where the light comes from: the scene's lamp when there is one, else the upper left.
  function bubLightDir(o, sh) {
    let lx = -0.55, ly = -0.83;
    if (o.light) { const dx = o.light.x - sh.cx, dy = o.light.y - sh.cy, d = Math.hypot(dx, dy) || 1; lx = dx / d; ly = Math.min(dy / d, 0.2); const m = Math.hypot(lx, ly); lx /= m; ly /= m; }
    return [lx, ly];
  }

  // Portail's light by the glass's mood (mix: 0 over a dark scene, 1 over a bright one): white and lilac light added to
  // the night; over a bright scene, where added light would vanish, its line and dust a deep violet laid over it and its
  // glow a paler lilac haze. It grows with the sparkles.
  function bubPortalLook(P, mix) {
    const l = (a, b) => a.map((v, i) => v + (b[i] - v) * mix), T = bubTint(P.tint);
    return {
      day: mix, G: 0.65 + 0.55 * P.spark, dust: 0.25 + 0.75 * P.spark,
      glow: T(l([0.64, 0.53, 1], [0.6, 0.48, 0.96])), line: T(l([0.98, 0.96, 1], [0.44, 0.24, 0.9])),
    };
  }
  // The halo's colour (the reader's: bubOpt.ptint). Portail's palette was drawn in violet (hue 254, fully saturated): each
  // of its colours keeps its lightness and takes the chosen colour's hue, its saturation scaled by the chosen one's (a
  // white halo turns it all to greys and whites). Returns the mapping for colours in 0..1.
  const BUB_TINT_H = 254;
  function bubHsl([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 1e-6) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, Math.min(1, s), l];
  }
  function bubRgbOf([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m];
  }
  // The halo's colour found by itself (bubOpt.ptint 'meteo' or 'scene'), again at each painting, so that it follows the day:
  // 'meteo' the sky's accent now (its most coloured stop: the blue of noon, the gold and pink of the evening, the deep blue
  // of the night, a grey under rain); 'scene' the colour most present in the scene's picture (its pixels by hue, each
  // counted once, its shade weighed by how coloured it is; a scene with hardly any colour gives its mean grey). Both rounded (hue to 6°, saturation
  // to a tenth), so that the sprites are drawn again only when it has really moved; a scene with no sky falls back on its
  // colour.
  const bubAuto = { tint: BUB_DEF.ptint };
  const bubHex = (c) => '#' + c.map((v) => Math.round(bubClamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  // (soft: the stops weighed by their colour to the fourth power rather than the most coloured alone, so that when two of them are
  // about as coloured, the gold of the evening and the blue above it, the halo does not swing from one to the other)
  function bubSkyAccent(D, soft) {
    const sky = D && D.W && D.W.sky;
    if (!Array.isArray(sky)) return null;
    let best = null, bc = -1;
    const m = [0, 0, 0, 0];
    for (const st of sky) {
      const hex = String(st[1] || '');
      if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), ch = Math.max(...c) - Math.min(...c), w = ch ** 4;
      if (ch > bc) { bc = ch; best = c; }
      for (let j = 0; j < 3; j++) m[j] += c[j] * w;
      m[3] += w;
    }
    return soft && m[3] > 1e-6 ? m.slice(0, 3).map((v) => v / m[3]) : best;
  }
  function bubSceneColour(pic) {
    if (!pic || !pic.width) return null;
    const w = 40, h = 25;
    let cv = bubPool.TN;
    if (!cv) { cv = bubPool.TN = document.createElement('canvas'); cv.width = w; cv.height = h; cv.g = cv.getContext('2d', { willReadFrequently: true }); }
    cv.g.clearRect(0, 0, w, h); cv.g.drawImage(pic, 0, 0, w, h);
    let d;
    try { d = cv.g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    const B = Array.from({ length: 12 }, () => [0, 0, 0, 0]), grey = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const c = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], ch = Math.max(...c) - Math.min(...c);
      if (ch < 0.07) { for (let j = 0; j < 3; j++) grey[j] += c[j]; grey[3]++; continue; }
      const k = Math.floor(bubHsl(c)[0] / 30) % 12;
      for (let j = 0; j < 3; j++) B[k][j] += c[j] * ch;
      B[k][3] += ch; B[k][4] = (B[k][4] || 0) + 1;
    }
    // the most crowded band of hues, three neighbours wide (a scene's greens or blues spread over a few of them)
    const at = (k) => B[(k + 12) % 12];
    let top = 0, best = -1;
    for (let k = 0; k < 12; k++) { const n = (at(k - 1)[4] || 0) + (at(k)[4] || 0) + (at(k + 1)[4] || 0); if (n > best) { best = n; top = k; } }
    if (best < 40) return grey[3] ? grey.slice(0, 3).map((v) => v / grey[3]) : null; // (under 4 % of it coloured)
    const m = [0, 0, 0, 0];
    for (const k of [top - 1, top, top + 1]) for (let j = 0; j < 4; j++) m[j] += at(k)[j];
    return m.slice(0, 3).map((v) => v / m[3]);
  }
  function bubAutoTint(mode, o, pic) {
    const c = (mode === 'meteo' && bubSkyAccent(o.D, true)) || bubSceneColour(pic);
    if (!c) return bubAuto.tint;
    const [hh, ss] = bubHsl(c);
    return (bubAuto.tint = bubHex(bubRgbOf([(Math.round(hh / 6) * 6) % 360, Math.round(ss * 10) / 10, 0.62])));
  }
  function bubTint(hex) {
    const t = bubHsl([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
    if (Math.abs(t[0] - BUB_TINT_H) < 0.5 && t[1] > 0.99) return (c) => c; // (the palette's own violet)
    return (c) => { const [, s, l] = bubHsl(c); return bubRgbOf([t[0], s * t[1], l]); };
  }
  // The dust's cells around the rim: about 3 px each along it (the ellipse's perimeter, Ramanujan's).
  const bubDustCells = (sh) => Math.max(16, Math.round((Math.PI * (3 * (sh.a + sh.b) - Math.sqrt((3 * sh.a + sh.b) * (sh.a + 3 * sh.b)))) / 3));

  // A critically damped spring: what the bubble shows glides to what it should show (its glass, Portail's colour found by
  // itself), with no jump and no overshoot, most of the way in a second or so (w: its pace, per second). Stepped on the
  // frames the bubble is drawn on.
  function bubSpring(w) {
    return {
      x: null, v: null, to: null, t: 0, on: false,
      aim(to, snap) {
        if (snap || !this.x || this.x.length !== to.length) { this.x = to.slice(); this.v = to.map(() => 0); this.to = to.slice(); this.on = false; return; }
        this.to = to.slice();
        if (!this.on && to.some((v, i) => Math.abs(v - this.x[i]) > 1e-4)) { this.on = true; this.t = performance.now(); }
      },
      step(now) {
        if (!this.on) return false;
        const dt = Math.min(0.1, Math.max(0, (now - this.t) / 1000)), e = Math.exp(-w * dt), X = this.x, V = this.v, T = this.to;
        this.t = now;
        let still = true;
        for (let i = 0; i < X.length; i++) {
          const d = X[i] - T[i], j = (V[i] + w * d) * dt;
          X[i] = T[i] + (d + j) * e; V[i] = (V[i] - w * j) * e;
          if (Math.abs(X[i] - T[i]) > 2e-4 || Math.abs(V[i]) > 2e-3) still = false;
        }
        if (still) { this.x = T.slice(); V.fill(0); this.on = false; }
        return true;
      },
    };
  }
  const bubTintE = bubSpring(2.6); // Portail's colour found by itself, [r, g, b] 0..1
  let bubFresh = true; // a new scene or size: the next painting shows what it should at once
  const bubRM = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The colour the halo shows (hex) on its way to `hex`: at once when asked, the first time, without the GPU, with reduced motion.
  function bubTintTo(hex, snap) {
    bubTintE.aim([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), snap || bubFresh || !bubGL.drawn || bubRM());
    return bubHex(bubTintE.x);
  }

  // ---- on the GPU ----
  const BUB_VS = `#version 300 es
in vec2 a_p; uniform vec4 u_box; uniform vec2 u_scr;
void main() { vec2 p = mix(u_box.xy, u_box.zw, a_p); gl_Position = vec4(p.x / u_scr.x * 2.0 - 1.0, 1.0 - p.y / u_scr.y * 2.0, 0.0, 1.0); }`;
  const BUB_FS = `#version 300 es
precision highp float;
uniform sampler2D u_pic; uniform sampler2D u_pic0; uniform float u_xf;
uniform vec4 u_pr; uniform vec2 u_tx; uniform vec3 u_view;
uniform vec2 u_c; uniform vec3 u_ab; uniform float u_t;
uniform vec4 u_wv; uniform vec4 u_im; uniform vec4 u_bl; uniform vec3 u_hal;
uniform vec4 u_tone; uniform vec4 u_dk; uniform vec4 u_lt; uniform vec4 u_sh; uniform float u_rw; uniform float u_op;
// Portail (all 0 on the glass): x on, y its fray (of the radius), z its light's strength, w the sparkles' own clock (s);
// x how much its light is laid over the scene rather than added (0 at night, 1 over a bright scene), y the dust's cells
// around the rim, z the dust's density, w how far its light reaches (px); its glow's colour, its line's and dust's
uniform vec4 u_pt; uniform vec4 u_pd; uniform vec3 u_pg; uniform vec3 u_pl;
out vec4 o;
// Portail: an integer hash (as bubHash), value noise periodic every P cells along x (as bubNz), a ridge (sharp tips)
float bh(uint x, uint y) {
  uint h = x * 0x8da6b343u ^ y * 0xd8163841u;
  h = (h ^ (h >> 15)) * 0x2c1b3c6du; h = (h ^ (h >> 12)) * 0x297a2d39u; h ^= h >> 15;
  return float(h) * 2.3283064e-10;
}
float nz(float x, float y, float P) {
  vec2 i = floor(vec2(x, y)), f = vec2(x, y) - i; f = f * f * (3.0 - 2.0 * f);
  uint x0 = uint(mod(i.x, P)), x1 = uint(mod(i.x + 1.0, P)), y0 = uint(mod(i.y, 4096.0)), y1 = uint(mod(i.y + 1.0, 4096.0));
  return mix(mix(bh(x0, y0), bh(x1, y0), f.x), mix(bh(x0, y1), bh(x1, y1), f.x), f.y);
}
float rdg(float v) { return 1.0 - abs(2.0 * v - 1.0); }
// Portail: the fray on top of the lobes, 0..1 (as bubFray)
float fray(float a, float t) {
  float f = a + 0.3 * sin(0.19 * t + 0.5), u = f * 0.15915494 + 0.5;
  float s = 0.5 + 0.25 * sin(5.0 * f + 0.21 * t + 0.4) + 0.25 * sin(9.0 * f - 0.27 * t + 2.2);
  float big = nz(u * 6.0, 0.05 * t + 1.0, 6.0), env = nz(u * 4.0, 0.04 * t + 7.0, 4.0);
  float n1 = nz(u * 13.0, 0.09 * t + 3.0, 13.0), n2 = rdg(nz(u * 29.0, 0.15 * t + 9.0, 29.0)), n3 = rdg(nz(u * 79.0, 0.27 * t + 17.0, 79.0));
  return 0.08 * s + 0.3 * big + (0.2 + 0.8 * env) * (0.18 * n1 + 0.3 * n2 * n2 * n2 + 0.14 * n3 * n3);
}
// Portail: the light of the torn rim at e px past the outline (along the ray from the centre; negative inside), the angle
// a, d the point in the bubble's own frame, ts the sparkles' clock. x: its glow (a violet light just inside the rim, a
// softer one around it, and glowing smoke that streams slowly outward and curls, with a few fine filaments in it); y: a
// soft band of light on the rim, broken here and there, and the dust: tiny specks in cells about 3 px a side, crowded on
// the rim and thinning outward, each twinkling at its own pace (thousands of them, for the cost of a hash per pixel).
vec2 portal(float e, float a, vec2 d, float ts) {
  float u = a * 0.15915494 + 0.5, eo = max(e, 0.0);
  float sx = u * 17.0 + 0.45 * sin(0.035 * e + 6.2832 * 2.0 * u + 0.21 * ts), sy = e / 26.0 - 0.16 * ts;
  float sm = 0.62 * nz(sx, sy, 17.0) + 0.38 * nz(u * 41.0 + 0.3 * sin(0.06 * e + 0.3 * ts), e / 12.0 - 0.27 * ts + 40.0, 41.0);
  float smoke = smoothstep(0.3, 0.88, sm);
  // (the filaments lean: further out, further along the rim, so they curl away from it like smoke caught in a slow eddy)
  float fil = rdg(nz(u * 41.0 + 0.05 * e + 0.4 * sin(0.05 * e + 6.2832 * 2.0 * u + 0.2 * ts), e / 30.0 - 0.2 * ts + 80.0, 41.0));
  fil *= fil; fil = fil * fil * fil;
  float glow = (e < 0.0 ? 0.36 * exp(e / 6.0) + 0.16 * exp(e / 22.0) : 0.36 * exp(-e / 4.0) + 0.2 * exp(-e / 18.0) + 0.08 * exp(-e / 45.0))
    + smoke * (0.5 * exp(-eo / 24.0) + 0.24 * exp(-eo / 55.0)) * smoothstep(-14.0, 6.0, e)
    + 0.6 * fil * (0.35 + 0.65 * smoke) * exp(-eo / 38.0) * smoothstep(-2.0, 8.0, e);
  // (brighter and denser along some stretches of the rim, fainter along others, slowly changing)
  float vary = 0.3 + 0.95 * nz(u * 7.0, 0.05 * ts + 200.0, 7.0);
  // (the line on the rim breaks in long stretches and short ones: a seam of light, not a wire)
  float br = smoothstep(0.35, 0.75, nz(u * 37.0, 0.2 * ts + 120.0, 37.0)) * (0.55 + 0.45 * smoothstep(0.3, 0.8, nz(u * 97.0, 0.45 * ts + 150.0, 97.0)));
  float line = 0.34 * exp(-e * e / 14.0) * br * vary;
  glow *= 0.35 + 0.65 * vary;
  // the dust: one speck at most in each cell
  float K = u_pd.y, cy = e / 3.0 + 64.0, cx = u * K;
  vec2 ci = floor(vec2(cx, cy)), cf = vec2(cx, cy) - ci;
  uint ix = uint(mod(ci.x, K)), iy = uint(max(ci.y, 0.0));
  float h1 = bh(ix, iy), ec = (ci.y + 0.5 - 64.0) * 3.0;
  float dens = u_pd.z * (0.9 * exp(-ec * ec / 50.0) + 0.32 * exp(-max(ec, 0.0) / 22.0) * step(-5.0, ec)) * (0.3 + 0.4 * br + 0.5 * smoke) * vary;
  float dust = 0.0;
  if (h1 < dens) {
    float h2 = bh(ix + 7919u, iy), h3 = bh(ix, iy + 2671u), cw = 6.2832 / K * length(vec2(u_ab.x * d.y, u_ab.y * d.x));
    vec2 q = (cf - vec2(0.3 + 0.4 * h2, 0.3 + 0.4 * h3)) * vec2(cw, 3.0);
    float r = 0.45 + 0.5 * fract(h1 * 97.3), tw = 0.5 + 0.5 * sin(ts * (0.8 + 3.2 * h2) + 6.2832 * h3);
    dust = exp(-dot(q, q) / (r * r)) * (0.1 + 0.9 * tw * tw * tw) * (1.6 - 0.6 * r);
  }
  return vec2(glow, line + 1.4 * dust) * (1.0 - smoothstep(0.5 * u_pd.w, u_pd.w, e)); // (all gone where its box ends)
}
// the outline: how far out it swells (0..1) at the angle a (as bubWave)
float wave(float a, float t) {
  float k = u_wv.y, g = u_wv.z, f = a + 0.3 * sin(0.19 * t + 0.5);
  float v = 0.6 * sin(k * f + 0.6 * t) + 0.4 * sin(k * f - 0.45 * t + 1.7)
    + g * (0.8 * sin((k + 1.0) * f + 0.37 * t + 0.6) + 0.5 * sin((2.0 * k - 1.0) * f - 0.83 * t + 2.3) + 0.35 * sin((k + 3.0) * f + 1.1 * t + 4.0));
  float x = clamp(v / (0.95 + 0.75 * g), -1.0, 1.0);
  return 0.5 + 0.5 * x * (1.5 - 0.5 * x * x);
}
// the level l read through a cubic B-spline (four bilinear taps): smooth however coarse the level, no blocks, no diamonds
vec3 bsp(vec2 uv, float l) {
  vec2 n = u_tx / exp2(l), st = uv * n - 0.5, i = floor(st), f = st - i, f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0, w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3, h0 = (i - 0.5 + w1 / g0) / n, h1 = (i + 1.5 + w3 / g1) / n;
  return g0.y * (g0.x * textureLod(u_pic, h0, l).rgb + g1.x * textureLod(u_pic, vec2(h1.x, h0.y), l).rgb)
       + g1.y * (g0.x * textureLod(u_pic, vec2(h0.x, h1.y), l).rgb + g1.x * textureLod(u_pic, h1, l).rgb);
}
// the picture blurred to the level l (fractional: between two levels)
vec3 blurAt(vec2 uv, float l) {
  l = clamp(l, 0.0, u_view.z);
  float i = floor(l), f = l - i;
  vec3 a = i < 0.5 ? textureLod(u_pic, uv, 0.0).rgb : bsp(uv, i);
  if (f >= 0.004) a = mix(a, bsp(uv, i + 1.0), f);
  // the last picture fading out while this one comes in (u_xf: 1 once it is gone): what changed from one to the other is
  // soft, a trilinear tap of each tells it
  if (u_xf < 1.0) a += (1.0 - u_xf) * (textureLod(u_pic0, uv, l).rgb - textureLod(u_pic, uv, l).rgb);
  return a;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_view.x - gl_FragCoord.y) / u_view.y;
  vec2 d = (p - u_c) / u_ab.xy;
  float n = u_ab.z, rr = pow(pow(abs(d.x), n) + pow(abs(d.y), n), 1.0 / n);
  float ang = atan(d.y, d.x + 1e-6), rho = 1.0 + u_wv.x * wave(ang, u_t), rn = rr / rho, fw = u_wv.w;
  float m = 1.0 - smoothstep(1.0, 1.0 + fw, rn);
  // Portail: the glass ends at the torn outline (the fray on the lobes; reckoned only within 48 px of the rim, further in it
  // cannot matter), with a crisper edge, and the rim's light is reckoned in px past it. The scene inside keeps flowing and
  // blurring by the lobes alone: the fray does not drag it.
  vec2 pl = vec2(0.0);
  float ef = -99.0;
  if (u_pt.x > 0.5) {
    float L = length(p - u_c);
    if (L * (1.0 - 1.0 / max(rn, 1e-3)) > -48.0) {
      float rf = rr / (rho + u_pt.y * fray(ang, u_t)), fp = 1.5 + 0.48 * fw / u_rw;
      ef = L * (1.0 - 1.0 / max(rf, 1e-3));
      m = 1.0 - smoothstep(-0.4 * fp, fp, ef);
      if (ef > -40.0 && ef < u_pd.w) pl = portal(ef, ang, d, u_pt.w);
    }
  }
  float ha = u_hal.z * (1.0 - smoothstep(1.0, 1.0 + fw + u_hal.x, rn)) * (1.0 - m);
  float e = (rn - 1.0 - 0.4 * fw) / u_rw, rim = u_sh.w * exp(-e * e);
  if (m + ha + rim + pl.x + pl.y < 0.001) { o = vec4(0.0); return; }
  // the scene inside: carried out with the swelling rim, turning a little with its twist, flowing; the more so near the rim
  vec2 q = p;
  float w = smoothstep(0.25, 1.0, rn) * m;
  if (w > 0.0) {
    vec2 r = (p - u_c) * (1.0 - u_im.z * w * (1.0 - 1.0 / rho));
    float tw = u_im.w * w * sin(0.19 * u_t + 0.5), cs = cos(tw), sn = sin(tw);
    r = mat2(cs, sn, -sn, cs) * r;
    vec2 x = p / u_im.y;
    x += 0.6 * vec2(sin(1.3 * x.y + 0.7 * u_t), cos(1.1 * x.x - 0.6 * u_t));
    vec2 fl = vec2(sin(x.y + 0.9 * u_t + 1.3) + 0.5 * sin(1.9 * x.x - 0.8 * x.y - 1.1 * u_t),
                   cos(x.x - 0.8 * u_t) + 0.5 * cos(1.7 * x.y + 0.9 * x.x + 1.2 * u_t + 0.4)) / 1.5;
    q = u_c + r + u_im.x * w * fl;
  }
  // sharp from where the blur starts, full where it ends, along its curve
  float b = clamp((u_bl.y - rn) / max(0.01, u_bl.y - u_bl.z), 0.0, 1.0);
  vec3 c = blurAt((q - u_pr.xy) / u_pr.zw, u_bl.x * pow(b, u_bl.w));
  // behind the text the light held on the ink's side, then the glass's tint and a faint sheen on the light's side
  c = mix(c, min(c, u_dk.rgb), u_dk.a * m);
  c = mix(c, max(c, u_lt.rgb), u_lt.a * m);
  c = mix(c, u_tone.rgb, u_tone.a * m);
  c = mix(c, vec3(1.0, 0.988, 0.965), u_sh.z * m * max(0.0, 1.0 - length(d - u_sh.xy * vec2(0.42, 0.5)) / 0.75));
  // Portail: just inside its torn edge the opening deepens (darker at night, a violet veil by day): the hole reads as one
  if (ef > -40.0) { float sd = exp(min(ef, 0.0) / 11.0) * m; c = mix(c * (1.0 - (0.42 - 0.2 * u_pd.x) * sd), u_pg * 0.5, (0.14 + 0.1 * u_pd.x) * sd); }
  float a = m * u_op, h = ha * u_op;
  vec4 col = vec4(c * a, a);
  if (h > 0.0) col += vec4(blurAt((p - u_pr.xy) / u_pr.zw, u_hal.y) * h, h);
  // the line of light along the rim, brighter on the light's side
  float l = rim * u_op * (0.55 + 0.45 * dot(normalize(d + 1e-5), u_sh.xy));
  o = vec4(1.0, 0.985, 0.955, 1.0) * l + col * (1.0 - l);
  // Portail's light: at night added to what is under it (the canvas is premultiplied: light with next to no cover). Over a
  // bright scene, where added light would all but vanish, its line and its dust are laid over it in a deep violet, and its
  // glow is a paler lilac haze, half as strong, still added
  if (pl.x + pl.y > 0.0) {
    float G = u_pt.z * u_op * (0.9 + 0.1 * sin(0.45 * u_pt.w)), day = u_pd.x, ov = day * min(0.85, (0.14 * pl.x + 1.05 * pl.y) * G); // (it breathes)
    vec3 add = (u_pg * pl.x * (1.0 - 0.5 * day) + u_pl * pl.y * (1.0 - day)) * G;
    o = vec4(u_pl * ov, ov) + o * (1.0 - ov);
    o = vec4(o.rgb + add, min(1.0, o.a + 0.12 * max(add.r, max(add.g, add.b))));
  }
}`;
  const BUB_U = ['u_box', 'u_scr', 'u_pic', 'u_pr', 'u_tx', 'u_view', 'u_c', 'u_ab', 'u_t', 'u_wv', 'u_im', 'u_bl', 'u_hal', 'u_tone', 'u_dk', 'u_lt', 'u_sh', 'u_rw', 'u_op', 'u_pt', 'u_pd', 'u_pg', 'u_pl', 'u_pic0', 'u_xf'];
  const bubGL = {
    cv: null, gl: null, U: {}, tx: [], tz: [[0, 0], [0, 0]], cur: 0, ok: false, t: 7.3, ts: 0, drawn: false, n: 0, // (ts: Portail's sparkles' clock)
    // the picture fading in over the last one (xf 0..1 from xt over xd ms), the glass gliding to its look (bubSpring), its region
    xf: 1, xt: 0, xd: 330, upAt: 0, reg: '', look: bubSpring(3.5), P: null, gsh: [0, 0, 0], gpd: [0, 0, 0],
    // The context, once per canvas: false when WebGL 2 is missing or the program fails (the bubble is painted in 2D then).
    init(cv) {
      if (this.cv === cv) return this.ok;
      this.cv = cv; this.ok = false;
      try {
        const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
        if (!gl) return false;
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, BUB_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, BUB_FS)); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        gl.useProgram(p);
        for (const k of BUB_U) this.U[k] = gl.getUniformLocation(p, k);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(p, 'a_p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        this.tx = [1, 0].map((u) => { // two pictures: the one shown (unit 0) and the last one, fading out (unit 1)
          const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return t;
        }).reverse();
        this.tz = [[0, 0], [0, 0]]; this.cur = 0;
        gl.uniform1i(this.U.u_pic, 0); gl.uniform1i(this.U.u_pic0, 1); gl.uniform1f(this.U.u_xf, 1);
        gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
        cv.addEventListener('webglcontextlost', (e) => { // painted in 2D from then on
          e.preventDefault(); this.ok = false; this.off();
          if (SUPPORTS.bubble.lost) SUPPORTS.bubble.lost();
        });
        this.gl = gl; this.ok = true;
      } catch (e) { console.warn('bubble: no WebGL 2', e); this.ok = false; }
      return this.ok;
    },
    off() { if (this.cv) this.cv.classList.remove('on'); this.drawn = false; },
    // The picture under it (sides multiples of 128: each of its seven halvings falls on whole texels) and its levels. With
    // `fade` (the same region as the last one) that one stays on the other texture and fades out over the time between the
    // two (a third of a second while the scene changes, at most 0.42 s): the picture inside moves on smoothly, not in steps.
    upload(src, fade) {
      const gl = this.gl, now = performance.now();
      if (fade) this.cur ^= 1;
      const i = this.cur, z = this.tz[i];
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tx[i ^ 1]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tx[i]);
      if (src.width !== z[0] || src.height !== z[1]) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src); this.tz[i] = [src.width, src.height]; }
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.xf = fade ? 0 : 1; this.xt = now; this.xd = Math.min(420, Math.max(120, now - this.upAt)); this.upAt = now;
    },
    // Still gliding: the glass, Portail's colour or the picture (the app draws it again on its frames until they are there).
    get easing() { return this.ok && this.drawn && (this.look.on || bubTintE.on || this.xf < 1); },
    // The glass and Portail's light as they are now, on their way (uniforms only).
    glass(now) {
      const gl = this.gl, U = this.U, P = this.P;
      if (bubTintE.step(now) && P && P.portail && P.auto) P.tint = bubHex(bubTintE.x);
      this.look.step(now);
      if (this.xf < 1) this.xf = Math.min(1, (now - this.xt) / this.xd);
      const x = this.look.x, lk = P && P.portail ? bubPortalLook(P, x[13]) : null;
      gl.uniform4f(U.u_tone, x[0], x[1], x[2], x[3]); gl.uniform4f(U.u_dk, x[4], x[5], x[6], x[7]); gl.uniform4f(U.u_lt, x[8], x[9], x[10], x[11]);
      gl.uniform4f(U.u_sh, this.gsh[0], this.gsh[1], x[12], this.gsh[2]);
      gl.uniform4f(U.u_pd, lk ? x[13] : 0, this.gpd[0], this.gpd[1], this.gpd[2]);
      gl.uniform3f(U.u_pg, ...(lk ? lk.glow : [0, 0, 0])); gl.uniform3f(U.u_pl, ...(lk ? lk.line : [0, 0, 0]));
      gl.uniform1f(U.u_xf, this.xf);
    },
    // One frame: only the time changes (and Portail's sparkles' clock, which runs whatever the undulation's speed).
    render() {
      if (!this.ok || !this.drawn) return;
      const gl = this.gl;
      this.glass(performance.now());
      gl.viewport(0, 0, this.cv.width, this.cv.height); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(this.U.u_t, this.t);
      if (this.pt) gl.uniform4f(this.U.u_pt, 1, this.pt[0], this.pt[1], this.ts);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); this.n++;
    },
    // The bubble painted anew: its picture, its shape and its glass. W, H: the screen; sh: the bubble; P: the settings.
    draw(o, sh, W, H, P) {
      const gl = this.gl, cv = this.cv, s = Math.min(devicePixelRatio || 1, 1.25), U = this.U, mr = Math.min(sh.a, sh.b);
      if (cv.width !== Math.round(W * s) || cv.height !== Math.round(H * s)) { cv.width = Math.round(W * s); cv.height = Math.round(H * s); }
      // where it is drawn: as far as its rim swells, fades and its halo reaches (and Portail's fray and light)
      const X = (1 + P.amp + P.F + P.reach) * (1 + P.fade + P.halo) + 0.03;
      const B = { x0: Math.max(0, sh.cx - sh.a * X), x1: Math.min(W, sh.cx + sh.a * X), y0: Math.max(0, sh.cy - sh.b * X), y1: Math.min(H, sh.cy + sh.b * X) };
      if (B.x1 - B.x0 < 2 || B.y1 - B.y0 < 2) { this.off(); return true; }
      // the picture: that, and around it what the flowing and the widest blur read
      const pic = o.pic, pk = pic ? pic.width / W : 1, qt = Math.min(pk, s), Rc = P.blur * BUB_BLUR * mr;
      const flow = P.img * 0.09 * mr, twist = P.img * 0.08;
      const Lc0 = Math.log2(Math.max(1, Rc * qt)), Lh = Math.min(Lc0, Math.max(1, Lc0 * 0.6));
      const M = flow + twist * Math.max(sh.a, sh.b) + Math.max(2 ** (Lh + 2) / qt, 2 * Rc - mr) + 8;
      const px0 = Math.max(0, Math.floor(B.x0 - M)), px1 = Math.min(W, Math.ceil(B.x1 + M)), py0 = Math.max(0, Math.floor(B.y0 - M)), py1 = Math.min(H, Math.ceil(B.y1 + M));
      const pw = px1 - px0, ph = py1 - py0, tw = Math.max(128, Math.ceil((pw * qt) / 128) * 128), th = Math.max(128, Math.ceil((ph * qt) / 128) * 128);
      const L0 = bubCv('GL0', tw, th), g = L0.g;
      if (pic) g.drawImage(pic, px0 * pk, py0 * pk, pw * pk, ph * pk, 0, 0, tw, th);
      else { g.fillStyle = '#1b1815'; g.fillRect(0, 0, tw, th); }
      g.setTransform(tw / pw, 0, 0, th / ph, (-px0 * tw) / pw, (-py0 * th) / ph); bubGlows(g, o.glows); g.setTransform(1, 0, 0, 1, 0, 0);
      let lum;
      if (o.under) lum = 0.2126 * o.under[0] + 0.7152 * o.under[1] + 0.0722 * o.under[2];
      else { const t = bubCv('P', 1, 1); t.g.drawImage(L0, 0, 0, 1, 1); try { const d = t.g.getImageData(0, 0, 1, 1).data; lum = (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255; } catch (e) { lum = 0.1; } }
      const k = bubLook(o, lum, false, P), [lx, ly] = bubLightDir(o, sh), c255 = (a) => a.map((v) => v / 255);
      const snap = bubFresh || !this.drawn || bubRM(), reg = [px0, py0, pw, ph, tw, th].join();
      this.upload(L0, !snap && reg === this.reg); this.reg = reg;
      const tq = tw / pw, maxL = Math.min(7, Math.floor(Math.log2(Math.min(tw, th)))), Lc = Math.log2(Math.max(1, Rc * tq));
      gl.uniform4f(U.u_box, B.x0, B.y0, B.x1, B.y1); gl.uniform2f(U.u_scr, W, H);
      gl.uniform4f(U.u_pr, px0, py0, pw, ph); gl.uniform2f(U.u_tx, tw, th); gl.uniform3f(U.u_view, cv.height, cv.height / H, maxL);
      gl.uniform2f(U.u_c, sh.cx, sh.cy); gl.uniform3f(U.u_ab, sh.a, sh.b, sh.n);
      gl.uniform4f(U.u_wv, P.amp, P.lobes, P.irr, P.fade);
      gl.uniform4f(U.u_im, flow, P.iscale * 0.12 * mr, Math.min(1, P.img * 2), twist);
      gl.uniform4f(U.u_bl, Math.min(Lc, maxL), P.start, P.end, P.ease);
      gl.uniform3f(U.u_hal, P.halo, Math.min(Lh + Math.log2(tq / qt), maxL), 0.85 * bubSm(0, 0.1, P.halo));
      gl.uniform1f(U.u_rw, 1.6 / mr); gl.uniform1f(U.u_op, P.op);
      // Portail: its fray, its light and its colours by the glass's mood, its dust's cells (all 0 on the glass: skipped)
      const lk = P.portail ? bubPortalLook(P, bubMood.mix) : null;
      this.pt = lk ? [P.F, lk.G] : null;
      gl.uniform4f(U.u_pt, lk ? 1 : 0, P.F, lk ? lk.G : 0, this.ts);
      // the glass's tint and veil, the light held behind the text, the sheen, Portail's mood: where they are going (glass()
      // takes them there, frame by frame: a new sample of the scene under the text no longer makes it jump)
      this.look.aim([...c255(k.tone), k.veil, ...c255(k.dk[0]), k.dk[1], ...c255(k.lt[0]), k.lt[1], k.sheen, lk ? lk.day : 0], snap);
      this.P = P; this.gsh = [lx, ly, P.portail ? 0 : P.rim * 0.5]; this.gpd = [bubDustCells(sh), lk ? lk.dust : 0, P.reach * mr];
      this.drawn = true; cv.classList.add('on'); bubFresh = false;
      this.render();
      return true;
    },
  };

  // ---- Portail's particles ----
  // A small 2D canvas of its own over the bubble's layer: the bubble's box and the reach of its sparks, never the screen (in
  // a full-size wrapper that takes the transforms the bubble's layers take). Each frame draws a few hundred particles, each
  // one drawImage of a few cached sprites (a fine speck with a lilac halo, a soft violet glow, a four-rayed glint), added to
  // each other. They are seeded once along the outline, by its length, in clumps and in denser and sparser stretches, and
  // ride it as it swells and frays (bubRho at the GPU's time). Most crowd the rim and twinkle; some leave it, drift out and
  // fade like sparks escaping, then start again. The app asks for a frame thirty times a second at most and only while the
  // bubble is shown; with reduced motion none: they are drawn once with each painting, still. No blur, no filter, no pixel
  // loop: a little trig and one drawImage each.
  const bubRng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // (seeded: mulberry32)
  const BUB_PS = 12; // numbers per particle: angle, kind, offset (px), sprite, size (px), alpha, phase, twinkle speed, twinkle sharpness, life (s), life phase, reach (px) or swirl
  // The particles for a bubble of half-axes a, b: n of them (the « Étincelles »), the same ones every time (seeded).
  function bubSpkSeed(sh, P, n, k) {
    const R = bubRng(41), A = new Float32Array(n * BUB_PS), M = 256, T = new Float32Array(M + 1);
    const g = (s) => (R() + R() + R() - 1.5) * s * 1.41; // (about gaussian)
    // the rim's length, angle by angle, at rest
    let px = 0, py = 0;
    for (let i = 0; i <= M; i++) {
      const a = (i / M) * 2 * Math.PI - Math.PI, c = Math.cos(a), s = Math.sin(a), r = (1 + P.amp * 0.5) / (Math.abs(c) ** sh.n + Math.abs(s) ** sh.n) ** (1 / sh.n);
      const x = c * r * sh.a, y = s * r * sh.b;
      T[i] = i ? T[i - 1] + Math.hypot(x - px, y - py) : 0; px = x; py = y;
    }
    const at = (L) => { let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] < L) lo = m; else hi = m; } return ((lo + (L - T[lo]) / Math.max(1e-6, T[hi] - T[lo])) / M) * 2 * Math.PI - Math.PI; };
    // denser and sparser stretches along the rim, still
    const env = (a) => 0.22 + 0.78 * bubNz((a * 0.15915494 + 0.5) * 6, 3.3, 6) ** 1.3;
    const pick = () => { for (let j = 0; j < 12; j++) { const a = at(R() * T[M]); if (R() < env(a)) return a; } return at(R() * T[M]); };
    const rp = Math.max(4, P.reach * Math.min(sh.a, sh.b)); // (how far the sparks get)
    let la = 0, ls = 0;
    for (let i = 0; i < n; i++) {
      const o = i * BUB_PS, q = R();
      // kind: 0 a speck on the rim, 1 a spark that leaves it, 2 a soft glow on it, 3 a glint
      const kind = q < 0.55 ? 0 : q < 0.8 ? 1 : q < 0.95 ? 2 : 3;
      let a = pick(), s = g(2.2) + 0.8;
      if (kind === 0 && i && R() < 0.4) { a = la + g(0.012); s = ls + g(1.6); } // (in clumps)
      if (kind === 0) { la = a; ls = s; }
      A[o] = a; A[o + 1] = kind; A[o + 2] = kind === 2 ? g(2) + 1 : s;
      A[o + 3] = kind === 2 ? 1 : kind === 3 ? 2 : 0;
      A[o + 4] = k * (kind === 2 ? 9 + 13 * R() : kind === 3 ? 6 + 6 * R() : (2.4 + 3 * R() ** 2) * (kind === 1 ? 1.1 : 1));
      A[o + 5] = kind === 2 ? 0.1 + 0.14 * R() : kind === 3 ? 0.75 + 0.25 * R() : 0.45 + 0.55 * R();
      A[o + 6] = R() * 6.2832; A[o + 7] = kind === 2 ? 0.3 + 0.5 * R() : 0.7 + 3.4 * R();
      A[o + 8] = kind === 3 ? 7 : kind === 2 ? 1 : 1 + Math.floor(R() * 4);
      A[o + 9] = 2.6 + 5 * R(); A[o + 10] = R();
      A[o + 11] = kind === 1 ? rp * (0.25 + 0.75 * R() ** 1.6) : (R() - 0.5) * 0.004; // (a spark's reach; the others creep along the rim)
    }
    return A;
  }
  // The sprites, drawn once for a mood: at night white specks with a lilac halo; over a bright scene the halo turns a deeper
  // violet (white would vanish there), laid over rather than added.
  function bubSpkSprites(day, tint = BUB_DEF.ptint) {
    const mk = (S, f) => { const cv = document.createElement('canvas'); cv.width = cv.height = S; f(cv.getContext('2d'), S / 2); return cv; };
    const T = bubTint(tint), L = (a, b) => T(a.map((v, i) => (v + (b[i] - v) * day) / 255)).map((v) => Math.round(v * 255)).join(',');
    const halo = L([214, 196, 255], [92, 48, 196]), deep = L([172, 140, 255], [124, 86, 226]), core = L([255, 255, 255], [255, 252, 255]);
    // (by day the white heart is ringed with a deep violet, so that it still glints over a pale sky)
    const dot = (g, h, a = 1) => {
      g.fillStyle = rad(g, h, h, h, [[0, `rgba(${core},${a})`], [0.1 + 0.06 * day, `rgba(${core},${a})`], [0.22 + 0.08 * day, `rgba(${halo},${(0.62 + 0.3 * day) * a})`], [0.5, `rgba(${deep},${(0.2 + 0.1 * day) * a})`], [1, `rgba(${deep},0)`]]);
      g.fillRect(0, 0, 2 * h, 2 * h);
    };
    return [
      mk(32, (g, h) => dot(g, h)),
      mk(48, (g, h) => { g.fillStyle = rad(g, h, h, h, [[0, `rgba(${halo},0.75)`], [0.35, `rgba(${deep},0.32)`], [1, `rgba(${deep},0)`]]); g.fillRect(0, 0, 2 * h, 2 * h); }),
      mk(48, (g, h) => {
        for (const [w, l] of [[2, 1], [1, 0.62]]) for (const v of [0, 1]) { // two rays, across and up, fading to their tips
          const gr = v ? g.createLinearGradient(h, 0, h, 2 * h) : g.createLinearGradient(0, h, 2 * h, h);
          gr.addColorStop(0, `rgba(${halo},0)`); gr.addColorStop(0.5, `rgba(${core},${l})`); gr.addColorStop(1, `rgba(${halo},0)`);
          g.fillStyle = gr; if (v) g.fillRect(h - w / 2, 0, w, 2 * h); else g.fillRect(0, h - w / 2, 2 * h, w);
        }
        g.save(); g.translate(h, h); g.scale(0.42, 0.42); g.translate(-h, -h); dot(g, h); g.restore();
      }),
    ];
  }
  // The particles drawn on g (set to draw in the screen's px): t the outline's time, ts the sparkles' clock.
  function bubSpkPaint(g, A, n, sh, P, t, ts, spr, add) {
    g.globalCompositeOperation = add ? 'lighter' : 'source-over';
    const N = sh.n, ia = 1 / N;
    for (let i = 0; i < n; i++) {
      const o = i * BUB_PS, kind = A[o + 1];
      let s = A[o + 2], al = A[o + 5], sz = A[o + 4], a = A[o];
      const tw = 0.5 + 0.5 * Math.sin(A[o + 6] + ts * A[o + 7]);
      if (kind === 1) { // a spark: born on the rim, out and fading, swirling a little, then born again
        const ph = ts / A[o + 9] + A[o + 10], f = ph - Math.floor(ph);
        s += A[o + 11] * f ** 1.3; a += (A[o + 6] - 3.1416) * 0.012 * f;
        al *= bubSm(0, 0.08, f) * (1 - f) ** 1.15 * (0.55 + 0.45 * tw); sz *= 1 - 0.5 * f;
      } else {
        a += A[o + 11] * ts;
        al *= kind === 2 ? 0.6 + 0.4 * tw : kind === 3 ? tw ** 7 : 0.18 + 0.82 * tw ** A[o + 8];
      }
      if (al < 0.02) continue;
      const c = Math.cos(a), sn = Math.sin(a), r = bubRho(a, t, P) / (Math.abs(c) ** N + Math.abs(sn) ** N) ** ia;
      const x = c * r * sh.a, y = sn * r * sh.b, L = Math.hypot(x, y) || 1, k = 1 + s / L;
      g.globalAlpha = Math.min(1, al);
      g.drawImage(spr[A[o + 3]], sh.cx + x * k - sz, sh.cy + y * k - sz, 2 * sz, 2 * sz);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  const bubSpk = {
    cv: null, g: null, wrap: null, on: false, A: null, n: 0, key: '', spr: null, day: -1, sh: null, P: null, B: null, d: 1,
    // Laid out with each painting: where its canvas is, the particles (again only when their number or the bubble's size
    // changed), their sprites (again when the glass's mood moved), then one frame.
    place(cv, sh, W, H, P) {
      if (!cv || !P.portail || !(P.spark > 0.004)) { this.off(); return; }
      if (cv !== this.cv) { this.cv = cv; this.g = cv.getContext('2d'); this.wrap = cv.parentNode; }
      const n = Math.round(90 + 410 * P.spark), key = [n, sh.a.toFixed(1), sh.b.toFixed(1), sh.n, P.amp, P.reach].join();
      if (key !== this.key) { this.A = bubSpkSeed(sh, P, n, 1); this.key = key; this.n = n; }
      const day = Math.round(bubMood.mix * 20) / 20;
      if (day !== this.day || P.tint !== this.tint) { this.day = day; this.tint = P.tint; this.spr = bubSpkSprites(day, P.tint); this.sprT = performance.now(); }
      // its box: as far as the rim swells and frays, the sparks' reach and a sprite's size
      const X = 1 + P.amp + P.F, m = P.reach * Math.min(sh.a, sh.b) + 24, d = Math.min(devicePixelRatio || 1, 2);
      const B = { x0: Math.max(0, Math.floor(sh.cx - sh.a * X - m)), y0: Math.max(0, Math.floor(sh.cy - sh.b * X - m)) };
      B.x1 = Math.min(W, Math.ceil(sh.cx + sh.a * X + m)); B.y1 = Math.min(H, Math.ceil(sh.cy + sh.b * X + m));
      const w = Math.max(1, B.x1 - B.x0), h = Math.max(1, B.y1 - B.y0);
      if (!this.B || this.B.x0 !== B.x0 || this.B.y0 !== B.y0 || this.B.x1 !== B.x1 || this.B.y1 !== B.y1 || this.d !== d) {
        Object.assign(cv.style, { left: B.x0 + 'px', top: B.y0 + 'px', width: w + 'px', height: h + 'px' });
        cv.width = Math.round(w * d); cv.height = Math.round(h * d);
      }
      Object.assign(this, { sh: Object.assign({}, sh), P, B, d, on: true });
      if (this.wrap) this.wrap.classList.add('on');
      this.render();
    },
    render() {
      if (!this.on) return;
      const g = this.g, d = this.d, B = this.B, now = performance.now();
      if (this.P.tint !== this.tint && now - this.sprT > 120) { this.tint = this.P.tint; this.spr = bubSpkSprites(this.day, this.tint); this.sprT = now; } // (the colour on its way)
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
      g.setTransform(d, 0, 0, d, -B.x0 * d, -B.y0 * d);
      bubSpkPaint(g, this.A, this.n, this.sh, this.P, bubGL.t, bubGL.ts, this.spr, this.day < 0.5);
    },
    off() {
      if (!this.on) return;
      this.on = false; if (this.wrap) this.wrap.classList.remove('on');
      if (this.g) { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.cv.width, this.cv.height); }
    },
  };

  // ---- in 2D ----
  // The masks (the levels, the bubble, its halo, its line of light), laid around the bubble's centre so that moving it
  // keeps them: computed once for a size and a shape, small, and scaled up where they are used (they are all soft).
  const bubMasks = {};
  const BUB_MASKS = [...Array.from({ length: BUB_LV }, (_, i) => 'l' + i), 'in', 'halo', 'rim'];
  function bubMaskSet(sh, q, pre, P, Lc, t) {
    const key = [sh.a.toFixed(1), sh.b.toFixed(1), sh.n, q.toFixed(4), Lc.toFixed(2), t.toFixed(2), ...Object.entries(P).filter(([k]) => k !== 'tint' && k !== 'auto').map((e) => e[1])].join();
    if (bubMasks[pre] && bubMasks[pre].key === key) return bubMasks[pre];
    const n = sh.n, ex = sh.a * sh.X, ey = sh.b * sh.X, w = Math.max(2, Math.ceil(2 * ex * q)), h = Math.max(2, Math.ceil(2 * ey * q));
    const D = BUB_MASKS.map(() => new ImageData(w, h)), ax = new Float32Array(w), dx = new Float32Array(w);
    const fw = P.fade, hs = 0.85 * bubSm(0, 0.1, P.halo), rw = Math.max(1.6 / Math.min(sh.a, sh.b), 1.2 / q / Math.min(sh.a, sh.b));
    // (Portail: the glass ends at the torn outline with a crisper edge, as crisp as these small masks allow, and the line of
    // light is its glow instead, in px past that outline; as on the GPU)
    const fp = Math.max(1.5 + 0.3 * fw * Math.min(sh.a, sh.b), 1.2 / q), reach = P.reach * Math.min(sh.a, sh.b);
    for (let i = 0; i < w; i++) { dx[i] = ((i + 0.5) / q - ex) / sh.a; ax[i] = Math.abs(dx[i]) ** n; }
    for (let j = 0; j < h; j++) {
      const dy = ((j + 0.5) / q - ey) / sh.b, ay = Math.abs(dy) ** n;
      for (let i = 0; i < w; i++) {
        const rr = (ax[i] + ay) ** (1 / n), an = Math.atan2(dy, dx[i]), rho = 1 + P.amp * bubWave(an, t, P.lobes, P.irr), rn = rr / rho, k = (j * w + i) * 4 + 3;
        const L = Lc * bubClamp((P.start - rn) / Math.max(0.01, P.start - P.end), 0, 1) ** P.ease, e = (rn - 1 - 0.4 * fw) / rw;
        let m = 1 - bubSm(1, 1 + fw, rn), li = Math.exp(-e * e);
        if (P.portail) {
          const Lp = Math.hypot(dx[i] * sh.a, dy * sh.b), ef = Lp * (1 - 1 / Math.max(1e-3, rn)) > -48 ? Lp * (1 - 1 / Math.max(1e-3, rr / (rho + P.F * bubFray(an, t)))) : -99;
          m = 1 - bubSm(-0.4 * fp, fp, ef);
          li = Math.min(1, ef < 0 ? 0.62 * Math.exp(ef / 7) + 0.2 * Math.exp(ef / 26) : 0.62 * Math.exp(-ef / 5) + 0.24 * Math.exp(-ef / 22)) * (1 - bubSm(0.5 * reach, reach, ef));
        }
        for (let l = 0; l < BUB_LV; l++) D[l].data[k] = 255 * (1 - bubClamp(L - l, 0, 1));
        D[BUB_LV].data[k] = 255 * m;
        D[BUB_LV + 1].data[k] = 255 * hs * (1 - bubSm(1, 1 + fw + P.halo, rn)) * (1 - m);
        D[BUB_LV + 2].data[k] = 255 * li;
      }
    }
    const M = { key, q, ex, ey };
    BUB_MASKS.forEach((id, m) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(D[m], 0, 0); M[id] = cv; });
    return (bubMasks[pre] = M);
  }
  // Draw a mask over a canvas that covers the painted box R (in the screen's px).
  function bubMaskOn(g, cv, M, id, R, sh) {
    const q = M.q;
    g.drawImage(M[id], (R.x0 - (sh.cx - M.ex)) * q, (R.y0 - (sh.cy - M.ey)) * q, (R.x1 - R.x0) * q, (R.y1 - R.y0) * q, 0, 0, cv.width, cv.height);
  }
  // The ink: on the glass or with no background, light over a dark scene and dark over a bright one; on a colour, by the
  // colour. (On the glass the reader's own colours win when they are followed; see the app's supInk.)
  const bubDarkInk = () => (bubOpt.bg === 'color' ? lumOf(hex3(bubOpt.col)) > 0.45 : bubMood.milky);
  SUPPORTS.bubble = {
    name: 'Bulle', live: true, fit: true, opts: bubOpt, defaults: BUB_DEF, geom: bubGeom, inner: BUB_IN, band: BUB_BAND,
    cols: (measure) => Math.round(+bubOpt.cols || Math.min(BUB_COLS, measure || BUB_COLS)), // (its lines, in signs)
    height: bubHv, // (its height on the screen)
    glOn: false, lost: null, // (on the GPU; the app's callback when its context is lost)
    get frames() { return bubGL.n; }, // (the frames drawn on the GPU, for tests)
    get light() { return !bubDarkInk(); },
    ink: () => (bubDarkInk() ? '#211c17' : '#f2ece3'),
    ownInk: () => (bubOpt.bg === 'glass' ? null : bubDarkInk() ? '#211c17' : '#f2ece3'),
    // On the screen (env: the app's measures, s the reader's scale): the text box as high as the bubble, which keeps the
    // height it has on the screen whatever the scale; the column as wide as its lines, narrower only when the bubble at
    // that scale would leave the window.
    box: (W, H, u, env) => {
      if (!(W > 300 && env)) { const G = bubGeom(W, H), m = Math.max(0, H / 2 - G.b); return { top: m, bottom: m, side: Math.max(10, W / 2 - G.a * BUB_IN) }; }
      bubLast = { W, H }; bubEnv = env;
      const s = env.s || 1, b = Math.min(H / 2, bubHv(W, H) / (2 * s)), d1 = BUB_BAND[1] * env.lh;
      const want = SUPPORTS.bubble.cols(env.measure) * env.ch + 2 * env.pad, most = 2 * (bubKappa(bubN()) * ((W / 2 - 8) / s) - d1 + env.pad);
      const cw = Math.max(8 * env.ch + 2 * env.pad, Math.min(want, most));
      return { top: H / 2 - b, bottom: H / 2 - b, side: Math.max(0, (W - cw) / 2) };
    },
    // the object is the bubble: the text box, and the margin its lines' ends need on either side
    edge: (u, T) => {
      const E = bubEnv;
      if (!T || !E) { const G = bubGeom(bubLast.W, bubLast.H), x = T ? Math.max(0, G.a - T.w / 2) : G.a * (1 - BUB_IN); return { t: 0, r: x, b: 0, l: x }; }
      const a = (T.w / 2 - E.pad + BUB_BAND[1] * E.lh) / bubKappa(bubN());
      bubFit = { W: bubLast.W, H: bubLast.H, a, b: T.h / 2 };
      return { t: 0, r: Math.max(0, a - T.w / 2), b: 0, l: Math.max(0, a - T.w / 2) };
    },
    // The app's animation: the time moves on by dt (seconds, times the speed) and the GPU draws it again; with Portail its
    // sparkles' clock moves on by dts (seconds), and its particles are drawn again too.
    frame(dt, dts = 0) {
      bubGL.ts += dts;
      if (this.glOn) { bubGL.t += dt; bubGL.render(); }
      if (dts > 0) bubSpk.render();
    },
    sparkOff() { bubSpk.off(); }, // (the bubble is no longer shown)
    get easing() { return bubGL.easing; }, // (still gliding: the app asks for frames until it is done)
    fresh() { bubFresh = true; }, // (a new scene or size: shown as it is at once)
    tintNow: () => bubAuto.tint, // (the colour the halo found by itself, for the panel)
    skyAccent: (D) => bubSkyAccent(D), // (the sky's most coloured stop, [r, g, b] 0..1: the selection takes it over a scene)
    draw(c, S, W, H, o) {
      const mini = o.mini, pre = mini ? 'm' : '', G0 = bubGeom(W, H), P = bubPar(), gl = !mini && !!(o.glc && bubGL.init(o.glc));
      // (on the screen the halo's colour glides to the one found; one the reader picks is there at once)
      if (P.portail && P.auto) { const to = bubAutoTint(P.auto, o, o.pic || (mini ? c.canvas : null)); P.tint = mini ? to : bubTintTo(to, !gl); }
      else if (P.portail && !mini) bubTintTo(P.tint, true);
      const sh = { n: G0.n, cx: S.x + S.w / 2, cy: S.y + S.h / 2, b: S.h / 2, a: (S.h / 2) * (G0.a / G0.b) };
      if (!mini) {
        this.glOn = gl;
        if (this.glOn) { bubGL.draw(o, sh, W, H, P); bubSpk.place(o.spc, sh, W, H, P); return; }
        bubGL.off(); bubFresh = false;
      }
      sh.X = (1 + P.amp + P.F + P.reach) * (1 + P.fade + P.halo) + 0.03;
      const X = sh.X, R = {
        x0: Math.max(0, Math.floor(sh.cx - sh.a * X)), x1: Math.min(W, Math.ceil(sh.cx + sh.a * X)),
        y0: Math.max(0, Math.floor(sh.cy - sh.b * X)), y1: Math.min(H, Math.ceil(sh.cy + sh.b * X)),
      };
      const rw = R.x1 - R.x0, rh = R.y1 - R.y0;
      if (rw < 4 || rh < 4) return;

      // 1. the scene's picture under it, halved six times: from a light blur to a very wide one
      const pic = o.pic || (mini ? c.canvas : null), pk = pic ? pic.width / W : 1, q0 = Math.min(pk, 400 / Math.max(sh.a, sh.b)), L = [];
      L[0] = bubCv(pre + 'L0', rw * q0, rh * q0);
      if (pic) L[0].g.drawImage(pic, R.x0 * pk, R.y0 * pk, rw * pk, rh * pk, 0, 0, L[0].width, L[0].height);
      else { L[0].g.fillStyle = '#1b1815'; L[0].g.fillRect(0, 0, L[0].width, L[0].height); }
      L[0].g.setTransform(q0, 0, 0, q0, -R.x0 * q0, -R.y0 * q0); bubGlows(L[0].g, o.glows); L[0].g.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 1; i <= BUB_LV; i++) { const p = L[i - 1]; L[i] = bubCv(pre + 'L' + i, p.width / 2, p.height / 2); L[i].g.drawImage(p, 0, 0, L[i].width, L[i].height); }

      // 2. back up the levels: the widest blur everywhere, then each lighter one where the blur is lighter than the next
      const Lc = bubClamp(Math.log2(Math.max(1, P.blur * BUB_BLUR * Math.min(sh.a, sh.b) * q0)), 0, BUB_LV);
      const M = bubMaskSet(sh, q0 / 4, pre, P, Lc, mini ? 7.3 : bubGL.t);
      let cur = L[BUB_LV];
      for (let i = BUB_LV - 1; i >= 0; i--) {
        const up = bubCv(pre + 'U' + i, L[i].width, L[i].height), t = bubCv(pre + 'T' + i, L[i].width, L[i].height);
        up.g.drawImage(cur, 0, 0, up.width, up.height);
        t.g.drawImage(L[i], 0, 0); t.g.globalCompositeOperation = 'destination-in'; bubMaskOn(t.g, t, M, 'l' + i, R, sh);
        up.g.drawImage(t, 0, 0);
        cur = up;
      }

      // 3. the glass: the light held, the tint, the sheen, the line of light
      let lum;
      if (o.under) lum = 0.2126 * o.under[0] + 0.7152 * o.under[1] + 0.0722 * o.under[2];
      else {
        const t = bubCv(pre + 'P', 1, 1); t.g.drawImage(L[BUB_LV], 0, 0, 1, 1);
        try { const d = t.g.getImageData(0, 0, 1, 1).data; lum = (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255; } catch (e) { lum = 0.1; }
      }
      const k = bubLook(o, lum, mini, P), g = cur.g, cw = cur.width, ch = cur.height, sx = cw / rw, sy = ch / rh;
      const tint = bubCv(pre + 'G', cw, ch);
      const layer = (id, fill, mode, a) => {
        if (!(a > 0.004)) return;
        bubMaskOn(tint.g, tint, M, id, R, sh); tint.g.globalCompositeOperation = 'source-in'; tint.g.fillStyle = fill; tint.g.fillRect(0, 0, cw, ch);
        g.globalCompositeOperation = mode; g.globalAlpha = a; g.drawImage(tint, 0, 0);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; tint.g.globalCompositeOperation = 'source-over'; tint.g.clearRect(0, 0, cw, ch);
      };
      layer('in', rgbCss(k.dk[0]), 'darken', k.dk[1]);
      layer('in', rgbCss(k.lt[0]), 'lighten', k.lt[1]);
      layer('in', rgbCss(k.tone), 'source-over', k.veil);
      const [lx, ly] = bubLightDir(o, sh), hl = bubCv(pre + 'H', cw, ch), h = hl.g;
      h.setTransform(sx, 0, 0, sy, -R.x0 * sx, -R.y0 * sy);
      h.translate(sh.cx + lx * sh.a * 0.42, sh.cy + ly * sh.b * 0.5); h.scale(1, sh.b / sh.a);
      h.fillStyle = rad(h, 0, 0, sh.a * 0.75, [[0, `rgba(255,252,246,${k.sheen})`], [1, 'rgba(255,252,246,0)']]);
      h.fillRect(-sh.a, -sh.a, sh.a * 2, sh.a * 2);
      h.setTransform(1, 0, 0, 1, 0, 0); h.globalCompositeOperation = 'destination-in'; bubMaskOn(h, hl, M, 'in', R, sh);
      g.drawImage(hl, 0, 0);
      // 4. its edge fades out, a light blur reaches past it (added: both are premultiplied), and the line of light
      g.globalCompositeOperation = 'destination-in'; bubMaskOn(g, cur, M, 'in', R, sh); g.globalCompositeOperation = 'source-over';
      if (P.halo > 0.004) {
        const hc = bubCv(pre + 'HL', cw, ch);
        hc.g.drawImage(L[Math.round(Math.min(Lc, Math.max(1, Lc * 0.6)))], 0, 0, cw, ch);
        hc.g.globalCompositeOperation = 'destination-in'; bubMaskOn(hc.g, hc, M, 'halo', R, sh);
        g.globalCompositeOperation = 'lighter'; g.drawImage(hc, 0, 0); g.globalCompositeOperation = 'source-over';
      }
      if (!P.portail) layer('rim', 'rgb(255,251,244)', 'source-over', P.rim * 0.5);
      else { // Portail's glow: added at night, a deeper violet laid over a bright scene
        const pk = bubPortalLook(P, mini ? 0 : bubMood.mix), cs = rgbCss(mixRGB(pk.glow, pk.line, 0.25).map((v) => v * 255));
        layer('rim', cs, pk.day > 0.5 ? 'source-over' : 'lighter', Math.min(1, pk.G * (pk.day > 0.5 ? 0.6 : 0.8)));
      }

      // 5. on the screen, in one draw
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.globalAlpha = P.op;
      c.drawImage(cur, R.x0, R.y0, rw, rh);
      c.restore();
      // 6. Portail's particles: on their own canvas on the screen, a few still ones on the previews
      if (!mini) bubSpk.place(o.spc, sh, W, H, P);
      else if (P.portail && P.spark > 0.004) {
        const k = bubClamp(Math.min(sh.a, sh.b) / 150, 0.3, 1), n = Math.round((90 + 410 * P.spark) * k);
        bubSpkPaint(c, bubSpkSeed(sh, P, n, k), n, sh, P, 7.3, 1.7, bubSpk.mini && bubSpk.mini.tint === P.tint ? bubSpk.mini : (bubSpk.mini = Object.assign(bubSpkSprites(0, P.tint), { tint: P.tint })), true);
      }
    },
  };
  /* support:bubble:end */

  SUPPORTS.book.kit = { bookVariants, bookTone, bookTile, bookPath, bookRibbon, bookSm, toneOf, mixRGB, rgbCss, hex3 };
  Object.assign(window.LISEUSE_SCENES, { SUPPORTS, SUPPORT_PRESET: PRESET });
})();
