// Shared data-definition types. All gameplay numbers live in src/data/*.ts.

export type AttackType = 'phys' | 'perf' | 'ener' | 'arca';
export type DefenseType = 'leg' | 'org' | 'bli' | 'mys';
export type Role =
  | 'tank' | 'dps' | 'ranged' | 'support' | 'aura' | 'aoe'
  | 'assassin' | 'mage' | 'summoner' | 'carry' | 'hybrid';

export type FactionId = 'astreens' | 'rouages' | 'ronces' | 'abysses' | 'solaires' | 'necrose';

/** Abilities are composable data blocks interpreted by AbilitySystem. */
export type Ability =
  | { kind: 'taunt'; radius: number }
  | { kind: 'thorns'; pct: number }
  | { kind: 'ramp'; perHit: number; max: number } // attack speed gain per hit
  | { kind: 'bonusVsSlowed'; pct: number }
  | { kind: 'slowPulse'; every: number; radius: number; slow: number; duration: number; dmg: number }
  | { kind: 'slowOnHit'; slow: number; duration: number }
  | { kind: 'splash'; radius: number; pct: number }
  | { kind: 'auraAttackSpeed'; radius: number; pct: number }
  | { kind: 'heal'; every: number; amount: number; range: number }
  | { kind: 'dash'; range: number }
  | { kind: 'execute'; threshold: number; pct: number }
  | { kind: 'chain'; targets: number; pct: number; range: number }
  | { kind: 'lifesteal'; pct: number }
  | { kind: 'shieldStart'; amount: number; radius: number }
  | { kind: 'summon'; unit: string; count: number }
  | { kind: 'armorShred'; pct: number; duration: number };

export interface ModelDef {
  /** primitive silhouette archetype used by the renderer */
  shape: 'golem' | 'blade' | 'archer' | 'turtle' | 'mage' | 'bard' | 'shade' | 'prism'
    | 'crawler' | 'fly' | 'runner' | 'armored' | 'gunner' | 'caster' | 'brute' | 'boss' | 'core';
  color: number;
  accent: number;
  scale: number;
}

export interface CombatStats {
  hp: number;
  armor: number; // 0..0.5 flat % reduction
  dmg: number;
  atkSpeed: number; // attacks per second
  range: number; // world units (melee ~1)
  moveSpeed: number;
  attack: AttackType;
  defense: DefenseType;
  abilities: Ability[];
}

export interface UnitDef extends CombatStats {
  id: string;
  name: string;
  faction: FactionId;
  tier: number;
  cost: number; // gold, for base units; for evolutions: upgrade cost
  roles: Role[];
  description: string;
  skillText: string;
  passiveText: string;
  evolvesTo?: string;
  isEvolution?: boolean;
  model: ModelDef;
  /** sound/fx keys (resolved by AudioSystem / renderer) */
  sfx: string;
  fx: string;
}

export interface EnemyDef extends CombatStats {
  id: string;
  name: string;
  bounty: number;
  leakDamage: number; // core damage per hit when attacking the Core
  model: ModelDef;
  boss?: boolean;
  description: string;
}

export interface WaveDef {
  n: number;
  name: string;
  groups: { enemy: string; count: number }[];
  hpMul: number;
  dmgMul: number;
  danger: string;
  boss?: boolean;
}

export interface RaiderDef {
  id: string;
  name: string;
  category: 'eco' | 'power';
  cost: number; // ether
  income: number; // income gained by sender
  unlockWave: number;
  enemy: string; // enemy def used when spawned
  hpMul: number;
  description: string;
}

export interface PowerDef {
  id: string;
  name: string;
  icon: string;
  description: string;
}
