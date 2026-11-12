/**
 * engine.js — Stockfish 19 (lite, single-threaded WebAssembly, GPL v3) running offline in a Web Worker.
 * UCI over postMessage. One search at a time; every call returns a Promise.
 *
 *   Engine.search(fen, { movetime, depth, multipv, skill, elo, moves }) -> { best, lines:[{ multipv, depth, cp, mate, pv:[uci…] }] }
 *     elo    -> UCI_LimitStrength + UCI_Elo (1320…3190)
 *     skill  -> "Skill Level" 0…20 (only when elo is not set)
 *     scores are from the point of view of the side to move.
 *
 * This file is part of Chess vs Bots and is released under the GNU GPL v3 (see LICENSE).
 */
'use strict';

window.Engine = (function () {
  const WORKER_URL = 'engine/stockfish-19-lite-single.js';
  let worker = null, readyPromise = null, failed = false;
  let listeners = [];
  let chain = Promise.resolve();          // serialises searches
  let cur = null;                         // the running search

  function post(cmd) { try { worker.postMessage(cmd); } catch (e) { /* worker gone */ } }

  function onLine(line) {
    if (typeof line !== 'string') return;
    for (const fn of listeners.slice()) fn(line);
  }
  function waitFor(test, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { remove(); reject(new Error('engine timeout')); }, ms || 20000);
      const fn = line => { if (test(line)) { clearTimeout(timer); remove(); resolve(line); } };
      const remove = () => { listeners = listeners.filter(x => x !== fn); };
      listeners.push(fn);
    });
  }

  function start() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      try {
        worker = new Worker(WORKER_URL);
        worker.onmessage = ev => onLine(ev.data);
        worker.onerror = () => { failed = true; };
        const uciok = waitFor(l => l === 'uciok', 30000);
        post('uci');
        await uciok;
        post('setoption name Threads value 1');
        post('setoption name Hash value 16');
        // Subscribe before posting: on a fast device readyok could otherwise
        // arrive before waitFor installs its listener.
        const readyok = waitFor(l => l === 'readyok', 20000);
        post('isready');
        await readyok;
        failed = false;
        return true;
      } catch (e) {
        failed = true;
        readyPromise = null;
        try { worker && worker.terminate(); } catch (_) {}
        worker = null;
        return false;
      }
    })();
    return readyPromise;
  }

  function parseInfo(line) {
    // info depth 12 seldepth 21 multipv 1 score cp 31 ... pv e2e4 e7e5
    // Bound-only search estimates are not full scores and should not be used
    // as exact centipawn evaluations in a post-game Accuracy calculation.
    if (!line.startsWith('info ') || line.indexOf(' pv ') < 0 || line.indexOf(' score ') < 0 ||
        line.includes(' lowerbound') || line.includes(' upperbound')) return null;
    const t = line.split(' ');
    const out = { multipv: 1, depth: 0, cp: null, mate: null, pv: [] };
    for (let i = 1; i < t.length; i++) {
      if (t[i] === 'depth') out.depth = +t[++i];
      else if (t[i] === 'multipv') out.multipv = +t[++i];
      else if (t[i] === 'score') { const k = t[++i], v = +t[++i]; if (k === 'cp') out.cp = v; else if (k === 'mate') out.mate = v; }
      else if (t[i] === 'pv') { out.pv = t.slice(i + 1); break; }
    }
    return out;
  }

  async function runSearch(fen, o) {
    if (!(await start())) throw new Error('engine unavailable');
    const iterations = new Map(); // one complete, depth-consistent MultiPV iteration
    let best = null;
    cur = { stopped: false };
    const me = cur;
    const collect = line => {
      const r = parseInfo(line);
      if (!r || r.depth < 1 || !(Number.isFinite(r.cp) || Number.isFinite(r.mate)) || !r.pv.length) return;
      if (!iterations.has(r.depth)) iterations.set(r.depth, new Map());
      iterations.get(r.depth).set(r.multipv, r);
    };
    listeners.push(collect);
    try {
      // Hash reuse across consecutive evaluations substantially speeds up
      // game analysis. A new analysis begins with an explicit ucinewgame.
      if (o.newGame) post('ucinewgame');
      post('setoption name MultiPV value ' + (o.multipv || 1));
      if (o.elo) {
        post('setoption name UCI_LimitStrength value true');
        post('setoption name UCI_Elo value ' + Math.max(1320, Math.min(3190, Math.round(o.elo))));
        post('setoption name Skill Level value 20');
      } else {
        post('setoption name UCI_LimitStrength value false');
        post('setoption name Skill Level value ' + (o.skill == null ? 20 : o.skill));
      }
      post('position fen ' + fen);
      let go = 'go';
      if (o.depth) go += ' depth ' + o.depth;
      if (o.movetime) go += ' movetime ' + o.movetime;
      if (!o.depth && !o.movetime) go += ' movetime 300';
      if (o.moves && o.moves.length) go += ' searchmoves ' + o.moves.join(' ');
      const done = waitFor(l => l.startsWith('bestmove'), (o.movetime || 3000) + 30000);
      post(go);
      const bm = await done;
      const m = bm.split(' ')[1];
      best = (m && m !== '(none)') ? m : null;
    } finally {
      listeners = listeners.filter(x => x !== collect);
      if (cur === me) cur = null;
    }
    // Avoid mixing the main line of depth 18 with a secondary line of depth
    // 16 when the time limit interrupted the last iterative-deepening pass.
    const depths = [...iterations.keys()].sort((a, b) => b - a);
    const target = Math.max(1, Math.round(o.multipv || 1));
    let chosenDepth = depths.find(d => {
      const it = iterations.get(d);
      return it.has(1) && it.size >= target && (!best || it.get(1).pv[0] === best);
    });
    if (chosenDepth == null) chosenDepth = depths.find(d => iterations.get(d).has(1) && (!best || iterations.get(d).get(1).pv[0] === best));
    if (chosenDepth == null) chosenDepth = depths.find(d => iterations.get(d).has(1));
    const batch = chosenDepth == null ? new Map() : iterations.get(chosenDepth);
    const arr = [...batch.keys()].sort((a, b) => a - b).map(k => batch.get(k));
    return { best, lines: arr, depth: chosenDepth || 0 };
  }

  function search(fen, o) {
    const p = chain.then(() => runSearch(fen, o || {}));
    chain = p.catch(() => {});
    return p;
  }
  // Ask the running search to finish early (its promise resolves with what it has).
  function stop() { if (cur && worker) post('stop'); }
  function terminate() { try { worker && worker.terminate(); } catch (_) {} worker = null; readyPromise = null; chain = Promise.resolve(); cur = null; }

  return { start, search, stop, terminate, isFailed: () => failed };
})();
