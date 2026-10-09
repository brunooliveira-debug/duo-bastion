// UISystem (in-game): HUD, touch input (tap / drag & drop / long-press / pinch / twist), panels, feedback.
// Mobile-first: the important buttons sit under the thumbs, panels never cover the middle of the lane.
import { tr } from '../i18n';
import { UNITS, FACTIONS, CATEGORY_NAMES, CATEGORY_COLORS, MAX_LEVEL, BRANCH_LEVEL, upgradeCost, unitStats, unitValueAt } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { getWave, waveEvent } from '../data/waves';
import {
  ATTACK_ICONS, ATTACK_NAMES, CORE, CURSES, DAMAGE_MATRIX, DEFENSE_ICONS, DEFENSE_NAMES, ECONOMY, PINGS, POWERS, RAIDERS, RAIDER_CATEGORY_NAMES,
  curseUnlock, matrixArrow, raiderPrice, raiderScale, raiderUnlock, sendCap, waveIncome,
} from '../data/economy';
import { FACTION_POWERS, POWER_LEVEL_CD, POWER_MAX_LEVEL, POWER_UP_COST, powerUnlock } from '../data/powers';
import { SYNERGIES, ZONE_TEXT, RUNES, zoneOf } from '../data/synergies';
import { MODULES, MODULE_IDS, FAMILY_NAMES, FAMILY_COLORS, MODULE_REFUND, PROPOSAL_TIMEOUT, moduleCost, moduleValue, ModuleFamily } from '../data/modules';
import { RESO_MAX, RESO_GAIN, duoAbility, ALL_DUO_ABILITIES } from '../data/resonance';
import { ORDERS, ORDER_IDS, OrderId, ANOMALIES, AnomalyId, RIFT_REWARDS, RIFT_MAX_UNITS, RIFT_MINIONS } from '../data/tactics';
import { BLESSINGS, BlessingId, blessingWave } from '../data/blessings';
import type { AttackType, Branch, DefenseType } from '../data/types';
import { recommendedValue, riskOf, powerBucket } from '../sim/balance';
import { buildBonuses, previewSynergies } from '../sim/synergy';
import { cellCenter, SEAL_WINDOW, SEAL_RESO } from '../sim/state';
import type { Build, GameEvent, JournalEntry } from '../sim/state';
import { unitPrice, levelPrice, type Command } from '../sim/game';
import { FUSION_BONUS } from '../sim/combat';
import { Renderer, DragGhost, ARENA_GAP } from '../render/Renderer';
import type { Session } from '../net/Session';
import { F_BREACH, F_ELITE, F_ENEMY, F_LEAK, F_RIFT, F_SHIELD, type MetaView, type PlayerView } from '../net/snapshot';
import { audio } from '../audio/AudioSystem';
import { save } from '../save/SaveSystem';
import { DEBUG, ONLINE } from '../config';
import { submitDailyRun } from '../net/backend';
import { h, clear, fmt, vibrate } from './dom';
import { icon, categoryIcon } from './icons';
import { Tutorial } from './Tutorial';
import { abilitiesText } from './unitText';

type Sheet = 'raiders' | 'core' | 'stats' | 'pings' | 'menu' | 'unit' | 'info' | 'opp' | 'syn' | 'reso' | 'rift' | 'fusion' | 'bless' | null;

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
  // v0.4
  private pendingOrder: { id: OrderId; until: number; timer: number } | null = null;
  private orderOpen = false;
  private modFamily: ModuleFamily = 'defense';
  private anomalyMin = false;
  private hints = new Set<string>();
  private teleWarned = 0;

  private onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // typing in the chat
      e.preventDefault();
      this.undo();
    }
  };
  /** ↶ undo the last action of this preparation phase (the host validates it: works online too) */
  private undo() {
    if (this.meta?.phase !== 'build') return;
    if (this.cmd({ c: 'undo' })) { audio.play('click'); this.haptic(15); }
  }
  private undoHintShown = false;

  constructor(private session: Session, private r: Renderer, private cb: HudCallbacks) {
    window.addEventListener('keydown', this.onKey);
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
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
    this.dragEl?.remove();
    const c = this.r.renderer.domElement;
    c.onpointerdown = c.onpointermove = c.onpointerup = c.onpointercancel = null;
    c.onwheel = null;
  }

  private cmd(c: Command) {
    const err = this.session.send(c);
    if (err) { this.toast(tr(err), 'error'); audio.play('error'); return false; }
    return true;
  }

  // ------------------------------------------------------------------ DOM skeleton
  private build() {
    const E = this.els;
    const pill = (ic: string, color: string, val: HTMLElement, extra = '', label = '') => h('div', { class: `pill ${extra}`, 'aria-label': label }, h('span', { html: icon(ic, 22, color) }), val);
    // top-left: my resources (gold, ether, income)
    E.gold = h('b', { class: 'g' }); E.ether = h('b', { class: 'e' }); E.income = h('b', { class: 'inc' });
    const pills = h('div', { class: 'pills' },
      pill('coin', '#FFC233', E.gold, '', tr('Or')), pill('ether', '#9FE9FF', E.ether, '', tr('Éther')), pill('income', '#7DFFB0', E.income, 'inc-pill', tr('Revenu par vague')));
    // top centre (v0.7 HUD): the siege bar — wave tracker, shared Bastion health, enemies remaining
    E.coreTxt = h('b'); E.coreFill = h('i'); E.coreShield = h('s'); E.coreBar = h('div', { class: 'bar core' }, E.coreFill, E.coreShield);
    E.wave = h('b'); E.waveName = h('span', { class: 'sg-name' }); E.timer = h('span', { class: 'timer-chip' });
    E.progFill = h('i'); E.progTxt = h('small');
    E.siege = h('div', { class: 'siege', 'aria-label': tr('Vague et Bastion') },
      h('div', { class: 'sg-wave' }, h('span', { html: icon('skull', 16, '#F2ECE0', 2.6) }), E.wave, E.waveName, E.timer),
      h('div', { class: 'sg-core' }, h('span', { html: icon('core', 16, '#9FE9FF', 2.6) }), E.coreBar, E.coreTxt),
      h('div', { class: 'sg-prog' }, h('div', { class: 'bar prog' }, E.progFill), E.progTxt));
    E.siege.onclick = () => { E.nextDetail.style.display = E.nextDetail.style.display === 'none' ? 'block' : 'none'; };
    // top-right: partner, opponent, chat, speed, pause, menu
    E.partner = h('div', { class: 'partner' });
    E.opp = h('button', { class: 'oppchip', 'aria-label': tr('Informations sur l\'adversaire'), onclick: () => this.openSheet('opp') });
    E.speedBadge = h('span', { class: 'badge2' });
    E.speedBtn = h('button', { class: 'sqbtn', 'aria-label': tr('Vitesse de jeu'), html: icon('ff', 22), onclick: () => this.cycleSpeed() });
    E.speedBtn.append(E.speedBadge);
    E.pauseBtn = h('button', { class: 'sqbtn', 'aria-label': tr('Pause'), html: icon('pause', 22), onclick: () => this.togglePause() });
    const top = h('div', { class: 'hud-top' }, pills, h('div', { class: 'top-right' }, E.partner, E.opp,
      h('button', { class: 'sqbtn', 'aria-label': tr('Messages au partenaire'), html: icon('chat', 22), onclick: () => this.openSheet('pings') }),
      E.speedBtn, E.pauseBtn,
      h('button', { class: 'sqbtn', 'aria-label': tr('Menu'), html: icon('gear', 22), onclick: () => this.openSheet('menu') })));
    // second row: army vs recommended, next wave (+ event), synergies
    E.army = h('div', { class: 'pill small army' });
    E.next = h('button', { class: 'pill small next', onclick: () => { E.nextDetail.style.display = E.nextDetail.style.display === 'none' ? 'block' : 'none'; } });
    E.nextDetail = h('div', { class: 'next-detail', style: 'display:none' });
    E.syn = h('button', { class: 'pill small synpill', onclick: () => this.openSheet('syn') });
    E.reso = h('button', { class: 'pill small reso', 'aria-label': tr('Résonance DUO'), onclick: () => this.openSheet('reso') });
    E.fuseChip = h('button', { class: 'pill small fusechip', style: 'display:none', onclick: () => this.openSheet('fusion') });
    E.riftChip = h('button', { class: 'pill small riftchip', style: 'display:none', onclick: () => this.openSheet('rift') });
    E.anomChip = h('button', { class: 'pill small anomchip', style: 'display:none', onclick: () => { this.anomalyMin = false; this.els.anomaly.dataset.k = ''; } });
    // v0.7: blessing draft chip (minimised panel) + owned blessings chip
    E.blessChip = h('button', { class: 'pill small anomchip blesschip', style: 'display:none', onclick: () => { this.blessMin = false; this.els.bless.dataset.k = ''; } });
    E.blessList = h('button', { class: 'pill small blesslist', style: 'display:none', 'aria-label': tr('Bénédictions de l\'équipe'), onclick: () => this.openSheet('bless') });
    E.left = h('div', { class: 'hud-left' }, h('div', { class: 'hud-row2' }, E.reso, E.army, E.next, E.syn, E.fuseChip, E.riftChip, E.anomChip, E.blessChip, E.blessList), E.nextDetail);
    // v0.7: mini-map (tap to look there)
    E.minimap = h('canvas', { class: 'minimap', width: 180, height: 100, 'aria-label': tr('Mini-carte') });
    E.minimap.onpointerdown = e => { e.preventDefault(); this.minimapTap(e.offsetX, e.offsetY); };
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
    // ↶ undo the last placement / move / upgrade / sale / fusion of this preparation phase (exact refund)
    const un = round('undo', 'undo', '#BFE6FF', tr('Annuler'), () => this.undo());
    E.undoWrap = un.wrap; E.undoBadge = un.badge; un.wrap.style.display = 'none';
    const w = round('worker', 'pick', '#FFD27A', tr('Ouvrier'), () => { if (this.cmd({ c: 'worker' })) { audio.play('worker'); this.tutorial?.on('worker'); } });
    const r = round('raider', 'swords', '#FF9AA6', tr('Attaquer'), () => this.openSheet('raiders'));
    const c = round('corebtn', 'core', '#9FE9FF', tr('Bastion'), () => this.openSheet('core'));
    E.workerBtn = w.btn; E.workerBadge = w.badge; E.workerSub = w.sub;
    E.raiderBtn = r.btn; E.raiderBadge = r.badge; E.raiderSub = r.sub; E.raiderWrap = r.wrap;
    E.coreBtn = c.btn; c.badge.style.display = 'none';
    E.readyLabel = h('span', { class: 'rl' }); E.readySub = h('small', { class: 'rs' });
    E.ready = h('button', { class: 'ready', onclick: () => this.toggleReady() }, h('span', { class: 'ring' }), E.readyLabel, E.readySub);
    // combat: tactical orders + DUO button next to the commander powers
    E.ordersBtn = h('button', { class: 'obtn', 'aria-label': tr('Ordres tactiques'), onclick: () => { this.orderOpen = !this.orderOpen; this.renderOrders(); audio.play('click'); } });
    E.duo = h('button', { class: 'duobtn', style: 'display:none', 'aria-label': tr('Résonance DUO'), onclick: () => { if (this.cmd({ c: 'reso' })) { vibrate([30, 40, 60]); } } });
    // v0.7: twin seals of the major bosses (both players press within 3 s)
    E.seal = h('button', { class: 'sealbtn', style: 'display:none', 'aria-label': tr('Sceau'), onclick: () => { if (this.cmd({ c: 'seal' })) { audio.play('order'); this.haptic([20, 30, 20]); } } });
    E.combatExtra = h('div', { class: 'combat-extra', style: 'display:none' }, E.ordersBtn, E.seal, E.duo);
    E.orderStrip = h('div', { class: 'orderstrip', style: 'display:none' });
    const bottom = h('div', { class: 'hud-bottom' }, E.cards, E.powers, E.combatExtra, h('div', { class: 'actions' }, un.wrap, w.wrap, r.wrap, c.wrap, E.ready));
    E.sheet = h('div', { class: 'sheet', style: 'display:none' });
    E.sheet.addEventListener('pointerdown', () => { this.sheetHold = true; });
    const release = () => { if (!this.sheetHold) return; this.sheetHold = false; this.lastSheetKey = ''; };
    E.sheet.addEventListener('pointerup', () => setTimeout(release, 60));
    E.sheet.addEventListener('pointercancel', release);
    E.sheet.addEventListener('pointerleave', release);
    E.toasts = h('div', { class: 'toasts' });
    E.vignette = h('div', { class: 'vignette' });
    E.countdown = h('div', { class: 'countdown', style: 'display:none' });
    E.placeTip = h('div', { class: 'placetip', style: 'display:none' });
    E.overlay = h('div', { class: 'overlay-msg', style: 'display:none' });
    E.rotate = h('div', { class: 'rotate' }, tr('↻ Tourne ton téléphone en mode paysage pour mieux jouer'));
    E.anomaly = h('div', { class: 'anomaly', style: 'display:none' });
    E.bless = h('div', { class: 'anomaly bless', style: 'display:none' });
    E.proposal = h('div', { class: 'proposal', style: 'display:none' });
    E.flash = h('div', { class: 'screenflash' });
    this.root.append(E.vignette, E.flash, top, E.siege, E.left, E.boss, E.minimap, bottom, E.orderStrip, E.anomaly, E.bless, E.proposal, E.sheet, E.toasts, E.countdown, E.placeTip, E.overlay, E.rotate);
    if (DEBUG) this.root.append(this.debugPanel());
  }

  private debugPanel() {
    const b = (label: string, action: string) => h('button', { onclick: () => this.cmd({ c: 'debug', action }) }, label);
    return h('div', { class: 'debug' }, b(tr('+500 or'), 'gold'), b(tr('+100 éther'), 'ether'), b(tr('Vague +1'), 'wave'), b(tr('Lancer'), 'skip'), b(tr('Tuer tout'), 'kill'), b(tr('Core 100%'), 'core'), b(tr('Pouvoirs'), 'cd'), b(tr('Événement'), 'event'),
      b(tr('Résonance'), 'reso'), b(tr('Faille'), 'rift'), b(tr('Anomalie'), 'anomaly'), b(tr('Bénédiction'), 'bless'),
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
    tm.textContent = m.paused ? tr('PAUSE') : m.phase === 'build' ? `${Math.ceil(t)} s` : m.phase === 'combat' ? (m.ending > 0 ? '!!!' : tr('COMBAT')) : m.phase === 'ended' ? tr('FIN') : '…';
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
    E.wave.textContent = tr('VAGUE {0} / {1}', m.wave, total);
    const wd = getWave(m.wave);
    if (E.waveName.textContent !== wd.name) E.waveName.textContent = wd.name;
    E.siege.classList.toggle('boss', !!wd.boss);
    const ct = m.teams[me.team];
    const k = ct.hp / ct.maxHp;
    E.coreFill.style.width = `${k * 100}%`;
    E.coreShield.style.left = `${k * 100}%`;
    E.coreShield.style.width = `${Math.min(100 - k * 100, (ct.shield / ct.maxHp) * 100)}%`;
    E.coreBar.classList.toggle('low', k < 0.3);
    E.coreTxt.textContent = `${fmt(ct.hp)} / ${fmt(ct.maxHp)}`;
    this.renderProgress(m, me);
    E.gold.textContent = fmt(me.gold);
    E.ether.textContent = fmt(me.ether);
    E.income.textContent = `+${waveIncome(me.income, m.wave)}`;
    const value = me.builds.reduce((t, b) => t + b.value, 0);
    const rec = recommendedValue(m.wave, me.builds, value);
    const risk = riskOf(value, rec);
    const armyKey = `${risk}|${value}|${rec}`;
    if (E.army.dataset.k !== armyKey) {
      E.army.dataset.k = armyKey;
      E.army.className = `pill small army ${risk}`;
      E.army.innerHTML = tr('{0}<span>Armée {1}</span><span class="rec">· conseillé {2}</span>', icon('shield', 16, risk === 'green' ? '#7DFFB0' : risk === 'orange' ? '#FFB03A' : '#FF5A6A'), fmt(value), fmt(rec));
    }
    this.renderNext(m);
    this.renderReso(m, me);
    this.renderChips(m, me);
    this.renderAnomaly(m, me);
    this.renderBless(m, me);
    this.renderProposal(m, me);
    this.renderMinimap(m, me);
    // synergies chip
    const bb = buildBonuses(me.builds, me.runes ?? []);
    const synCount = new Set([...bb.values()].flatMap(b => b.syn)).size;
    const sKey = `${synCount}`;
    if (E.syn.dataset.k !== sKey) { E.syn.dataset.k = sKey; E.syn.innerHTML = tr('{0}<span>Synergies {1}</span>', icon('users', 16, '#7DFFB0'), synCount); }
    // partner chip
    const partner = this.partner(m);
    const pv = partner.builds.reduce((t, b) => t + b.value, 0);
    const off = !this.session.partnerOnline && !partner.isAI && m.settings.mode !== 'duel';
    const state = off ? tr('CONNEXION…') : m.phase === 'build' ? (partner.ready ? tr('<em>PRÊT</em>') : 'construit…') : m.phase === 'combat' ? (partner.leakedThisWave ? tr('{0} fuites', partner.leakedThisWave) : tr('en combat')) : '';
    const prec = recommendedValue(m.wave, partner.builds, pv);
    const pk = Math.max(0.04, Math.min(1, pv / Math.max(1, prec)));
    const pKey = `${partner.name}|${pv}|${partner.workers}|${state}|${off}|${Math.round(pk * 20)}`;
    if (E.partner.dataset.k !== pKey) {
      E.partner.dataset.k = pKey;
      E.partner.classList.toggle('off', off);
      const fc = FACTIONS[partner.faction].color;
      E.partner.style.setProperty('--fc', fc);
      E.partner.innerHTML = tr('<div class="av" style="background:{0}">{1}</div><div class="pf"><div class="nm">{2}</div><div class="st">{3} · Armée {4} · {5}</div><div class="bar mini {6}"><i style="width:{7}%"></i></div></div>', fc, partner.isAI ? tr('IA') : esc(partner.name.slice(0, 1).toUpperCase()), esc(tr(partner.name)), FACTIONS[partner.faction].title, fmt(pv), state, pk < 0.6 ? 'low' : '', pk * 100);
    }
    // opponent chip (public info only)
    const opp = this.opponents(m);
    E.opp.style.display = opp.length ? '' : 'none';
    if (opp.length) {
      const et = m.teams[opp[0].team];
      const oKey = `${Math.round(et.hp)}|${opp.map(o => o.faction).join()}`;
      if (E.opp.dataset.k !== oKey) {
        E.opp.dataset.k = oKey;
        E.opp.innerHTML = tr('{0}<div class="oc"><div class="bar enemy"><i style="width:{1}%"></i></div><small>{2}</small></div>', icon('swords', 18, '#FF9AA6'), (et.hp / et.maxHp) * 100, opp.map(o => FACTIONS[o.faction].title).join(' + '));
      }
    }
    E.speedBadge.textContent = `x${m.speed}`;
    (E.speedBtn as HTMLButtonElement).disabled = this.session.role === 'guest';
    E.pauseBtn.classList.toggle('on', me.pauseVote || m.paused);
    // bottom: cards or powers
    const combat = m.phase === 'combat';
    E.cards.style.display = combat ? 'none' : '';
    E.powers.style.display = combat ? '' : 'none';
    E.combatExtra.style.display = combat ? '' : 'none';
    if (combat) { this.renderPowers(me, m); this.renderCombatExtra(me, m); } else { this.renderCards(me, m); if (this.orderOpen) { this.orderOpen = false; this.renderOrders(); } }
    // round actions
    const wc = ECONOMY.workerBaseCost + ECONOMY.workerCostStep * (me.workers - ECONOMY.startWorkers);
    const uc = m.phase === 'build' ? me.undoCount ?? 0 : 0;
    E.undoWrap.style.display = uc > 0 ? '' : 'none';
    E.undoBadge.textContent = String(uc);
    E.workerBadge.textContent = String(me.workers);
    E.workerSub.textContent = tr('Ouvrier {0}', wc);
    (E.workerBtn as HTMLButtonElement).disabled = me.gold < wc || me.workers >= ECONOMY.maxWorkers;
    E.raiderSub.textContent = m.settings.mode === 'survival' ? tr('Investir') : tr('Attaquer');
    const q = me.raiderQueue.length + me.curseQueue.length;
    E.raiderBadge.textContent = String(q);
    E.raiderBadge.style.display = q ? '' : 'none';
    // launch button
    const humans = m.players.filter(p => !p.isAI && p.pid !== me.pid);
    const waitFor = humans.filter(p => !p.ready);
    const rKey = `${me.ready}|${waitFor.map(p => p.name).join()}|${m.phase}`;
    if (E.ready.dataset.k !== rKey) {
      E.ready.dataset.k = rKey;
      if (m.phase !== 'build') { E.readyLabel.textContent = m.phase === 'combat' ? tr('COMBAT') : '…'; E.readySub.textContent = ''; }
      else if (me.ready) {
        E.readyLabel.innerHTML = tr('{0}PRÊT', icon('check', 20, '#7DFFB0', 3));
        E.readySub.textContent = waitFor.length ? tr('attente de {0}', waitFor.map(p => p.name).join(', ')) : 'lancement…';
      } else { E.readyLabel.innerHTML = tr('{0}LANCER', icon('play', 18, '#3a2400', 3)); E.readySub.textContent = tr('la vague maintenant'); }
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
      E.overlay.append(h('div', { class: 'col' }, tr('⏸ PAUSE'), h('button', { class: 'btn primary', onclick: () => this.cmd({ c: 'pause', value: false }) }, tr('Reprendre'))));
    } else if (waiting) E.overlay.textContent = this.session.role === 'host' ? tr('📡 Joueur déconnecté — en attente de reconnexion…') : tr('📡 CONNEXION… (reconnexion à l\'hôte)');
    if (me.powerChoice && !document.querySelector('.power-modal')) this.showPowerChoice(me.powerChoice);
    // live sheets are rebuilt only when what they show changes, and never under a finger
    // (a button replaced between pointerdown and pointerup loses the tap on phones)
    if (this.sheet && this.sheet !== 'pings' && this.sheet !== 'menu' && this.sheet !== 'info' && !this.sheetHold) {
      const k = this.sheetKey(m, me);
      if (k !== this.lastSheetKey) { this.lastSheetKey = k; this.renderSheet(); }
    }
  }
  private sheetHold = false;
  private lastSheetKey = '';
  private sheetKey(m: MetaView, me: PlayerView) {
    const t = m.teams[me.team];
    return [this.sheet, this.sheetArg, m.phase, m.wave, Math.floor(me.gold), Math.floor(me.ether), me.income, me.workers,
      me.builds.map(b => `${b.bid}${b.level}${b.branch ?? ''}${b.rift ? 'r' : ''}${b.col}${b.row}`).join(','), me.raiderQueue.length, me.curseQueue.length,
      me.powerLv.join(), t.modules.map(x => (x ? x.id + x.lv : '-')).join(), t.proposal ? t.proposal.module + t.proposal.by : '', Math.floor(t.reso), t.resoUses,
      Math.round(t.hp / 50), this.raiderTab, this.target, this.modFamily, this.pendingFuse, t.blessings.join(),
      this.sheet === 'opp' || this.sheet === 'stats' ? Math.floor(m.time / 2) : 0].join('|');
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
    // split in spans so small screens can drop the label and the defence types (CSS)
    E.next.innerHTML = tr('{0}<span><span class="nx-l">{1} : </span>{2}<span class="nx-d"> · {3}{4}</span> · ×{5}</span>', ev ? tr('<span class="evb">{0}{1}</span>', icon(ev.icon, 14, '#1a1020', 3), ev.name) : '', m.phase === 'build' ? tr('Prochaine') : tr('En cours'), esc(w.name), [...def].map(d => DEFENSE_NAMES[d]).join('/'), hint, count);
    clear(E.nextDetail);
    E.nextDetail.append(
      h('b', {}, `${m.phase === 'build' ? tr('PROCHAINE') : tr('EN COURS')} : ${w.name}`), h('br'),
      `${[...atk].map(a => ATTACK_ICONS[a] + ' ' + ATTACK_NAMES[a]).join(', ')}`, h('br'),
      `${[...def].map(d => DEFENSE_ICONS[d] + ' ' + DEFENSE_NAMES[d]).join(', ')}${hint}`, h('br'),
      `×${count} · ${speed >= 3.5 ? 'rapides' : speed <= 1.8 ? 'lents' : tr('vitesse normale')}${ranged ? tr(' · distance') : ''}`, h('br'),
      ...bosses.flatMap(b => [h('span', { style: 'color:#FFC233' }, '👑 ' + b), h('br')]),
      ...(ev ? [h('span', { style: 'color:#C8A0FF' }, `✦ ${ev.name} : ${ev.text}`), h('br')] : []),
      h('span', { style: 'color:var(--warn)' }, w.danger),
    );
  }

  private renderBoss(m: MetaView) {
    const E = this.els;
    const me = this.me!;
    let best: { name: string; hp: number; mech: string; shield: boolean } | null = null;
    if (m.phase === 'combat') {
      for (const e of this.session.view.sample()) {
        const d = ENEMIES[e.defId];
        if (!d?.boss || e.arena !== me.team) continue;
        if (!best || e.hp > best.hp) best = { name: d.name, hp: e.hp, mech: d.mechanic ?? '', shield: !!(e.flags & F_SHIELD) };
      }
    }
    E.boss.style.display = best ? '' : 'none';
    if (best) {
      const seal = m.teams[me.team].seal;
      E.bossName.textContent = best.name;
      E.bossMech.textContent = seal && !seal.broken ? tr('🔒 Sceaux jumeaux : activez vos deux SCEAUX à moins de 3 s') : best.mech;
      E.bossFill.style.width = `${best.hp * 100}%`;
      E.boss.classList.toggle('sealed', !!seal && !seal.broken && best.shield);
    }
  }

  // ------------------------------------------------------------------ v0.7 HUD: siege bar progress, mini-map, blessings, seals
  private waveTotal = 0;
  /** enemies of my arena still standing (rifts excluded) */
  private enemiesLeft(m: MetaView, me: PlayerView) {
    let n = 0;
    if (m.phase !== 'combat') return 0;
    for (const e of this.session.view.sample()) if ((e.flags & F_ENEMY) && !(e.flags & F_RIFT) && e.arena === me.team) n++;
    return n;
  }
  private renderProgress(m: MetaView, me: PlayerView) {
    const E = this.els;
    if (m.phase === 'combat') {
      const n = this.enemiesLeft(m, me);
      this.waveTotal = Math.max(this.waveTotal, n);
      const k = this.waveTotal ? 1 - n / this.waveTotal : 0;
      E.progFill.style.width = `${k * 100}%`;
      E.progTxt.textContent = tr('{0} restant{1} · {2} s', n, n > 1 ? 's' : '', Math.floor(m.combatTime));
      E.siege.dataset.mode = 'combat';
    } else {
      if (m.phase === 'build') this.waveTotal = 0;
      const k = m.phase === 'build' ? Math.max(0, Math.min(1, m.timer / Math.max(1, m.timerMax))) : 1;
      E.progFill.style.width = `${k * 100}%`;
      E.progTxt.textContent = m.phase === 'build' ? tr('préparation') : m.phase === 'resolution' ? tr('vague terminée') : '';
      E.siege.dataset.mode = m.phase;
    }
  }

  /** Tap on the mini-map: look there. */
  private minimapTap(px: number, py: number) {
    const me = this.me; if (!me) return;
    const c = this.els.minimap as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    const x = (px / r.width) * 96 - 48, z = (py / r.height) * 17 - 8.5;
    this.r.target.x = Math.max(-42, Math.min(42, x));
    this.r.target.z = me.team * ARENA_GAP + Math.max(-8, Math.min(8, z));
    audio.play('click');
  }
  private mmLast = 0;
  /** Mini-map: my team's arena from above — lanes, grids, Bastion, units (slot colours), enemies (red), bosses, rifts. */
  private renderMinimap(m: MetaView, me: PlayerView) {
    const now = performance.now();
    if (now - this.mmLast < 120) return;
    this.mmLast = now;
    const c = this.els.minimap as HTMLCanvasElement;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width, H = c.height;
    const X = (x: number) => ((x + 48) / 96) * W, Z = (z: number) => ((z + 8.5) / 17) * H;
    g.clearRect(0, 0, W, H);
    // lanes + bridges + plaza
    g.fillStyle = 'rgba(120, 128, 160, 0.22)';
    for (const sg of [-1, 1]) { g.fillRect(X(Math.min(sg * 46, sg * 5)), Z(-4.6), (41 / 96) * W, (9.2 / 17) * H); }
    g.fillStyle = 'rgba(159, 233, 255, 0.28)';
    g.beginPath(); g.arc(X(0), Z(0), (5.6 / 96) * W, 0, Math.PI * 2); g.fill();
    // build grids (per slot colour)
    for (const slot of [0, 1]) {
      const a = cellCenter(slot, 0, 0), b = cellCenter(slot, 11, 6);
      g.fillStyle = slot === me.slot ? 'rgba(74, 168, 255, 0.22)' : 'rgba(255, 162, 58, 0.18)';
      g.fillRect(X(Math.min(a.x, b.x) - 0.5), Z(a.z - 0.5), (12 / 96) * W, (7 / 17) * H);
    }
    // rift gates
    g.fillStyle = '#b07aff';
    for (const sg of [-1, 1]) { g.beginPath(); g.arc(X(sg * 38), Z(0), 2.2, 0, Math.PI * 2); g.fill(); }
    const dot = (x: number, z: number, col: string, r: number) => { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill(); };
    const slotCol = ['#4aa8ff', '#ffa23a'];
    if (m.phase === 'combat') {
      for (const e of this.session.view.sample()) {
        if (e.arena !== me.team) continue;
        const f = e.flags;
        if (f & F_ENEMY) {
          const boss = !!ENEMIES[e.defId]?.boss;
          if (f & F_RIFT) dot(e.x, e.z, '#c07aff', 2.6);
          else if (boss) { dot(e.x, e.z, '#ffb030', 3.4); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
          else dot(e.x, e.z, (f & F_LEAK) ? '#ff2a2a' : (f & F_BREACH) ? '#ff8a2a' : '#ff5a6a', (f & F_ELITE) ? 2.2 : 1.5);
        } else dot(e.x, e.z, slotCol[m.players[e.owner]?.slot ?? 0], 1.6);
      }
    } else {
      for (const p of m.players) { if (p.team !== me.team) continue; for (const b of p.builds) { const cc = cellCenter(p.slot, b.col, b.row); dot(cc.x, cc.z, slotCol[p.slot], 1.6); } }
    }
    // camera focus
    const tx = this.r.target.x, tz = this.r.target.z - me.team * ARENA_GAP;
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
    g.strokeRect(X(tx) - 9, Z(tz) - 6, 18, 12);
  }

  private blessMin = false;
  /** Blessing draft (3 cards): the picker chooses, the partner watches. Minimises to a chip. */
  private renderBless(m: MetaView, me: PlayerView) {
    const E = this.els;
    const t = m.teams[me.team];
    const offer = m.phase === 'build' ? t.blessingOffer : null;
    const key = offer && !this.blessMin ? `${offer.ids.join()}|${offer.picker}|${t.blessings.join()}` : '';
    if (!key) { E.bless.style.display = 'none'; E.bless.dataset.k = ''; return; }
    if (E.bless.dataset.k === key) return;
    E.bless.dataset.k = key;
    E.bless.style.display = '';
    clear(E.bless);
    const mine = offer!.picker === me.pid;
    const picker = m.players[offer!.picker];
    E.bless.append(h('div', { class: 'an-head' },
      h('b', {}, tr('✦ BÉNÉDICTION — permanente, pour l\'équipe')),
      h('span', { class: 'muted small' }, mine ? tr('À toi de choisir (chacun son tour)') : tr('{0} choisit…', picker?.name ?? tr('Ton partenaire'))),
      h('button', { class: 'x', 'aria-label': tr('Réduire'), onclick: () => { this.blessMin = true; E.bless.dataset.k = ''; this.renderBless(m, me); } }, '▾')));
    const row = h('div', { class: 'an-row' });
    for (const id of offer!.ids) {
      const b = BLESSINGS[id];
      const lv = t.blessings.filter(x => x === id).length;
      row.append(h('button', { class: `an-card bl${mine ? '' : ' wait'}${b.rare ? ' rare' : ''}`, disabled: !mine, onclick: () => { if (this.cmd({ c: 'bless', id })) { audio.play('upgrade'); this.haptic(20); } } },
        h('div', { class: 'an-ic', html: icon(b.icon, 22, b.rare ? '#E0C8FF' : '#FFE08A', 2.4) }),
        h('b', {}, b.name, b.rare ? h('em', { class: 'rare' }, tr(' RARE')) : null),
        h('span', { class: 'good' }, b.text),
        h('small', { class: 'votes' }, lv ? tr('Niveau {0} → {1} / {2}', lv, lv + 1, b.max) : b.max > 1 ? tr('Cumulable ×{0}', b.max) : '')));
    }
    E.bless.append(row);
  }

  private renderBlessSheet(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    const t = m.teams[me.team];
    S.append(title(tr('✦ Bénédictions de l\'équipe')),
      h('p', { class: 'muted small' }, tr('Avant presque chaque vague (sauf les vagues d\'anomalie), 3 bénédictions sont tirées : l\'un de vous en garde une, à tour de rôle. Elles sont permanentes et valent pour vous deux.')));
    const counts = new Map<string, number>();
    for (const id of t.blessings) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!counts.size) S.append(h('p', { class: 'small' }, tr('Aucune pour l\'instant : la première est proposée avant la vague 2.')));
    for (const [id, n] of counts) {
      const b = BLESSINGS[id as BlessingId];
      S.append(h('div', { class: 'synrow on' }, h('span', { html: icon(b.icon, 18, b.rare ? '#E0C8FF' : '#FFE08A') }), h('div', {}, h('b', {}, b.name), n > 1 ? ` ×${n}` : '', h('br'), h('small', {}, b.text))));
    }
    const next = (() => { for (let w = m.wave + 1; w < m.wave + 12; w++) if (blessingWave(m.settings.mode, m.settings.totalWaves, w, !!m.settings.tutorial)) return w; return 0; })();
    if (next) S.append(h('div', { class: 'muted small', style: 'margin-top:6px' }, tr('Prochaine bénédiction : avant la vague {0}.', next)));
  }

  private renderCards(me: PlayerView, m: MetaView) {
    const E = this.els;
    const key = me.draft.join(',') + '|' + me.faction;
    if (E.cards.dataset.key === key) {
      const anom = this.anomalyOf(m);
      for (const el of Array.from(E.cards.children) as HTMLElement[]) {
        const id = el.dataset.id;
        if (!id) continue;
        const price = unitPrice(id, anom);
        el.classList.toggle('poor', me.gold < price);
        el.classList.toggle('sel', this.selCard === id);
        const l1 = me.builds.filter(b => b.defId === id && b.level === 1).length;
        el.classList.toggle('twin', l1 === 1);
        const ct = el.querySelector('.ct') as HTMLElement | null;
        if (ct && ct.dataset.p !== String(price)) { ct.dataset.p = String(price); ct.innerHTML = `${icon('coin', 12, '#FFC233', 3)}${price}`; }
      }
      return;
    }
    E.cards.dataset.key = key;
    clear(E.cards);
    for (const id of me.draft) {
      const u = UNITS[id];
      let img = '';
      try { img = this.r.portrait(id, me.faction); } catch { /* WebGL portrait unavailable */ }
      const c = h('div', { class: `ucard${me.gold < u.cost ? ' poor' : ''}`, 'data-id': id, role: 'button', 'aria-label': tr('{0}, {1} or', u.name, u.cost), style: `--cat:${CATEGORY_COLORS[u.category]}` },
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
          h('b', {}, d.name), h('small', { class: 'pl', html: locked ? tr('Vague {0}', unlock) : stars(me.powerLv[slot], POWER_MAX_LEVEL) }));
        let lp: number | null = null;
        b.onpointerdown = () => { lp = window.setTimeout(() => { this.toast(`${d.name} : ${d.text}`, 'info'); lp = null; }, 500); };
        b.onpointerup = b.onpointercancel = () => { if (lp) clearTimeout(lp); };
        E.powers.append(b);
      });
      if (jam) E.powers.append(h('div', { class: 'jam' }, tr('📡 Pouvoirs brouillés')));
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
      case 'build': if (ev.pid === me.pid) {
        audio.play('build'); this.tutorial?.on('build');
        if (!this.undoHintShown) { this.undoHintShown = true; this.toast(tr('Erreur de placement ? ↶ Annuler (Ctrl+Z), ou glisse l\'unité pour la déplacer.'), 'info'); }
      } break;
      case 'undo': if (ev.pid === me.pid) {
        const what = { build: tr('Placement annulé'), move: tr('Déplacement annulé'), upgrade: tr('Amélioration annulée'), sell: tr('Vente annulée'), fuse: tr('Fusion annulée') }[ev.kind];
        this.toast(`↶ ${what}${ev.gold > 0 ? ` · +${Math.round(ev.gold)} 🪙` : ev.gold < 0 ? ` · ${Math.round(ev.gold)} 🪙` : ''}`, 'info');
      } break;
      case 'evolve': {
        if (ev.pid !== me.pid && ev.pid !== this.partnerPid()) break;
        audio.play('upgrade');
        const b = me.builds.find(x => x.bid === ev.bid);
        if (ev.pid === me.pid && b && ev.level === BRANCH_LEVEL && ev.branch) this.banner(tr('SPÉCIALISATION'), unitStats(b.defId, ev.level, ev.branch).name);
        else if (ev.pid === me.pid && ev.level === MAX_LEVEL) this.banner(tr('UNITÉ D\'ÉLITE ★★★★★'), b ? unitStats(b.defId, ev.level, ev.branch).name : '');
        break;
      }
      case 'fuse': if (ev.pid === me.pid) { audio.play('upgrade'); vibrate([20, 40, 20]); this.toast(tr('✨ Fusion réussie !'), 'info'); } break;
      case 'sell': if (ev.pid === me.pid) audio.play('sell'); break;
      case 'raider': if (ev.pid === me.pid) { audio.play('raider'); this.tutorial?.on('raider'); } break;
      case 'curse': if (ev.pid === me.pid) audio.play('raider'); break;
      case 'sends': {
        if (m.players[ev.to]?.team !== me.team) break;
        const names = ev.list.map(id => RAIDERS.find(r => r.id === id)?.name ?? id);
        this.toast(tr('⚠️ {0} envoie : {1} → {2}', m.players[ev.from].name, summarize(names), ev.to === me.pid ? tr('ta voie') : m.players[ev.to].name), ev.to === me.pid ? 'error' : 'info');
        break;
      }
      case 'hexed': {
        if (m.players[ev.to]?.team !== me.team) break;
        const names = ev.list.map(id => CURSES.find(c => c.id === id)?.name ?? id).join(', ');
        this.toast(tr('☠️ Malédiction {0} : {1}', ev.to === me.pid ? tr('sur ta voie') : tr('sur ') + m.players[ev.to].name, names), 'error');
        break;
      }
      case 'cast': {
        const p = m.players[ev.pid];
        const d = p ? FACTION_POWERS[p.faction].find(x => x.id === ev.power) : null;
        if (!d) break;
        if (ev.pid === me.pid) { this.flashPower(d.name); if (ev.assist) this.toast(tr('↪ Ta voie était libre : {0} frappe la voie de ton partenaire (+Résonance)', d.name), 'info'); }
        else if (p.team === me.team && (!p.isAI || ev.assist)) this.toast(`${p.name} : ${d.name}${ev.assist ? tr(' sur ta voie') : ''} !`, 'ping');
        audio.play('pulse');
        break;
      }
      case 'bossIn': if (ev.arena === me.team && !this.bossIds.has(ev.id + m.wave)) { this.bossIds.add(ev.id + m.wave); this.bossIntro(ev.id); } break;
      case 'bossPhase': if (ev.arena === me.team) { const d = ENEMIES[ev.def]; const ph = d?.phases?.[ev.phase - 1]; if (ph) { this.banner(tr('PHASE {0}', ev.phase + 1), `${d.name} — ${ph.name}`, true); audio.play('boss'); this.haptic([40, 60, 40]); } } break;
      case 'tele': if (ev.arena === me.team && ev.dur > 0) { audio.play('warn'); if (performance.now() - this.teleWarned > 20000) { this.teleWarned = performance.now(); this.toast(tr('⚠ Attaque de boss dans la zone rouge : ordre REPLI pour l\'esquiver !'), 'error'); } } break;
      case 'slam': if (ev.arena === me.team) { audio.play('boom'); this.haptic(50); } break;
      case 'reso': this.onReso(ev, m); break;
      case 'order': {
        const p = m.players[ev.pid];
        if (!p || p.team !== me.team) break;
        audio.play('order');
        if (ev.pid !== me.pid && !p.isAI) this.toast(tr('{0} : ordre {1}', p.name, ORDERS[ev.order as OrderId]?.name ?? ev.order), 'ping');
        break;
      }
      case 'module': {
        if (ev.team !== me.team) break;
        const d = MODULES[ev.module as keyof typeof MODULES];
        const who = m.players[ev.pid]?.name ?? '';
        if (ev.k === 'propose') { if (ev.pid !== me.pid) { this.toast(tr('🏰 {0} propose : {1}', who, d.name), 'ping'); audio.play('ping'); this.haptic(40); } }
        else if (ev.k === 'accept' || ev.k === 'auto') { audio.play('ether'); this.toast(ev.action === 'remove' ? tr('🏰 Module démonté : {0}', d.name) : tr('🏰 {0} {1} installé sur le Bastion', d.name, '★'.repeat(ev.lv)), 'info'); this.tutorial?.on('core'); }
        else if (ev.k === 'refuse') this.toast(tr('🏰 {0} a refusé : {1} (Éther rendu)', who, d.name), 'error');
        break;
      }
      case 'anomaly': {
        if (ev.team !== me.team) break;
        if (ev.k === 'pick') { const a = ANOMALIES[ev.id as AnomalyId]; this.banner(`✦ ${a.name}`, `${a.good} — ${a.bad}`, false, 'event'); audio.play('wave'); this.anomalyMin = false; }
        else if (ev.k === 'vote' && ev.pid !== me.pid) { this.toast(tr('{0} vote : {1}', m.players[ev.pid]?.name, ANOMALIES[ev.id as AnomalyId]?.name), 'ping'); }
        else if (ev.k === 'offer') { audio.play('ping'); }
        break;
      }
      case 'rift': {
        const p = m.players[ev.pid];
        if (!p || p.team !== me.team) break;
        const rw = RIFT_REWARDS[ev.reward as keyof typeof RIFT_REWARDS];
        if (ev.k === 'closed') { audio.play('upgrade'); this.toast(tr('⚡ Faille fermée{0} : {1}', ev.pid === me.pid ? '' : ' (' + p.name + ')', rw.text(m.wave)), 'info'); this.haptic([30, 30, 30]); }
        else if (ev.k === 'faded' && ev.pid === me.pid) this.toast(tr('La Faille s\'est refermée seule : pas de récompense.'), 'info');
        break;
      }
      case 'help': if (m.players[ev.pid]?.team === me.team) this.helpHint(ev.kind, m.players[ev.pid].faction, ev.pid === me.pid ? '' : m.players[ev.pid].name); break;
      // v0.7
      case 'bless': {
        if (ev.team !== me.team) break;
        if (ev.k === 'offer') { this.blessMin = false; audio.play('ping'); if (ev.pid === me.pid) this.toast(tr('✦ À toi de choisir une bénédiction pour l\'équipe'), 'ping'); }
        else {
          const b = BLESSINGS[ev.id as BlessingId];
          if (!b) break;
          audio.play('upgrade');
          const by = ev.pid === me.pid ? '' : ev.pid >= 0 ? ` (${m.players[ev.pid]?.name ?? ''})` : tr(' (le hasard a tranché)');
          this.banner(`✦ ${b.name}`, b.text + by, false, 'event');
        }
        break;
      }
      case 'seal': {
        if (ev.team !== me.team) break;
        if (ev.k === 'open') { audio.play('boss'); setTimeout(() => this.banner(tr('🔒 SCEAUX JUMEAUX'), tr('Activez vos deux SCEAUX à moins de {0} s d\'écart pour briser le bouclier du boss', SEAL_WINDOW), true), 2600); }
        else if (ev.k === 'arm') {
          if (ev.pid === me.pid) this.toast(tr('🔒 Sceau activé : ton partenaire a {0} s pour répondre', SEAL_WINDOW), 'info');
          else { this.toast(tr('🔒 {0} active son sceau — appuie sur SCEAU !', m.players[ev.pid]?.name ?? tr('Ton partenaire')), 'ping'); audio.play('warn'); this.haptic([60, 40, 60]); }
        } else {
          audio.play('resoFire');
          this.banner(tr('SCEAUX BRISÉS !'), tr('Bouclier détruit, boss étourdi · +{0} Résonance', SEAL_RESO), false, 'reso');
          this.flashScreen('radial-gradient(circle, rgba(255,230,160,0.7), rgba(255,180,60,0.2) 60%, transparent 80%)');
          this.haptic([80, 40, 120]);
        }
        break;
      }
      case 'portal': if (ev.arena === me.team && !this.hints.has('portal')) { this.hints.add('portal'); this.toast(tr('🌀 Portail de Repli : un fuyard renvoyé au début de la voie !'), 'info'); } break;
      case 'powerUp': if (ev.pid === me.pid) audio.play('upgrade'); break;
      case 'income': if (ev.pid === me.pid && ev.gold > 0 && ev.k !== 'wave') { audio.play('coin'); this.toast(`+${ev.gold} 🪙`, 'info'); } break;
      // v0.7.1: end-of-wave recap — income, kill bounties, speed bonus, lane held
      case 'waveEnd': if (ev.pid === me.pid) {
        audio.play('coin');
        const parts = [tr('+{0} revenu', ev.income), tr('+{0} éliminations', ev.kills)];
        if (ev.speed > 0) parts.push(tr('+{0} rapidité ({1} s)', ev.speed, ev.time));
        if (ev.held) parts.push(tr('+{0} voie tenue', ECONOMY.waveClearBonus));
        this.toast(tr('💰 Vague {0} : {1} = +{2} 🪙', ev.wave, parts.join(' · '), ev.total + ev.kills), 'ping');
      } break;
      case 'ping': {
        if (m.players[ev.pid]?.team !== me.team) break;
        const p = PINGS.find(x => x.id === ev.ping);
        if (p) { this.toast(`${m.players[ev.pid].name} : ${p.label}`, 'ping'); audio.play('ping'); if (ev.pid !== me.pid) vibrate(60); }
        break;
      }
      case 'msg': this.toast(tr(ev.text), 'info'); break;
      case 'leak': if (ev.arena === me.team) { audio.play('leak'); if (ev.pid === me.pid) this.flashLeak(); } break;
      case 'coreHit': if (ev.team === me.team) { audio.play('coreHit'); if (save.prefs.flash) { this.els.vignette.classList.add('hit'); setTimeout(() => this.els.vignette.classList.remove('hit'), 180); } this.haptic(40); } break;
      case 'die': if (ev.boss && ev.arena === me.team) { audio.play('bossDie'); this.banner(tr('BOSS VAINCU !'), ''); this.haptic([60, 40, 90]); } else if (ev.arena === me.team && Math.random() < 0.5) audio.play('die'); break;
      case 'atk': if (Math.random() < 0.22) audio.play(ev.crit ? 'crit' : Math.random() < 0.5 ? 'hit' : 'shot'); break;
      case 'explode': audio.play('boom'); break;
      case 'pulse': if (ev.arena === me.team && Math.random() < 0.4) audio.play('pulse'); break;
      case 'end': this.showEnd(m); break;
    }
  }
  private partnerPid() { const me = this.me!; return me.team * 2 + (1 - me.slot); }

  private flashLeak() {
    const n = this.me?.leakedThisWave ?? 0;
    if (n === 1 || n % 5 === 0) this.toast(tr('⚠️ FUITE ! Des ennemis filent vers le Core'), 'error');
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
      this.banner(tr('VAGUE {0}', m.wave), w.boss ? `⚠ ${w.name}` : w.name, w.boss);
      if (ev) setTimeout(() => this.banner(`✦ ${ev.name}`, ev.text, false, 'event'), 1900);
      if (w.boss) audio.play('boss');
      this.selected = null;
      this.bossIds.clear();
      this.blessMin = false;
    } else if (m.phase === 'combat') {
      audio.setMood(w.boss ? 'boss' : lowCore ? 'danger' : 'combat');
      audio.play('combat');
      if (this.sheet !== 'raiders' && this.sheet !== 'opp') this.closeSheet();
      this.cancelPlacement();
      this.tutorial?.on('combat');
    } else if (m.phase === 'resolution') {
      if (me.leakedThisWave === 0) this.toast(tr('✔ Voie tenue ! Bonus de rapidité en route…'), 'info');
      this.tutorial?.on('resolution');
    } else if (m.phase === 'ended') {
      this.showEnd(m);
    }
  }

  // ------------------------------------------------------------------ feedback
  toast(text: string, kind: 'error' | 'info' | 'ping' = 'info') {
    // the same message twice in a row replaces the previous one instead of stacking
    for (const old of Array.from(this.els.toasts.children)) if (old.textContent === text) old.remove();
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
    const b = h('div', { class: 'bossalert' }, h('div', { class: 'ba-top' }, tr('⚠ BOSS ⚠')), h('b', {}, name), h('small', {}, mech));
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
    if (fusable) lines.push(tr('<b class="fz">✨ Lâcher pour FUSIONNER → {0}</b>', '★'.repeat(dragged!.level + 1)));
    else if (occupant) lines.push(tr('<b class="bad">Case occupée</b>'));
    if (syn.length) lines.push(syn.map(s => tr('<span class="syn">{0}</span>', SYNERGIES[s].name)).join(' '));
    if (rune) lines.push(tr('<span class="rune" style="color:{0}">{1} : {2}</span>', hex(RUNES[rune.kind].color), RUNES[rune.kind].name, RUNES[rune.kind].text));
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
        else if (g && !g.valid) { this.toast(this.me!.gold < UNITS[id].cost ? tr('Pas assez d\'or.') : tr('Case occupée.'), 'error'); audio.play('error'); }
        this.cancelPlacement();
        this.gesture = 'none';
      } else if (e.type === 'pointerup') {
        audio.play('click');
        this.selCard = this.selCard === id ? null : id;
        if (this.selCard) this.toast(tr('Touche une case de ta voie pour placer l\'unité'), 'info');
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
      this.toast(tr('Choisis la spécialisation de la fusion'), 'info');
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
    if (this.pendingOrder && m.phase === 'combat') { this.sendOrder(this.pendingOrder.id, p.x, p.z - me.team * ARENA_GAP); return; }
    if (this.selCard && m.phase === 'build') {
      const c = Renderer.cellAt(me.slot, me.team, p.x, p.z);
      if (c) {
        if (me.builds.some(b => b.col === c.col && b.row === c.row)) { this.toast(tr('Case occupée.'), 'error'); return; }
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
    const title = (t: string) => h('h3', {}, t, h('button', { class: 'x', 'aria-label': tr('Fermer'), onclick: () => this.closeSheet() }, '✕'));
    switch (this.sheet) {
      case 'raiders': this.renderAttack(S, title, m, me); break;
      case 'core': {
        this.renderBastion(S, title, m, me);
        S.append(h('div', { class: 'sect' }, tr('Pouvoirs de commandant — {0}', FACTIONS[me.faction].name)));
        FACTION_POWERS[me.faction].forEach((d, slot) => {
          const lv = me.powerLv[slot];
          const unlock = powerUnlock(d, m.settings.totalWaves);
          const locked = m.wave < unlock;
          const cost = POWER_UP_COST[lv + 1];
          S.append(h('button', { class: 'opt', disabled: locked || lv >= POWER_MAX_LEVEL || me.ether < cost, onclick: () => this.cmd({ c: 'powerUp', slot }) },
            h('div', { html: icon(d.icon, 26, '#FFC233') }),
            h('div', { class: 't' }, h('b', { html: `${d.name} ${stars(lv, POWER_MAX_LEVEL)}` }), h('br'), d.text, h('br'), h('small', { class: 'muted' }, locked ? tr('Débloqué à la vague {0}', unlock) : tr('Recharge {0} s · niveau suivant : effet +45 %, recharge -12 %', Math.round(d.cooldown * POWER_LEVEL_CD[lv])))),
            h('div', { class: 'p e' }, lv >= POWER_MAX_LEVEL ? tr('MAX') : `${cost}✨`)));
        });
        break;
      }
      case 'stats': {
        S.append(title(tr('📊 Statistiques')));
        const g = h('div', { class: 'stats-grid' });
        const team = m.players.filter(p => p.team === me.team);
        g.append(h('b', {}, ''), ...team.map(p => h('b', { style: 'text-align:right' }, tr(p.name).slice(0, 10))));
        const rows: [string, (p: PlayerView) => string][] = [
          [tr('Armée'), p => FACTIONS[p.faction].name], [tr('Dégâts'), p => fmt(p.stats.dmgDealt)], [tr('Éliminations'), p => fmt(p.stats.kills)], [tr('Dégâts tankés'), p => fmt(p.stats.dmgTanked)],
          [tr('Or gagné'), p => fmt(p.stats.goldEarned)], [tr('Éther produit'), p => fmt(p.stats.etherProduced)], [tr('Travailleurs'), p => String(p.workers)], [tr('Revenu'), p => String(p.income)],
          [tr('Envois'), p => String(p.stats.raidersSent)], [tr('Améliorations'), p => String(p.stats.upgrades)], [tr('Fusions'), p => String(p.stats.fusions)], [tr('Pouvoirs'), p => String(p.stats.casts)],
          [tr('Fuites'), p => String(p.stats.leaks)], [tr('DPS max'), p => fmt(p.stats.maxDps)], [tr('Bonus'), p => p.powers.map(x => POWERS.find(y => y.id === x)?.icon).join(' ') || '—'],
        ];
        for (const [l, f] of rows) g.append(h('span', { class: 'muted' }, l), ...team.map(p => h('span', { style: 'text-align:right' }, f(p))));
        S.append(g);
        S.append(h('div', { style: 'margin-top:8px;font-size:12px' }, h('b', {}, tr('Matrice ATT/DEF')), this.matrixTable()));
        break;
      }
      case 'pings': {
        S.append(title(tr('💬 Message au partenaire')));
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
          S.append(h('div', { class: 'sect' }, tr('Spécialisations au niveau {0}', BRANCH_LEVEL)));
          u.branches.forEach((b, i) => S.append(h('div', { class: 'branch' }, h('b', {}, `${i ? 'B' : 'A'} — ${b.name}`), h('br'), b.text)));
        }
        break;
      }
      case 'opp': this.renderOpp(S, title, m); break;
      case 'reso': this.renderResoSheet(S, title, m, me); break;
      case 'rift': this.renderRiftSheet(S, title, m, me); break;
      case 'fusion': this.renderFusionSheet(S, title, m, me); break;
      case 'bless': this.renderBlessSheet(S, title, m, me); break;
      case 'syn': {
        S.append(title(tr('🤝 Synergies & placement')));
        const bb = buildBonuses(me.builds, me.runes ?? []);
        const active = new Map<string, number>();
        for (const b of bb.values()) for (const s of b.syn) active.set(s, (active.get(s) ?? 0) + 1);
        S.append(h('p', { class: 'muted small' }, tr('Les unités VOISINES (8 cases autour) se renforcent. Les cases runiques et les zones donnent aussi des bonus.')));
        for (const s of Object.values(SYNERGIES)) {
          const n = active.get(s.id) ?? 0;
          S.append(h('div', { class: `synrow${n ? ' on' : ''}` }, h('span', { html: icon(s.icon, 18, n ? '#7DFFB0' : '#8a84a0') }), h('div', {}, h('b', {}, s.name), n ? ` ×${n}` : '', h('br'), h('small', {}, s.text))));
        }
        S.append(h('div', { class: 'sect' }, tr('Zones')), h('div', { class: 'small' }, ZONE_TEXT.front, h('br'), ZONE_TEXT.back));
        S.append(h('div', { class: 'sect' }, tr('Cases runiques de ta voie')), h('div', { class: 'small' }, ...(me.runes ?? []).flatMap(r => [h('span', { style: `color:${hex(RUNES[r.kind].color)}` }, `${RUNES[r.kind].name} : ${RUNES[r.kind].text}`), h('br')])));
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
    const delta = (a: number, b?: number, f = (x: number) => fmt(x)) => b === undefined || Math.abs(b - a) < 0.01 ? '' : tr('<em>→ {0}</em>', f(b));
    const eff = (Object.keys(DEFENSE_NAMES) as DefenseType[]).map(d => `${DEFENSE_ICONS[d]}${matrixArrow(DAMAGE_MATRIX[s.attack][d])}`).join(' ');
    const range = (x: number) => x < 2 ? tr('mêlée') : `${x.toFixed(1)} m`;
    const grid = h('div', { class: 'ustats', html: [
      tr('<span>❤️ PV</span><b>{0} {1}</b>', fmt(s.hp), delta(s.hp, n?.hp)),
      tr('<span>🛡 Armure</span><b>{0} % {1}</b>', Math.round(s.armor * 100), delta(s.armor * 100, n ? n.armor * 100 : undefined, x => Math.round(x) + ' %')),
      tr('<span>⚔️ Dégâts</span><b>{0} {1}</b>', fmt(s.dmg), delta(s.dmg, n?.dmg)),
      tr('<span>⏱ Cadence</span><b>{0}/s {1}</b>', s.atkSpeed.toFixed(2), delta(s.atkSpeed, n?.atkSpeed, x => x.toFixed(2) + '/s')),
      tr('<span>🔥 DPS</span><b>{0} {1}</b>', fmt(s.dmg * s.atkSpeed), delta(s.dmg * s.atkSpeed, n ? n.dmg * n.atkSpeed : undefined)),
      tr('<span>🎯 Portée</span><b>{0}{1}</b>', range(s.range), s.tower ? tr(' (tour)') : ''),
      tr('<span>Attaque</span><b>{0} {1}</b>', ATTACK_ICONS[s.attack], ATTACK_NAMES[s.attack]),
      tr('<span>Défense</span><b>{0} {1}</b>', DEFENSE_ICONS[s.defense], DEFENSE_NAMES[s.defense]),
    ].join('') });
    const abil = h('div', { class: 'abil small' }, h('span', { class: 'muted' }, tr('Efficacité : {0}', eff)), h('br'),
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
      if (bb.zoneActive) tags.push(bb.zone === 'front' ? tr('Première ligne +15 % PV') : tr('Arrière +0,6 m'));
      if (bb.rune) tags.push(`${RUNES[bb.rune].name} ${RUNES[bb.rune].text}`);
      for (const s of bb.syn) tags.push(SYNERGIES[s].name);
      if (tags.length) S.append(h('div', { class: 'tags' }, ...tags.map(t => h('span', {}, t))));
    }
    if (b.fused) S.append(h('div', { class: 'tags fz' }, h('span', {}, tr('✦ Éclat de fusion ×{0} : +{1} % PV et dégâts', Math.min(3, b.fused), Math.round(FUSION_BONUS * 100 * Math.min(3, b.fused))))));
    S.append(h('div', { class: 'muted small', style: 'margin:4px 0' }, tr('Valeur {0} 🪙 · dégâts infligés {1} · absorbés {2}', fmt(b.value), fmt(b.dmgTotal), fmt(b.tanked))));
    if (m.phase !== 'build') { S.append(h('div', { class: 'muted small' }, tr('Améliorations possibles pendant la préparation.'))); return; }
    if (this.riftActive(m) && !u.tower) {
      const assigned = me.builds.filter(x => x.rift).length;
      S.append(h('button', { class: `opt rift${b.rift ? ' on' : ''}`, disabled: !b.rift && assigned >= RIFT_MAX_UNITS, onclick: () => this.cmd({ c: 'rift', bid: b.bid, on: !b.rift }) },
        h('div', { html: icon('portal', 24, '#C8A0FF', 2.4) }),
        h('div', { class: 't' }, h('b', {}, b.rift ? tr('Affectée à la Faille ✓ (retirer)') : tr('Affecter à la Faille secondaire')), h('br'), tr('Elle quittera ta voie pour fermer la Faille ({0}/{1}).', assigned, RIFT_MAX_UNITS))));
    }
    const twin = me.builds.find(o => o.bid !== b.bid && o.defId === b.defId && o.level === b.level && o.branch === b.branch);
    const fuseWith = this.pendingFuse ?? twin?.bid ?? null;
    // level-up / specialisation
    const anom = this.anomalyOf(m);
    if (next === BRANCH_LEVEL && u.branches) {
      const cost = levelPrice(b.defId, next, me.faction, anom);
      S.append(h('div', { class: 'sect' }, fuseWith !== null && this.pendingFuse !== null ? tr('Fusion : choisis la spécialisation (définitive)') : tr('Spécialisation — niveau {0} (définitive)', BRANCH_LEVEL)));
      const row = h('div', { class: 'branches' });
      (['A', 'B'] as Branch[]).forEach((br, i) => {
        const bd = u.branches![i];
        const s4 = unitStats(b.defId, BRANCH_LEVEL, br);
        row.append(h('div', { class: 'bcard' },
          h('b', {}, bd.name), h('small', {}, bd.text),
          h('div', { class: 'small muted' }, tr('PV {0} · DPS {1} · {2}', fmt(s4.hp), fmt(s4.dmg * s4.atkSpeed), s4.range < 2 ? tr('mêlée') : s4.range.toFixed(1) + ' m')),
          h('button', { class: 'btn small gold', disabled: me.gold < cost, onclick: () => { this.cmd({ c: 'upgrade', bid: b.bid, branch: br }); } }, `${icon('up', 14, '#3a2400', 3)} ${cost} 🪙`),
          fuseWith !== null ? h('button', { class: 'btn small', onclick: () => { this.cmd({ c: 'fuse', bid: b.bid, with: fuseWith, branch: br }); this.pendingFuse = null; } }, tr('✨ Fusionner')) : null));
      });
      S.append(row);
    } else if (next) {
      const cost = levelPrice(b.defId, next, me.faction, anom);
      S.append(h('button', { class: 'opt up', disabled: me.gold < cost, onclick: () => { this.cmd({ c: 'upgrade', bid: b.bid }); } },
        h('div', { html: icon('up', 26, '#FFC233', 3) }),
        h('div', { class: 't' }, h('b', { html: tr('Améliorer → {0}', stars(next)) }), h('br'), next === 5 ? tr('Unité d\'élite : couronne et runes.') : next === 3 ? tr('Armure supplémentaire, +stats.') : tr('Meilleure arme, +stats.')),
        h('div', { class: 'p g' }, `${cost}🪙`)));
    } else S.append(h('div', { class: 'muted small' }, tr('★★★★★ Niveau maximum atteint.')));
    if (fuseWith !== null && next && next !== BRANCH_LEVEL) {
      const extra = Math.max(0, b.value + (me.builds.find(o => o.bid === fuseWith)?.value ?? 0) - unitValueAt(b.defId, next));
      S.append(h('button', { class: 'opt', onclick: () => { this.cmd({ c: 'fuse', bid: b.bid, with: fuseWith }); } },
        h('div', { html: icon('merge', 26, '#C8A0FF', 2.6) }),
        h('div', { class: 't' }, h('b', { html: tr('Fusionner avec l\'autre {0} → {1}', esc(u.name), stars(next)) }), h('br'), tr('Gratuit{0}, libère une case et ajoute un Éclat de fusion (+{1} % PV et dégâts).', extra ? tr(', rembourse {0} 🪙', extra) : '', Math.round(FUSION_BONUS * 100))),
        h('div', { class: 'p' }, tr('GRATUIT'))));
    }
    S.append(h('button', { class: 'opt', onclick: () => { this.cmd({ c: 'sell', bid: b.bid }); this.closeSheet(); } },
      h('div', { html: icon('sell', 24, '#FFD27A') }), h('div', { class: 't' }, h('b', {}, tr('Vendre')), h('br'), b.placedWave === m.wave ? tr('Remboursement total (placée cette vague)') : tr('50 % remboursés')), h('div', { class: 'p g' }, `+${refund}🪙`)));
    S.append(h('div', { class: 'muted small' }, tr('Astuce : glisse une unité pour la déplacer, ou sur une unité identique pour la fusionner.')));
  }

  private renderAttack(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    if (m.settings.mode === 'survival') {
      S.append(title(tr('📈 Investir')), h('p', { class: 'muted small' }, tr('Mode Survie : pas d\'adversaire. Convertis ton Éther en revenu permanent.')));
      S.append(h('button', { class: 'opt', disabled: me.ether < ECONOMY.investChunk, onclick: () => this.cmd({ c: 'invest' }) },
        h('div', { class: 't' }, h('b', {}, tr('Investissement')), h('br'), tr('+{0} revenu par vague', Math.round(ECONOMY.investChunk * ECONOMY.investRatio))),
        h('div', { class: 'p e' }, `${ECONOMY.investChunk}✨`)));
      return;
    }
    const opp = this.opponents(m);
    if (this.target === null || !opp.some(o => o.pid === this.target)) this.target = (opp.find(o => o.slot === me.slot) ?? opp[0]).pid;
    S.append(title(tr('⚔️ Attaquer l\'adversaire')));
    const tabs = h('div', { class: 'seg' },
      h('button', { class: this.raiderTab === 'sends' ? 'on' : '', onclick: () => { this.raiderTab = 'sends'; this.renderSheet(); } }, tr('Envois {0}/{1}', me.raiderQueue.length, sendCap(m.wave))),
      h('button', { class: this.raiderTab === 'curses' ? 'on' : '', onclick: () => { this.raiderTab = 'curses'; this.renderSheet(); } }, tr('Malédictions {0}/1', me.curseQueue.length)));
    const tgt = h('div', { class: 'targets' }, h('span', { class: 'muted small' }, tr('Cible :')), ...opp.map(o => h('button', { class: `tgt${this.target === o.pid ? ' on' : ''}`, onclick: () => { this.target = o.pid; this.renderSheet(); } },
      h('b', {}, tr(o.name)), h('small', {}, tr('{0} · armée {1}', FACTIONS[o.faction].title, powerBucket(o.builds.reduce((t, b) => t + b.value, 0)))))));
    S.append(tabs, tgt);
    const tw = m.settings.totalWaves;
    if (this.raiderTab === 'sends') {
      S.append(h('p', { class: 'muted small' }, tr('Ils attaquent la voie ciblée à la prochaine vague. Chaque envoi augmente ton REVENU. Prix +30 % par copie dans la même vague.')));
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
            locked ? tr('🔒 Vague {0}', unlock) : cd ? tr('⏳ Recharge jusqu\'à la vague {0}', me.raiderCd[r.id]) : tr('{0} · {1} PV · +{2} revenu', units, fmt(hp), r.income), h('br'),
            h('small', { class: 'muted' }, r.description)),
          h('div', { class: 'p' }, h('span', { class: 'e' }, `${price.ether}✨`), price.gold ? h('span', { class: 'g' }, ` ${price.gold}🪙`) : null)));
      }
    } else {
      S.append(h('p', { class: 'muted small' }, tr('Effets courts appliqués à la prochaine vague de la voie ciblée. Une malédiction par vague.')));
      for (const c of CURSES) {
        const unlock = curseUnlock(c, tw);
        const locked = m.wave < unlock;
        const cd = (me.curseCd[c.id] ?? 0) > m.wave;
        S.append(h('button', { class: 'opt send curse', disabled: locked || cd || me.curseQueue.length >= 1 || me.ether < c.ether || me.gold < c.gold, onclick: () => this.cmd({ c: 'curse', curse: c.id, to: this.target! }) },
          h('div', { html: icon(c.icon, 24, '#C8A0FF') }),
          h('div', { class: 't' }, h('b', {}, c.name), h('br'), locked ? tr('🔒 Vague {0}', unlock) : cd ? tr('⏳ Recharge jusqu\'à la vague {0}', me.curseCd[c.id]) : c.text, h('br'), h('small', { class: 'muted' }, tr('Parade : {0}', c.counter))),
          h('div', { class: 'p' }, h('span', { class: 'e' }, `${c.ether}✨`), c.gold ? h('span', { class: 'g' }, ` ${c.gold}🪙`) : null)));
      }
    }
    if (me.raiderQueue.length || me.curseQueue.length) S.append(h('div', { class: 'muted small' }, tr('Préparé : {0}{1}', summarize(me.raiderQueue.map(q => RAIDERS.find(r => r.id === q.r)!.name)), me.curseQueue.length ? ' + ' + CURSES.find(c => c.id === me.curseQueue[0].r)!.name : '')));
  }

  private renderOpp(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView) {
    S.append(title(tr('👁 Adversaires')));
    const opp = this.opponents(m);
    if (!opp.length) { S.append(h('p', { class: 'muted' }, tr('Pas d\'adversaire dans ce mode.'))); return; }
    const et = m.teams[opp[0].team];
    S.append(h('div', { class: 'small' }, tr('Core adverse : {0} / {1} PV · vague {2}', fmt(et.hp), fmt(et.maxHp), m.wave)));
    const bosses = m.phase === 'combat' ? this.session.view.sample().filter(e => e.arena === opp[0].team && ENEMIES[e.defId]?.boss).map(e => ENEMIES[e.defId].name) : [];
    for (const o of opp) {
      const v = o.builds.reduce((t, b) => t + b.value, 0);
      const fx: string[] = [];
      if (m.phase === 'combat' && m.combatTime < o.fogUntil) fx.push(tr('Brouillard'));
      if (m.phase === 'combat' && m.combatTime < o.jamUntil) fx.push(tr('Pouvoirs brouillés'));
      if (o.powers.length) fx.push(o.powers.map(x => POWERS.find(y => y.id === x)?.name).join(', '));
      S.append(h('div', { class: 'oppcard', style: `--fc:${FACTIONS[o.faction].color}` },
        h('b', {}, `${o.name} — ${FACTIONS[o.faction].name}`), h('br'),
        h('span', { class: 'small' }, tr('Puissance d\'armée : {0} · {1} unités · niveau max {2}', powerBucket(v), o.builds.length, o.builds.reduce((t, b) => Math.max(t, b.level), 0) || '—')), h('br'),
        h('span', { class: 'small muted' }, tr('Envois cette partie : {0} ({1} ennemis) · malédictions : {2} · pouvoirs utilisés : {3}', o.stats.raidersSent, o.stats.sentUnits, o.stats.curses, o.stats.casts)), h('br'),
        h('span', { class: 'small' }, tr('Effets actifs : {0}', fx.join(' · ') || 'aucun'))));
    }
    if (bosses.length) S.append(h('div', { class: 'small', style: 'color:#FFC233' }, tr('👑 Boss en cours chez eux : {0}', bosses.join(', '))));
    S.append(h('button', { class: 'btn small', onclick: () => { this.r.focus(this.me!.slot, opp[0].team); this.closeSheet(); } }, tr('👁 Observer leur arène')));
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
    S.append(title(tr('⚙️ Menu')));
    if (this.session.role !== 'guest') {
      const seg = h('div', { class: 'seg' });
      for (const sp of [1, 2, 3]) seg.append(h('button', { class: m.speed === sp ? 'on' : '', onclick: () => { this.cmd({ c: 'speed', speed: sp }); this.renderSheet(); } }, `x${sp}`));
      S.append(h('div', { class: 'muted small', style: 'margin:4px 0' }, tr('Vitesse (commune)')), seg);
    } else S.append(h('div', { class: 'muted small' }, tr('Vitesse : x{0} (réglée par l\'hôte)', m.speed)));
    const me = this.me!;
    S.append(h('button', { class: 'opt', style: 'margin-top:8px', onclick: () => { this.cmd({ c: 'pause', value: !me.pauseVote }); this.closeSheet(); } },
      h('div', { html: icon('pause', 22) }), h('div', { class: 't' }, h('b', {}, me.pauseVote ? tr('Annuler la demande de pause') : this.session.role === 'solo' ? tr('Pause') : tr('Demander une pause')), h('br'), this.session.role === 'solo' ? '' : tr('La partie se met en pause quand l\'autre joueur accepte.'))));
    const other = m.players.find(p => !p.isAI && p.pid !== me.pid);
    if (other?.pauseVote && !me.pauseVote) S.append(h('button', { class: 'btn primary small', style: 'width:100%;margin-bottom:6px', onclick: () => { this.cmd({ c: 'pause', value: true }); this.closeSheet(); } }, tr('Accepter la pause de {0}', other.name)));
    const vol = (label: string, val: number, set: (v: number) => void) => {
      const inp = h('input', { type: 'range', min: 0, max: 100, value: Math.round(val * 100), style: 'width:100%' }) as HTMLInputElement;
      inp.oninput = () => set(Number(inp.value) / 100);
      return h('div', { class: 'small' }, label, inp);
    };
    S.append(vol(tr('🔊 Effets'), save.prefs.sfx, v => { save.prefs.sfx = v; audio.setVolumes(v, save.prefs.music); save.flush(); }));
    const segc = <T extends string | number>(label: string, opts: [T, string][], cur: T, set: (v: T) => void) => {
      const g = h('div', { class: 'seg' });
      for (const [v, l] of opts) g.append(h('button', { class: v === cur ? 'on' : '', onclick: () => { set(v); save.flush(); this.renderSheet(); } }, l));
      return h('div', { class: 'small', style: 'margin:4px 0' }, label, g);
    };
    S.append(segc(tr('🎥 Secousses'), [[1, tr('Normales')], [0.4, tr('Réduites')], [0, tr('Aucune')]], save.prefs.shake ?? 1, v => (save.prefs.shake = v)));
    S.append(segc(tr('⚡ Flashs'), [['on', tr('Oui')], ['off', tr('Non')]], save.prefs.flash === false ? 'off' : 'on', v => (save.prefs.flash = v === 'on')));
    S.append(segc(tr('📳 Vibrations'), [['on', tr('Oui')], ['off', tr('Non')]], save.prefs.vibrate ? 'on' : 'off', v => (save.prefs.vibrate = v === 'on')));
    S.append(vol(tr('🎵 Musique'), save.prefs.music, v => { save.prefs.music = v; audio.setVolumes(save.prefs.sfx, v); save.flush(); }));
    S.append(h('button', { class: 'opt', onclick: () => this.openSheet('stats') }, h('div', { html: icon('stats', 22) }), h('div', { class: 't' }, h('b', {}, tr('Statistiques & matrice ATT/DEF')))));
    S.append(h('div', { class: 'row', style: 'gap:6px;margin:6px 0' },
      h('button', { class: 'btn small', style: 'flex:1', onclick: () => this.r.rotate(-0.2) }, '⟲'),
      h('button', { class: 'btn small', style: 'flex:2', onclick: () => { this.r.focus(this.me!.slot, this.me!.team); this.closeSheet(); } }, tr('🎯 Recentrer')),
      h('button', { class: 'btn small', style: 'flex:1', onclick: () => this.r.rotate(0.2) }, '⟳')));
    if (m.teams.length > 1) S.append(h('button', { class: 'opt', onclick: () => this.openSheet('opp') }, h('div', { html: icon('eye', 22) }), h('div', { class: 't' }, h('b', {}, tr('Adversaires & leur arène')))));
    const quitLabel = h('b', {}, tr('Quitter la partie'));
    let armed = false;
    S.append(h('button', { class: 'opt', onclick: () => {
      if (armed) { this.cb.exit(); return; }
      armed = true; quitLabel.textContent = tr('Touche encore pour quitter'); quitLabel.style.color = 'var(--bad)';
      setTimeout(() => { armed = false; quitLabel.textContent = tr('Quitter la partie'); quitLabel.style.color = ''; }, 3000);
    } }, h('div', { style: 'font-size:22px' }, '🚪'), h('div', { class: 't' }, quitLabel)));
    S.append(h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, tr('Partie {0} · {1} · {2}{3}', this.session.code, this.session.role === 'host' ? tr('hôte') : this.session.role === 'guest' ? tr('invité') : 'solo', FACTIONS[me.faction].name, me.randomFaction ? tr(' (aléatoire)') : '')));
  }

  private showPowerChoice(choice: string[]) {
    const modal = h('div', { class: 'screen transparent power-modal' },
      h('h2', { style: 'margin:0 0 4px' }, tr('✨ Choisis un BONUS')),
      h('p', { class: 'muted', style: 'margin:0 0 10px' }, tr('Il modifie ta stratégie jusqu\'à la fin de la partie.')),
      h('div', { class: 'menu row' }, ...choice.map(id => {
        const p = POWERS.find(x => x.id === id)!;
        return h('button', { class: 'opt', style: 'width:min(220px,30vw);flex-direction:column;text-align:center;min-height:120px', onclick: () => { this.cmd({ c: 'power', power: id }); modal.remove(); audio.play('upgrade'); } },
          h('div', { style: 'font-size:34px' }, p.icon), h('b', {}, p.name), h('div', { class: 't', style: 'text-align:center' }, p.description));
      })));
    this.root.append(modal);
  }

  // ------------------------------------------------------------------ v0.4: Résonance, orders, Bastion, rifts, anomalies
  private anomalyOf(m: MetaView): AnomalyId | null {
    const a = m.teams[this.me!.team]?.anomaly;
    return a && m.wave <= a.until ? a.id : null;
  }
  private riftActive(m: MetaView) { return m.phase === 'build' && (!!m.rift || this.anomalyOf(m) === 'contrat'); }
  private haptic(p: number | number[]) { if (save.prefs.vibrate) vibrate(p); }
  private flashScreen(color: string) {
    if (save.prefs.flash === false) return;
    const f = this.els.flash;
    f.style.background = color;
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  /** Shared gauge, always visible: what fills it is cooperation, never time. */
  private renderReso(m: MetaView, me: PlayerView) {
    const E = this.els;
    const t = m.teams[me.team];
    const ab = duoAbility(me.faction, this.partner(m).faction);
    const full = t.reso >= RESO_MAX;
    const key = `${Math.floor(t.reso)}|${t.resoCast ? t.resoCast.by + ':' + t.resoCast.sync : ''}|${ab.id}`;
    if (E.reso.dataset.k === key) return;
    E.reso.dataset.k = key;
    E.reso.className = `pill small reso${full ? ' full' : ''}${t.resoCast ? ' cast' : ''}`;
    E.reso.style.setProperty('--c1', hex(ab.color));
    E.reso.style.setProperty('--c2', hex(ab.color2));
    const label = t.resoCast ? (t.resoCast.sync ? tr('SYNCHRO !') : tr('RÉSONANCE…')) : full ? tr('DUO PRÊTE') : tr('Résonance');
    E.reso.innerHTML = tr('{0}<span class="rn">{1}</span><span class="rbar"><i style="width:{2}%"></i></span><b>{3}</b>', icon('duo', 16, full ? '#FFF6C0' : '#C8A0FF', 2.6), label, Math.min(100, (t.reso / RESO_MAX) * 100), Math.floor(t.reso));
  }

  private fusionPairs(me: PlayerView): [Build, Build][] {
    const out: [Build, Build][] = [];
    const used = new Set<number>();
    for (const a of me.builds) for (const b of me.builds) {
      if (a.bid >= b.bid || used.has(a.bid) || used.has(b.bid)) continue;
      if (a.defId === b.defId && a.level === b.level && a.branch === b.branch && a.level < MAX_LEVEL) { out.push([a, b]); used.add(a.bid); used.add(b.bid); }
    }
    return out;
  }

  /** Build-phase chips: fusions available, secondary rift, anomaly to choose. */
  private renderChips(m: MetaView, me: PlayerView) {
    const E = this.els;
    const build = m.phase === 'build';
    const pairs = build ? this.fusionPairs(me) : [];
    E.fuseChip.style.display = pairs.length ? '' : 'none';
    if (pairs.length) { const k = String(pairs.length); if (E.fuseChip.dataset.k !== k) { E.fuseChip.dataset.k = k; E.fuseChip.innerHTML = tr('{0}<span>Fusion ×{1}</span>', icon('merge', 16, '#E8C8FF', 2.6), pairs.length); } }
    const rift = this.riftActive(m);
    E.riftChip.style.display = rift ? '' : 'none';
    if (rift) {
      const n = me.builds.filter(b => b.rift).length;
      const reward = m.rift?.reward ?? 'gold';
      const k = `${n}|${reward}|${m.wave}`;
      if (E.riftChip.dataset.k !== k) {
        E.riftChip.dataset.k = k;
        E.riftChip.className = `pill small riftchip${n ? ' on' : ''}`;
        E.riftChip.innerHTML = tr('{0}<span>Faille : {1} · {2}/{3}</span>', icon('portal', 16, '#E0B0FF', 2.6), RIFT_REWARDS[reward].name, n, RIFT_MAX_UNITS);
      }
    }
    const offer = build ? m.teams[me.team].anomalyOffer : null;
    E.anomChip.style.display = offer && this.anomalyMin ? '' : 'none';
    if (offer && this.anomalyMin) E.anomChip.innerHTML = `${icon('sparkle', 16, '#FFE08A', 2.6)}<span>${me.anomalyVote ? tr('Anomalie votée') : tr('Anomalie à choisir !')}</span>`;
    // v0.7: blessing draft (minimised) + owned blessings
    const t = m.teams[me.team];
    const bo = build ? t.blessingOffer : null;
    E.blessChip.style.display = bo && this.blessMin ? '' : 'none';
    if (bo && this.blessMin) {
      const mine = bo.picker === me.pid;
      const k = `${mine}|${bo.picker}`;
      if (E.blessChip.dataset.k !== k) { E.blessChip.dataset.k = k; E.blessChip.innerHTML = `${icon('sparkle', 16, '#FFE08A', 2.6)}<span>${mine ? tr('Bénédiction à choisir !') : tr('{0} choisit…', esc(m.players[bo.picker]?.name ?? tr('Partenaire')))}</span>`; }
    }
    const nb = t.blessings.length;
    E.blessList.style.display = nb ? '' : 'none';
    if (nb && E.blessList.dataset.k !== String(nb)) { E.blessList.dataset.k = String(nb); E.blessList.innerHTML = tr('{0}<span>Bénédictions ×{1}</span>', icon('star', 16, '#FFE08A', 2.6), nb); }
  }

  /** Combat bar extras: tactical orders and the DUO button. */
  private renderCombatExtra(me: PlayerView, m: MetaView) {
    const E = this.els;
    const t = m.teams[me.team];
    const cdLeft = Math.max(0, me.orderCd - m.combatTime);
    const ok = me.orders > 0 && cdLeft <= 0 && m.ending <= 0;
    const ok2 = `${me.orders}|${Math.ceil(cdLeft)}|${this.orderOpen}`;
    if (E.ordersBtn.dataset.k !== ok2) {
      E.ordersBtn.dataset.k = ok2;
      E.ordersBtn.className = `obtn${ok ? '' : ' off'}${this.orderOpen ? ' open' : ''}`;
      E.ordersBtn.innerHTML = `${icon('flag', 24, '#FFE08A', 2.4)}<b>ORDRES</b><small>${'●'.repeat(me.orders)}${'○'.repeat(Math.max(0, 2 - me.orders))}${cdLeft > 0 ? ` ${Math.ceil(cdLeft)}s` : ''}</small>`;
    }
    // v0.7 twin seals: shown while a sealed boss is alive; "SCEAU !" (urgent) when the partner just armed theirs
    const seal = t.seal;
    const sealOn = !!seal && !seal.broken;
    E.seal.style.display = sealOn ? '' : 'none';
    if (sealOn) {
      const mineLeft = SEAL_WINDOW - (m.combatTime - seal!.armed[me.slot]);
      const partnerLeft = SEAL_WINDOW - (m.combatTime - seal!.armed[1 - me.slot]);
      const mine = mineLeft > 0, partner = partnerLeft > 0;
      const label = partner && !mine ? tr('SCEAU !') : mine ? tr('ACTIVÉ') : tr('SCEAU');
      const sub = partner && !mine ? tr('{0} s pour répondre', Math.ceil(partnerLeft)) : mine ? tr('à ton partenaire ({0} s)', Math.ceil(mineLeft)) : tr('brise le bouclier à deux');
      const k = `${label}|${sub}`;
      if (E.seal.dataset.k !== k) {
        E.seal.dataset.k = k;
        E.seal.className = `sealbtn${partner && !mine ? ' is-urgent' : mine ? ' is-armed' : ''}`;
        E.seal.innerHTML = `${icon('rune', 26, '#FFFFFF', 2.4)}<b>${label}</b><small>${sub}</small>`;
      }
      (E.seal as HTMLButtonElement).disabled = mine;
    }
    const cast = t.resoCast;
    const canSync = !!cast && cast.by !== me.pid && !cast.sync;
    const show = t.reso >= RESO_MAX || !!cast;
    E.duo.style.display = show ? '' : 'none';
    if (show) {
      const ab = duoAbility(me.faction, this.partner(m).faction);
      const label = canSync ? tr('SYNCHRO !') : cast ? (cast.sync ? tr('SYNCHRO ✓') : tr('EN COURS')) : tr('DUO');
      const k = `${label}|${ab.id}`;
      if (E.duo.dataset.k !== k) {
        E.duo.dataset.k = k;
        E.duo.className = `duobtn${canSync ? ' is-sync' : cast ? ' is-busy' : ' is-ready'}`;
        E.duo.style.setProperty('--c1', hex(ab.color)); E.duo.style.setProperty('--c2', hex(ab.color2));
        E.duo.innerHTML = `${icon('duo', 30, '#FFFFFF', 2.6)}<b>${label}</b><small>${ab.name}</small>`;
      }
      (E.duo as HTMLButtonElement).disabled = !!cast && !canSync;
    }
  }

  private renderOrders() {
    const E = this.els, me = this.me, m = this.meta;
    E.orderStrip.style.display = this.orderOpen && m?.phase === 'combat' ? '' : 'none';
    if (!this.orderOpen || !me || !m) return;
    clear(E.orderStrip);
    for (const id of ORDER_IDS) {
      const o = ORDERS[id];
      const b = h('button', { class: `ochip${this.pendingOrder?.id === id ? ' sel' : ''}`, 'aria-label': o.name, onclick: () => this.selectOrder(id) },
        h('span', { html: icon(o.icon, 22, '#FFE08A', 2.4) }), h('b', {}, o.name));
      let lp: number | null = null;
      b.onpointerdown = () => { lp = window.setTimeout(() => { this.toast(`${o.name} : ${o.text}`, 'info'); lp = null; }, 450); };
      b.onpointerup = b.onpointercancel = () => { if (lp) clearTimeout(lp); };
      E.orderStrip.append(b);
    }
  }
  /** Targeted orders wait for a tap on the battlefield (2.5 s), otherwise they pick the best target themselves. */
  private selectOrder(id: OrderId) {
    const me = this.me;
    if (!me) return;
    if (me.orders <= 0) { this.toast(tr('Plus de charge d\'ordre pour cette vague.'), 'error'); audio.play('error'); return; }
    if (this.pendingOrder) clearTimeout(this.pendingOrder.timer);
    this.pendingOrder = null;
    if (!ORDERS[id].target) { this.sendOrder(id); return; }
    const timer = window.setTimeout(() => { if (this.pendingOrder?.id === id) this.sendOrder(id); }, 2500);
    this.pendingOrder = { id, until: performance.now() + 2500, timer };
    this.toast(id === 'focus' ? tr('🎯 Touche l\'ennemi à abattre (sinon : le plus dangereux)') : tr('🚩 Touche la zone à tenir (sinon : là où ça chauffe)'), 'info');
    this.renderOrders();
  }
  private sendOrder(id: OrderId, x?: number, z?: number) {
    if (this.pendingOrder) clearTimeout(this.pendingOrder.timer);
    this.pendingOrder = null;
    if (this.cmd({ c: 'order', order: id, x, z })) { this.haptic(25); this.orderOpen = false; }
    this.renderOrders();
  }

  /** Anomaly choice (risk / reward) before key waves — a joint choice in co-op. */
  private renderAnomaly(m: MetaView, me: PlayerView) {
    const E = this.els;
    const offer = m.phase === 'build' ? m.teams[me.team].anomalyOffer : null;
    const partner = this.partner(m);
    const key = offer && !this.anomalyMin ? `${offer.join()}|${me.anomalyVote}|${partner.anomalyVote}|${partner.isAI}` : '';
    if (!key) { E.anomaly.style.display = 'none'; E.anomaly.dataset.k = ''; return; }
    if (E.anomaly.dataset.k === key) return;
    E.anomaly.dataset.k = key;
    E.anomaly.style.display = '';
    clear(E.anomaly);
    const humanPartner = !partner.isAI;
    E.anomaly.append(h('div', { class: 'an-head' },
      h('b', {}, tr('✦ ANOMALIE — 3 vagues')),
      h('span', { class: 'muted small' }, humanPartner ? tr('Choisissez ensemble (en cas de désaccord, le hasard tranche)') : tr('Ton choix vaut pour l\'équipe')),
      h('button', { class: 'x', 'aria-label': tr('Réduire'), onclick: () => { this.anomalyMin = true; E.anomaly.dataset.k = ''; this.renderAnomaly(m, me); } }, '▾')));
    const row = h('div', { class: 'an-row' });
    for (const id of offer!) {
      const a = ANOMALIES[id];
      const votes = [me.anomalyVote === id ? 'toi' : '', humanPartner && partner.anomalyVote === id ? partner.name : ''].filter(Boolean);
      row.append(h('button', { class: `an-card${me.anomalyVote === id ? ' on' : ''}`, onclick: () => { if (this.cmd({ c: 'anomaly', id })) { audio.play('click'); this.haptic(20); if (partner.isAI || partner.anomalyVote) this.anomalyMin = true; } } },
        h('div', { class: 'an-ic', html: icon(a.icon, 22, '#FFE08A', 2.4) }),
        h('b', {}, a.name),
        h('span', { class: 'good' }, '+ ', a.id === 'fortune' ? a.good.replace('X', String(60 + m.wave * 12)) : a.good),
        h('span', { class: 'bad' }, '− ', a.bad),
        votes.length ? h('small', { class: 'votes' }, '✓ ' + votes.join(' + ')) : null));
    }
    E.anomaly.append(row);
  }

  /** Module proposal waiting for the partner (or for us). Auto-accepted after PROPOSAL_TIMEOUT. */
  private renderProposal(m: MetaView, me: PlayerView) {
    const E = this.els;
    const pr = m.teams[me.team].proposal;
    if (!pr) { if (E.proposal.style.display !== 'none') { E.proposal.style.display = 'none'; E.proposal.dataset.k = ''; } return; }
    const left = Math.max(0, PROPOSAL_TIMEOUT - (m.time - pr.at));
    const d = MODULES[pr.module];
    const mine = pr.by === me.pid;
    const proposer = m.players[pr.by];
    const key = `${pr.by}|${pr.module}|${pr.action}|${Math.ceil(left)}`;
    if (E.proposal.dataset.k === key) return;
    E.proposal.dataset.k = key;
    E.proposal.style.display = '';
    clear(E.proposal);
    const act = pr.action === 'install' ? 'installer' : pr.action === 'upgrade' ? tr('améliorer') : tr('démonter');
    const half = Math.floor(pr.cost / 2);
    E.proposal.append(
      h('div', { class: 'pp-t', html: `${icon('core', 18, '#9FE9FF', 2.4)}<span>${mine ? tr('Proposé : <b>{0} {1}</b> — en attente de {2}', act, esc(d.name), esc(this.partner(m).name)) : `${esc(proposer.name)} propose de <b>${act} ${esc(d.name)}</b>${pr.cost ? ` (${pr.cost} ✨)` : ''}`}</span>` }),
      h('div', { class: 'pp-bar' }, h('i', { style: `width:${(left / PROPOSAL_TIMEOUT) * 100}%` })),
      h('div', { class: 'pp-b' },
        mine ? h('button', { class: 'btn small', onclick: () => this.cmd({ c: 'moduleVote', accept: false }) }, tr('Annuler'))
          : h('button', { class: 'btn small primary', onclick: () => { this.cmd({ c: 'moduleVote', accept: true }); audio.play('ready'); } }, pr.cost && me.ether >= half ? tr('Valider (−{0} ✨)', half) : tr('Valider')),
        mine ? null : h('button', { class: 'btn small', onclick: () => this.cmd({ c: 'moduleVote', accept: false }) }, tr('Refuser')),
        h('small', { class: 'muted' }, tr('accord tacite dans {0} s', Math.ceil(left)))));
  }

  /** The Bastion: 3 module slots + catalogue by family. */
  private renderBastion(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    const team = m.teams[me.team];
    S.append(title(tr('🏰 Bastion')),
      h('p', { class: 'muted small', style: 'margin:0 0 6px' }, tr('Core {0} / {1} PV{2}. 3 emplacements de modules, payés en Éther. Chaque choix se propose : ton partenaire valide et paie la moitié s\'il le peut. Sans réponse, accord tacite en {3} s.', fmt(team.hp), fmt(team.maxHp), team.shield ? tr(' · Égide {0}', fmt(team.shield)) : '', PROPOSAL_TIMEOUT)));
    if (team.proposal) {
      const pr = team.proposal;
      S.append(h('div', { class: 'tags' }, h('span', {}, tr('⏳ En attente : {0} ({1})', MODULES[pr.module].name, pr.action === 'install' ? 'installation' : pr.action === 'upgrade' ? tr('amélioration') : tr('démontage')))));
    }
    const slots = h('div', { class: 'slots' });
    team.modules.forEach((sl, i) => {
      if (!sl) { slots.append(h('div', { class: 'slot empty' }, h('b', {}, tr('Emplacement {0}', i + 1)), h('small', { class: 'muted' }, tr('libre')))); return; }
      const d = MODULES[sl.id];
      const up = sl.lv < 3 ? moduleCost(sl.id, sl.lv + 1) : 0;
      slots.append(h('div', { class: 'slot', style: `--fc:${FAMILY_COLORS[d.family]}` },
        h('div', { class: 'sl-h', html: tr('{0}<b>{1}</b><span class="stars">{2}</span>', icon(d.icon, 20, FAMILY_COLORS[d.family], 2.4), esc(d.name), stars(sl.lv, 3)) }),
        h('small', {}, d.levels[sl.lv - 1]),
        h('div', { class: 'sl-b' },
          sl.lv < 3 ? h('button', { class: 'btn small', disabled: !!team.proposal || me.ether < up, onclick: () => this.cmd({ c: 'module', action: 'upgrade', module: sl.id }) }, `★ ${up}✨`) : h('small', { class: 'muted' }, tr('MAX')),
          h('button', { class: 'btn small ghost', disabled: !!team.proposal, onclick: () => this.cmd({ c: 'module', action: 'remove', module: sl.id }) }, tr('Démonter +{0}✨', Math.floor(moduleValue(sl.id, sl.lv) * MODULE_REFUND))))));
    });
    S.append(slots);
    const free = team.modules.some(x => !x);
    const tabs = h('div', { class: 'seg', style: 'margin:6px 0' });
    for (const f of Object.keys(FAMILY_NAMES) as ModuleFamily[]) tabs.append(h('button', { class: this.modFamily === f ? 'on' : '', style: `--fc:${FAMILY_COLORS[f]}`, onclick: () => { this.modFamily = f; this.renderSheet(); } }, FAMILY_NAMES[f]));
    S.append(tabs);
    for (const id of MODULE_IDS.filter(x => MODULES[x].family === this.modFamily)) {
      const d = MODULES[id];
      const installed = team.modules.find(x => x?.id === id);
      const cost = moduleCost(id, 1);
      S.append(h('button', { class: 'opt', disabled: !!installed || !free || !!team.proposal || me.ether < cost, onclick: () => { if (this.cmd({ c: 'module', action: 'install', module: id })) audio.play('click'); } },
        h('div', { html: icon(d.icon, 24, FAMILY_COLORS[d.family], 2.4) }),
        h('div', { class: 't' }, h('b', {}, d.name, installed ? ` ${'★'.repeat(installed.lv)}` : ''), h('br'), d.levels[0], h('br'), h('small', { class: 'muted' }, `★★ ${d.levels[1]} · ★★★ ${d.levels[2]}`)),
        h('div', { class: 'p e' }, installed ? tr('INSTALLÉ') : !free ? tr('PLEIN') : `${cost}✨`)));
    }
  }

  private renderResoSheet(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    const t = m.teams[me.team];
    const partner = this.partner(m);
    const ab = duoAbility(me.faction, partner.faction);
    S.append(title(tr('💞 Résonance DUO')),
      h('div', { class: 'reso-card', style: `--c1:${hex(ab.color)};--c2:${hex(ab.color2)}` },
        h('small', {}, `${FACTIONS[me.faction].name} + ${FACTIONS[partner.faction].name}`),
        h('b', {}, ab.name), h('p', {}, ab.text),
        h('div', { class: 'rbar big' }, h('i', { style: `width:${Math.min(100, (t.reso / RESO_MAX) * 100)}%` })),
        h('small', {}, tr('{0} / {1} · déclenchée {2} fois', Math.floor(t.reso), RESO_MAX, t.resoUses))),
      h('p', { class: 'small' }, tr('La jauge ne monte JAMAIS avec le temps : seulement quand vous coopérez.')),
      h('ul', { class: 'small reso-list' },
        h('li', {}, tr('Une de tes unités élimine un ennemi dans la voie de ton partenaire : +{0}', RESO_GAIN.helpKill)),
        h('li', {}, tr('Un fuyard abattu avant le Core : +{0} (+{1} s\'il venait de la voie de ton partenaire)', RESO_GAIN.save, RESO_GAIN.saveCross)),
        h('li', {}, tr('Les deux voies tenues sans fuite : +{0}', RESO_GAIN.cleanWave)),
        h('li', {}, tr('Un pouvoir lancé sur la voie de ton partenaire (la tienne est vide) : +{0}', RESO_GAIN.powerAssist)),
        h('li', {}, tr('Deux pouvoirs lancés à moins de 4 s d\'écart : +{0} (1×/vague)', RESO_GAIN.syncCast)),
        h('li', {}, tr('Dégâts infligés à un boss de la voie partenaire, Failles fermées par ton aide, combos d\'entraide'))),
      h('p', { class: 'small muted' }, tr('Pleine : l\'un de vous la déclenche (bouton DUO en combat). L\'autre a 2 s pour appuyer sur SYNCHRO : effet +30 %. À utiliser maintenant… ou à garder pour le boss ?')),
      h('div', { class: 'sect' }, tr('Entraide de vos armées')),
      h('div', { class: 'small' }, h('b', {}, `${FACTIONS[me.faction].help.name} : `), FACTIONS[me.faction].help.text, h('br'), h('b', {}, `${FACTIONS[partner.faction].help.name} (${partner.name}) : `), FACTIONS[partner.faction].help.text));
    const seen = Object.keys(save.profile.duoGames ?? {}).length;
    S.append(h('div', { class: 'muted small', style: 'margin-top:6px' }, tr('Capacités DUO découvertes : {0} / {1}', seen, ALL_DUO_ABILITIES.length)));
  }

  private renderRiftSheet(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    const reward = m.rift?.reward ?? 'gold';
    const rw = RIFT_REWARDS[reward];
    S.append(title(tr('⚡ Faille secondaire')),
      h('p', { class: 'small' }, tr('Une Faille s\'ouvre au bord de ta voie à cette vague. Ignorée, elle crache {0} ennemis. Fermée par tes unités : ', RIFT_MINIONS), h('b', { style: 'color:var(--gold)' }, rw.text(m.wave)), '.'),
      h('p', { class: 'muted small' }, tr('Risque : les unités affectées quittent ta défense pendant qu\'elles la ferment ({0} max, pas les tours).', RIFT_MAX_UNITS)));
    const mobile = me.builds.filter(b => !UNITS[b.defId].tower);
    if (!mobile.length) S.append(h('p', { class: 'muted small' }, tr('Aucune unité mobile : les tours ne quittent pas leur poste.')));
    const n = me.builds.filter(b => b.rift).length;
    for (const b of mobile) {
      const st = unitStats(b.defId, b.level, b.branch);
      S.append(h('button', { class: `opt rift${b.rift ? ' on' : ''}`, disabled: !b.rift && n >= RIFT_MAX_UNITS, onclick: () => this.cmd({ c: 'rift', bid: b.bid, on: !b.rift }) },
        h('div', { class: 't' }, h('b', { html: `${esc(st.name)} ${stars(b.level)}` }), h('br'), tr('DPS {0} · {1}', fmt(st.dmg * st.atkSpeed), CATEGORY_NAMES[UNITS[b.defId].category])),
        h('div', { class: 'p' }, b.rift ? tr('✓ AFFECTÉE') : tr('AFFECTER'))));
    }
  }

  private renderFusionSheet(S: HTMLElement, title: (t: string) => HTMLElement, m: MetaView, me: PlayerView) {
    S.append(title(tr('✨ Fusions possibles')),
      h('p', { class: 'muted small' }, tr('Deux unités identiques du même niveau → une seule, niveau supérieur. Gratuit (l\'excédent est remboursé), libère une case et ajoute un Éclat de fusion : +{0} % PV et dégâts (cumulable 3×).', Math.round(FUSION_BONUS * 100))));
    const pairs = this.fusionPairs(me);
    if (!pairs.length) S.append(h('p', { class: 'small' }, tr('Aucune paire pour l\'instant. Astuce : une 2e copie d\'une unité ★ permet de fusionner (les cartes concernées brillent ✨).')));
    for (const [a, b] of pairs) {
      const st = unitStats(a.defId, a.level, a.branch);
      const extra = Math.max(0, a.value + b.value - unitValueAt(a.defId, a.level + 1));
      S.append(h('button', { class: 'opt', onclick: () => this.fuse(a, b.bid) },
        h('div', { html: icon('merge', 26, '#C8A0FF', 2.6) }),
        h('div', { class: 't' }, h('b', { html: `2× ${esc(st.name)} ${stars(a.level)} → ${stars(a.level + 1)}` }), h('br'), a.level + 1 === BRANCH_LEVEL ? tr('Choix de spécialisation à la fusion.') : tr('+{0} % PV et dégâts{1}', Math.round(FUSION_BONUS * 100), extra ? tr(' · rembourse {0} 🪙', extra) : '')),
        h('div', { class: 'p' }, tr('FUSIONNER'))));
    }
    void m;
  }

  private onReso(ev: Extract<GameEvent, { t: 'reso' }>, m: MetaView) {
    const me = this.me!;
    if (ev.team !== me.team) { if (ev.k === 'fire') this.toast(tr('L\'équipe adverse déclenche sa Résonance DUO !'), 'error'); return; }
    const ab = ALL_DUO_ABILITIES.find(a => a.id === ev.ability);
    const name = ab?.name ?? tr('RÉSONANCE');
    switch (ev.k) {
      case 'full': audio.play('resoFull'); this.toast(tr('💞 Résonance pleine : {0} prête !', name), 'ping'); this.haptic([30, 30, 30]); break;
      case 'start':
        audio.play('resoStart');
        if (ev.pid === me.pid) this.banner(name, tr('Ton partenaire peut SYNCHRONISER (+30 %)'), false, 'reso');
        else { this.banner(tr('SYNCHRONISE !'), tr('{0} lance {1} — appuie sur DUO', m.players[ev.pid].name, name), false, 'reso'); this.haptic([60, 40, 60, 40, 60]); }
        break;
      case 'sync': audio.play('resoSync'); this.toast(tr('✦ Résonance synchronisée : +30 % !'), 'ping'); break;
      case 'fire':
        audio.play('resoFire');
        this.banner(name, ev.sync ? tr('SYNCHRONISÉE') : '', false, 'reso');
        this.flashScreen(ab ? `radial-gradient(circle, ${hex(ab.color)}88, ${hex(ab.color2)}22 60%, transparent 80%)` : 'rgba(255,255,255,0.4)');
        this.haptic([80, 40, 120]);
        break;
      case 'refund': this.toast(tr('La vague s\'est terminée avant l\'impact : Résonance rendue.'), 'info'); break;
    }
  }

  /** Short boss introduction: name, epithet, mechanic. Never blocks the game. */
  private bossIntro(defId: string) {
    const d = ENEMIES[defId];
    audio.play('bossIntro');
    this.haptic([60, 80, 60]);
    this.els.vignette.classList.add('boss');
    setTimeout(() => this.els.vignette.classList.remove('boss'), 2400);
    const b = h('div', { class: 'bossintro' },
      h('small', {}, d.title ? d.title.toUpperCase() : tr('BOSS')),
      h('b', {}, d.name.toUpperCase()),
      h('span', {}, d.mechanic ?? d.description));
    this.root.append(b);
    setTimeout(() => b.remove(), 2800);
  }

  /** First time a cross-army help effect triggers: explain it once. */
  private helpHint(kind: string, faction: keyof typeof FACTIONS, who: string) {
    const key = `help:${kind}`;
    if (this.hints.has(key)) return;
    this.hints.add(key);
    const f = FACTIONS[faction];
    this.toast(`🤝 Entraide — ${f.help.name}${who ? ` (${who})` : ''} : ${f.help.text}`, 'info');
  }

  /** End of game: short timeline built from the journal + highlights (never judgemental). */
  private endAnalysis(m: MetaView, team: PlayerView[]) {
    const me = this.me!;
    const wrap = h('div', { class: 'card endan', style: 'width:min(680px,100%)' });
    const name = (pid: number) => tr(m.players[pid]?.name ?? '?');
    const mine = (pid: number) => m.players[pid]?.team === me.team;
    const lines: { w: number; t: string; pri: number }[] = [];
    const journal: JournalEntry[] = m.journal ?? [];
    let firstLeak = false;
    for (const j of journal) {
      switch (j.k) {
        case 'leak1': if (mine(j.p) && !firstLeak) { firstLeak = true; lines.push({ w: j.w, t: tr('Première fuite ({0})', name(j.p)), pri: 2 }); } break;
        case 'core': if (j.p === me.team && (j.b === 1 || Number(j.a) >= 300)) lines.push({ w: j.w, t: j.b === 1 ? tr('BOSS — perte de {0} PV du Core', j.a) : tr('Vague difficile — perte de {0} PV du Core', j.a), pri: j.b === 1 ? 4 : 2 }); break;
        case 'bossdown': if (j.p === me.team) lines.push({ w: j.w, t: tr('Boss vaincu sans dégâts au Core !'), pri: 4 }); break;
        case 'reso': if (mine(j.p)) lines.push({ w: j.w, t: tr('Résonance DUO : {0}{1}', ALL_DUO_ABILITIES.find(a => a.id === j.a)?.name ?? '', j.b ? tr(' (synchronisée)') : ''), pri: 5 }); break;
        case 'save': if (mine(j.p)) lines.push({ w: j.w, t: tr('Défense sauvée par {0} : {1} ennemis abattus chez son partenaire', name(j.p), j.a), pri: 5 }); break;
        case 'bigsend': { const to = Number(j.b); if (mine(to)) lines.push({ w: j.w, t: tr('Envoi adverse : {0} ({1})', RAIDERS.find(r => r.id === j.a)?.name ?? j.a, name(j.p)), pri: 3 }); else if (mine(j.p)) lines.push({ w: j.w, t: tr('{0} envoie {1}', name(j.p), RAIDERS.find(r => r.id === j.a)?.name ?? j.a), pri: 3 }); break; }
        case 'anom': if (j.p === me.team) lines.push({ w: j.w, t: tr('Anomalie choisie : {0}', ANOMALIES[j.a as AnomalyId]?.name ?? j.a), pri: 3 }); break;
        case 'rift': if (mine(j.p)) lines.push({ w: j.w, t: tr('Faille fermée par {0} ({1})', name(j.p), RIFT_REWARDS[j.a as keyof typeof RIFT_REWARDS]?.name ?? ''), pri: 2 }); break;
        case 'mod': if (mine(j.p) && (j.b === 1 || j.b === 3)) lines.push({ w: j.w, t: j.b === 1 ? tr('Module installé : {0}', MODULES[j.a as keyof typeof MODULES]?.name) : tr('{0} au niveau 3', MODULES[j.a as keyof typeof MODULES]?.name), pri: 1 }); break;
      }
    }
    const shown = lines.slice().sort((a, b) => b.pri - a.pri).slice(0, 9).sort((a, b) => a.w - b.w);
    if (shown.length) wrap.append(h('div', { class: 'sect' }, tr('Votre partie')), h('div', { class: 'timeline' }, ...shown.map(l => h('div', { class: 'tl' }, h('b', {}, tr('Vague {0}', l.w)), h('span', {}, l.t)))));
    // highlights
    const all = team.flatMap(p => p.builds.map(b => ({ p, b })));
    const best = (f: (x: { b: Build }) => number) => all.filter(x => f(x) > 0).sort((a, b) => f(b) - f(a))[0];
    const label = (x: { p: PlayerView; b: Build }) => `${unitStats(x.b.defId, x.b.level, x.b.branch).name} (${tr(x.p.name)})`;
    const hl: string[] = [];
    const mvp = team.slice().sort((a, b) => score(b) - score(a))[0];
    function score(p: PlayerView) { return p.stats.dmgDealt / 1000 + p.stats.dmgTanked / 2000 + p.stats.helpKills * 2 + p.stats.saves * 3 + p.stats.resoGain * 0.4; }
    if (mvp) hl.push(tr('🏅 MVP : {0}', tr(mvp.name)));
    const dmg = best(x => x.b.dmgTotal); if (dmg) hl.push(tr('⚔️ Plus de dégâts : {0} — {1}', label(dmg), fmt(dmg.b.dmgTotal)));
    const tank = best(x => x.b.tanked); if (tank) hl.push(tr('🛡️ A le plus encaissé : {0} — {1}', label(tank), fmt(tank.b.tanked)));
    const heal = best(x => x.b.healed); if (heal) hl.push(tr('💚 Soins & boucliers : {0} — {1}', label(heal), fmt(heal.b.healed)));
    const ctrl = best(x => x.b.ctrl); if (ctrl) hl.push(tr('❄️ Contrôle : {0} — {1} s', label(ctrl), Math.round(ctrl.b.ctrl)));
    const inv = best(x => x.b.dmgTotal / Math.max(1, x.b.value)); if (inv) hl.push(tr('💎 Meilleur investissement : {0} — {1} dégâts par pièce d\'or', label(inv), fmt(inv.b.dmgTotal / Math.max(1, inv.b.value))));
    wrap.append(h('div', { class: 'sect' }, tr('Moments forts')), h('div', { class: 'highlights' }, ...hl.map(t => h('span', {}, t))));
    // one gentle, reliable tip
    let tip = '';
    if (me.ether >= 150) tip = tr('Il te restait {0} Éther à la fin : le Bastion, les pouvoirs et les envois peuvent en tirer parti plus tôt.', fmt(me.ether));
    else if (me.gold >= 400) tip = tr('Il te restait {0} or à la fin : une unité de plus ou une amélioration aurait pu peser dans les dernières vagues.', fmt(me.gold));
    else if (me.stats.fusions === 0 && all.some(x => x.p.pid === me.pid && x.b.level >= 3)) tip = tr('Essaie la fusion : deux unités identiques donnent un niveau ET un Éclat de fusion (+10 %).');
    if (tip) wrap.append(h('div', { class: 'muted small', style: 'margin-top:6px' }, tr('💡 Piste pour la prochaine partie : {0}', tip)));
    return wrap;
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
    const best = (f: (p: PlayerView) => number, label: string) => { const p = team.slice().sort((a, b) => f(b) - f(a))[0]; if (p && f(p) > 0) titles.push(tr('{0} : {1}', label, tr(p.name))); };
    best(p => p.income + p.workers * 4, tr('👑 ROI DE L\'ÉCONOMIE'));
    best(p => -p.stats.leaks * 100 + p.stats.dmgTanked / 100, tr('🛡️ MEILLEURE DÉFENSE'));
    best(p => p.stats.maxDps, tr('🔥 PLUS GROS DPS'));
    best(p => p.stats.sentUnits, tr('⚔️ HARCELEUR'));
    best(p => p.stats.upgrades + p.stats.fusions * 2, tr('✨ FORGERON'));
    const mins = Math.floor(m.time / 60), secs = Math.floor(m.time % 60);
    const tbl = h('table', { class: 'end-table' });
    tbl.append(h('tr', {}, h('th', {}, ''), ...team.map(p => h('th', {}, tr(p.name)))));
    const rows: [string, (p: PlayerView) => string][] = [
      [tr('Armée'), p => FACTIONS[p.faction].name], [tr('Ennemis éliminés'), p => fmt(p.stats.kills)], [tr('Dégâts infligés'), p => fmt(p.stats.dmgDealt)],
      [tr('Unités déployées'), p => String(p.stats.unitsBuilt)], [tr('Améliorations / fusions'), p => `${p.stats.upgrades} / ${p.stats.fusions}`],
      [tr('Ennemis envoyés'), p => tr('{0} ({1} envois)', p.stats.sentUnits, p.stats.raidersSent)], [tr('Pouvoirs utilisés'), p => String(p.stats.casts)],
      [tr('Ordres donnés'), p => String(p.stats.orders)], [tr('Résonance apportée'), p => `${Math.round(p.stats.resoGain)} %`], [tr('Aide au partenaire'), p => tr('{0} kills · {1} sauvetages', p.stats.helpKills, p.stats.saves)],
      [tr('Unité la plus efficace'), p => p.stats.bestUnit ? UNITS[p.stats.bestUnit].name : '—'], [tr('Or généré'), p => fmt(p.stats.goldEarned)], [tr('Fuites'), p => String(p.stats.leaks)],
    ];
    for (const [l, f] of rows) tbl.append(h('tr', {}, h('td', {}, l), ...team.map(p => h('td', {}, f(p)))));
    const prof = save.profile;
    prof.games++; if (win) prof.wins++;
    prof.xp += Math.round((20 + m.wave * 5 + (win ? 50 : 0)) * (me.randomFaction ? 1.25 : 1));
    prof.factionGames = { ...prof.factionGames, [me.faction]: (prof.factionGames?.[me.faction] ?? 0) + 1 };
    const duoId = duoAbility(me.faction, this.partner(m).faction).id;
    prof.duoGames = { ...(prof.duoGames ?? {}), [duoId]: (prof.duoGames?.[duoId] ?? 0) + 1 };
    let dailyStatus: HTMLElement | null = null;
    if (m.settings.challenge?.startsWith('daily:')) {
      const day = m.settings.challenge.slice(6);
      const prev = prof.daily?.[day];
      const cur = { wave: m.wave, hp: Math.round(m.teams[me.team].hp), time: Math.round(m.time), rank: prev?.rank };
      if (!prev || cur.wave > prev.wave || (cur.wave === prev.wave && cur.time < prev.time)) prof.daily = { ...(prof.daily ?? {}), [day]: cur };
      // v0.8: the online leaderboard only takes scores the server has recomputed itself (replay of the command log)
      if (this.session.role === 'solo' && ONLINE) {
        const st = h('div', { class: 'daily-status' }, tr('⏳ Envoi de la partie au classement du jour…'));
        dailyStatus = st;
        submitDailyRun(day, save.profile.name || me.name, this.session.log, { wave: cur.wave, hp: cur.hp, seconds: cur.time }, w => { st.textContent = tr('⏳ Le serveur rejoue ta partie… vague {0}', w); }).then(r => {
          if (r.status === 'ok') {
            st.className = 'daily-status ok';
            st.textContent = r.best ? tr('🏆 Score validé : vague {0} · {1}e sur {2} aujourd\'hui', r.wave, r.rank, r.total) : tr('✔ Partie vérifiée (vague {0}) · ton meilleur score du jour reste {1}e sur {2}', r.wave, r.rank, r.total);
            const d = save.profile.daily?.[day];
            if (d) { d.rank = r.rank; save.flush(); }
          } else {
            st.className = 'daily-status err';
            st.textContent = DAILY_ERRORS[r.error] ?? tr('Classement indisponible ({0}) : record gardé sur cet appareil.', r.error);
          }
        });
      }
    }
    let recordLine = '';
    if (survival) {
      const partner = team.find(p => p.pid !== me.pid)!;
      const key = partner.isAI ? tr('IA') : partner.name;
      const prev = prof.duoRecords[key] ?? 0;
      prof.duoRecords[key] = Math.max(prev, m.wave);
      prof.bestSurvival = Math.max(prof.bestSurvival, m.wave);
      recordLine = tr('{0} + {1} — RECORD : VAGUE {2}{3}', me.name.toUpperCase(), tr(partner.name).toUpperCase(), prof.duoRecords[key], m.wave > prev ? tr(' (NOUVEAU !)') : '');
    }
    save.flush();
    this.tutorial?.destroy();
    const coreMsg = m.result.reason === 'Le Core adverse est détruit !' || m.result.reason === 'Votre Core a été détruit.';
    const reason = survival || !coreMsg ? tr(m.result.reason) : win ? tr('Le Core adverse est détruit !') : tr('Votre Core a été détruit.');
    const scr = h('div', { class: `screen transparent endscr ${win ? 'win' : 'lose'}` },
      h('div', { class: 'logo', style: 'font-size:clamp(34px,8vw,68px)' }, survival ? tr('FIN DE LA SURVIE') : win ? tr('VICTOIRE !') : tr('DÉFAITE')),
      h('p', { class: 'muted center', style: 'margin:6px 0' }, reason, tr(' — vague {0} · {1} min {2} s', m.result.wave, mins, String(secs).padStart(2, '0'))),
      recordLine ? h('div', { class: 'code-big', style: 'font-size:clamp(18px,3.5vw,28px);letter-spacing:0.05em' }, recordLine) : null,
      dailyStatus,
      h('div', { class: 'titles' }, ...titles.map(t => h('span', {}, t))),
      this.endAnalysis(m, team),
      h('div', { class: 'card', style: 'width:min(680px,100%)' }, tbl),
      h('div', { class: 'menu row', style: 'margin-top:10px' },
        this.session.role !== 'guest' ? h('button', { class: 'btn primary', onclick: () => this.cb.rematch() }, tr('↻ Rejouer')) : null,
        h('button', { class: 'btn', onclick: () => this.cb.exit() }, tr('Menu'))));
    setTimeout(() => this.root.append(scr), 600);
  }
}

/** v0.8: why a daily score could not enter the online leaderboard (the local record is always kept). */
const DAILY_ERRORS: Record<string, string> = {
  version: tr('Nouvelle version du jeu disponible : recharge la page pour que ton prochain score soit classé.'),
  unavailable: tr('Classement en ligne pas encore activé sur le serveur : record gardé sur cet appareil.'),
  offline: tr('Hors-ligne : record gardé sur cet appareil.'),
  network: tr('Connexion perdue pendant l\'envoi : record gardé sur cet appareil.'),
  bad_day: tr('Ce défi est terminé (un nouveau défi commence chaque jour à minuit UTC) : score non classé.'),
  unauthorized: tr('Session invitée expirée : relance le jeu pour que ton prochain score soit classé.'),
  bad_log: tr('Partie non reconnue par le serveur : score non classé.'),
  too_long: tr('Partie trop longue pour être vérifiée : score non classé.'),
  timeout: tr('Le serveur n\'a pas fini de vérifier la partie : score non classé.'),
};

function summarize(names: string[]) {
  const c = new Map<string, number>();
  for (const n of names) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c].map(([n, k]) => (k > 1 ? `${k}× ${n}` : n)).join(', ');
}

