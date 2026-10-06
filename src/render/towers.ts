// Procedural 3D towers (archer, cannon, mage crystal, ice, fire, poison, shrine, lightning spire, necro).
// Built from stone-block courses, wooden decks, tiled cone roofs, gold trims and crystals, in the faction palette.
// Every level changes the ARCHITECTURE (not just the scale): ★ wood & stone, ★★ windows + banners,
// ★★★ corner turret with roof, ★★★★ branch colours + second turret / weapon change, ★★★★★ gold & crystals.
// Rendered through the same instanced Batcher as the characters.
import * as THREE from 'three';
import type { Branch, FactionId, TowerStyle } from '../data/types';
import { Batcher, Part, Piece, V3, box, cone, cyl, mergeParts, mix, oct, shade, sph, tor } from './characters';

interface Pal { stone: number; stoneD: number; trim: number; roof: number; banner: number; glow: number; wood: number }
export const TOWER_PAL: Record<FactionId, Pal> = {
  astreens: { stone: 0x9aa0b8, stoneD: 0x6a7088, trim: 0xe8c050, roof: 0x3a5ad8, banner: 0x3a5ad8, glow: 0x9fd8ff, wood: 0x8a5a32 },
  rouages: { stone: 0x9a8a78, stoneD: 0x6a5a4a, trim: 0xe0902a, roof: 0xc8402a, banner: 0xc8402a, glow: 0xffc070, wood: 0x7a4a2a },
  ronces: { stone: 0x8a9478, stoneD: 0x5a6a4a, trim: 0x9a7a3a, roof: 0x4a8a3a, banner: 0x4a9a3a, glow: 0xb4ff6a, wood: 0x6a4a28 },
  abysses: { stone: 0x7a98a0, stoneD: 0x4a6a74, trim: 0xd8a08a, roof: 0x2a9aa0, banner: 0x2a8aa0, glow: 0x7ff6ff, wood: 0x6a5a48 },
  solaires: { stone: 0xc0a888, stoneD: 0x8a7458, trim: 0xf0c040, roof: 0xd8502a, banner: 0xd8402a, glow: 0xffd36a, wood: 0x8a5a32 },
  necrose: { stone: 0x5a5468, stoneD: 0x3a3448, trim: 0xd8d0c0, roof: 0x6a3a9a, banner: 0x6a2a8a, glow: 0xc48bff, wood: 0x4a3a3a },
};
const GOLD = 0xe8c050, DARKW = 0x2a1e18, IRON = 0x2e2e36;

function rnd(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** A course of stone blocks around a circle (masonry look with per-block shade). */
function course(out: Part[], r: number, y: number, h: number, n: number, c: number, rand: () => number, off = 0) {
  for (let i = 0; i < n; i++) {
    const a = ((i + off) / n) * Math.PI * 2;
    const w = (2 * Math.PI * r) / n * 0.94;
    out.push({ g: box(w, h * 0.92, 0.2), c: shade(c, 0.82 + rand() * 0.32), p: [Math.cos(a) * r, y + h / 2, Math.sin(a) * r], r: [0, -a + Math.PI / 2, 0] });
  }
}
function roof(out: Part[], y: number, r: number, h: number, c: number, trim: number, glowTip = false) {
  out.push({ g: cone(r, h, 8), c, p: [0, y + h / 2, 0] });
  out.push({ g: cone(r * 0.82, h * 0.82, 8), c: shade(c, 0.82), p: [0, y + h * 0.36, 0], r: [0, Math.PI / 8, 0] }); // tile layer
  out.push({ g: tor(r * 0.98, 0.03, 2 * Math.PI), c: trim, p: [0, y + 0.02, 0], r: [Math.PI / 2, 0, 0] });
  out.push({ g: sph(0.05, 0), c: trim, p: [0, y + h + 0.02, 0], glow: glowTip });
}
function flagParts(out: Part[], x: number, y: number, z: number, c: number) {
  out.push({ g: cyl(0.012, 0.012, 0.4, 4), c: IRON, p: [x, y + 0.2, z] });
  out.push({ g: box(0.02, 0.12, 0.2), c, p: [x, y + 0.34, z + 0.1] });
}
function turretAt(out: Part[], x: number, z: number, y0: number, h: number, P: Pal, roofC: number, level: number, rand: () => number) {
  for (let i = 0, y = y0; y < y0 + h; i++, y += 0.16) {
    for (let k = 0; k < 6; k++) {
      const a = ((k + i * 0.5) / 6) * Math.PI * 2;
      out.push({ g: box(0.11, 0.15, 0.08), c: shade(P.stone, 0.82 + rand() * 0.3), p: [x + Math.cos(a) * 0.12, y + 0.08, z + Math.sin(a) * 0.12], r: [0, -a + Math.PI / 2, 0] });
    }
  }
  out.push({ g: box(0.05, 0.08, 0.02), c: 0xffd890, p: [x, y0 + h * 0.6, z + 0.15], glow: true });
  roof(out, y0 + h, 0.2, 0.34 + level * 0.03, roofC, level >= 5 ? GOLD : P.trim, level >= 5);
  if (level >= 4) flagParts(out, x, y0 + h + 0.34, z, P.banner);
}

export interface TowerDef { base: Part[]; turret: Part[]; barrel: Part[]; deckY: number; turretY: number; unitBack: number; height: number }

function buildTower(style: TowerStyle, f: FactionId, level: number, branch: Branch | null, accent: number): TowerDef {
  const P = TOWER_PAL[f];
  const rand = rnd(level * 97 + style.length * 13 + f.length);
  const roofC = level >= 4 ? mix(P.roof, accent, branch === 'B' ? 0.6 : 0.25) : P.roof;
  const trim = level >= 5 ? GOLD : P.trim;
  const base: Part[] = [], turret: Part[] = [], barrel: Part[] = [];
  // foundation ring (all towers)
  course(base, 0.44, 0, 0.14, 12, P.stoneD, rand);
  base.push({ g: cyl(0.42, 0.44, 0.13, 12), c: shade(P.stoneD, 0.9), p: [0, 0.07, 0] });
  if (level >= 5) base.push({ g: tor(0.45, 0.025), c: GOLD, p: [0, 0.15, 0], r: [Math.PI / 2, 0, 0] });
  let deckY = 0.8, turretY = 0, unitBack = 0;

  switch (style) {
    case 'archer': {
      const courses = 2 + Math.min(2, level - 1);
      let y = 0.14;
      for (let i = 0; i < courses; i++, y += 0.2) course(base, 0.3 - i * 0.01, y, 0.2, 8, P.stone, rand, i % 2 * 0.5);
      base.push({ g: cyl(0.27, 0.29, y - 0.14, 8), c: shade(P.stone, 0.7), p: [0, (y + 0.14) / 2, 0] });
      // door + windows
      base.push({ g: box(0.13, 0.2, 0.04), c: DARKW, p: [0, 0.26, 0.3] }, { g: box(0.16, 0.03, 0.05), c: P.wood, p: [0, 0.37, 0.3] });
      if (level >= 2) for (const a of [0.8, -0.8, Math.PI]) base.push({ g: box(0.08, 0.13, 0.04), c: shade(P.roof, 0.8), p: [Math.sin(a) * 0.31, y - 0.18, Math.cos(a) * 0.31], r: [0, a, 0] });
      // wooden deck with plank crenellations
      deckY = y + 0.08;
      base.push({ g: cyl(0.42, 0.38, 0.08, 10), c: P.wood, p: [0, y + 0.04, 0] });
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        base.push({ g: box(0.07, 0.36, 0.07), c: shade(P.wood, 0.8), p: [Math.cos(a) * 0.38, y - 0.08, Math.sin(a) * 0.38] }); // scaffold post
        base.push({ g: box(0.09, 0.2, 0.09), c: shade(P.wood, 0.85), p: [Math.cos(a) * 0.4, y + 0.16, Math.sin(a) * 0.4] });
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        if (i % 2) base.push({ g: box(0.18, 0.12, 0.05), c: shade(P.wood, 0.95 + rand() * 0.15), p: [Math.cos(a) * 0.4, y + 0.14, Math.sin(a) * 0.4], r: [0, -a + Math.PI / 2, 0] });
      }
      if (level >= 2) {
        base.push({ g: box(0.2, 0.36, 0.02), c: P.banner, p: [0.18, y - 0.22, 0.32] }, { g: oct(0.045), c: trim, p: [0.18, y - 0.2, 0.34], glow: level >= 3 });
        base.push({ g: box(0.24, 0.03, 0.03), c: trim, p: [0.18, y - 0.04, 0.33] });
      }
      if (level >= 3) turretAt(base, -0.3, -0.28, y - 0.2, 0.55 + level * 0.06, P, roofC, level, rand);
      if (level >= 4) turretAt(base, 0.33, -0.25, y - 0.25, 0.45 + level * 0.05, P, roofC, level, rand);
      if (level >= 5) base.push({ g: tor(0.31, 0.025), c: GOLD, p: [0, y - 0.02, 0], r: [Math.PI / 2, 0, 0] }, { g: tor(0.31, 0.025), c: GOLD, p: [0, 0.4, 0], r: [Math.PI / 2, 0, 0] });
      break;
    }
    case 'cannon': {
      const tall = 0.32 + level * 0.06;
      for (let i = 0, y = 0.14; y < 0.14 + tall; i++, y += 0.17) course(base, 0.36, y, 0.17, 8, P.stone, rand, i % 2 * 0.5);
      base.push({ g: cyl(0.33, 0.35, tall, 8), c: shade(P.stone, 0.7), p: [0, 0.14 + tall / 2, 0] });
      base.push({ g: cyl(0.4, 0.4, 0.06, 8), c: P.trim, p: [0, 0.14 + tall, 0] }, { g: cyl(0.38, 0.38, 0.05, 8), c: P.trim, p: [0, 0.2, 0] });
      for (const a of [0.6, -0.6]) base.push({ g: box(0.1, 0.13, 0.04), c: DARKW, p: [Math.sin(a) * 0.37, 0.14 + tall * 0.55, Math.cos(a) * 0.37], r: [0, a, 0] });
      // cannonball pile
      base.push({ g: sph(0.07, 1), c: IRON, p: [0.42, 0.07, 0.25] }, { g: sph(0.07, 1), c: IRON, p: [0.5, 0.07, 0.13] }, { g: sph(0.07, 1), c: IRON, p: [0.45, 0.18, 0.19] });
      turretY = 0.17 + tall;
      deckY = turretY;
      unitBack = 0.26;
      // rotating carriage
      const red = level >= 3 ? mix(P.roof, 0xc0302a, 0.5) : P.wood;
      turret.push({ g: cyl(0.28, 0.3, 0.1, 8), c: shade(P.wood, 0.8), p: [0, 0.05, 0] });
      turret.push({ g: box(0.36, 0.2, 0.3), c: red, p: [0, 0.2, -0.02] });
      turret.push({ g: cyl(0.1, 0.1, 0.06, 8), c: trim, p: [0.2, 0.2, -0.02], r: [0, 0, Math.PI / 2] }, { g: cyl(0.1, 0.1, 0.06, 8), c: trim, p: [-0.2, 0.2, -0.02], r: [0, 0, Math.PI / 2] });
      if (level >= 3) turret.push({ g: cyl(0.08, 0.08, 0.02, 6), c: 0xffffff, p: [0.215, 0.2, -0.02], r: [0, 0, Math.PI / 2] }, { g: oct(0.05), c: trim, p: [0.23, 0.2, -0.02] });
      const L = 0.5 + level * 0.05, R = 0.09 + level * 0.008;
      if (branch === 'B' && level >= 4) {
        for (const [x, yy] of [[-0.07, 0.3], [0.07, 0.3], [0, 0.4]] as [number, number][]) barrel.push({ g: cyl(0.05, 0.05, L, 8), c: IRON, p: [x, yy, L / 2], r: [Math.PI / 2, 0, 0] });
        barrel.push({ g: cyl(0.14, 0.14, 0.08, 8), c: trim, p: [0, 0.34, 0.1], r: [Math.PI / 2, 0, 0] }, { g: cyl(0.14, 0.14, 0.05, 8), c: trim, p: [0, 0.34, L * 0.85], r: [Math.PI / 2, 0, 0] });
      } else {
        barrel.push({ g: cyl(R, R * 1.25, L, 10), c: IRON, p: [0, 0.32, L / 2 - 0.05], r: [Math.PI / 2 - 0.12, 0, 0] });
        barrel.push({ g: tor(R * 1.05, 0.022), c: trim, p: [0, 0.35, L - 0.08] }, { g: tor(R * 1.2, 0.025), c: trim, p: [0, 0.32, 0.05] });
        barrel.push({ g: sph(R * 1.3, 1), c: IRON, p: [0, 0.31, -0.08] });
        if (level >= 4) barrel.push({ g: tor(R * 1.1, 0.02), c: GOLD, p: [0, 0.335, L * 0.5] });
      }
      break;
    }
    case 'mage': case 'dark': {
      const dark = style === 'dark';
      const tall = 0.42 + level * 0.07;
      for (let i = 0, y = 0.14; y < 0.14 + tall; i++, y += 0.18) course(base, 0.33, y, 0.18, 8, dark ? P.stoneD : shade(P.stone, 0.75), rand, i % 2 * 0.5);
      base.push({ g: cyl(0.3, 0.32, tall, 8), c: shade(P.stoneD, 0.8), p: [0, 0.14 + tall / 2, 0] });
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        base.push({ g: box(0.06, tall, 0.06), c: dark ? 0xd8d0c0 : trim, p: [Math.cos(a) * 0.34, 0.14 + tall / 2, Math.sin(a) * 0.34] });
        base.push({ g: box(0.1, 0.16, 0.03), c: P.glow, p: [Math.cos(a + Math.PI / 4) * 0.34, 0.14 + tall * 0.5, Math.sin(a + Math.PI / 4) * 0.34], r: [0, -a - Math.PI / 4 + Math.PI / 2, 0], glow: true });
      }
      const top = 0.14 + tall;
      base.push({ g: cyl(0.4, 0.36, 0.08, 8), c: dark ? 0x2a2438 : trim, p: [0, top + 0.04, 0] });
      // claws / bone spikes
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        base.push({ g: cone(0.05, 0.36, 4), c: dark ? 0xe8e0d0 : trim, p: [Math.cos(a) * 0.28, top + 0.22, Math.sin(a) * 0.28], r: [Math.sin(a) * -0.5, 0, Math.cos(a) * 0.5] });
      }
      if (level >= 2) for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        base.push({ g: cyl(0.05, 0.06, 0.25, 6), c: trim, p: [Math.cos(a) * 0.42, top + 0.05, Math.sin(a) * 0.42] });
        base.push({ g: oct(0.06), c: P.glow, p: [Math.cos(a) * 0.42, top + 0.24, Math.sin(a) * 0.42], s: [0.8, 1.6, 0.8], glow: true });
      }
      if (level >= 3) base.push({ g: tor(0.5, 0.02), c: P.glow, p: [0, 0.16, 0], r: [Math.PI / 2, 0, 0], glow: true });
      if (dark && level >= 3) base.push({ g: sph(0.07), c: 0xe8e0d0, p: [0, top - 0.1, 0.34] }, { g: box(0.03, 0.03, 0.02), c: P.glow, p: [0.025, top - 0.09, 0.4], glow: true }, { g: box(0.03, 0.03, 0.02), c: P.glow, p: [-0.025, top - 0.09, 0.4], glow: true });
      if (level >= 4) turretAt(base, -0.36, -0.3, top - 0.35, 0.5, P, roofC, level, rand);
      if (level >= 5) for (let i = 0; i < 3; i++) turret.push({ g: oct(0.07), c: P.glow, p: [Math.cos(i * 2.09) * 0.55, 0.4, Math.sin(i * 2.09) * 0.55], s: [0.7, 1.5, 0.7], glow: true });
      turretY = top;
      deckY = top + 0.08;
      break;
    }
    case 'ice': {
      const tall = 0.4 + level * 0.07;
      for (let i = 0, y = 0.14; y < 0.14 + tall; i++, y += 0.17) {
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          base.push({ g: box(0.5, 0.16, 0.12), c: shade(0x8a92a0, 0.85 + rand() * 0.3), p: [Math.cos(a) * 0.25, y + 0.08, Math.sin(a) * 0.25], r: [0, -a + Math.PI / 2, 0] });
        }
      }
      base.push({ g: box(0.46, tall, 0.46), c: 0x6a7280, p: [0, 0.14 + tall / 2, 0] });
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) base.push({ g: box(0.12, 0.18, 0.03), c: 0x9fe8ff, p: [Math.sin(a) * 0.32, 0.14 + tall * 0.5, Math.cos(a) * 0.32], r: [0, a, 0], glow: true });
      const top = 0.14 + tall;
      base.push({ g: box(0.62, 0.08, 0.62), c: 0x7a8290, p: [0, top + 0.04, 0] });
      const n = 4 + level;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, h = 0.3 + rand() * 0.3 + level * 0.05;
        base.push({ g: oct(0.12), c: i % 2 ? 0xbff4ff : 0x7fd0ff, p: [Math.cos(a) * 0.3, top + h * 0.4, Math.sin(a) * 0.3], r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], s: [0.7, h * 3, 0.7], glow: i % 3 === 0 });
      }
      for (let i = 0; i < 2 + level; i++) {
        const a = rand() * Math.PI * 2, h = 0.2 + rand() * 0.25;
        base.push({ g: oct(0.1), c: 0xa8eaff, p: [Math.cos(a) * 0.52, h * 0.3, Math.sin(a) * 0.52], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], s: [0.7, h * 3.5, 0.7] });
      }
      base.push({ g: cyl(0.55, 0.55, 0.02, 14), c: 0xd8f4ff, p: [0, 0.01, 0] });
      if (level >= 5) base.push({ g: oct(0.2), c: 0xe8fbff, p: [0, top + 0.9, -0.2], s: [0.7, 2.6, 0.7], glow: true });
      deckY = top + 0.08;
      break;
    }
    case 'fire': {
      const tall = 0.4 + level * 0.07;
      for (let i = 0, y = 0.14; y < 0.14 + tall; i++, y += 0.18) course(base, 0.32, y, 0.18, 8, 0x5a4a44, rand, i % 2 * 0.5);
      base.push({ g: cyl(0.29, 0.31, tall, 8), c: 0x3a2e2a, p: [0, 0.14 + tall / 2, 0] });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        base.push({ g: box(0.025, tall * 0.6, 0.02), c: 0xff7a2a, p: [Math.cos(a) * 0.34, 0.14 + tall * 0.45, Math.sin(a) * 0.34], r: [0, -a, 0.3], glow: true });
      }
      const top = 0.14 + tall;
      base.push({ g: cyl(0.4, 0.34, 0.08, 8), c: trim, p: [0, top + 0.04, 0] });
      const braziers = level >= 3 ? 4 : 2;
      for (let i = 0; i < braziers; i++) {
        const a = (i / braziers) * Math.PI * 2 + Math.PI / 4;
        const x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4;
        base.push({ g: cyl(0.08, 0.05, 0.08, 6), c: IRON, p: [x, top + 0.12, z] }, { g: cone(0.06, 0.18, 5), c: 0xffb030, p: [x, top + 0.24, z], glow: true }, { g: cone(0.035, 0.14, 5), c: 0xfff0a0, p: [x, top + 0.24, z], glow: true });
      }
      if (level >= 4) turretAt(base, -0.34, -0.3, top - 0.3, 0.5, P, roofC, level, rand);
      if (level >= 5) base.push({ g: sph(0.12, 1), c: 0xffe08a, p: [0, top + 1.25, -0.15], glow: true }, { g: tor(0.2, 0.02), c: GOLD, p: [0, top + 1.25, -0.15], glow: true });
      deckY = top + 0.08;
      break;
    }
    case 'poison': {
      const tall = 0.36 + level * 0.06;
      for (let i = 0, y = 0.14; y < 0.14 + tall; i++, y += 0.18) course(base, 0.32, y, 0.18, 8, mix(P.stone, 0x5a7a3a, 0.4), rand, i % 2 * 0.5);
      base.push({ g: cyl(0.29, 0.31, tall, 8), c: 0x4a5a3a, p: [0, 0.14 + tall / 2, 0] });
      const top = 0.14 + tall;
      base.push({ g: cyl(0.4, 0.36, 0.08, 8), c: P.wood, p: [0, top + 0.04, 0] });
      const vats = level >= 3 ? 2 : 1;
      for (let i = 0; i < vats; i++) {
        const x = i ? -0.28 : 0.28, z = -0.22;
        base.push({ g: cyl(0.14, 0.11, 0.18, 8), c: IRON, p: [x, top + 0.17, z] }, { g: cyl(0.12, 0.12, 0.02, 8), c: 0x8aff4a, p: [x, top + 0.26, z], glow: true });
        base.push({ g: sph(0.04, 0), c: 0xc8ff6a, p: [x + 0.04, top + 0.29, z], glow: true });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        base.push({ g: cone(0.04, 0.3 + rand() * 0.2, 4), c: 0x4a8a2a, p: [Math.cos(a) * 0.36, 0.3, Math.sin(a) * 0.36], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] });
      }
      base.push({ g: sph(0.07), c: 0xd84a4a, p: [0.45, 0.06, 0.2], s: [1, 0.5, 1] }, { g: cyl(0.02, 0.02, 0.08, 4), c: 0xf0e8d0, p: [0.45, 0.02, 0.2] });
      if (level >= 4) turretAt(base, -0.36, 0.3, top - 0.3, 0.45, P, roofC, level, rand);
      if (level >= 5) base.push({ g: sph(0.14, 1), c: 0xb4ff6a, p: [0, top + 1.2, -0.15], glow: true });
      deckY = top + 0.08;
      break;
    }
    case 'shrine': {
      const h = 0.3 + level * 0.04;
      for (let i = 0, y = 0.14; y < 0.14 + h; i++, y += 0.15) course(base, 0.36, y, 0.15, 10, shade(P.stone, 1.1), rand, i % 2 * 0.5);
      base.push({ g: cyl(0.34, 0.36, h, 10), c: shade(P.stone, 0.85), p: [0, 0.14 + h / 2, 0] });
      const top = 0.14 + h;
      base.push({ g: cyl(0.44, 0.4, 0.07, 12), c: trim, p: [0, top + 0.035, 0] });
      const cols = level >= 3 ? 6 : 4;
      for (let i = 0; i < cols; i++) {
        const a = (i / cols) * Math.PI * 2 + 0.3;
        const x = Math.cos(a) * 0.38, z = Math.sin(a) * 0.38;
        if (z > 0.2 && Math.abs(x) < 0.2) continue; // keep the front open
        base.push({ g: cyl(0.045, 0.05, 0.5 + level * 0.05, 6), c: shade(P.stone, 1.15), p: [x, top + 0.27, z] });
        base.push({ g: box(0.12, 0.05, 0.12), c: trim, p: [x, top + 0.54 + level * 0.05, z] });
        if (level >= 4) base.push({ g: oct(0.05), c: P.glow, p: [x, top + 0.64 + level * 0.05, z], glow: true });
      }
      if (level >= 2) base.push({ g: box(0.18, 0.3, 0.02), c: P.banner, p: [0.2, top - 0.15, 0.37] }, { g: oct(0.04), c: trim, p: [0.2, top - 0.12, 0.39], glow: true });
      turret.push({ g: tor(0.32, 0.025), c: P.glow, p: [0, 0.95 + level * 0.05, 0], r: [Math.PI / 2, 0, 0], glow: true });
      if (level >= 3) turret.push(...[0, 1, 2].map(i => ({ g: oct(0.05), c: P.glow, p: [Math.cos(i * 2.09) * 0.32, 0.95 + level * 0.05, Math.sin(i * 2.09) * 0.32] as V3, glow: true })));
      if (level >= 5) turret.push({ g: tor(0.42, 0.02), c: GOLD, p: [0, 1.1 + level * 0.05, 0], r: [Math.PI / 2, 0, 0], glow: true });
      turretY = top;
      deckY = top + 0.07;
      break;
    }
    case 'spire': {
      const tall = 0.4 + level * 0.06;
      for (let i = 0, y = 0.14; y < 0.14 + tall; i++, y += 0.17) course(base, 0.3, y, 0.17, 8, P.stone, rand, i % 2 * 0.5);
      base.push({ g: cyl(0.27, 0.29, tall, 8), c: shade(P.stone, 0.7), p: [0, 0.14 + tall / 2, 0] });
      const top = 0.14 + tall;
      base.push({ g: cyl(0.4, 0.34, 0.08, 8), c: P.wood, p: [0, top + 0.04, 0] });
      const rodH = 0.9 + level * 0.15;
      base.push({ g: cyl(0.03, 0.05, rodH, 6), c: 0xb87333, p: [0, top + rodH / 2, -0.32] });
      for (let i = 0; i < 2 + Math.floor(level / 2); i++) base.push({ g: tor(0.08 + i * 0.01, 0.018), c: 0xd8904a, p: [0, top + 0.3 + i * 0.22, -0.32], r: [Math.PI / 2, 0, 0] });
      base.push({ g: sph(0.08 + level * 0.012, 1), c: P.glow, p: [0, top + rodH + 0.05, -0.32], glow: true });
      if (level >= 3) turretAt(base, 0.33, -0.25, top - 0.3, 0.45, P, roofC, level, rand);
      if (level >= 4) turret.push({ g: tor(0.22, 0.015), c: P.glow, p: [0, rodH * 0.8, -0.32], r: [Math.PI / 2, 0, 0], glow: true });
      turretY = top;
      deckY = top + 0.08;
      break;
    }
  }
  return { base, turret, barrel, deckY, turretY, unitBack, height: deckY };
}

interface CompiledTower { def: TowerDef; base: Piece; turret: Piece | null; barrel: Piece | null }
function piece(parts: Part[]): Piece | null {
  if (!parts.length) return null;
  const n = parts.filter(p => !p.glow), g = parts.filter(p => p.glow);
  return { normal: n.length ? mergeParts(n) : null, glow: g.length ? mergeParts(g) : null };
}
const cache = new Map<string, CompiledTower>();

const TOWER_SCALE = 1.15;

/** One tower instance on a cell. */
export class TowerRig {
  root = new THREE.Group();
  turret = new THREE.Group();
  barrel = new THREE.Group();
  private slots: { obj: THREE.Object3D; geo: THREE.BufferGeometry; glow: boolean }[] = [];
  deckY: number;
  unitBack: number;
  private recoilT = 0;
  private spin: boolean;
  aim = 0;

  constructor(style: TowerStyle, faction: FactionId, level: number, branch: Branch | null, accent: number) {
    const key = `${style}|${faction}|${level}|${branch ?? ''}|${accent}`;
    let c = cache.get(key);
    if (!c) {
      const def = buildTower(style, faction, level, branch, accent);
      c = { def, base: piece(def.base)!, turret: piece(def.turret), barrel: piece(def.barrel) };
      cache.set(key, c);
    }
    this.deckY = c.def.deckY * TOWER_SCALE;
    this.unitBack = c.def.unitBack * TOWER_SCALE;
    this.spin = style === 'shrine' || style === 'mage' || style === 'dark' || style === 'spire';
    this.root.scale.setScalar(TOWER_SCALE);
    this.root.add(this.turret);
    this.turret.position.y = c.def.turretY;
    this.turret.add(this.barrel);
    const add = (o: THREE.Object3D, p: Piece | null) => {
      if (!p) return;
      if (p.normal) this.slots.push({ obj: o, geo: p.normal, glow: false });
      if (p.glow) this.slots.push({ obj: o, geo: p.glow, glow: true });
    };
    add(this.root, c.base);
    add(this.turret, c.turret);
    add(this.barrel, c.barrel);
  }

  recoil() { this.recoilT = 0.25; }

  update(dt: number, time: number) {
    if (this.spin) this.turret.rotation.y = time * 0.8;
    else this.turret.rotation.y += angleDelta(this.turret.rotation.y, this.aim) * Math.min(1, dt * 10);
    if (this.recoilT > 0) {
      this.recoilT -= dt;
      const k = Math.max(0, this.recoilT / 0.25);
      this.barrel.position.z = -0.14 * Math.sin(k * Math.PI) * (k > 0.6 ? 1 : k / 0.6);
    } else this.barrel.position.z = 0;
  }

  /** World position of the muzzle (projectile origin). */
  muzzle(out: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    return out.set(0, 0.35, 0.65).applyMatrix4(this.barrel.matrixWorld);
  }

  submit(b: Batcher, tint: THREE.Color) {
    this.root.updateMatrixWorld(true);
    for (const s of this.slots) b.add(s.geo, s.glow, s.obj.matrixWorld, tint);
  }

  attachMeshes(mat: THREE.Material, glowMat: THREE.Material) {
    for (const s of this.slots) s.obj.add(new THREE.Mesh(s.geo, s.glow ? glowMat : mat));
  }
}

function angleDelta(a: number, b: number) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
