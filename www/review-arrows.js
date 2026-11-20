/** Chess vs Bots — category-coloured review arrows (both sides, all PGNs).
 * The played move is ALWAYS drawn. A distinct best-engine suggestion is drawn
 * in green, except for Brilliant/Great, which display the played move only.
 * Same-move arrows are never overlaid. No analysis values are modified.
 * GPL-3.0-or-later. */
(function(root) {
  'use strict';
  const PALETTE = Object.freeze({
    brilliant: '#18c2d6', great: '#8c73ed', best: '#3fbf8f',
    excellent: '#5ccfc4', good: '#7bb7e8', inacc: '#e7b743',
    mistake: '#f08a3c', blunder: '#ef5b5b'
  });
  const CSS_KEYS = Object.freeze({
    brilliant: '--q-brill', great: '--q-great', best: '--q-best',
    excellent: '--q-exc', good: '--q-good', inacc: '--q-inacc',
    mistake: '--q-mistake', blunder: '--q-blunder'
  });
  function squares(move) {
    if (typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
      return { from: move.slice(0, 2), to: move.slice(2, 4) };
    if (move && typeof move.from === 'string' && typeof move.to === 'string' &&
      /^[a-h][1-8]$/.test(move.from) && /^[a-h][1-8]$/.test(move.to))
      return { from: move.from, to: move.to };
    return null;
  }
  function equal(a, b) { return !!a && !!b && a.from === b.from && a.to === b.to; }
  function colorFor(category, palette) {
    // The default palette mirrors the category chips, including light-mode values.
    const cssKey = CSS_KEYS[category];
    if (palette && palette[category]) return palette[category];
    if (cssKey && typeof document !== 'undefined') {
      const val = getComputedStyle(document.documentElement).getPropertyValue(cssKey).trim();
      if (val) return val;
    }
    return PALETTE[category] || PALETTE.good;
  }
  function forMove(played, best, category, palette) {
    const actual = squares(played), suggested = squares(best);
    if (!actual) return [];
    const special = category === 'brilliant' || category === 'great';
    // Keep the arrow colour consistent with the VISIBLE classification badge.
    // An occasional engine-PV/category disagreement must not produce a green
    // arrow under a blue Good (or teal Excellent) label. Best is green.
    // When best and played share a path, draw that path only ONCE.
    const same = equal(actual, suggested);
    const arrows = [{ ...actual, color: colorFor(category, palette), opacity: 0.94 }];
    if (!special && category !== 'best' && !same && suggested)
      arrows.push({ ...suggested, color: colorFor('best', palette), opacity: 0.89 });
    return arrows;
  }
  const api = Object.freeze({ forMove, colorFor });
  root.ChessReviewArrows = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
