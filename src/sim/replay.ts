// Deterministic replay of a logged game (v0.8). The daily leaderboard is validated server-side by replaying the
// player's commands on the same seed: the server trusts nothing but the command log, and the simulation does the rest.
// Pure (no DOM, no network): shared by the client (local check) and the Supabase edge function.
import { applyCommand, Command, createGame, drainEvents, step } from './game';
import type { GameSettings, GameState } from './state';
import { TIMING } from '../data/economy';

/** One accepted command and the tick it was applied at (between two simulation steps). */
export interface LoggedCmd { t: number; p: number; c: Command }

export interface ReplayCheckpoint { state: GameState; i: number }
export interface ReplayResult {
  /** the game reached its end (or the log is invalid) */
  done: boolean;
  /** false = the log cannot be a real game */
  valid: boolean;
  reason?: string;
  state: GameState;
  /** index of the next command to apply */
  i: number;
  ticks: number;
}

/** Longest replayable game: 3 hours of game time. */
export const REPLAY_MAX_TICKS = TIMING.tickRate * 3 * 3600;
export const REPLAY_MAX_CMDS = 20000;
/** Commands the replay refuses (never logged by the client: no effect on the simulation, or test only). */
const FORBIDDEN = new Set(['speed', 'pause', 'ping', 'debug']);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Structural check of a command log coming from the network (ticks non-decreasing, known commands, sane sizes). */
export function validateLog(log: unknown): log is LoggedCmd[] {
  if (!Array.isArray(log) || log.length > REPLAY_MAX_CMDS) return false;
  let last = 0;
  for (const e of log) {
    if (!e || typeof e !== 'object') return false;
    const { t, p, c } = e as Partial<LoggedCmd>;
    if (!Number.isInteger(t) || (t as number) < last || (t as number) > REPLAY_MAX_TICKS) return false;
    if (!Number.isInteger(p) || (p as number) < 0 || (p as number) > 3) return false;
    if (!c || typeof c !== 'object' || typeof c.c !== 'string' || FORBIDDEN.has(c.c)) return false;
    last = t as number;
  }
  return true;
}

/**
 * Replays `log` on a fresh game (or continues from a checkpoint) until the game ends or `budgetMs` of wall time
 * is spent (the caller then stores the checkpoint and calls again: the server has a CPU budget per request).
 */
export function replay(settings: GameSettings, seed: number, log: LoggedCmd[], opts: { budgetMs?: number; from?: ReplayCheckpoint; /** tests / debugging: stop at this tick instead of the end */ stopTick?: number } = {}): ReplayResult {
  const s = opts.from?.state ?? createGame(settings, seed);
  let i = opts.from?.i ?? 0;
  const t0 = now();
  let ticks = 0;
  while (s.phase !== 'ended' && (opts.stopTick === undefined || s.tick < opts.stopTick)) {
    while (i < log.length && log[i].t <= s.tick) { applyCommand(s, log[i].p, log[i].c); i++; }
    if (s.paused) s.paused = false; // pauses are not part of the log (they never change the simulation)
    step(s);
    drainEvents(s);
    ticks++;
    if (s.tick > REPLAY_MAX_TICKS) return { done: true, valid: false, reason: 'too_long', state: s, i, ticks };
    if (opts.budgetMs !== undefined && (ticks & 31) === 0 && now() - t0 > opts.budgetMs) return { done: false, valid: true, state: s, i, ticks };
  }
  return { done: true, valid: true, state: s, i, ticks };
}

/** The daily-challenge score of a finished game (identical on the client and on the server). */
export function dailyScore(s: { wave: number; teams: { core: { hp: number } }[]; time: number }) {
  return { wave: s.wave, hp: Math.round(Math.max(0, s.teams[0].core.hp)), seconds: Math.round(s.time) };
}
