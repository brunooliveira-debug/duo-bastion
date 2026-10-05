import { describe, it, expect } from 'vitest';
import { createGame, applyCommand, step, drainEvents, workerCost } from '../src/sim/game';
import type { GameState } from '../src/sim/state';

function game(mode: 'vsai' | 'survival' = 'vsai'): GameState {
  return createGame({ mode, totalWaves: mode === 'vsai' ? 10 : 9999, difficulty: 'normal', humans: [{ name: 'A' }, { name: 'B' }] }, 42);
}

describe('economy & commands', () => {
  it('starts with the right resources and a valid draft', () => {
    const s = game();
    expect(s.players).toHaveLength(4);
    expect(s.players[0].gold).toBe(250);
    expect(s.players[0].draft).toHaveLength(6);
  });
  it('build costs gold, refuses occupied cells and unaffordable units', () => {
    const s = game();
    const p = s.players[0];
    const id = p.draft[0];
    expect(applyCommand(s, 0, { c: 'build', unit: id, col: 0, row: 0 })).toBeNull();
    expect(p.gold).toBeLessThan(250);
    expect(applyCommand(s, 0, { c: 'build', unit: id, col: 0, row: 0 })).toMatch(/occupée/);
    expect(applyCommand(s, 0, { c: 'build', unit: id, col: 99, row: 0 })).toMatch(/occupée/);
    p.gold = 0;
    expect(applyCommand(s, 0, { c: 'build', unit: id, col: 1, row: 0 })).toMatch(/or/);
  });
  it('sell refunds fully on the same wave', () => {
    const s = game();
    const p = s.players[0];
    applyCommand(s, 0, { c: 'build', unit: p.draft[0], col: 0, row: 0 });
    applyCommand(s, 0, { c: 'sell', bid: p.builds[0].bid });
    expect(p.gold).toBe(250);
  });
  it('workers cost gold and produce ether over time', () => {
    const s = game();
    const p = s.players[0];
    const c = workerCost(p);
    expect(applyCommand(s, 0, { c: 'worker' })).toBeNull();
    expect(p.gold).toBe(250 - c);
    expect(p.workers).toBe(2);
    for (let i = 0; i < 200; i++) step(s); // 10 s
    expect(p.ether).toBeGreaterThan(1.9);
  });
  it('raiders spend ether and raise income; core upgrades are shared', () => {
    const s = game();
    const p = s.players[0];
    p.ether = 100;
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur' })).toBeNull();
    expect(p.income).toBe(33);
    expect(applyCommand(s, 0, { c: 'raider', raider: 'behemoth' })).toMatch(/vague 7/);
    expect(applyCommand(s, 0, { c: 'core', up: 'atk' })).toBeNull();
    expect(s.teams[0].core.up.atk).toBe(1);
  });
  it('survival mode has no raiders but allows investing', () => {
    const s = game('survival');
    s.players[0].ether = 50;
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur' })).toMatch(/adversaire/);
    expect(applyCommand(s, 0, { c: 'invest' })).toBeNull();
    expect(s.players[0].income).toBe(34);
  });
  it('a full all-AI game ends with a result', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 10, difficulty: 'normal', humans: [] }, 7);
    let n = 0;
    while (s.phase !== 'ended' && n++ < 20 * 60 * 40) { step(s); drainEvents(s); }
    expect(s.result).not.toBeNull();
  });
  it('undefended lanes leak and damage the Core', () => {
    const s = game();
    for (const p of s.players) p.ready = true;
    let n = 0;
    while (s.phase !== 'resolution' && s.phase !== 'ended' && n++ < 20 * 120) step(s);
    expect(s.teams[0].core.hp).toBeLessThan(2500);
    expect(s.players[0].stats.leaks).toBeGreaterThan(0);
  });
});
