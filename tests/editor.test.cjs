const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('source/editor-core.js','utf8'),context);const C=context.window.MagicEditor;
const clip=(id,duration,extra={})=>({id,duration,in:0,out:duration,transition:'cut',fade:.5,...extra});
test('trimming and overlaps determine exported length without triple overlap',()=>{
  const p=C.schedule([clip('a',10,{in:2,out:6}),clip('b',3,{transition:'dissolve',fade:2}),clip('c',4,{transition:'black',fade:2})]);
  assert.equal(p[0].length,4);assert.equal(p[1].start,2.5);assert.equal(p[2].start,4);assert.equal(p[2].end,8);
  for(let t=0;t<8;t+=.01)assert.ok(C.frame(p,t).length<=2);
  assert.throws(()=>C.schedule([clip('bad',4,{in:3,out:2})]),/границы/);
  assert.throws(()=>C.schedule([clip('bad',4,{out:5})]),/границы/);
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
