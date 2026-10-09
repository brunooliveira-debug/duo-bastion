// Défi du jour: the same seed, the same world and the same armies for everyone today (UTC day).
// Pure: shared by the menus and by the server-side score validation.
import { FACTION_IDS } from '../data/units';
import type { FactionId } from '../data/types';
import type { GameSettings } from './state';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dailyDay(date = new Date()) { return date.toISOString().slice(0, 10); }

export function dailyInfo(date = new Date()): { day: string; seed: number; faction: FactionId; partner: FactionId } {
  const day = typeof date === 'string' ? date : dailyDay(date);
  let h = 2166136261;
  for (const ch of 'duo-bastion:' + day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const seed = (h >>> 0) % 2147483647;
  const a = FACTION_IDS[seed % FACTION_IDS.length];
  const rest = FACTION_IDS.filter(f => f !== a);
  const b = rest[Math.floor(seed / 7) % rest.length];
  return { day, seed, faction: a, partner: b };
}

/** Game settings of the daily challenge of `day` for one human called `name` (the partner is an AI). */
export function dailySettings(day: string, name: string): { settings: GameSettings; seed: number } {
  const d = dailyInfo(new Date(day + 'T12:00:00Z'));
  return {
    settings: { mode: 'survival', totalWaves: 9999, difficulty: 'normal', humans: [{ name, faction: d.faction }], challenge: `daily:${day}`, aiFactions: { 1: d.partner } },
    seed: d.seed,
  };
}

/** Days a score may be submitted for: today and yesterday (players around midnight), UTC. */
export function dailyDaysAllowed(nowDate = new Date()) {
  const y = new Date(nowDate.getTime() - 86400000);
  return [dailyDay(nowDate), dailyDay(y)];
}
