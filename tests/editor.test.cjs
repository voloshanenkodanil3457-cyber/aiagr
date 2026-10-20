const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({window:{},URL});vm.runInContext(fs.readFileSync('source/editor-core.js','utf8'),context);const C=context.window.MagicEditor;
const clip=(id,duration,extra={})=>({id,duration,in:0,out:duration,transition:'cut',fade:.5,...extra});
test('trimming and overlaps determine exported length without triple overlap',()=>{
  const p=C.schedule([clip('a',10,{in:2,out:6}),clip('b',3,{transition:'dissolve',fade:2}),clip('c',4,{transition:'black',fade:2})]);
  assert.equal(p[0].length,4);assert.equal(p[1].start,2.5);assert.equal(p[2].start,4);assert.equal(p[2].end,8);
  for(let t=0;t<8;t+=.01)assert.ok(C.frame(p,t).length<=2);
  assert.throws(()=>C.schedule([clip('bad',4,{in:3,out:2})]),/границы/);
  assert.throws(()=>C.schedule([clip('bad',4,{out:5})]),/границы/);
  assert.doesNotThrow(()=>C.schedule([clip('fractional',3.0364,{out:Number((3.0364).toFixed(3))})]));
  assert.throws(()=>C.schedule([clip('a',200),clip('b',150)]),/5 минут/);
});
test('dissolve blends frames and audio, black transition reaches black at midpoint',()=>{
  const p=C.schedule([clip('a',4),clip('b',4,{in:1,transition:'dissolve',fade:1})]);
  const frame=C.frame(p,3.5);assert.equal(frame.length,2);assert.equal(frame[1].sourceTime,1.5);assert.equal(frame[1].alpha,.5);assert.equal(frame[0].gain,.5);assert.equal(frame[1].gain,.5);
  const black=C.frame(C.schedule([clip('a',4),clip('b',4,{transition:'black',fade:1})]),3.5);assert.equal(black[0].alpha,0);assert.equal(black[1].alpha,0);
  assert.equal(C.frame(p,0).length,1);assert.equal(C.frame(p,6).length,0);
});
test('reorder preserves trim decisions and cut introduces no overlap',()=>{
  const clips=[clip('a',4,{in:1}),clip('b',5)];const moved=C.move(clips,0,1);
  assert.equal(moved[1].id,'a');assert.equal(moved[1].in,1);assert.equal(clips[0].id,'a');assert.equal(C.schedule(moved)[1].start,5);
});
test('speed maps timeline time back to source and limits use output duration',()=>{
  const p=C.schedule([clip('a',8,{in:2,speed:2}),clip('b',3,{transition:'dissolve',fade:1})]);
  assert.equal(p[0].length,3);assert.equal(p[1].start,2);assert.equal(C.frame(p,1)[0].sourceTime,4);
  assert.throws(()=>C.schedule([clip('a',4,{speed:9})]),/Скорость/);
});
test('independent audio positions, trim endpoints and fade envelopes agree',()=>{
  const p=C.audioPlan([{id:'voice',duration:10,in:2,out:6,offset:3,fadeIn:1,fadeOut:2}]);assert.equal(p[0].end,7);
  assert.equal(C.audioFrame(p,3.5)[0].sourceTime,2.5);assert.equal(C.audioFrame(p,3.5)[0].gain,.5);assert.equal(C.audioFrame(p,6)[0].gain,.5);assert.equal(C.audioFrame(p,7).length,0);
  assert.throws(()=>C.audioPlan([{duration:10,in:0,out:10,offset:299}]),/5 минут/);
  assert.deepEqual(JSON.parse(JSON.stringify(C.fadePoints(4,3,3))),[[0,0],[2,2/3],[4,0]]);
  assert.deepEqual(JSON.parse(JSON.stringify(C.fadePoints(4,1,1))),[[0,0],[1,1],[3,1],[4,0]]);
});
test('SRT and VTT become editable words and out-of-range cues are excluded',()=>{
  const words=C.parseSubtitles('1\n00:00:01,000 --> 00:00:03,000\nПривет мир\n\n2\n00:00:04,000 --> 00:00:08,000\noutside',5);
  assert.equal(words.length,2);assert.equal(words[0].start,1);assert.equal(words[0].end,2);assert.equal(words[1].text,'мир');
  assert.equal(C.parseSubtitles('WEBVTT\n\n00:01.000 --> 00:02.000\nHello',3)[0].start,1);
  assert.equal(C.isYouTube('https://www.youtube.com/watch?v=x'),true);assert.equal(C.isYouTube('https://youtu.be/x'),true);assert.equal(C.isYouTube('https://example.com/youtube.com/movie.mp4'),false);
});
test('microphone WAV fallback has finite PCM duration and clamps samples',()=>{
  const buffer={length:3,numberOfChannels:1,sampleRate:16000,getChannelData:()=>[-2,0,2]},view=new DataView(C.wavePCM(buffer));
  assert.equal(view.byteLength,50);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint32(40,true),6);assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(48,true),32767);
});
