// AISystem — opponents (and the optional AI partner) play through the same commands as humans,
// using only public information: their own resources, their roster, the next wave and the recommendation indicator.
// No cheating: same economy, same validation, same cooldowns.
import { UNITS, BRANCH_LEVEL, MAX_LEVEL, upgradeCost, unitStats } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { CORE, CURSES, DAMAGE_MATRIX, ECONOMY, GRID, RAIDERS, raiderPrice, raiderUnlock, curseUnlock, sendCap } from '../data/economy';
import { FACTION_POWERS, POWER_UP_COST, powerUnlock } from '../data/powers';
import { zoneOf, RuneKind } from '../data/synergies';
import { applyCommand, armyValue, sameSends, workerCost } from './game';
import { fightRatio, groupStrength, recommendedValue, waveGroup } from './balance';
import { previewSynergies } from './synergy';
import type { AttackType, Branch, CombatStats, EnemyDef } from '../data/types';

const ATK: AttackType[] = ['phys', 'perf', 'ener', 'arca'];
function resistOf(e: EnemyDef, at: AttackType) {
  let m = 1;
  for (const a of e.abilities) if (a.kind === 'resist' && a.attack === at) m *= 1 - a.pct;
  return m;
}
import type { Build, Difficulty, GameState, PlayerState } from './state';
import { opponents, TIMING } from './state';
import { rand } from './rng';

interface DiffParams { target: number; smart: boolean; delay: number; eco: number; coreUse: boolean; powerSkill: number }
const DIFF: Record<Difficulty, DiffParams> = {
  initiation: { target: 0.75, smart: false, delay: 10, eco: 0.3, coreUse: false, powerSkill: 0.15 },
  normal: { target: 1.0, smart: true, delay: 6, eco: 0.6, coreUse: false, powerSkill: 0.4 },
  difficile: { target: 1.15, smart: true, delay: 4, eco: 0.85, coreUse: true, powerSkill: 0.7 },
  expert: { target: 1.25, smart: true, delay: 3, eco: 1, coreUse: true, powerSkill: 0.85 },
  maitre: { target: 1.35, smart: true, delay: 2, eco: 1.15, coreUse: true, powerSkill: 1 },
};

const acted = new WeakMap<GameState, Map<number, number>>();

export function difficultyOf(s: GameState, p: PlayerState): Difficulty {
  if (s.settings.mode === 'duel') return s.settings.difficulty;
  return p.team === 0 ? 'difficile' : s.settings.difficulty;
}

/** Preferred column band by category: tanks in front, shooters in the back line. */
function prefCol(id: string): number {
  const u = UNITS[id];
  // towers just behind the front line, further back the longer their reach
  if (u.tower) return Math.max(3, Math.min(8, 1 + Math.floor(u.range - 1.5)));
  switch (u.category) {
    case 'defense': case 'lourde': return 2;
    case 'rapide': return 3;
    case 'soutien': return 4;
    default: return 2; // brawlers and specials without a tower fight up front
  }
}
const RUNE_FIT: Record<RuneKind, (id: string) => boolean> = {
  force: id => UNITS[id].category !== 'soutien' && !UNITS[id].roles.includes('tank'),
  vigueur: id => UNITS[id].roles.includes('tank'),
  celerite: () => true,
};

function bestCell(s: GameState, p: PlayerState, id: string, smart: boolean) {
  let best: { col: number; row: number } | null = null, bs = Infinity;
  const want = prefCol(id);
  for (let c = 0; c < GRID.cols; c++) for (let r = 0; r < GRID.rows; r++) {
    if (p.builds.some(b => b.col === c && b.row === r)) continue;
    let score: number;
    if (!smart) score = rand(s) * 10;
    else {
      score = Math.abs(c - want) * 1.5 + Math.abs(r - 3) * 0.7 + rand(s) * 0.6;
      score -= previewSynergies(id, c, r, p.builds).length * 1.6;
      const rune = p.runes.find(x => x.col === c && x.row === r);
      if (rune && RUNE_FIT[rune.kind](id)) score -= 2.5;
      const z = zoneOf(c);
      if (z === 'back' && UNITS[id].range > 2) score -= 0.8;
      if (z === 'front' && UNITS[id].roles.includes('tank')) score -= 0.8;
    }
    if (score < bs) { bs = score; best = { col: c, row: r }; }
  }
  return best;
}

export function runAI(s: GameState, force = false) {
  let m = acted.get(s);
  if (!m) { m = new Map(); acted.set(s, m); }
  const buildLen = s.timerMax || TIMING.build;
  for (const p of s.players) {
    if (!p.isAI) continue;
    const prm = DIFF[difficultyOf(s, p)];
    if (m.get(p.pid) === s.wave) continue;
    if (!force && buildLen - s.timer < prm.delay && s.timer > 1) continue;
    m.set(p.pid, s.wave);
    think(s, p, prm);
    p.ready = true;
  }
}

function statsOf(builds: Build[]): CombatStats[] { return builds.map(b => unitStats(b.defId, b.level, b.branch)); }

function think(s: GameState, p: PlayerState, prm: DiffParams, spendAll = false) {
  // passive power pick
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
  const targetMul = spendAll ? Infinity : prm.target * (pers === 'defensive' ? 1.12 : pers === 'economic' ? 0.92 : 1);
  const wave = waveGroup(s.wave);
  const ratio = (list: CombatStats[]) => list.length ? fightRatio(groupStrength(list.map(stats => ({ stats }))), wave) : 0;

  const wantWorkers = Math.min(ECONOMY.maxWorkers, 1 + Math.floor(s.wave * 0.9 * prm.eco * (pers === 'economic' ? 1.5 : pers === 'defensive' ? 0.6 : 1)));

  // fusions: free consolidation once the lane gets crowded, or to reach a specialisation
  if (prm.smart) {
    for (let guard = 0; guard < 6; guard++) {
      const pair = findPair(p);
      if (!pair) break;
      const crowded = p.builds.length >= 9;
      if (!crowded && pair[0].level + 1 < BRANCH_LEVEL) break;
      const branch = pair[0].level + 1 === BRANCH_LEVEL ? pickBranch(s, p, pair[0], ratio) : undefined;
      if (applyCommand(s, p.pid, { c: 'fuse', bid: pair[0].bid, with: pair[1].bid, branch })) break;
    }
  }

  // buy units / level-ups until the target ratio is reached
  for (let guard = 0; guard < (spendAll ? 60 : 24); guard++) {
    const cur = ratio(statsOf(p.builds));
    if (cur >= targetMul) break;
    let best: { score: number; act: () => string | null } | null = null;
    const tanks = p.builds.filter(b => UNITS[b.defId].roles.includes('tank')).length;
    const others = p.builds.length - tanks;
    for (const id of p.draft) {
      const u = UNITS[id];
      if (u.cost > p.gold) continue;
      const gain = ratio([...statsOf(p.builds), unitStats(id)]) - cur;
      const isT = u.roles.includes('tank');
      let comp = 1;
      if (isT && tanks * 2 > others) comp *= 0.45;
      if (!isT && tanks === 0 && p.builds.length > 0) comp *= 0.6;
      comp *= 1 / (1 + 0.12 * p.builds.filter(b => b.defId === id).length);
      const score = prm.smart ? (gain / u.cost) * comp : rand(s);
      if (!best || score > best.score) best = { score, act: () => {
        const cell = bestCell(s, p, id, prm.smart);
        return cell ? applyCommand(s, p.pid, { c: 'build', unit: id, col: cell.col, row: cell.row }) : 'full';
      } };
    }
    for (const b of p.builds) {
      if (b.level >= MAX_LEVEL) continue;
      const next = b.level + 1;
      const cost = upgradeCost(b.defId, next);
      if (cost > p.gold) continue;
      const branch = next === BRANCH_LEVEL && UNITS[b.defId].branches ? pickBranch(s, p, b, ratio) : b.branch;
      const list = p.builds.map(x => (x === b ? unitStats(b.defId, next, branch) : unitStats(x.defId, x.level, x.branch)));
      const gain = ratio(list) - cur;
      // levelling saves grid space and reaches specialisations: slight preference once the army is wide
      const pref = 1 + Math.min(0.3, p.builds.length * 0.025);
      const score = prm.smart ? (gain / cost) * pref : rand(s) * 0.5;
      if (!best || score > best.score) best = { score, act: () => applyCommand(s, p.pid, { c: 'upgrade', bid: b.bid, branch: branch ?? undefined }) };
    }
    if (!best) break;
    if (best.act()) break;
  }

  if (spendAll) return;
  // workers
  while (p.workers < wantWorkers && p.gold >= workerCost(p) + (pers === 'defensive' ? 40 : 0)) {
    if (applyCommand(s, p.pid, { c: 'worker' })) break;
  }

  // safety: dump leftover gold into the army if still clearly below the recommendation
  const rec = recommendedValue(s.wave, p.builds, armyValue(p), 1);
  if (armyValue(p) < rec && p.draft.some(id => UNITS[id].cost <= p.gold)) {
    const id = p.draft.filter(x => UNITS[x].cost <= p.gold).sort((a, b) => UNITS[b].cost - UNITS[a].cost)[0];
    const cell = bestCell(s, p, id, prm.smart);
    if (cell) applyCommand(s, p.pid, { c: 'build', unit: id, col: cell.col, row: cell.row });
  }

  spendEther(s, p, prm);
}

function findPair(p: PlayerState): [Build, Build] | null {
  for (let i = 0; i < p.builds.length; i++) for (let j = i + 1; j < p.builds.length; j++) {
    const a = p.builds[i], b = p.builds[j];
    if (a.defId === b.defId && a.level === b.level && a.branch === b.branch && a.level < MAX_LEVEL) return a.level >= b.level ? [a, b] : [b, a];
  }
  return null;
}

/** Choose the specialisation that helps most against the coming wave (with a little personality noise). */
function pickBranch(s: GameState, p: PlayerState, b: Build, ratio: (l: CombatStats[]) => number): Branch {
  let best: Branch = 'A', bv = -Infinity;
  for (const br of ['A', 'B'] as Branch[]) {
    const list = p.builds.map(x => (x === b ? unitStats(b.defId, BRANCH_LEVEL, br) : unitStats(x.defId, x.level, x.branch)));
    const v = ratio(list) * (0.92 + rand(s) * 0.16);
    if (v > bv) { bv = v; best = br; }
  }
  return best;
}

function spendEther(s: GameState, p: PlayerState, prm: DiffParams) {
  const pers = p.personality;
  const core = s.teams[p.team].core;
  // Core upgrades when in danger
  if (prm.coreUse && (core.hp < core.maxHp * 0.6 || pers === 'defensive')) {
    const order: ('def' | 'atk' | 'regen' | 'pow')[] = core.hp < core.maxHp * 0.5 ? ['regen', 'def', 'atk'] : ['atk', 'def', 'pow', 'regen'];
    for (const up of order) {
      const lvl = core.up[up];
      const def = CORE.upgrades[up];
      if (lvl < def.max && p.ether >= def.costs[lvl] + 10) { applyCommand(s, p.pid, { c: 'core', up }); break; }
    }
  }
  // commander power upgrades (smart AIs, mid game)
  if (prm.smart && s.wave >= 5 && p.ether > 120) {
    const slot = [2, 1, 0].find(i => p.powerLv[i] < 3 && powerUnlock(FACTION_POWERS[p.faction][i], s.settings.totalWaves) <= s.wave);
    if (slot !== undefined && p.ether >= POWER_UP_COST[p.powerLv[slot] + 1] + 40) applyCommand(s, p.pid, { c: 'powerUp', slot });
  }
  const opp = opponents(s, p.pid);
  if (!opp.length) {
    if (p.ether >= ECONOMY.investChunk * 2 && !(prm.coreUse && core.hp < core.maxHp * 0.6)) applyCommand(s, p.pid, { c: 'invest' });
    return;
  }
  // target the weaker opposing lane (public info: army value vs recommendation)
  const target = opp.slice().sort((a, b) => armyValue(a) / Math.max(1, recommendedValue(s.wave, a.builds, armyValue(a), 1)) - armyValue(b) / Math.max(1, recommendedValue(s.wave, b.builds, armyValue(b), 1)))[0];
  const tw = s.settings.totalWaves;
  // curse (aggressive / balanced)
  if (prm.smart && (pers === 'aggressive' || (pers === 'balanced' && rand(s) < 0.4))) {
    const avail = CURSES.filter(c => curseUnlock(c, tw) <= s.wave && (p.curseCd[c.id] ?? 0) <= s.wave && p.ether >= c.ether + 20 && p.gold >= c.gold);
    if (avail.length) applyCommand(s, p.pid, { c: 'curse', curse: avail[Math.floor(rand(s) * avail.length)].id, to: target.pid });
  }
  // sends: counter-pick against the target's dominant attack type
  const atk = groupStrength(statsOf(target.builds).map(stats => ({ stats }))).atk;
  const tot = (atk.phys + atk.perf + atk.ener + atk.arca) || 1;
  if (tot === 1) atk.phys = 1;
  const avail = RAIDERS.filter(r => raiderUnlock(r, tw) <= s.wave && (p.raiderCd[r.id] ?? 0) <= s.wave);
  const reserve = prm.smart ? (pers === 'defensive' ? 30 : 0) : 10;
  for (let n = 0; n < 8 && p.raiderQueue.length < sendCap(s.wave); n++) {
    let best: { id: string; score: number } | null = null;
    for (const r of avail) {
      const same = sameSends(p, r.id);
      if (same >= r.maxPerWave) continue;
      const price = raiderPrice(r, same);
      if (price.ether + reserve > p.ether || price.gold > p.gold * 0.3) continue;
      // pressure value: effective HP of the pack against the target's damage mix (counter-pick)
      let ehp = 0;
      for (const u of r.units) {
        const e = ENEMIES[u.enemy];
        let mul = 0;
        for (const at of ATK) mul += (atk[at] / tot) * DAMAGE_MATRIX[at][e.defense] * resistOf(e, at);
        ehp += (u.count * e.hp) / (1 - e.armor) / Math.max(0.3, mul);
      }
      const pressure = ehp / (price.ether + price.gold * 1.5);
      const eco = r.income / (price.ether + price.gold);
      const score = pers === 'economic' ? eco * 10 + pressure * 0.01 : pressure * (pers === 'aggressive' ? 0.03 : 0.015) + eco * 6 + rand(s) * 0.3;
      if (!best || score > best.score) best = { id: r.id, score };
    }
    if (!best) break;
    if (applyCommand(s, p.pid, { c: 'raider', raider: best.id, to: target.pid })) break;
    if (pers !== 'aggressive' && p.ether < 40) break;
  }
}

/** Combat-time decisions: commander powers (AIs use them like players would, with reaction noise). */
export function aiCombat(s: GameState) {
  for (const p of s.players) {
    if (!p.isAI) continue;
    const prm = DIFF[difficultyOf(s, p)];
    if (rand(s) > prm.powerSkill) continue;
    const foes = s.ents.filter(e => e.enemy && !e.dead && e.arena === p.team && e.owner === p.pid);
    if (!foes.length) continue;
    const mine = s.ents.filter(e => !e.enemy && !e.dead && e.arena === p.team && e.owner === p.pid);
    const boss = foes.some(e => e.boss || e.elite);
    const leaking = foes.some(e => e.leaked);
    const hurt = mine.length ? mine.reduce((t, e) => t + e.hp / e.maxHp, 0) / mine.length : 1;
    const powers = FACTION_POWERS[p.faction];
    for (let slot = 2; slot >= 0; slot--) {
      const def = powers[slot];
      if (p.powerCd[slot] > 0 || powerUnlock(def, s.settings.totalWaves) > s.wave || s.combatTime < p.jamUntil) continue;
      const defensive = def.id === 'heal' || def.id === 'bubble';
      const want = defensive ? hurt < 0.6 : (boss || leaking || foes.length >= 6);
      if (want && !applyCommand(s, p.pid, { c: 'cast', slot })) break;
    }
  }
}

/** Balance tooling: spend all of p's gold on the army with the smart AI logic (no economy, no ether). */
export function aiSpendAll(s: GameState, p: PlayerState) { think(s, p, DIFF.expert, true); }
