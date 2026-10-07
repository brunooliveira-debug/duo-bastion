// GameState — the single source of truth, owned by the host. Pure data (JSON-serialisable).
import type { Ability, AttackType, Branch, DefenseType, FactionId } from '../data/types';
import type { RuneTile } from '../data/synergies';
import type { ModuleId } from '../data/modules';
import type { AnomalyId, RiftReward } from '../data/tactics';
import { CORE, ECONOMY, GRID, TIMING } from '../data/economy';

export const STATE_VERSION = 3;

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
  tanked: number; // lifetime damage absorbed (end-of-game analysis)
  healed: number; // lifetime healing / shields given
  ctrl: number; // lifetime crowd control applied (seconds of stun / slow)
  fused: number; // fusions merged into this unit: each gives the "Éclat de fusion" bonus
  rift: boolean; // assigned to close the secondary rift this wave
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
  orders: number; // tactical orders given
  resoGain: number; // Résonance charge brought to the team
  riftsClosed: number;
  etherModules: number; // Éther put into Bastion modules
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
  hazards: { col: number; row: number }[]; // cells hurting the unit standing on them (Rune instable)
  orders: number; // tactical order charges left this wave
  orderCd: number; // combat time before the next order is allowed
  anomalyVote: AnomalyId | null;
  riftReward: boolean; // the rift of this lane was closed this wave (reward granted)
  waveHelpKills: number; // kills in the partner's lane this wave (journal: "défense sauvée")
  helpWave: number; // last wave a cross-army help effect was announced (one hint per wave)
  souls: number; // Nécrose "Moisson": enemies slain this wave
  leakedThisWave: number;
  waveDmg: number;
  pauseVote: boolean;
  stats: PlayerStats;
}

export interface CoreState {
  hp: number;
  maxHp: number;
  cd: number;
  powCd: number; // Onde Bastion
  beamCd: number; // Rayon Prismatique
  chainCd: number; // Entrave
  shield: number; // Égide (absorbs leak damage, refilled each wave)
  portal: number; // Portail de Repli uses left this wave
  repaired: number; // Rouages "Réparation" healing already received this wave
}

export interface ModuleSlot { id: ModuleId; lv: number }
export interface Proposal {
  by: number; // proposer pid
  action: 'install' | 'upgrade' | 'remove';
  module: ModuleId;
  slot: number;
  cost: number; // Éther escrowed by the proposer (0 for a removal)
  at: number; // game time of the proposal (auto-accept after PROPOSAL_TIMEOUT)
}
export interface ResoCast { by: number; fireAt: number; sync: boolean; syncBy: number }

export interface TeamState {
  id: number;
  core: CoreState;
  alive: boolean;
  dmgWaves: number; // Core damage taken from regular waves (analysis)
  dmgSends: number; // Core damage taken from opposing sends
  reso: number; // Résonance DUO gauge (0..RESO_MAX)
  resoCast: ResoCast | null; // channel in progress
  resoUses: number;
  resoFullSeen: boolean; // "gauge full" already announced
  syncWave: number; // last wave a synchronised power pair granted charge
  lastCast: { pid: number; t: number } | null;
  modules: (ModuleSlot | null)[];
  proposal: Proposal | null;
  anomaly: { id: AnomalyId; until: number } | null;
  anomalyOffer: AnomalyId[] | null;
  bossBoost: number; // Fortune du Bastion: next boss HP multiplier
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
  back: boolean; // placed in the back line (fog curse, Aura de Cadence)
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
  // v0.4
  rift: boolean; // secondary rift (static objective, not a lane enemy)
  task: number; // unit assigned to the rift of this pid (-1 = none)
  markUntil: number; markPct: number; // takes +markPct damage
  wetUntil: number; // soaked by an abyssal helper: lightning deals +30 %
  focusUntil: number; focusBy: number; // FOCUS order target
  rallyUntil: number; // inside a RALLIEMENT zone
  retreatUntil: number; // REPLI
  interceptUntil: number; // INTERCEPTION
  tele: { x: number; z: number; r: number; at: number; dmg: number; stun: number } | null; // telegraphed boss attack
  phase: number; // boss phase reached
  ghost: boolean; // revived construct (Machine Interdite)
  growth: number; // Ronces "Croissance": waves survived on the field
  helped: number; // cross-army help effects already triggered by this unit this wave
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
  | { t: 'bossIn'; arena: number; id: string; eid: number }
  | { t: 'powerUp'; pid: number; slot: number }
  | { t: 'sell'; pid: number }
  | { t: 'worker'; pid: number }
  | { t: 'raider'; pid: number; raider: string; to: number }
  | { t: 'sends'; from: number; to: number; list: string[] }
  | { t: 'cast'; pid: number; power: string; arena: number; x: number; z: number; assist: boolean }
  | { t: 'wave'; n: number; boss: boolean }
  | { t: 'combat' }
  | { t: 'income'; pid: number; gold: number }
  | { t: 'msg'; pid: number; text: string }
  | { t: 'end'; result: string }
  // v0.4
  | { t: 'reso'; team: number; k: 'full' | 'start' | 'sync' | 'fire' | 'refund'; pid: number; ability: string; sync: boolean }
  | { t: 'order'; pid: number; order: string; x: number; z: number; target: number; arena: number }
  | { t: 'tele'; arena: number; id: number; x: number; z: number; r: number; dur: number }
  | { t: 'slam'; arena: number; x: number; z: number; r: number }
  | { t: 'bossPhase'; arena: number; id: number; def: string; phase: number }
  | { t: 'module'; team: number; pid: number; k: 'propose' | 'accept' | 'refuse' | 'auto' | 'cancel'; module: string; action: string; lv: number }
  | { t: 'anomaly'; team: number; k: 'offer' | 'vote' | 'pick'; id: string; pid: number }
  | { t: 'rift'; pid: number; k: 'open' | 'closed' | 'faded'; reward: string; arena: number; x: number; z: number }
  | { t: 'help'; pid: number; kind: string; arena: number; x: number; z: number }
  | { t: 'portal'; arena: number; x: number; z: number; x2: number; z2: number };

export interface HumanSlot { name: string; faction?: FactionChoice }

export interface GameSettings {
  mode: GameMode;
  totalWaves: number; // 10 or 21 (survival: infinite after 21)
  difficulty: Difficulty;
  humans: HumanSlot[]; // 1 or 2 humans; missing partner = AI
  tutorial?: boolean;
  challenge?: string; // 'daily:YYYY-MM-DD' — same seed, same world for everyone
  aiFactions?: Record<number, FactionId>; // fixed armies for AI players (daily challenge), by pid
}

export interface GameResult {
  /** outcome from team 0's point of view (kept for compatibility); use `winner` per viewer */
  outcome: 'victory' | 'defeat';
  winner: number; // team index, -1 = none (survival)
  wave: number;
  reason: string;
}

/** Secondary rift of the current wave (same for every lane: fair in duels). */
export interface RiftSpec { reward: RiftReward; hpMul: number; spawnMul: number; rewardMul: number }

/** Deterministic game journal (end-of-game timeline / replay analysis). Compact on purpose. */
export interface JournalEntry { w: number; k: string; p: number; a?: number | string; b?: number | string }

/** A unit destroyed this combat (Machine Interdite revives them as ghosts). */
export interface Fallen { owner: number; defId: string; level: number; branch: Branch | null; x: number; z: number }

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
  rift: RiftSpec | null; // secondary rift of the current/next wave
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
  fallen: Fallen[];
  journal: JournalEntry[];
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

/** Where the secondary rift of a lane opens (lane edge, just in front of the grid). */
export function riftPos(slot: number) {
  const d = laneDir(slot);
  return { x: -d * (LANE.gridFrontX + 2.2), z: slot === 0 ? -3.6 : 3.6 };
}

export function newStats(): PlayerStats {
  return {
    dmgDealt: 0, dmgTanked: 0, goldEarned: 0, etherProduced: 0, maxWorkers: ECONOMY.startWorkers,
    raidersSent: 0, leaks: 0, coreDamageCaused: 0, maxDps: 0, bestUnit: '', bestUnitDmg: 0,
    upgrades: 0, fusions: 0, casts: 0, kills: 0, unitsBuilt: 0, sentUnits: 0, curses: 0,
    goldArmy: 0, raiderEther: 0, raiderGold: 0, raiderCoreDmg: 0, powerDmg: 0, firstLeakWave: 0, helpDmg: 0, helpKills: 0, saves: 0,
    orders: 0, resoGain: 0, riftsClosed: 0, etherModules: 0,
  };
}

export function newCore(): CoreState {
  return { hp: CORE.hp, maxHp: CORE.hp, cd: 0, powCd: 7, beamCd: 4, chainCd: 6, shield: 0, portal: 0, repaired: 0 };
}

export function newTeam(id: number): TeamState {
  return {
    id, core: newCore(), alive: true, dmgWaves: 0, dmgSends: 0,
    reso: 0, resoCast: null, resoUses: 0, resoFullSeen: false, syncWave: 0, lastCast: null,
    modules: [null, null, null], proposal: null, anomaly: null, anomalyOffer: null, bossBoost: 1,
  };
}

export function teamCount(s: GameState) { return s.settings.mode === 'survival' ? 1 : 2; }

export function playersOfTeam(s: GameState, team: number) { return s.players.filter(p => p.team === team); }

/** The other player of p's team (co-op partner, AI partner in duels). */
export function partnerOf(s: GameState, pid: number) {
  const p = s.players[pid];
  return s.players.find(o => o.team === p.team && o.pid !== pid) ?? null;
}

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

/** Level of a Bastion module installed on a team's Core (0 = absent). */
export function moduleLv(t: TeamState, id: ModuleId) {
  for (const m of t.modules) if (m && m.id === id) return m.lv;
  return 0;
}

/** Active anomaly of a team (null when none / expired). */
export function anomalyOf(s: GameState, team: number): AnomalyId | null {
  const a = s.teams[team]?.anomaly;
  return a && s.wave <= a.until ? a.id : null;
}

export function journal(s: GameState, k: string, p: number, a?: number | string, b?: number | string) {
  s.journal.push(a === undefined ? { w: s.wave, k, p } : b === undefined ? { w: s.wave, k, p, a } : { w: s.wave, k, p, a, b });
}

export { TIMING, ECONOMY };
