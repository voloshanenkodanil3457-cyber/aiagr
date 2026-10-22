const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('source/canvas.js','utf8');
function fixture({batch='1',ready=true,fail=false}={}){
 const source={id:'G1',type:'generation',x:0,y:0,el:{offsetWidth:100,offsetHeight:100},assets:[],fields:{prompt:'Sunset',duration:'6',resolution:'480p',ratio:'9:16',generateAudio:'true',batch,apiProvider:'higgsfield'}};
 const controls=Object.fromEntries(['summary','error','submit','cancel','close'].map(k=>['[data-hf-'+k+']',{textContent:'',disabled:false}]));
 const dialog={open:false,html:'',setAttribute(){},set innerHTML(value){this.html=value;},querySelector:s=>controls[s],querySelectorAll:()=>[controls['[data-hf-cancel]'],controls['[data-hf-close]']],showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},remove(){}};
 const calls=[],records=[],outputs=[],nodes=new Map([[source.id,source]]),submittingSources=new Map();
 const context={structuredClone,Number,Set,Map,MagicProviders:require('../source/providers.js'),document:{createElement:()=>dialog,body:{append(){}}},$:(s,r)=>r.querySelector(s),hfDialogs:new Set(),submittingSources,jobs:new Map(),nodes,assets:new Map(),referenceIds:()=>[],incoming:()=>[],compiledPrompt:()=>source.fields.prompt,notify:m=>calls.push(['notice',m]),SPACE_ID:'space',SPACE:{name:'Space'},updateGenerateButtons(){},mutate:(_,fn)=>fn(),addNode:()=>{const n={id:'O'+outputs.length,x:1000,y:1000,el:{offsetWidth:100,offsetHeight:100},fields:{}};outputs.push(n);return n;},connectRaw(){},applyVideoRecord(){},paintOutput(){},saveSession(){},trackOutput(){},Studio:{higgsfieldGateway:()=> 'https://worker.example',higgsfieldRequest:async()=>{calls.push(['config']);return {ready};},ensureRemoteAsset:async()=>{throw Error('No references expected');},createVideoRecord:async r=>{records.push(r);return {...r,id:'v'+records.length};},submitGeneration:async(id,payload,provider)=>{calls.push(['submit',id,payload,provider]);if(fail)throw Object.assign(Error('No balance'),{httpStatus:403});return {id};},updateVideo:async(id,patch)=>({id,...patch})}};
 vm.createContext(context);vm.runInContext(code.slice(code.indexOf('  async function requestHiggsfield('),code.indexOf('  async function startGeneration('))+'\nthis.run=requestHiggsfield;',context);
 return {context,source,dialog,calls,records,outputs,controls,submittingSources};
}
test('Higgsfield Generate opens consent without uploading or submitting; cancel creates no job',async()=>{
 const f=fixture();await f.context.run(f.source);
 assert.equal(f.dialog.open,true);assert.equal(f.calls.length,0);assert.equal(f.records.length,0);
 assert.ok(!f.dialog.html.includes('<input'));assert.ok(!f.dialog.html.includes('<select'));
 assert.match(f.controls['[data-hf-summary]'].textContent,/480p · 6s · 9:16 · 1x/);
 f.controls['[data-hf-cancel]'].onclick();assert.equal(f.dialog.open,false);assert.equal(f.records.length,0);
});
test('consent sends selected settings and batch exactly once, including text-only Higgsfield',async()=>{
 const f=fixture({batch:'2'});await f.context.run(f.source);
 const button=f.controls['[data-hf-submit]'];await Promise.all([button.onclick(),button.onclick()]);
 const submissions=f.calls.filter(c=>c[0]==='submit');assert.equal(submissions.length,2);
 for(const [,id,payload,provider]of submissions){assert.equal(provider,'higgsfield');assert.equal(payload.duration,6);assert.equal(payload.resolution,'480p');assert.equal(payload.aspect_ratio,'9:16');assert.equal(payload.higgsfieldConfirmed,true);}
 assert.equal(f.submittingSources.size,0);
});
test('missing secret never submits; a failed paid attempt stops the remaining batch',async()=>{
 const missing=fixture({ready:false});await missing.context.run(missing.source);await missing.controls['[data-hf-submit]'].onclick();assert.equal(missing.records.length,0);
 const f=fixture({batch:'4',fail:true});await f.context.run(f.source);await f.controls['[data-hf-submit]'].onclick();assert.equal(f.calls.filter(c=>c[0]==='submit').length,1);assert.equal(f.submittingSources.size,0);
});
test('composer uses an explicit API selector and the same Generate action for both providers',()=>{
 assert.match(code,/id="composer-api-provider"/);assert.ok(!code.includes('id="composer-higgsfield"'));
 assert.match(code,/selectedVideoProvider\(source\)==='higgsfield'\)return requestHiggsfield\(source\)/);
 assert.match(code,/byteplus=selectedVideoProvider\(n\)==='byteplus'/);
});

 test('removing a linked reference excludes it from both provider payloads without deleting Media',()=>{
 const media={id:'M1',assets:['a','b']},generation={id:'G1',assets:['c'],fields:{}};
 const ctx={Set,incoming:()=>[media],refreshContent(){},saveSession(){}};vm.createContext(ctx);
 vm.runInContext(code.slice(code.indexOf('  function referenceIds('),code.indexOf('  function compiledPrompt('))+'this.ids=referenceIds;this.remove=removeReference;',ctx);
 assert.deepEqual(Array.from(ctx.ids(generation)),['a','b','c']);ctx.remove(generation,'a');
 assert.deepEqual(Array.from(ctx.ids(generation)),['b','c']);assert.deepEqual(media.assets,['a','b']);
 ctx.remove(generation,'c');assert.deepEqual(Array.from(ctx.ids(generation)),['b']);assert.equal(generation.assets.length,0);
 const restored=JSON.parse(JSON.stringify(generation));assert.deepEqual(Array.from(ctx.ids(restored)),['b']);
 assert.match(code,/const ids=referenceIds\(source\)/);assert.match(code,/assetIds:referenceIds\(source\)/);
 });
 test('Media preview uses its owner and all composer references have a removal control',()=>{
 const body=code.slice(code.indexOf('  function assetElement('),code.indexOf('  function incoming('));assert.ok(body.includes('selectedVideoProvider(owner)'));assert.ok(!body.includes('selectedVideoProvider(n)'));
 assert.ok(!code.includes('if(src.id===n.id){const remove='));
 });

test('Seedance 2.0 consent preserves the chosen model in the task record and API payload',async()=>{
 const f=fixture();f.source.fields.higgsfieldModel='bytedance/seedance-2.0';await f.context.run(f.source);assert.match(f.controls['[data-hf-summary]'].textContent,/Seedance 2.0/);await f.controls['[data-hf-submit]'].onclick();assert.equal(f.records[0].model,'bytedance/seedance-2.0');assert.equal(f.calls.find(c=>c[0]==='submit')[2].model,'bytedance/seedance-2.0');
});
test('Higgsfield model IDs route text, image and video requests separately and enforce duration',()=>{
 const P=require('../source/providers.js');for(const version of ['2.0','2.5']){const base={model:'bytedance/seedance-'+version,prompt:'Sunset',duration:5,resolution:'720p',aspect_ratio:'16:9'};for(const [suffix,refs]of [['text-to-video',{}],['image-to-video',{reference_images:['https://example.com/a.jpg']}],['reference-to-video',{reference_videos:['https://example.com/a.mp4']}]] )assert.equal(P.buildHiggsfieldRequest({...base,...refs}).endpoint,base.model+'/'+suffix);}
 const base={model:'bytedance/seedance-2.0',prompt:'Sunset',duration:16,resolution:'720p',aspect_ratio:'16:9'};assert.throws(()=>P.buildHiggsfieldRequest(base),/15/);assert.throws(()=>P.buildHiggsfieldRequest({...base,model:'other'}),/модель/);
});
