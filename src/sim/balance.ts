// Balance model (Lanchester-style): a group's fighting strength ≈ sqrt(ΣDPS × ΣEHP).
// Used for the "recommended army value" indicator, the AI, and scripts/balance.ts.
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { DAMAGE_MATRIX, ECONOMY } from '../data/economy';
import { getWave } from '../data/waves';
import type { CombatStats, AttackType, DefenseType } from '../data/types';

export function unitDps(s: CombatStats): number {
  let dps = s.dmg * s.atkSpeed;
  for (const a of s.abilities) {
    if (a.kind === 'splash') dps *= 1 + a.pct * 1.2;
    if (a.kind === 'chain') dps *= 1 + a.pct * a.targets * 0.8;
    if (a.kind === 'ramp') dps *= 1 + a.max * 0.6;
    if (a.kind === 'auraAttackSpeed') dps += 25 * a.pct * 4; // value of buffing ~4 allies (abstract)
    if (a.kind === 'slowPulse') dps += (a.dmg / a.every) * 3;
    if (a.kind === 'execute') dps *= 1 + a.pct * 0.25;
    if (a.kind === 'bonusVsSlowed') dps *= 1 + a.pct * 0.3;
  }
  return dps;
}

export function unitEhp(s: CombatStats): number {
  let ehp = s.hp / (1 - s.armor);
  for (const a of s.abilities) {
    if (a.kind === 'heal') ehp += (a.amount / a.every) * 25;
    if (a.kind === 'shieldStart') ehp += a.amount * 3;
    if (a.kind === 'lifesteal') ehp *= 1 + a.pct;
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
  const ids = ['ferraille', 'lame_ronce', 'tireuse_etoile', 'harmoniste'];
  const g = groupStrength(ids.map(id => ({ stats: UNITS[id] })));
  const cost = ids.reduce((t, id) => t + UNITS[id].cost, 0);
  return Math.sqrt(g.dps * g.ehp) / cost;
})();

/**
 * Recommended army value for wave n given a current army (list of unit defIds) and its gold value.
 * Strength scales ~linearly with value for a fixed composition, so value_needed = value × target/ratio.
 */
export function recommendedValue(n: number, armyIds: string[], armyValue: number, target = 1.25): number {
  const wave = waveGroup(n);
  if (armyIds.length === 0 || armyValue <= 0) {
    const waveS = Math.sqrt(wave.dps * wave.ehp);
    return Math.round((waveS * target) / REF_POWER_PER_GOLD);
  }
  const army = groupStrength(armyIds.map(id => ({ stats: UNITS[id] })));
  const r = fightRatio(army, wave);
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
