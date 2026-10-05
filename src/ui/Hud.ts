// UISystem (in-game): HUD, touch input (tap / drag & drop / long-press / pinch), panels, feedback.
import { UNITS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { getWave } from '../data/waves';
import { ATTACK_ICONS, ATTACK_NAMES, CORE, DAMAGE_MATRIX, DEFENSE_ICONS, DEFENSE_NAMES, ECONOMY, PINGS, POWERS, RAIDERS, matrixArrow, raiderScale } from '../data/economy';
import type { AttackType, DefenseType } from '../data/types';
import type { CoreUpgradeId } from '../data/economy';
import { recommendedValue, riskOf } from '../sim/balance';
import type { GameEvent } from '../sim/state';
import type { Command } from '../sim/game';
import { Renderer, DragGhost } from '../render/Renderer';
import type { Session } from '../net/Session';
import type { MetaView, PlayerView } from '../net/snapshot';
import { audio } from '../audio/AudioSystem';
import { save } from '../save/SaveSystem';
import { DEBUG } from '../config';
import { h, clear, unitIcon, unitColor, roleLabel, fmt, vibrate } from './dom';
import { Tutorial } from './Tutorial';

type Sheet = 'raiders' | 'core' | 'stats' | 'pings' | 'menu' | 'unit' | 'info' | null;

export interface HudCallbacks { exit(): void; rematch(): void }

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

  constructor(private session: Session, private r: Renderer, private cb: HudCallbacks) {
    this.root = h('div', { id: 'hud' });
    document.body.append(this.root);
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
    E.wave = h('div', { class: 'w' }); E.phase = h('div', { class: 'ph' });
    E.timer = h('div', { class: 'pill timer' });
    E.coreFill = h('i'); E.coreLbl = h('span'); E.coreBar = h('div', { class: 'bar' }, E.coreFill);
    E.enemyFill = h('i'); E.enemyBar = h('div', { class: 'bar enemy', style: 'height:7px' }, E.enemyFill);
    E.enemyRow = h('div', { class: 'lbl' }, h('span', {}, '☠ Core adverse'), h('span', {}));
    E.partner = h('div', { class: 'pill partner' });
    const top = h('div', { class: 'hud-top' },
      h('div', { class: 'pill wave-box' }, E.wave, E.phase),
      E.timer,
      h('div', { class: 'pill core-box' }, h('div', { class: 'lbl' }, h('span', {}, '🔷 CORE'), E.coreLbl), E.coreBar, E.enemyRow, E.enemyBar),
      E.partner,
      h('button', { class: 'iconbtn', onclick: () => this.openSheet('pings') }, '💬'),
      h('button', { class: 'iconbtn', onclick: () => this.openSheet('menu') }, '⚙️'),
    );
    E.gold = h('span', { class: 'v g' }); E.ether = h('span', { class: 'v e' }); E.income = h('span', { class: 'v' }); E.workers = h('span', { class: 'v' });
    E.army = h('div', { class: 'army', style: 'grid-column: span 2' });
    const res = h('div', { class: 'res' },
      h('span', {}, '🪙'), E.gold, h('span', {}, '✨'), E.ether, h('span', {}, '📈'), E.income, h('span', {}, '⛏️'), E.workers, E.army);
    E.next = h('div', { class: 'next' });
    E.left = h('div', { class: 'hud-left' }, res, E.next);
    E.cards = h('div', { class: 'cards' });
    E.workerBtn = h('button', { class: 'abtn', onclick: () => { if (this.cmd({ c: 'worker' })) { audio.play('worker'); this.tutorial?.on('worker'); } } });
    E.raiderBtn = h('button', { class: 'abtn', onclick: () => this.openSheet('raiders') }, '👹', h('span', {}, 'RAIDERS'));
    E.coreBtn = h('button', { class: 'abtn', onclick: () => this.openSheet('core') }, '🔷', h('span', {}, 'CORE'));
    E.statsBtn = h('button', { class: 'abtn', onclick: () => this.openSheet('stats') }, '📊', h('span', {}, 'STATS'));
    E.ready = h('button', { class: 'abtn ready', onclick: () => this.toggleReady() });
    const bottom = h('div', { class: 'hud-bottom' }, E.cards, h('div', { class: 'actions' }, E.workerBtn, E.raiderBtn, E.coreBtn, E.statsBtn, E.ready));
    E.sheet = h('div', { class: 'sheet', style: 'display:none' });
    E.toasts = h('div', { class: 'toasts' });
    E.vignette = h('div', { class: 'vignette' });
    E.overlay = h('div', { class: 'overlay-msg', style: 'display:none' });
    E.rotate = h('div', { class: 'rotate' }, '↻ Tourne ton téléphone en mode paysage pour mieux jouer');
    this.root.append(E.vignette, top, E.left, bottom, E.sheet, E.toasts, E.overlay, E.rotate);
    if (DEBUG) this.root.append(this.debugPanel());
  }

  private debugPanel() {
    const b = (label: string, action: string) => h('button', { onclick: () => this.cmd({ c: 'debug', action }) }, label);
    return h('div', { class: 'debug' }, b('+500 or', 'gold'), b('+100 éther', 'ether'), b('Vague +1', 'wave'), b('Lancer', 'skip'), b('Tuer tout', 'kill'), b('Core 100%', 'core'),
      h('button', { onclick: () => this.cmd({ c: 'speed', speed: 3 }) }, 'x3'), h('button', { onclick: () => this.cmd({ c: 'speed', speed: 1 }) }, 'x1'));
  }

  // ------------------------------------------------------------------ per-frame update
  update(dt: number) {
    const m = this.meta;
    if (!m) return;
    if (m !== this.lastMeta) { this.lastMeta = m; this.metaAt = performance.now(); this.metaTimer = m.timer; }
    if (!this.focused) { this.r.focus(this.me?.slot ?? 0, 0); this.focused = true; if (m.settings.tutorial) this.tutorial = new Tutorial(this.root, this.session, () => this.me); }
    // events → audio / banners
    for (const ev of this.peekEvents()) this.onEvent(ev, m);
    // phase transitions
    if (m.phase !== this.lastPhase || m.wave !== this.lastWave) this.onPhase(m);
    const now = performance.now();
    // timer (smoothly extrapolated for guests)
    const elapsed = m.paused ? 0 : (now - this.metaAt) / 1000 * m.speed;
    const t = Math.max(0, this.session.role === 'guest' ? this.metaTimer - elapsed : m.timer);
    this.els.timer.textContent = m.phase === 'build' ? String(Math.ceil(t)) : m.phase === 'combat' ? '⚔️' : '…';
    this.els.timer.classList.toggle('urgent', m.phase === 'build' && t < 6);
    if (now - this.lastUi > 100) { this.lastUi = now; this.refresh(m); }
    this.tutorial?.update(m);
    void dt;
  }

  private evQueue: GameEvent[] = [];
  /** Events are consumed by the renderer; the HUD keeps its own copy via the view tap. */
  private peekEvents() { const e = this.evQueue; this.evQueue = []; return e; }
  feedEvents(ev: GameEvent[]) { for (const e of ev) this.evQueue.push(e); }

  private refresh(m: MetaView) {
    const E = this.els;
    const me = this.me!;
    const total = m.settings.mode === 'survival' ? '∞' : m.settings.totalWaves;
    E.wave.textContent = `VAGUE ${m.wave}/${total}`;
    E.phase.textContent = m.paused ? 'PAUSE' : m.phase === 'build' ? 'PRÉPARATION' : m.phase === 'combat' ? 'COMBAT' : m.phase === 'resolution' ? 'RÉSOLUTION' : 'FIN';
    const ct = m.teams[me.team];
    const k = ct.hp / ct.maxHp;
    E.coreFill.style.width = `${k * 100}%`;
    E.coreBar.classList.toggle('low', k < 0.3);
    E.coreLbl.textContent = `${fmt(ct.hp)} / ${fmt(ct.maxHp)}`;
    const enemy = m.teams.length > 1 ? m.teams[1 - me.team] : null;
    E.enemyRow.style.display = E.enemyBar.style.display = enemy ? '' : 'none';
    if (enemy) { E.enemyFill.style.width = `${(enemy.hp / enemy.maxHp) * 100}%`; (E.enemyRow.lastChild as HTMLElement).textContent = fmt(enemy.hp); }
    // resources
    E.gold.textContent = fmt(me.gold);
    E.ether.textContent = fmt(me.ether);
    E.income.textContent = `+${me.income}`;
    E.workers.textContent = String(me.workers);
    const value = me.builds.reduce((t, b) => t + b.value, 0);
    const rec = recommendedValue(m.wave, me.builds.map(b => b.defId), value);
    const risk = riskOf(value, rec);
    E.army.className = `army ${risk}`;
    E.army.textContent = `⚔️ ${fmt(value)} / conseillé ${fmt(rec)}`;
    // next wave
    this.renderNext(m);
    // partner
    const partner = m.players.find(p => p.team === me.team && p.pid !== me.pid)!;
    const pv = partner.builds.reduce((t, b) => t + b.value, 0);
    clear(E.partner);
    E.partner.classList.toggle('off', !this.session.partnerOnline && !partner.isAI);
    E.partner.append(
      h('div', { class: 'nm' }, `${partner.isAI ? '🤖' : '🤝'} ${partner.name}`),
      h('div', {}, `⚔️ ${fmt(pv)} · ⛏️ ${partner.workers}`),
      h('div', { style: `color:${partner.ready ? 'var(--ok)' : 'var(--muted)'};font-weight:800` }, !this.session.partnerOnline && !partner.isAI ? 'CONNEXION…' : m.phase === 'build' ? (partner.ready ? 'PRÊT ✔' : 'construit…') : m.phase === 'combat' ? (partner.leakedThisWave ? `⚠ ${partner.leakedThisWave} fuites` : 'en combat') : ''),
    );
    // cards
    this.renderCards(me, m);
    // buttons
    const wc = ECONOMY.workerBaseCost + ECONOMY.workerCostStep * (me.workers - ECONOMY.startWorkers);
    clear(E.workerBtn); E.workerBtn.append('⛏️', h('span', {}, 'OUVRIER'), h('small', {}, `${wc}🪙`));
    (E.workerBtn as HTMLButtonElement).disabled = me.gold < wc || me.workers >= ECONOMY.maxWorkers;
    E.raiderBtn.querySelector('span')!.textContent = m.settings.mode === 'vsai' ? 'RAIDERS' : 'INVESTIR';
    E.raiderBtn.firstChild!.textContent = m.settings.mode === 'vsai' ? '👹' : '📈';
    clear(E.ready);
    E.ready.append(me.ready ? '✔' : '▶', h('span', {}, me.ready ? 'PRÊT !' : 'PRÊT'));
    E.ready.classList.toggle('on', me.ready);
    (E.ready as HTMLButtonElement).disabled = m.phase !== 'build';
    // overlays
    const waiting = !this.session.partnerOnline && this.session.role !== 'solo' && !partner.isAI && m.phase !== 'ended';
    E.overlay.style.display = waiting || m.paused ? 'flex' : 'none';
    if (m.paused) {
      clear(E.overlay);
      E.overlay.append(h('div', { class: 'col' }, '⏸ PAUSE', h('button', { class: 'btn primary', onclick: () => this.cmd({ c: 'pause', value: false }) }, 'Reprendre')));
    } else if (waiting) E.overlay.textContent = this.session.role === 'host' ? '📡 Partenaire déconnecté — en attente de reconnexion…' : '📡 CONNEXION… (reconnexion à l\'hôte)';
    // power choice
    if (me.powerChoice && !document.querySelector('.power-modal')) this.showPowerChoice(me.powerChoice);
    // live sheet refresh
    if (this.sheet && this.sheet !== 'pings' && this.sheet !== 'menu' && this.sheet !== 'info') this.renderSheet();
  }

  private renderNext(m: MetaView) {
    const E = this.els;
    const w = getWave(m.wave);
    const atk = new Set<AttackType>(), def = new Set<DefenseType>();
    let count = 0, speed = 0, ranged = false;
    for (const g of w.groups) {
      const e = ENEMIES[g.enemy];
      atk.add(e.attack); def.add(e.defense); count += g.count; speed = Math.max(speed, e.moveSpeed);
      if (e.range > 2) ranged = true;
    }
    const me = this.me!;
    // matchup hint for my army vs this wave's defence
    let hint = '';
    if (me.builds.length) {
      const avg = [...def].reduce((t, d) => t + me.builds.reduce((s, b) => s + DAMAGE_MATRIX[UNITS[b.defId].attack][d], 0) / me.builds.length, 0) / def.size;
      hint = ` ${matrixArrow(avg + (avg > 1.04 ? 0.06 : avg < 0.96 ? -0.06 : 0))}`;
    }
    clear(E.next);
    E.next.className = `next${w.boss ? ' boss' : ''}`;
    E.next.append(
      h('b', {}, `${m.phase === 'build' ? 'PROCHAINE' : 'EN COURS'} : ${w.name}`), h('br'),
      `${[...atk].map(a => ATTACK_ICONS[a] + ' ' + ATTACK_NAMES[a]).join(', ')}`, h('br'),
      `${[...def].map(d => DEFENSE_ICONS[d] + ' ' + DEFENSE_NAMES[d]).join(', ')}${hint}`, h('br'),
      `×${count} · ${speed >= 3.5 ? 'rapides' : speed <= 1.8 ? 'lents' : 'vitesse normale'}${ranged ? ' · distance' : ''}`, h('br'),
      h('span', { style: 'color:var(--warn)' }, w.danger),
    );
  }

  private renderCards(me: PlayerView, m: MetaView) {
    const E = this.els;
    const showReroll = m.wave === 1 && me.rerolls > 0 && me.builds.length === 0 && m.phase === 'build';
    const key = me.draft.join(',') + '|' + showReroll;
    if (E.cards.dataset.key === key) {
      // update in place: never replace an element the finger may be pressing
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
      const c = h('div', { class: `ucard${me.gold < u.cost ? ' poor' : ''}${this.selCard === id ? ' sel' : ''}`, 'data-id': id },
        h('div', { class: 'tier' }, `T${u.tier}`),
        h('div', { class: 'ic', style: `background:${unitColor(id)}` }, unitIcon(id)),
        h('div', { class: 'nm' }, u.name),
        h('div', { class: 'ct' }, `${u.cost}🪙`));
      this.bindCard(c, id);
      E.cards.append(c);
    }
    if (showReroll) {
      E.cards.append(h('button', { class: 'abtn', style: 'height:78px', onclick: () => this.cmd({ c: 'reroll' }) }, '🎲', h('span', {}, 'RELANCER')));
    }
  }

  // ------------------------------------------------------------------ events
  private onEvent(ev: GameEvent, m: MetaView) {
    const me = this.me!;
    switch (ev.t) {
      case 'build': if (ev.pid === me.pid) { audio.play('build'); this.tutorial?.on('build'); } break;
      case 'evolve': if (ev.pid === me.pid || ev.pid === this.partnerPid()) audio.play('upgrade'); break;
      case 'sell': if (ev.pid === me.pid) audio.play('sell'); break;
      case 'raider': if (ev.pid === me.pid) { audio.play('raider'); this.tutorial?.on('raider'); } break;
      case 'coreUp': {
        if (m.players[ev.pid]?.team === me.team) { audio.play('ether'); if (ev.pid !== me.pid) this.toast(`${m.players[ev.pid].name} améliore le Core : ${CORE.upgrades[ev.up as CoreUpgradeId].name}`); }
        if (ev.pid === me.pid) this.tutorial?.on('core');
        break;
      }
      case 'income': if (ev.pid === me.pid && ev.gold > 0) { audio.play('coin'); this.toast(`+${ev.gold} 🪙 revenu`, 'info'); } break;
      case 'ping': {
        if (m.players[ev.pid]?.team !== me.team) break;
        const p = PINGS.find(x => x.id === ev.ping);
        if (p) { this.toast(`${m.players[ev.pid].name} : ${p.label}`, 'ping'); audio.play('ping'); if (ev.pid !== me.pid) vibrate(60); }
        break;
      }
      case 'msg': this.toast(ev.text, 'info'); break;
      case 'leak': if (ev.arena === me.team) { audio.play('leak'); if (ev.pid === me.pid) this.flashLeak(); } break;
      case 'coreHit': if (ev.team === me.team) { audio.play('coreHit'); this.els.vignette.classList.add('hit'); setTimeout(() => this.els.vignette.classList.remove('hit'), 180); if (save.prefs.vibrate) vibrate(40); } break;
      case 'die': if (ev.boss && ev.arena === me.team) { audio.play('bossDie'); this.banner('BOSS VAINCU !', ''); } else if (ev.arena === me.team) audio.play('die'); break;
      case 'atk': if (Math.random() < 0.25) audio.play(Math.random() < 0.5 ? 'hit' : 'shot'); break;
      case 'pulse': if (ev.arena === me.team && Math.random() < 0.5) audio.play('pulse'); break;
      case 'worker': break;
      case 'end': this.showEnd(m); break;
    }
  }
  private partnerPid() { const me = this.me!; return me.team * 2 + (1 - me.slot); }

  private flashLeak() {
    const n = this.me?.leakedThisWave ?? 0;
    if (n === 1 || n % 5 === 0) this.toast(`⚠️ FUITE ! Des ennemis filent vers le Core`, 'error');
  }

  private onPhase(m: MetaView) {
    const prevPhase = this.lastPhase;
    this.lastPhase = m.phase; this.lastWave = m.wave;
    const w = getWave(m.wave);
    const lowCore = m.teams[this.me!.team].hp / m.teams[this.me!.team].maxHp < 0.3;
    if (m.phase === 'build') {
      audio.setMood(lowCore ? 'danger' : 'build');
      if (prevPhase !== '') audio.play('wave');
      this.banner(`VAGUE ${m.wave}`, w.boss ? `⚠ ${w.name}` : w.name, w.boss);
      if (w.boss) audio.play('boss');
      this.selected = null;
    } else if (m.phase === 'combat') {
      audio.setMood(w.boss ? 'boss' : lowCore ? 'danger' : 'combat');
      audio.play('combat');
      this.closeSheet();
      this.cancelPlacement();
      this.tutorial?.on('combat');
    } else if (m.phase === 'resolution') {
      const me = this.me!;
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
    setTimeout(() => t.remove(), kind === 'ping' ? 3200 : 2400);
  }
  banner(text: string, sub: string, boss = false) {
    const b = h('div', { class: `banner${boss ? ' boss' : ''}` }, text, sub ? h('small', {}, sub) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 1900);
  }

  // ------------------------------------------------------------------ ready / placement
  private toggleReady() {
    const me = this.me; if (!me) return;
    this.cmd({ c: 'ready', value: !me.ready });
    audio.play('ready');
  }

  private cancelPlacement() {
    this.selCard = null; this.ghost = null; this.dragBuild = null;
    this.dragEl?.remove(); this.dragEl = null;
   
  }

  ghostState(): DragGhost | null { return this.ghost; }

  private updateGhostAt(x: number, y: number, defId: string) {
    const me = this.me!;
    const p = this.r.pick(x, y);
    const c = p ? Renderer.cellAt(me.slot, me.team, p.x, p.z) : null;
    if (!c) { this.ghost = null; return null; }
    const occupied = me.builds.some(b => b.col === c.col && b.row === c.row && b.bid !== this.dragBuild);
    const afford = this.dragBuild !== null || me.gold >= UNITS[defId].cost;
    this.ghost = { defId, col: c.col, row: c.row, valid: !occupied && afford, slot: me.slot, team: me.team };
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
        this.dragEl = h('div', { class: 'dragcard', style: `background:${unitColor(id)}` }, unitIcon(id));
        document.body.append(this.dragEl);
      }
      if (dragging) {
        this.dragEl!.style.left = e.clientX + 'px'; this.dragEl!.style.top = e.clientY + 'px';
        this.updateGhostAt(e.clientX, e.clientY - 40, id);
        this.dragEl!.style.opacity = this.ghost ? '0.25' : '0.85';
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
        // tap: toggle tap-to-place mode
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
        if (this.longTimer) clearTimeout(this.longTimer);
        return;
      }
      this.gesture = 'none';
      // press on own build during build phase → may become a move-drag / long-press
      const m = this.meta, me = this.me;
      if (m && me) {
        const p = this.r.pick(e.clientX, e.clientY);
        const b = p ? Renderer.buildAt(m, me.pid, p.x, p.z) : null;
        if (b) {
          this.dragBuild = b.bid;
          this.longTimer = window.setTimeout(() => { if (this.gesture === 'none') { this.selected = { pid: me.pid, bid: b.bid }; this.openSheet('info', b.defId); this.dragBuild = null; } }, 520);
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
        if (this.pinchDist > 0) this.r.zoom(this.pinchDist / d);
        this.pinchDist = d;
        this.r.pan(dx / 2, dy / 2);
        return;
      }
      const moved = Math.hypot(e.clientX - pt.sx, e.clientY - pt.sy);
      if (this.gesture === 'none' && moved > 10) {
        if (this.longTimer) clearTimeout(this.longTimer);
        if (this.dragBuild !== null && this.meta?.phase === 'build') {
          this.gesture = 'moveBuild';
        } else { this.gesture = 'pan'; this.dragBuild = null; }
      }
      if (this.gesture === 'pan') this.r.pan(dx, dy);
      if (this.gesture === 'moveBuild') {
        const b = this.me!.builds.find(x => x.bid === this.dragBuild);
        if (b) this.updateGhostAt(e.clientX, e.clientY, b.defId);
      }
    };
    const up = (e: PointerEvent) => {
      const pt = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.longTimer) clearTimeout(this.longTimer);
      if (!pt) return;
      if (this.gesture === 'pinch') { if (this.pointers.size === 0) this.gesture = 'none'; return; }
      if (this.gesture === 'moveBuild') {
        const g = this.ghost;
        if (g && g.valid && this.dragBuild !== null) { this.cmd({ c: 'move', bid: this.dragBuild, col: g.col, row: g.row }); audio.play('click'); }
        this.ghost = null; this.dragBuild = null; this.gesture = 'none';
        return;
      }
      if (this.gesture === 'none' && e.type === 'pointerup' && performance.now() - pt.t < 500) this.tap(e.clientX, e.clientY);
      this.gesture = 'none';
      this.dragBuild = null;
    };
    c.onpointerup = up; c.onpointercancel = up;
    c.onwheel = e => { e.preventDefault(); this.r.zoom(e.deltaY > 0 ? 1.1 : 0.9); };
    c.ondblclick = () => this.r.focus(this.me?.slot ?? 0, 0);
  }

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
          if (me.gold - UNITS[this.selCard].cost < UNITS[this.selCard].cost) { this.selCard = null; }
        }
        return;
      }
    }
    const b = Renderer.buildAt(m, me.pid, p.x, p.z);
    if (b) {
      this.selected = { pid: me.pid, bid: b.bid };
      this.openSheet('unit', b.bid);
      audio.play('click');
      return;
    }
    // partner's build: show info
    const partner = m.players[this.partnerPid()];
    const pb = partner ? Renderer.buildAt(m, partner.pid, p.x, p.z) : null;
    if (pb) { this.selected = { pid: partner.pid, bid: pb.bid }; this.openSheet('info', pb.defId); return; }
    this.selected = null;
    if (this.selCard) { this.selCard = null; }
    if (this.sheet) this.closeSheet();
  }

  // ------------------------------------------------------------------ sheets
  openSheet(s: Sheet, arg: string | number | null = null) {
    if (this.sheet === s && this.sheetArg === arg && s !== 'unit') { this.closeSheet(); return; }
    this.sheet = s; this.sheetArg = arg;
    audio.play('click');
    this.renderSheet();
  }
  closeSheet() { this.sheet = null; this.els.sheet.style.display = 'none'; if (this.selected && this.selected.pid === this.me?.pid) this.selected = null; }

  private renderSheet() {
    const S = this.els.sheet;
    const m = this.meta!, me = this.me!;
    if (!this.sheet) return;
    const scroll = S.scrollTop;
    clear(S);
    S.style.display = 'block';
    const title = (t: string) => h('h3', {}, t, h('button', { class: 'x', onclick: () => this.closeSheet() }, '✕'));
    switch (this.sheet) {
      case 'raiders': {
        if (m.settings.mode !== 'vsai') {
          S.append(title('📈 Investir'), h('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' }, 'Mode Survie : pas d\'adversaire. Convertis ton Éther en revenu permanent.'));
          S.append(h('button', { class: 'opt', disabled: me.ether < ECONOMY.investChunk, onclick: () => this.cmd({ c: 'invest' }) },
            h('div', { class: 't' }, h('b', {}, 'Investissement'), h('br'), `+${Math.round(ECONOMY.investChunk * ECONOMY.investRatio)} revenu par vague`),
            h('div', { class: 'p', style: 'color:var(--ether)' }, `${ECONOMY.investChunk}✨`)));
          break;
        }
        S.append(title('👹 Envoyer des Raiders'), h('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' }, 'Ils attaqueront la voie adverse à la prochaine vague. Chaque envoi augmente ton REVENU.'));
        for (const r of RAIDERS) {
          const locked = m.wave < r.unlockWave;
          const e = ENEMIES[r.enemy];
          S.append(h('button', { class: 'opt', disabled: locked || me.ether < r.cost, onclick: () => this.cmd({ c: 'raider', raider: r.id }) },
            h('div', { style: 'font-size:26px' }, r.category === 'eco' ? '💰' : '💥'),
            h('div', { class: 't' }, h('b', {}, r.name), ` (${r.category === 'eco' ? 'éco' : 'puissance'})`, h('br'),
              locked ? `🔒 Vague ${r.unlockWave}` : `+${r.income} revenu · ${Math.round(e.hp * raiderScale(m.wave))} PV · ${ATTACK_ICONS[e.attack]}${DEFENSE_ICONS[e.defense]}`),
            h('div', { class: 'p', style: 'color:var(--ether)' }, `${r.cost}✨`)));
        }
        if (me.raiderQueue.length) S.append(h('div', { class: 'muted', style: 'font-size:12px' }, `En file : ${me.raiderQueue.length} Raider(s)`));
        break;
      }
      case 'core': {
        const core = m.teams[me.team];
        S.append(title('🔷 Améliorer le Core (commun)'), h('p', { class: 'muted', style: 'font-size:12px;margin:0 0 8px' }, `Investissement collectif en Éther. PV ${fmt(core.hp)}/${fmt(core.maxHp)}`));
        for (const id of Object.keys(CORE.upgrades) as CoreUpgradeId[]) {
          const u = CORE.upgrades[id];
          const lvl = core.up[id];
          const max = lvl >= u.max;
          S.append(h('button', { class: 'opt', disabled: max || me.ether < u.costs[lvl], onclick: () => this.cmd({ c: 'core', up: id }) },
            h('div', { style: 'font-size:24px' }, u.icon),
            h('div', { class: 't' }, h('b', {}, `${u.name} ${lvl}/${u.max}`), h('br'), u.text),
            h('div', { class: 'p', style: 'color:var(--ether)' }, max ? 'MAX' : `${u.costs[lvl]}✨`)));
        }
        break;
      }
      case 'stats': {
        S.append(title('📊 Statistiques'));
        const g = h('div', { class: 'stats-grid' });
        const team = m.players.filter(p => p.team === me.team);
        g.append(h('b', {}, ''), ...team.map(p => h('b', { style: 'text-align:right' }, p.name.slice(0, 10))));
        const rows: [string, (p: PlayerView) => string][] = [
          ['Dégâts', p => fmt(p.stats.dmgDealt)], ['Dégâts tankés', p => fmt(p.stats.dmgTanked)], ['Or gagné', p => fmt(p.stats.goldEarned)],
          ['Éther produit', p => fmt(p.stats.etherProduced)], ['Travailleurs', p => String(p.workers)], ['Revenu', p => String(p.income)],
          ['Raiders', p => String(p.stats.raidersSent)], ['Fuites', p => String(p.stats.leaks)], ['DPS max', p => fmt(p.stats.maxDps)],
          ['Armée', p => fmt(p.builds.reduce((t, b) => t + b.value, 0))], ['Pouvoirs', p => p.powers.map(x => POWERS.find(y => y.id === x)?.icon).join(' ') || '—'],
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
      case 'unit': {
        const b = me.builds.find(x => x.bid === this.sheetArg);
        if (!b) { this.closeSheet(); return; }
        const u = UNITS[b.defId];
        const nx = u.evolvesTo ? UNITS[u.evolvesTo] : null;
        const refund = Math.floor(b.value * (b.placedWave === m.wave ? 1 : ECONOMY.sellRefund));
        S.append(title(`${unitIcon(b.defId)} ${u.name}`), this.unitStats(b.defId),
          h('div', { class: 'muted', style: 'font-size:12px;margin:4px 0' }, `Valeur ${b.value} 🪙 · dégâts infligés ${fmt(b.dmgTotal)}`));
        if (m.phase === 'build') {
          if (nx) S.append(h('button', { class: 'opt', disabled: me.gold < nx.cost, onclick: () => { this.cmd({ c: 'upgrade', bid: b.bid }); } },
            h('div', { style: 'font-size:24px' }, '⬆️'), h('div', { class: 't' }, h('b', {}, `Évoluer : ${nx.name}`), h('br'), nx.passiveText), h('div', { class: 'p', style: 'color:var(--gold)' }, `${nx.cost}🪙`)));
          S.append(h('button', { class: 'opt', onclick: () => { this.cmd({ c: 'sell', bid: b.bid }); this.closeSheet(); } },
            h('div', { style: 'font-size:24px' }, '♻️'), h('div', { class: 't' }, h('b', {}, 'Vendre'), h('br'), b.placedWave === m.wave ? 'Remboursement total (placée cette vague)' : '50 % remboursés'), h('div', { class: 'p', style: 'color:var(--gold)' }, `+${refund}🪙`)));
          S.append(h('div', { class: 'muted', style: 'font-size:11px' }, 'Astuce : glisse une unité placée pour la déplacer.'));
        }
        break;
      }
      case 'info': {
        const id = String(this.sheetArg);
        const u = UNITS[id];
        S.append(title(`${unitIcon(id)} ${u.name}`), h('div', { class: 'muted', style: 'font-size:12px' }, `T${u.tier} · ${roleLabel(id)} · ${u.cost}🪙`), h('p', { style: 'font-size:12px;margin:4px 0' }, u.description), this.unitStats(id));
        if (u.evolvesTo) S.append(h('div', { style: 'font-size:12px;margin-top:6px' }, `⬆️ Évolue en `, h('b', {}, UNITS[u.evolvesTo].name), ` (${UNITS[u.evolvesTo].cost}🪙)`));
        break;
      }
    }
    S.scrollTop = scroll;
  }

  private unitStats(id: string) {
    const u = UNITS[id];
    const eff = (Object.keys(DEFENSE_NAMES) as DefenseType[]).map(d => `${DEFENSE_ICONS[d]}${matrixArrow(DAMAGE_MATRIX[u.attack][d])}`).join(' ');
    return h('div', { style: 'font-size:12px;line-height:1.5' },
      `❤️ ${u.hp} PV · 🛡 ${Math.round(u.armor * 100)} % · ⚔️ ${u.dmg} × ${u.atkSpeed}/s · 🎯 ${u.range < 2 ? 'mêlée' : u.range + ' m'}`, h('br'),
      `Attaque ${ATTACK_ICONS[u.attack]} ${ATTACK_NAMES[u.attack]} (${eff})`, h('br'),
      `Défense ${DEFENSE_ICONS[u.defense]} ${DEFENSE_NAMES[u.defense]}`, h('br'),
      u.skillText !== '—' ? h('span', {}, '✦ ', u.skillText) : null, u.skillText !== '—' ? h('br') : null,
      h('span', { class: 'muted' }, '◆ ', u.passiveText));
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
      S.append(h('div', { class: 'muted', style: 'font-size:12px;margin:4px 0' }, 'Vitesse (commune aux deux joueurs)'), seg);
    } else S.append(h('div', { class: 'muted', style: 'font-size:12px' }, `Vitesse : x${m.speed} (réglée par l'hôte)`));
    const me = this.me!;
    S.append(h('button', { class: 'opt', style: 'margin-top:8px', onclick: () => { this.cmd({ c: 'pause', value: !me.pauseVote }); this.closeSheet(); } },
      h('div', { style: 'font-size:22px' }, '⏸'), h('div', { class: 't' }, h('b', {}, me.pauseVote ? 'Annuler la demande de pause' : this.session.role === 'solo' ? 'Pause' : 'Demander une pause'), h('br'), this.session.role === 'solo' ? '' : 'La partie se met en pause quand ton partenaire accepte.')));
    const partner = m.players[this.partnerPid()];
    if (partner?.pauseVote && !me.pauseVote) S.append(h('button', { class: 'btn primary small', style: 'width:100%;margin-bottom:6px', onclick: () => { this.cmd({ c: 'pause', value: true }); this.closeSheet(); } }, `Accepter la pause de ${partner.name}`));
    const vol = (label: string, val: number, set: (v: number) => void) => {
      const inp = h('input', { type: 'range', min: 0, max: 100, value: Math.round(val * 100), style: 'width:100%' }) as HTMLInputElement;
      inp.oninput = () => set(Number(inp.value) / 100);
      return h('div', { style: 'font-size:12px' }, label, inp);
    };
    S.append(vol('🔊 Effets', save.prefs.sfx, v => { save.prefs.sfx = v; audio.setVolumes(v, save.prefs.music); save.flush(); }));
    S.append(vol('🎵 Musique', save.prefs.music, v => { save.prefs.music = v; audio.setVolumes(save.prefs.sfx, v); save.flush(); }));
    S.append(h('button', { class: 'opt', onclick: () => { this.r.focus(this.me!.slot, 0); this.closeSheet(); } }, h('div', { style: 'font-size:22px' }, '🎯'), h('div', { class: 't' }, h('b', {}, 'Recentrer la caméra'))));
    if (m.teams.length > 1) S.append(h('button', { class: 'opt', onclick: () => { this.r.focus(this.me!.slot, 1); this.closeSheet(); } }, h('div', { style: 'font-size:22px' }, '👁'), h('div', { class: 't' }, h('b', {}, 'Observer l\'arène adverse'))));
    S.append(h('button', { class: 'opt', onclick: () => { if (confirm('Quitter la partie ?')) this.cb.exit(); } }, h('div', { style: 'font-size:22px' }, '🚪'), h('div', { class: 't' }, h('b', {}, 'Quitter la partie'))));
    S.append(h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `Partie ${this.session.code} · ${this.session.role === 'host' ? 'hôte' : this.session.role === 'guest' ? 'invité' : 'solo'}`));
  }

  private showPowerChoice(choice: string[]) {
    const modal = h('div', { class: 'screen transparent power-modal' },
      h('h2', { style: 'margin:0 0 4px' }, '✨ Choisis un POUVOIR'),
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
    const win = m.result.outcome === 'victory';
    const survival = m.settings.mode === 'survival';
    audio.setMood('off');
    audio.play(win ? 'victory' : 'defeat');
    const team = m.players.filter(p => p.team === me.team);
    const titles: string[] = [];
    const best = (f: (p: PlayerView) => number, label: string) => { const p = team.slice().sort((a, b) => f(b) - f(a))[0]; if (p && f(p) > 0) titles.push(`${label} : ${p.name}`); };
    best(p => p.income + p.workers * 4, '👑 ROI DE L\'ÉCONOMIE');
    best(p => -p.stats.leaks * 100 + p.stats.dmgTanked / 100, '🛡️ MEILLEURE DÉFENSE');
    best(p => p.stats.maxDps, '🔥 PLUS GROS DPS');
    best(p => p.stats.dmgDealt, '⚔️ SAUVEUR DU CORE');
    const tbl = h('table', { class: 'end-table' });
    tbl.append(h('tr', {}, h('th', {}, ''), ...team.map(p => h('th', {}, p.name))));
    const rows: [string, (p: PlayerView) => string][] = [
      ['Dégâts', p => fmt(p.stats.dmgDealt)], ['Dégâts tankés', p => fmt(p.stats.dmgTanked)], ['Or généré', p => fmt(p.stats.goldEarned)],
      ['Éther produit', p => fmt(p.stats.etherProduced)], ['Travailleurs max', p => String(p.stats.maxWorkers)], ['Raiders envoyés', p => String(p.stats.raidersSent)],
      ['Fuites', p => String(p.stats.leaks)], ['Dégâts au Core', p => fmt(p.stats.coreDamageCaused)], ['Meilleure unité', p => p.stats.bestUnit ? UNITS[p.stats.bestUnit].name : '—'],
      ['Valeur armée finale', p => fmt(p.builds.reduce((t, b) => t + b.value, 0))], ['DPS max', p => fmt(p.stats.maxDps)],
    ];
    for (const [l, f] of rows) tbl.append(h('tr', {}, h('td', {}, l), ...team.map(p => h('td', {}, f(p)))));
    // profile progression (local) + record
    const prof = save.profile;
    prof.games++; if (win) prof.wins++;
    prof.xp += 20 + m.wave * 5 + (win ? 50 : 0);
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
    const scr = h('div', { class: 'screen transparent' },
      h('div', { class: 'logo', style: `font-size:clamp(30px,7vw,60px);${win ? '' : 'filter:hue-rotate(150deg)'}` }, survival ? 'FIN DE LA SURVIE' : win ? 'VICTOIRE !' : 'DÉFAITE'),
      h('p', { class: 'muted center', style: 'margin:6px 0' }, m.result.reason, ` — vague ${m.result.wave}`),
      recordLine ? h('div', { class: 'code-big', style: 'font-size:clamp(18px,3.5vw,28px);letter-spacing:0.05em' }, recordLine) : null,
      h('div', { class: 'titles' }, ...titles.map(t => h('span', {}, t))),
      h('div', { class: 'card', style: 'width:min(640px,100%)' }, tbl),
      h('div', { class: 'menu row', style: 'margin-top:10px' },
        this.session.role !== 'guest' ? h('button', { class: 'btn primary', onclick: () => this.cb.rematch() }, '↻ Rejouer') : null,
        h('button', { class: 'btn', onclick: () => this.cb.exit() }, 'Menu')));
    this.root.append(scr);
  }
}
