import type { AttackType, DefenseType, RaiderDef, PowerDef, RaiderCategory } from './types';

export const ECONOMY = {
  startGold: 450, // v0.7.2: +200 starting bonus (the first preparation is where a game takes shape)
  startEther: 0,
  startIncome: 30,
  startWorkers: 1,
  maxWorkers: 20,
  workerBaseCost: 50,
  workerCostStep: 10, // +10 gold per worker owned
  etherPerWorkerPerSec: 0.1, // 1 ether / 10 s
  sellRefund: 0.5, // refund ratio for units placed in a previous round
  investRatio: 0.2, // survival mode: income gained per ether invested
  investChunk: 20,
  waveClearBonus: 10, // gold if no leak in your lane
  randomFactionGold: 40, // bonus for accepting a random army
  // v0.7.1: gold between the waves — every kill pays more, and a lane cleared fast pays a speed bonus
  bountyMul: 1.35, // multiplier on every enemy bounty
  speedBonusBase: 10, // max speed bonus = base + perWave × wave (lane held without a leak, cleared at once)
  speedBonusPerWave: 4,
  speedRef: 40, // seconds: a lane cleared in t seconds earns max × (speedRef − t) / speedRef
  // v0.7.2: the higher the wave, the more it pays — base income grows every wave, bounties too
  incomePerWave: 5, // gold added to the per-wave income for every wave past the first
  bountyWaveGrowth: 0.03, // bounty multiplier +3 % per wave past the first
};

/** Per-wave income of a player at wave n (base + sends + wave growth). */
export function waveIncome(base: number, wave: number) { return base + ECONOMY.incomePerWave * Math.max(0, wave - 1); }
/** Bounty multiplier at wave n (v0.7.1 flat boost × v0.7.2 wave growth). */
export function bountyScale(wave: number) { return ECONOMY.bountyMul * (1 + ECONOMY.bountyWaveGrowth * Math.max(0, wave - 1)); }

/** Speed bonus for a lane held (no leak) and cleared at `t` seconds of combat. */
export function speedBonus(wave: number, t: number, held: boolean) {
  if (!held) return 0;
  const k = Math.max(0, Math.min(1, (ECONOMY.speedRef - t) / ECONOMY.speedRef));
  return Math.round(k * (ECONOMY.speedBonusBase + ECONOMY.speedBonusPerWave * wave));
}

export const TIMING = {
  firstBuild: 60,
  build: 42, // + 1 s per wave (max +12) and +8 s before a boss: see buildTime()
  resolution: 4,
  maxCombat: 80,
  tickRate: 20,
};

/** Preparation time before wave n. */
export function buildTime(n: number, boss: boolean) {
  if (n <= 1) return TIMING.firstBuild;
  return TIMING.build + Math.min(12, n) + (boss ? 8 : 0);
}

export const GRID = {
  cols: 12, // along the path (0 = near enemy spawn)
  rows: 7, // across the lane
  cell: 1,
};

export const CORE = {
  hp: 2500,
  dmg: 70,
  atkSpeed: 1,
  range: 8,
  attack: 'arca' as AttackType,
  regenPerWave: 40,
  // upgrades: see src/data/modules.ts (Modules du Bastion, v0.4)
};

// attack row × defense column. ↑ ≥ 1.1, ↓ ≤ 0.9
export const DAMAGE_MATRIX: Record<AttackType, Record<DefenseType, number>> = {
  phys: { leg: 1.1, org: 1.2, bli: 0.8, mys: 0.9 },
  perf: { leg: 1.2, org: 1.1, bli: 0.9, mys: 0.8 },
  ener: { leg: 0.9, org: 0.8, bli: 1.2, mys: 1.1 },
  arca: { leg: 0.8, org: 0.9, bli: 1.1, mys: 1.2 },
};
export const ATTACK_NAMES: Record<AttackType, string> = { phys: 'Physique', perf: 'Perforant', ener: 'Énergétique', arca: 'Arcanique' };
export const DEFENSE_NAMES: Record<DefenseType, string> = { leg: 'Légère', org: 'Organique', bli: 'Blindée', mys: 'Mystique' };
export const ATTACK_ICONS: Record<AttackType, string> = { phys: '🗡️', perf: '🏹', ener: '⚡', arca: '🔮' };
export const DEFENSE_ICONS: Record<DefenseType, string> = { leg: '🪶', org: '🌿', bli: '🔩', mys: '✨' };

export function matrixArrow(m: number) { return m >= 1.1 ? '↑' : m <= 0.9 ? '↓' : '—'; }

// ---------------------------------------------------------------- sends ("Raiders")
// Each send is a pack that attacks an opposing lane at the next wave. The sender gains permanent income.
// Anti-spam: per-wave send cap, +30 % price for each copy of the same pack in the same wave,
// per-pack max per wave, and cooldowns (in waves) for champions.
export const RAIDERS: RaiderDef[] = [
  { id: 'grignoteur', name: 'Grignoteurs', category: 'eco', ether: 10, gold: 0, income: 3, unlockWave: 1, units: [{ enemy: 'grignoteur', count: 1 }], hpMul: 1, cooldown: 0, maxPerWave: 6,
    description: 'Envoi économique : surtout du revenu.', counter: 'N\'importe quelle défense.' },
  { id: 'nuee', name: 'Nuée de Zéphyrs', category: 'rapide', ether: 25, gold: 0, income: 4, unlockWave: 2, units: [{ enemy: 'zephyr', count: 4 }], hpMul: 1, cooldown: 0, maxPerWave: 3,
    description: '4 griffes très rapides qui filent vers le Core.', counter: 'Ralentissements, intercepteurs, zone.' },
  { id: 'mur_coquille', name: 'Mur-Coquille', category: 'blinde', ether: 40, gold: 0, income: 6, unlockWave: 4, units: [{ enemy: 'mur_coquille', count: 1 }], hpMul: 1, cooldown: 0, maxPerWave: 3,
    description: 'Un tank qui occupe la défense adverse.', counter: 'Énergie, perce-armure.' },
  { id: 'spectres', name: 'Spectres Fêlés', category: 'resistant', ether: 50, gold: 0, income: 6, unlockWave: 6, units: [{ enemy: 'spectre_fele', count: 3 }], hpMul: 1, cooldown: 0, maxPerWave: 2,
    description: '3 spectres : ignorent la provocation, -40 % dégâts Physiques.', counter: 'Arcane, Énergie, unités à distance.' },
  { id: 'phalange', name: 'Phalange de Basalte', category: 'blinde', ether: 60, gold: 0, income: 7, unlockWave: 7, units: [{ enemy: 'basalte_garde', count: 3 }], hpMul: 1, cooldown: 0, maxPerWave: 2,
    description: '3 gardes très blindés (30 % d\'armure).', counter: 'Anti-blindage, poison, Énergie.' },
  { id: 'chaman', name: 'Chaman Dissonant', category: 'special', ether: 55, gold: 0, income: 6, unlockWave: 8, units: [{ enemy: 'chaman', count: 1 }, { enemy: 'grignoteur', count: 2 }], hpMul: 1, cooldown: 0, maxPerWave: 2,
    description: 'Soigne et protège toute la vague adverse.', counter: 'Assassins, longue portée, exécution.' },
  { id: 'sapeurs', name: 'Sapeurs Kamikazes', category: 'special', ether: 45, gold: 30, income: 4, unlockWave: 9, units: [{ enemy: 'sapeur', count: 3 }], hpMul: 1, cooldown: 0, maxPerWave: 2,
    description: '3 kamikazes qui explosent sur les unités groupées.', counter: 'Espacer ses unités, tuer à distance.' },
  { id: 'scindeur', name: 'Scindeur', category: 'special', ether: 65, gold: 0, income: 7, unlockWave: 10, units: [{ enemy: 'scindeur', count: 1 }], hpMul: 1, cooldown: 0, maxPerWave: 2,
    description: 'Se divise en 3 rejetons à sa mort.', counter: 'Dégâts de zone.' },
  { id: 'behemoth', name: 'Béhémoth Fendeur', category: 'puissant', ether: 90, gold: 40, income: 8, unlockWave: 11, units: [{ enemy: 'behemoth', count: 1 }], hpMul: 1, cooldown: 1, maxPerWave: 1,
    description: 'Colosse aux dégâts de zone massifs.', counter: 'Tanks solides + anti-gros.' },
  { id: 'champion', name: 'Seigneur de Faille', category: 'champion', ether: 140, gold: 100, income: 10, unlockWave: 13, units: [{ enemy: 'seigneur_faille', count: 1 }], hpMul: 1, cooldown: 3, maxPerWave: 1,
    description: 'Champion blindé : son aura protège les ennemis autour de lui.', counter: 'Énergie, anti-gros, étourdissements.' },
  { id: 'titan', name: 'Titan Dissonant', category: 'champion', ether: 240, gold: 200, income: 12, unlockWave: 17, units: [{ enemy: 'titan_dissonant', count: 1 }], hpMul: 1, cooldown: 4, maxPerWave: 1,
    description: 'Un boss complet envoyé sur la voie adverse.', counter: 'Arcane, anti-gros, Core amélioré.' },
];
export const RAIDER_CATEGORY_NAMES: Record<RaiderCategory, string> = {
  eco: 'Éco', rapide: 'Rapide', blinde: 'Blindé', resistant: 'Résistant', special: 'Spécial', puissant: 'Puissant', champion: 'Champion',
};
/**
 * Raider stats grow with the wave they are sent on. v0.3 used 1 + 0.09·(w−1): late sends had 3–4× less HP than
 * the wave enemies they walked behind and were wiped out (balance report: 0.06 Core damage per Éther invested,
 * no game ever decided by sends). They now follow the waves' own toughness curve (waveToughness ≈ 1.2 + 0.36·(w−1)).
 */
export function raiderScale(wave: number) { return 1 + 0.32 * (wave - 1); }
/** Unlock wave adapted to the game length (10-wave games unlock everything faster). */
export function raiderUnlock(r: RaiderDef, totalWaves: number) { return totalWaves <= 10 ? Math.ceil(r.unlockWave * 0.55) : r.unlockWave; }
/** Max number of sends per player per wave. */
export function sendCap(wave: number) { return Math.min(8, 2 + Math.floor(wave / 3)); }
/** Price of the next copy of a pack this wave (+30 % per copy already queued). */
export function raiderPrice(r: RaiderDef, sameThisWave: number) {
  const k = 1 + 0.3 * sameThisWave;
  return { ether: Math.round(r.ether * k), gold: Math.round(r.gold * k) };
}

// ---------------------------------------------------------------- curses (offensive actions on the opposing lane)
// Short, readable debuffs applied at the start of the target's next wave. Max 1 curse per player per wave,
// each type has a cooldown in waves. Timed effects never last more than 10 s of combat.
export interface CurseDef { id: string; name: string; icon: string; ether: number; gold: number; unlockWave: number; cooldown: number; text: string; counter: string }
export const CURSES: CurseDef[] = [
  { id: 'vitalite', name: 'Sang Fêlé', icon: 'heart', ether: 35, gold: 0, unlockWave: 4, cooldown: 2, text: 'Les ennemis de la prochaine vague adverse ont +20 % PV.', counter: 'Plus de dégâts bruts.' },
  { id: 'carapace', name: 'Carapace Fêlée', icon: 'shield', ether: 30, gold: 0, unlockWave: 5, cooldown: 2, text: 'Bouclier de 15 % des PV pour les prochains ennemis adverses.', counter: 'IEM, attaques rapides.' },
  { id: 'hate', name: 'Hâte Fêlée', icon: 'ff', ether: 30, gold: 0, unlockWave: 6, cooldown: 2, text: 'Ennemis adverses +20 % vitesse de déplacement.', counter: 'Ralentissements, intercepteurs.' },
  { id: 'brouillard', name: 'Brouillard', icon: 'fog', ether: 40, gold: 0, unlockWave: 8, cooldown: 3, text: 'Brouillard sur l\'arrière adverse : portée -35 % pendant 10 s.', counter: 'Unités au contact.' },
  { id: 'brouillage', name: 'Brouillage', icon: 'emp', ether: 45, gold: 20, unlockWave: 9, cooldown: 3, text: 'Pouvoirs adverses bloqués pendant les 10 premières secondes.', counter: 'Garder ses pouvoirs pour la suite.' },
];
export function curseUnlock(c: CurseDef, totalWaves: number) { return totalWaves <= 10 ? Math.ceil(c.unlockWave * 0.55) : c.unlockWave; }

export const POWERS: PowerDef[] = [
  { id: 'surcharge', name: 'Surcharge', icon: '⚡', description: '+25 % vitesse d\'attaque pour toutes vos unités.' },
  { id: 'investissement', name: 'Investissement', icon: '📈', description: 'Votre revenu est multiplié par 1,25.' },
  { id: 'bouclier_core', name: 'Bouclier du Core', icon: '🛡️', description: 'Le Core gagne +30 % PV max et se soigne de 30 %.' },
  { id: 'resonance', name: 'Résonance', icon: '🎵', description: 'Auras, soins et boucliers +50 %.' },
  { id: 'mutation', name: 'Mutation', icon: '🧬', description: 'Vos unités ont +20 % PV.' },
  { id: 'fureur', name: 'Fureur', icon: '🔥', description: '+15 % dégâts, +30 % sous 50 % PV.' },
  { id: 'regeneration', name: 'Régénération', icon: '💚', description: 'Vos unités régénèrent 2 % PV/s en combat.' },
  { id: 'fortune', name: 'Fortune', icon: '💰', description: 'Primes d\'élimination +50 %.' },
  { id: 'ouvriers', name: 'Contremaître', icon: '⛏️', description: 'Vos travailleurs produisent +50 % d\'Éther.' },
  { id: 'rempart', name: 'Rempart', icon: '🧱', description: 'Vos unités subissent -12 % de dégâts.' },
  { id: 'precision', name: 'Précision', icon: '🎯', description: 'Unités à distance : +20 % dégâts et +0,5 portée.' },
  { id: 'eclat', name: 'Éclat', icon: '💠', description: 'Zone, rebonds, poisons et ondes +40 %.' },
];

export const PINGS = [
  { id: 'ok', label: '👍 OK' },
  { id: 'warn', label: '⚠️ ATTENTION' },
  { id: 'eco', label: '💰 ÉCONOMISE' },
  { id: 'atk', label: '⚔️ ATTAQUE' },
  { id: 'def', label: '🛡️ DÉFENDS' },
  { id: 'weak', label: '🆘 JE SUIS FAIBLE' },
  { id: 'saveWave', label: '⏳ ÉCONOMISE CETTE VAGUE' },
  { id: 'sendNext', label: '📨 ENVOIE À LA PROCHAINE' },
];
