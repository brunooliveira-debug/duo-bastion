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
  pause: '<path d="M8 5v14M16 5v14"/>',
  skull: '<path d="M12 3c-4.5 0-7 3-7 6.5 0 2.3 1.2 3.8 2.5 4.6V18h9v-3.9c1.3-.8 2.5-2.3 2.5-4.6C19 6 16.5 3 12 3z"/><circle cx="9.3" cy="10.5" r="1.4"/><circle cx="14.7" cy="10.5" r="1.4"/><path d="M10 18v2M14 18v2"/>',
  snow: '<path d="M12 2v20M3.5 7l17 10M3.5 17l17-10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  comet: '<circle cx="16" cy="8" r="3"/><path d="M13.5 10.5L4 20M11 8L5 14M16 13l-6 6"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  missile: '<path d="M14 4l6 6-8 8-3-3z"/><path d="M9 15l-4 1-1 4 4-1 1-4"/><path d="M17 7l-6 6"/>',
  emp: '<circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 0 1 9 9M3 12a9 9 0 0 1 9-9M12 21a9 9 0 0 1-9-9M21 12a9 9 0 0 1-9 9"/>',
  leafheal: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l8-8"/>',
  roots: '<path d="M12 3v8M12 11c-3 2-5 5-6 9M12 11c3 2 5 5 6 9M12 11v9"/>',
  tree: '<path d="M12 2l6 8h-3l4 6H5l4-6H6z"/><path d="M12 16v6"/>',
  bubble: '<circle cx="12" cy="12" r="8"/><path d="M8.5 9a4 4 0 0 1 3-2.5"/>',
  wave: '<path d="M2 15c3 0 3-4 6-4s3 4 6 4 3-4 6-4 2 2 2 2"/><path d="M2 20c3 0 3-3 6-3s3 3 6 3 3-3 6-3"/>',
  tentacle: '<path d="M6 21c0-6 5-6 5-11a3 3 0 0 0-6 0"/><path d="M14 21c0-5 6-6 6-11a3 3 0 0 0-5-2"/>',
  volcano: '<path d="M3 21l6-10h6l6 10z"/><path d="M10 7l2-4 2 4M8 5l-2-2M16 5l2-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  scythe: '<path d="M4 21L14 6"/><path d="M14 6c3-3 6-3 8-1-3 0-6 1-8 4"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  fog: '<path d="M3 9h14M6 13h15M3 17h12"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 5"/>',
  up: '<path d="M12 20V5M5 11l7-7 7 7"/>',
  merge: '<path d="M6 3v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><path d="M12 14v7"/>',
  sell: '<path d="M4 12h16M14 6l6 6-6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  swords: '<path d="M4 4l10 10M20 4L10 14"/><path d="M6 18l3-3M18 18l-3-3M4 20l2-2M20 20l-2-2"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-3-6.3"/><path d="M20 4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  // v0.4
  duo: '<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/><path d="M12 8.2v7.6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  back: '<path d="M10 6L4 12l6 6"/><path d="M4 12h12a4 4 0 0 1 4 4v2"/>',
  run: '<circle cx="14" cy="4.5" r="2"/><path d="M6 21l4-6 3 2 1 4M10 15l1-6 4 3h4M7 10l4-1"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  rune: '<path d="M12 2l8 5v10l-8 5-8-5V7z"/><path d="M12 7v10M9 10l3 2 3-2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  portal: '<ellipse cx="12" cy="12" rx="6" ry="9"/><path d="M12 7a2.5 5 0 0 1 0 10"/>',
  cannon: '<circle cx="8" cy="16" r="4"/><path d="M10.5 13l9-7 1.5 2-8.5 7.5"/>',
  beam: '<path d="M4 20l7-7"/><path d="M11 13l9-9"/><circle cx="11" cy="13" r="2.5"/>',
  pulse: '<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10"/>',
  chain: '<rect x="3" y="9" width="9" height="6" rx="3"/><rect x="12" y="9" width="9" height="6" rx="3"/>',
};

export function icon(name: string, size = 20, color = 'currentColor', width = 2.4) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;
}

/** Category icon for a unit card. */
export function categoryIcon(cat: string) {
  return ({ defense: 'shield', lourde: 'swords', portee: 'bow', antiblindage: 'target', zone: 'flame', soutien: 'note', rapide: 'dagger', speciale: 'gem' } as Record<string, string>)[cat] ?? 'sword';
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
