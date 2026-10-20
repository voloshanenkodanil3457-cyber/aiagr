const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('assets/captions/whisper-language.js','utf8').replace(/export /g,''),context);
function model(scores){
  const calls=[];
  const transcriber={processor:async audio=>{calls.push({kind:'processor',length:audio.length});return {input_features:'AUDIO-FEATURES'};},model:{generation_config:{decoder_start_token_id:0,lang_to_id:{'<|en|>':1,'<|fr|>':2,'<|ru|>':3}},config:{},generate:async options=>{
    calls.push({kind:'generate',options});let logits={data:Float32Array.from(scores),dims:[1,scores.length]};for(const processor of options.logits_processor)logits=processor([],logits);
    let best=0;for(let i=1;i<logits.data.length;i++)if(logits.data[i]>logits.data[best])best=i;
    return {tolist:()=>[[0n,BigInt(best)]]};
  }}};return {transcriber,calls};
}
test('auto detects the language token from audio instead of defaulting to English',async()=>{
  const {transcriber,calls}=model([100,1,9,0]);
  const result=await context.chooseLanguage(transcriber,new Float32Array(32000).fill(.1),'auto');
  assert.equal(result.language,'fr');assert.equal(result.automatic,true);
  const options=calls.find(call=>call.kind==='generate').options;
  assert.equal(options.max_new_tokens,1);assert.equal(options.decoder_input_ids[0].length,1);assert.equal(options.inputs,'AUDIO-FEATURES');
  assert.equal(options.return_token_timestamps,false);assert.equal(options.language,undefined);
});
test('explicit language bypasses detection and each auto run detects the new clip afresh',async()=>{
  const scores=[0,1,0,10],fixture=model(scores),audio=new Float32Array(16000).fill(.1);
  const manual=await context.chooseLanguage(fixture.transcriber,audio,'portuguese');assert.equal(manual.language,'portuguese');assert.equal(fixture.calls.length,0);
  assert.equal((await context.chooseLanguage(fixture.transcriber,audio,'auto')).language,'ru');
  scores.splice(0,scores.length,0,10,0,0);assert.equal((await context.chooseLanguage(fixture.transcriber,audio,'auto')).language,'en');
  fixture.transcriber.model.generate=async()=>({tolist:()=>[[0n,1n]]});
  // Missing/uncertain detector output must never silently fall back to English.
  await assert.rejects(context.chooseLanguage(fixture.transcriber,audio,'auto'),/выбери|Выбери/);
});
test('uncertain detection requires manual selection and sample skips leading silence',async()=>{
  const fixture=model([0,1,1,1]);await assert.rejects(context.chooseLanguage(fixture.transcriber,new Float32Array(16000).fill(.1),'auto'),/уверенно/);
  const audio=new Float32Array(16000*50);audio.fill(.1,16000*10);
  const sample=context.languageSample(audio);assert.equal(sample.length,16000*30);assert.ok(sample.subarray(0,16000).some(value=>value>.05));
});
