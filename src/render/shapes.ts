// Character shapes: a parametric humanoid builder + hand-made creatures. 100 % original procedural models.
import * as THREE from 'three';
import type { ModelDef } from '../data/types';
import { Part, RigDef, Limb, Attack, V3, box, sph, cyl, cone, oct, tor, shade, mix } from './characters';

const SKIN = 0xe8c4a0, BONE = 0xeadfc0, METAL = 0xb8c0cc, DMETAL = 0x4a4e58, WOOD = 0x7a5232, LEATHER = 0x5a3a22, GOLD = 0xe0b040, DARK = 0x1a1424;
const GOBLIN = 0x7aa83a, ORC = 0x5a8a3a, OGRE = 0xd88a7a;

const eyes = (c: number, y: number, z: number, dx = 0.05, w = 0.03, glow = false): Part[] => [
  { g: box(w, w, 0.02), c, p: [-dx, y, z], glow }, { g: box(w, w, 0.02), c, p: [dx, y, z], glow },
];
const mirror = (l: Limb): Limb => ({ pivot: [-l.pivot[0], l.pivot[1], l.pivot[2]], parts: l.parts.map(p => ({ ...p, p: p.p ? [-p.p[0], p.p[1], p.p[2]] as V3 : undefined, r: p.r ? [p.r[0], -p.r[1], -p.r[2]] as V3 : undefined })) });

/** Half-ring bow in an arm's local frame: limbs along local z, bulging toward local -y (forward when the arm is raised). */
function bowGeo(R: number, t: number) {
  const g = tor(R, t, Math.PI);
  g.rotateY(-Math.PI / 2);
  g.rotateZ(Math.PI);
  return g;
}

// ---------------------------------------------------------------- weapons (hand at local [0,-L,0], pointing +z)
type Weapon = 'sword' | 'axe' | 'spear' | 'trident' | 'harpoon' | 'staff' | 'crystalstaff' | 'skullstaff' | 'hammer' | 'wrench' | 'dagger' | 'club' | 'drill' | 'censer' | 'scimitar' | 'xbow' | 'totem' | 'none';
type Offhand = 'shield' | 'tower' | 'book' | 'lantern' | 'bow' | 'scimitar' | 'dagger' | 'none';

function weapon(kind: Weapon, L: number, A: number, C: number): Part[] {
  const y = -L;
  switch (kind) {
    case 'sword': return [{ g: box(0.18, 0.04, 0.05), c: GOLD, p: [0, y, 0.06] }, { g: box(0.06, 0.04, 0.62), c: METAL, p: [0, y, 0.4], w: true }, { g: cone(0.03, 0.08, 4), c: METAL, p: [0, y, 0.74], r: [Math.PI / 2, 0, 0], w: true }];
    case 'axe': return [{ g: cyl(0.025, 0.025, 0.7, 5), c: WOOD, p: [0, y, 0.25], r: [Math.PI / 2, 0, 0] }, { g: box(0.04, 0.26, 0.2), c: METAL, p: [0, y + 0.08, 0.52], w: true }];
    case 'spear': return [{ g: cyl(0.022, 0.022, 1.25, 5), c: WOOD, p: [0, y, 0.3], r: [Math.PI / 2, 0, 0] }, { g: cone(0.05, 0.22, 4), c: METAL, p: [0, y, 1.0], r: [Math.PI / 2, 0, 0], w: true }];
    case 'trident': return [{ g: cyl(0.022, 0.022, 1.2, 5), c: shade(C, 0.7), p: [0, y, 0.3], r: [Math.PI / 2, 0, 0] }, { g: box(0.24, 0.03, 0.03), c: A, p: [0, y, 0.9], w: true },
      ...[-0.1, 0, 0.1].map(x => ({ g: cone(0.025, 0.18, 4), c: A, p: [x, y, 1.0] as V3, r: [Math.PI / 2, 0, 0] as V3, w: true }))];
    case 'harpoon': return [{ g: cyl(0.025, 0.025, 1.2, 5), c: WOOD, p: [0, y, 0.3], r: [Math.PI / 2, 0, 0] }, { g: cone(0.06, 0.26, 4), c: METAL, p: [0, y, 1.0], r: [Math.PI / 2, 0, 0], w: true }, { g: cone(0.03, 0.1, 3), c: METAL, p: [0.05, y, 0.86], r: [Math.PI / 2, 0, 0.6] }, { g: cyl(0.01, 0.01, 0.4, 3), c: 0xe8e0d0, p: [0, y - 0.05, 0.1], r: [Math.PI / 2, 0, 0] }];
    case 'staff': return [{ g: cyl(0.025, 0.025, 1.2, 5), c: WOOD, p: [0, y, 0.06] }, { g: sph(0.11), c: A, p: [0, y + 0.66, 0.06], glow: true }, { g: tor(0.1, 0.018), c: GOLD, p: [0, y + 0.66, 0.06], r: [Math.PI / 2, 0, 0], w: true }];
    case 'crystalstaff': return [{ g: cyl(0.022, 0.03, 1.15, 5), c: DARK, p: [0, y, 0.05] }, { g: oct(0.11), c: A, p: [0, y + 0.66, 0.05], s: [0.8, 1.5, 0.8], glow: true }];
    case 'skullstaff': return [{ g: cyl(0.022, 0.028, 1.2, 5), c: shade(C, 0.6), p: [0, y, 0.05] }, { g: sph(0.09), c: BONE, p: [0, y + 0.66, 0.05] }, ...eyes(A, y + 0.67, 0.13, 0.035, 0.03, true), { g: cone(0.04, 0.16, 4), c: BONE, p: [0.08, y + 0.78, 0.05], r: [0, 0, -0.6] }, { g: cone(0.04, 0.16, 4), c: BONE, p: [-0.08, y + 0.78, 0.05], r: [0, 0, 0.6] }];
    case 'hammer': return [{ g: cyl(0.03, 0.03, 0.8, 5), c: WOOD, p: [0, y, 0.3], r: [Math.PI / 2, 0, 0] }, { g: box(0.22, 0.2, 0.32), c: DMETAL, p: [0, y, 0.72], w: true }, { g: box(0.24, 0.05, 0.05), c: A, p: [0, y + 0.1, 0.72] }];
    case 'wrench': return [{ g: box(0.05, 0.05, 0.55), c: METAL, p: [0, y, 0.28], w: true }, { g: box(0.16, 0.06, 0.08), c: METAL, p: [0, y, 0.56], w: true }, { g: box(0.05, 0.06, 0.1), c: METAL, p: [0.06, y, 0.62] }];
    case 'dagger': return [{ g: box(0.1, 0.03, 0.04), c: shade(C, 0.6), p: [0, y, 0.04] }, { g: box(0.035, 0.05, 0.32), c: A, p: [0, y, 0.22], w: true }];
    case 'club': return [{ g: cyl(0.06, 0.14, 0.85, 6), c: WOOD, p: [0, y, 0.4], r: [Math.PI / 2, 0, 0], w: true }, ...[0, 1, 2, 3].map(i => ({ g: cone(0.035, 0.12, 4), c: BONE, p: [Math.cos(i * 1.57) * 0.13, y + Math.sin(i * 1.57) * 0.13, 0.72] as V3, r: [0, 0, i * 1.57 - Math.PI / 2] as V3 }))];
    case 'drill': return [{ g: cyl(0.09, 0.09, 0.12, 8), c: DMETAL, p: [0, y, 0.08], r: [Math.PI / 2, 0, 0] }, { g: cone(0.11, 0.5, 8), c: METAL, p: [0, y, 0.38], r: [Math.PI / 2, 0, 0], w: true }, { g: tor(0.08, 0.015), c: A, p: [0, y, 0.25] }];
    case 'censer': return [{ g: cyl(0.008, 0.008, 0.3, 3), c: GOLD, p: [0, y - 0.15, 0.1] }, { g: sph(0.09), c: shade(C, 0.6), p: [0, y - 0.32, 0.1], w: true }, { g: sph(0.06), c: A, p: [0, y - 0.32, 0.16], glow: true }];
    case 'scimitar': return [{ g: box(0.12, 0.04, 0.04), c: GOLD, p: [0, y, 0.04] }, { g: tor(0.3, 0.03, 1.4), c: A, p: [0, y + 0.2, 0.15], r: [0, Math.PI / 2, -0.4], w: true, glow: true }];
    case 'xbow': return [{ g: box(0.06, 0.06, 0.44), c: WOOD, p: [0, y, 0.18] }, { g: box(0.5, 0.035, 0.04), c: DMETAL, p: [0, y, 0.38], w: true }, { g: box(0.46, 0.01, 0.01), c: 0xdddddd, p: [0, y, 0.32] }, { g: cone(0.02, 0.1, 4), c: A, p: [0, y + 0.04, 0.42], r: [Math.PI / 2, 0, 0], glow: true }];
    case 'totem': return [{ g: cyl(0.03, 0.03, 1.2, 5), c: WOOD, p: [0, y, 0.05] }, { g: box(0.14, 0.18, 0.12), c: shade(C, 0.8), p: [0, y + 0.62, 0.05] }, ...eyes(A, y + 0.64, 0.12, 0.035, 0.03, true), { g: cone(0.03, 0.14, 4), c: BONE, p: [0.1, y + 0.72, 0.05], r: [0, 0, -1] }, { g: cone(0.03, 0.14, 4), c: BONE, p: [-0.1, y + 0.72, 0.05], r: [0, 0, 1] }];
    default: return [];
  }
}
function offhand(kind: Offhand, L: number, A: number, C: number): Part[] {
  const y = -L;
  switch (kind) {
    case 'shield': return [{ g: cyl(0.26, 0.26, 0.05, 10), c: shade(C, 0.85), p: [-0.1, y + 0.05, 0.08], r: [0, 0, Math.PI / 2] }, { g: tor(0.24, 0.025), c: METAL, p: [-0.13, y + 0.05, 0.08], r: [0, Math.PI / 2, 0], w: true }, { g: sph(0.06, 0), c: A, p: [-0.15, y + 0.05, 0.08] }];
    case 'tower': return [{ g: box(0.07, 0.62, 0.46), c: shade(C, 0.8), p: [-0.12, y + 0.08, 0.08] }, { g: box(0.03, 0.4, 0.26), c: A, p: [-0.16, y + 0.08, 0.08], w: true }];
    case 'book': return [{ g: box(0.16, 0.2, 0.06), c: shade(C, 0.6), p: [0, y - 0.05, 0.08] }, { g: box(0.14, 0.18, 0.065), c: 0xf0e8d0, p: [0.005, y - 0.05, 0.08] }];
    case 'lantern': return [{ g: cyl(0.008, 0.008, 0.16, 3), c: DMETAL, p: [0, y - 0.08, 0.06] }, { g: box(0.1, 0.13, 0.1), c: DMETAL, p: [0, y - 0.22, 0.06] }, { g: sph(0.045), c: A, p: [0, y - 0.22, 0.06], glow: true }];
    case 'bow': return [{ g: bowGeo(0.34, 0.028), c: WOOD, p: [0, y, 0.04], w: true }, { g: cyl(0.006, 0.006, 0.68, 3), c: 0xf4f4f4, p: [0, y, 0.04], r: [Math.PI / 2, 0, 0] }, { g: oct(0.05), c: A, p: [0, y - 0.34, 0.04], glow: true }];
    case 'scimitar': return weapon('scimitar', L, A, C);
    case 'dagger': return weapon('dagger', L, A, C);
    default: return [];
  }
}

// ---------------------------------------------------------------- parametric humanoid
type Head = 'bare' | 'hood' | 'helm' | 'horned' | 'goblin' | 'skull' | 'hat' | 'antlers' | 'flame' | 'fish' | 'beak' | 'ogre' | 'orc' | 'crown';
interface Hum {
  attack: Attack;
  build?: 'small' | 'slim' | 'normal' | 'bulky';
  skin: number; torso: number; legs?: number; accent: number;
  head?: Head; headC?: number;
  robe?: number; // robe colour → robe kind (no legs)
  right?: Weapon; left?: Offhand;
  extra?: Part[];
  eyeC?: number;
  hover?: number;
  float?: boolean;
}
const BUILD = {
  small: { hip: 0.42, torsoH: 0.34, torsoW: 0.18, sh: 0.76, shX: 0.2, headY: 0.98, headR: 0.2, armL: 0.32, armR: 0.045, legL: 0.38, h: 1.22 },
  slim: { hip: 0.62, torsoH: 0.46, torsoW: 0.16, sh: 1.04, shX: 0.23, headY: 1.26, headR: 0.14, armL: 0.4, armR: 0.045, legL: 0.52, h: 1.55 },
  normal: { hip: 0.62, torsoH: 0.48, torsoW: 0.2, sh: 1.06, shX: 0.27, headY: 1.3, headR: 0.15, armL: 0.42, armR: 0.055, legL: 0.52, h: 1.6 },
  bulky: { hip: 0.66, torsoH: 0.56, torsoW: 0.36, sh: 1.24, shX: 0.46, headY: 1.5, headR: 0.18, armL: 0.56, armR: 0.11, legL: 0.56, h: 1.8 },
};

function headParts(o: Hum, b: typeof BUILD.normal): Part[] {
  const y = b.headY, r = b.headR, C = o.headC ?? o.torso, A = o.accent, eye = o.eyeC ?? DARK, glowEyes = o.eyeC !== undefined;
  const face = (sk: number): Part[] => [{ g: sph(r), c: sk, p: [0, y, 0] }, ...eyes(eye, y + 0.01, r * 0.92, r * 0.36, r * 0.2, glowEyes)];
  switch (o.head ?? 'bare') {
    case 'bare': return [...face(o.skin), { g: sph(r * 1.04), c: shade(C, 0.7), p: [0, y + r * 0.25, -r * 0.2], s: [1, 0.7, 1] }];
    case 'hood': return [...face(o.skin), { g: sph(r * 1.08), c: C, p: [0, y + 0.02, -r * 0.25], s: [1, 1, 0.9] }, { g: cone(r * 1.25, r * 2.2, 7), c: C, p: [0, y + r * 0.95, -r * 0.15] }];
    case 'helm': return [...face(o.skin), { g: cyl(r * 1.08, r * 1.12, r * 1.3, 8), c: METAL, p: [0, y + r * 0.35, 0] }, { g: box(r * 1.6, r * 0.18, 0.02), c: DARK, p: [0, y + r * 0.1, r * 1.08] }, { g: cone(r * 0.25, r * 1.2, 4), c: A, p: [0, y + r * 1.4, -r * 0.2], r: [-0.4, 0, 0] }];
    case 'horned': return [...face(o.skin), { g: sph(r * 1.12), c: DMETAL, p: [0, y + r * 0.3, 0], s: [1, 0.8, 1] }, { g: cone(r * 0.32, r * 1.6, 5), c: BONE, p: [r * 1.1, y + r * 0.9, 0], r: [0, 0, -0.9] }, { g: cone(r * 0.32, r * 1.6, 5), c: BONE, p: [-r * 1.1, y + r * 0.9, 0], r: [0, 0, 0.9] }];
    case 'goblin': return [{ g: sph(r), c: o.skin, p: [0, y, 0.03], s: [1.05, 0.95, 1] }, ...eyes(o.eyeC ?? 0xffe040, y + 0.02, r * 0.9, r * 0.38, r * 0.22, true),
      { g: cone(r * 0.32, r * 1.5, 4), c: o.skin, p: [r * 1.15, y + 0.04, 0], r: [0, 0, -1.35] }, { g: cone(r * 0.32, r * 1.5, 4), c: o.skin, p: [-r * 1.15, y + 0.04, 0], r: [0, 0, 1.35] },
      { g: cone(r * 0.18, r * 0.5, 4), c: shade(o.skin, 0.8), p: [0, y - r * 0.15, r * 1.05], r: [Math.PI / 2, 0, 0] },
      { g: sph(r * 1.05), c: C, p: [0, y + r * 0.35, -r * 0.1], s: [1, 0.55, 1] }, { g: cone(r * 0.7, r * 1.2, 6), c: C, p: [0, y + r * 0.9, -r * 0.3], r: [-0.6, 0, 0] }];
    case 'orc': return [{ g: sph(r), c: o.skin, p: [0, y, 0.02], s: [1.1, 1, 1] }, ...eyes(o.eyeC ?? 0xff5030, y + 0.03, r * 0.88, r * 0.38, r * 0.2, true),
      { g: box(r * 1.2, r * 0.5, r * 0.6), c: shade(o.skin, 0.85), p: [0, y - r * 0.45, r * 0.45] }, { g: cone(r * 0.12, r * 0.4, 4), c: BONE, p: [r * 0.4, y - r * 0.2, r * 0.85] }, { g: cone(r * 0.12, r * 0.4, 4), c: BONE, p: [-r * 0.4, y - r * 0.2, r * 0.85] },
      { g: sph(r * 1.12), c: DMETAL, p: [0, y + r * 0.45, -r * 0.05], s: [1, 0.6, 1] }, { g: cone(r * 0.3, r * 1.4, 5), c: BONE, p: [r * 1.05, y + r * 0.8, 0], r: [0, 0, -1.1] }, { g: cone(r * 0.3, r * 1.4, 5), c: BONE, p: [-r * 1.05, y + r * 0.8, 0], r: [0, 0, 1.1] }];
    case 'ogre': return [{ g: sph(r * 1.1), c: o.skin, p: [0, y, 0.04] }, ...eyes(DARK, y + 0.05, r * 1.0, r * 0.35, r * 0.18), { g: box(r * 1.1, r * 0.35, r * 0.4), c: shade(o.skin, 0.8), p: [0, y - r * 0.5, r * 0.6] },
      { g: cone(r * 0.14, r * 0.45, 4), c: BONE, p: [r * 0.45, y - r * 0.2, r * 0.95] }, { g: cone(r * 0.14, r * 0.45, 4), c: BONE, p: [-r * 0.45, y - r * 0.2, r * 0.95] }, { g: sph(r * 0.3), c: shade(o.skin, 0.7), p: [0, y + r * 0.05, r * 1.05] }];
    case 'skull': return [{ g: sph(r), c: BONE, p: [0, y, 0] }, ...eyes(o.eyeC ?? 0x7affd0, y + 0.01, r * 0.9, r * 0.36, r * 0.25, true), { g: box(r * 0.9, r * 0.35, r * 0.5), c: shade(BONE, 0.85), p: [0, y - r * 0.6, r * 0.35] }];
    case 'hat': return [...face(o.skin), { g: cyl(r * 1.9, r * 1.9, 0.03, 10), c: C, p: [0, y + r * 0.7, 0] }, { g: cone(r * 1.1, r * 3, 8), c: C, p: [0.02, y + r * 2.1, -0.02], r: [0, 0, 0.15] }, { g: sph(r * 0.3, 0), c: A, p: [0.1, y + r * 3.5, 0], glow: true }];
    case 'antlers': return [...face(o.skin), { g: sph(r * 1.05), c: shade(C, 0.8), p: [0, y + r * 0.3, -r * 0.2], s: [1, 0.75, 1] },
      ...[-1, 1].flatMap(sx => [{ g: cyl(0.018, 0.022, r * 2.2, 4), c: 0xc8b088, p: [sx * r * 0.9, y + r * 1.4, 0] as V3, r: [0, 0, -sx * 0.5] as V3 }, { g: cyl(0.015, 0.018, r * 1.2, 4), c: 0xc8b088, p: [sx * r * 1.5, y + r * 1.9, 0] as V3, r: [0, 0, -sx * 1.2] as V3 }]),
      { g: sph(r * 0.25, 0), c: A, p: [0, y + r * 1.1, r * 0.4], glow: true }];
    case 'flame': return [...face(o.skin), ...[0, 1, 2, 3, 4].map(i => ({ g: cone(r * 0.4, r * (1.2 + (i % 2) * 0.5), 5), c: i % 2 ? A : shade(A, 1.3), p: [(i - 2) * r * 0.35, y + r * 1.1, -r * 0.2] as V3, r: [-0.3, 0, (i - 2) * 0.2] as V3, glow: true }))];
    case 'fish': return [{ g: sph(r), c: o.skin, p: [0, y, 0.02], s: [0.95, 1.05, 1.15] }, ...eyes(o.eyeC ?? 0xffff80, y + 0.03, r * 0.9, r * 0.5, r * 0.22, true), { g: box(0.02, r * 1.4, r * 1.6), c: o.accent, p: [0, y + r * 0.8, -r * 0.2] }, { g: cone(r * 0.4, r * 0.8, 4), c: shade(o.skin, 0.8), p: [r * 1.0, y, 0], r: [0, 0, -1.4] }, { g: cone(r * 0.4, r * 0.8, 4), c: shade(o.skin, 0.8), p: [-r * 1.0, y, 0], r: [0, 0, 1.4] }];
    case 'beak': return [{ g: sph(r * 1.08), c: C, p: [0, y, -0.02] }, ...eyes(o.eyeC ?? 0xb4ff6a, y + 0.03, r * 0.95, r * 0.38, r * 0.22, true), { g: cone(r * 0.35, r * 1.8, 5), c: BONE, p: [0, y - r * 0.2, r * 1.5], r: [Math.PI / 2 + 0.3, 0, 0] }, { g: cyl(r * 1.6, r * 1.6, 0.03, 10), c: DARK, p: [0, y + r * 0.8, 0] }, { g: cyl(r * 0.9, r, r * 0.9, 8), c: DARK, p: [0, y + r * 1.25, 0] }];
    case 'crown': return [...face(o.skin), { g: cyl(r * 0.95, r * 1.0, r * 0.45, 8), c: GOLD, p: [0, y + r * 0.95, 0] }, ...[0, 1, 2, 3, 4, 5].map(i => ({ g: cone(r * 0.18, r * 0.5, 4), c: GOLD, p: [Math.cos(i * 1.047) * r * 0.9, y + r * 1.35, Math.sin(i * 1.047) * r * 0.9] as V3 }))];
  }
}

function humanoid(o: Hum): RigDef {
  const b = BUILD[o.build ?? 'normal'];
  const A = o.accent, T = o.torso, Lc = o.legs ?? shade(T, 0.7);
  const body: Part[] = [];
  if (o.robe !== undefined) {
    body.push({ g: cone(b.torsoW * 1.9, b.hip + 0.32, 8), c: o.robe, p: [0, (b.hip + 0.32) / 2, 0] });
    body.push({ g: cyl(b.torsoW * 1.95, b.torsoW * 1.95, 0.05, 8), c: A, p: [0, 0.03, 0] });
  } else {
    body.push({ g: box(b.torsoW * 1.6, 0.14, b.torsoW * 1.3), c: shade(Lc, 0.9), p: [0, b.hip + 0.02, 0] });
  }
  body.push({ g: cyl(b.torsoW * 0.95, b.torsoW * 1.1, b.torsoH, 8), c: T, p: [0, b.hip + b.torsoH / 2 + 0.04, 0], s: [1, 1, 0.82] });
  body.push({ g: box(b.torsoW * 2.1, 0.06, b.torsoW * 1.7), c: LEATHER, p: [0, b.hip + 0.1, 0] });
  body.push({ g: box(0.05, 0.05, 0.02), c: GOLD, p: [0, b.hip + 0.1, b.torsoW * 0.86] });
  body.push(...headParts(o, b));
  if (o.extra) body.push(...o.extra);
  const armTop = (sx: number): Part[] => [
    { g: cyl(b.armR, b.armR * 0.85, b.armL, 6), c: o.robe !== undefined ? o.robe : T, p: [0, -b.armL / 2, 0] },
    { g: sph(b.armR * 1.25, 0), c: o.skin, p: [0, -b.armL, 0] },
    { g: sph(b.armR * 1.45, 0), c: shade(T, 0.85), p: [sx * 0.01, 0, 0] },
  ];
  const right: Limb = { pivot: [b.shX, b.sh, 0], parts: [...armTop(1), ...weapon(o.right ?? 'none', b.armL, A, T)] };
  const left: Limb = { pivot: [-b.shX, b.sh, 0], parts: [...armTop(-1), ...offhand(o.left ?? 'none', b.armL, A, T)] };
  const def: RigDef = { kind: o.float ? 'float' : o.robe !== undefined ? 'robe' : 'biped', attack: o.attack, height: b.h, hover: o.hover, body, arms: [left, right] };
  if (o.robe === undefined && !o.float) {
    const leg: Limb = { pivot: [b.torsoW * 0.5, b.hip, 0], parts: [{ g: cyl(b.armR * 1.25, b.armR * 1.05, b.legL, 6), c: Lc, p: [0, -b.legL / 2, 0] }, { g: box(b.armR * 2.6, 0.08, b.armR * 3.6), c: LEATHER, p: [0, -b.legL - 0.02, 0.04] }] };
    def.legs = [mirror(leg), leg];
  }
  return def;
}

// ---------------------------------------------------------------- shapes
export function shapeDef(m: ModelDef): RigDef {
  const C = m.color, A = m.accent, D = shade(m.color, 0.6), L = shade(m.color, 1.25);
  switch (m.shape) {
    // ======================= DEFENDERS (hand-made) =======================
    case 'golem': {
      const arm: Limb = { pivot: [0.47, 1.02, 0], parts: [{ g: box(0.2, 0.42, 0.22), c: C, p: [0, -0.22, 0] }, { g: box(0.27, 0.25, 0.27), c: D, p: [0, -0.52, 0], w: true }] };
      const left = mirror(arm);
      left.parts.push({ g: box(0.08, 0.56, 0.46), c: D, p: [-0.15, -0.4, 0.06] }, { g: box(0.03, 0.34, 0.28), c: A, p: [-0.2, -0.4, 0.06], w: true });
      const leg: Limb = { pivot: [0.18, 0.56, 0], parts: [{ g: box(0.22, 0.42, 0.24), c: D, p: [0, -0.2, 0] }, { g: box(0.27, 0.12, 0.36), c: DMETAL, p: [0, -0.5, 0.05] }] };
      return {
        kind: 'biped', attack: 'swing', height: 1.72,
        body: [
          { g: box(0.72, 0.56, 0.5), c: C, p: [0, 0.86, 0] }, { g: box(0.5, 0.3, 0.06), c: D, p: [0, 0.9, 0.26] },
          { g: box(0.13, 0.13, 0.04), c: A, p: [0, 0.92, 0.3], glow: true }, { g: box(0.64, 0.12, 0.46), c: DMETAL, p: [0, 0.56, 0] },
          { g: box(0.36, 0.3, 0.34), c: C, p: [0, 1.3, 0] }, { g: box(0.26, 0.07, 0.04), c: A, p: [0, 1.32, 0.18], glow: true },
          { g: cyl(0.02, 0.02, 0.22, 4), c: DMETAL, p: [0.1, 1.55, 0] }, { g: sph(0.045, 0), c: A, p: [0.1, 1.68, 0], glow: true },
          { g: box(0.3, 0.14, 0.38), c: D, p: [-0.47, 1.13, 0] }, { g: box(0.3, 0.14, 0.38), c: D, p: [0.47, 1.13, 0] },
          ...[-0.2, 0, 0.2].map(x => ({ g: sph(0.03, 0), c: DMETAL, p: [x, 1.08, 0.26] as V3 })),
        ],
        arms: [left, arm], legs: [mirror(leg), leg],
      };
    }
    case 'blade': {
      const skin = 0x9fd27a;
      const arm: Limb = { pivot: [0.24, 1.04, 0], parts: [
        { g: cyl(0.05, 0.045, 0.38), c: C, p: [0, -0.19, 0] }, { g: sph(0.06, 0), c: skin, p: [0, -0.41, 0] },
        { g: box(0.16, 0.04, 0.05), c: GOLD, p: [0, -0.44, 0.06] }, { g: box(0.045, 0.07, 0.62), c: 0xdaf7c8, p: [0, -0.44, 0.38], w: true },
      ] };
      const leg: Limb = { pivot: [0.09, 0.62, 0], parts: [{ g: cyl(0.06, 0.05, 0.52), c: D, p: [0, -0.26, 0] }, { g: box(0.12, 0.08, 0.2), c: LEATHER, p: [0, -0.58, 0.04] }] };
      return {
        kind: 'biped', attack: 'dual', height: 1.55,
        body: [
          { g: cyl(0.17, 0.21, 0.46), c: C, p: [0, 0.88, 0] }, { g: cone(0.3, 0.32, 6), c: D, p: [0, 0.6, 0] },
          { g: sph(0.16), c: skin, p: [0, 1.26, 0] }, ...eyes(DARK, 1.28, 0.145, 0.055),
          { g: cone(0.05, 0.24, 4), c: A, p: [0, 1.46, -0.02] }, { g: cone(0.05, 0.22, 4), c: A, p: [0.1, 1.42, 0], r: [0, 0, -0.5] },
          { g: cone(0.05, 0.22, 4), c: A, p: [-0.1, 1.42, 0], r: [0, 0, 0.5] }, { g: cone(0.06, 0.2, 4), c: A, p: [0.25, 1.1, 0], r: [0, 0, -1.2] },
          { g: cone(0.06, 0.2, 4), c: A, p: [-0.25, 1.1, 0], r: [0, 0, 1.2] },
        ],
        arms: [mirror(arm), arm], legs: [mirror(leg), leg],
      };
    }
    case 'archer': return humanoid({ attack: 'shoot', build: 'slim', skin: SKIN, torso: C, accent: A, head: 'hood', headC: C, left: 'bow', right: 'none',
      extra: [{ g: cyl(0.06, 0.06, 0.42), c: WOOD, p: [0.13, 1.0, -0.2], r: [0.35, 0, 0] }, { g: oct(0.05), c: A, p: [0.13, 1.24, -0.12], glow: true }, { g: cone(0.3, 0.5, 7), c: D, p: [0, 0.66, -0.03] }] });
    case 'turtle': {
      const leg = (x: number, z: number): Limb => ({ pivot: [x, 0.44, z], parts: [{ g: cyl(0.13, 0.12, 0.34), c: D, p: [0, -0.17, 0] }, { g: sph(0.14, 0), c: D, p: [0, -0.38, 0.04], s: [1, 0.6, 1.2] }] });
      return {
        kind: 'quad', attack: 'slam', height: 1.15,
        body: [
          { g: sph(0.56), c: C, p: [0, 0.66, -0.02], s: [1, 0.62, 1.12] }, { g: cyl(0.6, 0.64, 0.14, 9), c: D, p: [0, 0.42, 0], s: [1, 1, 1.08] },
          { g: cone(0.08, 0.3, 5), c: A, p: [0, 1.05, 0], glow: true }, { g: cone(0.07, 0.24, 5), c: A, p: [0.27, 0.95, -0.2] },
          { g: cone(0.07, 0.24, 5), c: A, p: [-0.27, 0.95, -0.2] }, { g: cone(0.07, 0.24, 5), c: A, p: [0.25, 0.95, 0.24] },
          { g: cone(0.07, 0.24, 5), c: A, p: [-0.25, 0.95, 0.24] }, { g: sph(0.22), c: D, p: [0, 0.58, 0.66] },
          ...eyes(A, 0.65, 0.84, 0.09, 0.05, true), { g: box(0.2, 0.04, 0.12), c: 0x0e3a40, p: [0, 0.5, 0.82] },
          { g: cone(0.06, 0.25, 4), c: D, p: [0, 0.45, -0.68], r: [-1.7, 0, 0] },
        ],
        legs: [leg(-0.36, 0.3), leg(0.36, 0.3), leg(-0.36, -0.3), leg(0.36, -0.3)],
      };
    }
    case 'mage': return humanoid({ attack: 'cast', skin: SKIN, torso: D, robe: C, accent: A, head: 'hat', headC: D, right: 'staff', left: 'book' });
    case 'bard': {
      const sleeve: Part[] = [{ g: cyl(0.055, 0.09, 0.36), c: C, p: [0, -0.18, 0] }, { g: sph(0.05, 0), c: SKIN, p: [0, -0.39, 0] }];
      const left: Limb = { pivot: [-0.21, 1.04, 0], parts: [...sleeve,
        { g: cyl(0.02, 0.02, 0.32, 4), c: GOLD, p: [-0.07, -0.6, 0.1], r: [0, 0, 0.25], w: true }, { g: cyl(0.02, 0.02, 0.32, 4), c: GOLD, p: [0.07, -0.6, 0.1], r: [0, 0, -0.25], w: true },
        { g: box(0.22, 0.03, 0.03), c: GOLD, p: [0, -0.45, 0.1] }, { g: box(0.1, 0.24, 0.006), c: 0xffffff, p: [0, -0.6, 0.1] }] };
      return {
        kind: 'robe', attack: 'cast', height: 1.65,
        body: [
          { g: cone(0.32, 0.88, 8), c: C, p: [0, 0.44, 0] }, { g: cyl(0.33, 0.33, 0.05, 8), c: 0xfff6c0, p: [0, 0.03, 0] },
          { g: cyl(0.14, 0.18, 0.3), c: L, p: [0, 0.95, 0] }, { g: tor(0.15, 0.03), c: A, p: [0, 1.08, 0], r: [Math.PI / 2, 0, 0] },
          { g: sph(0.14), c: SKIN, p: [0, 1.2, 0] }, ...eyes(DARK, 1.21, 0.13), { g: sph(0.15), c: GOLD, p: [0, 1.25, -0.04], s: [1, 0.92, 1] },
          { g: tor(0.2, 0.025), c: A, p: [0, 1.5, 0], r: [Math.PI / 2, 0, 0], glow: true },
        ],
        orbit: [{ g: oct(0.055), c: A, p: [0.45, 0.95, 0], glow: true }, { g: oct(0.055), c: A, p: [-0.22, 1.02, 0.39], glow: true }, { g: oct(0.055), c: A, p: [-0.22, 0.9, -0.39], glow: true }],
        arms: [left, { pivot: [0.21, 1.04, 0], parts: sleeve }],
      };
    }
    case 'shade': {
      const arm: Limb = { pivot: [0.25, 1.08, 0], parts: [{ g: cyl(0.045, 0.04, 0.38), c: D, p: [0, -0.19, 0] }, { g: sph(0.05, 0), c: DARK, p: [0, -0.4, 0] }, { g: box(0.12, 0.03, 0.04), c: D, p: [0, -0.42, 0.04] }, { g: box(0.035, 0.05, 0.34), c: A, p: [0, -0.42, 0.22], w: true }] };
      return {
        kind: 'float', attack: 'dual', height: 1.6, hover: 0.22,
        body: [
          { g: cone(0.3, 0.8, 7), c: C, p: [0, 0.55, 0], r: [Math.PI, 0, 0] }, { g: cyl(0.17, 0.25, 0.36), c: D, p: [0, 0.98, 0] },
          { g: cone(0.21, 0.42, 7), c: C, p: [0, 1.36, 0] }, { g: sph(0.13), c: DARK, p: [0, 1.24, 0.04] },
          { g: box(0.05, 0.025, 0.02), c: A, p: [-0.05, 1.25, 0.16], glow: true }, { g: box(0.05, 0.025, 0.02), c: A, p: [0.05, 1.25, 0.16], glow: true },
          { g: cone(0.06, 0.24, 4), c: C, p: [0.25, 1.13, 0], r: [0, 0, -1.1] }, { g: cone(0.06, 0.24, 4), c: C, p: [-0.25, 1.13, 0], r: [0, 0, 1.1] },
          { g: cone(0.08, 0.3, 4), c: C, p: [0.18, 0.28, 0.05], r: [Math.PI, 0, 0] }, { g: cone(0.08, 0.3, 4), c: C, p: [-0.18, 0.28, 0.05], r: [Math.PI, 0, 0] },
          { g: cone(0.08, 0.3, 4), c: C, p: [0, 0.24, -0.18], r: [Math.PI, 0, 0] },
        ],
        arms: [mirror(arm), arm],
      };
    }
    case 'prism':
      return {
        kind: 'float', attack: 'cast', height: 1.95, hover: 0.15,
        body: [
          { g: tor(0.42, 0.05), c: D, p: [0, 0.28, 0], r: [Math.PI / 2, 0, 0] }, { g: oct(0.42), c: C, p: [0, 1.05, 0], s: [0.8, 1.4, 0.8] },
          { g: tor(0.33, 0.035), c: A, p: [0, 1.05, 0], r: [Math.PI / 2, 0, 0], glow: true }, { g: oct(0.12), c: A, p: [0, 1.8, 0], glow: true },
        ],
        orbit: [0, 1, 2].map(i => ({ g: oct(0.13), c: A, p: [Math.cos(i * 2.094) * 0.68, 1.15, Math.sin(i * 2.094) * 0.68] as V3, s: [0.7, 1.4, 0.7] as V3, glow: true })),
      };

    // ======================= DEFENDERS (parametric) =======================
    case 'paladin': return humanoid({ attack: 'swing', build: 'normal', skin: SKIN, torso: C, legs: METAL, accent: A, head: 'helm', right: 'sword', left: 'tower',
      extra: [{ g: box(0.36, 0.3, 0.06), c: METAL, p: [0, 0.92, 0.17] }, { g: oct(0.06), c: A, p: [0, 0.94, 0.21], glow: true }] });
    case 'lancer': return humanoid({ attack: 'shoot', build: 'slim', skin: SKIN, torso: C, accent: A, head: 'helm', right: m.color === 0x1f8f9a ? 'harpoon' : 'spear', left: 'none',
      extra: [{ g: cyl(0.1, 0.1, 0.5, 6), c: LEATHER, p: [0.12, 1.0, -0.18], r: [0.3, 0, 0] }, ...[0, 1].map(i => ({ g: cone(0.03, 0.14, 4), c: A, p: [0.1 + i * 0.05, 1.3, -0.12] as V3, glow: true }))] });
    case 'colossus': return humanoid({ attack: 'slam', build: 'bulky', skin: C, torso: C, legs: D, accent: A, head: 'helm', right: 'hammer', left: 'none', eyeC: A,
      extra: [{ g: box(0.8, 0.5, 0.5), c: D, p: [0, 1.0, -0.06] }, { g: cyl(0.12, 0.12, 0.5, 8), c: DMETAL, p: [0.25, 1.3, -0.32], r: [0.2, 0, 0] }, { g: cyl(0.12, 0.12, 0.5, 8), c: DMETAL, p: [-0.25, 1.3, -0.32], r: [0.2, 0, 0] }, { g: sph(0.12), c: A, p: [0, 1.05, 0.26], glow: true }] });
    case 'bomber': return humanoid({ attack: 'shoot', build: 'small', skin: SKIN, torso: C, accent: A, head: 'helm', right: 'none', left: 'none',
      extra: [
        { g: box(0.08, 0.12, 0.02), c: A, p: [0, 0.68, 0.19], glow: true }, { g: cyl(0.04, 0.04, 0.3, 5), c: WOOD, p: [0.2, 0.62, -0.18], r: [0.4, 0, 0] },
      ] });
    case 'driller': return humanoid({ attack: 'swing', build: 'normal', skin: C, torso: C, legs: D, accent: A, head: 'helm', right: 'drill', left: 'none', eyeC: A,
      extra: [{ g: box(0.4, 0.42, 0.26), c: DMETAL, p: [0, 1.0, -0.24] }, { g: cyl(0.04, 0.04, 0.3, 5), c: DMETAL, p: [0.12, 1.3, -0.3] }, { g: sph(0.05), c: A, p: [0.12, 1.47, -0.3], glow: true }] });
    case 'mechanic': return humanoid({ attack: 'swing', build: 'slim', skin: SKIN, torso: C, accent: A, head: 'bare', headC: 0x8a4a2a, right: 'wrench', left: 'lantern',
      extra: [{ g: box(0.34, 0.36, 0.2), c: WOOD, p: [0, 1.0, -0.22] }, { g: cyl(0.05, 0.05, 0.22, 6), c: METAL, p: [0.14, 1.25, -0.25] }, { g: box(0.28, 0.06, 0.04), c: 0x2a2a2a, p: [0, 1.3, 0.13] }, { g: tor(0.05, 0.015), c: A, p: [0.07, 1.3, 0.15], glow: true }, { g: tor(0.05, 0.015), c: A, p: [-0.07, 1.3, 0.15], glow: true }] });
    case 'turret': return {
      kind: 'static', attack: 'shoot', height: 1.0,
      body: [{ g: cyl(0.32, 0.38, 0.3, 8), c: DMETAL, p: [0, 0.15, 0] }, { g: sph(0.26), c: C, p: [0, 0.48, 0], s: [1, 0.8, 1] }, { g: cyl(0.05, 0.05, 0.5, 6), c: DMETAL, p: [0.08, 0.5, 0.3], r: [Math.PI / 2, 0, 0], w: true }, { g: cyl(0.05, 0.05, 0.5, 6), c: DMETAL, p: [-0.08, 0.5, 0.3], r: [Math.PI / 2, 0, 0], w: true }, { g: sph(0.06), c: A, p: [0, 0.62, 0.18], glow: true }],
    };
    case 'treant': {
      const arm: Limb = { pivot: [0.42, 1.2, 0], parts: [{ g: cyl(0.1, 0.07, 0.6, 5), c: C, p: [0, -0.3, 0] }, { g: cone(0.05, 0.22, 4), c: D, p: [0.05, -0.65, 0.05], r: [0.3, 0, 0], w: true }, { g: cone(0.05, 0.2, 4), c: D, p: [-0.05, -0.63, 0.06], r: [0.3, 0, 0.3] }, { g: sph(0.12, 0), c: 0x4a8a2a, p: [0.06, -0.15, 0] }] };
      const leg: Limb = { pivot: [0.18, 0.55, 0], parts: [{ g: cyl(0.14, 0.18, 0.55, 6), c: D, p: [0, -0.27, 0] }, { g: cone(0.2, 0.15, 5), c: D, p: [0, -0.55, 0.06] }] };
      return {
        kind: 'biped', attack: 'slam', height: 1.9,
        body: [
          { g: cyl(0.3, 0.38, 0.9, 7), c: C, p: [0, 1.0, 0] }, { g: sph(0.45), c: 0x4a8a2a, p: [0, 1.65, 0], s: [1.2, 0.8, 1.1] }, { g: sph(0.32), c: 0x5aa03a, p: [0.25, 1.85, 0.1] },
          { g: sph(0.28), c: 0x3a7a2a, p: [-0.25, 1.8, -0.1] }, ...eyes(A, 1.25, 0.27, 0.09, 0.06, true), { g: box(0.16, 0.04, 0.03), c: DARK, p: [0, 1.1, 0.29] },
          { g: sph(0.08, 0), c: A, p: [0.2, 1.95, 0.25], glow: true }, { g: sph(0.07, 0), c: 0xff8aa0, p: [-0.3, 1.9, 0.18] },
        ],
        arms: [mirror(arm), arm], legs: [mirror(leg), leg],
      };
    }
    case 'sapling': return {
      kind: 'biped', attack: 'swing', height: 1.0,
      body: [{ g: cyl(0.12, 0.15, 0.45, 6), c: 0x6a5232, p: [0, 0.5, 0] }, { g: sph(0.26), c: C, p: [0, 0.92, 0] }, { g: sph(0.15), c: shade(C, 1.2), p: [0.15, 1.05, 0.05] }, ...eyes(A, 0.62, 0.13, 0.05, 0.04, true)],
      arms: [{ pivot: [-0.14, 0.65, 0], parts: [{ g: cyl(0.03, 0.025, 0.3, 4), c: 0x6a5232, p: [0, -0.15, 0] }] }, { pivot: [0.14, 0.65, 0], parts: [{ g: cyl(0.03, 0.025, 0.3, 4), c: 0x6a5232, p: [0, -0.15, 0] }, { g: cone(0.03, 0.12, 4), c: A, p: [0, -0.32, 0.04], r: [0.5, 0, 0], w: true }] }],
      legs: [{ pivot: [-0.07, 0.28, 0], parts: [{ g: cyl(0.04, 0.05, 0.28, 4), c: 0x6a5232, p: [0, -0.14, 0] }] }, { pivot: [0.07, 0.28, 0], parts: [{ g: cyl(0.04, 0.05, 0.28, 4), c: 0x6a5232, p: [0, -0.14, 0] }] }],
    };
    case 'sower': return humanoid({ attack: 'cast', skin: 0x9fd27a, torso: C, robe: shade(C, 0.8), accent: A, head: 'antlers', headC: C, right: 'staff', left: 'none',
      extra: [{ g: sph(0.12), c: A, p: [0.25, 0.9, -0.2], glow: true }, { g: sph(0.1), c: A, p: [-0.25, 0.85, -0.2], glow: true }, { g: sph(0.09), c: A, p: [0, 1.0, -0.28], glow: true }, ...[0, 1, 2, 3, 4].map(i => ({ g: cone(0.06, 0.25, 4), c: 0x4a8a2a, p: [Math.cos(i * 1.256) * 0.3, 0.22, Math.sin(i * 1.256) * 0.3] as V3, r: [Math.cos(i * 1.256) * 0.4, 0, -Math.sin(i * 1.256) * 0.4] as V3 }))] });
    case 'druid': return humanoid({ attack: 'cast', skin: SKIN, torso: C, robe: shade(C, 0.75), accent: A, head: 'antlers', headC: 0x5a3a22, right: 'staff', left: 'none',
      extra: [{ g: tor(0.17, 0.03), c: 0x6aa83a, p: [0, 1.06, 0], r: [Math.PI / 2, 0, 0] }, ...[0, 1, 2].map(i => ({ g: cone(0.04, 0.12, 4), c: 0x7adc6a, p: [Math.cos(i * 2.1) * 0.17, 1.09, Math.sin(i * 2.1) * 0.17] as V3 }))] });
    case 'merman': return humanoid({ attack: 'swing', skin: C, torso: shade(C, 0.8), legs: shade(C, 0.7), accent: A, head: 'fish', right: 'trident', left: 'none',
      extra: [{ g: cone(0.08, 0.35, 4), c: A, p: [0, 1.05, -0.22], r: [-1.2, 0, 0] }, { g: box(0.3, 0.16, 0.05), c: 0xe8d0a0, p: [0, 0.9, 0.17] }] });
    case 'jelly': return {
      kind: 'float', attack: 'cast', height: 1.6, hover: 0.5,
      body: [
        { g: sph(0.42, 1), c: C, p: [0, 1.1, 0], s: [1, 0.75, 1] }, { g: sph(0.25, 1), c: A, p: [0, 1.08, 0], glow: true },
        { g: cyl(0.43, 0.43, 0.06, 12), c: shade(C, 0.8), p: [0, 0.82, 0] },
        ...[0, 1, 2, 3, 4, 5].map(i => ({ g: cyl(0.025, 0.012, 0.7, 4), c: i % 2 ? A : C, p: [Math.cos(i * 1.047) * 0.28, 0.45, Math.sin(i * 1.047) * 0.28] as V3, r: [Math.sin(i * 1.047) * 0.2, 0, -Math.cos(i * 1.047) * 0.2] as V3, glow: i % 2 === 1 })),
        ...eyes(DARK, 1.0, 0.38, 0.1, 0.05),
      ],
    };
    case 'priestess': return humanoid({ attack: 'cast', skin: SKIN, torso: C, robe: C, accent: A, head: 'crown', headC: GOLD, right: 'crystalstaff', left: 'none',
      extra: [{ g: tor(0.24, 0.02), c: A, p: [0, 1.62, -0.05], r: [Math.PI / 2 - 0.3, 0, 0], glow: true }, { g: cone(0.36, 0.5, 8), c: shade(C, 0.75), p: [0, 0.95, -0.05], r: [0, 0, 0] }] });
    case 'kraken': {
      const tent = (a: number, len: number): Limb => ({ pivot: [Math.cos(a) * 0.35, 0.55, Math.sin(a) * 0.35], parts: [{ g: cyl(0.1, 0.03, len, 5), c: C, p: [0, -len / 2 + 0.05, 0], r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4] }, ...[0.25, 0.5, 0.75].map(k => ({ g: sph(0.03, 0), c: A, p: [Math.cos(a) * len * k * 0.4, -len * k, Math.sin(a) * len * k * 0.4] as V3 }))] });
      return {
        kind: 'float', attack: 'slam', height: 1.7, hover: 0.1,
        body: [{ g: sph(0.5), c: C, p: [0, 1.15, -0.05], s: [1, 1.25, 1] }, { g: cone(0.3, 0.5, 7), c: shade(C, 0.8), p: [0, 1.75, -0.1], r: [-0.3, 0, 0] }, ...eyes(0xffe060, 1.05, 0.44, 0.17, 0.09, true), { g: sph(0.06, 0), c: DARK, p: [0.17, 1.05, 0.48] }, { g: sph(0.06, 0), c: DARK, p: [-0.17, 1.05, 0.48] }],
        arms: [tent(Math.PI * 0.75, 0.9), tent(Math.PI * 0.25, 0.9)],
        legs: [tent(Math.PI * 1.2, 0.7), tent(Math.PI * 1.8, 0.7), tent(Math.PI * 1.5, 0.75), tent(Math.PI * 0.5, 0.6)],
      };
    }
    case 'duelist': return humanoid({ attack: 'dual', build: 'slim', skin: 0xd8a080, torso: C, accent: A, head: 'flame', right: 'scimitar', left: 'scimitar',
      extra: [{ g: box(0.36, 0.06, 0.3), c: GOLD, p: [0, 0.73, 0] }, { g: cone(0.28, 0.4, 7), c: shade(C, 0.8), p: [0, 0.55, 0] }] });
    case 'xbow': return humanoid({ attack: 'shoot', build: 'normal', skin: SKIN, torso: C, accent: A, head: 'helm', right: 'xbow', left: 'none',
      extra: [{ g: box(0.12, 0.4, 0.12), c: LEATHER, p: [0.16, 1.0, -0.2], r: [0.3, 0, 0] }, ...[0, 1, 2].map(i => ({ g: cone(0.02, 0.1, 4), c: A, p: [0.12 + i * 0.04, 1.24, -0.14] as V3, glow: true }))] });
    case 'elemental': return {
      kind: 'float', attack: 'cast', height: 1.9, hover: 0.3,
      body: [
        { g: sph(0.36, 1), c: C, p: [0, 1.0, 0] }, { g: sph(0.22, 1), c: A, p: [0, 1.0, 0.1], glow: true }, { g: sph(0.2, 1), c: C, p: [0, 1.48, 0] },
        ...eyes(0xffffff, 1.5, 0.18, 0.07, 0.05, true),
        ...[0, 1, 2, 3, 4].map(i => ({ g: cone(0.12, 0.45, 5), c: i % 2 ? A : L, p: [Math.cos(i * 1.256) * 0.15, 1.75, Math.sin(i * 1.256) * 0.15] as V3, r: [Math.sin(i * 1.256) * 0.3, 0, -Math.cos(i * 1.256) * 0.3] as V3, glow: true })),
        { g: cone(0.3, 0.7, 7), c: shade(C, 0.8), p: [0, 0.45, 0], r: [Math.PI, 0, 0] },
      ],
      arms: [{ pivot: [-0.38, 1.15, 0], parts: [{ g: sph(0.14, 0), c: C, p: [0, -0.15, 0] }, { g: sph(0.12, 0), c: A, p: [0, -0.38, 0.05], glow: true, w: true }] }, { pivot: [0.38, 1.15, 0], parts: [{ g: sph(0.14, 0), c: C, p: [0, -0.15, 0] }, { g: sph(0.12, 0), c: A, p: [0, -0.38, 0.05], glow: true, w: true }] }],
      orbit: [0, 1, 2].map(i => ({ g: oct(0.07), c: A, p: [Math.cos(i * 2.094) * 0.6, 1.1, Math.sin(i * 2.094) * 0.6] as V3, glow: true })),
    };
    case 'boneguard': return humanoid({ attack: 'swing', skin: BONE, torso: C, legs: BONE, accent: A, head: 'skull', eyeC: A, right: 'sword', left: 'shield',
      extra: [...[0, 1, 2].map(i => ({ g: box(0.3, 0.03, 0.05), c: BONE, p: [0, 0.82 + i * 0.09, 0.15] as V3 })), { g: box(0.42, 0.2, 0.38), c: DMETAL, p: [0, 1.06, 0] }] });
    case 'skeleton': return humanoid({ attack: 'swing', build: 'slim', skin: BONE, torso: shade(BONE, 0.8), legs: BONE, accent: A, head: 'skull', eyeC: A, right: 'sword', left: m.scale > 0.95 ? 'shield' : 'none',
      extra: [...[0, 1, 2].map(i => ({ g: box(0.26, 0.025, 0.04), c: BONE, p: [0, 0.82 + i * 0.08, 0.13] as V3 }))] });
    case 'necro': return humanoid({ attack: 'cast', skin: 0xb8b0c8, torso: D, robe: C, accent: A, head: 'hood', headC: shade(C, 0.8), eyeC: A, right: 'skullstaff', left: 'none',
      extra: [{ g: tor(0.2, 0.03), c: BONE, p: [0, 1.05, 0], r: [Math.PI / 2, 0, 0] }, ...[0, 1, 2].map(i => ({ g: sph(0.04, 0), c: BONE, p: [Math.cos(i * 2.1) * 0.2, 1.05, Math.sin(i * 2.1) * 0.2] as V3 }))] });
    case 'censer': return humanoid({ attack: 'cast', skin: 0x8a9a7a, torso: C, robe: shade(C, 0.75), accent: A, head: 'beak', headC: DARK, right: 'censer', left: 'none',
      extra: [{ g: cone(0.36, 0.5, 8), c: DARK, p: [0, 0.98, -0.05] }] });
    case 'abom': {
      const arm: Limb = { pivot: [0.5, 1.3, 0], parts: [{ g: cyl(0.15, 0.13, 0.6, 6), c: C, p: [0, -0.3, 0] }, { g: sph(0.17), c: shade(C, 0.9), p: [0, -0.66, 0] }, { g: tor(0.14, 0.035, Math.PI * 1.3), c: METAL, p: [0, -0.86, 0.14], r: [0, Math.PI / 2, 0], w: true }] };
      const leg: Limb = { pivot: [0.24, 0.6, 0], parts: [{ g: cyl(0.16, 0.14, 0.52, 6), c: shade(C, 0.85), p: [0, -0.26, 0] }, { g: box(0.28, 0.12, 0.36), c: DARK, p: [0, -0.56, 0.05] }] };
      return {
        kind: 'biped', attack: 'slam', height: 1.95,
        body: [
          { g: sph(0.55), c: C, p: [0, 1.0, 0.05], s: [1.15, 1, 0.95] }, { g: sph(0.3), c: shade(C, 0.9), p: [0.2, 1.4, -0.1] },
          { g: sph(0.2), c: shade(C, 1.1), p: [-0.1, 1.62, 0.15] }, ...eyes(A, 1.65, 0.33, 0.07, 0.05, true),
          ...[0, 1, 2, 3].map(i => ({ g: box(0.02, 0.24, 0.02), c: DARK, p: [-0.3 + i * 0.2, 1.0, 0.56] as V3, r: [0, 0, 0.4] as V3 })),
          { g: box(0.9, 0.16, 0.66), c: LEATHER, p: [0, 0.66, 0] }, { g: cyl(0.06, 0.06, 0.4, 5), c: DMETAL, p: [-0.2, 1.4, -0.4], r: [0.6, 0, 0] },
        ],
        arms: [mirror(arm), arm], legs: [mirror(leg), leg],
      };
    }
    case 'wolf': {
      const leg = (x: number, z: number): Limb => ({ pivot: [x, 0.5, z], parts: [{ g: cyl(0.06, 0.045, 0.46, 5), c: D, p: [0, -0.23, 0] }, { g: box(0.09, 0.05, 0.14), c: DARK, p: [0, -0.47, 0.03] }] });
      return {
        kind: 'quad', attack: 'swing', height: 1.0,
        body: [
          { g: sph(0.3), c: C, p: [0, 0.62, -0.05], s: [0.8, 0.8, 1.6] }, { g: sph(0.24), c: L, p: [0, 0.72, 0.35], s: [1, 0.95, 1] },
          { g: box(0.18, 0.16, 0.3), c: C, p: [0, 0.78, 0.6] }, { g: box(0.15, 0.08, 0.24), c: L, p: [0, 0.7, 0.7] },
          ...eyes(A, 0.84, 0.73, 0.06, 0.04, true), { g: cone(0.05, 0.14, 4), c: C, p: [0.08, 0.98, 0.5] }, { g: cone(0.05, 0.14, 4), c: C, p: [-0.08, 0.98, 0.5] },
          { g: cone(0.08, 0.5, 5), c: L, p: [0, 0.75, -0.6], r: [-2.2, 0, 0] }, { g: sph(0.06, 0), c: A, p: [0, 0.95, -0.8], glow: true },
          ...[0, 1, 2].map(i => ({ g: cone(0.04, 0.14, 4), c: A, p: [0, 0.88, 0.1 - i * 0.18] as V3, r: [-0.4, 0, 0] as V3 })),
        ],
        legs: [leg(-0.14, 0.3), leg(0.14, 0.3), leg(-0.14, -0.3), leg(0.14, -0.3)],
      };
    }

    // ======================= ENEMIES =======================
    case 'crawler': return humanoid({ attack: 'swing', build: 'small', skin: GOBLIN, torso: C, legs: shade(C, 0.7), accent: A, head: 'goblin', headC: C, right: 'dagger', left: 'none', eyeC: 0xffe040 });
    case 'gunner': return humanoid({ attack: 'shoot', build: 'small', skin: GOBLIN, torso: C, accent: A, head: 'goblin', headC: shade(C, 0.8), right: 'xbow', left: 'none', eyeC: 0xffe040,
      extra: [{ g: box(0.1, 0.3, 0.1), c: LEATHER, p: [0.12, 0.7, -0.16], r: [0.3, 0, 0] }] });
    case 'caster': return humanoid({ attack: 'cast', build: 'small', skin: GOBLIN, torso: C, robe: C, accent: A, head: 'goblin', headC: shade(C, 0.8), right: 'skullstaff', left: 'none', eyeC: A,
      extra: [{ g: tor(0.14, 0.025), c: BONE, p: [0, 0.82, 0], r: [Math.PI / 2, 0, 0] }] });
    case 'sapper': return humanoid({ attack: 'swing', build: 'small', skin: GOBLIN, torso: C, accent: A, head: 'goblin', headC: 0x8a2a1a, right: 'none', left: 'none', eyeC: 0xffe040,
      extra: [{ g: cyl(0.22, 0.22, 0.42, 10), c: 0x6a4a2a, p: [0, 0.72, -0.28] }, { g: tor(0.22, 0.025), c: DMETAL, p: [0, 0.6, -0.28], r: [Math.PI / 2, 0, 0] }, { g: tor(0.22, 0.025), c: DMETAL, p: [0, 0.84, -0.28], r: [Math.PI / 2, 0, 0] }, { g: cyl(0.015, 0.015, 0.2, 3), c: DARK, p: [0, 1.0, -0.28] }, { g: sph(0.05, 0), c: 0xffd040, p: [0, 1.12, -0.28], glow: true }] });
    case 'armored': return humanoid({ attack: 'swing', build: 'bulky', skin: ORC, torso: C, legs: DMETAL, accent: A, head: 'orc', right: 'axe', left: 'shield', eyeC: A,
      extra: [{ g: box(0.7, 0.4, 0.45), c: DMETAL, p: [0, 1.08, 0] }, { g: box(0.2, 0.2, 0.05), c: A, p: [0, 1.1, 0.24] }, { g: sph(0.16, 0), c: DMETAL, p: [0.42, 1.28, 0] }, { g: sph(0.16, 0), c: DMETAL, p: [-0.42, 1.28, 0] }, { g: cone(0.05, 0.18, 4), c: BONE, p: [0.42, 1.44, 0] }, { g: cone(0.05, 0.18, 4), c: BONE, p: [-0.42, 1.44, 0] }] });
    case 'champion': return humanoid({ attack: 'slam', build: 'bulky', skin: ORC, torso: C, legs: DMETAL, accent: A, head: 'horned', right: 'axe', left: 'tower', eyeC: A,
      extra: [{ g: box(0.74, 0.44, 0.46), c: shade(C, 0.8), p: [0, 1.08, 0] }, { g: oct(0.12), c: A, p: [0, 1.12, 0.26], glow: true }, { g: box(0.7, 1.0, 0.04), c: A, p: [0, 0.85, -0.3] }, { g: sph(0.18, 0), c: GOLD, p: [0.44, 1.3, 0] }, { g: sph(0.18, 0), c: GOLD, p: [-0.44, 1.3, 0] }] });
    case 'shaman': return humanoid({ attack: 'cast', build: 'normal', skin: ORC, torso: C, robe: shade(C, 0.8), accent: A, head: 'orc', right: 'totem', left: 'none', eyeC: A,
      extra: [...[0, 1, 2, 3].map(i => ({ g: cone(0.04, 0.16, 4), c: 0xe0d0a0, p: [Math.cos(i * 1.57) * 0.2, 1.08, Math.sin(i * 1.57) * 0.2] as V3, r: [Math.PI, 0, 0] as V3 })), { g: tor(0.2, 0.03), c: 0x8a5a2a, p: [0, 1.08, 0], r: [Math.PI / 2, 0, 0] }] });
    case 'brute': return humanoid({ attack: 'slam', build: 'bulky', skin: m.color === 0x7a2a1a ? OGRE : mix(OGRE, C, 0.5), torso: mix(OGRE, C, 0.3), legs: LEATHER, accent: A, head: 'ogre', right: 'club', left: 'none',
      extra: [{ g: sph(0.48), c: mix(OGRE, C, 0.3), p: [0, 0.95, 0.12], s: [1.1, 1, 0.9] }, { g: box(0.84, 0.18, 0.66), c: LEATHER, p: [0, 0.68, 0] }, { g: box(0.2, 0.1, 0.05), c: GOLD, p: [0, 0.68, 0.34] }, { g: sph(0.12, 0), c: A, p: [0.35, 1.3, 0.1], glow: true }] });
    case 'ghost': return humanoid({ attack: 'swing', build: 'slim', skin: BONE, torso: shade(C, 0.8), legs: BONE, accent: A, head: 'skull', eyeC: A, right: 'sword', left: 'shield', hover: 0.15, float: true,
      extra: [{ g: cone(0.3, 0.7, 7), c: C, p: [0, 0.35, 0], r: [Math.PI, 0, 0] }, { g: tor(0.22, 0.03), c: A, p: [0, 0.9, 0], r: [Math.PI / 2, 0, 0], glow: true }] });
    case 'fly': {
      const wing = (side: number): Limb & { side: number } => ({ pivot: [side * 0.08, 0.32, 0], side: -side, parts: [
        { g: box(0.42, 0.012, 0.3), c: shade(C, 0.8), p: [side * 0.24, 0, -0.02] }, { g: cyl(0.012, 0.012, 0.44, 3), c: D, p: [side * 0.24, 0.01, 0.12], r: [0, 0, Math.PI / 2] },
        { g: cone(0.06, 0.18, 3), c: shade(C, 0.8), p: [side * 0.45, 0, -0.1], r: [Math.PI / 2, 0, side * 0.6] }] });
      return {
        kind: 'fly', attack: 'swing', height: 0.6, hover: 0.75,
        body: [
          { g: sph(0.17), c: C, p: [0, 0.3, 0], s: [1, 1, 1.1] }, { g: sph(0.12), c: C, p: [0, 0.42, 0.14] },
          ...eyes(0xff3a3a, 0.45, 0.25, 0.05, 0.04, true), { g: cone(0.035, 0.12, 4), c: C, p: [0.06, 0.58, 0.12] }, { g: cone(0.035, 0.12, 4), c: C, p: [-0.06, 0.58, 0.12] },
          { g: cone(0.02, 0.06, 3), c: 0xffffff, p: [0.03, 0.35, 0.25], r: [Math.PI, 0, 0] }, { g: cone(0.02, 0.06, 3), c: 0xffffff, p: [-0.03, 0.35, 0.25], r: [Math.PI, 0, 0] },
        ],
        wings: [wing(1), wing(-1)],
      };
    }
    case 'runner': {
      // dire wolf of the horde
      const leg = (x: number, z: number): Limb => ({ pivot: [x, 0.52, z], parts: [{ g: cyl(0.07, 0.05, 0.48, 5), c: D, p: [0, -0.24, 0] }, { g: box(0.1, 0.05, 0.15), c: DARK, p: [0, -0.49, 0.03] }] });
      return {
        kind: 'quad', attack: 'swing', height: 1.05,
        body: [
          { g: sph(0.32), c: C, p: [0, 0.64, -0.05], s: [0.85, 0.85, 1.6] }, { g: sph(0.26), c: D, p: [0, 0.76, 0.35] },
          { g: box(0.2, 0.17, 0.32), c: C, p: [0, 0.8, 0.62] }, ...eyes(A, 0.88, 0.76, 0.07, 0.04, true),
          { g: cone(0.06, 0.16, 4), c: D, p: [0.09, 1.02, 0.52] }, { g: cone(0.06, 0.16, 4), c: D, p: [-0.09, 1.02, 0.52] },
          ...[0, 1, 2, 3].map(i => ({ g: cone(0.045, 0.16, 4), c: A, p: [0, 0.92, 0.25 - i * 0.18] as V3, r: [-0.5, 0, 0] as V3 })),
          { g: cone(0.08, 0.5, 5), c: D, p: [0, 0.7, -0.62], r: [-2.0, 0, 0] }, { g: cone(0.02, 0.07, 3), c: 0xffffff, p: [0.05, 0.72, 0.78], r: [Math.PI, 0, 0] }, { g: cone(0.02, 0.07, 3), c: 0xffffff, p: [-0.05, 0.72, 0.78], r: [Math.PI, 0, 0] },
        ],
        legs: [leg(-0.15, 0.3), leg(0.15, 0.3), leg(-0.15, -0.3), leg(0.15, -0.3)],
      };
    }
    case 'blob': return {
      kind: 'static', attack: 'slam', height: 1.0,
      body: [{ g: sph(0.45, 1), c: C, p: [0, 0.42, 0], s: [1.15, 0.9, 1.1] }, { g: sph(0.22, 1), c: A, p: [0.1, 0.5, 0.2], glow: true }, { g: sph(0.12), c: shade(C, 1.2), p: [-0.25, 0.7, 0.1] }, ...eyes(0xffffff, 0.62, 0.42, 0.12, 0.08), { g: box(0.08, 0.08, 0.02), c: DARK, p: [0.12, 0.62, 0.43] }, { g: box(0.08, 0.08, 0.02), c: DARK, p: [-0.12, 0.62, 0.43] }],
    };
    case 'boss': {
      // lava golem / colossus of the rift
      const arm: Part[] = [{ g: cyl(0.2, 0.17, 0.6, 6), c: C, p: [0, -0.3, 0] }, { g: box(0.4, 0.38, 0.4), c: D, p: [0, -0.74, 0], w: true }, { g: oct(0.08), c: A, p: [0, -0.74, 0.21], glow: true }, { g: cone(0.06, 0.18, 4), c: D, p: [0, -0.5, 0.22], r: [Math.PI / 2, 0, 0] }];
      const leg: Limb = { pivot: [0.28, 0.66, 0], parts: [{ g: cyl(0.2, 0.18, 0.54, 6), c: D, p: [0, -0.27, 0] }, { g: box(0.36, 0.14, 0.46), c: DARK, p: [0, -0.59, 0.05] }] };
      return {
        kind: 'biped', attack: 'slam', height: 2.3,
        body: [
          { g: sph(0.55, 0), c: C, p: [0, 1.05, 0], s: [1.15, 1, 0.9] }, { g: box(1.0, 0.55, 0.65), c: D, p: [0, 1.45, 0] },
          { g: oct(0.2), c: A, p: [0, 1.4, 0.34], glow: true }, ...[0, 1, 2, 3].map(i => ({ g: box(0.03, 0.3, 0.03), c: A, p: [-0.35 + i * 0.23, 1.0, 0.5] as V3, r: [0, 0, 0.5 * (i % 2 ? 1 : -1)] as V3, glow: true })),
          { g: box(0.38, 0.34, 0.36), c: D, p: [0, 1.9, 0.1] }, ...eyes(A, 1.92, 0.29, 0.08, 0.06, true),
          { g: cone(0.07, 0.36, 5), c: A, p: [0.14, 2.15, 0.05], r: [0, 0, -0.3] }, { g: cone(0.07, 0.36, 5), c: A, p: [-0.14, 2.15, 0.05], r: [0, 0, 0.3] },
          { g: sph(0.28, 0), c: D, p: [0.62, 1.72, 0] }, { g: sph(0.28, 0), c: D, p: [-0.62, 1.72, 0] },
          { g: cone(0.08, 0.34, 4), c: A, p: [0.68, 1.98, 0], glow: true }, { g: cone(0.08, 0.34, 4), c: A, p: [-0.68, 1.98, 0], glow: true },
          { g: box(1.0, 0.2, 0.7), c: DARK, p: [0, 0.74, 0] },
        ],
        arms: [{ pivot: [-0.66, 1.58, 0], parts: arm }, { pivot: [0.66, 1.58, 0], parts: arm }],
        legs: [mirror(leg), leg],
      };
    }
    default:
      return { kind: 'float', attack: 'cast', height: 1, body: [{ g: oct(0.5), c: C, p: [0, 0.6, 0] }] };
  }
}

export { THREE };
