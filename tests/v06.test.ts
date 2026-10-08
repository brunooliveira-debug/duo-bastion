// v0.6 ULTRA: dynamic resolution (holds the screen refresh rate), dedicated-GPU detection, and the bridge
// regression (z-fighting between the bridge deck and the flagstones).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FrameGovernor, snapRefresh } from '../src/render/governor';
import { isDedicatedGpu } from '../src/render/gpu';
import { pathGeometry, stoneBridge } from '../src/render/terrain';
import type { Part } from '../src/render/characters';

const feed = (g: FrameGovernor, ms: number[] | number, count: number) => {
  let changed = 0;
  for (let i = 0; i < count; i++) if (g.tick(Array.isArray(ms) ? ms[i % ms.length] : ms)) changed++;
  return changed;
};

describe('dynamic resolution', () => {
  it('learns a 144 Hz screen and keeps full resolution when frames keep up', () => {
    const g = new FrameGovernor(0.6, 1);
    expect(feed(g, 1000 / 144, 900)).toBe(0);
    expect(g.targetFps).toBe(144);
    expect(g.scale).toBe(1);
  });

  it('drops the resolution when frames miss the refresh, then climbs back with headroom', () => {
    const g = new FrameGovernor(0.6, 1);
    feed(g, 1000 / 144, 300);
    feed(g, [1000 / 144, 2000 / 144, 2000 / 144], 600); // half the frames miss the 144 Hz vsync
    expect(g.targetFps).toBe(144);
    expect(g.scale).toBeLessThan(1);
    expect(g.scale).toBeGreaterThanOrEqual(0.6);
    const low = g.scale;
    feed(g, 1000 / 144, 144 * 12); // 12 s of perfect frames
    expect(g.scale).toBeGreaterThan(low);
  });

  it('ignores background-tab hitches and snaps to common refresh rates', () => {
    const g = new FrameGovernor();
    expect(feed(g, 500, 50)).toBe(0);
    expect(Math.round(1000 / snapRefresh(16.9))).toBe(60);
    expect(Math.round(1000 / snapRefresh(6.8))).toBe(144);
    expect(Math.round(1000 / snapRefresh(8.4))).toBe(120);
  });
});

describe('GPU detection (ULTRA by default on dedicated cards)', () => {
  it('recognises NVIDIA / AMD / Arc cards and leaves integrated GPUs alone', () => {
    for (const n of ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti (0x00002489) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'NVIDIA GeForce GTX 1660 SUPER/PCIe/SSE2', 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'])
      expect(isDedicatedGpu(n), n).toBe(true);
    for (const n of ['ANGLE (Intel, Intel(R) UHD Graphics (0x0000A7A8) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Apple GPU', 'Adreno (TM) 740', 'Mali-G78', ''])
      expect(isDedicatedGpu(n), n).toBe(false);
  });
});

describe('bridge (regression: z-fighting)', () => {
  it('the deck sits below the flagstones and the flagstones fold under the deck', () => {
    const parts: Part[] = [];
    stoneBridge(parts, [], 11.75, 0, 3.9, 8.8);
    const deck = parts[0].g.clone();
    deck.translate(...(parts[0].p as [number, number, number]));
    deck.computeBoundingBox();
    expect(deck.boundingBox!.max.y).toBeLessThan(0.2 - 0.03);
    const path = pathGeometry(11.65, 0, 2.7, 4.0, 1, 1 / 3, 0.2, 4.25);
    const p = path.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) expect(Math.abs(p.getZ(i))).toBeLessThanOrEqual(4.25 + 1e-6);
  });
});
