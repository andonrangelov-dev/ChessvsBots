/** Prepare target labels and engine-only features for offline cross-validation. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const A=require('../www/accuracy.js'); const R=require('../www/review-classification.js');
const rows=JSON.parse(readFileSync(process.argv[2],'utf8'));
const out=rows.map(g=>{
 const wp=g.pov.map(A.winPct), weights=A.volatilityWeights(wp);
 const groups={w:{loss:[],wt:[]},b:{loss:[],wt:[]}};
 for(let i=0;i<g.moves.length;i++) {
  const side=i%2?'b':'w';
  const before=side==='w'?wp[i]:100-wp[i], after=side==='w'?wp[i+1]:100-wp[i+1];
  const isBest=g.best[i]===g.moves[i] || R.openingBookPly(g.moves,i);
  const loss=isBest?0:A.moveLoss(before,after);
  groups[side].loss.push(loss);groups[side].wt.push(weights[i]);
 }
 return {id:g.url.split('/').pop(),split:g.split,account:g.account||null,time_class:g.time_class,white:g.accuracy_white,black:g.accuracy_black,groups};
});
writeFileSync(process.argv[3],JSON.stringify(out));
