// v0.5 visual overhaul: everything that can be checked without a GPU — every model builds (the Primordial in its
// 3 phases), faction signatures, distinct A/B branch silhouettes, a flat battlefield (grid stays readable), lane
// decor that never encroaches on the lane, and the render code never touching the simulation.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shapeDef } from '../src/render/shapes';
import { Rig } from '../src/render/characters';
import { pathGeometry, factionDecor, FACTION_LOOK } from '../src/render/terrain';
import { UNITS, FACTION_IDS, unitStats, BRANCH_LEVEL } from '../src/data/units';
import { ENEMIES } from '../src/data/enemies';
import { createGame, step, drainEvents, stateHash } from '../src/sim/game';
import type { ModelDef } from '../src/data/types';

const verts = (r: Rig) => r.slots.reduce((n, s) => n + s.geo.attributes.position.count, 0);
const finite = (g: THREE.BufferGeometry) => { const a = g.attributes.position.array as Float32Array; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

describe('v0.5 models', () => {
  it('every unit and enemy model builds, with finite geometry', () => {
    for (const id of Object.keys(UNITS)) {
      const r = new Rig(id, unitStats(id, 1, null).model, 1, null);
      expect(r.slots.length, id).toBeGreaterThan(0);
      for (const s of r.slots) expect(finite(s.geo), id).toBe(true);
    }
    for (const [id, e] of Object.entries(ENEMIES)) {
      const def = shapeDef(e.model);
      expect(def.body.length, id).toBeGreaterThan(0);
    }
  });

  it('the Primordial has its own model and evolves over its 3 phases', () => {
    const m = ENEMIES.primordial.model;
    expect(m.shape).toBe('primordial');
    const parts = [1, 2, 3].map(phase => { const d = shapeDef({ ...m, phase } as ModelDef); return d.body.length + (d.orbit?.length ?? 0); });
    expect(parts[1]).toBeGreaterThan(parts[0]);
    expect(parts[2]).toBeGreaterThan(parts[1]);
    const r3 = new Rig('primordial#3', { ...m, phase: 3 }, 1, null);
    const r1 = new Rig('primordial', m, 1, null);
    expect(verts(r3)).toBeGreaterThan(verts(r1));
  });

  it('every army marks its units with a faction signature', () => {
    for (const f of FACTION_IDS) {
      const id = Object.keys(UNITS).find(k => UNITS[k].faction === f && !UNITS[k].tower)!;
      const model = unitStats(id, 1, null).model;
      const withSig = new Rig(id, model, 1, null); // key = unit id → faction looked up
      const bare = new Rig('__no_faction_' + id, model, 1, null);
      expect(verts(withSig), f).toBeGreaterThan(verts(bare));
      expect(FACTION_LOOK[f].glow).toBeTypeOf('number');
    }
  });

  it('branches A and B look different, and levels grow', () => {
    const id = 'gardien_stellaire';
    const a = new Rig(id, unitStats(id, BRANCH_LEVEL, 'A').model, BRANCH_LEVEL, 'A');
    const b = new Rig(id, unitStats(id, BRANCH_LEVEL, 'B').model, BRANCH_LEVEL, 'B');
    expect(verts(a)).not.toBe(verts(b));
    const l1 = new Rig(id, unitStats(id, 1, null).model, 1, null);
    const l5 = new Rig(id, unitStats(id, 5, 'A').model, 5, 'A');
    expect(verts(l5)).toBeGreaterThan(verts(l1));
    expect(l5.scale).toBeGreaterThan(l1.scale);
  });
});

describe('v0.5 terrain', () => {
  it('the battlefield stays flat at ground level (readable grid), edges sink under the moss', () => {
    const g = pathGeometry(-29.5, 0, 33.6, 4.6, 1.3);
    const p = g.attributes.position;
    let minEdge = Infinity;
    for (let i = 0; i < p.count; i++) {
      const z = Math.abs(p.getZ(i)), y = p.getY(i);
      if (z <= 4.0) expect(y).toBeCloseTo(0.2, 5);
      if (z > 5.6) minEdge = Math.min(minEdge, y);
    }
    expect(minEdge).toBeLessThan(0.12);
  });

  it('faction decor never encroaches on the lane (units keep the whole battlefield)', () => {
    for (const f of FACTION_IDS) for (const sg of [-1, 1]) {
      let s = 7;
      const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
      const d = factionDecor(f, sg, 0, 13, 40, 4.6, 7.2, r);
      expect(d.parts.length + d.glow.length, f).toBeGreaterThan(0);
      for (const part of [...d.parts, ...d.glow]) {
        const z = Math.abs(part.p?.[2] ?? 0);
        expect(z, `${f} ${sg}`).toBeGreaterThan(4.6);
        expect(Math.abs(part.p?.[0] ?? 0)).toBeGreaterThan(12);
      }
    }
  });
});

describe('v0.5 does not touch the simulation', () => {
  it('building every rig leaves the game state hash unchanged', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: 'astreens' }, { name: 'B', faction: 'rouages' }] }, 99);
    for (let i = 0; i < 40; i++) { step(s); drainEvents(s); }
    const h = stateHash(s);
    for (const id of Object.keys(UNITS)) new Rig(id, unitStats(id, 3, null).model, 3, null);
    for (const ph of [1, 2, 3]) new Rig('primordial#' + ph, { ...ENEMIES.primordial.model, phase: ph }, 1, null);
    expect(stateHash(s)).toBe(h);
  });
});
