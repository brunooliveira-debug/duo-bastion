// Renderer3D — Three.js scene. Reads ViewState (meta + interpolated entities + events); never touches the sim.
import * as THREE from 'three';
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, GRID } from '../data/economy';
import { LANE, cellCenter } from '../sim/state';
import type { GameEvent } from '../sim/state';
import { modelFor, toonMaterial } from './models';
import { EntView, F_ENEMY, F_SHIELD, F_SLOW, MetaView, ViewState } from '../net/snapshot';

export type Quality = 'high' | 'medium' | 'battery';
export const ARENA_GAP = 34;
const arenaZ = (a: number) => a * ARENA_GAP;

const FX_COLORS: Record<string, number> = {
  spark: 0xffd27a, leaf: 0x9aff7a, star: 0xbfe0ff, water: 0x7ff6ff, fire: 0xff8a3a, note: 0xfff6c0,
  shadow: 0xd06aff, lightning: 0x9ffcff, enemy: 0xff4a6a, core: 0x7fd8ff,
};
export const SLOT_COLORS = [0x4aa8ff, 0xffa23a];
const ENEMY_RING = 0xff3a5a;

interface EntVis {
  mesh: THREE.Mesh;
  defId: string;
  x: number; z: number; // smoothed render position
  face: number;
  lunge: number; lungeX: number; lungeZ: number;
  flash: number;
  bob: number;
  seen: number;
}

interface Proj { mesh: THREE.Mesh; from: THREE.Vector3; toId: number; to: THREE.Vector3; t: number; dur: number; active: boolean }
interface RingFx { mesh: THREE.Mesh; t: number; dur: number; r: number; active: boolean }
interface BoltFx { line: THREE.Line; t: number; active: boolean }

export interface DragGhost { defId: string; col: number; row: number; valid: boolean; slot: number; team: number }

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  quality: Quality;
  private mat = toonMaterial();
  private flashMat = toonMaterial();
  private ghostMat = toonMaterial({ transparent: true, opacity: 0.55 });
  private ents = new Map<number, EntVis>();
  private builds = new Map<string, THREE.Mesh>(); // key pid:bid
  private hpBg: THREE.InstancedMesh;
  private hpFg: THREE.InstancedMesh;
  private blobs: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private projs: Proj[] = [];
  private ringFx: RingFx[] = [];
  private bolts: BoltFx[] = [];
  private particles: THREE.Points;
  private pPos: Float32Array; private pVel: Float32Array; private pLife: Float32Array; private pCol: Float32Array;
  private pNext = 0;
  private cores: THREE.Group[] = [];
  private coreCrystals: THREE.Mesh[] = [];
  private portals: THREE.Mesh[] = [];
  private gridLines: THREE.LineSegments[] = [];
  private cellHi: THREE.InstancedMesh;
  private ghost: THREE.Mesh | null = null;
  private ghostKey = '';
  private rangeRing: THREE.Mesh;
  private auraRing: THREE.Mesh;
  private selRing: THREE.Mesh;
  private time = 0;
  shake = 0;
  // camera
  target = new THREE.Vector3(-16, 0, 1.2);
  dist = 26;
  private pitch = THREE.MathUtils.degToRad(56);
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  arenas = 1;

  constructor(private canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.applyQuality();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    this.flashMat.emissive = new THREE.Color(0xffffff);
    this.flashMat.emissiveIntensity = 0.7;

    const s = this.scene;
    s.background = new THREE.Color(0x0b0d1c);
    s.fog = new THREE.Fog(0x0b0d1c, 60, 140);
    s.add(new THREE.HemisphereLight(0xc0d4ff, 0x40305a, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(-20, 40, 25);
    s.add(sun);
    if (quality === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const c = sun.shadow.camera as THREE.OrthographicCamera;
      c.left = -45; c.right = 45; c.top = 30; c.bottom = -30;
      this.renderer.shadowMap.enabled = true;
    }

    // HP bars, blob shadows, team rings (instanced → 4 draw calls total)
    const N = 400;
    this.hpBg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.12), new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.8 }), N);
    this.hpFg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), N);
    this.hpBg.renderOrder = 10; this.hpFg.renderOrder = 11;
    const blobTex = radialTexture();
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 }), N);
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), N);
    for (const m of [this.hpBg, this.hpFg, this.blobs, this.rings]) { m.count = 0; m.frustumCulled = false; s.add(m); }
    this.hpFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);

    // particles
    const P = quality === 'battery' ? 200 : 700;
    this.pPos = new Float32Array(P * 3); this.pVel = new Float32Array(P * 3); this.pLife = new Float32Array(P); this.pCol = new Float32Array(P * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.particles.frustumCulled = false;
    s.add(this.particles);

    // cell highlight
    this.cellHi = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false }), GRID.cols * GRID.rows);
    this.cellHi.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRID.cols * GRID.rows * 3), 3);
    this.cellHi.visible = false; this.cellHi.frustumCulled = false;
    s.add(this.cellHi);

    const ringMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48).rotateX(-Math.PI / 2), ringMat(0xffffff, 0.5));
    this.auraRing = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), ringMat(0x9fffd0, 0.12));
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24).rotateX(-Math.PI / 2), ringMat(0xffffff, 0.9));
    for (const m of [this.rangeRing, this.auraRing, this.selRing]) { m.visible = false; m.position.y = 0.23; s.add(m); }

    // FX pools
    const projGeo = new THREE.OctahedronGeometry(0.12, 0);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false; s.add(m);
      this.projs.push({ mesh: m, from: new THREE.Vector3(), to: new THREE.Vector3(), toId: 0, t: 0, dur: 0.2, active: false });
    }
    const ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; m.position.y = 0.3; s.add(m);
      this.ringFx.push({ mesh: m, t: 0, dur: 0.4, r: 1, active: false });
    }
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9ffcff, transparent: true }));
      l.visible = false; l.frustumCulled = false; s.add(l);
      this.bolts.push({ line: l, t: 0, active: false });
    }
  }

  applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
  }

  /** Build static arena geometry for `n` team arenas. */
  buildArenas(n: number) {
    this.arenas = n;
    const s = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c2440 }));
    ground.position.set(0, -0.05, n > 1 ? ARENA_GAP / 2 : 0);
    ground.receiveShadow = true;
    s.add(ground);
    const rand = mulberry(1234);
    for (let a = 0; a < n; a++) {
      const z0 = arenaZ(a);
      const enemyArena = a > 0;
      // lanes
      for (let slot = 0; slot < 2; slot++) {
        const d = slot === 0 ? -1 : 1;
        const laneLen = LANE.spawnX + 3 - LANE.leakX + 1;
        const cx = d * (LANE.leakX - 1 + laneLen / 2);
        const tint = enemyArena ? 0x5a3048 : slot === 0 ? 0x34508a : 0x7a5234;
        const lane = new THREE.Mesh(new THREE.BoxGeometry(laneLen, 0.3, LANE.halfWidth * 2 + 1), new THREE.MeshLambertMaterial({ color: tint }));
        lane.position.set(cx, 0.05, z0);
        lane.receiveShadow = true;
        s.add(lane);
        // glowing edges
        const edgeCol = enemyArena ? 0xff4a6a : SLOT_COLORS[slot];
        for (const ez of [-1, 1]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(laneLen, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: edgeCol }));
          edge.position.set(cx, 0.24, z0 + ez * (LANE.halfWidth + 0.5));
          s.add(edge);
        }
        // build area tiles
        const area = new THREE.Mesh(new THREE.PlaneGeometry(GRID.cols, GRID.rows).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: edgeCol, transparent: true, opacity: 0.07, depthWrite: false }));
        const c0 = cellCenter(slot, 0, 0), c1 = cellCenter(slot, GRID.cols - 1, GRID.rows - 1);
        area.position.set((c0.x + c1.x) / 2, 0.21, z0);
        s.add(area);
        // grid lines
        const pts: number[] = [];
        const xs = [Math.min(c0.x, c1.x) - 0.5, Math.max(c0.x, c1.x) + 0.5];
        for (let r = 0; r <= GRID.rows; r++) { const z = z0 - GRID.rows / 2 + r; pts.push(xs[0], 0.22, z, xs[1], 0.22, z); }
        for (let c = 0; c <= GRID.cols; c++) { const x = xs[0] + c; pts.push(x, 0.22, z0 - GRID.rows / 2, x, 0.22, z0 + GRID.rows / 2); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: edgeCol, transparent: true, opacity: 0.35 }));
        s.add(lines);
        this.gridLines.push(lines);
        // portal
        const portal = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 8, 32), new THREE.MeshBasicMaterial({ color: 0xb04aff }));
        portal.position.set(d * (LANE.spawnX + 1.5), 2.2, z0);
        portal.rotation.y = Math.PI / 2;
        s.add(portal); this.portals.push(portal);
        const inner = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: 0x3a0a5a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        inner.position.copy(portal.position); inner.rotation.y = Math.PI / 2;
        s.add(inner);
      }
      // core plaza
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(LANE.leakX, LANE.leakX + 0.5, 0.3, 48), new THREE.MeshLambertMaterial({ color: enemyArena ? 0x2a1a2a : 0x1e2a40 }));
      plaza.position.set(0, 0.04, z0); plaza.receiveShadow = true; s.add(plaza);
      const glyph = new THREE.Mesh(new THREE.RingGeometry(CORE.range - 0.1, CORE.range, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: enemyArena ? 0xff4a6a : 0x5ad8ff, transparent: true, opacity: 0.25 }));
      glyph.position.set(0, 0.21, z0); s.add(glyph);
      // core
      const g = new THREE.Group();
      g.position.set(0, 0, z0);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x2a3050 }));
      ped.position.y = 0.45; g.add(ped);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: enemyArena ? 0xff5a7a : 0x6ad8ff, emissive: enemyArena ? 0xa01030 : 0x1a8aff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3, flatShading: true }));
      crystal.scale.set(1, 1.6, 1); crystal.position.y = 2.6; g.add(crystal);
      for (let i = 0; i < 2; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1.6 + i * 0.4, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: enemyArena ? 0xff8aa0 : 0xaef0ff }));
        r.position.y = 2.6; r.rotation.x = Math.PI / 2 + i * 0.5; g.add(r);
      }
      const light = new THREE.PointLight(enemyArena ? 0xff4a6a : 0x5ad8ff, 25, 16, 1.6);
      light.position.y = 3; g.add(light);
      s.add(g); this.cores.push(g); this.coreCrystals.push(crystal);
      // decorations (crystals & pillars outside lanes)
      const deco = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: 0x5a4aa0, emissive: 0x20104a }), 40);
      const pil = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), new THREE.MeshLambertMaterial({ color: 0x2a2e48 }), 16);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 40; i++) {
        const x = (rand() - 0.5) * 80, side = rand() < 0.5 ? -1 : 1;
        const z = z0 + side * (6.5 + rand() * 6);
        const sc = 0.5 + rand() * 1.4;
        m4.compose(new THREE.Vector3(x, sc * 0.5, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(), rand() * 3, rand() * 0.4)), new THREE.Vector3(sc * 0.7, sc * 1.6, sc * 0.7));
        deco.setMatrixAt(i, m4);
      }
      for (let i = 0; i < 16; i++) {
        const x = -36 + i * 4.8, side = i % 2 ? -1 : 1;
        m4.compose(new THREE.Vector3(x, 1.5, z0 + side * 6), new THREE.Quaternion(), new THREE.Vector3(1, 0.6 + rand() * 0.8, 1));
        pil.setMatrixAt(i, m4);
      }
      s.add(deco, pil);
    }
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Fit the camera on a lane of the given arena/slot. */
  focus(slot: number, arena = 0) {
    const aspect = this.camera.aspect || 1.8;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect;
    const span = aspect > 1.3 ? 22 : 15;
    this.dist = THREE.MathUtils.clamp(span / tanH, 14, 70);
    this.target.set(slot === 0 ? -19.5 : 19.5, 0, arenaZ(arena) + 2.2);
  }

  pan(dxPx: number, dyPx: number) {
    const h = this.renderer.domElement.clientHeight || 1;
    const k = (this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 2) / h;
    this.target.x -= dxPx * k;
    this.target.z -= dyPx * k / Math.sin(this.pitch);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -36, 36);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -6, arenaZ(this.arenas - 1) + 6);
  }
  zoom(f: number) { this.dist = THREE.MathUtils.clamp(this.dist * f, 9, 75); }

  /** Screen → ground point. */
  pick(px: number, py: number): THREE.Vector3 | null {
    const el = this.renderer.domElement;
    const r = el.getBoundingClientRect();
    const v = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const out = new THREE.Vector3();
    this.ground.constant = -0.2;
    return this.ray.ray.intersectPlane(this.ground, out) ? out : null;
  }

  /** World → cell of a lane (or null). */
  static cellAt(slot: number, team: number, x: number, z: number) {
    const lz = z - arenaZ(team);
    const col = slot === 0 ? Math.floor(x + LANE.gridFrontX) : Math.floor(LANE.gridFrontX - x);
    const row = Math.floor(lz + GRID.rows / 2);
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
    return { col, row };
  }

  /** Which build (if any) is under this ground point for a player. */
  static buildAt(meta: MetaView, pid: number, x: number, z: number) {
    const p = meta.players[pid];
    const c = Renderer.cellAt(p.slot, p.team, x, z);
    if (!c) return null;
    return p.builds.find(b => b.col === c.col && b.row === c.row) ?? null;
  }

  worldToScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.renderer.domElement;
    return { x: (v.x * 0.5 + 0.5) * el.clientWidth, y: (-v.y * 0.5 + 0.5) * el.clientHeight };
  }

  // ---------------------------------------------------------------- per-frame

  frame(dt: number, view: ViewState, opts: { localPid: number; ghost: DragGhost | null; selected: { pid: number; bid: number } | null; showGrid: boolean; events: GameEvent[] }) {
    this.time += dt;
    const meta = view.meta;
    if (!meta) { this.renderer.render(this.scene, this.camera); return; }
    const combat = meta.phase === 'combat';

    // ---------- builds (static, outside combat) ----------
    const seenB = new Set<string>();
    if (!combat) {
      for (const p of meta.players) {
        for (const b of p.builds) {
          const key = `${p.pid}:${b.bid}`;
          seenB.add(key);
          let m = this.builds.get(key);
          if (!m || m.userData.defId !== b.defId) {
            if (m) this.scene.remove(m);
            m = new THREE.Mesh(modelFor(b.defId, UNITS[b.defId].model), this.mat);
            m.userData.defId = b.defId; m.userData.born = this.time;
            m.castShadow = this.quality === 'high';
            this.scene.add(m);
            this.builds.set(key, m);
          }
          const c = cellCenter(p.slot, b.col, b.row);
          m.position.set(c.x, 0.2, c.z + arenaZ(p.team));
          m.rotation.y = p.slot === 0 ? -Math.PI / 2 : Math.PI / 2;
          const age = this.time - m.userData.born;
          const pop = age < 0.35 ? 0.6 + 0.4 * easeOutBack(age / 0.35) : 1;
          m.scale.setScalar(pop * (1 + Math.sin(this.time * 2 + b.bid) * 0.015));
        }
      }
    }
    for (const [k, m] of this.builds) if (!seenB.has(k)) { this.scene.remove(m); this.builds.delete(k); }

    // ---------- entities ----------
    const list = combat ? view.sample() : [];
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let v = this.ents.get(e.id);
      const wx = e.x, wz = e.z + arenaZ(e.arena);
      if (!v) {
        const def = e.flags & F_ENEMY ? ENEMIES[e.defId] : UNITS[e.defId];
        const mesh = new THREE.Mesh(modelFor(e.defId, def.model), this.mat);
        mesh.castShadow = this.quality === 'high';
        this.scene.add(mesh);
        v = { mesh, defId: e.defId, x: wx, z: wz, face: e.flags & F_ENEMY ? (e.x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0, lunge: 0, lungeX: 0, lungeZ: 0, flash: 0, bob: Math.random() * 6, seen: 0 };
        this.ents.set(e.id, v);
      }
      const dx = wx - v.x, dz = wz - v.z;
      const moving = Math.hypot(dx, dz) > 0.004;
      if (Math.hypot(dx, dz) > 3) { v.x = wx; v.z = wz; } else { v.x = wx; v.z = wz; }
      if (moving) v.face = lerpAngle(v.face, Math.atan2(dx, dz), 0.25);
      v.bob += dt * (moving ? 10 : 2);
      v.lunge = Math.max(0, v.lunge - dt * 6);
      v.flash = Math.max(0, v.flash - dt);
      const lk = Math.sin(v.lunge * Math.PI) * 0.35;
      v.mesh.position.set(v.x + v.lungeX * lk, 0.2 + (moving ? Math.abs(Math.sin(v.bob)) * 0.08 : 0), v.z + v.lungeZ * lk);
      v.mesh.rotation.y = v.face;
      v.mesh.material = v.flash > 0 ? this.flashMat : this.mat;
      const sq = 1 + (v.flash > 0 ? 0.08 : 0);
      v.mesh.scale.set(sq, sq * (moving ? 1 - Math.abs(Math.sin(v.bob)) * 0.04 : 1), sq);
    }
    for (const [id, v] of this.ents) {
      if (!seen.has(id)) {
        this.scene.remove(v.mesh);
        this.ents.delete(id);
      }
    }

    // ---------- events → FX ----------
    for (const ev of opts.events) this.onEvent(ev, view);

    // ---------- HP bars / blobs / rings ----------
    const m4 = new THREE.Matrix4();
    const q = this.camera.quaternion;
    let nb = 0, nr = 0;
    const col = new THREE.Color();
    const place = (x: number, z: number, scale: number, color: number, hp: number, showHp: boolean, boss: boolean, shield: boolean, slow: boolean) => {
      if (nr >= 400) return;
      m4.compose(new THREE.Vector3(x, 0.22, z), new THREE.Quaternion(), new THREE.Vector3(scale * 2.2, 1, scale * 2.2));
      this.blobs.setMatrixAt(nr, m4);
      m4.compose(new THREE.Vector3(x, 0.24, z), new THREE.Quaternion(), new THREE.Vector3(scale * 1.4, 1, scale * 1.4));
      this.rings.setMatrixAt(nr, m4);
      this.rings.setColorAt(nr, col.setHex(slow ? 0x7ff6ff : color));
      nr++;
      if (showHp && nb < 400) {
        const w = boss ? 2.6 : 1.0 * Math.max(0.8, scale);
        const y = 2.1 * scale + (boss ? 2.2 : 0.5);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w + 0.06, 1, 1));
        this.hpBg.setMatrixAt(nb, m4);
        const fw = Math.max(0.001, w * hp);
        const off = new THREE.Vector3(-(w - fw) / 2, 0, 0).applyQuaternion(q);
        m4.compose(new THREE.Vector3(x + off.x, y + off.y, z + off.z), q, new THREE.Vector3(fw, 1, 1));
        this.hpFg.setMatrixAt(nb, m4);
        this.hpFg.setColorAt(nb, col.setHex(shield ? 0xeaf6ff : hp > 0.6 ? 0x5aff7a : hp > 0.3 ? 0xffd04a : 0xff4a4a));
        nb++;
      }
    };
    if (combat) {
      for (const e of list) {
        const v = this.ents.get(e.id)!;
        const enemy = !!(e.flags & F_ENEMY);
        const def = enemy ? ENEMIES[e.defId] : UNITS[e.defId];
        const owner = meta.players[e.owner];
        const color = enemy ? ENEMY_RING : SLOT_COLORS[owner?.slot ?? 0];
        const boss = enemy && !!ENEMIES[e.defId].boss;
        place(v.mesh.position.x, v.mesh.position.z, def.model.scale, color, e.hp, e.hp < 0.999 || boss || !!(e.flags & F_SHIELD), boss, !!(e.flags & F_SHIELD), !!(e.flags & F_SLOW));
      }
    } else {
      for (const p of meta.players) for (const b of p.builds) {
        const m = this.builds.get(`${p.pid}:${b.bid}`);
        if (m) place(m.position.x, m.position.z, UNITS[b.defId].model.scale, SLOT_COLORS[p.slot], 1, false, false, false, false);
      }
    }
    this.blobs.count = nr; this.rings.count = nr; this.hpBg.count = nb; this.hpFg.count = nb;
    for (const m of [this.blobs, this.rings, this.hpBg, this.hpFg]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // ---------- grid, ghost, selection ----------
    const gridOpacity = opts.showGrid && !combat ? 0.35 : 0.06;
    for (const g of this.gridLines) (g.material as THREE.LineBasicMaterial).opacity += (gridOpacity - (g.material as THREE.LineBasicMaterial).opacity) * 0.15;
    this.updateGhost(meta, opts.ghost, opts.localPid);
    this.updateSelection(meta, opts.selected, combat);

    // ---------- FX update ----------
    this.updateFx(dt, view);

    // ---------- core & portals ----------
    this.coreCrystals.forEach((c, i) => {
      const t = meta.teams[i];
      const k = t ? t.hp / t.maxHp : 1;
      c.rotation.y += dt * (0.6 + (1 - k) * 2);
      c.position.y = 2.6 + Math.sin(this.time * 1.5 + i) * 0.15;
      const mat = c.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + 0.8 * k + (k < 0.3 ? Math.abs(Math.sin(this.time * 6)) * 0.8 : 0);
      this.cores[i].children.forEach((ch, j) => { if (j >= 2 && ch instanceof THREE.Mesh) ch.rotation.z += dt * (j === 2 ? 0.8 : -0.5); });
    });
    for (const p of this.portals) p.rotation.x += dt * 0.8;

    // ---------- camera ----------
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.6;
    const off = new THREE.Vector3(0, Math.sin(this.pitch), Math.cos(this.pitch)).multiplyScalar(this.dist);
    this.camera.position.copy(this.target).add(off).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    this.camera.lookAt(this.target);

    this.renderer.render(this.scene, this.camera);
  }

  private updateGhost(meta: MetaView, ghost: DragGhost | null, localPid: number) {
    if (!ghost) {
      if (this.ghost) this.ghost.visible = false;
      this.cellHi.visible = false; this.rangeRing.visible = false; this.auraRing.visible = false;
      return;
    }
    const def = UNITS[ghost.defId];
    if (this.ghostKey !== ghost.defId) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = new THREE.Mesh(modelFor(ghost.defId, def.model), this.ghostMat);
      this.scene.add(this.ghost);
      this.ghostKey = ghost.defId;
    }
    const c = cellCenter(ghost.slot, ghost.col, ghost.row);
    const z = c.z + arenaZ(ghost.team);
    this.ghost!.visible = true;
    this.ghost!.position.set(c.x, 0.25 + Math.sin(this.time * 6) * 0.05, z);
    this.ghost!.rotation.y = ghost.slot === 0 ? -Math.PI / 2 : Math.PI / 2;
    // cells
    const p = meta.players[localPid];
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    let i = 0;
    for (let cc = 0; cc < GRID.cols; cc++) for (let r = 0; r < GRID.rows; r++) {
      const cp = cellCenter(p.slot, cc, r);
      m4.makeTranslation(cp.x, 0.22, cp.z + arenaZ(p.team));
      this.cellHi.setMatrixAt(i, m4);
      const occ = p.builds.some(b => b.col === cc && b.row === r);
      this.cellHi.setColorAt(i, col.setHex(cc === ghost.col && r === ghost.row ? (ghost.valid ? 0xffffff : 0xff3a3a) : occ ? 0xff5a5a : 0x5aff9a));
      i++;
    }
    this.cellHi.count = i;
    this.cellHi.instanceMatrix.needsUpdate = true; this.cellHi.instanceColor!.needsUpdate = true;
    this.cellHi.visible = true;
    // range + aura
    this.rangeRing.visible = true;
    this.rangeRing.position.set(c.x, 0.23, z);
    const rr = Math.max(1.2, def.range + 0.4);
    this.rangeRing.scale.setScalar(rr);
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(ghost.valid ? 0xffffff : 0xff5a5a);
    const aura = def.abilities.find(a => a.kind === 'auraAttackSpeed' || a.kind === 'taunt' || a.kind === 'slowPulse' || a.kind === 'splash') as { radius: number; kind: string } | undefined;
    if (aura) {
      this.auraRing.visible = true;
      this.auraRing.position.set(c.x, 0.225, z);
      this.auraRing.scale.setScalar(aura.radius);
      (this.auraRing.material as THREE.MeshBasicMaterial).color.setHex(aura.kind === 'taunt' ? 0xffb04a : aura.kind === 'slowPulse' ? 0x7ff6ff : aura.kind === 'splash' ? 0xff8a3a : 0x9fffd0);
    } else this.auraRing.visible = false;
  }

  private updateSelection(meta: MetaView, sel: { pid: number; bid: number } | null, combat: boolean) {
    if (!sel || combat) { this.selRing.visible = false; if (!combat && !sel) { /* keep ghost rings */ } return; }
    const p = meta.players[sel.pid];
    const b = p?.builds.find(x => x.bid === sel.bid);
    if (!b) { this.selRing.visible = false; return; }
    const c = cellCenter(p.slot, b.col, b.row);
    this.selRing.visible = true;
    this.selRing.position.set(c.x, 0.25, c.z + arenaZ(p.team));
    this.selRing.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
    if (!this.ghost?.visible) {
      const def = UNITS[b.defId];
      this.rangeRing.visible = true;
      this.rangeRing.position.copy(this.selRing.position);
      this.rangeRing.scale.setScalar(Math.max(1.2, def.range + 0.4));
      (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    }
  }

  // ---------------------------------------------------------------- FX

  private posOf(id: number, view: ViewState): THREE.Vector3 | null {
    const v = this.ents.get(id);
    if (v) return v.mesh.position.clone();
    const e = view.latest(id);
    return e ? new THREE.Vector3(e.x, 0.2, e.z + arenaZ(e.arena)) : null;
  }

  private onEvent(ev: GameEvent, view: ViewState) {
    switch (ev.t) {
      case 'atk': {
        const a = this.posOf(ev.a, view), b = this.posOf(ev.b, view);
        if (!a || !b) return;
        const va = this.ents.get(ev.a);
        if (ev.fx === 'lightning') { this.bolt(a, b); this.hitFlash(ev.b); return; }
        if (ev.ranged) this.projectile(a, b, ev.b, FX_COLORS[ev.fx] ?? 0xffffff);
        else {
          if (va) { va.lunge = 1; const d = b.clone().sub(a).normalize(); va.lungeX = d.x; va.lungeZ = d.z; }
          this.burst(b.x, 0.8, b.z, FX_COLORS[ev.fx] ?? 0xffffff, 4, 2);
          this.hitFlash(ev.b);
        }
        break;
      }
      case 'coreShot': {
        const b = this.posOf(ev.b, view);
        if (b) this.bolt(new THREE.Vector3(0, 2.6, arenaZ(ev.team)), b, 0x7fd8ff);
        break;
      }
      case 'die': {
        const z = ev.z + arenaZ(ev.arena);
        this.burst(ev.x, 0.7, z, ev.boss ? 0xffd04a : 0xff6a8a, ev.boss ? 80 : 12, ev.boss ? 7 : 3);
        if (ev.boss) { this.ring(ev.x, z, 6, 0xffd04a, 0.9); this.shake = 1; }
        break;
      }
      case 'pulse': this.ring(ev.x, ev.z + arenaZ(ev.arena), ev.r, FX_COLORS[ev.fx] ?? 0xffffff, 0.4); break;
      case 'heal': { const p = this.posOf(ev.id, view); if (p) this.burst(p.x, 1.2, p.z, 0x8aff9a, 5, 1.2); break; }
      case 'dash': { const p = this.posOf(ev.id, view); if (p) this.burst(p.x, 0.8, p.z, 0xd06aff, 14, 3); break; }
      case 'coreHit': {
        this.ring(0, arenaZ(ev.team), 3.5, 0xff3a3a, 0.5);
        this.burst(0, 2.6, arenaZ(ev.team), 0xff5a5a, 18, 5);
        if (ev.team === 0) this.shake = Math.min(1, this.shake + 0.45);
        break;
      }
      case 'evolve': case 'build': {
        // flash on the build; we only know pid/bid → find mesh
        const key = `${ev.pid}:${ev.bid}`;
        setTimeout(() => {
          const m = this.builds.get(key);
          if (m) { this.ring(m.position.x, m.position.z, ev.t === 'evolve' ? 2.2 : 1.2, ev.t === 'evolve' ? 0xffe08a : 0xaef0ff, 0.5); this.burst(m.position.x, 1, m.position.z, ev.t === 'evolve' ? 0xffe08a : 0xaef0ff, ev.t === 'evolve' ? 40 : 10, 3); m.userData.born = this.time - 0.05; }
        }, 30);
        break;
      }
    }
  }

  private hitFlash(id: number) { const v = this.ents.get(id); if (v) v.flash = 0.08; }

  private projectile(a: THREE.Vector3, b: THREE.Vector3, toId: number, color: number) {
    const p = this.projs.find(x => !x.active);
    if (!p) return;
    p.active = true; p.t = 0; p.from.copy(a).setY(1); p.to.copy(b).setY(0.8); p.toId = toId;
    p.dur = Math.min(0.35, 0.08 + a.distanceTo(b) * 0.04);
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.mesh.visible = true;
  }

  private bolt(a: THREE.Vector3, b: THREE.Vector3, color = 0x9ffcff) {
    const bo = this.bolts.find(x => !x.active);
    if (!bo) return;
    bo.active = true; bo.t = 0.15;
    const pos = bo.line.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 6; i++) {
      const k = i / 5;
      pos.setXYZ(i, a.x + (b.x - a.x) * k + (i && i < 5 ? (Math.random() - 0.5) * 0.5 : 0), (a.y > 2 ? a.y : 1) * (1 - k) + 0.9 * k + (i && i < 5 ? Math.random() * 0.3 : 0), a.z + (b.z - a.z) * k + (i && i < 5 ? (Math.random() - 0.5) * 0.5 : 0));
    }
    pos.needsUpdate = true;
    (bo.line.material as THREE.LineBasicMaterial).color.setHex(color);
    bo.line.visible = true;
  }

  ring(x: number, z: number, r: number, color: number, dur: number) {
    const f = this.ringFx.find(x => !x.active);
    if (!f) return;
    f.active = true; f.t = 0; f.dur = dur; f.r = r;
    f.mesh.position.set(x, 0.3, z);
    (f.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    f.mesh.visible = true;
  }

  burst(x: number, y: number, z: number, color: number, n: number, speed: number) {
    if (this.quality === 'battery') n = Math.ceil(n / 3);
    const c = new THREE.Color(color);
    const P = this.pLife.length;
    for (let i = 0; i < n; i++) {
      const k = this.pNext = (this.pNext + 1) % P;
      this.pPos[k * 3] = x; this.pPos[k * 3 + 1] = y; this.pPos[k * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.pVel[k * 3] = Math.cos(a) * speed * u; this.pVel[k * 3 + 1] = Math.random() * speed; this.pVel[k * 3 + 2] = Math.sin(a) * speed * u;
      this.pLife[k] = 0.4 + Math.random() * 0.4;
      this.pCol[k * 3] = c.r; this.pCol[k * 3 + 1] = c.g; this.pCol[k * 3 + 2] = c.b;
    }
  }

  private updateFx(dt: number, view: ViewState) {
    for (const p of this.projs) {
      if (!p.active) continue;
      p.t += dt;
      const tgt = this.ents.get(p.toId);
      if (tgt) p.to.set(tgt.mesh.position.x, 0.8, tgt.mesh.position.z);
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 0.6;
      p.mesh.rotation.y += dt * 12;
      if (k >= 1) {
        p.active = false; p.mesh.visible = false;
        this.burst(p.to.x, p.to.y, p.to.z, (p.mesh.material as THREE.MeshBasicMaterial).color.getHex(), 3, 1.5);
        this.hitFlash(p.toId);
      }
    }
    for (const f of this.ringFx) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(0.2 + f.r * easeOutCubic(Math.min(1, k)));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { f.active = false; f.mesh.visible = false; }
    }
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.t / 0.15);
      if (b.t <= 0) { b.active = false; b.line.visible = false; }
    }
    const P = this.pLife.length;
    for (let k = 0; k < P; k++) {
      if (this.pLife[k] <= 0) { this.pPos[k * 3 + 1] = -50; continue; }
      this.pLife[k] -= dt;
      this.pVel[k * 3 + 1] -= 6 * dt;
      this.pPos[k * 3] += this.pVel[k * 3] * dt;
      this.pPos[k * 3 + 1] = Math.max(0.25, this.pPos[k * 3 + 1] + this.pVel[k * 3 + 1] * dt);
      this.pPos[k * 3 + 2] += this.pVel[k * 3 + 2] * dt;
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    void view;
  }

  dispose() { this.renderer.dispose(); }
}

function easeOutBack(x: number) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
function easeOutCubic(x: number) { return 1 - Math.pow(1 - x, 3); }
function lerpAngle(a: number, b: number, t: number) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function mulberry(seed: number) { let s = seed; return () => { let t = (s = (s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
