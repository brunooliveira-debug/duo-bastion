// Deterministic seeded RNG (mulberry32). State is stored inside GameState so saves resume identically.
import type { GameState } from './state';

export function rand(s: GameState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: GameState, n: number) { return Math.floor(rand(s) * n); }

export function shuffle<T>(s: GameState, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Roll of the WORLD (runes, wave events, anomaly offers, secondary rifts): depends only on the seed and the keys,
 * never on what the players did — the same seed always produces the same world (daily challenge, replays).
 */
export function worldRand(seed: number, ...keys: number[]): number {
  let h = (seed ^ 0x9e3779b9) | 0;
  for (const k of keys) {
    h = Math.imul(h ^ (k | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** k distinct items of arr picked by the world RNG. */
export function worldPick<T>(seed: number, arr: T[], k: number, ...keys: number[]): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  for (let i = 0; i < k && pool.length; i++) out.push(pool.splice(Math.floor(worldRand(seed, ...keys, i) * pool.length), 1)[0]);
  return out;
}
