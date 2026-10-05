// Compact view-state shared by host (local) and guests (network). The renderer/UI only read these.
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import type { GameEvent, GameState, GameSettings, Build, PlayerStats, GameResult, Phase } from '../sim/state';
import type { CoreUpgradeId } from '../data/economy';

export const DEF_IDS = [...Object.keys(UNITS), ...Object.keys(ENEMIES)];
const DEF_INDEX = new Map(DEF_IDS.map((id, i) => [id, i]));

export interface PlayerView {
  pid: number; team: number; slot: number; name: string; isAI: boolean;
  gold: number; ether: number; income: number; workers: number;
  draft: string[]; rerolls: number; builds: Build[]; ready: boolean;
  powers: string[]; powerChoice: string[] | null; raiderQueue: string[];
  pauseVote: boolean; leakedThisWave: number; stats: PlayerStats;
}
export interface MetaView {
  settings: GameSettings;
  wave: number; phase: Phase; timer: number; speed: number; paused: boolean;
  result: GameResult | null;
  teams: { hp: number; maxHp: number; up: Record<CoreUpgradeId, number> }[];
  players: PlayerView[];
}

export const F_ENEMY = 1, F_SLOW = 2, F_SHIELD = 4, F_LEAK = 8, F_BOSS = 16, F_RAIDER = 32;

export interface EntView { id: number; defId: string; x: number; z: number; hp: number; arena: number; flags: number; owner: number }

export function metaOf(s: GameState): MetaView {
  return {
    settings: s.settings, wave: s.wave, phase: s.phase, timer: s.timer, speed: s.speed, paused: s.paused, result: s.result,
    teams: s.teams.map(t => ({ hp: Math.max(0, t.core.hp), maxHp: t.core.maxHp, up: { ...t.core.up } })),
    players: s.players.map(p => ({
      pid: p.pid, team: p.team, slot: p.slot, name: p.name, isAI: p.isAI,
      gold: Math.floor(p.gold), ether: p.ether, income: p.income, workers: p.workers,
      draft: p.draft, rerolls: p.rerolls, builds: p.builds.map(b => ({ ...b })), ready: p.ready,
      powers: p.powers.slice(), powerChoice: p.powerChoice, raiderQueue: p.raiderQueue.slice(),
      pauseVote: p.pauseVote, leakedThisWave: p.leakedThisWave, stats: { ...p.stats },
    })),
  };
}

/** Packs entities into a flat int array (8 numbers / entity). */
export function packEnts(s: GameState): number[] {
  const out: number[] = [];
  for (const e of s.ents) {
    if (e.dead) continue;
    let f = 0;
    if (e.enemy) f |= F_ENEMY;
    if (e.slowUntil > s.time) f |= F_SLOW;
    if (e.shield > 0) f |= F_SHIELD;
    if (e.leaked) f |= F_LEAK;
    if (e.boss) f |= F_BOSS;
    if (e.raider) f |= F_RAIDER;
    out.push(e.id, DEF_INDEX.get(e.defId)!, Math.round(e.x * 20), Math.round(e.z * 20), Math.round((e.hp / e.maxHp) * 1000), e.arena, f, e.owner);
  }
  return out;
}

export function unpackEnts(a: number[]): Map<number, EntView> {
  const m = new Map<number, EntView>();
  for (let i = 0; i + 7 < a.length; i += 8) {
    m.set(a[i], { id: a[i], defId: DEF_IDS[a[i + 1]], x: a[i + 2] / 20, z: a[i + 3] / 20, hp: a[i + 4] / 1000, arena: a[i + 5], flags: a[i + 6], owner: a[i + 7] });
  }
  return m;
}

export interface Frame { w: number; ents: Map<number, EntView> }

/**
 * ViewState: what the client knows. Host feeds it every tick; guests feed it from network messages.
 * Provides interpolated entities for rendering.
 */
export class ViewState {
  meta: MetaView | null = null;
  frames: Frame[] = [];
  delay: number;
  events: GameEvent[] = [];
  private offset: number | null = null; // local wall - remote wall
  constructor(delay: number) { this.delay = delay; }

  setMeta(m: MetaView) { this.meta = m; }

  pushFrame(remoteWall: number, ents: Map<number, EntView>) {
    const now = performance.now();
    const off = now - remoteWall;
    // track the smallest observed latency (best clock estimate), slowly relaxing upward
    this.offset = this.offset === null ? off : Math.min(off, this.offset + 2);
    this.frames.push({ w: remoteWall, ents });
    if (this.frames.length > 40) this.frames.shift();
  }

  clearFrames() { this.frames = []; }

  pushEvents(ev: GameEvent[]) { for (const e of ev) this.events.push(e); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  /** Interpolated entities at render time. */
  sample(): EntView[] {
    const f = this.frames;
    if (f.length === 0) return [];
    const t = performance.now() - (this.offset ?? 0) - this.delay;
    let i = f.length - 1;
    while (i > 0 && f[i - 1].w > t) i--;
    // f[i] is first frame with w >= t (or the earliest)
    if (i === 0 || f[i].w <= t) {
      const last = t >= f[f.length - 1].w ? f[f.length - 1] : f[0];
      return [...last.ents.values()];
    }
    const a = f[i - 1], b = f[i];
    const k = Math.max(0, Math.min(1, (t - a.w) / Math.max(1, b.w - a.w)));
    const out: EntView[] = [];
    for (const eb of b.ents.values()) {
      const ea = a.ents.get(eb.id);
      if (!ea) { out.push(eb); continue; }
      out.push({ ...eb, x: ea.x + (eb.x - ea.x) * k, z: ea.z + (eb.z - ea.z) * k, hp: ea.hp + (eb.hp - ea.hp) * k });
    }
    return out;
  }

  /** Latest known position of an entity (for event FX). */
  latest(id: number): EntView | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) { const e = this.frames[i].ents.get(id); if (e) return e; }
    return undefined;
  }
}
