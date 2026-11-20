import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { forMove, colorFor }=require('../www/review-arrows.js');
const best=colorFor('best');
const p='e2e4', alt='d2d4';
for(const c of ['brilliant','great','best','excellent','good','inacc','mistake','blunder']) {
 const same=forMove(p,p,c);
 assert.equal(same.length,1,`${c}: no overlapping best+actual arrow`);
 assert.equal(same[0].color, colorFor(c==='brilliant'||c==='great'?c:'best'));
 const different=forMove(p,alt,c);
 assert.equal(different.length,['brilliant','great','best'].includes(c)?1:2,c);
 assert.equal(different[0].color,colorFor(c==='best'?'best':c),c);
 if(different.length===2) {
  assert.equal(different[1].color,best);
  assert.deepEqual([different[1].from,different[1].to],['d2','d4']);
 }
}
for(const c of ['excellent','good','mistake','inacc','blunder'])
 assert.equal(forMove(p,null,c).length,1);
assert.equal(forMove('',alt,'excellent').length,0);
assert.deepEqual(forMove('e7e8q','e7e8q','best').length,1);
// Same logic for Black's and White's UCI moves (nothing uses player colour).
assert.deepEqual([forMove('e7e5','d7d5','good').length,forMove('e2e4','d2d4','good').length],[2,2]);
console.log('PASS: category-coloured review arrows, both sides, PGN, no duplication');
