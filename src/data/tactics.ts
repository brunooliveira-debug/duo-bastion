// TACTICAL ORDERS, ANOMALIES and SECONDARY RIFTS — the small decisions that make each game tell a story.
import type { GameMode } from '../sim/state';

// ---------------------------------------------------------------- tactical orders (during combat)
// The fight stays automatic: each player gets ORDER_CHARGES per wave, ORDER_COOLDOWN seconds apart.
export type OrderId = 'focus' | 'rally' | 'retreat' | 'intercept' | 'purge';
export interface OrderDef { id: OrderId; name: string; icon: string; text: string; dur: number; target: boolean }
export const ORDER_CHARGES = 2;
export const ORDER_COOLDOWN = 4;
export const ORDERS: Record<OrderId, OrderDef> = {
  focus: { id: 'focus', name: 'FOCUS', icon: 'target', dur: 7, target: true, text: 'Tes unités frappent en priorité la cible (+15 % dégâts sur elle) pendant 7 s. Sans cible : le plus dangereux.' },
  rally: { id: 'rally', name: 'RALLIEMENT', icon: 'flag', dur: 6, target: true, text: 'Zone de 3,5 m : tes unités y subissent -25 % de dégâts et frappent 15 % plus vite (6 s).' },
  retreat: { id: 'retreat', name: 'REPLI', icon: 'back', dur: 5, target: false, text: 'Tes unités mobiles reculent de 3 m et subissent -30 % de dégâts pendant 5 s (esquive une attaque de boss).' },
  intercept: { id: 'intercept', name: 'INTERCEPTION', icon: 'run', dur: 8, target: false, text: 'Tes unités rapides (et mobiles) chassent les ennemis qui filent vers le Core, +30 % vitesse (8 s).' },
  purge: { id: 'purge', name: 'PURGE', icon: 'sparkle', dur: 0, target: false, text: 'Retire brouillard et brouillage de ta voie, libère tes unités (étourdissement, poison, brûlure, ralentissement) et les soigne de 10 %.' },
};
export const ORDER_IDS = Object.keys(ORDERS) as OrderId[];

// ---------------------------------------------------------------- anomalies (risk / reward, chosen before key waves)
export type AnomalyId = 'pacte' | 'tempete' | 'rune_instable' | 'fortune' | 'sacrifice' | 'eclipse' | 'resonance_instable' | 'arsenal' | 'veille' | 'contrat';
export interface AnomalyDef { id: AnomalyId; name: string; icon: string; good: string; bad: string }
/** Each anomaly lasts this many waves (including the one it is picked for). */
export const ANOMALY_WAVES = 3;
export const ANOMALIES: Record<AnomalyId, AnomalyDef> = {
  pacte: { id: 'pacte', name: 'PACTE DE LA FAILLE', icon: 'skull', good: 'Primes d\'élimination +40 %.', bad: 'Ennemis +20 % PV.' },
  tempete: { id: 'tempete', name: 'TEMPÊTE D\'ÉTHER', icon: 'ether', good: 'Pouvoirs 35 % plus rapides, Éther +30 %.', bad: 'Ennemis 15 % plus rapides.' },
  rune_instable: { id: 'rune_instable', name: 'RUNE INSTABLE', icon: 'rune', good: 'Une rune surpuissante (+50 % dégâts, +30 % cadence) apparaît dans chaque voie.', bad: '2 cases deviennent des failles : une unité posée dessus perd 3 % PV/s.' },
  fortune: { id: 'fortune', name: 'FORTUNE DU BASTION', icon: 'coin', good: '+X or immédiatement pour chaque joueur.', bad: 'Le prochain boss a +35 % PV.' },
  sacrifice: { id: 'sacrifice', name: 'SACRIFICE DU CORE', icon: 'heart', good: 'Toutes tes unités +12 % dégâts.', bad: 'Le Core perd 12 % de ses PV max.' },
  eclipse: { id: 'eclipse', name: 'ÉCLIPSE', icon: 'moon', good: 'Ennemis -15 % PV.', bad: 'Portée de tes unités -15 %.' },
  resonance_instable: { id: 'resonance_instable', name: 'RÉSONANCE INSTABLE', icon: 'duo', good: 'Charge de Résonance ×2.', bad: 'Ennemis +12 % dégâts.' },
  arsenal: { id: 'arsenal', name: 'ARSENAL', icon: 'up', good: 'Améliorations -20 %.', bad: 'Nouvelles unités +15 %.' },
  veille: { id: 'veille', name: 'VEILLE TACTIQUE', icon: 'flag', good: '+1 charge d\'ordre par vague.', bad: 'Ennemis : bouclier de 10 % de leurs PV.' },
  contrat: { id: 'contrat', name: 'CONTRAT DE FAILLE', icon: 'portal', good: 'Une Faille secondaire à chaque vague, récompenses +50 %.', bad: 'Les failles crachent 2× plus d\'ennemis, 2× plus vite.' },
};
export const ANOMALY_IDS = Object.keys(ANOMALIES) as AnomalyId[];
/** Waves before which the team chooses an anomaly. */
export function anomalyWaves(mode: GameMode, totalWaves: number): number[] {
  if (mode === 'survival') return [4, 9, 14, 19, 24, 29, 34, 39, 44, 49];
  return totalWaves <= 10 ? [3, 6, 9] : [4, 8, 12, 16, 20];
}
export function fortuneGold(wave: number) { return 60 + wave * 12; }

// ---------------------------------------------------------------- secondary rifts
export type RiftReward = 'gold' | 'ether' | 'reso' | 'rune' | 'cd';
export interface RiftRewardDef { id: RiftReward; name: string; icon: string; text: (wave: number) => string }
export const RIFT_REWARDS: Record<RiftReward, RiftRewardDef> = {
  gold: { id: 'gold', name: 'Or', icon: 'coin', text: w => `+${riftGold(w)} or` },
  ether: { id: 'ether', name: 'Éther', icon: 'ether', text: w => `+${riftEther(w)} Éther` },
  reso: { id: 'reso', name: 'Résonance', icon: 'duo', text: () => '+22 charge de Résonance' },
  rune: { id: 'rune', name: 'Rune de faille', icon: 'rune', text: () => 'Rune de faille (+35 % dégâts, +20 % cadence) sur une case de ta voie, 3 vagues' },
  cd: { id: 'cd', name: 'Pouvoirs', icon: 'bolt', text: () => 'Tous tes pouvoirs rechargés pour la prochaine vague' },
};
export const RIFT_REWARD_IDS = Object.keys(RIFT_REWARDS) as RiftReward[];
export function riftGold(w: number) { return 50 + w * 9; }
export function riftEther(w: number) { return 30 + w * 4; }
/** Units a player can assign to close their rift. */
export const RIFT_MAX_UNITS = 2;
export const RIFT_CHANCE = 0.32;
export const RIFT_SPAWN_EVERY = 5; // seconds between minions while the rift is open
export const RIFT_MINIONS = 6; // minions per wave while ignored (×2 with the CONTRAT DE FAILLE anomaly)
