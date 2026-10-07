// Synergies between ADJACENT units on the grid (8-neighbourhood), placement zones and rune tiles.
// Everything is visible in the UI before combat, so composition and placement are real decisions.
import { UNITS } from './units';

export type SynergyId =
  | 'reparation' | 'commandement' | 'conduction' | 'guetteur' | 'coordonnees' | 'phalange'
  | 'escouade' | 'embrasement' | 'ombres' | 'constellation' | 'seve';

export interface SynergyDef { id: SynergyId; name: string; icon: string; text: string }
export const SYNERGIES: Record<SynergyId, SynergyDef> = {
  reparation: { id: 'reparation', name: 'Réparation', icon: 'heart', text: 'Défenseur + Soutien voisins : le défenseur régénère 1,5 % PV/s.' },
  commandement: { id: 'commandement', name: 'Commandement', icon: 'sword', text: 'Soutien + Mêlée voisins : la mêlée gagne +15 % de cadence.' },
  conduction: { id: 'conduction', name: 'Conduction', icon: 'bolt', text: 'Électrique + Aquatique voisins : l\'électrique gagne +25 % de dégâts.' },
  guetteur: { id: 'guetteur', name: 'Guetteur', icon: 'eye', text: 'Tireur + Défenseur voisins : le tireur gagne +0,8 m de portée.' },
  coordonnees: { id: 'coordonnees', name: 'Coordonnées', icon: 'target', text: 'Zone + Rapide voisins : la zone gagne +20 % de dégâts.' },
  phalange: { id: 'phalange', name: 'Phalange', icon: 'shield', text: 'Deux défenseurs voisins : -10 % dégâts subis chacun.' },
  escouade: { id: 'escouade', name: 'Escouade', icon: 'users', text: 'Deux unités identiques voisines : +10 % dégâts chacune.' },
  embrasement: { id: 'embrasement', name: 'Embrasement', icon: 'flame', text: 'Deux unités de feu voisines : brûlures +30 %.' },
  ombres: { id: 'ombres', name: 'Ombres jumelles', icon: 'dagger', text: 'Deux unités d\'ombre voisines : +12 % de chances de critique.' },
  constellation: { id: 'constellation', name: 'Constellation', icon: 'star', text: 'Deux unités stellaires voisines : +10 % de cadence.' },
  seve: { id: 'seve', name: 'Sève partagée', icon: 'leafheal', text: 'Deux unités végétales voisines : régénèrent 1 % PV/s.' },
};

export type Zone = 'front' | 'mid' | 'back';
/** cols 0–3 (spawn side) = front line, 8–11 = back line. */
export function zoneOf(col: number): Zone { return col <= 3 ? 'front' : col >= 8 ? 'back' : 'mid'; }
export const ZONE_TEXT: Record<Zone, string> = {
  front: 'Première ligne : défenseurs +15 % PV.',
  mid: 'Centre : idéal pour les soutiens et la zone.',
  back: 'Arrière : unités à distance +0,6 m de portée.',
};

export type RuneKind = 'force' | 'vigueur' | 'celerite' | 'instable' | 'faille';
export const RUNES: Record<RuneKind, { name: string; text: string; color: number }> = {
  force: { name: 'Rune de Force', text: '+20 % dégâts', color: 0xff6a4a },
  vigueur: { name: 'Rune de Vigueur', text: '+25 % PV', color: 0x6aff8a },
  celerite: { name: 'Rune de Célérité', text: '+20 % cadence', color: 0x6ad8ff },
  instable: { name: 'Rune Instable', text: '+50 % dégâts, +30 % cadence', color: 0xff4aff },
  faille: { name: 'Rune de Faille', text: '+35 % dégâts, +20 % cadence', color: 0xc07aff },
};
/** until: last wave of a temporary rune (anomaly / rift reward). */
export interface RuneTile { col: number; row: number; kind: RuneKind; until?: number }

// ---------------------------------------------------------------- tags
const ELEMENT: Record<string, string> = { water: 'water', fire: 'fire', lightning: 'lightning', poison: 'poison', shadow: 'shadow', star: 'star', leaf: 'leaf', spark: 'spark', shell: 'spark', note: 'star' };
export function element(id: string) { return ELEMENT[UNITS[id].fx] ?? ''; }
export function isFrontUnit(id: string) { const u = UNITS[id]; return u.category === 'defense' || u.category === 'lourde' || u.roles.includes('tank'); }
export function isSupportUnit(id: string) { return UNITS[id].category === 'soutien'; }
export function isMeleeUnit(id: string) { return UNITS[id].range < 2 && !isFrontUnit(id); }
export function isRangedUnit(id: string) { return UNITS[id].range > 2 && UNITS[id].category !== 'soutien'; }
export function isZoneUnit(id: string) { const u = UNITS[id]; return u.category === 'zone' || u.abilities.some(a => a.kind === 'splash' || a.kind === 'poison'); }
export function isFastUnit(id: string) { return UNITS[id].category === 'rapide'; }
/** "Electric" units for Conduction: chain attackers + lightning fx. */
function isElectric(id: string) { const u = UNITS[id]; return u.fx === 'lightning' || u.abilities.some(a => a.kind === 'chain'); }

/** Synergies granted to `a` by its neighbour `b`. */
export function pairSynergies(a: string, b: string): SynergyId[] {
  const out: SynergyId[] = [];
  if (isFrontUnit(a) && isSupportUnit(b)) out.push('reparation');
  if (isMeleeUnit(a) && isSupportUnit(b)) out.push('commandement');
  if (isElectric(a) && element(b) === 'water') out.push('conduction');
  if (isRangedUnit(a) && isFrontUnit(b)) out.push('guetteur');
  if (isZoneUnit(a) && isFastUnit(b)) out.push('coordonnees');
  if (isFrontUnit(a) && isFrontUnit(b)) out.push('phalange');
  if (a === b) out.push('escouade');
  const ea = element(a);
  if (ea && ea === element(b)) {
    if (ea === 'fire') out.push('embrasement');
    if (ea === 'shadow') out.push('ombres');
    if (ea === 'star') out.push('constellation');
    if (ea === 'leaf') out.push('seve');
  }
  return out;
}
