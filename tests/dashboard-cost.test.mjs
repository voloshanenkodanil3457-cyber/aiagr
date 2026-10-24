import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {generationTitles} from '../cloudflare-worker/prompt-improver.js';
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('source/domain.js','utf8'),c);const D=c.window.MagicDomain;
test('incomplete Higgsfield totals distinguish estimates, unknowns and request-bound Billing confirmations',()=>{
 const image={id:'a',uid:'bob',provider:'higgsfield',requestId:'image-task',status:'completed',cost:.8224,costSource:'higgsfield_tariff'},video={id:'b',uid:'bob',provider:'higgsfield',requestId:'video-task',status:'completed'};
 let stats=D.totals([image,video]);assert.equal(stats.estimatedCost,.8224);assert.equal(stats.confirmedCost,0);assert.equal(stats.unknownCost,1);assert.match(D.totalCostLabel(stats),/неполный итог/);
 assert.equal(D.costInfo({...image,costSource:'api'}).kind,'estimated');
 const corrected=(row,amount)=>({...row,billingCorrection:{uid:row.uid,requestId:row.requestId,amount}});
 stats=D.totals([corrected(image,.7),corrected(video,1.54)]);assert.equal(stats.cost,2.24);assert.equal(stats.confirmedCost,2.24);assert.equal(stats.estimatedCost,0);assert.equal(stats.unknownCost,0);assert.equal(D.totalCostLabel(stats),'$2.24');
 assert.equal(D.videoCost({...image,billingCorrection:{uid:'other',requestId:image.requestId,amount:99}}),.8224);
 assert.equal(D.videoCost({...image,billingCorrection:{uid:image.uid,requestId:'other',amount:99}}),.8224);
 assert.equal(D.videoCost(corrected(video,0)),0);
});
test('Higgsfield uses documented tokens, model rates, input duration and explicit account discount',()=>{
 assert.equal(D.higgsfieldCost({model:'bytedance/seedance-2.5',seconds:5,resolution:'720p'}),2.3112);
 assert.equal(D.higgsfieldCost({model:'bytedance/seedance-2.0',seconds:5,resolution:'720p'}),1.512);
 assert.equal(D.higgsfieldCost({model:'bytedance/seedance-2.0',seconds:5,resolution:'480p',ratio:'9:16'}),.70308);
 const input={model:'bytedance/seedance-2.5',seconds:5,resolution:'720p',videoReferenceCount:1,inputVideoSeconds:5};assert.equal(D.higgsfieldCost(input),2.77344);assert.equal(D.higgsfieldCost({...input,discount:15}),2.357424);
 assert.equal(D.higgsfieldCost({...input,inputVideoSeconds:null}),null);assert.equal(D.higgsfieldCost({...input,discount:101}),null);assert.equal(D.higgsfieldCost({...input,model:'bytedance/seedance-2.0',seconds:16}),null);
 assert.equal(D.higgsfieldCost({...input,taskMode:'edit',sourceSeconds:5,seconds:30}),2.77344);
 assert.equal(D.totals([{...input,status:'completed'},{provider:'byteplus',status:'completed',cost:1},{...input,status:'failed'}]).cost,1); // provider must be explicit
 const totals=D.totals([{...input,provider:'higgsfield',status:'completed'},{provider:'byteplus',status:'completed',cost:1}]);assert.equal(totals.cost,3.77344);assert.equal(totals.estimatedCostCount,1);
 assert.equal(D.videoCost({...input,provider:'higgsfield',status:'completed',cost:.5}),.5);
});
test('AI title batches return only validated 2–3 word titles and never call the video provider',async()=>{
 let calls=0;const env={AI:{run:async(model,args)=>{calls++;assert.match(args.messages[0].content,/untrusted/);assert.match(args.messages[1].content,/clay/);return {response:'["Пластилиновая прогулка","Танец под дождём"]'};}}};
 const body={items:[{id:'one',prompt:'clay walking people'},{id:'two',prompt:'rain dance'}]},data=await generationTitles(body,env,'title-test');assert.equal(data.items[0].title,'Пластилиновая прогулка');assert.equal(data.items[1].id,'two');assert.equal(calls,1);
 await assert.rejects(generationTitles(body,env,'title-test'),/уже обрабатываются/);assert.equal(calls,1);
 await assert.rejects(generationTitles({items:Array(7).fill(body.items[0])},env,'too-many'),/Неверный/);assert.equal(calls,1);
 await assert.rejects(generationTitles(body,{AI:{run:async()=>({response:'["one","two"]'})}},'bad-titles'),/короткие названия/);
});
