// NetworkSystem transports. Same interface for Supabase Realtime (online) and BroadcastChannel (same-browser dev tests).
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supa } from './backend';
import { log } from '../config';

export type Msg = { k: string; [x: string]: unknown };
export type ConnStatus = 'connecting' | 'online' | 'offline';

export interface Transport {
  status: ConnStatus;
  connect(): Promise<void>;
  send(m: Msg): void;
  close(): void;
  /** uids currently present on the channel */
  peers(): string[];
  onMsg: (m: Msg) => void;
  onPeers: (uids: string[]) => void;
  onStatus: (s: ConnStatus) => void;
}

export class SupabaseTransport implements Transport {
  status: ConnStatus = 'connecting';
  onMsg: (m: Msg) => void = () => {};
  onPeers: (u: string[]) => void = () => {};
  onStatus: (s: ConnStatus) => void = () => {};
  private ch: RealtimeChannel | null = null;
  private present: string[] = [];
  private closed = false;
  private retry = 0;
  constructor(private code: string, private uid: string) {}

  async connect() {
    const s = supa()!;
    if (this.ch) { try { await s.removeChannel(this.ch); } catch { /* */ } }
    const ch = s.channel(`duo:${this.code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: this.uid } } });
    this.ch = ch;
    ch.on('broadcast', { event: 'm' }, ({ payload }) => this.onMsg(payload as Msg));
    ch.on('presence', { event: 'sync' }, () => {
      this.present = Object.keys(ch.presenceState());
      this.onPeers(this.present);
    });
    await new Promise<void>(resolve => {
      ch.subscribe(async st => {
        log('channel', this.code, st);
        if (st === 'SUBSCRIBED') {
          this.retry = 0;
          this.setStatus('online');
          await ch.track({ at: Date.now() });
          resolve();
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          if (this.status !== 'offline') this.offlineSince = Date.now();
          this.setStatus('offline');
          resolve();
        }
      });
    });
    // watchdog: realtime-js rejoins on its own; if still offline after a while, rebuild the channel
    if (!this.watchdog) this.watchdog = window.setInterval(() => {
      if (this.closed || this.status === 'online') return;
      if (Date.now() - this.offlineSince > 6000 + 2000 * Math.min(4, this.retry)) {
        this.retry++; this.offlineSince = Date.now();
        log('Reconnect attempt', this.retry);
        this.connect();
      }
    }, 2000);
  }
  private watchdog: number | null = null;
  private offlineSince = 0;

  private setStatus(s: ConnStatus) { this.status = s; this.onStatus(s); }

  send(m: Msg) {
    if (!this.ch || this.status !== 'online') return;
    this.ch.send({ type: 'broadcast', event: 'm', payload: m });
  }
  peers() { return this.present; }
  close() {
    this.closed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    const s = supa();
    if (s && this.ch) s.removeChannel(this.ch);
    this.ch = null;
  }
}

/** Dev transport: two tabs of the same browser talk through BroadcastChannel; presence via heartbeats. */
export class LocalTransport implements Transport {
  status: ConnStatus = 'connecting';
  onMsg: (m: Msg) => void = () => {};
  onPeers: (u: string[]) => void = () => {};
  onStatus: (s: ConnStatus) => void = () => {};
  private bc: BroadcastChannel | null = null;
  private seen = new Map<string, number>();
  private hb: number | null = null;
  constructor(private code: string, private uid: string) {}

  async connect() {
    this.bc = new BroadcastChannel(`duo:${this.code}`);
    this.bc.onmessage = ev => {
      const m = ev.data as Msg;
      if (m.k === '__hb') { this.touch(m.uid as string); return; }
      if (m.k === '__bye') { this.seen.delete(m.uid as string); this.emitPeers(); return; }
      this.onMsg(m);
    };
    this.seen.set(this.uid, Infinity);
    this.hb = window.setInterval(() => {
      this.bc?.postMessage({ k: '__hb', uid: this.uid });
      const now = Date.now();
      let changed = false;
      for (const [u, t] of this.seen) if (u !== this.uid && now - t > 3000) { this.seen.delete(u); changed = true; }
      if (changed) this.emitPeers();
    }, 500);
    this.bc.postMessage({ k: '__hb', uid: this.uid });
    this.status = 'online'; this.onStatus('online');
    this.emitPeers();
  }
  private touch(u: string) { const isNew = !this.seen.has(u); this.seen.set(u, Date.now()); if (isNew) this.emitPeers(); }
  private emitPeers() { this.onPeers(this.peers()); }
  send(m: Msg) { this.bc?.postMessage(m); }
  peers() { return [...this.seen.keys()]; }
  close() {
    this.bc?.postMessage({ k: '__bye', uid: this.uid });
    if (this.hb) clearInterval(this.hb);
    this.bc?.close(); this.bc = null;
  }
}
