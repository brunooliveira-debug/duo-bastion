// AISystem — opponents (and the optional AI partner) play through the same commands as humans,
// using only public information: their own resources, their roster, the next wave and the recommendation indicator.
// No cheating: same economy, same validation, same cooldowns.
// v0.4: Bastion modules, anomalies, secondary rifts, tactical orders and the Résonance DUO (trigger / synchronise).
import { UNITS, BRANCH_LEVEL, MAX_LEVEL, unitStats } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { getWave } from '../data/waves';
import { CURSES, DAMAGE_MATRIX, ECONOMY, GRID, RAIDERS, raiderPrice, raiderUnlock, curseUnlock, sendCap } from '../data/economy';
import { FACTION_POWERS, POWER_UP_COST, powerUnlock } from '../data/powers';
import { MODULES, moduleCost, ModuleId } from '../data/modules';
import { RESO_MAX } from '../data/resonance';
import type { AnomalyId } from '../data/tactics';
import type { BlessingId } from '../data/blessings';
import { zoneOf, RuneKind } from '../data/synergies';
import { applyCommand, armyValue, buildPrice, riftThisWave, sameSends, upgradePrice, workerCost } from './game';
import { fightRatio, groupStrength, recommendedValue, waveGroup } from './balance';
import { previewSynergies } from './synergy';
import type { AttackType, Branch, CombatStats, EnemyDef } from '../data/types';
import type { Build, Difficulty, GameState, PlayerState, Personality } from './state';
import { opponents, TIMING } from './state';
import { rand } from './rng';

const ATK: AttackType[] = ['phys', 'perf', 'ener', 'arca'];
function resistOf(e: EnemyDef, at: AttackType) {
  let m = 1;
  for (const a of e.abilities) if (a.kind === 'resist' && a.attack === at) m *= 1 - a.pct;
  return m;
}

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
  instable: id => UNITS[id].category !== 'soutien',
  faille: id => UNITS[id].category !== 'soutien',
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
      if (rune && RUNE_FIT[rune.kind](id)) score -= rune.kind === 'instable' || rune.kind === 'faille' ? 4 : 2.5;
      if (p.hazards.some(h => h.col === c && h.row === r)) score += 6;
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

const ANOMALY_PREF: Record<Personality, AnomalyId[]> = {
  economic: ['fortune', 'pacte', 'arsenal', 'contrat', 'tempete', 'veille', 'rune_instable', 'eclipse', 'resonance_instable', 'sacrifice'],
  aggressive: ['sacrifice', 'rune_instable', 'resonance_instable', 'pacte', 'tempete', 'fortune', 'arsenal', 'contrat', 'eclipse', 'veille'],
  defensive: ['veille', 'eclipse', 'tempete', 'arsenal', 'resonance_instable', 'rune_instable', 'contrat', 'fortune', 'pacte', 'sacrifice'],
  balanced: ['tempete', 'arsenal', 'veille', 'resonance_instable', 'rune_instable', 'eclipse', 'pacte', 'fortune', 'contrat', 'sacrifice'],
};

const BLESSING_PREF: Record<Personality, BlessingId[]> = {
  defensive: ['remparts', 'phalange', 'egide', 'coeur', 'releve', 'givre', 'discipline', 'cadence', 'trempe', 'intendance', 'harmonie', 'primes', 'chasse', 'venin', 'rebonds', 'moisson'],
  economic: ['intendance', 'primes', 'moisson', 'cadence', 'harmonie', 'trempe', 'remparts', 'rebonds', 'egide', 'phalange', 'chasse', 'venin', 'discipline', 'coeur', 'givre', 'releve'],
  aggressive: ['trempe', 'chasse', 'venin', 'rebonds', 'cadence', 'primes', 'givre', 'harmonie', 'discipline', 'releve', 'egide', 'phalange', 'moisson', 'intendance', 'coeur', 'remparts'],
  balanced: ['cadence', 'trempe', 'rebonds', 'egide', 'primes', 'remparts', 'phalange', 'harmonie', 'venin', 'intendance', 'chasse', 'givre', 'discipline', 'coeur', 'releve', 'moisson'],
};

function think(s: GameState, p: PlayerState, prm: DiffParams, spendAll = false) {
  // v0.7 blessing draft: the AI picks when it is its turn (a human partner always picks over it)
  const offer = s.teams[p.team].blessingOffer;
  if (offer && offer.picker === p.pid) applyCommand(s, p.pid, { c: 'bless', id: BLESSING_PREF[p.personality].find(b => offer.ids.includes(b)) ?? offer.ids[0] });
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
  // anomaly vote (only decides in all-AI teams: a human teammate chooses for the team)
  const team = s.teams[p.team];
  if (team.anomalyOffer && !p.anomalyVote) {
    const pick = ANOMALY_PREF[p.personality].find(a => team.anomalyOffer!.includes(a)) ?? team.anomalyOffer[0];
    if (!s.players.some(o => o.team === p.team && !o.isAI)) applyCommand(s, p.pid, { c: 'anomaly', id: pick });
  }

  const pers = p.personality;
  const targetMul = spendAll ? Infinity : prm.target * (pers === 'defensive' ? 1.12 : pers === 'economic' ? 0.92 : 1);
  const wave = waveGroup(s.wave);
  const ratio = (list: CombatStats[]) => list.length ? fightRatio(groupStrength(list.map(stats => ({ stats }))), wave) : 0;
  // the strength model ignores the number of targets: read the coming wave like a player would
  const wd = getWave(s.wave);
  const count = wd.groups.reduce((t, g) => t + g.count, 0);
  const fast = wd.groups.reduce((t, g) => t + ENEMIES[g.enemy].moveSpeed * g.count, 0) / Math.max(1, count) >= 3.2;
  // v0.7: breachers ignore the front line — only reach, slows and interceptors stop them; summoners hide behind
  const breach = wd.groups.some(g => ENEMIES[g.enemy].abilities.some(a => a.kind === 'breach'));
  const kiters = wd.groups.some(g => ENEMIES[g.enemy].abilities.some(a => a.kind === 'kite'));
  const fit = (id: string) => {
    const u = UNITS[id];
    let k = 1;
    if (count >= 14 && u.abilities.some(a => a.kind === 'splash' || a.kind === 'poison' || a.kind === 'chain' || a.kind === 'novaPulse' || a.kind === 'slowPulse')) k *= 1.35;
    if (fast && (u.range > 3 || u.abilities.some(a => a.kind === 'slowOnHit' || a.kind === 'slowPulse' || a.kind === 'interceptor' || a.kind === 'taunt'))) k *= 1.2;
    if (breach && (u.range > 3 || u.abilities.some(a => a.kind === 'slowOnHit' || a.kind === 'slowPulse' || a.kind === 'interceptor'))) k *= 1.3;
    if (kiters && (u.range > 4 || u.abilities.some(a => a.kind === 'dash'))) k *= 1.15;
    return k;
  };

  const wantWorkers = Math.min(ECONOMY.maxWorkers, 1 + Math.floor(s.wave * 0.9 * prm.eco * (pers === 'economic' ? 1.5 : pers === 'defensive' ? 0.6 : 1)));

  // fusions are free and give the "Éclat de fusion" bonus: always worth it for a smart AI
  if (prm.smart) {
    for (let guard = 0; guard < 6; guard++) {
      const pair = findPair(p);
      if (!pair) break;
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
      const price = buildPrice(s, p, id);
      if (price > p.gold) continue;
      const gain = ratio([...statsOf(p.builds), unitStats(id)]) - cur;
      const isT = u.roles.includes('tank');
      let comp = 1;
      if (isT && tanks * 2 > others) comp *= 0.45;
      if (!isT && tanks === 0 && p.builds.length > 0) comp *= 0.6;
      const copies = p.builds.filter(b => b.defId === id).length;
      comp *= 1 / (1 + 0.18 * copies);
      // a balanced composition: a front line AND shooters behind it
      const ranged = p.builds.filter(b => UNITS[b.defId].range > 2).length;
      if (u.range > 2 && p.builds.length >= 3 && ranged < p.builds.length * 0.35) comp *= 1.25;
      // a second copy of a level-1 unit can be fused next wave (+10 % bonus): slight preference
      if (copies === 1 && p.builds.some(b => b.defId === id && b.level === 1)) comp *= 1.15;
      const score = prm.smart ? (gain / price) * comp * fit(id) : rand(s);
      if (!best || score > best.score) best = { score, act: () => {
        const cell = bestCell(s, p, id, prm.smart);
        return cell ? applyCommand(s, p.pid, { c: 'build', unit: id, col: cell.col, row: cell.row }) : 'full';
      } };
    }
    for (const b of p.builds) {
      if (b.level >= MAX_LEVEL) continue;
      const next = b.level + 1;
      const cost = upgradePrice(s, p, b.defId, next);
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
  if (armyValue(p) < rec && p.draft.some(id => buildPrice(s, p, id) <= p.gold)) {
    const id = p.draft.filter(x => buildPrice(s, p, x) <= p.gold).sort((a, b) => UNITS[b].cost - UNITS[a].cost)[0];
    const cell = bestCell(s, p, id, prm.smart);
    if (cell) applyCommand(s, p.pid, { c: 'build', unit: id, col: cell.col, row: cell.row });
  }

  // secondary rift: close it when the army is comfortably above the need (risk / reward)
  if (prm.smart && riftThisWave(s, p.team)) {
    const cur = ratio(statsOf(p.builds));
    const want = cur >= prm.target * 1.15 ? (s.wave >= 9 ? 2 : 1) : cur >= prm.target * 1.02 && pers !== 'defensive' ? 1 : 0;
    const mobile = p.builds.filter(b => !UNITS[b.defId].tower && !UNITS[b.defId].roles.includes('tank') && UNITS[b.defId].category !== 'soutien')
      .sort((a, b) => unitStats(b.defId, b.level, b.branch).dmg * unitStats(b.defId, b.level, b.branch).atkSpeed - unitStats(a.defId, a.level, a.branch).dmg * unitStats(a.defId, a.level, a.branch).atkSpeed);
    for (const b of mobile.slice(0, want)) applyCommand(s, p.pid, { c: 'rift', bid: b.bid, on: true });
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

const MODULE_PREF: Record<Personality, ModuleId[]> = {
  defensive: ['rempart', 'egide', 'canon', 'restauration', 'givre', 'entrave'],
  economic: ['forge', 'canon', 'tresor', 'rempart', 'onde', 'cadence'],
  aggressive: ['canon', 'onde', 'cadence', 'rayon', 'orage', 'entrave'],
  balanced: ['canon', 'rempart', 'cadence', 'onde', 'egide', 'entrave'],
};

/** Bastion modules: install / upgrade through a proposal (an AI partner accepts, a human validates). */
function planModules(s: GameState, p: PlayerState, prm: DiffParams) {
  const team = s.teams[p.team];
  if (team.proposal || !prm.smart || s.wave < 3) return;
  const core = team.core;
  const pref = core.hp < core.maxHp * 0.55 ? ['rempart', 'restauration', 'egide', ...MODULE_PREF[p.personality]] as ModuleId[] : MODULE_PREF[p.personality];
  const reserve = prm.coreUse ? 15 : 35;
  // upgrade an installed module first (cheaper per effect), else install the next preferred one
  for (const m of team.modules) {
    if (!m || m.lv >= 3) continue;
    const c = moduleCost(m.id, m.lv + 1);
    if (s.wave >= 6 + m.lv * 3 && p.ether >= c + reserve && rand(s) < 0.5) { applyCommand(s, p.pid, { c: 'module', action: 'upgrade', module: m.id }); return; }
  }
  if (!team.modules.some(m => !m)) return;
  const id = pref.find(x => !team.modules.some(m => m?.id === x) && MODULES[x]);
  if (id && p.ether >= moduleCost(id, 1) + reserve && rand(s) < 0.6) applyCommand(s, p.pid, { c: 'module', action: 'install', module: id });
}

function spendEther(s: GameState, p: PlayerState, prm: DiffParams) {
  const pers = p.personality;
  planModules(s, p, prm);
  // commander power upgrades (smart AIs, mid game)
  if (prm.smart && s.wave >= 5 && p.ether > 120) {
    const slot = [2, 1, 0].find(i => p.powerLv[i] < 3 && powerUnlock(FACTION_POWERS[p.faction][i], s.settings.totalWaves) <= s.wave);
    if (slot !== undefined && p.ether >= POWER_UP_COST[p.powerLv[slot] + 1] + 40) applyCommand(s, p.pid, { c: 'powerUp', slot });
  }
  const opp = opponents(s, p.pid);
  const core = s.teams[p.team].core;
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

/** Combat-time decisions: commander powers, tactical orders and the Résonance (with reaction noise). */
export function aiCombat(s: GameState) {
  // Résonance: AI-only teams trigger it when it matters; an AI partner synchronises the human's activation
  for (const t of s.teams) {
    const members = s.players.filter(p => p.team === t.id);
    // v0.7 twin seals: an AI partner answers a human's seal at once; an all-AI team breaks them once the boss is engaged
    if (t.seal && !t.seal.broken) {
      const humans = members.filter(p => !p.isAI);
      const boss = s.ents.find(e => e.id === t.seal!.boss && !e.dead);
      if (boss) for (const p of members) {
        if (!p.isAI) continue;
        const prm = DIFF[difficultyOf(s, p)];
        const humanArmed = humans.some(h => s.combatTime - t.seal!.armed[h.slot] < 2.6);
        const engaged = !humans.length && boss.hp < boss.maxHp * 0.92;
        if ((humanArmed && rand(s) < prm.powerSkill + 0.5) || engaged) applyCommand(s, p.pid, { c: 'seal' });
      }
    }
    if (t.resoCast) {
      const mate = members.find(p => p.pid !== t.resoCast!.by && p.isAI);
      if (mate && !t.resoCast.sync && rand(s) < DIFF[difficultyOf(s, mate)].powerSkill + 0.35) applyCommand(s, mate.pid, { c: 'reso' });
      continue;
    }
    if (t.reso < RESO_MAX || members.some(p => !p.isAI)) continue;
    const prm = DIFF[difficultyOf(s, members[0])];
    if (rand(s) > prm.powerSkill + 0.2) continue;
    const foes = s.ents.filter(e => e.enemy && !e.dead && !e.rift && e.arena === t.id);
    const boss = foes.some(e => e.boss && e.hp > e.maxHp * 0.4);
    const leaking = foes.filter(e => e.leaked).length >= 3;
    const danger = t.core.hp < t.core.maxHp * 0.45 && foes.length >= 6;
    if (boss || leaking || danger) applyCommand(s, members[0].pid, { c: 'reso' });
  }
  for (const p of s.players) {
    if (!p.isAI) continue;
    const prm = DIFF[difficultyOf(s, p)];
    if (rand(s) > prm.powerSkill) continue;
    const foes = s.ents.filter(e => e.enemy && !e.dead && !e.rift && e.arena === p.team && e.owner === p.pid);
    const mine = s.ents.filter(e => !e.enemy && !e.dead && e.arena === p.team && e.owner === p.pid);
    // tactical orders
    if (p.orders > 0 && s.combatTime >= p.orderCd && prm.smart) {
      const tele = s.ents.some(e => e.enemy && e.tele && e.arena === p.team && mine.filter(u => (u.x - e.tele!.x) ** 2 + (u.z - e.tele!.z) ** 2 <= e.tele!.r ** 2).length >= 2);
      const leaked = s.ents.filter(e => e.enemy && !e.dead && e.leaked && e.arena === p.team).length;
      const big = foes.find(e => (e.boss || e.elite) && e.focusUntil <= s.combatTime);
      const hurt = mine.length ? mine.reduce((t, e) => t + e.hp / e.maxHp, 0) / mine.length : 1;
      let order: 'retreat' | 'intercept' | 'purge' | 'focus' | 'rally' | null = null;
      if (tele) order = 'retreat';
      else if (leaked >= 2) order = 'intercept';
      else if (s.combatTime < p.fogUntil || s.combatTime < p.jamUntil) order = 'purge';
      else if (big) order = 'focus';
      else if (hurt < 0.5 && foes.length >= 4) order = 'rally';
      if (order) applyCommand(s, p.pid, { c: 'order', order });
    }
    if (!foes.length) continue;
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
