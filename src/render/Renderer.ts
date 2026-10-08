// Renderer3D — Three.js scene. Reads ViewState (meta + interpolated entities + events); never touches the sim.
// Characters and towers are instanced (Batcher), projectiles/particles are pooled (Fx), the world is merged (environment).
import * as THREE from 'three';
import { UNITS, unitStats } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, GRID } from '../data/economy';
import { RUNES } from '../data/synergies';
import { LANE, cellCenter } from '../sim/state';
import type { GameEvent } from '../sim/state';
import type { Branch, FactionId } from '../data/types';
import { litMaterial, buildEnvMap, createLook, Look, PerfOverlay, sharedEnvMap, setMaterialTier } from './look';
import { DEBUG } from '../config';
import { FrameGovernor } from './governor';
import { Batcher, Rig } from './characters';
import { TowerRig } from './towers';
import { Fx, ProjKind } from './fx';
import { DamageNumbers } from './numbers';
import { buildEnvironment, Env } from './environment';
import { FACTION_LOOK } from './terrain';
import { runeCircleTexture } from './textures';
import { glowTexture, starTexture } from './textures';
import { EntView, F_BURN, F_ELITE, F_ENEMY, F_HASTE, F_POISON, F_SHIELD, F_SLOW, F_STEALTH, F_STUN, F_MARK, F_WET, F_FOCUS, F_RIFT, F_GHOST, F_TASK, F_RALLY, F_BREACH, MetaView, ViewState } from '../net/snapshot';
import { ALL_DUO_ABILITIES } from '../data/resonance';
import { MODULES, FAMILY_COLORS, ModuleId } from '../data/modules';
import { save } from '../save/SaveSystem';

export type Quality = 'ultra' | 'high' | 'medium' | 'battery';
export const ARENA_GAP = 34;
const arenaZ = (a: number) => a * ARENA_GAP;
const GROUND_Y = 0.2;
const GARRISON_SCALE = 0.72;

const FX_COLORS: Record<string, number> = {
  spark: 0xffd27a, leaf: 0x9aff7a, star: 0xbfe0ff, water: 0x7ff6ff, fire: 0xff8a3a, note: 0xfff6c0, poison: 0x9aff4a, shell: 0xffb060,
  shadow: 0xd06aff, lightning: 0x9ffcff, enemy: 0xff4a6a, core: 0x7fd8ff, shield: 0x9fe8ff, enemyShield: 0xff9a6a, haste: 0xffe060, stun: 0xfff07a,
  missile: 0xff7a3a, starfall: 0xbfe0ff, beam: 0xbff8ff, chain: 0xffd27a,
};
export const SLOT_COLORS = [0x4aa8ff, 0xffa23a];
const ENEMY_RING = 0xff3a5a;

/** Projectile used by each ranged shooter. */
const PROJ: Record<string, ProjKind> = {
  tireuse_etoile: 'arrow', rodeuse: 'arrow', archere_cendres: 'arrow', harponneuse: 'spear', lanciere_eclair: 'spear', arbaletriere: 'bolt',
  bombardiere: 'cannonball', oracle_braise: 'fireball', elementaire: 'fireball', astromancienne: 'ice', semeuse: 'glob', pestifere: 'glob',
  invocatrice: 'orb', harmoniste: 'orb', vestale: 'orb', pretresse: 'orb', druidesse: 'orb', mecanicienne: 'bolt', tourelle: 'bolt',
  tireur: 'bolt', mage_fele: 'orb', chaman: 'orb', reine_essaim: 'glob', ingenieur_fele: 'bolt', kraken: 'orb', tentacule: 'orb',
};
const LIGHTNING = new Set(['exarque_prisme', 'meduse', 'lanciere_eclair']);

interface EntVis {
  rig: Rig;
  defId: string; level: number; branch: Branch | null; phase: number;
  x: number; z: number;
  face: number;
  lunge: number; lungeX: number; lungeZ: number;
  flash: number;
  enemy: boolean;
  tower: TowerRig | null;
  fxT: number;
  speed: number;
}
interface Dying { rig: Rig; t: number; kind: 'fall' | 'shatter' | 'boss'; face: number; tint: THREE.Color }
interface BuildVis { rig: Rig; tower: TowerRig | null; key: string; born: number; cheer: number }

export interface DragGhost { defId: string; col: number; row: number; valid: boolean; slot: number; team: number; level?: number; branch?: Branch | null; faction?: FactionId; links?: { col: number; row: number }[] }

function defOf(id: string) { return UNITS[id] ?? ENEMIES[id]; }

/** Height of the Bastion's reactor crystal (bolts, hits and the destruction sequence aim at it). */
const CORE_Y = 6.2;

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  quality: Quality;
  private mat = litMaterial({ rim: 0.5, reflect: true }); // stronger cold rim: units read against the dark flagstones
  // emissive parts are rendered in HDR (> 1) so the bloom makes crystals, runes and magic glow
  private glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.55, 1.55, 1.55) });
  private ghostMat = litMaterial({ transparent: true, opacity: 0.55, reflect: true });
  private ghostGlow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, color: new THREE.Color(1.8, 1.8, 1.8) });
  look: Look;
  private perf: PerfOverlay | null = null;
  private batch: Batcher;
  fx: Fx;
  private numbers: DamageNumbers;
  private ents = new Map<number, EntVis>();
  private dying: Dying[] = [];
  private builds = new Map<string, BuildVis>();
  private hpBg: THREE.InstancedMesh;
  private hpFg: THREE.InstancedMesh;
  private blobs: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private stars: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private pads: THREE.InstancedMesh;
  private env: Env | null = null;
  private gridLines: THREE.LineSegments[] = [];
  private zoneMeshes: THREE.Mesh[] = [];
  private runeMesh: THREE.InstancedMesh;
  private cellHi: THREE.InstancedMesh;
  private links: THREE.LineSegments;
  private ghostGroup = new THREE.Group();
  private ghostKey = '';
  private ghostRig: Rig | null = null;
  private ghostTower: TowerRig | null = null;
  private rangeRing: THREE.Mesh;
  private auraRing: THREE.Mesh;
  private selRing: THREE.Mesh;
  private time = 0;
  private tint = new THREE.Color();
  shake = 0;
  target = new THREE.Vector3(-16, 0, 1.2);
  dist = 26;
  yaw = 0;
  private pitch = THREE.MathUtils.degToRad(46); // a bit lower than v0.4: more depth, still a clear tactical view
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
  arenas = 1;
  localTeam = 0;
  private coreFx = [0, 0];
  private lastPhase = '';
  private portraitCache = new Map<string, string>();
  // v0.4
  private decals: { mesh: THREE.Mesh; fill: THREE.Mesh; t: number; dur: number; id: number; hold: number; active: boolean }[] = [];
  private chevrons: THREE.InstancedMesh;
  private hazardMesh: THREE.InstancedMesh;
  private resoStars: { group: THREE.Group; core: THREE.Mesh; halo: THREE.Sprite; k: number }[] = [];
  private hitStop = 0;
  private zoomPulse = 0;
  private shaftTmp = new THREE.Vector3();
  // Résonance DUO cinematic: faction colours converge on the reactor during the channel, the grade warms toward the
  // ability colour, then a flash + an expanding rune glyph on impact
  private resoCh: ({ t: number; c: [number, number]; color: number; emit: number } | null)[] = [];
  private gradeFlash = 0;
  private gradeFlashC = new THREE.Color();
  private gradeTint = new THREE.Color(1, 1, 1);
  private glyphs: { m: THREE.Mesh; t: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    // material tier first (BAS = Lambert), then the shared unit materials
    setMaterialTier(quality);
    this.mat = litMaterial({ rim: 0.5, reflect: true });
    this.ghostMat = litMaterial({ transparent: true, opacity: 0.55, reflect: true });
    // no native MSAA: ÉLEVÉ / MOYEN render through the post chain (FXAA in the final pass), BAS stays raw for speed
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.applyQuality();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 1200);
    if (quality === 'high' || quality === 'ultra') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    // dynamic resolution on ÉLEVÉ / ULTRA: holds the refresh rate of the screen (144 Hz on a gaming monitor)
    if ((quality === 'high' || quality === 'ultra') && save.prefs.dynRes !== false) this.gov = new FrameGovernor(quality === 'ultra' ? 0.6 : 0.7, 1);
    const s = this.scene;
    this.look = createLook(this.renderer, s, this.camera, quality);
    buildEnvMap(this.renderer); // reflections only on the materials that ask for them (see look.ts)
    this.renderer.info.autoReset = false;
    if (DEBUG) this.perf = new PerfOverlay();
    this.batch = new Batcher(s, this.mat, this.glowMat, quality === 'high' || quality === 'ultra');
    this.fx = new Fx(s, this.camera, quality);
    this.numbers = new DamageNumbers();

    // HP bars, blob shadows, team rings, stun stars, shield bubbles, build pads (instanced)
    const N = 500;
    this.hpBg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.16), new THREE.MeshBasicMaterial({ color: 0x14101f, depthTest: false, transparent: true, opacity: 0.85 }), N);
    this.hpFg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.11), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }), N);
    this.hpBg.renderOrder = 10; this.hpFg.renderOrder = 11;
    this.hpBg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.45 }), N);
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }), N);
    this.stars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: starTexture(), color: 0xffe060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), N);
    this.bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending }), 120);
    const padGeo = new THREE.RingGeometry(0.34, 0.47, 10).rotateX(-Math.PI / 2);
    this.pads = new THREE.InstancedMesh(padGeo, new THREE.MeshBasicMaterial({ color: 0x5a4632, transparent: true, opacity: 0.55, depthWrite: false }), 200);
    this.pads.receiveShadow = quality === 'high' || quality === 'ultra';
    for (const m of [this.hpBg, this.hpFg, this.blobs, this.rings, this.stars, this.bubbles, this.pads]) { m.count = 0; m.frustumCulled = false; s.add(m); }
    this.hpFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.stars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);

    // placement helpers
    this.cellHi = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }), GRID.cols * GRID.rows);
    this.cellHi.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRID.cols * GRID.rows * 3), 3);
    this.cellHi.visible = false; this.cellHi.frustumCulled = false;
    s.add(this.cellHi);
    this.runeMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.22, 0.42, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 32);
    this.runeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3);
    this.runeMesh.count = 0; this.runeMesh.frustumCulled = false;
    s.add(this.runeMesh);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    this.links = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.95 }));
    this.links.frustumCulled = false; this.links.visible = false;
    s.add(this.links);
    const ringMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), ringMat(0xffffff, 0.6));
    this.auraRing = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), ringMat(0x9fffd0, 0.14));
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28).rotateX(-Math.PI / 2), ringMat(0xffffff, 0.95));
    for (const m of [this.rangeRing, this.auraRing, this.selRing]) { m.visible = false; m.position.y = GROUND_Y + 0.03; s.add(m); }
    s.add(this.ghostGroup);
    // telegraphed boss attacks / rally zones: ground decals (outline + filling disc), pooled
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = fill.visible = false; mesh.renderOrder = fill.renderOrder = 5;
      s.add(mesh, fill);
      this.decals.push({ mesh, fill, t: 0, dur: 1, id: -1, hold: 0, active: false });
    }
    // enemy direction chevrons along the lanes
    const chev = new THREE.ConeGeometry(0.42, 0.8, 3).rotateX(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.12, 1);
    this.chevrons = new THREE.InstancedMesh(chev, new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }), 120);
    this.chevrons.renderOrder = 6;
    this.chevrons.frustumCulled = false; this.chevrons.count = 0; s.add(this.chevrons);
    // dangerous cells (Rune instable anomaly)
    this.hazardMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a6a, transparent: true, opacity: 0.38, depthWrite: false }), 16);
    this.hazardMesh.frustumCulled = false; this.hazardMesh.count = 0; s.add(this.hazardMesh);
    // v0.7: auras under the elite units (level 4+): a rune ring in the army colour, HDR so the bloom catches it
    this.auras = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeCircleTexture(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }), 200);
    this.auras.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(200 * 3), 3);
    this.auras.renderOrder = 4; this.auras.frustumCulled = false; this.auras.count = 0; s.add(this.auras);
  }
  private auras: THREE.InstancedMesh;

  applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.quality === 'ultra' || this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(dpr, cap) * (this.gov?.scale ?? 1));
  }
  /** dynamic resolution (null on MOYEN / BAS or when turned off in the options) */
  gov: FrameGovernor | null = null;
  private vw = 1280;
  private vh = 720;

  /** Build the floating-island arenas (one per team) + grid overlays. */
  buildArenas(n: number) {
    this.arenas = n;
    this.env = buildEnvironment(this.scene, n, this.quality, arenaZ, SLOT_COLORS);
    for (let a = 0; a < n; a++) {
      const z0 = arenaZ(a);
      for (let slot = 0; slot < 2; slot++) {
        const col = a > 0 ? 0xff4a6a : SLOT_COLORS[slot];
        const c0 = cellCenter(slot, 0, 0), c1 = cellCenter(slot, GRID.cols - 1, GRID.rows - 1);
        const pts: number[] = [];
        const xs = [Math.min(c0.x, c1.x) - 0.5, Math.max(c0.x, c1.x) + 0.5];
        const y = GROUND_Y + 0.02;
        for (let r = 0; r <= GRID.rows; r++) { const z = z0 - GRID.rows / 2 + r; pts.push(xs[0], y, z, xs[1], y, z); }
        for (let c = 0; c <= GRID.cols; c++) { const x = xs[0] + c; pts.push(x, y, z0 - GRID.rows / 2, x, y, z0 + GRID.rows / 2); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: this.quality === 'battery' ? 0.6 : 0.35 })); // BAS: no bloom / AA, thicker read
        this.scene.add(lines);
        this.gridLines.push(lines);
        // placement zones: front line (warm) and back line (cool), visible while building
        for (const [cFrom, cTo, zc] of [[0, 3, 0xff8a5a], [8, 11, 0x6ab8ff]] as [number, number, number][]) {
          const a0 = cellCenter(slot, cFrom, 3), a1 = cellCenter(slot, cTo, 3);
          const zm = new THREE.Mesh(new THREE.PlaneGeometry(cTo - cFrom + 1, GRID.rows).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: zc, transparent: true, opacity: 0.0, depthWrite: false }));
          zm.position.set((a0.x + a1.x) / 2, GROUND_Y + 0.012, z0);
          this.scene.add(zm);
          this.zoneMeshes.push(zm);
        }
      }
      const glyph = new THREE.Mesh(new THREE.RingGeometry(CORE.range - 0.12, CORE.range, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: a > 0 ? 0xff4a6a : 0x5ad8ff, transparent: true, opacity: 0.22, depthWrite: false }));
      glyph.position.set(0, GROUND_Y + 0.015, z0);
      this.scene.add(glyph);
      // Résonance DUO: a star forms above the Bastion during the channel
      const group = new THREE.Group();
      group.position.set(0, 9, z0);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xc8a0ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(6);
      group.add(core, halo);
      group.visible = false;
      this.scene.add(group);
      this.resoStars.push({ group, core, halo, k: 0 });
    }
  }

  resize(w: number, h: number) {
    this.vw = w; this.vh = h;
    this.renderer.setSize(w, h, false);
    this.look.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  /** Fit the camera on a lane of the given arena/slot. */
  focus(slot: number, arena = 0) {
    const aspect = this.camera.aspect || 1.8;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect;
    const h = this.renderer.domElement.clientHeight || 720;
    const span = h < 500 ? 13.5 : aspect > 1.3 ? 19 : 14; // phones: a bit closer so units read well
    this.dist = THREE.MathUtils.clamp(span / tanH, 13, 70);
    this.target.set(slot === 0 ? -20 : 20, 0, arenaZ(arena) + 1.6);
    this.yaw = 0;
  }

  pan(dxPx: number, dyPx: number) {
    const h = this.renderer.domElement.clientHeight || 1;
    const k = (this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 2) / h;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const dx = -dxPx * k, dz = -dyPx * k / Math.sin(this.pitch);
    this.target.x += dx * c + dz * s;
    this.target.z += -dx * s + dz * c;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -42, 42);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -8, arenaZ(this.arenas - 1) + 8);
  }
  zoom(f: number) { this.dist = THREE.MathUtils.clamp(this.dist * f, 9, 75); }
  /** Slight camera rotation (kept small so the lanes stay readable). */
  rotate(d: number) { this.yaw = THREE.MathUtils.clamp(this.yaw + d, -0.45, 0.45); }

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

  private newRig(defId: string, level = 1, branch: Branch | null = null, phase = 1) {
    const st = UNITS[defId] ? unitStats(defId, level, branch) : null;
    const model = st ? st.model : ENEMIES[defId].model;
    // bosses evolve visually with their phase (the Primordial has 3 distinct looks)
    return phase > 1 ? new Rig(defId + '#' + phase, { ...model, phase }, level, branch) : new Rig(defId, model, level, branch);
  }
  private newTower(defId: string, faction: FactionId, level: number, branch: Branch | null) {
    const u = UNITS[defId];
    if (!u?.tower) return null;
    return new TowerRig(u.tower, faction, level, branch, unitStats(defId, level, branch).model.accent);
  }

  // ---------------------------------------------------------------- per-frame

  frame(dt: number, view: ViewState, opts: { localPid: number; ghost: DragGhost | null; selected: { pid: number; bid: number } | null; showGrid: boolean; events: GameEvent[] }) {
    if (this.gov?.tick(dt * 1000)) { this.applyQuality(); this.resize(this.vw, this.vh); }
    // hit-stop: a very short slow-down of the animations on huge impacts (never on the simulation)
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.15; }
    this.time += dt;
    const meta = view.meta;
    this.env?.update(dt, this.time);
    if (!meta) { this.renderer.info.reset(); this.look.render(); return; }
    const combat = meta.phase === 'combat';
    const me = meta.players[opts.localPid];
    if (me) this.localTeam = me.team;
    this.localPid = opts.localPid;
    // time of day follows the waves; boss waves redden the sky
    const total = meta.settings.mode === 'survival' ? 10 : Math.max(2, meta.settings.totalWaves);
    const tod = meta.settings.mode === 'survival' ? ((meta.wave - 1) % 10) / 9 : (meta.wave - 1) / (total - 1);
    this.env?.setMood(Math.min(1, tod), combat && meta.wave > 0 && this.isBossWave(view));
    if (meta.phase !== this.lastPhase) {
      if (meta.phase === 'resolution') for (const b of this.builds.values()) b.cheer = 0.2;
      if (meta.phase === 'build') { this.numbers.clear(); this.coreFx = [0, 0]; }
      this.lastPhase = meta.phase;
    }
    this.batch.begin();

    // ---------- builds: towers always, unit rigs outside combat ----------
    const seenB = new Set<string>();
    let pads = 0;
    const m4 = new THREE.Matrix4();
    for (const p of meta.players) {
      for (const b of p.builds) {
        const key = `${p.pid}:${b.bid}`;
        seenB.add(key);
        const vkey = `${b.defId}|${b.level}|${b.branch ?? ''}|${p.faction}`;
        let bv = this.builds.get(key);
        if (!bv || bv.key !== vkey) {
          bv = { rig: this.newRig(b.defId, b.level, b.branch), tower: this.newTower(b.defId, p.faction, b.level, b.branch), key: vkey, born: bv ? this.time - 0.05 : this.time, cheer: -1 };
          this.builds.set(key, bv);
        }
        const c = cellCenter(p.slot, b.col, b.row);
        const z = c.z + arenaZ(p.team);
        const face = p.slot === 0 ? -Math.PI / 2 : Math.PI / 2; // face the portal (−x for the left lane)
        const age = this.time - bv.born;
        const pop = age < 0.35 ? 0.6 + 0.4 * easeOutBack(age / 0.35) : 1;
        if (bv.tower) {
          bv.tower.root.position.set(c.x, GROUND_Y, z);
          bv.tower.root.rotation.y = face;
          bv.tower.root.scale.setScalar(1.15 * (age < 0.3 ? 0.7 + 0.3 * easeOutBack(age / 0.3) : 1));
          if (!combat) bv.tower.aim = 0;
          bv.tower.update(dt, this.time);
          bv.tower.submit(this.batch, this.tint.setRGB(1, 1, 1));
        } else if (pads < 200 && !combat) {
          m4.makeTranslation(c.x, GROUND_Y + 0.015, z);
          this.pads.setMatrixAt(pads++, m4);
        }
        if (!combat) {
          const rig = bv.rig;
          const deck = bv.tower ? bv.tower.deckY : 0;
          const back = bv.tower ? bv.tower.unitBack : 0;
          rig.root.position.set(c.x - Math.sin(face) * back, GROUND_Y + deck, z - Math.cos(face) * back);
          rig.root.rotation.y = face;
          rig.root.scale.setScalar(rig.scale * pop * (bv.tower ? GARRISON_SCALE : 1));
          if (bv.cheer >= 0) { bv.cheer -= dt; if (bv.cheer <= 0) { rig.cheer(); bv.cheer = -1; } }
          rig.update(dt, false);
          rig.submit(this.batch, this.tint.setRGB(1, 1, 1));
        }
      }
    }
    this.pads.count = pads; this.pads.instanceMatrix.needsUpdate = true;
    for (const k of this.builds.keys()) if (!seenB.has(k)) this.builds.delete(k);

    // ---------- combat entities ----------
    const list = combat ? view.sample() : [];
    const seen = new Set<number>();
    for (const e of list) {
      seen.add(e.id);
      let v = this.ents.get(e.id);
      const wx = e.x, wz = e.z + arenaZ(e.arena);
      const enemy = !!(e.flags & F_ENEMY);
      const bossDef = enemy ? ENEMIES[e.defId] : undefined;
      const phase = bossDef?.boss ? (e.hp > 0.66 ? 1 : e.hp > 0.33 ? 2 : 3) : 1;
      if (!v || v.level !== e.level || v.branch !== e.branch || v.phase !== phase) {
        const rig = this.newRig(e.defId, e.level, e.branch, phase);
        let tower: TowerRig | null = null;
        if (!enemy && UNITS[e.defId]?.tower) {
          const owner = meta.players[e.owner];
          const cell = owner ? Renderer.cellAt(owner.slot, owner.team, wx, wz) : null;
          const b = cell ? owner.builds.find(x => x.col === cell.col && x.row === cell.row) : null;
          tower = b ? this.builds.get(`${owner.pid}:${b.bid}`)?.tower ?? null : null;
        }
        const face0 = enemy ? (e.x < 0 ? Math.PI / 2 : -Math.PI / 2) : (e.x < 0 ? -Math.PI / 2 : Math.PI / 2);
        v = { rig, defId: e.defId, level: e.level, branch: e.branch, phase, x: wx, z: wz, face: v?.face ?? face0, lunge: 0, lungeX: 0, lungeZ: 0, flash: 0, enemy, tower, fxT: Math.random(), speed: 0 };
        this.ents.set(e.id, v);
      }
      const dx = wx - v.x, dz = wz - v.z;
      const dist = Math.hypot(dx, dz);
      v.speed += ((dt > 0 ? dist / dt : 0) - v.speed) * Math.min(1, dt * 6);
      const moving = v.speed > 0.15;
      v.x = wx; v.z = wz;
      if (moving && !v.tower) v.face = lerpAngle(v.face, Math.atan2(dx, dz), Math.min(1, dt * 8));
      v.lunge = Math.max(0, v.lunge - dt * 6);
      v.flash = Math.max(0, v.flash - dt);
      const lk = Math.sin(v.lunge * Math.PI) * 0.3;
      const rig = v.rig;
      let y = GROUND_Y, sc = rig.scale;
      if (v.tower) {
        y += v.tower.deckY;
        sc *= GARRISON_SCALE;
        v.tower.aim = v.face - v.tower.root.rotation.y;
        rig.root.position.set(v.x - Math.sin(v.face) * v.tower.unitBack, y, v.z - Math.cos(v.face) * v.tower.unitBack);
      } else rig.root.position.set(v.x + v.lungeX * lk, y, v.z + v.lungeZ * lk);
      rig.root.rotation.y = v.face;
      rig.root.scale.setScalar(sc);
      rig.update(dt, moving);
      // readable status tints
      const f = e.flags;
      this.tint.setRGB(1, 1, 1);
      if (f & F_STEALTH) this.tint.setRGB(0.45, 0.5, 0.8);
      if (f & F_POISON) this.tint.multiply(new THREE.Color(0.75, 1.15, 0.65));
      if (f & F_BURN) this.tint.multiply(new THREE.Color(1.3, 0.85, 0.65));
      if (f & F_SLOW) this.tint.multiply(new THREE.Color(0.8, 0.95, 1.3));
      if (f & F_ELITE) this.tint.multiply(new THREE.Color(1.15, 1.05, 0.8));
      if (f & F_WET) this.tint.multiply(new THREE.Color(0.75, 0.95, 1.35));
      if (f & F_GHOST) this.tint.multiply(new THREE.Color(0.75, 0.7, 1.6));
      if (f & F_RIFT) this.tint.setRGB(1.2 + Math.sin(this.time * 4) * 0.25, 1, 1.4);
      if (e.defId === 'primordial') this.tint.multiplyScalar(0.6); // black rock: keep it dark under the rim light
      if (v.flash > 0) this.tint.setRGB(3, 3, 3);
      rig.submit(this.batch, this.tint);
      // status particles (throttled)
      v.fxT -= dt;
      if (v.fxT <= 0) {
        v.fxT = 0.18;
        const p = rig.root.position, hgt = rig.height;
        if (f & F_POISON) this.fx.rise(p.x, p.y + hgt * 0.5, p.z, 0x9aff4a, 1, 0.16, 0.5);
        if (f & F_BURN) this.fx.fire(p.x, p.y + hgt * 0.4, p.z, 2, 0.4, 0.6);
        if (f & F_SLOW) this.fx.rise(p.x, p.y + hgt * 0.3, p.z, 0xbff4ff, 1, 0.14, 0.6);
        if (f & F_HASTE) this.fx.rise(p.x, p.y + 0.2, p.z, 0xffe060, 1, 0.14, 0.4);
        if (f & F_RIFT) this.fx.rise(p.x, p.y + 0.6, p.z, 0xc07aff, 2, 0.22, 0.9);
        if (f & F_GHOST) this.fx.rise(p.x, p.y + hgt * 0.5, p.z, 0xb090ff, 1, 0.18, 0.4);
        if ((f & F_BREACH) && moving) { this.fx.dust(p.x, p.z, 1, 0.5); if (Math.random() < 0.5) this.fx.sparks(p.x, p.y + 0.3, p.z, 0xff8a2a, 2, 1.5, 0.14); }
        if (!enemy && e.level >= 5 && Math.random() < 0.5) this.fx.rise(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.8, FACTION_LOOK[meta.players[e.owner]?.faction ?? 'astreens'].glow, 1, 0.12, 0.2);
        // bosses: embers + smoke rising off the body, arcs of rift energy (stronger in later phases)
        if (bossDef?.boss) {
          const ec = phase === 1 ? 0xc07aff : phase === 2 ? 0xff5aa0 : 0xff6a2a;
          this.fx.rise(p.x + (Math.random() - 0.5) * hgt * 0.4, p.y + hgt * (0.3 + Math.random() * 0.5), p.z + (Math.random() - 0.5) * hgt * 0.3, ec, 1 + phase, 0.2, 1.2);
          if (Math.random() < 0.35) this.fx.smoke(p.x + (Math.random() - 0.5) * hgt * 0.3, p.y + hgt * 0.8, p.z, 1, 1.4, 0.18);
          if (Math.random() < 0.12 * phase) {
            const a = Math.random() * Math.PI * 2, r = hgt * 0.35;
            this.fx.bolt(new THREE.Vector3(p.x, p.y + hgt * 0.62, p.z), new THREE.Vector3(p.x + Math.cos(a) * r, p.y + hgt * (0.3 + Math.random() * 0.6), p.z + Math.sin(a) * r), ec);
          }
        }
      }
    }
    for (const [id, v] of this.ents) {
      if (!seen.has(id)) {
        this.ents.delete(id);
        if (combat) this.dying.push({ rig: v.rig, t: 0, kind: v.enemy ? (ENEMIES[v.defId]?.boss ? 'boss' : 'fall') : 'shatter', face: v.face, tint: new THREE.Color(1, 1, 1) });
      }
    }
    // death animations
    this.dying = this.dying.filter(d => {
      d.t += dt;
      const dur = d.kind === 'boss' ? 1.1 : d.kind === 'fall' ? 0.7 : 0.45;
      const k = d.t / dur;
      if (k >= 1 || !combat) return false;
      const r = d.rig.root;
      if (d.kind === 'fall') {
        r.rotation.set(-Math.min(1, k * 2.2) * 1.45, d.face, 0, 'YXZ');
        r.position.y = GROUND_Y - Math.max(0, k - 0.5) * 1.2;
        d.tint.setRGB(1 - k * 0.6, 1 - k * 0.6, 1 - k * 0.5);
      } else if (d.kind === 'shatter') {
        r.rotation.set(k * 0.8, d.face, k * 0.6, 'YXZ');
        r.scale.setScalar(d.rig.scale * (1 - k));
      } else {
        r.rotation.set(-Math.min(1, k * 1.5) * 1.3, d.face, Math.sin(k * 20) * 0.1, 'YXZ');
        r.position.y = GROUND_Y - k * 1.0;
        d.tint.setRGB(1 + k * 2, 1 + k, 1);
      }
      d.rig.update(dt, false);
      d.rig.submit(this.batch, d.tint);
      return true;
    });

    // ---------- events → FX ----------
    for (const ev of opts.events) this.onEvent(ev, view, meta);

    // ---------- placement ghost ----------
    this.updateGhost(meta, opts.ghost, opts.localPid, dt);
    this.batch.end();

    // ---------- HP bars / blobs / rings / stun stars / shields ----------
    this.updateMarkers(meta, list, combat);

    // ---------- v0.4: telegraphs, Résonance star, Bastion modules, lane chevrons, hazards ----------
    this.updateDecals(dt);
    this.updateResoStars(meta, dt);
    this.updateModules(meta, dt);
    this.updateChevrons(meta, combat);
    this.updateHazards(meta, combat);

    // ---------- grid, zones, runes, selection ----------
    const gridOpacity = opts.showGrid && !combat ? 0.32 : 0.04;
    for (const g of this.gridLines) { const mt = g.material as THREE.LineBasicMaterial; mt.opacity += (gridOpacity - mt.opacity) * 0.15; }
    const zoneOp = !combat && opts.ghost ? 0.13 : !combat ? 0.05 : 0;
    for (const zm of this.zoneMeshes) { const mt = zm.material as THREE.MeshBasicMaterial; mt.opacity += (zoneOp - mt.opacity) * 0.15; }
    this.updateRunes(meta, combat);
    this.updateSelection(meta, opts.selected, combat, opts.ghost);

    // ---------- FX ----------
    this.fx.update(dt, id => {
      const v = this.ents.get(id);
      return v ? v.rig.root.position.clone().setY(v.rig.root.position.y + v.rig.height * 0.5) : null;
    });
    this.numbers.update(dt, (x, y, z) => this.worldToScreen(x, y, z));
    this.updateResoCinematic(dt);

    // ---------- Core health look + destruction sequence ----------
    this.env?.coreCrystals.forEach((c, i) => {
      const t = meta.teams[i];
      const k = t ? t.hp / t.maxHp : 1;
      c.rotation.y += dt * (0.6 + (1 - k) * 2);
      const mat = c.material as THREE.MeshStandardMaterial;
      const alarm = k < 0.3 ? Math.abs(Math.sin(this.time * 6)) : 0;
      mat.emissiveIntensity = 0.5 + 0.7 * k + alarm * 0.8;
      this.env!.bastions[i]?.setHealth(k);
      const l = this.env!.coreLights[i];
      if (l) l.intensity = 4 + 7 * k + alarm * 8;
      const z0 = arenaZ(i);
      if (k < 0.35 && Math.random() < dt * 4) this.fx.smoke((Math.random() - 0.5) * 3, 4 + Math.random() * 3, z0 + (Math.random() - 0.5) * 4, 1, 1.2, 0.25);
      if (t && t.hp <= 0 && meta.ending > 0) {
        this.coreFx[i] = (this.coreFx[i] ?? 0) + dt;
        c.position.y = Math.max(1, CORE_Y - this.coreFx[i] * 1.6);
        c.scale.set(1 - Math.min(0.9, this.coreFx[i] * 0.3), 1.7 * (1 - Math.min(0.9, this.coreFx[i] * 0.3)), 1);
        if (Math.random() < dt * 9) {
          const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3;
          this.shake = Math.min(1, this.shake + this.fx.explode(Math.cos(a) * r, z0 + Math.sin(a) * r, 0.8 + Math.random() * 1.2, 0xff7a3a, 0.6 + Math.random() * 2) * 0.5);
        }
      } else if (!t || t.hp > 0) { c.scale.set(1, 1.7, 1); this.coreFx[i] = 0; }
    });

    // ---------- camera ----------
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const comfort = save.prefs.shake ?? 1;
    const sh = this.shake * this.shake * 0.6 * comfort;
    this.zoomPulse = Math.max(0, this.zoomPulse - dt * 1.6);
    const zp = Math.sin(Math.min(1, this.zoomPulse) * Math.PI) * 0.1 * comfort;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist * (1 - zp));
    this.camera.position.copy(this.target).add(off).add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    this.camera.lookAt(this.target);
    // ULTRA: light shafts from the local Bastion's reactor (stronger while a Résonance is channelled); lantern lights
    // follow the camera focus
    if (this.quality === 'ultra') {
      this.camera.updateMatrixWorld();
      const rp = this.shaftTmp.set(0, CORE_Y, arenaZ(this.localTeam)).project(this.camera);
      const on = rp.z < 1 && Math.abs(rp.x) < 1.25 && Math.abs(rp.y) < 1.25;
      const edge = Math.max(Math.abs(rp.x), Math.abs(rp.y));
      const k = on ? (0.8 + (this.resoCh[this.localTeam] ? 1.0 : 0)) * Math.min(1, (1.25 - edge) * 3) : 0;
      this.look.setShafts((rp.x + 1) / 2, (rp.y + 1) / 2, k);
      this.look.setTime(this.time);
    }
    this.env?.setFocus(this.target.x, this.target.z);
    if (this.env?.sun.castShadow) {
      // keep the shadow frustum centred on what we look at (sharp shadows at a modest map size)
      this.env.sun.target.position.set(this.target.x, 0, this.target.z);
      this.env.sun.position.set(this.target.x - 30, 60, this.target.z + 25);
      const sc = this.env.sun.shadow.camera as THREE.OrthographicCamera;
      const half = Math.min(45, this.dist * 0.9);
      if (Math.abs(sc.right - half) > 1) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    }
    this.renderer.info.reset();
    this.look.render();
    this.perf?.update(dt, this.renderer, this.scene, () => this.fx.add.active + this.fx.smokeL.active, this.gov ? ` · rés. ${Math.round(this.gov.scale * 100)} % · cible ${this.gov.targetFps} i/s` : '');
  }

  private bossFlag = false;
  private isBossWave(view: ViewState) {
    this.bossFlag = false;
    for (const e of view.frames.length ? view.frames[view.frames.length - 1].ents.values() : []) if (e.defId in ENEMIES && ENEMIES[e.defId].boss) { this.bossFlag = true; break; }
    return this.bossFlag;
  }

  localPid = 0;
  private updateMarkers(meta: MetaView, list: EntView[], combat: boolean) {
    const m4 = new THREE.Matrix4();
    const q = this.camera.quaternion;
    const qI = new THREE.Quaternion();
    const col = new THREE.Color();
    let nb = 0, nr = 0, ns = 0, nu = 0;
    const v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    // elite auras (level 4: ring, level 5: larger ring + sparkles in combat)
    let na = 0;
    const qa = new THREE.Quaternion(), ya = new THREE.Vector3(0, 1, 0);
    const aura = (x: number, y: number, z: number, level: number, faction: FactionId | undefined, r: number) => {
      if (level < 4 || na >= 200) return;
      const k = level >= 5 ? 1.0 : 0.72;
      qa.setFromAxisAngle(ya, this.time * (level >= 5 ? 0.9 : 0.5) + na);
      m4.compose(v3.set(x, y + 0.035, z), qa, s3.set(r * 2.6 * k, 1, r * 2.6 * k));
      this.auras.setMatrixAt(na, m4);
      const gc = faction ? FACTION_LOOK[faction].glow : 0xffe08a;
      this.auras.setColorAt(na++, col.setHex(gc).multiplyScalar(level >= 5 ? 1.6 : 1.1));
    };
    const place = (x: number, y0: number, z: number, scale: number, top: number, color: number, thick: number, hp: number, showHp: boolean, boss: boolean, shield: boolean, enemy: boolean) => {
      if (nr >= 500) return;
      m4.compose(v3.set(x, GROUND_Y + 0.02, z), qI, s3.set(scale * 1.7, 1, scale * 1.7));
      this.blobs.setMatrixAt(nr, m4);
      m4.compose(v3.set(x, GROUND_Y + 0.04 + y0, z), qI, s3.set(scale * 1.25 * thick, 1, scale * 1.25 * thick));
      this.rings.setMatrixAt(nr, m4);
      this.rings.setColorAt(nr, col.setHex(color));
      nr++;
      if (showHp && nb < 500) {
        const w = boss ? 2.8 : 0.95 * Math.max(0.85, scale * 0.8);
        const y = top + (boss ? 0.6 : 0.35);
        m4.compose(v3.set(x, y, z), q, s3.set(w + 0.08, boss ? 1.6 : 1, 1));
        this.hpBg.setMatrixAt(nb, m4);
        this.hpBg.setColorAt(nb, col.setHex(boss ? 0x6a4a10 : 0x14101f));
        const fw = Math.max(0.001, w * hp);
        const off = new THREE.Vector3(-(w - fw) / 2, 0, 0).applyQuaternion(q);
        m4.compose(v3.set(x + off.x, y + off.y, z + off.z), q, s3.set(fw, boss ? 1.5 : 1, 1));
        this.hpFg.setMatrixAt(nb, m4);
        this.hpFg.setColorAt(nb, col.setHex(shield ? 0xeaf6ff : enemy ? (boss ? 0xff3a2a : hp > 0.5 ? 0xff6a4a : 0xff2a2a) : hp > 0.6 ? 0x5aff7a : hp > 0.3 ? 0xffd04a : 0xff4a4a));
        nb++;
      }
    };
    if (combat) {
      for (const e of list) {
        const v = this.ents.get(e.id);
        if (!v) continue;
        const enemy = !!(e.flags & F_ENEMY);
        const boss = enemy && !!ENEMIES[e.defId]?.boss;
        const elite = !!(e.flags & F_ELITE);
        const owner = meta.players[e.owner];
        const fl = e.flags;
        const color = enemy ? ((fl & F_FOCUS) ? 0xff1a1a : boss ? 0xffb030 : elite ? 0xffd040 : (fl & F_RIFT) ? 0xc07aff : (fl & F_BREACH) ? 0xff8a2a : ENEMY_RING)
          : (fl & F_TASK) ? 0xb07aff : (fl & F_RALLY) ? 0x7dff9a : SLOT_COLORS[owner?.slot ?? 0];
        const p = v.rig.root.position;
        const thick = (fl & F_FOCUS) ? 1.9 + Math.sin(this.time * 8) * 0.15 : boss ? 1.5 : elite ? 1.25 : (fl & F_BREACH) ? 1.3 + Math.sin(this.time * 10) * 0.1 : 1;
        if (!enemy && !v.tower) aura(p.x, p.y, p.z, e.level, owner?.faction, v.rig.scale * 0.55);
        else if (!enemy && v.tower) aura(p.x, GROUND_Y, p.z, e.level, owner?.faction, 0.62);
        if ((fl & F_MARK) && ns < 499) {
          m4.compose(v3.set(p.x, p.y + v.rig.height + 0.42, p.z), q, s3.set(1.4, 1.4, 1.4));
          this.stars.setMatrixAt(ns, m4); this.stars.setColorAt(ns++, col.setHex(0x9fd8ff));
        }
        place(p.x, v.tower ? v.tower.deckY : 0, p.z, v.rig.scale * 0.55 * (v.tower ? 0.8 : 1), p.y + v.rig.height, color, thick, e.hp, e.hp < 0.999 || boss || elite || !!(e.flags & F_SHIELD), boss, !!(e.flags & F_SHIELD), enemy);
        if ((e.flags & F_STUN) && ns < 497) {
          for (let i = 0; i < 3; i++) {
            const a = this.time * 5 + i * 2.09;
            m4.compose(v3.set(p.x + Math.cos(a) * 0.35, p.y + v.rig.height + 0.15, p.z + Math.sin(a) * 0.35), q, s3.set(1, 1, 1));
            this.stars.setMatrixAt(ns, m4); this.stars.setColorAt(ns++, col.setHex(0xffe060));
          }
        }
        if ((e.flags & F_SHIELD) && nu < 120) {
          const r = Math.max(0.5, v.rig.height * (v.tower ? 0.35 : 0.45));
          m4.compose(v3.set(p.x, p.y + v.rig.height * 0.45, p.z), qI, s3.set(r, r, r));
          this.bubbles.setMatrixAt(nu++, m4);
        }
      }
    } else {
      // fusion available: identical units of the local player pulse purple
      const twins = new Set<number>();
      const lp = meta.players.find(p => p.team === this.localTeam && p.pid === this.localPid);
      if (lp) {
        const groups = new Map<string, number[]>();
        for (const b of lp.builds) if (b.level < 5) { const k = `${b.defId}|${b.level}|${b.branch}`; groups.set(k, [...(groups.get(k) ?? []), b.bid]); }
        for (const ids of groups.values()) if (ids.length >= 2) ids.forEach(i => twins.add(i));
      }
      for (const p of meta.players) for (const b of p.builds) {
        const bv = this.builds.get(`${p.pid}:${b.bid}`);
        if (!bv) continue;
        const rp = bv.rig.root.position;
        const twin = p.pid === this.localPid && twins.has(b.bid);
        const ringCol = p.team !== this.localTeam ? ENEMY_RING : twin ? 0xc87aff : b.rift ? 0xb07aff : SLOT_COLORS[p.slot];
        place(rp.x, bv.tower ? -0.02 : 0, rp.z, bv.rig.scale * 0.55, rp.y + bv.rig.height * (bv.tower ? GARRISON_SCALE : 1), ringCol, (bv.tower ? 1.25 : 1) * (twin ? 1.25 + Math.sin(this.time * 5) * 0.15 : 1), 1, false, false, false, false);
        aura(rp.x, GROUND_Y, rp.z, b.level, p.faction, bv.tower ? 0.62 : bv.rig.scale * 0.55);
        // level stars (readable power at a glance)
        for (let i = 0; i < b.level && ns < 500; i++) {
          const top = rp.y + bv.rig.height * (bv.tower ? GARRISON_SCALE : 1) + 0.28;
          const offs = (i - (b.level - 1) / 2) * 0.2;
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(offs);
          m4.compose(v3.set(rp.x + right.x, top + right.y, rp.z + right.z), q, s3.set(1, 1, 1));
          this.stars.setMatrixAt(ns, m4);
          this.stars.setColorAt(ns++, col.setHex(b.level >= 5 ? 0xffc030 : b.level >= 4 ? 0xffe080 : 0xfff6d0));
        }
      }
    }
    this.blobs.count = nr; this.rings.count = nr; this.hpBg.count = nb; this.hpFg.count = nb; this.stars.count = ns; this.bubbles.count = nu; this.auras.count = na;
    for (const m of [this.blobs, this.rings, this.hpBg, this.hpFg, this.stars, this.bubbles, this.auras]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  private updateRunes(meta: MetaView, combat: boolean) {
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion();
    let n = 0;
    if (!combat) for (const p of meta.players) {
      if (p.team !== this.localTeam) continue;
      for (const r of p.runes ?? []) {
        if (n >= 32) break;
        const c = cellCenter(p.slot, r.col, r.row);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.time * 0.8 + n);
        const s = 1 + Math.sin(this.time * 3 + n) * 0.08;
        m4.compose(new THREE.Vector3(c.x, GROUND_Y + 0.03, c.z + arenaZ(p.team)), q, new THREE.Vector3(s, 1, s));
        this.runeMesh.setMatrixAt(n, m4);
        this.runeMesh.setColorAt(n++, col.setHex(RUNES[r.kind].color));
      }
    }
    this.runeMesh.count = n;
    this.runeMesh.instanceMatrix.needsUpdate = true;
    if (this.runeMesh.instanceColor) this.runeMesh.instanceColor.needsUpdate = true;
  }

  private updateGhost(meta: MetaView, ghost: DragGhost | null, localPid: number, dt: number) {
    if (!ghost) {
      this.ghostGroup.visible = false;
      this.cellHi.visible = false; this.auraRing.visible = false; this.links.visible = false;
      if (!this.selRing.visible) this.rangeRing.visible = false;
      return;
    }
    const st = unitStats(ghost.defId, ghost.level ?? 1, ghost.branch ?? null);
    const p = meta.players[localPid];
    const faction = ghost.faction ?? p.faction;
    const key = `${ghost.defId}|${ghost.level ?? 1}|${ghost.branch ?? ''}|${faction}`;
    if (this.ghostKey !== key) {
      this.ghostGroup.clear();
      this.ghostRig = this.newRig(ghost.defId, ghost.level ?? 1, ghost.branch ?? null);
      this.ghostRig.attachMeshes(this.ghostMat, this.ghostGlow);
      this.ghostTower = this.newTower(ghost.defId, faction, ghost.level ?? 1, ghost.branch ?? null);
      if (this.ghostTower) { this.ghostTower.attachMeshes(this.ghostMat, this.ghostGlow); this.ghostGroup.add(this.ghostTower.root); }
      this.ghostGroup.add(this.ghostRig.root);
      this.ghostKey = key;
    }
    const c = cellCenter(ghost.slot, ghost.col, ghost.row);
    const z = c.z + arenaZ(ghost.team);
    const face = ghost.slot === 0 ? -Math.PI / 2 : Math.PI / 2;
    this.ghostGroup.visible = true;
    const bob = Math.sin(this.time * 6) * 0.05;
    if (this.ghostTower) { this.ghostTower.root.position.set(c.x, GROUND_Y + 0.05 + bob, z); this.ghostTower.root.rotation.y = face; this.ghostTower.update(dt, this.time); }
    const g = this.ghostRig!;
    g.root.position.set(c.x, GROUND_Y + 0.05 + bob + (this.ghostTower ? this.ghostTower.deckY : 0), z);
    g.root.rotation.y = face;
    g.root.scale.setScalar(g.scale * (this.ghostTower ? GARRISON_SCALE : 1));
    g.update(dt, false);
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
    this.rangeRing.scale.setScalar(Math.max(1.2, st.range + (st.tower ? 0.5 : 0) + 0.4));
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(ghost.valid ? 0xffffff : 0xff5a5a);
    const aura = st.abilities.find(a => a.kind === 'auraAttackSpeed' || a.kind === 'taunt' || a.kind === 'slowPulse' || a.kind === 'splash' || a.kind === 'guardAura' || a.kind === 'shieldPulse' || a.kind === 'hastePulse') as { radius: number; kind: string } | undefined;
    if (aura) {
      this.auraRing.visible = true;
      this.auraRing.position.set(c.x, GROUND_Y + 0.028, z);
      this.auraRing.scale.setScalar(aura.radius);
      (this.auraRing.material as THREE.MeshBasicMaterial).color.setHex(aura.kind === 'taunt' ? 0xffb04a : aura.kind === 'slowPulse' ? 0x7ff6ff : aura.kind === 'splash' ? 0xff8a3a : 0x9fffd0);
    } else this.auraRing.visible = false;
    // synergy links to neighbours
    const pos = this.links.geometry.attributes.position as THREE.BufferAttribute;
    let n = 0;
    for (const l of ghost.links ?? []) {
      if (n >= 63) break;
      const o = cellCenter(ghost.slot, l.col, l.row);
      pos.setXYZ(n++, c.x, GROUND_Y + 0.6, z); pos.setXYZ(n++, o.x, GROUND_Y + 0.6, o.z + arenaZ(ghost.team));
    }
    pos.needsUpdate = true;
    this.links.geometry.setDrawRange(0, n);
    this.links.visible = n > 0;
  }

  private updateSelection(meta: MetaView, sel: { pid: number; bid: number } | null, combat: boolean, ghost: DragGhost | null) {
    if (!sel || combat) { this.selRing.visible = false; if (!ghost) this.rangeRing.visible = false; return; }
    const p = meta.players[sel.pid];
    const b = p?.builds.find(x => x.bid === sel.bid);
    if (!b) { this.selRing.visible = false; return; }
    const c = cellCenter(p.slot, b.col, b.row);
    this.selRing.visible = true;
    this.selRing.position.set(c.x, GROUND_Y + 0.05, c.z + arenaZ(p.team));
    this.selRing.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08);
    if (!ghost) {
      const st = unitStats(b.defId, b.level, b.branch);
      this.rangeRing.visible = true;
      this.rangeRing.position.copy(this.selRing.position);
      this.rangeRing.scale.setScalar(Math.max(1.2, st.range + (st.tower ? 0.5 : 0) + 0.4));
      (this.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    }
  }

  // ---------------------------------------------------------------- FX from events

  /** Chest-height position of an entity (for projectile origins/targets). */
  private posOf(id: number, view: ViewState, h = 0.6): THREE.Vector3 | null {
    const v = this.ents.get(id);
    if (v) return v.rig.root.position.clone().setY(v.rig.root.position.y + v.rig.height * h);
    const e = view.latest(id);
    return e ? new THREE.Vector3(e.x, GROUND_Y + 0.8, e.z + arenaZ(e.arena)) : null;
  }

  private onEvent(ev: GameEvent, view: ViewState, meta: MetaView) {
    switch (ev.t) {
      case 'atk': {
        const va = this.ents.get(ev.a);
        va?.rig.strike();
        const a = this.posOf(ev.a, view, 0.7), b = this.posOf(ev.b, view, 0.5);
        if (!a || !b) return;
        if (va) va.face = Math.atan2(b.x - a.x, b.z - a.z);
        const vb = this.ents.get(ev.b);
        const color = FX_COLORS[ev.fx] ?? 0xffffff;
        const big = va ? 1 + Math.max(0, va.level - 1) * 0.12 : 1;
        const onHit = (p: THREE.Vector3) => {
          if (vb) { vb.flash = 0.07; vb.rig.hit(); }
          this.fx.sparks(p.x, p.y, p.z, ev.crit ? 0xfff0a0 : color, ev.crit ? 12 : 5, ev.crit ? 4 : 2.4, ev.crit ? 0.3 : 0.2);
          if (ev.crit) { this.fx.flash(p.x, p.y, p.z, 0xfff0c0, 1.6, 0.14); }
          if (vb && vb.enemy && (ev.crit || ev.dmg >= 25) && Math.abs(p.z - arenaZ(this.localTeam)) < 17) this.numbers.hit(ev.b, ev.dmg, ev.crit, p.x, p.y + 0.5, p.z);
        };
        if (ev.fx === 'lightning' || (va && LIGHTNING.has(va.defId) && ev.ranged && ev.fx === 'lightning')) { this.fx.bolt(a, b, color); onHit(b); return; }
        if (ev.ranged) {
          const kind: ProjKind = (va && PROJ[va.defId]) ?? 'orb';
          let from = a;
          if (va?.tower && kind === 'cannonball') { va.tower.recoil(); from = va.tower.muzzle(new THREE.Vector3()); }
          this.fx.shoot(kind, from, b, ev.b, va?.enemy ? 0xff8a5a : color, big, p => {
            onHit(p);
            if (kind === 'cannonball') this.shake = Math.min(1, this.shake + this.fx.explode(p.x, p.z, 0.9 * big, 0xffa040) * 0.25);
            else if (kind === 'fireball') { this.fx.fire(p.x, p.y, p.z, 6, 0.5); this.fx.smoke(p.x, p.y, p.z, 1, 0.5); }
            else if (kind === 'ice') this.fx.sparks(p.x, p.y, p.z, 0xe0f8ff, 6, 2, 0.2);
            else if (kind === 'glob') this.fx.rise(p.x, p.y, p.z, 0x9aff4a, 4, 0.2, 0.8);
          });
        } else {
          if (va) { va.lunge = 1; const d = b.clone().sub(a).setY(0).normalize(); va.lungeX = d.x; va.lungeZ = d.z; }
          setTimeout(() => {
            if (va) this.fx.slash(b.x, b.y, b.z, va.face, va.enemy ? 0xff9a7a : color, 0.6 + va.rig.scale * 0.35);
            onHit(b);
            if (va && va.rig.def.attack === 'slam') this.fx.dust(b.x, b.z, 3, 0.6);
          }, 100);
        }
        break;
      }
      case 'coreShot': {
        const b = this.posOf(ev.b, view, 0.5);
        if (b) this.fx.bolt(new THREE.Vector3(0, CORE_Y, arenaZ(ev.team)), b, 0x7fd8ff);
        break;
      }
      case 'die': {
        const z = ev.z + arenaZ(ev.arena);
        if (ev.boss) {
          this.shake = 1;
          if (ev.arena === this.localTeam) this.hitStop = 0.12;
          this.fx.explode(ev.x, z, 2.5, 0xffd04a, 1.2);
          this.fx.sparks(ev.x, 1.5, z, 0xffd04a, 60, 7, 0.3);
          this.fx.ring(ev.x, z, 7, 0xffd04a, 0.9);
        } else if (ev.enemy) {
          this.fx.dust(ev.x, z, 3, 0.6);
          this.fx.rise(ev.x, 0.9, z, 0xd0b0ff, 3, 0.22, 0.3);
        } else {
          const v = this.ents.get(ev.id);
          this.fx.debrisBurst(ev.x, 0.8, z, v ? v.rig.def.body[0]?.c ?? 0x8a8a8a : 0x8a8a8a, 8, 3, 0.12);
          this.fx.smoke(ev.x, 0.5, z, 2, 0.7);
        }
        break;
      }
      case 'pulse': {
        const x = ev.x, z = ev.z + arenaZ(ev.arena);
        const col = FX_COLORS[ev.fx] ?? 0xffffff;
        if (ev.fx === 'beam') {
          this.fx.bolt(new THREE.Vector3(0, 4.4, arenaZ(ev.arena)), new THREE.Vector3(x, GROUND_Y + 0.8, z), 0xbff8ff);
          this.fx.bolt(new THREE.Vector3(0, 4.4, arenaZ(ev.arena)), new THREE.Vector3(x, GROUND_Y + 0.8, z), 0xffffff);
          this.fx.flash(x, 0.9, z, 0xbff8ff, 3, 0.2); this.fx.sparks(x, 0.9, z, 0xffffff, 14, 4);
        } else if (ev.fx === 'chain') {
          this.fx.ring(x, z, 1.8, 0xffd27a, 0.5); this.fx.sparks(x, 1.2, z, 0xffd27a, 12, 3); this.fx.bolt(new THREE.Vector3(0, CORE_Y, arenaZ(ev.arena)), new THREE.Vector3(x, 1, z), 0xffd27a);
        } else if (ev.fx === 'leaf') {
          this.fx.ring(x, z, ev.r, 0x7dffb0, 0.5); this.fx.rise(x, 0.4, z, 0x9aff9a, 6, 0.22, ev.r);
        } else if (ev.fx === 'missile') {
          this.fx.shoot('missile', new THREE.Vector3(x - 3, 12, z - 2), new THREE.Vector3(x, GROUND_Y + 0.2, z), -1, 0xffffff, 1, p => { this.shake = Math.min(1, this.shake + this.fx.explode(p.x, p.z, 0.9) * 0.2); });
        } else if (ev.fx === 'starfall') {
          this.fx.shoot('ice', new THREE.Vector3(x + 2, 14, z - 3), new THREE.Vector3(x, GROUND_Y + 0.4, z), -1, 0xbfe0ff, 1.6, p => { this.fx.flash(p.x, p.y, p.z, 0xbfe0ff, 2.4, 0.2); this.fx.sparks(p.x, p.y, p.z, 0xffffff, 14, 4, 0.26); this.fx.ring(p.x, p.z, 1.6, 0xbfe0ff, 0.4); });
        } else if (ev.fx === 'poison') {
          this.fx.ring(x, z, ev.r, 0x9aff4a, 0.5);
          this.fx.rise(x, 0.4, z, 0x9aff4a, 4, 0.24, ev.r);
        } else if (ev.fx === 'shield' || ev.fx === 'enemyShield') {
          this.fx.ring(x, z, ev.r, col, 0.5);
          this.fx.rise(x, 0.6, z, col, 5, 0.2, ev.r);
        } else if (ev.fx === 'haste') {
          this.fx.ring(x, z, ev.r, 0xffe060, 0.4);
        } else {
          this.fx.ring(x, z, ev.r, col, 0.45);
          this.fx.sparks(x, 0.6, z, col, 8, 3);
          if (ev.fx === 'fire') this.fx.fire(x, 0.4, z, 10, ev.r);
          if (ev.fx === 'stun') this.fx.flash(x, 0.8, z, 0xfff07a, ev.r * 1.5, 0.2);
        }
        break;
      }
      case 'explode': {
        this.shake = Math.min(1, this.shake + this.fx.explode(ev.x, ev.z + arenaZ(ev.arena), ev.r));
        break;
      }
      case 'heal': { const p = this.posOf(ev.id, view, 0.9); if (p) this.fx.rise(p.x, p.y - 0.4, p.z, 0x8aff9a, 4, 0.2, 0.5); break; }
      case 'stun': { const p = this.posOf(ev.id, view, 1); if (p) this.fx.sparks(p.x, p.y, p.z, 0xfff07a, 4, 1.4, 0.2); break; }
      case 'dash': { const p = this.posOf(ev.id, view, 0.5); if (p) { this.fx.smoke(p.x, p.y, p.z, 2, 0.6, 0.15); this.fx.sparks(p.x, p.y, p.z, 0xd06aff, 12, 3); } break; }
      case 'summon': { const z = ev.z + arenaZ(ev.arena); this.fx.ring(ev.x, z, 1.4, 0xb07aff, 0.5); this.fx.rise(ev.x, 0.3, z, 0xc48bff, 8, 0.24, 1); break; }
      case 'coreHit': {
        this.fx.ring(0, arenaZ(ev.team), 3.5, 0xff3a3a, 0.5);
        this.fx.sparks(0, CORE_Y, arenaZ(ev.team), 0xff5a5a, 16, 5);
        this.fx.flash(0, CORE_Y, arenaZ(ev.team), 0xff6a6a, 3, 0.2);
        if (ev.team === this.localTeam) this.shake = Math.min(1, this.shake + 0.35);
        break;
      }
      case 'cast': this.castFx(ev.power, ev.x, ev.z + arenaZ(ev.arena), meta, ev.pid); break;
      case 'fuse': {
        const p = meta.players[ev.pid];
        const from = cellCenter(p.slot, ev.col, ev.row);
        const z = from.z + arenaZ(p.team);
        this.fx.smoke(from.x, 0.6, z, 3, 0.6, 0.7);
        this.fx.sparks(from.x, 1, z, 0xffe08a, 20, 3);
        break;
      }
      case 'evolve': case 'build': {
        const key = `${ev.pid}:${ev.bid}`;
        const isUp = ev.t === 'evolve';
        setTimeout(() => {
          const bv = this.builds.get(key);
          if (!bv) return;
          const p = bv.rig.root.position;
          this.fx.ring(p.x, p.z, isUp ? 2.4 : 1.3, isUp ? 0xffe08a : 0xaef0ff, 0.5);
          this.fx.dust(p.x, p.z, isUp ? 4 : 3, 0.6);
          if (isUp) {
            this.fx.flash(p.x, p.y + 1, p.z, 0xfff0b0, 3, 0.3);
            for (let i = 0; i < 14; i++) this.fx.rise(p.x, 0.3 + i * 0.2, p.z, 0xfff0b0, 1, 0.24, 0.25);
            this.fx.sparks(p.x, p.y + 1.2, p.z, 0xffe08a, 30, 4, 0.26);
          }
          bv.born = this.time - 0.05;
        }, 30);
        break;
      }
      case 'bossIn': if (ev.arena === this.localTeam) { this.shake = Math.min(1, this.shake + 0.6); this.zoomPulse = 1; } break;
      case 'tele': {
        if (ev.dur <= 0) { for (const d of this.decals) if (d.active && d.id === ev.id) { d.active = false; d.mesh.visible = d.fill.visible = false; } break; }
        this.decal(ev.x, ev.z + arenaZ(ev.arena), ev.r, ev.dur, ev.id, 0xff3a3a, 0);
        break;
      }
      case 'slam': {
        const z = ev.z + arenaZ(ev.arena);
        this.shake = Math.min(1, this.shake + this.fx.explode(ev.x, z, ev.r * 0.8, 0xff6a3a) * 0.6);
        this.fx.ring(ev.x, z, ev.r * 1.3, 0xff5a3a, 0.5);
        this.fx.dust(ev.x, z, 8, ev.r);
        if (ev.arena === this.localTeam) this.hitStop = 0.07;
        break;
      }
      case 'bossPhase': {
        const p = this.posOf(ev.id, view, 0.6);
        if (p) { this.fx.ring(p.x, p.z, 4.5, 0xff3a5a, 0.7); this.fx.flash(p.x, p.y, p.z, 0xff6a6a, 4, 0.3); this.fx.sparks(p.x, p.y, p.z, 0xff9a6a, 30, 5, 0.3); }
        if (ev.arena === this.localTeam) this.shake = Math.min(1, this.shake + 0.5);
        break;
      }
      case 'reso': this.resoFx(ev, meta); break;
      case 'order': {
        const z = ev.z + arenaZ(ev.arena);
        if (ev.order === 'rally') this.decal(ev.x, z, 3.5, 6, -2, 0x7dff9a, 6);
        else if (ev.order === 'focus') { const p = this.posOf(ev.target, view, 1); if (p) { this.fx.ring(p.x, p.z, 1.6, 0xff2a2a, 0.5); this.fx.sparks(p.x, p.y, p.z, 0xff5a5a, 10, 2); } }
        else if (ev.order === 'purge') { this.fx.ring(ev.x, z, 9, 0xffffff, 0.6); this.fx.rise(ev.x, 0.4, z, 0xffffff, 24, 0.22, 8); }
        else if (ev.order === 'intercept') this.fx.ring(ev.x, z, 6, 0xffe060, 0.5);
        else if (ev.order === 'retreat') this.fx.ring(ev.x, z, 7, 0x9fd8ff, 0.5);
        break;
      }
      case 'portal': {
        const z1 = ev.z + arenaZ(ev.arena), z2 = ev.z2 + arenaZ(ev.arena);
        this.fx.ring(ev.x, z1, 1.6, 0xb07aff, 0.5); this.fx.rise(ev.x, 0.4, z1, 0xc8a0ff, 10, 0.24, 1);
        this.fx.ring(ev.x2, z2, 1.6, 0xb07aff, 0.5); this.fx.flash(ev.x2, 1, z2, 0xc8a0ff, 3, 0.25);
        break;
      }
      case 'rift': {
        const z = ev.z + arenaZ(ev.arena);
        if (ev.k === 'closed') { this.fx.explode(ev.x, z, 1.8, 0xc07aff, 1); this.fx.ring(ev.x, z, 4, 0xe0b0ff, 0.6); this.fx.sparks(ev.x, 1.5, z, 0xffe08a, 30, 5, 0.3); }
        else if (ev.k === 'open') { this.fx.ring(ev.x, z, 2.5, 0x8a3aff, 0.6); this.fx.smoke(ev.x, 0.8, z, 4, 1, 0.4); }
        break;
      }
      case 'help': { const z = ev.z + arenaZ(ev.arena); this.fx.rise(ev.x, 0.6, z, 0x7dffb0, 6, 0.22, 0.8); break; }
      // v0.7
      case 'ghost': { const z = ev.z + arenaZ(ev.arena); this.fx.ring(ev.x, z, 1.4, 0xb0c8ff, 0.5); this.fx.rise(ev.x, 0.3, z, 0xd0e0ff, 10, 0.22, 0.8); this.fx.flash(ev.x, 1, z, 0xb0c8ff, 2.5, 0.25); break; }
      case 'seal': {
        const z = ev.z + arenaZ(ev.arena);
        if (ev.k === 'open') { this.fx.ring(ev.x, z, 5, 0xc8a0ff, 0.9); this.fx.rise(ev.x, 0.5, z, 0xd0b0ff, 24, 0.24, 2.5); }
        else if (ev.k === 'arm') { this.fx.ring(ev.x, z, 3, 0xe0c8ff, 0.5); this.fx.sparks(ev.x, 1.5, z, 0xe0c8ff, 12, 3); }
        else {
          this.fx.flash(ev.x, 2, z, 0xffe0a0, 9, 0.3);
          this.fx.ring(ev.x, z, 7, 0xd0b0ff, 0.8); this.fx.ring(ev.x, z, 4, 0xffffff, 0.5);
          this.fx.sparks(ev.x, 1.5, z, 0xfff0c0, 60, 7, 0.3);
          this.fx.debrisBurst(ev.x, 1.2, z, 0xc8a0ff, 14, 4, 0.14);
          this.shake = Math.min(1, this.shake + 0.6);
          if (ev.arena === this.localTeam) { this.hitStop = 0.08; this.zoomPulse = 1; }
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- v0.4 visuals

  /** Ground decal (telegraph or zone): outline + disc that fills during `dur` (hold = stays filled). */
  private decal(x: number, z: number, r: number, dur: number, id: number, color: number, hold: number) {
    const d = this.decals.find(q => !q.active) ?? this.decals[0];
    d.active = true; d.t = 0; d.dur = Math.max(0.05, dur); d.id = id; d.hold = hold;
    d.mesh.position.set(x, GROUND_Y + 0.05, z); d.fill.position.set(x, GROUND_Y + 0.04, z);
    d.mesh.scale.setScalar(r); d.fill.scale.setScalar(0.01);
    (d.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (d.fill.material as THREE.MeshBasicMaterial).color.setHex(color);
    d.mesh.visible = d.fill.visible = true;
  }
  private updateDecals(dt: number) {
    for (const d of this.decals) {
      if (!d.active) continue;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      const r = d.mesh.scale.x;
      d.fill.scale.setScalar(Math.max(0.01, (d.hold > 0 ? 1 : k) * r));
      const blink = d.hold > 0 ? 0.25 + Math.sin(this.time * 4) * 0.06 : 0.22 + k * 0.3 + (k > 0.7 ? Math.abs(Math.sin(this.time * 18)) * 0.2 : 0);
      (d.fill.material as THREE.MeshBasicMaterial).opacity = blink;
      if (d.t >= d.dur + (d.hold > 0 ? 0 : 0.1)) { d.active = false; d.mesh.visible = d.fill.visible = false; }
    }
  }

  /** Résonance channel: a star grows above the Bastion; the detonation colours the whole arena. */
  private updateResoStars(meta: MetaView, dt: number) {
    meta.teams.forEach((t, i) => {
      const rs = this.resoStars[i];
      if (!rs) return;
      const target = t.resoCast ? 1 : 0;
      rs.k += (target - rs.k) * Math.min(1, dt * 3);
      rs.group.visible = rs.k > 0.02;
      if (!rs.group.visible) return;
      const pulse = 1 + Math.sin(this.time * (t.resoCast?.sync ? 16 : 8)) * 0.12;
      rs.core.scale.setScalar(rs.k * pulse * (t.resoCast?.sync ? 1.35 : 1));
      rs.core.rotation.y += dt * 3; rs.core.rotation.x += dt * 1.7;
      rs.halo.scale.setScalar(6 * rs.k * pulse * (t.resoCast?.sync ? 1.4 : 1));
      if (Math.random() < dt * 20) this.fx.rise((Math.random() - 0.5) * 6, 1, arenaZ(i) + (Math.random() - 0.5) * 6, 0xffffff, 1, 0.26, 0.5);
    });
  }
  private resoFx(ev: Extract<GameEvent, { t: 'reso' }>, meta: MetaView) {
    const ab = ALL_DUO_ABILITIES.find(a => a.id === ev.ability);
    const z0 = arenaZ(ev.team);
    const rs = this.resoStars[ev.team];
    if (ev.k === 'start' && rs && ab) { (rs.halo.material as THREE.SpriteMaterial).color.setHex(ab.color); (rs.core.material as THREE.MeshBasicMaterial).color.setHex(ab.color2); this.fx.ring(0, z0, 4, ab.color, 0.8); }
    if (ev.k === 'start' && ab) {
      const pl = meta.players.filter(p => p && p.team === ev.team).sort((a, b) => a.slot - b.slot);
      const fc = pl.map(p => FACTION_LOOK[p.faction].glow);
      this.resoCh[ev.team] = { t: 0, c: [fc[0] ?? ab.color, fc[1] ?? fc[0] ?? ab.color2], color: ab.color, emit: 0 };
    }
    if (ev.k === 'refund') this.resoCh[ev.team] = null;
    if (ev.k === 'sync') this.fx.ring(0, z0, 6, 0xffffff, 0.6);
    if (ev.k !== 'fire' || !ab) return;
    this.resoCh[ev.team] = null;
    if (ev.team === this.localTeam && save.prefs.flash !== false) { this.gradeFlash = 1; this.gradeFlashC.setHex(ab.color2); }
    // ground glyph: a rune circle in the ability colour expanding from the Bastion over the whole arena
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runeCircleTexture(), color: new THREE.Color(ab.color).multiplyScalar(2), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    gm.position.set(0, GROUND_Y + 0.05, z0);
    gm.renderOrder = 5;
    this.scene.add(gm);
    this.glyphs.push({ m: gm, t: 0 });
    const big = ev.team === this.localTeam;
    for (const x of [-18, -9, 0, 9, 18]) this.fx.ring(x, z0, 10, x % 18 === 0 ? ab.color : ab.color2, 0.9);
    this.fx.flash(0, 9, z0, ab.color, 14, 0.5);
    this.fx.sparks(0, 9, z0, ab.color2, 80, 9, 0.35);
    for (let i = 0; i < 6; i++) this.fx.shoot('orb', new THREE.Vector3(0, 9, z0), new THREE.Vector3((Math.random() - 0.5) * 40, GROUND_Y + 0.3, z0 + (Math.random() - 0.5) * 6), -1, ab.color, 2, p => this.fx.flash(p.x, p.y, p.z, ab.color2, 4, 0.25));
    if (big) { this.shake = Math.min(1, this.shake + 0.7); this.zoomPulse = 1; this.hitStop = 0.09; }
    void meta;
  }

  private updateResoCinematic(dt: number) {
    this.resoCh.forEach((ch, team) => {
      const b = this.env?.bastions[team];
      if (!ch) { b?.surge(0); return; }
      ch.t += dt; ch.emit -= dt;
      const k = Math.min(1, ch.t / 2.2);
      b?.surge(k, ch.color);
      if (ch.emit <= 0) {
        ch.emit = 0.1;
        const z0 = arenaZ(team);
        ([[0, -1], [1, 1]] as [number, number][]).forEach(([i, sg]) => {
          const from = new THREE.Vector3(sg * (14 + Math.random() * 16), 0.8, z0 + (Math.random() - 0.5) * 7);
          const col = ch.c[i];
          this.fx.shoot('orb', from, new THREE.Vector3(0, CORE_Y, z0), -1, col, 1, p => this.fx.flash(p.x, p.y, p.z, col, 2.2, 0.15));
        });
      }
    });
    // grade: the local team's channel warms the image toward the ability colour; the impact flashes it
    const lc = this.resoCh[this.localTeam];
    const tk = lc ? Math.min(1, lc.t / 1.5) * 0.22 : 0;
    const target = lc ? new THREE.Color(lc.color).lerp(new THREE.Color(1, 1, 1), 0.55) : new THREE.Color(1, 1, 1);
    const want = new THREE.Color(1, 1, 1).lerp(target.multiplyScalar(1.15), tk / 0.22 * 0.6);
    this.gradeTint.lerp(want, Math.min(1, dt * 4));
    this.look.setTint(this.gradeTint.r, this.gradeTint.g, this.gradeTint.b);
    this.gradeFlash = Math.max(0, this.gradeFlash - dt * 1.8);
    this.look.setFlash(this.gradeFlash * this.gradeFlash * 0.55, this.gradeFlashC);
    for (let i = this.glyphs.length - 1; i >= 0; i--) {
      const g = this.glyphs[i];
      g.t += dt;
      const k = g.t / 1.4;
      g.m.scale.setScalar(3 + (1 - Math.pow(1 - Math.min(1, k), 3)) * 34);
      g.m.rotation.y += dt * 0.6;
      (g.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(g.m); g.m.geometry.dispose(); (g.m.material as THREE.Material).dispose(); this.glyphs.splice(i, 1); }
    }
  }

  /** The Bastion shows its modules: one piece per slot (family silhouette, level size) + a family banner. */
  private updateModules(meta: MetaView, _dt: number) {
    meta.teams.forEach((t, i) => { this.env?.bastions[i]?.setModules(t.modules); });
    // each lane wears its player's faction (decor + ambient particles)
    for (const p of meta.players) if (p) this.env?.setLaneFaction(p.team, p.slot, p.faction);
  }

  /** Chevrons pointing from the rifts to the Core: where the enemies will walk. */
  private updateChevrons(meta: MetaView, combat: boolean) {
    const show = meta.phase === 'build' || (combat && meta.combatTime < 4);
    const mat = this.chevrons.material as THREE.MeshBasicMaterial;
    mat.opacity += ((show ? 0.55 : 0) - mat.opacity) * 0.1;
    if (mat.opacity < 0.02) { this.chevrons.count = 0; return; }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const team = this.localTeam;
    for (const slot of [0, 1]) {
      const d = slot === 0 ? 1 : -1;
      q.setFromAxisAngle(up, d > 0 ? 0 : Math.PI);
      for (let i = 0; i < 9 && n < 120; i++) {
        const k = ((i + (this.time * 0.6) % 1) / 9);
        const x = -d * (LANE.spawnX - 1 - k * (LANE.spawnX - LANE.leakX - 1));
        m4.compose(new THREE.Vector3(x, GROUND_Y + 0.32, arenaZ(team) + 0.15), q, new THREE.Vector3(1, 1, 1));
        this.chevrons.setMatrixAt(n++, m4);
      }
    }
    this.chevrons.count = n;
    this.chevrons.instanceMatrix.needsUpdate = true;
  }

  private updateHazards(meta: MetaView, combat: boolean) {
    let n = 0;
    const m4 = new THREE.Matrix4();
    for (const p of meta.players) {
      if (p.team !== this.localTeam || combat) continue;
      for (const hz of p.hazards ?? []) {
        if (n >= 16) break;
        const c = cellCenter(p.slot, hz.col, hz.row);
        m4.makeTranslation(c.x, GROUND_Y + 0.035, c.z + arenaZ(p.team));
        this.hazardMesh.setMatrixAt(n++, m4);
      }
    }
    this.hazardMesh.count = n;
    this.hazardMesh.instanceMatrix.needsUpdate = true;
    (this.hazardMesh.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(this.time * 5) * 0.1;
  }

  /** Big, distinct visuals for commander powers. */
  private castFx(power: string, x: number, z: number, meta: MetaView, pid: number) {
    const p = meta.players[pid];
    const laneX = p ? cellCenter(p.slot, 2, 3).x : x;
    switch (power) {
      case 'freeze': this.fx.ring(x, z, 9, 0xbff4ff, 0.8); this.fx.flash(x, 1, z, 0xbff4ff, 9, 0.35); for (let i = 0; i < 20; i++) this.fx.sparks(x + (Math.random() - 0.5) * 12, 1, z + (Math.random() - 0.5) * 6, 0xe0f8ff, 2, 2, 0.24); break;
      case 'comet': this.fx.shoot('fireball', new THREE.Vector3(x + 6, 20, z - 6), new THREE.Vector3(x, GROUND_Y, z), -1, 0xbfe0ff, 3, q => { this.shake = 1; this.fx.explode(q.x, q.z, 3, 0x9fd8ff); this.fx.ring(q.x, q.z, 5, 0xbfe0ff, 0.7); }); break;
      case 'overdrive': case 'fervor': this.fx.ring(laneX, z, 10, power === 'fervor' ? 0xff8a3a : 0xffd060, 0.7); this.fx.flash(laneX, 1.5, z, 0xffe060, 8, 0.3); break;
      case 'emp': this.fx.ring(x, z, 12, 0x9ffcff, 0.9); this.fx.ring(x, z, 7, 0xffffff, 0.6); this.fx.flash(x, 1.5, z, 0x9ffcff, 12, 0.3); this.shake = Math.min(1, this.shake + 0.4); break;
      case 'heal': case 'bubble': this.fx.ring(laneX, z, 9, power === 'heal' ? 0x8aff9a : 0x9fe8ff, 0.8); this.fx.rise(laneX, 0.3, z, power === 'heal' ? 0x8aff9a : 0x9fe8ff, 30, 0.28, 10); break;
      case 'roots': this.fx.ring(x, z, 10, 0x6adc5a, 0.8); for (let i = 0; i < 18; i++) this.fx.dust(x + (Math.random() - 0.5) * 14, z + (Math.random() - 0.5) * 6, 1, 0.5); break;
      case 'forest': case 'krakenCall': case 'harvest': this.fx.ring(x, z, 3, 0x7adc6a, 0.6); this.fx.smoke(x, 0.5, z, 6, 1.2, 0.5); break;
      case 'tide': this.fx.ring(x, z, 11, 0x5ad8ff, 0.9); for (let i = 0; i < 26; i++) this.fx.rise(x + (Math.random() - 0.5) * 14, 0.2, z + (Math.random() - 0.5) * 7, 0x9fe8ff, 1, 0.3, 0.2); break;
      case 'eruption': for (let i = 0; i < 16; i++) this.fx.fire(x + (Math.random() - 0.5) * 14, 0.3, z + (Math.random() - 0.5) * 7, 4, 0.6); this.fx.flash(x, 1, z, 0xff8a3a, 10, 0.35); break;
      case 'sunstrike': this.fx.bolt(new THREE.Vector3(x, 24, z), new THREE.Vector3(x, GROUND_Y + 0.3, z), 0xfff0a0); this.fx.explode(x, z, 2.5, 0xffd060); this.shake = 1; break;
      case 'veil': this.fx.smoke(laneX, 0.6, z, 12, 1.4, 0.12); break;
      case 'doom': this.fx.flash(x, 2, z, 0xc48bff, 12, 0.4); this.fx.ring(x, z, 10, 0x8a3aff, 0.8); break;
      case 'starfall': case 'missiles': break; // per-target pulses carry the visuals
    }
  }

  // ---------------------------------------------------------------- card portraits

  /** Small 3D portrait of a unit (and its tower) rendered once to a data URL — used by the HUD cards. */
  portrait(defId: string, faction: FactionId, level = 1, branch: Branch | null = null, size = 128): string {
    const key = `${defId}|${faction}|${level}|${branch ?? ''}|${size}`;
    const hit = this.portraitCache.get(key);
    if (hit) return hit;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 3); scene.add(d);
    const mat = litMaterial(), glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.6) });
    scene.environment = sharedEnvMap();
    const rig = this.newRig(defId, level, branch);
    rig.attachMeshes(mat, glow);
    const tower = this.newTower(defId, faction, level, branch);
    const grp = new THREE.Group();
    if (tower) { tower.attachMeshes(mat, glow); tower.update(0, 0); grp.add(tower.root); rig.root.position.y = tower.deckY; rig.root.scale.setScalar(rig.scale * GARRISON_SCALE); }
    rig.update(0.016, false);
    grp.add(rig.root);
    grp.rotation.y = 0.6;
    scene.add(grp);
    const box = new THREE.Box3().setFromObject(grp);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const r = Math.max(s.y, s.x * 0.9) * 1.05;
    cam.position.set(c.x, c.y + r * 0.35, c.z + r * 2.1);
    cam.lookAt(c.x, c.y - r * 0.02, c.z);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prevTarget = this.renderer.getRenderTarget();
    const prevClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearAlpha(prevClear);
    rt.dispose(); mat.dispose(); glow.dispose();
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(img, 0, 0);
    const url = cv.toDataURL('image/png');
    this.portraitCache.set(key, url);
    return url;
  }

  // compatibility helpers
  ring(x: number, z: number, r: number, color: number, dur: number) { this.fx.ring(x, z, r, color, dur); }
  burst(x: number, y: number, z: number, color: number, n: number, speed: number) { this.fx.sparks(x, y, z, color, n, speed); }

  get drawCalls() { return this.renderer.info.render.calls; }

  dispose() { this.numbers.dispose(); this.perf?.dispose(); this.renderer.dispose(); }
}

function easeOutBack(x: number) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
function lerpAngle(a: number, b: number, t: number) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
