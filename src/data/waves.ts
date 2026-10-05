import type { WaveDef } from './types';

// Per-lane composition. hpMul/dmgMul scale the base enemy stats.
// Tuned with scripts/balance.ts + headless AI simulation (tests/sim.test.ts).
export const WAVES: WaveDef[] = [
  { n: 1, name: 'Éclaireurs', groups: [{ enemy: 'rampelin', count: 8 }], hpMul: 1, dmgMul: 1, danger: 'Aucun — idéal pour apprendre.' },
  { n: 2, name: 'La Nuée', groups: [{ enemy: 'essaim', count: 16 }], hpMul: 1.05, dmgMul: 1, danger: 'Nombreux : les dégâts de zone brillent.' },
  { n: 3, name: 'Galop Fêlé', groups: [{ enemy: 'coureur', count: 10 }], hpMul: 1.1, dmgMul: 1, danger: 'Rapides : risque de fuite vers le Core.' },
  { n: 4, name: 'Carapaces', groups: [{ enemy: 'cuirasse', count: 6 }], hpMul: 1.1, dmgMul: 1, danger: 'Blindés : préférez l\'Énergie.' },
  { n: 5, name: 'La Brute', groups: [{ enemy: 'rampelin', count: 8 }, { enemy: 'brute', count: 1 }], hpMul: 1.0, dmgMul: 1, danger: 'MINI-BOSS : frappe en zone.', boss: true },
  { n: 6, name: 'Tirailleurs', groups: [{ enemy: 'rampelin', count: 5 }, { enemy: 'tireur', count: 8 }], hpMul: 1.2, dmgMul: 1.1, danger: 'Attaques à distance sur vos arrières.' },
  { n: 7, name: 'Fêlures', groups: [{ enemy: 'cuirasse', count: 3 }, { enemy: 'mage_fele', count: 7 }], hpMul: 1.25, dmgMul: 1.15, danger: 'Sorts de zone : espacez vos unités.' },
  { n: 8, name: 'Bêtes Runiques', groups: [{ enemy: 'bete_runique', count: 7 }], hpMul: 1.3, dmgMul: 1.2, danger: 'Organiques et robustes.' },
  { n: 9, name: 'Assaut Mixte', groups: [{ enemy: 'coureur', count: 8 }, { enemy: 'tireur', count: 7 }], hpMul: 1.5, dmgMul: 1.3, danger: 'Rapides + tireurs.' },
  { n: 10, name: 'Le Colosse Fêlé', groups: [{ enemy: 'essaim', count: 10 }, { enemy: 'boss_colosse', count: 1 }], hpMul: 1, dmgMul: 1, danger: 'BOSS : énormes PV, très blindé.', boss: true },
  { n: 11, name: 'Marée d\'Essaims', groups: [{ enemy: 'essaim', count: 34 }], hpMul: 1.9, dmgMul: 1.5, danger: 'Submersion : il faut de la zone.' },
  { n: 12, name: 'Mur de Basalte', groups: [{ enemy: 'cuirasse', count: 12 }], hpMul: 1.9, dmgMul: 1.5, danger: 'Très blindés.' },
  { n: 13, name: 'Chœur Fêlé', groups: [{ enemy: 'mage_fele', count: 10 }, { enemy: 'bete_runique', count: 4 }], hpMul: 2.0, dmgMul: 1.6, danger: 'Mystiques + zone.' },
  { n: 14, name: 'Double Brute', groups: [{ enemy: 'brute', count: 2 }, { enemy: 'coureur', count: 8 }], hpMul: 1.6, dmgMul: 1.4, danger: 'Deux mini-boss.', boss: true },
  { n: 15, name: 'La Reine-Essaim', groups: [{ enemy: 'essaim', count: 16 }, { enemy: 'reine_essaim', count: 1 }], hpMul: 1.1, dmgMul: 1.1, danger: 'BOSS MAJEUR à distance.', boss: true },
  { n: 16, name: 'Stampede', groups: [{ enemy: 'coureur', count: 24 }], hpMul: 2.6, dmgMul: 1.9, danger: 'Très rapides et nombreux.' },
  { n: 17, name: 'Artillerie', groups: [{ enemy: 'cuirasse', count: 5 }, { enemy: 'tireur', count: 14 }], hpMul: 2.7, dmgMul: 2, danger: 'Tireurs protégés par des blindés.' },
  { n: 18, name: 'Horde Runique', groups: [{ enemy: 'bete_runique', count: 14 }], hpMul: 2.8, dmgMul: 2.1, danger: 'Masse organique.' },
  { n: 19, name: 'Brutes en Marche', groups: [{ enemy: 'brute', count: 4 }], hpMul: 2.3, dmgMul: 1.8, danger: 'Quatre mini-boss.', boss: true },
  { n: 20, name: 'L\'Armée Fêlée', groups: [{ enemy: 'rampelin', count: 12 }, { enemy: 'cuirasse', count: 6 }, { enemy: 'mage_fele', count: 6 }, { enemy: 'tireur', count: 6 }], hpMul: 3.2, dmgMul: 2.3, danger: 'Armée massive de tous types.' },
  { n: 21, name: 'Le Dissonant Primordial', groups: [{ enemy: 'brute', count: 2 }, { enemy: 'primordial', count: 1 }], hpMul: 1.4, dmgMul: 1.3, danger: 'BOSS FINAL.', boss: true },
];

const ENDLESS_POOL = ['rampelin', 'essaim', 'coureur', 'cuirasse', 'tireur', 'mage_fele', 'bete_runique'];

/** Wave definition for any number (survival mode goes past 21). */
export function getWave(n: number): WaveDef {
  if (n <= WAVES.length) return WAVES[n - 1];
  const k = n - WAVES.length;
  const a = ENDLESS_POOL[(n * 3) % ENDLESS_POOL.length];
  const b = ENDLESS_POOL[(n * 5 + 2) % ENDLESS_POOL.length];
  const boss = k % 5 === 0;
  const groups = [{ enemy: a, count: 10 }, { enemy: b, count: 8 }];
  if (boss) groups.push({ enemy: 'brute', count: 2 + Math.floor(k / 5) });
  const m = 3.4 * Math.pow(1.13, k);
  return { n, name: `Faille ${n}`, groups, hpMul: m, dmgMul: Math.sqrt(m) * 1.3, danger: boss ? 'Brutes en renfort !' : 'La faille s\'élargit…', boss };
}
