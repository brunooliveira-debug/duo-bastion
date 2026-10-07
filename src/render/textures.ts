// Procedural canvas textures (no image files): cobblestones, waterfall streaks, clouds, soft glow.
import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function rng(seed: number) {
  let s = seed;
  return () => { let t = (s = (s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** Warm cobblestones in irregular rows (tileable horizontally and vertically). */
export function cobbleTexture() {
  return cached('cobble', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const r = rng(7);
    g.fillStyle = '#5a4634';
    g.fillRect(0, 0, S, S);
    const rows = 8, rh = S / rows;
    for (let y = 0; y < rows; y++) {
      let x = y % 2 ? -rh * 0.5 : 0;
      while (x < S) {
        const w = rh * (0.9 + r() * 0.7);
        const shade = 0.82 + r() * 0.3;
        const base = [155 * shade, 122 * shade, 84 * shade].map(v => Math.min(255, v | 0));
        for (const ox of [0, S, -S]) {
          const px = x + ox + 2, py = y * rh + 2, pw = w - 4, ph = rh - 4;
          g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
          g.beginPath();
          rr(g, px, py, pw, ph, 7);
          g.fill();
          g.fillStyle = 'rgba(255,235,200,0.16)';
          g.beginPath(); rr(g, px + 2, py + 2, pw - 6, ph * 0.35, 5); g.fill();
          g.fillStyle = 'rgba(40,24,10,0.18)';
          g.beginPath(); rr(g, px + 2, py + ph * 0.7, pw - 4, ph * 0.28, 5); g.fill();
        }
        x += w;
      }
    }
    // a few moss specks in the joints
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${90 + r() * 30},${120 + r() * 30},60,0.55)`;
      g.beginPath(); g.arc(r() * S, (Math.floor(r() * rows) * rh) | 0, 1.5 + r() * 2.5, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Vertical bright streaks, scrolled every frame to animate waterfalls. */
export function waterfallTexture() {
  return cached('falls', () => {
    const { c, g } = canvas(64, 256);
    const r = rng(11);
    g.clearRect(0, 0, 64, 256);
    for (let i = 0; i < 40; i++) {
      const x = r() * 64, w = 2 + r() * 6, y = r() * 256, h = 40 + r() * 120;
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(230,248,255,0)');
      grad.addColorStop(0.5, `rgba(230,248,255,${0.5 + r() * 0.4})`);
      grad.addColorStop(1, 'rgba(230,248,255,0)');
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      g.fillRect(x, y - 256, w, h);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Soft cloud puffs on transparent background (tileable). */
export function cloudTexture() {
  return cached('clouds', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const r = rng(23);
    for (let i = 0; i < 46; i++) {
      const x = r() * S, y = r() * S, rad = 18 + r() * 46;
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grad.addColorStop(0, 'rgba(255,240,250,0.55)');
        grad.addColorStop(1, 'rgba(255,240,250,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** White radial glow; tint with material color. */
export function glowTexture() {
  return cached('glow', () => {
    const { c, g } = canvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  });
}

/** Swirl for portal interiors. */
export function swirlTexture() {
  return cached('swirl', () => {
    const S = 128;
    const { c, g } = canvas(S, S);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,220,255,1)');
    grad.addColorStop(0.35, 'rgba(176,74,255,0.9)');
    grad.addColorStop(1, 'rgba(40,0,70,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,230,255,0.55)';
    g.lineWidth = 3;
    for (let a = 0; a < 4; a++) {
      g.beginPath();
      for (let i = 0; i < 60; i++) {
        const t = i / 60, ang = a * Math.PI / 2 + t * 5, rad = t * 60;
        const x = 64 + Math.cos(ang) * rad, y = 64 + Math.sin(ang) * rad;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    return new THREE.CanvasTexture(c);
  });
}

/** roundRect with a fallback for older Safari. */
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Soft, slightly lumpy puff for smoke and dust (tinted by the particle colour). */
export function smokeTexture() {
  return cached('smoke', () => {
    const S = 64;
    const { c, g } = canvas(S, S);
    const r = rng(11);
    for (let i = 0; i < 9; i++) {
      const x = 20 + r() * 24, y = 20 + r() * 24, rad = 10 + r() * 14;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    }
    return new THREE.CanvasTexture(c);
  });
}

/** Four-point star sparkle (flashes, crits, stun stars). */
export function starTexture() {
  return cached('star', () => {
    const S = 64;
    const { c, g } = canvas(S, S);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rad = i % 2 ? 7 : 31;
      g.lineTo(32 + Math.cos(a) * rad, 32 + Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    return new THREE.CanvasTexture(c);
  });
}

/** Warm packed-dirt path with pebbles and cracks (tileable). */
export function dirtTexture() {
  return cached('dirt', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const r = rng(23);
    g.fillStyle = '#c99a62';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = r() * S, y = r() * S, rad = 6 + r() * 26, k = r();
      g.fillStyle = k < 0.5 ? `rgba(226,180,120,${0.18 + r() * 0.2})` : `rgba(150,105,62,${0.12 + r() * 0.16})`;
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { g.beginPath(); g.ellipse(x + ox, y + oy, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill(); }
    }
    // flat stones
    for (let i = 0; i < 12; i++) {
      const x = r() * S, y = r() * S, w = 14 + r() * 22, h = 10 + r() * 14;
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) {
        g.fillStyle = `rgba(${200 + r() * 30 | 0},${160 + r() * 25 | 0},${110 + r() * 20 | 0},0.3)`;
        g.beginPath(); rr(g, x + ox, y + oy, w, h, 6); g.fill();
        g.strokeStyle = 'rgba(110,72,40,0.18)'; g.lineWidth = 1.2; g.stroke();
      }
    }
    // pebbles
    for (let i = 0; i < 90; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(120,110,105,0.7)' : 'rgba(240,225,200,0.6)';
      g.beginPath(); g.arc(r() * S, r() * S, 1 + r() * 2.2, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Saturated stylised grass (tileable). */
export function grassTexture() {
  return cached('grass', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const r = rng(31);
    g.fillStyle = '#5f9a32';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 160; i++) {
      const x = r() * S, y = r() * S, rad = 10 + r() * 30;
      g.fillStyle = r() < 0.5 ? `rgba(120,180,60,${0.2 + r() * 0.2})` : `rgba(60,110,30,${0.15 + r() * 0.2})`;
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill(); }
    }
    for (let i = 0; i < 900; i++) {
      const x = r() * S, y = r() * S, h = 3 + r() * 6;
      g.strokeStyle = r() < 0.5 ? 'rgba(160,215,90,0.55)' : 'rgba(50,95,25,0.5)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - h); g.stroke();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = ['#ffe36a', '#ffffff', '#ff8ab0', '#9ad8ff'][Math.floor(r() * 4)];
      g.beginPath(); g.arc(r() * S, r() * S, 1.6, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

// ---------------------------------------------------------------- v0.5 cinematic textures

/** Height canvas → tangent-space normal map (Sobel). */
function normalFromHeight(h: Uint8ClampedArray, S: number, strength: number) {
  const { c, g } = canvas(S, S);
  const img = g.createImageData(S, S);
  const H = (x: number, y: number) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Worn flagstones (irregular slabs, dark mortar, moss, cracks) + matching normal map: the battlefield path.
 * tint: base stone colour (cold grey-blue by default).
 */
export function flagstoneTextures(key = 'flag', base: [number, number, number] = [104, 106, 116], moss = 0.5) {
  const map = cached(key + ':map', () => buildFlag(key, base, moss).map);
  const normal = cached(key + ':nrm', () => buildFlag(key, base, moss).normal);
  return { map, normal };
}
const flagCache = new Map<string, { map: THREE.Texture; normal: THREE.Texture }>();
function buildFlag(key: string, base: [number, number, number], moss: number) {
  const hit = flagCache.get(key);
  if (hit) return hit;
  const S = 512;
  const col = canvas(S, S), hgt = canvas(S, S);
  const r = rng(key.length * 977 + 13);
  const g = col.g, hg = hgt.g;
  g.fillStyle = 'rgb(28,26,30)'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  const rows = 6, rh = S / rows;
  for (let y = 0; y < rows; y++) {
    let x = (y % 2 ? -0.5 : 0) * rh * 0.8 + r() * 20;
    while (x < S + rh) {
      const w = rh * (0.75 + r() * 0.85);
      const k = 0.78 + r() * 0.34;
      const warm = r() * 12;
      const cr = Math.min(255, base[0] * k + warm), cg = Math.min(255, base[1] * k + warm * 0.5), cb = Math.min(255, base[2] * k);
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) {
        const px = x + ox + 3, py = y * rh + oy + 3, pw = w - 6, ph = rh - 6;
        // slab with jittered corners
        const j = () => (r() - 0.5) * 7;
        const poly = [[px + j(), py + j()], [px + pw + j(), py + j()], [px + pw + j(), py + ph + j()], [px + j(), py + ph + j()]];
        g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        g.beginPath(); poly.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill();
        // bevel light / shadow
        g.strokeStyle = 'rgba(255,240,220,0.10)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(poly[0][0], poly[0][1]); g.lineTo(poly[1][0], poly[1][1]); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.moveTo(poly[2][0], poly[2][1]); g.lineTo(poly[3][0], poly[3][1]); g.stroke();
        // height: raised slab with soft bevel
        const grad = hg.createLinearGradient(px, py, px, py + ph);
        grad.addColorStop(0, '#9a9a9a'); grad.addColorStop(0.12, '#e6e6e6'); grad.addColorStop(0.88, '#d0d0d0'); grad.addColorStop(1, '#7a7a7a');
        hg.fillStyle = grad;
        hg.beginPath(); poly.forEach(([a, b], i) => (i ? hg.lineTo(a, b) : hg.moveTo(a, b))); hg.closePath(); hg.fill();
      }
      // stone grain and wear
      for (let i = 0; i < 26; i++) {
        const gx = x + r() * w, gy = y * rh + r() * rh;
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
        g.beginPath(); g.arc(gx, gy, 1 + r() * 4, 0, Math.PI * 2); g.fill();
      }
      // a crack sometimes
      if (r() < 0.35) {
        let cx = x + w * (0.2 + r() * 0.6), cy = y * rh + 6;
        g.strokeStyle = 'rgba(10,10,14,0.7)'; hg.strokeStyle = '#303030'; g.lineWidth = hg.lineWidth = 1.6;
        g.beginPath(); hg.beginPath(); g.moveTo(cx, cy); hg.moveTo(cx, cy);
        for (let k2 = 0; k2 < 6; k2++) { cx += (r() - 0.5) * 18; cy += rh / 7; g.lineTo(cx, cy); hg.lineTo(cx, cy); }
        g.stroke(); hg.stroke();
      }
      x += w;
    }
  }
  // moss in the joints and on the edges of slabs
  for (let i = 0; i < 900 * moss; i++) {
    const mx = r() * S, my = (Math.floor(r() * rows) * rh + (r() - 0.5) * 10 + S) % S;
    g.fillStyle = `rgba(${60 + r() * 30},${92 + r() * 40},${44 + r() * 20},${0.35 + r() * 0.35})`;
    g.beginPath(); g.arc(mx, my, 1.2 + r() * 3.2, 0, Math.PI * 2); g.fill();
  }
  // dirt / soot variation
  for (let i = 0; i < 40; i++) {
    const dx = r() * S, dy = r() * S, rad = 20 + r() * 60;
    const gr = g.createRadialGradient(dx, dy, 0, dx, dy, rad);
    gr.addColorStop(0, `rgba(${r() < 0.5 ? '40,30,24' : '70,60,52'},0.22)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(dx - rad, dy - rad, rad * 2, rad * 2);
  }
  const map = new THREE.CanvasTexture(col.c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const normal = normalFromHeight(hg.getImageData(0, 0, S, S).data, S, 2.2);
  const out = { map, normal };
  flagCache.set(key, out);
  return out;
}

/** Dark, rich ground cover (moss, grass, leaves) — the ledges beyond the path. */
export function mossTexture() {
  return cached('moss', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const r = rng(53);
    g.fillStyle = '#2c4a26'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 220; i++) {
      const x = r() * S, y = r() * S, rad = 8 + r() * 26;
      g.fillStyle = r() < 0.5 ? `rgba(70,120,50,${0.18 + r() * 0.2})` : `rgba(20,40,22,${0.2 + r() * 0.25})`;
      for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill(); }
    }
    for (let i = 0; i < 1400; i++) {
      const x = r() * S, y = r() * S, hh = 2 + r() * 5;
      g.strokeStyle = r() < 0.4 ? 'rgba(110,160,70,0.5)' : 'rgba(18,36,18,0.5)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - hh); g.stroke();
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${120 + r() * 60},${70 + r() * 40},30,0.5)`; g.beginPath(); g.arc(r() * S, r() * S, 1.5 + r() * 2, 0, Math.PI * 2); g.fill(); } // fallen leaves
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  });
}

/** Glowing rune circle (additive): concentric rings, glyphs, ticks. White, tinted by the material colour. */
export function runeCircleTexture() {
  return cached('runecircle', () => {
    const S = 512;
    const { c, g } = canvas(S, S);
    const r = rng(77);
    const C = S / 2;
    g.translate(C, C);
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.fillStyle = 'rgba(255,255,255,0.95)';
    const ring = (rad: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke(); };
    ring(C * 0.96, 5); ring(C * 0.9, 2); ring(C * 0.66, 4); ring(C * 0.6, 1.5); ring(C * 0.3, 3);
    // glyph band
    g.font = `bold ${Math.round(S * 0.05)}px serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.save(); g.rotate(a); g.translate(0, -C * 0.78); g.fillText(glyphs[Math.floor(r() * glyphs.length)], 0, 0); g.restore();
    }
    // ticks + star polygon
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; g.lineWidth = i % 6 ? 1 : 3; g.beginPath(); g.moveTo(Math.cos(a) * C * 0.6, Math.sin(a) * C * 0.6); g.lineTo(Math.cos(a) * C * (i % 6 ? 0.56 : 0.5), Math.sin(a) * C * (i % 6 ? 0.56 : 0.5)); g.stroke(); }
    g.lineWidth = 2.5;
    for (const n of [6, 3]) { g.beginPath(); for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; const px = Math.cos(a) * C * 0.6, py = Math.sin(a) * C * 0.6; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Spiral vortex (rifts): dark core, bright arms. Additive, rotated in the scene. */
export function vortexTexture() {
  return cached('vortex', () => {
    const S = 256;
    const { c, g } = canvas(S, S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
      const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const arms = 0.5 + 0.5 * Math.sin(a * 3 + d * 11);
      const edge = Math.max(0, 1 - d);
      const core = Math.max(0, 1 - d * 3.2);
      const v = Math.min(1, arms * edge * 1.4 * (0.35 + d) + core * 0.2);
      const i = (y * S + x) * 4;
      img.data[i] = 255 * v; img.data[i + 1] = 255 * v; img.data[i + 2] = 255 * v; img.data[i + 3] = 255 * Math.min(1, edge * 1.6);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Vertical soft gradient (light shafts, energy pillars): bright core, fading up. */
export function shaftTexture() {
  return cached('shaft', () => {
    const W = 64, H = 256;
    const { c, g } = canvas(W, H);
    const gx = g.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gx; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-in';
    const gy = g.createLinearGradient(0, 0, 0, H);
    gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.6, 'rgba(0,0,0,0.7)'); gy.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gy; g.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
