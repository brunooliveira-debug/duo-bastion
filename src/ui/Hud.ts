// UISystem (in-game): HUD, touch input (tap / drag & drop / long-press / pinch / twist), panels, feedback.
// Mobile-first: the important buttons sit under the thumbs, panels never cover the middle of the lane.
import { UNITS, FACTIONS, CATEGORY_NAMES, CATEGORY_COLORS, MAX_LEVEL, BRANCH_LEVEL, upgradeCost, unitStats, unitValueAt } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { getWave, waveEvent } from '../data/waves';
import {
  ATTACK_ICONS, ATTACK_NAMES, CORE, CURSES, DAMAGE_MATRIX, DEFENSE_ICONS, DEFENSE_NAMES, ECONOMY, PINGS, POWERS, RAIDERS, RAIDER_CATEGORY_NAMES,
  curseUnlock, matrixArrow, raiderPrice, raiderScale, raiderUnlock, sendCap,
} from '../data/economy';
import { FACTION_POWERS, POWER_LEVEL_CD, POWER_MAX_LEVEL, POWER_UP_COST, powerUnlock } from '../data/powers';
import { SYNERGIES, ZONE_TEXT, RUNES, zoneOf } from '../data/synergies';
import type { Ability, AttackType, Branch, DefenseType } from '../data/types';
import type { CoreUpgradeId } from '../data/economy';
import { recommendedValue, riskOf, powerBucket } from '../sim/balance';
import { buildBonuses, previewSynergies } from '../sim/synergy';
import type { Build, GameEvent } from '../sim/state';
import type { Command } from '../sim/game';
import { Renderer, DragGhost } from '../render/Renderer';
import type { Session } from '../net/Session';
import type { MetaView, PlayerView } from '../net/snapshot';
import { audio } from '../audio/AudioSystem';
import { save } from '../save/SaveSystem';
import { DEBUG } from '../config';
import { h, clear, fmt, vibrate } from './dom';
import { icon, categoryIcon } from './icons';
import { Tutorial } from './Tutorial';

type Sheet = 'raiders' | 'core' | 'stats' | 'pings' | 'menu' | 'unit' | 'info' | 'opp' | 'syn' | null;

export interface HudCallbacks { exit(): void; rematch(): void }

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(t: string) { return t.replace(/[&<>"']/g, c => HTML_ESC[c]); }
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const stars = (n: number, max = MAX_LEVEL) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(Math.max(0, max - n)) + '</span>';

export class Hud {
  root: HTMLDivElement;
  private els: Record<string, HTMLElement> = {};
  private sheet: Sheet = null;
  private sheetArg: string | number | null = null;
  private selCard: string | null = null;
  private ghost: DragGhost | null = null;
  selected: { pid: number; bid: number } | null = null;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private gesture: 'none' | 'pan' | 'pinch' | 'cardDrag' | 'moveBuild' = 'none';
  private pinchDist = 0;
  private pinchAng = 0;
  private dragBuild: number | null = null;
  private longTimer: number | null = null;
  private dragEl: HTMLDivElement | null = null;
  private lastUi = 0;
  private metaAt = 0;
  private metaTimer = 0;
  private lastMeta: MetaView | null = null;
  private lastPhase = '';
  private lastWave = 0;
  private ended = false;
  private tutorial: Tutorial | null = null;
  private focused = false;
  private raiderTab: 'sends' | 'curses' = 'sends';
  private target: number | null = null;
  private lastCount = -1;
  private bossIds = new Set<string>();

  constructor(private session: Session, private r: Renderer, private cb: HudCallbacks) {
    this.root = h('div', { id: 'hud' });
    document.body.append(this.root);
    this.root.addEventListener('mousedown', e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.root.addEventListener('click', e => (e.target as HTMLElement).closest('button')?.blur(), true);
    this.build();
    this.bindInput();
  }

  get me(): PlayerView | null { return this.session.view.meta?.players[this.session.myPid] ?? null; }
  get meta() { return this.session.view.meta; }

  destroy() {
    this.root.remove();
    this.dragEl?.remove();
    const c = this.r.renderer.domElement;
    c.onpointerdown = c.onpointermove = c.onpointerup = c.onpointercancel = null;
    c.onwheel = null;
  }

  private cmd(c: Command) {
    const err = this.session.send(c);
    if (err) { this.toast(err, 'error'); audio.play('error'); return false; }
    return true;
  }

  // ------------------------------------------------------------------ DOM skeleton
  private build() {
    const E = this.els;
    const pill = (ic: string, color: string, val: HTMLElement, extra = '', label = '') => h('div', { class: `pill ${extra}`, 'aria-label': label }, h('span', { html: icon(ic, 22, color) }), val);
    // top-left: lives (Core), gold, ether, income, wave + timer
    E.coreTxt = h('b'); E.coreFill = h('i'); E.coreBar = h('div', { class: 'bar' }, E.coreFill);
    E.gold = h('b', { class: 'g' }); E.ether = h('b', { class: 'e' }); E.income = h('b', { class: 'inc' });
    E.wave = h('b'); E.timer = h('span', { class: 'timer-chip' });
    const pills = h('div', { class: 'pills' },
      h('div', { class: 'pill core-pill', 'aria-label': 'Points de vie du Core' }, h('span', { html: icon('heart', 22, '#FF5A6A') }), h('div', { class: 'core-col' }, E.coreTxt, E.coreBar)),
      pill('coin', '#FFC233', E.gold, '', 'Or'), pill('ether', '#9FE9FF', E.ether, '', 'Éther'), pill('income', '#7DFFB0', E.income, 'inc-pill', 'Revenu par vague'),
      h('div', { class: 'pill wave-pill' }, h('span', { html: icon('skull', 22, '#F2ECE0') }), E.wave, E.timer));
    // top-right: partner, opponent, chat, speed, pause, menu
    E.partner = h('div', { class: 'partner' });
    E.opp = h('button', { class: 'oppchip', 'aria-label': 'Informations sur l\'adversaire', onclick: () => this.openSheet('opp') });
    E.speedBadge = h('span', { class: 'badge2' });
    E.speedBtn = h('button', { class: 'sqbtn', 'aria-label': 'Vitesse de jeu', html: icon('ff', 22), onclick: () => this.cycleSpeed() });
    E.speedBtn.append(E.speedBadge);
    E.pauseBtn = h('button', { class: 'sqbtn', 'aria-label': 'Pause', html: icon('pause', 22), onclick: () => this.togglePause() });
    const top = h('div', { class: 'hud-top' }, pills, h('div', { class: 'top-right' }, E.partner, E.opp,
      h('button', { class: 'sqbtn', 'aria-label': 'Messages au partenaire', html: icon('chat', 22), onclick: () => this.openSheet('pings') }),
      E.speedBtn, E.pauseBtn,
      h('button', { class: 'sqbtn', 'aria-label': 'Menu', html: icon('gear', 22), onclick: () => this.openSheet('menu') })));
    // second row: army vs recommended, next wave (+ event), synergies
    E.army = h('div', { class: 'pill small army' });
    E.next = h('button', { class: 'pill small next', onclick: () => { E.nextDetail.style.display = E.nextDetail.style.display === 'none' ? 'block' : 'none'; } });
    E.nextDetail = h('div', { class: 'next-detail', style: 'display:none' });
    E.syn = h('button', { class: 'pill small synpill', onclick: () => this.openSheet('syn') });
    E.left = h('div', { class: 'hud-left' }, h('div', { class: 'hud-row2' }, E.army, E.next, E.syn), E.nextDetail);
    // boss bar (top centre, combat)
    E.bossName = h('b'); E.bossMech = h('small'); E.bossFill = h('i');
    E.boss = h('div', { class: 'bossbar', style: 'display:none' }, h('div', { class: 'bb-head' }, h('span', { html: icon('crown', 18, '#FFC233') }), E.bossName, E.bossMech), h('div', { class: 'bb-bar' }, E.bossFill));
    // bottom: unit cards (build) / powers (combat) + round actions + LAUNCH
    E.cards = h('div', { class: 'cards' });
    E.powers = h('div', { class: 'powers', style: 'display:none' });
    const round = (cls: string, ic: string, color: string, label: string, onclick: () => void) => {
      const badge = h('span', { class: 'badge2' });
      const sub = h('small', {}, label);
      const btn = h('button', { class: `rbtn ${cls}`, 'aria-label': label, html: icon(ic, 28, color), onclick });
      btn.append(badge);
      return { wrap: h('div', { class: 'rwrap' }, btn, sub), btn, badge, sub };
    };
    const w = round('worker', 'pick', '#FFD27A', 'Ouvrier', () => { if (this.cmd({ c: 'worker' })) { audio.play('worker'); this.tutorial?.on('worker'); } });
    const r = round('raider', 'swords', '#FF9AA6', 'Attaquer', () => this.openSheet('raiders'));
    const c = round('corebtn', 'core', '#9FE9FF', 'Core', () => this.openSheet('core'));
    E.workerBtn = w.btn; E.workerBadge = w.badge; E.workerSub = w.sub;
    E.raiderBtn = r.btn; E.raiderBadge = r.badge; E.raiderSub = r.sub; E.raiderWrap = r.wrap;
    E.coreBtn = c.btn; c.badge.style.display = 'none';
    E.readyLabel = h('span', { class: 'rl' }); E.readySub = h('small', { class: 'rs' });
    E.ready = h('button', { class: 'ready', onclick: () => this.toggleReady() }, h('span', { class: 'ring' }), E.readyLabel, E.readySub);
    const bottom = h('div', { class: 'hud-bottom' }, E.cards, E.powers, h('div', { class: 'actions' }, w.wrap, r.wrap, c.wrap, E.ready));
    E.sheet = h('div', { class: 'sheet', style: 'display:none' });
    E.toasts = h('div', { class: 'toasts' });
    E.vignette = h('div', { class: 'vignette' });
    E.countdown = h('div', { class: 'countdown', style: 'display:none' });
    E.placeTip = h('div', { class: 'placetip', style: 'display:none' });
    E.overlay = h('div', { class: 'overlay-msg', style: 'display:none' });
    E.rotate = h('div', { class: 'rotate' }, '↻ Tourne ton téléphone en mode paysage pour mieux jouer');
    this.root.append(E.vignette, top, E.left, E.boss, bottom, E.sheet, E.toasts, E.countdown, E.placeTip, E.overlay, E.rotate);
    if (DEBUG) this.root.append(this.debugPanel());
  }

  private debugPanel() {
    const b = (label: string, action: string) => h('button', { onclick: () => this.cmd({ c: 'debug', action }) }, label);
    return h('div', { class: 'debug' }, b('+500 or', 'gold'), b('+100 éther', 'ether'), b('Vague +1', 'wave'), b('Lancer', 'skip'), b('Tuer tout', 'kill'), b('Core 100%', 'core'), b('Pouvoirs', 'cd'), b('Événement', 'event'),
      h('button', { onclick: () => this.cmd({ c: 'speed', speed: 3 }) }, 'x3'), h('button', { onclick: () => this.cmd({ c: 'speed', speed: 1 }) }, 'x1'));
  }

  // ------------------------------------------------------------------ per-frame update
  update(dt: number) {
    const m = this.meta;
    if (!m) return;
    if (m !== this.lastMeta) { this.lastMeta = m; this.metaAt = performance.now(); this.metaTimer = m.timer; }
    if (!this.focused && this.me) { this.r.focus(this.me.slot, this.me.team); this.focused = true; if (m.settings.tutorial) this.tutorial = new Tutorial(this.root, this.session, () => this.me); }
    for (const ev of this.peekEvents()) this.onEvent(ev, m);
    if (m.phase !== this.lastPhase || m.wave !== this.lastWave) this.onPhase(m);
    const now = performance.now();
    const elapsed = m.paused ? 0 : (now - this.metaAt) / 1000 * m.speed;
    const t = Math.max(0, this.session.role === 'guest' ? this.metaTimer - elapsed : m.timer);
    const tm = this.els.timer;
    tm.textContent = m.paused ? 'PAUSE' : m.phase === 'build' ? `${Math.ceil(t)} s` : m.phase === 'combat' ? (m.ending > 0 ? '!!!' : 'COMBAT') : m.phase === 'ended' ? 'FIN' : '…';
    tm.classList.toggle('urgent', m.phase === 'build' && t < 6 && !m.paused);
    tm.classList.toggle('combat', m.phase === 'combat');
    // launch-button ring = remaining preparation time
    const ring = this.els.ready.querySelector('.ring') as HTMLElement;
    const k = m.phase === 'build' ? Math.max(0, Math.min(1, t / Math.max(1, m.timerMax))) : 0;
    ring.style.setProperty('--k', String(k));
    // big final countdown
    const cd = this.els.countdown;
    const n = m.phase === 'build' && !m.paused && t <= 5.5 && t > 0.05 ? Math.ceil(t) : 0;
    if (n !== this.lastCount) {
      this.lastCount = n;
      if (n > 0) { cd.textContent = String(n); cd.style.display = ''; cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop'); audio.play(n <= 3 ? 'tick' : 'click'); }
      else cd.style.display = 'none';
    }
    if (now - this.lastUi > 100) { this.lastUi = now; this.refresh(m); }
    this.tutorial?.update(m);
    void dt;
  }

  private evQueue: GameEvent[] = [];
  private peekEvents() { const e = this.evQueue; this.evQueue = []; return e; }
  feedEvents(ev: GameEvent[]) { for (const e of ev) this.evQueue.push(e); }

  private opponents(m: MetaView) { const me = this.me!; return m.players.filter(p => p.team !== me.team); }
  private partner(m: MetaView) { const me = this.me!; return m.players.find(p => p.team === me.team && p.pid !== me.pid)!; }

  private refresh(m: MetaView) {
    const E = this.els;
    const me = this.me!;
    const total = m.settings.mode === 'survival' ? '∞' : m.settings.totalWaves;
    E.wave.textContent = `${m.wave}/${total}`;
    const ct = m.teams[me.team];
    const k = ct.hp / ct.maxHp;
    E.coreFill.style.width = `${k * 100}%`;
    E.coreBar.classList.toggle('low', k < 0.3);
    E.coreTxt.textContent = fmt(ct.hp);
    E.gold.textContent = fmt(me.gold);
    E.ether.textContent = fmt(me.ether);
    E.income.textContent = `+${me.income}`;
    const value = me.builds.reduce((t, b) => t + b.value, 0);
    const rec = recommendedValue(m.wave, me.builds, value);
    const risk = riskOf(value, rec);
    const armyKey = `${risk}|${value}|${rec}`;
    if (E.army.dataset.k !== armyKey) {
      E.army.dataset.k = armyKey;
      E.army.className = `pill small army ${risk}`;
      E.army.innerHTML = `${icon('shield', 16, risk === 'green' ? '#7DFFB0' : risk === 'orange' ? '#FFB03A' : '#FF5A6A')}<span>Armée ${fmt(value)}</span><span class="rec">· conseillé ${fmt(rec)}</span>`;
    }
    this.renderNext(m);
    // synergies chip
    const bb = buildBonuses(me.builds, me.runes ?? []);
    const synCount = new Set([...bb.values()].flatMap(b => b.syn)).size;
    const sKey = `${synCount}`;
    if (E.syn.dataset.k !== sKey) { E.syn.dataset.k = sKey; E.syn.innerHTML = `${icon('users', 16, '#7DFFB0')}<span>Synergies ${synCount}</span>`; }
    // partner chip
    const partner = this.partner(m);
    const pv = partner.builds.reduce((t, b) => t + b.value, 0);
    const off = !this.session.partnerOnline && !partner.isAI && m.settings.mode !== 'duel';
    const state = off ? 'CONNEXION…' : m.phase === 'build' ? (partner.ready ? '<em>PRÊT</em>' : 'construit…') : m.phase === 'combat' ? (partner.leakedThisWave ? `${partner.leakedThisWave} fuites` : 'en combat') : '';
    const pKey = `${partner.name}|${pv}|${partner.workers}|${state}|${off}`;
    if (E.partner.dataset.k !== pKey) {
      E.partner.dataset.k = pKey;
      E.partner.classList.toggle('off', off);
      E.partner.innerHTML = `<div class="av" style="background:${FACTIONS[partner.faction].color}">${partner.isAI ? 'IA' : esc(partner.name.slice(0, 1).toUpperCase())}</div><div><div class="nm">${esc(partner.name)}</div><div class="st">${FACTIONS[partner.faction].title} · Armée ${fmt(pv)} · ${state}</div></div>`;
    }
    // opponent chip (public info only)
    const opp = this.opponents(m);
    E.opp.style.display = opp.length ? '' : 'none';
    if (opp.length) {
      const et = m.teams[opp[0].team];
      const oKey = `${Math.round(et.hp)}|${opp.map(o => o.faction).join()}`;
      if (E.opp.dataset.k !== oKey) {
        E.opp.dataset.k = oKey;
        E.opp.innerHTML = `${icon('swords', 18, '#FF9AA6')}<div class="oc"><div class="bar enemy"><i style="width:${(et.hp / et.maxHp) * 100}%"></i></div><small>${opp.map(o => FACTIONS[o.faction].title).join(' + ')}</small></div>`;
      }
    }
    E.speedBadge.textContent = `x${m.speed}`;
    (E.speedBtn as HTMLButtonElement).disabled = this.session.role === 'guest';
    E.pauseBtn.classList.toggle('on', me.pauseVote || m.paused);
    // bottom: cards or powers
    const combat = m.phase === 'combat';
    E.cards.style.display = combat ? 'none' : '';
    E.powers.style.display = combat ? '' : 'none';
    if (combat) this.renderPowers(me, m); else this.renderCards(me, m);
    // round actions
    const wc = ECONOMY.workerBaseCost + ECONOMY.workerCostStep * (me.workers - ECONOMY.startWorkers);
    E.workerBadge.textContent = String(me.workers);
    E.workerSub.textContent = `Ouvrier ${wc}`;
    (E.workerBtn as HTMLButtonElement).disabled = me.gold < wc || me.workers >= ECONOMY.maxWorkers;
    E.raiderSub.textContent = m.settings.mode === 'survival' ? 'Investir' : 'Attaquer';
    const q = me.raiderQueue.length + me.curseQueue.length;
    E.raiderBadge.textContent = String(q);
    E.raiderBadge.style.display = q ? '' : 'none';
    // launch button
    const humans = m.players.filter(p => !p.isAI && p.pid !== me.pid);
    const waitFor = humans.filter(p => !p.ready);
    const rKey = `${me.ready}|${waitFor.map(p => p.name).join()}|${m.phase}`;
    if (E.ready.dataset.k !== rKey) {
      E.ready.dataset.k = rKey;
      if (m.phase !== 'build') { E.readyLabel.textContent = m.phase === 'combat' ? 'COMBAT' : '…'; E.readySub.textContent = ''; }
      else if (me.ready) {
        E.readyLabel.innerHTML = `${icon('check', 20, '#7DFFB0', 3)}PRÊT`;
        E.readySub.textContent = waitFor.length ? `attente de ${waitFor.map(p => p.name).join(', ')}` : 'lancement…';
      } else { E.readyLabel.innerHTML = `${icon('play', 18, '#3a2400', 3)}LANCER`; E.readySub.textContent = 'la vague maintenant'; }
    }
    E.ready.classList.toggle('on', me.ready);
    (E.ready as HTMLButtonElement).disabled = m.phase !== 'build';
    // boss bar
    this.renderBoss(m);
    // overlays
    const waiting = !this.session.partnerOnline && this.session.role !== 'solo' && m.phase !== 'ended' && m.players.some(p => !p.isAI && p.pid !== me.pid);
    E.overlay.style.display = waiting || m.paused ? 'flex' : 'none';
    if (m.paused) {
      clear(E.overlay);
      E.overlay.append(h('div', { class: 'col' }, '⏸ PAUSE', h('button', { class: 'btn primary', onclick: () => this.cmd({ c: 'pause', value: false }) }, 'Reprendre')));
    } else if (waiting) E.overlay.textContent = this.session.role === 'host' ? '📡 Joueur déconnecté — en attente de reconnexion…' : '📡 CONNEXION… (reconnexion à l\'hôte)';
    if (me.powerChoice && !document.querySelector('.power-modal')) this.showPowerChoice(me.powerChoice);
    if (this.sheet && this.sheet !== 'pings' && this.sheet !== 'menu' && this.sheet !== 'info') this.renderSheet();
  }

  private renderNext(m: MetaView) {
    const E = this.els;
    const w = getWave(m.wave);
    const atk = new Set<AttackType>(), def = new Set<DefenseType>();
    let count = 0, speed = 0, ranged = false;
    const bosses: string[] = [];
    for (const g of w.groups) {
      const e = ENEMIES[g.enemy];
      atk.add(e.attack); def.add(e.defense); count += g.count; speed = Math.max(speed, e.moveSpeed);
      if (e.range > 2) ranged = true;
      if (e.boss) bosses.push(`${e.name} — ${e.mechanic ?? ''}`);
    }
    const ev = waveEvent(m.waveEvent);
    const me = this.me!;
    let hint = '';
    if (me.builds.length) {
      const avg = [...def].reduce((t, d) => t + me.builds.reduce((s, b) => s + DAMAGE_MATRIX[UNITS[b.defId].attack][d], 0) / me.builds.length, 0) / def.size;
      hint = ` ${matrixArrow(avg + (avg > 1.04 ? 0.06 : avg < 0.96 ? -0.06 : 0))}`;
    }
    const nKey = `${m.wave}|${m.phase}|${hint}|${m.waveEvent}`;
    if (E.next.dataset.k === nKey) return;
    E.next.dataset.k = nKey;
    E.next.className = `pill small next${w.boss ? ' boss' : ''}${ev ? ' event' : ''}`;
    E.next.innerHTML = `${ev ? `<span class="evb">${icon(ev.icon, 14, '#1a1020', 3)}${ev.name}</span>` : ''}<span>${m.phase === 'build' ? 'Prochaine' : 'En cours'} : ${esc(w.name)} · ${[...def].map(d => DEFENSE_NAMES[d]).join('/')}${hint} · ×${count}</span>`;
    clear(E.nextDetail);
    E.nextDetail.append(
      h('b', {}, `${m.phase === 'build' ? 'PROCHAINE' : 'EN COURS'} : ${w.name}`), h('br'),
      `${[...atk].map(a => ATTACK_ICONS[a] + ' ' + ATTACK_NAMES[a]).join(', ')}`, h('br'),
      `${[...def].map(d => DEFENSE_ICONS[d] + ' ' + DEFENSE_NAMES[d]).join(', ')}${hint}`, h('br'),
      `×${count} · ${speed >= 3.5 ? 'rapides' : speed <= 1.8 ? 'lents' : 'vitesse normale'}${ranged ? ' · distance' : ''}`, h('br'),
      ...bosses.flatMap(b => [h('span', { style: 'color:#FFC233' }, '👑 ' + b), h('br')]),
      ...(ev ? [h('span', { style: 'color:#C8A0FF' }, `✦ ${ev.name} : ${ev.text}`), h('br')] : []),
      h('span', { style: 'color:var(--warn)' }, w.danger),
    );
  }

  private renderBoss(m: MetaView) {
    const E = this.els;
    const me = this.me!;
    let best: { name: string; hp: number; mech: string } | null = null;
    if (m.phase === 'combat') {
      for (const e of this.session.view.sample()) {
        const d = ENEMIES[e.defId];
        if (!d?.boss || e.arena !== me.team) continue;
        if (!best || e.hp > best.hp) best = { name: d.name, hp: e.hp, mech: d.mechanic ?? '' };
      }
    }
    E.boss.style.display = best ? '' : 'none';
    if (best) { E.bossName.textContent = best.name; E.bossMech.textContent = best.mech; E.bossFill.style.width = `${best.hp * 100}%`; }
  }

  private renderCards(me: PlayerView, m: MetaView) {
    const E = this.els;
    const key = me.draft.join(',') + '|' + me.faction;
    if (E.cards.dataset.key === key) {
      for (const el of Array.from(E.cards.children) as HTMLElement[]) {
        const id = el.dataset.id;
        if (!id) continue;
        el.classList.toggle('poor', me.gold < UNITS[id].cost);
        el.classList.toggle('sel', this.selCard === id);
      }
      return;
    }
    E.cards.dataset.key = key;
    clear(E.cards);
    for (const id of me.draft) {
      const u = UNITS[id];
      let img = '';
      try { img = this.r.portrait(id, me.faction); } catch { /* WebGL portrait unavailable */ }
      const c = h('div', { class: `ucard${me.gold < u.cost ? ' poor' : ''}`, 'data-id': id, role: 'button', 'aria-label': `${u.name}, ${u.cost} or`, style: `--cat:${CATEGORY_COLORS[u.category]}` },
        h('div', { class: 'cat', html: icon(categoryIcon(u.category), 12, '#14112A', 3) }),
        img ? h('img', { class: 'pt', src: img, alt: '' }) : h('div', { class: 'ic', style: `background:${FACTIONS[u.faction].color}`, html: icon(categoryIcon(u.category), 22, '#14112A') }),
        h('div', { class: 'nm' }, u.name),
        h('div', { class: 'ct', html: `${icon('coin', 12, '#FFC233', 3)}${u.cost}` }));
      this.bindCard(c, id);
      E.cards.append(c);
    }
    void m;
  }

  private renderPowers(me: PlayerView, m: MetaView) {
    const E = this.els;
    const defs = FACTION_POWERS[me.faction];
    const jam = m.combatTime < me.jamUntil;
    const key = `${me.faction}|${me.powerLv.join()}|${m.wave}|${jam}`;
    if (E.powers.dataset.key !== key) {
      E.powers.dataset.key = key;
      clear(E.powers);
      defs.forEach((d, slot) => {
        const unlock = powerUnlock(d, m.settings.totalWaves);
        const locked = m.wave < unlock;
        const b = h('button', { class: `pbtn${locked ? ' locked' : ''}`, 'data-slot': String(slot), 'aria-label': d.name, onclick: () => { if (this.cmd({ c: 'cast', slot })) { audio.play('upgrade'); vibrate(30); } } },
          h('span', { class: 'cdr' }),
          h('span', { class: 'pi', html: icon(locked ? 'lock' : d.icon, 30, locked ? '#8a84a0' : '#FFF3D6', 2.2) }),
          h('b', {}, d.name), h('small', { class: 'pl', html: locked ? `Vague ${unlock}` : stars(me.powerLv[slot], POWER_MAX_LEVEL) }));
        let lp: number | null = null;
        b.onpointerdown = () => { lp = window.setTimeout(() => { this.toast(`${d.name} : ${d.text}`, 'info'); lp = null; }, 500); };
        b.onpointerup = b.onpointercancel = () => { if (lp) clearTimeout(lp); };
        E.powers.append(b);
      });
      if (jam) E.powers.append(h('div', { class: 'jam' }, '📡 Pouvoirs brouillés'));
    }
    defs.forEach((d, slot) => {
      const b = E.powers.querySelector(`[data-slot="${slot}"]`) as HTMLButtonElement | null;
      if (!b) return;
      const max = d.cooldown * POWER_LEVEL_CD[me.powerLv[slot]];
      const cdv = me.powerCd[slot];
      (b.querySelector('.cdr') as HTMLElement).style.setProperty('--k', String(Math.max(0, Math.min(1, cdv / max))));
      b.classList.toggle('go', cdv <= 0 && !b.classList.contains('locked') && !jam);
      b.disabled = b.classList.contains('locked') || jam;
    });
  }

  // ------------------------------------------------------------------ events
  private onEvent(ev: GameEvent, m: MetaView) {
    const me = this.me!;
    switch (ev.t) {
      case 'build': if (ev.pid === me.pid) { audio.play('build'); this.tutorial?.on('build'); } break;
      case 'evolve': {
        if (ev.pid !== me.pid && ev.pid !== this.partnerPid()) break;
        audio.play('upgrade');
        const b = me.builds.find(x => x.bid === ev.bid);
        if (ev.pid === me.pid && b && ev.level === BRANCH_LEVEL && ev.branch) this.banner('SPÉCIALISATION', unitStats(b.defId, ev.level, ev.branch).name);
        else if (ev.pid === me.pid && ev.level === MAX_LEVEL) this.banner('UNITÉ D\'ÉLITE ★★★★★', b ? unitStats(b.defId, ev.level, ev.branch).name : '');
        break;
      }
      case 'fuse': if (ev.pid === me.pid) { audio.play('upgrade'); vibrate([20, 40, 20]); this.toast('✨ Fusion réussie !', 'info'); } break;
      case 'sell': if (ev.pid === me.pid) audio.play('sell'); break;
      case 'raider': if (ev.pid === me.pid) { audio.play('raider'); this.tutorial?.on('raider'); } break;
      case 'curse': if (ev.pid === me.pid) audio.play('raider'); break;
      case 'sends': {
        if (m.players[ev.to]?.team !== me.team) break;
        const names = ev.list.map(id => RAIDERS.find(r => r.id === id)?.name ?? id);
        this.toast(`⚠️ ${m.players[ev.from].name} envoie : ${summarize(names)} → ${ev.to === me.pid ? 'ta voie' : m.players[ev.to].name}`, ev.to === me.pid ? 'error' : 'info');
        break;
      }
      case 'hexed': {
        if (m.players[ev.to]?.team !== me.team) break;
        const names = ev.list.map(id => CURSES.find(c => c.id === id)?.name ?? id).join(', ');
        this.toast(`☠️ Malédiction ${ev.to === me.pid ? 'sur ta voie' : 'sur ' + m.players[ev.to].name} : ${names}`, 'error');
        break;
      }
      case 'cast': {
        const p = m.players[ev.pid];
        const d = p ? FACTION_POWERS[p.faction].find(x => x.id === ev.power) : null;
        if (!d) break;
        if (ev.pid === me.pid) this.flashPower(d.name);
        else if (p.team === me.team) this.toast(`${p.name} : ${d.name} !`, 'ping');
        audio.play('pulse');
        break;
      }
      case 'bossIn': if (ev.arena === me.team && !this.bossIds.has(ev.id + m.wave)) { this.bossIds.add(ev.id + m.wave); const d = ENEMIES[ev.id]; this.bossAlert(d.name, d.mechanic ?? d.description); } break;
      case 'coreUp': {
        if (m.players[ev.pid]?.team === me.team) { audio.play('ether'); if (ev.pid !== me.pid) this.toast(`${m.players[ev.pid].name} améliore le Core : ${CORE.upgrades[ev.up as CoreUpgradeId].name}`); }
        if (ev.pid === me.pid) this.tutorial?.on('core');
        break;
      }
      case 'powerUp': if (ev.pid === me.pid) audio.play('upgrade'); break;
      case 'income': if (ev.pid === me.pid && ev.gold > 0) { audio.play('coin'); this.toast(`+${ev.gold} 🪙`, 'info'); } break;
      case 'ping': {
        if (m.players[ev.pid]?.team !== me.team) break;
        const p = PINGS.find(x => x.id === ev.ping);
        if (p) { this.toast(`${m.players[ev.pid].name} : ${p.label}`, 'ping'); audio.play('ping'); if (ev.pid !== me.pid) vibrate(60); }
        break;
      }
      case 'msg': this.toast(ev.text, 'info'); break;
      case 'leak': if (ev.arena === me.team) { audio.play('leak'); if (ev.pid === me.pid) this.flashLeak(); } break;
      case 'coreHit': if (ev.team === me.team) { audio.play('coreHit'); this.els.vignette.classList.add('hit'); setTimeout(() => this.els.vignette.classList.remove('hit'), 180); if (save.prefs.vibrate) vibrate(40); } break;
      case 'die': if (ev.boss && ev.arena === me.team) { audio.play('bossDie'); this.banner('BOSS VAINCU !', ''); } else if (ev.arena === me.team && Math.random() < 0.5) audio.play('die'); break;
      case 'atk': if (Math.random() < 0.22) audio.play(ev.crit ? 'crit' : Math.random() < 0.5 ? 'hit' : 'shot'); break;
      case 'explode': audio.play('boom'); break;
      case 'pulse': if (ev.arena === me.team && Math.random() < 0.4) audio.play('pulse'); break;
      case 'end': this.showEnd(m); break;
    }
  }
  private partnerPid() { const me = this.me!; return me.team * 2 + (1 - me.slot); }

  private flashLeak() {
    const n = this.me?.leakedThisWave ?? 0;
    if (n === 1 || n % 5 === 0) this.toast('⚠️ FUITE ! Des ennemis filent vers le Core', 'error');
  }

  private onPhase(m: MetaView) {
    const prevPhase = this.lastPhase;
    this.lastPhase = m.phase; this.lastWave = m.wave;
    const w = getWave(m.wave);
    const me = this.me!;
    const lowCore = m.teams[me.team].hp / m.teams[me.team].maxHp < 0.3;
    if (m.phase === 'build') {
      audio.setMood(lowCore ? 'danger' : 'build');
      if (prevPhase !== '') audio.play('wave');
      const ev = waveEvent(m.waveEvent);
      this.banner(`VAGUE ${m.wave}`, w.boss ? `⚠ ${w.name}` : w.name, w.boss);
      if (ev) setTimeout(() => this.banner(`✦ ${ev.name}`, ev.text, false, 'event'), 1900);
      if (w.boss) audio.play('boss');
      this.selected = null;
      this.bossIds.clear();
    } else if (m.phase === 'combat') {
      audio.setMood(w.boss ? 'boss' : lowCore ? 'danger' : 'combat');
      audio.play('combat');
      if (this.sheet !== 'raiders' && this.sheet !== 'opp') this.closeSheet();
      this.cancelPlacement();
      this.tutorial?.on('combat');
    } else if (m.phase === 'resolution') {
      if (me.leakedThisWave === 0) this.toast('✔ Voie tenue ! Bonus +' + ECONOMY.waveClearBonus + ' 🪙', 'info');
      this.tutorial?.on('resolution');
    } else if (m.phase === 'ended') {
      this.showEnd(m);
    }
  }

  // ------------------------------------------------------------------ feedback
  toast(text: string, kind: 'error' | 'info' | 'ping' = 'info') {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.els.toasts.append(t);
    while (this.els.toasts.children.length > 3) this.els.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), kind === 'ping' ? 3200 : 2600);
  }
  banner(text: string, sub: string, boss = false, extra = '') {
    for (const old of Array.from(this.root.querySelectorAll('.banner'))) old.remove();
    const b = h('div', { class: `banner${boss ? ' boss' : ''} ${extra}` }, text, sub ? h('small', {}, sub) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 1900);
  }
  private bossAlert(name: string, mech: string) {
    audio.play('boss');
    vibrate([60, 80, 60]);
    this.els.vignette.classList.add('boss');
    setTimeout(() => this.els.vignette.classList.remove('boss'), 2200);
    const b = h('div', { class: 'bossalert' }, h('div', { class: 'ba-top' }, '⚠ BOSS ⚠'), h('b', {}, name), h('small', {}, mech));
    this.root.append(b);
    setTimeout(() => b.remove(), 2600);
  }
  private flashPower(name: string) {
    const b = h('div', { class: 'powerflash' }, name);
    this.root.append(b);
    setTimeout(() => b.remove(), 1100);
  }

  // ------------------------------------------------------------------ ready / speed / pause
  private cycleSpeed() {
    const m = this.meta; if (!m || this.session.role === 'guest') return;
    this.cmd({ c: 'speed', speed: m.speed >= 3 ? 1 : m.speed + 1 });
    audio.play('click');
  }
  private togglePause() {
    const me = this.me, m = this.meta; if (!me || !m) return;
    this.cmd({ c: 'pause', value: !(me.pauseVote || m.paused) });
    audio.play('click');
  }
  private toggleReady() {
    const me = this.me; if (!me) return;
    this.cmd({ c: 'ready', value: !me.ready });
    audio.play('ready');
  }

  private cancelPlacement() {
    this.selCard = null; this.ghost = null; this.dragBuild = null;
    this.dragEl?.remove(); this.dragEl = null;
    this.els.placeTip.style.display = 'none';
  }

  ghostState(): DragGhost | null { return this.ghost; }

  /** Updates the placement ghost + the synergy / zone tooltip near the finger. */
  private updateGhostAt(x: number, y: number, defId: string, level = 1, branch: Branch | null = null) {
    const me = this.me!;
    const p = this.r.pick(x, y);
    const c = p ? Renderer.cellAt(me.slot, me.team, p.x, p.z) : null;
    const tip = this.els.placeTip;
    if (!c) { this.ghost = null; tip.style.display = 'none'; return null; }
    const occupant = me.builds.find(b => b.col === c.col && b.row === c.row && b.bid !== this.dragBuild);
    const dragged = this.dragBuild !== null ? me.builds.find(b => b.bid === this.dragBuild) : null;
    const fusable = !!(dragged && occupant && occupant.defId === dragged.defId && occupant.level === dragged.level && occupant.branch === dragged.branch && occupant.level < MAX_LEVEL);
    const afford = this.dragBuild !== null || me.gold >= UNITS[defId].cost;
    const others = me.builds.filter(b => b.bid !== this.dragBuild);
    const syn = previewSynergies(defId, c.col, c.row, others);
    const links = others.filter(o => Math.max(Math.abs(o.col - c.col), Math.abs(o.row - c.row)) === 1).map(o => ({ col: o.col, row: o.row }));
    this.ghost = { defId, col: c.col, row: c.row, valid: (!occupant || fusable) && afford, slot: me.slot, team: me.team, level, branch, faction: me.faction, links: syn.length ? links : [] };
    // tooltip
    const zone = zoneOf(c.col);
    const rune = me.runes?.find(r => r.col === c.col && r.row === c.row);
    const lines: string[] = [];
    if (fusable) lines.push(`<b class="fz">✨ Lâcher pour FUSIONNER → ${'★'.repeat(dragged!.level + 1)}</b>`);
    else if (occupant) lines.push('<b class="bad">Case occupée</b>');
    if (syn.length) lines.push(syn.map(s => `<span class="syn">${SYNERGIES[s].name}</span>`).join(' '));
    if (rune) lines.push(`<span class="rune" style="color:${hex(RUNES[rune.kind].color)}">${RUNES[rune.kind].name} : ${RUNES[rune.kind].text}</span>`);
    lines.push(`<small>${ZONE_TEXT[zone]}</small>`);
    tip.innerHTML = lines.join('<br>');
    tip.style.display = '';
    tip.style.left = `${Math.min(window.innerWidth - 200, Math.max(8, x + 24))}px`;
    tip.style.top = `${Math.max(8, y - 90)}px`;
    return c;
  }

  private bindCard(el: HTMLElement, id: string) {
    let start: { x: number; y: number; t: number } | null = null;
    let lp: number | null = null;
    let dragging = false;
    el.onpointerdown = e => {
      e.preventDefault();
      audio.unlock();
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = false;
      el.setPointerCapture(e.pointerId);
      lp = window.setTimeout(() => { if (!dragging && start) { this.openSheet('info', id); start = null; } }, 480);
    };
    el.onpointermove = e => {
      if (!start) return;
      const dy = start.y - e.clientY, dx = Math.abs(e.clientX - start.x);
      if (!dragging && (dy > 18 || (dy > 8 && dx < dy))) {
        if (this.meta?.phase !== 'build') return;
        dragging = true; if (lp) clearTimeout(lp);
        this.selCard = id; this.gesture = 'cardDrag';
        const img = (el.querySelector('img') as HTMLImageElement | null)?.src;
        this.dragEl = h('div', { class: 'dragcard', style: `background:${FACTIONS[UNITS[id].faction].color}` }, img ? h('img', { src: img, alt: '' }) : null);
        document.body.append(this.dragEl);
      }
      if (dragging) {
        this.dragEl!.style.left = e.clientX + 'px'; this.dragEl!.style.top = e.clientY + 'px';
        this.updateGhostAt(e.clientX, e.clientY - 40, id);
        this.dragEl!.style.opacity = this.ghost ? '0.2' : '0.85';
      }
    };
    el.onpointerup = el.onpointercancel = e => {
      if (lp) clearTimeout(lp);
      if (!start) return;
      if (dragging) {
        const g = this.ghost;
        if (g && g.valid && e.type === 'pointerup') this.cmd({ c: 'build', unit: id, col: g.col, row: g.row });
        else if (g && !g.valid) { this.toast(this.me!.gold < UNITS[id].cost ? 'Pas assez d\'or.' : 'Case occupée.', 'error'); audio.play('error'); }
        this.cancelPlacement();
        this.gesture = 'none';
      } else if (e.type === 'pointerup') {
        audio.play('click');
        this.selCard = this.selCard === id ? null : id;
        if (this.selCard) this.toast('Touche une case de ta voie pour placer l\'unité', 'info');
      }
      start = null; dragging = false;
    };
  }

  // ------------------------------------------------------------------ canvas gestures
  private bindInput() {
    const c = this.r.renderer.domElement;
    c.onpointerdown = e => {
      audio.unlock();
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 2) {
        this.gesture = 'pinch';
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinchAng = Math.atan2(b.y - a.y, b.x - a.x);
        if (this.longTimer) clearTimeout(this.longTimer);
        return;
      }
      this.gesture = 'none';
      const m = this.meta, me = this.me;
      if (m && me) {
        const p = this.r.pick(e.clientX, e.clientY);
        const b = p ? Renderer.buildAt(m, me.pid, p.x, p.z) : null;
        if (b) {
          this.dragBuild = b.bid;
          this.longTimer = window.setTimeout(() => { if (this.gesture === 'none') { this.selected = { pid: me.pid, bid: b.bid }; this.openSheet('unit', b.bid); this.dragBuild = null; } }, 520);
        } else this.dragBuild = null;
      }
    };
    c.onpointermove = e => {
      const pt = this.pointers.get(e.pointerId);
      if (!pt) return;
      const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
      pt.x = e.clientX; pt.y = e.clientY;
      if (this.gesture === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (this.pinchDist > 0) this.r.zoom(this.pinchDist / d);
        let da = ang - this.pinchAng; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        this.r.rotate(-da * 0.6);
        this.pinchDist = d; this.pinchAng = ang;
        this.r.pan(dx / 2, dy / 2);
        return;
      }
      const moved = Math.hypot(e.clientX - pt.sx, e.clientY - pt.sy);
      if (this.gesture === 'none' && moved > 10) {
        if (this.longTimer) clearTimeout(this.longTimer);
        if (this.dragBuild !== null && this.meta?.phase === 'build') this.gesture = 'moveBuild';
        else { this.gesture = 'pan'; this.dragBuild = null; }
      }
      if (this.gesture === 'pan') this.r.pan(dx, dy);
      if (this.gesture === 'moveBuild') {
        const b = this.me!.builds.find(x => x.bid === this.dragBuild);
        if (b) this.updateGhostAt(e.clientX, e.clientY, b.defId, b.level, b.branch);
      }
    };
    const up = (e: PointerEvent) => {
      const pt = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.longTimer) clearTimeout(this.longTimer);
      if (!pt) return;
      if (this.gesture === 'pinch') { if (this.pointers.size === 0) this.gesture = 'none'; return; }
      if (this.gesture === 'moveBuild') {
        const g = this.ghost, me = this.me!;
        if (g && g.valid && this.dragBuild !== null) {
          const target = me.builds.find(b => b.col === g.col && b.row === g.row && b.bid !== this.dragBuild);
          if (target) this.fuse(target, this.dragBuild);
          else { this.cmd({ c: 'move', bid: this.dragBuild, col: g.col, row: g.row }); audio.play('click'); }
        }
        this.ghost = null; this.dragBuild = null; this.gesture = 'none';
        this.els.placeTip.style.display = 'none';
        return;
      }
      if (this.gesture === 'none' && e.type === 'pointerup' && performance.now() - pt.t < 500) this.tap(e.clientX, e.clientY);
      this.gesture = 'none';
      this.dragBuild = null;
    };
    c.onpointerup = up; c.onpointercancel = up;
    c.onwheel = e => { e.preventDefault(); if (e.shiftKey) this.r.rotate(e.deltaY > 0 ? 0.05 : -0.05); else this.r.zoom(e.deltaY > 0 ? 1.1 : 0.9); };
    c.ondblclick = () => this.r.focus(this.me?.slot ?? 0, this.me?.team ?? 0);
  }

  /** Fuse `withBid` into `target` (asks for a specialisation when reaching level 4). */
  private fuse(target: Build, withBid: number) {
    if (target.level + 1 === BRANCH_LEVEL && UNITS[target.defId].branches) {
      this.selected = { pid: this.me!.pid, bid: target.bid };
      this.pendingFuse = withBid;
      this.openSheet('unit', target.bid);
      this.toast('Choisis la spécialisation de la fusion', 'info');
      return;
    }
    this.cmd({ c: 'fuse', bid: target.bid, with: withBid });
  }
  private pendingFuse: number | null = null;

  private tap(x: number, y: number) {
    const m = this.meta, me = this.me;
    if (!m || !me) return;
    const p = this.r.pick(x, y);
    if (!p) return;
    if (this.selCard && m.phase === 'build') {
      const c = Renderer.cellAt(me.slot, me.team, p.x, p.z);
      if (c) {
        if (me.builds.some(b => b.col === c.col && b.row === c.row)) { this.toast('Case occupée.', 'error'); return; }
        if (this.cmd({ c: 'build', unit: this.selCard, col: c.col, row: c.row })) {
          if (me.gold - UNITS[this.selCard].cost < UNITS[this.selCard].cost) this.selCard = null;
        }
        return;
      }
    }
    const b = Renderer.buildAt(m, me.pid, p.x, p.z);
    if (b) {
      this.selected = { pid: me.pid, bid: b.bid };
      this.pendingFuse = null;
      this.openSheet('unit', b.bid);
      audio.play('click');
      return;
    }
    const partner = m.players[this.partnerPid()];
    const pb = partner ? Renderer.buildAt(m, partner.pid, p.x, p.z) : null;
    if (pb) { this.selected = { pid: partner.pid, bid: pb.bid }; this.openSheet('info', `${pb.defId}|${pb.level}|${pb.branch ?? ''}|${partner.faction}`); return; }
    this.selected = null;
    if (this.selCard) this.selCard = null;
    if (this.sheet) this.closeSheet();
  }

  // ------------------------------------------------------------------ sheets
  openSheet(s: Sheet, arg: string | number | null = null) {
    if (this.sheet === s && this.sheetArg === arg && s !== 'unit') { this.closeSheet(); return; }
    this.sheet = s; this.sheetArg = arg;
    audio.play('click');
    this.renderSheet();
  }
  closeSheet() { this.sheet = null; this.els.sheet.style.display = 'none'; this.pendingFuse = null; if (this.selected && this.selected.pid === this.me?.pid) this.selected = null; }

  private renderSheet() {
    const S = this.els.sheet;
    const m = this.meta!, me = this.me!;
    if (!this.sheet) return;
    const scroll = S.scrollTop;
    clear(S);
    S.style.display = 'block';
    S.className = `sheet${this.sheet === 'unit' || this.sheet === 'info' ? ' side' : ''}`;
    const title = (t: string) => h('h3', {}, t, h('button', { class: 'x', 'aria-label': 'Fermer', onclick: () => this.closeSheet() }, '✕'));
    switch (this.sheet) {
      case 'raiders': this.renderAttack(S, title, m, me); break;
      case 'core': {
        const core = m.teams[me.team];
        S.append(title('🔷 Core & pouvoirs'), h('p', { class: 'muted small' }, `Investissement en Éther. Core commun : PV ${fmt(core.hp)}/${fmt(core.maxHp)}`));
        for (const id of Object.keys(CORE.upgrades) as CoreUpgradeId[]) {
          const u = CORE.upgrades[id];
          const lvl = core.up[id];
          const max = lvl >= u.max;
          S.append(h('button', { class: 'opt', disabled: max || me.ether < u.costs[lvl], onclick: () => this.cmd({ c: 'core', up: id }) },
            h('div', { style: 'font-size:22px' }, u.icon),
            h('div', { class: 't' }, h('b', {}, `${u.name} ${lvl}/${u.max}`), h('br'), u.text),
            h('div', { class: 'p e' }, max ? 'MAX' : `${u.costs[lvl]}✨`)));
        }
        S.append(h('div', { class: 'sect' }, `Pouvoirs de commandant — ${FACTIONS[me.faction].name}`));
        FACTION_POWERS[me.faction].forEach((d, slot) => {
          const lv = me.powerLv[slot];
          const unlock = powerUnlock(d, m.settings.totalWaves);
          const locked = m.wave < unlock;
          const cost = POWER_UP_COST[lv + 1];
          S.append(h('button', { class: 'opt', disabled: locked || lv >= POWER_MAX_LEVEL || me.ether < cost, onclick: () => this.cmd({ c: 'powerUp', slot }) },
            h('div', { html: icon(d.icon, 26, '#FFC233') }),
            h('div', { class: 't' }, h('b', { html: `${d.name} ${stars(lv, POWER_MAX_LEVEL)}` }), h('br'), d.text, h('br'), h('small', { class: 'muted' }, locked ? `Débloqué à la vague ${unlock}` : `Recharge ${Math.round(d.cooldown * POWER_LEVEL_CD[lv])} s · niveau suivant : effet +45 %, recharge -12 %`)),
            h('div', { class: 'p e' }, lv >= POWER_MAX_LEVEL ? 'MAX' : `${cost}✨`)));
        });
        break;
      }
      case 'stats': {
        S.append(title('📊 Statistiques'));
        const g = h('div', { class: 'stats-grid' });
        const team = m.players.filter(p => p.team === me.team);
        g.append(h('b', {}, ''), ...team.map(p => h('b', { style: 'text-align:right' }, p.name.slice(0, 10))));
        const rows: [string, (p: PlayerView) => string][] = [
          ['Armée', p => FACTIONS[p.faction].name], ['Dégâts', p => fmt(p.stats.dmgDealt)], ['Éliminations', p => fmt(p.stats.kills)], ['Dégâts tankés', p => fmt(p.stats.dmgTanked)],
          ['Or gagné', p => fmt(p.stats.goldEarned)], ['Éther produit', p => fmt(p.stats.etherProduced)], ['Travailleurs', p => String(p.workers)], ['Revenu', p => String(p.income)],
          ['Envois', p => String(p.stats.raidersSent)], ['Améliorations', p => String(p.stats.upgrades)], ['Fusions', p => String(p.stats.fusions)], ['Pouvoirs', p => String(p.stats.casts)],
          ['Fuites', p => String(p.stats.leaks)], ['DPS max', p => fmt(p.stats.maxDps)], ['Bonus', p => p.powers.map(x => POWERS.find(y => y.id === x)?.icon).join(' ') || '—'],
        ];
        for (const [l, f] of rows) g.append(h('span', { class: 'muted' }, l), ...team.map(p => h('span', { style: 'text-align:right' }, f(p))));
        S.append(g);
        S.append(h('div', { style: 'margin-top:8px;font-size:12px' }, h('b', {}, 'Matrice ATT/DEF'), this.matrixTable()));
        break;
      }
      case 'pings': {
        S.append(title('💬 Message au partenaire'));
        const grid = h('div', { class: 'pings' });
        for (const p of PINGS) grid.append(h('button', { onclick: () => { this.cmd({ c: 'ping', ping: p.id }); this.closeSheet(); } }, p.label));
        S.append(grid);
        break;
      }
      case 'menu': this.renderMenu(S, title); break;
      case 'unit': this.renderUnit(S, title, m, me); break;
      case 'info': {
        const [id, lvS, brS, fac] = String(this.sheetArg).split('|');
        const lv = Number(lvS || 1), br = (brS || null) as Branch | null;
        const u = UNITS[id];
        S.append(title(unitStats(id, lv, br).name), this.unitHeader(id, (fac as never) || me.faction, lv, br), h('p', { class: 'small', style: 'margin:4px 0' }, u.description), this.unitStatsBlock(id, lv, br));
        S.append(h('div', { class: 'proscons' }, h('div', {}, h('b', {}, '✔ '), u.pros), h('div', {}, h('b', {}, '✖ '), u.cons)));
        if (u.branches) {
          S.append(h('div', { class: 'sect' }, `Spécialisations au niveau ${BRANCH_LEVEL}`));
          u.branches.forEach((b, i) => S.append(h('div', { class: 'branch' }, h('b', {}, `${i ? 'B' : 'A'} — ${b.name}`), h('br'), b.text)));
        }
        break;
      }
      case 'opp': this.renderOpp(S, title, m); break;
      case 'syn': {
        S.append(title('🤝 Synergies & placement'));
        const bb = buildBonuses(me.builds, me.runes ?? []);
        const active = new Map<string, number>();
        for (const b of bb.values()) for (const s of b.syn) active.set(s, (active.get(s) ?? 0) + 1);
        S.append(h('p', { class: 'muted small' }, 'Les unités VOISINES (8 cases autour) se renforcent. Les cases runiques et les zones donnent aussi des bonus.'));
        for (const s of Object.values(SYNERGIES)) {
          const n = active.get(s.id) ?? 0;
          S.append(h('div', { class: `synrow${n ? ' on' : ''}` }, h('span', { html: icon(s.icon, 18, n ? '#7DFFB0' : '#8a84a0') }), h('div', {}, h('b', {}, s.name), n ? ` ×${n}` : '', h('br'), h('small', {}, s.text))));
        }
        S.append(h('div', { class: 'sect' }, 'Zones'), h('div', { class: 'small' }, ZONE_TEXT.front, h('br'), ZONE_TEXT.back));
        S.append(h('div', { class: 'sect' }, 'Cases runiques de ta voie'), h('div', { class: 'small' }, ...(me.runes ?? []).flatMap(r => [h('span', { style: `color:${hex(RUNES[r.kind].color)}` }, `${RUNES[r.kind].name} : ${RUNES[r.kind].text}`), h('br')])));
        break;
      }
    }
    S.scrollTop = scroll;
  }

  private unitHeader(id: string, faction: PlayerView['faction'], lv: number, br: Branch | null) {
    const u = UNITS[id];
    let img = '';
    try { img = this.r.portrait(id, faction, lv, br, 160); } catch { /* */ }
    return h('div', { class: 'uhead' }, img ? h('img', { src: img, alt: '' }) : null,
      h('div', {}, h('div', { class: 'stars', html: stars(lv) }), h('span', { class: 'catchip', style: `--cat:${CATEGORY_COLORS[u.category]}` }, CATEGORY_NAMES[u.category]), ' ', h('span', { class: 'muted small' }, FACTIONS[u.faction].name)));
  }

  /** Stats block: HP, armour, damage, attack speed, DPS, range, abilities. */
  private unitStatsBlock(id: string, lv: number, br: Branch | null, cmp?: { lv: number; br: Branch | null }) {
    const s = unitStats(id, lv, br);
    const n = cmp ? unitStats(id, cmp.lv, cmp.br) : null;
    const delta = (a: number, b?: number, f = (x: number) => fmt(x)) => b === undefined || Math.abs(b - a) < 0.01 ? '' : `<em>→ ${f(b)}</em>`;
    const eff = (Object.keys(DEFENSE_NAMES) as DefenseType[]).map(d => `${DEFENSE_ICONS[d]}${matrixArrow(DAMAGE_MATRIX[s.attack][d])}`).join(' ');
    const range = (x: number) => x < 2 ? 'mêlée' : `${x.toFixed(1)} m`;
    const grid = h('div', { class: 'ustats', html: [
      `<span>❤️ PV</span><b>${fmt(s.hp)} ${delta(s.hp, n?.hp)}</b>`,
      `<span>🛡 Armure</span><b>${Math.round(s.armor * 100)} % ${delta(s.armor * 100, n ? n.armor * 100 : undefined, x => Math.round(x) + ' %')}</b>`,
      `<span>⚔️ Dégâts</span><b>${fmt(s.dmg)} ${delta(s.dmg, n?.dmg)}</b>`,
      `<span>⏱ Cadence</span><b>${s.atkSpeed.toFixed(2)}/s ${delta(s.atkSpeed, n?.atkSpeed, x => x.toFixed(2) + '/s')}</b>`,
      `<span>🔥 DPS</span><b>${fmt(s.dmg * s.atkSpeed)} ${delta(s.dmg * s.atkSpeed, n ? n.dmg * n.atkSpeed : undefined)}</b>`,
      `<span>🎯 Portée</span><b>${range(s.range)}${s.tower ? ' (tour)' : ''}</b>`,
      `<span>Attaque</span><b>${ATTACK_ICONS[s.attack]} ${ATTACK_NAMES[s.attack]}</b>`,
      `<span>Défense</span><b>${DEFENSE_ICONS[s.defense]} ${DEFENSE_NAMES[s.defense]}</b>`,
    ].join('') });
    const abil = h('div', { class: 'abil small' }, h('span', { class: 'muted' }, `Efficacité : ${eff}`), h('br'),
      UNITS[id].skillText !== '—' ? h('span', {}, '✦ ', UNITS[id].skillText) : null, UNITS[id].skillText !== '—' ? h('br') : null,
      h('span', { class: 'muted' }, '◆ ', br && lv >= BRANCH_LEVEL ? UNITS[id].branches![br === 'A' ? 0 : 1].text : UNITS[id].passiveText),
      h('br'), h('span', { class: 'muted' }, abilitiesText(s.abilities)));
    return h('div', {}, grid, abil);
  }

  private renderUnit(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    const b = me.builds.find(x => x.bid === this.sheetArg);
    if (!b) { this.closeSheet(); return; }
    const u = UNITS[b.defId];
    const st = unitStats(b.defId, b.level, b.branch);
    const refund = Math.floor(b.value * (b.placedWave === m.wave ? 1 : ECONOMY.sellRefund));
    S.append(title(st.name), this.unitHeader(b.defId, me.faction, b.level, b.branch));
    const next = b.level < MAX_LEVEL ? b.level + 1 : 0;
    S.append(this.unitStatsBlock(b.defId, b.level, b.branch, next && next !== BRANCH_LEVEL ? { lv: next, br: b.branch } : undefined));
    // bonuses on this cell
    const bb = buildBonuses(me.builds, me.runes ?? []).get(b.bid);
    if (bb) {
      const tags: string[] = [];
      if (bb.zoneActive) tags.push(bb.zone === 'front' ? 'Première ligne +15 % PV' : 'Arrière +0,6 m');
      if (bb.rune) tags.push(`${RUNES[bb.rune].name} ${RUNES[bb.rune].text}`);
      for (const s of bb.syn) tags.push(SYNERGIES[s].name);
      if (tags.length) S.append(h('div', { class: 'tags' }, ...tags.map(t => h('span', {}, t))));
    }
    S.append(h('div', { class: 'muted small', style: 'margin:4px 0' }, `Valeur ${fmt(b.value)} 🪙 · dégâts infligés ${fmt(b.dmgTotal)}`));
    if (m.phase !== 'build') { S.append(h('div', { class: 'muted small' }, 'Améliorations possibles pendant la préparation.')); return; }
    const twin = me.builds.find(o => o.bid !== b.bid && o.defId === b.defId && o.level === b.level && o.branch === b.branch);
    const fuseWith = this.pendingFuse ?? twin?.bid ?? null;
    // level-up / specialisation
    if (next === BRANCH_LEVEL && u.branches) {
      const cost = upgradeCost(b.defId, next);
      S.append(h('div', { class: 'sect' }, fuseWith !== null && this.pendingFuse !== null ? 'Fusion : choisis la spécialisation (définitive)' : `Spécialisation — niveau ${BRANCH_LEVEL} (définitive)`));
      const row = h('div', { class: 'branches' });
      (['A', 'B'] as Branch[]).forEach((br, i) => {
        const bd = u.branches![i];
        const s4 = unitStats(b.defId, BRANCH_LEVEL, br);
        row.append(h('div', { class: 'bcard' },
          h('b', {}, bd.name), h('small', {}, bd.text),
          h('div', { class: 'small muted' }, `PV ${fmt(s4.hp)} · DPS ${fmt(s4.dmg * s4.atkSpeed)} · ${s4.range < 2 ? 'mêlée' : s4.range.toFixed(1) + ' m'}`),
          h('button', { class: 'btn small gold', disabled: me.gold < cost, onclick: () => { this.cmd({ c: 'upgrade', bid: b.bid, branch: br }); } }, `${icon('up', 14, '#3a2400', 3)} ${cost} 🪙`),
          fuseWith !== null ? h('button', { class: 'btn small', onclick: () => { this.cmd({ c: 'fuse', bid: b.bid, with: fuseWith, branch: br }); this.pendingFuse = null; } }, '✨ Fusionner') : null));
      });
      S.append(row);
    } else if (next) {
      const cost = upgradeCost(b.defId, next);
      S.append(h('button', { class: 'opt up', disabled: me.gold < cost, onclick: () => { this.cmd({ c: 'upgrade', bid: b.bid }); } },
        h('div', { html: icon('up', 26, '#FFC233', 3) }),
        h('div', { class: 't' }, h('b', { html: `Améliorer → ${stars(next)}` }), h('br'), next === 5 ? 'Unité d\'élite : couronne et runes.' : next === 3 ? 'Armure supplémentaire, +stats.' : 'Meilleure arme, +stats.'),
        h('div', { class: 'p g' }, `${cost}🪙`)));
    } else S.append(h('div', { class: 'muted small' }, '★★★★★ Niveau maximum atteint.'));
    if (fuseWith !== null && next && next !== BRANCH_LEVEL) {
      const extra = Math.max(0, b.value + (me.builds.find(o => o.bid === fuseWith)?.value ?? 0) - unitValueAt(b.defId, next));
      S.append(h('button', { class: 'opt', onclick: () => { this.cmd({ c: 'fuse', bid: b.bid, with: fuseWith }); } },
        h('div', { html: icon('merge', 26, '#C8A0FF', 2.6) }),
        h('div', { class: 't' }, h('b', { html: `Fusionner avec l'autre ${esc(u.name)} → ${stars(next)}` }), h('br'), 'Libère une case. Gratuit' + (extra ? ` et rembourse ${extra} 🪙.` : '.')),
        h('div', { class: 'p' }, 'GRATUIT')));
    }
    S.append(h('button', { class: 'opt', onclick: () => { this.cmd({ c: 'sell', bid: b.bid }); this.closeSheet(); } },
      h('div', { html: icon('sell', 24, '#FFD27A') }), h('div', { class: 't' }, h('b', {}, 'Vendre'), h('br'), b.placedWave === m.wave ? 'Remboursement total (placée cette vague)' : '50 % remboursés'), h('div', { class: 'p g' }, `+${refund}🪙`)));
    S.append(h('div', { class: 'muted small' }, 'Astuce : glisse une unité pour la déplacer, ou sur une unité identique pour la fusionner.'));
  }

  private renderAttack(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    if (m.settings.mode === 'survival') {
      S.append(title('📈 Investir'), h('p', { class: 'muted small' }, 'Mode Survie : pas d\'adversaire. Convertis ton Éther en revenu permanent.'));
      S.append(h('button', { class: 'opt', disabled: me.ether < ECONOMY.investChunk, onclick: () => this.cmd({ c: 'invest' }) },
        h('div', { class: 't' }, h('b', {}, 'Investissement'), h('br'), `+${Math.round(ECONOMY.investChunk * ECONOMY.investRatio)} revenu par vague`),
        h('div', { class: 'p e' }, `${ECONOMY.investChunk}✨`)));
      return;
    }
    const opp = this.opponents(m);
    if (this.target === null || !opp.some(o => o.pid === this.target)) this.target = (opp.find(o => o.slot === me.slot) ?? opp[0]).pid;
    S.append(title('⚔️ Attaquer l\'adversaire'));
    const tabs = h('div', { class: 'seg' },
      h('button', { class: this.raiderTab === 'sends' ? 'on' : '', onclick: () => { this.raiderTab = 'sends'; this.renderSheet(); } }, `Envois ${me.raiderQueue.length}/${sendCap(m.wave)}`),
      h('button', { class: this.raiderTab === 'curses' ? 'on' : '', onclick: () => { this.raiderTab = 'curses'; this.renderSheet(); } }, `Malédictions ${me.curseQueue.length}/1`));
    const tgt = h('div', { class: 'targets' }, h('span', { class: 'muted small' }, 'Cible :'), ...opp.map(o => h('button', { class: `tgt${this.target === o.pid ? ' on' : ''}`, onclick: () => { this.target = o.pid; this.renderSheet(); } },
      h('b', {}, o.name), h('small', {}, `${FACTIONS[o.faction].title} · armée ${powerBucket(o.builds.reduce((t, b) => t + b.value, 0))}`))));
    S.append(tabs, tgt);
    const tw = m.settings.totalWaves;
    if (this.raiderTab === 'sends') {
      S.append(h('p', { class: 'muted small' }, 'Ils attaquent la voie ciblée à la prochaine vague. Chaque envoi augmente ton REVENU. Prix +30 % par copie dans la même vague.'));
      for (const r of RAIDERS) {
        const unlock = raiderUnlock(r, tw);
        const locked = m.wave < unlock;
        const cd = (me.raiderCd[r.id] ?? 0) > m.wave;
        const same = me.raiderQueue.filter(q => q.r === r.id).length;
        const price = raiderPrice(r, same);
        const maxed = same >= r.maxPerWave || me.raiderQueue.length >= sendCap(m.wave);
        const hp = r.units.reduce((t, u) => t + ENEMIES[u.enemy].hp * u.count, 0) * raiderScale(m.wave);
        const units = r.units.map(u => `${u.count}× ${ENEMIES[u.enemy].name}`).join(' + ');
        S.append(h('button', { class: `opt send ${r.category}`, disabled: locked || cd || maxed || me.ether < price.ether || me.gold < price.gold, onclick: () => this.cmd({ c: 'raider', raider: r.id, to: this.target! }) },
          h('div', { class: 'rcat' }, RAIDER_CATEGORY_NAMES[r.category]),
          h('div', { class: 't' }, h('b', {}, r.name), same ? h('span', { class: 'qty' }, ` ×${same}`) : null, h('br'),
            locked ? `🔒 Vague ${unlock}` : cd ? `⏳ Recharge jusqu'à la vague ${me.raiderCd[r.id]}` : `${units} · ${fmt(hp)} PV · +${r.income} revenu`, h('br'),
            h('small', { class: 'muted' }, r.description)),
          h('div', { class: 'p' }, h('span', { class: 'e' }, `${price.ether}✨`), price.gold ? h('span', { class: 'g' }, ` ${price.gold}🪙`) : null)));
      }
    } else {
      S.append(h('p', { class: 'muted small' }, 'Effets courts appliqués à la prochaine vague de la voie ciblée. Une malédiction par vague.'));
      for (const c of CURSES) {
        const unlock = curseUnlock(c, tw);
        const locked = m.wave < unlock;
        const cd = (me.curseCd[c.id] ?? 0) > m.wave;
        S.append(h('button', { class: 'opt send curse', disabled: locked || cd || me.curseQueue.length >= 1 || me.ether < c.ether || me.gold < c.gold, onclick: () => this.cmd({ c: 'curse', curse: c.id, to: this.target! }) },
          h('div', { html: icon(c.icon, 24, '#C8A0FF') }),
          h('div', { class: 't' }, h('b', {}, c.name), h('br'), locked ? `🔒 Vague ${unlock}` : cd ? `⏳ Recharge jusqu'à la vague ${me.curseCd[c.id]}` : c.text, h('br'), h('small', { class: 'muted' }, `Parade : ${c.counter}`)),
          h('div', { class: 'p' }, h('span', { class: 'e' }, `${c.ether}✨`), c.gold ? h('span', { class: 'g' }, ` ${c.gold}🪙`) : null)));
      }
    }
    if (me.raiderQueue.length || me.curseQueue.length) S.append(h('div', { class: 'muted small' }, `Préparé : ${summarize(me.raiderQueue.map(q => RAIDERS.find(r => r.id === q.r)!.name))}${me.curseQueue.length ? ' + ' + CURSES.find(c => c.id === me.curseQueue[0].r)!.name : ''}`));
  }

  private renderOpp(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView) {
    S.append(title('👁 Adversaires'));
    const opp = this.opponents(m);
    if (!opp.length) { S.append(h('p', { class: 'muted' }, 'Pas d\'adversaire dans ce mode.')); return; }
    const et = m.teams[opp[0].team];
    S.append(h('div', { class: 'small' }, `Core adverse : ${fmt(et.hp)} / ${fmt(et.maxHp)} PV · vague ${m.wave}`));
    const bosses = m.phase === 'combat' ? this.session.view.sample().filter(e => e.arena === opp[0].team && ENEMIES[e.defId]?.boss).map(e => ENEMIES[e.defId].name) : [];
    for (const o of opp) {
      const v = o.builds.reduce((t, b) => t + b.value, 0);
      const fx: string[] = [];
      if (m.phase === 'combat' && m.combatTime < o.fogUntil) fx.push('Brouillard');
      if (m.phase === 'combat' && m.combatTime < o.jamUntil) fx.push('Pouvoirs brouillés');
      if (o.powers.length) fx.push(o.powers.map(x => POWERS.find(y => y.id === x)?.name).join(', '));
      S.append(h('div', { class: 'oppcard', style: `--fc:${FACTIONS[o.faction].color}` },
        h('b', {}, `${o.name} — ${FACTIONS[o.faction].name}`), h('br'),
        h('span', { class: 'small' }, `Puissance d'armée : ${powerBucket(v)} · ${o.builds.length} unités · niveau max ${o.builds.reduce((t, b) => Math.max(t, b.level), 0) || '—'}`), h('br'),
        h('span', { class: 'small muted' }, `Envois cette partie : ${o.stats.raidersSent} (${o.stats.sentUnits} ennemis) · malédictions : ${o.stats.curses} · pouvoirs utilisés : ${o.stats.casts}`), h('br'),
        h('span', { class: 'small' }, `Effets actifs : ${fx.join(' · ') || 'aucun'}`)));
    }
    if (bosses.length) S.append(h('div', { class: 'small', style: 'color:#FFC233' }, `👑 Boss en cours chez eux : ${bosses.join(', ')}`));
    S.append(h('button', { class: 'btn small', onclick: () => { this.r.focus(this.me!.slot, opp[0].team); this.closeSheet(); } }, '👁 Observer leur arène'));
  }

  private matrixTable() {
    const t = h('table', { class: 'end-table', style: 'font-size:11px' });
    const defs = Object.keys(DEFENSE_NAMES) as DefenseType[];
    t.append(h('tr', {}, h('th', {}, ''), ...defs.map(d => h('th', {}, DEFENSE_ICONS[d]))));
    for (const a of Object.keys(ATTACK_NAMES) as AttackType[]) t.append(h('tr', {}, h('td', {}, ATTACK_ICONS[a] + ' ' + ATTACK_NAMES[a]), ...defs.map(d => h('td', {}, `${matrixArrow(DAMAGE_MATRIX[a][d])} ${Math.round(DAMAGE_MATRIX[a][d] * 100)}%`))));
    return t;
  }

  private renderMenu(S: HTMLElement, title: (t: string) => HTMLElement) {
    const m = this.meta!;
    S.append(title('⚙️ Menu'));
    if (this.session.role !== 'guest') {
      const seg = h('div', { class: 'seg' });
      for (const sp of [1, 2, 3]) seg.append(h('button', { class: m.speed === sp ? 'on' : '', onclick: () => { this.cmd({ c: 'speed', speed: sp }); this.renderSheet(); } }, `x${sp}`));
      S.append(h('div', { class: 'muted small', style: 'margin:4px 0' }, 'Vitesse (commune)'), seg);
    } else S.append(h('div', { class: 'muted small' }, `Vitesse : x${m.speed} (réglée par l'hôte)`));
    const me = this.me!;
    S.append(h('button', { class: 'opt', style: 'margin-top:8px', onclick: () => { this.cmd({ c: 'pause', value: !me.pauseVote }); this.closeSheet(); } },
      h('div', { html: icon('pause', 22) }), h('div', { class: 't' }, h('b', {}, me.pauseVote ? 'Annuler la demande de pause' : this.session.role === 'solo' ? 'Pause' : 'Demander une pause'), h('br'), this.session.role === 'solo' ? '' : 'La partie se met en pause quand l\'autre joueur accepte.')));
    const other = m.players.find(p => !p.isAI && p.pid !== me.pid);
    if (other?.pauseVote && !me.pauseVote) S.append(h('button', { class: 'btn primary small', style: 'width:100%;margin-bottom:6px', onclick: () => { this.cmd({ c: 'pause', value: true }); this.closeSheet(); } }, `Accepter la pause de ${other.name}`));
    const vol = (label: string, val: number, set: (v: number) => void) => {
      const inp = h('input', { type: 'range', min: 0, max: 100, value: Math.round(val * 100), style: 'width:100%' }) as HTMLInputElement;
      inp.oninput = () => set(Number(inp.value) / 100);
      return h('div', { class: 'small' }, label, inp);
    };
    S.append(vol('🔊 Effets', save.prefs.sfx, v => { save.prefs.sfx = v; audio.setVolumes(v, save.prefs.music); save.flush(); }));
    S.append(vol('🎵 Musique', save.prefs.music, v => { save.prefs.music = v; audio.setVolumes(save.prefs.sfx, v); save.flush(); }));
    S.append(h('button', { class: 'opt', onclick: () => this.openSheet('stats') }, h('div', { html: icon('stats', 22) }), h('div', { class: 't' }, h('b', {}, 'Statistiques & matrice ATT/DEF'))));
    S.append(h('div', { class: 'row', style: 'gap:6px;margin:6px 0' },
      h('button', { class: 'btn small', style: 'flex:1', onclick: () => this.r.rotate(-0.2) }, '⟲'),
      h('button', { class: 'btn small', style: 'flex:2', onclick: () => { this.r.focus(this.me!.slot, this.me!.team); this.closeSheet(); } }, '🎯 Recentrer'),
      h('button', { class: 'btn small', style: 'flex:1', onclick: () => this.r.rotate(0.2) }, '⟳')));
    if (m.teams.length > 1) S.append(h('button', { class: 'opt', onclick: () => this.openSheet('opp') }, h('div', { html: icon('eye', 22) }), h('div', { class: 't' }, h('b', {}, 'Adversaires & leur arène'))));
    const quitLabel = h('b', {}, 'Quitter la partie');
    let armed = false;
    S.append(h('button', { class: 'opt', onclick: () => {
      if (armed) { this.cb.exit(); return; }
      armed = true; quitLabel.textContent = 'Touche encore pour quitter'; quitLabel.style.color = 'var(--bad)';
      setTimeout(() => { armed = false; quitLabel.textContent = 'Quitter la partie'; quitLabel.style.color = ''; }, 3000);
    } }, h('div', { style: 'font-size:22px' }, '🚪'), h('div', { class: 't' }, quitLabel)));
    S.append(h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `Partie ${this.session.code} · ${this.session.role === 'host' ? 'hôte' : this.session.role === 'guest' ? 'invité' : 'solo'} · ${FACTIONS[me.faction].name}${me.randomFaction ? ' (aléatoire)' : ''}`));
  }

  private showPowerChoice(choice: string[]) {
    const modal = h('div', { class: 'screen transparent power-modal' },
      h('h2', { style: 'margin:0 0 4px' }, '✨ Choisis un BONUS'),
      h('p', { class: 'muted', style: 'margin:0 0 10px' }, 'Il modifie ta stratégie jusqu\'à la fin de la partie.'),
      h('div', { class: 'menu row' }, ...choice.map(id => {
        const p = POWERS.find(x => x.id === id)!;
        return h('button', { class: 'opt', style: 'width:min(220px,30vw);flex-direction:column;text-align:center;min-height:120px', onclick: () => { this.cmd({ c: 'power', power: id }); modal.remove(); audio.play('upgrade'); } },
          h('div', { style: 'font-size:34px' }, p.icon), h('b', {}, p.name), h('div', { class: 't', style: 'text-align:center' }, p.description));
      })));
    this.root.append(modal);
  }

  // ------------------------------------------------------------------ end of game
  private showEnd(m: MetaView) {
    if (this.ended || !m.result) return;
    this.ended = true;
    const me = this.me!;
    const survival = m.settings.mode === 'survival';
    const win = !survival && m.result.winner === me.team;
    audio.setMood('off');
    audio.play(win ? 'victory' : 'defeat');
    const team = m.players.filter(p => p.team === me.team);
    const titles: string[] = [];
    const best = (f: (p: PlayerView) => number, label: string) => { const p = team.slice().sort((a, b) => f(b) - f(a))[0]; if (p && f(p) > 0) titles.push(`${label} : ${p.name}`); };
    best(p => p.income + p.workers * 4, '👑 ROI DE L\'ÉCONOMIE');
    best(p => -p.stats.leaks * 100 + p.stats.dmgTanked / 100, '🛡️ MEILLEURE DÉFENSE');
    best(p => p.stats.maxDps, '🔥 PLUS GROS DPS');
    best(p => p.stats.sentUnits, '⚔️ HARCELEUR');
    best(p => p.stats.upgrades + p.stats.fusions * 2, '✨ FORGERON');
    const mins = Math.floor(m.time / 60), secs = Math.floor(m.time % 60);
    const tbl = h('table', { class: 'end-table' });
    tbl.append(h('tr', {}, h('th', {}, ''), ...team.map(p => h('th', {}, p.name))));
    const rows: [string, (p: PlayerView) => string][] = [
      ['Armée', p => FACTIONS[p.faction].name], ['Ennemis éliminés', p => fmt(p.stats.kills)], ['Dégâts infligés', p => fmt(p.stats.dmgDealt)],
      ['Unités déployées', p => String(p.stats.unitsBuilt)], ['Améliorations / fusions', p => `${p.stats.upgrades} / ${p.stats.fusions}`],
      ['Ennemis envoyés', p => `${p.stats.sentUnits} (${p.stats.raidersSent} envois)`], ['Pouvoirs utilisés', p => String(p.stats.casts)],
      ['Unité la plus efficace', p => p.stats.bestUnit ? UNITS[p.stats.bestUnit].name : '—'], ['Or généré', p => fmt(p.stats.goldEarned)], ['Fuites', p => String(p.stats.leaks)],
    ];
    for (const [l, f] of rows) tbl.append(h('tr', {}, h('td', {}, l), ...team.map(p => h('td', {}, f(p)))));
    const prof = save.profile;
    prof.games++; if (win) prof.wins++;
    prof.xp += Math.round((20 + m.wave * 5 + (win ? 50 : 0)) * (me.randomFaction ? 1.25 : 1));
    prof.factionGames = { ...prof.factionGames, [me.faction]: (prof.factionGames?.[me.faction] ?? 0) + 1 };
    let recordLine = '';
    if (survival) {
      const partner = team.find(p => p.pid !== me.pid)!;
      const key = partner.isAI ? 'IA' : partner.name;
      const prev = prof.duoRecords[key] ?? 0;
      prof.duoRecords[key] = Math.max(prev, m.wave);
      prof.bestSurvival = Math.max(prof.bestSurvival, m.wave);
      recordLine = `${me.name.toUpperCase()} + ${partner.name.toUpperCase()} — RECORD : VAGUE ${prof.duoRecords[key]}${m.wave > prev ? ' (NOUVEAU !)' : ''}`;
    }
    save.flush();
    this.tutorial?.destroy();
    const coreMsg = m.result.reason === 'Le Core adverse est détruit !' || m.result.reason === 'Votre Core a été détruit.';
    const reason = survival || !coreMsg ? m.result.reason : win ? 'Le Core adverse est détruit !' : 'Votre Core a été détruit.';
    const scr = h('div', { class: `screen transparent endscr ${win ? 'win' : 'lose'}` },
      h('div', { class: 'logo', style: 'font-size:clamp(34px,8vw,68px)' }, survival ? 'FIN DE LA SURVIE' : win ? 'VICTOIRE !' : 'DÉFAITE'),
      h('p', { class: 'muted center', style: 'margin:6px 0' }, reason, ` — vague ${m.result.wave} · ${mins} min ${String(secs).padStart(2, '0')} s`),
      recordLine ? h('div', { class: 'code-big', style: 'font-size:clamp(18px,3.5vw,28px);letter-spacing:0.05em' }, recordLine) : null,
      h('div', { class: 'titles' }, ...titles.map(t => h('span', {}, t))),
      h('div', { class: 'card', style: 'width:min(680px,100%)' }, tbl),
      h('div', { class: 'menu row', style: 'margin-top:10px' },
        this.session.role !== 'guest' ? h('button', { class: 'btn primary', onclick: () => this.cb.rematch() }, '↻ Rejouer') : null,
        h('button', { class: 'btn', onclick: () => this.cb.exit() }, 'Menu')));
    setTimeout(() => this.root.append(scr), 600);
  }
}

function summarize(names: string[]) {
  const c = new Map<string, number>();
  for (const n of names) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c].map(([n, k]) => (k > 1 ? `${k}× ${n}` : n)).join(', ');
}

/** Short readable list of a unit's abilities. */
function abilitiesText(list: Ability[]): string {
  const t: string[] = [];
  for (const a of list) {
    switch (a.kind) {
      case 'taunt': t.push(`provocation ${a.radius.toFixed(1)} m`); break;
      case 'splash': t.push(`zone ${a.radius.toFixed(1)} m (${Math.round(a.pct * 100)} %)`); break;
      case 'poison': t.push(`poison ${Math.round(a.dps)}/s`); break;
      case 'burn': t.push(`brûlure ${Math.round(a.dps)}/s`); break;
      case 'slowOnHit': t.push(`ralentit ${Math.round(a.slow * 100)} %`); break;
      case 'stunOnHit': t.push(`étourdit ${Math.round(a.chance * 100)} %`); break;
      case 'heal': t.push(`soin ${Math.round(a.amount)}/${a.every}s`); break;
      case 'shieldPulse': t.push(`bouclier ${Math.round(a.amount)}/${a.every}s`); break;
      case 'chain': t.push(`${a.targets} rebonds`); break;
      case 'lifesteal': t.push(`vol de vie ${Math.round(a.pct * 100)} %`); break;
      case 'summon': t.push(`invoque ${a.count}`); break;
      case 'stealth': t.push('camouflage'); break;
      case 'pierce': t.push(`perce ${Math.round(a.pct * 100)} % armure`); break;
      case 'bonusVsBig': t.push(`+${Math.round(a.pct * 100)} % vs gros`); break;
      case 'guardAura': t.push(`aura -${Math.round(a.pct * 100)} % dégâts`); break;
      case 'auraAttackSpeed': t.push(`aura +${Math.round(a.pct * 100)} % cadence`); break;
      case 'hastePulse': t.push(`accélération +${Math.round(a.pct * 100)} %`); break;
      case 'regen': t.push(`régén ${(a.pct * 100).toFixed(1)} %/s`); break;
    }
  }
  return t.length ? 'Capacités : ' + t.join(' · ') : '';
}
