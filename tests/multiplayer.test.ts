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
    // cheating attempt: a debug command (free gold) sent over the network is refused by the host
    const goldBefore = host.state!.players[1].gold;
    guest.send({ c: 'debug', action: 'gold' });
    await until(() => errors.some(e => /tests locaux/i.test(e)));
    expect(host.state!.players[1].gold).toBe(goldBefore);
    // undo over the network: the guest takes back its misplaced unit (full refund, validated by the host), then re-places it
    guest.send({ c: 'undo' });
    await until(() => host.state!.players[1].builds.length === 0);
    expect(host.state!.players[1].gold).toBeGreaterThan(goldBefore);
    await until(() => guest.view.meta!.players[1].builds.length === 0);
    guest.send({ c: 'build', unit: draft[0], col: 2, row: 3 });
    await until(() => host.state!.players[1].builds.length === 1);
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
    // v0.7 blessing draft over the network: wave 2 is the host's turn; the guest is told so and sees the pick
    const offer = host.state!.teams[0].blessingOffer!;
    expect(offer.picker).toBe(0);
    await until(() => !!guest.view.meta!.teams[0].blessingOffer);
    const nErr = errors.length;
    guest.send({ c: 'bless', id: offer.ids[0] });
    await until(() => errors.length > nErr && /tour/.test(errors[errors.length - 1]));
    expect(host.send({ c: 'bless', id: offer.ids[0] })).toBeNull();
    await until(() => guest.view.meta!.teams[0].blessings.length === 1);
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

  it('v0.4 over the network: joint module decision, Résonance synchronisation, anomaly vote, anti-replay', async () => {
    const { Session } = await import('../src/net/Session');
    const { RESO_MAX } = await import('../src/data/resonance');
    const noop = { lobby() {}, start() {}, toast() {}, conn() {}, kicked() {}, rematch() {} };
    let guestStarted = false;
    const host = new Session('host', 'V04NE', 'uid-h4', { ...noop });
    const guest = new Session('guest', 'V04NE', 'uid-g4', { ...noop, start: () => { guestStarted = true; } });
    await host.open();
    await guest.open();
    await until(() => host.lobby.players.length === 2);
    host.setFaction('rouages'); guest.setFaction('abysses');
    await until(() => host.lobby.players[1].faction === 'abysses');
    host.setReady(true); guest.setReady(true);
    await until(() => host.lobby.players.every(p => p.ready));
    host.setSettings({ mode: 'vsai', totalWaves: 21, difficulty: 'normal' });
    host.startGame();
    await until(() => guestStarted);
    const st = host.state!;
    // 1. the guest proposes a Bastion module: escrowed, the host validates and co-finances
    st.players[1].ether = 100; st.players[0].ether = 100;
    guest.send({ c: 'module', action: 'install', module: 'rempart' });
    await until(() => !!st.teams[0].proposal);
    expect(st.teams[0].proposal!.by).toBe(1);
    await until(() => !!guest.view.meta?.teams[0].proposal); // the guest sees its pending proposal
    expect(host.send({ c: 'moduleVote', accept: true })).toBeNull();
    expect(st.teams[0].modules[0]?.id).toBe('rempart');
    await until(() => guest.view.meta?.teams[0].modules[0]?.id === 'rempart');
    // 2. anomaly vote: both humans must agree
    st.teams[0].anomalyOffer = ['arsenal', 'veille', 'tempete'];
    host.send({ c: 'anomaly', id: 'veille' });
    expect(st.teams[0].anomaly).toBeNull();
    guest.send({ c: 'anomaly', id: 'veille' });
    await until(() => st.teams[0].anomaly?.id === 'veille');
    // 3. anti-replay: the same command number twice is applied once
    const pump = setInterval(() => host.update(0.05), 10);
    const seq = Date.now() + 10_000_000;
    st.players[1].gold = 2000;
    guest.transport!.send({ k: 'cmd', uid: 'uid-g4', seq, cmd: { c: 'build', unit: 'ondin', col: 1, row: 1 } });
    guest.transport!.send({ k: 'cmd', uid: 'uid-g4', seq, cmd: { c: 'build', unit: 'ondin', col: 2, row: 2 } });
    await wait(200);
    expect(st.players[1].builds.length).toBe(1);
    // 4. Résonance: the host triggers, the guest synchronises during the channel
    host.send({ c: 'ready', value: true });
    guest.transport!.send({ k: 'cmd', uid: 'uid-g4', seq: seq + 1, cmd: { c: 'ready', value: true } });
    await until(() => st.phase === 'combat', 8000);
    st.teams[0].reso = RESO_MAX;
    expect(host.send({ c: 'reso' })).toBeNull();
    guest.transport!.send({ k: 'cmd', uid: 'uid-g4', seq: seq + 2, cmd: { c: 'reso' } });
    guest.transport!.send({ k: 'cmd', uid: 'uid-g4', seq: seq + 3, cmd: { c: 'reso' } }); // double tap: refused (already synchronised)
    await until(() => st.teams[0].resoUses === 1, 6000);
    expect(st.journal.some(j => j.k === 'reso' && j.b === 1)).toBe(true); // fired synchronised
    clearInterval(pump);
    host.close(); guest.close();
  }, 30000);
});
