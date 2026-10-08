// FX system: GPU-sized particles (additive sparks/fire + alpha smoke), pooled 3D projectiles that really fly from the
// shooter to the target (arrows, bolts, spears, cannonballs, fireballs, orbs, ice shards, poison globs), lightning
// ribbons, melee slash arcs, explosions (flash + fireball + smoke + debris + shockwave + scorch decal + light).
// Everything is pooled and capped so phones keep a stable framerate.
import * as THREE from 'three';
import { glowTexture, smokeTexture, starTexture } from './textures';
import { box, cone, cyl, mergeParts, oct, sph } from './characters';
import type { Quality } from './Renderer';

export type ProjKind = 'arrow' | 'bolt' | 'spear' | 'cannonball' | 'fireball' | 'orb' | 'ice' | 'glob' | 'missile';

const GROUND = 0.2;

// ---------------------------------------------------------------- particles
class ParticleLayer {
  points: THREE.Points;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private a0: Float32Array; private grav: Float32Array; private drag: Float32Array;
  private next = 0;
  readonly n: number;
  /** live particles (debug overlay) */
  get active() { let c = 0; for (let i = 0; i < this.n; i++) if (this.life[i] > 0) c++; return c; }
  uniforms: { uScale: { value: number }; map: { value: THREE.Texture } };

  constructor(n: number, tex: THREE.Texture, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.uniforms = { uScale: { value: 600 }, map: { value: tex } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main(){ vColor = color; vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a * vAlpha < 0.01) discard; gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha); }`,
      vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, life: number, s0: number, s1: number, a0 = 1, grav = 0, drag = 0) {
    const k = this.next = (this.next + 1) % this.n;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.col[k * 3] = color.r; this.col[k * 3 + 1] = color.g; this.col[k * 3 + 2] = color.b;
    this.life[k] = this.max[k] = life; this.s0[k] = s0; this.s1[k] = s1; this.a0[k] = a0; this.grav[k] = grav; this.drag[k] = drag;
  }

  update(dt: number) {
    for (let k = 0; k < this.n; k++) {
      if (this.life[k] <= 0) { if (this.alpha[k] !== 0) { this.alpha[k] = 0; this.size[k] = 0; } continue; }
      this.life[k] -= dt;
      const t = Math.max(0, this.life[k] / this.max[k]); // 1 → 0
      const d = 1 - this.drag[k] * dt;
      this.vel[k * 3] *= d; this.vel[k * 3 + 1] = this.vel[k * 3 + 1] * d - this.grav[k] * dt; this.vel[k * 3 + 2] *= d;
      this.pos[k * 3] += this.vel[k * 3] * dt;
      this.pos[k * 3 + 1] = Math.max(GROUND + 0.03, this.pos[k * 3 + 1] + this.vel[k * 3 + 1] * dt);
      this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      this.size[k] = this.s1[k] + (this.s0[k] - this.s1[k]) * t;
      this.alpha[k] = this.a0[k] * Math.min(1, t * 2.2) * (t > 0.92 ? (1 - t) / 0.08 : 1);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------------------------------------------------------- projectiles
interface Proj {
  kind: ProjKind; mesh: THREE.Object3D; active: boolean;
  from: THREE.Vector3; to: THREE.Vector3; toId: number; t: number; dur: number; arc: number; color: THREE.Color;
  trail: number; big: number; onHit: (p: THREE.Vector3) => void;
}
const SPEED: Record<ProjKind, number> = { arrow: 19, bolt: 23, spear: 16, cannonball: 10, fireball: 12, orb: 13, ice: 17, glob: 10, missile: 14 };
const ARC: Record<ProjKind, number> = { arrow: 0.12, bolt: 0.05, spear: 0.1, cannonball: 0.45, fireball: 0.12, orb: 0.08, ice: 0.06, glob: 0.35, missile: 0 };

function projGeo(kind: ProjKind): THREE.BufferGeometry {
  const X = Math.PI / 2;
  switch (kind) {
    case 'arrow': return mergeParts([{ g: cyl(0.018, 0.018, 0.62, 4), c: 0x8a5a32, r: [X, 0, 0] }, { g: cone(0.045, 0.14, 4), c: 0xd8dde8, p: [0, 0, 0.36], r: [X, 0, 0] }, { g: box(0.12, 0.005, 0.12), c: 0xf0f0f0, p: [0, 0, -0.27], r: [0, Math.PI / 4, 0] }, { g: box(0.005, 0.12, 0.12), c: 0xf0f0f0, p: [0, 0, -0.27], r: [Math.PI / 4, 0, 0] }]);
    case 'bolt': return mergeParts([{ g: cyl(0.022, 0.022, 0.4, 4), c: 0x5a3a22, r: [X, 0, 0] }, { g: cone(0.05, 0.12, 4), c: 0xb8c0cc, p: [0, 0, 0.25], r: [X, 0, 0] }, { g: box(0.1, 0.005, 0.08), c: 0xc0302a, p: [0, 0, -0.17] }]);
    case 'spear': return mergeParts([{ g: cyl(0.025, 0.025, 1.0, 5), c: 0x7a5232, r: [X, 0, 0] }, { g: cone(0.06, 0.24, 4), c: 0xd8dde8, p: [0, 0, 0.6], r: [X, 0, 0] }]);
    case 'cannonball': return mergeParts([{ g: sph(0.17, 1), c: 0x2a2a30 }, { g: sph(0.05, 0), c: 0x6a6a74, p: [0.07, 0.08, 0.08] }]);
    case 'missile': return mergeParts([{ g: cyl(0.06, 0.06, 0.45, 6), c: 0x8a8a94, r: [X, 0, 0] }, { g: cone(0.06, 0.16, 6), c: 0xd8402a, p: [0, 0, 0.3], r: [X, 0, 0] }, { g: box(0.22, 0.01, 0.1), c: 0xd8402a, p: [0, 0, -0.2] }, { g: box(0.01, 0.22, 0.1), c: 0xd8402a, p: [0, 0, -0.2] }]);
    case 'ice': return mergeParts([{ g: oct(0.12), c: 0xbff4ff, s: [0.6, 0.6, 2.2] }]);
    case 'glob': return mergeParts([{ g: sph(0.13, 1), c: 0x8ad83a }]);
    case 'fireball': case 'orb': default: return mergeParts([{ g: sph(0.13, 1), c: 0xffffff }]);
  }
}

// ---------------------------------------------------------------- the system
interface Flash { sprite: THREE.Sprite; t: number; dur: number; size: number; active: boolean }
interface RingFx { mesh: THREE.Mesh; t: number; dur: number; r: number; active: boolean }
interface Bolt { mesh: THREE.Mesh; glow: THREE.Mesh; t: number; active: boolean }
interface Slash { mesh: THREE.Mesh; t: number; active: boolean }
interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; life: number; s: number; c: THREE.Color }
interface Decal { x: number; z: number; r: number; life: number; max: number }
interface LightFx { light: THREE.PointLight; t: number; dur: number; peak: number }

export class Fx {
  add: ParticleLayer;
  smokeL: ParticleLayer;
  private projs: Proj[] = [];
  private flashes: Flash[] = [];
  private rings: RingFx[] = [];
  private bolts: Bolt[] = [];
  private slashes: Slash[] = [];
  private debris: Debris[] = [];
  private debrisMesh: THREE.InstancedMesh;
  private decals: Decal[] = [];
  private decalMesh: THREE.InstancedMesh;
  private lights: LightFx[] = [];
  private c = new THREE.Color();
  private m4 = new THREE.Matrix4();
  private budget: number;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private quality: Quality) {
    const lite = quality === 'battery';
    this.budget = lite ? 0.4 : quality === 'medium' ? 0.75 : quality === 'ultra' ? 1.3 : 1;
    this.add = new ParticleLayer(lite ? 500 : 1400, starTexture(), true);
    this.smokeL = new ParticleLayer(lite ? 160 : 420, smokeTexture(), false);
    scene.add(this.add.points, this.smokeL.points);
    // glow sprites for fire/orb projectiles are particles; meshes carry the shapes
    const kinds: [ProjKind, number][] = [['arrow', 70], ['bolt', 40], ['spear', 24], ['cannonball', 24], ['fireball', 30], ['orb', 50], ['ice', 30], ['glob', 24], ['missile', 30]];
    for (const [kind, n] of kinds) {
      const geo = projGeo(kind);
      const glowy = kind === 'fireball' || kind === 'orb' || kind === 'ice';
      for (let i = 0; i < n; i++) {
        const mat = glowy ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        this.projs.push({ kind, mesh, active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), toId: -1, t: 0, dur: 0.3, arc: 0, color: new THREE.Color(), trail: 0, big: 1, onHit: () => {} });
      }
    }
    for (let i = 0; i < 14; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe0a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.visible = false; sprite.renderOrder = 7;
      scene.add(sprite);
      this.flashes.push({ sprite, t: 0, dur: 0.2, size: 1, active: false });
    }
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 0.4, r: 1, active: false });
    }
    for (let i = 0; i < 24; i++) {
      const mk = (op: number) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 6 * 3), 3));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        m.frustumCulled = false; m.visible = false; scene.add(m);
        return m;
      };
      this.bolts.push({ mesh: mk(1), glow: mk(0.35), t: 0, active: false });
    }
    const arc = new THREE.TorusGeometry(0.75, 0.07, 3, 18, Math.PI * 0.9).rotateX(Math.PI / 2);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(arc, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      this.slashes.push({ mesh: m, t: 0, active: false });
    }
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 220);
    this.debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3);
    this.debrisMesh.count = 0; this.debrisMesh.frustumCulled = false;
    scene.add(this.debrisMesh);
    const dtex = glowTexture();
    this.decalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dtex, color: 0x1a0e08, transparent: true, opacity: 0.55, depthWrite: false }), 24);
    this.decalMesh.count = 0; this.decalMesh.frustumCulled = false; this.decalMesh.renderOrder = 1;
    scene.add(this.decalMesh);
    if (quality === 'high' || quality === 'ultra') {
      for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xffa040, 0, 9, 1.6);
        scene.add(l);
        this.lights.push({ light: l, t: 1, dur: 1, peak: 0 });
      }
    }
  }

  setViewport(heightPx: number, fovDeg: number) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.add.uniforms.uScale.value = s;
    this.smokeL.uniforms.uScale.value = s;
  }

  private n(k: number) { return Math.max(1, Math.round(k * this.budget)); }

  // ------------------------------------------------------------ particle presets
  sparks(x: number, y: number, z: number, color: number, n: number, speed = 3, size = 0.22) {
    this.c.setHex(color);
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.add.emit(x, y, z, Math.cos(a) * speed * u, (0.3 + Math.random()) * speed * 0.8, Math.sin(a) * speed * u, this.c, 0.25 + Math.random() * 0.35, size, size * 0.2, 1, 9, 1.5);
    }
  }
  glow(x: number, y: number, z: number, color: number, size: number, life = 0.2) {
    this.c.setHex(color);
    this.add.emit(x, y, z, 0, 0, 0, this.c, life, size, size * 0.6, 0.9);
  }
  fire(x: number, y: number, z: number, n: number, spread = 0.3, scale = 1) {
    for (let i = 0, m = this.n(n); i < m; i++) {
      this.c.setHSL(0.04 + Math.random() * 0.08, 1, 0.5 + Math.random() * 0.2);
      this.add.emit(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6, this.c, 0.35 + Math.random() * 0.3, 0.45 * scale, 0.1 * scale, 1, -0.5, 1.2);
    }
  }
  smoke(x: number, y: number, z: number, n: number, size = 0.9, dark = 0.35) {
    for (let i = 0, m = this.n(n); i < m; i++) {
      const g = dark + Math.random() * 0.15;
      this.c.setRGB(g, g, g * 1.04);
      this.smokeL.emit(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.7, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.7, this.c, 1.0 + Math.random() * 0.9, size * 0.6, size * 2.2, 0.75, -0.2, 0.8);
    }
  }
  dust(x: number, z: number, n: number, size = 0.7) {
    for (let i = 0, m = this.n(n); i < m; i++) {
      const a = Math.random() * Math.PI * 2;
      this.c.setRGB(0.78, 0.66, 0.5);
      this.smokeL.emit(x, GROUND + 0.1, z, Math.cos(a) * 1.6, 0.3 + Math.random() * 0.4, Math.sin(a) * 1.6, this.c, 0.6 + Math.random() * 0.4, size * 0.5, size * 1.6, 0.6, 0, 3);
    }
  }
  rise(x: number, y: number, z: number, color: number, n: number, size = 0.18, spread = 0.5) {
    this.c.setHex(color);
    for (let i = 0, m = this.n(n); i < m; i++) this.add.emit(x + (Math.random() - 0.5) * spread, y + Math.random() * 0.4, z + (Math.random() - 0.5) * spread, 0, 0.8 + Math.random() * 0.8, 0, this.c, 0.6 + Math.random() * 0.4, size, size * 0.3, 0.9, -0.3, 0.5);
  }

  // ------------------------------------------------------------ shapes
  flash(x: number, y: number, z: number, color: number, size: number, dur = 0.18) {
    const f = this.flashes.find(q => !q.active);
    if (!f) return;
    f.active = true; f.t = 0; f.dur = dur; f.size = size;
    f.sprite.position.set(x, y, z);
    (f.sprite.material as THREE.SpriteMaterial).color.setHex(color);
    f.sprite.visible = true;
  }
  ring(x: number, z: number, r: number, color: number, dur: number) {
    const f = this.rings.find(q => !q.active);
    if (!f) return;
    f.active = true; f.t = 0; f.dur = dur; f.r = r;
    f.mesh.position.set(x, GROUND + 0.08, z);
    (f.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    f.mesh.visible = true;
  }
  slash(x: number, y: number, z: number, face: number, color: number, size = 1) {
    const s = this.slashes.find(q => !q.active);
    if (!s) return;
    s.active = true; s.t = 0;
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.set(0.25 - Math.random() * 0.5, face - Math.PI * 0.95, 0);
    s.mesh.scale.setScalar(size);
    (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    s.mesh.visible = true;
  }
  /** Camera-facing jagged lightning ribbon. */
  bolt(a: THREE.Vector3, b: THREE.Vector3, color = 0x9ffcff) {
    const bo = this.bolts.find(q => !q.active);
    if (!bo) return;
    bo.active = true; bo.t = 0.18;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 10; i++) {
      const k = i / 9, j = i && i < 9 ? 1 : 0;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * k + (Math.random() - 0.5) * 0.5 * j, a.y + (b.y - a.y) * k + (Math.random() - 0.3) * 0.4 * j, a.z + (b.z - a.z) * k + (Math.random() - 0.5) * 0.5 * j));
    }
    const cam = this.camera.position;
    const fill = (mesh: THREE.Mesh, w: number) => {
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      let o = 0;
      for (let i = 0; i < 9; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        const dir = p1.clone().sub(p0);
        const view = p0.clone().sub(cam);
        const side = dir.cross(view).normalize().multiplyScalar(w);
        const q = [p0.clone().add(side), p0.clone().sub(side), p1.clone().add(side), p1.clone().sub(side)];
        for (const v of [q[0], q[1], q[2], q[2], q[1], q[3]]) { pos.setXYZ(o++, v.x, v.y, v.z); }
      }
      pos.needsUpdate = true;
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      mesh.visible = true;
    };
    fill(bo.mesh, 0.035);
    fill(bo.glow, 0.16);
    this.sparks(b.x, b.y, b.z, color, 5, 2.5, 0.2);
    this.glow(b.x, b.y, b.z, color, 1.1, 0.15);
  }
  debrisBurst(x: number, y: number, z: number, color: number, n: number, speed = 4, size = 0.12) {
    for (let i = 0, m = this.n(n); i < m && this.debris.length < 220; i++) {
      const a = Math.random() * Math.PI * 2, u = 0.3 + Math.random() * 0.7;
      this.debris.push({ x, y, z, vx: Math.cos(a) * speed * u, vy: 2 + Math.random() * speed, vz: Math.sin(a) * speed * u, rx: Math.random() * 6, ry: Math.random() * 6, life: 1.4 + Math.random() * 0.6, s: size * (0.6 + Math.random() * 0.8), c: new THREE.Color(color).multiplyScalar(0.7 + Math.random() * 0.5) });
    }
  }
  decal(x: number, z: number, r: number) {
    if (this.decals.length >= 24) this.decals.shift();
    this.decals.push({ x, z, r, life: 5, max: 5 });
  }
  light(x: number, y: number, z: number, color: number, peak: number, dur = 0.35) {
    const l = this.lights.find(q => q.t >= q.dur) ?? this.lights[0];
    if (!l) return;
    l.t = 0; l.dur = dur; l.peak = peak;
    l.light.position.set(x, y, z);
    l.light.color.setHex(color);
  }

  /** Full explosion: flash, fireball, smoke, debris, shockwave, scorch, light. Returns a camera-shake amount. */
  explode(x: number, z: number, r: number, color = 0xff9a3a, y = GROUND + 0.4) {
    this.flash(x, y + 0.4, z, 0xfff0c0, 2.2 + r * 1.6, 0.22);
    this.fire(x, y, z, 10 + r * 8, r * 0.8, 1 + r * 0.3);
    this.sparks(x, y + 0.2, z, color, 12 + r * 6, 4 + r, 0.24);
    this.smoke(x, y + 0.2, z, 4 + r * 3, 0.8 + r * 0.3);
    this.debrisBurst(x, y, z, 0x5a4a3a, 5 + r * 3, 3 + r);
    this.ring(x, z, r * 1.2, color, 0.45);
    this.decal(x, z, 1 + r * 0.8);
    this.light(x, y + 1, z, color, 30 + r * 15, 0.45);
    return Math.min(1, 0.15 + r * 0.12);
  }

  // ------------------------------------------------------------ projectiles
  shoot(kind: ProjKind, from: THREE.Vector3, to: THREE.Vector3, toId: number, color: number, big: number, onHit: (p: THREE.Vector3) => void) {
    const p = this.projs.find(q => !q.active && q.kind === kind);
    if (!p) { onHit(to); return; }
    p.active = true; p.t = 0; p.from.copy(from); p.to.copy(to); p.toId = toId; p.big = big; p.onHit = onHit;
    const d = from.distanceTo(to);
    p.dur = Math.max(0.12, Math.min(0.9, d / SPEED[kind]));
    p.arc = ARC[kind] * d;
    p.color.setHex(color);
    p.trail = 0;
    const mat = (p.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
    if (mat.isMeshBasicMaterial) mat.color.setHex(color);
    p.mesh.scale.setScalar(big);
    p.mesh.position.copy(from);
    p.mesh.visible = true;
    // muzzle flash
    if (kind === 'cannonball') { this.flash(from.x, from.y, from.z, 0xffd080, 1.8 * big, 0.12); this.smoke(from.x, from.y, from.z, 3, 0.6); }
    else if (kind === 'fireball' || kind === 'orb' || kind === 'ice') this.glow(from.x, from.y, from.z, color, 0.9 * big, 0.15);
  }

  update(dt: number, track: (id: number) => THREE.Vector3 | null) {
    const tmp = new THREE.Vector3(), next = new THREE.Vector3();
    for (const p of this.projs) {
      if (!p.active) continue;
      p.t += dt;
      const tp = track(p.toId);
      if (tp) p.to.lerp(tp, 0.35);
      const k = Math.min(1, p.t / p.dur);
      const pos = (kk: number, out: THREE.Vector3) => out.lerpVectors(p.from, p.to, kk).setY(p.from.y + (p.to.y - p.from.y) * kk + Math.sin(kk * Math.PI) * p.arc);
      pos(k, tmp);
      pos(Math.min(1, k + 0.04), next);
      p.mesh.position.copy(tmp);
      if (next.distanceToSquared(tmp) > 1e-6) p.mesh.lookAt(next);
      // trails
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.03;
        switch (p.kind) {
          case 'fireball': this.fire(tmp.x, tmp.y, tmp.z, 2, 0.1, 0.8 * p.big); this.glow(tmp.x, tmp.y, tmp.z, 0xffa040, 1.0 * p.big, 0.08); break;
          case 'orb': this.glow(tmp.x, tmp.y, tmp.z, p.color.getHex(), 0.9 * p.big, 0.1); this.sparks(tmp.x, tmp.y, tmp.z, p.color.getHex(), 1, 0.4, 0.14); break;
          case 'ice': this.glow(tmp.x, tmp.y, tmp.z, 0x9fe8ff, 0.7, 0.1); this.sparks(tmp.x, tmp.y, tmp.z, 0xe0f8ff, 1, 0.3, 0.12); break;
          case 'cannonball': case 'missile': this.smoke(tmp.x, tmp.y, tmp.z, 1, 0.35, 0.55); if (p.kind === 'missile') this.fire(tmp.x, tmp.y, tmp.z, 1, 0.05, 0.6); break;
          case 'glob': this.sparks(tmp.x, tmp.y, tmp.z, 0x9aff4a, 1, 0.3, 0.14); break;
          case 'arrow': case 'bolt': case 'spear': if (p.big > 1.05) this.glow(tmp.x, tmp.y, tmp.z, p.color.getHex(), 0.5, 0.08); break;
        }
      }
      if (k >= 1) {
        p.active = false; p.mesh.visible = false;
        p.onHit(p.to.clone());
      }
    }
    this.add.update(dt);
    this.smokeL.update(dt);
    for (const f of this.flashes) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      f.sprite.scale.setScalar(f.size * (0.4 + 0.8 * Math.min(1, k * 2.5)));
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { f.active = false; f.sprite.visible = false; }
    }
    for (const f of this.rings) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.scale.setScalar(0.2 + f.r * (1 - Math.pow(1 - Math.min(1, k), 3)));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { f.active = false; f.mesh.visible = false; }
    }
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t -= dt;
      const o = Math.max(0, b.t / 0.18);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = o;
      (b.glow.material as THREE.MeshBasicMaterial).opacity = o * 0.35;
      if (b.t <= 0) { b.active = false; b.mesh.visible = b.glow.visible = false; }
    }
    for (const s of this.slashes) {
      if (!s.active) continue;
      s.t += dt;
      const k = s.t / 0.16;
      s.mesh.rotation.y += dt * 9;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { s.active = false; s.mesh.visible = false; }
    }
    // debris physics
    let n = 0;
    const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
    this.debris = this.debris.filter(d => {
      d.life -= dt;
      if (d.life <= 0) return false;
      d.vy -= 14 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < GROUND + d.s * 0.5) { d.y = GROUND + d.s * 0.5; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; }
      d.rx += dt * 8; d.ry += dt * 6;
      q.setFromEuler(e.set(d.rx, d.ry, 0));
      const s = d.s * Math.min(1, d.life * 2);
      this.m4.compose(tmp.set(d.x, d.y, d.z), q, sc.set(s, s, s));
      this.debrisMesh.setMatrixAt(n, this.m4);
      this.debrisMesh.setColorAt(n, d.c);
      n++;
      return true;
    });
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    let m = 0;
    this.decals = this.decals.filter(d => {
      d.life -= dt;
      if (d.life <= 0) return false;
      const s = d.r * 2;
      this.m4.compose(tmp.set(d.x, GROUND + 0.02, d.z), q.identity(), sc.set(s, 1, s));
      this.decalMesh.setMatrixAt(m++, this.m4);
      return true;
    });
    this.decalMesh.count = m;
    this.decalMesh.instanceMatrix.needsUpdate = true;
    (this.decalMesh.material as THREE.MeshBasicMaterial).opacity = 0.5;
    for (const l of this.lights) {
      if (l.t >= l.dur) { l.light.intensity = 0; continue; }
      l.t += dt;
      l.light.intensity = l.peak * Math.max(0, 1 - l.t / l.dur);
    }
  }
}
