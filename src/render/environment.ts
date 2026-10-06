// Environment — "Archipel des Bastions": floating islands with deep blocky cliffs, ochre dirt lanes bordered by grass,
// wooden fences and lanterns, plank bridges with torches over rivers that pour off the edge as waterfalls, swaying
// pines, rocks and flowers, a castle guarding the Core crystal, distant floating islands, clouds, birds,
// and a day → sunset → night cycle driven by the wave number. Static parts are merged per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE } from '../sim/state';
import { Part, box, cyl, cone, oct, sph, tor, mergeParts, shade, mix } from './characters';
import { waterfallTexture, cloudTexture, glowTexture, swirlTexture, dirtTexture, grassTexture, cobbleTexture } from './textures';
import type { Quality } from './Renderer';

const LANE_START = 13.0; // lane islands run from the bridge (|x| = 13) to |x| = 46 (behind the portals)
const LANE_END = 46;
const CORE_R = 10.5;
const PATH_HW = 4.6; // dirt half-width (battlefield)
const ISLE_HW = 7.2; // island half-width (grass ledges beyond the fences)
const STONE = 0x8a8478, STONE_D = 0x5e5a54, WOOD = 0x8a5a32, WOOD_D = 0x5a3a22, PINE = 0x3f7a32, PINE_D = 0x2c5e28, TRUNK = 0x6a4228;

export interface Env {
  update(dt: number, time: number): void;
  setMood(t: number, boss: boolean): void;
  coreCrystals: THREE.Mesh[];
  coreGroups: THREE.Group[];
  coreLights: THREE.PointLight[];
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

/** Blocky cliff under an island: stacked stone columns of decreasing depth (vertex-coloured, dark below). */
function cliffColumns(r: () => number, out: Part[], cx: number, cz: number, hx: number, hz: number, depth: number, round = false) {
  const n = round ? 28 : Math.max(10, Math.round((hx + hz) * 1.6));
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
    const c = mix(0x8a7a68, 0x6a6460, r());
    out.push({ g: box(w, h, w * 0.9), c, p: [x, -0.4 - h / 2, z], r: [0, r() * 0.5, 0] });
    out.push({ g: box(w * 0.7, h * 0.6, w * 0.7), c: shade(c, 0.7), p: [x + (r() - 0.5) * 0.4, -0.4 - h - h * 0.25, z + (r() - 0.5) * 0.4] });
    if (r() < 0.5) out.push({ g: box(w * 1.05, 0.25, w), c: 0x4f7a2e, p: [x, -0.38, z] }); // moss lip
  }
}
function cliffCore(r: () => number, sx: number, sz: number, depth: number, x: number, z: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, depth, 9, 4).toNonIndexed();
  g.rotateX(Math.PI);
  g.scale(sx, 1, sz);
  g.translate(x, -0.5 - depth / 2, z);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x7a6e62), bot = new THREE.Color(0x2e2a36), c = new THREE.Color();
  const jit = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(2)}|${pos.getY(i).toFixed(2)}|${pos.getZ(i).toFixed(2)}`;
    if (!jit.has(k)) jit.set(k, [(r() - 0.5) * 1.6, (r() - 0.5) * 1.4, (r() - 0.5) * 1.6]);
    const j = jit.get(k)!;
    pos.setXYZ(i, pos.getX(i) + j[0], pos.getY(i) + j[1], pos.getZ(i) + j[2]);
    const t = Math.min(1, Math.max(0, (-pos.getY(i)) / depth));
    c.copy(top).lerp(bot, Math.pow(t, 0.7));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Stylised pine with drooping layered tiers (like the reference art). */
function pine(out: Part[], x: number, y: number, z: number, h: number, r: () => number) {
  const tint = r() * 0.25;
  out.push({ g: cyl(0.1 * h, 0.15 * h, 0.7 * h, 6), c: TRUNK, p: [x, y + 0.35 * h, z] });
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.22;
    out.push({ g: cone(0.75 * h * k, 0.75 * h, 9), c: shade(i % 2 ? PINE : PINE_D, 0.9 + tint + i * 0.06), p: [x, y + (0.75 + i * 0.5) * h, z], r: [0, r() * 3, 0] });
  }
}
function rock(out: Part[], x: number, y: number, z: number, s: number, r: () => number) {
  out.push({ g: oct(0.5 * s), c: mix(STONE, 0x9a948a, r()), p: [x, y + 0.18 * s, z], s: [1.2, 0.7, 1], r: [r(), r() * 3, r()] });
  if (r() < 0.6) out.push({ g: oct(0.3 * s), c: mix(STONE_D, STONE, r()), p: [x + 0.4 * s, y + 0.1 * s, z + 0.2 * s], r: [r(), r() * 3, r()] });
}
function bush(out: Part[], x: number, y: number, z: number, s: number, r: () => number) {
  out.push({ g: sph(0.4 * s, 1), c: shade(0x4f8a2e, 0.9 + r() * 0.3), p: [x, y + 0.25 * s, z], s: [1.2, 0.8, 1] });
  out.push({ g: sph(0.28 * s, 1), c: shade(0x6aa83a, 0.9 + r() * 0.3), p: [x + 0.3 * s, y + 0.3 * s, z + 0.1 * s] });
  if (r() < 0.5) out.push({ g: sph(0.06 * s, 0), c: [0xff6a8a, 0xffe060, 0xffffff][Math.floor(r() * 3)], p: [x + 0.1, y + 0.55 * s, z + 0.25] });
}
function fence(out: Part[], x0: number, x1: number, z: number, lanterns: THREE.Vector3[], every = 3) {
  const sg = Math.sign(x1 - x0) || 1;
  let k = 0;
  for (let x = x0; sg > 0 ? x <= x1 : x >= x1; x += sg * 1.6, k++) {
    out.push({ g: box(0.14, 0.75, 0.14), c: WOOD_D, p: [x, 0.55, z] }, { g: box(0.18, 0.06, 0.18), c: WOOD, p: [x, 0.95, z] });
    if (Math.abs(x + sg * 1.6 - x0) <= Math.abs(x1 - x0)) {
      out.push({ g: box(1.6, 0.08, 0.07), c: WOOD, p: [x + sg * 0.8, 0.82, z] }, { g: box(1.6, 0.07, 0.06), c: shade(WOOD, 0.85), p: [x + sg * 0.8, 0.52, z] });
    }
    if (k % every === 1) {
      out.push({ g: box(0.1, 1.3, 0.1), c: WOOD_D, p: [x, 0.85, z] }, { g: box(0.22, 0.26, 0.22), c: 0x2e2a26, p: [x, 1.62, z] }, { g: cone(0.18, 0.16, 4), c: 0x2e2a26, p: [x, 1.83, z], r: [0, Math.PI / 4, 0] });
      lanterns.push(new THREE.Vector3(x, 1.62, z));
    }
  }
}

// ---------------------------------------------------------------- sky
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, sunCol: { value: new THREE.Color() }, stars: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(min(1.0, y * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -y * 3.0));
        float s = max(0.0, dot(vDir, sunDir)); c += sunCol * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.35);
        if (stars > 0.0 && y > 0.05) { vec3 q = floor(vDir * 260.0); float h = hash(q); c += vec3(step(0.9975, h)) * stars * (0.6 + 0.4 * sin(h * 900.0)); }
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}

interface MoodKey { t: number; top: number; horizon: number; bottom: number; fog: number; sun: number; sunI: number; hemiS: number; hemiG: number; hemiI: number; lamps: number; stars: number; sunY: number }
const MOODS: MoodKey[] = [
  { t: 0, top: 0x2f78d8, horizon: 0xbfe6ff, bottom: 0x8ab8d8, fog: 0xb0d8f0, sun: 0xfff0d8, sunI: 2.5, hemiS: 0xd8ecff, hemiG: 0x6a5a3a, hemiI: 1.25, lamps: 0.25, stars: 0, sunY: 0.75 },
  { t: 0.45, top: 0x4060b0, horizon: 0xffd0a0, bottom: 0xa88aa0, fog: 0xe8c0a8, sun: 0xffd090, sunI: 2.2, hemiS: 0xffe0c0, hemiG: 0x5a4a3a, hemiI: 1.1, lamps: 0.45, stars: 0, sunY: 0.45 },
  { t: 0.72, top: 0x3a3a80, horizon: 0xff8a5a, bottom: 0x6a4a6a, fog: 0xc88078, sun: 0xff8a50, sunI: 1.7, hemiS: 0xffb0a0, hemiG: 0x3a2a3a, hemiI: 0.95, lamps: 0.75, stars: 0.15, sunY: 0.18 },
  { t: 1, top: 0x0a1236, horizon: 0x2a3a72, bottom: 0x161a30, fog: 0x1e2848, sun: 0x9ab4ff, sunI: 0.85, hemiS: 0x7a8ac8, hemiG: 0x1a1a2a, hemiI: 0.75, lamps: 1.1, stars: 1, sunY: 0.5 },
];

export function buildEnvironment(scene: THREE.Scene, arenas: number, quality: Quality, arenaZ: (a: number) => number, slotColors: number[]): Env {
  const r = rng(4242);
  const updaters: ((dt: number, t: number) => void)[] = [];
  const mid = (arenaZ(0) + arenaZ(arenas - 1)) / 2;
  const high = quality === 'high', lite = quality === 'battery';

  // ---------------- lights (driven by the mood) ----------------
  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x6a5a3a, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-40, 60, 30);
  sun.target.position.set(0, 0, mid);
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.35);
  rim.position.set(40, 25, -30);
  scene.add(rim);
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -55; c.right = 55; c.top = 40; c.bottom = -40; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
  }

  // ---------------- sky dome + sun/moon ----------------
  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 16), skyMat);
  sky.position.set(0, 0, mid);
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xb0d8f0, 110, 380);
  scene.background = null;

  // ---------------- clouds: sea below + drifting puffs ----------------
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
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < (lite ? 8 : 18); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    s.position.set((r() - 0.5) * 260, -6 + r() * 26, mid - 60 - r() * 120);
    s.scale.set(40 + r() * 50, 14 + r() * 12, 1);
    scene.add(s); puffs.push(s);
  }
  updaters.push(dt => { for (const p of puffs) { p.position.x += dt * 1.2; if (p.position.x > 160) p.position.x = -160; } });

  // ---------------- distant floating islands with towers, mountains ----------------
  {
    const parts: Part[] = [];
    const glow: Part[] = [];
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI * 0.95 + (i / 15) * Math.PI * 0.9 + (r() - 0.5) * 0.15;
      const dist = 100 + r() * 110;
      const x = Math.cos(ang) * dist * 1.25, z = mid + Math.sin(ang) * dist - 20, y = -4 + r() * 34, rad = 4 + r() * 9;
      parts.push({ g: cyl(rad, rad * 0.95, 1.4, 9), c: 0x6a6070, p: [x, y, z] }, { g: cyl(rad * 1.02, rad * 1.02, 0.4, 9), c: 0x5a8a3a, p: [x, y + 0.5, z] });
      parts.push({ g: cone(rad * 0.95, rad * (1.6 + r()), 8), c: 0x5a5260, p: [x, y - 0.6 - rad * 0.8, z], r: [Math.PI, 0, 0] });
      for (let k = 0; k < 3; k++) { const tx = x + (r() - 0.5) * rad, tz = z + (r() - 0.5) * rad, h = 2 + r() * 3; parts.push({ g: cone(h * 0.5, h * 1.6, 6), c: 0x2e5a34, p: [tx, y + 0.7 + h * 0.8, tz] }); }
      if (r() < 0.55) {
        const tx = x + (r() - 0.5) * rad * 0.6, tz = z + (r() - 0.5) * rad * 0.6, th = 4 + r() * 8, tr = 0.8 + r() * 0.8;
        parts.push({ g: cyl(tr, tr * 1.1, th, 8), c: 0x8a8090, p: [tx, y + 0.7 + th / 2, tz] }, { g: cone(tr * 1.5, th * 0.4, 8), c: i % 2 ? 0x3a5ad8 : 0xc8402a, p: [tx, y + 0.7 + th + th * 0.2, tz] });
        glow.push({ g: box(0.4, 0.6, 0.3), c: 0xffd080, p: [tx, y + 0.7 + th * 0.7, tz + tr * 0.95] });
      }
      if (r() < 0.4) glow.push({ g: box(0.9, rad * 1.6, 0.1), c: 0xd8f0ff, p: [x + rad * 0.3, y - rad * 0.8, z + rad * 0.85] });
    }
    // far mountain range
    for (let i = 0; i < 12; i++) {
      const x = -260 + i * 48 + r() * 20, h = 50 + r() * 70, zz = mid - 300 - r() * 60;
      parts.push({ g: cone(30 + r() * 25, h, 6), c: 0x6a7a98, p: [x, -30 + h / 2, zz] });
      parts.push({ g: cone(10 + r() * 6, h * 0.3, 6), c: 0xe8f0ff, p: [x, -30 + h * 0.86, zz + 4] });
    }
    scene.add(new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    scene.add(new THREE.Mesh(mergeParts(glow), new THREE.MeshBasicMaterial({ vertexColors: true })));
  }

  // ---------------- materials ----------------
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTexture() });
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTexture() });
  const cobbleMat = new THREE.MeshLambertMaterial({ map: cobbleTexture() });
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const windUniform = { value: 0 };
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  treeMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = windUniform;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hgt = max(0.0, position.y - 0.9);
      transformed.x += sin(uTime * 1.7 + position.x * 0.35 + position.z * 0.2) * 0.045 * hgt;
      transformed.z += cos(uTime * 1.3 + position.x * 0.2) * 0.03 * hgt;`);
  };
  updaters.push((_dt, t) => { windUniform.value = t; });
  const crystalMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fallTex = waterfallTexture();
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, color: 0xe6f6ff, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
  const waterTex = fallTex.clone(); waterTex.needsUpdate = true; waterTex.repeat.set(2, 0.6);
  const waterMat = new THREE.MeshLambertMaterial({ map: waterTex, color: 0x4aa8e8, transparent: true, opacity: 0.92 });
  updaters.push(dt => { fallTex.offset.y += dt * 0.9; waterTex.offset.y += dt * 0.35; });
  const glowTex = glowTexture();
  const lampMats: THREE.PointsMaterial[] = [];

  const env: Env = {
    update: (dt, t) => updaters.forEach(u => u(dt, t)),
    setMood: () => {},
    coreCrystals: [], coreGroups: [], coreLights: [], sun,
  };

  for (let a = 0; a < arenas; a++) {
    const z0 = arenaZ(a);
    const enemyArena = a > 0;
    const dirt: THREE.BufferGeometry[] = [], grass: THREE.BufferGeometry[] = [], cobble: THREE.BufferGeometry[] = [];
    const rocks: THREE.BufferGeometry[] = [];
    const props: Part[] = [], trees: Part[] = [], crystals: Part[] = [];
    const falls: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [];
    const torches: THREE.Vector3[] = [], lanterns: THREE.Vector3[] = [], glows: THREE.Vector3[] = [];
    const tint = enemyArena ? 0xff5a7a : 0x5fd0ff;
    const roofC = enemyArena ? 0xc0302a : 0x3a5ad8;

    for (const sg of [-1, 1]) {
      const slot = sg < 0 ? 0 : 1;
      const len = LANE_END - LANE_START, cx = sg * (LANE_START + len / 2);
      // dirt battlefield + grass ledges
      dirt.push(scaleUV(new THREE.BoxGeometry(len, 0.7, PATH_HW * 2).translate(cx, -0.15, z0), len / 6, PATH_HW / 3));
      for (const ez of [-1, 1]) grass.push(scaleUV(new THREE.BoxGeometry(len + 1, 0.74, ISLE_HW - PATH_HW + 0.3).translate(cx, -0.15, z0 + ez * (PATH_HW + (ISLE_HW - PATH_HW) / 2 - 0.15)), len / 5, 0.6));
      cliffColumns(r, props, cx, z0, len / 2, ISLE_HW, 9);
      rocks.push(cliffCore(r, len * 0.46, ISLE_HW * 0.8, 20 + r() * 5, cx, z0));
      // fences + lanterns along the dirt
      for (const ez of [-1, 1]) fence(props, sg * (LANE_START + 1.2), sg * (LANE_END - 4), z0 + ez * (PATH_HW + 0.25), lanterns, 3);
      // ledge decoration: far side (z−) tall pines, near side (z+) low bushes and rocks
      for (let x = LANE_START + 2; x < LANE_END - 2; x += 2.2 + r() * 1.6) {
        if (r() < 0.75) pine(trees, sg * x, 0.2, z0 - (PATH_HW + 1.1 + r() * 1.2), 0.75 + r() * 0.55, r);
        if (r() < 0.5) bush(trees, sg * (x + 0.8), 0.2, z0 + PATH_HW + 0.9 + r() * 1.3, 0.8 + r() * 0.5, r);
        if (r() < 0.35) rock(props, sg * (x + 1.2), 0.2, z0 + PATH_HW + 1.2 + r() * 1.2, 0.7 + r() * 0.6, r);
        if (r() < 0.25) rock(props, sg * x, 0.2, z0 - (PATH_HW + 1.0 + r()), 0.8 + r() * 0.6, r);
      }
      // banners at the lane entrance (player colours, red in the enemy arena)
      const flag = enemyArena ? 0xc8304a : slotColors[slot];
      for (const ez of [-1, 1]) {
        const bx = sg * (LANE_START + 0.6), bz = z0 + ez * (PATH_HW + 0.3);
        props.push({ g: cyl(0.07, 0.07, 2.8, 5), c: WOOD_D, p: [bx, 1.6, bz] }, { g: box(0.8, 1.2, 0.05), c: flag, p: [bx + sg * 0.45, 2.3, bz] }, { g: box(0.84, 0.1, 0.07), c: 0xe0b040, p: [bx + sg * 0.45, 2.92, bz] });
      }
      // rift portal at the spawn end
      const px = sg * (LANE.spawnX + 5);
      props.push({ g: box(1.1, 5, 1.1), c: 0x4a4458, p: [px, 2.7, z0 - 3.0] }, { g: box(1.1, 5, 1.1), c: 0x4a4458, p: [px, 2.7, z0 + 3.0] });
      props.push({ g: box(1.4, 1.0, 7.2), c: 0x3a3448, p: [px, 5.4, z0] });
      for (const ez of [-1, 1]) crystals.push({ g: oct(0.4), c: 0xc08aff, p: [px, 6.2, z0 + ez * 3.0], s: [0.8, 1.8, 0.8] });
      crystals.push({ g: oct(0.35), c: 0xe0b0ff, p: [px, 6.1, z0], s: [0.8, 1.6, 0.8] });
      for (let k = 0; k < 4; k++) pine(trees, sg * (LANE_END - 1.5 - r() * 2), 0.2, z0 + (r() < 0.5 ? -1 : 1) * (3.8 + r() * 2.5), 1 + r() * 0.4, r);
      // river under the bridge + waterfalls on both sides
      const gx = sg * ((CORE_R + LANE_START) / 2);
      water.push(scaleUV(new THREE.PlaneGeometry(LANE_START - CORE_R + 0.6, ISLE_HW * 2 + 2).rotateX(-Math.PI / 2).translate(gx, -0.55, z0), 1, 3));
      for (const ez of [-1, 1]) falls.push(scaleUV(new THREE.PlaneGeometry(LANE_START - CORE_R, 16).translate(gx, -8.5, z0 + ez * (ISLE_HW + 0.9)), 1, 3.5));
      props.push({ g: box(LANE_START - CORE_R + 0.6, 1.2, ISLE_HW * 2 + 2), c: 0x5a564e, p: [gx, -1.25, z0] });
      // plank bridge with railings and torches
      const bw = PATH_HW * 2 - 0.2, blen = LANE_START - CORE_R + 1.2;
      props.push({ g: box(blen, 0.18, bw), c: WOOD, p: [gx, 0.1, z0] });
      for (let i = 0; i < 8; i++) props.push({ g: box(0.06, 0.03, bw), c: WOOD_D, p: [gx - blen / 2 + 0.3 + i * (blen - 0.6) / 7, 0.21, z0] });
      for (const ez of [-1, 1]) {
        props.push({ g: box(blen, 0.12, 0.14), c: WOOD, p: [gx, 0.85, z0 + ez * (bw / 2)] });
        for (const ex of [-1, 1]) {
          const tx = gx + ex * (blen / 2 - 0.1), tz = z0 + ez * (bw / 2);
          props.push({ g: box(0.18, 1.0, 0.18), c: WOOD_D, p: [tx, 0.55, tz] }, { g: cyl(0.14, 0.09, 0.2, 6), c: 0x3a3030, p: [tx, 1.15, tz] });
          torches.push(new THREE.Vector3(tx, 1.38, tz));
        }
      }
    }

    // ---------------- Core island with castle ----------------
    grass.push(scaleUV(new THREE.CylinderGeometry(CORE_R, CORE_R, 0.72, 40).translate(0, -0.16, z0), CORE_R / 2.5, CORE_R / 2.5));
    cobble.push(scaleUV(new THREE.CylinderGeometry(4.2, 4.2, 0.72, 32).translate(0, -0.14, z0), 2.8, 2.8));
    for (const sg of [-1, 1]) dirt.push(scaleUV(new THREE.BoxGeometry(CORE_R - 3.6, 0.72, PATH_HW * 2 - 1).translate(sg * (3.6 + (CORE_R - 3.6) / 2), -0.15, z0), 1.2, 1.4));
    cliffColumns(r, props, 0, z0, CORE_R, CORE_R, 11, true);
    rocks.push(cliffCore(r, CORE_R * 0.85, CORE_R * 0.8, 26, 0, z0));
    for (const ang of [0.7, 1.1, 2.0, 2.45, 3.85, 4.3, 5.2, 5.6]) pine(trees, Math.cos(ang) * (CORE_R - 1.8), 0.2, z0 + Math.sin(ang) * (CORE_R - 1.8), 0.95 + r() * 0.35, r);
    for (const ang of [1.57, 4.71]) { bush(trees, Math.cos(ang) * 6.5, 0.2, z0 + Math.sin(ang) * 6.5, 1.1, r); rock(props, Math.cos(ang + 0.4) * 7.5, 0.2, z0 + Math.sin(ang + 0.4) * 7.5, 1.1, r); }
    for (const ang of [Math.PI / 2 + 0.4, -Math.PI / 2 - 0.4]) {
      const cx = Math.cos(ang) * (CORE_R - 3), cz = z0 + Math.sin(ang) * (CORE_R - 3);
      for (let i = 0; i < 4; i++) crystals.push({ g: oct(0.35), c: shade(tint, 0.85 + r() * 0.35), p: [cx + (r() - 0.5) * 1.2, 0.6 + r() * 0.5, cz + (r() - 0.5) * 1.2], s: [0.6, 1.8 + r(), 0.6], r: [(r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6] });
      glows.push(new THREE.Vector3(cx, 1.3, cz));
    }
    // castle: corner towers, walls along z with gates facing the lanes, central keep
    const castle: Part[] = [];
    const ring = (rad: number, y: number, h: number, n: number, x0: number, zz: number, c: number) => {
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2;
        castle.push({ g: box((2 * Math.PI * rad) / n * 0.95, h * 0.92, 0.3), c: shade(c, 0.82 + r() * 0.3), p: [x0 + Math.cos(an) * rad, y + h / 2, zz + Math.sin(an) * rad], r: [0, -an + Math.PI / 2, 0] });
      }
    };
    for (const [tx, tz] of [[2.6, 2.6], [-2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]]) {
      for (let y = 0.2, i = 0; y < 2.6; y += 0.3, i++) ring(0.62, y, 0.3, 8, tx, z0 + tz, i % 2 ? 0x9a948a : 0x8a847a);
      castle.push({ g: cyl(0.6, 0.62, 2.4, 8), c: 0x6a645c, p: [tx, 1.4, z0 + tz] });
      for (let k = 0; k < 8; k++) if (k % 2 === 0) { const an = (k / 8) * Math.PI * 2; castle.push({ g: box(0.24, 0.24, 0.18), c: 0x8a847a, p: [tx + Math.cos(an) * 0.66, 2.75, z0 + tz + Math.sin(an) * 0.66], r: [0, -an, 0] }); }
      castle.push({ g: cone(0.85, 1.4, 8), c: roofC, p: [tx, 3.4, z0 + tz] }, { g: tor(0.82, 0.04), c: 0xe8c050, p: [tx, 2.72, z0 + tz], r: [Math.PI / 2, 0, 0] });
      castle.push({ g: cyl(0.015, 0.015, 0.6, 4), c: 0x2e2e36, p: [tx, 4.3, z0 + tz] }, { g: box(0.02, 0.18, 0.32), c: roofC, p: [tx, 4.45, z0 + tz + 0.16] });
      castle.push({ g: box(0.16, 0.24, 0.04), c: 0xffd890, p: [tx, 1.9, z0 + tz + Math.sign(tz) * 0.63] });
    }
    for (const ez of [-1, 1]) {
      castle.push({ g: box(4.6, 1.6, 0.5), c: 0x8a847a, p: [0, 0.95, z0 + ez * 2.6] });
      for (let k = -2; k <= 2; k++) castle.push({ g: box(0.4, 0.3, 0.55), c: 0x9a948a, p: [k * 0.9, 1.9, z0 + ez * 2.6] });
      castle.push({ g: box(1.0, 1.2, 0.04), c: roofC, p: [0, 1.1, z0 + ez * 2.88] }, { g: oct(0.12), c: 0xe8c050, p: [0, 1.25, z0 + ez * 2.92] });
    }
    for (const ex of [-1, 1]) {
      // gate walls facing the lanes (open arch in the middle)
      for (const ez of [-1, 1]) castle.push({ g: box(0.5, 1.6, 1.5), c: 0x8a847a, p: [ex * 2.6, 0.95, z0 + ez * 1.65] });
      castle.push({ g: box(0.5, 0.5, 1.9), c: 0x7a746a, p: [ex * 2.6, 1.55, z0] }, { g: box(0.08, 1.1, 1.7), c: 0x5a3a22, p: [ex * 2.85, 0.75, z0] });
      castle.push({ g: box(0.12, 0.3, 0.4), c: roofC, p: [ex * 2.88, 1.6, z0 + 0.9] }, { g: box(0.12, 0.3, 0.4), c: roofC, p: [ex * 2.88, 1.6, z0 - 0.9] });
    }
    for (let y = 0.2, i = 0; y < 2.3; y += 0.3, i++) ring(1.25, y, 0.3, 12, 0, z0, i % 2 ? 0xa09a90 : 0x908a80);
    castle.push({ g: cyl(1.22, 1.25, 2.2, 12), c: 0x6a645c, p: [0, 1.25, z0] }, { g: cyl(1.45, 1.3, 0.25, 12), c: 0x9a948a, p: [0, 2.45, z0] });
    for (let k = 0; k < 12; k++) if (k % 2 === 0) { const an = (k / 12) * Math.PI * 2; castle.push({ g: box(0.3, 0.3, 0.2), c: 0x9a948a, p: [Math.cos(an) * 1.38, 2.7, z0 + Math.sin(an) * 1.38], r: [0, -an, 0] }); }
    castle.push({ g: tor(1.42, 0.05), c: 0xe8c050, p: [0, 2.57, z0], r: [Math.PI / 2, 0, 0] });
    for (const an of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) castle.push({ g: box(0.2, 0.34, 0.05), c: 0xffd890, p: [Math.cos(an) * 1.27, 1.5, z0 + Math.sin(an) * 1.27], r: [0, -an + Math.PI / 2, 0] });
    const core = new THREE.Group();
    core.position.set(0, 0, z0);
    const castleGeo = mergeParts(castle);
    castleGeo.translate(0, 0, -z0);
    const castleMesh = new THREE.Mesh(castleGeo, propMat);
    castleMesh.castShadow = castleMesh.receiveShadow = high;
    core.add(castleMesh);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), new THREE.MeshStandardMaterial({ color: enemyArena ? 0xff6a8a : 0x7ad8ff, emissive: enemyArena ? 0xa01030 : 0x1a8aff, emissiveIntensity: 1, roughness: 0.15, metalness: 0.2, flatShading: true }));
    crystal.scale.set(1, 1.7, 1);
    crystal.position.y = 3.9;
    core.add(crystal);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: enemyArena ? 0xff4a6a : 0x5ad8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 3.9; halo.scale.setScalar(6.5);
    core.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 16, 12, 1, true), new THREE.MeshBasicMaterial({ color: enemyArena ? 0xff6a8a : 0x8fe6ff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 11.5;
    core.add(beam);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(1.5 + i * 0.4, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: enemyArena ? 0xff9ab0 : 0xbff4ff }));
      ringM.position.y = 3.9; ringM.rotation.x = Math.PI / 2 + i * 0.5;
      core.add(ringM); rings.push(ringM);
    }
    const light = new THREE.PointLight(enemyArena ? 0xff4a6a : 0x5ad8ff, 30, 18, 1.6);
    light.position.y = 4.2;
    core.add(light);
    scene.add(core);
    env.coreGroups.push(core); env.coreCrystals.push(crystal); env.coreLights.push(light);
    updaters.push((dt, t) => {
      rings[0].rotation.z += dt * 0.8; rings[1].rotation.z -= dt * 0.55;
      crystal.position.y = 3.9 + Math.sin(t * 1.5 + a) * 0.15;
      halo.position.y = crystal.position.y;
      halo.material.opacity = 0.7 + Math.sin(t * 2.3) * 0.15;
    });

    // rift portals (swirl + ring)
    for (const sg of [-1, 1]) {
      const px = sg * (LANE.spawnX + 5);
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 40), new THREE.MeshBasicMaterial({ color: 0xc07aff }));
      ringM.position.set(px, 2.7, z0); ringM.rotation.y = Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.35, 32), new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      disc.position.copy(ringM.position); disc.rotation.y = Math.PI / 2;
      scene.add(ringM, disc);
      updaters.push(dt => { disc.rotation.x += dt * 1.5 * sg; });
    }

    // ---------------- merged statics ----------------
    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!geos.length) return null;
      const m = new THREE.Mesh(mergeGeometries(geos)!, mat);
      m.receiveShadow = shadow;
      scene.add(m);
      return m;
    };
    add(dirt, dirtMat, high);
    add(grass, grassMat, high);
    add(cobble, cobbleMat, high);
    const propMesh = new THREE.Mesh(mergeGeometries([...rocks, mergeParts(props)])!, propMat);
    propMesh.receiveShadow = propMesh.castShadow = high;
    scene.add(propMesh);
    const treeMesh = new THREE.Mesh(mergeParts(trees), treeMat);
    treeMesh.castShadow = high;
    scene.add(treeMesh);
    scene.add(new THREE.Mesh(mergeParts(crystals), crystalMat));
    add(water, waterMat, false);
    const fm = add(falls, fallMat, false);
    if (fm) fm.renderOrder = 2;

    // glows: crystals + mist; torches (flame cores + glow); lanterns (night lights)
    const mistPts: THREE.Vector3[] = [...glows];
    const mistCols: number[] = [];
    const tc = new THREE.Color(tint), wc = new THREE.Color(0xf0f8ff);
    for (let i = 0; i < glows.length; i++) mistCols.push(tc.r, tc.g, tc.b);
    for (const g of falls) { g.computeBoundingBox(); const bb = g.boundingBox!; mistPts.push(new THREE.Vector3((bb.min.x + bb.max.x) / 2, -15, (bb.min.z + bb.max.z) / 2)); mistCols.push(wc.r, wc.g, wc.b); }
    const gg = new THREE.BufferGeometry().setFromPoints(mistPts);
    gg.setAttribute('color', new THREE.Float32BufferAttribute(mistCols, 3));
    scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 4.5, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })));

    const lampGeo = new THREE.BufferGeometry().setFromPoints(lanterns);
    const lampMat = new THREE.PointsMaterial({ map: glowTex, size: 1.8, color: 0xffc070, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    lampMats.push(lampMat);
    scene.add(new THREE.Points(lampGeo, lampMat));
    const lampCores = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), lanterns.length);
    const m4 = new THREE.Matrix4();
    lanterns.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); lampCores.setMatrixAt(i, m4); });
    scene.add(lampCores);

    const fg = new THREE.BufferGeometry().setFromPoints(torches);
    const flames = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, size: 1.6, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(flames);
    const flameCores = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a }), torches.length);
    scene.add(flameCores);
    updaters.push((_dt, t) => {
      (flames.material as THREE.PointsMaterial).size = 1.5 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.1;
      torches.forEach((p, i) => {
        const f = 1 + Math.sin(t * 15 + i * 1.7) * 0.18;
        m4.compose(p, new THREE.Quaternion(), new THREE.Vector3(f, f * (1 + Math.sin(t * 11 + i) * 0.15), f));
        flameCores.setMatrixAt(i, m4);
      });
      flameCores.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------- birds ----------------
  if (!lite) {
    const n = 14;
    const birdGeo = mergeParts([{ g: box(0.5, 0.04, 0.16), c: 0x2a2a34, p: [-0.25, 0, 0], r: [0, 0, 0.35] }, { g: box(0.5, 0.04, 0.16), c: 0x2a2a34, p: [0.25, 0, 0], r: [0, 0, -0.35] }]);
    const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), n);
    birds.frustumCulled = false;
    scene.add(birds);
    const seeds = Array.from({ length: n }, () => ({ r: 18 + r() * 30, y: 9 + r() * 8, sp: 0.15 + r() * 0.15, ph: r() * 6, cx: (r() - 0.5) * 60 }));
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
    (scene.fog as THREE.Fog).color.copy(cFog);
    sun.color.copy(cSun); sun.intensity = L(A.sunI, B.sunI);
    sun.position.set(-40, 20 + sunY * 60, 30);
    hemi.color.copy(cHs); hemi.groundColor.copy(cHg); hemi.intensity = L(A.hemiI, B.hemiI);
    const lamps = L(A.lamps, B.lamps);
    for (const m of lampMats) { m.opacity = Math.min(1, lamps); m.size = 1.4 + lamps * 1.2; }
    const night = Math.max(0, (t - 0.6) / 0.4);
    for (const m of seaMats) m.color.setHex(0xffffff).lerp(tmp.setHex(0x3a4a7a), night);
  };
  env.setMood(0, false);
  return env;
}

export { tor, sph };
