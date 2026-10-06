import { describe, it, expect } from 'vitest';
import { createGame, applyCommand, step, drainEvents, workerCost } from '../src/sim/game';
import { UNITS, FACTIONS, FACTION_IDS, unitStats, upgradeCost, unitValueAt } from '../src/data/units';
import { RAIDERS, raiderPrice, sendCap, ECONOMY } from '../src/data/economy';
import { buildBonuses } from '../src/sim/synergy';
import type { GameState } from '../src/sim/state';

function game(mode: 'vsai' | 'survival' | 'duel' = 'vsai', factions: string[] = ['rouages', 'astreens']): GameState {
  return createGame({ mode, totalWaves: mode === 'survival' ? 9999 : 10, difficulty: 'normal', humans: [{ name: 'A', faction: factions[0] as never }, { name: 'B', faction: factions[1] as never }] }, 42);
}
function runUntil(s: GameState, pred: () => boolean, max = 20 * 200) { let n = 0; while (!pred() && n++ < max) { step(s); drainEvents(s); } }

describe('armies (factions)', () => {
  it('six armies of six units, every unit has two specialisations', () => {
    expect(FACTION_IDS).toHaveLength(6);
    for (const f of FACTION_IDS) {
      expect(FACTIONS[f].units).toHaveLength(6);
      for (const id of FACTIONS[f].units) { expect(UNITS[id].faction).toBe(f); expect(UNITS[id].branches).toHaveLength(2); }
    }
  });
  it('players get their chosen roster; random gives a bonus', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 10, difficulty: 'normal', humans: [{ name: 'A', faction: 'ronces' }, { name: 'B', faction: 'random' }] }, 3);
    expect(s.players[0].draft).toEqual(FACTIONS.ronces.units);
    expect(s.players[0].gold).toBe(ECONOMY.startGold);
    expect(s.players[1].randomFaction).toBe(true);
    expect(s.players[1].gold).toBe(ECONOMY.startGold + ECONOMY.randomFactionGold);
    expect(s.players[1].faction).not.toBe('ronces');
  });
  it('cannot build a unit from another army (anti-cheat)', () => {
    const s = game();
    expect(applyCommand(s, 0, { c: 'build', unit: 'tireuse_etoile', col: 0, row: 0 })).toMatch(/indisponible/);
  });
});

describe('economy & commands', () => {
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
});

describe('levels, specialisations and fusion', () => {
  it('levels 1→5 with a permanent branch choice at level 4', () => {
    const s = game();
    const p = s.players[0];
    p.gold = 5000;
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 2, row: 3 });
    const b = p.builds[0];
    expect(applyCommand(s, 0, { c: 'upgrade', bid: b.bid })).toBeNull();
    expect(applyCommand(s, 0, { c: 'upgrade', bid: b.bid })).toBeNull();
    expect(b.level).toBe(3);
    expect(applyCommand(s, 0, { c: 'upgrade', bid: b.bid })).toMatch(/spécialisation/);
    expect(applyCommand(s, 0, { c: 'upgrade', bid: b.bid, branch: 'A' })).toBeNull();
    expect(b.branch).toBe('A');
    expect(applyCommand(s, 0, { c: 'upgrade', bid: b.bid, branch: 'B' })).toBeNull();
    expect(b.branch).toBe('A'); // permanent
    expect(b.level).toBe(5);
    expect(applyCommand(s, 0, { c: 'upgrade', bid: b.bid })).toMatch(/maximum/);
    expect(b.value).toBe(unitValueAt('ferraille', 5));
    const l1 = unitStats('ferraille', 1), l5 = unitStats('ferraille', 5, 'A');
    expect(l5.hp).toBeGreaterThan(l1.hp * 4);
    expect(l5.name).toBe(UNITS.ferraille.branches![0].name);
  });
  it('fusing two identical units levels up, frees a cell and refunds the extra value', () => {
    const s = game();
    const p = s.players[0];
    p.gold = 1000;
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 2, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 3, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'foreuse', col: 4, row: 3 });
    const [a, b, c] = p.builds;
    expect(applyCommand(s, 0, { c: 'fuse', bid: a.bid, with: c.bid })).toMatch(/identiques/);
    const gold = p.gold;
    expect(applyCommand(s, 0, { c: 'fuse', bid: a.bid, with: b.bid })).toBeNull();
    expect(p.builds).toHaveLength(2);
    expect(a.level).toBe(2);
    expect(p.gold).toBe(gold + UNITS.ferraille.cost * 2 - unitValueAt('ferraille', 2));
    expect(drainEvents(s).some(e => e.t === 'fuse')).toBe(true);
  });
});

describe('sends & curses (anti-spam)', () => {
  it('sends spend ether, raise income, get pricier and are capped per wave', () => {
    const s = game();
    const p = s.players[0];
    p.ether = 500;
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur' })).toBeNull();
    expect(p.income).toBe(33);
    const second = raiderPrice(RAIDERS[0], 1);
    expect(second.ether).toBe(13);
    const before = p.ether;
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur' })).toBeNull();
    expect(before - p.ether).toBe(13);
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur' })).toMatch(/Limite/); // cap 2 at wave 1
    expect(sendCap(1)).toBe(2);
    expect(applyCommand(s, 0, { c: 'raider', raider: 'behemoth' })).toMatch(/vague 7/);
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur', to: 1 })).toMatch(/Cible/); // own partner
  });
  it('sends spawn on the targeted opposing lane', () => {
    const s = game();
    s.players[0].ether = 100;
    applyCommand(s, 0, { c: 'raider', raider: 'grignoteur', to: 3 });
    for (const p of s.players) p.ready = true;
    step(s);
    expect(s.ents.some(e => e.enemy && e.raider && e.owner === 3)).toBe(true);
  });
  it('curses: one per wave, unlocked later, applied to the target', () => {
    const s = game();
    const p = s.players[0];
    p.ether = 500;
    expect(applyCommand(s, 0, { c: 'curse', curse: 'vitalite' })).toMatch(/vague/);
    s.wave = 5;
    expect(applyCommand(s, 0, { c: 'curse', curse: 'vitalite' })).toBeNull();
    expect(applyCommand(s, 0, { c: 'curse', curse: 'hate' })).toMatch(/Une seule/);
  });
  it('survival mode has no opponents but allows investing', () => {
    const s = game('survival');
    s.players[0].ether = 50;
    expect(applyCommand(s, 0, { c: 'raider', raider: 'grignoteur' })).toMatch(/adversaire/);
    expect(applyCommand(s, 0, { c: 'invest' })).toBeNull();
    expect(s.players[0].income).toBe(34);
  });
});

describe('placement, synergies and powers', () => {
  it('adjacent units create synergies; zones and runes are reported', () => {
    const s = game();
    const p = s.players[0];
    p.gold = 1000; p.runes = [{ col: 9, row: 3, kind: 'force' }];
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 2, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'mecanicienne', col: 3, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'bombardiere', col: 9, row: 3 });
    const bb = buildBonuses(p.builds, p.runes);
    expect(bb.get(p.builds[0].bid)!.syn).toContain('reparation');
    expect(bb.get(p.builds[0].bid)!.zoneActive).toBe(true);
    expect(bb.get(p.builds[2].bid)!.rune).toBe('force');
    expect(bb.get(p.builds[2].bid)!.zone).toBe('back');
  });
  it('commander powers only in combat, with a cooldown', () => {
    const s = game();
    expect(applyCommand(s, 0, { c: 'cast', slot: 0 })).toMatch(/combat/);
    for (const p of s.players) p.ready = true;
    step(s);
    expect(s.phase).toBe('combat');
    expect(applyCommand(s, 0, { c: 'cast', slot: 0 })).toBeNull();
    expect(applyCommand(s, 0, { c: 'cast', slot: 0 })).toMatch(/prêt/);
    expect(applyCommand(s, 0, { c: 'cast', slot: 2 })).toMatch(/Débloqué/);
  });
  it('"launch now": the wave starts as soon as every human is ready', () => {
    const s = game();
    expect(s.timer).toBeGreaterThan(50);
    applyCommand(s, 0, { c: 'ready', value: true });
    step(s);
    expect(s.phase).toBe('build');
    applyCommand(s, 1, { c: 'ready', value: true });
    runUntil(s, () => s.phase === 'combat', 5);
    expect(s.phase).toBe('combat');
  });
});

describe('full games', () => {
  it('a full all-AI game ends with a result', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 10, difficulty: 'normal', humans: [] }, 7);
    let n = 0;
    while (s.phase !== 'ended' && n++ < 20 * 60 * 40) { step(s); drainEvents(s); }
    expect(s.result).not.toBeNull();
  });
  it('duel mode puts the two humans on opposite teams and ends with a winner', () => {
    const s = createGame({ mode: 'duel', totalWaves: 10, difficulty: 'normal', humans: [{ name: 'A' }, { name: 'B' }] }, 9);
    expect(s.players[0].isAI).toBe(false);
    expect(s.players[2].isAI).toBe(false);
    expect(s.players[2].team).toBe(1);
    for (const p of s.players) p.isAI = true; // let the AI play both sides
    let n = 0;
    while (s.phase !== 'ended' && n++ < 20 * 60 * 40) { step(s); drainEvents(s); }
    expect([0, 1]).toContain(s.result!.winner);
  });
  it('undefended lanes leak and damage the Core', () => {
    const s = game();
    for (const p of s.players) p.ready = true;
    runUntil(s, () => s.phase === 'resolution' || s.phase === 'ended', 20 * 120);
    expect(s.teams[0].core.hp).toBeLessThan(2500);
    expect(s.players[0].stats.leaks).toBeGreaterThan(0);
  });
  it('a falling Core plays a short end sequence before the result', () => {
    const s = game();
    for (const p of s.players) p.ready = true;
    step(s);
    s.teams[0].core.hp = 1;
    runUntil(s, () => s.ending > 0, 20 * 120);
    expect(s.result).toBeNull();
    runUntil(s, () => s.phase === 'ended', 20 * 10);
    expect(s.result!.winner).toBe(1);
  });
  it('upgrade cost table is consistent', () => {
    for (const id of Object.keys(UNITS)) if (!UNITS[id].token) expect(upgradeCost(id, 2)).toBeGreaterThan(0);
  });
});
