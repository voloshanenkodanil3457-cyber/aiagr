import {arkAssets,sha256} from './ark-assets.js';
import {issueResourceToken,verifyResourceToken} from './auth.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{3,160}$/.test(value);
const context=env=>`${env.BYTEPLUS_ACCESS_KEY_ID || ''}/${env.BYTEPLUS_PROJECT_NAME || 'default'}`;
async function receipt(uid,purpose,resource,env,ttl){return issueResourceToken(uid,purpose,{...resource,context:context(env)},env,ttl);}
async function owned(token,uid,purpose,env){const r=await verifyResourceToken(token,uid,purpose,env);if(r.context!==context(env))fail('Портрет относится к другому аккаунту или проекту BytePlus. Подключи группу заново.',403);return r;}
export async function validatePortraitReferences(payload,uid,env){
  const refs=[...(payload.reference_images||[]),...(payload.reference_videos||[])].filter(x=>x.startsWith('asset://'));
  for(const url of new Set(refs)){
    const id=url.slice(8),record=await owned(payload.asset_receipts?.[id],uid,'portrait-asset',env);
    if(record.id!==id)fail('Asset receipt does not match reference',403);
    const result=await arkAssets('GetAsset',{Id:id},env);
    if(result.Status!=='Active')fail(`Портрет ${id}: ${result.Status || 'Unknown'}. Дождись Active.`,409);
    if(result.GroupId!==record.groupId)fail('Asset group does not match receipt',403);
    const expected=(payload.reference_images||[]).includes(url)?'Image':'Video';
    if(result.AssetType!==expected)fail('Asset type does not match reference',400);
  }
}
export async function servePortraitFile(request,env){
  const url=new URL(request.url),record=await verifyResourceToken(url.searchParams.get('token'),null,'portrait-file',env);
  if(!env.PORTRAIT_FILES||url.pathname!==`/byteplus/portraits/file/${record.hash}`)fail('Temporary image unavailable',404);
  const object=await env.PORTRAIT_FILES.get(record.key);if(!object)fail('Temporary image expired',404);
  return new Response(object.body,{headers:{'Content-Type':record.type,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
export async function portraitRoute(request,env,uid){
  const path=new URL(request.url).pathname,ready=!!(env.BYTEPLUS_ACCESS_KEY_ID&&env.BYTEPLUS_SECRET_ACCESS_KEY);
  if(path==='/byteplus/portraits/config')return {ready,localUploads:!!env.PORTRAIT_FILES,project:env.BYTEPLUS_PROJECT_NAME||'default'};
  if(!ready)fail('Настрой Assets API в Worker и подключи Advanced Creation Rights в BytePlus. Нужны AK/SK; обычного ARK API Key недостаточно.',503);
  if(path==='/byteplus/portraits/upload'){
    if(!env.PORTRAIT_FILES)fail('Для локальных фото подключи приватный R2 bucket PORTRAIT_FILES в Worker. Можно также добавить фото по HTTPS-ссылке.',503);
    const type=request.headers.get('Content-Type')?.split(';')[0];
    if(!['image/jpeg','image/png','image/webp'].includes(type))fail('Для регистрации портрета выбери JPG, PNG или WebP.');
    const declared=Number(request.headers.get('Content-Length'));if(declared>=30*1024*1024)fail('Фото должно быть меньше 30 МБ.');
    const reader=request.body?.getReader();if(!reader)fail('Empty image');const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>=30*1024*1024){await reader.cancel();fail('Фото должно быть меньше 30 МБ.');}chunks.push(value);}
    if(!size)fail('Empty image');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const magic=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
    if(!magic)fail('Тип файла не соответствует содержимому изображения.');
    const hash=await sha256(bytes),key=`portrait-staging/${uid}/${hash}/${crypto.randomUUID()}`;
    await env.PORTRAIT_FILES.put(key,bytes,{httpMetadata:{contentType:type}});
    const resource={key,hash,type},token=await issueResourceToken(uid,'portrait-file',resource,env,86400);
    return {url:`${new URL(request.url).origin}/byteplus/portraits/file/${hash}?token=${encodeURIComponent(token)}`,fileToken:token,hash};
  }
  let b;try{b=await request.json();}catch{fail('Invalid JSON');}
  if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid JSON object');
  if(path==='/byteplus/portraits/verify/start'){
    if(!env.PORTRAIT_CALLBACK_URL)fail('Добавь PORTRAIT_CALLBACK_URL в настройки Worker.',503);
    const callback=new URL(env.PORTRAIT_CALLBACK_URL);
    if(callback.protocol!=='https:')fail('PORTRAIT_CALLBACK_URL must use HTTPS',503);
    const result=await arkAssets('CreateVisualValidateSession',{CallbackURL:callback.href},env);
    if(!result.BytedToken||!result.H5Link)fail('BytePlus не вернул ссылку для проверки.',502);
    const h5=new URL(result.H5Link);if(h5.protocol!=='https:')fail('Invalid verification URL',502);h5.searchParams.set('lng','en');
    return {h5Link:h5.href,sessionToken:await receipt(uid,'portrait-verification',{bytedToken:result.BytedToken},env,1800)};
  }
  if(path==='/byteplus/portraits/verify/finish'){
    const session=await owned(b.sessionToken,uid,'portrait-verification',env);
    // Never trust callback resultCode or a client-supplied group ID as authorization.
    const result=await arkAssets('GetVisualValidateResult',{BytedToken:session.bytedToken},env);
    if(!validId(result.GroupId))fail('Проверка ещё не завершена. Пройди её по ссылке BytePlus и нажми «Проверить результат».',409);
    return {id:result.GroupId,type:'LivenessFace',token:await receipt(uid,'portrait-group',{id:result.GroupId,type:'LivenessFace'},env)};
  }
  if(path==='/byteplus/portraits/groups/create'){
    const name=String(b.name||'').trim();if(!name||name.length>64||b.type!=='AIGC')fail('Укажи имя виртуального персонажа (до 64 символов). Для реального человека используй проверку BytePlus.');
    const result=await arkAssets('CreateAssetGroup',{Name:name,GroupType:'AIGC'},env);if(!validId(result.Id))fail('BytePlus не вернул ID группы.',502);
    return {id:result.Id,name,type:'AIGC',token:await receipt(uid,'portrait-group',{id:result.Id,type:'AIGC'},env)};
  }
  if(path==='/byteplus/portraits/groups/connect'){
    const profile=await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,{headers:{Authorization:request.headers.get('Authorization')}});
    if(!profile.ok||(await profile.json())?.fields?.role?.stringValue!=='superuser')fail('Группы из общей консоли подключает только суперадмин. Пользователь создаёт свою группу через Magic.',403);
    if(!validId(b.id))fail('Invalid group ID');const result=await arkAssets('GetAssetGroup',{Id:b.id},env);
    if(result.Id!==b.id)fail('BytePlus вернул другую группу.',502);
    if(!['AIGC','LivenessFace'].includes(result.GroupType))fail('Unsupported group type');
    return {id:result.Id,name:result.Name,type:result.GroupType,token:await receipt(uid,'portrait-group',{id:result.Id,type:result.GroupType},env)};
  }
  if(path==='/byteplus/portraits/assets/create'){
    const group=await owned(b.groupToken,uid,'portrait-group',env);let remote;
    try{remote=new URL(b.url);}catch{fail('Нужна HTTPS-ссылка на фото.');}if(remote.protocol!=='https:'||remote.username||remote.password)fail('Нужна HTTPS-ссылка на фото.');
    let file;if(b.fileToken){file=await verifyResourceToken(b.fileToken,uid,'portrait-file',env);const expected=`${new URL(request.url).origin}/byteplus/portraits/file/${file.hash}`;if(remote.origin+remote.pathname!==expected||remote.searchParams.get('token')!==b.fileToken)fail('Temporary file does not match receipt',403);}
    const result=await arkAssets('CreateAsset',{GroupId:group.id,URL:remote.href,AssetType:'Image',Name:String(b.name||'').slice(0,64)},env);
    if(!validId(result.Id))fail('BytePlus не вернул Asset ID. Проверь My assets перед повторением.',502);
    return {id:result.Id,groupId:group.id,status:'Processing',token:await receipt(uid,'portrait-asset',{id:result.Id,groupId:group.id,fileKey:file?.key||null},env)};
  }
  if(path==='/byteplus/portraits/assets/connect'){
    const group=await owned(b.groupToken,uid,'portrait-group',env);
    if(!validId(b.id))fail('Invalid asset ID');const result=await arkAssets('GetAsset',{Id:b.id},env);
    if(result.GroupId!==group.id||result.AssetType!=='Image')fail('Фото должно принадлежать выбранной группе.',403);
    return {id:b.id,groupId:group.id,status:result.Status,token:await receipt(uid,'portrait-asset',{id:b.id,groupId:group.id},env)};
  }
  if(path==='/byteplus/portraits/assets/status'){
    const asset=await owned(b.assetToken,uid,'portrait-asset',env),result=await arkAssets('GetAsset',{Id:asset.id},env);
    if(result.GroupId!==asset.groupId)fail('Asset group mismatch',403);
    if(['Active','Failed'].includes(result.Status)&&asset.fileKey&&env.PORTRAIT_FILES)await env.PORTRAIT_FILES.delete(asset.fileKey);
    return {id:asset.id,groupId:asset.groupId,status:result.Status,error:result.Error||result.ErrorMessage||null,assetType:result.AssetType};
  }
  fail('Portrait route not found',404);
}
