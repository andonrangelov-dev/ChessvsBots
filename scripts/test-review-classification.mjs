/** Safety checks for approximate Chess.com-inspired classification. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
globalThis.window = {};
require('../www/chess.min.js');
const Chess = window.Chess;
const R = require('../www/review-classification.js');
const A = require('../www/accuracy.js');
const start = new Chess().fen();
const ctx = { base: 'best', isBest: true, loss: 0, Chess, fen: start, side: 'w',
  played: 'g1f3', reply: 'g8f6', expectedBefore: 50, expectedAfter: 50, gap: 0,
  legalCount: 20, rating: 1500, checkmate: false, book: false, expectedPrev: null };
assert.equal(R.classify(ctx), 'best', 'ordinary opening moves are not Brilliant');
assert.equal(R.classify({ ...ctx, gap: 23 }), 'great', 'only good move in a live game can be Great');
assert.equal(R.classify({ ...ctx, gap: 12 }), 'best', 'moderate gap alone is not Great');
assert.equal(R.classify({ ...ctx, legalCount: 1, gap: 30 }), 'best', 'only legal move is not Great');
assert.equal(R.classify({ ...ctx, expectedBefore: 96, gap: 20 }), 'best', 'already completely won not Great');
assert.equal(R.classify({ ...ctx, book: true, base: 'good', isBest: false }), 'best', 'book is merged under Best');
assert.equal(R.classify({ ...ctx, book: true, base: 'inacc', isBest: false }), 'best', 'verified opening book overrides short-depth search noise');
assert.equal(R.classify({ ...ctx, base: 'blunder', isBest: false,
  expectedPrev: 50, expectedBefore: 79, expectedAfter: 48 }), 'mistake', 'a Miss is merged under Mistake');
assert.equal(R.classify({ ...ctx, base: 'blunder', isBest: false,
  expectedPrev: 50, expectedBefore: 79, expectedAfter: 4 }), 'blunder', 'throwing away a whole game is a Blunder');
const sacFen = '6k1/6pp/8/8/8/3B4/6PP/6K1 w - - 0 1';
assert.equal(R.goodPieceSacrifice(Chess, sacFen, 'd3h7', 'g8h7', 'w'), true, 'bishop for pawn accepted by king');
assert.equal(R.goodPieceSacrifice(Chess, sacFen, 'd3h7', 'g7g6', 'w'), false, 'opponent must accept');
assert.equal(R.goodPieceSacrifice(Chess, start, 'g1f3', 'g8f6', 'w'), false, 'normal development not a sacrifice');
assert.equal(R.classify({ ...ctx, fen: sacFen, played: 'd3h7', reply: 'g8h7',
  expectedBefore: 60, expectedAfter: 60, base: 'best' }), 'brilliant');
assert.equal(R.classify({ ...ctx, fen: sacFen, played: 'd3h7', reply: 'g8h7',
  expectedBefore: 92, expectedAfter: 95, base: 'best' }), 'best', 'already-won sacrifices are not Brilliant');
assert.equal(R.classify({ ...ctx, fen: sacFen, played: 'd3h7', reply: 'g8h7',
  expectedBefore: 55, expectedAfter: 8, base: 'best' }), 'best', 'lost positions are not Brilliant');
assert.equal(R.classify({ ...ctx, fen: sacFen, played: 'd3h7', reply: 'g8h7',
  expectedBefore: 60, expectedAfter: 60, base: 'mistake', isBest: false }), 'mistake', 'a bad sacrifice is not Brilliant');
assert.equal(R.openingBookPly(['e2e4'], 0), true);
assert.equal(R.openingBookPly(['e2e4', 'c7c5', 'g1f3'], 2), true);
assert.equal(R.openingBookPly(['a2a4'], 0), false);
assert.equal(R.openingBookPly(['e2e4', 'a7a5'], 1), false);
assert.equal(R.openingBookPly(['e2e4'], 20), false);
// For every represented book prefix, a Chess.js legal move must exist.
const source = readFileSync(new URL('../www/review-classification.js', import.meta.url), 'utf8');
const body = source.split('const lines = [')[1].split('];')[0];
let bookLines = 0;
for (const match of body.matchAll(/'([a-h][1-8][a-h][1-8][nbrq]?(?: [a-h][1-8][a-h][1-8][nbrq]?)+)'/g)) {
  const ch = new Chess(); const moves = match[1].split(' ');
  moves.forEach((u, i) => {
    const v = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    assert.ok(v, `illegal move ${u} at index ${i} in book line ${match[1]}`);
    assert.equal(R.openingBookPly(moves, i), true, `book prefix not recognized: ${match[1]}`);
  });
  bookLines++;
}
assert.ok(bookLines >= 25);
const games = JSON.parse(readFileSync(new URL('./fixtures/chesscom-calibration.json', import.meta.url), 'utf8'));
const available = games.map(g => {
  const score = A.scoreGame(g.pov, g.moves, g.best);
  let bookAdded = 0;
  for (let i = 0; i < g.moves.length; i++) {
    if (R.openingBookPly(g.moves, i) && score.moves[i].cls !== 'best' && ['excellent','good'].includes(score.moves[i].cls)) bookAdded++;
  }
  return bookAdded;
});
console.log(`PASS: review-classification, ${bookLines} opening lines, 6 calibration games (extra book= ${available.join(', ')})`);
