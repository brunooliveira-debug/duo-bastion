// The BASTION (the shared Core) — monumental, vertical, stone + gold + a living crystal reactor.
// Three-tier octagonal base with a glowing rune circle, a gothic tower with buttresses and lit windows,
// an open golden cage holding the reactor crystal, spires, orbiting rings and shards, and a pillar of light.
// The three module slots sit on the base and really change the silhouette (family + level).
import * as THREE from 'three';
import { Part, box, cyl, cone, oct, sph, tor, mergeParts, shade, mix } from './characters';
import { glowTexture, runeCircleTexture, shaftTexture, vortexTexture } from './textures';
import { litMaterial, reflective, isLowTier, surfaceMaterial } from './look';
import { MODULES, ModuleId } from '../data/modules';

const GOLD = 0xe2b450, GOLD_D = 0xa87c30;
const PBR_STONE: [number, number] = [0, 0.82];
const PBR_GOLD: [number, number] = [0.72, 0.32]; // not fully metallic: keeps a diffuse part, reads gold even in a dark dusk env
const PBR_IRON: [number, number] = [0.8, 0.42];

export interface Bastion {
  group: THREE.Group;
  crystal: THREE.Mesh;
  light: THREE.PointLight;
  /** emissive parts (windows, runes) dim when the Core is hurt */
  setHealth(k: number): void;
  setModules(mods: ({ id: ModuleId; lv: number } | null)[]): void;
  /** Résonance channel: 0..1, the pillar / halo / runes swell and shift toward the ability colour */
  surge(k: number, color?: number): void;
  update(dt: number, t: number): void;
}

// slots: front (camera side) + back-left + back-right; the spires stand in between, lanes (±x) stay clear
const SLOT_ANGLES = [Math.PI / 2, -Math.PI * 5 / 6, -Math.PI / 6];
const SPIRE_ANGLES = [Math.PI / 6, Math.PI * 5 / 6, -Math.PI / 2];
const litCache = new Map<string, THREE.Material>();
function lit() { const k = isLowTier() ? 'low' : 'hero'; let m = litCache.get(k); if (!m) { m = litMaterial({ rim: 0.2, reflect: true }); litCache.set(k, m); } return m; }

export function buildBastion(enemy: boolean, high: boolean): Bastion {
  const group = new THREE.Group();
  const team = enemy ? 0xff4a6a : 0x5fd0ff; // energy colour
  const teamL = enemy ? 0xffb0c0 : 0xd8f6ff;
  const stone = enemy ? 0x544852 : 0x56607a, stoneL = enemy ? 0x726470 : 0x7a8498, stoneD = enemy ? 0x362a34 : 0x363c4e;
  const parts: Part[] = [], glow: Part[] = [];
  const S = (p: Part) => { parts.push({ ...p, pbr: p.pbr ?? PBR_STONE }); };
  const G = (p: Part) => { parts.push({ ...p, pbr: PBR_GOLD }); };
  const E = (p: Part) => { glow.push(p); };

  // ---- base: three octagonal tiers with gold trims and steps
  const tiers: [number, number, number][] = [[2.7, 0.3, 0], [2.3, 0.34, 0.3], [1.85, 0.3, 0.64]]; // ≤ 2.7: enemies stop at ~3
  tiers.forEach(([rad, h, y], i) => {
    S({ g: cyl(rad, rad * 1.04, h, 8), c: i % 2 ? stoneL : stone, p: [0, y + h / 2, 0], r: [0, Math.PI / 8, 0] });
    G({ g: tor(rad * 1.0, 0.035, Math.PI * 2), c: GOLD, p: [0, y + h, 0], r: [Math.PI / 2, 0, Math.PI / 8] });
  });
  // corner pedestals on the first tier, with small crystals
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 2.48, z = Math.sin(a) * 2.48;
    if (Math.abs(Math.cos(a)) > 0.9) continue; // keep the lane gates open
    S({ g: box(0.3, 0.55, 0.3), c: stoneD, p: [x, 0.57, z] });
    G({ g: cone(0.17, 0.22, 4), c: GOLD, p: [x, 0.95, z], r: [0, Math.PI / 4, 0] });
    E({ g: oct(0.09), c: team, p: [x, 1.15, z], s: [0.8, 1.6, 0.8] });
  }

  // ---- main tower: tapered octagon, buttresses, gold bands, lit gothic windows
  S({ g: cyl(1.0, 1.25, 4.1, 8), c: stone, p: [0, 0.94 + 2.05, 0], r: [0, Math.PI / 8, 0] });
  for (const y of [1.5, 3.2, 4.85]) G({ g: cyl(y > 4 ? 1.04 : 1.2, y > 4 ? 1.04 : 1.2, 0.12, 8), c: GOLD, p: [0, y, 0], r: [0, Math.PI / 8, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    // buttress: a slab leaning on the tower
    S({ g: box(0.22, 2.6, 0.55), c: stoneL, p: [ca * 1.3, 2.2, sa * 1.3], r: [0, -a, 0.12 * 0] });
    S({ g: box(0.24, 0.5, 0.7), c: stoneD, p: [ca * 1.45, 1.25, sa * 1.45], r: [0, -a, 0] });
    G({ g: cone(0.12, 0.45, 4), c: GOLD, p: [ca * 1.32, 3.75, sa * 1.32], r: [0, Math.PI / 4, 0] });
    // windows between buttresses
    const b = a + Math.PI / 8, cb = Math.cos(b), sb = Math.sin(b);
    E({ g: box(0.16, 0.95, 0.04), c: team, p: [cb * 1.11, 2.45, sb * 1.11], r: [0, -b + Math.PI / 2, 0] });
    E({ g: box(0.12, 0.42, 0.04), c: team, p: [cb * 1.04, 4.1, sb * 1.04], r: [0, -b + Math.PI / 2, 0] });
    G({ g: cone(0.11, 0.22, 4), c: GOLD_D, p: [cb * 1.12, 3.03, sb * 1.12], r: [0, -b, 0] });
  }

  // ---- crown: crenellated ring + open golden cage (ribs) around the reactor
  S({ g: cyl(1.35, 1.1, 0.36, 8), c: stoneL, p: [0, 5.1, 0], r: [0, Math.PI / 8, 0] });
  G({ g: tor(1.32, 0.05, Math.PI * 2), c: GOLD, p: [0, 5.3, 0], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    // curved rib: a half torus stood up on its side, stretched into a lantern shape (ends hidden in the crown and the cap)
    G({ g: new THREE.TorusGeometry(1.1, 0.055, 5, 18, Math.PI), c: i % 2 ? GOLD_D : GOLD, p: [0, 6.25, 0], s: [1.3, 0.95, 1], r: [0, -a, -Math.PI / 2] });
    S({ g: box(0.3, 0.32, 0.26), c: stone, p: [Math.cos(a + 0.2) * 1.3, 5.45, Math.sin(a + 0.2) * 1.3], r: [0, -a, 0] });
  }
  G({ g: tor(0.5, 0.05, Math.PI * 2), c: GOLD, p: [0, 7.0, 0], r: [Math.PI / 2, 0, 0] });
  G({ g: sph(0.2, 1), c: GOLD, p: [0, 7.72, 0] });
  // central spire above the cage
  G({ g: cone(0.3, 0.8, 8), c: GOLD, p: [0, 8.15, 0] });
  S({ g: cone(0.18, 1.7, 8), c: stoneL, p: [0, 9.15, 0], pbr: PBR_IRON });
  E({ g: oct(0.2), c: teamL, p: [0, 10.15, 0], s: [0.8, 1.7, 0.8] });

  // ---- three spires on pillars around the tower, between the module slots
  for (const a of SPIRE_ANGLES) {
    const x = Math.cos(a) * 2.0, z = Math.sin(a) * 2.0;
    S({ g: cyl(0.3, 0.36, 2.6, 8), c: stoneL, p: [x, 0.64 + 1.3, z] });
    G({ g: cyl(0.34, 0.34, 0.1, 8), c: GOLD, p: [x, 1.6, z] });
    G({ g: cyl(0.34, 0.34, 0.1, 8), c: GOLD, p: [x, 2.9, z] });
    S({ g: cone(0.36, 1.9, 8), c: stoneD, p: [x, 4.19, z], pbr: PBR_IRON });
    G({ g: cone(0.1, 0.5, 6), c: GOLD, p: [x, 5.3, z] });
    E({ g: oct(0.14), c: team, p: [x, 5.72, z], s: [0.8, 1.7, 0.8] });
    E({ g: box(0.08, 0.5, 0.04), c: team, p: [x + Math.cos(a) * 0.31, 2.3, z + Math.sin(a) * 0.31], r: [0, -a + Math.PI / 2, 0] });
    // flying buttress from the spire to the tower
    S({ g: box(0.14, 0.14, 1.0), c: stoneL, p: [Math.cos(a) * 1.55, 3.7, Math.sin(a) * 1.55], r: [0.6, -a + Math.PI / 2, 0] });
  }

  const body = new THREE.Mesh(mergeParts(parts), lit());
  body.castShadow = body.receiveShadow = high;
  group.add(body);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });
  const windows = new THREE.Mesh(mergeParts(glow), glowMat);
  group.add(windows);

  // ---- reactor crystal + inner glow + halo + light
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), reflective(surfaceMaterial({ color: team, emissive: team, emissiveIntensity: 1.1, roughness: 0.12, metalness: 0.1, flatShading: true }, true)));
  crystal.scale.set(1, 1.65, 1);
  crystal.position.y = 6.25;
  group.add(crystal);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(teamL).multiplyScalar(1.5), toneMapped: false }));
  core.scale.set(1, 1.6, 1);
  crystal.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: team, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 6.25; halo.scale.setScalar(4.2);
  group.add(halo);
  const light = new THREE.PointLight(team, 10, 16, 1.8);
  light.position.y = 6.3;
  group.add(light);

  // ---- orbiting energy rings and rune shards
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(team).multiplyScalar(1.5), toneMapped: false });
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.55 + i * 0.32, i === 1 ? 0.035 : 0.022, 6, 64), i === 1 ? reflective(surfaceMaterial({ color: GOLD, metalness: 1, roughness: 0.25 }, true)) : ringMat);
    m.position.y = 6.25;
    m.rotation.x = Math.PI / 2 + (i - 1) * 0.45;
    group.add(m); rings.push(m);
  }
  const shardGeo = new THREE.OctahedronGeometry(0.11, 0);
  const shards = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(teamL).multiplyScalar(1.6), toneMapped: false }), 10);
  group.add(shards);

  // ---- rune circles on the ground (additive, counter-rotating)
  const runeTex = runeCircleTexture();
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, color: new THREE.Color(team).multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const runeOuter = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6).rotateX(-Math.PI / 2), runeMat);
  runeOuter.position.y = 0.04; runeOuter.renderOrder = 3;
  const runeInner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2), runeMat.clone());
  runeInner.position.y = 1.08; runeInner.renderOrder = 3;
  group.add(runeOuter, runeInner);

  // ---- pillar of light rising from the reactor
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: new THREE.Color(team).multiplyScalar(1.3), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const shaft = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 26), shaftMat);
    p.rotation.y = (i / 3) * Math.PI;
    p.position.y = 6.5 + 13; // bright end of the texture at the bottom
    shaft.add(p);
  }
  group.add(shaft);

  // ---- rising motes
  const N = 26;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(N * 3);
  const moteSeed = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2, r: 0.4 + (i % 5) * 0.32, s: 0.4 + (i % 7) * 0.12, o: i * 0.37 }));
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ map: glowTexture(), color: new THREE.Color(teamL).multiplyScalar(1.1), size: 0.3, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  group.add(motes);

  // ---- module slots
  const modGroup = new THREE.Group();
  group.add(modGroup);
  let modKey = '';
  const egide = new THREE.Mesh(new THREE.SphereGeometry(4.0, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(team).multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  egide.renderOrder = 4;
  group.add(egide);
  let health = 1, surgeK = 0;
  const baseShaft = new THREE.Color(team).multiplyScalar(1.3), baseRune = new THREE.Color(team).multiplyScalar(1.6), surgeC = new THREE.Color();

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    group, crystal, light,
    setHealth(k: number) {
      health = k;
      glowMat.color.setScalar(0.6 + 0.9 * k);
      runeMat.opacity = 0.35 + 0.45 * k;
    },
    surge(k, color) {
      surgeK = k;
      if (color !== undefined) surgeC.setHex(color);
      shaftMat.color.copy(baseShaft).lerp(surgeC.clone().multiplyScalar(1.6), k);
      runeMat.color.copy(baseRune).lerp(surgeC.clone().multiplyScalar(2), k);
    },
    setModules(mods) {
      const key = mods.map(m => (m ? m.id + m.lv : '-')).join(',');
      if (key === modKey) return;
      modKey = key;
      modGroup.clear();
      let shield = 0;
      mods.forEach((m, slot) => {
        if (!m) return;
        const obj = moduleObject(m.id, m.lv, team, teamL);
        const a = SLOT_ANGLES[slot];
        obj.position.set(Math.cos(a) * 2.2, 0.64, Math.sin(a) * 2.2);
        obj.rotation.y = -a + Math.PI / 2;
        modGroup.add(obj);
        modGroup.add(banner(m.id, m.lv, a + Math.PI / 8));
        if (m.id === 'egide') shield = m.lv;
      });
      (egide.material as THREE.MeshBasicMaterial).opacity = shield ? 0.05 + shield * 0.035 : 0;
      egide.visible = shield > 0;
    },
    update(dt, t) {
      rings[0].rotation.z += dt * 0.7; rings[1].rotation.z -= dt * 0.35; rings[2].rotation.z += dt * 0.5;
      rings[0].rotation.x = Math.PI / 2 - 0.45 + Math.sin(t * 0.6) * 0.08;
      crystal.position.y = 6.25 + Math.sin(t * 1.4) * 0.12;
      halo.position.y = crystal.position.y;
      (halo.material as THREE.SpriteMaterial).opacity = (0.26 + Math.sin(t * 2.2) * 0.06) * (0.5 + 0.5 * health) + surgeK * 0.25;
      halo.scale.setScalar(4.2 + surgeK * 1.6);
      runeOuter.rotation.y += dt * 0.05; runeInner.rotation.y -= dt * 0.12;
      shaft.rotation.y += dt * 0.1;
      shaftMat.opacity = (0.26 + Math.sin(t * 1.7) * 0.06) * (0.4 + 0.6 * health) + surgeK * 0.35;
      shaft.scale.set(1 + surgeK * 1.5, 1, 1 + surgeK * 1.5);
      runeOuter.rotation.y += dt * surgeK * 1.5;
      for (let i = 0; i < 10; i++) {
        const a = t * 0.6 + (i / 10) * Math.PI * 2;
        const r = 2.1 + Math.sin(t + i) * 0.15;
        q.setFromEuler(new THREE.Euler(t + i, t * 1.3 + i, 0));
        m4.compose(v.set(Math.cos(a) * r, 6.2 + Math.sin(a * 2 + i) * 0.6, Math.sin(a) * r), q, sc.set(1, 1.6, 1));
        shards.setMatrixAt(i, m4);
      }
      shards.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < N; i++) {
        const s = moteSeed[i];
        const k = ((t * s.s + s.o) % 1);
        motePos[i * 3] = Math.cos(s.a + k * 2) * s.r;
        motePos[i * 3 + 1] = 1.2 + k * 8.5;
        motePos[i * 3 + 2] = Math.sin(s.a + k * 2) * s.r;
      }
      moteGeo.attributes.position.needsUpdate = true;
      for (const c of modGroup.children) c.userData.update?.(dt, t);
      if (egide.visible) (egide.material as THREE.MeshBasicMaterial).opacity = (egide.userData.base ??= (egide.material as THREE.MeshBasicMaterial).opacity) * (0.8 + Math.sin(t * 2) * 0.2);
    },
  };
}

/** A family banner hanging from the crown for each module: longer with the level, so two Bastions read differently from afar. */
function banner(id: ModuleId, lv: number, a: number): THREE.Object3D {
  const fam = { defense: 0x3a6ad8, artillerie: 0xc8502a, soutien: 0x2a9a5a, controle: 0x8a3ad8 }[MODULES[id].family];
  const len = 0.9 + lv * 0.4;
  const parts: Part[] = [
    { g: box(0.62, 0.05, 0.05), c: GOLD, p: [0, 0, 0], pbr: PBR_GOLD },
    { g: box(0.52, len, 0.03), c: fam, p: [0, -len / 2, 0], pbr: [0, 0.7] },
    { g: cone(0.26, 0.3, 3), c: fam, p: [0, -len - 0.1, 0], r: [0, 0, Math.PI], s: [1, 1, 0.12], pbr: [0, 0.7] },
    { g: box(0.56, 0.04, 0.04), c: GOLD, p: [0, -len + 0.06, 0.02], pbr: PBR_GOLD },
  ];
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeParts(parts), lit()));
  const em = new THREE.Mesh(oct(0.1).scale(1, 1.4, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(fam).multiplyScalar(2.6), toneMapped: false }));
  em.position.set(0, -0.35, 0.04);
  g.add(em);
  g.position.set(Math.cos(a) * 1.4, 5.15, Math.sin(a) * 1.4);
  g.rotation.y = -a + Math.PI / 2;
  return g;
}

/** One module piece (family silhouette, bigger and brighter with the level). */
function moduleObject(id: ModuleId, lv: number, team: number, teamL: number): THREE.Object3D {
  const d = MODULES[id];
  const g = new THREE.Group();
  const parts: Part[] = [], glow: Part[] = [];
  const S = (p: Part) => parts.push({ ...p, pbr: p.pbr ?? PBR_STONE });
  const G = (p: Part) => parts.push({ ...p, pbr: PBR_GOLD });
  const I = (p: Part) => parts.push({ ...p, pbr: PBR_IRON });
  const E = (p: Part) => glow.push(p);
  const fam = { defense: 0x8fb8ff, artillerie: 0xff8a4a, soutien: 0x7dffb0, controle: 0xc08aff }[d.family];
  const spin: THREE.Object3D[] = [];
  // pedestal common to every module
  S({ g: cyl(0.42, 0.5, 0.26, 8), c: 0x4a505e, p: [0, 0.13, 0] });
  G({ g: tor(0.44, 0.03, Math.PI * 2), c: GOLD, p: [0, 0.27, 0], r: [Math.PI / 2, 0, 0] });
  switch (id) {
    case 'rempart':
      for (let i = 0; i < lv + 1; i++) { const a = (i / (lv + 1)) * Math.PI * 2; S({ g: box(0.5, 0.9, 0.12), c: 0x6a7488, p: [Math.cos(a) * 0.4, 0.75, Math.sin(a) * 0.4], r: [0, -a + Math.PI / 2, 0] }); G({ g: box(0.54, 0.06, 0.14), c: GOLD, p: [Math.cos(a) * 0.4, 1.22, Math.sin(a) * 0.4], r: [0, -a + Math.PI / 2, 0] }); E({ g: oct(0.07), c: fam, p: [Math.cos(a) * 0.47, 0.8, Math.sin(a) * 0.47] }); }
      break;
    case 'egide':
      S({ g: cyl(0.12, 0.18, 1.3, 6), c: 0x5a6070, p: [0, 0.9, 0] });
      E({ g: sph(0.2, 1), c: team, p: [0, 1.7, 0] });
      for (let i = 0; i < lv; i++) G({ g: tor(0.3 + i * 0.1, 0.02, Math.PI * 2), c: GOLD, p: [0, 1.7, 0], r: [Math.PI / 2 + i * 0.6, 0, 0] });
      break;
    case 'restauration':
      S({ g: cyl(0.4, 0.3, 0.3, 8), c: 0x5a6070, p: [0, 0.42, 0] });
      E({ g: cyl(0.34, 0.34, 0.04, 8), c: 0x7dffb0, p: [0, 0.58, 0] });
      for (let i = 0; i < lv + 2; i++) E({ g: oct(0.09 + lv * 0.02), c: 0x9affc0, p: [Math.cos(i * 2.1) * 0.16, 0.85 + (i % 2) * 0.25, Math.sin(i * 2.1) * 0.16], s: [0.7, 1.8, 0.7] });
      break;
    case 'canon': {
      // armoured turret: iron drum + dome, brass-banded barrels aimed out and up (one more barrel per level)
      I({ g: cyl(0.36, 0.42, 0.34, 10), c: 0x34383f, p: [0, 0.44, 0] });
      G({ g: tor(0.38, 0.03, Math.PI * 2), c: 0xc08a3a, p: [0, 0.6, 0], r: [Math.PI / 2, 0, 0] });
      I({ g: sph(0.34, 1), c: 0x40444c, p: [0, 0.62, 0], s: [1, 0.7, 1] });
      for (let i = 0; i < lv; i++) {
        const ox = (i - (lv - 1) / 2) * 0.17;
        I({ g: cyl(0.065, 0.085, 0.8, 8), c: 0x2a2c32, p: [ox, 0.78, 0.38], r: [Math.PI / 2 - 0.45, 0, 0] });
        G({ g: cyl(0.095, 0.095, 0.07, 8), c: 0xc08a3a, p: [ox, 0.93, 0.7], r: [Math.PI / 2 - 0.45, 0, 0] });
        E({ g: cyl(0.05, 0.05, 0.02, 8), c: 0xff8a3a, p: [ox, 0.96, 0.76], r: [Math.PI / 2 - 0.45, 0, 0] });
      }
      E({ g: box(0.22, 0.05, 0.02), c: 0xff9a4a, p: [0, 0.66, 0.33] });
      break;
    }
    case 'rayon':
      S({ g: cyl(0.16, 0.24, 0.7, 6), c: 0x4a505e, p: [0, 0.6, 0] });
      E({ g: oct(0.2 + lv * 0.04), c: 0xbff8ff, p: [0, 1.3 + lv * 0.1, 0], s: [0.7, 2.6, 0.7] });
      for (let i = 0; i < 3; i++) G({ g: box(0.05, 0.6, 0.05), c: GOLD, p: [Math.cos(i * 2.1) * 0.18, 1.0, Math.sin(i * 2.1) * 0.18], r: [Math.cos(i * 2.1) * 0.3, 0, Math.sin(i * 2.1) * 0.3] });
      break;
    case 'orage':
      I({ g: cyl(0.06, 0.12, 1.2, 6), c: 0x5a5e6a, p: [0, 0.85, 0] });
      for (let i = 0; i < lv + 2; i++) G({ g: tor(0.3 - i * 0.05, 0.035, Math.PI * 2), c: 0xb07a3a, p: [0, 0.6 + i * 0.22, 0], r: [Math.PI / 2, 0, 0] });
      E({ g: sph(0.16 + lv * 0.03, 1), c: 0x9ffcff, p: [0, 1.6 + lv * 0.1, 0] });
      break;
    case 'onde':
      S({ g: cyl(0.12, 0.2, 0.9, 6), c: 0x4a505e, p: [0, 0.7, 0] });
      for (let i = 0; i < lv; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32 + i * 0.12, 0.03, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(fam).multiplyScalar(2), toneMapped: false })); ring.position.y = 1.25; ring.rotation.x = Math.PI / 2; g.add(ring); spin.push(ring); }
      E({ g: sph(0.12, 1), c: 0xffb070, p: [0, 1.25, 0] });
      break;
    case 'cadence':
      S({ g: cyl(0.1, 0.16, 1.4, 6), c: 0x5a6070, p: [0, 0.95, 0] });
      for (let i = 0; i < lv + 1; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28 + i * 0.1, 0.025, 6, 28), i % 2 ? reflective(surfaceMaterial({ color: GOLD, metalness: 1, roughness: 0.3 }, true)) : new THREE.MeshBasicMaterial({ color: new THREE.Color(fam).multiplyScalar(2), toneMapped: false })); ring.position.y = 1.2 + i * 0.25; ring.rotation.x = Math.PI / 2; g.add(ring); spin.push(ring); }
      E({ g: oct(0.1), c: 0xffe07a, p: [0, 1.8 + lv * 0.15, 0] });
      break;
    case 'forge':
      I({ g: box(0.6, 0.28, 0.32), c: 0x3a3e48, p: [0, 0.45, 0] });
      I({ g: box(0.3, 0.16, 0.24), c: 0x4a4e58, p: [0, 0.66, 0] });
      E({ g: cone(0.12 + lv * 0.03, 0.4 + lv * 0.08, 6), c: 0xff8a3a, p: [0.2, 0.85, 0.1] });
      E({ g: sph(0.08, 0), c: 0x9fe9ff, p: [-0.2, 0.82, 0] });
      break;
    case 'tresor':
      for (let i = 0; i < 4 + lv * 3; i++) G({ g: cyl(0.07, 0.07, 0.025, 10), c: 0xf0c040, p: [(i % 4 - 1.5) * 0.12 + Math.sin(i) * 0.05, 0.3 + Math.floor(i / 4) * 0.03, Math.cos(i * 1.7) * 0.15] });
      S({ g: box(0.42, 0.26, 0.28), c: 0x6a4a2a, p: [0.05, 0.42, -0.12] });
      G({ g: box(0.44, 0.05, 0.3), c: GOLD, p: [0.05, 0.56, -0.12] });
      break;
    case 'givre':
      for (let i = 0; i < lv + 3; i++) E({ g: oct(0.1 + (i % 3) * 0.04), c: i % 2 ? 0xd8f6ff : 0x8fd8ff, p: [Math.cos(i * 1.7) * 0.22, 0.55 + (i % 3) * 0.15, Math.sin(i * 1.7) * 0.22], s: [0.6, 2.4, 0.6], r: [Math.cos(i) * 0.3, i, Math.sin(i) * 0.3] });
      break;
    case 'portail': {
      for (const sx of [-1, 1]) S({ g: box(0.12, 1.0, 0.14), c: 0x4a4458, p: [sx * 0.34, 0.8, 0] });
      G({ g: tor(0.34, 0.05, Math.PI), c: GOLD, p: [0, 1.3, 0] });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ map: vortexTexture(), color: new THREE.Color(0xb07aff).multiplyScalar(1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
      disc.position.y = 1.0; disc.scale.set(1, 1.3, 1);
      g.add(disc); spin.push(disc);
      break;
    }
    case 'entrave':
      S({ g: box(0.26, 1.3 + lv * 0.15, 0.26), c: 0x3a3448, p: [0, 0.9, 0] });
      for (let i = 0; i < lv + 2; i++) G({ g: tor(0.1, 0.03, Math.PI * 2), c: GOLD_D, p: [0.18, 0.5 + i * 0.18, 0], r: [0, i % 2 ? Math.PI / 2 : 0, 0] });
      E({ g: oct(0.1), c: 0xffd27a, p: [0, 1.65 + lv * 0.15, 0] });
      break;
  }
  if (parts.length) g.add(new THREE.Mesh(mergeParts(parts), lit()));
  if (glow.length) g.add(new THREE.Mesh(mergeParts(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.4, 2.4, 2.4) })));
  // level beacon: a small family-coloured light flare
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: fam, transparent: true, opacity: 0.35 + lv * 0.15, depthWrite: false, blending: THREE.AdditiveBlending }));
  flare.position.y = 1.4; flare.scale.setScalar(0.9 + lv * 0.4);
  g.add(flare);
  g.scale.setScalar(1.05 + lv * 0.2);
  g.userData.update = (dt: number, t: number) => { spin.forEach((o, i) => { o.rotation.z += dt * (1.2 + i * 0.6) * (i % 2 ? -1 : 1); }); (flare.material as THREE.SpriteMaterial).opacity = (0.35 + lv * 0.15) * (0.75 + Math.sin(t * 3) * 0.25); };
  void teamL; void shade; void mix; void cone;
  return g;
}
