// Procedural low-poly models built from primitives, merged into one geometry with vertex colors
// (1 draw call per entity). All silhouettes are original placeholders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ModelDef } from '../data/types';

type Part = { g: THREE.BufferGeometry; color: number; pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] };

function colorize(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function build(parts: Part[], scale: number) {
  const geos = parts.map(p => {
    let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0])));
    m.compose(new THREE.Vector3(...(p.pos ?? [0, 0, 0])), q, new THREE.Vector3(...(p.scale ?? [1, 1, 1])));
    g.applyMatrix4(m);
    return colorize(g, p.color);
  });
  const merged = mergeGeometries(geos)!;
  const k = scale * 1.5; // visual scale: readable on phones
  merged.scale(k, k, k);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt: number, rb: number, h: number, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);
const oct = (r: number) => new THREE.OctahedronGeometry(r, 0);
const tor = (r: number, t: number) => new THREE.TorusGeometry(r, t, 6, 16);

function shade(c: number, k: number) { return new THREE.Color(c).multiplyScalar(k).getHex(); }

export function makeModel(m: ModelDef): THREE.BufferGeometry {
  const C = m.color, A = m.accent, D = shade(m.color, 0.55);
  let parts: Part[] = [];
  switch (m.shape) {
    case 'golem': parts = [
      { g: box(0.62, 0.55, 0.45), color: C, pos: [0, 0.62, 0] },
      { g: box(0.32, 0.26, 0.3), color: D, pos: [0, 1.02, 0.02] },
      { g: box(0.12, 0.06, 0.04), color: A, pos: [0, 1.04, 0.18] },
      { g: box(0.2, 0.5, 0.22), color: D, pos: [-0.42, 0.55, 0] },
      { g: box(0.2, 0.5, 0.22), color: D, pos: [0.42, 0.55, 0] },
      { g: box(0.18, 0.35, 0.2), color: D, pos: [-0.16, 0.18, 0] },
      { g: box(0.18, 0.35, 0.2), color: D, pos: [0.16, 0.18, 0] },
      { g: box(0.5, 0.08, 0.5), color: A, pos: [0, 0.92, 0] },
    ]; break;
    case 'blade': parts = [
      { g: cyl(0.14, 0.2, 0.6, 6), color: C, pos: [0, 0.6, 0] },
      { g: sph(0.16), color: D, pos: [0, 1.03, 0] },
      { g: cone(0.12, 0.3, 4), color: A, pos: [0, 1.25, 0] },
      { g: box(0.05, 0.7, 0.1), color: A, pos: [0.3, 0.75, 0.1], rot: [0.4, 0, -0.5] },
      { g: box(0.05, 0.7, 0.1), color: A, pos: [-0.3, 0.75, 0.1], rot: [0.4, 0, 0.5] },
      { g: cyl(0.08, 0.06, 0.32, 5), color: D, pos: [-0.1, 0.16, 0] },
      { g: cyl(0.08, 0.06, 0.32, 5), color: D, pos: [0.1, 0.16, 0] },
    ]; break;
    case 'archer': parts = [
      { g: cone(0.28, 0.75, 8), color: C, pos: [0, 0.45, 0] },
      { g: sph(0.15), color: shade(C, 1.2), pos: [0, 0.95, 0] },
      { g: oct(0.08), color: A, pos: [0, 1.2, 0] },
      { g: tor(0.32, 0.025), color: A, pos: [0.25, 0.75, 0.05], rot: [0, Math.PI / 2, 0], scale: [1, 1.3, 0.5] },
      { g: oct(0.1), color: A, pos: [-0.22, 0.7, 0] },
    ]; break;
    case 'turtle': parts = [
      { g: sph(0.55, 1), color: C, pos: [0, 0.5, 0], scale: [1, 0.65, 1.1] },
      { g: sph(0.2), color: D, pos: [0, 0.48, 0.58] },
      { g: box(0.18, 0.3, 0.18), color: D, pos: [-0.38, 0.15, 0.3] },
      { g: box(0.18, 0.3, 0.18), color: D, pos: [0.38, 0.15, 0.3] },
      { g: box(0.18, 0.3, 0.18), color: D, pos: [-0.38, 0.15, -0.3] },
      { g: box(0.18, 0.3, 0.18), color: D, pos: [0.38, 0.15, -0.3] },
      { g: cone(0.1, 0.35, 5), color: A, pos: [0, 0.95, 0] },
      { g: cone(0.08, 0.28, 5), color: A, pos: [0.25, 0.85, -0.15] },
      { g: cone(0.08, 0.28, 5), color: A, pos: [-0.25, 0.85, -0.15] },
    ]; break;
    case 'mage': parts = [
      { g: cone(0.32, 0.9, 8), color: C, pos: [0, 0.45, 0] },
      { g: sph(0.15), color: shade(C, 1.25), pos: [0, 0.98, 0] },
      { g: cone(0.17, 0.4, 8), color: D, pos: [0, 1.22, 0] },
      { g: cyl(0.025, 0.025, 1.1, 4), color: D, pos: [0.3, 0.6, 0] },
      { g: sph(0.13, 1), color: A, pos: [0.3, 1.2, 0] },
    ]; break;
    case 'bard': parts = [
      { g: cyl(0.18, 0.3, 0.75, 8), color: C, pos: [0, 0.38, 0] },
      { g: sph(0.15), color: shade(C, 1.2), pos: [0, 0.92, 0] },
      { g: tor(0.24, 0.03), color: A, pos: [0, 1.22, 0], rot: [Math.PI / 2, 0, 0] },
      { g: tor(0.38, 0.02), color: A, pos: [0, 0.55, 0], rot: [Math.PI / 2, 0, 0] },
      { g: oct(0.1), color: A, pos: [-0.3, 0.75, 0.1] },
    ]; break;
    case 'shade': parts = [
      { g: cone(0.3, 0.95, 6), color: C, pos: [0, 0.6, 0], rot: [Math.PI, 0, 0] },
      { g: sph(0.16), color: D, pos: [0, 1.15, 0] },
      { g: box(0.16, 0.03, 0.03), color: A, pos: [0, 1.17, 0.14] },
      { g: cone(0.05, 0.5, 4), color: A, pos: [0.33, 0.6, 0.1], rot: [0, 0, -0.3] },
      { g: cone(0.05, 0.5, 4), color: A, pos: [-0.33, 0.6, 0.1], rot: [0, 0, 0.3] },
    ]; break;
    case 'prism': parts = [
      { g: cyl(0.3, 0.42, 0.35, 6), color: D, pos: [0, 0.18, 0] },
      { g: oct(0.42), color: C, pos: [0, 0.95, 0], scale: [0.8, 1.4, 0.8] },
      { g: oct(0.15), color: A, pos: [0.5, 1.2, 0] },
      { g: oct(0.15), color: A, pos: [-0.5, 1.2, 0] },
      { g: oct(0.12), color: A, pos: [0, 1.75, 0] },
      { g: tor(0.5, 0.03), color: A, pos: [0, 0.95, 0], rot: [Math.PI / 2, 0, 0] },
    ]; break;
    // ---- enemies ----
    case 'crawler': parts = [
      { g: sph(0.32, 1), color: C, pos: [0, 0.32, 0], scale: [1, 0.7, 1.2] },
      { g: sph(0.16), color: D, pos: [0, 0.4, 0.35] },
      { g: box(0.05, 0.05, 0.05), color: A, pos: [0.07, 0.45, 0.5] },
      { g: box(0.05, 0.05, 0.05), color: A, pos: [-0.07, 0.45, 0.5] },
      { g: cone(0.05, 0.25, 4), color: A, pos: [0, 0.6, 0], },
    ]; break;
    case 'fly': parts = [
      { g: sph(0.2), color: C, pos: [0, 0.75, 0], scale: [1, 0.8, 1.3] },
      { g: box(0.5, 0.02, 0.18), color: A, pos: [0.28, 0.85, 0], rot: [0, 0, 0.3] },
      { g: box(0.5, 0.02, 0.18), color: A, pos: [-0.28, 0.85, 0], rot: [0, 0, -0.3] },
      { g: cone(0.05, 0.2, 4), color: D, pos: [0, 0.65, -0.3], rot: [-Math.PI / 2, 0, 0] },
    ]; break;
    case 'runner': parts = [
      { g: sph(0.24, 1), color: C, pos: [0, 0.55, 0], scale: [0.8, 0.8, 1.5] },
      { g: cone(0.12, 0.35, 5), color: D, pos: [0, 0.6, 0.45], rot: [Math.PI / 2, 0, 0] },
      { g: cyl(0.04, 0.03, 0.45, 4), color: D, pos: [0.12, 0.22, 0.1], rot: [0.3, 0, 0] },
      { g: cyl(0.04, 0.03, 0.45, 4), color: D, pos: [-0.12, 0.22, -0.1], rot: [-0.3, 0, 0] },
      { g: cone(0.06, 0.3, 4), color: A, pos: [0, 0.8, -0.2], rot: [-0.8, 0, 0] },
    ]; break;
    case 'armored': parts = [
      { g: box(0.6, 0.6, 0.6), color: C, pos: [0, 0.45, 0] },
      { g: box(0.7, 0.15, 0.7), color: D, pos: [0, 0.8, 0] },
      { g: box(0.3, 0.06, 0.04), color: A, pos: [0, 0.55, 0.31] },
      { g: cone(0.08, 0.25, 4), color: A, pos: [0.25, 1, 0] },
      { g: cone(0.08, 0.25, 4), color: A, pos: [-0.25, 1, 0] },
    ]; break;
    case 'gunner': parts = [
      { g: cyl(0.2, 0.25, 0.6, 6), color: C, pos: [0, 0.4, 0] },
      { g: sph(0.16), color: D, pos: [0, 0.85, 0] },
      { g: cyl(0.05, 0.05, 0.6, 5), color: A, pos: [0.22, 0.6, 0.2], rot: [Math.PI / 2, 0, 0] },
    ]; break;
    case 'caster': parts = [
      { g: cone(0.3, 0.9, 6), color: C, pos: [0, 0.45, 0] },
      { g: oct(0.18), color: A, pos: [0, 1.05, 0] },
      { g: tor(0.25, 0.03), color: A, pos: [0, 0.6, 0], rot: [Math.PI / 2, 0, 0] },
    ]; break;
    case 'brute': parts = [
      { g: sph(0.45, 1), color: C, pos: [0, 0.65, 0], scale: [1.1, 1, 0.9] },
      { g: sph(0.2), color: D, pos: [0, 1.1, 0.25] },
      { g: box(0.25, 0.6, 0.25), color: D, pos: [-0.55, 0.5, 0.1] },
      { g: box(0.25, 0.6, 0.25), color: D, pos: [0.55, 0.5, 0.1] },
      { g: cone(0.1, 0.35, 4), color: A, pos: [-0.3, 1.1, 0], rot: [0, 0, 0.5] },
      { g: cone(0.1, 0.35, 4), color: A, pos: [0.3, 1.1, 0], rot: [0, 0, -0.5] },
      { g: box(0.08, 0.06, 0.04), color: A, pos: [0, 1.12, 0.45] },
    ]; break;
    case 'boss': parts = [
      { g: sph(0.55, 1), color: C, pos: [0, 0.85, 0] },
      { g: oct(0.35), color: A, pos: [0, 1.5, 0] },
      { g: tor(0.7, 0.05), color: A, pos: [0, 0.9, 0], rot: [Math.PI / 2, 0, 0] },
      { g: cone(0.12, 0.6, 5), color: A, pos: [0.45, 1.35, 0], rot: [0, 0, -0.6] },
      { g: cone(0.12, 0.6, 5), color: A, pos: [-0.45, 1.35, 0], rot: [0, 0, 0.6] },
      { g: box(0.3, 0.5, 0.3), color: D, pos: [-0.35, 0.25, 0] },
      { g: box(0.3, 0.5, 0.3), color: D, pos: [0.35, 0.25, 0] },
    ]; break;
    case 'core': parts = [
      { g: oct(0.9), color: C, pos: [0, 0, 0], scale: [1, 1.5, 1] },
    ]; break;
  }
  return build(parts, m.scale);
}

const cache = new Map<string, THREE.BufferGeometry>();
export function modelFor(key: string, m: ModelDef) {
  let g = cache.get(key);
  if (!g) { g = makeModel(m); cache.set(key, g); }
  return g;
}

let toonGradient: THREE.DataTexture | null = null;
export function toonMaterial(opts: { transparent?: boolean; opacity?: number } = {}) {
  if (!toonGradient) {
    const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
    toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient, ...opts });
}
