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
