// v0.8: deterministic replay (daily leaderboard validated server-side), daily challenge helpers, command log, quick match.
import { describe, it, expect, beforeAll } from 'vitest';
import { createGame, step, drainEvents, stateHash, applyCommand } from '../src/sim/game';
import { replay, validateLog, dailyScore, type LoggedCmd, type ReplayCheckpoint } from '../src/sim/replay';
import { dailySettings, dailyDaysAllowed, dailyInfo, DAY_RE } from '../src/sim/daily';

const g = globalThis as Record<string, unknown>;
beforeAll(() => {
  g.window = globalThis;
  const store = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  if (!g.navigator) g.navigator = { userAgent: 'node' };
  g.location = { search: '', origin: 'http://test', pathname: '/' };
});

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await wait(20); }
}

/** Emulates the live loop: commands are applied between two steps, at the tick they were logged at. */
function playLive(settings: ReturnType<typeof dailySettings>['settings'], seed: number, log: LoggedCmd[], untilWave: number) {
  const s = createGame(settings, seed);
  let i = 0;
  while (s.phase !== 'ended' && s.wave < untilWave) {
    while (i < log.length && log[i].t <= s.tick) applyCommand(s, log[i].p, log[i++].c);
    step(s); drainEvents(s);
  }
  return s;
}

function scriptedLog(settings: ReturnType<typeof dailySettings>['settings'], seed: number): LoggedCmd[] {
  const draft = createGame(settings, seed).players[0].draft;
  const log: LoggedCmd[] = [
    { t: 0, p: 0, c: { c: 'build', unit: draft[0], col: 2, row: 3 } },
    { t: 0, p: 0, c: { c: 'build', unit: draft[1], col: 3, row: 3 } },
    { t: 40, p: 0, c: { c: 'worker' } },
    { t: 60, p: 0, c: { c: 'ready', value: true } },
  ];
  // wave 2 preparation: one more unit and an early launch, a few ticks after that phase starts
  const t2 = playLive(settings, seed, log, 2).tick + 5;
  log.push({ t: t2, p: 0, c: { c: 'build', unit: draft[0], col: 4, row: 2 } }, { t: t2 + 1, p: 0, c: { c: 'ready', value: true } });
  return log;
}

describe('v0.8 replay déterministe', () => {
  it('rejoue un journal de commandes vers exactement le même état (d\'une traite et en passes avec points de reprise JSON)', () => {
    const { settings, seed } = dailySettings('2026-10-09', 'Testeur');
    const log = scriptedLog(settings, seed);
    const live = playLive(settings, seed, log, 4);
    expect(live.wave).toBeGreaterThanOrEqual(3);
    expect(live.players[0].builds.length).toBeGreaterThanOrEqual(2);
    expect(live.players[0].workers).toBeGreaterThan(createGame(settings, seed).players[0].workers);
    const once = replay(settings, seed, log, { stopTick: live.tick });
    expect(once.done).toBe(true);
    expect(stateHash(once.state)).toBe(stateHash(live));
    // budgeted passes: the checkpoint goes through JSON like it does through the database
    let from: ReplayCheckpoint | undefined;
    let passes = 0, r = once;
    do {
      r = replay(settings, seed, log, { budgetMs: 2, from, stopTick: live.tick });
      from = JSON.parse(JSON.stringify({ state: r.state, i: r.i }));
      passes++;
    } while (!r.done && passes < 2000);
    expect(r.done).toBe(true);
    expect(passes).toBeGreaterThan(1);
    expect(stateHash(r.state)).toBe(stateHash(live));
    expect(r.i).toBe(log.length);
  });

  it('une partie complète du défi du jour donne le même score en continu et en passes', () => {
    const { settings, seed } = dailySettings('2026-10-09', 'Testeur');
    const log = scriptedLog(settings, seed);
    const full = replay(settings, seed, log);
    expect(full.done && full.valid).toBe(true);
    expect(full.state.phase).toBe('ended');
    const sc = dailyScore(full.state);
    expect(sc.wave).toBeGreaterThanOrEqual(2);
    expect(sc.seconds).toBeGreaterThan(0);
    let from: ReplayCheckpoint | undefined;
    let r = full, passes = 0;
    do { r = replay(settings, seed, log, { budgetMs: 15, from }); from = JSON.parse(JSON.stringify({ state: r.state, i: r.i })); passes++; } while (!r.done && passes < 2000);
    expect(r.valid).toBe(true);
    expect(dailyScore(r.state)).toEqual(sc);
    expect(stateHash(r.state)).toBe(stateHash(full.state));
  });

  it('refuse les journaux impossibles', () => {
    const ok: LoggedCmd[] = [{ t: 0, p: 0, c: { c: 'worker' } }, { t: 5, p: 0, c: { c: 'ready', value: true } }];
    expect(validateLog(ok)).toBe(true);
    expect(validateLog(null)).toBe(false);
    expect(validateLog([{ t: 5, p: 0, c: { c: 'worker' } }, { t: 4, p: 0, c: { c: 'worker' } }])).toBe(false); // ticks going back
    expect(validateLog([{ t: 0, p: 0, c: { c: 'debug', action: 'gold' } }])).toBe(false); // test command
    expect(validateLog([{ t: 0, p: 0, c: { c: 'speed', speed: 3 } }])).toBe(false);
    expect(validateLog([{ t: 0, p: 7, c: { c: 'worker' } }])).toBe(false); // no such player
    expect(validateLog([{ t: 1.5, p: 0, c: { c: 'worker' } }])).toBe(false);
    expect(validateLog(Array.from({ length: 20001 }, () => ({ t: 0, p: 0, c: { c: 'worker' } })))).toBe(false);
  });

  it('le défi du jour est le même pour tout le monde et n\'accepte que hier et aujourd\'hui (UTC)', () => {
    const a = dailyInfo('2026-10-09'), b = dailyInfo(new Date('2026-10-09T23:59:00Z'));
    expect(a).toEqual(b);
    expect(DAY_RE.test(a.day)).toBe(true);
    expect(dailySettings('2026-10-09', 'X').seed).toBe(a.seed);
    expect(dailySettings('2026-10-09', 'X').settings.humans[0].faction).toBe(a.faction);
    expect(dailySettings('2026-10-09', 'X').settings.aiFactions).toEqual({ 1: a.partner });
    expect(dailyInfo('2026-10-10').seed).not.toBe(a.seed);
    expect(dailyDaysAllowed(new Date('2026-10-09T00:30:00Z'))).toEqual(['2026-10-09', '2026-10-08']);
  });
});

describe('v0.8 traduction (anglais)', () => {
  it('traduit les textes exacts, remplit les {n}, et reconnaît les messages de la simulation (motifs)', async () => {
    const { makeT } = await import('../src/i18n/index');
    const { EN } = await import('../src/i18n/en');
    const en = makeT(EN);
    expect(en('Pas assez d\'or.')).toBe('Not enough gold.');
    expect(en('Niveau {0} → {1} / {2}', 1, 2, 3)).toBe('Level 1 → 2 / 3');
    // messages built by the host with numbers / names inside
    expect(en('Disponible à la vague 7.')).toBe('Available at wave 7.');
    expect(en('Vex (IA)')).toBe('Vex (AI)');
    expect(en('Allié IA')).toBe('AI ally');
    expect(en('C\'est au tour de Allié IA de choisir.')).toBe('It is AI ally\'s turn to choose.');
    // unknown strings and French stay untouched
    expect(en('Texte inconnu 42')).toBe('Texte inconnu 42');
    const fr = makeT({});
    expect(fr('Pas assez d\'or.')).toBe('Pas assez d\'or.');
    expect(fr('Niveau {0}', 4)).toBe('Niveau 4');
  });

  it('le dictionnaire anglais ne contient que des textes non vides et garde les {n} des clés', async () => {
    const { EN } = await import('../src/i18n/en');
    const keys = Object.keys(EN);
    expect(keys.length).toBeGreaterThan(1500);
    for (const k of keys) {
      expect(typeof EN[k]).toBe('string');
      expect(EN[k].length).toBeGreaterThan(0);
      const ph = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map(m => m[1]).sort();
      // every placeholder of the translation exists in the key (the reverse may drop a plural suffix on purpose)
      for (const p of ph(EN[k])) expect(ph(k)).toContain(p);
    }
  });
});

describe('v0.8 journal de commandes et partie rapide', () => {
  it('la session enregistre les commandes acceptées avec leur tick, ignore vitesse/pause et refuse les commandes de test dans le défi', async () => {
    const { Session } = await import('../src/net/Session');
    const noop = { lobby() {}, start() {}, toast() {}, conn() {}, kicked() {}, rematch() {} };
    const { settings, seed } = dailySettings('2026-10-09', 'Testeur');
    const s = Session.solo(settings, noop, seed);
    const draft = s.state!.players[0].draft;
    expect(s.send({ c: 'debug', action: 'gold' })).toMatch(/défi du jour/);
    expect(s.log.length).toBe(0);
    expect(s.send({ c: 'speed', speed: 3 })).toBeNull();
    expect(s.send({ c: 'build', unit: draft[0], col: 2, row: 3 })).toBeNull();
    expect(s.send({ c: 'build', unit: draft[0], col: 2, row: 3 })).toMatch(/occupée/); // refused: not logged
    for (let i = 0; i < 20; i++) s.update(0.05);
    const tick = s.state!.tick;
    expect(tick).toBeGreaterThan(0);
    expect(s.send({ c: 'worker' })).toBeNull();
    expect(s.log).toEqual([{ t: 0, p: 0, c: { c: 'build', unit: draft[0], col: 2, row: 3 } }, { t: tick, p: 0, c: { c: 'worker' } }]);
    // the log replays to the live state
    for (let i = 0; i < 20; i++) s.update(0.05);
    const r = replay(settings, seed, s.log, { stopTick: s.state!.tick });
    expect(stateHash(r.state)).toBe(stateHash(s.state!));
  });

  it('hors-ligne, la partie rapide ne trouve personne et la liste publique est vide', async () => {
    const { quickJoin, listPublicLobbies } = await import('../src/net/backend');
    expect(await quickJoin('Testeur', 'vsai', '0.8.0')).toBeNull();
    expect(await listPublicLobbies('0.8.0')).toEqual([]);
  });

  it('salon public : l\'hôte libère la place quand l\'invité quitte le lobby', async () => {
    const { Session } = await import('../src/net/Session');
    const noop = { lobby() {}, start() {}, toast() {}, conn() {}, kicked() {}, rematch() {} };
    const host = new Session('host', 'QUICK', 'uid-h', { ...noop });
    const guest = new Session('guest', 'QUICK', 'uid-g', { ...noop });
    host.isPublic = true;
    await host.open();
    await guest.open();
    await until(() => host.lobby.players.length === 2);
    guest.transport!.send({ k: 'leave', uid: guest.uid });
    await until(() => host.lobby.players.length === 1);
    expect(host.isPublic).toBe(true);
    host.setPublic(false);
    expect(host.isPublic).toBe(false);
    host.close(); guest.close();
  });
});
