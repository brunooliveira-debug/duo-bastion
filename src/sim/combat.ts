// CombatSystem + TargetingSystem + AbilitySystem. Operates on GameState.ents during the combat phase.
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, DAMAGE_MATRIX } from '../data/economy';
import type { Ability, CombatStats } from '../data/types';
import { DT, Ent, GameState, LANE, PlayerState, laneDir, cellCenter } from './state';

const AGGRO = 4.5; // enemy notices units within this distance (+ own range)
const RETARGET = 0.5;

function hasPower(p: PlayerState | undefined, id: string) { return !!p && p.powers.includes(id); }

function dist2(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function baseEnt(s: GameState, def: CombatStats, defId: string): Ent {
  return {
    id: s.nextId++, enemy: false, defId, arena: 0, owner: 0, bid: -1, x: 0, z: 0, hx: 0, hz: 0,
    hp: def.hp, maxHp: def.hp, shield: 0, armor: def.armor, dmg: def.dmg, atkSpeed: def.atkSpeed,
    range: def.range, moveSpeed: def.moveSpeed, attack: def.attack, defense: def.defense,
    abilities: def.abilities, radius: 0.4, cd: 0.2, target: -1, retarget: 0, slowUntil: 0, slowPct: 0,
    shredUntil: 0, shredPct: 0, ramp: 0, timers: def.abilities.map(a => ('every' in a ? a.every * 0.6 : 0)),
    dashed: false, leaked: false, dead: false, boss: false, raider: false, bounty: 0, leakDamage: 0,
  };
}

/** Spawn combat instances of every player's builds. */
export function spawnUnits(s: GameState) {
  for (const p of s.players) {
    for (const b of p.builds) {
      const def = UNITS[b.defId];
      const e = baseEnt(s, def, b.defId);
      const c = cellCenter(p.slot, b.col, b.row);
      e.arena = p.team; e.owner = p.pid; e.bid = b.bid;
      e.x = e.hx = c.x; e.z = e.hz = c.z;
      e.radius = 0.35 * def.model.scale;
      if (hasPower(p, 'mutation')) { e.maxHp *= 1.2; e.hp = e.maxHp; }
      if (hasPower(p, 'surcharge')) e.atkSpeed *= 1.25;
      if (hasPower(p, 'fureur')) e.dmg *= 1.15;
      if (hasPower(p, 'rempart')) e.armor = 1 - (1 - e.armor) * 0.88;
      if (hasPower(p, 'precision') && e.range > 2) { e.dmg *= 1.2; e.range += 0.5; }
      s.ents.push(e);
    }
  }
  // start-of-combat shields
  for (const e of s.ents) {
    if (e.enemy) continue;
    for (const a of e.abilities) {
      if (a.kind === 'shieldStart') {
        const mul = hasPower(s.players[e.owner], 'resonance') ? 1.5 : 1;
        for (const o of s.ents) if (!o.enemy && o.arena === e.arena && dist2(o, e) <= a.radius * a.radius) o.shield += a.amount * mul;
      }
    }
  }
}

/** Spawn an enemy formation at the start of lane `slot` in arena `team`. */
export function spawnEnemies(s: GameState, team: number, slot: number, owner: number, list: { enemy: string; hpMul: number; dmgMul: number; raider?: boolean }[], startOffset = 0) {
  const d = laneDir(slot);
  const perRow = 4;
  list.forEach((it, i) => {
    const def = ENEMIES[it.enemy];
    const e = baseEnt(s, def, it.enemy);
    e.enemy = true; e.arena = team; e.owner = owner;
    e.maxHp = e.hp = Math.round(def.hp * it.hpMul);
    e.dmg = def.dmg * it.dmgMul;
    e.bounty = def.bounty; e.leakDamage = Math.round(def.leakDamage * Math.sqrt(it.dmgMul));
    e.boss = !!def.boss; e.raider = !!it.raider;
    e.radius = 0.32 * def.model.scale;
    const rowI = i % perRow, colI = Math.floor(i / perRow);
    e.x = -d * (LANE.spawnX + startOffset + colI * 1.3);
    e.z = (rowI - (perRow - 1) / 2) * 1.6 + (colI % 2 ? 0.4 : -0.4);
    if (def.boss) e.z = 0;
    e.cd = 0.5;
    s.ents.push(e);
  });
}

function effMul(a: Ent, b: Ent) { return DAMAGE_MATRIX[a.attack][b.defense]; }

function applyDamage(s: GameState, src: Ent | null, t: Ent, raw: number) {
  if (t.dead) return 0;
  let dmg = raw * (1 - t.armor);
  if (t.shredUntil > s.time) dmg *= 1 + t.shredPct;
  if (t.shield > 0) {
    const absorbed = Math.min(t.shield, dmg);
    t.shield -= absorbed;
    dmg -= absorbed;
  }
  t.hp -= dmg;
  const total = raw * (1 - t.armor);
  // stats
  if (src && !src.enemy) {
    const p = s.players[src.owner];
    p.stats.dmgDealt += total;
    p.waveDmg += total;
    const b = p.builds.find(x => x.bid === src.bid);
    if (b) b.dmgTotal += total;
  }
  if (!t.enemy) s.players[t.owner].stats.dmgTanked += total;
  // thorns
  if (src && t.abilities.length) {
    for (const a of t.abilities) if (a.kind === 'thorns' && src.range < 2 && !src.dead) {
      src.hp -= total * a.pct;
      if (src.hp <= 0) kill(s, src, t);
    }
  }
  if (t.hp <= 0) kill(s, t, src);
  return total;
}

function kill(s: GameState, t: Ent, killer: Ent | null) {
  if (t.dead) return;
  t.dead = true;
  t.hp = 0;
  s.events.push({ t: 'die', id: t.id, boss: t.boss, x: t.x, z: t.z, arena: t.arena });
  if (t.enemy) {
    // Bounty: lane owner if killed in its lane; otherwise the killer's owner (core kills give nothing).
    let pid = -1;
    if (!t.leaked) pid = t.owner;
    else if (killer && !killer.enemy) pid = killer.owner;
    if (pid >= 0) {
      const p = s.players[pid];
      const g = Math.round(t.bounty * (p.powers.includes('fortune') ? 1.5 : 1));
      p.gold += g;
      p.stats.goldEarned += g;
    }
  }
}

function hit(s: GameState, a: Ent, t: Ent) {
  const owner = a.enemy ? undefined : s.players[a.owner];
  let dmg = a.dmg * effMul(a, t);
  for (const ab of a.abilities) {
    if (ab.kind === 'bonusVsSlowed' && t.slowUntil > s.time) dmg *= 1 + ab.pct;
    if (ab.kind === 'execute' && t.hp / t.maxHp < ab.threshold) dmg *= 1 + ab.pct;
  }
  if (hasPower(owner, 'fureur') && a.hp < a.maxHp * 0.5) dmg *= 1.13;
  const eclat = hasPower(owner, 'eclat') ? 1.4 : 1;
  const dealt = applyDamage(s, a, t, dmg);
  s.events.push({ t: 'atk', a: a.id, b: t.id, fx: a.enemy ? 'enemy' : UNITS[a.defId]?.fx ?? 'spark', ranged: a.range > 2 });
  for (const ab of a.abilities) {
    switch (ab.kind) {
      case 'ramp': a.ramp = Math.min(ab.max, a.ramp + ab.perHit); break;
      case 'lifesteal': a.hp = Math.min(a.maxHp, a.hp + dealt * ab.pct); break;
      case 'slowOnHit': t.slowUntil = s.time + ab.duration; t.slowPct = Math.max(t.slowPct, ab.slow); break;
      case 'armorShred': t.shredUntil = s.time + ab.duration; t.shredPct = ab.pct; break;
      case 'splash': {
        const r = ab.radius * (eclat > 1 ? 1.15 : 1);
        for (const o of s.ents) {
          if (o === t || o.dead || o.enemy !== t.enemy || o.arena !== t.arena) continue;
          if (dist2(o, t) <= r * r) applyDamage(s, a, o, a.dmg * effMul(a, o) * ab.pct * eclat);
        }
        s.events.push({ t: 'pulse', arena: t.arena, x: t.x, z: t.z, r, fx: a.enemy ? 'enemy' : UNITS[a.defId]?.fx ?? 'spark' });
        break;
      }
      case 'chain': {
        let from = t;
        const hitIds = new Set([t.id]);
        for (let i = 0; i < ab.targets; i++) {
          let best: Ent | null = null, bd = ab.range * ab.range;
          for (const o of s.ents) {
            if (o.dead || o.enemy !== t.enemy || o.arena !== t.arena || hitIds.has(o.id)) continue;
            const d = dist2(o, from);
            if (d < bd) { bd = d; best = o; }
          }
          if (!best) break;
          hitIds.add(best.id);
          applyDamage(s, a, best, a.dmg * effMul(a, best) * ab.pct * eclat);
          s.events.push({ t: 'atk', a: from.id, b: best.id, fx: 'lightning', ranged: true });
          from = best;
        }
        break;
      }
    }
  }
}

function inLaneRegion(e: Ent) { return !e.leaked; }

function chooseTarget(s: GameState, e: Ent, arenaEnts: Ent[]) {
  if (!e.enemy) {
    const p = s.players[e.owner];
    // Units defend their own lane first; once it is clear they are free to help the partner / Core.
    let own = false;
    for (const o of arenaEnts) if (o.enemy && !o.dead && o.owner === p.pid && inLaneRegion(o)) { own = true; break; }
    let best = -1, bd = Infinity;
    for (const o of arenaEnts) {
      if (!o.enemy || o.dead) continue;
      if (own && !(o.owner === p.pid && inLaneRegion(o))) continue;
      const d = dist2(o, e);
      if (d < bd) { bd = d; best = o.id; }
    }
    e.target = best;
  } else {
    // taunt first
    let best = -1, bd = Infinity;
    for (const o of arenaEnts) {
      if (o.enemy || o.dead) continue;
      for (const a of o.abilities) {
        if (a.kind === 'taunt') {
          const d = dist2(o, e);
          if (d <= a.radius * a.radius && d < bd) { bd = d; best = o.id; }
        }
      }
    }
    if (best < 0) {
      const lim = (AGGRO + e.range) ** 2;
      for (const o of arenaEnts) {
        if (o.enemy || o.dead) continue;
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

/** One combat tick for every arena. */
export function combatTick(s: GameState) {
  const byArena: Ent[][] = s.teams.map(() => []);
  for (const e of s.ents) if (!e.dead) byArena[e.arena].push(e);

  for (let ai = 0; ai < byArena.length; ai++) {
    const list = byArena[ai];
    const map = new Map<number, Ent>();
    for (const e of list) map.set(e.id, e);

    // ---- abilities with timers / auras ----
    const asBuff = new Map<number, number>();
    for (const e of list) {
      if (e.enemy && e.abilities.length === 0) continue;
      const owner = e.enemy ? undefined : s.players[e.owner];
      const reso = hasPower(owner, 'resonance') ? 1.5 : 1;
      e.abilities.forEach((a: Ability, i) => {
        if (a.kind === 'auraAttackSpeed') {
          for (const o of list) if (!o.enemy && o !== e && dist2(o, e) <= a.radius * a.radius) asBuff.set(o.id, Math.max(asBuff.get(o.id) ?? 0, a.pct * reso));
        } else if (a.kind === 'heal') {
          e.timers[i] -= DT;
          if (e.timers[i] <= 0) {
            let best: Ent | null = null, bl = 0.999;
            for (const o of list) {
              if (o.enemy !== e.enemy || dist2(o, e) > a.range * a.range) continue;
              const r = o.hp / o.maxHp;
              if (r < bl) { bl = r; best = o; }
            }
            if (best) { best.hp = Math.min(best.maxHp, best.hp + a.amount * reso); s.events.push({ t: 'heal', id: best.id }); e.timers[i] = a.every; }
            else e.timers[i] = 0.3;
          }
        } else if (a.kind === 'slowPulse') {
          e.timers[i] -= DT;
          if (e.timers[i] <= 0) {
            let any = false;
            const ecl = hasPower(owner, 'eclat') ? 1.4 : 1;
            for (const o of list) {
              if (o.enemy === e.enemy || dist2(o, e) > a.radius * a.radius) continue;
              any = true;
              o.slowUntil = s.time + a.duration; o.slowPct = Math.max(o.slowPct, a.slow);
              applyDamage(s, e, o, a.dmg * ecl * DAMAGE_MATRIX[e.attack][o.defense]);
            }
            if (any) { s.events.push({ t: 'pulse', arena: ai, x: e.x, z: e.z, r: a.radius, fx: e.enemy ? 'enemy' : 'water' }); e.timers[i] = a.every; }
            else e.timers[i] = 0.25;
          }
        }
      });
      if (!e.enemy && hasPower(owner, 'regeneration')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02 * DT);
    }

    // ---- dashes (assassins) at combat start ----
    for (const e of list) {
      if (e.enemy || e.dashed || e.dead) continue;
      const dash = e.abilities.find(a => a.kind === 'dash') as { kind: 'dash'; range: number } | undefined;
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
      e.retarget -= DT;
      const cur = e.target >= 0 ? map.get(e.target) : undefined;
      if (e.retarget <= 0 || (e.target >= 0 && (!cur || cur.dead)) || e.target === -1) {
        chooseTarget(s, e, list);
        e.retarget = RETARGET;
      }
      const slow = e.slowUntil > s.time ? 1 - e.slowPct : 1;
      if (e.slowUntil <= s.time) e.slowPct = 0;
      const spd = e.moveSpeed * slow;
      const asMul = (1 + e.ramp + (asBuff.get(e.id) ?? 0)) * slow;
      e.cd -= DT * asMul;

      if (e.target === -2) {
        // reached the Core: detonates for its leak damage (no bounty)
        const team = s.teams[e.arena];
        const dmg = e.leakDamage * (1 - CORE.upgrades.def.per * team.core.up.def);
        team.core.hp -= dmg;
        s.players[e.owner].stats.coreDamageCaused += dmg;
        s.events.push({ t: 'coreHit', team: e.arena, dmg });
        e.dead = true; e.hp = 0;
        s.events.push({ t: 'die', id: e.id, boss: e.boss, x: e.x, z: e.z, arena: e.arena });
        continue;
      }
      const t = e.target >= 0 ? map.get(e.target) : undefined;
      if (t && !t.dead) {
        const reach = e.range + e.radius + t.radius;
        const d = Math.sqrt(dist2(e, t));
        if (d > reach) moveToward(e, t.x, t.z, spd);
        else if (e.cd <= 0) { hit(s, e, t); e.cd = 1; }
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
      } else {
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
          const wa = a.boss ? 0.1 : 1, wb = b.boss ? 0.1 : 1;
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
        for (const o of list) if (o.enemy && !o.dead && o.x * o.x + o.z * o.z <= r * r) { any = true; applyDamage(s, null, o, CORE.upgrades.pow.per * core.up.pow); }
        if (any) { s.events.push({ t: 'pulse', arena: ai, x: 0, z: 0, r, fx: 'core' }); core.powCd = 7; }
        else core.powCd = 0.5;
      }
    }
  }

  s.ents = s.ents.filter(e => !e.dead || false);
}

export function enemiesAlive(s: GameState, arena?: number) {
  for (const e of s.ents) if (e.enemy && !e.dead && (arena === undefined || e.arena === arena)) return true;
  return false;
}
