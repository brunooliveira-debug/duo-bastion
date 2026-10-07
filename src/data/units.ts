import type { UnitDef, FactionId, FactionDef, Ability, Branch, UnitCategory } from './types';

// Six playable armies × six units. Every unit levels 1 → 5; at level 4 it specialises into branch A or B (permanent).
// cost = gold to build at level 1. Level-up prices and stat growth are in LEVEL_* below.

export const FACTIONS: Record<FactionId, FactionDef> = {
  astreens: {
    id: 'astreens', name: 'Ordre Astral', title: 'Précision', color: '#7fb4ff',
    lore: 'Chevaliers-cartographes des constellations brisées.',
    style: 'Frappe de loin, ralentit et achève. Récompense le placement soigné.',
    strengths: ['Très longue portée', 'Ralentissements + bonus contre les ralentis', 'Anti-boss (Lancière)'],
    weaknesses: ['Ligne de front fragile', 'Peu de dégâts de zone', 'Souffre contre les nuées rapides'],
    doctrine: { name: 'Coordination', text: 'Les tirs à distance de l\'Ordre marquent leur cible : +10 % de dégâts subis de toutes les sources (3 s).' },
    help: { name: 'Repérage', text: 'En aidant la voie partenaire, la marque monte à +20 % : ton allié en profite aussi.' },
    units: ['gardien_stellaire', 'loup_astral', 'tireuse_etoile', 'lanciere_eclair', 'harmoniste', 'astromancienne'],
  },
  rouages: {
    id: 'rouages', name: 'Concordat des Rouages', title: 'Forteresse', color: '#f0b04a',
    lore: 'Machines conscientes forgées dans le métal des étoiles mortes.',
    style: 'Blindage, artillerie lourde et étourdissements. Lent mais inébranlable.',
    strengths: ['Unités très résistantes (Blindées)', 'Artillerie de zone à 8 m', 'Étourdissements'],
    weaknesses: ['Cher et lent à démarrer', 'Vulnérable aux attaques Énergie / Arcane', 'Peu de soins'],
    doctrine: { name: 'Optimisation', text: 'Améliorations 10 % moins chères. Les unités en tour tirent 10 % plus vite.' },
    help: { name: 'Réparation', text: 'Chaque ennemi éliminé dans la voie partenaire ou près du Core répare le Core (+0,4 % PV, 4 % max par vague).' },
    units: ['ferraille', 'foreuse', 'bombardiere', 'colosse_forge', 'mecanicienne', 'exarque_prisme'],
  },
  ronces: {
    id: 'ronces', name: 'Les Ronces', title: 'Prolifération', color: '#6fdc7a',
    lore: 'Bêtes et guerriers nés de la forêt-qui-marche.',
    style: 'Poison qui ignore l\'armure, régénération, pousses invoquées et tireuse camouflée.',
    strengths: ['Poison : ignore l\'armure', 'Régénération et invocations', 'Embuscades camouflées'],
    weaknesses: ['Dégâts lents à monter', 'Organiques : craint Physique et Perforant', 'Faible burst contre les boss'],
    doctrine: { name: 'Croissance', text: 'Chaque vague survécue sur le terrain : +3 % PV max pour l\'unité (jusqu\'à +24 %).' },
    help: { name: 'Sève partagée', text: 'En aidant, tes unités laissent une zone de régénération : alliés proches +3 % PV/s pendant 3 s.' },
    units: ['gardien_ecorce', 'lame_ronce', 'rodeuse', 'semeuse', 'druidesse', 'ancien_racine'],
  },
  abysses: {
    id: 'abysses', name: 'Marée Abyssale', title: 'Contrôle', color: '#3fd0c9',
    lore: 'Colosses venus des fosses où dort la lumière.',
    style: 'Ralentit, étourdit et protège. Les vagues se brisent sur tes colosses.',
    strengths: ['Ralentissements et étourdissements', 'Boucliers de groupe', 'Excellents contre les rapides'],
    weaknesses: ['Dégâts modestes', 'Lent à tuer les boss', 'Mystiques : craint l\'Arcane'],
    doctrine: { name: 'Pression des fonds', text: 'Ennemis de ta voie 8 % plus lents. Tes unités gagnent +1 % de dégâts par seconde de combat (max +25 %).' },
    help: { name: 'Courant', text: 'En aidant, tes coups trempent la cible (4 s) : ralentie de 15 %, elle subit +30 % des éclairs et rebonds.' },
    units: ['carapace_abysses', 'ondin', 'harponneuse', 'meduse', 'pretresse', 'kraken'],
  },
  solaires: {
    id: 'solaires', name: 'Brasier Solaire', title: 'Embrasement', color: '#ff7a3d',
    lore: 'Mages qui enferment des soleils dans le verre.',
    style: 'Feu sur la durée, explosions et zone massive. Puissant mais fragile.',
    strengths: ['Brûlures sur la durée', 'Énormes dégâts de zone', 'Accélération des alliés'],
    weaknesses: ['Unités fragiles', 'Coûteux', 'Dépend de sa Paladine pour tenir la ligne'],
    doctrine: { name: 'Ferveur', text: 'Tes unités sous 50 % PV infligent +20 % de dégâts. Un ennemi qui meurt en brûlant explose (1,6 m).' },
    help: { name: 'Étincelle', text: 'En aidant, tes coups embrasent la cible pendant 3 s.' },
    units: ['paladin_aube', 'danse_flamme', 'arbaletriere', 'oracle_braise', 'vestale', 'elementaire'],
  },
  necrose: {
    id: 'necrose', name: 'Voile Nécrose', title: 'Ombres', color: '#c48bff',
    lore: 'Ombres liées à des serments éteints.',
    style: 'Invocations gratuites, assassins camouflés, vol de vie et exécutions.',
    strengths: ['Invocations de squelettes', 'Camouflage et embuscades', 'Exécute les ennemis affaiblis'],
    weaknesses: ['Peu de vrais tanks', 'Invocations fragiles face à la zone', 'Unités légères'],
    doctrine: { name: 'Pacte & Moisson', text: 'Chaque ennemi éliminé renforce tes ombres (+2 % dégâts, max +30 %, jusqu\'à la fin de la vague). Une unité qui tombe a 35 % de chances de se relever en squelette.' },
    help: { name: 'Âmes errantes', text: 'Un ennemi tué dans la voie partenaire a 30 % de chances de se relever en squelette allié.' },
    units: ['garde_os', 'spectre_vif', 'archere_cendres', 'pestifere', 'invocatrice', 'abomination'],
  },
};
export const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];

export const CATEGORY_NAMES: Record<UnitCategory, string> = {
  defense: 'Défense', lourde: 'Lourde', portee: 'Longue portée', antiblindage: 'Anti-blindage',
  zone: 'Zone', soutien: 'Soutien', rapide: 'Rapide', speciale: 'Spéciale',
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
    id: 'gardien_stellaire', name: 'Gardien Stellaire', faction: 'astreens', category: 'defense', cost: 70,
    hp: 600, armor: 0.2, dmg: 14, atkSpeed: 0.9, range: 1.1, moveSpeed: 2.1, attack: 'phys', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'slowOnHit', slow: 0.2, duration: 1.5 }],
    description: 'Chevalier au bouclier d\'étoile gelée.', passiveText: 'Provocation (3 m). Ses coups ralentissent de 20 %.',
    pros: 'Fixe les ennemis et prépare les bonus « contre les ralentis ».', cons: 'Peu de dégâts.',
    branches: [
      { name: 'Rempart Céleste', text: '+30 % PV, +10 % armure, aura : alliés proches -15 % dégâts subis.', hp: 1.3, dmg: 0.8, armor: 0.1, add: [{ kind: 'guardAura', radius: 2.5, pct: 0.15 }], accent: 0xdff0ff },
      { name: 'Lame d\'Orion', text: '+50 % dégâts, +20 % cadence, achève les ennemis affaiblis.', hp: 0.8, dmg: 1.5, atkSpeed: 1.2, add: [{ kind: 'execute', threshold: 0.3, pct: 0.5 }], accent: 0xffe08a },
    ],
    model: { shape: 'paladin', color: 0x4f7fd8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'metal',
  }),
  loup_astral: def({
    id: 'loup_astral', name: 'Loup Astral', faction: 'astreens', category: 'rapide', cost: 65,
    hp: 330, armor: 0, dmg: 18, atkSpeed: 1.3, range: 1.1, moveSpeed: 5, attack: 'perf', defense: 'leg', roles: ['dps', 'assassin'],
    abilities: [{ kind: 'interceptor', radius: 10 }, { kind: 'bonusVsDef', def: 'leg', pct: 0.25 }],
    description: 'Prédateur stellaire qui traque les fuyards.', passiveText: 'Chasseur : poursuit en priorité les ennemis rapides et ceux qui filent vers le Core. +25 % contre Légers.',
    pros: 'Rattrape les fuites, idéal contre les Coureurs.', cons: 'Fragile au corps à corps prolongé.',
    branches: [
      { name: 'Loup-Comète', text: '+30 % dégâts, +20 % vitesse, vol de vie 15 %.', dmg: 1.3, moveSpeed: 1.2, add: [{ kind: 'lifesteal', pct: 0.15 }], color: 0x6a8aff, accent: 0xffffff },
      { name: 'Alpha Stellaire', text: '+40 % PV, aura de meute : +20 % vitesse d\'attaque aux alliés proches.', hp: 1.4, add: [{ kind: 'auraAttackSpeed', radius: 2.5, pct: 0.2 }], color: 0x3a5aa8, accent: 0xbfe0ff },
    ],
    model: { shape: 'wolf', color: 0x5a7ad8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'slash',
  }),
  tireuse_etoile: def({
    id: 'tireuse_etoile', name: 'Tireuse d\'Étoiles', faction: 'astreens', category: 'portee', cost: 90, tower: 'archer',
    hp: 230, armor: 0, dmg: 25, atkSpeed: 1.1, range: 5.5, moveSpeed: 2.4, attack: 'perf', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsSlowed', pct: 0.3 }],
    description: 'Archère qui tire des éclats de constellation.', passiveText: 'Marque stellaire : +30 % dégâts contre les ennemis ralentis.',
    pros: 'Longue portée, excellent rapport dégâts/prix.', cons: 'Très fragile si la ligne cède.',
    branches: [
      { name: 'Chasseresse Nova', text: '+30 % dégâts, +1 m portée, +30 % contre les ennemis < 30 % PV.', dmg: 1.3, range: 1, add: [{ kind: 'execute', threshold: 0.3, pct: 0.3 }], color: 0x3a6ee8, accent: 0xffffff },
      { name: 'Pluie d\'Argent', text: 'Flèches multiples : touche aussi les ennemis autour de la cible (45 %).', dmg: 0.95, add: [{ kind: 'splash', radius: 1.3, pct: 0.45 }], color: 0x8aa8e8, accent: 0xe8f0ff },
    ],
    model: { shape: 'archer', color: 0x4f7fd8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'arrow',
  }),
  lanciere_eclair: def({
    id: 'lanciere_eclair', name: 'Lancière d\'Éclair', faction: 'astreens', category: 'antiblindage', cost: 110, tower: 'spire',
    hp: 270, armor: 0.05, dmg: 44, atkSpeed: 0.7, range: 4.5, moveSpeed: 2.3, attack: 'ener', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsBig', pct: 0.5 }, { kind: 'pierce', pct: 0.4 }],
    description: 'Ses javelots de foudre percent les carapaces.', passiveText: '+50 % contre les boss et colosses. Ignore 40 % de l\'armure.',
    pros: 'Tueuse de boss et de blindés.', cons: 'Cadence lente : faible contre les nuées.',
    branches: [
      { name: 'Foudre-Lance', text: 'L\'éclair rebondit sur 2 ennemis (50 %).', add: [{ kind: 'chain', targets: 2, pct: 0.5, range: 3 }], color: 0x5a8aff, accent: 0x9ffcff },
      { name: 'Brise-Colosse', text: '+100 % contre les gros, +25 % dégâts, étourdit parfois.', dmg: 1.25, atkSpeed: 0.9, add: [{ kind: 'bonusVsBig', pct: 1 }, { kind: 'stunOnHit', chance: 0.2, duration: 0.6 }], color: 0x2a4aa8, accent: 0xffe08a },
    ],
    model: { shape: 'lancer', color: 0x5a7ad8, accent: 0x9ffcff, scale: 1 }, fx: 'lightning', sfx: 'zap',
  }),
  harmoniste: def({
    id: 'harmoniste', name: 'Harmoniste Astral', faction: 'astreens', category: 'soutien', cost: 100, tower: 'shrine',
    hp: 320, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.3, attack: 'ener', defense: 'leg', roles: ['support', 'aura'],
    abilities: [{ kind: 'auraAttackSpeed', radius: 3, pct: 0.2 }, { kind: 'hastePulse', every: 9, radius: 3.5, pct: 0.35, duration: 3 }, { kind: 'heal', every: 3, amount: 25, range: 4 }],
    description: 'Chante la fréquence des étoiles.', skillText: 'Crescendo (9 s) : +35 % vitesse d\'attaque aux alliés proches pendant 3 s.',
    passiveText: 'Aura : +20 % vitesse d\'attaque (3 m). Soin léger (3 s).',
    pros: 'Multiplie les dégâts de toute l\'équipe.', cons: 'Inutile seule.',
    branches: [
      { name: 'Grand Harmoniste', text: 'Aura +35 %, soins doublés.', hp: 1.2, add: [{ kind: 'auraAttackSpeed', radius: 3.5, pct: 0.35 }, { kind: 'heal', every: 3, amount: 50, range: 4.5 }], accent: 0xffffff },
      { name: 'Chef de Chœur', text: 'Crescendo toutes les 7 s (+60 %) et bouclier de départ.', add: [{ kind: 'hastePulse', every: 7, radius: 4, pct: 0.6, duration: 3 }, { kind: 'shieldStart', amount: 90, radius: 3 }], color: 0x6a7aff, accent: 0xffe08a },
    ],
    model: { shape: 'bard', color: 0x8aa8ff, accent: 0xfff6c0, scale: 1 }, fx: 'note', sfx: 'chime',
  }),
  astromancienne: def({
    id: 'astromancienne', name: 'Astromancienne', faction: 'astreens', category: 'zone', cost: 135, tower: 'ice',
    hp: 270, armor: 0, dmg: 36, atkSpeed: 0.6, range: 5, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.6, pct: 0.6 }, { kind: 'slowOnHit', slow: 0.3, duration: 2 }],
    description: 'Elle fait tomber des fragments d\'étoiles glacées.', passiveText: 'Zone (1,6 m, 60 %). Ralentit sa cible de 30 %.',
    pros: 'La seule vraie zone de l\'Ordre, alimente les bonus « ralentis ».', cons: 'Fragile, cadence lente.',
    branches: [
      { name: 'Gravitonne', text: 'Puits de gravité : onde qui ralentit de 50 % autour d\'elle.', add: [{ kind: 'slowPulse', every: 5, radius: 3, slow: 0.5, duration: 2, dmg: 30 }, { kind: 'splash', radius: 2, pct: 0.6 }], color: 0x3a3a9a, accent: 0xb0a0ff },
      { name: 'Supernova', text: '+60 % dégâts, zone à 90 %.', dmg: 1.6, atkSpeed: 0.85, add: [{ kind: 'splash', radius: 1.8, pct: 0.9 }], color: 0x8a5ae8, accent: 0xfff0a0 },
    ],
    model: { shape: 'mage', color: 0x3a5aa8, accent: 0xbfe0ff, scale: 1 }, fx: 'star', sfx: 'zap',
  }),

  // ======================================================== CONCORDAT DES ROUAGES
  ferraille: def({
    id: 'ferraille', name: 'Sentinelle Ferraille', faction: 'rouages', category: 'defense', cost: 65,
    hp: 560, armor: 0.15, dmg: 15, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.2, attack: 'phys', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3.5 }],
    description: 'Golem de récupération bon marché.', skillText: 'Provocation : les ennemis à 3,5 m le ciblent en priorité.', passiveText: 'Plaques recyclées : 15 % d\'armure.',
    pros: 'Le tank le moins cher du jeu.', cons: 'Blindé : craint l\'Énergie.',
    branches: [
      { name: 'Bastion Ferraille', text: '+40 % PV, +10 % armure, renvoie 25 % des dégâts de mêlée.', hp: 1.4, armor: 0.1, atkSpeed: 0.8, add: [{ kind: 'thorns', pct: 0.25 }], color: 0xc9944a, accent: 0xfff0a0 },
      { name: 'Broyeur', text: '+80 % dégâts en zone, plus rapide, un peu moins solide.', hp: 0.85, dmg: 1.8, atkSpeed: 1.2, add: [{ kind: 'splash', radius: 1, pct: 0.5 }], color: 0x9a6a3a, accent: 0xff8a3a },
    ],
    model: { shape: 'golem', color: 0xb98a4a, accent: 0xffd27a, scale: 1 }, fx: 'spark', sfx: 'metal',
  }),
  foreuse: def({
    id: 'foreuse', name: 'Foreuse Rouage', faction: 'rouages', category: 'antiblindage', cost: 90,
    hp: 430, armor: 0.1, dmg: 29, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.5, attack: 'ener', defense: 'bli', roles: ['dps'],
    abilities: [{ kind: 'pierce', pct: 0.6 }, { kind: 'bonusVsDef', def: 'bli', pct: 0.35 }],
    description: 'Automate-mineur à mèche tournante.', passiveText: 'Ignore 60 % de l\'armure. +35 % contre les Blindés.',
    pros: 'Fond les cuirassés et les boss blindés.', cons: 'Médiocre contre les Organiques et les nuées.',
    branches: [
      { name: 'Tarière', text: 'Ignore toute l\'armure, ses coups fragilisent la cible (+20 % dégâts subis).', dmg: 1.2, add: [{ kind: 'pierce', pct: 1 }, { kind: 'armorShred', pct: 0.2, duration: 3 }], color: 0x8a6a4a, accent: 0xff5a3a },
      { name: 'Perforatrice Turbo', text: '+50 % cadence, accélère à chaque coup.', atkSpeed: 1.5, moveSpeed: 1.3, add: [{ kind: 'ramp', perHit: 0.05, max: 0.4 }], color: 0xd8a04a, accent: 0x9ffcff },
    ],
    model: { shape: 'driller', color: 0xb07a3a, accent: 0xffd27a, scale: 1 }, fx: 'spark', sfx: 'metal',
  }),
  bombardiere: def({
    id: 'bombardiere', name: 'Bombardière', faction: 'rouages', category: 'portee', cost: 130, tower: 'cannon',
    hp: 250, armor: 0.05, dmg: 54, atkSpeed: 0.45, range: 7.5, moveSpeed: 1.8, attack: 'phys', defense: 'bli', roles: ['ranged', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.3, pct: 0.55 }],
    description: 'Une ingénieure et son mortier à vapeur.', passiveText: 'Obus explosifs : 55 % des dégâts autour de l\'impact. Portée 7,5 m.',
    pros: 'Tire de très loin, ravage les groupes.', cons: 'Très lente, fragile, inefficace contre une cible isolée rapide.',
    branches: [
      { name: 'Mortier Céleste', text: '+1,5 m portée, +20 % dégâts, explosions plus larges.', dmg: 1.2, atkSpeed: 0.9, range: 1.5, add: [{ kind: 'splash', radius: 1.8, pct: 0.6 }], color: 0x8a5a2a, accent: 0xffb547 },
      { name: 'Mitrailleuse', text: 'Cadence x2,2 mais petites balles (zone réduite).', dmg: 0.55, atkSpeed: 2.2, range: -1.5, add: [{ kind: 'splash', radius: 0.9, pct: 0.3 }], color: 0x5a6a7a, accent: 0xffe08a },
    ],
    model: { shape: 'bomber', color: 0xb07a3a, accent: 0xffd27a, scale: 1 }, fx: 'shell', sfx: 'boom',
  }),
  colosse_forge: def({
    id: 'colosse_forge', name: 'Colosse de Forge', faction: 'rouages', category: 'lourde', tier: 3, cost: 155,
    hp: 1250, armor: 0.15, dmg: 62, atkSpeed: 0.5, range: 1.3, moveSpeed: 1.6, attack: 'phys', defense: 'bli', roles: ['tank', 'dps', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.3, pct: 0.5 }, { kind: 'stunOnHit', chance: 0.2, duration: 0.8 }],
    description: 'Géant de laiton au marteau-pilon.', passiveText: 'Ses coups frappent en zone et étourdissent parfois (20 %, 0,8 s).',
    pros: 'Tank qui fait aussi mal.', cons: 'Pas de provocation, très lent.',
    branches: [
      { name: 'Titan d\'Airain', text: '+35 % PV, +10 % armure, étourdit plus souvent et plus longtemps.', hp: 1.35, armor: 0.1, atkSpeed: 0.85, add: [{ kind: 'stunOnHit', chance: 0.35, duration: 1 }, { kind: 'taunt', radius: 2.5 }], color: 0x8a6a3a, accent: 0xffd27a },
      { name: 'Marteau-Pilon', text: '+50 % cadence, +10 % dégâts, moins résistant.', hp: 0.8, dmg: 1.1, atkSpeed: 1.5, color: 0xc96a2a, accent: 0xff5a3a },
    ],
    model: { shape: 'colossus', color: 0xa87a3a, accent: 0xffb547, scale: 1.15 }, fx: 'spark', sfx: 'boom',
  }),
  mecanicienne: def({
    id: 'mecanicienne', name: 'Mécanicienne', faction: 'rouages', category: 'soutien', cost: 100, tower: 'shrine',
    hp: 340, armor: 0.1, dmg: 12, atkSpeed: 1.0, range: 3.5, moveSpeed: 2.3, attack: 'ener', defense: 'bli', roles: ['support'],
    abilities: [{ kind: 'heal', every: 3.5, amount: 40, range: 4 }, { kind: 'shieldPulse', every: 8, amount: 55, radius: 3 }],
    description: 'Clé à molette et rivets de fortune.', skillText: 'Blindage d\'urgence (8 s) : bouclier de 55 aux alliés proches.', passiveText: 'Répare l\'allié le plus abîmé (40 PV / 3,5 s).',
    pros: 'Garde la ligne de front debout.', cons: 'Faibles dégâts.',
    branches: [
      { name: 'Ingénieure de Siège', text: 'Boucliers doublés et aura : -15 % dégâts subis.', add: [{ kind: 'shieldPulse', every: 7, amount: 110, radius: 3.3 }, { kind: 'guardAura', radius: 3, pct: 0.15 }], color: 0x8a6a4a, accent: 0x9ffcff },
      { name: 'Tourelle Auto', text: 'Déploie une tourelle au début du combat ; +100 % dégâts.', dmg: 2, add: [{ kind: 'summon', unit: 'tourelle', count: 1 }], color: 0xb08a3a, accent: 0xff8a3a },
    ],
    model: { shape: 'mechanic', color: 0xb07a3a, accent: 0x9ffcff, scale: 1 }, fx: 'spark', sfx: 'metal',
  }),
  exarque_prisme: def({
    id: 'exarque_prisme', name: 'Exarque Prisme', faction: 'rouages', category: 'speciale', tier: 5, cost: 280, tower: 'mage',
    hp: 950, armor: 0.1, dmg: 74, atkSpeed: 0.9, range: 4.2, moveSpeed: 2.0, attack: 'ener', defense: 'bli', roles: ['carry', 'hybrid'],
    abilities: [{ kind: 'chain', targets: 2, pct: 0.6, range: 3 }],
    description: 'Automate-cristal qui décompose la lumière en éclairs.', passiveText: 'Réfraction : chaque tir rebondit sur 2 ennemis (60 %).',
    pros: 'Carry polyvalent, excellent contre tout.', cons: 'Très cher : retarde l\'armée et l\'économie.',
    branches: [
      { name: 'Exarque Ascendant', text: '3 rebonds à 75 %, accélère à chaque tir.', add: [{ kind: 'chain', targets: 3, pct: 0.75, range: 3.5 }, { kind: 'ramp', perHit: 0.03, max: 0.3 }], color: 0xb49cff, accent: 0xffffff },
      { name: 'Prisme Focal', text: '+60 % dégâts, +1 m portée, +50 % contre les gros (1 rebond).', dmg: 1.6, range: 1, add: [{ kind: 'chain', targets: 1, pct: 0.5, range: 3 }, { kind: 'bonusVsBig', pct: 0.5 }], color: 0x7a5aff, accent: 0xff9ad6 },
    ],
    model: { shape: 'prism', color: 0x9a7cff, accent: 0x9ffcff, scale: 1.15 }, fx: 'lightning', sfx: 'zap',
  }),

  // ======================================================== LES RONCES
  gardien_ecorce: def({
    id: 'gardien_ecorce', name: 'Gardien d\'Écorce', faction: 'ronces', category: 'defense', cost: 70,
    hp: 640, armor: 0.08, dmg: 13, atkSpeed: 0.9, range: 1.1, moveSpeed: 2, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'regen', pct: 0.02 }, { kind: 'thorns', pct: 0.15 }],
    description: 'Un arbre qui a appris à marcher… et à encaisser.', passiveText: 'Provocation. Régénère 2 % PV/s. Épines 15 %.',
    pros: 'Se soigne seul, tient longtemps.', cons: 'Organique : craint le Physique.',
    branches: [
      { name: 'Chêne Millénaire', text: '+40 % PV, régénération 3 %/s, provocation plus large.', hp: 1.4, add: [{ kind: 'regen', pct: 0.03 }, { kind: 'taunt', radius: 4 }], color: 0x5a4a2a, accent: 0x9aff7a },
      { name: 'Ronce Vengeresse', text: 'Épines 50 %, +60 % dégâts, ralentit au toucher.', dmg: 1.6, add: [{ kind: 'thorns', pct: 0.5 }, { kind: 'slowOnHit', slow: 0.25, duration: 1.5 }], color: 0x3a5a2a, accent: 0xff6a8a },
    ],
    model: { shape: 'treant', color: 0x6a5232, accent: 0x7adc6a, scale: 1 }, fx: 'leaf', sfx: 'slash',
  }),
  lame_ronce: def({
    id: 'lame_ronce', name: 'Lame-Ronce', faction: 'ronces', category: 'rapide', cost: 75,
    hp: 340, armor: 0, dmg: 27, atkSpeed: 1.25, range: 1.1, moveSpeed: 2.9, attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [{ kind: 'ramp', perHit: 0.06, max: 0.5 }],
    description: 'Duelliste végétale qui accélère à chaque coup.', passiveText: 'Frénésie : +6 % vitesse d\'attaque par coup (max +50 %).',
    pros: 'Meilleurs dégâts de mêlée pour le prix.', cons: 'Doit rester en vie pour monter en puissance.',
    branches: [
      { name: 'Faucheuse-Ronce', text: 'Vol de vie 15 %, frénésie jusqu\'à +70 %.', add: [{ kind: 'lifesteal', pct: 0.15 }, { kind: 'ramp', perHit: 0.07, max: 0.7 }], color: 0x2f8a3c, accent: 0xe4ff8a },
      { name: 'Épine Venimeuse', text: 'Ses lames empoisonnent (ignore l\'armure).', dmg: 1.1, add: [{ kind: 'poison', dps: 12, duration: 3, radius: 0 }], color: 0x4a7a2a, accent: 0xc0ff4a },
    ],
    model: { shape: 'blade', color: 0x3f9e4f, accent: 0xb4ff7a, scale: 1 }, fx: 'leaf', sfx: 'slash',
  }),
  rodeuse: def({
    id: 'rodeuse', name: 'Rôdeuse des Fourrés', faction: 'ronces', category: 'speciale', cost: 95, tower: 'archer',
    hp: 240, armor: 0, dmg: 32, atkSpeed: 0.9, range: 5, moveSpeed: 2.6, attack: 'perf', defense: 'org', roles: ['ranged', 'assassin'],
    abilities: [{ kind: 'stealth', ambush: 0.6 }],
    description: 'Invisible dans les feuillages jusqu\'au premier tir.', passiveText: 'Camouflage : les ennemis ne la voient pas tant qu\'elle ne tire pas. Embuscade : +60 % au premier tir.',
    pros: 'Rarement ciblée, idéale derrière la ligne.', cons: 'Repérée dès qu\'elle tire ; fragile.',
    branches: [
      { name: 'Ombre Sylvestre', text: 'Embuscade +120 %, +30 % dégâts, se recamoufle plus vite.', dmg: 1.3, add: [{ kind: 'stealth', ambush: 1.2 }], color: 0x2a4a2a, accent: 0x9aff7a },
      { name: 'Sarbacane', text: 'Fléchettes empoisonnées en zone, +20 % cadence.', atkSpeed: 1.2, add: [{ kind: 'poison', dps: 14, duration: 4, radius: 1.1 }], color: 0x5a7a2a, accent: 0xd8ff4a },
    ],
    model: { shape: 'archer', color: 0x3a6a3a, accent: 0xb4ff7a, scale: 1 }, fx: 'leaf', sfx: 'arrow',
  }),
  semeuse: def({
    id: 'semeuse', name: 'Semeuse de Spores', faction: 'ronces', category: 'zone', cost: 105, tower: 'poison',
    hp: 300, armor: 0, dmg: 12, atkSpeed: 0.8, range: 4, moveSpeed: 2.2, attack: 'perf', defense: 'org', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'poison', dps: 9, duration: 4, radius: 1.6 }, { kind: 'slowOnHit', slow: 0.2, duration: 1.5 }],
    description: 'Plante-mère qui crache des nuages de spores.', passiveText: 'Poison de zone (1,6 m) : 9 dégâts/s pendant 4 s, ignore l\'armure.',
    pros: 'Dévaste les nuées et les blindés lents.', cons: 'Lente à tuer une cible seule.',
    branches: [
      { name: 'Mère-Spore', text: 'Poison x1,8 sur une zone plus large.', add: [{ kind: 'poison', dps: 18, duration: 4, radius: 2.1 }], color: 0x6a8a2a, accent: 0xe4ff4a },
      { name: 'Pollen Soporifique', text: 'Nuage qui étourdit tout autour (1,2 s toutes les 7 s).', add: [{ kind: 'stunPulse', every: 7, radius: 2.6, duration: 1.2, dmg: 15 }], color: 0xb07ab0, accent: 0xffd0ff },
    ],
    model: { shape: 'sower', color: 0x5a8a3a, accent: 0xd8ff6a, scale: 1 }, fx: 'poison', sfx: 'whoosh',
  }),
  druidesse: def({
    id: 'druidesse', name: 'Druidesse', faction: 'ronces', category: 'soutien', cost: 95, tower: 'shrine',
    hp: 330, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.2, attack: 'arca', defense: 'org', roles: ['support'],
    abilities: [{ kind: 'heal', every: 2.5, amount: 34, range: 4 }],
    description: 'Gardienne des sèves anciennes.', passiveText: 'Soigne l\'allié le plus blessé (34 PV / 2,5 s).',
    pros: 'Meilleurs soins du jeu.', cons: 'Ne protège pas des pics de dégâts.',
    branches: [
      { name: 'Gardienne de Sève', text: 'Soins toutes les 1,6 s et régénération des alliés.', hp: 1.2, add: [{ kind: 'heal', every: 1.6, amount: 40, range: 4.5 }, { kind: 'regen', pct: 0.01 }], color: 0x3a7a3a, accent: 0xb4ff7a },
      { name: 'Éveilleuse', text: 'Invoque 2 pousses et accélère ses alliés (+30 %).', add: [{ kind: 'summon', unit: 'pousse', count: 2 }, { kind: 'hastePulse', every: 10, radius: 3.5, pct: 0.3, duration: 4 }], color: 0x6a5a2a, accent: 0xffe08a },
    ],
    model: { shape: 'druid', color: 0x4a8a4a, accent: 0xd8ff8a, scale: 1 }, fx: 'leaf', sfx: 'chime',
  }),
  ancien_racine: def({
    id: 'ancien_racine', name: 'Ancien des Racines', faction: 'ronces', category: 'lourde', tier: 3, cost: 160,
    hp: 1100, armor: 0.1, dmg: 40, atkSpeed: 0.6, range: 1.3, moveSpeed: 1.6, attack: 'phys', defense: 'org', roles: ['tank', 'summoner'],
    abilities: [{ kind: 'summon', unit: 'pousse', count: 2 }, { kind: 'slowPulse', every: 6, radius: 2.6, slow: 0.4, duration: 2, dmg: 20 }],
    description: 'Le plus vieil arbre de la forêt-qui-marche.', skillText: 'Secousse (6 s) : ralentit de 40 % autour de lui.', passiveText: 'Fait pousser 2 pousses au début du combat.',
    pros: 'Masse de PV + invocations gratuites.', cons: 'Très lent, cher.',
    branches: [
      { name: 'Arbre-Monde', text: '+50 % PV, 4 pousses.', hp: 1.5, add: [{ kind: 'summon', unit: 'pousse', count: 4 }], color: 0x5a4a2a, accent: 0x7aff6a },
      { name: 'Tempête de Ronces', text: 'Ses coups empoisonnent en zone.', dmg: 1.3, add: [{ kind: 'poison', dps: 20, duration: 4, radius: 2 }], color: 0x3a4a2a, accent: 0xd8ff4a },
    ],
    model: { shape: 'treant', color: 0x5a4628, accent: 0x9aff7a, scale: 1.45 }, fx: 'leaf', sfx: 'boom',
  }),

  // ======================================================== MARÉE ABYSSALE
  carapace_abysses: def({
    id: 'carapace_abysses', name: 'Carapace des Abysses', faction: 'abysses', category: 'lourde', tier: 3, cost: 125,
    hp: 1350, armor: 0.2, dmg: 29, atkSpeed: 0.75, range: 1.2, moveSpeed: 1.8, attack: 'phys', defense: 'mys', roles: ['tank', 'aoe'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'slowPulse', every: 5, radius: 2.6, slow: 0.35, duration: 2.5, dmg: 20 }],
    description: 'Tortue-colosse qui libère des vagues glacées.', skillText: 'Onde de marée (5 s) : ralentit de 35 % autour d\'elle.', passiveText: 'Provocation (3 m). 20 % d\'armure.',
    pros: 'Mur vivant qui ralentit tout.', cons: 'Faibles dégâts.',
    branches: [
      { name: 'Léviathan', text: '+40 % PV, onde plus large qui ralentit de 50 %.', hp: 1.4, add: [{ kind: 'slowPulse', every: 4.5, radius: 3.2, slow: 0.5, duration: 3, dmg: 30 }], color: 0x13707f, accent: 0xa8ffff },
      { name: 'Tortue-Bélier', text: 'Dégâts x2, ses charges étourdissent.', dmg: 2, atkSpeed: 1.1, add: [{ kind: 'stunOnHit', chance: 0.3, duration: 1 }], color: 0x2a6a5a, accent: 0xffd27a },
    ],
    model: { shape: 'turtle', color: 0x1f8f9a, accent: 0x7ff6ff, scale: 1.1 }, fx: 'water', sfx: 'wave',
  }),
  ondin: def({
    id: 'ondin', name: 'Ondin Lame-Courant', faction: 'abysses', category: 'rapide', cost: 65,
    hp: 380, armor: 0, dmg: 24, atkSpeed: 1.2, range: 1.1, moveSpeed: 4, attack: 'perf', defense: 'org', roles: ['dps', 'assassin'],
    abilities: [{ kind: 'dash', range: 7 }, { kind: 'slowOnHit', slow: 0.3, duration: 1.5 }],
    description: 'Guerrier-poisson au trident.', skillText: 'Vague-éclair : bondit sur un ennemi à 7 m au début du combat.', passiveText: 'Ses coups ralentissent de 30 %.',
    pros: 'Rapide, gêne les ennemis dès le début.', cons: 'Peu résistant.',
    branches: [
      { name: 'Requin des Fosses', text: '+40 % dégâts, achève et se soigne.', dmg: 1.4, add: [{ kind: 'execute', threshold: 0.35, pct: 0.5 }, { kind: 'lifesteal', pct: 0.1 }], color: 0x2a5a7a, accent: 0xff6a6a },
      { name: 'Danseur des Marées', text: '+40 % cadence, ralentit de 45 %.', atkSpeed: 1.4, add: [{ kind: 'slowOnHit', slow: 0.45, duration: 2 }], color: 0x3ab0b0, accent: 0xe0ffff },
    ],
    model: { shape: 'merman', color: 0x2a9aa0, accent: 0x9ffcff, scale: 1 }, fx: 'water', sfx: 'slash',
  }),
  harponneuse: def({
    id: 'harponneuse', name: 'Harponneuse', faction: 'abysses', category: 'portee', cost: 95, tower: 'archer',
    hp: 270, armor: 0, dmg: 44, atkSpeed: 0.7, range: 5, moveSpeed: 2.3, attack: 'perf', defense: 'mys', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsBig', pct: 0.4 }, { kind: 'slowOnHit', slow: 0.3, duration: 2 }],
    description: 'Ses harpons clouent les géants.', passiveText: '+40 % contre les gros ennemis. Ralentit sa cible de 30 %.',
    pros: 'Bonne contre les boss et les mini-boss.', cons: 'Cadence lente.',
    branches: [
      { name: 'Baleinière', text: '+100 % contre les gros, +30 % dégâts, perce l\'armure.', dmg: 1.3, add: [{ kind: 'bonusVsBig', pct: 1 }, { kind: 'pierce', pct: 0.4 }], color: 0x1a5a6a, accent: 0xffe08a },
      { name: 'Filet de Corail', text: 'Filets : zone qui ralentit de 50 %.', add: [{ kind: 'splash', radius: 1.4, pct: 0.5 }, { kind: 'slowOnHit', slow: 0.5, duration: 2 }], color: 0xc06a6a, accent: 0xffb0a0 },
    ],
    model: { shape: 'lancer', color: 0x1f8f9a, accent: 0x7ff6ff, scale: 1 }, fx: 'water', sfx: 'arrow',
  }),
  meduse: def({
    id: 'meduse', name: 'Méduse Abyssale', faction: 'abysses', category: 'zone', cost: 110, tower: 'spire',
    hp: 320, armor: 0, dmg: 21, atkSpeed: 0.8, range: 3.5, moveSpeed: 2, attack: 'ener', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'chain', targets: 2, pct: 0.7, range: 2.8 }, { kind: 'stunOnHit', chance: 0.15, duration: 0.8 }],
    description: 'Ses filaments électriques sautent d\'ennemi en ennemi.', passiveText: 'Arc électrique : rebondit sur 2 ennemis. 15 % de chance d\'étourdir.',
    pros: 'Contrôle de foule, anti-Blindés (Énergie).', cons: 'Faibles dégâts directs.',
    branches: [
      { name: 'Méduse-Tempête', text: '4 rebonds à 70 %.', add: [{ kind: 'chain', targets: 4, pct: 0.7, range: 3 }], color: 0x6a3ab0, accent: 0x9ffcff },
      { name: 'Reine Urticante', text: 'Décharge : étourdit tout autour (1,2 s toutes les 6 s).', add: [{ kind: 'stunPulse', every: 6, radius: 2.8, duration: 1.2, dmg: 30 }], color: 0xb04a9a, accent: 0xffb0ff },
    ],
    model: { shape: 'jelly', color: 0x6a8aff, accent: 0xd0f8ff, scale: 1 }, fx: 'lightning', sfx: 'zap',
  }),
  pretresse: def({
    id: 'pretresse', name: 'Prêtresse des Marées', faction: 'abysses', category: 'soutien', cost: 95, tower: 'shrine',
    hp: 340, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['support'],
    abilities: [{ kind: 'shieldPulse', every: 6, amount: 85, radius: 3.4 }, { kind: 'heal', every: 4, amount: 30, range: 4 }],
    description: 'Elle tisse des boucliers d\'eau vive.', skillText: 'Bulle (6 s) : bouclier de 85 aux alliés proches.', passiveText: 'Soin léger (30 PV / 4 s).',
    pros: 'Annule les pics de dégâts.', cons: 'Faibles dégâts.',
    branches: [
      { name: 'Grande Prêtresse', text: 'Bulles doublées toutes les 5 s.', add: [{ kind: 'shieldPulse', every: 5, amount: 140, radius: 3.6 }], color: 0x2a7aaa, accent: 0xffffff },
      { name: 'Chantre des Abysses', text: 'Auras : -20 % dégâts subis et +15 % cadence.', add: [{ kind: 'guardAura', radius: 3, pct: 0.2 }, { kind: 'auraAttackSpeed', radius: 3, pct: 0.15 }], color: 0x1a4a6a, accent: 0x7ff6ff },
    ],
    model: { shape: 'priestess', color: 0x2a8aaa, accent: 0xa8ffff, scale: 1 }, fx: 'water', sfx: 'chime',
  }),
  kraken: def({
    id: 'kraken', name: 'Rejeton du Kraken', faction: 'abysses', category: 'speciale', tier: 4, cost: 190,
    hp: 1150, armor: 0.1, dmg: 46, atkSpeed: 0.8, range: 2.5, moveSpeed: 1.6, attack: 'phys', defense: 'mys', roles: ['tank', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.6, pct: 0.5 }, { kind: 'stunOnHit', chance: 0.25, duration: 1.2 }, { kind: 'taunt', radius: 2 }],
    description: 'Ses tentacules balaient et étreignent.', passiveText: 'Balayage de zone (2,5 m). 25 % de chance d\'étreindre (étourdit 1,2 s).',
    pros: 'Contrôle massif en première ligne.', cons: 'Cher, Mystique (craint l\'Arcane).',
    branches: [
      { name: 'Kraken Ancestral', text: '+50 % PV, tentacules plus longs et plus larges.', hp: 1.5, range: 1, add: [{ kind: 'splash', radius: 2.2, pct: 0.55 }], color: 0x3a2a6a, accent: 0x9ffcff },
      { name: 'Abysse Vorace', text: '+60 % dégâts, vol de vie 30 %, achève.', dmg: 1.6, add: [{ kind: 'lifesteal', pct: 0.3 }, { kind: 'execute', threshold: 0.25, pct: 0.6 }], color: 0x6a1a3a, accent: 0xff6a8a },
    ],
    model: { shape: 'kraken', color: 0x5a3a8a, accent: 0x7ff6ff, scale: 1.2 }, fx: 'water', sfx: 'wave',
  }),

  // ======================================================== BRASIER SOLAIRE
  paladin_aube: def({
    id: 'paladin_aube', name: 'Paladine de l\'Aube', faction: 'solaires', category: 'defense', cost: 100,
    hp: 700, armor: 0.2, dmg: 17, atkSpeed: 0.9, range: 1.2, moveSpeed: 2.2, attack: 'phys', defense: 'mys', roles: ['tank', 'support'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'guardAura', radius: 2.5, pct: 0.12 }],
    description: 'Son bouclier solaire protège ceux qui l\'entourent.', passiveText: 'Provocation. Aura : alliés proches -12 % dégâts subis.',
    pros: 'Protège les mages fragiles.', cons: 'Chère pour un tank.',
    branches: [
      { name: 'Paladine du Zénith', text: '+35 % PV, bouclier de départ pour les alliés.', hp: 1.35, add: [{ kind: 'shieldStart', amount: 140, radius: 2.5 }], color: 0xe8b04a, accent: 0xffffff },
      { name: 'Croisée Ardente', text: '+50 % dégâts, ses coups brûlent.', dmg: 1.5, add: [{ kind: 'burn', dps: 18, duration: 3 }], color: 0xc8401a, accent: 0xffd36a },
    ],
    model: { shape: 'paladin', color: 0xd88a3a, accent: 0xfff2a0, scale: 1 }, fx: 'fire', sfx: 'metal',
  }),
  danse_flamme: def({
    id: 'danse_flamme', name: 'Danse-Flamme', faction: 'solaires', category: 'rapide', cost: 85,
    hp: 310, armor: 0, dmg: 22, atkSpeed: 1.3, range: 1.1, moveSpeed: 3.2, attack: 'ener', defense: 'leg', roles: ['dps'],
    abilities: [{ kind: 'burn', dps: 9, duration: 3 }],
    description: 'Duelliste aux cimeterres incandescents.', passiveText: 'Brûlure : 9 dégâts/s pendant 3 s.',
    pros: 'Gros dégâts sur la durée, rapide.', cons: 'Légère et fragile.',
    branches: [
      { name: 'Lame Solaire', text: '+30 % dégâts, frénésie (+60 % cadence max).', dmg: 1.3, add: [{ kind: 'ramp', perHit: 0.07, max: 0.6 }], color: 0xe8701a, accent: 0xffffff },
      { name: 'Tourbillon Ardent', text: 'Attaques en zone, brûlure renforcée.', add: [{ kind: 'splash', radius: 1.2, pct: 0.6 }, { kind: 'burn', dps: 16, duration: 3 }], color: 0xb0301a, accent: 0xffb547 },
    ],
    model: { shape: 'duelist', color: 0xd8572a, accent: 0xffd36a, scale: 1 }, fx: 'fire', sfx: 'slash',
  }),
  arbaletriere: def({
    id: 'arbaletriere', name: 'Arbalétrière Solaire', faction: 'solaires', category: 'antiblindage', cost: 100, tower: 'archer',
    hp: 240, armor: 0, dmg: 30, atkSpeed: 1.0, range: 5.5, moveSpeed: 2.3, attack: 'ener', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'armorShred', pct: 0.15, duration: 3 }, { kind: 'burn', dps: 6, duration: 3 }],
    description: 'Carreaux chauffés à blanc.', passiveText: 'Ses carreaux fragilisent (+15 % dégâts subis) et brûlent.',
    pros: 'Prépare les cibles blindées pour toute l\'équipe.', cons: 'Fragile.',
    branches: [
      { name: 'Carreaux de Magma', text: 'Perce 50 % de l\'armure, +40 % contre les Blindés.', dmg: 1.2, add: [{ kind: 'pierce', pct: 0.5 }, { kind: 'bonusVsDef', def: 'bli', pct: 0.4 }], color: 0xa83a1a, accent: 0xff8a3a },
      { name: 'Salve Ardente', text: '+60 % cadence, le carreau rebondit une fois.', dmg: 0.8, atkSpeed: 1.6, add: [{ kind: 'chain', targets: 1, pct: 0.5, range: 3 }], color: 0xe8a03a, accent: 0xffffff },
    ],
    model: { shape: 'xbow', color: 0xd86a2a, accent: 0xffd36a, scale: 1 }, fx: 'fire', sfx: 'arrow',
  }),
  oracle_braise: def({
    id: 'oracle_braise', name: 'Oracle de Braise', faction: 'solaires', category: 'zone', tier: 3, cost: 145, tower: 'fire',
    hp: 270, armor: 0, dmg: 42, atkSpeed: 0.65, range: 4.5, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.7, pct: 0.65 }, { kind: 'burn', dps: 8, duration: 3 }],
    description: 'Projette des fragments de soleil captif.', passiveText: 'Éclat solaire : 70 % des dégâts autour de la cible. Brûle.',
    pros: 'Zone énorme.', cons: 'Très fragile.',
    branches: [
      { name: 'Gardienne du Soleil Captif', text: '+40 % dégâts, zone plus large, la cible subit +15 %.', dmg: 1.4, add: [{ kind: 'splash', radius: 2.1, pct: 0.8 }, { kind: 'armorShred', pct: 0.15, duration: 3 }], color: 0xe8401a, accent: 0xfff2a0 },
      { name: 'Pyromancien', text: 'Brûlure x3,5, +20 % cadence.', atkSpeed: 1.2, add: [{ kind: 'burn', dps: 28, duration: 4 }], color: 0x8a1a1a, accent: 0xff8a3a },
    ],
    model: { shape: 'mage', color: 0xd8572a, accent: 0xffd36a, scale: 1 }, fx: 'fire', sfx: 'fire',
  }),
  vestale: def({
    id: 'vestale', name: 'Vestale du Feu Sacré', faction: 'solaires', category: 'soutien', cost: 95, tower: 'shrine',
    hp: 300, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.3, attack: 'arca', defense: 'mys', roles: ['support', 'aura'],
    abilities: [{ kind: 'hastePulse', every: 8, radius: 3.5, pct: 0.35, duration: 3.5 }, { kind: 'heal', every: 3.5, amount: 25, range: 4 }],
    description: 'Gardienne de la flamme qui embrase les cœurs.', skillText: 'Ferveur (8 s) : +35 % vitesse d\'attaque aux alliés proches pendant 3,5 s.', passiveText: 'Soin léger.',
    pros: 'Boost de cadence en rafales.', cons: 'Pas de défense.',
    branches: [
      { name: 'Flamme Éternelle', text: 'Ferveur toutes les 6 s (+60 %).', add: [{ kind: 'hastePulse', every: 6, radius: 3.8, pct: 0.6, duration: 3.5 }], color: 0xe8701a, accent: 0xffffff },
      { name: 'Phénix Gardien', text: 'Soins x2,5 et bouclier de départ.', hp: 1.2, add: [{ kind: 'heal', every: 3, amount: 62, range: 4.5 }, { kind: 'shieldStart', amount: 80, radius: 3 }], color: 0xffa03a, accent: 0xfff2a0 },
    ],
    model: { shape: 'priestess', color: 0xe8803a, accent: 0xfff2a0, scale: 1 }, fx: 'fire', sfx: 'chime',
  }),
  elementaire: def({
    id: 'elementaire', name: 'Élémentaire Solaire', faction: 'solaires', category: 'speciale', tier: 4, cost: 210,
    hp: 760, armor: 0, dmg: 52, atkSpeed: 0.8, range: 3, moveSpeed: 2, attack: 'arca', defense: 'mys', roles: ['carry', 'aoe'],
    abilities: [{ kind: 'novaPulse', every: 4, radius: 3, dmg: 42, burn: 10 }],
    description: 'Un fragment de soleil vivant.', skillText: 'Nova (4 s) : explosion de feu autour de lui (45 + brûlure).', passiveText: '—',
    pros: 'Dégâts de zone constants au contact.', cons: 'Aucune armure.',
    branches: [
      { name: 'Cœur de Soleil', text: 'Nova +80 % et plus large.', hp: 1.15, add: [{ kind: 'novaPulse', every: 3.5, radius: 3.6, dmg: 90, burn: 20 }], color: 0xffb03a, accent: 0xffffff },
      { name: 'Météore Vivant', text: '+2 m portée, tirs explosifs (+30 %).', dmg: 1.3, range: 2, add: [{ kind: 'splash', radius: 1.8, pct: 0.7 }], color: 0xc8301a, accent: 0xffd36a },
    ],
    model: { shape: 'elemental', color: 0xff7a2a, accent: 0xfff0a0, scale: 1.1 }, fx: 'fire', sfx: 'fire',
  }),

  // ======================================================== VOILE NÉCROSE
  garde_os: def({
    id: 'garde_os', name: 'Garde d\'Os', faction: 'necrose', category: 'defense', cost: 60,
    hp: 580, armor: 0.15, dmg: 18, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.1, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3 }, { kind: 'lifesteal', pct: 0.15 }],
    description: 'Squelette en armure rouillée, fidèle au-delà de la mort.', passiveText: 'Provocation. Vol de vie 15 %.',
    pros: 'Tank bon marché qui se soigne en frappant.', cons: 'Faible contre le Physique.',
    branches: [
      { name: 'Ossuaire Vivant', text: '+35 % PV, relève des squelettes autour de lui.', hp: 1.35, add: [{ kind: 'raise', unit: 'squelette', chance: 0.3, max: 3, radius: 3 }], color: 0x6a5a7a, accent: 0xc48bff },
      { name: 'Chevalier Funeste', text: '+60 % dégâts, exécute (< 30 % PV).', dmg: 1.6, add: [{ kind: 'execute', threshold: 0.3, pct: 0.5 }], color: 0x3a2a4a, accent: 0xff4a7a },
    ],
    model: { shape: 'boneguard', color: 0x5a4a6a, accent: 0xc48bff, scale: 1 }, fx: 'shadow', sfx: 'metal',
  }),
  spectre_vif: def({
    id: 'spectre_vif', name: 'Spectre Vif', faction: 'necrose', category: 'rapide', cost: 75,
    hp: 285, armor: 0, dmg: 31, atkSpeed: 1.4, range: 1.1, moveSpeed: 4.2, attack: 'perf', defense: 'leg', roles: ['assassin'],
    abilities: [{ kind: 'dash', range: 8 }, { kind: 'execute', threshold: 0.35, pct: 0.6 }, { kind: 'stealth', ambush: 0.4 }],
    description: 'Une ombre qui frappe les arrières ennemis.', skillText: 'Saut d\'ombre : bondit sur l\'ennemi le plus lointain à 8 m.', passiveText: 'Camouflé. Exécution : +60 % sous 35 % PV.',
    pros: 'Tue les tireurs et les soigneurs ennemis.', cons: 'Meurt vite s\'il est ciblé.',
    branches: [
      { name: 'Voile Écarlate', text: 'Vol de vie 20 %, exécution +80 % (< 40 %).', add: [{ kind: 'lifesteal', pct: 0.2 }, { kind: 'execute', threshold: 0.4, pct: 0.8 }], color: 0x8a1f4a, accent: 0xff4a7a },
      { name: 'Lame Fantôme', text: 'Saut 12 m, frappe en zone, embuscade +100 %.', add: [{ kind: 'dash', range: 12 }, { kind: 'splash', radius: 1, pct: 0.5 }, { kind: 'stealth', ambush: 1 }], color: 0x4a3a8a, accent: 0x9ffcff },
    ],
    model: { shape: 'shade', color: 0x7a3fc4, accent: 0xff6ad5, scale: 1 }, fx: 'shadow', sfx: 'whoosh',
  }),
  archere_cendres: def({
    id: 'archere_cendres', name: 'Archère des Cendres', faction: 'necrose', category: 'portee', cost: 90, tower: 'archer',
    hp: 220, armor: 0, dmg: 29, atkSpeed: 1.1, range: 5.5, moveSpeed: 2.4, attack: 'arca', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'armorShred', pct: 0.1, duration: 3 }, { kind: 'lifesteal', pct: 0.1 }],
    description: 'Ses flèches portent une malédiction.', passiveText: 'Malédiction : la cible subit +10 % de dégâts (3 s). Vol de vie 10 %.',
    pros: 'Arcane : excellent contre Blindés et Mystiques.', cons: 'Très fragile.',
    branches: [
      { name: 'Flèches Maudites', text: 'Malédiction +25 % (4 s), +20 % dégâts.', dmg: 1.2, add: [{ kind: 'armorShred', pct: 0.25, duration: 4 }], color: 0x4a2a6a, accent: 0xff4aff },
      { name: 'Pluie de Cendres', text: 'Volées de zone qui ralentissent.', add: [{ kind: 'splash', radius: 1.3, pct: 0.5 }, { kind: 'slowOnHit', slow: 0.25, duration: 2 }], color: 0x5a5a6a, accent: 0xd0d0e0 },
    ],
    model: { shape: 'archer', color: 0x5a3a7a, accent: 0xd06aff, scale: 1 }, fx: 'shadow', sfx: 'arrow',
  }),
  pestifere: def({
    id: 'pestifere', name: 'Pestiféré', faction: 'necrose', category: 'zone', cost: 90, tower: 'poison',
    hp: 380, armor: 0, dmg: 14, atkSpeed: 0.85, range: 3.5, moveSpeed: 2, attack: 'ener', defense: 'org', roles: ['aoe'],
    abilities: [{ kind: 'poison', dps: 14, duration: 4, radius: 2.5 }, { kind: 'armorShred', pct: 0.1, duration: 3 }],
    description: 'Il balance un encensoir de miasmes.', passiveText: 'Miasme : poison de zone (2,5 m, 14/s, 4 s).',
    pros: 'Affaiblit des groupes entiers.', cons: 'Courte portée.',
    branches: [
      { name: 'Seigneur de la Peste', text: 'Poison x2.', add: [{ kind: 'poison', dps: 18, duration: 4, radius: 2.3 }], color: 0x4a6a2a, accent: 0xc0ff4a },
      { name: 'Brume Fétide', text: 'Camoufle les alliés proches au début du combat.', hp: 1.2, add: [{ kind: 'veilStart', radius: 3.2 }], color: 0x4a4a5a, accent: 0xb0a0ff },
    ],
    model: { shape: 'censer', color: 0x4a5a3a, accent: 0xb4ff6a, scale: 1 }, fx: 'poison', sfx: 'whoosh',
  }),
  invocatrice: def({
    id: 'invocatrice', name: 'Invocatrice du Voile', faction: 'necrose', category: 'speciale', tier: 3, cost: 115, tower: 'dark',
    hp: 300, armor: 0, dmg: 18, atkSpeed: 0.8, range: 4, moveSpeed: 2.2, attack: 'arca', defense: 'mys', roles: ['summoner', 'mage'],
    abilities: [{ kind: 'summon', unit: 'squelette', count: 3 }, { kind: 'raise', unit: 'squelette', chance: 0.4, max: 4, radius: 5 }],
    description: 'Elle rappelle les morts pour qu\'ils servent encore.', skillText: 'Relève : 40 % de chance de relever un ennemi tué à 5 m (max 4).', passiveText: '3 squelettes au début du combat.',
    pros: 'Armée gratuite qui grossit pendant le combat.', cons: 'Squelettes balayés par la zone.',
    branches: [
      { name: 'Reine du Voile', text: 'Invoque des Chevaliers d\'os, relève plus souvent.', add: [{ kind: 'summon', unit: 'chevalier_os', count: 2 }, { kind: 'raise', unit: 'squelette', chance: 0.5, max: 6, radius: 5 }], color: 0x6a2a8a, accent: 0xff9aff },
      { name: 'Liche', text: 'Dégâts x2,2, éclairs nécrotiques en chaîne.', dmg: 2.2, add: [{ kind: 'chain', targets: 2, pct: 0.6, range: 3 }], color: 0x2a3a4a, accent: 0x7affd0 },
    ],
    model: { shape: 'necro', color: 0x4a2a6a, accent: 0x9affd0, scale: 1 }, fx: 'shadow', sfx: 'whoosh',
  }),
  abomination: def({
    id: 'abomination', name: 'Abomination Cousue', faction: 'necrose', category: 'lourde', tier: 3, cost: 140,
    hp: 1420, armor: 0.05, dmg: 42, atkSpeed: 0.7, range: 1.2, moveSpeed: 1.7, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 2.5 }, { kind: 'lifesteal', pct: 0.2 }, { kind: 'split', unit: 'squelette', count: 3 }],
    description: 'Un amas de chair et de crochets.', passiveText: 'Provocation. Vol de vie 20 %. Libère 3 squelettes en mourant.',
    pros: 'Énorme réserve de PV, continue à servir après sa mort.', cons: 'Peu d\'armure.',
    branches: [
      { name: 'Colosse de Chair', text: '+50 % PV, provocation 3,5 m, régénère.', hp: 1.5, add: [{ kind: 'taunt', radius: 3.5 }, { kind: 'regen', pct: 0.015 }], color: 0x6a4a5a, accent: 0xff8aa0 },
      { name: 'Boucher', text: '+80 % dégâts en zone.', dmg: 1.8, atkSpeed: 1.1, add: [{ kind: 'splash', radius: 1.2, pct: 0.6 }], color: 0x5a2a2a, accent: 0xff4a4a },
    ],
    model: { shape: 'abom', color: 0x7a6a72, accent: 0x9affd0, scale: 1.3 }, fx: 'shadow', sfx: 'boom',
  }),

  // ======================================================== TOKENS (summoned)
  squelette: def({
    id: 'squelette', name: 'Squelette', faction: 'necrose', category: 'speciale', cost: 0, token: true,
    hp: 175, armor: 0, dmg: 12, atkSpeed: 1.0, range: 1.0, moveSpeed: 2.4, attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [], description: 'Invoqué.', passiveText: '—', pros: '', cons: '',
    model: { shape: 'skeleton', color: 0xd8d0c0, accent: 0x9affd0, scale: 0.85 }, fx: 'shadow', sfx: 'slash',
  }),
  chevalier_os: def({
    id: 'chevalier_os', name: 'Chevalier d\'os', faction: 'necrose', category: 'speciale', cost: 0, token: true,
    hp: 300, armor: 0.1, dmg: 20, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.3, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 2 }], description: 'Invoqué.', passiveText: '—', pros: '', cons: '',
    model: { shape: 'skeleton', color: 0xb8b0c8, accent: 0xff9aff, scale: 1.05 }, fx: 'shadow', sfx: 'metal',
  }),
  pousse: def({
    id: 'pousse', name: 'Pousse', faction: 'ronces', category: 'speciale', cost: 0, token: true,
    hp: 170, armor: 0, dmg: 10, atkSpeed: 1.0, range: 1.0, moveSpeed: 2.2, attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [{ kind: 'regen', pct: 0.02 }], description: 'Invoquée.', passiveText: '—', pros: '', cons: '',
    model: { shape: 'sapling', color: 0x5a8a3a, accent: 0xd8ff6a, scale: 0.8 }, fx: 'leaf', sfx: 'slash',
  }),
  tourelle: def({
    id: 'tourelle', name: 'Tourelle', faction: 'rouages', category: 'speciale', cost: 0, token: true,
    hp: 260, armor: 0.2, dmg: 18, atkSpeed: 1.6, range: 4.5, moveSpeed: 0, attack: 'perf', defense: 'bli', roles: ['ranged'],
    abilities: [], description: 'Déployée.', passiveText: '—', pros: '', cons: '',
    model: { shape: 'turret', color: 0x8a7a5a, accent: 0xffd27a, scale: 0.9 }, fx: 'spark', sfx: 'shot',
  }),
  sylvain: def({
    id: 'sylvain', name: 'Gardien Sylvestre', faction: 'ronces', category: 'speciale', cost: 0, token: true,
    hp: 600, armor: 0.1, dmg: 24, atkSpeed: 0.8, range: 1.3, moveSpeed: 2.2, attack: 'phys', defense: 'org', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3.5 }, { kind: 'regen', pct: 0.02 }, { kind: 'splash', radius: 1.3, pct: 0.5 }], description: 'Invoqué (pouvoir).', passiveText: '—', pros: '', cons: '',
    model: { shape: 'treant', color: 0x4a6a2a, accent: 0xc8ff6a, scale: 1.6 }, fx: 'leaf', sfx: 'boom',
  }),
  tentacule: def({
    id: 'tentacule', name: 'Tentacule du Kraken', faction: 'abysses', category: 'speciale', cost: 0, token: true,
    hp: 700, armor: 0.15, dmg: 30, atkSpeed: 0.9, range: 2.6, moveSpeed: 0, attack: 'phys', defense: 'mys', roles: ['tank'],
    abilities: [{ kind: 'splash', radius: 1.8, pct: 0.5 }, { kind: 'stunOnHit', chance: 0.3, duration: 1 }, { kind: 'taunt', radius: 3 }], description: 'Invoqué (pouvoir).', passiveText: '—', pros: '', cons: '',
    model: { shape: 'kraken', color: 0x3a2a6a, accent: 0x9ffcff, scale: 1.8 }, fx: 'water', sfx: 'wave',
  }),
  leviathan: def({
    id: 'leviathan', name: 'Léviathan Mécanique', faction: 'abysses', category: 'speciale', cost: 0, token: true,
    hp: 1500, armor: 0.25, dmg: 46, atkSpeed: 0.8, range: 2.4, moveSpeed: 1.8, attack: 'ener', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 4.5 }, { kind: 'splash', radius: 2.2, pct: 0.6 }, { kind: 'stunOnHit', chance: 0.3, duration: 1 }, { kind: 'interceptor', radius: 14 }],
    description: 'Invoqué (Résonance DUO).', passiveText: '—', pros: '', cons: '',
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
    hp: Math.round(u.hp * k * (br?.hp ?? 1)),
    dmg: u.dmg * k * (br?.dmg ?? 1),
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
