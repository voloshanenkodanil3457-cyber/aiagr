import {authenticate} from './auth.js';
const MAX=20*1024*1024,TTL=21600;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('Origin')||'',allowed=origin==='https://voloshanenkodanil3457-cyber.github.io'||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
 const cors={'Access-Control-Allow-Origin':allowed?origin:'https://voloshanenkodanil3457-cyber.github.io','Access-Control-Allow-Methods':'GET,HEAD,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Expose-Headers':'Content-Length,Content-Range,Accept-Ranges','Vary':'Origin'};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 try{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(url.pathname==='/health')return json({service:'magic-video-upload',storage:'KV',maxBytes:MAX,ttlSeconds:TTL,configured:!!env.VIDEO_FILES,version:'0.12.3'});
  if(!env.VIDEO_FILES)fail('Временное хранилище VIDEO_FILES не подключено.',503);
  const match=/^\/media\/reference\/file\/([a-f0-9-]{36})\/([a-f0-9-]{36})$/.exec(url.pathname);
  if(match&&['GET','HEAD'].includes(request.method)){
   const object=await env.VIDEO_FILES.getWithMetadata('video/'+match[1]+'/'+match[2],{type:'arrayBuffer',cacheTtl:60});
   if(!object.value||object.metadata?.expiresAt<=Date.now())fail('Видеореференс истёк или ещё распространяется. Повтори через минуту.',404);
   const size=object.value.byteLength,h={...cors,'Content-Type':object.metadata.type,'Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
   let offset=0,end=size-1,status=200;const range=request.headers.get('Range');
   if(range){const r=/^bytes=(\d*)-(\d*)$/.exec(range);if(!r||(!r[1]&&!r[2]))return new Response(null,{status:416,headers:{...h,'Content-Range':`bytes */${size}`}});
    if(r[1]){offset=Number(r[1]);end=Math.min(size-1,r[2]?Number(r[2]):size-1);}else offset=Math.max(0,size-Number(r[2]));
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(end)||offset<0||offset> end||offset>=size)return new Response(null,{status:416,headers:{...h,'Content-Range':`bytes */${size}`}});
    status=206;h['Content-Range']=`bytes ${offset}-${end}/${size}`;
   }
   h['Content-Length']=String(end-offset+1);return new Response(request.method==='HEAD'?null:object.value.slice(offset,end+1),{status,headers:h});
  }
  if(url.pathname!=='/media/reference/upload'||request.method!=='POST')return json({error:'Not found'},404);
  if(origin&&!allowed)fail('Этот сайт не разрешён.',403);
  const project=env.FIREBASE_PROJECT_ID||'aiagr-80390',uid=await authenticate(request,{...env,FIREBASE_PROJECT_ID:project});
  const profile=await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,{headers:{Authorization:request.headers.get('Authorization')}});
  if(!profile.ok||!['user','superuser'].includes((await profile.json()).fields?.role?.stringValue))fail('Доступ только для участников команды.',403);
  const type=request.headers.get('Content-Type')?.split(';')[0];if(!['video/mp4','video/quicktime'].includes(type))fail('Выбери видео MP4 или MOV.');
  if(Number(request.headers.get('Content-Length'))>MAX)fail('Максимум 20 МБ. Сожми или обрежь видео в Editor.',413);
  const reader=request.body?.getReader();if(!reader)fail('Пустой файл.');let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();fail('Максимум 20 МБ. Сожми или обрежь видео в Editor.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  if(size<12||new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')fail('Файл не похож на MP4/MOV. Пересохрани его в MP4 H.264.');
  const id=crypto.randomUUID(),token=crypto.randomUUID(),expiresAt=Date.now()+TTL*1000;
  await env.VIDEO_FILES.put('video/'+id+'/'+token,bytes,{expirationTtl:TTL,metadata:{type,expiresAt}});
  return json({url:`${url.origin}/media/reference/file/${id}/${token}`,expiresAt,readyAt:Date.now()+65000});
 }catch(e){return json({error:e.message||'Ошибка загрузки. Бесплатная квота могла закончиться; попробуй позже.'},e.status||503);}
}};
