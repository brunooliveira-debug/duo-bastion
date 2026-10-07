// Shared data-definition types. All gameplay numbers live in src/data/*.ts.

export type AttackType = 'phys' | 'perf' | 'ener' | 'arca';
export type DefenseType = 'leg' | 'org' | 'bli' | 'mys';
export type Role =
  | 'tank' | 'dps' | 'ranged' | 'support' | 'aura' | 'aoe'
  | 'assassin' | 'mage' | 'summoner' | 'carry' | 'hybrid';

/** Strategic family shown on the cards (one per unit). */
export type UnitCategory = 'defense' | 'lourde' | 'portee' | 'antiblindage' | 'zone' | 'soutien' | 'rapide' | 'speciale';

export type FactionId = 'astreens' | 'rouages' | 'ronces' | 'abysses' | 'solaires' | 'necrose';
export type Branch = 'A' | 'B';

/** Abilities are composable data blocks interpreted by the combat system (units AND enemies). */
export type Ability =
  | { kind: 'taunt'; radius: number }
  | { kind: 'thorns'; pct: number }
  | { kind: 'ramp'; perHit: number; max: number } // attack speed gain per hit
  | { kind: 'bonusVsSlowed'; pct: number }
  | { kind: 'slowPulse'; every: number; radius: number; slow: number; duration: number; dmg: number }
  | { kind: 'stunPulse'; every: number; radius: number; duration: number; dmg: number }
  | { kind: 'novaPulse'; every: number; radius: number; dmg: number; burn: number } // fire burst around the unit
  | { kind: 'slowOnHit'; slow: number; duration: number }
  | { kind: 'splash'; radius: number; pct: number }
  | { kind: 'auraAttackSpeed'; radius: number; pct: number }
  | { kind: 'hastePulse'; every: number; radius: number; pct: number; duration: number } // temporary attack-speed boost
  | { kind: 'heal'; every: number; amount: number; range: number }
  | { kind: 'regen'; pct: number } // % max HP per second
  | { kind: 'dash'; range: number }
  | { kind: 'execute'; threshold: number; pct: number }
  | { kind: 'chain'; targets: number; pct: number; range: number }
  | { kind: 'lifesteal'; pct: number }
  | { kind: 'shieldStart'; amount: number; radius: number }
  | { kind: 'shieldPulse'; every: number; amount: number; radius: number } // temporary shield
  | { kind: 'summon'; unit: string; count: number } // at combat start
  | { kind: 'raise'; unit: string; chance: number; max: number; radius: number } // enemy dies nearby → minion
  | { kind: 'armorShred'; pct: number; duration: number }
  | { kind: 'guardAura'; radius: number; pct: number } // allies nearby take -pct damage
  | { kind: 'pierce'; pct: number } // ignores pct of the target's armour
  | { kind: 'bonusVsDef'; def: DefenseType; pct: number }
  | { kind: 'bonusVsBig'; pct: number } // vs bosses / targets with ≥ 900 max HP
  | { kind: 'poison'; dps: number; duration: number; radius: number } // DoT around the target, ignores armour
  | { kind: 'burn'; dps: number; duration: number } // fire DoT on the target (and splash victims)
  | { kind: 'stunOnHit'; chance: number; duration: number }
  | { kind: 'interceptor'; radius: number } // hunts leaked / fast enemies first
  | { kind: 'stealth'; ambush: number } // camouflaged until it strikes; first hit +ambush
  | { kind: 'veilStart'; radius: number } // camouflages nearby allies when combat starts
  | { kind: 'ignoreTaunt' }
  | { kind: 'resist'; attack: AttackType; pct: number }
  | { kind: 'split'; unit: string; count: number } // on death
  | { kind: 'explode'; dmg: number; radius: number } // kamikaze on contact
  | { kind: 'enrage'; below: number; speed: number; atkSpeed: number } // boss: faster when wounded
  | { kind: 'spawn'; unit: string; count: number; every: number } // boss: calls minions
  | { kind: 'resistSplash'; pct: number } // boss: takes less area damage
  /** boss: telegraphed slam on the densest group of units within reach (red zone on the ground during the windup) */
  | { kind: 'slam'; every: number; windup: number; radius: number; dmg: number; stun: number; reach: number };

export type Shape =
  // defenders
  | 'golem' | 'blade' | 'archer' | 'turtle' | 'mage' | 'bard' | 'shade' | 'prism'
  | 'paladin' | 'wolf' | 'lancer' | 'colossus' | 'bomber' | 'driller' | 'mechanic' | 'turret'
  | 'treant' | 'sower' | 'druid' | 'sapling' | 'merman' | 'jelly' | 'priestess' | 'kraken'
  | 'duelist' | 'xbow' | 'elemental' | 'boneguard' | 'skeleton' | 'necro' | 'censer' | 'abom'
  // enemies
  | 'crawler' | 'fly' | 'runner' | 'armored' | 'gunner' | 'caster' | 'brute' | 'boss'
  | 'ghost' | 'shaman' | 'blob' | 'sapper' | 'champion' | 'core'
  // v0.4: secondary rift objective, mechanical leviathan (Résonance)
  | 'rift' | 'leviathan';

export interface ModelDef {
  /** primitive silhouette archetype used by the renderer */
  shape: Shape;
  color: number;
  accent: number;
  scale: number;
}

export interface CombatStats {
  hp: number;
  armor: number; // 0..0.6 flat % reduction
  dmg: number;
  atkSpeed: number; // attacks per second
  range: number; // world units (melee ~1)
  moveSpeed: number;
  attack: AttackType;
  defense: DefenseType;
  abilities: Ability[];
}

/** Level-4 specialisation of a unit (permanent once chosen). */
export interface BranchDef {
  name: string;
  text: string; // one line: what changes
  hp?: number; dmg?: number; atkSpeed?: number; moveSpeed?: number; // multipliers
  range?: number; armor?: number; // additive
  add?: Ability[]; // new or replacing abilities (same kind replaces)
  remove?: Ability['kind'][];
  color?: number; accent?: number;
}

/** Garrisoned units fire from a tower on their cell (static in combat, +range from height). */
export type TowerStyle = 'archer' | 'mage' | 'cannon' | 'shrine' | 'spire' | 'ice' | 'fire' | 'poison' | 'dark';

export interface UnitDef extends CombatStats {
  id: string;
  name: string;
  faction: FactionId;
  category: UnitCategory;
  tier: number;
  cost: number; // gold to build (level 1)
  roles: Role[];
  description: string;
  skillText: string;
  passiveText: string;
  pros: string;
  cons: string;
  branches?: [BranchDef, BranchDef];
  tower?: TowerStyle;
  /** summoned minion: never drafted, never built */
  token?: boolean;
  model: ModelDef;
  /** sound/fx keys (resolved by AudioSystem / renderer) */
  sfx: string;
  fx: string;
}

/** Boss phase: triggers once when its HP falls under `at` (fraction). */
export interface BossPhase {
  at: number;
  name: string;
  speed?: number; atkSpeed?: number; // permanent bonuses (fractions)
  spawn?: { unit: string; count: number };
  shield?: number; // fraction of max HP
  slamFaster?: number; // slam cooldown multiplier
}

export interface EnemyDef extends CombatStats {
  id: string;
  name: string;
  bounty: number;
  leakDamage: number; // core damage when it reaches the Core
  model: ModelDef;
  boss?: boolean;
  /** mini-boss / boss mechanic shown in the alert */
  mechanic?: string;
  /** short epithet shown in the boss introduction */
  title?: string;
  phases?: BossPhase[];
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

export type RaiderCategory = 'eco' | 'rapide' | 'blinde' | 'resistant' | 'special' | 'puissant' | 'champion';

/** A "send": a pack of enemies a player buys to attack an opposing lane at the next wave. */
export interface RaiderDef {
  id: string;
  name: string;
  category: RaiderCategory;
  ether: number;
  gold: number;
  income: number; // permanent income gained by the sender
  unlockWave: number; // in a 21-wave game (scaled for shorter games)
  units: { enemy: string; count: number }[];
  hpMul: number;
  cooldown: number; // waves before the same send is available again (0 = none)
  maxPerWave: number;
  description: string;
  counter: string; // how the receiver can answer
}

export interface PowerDef {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  title: string; // play-style keyword
  color: string;
  lore: string;
  style: string;
  strengths: string[];
  weaknesses: string[];
  units: string[]; // 6 base unit ids
  /** army-wide passive that defines its play style (v0.4) */
  doctrine: { name: string; text: string };
  /** effect of its units when they come to help the partner's lane (cross-army synergy, v0.4) */
  help: { name: string; text: string };
}
