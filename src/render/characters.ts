// Articulated low-poly 3D characters ("bonhommes"), built from primitives — 100 % original.
// Each character = a few meshes (body, arms, legs, wings, orbit) so it can walk, strike, shoot and cast.
// Every part is one merged, vertex-coloured geometry → ~5 draw calls per character.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelDef } from '../data/types';

type V3 = [number, number, number];
export interface Part { g: THREE.BufferGeometry; c: number; p?: V3; r?: V3; s?: V3 }

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const sph = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
export const cyl = (rt: number, rb: number, h: number, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
export const cone = (r: number, h: number, s = 7) => new THREE.ConeGeometry(r, h, s);
export const oct = (r: number) => new THREE.OctahedronGeometry(r, 0);
export const tor = (R: number, t: number, arc = Math.PI * 2) => new THREE.TorusGeometry(R, t, 5, 16, arc);

export function shade(c: number, k: number) { return new THREE.Color(c).multiplyScalar(k).getHex(); }

/** Merge coloured parts into one flat-shaded geometry (keeps uv only if every part has one and keepUv). */
export function mergeParts(parts: Part[], keepUv = false): THREE.BufferGeometry {
  const col = new THREE.Color();
  const geos = parts.map(p => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    if (!keepUv && g.attributes.uv) g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p.p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.r ?? [0, 0, 0]))),
      new THREE.Vector3(...(p.s ?? [1, 1, 1])),
    );
    g.applyMatrix4(m);
    col.setHex(p.c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------- rig definitions

type Kind = 'biped' | 'quad' | 'float' | 'fly' | 'robe';
type Attack = 'swing' | 'dual' | 'shoot' | 'cast' | 'slam';
interface Limb { pivot: V3; parts: Part[] }
interface RigDef {
  kind: Kind;
  attack: Attack;
  height: number;
  hover?: number;
  body: Part[];
  arms?: Limb[]; // [left, right]
  legs?: Limb[];
  wings?: (Limb & { side: number })[];
  orbit?: Part[];
}

const SKIN = 0xe8c4a0, BONE = 0xeadfc0, METAL = 0xb8c0cc, DMETAL = 0x4a4e58, WOOD = 0x7a5232, LEATHER = 0x5a3a22, GOLD = 0xe0b040, DARK = 0x1a1424;
const eyes = (c: number, y: number, z: number, dx = 0.05, w = 0.03): Part[] => [
  { g: box(w, w, 0.02), c, p: [-dx, y, z] }, { g: box(w, w, 0.02), c, p: [dx, y, z] },
];
const mirror = (l: Limb): Limb => ({ pivot: [-l.pivot[0], l.pivot[1], l.pivot[2]], parts: l.parts.map(p => ({ ...p, p: p.p ? [-p.p[0], p.p[1], p.p[2]] as V3 : undefined, r: p.r ? [p.r[0], -p.r[1], -p.r[2]] as V3 : undefined })) });

/** Half-ring bow in an arm's local frame: limbs along local z, bulging toward local -y (forward when the arm is raised). */
function bowGeo(R: number, t: number) {
  const g = tor(R, t, Math.PI);
  g.rotateY(-Math.PI / 2);
  g.rotateZ(Math.PI);
  return g;
}

function defFor(m: ModelDef): RigDef {
  const C = m.color, A = m.accent, D = shade(m.color, 0.6), L = shade(m.color, 1.25);
  switch (m.shape) {
    // ======================= DEFENDERS =======================
    case 'golem': { // Sentinelle Ferraille — scrap golem with a shield
      const arm: Limb = { pivot: [0.47, 1.02, 0], parts: [{ g: box(0.2, 0.42, 0.22), c: C, p: [0, -0.22, 0] }, { g: box(0.27, 0.25, 0.27), c: D, p: [0, -0.52, 0] }] };
      const left = mirror(arm);
      left.parts.push({ g: box(0.08, 0.56, 0.46), c: D, p: [-0.15, -0.4, 0.06] }, { g: box(0.03, 0.34, 0.28), c: A, p: [-0.2, -0.4, 0.06] });
      const leg: Limb = { pivot: [0.18, 0.56, 0], parts: [{ g: box(0.22, 0.42, 0.24), c: D, p: [0, -0.2, 0] }, { g: box(0.27, 0.12, 0.36), c: DMETAL, p: [0, -0.5, 0.05] }] };
      return {
        kind: 'biped', attack: 'swing', height: 1.72,
        body: [
          { g: box(0.72, 0.56, 0.5), c: C, p: [0, 0.86, 0] },
          { g: box(0.5, 0.3, 0.06), c: D, p: [0, 0.9, 0.26] },
          { g: box(0.13, 0.13, 0.04), c: A, p: [0, 0.92, 0.3] },
          { g: box(0.64, 0.12, 0.46), c: DMETAL, p: [0, 0.56, 0] },
          { g: box(0.36, 0.3, 0.34), c: C, p: [0, 1.3, 0] },
          { g: box(0.26, 0.07, 0.04), c: A, p: [0, 1.32, 0.18] },
          { g: cyl(0.02, 0.02, 0.22, 4), c: DMETAL, p: [0.1, 1.55, 0] },
          { g: sph(0.045, 0), c: A, p: [0.1, 1.68, 0] },
          { g: box(0.3, 0.14, 0.38), c: D, p: [-0.47, 1.13, 0] },
          { g: box(0.3, 0.14, 0.38), c: D, p: [0.47, 1.13, 0] },
        ],
        arms: [left, arm], legs: [mirror(leg), leg],
      };
    }
    case 'blade': { // Lame-Ronce — plant duelist with two blades
      const skin = 0x9fd27a;
      const arm: Limb = { pivot: [0.24, 1.04, 0], parts: [
        { g: cyl(0.05, 0.045, 0.38), c: C, p: [0, -0.19, 0] }, { g: sph(0.06, 0), c: skin, p: [0, -0.41, 0] },
        { g: box(0.16, 0.04, 0.05), c: GOLD, p: [0, -0.44, 0.06] }, { g: box(0.045, 0.07, 0.62), c: 0xdaf7c8, p: [0, -0.44, 0.38] },
      ] };
      const leg: Limb = { pivot: [0.09, 0.62, 0], parts: [{ g: cyl(0.06, 0.05, 0.52), c: D, p: [0, -0.26, 0] }, { g: box(0.12, 0.08, 0.2), c: LEATHER, p: [0, -0.58, 0.04] }] };
      return {
        kind: 'biped', attack: 'dual', height: 1.55,
        body: [
          { g: cyl(0.17, 0.21, 0.46), c: C, p: [0, 0.88, 0] },
          { g: cone(0.3, 0.32, 6), c: D, p: [0, 0.6, 0] },
          { g: sph(0.16), c: skin, p: [0, 1.26, 0] },
          ...eyes(DARK, 1.28, 0.145, 0.055),
          { g: cone(0.05, 0.24, 4), c: A, p: [0, 1.46, -0.02] },
          { g: cone(0.05, 0.22, 4), c: A, p: [0.1, 1.42, 0], r: [0, 0, -0.5] },
          { g: cone(0.05, 0.22, 4), c: A, p: [-0.1, 1.42, 0], r: [0, 0, 0.5] },
          { g: cone(0.06, 0.2, 4), c: A, p: [0.25, 1.1, 0], r: [0, 0, -1.2] },
          { g: cone(0.06, 0.2, 4), c: A, p: [-0.25, 1.1, 0], r: [0, 0, 1.2] },
        ],
        arms: [mirror(arm), arm], legs: [mirror(leg), leg],
      };
    }
    case 'archer': { // Tireuse d'Étoiles — hooded star archer
      const hand: Part[] = [{ g: cyl(0.05, 0.045, 0.38), c: C, p: [0, -0.19, 0] }, { g: sph(0.055, 0), c: SKIN, p: [0, -0.41, 0] }];
      const left: Limb = { pivot: [-0.24, 1.04, 0], parts: [...hand, { g: bowGeo(0.34, 0.028), c: WOOD, p: [0, -0.42, 0.04] }, { g: cyl(0.006, 0.006, 0.68, 3), c: 0xf4f4f4, p: [0, -0.42, 0.04], r: [Math.PI / 2, 0, 0] }, { g: oct(0.05), c: A, p: [0, -0.76, 0.04] }] };
      const right: Limb = { pivot: [0.24, 1.04, 0], parts: [...hand] };
      const leg: Limb = { pivot: [0.09, 0.6, 0], parts: [{ g: cyl(0.06, 0.05, 0.5), c: D, p: [0, -0.25, 0] }, { g: box(0.12, 0.1, 0.2), c: LEATHER, p: [0, -0.55, 0.04] }] };
      return {
        kind: 'biped', attack: 'shoot', height: 1.6,
        body: [
          { g: cyl(0.17, 0.22, 0.48), c: C, p: [0, 0.86, 0] },
          { g: cone(0.3, 0.5, 7), c: D, p: [0, 0.66, -0.03] },
          { g: box(0.4, 0.06, 0.3), c: LEATHER, p: [0, 0.64, 0] },
          { g: sph(0.14), c: SKIN, p: [0, 1.25, 0] },
          ...eyes(DARK, 1.26, 0.13),
          { g: sph(0.155), c: C, p: [0, 1.28, -0.04], s: [1, 1, 0.9] },
          { g: cone(0.19, 0.34, 7), c: C, p: [0, 1.42, -0.02] },
          { g: cyl(0.06, 0.06, 0.42), c: WOOD, p: [0.13, 1.0, -0.2], r: [0.35, 0, 0] },
          { g: oct(0.05), c: A, p: [0.13, 1.24, -0.12] },
          { g: oct(0.04), c: A, p: [0.08, 1.22, -0.14] },
        ],
        arms: [left, right], legs: [mirror(leg), leg],
      };
    }
    case 'turtle': { // Carapace des Abysses — spiked shell colossus (quadruped)
      const leg = (x: number, z: number): Limb => ({ pivot: [x, 0.44, z], parts: [{ g: cyl(0.13, 0.12, 0.34), c: D, p: [0, -0.17, 0] }, { g: sph(0.14, 0), c: D, p: [0, -0.38, 0.04], s: [1, 0.6, 1.2] }] });
      return {
        kind: 'quad', attack: 'slam', height: 1.15,
        body: [
          { g: sph(0.56), c: C, p: [0, 0.66, -0.02], s: [1, 0.62, 1.12] },
          { g: cyl(0.6, 0.64, 0.14, 9), c: D, p: [0, 0.42, 0], s: [1, 1, 1.08] },
          { g: cone(0.08, 0.3, 5), c: A, p: [0, 1.05, 0] },
          { g: cone(0.07, 0.24, 5), c: A, p: [0.27, 0.95, -0.2] },
          { g: cone(0.07, 0.24, 5), c: A, p: [-0.27, 0.95, -0.2] },
          { g: cone(0.07, 0.24, 5), c: A, p: [0.25, 0.95, 0.24] },
          { g: cone(0.07, 0.24, 5), c: A, p: [-0.25, 0.95, 0.24] },
          { g: sph(0.22), c: D, p: [0, 0.58, 0.66] },
          ...eyes(A, 0.65, 0.84, 0.09, 0.05),
          { g: box(0.2, 0.04, 0.12), c: 0x0e3a40, p: [0, 0.5, 0.82] },
          { g: cone(0.06, 0.25, 4), c: D, p: [0, 0.45, -0.68], r: [-1.7, 0, 0] },
        ],
        legs: [leg(-0.36, 0.3), leg(0.36, 0.3), leg(-0.36, -0.3), leg(0.36, -0.3)],
      };
    }
    case 'mage': { // Oracle de Braise — robed fire oracle with a staff
      const sleeve: Part[] = [{ g: cyl(0.06, 0.1, 0.38), c: C, p: [0, -0.19, 0] }, { g: sph(0.05, 0), c: SKIN, p: [0, -0.41, 0] }];
      const right: Limb = { pivot: [0.22, 1.08, 0], parts: [...sleeve, { g: cyl(0.025, 0.025, 1.2, 5), c: WOOD, p: [0, -0.42, 0.06] }, { g: sph(0.12), c: A, p: [0, 0.25, 0.06] }, { g: cone(0.07, 0.2, 5), c: 0xffe08a, p: [0, 0.42, 0.06] }] };
      return {
        kind: 'robe', attack: 'cast', height: 1.9,
        body: [
          { g: cone(0.36, 0.95, 8), c: C, p: [0, 0.475, 0] },
          { g: cyl(0.37, 0.37, 0.06, 8), c: GOLD, p: [0, 0.03, 0] },
          { g: cyl(0.15, 0.19, 0.32), c: D, p: [0, 1.0, 0] },
          { g: sph(0.15), c: SKIN, p: [0, 1.27, 0] },
          ...eyes(DARK, 1.28, 0.14),
          { g: cone(0.07, 0.18, 5), c: 0xf0e8e0, p: [0, 1.15, 0.12], r: [Math.PI, 0, 0] },
          { g: cyl(0.27, 0.27, 0.03, 10), c: D, p: [0, 1.36, 0] },
          { g: cone(0.19, 0.44, 8), c: D, p: [0.02, 1.6, 0], r: [0, 0, 0.15] },
          { g: sph(0.05, 0), c: A, p: [0.06, 1.84, 0] },
        ],
        arms: [{ pivot: [-0.22, 1.08, 0], parts: sleeve }, right],
      };
    }
    case 'bard': { // Harmoniste Astral — robed singer with a lyre and a halo
      const sleeve: Part[] = [{ g: cyl(0.055, 0.09, 0.36), c: C, p: [0, -0.18, 0] }, { g: sph(0.05, 0), c: SKIN, p: [0, -0.39, 0] }];
      const left: Limb = { pivot: [-0.21, 1.04, 0], parts: [...sleeve,
        { g: cyl(0.02, 0.02, 0.32, 4), c: GOLD, p: [-0.07, -0.6, 0.1], r: [0, 0, 0.25] },
        { g: cyl(0.02, 0.02, 0.32, 4), c: GOLD, p: [0.07, -0.6, 0.1], r: [0, 0, -0.25] },
        { g: box(0.22, 0.03, 0.03), c: GOLD, p: [0, -0.45, 0.1] },
        { g: box(0.1, 0.24, 0.006), c: 0xffffff, p: [0, -0.6, 0.1] }] };
      return {
        kind: 'robe', attack: 'cast', height: 1.65,
        body: [
          { g: cone(0.32, 0.88, 8), c: C, p: [0, 0.44, 0] },
          { g: cyl(0.33, 0.33, 0.05, 8), c: 0xfff6c0, p: [0, 0.03, 0] },
          { g: cyl(0.14, 0.18, 0.3), c: L, p: [0, 0.95, 0] },
          { g: tor(0.15, 0.03), c: A, p: [0, 1.08, 0], r: [Math.PI / 2, 0, 0] },
          { g: sph(0.14), c: SKIN, p: [0, 1.2, 0] },
          ...eyes(DARK, 1.21, 0.13),
          { g: sph(0.15), c: GOLD, p: [0, 1.25, -0.04], s: [1, 0.92, 1] },
          { g: tor(0.2, 0.025), c: A, p: [0, 1.5, 0], r: [Math.PI / 2, 0, 0] },
        ],
        orbit: [
          { g: oct(0.055), c: A, p: [0.45, 0.95, 0] },
          { g: oct(0.055), c: A, p: [-0.22, 1.02, 0.39] },
          { g: oct(0.055), c: A, p: [-0.22, 0.9, -0.39] },
        ],
        arms: [left, { pivot: [0.21, 1.04, 0], parts: sleeve }],
      };
    }
    case 'shade': { // Spectre Vif — floating hooded assassin
      const arm: Limb = { pivot: [0.25, 1.08, 0], parts: [
        { g: cyl(0.045, 0.04, 0.38), c: D, p: [0, -0.19, 0] }, { g: sph(0.05, 0), c: DARK, p: [0, -0.4, 0] },
        { g: box(0.12, 0.03, 0.04), c: D, p: [0, -0.42, 0.04] }, { g: box(0.035, 0.05, 0.34), c: A, p: [0, -0.42, 0.22] }] };
      return {
        kind: 'float', attack: 'dual', height: 1.6, hover: 0.22,
        body: [
          { g: cone(0.3, 0.8, 7), c: C, p: [0, 0.55, 0], r: [Math.PI, 0, 0] },
          { g: cyl(0.17, 0.25, 0.36), c: D, p: [0, 0.98, 0] },
          { g: cone(0.21, 0.42, 7), c: C, p: [0, 1.36, 0] },
          { g: sph(0.13), c: DARK, p: [0, 1.24, 0.04] },
          { g: box(0.05, 0.025, 0.02), c: A, p: [-0.05, 1.25, 0.16] }, { g: box(0.05, 0.025, 0.02), c: A, p: [0.05, 1.25, 0.16] },
          { g: cone(0.06, 0.24, 4), c: C, p: [0.25, 1.13, 0], r: [0, 0, -1.1] },
          { g: cone(0.06, 0.24, 4), c: C, p: [-0.25, 1.13, 0], r: [0, 0, 1.1] },
          { g: cone(0.08, 0.3, 4), c: C, p: [0.18, 0.28, 0.05], r: [Math.PI, 0, 0] },
          { g: cone(0.08, 0.3, 4), c: C, p: [-0.18, 0.28, 0.05], r: [Math.PI, 0, 0] },
          { g: cone(0.08, 0.3, 4), c: C, p: [0, 0.24, -0.18], r: [Math.PI, 0, 0] },
        ],
        arms: [mirror(arm), arm],
      };
    }
    case 'prism': // Exarque Prisme — floating crystal construct with orbiting shards
      return {
        kind: 'float', attack: 'cast', height: 1.95, hover: 0.15,
        body: [
          { g: tor(0.42, 0.05), c: D, p: [0, 0.28, 0], r: [Math.PI / 2, 0, 0] },
          { g: oct(0.42), c: C, p: [0, 1.05, 0], s: [0.8, 1.4, 0.8] },
          { g: tor(0.33, 0.035), c: A, p: [0, 1.05, 0], r: [Math.PI / 2, 0, 0] },
          { g: oct(0.12), c: A, p: [0, 1.8, 0] },
        ],
        orbit: [
          { g: oct(0.13), c: A, p: [0.68, 1.15, 0], s: [0.7, 1.4, 0.7] },
          { g: oct(0.13), c: A, p: [-0.34, 1.15, 0.59], s: [0.7, 1.4, 0.7] },
          { g: oct(0.13), c: A, p: [-0.34, 1.15, -0.59], s: [0.7, 1.4, 0.7] },
        ],
      };

    // ======================= DISSONANTS (enemies) =======================
    case 'crawler': { // Rampelin — hunched horned imp
      const arm: Limb = { pivot: [0.22, 0.68, 0.05], parts: [{ g: cyl(0.045, 0.04, 0.3), c: C, p: [0, -0.15, 0] }, { g: cone(0.05, 0.12, 4), c: BONE, p: [0, -0.36, 0.02], r: [Math.PI, 0, 0] }] };
      const leg: Limb = { pivot: [0.1, 0.36, 0], parts: [{ g: cyl(0.06, 0.05, 0.3), c: C, p: [0, -0.15, 0] }, { g: box(0.1, 0.06, 0.16), c: D, p: [0, -0.33, 0.03] }] };
      return {
        kind: 'biped', attack: 'swing', height: 1.15,
        body: [
          { g: sph(0.25), c: C, p: [0, 0.56, 0], s: [1, 0.9, 0.9] },
          { g: sph(0.21), c: C, p: [0, 0.84, 0.12] },
          ...eyes(A, 0.87, 0.3, 0.075, 0.05),
          { g: box(0.14, 0.03, 0.03), c: DARK, p: [0, 0.77, 0.3] },
          { g: cone(0.045, 0.2, 5), c: BONE, p: [0.1, 1.03, 0.06], r: [0, 0, -0.45] },
          { g: cone(0.045, 0.2, 5), c: BONE, p: [-0.1, 1.03, 0.06], r: [0, 0, 0.45] },
          { g: cone(0.05, 0.18, 4), c: D, p: [0.21, 0.88, 0.08], r: [0, 0, -1.4] },
          { g: cone(0.05, 0.18, 4), c: D, p: [-0.21, 0.88, 0.08], r: [0, 0, 1.4] },
          { g: box(0.3, 0.14, 0.28), c: LEATHER, p: [0, 0.38, 0] },
          { g: cone(0.04, 0.14, 4), c: A, p: [0, 0.76, -0.2], r: [-0.6, 0, 0] },
        ],
        arms: [mirror(arm), arm], legs: [mirror(leg), leg],
      };
    }
    case 'fly': // Moucheron d'Essaim — buzzing insect
      return {
        kind: 'fly', attack: 'swing', height: 0.55, hover: 0.65,
        body: [
          { g: sph(0.18), c: C, p: [0, 0.25, 0], s: [1, 0.85, 1.25] },
          { g: sph(0.14), c: D, p: [0, 0.2, -0.28], s: [1, 1, 1.3] },
          { g: sph(0.1), c: D, p: [0, 0.3, 0.24] },
          { g: sph(0.05, 0), c: A, p: [0.06, 0.33, 0.3] }, { g: sph(0.05, 0), c: A, p: [-0.06, 0.33, 0.3] },
          { g: cone(0.04, 0.16, 4), c: DARK, p: [0, 0.18, -0.5], r: [-Math.PI / 2, 0, 0] },
        ],
        wings: [
          { pivot: [0.06, 0.4, 0], side: -1, parts: [{ g: box(0.3, 0.01, 0.16), c: 0xc8d8c0, p: [0.15, 0, -0.04] }] },
          { pivot: [-0.06, 0.4, 0], side: 1, parts: [{ g: box(0.3, 0.01, 0.16), c: 0xc8d8c0, p: [-0.15, 0, -0.04] }] },
        ],
      };
    case 'runner': { // Coureur Fêlé — raptor-like sprinter
      const leg: Limb = { pivot: [0.13, 0.62, -0.04], parts: [
        { g: cyl(0.09, 0.06, 0.32), c: C, p: [0, -0.16, 0] }, { g: cyl(0.05, 0.04, 0.3), c: D, p: [0, -0.44, -0.04] }, { g: box(0.1, 0.05, 0.2), c: D, p: [0, -0.6, 0.05] }] };
      const arm: Limb = { pivot: [0.13, 0.78, 0.22], parts: [{ g: cyl(0.03, 0.025, 0.16, 5), c: C, p: [0, -0.08, 0] }, { g: cone(0.03, 0.08, 4), c: BONE, p: [0, -0.2, 0.02], r: [Math.PI, 0, 0] }] };
      return {
        kind: 'biped', attack: 'swing', height: 1.15,
        body: [
          { g: sph(0.25), c: C, p: [0, 0.72, 0], s: [0.8, 0.8, 1.45] },
          { g: box(0.17, 0.17, 0.32), c: C, p: [0, 0.98, 0.4] },
          { g: box(0.15, 0.06, 0.28), c: D, p: [0, 0.88, 0.44] },
          ...eyes(A, 1.02, 0.56, 0.07, 0.04),
          { g: cone(0.12, 0.65, 6), c: C, p: [0, 0.75, -0.62], r: [-Math.PI / 2, 0, 0] },
          { g: cone(0.04, 0.16, 4), c: A, p: [0, 1.1, 0.34] },
          { g: cone(0.04, 0.14, 4), c: A, p: [0, 1.06, 0.22] },
        ],
        arms: [mirror(arm), arm], legs: [mirror(leg), leg],
      };
    }
    case 'armored': { // Cuirassé de Basalte — shield & mace
      const upper: Part[] = [{ g: box(0.18, 0.42, 0.2), c: C, p: [0, -0.21, 0] }, { g: box(0.22, 0.2, 0.22), c: D, p: [0, -0.5, 0] }];
      const left: Limb = { pivot: [-0.44, 1.02, 0], parts: [...upper, { g: box(0.1, 0.72, 0.62), c: D, p: [-0.12, -0.42, 0.12] }, { g: sph(0.08, 0), c: A, p: [-0.18, -0.42, 0.12] }] };
      const right: Limb = { pivot: [0.44, 1.02, 0], parts: [...upper, { g: cyl(0.035, 0.035, 0.5, 5), c: WOOD, p: [0, -0.52, 0.22], r: [Math.PI / 2, 0, 0] }, { g: sph(0.13, 0), c: DMETAL, p: [0, -0.52, 0.5] }, { g: cone(0.04, 0.12, 4), c: A, p: [0, -0.4, 0.5] }] };
      const leg: Limb = { pivot: [0.17, 0.54, 0], parts: [{ g: box(0.22, 0.42, 0.24), c: D, p: [0, -0.21, 0] }, { g: box(0.26, 0.12, 0.34), c: DARK, p: [0, -0.48, 0.04] }] };
      return {
        kind: 'biped', attack: 'swing', height: 1.65,
        body: [
          { g: box(0.64, 0.6, 0.46), c: C, p: [0, 0.84, 0] },
          { g: box(0.66, 0.06, 0.48), c: A, p: [0, 0.86, 0] },
          { g: box(0.58, 0.12, 0.44), c: DARK, p: [0, 0.56, 0] },
          { g: box(0.32, 0.3, 0.34), c: D, p: [0, 1.3, 0] },
          { g: box(0.22, 0.04, 0.03), c: A, p: [0, 1.3, 0.18] },
          { g: cone(0.05, 0.2, 4), c: D, p: [0.14, 1.5, 0], r: [0, 0, -0.4] },
          { g: cone(0.05, 0.2, 4), c: D, p: [-0.14, 1.5, 0], r: [0, 0, 0.4] },
          { g: box(0.3, 0.16, 0.4), c: D, p: [0.44, 1.14, 0] },
          { g: box(0.3, 0.16, 0.4), c: D, p: [-0.44, 1.14, 0] },
        ],
        arms: [left, right], legs: [mirror(leg), leg],
      };
    }
    case 'gunner': { // Tireur Dissonant — goblin crossbowman
      const hand: Part[] = [{ g: cyl(0.045, 0.04, 0.32), c: C, p: [0, -0.16, 0] }, { g: sph(0.05, 0), c: C, p: [0, -0.34, 0] }];
      const right: Limb = { pivot: [0.22, 0.9, 0], parts: [...hand,
        { g: box(0.06, 0.06, 0.44), c: WOOD, p: [0, -0.36, 0.18] }, { g: box(0.5, 0.035, 0.04), c: DMETAL, p: [0, -0.36, 0.38] }, { g: box(0.46, 0.01, 0.01), c: 0xdddddd, p: [0, -0.36, 0.32] }] };
      const leg: Limb = { pivot: [0.09, 0.53, 0], parts: [{ g: cyl(0.06, 0.05, 0.44), c: D, p: [0, -0.22, 0] }, { g: box(0.1, 0.07, 0.17), c: LEATHER, p: [0, -0.5, 0.03] }] };
      return {
        kind: 'biped', attack: 'shoot', height: 1.3,
        body: [
          { g: cyl(0.18, 0.21, 0.42), c: D, p: [0, 0.74, 0] },
          { g: box(0.4, 0.06, 0.3), c: LEATHER, p: [0, 0.56, 0] },
          { g: sph(0.17), c: C, p: [0, 1.08, 0] },
          { g: cone(0.05, 0.22, 4), c: C, p: [0.2, 1.12, 0], r: [0, 0, -1.35] },
          { g: cone(0.05, 0.22, 4), c: C, p: [-0.2, 1.12, 0], r: [0, 0, 1.35] },
          ...eyes(A, 1.1, 0.15, 0.06, 0.04),
          { g: cone(0.035, 0.1, 4), c: C, p: [0, 1.05, 0.19], r: [Math.PI / 2, 0, 0] },
          { g: box(0.36, 0.06, 0.36), c: 0x3a1a4a, p: [0, 1.19, 0] },
        ],
        arms: [{ pivot: [-0.22, 0.9, 0], parts: hand }, right], legs: [mirror(leg), leg],
      };
    }
    case 'caster': { // Mage Fêlé — hooded imp with a crystal staff
      const sleeve: Part[] = [{ g: cyl(0.05, 0.085, 0.36), c: C, p: [0, -0.18, 0] }, { g: sph(0.045, 0), c: 0x7a6a9a, p: [0, -0.39, 0] }];
      const right: Limb = { pivot: [0.2, 1.04, 0], parts: [...sleeve, { g: cyl(0.022, 0.03, 1.1, 5), c: DARK, p: [0, -0.42, 0.05] }, { g: oct(0.11), c: A, p: [0, 0.2, 0.05], s: [0.8, 1.5, 0.8] }] };
      return {
        kind: 'robe', attack: 'cast', height: 1.6,
        body: [
          { g: cone(0.32, 0.9, 7), c: C, p: [0, 0.45, 0] },
          { g: cyl(0.15, 0.18, 0.3), c: D, p: [0, 0.96, 0] },
          { g: sph(0.14), c: 0x7a6a9a, p: [0, 1.22, 0] },
          { g: sph(0.15), c: C, p: [0, 1.24, -0.05] },
          { g: cone(0.19, 0.38, 7), c: C, p: [0, 1.38, -0.01] },
          ...eyes(A, 1.23, 0.13, 0.05, 0.035),
          { g: oct(0.06), c: A, p: [0.18, 1.1, 0] }, { g: oct(0.06), c: A, p: [-0.18, 1.1, 0] },
        ],
        arms: [{ pivot: [-0.2, 1.04, 0], parts: sleeve }, right],
      };
    }
    case 'brute': { // Brute Fracassante — ogre with a club
      const arm: Part[] = [{ g: cyl(0.14, 0.12, 0.56), c: C, p: [0, -0.28, 0] }, { g: sph(0.17), c: D, p: [0, -0.66, 0] }];
      const leg: Limb = { pivot: [0.22, 0.62, 0], parts: [{ g: cyl(0.15, 0.13, 0.5), c: D, p: [0, -0.25, 0] }, { g: box(0.26, 0.12, 0.36), c: DARK, p: [0, -0.56, 0.05] }] };
      return {
        kind: 'biped', attack: 'slam', height: 1.9,
        body: [
          { g: sph(0.45), c: C, p: [0, 0.98, 0], s: [1.1, 1, 0.9] },
          { g: box(0.7, 0.36, 0.5), c: C, p: [0, 1.32, 0] },
          { g: box(0.84, 0.16, 0.62), c: LEATHER, p: [0, 0.66, 0] },
          { g: sph(0.2), c: C, p: [0, 1.62, 0.16] },
          { g: box(0.26, 0.1, 0.14), c: D, p: [0, 1.52, 0.28] },
          { g: cone(0.03, 0.12, 4), c: BONE, p: [0.08, 1.6, 0.34] }, { g: cone(0.03, 0.12, 4), c: BONE, p: [-0.08, 1.6, 0.34] },
          ...eyes(A, 1.66, 0.32, 0.07, 0.04),
          { g: cone(0.07, 0.26, 4), c: A, p: [0.38, 1.58, 0], r: [0, 0, -0.6] },
          { g: cone(0.07, 0.26, 4), c: A, p: [-0.38, 1.58, 0], r: [0, 0, 0.6] },
          { g: cone(0.06, 0.22, 4), c: A, p: [0, 1.5, -0.28], r: [-0.8, 0, 0] },
        ],
        arms: [{ pivot: [-0.5, 1.38, 0], parts: arm }, { pivot: [0.5, 1.38, 0], parts: [...arm, { g: cyl(0.06, 0.15, 0.9, 6), c: WOOD, p: [0, -0.66, 0.38], r: [1.25, 0, 0] }, { g: oct(0.08), c: A, p: [0, -0.5, 0.78] }] }],
        legs: [mirror(leg), leg],
      };
    }
    case 'boss': { // Colosse / Reine / Primordial — armoured giant with a glowing core
      const arm: Part[] = [{ g: cyl(0.17, 0.15, 0.6), c: C, p: [0, -0.3, 0] }, { g: box(0.34, 0.32, 0.34), c: D, p: [0, -0.72, 0] }, { g: cone(0.05, 0.14, 4), c: A, p: [0, -0.72, 0.2], r: [Math.PI / 2, 0, 0] }];
      const leg: Limb = { pivot: [0.26, 0.66, 0], parts: [{ g: cyl(0.18, 0.16, 0.54), c: D, p: [0, -0.27, 0] }, { g: box(0.32, 0.14, 0.42), c: DARK, p: [0, -0.59, 0.05] }] };
      return {
        kind: 'biped', attack: 'slam', height: 2.3,
        body: [
          { g: sph(0.5), c: C, p: [0, 1.05, 0], s: [1.1, 1, 0.9] },
          { g: box(0.9, 0.5, 0.6), c: D, p: [0, 1.42, 0] },
          { g: oct(0.16), c: A, p: [0, 1.42, 0.32] },
          { g: box(0.34, 0.32, 0.34), c: D, p: [0, 1.86, 0.1] },
          ...eyes(A, 1.88, 0.28, 0.08, 0.05),
          { g: cone(0.06, 0.34, 5), c: A, p: [0.13, 2.12, 0.05], r: [0, 0, -0.3] },
          { g: cone(0.06, 0.34, 5), c: A, p: [-0.13, 2.12, 0.05], r: [0, 0, 0.3] },
          { g: cone(0.06, 0.3, 5), c: A, p: [0, 2.16, 0] },
          { g: sph(0.24, 0), c: D, p: [0.56, 1.68, 0] }, { g: sph(0.24, 0), c: D, p: [-0.56, 1.68, 0] },
          { g: cone(0.07, 0.3, 4), c: A, p: [0.62, 1.92, 0] }, { g: cone(0.07, 0.3, 4), c: A, p: [-0.62, 1.92, 0] },
          { g: box(0.9, 0.18, 0.64), c: DARK, p: [0, 0.74, 0] },
        ],
        arms: [{ pivot: [-0.62, 1.56, 0], parts: arm }, { pivot: [0.62, 1.56, 0], parts: arm }],
        legs: [mirror(leg), leg],
      };
    }
    default:
      return { kind: 'float', attack: 'cast', height: 1, body: [{ g: oct(0.5), c: C, p: [0, 0.6, 0] }] };
  }
}

// ---------------------------------------------------------------- compiled cache

interface Compiled {
  def: RigDef;
  body: THREE.BufferGeometry;
  arms: { pivot: V3; geo: THREE.BufferGeometry }[];
  legs: { pivot: V3; geo: THREE.BufferGeometry }[];
  wings: { pivot: V3; geo: THREE.BufferGeometry; side: number }[];
  orbit: THREE.BufferGeometry | null;
}
const compiled = new Map<string, Compiled>();
function compile(key: string, m: ModelDef): Compiled {
  let c = compiled.get(key);
  if (c) return c;
  const def = defFor(m);
  c = {
    def,
    body: mergeParts(def.body),
    arms: (def.arms ?? []).map(l => ({ pivot: l.pivot, geo: mergeParts(l.parts) })),
    legs: (def.legs ?? []).map(l => ({ pivot: l.pivot, geo: mergeParts(l.parts) })),
    wings: (def.wings ?? []).map(l => ({ pivot: l.pivot, geo: mergeParts(l.parts), side: l.side })),
    orbit: def.orbit ? mergeParts(def.orbit) : null,
  };
  compiled.set(key, c);
  return c;
}

/** Visual scale: the sim's model scale, slightly compressed for huge bosses so they stay on screen. */
export function visualScale(m: ModelDef) {
  const s = m.scale > 1.6 ? 1.6 + (m.scale - 1.6) * 0.6 : m.scale;
  return s * 1.3;
}

// ---------------------------------------------------------------- runtime rig

export class Rig {
  root = new THREE.Group();
  body = new THREE.Group();
  arms: THREE.Object3D[] = [];
  legs: THREE.Object3D[] = [];
  wings: { o: THREE.Object3D; side: number }[] = [];
  orbit: THREE.Object3D | null = null;
  meshes: THREE.Mesh[] = [];
  def: RigDef;
  scale: number;
  private t = Math.random() * 10;
  private phase = Math.random() * 6;
  private blend = 0;
  private atk = -1;

  constructor(key: string, m: ModelDef, material: THREE.Material, castShadow = false) {
    const c = compile(key, m);
    this.def = c.def;
    this.scale = visualScale(m);
    this.root.scale.setScalar(this.scale);
    this.root.add(this.body);
    const mesh = (g: THREE.BufferGeometry) => {
      const me = new THREE.Mesh(g, material);
      me.castShadow = castShadow;
      this.meshes.push(me);
      return me;
    };
    this.body.add(mesh(c.body));
    for (const a of c.arms) { const o = new THREE.Group(); o.position.set(...a.pivot); o.add(mesh(a.geo)); this.body.add(o); this.arms.push(o); }
    for (const l of c.legs) { const o = new THREE.Group(); o.position.set(...l.pivot); o.add(mesh(l.geo)); this.root.add(o); this.legs.push(o); }
    for (const w of c.wings) { const o = new THREE.Group(); o.position.set(...w.pivot); o.add(mesh(w.geo)); this.body.add(o); this.wings.push({ o, side: w.side }); }
    if (c.orbit) { this.orbit = new THREE.Group(); this.orbit.add(mesh(c.orbit)); this.body.add(this.orbit); }
  }

  /** World-space height of the head (for HP bars, projectiles). */
  get height() { return (this.def.height + (this.def.hover ?? 0)) * this.scale; }

  setMaterial(m: THREE.Material) { for (const me of this.meshes) if (me.material !== m) me.material = m; }

  /** Start an attack animation. */
  strike() { this.atk = 0; }

  update(dt: number, moving: boolean) {
    const d = this.def;
    this.t += dt;
    const t = this.t;
    this.blend += ((moving ? 1 : 0) - this.blend) * Math.min(1, dt * 8);
    const b = this.blend;
    if (moving) this.phase += dt * (d.kind === 'quad' ? 7 : 10);
    const s = Math.sin(this.phase);
    const body = this.body;
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.setScalar(1);

    if (d.kind === 'float' || d.kind === 'fly') {
      body.position.y = (d.hover ?? 0) + Math.sin(t * (d.kind === 'fly' ? 7 : 2.2)) * (d.kind === 'fly' ? 0.05 : 0.07);
      body.rotation.x = b * 0.2;
    } else if (d.kind === 'robe') {
      body.position.y = Math.abs(s) * 0.05 * b + Math.sin(t * 2) * 0.012;
      body.rotation.z = s * 0.06 * b;
    } else {
      body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * b + Math.sin(t * 2.1) * 0.012;
      body.rotation.x = b * 0.07;
    }

    if (d.kind === 'quad') this.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? s : -s) * 0.6 * b));
    else this.legs.forEach((l, i) => (l.rotation.x = (i ? -s : s) * 0.8 * b));

    this.arms.forEach((a, i) => {
      a.rotation.x = (i ? s : -s) * 0.55 * b + Math.sin(t * 1.6 + i) * 0.05;
      a.rotation.y = 0;
      a.rotation.z = (i ? -1 : 1) * 0.07;
    });
    for (const w of this.wings) w.o.rotation.z = w.side * (0.1 + Math.sin(t * 34) * 0.45);
    if (this.orbit) this.orbit.rotation.y += dt * (this.atk >= 0 ? 7 : 1.4);

    if (this.atk >= 0) {
      this.atk += dt / 0.36;
      const p = Math.min(1, this.atk);
      const up = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      const swing = p < 0.35 ? -2.4 * (p / 0.35) : -2.4 + 2.9 * easeOut((p - 0.35) / 0.65);
      const [L, R] = this.arms;
      switch (d.attack) {
        case 'swing':
          if (R) R.rotation.x = swing;
          if (!R) body.position.z = 0.25 * up;
          body.rotation.y = -0.25 * up;
          break;
        case 'dual': {
          if (R) R.rotation.x = swing;
          const q = Math.min(1, Math.max(0, p - 0.2) / 0.8);
          if (L) L.rotation.x = q < 0.35 ? -2.2 * (q / 0.35) : -2.2 + 2.6 * easeOut((q - 0.35) / 0.65);
          body.rotation.y = 0.2 * Math.sin(p * Math.PI * 2);
          break;
        }
        case 'shoot':
          if (L) L.rotation.x = -1.5;
          if (R) R.rotation.x = -1.5 + (p < 0.6 ? 0.35 * (p / 0.6) : 0);
          body.position.z = -0.06 * up;
          break;
        case 'cast':
          for (const a of this.arms) a.rotation.x = -2.6 * Math.sin(p * Math.PI);
          body.position.y += 0.08 * Math.sin(p * Math.PI);
          if (!this.arms.length) body.scale.setScalar(1 + 0.12 * Math.sin(p * Math.PI));
          break;
        case 'slam':
          for (const a of this.arms) a.rotation.x = swing;
          body.rotation.x += 0.25 * up;
          body.position.y -= p > 0.35 ? 0.1 * (1 - p) : 0;
          break;
      }
      if (this.atk >= 1) this.atk = -1;
    }
  }
}

function easeOut(x: number) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); }
