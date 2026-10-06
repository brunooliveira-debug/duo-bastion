// Environment — "Crépuscule des Îles Suspendues": sky dome, sea of clouds, distant floating cities,
// lane islands with cliffs, cobbles, parapets, torches, banners, waterfalls, crystals, and the Core island.
// Static parts are merged per material → about a dozen draw calls per arena.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE } from '../sim/state';
import { Part, box, cyl, cone, oct, sph, tor, mergeParts, shade } from './characters';
import { cobbleTexture, waterfallTexture, cloudTexture, glowTexture, swirlTexture } from './textures';
import type { Quality } from './Renderer';

const STONE = 0x8a8496, STONE_D = 0x6e6880, MOSS = 0x5e7a3a, WOOD = 0x8a6a48, PINE = 0x2f5a3a, PINE_D = 0x234a30, TRUNK = 0x5a3a22;
const LANE_END = 46; // islands run from the core bridge to |x| = 46 (behind the portals)

export interface Env {
  update(dt: number, time: number): void;
  coreCrystals: THREE.Mesh[];
  coreGroups: THREE.Group[];
  coreLights: THREE.PointLight[];
}

function rng(seed: number) {
  let s = seed;
  return () => { let t = (s = (s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Inverted rocky cone under an island, vertex-coloured light → dark with depth. */
function cliff(r: () => number, sx: number, sz: number, depth: number, x: number, topY: number, z: number, seg = 9): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, depth, seg, 3).toNonIndexed();
  g.rotateX(Math.PI);
  g.scale(sx, 1, sz);
  g.translate(x, topY - depth / 2, z);
  const pos = g.attributes.position as THREE.BufferAttribute;
  // deterministic jitter per original vertex position so shared corners stay welded
  const key = (i: number) => `${pos.getX(i).toFixed(2)}|${pos.getY(i).toFixed(2)}|${pos.getZ(i).toFixed(2)}`;
  const jit = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!jit.has(k)) {
      const top = pos.getY(i) > topY - 0.05;
      const a = top ? 0.15 : 0.9;
      jit.set(k, [(r() - 0.5) * a * 2, top ? 0 : (r() - 0.5) * 1.2, (r() - 0.5) * a]);
    }
  }
  const col = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(0x857c96), cBot = new THREE.Color(0x2c2440), c = new THREE.Color();
  const keys = Array.from({ length: pos.count }, (_, i) => key(i));
  for (let i = 0; i < pos.count; i++) {
    const j = jit.get(keys[i])!;
    pos.setXYZ(i, pos.getX(i) + j[0], pos.getY(i) + j[1], pos.getZ(i) + j[2]);
    const k = Math.min(1, Math.max(0, (topY - pos.getY(i)) / depth));
    c.copy(cTop).lerp(cBot, Math.pow(k, 0.7));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function scaleUV(g: THREE.BufferGeometry, sx: number, sy: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

function pine(x: number, y: number, z: number, h: number): Part[] {
  return [
    { g: cyl(0.12 * h, 0.16 * h, 0.5 * h, 5), c: TRUNK, p: [x, y + 0.25 * h, z] },
    { g: cone(0.8 * h, 1.3 * h, 7), c: PINE_D, p: [x, y + 1.0 * h, z] },
    { g: cone(0.6 * h, 1.1 * h, 7), c: PINE, p: [x, y + 1.6 * h, z] },
    { g: cone(0.4 * h, 0.9 * h, 7), c: PINE, p: [x, y + 2.15 * h, z] },
  ];
}

function crystalCluster(r: () => number, x: number, y: number, z: number, k: number, tint: number): Part[] {
  const out: Part[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = (0.7 + r() * 1.1) * k;
    out.push({ g: oct(0.35 * k), c: shade(tint, 0.85 + r() * 0.35), p: [x + (r() - 0.5) * 0.9 * k, y + h * 0.45, z + (r() - 0.5) * 0.9 * k], r: [(r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7], s: [0.6, h * 1.6, 0.6] });
  }
  return out;
}

export function buildEnvironment(scene: THREE.Scene, arenas: number, quality: Quality, arenaZ: (a: number) => number, slotColors: number[]): Env {
  const r = rng(4242);
  const updaters: ((dt: number, t: number) => void)[] = [];
  const env: Env = { update: (dt, t) => updaters.forEach(u => u(dt, t)), coreCrystals: [], coreGroups: [], coreLights: [] };

  // ---------------- sky dome ----------------
  {
    const g = new THREE.SphereGeometry(420, 32, 20);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const stops: [number, THREE.Color][] = [
      [-1, new THREE.Color(0x1a1230)], [-0.25, new THREE.Color(0x3a2a55)], [-0.02, new THREE.Color(0xd99a86)],
      [0.06, new THREE.Color(0xf2a578)], [0.2, new THREE.Color(0xc9718a)], [0.45, new THREE.Color(0x5b3f7e)], [1, new THREE.Color(0x1c1640)],
    ];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 420;
      let k = 0;
      while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
      const [y0, c0] = stops[k], [y1, c1] = stops[k + 1];
      c.copy(c0).lerp(c1, Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    sky.position.set(0, 0, ARENA_MID(arenas, arenaZ));
    scene.add(sky);
    // setting sun glow
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc890, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sun.position.set(-260, 30, -300);
    sun.scale.setScalar(260);
    scene.add(sun);
  }

  // ---------------- sea of clouds ----------------
  {
    const tex = cloudTexture();
    const layers: [number, number, number, number][] = quality === 'battery' ? [[-17, 0xf6d6e4, 0.75, 0.004]] : [[-17, 0xf6d6e4, 0.75, 0.004], [-30, 0xb986a8, 0.7, 0.0025]];
    for (const [y, color, op, speed] of layers) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(7, 7);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: op, depthWrite: false }));
      m.position.set(0, y, ARENA_MID(arenas, arenaZ));
      scene.add(m);
      updaters.push(dt => { t.offset.x += dt * speed; t.offset.y += dt * speed * 0.4; });
    }
  }

  // ---------------- distant floating islands & cities ----------------
  {
    const rock: THREE.BufferGeometry[] = [];
    const parts: Part[] = [];
    const lights: Part[] = [];
    const mid = ARENA_MID(arenas, arenaZ);
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI * 0.95 + (i / 15) * Math.PI * 0.9 + (r() - 0.5) * 0.15;
      const dist = 95 + r() * 110;
      const x = Math.cos(ang) * dist * 1.25, z = mid + Math.sin(ang) * dist - 20;
      const y = -6 + r() * 34;
      const rad = 4 + r() * 9;
      parts.push({ g: cyl(rad, rad * 0.95, 1.4, 9), c: 0x6a5e86, p: [x, y, z] });
      parts.push({ g: cyl(rad * 1.02, rad * 1.02, 0.4, 9), c: 0x58704a, p: [x, y + 0.5, z] });
      rock.push(cliff(r, rad, rad, rad * (1.4 + r()), x, y - 0.6, z));
      if (r() < 0.55) {
        const n = 2 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) {
          const tx = x + (r() - 0.5) * rad, tz = z + (r() - 0.5) * rad, th = 3 + r() * 11, tr = 0.4 + r() * 0.9;
          parts.push({ g: cyl(tr, tr * 1.1, th, 6), c: 0x5a5274, p: [tx, y + 0.7 + th / 2, tz] });
          parts.push({ g: cone(tr * 1.4, th * 0.35, 6), c: 0x3e3460, p: [tx, y + 0.7 + th + th * 0.17, tz] });
          for (let w = 0; w < 3; w++) lights.push({ g: box(0.3, 0.45, 0.3), c: 0xffc070, p: [tx + (r() - 0.5) * tr, y + 1.2 + r() * th * 0.8, tz + tr * 0.9] });
        }
      }
      if (r() < 0.5) {
        // a waterfall from the far island
        lights.push({ g: box(0.8, rad * 1.4, 0.1), c: 0xd8eeff, p: [x + rad * 0.3, y - rad * 0.7, z + rad * 0.85] });
      }
    }
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    scene.add(new THREE.Mesh(mergeGeometries([...rock, mergeParts(parts)])!, rockMat));
    if (lights.length) scene.add(new THREE.Mesh(mergeParts(lights), new THREE.MeshBasicMaterial({ vertexColors: true })));
  }

  // ---------------- arenas ----------------
  const groundMat = new THREE.MeshLambertMaterial({ map: cobbleTexture() });
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const crystalMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fallTex = waterfallTexture();
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, color: 0xe6f6ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  updaters.push(dt => { fallTex.offset.y += dt * 0.9; });
  const glowTex = glowTexture();

  for (let a = 0; a < arenas; a++) {
    const z0 = arenaZ(a);
    const enemy = a > 0;
    const tops: THREE.BufferGeometry[] = [];
    const rocks: THREE.BufferGeometry[] = [];
    const props: Part[] = [];
    const crystals: Part[] = [];
    const falls: THREE.BufferGeometry[] = [];
    const torches: THREE.Vector3[] = [];
    const crystalGlows: THREE.Vector3[] = [];
    const tint = enemy ? 0xff5a7a : 0x5fd0ff;

    for (const sg of [-1, 1]) {
      const slot = sg < 0 ? 0 : 1;
      const x0 = LANE.leakX - 0.6, x1 = LANE_END;
      const len = x1 - x0, cx = sg * (x0 + len / 2);
      const W = LANE.halfWidth * 2 + 2.4;
      // cobbled top
      tops.push(scaleUV(new THREE.BoxGeometry(len, 0.7, W).translate(cx, -0.15, z0), len / 3, W / 3));
      // moss rim + cliff
      props.push({ g: box(len + 0.4, 0.3, W + 0.4), c: MOSS, p: [cx, -0.42, z0] });
      rocks.push(cliff(r, len * 0.5, W * 0.46, 17 + r() * 4, cx, -0.55, z0));
      // parapets with posts; torches on every other post
      const zEdge = W / 2 - 0.25;
      let k = 0;
      for (let x = x0 + 0.8; x < x1 - 0.5; x += 3.2, k++) {
        for (const ez of [-1, 1]) {
          props.push({ g: box(0.5, 0.9, 0.5), c: STONE, p: [sg * x, 0.6, z0 + ez * zEdge] });
          if (x + 3.2 < x1 - 0.5) props.push({ g: box(2.7, 0.42, 0.32), c: STONE_D, p: [sg * (x + 1.6), 0.4, z0 + ez * zEdge] });
          if (k % 2 === 0) {
            props.push({ g: cyl(0.16, 0.1, 0.22, 6), c: 0x3a3040, p: [sg * x, 1.16, z0 + ez * zEdge] });
            torches.push(new THREE.Vector3(sg * x, 1.42, z0 + ez * zEdge));
          }
        }
      }
      // banners (player colours, red in the enemy arena)
      const flag = enemy ? 0xc8304a : slotColors[slot];
      for (const bx of [14.6, 27.6]) {
        for (const ez of [-1, 1]) {
          props.push({ g: cyl(0.05, 0.05, 2.4, 5), c: 0x3a3040, p: [sg * bx, 1.6, z0 + ez * zEdge] });
          props.push({ g: box(0.75, 1.05, 0.05), c: flag, p: [sg * (bx + 0.42), 2.15, z0 + ez * zEdge] });
          props.push({ g: box(0.75, 0.1, 0.06), c: 0xe0b040, p: [sg * (bx + 0.42), 2.66, z0 + ez * zEdge] });
        }
      }
      // portal arch at the spawn end
      const px = sg * (LANE.spawnX + 5);
      props.push({ g: box(1, 4.6, 1), c: STONE, p: [px, 2.5, z0 - 2.9] }, { g: box(1, 4.6, 1), c: STONE, p: [px, 2.5, z0 + 2.9] });
      props.push({ g: box(1.3, 0.9, 7), c: STONE_D, p: [px, 5.1, z0] });
      props.push({ g: cone(0.5, 1.2, 4), c: STONE_D, p: [px, 6.1, z0] });
      crystals.push({ g: oct(0.35), c: 0xc08aff, p: [px, 5.2, z0 + 0.6] });
      // trees & crystals behind the portal
      props.push(...pine(sg * (LANE_END - 2), 0.2, z0 - 3.4, 1.1), ...pine(sg * (LANE_END - 3.5), 0.2, z0 + 3.6, 0.9));
      crystals.push(...crystalCluster(r, sg * (LANE_END - 1.6), 0.2, z0 + 1.2, 0.9, tint));
      crystalGlows.push(new THREE.Vector3(sg * (LANE_END - 1.6), 1.2, z0 + 1.2));
      // crystals growing out of the cliff face
      crystals.push(...crystalCluster(r, sg * 22, -2.6, z0 + W * 0.42, 1.0, tint));
      crystalGlows.push(new THREE.Vector3(sg * 22, -1.6, z0 + W * 0.45));
      // waterfalls on the camera-facing side
      for (const fx of [19, 33]) {
        const g = new THREE.PlaneGeometry(1.8, 15).translate(sg * fx, -7.6, z0 + W / 2 + 0.25);
        scaleUV(g, 1, 3.5);
        falls.push(g);
      }
      // bridge to the Core island
      const bx = sg * (LANE.leakX - 1.2);
      props.push({ g: box(3.2, 0.5, W - 1), c: WOOD, p: [bx, -0.05, z0] });
      for (let i = 0; i < 4; i++) props.push({ g: box(0.06, 0.02, W - 1), c: 0x5a4430, p: [bx + (i - 1.5) * 0.75, 0.21, z0] });
      for (const ez of [-1, 1]) props.push({ g: box(3.2, 0.14, 0.14), c: WOOD, p: [bx, 0.75, z0 + ez * (W / 2 - 0.6)] }, { g: box(0.16, 0.7, 0.16), c: WOOD, p: [bx - 1.5, 0.45, z0 + ez * (W / 2 - 0.6)] }, { g: box(0.16, 0.7, 0.16), c: WOOD, p: [bx + 1.5, 0.45, z0 + ez * (W / 2 - 0.6)] });
    }

    // Core island
    const R = LANE.leakX - 0.4;
    tops.push(scaleUV(new THREE.CylinderGeometry(R, R, 0.7, 40).translate(0, -0.15, z0), R / 1.5, R / 1.5));
    props.push({ g: cyl(R + 0.3, R + 0.3, 0.3, 40), c: MOSS, p: [0, -0.42, z0] });
    rocks.push(cliff(r, R * 0.92, R * 0.85, 22, 0, -0.55, z0, 12));
    for (const ang of [0.9, 2.25, 4.05, 5.4]) props.push(...pine(Math.cos(ang) * (R - 1.6), 0.2, z0 + Math.sin(ang) * (R - 1.6), 0.85 + r() * 0.3));
    for (const ang of [Math.PI / 2, -Math.PI / 2]) {
      crystals.push(...crystalCluster(r, Math.cos(ang) * (R - 2), 0.2, z0 + Math.sin(ang) * (R - 2), 1.1, tint));
      crystalGlows.push(new THREE.Vector3(Math.cos(ang) * (R - 2), 1.3, z0 + Math.sin(ang) * (R - 2)));
    }
    for (const fx of [-4.5, 4.5]) falls.push(scaleUV(new THREE.PlaneGeometry(1.6, 17).translate(fx, -8.7, z0 + R - 0.6), 1, 4));

    // Core monument
    const core = new THREE.Group();
    core.position.set(0, 0, z0);
    core.add(new THREE.Mesh(mergeParts([
      { g: cyl(2.6, 3, 0.5, 10), c: STONE_D, p: [0, 0.45, 0] },
      { g: cyl(2, 2.4, 0.5, 10), c: STONE, p: [0, 0.95, 0] },
      { g: cyl(1.4, 1.7, 0.4, 10), c: STONE_D, p: [0, 1.4, 0] },
      ...[0, 1, 2, 3].map(i => ({ g: box(0.4, 2.2, 0.4), c: STONE, p: [Math.cos(i * Math.PI / 2 + 0.78) * 2.3, 1.6, Math.sin(i * Math.PI / 2 + 0.78) * 2.3] as [number, number, number] })),
      ...[0, 1, 2, 3].map(i => ({ g: oct(0.25), c: tint, p: [Math.cos(i * Math.PI / 2 + 0.78) * 2.3, 2.9, Math.sin(i * Math.PI / 2 + 0.78) * 2.3] as [number, number, number] })),
    ]), propMat));
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), new THREE.MeshStandardMaterial({ color: enemy ? 0xff6a8a : 0x7ad8ff, emissive: enemy ? 0xa01030 : 0x1a8aff, emissiveIntensity: 1, roughness: 0.15, metalness: 0.2, flatShading: true }));
    crystal.scale.set(1, 1.7, 1);
    crystal.position.y = 3.8;
    core.add(crystal);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: enemy ? 0xff4a6a : 0x5ad8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 3.8; halo.scale.setScalar(8);
    core.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 18, 12, 1, true), new THREE.MeshBasicMaterial({ color: enemy ? 0xff6a8a : 0x8fe6ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 12;
    core.add(beam);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2 + i * 0.5, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: enemy ? 0xff9ab0 : 0xbff4ff }));
      ring.position.y = 3.8; ring.rotation.x = Math.PI / 2 + i * 0.5;
      core.add(ring); rings.push(ring);
    }
    const light = new THREE.PointLight(enemy ? 0xff4a6a : 0x5ad8ff, 40, 22, 1.6);
    light.position.y = 4.2;
    core.add(light);
    scene.add(core);
    env.coreGroups.push(core); env.coreCrystals.push(crystal); env.coreLights.push(light);
    updaters.push((dt, t) => {
      rings[0].rotation.z += dt * 0.8; rings[1].rotation.z -= dt * 0.55;
      crystal.position.y = 3.8 + Math.sin(t * 1.5 + a) * 0.18;
      halo.position.y = crystal.position.y;
      halo.material.opacity = 0.7 + Math.sin(t * 2.3) * 0.15;
    });

    // portals (swirl + ring) at both lane ends
    for (const sg of [-1, 1]) {
      const px = sg * (LANE.spawnX + 5);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.16, 8, 40), new THREE.MeshBasicMaterial({ color: 0xc07aff }));
      ring.position.set(px, 2.5, z0); ring.rotation.y = Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ map: swirlTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      disc.position.copy(ring.position); disc.rotation.y = Math.PI / 2;
      scene.add(ring, disc);
      updaters.push(dt => { disc.rotation.x += dt * 1.5 * sg; });
    }

    // merged statics
    const topMesh = new THREE.Mesh(mergeGeometries(tops)!, groundMat);
    topMesh.receiveShadow = quality === 'high';
    scene.add(topMesh);
    const propGeo = mergeGeometries([...rocks, mergeParts(props)])!;
    const propMesh = new THREE.Mesh(propGeo, propMat);
    propMesh.receiveShadow = quality === 'high';
    propMesh.castShadow = quality === 'high';
    scene.add(propMesh);
    scene.add(new THREE.Mesh(mergeParts(crystals), crystalMat));
    const fallMesh = new THREE.Mesh(mergeGeometries(falls)!, fallMat);
    fallMesh.renderOrder = 2;
    scene.add(fallMesh);

    // glows: crystals + waterfall mist (one Points), torch flames (one Points + instanced cores)
    const glowPts = [...crystalGlows];
    const glowCols: number[] = [];
    const tc = new THREE.Color(tint), wc = new THREE.Color(0xf0f8ff);
    for (let i = 0; i < crystalGlows.length; i++) glowCols.push(tc.r, tc.g, tc.b);
    const mistY = -15;
    for (const g of falls) {
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      glowPts.push(new THREE.Vector3((bb.min.x + bb.max.x) / 2, mistY, bb.max.z));
      glowCols.push(wc.r, wc.g, wc.b);
    }
    const gg = new THREE.BufferGeometry().setFromPoints(glowPts);
    gg.setAttribute('color', new THREE.Float32BufferAttribute(glowCols, 3));
    const glows = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex, size: 4.5, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(glows);

    const fg = new THREE.BufferGeometry().setFromPoints(torches);
    const flames = new THREE.Points(fg, new THREE.PointsMaterial({ map: glowTex, size: 1.6, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(flames);
    const core3 = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a }), torches.length);
    const m4 = new THREE.Matrix4();
    scene.add(core3);
    updaters.push((_dt, t) => {
      (flames.material as THREE.PointsMaterial).size = 1.5 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.1;
      torches.forEach((p, i) => {
        const f = 1 + Math.sin(t * 15 + i * 1.7) * 0.18;
        m4.compose(p, new THREE.Quaternion(), new THREE.Vector3(f, f * (1 + Math.sin(t * 11 + i) * 0.15), f));
        core3.setMatrixAt(i, m4);
      });
      core3.instanceMatrix.needsUpdate = true;
    });
  }
  return env;
}

/** z middle of all arenas (sky & cloud centring). */
function ARENA_MID(arenas: number, arenaZ: (a: number) => number) { return (arenaZ(0) + arenaZ(arenas - 1)) / 2; }

export { tor, sph };
