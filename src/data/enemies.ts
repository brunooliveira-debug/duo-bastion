import type { EnemyDef } from './types';

// "Les Dissonants" — the invading horde. Original creatures.
export const ENEMIES: Record<string, EnemyDef> = {
  rampelin: {
    id: 'rampelin', name: 'Rampelin', description: 'Petite créature griffue, en meute.',
    hp: 90, armor: 0, dmg: 9, atkSpeed: 1, range: 1, moveSpeed: 2.2, attack: 'phys', defense: 'org',
    abilities: [], bounty: 3, leakDamage: 12,
    model: { shape: 'crawler', color: 0xc0302a, accent: 0xffe040, scale: 0.8 },
  },
  essaim: {
    id: 'essaim', name: 'Moucheron d\'Essaim', description: 'Fragile mais très nombreux.',
    hp: 55, armor: 0, dmg: 6, atkSpeed: 1.2, range: 1, moveSpeed: 2.6, attack: 'perf', defense: 'leg',
    abilities: [], bounty: 2, leakDamage: 6,
    model: { shape: 'fly', color: 0x7a3a9a, accent: 0xff6ad5, scale: 0.75 },
  },
  coureur: {
    id: 'coureur', name: 'Coureur Fêlé', description: 'Très rapide, file droit vers le Core.',
    hp: 120, armor: 0, dmg: 11, atkSpeed: 1.1, range: 1, moveSpeed: 3.8, attack: 'phys', defense: 'leg',
    abilities: [], bounty: 4, leakDamage: 14,
    model: { shape: 'runner', color: 0x6a6470, accent: 0xff5a3a, scale: 0.85 },
  },
  cuirasse: {
    id: 'cuirasse', name: 'Cuirassé de Basalte', description: 'Lent et blindé.',
    hp: 300, armor: 0.15, dmg: 16, atkSpeed: 0.8, range: 1.1, moveSpeed: 1.7, attack: 'phys', defense: 'bli',
    abilities: [], bounty: 7, leakDamage: 22,
    model: { shape: 'armored', color: 0xb0302a, accent: 0xff5a3a, scale: 1 },
  },
  tireur: {
    id: 'tireur', name: 'Tireur Dissonant', description: 'Attaque à distance.',
    hp: 130, armor: 0, dmg: 15, atkSpeed: 0.9, range: 4, moveSpeed: 2, attack: 'perf', defense: 'leg',
    abilities: [], bounty: 5, leakDamage: 14,
    model: { shape: 'gunner', color: 0x8a4a2a, accent: 0xff9a3a, scale: 0.9 },
  },
  mage_fele: {
    id: 'mage_fele', name: 'Mage Fêlé', description: 'Sorts arcaniques en zone.',
    hp: 170, armor: 0, dmg: 20, atkSpeed: 0.7, range: 3.5, moveSpeed: 2, attack: 'arca', defense: 'mys',
    abilities: [{ kind: 'splash', radius: 1.2, pct: 0.5 }], bounty: 6, leakDamage: 18,
    model: { shape: 'caster', color: 0x4a2a7a, accent: 0xd06aff, scale: 0.95 },
  },
  bete_runique: {
    id: 'bete_runique', name: 'Bête Runique', description: 'Masse organique gorgée d\'énergie.',
    hp: 420, armor: 0.05, dmg: 22, atkSpeed: 0.8, range: 1.1, moveSpeed: 2, attack: 'ener', defense: 'org',
    abilities: [], bounty: 9, leakDamage: 26,
    model: { shape: 'brute', color: 0x6a2a3a, accent: 0x6affd0, scale: 1.05 },
  },
  brute: {
    id: 'brute', name: 'Brute Fracassante', description: 'Mini-boss. Frappe en zone.',
    hp: 1150, armor: 0.15, dmg: 40, atkSpeed: 0.7, range: 1.3, moveSpeed: 1.7, attack: 'phys', defense: 'bli',
    abilities: [{ kind: 'splash', radius: 1.2, pct: 0.5 }, { kind: 'enrage', below: 0.5, speed: 0.6, atkSpeed: 0.5 }], mechanic: 'Enragée : plus rapide sous 50 % PV.', bounty: 40, leakDamage: 80,
    model: { shape: 'brute', color: 0x7a2a1a, accent: 0xffa040, scale: 1.5 },
  },
  boss_colosse: {
    id: 'boss_colosse', name: 'Le Colosse Fêlé', description: 'BOSS. Blindé, frappe en zone.', boss: true,
    hp: 6000, armor: 0.25, dmg: 90, atkSpeed: 0.6, range: 1.7, moveSpeed: 1.4, attack: 'ener', defense: 'bli',
    abilities: [{ kind: 'splash', radius: 1.6, pct: 0.6 }, { kind: 'shieldPulse', every: 8, amount: 700, radius: 2 }], mechanic: 'Bouclier rechargeable toutes les 8 s.', bounty: 150, leakDamage: 250,
    model: { shape: 'boss', color: 0x4a1a2a, accent: 0xff3a5a, scale: 2.2 },
  },
  reine_essaim: {
    id: 'reine_essaim', name: 'La Reine-Essaim', description: 'BOSS MAJEUR. Crache des nuées arcaniques.', boss: true,
    hp: 9500, armor: 0.15, dmg: 75, atkSpeed: 1, range: 3.5, moveSpeed: 1.5, attack: 'arca', defense: 'org',
    abilities: [{ kind: 'splash', radius: 2, pct: 0.5 }, { kind: 'spawn', unit: 'essaim', count: 3, every: 6 }], mechanic: 'Pond 3 moucherons toutes les 6 s.', bounty: 220, leakDamage: 350,
    model: { shape: 'boss', color: 0x6a5a1a, accent: 0xfff04a, scale: 2.4 },
  },
  primordial: {
    id: 'primordial', name: 'Le Dissonant Primordial', description: 'BOSS FINAL. La faille incarnée.', boss: true,
    hp: 24000, armor: 0.3, dmg: 160, atkSpeed: 0.7, range: 2, moveSpeed: 1.3, attack: 'arca', defense: 'mys',
    abilities: [
      { kind: 'splash', radius: 2.2, pct: 0.7 },
      { kind: 'slowPulse', every: 6, radius: 3, slow: 0.3, duration: 2, dmg: 60 },
      { kind: 'regen', pct: 0.002 }, { kind: 'resistSplash', pct: 0.5 }, { kind: 'enrage', below: 0.35, speed: 0.5, atkSpeed: 0.6 },
    ], mechanic: 'Régénère, résiste aux explosions, s\'enrage sous 35 %.',
    bounty: 400, leakDamage: 800,
    model: { shape: 'boss', color: 0x1a0a3a, accent: 0xb04aff, scale: 2.8 },
  },

  // ---- Raider bodies ----
  grignoteur: {
    id: 'grignoteur', name: 'Grignoteur', description: 'Raider économique, peu dangereux.',
    hp: 150, armor: 0, dmg: 10, atkSpeed: 1, range: 1, moveSpeed: 2.4, attack: 'phys', defense: 'org',
    abilities: [], bounty: 2, leakDamage: 15,
    model: { shape: 'crawler', color: 0x3a6aa8, accent: 0xaaffcc, scale: 0.9 },
  },
  zephyr: {
    id: 'zephyr', name: 'Griffe-Zéphyr', description: 'Raider très rapide, en meute.',
    hp: 130, armor: 0, dmg: 10, atkSpeed: 1.2, range: 1, moveSpeed: 4.6, attack: 'perf', defense: 'leg',
    abilities: [], bounty: 2, leakDamage: 18,
    model: { shape: 'runner', color: 0x2a6aba, accent: 0x9ae0ff, scale: 0.9 },
  },
  mur_coquille: {
    id: 'mur_coquille', name: 'Mur-Coquille', description: 'Raider tank, absorbe les coups.',
    hp: 1100, armor: 0.2, dmg: 20, atkSpeed: 0.8, range: 1.1, moveSpeed: 1.8, attack: 'phys', defense: 'bli',
    abilities: [], bounty: 6, leakDamage: 40,
    model: { shape: 'armored', color: 0x3a6a5a, accent: 0x9affd0, scale: 1.2 },
  },
  behemoth: {
    id: 'behemoth', name: 'Béhémoth Fendeur', description: 'Raider puissant, dégâts de zone.',
    hp: 1900, armor: 0.15, dmg: 70, atkSpeed: 0.75, range: 1.3, moveSpeed: 1.9, attack: 'ener', defense: 'org',
    abilities: [{ kind: 'splash', radius: 1.4, pct: 0.6 }], bounty: 12, leakDamage: 120,
    model: { shape: 'brute', color: 0x2a3a8a, accent: 0x6ac0ff, scale: 1.5 },
  },
  spectre_fele: {
    id: 'spectre_fele', name: 'Spectre Fêlé', description: 'Ignore la provocation, résiste au Physique.',
    hp: 300, armor: 0, dmg: 16, atkSpeed: 1, range: 1, moveSpeed: 2.6, attack: 'arca', defense: 'mys',
    abilities: [{ kind: 'ignoreTaunt' }, { kind: 'resist', attack: 'phys', pct: 0.4 }], bounty: 4, leakDamage: 30,
    model: { shape: 'ghost', color: 0x5a6a9a, accent: 0x9affff, scale: 1 },
  },
  basalte_garde: {
    id: 'basalte_garde', name: 'Garde de Basalte', description: 'Bouclier-tour : très blindé.',
    hp: 520, armor: 0.3, dmg: 18, atkSpeed: 0.8, range: 1.1, moveSpeed: 1.6, attack: 'phys', defense: 'bli',
    abilities: [], bounty: 5, leakDamage: 35,
    model: { shape: 'armored', color: 0x4a4a5a, accent: 0xffb03a, scale: 1.05 },
  },
  chaman: {
    id: 'chaman', name: 'Chaman Dissonant', description: 'Soigne et protège les autres ennemis.',
    hp: 380, armor: 0, dmg: 14, atkSpeed: 0.8, range: 3.5, moveSpeed: 2, attack: 'arca', defense: 'org',
    abilities: [{ kind: 'heal', every: 2.5, amount: 60, range: 4 }, { kind: 'shieldPulse', every: 6, amount: 80, radius: 3 }], bounty: 6, leakDamage: 30,
    model: { shape: 'shaman', color: 0x7a3a2a, accent: 0x7affb0, scale: 1 },
  },
  sapeur: {
    id: 'sapeur', name: 'Sapeur Kamikaze', description: 'Explose au contact de vos unités.',
    hp: 260, armor: 0, dmg: 0, atkSpeed: 1, range: 1, moveSpeed: 3.6, attack: 'phys', defense: 'leg',
    abilities: [{ kind: 'explode', dmg: 220, radius: 2 }], bounty: 3, leakDamage: 60,
    model: { shape: 'sapper', color: 0x6a5a3a, accent: 0xff5a2a, scale: 0.9 },
  },
  scindeur: {
    id: 'scindeur', name: 'Scindeur', description: 'Se divise en 3 rejetons à sa mort.',
    hp: 700, armor: 0.05, dmg: 20, atkSpeed: 0.8, range: 1.1, moveSpeed: 1.9, attack: 'ener', defense: 'org',
    abilities: [{ kind: 'split', unit: 'scion', count: 3 }], bounty: 6, leakDamage: 45,
    model: { shape: 'blob', color: 0x6a2a6a, accent: 0xff7aff, scale: 1.3 },
  },
  scion: {
    id: 'scion', name: 'Rejeton', description: 'Morceau de Scindeur.',
    hp: 170, armor: 0, dmg: 9, atkSpeed: 1, range: 1, moveSpeed: 2.8, attack: 'ener', defense: 'org',
    abilities: [], bounty: 1, leakDamage: 12,
    model: { shape: 'blob', color: 0x8a3a8a, accent: 0xff9aff, scale: 0.65 },
  },
  seigneur_faille: {
    id: 'seigneur_faille', name: 'Seigneur de Faille', description: 'Champion : aura qui protège les ennemis proches.',
    hp: 3200, armor: 0.25, dmg: 75, atkSpeed: 0.8, range: 1.4, moveSpeed: 1.7, attack: 'ener', defense: 'bli',
    abilities: [{ kind: 'guardAura', radius: 3, pct: 0.25 }, { kind: 'splash', radius: 1.4, pct: 0.5 }], mechanic: 'Aura : protège les ennemis proches (-25 %).', bounty: 30, leakDamage: 200,
    model: { shape: 'champion', color: 0x3a2a5a, accent: 0xff4a7a, scale: 1.6 },
  },
  titan_dissonant: {
    id: 'titan_dissonant', name: 'Titan Dissonant', description: 'Ultime : un boss envoyé par l\'adversaire.', boss: true,
    hp: 7000, armor: 0.3, dmg: 140, atkSpeed: 0.6, range: 1.7, moveSpeed: 1.4, attack: 'arca', defense: 'mys',
    abilities: [{ kind: 'splash', radius: 1.8, pct: 0.6 }, { kind: 'slowPulse', every: 6, radius: 3, slow: 0.3, duration: 2, dmg: 60 }, { kind: 'resist', attack: 'phys', pct: 0.3 }], mechanic: 'Résiste au Physique (-30 %).', bounty: 60, leakDamage: 450,
    model: { shape: 'boss', color: 0x1a3a3a, accent: 0x4affd0, scale: 2.2 },
  },
  // ---- mini-bosses ----
  alpha_coureur: {
    id: 'alpha_coureur', name: 'Coureur Alpha', description: 'Mini-boss d\'une vitesse folle.', boss: true,
    hp: 650, armor: 0.05, dmg: 22, atkSpeed: 1.2, range: 1.1, moveSpeed: 4.4, attack: 'phys', defense: 'leg',
    abilities: [{ kind: 'ignoreTaunt' }], bounty: 25, leakDamage: 120, mechanic: 'Très grande vitesse, ignore la provocation.',
    model: { shape: 'runner', color: 0xd85a2a, accent: 0xfff06a, scale: 1.5 },
  },
  alpha_runique: {
    id: 'alpha_runique', name: 'Alpha Runique', description: 'Mini-boss qui se régénère.', boss: true,
    hp: 2100, armor: 0.1, dmg: 40, atkSpeed: 0.8, range: 1.2, moveSpeed: 1.9, attack: 'ener', defense: 'org',
    abilities: [{ kind: 'regen', pct: 0.02 }], bounty: 35, leakDamage: 160, mechanic: 'Régénère 2 % de ses PV par seconde.',
    model: { shape: 'brute', color: 0x3a2a5a, accent: 0x6affd0, scale: 1.6 },
  },
  gardien_basalte: {
    id: 'gardien_basalte', name: 'Gardien de Basalte', description: 'Mini-boss à la carapace impénétrable.', boss: true,
    hp: 3300, armor: 0.3, dmg: 50, atkSpeed: 0.7, range: 1.3, moveSpeed: 1.5, attack: 'phys', defense: 'bli',
    abilities: [{ kind: 'resist', attack: 'phys', pct: 0.5 }, { kind: 'splash', radius: 1.3, pct: 0.5 }], bounty: 45, leakDamage: 200, mechanic: 'Résiste au Physique (-50 %).',
    model: { shape: 'armored', color: 0x3a3a48, accent: 0xff7a2a, scale: 1.7 },
  },
  ingenieur_fele: {
    id: 'ingenieur_fele', name: 'Ingénieur Fêlé', description: 'Mini-boss qui lance des drones.', boss: true,
    hp: 3600, armor: 0.2, dmg: 45, atkSpeed: 0.9, range: 3.5, moveSpeed: 1.6, attack: 'perf', defense: 'mys',
    abilities: [{ kind: 'resistSplash', pct: 0.6 }, { kind: 'spawn', unit: 'essaim', count: 2, every: 5 }], bounty: 50, leakDamage: 220, mechanic: 'Résiste aux explosions, lance des drones.',
    model: { shape: 'champion', color: 0x5a4a2a, accent: 0x9ffcff, scale: 1.6 },
  },
};
