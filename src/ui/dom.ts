// Tiny DOM helpers (no framework → small bundle, fast on phones).
import { UNITS, FACTIONS } from '../data/units';
import type { Role } from '../data/types';

type Attrs = Record<string, unknown> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }

const ROLE_ICON: Partial<Record<Role, string>> = {
  tank: '🛡️', assassin: '🗡️', support: '🎵', carry: '💎', mage: '🔥', ranged: '🏹', dps: '⚔️', aoe: '🌊',
};
export function unitIcon(id: string) {
  const u = UNITS[id];
  for (const r of ['tank', 'assassin', 'support', 'carry', 'mage', 'ranged', 'dps'] as Role[]) if (u.roles.includes(r)) return ROLE_ICON[r]!;
  return '⚔️';
}
export function unitColor(id: string) { return FACTIONS[UNITS[id].faction].color; }
export function roleLabel(id: string) {
  const names: Record<string, string> = { tank: 'Tank', dps: 'DPS', ranged: 'Distance', support: 'Soutien', aura: 'Aura', aoe: 'Zone', assassin: 'Assassin', mage: 'Mage', summoner: 'Invocateur', carry: 'Carry', hybrid: 'Hybride' };
  return UNITS[id].roles.map(r => names[r]).join(' · ');
}
export function shortName(id: string) {
  const n = UNITS[id].name;
  return n.replace(/^(Sentinelle|Gardienne du|Harmoniste|Tireuse d'|Carapace des|Oracle de|Spectre|Exarque|Léviathan des|Grand|Chasseresse|Bastion|Faucheuse-|Voile)\s?/, m => m).split(' ').slice(0, 2).join(' ');
}

export function fmt(n: number) { return Math.floor(n).toLocaleString('fr-FR'); }

export function vibrate(ms: number | number[]) { try { navigator.vibrate?.(ms); } catch { /* unsupported (iOS) */ } }
