// COMPAGNIE MIXTE (v0.7.3) — a player may replace their army's roster by a company of their own: 6 units picked
// from every army, one per category (6 of the 8 categories), led by a commander army (doctrine, powers, help
// effect, Résonance pair). The host validates the company when the game is created; anything invalid falls back
// to the native roster. Pure data helpers shared by the UI, the simulation and the network layer.
import { UNITS, BASE_UNIT_IDS, FACTIONS, FACTION_IDS } from './units';
import type { FactionId, UnitCategory } from './types';

export const COMPANY_SIZE = 6;

export const CATEGORY_ORDER: UnitCategory[] = ['defense', 'lourde', 'portee', 'antiblindage', 'zone', 'soutien', 'rapide', 'speciale'];

/** What each category is for (codex + company builder). */
export const CATEGORY_HELP: Record<UnitCategory, string> = {
  defense: 'Première ligne : encaisse, bloque et provoque. Posez-les devant, sur les cases « première ligne ».',
  lourde: 'Gros dégâts au contact et beaucoup de PV, mais lents : le mur qui frappe.',
  portee: 'Tirent de loin depuis leur tour (immobiles en combat). Placez-les derrière la ligne de front.',
  antiblindage: 'Percent l\'armure : la réponse aux Blindés, aux mini-boss et aux boss.',
  zone: 'Touchent plusieurs ennemis à la fois : indispensables contre les nuées.',
  soutien: 'Soins, boucliers, cadence pour les voisins : à placer au milieu du groupe.',
  rapide: 'Vifs : interceptent les fuyards, chassent les tireurs et les brécheurs.',
  speciale: 'Mécaniques uniques — invocations, camouflage, exécution, machines — qui changent une partie.',
};

/** Base (non-token) units of a category, army order. */
export function unitsOfCategory(cat: UnitCategory): string[] {
  return BASE_UNIT_IDS.filter(id => UNITS[id].category === cat);
}

/** A valid company: 6 distinct base units, one per category. Returns the ids or null. */
export function validateCompany(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length !== COMPANY_SIZE) return null;
  const out: string[] = [];
  const cats = new Set<UnitCategory>();
  for (const id of ids) {
    if (typeof id !== 'string') return null;
    const u = UNITS[id];
    if (!u || u.token || out.includes(id) || cats.has(u.category)) return null;
    cats.add(u.category);
    out.push(id);
  }
  return out;
}

/** Armies represented in a company, most units first (ties: army order). */
export function companyArmies(ids: string[]): FactionId[] {
  const n = new Map<FactionId, number>();
  for (const id of ids) { const f = UNITS[id]?.faction; if (f) n.set(f, (n.get(f) ?? 0) + 1); }
  return FACTION_IDS.filter(f => n.has(f)).sort((a, b) => n.get(b)! - n.get(a)!);
}

/** Commander of a company: the preferred army when it has a unit in the company, else the best represented. */
export function companyCommander(ids: string[], preferred?: string): FactionId {
  const armies = companyArmies(ids);
  if (preferred && armies.includes(preferred as FactionId)) return preferred as FactionId;
  return armies[0] ?? 'astreens';
}

/** Short label of a company for badges: "Compagnie mixte · Rouages + Ronces + …". */
export function companyLabel(ids: string[]) {
  return companyArmies(ids).map(f => FACTIONS[f].title).join(' + ');
}
