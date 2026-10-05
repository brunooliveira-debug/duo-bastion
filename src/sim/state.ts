// GameState — the single source of truth, owned by the host. Pure data (JSON-serialisable).
import type { Ability, AttackType, DefenseType } from '../data/types';
import { CORE, ECONOMY, GRID, TIMING } from '../data/economy';
import { CoreUpgradeId } from '../data/economy';

export type Phase = 'build' | 'combat' | 'resolution' | 'ended';
export type GameMode = 'vsai' | 'survival';
export type Difficulty = 'initiation' | 'normal' | 'difficile' | 'expert' | 'maitre';
export type Personality = 'defensive' | 'economic' | 'aggressive' | 'balanced';

export interface Build {
  bid: number;
  defId: string;
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
}

export interface PlayerState {
  pid: number; // team*2 + slot
  team: number;
  slot: number; // 0 = left lane, 1 = right lane
  name: string;
  isAI: boolean;
  personality: Personality;
  gold: number;
  ether: number;
  income: number;
  workers: number;
  draft: string[];
  rerolls: number;
  builds: Build[];
  ready: boolean;
  powers: string[];
  powerChoice: string[] | null;
  raiderQueue: string[];
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
}

export interface Ent {
  id: number;
  enemy: boolean;
  defId: string;
  arena: number; // team index
  owner: number; // pid owning the unit, or lane-owner pid for enemies (bounty receiver)
  bid: number; // build id for units
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
  ramp: number;
  timers: number[];
  dashed: boolean;
  leaked: boolean;
  dead: boolean;
  boss: boolean;
  raider: boolean;
  bounty: number;
  leakDamage: number;
}

export type GameEvent =
  | { t: 'atk'; a: number; b: number; fx: string; ranged: boolean }
  | { t: 'coreShot'; team: number; b: number }
  | { t: 'die'; id: number; boss: boolean; x: number; z: number; arena: number }
  | { t: 'leak'; arena: number; pid: number }
  | { t: 'coreHit'; team: number; dmg: number }
  | { t: 'pulse'; arena: number; x: number; z: number; r: number; fx: string }
  | { t: 'dash'; id: number }
  | { t: 'heal'; id: number }
  | { t: 'ping'; pid: number; ping: string }
  | { t: 'build'; pid: number; bid: number }
  | { t: 'evolve'; pid: number; bid: number }
  | { t: 'sell'; pid: number }
  | { t: 'worker'; pid: number }
  | { t: 'raider'; pid: number; raider: string }
  | { t: 'coreUp'; pid: number; up: string }
  | { t: 'wave'; n: number; boss: boolean }
  | { t: 'combat' }
  | { t: 'income'; pid: number; gold: number }
  | { t: 'msg'; pid: number; text: string }
  | { t: 'end'; result: string };

export interface GameSettings {
  mode: GameMode;
  totalWaves: number; // 10 or 21 (survival: infinite after 21)
  difficulty: Difficulty;
  humans: { name: string }[]; // 1 or 2 humans; missing partner = AI
  tutorial?: boolean;
}

export interface GameResult {
  outcome: 'victory' | 'defeat';
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
  coreRadius: 1.8,
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
  };
}

export function newCore(): CoreState {
  return { hp: CORE.hp, maxHp: CORE.hp, up: { atk: 0, regen: 0, def: 0, pow: 0 }, cd: 0, powCd: 7 };
}

export function teamCount(s: GameState) { return s.settings.mode === 'vsai' ? 2 : 1; }

export function playersOfTeam(s: GameState, team: number) { return s.players.filter(p => p.team === team); }

/** Opponent lane-owner receiving raiders from pid. */
export function raiderTarget(s: GameState, pid: number): PlayerState | null {
  if (s.settings.mode !== 'vsai') return null;
  const p = s.players[pid];
  return s.players.find(o => o.team !== p.team && o.slot === p.slot) ?? null;
}

export function humanPlayers(s: GameState) { return s.players.filter(p => !p.isAI); }

export { TIMING, ECONOMY };
