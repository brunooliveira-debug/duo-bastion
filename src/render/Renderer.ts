// Renderer3D — Three.js scene. Reads ViewState (meta + interpolated entities + events); never touches the sim.
// Units and enemies are articulated 3D characters (characters.ts) on floating-island arenas (environment.ts).
import * as THREE from 'three';
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, GRID } from '../data/economy';
import { LANE, cellCenter } from '../sim/state';
import type { GameEvent } from '../sim/state';
import { toonMaterial } from './models';
import { Rig } from './characters';
import { buildEnvironment, Env } from './environment';
import { glowTexture } from './textures';
import { EntView, F_ENEMY, F_SHIELD, F_SLOW, MetaView, ViewState } from '../net/snapshot';

export type Quality = 'high' | 'medium' | 'battery';
export const ARENA_GAP = 34;
const arenaZ = (a: number) => a * ARENA_GAP;
const GROUND_Y = 0.2;

const FX_COLORS: Record<string, number> = {
  spark: 0xffd27a, leaf: 0x9aff7a, star: 0xbfe0ff, water: 0x7ff6ff, fire: 0xff8a3a, note: 0xfff6c0,
  shadow: 0xd06aff, lightning: 0x9ffcff, enemy: 0xff4a6a, core: 0x7fd8ff,
};
export const SLOT_COLORS = [0x4aa8ff, 0xffa23a];
const ENEMY_RING = 0xff3a5a;

interface EntVis {
  rig: Rig;
  defId: string;
  x: number; z: number;
  face: number;
  lunge: number; lungeX: number; lungeZ: number;
  flash: number;
}
interface Dying { rig: Rig; t: number }
interface Proj { mesh: THREE.Mesh; trail: THREE.Mesh; from: THREE.Vector3; toId: number; to: THREE.Vector3; t: number; dur: number; active: boolean }
interface RingFx { mesh: THREE.Mesh; t: number; dur: number; r: number; active: boolean }
interface BoltFx { line: THREE.Line; t: number; active: boolean }

export interface DragGhost { defId: string; col: number; row: number; valid: boolean; slot: number; team: number }

function defOf(id: string) { return UNITS[id] ?? ENEMIES[id]; }

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  quality: Quality;
  private mat = toonMaterial();
  private flashMat = toonMaterial();
  private ghostMat = toonMaterial({ transparent: true, opacity: 0.55 });
  private ents = new Map<number, EntVis>();
  private dying: Dying[] = [];
  private builds = new Map<string, Rig>(); // key pid:bid
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
  private env: Env | null = null;
  private gridLines: THREE.LineSegments[] = [];
  private cellHi: THREE.InstancedMesh;
  private ghost: Rig | null = null;
  private ghostKey = '';
  private rangeRing: THREE.Mesh;
  private auraRing: THREE.Mesh;
  private selRing: THREE.Mesh;
  private time = 0;
  shake = 0;
  target = new THREE.Vector3(-16, 0, 1.2);
  dist = 26;
  private pitch = THREE.MathUtils.degToRad(48);
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
  arenas = 1;

  constructor(private canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.applyQuality();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1000);
    this.flashMat.emissive = new THREE.Color(0xffffff);
    this.flashMat.emissiveIntensity = 0.75;

    const s = this.scene;
    s.background = new THREE.Color(0x5b3f7e);
    s.fog = new THREE.Fog(0xc98aa0, 95, 340);
    s.add(new THREE.HemisphereLight(0xd8c4ff, 0x3a2848, 1.35));
    const sun = new THREE.DirectionalLight(0xffd2a0, 2.1);
    sun.position.set(-45, 60, 35);
    s.add(sun);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 0.45);
    rim.position.set(40, 25, -30);
    s.add(rim);
    if (quality === 'high') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 1024);
      const c = sun.shadow.camera as THREE.OrthographicCamera;
      c.left = -55; c.right = 55; c.top = 30; c.bottom = -30; c.far = 200;
      sun.shadow.bias = -0.0008;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // HP bars, blob shadows, team rings (instanced → 4 draw calls total)
    const N = 400;
    this.hpBg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.14), new THREE.MeshBasicMaterial({ color: 0x14101f, depthTest: false, transparent: true, opacity: 0.85 }), N);
    this.hpFg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), N);
    this.hpBg.renderOrder = 10; this.hpFg.renderOrder = 11;
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.5 }), N);
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }), N);
    for (const m of [this.hpBg, this.hpFg, this.blobs, this.rings]) { m.count = 0; m.frustumCulled = false; s.add(m); }
    this.hpFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);

    // particles
    const P = quality === 'battery' ? 250 : 800;
    this.pPos = new Float32Array(P * 3); this.pVel = new Float32Array(P * 3); this.pLife = new Float32Array(P); this.pCol = new Float32Array(P * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.34, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.particles.frustumCulled = false;
    s.add(this.particles);

    // cell highlight
    this.cellHi = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }), GRID.cols * GRID.rows);
    this.cellHi.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRID.cols * GRID.rows * 3), 3);
    this.cellHi.visible = false; this.cellHi.frustumCulled = false;
    s.add(this.cellHi);

    const ringMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48).rotateX(-Math.PI / 2), ringMat(0xffffff, 0.55));
    this.auraRing = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), ringMat(0x9fffd0, 0.14));
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 28).rotateX(-Math.PI / 2), ringMat(0xffffff, 0.95));
    for (const m of [this.rangeRing, this.auraRing, this.selRing]) { m.visible = false; m.position.y = GROUND_Y + 0.03; s.add(m); }

    // FX pools: glowing projectiles with stretched trails
    const projGeo = new THREE.OctahedronGeometry(0.13, 0);
    const trailGeo = new THREE.CylinderGeometry(0.0, 0.07, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const tr = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = tr.visible = false; s.add(m, tr);
      this.projs.push({ mesh: m, trail: tr, from: new THREE.Vector3(), to: new THREE.Vector3(), toId: 0, t: 0, dur: 0.2, active: false });
    }
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; m.position.y = GROUND_Y + 0.1; s.add(m);
      this.ringFx.push({ mesh: m, t: 0, dur: 0.4, r: 1, active: false });
    }
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
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

  /** Build the floating-island arenas (one per team) + grid overlays. */
  buildArenas(n: number) {
    this.arenas = n;
    this.env = buildEnvironment(this.scene, n, this.quality, arenaZ, SLOT_COLORS);
    for (let a = 0; a < n; a++) {
      const z0 = arenaZ(a);
      for (let slot = 0; slot < 2; slot++) {
        const col = a > 0 ? 0xff4a6a : SLOT_COLORS[slot];
        const c0 = cellCenter(slot, 0, 0), c1 = cellCenter(slot, GRID.cols - 1, GRID.rows - 1);
        const area = new THREE.Mesh(new THREE.PlaneGeometry(GRID.cols, GRID.rows).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, depthWrite: false }));
        area.position.set((c0.x + c1.x) / 2, GROUND_Y + 0.01, z0);
        this.scene.add(area);
        const pts: number[] = [];
        const xs = [Math.min(c0.x, c1.x) - 0.5, Math.max(c0.x, c1.x) + 0.5];
        const y = GROUND_Y + 0.02;
        for (let r = 0; r <= GRID.rows; r++) { const z = z0 - GRID.rows / 2 + r; pts.push(xs[0], y, z, xs[1], y, z); }
        for (let c = 0; c <= GRID.cols; c++) { const x = xs[0] + c; pts.push(x, y, z0 - GRID.rows / 2, x, y, z0 + GRID.rows / 2); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
        this.scene.add(lines);
        this.gridLines.push(lines);
      }
      const glyph = new THREE.Mesh(new THREE.RingGeometry(CORE.range - 0.12, CORE.range, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: a > 0 ? 0xff4a6a : 0x5ad8ff, transparent: true, opacity: 0.3, depthWrite: false }));
      glyph.position.set(0, GROUND_Y + 0.015, z0);
      this.scene.add(glyph);
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
    const span = aspect > 1.3 ? 21 : 15;
    this.dist = THREE.MathUtils.clamp(span / tanH, 14, 70);
    this.target.set(slot === 0 ? -19.5 : 19.5, 0, arenaZ(arena) + 2.2);
  }

  pan(dxPx: number, dyPx: number) {
    const h = this.renderer.domElement.clientHeight || 1;
    const k = (this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 2) / h;
    this.target.x -= dxPx * k;
    this.target.z -= dyPx * k / Math.sin(this.pitch);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -40, 40);
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
    return this.ray.ray.intersectPlane(this.ground, out) ? out : null;
  }

  static cellAt(slot: number, team: number, x: number, z: number) {
    const lz = z - arenaZ(team);
    const col = slot === 0 ? Math.floor(x + LANE.gridFrontX) : Math.floor(LANE.gridFrontX - x);
    const row = Math.floor(lz + GRID.rows / 2);
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
    return { col, row };
  }

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

  private newRig(defId: string, material: THREE.Material = this.mat) {
    const def = defOf(defId);
    const rig = new Rig(defId, def.model, material, this.quality === 'high');
    this.scene.add(rig.root);
    return rig;
  }

  // ---------------------------------------------------------------- per-frame

  frame(dt: number, view: ViewState, opts: { localPid: number; ghost: DragGhost | null; selected: { pid: number; bid: number } | null; showGrid: boolean; events: GameEvent[] }) {
    this.time += dt;
    const meta = view.meta;
    this.env?.update(dt, this.time);
    if (!meta) { this.renderer.render(this.scene, this.camera); return; }
    const combat = meta.phase === 'combat';

    // ---------- builds (idle characters on their cells, outside combat) ----------
    const seenB = new Set<string>();
    if (!combat) {
      for (const p of meta.players) {
        for (const b of p.builds) {
          const key = `${p.pid}:${b.bid}`;
          seenB.add(key);
          let rig = this.builds.get(key);
          if (!rig || rig.root.userData.defId !== b.defId) {
            if (rig) this.scene.remove(rig.root);
            rig = this.newRig(b.defId);
            rig.root.userData.defId = b.defId;
            rig.root.userData.born = this.time;
            this.builds.set(key, rig);
          }
          const c = cellCenter(p.slot, b.col, b.row);
          rig.root.position.set(c.x, GROUND_Y, c.z + arenaZ(p.team));
          rig.root.rotation.y = p.slot === 0 ? -Math.PI / 2 : Math.PI / 2; // face the portal
          const age = this.time - rig.root.userData.born;
          const pop = age < 0.35 ? 0.6 + 0.4 * easeOutBack(age / 0.35) : 1;
          rig.root.scale.setScalar(rig.scale * pop);
          rig.update(dt, false);
        }
      }
    }
    for (const [k, rig] of this.builds) if (!seenB.has(k)) { this.scene.remove(rig.root); this.builds.delete(k); }

    // ---------- combat entities ----------
    const list = combat ? view.sample() : [];
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let v = this.ents.get(e.id);
      const wx = e.x, wz = e.z + arenaZ(e.arena);
      if (!v) {
        const rig = this.newRig(e.defId);
        const enemy = !!(e.flags & F_ENEMY);
        v = { rig, defId: e.defId, x: wx, z: wz, face: enemy ? (e.x < 0 ? Math.PI / 2 : -Math.PI / 2) : (e.x < 0 ? -Math.PI / 2 : Math.PI / 2), lunge: 0, lungeX: 0, lungeZ: 0, flash: 0 };
        this.ents.set(e.id, v);
      }
      const dx = wx - v.x, dz = wz - v.z;
      const moving = Math.hypot(dx, dz) > 0.004;
      v.x = wx; v.z = wz;
      if (moving) v.face = lerpAngle(v.face, Math.atan2(dx, dz), 0.25);
      v.lunge = Math.max(0, v.lunge - dt * 6);
      v.flash = Math.max(0, v.flash - dt);
      const lk = Math.sin(v.lunge * Math.PI) * 0.3;
      const rig = v.rig;
      rig.root.position.set(v.x + v.lungeX * lk, GROUND_Y, v.z + v.lungeZ * lk);
      rig.root.rotation.y = v.face;
      rig.setMaterial(v.flash > 0 ? this.flashMat : this.mat);
      rig.update(dt, moving);
    }
    for (const [id, v] of this.ents) {
      if (!seen.has(id)) {
        this.ents.delete(id);
        if (combat) this.dying.push({ rig: v.rig, t: 0 });
        else this.scene.remove(v.rig.root);
      }
    }
    // death animation: topple, sink and shrink
    this.dying = this.dying.filter(d => {
      d.t += dt;
      const k = d.t / 0.45;
      if (k >= 1 || !combat) { this.scene.remove(d.rig.root); return false; }
      d.rig.root.rotation.x = -k * 1.2;
      d.rig.root.position.y = GROUND_Y - k * 0.6;
      d.rig.root.scale.setScalar(d.rig.scale * (1 - k * 0.6));
      return true;
    });

    // ---------- events → FX ----------
    for (const ev of opts.events) this.onEvent(ev, view);

    // ---------- HP bars / blobs / rings ----------
    const m4 = new THREE.Matrix4();
    const q = this.camera.quaternion;
    const qI = new THREE.Quaternion();
    let nb = 0, nr = 0;
    const col = new THREE.Color();
    const place = (x: number, z: number, scale: number, top: number, color: number, hp: number, showHp: boolean, boss: boolean, shield: boolean, slow: boolean) => {
      if (nr >= 400) return;
      m4.compose(new THREE.Vector3(x, GROUND_Y + 0.02, z), qI, new THREE.Vector3(scale * 1.7, 1, scale * 1.7));
      this.blobs.setMatrixAt(nr, m4);
      m4.compose(new THREE.Vector3(x, GROUND_Y + 0.04, z), qI, new THREE.Vector3(scale * 1.25, 1, scale * 1.25));
      this.rings.setMatrixAt(nr, m4);
      this.rings.setColorAt(nr, col.setHex(slow ? 0x7ff6ff : color));
      nr++;
      if (showHp && nb < 400) {
        const w = boss ? 2.8 : 0.95 * Math.max(0.85, scale * 0.8);
        const y = top + (boss ? 0.6 : 0.35);
        m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w + 0.08, 1, 1));
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
        const boss = enemy && !!ENEMIES[e.defId].boss;
        const owner = meta.players[e.owner];
        const color = enemy ? ENEMY_RING : SLOT_COLORS[owner?.slot ?? 0];
        const p = v.rig.root.position;
        place(p.x, p.z, v.rig.scale * 0.55, p.y + v.rig.height, color, e.hp, e.hp < 0.999 || boss || !!(e.flags & F_SHIELD), boss, !!(e.flags & F_SHIELD), !!(e.flags & F_SLOW));
      }
    } else {
      for (const p of meta.players) for (const b of p.builds) {
        const rig = this.builds.get(`${p.pid}:${b.bid}`);
        if (rig) place(rig.root.position.x, rig.root.position.z, rig.scale * 0.55, 0, p.team > 0 ? ENEMY_RING : SLOT_COLORS[p.slot], 1, false, false, false, false);
      }
    }
    this.blobs.count = nr; this.rings.count = nr; this.hpBg.count = nb; this.hpFg.count = nb;
    for (const m of [this.blobs, this.rings, this.hpBg, this.hpFg]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // ---------- grid, ghost, selection ----------
    const gridOpacity = opts.showGrid && !combat ? 0.38 : 0.05;
    for (const g of this.gridLines) { const mt = g.material as THREE.LineBasicMaterial; mt.opacity += (gridOpacity - mt.opacity) * 0.15; }
    this.updateGhost(meta, opts.ghost, opts.localPid, dt);
    this.updateSelection(meta, opts.selected, combat);

    // ---------- FX ----------
    this.updateFx(dt);

    // ---------- Core health look ----------
    this.env?.coreCrystals.forEach((c, i) => {
      const t = meta.teams[i];
      const k = t ? t.hp / t.maxHp : 1;
      c.rotation.y += dt * (0.6 + (1 - k) * 2);
      const mat = c.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.45 + 0.9 * k + (k < 0.3 ? Math.abs(Math.sin(this.time * 6)) * 0.9 : 0);
      const l = this.env!.coreLights[i];
      if (l) l.intensity = 20 + 25 * k + (k < 0.3 ? Math.abs(Math.sin(this.time * 6)) * 20 : 0);
    });

    // ---------- camera ----------
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.6;
    const off = new THREE.Vector3(0, Math.sin(this.pitch), Math.cos(this.pitch)).multiplyScalar(this.dist);
    this.camera.position.copy(this.target).add(off).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    this.camera.lookAt(this.target);

    this.renderer.render(this.scene, this.camera);
  }

  private updateGhost(meta: MetaView, ghost: DragGhost | null, localPid: number, dt: number) {
    if (!ghost) {
      if (this.ghost) this.ghost.root.visible = false;
      this.cellHi.visible = false; this.rangeRing.visible = false; this.auraRing.visible = false;
      return;
    }
    const def = UNITS[ghost.defId];
    if (this.ghostKey !== ghost.defId) {
      if (this.ghost) this.scene.remove(this.ghost.root);
      this.ghost = this.newRig(ghost.defId, this.ghostMat);
      this.ghostKey = ghost.defId;
    }
    const c = cellCenter(ghost.slot, ghost.col, ghost.row);
    const z = c.z + arenaZ(ghost.team);
    const g = this.ghost!;
    g.root.visible = true;
    g.root.position.set(c.x, GROUND_Y + 0.05 + Math.sin(this.time * 6) * 0.05, z);
    g.root.rotation.y = ghost.slot === 0 ? -Math.PI / 2 : Math.PI / 2;
    g.update(dt, false);
    const p = meta.players[localPid];
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    let i = 0;
    for (let cc = 0; cc < GRID.cols; cc++) for (let r = 0; r < GRID.rows; r++) {
      const cp = cellCenter(p.slot, cc, r);
      m4.makeTranslation(cp.x, GROUND_Y + 0.025, cp.z + arenaZ(p.team));
      this.cellHi.setMatrixAt(i, m4);
      const occ = p.builds.some(b => b.col === cc && b.row === r);
      this.cellHi.setColorAt(i, col.setHex(cc === ghost.col && r === ghost.row ? (ghost.valid ? 0xffffff : 0xff3a3a) : occ ? 0xff5a5a : 0x5aff9a));
      i++;
    }
    this.cellHi.count = i;
    this.cellHi.instanceMatrix.needsUpdate = true; this.cellHi.instanceColor!.needsUpdate = true;
    this.cellHi.visible = true;
    this.rangeRing.visible = true;
    this.rangeRing.position.set(c.x, GROUND_Y + 0.03, z);
    this.rangeRing.scale.setScalar(Math.max(1.2, def.range + 0.4));
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(ghost.valid ? 0xffffff : 0xff5a5a);
    const aura = def.abilities.find(a => a.kind === 'auraAttackSpeed' || a.kind === 'taunt' || a.kind === 'slowPulse' || a.kind === 'splash') as { radius: number; kind: string } | undefined;
    if (aura) {
      this.auraRing.visible = true;
      this.auraRing.position.set(c.x, GROUND_Y + 0.028, z);
      this.auraRing.scale.setScalar(aura.radius);
      (this.auraRing.material as THREE.MeshBasicMaterial).color.setHex(aura.kind === 'taunt' ? 0xffb04a : aura.kind === 'slowPulse' ? 0x7ff6ff : aura.kind === 'splash' ? 0xff8a3a : 0x9fffd0);
    } else this.auraRing.visible = false;
  }

  private updateSelection(meta: MetaView, sel: { pid: number; bid: number } | null, combat: boolean) {
    if (!sel || combat) { this.selRing.visible = false; return; }
    const p = meta.players[sel.pid];
    const b = p?.builds.find(x => x.bid === sel.bid);
    if (!b) { this.selRing.visible = false; return; }
    const c = cellCenter(p.slot, b.col, b.row);
    this.selRing.visible = true;
    this.selRing.position.set(c.x, GROUND_Y + 0.05, c.z + arenaZ(p.team));
    this.selRing.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
    if (!this.ghost?.root.visible) {
      const def = UNITS[b.defId];
      this.rangeRing.visible = true;
      this.rangeRing.position.copy(this.selRing.position);
      this.rangeRing.scale.setScalar(Math.max(1.2, def.range + 0.4));
      (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    }
  }

  // ---------------------------------------------------------------- FX

  /** Chest-height position of an entity (for projectile origins/targets). */
  private posOf(id: number, view: ViewState, h = 0.6): THREE.Vector3 | null {
    const v = this.ents.get(id);
    if (v) return v.rig.root.position.clone().setY(GROUND_Y + v.rig.height * h);
    const e = view.latest(id);
    return e ? new THREE.Vector3(e.x, GROUND_Y + 0.8, e.z + arenaZ(e.arena)) : null;
  }

  private onEvent(ev: GameEvent, view: ViewState) {
    switch (ev.t) {
      case 'atk': {
        const va = this.ents.get(ev.a);
        va?.rig.strike();
        const a = this.posOf(ev.a, view, 0.7), b = this.posOf(ev.b, view, 0.5);
        if (!a || !b) return;
        if (va) va.face = Math.atan2(b.x - a.x, b.z - a.z); // turn toward the target
        if (ev.fx === 'lightning') { this.bolt(a, b); this.hitFlash(ev.b); return; }
        if (ev.ranged) setTimeout(() => this.projectile(a, b, ev.b, FX_COLORS[ev.fx] ?? 0xffffff), 120);
        else {
          if (va) { va.lunge = 1; const d = b.clone().sub(a).setY(0).normalize(); va.lungeX = d.x; va.lungeZ = d.z; }
          setTimeout(() => { this.burst(b.x, b.y, b.z, FX_COLORS[ev.fx] ?? 0xffffff, 5, 2.2); this.hitFlash(ev.b); }, 110);
        }
        break;
      }
      case 'coreShot': {
        const b = this.posOf(ev.b, view, 0.5);
        if (b) this.bolt(new THREE.Vector3(0, 3.8, arenaZ(ev.team)), b, 0x7fd8ff);
        break;
      }
      case 'die': {
        const z = ev.z + arenaZ(ev.arena);
        this.burst(ev.x, 0.9, z, ev.boss ? 0xffd04a : 0xff6a8a, ev.boss ? 90 : 14, ev.boss ? 8 : 3);
        if (ev.boss) { this.ring(ev.x, z, 7, 0xffd04a, 0.9); this.shake = 1; }
        break;
      }
      case 'pulse': this.ring(ev.x, ev.z + arenaZ(ev.arena), ev.r, FX_COLORS[ev.fx] ?? 0xffffff, 0.45); this.burst(ev.x, 0.6, ev.z + arenaZ(ev.arena), FX_COLORS[ev.fx] ?? 0xffffff, 8, 3); break;
      case 'heal': { const p = this.posOf(ev.id, view, 0.9); if (p) this.burst(p.x, p.y, p.z, 0x8aff9a, 6, 1.2); break; }
      case 'dash': { const p = this.posOf(ev.id, view, 0.5); if (p) this.burst(p.x, p.y, p.z, 0xd06aff, 16, 3); break; }
      case 'coreHit': {
        this.ring(0, arenaZ(ev.team), 3.5, 0xff3a3a, 0.5);
        this.burst(0, 3.8, arenaZ(ev.team), 0xff5a5a, 20, 5);
        if (ev.team === 0) this.shake = Math.min(1, this.shake + 0.45);
        break;
      }
      case 'evolve': case 'build': {
        const key = `${ev.pid}:${ev.bid}`;
        setTimeout(() => {
          const rig = this.builds.get(key);
          if (!rig) return;
          const p = rig.root.position;
          this.ring(p.x, p.z, ev.t === 'evolve' ? 2.4 : 1.3, ev.t === 'evolve' ? 0xffe08a : 0xaef0ff, 0.5);
          this.burst(p.x, 1, p.z, ev.t === 'evolve' ? 0xffe08a : 0xaef0ff, ev.t === 'evolve' ? 44 : 12, 3);
          if (ev.t === 'evolve') for (let i = 0; i < 12; i++) this.burst(p.x, 0.3 + i * 0.25, p.z, 0xfff0b0, 2, 0.6);
          rig.root.userData.born = this.time - 0.05;
        }, 30);
        break;
      }
    }
  }

  private hitFlash(id: number) { const v = this.ents.get(id); if (v) v.flash = 0.08; }

  private projectile(a: THREE.Vector3, b: THREE.Vector3, toId: number, color: number) {
    const p = this.projs.find(x => !x.active);
    if (!p) return;
    p.active = true; p.t = 0; p.from.copy(a); p.to.copy(b); p.toId = toId;
    p.dur = Math.min(0.35, 0.08 + a.distanceTo(b) * 0.04);
    (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (p.trail.material as THREE.MeshBasicMaterial).color.setHex(color);
    p.mesh.visible = p.trail.visible = true;
  }

  private bolt(a: THREE.Vector3, b: THREE.Vector3, color = 0x9ffcff) {
    const bo = this.bolts.find(x => !x.active);
    if (!bo) return;
    bo.active = true; bo.t = 0.16;
    const pos = bo.line.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 8; i++) {
      const k = i / 7, j = i && i < 7 ? 1 : 0;
      pos.setXYZ(i, a.x + (b.x - a.x) * k + (Math.random() - 0.5) * 0.6 * j, a.y + (b.y - a.y) * k + (Math.random() - 0.3) * 0.5 * j, a.z + (b.z - a.z) * k + (Math.random() - 0.5) * 0.6 * j);
    }
    pos.needsUpdate = true;
    (bo.line.material as THREE.LineBasicMaterial).color.setHex(color);
    bo.line.visible = true;
    this.burst(b.x, b.y, b.z, color, 4, 2);
  }

  ring(x: number, z: number, r: number, color: number, dur: number) {
    const f = this.ringFx.find(x => !x.active);
    if (!f) return;
    f.active = true; f.t = 0; f.dur = dur; f.r = r;
    f.mesh.position.set(x, GROUND_Y + 0.1, z);
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
      this.pLife[k] = 0.4 + Math.random() * 0.45;
      this.pCol[k * 3] = c.r; this.pCol[k * 3 + 1] = c.g; this.pCol[k * 3 + 2] = c.b;
    }
  }

  private updateFx(dt: number) {
    const dir = new THREE.Vector3();
    for (const p of this.projs) {
      if (!p.active) continue;
      p.t += dt;
      const tgt = this.ents.get(p.toId);
      if (tgt) p.to.copy(tgt.rig.root.position).setY(GROUND_Y + tgt.rig.height * 0.5);
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 0.7;
      p.mesh.rotation.y += dt * 14;
      dir.subVectors(p.to, p.from).normalize();
      p.trail.position.copy(p.mesh.position);
      p.trail.lookAt(p.mesh.position.clone().add(dir));
      p.trail.scale.set(1, 1, 0.4 + Math.min(1.2, p.from.distanceTo(p.to) * 0.12));
      if (k >= 1) {
        p.active = false; p.mesh.visible = p.trail.visible = false;
        this.burst(p.to.x, p.to.y, p.to.z, (p.mesh.material as THREE.MeshBasicMaterial).color.getHex(), 4, 1.6);
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
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.t / 0.16);
      if (b.t <= 0) { b.active = false; b.line.visible = false; }
    }
    const P = this.pLife.length;
    for (let k = 0; k < P; k++) {
      if (this.pLife[k] <= 0) { this.pPos[k * 3 + 1] = -500; continue; }
      this.pLife[k] -= dt;
      this.pVel[k * 3 + 1] -= 6 * dt;
      this.pPos[k * 3] += this.pVel[k * 3] * dt;
      this.pPos[k * 3 + 1] = Math.max(GROUND_Y + 0.05, this.pPos[k * 3 + 1] + this.pVel[k * 3 + 1] * dt);
      this.pPos[k * 3 + 2] += this.pVel[k * 3 + 2] * dt;
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() { this.renderer.dispose(); }
}

function easeOutBack(x: number) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
function easeOutCubic(x: number) { return 1 - Math.pow(1 - x, 3); }
function lerpAngle(a: number, b: number, t: number) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
