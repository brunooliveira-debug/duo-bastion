// Smoke test of the bundled edge function in Node: Deno and Supabase are replaced by in-memory stand-ins and the
// handler is exercised end to end (auth, validation, single pass, multi-pass with checkpoints, ranking).
// usage: npx tsx scripts/edge-smoke-log.ts && node scripts/edge-smoke.mjs [--fast]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = join(tmpdir(), 'edge-smoke');
mkdirSync(dir, { recursive: true });

// --- in-memory Supabase stand-in ---------------------------------------------------------------------------
const tables = { daily_pending: [], daily_scores: [] };
let nextId = 1;
const matches = (row, filters) => filters.every(f => f(row));
function builder(name) {
  const st = { filters: [], op: 'select', payload: null, head: false, single: '' };
  const api = {
    select(_cols, o) { if (st.op === 'select') st.head = !!(o && o.head); return api; },
    insert(row) { st.op = 'insert'; st.payload = row; return api; },
    update(row) { st.op = 'update'; st.payload = row; return api; },
    upsert(row) { st.op = 'upsert'; st.payload = row; return api; },
    delete() { st.op = 'delete'; return api; },
    eq(k, v) { st.filters.push(r => String(r[k]) === String(v)); return api; },
    lt(k, v) { st.filters.push(r => r[k] < v); return api; },
    or(expr) { // the only shape the function uses: wave.gt.W,and(wave.eq.W,seconds.lt.S)
      const m = /wave\.gt\.(\d+),and\(wave\.eq\.(\d+),seconds\.lt\.(\d+)\)/.exec(expr);
      st.filters.push(r => r.wave > Number(m[1]) || (r.wave === Number(m[2]) && r.seconds < Number(m[3])));
      return api;
    },
    order() { return api; },
    maybeSingle() { st.single = 'maybe'; return api; },
    single() { st.single = 'one'; return api; },
    then(resolve) {
      let data = null, count = null;
      const rows = tables[name];
      const sel = rows.filter(r => matches(r, st.filters));
      if (st.op === 'select') { count = sel.length; data = st.head ? null : sel; }
      else if (st.op === 'insert') { const row = { id: String(nextId++), ...st.payload }; rows.push(row); data = [row]; }
      else if (st.op === 'update') { for (const r of sel) Object.assign(r, st.payload); data = sel; }
      else if (st.op === 'upsert') { const p = st.payload; const ex = rows.find(r => r.day === p.day && r.user_id === p.user_id); if (ex) Object.assign(ex, p); else rows.push({ ...p }); data = [p]; }
      else if (st.op === 'delete') { tables[name] = rows.filter(r => !matches(r, st.filters)); data = sel; }
      if (st.single) data = (data && data[0]) || null;
      return Promise.resolve(resolve({ data, error: null, count }));
    },
  };
  return api;
}
let currentUser = 'user-1';
globalThis.__smokeCreateClient = (_url, _key, opts) => ({
  auth: { getUser: async () => ({ data: { user: opts && opts.global && opts.global.headers.Authorization === 'Bearer good' ? { id: currentUser } : null } }) },
  from: name => builder(name),
});
let handler = null;
globalThis.Deno = {
  env: { get: k => ({ SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' })[k] },
  serve: h => { handler = h; },
};

// --- load the bundle with the jsr import redirected to the stand-in ----------------------------------------
let code = readFileSync('supabase/functions/submit-daily/index.ts', 'utf8');
code = code.replace(/import \{ createClient \} from "jsr:@supabase\/supabase-js@2";/, 'const createClient = globalThis.__smokeCreateClient;');
if (code.includes('jsr:')) throw new Error('jsr import not redirected');
if (process.argv.includes('--fast')) code = code.replace(/var BUDGET_MS = \d+;/, 'var BUDGET_MS = 4;');
const file = join(dir, 'index.mjs');
writeFileSync(file, code);
await import(pathToFileURL(file).href);
if (!handler) throw new Error('Deno.serve was not called');
const GAME_VERSION = /VERSION = '([^']+)'/.exec(readFileSync('src/config.ts', 'utf8'))[1];

// --- scenario ---------------------------------------------------------------------------------------------
const day = new Date().toISOString().slice(0, 10);
const call = (body, auth = 'Bearer good') => handler(new Request('http://f/', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).then(r => r.json());
const log = JSON.parse(readFileSync(join(dir, 'log.json'), 'utf8'));
const expectStatus = (label, r, status, error) => {
  const ok = r.status === status && (!error || r.error === error);
  console.log(`${ok ? 'ok ' : 'KO '} ${label} →`, JSON.stringify(r).slice(0, 160));
  if (!ok) { console.error('SMOKE FAILED at', label); process.exit(1); }
};
expectStatus('unauthorized', await call({ day, version: GAME_VERSION, pseudo: 'Smoke', log }, 'Bearer bad'), 'error', 'unauthorized');
expectStatus('bad day', await call({ day: '2001-01-01', version: GAME_VERSION, pseudo: 'Smoke', log }), 'error', 'bad_day');
expectStatus('bad version', await call({ day, version: 'old', pseudo: 'Smoke', log }), 'error', 'version');
expectStatus('bad log', await call({ day, version: GAME_VERSION, pseudo: 'Smoke', log: [{ t: 0, p: 0, c: { c: 'debug', action: 'gold' } }] }), 'error', 'bad_log');
/** calls the function until it stops answering `more` (long games are validated in several passes) */
async function run(body) {
  let passes = 0, r;
  do { r = await call(body); passes++; if (r.status === 'more') body = { run: r.run }; } while (r.status === 'more' && passes < 400);
  return { ...r, passes };
}
const t0 = performance.now();
let r = await run({ day, version: GAME_VERSION, pseudo: 'Smoke', log, claim: { wave: 99 } });
expectStatus(`valid run (${r.passes} pass(es), ${Math.round(performance.now() - t0)} ms)`, r, 'ok');
if (tables.daily_pending.length) { console.error('pending row left behind'); process.exit(1); }
if (!r.mismatch) { console.error('claim mismatch not reported'); process.exit(1); }
const first = r;
expectStatus('idle run, same user (keeps the best)', await run({ day, version: GAME_VERSION, pseudo: 'Smoke', log: [] }), 'ok');
currentUser = 'user-2';
const second = await run({ day, version: GAME_VERSION, pseudo: 'Other', log: [] });
expectStatus('other user, idle run', second, 'ok');
console.log('scores →', tables.daily_scores.map(x => `${x.user_id}: wave ${x.wave} in ${x.seconds} s`).join(' | '));
if (tables.daily_scores.length !== 2 || tables.daily_scores[0].wave !== first.wave || second.rank !== 2 || second.total !== 2) { console.error('SMOKE FAILED: ranking'); process.exit(1); }
console.log('SMOKE OK');
