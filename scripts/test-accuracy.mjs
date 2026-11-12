/** Offline unit and regression checks for the Lichess-based Accuracy engine. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const A = require('../www/accuracy.js');

const close = (a, b, tolerance = 0.05) => assert.ok(Math.abs(a - b) <= tolerance, `${a} should be near ${b}`);
const cpForWinPct = p => -Math.log(100 / p - 1) / 0.00368208;
assert.equal(A.version, 3);
close(A.winPct(0), 50, 1e-10);
close(A.winPct(100), 59.102, 0.1);
close(A.winPct(-100), 40.898, 0.1);
close(A.winPct(500000), A.winPct(1000));
assert.equal(A.moveAccuracy(50, 50), 100);
assert.equal(A.moveAccuracy(50, 55), 100);
assert.equal(A.moveAccuracy(50, 0) >= 0, true);
// in an equal position the Lichess loss dominates, so the Lichess numbers are reproduced (up to 20 points lost)
for (const [loss, expected] of [[2, 92.395], [5, 80.815], [10, 64.58], [20, 41.017]]) {
  close(A.moveAccuracy(50, 50 - loss), expected, 0.07);
  const cp = cpForWinPct(50 - loss);
  const a = A.scoreGame([0, cp], ['x'], ['y']);
  close(a.moves[0].score, expected, 0.07);
  assert.equal(a.moves[0].loss.toFixed(3), loss.toFixed(3));
}
const perfect = A.scoreGame([0, 0, 0, 0], ['a','b','c'], ['a','b','c']);
assert.deepEqual([perfect.w, perfect.b], [100, 100]);
assert.equal(A.scoreGame([0, -5000], ['x'], ['y']).moves[0].cls, 'blunder');
assert.equal(A.scoreGame([0, 5000], ['x'], ['y']).moves[0].score, 100);
assert.equal(A.scoreGame([0, -5000], ['x'], ['x']).moves[0].score, 100, 'engine best move protected from shallow-eval noise');
assert.equal(A.scoreGame([0, -5000], ['x'], ['x']).moves[0].cls, 'best');
assert.equal(A.classify(0, true), 'best');
assert.equal(A.classify(0, false), 'excellent');
assert.equal(A.classify(1, false), 'excellent');
assert.equal(A.classify(3, false), 'good');
assert.equal(A.classify(7, false), 'inacc');
assert.equal(A.classify(15, false), 'mistake');
assert.equal(A.classify(25, false), 'blunder');
assert.deepEqual(A.volatilityWeights([50,50,50]), [0.5,0.5]);
// the extra centipawn term: no effect in an equal position for small losses ...
assert.equal(A.moveLoss(50, 45, 0, -55).toFixed(2), '5.00');
// ... but in decided positions, where the win% curve is flat, a bad move still costs something
const lostRook = A.scoreGame([-800, -1250], ['x'], ['y']).moves[0];      // a side that is already lost throws a rook away
assert.ok(lostRook.loss > 8 && lostRook.score < 60, 'rook thrown away in a lost position: ' + JSON.stringify(lostRook));
const slip = A.scoreGame([1200, 1050], ['x'], ['y']).moves[0];            // 1.5 pawns at +12: a slip, not a disaster
assert.ok(slip.loss > 1 && slip.loss < 5 && slip.cls !== 'best', 'slip at +12: ' + JSON.stringify(slip));
assert.equal(A.scoreGame([1200, 1190], ['x'], ['y']).moves[0].cls, 'excellent', 'noise-level loss is excellent, not best');
assert.equal(A.scoreGame([1200, 1190], ['x'], ['x']).moves[0].cls, 'best', 'the engine move is best');
assert.ok(A.moveLoss(0, 0, 0, -99999) <= 100, 'loss is capped at 100');
// the same bad moves in a lost game no longer hand the loser a high accuracy
const losing = A.scoreGame([0,-300,-700,-1000,-1400,-1500,-1500,-1500,-1500], ['a','b','c','d','e','f','g','h'], []);
assert.ok(losing.w < 60, 'a side that keeps losing material: ' + losing.w);
assert.throws(() => A.scoreGame([0], ['x'], []), /evaluation/);
assert.throws(() => A.scoreGame([0, NaN], ['x'], []), /Non-finite/);

// A single extremely bad move is NOT treated as 1% in the harmonic mean.
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
assert.ok(weak.w < 70 && strong.w > 85 && strong.b > 85);
assert.ok(weak.w + 15 < strong.w);
console.log(`PASS: Lichess Accuracy numeric/edge tests and ${fixture.length} real-game fixtures`);
console.log('Sample:', '250 Elo:', weak.w.toFixed(1), '2800 Elo:', strong.w.toFixed(1));
