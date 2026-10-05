import './ui/styles.css';
import { Renderer } from './render/Renderer';
import { Session, SessionEvents } from './net/Session';
import { Hud } from './ui/Hud';
import { audio } from './audio/AudioSystem';
import { save } from './save/SaveSystem';
import { ensureAuth, createLobby, joinLobby, friendly, upsertProfile, recordMatch, setLobbyStatus } from './net/backend';
import { show, menuScreen, duoScreen, lobbyScreen, loadingScreen, errorScreen, hideScreens, MenuActions } from './ui/screens';
import { log, ONLINE, DEBUG } from './config';
import { step, drainEvents } from './sim/game';
import type { Difficulty, GameMode } from './sim/state';
import { h } from './ui/dom';

let session: Session | null = null;
let renderer: Renderer | null = null;
let hud: Hud | null = null;
let raf = 0;
let lobbyRender: ((l: Session['lobby']) => void) | null = null;
let wakeLock: { release(): Promise<void> } | null = null;
let reported = false;

audio.setVolumes(save.prefs.sfx, save.prefs.music);

const events: SessionEvents = {
  lobby: l => lobbyRender?.(l),
  start: () => enterGame(),
  toast: (m, k) => { if (hud) hud.toast(m, k === 'error' ? 'error' : 'info'); else if (k === 'error') alert(m); },
  conn: () => { /* HUD reads session.partnerOnline each refresh */ },
  kicked: msg => { teardown(); errorScreen(msg, goMenu); },
  rematch: () => {
    cancelAnimationFrame(raf);
    hud?.destroy(); hud = null;
    if (renderer) { renderer.dispose(); renderer.renderer.forceContextLoss(); renderer.renderer.domElement.remove(); renderer = null; }
    if (session) lobbyRender = lobbyScreen(session, leaveLobby);
  },
};

function teardown() {
  cancelAnimationFrame(raf);
  hud?.destroy(); hud = null;
  if (renderer) { renderer.dispose(); renderer.renderer.forceContextLoss(); renderer.renderer.domElement.remove(); renderer = null; }
  session?.close(); session = null;
  lobbyRender = null;
  wakeLock?.release().catch(() => {}); wakeLock = null;
  audio.setMood('menu');
}

function goMenu() {
  teardown();
  history.replaceState(null, '', '/');
  show(menuScreen(actions));
}

const actions: MenuActions = {
  duo: (mode: GameMode) => duoScreen(mode, () => createDuo(mode), code => joinDuo(code), goMenu),
  solo: (mode: GameMode, waves: number, diff: Difficulty) => {
    teardown();
    session = Session.solo({ mode, totalWaves: waves, difficulty: diff, humans: [{ name: save.profile.name || 'Joueur' }] }, events);
    enterGame();
  },
  tutorial: () => {
    teardown();
    session = Session.solo({ mode: 'vsai', totalWaves: 10, difficulty: 'initiation', humans: [{ name: save.profile.name || 'Recrue' }], tutorial: true }, events);
    enterGame();
  },
  resume: () => resumeActive(),
};

async function createDuo(mode: GameMode) {
  loadingScreen('Création de la partie…');
  try {
    const uid = await ensureAuth();
    upsertProfile();
    const code = await createLobby(mode, { mode }, save.profile.name);
    teardown();
    session = new Session('host', code, uid, events);
    session.lobby.settings.mode = mode;
    session.lobby.settings.totalWaves = mode === 'survival' ? 9999 : 10;
    await session.open();
    history.replaceState(null, '', `/join/${code}`);
    lobbyRender = lobbyScreen(session, leaveLobby);
  } catch (e) {
    log('Supabase error', e);
    errorScreen(friendly(e), goMenu);
  }
}

async function joinDuo(code: string) {
  loadingScreen('Connexion à la partie…');
  try {
    const uid = await ensureAuth();
    upsertProfile();
    await joinLobby(code, save.profile.name);
    teardown();
    session = new Session('guest', code.toUpperCase(), uid, events);
    await session.open();
    lobbyRender = lobbyScreen(session, leaveLobby);
  } catch (e) {
    log('Join error', e);
    errorScreen(friendly(e), goMenu);
  }
}

function leaveLobby() {
  if (session?.role === 'guest') session.transport?.send({ k: 'leave', uid: session.uid });
  if (session?.role === 'host') setLobbyStatus(session.code, 'ended');
  save.setActive(null);
  goMenu();
}

async function resumeActive() {
  const a = save.data.active;
  if (!a) return;
  loadingScreen('Reconnexion à la partie…');
  try {
    const uid = await ensureAuth();
    teardown();
    session = new Session(a.role, a.code, uid, events);
    if (a.role === 'host') {
      const ok = await session.resume();
      if (!ok) { save.setActive(null); errorScreen('Cette partie n\'existe plus.', goMenu); return; }
      await session.open();
      enterGame();
    } else {
      await session.open();
      setTimeout(() => { if (!hud && session) { save.setActive(null); teardown(); errorScreen('Impossible de retrouver la partie (l\'hôte est peut-être absent).', goMenu); } }, 12000);
    }
  } catch (e) {
    errorScreen(friendly(e), goMenu);
  }
}

function enterGame() {
  if (!session || hud) return;
  hideScreens();
  const canvas = h('canvas', { id: 'game' });
  document.body.prepend(canvas);
  renderer = new Renderer(canvas, save.prefs.quality);
  const meta = session.view.meta;
  const nTeams = meta ? meta.teams.length : session.state ? session.state.teams.length : session.lobby.settings.mode === 'vsai' ? 2 : 1;
  renderer.buildArenas(nTeams);
  const resize = () => renderer?.resize(window.innerWidth, window.innerHeight);
  resize();
  window.onresize = () => { resize(); };
  const sess = session;
  hud = new Hud(sess, renderer, {
    exit: () => {
      if (sess.role !== 'guest' && sess.state) save.dropGame(sess.code);
      if (sess.role === 'host') setLobbyStatus(sess.code, 'ended');
      save.setActive(null);
      goMenu();
    },
    rematch: () => {
      if (sess.role === 'solo' && sess.state) {
        const st = sess.state.settings;
        teardown();
        session = Session.solo(st, events);
        enterGame();
      } else if (sess.role === 'host') {
        // back to the same lobby with the same partner
        cancelAnimationFrame(raf);
        hud?.destroy(); hud = null;
        if (renderer) { renderer.dispose(); renderer.renderer.forceContextLoss(); renderer.renderer.domElement.remove(); renderer = null; }
        sess.state = null; sess.view.meta = null; sess.lobby.started = false;
        sess.lobby.players.forEach(p => (p.ready = false));
        sess.transport?.send({ k: 'rematch' });
        lobbyRender = lobbyScreen(sess, leaveLobby);
        sess.broadcastLobby();
        setLobbyStatus(sess.code, 'open');
      }
    },
  });
  reported = false;
  audio.unlock();
  audio.setMood('build');
  try { (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then(w => (wakeLock = w)).catch(() => {}); } catch { /* */ }
  let last = performance.now();
  let frameSkip = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    if (save.prefs.quality === 'battery' && (frameSkip++ & 1)) return; // ~30 fps cap
    last = now;
    if (!session || !renderer || !hud) return;
    session.update(dt);
    const ev = session.view.takeEvents();
    hud.feedEvents(ev);
    hud.update(dt);
    renderer.frame(dt, session.view, { localPid: session.myPid, ghost: hud.ghostState(), selected: hud.selected, showGrid: true, events: ev });
    const m = session.view.meta;
    if (m?.phase === 'ended' && !reported) {
      reported = true;
      save.setActive(null);
      if (session.role === 'host' && m.result) {
        recordMatch(session.code, m.settings.mode, m.result.outcome, m.wave, session.lobby.players.map(p => p.uid), m.players.map(p => p.name), m.players.map(p => ({ name: p.name, ...p.stats })));
        save.dropGame(session.code);
      }
      upsertProfile();
    }
  };
  raf = requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ boot
function boot() {
  const path = location.pathname;
  const qs = new URLSearchParams(location.search);
  const joinMatch = path.match(/\/join\/([A-Za-z0-9]{5})/) ?? (qs.get('join') ? [, qs.get('join')!] : null);
  audio.setMood('menu');
  if (joinMatch) {
    const code = joinMatch[1]!.toUpperCase();
    const active = save.data.active;
    if (active && active.code === code) { resumeActive(); return; }
    duoScreen('vsai', () => createDuo('vsai'), c => joinDuo(c), goMenu, code);
    return;
  }
  show(menuScreen(actions));
  log('Boot', ONLINE ? 'online' : 'offline');
}

// PWA
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); (window as unknown as { __installEvt: unknown }).__installEvt = e; });
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') audio.unlock(); });

if (DEBUG) (window as unknown as { __db: unknown }).__db = { get session() { return session; }, step, drainEvents };
boot();
