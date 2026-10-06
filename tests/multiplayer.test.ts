// Integration test: host + guest sessions talking through the real network protocol
// (LocalTransport = BroadcastChannel; same messages as the Supabase transport).
import { describe, it, expect, beforeAll } from 'vitest';

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

describe('duo multiplayer (host-authoritative)', () => {
  it('create → join → ready → start → build → sync → combat → resolution', async () => {
    const { Session } = await import('../src/net/Session');
    const noop = { lobby() {}, start() {}, toast() {}, conn() {}, kicked() {}, rematch() {} };
    let guestStarted = false;
    const errors: string[] = [];
    const host = new Session('host', 'TEST1', 'uid-host', { ...noop });
    const guest = new Session('guest', 'TEST1', 'uid-guest', { ...noop, start: () => { guestStarted = true; }, toast: (m: string) => errors.push(m) });
    await host.open();
    await guest.open();
    // guest appears in host lobby
    await until(() => host.lobby.players.length === 2);
    expect(host.lobby.players.map(p => p.uid)).toEqual(['uid-host', 'uid-guest']);
    await until(() => guest.lobby.players.length === 2);
    // both ready
    host.setReady(true);
    guest.setReady(true);
    await until(() => host.lobby.players.every(p => p.ready));
    expect(host.canStart()).toBe(true);
    host.setSettings({ mode: 'vsai', totalWaves: 10, difficulty: 'initiation' });
    host.startGame();
    await until(() => guestStarted);
    expect(guest.myPid).toBe(1);
    // drive the host loop
    const pump = setInterval(() => host.update(0.05), 10);
    await until(() => !!guest.view.meta);
    expect(guest.view.meta!.players.length).toBe(4);
    // guest builds on its own lane (validated by host)
    const draft = guest.view.meta!.players[1].draft;
    guest.send({ c: 'build', unit: draft[0], col: 2, row: 3 });
    await until(() => host.state!.players[1].builds.length === 1);
    await until(() => guest.view.meta!.players[1].builds.length === 1);
    // invalid command is rejected with a friendly error
    guest.send({ c: 'build', unit: draft[0], col: 2, row: 3 });
    await until(() => errors.length > 0);
    expect(errors[0]).toMatch(/occupée|or/i);
    // cheating attempt: building with a unit not in the draft
    const { BASE_UNIT_IDS } = await import('../src/data/units');
    const notInDraft = BASE_UNIT_IDS.find(u => !draft.includes(u))!;
    guest.send({ c: 'build', unit: notInDraft, col: 5, row: 3 });
    await wait(150);
    expect(host.state!.players[1].builds.length).toBe(1);
    // host builds too, both ready → combat
    host.send({ c: 'build', unit: host.state!.players[0].draft[0], col: 2, row: 3 });
    host.send({ c: 'ready', value: true });
    guest.send({ c: 'ready', value: true });
    host.state!.speed = 3;
    await until(() => host.state!.phase === 'combat', 8000);
    await until(() => guest.view.frames.length > 2);
    const ents = guest.view.sample();
    expect(ents.length).toBeGreaterThan(10);
    await until(() => host.state!.phase === 'build' && host.state!.wave === 2, 20000);
    await until(() => guest.view.meta!.wave === 2);
    clearInterval(pump);
    host.close(); guest.close();
  }, 40000);

  it('duel: opposite teams, chosen armies, sends between the two humans', async () => {
    const { Session } = await import('../src/net/Session');
    const noop = { lobby() {}, start() {}, toast() {}, conn() {}, kicked() {}, rematch() {} };
    let guestStarted = false;
    const host = new Session('host', 'DUEL1', 'uid-h', { ...noop });
    const guest = new Session('guest', 'DUEL1', 'uid-g', { ...noop, start: () => { guestStarted = true; } });
    await host.open();
    await guest.open();
    await until(() => host.lobby.players.length === 2);
    host.setFaction('rouages');
    guest.setFaction('abysses');
    await until(() => host.lobby.players[1].faction === 'abysses');
    host.setReady(true); guest.setReady(true);
    await until(() => host.lobby.players.every(p => p.ready));
    host.setSettings({ mode: 'duel', totalWaves: 10, difficulty: 'normal' });
    host.startGame();
    await until(() => guestStarted);
    expect(guest.myPid).toBe(2);
    const st = host.state!;
    expect(st.players[0].faction).toBe('rouages');
    expect(st.players[2].faction).toBe('abysses');
    expect(st.players[2].team).toBe(1);
    // the guest builds on its own lane and sends raiders at the host
    st.players[2].ether = 100;
    guest.send({ c: 'build', unit: 'ondin', col: 2, row: 3 });
    guest.send({ c: 'raider', raider: 'grignoteur', to: 0 });
    await until(() => st.players[2].builds.length === 1 && st.players[2].raiderQueue.length === 1);
    expect(st.players[2].raiderQueue[0].to).toBe(0);
    // and cannot touch the host's army (anti-cheat: commands are tied to the sender's pid)
    guest.send({ c: 'sell', bid: 999 });
    host.close(); guest.close();
  }, 20000);
});
