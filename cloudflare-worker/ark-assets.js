// BytePlus OpenAPI uses AK/SK signing, separate from the ModelArk inference API key.
const enc = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? enc.encode(value) : value));
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return crypto.subtle.sign('HMAC', imported, enc.encode(value));
}
export async function signedArkRequest(action, payload, env, time = new Date()) {
  if (!env.BYTEPLUS_ACCESS_KEY_ID || !env.BYTEPLUS_SECRET_ACCESS_KEY)
    throw Object.assign(new Error('Assets API не настроен: добавь BYTEPLUS_ACCESS_KEY_ID и BYTEPLUS_SECRET_ACCESS_KEY в secrets Worker. ARK API Key для этого API недостаточно.'), {status:503});
  const region = 'ap-southeast-1', host = 'ark.ap-southeast-1.byteplusapi.com';
  const body = JSON.stringify(payload), date = time.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = date.slice(0,8);
  const digest = await sha256(body), query = `Action=${action}&Version=2024-01-01`;
  const headers = {'Content-Type':'application/json','X-Date':date,'X-Content-Sha256':digest};
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-content-sha256:${digest}\nx-date:${date}\n`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonical = `POST\n/\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${digest}`;
  const scope = `${day}/${region}/ark/request`;
  const signing = await hmac(await hmac(await hmac(await hmac(env.BYTEPLUS_SECRET_ACCESS_KEY, day), region), 'ark'), 'request');
  const signature = hex(await hmac(signing, `HMAC-SHA256\n${date}\n${scope}\n${await sha256(canonical)}`));
  headers.Authorization = `HMAC-SHA256 Credential=${env.BYTEPLUS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {url:`https://${host}/?${query}`,init:{method:'POST',headers,body}};
}
export async function arkAssets(action, payload, env) {
  const req = await signedArkRequest(action, {...payload,ProjectName:env.BYTEPLUS_PROJECT_NAME || 'default'}, env);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(req.url, {...req.init,signal:controller.signal});
    const data = await response.json(), error = data?.ResponseMetadata?.Error;
    if (!response.ok || error) {
      const e = new Error(`BytePlus Assets ${error?.Code || response.status}: ${error?.Message || data?.message || 'Request failed'}${data?.ResponseMetadata?.RequestId ? ' · Request ID: '+data.ResponseMetadata.RequestId : ''}`);
      e.status = response.ok ? 400 : response.status; throw e;
    }
    if (!data.Result) throw Object.assign(new Error('BytePlus Assets не вернул Result.'), {status:502});
    return data.Result;
  } catch(e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('Assets API не ответил за 45 сек. Создание не подтверждено; проверь My assets в BytePlus перед повторением.'), {status:504});
    throw e;
  } finally { clearTimeout(timer); }
}
