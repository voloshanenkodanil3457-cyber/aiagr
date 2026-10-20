const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('source/captions-core.js','utf8'),context);const C=context.window.MagicCaptions;
const plain=value=>JSON.parse(JSON.stringify(value));
test('normalization handles missing endpoints and clamps words to video duration',()=>{
  const cues=C.normalize([{text:' Hello',timestamp:[0,.4]},{text:'world',timestamp:[.3,.9]},{text:'again',timestamp:[1,null]}],1.4);
  assert.deepEqual(plain(cues),[{text:'Hello',start:0,end:.4},{text:'world',start:.4,end:.9},{text:'again',start:1,end:1.4}]);
  assert.doesNotThrow(()=>C.validate(cues,1.4));assert.equal(C.normalize([{text:'bad',timestamp:[NaN,1]}],2).length,0);
});
test('manual drafts are deterministic and editing cannot create invalid or overlapping times',()=>{
  const cues=C.draft('One two three four',4);assert.equal(cues.length,4);assert.equal(cues[3].end,4);
  assert.equal(C.active(cues,2.5),2);assert.equal(C.active(cues,4),-1);
  assert.throws(()=>C.validate([{text:'a',start:0,end:2},{text:'b',start:1,end:3}],4),/таймкоды/);
  assert.throws(()=>C.validate([{text:'',start:0,end:1}],4),/пустым/);
  assert.throws(()=>C.validate([{text:'a',start:0,end:5}],4),/таймкоды/);
});
test('SRT/VTT preserve timings, split at pauses and keep user markup literal',()=>{
  const cues=[{text:'Hello',start:0,end:.6},{text:'world.',start:.6,end:1},{text:'<tag>',start:3,end:4}];
  assert.equal(C.groups(cues).length,2);
  assert.ok(C.serialize(cues).includes('1\n00:00:00,000 --> 00:00:01,000\nHello world.'));
  const vtt=C.serialize(cues,'vtt');assert.ok(vtt.startsWith('WEBVTT\n\n'));assert.ok(vtt.includes('00:00:03.000 --> 00:00:04.000'));assert.ok(vtt.includes('&lt;tag&gt;'));
  assert.equal(C.time(59.9996),'00:01:00,000');
});
test('Captions page is linked, uses local inference and never sends audio to a transcription API',()=>{
  const page=fs.readFileSync('captions.html','utf8'),worker=fs.readFileSync('assets/captions/whisper-worker.js','utf8'),app=fs.readFileSync('source/captions.js','utf8');
  assert.match(page,/aria-current="page"[^>]*>[\s\S]*?Captions/);assert.match(page,/Видео и звук остаются/);
  assert.match(worker,/return_timestamps:'word'/);assert.match(worker,/numThreads=1/);assert.match(worker,/device:'wasm'/);
  assert.doesNotMatch(app+worker,/method:\s*['"]POST['"]|api\.openai|workers\.ai/);
  assert.match(app,/row\.uid===user\.uid/);assert.match(app,/magic\.captions\.v1\.\$\{user\.uid\}/);
});
