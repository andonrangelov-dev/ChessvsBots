/** Offline unit and regression checks for the Lichess-based Accuracy engine. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const A = require('../www/accuracy.js');

const close = (a, b, tolerance = 0.05) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should be near ${b}`);
const cpForWinPct = p => -Math.log(100 / p - 1) / 0.00368208;
assert.equal(A.version, 5);
close(A.winPct(0), 50, 1e-10);
close(A.winPct(100), 59.102, 0.1);
close(A.winPct(-100), 40.898, 0.1);
close(A.winPct(500000), A.winPct(1000));
assert.equal(A.moveAccuracy(50, 50), 100);
assert.equal(A.moveAccuracy(50, 55), 100);
assert.equal(A.moveAccuracy(50, 0) >= 0, true);
// the move-accuracy curve: Lichess' shape with the faster decay fitted to Chess.com (0.08 instead of 0.04354), +1 allowance when something was lost
const curve = loss => Math.min(100, 103.1668100711649 * Math.exp(-0.08 * loss) - 3.166924740191411 + 1);
for (const loss of [0.5, 2, 5, 10, 20, 40]) {
  close(A.moveAccuracy(50, 50 - loss), curve(loss), 1e-9);
  const lichess = 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411 + 1;
  assert.ok(A.moveAccuracy(50, 50 - loss) <= Math.min(100, lichess) + 1e-9, 'never more lenient than Lichess');
  const a = A.scoreGame([0, cpForWinPct(50 - loss)], ['x'], ['y']);
  close(a.moves[0].loss, loss, 1e-6);
  close(a.moves[0].score, curve(loss), 1e-6);
}
const perfect = A.scoreGame([0, 0, 0, 0], ['a','b','c'], ['a','b','c']);
assert.deepEqual([perfect.w, perfect.b], [100, 100]);
assert.equal(A.scoreGame([0, -5000], ['x'], ['y']).moves[0].cls, 'blunder');
assert.equal(A.scoreGame([0, 5000], ['x'], ['y']).moves[0].score, 100);
assert.equal(A.scoreGame([0, -5000], ['x'], ['x']).moves[0].score, 100, 'engine best move protected from shallow-eval noise');
assert.equal(A.scoreGame([0, -5000], ['x'], ['x']).moves[0].cls, 'best');
assert.equal(A.classify(0, true), 'best');
assert.equal(A.classify(0, false), 'excellent');
assert.equal(A.classify(1.5, false), 'excellent');
assert.equal(A.classify(2, false), 'good');
assert.equal(A.classify(3.5, false), 'good');
assert.equal(A.classify(5, false), 'inacc');
assert.equal(A.classify(7, false), 'inacc');
assert.equal(A.classify(10, false), 'mistake');
assert.equal(A.classify(14, false), 'mistake');
assert.equal(A.classify(15, false), 'blunder');
assert.deepEqual(A.volatilityWeights([50,50,50]), [0.5,0.5]);
// moveLoss is the plain Win% loss (no centipawn term since version 5), capped at 100 and never negative
assert.equal(A.moveLoss(50, 45), 5);
assert.equal(A.moveLoss(50, 60), 0);
assert.ok(A.moveLoss(100, -50) <= 100);
// noise in decided positions costs nothing: +20 pawns -> +12 pawns, or mate -> +9 pawns (the evaluation of a won position jumps around with a 350 ms search)
assert.equal(A.scoreGame([2000, 1200], ['x'], ['y']).moves[0].cls, 'excellent');
assert.equal(A.scoreGame([9990, 900], ['x'], ['y']).moves[0].loss < 3, true);
// ... but throwing away a won game is a blunder
assert.equal(A.scoreGame([300, -300], ['x'], ['y']).moves[0].cls, 'blunder');
// the same game analysed twice with a jumpy won endgame gives (almost) the same accuracy
const jumpyA = [0, 20, 0, 30, 0, 800, 900, 9990, 880, 9990, 900, 9990, 870, 9990, 890, 9990];
const jumpyB = [0, 20, 0, 30, 0, 800, 900, 880, 9990, 900, 9990, 870, 9990, 890, 9990, 9990];
const mv = jumpyA.slice(1).map((_, i) => 'm' + i);
const ra = A.scoreGame(jumpyA, mv, []), rb = A.scoreGame(jumpyB, mv, []);
assert.ok(Math.abs(ra.w - rb.w) < 6 && Math.abs(ra.b - rb.b) < 6, `stable under mate/no-mate jumps: ${ra.w}/${rb.w} ${ra.b}/${rb.b}`);
assert.throws(() => A.scoreGame([0], ['x'], []), /evaluation/);
assert.throws(() => A.scoreGame([0, NaN], ['x'], []), /Non-finite/);

// A single extremely bad move is NOT treated as 1% (no harmonic mean any more: it is just a zero-ish score among many good ones).
const mixed = A.scoreGame([0,-5000,-5000,-5000,-5000,0,0], ['a','b','c','d','e','f'], ['b','d','e','f']);
assert.ok(mixed.w >= 0 && mixed.w <= 100 && mixed.b >= 0 && mixed.b <= 100);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/acc-games.json', import.meta.url), 'utf8'));
assert.ok(fixture.length >= 7);
const rows = fixture.map(g => {
  const s = A.scoreGame(g.pov,g.moves,g.best);
  assert.equal(s.moves.length, g.moves.length);
  assert.ok(s.moves.every(m => m.score >= 0 && m.score <= 100 && Number.isFinite(m.score)));
  assert.ok(s.w >= 0 && s.w <= 100 && s.b >= 0 && s.b <= 100);
  return { rating: g.A, w: s.w, b: s.b };
});
const weak = rows.find(x => x.rating === 250), strong = rows.find(x => x.rating === 2800);
assert.ok(weak.w < 60 && strong.w > 70 && strong.b > 80);
assert.ok(weak.w + 15 < strong.w);
// Calibration against Chess.com: 6 real games (12 players), raw Stockfish evaluations of this app + the accuracies Chess.com showed for them
const cal = JSON.parse(readFileSync(new URL('./fixtures/chesscom-calibration.json', import.meta.url), 'utf8'));
assert.equal(cal.length, 6);
let sumDiff = 0, worst = 0, players = 0;
for (const g of cal) {
  const s = A.scoreGame(g.pov, g.moves, g.best);
  for (const side of ['w', 'b']) {
    const d = Math.abs(s[side] - g.chesscom[side].acc);
    sumDiff += d; worst = Math.max(worst, d); players++;
    assert.ok(d <= 9, `game ${g.id} ${side}: ${s[side].toFixed(1)} vs Chess.com ${g.chesscom[side].acc}`);
  }
}
assert.ok(sumDiff / players <= 3.5, 'mean difference from Chess.com ' + (sumDiff / players).toFixed(2));
console.log(`Chess.com calibration: mean difference ${(sumDiff / players).toFixed(2)} points, worst ${worst.toFixed(1)}`);
console.log(`PASS: Accuracy numeric/edge tests and ${fixture.length} real-game fixtures`);
console.log('Sample:', '250 Elo:', weak.w.toFixed(1), '2800 Elo:', strong.w.toFixed(1));
