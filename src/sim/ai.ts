// AISystem — opponents (and the optional AI partner) play through the same commands as humans,
// using only public information: their own resources, the draft, the next wave and the recommendation indicator.
import { UNITS } from '../data/units';
import { CORE, ECONOMY, GRID, RAIDERS } from '../data/economy';
import { getWave } from '../data/waves';
import { applyCommand, armyValue, workerCost } from './game';
import { fightRatio, groupStrength, waveGroup } from './balance';
import type { Difficulty, GameState, PlayerState } from './state';
import { raiderTarget, TIMING } from './state';
import { rand } from './rng';

interface DiffParams { target: number; smart: boolean; delay: number; eco: number; coreUse: boolean }
const DIFF: Record<Difficulty, DiffParams> = {
  initiation: { target: 0.75, smart: false, delay: 10, eco: 0.3, coreUse: false },
  normal: { target: 1.0, smart: true, delay: 6, eco: 0.6, coreUse: false },
  difficile: { target: 1.15, smart: true, delay: 4, eco: 0.85, coreUse: true },
  expert: { target: 1.25, smart: true, delay: 3, eco: 1, coreUse: true },
  maitre: { target: 1.35, smart: true, delay: 2, eco: 1.15, coreUse: true },
};

const acted = new WeakMap<GameState, Map<number, number>>();

function prefCell(id: string): { col: number; row: number } {
  const r = UNITS[id].roles;
  if (r.includes('tank')) return { col: 2, row: 3 };
  if (r.includes('assassin')) return { col: 4, row: 3 };
  if (r.includes('dps') && UNITS[id].range < 2) return { col: 3, row: 3 };
  if (r.includes('support')) return { col: 5, row: 3 };
  if (r.includes('carry')) return { col: 6, row: 3 };
  return { col: 7, row: 3 };
}

function freeCellNear(s: GameState, p: PlayerState, want: { col: number; row: number }, smart: boolean) {
  const free: { col: number; row: number; d: number }[] = [];
  for (let c = 0; c < GRID.cols; c++) for (let r = 0; r < GRID.rows; r++) {
    if (p.builds.some(b => b.col === c && b.row === r)) continue;
    const d = smart ? Math.abs(c - want.col) * 1.6 + Math.abs(r - want.row) + rand(s) * 0.5 : rand(s) * 10;
    free.push({ col: c, row: r, d });
  }
  free.sort((a, b) => a.d - b.d);
  return free[0];
}

export function difficultyOf(s: GameState, p: PlayerState): Difficulty {
  return p.team === 0 ? 'difficile' : s.settings.difficulty;
}

export function runAI(s: GameState) {
  let m = acted.get(s);
  if (!m) { m = new Map(); acted.set(s, m); }
  const buildLen = s.wave === 1 ? TIMING.firstBuild : TIMING.build;
  for (const p of s.players) {
    if (!p.isAI) continue;
    const prm = DIFF[difficultyOf(s, p)];
    if (m.get(p.pid) === s.wave) continue;
    if (buildLen - s.timer < prm.delay && s.timer > 1) continue;
    m.set(p.pid, s.wave);
    think(s, p, prm);
    p.ready = true;
  }
}

function think(s: GameState, p: PlayerState, prm: DiffParams) {
  // powers
  if (p.powerChoice) {
    const prefs: Record<string, string[]> = {
      economic: ['investissement', 'ouvriers', 'fortune'],
      aggressive: ['fureur', 'surcharge', 'eclat'],
      defensive: ['rempart', 'mutation', 'bouclier_core'],
      balanced: ['surcharge', 'mutation', 'investissement'],
    };
    const pick = prefs[p.personality].find(x => p.powerChoice!.includes(x)) ?? p.powerChoice[0];
    applyCommand(s, p.pid, { c: 'power', power: pick });
  }

  const pers = p.personality;
  const targetMul = prm.target * (pers === 'defensive' ? 1.12 : pers === 'economic' ? 0.92 : 1);
  const wave = waveGroup(s.wave);
  const ids = () => p.builds.map(b => b.defId);
  const ratio = (list: string[]) => list.length ? fightRatio(groupStrength(list.map(id => ({ stats: UNITS[id] }))), wave) : 0;

  // Leave some gold for workers when the economy plan says so
  const wantWorkers = Math.min(ECONOMY.maxWorkers, 1 + Math.floor(s.wave * 0.9 * prm.eco * (pers === 'economic' ? 1.5 : pers === 'defensive' ? 0.6 : 1)));

  // buy units / upgrades until the target ratio is reached
  for (let guard = 0; guard < 20; guard++) {
    const cur = ratio(ids());
    if (cur >= targetMul) break;
    let best: { score: number; act: () => void } | null = null;
    const tanks = p.builds.filter(b => UNITS[b.defId].roles.includes('tank')).length;
    const others = p.builds.length - tanks;
    for (const id of p.draft) {
      const u = UNITS[id];
      if (u.cost > p.gold) continue;
      const gain = ratio([...ids(), id]) - cur;
      // composition sense: roughly one tank per two damage dealers, avoid stacking duplicates
      const isT = u.roles.includes('tank');
      let comp = 1;
      if (isT && tanks * 2 > others) comp *= 0.45;
      if (!isT && tanks === 0 && p.builds.length > 0) comp *= 0.6;
      comp *= 1 / (1 + 0.15 * p.builds.filter(b => b.defId === id).length);
      const score = prm.smart ? (gain / u.cost) * comp : rand(s);
      if (!best || score > best.score) best = { score, act: () => {
        const cell = freeCellNear(s, p, prefCell(id), prm.smart);
        if (cell) applyCommand(s, p.pid, { c: 'build', unit: id, col: cell.col, row: cell.row });
      } };
    }
    for (const b of p.builds) {
      const nx = UNITS[b.defId].evolvesTo;
      if (!nx || UNITS[nx].cost > p.gold) continue;
      const list = ids().map(x => (x === b.defId ? nx : x));
      const gain = ratio(list) - cur;
      const score = prm.smart ? (gain / UNITS[nx].cost) * 1.1 : rand(s) * 0.5;
      if (!best || score > best.score) best = { score, act: () => applyCommand(s, p.pid, { c: 'upgrade', bid: b.bid }) };
    }
    if (!best) break;
    best.act();
  }

  // workers
  while (p.workers < wantWorkers && p.gold >= workerCost(p) + (pers === 'defensive' ? 40 : 0)) {
    if (applyCommand(s, p.pid, { c: 'worker' })) break;
  }

  // dump leftover gold into army if we are still below 1.0 (safety)
  if (ratio(ids()) < 1 && p.draft.some(id => UNITS[id].cost <= p.gold)) {
    const id = p.draft.filter(x => UNITS[x].cost <= p.gold).sort((a, b) => UNITS[b].cost - UNITS[a].cost)[0];
    const cell = freeCellNear(s, p, prefCell(id), prm.smart);
    if (cell) applyCommand(s, p.pid, { c: 'build', unit: id, col: cell.col, row: cell.row });
  }

  // ether: core upgrades when in danger, then raiders / investment
  const core = s.teams[p.team].core;
  if (prm.coreUse && (core.hp < core.maxHp * 0.6 || pers === 'defensive')) {
    const order: ('def' | 'atk' | 'regen' | 'pow')[] = core.hp < core.maxHp * 0.5 ? ['regen', 'def', 'atk'] : ['atk', 'def', 'pow', 'regen'];
    for (const up of order) {
      const lvl = core.up[up];
      const def = CORE.upgrades[up];
      if (lvl < def.max && p.ether >= def.costs[lvl] + 10) { applyCommand(s, p.pid, { c: 'core', up }); break; }
    }
  }
  if (raiderTarget(s, p.pid)) {
    const avail = RAIDERS.filter(r => r.unlockWave <= s.wave);
    const aggressive = pers === 'aggressive';
    // aggressive AI saves for the strongest raider; others maximise income/ether
    const pool = aggressive ? avail.slice().sort((a, b) => b.cost - a.cost) : avail.slice().sort((a, b) => b.income / b.cost - a.income / a.cost);
    const pick = pool[0];
    if (pick) {
      const reserve = prm.smart ? 0 : 10;
      let n = 0;
      while (p.ether >= pick.cost + reserve && n < 6) { if (applyCommand(s, p.pid, { c: 'raider', raider: pick.id })) break; n++; }
    }
  } else if (p.ether >= ECONOMY.investChunk * 2 && !(prm.coreUse && core.hp < core.maxHp * 0.6)) {
    applyCommand(s, p.pid, { c: 'invest' });
  }
  void getWave;
}
