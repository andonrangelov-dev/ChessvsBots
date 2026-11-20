// PGN clock annotations in Game Review (www/review-clocks.js), checked with the bundled chess.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {}, globalThis: {} }; ctx.self = ctx.window; vm.createContext(ctx);
vm.runInContext(readFileSync('www/chess.min.js', 'utf8'), ctx);
vm.runInContext(readFileSync('www/review-clocks.js', 'utf8'), ctx);
const C = ctx.window.ChessReviewClocks, Chess = ctx.window.Chess || ctx.Chess;
assert.ok(C && typeof Chess === 'function', 'modules loaded');

assert.equal(C.parseClock('0:03:00'), 180000);
assert.equal(C.parseClock('2:59.5'), 179500);
assert.equal(C.parseClock('1:00:00'), 3600000);
for (const bad of ['', '61', '0:60', '1:61:00', 'a:b', '1:2:3:4']) assert.equal(C.parseClock(bad), null, bad);
assert.equal(C.parseInitial('180+2'), 180000);
assert.equal(C.parseInitial('600'), 600000);
for (const bad of ['-', '1/86400', '40/7200:3600', '0']) assert.equal(C.parseInitial(bad), null, bad);

const pgn = '[Event "x"]\n[TimeControl "180+2"]\n\n1. e4 {[%clk 0:03:01.5]} e5 {[%clk 0:02:59]} 2. Nf3 {[%clk 0:00:12.3]} (2. Bc4) 2... Nc6 {comment [%clk 0:02:50]} *';
const ch = new Chess(); ch.loadPgn(pgn);
const clocks = C.parseGame(ch, Chess);
assert.deepEqual(JSON.parse(JSON.stringify(clocks)), { initialMs: 180000, moves: [181500, 179000, 12300, 170000] });
assert.deepEqual({ ...C.atPly(clocks, 0) }, { w: 180000, b: 180000 });
assert.deepEqual({ ...C.atPly(clocks, 1) }, { w: 181500, b: 180000 });
assert.deepEqual({ ...C.atPly(clocks, 3) }, { w: 12300, b: 179000 });
assert.equal(C.format(181500), '03:01');
assert.equal(C.format(12300), '00:12.3', 'tenths in time trouble');
assert.equal(C.format(3723000), '1:02:03');
assert.equal(C.comment(12300), '[%clk 0:00:12.3]');
assert.equal(C.parseClock(C.comment(181500).slice(6, -1)), 181500, 'export round-trip');
const plain = new Chess(); plain.loadPgn('1. e4 e5 *');
assert.equal(C.parseGame(plain, Chess), null, 'no invented clocks');
console.log('PASS: PGN clocks (parse, browse by ply, format, export round-trip, no invented values)');
