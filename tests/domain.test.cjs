const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window={};require('../source/domain.js');const D=window.MagicDomain;
test('XP follows the requested formula, including corrected examples',()=>{
  for(const [seconds,resolution,referenceCount,expected] of [[4,'480p',1,10],[10,'720p',3,49],[15,'1080p',5,120],[20,'1080p',10,235],[30,'1080p',15,465]])assert.equal(D.xp({seconds,resolution,referenceCount}),expected);
  assert.equal(D.xp({seconds:4,resolution:'480p',referenceCount:0}),10);
});
test('unknown costs are not treated as reported zeroes; failed jobs earn no XP',()=>{
  const s=D.totals([{status:'completed',seconds:4,resolution:'480p',referenceCount:1,cost:0},{status:'completed',seconds:4,resolution:'480p',referenceCount:1,cost:.25},{status:'failed',cost:null},{status:'running',cost:null}]);
  assert.deepEqual(s,{total:4,completed:2,failed:1,running:1,cost:.25,unknownCost:1,xp:20});
});
test('ports offer compatible node types',()=>{
  assert.deepEqual(D.compatible('generation','in'),['media','preset']);
  assert.deepEqual(D.compatible('generation','out'),['output']);
  assert.deepEqual(D.compatible('output','in'),['generation']);
});
