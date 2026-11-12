/** UCI protocol regression: compatible depth, bounds, hash reuse, queueing. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const posted = [];
class FakeWorker {
  constructor() { FakeWorker.instance = this; }
  postMessage(cmd) {
    posted.push(cmd);
    const send = line => queueMicrotask(() => this.onmessage({ data: line }));
    if (cmd === 'uci') send('uciok');
    if (cmd === 'isready') send('readyok');
    if (cmd.startsWith('go')) {
      // MultiPV at depth 12 complete. A depth-13 bound and then only one
      // unfinished line must NOT contaminate the two depth-12 results.
      send('info depth 12 multipv 1 score cp 24 pv e2e4 e7e5');
      send('info depth 12 multipv 2 score cp 12 pv d2d4 d7d5');
      send('info depth 13 multipv 1 score cp 999 upperbound pv d2d4');
      send('info depth 13 multipv 1 score cp 27 pv e2e4');
      send('bestmove e2e4 ponder e7e5');
    }
  }
  terminate() {}
}
const ctx = { window:{}, Worker:FakeWorker, setTimeout, clearTimeout, queueMicrotask, console };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../www/engine.js', import.meta.url), 'utf8'), ctx);
const e = ctx.window.Engine;
assert.ok(await e.start());
const first = await e.search('startpos', { depth: 14, multipv: 2, newGame: true });
assert.equal(first.depth, 12);
assert.equal(first.best, 'e2e4');
assert.equal(first.lines.length, 2);
assert.equal(first.lines[0].cp, 24);
assert.equal(first.lines[1].cp, 12);
const second = await e.search('startpos', { depth: 14, multipv: 2 });
assert.equal(second.lines.length, 2);
assert.equal(posted.filter(c => c === 'ucinewgame').length, 1);
assert.equal(posted.filter(c => c === 'go depth 14').length, 2);
console.log('PASS: engine protocol uses complete MultiPV, ignores bounds, reuses hash');
