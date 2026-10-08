// Built-in benchmark (?bench): a fixed, busy scene (seed 777, an upgraded army, the Reine-Essaim wave with its swarm),
// a 20 s camera path, then a report: average FPS, 1 % low, frame time, GPU time (timer query when the browser exposes
// it), JS time per frame, render resolution and the dynamic-resolution scale. Lets anyone check 144 FPS on their PC.
import type { Session } from './net/Session';
import type { Renderer } from './render/Renderer';
import { gpuName } from './render/gpu';
import { VERSION } from './config';

/** called by the main loop around each frame while a benchmark runs */
export const benchHooks: { pre: ((dt: number) => void) | null; post: ((dt: number, jsMs: number) => void) | null } = { pre: null, post: null };

const DURATION = 20; // seconds measured
const WARMUP = 2.5;

interface Q { begin(): void; end(): void; poll(): void; samples: number[] }
function gpuTimer(gl: WebGL2RenderingContext): Q | null {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  if (!ext) return null;
  const pending: WebGLQuery[] = [];
  const samples: number[] = [];
  let cur: WebGLQuery | null = null;
  return {
    samples,
    begin() { cur = gl.createQuery(); if (cur) gl.beginQuery(ext.TIME_ELAPSED_EXT, cur); },
    end() { if (cur) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(cur); cur = null; } },
    poll() {
      for (let i = pending.length - 1; i >= 0; i--) {
        const q = pending[i];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
        pending.splice(i, 1);
      }
    },
  };
}

const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

export function runBenchmark(getSession: () => Session | null, getRenderer: () => Renderer | null, quality: string, back: () => void) {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  const banner = document.createElement('div');
  banner.className = 'bench';
  banner.textContent = 'Test de performance : préparation de la scène…';
  document.body.append(banner);
  (async () => {
    await wait(1200);
    const S = getSession(), R = getRenderer();
    if (!S || !R || !S.state) { banner.textContent = 'Test impossible (partie non créée).'; return; }
    const s = S.state, p = s.players[S.myPid];
    // a busy, reproducible scene: 8 units (3 upgraded, branches A / B), 3 modules, then the swarm-queen wave
    for (let i = 0; i < 10; i++) S.send({ c: 'debug', action: 'gold' });
    await wait(150);
    const d = p.draft;
    const cells: [number, number][] = [[1, 2], [1, 4], [2, 3], [7, 2], [7, 4], [4, 3], [9, 3], [10, 1]];
    const ids = [d[0], d[0], d[1], d[2], d[2], d[4], d[3], d[5]];
    cells.forEach(([col, row], i) => S.send({ c: 'build', unit: ids[i], col, row }));
    await wait(200);
    for (const b of p.builds.slice(0, 3)) { S.send({ c: 'upgrade', bid: b.bid }); S.send({ c: 'upgrade', bid: b.bid }); }
    await wait(150);
    { const b = p.builds; if (b[0]) S.send({ c: 'upgrade', bid: b[0].bid, branch: 'A' }); if (b[1]) S.send({ c: 'upgrade', bid: b[1].bid, branch: 'B' }); }
    s.teams[p.team].modules = [{ id: 'canon', lv: 3 }, { id: 'egide', lv: 2 }, { id: 'cadence', lv: 2 }];
    for (let i = 0; i < 14; i++) S.send({ c: 'debug', action: 'wave' }); // → wave 15: La Reine-Essaim + 16 moucherons
    await wait(400);
    banner.textContent = 'Test de performance en cours… (20 s)';
    const gl = R.renderer.getContext() as WebGL2RenderingContext;
    const gt = gpuTimer(gl);
    const frames: number[] = [], js: number[] = [], scales: number[] = [];
    let t = 0;
    const team = p.team;
    const done = new Promise<void>(resolve => {
      benchHooks.pre = dt => {
        t += dt;
        // camera path: lane → Bastion → the other lane, slow orbit
        const k = Math.min(1, t / (DURATION + WARMUP));
        const ang = -0.6 + k * 1.2;
        R.target.set(Math.sin(k * Math.PI * 2) * 20, 1.2 + Math.sin(k * Math.PI) * 2, team * 34 + Math.cos(k * Math.PI * 4) * 1.5);
        R.dist = 30 - Math.sin(k * Math.PI) * 8;
        R.yaw = ang;
        if (t > WARMUP) gt?.begin();
      };
      benchHooks.post = (dt, jsMs) => {
        if (t > WARMUP) {
          gt?.end(); gt?.poll();
          frames.push(dt * 1000); js.push(jsMs); scales.push(R.gov?.scale ?? 1);
        }
        if (t > DURATION + WARMUP) { benchHooks.pre = benchHooks.post = null; resolve(); }
      };
    });
    await done;
    await wait(300); gt?.poll();
    const total = frames.reduce((a, b) => a + b, 0) / 1000;
    const avg = frames.length / total;
    const low1 = 1000 / pct(frames, 0.99);
    const c = R.renderer.domElement;
    const res = {
      version: VERSION, quality, gpu: gpuName() || 'inconnu',
      fps: avg, low1, frameMs: pct(frames, 0.5), gpuMs: gt && gt.samples.length ? pct(gt.samples, 0.5) : null, jsMs: pct(js, 0.5),
      width: c.width, height: c.height, scale: scales.reduce((a, b) => a + b, 0) / Math.max(1, scales.length), target: R.gov?.targetFps ?? null,
      calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles, ents: s.ents.length,
    };
    const lines = [
      `DUO BASTION v${res.version} — test de performance`,
      `Qualité : ${res.quality.toUpperCase()} · GPU : ${res.gpu}`,
      `FPS moyen : ${res.fps.toFixed(0)} · 1 % bas : ${res.low1.toFixed(0)}${res.target ? ` · écran : ${res.target} Hz` : ''}`,
      `Image : ${res.frameMs.toFixed(2)} ms · GPU : ${res.gpuMs !== null ? res.gpuMs.toFixed(2) + ' ms' : 'n/d'} · JS : ${res.jsMs.toFixed(2)} ms`,
      `Rendu : ${res.width}×${res.height} · résolution dynamique : ${Math.round(res.scale * 100)} %`,
      `Scène : ${res.ents} entités · ${res.calls} appels de dessin · ${(res.tris / 1000).toFixed(0)} k triangles`,
    ];
    banner.remove();
    const box = document.createElement('div');
    box.className = 'bench result';
    const pre = document.createElement('pre');
    pre.textContent = lines.join('\n');
    const copy = document.createElement('button');
    copy.className = 'btn small'; copy.textContent = '📋 Copier';
    copy.onclick = () => { navigator.clipboard?.writeText(lines.join('\n')).then(() => (copy.textContent = '✔ Copié'), () => {}); };
    const ok = document.createElement('button');
    ok.className = 'btn small primary'; ok.textContent = 'Menu';
    ok.onclick = () => { box.remove(); back(); };
    const row = document.createElement('div'); row.className = 'row'; row.append(copy, ok);
    box.append(pre, row);
    document.body.append(box);
    (window as unknown as { __bench: unknown }).__bench = res;
  })();
}
