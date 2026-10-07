// Terrain kit (v0.5) — the pieces the lane islands are assembled from: a flagstone battlefield with organic edges,
// low ruined stone walls, iron lanterns, ruins (arches, columns, guardian statues), stone bridges, rift gates,
// and the per-faction decor that gives each lane its identity. Everything is procedural and merged by material.
import * as THREE from 'three';
import { Part, box, cyl, cone, oct, sph, tor, shade, mix } from './characters';
import type { FactionId } from '../data/types';

export const ST = { stone: 0x6c6e78, light: 0x8e9098, dark: 0x45474f, moss: 0x3a5628, iron: 0x2a2a31, gold: 0xd8a848, wood: 0x5a3e2a, pine: 0x2c5a3a, pineD: 0x1f4630 };
const IRON: [number, number] = [0.75, 0.48];
const GOLDP: [number, number] = [0.72, 0.32];
export type Rand = () => number;

const noise1 = (x: number, ph: number) => Math.sin(x * 0.55 + ph) * 0.28 + Math.sin(x * 1.7 + ph * 2.1) * 0.14 + Math.sin(x * 3.9 + ph * 0.7) * 0.06;

/** Battlefield top: flat where units fight (y = 0.2), edges sinking under the grass along a wobbly line. World-space UVs. */
export function pathGeometry(cx: number, z0: number, len: number, hw: number, ph: number, uvScale = 1 / 3): THREE.BufferGeometry {
  const W = hw * 2 + 2.4;
  const g = new THREE.PlaneGeometry(len, W, Math.ceil(len * 1.2), 26);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i);
    const edge = hw - 0.15 + noise1(x, ph + (z < 0 ? 0 : 2.3));
    const az = Math.abs(z);
    const y = az > edge ? 0.2 - (az - edge) * 0.55 : 0.2;
    pos.setY(i, y);
    uv.setXY(i, x * uvScale, (z + z0) * uvScale);
  }
  g.translate(cx, 0, z0);
  g.computeVertexNormals();
  return g;
}

/** World-space UVs for a box-like ground piece (top faces tile in x/z). */
export function worldUV(g: THREE.BufferGeometry, k: number) {
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i));
    if (ny > 0.5) uv.setXY(i, pos.getX(i) * k, pos.getZ(i) * k);
    else if (nx > 0.5) uv.setXY(i, pos.getZ(i) * k, pos.getY(i) * k);
    else uv.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
  }
  return g;
}

/** Low ruined wall of two courses of jittered blocks, with gaps, fallen stones and moss caps. */
export function stoneWall(out: Part[], x0: number, x1: number, z: number, r: Rand, h = 0.62, gaps = 0.2) {
  const sg = Math.sign(x1 - x0) || 1;
  let x = x0;
  while (sg > 0 ? x < x1 : x > x1) {
    const w = Math.min(0.9 + r() * 1.3, Math.abs(x1 - x) + 0.01);
    const cx = x + sg * w / 2;
    if (r() > gaps) {
      const hh = h * (0.65 + r() * 0.55);
      out.push({ g: box(w * 0.98, hh * 0.55, 0.5), c: mix(ST.stone, ST.dark, r() * 0.6), p: [cx, 0.1 + hh * 0.275, z], r: [0, (r() - 0.5) * 0.06, 0] });
      out.push({ g: box(w * 0.88, hh * 0.45, 0.42), c: mix(ST.stone, ST.light, r() * 0.7), p: [cx + (r() - 0.5) * 0.12, 0.1 + hh * 0.775, z + (r() - 0.5) * 0.05], r: [0, (r() - 0.5) * 0.1, (r() - 0.5) * 0.06] });
      if (r() < 0.45) out.push({ g: box(w * 0.8, 0.06, 0.46), c: shade(ST.moss, 0.9 + r() * 0.3), p: [cx, 0.1 + hh + 0.02, z] });
    } else if (r() < 0.7) {
      out.push({ g: box(0.42, 0.3, 0.36), c: mix(ST.stone, ST.dark, r()), p: [cx, 0.22, z + (r() - 0.5) * 0.7], r: [r() * 0.4, r() * 3, r() * 0.3] });
    }
    x += sg * w;
  }
}

/** Iron lantern post leaning its lantern toward the path (side = ±1 along z). */
export function lanternPost(out: Part[], glow: Part[], lights: THREE.Vector3[], x: number, z: number, side: number, h = 2.3, col = 0xffb45a) {
  out.push({ g: box(0.3, 0.22, 0.3), c: ST.dark, p: [x, 0.2, z] });
  out.push({ g: cyl(0.055, 0.08, h, 6), c: ST.iron, p: [x, 0.1 + h / 2, z], pbr: IRON });
  out.push({ g: box(0.05, 0.05, 0.6), c: ST.iron, p: [x, 0.1 + h - 0.04, z + side * 0.28], pbr: IRON });
  out.push({ g: tor(0.12, 0.02, Math.PI), c: ST.iron, p: [x, 0.1 + h - 0.16, z + side * 0.12], r: [0, Math.PI / 2, Math.PI], pbr: IRON });
  const lx = x, lz = z + side * 0.54, ly = 0.1 + h - 0.36;
  out.push({ g: cone(0.17, 0.17, 4), c: ST.iron, p: [lx, ly + 0.21, lz], r: [0, Math.PI / 4, 0], pbr: IRON });
  out.push({ g: box(0.2, 0.04, 0.2), c: ST.iron, p: [lx, ly - 0.15, lz], pbr: IRON });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push({ g: box(0.025, 0.28, 0.025), c: ST.iron, p: [lx + dx * 0.085, ly, lz + dz * 0.085], pbr: IRON });
  glow.push({ g: box(0.14, 0.24, 0.14), c: col, p: [lx, ly, lz] });
  lights.push(new THREE.Vector3(lx, ly, lz));
}

/** Ruined arch: two columns with bases/capitals and a voussoir half-circle (or a broken stump). */
export function ruinArch(out: Part[], glow: Part[], x: number, z: number, span: number, h: number, r: Rand, broken: boolean, rune: number) {
  const cw = 0.56;
  for (const s of [-1, 1]) {
    const cx = x + s * span / 2;
    const ch = broken && s > 0 ? h * (0.35 + r() * 0.3) : h;
    out.push({ g: box(cw + 0.22, 0.32, cw + 0.22), c: ST.dark, p: [cx, 0.26, z] });
    out.push({ g: box(cw, ch, cw), c: mix(ST.stone, ST.light, r() * 0.5), p: [cx, 0.42 + ch / 2, z] });
    for (let k = 1; k < ch / 0.55; k++) out.push({ g: box(cw + 0.03, 0.04, cw + 0.03), c: ST.dark, p: [cx, 0.42 + k * 0.55, z] });
    if (!(broken && s > 0)) out.push({ g: box(cw + 0.16, 0.2, cw + 0.16), c: ST.light, p: [cx, 0.42 + ch + 0.1, z] });
    else out.push({ g: oct(0.34), c: ST.stone, p: [cx + 0.5, 0.3, z + 0.4], r: [r(), r(), r()] });
    if (r() < 0.6) out.push({ g: box(0.05, ch * 0.6, cw + 0.06), c: shade(ST.moss, 0.8), p: [cx + s * (cw / 2 + 0.02), 0.42 + ch * 0.7, z] }); // ivy
  }
  if (!broken) {
    const R = span / 2, n = 11, y0 = 0.62 + h;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (i + 0.5) / n;
      out.push({ g: box(0.5, (Math.PI * R) / n * 1.04, cw), c: mix(ST.stone, ST.light, (i % 3) * 0.3), p: [x + Math.cos(a) * R, y0 + Math.sin(a) * R, z], r: [0, 0, a] });
    }
    out.push({ g: box(0.36, 0.5, cw + 0.08), c: ST.light, p: [x, y0 + R + 0.05, z] }); // keystone
    glow.push({ g: oct(0.1), c: rune, p: [x, y0 + R + 0.05, z + cw / 2 + 0.05], s: [1, 1.4, 0.4] });
  }
}

/** Broken column (drums + jagged top), sometimes with a fallen drum beside it. */
export function brokenColumn(out: Part[], x: number, z: number, h: number, r: Rand) {
  out.push({ g: box(0.8, 0.3, 0.8), c: ST.dark, p: [x, 0.25, z] });
  out.push({ g: cyl(0.3, 0.34, h, 10), c: mix(ST.stone, ST.light, r()), p: [x, 0.4 + h / 2, z] });
  out.push({ g: cone(0.31, 0.45, 10), c: ST.stone, p: [x, 0.4 + h + 0.12, z], r: [(r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9], s: [1, 0.6, 1] });
  if (r() < 0.5) out.push({ g: cyl(0.3, 0.3, 0.8, 10), c: ST.stone, p: [x + 0.8, 0.35, z + (r() - 0.5)], r: [0, r() * 3, Math.PI / 2] });
}

/** Hooded guardian statue leaning on a sword, on a plinth. */
export function statue(out: Part[], glow: Part[], x: number, z: number, s: number, faceZ: number, rune: number) {
  const c = 0x8a8c92, d = 0x5e6068;
  out.push({ g: box(1.1 * s, 0.5 * s, 1.1 * s), c: d, p: [x, 0.35 * s, z] }, { g: box(0.9 * s, 0.2 * s, 0.9 * s), c, p: [x, 0.7 * s, z] });
  out.push({ g: cone(0.5 * s, 1.7 * s, 8), c, p: [x, 1.65 * s, z] }); // robe
  out.push({ g: box(0.86 * s, 0.32 * s, 0.42 * s), c, p: [x, 2.3 * s, z] }); // shoulders
  out.push({ g: sph(0.27 * s, 1), c: d, p: [x, 2.65 * s, z + faceZ * 0.02 * s] }); // hood
  out.push({ g: cone(0.3 * s, 0.4 * s, 6), c, p: [x, 2.85 * s, z - faceZ * 0.05 * s], r: [-faceZ * 0.3, 0, 0] });
  out.push({ g: box(0.09 * s, 1.5 * s, 0.03 * s), c: 0x9aa0aa, p: [x, 1.35 * s, z + faceZ * 0.55 * s], pbr: [0.6, 0.4] }); // blade
  out.push({ g: box(0.5 * s, 0.07 * s, 0.07 * s), c: ST.gold, p: [x, 2.1 * s, z + faceZ * 0.55 * s], pbr: GOLDP }); // guard
  out.push({ g: box(0.5 * s, 0.16 * s, 0.2 * s), c, p: [x, 2.18 * s, z + faceZ * 0.42 * s] }); // hands
  glow.push({ g: oct(0.07 * s), c: rune, p: [x, 2.33 * s, z + faceZ * 0.55 * s] });
  glow.push({ g: box(0.18 * s, 0.03 * s, 0.02 * s), c: rune, p: [x, 2.62 * s, z + faceZ * 0.26 * s] }); // eyes under the hood
}

export function pine(out: Part[], x: number, y: number, z: number, h: number, r: Rand) {
  const tint = r() * 0.25;
  out.push({ g: cyl(0.1 * h, 0.16 * h, 0.8 * h, 6), c: 0x4a3426, p: [x, y + 0.4 * h, z] });
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.22;
    out.push({ g: cone(0.78 * h * k, 0.8 * h, 8), c: shade(i % 2 ? ST.pine : ST.pineD, 0.85 + tint + i * 0.07), p: [x, y + (0.85 + i * 0.5) * h, z], r: [0, r() * 3, 0] });
  }
}
export function rock(out: Part[], x: number, y: number, z: number, s: number, r: Rand) {
  out.push({ g: oct(0.5 * s), c: mix(ST.stone, ST.dark, r()), p: [x, y + 0.18 * s, z], s: [1.2, 0.7, 1], r: [r(), r() * 3, r()] });
  if (r() < 0.6) out.push({ g: oct(0.3 * s), c: mix(ST.dark, ST.stone, r()), p: [x + 0.4 * s, y + 0.1 * s, z + 0.2 * s], r: [r(), r() * 3, r()] });
  if (r() < 0.5) out.push({ g: box(0.5 * s, 0.05, 0.4 * s), c: ST.moss, p: [x, y + 0.42 * s, z], r: [r() * 0.4, r() * 3, 0] });
}
export function bush(out: Part[], x: number, y: number, z: number, s: number, r: Rand) {
  out.push({ g: sph(0.4 * s, 1), c: shade(0x34602a, 0.85 + r() * 0.3), p: [x, y + 0.25 * s, z], s: [1.2, 0.8, 1] });
  out.push({ g: sph(0.28 * s, 1), c: shade(0x467a30, 0.85 + r() * 0.3), p: [x + 0.3 * s, y + 0.3 * s, z + 0.1 * s] });
}
/** Grass tufts (3 blades) — scattered along the path border to soften it. */
export function tuft(out: Part[], x: number, y: number, z: number, s: number, r: Rand) {
  const c = r() < 0.3 ? 0x6a8a3a : 0x3e6a2c;
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    out.push({ g: cone(0.05 * s, 0.4 * s, 3), c: shade(c, 0.8 + r() * 0.4), p: [x + Math.cos(a) * 0.06, y + 0.18 * s, z + Math.sin(a) * 0.06], r: [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35] });
  }
}
/** Gnarled dead tree with roots. */
export function deadTree(out: Part[], x: number, z: number, h: number, r: Rand, c = 0x3a3028) {
  out.push({ g: cyl(0.12 * h, 0.22 * h, 1.4 * h, 6), c, p: [x, 0.1 + 0.7 * h, z], r: [(r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2] });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + r(); out.push({ g: cyl(0.04 * h, 0.12 * h, 0.9 * h, 5), c, p: [x + Math.cos(a) * 0.35 * h, 0.15, z + Math.sin(a) * 0.35 * h], r: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25] }); }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + r(); out.push({ g: cyl(0.03 * h, 0.07 * h, 0.9 * h, 5), c, p: [x + Math.cos(a) * 0.3 * h, 0.1 + 1.5 * h, z + Math.sin(a) * 0.3 * h], r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] }); }
}

/** Stone bridge (deck + parapets with balusters + brazier pillars at both ends). Deck top = 0.2. */
export function stoneBridge(out: Part[], torches: THREE.Vector3[], gx: number, z0: number, blen: number, bw: number) {
  out.push({ g: box(blen, 0.5, bw), c: ST.stone, p: [gx, -0.05, z0] });
  out.push({ g: box(blen + 0.1, 0.12, bw + 0.3), c: ST.light, p: [gx, -0.36, z0] });
  // arch under the deck (two half rings, front and back faces)
  for (const ez of [-1, 1]) out.push({ g: new THREE.TorusGeometry(blen / 2 - 0.1, 0.32, 5, 12, Math.PI), c: ST.dark, p: [gx, -0.32, z0 + ez * (bw / 2 - 0.3)], r: [Math.PI, 0, 0] });
  out.push({ g: box(0.8, 3, bw - 0.4), c: ST.dark, p: [gx, -2.2, z0] });
  for (const ez of [-1, 1]) {
    const z = z0 + ez * (bw / 2 - 0.15);
    out.push({ g: box(blen, 0.12, 0.34), c: ST.light, p: [gx, 0.88, z] });
    out.push({ g: box(blen, 0.12, 0.3), c: ST.dark, p: [gx, 0.24, z] });
    for (let i = 0; i < Math.floor(blen / 0.4); i++) out.push({ g: cyl(0.06, 0.08, 0.5, 6), c: ST.stone, p: [gx - blen / 2 + 0.25 + i * 0.4, 0.55, z] });
    for (const ex of [-1, 1]) {
      const tx = gx + ex * (blen / 2), tz = z;
      out.push({ g: box(0.5, 1.3, 0.5), c: ST.stone, p: [tx, 0.6, tz] }, { g: box(0.6, 0.1, 0.6), c: ST.light, p: [tx, 1.3, tz] });
      out.push({ g: cyl(0.22, 0.12, 0.24, 8), c: ST.iron, p: [tx, 1.47, tz], pbr: IRON });
      torches.push(new THREE.Vector3(tx, 1.68, tz));
    }
  }
}

/** Faction accents: colours used by the lane decor, ambient particles and lights. */
export const FACTION_LOOK: Record<FactionId, { main: number; second: number; glow: number; particle: number; motion: 'rise' | 'drift' | 'float' | 'bubble' | 'ember' | 'soul' }> = {
  astreens: { main: 0xcfe2ff, second: 0x8aa8d8, glow: 0x3ab8ff, particle: 0xbff0ff, motion: 'float' },
  rouages: { main: 0xb07a3a, second: 0x6a5a4a, glow: 0xff9a3a, particle: 0xffb060, motion: 'rise' },
  ronces: { main: 0x4a3a26, second: 0x3a6a2c, glow: 0x7dffa0, particle: 0xa0ff9a, motion: 'drift' },
  abysses: { main: 0x2a6a7a, second: 0x6a3a8a, glow: 0x3affe0, particle: 0x9af6ff, motion: 'bubble' },
  solaires: { main: 0x2a2228, second: 0x8a3a1a, glow: 0xff6a1a, particle: 0xffa040, motion: 'ember' },
  necrose: { main: 0xd8d0c0, second: 0x3a2e44, glow: 0x9aff6a, particle: 0xb0ff9a, motion: 'soul' },
};

/**
 * Lane decor for one faction on one lane (sg = ±1 side, z0 = arena centre). Placed on the ledges and the far side
 * so the battlefield stays clear. Returns lit parts + emissive parts + points where an ambient glow should sit.
 */
export function factionDecor(f: FactionId, sg: number, z0: number, x0: number, x1: number, pathHW: number, isleHW: number, r: Rand) {
  const parts: Part[] = [], glow: Part[] = [], glowPts: THREE.Vector3[] = [];
  const L = FACTION_LOOK[f];
  const far = (k = 0) => z0 - (pathHW + 1.3 + k * (isleHW - pathHW - 1.6));
  const near = (k = 0) => z0 + (pathHW + 1.1 + k * (isleHW - pathHW - 1.5));
  const xs: number[] = [];
  for (let x = x0 + 3; x < x1 - 3; x += 4.5 + r() * 3) xs.push(sg * x);
  xs.forEach((x, i) => {
    const zf = far(r()), zn = near(r() * 0.6), big = i % 2 === 0;
    switch (f) {
      case 'astreens': {
        // crystal spires + silver obelisks with a star sigil
        const n = big ? 4 : 2;
        for (let k = 0; k < n; k++) glow.push({ g: oct(0.22 + r() * 0.2), c: k % 2 ? L.glow : 0x9ad8ff, p: [x + (r() - 0.5) * 1.2, 0.6 + r() * 0.5, zf + (r() - 0.5) * 0.8], s: [0.55, 2.4 + r() * 1.8, 0.55], r: [(r() - 0.5) * 0.4, r() * 3, (r() - 0.5) * 0.4] });
        if (big) { parts.push({ g: box(0.5, 2.6, 0.5), c: L.main, p: [x + 1.6, 1.5, zf], pbr: [0.6, 0.3] }, { g: cone(0.36, 0.6, 4), c: L.main, p: [x + 1.6, 3.1, zf], r: [0, Math.PI / 4, 0], pbr: [0.6, 0.3] }); glow.push({ g: oct(0.14), c: L.glow, p: [x + 1.6, 2.2, zf + 0.27], s: [1, 1, 0.3] }); }
        glow.push({ g: oct(0.12), c: L.glow, p: [x, 0.3, zn], s: [0.6, 1.8, 0.6] });
        glowPts.push(new THREE.Vector3(x, 1.4, zf));
        break;
      }
      case 'rouages': {
        // half-buried brass gears, copper pipes, a steam vent
        const R = big ? 1.1 : 0.7;
        parts.push({ g: new THREE.TorusGeometry(R, 0.16, 5, 18), c: L.main, p: [x, R * 0.55, zf], r: [0, (r() - 0.5) * 0.6, 0], pbr: [0.85, 0.35] });
        for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; parts.push({ g: box(0.22, 0.26, 0.3), c: L.main, p: [x + Math.cos(a) * (R + 0.16), R * 0.55 + Math.sin(a) * (R + 0.16), zf], r: [0, 0, a], pbr: [0.85, 0.35] }); }
        parts.push({ g: cyl(0.2, 0.2, 0.36, 8), c: 0x4a4a52, p: [x, R * 0.55, zf], r: [Math.PI / 2, 0, 0], pbr: IRON });
        parts.push({ g: cyl(0.12, 0.12, 3.6, 8), c: 0xb8683a, p: [x + 2, 0.32, zn + 0.3], r: [0, 0, Math.PI / 2], pbr: [0.8, 0.35] });
        parts.push({ g: cyl(0.16, 0.16, 0.14, 8), c: 0x8a5a2a, p: [x + 0.4, 0.32, zn + 0.3], r: [0, 0, Math.PI / 2], pbr: [0.8, 0.35] });
        if (big) { parts.push({ g: cyl(0.22, 0.3, 0.9, 8), c: 0x4a4a52, p: [x - 1.4, 0.55, zf + 0.6], pbr: IRON }); glow.push({ g: cyl(0.16, 0.16, 0.04, 8), c: L.glow, p: [x - 1.4, 1.02, zf + 0.6] }); glowPts.push(new THREE.Vector3(x - 1.4, 1.2, zf + 0.6)); }
        break;
      }
      case 'ronces': {
        // giant roots arching out of the ground + jade spore pods
        const h = big ? 2.4 : 1.5;
        for (let k = 0; k < 5; k++) { const a = Math.PI * (k + 0.5) / 5; parts.push({ g: cyl(0.16, 0.22, h * 0.75, 6), c: shade(L.main, 0.8 + r() * 0.3), p: [x + Math.cos(a) * h, 0.1 + Math.sin(a) * h * 0.8, zf], r: [0, 0, a], s: [1, 1, 1] }); }
        parts.push({ g: cone(0.5, 0.6, 6), c: L.main, p: [x - h, 0.25, zf] }, { g: cone(0.5, 0.6, 6), c: L.main, p: [x + h, 0.25, zf] });
        for (let k = 0; k < 4; k++) parts.push({ g: cone(0.06, 0.3, 4), c: 0x2e2418, p: [x + (r() - 0.5) * h * 2, 0.6 + r() * h * 0.6, zf + 0.15], r: [Math.PI / 2, 0, 0] });
        for (let k = 0; k < (big ? 3 : 2); k++) glow.push({ g: sph(0.13 + r() * 0.08, 1), c: L.glow, p: [x + (r() - 0.5) * 2, 0.3 + r() * 0.3, zn], s: [1, 1.3, 1] });
        parts.push({ g: sph(0.5, 1), c: L.second, p: [x + 1.2, 0.3, zn - 0.2], s: [1.4, 0.6, 1] });
        glowPts.push(new THREE.Vector3(x, 0.8, zn));
        break;
      }
      case 'abysses': {
        // coral fans + a glowing tide pool + shells
        for (let k = 0; k < (big ? 6 : 4); k++) { const a = r() * 6; parts.push({ g: cone(0.12, 1.1 + r() * 1.2, 5), c: k % 2 ? L.main : L.second, p: [x + Math.cos(a) * 0.5, 0.7, zf + Math.sin(a) * 0.5], r: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5] }); }
        glow.push({ g: cyl(0.9, 0.9, 0.03, 12), c: mix(L.glow, 0x062026, 0.6), p: [x + 2, 0.13, zn], s: [1.3, 1, 0.8] }); // dim: a large flat glow blooms a lot
        parts.push({ g: cyl(1.05, 1.1, 0.12, 12), c: 0x1a2a34, p: [x + 2, 0.08, zn], s: [1.3, 1, 0.8] });
        glow.push({ g: oct(0.1), c: 0xc08aff, p: [x + (r() - 0.5), 1.6, zf] }, { g: oct(0.08), c: L.glow, p: [x + 0.6, 1.2, zf + 0.3] });
        parts.push({ g: sph(0.2, 1), c: 0xe8c8b0, p: [x - 0.8, 0.22, zn + 0.3], s: [1, 0.5, 1.2] });
        glowPts.push(new THREE.Vector3(x + 2, 0.5, zn));
        break;
      }
      case 'solaires': {
        // obsidian shards, lava cracks, a fire brazier
        for (let k = 0; k < (big ? 4 : 2); k++) parts.push({ g: oct(0.5 + r() * 0.4), c: shade(L.main, 0.8 + r() * 0.4), p: [x + (r() - 0.5) * 2, 0.5, zf + (r() - 0.5) * 0.8], s: [0.6, 1.6 + r(), 0.6], r: [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5], pbr: [0.2, 0.25] });
        for (let k = 0; k < 3; k++) glow.push({ g: box(1.4 + r(), 0.02, 0.07), c: L.glow, p: [x + (r() - 0.5) * 2, 0.13, zn + (r() - 0.5) * 0.6], r: [0, r() * 3, 0] });
        if (big) { parts.push({ g: cyl(0.4, 0.25, 0.5, 8), c: 0x2a2228, p: [x + 1.8, 0.95, zf], pbr: IRON }, { g: box(0.3, 0.7, 0.3), c: 0x3a2e2a, p: [x + 1.8, 0.45, zf] }); glow.push({ g: cone(0.3, 0.7, 6), c: 0xffa040, p: [x + 1.8, 1.5, zf] }); glowPts.push(new THREE.Vector3(x + 1.8, 1.6, zf)); }
        glowPts.push(new THREE.Vector3(x, 0.4, zn));
        break;
      }
      case 'necrose': {
        // gothic gravestones, bone piles, a spectral candle
        for (let k = 0; k < (big ? 3 : 2); k++) { const gx = x + (k - 1) * 0.9; parts.push({ g: box(0.5, 0.8 + r() * 0.4, 0.14), c: shade(0x5a5260, 0.8 + r() * 0.3), p: [gx, 0.5, zf], r: [(r() - 0.5) * 0.25, (r() - 0.5) * 0.4, (r() - 0.5) * 0.2] }, { g: cone(0.25, 0.3, 4), c: 0x5a5260, p: [gx, 1.05, zf], r: [0, Math.PI / 4, 0] }); }
        for (let k = 0; k < 5; k++) parts.push({ g: box(0.4, 0.06, 0.06), c: L.main, p: [x + 1.6 + (r() - 0.5) * 0.6, 0.18 + k * 0.03, zn + (r() - 0.5) * 0.4], r: [0, r() * 3, 0] });
        parts.push({ g: sph(0.13, 1), c: L.main, p: [x + 1.6, 0.3, zn] });
        if (big) { parts.push({ g: box(0.06, 2.4, 0.06), c: ST.iron, p: [x - 1.5, 1.3, zf], pbr: IRON }, { g: cone(0.3, 0.5, 4), c: ST.iron, p: [x - 1.5, 2.6, zf], pbr: IRON }); glow.push({ g: sph(0.12, 1), c: L.glow, p: [x - 1.5, 2.2, zf] }); }
        glow.push({ g: cyl(0.04, 0.04, 0.2, 5), c: L.glow, p: [x + 1.2, 0.3, zn + 0.4] });
        glowPts.push(new THREE.Vector3(x, 1.0, zf));
        break;
      }
    }
  });
  return { parts, glow, glowPts };
}
