const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('source/reference-prompts.js','utf8'),context);const {tokens}=context.window.MagicReferencePrompts;
test('aliases resolve within their media kind in payload order, including Kling spelling',()=>{
 const image1={id:'a',kind:'image'},video1={id:'b',kind:'video'},image2={id:'c',kind:'image'},audio1={id:'d',kind:'audio'},refs=[image1,video1,image2,audio1];
 const result=tokens('Use @image2 with @video_1 and @image1, @audio1',refs);assert.deepEqual(Array.from(result,x=>x.asset.id),['c','b','a','d']);assert.equal(result[0].start,4);assert.equal(result[0].end,11);
 assert.equal(tokens('@image2',[image1,video1])[0].asset,null);assert.equal(tokens('@video1',[image1])[0].asset,null);assert.equal(tokens('@image10',[image1])[0].asset,null);
 assert.equal(tokens('@image0 @image1foo',refs).length,0);
});
