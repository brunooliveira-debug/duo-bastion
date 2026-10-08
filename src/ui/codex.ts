// CODEX (v0.7.3): every unit by category and by army — stats, types, abilities, strengths / weaknesses,
// specialisations — and the COMPANY BUILDER: compose a mixed company of 6 units (one per category) from every army.
import { h, clear, fmt } from './dom';
import { icon, categoryIcon } from './icons';
import { UNITS, FACTIONS, FACTION_IDS, CATEGORY_NAMES, CATEGORY_COLORS, unitStats, BRANCH_LEVEL, MAX_LEVEL } from '../data/units';
import { ATTACK_ICONS, ATTACK_NAMES, DEFENSE_ICONS, DEFENSE_NAMES, DAMAGE_MATRIX, matrixArrow } from '../data/economy';
import { FACTION_POWERS } from '../data/powers';
import type { DefenseType, FactionId, UnitCategory } from '../data/types';
import { CATEGORY_ORDER, CATEGORY_HELP, COMPANY_SIZE, unitsOfCategory, validateCompany, companyCommander, companyArmies } from '../data/roster';
import { abilitiesText } from './unitText';
import { audio } from '../audio/AudioSystem';

import { show } from './screenHost';

const range = (x: number) => (x < 2 ? 'mêlée' : `${x.toFixed(1)} m`);
const nodes = (...xs: (HTMLElement | null)[]) => xs.filter((x): x is HTMLElement => !!x);

/** One unit entry (codex card). */
export function unitEntry(id: string, opts: { compact?: boolean; selected?: boolean; onClick?: () => void; disabled?: boolean } = {}) {
  const u = UNITS[id];
  const f = FACTIONS[u.faction];
  const s1 = unitStats(id, 1), s5 = unitStats(id, MAX_LEVEL, null);
  const eff = (Object.keys(DEFENSE_NAMES) as DefenseType[]).map(d => `${DEFENSE_ICONS[d]}${matrixArrow(DAMAGE_MATRIX[s1.attack][d])}`).join(' ');
  const head = h('div', { class: 'cx-head' },
    h('span', { class: 'cx-cat', style: `--cat:${CATEGORY_COLORS[u.category]}`, html: icon(categoryIcon(u.category), 14, '#14112A', 3) }),
    h('div', { class: 'cx-title' }, h('b', {}, u.name), h('small', { style: `color:${f.color}` }, `${f.name} · ${CATEGORY_NAMES[u.category]}${u.tower ? ' · tour' : ''}`)),
    h('span', { class: 'cx-cost' }, `${u.cost} 🪙`));
  const stats = h('div', { class: 'cx-stats' },
    h('span', {}, `❤️ ${fmt(s1.hp)}`), h('span', {}, `🛡 ${Math.round(s1.armor * 100)} %`), h('span', {}, `⚔️ ${fmt(s1.dmg)} × ${s1.atkSpeed.toFixed(1)}/s`),
    h('span', {}, `🔥 DPS ${fmt(s1.dmg * s1.atkSpeed)}`), h('span', {}, `🎯 ${range(s1.range)}`),
    h('span', {}, `${ATTACK_ICONS[s1.attack]} ${ATTACK_NAMES[s1.attack]} → ${eff}`), h('span', {}, `${DEFENSE_ICONS[s1.defense]} ${DEFENSE_NAMES[s1.defense]}`));
  const el = h(opts.onClick ? 'button' : 'div', { class: `cx-unit${opts.compact ? ' compact' : ''}${opts.selected ? ' on' : ''}`, style: `--fc:${f.color}`, disabled: !!opts.disabled, onclick: opts.onClick }, head, stats);
  if (!opts.compact) {
    el.append(...nodes(
      h('p', { class: 'cx-desc' }, u.description),
      h('div', { class: 'cx-text' }, u.skillText !== '—' ? h('div', {}, '✦ ', u.skillText) : null, h('div', {}, '◆ ', u.passiveText), abilitiesText(s1.abilities) ? h('div', { class: 'muted' }, abilitiesText(s1.abilities)) : null),
      h('div', { class: 'cx-pc' }, h('span', { class: 'pros' }, '✔ ', u.pros), h('span', { class: 'cons' }, '✖ ', u.cons)),
      h('div', { class: 'muted small' }, `Niveau ${MAX_LEVEL} : ${fmt(s5.hp)} PV · DPS ${fmt(s5.dmg * s5.atkSpeed)}`),
      u.branches ? h('div', { class: 'cx-br' }, ...u.branches.map((b, i) => h('div', {}, h('b', {}, `${i ? 'B' : 'A'} · ${b.name}`), h('small', {}, b.text)))) : null,
    ));
    if (u.branches) el.querySelector('.cx-br')!.prepend(h('small', { class: 'muted' }, `Spécialisation au niveau ${BRANCH_LEVEL} (définitive) :`));
  }
  return el;
}

/** Codex screen: tabs "par catégorie" / "par armée". */
export function codexScreen(back: () => void, initialTab: 'cat' | 'army' = 'cat') {
  let tab = initialTab;
  let armyFilter: FactionId | 'all' = 'all';
  const body = h('div', { class: 'cx-body' });
  const tabs = h('div', { class: 'seg cx-tabs' });
  const render = () => {
    clear(tabs);
    tabs.append(
      h('button', { class: tab === 'cat' ? 'on' : '', onclick: () => { tab = 'cat'; audio.play('click'); render(); } }, 'Par catégorie'),
      h('button', { class: tab === 'army' ? 'on' : '', onclick: () => { tab = 'army'; audio.play('click'); render(); } }, 'Par armée'));
    clear(body);
    if (tab === 'cat') {
      const filter = h('div', { class: 'cx-filter' }, h('button', { class: `cx-chip${armyFilter === 'all' ? ' on' : ''}`, onclick: () => { armyFilter = 'all'; render(); } }, 'Toutes les armées'),
        ...FACTION_IDS.map(f => h('button', { class: `cx-chip${armyFilter === f ? ' on' : ''}`, style: `--fc:${FACTIONS[f].color}`, onclick: () => { armyFilter = f; render(); } }, FACTIONS[f].title)));
      body.append(filter);
      for (const cat of CATEGORY_ORDER) {
        const ids = unitsOfCategory(cat).filter(id => armyFilter === 'all' || UNITS[id].faction === armyFilter);
        if (!ids.length) continue;
        body.append(h('div', { class: 'cx-section', style: `--cat:${CATEGORY_COLORS[cat]}` },
          h('div', { class: 'cx-sh' }, h('span', { class: 'cx-cat', html: icon(categoryIcon(cat), 16, '#14112A', 3) }), h('b', {}, CATEGORY_NAMES[cat]), h('small', {}, CATEGORY_HELP[cat])),
          h('div', { class: 'cx-grid' }, ...ids.map(id => unitEntry(id)))));
      }
    } else {
      for (const f of FACTION_IDS) {
        const d = FACTIONS[f];
        body.append(h('div', { class: 'cx-section army', style: `--cat:${d.color}` },
          h('div', { class: 'cx-sh' }, h('b', { style: `color:${d.color}` }, d.name), h('small', {}, `${d.title} — ${d.style}`)),
          h('div', { class: 'cx-army' },
            h('div', {}, h('b', {}, `Doctrine — ${d.doctrine.name}`), h('small', {}, d.doctrine.text)),
            h('div', {}, h('b', {}, `Entraide — ${d.help.name}`), h('small', {}, d.help.text)),
            h('div', {}, h('b', {}, 'Forces'), h('small', { class: 'pros' }, d.strengths.join(' · '))),
            h('div', {}, h('b', {}, 'Faiblesses'), h('small', { class: 'cons' }, d.weaknesses.join(' · '))),
            h('div', {}, h('b', {}, 'Pouvoirs de commandant'), h('small', {}, FACTION_POWERS[f].map(p => `${p.name} (${p.cooldown} s) : ${p.text}`).join(' · ')))),
          h('div', { class: 'cx-grid' }, ...d.units.map(id => unitEntry(id)))));
      }
      body.append(h('div', { class: 'cx-section' }, h('div', { class: 'cx-sh' }, h('b', {}, 'Matrice attaque / défense'), h('small', {}, '↑ = +10 à +20 % de dégâts, ↓ = −10 à −20 %. Lisez le type de défense de la vague et adaptez vos unités.')), matrixTable()));
    }
  };
  render();
  const scr = h('div', { class: 'screen codex' },
    h('h2', {}, '📖 Codex des unités'),
    h('p', { class: 'muted center small', style: 'margin:0 0 6px' }, `${CATEGORY_ORDER.length} catégories, 6 armées, ${FACTION_IDS.length * 6} unités. Niveaux 1 → 5, spécialisation définitive au niveau ${BRANCH_LEVEL}.`),
    tabs, body,
    h('button', { class: 'btn ghost', onclick: back }, '← Retour'));
  show(scr);
  return scr;
}

function matrixTable() {
  const t = h('table', { class: 'end-table', style: 'font-size:12px;max-width:520px' });
  const defs = Object.keys(DEFENSE_NAMES) as DefenseType[];
  t.append(h('tr', {}, h('th', {}, ''), ...defs.map(d => h('th', {}, `${DEFENSE_ICONS[d]} ${DEFENSE_NAMES[d]}`))));
  for (const a of Object.keys(ATTACK_NAMES) as (keyof typeof ATTACK_NAMES)[]) t.append(h('tr', {}, h('td', {}, `${ATTACK_ICONS[a]} ${ATTACK_NAMES[a]}`), ...defs.map(d => h('td', {}, `${matrixArrow(DAMAGE_MATRIX[a][d])} ${Math.round(DAMAGE_MATRIX[a][d] * 100)} %`))));
  return t;
}

/**
 * Company builder: pick one unit per category (6 of 8), choose the commander army among those present.
 * onPick(ids, commander) — ids are valid (validateCompany) when called.
 */
export function companyScreen(initial: string[] | null, initialCommander: string | null, onPick: (ids: string[], commander: FactionId) => void, onBack: () => void) {
  let picked: string[] = validateCompany(initial) ?? [];
  let commander: string | null = initialCommander;
  const body = h('div', { class: 'cx-body company' });
  const status = h('div', { class: 'cp-status' });
  const okBtn = h('button', { class: 'btn primary', onclick: () => { const v = validateCompany(picked); if (!v) return; audio.play('ready'); onPick(v, companyCommander(v, commander ?? undefined)); } }, 'Valider la compagnie');
  const render = () => {
    clear(body);
    for (const cat of CATEGORY_ORDER) {
      const ids = unitsOfCategory(cat);
      const chosen = picked.find(id => UNITS[id].category === cat);
      body.append(h('div', { class: `cx-section cp-row${chosen ? ' has' : ''}`, style: `--cat:${CATEGORY_COLORS[cat]}` },
        h('div', { class: 'cx-sh' }, h('span', { class: 'cx-cat', html: icon(categoryIcon(cat), 16, '#14112A', 3) }), h('b', {}, CATEGORY_NAMES[cat]), chosen ? h('span', { class: 'badge ok' }, UNITS[chosen].name) : h('span', { class: 'badge wait' }, 'libre'), h('small', {}, CATEGORY_HELP[cat])),
        h('div', { class: 'cx-grid cp-grid' }, ...ids.map(id => unitEntry(id, {
          compact: true, selected: picked.includes(id),
          disabled: !picked.includes(id) && !chosen && picked.length >= COMPANY_SIZE,
          onClick: () => {
            audio.play('click');
            if (picked.includes(id)) picked = picked.filter(x => x !== id);
            else { picked = picked.filter(x => UNITS[x].category !== cat); if (picked.length < COMPANY_SIZE) picked.push(id); }
            render();
          },
        })))));
    }
    // commander
    const armies = companyArmies(picked);
    const cmd = armies.length ? companyCommander(picked, commander ?? undefined) : null;
    clear(status);
    status.append(...nodes(
      h('div', { class: 'cp-count' }, h('b', {}, `${picked.length} / ${COMPANY_SIZE}`), h('small', {}, picked.length < COMPANY_SIZE ? ` — choisis encore ${COMPANY_SIZE - picked.length} unité${COMPANY_SIZE - picked.length > 1 ? 's' : ''} (une par catégorie)` : ' — compagnie complète')),
      h('div', { class: 'cp-cmd' }, h('small', { class: 'muted' }, 'Commandant (doctrine, pouvoirs, entraide, Résonance) : '),
        ...(armies.length ? armies.map(f => h('button', { class: `cx-chip${cmd === f ? ' on' : ''}`, style: `--fc:${FACTIONS[f].color}`, onclick: () => { commander = f; audio.play('click'); render(); } }, FACTIONS[f].title)) : [h('small', { class: 'muted' }, '— une armée présente dans la compagnie')])),
      cmd ? h('div', { class: 'small' }, h('b', {}, `${FACTIONS[cmd].doctrine.name} : `), FACTIONS[cmd].doctrine.text) : null));
    (okBtn as HTMLButtonElement).disabled = !validateCompany(picked);
  };
  render();
  const scr = h('div', { class: 'screen codex' },
    h('h2', {}, '🧩 Compagnie mixte'),
    h('p', { class: 'muted center small', style: 'margin:0 0 6px' }, `Compose ton armée : ${COMPANY_SIZE} unités piochées dans les 6 armées, une par catégorie. Le commandant donne sa doctrine, ses pouvoirs et son entraide à toute la compagnie.`),
    status, body,
    h('div', { class: 'row', style: 'margin-top:8px;justify-content:center' }, okBtn, h('button', { class: 'btn ghost', onclick: onBack }, '← Retour')));
  show(scr);
  return scr;
}
