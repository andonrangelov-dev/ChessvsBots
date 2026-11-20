/** Chess vs Bots — PGN clock annotations in Game Review.
 * Reads the MAIN LINE positions from an already validated chess.js PGN.
 * Keeps the clock from each player's last completed move when browsing plies;
 * supports [%clk H:MM:SS.s], [%clk MM:SS.s] and Lichess/Chess.com formats.
 * Does not invent clock values for PGNs without clock annotations.
 * GPL-3.0-or-later.
 */
(function (root) {
  'use strict';
  function parseClock(value) {
    if (typeof value !== 'string') return null;
    const parts = value.trim().split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return null;
    const nums = parts.map(Number), last = nums[nums.length - 1];
    if (!Number.isFinite(last) || last >= 60) return null;
    const minutes = nums[nums.length - 2];
    if (!Number.isInteger(minutes) || (parts.length === 3 && minutes >= 60)) return null;
    const hours = parts.length === 3 ? nums[0] : 0;
    if (!Number.isInteger(hours)) return null;
    return Math.round(((hours * 60 + minutes) * 60 + last) * 1000);
  }
  function parseInitial(control) {
    // A single fixed base + optional Fischer increment; ignore multi-stage and
    // correspondence controls (1/86400) rather than guessing.
    if (typeof control !== 'string') return null;
    const match = /^(\d+)(?:\+\d+)?$/.exec(control.trim());
    if (!match) return null;
    const sec = Number(match[1]);
    return Number.isFinite(sec) && sec > 0 && sec < 86400 ? sec * 1000 : null;
  }
  function parseGame(chess, ChessCtor) {
    if (!chess || typeof chess.getComments !== 'function' || typeof ChessCtor !== 'function') return null;
    const history = chess.history({ verbose: true });
    if (!history.length) return null;
    const comments = new Map(chess.getComments().map(c => [c.fen, c.comment]));
    const walker = new ChessCtor();
    const moves = history.map(m => {
      walker.move({ from: m.from, to: m.to, promotion: m.promotion });
      const text = comments.get(walker.fen()) || '';
      const match = /\[%clk\s+([^\]]+)\]/i.exec(text);
      return match ? parseClock(match[1]) : null;
    });
    if (!moves.some(x => x !== null)) return null;
    const headers = typeof chess.getHeaders === 'function' ? chess.getHeaders() : chess.header();
    return { initialMs: parseInitial(headers.TimeControl), moves };
  }
  function atPly(clocks, ply) {
    if (!clocks || !Array.isArray(clocks.moves)) return { w: null, b: null };
    const result = { w: clocks.initialMs ?? null, b: clocks.initialMs ?? null };
    for (let i = 0; i < Math.max(0, Math.min(ply, clocks.moves.length)); i++) {
      const val = clocks.moves[i];
      if (Number.isFinite(val) && val >= 0) result[i % 2 ? 'b' : 'w'] = val;
    }
    return result;
  }
  function format(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const d2 = x => String(x).padStart(2, '0');
    // Show 1/10 second in time trouble when PGN provides the precision.
    const tenths = Math.floor(ms % 1000 / 100);
    const base = h ? h + ':' + d2(m) + ':' + d2(sec) : d2(Math.floor(s / 60)) + ':' + d2(sec);
    return s < 20 && ms % 1000 ? base + '.' + tenths : base;
  }
  function comment(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
    const fraction = Math.floor(ms % 1000 / 100);
    return '[%clk ' + h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + (ms % 1000 ? '.' + fraction : '') + ']';
  }
  const api = Object.freeze({ parseClock, parseInitial, parseGame, atPly, format, comment });
  root.ChessReviewClocks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
