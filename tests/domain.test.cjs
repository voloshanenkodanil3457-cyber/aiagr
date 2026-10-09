const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window={};require('../source/domain.js');const D=window.MagicDomain;
test('legacy Seedance labels migrate without changing explicit model or endpoint IDs',()=>{
  for(const value of [undefined,null,'','  ','seedance-2.5','Seedance 2.5','dreamina-seedance-2.5'])assert.equal(D.normalizeBytePlusModel(value),D.defaultVideoModel);
  assert.equal(D.normalizeBytePlusModel(null,'seedance-2.5'),D.defaultVideoModel);
  assert.equal(D.normalizeBytePlusModel(' ep-custom-id '),'ep-custom-id');
  assert.equal(D.normalizeBytePlusModel('dreamina-seedance-2-0-260128'),'dreamina-seedance-2-0-260128');
});
test('XP follows the requested formula, including corrected examples',()=>{
  for(const [seconds,resolution,referenceCount,expected] of [[4,'480p',1,10],[10,'720p',3,49],[15,'1080p',5,120],[20,'1080p',10,235],[30,'1080p',15,465]])assert.equal(D.xp({seconds,resolution,referenceCount}),expected);
  assert.equal(D.xp({seconds:4,resolution:'480p',referenceCount:0}),10);
});
test('unknown costs are not treated as reported zeroes; failed jobs earn no XP',()=>{
  const s=D.totals([{status:'completed',seconds:4,resolution:'480p',referenceCount:1,cost:0},{status:'completed',seconds:4,resolution:'480p',referenceCount:1,cost:.25},{status:'failed',cost:null},{status:'running',cost:null}]);
  assert.deepEqual(s,{total:4,completed:2,failed:1,running:1,cost:.25,unknownCost:0,xp:20,estimatedCostCount:0});
});
test('USD uses the exact per-second rates at 4, 5, 15 and 30 seconds',()=>{
  for(const resolution of ['480p','720p','1080p'])for(const seconds of [4,5,15,30])assert.equal(D.estimateCost({seconds,resolution}),Math.round(D.defaultVideoPrices[resolution]*seconds*1000000)/1000000);
  assert.equal(D.estimateCost({seconds:4,resolution:'480p'}),.412);
  assert.equal(D.estimateCost({seconds:15,resolution:'720p'}),3.465);
  assert.equal(D.estimateCost({seconds:5,resolution:'1080p'}),2.845);
  assert.equal(D.estimateCost({seconds:5,resolution:'480p',videoReferenceCount:1}),null);
  assert.equal(D.estimateCost({seconds:0,resolution:'480p'}),null);
});
test('saved costs stay fixed and historical estimates do not change with new tariffs',()=>{
  const row={status:'completed',seconds:4,resolution:'480p'};
  D.setVideoPrices({'480p':1,'720p':2,'1080p':3});
  assert.equal(D.videoCost(row),.412);assert.equal(D.estimateCost(row),4);
  assert.equal(D.videoCost({...row,cost:.25,costSource:'api'}),.25);
  assert.equal(D.videoCost({...row,cost:.412,costSource:'tariff'}),.412);
  assert.equal(D.estimateCost({...row,pricingRates:D.defaultVideoPrices}),.412);
  assert.throws(()=>D.setVideoPrices({'480p':-1,'720p':2,'1080p':3}));
  D.setVideoPrices(D.defaultVideoPrices);
  assert.equal(D.totals([{...row}, {...row,status:'failed'}, {...row,status:'running'}]).cost,.412);
});
test('ports offer compatible node types',()=>{
  assert.deepEqual(D.compatible('generation','in'),['media','preset']);
  assert.deepEqual(D.compatible('generation','out'),['output']);
  assert.deepEqual(D.compatible('output','in'),['generation']);
});
