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
 * Base categories follow a fitted Win%-loss proxy of the published Chess.com
 * Expected Points V2 cutoffs. Special categories are applied in review-classification.js.
 * This is NOT the proprietary Chess.com algorithm or CAPS2.
 *
 * Accuracy model v9 (13 November 2026). Recalibrated using 629 games
 * analysed by this app's bundled Stockfish (189 prior + 440 new) sampled
 * from 2,648 unique user-supplied Chess.com PGNs with published accuracy.
 * There are 384 training, 110 validation, and 135 entirely different-
 * profile hold-out games at 20ms per position (total: 1,258 player targets).
 * A subset of 24 games was also evaluated at the app's 350ms budget.
 * Model selection used only the validation games; the new-profile hold-out
 * was consulted solely for final evaluation, not for fitting parameters.
 * At the 20ms budget, the new-profile holdout MAE fell from 4.083 to 3.920
 * accuracy points; at 350ms for 6 held-out games, from 3.963 to 3.761.
 * The old 6-game deep validation regressed from 2.922 to 3.013. Gains
 * are modest and do not guarantee closer results for all positions.
 * The selected nonlinear power exponent is regularized around the old
 * exponential model. No Chess.com data is bundled in the application.
 * Per-move category tags are unchanged because the public export provides
 * overall game accuracy, not Brilliant/Great or other per-move labels.
 * Chess.com CAPS2 is proprietary; these scores are independent estimates.
 *
 * Base move classification is a separate empirical Win%-loss proxy;
 * it is NOT a direct application of Chess.com's 2/5/10/20 percentage-point
 * Expected Points V2 thresholds, because the input variable differs.
 * Stockfish depth and device performance affect accuracy and classification.
 *
 * GPL-3.0-or-later; see LICENSE.
 */
(function (root) {
  'use strict';
  const ACCURACY_VERSION = 9;
  // Fitted to Stockfish-based move-loss features from train games only.
  // Held-out data is not embedded in the release; see CHANGES_V116_BG.md.
  const DECAY = 0.1010956;
  const LOSS_POWER = 1.0801004;
  const VOLATILITY_SHARE = 0.2443476;
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
    return clip(103.1668100711649 * Math.exp(-DECAY * Math.pow(loss, LOSS_POWER))
      - 3.166924740191411 + 1, 0, 100);
  }

  function standardDeviation(values) {
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
  }

  // Based on Lichess' 2..8-position sliding window; scores blend the
  // volatility-weighted and plain move average to reduce sampling bias.
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

  // Classification fitted in v1.0.14 with 31 matched screenshots/PGNs and six earlier games.
  // These are thresholds in Lichess-like Win% LOSS, NOT Chess.com's rating-
  // dependent Expected Points V2. The broader final Mistake range avoids
  // incorrectly labelling small-search-noise swings as Blunders; genuine
  // large losses still receive Blunder. Miss is folded into Mistake later.
  function classify(loss, isEngineBest) {
    if (isEngineBest) return 'best';
    if (loss <= 1.8) return 'excellent';
    if (loss <= 3.9) return 'good';
    if (loss <= 6.5) return 'inacc';
    if (loss <= 30) return 'mistake';
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
      const meanW = w.reduce((total, value) => total + value, 0) / w.length;
      for (let i = 0; i < a.length; i++) {
        const blended = VOLATILITY_SHARE * w[i] + (1 - VOLATILITY_SHARE) * meanW;
        sum += a[i] * blended;
        sumW += blended;
      }
      return clip(sum / sumW, 0, 100);
    }
    return { moves: out, w: aggregate('w'), b: aggregate('b'), version: ACCURACY_VERSION };
  }

  const api = Object.freeze({ version: ACCURACY_VERSION, winPct, moveAccuracy, moveLoss, volatilityWeights, classify, scoreGame });
  root.ChessAccuracy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
