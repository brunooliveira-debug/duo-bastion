// Writes a scripted command log for today's daily challenge (input of scripts/edge-smoke.mjs).
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame, step, drainEvents, applyCommand } from '../src/sim/game';
import { dailySettings, dailyDay } from '../src/sim/daily';
import type { LoggedCmd } from '../src/sim/replay';

const { settings, seed } = dailySettings(dailyDay(), 'Smoke');
const draft = createGame(settings, seed).players[0].draft;
const log: LoggedCmd[] = [
  { t: 0, p: 0, c: { c: 'build', unit: draft[0], col: 2, row: 3 } }, { t: 0, p: 0, c: { c: 'build', unit: draft[1], col: 3, row: 3 } },
  { t: 40, p: 0, c: { c: 'worker' } }, { t: 60, p: 0, c: { c: 'ready', value: true } },
];
// wave 2: one more unit at the start of the preparation
const s = createGame(settings, seed);
let i = 0;
while (s.phase !== 'ended' && s.wave < 2) { while (i < log.length && log[i].t <= s.tick) applyCommand(s, log[i].p, log[i++].c); step(s); drainEvents(s); }
log.push({ t: s.tick + 5, p: 0, c: { c: 'build', unit: draft[0], col: 4, row: 2 } }, { t: s.tick + 6, p: 0, c: { c: 'ready', value: true } });
const dir = join(tmpdir(), 'edge-smoke');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'log.json'), JSON.stringify(log));
console.log('log written:', log.length, 'commands');
