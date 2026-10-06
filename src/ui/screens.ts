// Menus, lobby & options screens.
import { h, clear } from './dom';
import { save } from '../save/SaveSystem';
import { audio } from '../audio/AudioSystem';
import { GAME_NAME, VERSION, ONLINE } from '../config';
import type { LobbyState, Session } from '../net/Session';
import type { Difficulty, GameMode } from '../sim/state';

let current: HTMLElement | null = null;
export function show(el: HTMLElement) {
  current?.remove();
  current = el;
  document.body.append(el);
}
export function hideScreens() { current?.remove(); current = null; }

/** Small non-blocking message (replaces alert(), which freezes mobile browsers). */
export function notify(text: string) {
  const t = h('div', { class: 'toast', style: 'position:fixed;left:50%;top:calc(16px + var(--sat));transform:translateX(-50%);z-index:60' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

const DIFFS: [Difficulty, string][] = [['initiation', 'Initiation'], ['normal', 'Normal'], ['difficile', 'Difficile'], ['expert', 'Expert'], ['maitre', 'Maître']];

function nameField() {
  const inp = h('input', { class: 'field', maxlength: 16, placeholder: 'Ton pseudo', value: save.profile.name }) as HTMLInputElement;
  inp.oninput = () => { save.profile.name = inp.value.trim().slice(0, 16); save.flush(); };
  return inp;
}

function needName(): boolean {
  if (save.profile.name) return false;
  // highlight the pseudo field instead of a blocking alert()
  const f = document.querySelector<HTMLInputElement>('.screen input.field:not(.code)');
  if (f) {
    f.classList.remove('need'); void f.offsetWidth; f.classList.add('need');
    f.placeholder = 'Choisis d\'abord un pseudo';
    f.focus();
  } else notify('Choisis d\'abord un pseudo');
  return true;
}

function seg<T extends string | number>(opts: [T, string][], value: T, onPick: (v: T) => void, disabled = false) {
  const el = h('div', { class: 'seg' });
  const render = (v: T) => {
    clear(el);
    for (const [val, label] of opts) el.append(h('button', { class: val === v ? 'on' : '', disabled, onclick: () => { audio.play('click'); render(val); onPick(val); } }, label));
  };
  render(value);
  return el;
}

export interface MenuActions {
  duo(mode: GameMode): void;
  solo(mode: GameMode, waves: number, diff: Difficulty): void;
  tutorial(): void;
  resume(): void;
}

export function menuScreen(a: MenuActions) {
  const p = save.profile;
  const active = save.data.active;
  const scr = h('div', { class: 'screen' },
    h('h1', { class: 'logo' }, GAME_NAME, h('small', {}, 'TOWER DEFENSE COOPÉRATIF')),
    h('div', { class: 'menu' },
      h('div', { class: 'row' }, h('button', { class: 'iconbtn', style: 'font-size:26px;width:52px;min-height:52px', onclick: () => optionsScreen(() => show(menuScreen(a))) }, p.avatar), nameField()),
      active ? h('button', { class: 'btn gold', onclick: () => a.resume() }, `↻ Reprendre la partie ${active.code}`) : null,
      h('button', { class: 'btn primary', onclick: () => { audio.unlock(); if (!needName()) a.duo('vsai'); } }, '👥 Jouer à deux'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!needName()) soloScreen(a); } }, '🤖 Solo'),
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!needName()) survivalScreen(a); } }, '♾️ Survie')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!save.profile.name) { save.profile.name = 'Recrue'; save.flush(); } a.tutorial(); } }, `🎓 Tutoriel${p.tutorialDone ? '' : ' ★'}`),
        h('button', { class: 'btn', style: 'flex:1', onclick: () => optionsScreen(() => show(menuScreen(a))) }, '⚙️ Options')),
      h('div', { class: 'muted center', style: 'font-size:12px' }, `Niveau ${save.level()} · ${p.games} parties · ${p.wins} victoires · record survie : vague ${p.bestSurvival}`),
    ),
    h('div', { class: 'version' }, `v${VERSION}${ONLINE ? '' : ' · hors-ligne'}`));
  return scr;
}

function survivalScreen(a: MenuActions) {
  show(h('div', { class: 'screen' },
    h('h2', {}, '♾️ SURVIE'),
    h('p', { class: 'muted center' }, 'Pas d\'adversaire : tenez le plus longtemps possible. Après la vague 21, la faille devient infinie.'),
    h('div', { class: 'menu' },
      h('button', { class: 'btn primary', onclick: () => a.duo('survival') }, '👥 Survie à deux'),
      h('button', { class: 'btn', onclick: () => a.solo('survival', 9999, 'normal') }, '🤖 Survie avec une IA partenaire'),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, '← Retour'))));
}

function soloScreen(a: MenuActions) {
  let waves = 21, diff: Difficulty = 'normal';
  show(h('div', { class: 'screen' },
    h('h2', {}, '🤖 SOLO — toi + une IA alliée contre 2 IA'),
    h('div', { class: 'card col' },
      h('div', { class: 'muted' }, 'Durée'), seg<number>([[10, 'Courte (10 vagues)'], [21, 'Complète (21 vagues)']], waves, v => (waves = v)),
      h('div', { class: 'muted' }, 'Difficulté des adversaires'), seg<Difficulty>(DIFFS, diff, v => (diff = v)),
      h('button', { class: 'btn primary', onclick: () => a.solo('vsai', waves, diff) }, 'Jouer'),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, '← Retour'))));
}

export function duoScreen(mode: GameMode, onCreate: () => void, onJoin: (code: string) => void, back: () => void, prefill = '') {
  const code = h('input', { class: 'field code', maxlength: 5, placeholder: 'CODE', value: prefill, autocomplete: 'off', autocapitalize: 'characters' }) as HTMLInputElement;
  code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const scr = h('div', { class: 'screen' },
    h('h2', {}, mode === 'survival' ? '♾️ SURVIE À DEUX' : '👥 JOUER À DEUX'),
    h('div', { class: 'menu' },
      h('div', { class: 'row' }, h('span', { style: 'font-size:26px' }, save.profile.avatar), nameField()),
      h('button', { class: 'btn primary', onclick: () => { if (!needName()) onCreate(); } }, '✨ Créer une partie'),
      h('div', { class: 'card col', style: 'margin-top:6px' },
        h('div', { class: 'muted center' }, 'ou rejoindre avec le code de ton partenaire :'),
        code,
        h('button', { class: 'btn gold', onclick: () => { if (needName()) return; if (code.value.length !== 5) { notify('Le code fait 5 caractères.'); return; } onJoin(code.value); } }, '➜ Rejoindre')),
      h('button', { class: 'btn ghost', onclick: back }, '← Retour')));
  show(scr);
  if (prefill) setTimeout(() => code.focus(), 50);
}

export function loadingScreen(text: string) {
  show(h('div', { class: 'screen' }, h('div', { class: 'logo', style: 'font-size:28px' }, '⏳'), h('p', { class: 'center' }, text)));
}

export function errorScreen(text: string, back: () => void) {
  show(h('div', { class: 'screen' }, h('h2', {}, '😕 Oups'), h('p', { class: 'center' }, text), h('button', { class: 'btn primary', onclick: back }, 'Retour au menu')));
}

export function lobbyScreen(session: Session, leave: () => void) {
  const host = session.role === 'host';
  const root = h('div', { class: 'screen' });
  const link = `${location.origin}${import.meta.env.BASE_URL}?join=${session.code}`;
  let myReady = false;
  let lastKey = '';
  const render = (l: LobbyState) => {
    const key = JSON.stringify(l) + session.canStart();
    if (key === lastKey) return; // avoid replacing buttons under a finger every 2 s
    lastKey = key;
    clear(root);
    const me = l.players.find(p => p.uid === session.uid);
    myReady = !!me?.ready;
    const slots = [0, 1].map(i => {
      const p = l.players[i];
      return h('div', { class: `lp ${i ? 'b' : 'a'}` },
        h('div', { class: 'muted', style: 'font-size:12px' }, i === 0 ? 'JOUEUR 1 · voie gauche' : 'JOUEUR 2 · voie droite'),
        p ? h('div', { class: 'nm' }, `${p.avatar} ${p.name}${p.uid === session.uid ? ' (toi)' : ''}`) : h('div', { class: 'nm muted' }, '… en attente'),
        p ? h('span', { class: `badge ${p.ready ? 'ok' : 'wait'}` }, p.ready ? 'PRÊT' : 'PAS PRÊT') : h('span', { class: 'muted', style: 'font-size:12px' }, host ? 'Partage le code !' : ''));
    });
    const s = l.settings;
    const share = async () => {
      audio.play('click');
      const text = `Rejoins-moi sur ${GAME_NAME} ! Code : ${session.code}`;
      try {
        if (navigator.share) await navigator.share({ title: GAME_NAME, text, url: link });
        else { await navigator.clipboard.writeText(link); notify('Lien copié !'); }
      } catch { /* cancelled */ }
    };
    root.append(...[
      h('div', { class: 'muted' }, 'CODE DE LA PARTIE'),
      h('div', { class: 'code-big' }, session.code),
      host ? h('button', { class: 'btn small', onclick: share }, '🔗 Partager le lien d\'invitation') : null,
      h('div', { class: 'card col', style: 'margin-top:10px;width:min(640px,100%)' },
        h('div', { class: 'lobby-players' }, ...slots),
        h('div', { class: 'muted', style: 'font-size:12px' }, 'Mode'),
        seg<GameMode>([['vsai', '⚔️ Duo vs 2 IA'], ['survival', '♾️ Survie duo']], s.mode, v => session.setSettings({ mode: v }), !host),
        s.mode === 'vsai' ? h('div', { class: 'muted', style: 'font-size:12px' }, 'Durée') : null,
        s.mode === 'vsai' ? seg<number>([[10, '10 vagues (~12 min)'], [21, '21 vagues (~25 min)']], s.totalWaves, v => session.setSettings({ totalWaves: v }), !host) : null,
        s.mode === 'vsai' ? h('div', { class: 'muted', style: 'font-size:12px' }, 'Difficulté des IA adverses') : null,
        s.mode === 'vsai' ? seg<Difficulty>(DIFFS, s.difficulty, v => session.setSettings({ difficulty: v }), !host) : null,
        h('div', { class: 'row', style: 'margin-top:6px' },
          h('button', { class: `btn ${myReady ? '' : 'gold'}`, style: 'flex:1', onclick: () => { audio.play('ready'); session.setReady(!myReady); } }, myReady ? '✔ Prêt (annuler)' : 'Je suis PRÊT'),
          host ? h('button', { class: 'btn primary', style: 'flex:1', disabled: !session.canStart(), onclick: () => session.startGame() }, l.players.length < 2 ? 'Démarrer avec une IA' : 'DÉMARRER') : null),
        !host ? h('div', { class: 'muted center', style: 'font-size:12px' }, 'L\'hôte lance la partie quand vous êtes prêts.') : null,
      ),
      h('button', { class: 'btn ghost', onclick: leave }, '← Quitter le lobby'),
    ].filter(x => !!x) as HTMLElement[]);
  };
  render(session.lobby);
  show(root);
  return render;
}

export function optionsScreen(back: () => void) {
  const p = save.prefs;
  const avatars = h('div', { class: 'avatars' });
  const drawAv = () => {
    clear(avatars);
    for (const a of save.avatars()) avatars.append(h('button', { class: a === save.profile.avatar ? 'on' : '', onclick: () => { save.profile.avatar = a; save.flush(); drawAv(); } }, a));
  };
  drawAv();
  const range = (val: number, set: (v: number) => void) => {
    const r = h('input', { type: 'range', min: 0, max: 100, value: Math.round(val * 100), style: 'width:100%' }) as HTMLInputElement;
    r.oninput = () => { set(Number(r.value) / 100); audio.setVolumes(p.sfx, p.music); save.flush(); };
    return r;
  };
  let installEvt = (window as unknown as { __installEvt?: { prompt(): void } }).__installEvt;
  show(h('div', { class: 'screen' },
    h('h2', {}, '⚙️ Options'),
    h('div', { class: 'card col' },
      h('div', { class: 'muted' }, 'Pseudo'), nameField(),
      h('div', { class: 'muted' }, 'Avatar'), avatars,
      h('div', { class: 'muted' }, '🔊 Effets sonores'), range(p.sfx, v => (p.sfx = v)),
      h('div', { class: 'muted' }, '🎵 Musique'), range(p.music, v => (p.music = v)),
      h('div', { class: 'muted' }, 'Graphismes'),
      seg<string>([['high', 'HIGH'], ['medium', 'MEDIUM'], ['battery', 'ÉCONOMIE BATTERIE']], p.quality, v => { p.quality = v as typeof p.quality; save.flush(); }),
      seg<string>([['on', '📳 Vibrations ON'], ['off', 'OFF']], p.vibrate ? 'on' : 'off', v => { p.vibrate = v === 'on'; save.flush(); }),
      installEvt ? h('button', { class: 'btn', onclick: () => { installEvt?.prompt(); installEvt = undefined; } }, '📲 Installer l\'application') :
        h('div', { class: 'muted', style: 'font-size:12px' }, '📲 iPhone : Safari → Partager → « Sur l\'écran d\'accueil ». Android : menu ⋮ → « Installer l\'application ».'),
      h('button', { class: 'btn primary', onclick: back }, 'OK')),
    h('p', { class: 'muted center', style: 'font-size:11px;max-width:520px' }, `${GAME_NAME} v${VERSION} — jeu original. Univers, unités, sons et visuels créés pour ce projet.`)));
}
