import {issueResourceToken,verifyResourceToken} from './auth.js';
const MAX=30*1024*1024,TTL=86400;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const bucket=env=>env.REFERENCE_FILES||env.PORTRAIT_FILES;
export async function uploadReference(request,env,uid){
  const store=bucket(env);if(!store)fail('Загрузка видео ещё не настроена: подключи приватный R2 bucket REFERENCE_FILES к Worker и правило удаления reference-staging/ через 1 день.',503);
  const type=request.headers.get('Content-Type')?.split(';')[0];
  if(!['video/mp4','video/quicktime'].includes(type))fail('Для видеореференса выбери MP4 или MOV.');
  if(Number(request.headers.get('Content-Length'))>MAX)fail('Видеореференс должен быть не больше 30 МБ.',413);
  const reader=request.body?.getReader();if(!reader)fail('Пустой файл.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();fail('Видеореференс должен быть не больше 30 МБ.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  if(size<12||new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')fail('Файл не похож на MP4/MOV. Пересохрани видео в MP4 H.264.');
  const id=crypto.randomUUID(),key=`reference-staging/${uid}/${id}`,expiresAt=Date.now()+TTL*1000;
  await store.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{expiresAt:String(expiresAt)}});
  const token=await issueResourceToken(uid,'video-reference',{key,id,type},env,TTL);
  return {url:`${new URL(request.url).origin}/media/reference/file/${id}?token=${encodeURIComponent(token)}`,expiresAt};
}
export async function serveReference(request,env){
  const url=new URL(request.url),r=await verifyResourceToken(url.searchParams.get('token'),null,'video-reference',env);
  if(url.pathname!==`/media/reference/file/${r.id}`)fail('Файл не найден.',404);
  const store=bucket(env);if(!store)fail('Хранилище не подключено.',503);
  const info=await store.head(r.key);if(!info)fail('Временный файл удалён. Загрузи видео заново.',404);
  const headers={'Content-Type':r.type,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  let offset=0,length=info.size,status=200;const range=request.headers.get('Range');
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}});
    if(m[1]){offset=Number(m[1]);length=Math.min(info.size-1,m[2]?Number(m[2]):info.size-1)-offset+1;}else{length=Math.min(info.size,Number(m[2]));offset=info.size-length;}
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||offset>=info.size||length<=0)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${info.size}`}});
    status=206;headers['Content-Range']=`bytes ${offset}-${offset+length-1}/${info.size}`;
  }
  headers['Content-Length']=String(length);
  if(request.method==='HEAD')return new Response(null,{status,headers});
  const object=await store.get(r.key,{range:{offset,length}});if(!object)fail('Файл удалён.',404);
  return new Response(object.body,{status,headers});
}
