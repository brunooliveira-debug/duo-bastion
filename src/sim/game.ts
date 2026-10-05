// Game orchestrator: WaveSystem, EconomySystem, DraftSystem, RaiderSystem, CoreSystem and command validation.
// Pure logic, no DOM. The host owns one instance; guests only receive snapshots.
import { UNITS, BASE_UNIT_IDS, isTank, isDps, unitValue } from '../data/units';
import { CORE, ECONOMY, GRID, POWERS, RAIDERS, TIMING, raiderScale, CoreUpgradeId } from '../data/economy';
import { getWave } from '../data/waves';
import {
  DT, GameSettings, GameState, PlayerState, newCore, newStats, teamCount, raiderTarget, humanPlayers, Personality,
} from './state';
import { rand, shuffle } from './rng';
import { combatTick, enemiesAlive, spawnEnemies, spawnUnits } from './combat';
import { runAI } from './ai';

export type Command =
  | { c: 'build'; unit: string; col: number; row: number }
  | { c: 'move'; bid: number; col: number; row: number }
  | { c: 'sell'; bid: number }
  | { c: 'upgrade'; bid: number }
  | { c: 'worker' }
  | { c: 'raider'; raider: string }
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

const PERSONALITIES: Personality[] = ['defensive', 'economic', 'aggressive', 'balanced'];

export function createGame(settings: GameSettings, seed: number): GameState {
  const s: GameState = {
    v: 1, settings, seed, rng: seed | 0, tick: 0, time: 0, wave: 1, phase: 'build',
    timer: TIMING.firstBuild, combatTime: 0, speed: 1, paused: false,
    teams: [], players: [], ents: [], nextId: 1, events: [], result: null,
  };
  const nTeams = teamCount(s);
  for (let t = 0; t < nTeams; t++) s.teams.push({ id: t, core: newCore(), alive: true });
  for (let t = 0; t < nTeams; t++) {
    for (let slot = 0; slot < 2; slot++) {
      const pid = t * 2 + slot;
      const human = t === 0 ? settings.humans[slot] : undefined;
      const pers = t === 0 ? 'balanced' : PERSONALITIES[Math.floor(rand(s) * PERSONALITIES.length)];
      const p: PlayerState = {
        pid, team: t, slot,
        name: human ? human.name : t === 0 ? 'Allié IA' : `${['Vex', 'Morgane', 'Krull', 'Ishta'][Math.floor(rand(s) * 4)]} (IA)`,
        isAI: !human, personality: pers as Personality,
        gold: ECONOMY.startGold, ether: ECONOMY.startEther, income: ECONOMY.startIncome, workers: ECONOMY.startWorkers,
        draft: [], rerolls: 1, builds: [], ready: false, powers: [], powerChoice: null, raiderQueue: [],
        leakedThisWave: 0, waveDmg: 0, pauseVote: false, stats: newStats(),
      };
      p.draft = rollDraft(s);
      s.players.push(p);
    }
  }
  s.events.push({ t: 'wave', n: 1, boss: false });
  return s;
}

/** 6 units; guarantee ≥1 tank, ≥1 damage dealer, spread of costs. */
export function rollDraft(s: GameState): string[] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pick = shuffle(s, BASE_UNIT_IDS).slice(0, 6);
    const tanks = pick.filter(isTank).length;
    const dps = pick.filter(isDps).length;
    const cheap = pick.filter(id => UNITS[id].cost <= 100).length;
    if (tanks >= 1 && dps >= 1 && cheap >= 2) return pick.sort((a, b) => UNITS[a].cost - UNITS[b].cost);
  }
  return BASE_UNIT_IDS.slice(0, 6);
}

export function workerCost(p: PlayerState) { return ECONOMY.workerBaseCost + ECONOMY.workerCostStep * (p.workers - ECONOMY.startWorkers); }

export function armyValue(p: PlayerState) { return p.builds.reduce((t, b) => t + b.value, 0); }

function cellFree(p: PlayerState, col: number, row: number, except = -1) {
  return !p.builds.some(b => b.col === col && b.row === row && b.bid !== except);
}
function inGrid(col: number, row: number) {
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < GRID.cols && row >= 0 && row < GRID.rows;
}

/** Validate & apply a player command. Returns an error message (French, user-facing) or null. */
export function applyCommand(s: GameState, pid: number, cmd: Command): string | null {
  const p = s.players[pid];
  if (!p) return 'Joueur inconnu.';
  if (s.phase === 'ended' && cmd.c !== 'ping') return 'La partie est terminée.';
  const building = s.phase === 'build';
  switch (cmd.c) {
    case 'build': {
      if (!building) return 'Construction possible uniquement pendant la préparation.';
      if (!p.draft.includes(cmd.unit)) return 'Unité indisponible.';
      if (!inGrid(cmd.col, cmd.row) || !cellFree(p, cmd.col, cmd.row)) return 'Case occupée.';
      const u = UNITS[cmd.unit];
      if (p.gold < u.cost) return 'Pas assez d\'or.';
      p.gold -= u.cost;
      const bid = s.nextId++;
      p.builds.push({ bid, defId: u.id, col: cmd.col, row: cmd.row, placedWave: s.wave, value: u.cost, dmgTotal: 0 });
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
      if (!building) return 'Évolution possible uniquement pendant la préparation.';
      const b = p.builds.find(x => x.bid === cmd.bid);
      if (!b) return 'Unité introuvable.';
      const next = UNITS[b.defId].evolvesTo;
      if (!next) return 'Cette unité est déjà à son apogée.';
      const cost = UNITS[next].cost;
      if (p.gold < cost) return 'Pas assez d\'or.';
      p.gold -= cost;
      b.defId = next;
      b.value += cost;
      b.placedWave = Math.min(b.placedWave, s.wave); // keep refund rule
      s.events.push({ t: 'evolve', pid, bid: b.bid });
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
      if (!raiderTarget(s, pid)) return 'Pas d\'adversaire dans ce mode.';
      const r = RAIDERS.find(x => x.id === cmd.raider);
      if (!r) return 'Raider inconnu.';
      if (s.wave < r.unlockWave) return `Disponible à la vague ${r.unlockWave}.`;
      if (p.ether < r.cost) return 'Pas assez d\'Éther.';
      if (p.raiderQueue.length >= 12) return 'File de Raiders pleine.';
      p.ether -= r.cost;
      p.income += r.income;
      p.raiderQueue.push(r.id);
      p.stats.raidersSent++;
      s.events.push({ t: 'raider', pid, raider: r.id });
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
    case 'reroll': {
      if (p.rerolls <= 0) return 'Plus de relance disponible.';
      if (s.wave !== 1 || !building || p.builds.length > 0) return 'Relance possible seulement avant la première construction.';
      p.rerolls--;
      p.draft = rollDraft(s);
      return null;
    }
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
    default: return 'Action debug inconnue.';
  }
  return null;
}

// ---------------------------------------------------------------- phases

function startCombat(s: GameState) {
  s.phase = 'combat';
  s.combatTime = 0;
  s.ents = [];
  // auto-pick pending powers
  for (const p of s.players) if (p.powerChoice) applyCommand(s, p.pid, { c: 'power', power: p.powerChoice[0] });
  spawnUnits(s);
  const w = getWave(s.wave);
  for (const p of s.players) {
    p.leakedThisWave = 0;
    p.waveDmg = 0;
    const list: { enemy: string; hpMul: number; dmgMul: number; raider?: boolean }[] = [];
    for (const g of w.groups) for (let i = 0; i < g.count; i++) list.push({ enemy: g.enemy, hpMul: w.hpMul, dmgMul: w.dmgMul });
    spawnEnemies(s, p.team, p.slot, p.pid, list);
  }
  // raiders: sender's queue spawns behind the target lane's wave
  for (const p of s.players) {
    const tgt = raiderTarget(s, p.pid);
    if (!tgt || p.raiderQueue.length === 0) continue;
    const sc = raiderScale(s.wave);
    const list = p.raiderQueue.map(id => {
      const r = RAIDERS.find(x => x.id === id)!;
      return { enemy: r.enemy, hpMul: r.hpMul * sc, dmgMul: sc, raider: true };
    });
    spawnEnemies(s, tgt.team, tgt.slot, tgt.pid, list, 7);
    p.raiderQueue = [];
  }
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
  checkEnd(s);
}

function checkEnd(s: GameState) {
  if (s.result) return;
  for (const t of s.teams) { if (t.core.hp <= 0) { t.core.hp = 0; t.alive = false; } }
  const us = s.teams[0];
  if (!us.alive) {
    finish(s, 'defeat', s.settings.mode === 'survival' ? `Le Core est tombé à la vague ${s.wave}.` : 'Votre Core a été détruit.');
    return;
  }
  if (s.settings.mode === 'vsai' && !s.teams[1].alive) {
    finish(s, 'victory', 'Le Core adverse est détruit !');
  }
}

function finish(s: GameState, outcome: 'victory' | 'defeat', reason: string) {
  s.result = { outcome, wave: s.wave, reason };
  s.phase = 'ended';
  s.ents = [];
  s.events.push({ t: 'end', result: outcome });
}

function startBuild(s: GameState) {
  // final wave check
  if (s.settings.mode === 'vsai' && s.wave >= s.settings.totalWaves) {
    const a = s.teams[0].core.hp / s.teams[0].core.maxHp;
    const b = s.teams[1].core.hp / s.teams[1].core.maxHp;
    finish(s, a >= b ? 'victory' : 'defeat', a >= b ? 'Vous avez tenu jusqu\'au bout avec un Core plus solide !' : 'Le Core adverse a mieux résisté.');
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
  s.timer = TIMING.build;
  const w = getWave(s.wave);
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
  switch (s.phase) {
    case 'build': {
      if (s.tick % 10 === 0) runAI(s);
      s.timer -= DT;
      const allReady = s.players.every(p => p.ready);
      if (s.timer <= 0 || allReady) startCombat(s);
      break;
    }
    case 'combat': {
      s.combatTime += DT;
      combatTick(s);
      for (const t of s.teams) if (t.core.hp <= 0) { checkEnd(s); return; }
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

export { unitValue };
