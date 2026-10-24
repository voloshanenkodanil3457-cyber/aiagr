const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
async function screen(admin=true,approve=false,videoRows=[]){
  const nodes=new Map(),writes=[],dialogs=[];
  const element=(tag,text)=>({tag,textContent:text,value:'',dataset:{},children:[],setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const fields=['480p','720p','1080p'].map(resolution=>({...element(),dataset:{priceResolution:resolution}}));
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  get('#cost-seconds').value='4';get('#cost-resolution').value='480p';get('#cost-input').value='0';
  const context=vm.createContext({console,URLSearchParams,location:{search:''},document:{body:{dataset:{page:'cost'}},querySelector:get,querySelectorAll:selector=>selector==='[data-price-resolution]'?fields:[]},confirm:message=>{dialogs.push(message);return approve;}});
  vm.runInContext('window=globalThis',context);
  vm.runInContext(fs.readFileSync('source/domain.js','utf8'),context);
  context.MagicProviders={providerName:p=>p};
  context.Studio={ready:async()=>{},requireUser:async()=>true,bindShell(){},mountProfileDrawer:async()=>{},current:()=>({uid:'boss',name:'Boss'}),isAdmin:()=>admin,element,timestamp:v=>v||0,loadVideoPricing:async()=>context.MagicDomain.videoPrices,listVideos:async()=>videoRows,listUsers:async()=>[],notify(){},saveBillingCorrection:async(id,value)=>writes.push({id,value}),saveVideoPricing:async(rates,expected)=>{writes.push({rates,expected});return rates;}};
  await vm.runInContext(fs.readFileSync('source/pages.js','utf8'),context);
  return {nodes,fields,writes,dialogs};
}
test('price drafts preview in calculator but cancelling confirmation performs no save',async()=>{
  const a=await screen(true,false);a.fields[0].value='.2';a.fields[0].oninput();
  assert.equal(a.nodes.get('#cost-result').textContent,'$0.80');assert.equal(a.writes.length,0);
  await a.nodes.get('#cost-pricing-form').onsubmit({preventDefault(){}});
  assert.equal(a.dialogs.length,1);assert.match(a.dialogs[0],/480p: \$0.103 → \$0.20/);assert.equal(a.writes.length,0);
});

test('Billing UI cancels without a write and confirms the exact request and amount',async()=>{
 const video={id:'video-id',uid:'bob',provider:'higgsfield',status:'completed',requestId:'hf-task',cost:.8224,costSource:'higgsfield_tariff'};
 for(const approve of [false,true]){
  const a=await screen(true,approve,[video]),row=a.nodes.get('#cost-video-details').children[0],editor=row.children[2],form=editor.children[1];
  form.children[0].children[0].value='.7';form.children[1].children[0].value='Billing transaction X';
  await form.onsubmit({preventDefault(){}});assert.equal(a.dialogs.length,1);assert.match(a.dialogs[0],/hf-task/);assert.match(a.dialogs[0],/0.70/);assert.equal(a.writes.length,approve?1:0);
  if(approve){assert.equal(a.writes[0].value.requestId,'hf-task');assert.equal(a.writes[0].value.expectedRevision,0);}
 }
 const a=await screen(false,false,[video]);assert.equal(a.nodes.get('#cost-video-details').children[0].children.length,2);
});
test('confirmation saves exactly the shown draft once; ordinary users cannot save',async()=>{
  const a=await screen(true,true);a.fields[0].value='.2';
  await a.nodes.get('#cost-pricing-form').onsubmit({preventDefault(){}});
  assert.equal(a.writes.length,1);assert.equal(a.writes[0].rates['480p'],.2);assert.equal(a.writes[0].expected['480p'],.103);
  const user=await screen(false,true);assert.equal(user.nodes.get('#cost-pricing-editor').hidden,true);
  await user.nodes.get('#cost-pricing-form').onsubmit({preventDefault(){}});assert.equal(user.writes.length,0);assert.equal(user.dialogs.length,0);
});
