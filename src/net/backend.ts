// Backend (Supabase Free): anonymous auth, lobbies, profiles, history, records.
// Falls back to an offline/local mode when Supabase is not configured (dev & tests).
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ONLINE, SUPABASE_ANON_KEY, SUPABASE_URL, log } from '../config';
import { save } from '../save/SaveSystem';

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
  if (/not_found/.test(m)) return 'Cette partie n\'existe plus (ou le code est incorrect).';
  if (/full/.test(m)) return 'Cette partie est déjà complète.';
  if (/started/.test(m)) return 'Cette partie a déjà commencé.';
  if (/anonymous/i.test(m) && /disabled/i.test(m)) return 'Connexion invité désactivée sur le serveur.';
  if (/JWT|token|expired/i.test(m)) return 'Ta session a expiré. Reconnexion…';
  if (/fetch|network|Failed/i.test(m)) return 'Connexion impossible. Vérifie ton Internet.';
  return 'Une erreur est survenue. Réessaie.';
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
    id, pseudo: p.name || 'Joueur', avatar: p.avatar, level: save.level(), xp: p.xp, games: p.games, wins: p.wins, best_survival: p.bestSurvival,
  });
  if (error) log('profile upsert error', error.message);
}

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function localCode() { let c = ''; for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return c; }

export async function createLobby(mode: string, settings: object, pseudo: string): Promise<string> {
  const s = supa();
  if (!s) return localCode();
  await ensureAuth();
  const { data, error } = await s.rpc('create_lobby', { p_mode: mode, p_settings: settings, p_pseudo: pseudo });
  if (error) throw error;
  log('Lobby created', data);
  return data as string;
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

export async function submitDuoRecord(otherUid: string, names: string, wave: number) {
  const s = supa(); if (!s || !uid) return;
  const { error } = await s.rpc('submit_duo_record', { p_other: otherUid, p_names: names, p_wave: wave });
  if (error) log('record error', error.message);
}
