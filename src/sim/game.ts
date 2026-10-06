// Game orchestrator: WaveSystem, EconomySystem, ArmySystem (build / level-up / fusion), RaiderSystem (sends + curses),
// commander powers, random wave events, end-of-game sequence and command validation.
// Pure logic, no DOM. The host owns one instance; guests only receive snapshots.
import { UNITS, FACTIONS, FACTION_IDS, MAX_LEVEL, BRANCH_LEVEL, upgradeCost, unitValueAt } from '../data/units';
import {
  CORE, ECONOMY, GRID, POWERS, RAIDERS, CURSES, TIMING, buildTime, raiderScale, raiderUnlock, raiderPrice, sendCap, curseUnlock, CoreUpgradeId,
} from '../data/economy';
import { FACTION_POWERS, POWER_LEVEL_CD, POWER_MAX_LEVEL, POWER_UP_COST, powerUnlock } from '../data/powers';
import { getWave, WAVE_EVENTS } from '../data/waves';
import type { Branch, FactionId } from '../data/types';
import type { RuneKind, RuneTile } from '../data/synergies';
import {
  DT, GameSettings, GameState, PlayerState, STATE_VERSION, newCore, newStats, teamCount, raiderTarget, opponents, humanPlayers, humanPid, Personality,
} from './state';
import { rand, shuffle } from './rng';
import { castPower, combatTick, enemiesAlive, spawnEnemies, spawnUnits, SpawnSpec } from './combat';
import { runAI, aiCombat } from './ai';

export type Command =
  | { c: 'build'; unit: string; col: number; row: number }
  | { c: 'move'; bid: number; col: number; row: number }
  | { c: 'sell'; bid: number }
  | { c: 'upgrade'; bid: number; branch?: Branch }
  | { c: 'fuse'; bid: number; with: number; branch?: Branch }
  | { c: 'worker' }
  | { c: 'raider'; raider: string; to?: number }
  | { c: 'curse'; curse: string; to?: number }
  | { c: 'cast'; slot: number }
  | { c: 'powerUp'; slot: number }
  | { c: 'invest' }
  | { c: 'core'; up: CoreUpgradeId }
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

function rollRunes(s: GameState): RuneTile[] {
  const kinds: RuneKind[] = ['force', 'vigueur', 'celerite'];
  const out: RuneTile[] = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 200) {
    const col = 2 + Math.floor(rand(s) * 8), row = Math.floor(rand(s) * GRID.rows);
    if (out.some(r => Math.abs(r.col - col) + Math.abs(r.row - row) < 3)) continue;
    out.push({ col, row, kind: kinds[out.length] });
  }
  return out;
}

export function createGame(settings: GameSettings, seed: number): GameState {
  const s: GameState = {
    v: STATE_VERSION, settings, seed, rng: seed | 0, tick: 0, time: 0, wave: 1, phase: 'build',
    timer: buildTime(1, false), timerMax: buildTime(1, false), waveEvent: null, lastEvent: null, ending: 0,
    combatTime: 0, speed: 1, paused: false,
    teams: [], players: [], ents: [], nextId: 1, events: [], result: null,
  };
  const nTeams = teamCount(s);
  for (let t = 0; t < nTeams; t++) s.teams.push({ id: t, core: newCore(), alive: true });
  const humanAt = new Map<number, number>();
  settings.humans.forEach((_, i) => humanAt.set(humanPid(settings.mode, i), i));
  for (let t = 0; t < nTeams; t++) {
    const used = new Set<FactionId>();
    for (let slot = 0; slot < 2; slot++) {
      const pid = t * 2 + slot;
      const hi = humanAt.get(pid);
      const human = hi !== undefined ? settings.humans[hi] : undefined;
      const pers: Personality = t === 0 && settings.mode !== 'duel' ? 'balanced' : PERSONALITIES[Math.floor(rand(s) * PERSONALITIES.length)];
      const choice = human?.faction ?? 'random';
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
        runes: [], leakedThisWave: 0, waveDmg: 0, pauseVote: false, stats: newStats(),
      };
      p.runes = rollRunes(s);
      s.players.push(p);
    }
  }
  s.events.push({ t: 'wave', n: 1, boss: false });
  return s;
}

export function workerCost(p: PlayerState) { return ECONOMY.workerBaseCost + ECONOMY.workerCostStep * (p.workers - ECONOMY.startWorkers); }

export function armyValue(p: PlayerState) { return p.builds.reduce((t, b) => t + b.value, 0); }

function cellFree(p: PlayerState, col: number, row: number, except = -1) {
  return !p.builds.some(b => b.col === col && b.row === row && b.bid !== except);
}
function inGrid(col: number, row: number) {
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;
}
const isBranch = (b: unknown): b is Branch => b === 'A' || b === 'B';

/** Sends already queued by p this wave for raider r. */
export function sameSends(p: { raiderQueue: { r: string }[] }, r: string) { return p.raiderQueue.filter(q => q.r === r).length; }

/** Validate & apply a player command. Returns an error message (French, user-facing) or null. */
export function applyCommand(s: GameState, pid: number, cmd: Command): string | null {
  const p = s.players[pid];
  if (!p) return 'Joueur inconnu.';
  if ((s.phase === 'ended' || s.ending > 0) && cmd.c !== 'ping') return 'La partie est terminée.';
  const building = s.phase === 'build';
  switch (cmd.c) {
    case 'build': {
      if (!building) return 'Construction possible uniquement pendant la préparation.';
      if (!p.draft.includes(cmd.unit)) return 'Unité indisponible pour ton armée.';
      if (!inGrid(cmd.col, cmd.row) || !cellFree(p, cmd.col, cmd.row)) return 'Case occupée.';
      const u = UNITS[cmd.unit];
      if (p.gold < u.cost) return 'Pas assez d\'or.';
      p.gold -= u.cost;
      const bid = s.nextId++;
      p.builds.push({ bid, defId: u.id, level: 1, branch: null, col: cmd.col, row: cmd.row, placedWave: s.wave, value: u.cost, dmgTotal: 0 });
      p.stats.unitsBuilt++;
      s.events.push({ t: 'build', pid, bid });
      return null;
    }
    case 'move': {
      if (!building) return 'Déplacement possible uniquement pendant la préparation.';
      const b = p.builds.find(x => x.bid === cmd.bid);
      if (!b) return 'Unité introuvable.';
      if (!inGrid(cmd.col, cmd.row) || !cellFree(p, cmd.col, cmd.row, b.bid)) return 'Case occupée.';
      b.col = cmd.col; b.row = cmd.row;
      return null;
    }
    case 'sell': {
      if (!building) return 'Vente possible uniquement pendant la préparation.';
      const i = p.builds.findIndex(x => x.bid === cmd.bid);
      if (i < 0) return 'Unité introuvable.';
      const b = p.builds[i];
      const refund = Math.floor(b.value * (b.placedWave === s.wave ? 1 : ECONOMY.sellRefund));
      p.gold += refund;
      p.builds.splice(i, 1);
      s.events.push({ t: 'sell', pid });
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
      const cost = upgradeCost(b.defId, next);
      if (p.gold < cost) return 'Pas assez d\'or.';
      p.gold -= cost;
      b.level = next; b.branch = branch;
      b.value += cost;
      p.stats.upgrades++;
      s.events.push({ t: 'evolve', pid, bid: b.bid, level: b.level, branch: b.branch });
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
      p.gold += refund;
      p.builds.splice(p.builds.indexOf(o), 1);
      a.level = next; a.branch = branch;
      a.value = Math.min(a.value + o.value, newValue);
      a.placedWave = Math.min(a.placedWave, o.placedWave);
      a.dmgTotal += o.dmgTotal;
      p.stats.fusions++;
      s.events.push({ t: 'fuse', pid, bid: a.bid, col: o.col, row: o.row });
      s.events.push({ t: 'evolve', pid, bid: a.bid, level: a.level, branch: a.branch });
      if (refund > 0) s.events.push({ t: 'income', pid, gold: refund });
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
      p.income += r.income;
      p.raiderQueue.push({ r: r.id, to });
      if (r.cooldown) p.raiderCd[r.id] = s.wave + r.cooldown;
      p.stats.raidersSent++;
      p.stats.sentUnits += r.units.reduce((t, u) => t + u.count, 0);
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
      p.powerCd[slot] = def.cooldown * POWER_LEVEL_CD[p.powerLv[slot]];
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
    case 'core': {
      const def = CORE.upgrades[cmd.up];
      if (!def) return 'Amélioration inconnue.';
      const core = s.teams[p.team].core;
      const lvl = core.up[cmd.up];
      if (lvl >= def.max) return 'Niveau maximum atteint.';
      const cost = def.costs[lvl];
      if (p.ether < cost) return 'Pas assez d\'Éther.';
      p.ether -= cost;
      core.up[cmd.up]++;
      s.events.push({ t: 'coreUp', pid, up: cmd.up });
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

function debugCommand(s: GameState, p: PlayerState, action: string): string | null {
  switch (action) {
    case 'gold': p.gold += 500; break;
    case 'ether': p.ether += 100; break;
    case 'kill': for (const e of s.ents) if (e.enemy) { e.dead = true; e.hp = 0; } break;
    case 'core': for (const t of s.teams) t.core.hp = t.core.maxHp; break;
    case 'skip': if (s.phase === 'build') s.timer = 0; break;
    case 'wave': if (s.phase === 'build') { s.wave = Math.min(s.wave + 1, s.settings.totalWaves); s.timer = 0; } break;
    case 'cd': p.powerCd = [0, 0, 0]; break;
    case 'event': s.waveEvent = WAVE_EVENTS[(WAVE_EVENTS.findIndex(e => e.id === s.waveEvent) + 1) % WAVE_EVENTS.length].id; break;
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

function startCombat(s: GameState) {
  s.phase = 'combat';
  s.combatTime = 0;
  s.ents = [];
  // auto-pick pending passive powers
  for (const p of s.players) if (p.powerChoice) applyCommand(s, p.pid, { c: 'power', power: p.powerChoice[0] });
  spawnUnits(s);
  // curses received this wave
  const hexes = new Map<number, string[]>();
  for (const p of s.players) for (const q of p.curseQueue) { const l = hexes.get(q.to) ?? []; l.push(q.r); hexes.set(q.to, l); }
  for (const p of s.players) {
    p.leakedThisWave = 0;
    p.waveDmg = 0;
    const h = hexes.get(p.pid) ?? [];
    p.fogUntil = h.includes('brouillard') ? 10 : 0;
    p.jamUntil = h.includes('brouillage') ? 10 : 0;
    spawnEnemies(s, p.team, p.slot, p.pid, waveList(s).map(x => withHex(x, h)));
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
        for (const u of r.units) for (let i = 0; i < u.count; i++) list.push(withHex({ enemy: u.enemy, hpMul: r.hpMul * sc, dmgMul: sc, raider: true, elite: r.category === 'champion' }, h));
      }
      const off = offsets.get(to) ?? 7;
      spawnEnemies(s, tgt.team, tgt.slot, tgt.pid, list, off);
      offsets.set(to, off + Math.ceil(list.length / 4) * 1.3 + 1);
      s.events.push({ t: 'sends', from: p.pid, to, list: ids });
    }
    p.raiderQueue = [];
  }
  for (const [to, list] of hexes) s.events.push({ t: 'hexed', to, list });
  for (const p of s.players) p.curseQueue = [];
  for (const e of s.ents) if (e.enemy && e.boss) s.events.push({ t: 'bossIn', arena: e.arena, id: e.defId });
  s.events.push({ t: 'combat' });
}

function endCombat(s: GameState) {
  // timeout: survivors hit the Core with their leak damage
  for (const e of s.ents) {
    if (e.enemy && !e.dead) {
      const core = s.teams[e.arena].core;
      const dmg = e.leakDamage * (1 - CORE.upgrades.def.per * core.up.def);
      core.hp -= dmg;
      s.players[e.owner].stats.coreDamageCaused += dmg;
      if (!e.leaked) { s.players[e.owner].stats.leaks++; s.players[e.owner].leakedThisWave++; }
      s.events.push({ t: 'coreHit', team: e.arena, dmg });
    }
  }
  s.ents = [];
  for (const p of s.players) {
    const dps = p.waveDmg / Math.max(1, s.combatTime);
    p.stats.maxDps = Math.max(p.stats.maxDps, Math.round(dps));
    for (const b of p.builds) if (b.dmgTotal > p.stats.bestUnitDmg) { p.stats.bestUnitDmg = b.dmgTotal; p.stats.bestUnit = b.defId; }
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
  s.events.push({ t: 'end', result: winner === 0 ? 'victory' : 'defeat' });
}

function pickEvent(s: GameState): string | null {
  const w = getWave(s.wave);
  if (s.wave < 3 || w.boss || s.settings.tutorial) return null;
  if (rand(s) > 0.35) return null;
  const pool = WAVE_EVENTS.filter(e => e.id !== s.lastEvent);
  return pool[Math.floor(rand(s) * pool.length)].id;
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
    let g = p.income;
    if (p.leakedThisWave === 0) g += ECONOMY.waveClearBonus;
    p.gold += g;
    p.stats.goldEarned += g;
    s.events.push({ t: 'income', pid: p.pid, gold: g });
    p.ready = false;
  }
  for (const t of s.teams) {
    t.core.hp = Math.min(t.core.maxHp, t.core.hp + CORE.regenPerWave + CORE.upgrades.regen.per * t.core.up.regen);
  }
  s.wave++;
  s.phase = 'build';
  const w = getWave(s.wave);
  s.timer = s.timerMax = buildTime(s.wave, !!w.boss);
  s.lastEvent = s.waveEvent;
  s.waveEvent = pickEvent(s);
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
  // ether from workers (all phases)
  for (const p of s.players) {
    const e = p.workers * ECONOMY.etherPerWorkerPerSec * DT * (p.powers.includes('ouvriers') ? 1.5 : 1);
    p.ether += e;
    p.stats.etherProduced += e;
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

export { unitValueAt };
