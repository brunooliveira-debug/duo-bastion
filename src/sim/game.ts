// Game orchestrator: WaveSystem, EconomySystem, ArmySystem (build / level-up / fusion), RaiderSystem (sends + curses),
// commander powers, random wave events, end-of-game sequence and command validation.
// v0.4: Résonance DUO, Bastion modules (joint decisions), tactical orders, secondary rifts, anomalies,
// deterministic world rolls (same seed ⇒ same world) and the game journal.
// Pure logic, no DOM. The host owns one instance; guests only receive snapshots.
import { UNITS, FACTIONS, FACTION_IDS, MAX_LEVEL, BRANCH_LEVEL, upgradeCost, unitValueAt } from '../data/units';
import {
  CORE, ECONOMY, GRID, POWERS, RAIDERS, CURSES, TIMING, buildTime, raiderScale, raiderUnlock, raiderPrice, sendCap, curseUnlock,
} from '../data/economy';
import { FACTION_POWERS, POWER_LEVEL_CD, POWER_MAX_LEVEL, POWER_UP_COST, powerUnlock } from '../data/powers';
import { getWave, WAVE_EVENTS } from '../data/waves';
import { MODULES, MODULE_SLOTS, MOD, PROPOSAL_TIMEOUT, MODULE_REFUND, moduleCost, moduleValue, ModuleId } from '../data/modules';
import { RESO_MAX, RESO_CHANNEL, RESO_GAIN } from '../data/resonance';
import {
  ORDERS, ORDER_CHARGES, ORDER_COOLDOWN, OrderId, ANOMALIES, ANOMALY_IDS, ANOMALY_WAVES, AnomalyId, anomalyWaves, fortuneGold,
  RIFT_CHANCE, RIFT_REWARD_IDS, RIFT_MAX_UNITS,
} from '../data/tactics';
import type { Branch, FactionId } from '../data/types';
import type { RuneKind, RuneTile } from '../data/synergies';
import {
  DT, GameSettings, GameState, PlayerState, TeamState, STATE_VERSION, newStats, newTeam, teamCount, raiderTarget, opponents, humanPlayers, humanPid,
  Personality, partnerOf, moduleLv, anomalyOf, journal, type UndoStep } from './state';
import { rand, shuffle, worldRand, worldPick } from './rng';
import { applyOrder, castPower, combatTick, enemiesAlive, fireResonance, hitCore, spawnEnemies, spawnRift, spawnUnits, SpawnSpec } from './combat';
import { addReso, teamAbility } from './resonance';
import { runAI, aiCombat } from './ai';

export type Command =
  | { c: 'build'; unit: string; col: number; row: number }
  | { c: 'move'; bid: number; col: number; row: number }
  | { c: 'sell'; bid: number }
  | { c: 'undo' }
  | { c: 'upgrade'; bid: number; branch?: Branch }
  | { c: 'fuse'; bid: number; with: number; branch?: Branch }
  | { c: 'worker' }
  | { c: 'raider'; raider: string; to?: number }
  | { c: 'curse'; curse: string; to?: number }
  | { c: 'cast'; slot: number }
  | { c: 'powerUp'; slot: number }
  | { c: 'invest' }
  | { c: 'module'; action: 'install' | 'upgrade' | 'remove'; module: ModuleId; slot?: number }
  | { c: 'moduleVote'; accept: boolean }
  | { c: 'reso' }
  | { c: 'order'; order: OrderId; x?: number; z?: number }
  | { c: 'anomaly'; id: AnomalyId }
  | { c: 'rift'; bid: number; on: boolean }
  | { c: 'reroll' }
  | { c: 'ready'; value: boolean }
  | { c: 'power'; power: string }
  | { c: 'ping'; ping: string }
  | { c: 'speed'; speed: number }
  | { c: 'pause'; value: boolean }
  | { c: 'debug'; action: string };

export const POWER_WAVE = (s: GameState) => (s.settings.totalWaves <= 10 ? 6 : 11);
export const ENDING_TIME = 3.2; // seconds of (slow-motion) game time between the Core falling and the result

const PERSONALITIES: Personality[] = ['defensive', 'economic', 'aggressive', 'balanced'];
const AI_NAMES = ['Vex', 'Morgane', 'Krull', 'Ishta', 'Orso', 'Sélène'];

/** Rune tiles of a lane: world roll (same seed ⇒ same runes). */
function rollRunes(s: GameState, pid: number): RuneTile[] {
  const kinds: RuneKind[] = ['force', 'vigueur', 'celerite'];
  const out: RuneTile[] = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 200) {
    const col = 2 + Math.floor(worldRand(s.seed, 100 + pid, guard, 1) * 8), row = Math.floor(worldRand(s.seed, 100 + pid, guard, 2) * GRID.rows);
    if (out.some(r => Math.abs(r.col - col) + Math.abs(r.row - row) < 3)) continue;
    out.push({ col, row, kind: kinds[out.length] });
  }
  return out;
}

export function createGame(settings: GameSettings, seed: number): GameState {
  const s: GameState = {
    v: STATE_VERSION, settings, seed, rng: seed | 0, tick: 0, time: 0, wave: 1, phase: 'build',
    timer: buildTime(1, false), timerMax: buildTime(1, false), waveEvent: null, lastEvent: null, rift: null, ending: 0,
    combatTime: 0, speed: 1, paused: false,
    teams: [], players: [], ents: [], nextId: 1, events: [], result: null, fallen: [], journal: [],
  };
  const nTeams = teamCount(s);
  for (let t = 0; t < nTeams; t++) s.teams.push(newTeam(t));
  const humanAt = new Map<number, number>();
  settings.humans.forEach((_, i) => humanAt.set(humanPid(settings.mode, i), i));
  for (let t = 0; t < nTeams; t++) {
    const used = new Set<FactionId>();
    for (let slot = 0; slot < 2; slot++) {
      const pid = t * 2 + slot;
      const hi = humanAt.get(pid);
      const human = hi !== undefined ? settings.humans[hi] : undefined;
      const pers: Personality = t === 0 && settings.mode !== 'duel' ? 'balanced' : PERSONALITIES[Math.floor(rand(s) * PERSONALITIES.length)];
      const choice = human?.faction ?? settings.aiFactions?.[pid] ?? 'random';
      let faction: FactionId;
      if (choice === 'random' || !FACTIONS[choice]) {
        const pool = FACTION_IDS.filter(f => !used.has(f));
        faction = pool[Math.floor(rand(s) * pool.length)];
      } else faction = choice;
      used.add(faction);
      const random = !!human && (choice === 'random' || !FACTIONS[choice]);
      const p: PlayerState = {
        pid, team: t, slot,
        name: human ? human.name : t === 0 && settings.mode !== 'duel' ? 'Allié IA' : `${AI_NAMES[Math.floor(rand(s) * AI_NAMES.length)]} (IA)`,
        isAI: !human, personality: pers, faction, randomFaction: random,
        gold: ECONOMY.startGold + (random ? ECONOMY.randomFactionGold : 0), ether: ECONOMY.startEther, income: ECONOMY.startIncome, workers: ECONOMY.startWorkers,
        draft: FACTIONS[faction].units.slice(), rerolls: 0, builds: [], ready: false, powers: [], powerChoice: null,
        raiderQueue: [], raiderCd: {}, curseQueue: [], curseCd: {}, powerLv: [1, 1, 1], powerCd: [0, 0, 0], fogUntil: 0, jamUntil: 0,
        runes: [], hazards: [], undo: [], orders: 0, orderCd: 0, anomalyVote: null, riftReward: false, waveHelpKills: 0, helpWave: 0, souls: 0,
        leakedThisWave: 0, waveDmg: 0, pauseVote: false, stats: newStats(),
      };
      s.players.push(p);
    }
  }
  for (const p of s.players) p.runes = rollRunes(s, p.pid);
  s.events.push({ t: 'wave', n: 1, boss: false });
  journal(s, 'start', -1, s.players.map(p => p.faction).join(','), s.seed);
  return s;
}

export function workerCost(p: PlayerState) { return ECONOMY.workerBaseCost + ECONOMY.workerCostStep * (p.workers - ECONOMY.startWorkers); }

export function armyValue(p: PlayerState) { return p.builds.reduce((t, b) => t + b.value, 0); }

/** Gold price of a new unit (anomaly ARSENAL: +15 %). Pure: shared with the UI. */
export function unitPrice(id: string, anomaly: AnomalyId | null) {
  return Math.round(UNITS[id].cost * (anomaly === 'arsenal' ? 1.15 : 1));
}
/** Gold price of a level-up (doctrine Optimisation des Rouages: -10 %, anomaly ARSENAL: -20 %). Pure: shared with the UI. */
export function levelPrice(id: string, toLevel: number, faction: FactionId, anomaly: AnomalyId | null) {
  let c = upgradeCost(id, toLevel);
  if (faction === 'rouages') c *= 0.9;
  if (anomaly === 'arsenal') c *= 0.8;
  return Math.round(c / 5) * 5;
}
export function buildPrice(s: GameState, p: PlayerState, id: string) { return unitPrice(id, anomalyOf(s, p.team)); }
export function upgradePrice(s: GameState, p: PlayerState, id: string, toLevel: number) { return levelPrice(id, toLevel, p.faction, anomalyOf(s, p.team)); }

function cellFree(p: PlayerState, col: number, row: number, except = -1) {
  return !p.builds.some(b => b.col === col && b.row === row && b.bid !== except);
}
function inGrid(col: number, row: number) {
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;
}
const isBranch = (b: unknown): b is Branch => b === 'A' || b === 'B';

/** Sends already queued by p this wave for raider r. */
export function sameSends(p: { raiderQueue: { r: string }[] }, r: string) { return p.raiderQueue.filter(q => q.r === r).length; }

/** Is a secondary rift opening in p's lane this wave? */
export function riftThisWave(s: GameState, team: number) { return !!s.rift || anomalyOf(s, team) === 'contrat'; }

// ---------------------------------------------------------------- undo (preparation phase)

const UNDO_MAX = 30;
/** snapshot taken just before an undoable action (human players only) */
function undoBegin(s: GameState, p: PlayerState, kind: UndoStep['kind']): UndoStep | null {
  if (p.isAI) return null;
  return { wave: s.wave, kind, builds: p.builds.map(b => ({ ...b })), spent: p.gold, stats: { goldArmy: p.stats.goldArmy, unitsBuilt: p.stats.unitsBuilt, upgrades: p.stats.upgrades, fusions: p.stats.fusions } };
}
function undoCommit(p: PlayerState, u: UndoStep | null) {
  if (!u) return;
  u.spent -= p.gold; // gold before − gold after
  const st = (p.undo ??= []);
  st.push(u);
  if (st.length > UNDO_MAX) st.shift();
}

/** Validate & apply a player command. Returns an error message (French, user-facing) or null. */
export function applyCommand(s: GameState, pid: number, cmd: Command): string | null {
  const p = s.players[pid];
  if (!p) return 'Joueur inconnu.';
  if (!cmd || typeof cmd !== 'object') return 'Commande inconnue.';
  if ((s.phase === 'ended' || s.ending > 0) && cmd.c !== 'ping') return 'La partie est terminée.';
  const building = s.phase === 'build';
  switch (cmd.c) {
    case 'build': {
      if (!building) return 'Construction possible uniquement pendant la préparation.';
      if (!p.draft.includes(cmd.unit)) return 'Unité indisponible pour ton armée.';
      if (!inGrid(cmd.col, cmd.row) || !cellFree(p, cmd.col, cmd.row)) return 'Case occupée.';
      const u = UNITS[cmd.unit];
      const price = buildPrice(s, p, cmd.unit);
      if (p.gold < price) return 'Pas assez d\'or.';
      const undo = undoBegin(s, p, 'build');
      p.gold -= price;
      p.stats.goldArmy += price;
      const bid = s.nextId++;
      p.builds.push({ bid, defId: u.id, level: 1, branch: null, col: cmd.col, row: cmd.row, placedWave: s.wave, value: price, dmgTotal: 0, tanked: 0, healed: 0, ctrl: 0, fused: 0, rift: false });
      p.stats.unitsBuilt++;
      journal(s, 'buy', pid, u.id);
      s.events.push({ t: 'build', pid, bid });
      undoCommit(p, undo);
      return null;
    }
    case 'move': {
      if (!building) return 'Déplacement possible uniquement pendant la préparation.';
      const b = p.builds.find(x => x.bid === cmd.bid);
      if (!b) return 'Unité introuvable.';
      if (!inGrid(cmd.col, cmd.row) || !cellFree(p, cmd.col, cmd.row, b.bid)) return 'Case occupée.';
      if (b.col === cmd.col && b.row === cmd.row) return null;
      const undo = undoBegin(s, p, 'move');
      b.col = cmd.col; b.row = cmd.row;
      undoCommit(p, undo);
      return null;
    }
    case 'sell': {
      if (!building) return 'Vente possible uniquement pendant la préparation.';
      const i = p.builds.findIndex(x => x.bid === cmd.bid);
      if (i < 0) return 'Unité introuvable.';
      const b = p.builds[i];
      const refund = Math.floor(b.value * (b.placedWave === s.wave ? 1 : ECONOMY.sellRefund));
      const undo = undoBegin(s, p, 'sell');
      p.gold += refund;
      p.builds.splice(i, 1);
      journal(s, 'sell', pid, b.defId, refund);
      s.events.push({ t: 'sell', pid });
      undoCommit(p, undo);
      return null;
    }
    case 'upgrade': {
      if (!building) return 'Amélioration possible uniquement pendant la préparation.';
      const b = p.builds.find(x => x.bid === cmd.bid);
      if (!b) return 'Unité introuvable.';
      if (b.level >= MAX_LEVEL) return 'Niveau maximum atteint.';
      const next = b.level + 1;
      let branch = b.branch;
      if (next === BRANCH_LEVEL && UNITS[b.defId].branches) {
        if (!isBranch(cmd.branch)) return 'Choisis une spécialisation.';
        branch = cmd.branch;
      }
      const cost = upgradePrice(s, p, b.defId, next);
      if (p.gold < cost) return 'Pas assez d\'or.';
      const undo = undoBegin(s, p, 'upgrade');
      p.gold -= cost;
      p.stats.goldArmy += cost;
      b.level = next; b.branch = branch;
      b.value += cost;
      p.stats.upgrades++;
      journal(s, 'up', pid, b.defId, b.level);
      s.events.push({ t: 'evolve', pid, bid: b.bid, level: b.level, branch: b.branch });
      undoCommit(p, undo);
      return null;
    }
    case 'fuse': {
      if (!building) return 'Fusion possible uniquement pendant la préparation.';
      const a = p.builds.find(x => x.bid === cmd.bid);
      const o = p.builds.find(x => x.bid === cmd.with);
      if (!a || !o || a === o) return 'Unité introuvable.';
      if (a.defId !== o.defId || a.level !== o.level || a.branch !== o.branch) return 'Il faut deux unités identiques du même niveau.';
      if (a.level >= MAX_LEVEL) return 'Niveau maximum atteint.';
      const next = a.level + 1;
      let branch = a.branch;
      if (next === BRANCH_LEVEL && UNITS[a.defId].branches) {
        if (!isBranch(cmd.branch)) return 'Choisis une spécialisation.';
        branch = cmd.branch;
      }
      // the extra value of the second copy is refunded (fusion never wastes gold)
      const newValue = unitValueAt(a.defId, next);
      const refund = Math.max(0, a.value + o.value - newValue);
      const undo = undoBegin(s, p, 'fuse');
      p.gold += refund;
      p.builds.splice(p.builds.indexOf(o), 1);
      a.level = next; a.branch = branch;
      a.value = Math.min(a.value + o.value, newValue);
      a.placedWave = Math.min(a.placedWave, o.placedWave);
      a.dmgTotal += o.dmgTotal; a.tanked += o.tanked; a.healed += o.healed; a.ctrl += o.ctrl;
      a.fused += 1 + o.fused; // "Éclat de fusion": +10 % HP and damage per fusion (max 3)
      a.rift = a.rift || o.rift;
      p.stats.fusions++;
      journal(s, 'fuse', pid, a.defId, a.level);
      s.events.push({ t: 'fuse', pid, bid: a.bid, col: o.col, row: o.row });
      s.events.push({ t: 'evolve', pid, bid: a.bid, level: a.level, branch: a.branch });
      if (refund > 0) s.events.push({ t: 'income', pid, gold: refund });
      undoCommit(p, undo);
      return null;
    }
    case 'undo': {
      if (!building) return 'Annulation possible uniquement pendant la préparation.';
      const st = p.undo ?? [];
      while (st.length && st[st.length - 1].wave !== s.wave) st.pop();
      const u = st[st.length - 1];
      if (!u) return 'Rien à annuler.';
      if (u.spent < 0 && p.gold < -u.spent) return `Il faut ${Math.ceil(-u.spent)} or pour annuler.`;
      st.pop();
      p.gold += u.spent;
      const rift = new Map(p.builds.map(b => [b.bid, b.rift]));
      p.builds = u.builds.map(b => ({ ...b, rift: rift.get(b.bid) ?? b.rift }));
      Object.assign(p.stats, u.stats);
      s.events.push({ t: 'undo', pid, kind: u.kind, gold: u.spent });
      return null;
    }
    case 'worker': {
      if (p.workers >= ECONOMY.maxWorkers) return 'Nombre maximum de travailleurs atteint.';
      const cost = workerCost(p);
      if (p.gold < cost) return 'Pas assez d\'or.';
      p.gold -= cost;
      p.workers++;
      p.stats.maxWorkers = Math.max(p.stats.maxWorkers, p.workers);
      s.events.push({ t: 'worker', pid });
      return null;
    }
    case 'raider': {
      const opp = opponents(s, pid);
      if (!opp.length) return 'Pas d\'adversaire dans ce mode.';
      const to = cmd.to ?? raiderTarget(s, pid)!.pid;
      if (!opp.some(o => o.pid === to)) return 'Cible invalide.';
      const r = RAIDERS.find(x => x.id === cmd.raider);
      if (!r) return 'Envoi inconnu.';
      const unlock = raiderUnlock(r, s.settings.totalWaves);
      if (s.wave < unlock) return `Disponible à la vague ${unlock}.`;
      if ((p.raiderCd[r.id] ?? 0) > s.wave) return `En recharge : disponible à la vague ${p.raiderCd[r.id]}.`;
      const same = sameSends(p, r.id);
      if (same >= r.maxPerWave) return `Maximum ${r.maxPerWave} × ${r.name} par vague.`;
      if (p.raiderQueue.length >= sendCap(s.wave)) return `Limite d'envois atteinte pour cette vague (${sendCap(s.wave)}).`;
      const price = raiderPrice(r, same);
      if (p.ether < price.ether) return 'Pas assez d\'Éther.';
      if (p.gold < price.gold) return 'Pas assez d\'or.';
      p.ether -= price.ether; p.gold -= price.gold;
      p.stats.raiderEther += price.ether; p.stats.raiderGold += price.gold;
      p.income += r.income;
      p.raiderQueue.push({ r: r.id, to });
      if (r.cooldown) p.raiderCd[r.id] = s.wave + r.cooldown;
      p.stats.raidersSent++;
      p.stats.sentUnits += r.units.reduce((t, u) => t + u.count, 0);
      if (r.category === 'champion' || r.category === 'puissant') journal(s, 'bigsend', pid, r.id, to);
      s.events.push({ t: 'raider', pid, raider: r.id, to });
      return null;
    }
    case 'curse': {
      const opp = opponents(s, pid);
      if (!opp.length) return 'Pas d\'adversaire dans ce mode.';
      const to = cmd.to ?? raiderTarget(s, pid)!.pid;
      if (!opp.some(o => o.pid === to)) return 'Cible invalide.';
      const c = CURSES.find(x => x.id === cmd.curse);
      if (!c) return 'Malédiction inconnue.';
      const unlock = curseUnlock(c, s.settings.totalWaves);
      if (s.wave < unlock) return `Disponible à la vague ${unlock}.`;
      if ((p.curseCd[c.id] ?? 0) > s.wave) return `En recharge : disponible à la vague ${p.curseCd[c.id]}.`;
      if (p.curseQueue.length >= 1) return 'Une seule malédiction par vague.';
      const incoming = s.players.reduce((t, o) => t + o.curseQueue.filter(q => q.to === to).length, 0);
      if (incoming >= 2) return 'Cette voie subit déjà deux malédictions.';
      if (p.ether < c.ether) return 'Pas assez d\'Éther.';
      if (p.gold < c.gold) return 'Pas assez d\'or.';
      p.ether -= c.ether; p.gold -= c.gold;
      p.curseQueue.push({ r: c.id, to });
      p.curseCd[c.id] = s.wave + c.cooldown;
      p.stats.curses++;
      journal(s, 'curse', pid, c.id, to);
      s.events.push({ t: 'curse', pid, curse: c.id, to });
      return null;
    }
    case 'cast': {
      if (s.phase !== 'combat') return 'Les pouvoirs s\'utilisent pendant le combat.';
      const slot = cmd.slot;
      const def = FACTION_POWERS[p.faction]?.[slot];
      if (!def) return 'Pouvoir inconnu.';
      const unlock = powerUnlock(def, s.settings.totalWaves);
      if (s.wave < unlock) return `Débloqué à la vague ${unlock}.`;
      if (p.powerCd[slot] > 0) return `Pas encore prêt (${Math.ceil(p.powerCd[slot])} s).`;
      if (s.combatTime < p.jamUntil) return 'Pouvoirs brouillés par l\'adversaire !';
      castPower(s, p, slot);
      p.powerCd[slot] = def.cooldown * POWER_LEVEL_CD[p.powerLv[slot]] * (anomalyOf(s, p.team) === 'tempete' ? 0.65 : 1);
      p.stats.casts++;
      return null;
    }
    case 'powerUp': {
      const slot = cmd.slot;
      const def = FACTION_POWERS[p.faction]?.[slot];
      if (!def) return 'Pouvoir inconnu.';
      const lv = p.powerLv[slot];
      if (lv >= POWER_MAX_LEVEL) return 'Pouvoir déjà au maximum.';
      const unlock = powerUnlock(def, s.settings.totalWaves);
      if (s.wave < unlock) return `Débloqué à la vague ${unlock}.`;
      const cost = POWER_UP_COST[lv + 1];
      if (p.ether < cost) return 'Pas assez d\'Éther.';
      p.ether -= cost;
      p.powerLv[slot]++;
      s.events.push({ t: 'powerUp', pid, slot });
      return null;
    }
    case 'invest': {
      if (p.ether < ECONOMY.investChunk) return 'Pas assez d\'Éther.';
      p.ether -= ECONOMY.investChunk;
      p.income += Math.round(ECONOMY.investChunk * ECONOMY.investRatio);
      s.events.push({ t: 'income', pid, gold: 0 });
      return null;
    }
    case 'module': return proposeModule(s, p, cmd);
    case 'moduleVote': {
      const t = s.teams[p.team];
      const pr = t.proposal;
      if (!pr) return 'Aucune proposition en attente.';
      if (pr.by === pid) {
        if (cmd.accept) return 'C\'est à ton partenaire de valider.';
        resolveProposal(s, t, false, pid, 'cancel');
        return null;
      }
      resolveProposal(s, t, !!cmd.accept, pid, cmd.accept ? 'accept' : 'refuse');
      return null;
    }
    case 'reso': {
      if (s.phase !== 'combat') return 'La Résonance se déclenche pendant le combat.';
      const t = s.teams[p.team];
      if (t.resoCast) {
        if (t.resoCast.by === pid) return 'Résonance en cours : ton partenaire peut la synchroniser !';
        if (t.resoCast.sync) return 'Résonance déjà synchronisée !';
        t.resoCast.sync = true; t.resoCast.syncBy = pid;
        s.events.push({ t: 'reso', team: p.team, k: 'sync', pid, ability: teamAbility(s, p.team).id, sync: true });
        return null;
      }
      if (t.reso < RESO_MAX) return `Résonance : ${Math.floor(t.reso)} / ${RESO_MAX}.`;
      t.reso = 0; t.resoFullSeen = false;
      t.resoCast = { by: pid, fireAt: s.combatTime + RESO_CHANNEL, sync: false, syncBy: -1 };
      s.events.push({ t: 'reso', team: p.team, k: 'start', pid, ability: teamAbility(s, p.team).id, sync: false });
      return null;
    }
    case 'order': {
      if (s.phase !== 'combat') return 'Les ordres se donnent pendant le combat.';
      if (!ORDERS[cmd.order]) return 'Ordre inconnu.';
      if (p.orders <= 0) return 'Plus de charge d\'ordre pour cette vague.';
      if (s.combatTime < p.orderCd) return `Ordre suivant dans ${Math.ceil(p.orderCd - s.combatTime)} s.`;
      const fin = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : undefined);
      p.orders--;
      p.orderCd = s.combatTime + ORDER_COOLDOWN;
      p.stats.orders++;
      applyOrder(s, p, cmd.order, fin(cmd.x, 40), fin(cmd.z, 8));
      return null;
    }
    case 'anomaly': {
      const t = s.teams[p.team];
      if (!building) return 'Les anomalies se choisissent pendant la préparation.';
      if (!t.anomalyOffer) return 'Aucune anomalie à choisir.';
      if (!t.anomalyOffer.includes(cmd.id)) return 'Anomalie indisponible.';
      p.anomalyVote = cmd.id;
      s.events.push({ t: 'anomaly', team: p.team, k: 'vote', id: cmd.id, pid });
      tryResolveAnomaly(s, p.team, false);
      return null;
    }
    case 'rift': {
      if (!building) return 'Affectation possible uniquement pendant la préparation.';
      if (!riftThisWave(s, p.team)) return 'Pas de Faille secondaire à cette vague.';
      const b = p.builds.find(x => x.bid === cmd.bid);
      if (!b) return 'Unité introuvable.';
      if (cmd.on) {
        if (UNITS[b.defId].tower) return 'Les unités en tour ne quittent pas leur poste.';
        if (!b.rift && p.builds.filter(x => x.rift).length >= RIFT_MAX_UNITS) return `${RIFT_MAX_UNITS} unités maximum sur la Faille.`;
      }
      b.rift = !!cmd.on;
      return null;
    }
    case 'reroll':
      return 'Ton armée est fixée par ta faction : pas de relance.';
    case 'ready': {
      if (!building) return null;
      p.ready = cmd.value;
      return null;
    }
    case 'power': {
      if (!p.powerChoice || !p.powerChoice.includes(cmd.power)) return 'Pouvoir indisponible.';
      p.powers.push(cmd.power);
      p.powerChoice = null;
      if (cmd.power === 'bouclier_core') {
        const c = s.teams[p.team].core;
        c.maxHp = Math.round(c.maxHp * 1.3);
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.3);
      }
      if (cmd.power === 'investissement') p.income = Math.round(p.income * 1.25);
      return null;
    }
    case 'ping':
      s.events.push({ t: 'ping', pid, ping: cmd.ping });
      return null;
    case 'speed': {
      if (pid !== 0) return 'Seul l\'hôte peut changer la vitesse.';
      if (![1, 2, 3].includes(cmd.speed)) return 'Vitesse invalide.';
      s.speed = cmd.speed;
      return null;
    }
    case 'pause': {
      p.pauseVote = cmd.value;
      const humans = humanPlayers(s);
      if (!cmd.value) { s.paused = false; humans.forEach(h => (h.pauseVote = false)); }
      else if (humans.every(h => h.pauseVote)) s.paused = true;
      else s.events.push({ t: 'msg', pid, text: `${p.name} demande une pause.` });
      return null;
    }
    case 'debug':
      return debugCommand(s, p, cmd.action);
  }
  return 'Commande inconnue.';
}

// ---------------------------------------------------------------- Bastion modules (joint decisions)

function proposeModule(s: GameState, p: PlayerState, cmd: Extract<Command, { c: 'module' }>): string | null {
  const t = s.teams[p.team];
  if (t.proposal) return 'Une proposition attend déjà la validation de ton partenaire.';
  const def = MODULES[cmd.module];
  if (!def) return 'Module inconnu.';
  const idx = t.modules.findIndex(m => m?.id === cmd.module);
  let slot: number, cost = 0;
  if (cmd.action === 'install') {
    if (idx >= 0) return 'Module déjà installé.';
    slot = cmd.slot ?? t.modules.findIndex(m => !m);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MODULE_SLOTS) return 'Aucun emplacement libre : démonte d\'abord un module.';
    if (t.modules[slot]) return 'Emplacement occupé : démonte d\'abord ce module.';
    cost = moduleCost(def.id, 1);
  } else if (cmd.action === 'upgrade') {
    if (idx < 0) return 'Ce module n\'est pas installé.';
    const lv = t.modules[idx]!.lv + 1;
    if (lv > 3) return 'Module déjà au niveau maximum.';
    slot = idx; cost = moduleCost(def.id, lv);
  } else if (cmd.action === 'remove') {
    if (idx < 0) return 'Ce module n\'est pas installé.';
    slot = idx;
  } else return 'Action inconnue.';
  if (p.ether < cost) return 'Pas assez d\'Éther.';
  p.ether -= cost; // escrow: refunded if the partner refuses
  t.proposal = { by: p.pid, action: cmd.action, module: def.id, slot, cost, at: s.time };
  const lv = cmd.action === 'install' ? 1 : cmd.action === 'upgrade' ? t.modules[slot]!.lv + 1 : 0;
  s.events.push({ t: 'module', team: p.team, pid: p.pid, k: 'propose', module: def.id, action: cmd.action, lv });
  // an AI partner (or no human partner) answers at once
  const partner = partnerOf(s, p.pid);
  if (!partner || partner.isAI) resolveProposal(s, t, true, partner?.pid ?? p.pid, 'auto');
  return null;
}

/** Accept / refuse a module proposal. The validator co-finances half of the price when they can. */
export function resolveProposal(s: GameState, t: TeamState, accept: boolean, by: number, k: 'accept' | 'refuse' | 'auto' | 'cancel') {
  const pr = t.proposal;
  if (!pr) return;
  t.proposal = null;
  const proposer = s.players[pr.by];
  const lvNow = t.modules[pr.slot]?.lv ?? 0;
  if (!accept) {
    proposer.ether += pr.cost;
    s.events.push({ t: 'module', team: t.id, pid: by, k, module: pr.module, action: pr.action, lv: lvNow });
    return;
  }
  const validator = s.players[by];
  if (pr.cost > 0 && validator && validator.pid !== pr.by) {
    const half = Math.floor(pr.cost / 2);
    if (validator.ether >= half) { validator.ether -= half; proposer.ether += half; validator.stats.etherModules += half; proposer.stats.etherModules += pr.cost - half; }
    else proposer.stats.etherModules += pr.cost;
  } else proposer.stats.etherModules += pr.cost;
  let lv = 0;
  if (pr.action === 'install') { t.modules[pr.slot] = { id: pr.module, lv: 1 }; lv = 1; }
  else if (pr.action === 'upgrade' && t.modules[pr.slot]) { t.modules[pr.slot]!.lv++; lv = t.modules[pr.slot]!.lv; }
  else if (pr.action === 'remove' && t.modules[pr.slot]) {
    const m = t.modules[pr.slot]!;
    proposer.ether += Math.floor(moduleValue(m.id, m.lv) * MODULE_REFUND);
    t.modules[pr.slot] = null;
  }
  journal(s, 'mod', pr.by, pr.module, pr.action === 'remove' ? -1 : lv);
  s.events.push({ t: 'module', team: t.id, pid: by, k, module: pr.module, action: pr.action, lv });
}

// ---------------------------------------------------------------- anomalies

function tryResolveAnomaly(s: GameState, team: number, force: boolean) {
  const t = s.teams[team];
  if (!t.anomalyOffer) return;
  const members = s.players.filter(p => p.team === team);
  const humans = members.filter(p => !p.isAI);
  const voters = humans.length ? humans : members;
  const votes = voters.map(p => p.anomalyVote).filter((v): v is AnomalyId => !!v);
  if (!force && votes.length < voters.length) return;
  let pick: AnomalyId;
  if (votes.length && votes.every(v => v === votes[0])) pick = votes[0];
  else if (votes.length) pick = votes[Math.floor(worldRand(s.seed, s.wave, 30 + team) * votes.length)]; // disagreement: fate decides
  else pick = t.anomalyOffer[Math.floor(worldRand(s.seed, s.wave, 40 + team) * t.anomalyOffer.length)];
  applyAnomaly(s, team, pick);
}

function applyAnomaly(s: GameState, team: number, id: AnomalyId) {
  const t = s.teams[team];
  t.anomaly = { id, until: s.wave + ANOMALY_WAVES - 1 };
  t.anomalyOffer = null;
  const members = s.players.filter(p => p.team === team);
  for (const p of members) p.anomalyVote = null;
  switch (id) {
    case 'fortune':
      for (const p of members) { const g = fortuneGold(s.wave); p.gold += g; p.stats.goldEarned += g; }
      t.bossBoost = 1.35;
      break;
    case 'sacrifice':
      t.core.maxHp = Math.round(t.core.maxHp * 0.88);
      t.core.hp = Math.min(t.core.hp, t.core.maxHp);
      break;
    case 'rune_instable':
      for (const p of members) {
        const cells: { col: number; row: number }[] = [];
        for (let c = 1; c < GRID.cols - 1; c++) for (let r = 0; r < GRID.rows; r++) if (!p.runes.some(x => x.col === c && x.row === r)) cells.push({ col: c, row: r });
        const picked = worldPick(s.seed, cells, 3, s.wave, 50 + p.pid);
        if (picked[0]) p.runes.push({ ...picked[0], kind: 'instable', until: t.anomaly.until });
        p.hazards = picked.slice(1);
      }
      break;
  }
  journal(s, 'anom', team, id);
  s.events.push({ t: 'anomaly', team, k: 'pick', id, pid: -1 });
}

function debugCommand(s: GameState, p: PlayerState, action: string): string | null {
  switch (action) {
    case 'gold': p.gold += 500; break;
    case 'ether': p.ether += 100; break;
    case 'kill': for (const e of s.ents) if (e.enemy) { e.dead = true; e.hp = 0; } break;
    case 'core': for (const t of s.teams) t.core.hp = t.core.maxHp; break;
    case 'skip': if (s.phase === 'build') s.timer = 0; break;
    case 'wave': if (s.phase === 'build') { s.wave = Math.min(s.wave + 1, s.settings.totalWaves); s.timer = 0; } break;
    case 'cd': p.powerCd = [0, 0, 0]; break;
    case 'reso': s.teams[p.team].reso = RESO_MAX; break;
    case 'event': s.waveEvent = WAVE_EVENTS[(WAVE_EVENTS.findIndex(e => e.id === s.waveEvent) + 1) % WAVE_EVENTS.length].id; break;
    case 'rift': s.rift = { reward: 'gold', hpMul: 1, spawnMul: 1, rewardMul: 1 }; break;
    case 'anomaly': for (const t of s.teams) t.anomalyOffer = worldPick(s.seed, ANOMALY_IDS, 3, s.wave, 4, s.tick); break;
    default: return 'Action debug inconnue.';
  }
  return null;
}

// ---------------------------------------------------------------- phases

function waveList(s: GameState): SpawnSpec[] {
  const w = getWave(s.wave);
  const list: SpawnSpec[] = [];
  for (const g of w.groups) for (let i = 0; i < g.count; i++) list.push({ enemy: g.enemy, hpMul: w.hpMul, dmgMul: w.dmgMul });
  const ev = s.waveEvent;
  if (ev === 'invasion') {
    const extra = 6 + Math.floor(s.wave * 0.6);
    for (let i = 0; i < extra; i++) list.push({ enemy: i % 2 ? 'essaim' : 'rampelin', hpMul: w.hpMul * 0.9, dmgMul: w.dmgMul });
  }
  if (ev === 'elite') {
    let n = 0;
    for (const x of list) if (n < 2) { x.elite = true; n++; }
  }
  if (ev === 'rush') for (const x of list) x.speedMul = 1.25;
  return list;
}

function withHex(x: SpawnSpec, h: string[]): SpawnSpec {
  if (!h.length) return x;
  const o = { ...x };
  if (h.includes('vitalite')) o.hpMul *= 1.2;
  if (h.includes('carapace')) o.shieldPct = 0.15;
  if (h.includes('hate')) o.speedMul = (o.speedMul ?? 1) * 1.2;
  return o;
}

/** Core HP of each team at the start of the combat (journal: damage taken per wave). Not part of the saved state. */
const waveStart = new WeakMap<GameState, { hp: number[] }>();

function startCombat(s: GameState) {
  s.phase = 'combat';
  for (const p of s.players) p.undo = []; // placements are locked in once the wave starts
  s.combatTime = 0;
  s.ents = [];
  s.fallen = [];
  // pending choices are settled now
  for (const p of s.players) if (p.powerChoice) applyCommand(s, p.pid, { c: 'power', power: p.powerChoice[0] });
  for (const t of s.teams) if (t.anomalyOffer) tryResolveAnomaly(s, t.id, true);
  for (const t of s.teams) {
    const c = t.core;
    c.shield = MOD.egide[moduleLv(t, 'egide')] * (1 + 0.06 * (s.wave - 1));
    c.portal = MOD.portail[moduleLv(t, 'portail')];
    c.repaired = 0; c.powCd = 3; c.beamCd = 2; c.chainCd = 4;
  }
  waveStart.set(s, { hp: s.teams.map(t => t.core.hp) });
  spawnUnits(s);
  // curses received this wave
  const hexes = new Map<number, string[]>();
  for (const p of s.players) for (const q of p.curseQueue) { const l = hexes.get(q.to) ?? []; l.push(q.r); hexes.set(q.to, l); }
  for (const p of s.players) {
    p.leakedThisWave = 0;
    p.waveDmg = 0;
    p.waveHelpKills = 0;
    p.souls = 0;
    p.riftReward = false;
    p.orders = ORDER_CHARGES + (anomalyOf(s, p.team) === 'veille' ? 1 : 0);
    p.orderCd = 0;
    const h = hexes.get(p.pid) ?? [];
    p.fogUntil = h.includes('brouillard') ? 10 : 0;
    p.jamUntil = h.includes('brouillage') ? 10 : 0;
    spawnEnemies(s, p.team, p.slot, p.pid, waveList(s).map(x => withHex(x, h)));
    if (riftThisWave(s, p.team)) spawnRift(s, p);
  }
  // sends: each sender's queue spawns behind the target lane's wave
  const sc = raiderScale(s.wave);
  const offsets = new Map<number, number>();
  for (const p of s.players) {
    const byTarget = new Map<number, string[]>();
    for (const q of p.raiderQueue) { const l = byTarget.get(q.to) ?? []; l.push(q.r); byTarget.set(q.to, l); }
    for (const [to, ids] of byTarget) {
      const tgt = s.players[to];
      if (!tgt) continue;
      const h = hexes.get(to) ?? [];
      const list: SpawnSpec[] = [];
      for (const id of ids) {
        const r = RAIDERS.find(x => x.id === id)!;
        for (const u of r.units) for (let i = 0; i < u.count; i++) list.push(withHex({ enemy: u.enemy, hpMul: r.hpMul * sc, dmgMul: sc, raider: true, elite: r.category === 'champion', src: p.pid }, h));
      }
      const off = offsets.get(to) ?? 1.5; // sends march WITH the wave (v0.3: 7 m behind it, they arrived after the fight)
      spawnEnemies(s, tgt.team, tgt.slot, tgt.pid, list, off);
      offsets.set(to, off + Math.ceil(list.length / 4) * 1.3 + 0.6);
      s.events.push({ t: 'sends', from: p.pid, to, list: ids });
    }
    p.raiderQueue = [];
  }
  for (const [to, list] of hexes) s.events.push({ t: 'hexed', to, list });
  for (const p of s.players) p.curseQueue = [];
  for (const e of s.ents) if (e.enemy && e.boss) { s.events.push({ t: 'bossIn', arena: e.arena, id: e.defId, eid: e.id }); s.teams[e.arena].bossBoost = 1; }
  s.events.push({ t: 'combat' });
}

function endCombat(s: GameState) {
  // timeout: survivors hit the Core with their leak damage
  for (const e of s.ents) {
    if (e.enemy && !e.dead && !e.rift) {
      hitCore(s, e);
      if (!e.leaked) {
        const o = s.players[e.owner];
        o.stats.leaks++; o.leakedThisWave++;
        if (!o.stats.firstLeakWave) { o.stats.firstLeakWave = s.wave; journal(s, 'leak1', o.pid); }
      }
    }
    if (e.rift && !e.dead) s.events.push({ t: 'rift', pid: e.owner, k: 'faded', reward: s.rift?.reward ?? 'gold', arena: e.arena, x: e.x, z: e.z });
  }
  s.ents = [];
  for (const p of s.players) {
    const dps = p.waveDmg / Math.max(1, s.combatTime);
    p.stats.maxDps = Math.max(p.stats.maxDps, Math.round(dps));
    for (const b of p.builds) { if (b.dmgTotal > p.stats.bestUnitDmg) { p.stats.bestUnitDmg = b.dmgTotal; p.stats.bestUnit = b.defId; } b.rift = false; }
    if (p.riftReward) { p.powerCd = [0, 0, 0]; p.riftReward = false; }
    if (p.waveHelpKills >= 6) journal(s, 'save', p.pid, p.waveHelpKills);
  }
  const start = waveStart.get(s);
  const boss = !!getWave(s.wave).boss;
  for (const t of s.teams) {
    const members = s.players.filter(p => p.team === t.id);
    // Résonance: both lanes held without a single leak
    if (members.every(p => p.leakedThisWave === 0)) for (const p of members) addReso(s, t.id, RESO_GAIN.cleanWave / members.length, p.pid);
    // a channel interrupted by the end of the wave gives the gauge back
    if (t.resoCast) {
      t.resoCast = null; t.reso = RESO_MAX;
      s.events.push({ t: 'reso', team: t.id, k: 'refund', pid: -1, ability: teamAbility(s, t.id).id, sync: false });
    }
    const lost = start ? Math.round(start.hp[t.id] - t.core.hp) : 0;
    if (lost > 0) journal(s, 'core', t.id, lost, boss ? 1 : 0);
    else if (boss) journal(s, 'bossdown', t.id);
  }
  s.phase = 'resolution';
  s.timer = TIMING.resolution;
  if (deadTeam(s) >= 0) beginEnding(s);
}

function deadTeam(s: GameState) {
  for (const t of s.teams) if (t.core.hp <= 0) return t.id;
  return -1;
}

/** A Core fell: keep simulating a few slow-motion seconds (destruction sequence) before the result. */
function beginEnding(s: GameState) {
  if (s.ending > 0 || s.result) return;
  for (const t of s.teams) if (t.core.hp <= 0) { t.core.hp = 0; t.alive = false; }
  s.ending = ENDING_TIME;
}

function concludeEnding(s: GameState) {
  const dead = s.teams.filter(t => !t.alive).map(t => t.id);
  if (s.settings.mode === 'survival') { finish(s, -1, `Le Core est tombé à la vague ${s.wave}.`); return; }
  if (dead.length !== 1) {
    const a = s.teams[0].core.hp / s.teams[0].core.maxHp, b = s.teams[1].core.hp / s.teams[1].core.maxHp;
    finish(s, a >= b ? 0 : 1, 'Les deux Cores ont cédé : le plus solide l\'emporte.');
    return;
  }
  const winner = dead[0] === 0 ? 1 : 0;
  finish(s, winner, winner === 0 ? 'Le Core adverse est détruit !' : 'Votre Core a été détruit.');
}

function finish(s: GameState, winner: number, reason: string) {
  s.result = { outcome: winner === 0 ? 'victory' : 'defeat', winner, wave: s.wave, reason };
  s.phase = 'ended';
  s.ending = 0;
  s.ents = [];
  journal(s, 'end', winner, reason);
  s.events.push({ t: 'end', result: winner === 0 ? 'victory' : 'defeat' });
}

/** Random wave event (world roll: same seed ⇒ same events). */
function pickEvent(s: GameState): string | null {
  const w = getWave(s.wave);
  if (s.wave < 3 || w.boss || s.settings.tutorial) return null;
  if (worldRand(s.seed, s.wave, 1) > 0.35) return null;
  const pool = WAVE_EVENTS.filter(e => e.id !== s.lastEvent);
  return pool[Math.floor(worldRand(s.seed, s.wave, 2) * pool.length)].id;
}

/** Secondary rift of the wave (world roll). Not on boss waves, nor in the tutorial. */
function rollRift(s: GameState) {
  const w = getWave(s.wave);
  const first = s.settings.totalWaves <= 10 ? 3 : 4;
  if (s.wave < first || w.boss || s.settings.tutorial) return null;
  if (worldRand(s.seed, s.wave, 3) > RIFT_CHANCE) return null;
  return { reward: RIFT_REWARD_IDS[Math.floor(worldRand(s.seed, s.wave, 5) * RIFT_REWARD_IDS.length)], hpMul: 1, spawnMul: 1, rewardMul: 1 };
}

function startBuild(s: GameState) {
  // final wave: the healthier Core wins
  if (s.settings.mode !== 'survival' && s.wave >= s.settings.totalWaves) {
    const a = s.teams[0].core.hp / s.teams[0].core.maxHp;
    const b = s.teams[1].core.hp / s.teams[1].core.maxHp;
    finish(s, a >= b ? 0 : 1, s.settings.mode === 'duel' ? 'Fin des vagues : le Core le plus solide l\'emporte.' : a >= b ? 'Vous avez tenu jusqu\'au bout avec un Core plus solide !' : 'Le Core adverse a mieux résisté.');
    return;
  }
  // payouts
  for (const p of s.players) {
    let g = p.income + MOD.tresor[moduleLv(s.teams[p.team], 'tresor')];
    if (p.leakedThisWave === 0) g += ECONOMY.waveClearBonus;
    p.gold += g;
    p.stats.goldEarned += g;
    s.events.push({ t: 'income', pid: p.pid, gold: g });
    p.ready = false;
  }
  for (const t of s.teams) {
    const resto = moduleLv(t, 'restauration');
    let heal = CORE.regenPerWave + MOD.restauration[resto];
    if (resto >= 3 && s.players.filter(p => p.team === t.id).every(p => p.leakedThisWave === 0)) heal += t.core.maxHp * 0.05;
    t.core.hp = Math.min(t.core.maxHp, t.core.hp + heal);
  }
  s.wave++;
  s.phase = 'build';
  const w = getWave(s.wave);
  s.timer = s.timerMax = buildTime(s.wave, !!w.boss);
  s.lastEvent = s.waveEvent;
  s.waveEvent = pickEvent(s);
  s.rift = rollRift(s);
  // temporary runes and hazards expire with their anomaly
  for (const p of s.players) {
    p.runes = p.runes.filter(r => !r.until || r.until >= s.wave);
    if (anomalyOf(s, p.team) !== 'rune_instable') p.hazards = [];
  }
  // anomaly choice before key waves (same offer for every team: fair)
  if (anomalyWaves(s.settings.mode, s.settings.totalWaves).includes(s.wave) && !s.settings.tutorial) {
    const offer = worldPick(s.seed, ANOMALY_IDS, 3, s.wave, 4);
    for (const t of s.teams) { t.anomalyOffer = offer.slice(); s.events.push({ t: 'anomaly', team: t.id, k: 'offer', id: offer.join(','), pid: -1 }); }
  }
  s.events.push({ t: 'wave', n: s.wave, boss: !!w.boss });
  if (s.wave === POWER_WAVE(s)) {
    for (const p of s.players) p.powerChoice = shuffle(s, POWERS.map(x => x.id)).slice(0, 3);
  }
}

/** Advance the simulation by one fixed tick. */
export function step(s: GameState) {
  if (s.phase === 'ended' || s.paused) return;
  s.tick++;
  s.time += DT;
  // ether from workers (+ Forge d'Éther, Tempête d'Éther) — all phases
  for (const p of s.players) {
    const t = s.teams[p.team];
    const e = (p.workers * ECONOMY.etherPerWorkerPerSec * (p.powers.includes('ouvriers') ? 1.5 : 1) + MOD.forge[moduleLv(t, 'forge')]) * (anomalyOf(s, p.team) === 'tempete' ? 1.3 : 1) * DT;
    p.ether += e;
    p.stats.etherProduced += e;
  }
  // module proposals without an answer are accepted ("accord tacite")
  for (const t of s.teams) if (t.proposal && s.time - t.proposal.at >= PROPOSAL_TIMEOUT) {
    const partner = partnerOf(s, t.proposal.by);
    resolveProposal(s, t, true, partner?.pid ?? t.proposal.by, 'auto');
  }
  if (s.ending > 0) {
    s.ending -= DT;
    if (s.phase === 'combat') { s.combatTime += DT; combatTick(s); }
    if (s.ending <= 0) concludeEnding(s);
    return;
  }
  switch (s.phase) {
    case 'build': {
      const humans = s.players.filter(p => !p.isAI);
      // "Lancer la vague maintenant": once every human is ready, the AIs decide immediately.
      const humansReady = humans.length > 0 && humans.every(p => p.ready);
      if (s.tick % 10 === 0 || humansReady) runAI(s, humansReady);
      s.timer -= DT;
      if (s.timer <= 0 || s.players.every(p => p.ready)) startCombat(s);
      break;
    }
    case 'combat': {
      s.combatTime += DT;
      for (const p of s.players) for (let i = 0; i < 3; i++) if (p.powerCd[i] > 0) p.powerCd[i] = Math.max(0, p.powerCd[i] - DT);
      if (s.tick % 10 === 5) aiCombat(s);
      for (const t of s.teams) if (t.resoCast && s.combatTime >= t.resoCast.fireAt) fireResonance(s, t.id);
      combatTick(s);
      if (deadTeam(s) >= 0) { beginEnding(s); return; }
      if (!enemiesAlive(s) || s.combatTime >= TIMING.maxCombat) endCombat(s);
      break;
    }
    case 'resolution': {
      s.timer -= DT;
      if (s.timer <= 0) startBuild(s);
      break;
    }
  }
}

export function drainEvents(s: GameState) {
  const e = s.events;
  s.events = [];
  return e;
}

/** Compact hash of the deterministic part of the state (reproducibility tests, desync checks). */
export function stateHash(s: GameState): number {
  const parts = [s.wave, s.tick, Math.round(s.time * 100), s.phase, s.rng, s.nextId,
    ...s.teams.flatMap(t => [Math.round(t.core.hp), Math.round(t.reso * 10), t.modules.map(m => (m ? m.id + m.lv : '-')).join('')]),
    ...s.players.flatMap(p => [Math.round(p.gold), Math.round(p.ether * 10), p.builds.map(b => `${b.defId}${b.level}${b.col}${b.row}`).join('')]),
    ...s.ents.map(e => `${e.defId}${Math.round(e.x * 10)}${Math.round(e.z * 10)}${Math.round(e.hp)}`)];
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export { unitValueAt, ANOMALIES, MODULES };
