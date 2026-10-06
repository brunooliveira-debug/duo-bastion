// LobbySystem + game synchronisation. Host-authoritative:
//  - the host (lobby creator) runs the simulation, validates every command, broadcasts compact snapshots;
//  - the guest sends commands and renders interpolated snapshots.
// Postgres is touched only for lobby creation/join and one save per wave (never per frame).
import { applyCommand, Command, createGame, drainEvents, step } from '../sim/game';
import type { Difficulty, FactionChoice, GameEvent, GameMode, GameSettings, GameState } from '../sim/state';
import { DT, STATE_VERSION, humanPid } from '../sim/state';
import { ViewState, metaOf, packEnts, unpackEnts, EntView, entView } from './snapshot';
import { DEF_IDS } from './snapshot';
import { LocalTransport, SupabaseTransport, Transport, Msg, ConnStatus } from './transport';
import { ONLINE, log } from '../config';
import { setLobbyStatus, loadLobbyState } from './backend';
import { save } from '../save/SaveSystem';

export interface LobbySettings { mode: GameMode; totalWaves: number; difficulty: Difficulty }
export interface LobbyPlayer { uid: string; name: string; avatar: string; ready: boolean; faction: FactionChoice }
export interface LobbyState { code: string; hostUid: string; players: LobbyPlayer[]; settings: LobbySettings; started: boolean }

export interface SessionEvents {
  lobby(l: LobbyState): void;
  start(): void;
  toast(msg: string, kind?: 'error' | 'info'): void;
  conn(status: ConnStatus, partnerOnline: boolean): void;
  kicked(msg: string): void;
  rematch(): void;
}

const DEF_INDEX = new Map(DEF_IDS.map((id, i) => [id, i]));
void DEF_INDEX;

function entViews(s: GameState): Map<number, EntView> {
  const m = new Map<number, EntView>();
  for (const e of s.ents) if (!e.dead) m.set(e.id, entView(s, e));
  return m;
}

const FACTION_SET = new Set(['astreens', 'rouages', 'ronces', 'abysses', 'solaires', 'necrose', 'random']);
function validFaction(f: unknown): FactionChoice { return (typeof f === 'string' && FACTION_SET.has(f) ? f : 'random') as FactionChoice; }

export class Session {
  role: 'host' | 'guest' | 'solo';
  code: string;
  uid: string;
  myPid = 0;
  state: GameState | null = null;
  view: ViewState;
  lobby: LobbyState;
  transport: Transport | null = null;
  partnerOnline = true;
  private acc = 0;
  private lastEntSend = 0;
  private lastMetaSend = 0;
  private lastMetaJson = '';
  private netEvents: GameEvent[] = [];
  private seq = 0;
  private lobbyTimer: number | null = null;
  private partnerGoneAt = 0;
  private guestUid = '';
  private aiTakeover = false;
  private lastPhaseKey = '';
  private gameShown = false;

  constructor(role: 'host' | 'guest' | 'solo', code: string, uid: string, private ev: SessionEvents) {
    this.role = role; this.code = code; this.uid = uid;
    this.view = new ViewState(role === 'guest' ? 230 : 40);
    this.lobby = { code, hostUid: role === 'guest' ? '' : uid, players: [], settings: { mode: 'vsai', totalWaves: 10, difficulty: 'normal' }, started: false };
  }

  me(): LobbyPlayer { return { uid: this.uid, name: save.profile.name || 'Joueur', avatar: save.profile.avatar, ready: false, faction: (save.profile.faction || 'random') as FactionChoice }; }

  /** pid of the lobby player at index i (co-op: 0/1, duel: 0/2). */
  pidOf(i: number) { return humanPid(this.state?.settings.mode ?? this.lobby.settings.mode, i); }

  // ------------------------------------------------------------------ setup

  static solo(settings: GameSettings, ev: SessionEvents): Session {
    const s = new Session('solo', 'SOLO', 'local', ev);
    s.state = createGame(settings, (Math.random() * 2 ** 31) | 0);
    s.publishLocal();
    return s;
  }

  async open() {
    this.transport = ONLINE ? new SupabaseTransport(this.code, this.uid) : new LocalTransport(this.code, this.uid);
    this.transport.onMsg = m => this.onMsg(m);
    this.transport.onPeers = p => this.onPeers(p);
    this.transport.onStatus = st => this.ev.conn(st, this.partnerOnline);
    await this.transport.connect();
    if (this.role === 'host') {
      if (!this.lobby.players.length) this.lobby.players.push(this.me());
      this.broadcastLobby();
      this.lobbyTimer = window.setInterval(() => { if (!this.lobby.started) this.broadcastLobby(); }, 2000);
    } else {
      this.sendJoin();
      this.lobbyTimer = window.setInterval(() => {
        if (!this.lobby.started && !this.lobby.players.some(p => p.uid === this.uid)) this.sendJoin();
      }, 1500);
    }
  }

  private sendJoin() { this.transport?.send({ k: 'join', uid: this.uid, name: save.profile.name || 'Joueur', avatar: save.profile.avatar, faction: save.profile.faction || 'random' }); }

  close() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    if (this.role === 'host' && this.transport) this.transport.send({ k: 'closed' });
    this.transport?.close();
    this.transport = null;
  }

  // ------------------------------------------------------------------ lobby (host)

  broadcastLobby() {
    this.transport?.send({ k: 'lobby', lobby: this.lobby });
    this.ev.lobby(this.lobby);
  }

  setSettings(s: Partial<LobbySettings>) {
    if (this.role !== 'host') return;
    this.lobby.settings = { ...this.lobby.settings, ...s };
    this.broadcastLobby();
  }

  setReady(v: boolean) {
    if (this.role === 'host') {
      const p = this.lobby.players.find(x => x.uid === this.uid);
      if (p) p.ready = v;
      this.broadcastLobby();
    } else this.transport?.send({ k: 'ready', uid: this.uid, v });
  }

  /** Army choice in the lobby (host applies it, guest asks the host). */
  setFaction(f: FactionChoice) {
    save.profile.faction = f; save.flush();
    if (this.role === 'host') {
      const p = this.lobby.players.find(x => x.uid === this.uid);
      if (p) p.faction = f;
      this.broadcastLobby();
    } else this.transport?.send({ k: 'faction', uid: this.uid, f });
  }

  canStart() { return this.role === 'host' && this.lobby.players.every(p => p.ready) && this.lobby.players.length >= 1; }

  startGame() {
    if (this.role !== 'host') return;
    const humans = this.lobby.players.slice(0, 2).map(p => ({ name: p.name, faction: p.faction ?? 'random' }));
    const settings: GameSettings = {
      mode: this.lobby.settings.mode,
      totalWaves: this.lobby.settings.mode === 'survival' ? 9999 : this.lobby.settings.totalWaves,
      difficulty: this.lobby.settings.difficulty,
      humans,
    };
    const seed = (Math.random() * 2 ** 31) | 0;
    this.state = createGame(settings, seed);
    this.lobby.started = true;
    this.guestUid = this.lobby.players[1]?.uid ?? '';
    this.broadcastLobby();
    this.sendStart();
    this.publishLocal(true);
    save.setActive({ code: this.code, role: 'host', ts: Date.now() });
    this.persist();
    setLobbyStatus(this.code, 'playing');
    log('Game started', this.code);
    this.ev.start();
  }

  private sendStart() {
    const pids: Record<string, number> = {};
    this.lobby.players.forEach((p, i) => (pids[p.uid] = this.pidOf(i)));
    this.transport?.send({ k: 'start', pids });
    this.sendMeta(true);
  }

  /** Host: resume a saved game after a reload. */
  async resume(): Promise<boolean> {
    let json = save.loadGame(this.code);
    if (!json) { const st = await loadLobbyState(this.code); if (st) json = JSON.stringify(st); }
    if (!json) return false;
    try {
      const st = JSON.parse(json) as GameState & { _lobby?: LobbyState };
      if (st.v !== STATE_VERSION) return false; // save from an older version of the game
      this.lobby = st._lobby ?? this.lobby;
      delete st._lobby;
      st.ents = []; st.events = [];
      this.state = st;
      this.guestUid = this.lobby.players[1]?.uid ?? '';
      this.lobby.started = true;
      this.publishLocal(true);
      log('Game resumed', this.code, 'wave', st.wave);
      return true;
    } catch { return false; }
  }

  private persist() {
    if (!this.state || this.role !== 'host') return;
    const snap = { ...this.state, ents: [], events: [], _lobby: this.lobby };
    const json = JSON.stringify(snap);
    save.saveGame(this.code, json);
    setLobbyStatus(this.code, this.state.phase === 'ended' ? 'ended' : 'playing', snap);
  }

  // ------------------------------------------------------------------ messages

  private onMsg(m: Msg) {
    if (this.role === 'host') {
      switch (m.k) {
        case 'join': {
          const uid = m.uid as string;
          let p = this.lobby.players.find(x => x.uid === uid);
          if (!p) {
            if (this.lobby.started || this.lobby.players.length >= 2) { this.transport?.send({ k: 'reject', to: uid, msg: this.lobby.started ? 'Cette partie a déjà commencé.' : 'Cette partie est déjà complète.' }); return; }
            p = { uid, name: String(m.name).slice(0, 16) || 'Joueur', avatar: String(m.avatar ?? '🙂'), ready: false, faction: validFaction(m.faction) };
            this.lobby.players.push(p);
            log('Player joined', p.name);
            this.ev.toast(`${p.name} a rejoint la partie !`, 'info');
          }
          this.broadcastLobby();
          if (this.lobby.started) this.sendStart();
          break;
        }
        case 'hello': {
          if (!this.state) return;
          if (this.lobby.players.some(p => p.uid === m.uid)) this.sendStart();
          else this.transport?.send({ k: 'reject', to: m.uid, msg: 'Cette partie n\'existe plus.' });
          break;
        }
        case 'faction': {
          const p = this.lobby.players.find(x => x.uid === m.uid);
          if (p && !this.lobby.started) { p.faction = validFaction(m.f); this.broadcastLobby(); }
          break;
        }
        case 'ready': {
          const p = this.lobby.players.find(x => x.uid === m.uid);
          if (p) { p.ready = !!m.v; this.broadcastLobby(); }
          break;
        }
        case 'leave': {
          if (!this.lobby.started) {
            this.lobby.players = this.lobby.players.filter(p => p.uid !== m.uid);
            this.broadcastLobby();
          }
          break;
        }
        case 'cmd': {
          if (!this.state) return;
          const idx = this.lobby.players.findIndex(p => p.uid === m.uid);
          if (idx < 0) return;
          const pid = this.pidOf(idx);
          const err = applyCommand(this.state, pid, m.cmd as Command);
          if (err) this.transport?.send({ k: 'err', to: m.uid, msg: err });
          this.sendMeta(true);
          break;
        }
      }
    } else {
      switch (m.k) {
        case 'lobby': {
          const l = m.lobby as LobbyState;
          this.lobby = l;
          this.ev.lobby(l);
          break;
        }
        case 'reject': if (m.to === this.uid) this.ev.kicked(String(m.msg)); break;
        case 'closed': this.ev.kicked('L\'hôte a quitté la partie.'); break;
        case 'rematch': this.lobby.started = false; this.gameShown = false; this.view.meta = null; this.view.clearFrames(); this.ev.rematch(); break;
        case 'start': {
          const pids = m.pids as Record<string, number>;
          if (pids[this.uid] === undefined) return;
          const wasStarted = this.gameShown;
          this.gameShown = true;
          this.myPid = pids[this.uid];
          this.lobby.started = true;
          if (!wasStarted) { save.setActive({ code: this.code, role: 'guest', ts: Date.now() }); this.ev.start(); }
          break;
        }
        case 'snap': {
          if (m.m) this.view.setMeta(m.m as never);
          if (m.e) this.view.pushFrame(m.w as number, unpackEnts(m.e as number[]));
          else if (m.clear) this.view.clearFrames();
          if (m.ev) this.view.pushEvents(m.ev as GameEvent[]);
          break;
        }
        case 'err': if (m.to === this.uid) this.ev.toast(String(m.msg), 'error'); break;
      }
    }
  }

  private onPeers(uids: string[]) {
    if (this.role === 'host') {
      const g = this.guestUid || this.lobby.players[1]?.uid;
      const online = !g || uids.includes(g);
      if (!this.lobby.started && !online && g) {
        // guest left the lobby
        this.lobby.players = this.lobby.players.filter(p => p.uid !== g);
        this.broadcastLobby();
      }
      this.setPartner(online);
    } else {
      this.setPartner(!this.lobby.hostUid || uids.includes(this.lobby.hostUid));
      if (this.lobby.started && this.transport) this.transport.send({ k: 'hello', uid: this.uid });
    }
  }

  private setPartner(online: boolean) {
    if (online === this.partnerOnline) return;
    this.partnerOnline = online;
    log(online ? 'Partner online' : 'Partner offline');
    if (!online) this.partnerGoneAt = performance.now();
    else if (this.aiTakeover && this.state) {
      this.state.players[this.pidOf(1)].isAI = false;
      this.aiTakeover = false;
      this.ev.toast('Ton partenaire a repris le contrôle.', 'info');
    }
    this.ev.conn(this.transport?.status ?? 'online', online);
  }

  // ------------------------------------------------------------------ commands

  send(cmd: Command): string | null {
    if (this.role === 'guest') {
      this.transport?.send({ k: 'cmd', uid: this.uid, seq: ++this.seq, cmd });
      return null;
    }
    if (!this.state) return null;
    const err = applyCommand(this.state, this.myPid, cmd);
    this.publishLocal(true);
    this.sendMeta(true);
    return err;
  }

  // ------------------------------------------------------------------ loop

  /** Called every animation frame with wall dt (seconds). */
  update(dt: number) {
    const s = this.state;
    if (!s || this.role === 'guest') return;
    // partner disconnected mid-game: pause; after 45 s the AI takes over their lane
    const waitingPartner = this.role === 'host' && this.guestUid && !this.partnerOnline && !this.aiTakeover && s.phase !== 'ended';
    if (waitingPartner && performance.now() - this.partnerGoneAt > 45000) {
      this.aiTakeover = true;
      s.players[this.pidOf(1)].isAI = true;
      this.ev.toast('Partenaire absent : l\'IA garde sa voie en attendant son retour.', 'info');
    }
    if (!waitingPartner) {
      // the end-of-game sequence plays in slow motion
      this.acc += Math.min(dt, 0.25) * s.speed * (s.ending > 0 ? 0.35 : 1);
      let n = 0;
      while (this.acc >= DT && n < 12) {
        step(s);
        this.acc -= DT; n++;
        const ev = drainEvents(s);
        if (ev.length) { this.view.pushEvents(ev); if (this.role === 'host') for (const e of ev) this.netEvents.push(e); }
        if (s.phase === 'combat') this.view.pushFrame(performance.now() - (n === 1 ? 0 : 0), entViews(s));
      }
    }
    if (s.phase !== 'combat' && this.view.frames.length) this.view.clearFrames();
    this.publishLocal();
    // persist once per phase change at build start / end
    const key = `${s.wave}:${s.phase}`;
    if (key !== this.lastPhaseKey) {
      if (s.phase === 'build' || s.phase === 'ended') this.persist();
      this.lastPhaseKey = key;
    }
    if (this.role === 'host') this.netSend();
  }

  private publishLocal(force = false) {
    if (!this.state) return;
    if (force || true) this.view.setMeta(metaOf(this.state));
  }

  private netSend() {
    const s = this.state!;
    const now = performance.now();
    if (s.phase === 'combat' && now - this.lastEntSend > 120) {
      this.lastEntSend = now;
      const ev = this.compactEvents();
      this.transport?.send({ k: 'snap', w: now, e: packEnts(s), ev });
    } else if (s.phase !== 'combat' && this.netEvents.length && now - this.lastEntSend > 120) {
      this.lastEntSend = now;
      this.transport?.send({ k: 'snap', w: now, clear: 1, ev: this.compactEvents() });
    }
    this.sendMeta(false);
  }

  private compactEvents() {
    // keep every event that matters; cap cosmetic attack events of the opponent arena
    const out: GameEvent[] = [];
    let atk = 0;
    for (const e of this.netEvents) {
      if (e.t === 'atk' || e.t === 'coreShot') { if (++atk > 120) continue; }
      out.push(e);
    }
    this.netEvents = [];
    return out;
  }

  private sendMeta(force: boolean) {
    if (this.role !== 'host' || !this.state || !this.transport) return;
    const now = performance.now();
    if (!force && now - this.lastMetaSend < 300) return;
    const meta = metaOf(this.state);
    const json = JSON.stringify({ ...meta, timer: Math.ceil(meta.timer) });
    if (!force && json === this.lastMetaJson) return;
    this.lastMetaJson = json;
    this.lastMetaSend = now;
    this.transport.send({ k: 'snap', w: now, m: meta });
  }
}
