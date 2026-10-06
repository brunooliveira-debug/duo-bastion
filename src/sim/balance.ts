// Balance model (Lanchester-style): a group's fighting strength ≈ sqrt(ΣDPS × ΣEHP).
// Used for the "recommended army value" indicator, the AI, and scripts/balance-report.ts.
import { UNITS, unitStats } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { DAMAGE_MATRIX, ECONOMY } from '../data/economy';
import { getWave } from '../data/waves';
import type { CombatStats, AttackType, DefenseType } from '../data/types';

export function unitDps(s: CombatStats): number {
  let dps = s.dmg * s.atkSpeed;
  const base = dps;
  for (const a of s.abilities) {
    switch (a.kind) {
      case 'splash': dps *= 1 + a.pct * 1.2; break;
      case 'chain': dps *= 1 + a.pct * a.targets * 0.8; break;
      case 'ramp': dps *= 1 + a.max * 0.6; break;
      case 'auraAttackSpeed': dps += 25 * a.pct * 4; break; // value of buffing ~4 allies (abstract)
      case 'hastePulse': dps += 25 * a.pct * 4 * Math.min(1, a.duration / a.every); break;
      case 'slowPulse': dps += (a.dmg / a.every) * 3; break;
      case 'stunPulse': dps += (a.dmg / a.every) * 3; break;
      case 'novaPulse': dps += (a.dmg / a.every + a.burn) * 3; break;
      case 'execute': dps *= 1 + a.pct * 0.25; break;
      case 'bonusVsSlowed': dps *= 1 + a.pct * 0.3; break;
      case 'bonusVsDef': dps *= 1 + a.pct * 0.25; break;
      case 'bonusVsBig': dps *= 1 + a.pct * 0.25; break;
      case 'pierce': dps *= 1 + a.pct * 0.12; break;
      case 'armorShred': dps *= 1 + a.pct * 0.6; break;
      case 'stunOnHit': dps *= 1 + a.chance * a.duration * 0.6; break;
      case 'poison': dps += a.dps * (1 + a.radius * 1.2); break;
      case 'burn': dps += a.dps * 0.8; break;
      case 'stealth': dps *= 1 + a.ambush * 0.15; break;
      case 'dash': dps *= 1.05; break;
      case 'thorns': dps += a.pct * 15; break;
      case 'explode': dps += a.dmg * 0.3; break;
      case 'enrage': dps *= 1 + a.atkSpeed * 0.3; break;
      case 'summon': if (UNITS[a.unit]) dps += unitDps(UNITS[a.unit]) * a.count; break;
      case 'raise': if (UNITS[a.unit]) dps += unitDps(UNITS[a.unit]) * a.max * 0.4; break;
      case 'spawn': if (ENEMIES[a.unit]) dps += unitDps(ENEMIES[a.unit]) * a.count * (20 / a.every); break;
    }
  }
  void base;
  return dps;
}

export function unitEhp(s: CombatStats): number {
  let ehp = s.hp / (1 - s.armor);
  for (const a of s.abilities) {
    switch (a.kind) {
      case 'heal': ehp += (a.amount / a.every) * 25; break;
      case 'shieldStart': ehp += a.amount * 3; break;
      case 'shieldPulse': ehp += (a.amount / a.every) * 3 * 25; break;
      case 'lifesteal': ehp *= 1 + a.pct; break;
      case 'regen': ehp *= 1 + a.pct * 15; break;
      case 'guardAura': ehp *= 1 + a.pct * 4; break;
      case 'stealth': ehp *= 1.4; break;
      case 'veilStart': ehp *= 1.1; break;
      case 'stunPulse': ehp *= 1 + (a.duration / a.every) * 1.5; break;
      case 'resist': ehp *= 1 + a.pct * 0.4; break;
      case 'resistSplash': ehp *= 1 + a.pct * 0.2; break;
      case 'summon': if (UNITS[a.unit]) ehp += unitEhp(UNITS[a.unit]) * a.count; break;
      case 'raise': if (UNITS[a.unit]) ehp += unitEhp(UNITS[a.unit]) * a.max * 0.4; break;
      case 'split': ehp += ((UNITS[a.unit] ?? ENEMIES[a.unit])?.hp ?? 0) * a.count; break;
      case 'spawn': if (ENEMIES[a.unit]) ehp += ENEMIES[a.unit].hp * a.count * (20 / a.every); break;
    }
  }
  return ehp;
}

export interface Strength { dps: number; ehp: number; s: number; atk: Record<AttackType, number>; def: Record<DefenseType, number> }

function emptyStrength(): Strength {
  return { dps: 0, ehp: 0, s: 0, atk: { phys: 0, perf: 0, ener: 0, arca: 0 }, def: { leg: 0, org: 0, bli: 0, mys: 0 } };
}

export function groupStrength(list: { stats: CombatStats; hpMul?: number; dmgMul?: number }[]): Strength {
  const g = emptyStrength();
  for (const { stats, hpMul = 1, dmgMul = 1 } of list) {
    const d = unitDps(stats) * dmgMul;
    const e = unitEhp(stats) * hpMul;
    g.dps += d; g.ehp += e;
    g.atk[stats.attack] += d;
    g.def[stats.defense] += e;
  }
  g.s = Math.sqrt(g.dps * g.ehp);
  return g;
}

/** Average damage multiplier of attacker group `a` against defender group `b`. */
export function matchup(a: Strength, b: Strength): number {
  if (a.dps <= 0 || b.ehp <= 0) return 1;
  let m = 0;
  for (const at of Object.keys(a.atk) as AttackType[]) {
    for (const df of Object.keys(b.def) as DefenseType[]) {
      m += (a.atk[at] / a.dps) * (b.def[df] / b.ehp) * DAMAGE_MATRIX[at][df];
    }
  }
  return m;
}

export function waveGroup(n: number, extra: { enemy: string; hpMul: number }[] = []) {
  const w = getWave(n);
  const list: { stats: CombatStats; hpMul: number; dmgMul: number }[] = [];
  for (const g of w.groups) for (let i = 0; i < g.count; i++) list.push({ stats: ENEMIES[g.enemy], hpMul: w.hpMul, dmgMul: w.dmgMul });
  for (const e of extra) list.push({ stats: ENEMIES[e.enemy], hpMul: e.hpMul, dmgMul: e.hpMul });
  return groupStrength(list);
}

/** Fight score: >1 means the army should win. Accounts for type matchups. */
export function fightRatio(army: Strength, wave: Strength): number {
  if (army.ehp <= 0) return 0;
  const aDps = army.dps * matchup(army, wave);
  const wDps = wave.dps * matchup(wave, army);
  // time-to-kill comparison: army kills wave in wave.ehp/aDps, wave kills army in army.ehp/wDps
  return Math.sqrt((army.ehp / wDps) / (wave.ehp / aDps));
}

/** Baseline: strength per gold of an average reference army (used when the army is empty). */
const REF_POWER_PER_GOLD = (() => {
  const ids = ['ferraille', 'lame_ronce', 'tireuse_etoile', 'harmoniste', 'gardien_ecorce', 'archere_cendres'];
  const g = groupStrength(ids.map(id => ({ stats: UNITS[id] })));
  const cost = ids.reduce((t, id) => t + UNITS[id].cost, 0);
  return Math.sqrt(g.dps * g.ehp) / cost;
})();

export interface ArmyUnit { defId: string; level?: number; branch?: 'A' | 'B' | null }
export function armyStats(list: ArmyUnit[]): CombatStats[] { return list.map(b => unitStats(b.defId, b.level ?? 1, b.branch ?? null)); }

/**
 * Recommended army value for wave n given a current army and its gold value.
 * Strength scales ~linearly with value for a fixed composition, so value_needed = value × target/ratio.
 */
export function recommendedValue(n: number, army: ArmyUnit[], armyValue: number, target = 1.25): number {
  const wave = waveGroup(n);
  if (army.length === 0 || armyValue <= 0) {
    const waveS = Math.sqrt(wave.dps * wave.ehp);
    return Math.round((waveS * target) / REF_POWER_PER_GOLD);
  }
  const g = groupStrength(armyStats(army).map(stats => ({ stats })));
  const r = fightRatio(g, wave);
  return Math.round((armyValue * target) / Math.max(0.05, r));
}

export type Risk = 'green' | 'orange' | 'red';
export function riskOf(value: number, rec: number): Risk {
  if (value >= rec) return 'green';
  if (value >= rec * 0.8) return 'orange';
  return 'red';
}

/** Expected total gold available by wave n without eco investment (for balance tables). */
export function expectedGold(n: number): number {
  let g = ECONOMY.startGold;
  for (let w = 1; w < n; w++) {
    const wave = getWave(w);
    const bounty = wave.groups.reduce((t, gr) => t + ENEMIES[gr.enemy].bounty * gr.count, 0);
    g += ECONOMY.startIncome + bounty + ECONOMY.waveClearBonus;
  }
  return g;
}

/** Rough "power" bucket shown to opponents (no exact numbers: keeps some uncertainty). */
export function powerBucket(value: number): string {
  if (value < 300) return 'Faible';
  if (value < 800) return 'Moyenne';
  if (value < 1800) return 'Solide';
  if (value < 3500) return 'Redoutable';
  return 'Écrasante';
}
