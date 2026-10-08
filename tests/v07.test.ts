// v0.7 "Siège": blessing draft between the waves, breachers / summoners, twin seals of the major bosses.
import { describe, it, expect } from 'vitest';
import { createGame, applyCommand, step, drainEvents, applyBlessing } from '../src/sim/game';
import { BLESSINGS, BLESS, RARE_WAVE, blessingWave } from '../src/data/blessings';
import { ENEMIES } from '../src/data/enemies';
import { unitStats } from '../src/data/units';
import { RESO_MAX } from '../src/data/resonance';
import { addReso } from '../src/sim/resonance';
import { SEAL_SHIELD, SEAL_RESO, SEAL_WINDOW } from '../src/sim/state';
import type { GameState } from '../src/sim/state';
import type { FactionId } from '../src/data/types';

/** co-op game: two humans on team 0 */
function coop(f: [FactionId, FactionId] = ['rouages', 'astreens'], seed = 42): GameState {
  return createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: f[0] }, { name: 'B', faction: f[1] }] }, seed);
}
/** one human + an AI partner */
function solo(seed = 42): GameState {
  return createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: 'rouages' }] }, seed);
}
function toCombat(s: GameState) { for (const p of s.players) p.ready = true; step(s); drainEvents(s); expect(s.phase).toBe('combat'); }
function run(s: GameState, ticks: number) { for (let i = 0; i < ticks; i++) { step(s); drainEvents(s); } }
/** finish the current wave at once and reach the next preparation */
function nextWave(s: GameState) {
  if (s.phase === 'build') toCombat(s);
  applyCommand(s, 0, { c: 'debug', action: 'kill' });
  for (let i = 0; i < 200 && s.phase !== 'build'; i++) { step(s); drainEvents(s); }
  expect(s.phase).toBe('build');
}

describe('blessings (draft between the waves)', () => {
  it('offers 3 blessings from wave 2, never on an anomaly wave, and the two humans pick in turn', () => {
    const s = coop();
    expect(s.teams[0].blessingOffer).toBeNull(); // wave 1: no draft
    nextWave(s);
    expect(s.wave).toBe(2);
    const o = s.teams[0].blessingOffer!;
    expect(o.ids).toHaveLength(3);
    expect(new Set(o.ids).size).toBe(3);
    expect(o.picker).toBe(0);
    expect(s.teams[1].blessingOffer).not.toBeNull(); // every team gets a draft
    // only the picker chooses
    expect(applyCommand(s, 1, { c: 'bless', id: o.ids[0] })).toMatch(/tour/);
    expect(applyCommand(s, 0, { c: 'bless', id: 'coeur' })).toMatch(/indisponible|Bénédiction/);
    expect(applyCommand(s, 0, { c: 'bless', id: o.ids[1] })).toBeNull();
    expect(s.teams[0].blessings).toEqual([o.ids[1]]);
    expect(s.teams[0].blessingOffer).toBeNull();
    expect(applyCommand(s, 0, { c: 'bless', id: o.ids[1] })).toMatch(/Aucune/);
    // wave 3: the other human picks
    nextWave(s);
    expect(s.teams[0].blessingOffer!.picker).toBe(1);
    // wave 4 is an anomaly wave: one decision at a time
    nextWave(s);
    expect(s.wave).toBe(4);
    expect(s.teams[0].anomalyOffer).not.toBeNull();
    expect(s.teams[0].blessingOffer).toBeNull();
    expect(blessingWave('vsai', 21, 4)).toBe(false);
    expect(blessingWave('vsai', 21, 5)).toBe(true);
    expect(blessingWave('vsai', 21, 1)).toBe(false);
  });

  it('an open draft is settled by fate when the wave starts; an AI team picks on its own; rare ones wait for wave 6', () => {
    const s = coop(['ronces', 'solaires'], 7);
    nextWave(s);
    const o = s.teams[0].blessingOffer!;
    toCombat(s);
    expect(s.teams[0].blessings).toHaveLength(1);
    expect(o.ids).toContain(s.teams[0].blessings[0]);
    expect(s.teams[0].blessingOffer).toBeNull();
    // the all-AI team 1 had its own pick (made during its preparation)
    expect(s.teams[1].blessings).toHaveLength(1);
    // no rare blessing before RARE_WAVE, whatever the seed
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const g = coop(['abysses', 'necrose'], seed);
      g.wave = 2;
      applyCommand(g, 0, { c: 'debug', action: 'bless' });
      for (const id of g.teams[0].blessingOffer!.ids) expect(BLESSINGS[id].rare, id).toBeFalsy();
      g.wave = RARE_WAVE + 4;
      g.teams[0].blessings = ['moisson']; // maxed: never offered again
      applyCommand(g, 0, { c: 'debug', action: 'bless' });
      expect(g.teams[0].blessingOffer!.ids).not.toContain('moisson');
    }
  });

  it('effects: damage, tower cadence, starting shield, Core ramparts, income, Résonance charge, order charges', () => {
    const s = coop(['astreens', 'rouages'], 9);
    const t = s.teams[0];
    const p = s.players[0];
    p.gold = 5000;
    applyCommand(s, 0, { c: 'build', unit: 'tireuse_etoile', col: 9, row: 3 }); // tower
    applyCommand(s, 0, { c: 'build', unit: 'gardien_stellaire', col: 2, row: 3 }); // front line
    const hp0 = t.core.maxHp;
    applyBlessing(s, 0, 'remparts', 0);
    expect(t.core.maxHp).toBe(Math.round(hp0 * (1 + BLESS.remparts)));
    t.blessings.push('trempe', 'trempe', 'cadence', 'egide', 'harmonie', 'discipline', 'intendance', 'phalange');
    toCombat(s);
    const tower = s.ents.find(e => !e.enemy && e.defId === 'tireuse_etoile')!;
    const guard = s.ents.find(e => !e.enemy && e.defId === 'gardien_stellaire')!;
    const base = unitStats('tireuse_etoile'), baseG = unitStats('gardien_stellaire');
    expect(tower.dmg / (base.dmg * (1 + 2 * BLESS.trempe))).toBeCloseTo(1, 1);
    expect(tower.atkSpeed / (base.atkSpeed * (1 + BLESS.cadence))).toBeCloseTo(1, 1);
    expect(tower.shield).toBeGreaterThan(0);
    expect(guard.maxHp).toBeGreaterThan(baseG.hp * (1 + BLESS.phalangeHp) * 0.99); // front line +HP (and a bit of zone bonus)
    expect(guard.armor).toBeCloseTo(baseG.armor + BLESS.phalangeArmor, 3);
    expect(p.orders).toBe(2 + BLESS.discipline);
    // Résonance charge boosted
    addReso(s, 0, 10, 0);
    expect(t.reso).toBeCloseTo(10 * (1 + BLESS.harmonie), 3);
    expect(t.reso).toBeLessThanOrEqual(RESO_MAX);
    // income: +5 per wave per player
    applyCommand(s, 0, { c: 'debug', action: 'kill' });
    const g0 = p.gold;
    for (let i = 0; i < 200 && s.phase !== 'build'; i++) { step(s); drainEvents(s); }
    expect(p.gold - g0).toBe(p.income + BLESS.intendance + 10); // + "voie tenue" bonus
  });
});

describe('new enemies', () => {
  it('breachers ignore the defenders and run for the gate', () => {
    const s = coop(['rouages', 'astreens'], 5);
    const p0 = s.players[0];
    p0.gold = 3000;
    for (let r = 0; r < 7; r++) applyCommand(s, 0, { c: 'build', unit: 'colosse_forge', col: 4, row: r });
    s.wave = 9; // 'Assaut Mixte' + 2 breachers
    toCombat(s);
    const ids = new Set(s.ents.filter(e => e.defId === 'brecheur' && e.owner === 0).map(e => e.id));
    expect(ids.size).toBe(2);
    for (let i = 0; i < 20 * 14; i++) {
      step(s); drainEvents(s);
      for (const e of s.ents) if (ids.has(e.id)) expect(e.target).toBeLessThan(0); // never a unit
    }
    const left = s.ents.filter(e => ids.has(e.id));
    expect(left.every(e => e.leaked) || left.length < 2).toBe(true); // they went through, or died trying
    expect(ENEMIES.brecheur.abilities.some(a => a.kind === 'breach')).toBe(true);
  });

  it('summoners stay back and call swarms', () => {
    const s = coop(['rouages', 'astreens'], 5);
    s.wave = 13; // 'Chœur Fêlé' + 2 summoners
    toCombat(s);
    const before = s.ents.filter(e => e.defId === 'essaim').length;
    expect(before).toBe(0);
    run(s, 20 * 9);
    expect(s.ents.filter(e => e.defId === 'essaim').length).toBeGreaterThan(0);
  });
});

describe('twin seals (boss co-op mechanic)', () => {
  it('a major boss arrives behind a seal shield that two timed presses shatter (stun + Résonance)', () => {
    const s = coop(['rouages', 'astreens'], 3);
    s.wave = 10; // Le Colosse Fêlé
    expect(applyCommand(s, 0, { c: 'seal' })).toMatch(/combat/);
    toCombat(s);
    const t = s.teams[0];
    expect(t.seal).not.toBeNull();
    const boss = s.ents.find(e => e.id === t.seal!.boss)!;
    expect(boss.defId).toBe('boss_colosse');
    expect(boss.shield).toBeCloseTo(boss.maxHp * SEAL_SHIELD, 0);
    expect(applyCommand(s, 0, { c: 'seal' })).toBeNull();
    expect(drainEvents(s).some(e => e.t === 'seal' && e.k === 'arm')).toBe(true);
    expect(applyCommand(s, 0, { c: 'seal' })).toMatch(/déjà/);
    run(s, 10); // 0.5 s later
    expect(t.seal!.broken).toBe(false);
    expect(applyCommand(s, 1, { c: 'seal' })).toBeNull();
    expect(t.seal!.broken).toBe(true);
    expect(boss.shield).toBe(0);
    expect(boss.stunUntil).toBeGreaterThan(s.time);
    expect(t.reso).toBeCloseTo(SEAL_RESO, 3);
    expect(applyCommand(s, 0, { c: 'seal' })).toMatch(/Aucun/);
    expect(s.journal.some(j => j.k === 'seal')).toBe(true);
  });

  it('presses too far apart do not break the seals (the window is short)', () => {
    const s = coop(['rouages', 'astreens'], 3);
    s.wave = 10;
    toCombat(s);
    const t = s.teams[0];
    expect(applyCommand(s, 0, { c: 'seal' })).toBeNull();
    run(s, Math.ceil((SEAL_WINDOW + 0.5) * 20));
    expect(applyCommand(s, 1, { c: 'seal' })).toBeNull();
    expect(t.seal!.broken).toBe(false);
    expect(applyCommand(s, 0, { c: 'seal' })).toBeNull(); // now within the partner's window
    expect(t.seal!.broken).toBe(true);
  });

  it('an AI partner answers the human\'s seal; regular waves have no seal', () => {
    const s = solo(3);
    s.wave = 10;
    toCombat(s);
    const t = s.teams[0];
    expect(t.seal).not.toBeNull();
    expect(applyCommand(s, 0, { c: 'seal' })).toBeNull();
    run(s, 30);
    expect(t.seal!.broken).toBe(true);
    const r = solo(4);
    r.wave = 7;
    toCombat(r);
    expect(r.teams[0].seal).toBeNull();
  });
});
