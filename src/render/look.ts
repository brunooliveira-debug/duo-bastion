// "Look" of DUO BASTION v0.5 — cinematic fantasy rendering on top of plain Three.js:
//  • post-processing: HDR scene → bloom (emissive crystals, magic, lava) → ACES tonemapping → colour grade + vignette;
//  • a procedural dusk environment map (PMREM) so gold, steel and crystals catch light;
//  • a physically based material whose metalness / roughness come from a per-vertex attribute (aPbr),
//    filled automatically from each part's colour (gold, steel, iron → metal; cloth, stone, skin → matte);
//  • quality levels: ÉLEVÉ (bloom + MSAA + shadows), MOYEN (bloom, lighter), BAS (no post-processing).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { Quality } from './Renderer';

// ---------------------------------------------------------------- material classes from colour

const hsl = { h: 0, s: 0, l: 0 };
const tmpC = new THREE.Color();
/** [metalness, roughness] guessed from a part colour: gold / brass, steel, dark iron are metals; the rest is matte. */
export function pbrOf(color: number, matte = false): [number, number] {
  tmpC.setHex(color).getHSL(hsl);
  const hue = hsl.h * 360;
  if (matte) return hue >= 32 && hue <= 58 && hsl.s > 0.45 && hsl.l > 0.38 && hsl.l < 0.78 ? [1, 0.3] : [0, 0.86]; // scenery: only gold is metal
  if (hue >= 32 && hue <= 58 && hsl.s > 0.45 && hsl.l > 0.38 && hsl.l < 0.78) return [1, 0.28]; // gold / brass / bronze
  if (hsl.s < 0.16 && hsl.l > 0.55 && hsl.l < 0.93) return [0.85, 0.32]; // steel / silver
  if (hsl.s < 0.18 && hsl.l > 0.16 && hsl.l <= 0.55) return [0.55, 0.5]; // dark iron / slate
  if (hue >= 18 && hue < 32 && hsl.s > 0.4 && hsl.l > 0.3 && hsl.l < 0.6) return [0.7, 0.38]; // copper
  return [0, 0.78]; // cloth, leather, skin, stone, wood, foliage
}

/** Adds the per-vertex PBR attribute to a coloured geometry (all vertices of a part share it). */
export function setPbr(g: THREE.BufferGeometry, color: number, override?: [number, number], matte = false) {
  const [m, r] = override ?? pbrOf(color, matte);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { arr[i * 2] = m; arr[i * 2 + 1] = r; }
  g.setAttribute('aPbr', new THREE.BufferAttribute(arr, 2));
  return g;
}

/**
 * Lit material of characters, towers and props: MeshStandardMaterial driven by vertex colours and the aPbr attribute,
 * with a soft cold rim light (silhouettes read against dark backgrounds) and optional flat shading.
 */
// The dusk IBL is applied only to materials that need reflections (units, the Bastion, gold, water). Sampling the
// PMREM on every pixel of the ground / path / rocks cost ~5 ms per frame on an integrated GPU (measured with a GPU
// timer query): the big surfaces get their ambient from the hemisphere light instead, which is nearly free.
let sharedEnv: THREE.Texture | null = null;
const pendingEnv: THREE.MeshStandardMaterial[] = [];
export function reflective<T extends THREE.Material>(m: T): T {
  if (!(m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;
  const s = m as unknown as THREE.MeshStandardMaterial;
  if (sharedEnv) s.envMap = sharedEnv; else pendingEnv.push(s);
  return m;
}
export function sharedEnvMap() { return sharedEnv; }

/**
 * Material tiers (measured with a GPU timer on an Intel UHD at 720p):
 *  ÉLEVÉ: PBR everywhere · MOYEN: PBR + reflections on the heroes (units, Bastion, gold, water), cheap Lambert on the
 *  big surfaces (ground, path, rocks, ruins, trees) · BAS: Lambert everywhere (same colours and rim light).
 */
let tier: 'pbr' | 'mid' | 'low' = 'pbr';
export function setMaterialTier(q: Quality) { tier = q === 'battery' ? 'low' : q === 'medium' ? 'mid' : 'pbr'; }
export function isLowTier() { return tier === 'low'; }
/** Standard (PBR) or Lambert depending on the tier. hero = keeps PBR on MOYEN (small, shiny things: water, gold). */
export function surfaceMaterial(p: THREE.MeshStandardMaterialParameters, hero = false): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
  if (tier === 'pbr' || (tier === 'mid' && hero)) return new THREE.MeshStandardMaterial(p);
  const { roughness: _r, metalness: _m, envMapIntensity: _e, normalScale: _n, ...rest } = p;
  return new THREE.MeshLambertMaterial(rest as THREE.MeshLambertMaterialParameters);
}

export type LitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
export function litMaterial(opts: { flat?: boolean; transparent?: boolean; opacity?: number; rim?: number; reflect?: boolean } = {}): LitMaterial {
  const rim = opts.rim ?? 0.28;
  if (tier === 'low' || (tier === 'mid' && !opts.reflect)) {
    const l = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: opts.flat ?? true, transparent: opts.transparent, opacity: opts.opacity ?? 1 });
    l.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rimF = 1.0 - max(0.0, dot(normalize(vViewPosition), normal));
        gl_FragColor.rgb += vec3(0.55, 0.72, 1.0) * pow(rimF, 3.0) * ${rim.toFixed(2)};`);
    };
    l.customProgramCacheKey = () => `lam-rim-${rim}`;
    return l;
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: opts.flat ?? true, metalness: 1, roughness: 1, transparent: opts.transparent, opacity: opts.opacity ?? 1, envMapIntensity: 0.85 });
  if (opts.reflect) reflective(m);
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aPbr;\nvarying vec2 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = aPbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPbr;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vPbr.x;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * max(0.08, vPbr.y);')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rimF = 1.0 - max(0.0, dot(normalize(vViewPosition), normal));
        gl_FragColor.rgb += vec3(0.55, 0.72, 1.0) * pow(rimF, 3.0) * ${rim.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => `lit-rim-${rim}`;
  return m;
}

// ---------------------------------------------------------------- procedural environment (reflections)

/** Small dusk "studio": dark teal sky, warm horizon band, cold top light, a few warm and cyan light panels. */
export function buildEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float y = vP.y;
      vec3 top = vec3(0.025, 0.04, 0.1); vec3 hor = vec3(0.42, 0.22, 0.14); vec3 bot = vec3(0.012, 0.012, 0.02);
      vec3 c = y > 0.0 ? mix(hor, top, pow(min(1.0, y * 1.8), 0.6)) : mix(hor * 0.4, bot, min(1.0, -y * 4.0));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);
  const panel = (color: number, intensity: number, x: number, y: number, z: number, s: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.lookAt(0, 0, 0); scene.add(p);
  };
  panel(0xffc890, 3.2, -30, 18, 20, 16); // warm key
  panel(0x7ac8ff, 2.6, 28, 22, -24, 14); // cold rim
  panel(0xb0c4ff, 0.9, 0, 40, 0, 20); // top
  panel(0x9a6aff, 1.2, 10, 4, 34, 10); // magic bounce
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.02).texture;
  pm.dispose();
  const envTex = tex;
  sharedEnv = envTex;
  for (const m of pendingEnv.splice(0)) { m.envMap = envTex; m.needsUpdate = true; }
  return envTex;
}

// ---------------------------------------------------------------- post-processing

/**
 * Final pass: ACES filmic tone mapping + sRGB encoding + colour grade (teal shadows / warm highlights, contrast,
 * saturation, vignette, Résonance tint / flash) in ONE full-screen pass — one pass fewer than OutputPass + grade.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tBloom: { value: null as THREE.Texture | null },
    uBloom: { value: 0 },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uFxaa: { value: 1 },
    uExposure: { value: 1.1 },
    uContrast: { value: 1.12 },
    uSaturation: { value: 1.14 },
    uShadow: { value: new THREE.Vector3(0.0, 0.035, 0.07) }, // added to shadows (teal)
    uHighlight: { value: new THREE.Vector3(0.05, 0.022, -0.02) }, // added to highlights (warm)
    uVignette: { value: 0.42 },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, // global light tint (Résonance, boss)
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uBloom; uniform vec2 uTexel; uniform float uFxaa; uniform float uExposure; uniform float uContrast; uniform float uSaturation; uniform vec3 uShadow; uniform vec3 uHighlight;
    uniform float uVignette; uniform vec3 uTint; uniform float uFlash; uniform vec3 uFlashColor; varying vec2 vUv;
    vec3 rrtOdt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= uExposure / 0.6; c = OUT * rrtOdt(IN * c); return clamp(c, 0.0, 1.0);
    }
    // FXAA (Lottes, console variant) on the HDR buffer: luma compressed for the edge test. 9 fetches, replaces MSAA
    float L(vec3 c){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
    vec3 T(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
    vec3 fxaa(vec2 uv){
      vec3 cNW = T(uv + vec2(-1.0, -1.0) * uTexel), cNE = T(uv + vec2(1.0, -1.0) * uTexel), cSW = T(uv + vec2(-1.0, 1.0) * uTexel), cSE = T(uv + vec2(1.0, 1.0) * uTexel), cM = T(uv);
      float lNW = L(cNW), lNE = L(cNE), lSW = L(cSW), lSE = L(cSE), lM = L(cM);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.0312, lMax * 0.125)) return cM;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), vec2(-8.0), vec2(8.0)) * uTexel;
      vec3 a = 0.5 * (T(uv + dir * (1.0 / 3.0 - 0.5)) + T(uv + dir * (2.0 / 3.0 - 0.5)));
      vec3 b = a * 0.5 + 0.25 * (T(uv - dir * 0.5) + T(uv + dir * 0.5));
      float lB = L(b);
      return (lB < lMin || lB > lMax) ? a : b;
    }
    vec3 srgb(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
    void main(){
      vec3 base = uFxaa > 0.5 ? fxaa(vUv) : T(vUv);
      vec3 hdr = base + texture2D(tBloom, vUv).rgb * uBloom;
      vec3 c = srgb(aces(hdr));
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c += uShadow * (1.0 - smoothstep(0.0, 0.5, l)) + uHighlight * smoothstep(0.45, 1.0, l);
      c = (c - 0.5) * uContrast + 0.5;
      float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(g), c, uSaturation);
      c *= uTint;
      vec2 d = vUv - 0.5; d.x *= 1.25;
      c *= 1.0 - uVignette * smoothstep(0.32, 0.95, length(d));
      c = mix(c, uFlashColor, uFlash);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export interface Look {
  render(): void;
  setSize(w: number, h: number): void;
  /** brief full-screen light change (Résonance, boss): tint multiplies the image, flash mixes a colour in */
  setTint(r: number, g: number, b: number): void;
  setFlash(k: number, color?: THREE.Color): void;
  bloom: UnrealBloomPass | null;
  composer?: EffectComposer;
  enabled: boolean;
}

export function createLook(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: Quality): Look {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = quality === 'battery' ? 1.25 : 1.1;
  const tint = new THREE.Vector3(1, 1, 1);
  if (quality === 'battery') {
    // BAS: no post-processing at all (tone mapping happens in the materials)
    return { render: () => renderer.render(scene, camera), setSize: () => {}, setTint: () => {}, setFlash: () => {}, bloom: null, enabled: false };
  }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // no MSAA on the HDR buffer: measured with a GPU timer, 2x MSAA cost 4-7 ms per frame on an Intel UHD at 720p.
  // Edges are smoothed by the FXAA of the final pass instead (a few texture reads).
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), quality === 'high' ? 0.72 : 0.6, 0.45, 0.95);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const u = grade.uniforms as typeof GradeShader.uniforms;
  u.uExposure.value = renderer.toneMappingExposure;
  // the bloom is added in the final pass (texture lookup) instead of UnrealBloomPass's own full-screen additive blend
  // into the (multisampled) HDR buffer: one full-screen pass + one MSAA resolve fewer
  bloom.blendMaterial.visible = false;
  u.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
  u.uBloom.value = 1;
  return {
    render: () => composer.render(),
    setSize: (w, h) => {
      const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      u.uTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
      // the bloom chain runs on a reduced buffer: UnrealBloomPass ignores .resolution after construction and
      // sizes its first mip at half of what setSize gets, so we hand it a smaller size (first mip at 1/4 on ÉLEVÉ,
      // 1/6 on MOYEN of the screen): same soft glow, a fraction of the fill cost
      const k = quality === 'high' ? 0.5 : 0.34;
      bloom.setSize(Math.max(64, Math.round(w * pr * k)), Math.max(64, Math.round(h * pr * k)));
    },
    setTint: (r, g, b) => { tint.set(r, g, b); u.uTint.value.copy(tint); },
    setFlash: (k, color) => { u.uFlash.value = k; if (color) u.uFlashColor.value.set(color.r, color.g, color.b); },
    bloom,
    composer,
    enabled: true,
  };
}

// ---------------------------------------------------------------- debug performance overlay

export class PerfOverlay {
  el: HTMLDivElement;
  private frames = 0;
  private acc = 0;
  private fps = 0;
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'perf';
    document.body.append(this.el);
  }
  update(dt: number, renderer: THREE.WebGLRenderer, scene: THREE.Scene, particles: () => number) {
    this.frames++; this.acc += dt;
    if (this.acc < 0.5) return;
    this.fps = this.frames / this.acc; this.frames = 0; this.acc = 0;
    let lights = 0;
    scene.traverse(o => { if ((o as THREE.Light).isLight && o.visible) lights++; });
    const i = renderer.info;
    this.el.textContent = `${this.fps.toFixed(0)} FPS · ${i.render.calls} draw · ${(i.render.triangles / 1000).toFixed(0)}k tri · ${i.memory.textures} tex · ${i.memory.geometries} geo · ${lights} lum · ${particles()} part`;
  }
  dispose() { this.el.remove(); }
}
