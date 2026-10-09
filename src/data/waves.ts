import { tr } from '../i18n';
import type { WaveDef } from './types';

// Per-lane composition. hpMul/dmgMul scale the base enemy stats.
// A boss or mini-boss every 2–5 waves, each with its own mechanic (see enemies.ts `mechanic`).
// Tuned with scripts/balance.ts + headless AI simulation (tests/sim.test.ts).
export const WAVES: WaveDef[] = [
  { n: 1, name: tr('Éclaireurs'), groups: [{ enemy: 'rampelin', count: 8 }], hpMul: 1, dmgMul: 1, danger: tr('Aucun — idéal pour apprendre.') },
  { n: 2, name: tr('La Nuée'), groups: [{ enemy: 'essaim', count: 16 }], hpMul: 1.05, dmgMul: 1, danger: tr('Nombreux : les dégâts de zone brillent.') },
  { n: 3, name: tr('Galop Fêlé'), groups: [{ enemy: 'coureur', count: 8 }, { enemy: 'alpha_coureur', count: 1 }], hpMul: 1.1, dmgMul: 1, danger: tr('MINI-BOSS rapide : il file vers le Core.'), boss: true },
  { n: 4, name: tr('Carapaces'), groups: [{ enemy: 'cuirasse', count: 6 }], hpMul: 1.1, dmgMul: 1, danger: tr('Blindés : préférez l\'Énergie.') },
  { n: 5, name: tr('La Brute'), groups: [{ enemy: 'rampelin', count: 8 }, { enemy: 'brute', count: 1 }], hpMul: 1.0, dmgMul: 1, danger: tr('MINI-BOSS : frappe en zone, s\'enrage.'), boss: true },
  { n: 6, name: tr('Tirailleurs'), groups: [{ enemy: 'rampelin', count: 5 }, { enemy: 'tireur', count: 8 }, { enemy: 'brecheur', count: 1 }], hpMul: 1.2, dmgMul: 1.1, danger: tr('Tireurs sur vos arrières, et des BRÉCHEURS qui ignorent vos unités : visez-les.') },
  { n: 7, name: tr('Fêlures'), groups: [{ enemy: 'cuirasse', count: 3 }, { enemy: 'mage_fele', count: 7 }], hpMul: 1.25, dmgMul: 1.15, danger: tr('Sorts de zone : espacez vos unités.') },
  { n: 8, name: tr('Bêtes Runiques'), groups: [{ enemy: 'bete_runique', count: 5 }, { enemy: 'alpha_runique', count: 1 }], hpMul: 1.3, dmgMul: 1.2, danger: tr('MINI-BOSS : se régénère. Concentrez les dégâts.'), boss: true },
  { n: 9, name: tr('Assaut Mixte'), groups: [{ enemy: 'coureur', count: 8 }, { enemy: 'tireur', count: 7 }, { enemy: 'brecheur', count: 2 }], hpMul: 1.5, dmgMul: 1.3, danger: tr('Rapides + tireurs + brécheurs : de la portée et des intercepteurs.') },
  { n: 10, name: tr('Le Colosse Fêlé'), groups: [{ enemy: 'essaim', count: 10 }, { enemy: 'boss_colosse', count: 1 }], hpMul: 1, dmgMul: 1, danger: tr('BOSS : bouclier qui se recharge.'), boss: true },
  { n: 11, name: tr('Marée d\'Essaims'), groups: [{ enemy: 'essaim', count: 34 }], hpMul: 1.9, dmgMul: 1.5, danger: tr('Submersion : il faut de la zone.') },
  { n: 12, name: tr('Mur de Basalte'), groups: [{ enemy: 'cuirasse', count: 9 }, { enemy: 'gardien_basalte', count: 1 }], hpMul: 1.8, dmgMul: 1.45, danger: tr('MINI-BOSS : résiste au Physique.'), boss: true },
  { n: 13, name: tr('Chœur Fêlé'), groups: [{ enemy: 'mage_fele', count: 10 }, { enemy: 'bete_runique', count: 4 }, { enemy: 'invocateur', count: 2 }], hpMul: 2.0, dmgMul: 1.6, danger: tr('Mystiques + zone. Des INVOCATEURS restent en retrait et appellent des nuées : longue portée ou assassins.') },
  { n: 14, name: tr('Double Brute'), groups: [{ enemy: 'brute', count: 2 }, { enemy: 'coureur', count: 8 }], hpMul: 1.6, dmgMul: 1.4, danger: tr('Deux mini-boss qui s\'enragent.'), boss: true },
  { n: 15, name: tr('La Reine-Essaim'), groups: [{ enemy: 'essaim', count: 16 }, { enemy: 'reine_essaim', count: 1 }], hpMul: 1.1, dmgMul: 1.1, danger: tr('BOSS MAJEUR : pond des moucherons.'), boss: true },
  { n: 16, name: tr('Stampede'), groups: [{ enemy: 'coureur', count: 24 }, { enemy: 'brecheur', count: 3 }], hpMul: 2.6, dmgMul: 1.9, danger: tr('Très rapides et nombreux, brécheurs en tête.') },
  { n: 17, name: tr('Artillerie'), groups: [{ enemy: 'cuirasse', count: 4 }, { enemy: 'tireur', count: 11 }, { enemy: 'ingenieur_fele', count: 1 }], hpMul: 2.5, dmgMul: 1.9, danger: tr('MINI-BOSS : résiste aux explosions, lance des drones.'), boss: true },
  { n: 18, name: tr('Horde Runique'), groups: [{ enemy: 'bete_runique', count: 14 }, { enemy: 'chaman', count: 2 }], hpMul: 2.8, dmgMul: 2.1, danger: tr('Masse organique soignée par des chamans : abattez-les d\'abord.') },
  { n: 19, name: tr('Brutes en Marche'), groups: [{ enemy: 'brute', count: 4 }], hpMul: 2.3, dmgMul: 1.8, danger: tr('Quatre mini-boss.'), boss: true },
  { n: 20, name: tr('L\'Armée Fêlée'), groups: [{ enemy: 'rampelin', count: 12 }, { enemy: 'cuirasse', count: 6 }, { enemy: 'mage_fele', count: 6 }, { enemy: 'tireur', count: 6 }, { enemy: 'invocateur', count: 2 }, { enemy: 'brecheur', count: 3 }], hpMul: 3.2, dmgMul: 2.3, danger: tr('Armée massive de tous types, invocateurs et brécheurs compris.') },
  { n: 21, name: tr('Le Dissonant Primordial'), groups: [{ enemy: 'brute', count: 2 }, { enemy: 'primordial', count: 1 }], hpMul: 1.4, dmgMul: 1.3, danger: tr('BOSS FINAL : régénère et s\'enrage.'), boss: true },
];

/**
 * Difficulty calibration per wave (applied to HP and damage), measured by scripts/balance-report.ts:
 * an army worth ≈ 70 % of the expected gold holds a normal wave, ≈ 85 % a boss wave.
 */
export const WAVE_DIFF = [1.46, 1.83, 1.9, 1.75, 2.64, 3.6, 1.9, 2.2, 3.6, 1.05, 4.6, 1.05, 2.2, 4.2, 1.6, 4.4, 1.1, 2.5, 2.74, 2.3, 0.6];
const ENDLESS_DIFF = 2.3;

const ENDLESS_POOL = ['rampelin', 'essaim', 'coureur', 'cuirasse', 'tireur', 'mage_fele', 'bete_runique', 'brecheur', 'invocateur'];
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
  return { n, name: tr('Faille {0}', n), groups, hpMul: m, dmgMul: Math.sqrt(m) * 1.3, danger: boss ? tr('Mini-boss en renfort !') : tr('La faille s\'élargit…'), boss };
}

// ---------------------------------------------------------------- random wave events
// Announced during the preparation so players can adapt. Same event for every lane (fair).
export interface WaveEvent { id: string; name: string; icon: string; text: string }
export const WAVE_EVENTS: WaveEvent[] = [
  { id: 'double', name: tr('DOUBLE RÉCOMPENSE'), icon: 'coin', text: tr('Les ennemis rapportent deux fois plus d\'or.') },
  { id: 'invasion', name: tr('INVASION'), icon: 'claw', text: tr('Beaucoup plus d\'ennemis faibles arrivent.') },
  { id: 'elite', name: tr('ÉLITE'), icon: 'crown', text: tr('2 ennemis par voie sont des élites (PV x4, butin x6).') },
  { id: 'fog', name: tr('BROUILLARD'), icon: 'fog', text: tr('Portée des unités -30 % pendant les 20 premières secondes.') },
  { id: 'overcharge', name: tr('SURCHARGE'), icon: 'bolt', text: tr('Vos unités attaquent 40 % plus vite pendant 12 s.') },
  { id: 'rush', name: tr('VENT DE FAILLE'), icon: 'ff', text: tr('Ennemis 25 % plus rapides, mais butin +50 %.') },
];
export function waveEvent(id: string | null | undefined) { return WAVE_EVENTS.find(e => e.id === id) ?? null; }
