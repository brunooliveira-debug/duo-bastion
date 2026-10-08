// CombatSystem + TargetingSystem + AbilitySystem + commander powers. Operates on GameState.ents during combat.
// v0.4: Résonance DUO effects, cross-army help, army doctrines, tactical orders, Bastion modules (Core),
// secondary rifts, telegraphed boss attacks and boss phases, fusion bonus, per-unit statistics.
import { UNITS, unitStats, LEVEL_MUL } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, DAMAGE_MATRIX } from '../data/economy';
import { FACTION_POWERS, POWER_LEVEL_FX } from '../data/powers';
import type { Ability, CombatStats } from '../data/types';
import { waveToughness } from '../data/waves';
import { MOD } from '../data/modules';
import { RESO_GAIN, SYNC_WINDOW } from '../data/resonance';
import type { OrderId } from '../data/tactics';
import { RIFT_SPAWN_EVERY, RIFT_MINIONS, riftEther, riftGold, ANOMALY_WAVES } from '../data/tactics';
import { BLESS, blessingLv } from '../data/blessings';
import { DT, Build, Ent, GameState, LANE, PlayerState, laneDir, cellCenter, moduleLv, anomalyOf, partnerOf, journal, riftPos, SEAL_WINDOW, SEAL_SHIELD, SEAL_STUN, SEAL_RESO, teamMembers } from './state';
import { buildBonuses } from './synergy';
import { rand } from './rng';
import { addReso, teamAbility } from './resonance';

const AGGRO = 4.5; // enemy notices units within this distance (+ own range)
/** Units hold their ground: they only engage enemies this close to their own cell while their lane is busy,
 *  so the fight happens inside the towers' range and placement (front / back line) really matters. */
const LEASH = 3.5;
const RETARGET = 0.5;
const BIG_HP = 900;
const BASE_CRIT = 0.07, CRIT_MUL = 1.8;
/** every leak hurts: an undefended wave costs a real chunk of the Core */
const LEAK_MUL = 1.8;
/** Fusion bonus ("Éclat de fusion"): HP and damage per fusion merged into a unit (max 3). */
export const FUSION_BONUS = 0.1;
const PHANTOM_ID = -9;

export interface SpawnSpec { enemy: string; hpMul: number; dmgMul: number; raider?: boolean; elite?: boolean; speedMul?: number; shieldPct?: number; src?: number }

function hasPower(p: PlayerState | undefined, id: string) { return !!p && p.powers.includes(id); }

function dist2(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}
function ab<K extends Ability['kind']>(e: Ent, kind: K): Extract<Ability, { kind: K }> | undefined {
  for (const a of e.abilities) if (a.kind === kind) return a as Extract<Ability, { kind: K }>;
  return undefined;
}
/** Build behind a combat unit (per-unit lifetime statistics). */
function buildOf(s: GameState, e: Ent): Build | undefined {
  if (e.enemy || e.bid < 0) return undefined;
  return s.players[e.owner]?.builds.find(b => b.bid === e.bid);
}
const factionOf = (s: GameState, e: Ent) => (e.enemy ? null : s.players[e.owner]?.faction ?? null);
/** Wave-toughness scale for powers, Résonance, rifts and Core modules (smooth: strong on boss waves too). */
export function waveScale(s: GameState) { return waveToughness(s.wave) * (1 + 0.05 * (s.wave - 1)); }

function baseEnt(s: GameState, def: CombatStats, defId: string): Ent {
  return {
    id: s.nextId++, enemy: false, defId, level: 1, branch: null, arena: 0, owner: 0, bid: -1, x: 0, z: 0, hx: 0, hz: 0,
    hp: def.hp, maxHp: def.hp, shield: 0, armor: def.armor, dmg: def.dmg, atkSpeed: def.atkSpeed,
    range: def.range, moveSpeed: def.moveSpeed, attack: def.attack, defense: def.defense,
    abilities: def.abilities, radius: 0.4, cd: 0.2, target: -1, retarget: 0, slowUntil: 0, slowPct: 0,
    shredUntil: 0, shredPct: 0, stunUntil: 0, poisonUntil: 0, poisonDps: 0, poisonSrc: -1, burnUntil: 0, burnDps: 0, burnSrc: -1,
    hasteUntil: 0, hastePct: 0, lsUntil: 0, lsPct: 0, guard: 0, guardBase: 0, crit: 0, dotMul: 1, elite: false, expires: 0,
    back: false, veilUntil: 0, buffUntil: 0, buffDmg: 0, mul: 1,
    stealth: false, ambush: 0, lastAtk: -9, raised: 0, ramp: 0, timers: def.abilities.map(a => ('every' in a ? a.every * 0.6 : 0)),
    dashed: false, leaked: false, dead: false, boss: false, raider: false, summon: false, bounty: 0, leakDamage: 0, src: -1,
    rift: false, task: -1, markUntil: 0, markPct: 0, wetUntil: 0, focusUntil: 0, focusBy: -1, rallyUntil: 0, retreatUntil: 0, interceptUntil: 0,
    tele: null, phase: 0, ghost: false, growth: 0, helped: -9,
  };
}

/** Spawn a friendly summoned minion (token) next to (x,z). */
function spawnToken(s: GameState, owner: PlayerState, unit: string, x: number, z: number, mul: number, life = 0): Ent {
  const def = UNITS[unit];
  const e = baseEnt(s, def, unit);
  e.arena = owner.team; e.owner = owner.pid; e.summon = true; e.mul = mul;
  e.maxHp = e.hp = Math.round(def.hp * mul);
  e.dmg = def.dmg * mul;
  e.x = e.hx = x + (rand(s) - 0.5) * 1.4;
  e.z = e.hz = Math.max(-LANE.halfWidth, Math.min(LANE.halfWidth, z + (rand(s) - 0.5) * 1.4));
  e.radius = 0.32 * def.model.scale;
  e.crit = BASE_CRIT;
  if (life > 0) e.expires = s.combatTime + life;
  s.ents.push(e);
  return e;
}

/** Spawn combat instances of every player's builds (level, branch, zones, runes, synergies, powers, events). */
export function spawnUnits(s: GameState) {
  for (const p of s.players) {
    const bonus = buildBonuses(p.builds, p.runes);
    const team = s.teams[p.team];
    const anom = anomalyOf(s, p.team);
    const cad = moduleLv(team, 'cadence');
    for (const b of p.builds) {
      const def = unitStats(b.defId, b.level, b.branch);
      const e = baseEnt(s, def, b.defId);
      const c = cellCenter(p.slot, b.col, b.row);
      e.level = b.level; e.branch = b.branch;
      e.arena = p.team; e.owner = p.pid; e.bid = b.bid;
      e.x = e.hx = c.x; e.z = e.hz = c.z;
      e.radius = 0.35 * def.model.scale;
      e.crit = BASE_CRIT + (def.roles.includes('assassin') ? 0.15 : 0);
      if (def.tower) { e.moveSpeed = 0; e.range += 0.5; e.radius = 0.48; } // garrisoned: fires from its tower
      const bb = bonus.get(b.bid)!;
      e.back = bb.zone === 'back';
      if (bb.zoneActive && bb.zone === 'front') { e.maxHp *= 1.15; }
      if (bb.zoneActive && bb.zone === 'back') e.range += 0.6;
      if (bb.rune === 'force') e.dmg *= 1.2;
      if (bb.rune === 'vigueur') e.maxHp *= 1.25;
      if (bb.rune === 'celerite') e.atkSpeed *= 1.2;
      if (bb.rune === 'instable') { e.dmg *= 1.5; e.atkSpeed *= 1.3; }
      if (bb.rune === 'faille') { e.dmg *= 1.35; e.atkSpeed *= 1.2; }
      const extra: Ability[] = [];
      for (const id of bb.syn) {
        switch (id) {
          case 'reparation': extra.push({ kind: 'regen', pct: 0.015 }); break;
          case 'commandement': e.atkSpeed *= 1.15; break;
          case 'conduction': e.dmg *= 1.25; break;
          case 'guetteur': e.range += 0.8; break;
          case 'coordonnees': e.dmg *= 1.2; break;
          case 'phalange': e.guardBase += 0.1; break;
          case 'escouade': e.dmg *= 1.1; break;
          case 'embrasement': e.dotMul *= 1.3; break;
          case 'ombres': e.crit += 0.12; break;
          case 'constellation': e.atkSpeed *= 1.1; break;
          case 'seve': extra.push({ kind: 'regen', pct: 0.01 }); break;
        }
      }
      // hazard cell (Rune instable anomaly): the unit standing on it loses 3 % HP/s (never dies from it)
      if (p.hazards.some(h => h.col === b.col && h.row === b.row)) extra.push({ kind: 'regen', pct: -0.03 });
      if (extra.length) { e.abilities = [...e.abilities, ...extra]; e.timers.push(...extra.map(() => 0)); }
      // fusion bonus: every fusion merged into this unit
      const fz = Math.min(3, b.fused);
      if (fz) { e.maxHp *= 1 + FUSION_BONUS * fz; e.dmg *= 1 + FUSION_BONUS * fz; }
      // army doctrines
      if (p.faction === 'rouages' && def.tower) e.atkSpeed *= 1.1;
      if (p.faction === 'ronces') e.maxHp *= 1 + Math.min(0.24, 0.03 * Math.max(0, s.wave - b.placedWave));
      // Bastion module: Aura de Cadence (back line)
      if (cad && e.back) { e.atkSpeed *= 1 + MOD.cadence[cad]; if (cad >= 3 && e.range > 2) e.range *= 1.1; }
      // v0.7 blessings (team-wide, permanent)
      const bl = (id: Parameters<typeof blessingLv>[1]) => blessingLv(team, id);
      if (def.tower && bl('cadence')) e.atkSpeed *= 1 + BLESS.cadence * bl('cadence');
      if (b.col <= 3 && bl('phalange')) { e.maxHp *= 1 + BLESS.phalangeHp * bl('phalange'); e.armor = Math.min(0.6, e.armor + BLESS.phalangeArmor * bl('phalange')); }
      if (bl('trempe')) e.dmg *= 1 + BLESS.trempe * bl('trempe');
      if (bl('chasse')) { e.abilities = [...e.abilities, { kind: 'bonusVsBig', pct: BLESS.chasse * bl('chasse') }]; e.timers.push(0); }
      // anomalies
      if (anom === 'sacrifice') e.dmg *= 1.12;
      if (anom === 'eclipse' && e.range > 2) e.range = Math.max(2.1, e.range * 0.85);
      if (hasPower(p, 'mutation')) e.maxHp *= 1.2;
      if (hasPower(p, 'surcharge')) e.atkSpeed *= 1.25;
      if (hasPower(p, 'fureur')) e.dmg *= 1.15;
      if (hasPower(p, 'rempart')) e.armor = 1 - (1 - e.armor) * 0.88;
      if (hasPower(p, 'precision') && e.range > 2) { e.dmg *= 1.2; e.range += 0.5; }
      if (s.waveEvent === 'overcharge') { e.hasteUntil = 12; e.hastePct = 0.4; }
      e.maxHp = Math.round(e.maxHp); e.hp = e.maxHp;
      if (bl('egide')) e.shield += e.maxHp * BLESS.egide * bl('egide');
      if (ab(e, 'stealth')) { e.stealth = true; e.ambush = ab(e, 'stealth')!.ambush; }
      if (b.rift && e.moveSpeed > 0) e.task = p.pid;
      s.ents.push(e);
    }
  }
  // start-of-combat abilities: summons, shields, veils
  const units = s.ents.slice();
  for (const e of units) {
    if (e.enemy) continue;
    const owner = s.players[e.owner];
    const reso = hasPower(owner, 'resonance') ? 1.5 : 1;
    for (const a of e.abilities) {
      if (a.kind === 'shieldStart') {
        for (const o of s.ents) if (!o.enemy && o.arena === e.arena && dist2(o, e) <= a.radius * a.radius) { o.shield += a.amount * reso; credit(s, e, 'healed', a.amount * reso); }
      } else if (a.kind === 'summon') {
        const mul = Math.pow(LEVEL_MUL[e.level] ?? 1, 0.8);
        for (let i = 0; i < a.count; i++) spawnToken(s, owner, a.unit, e.x + laneDir(owner.slot) * -0.8, e.z, mul);
      } else if (a.kind === 'veilStart') {
        for (const o of s.ents) if (!o.enemy && o.arena === e.arena && dist2(o, e) <= a.radius * a.radius) { o.stealth = true; o.ambush = Math.max(o.ambush, 0.4); }
      }
    }
  }
}

function credit(s: GameState, e: Ent | null, k: 'tanked' | 'healed' | 'ctrl', v: number) {
  if (!e || v <= 0) return;
  const b = buildOf(s, e);
  if (b) b[k] += v;
}

function enemyEnt(s: GameState, it: SpawnSpec, team: number, owner: number): Ent {
  const def = ENEMIES[it.enemy];
  const e = baseEnt(s, def, it.enemy);
  const anom = anomalyOf(s, team);
  let hpK = it.hpMul * (it.elite ? 4 : 1);
  let dmgK = it.dmgMul * (it.elite ? 1.5 : 1);
  let bountyK = it.elite ? 6 : 1;
  if (anom === 'pacte') { hpK *= 1.2; bountyK *= 1.4; }
  if (anom === 'eclipse') hpK *= 0.85;
  if (anom === 'resonance_instable') dmgK *= 1.12;
  if (def.boss) hpK *= s.teams[team]?.bossBoost ?? 1;
  e.enemy = true; e.arena = team; e.owner = owner; e.mul = it.hpMul;
  e.maxHp = e.hp = Math.round(def.hp * hpK);
  e.dmg = def.dmg * dmgK;
  e.bounty = def.bounty * bountyK;
  e.leakDamage = Math.round(def.leakDamage * LEAK_MUL * Math.sqrt(it.dmgMul) * (it.elite ? 2 : 1));
  e.boss = !!def.boss; e.raider = !!it.raider; e.elite = !!it.elite; e.src = it.src ?? -1;
  e.moveSpeed *= (it.speedMul ?? 1) * (anom === 'tempete' ? 1.15 : 1) * (s.players[owner]?.faction === 'abysses' ? 0.92 : 1);
  if (it.shieldPct) e.shield = e.maxHp * it.shieldPct;
  if (anom === 'veille') e.shield += e.maxHp * 0.1;
  e.radius = 0.32 * def.model.scale * (it.elite ? 1.15 : 1);
  e.cd = 0.5;
  return e;
}

/** Spawn an enemy formation at the start of lane `slot` in arena `team`. */
export function spawnEnemies(s: GameState, team: number, slot: number, owner: number, list: SpawnSpec[], startOffset = 0) {
  const d = laneDir(slot);
  const perRow = 4;
  list.forEach((it, i) => {
    const e = enemyEnt(s, it, team, owner);
    const rowI = i % perRow, colI = Math.floor(i / perRow);
    e.x = -d * (LANE.spawnX + startOffset + colI * 1.3);
    e.z = (rowI - (perRow - 1) / 2) * 1.6 + (colI % 2 ? 0.4 : -0.4);
    if (e.boss) e.z = 0;
    s.ents.push(e);
  });
}

/** Open the secondary rift of a lane (static objective that spits minions until closed). */
export function spawnRift(s: GameState, p: PlayerState) {
  const spec = s.rift ?? (anomalyOf(s, p.team) === 'contrat' ? { reward: 'gold' as const, hpMul: 1, spawnMul: 1, rewardMul: 1 } : null);
  if (!spec) return;
  const def = ENEMIES.faille;
  const e = baseEnt(s, def, 'faille');
  const pos = riftPos(p.slot);
  const k = waveToughness(s.wave);
  const contrat = anomalyOf(s, p.team) === 'contrat';
  e.enemy = true; e.rift = true; e.arena = p.team; e.owner = p.pid; e.mul = k;
  e.maxHp = e.hp = Math.round(def.hp * (1 + 0.3 * (s.wave - 1)) * spec.hpMul);
  e.x = e.hx = pos.x; e.z = e.hz = pos.z;
  e.radius = 0.9;
  e.moveSpeed = 0; e.bounty = 0; e.leakDamage = 0;
  const every = RIFT_SPAWN_EVERY / (spec.spawnMul * (contrat ? 2 : 1));
  e.abilities = [{ kind: 'spawn', unit: s.wave >= 8 ? 'coureur' : 'rampelin', count: 1, every }];
  e.timers = [every * 0.8];
  s.ents.push(e);
  s.events.push({ t: 'rift', pid: p.pid, k: 'open', reward: spec.reward, arena: p.team, x: pos.x, z: pos.z });
}

/** Spawn enemies at a point (boss calls, splits, rift minions). */
function spawnEnemyAt(s: GameState, parent: Ent, unit: string, count: number) {
  for (let i = 0; i < count; i++) {
    const e = enemyEnt(s, { enemy: unit, hpMul: parent.mul, dmgMul: Math.sqrt(parent.mul), raider: parent.raider, src: parent.src }, parent.arena, parent.owner);
    e.x = parent.x + (rand(s) - 0.5) * 1.6;
    e.z = Math.max(-LANE.halfWidth, Math.min(LANE.halfWidth, parent.z + (rand(s) - 0.5) * 1.6));
    if (parent.rift) e.x += laneDir(s.players[parent.owner].slot) * 1.2;
    e.leaked = parent.leaked;
    e.bounty = Math.ceil(e.bounty * 0.5);
    s.ents.push(e);
  }
}

function effMul(a: Ent, b: Ent) { return DAMAGE_MATRIX[a.attack][b.defense]; }

interface DmgOpts { splash?: boolean; dot?: boolean; pierce?: number }

function applyDamage(s: GameState, src: Ent | null, t: Ent, raw: number, o: DmgOpts = {}) {
  if (t.dead) return 0;
  const armor = o.dot ? 0 : t.armor * (1 - (o.pierce ?? 0));
  let dmg = raw * (1 - armor);
  if (t.shredUntil > s.time) dmg *= 1 + t.shredPct;
  if (t.markUntil > s.time) dmg *= 1 + t.markPct;
  if (!t.enemy && t.retreatUntil > s.combatTime) dmg *= 0.7;
  const guard = Math.min(0.6, t.guard + t.guardBase);
  if (guard > 0) dmg *= 1 - guard;
  if (src) for (const a of t.abilities) {
    if (a.kind === 'resist' && a.attack === src.attack) dmg *= 1 - a.pct;
    if (a.kind === 'resistSplash' && o.splash) dmg *= 1 - a.pct;
  }
  const total = dmg;
  if (t.shield > 0) {
    const absorbed = Math.min(t.shield, dmg);
    t.shield -= absorbed;
    dmg -= absorbed;
  }
  t.hp -= dmg;
  // stats
  if (src && !src.enemy) {
    const p = s.players[src.owner];
    p.stats.dmgDealt += total;
    p.waveDmg += total;
    if (src.id === PHANTOM_ID) p.stats.powerDmg += total;
    else if (t.enemy && t.owner !== src.owner && !t.leaked && !t.rift) {
      p.stats.helpDmg += total;
      if (t.boss) addReso(s, p.team, (RESO_GAIN.helpBossPct * total) / t.maxHp, p.pid);
    }
    if (src.bid >= 0) { const b = p.builds.find(x => x.bid === src.bid); if (b) b.dmgTotal += total; }
  }
  if (!t.enemy) { s.players[t.owner].stats.dmgTanked += total; credit(s, t, 'tanked', total); }
  // thorns
  if (src && !o.dot && !o.splash && src.range < 2 && !src.dead) {
    const th = ab(t, 'thorns');
    if (th) { src.hp -= total * th.pct; if (src.hp <= 0) kill(s, src, t); }
  }
  if (t.hp <= 0) kill(s, t, src);
  else if (t.boss) bossPhases(s, t);
  return total;
}

function kill(s: GameState, t: Ent, killer: Ent | null) {
  if (t.dead) return;
  t.dead = true;
  t.hp = 0;
  if (t.tele) { t.tele = null; }
  s.events.push({ t: 'die', id: t.id, boss: t.boss, x: t.x, z: t.z, arena: t.arena, enemy: t.enemy });
  const kp = killer && !killer.enemy ? s.players[killer.owner] : null;
  if (t.rift) { closeRift(s, t, kp); return; }
  if (t.enemy) {
    // Bounty: lane owner if killed in its lane; otherwise the killer's owner (core kills give nothing).
    let pid = -1;
    if (!t.leaked) pid = t.owner;
    else if (kp) pid = kp.pid;
    if (pid >= 0 && t.bounty > 0) {
      const p = s.players[pid];
      const ev = s.waveEvent === 'double' ? 2 : s.waveEvent === 'rush' ? 1.5 : 1;
      const g = Math.round(t.bounty * ev * (p.powers.includes('fortune') ? 1.5 : 1) * (1 + BLESS.primes * blessingLv(s.teams[p.team], 'primes')));
      p.gold += g;
      p.stats.goldEarned += g;
    }
    if (kp) {
      const ks = kp.stats;
      ks.kills++;
      kp.souls++;
      if (blessingLv(s.teams[kp.team], 'moisson')) { kp.ether += BLESS.moisson; kp.stats.etherProduced += BLESS.moisson; } // blessing "Moisson d'Éther"
      if (t.leaked) {
        ks.saves++;
        addReso(s, kp.team, kp.pid !== t.owner ? RESO_GAIN.saveCross : RESO_GAIN.save, kp.pid);
      } else if (t.owner !== kp.pid) {
        ks.helpKills++;
        kp.waveHelpKills++;
        addReso(s, kp.team, t.elite ? RESO_GAIN.helpKillElite : RESO_GAIN.helpKill, kp.pid);
      }
      // cross-army help on kills (partner's lane or near the Core)
      if (killer!.id !== PHANTOM_ID && (t.leaked || t.owner !== kp.pid)) {
        if (kp.faction === 'rouages') {
          const core = s.teams[kp.team].core;
          const amount = Math.min(core.maxHp * 0.004, core.maxHp * 0.04 - core.repaired);
          if (amount > 0) { core.hp = Math.min(core.maxHp, core.hp + amount); core.repaired += amount; helpHint(s, kp, 'repair', t); }
        }
        if (kp.faction === 'necrose' && rand(s) < 0.3) {
          spawnToken(s, kp, 'squelette', t.x, t.z, Math.pow(LEVEL_MUL[killer!.level] ?? 1, 0.7), 14);
          s.events.push({ t: 'summon', arena: t.arena, x: t.x, z: t.z });
          helpHint(s, kp, 'souls', t);
        }
      }
    }
    // Solaire doctrine: an enemy dying while burning (from a Solaire flame) explodes
    if (t.burnUntil > s.time && t.burnDps > 0) {
      const src = s.ents.find(o => o.id === t.burnSrc);
      if (src && !src.enemy && factionOf(s, src) === 'solaires') {
        const r = 1.6;
        for (const o of s.ents) if (o.enemy && !o.dead && !o.rift && o !== t && dist2(o, t) <= r * r) applyDamage(s, src, o, t.maxHp * 0.12, { splash: true });
        s.events.push({ t: 'pulse', arena: t.arena, x: t.x, z: t.z, r, fx: 'fire' });
      }
    }
    // necromancy: units able to raise the dead nearby
    for (const o of s.ents) {
      if (o.enemy || o.dead || o.arena !== t.arena) continue;
      const r = ab(o, 'raise');
      if (!r || o.raised >= r.max || dist2(o, t) > r.radius * r.radius) continue;
      if (rand(s) < r.chance) {
        o.raised++;
        spawnToken(s, s.players[o.owner], r.unit, t.x, t.z, Math.pow(LEVEL_MUL[o.level] ?? 1, 0.8));
        s.events.push({ t: 'summon', arena: t.arena, x: t.x, z: t.z });
        break;
      }
    }
  } else if (!t.summon) {
    // a defender fell: remembered for "Machine Interdite", Nécrose "Pacte"
    s.fallen.push({ owner: t.owner, defId: t.defId, level: t.level, branch: t.branch, x: t.x, z: t.z });
    const owner = s.players[t.owner];
    // blessing "Relève": the fallen unit may come back as a short-lived ghost
    if (owner && !t.ghost && blessingLv(s.teams[owner.team], 'releve') && rand(s) < BLESS.releve) {
      const st = unitStats(t.defId, t.level, t.branch);
      const g = baseEnt(s, st, t.defId);
      g.arena = t.arena; g.owner = owner.pid; g.summon = true; g.ghost = true; g.level = t.level; g.branch = t.branch;
      g.maxHp = g.hp = Math.round(st.hp * BLESS.releveHp); g.dmg = st.dmg * BLESS.releveDmg;
      g.x = g.hx = t.x; g.z = g.hz = t.z; g.radius = t.radius; g.crit = BASE_CRIT;
      if (st.tower) { g.moveSpeed = 2; g.range = Math.min(g.range, 4); }
      g.expires = s.combatTime + BLESS.releveLife;
      s.ents.push(g);
      s.events.push({ t: 'ghost', arena: t.arena, x: t.x, z: t.z });
    }
    if (owner?.faction === 'necrose') {
      if (rand(s) < 0.35) { spawnToken(s, owner, 'squelette', t.x, t.z, Math.pow(LEVEL_MUL[t.level] ?? 1, 0.8)); s.events.push({ t: 'summon', arena: t.arena, x: t.x, z: t.z }); }
      for (const o of s.ents) if (!o.enemy && !o.dead && o.owner === t.owner && dist2(o, t) <= 9) { o.lsUntil = s.combatTime + 4; o.lsPct = Math.max(o.lsPct, 0.2); }
    }
  }
  const sp = ab(t, 'split');
  if (sp) {
    if (t.enemy) spawnEnemyAt(s, t, sp.unit, sp.count);
    else for (let i = 0; i < sp.count; i++) spawnToken(s, s.players[t.owner], sp.unit, t.x, t.z, Math.pow(LEVEL_MUL[t.level] ?? 1, 0.8));
    s.events.push({ t: 'summon', arena: t.arena, x: t.x, z: t.z });
  }
}

/** One hint per player and per wave when a cross-army help effect triggers (UI tooltip + visual). */
function helpHint(s: GameState, p: PlayerState, kind: string, at: Ent) {
  if (p.helpWave === s.wave) return;
  p.helpWave = s.wave;
  s.events.push({ t: 'help', pid: p.pid, kind, arena: at.arena, x: at.x, z: at.z });
}

/** A secondary rift was closed: reward its lane owner. */
function closeRift(s: GameState, t: Ent, kp: PlayerState | null) {
  const p = s.players[t.owner];
  const spec = s.rift ?? { reward: 'gold' as const, rewardMul: 1 };
  const mul = spec.rewardMul * (anomalyOf(s, p.team) === 'contrat' ? 1.5 : 1);
  switch (spec.reward) {
    case 'gold': { const g = Math.round(riftGold(s.wave) * mul); p.gold += g; p.stats.goldEarned += g; break; }
    case 'ether': p.ether += Math.round(riftEther(s.wave) * mul); break;
    case 'reso': addReso(s, p.team, 22 * mul, p.pid); break;
    case 'cd': p.riftReward = true; break; // cooldowns reset at the end of the wave
    case 'rune': {
      const free: { col: number; row: number }[] = [];
      for (let c = 2; c < 11; c++) for (let r = 0; r < 7; r++) if (!p.runes.some(x => x.col === c && x.row === r)) free.push({ col: c, row: r });
      const cell = free[Math.floor(rand(s) * free.length)];
      if (cell) p.runes.push({ ...cell, kind: 'faille', until: s.wave + 3 });
      break;
    }
  }
  p.stats.riftsClosed++;
  if (kp && kp.pid !== p.pid) addReso(s, p.team, RESO_GAIN.rift, kp.pid);
  journal(s, 'rift', p.pid, spec.reward);
  s.events.push({ t: 'rift', pid: p.pid, k: 'closed', reward: spec.reward, arena: t.arena, x: t.x, z: t.z });
  for (const o of s.ents) if (o.task === p.pid) o.task = -1;
}

function stun(s: GameState, t: Ent, dur: number, src: Ent | null = null) {
  const d = t.boss ? dur * 0.5 : dur;
  if (t.stunUntil < s.time + d) t.stunUntil = s.time + d;
  // a stun interrupts a telegraphed boss attack
  if (t.tele) { s.events.push({ t: 'tele', arena: t.arena, id: t.id, x: t.tele.x, z: t.tele.z, r: t.tele.r, dur: 0 }); t.tele = null; }
  credit(s, src, 'ctrl', d);
  s.events.push({ t: 'stun', id: t.id });
}

function poisonOn(s: GameState, src: Ent, t: Ent, dps: number, dur: number) {
  if (t.dead) return;
  t.poisonUntil = s.time + dur;
  if (dps >= t.poisonDps || t.poisonUntil <= s.time) { t.poisonDps = dps; t.poisonSrc = src.id; }
}
function burnOn(s: GameState, src: Ent, t: Ent, dps: number, dur: number) {
  if (t.dead) return;
  t.burnUntil = s.time + dur;
  if (dps >= t.burnDps) { t.burnDps = dps; t.burnSrc = src.id; }
}

const isLightning = (a: Ent) => UNITS[a.defId]?.fx === 'lightning' || a.abilities.some(x => x.kind === 'chain');

function hit(s: GameState, a: Ent, t: Ent, map: Map<number, Ent>) {
  const owner = a.enemy ? undefined : s.players[a.owner];
  let dmg = a.dmg * effMul(a, t);
  let pierce = 0;
  for (const x of a.abilities) {
    switch (x.kind) {
      case 'bonusVsSlowed': if (t.slowUntil > s.time) dmg *= 1 + x.pct; break;
      case 'execute': if (t.hp / t.maxHp < x.threshold) dmg *= 1 + x.pct; break;
      case 'bonusVsDef': if (t.defense === x.def) dmg *= 1 + x.pct; break;
      case 'bonusVsBig': if (t.boss || t.maxHp >= BIG_HP) dmg *= 1 + x.pct; break;
      case 'pierce': pierce = Math.max(pierce, x.pct); break;
    }
  }
  if (a.buffUntil > s.combatTime) dmg *= 1 + a.buffDmg;
  if (hasPower(owner, 'fureur') && a.hp < a.maxHp * 0.5) dmg *= 1.13;
  if (owner) {
    // army doctrines
    if (owner.faction === 'solaires' && a.hp < a.maxHp * 0.5) dmg *= 1.2;
    if (owner.faction === 'abysses') dmg *= 1 + Math.min(0.25, 0.01 * s.combatTime);
    if (owner.faction === 'necrose') dmg *= 1 + Math.min(0.3, 0.02 * owner.souls);
    // tactical orders
    if (t.focusUntil > s.combatTime && t.focusBy === a.owner) dmg *= 1.15;
    // cross-army combo: lightning on a target soaked by an abyssal helper
    if (t.wetUntil > s.time && isLightning(a)) {
      dmg *= 1.3;
      if (s.time - a.helped > 2) { a.helped = s.time; addReso(s, owner.team, RESO_GAIN.crossSynergy, owner.pid); helpHint(s, owner, 'conduction', t); }
    }
  }
  // ambush out of camouflage
  if (a.stealth || a.veilUntil > s.combatTime) {
    dmg *= 1 + Math.max(0.3, a.ambush);
    if (a.veilUntil <= s.combatTime) a.stealth = false;
  }
  a.lastAtk = s.time;
  const crit = !a.enemy && rand(s) < a.crit;
  if (crit) dmg *= CRIT_MUL;
  const eclat = hasPower(owner, 'eclat') ? 1.4 : 1;
  const dealt = applyDamage(s, a, t, dmg, { pierce });
  s.events.push({ t: 'atk', a: a.id, b: t.id, fx: a.enemy ? 'enemy' : UNITS[a.defId]?.fx ?? 'spark', ranged: a.range > 2, dmg: Math.round(dealt), crit });
  const ls = (ab(a, 'lifesteal')?.pct ?? 0) + (a.lsUntil > s.combatTime ? a.lsPct : 0);
  if (ls > 0) a.hp = Math.min(a.maxHp, a.hp + dealt * ls);
  // v0.7 blessings on every hit of a defender: frost blades (melee), venom, bouncing projectiles (ranged)
  if (owner && t.enemy && !t.rift) {
    const tm = s.teams[owner.team];
    if (a.range < 2 && blessingLv(tm, 'givre')) { t.slowUntil = Math.max(t.slowUntil, s.time + BLESS.givreDur); t.slowPct = Math.max(t.slowPct, BLESS.givreSlow); credit(s, a, 'ctrl', BLESS.givreDur * BLESS.givreSlow); }
    const venin = blessingLv(tm, 'venin');
    if (venin) poisonOn(s, a, t, a.dmg * BLESS.venin * venin, BLESS.veninDur);
    if (a.range > 2 && blessingLv(tm, 'rebonds') && !ab(a, 'chain') && !ab(a, 'splash')) {
      let best: Ent | null = null, bd = BLESS.rebondsRange * BLESS.rebondsRange;
      for (const o of map.values()) { if (o === t || o.dead || !o.enemy || o.rift) continue; const d = dist2(o, t); if (d < bd) { bd = d; best = o; } }
      if (best) { const d2 = applyDamage(s, a, best, a.dmg * effMul(a, best) * BLESS.rebonds, { pierce }); s.events.push({ t: 'atk', a: t.id, b: best.id, fx: UNITS[a.defId]?.fx ?? 'spark', ranged: true, dmg: Math.round(d2), crit: false }); }
    }
  }
  // doctrine (Ordre Astral) + cross-army help effects when fighting in the partner's lane
  if (owner && t.enemy && !t.rift) {
    const helping = t.owner !== a.owner && !t.leaked;
    if (owner.faction === 'astreens' && (a.range > 2 || helping)) { t.markUntil = s.time + 3; t.markPct = Math.max(t.markUntil > s.time ? t.markPct : 0, helping ? 0.2 : 0.1); }
    if (helping) {
      switch (owner.faction) {
        case 'astreens': helpHint(s, owner, 'mark', t); break;
        case 'abysses': t.wetUntil = s.time + 4; t.slowUntil = Math.max(t.slowUntil, s.time + 1.5); t.slowPct = Math.max(t.slowPct, 0.15); helpHint(s, owner, 'wet', t); break;
        case 'solaires': burnOn(s, a, t, a.dmg * 0.15, 3); helpHint(s, owner, 'spark', t); break;
        case 'ronces':
          if (s.combatTime - a.helped > 4) {
            a.helped = s.combatTime;
            for (const o of map.values()) if (!o.enemy && !o.dead && dist2(o, a) <= 4.8) { const h = o.maxHp * 0.09; o.hp = Math.min(o.maxHp, o.hp + h); credit(s, a, 'healed', h); }
            s.events.push({ t: 'pulse', arena: a.arena, x: a.x, z: a.z, r: 2.2, fx: 'leaf' });
            helpHint(s, owner, 'sap', a);
          }
          break;
      }
    }
  }
  const burnAb = ab(a, 'burn');
  for (const x of a.abilities) {
    switch (x.kind) {
      case 'ramp': a.ramp = Math.min(x.max, a.ramp + x.perHit); break;
      case 'slowOnHit': t.slowUntil = s.time + x.duration; t.slowPct = Math.max(t.slowPct, x.slow); credit(s, a, 'ctrl', x.duration * x.slow); break;
      case 'armorShred': t.shredUntil = s.time + x.duration; t.shredPct = Math.max(t.shredUntil > s.time ? t.shredPct : 0, x.pct); break;
      case 'burn': burnOn(s, a, t, x.dps * a.dotMul * eclat, x.duration); break;
      case 'stunOnHit': if (rand(s) < x.chance) stun(s, t, x.duration, a); break;
      case 'poison': {
        const dps = x.dps * a.dotMul * eclat;
        poisonOn(s, a, t, dps, x.duration);
        if (x.radius > 0) {
          for (const o of map.values()) if (o !== t && !o.dead && o.enemy === t.enemy && dist2(o, t) <= x.radius * x.radius) poisonOn(s, a, o, dps, x.duration);
          s.events.push({ t: 'pulse', arena: t.arena, x: t.x, z: t.z, r: x.radius, fx: 'poison' });
        }
        break;
      }
      case 'splash': {
        const r = x.radius * (eclat > 1 ? 1.15 : 1);
        for (const o of map.values()) {
          if (o === t || o.dead || o.enemy !== t.enemy) continue;
          if (dist2(o, t) <= r * r) {
            applyDamage(s, a, o, a.dmg * effMul(a, o) * x.pct * eclat * (crit ? 1.3 : 1), { splash: true, pierce });
            if (burnAb) burnOn(s, a, o, burnAb.dps * a.dotMul * 0.5, burnAb.duration);
          }
        }
        s.events.push({ t: 'pulse', arena: t.arena, x: t.x, z: t.z, r, fx: a.enemy ? 'enemy' : UNITS[a.defId]?.fx ?? 'spark' });
        break;
      }
      case 'chain': {
        let from = t;
        const hitIds = new Set([t.id]);
        for (let i = 0; i < x.targets; i++) {
          let best: Ent | null = null, bd = x.range * x.range;
          for (const o of map.values()) {
            if (o.dead || o.enemy !== t.enemy || hitIds.has(o.id)) continue;
            const d = dist2(o, from);
            if (d < bd) { bd = d; best = o; }
          }
          if (!best) break;
          hitIds.add(best.id);
          const wet = best.wetUntil > s.time ? 1.3 : 1;
          const d2 = applyDamage(s, a, best, a.dmg * effMul(a, best) * x.pct * eclat * wet, { pierce });
          s.events.push({ t: 'atk', a: from.id, b: best.id, fx: 'lightning', ranged: true, dmg: Math.round(d2), crit: false });
          from = best;
        }
        break;
      }
    }
  }
}

/** Kamikaze: damages every unit around and dies without bounty. */
function detonate(s: GameState, e: Ent, x: Extract<Ability, { kind: 'explode' }>, list: Ent[]) {
  for (const o of list) if (!o.enemy && !o.dead && dist2(o, e) <= x.radius * x.radius) applyDamage(s, e, o, x.dmg * Math.sqrt(e.mul) * effMul(e, o), { splash: true });
  s.events.push({ t: 'explode', arena: e.arena, x: e.x, z: e.z, r: x.radius });
  e.bounty = 0;
  kill(s, e, null);
}

/** Boss phases: triggered once each when the HP crosses the threshold. */
function bossPhases(s: GameState, e: Ent) {
  const phases = ENEMIES[e.defId]?.phases;
  if (!phases) return;
  while (e.phase < phases.length && e.hp / e.maxHp < phases[e.phase].at) {
    const ph = phases[e.phase];
    e.phase++;
    if (ph.speed) e.moveSpeed *= 1 + ph.speed;
    if (ph.atkSpeed) e.atkSpeed *= 1 + ph.atkSpeed;
    if (ph.shield) e.shield += e.maxHp * ph.shield;
    if (ph.spawn) spawnEnemyAt(s, e, ph.spawn.unit, ph.spawn.count);
    s.events.push({ t: 'bossPhase', arena: e.arena, id: e.id, def: e.defId, phase: e.phase });
    s.events.push({ t: 'pulse', arena: e.arena, x: e.x, z: e.z, r: 3.5, fx: 'enemy' });
  }
}
function slamCooldownMul(e: Ent) {
  const phases = ENEMIES[e.defId]?.phases;
  let k = 1;
  if (phases) for (let i = 0; i < e.phase; i++) k *= phases[i].slamFaster ?? 1;
  return k;
}

function inLaneRegion(e: Ent) { return !e.leaked; }

function hidden(s: GameState, u: Ent, from: Ent) {
  if (!(u.stealth || u.veilUntil > s.combatTime)) return false;
  return dist2(u, from) > 1.3 * 1.3;
}

function chooseTarget(s: GameState, e: Ent, arenaEnts: Ent[], range: number) {
  if (!e.enemy) {
    const p = s.players[e.owner];
    const ct = s.combatTime;
    // assigned to the secondary rift: go and close it
    if (e.task >= 0) {
      const r = arenaEnts.find(o => o.rift && !o.dead && o.owner === e.task);
      if (r) { e.target = r.id; return; }
      e.task = -1;
    }
    const icp = ab(e, 'interceptor');
    const intercept = e.interceptUntil > ct;
    if (icp || intercept) {
      // hunters: leaked and fast enemies first, anywhere in the arena
      let best = -1, bs = Infinity;
      const radius = intercept ? 40 : icp!.radius;
      for (const o of arenaEnts) {
        if (!o.enemy || o.dead || o.rift) continue;
        const d = Math.sqrt(dist2(o, e));
        if (d > radius) continue;
        const score = d - (o.leaked ? 30 : 0) - o.moveSpeed * 2.5;
        if (score < bs) { bs = score; best = o.id; }
      }
      if (best >= 0) { e.target = best; return; }
    }
    // FOCUS order: the designated target when it is within reach of the unit's post
    for (const o of arenaEnts) {
      if (!o.enemy || o.dead || o.focusUntil <= ct || o.focusBy !== e.owner) continue;
      const lim = e.moveSpeed > 0 ? (range + LEASH * 2 + o.radius) ** 2 : (range + o.radius + e.radius) ** 2;
      if (dist2(o, e) <= lim) { e.target = o.id; return; }
    }
    // Units defend their own lane first; once it is clear they are free to help the partner / Core.
    let own = false;
    for (const o of arenaEnts) if (o.enemy && !o.dead && !o.rift && o.owner === p.pid && inLaneRegion(o)) { own = true; break; }
    let best = -1, bd = Infinity;
    const immobile = e.moveSpeed <= 0;
    const leash = own && !e.summon ? (LEASH + e.range) ** 2 : Infinity;
    const assist = own && !e.summon ? (LEASH * 2.2 + e.range) ** 2 : Infinity; // help allies already in melee
    for (const o of arenaEnts) {
      if (!o.enemy || o.dead || o.rift) continue;
      if (own && !(o.owner === p.pid && inLaneRegion(o))) continue;
      const d = dist2(o, e);
      if (immobile && d > (range + o.radius + e.radius) ** 2) continue;
      // hold the line — but always answer an enemy that is attacking this unit (e.g. archers out of reach)
      if (!immobile && o.target !== e.id) {
        const dh = dist2(o, { x: e.hx, z: e.hz });
        if (dh > (o.target >= 0 ? assist : leash)) continue;
      }
      if (d < bd) { bd = d; best = o.id; }
    }
    e.target = best;
  } else {
    let best = -1, bd = Infinity;
    // breachers never fight: straight to the gate (the Core is their only target)
    if (ab(e, 'breach')) {
      if (e.leaked && Math.sqrt(e.x * e.x + e.z * e.z) <= LANE.coreRadius + e.range + 0.3) best = -2;
      e.target = best;
      return;
    }
    if (!ab(e, 'ignoreTaunt')) {
      for (const o of arenaEnts) {
        if (o.enemy || o.dead || hidden(s, o, e)) continue;
        const tt = ab(o, 'taunt');
        if (tt) {
          const d = dist2(o, e);
          if (d <= tt.radius * tt.radius && d < bd) { bd = d; best = o.id; }
        }
      }
    }
    if (best < 0) {
      const lim = (AGGRO + e.range) ** 2;
      for (const o of arenaEnts) {
        if (o.enemy || o.dead || hidden(s, o, e)) continue;
        const d = dist2(o, e);
        if (d <= lim && d < bd) { bd = d; best = o.id; }
      }
    }
    if (best < 0 && e.leaked) {
      const dc = Math.sqrt(e.x * e.x + e.z * e.z);
      if (dc <= LANE.coreRadius + e.range + 0.3) best = -2;
    }
    e.target = best;
  }
}

function moveToward(e: Ent, tx: number, tz: number, speed: number) {
  const dx = tx - e.x, dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  const step = Math.min(d, speed * DT);
  e.x += (dx / d) * step;
  e.z += (dz / d) * step;
}

function enemySlot(s: GameState, e: Ent) { return s.players[e.owner].slot; }

/** Effective range with fog (event or curse). */
function effRange(s: GameState, e: Ent) {
  if (e.enemy) return e.range;
  let r = e.range;
  if (s.waveEvent === 'fog' && s.combatTime < 20) r *= 0.7;
  if (e.back && s.combatTime < s.players[e.owner].fogUntil) r *= 0.65;
  return r > 2 ? r : Math.min(r, e.range);
}

/** Leak damage on the Core: Rempart reduction, Égide shield, bookkeeping. Returns the HP lost. */
export function hitCore(s: GameState, e: Ent): number {
  const team = s.teams[e.arena];
  const core = team.core;
  let dmg = e.leakDamage * (1 - MOD.rempart[moduleLv(team, 'rempart')]);
  if (core.shield > 0) { const a = Math.min(core.shield, dmg); core.shield -= a; dmg -= a; }
  core.hp -= dmg;
  coreDamageBy(s, e, dmg);
  s.events.push({ t: 'coreHit', team: e.arena, dmg });
  return dmg;
}

/** One combat tick for every arena. */
export function combatTick(s: GameState) {
  const byArena: Ent[][] = s.teams.map(() => []);
  for (const e of s.ents) if (!e.dead) byArena[e.arena].push(e);
  const ct = s.combatTime;

  for (let ai = 0; ai < byArena.length; ai++) {
    const list = byArena[ai];
    const map = new Map<number, Ent>();
    for (const e of list) map.set(e.id, e);
    const team = s.teams[ai];

    // ---- auras ----
    const asBuff = new Map<number, number>();
    for (const e of list) e.guard = e.rallyUntil > ct ? 0.25 : 0;
    for (const e of list) {
      if (e.rallyUntil > ct) asBuff.set(e.id, Math.max(asBuff.get(e.id) ?? 0, 0.15));
      for (const a of e.abilities) {
        if (a.kind === 'auraAttackSpeed') {
          const reso = hasPower(e.enemy ? undefined : s.players[e.owner], 'resonance') ? 1.5 : 1;
          for (const o of list) if (o.enemy === e.enemy && o !== e && dist2(o, e) <= a.radius * a.radius) asBuff.set(o.id, Math.max(asBuff.get(o.id) ?? 0, a.pct * reso));
        } else if (a.kind === 'guardAura') {
          for (const o of list) if (o.enemy === e.enemy && dist2(o, e) <= a.radius * a.radius) o.guard = Math.max(o.guard, a.pct);
        }
      }
    }

    // ---- timed abilities, DoTs, regeneration, expiry ----
    for (const e of list) {
      if (e.dead) continue;
      if (e.expires > 0 && ct >= e.expires) { e.bounty = 0; kill(s, e, null); continue; }
      if (e.poisonUntil > s.time && e.poisonDps > 0) applyDamage(s, map.get(e.poisonSrc) ?? null, e, e.poisonDps * DT, { dot: true });
      else e.poisonDps = 0;
      if (e.dead) continue;
      if (e.burnUntil > s.time && e.burnDps > 0) applyDamage(s, map.get(e.burnSrc) ?? null, e, e.burnDps * DT, { dot: true, pierce: 0.5 });
      else e.burnDps = 0;
      if (e.dead) continue;
      if (e.abilities.length === 0) continue;
      const owner = e.enemy ? undefined : s.players[e.owner];
      const reso = hasPower(owner, 'resonance') ? 1.5 : 1;
      const ecl = hasPower(owner, 'eclat') ? 1.4 : 1;
      const stunned = e.stunUntil > s.time;
      e.abilities.forEach((a: Ability, i) => {
        switch (a.kind) {
          case 'regen':
            // burning or poisoned creatures cannot regenerate (counterplay to regenerating bosses)
            if (a.pct > 0 && (e.burnUntil > s.time || e.poisonUntil > s.time)) break;
            e.hp = a.pct < 0 ? Math.max(1, Math.min(e.hp, e.hp + e.maxHp * a.pct * DT)) : Math.min(e.maxHp, e.hp + e.maxHp * a.pct * DT);
            break;
          case 'stealth':
            if (!e.stealth && s.time - e.lastAtk > (a.ambush >= 1 ? 2 : 3)) { e.stealth = true; e.ambush = a.ambush; }
            break;
          case 'heal': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let best: Ent | null = null, bl = 0.999;
            for (const o of list) {
              if (o.enemy !== e.enemy || o.dead || dist2(o, e) > a.range * a.range) continue;
              const r = o.hp / o.maxHp;
              if (r < bl) { bl = r; best = o; }
            }
            if (best) {
              const h = Math.min(best.maxHp - best.hp, a.amount * reso);
              best.hp += h; credit(s, e, 'healed', h);
              s.events.push({ t: 'heal', id: best.id }); e.timers[i] = a.every;
            } else e.timers[i] = 0.3;
            break;
          }
          case 'shieldPulse': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let any = false;
            for (const o of list) if (o.enemy === e.enemy && !o.dead && dist2(o, e) <= a.radius * a.radius) { const add = Math.max(0, a.amount * reso - o.shield); o.shield += add; credit(s, e, 'healed', add); any = true; }
            if (any) { s.events.push({ t: 'pulse', arena: ai, x: e.x, z: e.z, r: a.radius, fx: e.enemy ? 'enemyShield' : 'shield' }); e.timers[i] = a.every; }
            else e.timers[i] = 0.3;
            break;
          }
          case 'hastePulse': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let any = false;
            for (const o of list) if (o.enemy === e.enemy && !o.dead && dist2(o, e) <= a.radius * a.radius) { o.hasteUntil = ct + a.duration; o.hastePct = Math.max(o.hasteUntil > ct ? o.hastePct : 0, a.pct * reso); any = true; }
            if (any) { s.events.push({ t: 'pulse', arena: ai, x: e.x, z: e.z, r: a.radius, fx: 'haste' }); e.timers[i] = a.every; }
            break;
          }
          case 'slowPulse': case 'stunPulse': case 'novaPulse': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let any = false;
            for (const o of list) {
              if (o.enemy === e.enemy || o.dead || o.rift || dist2(o, e) > a.radius * a.radius) continue;
              any = true;
              if (a.kind === 'slowPulse') { o.slowUntil = s.time + a.duration; o.slowPct = Math.max(o.slowPct, a.slow); credit(s, e, 'ctrl', a.duration * a.slow); }
              if (a.kind === 'stunPulse') stun(s, o, a.duration, e);
              if (a.kind === 'novaPulse') burnOn(s, e, o, a.burn * e.dotMul * ecl, 3);
              applyDamage(s, e, o, a.dmg * ecl * DAMAGE_MATRIX[e.attack][o.defense], { splash: true });
            }
            if (any) {
              const fx = e.enemy ? 'enemy' : a.kind === 'novaPulse' ? 'fire' : a.kind === 'stunPulse' ? 'stun' : 'water';
              s.events.push({ t: 'pulse', arena: ai, x: e.x, z: e.z, r: a.radius, fx });
              e.timers[i] = a.every;
            } else e.timers[i] = 0.25;
            break;
          }
          case 'spawn': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            // a secondary rift spits a limited number of minions per wave
            if (e.rift) { if (e.raised >= RIFT_MINIONS * (anomalyOf(s, e.arena) === 'contrat' ? 2 : 1)) { e.timers[i] = 99; break; } e.raised++; }
            spawnEnemyAt(s, e, a.unit, a.count);
            s.events.push({ t: 'summon', arena: ai, x: e.x, z: e.z });
            e.timers[i] = a.every;
            break;
          }
          case 'slam': {
            // telegraphed attack: a red zone appears, the hit lands after the windup (stuns interrupt it)
            if (e.tele) {
              if (ct >= e.tele.at) {
                const tl = e.tele;
                e.tele = null;
                for (const o of list) if (!o.enemy && !o.dead && dist2(o, tl) <= tl.r * tl.r) { applyDamage(s, e, o, tl.dmg * DAMAGE_MATRIX[e.attack][o.defense], { splash: true }); if (tl.stun > 0) stun(s, o, tl.stun); }
                s.events.push({ t: 'slam', arena: ai, x: tl.x, z: tl.z, r: tl.r });
              }
              break;
            }
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let best: Ent | null = null, bn = 0;
            for (const o of list) {
              if (o.enemy || o.dead || dist2(o, e) > a.reach * a.reach) continue;
              let n = 0;
              for (const q of list) if (!q.enemy && !q.dead && dist2(q, o) <= a.radius * a.radius) n++;
              if (n > bn) { bn = n; best = o; }
            }
            if (!best) { e.timers[i] = 0.5; break; }
            const def = ENEMIES[e.defId];
            e.tele = { x: best.x, z: best.z, r: a.radius, at: ct + a.windup, dmg: a.dmg * (e.dmg / Math.max(1, def.dmg)), stun: a.stun };
            s.events.push({ t: 'tele', arena: ai, id: e.id, x: best.x, z: best.z, r: a.radius, dur: a.windup });
            e.timers[i] = a.every * slamCooldownMul(e);
            break;
          }
        }
      });
      if (!e.enemy && hasPower(owner, 'regeneration')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * DT);
    }
    // blessing "Aura du Cœur": defenders near the Bastion regenerate
    const coeur = blessingLv(team, 'coeur');
    if (coeur) for (const e of list) if (!e.enemy && !e.dead && e.x * e.x + e.z * e.z <= 81) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * BLESS.coeur * coeur * DT);

    // ---- dashes (assassins) at combat start ----
    for (const e of list) {
      if (e.enemy || e.dashed || e.dead) continue;
      const dash = ab(e, 'dash');
      if (!dash) { e.dashed = true; continue; }
      let best: Ent | null = null, bd = -1;
      for (const o of list) {
        if (!o.enemy || o.dead || o.rift) continue;
        const d = dist2(o, e);
        if (d <= dash.range * dash.range && d > bd) { bd = d; best = o; }
      }
      if (best) {
        e.dashed = true;
        const ang = Math.atan2(e.z - best.z, e.x - best.x);
        e.x = best.x + Math.cos(ang) * (best.radius + e.radius + 0.2);
        e.z = best.z + Math.sin(ang) * (best.radius + e.radius + 0.2);
        e.target = best.id;
        s.events.push({ t: 'dash', id: e.id });
      }
    }

    // ---- targeting, movement, attacks ----
    const givre = moduleLv(team, 'givre');
    const givreR = MOD.givreR[givre];
    for (const e of list) {
      if (e.dead || e.rift) continue;
      if (e.stunUntil > s.time) continue;
      if (e.enemy && e.tele) continue; // channelling a telegraphed attack
      if (givre && e.enemy && e.x * e.x + e.z * e.z <= givreR * givreR) { e.slowUntil = Math.max(e.slowUntil, s.time + 0.3); e.slowPct = Math.max(e.slowPct, MOD.givre[givre]); }
      // REPLI order: fall back toward the Core, then hold
      if (!e.enemy && e.retreatUntil > ct && e.moveSpeed > 0) {
        const d = laneDir(s.players[e.owner].slot);
        moveToward(e, e.hx + d * 3, e.hz, e.moveSpeed * 1.2);
        e.target = -1;
        continue;
      }
      const range = effRange(s, e);
      e.retarget -= DT;
      const cur = e.target >= 0 ? map.get(e.target) : undefined;
      if (e.retarget <= 0 || (e.target >= 0 && (!cur || cur.dead)) || e.target === -1) {
        chooseTarget(s, e, list, range);
        e.retarget = RETARGET;
      }
      const slow = e.slowUntil > s.time ? 1 - e.slowPct : 1;
      if (e.slowUntil <= s.time) e.slowPct = 0;
      let spdMul = slow, asMul = 1 + e.ramp + (asBuff.get(e.id) ?? 0) + (e.hasteUntil > ct ? e.hastePct : 0);
      if (e.interceptUntil > ct) spdMul *= 1.3;
      const enr = e.enemy ? ab(e, 'enrage') : undefined;
      if (enr && e.hp < e.maxHp * enr.below) { spdMul *= 1 + enr.speed; asMul *= 1 + enr.atkSpeed; }
      const spd = e.moveSpeed * spdMul;
      e.cd -= DT * asMul * slow;

      if (e.target === -2) {
        // reached the Core: detonates for its leak damage (no bounty)
        hitCore(s, e);
        e.dead = true; e.hp = 0;
        s.events.push({ t: 'die', id: e.id, boss: e.boss, x: e.x, z: e.z, arena: e.arena, enemy: true });
        continue;
      }
      const t = e.target >= 0 ? map.get(e.target) : undefined;
      if (t && !t.dead) {
        const reach = range + e.radius + t.radius;
        const d = Math.sqrt(dist2(e, t));
        const boom = e.enemy ? ab(e, 'explode') : undefined;
        if (boom && d <= e.radius + t.radius + 0.5) { detonate(s, e, boom, list); continue; }
        // kiting casters back off toward their rift when a defender gets too close (still firing from range)
        const kite = e.enemy && !e.leaked ? ab(e, 'kite') : undefined;
        if (kite && d < kite.dist && spd > 0 && Math.abs(e.x) < LANE.spawnX - 1) moveToward(e, e.x - laneDir(enemySlot(s, e)) * 2, e.z, spd * 0.8);
        else if (d > reach) { if (spd > 0) moveToward(e, t.x, t.z, spd); else e.target = -1; }
        if (d <= reach && e.cd <= 0 && !boom) { hit(s, e, t, map); e.cd = 1 / Math.max(0.05, e.atkSpeed); e.cd = Math.min(e.cd, 4); }
      } else if (e.enemy) {
        // walk the lane toward the Core
        const d = laneDir(enemySlot(s, e));
        if (!e.leaked) {
          moveToward(e, e.x + d * 3, e.z * 0.98, spd);
          if (Math.abs(e.x) < LANE.leakX) {
            const portal = moduleLv(team, 'portail');
            if (portal && team.core.portal > 0 && !e.boss) {
              // Portail de Repli: the first leaks of the wave are sent back to the start of the lane
              team.core.portal--;
              const x0 = e.x, z0 = e.z;
              e.x = -d * (LANE.spawnX - 3);
              if (portal >= 3) { e.slowUntil = s.time + 3; e.slowPct = Math.max(e.slowPct, 0.4); }
              s.events.push({ t: 'portal', arena: ai, x: x0, z: z0, x2: e.x, z2: e.z });
            } else {
              e.leaked = true;
              const p = s.players[e.owner];
              p.stats.leaks++; p.leakedThisWave++;
              if (!p.stats.firstLeakWave) { p.stats.firstLeakWave = s.wave; journal(s, 'leak1', p.pid); }
              s.events.push({ t: 'leak', arena: e.arena, pid: e.owner });
            }
          }
        } else {
          moveToward(e, 0, 0, spd);
        }
      } else if (spd > 0) {
        // idle unit with nothing to do: drift home
        if (dist2(e, { x: e.hx, z: e.hz }) > 0.05) moveToward(e, e.hx, e.hz, spd * 0.6);
      }
    }

    // ---- separation (cheap O(n²), n is small) ----
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          const wa = a.boss || a.rift || a.moveSpeed <= 0 ? 0.05 : 1, wb = b.boss || b.rift || b.moveSpeed <= 0 ? 0.05 : 1;
          a.x -= nx * push * wa; a.z -= nz * push * wa;
          b.x += nx * push * wb; b.z += nz * push * wb;
        }
      }
      // keep inside the arena
      if (!a.leaked && !a.rift && Math.abs(a.x) > LANE.leakX - 1) a.z = Math.max(-LANE.halfWidth, Math.min(LANE.halfWidth, a.z));
      // stop at core surface
      const dc = Math.hypot(a.x, a.z);
      if (dc < LANE.coreRadius + a.radius) {
        const k = (LANE.coreRadius + a.radius) / Math.max(dc, 1e-3);
        a.x *= k; a.z *= k;
      }
    }

    coreTick(s, ai, list, map);
  }

  s.ents = s.ents.filter(e => !e.dead);
}

/** The Core fights back: base shot + Bastion modules (Canon, Chaîne d'Orage, Rayon, Onde, Entrave). */
function coreTick(s: GameState, ai: number, list: Ent[], map: Map<number, Ent>) {
  const team = s.teams[ai];
  const core = team.core;
  const k = waveScale(s) / 2;
  const canon = moduleLv(team, 'canon');
  core.cd -= DT;
  if (core.cd <= 0) {
    const range = CORE.range + MOD.canonRange[canon];
    let best: Ent | null = null, bd = range * range;
    for (const o of list) {
      if (!o.enemy || o.dead || o.rift) continue;
      const d = o.x * o.x + o.z * o.z;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      const base = CORE.dmg * (1 + MOD.canon[canon]);
      applyDamage(s, null, best, base * DAMAGE_MATRIX[CORE.attack][best.defense]);
      s.events.push({ t: 'coreShot', team: ai, b: best.id });
      const orage = moduleLv(team, 'orage');
      if (orage) {
        let from = best;
        const hitIds = new Set([best.id]);
        for (let i = 0; i < MOD.orage[orage]; i++) {
          let nxt: Ent | null = null, nd = 16;
          for (const o of map.values()) { if (!o.enemy || o.dead || o.rift || hitIds.has(o.id)) continue; const d = dist2(o, from); if (d < nd) { nd = d; nxt = o; } }
          if (!nxt) break;
          hitIds.add(nxt.id);
          applyDamage(s, null, nxt, base * MOD.orageFall[orage] * DAMAGE_MATRIX[CORE.attack][nxt.defense]);
          s.events.push({ t: 'atk', a: from.id, b: nxt.id, fx: 'lightning', ranged: true, dmg: 0, crit: false });
          from = nxt;
        }
      }
      core.cd = 1 / CORE.atkSpeed;
    }
  }
  const rayon = moduleLv(team, 'rayon');
  if (rayon) {
    core.beamCd -= DT;
    if (core.beamCd <= 0) {
      let best: Ent | null = null;
      for (const o of list) if (o.enemy && !o.dead && !o.rift && o.x * o.x + o.z * o.z <= 256 && (!best || o.hp > best.hp)) best = o;
      if (best) {
        applyDamage(s, null, best, MOD.rayonDmg[rayon] * k * DAMAGE_MATRIX.ener[best.defense], { pierce: 0.5 });
        s.events.push({ t: 'pulse', arena: ai, x: best.x, z: best.z, r: 1, fx: 'beam' });
        core.beamCd = MOD.rayonEvery[rayon];
      } else core.beamCd = 0.5;
    }
  }
  const onde = moduleLv(team, 'onde');
  if (onde) {
    core.powCd -= DT;
    if (core.powCd <= 0) {
      const r = MOD.ondeR[onde];
      let any = false;
      for (const o of list) if (o.enemy && !o.dead && !o.rift && o.x * o.x + o.z * o.z <= r * r) { any = true; applyDamage(s, null, o, MOD.ondeDmg[onde] * k, { splash: true }); }
      if (any) { s.events.push({ t: 'pulse', arena: ai, x: 0, z: 0, r, fx: 'core' }); core.powCd = MOD.ondeEvery[onde]; }
      else core.powCd = 0.5;
    }
  }
  const entrave = moduleLv(team, 'entrave');
  if (entrave) {
    core.chainCd -= DT;
    if (core.chainCd <= 0) {
      let best: Ent | null = null;
      for (const o of list) if (o.enemy && !o.dead && (o.boss || o.elite) && (!best || o.x * o.x + o.z * o.z < best.x * best.x + best.z * best.z)) best = o;
      if (best) {
        stun(s, best, MOD.entraveStun[entrave] * (best.boss ? 2 : 1)); // bosses halve stuns: Entrave is made for them
        best.abilities.forEach((a, i) => { if ('every' in a) best!.timers[i] = Math.max(best!.timers[i], a.every * 0.5); });
        s.events.push({ t: 'pulse', arena: ai, x: best.x, z: best.z, r: 1.6, fx: 'chain' });
        core.chainCd = MOD.entraveEvery[entrave];
      } else core.chainCd = 1;
    }
  }
}

// ---------------------------------------------------------------- v0.7: twin seals (boss co-op mechanic)

/** Combat start: major bosses arrive behind the twin seals (a shield only the two players together can shatter fast). */
export function openSeals(s: GameState) {
  for (const t of s.teams) {
    t.seal = null;
    const boss = s.ents.find(e => e.enemy && !e.dead && e.boss && e.arena === t.id && ENEMIES[e.defId]?.seal);
    if (!boss) continue;
    boss.shield += boss.maxHp * SEAL_SHIELD;
    t.seal = { boss: boss.id, armed: [-99, -99], broken: false };
    s.events.push({ t: 'seal', team: t.id, k: 'open', pid: -1, x: boss.x, z: boss.z, arena: t.id });
  }
}

/** A player arms their seal (validated by applyCommand). Both armed within SEAL_WINDOW → the seals break. */
export function armSeal(s: GameState, p: PlayerState): string | null {
  const t = s.teams[p.team];
  const seal = t.seal;
  if (!seal || seal.broken) return 'Aucun sceau à activer.';
  const boss = s.ents.find(e => e.id === seal.boss && !e.dead);
  if (!boss) return 'Le boss est déjà tombé.';
  const ct = s.combatTime;
  if (ct - seal.armed[p.slot] < SEAL_WINDOW) return 'Ton sceau est déjà actif : à ton partenaire !';
  seal.armed[p.slot] = ct;
  const other = seal.armed[1 - p.slot];
  if (ct - other <= SEAL_WINDOW && teamMembers(s, p.team).length > 1) {
    seal.broken = true;
    boss.shield = 0;
    stun(s, boss, SEAL_STUN * 2); // bosses halve stuns
    boss.abilities.forEach((a, i) => { if ('every' in a) boss.timers[i] = Math.max(boss.timers[i], a.every * 0.5); });
    addReso(s, p.team, SEAL_RESO, p.pid);
    journal(s, 'seal', p.pid, boss.defId);
    s.events.push({ t: 'seal', team: p.team, k: 'break', pid: p.pid, x: boss.x, z: boss.z, arena: p.team });
    s.events.push({ t: 'pulse', arena: p.team, x: boss.x, z: boss.z, r: 3.2, fx: 'chain' });
  } else s.events.push({ t: 'seal', team: p.team, k: 'arm', pid: p.pid, x: boss.x, z: boss.z, arena: p.team });
  return null;
}

/** Core damage bookkeeping: lane owner, damage source (wave or send) and the sender's credit. */
export function coreDamageBy(s: GameState, e: Ent, dmg: number) {
  s.players[e.owner].stats.coreDamageCaused += dmg;
  const team = s.teams[e.arena];
  if (e.src >= 0) { team.dmgSends += dmg; const from = s.players[e.src]; if (from) from.stats.raiderCoreDmg += dmg; }
  else team.dmgWaves += dmg;
}

export function enemiesAlive(s: GameState, arena?: number) {
  for (const e of s.ents) if (e.enemy && !e.dead && !e.rift && (arena === undefined || e.arena === arena)) return true;
  return false;
}

// ---------------------------------------------------------------- commander powers

function laneEnemies(s: GameState, p: PlayerState) { return s.ents.filter(e => e.enemy && !e.dead && !e.rift && e.arena === p.team && e.owner === p.pid); }
function laneUnits(s: GameState, p: PlayerState) { return s.ents.filter(e => !e.enemy && !e.dead && e.arena === p.team && e.owner === p.pid); }

/** Centre of the lane's action (densest enemy, else the grid front). */
function focus(s: GameState, p: PlayerState, foes: Ent[]) {
  if (!foes.length) { const c = cellCenter(p.slot, 0, 3); return { x: c.x, z: c.z }; }
  let best = foes[0], bn = -1;
  for (const a of foes) {
    let n = 0;
    for (const b of foes) if (dist2(a, b) < 6.25) n++;
    if (n > bn) { bn = n; best = a; }
  }
  return { x: best.x, z: best.z };
}

const PHANTOM: Ent = (() => {
  const e = baseEnt({ nextId: -1 } as GameState, UNITS.squelette, 'squelette');
  return { ...e, id: PHANTOM_ID, range: 99, hp: 1e9, maxHp: 1e9, abilities: [], attack: 'arca' };
})();

/** Apply faction power `slot` of player p (validated by applyCommand).
 *  If p's lane is clear, damage / control powers strike the PARTNER's lane instead (assist → Résonance). */
export function castPower(s: GameState, p: PlayerState, slot: number) {
  const def = FACTION_POWERS[p.faction][slot];
  // damage follows how tough enemies are at this wave: a cast is strong, never a wave-clear on its own
  const m = POWER_LEVEL_FX[p.powerLv[slot]] * waveScale(s);
  let foes = laneEnemies(s, p);
  let lane = p;
  let assist = false;
  const partner = partnerOf(s, p.pid);
  if (!foes.length && partner) {
    const pf = laneEnemies(s, partner).concat(s.ents.filter(e => e.enemy && !e.dead && !e.rift && e.arena === p.team && e.leaked && e.owner === p.pid));
    if (pf.length) { foes = pf; lane = partner; assist = true; }
  }
  const mine = laneUnits(s, p);
  // phantom source: credits the player, never takes thorns damage
  const caster: Ent = { ...PHANTOM, owner: p.pid, arena: p.team };
  const f = focus(s, lane, foes);
  const hurt = (t: Ent, dmg: number, o: DmgOpts = {}) => applyDamage(s, caster, t, dmg, o);
  const strongest = (n: number) => foes.slice().sort((a, b) => b.hp - a.hp).slice(0, n);
  switch (def.id) {
    case 'freeze': for (const e of foes) stun(s, e, 1.6); break;
    case 'starfall':
      for (const e of strongest(5)) { hurt(e, 45 * m); e.slowUntil = s.time + 3; e.slowPct = Math.max(e.slowPct, 0.5); s.events.push({ t: 'pulse', arena: p.team, x: e.x, z: e.z, r: 1, fx: 'starfall' }); }
      break;
    case 'comet':
      for (const e of foes) if (dist2(e, f) <= 7.3) { hurt(e, 110 * m, { splash: true }); stun(s, e, 0.8); }
      s.events.push({ t: 'explode', arena: p.team, x: f.x, z: f.z, r: 3 });
      break;
    case 'overdrive': for (const u of mine) { u.hasteUntil = s.combatTime + 6; u.hastePct = Math.max(u.hastePct, 0.6 * Math.min(1.6, POWER_LEVEL_FX[p.powerLv[slot]])); } break;
    case 'missiles':
      for (let i = 0; i < 10 && foes.length; i++) {
        const t = foes[Math.floor(rand(s) * foes.length)];
        for (const e of foes) if (dist2(e, t) <= 1.2) hurt(e, 26 * m, { splash: true });
        s.events.push({ t: 'pulse', arena: p.team, x: t.x, z: t.z, r: 1.1, fx: 'missile' });
      }
      break;
    case 'emp': for (const e of foes) { stun(s, e, 2.5); e.shield = 0; } break;
    case 'heal': {
      const k = 0.35 * POWER_LEVEL_FX[p.powerLv[slot]];
      const targets = assist ? s.ents.filter(e => !e.enemy && !e.dead && e.arena === p.team) : mine;
      for (const u of targets) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * k); s.events.push({ t: 'heal', id: u.id }); }
      break;
    }
    case 'roots': for (const e of foes) { stun(s, e, 2.5); poisonOn(s, caster, e, 6 * m, 4); } break;
    case 'forest': {
      const c = cellCenter(lane.slot, 1, 3);
      const t = spawnToken(s, p, 'sylvain', c.x, f.z * 0.5, m, 20);
      t.x = (t.x + f.x) / 2;
      break;
    }
    case 'bubble': {
      const targets = assist ? s.ents.filter(e => !e.enemy && !e.dead && e.arena === p.team) : mine;
      for (const u of targets) u.shield = Math.max(u.shield, u.maxHp * 0.25 * POWER_LEVEL_FX[p.powerLv[slot]]);
      break;
    }
    case 'tide': {
      const d = laneDir(lane.slot);
      for (const e of foes) {
        if (!e.leaked) e.x = Math.max(-LANE.spawnX, Math.min(LANE.spawnX, e.x - d * 4.5));
        e.slowUntil = s.time + 4; e.slowPct = Math.max(e.slowPct, 0.55);
      }
      break;
    }
    case 'krakenCall': { const c = cellCenter(lane.slot, 0, 3); spawnToken(s, p, 'tentacule', c.x, f.z * 0.6, m, 12); break; }
    case 'fervor': for (const u of mine) { u.hasteUntil = s.combatTime + 6; u.hastePct = Math.max(u.hastePct, 0.4); u.buffUntil = s.combatTime + 6; u.buffDmg = 0.2 * POWER_LEVEL_FX[p.powerLv[slot]]; } break;
    case 'eruption': for (const e of foes) burnOn(s, caster, e, 6 * m, 5); break;
    case 'sunstrike': {
      const t = strongest(1)[0];
      if (t) {
        hurt(t, 260 * m);
        for (const e of foes) if (e !== t && dist2(e, t) <= 6.25) hurt(e, 55 * m, { splash: true });
        s.events.push({ t: 'explode', arena: p.team, x: t.x, z: t.z, r: 2.5 });
        f.x = t.x; f.z = t.z;
      }
      break;
    }
    case 'veil': for (const u of mine) { u.veilUntil = s.combatTime + 5; u.ambush = Math.max(u.ambush, 0.5); } break;
    case 'harvest': {
      const c = cellCenter(lane.slot, 2, 3);
      for (let i = 0; i < 5; i++) spawnToken(s, p, 'squelette', c.x, (i - 2) * 1.3, m);
      for (const u of mine) { u.lsUntil = s.combatTime + 8; u.lsPct = 0.3; }
      break;
    }
    case 'doom':
      for (const e of foes) {
        const th = e.boss ? 0.12 : 0.25;
        if (e.hp / e.maxHp < th) { e.hp = 0; kill(s, e, caster); }
        else hurt(e, e.hp * (e.boss ? 0.05 : 0.12), { dot: true });
      }
      break;
  }
  // Résonance: a power that helps the partner's lane, or two powers cast together
  const team = s.teams[p.team];
  if (assist) addReso(s, p.team, RESO_GAIN.powerAssist, p.pid);
  if (team.lastCast && team.lastCast.pid !== p.pid && s.combatTime - team.lastCast.t <= SYNC_WINDOW && team.syncWave !== s.wave) {
    team.syncWave = s.wave;
    addReso(s, p.team, RESO_GAIN.syncCast, p.pid);
  }
  team.lastCast = { pid: p.pid, t: s.combatTime };
  s.events.push({ t: 'cast', pid: p.pid, power: def.id, arena: p.team, x: f.x, z: f.z, assist });
}

// ---------------------------------------------------------------- tactical orders

/** Apply a tactical order of player p (validated by applyCommand). (x,z) = arena-local point, optional. */
export function applyOrder(s: GameState, p: PlayerState, order: OrderId, x?: number, z?: number) {
  const ct = s.combatTime;
  const mine = s.ents.filter(e => !e.enemy && !e.dead && e.owner === p.pid && e.arena === p.team);
  const foes = s.ents.filter(e => e.enemy && !e.dead && !e.rift && e.arena === p.team);
  let tx = x ?? 0, tz = z ?? 0, target = -1;
  const hasPoint = Number.isFinite(x) && Number.isFinite(z);
  switch (order) {
    case 'focus': {
      let t: Ent | undefined;
      if (hasPoint) { let bd = 9; for (const e of foes) { const d = dist2(e, { x: tx, z: tz }); if (d < bd) { bd = d; t = e; } } }
      if (!t) {
        // the most dangerous: boss > elite > toughest, own lane first
        const own = foes.filter(e => e.owner === p.pid);
        const pool = own.length ? own : foes;
        t = pool.slice().sort((a, b) => (Number(b.boss) - Number(a.boss)) || (Number(b.elite) - Number(a.elite)) || b.hp - a.hp)[0];
      }
      if (t) { t.focusUntil = ct + 7; t.focusBy = p.pid; target = t.id; tx = t.x; tz = t.z; for (const u of mine) if (u.task < 0) u.retarget = 0; }
      break;
    }
    case 'rally': {
      if (!hasPoint) {
        // around the most threatened group of your units
        let best: Ent | null = null, bn = -1;
        for (const u of mine) { let n = 0; for (const e of foes) if (dist2(e, u) <= 9) n++; if (n > bn) { bn = n; best = u; } }
        if (best) { tx = best.x; tz = best.z; } else { const c = cellCenter(p.slot, 3, 3); tx = c.x; tz = c.z; }
      }
      for (const u of s.ents) if (!u.enemy && !u.dead && u.arena === p.team && dist2(u, { x: tx, z: tz }) <= 3.5 * 3.5) u.rallyUntil = ct + 6;
      break;
    }
    case 'retreat':
      for (const u of mine) if (u.moveSpeed > 0) { u.retreatUntil = ct + 5; u.target = -1; }
      tx = mine.length ? mine.reduce((t, u) => t + u.x, 0) / mine.length : 0;
      tz = 0;
      break;
    case 'intercept':
      for (const u of mine) if (u.moveSpeed > 0 && (UNITS[u.defId]?.category === 'rapide' || u.summon || mine.length <= 4 || u.range < 2)) { u.interceptUntil = ct + 8; u.retarget = 0; }
      tx = 0; tz = 0;
      break;
    case 'purge':
      p.fogUntil = 0; p.jamUntil = 0;
      for (const u of mine) {
        u.stunUntil = 0; u.slowUntil = 0; u.slowPct = 0; u.poisonUntil = 0; u.burnUntil = 0;
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.1);
      }
      tx = cellCenter(p.slot, 6, 3).x; tz = 0;
      break;
  }
  s.events.push({ t: 'order', pid: p.pid, order, x: tx, z: tz, target, arena: p.team });
}

// ---------------------------------------------------------------- Résonance DUO effects

/** Detonate the team's DUO ability (channel finished). */
export function fireResonance(s: GameState, team: number) {
  const t = s.teams[team];
  const cast = t.resoCast!;
  t.resoCast = null;
  t.resoUses++;
  const ability = teamAbility(s, team);
  const k = waveScale(s) * (cast.sync ? 1.3 : 1);
  const dk = cast.sync ? 1.15 : 1; // durations / percentages scale less than damage
  const owner = s.players[cast.by];
  const caster: Ent = { ...PHANTOM, owner: cast.by, arena: team };
  const foes = () => s.ents.filter(e => e.enemy && !e.dead && !e.rift && e.arena === team);
  const allies = () => s.ents.filter(e => !e.enemy && !e.dead && e.arena === team);
  let fx = { x: 0, z: 0 };
  for (const f of ability.fx) {
    switch (f.k) {
      case 'stun': for (const e of foes()) stun(s, e, f.dur * dk); break;
      case 'slow': for (const e of foes()) { e.slowUntil = s.time + f.dur * dk; e.slowPct = Math.max(e.slowPct, Math.min(0.8, f.pct * dk)); } break;
      case 'push':
        for (const e of foes()) {
          if (e.leaked || e.boss) continue;
          const d = laneDir(s.players[e.owner].slot);
          e.x = Math.max(-LANE.spawnX, Math.min(LANE.spawnX, e.x - d * f.dist));
        }
        break;
      case 'mark': for (const e of foes()) { e.markUntil = s.time + f.dur * dk; e.markPct = Math.max(e.markPct, f.pct * dk); } break;
      case 'nova': {
        // bursts on the densest groups (both lanes)
        const pool = foes();
        const used: { x: number; z: number }[] = [];
        for (let i = 0; i < f.zones && pool.length; i++) {
          let best: Ent | null = null, bn = -1;
          for (const a of pool) {
            if (used.some(u => dist2(u, a) < f.r * f.r)) continue;
            let n = 0;
            for (const b of pool) if (dist2(a, b) <= f.r * f.r) n += b.boss ? 4 : 1;
            if (n > bn) { bn = n; best = a; }
          }
          if (!best) break;
          const c = { x: best.x, z: best.z };
          used.push(c);
          for (const e of pool) if (!e.dead && dist2(e, c) <= f.r * f.r) applyDamage(s, caster, e, f.dmg * k * (e.boss ? 1.5 : 1), { splash: true });
          s.events.push({ t: 'explode', arena: team, x: c.x, z: c.z, r: f.r });
          if (i === 0) fx = c;
        }
        break;
      }
      case 'burn': for (const e of foes()) burnOn(s, caster, e, f.dps * k, f.dur); break;
      case 'poison': for (const e of foes()) poisonOn(s, caster, e, f.dps * k, f.dur); break;
      case 'execute':
        for (const e of foes()) {
          if (e.boss) applyDamage(s, caster, e, e.maxHp * f.bossPct * dk, { dot: true });
          else if (e.hp / e.maxHp < f.th * dk) { e.hp = 0; kill(s, e, caster); }
        }
        break;
      case 'haste': for (const u of allies()) { u.hasteUntil = s.combatTime + f.dur; u.hastePct = Math.max(u.hasteUntil > s.combatTime ? u.hastePct : 0, f.pct * dk); } break;
      case 'dmg': for (const u of allies()) { u.buffUntil = s.combatTime + f.dur; u.buffDmg = Math.max(u.buffUntil > s.combatTime ? u.buffDmg : 0, f.pct * dk); } break;
      case 'heal': for (const u of allies()) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * f.pct * dk); s.events.push({ t: 'heal', id: u.id }); } break;
      case 'shield': for (const u of allies()) u.shield = Math.max(u.shield, u.maxHp * f.pct * dk); break;
      case 'coreHeal': { const c = t.core; c.hp = Math.min(c.maxHp, c.hp + c.maxHp * f.pct * dk); break; }
      case 'raise':
        for (const p of s.players.filter(q => q.team === team)) {
          const c = cellCenter(p.slot, 2, 3);
          for (let i = 0; i < f.n; i++) spawnToken(s, p, f.unit, c.x, (i - (f.n - 1) / 2) * 1.4, k * 0.5, f.life);
          s.events.push({ t: 'summon', arena: team, x: c.x, z: 0 });
        }
        break;
      case 'summon': {
        const e = spawnToken(s, owner, f.unit, 0, 0, k * 0.6 * (cast.sync ? 1.15 : 1), f.life);
        // in front of the Core, toward the busier lane
        const left = foes().filter(o => o.x < 0).length, right = foes().filter(o => o.x > 0).length;
        e.x = e.hx = (left >= right ? -1 : 1) * 6; e.z = e.hz = 0;
        s.events.push({ t: 'summon', arena: team, x: e.x, z: 0 });
        break;
      }
      case 'revive': {
        const fallen = s.fallen.filter(u => s.players[u.owner]?.team === team).slice(-f.max);
        for (const u of fallen) {
          const st = unitStats(u.defId, u.level, u.branch);
          const p = s.players[u.owner];
          const e = baseEnt(s, st, u.defId);
          e.arena = team; e.owner = p.pid; e.summon = true; e.ghost = true; e.level = u.level; e.branch = u.branch;
          e.maxHp = e.hp = Math.round(st.hp * 0.7); e.dmg = st.dmg * 0.8;
          e.x = e.hx = u.x; e.z = e.hz = u.z; e.radius = 0.35 * st.model.scale;
          if (st.tower) { e.moveSpeed = 2; e.range = Math.min(e.range, 4); }
          e.expires = s.combatTime + f.life;
          s.ents.push(e);
          s.events.push({ t: 'summon', arena: team, x: u.x, z: u.z });
        }
        break;
      }
      case 'dark': break; // visual only (renderer)
    }
  }
  journal(s, 'reso', cast.by, ability.id, cast.sync ? 1 : 0);
  s.events.push({ t: 'reso', team, k: 'fire', pid: cast.by, ability: ability.id, sync: cast.sync });
  void fx; void ANOMALY_WAVES;
}
