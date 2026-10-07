// GameState — the single source of truth, owned by the host. Pure data (JSON-serialisable).
import type { Ability, AttackType, Branch, DefenseType, FactionId } from '../data/types';
import type { RuneTile } from '../data/synergies';
import { CORE, ECONOMY, GRID, TIMING } from '../data/economy';
import { CoreUpgradeId } from '../data/economy';

export const STATE_VERSION = 2;

export type Phase = 'build' | 'combat' | 'resolution' | 'ended';
export type GameMode = 'vsai' | 'survival' | 'duel';
export type Difficulty = 'initiation' | 'normal' | 'difficile' | 'expert' | 'maitre';
export type Personality = 'defensive' | 'economic' | 'aggressive' | 'balanced';
export type FactionChoice = FactionId | 'random';

export interface Build {
  bid: number;
  defId: string; // base unit id
  level: number; // 1..5
  branch: Branch | null; // chosen at level 4, permanent
  col: number;
  row: number;
  placedWave: number;
  value: number; // gold invested
  dmgTotal: number;
}

export interface PlayerStats {
  dmgDealt: number;
  dmgTanked: number;
  goldEarned: number;
  etherProduced: number;
  maxWorkers: number;
  raidersSent: number;
  leaks: number;
  coreDamageCaused: number;
  maxDps: number;
  bestUnit: string;
  bestUnitDmg: number;
  upgrades: number;
  fusions: number;
  casts: number;
  kills: number;
  unitsBuilt: number;
  sentUnits: number;
  curses: number;
  // instrumentation (balance analysis / end-of-game report)
  goldArmy: number; // gold spent on units and level-ups
  raiderEther: number; raiderGold: number; // spent on sends
  raiderCoreDmg: number; // Core damage dealt by this player's sends
  powerDmg: number; // damage dealt by commander powers
  firstLeakWave: number; // 0 = never leaked
  helpDmg: number; helpKills: number; // damage / kills in the partner's lane
  saves: number; // leaked enemies killed before reaching the Core
}

export interface QueuedSend { r: string; to: number }

export interface PlayerState {
  pid: number; // team*2 + slot
  team: number;
  slot: number; // 0 = left lane, 1 = right lane
  name: string;
  isAI: boolean;
  personality: Personality;
  faction: FactionId;
  randomFaction: boolean;
  gold: number;
  ether: number;
  income: number;
  workers: number;
  draft: string[]; // the faction roster
  rerolls: number;
  builds: Build[];
  ready: boolean;
  powers: string[];
  powerChoice: string[] | null;
  raiderQueue: QueuedSend[];
  raiderCd: Record<string, number>; // raider id → first wave it is available again
  curseQueue: QueuedSend[];
  curseCd: Record<string, number>;
  powerLv: number[]; // commander powers level (1..3)
  powerCd: number[]; // seconds of combat before each power is ready
  fogUntil: number; // curses received: combat time until which they apply
  jamUntil: number;
  runes: RuneTile[];
  leakedThisWave: number;
  waveDmg: number;
  pauseVote: boolean;
  stats: PlayerStats;
}

export interface CoreState {
  hp: number;
  maxHp: number;
  up: Record<CoreUpgradeId, number>;
  cd: number;
  powCd: number;
}

export interface TeamState {
  id: number;
  core: CoreState;
  alive: boolean;
  dmgWaves: number; // Core damage taken from regular waves (analysis)
  dmgSends: number; // Core damage taken from opposing sends
}

export interface Ent {
  id: number;
  enemy: boolean;
  defId: string;
  level: number;
  branch: Branch | null;
  arena: number; // team index
  owner: number; // pid owning the unit, or lane-owner pid for enemies (bounty receiver)
  bid: number; // build id for units (-1 for summons)
  x: number;
  z: number;
  hx: number; // home (units)
  hz: number;
  hp: number;
  maxHp: number;
  shield: number;
  armor: number;
  dmg: number;
  atkSpeed: number;
  range: number;
  moveSpeed: number;
  attack: AttackType;
  defense: DefenseType;
  abilities: Ability[];
  radius: number;
  cd: number;
  target: number; // ent id, -1 none, -2 = core
  retarget: number;
  slowUntil: number;
  slowPct: number;
  shredUntil: number;
  shredPct: number;
  stunUntil: number;
  poisonUntil: number;
  poisonDps: number;
  poisonSrc: number;
  burnUntil: number;
  burnDps: number;
  burnSrc: number;
  hasteUntil: number;
  hastePct: number;
  lsUntil: number; // temporary lifesteal (commander power)
  lsPct: number;
  guard: number; // damage reduction from auras, recomputed every tick
  guardBase: number; // permanent reduction (synergies)
  crit: number; // critical chance
  dotMul: number;
  elite: boolean;
  expires: number; // temporary summons: combat time of disappearance (0 = never)
  back: boolean; // placed in the back line (fog curse)
  veilUntil: number; // untargetable (commander veil)
  buffUntil: number; // temporary damage buff
  buffDmg: number;
  mul: number; // stat multiplier it was spawned with (children / summons inherit it)
  stealth: boolean;
  ambush: number;
  lastAtk: number;
  raised: number;
  ramp: number;
  timers: number[];
  dashed: boolean;
  leaked: boolean;
  dead: boolean;
  boss: boolean;
  raider: boolean;
  summon: boolean;
  bounty: number;
  leakDamage: number;
  src: number; // pid that sent this enemy (-1 = regular wave)
}

export type GameEvent =
  | { t: 'atk'; a: number; b: number; fx: string; ranged: boolean; dmg: number; crit: boolean }
  | { t: 'coreShot'; team: number; b: number }
  | { t: 'die'; id: number; boss: boolean; x: number; z: number; arena: number; enemy: boolean }
  | { t: 'leak'; arena: number; pid: number }
  | { t: 'coreHit'; team: number; dmg: number }
  | { t: 'pulse'; arena: number; x: number; z: number; r: number; fx: string }
  | { t: 'explode'; arena: number; x: number; z: number; r: number }
  | { t: 'dash'; id: number }
  | { t: 'heal'; id: number }
  | { t: 'stun'; id: number }
  | { t: 'summon'; arena: number; x: number; z: number }
  | { t: 'ping'; pid: number; ping: string }
  | { t: 'build'; pid: number; bid: number }
  | { t: 'evolve'; pid: number; bid: number; level: number; branch: Branch | null }
  | { t: 'fuse'; pid: number; bid: number; col: number; row: number }
  | { t: 'curse'; pid: number; curse: string; to: number }
  | { t: 'hexed'; to: number; list: string[] }
  | { t: 'bossIn'; arena: number; id: string }
  | { t: 'powerUp'; pid: number; slot: number }
  | { t: 'sell'; pid: number }
  | { t: 'worker'; pid: number }
  | { t: 'raider'; pid: number; raider: string; to: number }
  | { t: 'sends'; from: number; to: number; list: string[] }
  | { t: 'cast'; pid: number; power: string; arena: number; x: number; z: number }
  | { t: 'coreUp'; pid: number; up: string }
  | { t: 'wave'; n: number; boss: boolean }
  | { t: 'combat' }
  | { t: 'income'; pid: number; gold: number }
  | { t: 'msg'; pid: number; text: string }
  | { t: 'end'; result: string };

export interface HumanSlot { name: string; faction?: FactionChoice }

export interface GameSettings {
  mode: GameMode;
  totalWaves: number; // 10 or 21 (survival: infinite after 21)
  difficulty: Difficulty;
  humans: HumanSlot[]; // 1 or 2 humans; missing partner = AI
  tutorial?: boolean;
}

export interface GameResult {
  /** outcome from team 0's point of view (kept for compatibility); use `winner` per viewer */
  outcome: 'victory' | 'defeat';
  winner: number; // team index, -1 = none (survival)
  wave: number;
  reason: string;
}

export interface GameState {
  v: number;
  settings: GameSettings;
  seed: number;
  rng: number;
  tick: number;
  time: number;
  wave: number;
  phase: Phase;
  timer: number;
  timerMax: number;
  waveEvent: string | null; // random event of the current/next wave (announced during the preparation)
  lastEvent: string | null;
  ending: number; // > 0 during the end-of-game sequence
  combatTime: number;
  speed: number;
  paused: boolean;
  teams: TeamState[];
  players: PlayerState[];
  ents: Ent[];
  nextId: number;
  events: GameEvent[];
  result: GameResult | null;
}

export const DT = 1 / TIMING.tickRate;

// ---------- Arena geometry (local coords per arena; team arenas are offset only when rendering) ----------
export const LANE = {
  spawnX: 33,
  gridFrontX: 27, // front edge (spawn side) of the build grid
  leakX: 12, // passing |x| < leakX = leaked into the Core zone
  halfWidth: 4,
  coreRadius: 2.4, // castle gate: leaked enemies detonate here
};

/** Direction enemies travel along x in lane `slot` (slot 0 = left lane, enemies move +x). */
export function laneDir(slot: number) { return slot === 0 ? 1 : -1; }

export function cellCenter(slot: number, col: number, row: number) {
  const d = laneDir(slot);
  const x = -d * (LANE.gridFrontX - (col + 0.5) * GRID.cell);
  const z = (row - (GRID.rows - 1) / 2) * GRID.cell;
  return { x, z };
}

export function newStats(): PlayerStats {
  return {
    dmgDealt: 0, dmgTanked: 0, goldEarned: 0, etherProduced: 0, maxWorkers: ECONOMY.startWorkers,
    raidersSent: 0, leaks: 0, coreDamageCaused: 0, maxDps: 0, bestUnit: '', bestUnitDmg: 0,
    upgrades: 0, fusions: 0, casts: 0, kills: 0, unitsBuilt: 0, sentUnits: 0, curses: 0,
    goldArmy: 0, raiderEther: 0, raiderGold: 0, raiderCoreDmg: 0, powerDmg: 0, firstLeakWave: 0, helpDmg: 0, helpKills: 0, saves: 0,
  };
}

export function newCore(): CoreState {
  return { hp: CORE.hp, maxHp: CORE.hp, up: { atk: 0, regen: 0, def: 0, pow: 0 }, cd: 0, powCd: 7 };
}

export function teamCount(s: GameState) { return s.settings.mode === 'survival' ? 1 : 2; }

export function playersOfTeam(s: GameState, team: number) { return s.players.filter(p => p.team === team); }

/** Opposing lane owners that pid may send to (vs-AI mode only). */
export function opponents(s: GameState, pid: number): PlayerState[] {
  if (s.settings.mode === 'survival') return [];
  const p = s.players[pid];
  return s.players.filter(o => o.team !== p.team);
}

/** Default target of pid's sends: the mirrored opposing lane. */
export function raiderTarget(s: GameState, pid: number): PlayerState | null {
  if (s.settings.mode === 'survival') return null;
  const p = s.players[pid];
  return s.players.find(o => o.team !== p.team && o.slot === p.slot) ?? null;
}

/** Human pids per mode: co-op humans share team 0, duel puts them on opposite teams. */
export function humanPid(mode: GameMode, index: number) { return mode === 'duel' ? index * 2 : index; }

export function humanPlayers(s: GameState) { return s.players.filter(p => !p.isAI); }

export { TIMING, ECONOMY };
