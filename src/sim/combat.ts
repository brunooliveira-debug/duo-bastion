// CombatSystem + TargetingSystem + AbilitySystem + commander powers. Operates on GameState.ents during combat.
import { UNITS, unitStats, LEVEL_MUL } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, DAMAGE_MATRIX } from '../data/economy';
import { FACTION_POWERS, POWER_LEVEL_FX } from '../data/powers';
import type { Ability, CombatStats } from '../data/types';
import { getWave } from '../data/waves';
import { DT, Ent, GameState, LANE, PlayerState, laneDir, cellCenter } from './state';
import { buildBonuses } from './synergy';
import { rand } from './rng';

const AGGRO = 4.5; // enemy notices units within this distance (+ own range)
/** Units hold their ground: they only engage enemies this close to their own cell while their lane is busy,
 *  so the fight happens inside the towers' range and placement (front / back line) really matters. */
const LEASH = 3.5;
const RETARGET = 0.5;
const BIG_HP = 900;
const BASE_CRIT = 0.07, CRIT_MUL = 1.8;
/** every leak hurts: an undefended wave costs a real chunk of the Core */
const LEAK_MUL = 1.8;

export interface SpawnSpec { enemy: string; hpMul: number; dmgMul: number; raider?: boolean; elite?: boolean; speedMul?: number; shieldPct?: number }

function hasPower(p: PlayerState | undefined, id: string) { return !!p && p.powers.includes(id); }

function dist2(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}
function ab<K extends Ability['kind']>(e: Ent, kind: K): Extract<Ability, { kind: K }> | undefined {
  for (const a of e.abilities) if (a.kind === kind) return a as Extract<Ability, { kind: K }>;
  return undefined;
}

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
    dashed: false, leaked: false, dead: false, boss: false, raider: false, summon: false, bounty: 0, leakDamage: 0,
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
      if (extra.length) { e.abilities = [...e.abilities, ...extra]; e.timers.push(...extra.map(() => 0)); }
      if (hasPower(p, 'mutation')) e.maxHp *= 1.2;
      if (hasPower(p, 'surcharge')) e.atkSpeed *= 1.25;
      if (hasPower(p, 'fureur')) e.dmg *= 1.15;
      if (hasPower(p, 'rempart')) e.armor = 1 - (1 - e.armor) * 0.88;
      if (hasPower(p, 'precision') && e.range > 2) { e.dmg *= 1.2; e.range += 0.5; }
      if (s.waveEvent === 'overcharge') { e.hasteUntil = 12; e.hastePct = 0.4; }
      e.maxHp = Math.round(e.maxHp); e.hp = e.maxHp;
      if (ab(e, 'stealth')) { e.stealth = true; e.ambush = ab(e, 'stealth')!.ambush; }
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
        for (const o of s.ents) if (!o.enemy && o.arena === e.arena && dist2(o, e) <= a.radius * a.radius) o.shield += a.amount * reso;
      } else if (a.kind === 'summon') {
        const mul = Math.pow(LEVEL_MUL[e.level] ?? 1, 0.8);
        for (let i = 0; i < a.count; i++) spawnToken(s, owner, a.unit, e.x + laneDir(owner.slot) * -0.8, e.z, mul);
      } else if (a.kind === 'veilStart') {
        for (const o of s.ents) if (!o.enemy && o.arena === e.arena && dist2(o, e) <= a.radius * a.radius) { o.stealth = true; o.ambush = Math.max(o.ambush, 0.4); }
      }
    }
  }
}

function enemyEnt(s: GameState, it: SpawnSpec, team: number, owner: number): Ent {
  const def = ENEMIES[it.enemy];
  const e = baseEnt(s, def, it.enemy);
  e.enemy = true; e.arena = team; e.owner = owner; e.mul = it.hpMul;
  e.maxHp = e.hp = Math.round(def.hp * it.hpMul * (it.elite ? 4 : 1));
  e.dmg = def.dmg * it.dmgMul * (it.elite ? 1.5 : 1);
  e.bounty = def.bounty * (it.elite ? 6 : 1);
  e.leakDamage = Math.round(def.leakDamage * LEAK_MUL * Math.sqrt(it.dmgMul) * (it.elite ? 2 : 1));
  e.boss = !!def.boss; e.raider = !!it.raider; e.elite = !!it.elite;
  e.moveSpeed *= it.speedMul ?? 1;
  if (it.shieldPct) e.shield = e.maxHp * it.shieldPct;
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

/** Spawn enemies at a point (boss calls, splits). */
function spawnEnemyAt(s: GameState, parent: Ent, unit: string, count: number) {
  for (let i = 0; i < count; i++) {
    const e = enemyEnt(s, { enemy: unit, hpMul: parent.mul, dmgMul: Math.sqrt(parent.mul), raider: parent.raider }, parent.arena, parent.owner);
    e.x = parent.x + (rand(s) - 0.5) * 1.6;
    e.z = Math.max(-LANE.halfWidth, Math.min(LANE.halfWidth, parent.z + (rand(s) - 0.5) * 1.6));
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
    if (src.bid >= 0) { const b = p.builds.find(x => x.bid === src.bid); if (b) b.dmgTotal += total; }
  }
  if (!t.enemy) s.players[t.owner].stats.dmgTanked += total;
  // thorns
  if (src && !o.dot && !o.splash && src.range < 2 && !src.dead) {
    const th = ab(t, 'thorns');
    if (th) { src.hp -= total * th.pct; if (src.hp <= 0) kill(s, src, t); }
  }
  if (t.hp <= 0) kill(s, t, src);
  return total;
}

function kill(s: GameState, t: Ent, killer: Ent | null) {
  if (t.dead) return;
  t.dead = true;
  t.hp = 0;
  s.events.push({ t: 'die', id: t.id, boss: t.boss, x: t.x, z: t.z, arena: t.arena, enemy: t.enemy });
  if (t.enemy) {
    // Bounty: lane owner if killed in its lane; otherwise the killer's owner (core kills give nothing).
    let pid = -1;
    if (!t.leaked) pid = t.owner;
    else if (killer && !killer.enemy) pid = killer.owner;
    if (pid >= 0 && t.bounty > 0) {
      const p = s.players[pid];
      const ev = s.waveEvent === 'double' ? 2 : s.waveEvent === 'rush' ? 1.5 : 1;
      const g = Math.round(t.bounty * ev * (p.powers.includes('fortune') ? 1.5 : 1));
      p.gold += g;
      p.stats.goldEarned += g;
    }
    if (killer && !killer.enemy) s.players[killer.owner].stats.kills++;
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
  }
  const sp = ab(t, 'split');
  if (sp) {
    if (t.enemy) spawnEnemyAt(s, t, sp.unit, sp.count);
    else for (let i = 0; i < sp.count; i++) spawnToken(s, s.players[t.owner], sp.unit, t.x, t.z, Math.pow(LEVEL_MUL[t.level] ?? 1, 0.8));
    s.events.push({ t: 'summon', arena: t.arena, x: t.x, z: t.z });
  }
}

function stun(s: GameState, t: Ent, dur: number) {
  const d = t.boss ? dur * 0.5 : dur;
  if (t.stunUntil < s.time + d) t.stunUntil = s.time + d;
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
  const burnAb = ab(a, 'burn');
  for (const x of a.abilities) {
    switch (x.kind) {
      case 'ramp': a.ramp = Math.min(x.max, a.ramp + x.perHit); break;
      case 'slowOnHit': t.slowUntil = s.time + x.duration; t.slowPct = Math.max(t.slowPct, x.slow); break;
      case 'armorShred': t.shredUntil = s.time + x.duration; t.shredPct = Math.max(t.shredUntil > s.time ? t.shredPct : 0, x.pct); break;
      case 'burn': burnOn(s, a, t, x.dps * a.dotMul * eclat, x.duration); break;
      case 'stunOnHit': if (rand(s) < x.chance) stun(s, t, x.duration); break;
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
          const d2 = applyDamage(s, a, best, a.dmg * effMul(a, best) * x.pct * eclat, { pierce });
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

function inLaneRegion(e: Ent) { return !e.leaked; }

function hidden(s: GameState, u: Ent, from: Ent) {
  if (!(u.stealth || u.veilUntil > s.combatTime)) return false;
  return dist2(u, from) > 1.3 * 1.3;
}

function chooseTarget(s: GameState, e: Ent, arenaEnts: Ent[], range: number) {
  if (!e.enemy) {
    const p = s.players[e.owner];
    const icp = ab(e, 'interceptor');
    if (icp) {
      // hunters: leaked and fast enemies first, anywhere in the arena
      let best = -1, bs = Infinity;
      for (const o of arenaEnts) {
        if (!o.enemy || o.dead) continue;
        const d = Math.sqrt(dist2(o, e));
        if (d > icp.radius) continue;
        const score = d - (o.leaked ? 30 : 0) - o.moveSpeed * 2.5;
        if (score < bs) { bs = score; best = o.id; }
      }
      if (best >= 0) { e.target = best; return; }
    }
    // Units defend their own lane first; once it is clear they are free to help the partner / Core.
    let own = false;
    for (const o of arenaEnts) if (o.enemy && !o.dead && o.owner === p.pid && inLaneRegion(o)) { own = true; break; }
    let best = -1, bd = Infinity;
    const immobile = e.moveSpeed <= 0;
    const leash = own && !e.summon ? (LEASH + e.range) ** 2 : Infinity;
    const assist = own && !e.summon ? (LEASH * 2.2 + e.range) ** 2 : Infinity; // help allies already in melee
    for (const o of arenaEnts) {
      if (!o.enemy || o.dead) continue;
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

/** One combat tick for every arena. */
export function combatTick(s: GameState) {
  const byArena: Ent[][] = s.teams.map(() => []);
  for (const e of s.ents) if (!e.dead) byArena[e.arena].push(e);

  for (let ai = 0; ai < byArena.length; ai++) {
    const list = byArena[ai];
    const map = new Map<number, Ent>();
    for (const e of list) map.set(e.id, e);

    // ---- auras ----
    const asBuff = new Map<number, number>();
    for (const e of list) e.guard = 0;
    for (const e of list) {
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
      if (e.expires > 0 && s.combatTime >= e.expires) { e.bounty = 0; kill(s, e, null); continue; }
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
          case 'regen': e.hp = Math.min(e.maxHp, e.hp + e.maxHp * a.pct * DT); break;
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
            if (best) { best.hp = Math.min(best.maxHp, best.hp + a.amount * reso); s.events.push({ t: 'heal', id: best.id }); e.timers[i] = a.every; }
            else e.timers[i] = 0.3;
            break;
          }
          case 'shieldPulse': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let any = false;
            for (const o of list) if (o.enemy === e.enemy && !o.dead && dist2(o, e) <= a.radius * a.radius) { o.shield = Math.max(o.shield, a.amount * reso); any = true; }
            if (any) { s.events.push({ t: 'pulse', arena: ai, x: e.x, z: e.z, r: a.radius, fx: e.enemy ? 'enemyShield' : 'shield' }); e.timers[i] = a.every; }
            else e.timers[i] = 0.3;
            break;
          }
          case 'hastePulse': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let any = false;
            for (const o of list) if (o.enemy === e.enemy && !o.dead && dist2(o, e) <= a.radius * a.radius) { o.hasteUntil = s.combatTime + a.duration; o.hastePct = Math.max(o.hasteUntil > s.combatTime ? o.hastePct : 0, a.pct * reso); any = true; }
            if (any) { s.events.push({ t: 'pulse', arena: ai, x: e.x, z: e.z, r: a.radius, fx: 'haste' }); e.timers[i] = a.every; }
            break;
          }
          case 'slowPulse': case 'stunPulse': case 'novaPulse': {
            e.timers[i] -= DT;
            if (e.timers[i] > 0 || stunned) break;
            let any = false;
            for (const o of list) {
              if (o.enemy === e.enemy || o.dead || dist2(o, e) > a.radius * a.radius) continue;
              any = true;
              if (a.kind === 'slowPulse') { o.slowUntil = s.time + a.duration; o.slowPct = Math.max(o.slowPct, a.slow); }
              if (a.kind === 'stunPulse') stun(s, o, a.duration);
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
            if (e.timers[i] > 0) break;
            spawnEnemyAt(s, e, a.unit, a.count);
            s.events.push({ t: 'summon', arena: ai, x: e.x, z: e.z });
            e.timers[i] = a.every;
            break;
          }
        }
      });
      if (!e.enemy && hasPower(owner, 'regeneration')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * DT);
    }

    // ---- dashes (assassins) at combat start ----
    for (const e of list) {
      if (e.enemy || e.dashed || e.dead) continue;
      const dash = ab(e, 'dash');
      if (!dash) { e.dashed = true; continue; }
      let best: Ent | null = null, bd = -1;
      for (const o of list) {
        if (!o.enemy || o.dead) continue;
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
    for (const e of list) {
      if (e.dead) continue;
      if (e.stunUntil > s.time) continue;
      const range = effRange(s, e);
      e.retarget -= DT;
      const cur = e.target >= 0 ? map.get(e.target) : undefined;
      if (e.retarget <= 0 || (e.target >= 0 && (!cur || cur.dead)) || e.target === -1) {
        chooseTarget(s, e, list, range);
        e.retarget = RETARGET;
      }
      const slow = e.slowUntil > s.time ? 1 - e.slowPct : 1;
      if (e.slowUntil <= s.time) e.slowPct = 0;
      let spdMul = slow, asMul = 1 + e.ramp + (asBuff.get(e.id) ?? 0) + (e.hasteUntil > s.combatTime ? e.hastePct : 0);
      const enr = e.enemy ? ab(e, 'enrage') : undefined;
      if (enr && e.hp < e.maxHp * enr.below) { spdMul *= 1 + enr.speed; asMul *= 1 + enr.atkSpeed; }
      const spd = e.moveSpeed * spdMul;
      e.cd -= DT * asMul * slow;

      if (e.target === -2) {
        // reached the Core: detonates for its leak damage (no bounty)
        const team = s.teams[e.arena];
        const dmg = e.leakDamage * (1 - CORE.upgrades.def.per * team.core.up.def);
        team.core.hp -= dmg;
        s.players[e.owner].stats.coreDamageCaused += dmg;
        s.events.push({ t: 'coreHit', team: e.arena, dmg });
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
        if (d > reach) { if (spd > 0) moveToward(e, t.x, t.z, spd); else e.target = -1; }
        else if (e.cd <= 0 && !boom) { hit(s, e, t, map); e.cd = 1 / Math.max(0.05, e.atkSpeed); e.cd = Math.min(e.cd, 4); }
      } else if (e.enemy) {
        // walk the lane toward the Core
        const d = laneDir(enemySlot(s, e));
        if (!e.leaked) {
          moveToward(e, e.x + d * 3, e.z * 0.98, spd);
          if (Math.abs(e.x) < LANE.leakX) {
            e.leaked = true;
            const p = s.players[e.owner];
            p.stats.leaks++; p.leakedThisWave++;
            s.events.push({ t: 'leak', arena: e.arena, pid: e.owner });
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
          const wa = a.boss || a.moveSpeed <= 0 ? 0.05 : 1, wb = b.boss || b.moveSpeed <= 0 ? 0.05 : 1;
          a.x -= nx * push * wa; a.z -= nz * push * wa;
          b.x += nx * push * wb; b.z += nz * push * wb;
        }
      }
      // keep inside the arena
      if (!a.leaked && Math.abs(a.x) > LANE.leakX - 1) a.z = Math.max(-LANE.halfWidth, Math.min(LANE.halfWidth, a.z));
      // stop at core surface
      const dc = Math.hypot(a.x, a.z);
      if (dc < LANE.coreRadius + a.radius) {
        const k = (LANE.coreRadius + a.radius) / Math.max(dc, 1e-3);
        a.x *= k; a.z *= k;
      }
    }

    // ---- Core attacks ----
    const team = s.teams[ai];
    const core = team.core;
    core.cd -= DT;
    if (core.cd <= 0) {
      let best: Ent | null = null, bd = CORE.range * CORE.range;
      for (const o of list) {
        if (!o.enemy || o.dead) continue;
        const d = o.x * o.x + o.z * o.z;
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        const dmg = CORE.dmg * (1 + CORE.upgrades.atk.per * core.up.atk) * DAMAGE_MATRIX[CORE.attack][best.defense];
        applyDamage(s, null, best, dmg);
        s.events.push({ t: 'coreShot', team: ai, b: best.id });
        core.cd = 1 / CORE.atkSpeed;
      }
    }
    if (core.up.pow > 0) {
      core.powCd -= DT;
      if (core.powCd <= 0) {
        const r = 5;
        let any = false;
        for (const o of list) if (o.enemy && !o.dead && o.x * o.x + o.z * o.z <= r * r) { any = true; applyDamage(s, null, o, CORE.upgrades.pow.per * core.up.pow, { splash: true }); }
        if (any) { s.events.push({ t: 'pulse', arena: ai, x: 0, z: 0, r, fx: 'core' }); core.powCd = 7; }
        else core.powCd = 0.5;
      }
    }
  }

  s.ents = s.ents.filter(e => !e.dead);
}

export function enemiesAlive(s: GameState, arena?: number) {
  for (const e of s.ents) if (e.enemy && !e.dead && (arena === undefined || e.arena === arena)) return true;
  return false;
}

// ---------------------------------------------------------------- commander powers

function laneEnemies(s: GameState, p: PlayerState) { return s.ents.filter(e => e.enemy && !e.dead && e.arena === p.team && e.owner === p.pid); }
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
  return { ...e, id: -9, range: 99, hp: 1e9, maxHp: 1e9, abilities: [], attack: 'arca' };
})();

/** Apply faction power `slot` of player p (validated by applyCommand). */
export function castPower(s: GameState, p: PlayerState, slot: number) {
  const def = FACTION_POWERS[p.faction][slot];
  // damage follows how tough enemies are at this wave: a cast is strong, never a wave-clear on its own
  const m = POWER_LEVEL_FX[p.powerLv[slot]] * getWave(s.wave).hpMul * (1 + 0.05 * (s.wave - 1));
  const foes = laneEnemies(s, p);
  const mine = laneUnits(s, p);
  // phantom source: credits the player, never takes thorns damage
  const caster: Ent = { ...PHANTOM, owner: p.pid, arena: p.team };
  const f = focus(s, p, foes);
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
      for (const u of mine) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * k); s.events.push({ t: 'heal', id: u.id }); }
      break;
    }
    case 'roots': for (const e of foes) { stun(s, e, 2.5); poisonOn(s, caster, e, 6 * m, 4); } break;
    case 'forest': {
      const c = cellCenter(p.slot, 1, 3);
      const t = spawnToken(s, p, 'sylvain', c.x, f.z * 0.5, m, 20);
      t.x = (t.x + f.x) / 2;
      break;
    }
    case 'bubble': for (const u of mine) u.shield = Math.max(u.shield, u.maxHp * 0.25 * POWER_LEVEL_FX[p.powerLv[slot]]); break;
    case 'tide': {
      const d = laneDir(p.slot);
      for (const e of foes) {
        if (!e.leaked) e.x = Math.max(-LANE.spawnX, Math.min(LANE.spawnX, e.x - d * 4.5));
        e.slowUntil = s.time + 4; e.slowPct = Math.max(e.slowPct, 0.55);
      }
      break;
    }
    case 'krakenCall': { const c = cellCenter(p.slot, 0, 3); spawnToken(s, p, 'tentacule', c.x, f.z * 0.6, m, 12); break; }
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
      const c = cellCenter(p.slot, 2, 3);
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
  s.events.push({ t: 'cast', pid: p.pid, power: def.id, arena: p.team, x: f.x, z: f.z });
}
