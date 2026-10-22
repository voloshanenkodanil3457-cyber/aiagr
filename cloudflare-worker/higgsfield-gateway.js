import {authenticate,issueTaskToken,verifyTaskToken} from './auth.js';
import P from '../source/providers.js';
const BASE='https://api.higgsfield.ai';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const signing=env=>({...env,TASK_TOKEN_SECRET:env.HF_CREDENTIALS});
async function upstream(path,env,{method='GET',body}={}){
 const response=await fetch(BASE+path,{method,headers:{Authorization:'Key '+env.HF_CREDENTIALS,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{data={};}
 if(!response.ok){const code=response.status;fail(code===401?'Higgsfield: проверь серверный API-ключ.':code===403?'Higgsfield: проверь API-баланс и доступ.':code===422||code===400?'Higgsfield отклонил параметры или референсы.':`Higgsfield HTTP ${code}. Проверь Requests перед повторной отправкой.`,code);}
 return data;
}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'',url=new URL(request.url),allowed=origin==='https://voloshanenkodanil3457-cyber.github.io'||/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
 const headers={'Access-Control-Allow-Origin':allowed?origin:'https://voloshanenkodanil3457-cyber.github.io','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Cache-Control':'no-store','Vary':'Origin'};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
 try{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return json({error:'Not found'},404);
  if(origin&&!allowed)fail('Недопустимый сайт.',403);
  const project=env.FIREBASE_PROJECT_ID||'aiagr-80390',uid=await authenticate(request,{...env,FIREBASE_PROJECT_ID:project});
  const member=await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,{headers:{Authorization:request.headers.get('Authorization')}});
  if(!member.ok||!['user','superuser'].includes((await member.json()).fields?.role?.stringValue))fail('Нужен профиль команды.',403);
  if(url.pathname==='/higgsfield/config')return json({ready:!!env.HF_CREDENTIALS,model:'Seedance 2.5',models:['bytedance/seedance-2.5','bytedance/seedance-2.0'],paid:true});
  if(!env.HF_CREDENTIALS)fail('Добавь HF_CREDENTIALS в Secrets этого Worker. Значение не должно быть в браузере.',503);
  let body;try{body=await request.json();}catch{fail('Неверный JSON.');}
  if(url.pathname==='/higgsfield/upload-url'){
   if(!['image/jpeg','image/png','image/webp'].includes(body.content_type))fail('Для Higgsfield выбери JPG, PNG или WebP.');
   const result=await upstream('/files/generate-upload-url',env,{method:'POST',body:{content_type:body.content_type}});
   for(const key of ['upload_url','public_url'])if(!/^https:\/\//.test(result[key]||''))fail('Higgsfield не вернул URL загрузки.',502);
   return json({upload_url:result.upload_url,public_url:result.public_url,upload_headers:result.upload_headers||{}});
  }
  if(url.pathname==='/higgsfield/submit'){
   if(body.confirmed!==true)fail('Нужно подтверждение повышенной стоимости.',409);
   const spec=P.buildHiggsfieldRequest(body.payload),data=await upstream('/'+spec.endpoint,env,{method:'POST',body:spec.input});
   if(typeof data.request_id!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(data.request_id))fail('Запуск не подтверждён: проверь Higgsfield Requests перед повторением.',502);
   return json({id:data.request_id,status:data.status,taskToken:await issueTaskToken(uid,data.request_id,signing(env))});
  }
  if(url.pathname==='/higgsfield/status'){
   const id=String(body.taskId||'');if(!/^[a-zA-Z0-9_-]{1,180}$/.test(id))fail('Неверный ID задачи.');
   await verifyTaskToken(body.taskToken,uid,id,signing(env));
   const data=await upstream('/requests/'+encodeURIComponent(id)+'/status',env);
   const video=data.video?.url;if(video&&!/^https:\/\//.test(video))fail('Некорректный URL результата.',502);
   return json({status:data.status,video:video?{url:video}:null,error:['failed','nsfw','canceled','cancelled'].includes(data.status)?'Higgsfield: задача отклонена, отменена или завершилась ошибкой.':null});
  }
  return json({error:'Not found'},404);
 }catch(e){return json({error:e.message},e.status||500);}
}};
