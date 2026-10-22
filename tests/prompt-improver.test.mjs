import vm from 'node:vm';
import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import documents from '../cloudflare-worker/prompt-skills.js';
import {promptMessages,improvePrompt} from '../cloudflare-worker/prompt-improver.js';
const body={prompt:'Девушка танцует под дождём',references:[],options:{duration:8,model:'Seedance 2.5',resolution:'720p',ratio:'9:16',audio:true}};
test('both supplied packages are loaded and prompt instructions preserve intent and actual settings',()=>{
 assert.equal(documents.length,10);assert.ok(documents.some(d=>d.name==='seedance-2-rtf.md'));assert.ok(documents.some(d=>d.name==='SKILL.md'));
 const messages=promptMessages(body);assert.match(messages[0].content,/not authority/);assert.match(messages[0].content,/user's language/);assert.match(messages[1].content,/"duration":8/);assert.throws(()=>promptMessages({...body,prompt:''}));
});
test('one text-only inference, no video provider, and duplicate requests are rate limited',async()=>{
 let calls=0;const env={AI:{run:async(model,input)=>{calls++;assert.equal(model,'@cf/qwen/qwen3-30b-a3b-fp8');assert.equal(input.messages.length,2);return {choices:[{message:{content:'Девушка плавно танцует под дождём. Камера медленно приближается.'},finish_reason:'stop'}]};}}};
 const result=await improvePrompt(body,env,'one');assert.match(result.text,/Камера/);assert.equal(calls,1);await assert.rejects(()=>improvePrompt(body,env,'one'),/Подожди/);assert.equal(calls,1);
});
test('quota errors and invented media aliases return errors instead of replacing original text',async()=>{
 await assert.rejects(()=>improvePrompt(body,{AI:{run:async()=>{throw Error('quota');}}},'quota'),/квота/);
 await assert.rejects(()=>improvePrompt(body,{AI:{run:async()=>({response:'@image2 dances'})}},'alias'),/несуществующий/);
 await assert.rejects(()=>improvePrompt(body,{},'missing'),/не подключено/);
});

test('Improve button replaces only prompt, records undo and never starts a video job',async()=>{
 const code=fs.readFileSync('source/canvas.js','utf8'),source={id:'G1',fields:{prompt:'Девушка танцует',duration:'8',resolution:'720p',ratio:'9:16'},assets:[]},button={},notices=[];let undo=0,resolve;
 const context={Set,Number,nodes:new Map([['G1',source]]),composerNode:'G1',assets:new Map(),$ :()=>button,finishEdit(){},referenceIds:()=>[],selectedVideoProvider:()=> 'byteplus',syncFields(){},updateLinkedText(){},saveSession(){},notify:s=>notices.push(s),mutate:(_,fn)=>{undo++;fn();},Studio:{higgsfieldRequest:async(path)=>{assert.equal(path,'improve-prompt');return {text:'Девушка плавно танцует; камера следует за движением.'};}}};vm.createContext(context);
 vm.runInContext(code.slice(code.indexOf('  const improvingPrompts='),code.indexOf('  function renderComposer('))+'this.improve=improveNodePrompt;',context);
 await context.improve(source);assert.match(source.fields.prompt,/плавно/);assert.equal(undo,1);assert.equal(button.disabled,false);
 source.fields.prompt='Мой текст';context.Studio.higgsfieldRequest=()=>new Promise(r=>resolve=r);const pending=context.improve(source);source.fields.prompt='Новая правка';resolve({text:'Не затирать правку'});await pending;assert.equal(source.fields.prompt,'Новая правка');assert.equal(undo,1);
});
