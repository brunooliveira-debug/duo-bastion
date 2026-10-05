import type { UnitDef, FactionId } from './types';

export const FACTIONS: Record<FactionId, { name: string; color: string; lore: string }> = {
  astreens: { name: 'Astréens', color: '#7fb4ff', lore: 'Chevaliers-cartographes des constellations brisées.' },
  rouages: { name: 'Concordat des Rouages', color: '#f0b04a', lore: 'Machines conscientes forgées dans le métal des étoiles mortes.' },
  ronces: { name: 'Les Ronces', color: '#6fdc7a', lore: 'Bêtes et guerriers nés de la forêt-qui-marche.' },
  abysses: { name: 'Marée Abyssale', color: '#3fd0c9', lore: 'Colosses venus des fosses où dort la lumière.' },
  solaires: { name: 'Ordre Solaire', color: '#ff7a3d', lore: 'Mages qui enferment des soleils dans le verre.' },
  necrose: { name: 'Voile Nécrose', color: '#c48bff', lore: 'Ombres liées à des serments éteints.' },
};

// MVP roster: 8 base units + 1 evolution each.
// cost = gold to build (base) or gold to evolve (evolution).
export const UNITS: Record<string, UnitDef> = {
  // 1. Tank économique
  ferraille: {
    id: 'ferraille', name: 'Sentinelle Ferraille', faction: 'rouages', tier: 1, cost: 60,
    hp: 560, armor: 0.1, dmg: 15, atkSpeed: 1.0, range: 1.1, moveSpeed: 2.2,
    attack: 'phys', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 3.5 }],
    description: 'Golem de récupération bon marché. Attire les ennemis proches.',
    skillText: 'Provocation : les ennemis à 3,5 m le ciblent en priorité.',
    passiveText: 'Plaques recyclées : 10 % d\'armure.',
    evolvesTo: 'bastion_ferraille',
    model: { shape: 'golem', color: 0xb98a4a, accent: 0xffd27a, scale: 1 },
    sfx: 'metal', fx: 'spark',
  },
  bastion_ferraille: {
    id: 'bastion_ferraille', name: 'Bastion Ferraille', faction: 'rouages', tier: 2, cost: 120, isEvolution: true,
    hp: 1320, armor: 0.15, dmg: 32, atkSpeed: 1.0, range: 1.2, moveSpeed: 2.1,
    attack: 'phys', defense: 'bli', roles: ['tank'],
    abilities: [{ kind: 'taunt', radius: 4 }, { kind: 'thorns', pct: 0.2 }],
    description: 'Forteresse ambulante hérissée de pointes.',
    skillText: 'Provocation (4 m).', passiveText: 'Épines : renvoie 20 % des dégâts de mêlée.',
    model: { shape: 'golem', color: 0xc9944a, accent: 0xfff0a0, scale: 1.25 },
    sfx: 'metal', fx: 'spark',
  },

  // 2. DPS mêlée
  lame_ronce: {
    id: 'lame_ronce', name: 'Lame-Ronce', faction: 'ronces', tier: 1, cost: 75,
    hp: 340, armor: 0, dmg: 28, atkSpeed: 1.25, range: 1.1, moveSpeed: 2.8,
    attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [{ kind: 'ramp', perHit: 0.06, max: 0.5 }],
    description: 'Duelliste végétale qui accélère à chaque coup.',
    skillText: '—', passiveText: 'Frénésie : +6 % vitesse d\'attaque par coup (max +50 %).',
    evolvesTo: 'faucheuse_ronce',
    model: { shape: 'blade', color: 0x3f9e4f, accent: 0xb4ff7a, scale: 1 },
    sfx: 'slash', fx: 'leaf',
  },
  faucheuse_ronce: {
    id: 'faucheuse_ronce', name: 'Faucheuse-Ronce', faction: 'ronces', tier: 2, cost: 150, isEvolution: true,
    hp: 740, armor: 0.05, dmg: 58, atkSpeed: 1.3, range: 1.2, moveSpeed: 2.9,
    attack: 'phys', defense: 'org', roles: ['dps'],
    abilities: [{ kind: 'ramp', perHit: 0.07, max: 0.6 }, { kind: 'lifesteal', pct: 0.15 }],
    description: 'Ses lames-épines se nourrissent de la sève ennemie.',
    skillText: '—', passiveText: 'Frénésie (+60 % max). Vol de vie 15 %.',
    model: { shape: 'blade', color: 0x2f8a3c, accent: 0xe4ff8a, scale: 1.2 },
    sfx: 'slash', fx: 'leaf',
  },

  // 3. DPS distance
  tireuse_etoile: {
    id: 'tireuse_etoile', name: 'Tireuse d\'Étoiles', faction: 'astreens', tier: 2, cost: 95,
    hp: 230, armor: 0, dmg: 27, atkSpeed: 1.1, range: 5, moveSpeed: 2.4,
    attack: 'perf', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsSlowed', pct: 0.25 }],
    description: 'Archère qui tire des éclats de constellation.',
    skillText: '—', passiveText: 'Marque stellaire : +25 % dégâts contre les ennemis ralentis.',
    evolvesTo: 'chasseresse_nova',
    model: { shape: 'archer', color: 0x4f7fd8, accent: 0xbfe0ff, scale: 1 },
    sfx: 'arrow', fx: 'star',
  },
  chasseresse_nova: {
    id: 'chasseresse_nova', name: 'Chasseresse Nova', faction: 'astreens', tier: 3, cost: 175, isEvolution: true,
    hp: 470, armor: 0, dmg: 55, atkSpeed: 1.15, range: 5.5, moveSpeed: 2.5,
    attack: 'perf', defense: 'leg', roles: ['ranged', 'dps'],
    abilities: [{ kind: 'bonusVsSlowed', pct: 0.3 }, { kind: 'execute', threshold: 0.3, pct: 0.3 }],
    description: 'Ses flèches portent la lumière d\'une étoile mourante.',
    skillText: '—', passiveText: '+30 % vs ralentis. +30 % vs ennemis sous 30 % PV.',
    model: { shape: 'archer', color: 0x3a6ee8, accent: 0xffffff, scale: 1.2 },
    sfx: 'arrow', fx: 'star',
  },

  // 4. Tank lourd
  carapace_abysses: {
    id: 'carapace_abysses', name: 'Carapace des Abysses', faction: 'abysses', tier: 3, cost: 150,
    hp: 1350, armor: 0.2, dmg: 26, atkSpeed: 0.75, range: 1.2, moveSpeed: 1.8,
    attack: 'phys', defense: 'mys', roles: ['tank', 'aoe'],
    abilities: [
      { kind: 'taunt', radius: 3 },
      { kind: 'slowPulse', every: 5, radius: 2.6, slow: 0.35, duration: 2.5, dmg: 20 },
    ],
    description: 'Tortue-colosse qui libère des vagues glacées.',
    skillText: 'Onde de marée (5 s) : 20 dégâts et ralentit de 35 % autour d\'elle.',
    passiveText: 'Provocation (3 m). 20 % d\'armure.',
    evolvesTo: 'leviathan',
    model: { shape: 'turtle', color: 0x1f8f9a, accent: 0x7ff6ff, scale: 1.1 },
    sfx: 'wave', fx: 'water',
  },
  leviathan: {
    id: 'leviathan', name: 'Léviathan des Fosses', faction: 'abysses', tier: 4, cost: 230, isEvolution: true,
    hp: 2750, armor: 0.25, dmg: 50, atkSpeed: 0.75, range: 1.3, moveSpeed: 1.8,
    attack: 'phys', defense: 'mys', roles: ['tank', 'aoe'],
    abilities: [
      { kind: 'taunt', radius: 3.5 },
      { kind: 'slowPulse', every: 4, radius: 3, slow: 0.45, duration: 3, dmg: 45 },
    ],
    description: 'Le gardien des fosses. Les vagues obéissent à son souffle.',
    skillText: 'Onde de marée (4 s) : 45 dégâts, ralentit de 45 %.', passiveText: 'Provocation. 25 % d\'armure.',
    model: { shape: 'turtle', color: 0x13707f, accent: 0xa8ffff, scale: 1.4 },
    sfx: 'wave', fx: 'water',
  },

  // 5. Mage AOE
  oracle_braise: {
    id: 'oracle_braise', name: 'Oracle de Braise', faction: 'solaires', tier: 3, cost: 145,
    hp: 280, armor: 0, dmg: 44, atkSpeed: 0.65, range: 4.5, moveSpeed: 2.2,
    attack: 'arca', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'splash', radius: 1.7, pct: 0.7 }],
    description: 'Projette des fragments de soleil captif.',
    skillText: '—', passiveText: 'Éclat solaire : 70 % des dégâts autour de la cible (1,7 m).',
    evolvesTo: 'soleil_captif',
    model: { shape: 'mage', color: 0xd8572a, accent: 0xffd36a, scale: 1 },
    sfx: 'fire', fx: 'fire',
  },
  soleil_captif: {
    id: 'soleil_captif', name: 'Gardienne du Soleil Captif', faction: 'solaires', tier: 4, cost: 220, isEvolution: true,
    hp: 560, armor: 0, dmg: 92, atkSpeed: 0.65, range: 4.8, moveSpeed: 2.2,
    attack: 'arca', defense: 'mys', roles: ['mage', 'aoe'],
    abilities: [{ kind: 'splash', radius: 2.1, pct: 0.8 }, { kind: 'armorShred', pct: 0.15, duration: 3 }],
    description: 'Elle porte un astre entier dans une lanterne de verre.',
    skillText: '—', passiveText: 'Éclat (2,1 m, 80 %). Brûlure : la cible subit +15 % de dégâts 3 s.',
    model: { shape: 'mage', color: 0xe8401a, accent: 0xfff2a0, scale: 1.2 },
    sfx: 'fire', fx: 'fire',
  },

  // 6. Support aura
  harmoniste: {
    id: 'harmoniste', name: 'Harmoniste Astral', faction: 'astreens', tier: 2, cost: 100,
    hp: 320, armor: 0, dmg: 12, atkSpeed: 1.0, range: 4, moveSpeed: 2.3,
    attack: 'ener', defense: 'leg', roles: ['support', 'aura'],
    abilities: [
      { kind: 'auraAttackSpeed', radius: 3, pct: 0.25 },
      { kind: 'heal', every: 3, amount: 30, range: 4 },
    ],
    description: 'Chante la fréquence des étoiles. Accélère ses alliés.',
    skillText: 'Soin (3 s) : rend 30 PV à l\'allié le plus blessé.',
    passiveText: 'Aura : +25 % vitesse d\'attaque aux alliés à 3 m.',
    evolvesTo: 'grand_harmoniste',
    model: { shape: 'bard', color: 0x8aa8ff, accent: 0xfff6c0, scale: 1 },
    sfx: 'chime', fx: 'note',
  },
  grand_harmoniste: {
    id: 'grand_harmoniste', name: 'Grand Harmoniste', faction: 'astreens', tier: 3, cost: 160, isEvolution: true,
    hp: 650, armor: 0, dmg: 24, atkSpeed: 1.0, range: 4.2, moveSpeed: 2.3,
    attack: 'ener', defense: 'leg', roles: ['support', 'aura'],
    abilities: [
      { kind: 'auraAttackSpeed', radius: 3.5, pct: 0.35 },
      { kind: 'heal', every: 3, amount: 65, range: 4.5 },
      { kind: 'shieldStart', amount: 120, radius: 3 },
    ],
    description: 'Sa symphonie protège les alliés au début du combat.',
    skillText: 'Soin (3 s) : 65 PV. Bouclier de 120 aux alliés proches au début du combat.',
    passiveText: 'Aura : +35 % vitesse d\'attaque (3,5 m).',
    model: { shape: 'bard', color: 0x9fb8ff, accent: 0xffffff, scale: 1.2 },
    sfx: 'chime', fx: 'note',
  },

  // 7. Unité rapide / assassin
  spectre_vif: {
    id: 'spectre_vif', name: 'Spectre Vif', faction: 'necrose', tier: 2, cost: 85,
    hp: 260, armor: 0, dmg: 32, atkSpeed: 1.4, range: 1.1, moveSpeed: 4.2,
    attack: 'perf', defense: 'leg', roles: ['assassin'],
    abilities: [{ kind: 'dash', range: 8 }, { kind: 'execute', threshold: 0.35, pct: 0.6 }],
    description: 'Une ombre qui frappe les arrières ennemis.',
    skillText: 'Saut d\'ombre : au début du combat, bondit sur l\'ennemi le plus lointain à 8 m.',
    passiveText: 'Exécution : +60 % dégâts contre les ennemis sous 35 % PV.',
    evolvesTo: 'voile_ecarlate',
    model: { shape: 'shade', color: 0x7a3fc4, accent: 0xff6ad5, scale: 1 },
    sfx: 'whoosh', fx: 'shadow',
  },
  voile_ecarlate: {
    id: 'voile_ecarlate', name: 'Voile Écarlate', faction: 'necrose', tier: 3, cost: 150, isEvolution: true,
    hp: 540, armor: 0.05, dmg: 64, atkSpeed: 1.45, range: 1.1, moveSpeed: 4.4,
    attack: 'perf', defense: 'leg', roles: ['assassin'],
    abilities: [{ kind: 'dash', range: 9 }, { kind: 'execute', threshold: 0.4, pct: 0.8 }, { kind: 'lifesteal', pct: 0.2 }],
    description: 'Le serment écarlate ne laisse aucun survivant.',
    skillText: 'Saut d\'ombre (9 m).', passiveText: 'Exécution +80 % (< 40 % PV). Vol de vie 20 %.',
    model: { shape: 'shade', color: 0x8a1f4a, accent: 0xff4a7a, scale: 1.2 },
    sfx: 'whoosh', fx: 'shadow',
  },

  // 8. Carry coûteux
  exarque_prisme: {
    id: 'exarque_prisme', name: 'Exarque Prisme', faction: 'rouages', tier: 5, cost: 300,
    hp: 1000, armor: 0.1, dmg: 80, atkSpeed: 0.9, range: 4.2, moveSpeed: 2.0,
    attack: 'ener', defense: 'bli', roles: ['carry', 'hybrid'],
    abilities: [{ kind: 'chain', targets: 2, pct: 0.6, range: 3 }],
    description: 'Un automate-cristal qui décompose la lumière en éclairs.',
    skillText: '—', passiveText: 'Réfraction : chaque tir rebondit sur 2 ennemis (60 %).',
    evolvesTo: 'exarque_ascendant',
    model: { shape: 'prism', color: 0x9a7cff, accent: 0x9ffcff, scale: 1.15 },
    sfx: 'zap', fx: 'lightning',
  },
  exarque_ascendant: {
    id: 'exarque_ascendant', name: 'Exarque Ascendant', faction: 'rouages', tier: 6, cost: 380, isEvolution: true,
    hp: 2150, armor: 0.15, dmg: 160, atkSpeed: 0.95, range: 4.6, moveSpeed: 2.0,
    attack: 'ener', defense: 'bli', roles: ['carry', 'hybrid'],
    abilities: [{ kind: 'chain', targets: 3, pct: 0.7, range: 3.5 }, { kind: 'ramp', perHit: 0.03, max: 0.3 }],
    description: 'La lumière elle-même s\'agenouille devant lui.',
    skillText: '—', passiveText: 'Réfraction (3 rebonds, 70 %). Surcharge : +3 % vitesse par tir (max 30 %).',
    model: { shape: 'prism', color: 0xb49cff, accent: 0xffffff, scale: 1.45 },
    sfx: 'zap', fx: 'lightning',
  },
};

export const BASE_UNIT_IDS = Object.values(UNITS).filter(u => !u.isEvolution).map(u => u.id);

/** total gold invested in a unit of this id (base + evolutions leading to it) */
export function unitValue(id: string): number {
  let v = UNITS[id].cost;
  for (const u of Object.values(UNITS)) if (u.evolvesTo === id) v += unitValue(u.id);
  return v;
}

export function isTank(id: string) { return UNITS[id].roles.includes('tank'); }
export function isDps(id: string) {
  const r = UNITS[id].roles;
  return r.includes('dps') || r.includes('carry') || r.includes('mage') || r.includes('assassin');
}
