// Commander powers (3 per army): active during combat, cooldown-limited, upgradable with Ether.
// Effects are interpreted by sim/combat.ts castPower().
import { tr } from '../i18n';
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
    { id: 'freeze', name: tr('Gel Stellaire'), icon: 'snow', text: tr('Gèle tous les ennemis de ta voie pendant 2,6 s.'), cooldown: 35, unlockWave: 1 },
    { id: 'starfall', name: tr('Pluie d\'Étoiles'), icon: 'star', text: tr('Frappe les 5 ennemis les plus robustes et les ralentit de 50 % (5 s).'), cooldown: 45, unlockWave: 3 },
    { id: 'comet', name: tr('Comète'), icon: 'comet', text: tr('Une comète s\'écrase sur le plus gros groupe ennemi.'), cooldown: 75, unlockWave: 6 },
  ],
  rouages: [
    { id: 'overdrive', name: tr('Surcharge'), icon: 'bolt', text: tr('+60 % vitesse d\'attaque pendant 9 s.'), cooldown: 30, unlockWave: 1 },
    { id: 'missiles', name: tr('Pluie de Missiles'), icon: 'missile', text: tr('10 missiles sur des ennemis au hasard de ta voie.'), cooldown: 45, unlockWave: 3 },
    { id: 'emp', name: tr('IEM'), icon: 'emp', text: tr('Étourdit toute la voie 3,5 s et détruit les boucliers ennemis.'), cooldown: 75, unlockWave: 6 },
  ],
  ronces: [
    { id: 'heal', name: tr('Sève Vitale'), icon: 'leafheal', text: tr('Soigne toutes tes unités de 35 % de leurs PV.'), cooldown: 30, unlockWave: 1 },
    { id: 'roots', name: tr('Étreinte des Racines'), icon: 'roots', text: tr('Immobilise ta voie 3,5 s et empoisonne les ennemis (6 s).'), cooldown: 45, unlockWave: 3 },
    { id: 'forest', name: tr('Colère de la Forêt'), icon: 'tree', text: tr('Invoque un Gardien Sylvestre temporaire (30 s).'), cooldown: 75, unlockWave: 6 },
  ],
  abysses: [
    { id: 'bubble', name: tr('Bulle Protectrice'), icon: 'bubble', text: tr('Bouclier de 25 % des PV sur toutes tes unités.'), cooldown: 30, unlockWave: 1 },
    { id: 'tide', name: tr('Raz-de-Marée'), icon: 'wave', text: tr('Repousse les ennemis de 4 m et les ralentit de 50 % (6 s).'), cooldown: 45, unlockWave: 3 },
    { id: 'krakenCall', name: tr('Appel du Kraken'), icon: 'tentacle', text: tr('Un tentacule géant surgit 18 s : étreint et écrase.'), cooldown: 75, unlockWave: 6 },
  ],
  solaires: [
    { id: 'fervor', name: tr('Ferveur'), icon: 'flame', text: tr('+40 % vitesse d\'attaque et +20 % dégâts pendant 9 s.'), cooldown: 30, unlockWave: 1 },
    { id: 'eruption', name: tr('Éruption Solaire'), icon: 'volcano', text: tr('Embrase tous les ennemis de ta voie (8 s).'), cooldown: 45, unlockWave: 3 },
    { id: 'sunstrike', name: tr('Frappe Solaire'), icon: 'sun', text: tr('Rayon céleste sur l\'ennemi le plus robuste : dégâts massifs + explosion.'), cooldown: 75, unlockWave: 6 },
  ],
  necrose: [
    { id: 'veil', name: tr('Voile d\'Ombre'), icon: 'eye', text: tr('Camoufle tes unités 8 s : leurs prochains coups sont des embuscades.'), cooldown: 30, unlockWave: 1 },
    { id: 'harvest', name: tr('Moisson des Ombres'), icon: 'skull', text: tr('Relève 5 squelettes et donne 30 % de vol de vie (12 s).'), cooldown: 45, unlockWave: 3 },
    { id: 'doom', name: tr('Sentence'), icon: 'scythe', text: tr('Les ennemis sous 25 % PV meurent, les autres perdent 12 % de leurs PV.'), cooldown: 75, unlockWave: 6 },
  ],
};

export function powerUnlock(p: FactionPower, totalWaves: number) { return totalWaves <= 10 ? Math.ceil(p.unlockWave * 0.55) : p.unlockWave; }
