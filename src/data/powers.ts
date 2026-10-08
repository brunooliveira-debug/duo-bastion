// Commander powers (3 per army): active during combat, cooldown-limited, upgradable with Ether.
// Effects are interpreted by sim/combat.ts castPower().
import type { FactionId } from './types';

export type PowerEffect =
  | 'freeze' | 'starfall' | 'comet'
  | 'overdrive' | 'missiles' | 'emp'
  | 'heal' | 'roots' | 'forest'
  | 'bubble' | 'tide' | 'krakenCall'
  | 'fervor' | 'eruption' | 'sunstrike'
  | 'veil' | 'harvest' | 'doom';

export interface FactionPower {
  id: PowerEffect;
  name: string;
  icon: string; // icons.ts name
  text: string;
  cooldown: number; // seconds of combat
  unlockWave: number; // in a 21-wave game
}

export const POWER_MAX_LEVEL = 3;
/** Ether to reach power level 2 and 3. */
export const POWER_UP_COST = [0, 0, 45, 90];
/** effect multiplier and cooldown multiplier per power level */
export const POWER_LEVEL_FX = [0, 1, 1.45, 1.9];
export const POWER_LEVEL_CD = [0, 1, 0.88, 0.76];

export const FACTION_POWERS: Record<FactionId, [FactionPower, FactionPower, FactionPower]> = {
  astreens: [
    { id: 'freeze', name: 'Gel Stellaire', icon: 'snow', text: 'Gèle tous les ennemis de ta voie pendant 2,6 s.', cooldown: 35, unlockWave: 1 },
    { id: 'starfall', name: 'Pluie d\'Étoiles', icon: 'star', text: 'Frappe les 5 ennemis les plus robustes et les ralentit de 50 % (5 s).', cooldown: 45, unlockWave: 3 },
    { id: 'comet', name: 'Comète', icon: 'comet', text: 'Une comète s\'écrase sur le plus gros groupe ennemi.', cooldown: 75, unlockWave: 6 },
  ],
  rouages: [
    { id: 'overdrive', name: 'Surcharge', icon: 'bolt', text: '+60 % vitesse d\'attaque pendant 9 s.', cooldown: 30, unlockWave: 1 },
    { id: 'missiles', name: 'Pluie de Missiles', icon: 'missile', text: '10 missiles sur des ennemis au hasard de ta voie.', cooldown: 45, unlockWave: 3 },
    { id: 'emp', name: 'IEM', icon: 'emp', text: 'Étourdit toute la voie 3,5 s et détruit les boucliers ennemis.', cooldown: 75, unlockWave: 6 },
  ],
  ronces: [
    { id: 'heal', name: 'Sève Vitale', icon: 'leafheal', text: 'Soigne toutes tes unités de 35 % de leurs PV.', cooldown: 30, unlockWave: 1 },
    { id: 'roots', name: 'Étreinte des Racines', icon: 'roots', text: 'Immobilise ta voie 3,5 s et empoisonne les ennemis (6 s).', cooldown: 45, unlockWave: 3 },
    { id: 'forest', name: 'Colère de la Forêt', icon: 'tree', text: 'Invoque un Gardien Sylvestre temporaire (30 s).', cooldown: 75, unlockWave: 6 },
  ],
  abysses: [
    { id: 'bubble', name: 'Bulle Protectrice', icon: 'bubble', text: 'Bouclier de 25 % des PV sur toutes tes unités.', cooldown: 30, unlockWave: 1 },
    { id: 'tide', name: 'Raz-de-Marée', icon: 'wave', text: 'Repousse les ennemis de 4 m et les ralentit de 50 % (6 s).', cooldown: 45, unlockWave: 3 },
    { id: 'krakenCall', name: 'Appel du Kraken', icon: 'tentacle', text: 'Un tentacule géant surgit 18 s : étreint et écrase.', cooldown: 75, unlockWave: 6 },
  ],
  solaires: [
    { id: 'fervor', name: 'Ferveur', icon: 'flame', text: '+40 % vitesse d\'attaque et +20 % dégâts pendant 9 s.', cooldown: 30, unlockWave: 1 },
    { id: 'eruption', name: 'Éruption Solaire', icon: 'volcano', text: 'Embrase tous les ennemis de ta voie (8 s).', cooldown: 45, unlockWave: 3 },
    { id: 'sunstrike', name: 'Frappe Solaire', icon: 'sun', text: 'Rayon céleste sur l\'ennemi le plus robuste : dégâts massifs + explosion.', cooldown: 75, unlockWave: 6 },
  ],
  necrose: [
    { id: 'veil', name: 'Voile d\'Ombre', icon: 'eye', text: 'Camoufle tes unités 8 s : leurs prochains coups sont des embuscades.', cooldown: 30, unlockWave: 1 },
    { id: 'harvest', name: 'Moisson des Ombres', icon: 'skull', text: 'Relève 5 squelettes et donne 30 % de vol de vie (12 s).', cooldown: 45, unlockWave: 3 },
    { id: 'doom', name: 'Sentence', icon: 'scythe', text: 'Les ennemis sous 25 % PV meurent, les autres perdent 12 % de leurs PV.', cooldown: 75, unlockWave: 6 },
  ],
};

export function powerUnlock(p: FactionPower, totalWaves: number) { return totalWaves <= 10 ? Math.ceil(p.unlockWave * 0.55) : p.unlockWave; }
