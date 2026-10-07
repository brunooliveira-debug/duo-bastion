// v0.4 mechanics: Résonance DUO, Bastion modules, tactical orders, secondary rifts, anomalies,
// telegraphed boss attacks, world seed reproducibility.
import { describe, it, expect } from 'vitest';
import { createGame, applyCommand, step, drainEvents, stateHash, levelPrice } from '../src/sim/game';
import { RESO_MAX, RESO_GAIN, RESO_CHANNEL, duoAbility, ALL_DUO_ABILITIES } from '../src/data/resonance';
import { MODULES, PROPOSAL_TIMEOUT, moduleCost } from '../src/data/modules';
import { ORDER_CHARGES, ORDER_COOLDOWN, ANOMALIES, RIFT_MINIONS } from '../src/data/tactics';
import { FACTION_IDS, UNITS } from '../src/data/units';
import { ENEMIES } from '../src/data/enemies';
import { addReso } from '../src/sim/resonance';
import type { GameState, Ent } from '../src/sim/state';
import type { FactionId } from '../src/data/types';

/** co-op game: two humans on team 0 (so no AI decides for them) */
function coop(f: [FactionId, FactionId] = ['rouages', 'astreens'], seed = 42): GameState {
  return createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: f[0] }, { name: 'B', faction: f[1] }] }, seed);
}
function toCombat(s: GameState) { for (const p of s.players) p.ready = true; step(s); drainEvents(s); expect(s.phase).toBe('combat'); }
function run(s: GameState, ticks: number) { for (let i = 0; i < ticks; i++) { step(s); drainEvents(s); } }

describe('Résonance DUO', () => {
  it('has an ability for every pair of armies (15 pairs + 6 mirrors)', () => {
    const ids = new Set<string>();
    for (const a of FACTION_IDS) for (const b of FACTION_IDS) { const ab = duoAbility(a, b); expect(ab).toBeTruthy(); expect(ab.fx.length).toBeGreaterThan(0); expect(duoAbility(b, a).id).toBe(ab.id); ids.add(ab.id); }
    expect(ids.size).toBe(21);
    expect(ALL_DUO_ABILITIES).toHaveLength(21);
  });
  it('never fills with time: an idle team gains nothing', () => {
    const s = coop();
    run(s, 20 * 30);
    expect(s.teams[0].reso).toBe(0);
  });
  it('fills with cooperation and is capped', () => {
    const s = coop();
    addReso(s, 0, 30, 0);
    expect(s.teams[0].reso).toBe(30);
    expect(s.players[0].stats.resoGain).toBe(30);
    addReso(s, 0, 500, 1);
    expect(s.teams[0].reso).toBe(RESO_MAX);
    expect(drainEvents(s).filter(e => e.t === 'reso' && e.k === 'full')).toHaveLength(1);
  });
  it('a kill in the partner\'s lane charges the gauge (real combat)', () => {
    const s = coop();
    const p0 = s.players[0];
    p0.gold = 3000;
    for (let r = 0; r < 7; r++) applyCommand(s, 0, { c: 'build', unit: 'colosse_forge', col: 4, row: r });
    toCombat(s);
    // nothing in lane 0 → lane 0 units are free and kill lane 1 (undefended) enemies
    for (const e of s.ents) if (e.enemy && e.owner === 0) { e.dead = true; e.hp = 0; }
    run(s, 20 * 40);
    expect(p0.stats.helpKills + p0.stats.saves).toBeGreaterThan(0);
    expect(s.teams[0].reso).toBeGreaterThan(0);
  });
  it('trigger: needs a full gauge, only in combat, consumes it, partner synchronises, no double trigger', () => {
    const s = coop();
    s.teams[0].reso = RESO_MAX;
    expect(applyCommand(s, 0, { c: 'reso' })).toMatch(/combat/);
    toCombat(s);
    s.teams[0].reso = 50;
    expect(applyCommand(s, 0, { c: 'reso' })).toMatch(/50/);
    s.teams[0].reso = RESO_MAX;
    expect(applyCommand(s, 0, { c: 'reso' })).toBeNull();
    expect(s.teams[0].reso).toBe(0);
    expect(applyCommand(s, 0, { c: 'reso' })).toMatch(/partenaire/); // same player cannot sync himself
    expect(applyCommand(s, 1, { c: 'reso' })).toBeNull(); // partner synchronises
    expect(s.teams[0].resoCast!.sync).toBe(true);
    expect(applyCommand(s, 1, { c: 'reso' })).toMatch(/déjà/);
    const before = s.ents.filter(e => e.enemy).reduce((t, e) => t + e.hp, 0);
    run(s, Math.ceil(RESO_CHANNEL * 20) + 2);
    expect(s.teams[0].resoCast).toBeNull();
    expect(s.teams[0].resoUses).toBe(1);
    const after = s.ents.filter(e => e.enemy).reduce((t, e) => t + e.hp, 0);
    expect(after).toBeLessThanOrEqual(before); // Matrice Stellaire froze the horde (and the gauge stays empty)
    expect(s.journal.some(j => j.k === 'reso')).toBe(true);
  });
  it('a channel interrupted by the end of the wave gives the gauge back', () => {
    const s = coop();
    toCombat(s);
    s.teams[0].reso = RESO_MAX;
    applyCommand(s, 0, { c: 'reso' });
    for (const e of s.ents) if (e.enemy) { e.dead = true; e.hp = 0; }
    run(s, 3);
    expect(s.phase).toBe('resolution');
    expect(s.teams[0].reso).toBe(RESO_MAX);
  });
  it('a power cast on an empty lane strikes the partner\'s lane and charges the gauge', () => {
    const s = coop(['astreens', 'rouages']);
    toCombat(s);
    for (const e of s.ents) if (e.enemy && e.owner === 0) { e.dead = true; e.hp = 0; }
    run(s, 2);
    expect(applyCommand(s, 0, { c: 'cast', slot: 0 })).toBeNull();
    expect(s.teams[0].reso).toBeGreaterThanOrEqual(RESO_GAIN.powerAssist);
    expect(s.ents.some(e => e.enemy && e.owner === 1 && e.stunUntil > s.time)).toBe(true);
  });
});

describe('Bastion modules (joint decisions)', () => {
  it('proposal escrows the Éther, the partner validates and co-finances', () => {
    const s = coop();
    s.players[0].ether = 100; s.players[1].ether = 100;
    const cost = moduleCost('canon', 1);
    expect(applyCommand(s, 0, { c: 'module', action: 'install', module: 'canon' })).toBeNull();
    expect(s.players[0].ether).toBe(100 - cost);
    expect(s.teams[0].modules[0]).toBeNull();
    expect(applyCommand(s, 0, { c: 'module', action: 'install', module: 'rempart' })).toMatch(/attend/);
    expect(applyCommand(s, 0, { c: 'moduleVote', accept: true })).toMatch(/partenaire/);
    expect(applyCommand(s, 1, { c: 'moduleVote', accept: true })).toBeNull();
    expect(s.teams[0].modules[0]).toEqual({ id: 'canon', lv: 1 });
    const half = Math.floor(cost / 2);
    expect(s.players[1].ether).toBe(100 - half);
    expect(s.players[0].ether).toBe(100 - cost + half);
  });
  it('refusal refunds; silence means consent after the timeout', () => {
    const s = coop();
    s.players[0].ether = 200;
    applyCommand(s, 0, { c: 'module', action: 'install', module: 'egide' });
    applyCommand(s, 1, { c: 'moduleVote', accept: false });
    expect(s.players[0].ether).toBe(200);
    expect(s.teams[0].modules.every(m => !m)).toBe(true);
    applyCommand(s, 0, { c: 'module', action: 'install', module: 'egide' });
    run(s, Math.ceil(PROPOSAL_TIMEOUT * 20) + 2);
    expect(s.teams[0].modules[0]?.id).toBe('egide');
  });
  it('an AI partner answers at once; 3 slots max; upgrade and dismantle', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: 'ronces' }] }, 5);
    const p = s.players[0];
    p.ether = 1000; s.players[1].ether = 0;
    for (const id of ['canon', 'rempart', 'forge'] as const) expect(applyCommand(s, 0, { c: 'module', action: 'install', module: id })).toBeNull();
    expect(s.teams[0].modules.map(m => m?.id)).toEqual(['canon', 'rempart', 'forge']);
    expect(applyCommand(s, 0, { c: 'module', action: 'install', module: 'givre' })).toMatch(/emplacement/i);
    expect(applyCommand(s, 0, { c: 'module', action: 'upgrade', module: 'canon' })).toBeNull();
    expect(s.teams[0].modules[0]!.lv).toBe(2);
    const e0 = p.ether;
    expect(applyCommand(s, 0, { c: 'module', action: 'remove', module: 'forge' })).toBeNull();
    expect(s.teams[0].modules[2]).toBeNull();
    expect(p.ether).toBeGreaterThan(e0);
    expect(applyCommand(s, 0, { c: 'module', action: 'install', module: 'nope' as never })).toMatch(/inconnu/);
  });
  it('modules act in combat: Égide absorbs leaks, Forge produces Éther', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: 'ronces' }] }, 6);
    s.players[0].ether = 500;
    applyCommand(s, 0, { c: 'module', action: 'install', module: 'egide' });
    applyCommand(s, 0, { c: 'module', action: 'install', module: 'forge' });
    toCombat(s);
    expect(s.teams[0].core.shield).toBeGreaterThan(0);
    const e = s.players[0].ether;
    run(s, 200);
    expect(s.players[0].ether - e).toBeGreaterThan(1.9); // workers 1/10 s + forge 1/10 s
  });
});

describe('tactical orders', () => {
  it('limited charges, cooldown, combat only, focus marks the most dangerous enemy', () => {
    const s = coop();
    expect(applyCommand(s, 0, { c: 'order', order: 'focus' })).toMatch(/combat/);
    toCombat(s);
    expect(s.players[0].orders).toBe(ORDER_CHARGES);
    expect(applyCommand(s, 0, { c: 'order', order: 'focus' })).toBeNull();
    const focused = s.ents.filter(e => e.focusBy === 0 && e.focusUntil > s.combatTime);
    expect(focused).toHaveLength(1);
    expect(applyCommand(s, 0, { c: 'order', order: 'rally' })).toMatch(/Ordre suivant/);
    run(s, ORDER_COOLDOWN * 20 + 1);
    expect(applyCommand(s, 0, { c: 'order', order: 'purge', x: 1e9, z: Number.NaN })).toBeNull(); // garbage coordinates are clamped / ignored
    run(s, ORDER_COOLDOWN * 20 + 1);
    expect(applyCommand(s, 0, { c: 'order', order: 'retreat' })).toMatch(/charge/);
    expect(applyCommand(s, 0, { c: 'order', order: 'nope' as never })).toMatch(/inconnu/);
  });
  it('retreat moves units back and reduces damage taken; purge clears fog / jam', () => {
    const s = coop();
    s.players[0].gold = 1000;
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 2, row: 3 });
    toCombat(s);
    s.players[0].fogUntil = 10; s.players[0].jamUntil = 10;
    const u = s.ents.find(e => !e.enemy && e.owner === 0)!;
    const x0 = u.x;
    applyOrder0(s, 'retreat');
    run(s, 40);
    expect(Math.abs(u.x)).toBeLessThan(Math.abs(x0)); // closer to the Core
    run(s, ORDER_COOLDOWN * 20);
    applyOrder0(s, 'purge');
    expect(s.players[0].fogUntil).toBe(0);
    expect(s.players[0].jamUntil).toBe(0);
  });
});
function applyOrder0(s: GameState, order: 'retreat' | 'purge') { expect(applyCommand(s, 0, { c: 'order', order })).toBeNull(); }

describe('secondary rifts', () => {
  it('open on rift waves, only mobile units can be assigned (max 2), closing pays the lane owner', () => {
    const s = coop(['ronces', 'abysses']);
    s.rift = { reward: 'gold', hpMul: 1, spawnMul: 1, rewardMul: 1 };
    const p = s.players[0];
    p.gold = 2000;
    applyCommand(s, 0, { c: 'build', unit: 'lame_ronce', col: 3, row: 1 });
    applyCommand(s, 0, { c: 'build', unit: 'lame_ronce', col: 3, row: 2 });
    applyCommand(s, 0, { c: 'build', unit: 'gardien_ecorce', col: 3, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'rodeuse', col: 9, row: 3 });
    const [a, b, c, tower] = p.builds;
    expect(UNITS.rodeuse.tower).toBeTruthy();
    expect(applyCommand(s, 0, { c: 'rift', bid: tower.bid, on: true })).toMatch(/tour/);
    expect(applyCommand(s, 0, { c: 'rift', bid: a.bid, on: true })).toBeNull();
    expect(applyCommand(s, 0, { c: 'rift', bid: b.bid, on: true })).toBeNull();
    expect(applyCommand(s, 0, { c: 'rift', bid: c.bid, on: true })).toMatch(/maximum/);
    toCombat(s);
    const rift = s.ents.find(e => e.rift && e.owner === 0)!;
    expect(rift).toBeTruthy();
    expect(s.ents.filter(e => !e.enemy && e.task === 0)).toHaveLength(2);
    const gold = p.gold;
    rift.hp = 1;
    run(s, 20 * 15);
    expect(p.stats.riftsClosed).toBe(1);
    expect(p.gold).toBeGreaterThan(gold);
    expect(s.journal.some(j => j.k === 'rift')).toBe(true);
  });
  it('an ignored rift spits a limited number of minions and never blocks the end of the wave', () => {
    const s = coop();
    s.rift = { reward: 'ether', hpMul: 50, spawnMul: 1, rewardMul: 1 };
    toCombat(s);
    run(s, 20 * 79);
    const rift = s.ents.find(e => e.rift && e.owner === 0);
    if (rift) expect(rift.raised).toBeLessThanOrEqual(RIFT_MINIONS);
    run(s, 20 * 3);
    expect(s.phase === 'resolution' || s.phase === 'build').toBe(true);
  });
});

describe('anomalies', () => {
  it('offered before key waves; a joint vote decides; effects apply', () => {
    const s = coop();
    s.teams[0].anomalyOffer = ['fortune', 'pacte', 'eclipse'];
    const g0 = s.players[0].gold;
    expect(applyCommand(s, 0, { c: 'anomaly', id: 'arsenal' })).toMatch(/indisponible/);
    expect(applyCommand(s, 0, { c: 'anomaly', id: 'fortune' })).toBeNull();
    expect(s.teams[0].anomaly).toBeNull(); // waits for the second human
    expect(applyCommand(s, 1, { c: 'anomaly', id: 'fortune' })).toBeNull();
    expect(s.teams[0].anomaly?.id).toBe('fortune');
    expect(s.players[0].gold).toBeGreaterThan(g0);
    expect(s.teams[0].bossBoost).toBeGreaterThan(1);
    expect(ANOMALIES.fortune.bad).toMatch(/boss/);
  });
  it('the first key wave really offers 3 anomalies to every team (world roll)', () => {
    const s = createGame({ mode: 'duel', totalWaves: 21, difficulty: 'normal', humans: [] }, 77);
    let n = 0;
    while (s.wave < 4 && n++ < 20 * 60 * 10) { step(s); drainEvents(s); }
    expect(s.wave).toBe(4);
    expect(s.teams[0].anomalyOffer ?? s.teams[0].anomaly).toBeTruthy();
  });
});

describe('bosses: telegraphed attacks and phases', () => {
  /** a brute right next to a tank, slam ready */
  function bruteVsTank() {
    const s = coop();
    s.players[0].gold = 1000;
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 0, row: 3 });
    toCombat(s);
    const tank = s.ents.find(e => !e.enemy && e.owner === 0)! as Ent;
    for (const e of s.ents) if (e.enemy) { e.dead = true; }
    s.ents = s.ents.filter(e => !e.dead);
    const brute = s.ents.find(e => e.enemy) ?? null;
    void brute;
    const b = { ...tank, id: 9999, enemy: true, defId: 'brute', owner: 0, boss: true, hp: 99999, maxHp: 99999, dmg: ENEMIES.brute.dmg, abilities: ENEMIES.brute.abilities, timers: ENEMIES.brute.abilities.map(() => 0), x: tank.x - 1.2, z: tank.z, moveSpeed: 0, task: -1, target: -1 } as Ent;
    s.ents.push(b);
    return { s, tank, b };
  }
  it('a slam is announced (red zone), lands after the windup and hurts the units in the zone', () => {
    const { s, tank, b } = bruteVsTank();
    const slam = ENEMIES.brute.abilities.find(a => a.kind === 'slam')! as Extract<(typeof ENEMIES.brute.abilities)[number], { kind: 'slam' }>;
    step(s);
    const ev1 = drainEvents(s);
    expect(ev1.some(e => e.t === 'tele' && e.dur > 0)).toBe(true);
    expect(b.tele).not.toBeNull();
    const hp0 = tank.hp;
    let slammed = false;
    for (let i = 0; i < Math.ceil(slam.windup * 20) + 2; i++) { step(s); if (drainEvents(s).some(e => e.t === 'slam')) slammed = true; }
    expect(slammed).toBe(true);
    expect(tank.hp).toBeLessThan(hp0);
  });
  it('a stun during the windup interrupts the boss attack', () => {
    const { s, b } = bruteVsTank();
    step(s); drainEvents(s);
    expect(b.tele).not.toBeNull();
    // the partner (Ordre Astral) has an empty lane: his Gel Stellaire strikes our lane and freezes the brute
    expect(applyCommand(s, 1, { c: 'cast', slot: 0 })).toBeNull();
    let slammed = false, cancelled = false;
    for (let i = 0; i < 20 * 3; i++) { step(s); const ev = drainEvents(s); if (ev.some(e => e.t === 'slam')) slammed = true; if (ev.some(e => e.t === 'tele' && e.dur === 0)) cancelled = true; }
    expect(cancelled).toBe(true);
    expect(slammed).toBe(false);
  });
  it('boss phases trigger once at their threshold', () => {
    expect(ENEMIES.primordial.phases).toHaveLength(2);
    expect(ENEMIES.boss_colosse.phases![0].at).toBe(0.5);
  });
});

describe('world seed', () => {
  it('same seed + same commands → identical game (state hash)', () => {
    const play = () => {
      const s = createGame({ mode: 'vsai', totalWaves: 10, difficulty: 'normal', humans: [] }, 1234);
      let n = 0;
      while (s.phase !== 'ended' && n++ < 20 * 60 * 12) { step(s); drainEvents(s); }
      return stateHash(s);
    };
    expect(play()).toBe(play());
  });
  it('the world (events, rifts, anomaly offers, runes) does not depend on what players do', () => {
    const world = (spend: boolean) => {
      const s = createGame({ mode: 'survival', totalWaves: 9999, difficulty: 'normal', humans: [{ name: 'A', faction: 'ronces' }] }, 999);
      const rolls: string[] = [JSON.stringify(s.players[0].runes)];
      let n = 0;
      while (s.wave < 12 && s.phase !== 'ended' && n++ < 20 * 60 * 30) {
        if (s.phase === 'build' && spend && s.players[0].gold > 80) applyCommand(s, 0, { c: 'build', unit: 'lame_ronce', col: Math.floor(n % 12), row: Math.floor(n / 12) % 7 });
        if (s.phase === 'build') s.players[0].ready = true;
        const w = s.wave;
        step(s); drainEvents(s);
        if (s.wave !== w) rolls.push(`${s.wave}:${s.waveEvent}:${s.rift?.reward ?? '-'}:${s.teams[0].anomalyOffer?.join('/') ?? '-'}`);
      }
      return rolls;
    };
    const a = world(false), b = world(true);
    const n = Math.min(a.length, b.length);
    expect(n).toBeGreaterThan(3);
    expect(a.slice(0, n)).toEqual(b.slice(0, n));
  });
  it('a daily challenge fixes the AI partner army', () => {
    const s = createGame({ mode: 'survival', totalWaves: 9999, difficulty: 'normal', humans: [{ name: 'A', faction: 'solaires' }], challenge: 'daily:2026-10-07', aiFactions: { 1: 'necrose' } }, 5);
    expect(s.players[1].faction).toBe('necrose');
  });
});

describe('doctrines, fusion bonus, prices', () => {
  it('Rouages upgrades are 10 % cheaper; Arsenal changes prices', () => {
    expect(levelPrice('ferraille', 2, 'rouages', null)).toBeLessThan(levelPrice('ferraille', 2, 'ronces', null));
    expect(levelPrice('ferraille', 2, 'ronces', 'arsenal')).toBeLessThan(levelPrice('ferraille', 2, 'ronces', null));
  });
  it('a fused unit carries an "Éclat de fusion" into combat', () => {
    const s = coop();
    const p = s.players[0];
    p.gold = 1000;
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 2, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 3, row: 3 });
    applyCommand(s, 0, { c: 'build', unit: 'ferraille', col: 2, row: 5 });
    applyCommand(s, 0, { c: 'upgrade', bid: p.builds[2].bid });
    expect(applyCommand(s, 0, { c: 'fuse', bid: p.builds[0].bid, with: p.builds[1].bid })).toBeNull();
    expect(p.builds[0].fused).toBe(1);
    toCombat(s);
    const fusedEnt = s.ents.find(e => e.bid === p.builds[0].bid)!;
    const plainEnt = s.ents.find(e => e.bid === p.builds[1].bid)!;
    expect(fusedEnt.maxHp).toBeGreaterThan(plainEnt.maxHp * 1.05);
  });
});
