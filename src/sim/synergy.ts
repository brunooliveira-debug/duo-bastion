// Placement analysis shared by the combat system and the UI: zone bonuses, rune tiles and adjacency synergies.
import { pairSynergies, zoneOf, isFrontUnit, isRangedUnit, SynergyId, Zone, RuneKind, RuneTile } from '../data/synergies';
import type { Build } from './state';

export interface BuildBonus {
  zone: Zone;
  zoneActive: boolean; // the unit actually benefits from its zone
  rune: RuneKind | null;
  syn: SynergyId[];
  links: { bid: number; syn: SynergyId }[]; // neighbours that grant a synergy
}

/** Bonuses of every build of a player (by bid). */
export function buildBonuses(builds: Build[], runes: RuneTile[]): Map<number, BuildBonus> {
  const out = new Map<number, BuildBonus>();
  for (const b of builds) {
    const zone = zoneOf(b.col);
    const zoneActive = (zone === 'front' && isFrontUnit(b.defId)) || (zone === 'back' && isRangedUnit(b.defId));
    const rune = runes.find(r => r.col === b.col && r.row === b.row)?.kind ?? null;
    const syn = new Set<SynergyId>();
    const links: { bid: number; syn: SynergyId }[] = [];
    for (const o of builds) {
      if (o === b || Math.max(Math.abs(o.col - b.col), Math.abs(o.row - b.row)) !== 1) continue;
      for (const id of pairSynergies(b.defId, o.defId)) {
        if (!syn.has(id)) { syn.add(id); links.push({ bid: o.bid, syn: id }); }
      }
    }
    out.set(b.bid, { zone, zoneActive, rune, syn: [...syn], links });
  }
  return out;
}

/** Synergies a unit of `defId` would get at (col,row) — for the placement preview. */
export function previewSynergies(defId: string, col: number, row: number, builds: Build[], exceptBid = -1): SynergyId[] {
  const syn = new Set<SynergyId>();
  for (const o of builds) {
    if (o.bid === exceptBid || Math.max(Math.abs(o.col - col), Math.abs(o.row - row)) !== 1) continue;
    for (const id of pairSynergies(defId, o.defId)) syn.add(id);
    for (const id of pairSynergies(o.defId, defId)) syn.add(id);
  }
  return [...syn];
}
