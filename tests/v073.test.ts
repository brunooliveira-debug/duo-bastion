// v0.7.3: mixed company (6 units from every army, one per category) — validation, game creation, network lobby.
import { describe, it, expect, beforeAll } from 'vitest';
import { createGame } from '../src/sim/game';
import { validateCompany, companyCommander, companyArmies, unitsOfCategory, CATEGORY_ORDER, COMPANY_SIZE } from '../src/data/roster';
import { UNITS, FACTIONS, BASE_UNIT_IDS } from '../src/data/units';

const COMPANY = ['gardien_stellaire', 'colosse_forge', 'harponneuse', 'arbaletriere', 'pestifere', 'druidesse'];

describe('mixed company', () => {
  it('every category offers at least 3 base units, and the sample company is valid', () => {
    for (const cat of CATEGORY_ORDER) expect(unitsOfCategory(cat).length, cat).toBeGreaterThanOrEqual(3);
    expect(unitsOfCategory('defense').every(id => !UNITS[id].token)).toBe(true);
    expect(validateCompany(COMPANY)).toEqual(COMPANY);
    expect(companyArmies(COMPANY)).toHaveLength(6);
    expect(companyCommander(COMPANY, 'rouages')).toBe('rouages');
    expect(companyCommander(COMPANY, 'random')).toBe('astreens'); // ties: army order
    expect(companyCommander(['colosse_forge', 'bombardiere', 'harponneuse', 'arbaletriere', 'pestifere', 'druidesse'])).toBe('rouages');
  });

  it('rejects wrong sizes, duplicates, tokens, unknown ids and two units of the same category', () => {
    expect(validateCompany(null)).toBeNull();
    expect(validateCompany(COMPANY.slice(0, 5))).toBeNull();
    expect(validateCompany([...COMPANY, 'loup_astral'])).toBeNull();
    expect(validateCompany([...COMPANY.slice(0, 5), 'gardien_stellaire'])).toBeNull(); // duplicate
    expect(validateCompany([...COMPANY.slice(0, 5), 'ferraille'])).toBeNull(); // second "défense"
    expect(validateCompany([...COMPANY.slice(0, 5), 'squelette'])).toBeNull(); // token
    expect(validateCompany([...COMPANY.slice(0, 5), 'nope'])).toBeNull();
    expect(validateCompany([...COMPANY.slice(0, 5), 42])).toBeNull();
    expect(COMPANY_SIZE).toBe(6);
    expect(BASE_UNIT_IDS.length).toBe(36);
  });

  it('a human with a company fields it; the commander army gives the doctrine; odd rosters fall back', () => {
    const s = createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: 'rouages', roster: COMPANY }, { name: 'B', faction: 'abysses', roster: ['x'] }] }, 5);
    expect(s.players[0].faction).toBe('rouages');
    expect(s.players[0].draft).toEqual(COMPANY);
    expect(s.players[1].draft).toEqual(FACTIONS.abysses.units);
    // random army: the company is ignored (no commander to lead it)
    const r = createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [{ name: 'A', faction: 'random', roster: COMPANY }] }, 5);
    expect(r.players[0].draft).toEqual(FACTIONS[r.players[0].faction].units);
    // AI players always use their native roster
    for (const p of s.players.filter(p => p.isAI)) expect(p.draft).toEqual(FACTIONS[p.faction].units);
  });
});

describe('mixed company over the network', () => {
  beforeAll(() => {
    const g = globalThis as Record<string, unknown>;
    g.window = globalThis;
    const store = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    if (!g.navigator) g.navigator = { userAgent: 'node' };
    g.location = { search: '', origin: 'http://test', pathname: '/' };
  });
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  async function until(fn: () => boolean, ms = 5000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await wait(20); } }

  it('the guest announces its company, the host validates it and the game uses it', async () => {
    const { Session } = await import('../src/net/Session');
    const noop = { lobby() {}, start() {}, toast() {}, conn() {}, kicked() {}, rematch() {} };
    const host = new Session('host', 'CMP01', 'uid-hc', { ...noop });
    const guest = new Session('guest', 'CMP01', 'uid-gc', { ...noop });
    await host.open();
    await guest.open();
    await until(() => host.lobby.players.length === 2);
    guest.setFaction('necrose', COMPANY);
    await until(() => host.lobby.players[1].faction === 'necrose' && !!host.lobby.players[1].roster);
    expect(host.lobby.players[1].roster).toEqual(COMPANY);
    // a forged roster from the network never reaches the game
    guest.transport!.send({ k: 'faction', uid: 'uid-gc', f: 'necrose', roster: ['squelette', 'squelette', 'squelette', 'squelette', 'squelette', 'squelette'] });
    await until(() => host.lobby.players[1].roster === null);
    guest.setFaction('necrose', COMPANY);
    await until(() => !!host.lobby.players[1].roster);
    host.setReady(true); guest.setReady(true);
    await until(() => host.lobby.players.every(p => p.ready));
    host.setSettings({ mode: 'vsai', totalWaves: 10, difficulty: 'normal' });
    host.startGame();
    expect(host.state!.players[1].faction).toBe('necrose');
    expect(host.state!.players[1].draft).toEqual(COMPANY);
    host.close(); guest.close();
  }, 20000);
});
