// Menus, lobby & options screens.
import { tr } from '../i18n';
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
import { codexScreen, companyScreen } from './codex';
import { validateCompany, companyLabel, companyCommander } from '../data/roster';
import { dailyInfo } from '../sim/daily';
import { fetchDailyScores, listPublicLobbies, myUid } from '../net/backend';
import { LANG, LANGS, setLang, type Lang } from '../i18n';

import { show, hideScreens } from './screenHost';
export { show, hideScreens, dailyInfo };

const MODE_LABEL: Record<string, string> = { vsai: tr('🤝 Coop vs 2 IA'), duel: tr('⚔️ Duel 1 contre 1'), survival: tr('♾️ Survie duo') };
const fmtTime = (sec: number) => tr('{0} min {1} s', Math.floor(sec / 60), String(Math.floor(sec % 60)).padStart(2, '0'));

/** Small non-blocking message (replaces alert(), which freezes mobile browsers). */
export function notify(text: string) {
  const t = h('div', { class: 'toast', style: 'position:fixed;left:50%;top:calc(16px + var(--sat));transform:translateX(-50%);z-index:60' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

const DIFFS: [Difficulty, string][] = [['initiation', tr('Initiation')], ['normal', tr('Normal')], ['difficile', tr('Difficile')], ['expert', tr('Expert')], ['maitre', tr('Maître')]];

function nameField() {
  const inp = h('input', { class: 'field', maxlength: 16, placeholder: tr('Ton pseudo'), value: save.profile.name }) as HTMLInputElement;
  inp.oninput = () => { save.profile.name = inp.value.trim().slice(0, 16); save.flush(); };
  return inp;
}

function needName(): boolean {
  if (save.profile.name) return false;
  // highlight the pseudo field instead of a blocking alert()
  const f = document.querySelector<HTMLInputElement>('.screen input.field:not(.code)');
  if (f) {
    f.classList.remove('need'); void f.offsetWidth; f.classList.add('need');
    f.placeholder = tr('Choisis d\'abord un pseudo');
    f.focus();
  } else notify(tr('Choisis d\'abord un pseudo'));
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

export function menuScreen(a: MenuActions) {
  const p = save.profile;
  const active = save.data.active;
  const scr = h('div', { class: 'screen' },
    h('h1', { class: 'logo' }, GAME_NAME, h('small', {}, tr('TOWER DEFENSE COOPÉRATIF'))),
    h('div', { class: 'menu' },
      h('div', { class: 'row' }, h('button', { class: 'iconbtn', style: 'font-size:26px;width:52px;min-height:52px', onclick: () => optionsScreen(() => show(menuScreen(a))) }, p.avatar), nameField()),
      active ? h('button', { class: 'btn gold', onclick: () => a.resume() }, tr('↻ Reprendre la partie {0}', active.code)) : null,
      h('button', { class: 'btn primary', onclick: () => { audio.unlock(); if (!needName()) a.duo('vsai'); } }, tr('👥 Jouer à deux · Coop ou Duel')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!needName()) soloScreen(a); } }, tr('🤖 Solo')),
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!needName()) survivalScreen(a); } }, tr('♾️ Survie'))),
      h('button', { class: 'btn daily', onclick: () => { audio.unlock(); if (!needName()) dailyScreen(a); } }, tr('🗓️ Défi du jour{0}', p.daily?.[dailyInfo().day] ? tr(' · record vague {0}', p.daily[dailyInfo().day].wave) : '')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', style: 'flex:1', onclick: () => { audio.unlock(); if (!save.profile.name) { save.profile.name = tr('Recrue'); save.flush(); } a.tutorial(); } }, tr('🎓 Tutoriel{0}', p.tutorialDone ? '' : ' ★')),
        h('button', { class: 'btn', style: 'flex:1', onclick: () => optionsScreen(() => show(menuScreen(a))) }, tr('⚙️ Options'))),
      h('button', { class: 'btn', onclick: () => codexScreen(() => show(menuScreen(a))) }, tr('📖 Codex des unités & armées')),
      h('div', { class: 'muted center', style: 'font-size:12px' }, tr('Niveau {0} · {1} parties · {2} victoires · record survie : vague {3}', save.level(), p.games, p.wins, p.bestSurvival)),
    ),
    h('div', { class: 'version' }, `v${VERSION}${ONLINE ? '' : tr(' · hors-ligne')}`));
  return scr;
}

/** v0.8: online leaderboard of the day (server-validated scores), the local player highlighted. */
export function dailyBoard(day: string) {
  const box = h('div', { class: 'board' });
  if (!ONLINE) { box.append(h('div', { class: 'muted small center' }, tr('Classement en ligne indisponible hors-ligne.'))); return box; }
  box.append(h('div', { class: 'muted small center' }, tr('⏳ Chargement du classement…')));
  fetchDailyScores(day).then(rows => {
    clear(box);
    if (!rows.length) { box.append(h('div', { class: 'muted small center' }, tr('Personne n\'a encore validé de score aujourd\'hui : sois le premier !'))); return; }
    const me = myUid();
    const tbl = h('table', { class: 'end-table board-table' }, h('tr', {}, h('th', {}, '#'), h('th', {}, tr('Joueur')), h('th', {}, tr('Vague')), h('th', {}, tr('Temps'))));
    rows.slice(0, 20).forEach((r, i) => tbl.append(h('tr', { class: r.user_id === me ? 'me' : '' }, h('td', {}, String(i + 1)), h('td', {}, r.pseudo + (r.user_id === me ? tr(' (toi)') : '')), h('td', {}, String(r.wave)), h('td', {}, fmtTime(r.seconds)))));
    const mine = rows.findIndex(r => r.user_id === me);
    if (mine >= 20) { const r = rows[mine]; tbl.append(h('tr', { class: 'me' }, h('td', {}, String(mine + 1)), h('td', {}, r.pseudo + tr(' (toi)')), h('td', {}, String(r.wave)), h('td', {}, fmtTime(r.seconds)))); }
    box.append(tbl, h('div', { class: 'muted small center' }, tr('{0} joueur(s) classé(s) · scores vérifiés par le serveur (rejeu de la partie)', rows.length)));
  });
  return box;
}

function dailyScreen(a: MenuActions) {
  const d = dailyInfo();
  const best = save.profile.daily?.[d.day];
  const ab = duoAbility(d.faction, d.partner);
  show(h('div', { class: 'screen' },
    h('h2', {}, tr('🗓️ DÉFI DU JOUR — {0}', d.day)),
    h('div', { class: 'card col', style: 'width:min(720px,100%)' },
      h('p', { class: 'small', style: 'margin:0' }, tr('Même graine pour tout le monde aujourd\'hui : mêmes vagues, mêmes événements, mêmes failles, mêmes anomalies. Survie : tenez le plus longtemps possible.')),
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, tr('Ton armée')), armyBadge(d.faction), h('span', { class: 'muted small' }, tr('+ IA')), armyBadge(d.partner)),
      h('div', { class: 'reso-card', style: `--c1:#${ab.color.toString(16).padStart(6, '0')};--c2:#${ab.color2.toString(16).padStart(6, '0')}` }, h('small', {}, tr('Résonance DUO du jour')), h('b', {}, ab.name), h('p', {}, ab.text)),
      h('div', { class: 'muted small' }, best ? tr('Ton record aujourd\'hui : vague {0} · {1}{2}', best.wave, fmtTime(best.time), best.rank ? tr(' · classé {0}e', best.rank) : '') : tr('Pas encore de record aujourd\'hui.')),
      h('div', { class: 'sect' }, tr('🏆 Classement du jour')),
      dailyBoard(d.day),
      h('button', { class: 'btn primary', onclick: () => a.daily() }, tr('Relever le défi')),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, tr('← Retour')))));
}

function survivalScreen(a: MenuActions) {
  show(h('div', { class: 'screen' },
    h('h2', {}, tr('♾️ SURVIE')),
    h('p', { class: 'muted center' }, tr('Pas d\'adversaire : tenez le plus longtemps possible. Après la vague 21, la faille devient infinie.')),
    h('div', { class: 'menu' },
      h('button', { class: 'btn primary', onclick: () => a.duo('survival') }, tr('👥 Survie à deux')),
      h('button', { class: 'btn', onclick: () => armyPicker((save.profile.faction || 'random') as FactionChoice, (f, roster) => { save.profile.faction = f; save.profile.roster = roster; save.flush(); a.solo('survival', 9999, 'normal'); }, () => survivalScreen(a), tr('Lancer la survie')) }, tr('🤖 Survie avec une IA partenaire')),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, tr('← Retour')))));
}

function soloScreen(a: MenuActions) {
  let waves = 21, diff: Difficulty = 'normal';
  const armyRow = h('div', { class: 'row' });
  const drawArmy = () => { clear(armyRow); armyRow.append(armyBadge((save.profile.faction || 'random') as FactionChoice, save.profile.roster), h('button', { class: 'btn small gold', onclick: () => armyPicker((save.profile.faction || 'random') as FactionChoice, (f, roster) => { save.profile.faction = f; save.profile.roster = roster; save.flush(); show(scr); drawArmy(); }, () => show(scr)) }, tr('Choisir mon armée'))); };
  drawArmy();
  const scr = h('div', { class: 'screen' },
    h('h2', {}, tr('🤖 SOLO — toi + une IA alliée contre 2 IA')),
    h('div', { class: 'card col' },
      h('div', { class: 'muted' }, tr('Ton armée')), armyRow,
      h('div', { class: 'muted' }, tr('Durée')), seg<number>([[10, tr('Courte (10 vagues)')], [21, tr('Complète (21 vagues)')]], waves, v => (waves = v)),
      h('div', { class: 'muted' }, tr('Difficulté des adversaires')), seg<Difficulty>(DIFFS, diff, v => (diff = v)),
      h('button', { class: 'btn primary', onclick: () => a.solo('vsai', waves, diff) }, tr('Jouer')),
      h('button', { class: 'btn ghost', onclick: () => show(menuScreen(a)) }, tr('← Retour'))));
  show(scr);
}

export interface DuoActions { onCreate(): void; onJoin(code: string): void; onQuick(): void; back(): void }

export function duoScreen(mode: GameMode, acts: DuoActions, prefill = '') {
  const code = h('input', { class: 'field code', maxlength: 5, placeholder: tr('CODE'), value: prefill, autocomplete: 'off', autocapitalize: 'characters' }) as HTMLInputElement;
  code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  // v0.8: public lobbies waiting for a partner (refreshed while the screen is shown)
  const list = h('div', { class: 'col', style: 'gap:6px' });
  const refresh = async () => {
    if (!document.body.contains(scr)) return;
    const rows = await listPublicLobbies(VERSION);
    if (!document.body.contains(scr)) return;
    clear(list);
    if (!rows.length) list.append(h('div', { class: 'muted small center' }, tr('Personne n\'attend pour l\'instant. Lance une Partie rapide : tu seras visible ici jusqu\'à l\'arrivée d\'un partenaire.')));
    for (const r of rows) list.append(h('div', { class: 'row pub' }, h('span', {}, h('b', {}, r.host_pseudo), h('small', { class: 'muted' }, ` · ${MODE_LABEL[r.mode] ?? r.mode}`)), h('button', { class: 'btn small gold', onclick: () => { if (!needName()) acts.onJoin(r.code); } }, tr('➜ Rejoindre'))));
    setTimeout(refresh, 8000);
  };
  const scr = h('div', { class: 'screen' },
    h('h2', {}, mode === 'survival' ? tr('♾️ SURVIE À DEUX') : tr('👥 JOUER À DEUX')),
    h('div', { class: 'menu' },
      h('div', { class: 'row' }, h('span', { style: 'font-size:26px' }, save.profile.avatar), nameField()),
      ONLINE ? h('button', { class: 'btn primary', onclick: () => { if (!needName()) acts.onQuick(); } }, tr('⚡ Partie rapide · trouver un partenaire')) : null,
      ONLINE ? h('div', { class: 'muted small center' }, tr('Rejoint le premier joueur qui attend, sinon ouvre une partie visible par tous.')) : null,
      h('button', { class: ONLINE ? 'btn' : 'btn primary', onclick: () => { if (!needName()) acts.onCreate(); } }, tr('✨ Créer une partie privée · inviter un ami')),
      h('div', { class: 'card col', style: 'margin-top:6px' },
        h('div', { class: 'muted center' }, tr('ou rejoindre avec le code de ton partenaire :')),
        code,
        h('button', { class: 'btn gold', onclick: () => { if (needName()) return; if (code.value.length !== 5) { notify(tr('Le code fait 5 caractères.')); return; } acts.onJoin(code.value); } }, tr('➜ Rejoindre'))),
      ONLINE ? h('div', { class: 'card col', style: 'margin-top:6px' }, h('div', { class: 'muted center' }, tr('🌐 Parties publiques en attente')), list) : null,
      h('button', { class: 'btn ghost', onclick: acts.back }, tr('← Retour'))));
  show(scr);
  if (ONLINE) refresh();
  if (prefill) setTimeout(() => code.focus(), 50);
}

export function loadingScreen(text: string) {
  show(h('div', { class: 'screen' }, h('div', { class: 'logo', style: 'font-size:28px' }, '⏳'), h('p', { class: 'center' }, text)));
}

export function errorScreen(text: string, back: () => void) {
  show(h('div', { class: 'screen' }, h('h2', {}, tr('😕 Oups')), h('p', { class: 'center' }, text), h('button', { class: 'btn primary', onclick: back }, tr('Retour au menu'))));
}

export function lobbyScreen(session: Session, leave: () => void) {
  const host = session.role === 'host';
  const root = h('div', { class: 'screen' });
  const link = `${location.origin}${import.meta.env.BASE_URL}?join=${session.code}`;
  let myReady = false;
  let lastKey = '';
  const render = (l: LobbyState) => {
    const key = JSON.stringify(l) + session.canStart() + session.isPublic;
    if (key === lastKey) return; // avoid replacing buttons under a finger every 2 s
    lastKey = key;
    clear(root);
    const me = l.players.find(p => p.uid === session.uid);
    myReady = !!me?.ready;
    const slots = [0, 1].map(i => {
      const p = l.players[i];
      return h('div', { class: `lp ${i ? 'b' : 'a'}` },
        h('div', { class: 'muted', style: 'font-size:12px' }, l.settings.mode === 'duel' ? (i === 0 ? tr('JOUEUR 1 · camp bleu') : tr('JOUEUR 2 · camp rouge')) : i === 0 ? tr('JOUEUR 1 · voie gauche') : tr('JOUEUR 2 · voie droite')),
        p ? h('div', { class: 'nm' }, `${p.avatar} ${p.name}${p.uid === session.uid ? tr(' (toi)') : ''}`) : h('div', { class: 'nm muted' }, tr('… en attente')),
        p ? armyBadge(p.faction ?? 'random', p.roster) : null,
        p && p.uid === session.uid ? h('button', { class: 'btn small', onclick: () => armyPicker(p.faction ?? 'random', (f, roster) => { session.setFaction(f, roster); show(root); }, () => show(root)) }, tr('Choisir mon armée')) : null,
        p ? h('span', { class: `badge ${p.ready ? 'ok' : 'wait'}` }, p.ready ? tr('PRÊT') : tr('PAS PRÊT')) : h('span', { class: 'muted', style: 'font-size:12px' }, host ? tr('Partage le code !') : ''));
    });
    const s = l.settings;
    const share = async () => {
      audio.play('click');
      const text = tr('Rejoins-moi sur {0} ! Code : {1}', GAME_NAME, session.code);
      try {
        if (navigator.share) await navigator.share({ title: GAME_NAME, text, url: link });
        else { await navigator.clipboard.writeText(link); notify(tr('Lien copié !')); }
      } catch { /* cancelled */ }
    };
    root.append(...[
      h('div', { class: 'muted' }, tr('CODE DE LA PARTIE')),
      h('div', { class: 'code-big' }, session.code),
      host ? h('button', { class: 'btn small', onclick: share }, tr('🔗 Partager le lien d\'invitation')) : null,
      h('div', { class: 'card col', style: 'margin-top:10px;width:min(640px,100%)' },
        host && ONLINE ? h('div', { class: 'row', style: 'align-items:center;justify-content:center' }, h('span', { class: 'muted', style: 'font-size:12px' }, tr('🌐 Partie rapide')), seg<string>([['on', tr('Visible par tous')], ['off', tr('Sur invitation')]], session.isPublic ? 'on' : 'off', v => session.setPublic(v === 'on'))) : null,
        session.isPublic && l.players.length < 2 ? h('div', { class: 'muted small center' }, tr('🔎 En attente d\'un joueur… Ta partie est visible dans « Partie rapide ». Tu peux aussi démarrer avec une IA.')) : null,
        h('div', { class: 'lobby-players' }, ...slots),
        h('div', { class: 'muted', style: 'font-size:12px' }, tr('Mode')),
        seg<GameMode>([['vsai', tr('🤝 Coop vs 2 IA')], ['duel', tr('⚔️ Duel 1 contre 1')], ['survival', tr('♾️ Survie duo')]], s.mode, v => session.setSettings({ mode: v, totalWaves: v === 'survival' ? 9999 : s.totalWaves > 21 ? 21 : s.totalWaves }), !host),
        s.mode === 'duel' ? h('div', { class: 'muted small' }, tr('Chacun défend son Core avec un allié IA et attaque l\'autre joueur : envois, malédictions, pouvoirs.')) : null,
        s.mode !== 'survival' ? h('div', { class: 'muted', style: 'font-size:12px' }, tr('Durée')) : null,
        s.mode !== 'survival' ? seg<number>([[10, tr('10 vagues (~15 min)')], [21, tr('21 vagues (~30 min)')]], s.totalWaves, v => session.setSettings({ totalWaves: v }), !host) : null,
        s.mode !== 'survival' ? h('div', { class: 'muted', style: 'font-size:12px' }, s.mode === 'duel' ? tr('Niveau des alliés IA') : tr('Difficulté des IA adverses')) : null,
        s.mode !== 'survival' ? seg<Difficulty>(DIFFS, s.difficulty, v => session.setSettings({ difficulty: v }), !host) : null,
        h('div', { class: 'row', style: 'margin-top:6px' },
          h('button', { class: `btn ${myReady ? '' : 'gold'}`, style: 'flex:1', onclick: () => { audio.play('ready'); session.setReady(!myReady); } }, myReady ? tr('✔ Prêt (annuler)') : tr('Je suis PRÊT')),
          host ? h('button', { class: 'btn primary', style: 'flex:1', disabled: !session.canStart(), onclick: () => session.startGame() }, l.players.length < 2 ? tr('Démarrer avec une IA') : tr('DÉMARRER')) : null),
        !host ? h('div', { class: 'muted center', style: 'font-size:12px' }, tr('L\'hôte lance la partie quand vous êtes prêts.')) : null,
      ),
      h('button', { class: 'btn ghost', onclick: leave }, tr('← Quitter le lobby')),
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
    h('h2', {}, tr('⚙️ Options')),
    h('div', { class: 'card col' },
      h('div', { class: 'muted' }, tr('Pseudo')), nameField(),
      h('div', { class: 'muted' }, tr('Avatar')), avatars,
      h('div', { class: 'muted' }, tr('🌐 Langue / Language')),
      seg<Lang>(LANGS, LANG, v => { if (v !== LANG) { setLang(v); location.reload(); } }),
      h('div', { class: 'muted' }, tr('🔊 Effets sonores')), range(p.sfx, v => (p.sfx = v)),
      h('div', { class: 'muted' }, tr('🎵 Musique')), range(p.music, v => (p.music = v)),
      h('div', { class: 'muted' }, tr('Graphismes — ULTRA : carte graphique dédiée (NVIDIA / AMD), vise 144 i/s. Sur téléphone, MOYEN ou BAS.')),
      seg<string>([['ultra', tr('ULTRA')], ['high', tr('ÉLEVÉ')], ['medium', tr('MOYEN')], ['battery', tr('BAS (batterie)')]], p.quality, v => { p.quality = v as typeof p.quality; save.flush(); }),
      seg<string>([['on', tr('🎯 Résolution dynamique ON')], ['off', tr('OFF')]], p.dynRes === false ? 'off' : 'on', v => { p.dynRes = v === 'on'; save.flush(); }),
      h('button', { class: 'btn small', onclick: () => { save.flush(); location.href = `${import.meta.env.BASE_URL}?bench`; } }, tr('⏱️ Test de performance (20 s)')),
      h('div', { class: 'muted' }, tr('Confort')),
      seg<number>([[1, tr('🎥 Secousses normales')], [0.4, tr('Réduites')], [0, tr('Aucune')]], p.shake ?? 1, v => { p.shake = v; save.flush(); }),
      seg<string>([['on', tr('⚡ Flashs ON')], ['off', tr('OFF')]], p.flash === false ? 'off' : 'on', v => { p.flash = v === 'on'; save.flush(); }),
      seg<string>([['on', tr('📳 Vibrations ON')], ['off', tr('OFF')]], p.vibrate ? 'on' : 'off', v => { p.vibrate = v === 'on'; save.flush(); }),
      installEvt ? h('button', { class: 'btn', onclick: () => { installEvt?.prompt(); installEvt = undefined; } }, tr('📲 Installer l\'application')) :
        h('div', { class: 'muted', style: 'font-size:12px' }, tr('📲 iPhone : Safari → Partager → « Sur l\'écran d\'accueil ». Android : menu ⋮ → « Installer l\'application ».')),
      h('button', { class: 'btn primary', onclick: back }, tr('OK'))),
    h('p', { class: 'muted center', style: 'font-size:11px;max-width:520px' }, tr('{0} v{1} — jeu original. Univers, unités, sons et visuels créés pour ce projet.', GAME_NAME, VERSION))));
}

// ---------------------------------------------------------------- army (faction) choice

export function armyBadge(f: FactionChoice, roster?: string[] | null) {
  if (f === 'random') return h('span', { class: 'armybadge rnd' }, tr('🎲 Aléatoire'));
  const d = FACTIONS[f];
  const company = validateCompany(roster);
  if (company) return h('span', { class: 'armybadge', style: `--fc:${d.color}` }, tr('🧩 Compagnie mixte'), h('small', {}, tr('{0} · commandant {1}', companyLabel(company), d.title)));
  return h('span', { class: 'armybadge', style: `--fc:${d.color}` }, d.name, h('small', {}, d.title));
}

/** Full-screen army picker: list on the left, details (units, powers, strengths, weaknesses, style) on the right. */
export function armyPicker(current: FactionChoice, onPick: (f: FactionChoice, roster: string[] | null) => void, onBack: () => void, okLabel = tr('Choisir cette armée')) {
  type Pick = FactionChoice | 'company';
  const companyCommanderOf = (c: string[]) => companyCommander(c, save.profile.faction);
  let sel: Pick = validateCompany(save.profile.roster) && current !== 'random' ? 'company' : current;
  const list = h('div', { class: 'armylist' });
  const detail = h('div', { class: 'armydetail' });
  const draw = () => {
    clear(list);
    for (const f of [...FACTION_IDS, 'random', 'company'] as Pick[]) {
      const d = f === 'random' || f === 'company' ? null : FACTIONS[f];
      list.append(h('button', { class: `armyitem${sel === f ? ' on' : ''}`, style: d ? `--fc:${d.color}` : f === 'company' ? '--fc:#ffe08a' : '--fc:#c8b8ff', onclick: () => { sel = f; audio.play('click'); draw(); } },
        h('b', {}, d ? d.name : f === 'company' ? tr('🧩 Compagnie mixte') : tr('🎲 Aléatoire')), h('small', {}, d ? d.title : f === 'company' ? tr('Compose 6 unités de toutes les armées') : tr('Bonus +{0} or, +25 % XP', ECONOMY.randomFactionGold))));
    }
    clear(detail);
    if (sel === 'company') {
      const c = validateCompany(save.profile.roster);
      const cmd = c ? companyCommanderOf(c) : null;
      detail.append(h('h3', {}, tr('🧩 Compagnie mixte')), h('p', { class: 'small' }, tr('6 unités piochées dans les 6 armées, une par catégorie (6 catégories sur 8). Le commandant choisi donne sa doctrine, ses pouvoirs, son entraide et sa Résonance à toute la compagnie. Les unités gardent leur apparence et leurs capacités d\'origine.')),
        c ? h('div', { class: 'armyunits' }, ...c.map(id => { const u = UNITS[id]; return h('div', { class: 'au', style: `--cat:${CATEGORY_COLORS[u.category]}` }, h('span', { class: 'cat', html: icon(categoryIcon(u.category), 14, '#14112A', 3) }), h('div', {}, h('b', {}, u.name), h('small', {}, tr('{0} · {1} · {2} or', FACTIONS[u.faction].title, CATEGORY_NAMES[u.category], u.cost)))); })) : h('p', { class: 'muted small' }, tr('Aucune compagnie composée pour l\'instant.')),
        cmd ? h('p', { class: 'small' }, h('b', {}, tr('Commandant : {0}', FACTIONS[cmd].name)), ` — ${FACTIONS[cmd].doctrine.text}`) : h('span'),
        h('button', { class: 'btn gold', onclick: () => companyScreen(c, save.profile.faction, (ids, commander) => { save.profile.roster = ids; save.profile.faction = commander; save.flush(); draw(); show(scrEl); }, () => show(scrEl)) }, c ? tr('✏️ Modifier ma compagnie') : tr('🧩 Composer ma compagnie')));
    } else if (sel === 'random') {
      detail.append(h('h3', {}, tr('🎲 Armée aléatoire')), h('p', {}, tr('Le jeu t\'attribue une armée au lancement de la partie.')),
        h('div', { class: 'pros' }, h('b', {}, tr('Récompense : ')), tr('+{0} pièces d\'or au départ et +25 % d\'expérience en fin de partie.', ECONOMY.randomFactionGold)),
        h('p', { class: 'muted small' }, tr('Parfait pour apprendre toutes les armées et varier les parties.')));
    } else {
      const d = FACTIONS[sel];
      detail.append(
        h('h3', { style: `color:${d.color}` }, d.name, h('small', {}, ` — ${d.title}`)),
        h('p', { class: 'small' }, d.style),
        h('div', { class: 'pc' }, h('div', { class: 'pros' }, ...d.strengths.flatMap(t => [h('span', {}, '✔ ' + t), h('br')])), h('div', { class: 'cons' }, ...d.weaknesses.flatMap(t => [h('span', {}, '✖ ' + t), h('br')]))),
        h('div', { class: 'sect' }, tr('Doctrine & entraide')),
        h('div', { class: 'armypowers' },
          h('div', { class: 'ap' }, h('span', { html: icon('star', 22, d.color) }), h('div', {}, h('b', {}, tr('Doctrine — {0}', d.doctrine.name)), h('small', {}, d.doctrine.text))),
          h('div', { class: 'ap' }, h('span', { html: icon('users', 22, '#7DFFB0') }), h('div', {}, h('b', {}, tr('Entraide — {0}', d.help.name)), h('small', {}, d.help.text)))),
        h('div', { class: 'sect' }, tr('Unités')),
        h('div', { class: 'armyunits' }, ...d.units.map(id => {
          const u = UNITS[id];
          return h('div', { class: 'au', style: `--cat:${CATEGORY_COLORS[u.category]}` },
            h('span', { class: 'cat', html: icon(categoryIcon(u.category), 14, '#14112A', 3) }),
            h('div', {}, h('b', {}, u.name), h('small', {}, tr('{0} · {1} or', CATEGORY_NAMES[u.category], u.cost)), h('small', { class: 'muted' }, u.passiveText)));
        })),
        h('div', { class: 'sect' }, tr('Pouvoirs de commandant')),
        h('div', { class: 'armypowers' }, ...FACTION_POWERS[sel].map(p => h('div', { class: 'ap' }, h('span', { html: icon(p.icon, 22, '#FFC233') }), h('div', {}, h('b', {}, p.name), h('small', {}, p.text))))),
      );
    }
    const canOk = sel !== 'company' || !!validateCompany(save.profile.roster);
    detail.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', style: 'flex:1', disabled: !canOk, onclick: () => {
      audio.play('ready');
      if (sel === 'company') { const c = validateCompany(save.profile.roster)!; onPick(companyCommanderOf(c), c); }
      else onPick(sel, null);
    } }, okLabel), h('button', { class: 'btn ghost', onclick: onBack }, tr('← Retour'))));
  };
  const scrEl = h('div', { class: 'screen armyscreen' }, h('h2', {}, tr('⚔️ Choisis ton armée')), h('div', { class: 'armywrap' }, list, detail));
  draw();
  show(scrEl);
}
