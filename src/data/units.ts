import { tr } from '../i18n';
import type { UnitDef, FactionId, FactionDef, Ability, Branch, UnitCategory } from './types';

// Six playable armies × six units. Every unit levels 1 → 5; at level 4 it specialises into branch A or B (permanent).
// cost = gold to build at level 1. Level-up prices and stat growth are in LEVEL_* below.

export const FACTIONS: Record<FactionId, FactionDef> = {
  astreens: {
    id: 'astreens', name: tr('Ordre Astral'), title: tr('Précision'), color: '#7fb4ff',
    lore: tr('Chevaliers-cartographes des constellations brisées.'),
    style: tr('Frappe de loin, ralentit et achève. Récompense le placement soigné.'),
    strengths: [tr('Très longue portée'), tr('Ralentissements + bonus contre les ralentis'), tr('Anti-boss (Lancière)')],
    weaknesses: [tr('Ligne de front fragile'), tr('Peu de dégâts de zone'), tr('Souffre contre les nuées rapides')],
    doctrine: { name: tr('Coordination'), text: tr('Les tirs à distance de l\'Ordre marquent leur cible : +10 % de dégâts subis de toutes les sources (3 s).') },
    help: { name: tr('Repérage'), text: tr('En aidant la voie partenaire, la marque monte à +20 % : ton allié en profite aussi.') },
    units: ['gardien_stellaire', 'loup_astral', 'tireuse_etoile', 'lanciere_eclair', 'harmoniste', 'astromancienne'],
  },
  rouages: {
    id: 'rouages', name: tr('Concordat des Rouages'), title: tr('Forteresse'), color: '#f0b04a',
    lore: tr('Machines conscientes forgées dans le métal des étoiles mortes.'),
    style: tr('Blindage, artillerie lourde et étourdissements. Lent mais inébranlable.'),
    strengths: [tr('Unités très résistantes (Blindées)'), tr('Artillerie de zone à 8 m'), tr('Étourdissements')],
    weaknesses: [tr('Cher et lent à démarrer'), tr('Vulnérable aux attaques Énergie / Arcane'), tr('Peu de soins')],
    doctrine: { name: tr('Optimisation'), text: tr('Améliorations 10 % moins chères. Les unités en tour tirent 10 % plus vite.') },
    help: { name: tr('Réparation'), text: tr('Chaque ennemi éliminé dans la voie partenaire ou près du Core répare le Core (+0,4 % PV, 4 % max par vague).') },
    units: ['ferraille', 'foreuse', 'bombardiere', 'colosse_forge', 'mecanicienne', 'exarque_prisme'],
  },
  ronces: {
    id: 'ronces', name: tr('Les Ronces'), title: tr('Prolifération'), color: '#6fdc7a',
    lore: tr('Bêtes et guerriers nés de la forêt-qui-marche.'),
    style: tr('Poison qui ignore l\'armure, régénération, pousses invoquées et tireuse camouflée.'),
    strengths: [tr('Poison : ignore l\'armure'), tr('Régénération et invocations'), tr('Embuscades camouflées')],
    weaknesses: [tr('Dégâts lents à monter'), tr('Organiques : craint Physique et Perforant'), tr('Faible burst contre les boss')],
    doctrine: { name: tr('Croissance'), text: tr('Chaque vague survécue sur le terrain : +3 % PV max pour l\'unité (jusqu\'à +24 %).') },
    help: { name: tr('Sève partagée'), text: tr('En aidant, tes unités laissent une zone de régénération : alliés proches +3 % PV/s pendant 3 s.') },
    units: ['gardien_ecorce', 'lame_ronce', 'rodeuse', 'semeuse', 'druidesse', 'ancien_racine'],
  },
  abysses: {
    id: 'abysses', name: tr('Marée Abyssale'), title: tr('Contrôle'), color: '#3fd0c9',
    lore: tr('Colosses venus des fosses où dort la lumière.'),
    style: tr('Ralentit, étourdit et protège. Les vagues se brisent sur tes colosses.'),
    strengths: [tr('Ralentissements et étourdissements'), tr('Boucliers de groupe'), tr('Excellents contre les rapides')],
    weaknesses: [tr('Dégâts modestes'), tr('Lent à tuer les boss'), tr('Mystiques : craint l\'Arcane')],
    doctrine: { name: tr('Pression des fonds'), text: tr('Ennemis de ta voie 8 % plus lents. Tes unités gagnent +1 % de dégâts par seconde de combat (max +25 %).') },
    help: { name: tr('Courant'), text: tr('En aidant, tes coups trempent la cible (4 s) : ralentie de 15 %, elle subit +30 % des éclairs et rebonds.') },
    units: ['carapace_abysses', 'ondin', 'harponneuse', 'meduse', 'pretresse', 'kraken'],
  },
  solaires: {
    id: 'solaires', name: tr('Brasier Solaire'), title: tr('Embrasement'), color: '#ff7a3d',
    lore: tr('Mages qui enferment des soleils dans le verre.'),
    style: tr('Feu sur la durée, explosions et zone massive. Puissant mais fragile.'),
    strengths: [tr('Brûlures sur la durée'), tr('Énormes dégâts de zone'), tr('Accélération des alliés')],
    weaknesses: [tr('Unités fragiles'), tr('Coûteux'), tr('Dépend de sa Paladine pour tenir la ligne')],
    doctrine: { name: tr('Ferveur'), text: tr('Tes unités sous 50 % PV infligent +20 % de dégâts. Un ennemi qui meurt en brûlant explose (1,6 m).') },
    help: { name: tr('Étincelle'), text: tr('En aidant, tes coups embrasent la cible pendant 3 s.') },
    units: ['paladin_aube', 'danse_flamme', 'arbaletriere', 'oracle_braise', 'vestale', 'elementaire'],
  },
  necrose: {
    id: 'necrose', name: tr('Voile Nécrose'), title: tr('Ombres'), color: '#c48bff',
    lore: tr('Ombres liées à des serments éteints.'),
    style: tr('Invocations gratuites, assassins camouflés, vol de vie et exécutions.'),
    strengths: [tr('Invocations de squelettes'), tr('Camouflage et embuscades'), tr('Exécute les ennemis affaiblis')],
    weaknesses: [tr('Peu de vrais tanks'), tr('Invocations fragiles face à la zone'), tr('Unités légères')],
    doctrine: { name: tr('Pacte & Moisson'), text: tr('Chaque ennemi éliminé renforce tes ombres (+2 % dégâts, max +30 %, jusqu\'à la fin de la vague). Une unité qui tombe a 35 % de chances de se relever en squelette.') },
    help: { name: tr('Âmes errantes'), text: tr('Un ennemi tué dans la voie partenaire a 30 % de chances de se relever en squelette allié.') },
    units: ['garde_os', 'spectre_vif', 'archere_cendres', 'pestifere', 'invocatrice', 'abomination'],
  },
};
export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

export const CATEGORY_NAMES: Record<UnitCategory, string> = {
  defense: tr('Défense'), lourde: tr('Lourde'), portee: tr('Longue portée'), antiblindage: tr('Anti-blindage'),
  zone: tr('Zone'), soutien: tr('Soutien'), rapide: tr('Rapide'), speciale: tr('Spéciale'),
};
export const CATEGORY_COLORS: Record<UnitCategory, string> = {
  defense: '#8fb8ff', lourde: '#c9a46a', portee: '#7dffb0', antiblindage: '#ffd27a',
  zone: '#ff8a5a', soutien: '#9fffe0', rapide: '#ff9ad6', speciale: '#c48bff',
};

type U = Omit<UnitDef, 'tier' | 'skillText' | 'sfx'> & { tier?: number; skillText?: string; sfx?: string };
function def(u: U): UnitDef { return { tier: 1, skillText: '—', sfx: u.fx, ...u }; }

export const UNITS: Record<string, UnitDef> = {
  // ======================================================== ORDRE ASTRAL
  gardien_stellaire: def({
    id: 'gardien_stellaire', name: tr('Gardien Stellaire'), faction: 'astreens', category: 'defense', cost: 70,
    hp: 600, armor: 0.2, dmg: 14, atkSpeed: 0.9, range: 1.1, moveSpeed: 2.1, attack: 'phys', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'slowOnHit', slow: 0.2, duration: 1.5 }],
    description: tr('Chevalier au bouclier d\'étoile gelée.'), passiveText: tr('Provocation (3 m). Ses coups ralentissent de 20 %.'),
    pros: tr('Fixe les ennemis et prépare les bonus « contre les ralentis ».'), cons: tr('Peu de dégâts.'),
    branches: [
      { name: tr('Rempart Céleste'), text: tr('+30 % PV, +10 % armure, aura : alliés proches -15 % dégâts subis.'), hp: 1.3, dmg: 0.8, armor: 0.1, add: [{ kind: 'guardAura', radius: 2.5, pct: 0.15 }], accent: 0xdff0ff },
      { name: tr('Lame d\'Orion'), text: tr('+50 % dégâts, +20 % cadence, achève les ennemis affaiblis.'), hp: 0.8, dmg: 1.5, atkSpeed: 1.2, add: [{ kind: 'execute', threshold: 0.3, pct: 0.5 }], accent: 0xffe08a },
    ],
    model: { shape: 'paladin', color: 0x4f7fd8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'metal',
  }),
  loup_astral: def({
    id: 'loup_astral', name: tr('Loup Astral'), faction: 'astreens', category: 'rapide', cost: 65,
    hp: 330, armor: 0, dmg: 18, atkSpeed: 1.3, range: 1.1, moveSpeed: 5, attack: 'perf', defense: 'leg', roles: ['dps', 'assassin'],
    abilities: [{ kind: 'interceptor', radius: 10 }, { kind: 'bonusVsDef', def: 'leg', pct: 0.25 }],
    description: tr('Prédateur stellaire qui traque les fuyards.'), passiveText: tr('Chasseur : poursuit en priorité les ennemis rapides et ceux qui filent vers le Core. +25 % contre Légers.'),
    pros: tr('Rattrape les fuites, idéal contre les Coureurs.'), cons: tr('Fragile au corps à corps prolongé.'),
    branches: [
      { name: tr('Loup-Comète'), text: tr('+30 % dégâts, +20 % vitesse, vol de vie 15 %.'), dmg: 1.3, moveSpeed: 1.2, add: [{ kind: 'lifesteal', pct: 0.15 }], color: 0x6a8aff, accent: 0xffffff },
      { name: tr('Alpha Stellaire'), text: tr('+40 % PV, aura de meute : +20 % vitesse d\'attaque aux alliés proches.'), hp: 1.4, add: [{ kind: 'auraAttackSpeed', radius: 2.5, pct: 0.2 }], color: 0x3a5aa8, accent: 0xbfe0ff },
    ],
    model: { shape: 'wolf', color: 0x5a7ad8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'slash',
  }),
  tireuse_etoile: def({
    id: 'tireuse_etoile', name: tr('Tireuse d\'Étoiles'), faction: 'astreens', category: 'portee', cost: 90, tower: 'archer',
    hp: 230, armor: 0, dmg: 25, atkSpeed: 1.1, range: 5.5, moveSpeed: 2.4, attack: 'perf', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsSlowed', pct: 0.3 }],
    description: tr('Archère qui tire des éclats de constellation.'), passiveText: tr('Marque stellaire : +30 % dégâts contre les ennemis ralentis.'),
    pros: tr('Longue portée, excellent rapport dégâts/prix.'), cons: tr('Très fragile si la ligne cède.'),
    branches: [
      { name: tr('Chasseresse Nova'), text: tr('+30 % dégâts, +1 m portée, +30 % contre les ennemis < 30 % PV.'), dmg: 1.3, range: 1, add: [{ kind: 'execute', threshold: 0.3, pct: 0.3 }], color: 0x3a6ee8, accent: 0xffffff },
      { name: tr('Pluie d\'Argent'), text: tr('Flèches multiples : touche aussi les ennemis autour de la cible (45 %).'), dmg: 0.95, add: [{ kind: 'splash', radius: 1.3, pct: 0.45 }], color: 0x8aa8e8, accent: 0xe8f0ff },
    ],
    model: { shape: 'archer', color: 0x4f7fd8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'arrow',
  }),
  lanciere_eclair: def({
    id: 'lanciere_eclair', name: tr('Lancière d\'Éclair'), faction: 'astreens', category: 'antiblindage', cost: 110, tower: 'spire',
    hp: 270, armor: 0.05, dmg: 44, atkSpeed: 0.7, range: 4.5, moveSpeed: 2.3, attack: 'ener', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsBig', pct: 0.5 }, { kind: 'pierce', pct: 0.4 }],
    description: tr('Ses javelots de foudre percent les carapaces.'), passiveText: tr('+50 % contre les boss et colosses. Ignore 40 % de l\'armure.'),
    pros: tr('Tueuse de boss et de blindés.'), cons: tr('Cadence lente : faible contre les nuées.'),
    branches: [
      { name: tr('Foudre-Lance'), text: tr('L\'éclair rebondit sur 2 ennemis (50 %).'), add: [{ kind: 'chain', targets: 2, pct: 0.5, range: 3 }], color: 0x5a8aff, accent: 0x9ffcff },
      { name: tr('Brise-Colosse'), text: tr('+100 % contre les gros, +25 % dégâts, étourdit parfois.'), dmg: 1.25, atkSpeed: 0.9, add: [{ kind: 'bonusVsBig', pct: 1 }, { kind: 'stunOnHit', chance: 0.2, duration: 0.6 }], color: 0x2a4aa8, accent: 0xffe08a },
    ],
    model: { shape: 'lancer', color: 0x5a7ad8, accent: 0x9ffcff, scale: 1 }, fx: 'lightning', sfx: 'zap',
  }),
  harmoniste: def({
    id: 'harmoniste', name: tr('Harmoniste Astral'), faction: 'astreens', category: 'soutien', cost: 100, tower: 'shrine',
    hp: 320, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.3, attack: 'ener', defense: 'leg', roles: ['support', 'aura'],
    abilities: [{ kind: 'auraAttackSpeed', radius: 3, pct: 0.2 }, { kind: 'hastePulse', every: 9, radius: 3.5, pct: 0.35, duration: 3 }, { kind: 'heal', every: 3, amount: 25, range: 4 }],
    description: tr('Chante la fréquence des étoiles.'), skillText: tr('Crescendo (9 s) : +35 % vitesse d\'attaque aux alliés proches pendant 3 s.'),
    passiveText: tr('Aura : +20 % vitesse d\'attaque (3 m). Soin léger (3 s).'),
    pros: tr('Multiplie les dégâts de toute l\'équipe.'), cons: tr('Inutile seule.'),
    branches: [
      { name: tr('Grand Harmoniste'), text: tr('Aura +35 %, soins doublés.'), hp: 1.2, add: [{ kind: 'auraAttackSpeed', radius: 3.5, pct: 0.35 }, { kind: 'heal', every: 3, amount: 50, range: 4.5 }], accent: 0xffffff },
      { name: tr('Chef de Chœur'), text: tr('Crescendo toutes les 7 s (+60 %) et bouclier de départ.'), add: [{ kind: 'hastePulse', every: 7, radius: 4, pct: 0.6, duration: 3 }, { kind: 'shieldStart', amount: 90, radius: 3 }], color: 0x6a7aff, accent: 0xffe08a },
    ],
    model: { shape: 'bard', color: 0x8aa8ff, accent: 0xfff6c0, scale: 1 }, fx: 'note', sfx: 'chime',
  }),
  astromancienne: def({
    id: 'astromancienne', name: tr('Astromancienne'), faction: 'astreens', category: 'zone', cost: 135, tower: 'ice',
    hp: 270, armor: 0, dmg: 36, atkSpeed: 0.6, range: 5, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.6, pct: 0.6 }, { kind: 'slowOnHit', slow: 0.3, duration: 2 }],
    description: tr('Elle fait tomber des fragments d\'étoiles glacées.'), passiveText: tr('Zone (1,6 m, 60 %). Ralentit sa cible de 30 %.'),
    pros: tr('La seule vraie zone de l\'Ordre, alimente les bonus « ralentis ».'), cons: tr('Fragile, cadence lente.'),
    branches: [
      { name: tr('Gravitonne'), text: tr('Puits de gravité : onde qui ralentit de 50 % autour d\'elle.'), add: [{ kind: 'slowPulse', every: 5, radius: 3, slow: 0.5, duration: 2, dmg: 30 }, { kind: 'splash', radius: 2, pct: 0.6 }], color: 0x3a3a9a, accent: 0xb0a0ff },
      { name: tr('Supernova'), text: tr('+60 % dégâts, zone à 90 %.'), dmg: 1.6, atkSpeed: 0.85, add: [{ kind: 'splash', radius: 1.8, pct: 0.9 }], color: 0x8a5ae8, accent: 0xfff0a0 },
    ],
    model: { shape: 'mage', color: 0x3a5aa8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'zap',
  }),

  // ======================================================== CONCORDAT DES ROUAGES
  ferraille: def({
    id: 'ferraille', name: tr('Sentinelle Ferraille'), faction: 'rouages', category: 'defense', cost: 65,
    hp: 560, armor: 0.15, dmg: 15, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.2, attack: 'phys', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3.5 }],
    description: tr('Golem de récupération bon marché.'), skillText: tr('Provocation : les ennemis à 3,5 m le ciblent en priorité.'), passiveText: tr('Plaques recyclées : 15 % d\'armure.'),
    pros: tr('Le tank le moins cher du jeu.'), cons: tr('Blindé : craint l\'Énergie.'),
    branches: [
      { name: tr('Bastion Ferraille'), text: tr('+40 % PV, +10 % armure, renvoie 25 % des dégâts de mêlée.'), hp: 1.4, armor: 0.1, atkSpeed: 0.8, add: [{ kind: 'thorns', pct: 0.25 }], color: 0xc9944a, accent: 0xfff0a0 },
      { name: tr('Broyeur'), text: tr('+80 % dégâts en zone, plus rapide, un peu moins solide.'), hp: 0.85, dmg: 1.8, atkSpeed: 1.2, add: [{ kind: 'splash', radius: 1, pct: 0.5 }], color: 0x9a6a3a, accent: 0xff8a3a },
    ],
    model: { shape: 'golem', color: 0xb98a4a, accent: 0xffd27a, scale: 1 }, fx: 'spark', sfx: 'metal',
  }),
  foreuse: def({
    id: 'foreuse', name: tr('Foreuse Rouage'), faction: 'rouages', category: 'antiblindage', cost: 90,
    hp: 430, armor: 0.1, dmg: 29, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.5, attack: 'ener', defense: 'bli', roles: ['dps'],
    abilities: [{ kind: 'pierce', pct: 0.6 }, { kind: 'bonusVsDef', def: 'bli', pct: 0.35 }],
    description: tr('Automate-mineur à mèche tournante.'), passiveText: tr('Ignore 60 % de l\'armure. +35 % contre les Blindés.'),
    pros: tr('Fond les cuirassés et les boss blindés.'), cons: tr('Médiocre contre les Organiques et les nuées.'),
    branches: [
      { name: tr('Tarière'), text: tr('Ignore toute l\'armure, ses coups fragilisent la cible (+20 % dégâts subis).'), dmg: 1.2, add: [{ kind: 'pierce', pct: 1 }, { kind: 'armorShred', pct: 0.2, duration: 3 }], color: 0x8a6a4a, accent: 0xff5a3a },
      { name: tr('Perforatrice Turbo'), text: tr('+50 % cadence, accélère à chaque coup.'), atkSpeed: 1.5, moveSpeed: 1.3, add: [{ kind: 'ramp', perHit: 0.05, max: 0.4 }], color: 0xd8a04a, accent: 0x9ffcff },
    ],
    model: { shape: 'driller', color: 0xb07a3a, accent: 0xffd27a, scale: 1 }, fx: 'spark', sfx: 'metal',
  }),
  bombardiere: def({
    id: 'bombardiere', name: tr('Bombardière'), faction: 'rouages', category: 'portee', cost: 130, tower: 'cannon',
    hp: 250, armor: 0.05, dmg: 54, atkSpeed: 0.45, range: 7.5, moveSpeed: 1.8, attack: 'phys', defense: 'bli', roles: ['ranged', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.3, pct: 0.55 }],
    description: tr('Une ingénieure et son mortier à vapeur.'), passiveText: tr('Obus explosifs : 55 % des dégâts autour de l\'impact. Portée 7,5 m.'),
    pros: tr('Tire de très loin, ravage les groupes.'), cons: tr('Très lente, fragile, inefficace contre une cible isolée rapide.'),
    branches: [
      { name: tr('Mortier Céleste'), text: tr('+1,5 m portée, +20 % dégâts, explosions plus larges.'), dmg: 1.2, atkSpeed: 0.9, range: 1.5, add: [{ kind: 'splash', radius: 1.8, pct: 0.6 }], color: 0x8a5a2a, accent: 0xffb547 },
      { name: tr('Mitrailleuse'), text: tr('Cadence x2,2 mais petites balles (zone réduite).'), dmg: 0.55, atkSpeed: 2.2, range: -1.5, add: [{ kind: 'splash', radius: 0.9, pct: 0.3 }], color: 0x5a6a7a, accent: 0xffe08a },
    ],
    model: { shape: 'bomber', color: 0xb07a3a, accent: 0xffd27a, scale: 1 }, fx: 'shell', sfx: 'boom',
  }),
  colosse_forge: def({
    id: 'colosse_forge', name: tr('Colosse de Forge'), faction: 'rouages', category: 'lourde', tier: 3, cost: 155,
    hp: 1250, armor: 0.15, dmg: 62, atkSpeed: 0.5, range: 1.3, moveSpeed: 1.6, attack: 'phys', defense: 'bli', roles: ['tank', 'dps', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.3, pct: 0.5 }, { kind: 'stunOnHit', chance: 0.2, duration: 0.8 }],
    description: tr('Géant de laiton au marteau-pilon.'), passiveText: tr('Ses coups frappent en zone et étourdissent parfois (20 %, 0,8 s).'),
    pros: tr('Tank qui fait aussi mal.'), cons: tr('Pas de provocation, très lent.'),
    branches: [
      { name: tr('Titan d\'Airain'), text: tr('+35 % PV, +10 % armure, étourdit plus souvent et plus longtemps.'), hp: 1.35, armor: 0.1, atkSpeed: 0.85, add: [{ kind: 'stunOnHit', chance: 0.35, duration: 1 }, { kind: 'taunt', radius: 2.5 }], color: 0x8a6a3a, accent: 0xffd27a },
      { name: tr('Marteau-Pilon'), text: tr('+50 % cadence, +10 % dégâts, moins résistant.'), hp: 0.8, dmg: 1.1, atkSpeed: 1.5, color: 0xc96a2a, accent: 0xff5a3a },
    ],
    model: { shape: 'colossus', color: 0xa87a3a, accent: 0xffb547, scale: 1.15 }, fx: 'spark', sfx: 'boom',
  }),
  mecanicienne: def({
    id: 'mecanicienne', name: tr('Mécanicienne'), faction: 'rouages', category: 'soutien', cost: 100, tower: 'shrine',
    hp: 340, armor: 0.1, dmg: 12, atkSpeed: 1.0, range: 3.5, moveSpeed: 2.3, attack: 'ener', defense: 'bli', roles: ['support'],
    abilities: [{ kind: 'heal', every: 3.5, amount: 40, range: 4 }, { kind: 'shieldPulse', every: 8, amount: 55, radius: 3 }],
    description: tr('Clé à molette et rivets de fortune.'), skillText: tr('Blindage d\'urgence (8 s) : bouclier de 55 aux alliés proches.'), passiveText: tr('Répare l\'allié le plus abîmé (40 PV / 3,5 s).'),
    pros: tr('Garde la ligne de front debout.'), cons: tr('Faibles dégâts.'),
    branches: [
      { name: tr('Ingénieure de Siège'), text: tr('Boucliers doublés et aura : -15 % dégâts subis.'), add: [{ kind: 'shieldPulse', every: 7, amount: 110, radius: 3.3 }, { kind: 'guardAura', radius: 3, pct: 0.15 }], color: 0x8a6a4a, accent: 0x9ffcff },
      { name: tr('Tourelle Auto'), text: tr('Déploie une tourelle au début du combat ; +100 % dégâts.'), dmg: 2, add: [{ kind: 'summon', unit: 'tourelle', count: 1 }], color: 0xb08a3a, accent: 0xff8a3a },
    ],
    model: { shape: 'mechanic', color: 0xb07a3a, accent: 0x9ffcff, scale: 1 }, fx: 'spark', sfx: 'metal',
  }),
  exarque_prisme: def({
    id: 'exarque_prisme', name: tr('Exarque Prisme'), faction: 'rouages', category: 'speciale', tier: 5, cost: 280, tower: 'mage',
    hp: 950, armor: 0.1, dmg: 74, atkSpeed: 0.9, range: 4.2, moveSpeed: 2.0, attack: 'ener', defense: 'bli', roles: ['carry', 'hybrid'],
    abilities: [{ kind: 'chain', targets: 2, pct: 0.6, range: 3 }],
    description: tr('Automate-cristal qui décompose la lumière en éclairs.'), passiveText: tr('Réfraction : chaque tir rebondit sur 2 ennemis (60 %).'),
    pros: tr('Carry polyvalent, excellent contre tout.'), cons: tr('Très cher : retarde l\'armée et l\'économie.'),
    branches: [
      { name: tr('Exarque Ascendant'), text: tr('3 rebonds à 75 %, accélère à chaque tir.'), add: [{ kind: 'chain', targets: 3, pct: 0.75, range: 3.5 }, { kind: 'ramp', perHit: 0.03, max: 0.3 }], color: 0xb49cff, accent: 0xffffff },
      { name: tr('Prisme Focal'), text: tr('+60 % dégâts, +1 m portée, +50 % contre les gros (1 rebond).'), dmg: 1.6, range: 1, add: [{ kind: 'chain', targets: 1, pct: 0.5, range: 3 }, { kind: 'bonusVsBig', pct: 0.5 }], color: 0x7a5aff, accent: 0xff9ad6 },
    ],
    model: { shape: 'prism', color: 0x9a7cff, accent: 0x9ffcff, scale: 1.15 }, fx: 'lightning', sfx: 'zap',
  }),

  // ======================================================== LES RONCES
  gardien_ecorce: def({
    id: 'gardien_ecorce', name: tr('Gardien d\'Écorce'), faction: 'ronces', category: 'defense', cost: 70,
    hp: 640, armor: 0.08, dmg: 13, atkSpeed: 0.9, range: 1.1, moveSpeed: 2, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'regen', pct: 0.02 }, { kind: 'thorns', pct: 0.15 }],
    description: tr('Un arbre qui a appris à marcher… et à encaisser.'), passiveText: tr('Provocation. Régénère 2 % PV/s. Épines 15 %.'),
    pros: tr('Se soigne seul, tient longtemps.'), cons: tr('Organique : craint le Physique.'),
    branches: [
      { name: tr('Chêne Millénaire'), text: tr('+40 % PV, régénération 3 %/s, provocation plus large.'), hp: 1.4, add: [{ kind: 'regen', pct: 0.03 }, { kind: 'taunt', radius: 4 }], color: 0x5a4a2a, accent: 0x9aff7a },
      { name: tr('Ronce Vengeresse'), text: tr('Épines 50 %, +60 % dégâts, ralentit au toucher.'), dmg: 1.6, add: [{ kind: 'thorns', pct: 0.5 }, { kind: 'slowOnHit', slow: 0.25, duration: 1.5 }], color: 0x3a5a2a, accent: 0xff6a8a },
    ],
    model: { shape: 'treant', color: 0x6a5232, accent: 0x7adc6a, scale: 1 }, fx: 'leaf', sfx: 'slash',
  }),
  lame_ronce: def({
    id: 'lame_ronce', name: tr('Lame-Ronce'), faction: 'ronces', category: 'rapide', cost: 75,
    hp: 340, armor: 0, dmg: 27, atkSpeed: 1.25, range: 1.1, moveSpeed: 2.9, attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [{ kind: 'ramp', perHit: 0.06, max: 0.5 }],
    description: tr('Duelliste végétale qui accélère à chaque coup.'), passiveText: tr('Frénésie : +6 % vitesse d\'attaque par coup (max +50 %).'),
    pros: tr('Meilleurs dégâts de mêlée pour le prix.'), cons: tr('Doit rester en vie pour monter en puissance.'),
    branches: [
      { name: tr('Faucheuse-Ronce'), text: tr('Vol de vie 15 %, frénésie jusqu\'à +70 %.'), add: [{ kind: 'lifesteal', pct: 0.15 }, { kind: 'ramp', perHit: 0.07, max: 0.7 }], color: 0x2f8a3c, accent: 0xe4ff8a },
      { name: tr('Épine Venimeuse'), text: tr('Ses lames empoisonnent (ignore l\'armure).'), dmg: 1.1, add: [{ kind: 'poison', dps: 12, duration: 3, radius: 0 }], color: 0x4a7a2a, accent: 0xc0ff4a },
    ],
    model: { shape: 'blade', color: 0x3f9e4f, accent: 0xb4ff7a, scale: 1 }, fx: 'leaf', sfx: 'slash',
  }),
  rodeuse: def({
    id: 'rodeuse', name: tr('Rôdeuse des Fourrés'), faction: 'ronces', category: 'speciale', cost: 95, tower: 'archer',
    hp: 240, armor: 0, dmg: 32, atkSpeed: 0.9, range: 5, moveSpeed: 2.6, attack: 'perf', defense: 'org', roles: ['ranged', 'assassin'],
    abilities: [{ kind: 'stealth', ambush: 0.6 }],
    description: tr('Invisible dans les feuillages jusqu\'au premier tir.'), passiveText: tr('Camouflage : les ennemis ne la voient pas tant qu\'elle ne tire pas. Embuscade : +60 % au premier tir.'),
    pros: tr('Rarement ciblée, idéale derrière la ligne.'), cons: tr('Repérée dès qu\'elle tire ; fragile.'),
    branches: [
      { name: tr('Ombre Sylvestre'), text: tr('Embuscade +120 %, +30 % dégâts, se recamoufle plus vite.'), dmg: 1.3, add: [{ kind: 'stealth', ambush: 1.2 }], color: 0x2a4a2a, accent: 0x9aff7a },
      { name: tr('Sarbacane'), text: tr('Fléchettes empoisonnées en zone, +20 % cadence.'), atkSpeed: 1.2, add: [{ kind: 'poison', dps: 14, duration: 4, radius: 1.1 }], color: 0x5a7a2a, accent: 0xd8ff4a },
    ],
    model: { shape: 'archer', color: 0x3a6a3a, accent: 0xb4ff7a, scale: 1 }, fx: 'leaf', sfx: 'arrow',
  }),
  semeuse: def({
    id: 'semeuse', name: tr('Semeuse de Spores'), faction: 'ronces', category: 'zone', cost: 105, tower: 'poison',
    hp: 300, armor: 0, dmg: 12, atkSpeed: 0.8, range: 4, moveSpeed: 2.2, attack: 'perf', defense: 'org', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'poison', dps: 9, duration: 4, radius: 1.6 }, { kind: 'slowOnHit', slow: 0.2, duration: 1.5 }],
    description: tr('Plante-mère qui crache des nuages de spores.'), passiveText: tr('Poison de zone (1,6 m) : 9 dégâts/s pendant 4 s, ignore l\'armure.'),
    pros: tr('Dévaste les nuées et les blindés lents.'), cons: tr('Lente à tuer une cible seule.'),
    branches: [
      { name: tr('Mère-Spore'), text: tr('Poison x1,8 sur une zone plus large.'), add: [{ kind: 'poison', dps: 18, duration: 4, radius: 2.1 }], color: 0x6a8a2a, accent: 0xe4ff4a },
      { name: tr('Pollen Soporifique'), text: tr('Nuage qui étourdit tout autour (1,2 s toutes les 7 s).'), add: [{ kind: 'stunPulse', every: 7, radius: 2.6, duration: 1.2, dmg: 15 }], color: 0xb07ab0, accent: 0xffd0ff },
    ],
    model: { shape: 'sower', color: 0x5a8a3a, accent: 0xd8ff6a, scale: 1 }, fx: 'poison', sfx: 'whoosh',
  }),
  druidesse: def({
    id: 'druidesse', name: tr('Druidesse'), faction: 'ronces', category: 'soutien', cost: 95, tower: 'shrine',
    hp: 330, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.2, attack: 'arca', defense: 'org', roles: ['support'],
    abilities: [{ kind: 'heal', every: 2.5, amount: 34, range: 4 }],
    description: tr('Gardienne des sèves anciennes.'), passiveText: tr('Soigne l\'allié le plus blessé (34 PV / 2,5 s).'),
    pros: tr('Meilleurs soins du jeu.'), cons: tr('Ne protège pas des pics de dégâts.'),
    branches: [
      { name: tr('Gardienne de Sève'), text: tr('Soins toutes les 1,6 s et régénération des alliés.'), hp: 1.2, add: [{ kind: 'heal', every: 1.6, amount: 40, range: 4.5 }, { kind: 'regen', pct: 0.01 }], color: 0x3a7a3a, accent: 0xb4ff7a },
      { name: tr('Éveilleuse'), text: tr('Invoque 2 pousses et accélère ses alliés (+30 %).'), add: [{ kind: 'summon', unit: 'pousse', count: 2 }, { kind: 'hastePulse', every: 10, radius: 3.5, pct: 0.3, duration: 4 }], color: 0x6a5a2a, accent: 0xffe08a },
    ],
    model: { shape: 'druid', color: 0x4a8a4a, accent: 0xd8ff8a, scale: 1 }, fx: 'leaf', sfx: 'chime',
  }),
  ancien_racine: def({
    id: 'ancien_racine', name: tr('Ancien des Racines'), faction: 'ronces', category: 'lourde', tier: 3, cost: 160,
    hp: 1100, armor: 0.1, dmg: 40, atkSpeed: 0.6, range: 1.3, moveSpeed: 1.6, attack: 'phys', defense: 'org', roles: ['tank', 'summoner'],
    abilities: [{ kind: 'summon', unit: 'pousse', count: 2 }, { kind: 'slowPulse', every: 6, radius: 2.6, slow: 0.4, duration: 2, dmg: 20 }],
    description: tr('Le plus vieil arbre de la forêt-qui-marche.'), skillText: tr('Secousse (6 s) : ralentit de 40 % autour de lui.'), passiveText: tr('Fait pousser 2 pousses au début du combat.'),
    pros: tr('Masse de PV + invocations gratuites.'), cons: tr('Très lent, cher.'),
    branches: [
      { name: tr('Arbre-Monde'), text: tr('+50 % PV, 4 pousses.'), hp: 1.5, add: [{ kind: 'summon', unit: 'pousse', count: 4 }], color: 0x5a4a2a, accent: 0x7aff6a },
      { name: tr('Tempête de Ronces'), text: tr('Ses coups empoisonnent en zone.'), dmg: 1.3, add: [{ kind: 'poison', dps: 20, duration: 4, radius: 2 }], color: 0x3a4a2a, accent: 0xd8ff4a },
    ],
    model: { shape: 'treant', color: 0x5a4628, accent: 0x9aff7a, scale: 1.45 }, fx: 'leaf', sfx: 'boom',
  }),

  // ======================================================== MARÉE ABYSSALE
  carapace_abysses: def({
    id: 'carapace_abysses', name: tr('Carapace des Abysses'), faction: 'abysses', category: 'lourde', tier: 3, cost: 125,
    hp: 1350, armor: 0.2, dmg: 29, atkSpeed: 0.75, range: 1.2, moveSpeed: 1.8, attack: 'phys', defense: 'mys', roles: ['tank', 'aoe'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'slowPulse', every: 5, radius: 2.6, slow: 0.35, duration: 2.5, dmg: 20 }],
    description: tr('Tortue-colosse qui libère des vagues glacées.'), skillText: tr('Onde de marée (5 s) : ralentit de 35 % autour d\'elle.'), passiveText: tr('Provocation (3 m). 20 % d\'armure.'),
    pros: tr('Mur vivant qui ralentit tout.'), cons: tr('Faibles dégâts.'),
    branches: [
      { name: tr('Léviathan'), text: tr('+40 % PV, onde plus large qui ralentit de 50 %.'), hp: 1.4, add: [{ kind: 'slowPulse', every: 4.5, radius: 3.2, slow: 0.5, duration: 3, dmg: 30 }], color: 0x13707f, accent: 0xa8ffff },
      { name: tr('Tortue-Bélier'), text: tr('Dégâts x2, ses charges étourdissent.'), dmg: 2, atkSpeed: 1.1, add: [{ kind: 'stunOnHit', chance: 0.3, duration: 1 }], color: 0x2a6a5a, accent: 0xffd27a },
    ],
    model: { shape: 'turtle', color: 0x1f8f9a, accent: 0x7ff6ff, scale: 1.1 }, fx: 'water', sfx: 'wave',
  }),
  ondin: def({
    id: 'ondin', name: tr('Ondin Lame-Courant'), faction: 'abysses', category: 'rapide', cost: 65,
    hp: 380, armor: 0, dmg: 24, atkSpeed: 1.2, range: 1.1, moveSpeed: 4, attack: 'perf', defense: 'org', roles: ['dps', 'assassin'],
    abilities: [{ kind: 'dash', range: 7 }, { kind: 'slowOnHit', slow: 0.3, duration: 1.5 }],
    description: tr('Guerrier-poisson au trident.'), skillText: tr('Vague-éclair : bondit sur un ennemi à 7 m au début du combat.'), passiveText: tr('Ses coups ralentissent de 30 %.'),
    pros: tr('Rapide, gêne les ennemis dès le début.'), cons: tr('Peu résistant.'),
    branches: [
      { name: tr('Requin des Fosses'), text: tr('+40 % dégâts, achève et se soigne.'), dmg: 1.4, add: [{ kind: 'execute', threshold: 0.35, pct: 0.5 }, { kind: 'lifesteal', pct: 0.1 }], color: 0x2a5a7a, accent: 0xff6a6a },
      { name: tr('Danseur des Marées'), text: tr('+40 % cadence, ralentit de 45 %.'), atkSpeed: 1.4, add: [{ kind: 'slowOnHit', slow: 0.45, duration: 2 }], color: 0x3ab0b0, accent: 0xe0ffff },
    ],
    model: { shape: 'merman', color: 0x2a9aa0, accent: 0x9ffcff, scale: 1 }, fx: 'water', sfx: 'slash',
  }),
  harponneuse: def({
    id: 'harponneuse', name: tr('Harponneuse'), faction: 'abysses', category: 'portee', cost: 95, tower: 'archer',
    hp: 270, armor: 0, dmg: 44, atkSpeed: 0.7, range: 5, moveSpeed: 2.3, attack: 'perf', defense: 'mys', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsBig', pct: 0.4 }, { kind: 'slowOnHit', slow: 0.3, duration: 2 }],
    description: tr('Ses harpons clouent les géants.'), passiveText: tr('+40 % contre les gros ennemis. Ralentit sa cible de 30 %.'),
    pros: tr('Bonne contre les boss et les mini-boss.'), cons: tr('Cadence lente.'),
    branches: [
      { name: tr('Baleinière'), text: tr('+100 % contre les gros, +30 % dégâts, perce l\'armure.'), dmg: 1.3, add: [{ kind: 'bonusVsBig', pct: 1 }, { kind: 'pierce', pct: 0.4 }], color: 0x1a5a6a, accent: 0xffe08a },
      { name: tr('Filet de Corail'), text: tr('Filets : zone qui ralentit de 50 %.'), add: [{ kind: 'splash', radius: 1.4, pct: 0.5 }, { kind: 'slowOnHit', slow: 0.5, duration: 2 }], color: 0xc06a6a, accent: 0xffb0a0 },
    ],
    model: { shape: 'lancer', color: 0x1f8f9a, accent: 0x7ff6ff, scale: 1 }, fx: 'water', sfx: 'arrow',
  }),
  meduse: def({
    id: 'meduse', name: tr('Méduse Abyssale'), faction: 'abysses', category: 'zone', cost: 110, tower: 'spire',
    hp: 320, armor: 0, dmg: 21, atkSpeed: 0.8, range: 3.5, moveSpeed: 2, attack: 'ener', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'chain', targets: 2, pct: 0.7, range: 2.8 }, { kind: 'stunOnHit', chance: 0.15, duration: 0.8 }],
    description: tr('Ses filaments électriques sautent d\'ennemi en ennemi.'), passiveText: tr('Arc électrique : rebondit sur 2 ennemis. 15 % de chance d\'étourdir.'),
    pros: tr('Contrôle de foule, anti-Blindés (Énergie).'), cons: tr('Faibles dégâts directs.'),
    branches: [
      { name: tr('Méduse-Tempête'), text: tr('4 rebonds à 70 %.'), add: [{ kind: 'chain', targets: 4, pct: 0.7, range: 3 }], color: 0x6a3ab0, accent: 0x9ffcff },
      { name: tr('Reine Urticante'), text: tr('Décharge : étourdit tout autour (1,2 s toutes les 6 s).'), add: [{ kind: 'stunPulse', every: 6, radius: 2.8, duration: 1.2, dmg: 30 }], color: 0xb04a9a, accent: 0xffb0ff },
    ],
    model: { shape: 'jelly', color: 0x6a8aff, accent: 0xd0f8ff, scale: 1 }, fx: 'lightning', sfx: 'zap',
  }),
  pretresse: def({
    id: 'pretresse', name: tr('Prêtresse des Marées'), faction: 'abysses', category: 'soutien', cost: 95, tower: 'shrine',
    hp: 340, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['support'],
    abilities: [{ kind: 'shieldPulse', every: 6, amount: 85, radius: 3.4 }, { kind: 'heal', every: 4, amount: 30, range: 4 }],
    description: tr('Elle tisse des boucliers d\'eau vive.'), skillText: tr('Bulle (6 s) : bouclier de 85 aux alliés proches.'), passiveText: tr('Soin léger (30 PV / 4 s).'),
    pros: tr('Annule les pics de dégâts.'), cons: tr('Faibles dégâts.'),
    branches: [
      { name: tr('Grande Prêtresse'), text: tr('Bulles doublées toutes les 5 s.'), add: [{ kind: 'shieldPulse', every: 5, amount: 140, radius: 3.6 }], color: 0x2a7aaa, accent: 0xffffff },
      { name: tr('Chantre des Abysses'), text: tr('Auras : -20 % dégâts subis et +15 % cadence.'), add: [{ kind: 'guardAura', radius: 3, pct: 0.2 }, { kind: 'auraAttackSpeed', radius: 3, pct: 0.15 }], color: 0x1a4a6a, accent: 0x7ff6ff },
    ],
    model: { shape: 'priestess', color: 0x2a8aaa, accent: 0xa8ffff, scale: 1 }, fx: 'water', sfx: 'chime',
  }),
  kraken: def({
    id: 'kraken', name: tr('Rejeton du Kraken'), faction: 'abysses', category: 'speciale', tier: 4, cost: 190,
    hp: 1150, armor: 0.1, dmg: 46, atkSpeed: 0.8, range: 2.5, moveSpeed: 1.6, attack: 'phys', defense: 'mys', roles: ['tank', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.6, pct: 0.5 }, { kind: 'stunOnHit', chance: 0.25, duration: 1.2 }, { kind: 'taunt', radius: 2 }],
    description: tr('Ses tentacules balaient et étreignent.'), passiveText: tr('Balayage de zone (2,5 m). 25 % de chance d\'étreindre (étourdit 1,2 s).'),
    pros: tr('Contrôle massif en première ligne.'), cons: tr('Cher, Mystique (craint l\'Arcane).'),
    branches: [
      { name: tr('Kraken Ancestral'), text: tr('+50 % PV, tentacules plus longs et plus larges.'), hp: 1.5, range: 1, add: [{ kind: 'splash', radius: 2.2, pct: 0.55 }], color: 0x3a2a6a, accent: 0x9ffcff },
      { name: tr('Abysse Vorace'), text: tr('+60 % dégâts, vol de vie 30 %, achève.'), dmg: 1.6, add: [{ kind: 'lifesteal', pct: 0.3 }, { kind: 'execute', threshold: 0.25, pct: 0.6 }], color: 0x6a1a3a, accent: 0xff6a8a },
    ],
    model: { shape: 'kraken', color: 0x5a3a8a, accent: 0x7ff6ff, scale: 1.2 }, fx: 'water', sfx: 'wave',
  }),

  // ======================================================== BRASIER SOLAIRE
  paladin_aube: def({
    id: 'paladin_aube', name: tr('Paladine de l\'Aube'), faction: 'solaires', category: 'defense', cost: 100,
    hp: 700, armor: 0.2, dmg: 17, atkSpeed: 0.9, range: 1.2, moveSpeed: 2.2, attack: 'phys', defense: 'mys', roles: ['tank', 'support'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'guardAura', radius: 2.5, pct: 0.12 }],
    description: tr('Son bouclier solaire protège ceux qui l\'entourent.'), passiveText: tr('Provocation. Aura : alliés proches -12 % dégâts subis.'),
    pros: tr('Protège les mages fragiles.'), cons: tr('Chère pour un tank.'),
    branches: [
      { name: tr('Paladine du Zénith'), text: tr('+35 % PV, bouclier de départ pour les alliés.'), hp: 1.35, add: [{ kind: 'shieldStart', amount: 140, radius: 2.5 }], color: 0xe8b04a, accent: 0xffffff },
      { name: tr('Croisée Ardente'), text: tr('+50 % dégâts, ses coups brûlent.'), dmg: 1.5, add: [{ kind: 'burn', dps: 18, duration: 3 }], color: 0xc8401a, accent: 0xffd36a },
    ],
    model: { shape: 'paladin', color: 0xd88a3a, accent: 0xfff2a0, scale: 1 }, fx: 'fire', sfx: 'metal',
  }),
  danse_flamme: def({
    id: 'danse_flamme', name: tr('Danse-Flamme'), faction: 'solaires', category: 'rapide', cost: 85,
    hp: 310, armor: 0, dmg: 22, atkSpeed: 1.3, range: 1.1, moveSpeed: 3.2, attack: 'ener', defense: 'leg', roles: ['dps'],
    abilities: [{ kind: 'burn', dps: 9, duration: 3 }],
    description: tr('Duelliste aux cimeterres incandescents.'), passiveText: tr('Brûlure : 9 dégâts/s pendant 3 s.'),
    pros: tr('Gros dégâts sur la durée, rapide.'), cons: tr('Légère et fragile.'),
    branches: [
      { name: tr('Lame Solaire'), text: tr('+30 % dégâts, frénésie (+60 % cadence max).'), dmg: 1.3, add: [{ kind: 'ramp', perHit: 0.07, max: 0.6 }], color: 0xe8701a, accent: 0xffffff },
      { name: tr('Tourbillon Ardent'), text: tr('Attaques en zone, brûlure renforcée.'), add: [{ kind: 'splash', radius: 1.2, pct: 0.6 }, { kind: 'burn', dps: 16, duration: 3 }], color: 0xb0301a, accent: 0xffb547 },
    ],
    model: { shape: 'duelist', color: 0xd8572a, accent: 0xffd36a, scale: 1 }, fx: 'fire', sfx: 'slash',
  }),
  arbaletriere: def({
    id: 'arbaletriere', name: tr('Arbalétrière Solaire'), faction: 'solaires', category: 'antiblindage', cost: 100, tower: 'archer',
    hp: 240, armor: 0, dmg: 30, atkSpeed: 1.0, range: 5.5, moveSpeed: 2.3, attack: 'ener', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'armorShred', pct: 0.15, duration: 3 }, { kind: 'burn', dps: 6, duration: 3 }],
    description: tr('Carreaux chauffés à blanc.'), passiveText: tr('Ses carreaux fragilisent (+15 % dégâts subis) et brûlent.'),
    pros: tr('Prépare les cibles blindées pour toute l\'équipe.'), cons: tr('Fragile.'),
    branches: [
      { name: tr('Carreaux de Magma'), text: tr('Perce 50 % de l\'armure, +40 % contre les Blindés.'), dmg: 1.2, add: [{ kind: 'pierce', pct: 0.5 }, { kind: 'bonusVsDef', def: 'bli', pct: 0.4 }], color: 0xa83a1a, accent: 0xff8a3a },
      { name: tr('Salve Ardente'), text: tr('+60 % cadence, le carreau rebondit une fois.'), dmg: 0.8, atkSpeed: 1.6, add: [{ kind: 'chain', targets: 1, pct: 0.5, range: 3 }], color: 0xe8a03a, accent: 0xffffff },
    ],
    model: { shape: 'xbow', color: 0xd86a2a, accent: 0xffd36a, scale: 1 }, fx: 'fire', sfx: 'arrow',
  }),
  oracle_braise: def({
    id: 'oracle_braise', name: tr('Oracle de Braise'), faction: 'solaires', category: 'zone', tier: 3, cost: 145, tower: 'fire',
    hp: 270, armor: 0, dmg: 42, atkSpeed: 0.65, range: 4.5, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.7, pct: 0.65 }, { kind: 'burn', dps: 8, duration: 3 }],
    description: tr('Projette des fragments de soleil captif.'), passiveText: tr('Éclat solaire : 70 % des dégâts autour de la cible. Brûle.'),
    pros: tr('Zone énorme.'), cons: tr('Très fragile.'),
    branches: [
      { name: tr('Gardienne du Soleil Captif'), text: tr('+40 % dégâts, zone plus large, la cible subit +15 %.'), dmg: 1.4, add: [{ kind: 'splash', radius: 2.1, pct: 0.8 }, { kind: 'armorShred', pct: 0.15, duration: 3 }], color: 0xe8401a, accent: 0xfff2a0 },
      { name: tr('Pyromancien'), text: tr('Brûlure x3,5, +20 % cadence.'), atkSpeed: 1.2, add: [{ kind: 'burn', dps: 28, duration: 4 }], color: 0x8a1a1a, accent: 0xff8a3a },
    ],
    model: { shape: 'mage', color: 0xd8572a, accent: 0xffd36a, scale: 1 }, fx: 'fire', sfx: 'fire',
  }),
  vestale: def({
    id: 'vestale', name: tr('Vestale du Feu Sacré'), faction: 'solaires', category: 'soutien', cost: 95, tower: 'shrine',
    hp: 300, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.3, attack: 'arca', defense: 'mys', roles: ['support', 'aura'],
    abilities: [{ kind: 'hastePulse', every: 8, radius: 3.5, pct: 0.35, duration: 3.5 }, { kind: 'heal', every: 3.5, amount: 25, range: 4 }],
    description: tr('Gardienne de la flamme qui embrase les cœurs.'), skillText: tr('Ferveur (8 s) : +35 % vitesse d\'attaque aux alliés proches pendant 3,5 s.'), passiveText: tr('Soin léger.'),
    pros: tr('Boost de cadence en rafales.'), cons: tr('Pas de défense.'),
    branches: [
      { name: tr('Flamme Éternelle'), text: tr('Ferveur toutes les 6 s (+60 %).'), add: [{ kind: 'hastePulse', every: 6, radius: 3.8, pct: 0.6, duration: 3.5 }], color: 0xe8701a, accent: 0xffffff },
      { name: tr('Phénix Gardien'), text: tr('Soins x2,5 et bouclier de départ.'), hp: 1.2, add: [{ kind: 'heal', every: 3, amount: 62, range: 4.5 }, { kind: 'shieldStart', amount: 80, radius: 3 }], color: 0xffa03a, accent: 0xfff2a0 },
    ],
    model: { shape: 'priestess', color: 0xe8803a, accent: 0xfff2a0, scale: 1 }, fx: 'fire', sfx: 'chime',
  }),
  elementaire: def({
    id: 'elementaire', name: tr('Élémentaire Solaire'), faction: 'solaires', category: 'speciale', tier: 4, cost: 210,
    hp: 760, armor: 0, dmg: 52, atkSpeed: 0.8, range: 3, moveSpeed: 2, attack: 'arca', defense: 'mys', roles: ['carry', 'aoe'],
    abilities: [{ kind: 'novaPulse', every: 4, radius: 3, dmg: 42, burn: 10 }],
    description: tr('Un fragment de soleil vivant.'), skillText: tr('Nova (4 s) : explosion de feu autour de lui (45 + brûlure).'), passiveText: '—',
    pros: tr('Dégâts de zone constants au contact.'), cons: tr('Aucune armure.'),
    branches: [
      { name: tr('Cœur de Soleil'), text: tr('Nova +80 % et plus large.'), hp: 1.15, add: [{ kind: 'novaPulse', every: 3.5, radius: 3.6, dmg: 90, burn: 20 }], color: 0xffb03a, accent: 0xffffff },
      { name: tr('Météore Vivant'), text: tr('+2 m portée, tirs explosifs (+30 %).'), dmg: 1.3, range: 2, add: [{ kind: 'splash', radius: 1.8, pct: 0.7 }], color: 0xc8301a, accent: 0xffd36a },
    ],
    model: { shape: 'elemental', color: 0xff7a2a, accent: 0xfff0a0, scale: 1.1 }, fx: 'fire', sfx: 'fire',
  }),

  // ======================================================== VOILE NÉCROSE
  garde_os: def({
    id: 'garde_os', name: tr('Garde d\'Os'), faction: 'necrose', category: 'defense', cost: 60,
    hp: 580, armor: 0.15, dmg: 18, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.1, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'lifesteal', pct: 0.15 }],
    description: tr('Squelette en armure rouillée, fidèle au-delà de la mort.'), passiveText: tr('Provocation. Vol de vie 15 %.'),
    pros: tr('Tank bon marché qui se soigne en frappant.'), cons: tr('Faible contre le Physique.'),
    branches: [
      { name: tr('Ossuaire Vivant'), text: tr('+35 % PV, relève des squelettes autour de lui.'), hp: 1.35, add: [{ kind: 'raise', unit: 'squelette', chance: 0.3, max: 3, radius: 3 }], color: 0x6a5a7a, accent: 0xc48bff },
      { name: tr('Chevalier Funeste'), text: tr('+60 % dégâts, exécute (< 30 % PV).'), dmg: 1.6, add: [{ kind: 'execute', threshold: 0.3, pct: 0.5 }], color: 0x3a2a4a, accent: 0xff4a7a },
    ],
    model: { shape: 'boneguard', color: 0x5a4a6a, accent: 0xc48bff, scale: 1 }, fx: 'shadow', sfx: 'metal',
  }),
  spectre_vif: def({
    id: 'spectre_vif', name: tr('Spectre Vif'), faction: 'necrose', category: 'rapide', cost: 75,
    hp: 285, armor: 0, dmg: 31, atkSpeed: 1.4, range: 1.1, moveSpeed: 4.2, attack: 'perf', defense: 'leg', roles: ['assassin'],
    abilities: [{ kind: 'dash', range: 8 }, { kind: 'execute', threshold: 0.35, pct: 0.6 }, { kind: 'stealth', ambush: 0.4 }],
    description: tr('Une ombre qui frappe les arrières ennemis.'), skillText: tr('Saut d\'ombre : bondit sur l\'ennemi le plus lointain à 8 m.'), passiveText: tr('Camouflé. Exécution : +60 % sous 35 % PV.'),
    pros: tr('Tue les tireurs et les soigneurs ennemis.'), cons: tr('Meurt vite s\'il est ciblé.'),
    branches: [
      { name: tr('Voile Écarlate'), text: tr('Vol de vie 20 %, exécution +80 % (< 40 %).'), add: [{ kind: 'lifesteal', pct: 0.2 }, { kind: 'execute', threshold: 0.4, pct: 0.8 }], color: 0x8a1f4a, accent: 0xff4a7a },
      { name: tr('Lame Fantôme'), text: tr('Saut 12 m, frappe en zone, embuscade +100 %.'), add: [{ kind: 'dash', range: 12 }, { kind: 'splash', radius: 1, pct: 0.5 }, { kind: 'stealth', ambush: 1 }], color: 0x4a3a8a, accent: 0x9ffcff },
    ],
    model: { shape: 'shade', color: 0x7a3fc4, accent: 0xff6ad5, scale: 1 }, fx: 'shadow', sfx: 'whoosh',
  }),
  archere_cendres: def({
    id: 'archere_cendres', name: tr('Archère des Cendres'), faction: 'necrose', category: 'portee', cost: 90, tower: 'archer',
    hp: 220, armor: 0, dmg: 29, atkSpeed: 1.1, range: 5.5, moveSpeed: 2.4, attack: 'arca', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'armorShred', pct: 0.1, duration: 3 }, { kind: 'lifesteal', pct: 0.1 }],
    description: tr('Ses flèches portent une malédiction.'), passiveText: tr('Malédiction : la cible subit +10 % de dégâts (3 s). Vol de vie 10 %.'),
    pros: tr('Arcane : excellent contre Blindés et Mystiques.'), cons: tr('Très fragile.'),
    branches: [
      { name: tr('Flèches Maudites'), text: tr('Malédiction +25 % (4 s), +20 % dégâts.'), dmg: 1.2, add: [{ kind: 'armorShred', pct: 0.25, duration: 4 }], color: 0x4a2a6a, accent: 0xff4aff },
      { name: tr('Pluie de Cendres'), text: tr('Volées de zone qui ralentissent.'), add: [{ kind: 'splash', radius: 1.3, pct: 0.5 }, { kind: 'slowOnHit', slow: 0.25, duration: 2 }], color: 0x5a5a6a, accent: 0xd0d0e0 },
    ],
    model: { shape: 'archer', color: 0x5a3a7a, accent: 0xd06aff, scale: 1 }, fx: 'shadow', sfx: 'arrow',
  }),
  pestifere: def({
    id: 'pestifere', name: tr('Pestiféré'), faction: 'necrose', category: 'zone', cost: 90, tower: 'poison',
    hp: 380, armor: 0, dmg: 14, atkSpeed: 0.85, range: 3.5, moveSpeed: 2, attack: 'ener', defense: 'org', roles: ['aoe'],
    abilities: [{ kind: 'poison', dps: 14, duration: 4, radius: 2.5 }, { kind: 'armorShred', pct: 0.1, duration: 3 }],
    description: tr('Il balance un encensoir de miasmes.'), passiveText: tr('Miasme : poison de zone (2,5 m, 14/s, 4 s).'),
    pros: tr('Affaiblit des groupes entiers.'), cons: tr('Courte portée.'),
    branches: [
      { name: tr('Seigneur de la Peste'), text: tr('Poison x2.'), add: [{ kind: 'poison', dps: 18, duration: 4, radius: 2.3 }], color: 0x4a6a2a, accent: 0xc0ff4a },
      { name: tr('Brume Fétide'), text: tr('Camoufle les alliés proches au début du combat.'), hp: 1.2, add: [{ kind: 'veilStart', radius: 3.2 }], color: 0x4a4a5a, accent: 0xb0a0ff },
    ],
    model: { shape: 'censer', color: 0x4a5a3a, accent: 0xb4ff6a, scale: 1 }, fx: 'poison', sfx: 'whoosh',
  }),
  invocatrice: def({
    id: 'invocatrice', name: tr('Invocatrice du Voile'), faction: 'necrose', category: 'speciale', tier: 3, cost: 115, tower: 'dark',
    hp: 300, armor: 0, dmg: 18, atkSpeed: 0.8, range: 4, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['summoner', 'mage'],
    abilities: [{ kind: 'summon', unit: 'squelette', count: 3 }, { kind: 'raise', unit: 'squelette', chance: 0.4, max: 4, radius: 5 }],
    description: tr('Elle rappelle les morts pour qu\'ils servent encore.'), skillText: tr('Relève : 40 % de chance de relever un ennemi tué à 5 m (max 4).'), passiveText: tr('3 squelettes au début du combat.'),
    pros: tr('Armée gratuite qui grossit pendant le combat.'), cons: tr('Squelettes balayés par la zone.'),
    branches: [
      { name: tr('Reine du Voile'), text: tr('Invoque des Chevaliers d\'os, relève plus souvent.'), add: [{ kind: 'summon', unit: 'chevalier_os', count: 2 }, { kind: 'raise', unit: 'squelette', chance: 0.5, max: 6, radius: 5 }], color: 0x6a2a8a, accent: 0xff9aff },
      { name: tr('Liche'), text: tr('Dégâts x2,2, éclairs nécrotiques en chaîne.'), dmg: 2.2, add: [{ kind: 'chain', targets: 2, pct: 0.6, range: 3 }], color: 0x2a3a4a, accent: 0x7affd0 },
    ],
    model: { shape: 'necro', color: 0x4a2a6a, accent: 0x9affd0, scale: 1 }, fx: 'shadow', sfx: 'whoosh',
  }),
  abomination: def({
    id: 'abomination', name: tr('Abomination Cousue'), faction: 'necrose', category: 'lourde', tier: 3, cost: 140,
    hp: 1420, armor: 0.05, dmg: 42, atkSpeed: 0.7, range: 1.2, moveSpeed: 1.7, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 2.5 }, { kind: 'lifesteal', pct: 0.2 }, { kind: 'split', unit: 'squelette', count: 3 }],
    description: tr('Un amas de chair et de crochets.'), passiveText: tr('Provocation. Vol de vie 20 %. Libère 3 squelettes en mourant.'),
    pros: tr('Énorme réserve de PV, continue à servir après sa mort.'), cons: tr('Peu d\'armure.'),
    branches: [
      { name: tr('Colosse de Chair'), text: tr('+50 % PV, provocation 3,5 m, régénère.'), hp: 1.5, add: [{ kind: 'taunt', radius: 3.5 }, { kind: 'regen', pct: 0.015 }], color: 0x6a4a5a, accent: 0xff8aa0 },
      { name: tr('Boucher'), text: tr('+80 % dégâts en zone.'), dmg: 1.8, atkSpeed: 1.1, add: [{ kind: 'splash', radius: 1.2, pct: 0.6 }], color: 0x5a2a2a, accent: 0xff4a4a },
    ],
    model: { shape: 'abom', color: 0x7a6a72, accent: 0x9affd0, scale: 1.3 }, fx: 'shadow', sfx: 'boom',
  }),

  // ======================================================== TOKENS (summoned)
  squelette: def({
    id: 'squelette', name: tr('Squelette'), faction: 'necrose', category: 'speciale', cost: 0, token: true,
    hp: 175, armor: 0, dmg: 12, atkSpeed: 1.0, range: 1.0, moveSpeed: 2.4, attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [], description: tr('Invoqué.'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'skeleton', color: 0xd8d0c0, accent: 0x9affd0, scale: 0.85 }, fx: 'shadow', sfx: 'slash',
  }),
  chevalier_os: def({
    id: 'chevalier_os', name: tr('Chevalier d\'os'), faction: 'necrose', category: 'speciale', cost: 0, token: true,
    hp: 300, armor: 0.1, dmg: 20, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.3, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 2 }], description: tr('Invoqué.'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'skeleton', color: 0xb8b0c8, accent: 0xff9aff, scale: 1.05 }, fx: 'shadow', sfx: 'metal',
  }),
  pousse: def({
    id: 'pousse', name: tr('Pousse'), faction: 'ronces', category: 'speciale', cost: 0, token: true,
    hp: 170, armor: 0, dmg: 10, atkSpeed: 1.0, range: 1.0, moveSpeed: 2.2, attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [{ kind: 'regen', pct: 0.02 }], description: tr('Invoquée.'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'sapling', color: 0x5a8a3a, accent: 0xd8ff6a, scale: 0.8 }, fx: 'leaf', sfx: 'slash',
  }),
  tourelle: def({
    id: 'tourelle', name: tr('Tourelle'), faction: 'rouages', category: 'speciale', cost: 0, token: true,
    hp: 260, armor: 0.2, dmg: 18, atkSpeed: 1.6, range: 4.5, moveSpeed: 0, attack: 'perf', defense: 'bli', roles: ['ranged'],
    abilities: [], description: tr('Déployée.'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'turret', color: 0x8a7a5a, accent: 0xffd27a, scale: 0.9 }, fx: 'spark', sfx: 'shot',
  }),
  sylvain: def({
    id: 'sylvain', name: tr('Gardien Sylvestre'), faction: 'ronces', category: 'speciale', cost: 0, token: true,
    hp: 600, armor: 0.1, dmg: 24, atkSpeed: 0.8, range: 1.3, moveSpeed: 2.2, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3.5 }, { kind: 'regen', pct: 0.02 }, { kind: 'splash', radius: 1.3, pct: 0.5 }], description: tr('Invoqué (pouvoir).'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'treant', color: 0x4a6a2a, accent: 0xc8ff6a, scale: 1.6 }, fx: 'leaf', sfx: 'boom',
  }),
  tentacule: def({
    id: 'tentacule', name: tr('Tentacule du Kraken'), faction: 'abysses', category: 'speciale', cost: 0, token: true,
    hp: 700, armor: 0.15, dmg: 30, atkSpeed: 0.9, range: 2.6, moveSpeed: 0, attack: 'phys', defense: 'mys', roles: ['tank'],
    abilities: [{ kind: 'splash', radius: 1.8, pct: 0.5 }, { kind: 'stunOnHit', chance: 0.3, duration: 1 }, { kind: 'taunt', radius: 3 }], description: tr('Invoqué (pouvoir).'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'kraken', color: 0x3a2a6a, accent: 0x9ffcff, scale: 1.8 }, fx: 'water', sfx: 'wave',
  }),
  leviathan: def({
    id: 'leviathan', name: tr('Léviathan Mécanique'), faction: 'abysses', category: 'speciale', cost: 0, token: true,
    hp: 1500, armor: 0.25, dmg: 46, atkSpeed: 0.8, range: 2.4, moveSpeed: 1.8, attack: 'ener', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 4.5 }, { kind: 'splash', radius: 2.2, pct: 0.6 }, { kind: 'stunOnHit', chance: 0.3, duration: 1 }, { kind: 'interceptor', radius: 14 }],
    description: tr('Invoqué (Résonance DUO).'), passiveText: '—', pros: '', cons: '',
    model: { shape: 'leviathan', color: 0x6a7a8a, accent: 0x5ad8ff, scale: 2.1 }, fx: 'water', sfx: 'boom',
  }),
};

export const BASE_UNIT_IDS = Object.values(UNITS).filter(u => !u.token).map(u => u.id);

// ---------------------------------------------------------------- levels & branches

export const MAX_LEVEL = 5;
export const BRANCH_LEVEL = 4;
/** gold to go from level L-1 to L, as a fraction of the base cost */
export const LEVEL_COST = [0, 0, 0.6, 0.8, 1.0, 1.3];
/** HP & damage multiplier at level L (≈ invested value, slightly rewarding upgrades) */
export const LEVEL_MUL = [0, 1, 1.65, 2.5, 3.55, 4.95];
/** v0.7.3: +10 % HP and damage on every player unit (the base units were too weak; the AI gets it too). */
export const UNIT_POWER = 1.1;

export function upgradeCost(id: string, toLevel: number): number {
  return Math.round((UNITS[id].cost * (LEVEL_COST[toLevel] ?? 0)) / 5) * 5;
}
/** total gold invested in a unit at this level */
export function unitValueAt(id: string, level: number): number {
  let v = UNITS[id].cost;
  for (let l = 2; l <= level; l++) v += upgradeCost(id, l);
  return v;
}

export type ResolvedUnit = UnitDef & { level: number; branch: Branch | null; baseId: string };

function scaleAbility(a: Ability, k: number, lvl: number): Ability {
  const r = 1 + 0.04 * (lvl - 1);
  switch (a.kind) {
    case 'heal': return { ...a, amount: a.amount * k };
    case 'shieldStart': case 'shieldPulse': return { ...a, amount: a.amount * k, radius: a.radius * r };
    case 'slowPulse': case 'stunPulse': return { ...a, dmg: a.dmg * k, radius: a.radius * r };
    case 'novaPulse': return { ...a, dmg: a.dmg * k, burn: a.burn * k, radius: a.radius * r };
    case 'poison': return { ...a, dps: a.dps * k, radius: a.radius * r };
    case 'burn': return { ...a, dps: a.dps * k };
    case 'splash': case 'auraAttackSpeed': case 'guardAura': case 'hastePulse': case 'taunt': case 'veilStart': return { ...a, radius: a.radius * r };
    case 'summon': return { ...a, count: a.count + (lvl >= 3 ? 1 : 0) };
    case 'raise': return { ...a, max: a.max + Math.floor((lvl - 1) / 2) };
    default: return a;
  }
}

const resolved = new Map<string, ResolvedUnit>();
/** Stats of a unit at a given level / branch (cached). */
export function unitStats(id: string, level = 1, branch: Branch | null = null): ResolvedUnit {
  const key = `${id}|${level}|${branch ?? ''}`;
  let r = resolved.get(key);
  if (r) return r;
  const u = UNITS[id];
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  const k = LEVEL_MUL[L];
  const br = L >= BRANCH_LEVEL && branch && u.branches ? u.branches[branch === 'A' ? 0 : 1] : null;
  let abilities = u.abilities.slice();
  if (br) {
    if (br.remove) abilities = abilities.filter(a => !br.remove!.includes(a.kind));
    for (const a of br.add ?? []) {
      const i = abilities.findIndex(x => x.kind === a.kind);
      if (i >= 0) abilities[i] = a; else abilities.push(a);
    }
  }
  r = {
    ...u,
    baseId: id,
    level: L,
    branch: br ? branch : null,
    name: br ? br.name : u.name,
    hp: Math.round(u.hp * k * (br?.hp ?? 1) * UNIT_POWER),
    dmg: u.dmg * k * (br?.dmg ?? 1) * UNIT_POWER,
    atkSpeed: u.atkSpeed * (br?.atkSpeed ?? 1),
    armor: Math.min(0.6, u.armor + 0.01 * (L - 1) + (br?.armor ?? 0)),
    range: Math.max(1, u.range + (br?.range ?? 0) + (u.range > 2 ? 0.1 * (L - 1) : 0)),
    moveSpeed: u.moveSpeed * (br?.moveSpeed ?? 1),
    abilities: abilities.map(a => scaleAbility(a, k, L)),
    model: { ...u.model, color: br?.color ?? u.model.color, accent: br?.accent ?? u.model.accent, scale: u.model.scale * (1 + 0.06 * (L - 1)) },
  };
  resolved.set(key, r);
  return r;
}

/** Display name for a build. */
export function unitName(id: string, level = 1, branch: Branch | null = null) { return unitStats(id, level, branch).name; }

export function isTank(id: string) { return UNITS[id].roles.includes('tank'); }
export function isDps(id: string) {
  const r = UNITS[id].roles;
  return r.includes('dps') || r.includes('carry') || r.includes('mage') || r.includes('assassin') || r.includes('aoe');
}
