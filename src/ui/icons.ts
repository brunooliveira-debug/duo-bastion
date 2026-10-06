// Inline stroke SVG icons for the HUD (no emoji in the main HUD, crisp at any size).
const P: Record<string, string> = {
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  ether: '<path d="M12 3l6 7-6 11-6-11z"/><path d="M6 10h12"/>',
  income: '<path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  pick: '<path d="M5 20l9-9"/><path d="M7 6c4-3 9-3 13 1-4-1-8 0-11 3"/>',
  claw: '<path d="M6 20c2-6 2-10 0-16"/><path d="M12 20c1-6 1-10 0-16"/><path d="M18 20c-2-6-2-10 0-16"/>',
  core: '<path d="M12 2l7 10-7 10-7-10z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  ff: '<path d="M4 6l7 6-7 6z"/><path d="M13 6l7 6-7 6z"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  sword: '<path d="M5 19L17 7"/><path d="M14 4h6v6"/><path d="M7 15l2 2"/>',
  bow: '<path d="M6 4c8 2 12 6 14 14"/><path d="M6 4l12 14"/><path d="M14 8l4-4"/>',
  flame: '<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 5-11 3 3 7 6 7 11 0 3-2 6-6 6z"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
  dagger: '<path d="M14 4l6 6-9 9-4 1 1-4z"/><path d="M5 19l-1 1"/>',
  gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
};

export function icon(name: string, size = 20, color = 'currentColor', width = 2.4) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

/** Role icon for a unit card. */
export function roleIcon(roles: string[]) {
  if (roles.includes('tank')) return 'shield';
  if (roles.includes('assassin')) return 'dagger';
  if (roles.includes('support')) return 'note';
  if (roles.includes('carry')) return 'gem';
  if (roles.includes('mage')) return 'flame';
  if (roles.includes('ranged')) return 'bow';
  return 'sword';
}
