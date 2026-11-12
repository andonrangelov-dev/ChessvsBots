/**
 * Chess vs Bots — offline post-game accuracy, based on Lichess' public method.
 *
 * Sources (checked November 2026):
 * https://lichess.org/page/accuracy
 * https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/AccuracyPercent.scala
 * https://github.com/lichess-org/scalachess/blob/master/core/src/main/scala/eval.scala
 *
 * Evaluation input: centipawns from WHITE'S perspective after each half-move,
 * starting with the initial position (n+1 scores for n moves). Mate scores are
 * represented by signed cp values outside [-1000,+1000] and safely clipped.
 *
 * Labels (Best/Excellent/Good/Inaccuracy/Mistake/Blunder) are Chess vs Bots' own bands
 * based on win-percentage-point loss; NOT official Chess.com categories.
 *
 * Version 5 (calibrated against chess.com, 12 November 2026): 6 real chess.com games (12 players) were analysed with this
 * engine and the constants below were fitted to chess.com's accuracy (mean difference 2.9 points; 3.9 when each game is left
 * out of the fit in turn). What differs from Lichess: the curve that turns a lost Win% into a move score falls faster
 * (DECAY 0.08 instead of 0.04354) and a player's score is the volatility-weighted mean only (no harmonic mean).
 * Versions 3 and 4 added a centipawn term for decided positions; it was removed because the shallow evaluations of won
 * positions jump between "mate" and a few hundred cp and that term counted every jump as a blunder (the same game scored
 * 36 % in one run and 74 % in the next). The Win% curve is flat there, so such noise now costs nothing.
 *
 * Stockfish build and search depth affect the result. This is not CAPS2.
 * GPL-3.0-or-later; see LICENSE.
 */
(function (root) {
  'use strict';
  const ACCURACY_VERSION = 5;
  // Chess.com's score of a single move falls faster than Lichess' with the Win% lost (fitted: 0.08; Lichess uses 0.04354).
  const DECAY = 0.08;
  const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Scalachess WinPercent.fromCentiPawns: ±1000 cp ceiling, logistic scale.
  function winPct(cp) {
    if (!Number.isFinite(cp)) throw new TypeError('Invalid centipawn evaluation');
    return 100 / (1 + Math.exp(-0.00368208 * clip(cp, -1000, 1000)));
  }

  // As in the current Lichess server implementation, apply the +1 point
  // uncertainty allowance only when winning chances were actually lost.
  function moveAccuracy(winBefore, winAfter) {
    if (!(Number.isFinite(winBefore) && Number.isFinite(winAfter))) throw new TypeError('Invalid winning chance');
    if (winAfter >= winBefore) return 100;
    const loss = winBefore - winAfter;
    return clip(103.1668100711649 * Math.exp(-DECAY * loss)
      - 3.166924740191411 + 1, 0, 100);
  }

  function standardDeviation(values) {
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
  }

  // Same grouping used by Lichess: a 2..8-position sliding window,
  // with first-window padding. Weight is stddev(Win%) clamped to .5..12.
  function volatilityWeights(wp) {
    const plies = wp.length - 1;
    if (plies <= 0) return [];
    const width = clip(Math.floor(plies / 10), 2, 8);
    const windows = [];
    const first = wp.slice(0, width);
    for (let i = 0; i < Math.min(width, wp.length) - 2; i++) windows.push(first);
    for (let i = 0; i + width <= wp.length; i++) windows.push(wp.slice(i, i + width));
    return Array.from({ length: plies }, (_, i) =>
      clip(standardDeviation(windows[i] || first), 0.5, 12));
  }

  // Loss of a move in win% points (Lichess method).
  function moveLoss(winBefore, winAfter) {
    return Math.min(100, Math.max(0, winBefore - winAfter));
  }

  // Thresholds (Win% points lost) fitted to the Chess.com counts of the 6 games: their totals for Excellent / Good / Inaccuracy / Mistake /
  // Blunder+Miss were 198 / 75 / 72 / 29 / 29, these thresholds give 199 / 87 / 78 / 38 / 26 on the same games.
  // Defined by this game, not by Lichess or Chess.com. "Best" is only the engine's own first choice (or a mating move);
  // every other move is judged by the win% points it loses.
  function classify(loss, isEngineBest) {
    if (isEngineBest) return 'best';
    if (loss <= 1.5) return 'excellent';
    if (loss <= 3.5) return 'good';
    if (loss <= 7) return 'inacc';
    if (loss <= 14) return 'mistake';
    return 'blunder';
  }

  function scoreGame(pov, moves, best) {
    if (!Array.isArray(pov) || !Array.isArray(moves) || pov.length !== moves.length + 1) {
      throw new Error('One evaluation is required before and after every move');
    }
    if (!pov.every(Number.isFinite)) throw new Error('Non-finite engine evaluation');
    const wp = pov.map(winPct);
    const weights = volatilityWeights(wp);
    const scores = { w: [], b: [] }, sideWeights = { w: [], b: [] }, out = [];
    for (let i = 0; i < moves.length; i++) {
      const side = (i % 2) ? 'b' : 'w';
      const before = side === 'w' ? wp[i] : 100 - wp[i];
      const after = side === 'w' ? wp[i + 1] : 100 - wp[i + 1];
      const loss = moveLoss(before, after);
      const isBest = !!best && !!best[i] && best[i] === moves[i];
      // Stockfish's PV can be more stable than separate, time-limited
      // evaluations of consecutive positions; avoid penalising its best move.
      const score = isBest ? 100 : moveAccuracy(100, 100 - loss);
      const cls = classify(isBest ? 0 : loss, isBest);
      out.push({ cls, score, loss, el: (isBest ? 0 : loss) / 100 });
      scores[side].push(score);
      sideWeights[side].push(weights[i]);
    }
    function aggregate(side) {
      const a = scores[side], w = sideWeights[side];
      if (!a.length) return 0;
      let sum = 0, sumW = 0;
      for (let i = 0; i < a.length; i++) { sum += a[i] * w[i]; sumW += w[i]; }
      return clip(sum / sumW, 0, 100);
    }
    return { moves: out, w: aggregate('w'), b: aggregate('b'), version: ACCURACY_VERSION };
  }

  const api = Object.freeze({ version: ACCURACY_VERSION, winPct, moveAccuracy, moveLoss, volatilityWeights, classify, scoreGame });
  root.ChessAccuracy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
