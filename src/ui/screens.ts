// Menus, lobby & options screens.
import { h, clear } from './dom';
import { save } from '../save/SaveSystem';
import { audio } from '../audio/AudioSystem';
import { GAME_NAME, VERSION, ONLINE } from '../config';
import type { LobbyState, Session } from '../net/Session';
import type { Difficulty, FactionChoice, GameMode } from '../sim/state';
import { FACTIONS, FACTION_IDS, UNITS, CATEGORY_NAMES, CATEGORY_COLORS } from '../data/units';
import { FACTION_POWERS } from '../data/powers';
import { duoAbility } from '../data/resonance';
import { ECONOMY } from '../data/economy';
import { icon, categoryIcon } from './icons';

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
  daily(): void;
}

/** Daily challenge: the same seed, the same world and the same armies for everyone today. */
export function dailyInfo(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (const ch of 'duo-bastion:' + day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const seed = (h >>> 0) % 2147483647;
  const a = FACTION_IDS[seed % FACTION_IDS.length];
  const rest = FACTION_IDS.filter(f => f !== a);
  const b = rest[Math.floor(seed / 7) % rest.length];
  return { day, seed, faction: a, partner: b };
}

export function menuScreen(a: MenuActions) {
  const p = save.profile;
  const active = save.data.active;
  const scr = h('div', { class: 'screen' },
    h('h1', { class: 'logo' }, GAME_NAME, h('small', {}, 'TOWER DEFENSE COOPÉRATIF')),
    h('div', { class: 'menu' },
      h('div', { class: 'row' }, h('button', { class: 'iconbtn', style: 'font-size:26px;width:52px;min-height:52px', onclick: () => optionsScreen(() => show(menuScreen(a))) }, p.avatar), nameField()),
      active ? h('button', { class: 'btn gold', onclick: () => a.resume() }, `↻ Reprendre la partie ${active.code}`) : null,
      h('button', { class: 'btn primary', onclick: () => { audio.unlock(); if (!needName()) a.duo('vsai'); } }, '👥 Jouer à deux · Coop ou Duel'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!needName()) soloScreen(a); } }, '🤖 Solo'),
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!needName()) survivalScreen(a); } }, '♾️ Survie')),
      h('button', { class: 'btn daily', onclick: () => { audio.unlock(); if (!needName()) dailyScreen(a); } }, `🗓️ Défi du jour${p.daily?.[dailyInfo().day] ? ` · record vague ${p.daily[dailyInfo().day].wave}` : ''}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!save.profile.name) { save.profile.name = 'Recrue'; save.flush(); } a.tutorial(); } }, `🎓 Tutoriel${p.tutorialDone ? '' : ' ★'}`),
        h('button', { class: 'btn', style: 'flex:1', onclick: () => optionsScreen(() => show(menuScreen(a))) }, '⚙️ Options')),
      h('div', { class: 'muted center', style: 'font-size:12px' }, `Niveau ${save.level()} · ${p.games} parties · ${p.wins} victoires · record survie : vague ${p.bestSurvival}`),
    ),
    h('div', { class: 'version' }, `v${VERSION}${ONLINE ? '' : ' · hors-ligne'}`));
  return scr;
}

function dailyScreen(a: MenuActions) {
  const d = dailyInfo();
  const best = save.profile.daily?.[d.day];
  const ab = duoAbility(d.faction, d.partner);
  show(h('div', { class: 'screen' },
    h('h2', {}, `🗓️ DÉFI DU JOUR — ${d.day}`),
    h('div', { class: 'card col' },
      h('p', { class: 'small', style: 'margin:0' }, 'Même graine pour tout le monde aujourd\'hui : mêmes vagues, mêmes événements, mêmes failles, mêmes anomalies. Survie : tenez le plus longtemps possible.'),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Ton armée'), armyBadge(d.faction), h('span', { class: 'muted small' }, '+ IA'), armyBadge(d.partner)),
      h('div', { class: 'reso-card', style: `--c1:#${ab.color.toString(16).padStart(6, '0')};--c2:#${ab.color2.toString(16).padStart(6, '0')}` }, h('small', {}, 'Résonance DUO du jour'), h('b', {}, ab.name), h('p', {}, ab.text)),
      h('div', { class: 'muted small' }, best ? `Ton record aujourd'hui : vague ${best.wave} · Core ${best.hp} PV · ${Math.floor(best.time / 60)} min` : 'Pas encore de record aujourd\'hui.'),
      h('button', { class: 'btn primary', onclick: () => a.daily() }, 'Relever le défi'),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, '← Retour'))));
}

function survivalScreen(a: MenuActions) {
  show(h('div', { class: 'screen' },
    h('h2', {}, '♾️ SURVIE'),
    h('p', { class: 'muted center' }, 'Pas d\'adversaire : tenez le plus longtemps possible. Après la vague 21, la faille devient infinie.'),
    h('div', { class: 'menu' },
      h('button', { class: 'btn primary', onclick: () => a.duo('survival') }, '👥 Survie à deux'),
      h('button', { class: 'btn', onclick: () => armyPicker((save.profile.faction || 'random') as FactionChoice, f => { save.profile.faction = f; save.flush(); a.solo('survival', 9999, 'normal'); }, () => survivalScreen(a), 'Lancer la survie') }, '🤖 Survie avec une IA partenaire'),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, '← Retour'))));
}

function soloScreen(a: MenuActions) {
  let waves = 21, diff: Difficulty = 'normal';
  const armyRow = h('div', { class: 'row' });
  const drawArmy = () => { clear(armyRow); armyRow.append(armyBadge((save.profile.faction || 'random') as FactionChoice), h('button', { class: 'btn small gold', onclick: () => armyPicker((save.profile.faction || 'random') as FactionChoice, f => { save.profile.faction = f; save.flush(); show(scr); drawArmy(); }, () => show(scr)) }, 'Choisir mon armée')); };
  drawArmy();
  const scr = h('div', { class: 'screen' },
    h('h2', {}, '🤖 SOLO — toi + une IA alliée contre 2 IA'),
    h('div', { class: 'card col' },
      h('div', { class: 'muted' }, 'Ton armée'), armyRow,
      h('div', { class: 'muted' }, 'Durée'), seg<number>([[10, 'Courte (10 vagues)'], [21, 'Complète (21 vagues)']], waves, v => (waves = v)),
      h('div', { class: 'muted' }, 'Difficulté des adversaires'), seg<Difficulty>(DIFFS, diff, v => (diff = v)),
      h('button', { class: 'btn primary', onclick: () => a.solo('vsai', waves, diff) }, 'Jouer'),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, '← Retour')));
  show(scr);
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
        h('div', { class: 'muted', style: 'font-size:12px' }, l.settings.mode === 'duel' ? (i === 0 ? 'JOUEUR 1 · camp bleu' : 'JOUEUR 2 · camp rouge') : i === 0 ? 'JOUEUR 1 · voie gauche' : 'JOUEUR 2 · voie droite'),
        p ? h('div', { class: 'nm' }, `${p.avatar} ${p.name}${p.uid === session.uid ? ' (toi)' : ''}`) : h('div', { class: 'nm muted' }, '… en attente'),
        p ? armyBadge(p.faction ?? 'random') : null,
        p && p.uid === session.uid ? h('button', { class: 'btn small', onclick: () => armyPicker(p.faction ?? 'random', f => { session.setFaction(f); show(root); }, () => show(root)) }, 'Choisir mon armée') : null,
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
        seg<GameMode>([['vsai', '🤝 Coop vs 2 IA'], ['duel', '⚔️ Duel 1 contre 1'], ['survival', '♾️ Survie duo']], s.mode, v => session.setSettings({ mode: v, totalWaves: v === 'survival' ? 9999 : s.totalWaves > 21 ? 21 : s.totalWaves }), !host),
        s.mode === 'duel' ? h('div', { class: 'muted small' }, 'Chacun défend son Core avec un allié IA et attaque l\'autre joueur : envois, malédictions, pouvoirs.') : null,
        s.mode !== 'survival' ? h('div', { class: 'muted', style: 'font-size:12px' }, 'Durée') : null,
        s.mode !== 'survival' ? seg<number>([[10, '10 vagues (~15 min)'], [21, '21 vagues (~30 min)']], s.totalWaves, v => session.setSettings({ totalWaves: v }), !host) : null,
        s.mode !== 'survival' ? h('div', { class: 'muted', style: 'font-size:12px' }, s.mode === 'duel' ? 'Niveau des alliés IA' : 'Difficulté des IA adverses') : null,
        s.mode !== 'survival' ? seg<Difficulty>(DIFFS, s.difficulty, v => session.setSettings({ difficulty: v }), !host) : null,
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
      h('div', { class: 'muted' }, 'Graphismes — ULTRA : carte graphique dédiée (NVIDIA / AMD), vise 144 i/s. Sur téléphone, MOYEN ou BAS.'),
      seg<string>([['ultra', 'ULTRA'], ['high', 'ÉLEVÉ'], ['medium', 'MOYEN'], ['battery', 'BAS (batterie)']], p.quality, v => { p.quality = v as typeof p.quality; save.flush(); }),
      seg<string>([['on', '🎯 Résolution dynamique ON'], ['off', 'OFF']], p.dynRes === false ? 'off' : 'on', v => { p.dynRes = v === 'on'; save.flush(); }),
      h('button', { class: 'btn small', onclick: () => { save.flush(); location.href = `${import.meta.env.BASE_URL}?bench`; } }, '⏱️ Test de performance (20 s)'),
      h('div', { class: 'muted' }, 'Confort'),
      seg<number>([[1, '🎥 Secousses normales'], [0.4, 'Réduites'], [0, 'Aucune']], p.shake ?? 1, v => { p.shake = v; save.flush(); }),
      seg<string>([['on', '⚡ Flashs ON'], ['off', 'OFF']], p.flash === false ? 'off' : 'on', v => { p.flash = v === 'on'; save.flush(); }),
      seg<string>([['on', '📳 Vibrations ON'], ['off', 'OFF']], p.vibrate ? 'on' : 'off', v => { p.vibrate = v === 'on'; save.flush(); }),
      installEvt ? h('button', { class: 'btn', onclick: () => { installEvt?.prompt(); installEvt = undefined; } }, '📲 Installer l\'application') :
        h('div', { class: 'muted', style: 'font-size:12px' }, '📲 iPhone : Safari → Partager → « Sur l\'écran d\'accueil ». Android : menu ⋮ → « Installer l\'application ».'),
      h('button', { class: 'btn primary', onclick: back }, 'OK')),
    h('p', { class: 'muted center', style: 'font-size:11px;max-width:520px' }, `${GAME_NAME} v${VERSION} — jeu original. Univers, unités, sons et visuels créés pour ce projet.`)));
}

// ---------------------------------------------------------------- army (faction) choice

export function armyBadge(f: FactionChoice) {
  if (f === 'random') return h('span', { class: 'armybadge rnd' }, '🎲 Aléatoire');
  const d = FACTIONS[f];
  return h('span', { class: 'armybadge', style: `--fc:${d.color}` }, d.name, h('small', {}, d.title));
}

/** Full-screen army picker: list on the left, details (units, powers, strengths, weaknesses, style) on the right. */
export function armyPicker(current: FactionChoice, onPick: (f: FactionChoice) => void, onBack: () => void, okLabel = 'Choisir cette armée') {
  let sel: FactionChoice = current;
  const list = h('div', { class: 'armylist' });
  const detail = h('div', { class: 'armydetail' });
  const draw = () => {
    clear(list);
    for (const f of [...FACTION_IDS, 'random'] as FactionChoice[]) {
      const d = f === 'random' ? null : FACTIONS[f];
      list.append(h('button', { class: `armyitem${sel === f ? ' on' : ''}`, style: d ? `--fc:${d.color}` : '--fc:#c8b8ff', onclick: () => { sel = f; audio.play('click'); draw(); } },
        h('b', {}, d ? d.name : '🎲 Aléatoire'), h('small', {}, d ? d.title : `Bonus +${ECONOMY.randomFactionGold} or, +25 % XP`)));
    }
    clear(detail);
    if (sel === 'random') {
      detail.append(h('h3', {}, '🎲 Armée aléatoire'), h('p', {}, 'Le jeu t\'attribue une armée au lancement de la partie.'),
        h('div', { class: 'pros' }, h('b', {}, 'Récompense : '), `+${ECONOMY.randomFactionGold} pièces d'or au départ et +25 % d'expérience en fin de partie.`),
        h('p', { class: 'muted small' }, 'Parfait pour apprendre toutes les armées et varier les parties.'));
    } else {
      const d = FACTIONS[sel];
      detail.append(
        h('h3', { style: `color:${d.color}` }, d.name, h('small', {}, ` — ${d.title}`)),
        h('p', { class: 'small' }, d.style),
        h('div', { class: 'pc' }, h('div', { class: 'pros' }, ...d.strengths.flatMap(t => [h('span', {}, '✔ ' + t), h('br')])), h('div', { class: 'cons' }, ...d.weaknesses.flatMap(t => [h('span', {}, '✖ ' + t), h('br')]))),
        h('div', { class: 'sect' }, 'Doctrine & entraide'),
        h('div', { class: 'armypowers' },
          h('div', { class: 'ap' }, h('span', { html: icon('star', 22, d.color) }), h('div', {}, h('b', {}, `Doctrine — ${d.doctrine.name}`), h('small', {}, d.doctrine.text))),
          h('div', { class: 'ap' }, h('span', { html: icon('users', 22, '#7DFFB0') }), h('div', {}, h('b', {}, `Entraide — ${d.help.name}`), h('small', {}, d.help.text)))),
        h('div', { class: 'sect' }, 'Unités'),
        h('div', { class: 'armyunits' }, ...d.units.map(id => {
          const u = UNITS[id];
          return h('div', { class: 'au', style: `--cat:${CATEGORY_COLORS[u.category]}` },
            h('span', { class: 'cat', html: icon(categoryIcon(u.category), 14, '#14112A', 3) }),
            h('div', {}, h('b', {}, u.name), h('small', {}, `${CATEGORY_NAMES[u.category]} · ${u.cost} or`), h('small', { class: 'muted' }, u.passiveText)));
        })),
        h('div', { class: 'sect' }, 'Pouvoirs de commandant'),
        h('div', { class: 'armypowers' }, ...FACTION_POWERS[sel].map(p => h('div', { class: 'ap' }, h('span', { html: icon(p.icon, 22, '#FFC233') }), h('div', {}, h('b', {}, p.name), h('small', {}, p.text))))),
      );
    }
    detail.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', style: 'flex:1', onclick: () => { audio.play('ready'); onPick(sel); } }, okLabel), h('button', { class: 'btn ghost', onclick: onBack }, '← Retour')));
  };
  draw();
  show(h('div', { class: 'screen armyscreen' }, h('h2', {}, '⚔️ Choisis ton armée'), h('div', { class: 'armywrap' }, list, detail)));
}
