// Environment (v0.5 "cinematic dusk") — floating stone islands over a misty abyss. Worn flagstone battlefields with
// organic edges, low ruined walls and iron lanterns, ruins (arches, columns, guardian statues) on the far side,
// stone bridges with braziers over waterfalls, monumental rift gates with a vortex and floating rocks, the Bastion
// on its plaza, and a per-lane faction decor (crystals, gears, roots, coral, obsidian, graves) with ambient particles.
// The mood (dusk → blue hour → night) follows the wave number. Static parts are merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE } from '../sim/state';
import { Part, box, cyl, cone, oct, sph, tor, mergeParts, shade, mix } from './characters';
import { waterfallTexture, cloudTexture, glowTexture, vortexTexture, flagstoneTextures, mossTexture } from './textures';
import type { Quality } from './Renderer';
import type { FactionId } from '../data/types';
import { litMaterial, reflective, surfaceMaterial } from './look';
import { buildBastion, Bastion } from './bastion';
import { ST, pathGeometry, worldUV, stoneWall, lanternPost, ruinArch, brokenColumn, statue, pine, rock, bush, tuft, deadTree, stoneBridge, factionDecor, FACTION_LOOK } from './terrain';

const LANE_START = 13.0; // lane islands run from the bridge (|x| = 13) to |x| = 46 (behind the rift gates)
const LANE_END = 46;
const CORE_R = 10.5;
const PATH_HW = 4.6; // flagstone half-width (battlefield)
const ISLE_HW = 7.2; // island half-width (ledges beyond the walls)
const BRIDGE_X0 = 10.3; // where the Core island flagstones hand over to the bridge flagstones

export interface Env {
  update(dt: number, time: number): void;
  setMood(t: number, boss: boolean): void;
  /** ULTRA: the warm lantern / brazier lights follow the camera focus */
  setFocus(x: number, z: number): void;
  /** Dress a lane with its player's faction (decor + ambient particles). Cheap when unchanged. */
  setLaneFaction(arena: number, slot: number, f: FactionId): void;
  coreCrystals: THREE.Mesh[];
  coreGroups: THREE.Group[];
  coreLights: THREE.PointLight[];
  bastions: Bastion[];
  sun: THREE.DirectionalLight;
}

function rng(seed: number) {
  let s = seed;
  return () => { let t = (s = (s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function scaleUV(g: THREE.BufferGeometry, sx: number, sy: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

/** Blocky cliff under an island: stacked dark stone columns, moss lips and hanging roots. */
function cliffColumns(r: () => number, out: Part[], cx: number, cz: number, hx: number, hz: number, depth: number, round = false) {
  const n = round ? 30 : Math.max(10, Math.round((hx + hz) * 1.6));
  for (let i = 0; i < n; i++) {
    let x: number, z: number, w: number;
    if (round) {
      const a = (i / n) * Math.PI * 2;
      x = cx + Math.cos(a) * hx * 0.93; z = cz + Math.sin(a) * hz * 0.93; w = (2 * Math.PI * hx) / n * 1.25;
    } else {
      const per = 2 * (hx + hz), d = (i / n) * per;
      if (d < 2 * hx) { x = cx - hx + d; z = cz + hz * 0.93; }
      else if (d < 2 * hx + 2 * hz) { x = cx + hx * 0.97; z = cz + hz - (d - 2 * hx); }
      else if (d < 4 * hx + 2 * hz) { x = cx + hx - (d - 2 * hx - 2 * hz); z = cz - hz * 0.93; }
      else { x = cx - hx * 0.97; z = cz - hz + (d - 4 * hx - 2 * hz); }
      w = per / n * 1.3;
    }
    const h = depth * (0.35 + r() * 0.5);
    const c = mix(0x44404c, 0x2e2a36, r());
    // upper course (lit, a bit lighter) over a darker, deeper course: the cliff fades into the abyss
    out.push({ g: box(w, h * 0.45, w * 0.9), c: shade(c, 1.15), p: [x, -0.4 - h * 0.225, z], r: [0, r() * 0.5, 0] });
    out.push({ g: box(w * 0.92, h * 0.6, w * 0.85), c: shade(c, 0.75), p: [x + (r() - 0.5) * 0.2, -0.4 - h * 0.45 - h * 0.3, z], r: [0, r() * 0.5, 0] });
    out.push({ g: box(w * 0.7, h * 0.6, w * 0.7), c: shade(c, 0.5), p: [x + (r() - 0.5) * 0.4, -0.4 - h - h * 0.3, z + (r() - 0.5) * 0.4] });
    if (r() < 0.55) out.push({ g: box(w * 1.05, 0.22, w), c: shade(ST.moss, 0.8 + r() * 0.3), p: [x, -0.36, z] }); // moss lip
    if (r() < 0.35) { // hanging roots
      const rl = 1.2 + r() * 2.6;
      out.push({ g: cyl(0.03, 0.06, rl, 4), c: 0x2e2620, p: [x + (r() - 0.5) * w, -0.4 - rl / 2, z + (z > cz ? 1 : -1) * w * 0.5], r: [(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3] });
    }
  }
}
function cliffCore(r: () => number, sx: number, sz: number, depth: number, x: number, z: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, depth, 9, 4).toNonIndexed();
  g.rotateX(Math.PI);
  g.scale(sx, 1, sz);
  g.translate(x, -0.5 - depth / 2, z);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x46424e), bot = new THREE.Color(0x0e0c14), c = new THREE.Color();
  const jit = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(2)}|${pos.getY(i).toFixed(2)}|${pos.getZ(i).toFixed(2)}`;
    if (!jit.has(k)) jit.set(k, [(r() - 0.5) * 1.6, (r() - 0.5) * 1.4, (r() - 0.5) * 1.6]);
    const j = jit.get(k)!;
    pos.setXYZ(i, pos.getX(i) + j[0], pos.getY(i) + j[1], pos.getZ(i) + j[2]);
    const t = Math.min(1, Math.max(0, (-pos.getY(i)) / depth));
    c.copy(top).lerp(bot, Math.pow(t, 0.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pbr = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { pbr[i * 2] = 0; pbr[i * 2 + 1] = 0.92; } // matte rock
  g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 2));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- sky
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, sunCol: { value: new THREE.Color() }, stars: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(min(1.0, y * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -y * 9.0));
        float s = max(0.0, dot(vDir, sunDir)); c += sunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
        if (stars > 0.0 && y > 0.05) { vec3 q = floor(vDir * 260.0); float h = hash(q); c += vec3(step(0.9975, h)) * stars * (0.6 + 0.4 * sin(h * 900.0)); }
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

interface MoodKey { t: number; top: number; horizon: number; bottom: number; fog: number; sun: number; sunI: number; hemiS: number; hemiG: number; hemiI: number; lamps: number; stars: number; sunY: number }
// v0.5 cinematic palette: low-key dusk → blue hour → magic night → deep night. A warm low key light against
// a cold ambient and cold rim (strong warm / cold contrast), emissive lights doing the rest (bloom).
const MOODS: MoodKey[] = [
  { t: 0, top: 0x1c2c62, horizon: 0xc8805a, bottom: 0x0e0e1a, fog: 0x34344e, sun: 0xffb478, sunI: 2.9, hemiS: 0x7a8cc8, hemiG: 0x2c2232, hemiI: 1.0, lamps: 0.85, stars: 0.15, sunY: 0.3 },
  { t: 0.45, top: 0x101c4a, horizon: 0x96587a, bottom: 0x0c0a16, fog: 0x2a2a48, sun: 0xffa068, sunI: 2.5, hemiS: 0x6476b4, hemiG: 0x241c2a, hemiI: 0.95, lamps: 1.0, stars: 0.45, sunY: 0.22 },
  { t: 0.72, top: 0x0a1230, horizon: 0x52448a, bottom: 0x0a0814, fog: 0x20203c, sun: 0xa8b8ff, sunI: 1.8, hemiS: 0x55649e, hemiG: 0x1a1628, hemiI: 0.92, lamps: 1.15, stars: 0.8, sunY: 0.4 },
  { t: 1, top: 0x060a20, horizon: 0x2e2c66, bottom: 0x08070e, fog: 0x16162c, sun: 0x92a6ff, sunI: 1.55, hemiS: 0x4a5894, hemiG: 0x14111e, hemiI: 0.9, lamps: 1.25, stars: 1, sunY: 0.5 },
];

export function buildEnvironment(scene: THREE.Scene, arenas: number, quality: Quality, arenaZ: (a: number) => number, slotColors: number[]): Env {
  const r = rng(4242);
  const updaters: ((dt: number, t: number) => void)[] = [];
  const mid = (arenaZ(0) + arenaZ(arenas - 1)) / 2;
  const ultra = quality === 'ultra', high = quality === 'high' || ultra, lite = quality === 'battery';

  // ---------------- lights (driven by the mood) ----------------
  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x6a5a3a, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-40, 60, 30);
  sun.target.position.set(0, 0, mid);
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x7ab4ff, 1.1); // cold back light: silhouettes pop against the dark
  rim.position.set(40, 25, -30);
  scene.add(rim);
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(ultra ? 4096 : 2048, ultra ? 4096 : 2048);
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -55; c.right = 55; c.top = 40; c.bottom = -40; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }

  // ---------------- sky dome ----------------
  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 16), skyMat);
  sky.position.set(0, 0, mid);
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0x34344e, 0.0052); // depth haze
  scene.background = null;

  // ---------------- the abyss: dark cloud sea + drifting mist ----------------
  const cloudTex = cloudTexture();
  const seaMats: THREE.MeshBasicMaterial[] = [];
  for (const [y, op, speed] of (lite ? [[-22, 0.8, 0.004]] : [[-22, 0.85, 0.004], [-36, 0.7, 0.0025]]) as [number, number, number][]) {
    const t = cloudTex.clone(); t.needsUpdate = true; t.repeat.set(6, 6);
    const mat = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff, transparent: true, opacity: op, depthWrite: false });
    seaMats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), mat);
    m.position.set(0, y, mid);
    scene.add(m);
    updaters.push(dt => { t.offset.x += dt * speed; t.offset.y += dt * speed * 0.4; });
  }
  const glowTex = glowTexture();
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < (lite ? 6 : 16); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    const near = i < 4;
    // near mist hangs just under the islands (depth between the arenas), far mist drifts on the horizon
    s.position.set((r() - 0.5) * (near ? 120 : 260), near ? -5 - r() * 8 : -6 + r() * 26, near ? mid + (r() - 0.5) * 70 : mid - 60 - r() * 120);
    s.scale.set(near ? 30 + r() * 30 : 40 + r() * 50, near ? 8 + r() * 6 : 14 + r() * 12, 1);
    s.userData.near = near;
    scene.add(s); puffs.push(s);
  }
  updaters.push(dt => { for (const p of puffs) { p.position.x += dt * (p.userData.near ? 0.6 : 1.2); if (p.position.x > 160) p.position.x = -160; } });

  // ---------------- distant floating islands with towers, mountains ----------------
  {
    const parts: Part[] = [];
    const glow: Part[] = [];
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI * 0.95 + (i / 15) * Math.PI * 0.9 + (r() - 0.5) * 0.15;
      const dist = 100 + r() * 110;
      const x = Math.cos(ang) * dist * 1.25, z = mid + Math.sin(ang) * dist - 20, y = -4 + r() * 34, rad = 4 + r() * 9;
      parts.push({ g: cyl(rad, rad * 0.95, 1.4, 9), c: 0x4a4656, p: [x, y, z] }, { g: cyl(rad * 1.02, rad * 1.02, 0.4, 9), c: 0x34502e, p: [x, y + 0.5, z] });
      parts.push({ g: cone(rad * 0.95, rad * (1.6 + r()), 8), c: 0x3a3646, p: [x, y - 0.6 - rad * 0.8, z], r: [Math.PI, 0, 0] });
      for (let k = 0; k < 3; k++) { const tx = x + (r() - 0.5) * rad, tz = z + (r() - 0.5) * rad, h = 2 + r() * 3; parts.push({ g: cone(h * 0.5, h * 1.6, 6), c: 0x1e3a28, p: [tx, y + 0.7 + h * 0.8, tz] }); }
      if (r() < 0.55) {
        const tx = x + (r() - 0.5) * rad * 0.6, tz = z + (r() - 0.5) * rad * 0.6, th = 4 + r() * 8, tr = 0.8 + r() * 0.8;
        parts.push({ g: cyl(tr, tr * 1.1, th, 8), c: 0x5a5866, p: [tx, y + 0.7 + th / 2, tz] }, { g: cone(tr * 1.5, th * 0.4, 8), c: i % 2 ? 0x2a3a7a : 0x6a2a2a, p: [tx, y + 0.7 + th + th * 0.2, tz] });
        glow.push({ g: box(0.4, 0.6, 0.3), c: 0xffb060, p: [tx, y + 0.7 + th * 0.7, tz + tr * 0.95] });
        if (r() < 0.5) glow.push({ g: oct(tr * 0.5), c: i % 2 ? 0x6ad8ff : 0xc08aff, p: [tx, y + 0.7 + th * 1.5, tz], s: [0.7, 1.6, 0.7] });
      }
      if (r() < 0.4) glow.push({ g: box(0.9, rad * 1.6, 0.1), c: 0x8ab0d0, p: [x + rad * 0.3, y - rad * 0.8, z + rad * 0.85] });
    }
    for (let i = 0; i < 12; i++) {
      const x = -260 + i * 48 + r() * 20, h = 50 + r() * 70, zz = mid - 300 - r() * 60;
      parts.push({ g: cone(30 + r() * 25, h, 6), c: 0x2e3650, p: [x, -30 + h / 2, zz] });
      parts.push({ g: cone(10 + r() * 6, h * 0.3, 6), c: 0x8a98b8, p: [x, -30 + h * 0.86, zz + 4] });
    }
    scene.add(new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    scene.add(new THREE.Mesh(mergeParts(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) })));
  }

  // ---------------- materials ----------------
  const flag = flagstoneTextures('flag', [104, 106, 116], 0.55, ultra ? 2 : 1);
  const pathMat = surfaceMaterial({ map: flag.map, normalMap: flag.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.88, metalness: 0, envMapIntensity: 0.45, color: 0xc4c4cc });
  const mossT = mossTexture();
  if (ultra) for (const t of [flag.map, flag.normal, mossT]) { t.anisotropy = 16; t.needsUpdate = true; }
  const groundMat = surfaceMaterial({ map: mossT, roughness: 1, metalness: 0, envMapIntensity: 0.3, color: 0xb8c8a8 });
  const propMat = litMaterial({ rim: 0.18 });
  const windUniform = { value: 0 };
  const treeMat = litMaterial({ rim: 0.22 });
  const baseCompile = treeMat.onBeforeCompile;
  treeMat.onBeforeCompile = (sh, rr) => {
    baseCompile(sh, rr);
    sh.uniforms.uTime = windUniform;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hgt = max(0.0, position.y - 0.9);
      transformed.x += sin(uTime * 1.7 + position.x * 0.35 + position.z * 0.2) * 0.045 * hgt;
      transformed.z += cos(uTime * 1.3 + position.x * 0.2) * 0.03 * hgt;`);
  };
  treeMat.customProgramCacheKey = () => 'lit-tree-wind';
  updaters.push((_dt, t) => { windUniform.value = t; });
  // emissive bits (lanterns, runes, crystals) in HDR so the bloom catches them
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.7, 1.7, 1.7) });
  const fallTex = waterfallTexture();
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, color: 0x9ac8e8, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  const waterTex = fallTex.clone(); waterTex.needsUpdate = true; waterTex.repeat.set(2, 0.6);
  const waterMat = reflective(surfaceMaterial({ map: waterTex, color: 0x2a6a9a, transparent: true, opacity: 0.9, roughness: 0.15, metalness: 0.1, envMapIntensity: 1.2 }, true));
  updaters.push(dt => { fallTex.offset.y += dt * 0.9; waterTex.offset.y += dt * 0.35; });

  const lampMats: THREE.PointsMaterial[] = [];
  const lampSpots: { p: THREE.Vector3; c: number; torch: boolean }[] = [];
  const gateMats: { ring: THREE.MeshBasicMaterial; disc: THREE.MeshBasicMaterial; glow: THREE.SpriteMaterial }[] = [];
  const gateBoss: ((b: boolean) => void)[] = [];
  const mergedGlow = (parts: Part[]) => new THREE.Mesh(mergeParts(parts), glowMat);

  // ---------------- v0.7: nearer floating isles (behind the arenas) with live waterfalls, gently bobbing ----------------
  if (!lite) {
    const n = ultra ? 5 : 4;
    for (let i = 0; i < n; i++) {
      // just beyond the far cliffs, at the level of the islands: their tops peek over the ruins in play and the
      // whole chain shows when the camera is zoomed out (the tactical camera looks down: the sky is never in frame)
      const ang = -Math.PI * 0.86 + (i / (n - 1)) * Math.PI * 0.72 + (r() - 0.5) * 0.1;
      const x = Math.cos(ang) * (46 + r() * 36), z = mid - 14 - (16 + r() * 28), y = -3 + r() * 6, rad = 3 + r() * 3.5;
      const parts: Part[] = [], glows: Part[] = [];
      parts.push({ g: cyl(rad, rad * 0.9, 1.2, 10), c: 0x4a4656, p: [0, 0, 0] }, { g: cyl(rad * 1.03, rad * 1.03, 0.35, 10), c: 0x3a5a30, p: [0, 0.6, 0] });
      parts.push({ g: cone(rad * 0.92, rad * (1.7 + r() * 0.6), 8), c: 0x363240, p: [0, -0.6 - rad * 0.85, 0], r: [Math.PI, 0, 0] });
      for (let k = 0; k < 4; k++) { const h = 1.6 + r() * 2.2; parts.push({ g: cone(h * 0.45, h * 1.5, 6), c: mix(0x1e3a28, 0x2c5a34, r()), p: [(r() - 0.5) * rad * 1.1, 0.75 + h * 0.75, (r() - 0.5) * rad * 1.1] }); }
      if (r() < 0.7) { const th = 2.5 + r() * 3; parts.push({ g: cyl(0.5, 0.6, th, 7), c: 0x5a5866, p: [(r() - 0.5) * rad * 0.6, 0.75 + th / 2, (r() - 0.5) * rad * 0.6] }); glows.push({ g: oct(0.3), c: i % 2 ? 0x6ad8ff : 0xc08aff, p: [0, 0.75 + th + 0.5, 0], s: [0.7, 1.5, 0.7] }); }
      const group = new THREE.Group();
      group.position.set(x, y, z);
      const m = new THREE.Mesh(mergeParts(parts), propMat); group.add(m);
      if (glows.length) group.add(mergedGlow(glows));
      // waterfall pouring off the edge facing the arenas, animated by the shared texture offset
      const fall = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(rad * 0.45, rad * 2.4), 1, 2.5), fallMat);
      fall.position.set(rad * 0.35, -0.3 - rad * 1.2, rad * 0.92); fall.renderOrder = 2;
      group.add(fall);
      scene.add(group);
      const ph = r() * 6.28, bob = 0.5 + r() * 0.5;
      updaters.push((_dt, t) => { group.position.y = y + Math.sin(t * 0.25 + ph) * bob; group.rotation.y = Math.sin(t * 0.07 + ph) * 0.03; });
    }
  }

  const laneDecor = new Map<string, { f: FactionId; group: THREE.Group; update: (dt: number, t: number) => void }>();
  const env: Env = {
    update: (dt, t) => { updaters.forEach(u => u(dt, t)); laneDecor.forEach(d => d.update(dt, t)); },
    setMood: () => {},
    setLaneFaction: () => {},
    setFocus: () => {},
    coreCrystals: [], coreGroups: [], coreLights: [], bastions: [], sun,
  };

  /** Rift gate: stepped dais, ring of voussoirs with violet runes, a spinning vortex over a dark core, floating rocks. */
  function buildGate(px: number, z0: number, sg: number, props: Part[], glows: Part[]) {
    const R = 3.0, cy = 3.35;
    props.push({ g: box(3.4, 0.32, 8.4), c: ST.dark, p: [px, 0.26, z0] }, { g: box(2.6, 0.3, 7.2), c: ST.stone, p: [px, 0.56, z0] });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const y = cy + Math.sin(a) * R, z = z0 + Math.cos(a) * R;
      if (y < 0.4) continue;
      props.push({ g: box(1.0, 0.85, (2 * Math.PI * R) / 16 * 0.94), c: mix(0x3e3a4a, 0x5a5466, (i % 3) / 2), p: [px, y, z], r: [Math.PI / 2 - a, 0, 0] });
      if (i % 2 === 0) glows.push({ g: box(0.06, 0.32, 0.18), c: 0xb07aff, p: [px - sg * 0.52, y, z], r: [Math.PI / 2 - a, 0, 0] });
    }
    // flanking obelisks
    for (const ez of [-1, 1]) {
      props.push({ g: box(0.8, 4.6, 0.8), c: 0x3e3a4a, p: [px, 2.7, z0 + ez * 3.9] }, { g: cone(0.6, 1.2, 4), c: 0x2e2a38, p: [px, 5.6, z0 + ez * 3.9], r: [0, Math.PI / 4, 0] });
      glows.push({ g: oct(0.24), c: 0xd0a0ff, p: [px, 6.5, z0 + ez * 3.9], s: [0.8, 1.6, 0.8] });
      glows.push({ g: box(0.05, 2.4, 0.16), c: 0x9a5aff, p: [px - sg * 0.42, 2.8, z0 + ez * 3.9] });
    }
    const group = new THREE.Group();
    group.position.set(px, cy, z0);
    scene.add(group);
    const core = new THREE.Mesh(new THREE.CircleGeometry(R - 0.35, 40), new THREE.MeshBasicMaterial({ color: 0x0a0614, side: THREE.DoubleSide }));
    core.rotation.y = Math.PI / 2;
    core.position.x = sg * 0.15;
    const discMat = new THREE.MeshBasicMaterial({ map: vortexTexture(), color: new THREE.Color(0xa070ff).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 40), discMat);
    disc.rotation.y = Math.PI / 2;
    const disc2 = new THREE.Mesh(new THREE.CircleGeometry(R - 0.9, 40), discMat);
    disc2.rotation.y = Math.PI / 2; disc2.position.x = -sg * 0.05;
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc08aff).multiplyScalar(1.8), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.42, 0.05, 6, 48), ringMat);
    ring.rotation.y = Math.PI / 2;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8a4aff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(9, 9, 1);
    group.add(core, disc, disc2, ring, halo);
    // floating rocks orbiting the gate
    const rockParts: Part[] = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const rr = R + 0.9 + (i % 3) * 0.35; rockParts.push({ g: oct(0.18 + (i % 3) * 0.1), c: mix(0x3e3a4a, 0x5a5466, i % 2), p: [-sg * (0.5 + (i % 2)), Math.sin(a) * rr, Math.cos(a) * rr], r: [i, i * 2, i * 3] }); }
    const rocksM = new THREE.Mesh(mergeParts(rockParts), propMat);
    group.add(rocksM);
    gateMats.push({ ring: ringMat, disc: discMat, glow: halo.material });
    let spin = 1;
    gateBoss.push(b => { spin = b ? 2.4 : 1; });
    updaters.push((dt, t) => {
      disc.rotation.x += dt * 1.2 * sg * spin; disc2.rotation.x -= dt * 1.9 * sg * spin;
      rocksM.rotation.x += dt * 0.12 * sg * spin;
      rocksM.position.y = Math.sin(t * 0.8 + px) * 0.12;
      halo.material.opacity = (0.35 + Math.sin(t * 2 + px) * 0.08) * (spin > 1 ? 1.4 : 1);
    });
  }

  /** Round flagstone plaza around the Bastion (organic edge sinking into the moss). */
  function plazaGeometry(z0: number, rad: number): THREE.BufferGeometry {
    const g = new THREE.RingGeometry(0.01, rad + 1.2, 56, 10);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z), an = Math.atan2(z, x);
      const edge = rad + Math.sin(an * 5) * 0.3 + Math.sin(an * 11 + 1) * 0.15;
      pos.setY(i, d > edge ? 0.2 - (d - edge) * 0.55 : 0.2);
      uv.setXY(i, x / 3, (z + z0) / 3);
    }
    g.translate(0, 0, z0);
    g.computeVertexNormals();
    return g;
  }

  for (let a = 0; a < arenas; a++) {
    for (const [mx, mw] of [[-29, 40], [0, 26], [29, 40]] as [number, number][]) for (const [dy, dz, op] of (high ? [[-5.5, ISLE_HW + 2.5, 1], [-9, ISLE_HW + 6, 0.8]] : [[-6.5, ISLE_HW + 3.5, 1]]) as [number, number, number][]) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
      s.position.set(mx + (r() - 0.5) * 4, dy, arenaZ(a) + dz);
      s.scale.set(mw * 1.3, 9, 1);
      s.userData.near = true; s.userData.op = op;
      scene.add(s); puffs.push(s);
    }
  }
  for (let a = 0; a < arenas; a++) {
    const z0 = arenaZ(a);
    const enemyArena = a > 0;
    const path: THREE.BufferGeometry[] = [], ground: THREE.BufferGeometry[] = [];
    const rocks: THREE.BufferGeometry[] = [];
    const props: Part[] = [], trees: Part[] = [], glows: Part[] = [], cliffs: Part[] = [], tufts: Part[] = [];
    const falls: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [];
    const torches: THREE.Vector3[] = [], lanterns: THREE.Vector3[] = [], mist: THREE.Vector3[] = [];
    const tint = enemyArena ? 0xff5a7a : 0x5fd0ff;

    for (const sg of [-1, 1]) {
      const slot = sg < 0 ? 0 : 1;
      const len = LANE_END - LANE_START, cx = sg * (LANE_START + len / 2);
      // flagstone battlefield over a mossy island top (top 0.12: the path edges sink into it)
      // lane flagstones start exactly where the bridge ones end (x = 13): abutting, never overlapping
      const laneLen = LANE_END + 0.3 - LANE_START;
      path.push(pathGeometry(sg * (LANE_START + laneLen / 2), z0, laneLen, PATH_HW, sg * 1.7 + a * 3.1));
      ground.push(worldUV(new THREE.BoxGeometry(len + 1, 0.6, ISLE_HW * 2).translate(cx, -0.18, z0), 0.22));
      cliffColumns(r, cliffs, cx, z0, len / 2, ISLE_HW, 9);
      rocks.push(cliffCore(r, len * 0.46, ISLE_HW * 0.8, 20 + r() * 5, cx, z0));
      // low ruined walls along the path, iron lanterns leaning over it
      for (const ez of [-1, 1]) {
        stoneWall(props, sg * (LANE_START + 1.6), sg * (LANE_END - 6), z0 + ez * (PATH_HW + 0.75), r);
        for (let x = LANE_START + 3.5; x < LANE_END - 6; x += 6.5) lanternPost(props, glows, lanterns, sg * (x + (ez > 0 ? 3.2 : 0)), z0 + ez * (PATH_HW + 0.35), -ez);
      }
      // grass tufts softening the path border
      for (let x = LANE_START + 0.5; x < LANE_END - 1; x += 0.45 + r() * 0.5) for (const ez of [-1, 1]) if (r() < 0.55) tuft(tufts, sg * x, 0.1, z0 + ez * (PATH_HW + 0.05 + r() * 0.5), 0.8 + r() * 0.6, r);
      // far side (z−): ruins — arches, broken columns, a guardian statue, dark pines
      const zf = z0 - (PATH_HW + 1.85);
      let k = 0;
      for (let x = LANE_START + 4; x < LANE_END - 7; x += 5.5 + r() * 2.5, k++) {
        const X = sg * x;
        if (k % 3 === 0) ruinArch(props, glows, X, zf - 0.3, 2.6, 2.3 + r() * 0.6, r, r() < 0.35, tint);
        else if (k % 3 === 1) brokenColumn(props, X, zf + (r() - 0.5) * 0.6, 1.2 + r() * 1.6, r);
        else pine(trees, X, 0.12, zf - 0.2 + (r() - 0.5) * 0.6, 0.85 + r() * 0.45, r);
        if (r() < 0.6) pine(trees, X + sg * 2.4, 0.12, z0 - (ISLE_HW - 0.9), 0.8 + r() * 0.5, r);
        if (r() < 0.5) rock(props, X + sg * 1.4, 0.12, zf + 0.6, 0.7 + r() * 0.5, r);
      }
      statue(props, glows, sg * (LANE_START + len * 0.52), zf + 0.1, 0.95, 1, tint);
      // near side (z+): kept low so units stay readable — rocks, bushes, a dead tree at the far end
      for (let x = LANE_START + 2; x < LANE_END - 3; x += 2.6 + r() * 2) {
        const zn = z0 + PATH_HW + 1.5 + r() * 1.0;
        if (r() < 0.45) bush(trees, sg * x, 0.12, zn, 0.7 + r() * 0.4, r);
        else if (r() < 0.6) rock(props, sg * x, 0.12, zn, 0.6 + r() * 0.5, r);
      }
      deadTree(props, sg * (LANE_END - 4), z0 + ISLE_HW - 1.6, 1.1, r);
      // banners at the lane entrance (player colours, red in the enemy arena) on stone pillars
      const flagC = enemyArena ? 0xa8283e : slotColors[slot];
      for (const ez of [-1, 1]) {
        const bx = sg * (LANE_START + 0.7), bz = z0 + ez * (PATH_HW + 0.5);
        props.push({ g: box(0.5, 2.6, 0.5), c: ST.stone, p: [bx, 1.4, bz] }, { g: box(0.62, 0.14, 0.62), c: ST.light, p: [bx, 2.75, bz] }, { g: cone(0.3, 0.5, 4), c: ST.dark, p: [bx, 3.07, bz], r: [0, Math.PI / 4, 0] });
        props.push({ g: box(0.05, 1.5, 0.7), c: flagC, p: [bx + sg * 0.27, 1.85, bz], pbr: [0, 0.7] }, { g: box(0.07, 0.07, 0.8), c: ST.gold, p: [bx + sg * 0.28, 2.62, bz], pbr: [0.72, 0.32] });
        glows.push({ g: oct(0.09), c: tint, p: [bx + sg * 0.31, 2.0, bz], s: [0.4, 1.3, 1] });
      }
      // rift gate at the spawn end
      buildGate(sg * (LANE.spawnX + 5), z0, sg, props, glows);
      for (let i = 0; i < 4; i++) pine(trees, sg * (LANE_END - 1.5 - r() * 2), 0.12, z0 + (r() < 0.5 ? -1 : 1) * (4.6 + r() * 2), 0.9 + r() * 0.4, r);
      // river under the bridge + waterfalls on both sides
      const gx = sg * ((CORE_R + LANE_START) / 2);
      water.push(scaleUV(new THREE.PlaneGeometry(LANE_START - CORE_R + 0.6, ISLE_HW * 2 + 2).rotateX(-Math.PI / 2).translate(gx, -0.75, z0), 1, 3));
      for (const ez of [-1, 1]) falls.push(scaleUV(new THREE.PlaneGeometry(LANE_START - CORE_R, 16).translate(gx, -8.7, z0 + ez * (ISLE_HW + 0.9)), 1, 3.5));
      props.push({ g: box(LANE_START - CORE_R + 0.6, 1.2, ISLE_HW * 2 + 2), c: 0x3a3844, p: [gx, -1.45, z0] });
      for (const ez of [-1, 1]) mist.push(new THREE.Vector3(gx, -14, z0 + ez * (ISLE_HW + 1)));
      stoneBridge(props, torches, gx, z0, LANE_START - CORE_R + 1.4, PATH_HW * 2 - 0.4);
      // bridge flagstones: from the island edge (10.3) to the lane (13), edges folded under the deck
      path.push(pathGeometry(sg * ((BRIDGE_X0 + LANE_START) / 2), z0, LANE_START - BRIDGE_X0, PATH_HW - 0.6, 9 + sg, 1 / 3, 0.2, PATH_HW - 0.35));
    }

    // ---------------- Core island: plaza, guardians, lanterns, crystals, the Bastion ----------------
    ground.push(worldUV(new THREE.CylinderGeometry(CORE_R, CORE_R, 0.6, 40).translate(0, -0.18, z0), 0.22));
    path.push(plazaGeometry(z0, 5.6));
    // plaza → bridge strips, 1 cm lower than the plaza so the plaza wins where they overlap (no z-fighting)
    for (const sg of [-1, 1]) path.push(pathGeometry(sg * ((5.0 + BRIDGE_X0) / 2), z0, BRIDGE_X0 - 5.0, PATH_HW - 0.6, 5 + sg, 1 / 3, 0.19));
    cliffColumns(r, cliffs, 0, z0, CORE_R, CORE_R, 11, true);
    rocks.push(cliffCore(r, CORE_R * 0.85, CORE_R * 0.8, 26, 0, z0));
    for (const ang of [-0.55, -1.0, -2.15, -2.6]) pine(trees, Math.cos(ang) * (CORE_R - 1.6), 0.12, z0 + Math.sin(ang) * (CORE_R - 1.6), 1.0 + r() * 0.3, r);
    for (const sx of [-1, 1]) statue(props, glows, sx * 3.6, z0 - 6.6, 1.15, 1, tint);
    for (const ang of [Math.PI / 4, Math.PI * 3 / 4, -Math.PI / 4, -Math.PI * 3 / 4]) lanternPost(props, glows, lanterns, Math.cos(ang) * 6.3, z0 + Math.sin(ang) * 6.3, -Math.sign(Math.sin(ang)), 2.5);
    for (const ang of [Math.PI / 2 + 0.55, Math.PI / 2 - 0.55]) {
      const cx = Math.cos(ang) * (CORE_R - 2.4), cz = z0 + Math.sin(ang) * (CORE_R - 2.4);
      for (let i = 0; i < 5; i++) glows.push({ g: oct(0.3), c: shade(tint, 0.75 + r() * 0.4), p: [cx + (r() - 0.5) * 1.3, 0.5 + r() * 0.4, cz + (r() - 0.5) * 1.3], s: [0.55, 1.6 + r() * 1.2, 0.55], r: [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6] });
      props.push({ g: oct(0.7), c: ST.dark, p: [cx, 0.2, cz], s: [1.5, 0.5, 1.5] });
      mist.push(new THREE.Vector3(cx, 1.2, cz));
    }
    stoneWall(props, -2.2, 2.2, z0 - CORE_R + 1.2, r, 0.7, 0.1);

    // the Bastion (monumental Core) — see bastion.ts
    const bastion = buildBastion(enemyArena, high);
    bastion.group.position.set(0, 0, z0);
    scene.add(bastion.group);
    env.coreGroups.push(bastion.group); env.coreCrystals.push(bastion.crystal); env.coreLights.push(bastion.light); env.bastions.push(bastion);
    updaters.push((dt, t) => bastion.update(dt, t));

    // ---------------- merged statics ----------------
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!geos.length) return null;
      const m = new THREE.Mesh(mergeGeometries(geos)!, mat);
      m.receiveShadow = shadow;
      scene.add(m);
      return m;
    };
    add(ground, groundMat, high);
    add(path, pathMat, high);
    const propMesh = new THREE.Mesh(mergeParts(props), propMat);
    propMesh.receiveShadow = propMesh.castShadow = high;
    scene.add(propMesh);
    // cliffs hang under the islands: they never cast a visible shadow, keep them out of the shadow pass
    scene.add(new THREE.Mesh(mergeGeometries([...rocks, mergeParts(cliffs)])!, propMat));
    scene.add(new THREE.Mesh(mergeParts(tufts), treeMat));
    const treeMesh = new THREE.Mesh(mergeParts(trees), treeMat);
    treeMesh.castShadow = high; treeMesh.receiveShadow = high;
    scene.add(treeMesh);
    scene.add(mergedGlow(glows));
    add(water, waterMat, false);
    const fm = add(falls, fallMat, false);
    if (fm) fm.renderOrder = 2;

    // soft glows: waterfall mist + crystals
    const mistCols: number[] = [];
    const tc = new THREE.Color(tint).multiplyScalar(0.8), wc = new THREE.Color(0x8aa8c8);
    for (const p of mist) { const c = p.y < 0 ? wc : tc; mistCols.push(c.r, c.g, c.b); }
    const gg = new THREE.BufferGeometry().setFromPoints(mist);
    gg.setAttribute('color', new THREE.Float32BufferAttribute(mistCols, 3));
    scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 5, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));

    lampSpots.push(...lanterns.map(p => ({ p, c: 0xffa456, torch: false })), ...torches.map(p => ({ p, c: 0xff8a3a, torch: true })));
    // lantern halos (night lights, mood-driven)
    const lampGeo = new THREE.BufferGeometry().setFromPoints(lanterns);
    const lampMat = new THREE.PointsMaterial({ map: glowTex, size: 1.8, color: 0xffa050, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    lampMats.push(lampMat);
    scene.add(new THREE.Points(lampGeo, lampMat));

    // brazier flames
    const fg = new THREE.BufferGeometry().setFromPoints(torches);
    const flames = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, size: 1.6, color: 0xff9030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(flames);
    const flameCores = new THREE.InstancedMesh(new THREE.ConeGeometry(0.15, 0.48, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc060).multiplyScalar(2), toneMapped: false }), torches.length);
    scene.add(flameCores);
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sv = new THREE.Vector3();
    updaters.push((_dt, t) => {
      (flames.material as THREE.PointsMaterial).size = 1.5 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.1;
      torches.forEach((p, i) => {
        const f = 1 + Math.sin(t * 15 + i * 1.7) * 0.18;
        m4.compose(p, q0, sv.set(f, f * (1 + Math.sin(t * 11 + i) * 0.15), f));
        flameCores.setMatrixAt(i, m4);
      });
      flameCores.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------- per-lane faction decor + ambient particles ----------------
  env.setLaneFaction = (arena: number, slot: number, f: FactionId) => {
    if (arena >= arenas) return;
    const key = arena + ':' + slot;
    const cur = laneDecor.get(key);
    if (cur && cur.f === f) return;
    if (cur) { scene.remove(cur.group); cur.group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    const sg = slot === 0 ? -1 : 1, z0 = arenaZ(arena);
    const rr = rng(1000 + arena * 17 + slot * 5 + f.length * 31);
    const d = factionDecor(f, sg, z0, LANE_START, LANE_END - 6, PATH_HW, ISLE_HW, rr);
    const group = new THREE.Group();
    if (d.parts.length) { const m = new THREE.Mesh(mergeParts(d.parts), propMat); m.castShadow = m.receiveShadow = high; group.add(m); }
    if (d.glow.length) group.add(mergedGlow(d.glow));
    const L = FACTION_LOOK[f];
    if (d.glowPts.length) {
      const gg = new THREE.BufferGeometry().setFromPoints(d.glowPts);
      group.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 3.2, color: new THREE.Color(L.glow).multiplyScalar(0.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    // ambient particles (motion by faction)
    const N = lite ? 18 : ultra ? 90 : 46;
    const seeds = Array.from({ length: N }, () => ({ x: sg * (LANE_START + 1 + rr() * (LANE_END - LANE_START - 4)), z: z0 + (rr() - 0.5) * ISLE_HW * 2, y: rr() * 3, s: 0.4 + rr() * 0.8, ph: rr() * 6.28 }));
    const pos = new Float32Array(N * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, size: L.motion === 'soul' ? 0.5 : 0.28, color: new THREE.Color(L.particle).multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false;
    group.add(pts);
    scene.add(group);
    const update = (_dt: number, t: number) => {
      for (let i = 0; i < N; i++) {
        const p = seeds[i];
        let x = p.x, y = p.y, z = p.z;
        const ph = t * p.s + p.ph;
        switch (L.motion) {
          case 'float': y = 0.6 + p.y * 0.8 + Math.sin(ph) * 0.4; x += Math.sin(ph * 0.5) * 0.3; break;
          case 'rise': y = 0.2 + ((t * 0.6 * p.s + p.ph) % 1) * 2.6; x += Math.sin(ph * 3) * 0.08; break;
          case 'drift': y = 0.4 + p.y * 0.7 + Math.sin(ph) * 0.3; x += Math.sin(ph * 0.3) * 1.2; z += Math.cos(ph * 0.4) * 0.6; break;
          case 'bubble': y = 0.2 + ((t * 0.35 * p.s + p.ph) % 1) * 3.2; x += Math.sin(ph * 2) * 0.12; break;
          case 'ember': y = 0.2 + ((t * 0.5 * p.s + p.ph) % 1) * 4; x += Math.sin(ph * 1.3) * 0.5; z += Math.cos(ph) * 0.3; break;
          case 'soul': { const k = (t * 0.12 * p.s + p.ph) % 1; y = 0.3 + k * 2.6; x += Math.cos(ph) * 0.5; z += Math.sin(ph) * 0.5; break; }
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      }
      pg.attributes.position.needsUpdate = true;
    };
    laneDecor.set(key, { f, group, update });
  };

  // ---------------- ULTRA: real warm lights on the 8 lanterns / braziers nearest to the camera focus ----------------
  if (ultra) {
    const pool = Array.from({ length: 8 }, () => { const l = new THREE.PointLight(0xffa456, 0, 7.5, 2); scene.add(l); return { l, spot: null as null | (typeof lampSpots)[number] }; });
    let fx = 0, fz = 0, acc = 1;
    env.setFocus = (x, z) => { fx = x; fz = z; };
    updaters.push((dt, t) => {
      acc += dt;
      if (acc > 0.3) { // re-pick the nearest spots a few times per second (light count stays fixed: no shader recompiles)
        acc = 0;
        const near = lampSpots.map(s => ({ s, d: (s.p.x - fx) ** 2 + (s.p.z - fz) ** 2 })).sort((a, b) => a.d - b.d).slice(0, pool.length);
        pool.forEach((e, i) => { e.spot = near[i]?.s ?? null; if (e.spot) { e.l.position.copy(e.spot.p); e.l.color.setHex(e.spot.c); } });
      }
      pool.forEach((e, i) => { e.l.intensity = e.spot ? (e.spot.torch ? 5.5 + Math.sin(t * 13 + i * 1.7) * 0.9 : 3.6 + Math.sin(t * 3 + i) * 0.2) * lampLevel : 0; });
    });
  }
  let lampLevel = 1;

  // ---------------- birds ----------------
  if (!lite) {
    const n = 12;
    const birdGeo = mergeParts([{ g: box(0.5, 0.04, 0.16), c: 0x16161e, p: [-0.25, 0, 0], r: [0, 0, 0.35] }, { g: box(0.5, 0.04, 0.16), c: 0x16161e, p: [0.25, 0, 0], r: [0, 0, -0.35] }]);
    const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), n);
    birds.frustumCulled = false;
    scene.add(birds);
    const seeds = Array.from({ length: n }, () => ({ r: 18 + r() * 30, y: 10 + r() * 8, sp: 0.15 + r() * 0.15, ph: r() * 6, cx: (r() - 0.5) * 60 }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    updaters.push((_dt, t) => {
      seeds.forEach((b, i) => {
        const a = t * b.sp + b.ph;
        const flap = 0.6 + Math.sin(t * 9 + i) * 0.4;
        q.setFromEuler(e.set(0, -a, 0));
        m4.compose(p.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t + i) * 0.5, mid - 10 + Math.sin(a) * b.r * 0.6), q, s.set(1, flap, 1));
        birds.setMatrixAt(i, m4);
      });
      birds.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------- mood (time of day) ----------------
  const cur = { t: -1, boss: false };
  const cTop = new THREE.Color(), cHor = new THREE.Color(), cBot = new THREE.Color(), cFog = new THREE.Color(), cSun = new THREE.Color(), cHs = new THREE.Color(), cHg = new THREE.Color(), tmp = new THREE.Color();
  const BOSS = new THREE.Color(0xd83a3a);
  const gateViolet = new THREE.Color(0xa070ff), gateRed = new THREE.Color(0xff3a4a);
  env.setMood = (t: number, boss: boolean) => {
    if (Math.abs(t - cur.t) < 0.002 && boss === cur.boss) return;
    cur.t = t; cur.boss = boss;
    let i = 0;
    while (i < MOODS.length - 2 && t > MOODS[i + 1].t) i++;
    const A = MOODS[i], B = MOODS[i + 1];
    const k = Math.min(1, Math.max(0, (t - A.t) / (B.t - A.t)));
    const L = (x: number, y: number) => x + (y - x) * k;
    const C = (out: THREE.Color, x: number, y: number) => out.setHex(x).lerp(tmp.setHex(y), k);
    C(cTop, A.top, B.top); C(cHor, A.horizon, B.horizon); C(cBot, A.bottom, B.bottom); C(cFog, A.fog, B.fog);
    C(cSun, A.sun, B.sun); C(cHs, A.hemiS, B.hemiS); C(cHg, A.hemiG, B.hemiG);
    if (boss) { cHor.lerp(BOSS, 0.25); cFog.lerp(BOSS, 0.18); cTop.lerp(BOSS, 0.08); }
    const u = skyMat.uniforms;
    u.top.value.copy(cTop); u.horizon.value.copy(cHor); u.bottom.value.copy(cBot); u.sunCol.value.copy(cSun);
    u.stars.value = L(A.stars, B.stars);
    const sunY = L(A.sunY, B.sunY);
    u.sunDir.value.set(-0.5, sunY, -1).normalize();
    (scene.fog as THREE.FogExp2).color.copy(cFog);
    sun.color.copy(cSun); sun.intensity = L(A.sunI, B.sunI);
    sun.position.set(-40, 20 + sunY * 60, 30);
    hemi.color.copy(cHs); hemi.groundColor.copy(cHg); hemi.intensity = L(A.hemiI, B.hemiI);
    const lamps = L(A.lamps, B.lamps);
    for (const m of lampMats) { m.opacity = Math.min(1, lamps * 0.8); m.size = 1.4 + lamps * 1.2; }
    lampLevel = lamps;
    // the abyss takes the colour of the hour, darker than the sky so the islands stand out
    const cloud = tmp.copy(cFog).lerp(cTop, 0.3).multiplyScalar(0.85);
    for (const m of seaMats) m.color.copy(cloud);
    for (const p of puffs) { (p.material as THREE.SpriteMaterial).color.copy(cloud).multiplyScalar(p.userData.near ? 0.9 : 0.8); (p.material as THREE.SpriteMaterial).opacity = (p.userData.near ? 0.5 : 0.3) * (p.userData.op ?? 1); }
    // boss waves: the rift gates burn red and spin faster
    for (const g of gateMats) { g.disc.color.copy(boss ? gateRed : gateViolet).multiplyScalar(1.6); g.ring.color.copy(boss ? gateRed : gateViolet).multiplyScalar(1.9); g.glow.color.copy(boss ? gateRed : gateViolet); }
    for (const f of gateBoss) f(boss);
  };
  env.setMood(0, false);
  return env;
}

export { tor, sph };
