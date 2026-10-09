// BÉNÉDICTIONS — the roguelite draft between the waves (v0.7).
// At the start of most preparation phases the duo is offered 3 random, permanent, team-wide upgrades and keeps one.
// The two players pick in turn (a human always picks over an AI partner); without a choice, fate decides when the
// wave starts. Effects are interpreted by sim/combat.ts (units, hits, kills), sim/game.ts (economy, orders) and
// sim/resonance.ts (gauge). Numbers are modest on purpose: a run stacks ~12 of them.
import { tr } from '../i18n';
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
  cadence: { id: 'cadence', name: tr('Cadence des tours'), icon: 'ff', max: 3, text: tr('Unités en tour : +{0} % de cadence.', Math.round(BLESS.cadence * 100)) },
  trempe: { id: 'trempe', name: tr('Trempe'), icon: 'sword', max: 3, text: tr('Toutes vos unités : +{0} % de dégâts.', Math.round(BLESS.trempe * 100)) },
  phalange: { id: 'phalange', name: tr('Phalange'), icon: 'shield', max: 2, text: tr('Unités de première ligne : +{0} % PV et +{1} % d\'armure.', Math.round(BLESS.phalangeHp * 100), Math.round(BLESS.phalangeArmor * 100)) },
  egide: { id: 'egide', name: tr('Égide mineure'), icon: 'bubble', max: 2, text: tr('Vos unités commencent le combat avec un bouclier de {0} % de leurs PV.', Math.round(BLESS.egide * 100)) },
  remparts: { id: 'remparts', name: tr('Remparts'), icon: 'core', max: 3, text: tr('Le Core gagne +{0} % de PV max (soignés aussitôt).', Math.round(BLESS.remparts * 100)) },
  primes: { id: 'primes', name: tr('Primes de chasse'), icon: 'coin', max: 2, text: tr('Or gagné par élimination +{0} %.', Math.round(BLESS.primes * 100)) },
  intendance: { id: 'intendance', name: tr('Intendance'), icon: 'income', max: 3, text: tr('+{0} or par vague pour chaque joueur.', BLESS.intendance) },
  moisson: { id: 'moisson', name: tr('Moisson d\'Éther'), icon: 'ether', max: 1, text: tr('+1 Éther toutes les {0} éliminations.', Math.round(1 / BLESS.moisson)) },
  givre: { id: 'givre', name: tr('Lames de givre'), icon: 'snow', max: 1, text: tr('Les coups au corps à corps ralentissent la cible de {0} % ({1} s).', Math.round(BLESS.givreSlow * 100), BLESS.givreDur) },
  venin: { id: 'venin', name: tr('Venin'), icon: 'claw', max: 1, text: tr('Chaque coup empoisonne : {0} % des dégâts par seconde pendant {1} s (ignore l\'armure).', Math.round(BLESS.venin * 100), BLESS.veninDur) },
  chasse: { id: 'chasse', name: tr('Chasse aux colosses'), icon: 'crown', max: 2, text: tr('+{0} % de dégâts contre les boss et les ennemis massifs.', Math.round(BLESS.chasse * 100)) },
  rebonds: { id: 'rebonds', name: tr('Projectiles rebondissants'), icon: 'bolt', max: 1, rare: true, text: tr('Les tirs de vos unités à distance rebondissent sur un ennemi voisin ({0} % des dégâts).', Math.round(BLESS.rebonds * 100)) },
  coeur: { id: 'coeur', name: tr('Aura du Cœur'), icon: 'heart', max: 1, rare: true, text: tr('Vos unités à moins de 9 m du Core régénèrent {0} % PV/s.', (BLESS.coeur * 100).toFixed(1)) },
  harmonie: { id: 'harmonie', name: tr('Harmonie'), icon: 'duo', max: 2, rare: true, text: tr('Charge de Résonance +{0} %.', Math.round(BLESS.harmonie * 100)) },
  discipline: { id: 'discipline', name: tr('Discipline'), icon: 'flag', max: 1, rare: true, text: tr('+{0} charge d\'ordre tactique par vague.', BLESS.discipline) },
  releve: { id: 'releve', name: tr('Relève'), icon: 'skull', max: 1, rare: true, text: tr('Une unité tombée a {0} % de chances de revenir en fantôme ({1} % PV, {2} s).', Math.round(BLESS.releve * 100), Math.round(BLESS.releveHp * 100), BLESS.releveLife) },
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
