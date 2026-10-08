// SaveSystem — local persistence (profile, prefs, records, active game for reconnection).
import type { Quality } from '../render/Renderer';
import { isDedicatedGpu } from '../render/gpu';

/** shake: camera shake strength (1 normal, 0.4 reduced, 0 off) · flash: full-screen flashes · vibrate: haptics */
/** dynRes: dynamic resolution on ÉLEVÉ / ULTRA (holds the screen refresh rate) · ultraOffered: one-time switch to ULTRA on a dedicated GPU */
export interface Prefs { sfx: number; music: number; quality: Quality; vibrate: boolean; shake: number; flash: boolean; dynRes?: boolean; ultraOffered?: boolean }
/** Best result of a daily challenge (seeded game, same world for everyone). */
export interface DailyBest { wave: number; hp: number; time: number }
export interface Profile {
  name: string; avatar: string; localId: string;
  games: number; wins: number; xp: number; bestSurvival: number;
  duoRecords: Record<string, number>;
  tutorialDone: boolean;
  faction: string; // last army choice ('random' or a faction id)
  factionGames: Record<string, number>;
  daily: Record<string, DailyBest>; // 'YYYY-MM-DD' → best result
  duoGames: Record<string, number>; // DUO ability id → games played with that pair
}
export interface ActiveGame { code: string; role: 'host' | 'guest'; ts: number }

const KEY = 'duobastion:v1';
const AVATARS = ['🦊', '🐺', '🦉', '🐉', '🦁', '🐙', '🦄', '🐢', '🦅', '🐝', '🌟', '🔥'];

interface SaveData { profile: Profile; prefs: Prefs; active: ActiveGame | null }

function safeGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
function safeDel(k: string) { try { localStorage.removeItem(k); } catch { /* */ } }

function defaults(): SaveData {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  return {
    profile: {
      name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], localId: crypto.randomUUID?.() ?? String(Math.random()).slice(2),
      games: 0, wins: 0, xp: 0, bestSurvival: 0, duoRecords: {}, tutorialDone: false, faction: 'random', factionGames: {}, daily: {}, duoGames: {},
    },
    prefs: { sfx: 0.8, music: 0.45, quality: mobile ? 'medium' : isDedicatedGpu() ? 'ultra' : 'high', vibrate: true, shake: 1, flash: true, dynRes: true, ultraOffered: true },
    active: null,
  };
}

class Save {
  data: SaveData;
  constructor() {
    const d = defaults();
    try {
      const raw = safeGet(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        d.profile = { ...d.profile, ...p.profile };
        d.prefs = { ...d.prefs, ...p.prefs };
        // v0.6: players on a dedicated GPU (NVIDIA / AMD) who were on ÉLEVÉ move to ULTRA once (they can go back)
        if (!p.prefs?.ultraOffered) { if (d.prefs.quality === 'high' && isDedicatedGpu()) d.prefs.quality = 'ultra'; d.prefs.ultraOffered = true; }
        d.active = p.active ?? null;
      }
    } catch { /* corrupted save → defaults */ }
    this.data = d;
  }
  get profile() { return this.data.profile; }
  get prefs() { return this.data.prefs; }
  avatars() { return AVATARS; }
  level() { return 1 + Math.floor(Math.sqrt(this.data.profile.xp / 100)); }
  flush() { safeSet(KEY, JSON.stringify(this.data)); }
  setActive(a: ActiveGame | null) { this.data.active = a; this.flush(); }
  saveGame(code: string, json: string) { safeSet('duobastion:game:' + code, json); }
  loadGame(code: string): string | null { return safeGet('duobastion:game:' + code); }
  dropGame(code: string) { safeDel('duobastion:game:' + code); }
}

export const save = new Save();
