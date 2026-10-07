// MODULES DU BASTION — the shared Core becomes the team's third build.
// 3 slots, 4 families, 3 levels per module. Installing / upgrading costs Éther and is a JOINT decision:
// one player proposes (and pays), the partner validates (and co-finances half if they can) or refuses.
// Without an answer, the proposal is accepted automatically after PROPOSAL_TIMEOUT seconds (AI partners answer at once).
// Effects are interpreted by sim/combat.ts (Core) and sim/game.ts (economy).

export type ModuleFamily = 'defense' | 'artillerie' | 'soutien' | 'controle';
export type ModuleId =
  | 'rempart' | 'egide' | 'restauration'
  | 'canon' | 'rayon' | 'orage' | 'onde'
  | 'cadence' | 'forge' | 'tresor'
  | 'givre' | 'portail' | 'entrave';

export interface ModuleDef {
  id: ModuleId;
  family: ModuleFamily;
  name: string;
  icon: string; // icons.ts name
  levels: [string, string, string]; // what each level does
  costs: [number, number, number]; // Éther to install (level 1) then to reach levels 2 and 3
}

export const MODULE_SLOTS = 3;
export const PROPOSAL_TIMEOUT = 15;
/** Refund when dismantling a module (fraction of the Éther invested). */
export const MODULE_REFUND = 0.5;

export const FAMILY_NAMES: Record<ModuleFamily, string> = { defense: 'Défense', artillerie: 'Artillerie', soutien: 'Soutien', controle: 'Contrôle' };
export const FAMILY_COLORS: Record<ModuleFamily, string> = { defense: '#8fb8ff', artillerie: '#ff8a5a', soutien: '#7dffb0', controle: '#c8a0ff' };

export const MODULES: Record<ModuleId, ModuleDef> = {
  // ---- DÉFENSE
  rempart: { id: 'rempart', family: 'defense', name: 'Rempart', icon: 'shield', costs: [35, 60, 95],
    levels: ['Le Core subit -12 % de dégâts de fuite.', '-20 % de dégâts de fuite.', '-28 % de dégâts de fuite.'] },
  egide: { id: 'egide', family: 'defense', name: 'Égide', icon: 'bubble', costs: [40, 65, 100],
    levels: ['Bouclier de 250 PV sur le Core à chaque vague.', 'Bouclier de 450 PV.', 'Bouclier de 700 PV.'] },
  restauration: { id: 'restauration', family: 'defense', name: 'Restauration', icon: 'heart', costs: [30, 55, 85],
    levels: ['+90 PV rendus au Core après chaque vague.', '+170 PV par vague.', '+260 PV par vague, et +5 % des PV max si aucune fuite.'] },
  // ---- ARTILLERIE
  canon: { id: 'canon', family: 'artillerie', name: 'Canon du Bastion', icon: 'cannon', costs: [35, 60, 95],
    levels: ['Tirs du Core +40 % dégâts.', '+80 % dégâts, portée +1 m.', '+130 % dégâts, portée +2 m.'] },
  rayon: { id: 'rayon', family: 'artillerie', name: 'Rayon Prismatique', icon: 'beam', costs: [45, 75, 110],
    levels: ['Toutes les 6 s, un rayon frappe l\'ennemi le plus robuste à 13 m.', 'Rayon plus puissant (+70 %).', 'Rayon toutes les 4 s, +140 %.'] },
  orage: { id: 'orage', family: 'artillerie', name: 'Chaîne d\'Orage', icon: 'bolt', costs: [40, 65, 100],
    levels: ['Les tirs du Core rebondissent sur 2 ennemis.', '3 rebonds.', '4 rebonds, rebonds à 70 %.'] },
  onde: { id: 'onde', family: 'artillerie', name: 'Onde Bastion', icon: 'pulse', costs: [45, 75, 115],
    levels: ['Choc de zone (5 m) toutes les 7 s.', 'Choc plus puissant, 6 m.', 'Choc dévastateur, 7 m, toutes les 5 s.'] },
  // ---- SOUTIEN
  cadence: { id: 'cadence', family: 'soutien', name: 'Aura de Cadence', icon: 'ff', costs: [40, 65, 100],
    levels: ['Unités de l\'arrière-ligne : +10 % cadence.', '+18 % cadence.', '+26 % cadence et +10 % portée.'] },
  forge: { id: 'forge', family: 'soutien', name: 'Forge d\'Éther', icon: 'ether', costs: [30, 50, 80],
    levels: ['+1 Éther / 10 s pour chaque joueur.', '+2 Éther / 10 s.', '+3 Éther / 10 s.'] },
  tresor: { id: 'tresor', family: 'soutien', name: 'Trésor du Bastion', icon: 'coin', costs: [35, 60, 90],
    levels: ['+8 or par vague pour chaque joueur.', '+16 or par vague.', '+26 or par vague.'] },
  // ---- CONTRÔLE
  givre: { id: 'givre', family: 'controle', name: 'Champ de Givre', icon: 'snow', costs: [35, 60, 95],
    levels: ['Ennemis à moins de 8 m du Core : -25 % vitesse.', '-35 %.', '-45 %, et 10 m.'] },
  portail: { id: 'portail', family: 'controle', name: 'Portail de Repli', icon: 'portal', costs: [50, 80, 120],
    levels: ['1 fois par vague : le premier ennemi qui fuit est renvoyé au début de la voie.', '2 fois par vague.', '3 fois par vague, l\'ennemi renvoyé est ralenti.'] },
  entrave: { id: 'entrave', family: 'controle', name: 'Entrave', icon: 'chain', costs: [45, 75, 110],
    levels: ['Toutes les 14 s, étourdit le boss le plus proche (1,2 s) et interrompt sa capacité.', 'Toutes les 11 s, 1,6 s.', 'Toutes les 8 s, 2 s.'] },
};
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];
export const FAMILY_OF = (id: string) => MODULES[id as ModuleId]?.family;

/** Ether to reach `lv` (1 = install). */
export function moduleCost(id: ModuleId, lv: number) { return MODULES[id].costs[lv - 1] ?? Infinity; }
/** Total Ether invested in a module at a level. */
export function moduleValue(id: ModuleId, lv: number) { let t = 0; for (let l = 1; l <= lv; l++) t += moduleCost(id, l); return t; }

// numeric effects (used by the sim and the UI)
export const MOD = {
  rempart: [0, 0.12, 0.2, 0.28],
  egide: [0, 250, 450, 700],
  restauration: [0, 90, 170, 260],
  canon: [0, 0.4, 0.8, 1.3],
  canonRange: [0, 0, 1, 2],
  rayonDmg: [0, 140, 240, 340], // × wave toughness
  rayonEvery: [0, 6, 6, 4],
  orage: [0, 2, 3, 4],
  orageFall: [0, 0.55, 0.6, 0.7],
  ondeDmg: [0, 160, 260, 380],
  ondeR: [0, 5, 6, 7],
  ondeEvery: [0, 7, 7, 5],
  cadence: [0, 0.1, 0.18, 0.26],
  forge: [0, 0.1, 0.2, 0.3], // ether / s
  tresor: [0, 8, 16, 26],
  givre: [0, 0.25, 0.35, 0.45],
  givreR: [0, 8, 8, 10],
  portail: [0, 1, 2, 3],
  entraveEvery: [0, 14, 11, 8],
  entraveStun: [0, 1.2, 1.6, 2],
};
