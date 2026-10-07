// Articulated low-poly 3D characters ("bonhommes"), built from primitives — 100 % original.
// Each character = a few rigid parts (body, arms, legs, wings, orbit, cape) animated procedurally.
// Rendering is INSTANCED: every compiled part geometry is one InstancedMesh shared by all characters
// of that type (Batcher) → draw calls depend on the number of unit TYPES on screen, not on the crowd size.
// Level decorations make power readable at a glance: ★★ better weapon, ★★★ armour, ★★★★ cape + glowing
// branch colours, ★★★★★ elite crown, gold trims and orbiting runes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Branch, ModelDef } from '../data/types';
import { shapeDef } from './shapes';
import { setPbr } from './look';
import { UNITS } from '../data/units';
import type { FactionId } from '../data/types';

export type V3 = [number, number, number];
/** One coloured primitive. glow = unlit emissive part; w = weapon (upgraded with level). */
export interface Part { g: THREE.BufferGeometry; c: number; p?: V3; r?: V3; s?: V3; glow?: boolean; w?: boolean; pbr?: [number, number] }

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const sph = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
export const cyl = (rt: number, rb: number, h: number, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
export const cone = (r: number, h: number, s = 7) => new THREE.ConeGeometry(r, h, s);
export const oct = (r: number) => new THREE.OctahedronGeometry(r, 0);
export const tor = (R: number, t: number, arc = Math.PI * 2) => new THREE.TorusGeometry(R, t, 5, 16, arc);

export function shade(c: number, k: number) { return new THREE.Color(c).multiplyScalar(k).getHex(); }
export function mix(a: number, b: number, k: number) { return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex(); }

/** Merge coloured parts into one flat-shaded geometry (keeps uv only if every part has one and keepUv). */
export function mergeParts(parts: Part[], keepUv = false, matte = false): THREE.BufferGeometry {
  const col = new THREE.Color();
  const geos = parts.map(p => {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    if (!keepUv && g.attributes.uv) g.deleteAttribute('uv');
    if (g.attributes.normal && !keepUv) g.deleteAttribute('normal');
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
    setPbr(g, p.c, p.pbr, matte);
    return g;
  });
  const merged = mergeGeometries(geos)!;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------- rig definitions

export type Kind = 'biped' | 'quad' | 'float' | 'fly' | 'robe' | 'static';
export type Attack = 'swing' | 'dual' | 'shoot' | 'cast' | 'slam';
export interface Limb { pivot: V3; parts: Part[] }
export interface RigDef {
  kind: Kind;
  attack: Attack;
  height: number; // top of the head (model space, before scale)
  hover?: number;
  body: Part[];
  arms?: Limb[]; // [left, right]
  legs?: Limb[];
  wings?: (Limb & { side: number })[];
  orbit?: Part[];
  cape?: Limb;
}

const GOLD = 0xe8c050, STEEL = 0xd8dde8;

/**
 * Faction signature — every unit of an army carries its mark, readable from the tactical camera:
 * Astral silver pauldrons + orbiting star shard, Rouages brass pack with gear and chimney, Ronces leaf pauldrons,
 * thorns and a spore, Abysses fin crest and bioluminescent dots, Solaire flame pauldrons, Necrose bone spikes + a soul.
 */
function factionSig(d: RigDef, f: FactionId | undefined) {
  if (!f || d.kind === 'static') return;
  const H = d.height, hum = d.kind === 'biped' || d.kind === 'robe';
  const sy = H * 0.66, sx = hum ? 0.27 : 0.18, back = hum ? -0.19 : -0.12;
  const add = (p: Part) => d.body.push(p);
  switch (f) {
    case 'astreens':
      if (hum) for (const s of [-1, 1]) add({ g: sph(0.1, 0), c: 0xdce6f4, p: [s * sx, sy + 0.05, 0], s: [1.35, 0.6, 1.15], pbr: [0.85, 0.28] });
      d.orbit = [...(d.orbit ?? []), { g: oct(0.075), c: 0xbff4ff, p: [0.44, H * 0.86, 0], s: [0.45, 1.6, 0.45], glow: true }, { g: oct(0.075), c: 0xbff4ff, p: [0.44, H * 0.86, 0], s: [1.6, 0.45, 0.45], glow: true }];
      break;
    case 'rouages':
      add({ g: box(0.26, 0.3, 0.14), c: 0x8a5a2a, p: [0, sy - 0.08, back - 0.04], pbr: [0.8, 0.38] });
      add({ g: tor(0.1, 0.03), c: 0xd09040, p: [0, sy - 0.05, back - 0.13], pbr: [0.85, 0.35] });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add({ g: box(0.04, 0.04, 0.03), c: 0xd09040, p: [Math.cos(a) * 0.135, sy - 0.05 + Math.sin(a) * 0.135, back - 0.13], r: [0, 0, a] }); }
      add({ g: cyl(0.035, 0.045, 0.24, 6), c: 0x3a3a42, p: [0.09, sy + 0.15, back - 0.04], pbr: [0.7, 0.5] });
      add({ g: sph(0.04, 0), c: 0xff9a3a, p: [0.09, sy + 0.28, back - 0.04], glow: true });
      break;
    case 'ronces':
      if (hum) for (const s of [-1, 1]) add({ g: cone(0.13, 0.24, 4), c: 0x4a8a3a, p: [s * sx, sy + 0.06, 0], r: [0, 0, -s * 1.1], s: [1, 1, 0.5] });
      for (let i = 0; i < 3; i++) add({ g: cone(0.03, 0.16, 4), c: 0x4a3a26, p: [(i - 1) * 0.08, sy - 0.05 + i * 0.03, back - 0.02], r: [-1.2, 0, 0] });
      add({ g: sph(0.045, 0), c: 0x9aff9a, p: [-sx * 0.7, sy + 0.13, 0.05], glow: true });
      break;
    case 'abysses':
      add({ g: box(0.025, 0.28, 0.24), c: 0x2ab8b8, p: [0, sy + 0.05, back - 0.02] });
      for (const s of [-1, 1]) add({ g: sph(0.032, 0), c: 0x6affe8, p: [s * sx * 0.9, sy + 0.02, 0.06], glow: true });
      add({ g: sph(0.028, 0), c: 0xb07aff, p: [0, sy - 0.12, back * 0.2 + 0.18], glow: true });
      break;
    case 'solaires':
      if (hum) for (const s of [-1, 1]) add({ g: cone(0.065, 0.22, 5), c: 0xffa040, p: [s * sx, sy + 0.13, -0.02], r: [0, 0, -s * 0.3], glow: true });
      else add({ g: cone(0.09, 0.28, 5), c: 0xffa040, p: [0, H * 0.82, back], glow: true });
      break;
    case 'necrose':
      for (const s of [-1, 1]) add({ g: cone(0.03, 0.22, 4), c: 0xe0d8c8, p: [s * sx, sy + 0.11, back * 0.5], r: [-0.3, 0, -s * 0.5] });
      d.orbit = [...(d.orbit ?? []), { g: sph(0.055, 0), c: 0x9aff6a, p: [0.38, H * 0.72, 0], glow: true }];
      break;
  }
}

/** Level / branch decorations — the visual power ladder. */
function decorate(def: RigDef, m: ModelDef, level: number, branch: Branch | null, faction?: FactionId): RigDef {
  const d: RigDef = { ...def, body: def.body.slice(), arms: def.arms?.map(a => ({ pivot: a.pivot, parts: a.parts.slice() })), orbit: def.orbit?.slice() };
  factionSig(d, faction);
  if (level <= 1) return d;
  const A = m.accent, H = def.height;
  const wk = branch === 'A' && level >= 4 ? 1.3 : 1.12; // branch A (offense) carries a visibly bigger weapon
  const upgradeWeapon = (p: Part): Part => {
    if (!p.w) return p;
    const s = p.s ?? [1, 1, 1];
    const c = level >= 3 ? mix(p.c, A, 0.55) : mix(p.c, STEEL, 0.5);
    return { ...p, c: level >= 5 ? mix(c, GOLD, 0.4) : c, s: [s[0] * wk, s[1] * wk, s[2] * wk], glow: level >= 5 || p.glow };
  };
  d.body = d.body.map(upgradeWeapon);
  if (d.arms) for (const a of d.arms) a.parts = a.parts.map(upgradeWeapon);
  const humanoid = d.kind === 'biped' || d.kind === 'robe';
  const trim = level >= 5 ? GOLD : level >= 4 ? A : STEEL;
  // ★★★ extra armour
  if (level >= 3) {
    if (humanoid && d.arms?.length === 2) {
      for (const a of d.arms) {
        const sx = a.pivot[0] < 0 ? -1 : 1;
        a.parts.push({ g: sph(0.13, 0), c: shade(trim, 0.9), p: [sx * 0.04, 0.02, 0], s: [1.3, 0.75, 1.15] });
        if (level >= 4) a.parts.push({ g: cone(0.04, 0.16, 4), c: trim, p: [sx * 0.08, 0.14, 0], r: [0, 0, -sx * 0.4] });
      }
      d.body.push({ g: box(0.32, 0.22, 0.05), c: shade(trim, 0.85), p: [0, H * 0.56, 0.17] });
      d.body.push({ g: box(0.36, 0.05, 0.3), c: shade(trim, 0.7), p: [0, H * 0.42, 0] });
    } else {
      d.body.push({ g: box(0.36, 0.06, 0.42), c: shade(trim, 0.85), p: [0, H * 0.62, 0] });
      d.body.push({ g: oct(0.07), c: trim, p: [0, H * 0.7, 0.12] });
    }
  }
  // ★★★★ branch silhouettes: A = spiked crest + shoulder blades (offense), B = halo + aura ring (defense / support)
  if (level >= 4 && branch === 'A') {
    d.body.push({ g: cone(0.05, 0.28, 4), c: A, p: [0.07, H + 0.07, -0.02], r: [0, 0, -0.35] }, { g: cone(0.05, 0.28, 4), c: A, p: [-0.07, H + 0.07, -0.02], r: [0, 0, 0.35] });
    if (humanoid) for (const s of [-1, 1]) d.body.push({ g: cone(0.05, 0.24, 4), c: shade(A, 0.9), p: [s * 0.34, H * 0.7, 0], r: [0, 0, -s * 1.2] });
  } else if (level >= 4 && branch === 'B') {
    d.body.push({ g: tor(0.21, 0.02), c: A, p: [0, H - 0.02, -0.17], glow: true });
    d.body.push({ g: tor(0.44, 0.016), c: A, p: [0, 0.03, 0], r: [Math.PI / 2, 0, 0], glow: true });
  }
  // ★★★★ cape + glowing branch emblem
  if (level >= 4) {
    const capeCol = branch === 'B' ? shade(A, 0.75) : shade(m.color, 0.8);
    if (humanoid) d.cape = { pivot: [0, H * 0.66, -0.16], parts: [{ g: box(0.42, H * 0.5, 0.03), c: capeCol, p: [0, -H * 0.25, 0] }, { g: box(0.44, 0.05, 0.04), c: trim, p: [0, -H * 0.5, 0] }] };
    d.body.push({ g: oct(0.06), c: A, p: [0, H * 0.58, 0.21], glow: true });
  }
  // ★★★★★ elite: crown / halo + orbiting runes
  if (level >= 5) {
    d.body.push({ g: tor(0.16, 0.025), c: GOLD, p: [0, H + 0.04, 0], r: [Math.PI / 2, 0, 0], glow: true });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      d.body.push({ g: cone(0.025, 0.09, 4), c: GOLD, p: [Math.cos(a) * 0.15, H + 0.09, Math.sin(a) * 0.15], glow: true });
    }
    const runes: Part[] = [0, 1, 2].map(i => ({ g: oct(0.06), c: A, p: [Math.cos(i * 2.094) * 0.55, H * 0.55, Math.sin(i * 2.094) * 0.55] as V3, s: [0.7, 1.4, 0.7] as V3, glow: true }));
    d.orbit = [...(d.orbit ?? []), ...runes];
  }
  return d;
}

// ---------------------------------------------------------------- compiled cache

export interface Piece { normal: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }
function piece(parts: Part[]): Piece {
  const n = parts.filter(p => !p.glow), g = parts.filter(p => p.glow);
  return { normal: n.length ? mergeParts(n) : null, glow: g.length ? mergeParts(g) : null };
}
interface Compiled {
  def: RigDef;
  body: Piece;
  arms: { pivot: V3; piece: Piece }[];
  legs: { pivot: V3; piece: Piece }[];
  wings: { pivot: V3; piece: Piece; side: number }[];
  orbit: Piece | null;
  cape: { pivot: V3; piece: Piece } | null;
}
const compiled = new Map<string, Compiled>();
function compile(key: string, m: ModelDef, level: number, branch: Branch | null): Compiled {
  let c = compiled.get(key);
  if (c) return c;
  const def = decorate(shapeDef(m), m, level, branch, UNITS[key.split('|')[0]]?.faction);
  c = {
    def,
    body: piece(def.body),
    arms: (def.arms ?? []).map(l => ({ pivot: l.pivot, piece: piece(l.parts) })),
    legs: (def.legs ?? []).map(l => ({ pivot: l.pivot, piece: piece(l.parts) })),
    wings: (def.wings ?? []).map(l => ({ pivot: l.pivot, piece: piece(l.parts), side: l.side })),
    orbit: def.orbit ? piece(def.orbit) : null,
    cape: def.cape ? { pivot: def.cape.pivot, piece: piece(def.cape.parts) } : null,
  };
  compiled.set(key, c);
  return c;
}

/** Visual scale: the sim's model scale, slightly compressed for huge bosses so they stay on screen. */
export function visualScale(m: ModelDef) {
  const s = m.scale > 1.6 ? 1.6 + (m.scale - 1.6) * 0.6 : m.scale;
  return s * 1.3;
}

// ---------------------------------------------------------------- instanced batches

interface Batch { mesh: THREE.InstancedMesh; n: number; cap: number }
/** Collects part instances every frame and draws each distinct geometry with ONE InstancedMesh. */
export class Batcher {
  private batches = new Map<number, Batch>();
  constructor(private scene: THREE.Scene, private toon: THREE.Material, private glow: THREE.Material, private shadows: boolean) {}
  begin() { for (const b of this.batches.values()) b.n = 0; }
  add(geo: THREE.BufferGeometry, glow: boolean, m: THREE.Matrix4, tint: THREE.Color) {
    let b = this.batches.get(geo.id);
    if (!b || b.n >= b.cap) b = this.grow(geo, glow, b);
    b.mesh.setMatrixAt(b.n, m);
    b.mesh.setColorAt(b.n, tint);
    b.n++;
  }
  private grow(geo: THREE.BufferGeometry, glow: boolean, old?: Batch): Batch {
    const cap = old ? old.cap * 2 : 16;
    const mesh = new THREE.InstancedMesh(geo, glow ? this.glow : this.toon, cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.frustumCulled = false;
    mesh.castShadow = this.shadows && !glow;
    if (old) {
      for (let i = 0; i < old.n; i++) {
        const m = new THREE.Matrix4(); old.mesh.getMatrixAt(i, m); mesh.setMatrixAt(i, m);
        const c = new THREE.Color(); old.mesh.getColorAt(i, c); mesh.setColorAt(i, c);
      }
      this.scene.remove(old.mesh); old.mesh.dispose();
    }
    this.scene.add(mesh);
    const b: Batch = { mesh, n: old?.n ?? 0, cap };
    this.batches.set(geo.id, b);
    return b;
  }
  end() {
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }
  get drawCalls() { let n = 0; for (const b of this.batches.values()) if (b.n) n++; return n; }
}

// ---------------------------------------------------------------- runtime rig

interface Slot { obj: THREE.Object3D; geo: THREE.BufferGeometry; glow: boolean }
const WHITE = new THREE.Color(1, 1, 1);

export class Rig {
  root = new THREE.Group();
  body = new THREE.Group();
  arms: THREE.Object3D[] = [];
  legs: THREE.Object3D[] = [];
  wings: { o: THREE.Object3D; side: number }[] = [];
  orbit: THREE.Object3D | null = null;
  cape: THREE.Object3D | null = null;
  slots: Slot[] = [];
  def: RigDef;
  scale: number;
  level: number;
  private t = Math.random() * 10;
  private phase = Math.random() * 6;
  private blend = 0;
  private atk = -1;
  private hitT = 0;
  private cheerT = -1;

  constructor(key: string, m: ModelDef, level = 1, branch: Branch | null = null) {
    const c = compile(`${key}|${level}|${branch ?? ''}`, m, level, branch);
    this.def = c.def;
    this.level = level;
    this.scale = visualScale(m) * (1 + 0.035 * (level - 1)); // higher level = a bit taller
    this.root.scale.setScalar(this.scale);
    this.root.add(this.body);
    const add = (o: THREE.Object3D, p: Piece) => {
      if (p.normal) this.slots.push({ obj: o, geo: p.normal, glow: false });
      if (p.glow) this.slots.push({ obj: o, geo: p.glow, glow: true });
    };
    add(this.body, c.body);
    for (const a of c.arms) { const o = new THREE.Group(); o.position.set(...a.pivot); this.body.add(o); this.arms.push(o); add(o, a.piece); }
    for (const l of c.legs) { const o = new THREE.Group(); o.position.set(...l.pivot); this.root.add(o); this.legs.push(o); add(o, l.piece); }
    for (const w of c.wings) { const o = new THREE.Group(); o.position.set(...w.pivot); this.body.add(o); this.wings.push({ o, side: w.side }); add(o, w.piece); }
    if (c.orbit) { this.orbit = new THREE.Group(); this.body.add(this.orbit); add(this.orbit, c.orbit); }
    if (c.cape) { this.cape = new THREE.Group(); this.cape.position.set(...c.cape.pivot); this.body.add(this.cape); add(this.cape, c.cape.piece); }
  }

  /** World-space height of the head (for HP bars, projectiles). */
  get height() { return (this.def.height + (this.def.hover ?? 0)) * this.root.scale.y; }

  /** Push this rig's parts into the instanced batches. */
  submit(b: Batcher, tint: THREE.Color = WHITE) {
    this.root.updateMatrixWorld(true);
    for (const s of this.slots) b.add(s.geo, s.glow, s.obj.matrixWorld, s.glow ? WHITE : tint);
  }

  /** Standalone (non-instanced) meshes — for the placement ghost and card portraits. */
  attachMeshes(mat: THREE.Material, glowMat: THREE.Material) {
    for (const s of this.slots) s.obj.add(new THREE.Mesh(s.geo, s.glow ? glowMat : mat));
  }

  strike() { this.atk = 0; }
  hit() { this.hitT = 0.14; }
  cheer() { this.cheerT = 0; }

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
    } else if (d.kind === 'static') {
      body.position.y = 0;
    } else {
      body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * b + Math.sin(t * 2.1) * 0.012;
      body.rotation.x = b * 0.07;
      body.scale.y = 1 + Math.sin(t * 2.1) * 0.012; // breathing
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
    if (this.cape) this.cape.rotation.x = 0.12 + b * 0.35 + Math.sin(t * 3.1) * 0.05;

    // victory hop
    if (this.cheerT >= 0) {
      this.cheerT += dt;
      const k = this.cheerT % 0.55;
      body.position.y += Math.sin((k / 0.55) * Math.PI) * 0.25;
      for (const a of this.arms) a.rotation.x = -2.6;
      if (this.cheerT > 1.65) this.cheerT = -1;
    }

    if (this.atk >= 0) {
      this.atk += dt / 0.34;
      const p = Math.min(1, this.atk);
      // anticipation (wind-up) → fast strike → follow-through / recoil
      const up = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
      const swing = p < 0.3 ? -2.5 * easeOut(p / 0.3) : -2.5 + 3.0 * easeOut((p - 0.3) / 0.25);
      const [L, R] = this.arms;
      switch (d.attack) {
        case 'swing':
          if (R) R.rotation.x = swing;
          if (!R) body.position.z = 0.25 * up;
          body.rotation.y = p < 0.3 ? 0.3 * (p / 0.3) : 0.3 - 0.6 * easeOut((p - 0.3) / 0.4);
          body.position.z += p > 0.3 && p < 0.6 ? 0.12 : 0;
          break;
        case 'dual': {
          if (R) R.rotation.x = swing;
          const q = Math.min(1, Math.max(0, p - 0.2) / 0.8);
          if (L) L.rotation.x = q < 0.3 ? -2.3 * (q / 0.3) : -2.3 + 2.8 * easeOut((q - 0.3) / 0.3);
          body.rotation.y = 0.25 * Math.sin(p * Math.PI * 2);
          break;
        }
        case 'shoot': {
          // draw → release → recoil
          const draw = p < 0.55 ? p / 0.55 : 0;
          if (L) L.rotation.x = -1.55;
          if (R) R.rotation.x = -1.55 + 0.45 * draw;
          body.position.z = p >= 0.55 && p < 0.8 ? -0.1 * (1 - (p - 0.55) / 0.25) : 0;
          break;
        }
        case 'cast':
          for (const a of this.arms) a.rotation.x = -2.7 * Math.sin(p * Math.PI);
          body.position.y += 0.1 * Math.sin(p * Math.PI);
          if (!this.arms.length) body.scale.setScalar(1 + 0.14 * Math.sin(p * Math.PI));
          break;
        case 'slam':
          for (const a of this.arms) a.rotation.x = swing;
          body.rotation.x += p < 0.3 ? -0.15 * (p / 0.3) : 0.35 * up;
          body.position.y -= p > 0.35 ? 0.12 * (1 - p) : 0;
          break;
      }
      if (this.atk >= 1) this.atk = -1;
    }
    // hit reaction: quick flinch backwards
    if (this.hitT > 0) {
      this.hitT -= dt;
      body.rotation.x -= Math.sin((this.hitT / 0.14) * Math.PI) * 0.22;
    }
  }
}

function easeOut(x: number) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); }
