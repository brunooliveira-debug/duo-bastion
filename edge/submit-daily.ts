// Supabase Edge Function — SOURCE. Bundled by `node scripts/build-edge.mjs` into supabase/functions/submit-daily/index.ts
// (the simulation is inlined: the server replays the game with exactly the client's code).
//
// Validates a "Défi du jour" run: the client sends its command log; the server rebuilds the daily game (same seed, same
// armies), replays the commands and stores the score IT computed. Nothing from the client is trusted but the commands.
// Supabase caps CPU time at 2 s per request, so a long game is validated in several passes: a checkpoint (state + cursor)
// is kept in `daily_pending` between two calls and the client calls again with the run id.
//
// Secrets: SUPABASE_SERVICE_ROLE_KEY is injected by Supabase into the function's environment — it never reaches a client.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { replay, validateLog, dailyScore, type LoggedCmd, type ReplayCheckpoint } from '../src/sim/replay';
import { dailySettings, dailyDaysAllowed, DAY_RE } from '../src/sim/daily';
import type { GameState } from '../src/sim/state';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };
/** injected by the bundler from src/config.ts: only identical game versions are replayed */
declare const __GAME_VERSION__: string;

/** wall-clock budget per pass (the Supabase CPU limit is 2 s per request; JSON work needs the margin) */
const BUDGET_MS = 900;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (error: string, status = 200) => json({ status: 'error', error }, status);

interface Pending { id: string; user_id: string; day: string; pseudo: string; log: LoggedCmd[]; state: GameState; cursor: number; claim: unknown }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('method', 405);
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // who is calling? (anonymous Supabase users have a JWT too)
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return fail('unauthorized', 401);
    const admin = createClient(url, service, { auth: { persistSession: false } });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return fail('bad_json'); }

    let day: string, pseudo: string, log: LoggedCmd[], claim: unknown = null;
    let from: ReplayCheckpoint | undefined;
    let runId: string | null = null;
    if (typeof body.run === 'string') {
      // next pass of a long game
      const { data: p } = await admin.from('daily_pending').select('*').eq('id', body.run).eq('user_id', user.id).maybeSingle();
      if (!p) return fail('no_run');
      const pend = p as Pending;
      runId = pend.id; day = pend.day; pseudo = pend.pseudo; log = pend.log; claim = pend.claim;
      from = { state: pend.state, i: pend.cursor };
    } else {
      day = String(body.day ?? '');
      pseudo = String(body.pseudo ?? '').slice(0, 16) || 'Joueur';
      if (!DAY_RE.test(day) || !dailyDaysAllowed().includes(day)) return fail('bad_day');
      if (body.version !== __GAME_VERSION__) return fail('version');
      if (!validateLog(body.log)) return fail('bad_log');
      log = body.log;
      claim = body.claim ?? null;
    }

    const { settings, seed } = dailySettings(day, pseudo);
    const res = replay(settings, seed, log, { budgetMs: BUDGET_MS, from });
    if (!res.done) {
      const row = { user_id: user.id, day, pseudo, log, state: res.state, cursor: res.i, claim, updated_at: new Date().toISOString() };
      if (runId) {
        const { error } = await admin.from('daily_pending').update(row).eq('id', runId);
        if (error) return fail('pending:' + error.message);
      } else {
        const { data, error } = await admin.from('daily_pending').insert(row).select('id').single();
        if (error || !data) return fail('pending:' + (error?.message ?? 'insert'));
        runId = data.id as string;
      }
      return json({ status: 'more', run: runId, wave: res.state.wave });
    }
    if (runId) await admin.from('daily_pending').delete().eq('id', runId);
    // housekeeping: passes abandoned by their client
    await admin.from('daily_pending').delete().lt('updated_at', new Date(Date.now() - 15 * 60000).toISOString());
    if (!res.valid) return fail(res.reason ?? 'invalid');

    const sc = dailyScore(res.state);
    const c = claim as { wave?: number } | null;
    const mismatch = !!c && Number(c.wave) !== sc.wave;
    const { data: prev } = await admin.from('daily_scores').select('wave,seconds').eq('day', day).eq('user_id', user.id).maybeSingle();
    const better = !prev || sc.wave > prev.wave || (sc.wave === prev.wave && sc.seconds < prev.seconds);
    if (better) {
      const { error } = await admin.from('daily_scores').upsert({ day, user_id: user.id, pseudo, wave: sc.wave, core_hp: sc.hp, seconds: sc.seconds, updated_at: new Date().toISOString() });
      if (error) return fail('store:' + error.message);
    }
    const best = better ? sc : { wave: prev!.wave as number, seconds: prev!.seconds as number };
    const { count: above } = await admin.from('daily_scores').select('*', { count: 'exact', head: true }).eq('day', day)
      .or(`wave.gt.${best.wave},and(wave.eq.${best.wave},seconds.lt.${best.seconds})`);
    const { count: total } = await admin.from('daily_scores').select('*', { count: 'exact', head: true }).eq('day', day);
    return json({ status: 'ok', wave: sc.wave, seconds: sc.seconds, hp: sc.hp, best: better, rank: (above ?? 0) + 1, total: total ?? 1, mismatch });
  } catch (e) {
    return fail('server:' + String((e as Error)?.message ?? e));
  }
});
