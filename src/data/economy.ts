import type { AttackType, DefenseType, RaiderDef, PowerDef } from './types';

export const ECONOMY = {
  startGold: 250,
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
};

export const TIMING = {
  firstBuild: 45,
  build: 35,
  resolution: 3,
  maxCombat: 80,
  tickRate: 20,
};

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
  upgrades: {
    atk: { name: 'Attaque', icon: '⚡', max: 5, costs: [30, 45, 60, 80, 100], per: 0.35, text: '+35 % dégâts du Core' },
    regen: { name: 'Régénération', icon: '💚', max: 5, costs: [25, 40, 55, 70, 90], per: 60, text: '+60 PV rendus par vague' },
    def: { name: 'Défense', icon: '🛡️', max: 5, costs: [35, 50, 65, 80, 100], per: 0.08, text: '-8 % dégâts subis' },
    pow: { name: 'Puissance', icon: '💥', max: 3, costs: [50, 80, 120], per: 160, text: 'Onde Bastion : choc de zone toutes les 7 s' },
  },
};
export type CoreUpgradeId = keyof typeof CORE.upgrades;

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

export const RAIDERS: RaiderDef[] = [
  { id: 'grignoteur', name: 'Grignoteur', category: 'eco', cost: 10, income: 3, unlockWave: 1, enemy: 'grignoteur', hpMul: 1, description: 'Économique : +3 revenu. Peu dangereux.' },
  { id: 'zephyr', name: 'Griffe-Zéphyr', category: 'eco', cost: 20, income: 5, unlockWave: 3, enemy: 'zephyr', hpMul: 1, description: 'Rapide : +5 revenu. Peut filer jusqu\'au Core.' },
  { id: 'mur_coquille', name: 'Mur-Coquille', category: 'power', cost: 40, income: 6, unlockWave: 5, enemy: 'mur_coquille', hpMul: 1, description: 'Tank : +6 revenu. Occupe la défense adverse.' },
  { id: 'behemoth', name: 'Béhémoth Fendeur', category: 'power', cost: 80, income: 6, unlockWave: 7, enemy: 'behemoth', hpMul: 1, description: 'Puissant : +6 revenu. Gros dégâts de zone.' },
];
/** Raider stats grow slowly with the wave they are sent on. */
export function raiderScale(wave: number) { return 1 + 0.08 * (wave - 1); }

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
  { id: 'eclat', name: 'Éclat', icon: '💠', description: 'Zone, rebonds et ondes +40 %.' },
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
