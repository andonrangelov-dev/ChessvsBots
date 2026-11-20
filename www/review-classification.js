/**
 * Chess vs Bots — offline Game Review move annotations.
 * Chess.com-inspired SPECIAL labels, NOT Chess.com's proprietary Game Review.
 * A 'Brilliant' candidate must be best/nearly-best, sacrifice a piece to the
 * opponent's best response, and keep a tenable position. A 'Great' candidate
 * must be one of the very few good choices in a meaningful position.
 * Book and Miss are folded into Best and Mistake respectively for our UI.
 *
 * Does not make any remote requests. Chess constructor is provided by caller.
 * GPL-3.0-or-later
 */
(function (root) {
  'use strict';
  const PIECES = { p: 1, n: 3.2, b: 3.3, r: 5, q: 9, k: 0 };
  const clip = (v, a, b) => Math.max(a, Math.min(b, v));
  const lines = [
    // Openings represented by safe, conventional principal lines (not a full ECO book).
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6',             // Ruy Lopez
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6',             // Italian
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',                 // Scotch
    'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6',                     // Four Knights
    'e2e4 e7e5 f2f4 e5f4 g1f3',                           // King's Gambit
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6',           // Sicilian
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4',                // Sicilian
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4',                // Sicilian
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6',                     // French
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5',                     // French advance
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4',                // Caro-Kann
    'e2e4 c7c6 d2d4 d7d5 e4e5',                           // Caro advance
    'e2e4 d7d5 e4d5 d8d5 b1c3',                           // Scandinavian
    'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6',                     // Pirc
    'e2e4 g7g6 d2d4 f8g7',                               // Modern
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6',                     // Queen's Gambit declined
    'd2d4 d7d5 c2c4 d5c4 g1f3',                           // Queen's Gambit accepted
    'd2d4 d7d5 c2c4 c7c6 b1c3 g8f6',                     // Slav
    'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6',                     // London
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6',          // King's Indian
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4',                     // Nimzo-Indian
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6',                     // Queen's Indian
    'd2d4 f7f5 c2c4 g8f6',                               // Dutch
    'c2c4 e7e5 b1c3 g8f6',                               // English
    'c2c4 c7c5 b1c3 b8c6',                               // Symmetrical English
    'c2c4 g8f6 b1c3 e7e6',                               // English
    'g1f3 d7d5 d2d4 g8f6 c2c4',                           // Reti/QG
    'g1f3 g8f6 c2c4 g7g6',                               // Reti/English
    'b2b3 e7e5 c1b2 b8c6',                               // Larsen
    'g2g3 d7d5 f1g2 g8f6',                               // King's fianchetto
    'b1c3 d7d5 e2e4',                                    // Dunst
  ];
  const BOOK_PREFIXES = new Set();
  for (const str of lines) {
    const moves = str.split(' ');
    for (let count = 1; count <= moves.length; count++) BOOK_PREFIXES.add(moves.slice(0, count).join(' '));
  }
  function openingBookPly(moves, i) {
    if (i < 0 || i >= moves.length || i >= 9) return false;
    return BOOK_PREFIXES.has(moves.slice(0, i + 1).join(' '));
  }
  function material(chess, side) {
    let balance = 0;
    const board = chess.board();
    for (const row of board) for (const p of row) if (p && p.type !== 'k') balance += (p.color === side ? 1 : -1) * PIECES[p.type];
    return balance;
  }
  const parseUci = u => u && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(u)
    ? { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined } : null;

  // A deliberately narrow, checkable definition avoids fake 'Brilliant' badges
  // for normal equal exchanges, already-won endgames, free pieces and blunders.
  function goodPieceSacrifice(ChessCtor, fen, played, reply, side) {
    if (!ChessCtor || !reply) return false;
    try {
      const c = new ChessCtor(fen);
      const before = material(c, side);
      const m = c.move(parseUci(played));
      if (!m || !['n', 'b', 'r', 'q'].includes(m.piece)) return false;
      const r = c.move(parseUci(reply));
      // The opponent's best reply *accepts* the offered piece, rather than
      // simply responding to an ordinary trade or taking an unrelated pawn.
      if (!r || !r.captured || r.to !== m.to || r.captured !== m.piece) return false;
      const after = material(c, side);
      return after <= before - 1.7;
    } catch (_) { return false; }
  }
  function classify(ctx) {
    const base = ctx.base;
    const best = !!ctx.isBest;
    const loss = Number.isFinite(ctx.loss) ? ctx.loss : 100;
    const expectedBefore = ctx.expectedBefore; // Win% proxy, 0..100; calibrated in accuracy.js
    const expectedAfter = ctx.expectedAfter;
    const rating = Number.isFinite(ctx.rating) ? clip(ctx.rating, 400, 3100) : 1500;
    // A verified opening-book prefix takes precedence over the shallow-search
    // category: known theory must not turn into an 'Inaccuracy' by search noise.
    if (ctx.book) return 'best';
    const goodEnough = best || (base === 'excellent' && loss <= 0.7);
    const gap = Math.max(0, Number(ctx.gap) || 0); // best vs runner-up winning chances, same search
    if (goodEnough && !ctx.checkmate && expectedBefore <= 88 && expectedAfter >= 44 &&
        goodPieceSacrifice(ctx.Chess, ctx.fen, ctx.played, ctx.reply, ctx.side)) return 'brilliant';
    // Large difference between the engine's #1 and #2 options: genuinely hard
    // to find, provided more than one legal move exists and the game isn't won.
    // Screenshot-matched calibration: the previous 4.5..11 point gap labelled
    // roughly twice as many ordinary moves "Great" as Chess.com. Require a
    // genuinely large difference between the two strongest alternatives.
    const onlyMoveThreshold = clip(20 + (rating - 1500) / 420, 17, 24);
    if (best && !ctx.checkmate && (ctx.legalCount || 0) > 1 &&
        expectedBefore >= 17 && expectedBefore <= 88 && expectedAfter >= 38 &&
        gap >= onlyMoveThreshold) return 'great';
    // Chess.com's 'Miss' is folded into Mistake. Here we only flag a missed
    // chance after the opponent made a sufficiently large mistake: the
    // opportunity must be substantial and the move must fail to exploit it.
    // Without per-ply Chess.com references this remains a conservative proxy.
    if (!best && ['inacc', 'mistake', 'blunder'].includes(base) &&
        Number.isFinite(ctx.expectedPrev) && expectedBefore - ctx.expectedPrev >= 10 &&
        expectedBefore >= 58 && expectedBefore <= 94 &&
        expectedAfter >= 19 && expectedAfter <= 75 &&
        expectedBefore - expectedAfter >= 7) return 'mistake';
    return base;
  }
  const api = Object.freeze({ classify, openingBookPly, goodPieceSacrifice });
  root.ChessReviewClassification = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
