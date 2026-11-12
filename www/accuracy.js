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
 * Version 3 adds a non-saturating centipawn term (see CP_* below) because the Lichess curve
 * flattens in decided positions and the Stockfish 19 evaluation scale is large (a piece up is
 * about +7 pawns), which made bad moves in won/lost positions almost free.
 *
 * Stockfish build and search depth affect the result. This is not CAPS2.
 * GPL-3.0-or-later; see LICENSE.
 */
(function (root) {
  'use strict';
  const ACCURACY_VERSION = 3;
  // Lichess measures only the loss of winning chances. That curve flattens out quickly (+7 pawns and +15 pawns both mean ~100%), so in a
  // won or lost position even a bad move costs almost nothing and a side that keeps blundering in a lost game still gets a high score.
  // This game adds one extra term, used only when it is larger: the loss in centipawns, which does not flatten out. It is expressed in
  // "win% points" with the slope of the Lichess curve at an equal position, so in equal positions it changes nothing, and it is reduced
  // for positions that are already decided (a 1.5 pawn slip at +12 hurts less than at 0.0).
  const CP_PER_WINPCT = 0.092;     // win% points per centipawn at an equal position (= 25 * 0.00368208)
  const CP_FREE = 15;              // engine noise (cp) that is never counted
  const CP_DECIDED = 600;          // the cp term is halved at |eval| = CP_DECIDED, a third at 2 * CP_DECIDED, ...
  const CP_CLIP = 1500;            // mates and huge scores are treated as +-15 pawns
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
    return clip(103.1668100711649 * Math.exp(-0.04354415386753951 * loss)
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

  // Loss of a move in win% points: the larger of the Lichess loss and the (damped) centipawn loss.
  function moveLoss(winBefore, winAfter, cpBefore, cpAfter) {
    const lossWin = Math.max(0, winBefore - winAfter);
    const b = clip(cpBefore, -CP_CLIP, CP_CLIP), a = clip(cpAfter, -CP_CLIP, CP_CLIP);
    const lossCp = CP_PER_WINPCT * Math.max(0, b - a - CP_FREE) / (1 + Math.abs(b) / CP_DECIDED);
    return Math.min(100, Math.max(lossWin, lossCp));
  }

  // Defined by this game, not by Lichess or Chess.com. "Best" is only the engine's own first choice (or a mating move);
  // every other move is judged by the win% points it loses.
  function classify(loss, isEngineBest) {
    if (isEngineBest) return 'best';
    if (loss <= 2) return 'excellent';
    if (loss <= 5) return 'good';
    if (loss <= 10) return 'inacc';
    if (loss <= 20) return 'mistake';
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
      const cpBefore = side === 'w' ? pov[i] : -pov[i], cpAfter = side === 'w' ? pov[i + 1] : -pov[i + 1];
      const loss = moveLoss(before, after, cpBefore, cpAfter);
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
      const weighted = sum / sumW;
      // A zero-accuracy move makes the genuine harmonic mean zero; never
      // silently substitute 1% (as the previous implementation did).
      const harmonic = a.some(x => x <= 0) ? 0 : a.length / a.reduce((s, x) => s + 1 / x, 0);
      return clip((weighted + harmonic) / 2, 0, 100);
    }
    return { moves: out, w: aggregate('w'), b: aggregate('b'), version: ACCURACY_VERSION };
  }

  const api = Object.freeze({ version: ACCURACY_VERSION, winPct, moveAccuracy, moveLoss, volatilityWeights, classify, scoreGame });
  root.ChessAccuracy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
