import type { WaveDef } from './types';

// Per-lane composition. hpMul/dmgMul scale the base enemy stats.
// A boss or mini-boss every 2–5 waves, each with its own mechanic (see enemies.ts `mechanic`).
// Tuned with scripts/balance.ts + headless AI simulation (tests/sim.test.ts).
export const WAVES: WaveDef[] = [
  { n: 1, name: 'Éclaireurs', groups: [{ enemy: 'rampelin', count: 8 }], hpMul: 1, dmgMul: 1, danger: 'Aucun — idéal pour apprendre.' },
  { n: 2, name: 'La Nuée', groups: [{ enemy: 'essaim', count: 16 }], hpMul: 1.05, dmgMul: 1, danger: 'Nombreux : les dégâts de zone brillent.' },
  { n: 3, name: 'Galop Fêlé', groups: [{ enemy: 'coureur', count: 8 }, { enemy: 'alpha_coureur', count: 1 }], hpMul: 1.1, dmgMul: 1, danger: 'MINI-BOSS rapide : il file vers le Core.', boss: true },
  { n: 4, name: 'Carapaces', groups: [{ enemy: 'cuirasse', count: 6 }], hpMul: 1.1, dmgMul: 1, danger: 'Blindés : préférez l\'Énergie.' },
  { n: 5, name: 'La Brute', groups: [{ enemy: 'rampelin', count: 8 }, { enemy: 'brute', count: 1 }], hpMul: 1.0, dmgMul: 1, danger: 'MINI-BOSS : frappe en zone, s\'enrage.', boss: true },
  { n: 6, name: 'Tirailleurs', groups: [{ enemy: 'rampelin', count: 5 }, { enemy: 'tireur', count: 8 }], hpMul: 1.2, dmgMul: 1.1, danger: 'Attaques à distance sur vos arrières.' },
  { n: 7, name: 'Fêlures', groups: [{ enemy: 'cuirasse', count: 3 }, { enemy: 'mage_fele', count: 7 }], hpMul: 1.25, dmgMul: 1.15, danger: 'Sorts de zone : espacez vos unités.' },
  { n: 8, name: 'Bêtes Runiques', groups: [{ enemy: 'bete_runique', count: 5 }, { enemy: 'alpha_runique', count: 1 }], hpMul: 1.3, dmgMul: 1.2, danger: 'MINI-BOSS : se régénère. Concentrez les dégâts.', boss: true },
  { n: 9, name: 'Assaut Mixte', groups: [{ enemy: 'coureur', count: 8 }, { enemy: 'tireur', count: 7 }], hpMul: 1.5, dmgMul: 1.3, danger: 'Rapides + tireurs.' },
  { n: 10, name: 'Le Colosse Fêlé', groups: [{ enemy: 'essaim', count: 10 }, { enemy: 'boss_colosse', count: 1 }], hpMul: 1, dmgMul: 1, danger: 'BOSS : bouclier qui se recharge.', boss: true },
  { n: 11, name: 'Marée d\'Essaims', groups: [{ enemy: 'essaim', count: 34 }], hpMul: 1.9, dmgMul: 1.5, danger: 'Submersion : il faut de la zone.' },
  { n: 12, name: 'Mur de Basalte', groups: [{ enemy: 'cuirasse', count: 9 }, { enemy: 'gardien_basalte', count: 1 }], hpMul: 1.8, dmgMul: 1.45, danger: 'MINI-BOSS : résiste au Physique.', boss: true },
  { n: 13, name: 'Chœur Fêlé', groups: [{ enemy: 'mage_fele', count: 10 }, { enemy: 'bete_runique', count: 4 }], hpMul: 2.0, dmgMul: 1.6, danger: 'Mystiques + zone.' },
  { n: 14, name: 'Double Brute', groups: [{ enemy: 'brute', count: 2 }, { enemy: 'coureur', count: 8 }], hpMul: 1.6, dmgMul: 1.4, danger: 'Deux mini-boss qui s\'enragent.', boss: true },
  { n: 15, name: 'La Reine-Essaim', groups: [{ enemy: 'essaim', count: 16 }, { enemy: 'reine_essaim', count: 1 }], hpMul: 1.1, dmgMul: 1.1, danger: 'BOSS MAJEUR : pond des moucherons.', boss: true },
  { n: 16, name: 'Stampede', groups: [{ enemy: 'coureur', count: 24 }], hpMul: 2.6, dmgMul: 1.9, danger: 'Très rapides et nombreux.' },
  { n: 17, name: 'Artillerie', groups: [{ enemy: 'cuirasse', count: 4 }, { enemy: 'tireur', count: 11 }, { enemy: 'ingenieur_fele', count: 1 }], hpMul: 2.5, dmgMul: 1.9, danger: 'MINI-BOSS : résiste aux explosions, lance des drones.', boss: true },
  { n: 18, name: 'Horde Runique', groups: [{ enemy: 'bete_runique', count: 14 }], hpMul: 2.8, dmgMul: 2.1, danger: 'Masse organique.' },
  { n: 19, name: 'Brutes en Marche', groups: [{ enemy: 'brute', count: 4 }], hpMul: 2.3, dmgMul: 1.8, danger: 'Quatre mini-boss.', boss: true },
  { n: 20, name: 'L\'Armée Fêlée', groups: [{ enemy: 'rampelin', count: 12 }, { enemy: 'cuirasse', count: 6 }, { enemy: 'mage_fele', count: 6 }, { enemy: 'tireur', count: 6 }], hpMul: 3.2, dmgMul: 2.3, danger: 'Armée massive de tous types.' },
  { n: 21, name: 'Le Dissonant Primordial', groups: [{ enemy: 'brute', count: 2 }, { enemy: 'primordial', count: 1 }], hpMul: 1.4, dmgMul: 1.3, danger: 'BOSS FINAL : régénère et s\'enrage.', boss: true },
];

/**
 * Difficulty calibration per wave (applied to HP and damage), measured by scripts/balance-report.ts:
 * an army worth ≈ 70 % of the expected gold holds a normal wave, ≈ 85 % a boss wave.
 */
export const WAVE_DIFF = [1.46, 1.83, 1.9, 1.75, 2.64, 3.6, 1.9, 2.2, 3.6, 1.05, 4.6, 1.05, 2.2, 4.2, 1.6, 4.4, 1.1, 2.5, 2.74, 2.3, 0.6];
const ENDLESS_DIFF = 2.3;

const ENDLESS_POOL = ['rampelin', 'essaim', 'coureur', 'cuirasse', 'tireur', 'mage_fele', 'bete_runique'];
const ENDLESS_BOSSES = ['brute', 'alpha_runique', 'gardien_basalte', 'ingenieur_fele'];

/**
 * Smooth toughness of the enemies at wave n (≈ HP multiplier of a regular wave's enemies).
 * Boss waves have a LOW hpMul (the boss itself is huge), so effects scaled with getWave(n).hpMul were ~8× weaker
 * on the final boss than on wave 20: powers, Résonance, rifts and Core modules use this curve instead.
 */
export function waveToughness(n: number): number {
  if (n <= WAVES.length) return 1.2 + 0.36 * (n - 1);
  return Math.max(1.2 + 0.36 * (n - 1), getWave(n).hpMul * 0.8);
}

/** Wave definition for any number (survival mode goes past 21). */
export function getWave(n: number): WaveDef {
  if (n <= WAVES.length) {
    const w = WAVES[n - 1], k = WAVE_DIFF[n - 1];
    return { ...w, hpMul: w.hpMul * k, dmgMul: w.dmgMul * k };
  }
  const k = n - WAVES.length;
  const a = ENDLESS_POOL[(n * 3) % ENDLESS_POOL.length];
  const b = ENDLESS_POOL[(n * 5 + 2) % ENDLESS_POOL.length];
  const boss = k % 5 === 0;
  const groups = [{ enemy: a, count: 10 }, { enemy: b, count: 8 }];
  if (boss) groups.push({ enemy: ENDLESS_BOSSES[(k / 5) % ENDLESS_BOSSES.length], count: 1 + Math.floor(k / 10) });
  const m = 3.4 * ENDLESS_DIFF * Math.pow(1.13, k);
  return { n, name: `Faille ${n}`, groups, hpMul: m, dmgMul: Math.sqrt(m) * 1.3, danger: boss ? 'Mini-boss en renfort !' : 'La faille s\'élargit…', boss };
}

// ---------------------------------------------------------------- random wave events
// Announced during the preparation so players can adapt. Same event for every lane (fair).
export interface WaveEvent { id: string; name: string; icon: string; text: string }
export const WAVE_EVENTS: WaveEvent[] = [
  { id: 'double', name: 'DOUBLE RÉCOMPENSE', icon: 'coin', text: 'Les ennemis rapportent deux fois plus d\'or.' },
  { id: 'invasion', name: 'INVASION', icon: 'claw', text: 'Beaucoup plus d\'ennemis faibles arrivent.' },
  { id: 'elite', name: 'ÉLITE', icon: 'crown', text: '2 ennemis par voie sont des élites (PV x4, butin x6).' },
  { id: 'fog', name: 'BROUILLARD', icon: 'fog', text: 'Portée des unités -30 % pendant les 20 premières secondes.' },
  { id: 'overcharge', name: 'SURCHARGE', icon: 'bolt', text: 'Vos unités attaquent 40 % plus vite pendant 12 s.' },
  { id: 'rush', name: 'VENT DE FAILLE', icon: 'ff', text: 'Ennemis 25 % plus rapides, mais butin +50 %.' },
];
export function waveEvent(id: string | null | undefined) { return WAVE_EVENTS.find(e => e.id === id) ?? null; }
