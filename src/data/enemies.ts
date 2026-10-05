import type { EnemyDef } from './types';

// "Les Dissonants" — the invading horde. Original creatures.
export const ENEMIES: Record<string, EnemyDef> = {
  rampelin: {
    id: 'rampelin', name: 'Rampelin', description: 'Petite créature griffue, en meute.',
    hp: 90, armor: 0, dmg: 9, atkSpeed: 1, range: 1, moveSpeed: 2.2, attack: 'phys', defense: 'org',
    abilities: [], bounty: 3, leakDamage: 12,
    model: { shape: 'crawler', color: 0x8a3a5a, accent: 0xff7aa0, scale: 0.8 },
  },
  essaim: {
    id: 'essaim', name: 'Moucheron d\'Essaim', description: 'Fragile mais très nombreux.',
    hp: 55, armor: 0, dmg: 6, atkSpeed: 1.2, range: 1, moveSpeed: 2.6, attack: 'perf', defense: 'leg',
    abilities: [], bounty: 2, leakDamage: 6,
    model: { shape: 'fly', color: 0x9a8a2a, accent: 0xfff06a, scale: 0.6 },
  },
  coureur: {
    id: 'coureur', name: 'Coureur Fêlé', description: 'Très rapide, file droit vers le Core.',
    hp: 120, armor: 0, dmg: 11, atkSpeed: 1.1, range: 1, moveSpeed: 3.8, attack: 'phys', defense: 'leg',
    abilities: [], bounty: 4, leakDamage: 14,
    model: { shape: 'runner', color: 0xb04a2a, accent: 0xffb07a, scale: 0.85 },
  },
  cuirasse: {
    id: 'cuirasse', name: 'Cuirassé de Basalte', description: 'Lent et blindé.',
    hp: 300, armor: 0.15, dmg: 16, atkSpeed: 0.8, range: 1.1, moveSpeed: 1.7, attack: 'phys', defense: 'bli',
    abilities: [], bounty: 7, leakDamage: 22,
    model: { shape: 'armored', color: 0x5a5a6a, accent: 0xff5a3a, scale: 1 },
  },
  tireur: {
    id: 'tireur', name: 'Tireur Dissonant', description: 'Attaque à distance.',
    hp: 130, armor: 0, dmg: 15, atkSpeed: 0.9, range: 4, moveSpeed: 2, attack: 'perf', defense: 'leg',
    abilities: [], bounty: 5, leakDamage: 14,
    model: { shape: 'gunner', color: 0x6a3a8a, accent: 0xff9a3a, scale: 0.9 },
  },
  mage_fele: {
    id: 'mage_fele', name: 'Mage Fêlé', description: 'Sorts arcaniques en zone.',
    hp: 170, armor: 0, dmg: 20, atkSpeed: 0.7, range: 3.5, moveSpeed: 2, attack: 'arca', defense: 'mys',
    abilities: [{ kind: 'splash', radius: 1.2, pct: 0.5 }], bounty: 6, leakDamage: 18,
    model: { shape: 'caster', color: 0x3a2a8a, accent: 0xd06aff, scale: 0.95 },
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
    abilities: [{ kind: 'splash', radius: 1.2, pct: 0.5 }], bounty: 40, leakDamage: 80,
    model: { shape: 'brute', color: 0x7a2a1a, accent: 0xffa040, scale: 1.5 },
  },
  boss_colosse: {
    id: 'boss_colosse', name: 'Le Colosse Fêlé', description: 'BOSS. Blindé, frappe en zone.', boss: true,
    hp: 6000, armor: 0.25, dmg: 90, atkSpeed: 0.6, range: 1.7, moveSpeed: 1.4, attack: 'ener', defense: 'bli',
    abilities: [{ kind: 'splash', radius: 1.6, pct: 0.6 }], bounty: 150, leakDamage: 250,
    model: { shape: 'boss', color: 0x4a1a2a, accent: 0xff3a5a, scale: 2.2 },
  },
  reine_essaim: {
    id: 'reine_essaim', name: 'La Reine-Essaim', description: 'BOSS MAJEUR. Crache des nuées arcaniques.', boss: true,
    hp: 9500, armor: 0.15, dmg: 75, atkSpeed: 1, range: 3.5, moveSpeed: 1.5, attack: 'arca', defense: 'org',
    abilities: [{ kind: 'splash', radius: 2, pct: 0.5 }], bounty: 220, leakDamage: 350,
    model: { shape: 'boss', color: 0x6a5a1a, accent: 0xfff04a, scale: 2.4 },
  },
  primordial: {
    id: 'primordial', name: 'Le Dissonant Primordial', description: 'BOSS FINAL. La faille incarnée.', boss: true,
    hp: 24000, armor: 0.3, dmg: 160, atkSpeed: 0.7, range: 2, moveSpeed: 1.3, attack: 'arca', defense: 'mys',
    abilities: [
      { kind: 'splash', radius: 2.2, pct: 0.7 },
      { kind: 'slowPulse', every: 6, radius: 3, slow: 0.3, duration: 2, dmg: 60 },
    ],
    bounty: 400, leakDamage: 800,
    model: { shape: 'boss', color: 0x1a0a3a, accent: 0xb04aff, scale: 2.8 },
  },

  // ---- Raider bodies ----
  grignoteur: {
    id: 'grignoteur', name: 'Grignoteur', description: 'Raider économique, peu dangereux.',
    hp: 150, armor: 0, dmg: 10, atkSpeed: 1, range: 1, moveSpeed: 2.4, attack: 'phys', defense: 'org',
    abilities: [], bounty: 2, leakDamage: 15,
    model: { shape: 'crawler', color: 0x2a8a6a, accent: 0xaaffcc, scale: 0.9 },
  },
  zephyr: {
    id: 'zephyr', name: 'Griffe-Zéphyr', description: 'Raider très rapide.',
    hp: 220, armor: 0, dmg: 14, atkSpeed: 1.2, range: 1, moveSpeed: 4.6, attack: 'perf', defense: 'leg',
    abilities: [], bounty: 3, leakDamage: 25,
    model: { shape: 'runner', color: 0x2a6aba, accent: 0x9ae0ff, scale: 0.95 },
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
};
