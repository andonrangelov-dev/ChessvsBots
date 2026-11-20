/**
 * Offline Chess.com calibration corpus evaluator (Node >= 22).
 * Usage: node scripts/calibrate-chesscom.mjs /path/to/export.json /path/to/evals.json [movetimeMs=35] [maxGames=189]
 * The corpus is USER DATA. Keep the output separate from redistributable app ZIP archives.
 * Each game is evaluated once with the SAME bundled Stockfish 19 Lite used in the app.
 * Results are resumable. The Chess.com target accuracies are only comparison labels.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = process.argv[2], dest = process.argv[3];
if (!dataPath || !dest) { console.error('Need input export JSON and output evals JSON paths'); process.exit(2); }
const ms = Math.max(10, Number(process.argv[4]) || 35);
const maxGames = Math.max(1, Number(process.argv[5]) || 189);
const all = JSON.parse(readFileSync(dataPath, 'utf8'));
if (!Array.isArray(all.games) || !all.games.every(g => typeof g.pgn === 'string')) throw Error('Expected Chess.com calibration export');
const context={window:{}};
vm.runInNewContext(readFileSync(root+'/www/chess.min.js', 'utf8'), context);
const Chess=context.window.Chess;
const already=existsSync(dest) ? JSON.parse(readFileSync(dest,'utf8')) : [];
const seen=new Set(already.map(g=>g.url));
const sf=spawn(process.execPath, [root+'/www/engine/stockfish-19-lite-single.js'], {cwd:root+'/www/engine',stdio:['pipe','pipe','pipe']});
let buffer='', lines=[], waitForLine=null, fatal=null;
const errorLine=()=>{throw fatal || Error('Engine stopped unexpectedly')};
function send(s){if(fatal)errorLine();sf.stdin.write(s+'\n')}
sf.stdout.on('data', chunk=> { buffer+=chunk.toString(); let j; while((j=buffer.indexOf('\n'))>=0) { const line=buffer.slice(0,j).trim(); buffer=buffer.slice(j+1); if(line.startsWith('info ') && line.includes(' score ') && line.includes(' pv ') && !line.includes(' lowerbound') && !line.includes(' upperbound')) lines.push(line); if(waitForLine && waitForLine.pred(line)) {let w=waitForLine;waitForLine=null;clearTimeout(w.timer);w.resolve(line)} } });
sf.stderr.on('data', d=>process.stderr.write(d));
sf.on('exit', code=>{fatal=new Error('Stockfish exit '+code);if(waitForLine){const w=waitForLine;waitForLine=null;clearTimeout(w.timer);w.reject(fatal)}});
function expect(pred, cmd, timeout=20000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waitForLine=null;reject(Error('Stockfish timeout '+cmd))},timeout);waitForLine={pred,resolve,reject,timer};send(cmd)})}
await expect(l=>l==='uciok','uci',30000);send('setoption name Threads value 1');send('setoption name Hash value 16');send('setoption name MultiPV value 2');await expect(l=>l==='readyok','isready');
function extractInfo(bm){const byDepth=new Map();for(const l of lines){const t=l.split(' ');const r={depth:0,multipv:1,cp:null,mate:null,pv:[]};for(let j=1;j<t.length;j++){if(t[j]==='depth')r.depth=+t[++j];else if(t[j]==='multipv')r.multipv=+t[++j];else if(t[j]==='score'){const typ=t[++j],v=+t[++j];if(typ==='cp')r.cp=v;else if(typ==='mate')r.mate=v;}else if(t[j]==='pv'){r.pv=t.slice(j+1);break}}if(!r.depth||!r.pv.length||(!Number.isFinite(r.cp)&&!Number.isFinite(r.mate)))continue;if(!byDepth.has(r.depth))byDepth.set(r.depth,new Map());byDepth.get(r.depth).set(r.multipv,r)}
 const d=[...byDepth.keys()].sort((a,b)=>b-a);
 const selected=d.find(x=>byDepth.get(x).has(1)&&byDepth.get(x).has(2)&&byDepth.get(x).get(1).pv[0]===bm)
 ?? d.find(x=>byDepth.get(x).has(1)&&byDepth.get(x).get(1).pv[0]===bm)
 ?? d.find(x=>byDepth.get(x).has(1)&&byDepth.get(x).has(2))
 ?? d.find(x=>byDepth.get(x).has(1));
 if(selected==null)throw Error('No complete engine PV');
 const pv=byDepth.get(selected),p=pv.get(1),q=pv.get(2);
 const score=(x)=>!x?null:Number.isFinite(x.mate)?(x.mate>0?10000-x.mate:-10000-x.mate):x.cp;
 return {cp:score(p),second:score(q),depth:selected,best:bm||p.pv[0]};}
let done=0, skip=0, bad=0;
try {
 for (const g of all.games.slice(0,maxGames)) {
  if(seen.has(g.url)){skip++;continue}
  const ch=new Chess();
  try { ch.loadPgn(g.pgn) } catch(e) {console.warn('SKIP bad PGN',g.url,e.message);bad++;continue}
  const movesVerbose=ch.history({verbose:true});ch.reset();
  const fen=[ch.fen()],moves=[];
  for(const m of movesVerbose) {const played=ch.move(m);if(!played)throw Error('Invalid move '+g.url);moves.push(m.from+m.to+(m.promotion||''));fen.push(ch.fen())}
  const pov=[],best=[],second=[],depth=[];
  const started=Date.now();send('ucinewgame');
  for(let i=0;i<fen.length;i++){
   const c=new Chess(fen[i]),stm=c.turn();
   if(c.isCheckmate()||c.isDraw()||c.isStalemate()||c.isInsufficientMaterial()){
    pov.push(c.isCheckmate()?(stm==='w'?-10000:10000):0);best.push(null);second.push(null);depth.push(0);continue;
   }
   lines=[];
   send('position fen '+fen[i]);
   const bm=(await expect(l=>l.startsWith('bestmove'),'go movetime '+ms+' depth 18', Math.max(20000,ms+20000))).split(' ')[1];
   const v=extractInfo(bm);
   pov.push((stm==='w'?1:-1)*v.cp);best.push(v.best);second.push(v.second);depth.push(v.depth);
  }
  already.push({url:g.url,split:g.split,time_class:g.time_class,accuracy_white:g.accuracy_white,accuracy_black:g.accuracy_black,moves,pov,best,second,depth});
  writeFileSync(dest,JSON.stringify(already));
  done++;
  console.log(`${done+skip}/${Math.min(maxGames,all.games.length)} ${g.split} ${g.time_class} ${moves.length} plies ${((Date.now()-started)/1000).toFixed(1)}sec ${g.url}`);
 }
} finally {try{send('quit')}catch{}sf.kill()}
console.log('Finished', {done,skip,bad,total:already.length,output:dest});
