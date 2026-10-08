// Central config. The game name is only referenced here + index.html/manifest (easy to rename).
export const GAME_NAME = 'DUO BASTION';
export const VERSION = '0.7.1-alpha';

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
// The anon key is public by design (protected by RLS). Never put the service_role key in the client.
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const ONLINE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

export function log(...a: unknown[]) {
  if (DEBUG) console.log('[DB]', ...a);
}
