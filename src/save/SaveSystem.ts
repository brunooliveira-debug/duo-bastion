// SaveSystem — local persistence (profile, prefs, records, active game for reconnection).
import type { Quality } from '../render/Renderer';

export interface Prefs { sfx: number; music: number; quality: Quality; vibrate: boolean }
export interface Profile {
  name: string; avatar: string; localId: string;
  games: number; wins: number; xp: number; bestSurvival: number;
  duoRecords: Record<string, number>;
  tutorialDone: boolean;
  faction: string; // last army choice ('random' or a faction id)
  factionGames: Record<string, number>;
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
      games: 0, wins: 0, xp: 0, bestSurvival: 0, duoRecords: {}, tutorialDone: false, faction: 'random', factionGames: {},
    },
    prefs: { sfx: 0.8, music: 0.45, quality: mobile ? 'medium' : 'high', vibrate: true },
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
