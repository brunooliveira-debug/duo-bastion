// BÉNÉDICTIONS — the roguelite draft between the waves (v0.7).
// At the start of most preparation phases the duo is offered 3 random, permanent, team-wide upgrades and keeps one.
// The two players pick in turn (a human always picks over an AI partner); without a choice, fate decides when the
// wave starts. Effects are interpreted by sim/combat.ts (units, hits, kills), sim/game.ts (economy, orders) and
// sim/resonance.ts (gauge). Numbers are modest on purpose: a run stacks ~12 of them.
import type { GameMode } from '../sim/state';
import { anomalyWaves } from './tactics';

export type BlessingId =
  | 'cadence' | 'coeur' | 'rebonds' | 'primes' | 'remparts' | 'phalange' | 'trempe' | 'givre'
  | 'venin' | 'moisson' | 'harmonie' | 'discipline' | 'releve' | 'egide' | 'intendance' | 'chasse';

export interface BlessingDef {
  id: BlessingId;
  name: string;
  icon: string; // icons.ts name
  text: string; // one level
  /** how many times it can be taken (each pick adds one level) */
  max: number;
  /** rare: offered from wave RARE_WAVE only */
  rare?: boolean;
}

export const BLESSING_CHOICES = 3;
export const RARE_WAVE = 6;
/** first wave with an offer (the first preparation teaches the basics instead) */
export const FIRST_BLESSING_WAVE = 2;

// numeric effects (used by the sim and the UI)
export const BLESS = {
  cadence: 0.12, // tower attack speed per level
  coeur: 0.015, // HP/s regenerated near the Core (9 m) per level
  rebonds: 0.35, // damage of the extra bounce (ranged units)
  rebondsRange: 2.5,
  primes: 0.2, // bounty per level
  remparts: 0.1, // Core max HP per level
  phalangeHp: 0.1, phalangeArmor: 0.03, // front-line units per level
  trempe: 0.06, // damage per level
  givreSlow: 0.2, givreDur: 1, // melee hits
  venin: 0.08, veninDur: 3, // poison DPS as a fraction of the hit, per level
  moisson: 0.25, // Éther per kill
  harmonie: 0.25, // Résonance charge per level
  discipline: 1, // order charges
  releve: 0.25, releveHp: 0.3, releveDmg: 0.8, releveLife: 12, // a fallen unit may come back as a ghost
  egide: 0.08, // starting shield (fraction of max HP) per level
  intendance: 5, // gold per wave per player per level
  chasse: 0.15, // damage vs bosses / big targets per level
};

export const BLESSINGS: Record<BlessingId, BlessingDef> = {
  cadence: { id: 'cadence', name: 'Cadence des tours', icon: 'ff', max: 3, text: `Unités en tour : +${Math.round(BLESS.cadence * 100)} % de cadence.` },
  trempe: { id: 'trempe', name: 'Trempe', icon: 'sword', max: 3, text: `Toutes vos unités : +${Math.round(BLESS.trempe * 100)} % de dégâts.` },
  phalange: { id: 'phalange', name: 'Phalange', icon: 'shield', max: 2, text: `Unités de première ligne : +${Math.round(BLESS.phalangeHp * 100)} % PV et +${Math.round(BLESS.phalangeArmor * 100)} % d'armure.` },
  egide: { id: 'egide', name: 'Égide mineure', icon: 'bubble', max: 2, text: `Vos unités commencent le combat avec un bouclier de ${Math.round(BLESS.egide * 100)} % de leurs PV.` },
  remparts: { id: 'remparts', name: 'Remparts', icon: 'core', max: 3, text: `Le Core gagne +${Math.round(BLESS.remparts * 100)} % de PV max (soignés aussitôt).` },
  primes: { id: 'primes', name: 'Primes de chasse', icon: 'coin', max: 2, text: `Or gagné par élimination +${Math.round(BLESS.primes * 100)} %.` },
  intendance: { id: 'intendance', name: 'Intendance', icon: 'income', max: 3, text: `+${BLESS.intendance} or par vague pour chaque joueur.` },
  moisson: { id: 'moisson', name: "Moisson d'Éther", icon: 'ether', max: 1, text: `+1 Éther toutes les ${Math.round(1 / BLESS.moisson)} éliminations.` },
  givre: { id: 'givre', name: 'Lames de givre', icon: 'snow', max: 1, text: `Les coups au corps à corps ralentissent la cible de ${Math.round(BLESS.givreSlow * 100)} % (${BLESS.givreDur} s).` },
  venin: { id: 'venin', name: 'Venin', icon: 'claw', max: 1, text: `Chaque coup empoisonne : ${Math.round(BLESS.venin * 100)} % des dégâts par seconde pendant ${BLESS.veninDur} s (ignore l'armure).` },
  chasse: { id: 'chasse', name: 'Chasse aux colosses', icon: 'crown', max: 2, text: `+${Math.round(BLESS.chasse * 100)} % de dégâts contre les boss et les ennemis massifs.` },
  rebonds: { id: 'rebonds', name: 'Projectiles rebondissants', icon: 'bolt', max: 1, rare: true, text: `Les tirs de vos unités à distance rebondissent sur un ennemi voisin (${Math.round(BLESS.rebonds * 100)} % des dégâts).` },
  coeur: { id: 'coeur', name: 'Aura du Cœur', icon: 'heart', max: 1, rare: true, text: `Vos unités à moins de 9 m du Core régénèrent ${(BLESS.coeur * 100).toFixed(1)} % PV/s.` },
  harmonie: { id: 'harmonie', name: 'Harmonie', icon: 'duo', max: 2, rare: true, text: `Charge de Résonance +${Math.round(BLESS.harmonie * 100)} %.` },
  discipline: { id: 'discipline', name: 'Discipline', icon: 'flag', max: 1, rare: true, text: `+${BLESS.discipline} charge d'ordre tactique par vague.` },
  releve: { id: 'releve', name: 'Relève', icon: 'skull', max: 1, rare: true, text: `Une unité tombée a ${Math.round(BLESS.releve * 100)} % de chances de revenir en fantôme (${Math.round(BLESS.releveHp * 100)} % PV, ${BLESS.releveLife} s).` },
};
export const BLESSING_IDS = Object.keys(BLESSINGS) as BlessingId[];

/** Is a blessing offered before wave n? Every preparation from wave 2, except the anomaly waves (one decision at a time). */
export function blessingWave(mode: GameMode, totalWaves: number, n: number, tutorial = false) {
  if (tutorial || n < FIRST_BLESSING_WAVE) return false;
  return !anomalyWaves(mode, totalWaves).includes(n);
}

/** Levels of a blessing owned by a team. */
export function blessingLv(t: { blessings?: string[] }, id: BlessingId) {
  let n = 0;
  for (const b of t.blessings ?? []) if (b === id) n++;
  return n;
}
