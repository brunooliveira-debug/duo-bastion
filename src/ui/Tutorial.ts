// Short guided tutorial (7 steps) layered on a solo game.
import { tr } from '../i18n';
import { h, clear } from './dom';
import type { Session } from '../net/Session';
import type { MetaView, PlayerView } from '../net/snapshot';
import { save } from '../save/SaveSystem';

interface Step { text: string; until: string | 'button' }
const STEPS: Step[] = [
  { text: tr('<b>1/7 — Acheter une unité.</b> Fais <b>glisser une carte</b> du bas vers ta voie (cases vertes), ou touche une carte puis une case. Chaque unité coûte de l\'<b>Or 🪙</b>.'), until: 'build' },
  { text: tr('<b>2/7 — Positionner.</b> Les ennemis arrivent du <b>portail violet</b> et marchent vers le <b>Core</b>. Mets les <b>tanks 🛡️ devant</b> (côté portail) et les <b>tours de tir 🏹 derrière</b>. Des unités <b>voisines</b> créent des <b>synergies</b>. Touche une unité placée pour l\'<b>améliorer</b>.'), until: 'button' },
  { text: tr('<b>3/7 — Le combat.</b> Appuie sur <b>LANCER</b> pour démarrer la vague tout de suite. Pendant le combat, utilise tes <b>POUVOIRS</b> en bas à gauche !'), until: 'combat' },
  { text: tr('<b>4/7 — Travailleurs.</b> Entre deux vagues, achète un <b>OUVRIER ⛏️</b>. Moins d\'or pour défendre maintenant… mais il produit de l\'<b>Éther ✨</b> en continu.'), until: 'worker' },
  { text: tr('<b>5/7 — L\'Éther.</b> L\'Éther sert à <b>ATTAQUER ⚔️</b> l\'adversaire (envois d\'ennemis), à équiper le <b>BASTION</b> de modules et à améliorer tes <b>pouvoirs</b>. Économie ou défense ? C\'est tout le dilemme !'), until: 'button' },
  { text: tr('<b>6/7 — Raiders.</b> Dès que tu as 10 ✨, ouvre <b>ATTAQUER</b> et envoie des Grignoteurs : ton <b>REVENU 📈</b> (versé à chaque vague) augmente !'), until: 'raider' },
  { text: tr('<b>7/7 — Le Bastion.</b> Le Core est <b>commun</b> avec ton partenaire. Ouvre <b>BASTION</b> et installe un module (3 emplacements). Et surveille la jauge <b>RÉSONANCE</b> : elle monte quand vous vous entraidez, puis déclenche une capacité DUO !'), until: 'core' },
];

export class Tutorial {
  private i = 0;
  private el: HTMLDivElement;
  constructor(root: HTMLElement, private session: Session, private me: () => PlayerView | null) {
    this.el = h('div', { class: 'tip' });
    root.append(this.el);
    this.render();
  }
  private render() {
    clear(this.el);
    if (this.i >= STEPS.length) {
      this.el.innerHTML = tr('<b>Bravo !</b> Tu connais les bases. Survis aux 10 vagues — et invite ton/ta partenaire via <b>JOUER À DEUX</b> !');
      this.el.append(h('br'), h('button', { class: 'btn small primary', onclick: () => this.destroy() }, tr('Terminer')));
      save.profile.tutorialDone = true; save.flush();
      return;
    }
    const s = STEPS[this.i];
    const t = h('div', { html: s.text });
    this.el.append(t);
    if (s.until === 'button') this.el.append(h('button', { class: 'btn small primary', onclick: () => this.next() }, tr('Compris')));
    this.el.append(h('button', { class: 'btn small ghost', onclick: () => this.destroy() }, tr('Passer le tutoriel')));
  }
  private next() { this.i++; this.render(); }
  on(evt: string) { if (this.i < STEPS.length && STEPS[this.i].until === evt) this.next(); }
  update(m: MetaView) {
    // hide the tip during combat so the fight stays readable (except step 3 text)
    this.el.style.opacity = m.phase === 'combat' && this.i !== 3 ? '0.35' : '1';
    void this.session; void this.me;
  }
  destroy() { this.el.remove(); this.i = 99; }
}
