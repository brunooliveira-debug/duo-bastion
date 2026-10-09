// Backend (Supabase Free): anonymous auth, lobbies, profiles, history, records.
// Falls back to an offline/local mode when Supabase is not configured (dev & tests).
import { tr } from '../i18n';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL, VERSION, log } from '../config';
import { save } from '../save/SaveSystem';
import type { LoggedCmd } from '../sim/replay';

let client: SupabaseClient | null = null;
let uid: string | null = null;

export function supa(): SupabaseClient | null {
  if (!ONLINE) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 30 } },
  });
  return client;
}

/** Friendly French error messages. */
export function friendly(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  if (/not_found/.test(m)) return tr('Cette partie n\'existe plus (ou le code est incorrect).');
  if (/full/.test(m)) return tr('Cette partie est déjà complète.');
  if (/started/.test(m)) return tr('Cette partie a déjà commencé.');
  if (/anonymous/i.test(m) && /disabled/i.test(m)) return tr('Connexion invité désactivée sur le serveur.');
  if (/JWT|token|expired/i.test(m)) return tr('Ta session a expiré. Reconnexion…');
  if (/fetch|network|Failed/i.test(m)) return tr('Connexion impossible. Vérifie ton Internet.');
  return tr('Une erreur est survenue. Réessaie.');
}

/** Guest identity: Supabase anonymous user when online, local id otherwise. */
export async function ensureAuth(): Promise<string> {
  if (uid) return uid;
  const s = supa();
  if (!s) { uid = 'local-' + save.profile.localId; return uid; }
  const { data } = await s.auth.getSession();
  if (data.session?.user) { uid = data.session.user.id; return uid; }
  const r = await s.auth.signInAnonymously();
  if (r.error || !r.data.user) throw r.error ?? new Error('auth failed');
  uid = r.data.user.id;
  log('Signed in anonymously', uid);
  return uid;
}

export async function upsertProfile() {
  const s = supa(); if (!s) return;
  const id = await ensureAuth();
  const p = save.profile;
  const { error } = await s.from('profiles').upsert({
    id, pseudo: p.name || tr('Joueur'), avatar: p.avatar, level: save.level(), xp: p.xp, games: p.games, wins: p.wins, best_survival: p.bestSurvival,
  });
  if (error) log('profile upsert error', error.message);
}

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function localCode() { let c = ''; for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return c; }

/** v0.8: `isPublic` lists the lobby for "Partie rapide"; `version` pairs only identical game versions. */
export async function createLobby(mode: string, settings: object, pseudo: string, isPublic = false, version = ''): Promise<string> {
  const s = supa();
  if (!s) return localCode();
  await ensureAuth();
  const { data, error } = await s.rpc('create_lobby', { p_mode: mode, p_settings: settings, p_pseudo: pseudo, p_public: isPublic, p_version: version });
  if (error) throw error;
  log('Lobby created', data, isPublic ? '(public)' : '');
  return data as string;
}

export interface PublicLobby { code: string; mode: string; host_pseudo: string; created_at: string }

/** Open public lobbies waiting for a partner (same game version), oldest first. */
export async function listPublicLobbies(version: string): Promise<PublicLobby[]> {
  const s = supa(); if (!s) return [];
  await ensureAuth();
  const { data, error } = await s.from('lobbies').select('code,mode,host_pseudo,created_at')
    .eq('is_public', true).eq('status', 'open').eq('version', version).order('created_at', { ascending: true }).limit(20);
  if (error) { log('public lobbies error', error.message); return []; }
  return (data ?? []) as PublicLobby[];
}

/** Partie rapide: atomically joins the oldest public lobby (same mode first). null = nobody is waiting. */
export async function quickJoin(pseudo: string, mode: string, version: string): Promise<{ code: string; mode: string; host_id: string } | null> {
  const s = supa(); if (!s) return null;
  await ensureAuth();
  const { data, error } = await s.rpc('quick_join', { p_pseudo: pseudo, p_mode: mode, p_version: version });
  if (error) throw error;
  if (data) log('Quick match joined', data.code);
  return data ?? null;
}

/** Host: list / unlist the lobby for quick matches (also refreshes the heartbeat). */
export async function setLobbyPublic(code: string, isPublic: boolean) {
  const s = supa(); if (!s) return;
  const { error } = await s.from('lobbies').update({ is_public: isPublic, updated_at: new Date().toISOString() }).eq('code', code);
  if (error) log('lobby public error', error.message);
}

/** Host heartbeat while waiting in a public lobby (a lobby silent for 2 minutes disappears from the list). */
export async function touchLobby(code: string) {
  const s = supa(); if (!s) return;
  await s.from('lobbies').update({ updated_at: new Date().toISOString() }).eq('code', code);
}

/** Host: frees the guest slot after the partner left the lobby (so the next player can join). */
export async function freeSlot(code: string) {
  const s = supa(); if (!s) return;
  const { error } = await s.rpc('free_slot', { p_code: code });
  if (error) log('free slot error', error.message);
}

/** Guest: leaves the lobby in the database too (the slot is free for someone else). */
export async function leaveLobbyRow(code: string) {
  const s = supa(); if (!s || !uid) return;
  await s.from('lobby_players').delete().eq('code', code).eq('user_id', uid);
}

export async function joinLobby(code: string, pseudo: string): Promise<{ mode: string; settings: Record<string, unknown>; host_id: string; status: string }> {
  const s = supa();
  if (!s) return { mode: 'vsai', settings: {}, host_id: '', status: 'open' };
  await ensureAuth();
  const { data, error } = await s.rpc('join_lobby', { p_code: code.toUpperCase(), p_pseudo: pseudo });
  if (error) throw error;
  log('Joined lobby', code);
  return data;
}

export async function setLobbyStatus(code: string, status: 'open' | 'playing' | 'ended', state?: unknown) {
  const s = supa(); if (!s) return;
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (state !== undefined) patch.state = state;
  const { error } = await s.from('lobbies').update(patch).eq('code', code);
  if (error) log('lobby update error', error.message);
}

export async function loadLobbyState(code: string): Promise<unknown | null> {
  const s = supa(); if (!s) return null;
  const { data, error } = await s.from('lobbies').select('state,status').eq('code', code).maybeSingle();
  if (error || !data) return null;
  return data.state;
}

export async function recordMatch(code: string, mode: string, outcome: string, wave: number, playerIds: string[], names: string[], stats: unknown) {
  const s = supa(); if (!s) return;
  const { error } = await s.from('match_history').insert({ code, mode, outcome, wave, player_ids: playerIds.filter(x => /^[0-9a-f-]{36}$/.test(x)), names, stats });
  if (error) log('history insert error', error.message);
}

// ------------------------------------------------------------------ v0.8 daily leaderboard (server-validated)

export interface DailyRow { user_id: string; pseudo: string; wave: number; core_hp: number; seconds: number }
export type DailySubmit =
  | { status: 'ok'; wave: number; seconds: number; hp: number; best: boolean; rank: number; total: number; mismatch?: boolean }
  | { status: 'error'; error: string };

export function myUid() { return uid; }

/** Today's leaderboard (best validated run per player), best first. */
export async function fetchDailyScores(day: string): Promise<DailyRow[]> {
  const s = supa(); if (!s) return [];
  await ensureAuth();
  const { data, error } = await s.from('daily_scores').select('user_id,pseudo,wave,core_hp,seconds').eq('day', day)
    .order('wave', { ascending: false }).order('seconds', { ascending: true }).limit(100);
  if (error) { log('daily fetch error', error.message); return []; }
  return (data ?? []) as DailyRow[];
}

/**
 * Sends the command log of a finished daily challenge to the `submit-daily` edge function, which replays the game on
 * the same seed and stores the score it computes itself (the client's claim is only used to detect desyncs).
 * Long games are validated in several passes (`more` answers carry a run id).
 */
export async function submitDailyRun(day: string, pseudo: string, cmdLog: LoggedCmd[], claim: { wave: number; hp: number; seconds: number }, onProgress?: (wave: number) => void): Promise<DailySubmit> {
  const s = supa(); if (!s) return { status: 'error', error: 'offline' };
  try {
    await ensureAuth();
    let body: Record<string, unknown> = { day, version: VERSION, pseudo, log: cmdLog, claim };
    for (let pass = 0; pass < 60; pass++) {
      const { data, error } = await s.functions.invoke('submit-daily', { body });
      if (error) {
        log('daily submit error', error);
        const ctx = (error as { context?: Response }).context;
        let code = 'unavailable';
        try { if (ctx && typeof ctx.json === 'function') code = String((await ctx.json()).error ?? ctx.status); } catch { /* */ }
        return { status: 'error', error: code };
      }
      const r = data as { status: string; run?: string; wave?: number; error?: string } & Record<string, unknown>;
      if (r.status === 'more') { onProgress?.(r.wave ?? 0); body = { run: r.run }; continue; }
      if (r.status === 'ok') return r as unknown as DailySubmit;
      return { status: 'error', error: r.error ?? 'rejected' };
    }
    return { status: 'error', error: 'timeout' };
  } catch (e) {
    log('daily submit exception', e);
    return { status: 'error', error: 'network' };
  }
}

export async function submitDuoRecord(otherUid: string, names: string, wave: number) {
  const s = supa(); if (!s || !uid) return;
  const { error } = await s.rpc('submit_duo_record', { p_other: otherUid, p_names: names, p_wave: wave });
  if (error) log('record error', error.message);
}
