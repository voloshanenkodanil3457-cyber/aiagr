// Firebase ID tokens + stateless task receipts: no Firestore calls during generation/polling.
const JWKS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const encoder=new TextEncoder();let keyCache={keys:[],expires:0};
function denied(message,status=401){return Object.assign(new Error(message),{status});}
function decode(value){try{const base=value.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(base+'='.repeat((4-base.length%4)%4)),c=>c.charCodeAt(0));}catch{throw denied('Invalid token');}}
function encode(value){return btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function parse(value){try{return JSON.parse(new TextDecoder().decode(decode(value)));}catch{throw denied('Invalid token');}}
async function keys(force=false){
  if(force||Date.now()>=keyCache.expires){const response=await fetch(JWKS);if(!response.ok)throw denied('Firebase token verification temporarily unavailable',503);const data=await response.json();keyCache={keys:data.keys||[],expires:Date.now()+Math.min(3600,Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1])||300)*1000};}
  return keyCache.keys;
}
export async function authenticate(request,env){
  const project=String(env.FIREBASE_PROJECT_ID||'').trim();if(!project)throw denied('FIREBASE_PROJECT_ID is not configured',503);
  const raw=request.headers.get('Authorization')?.match(/^Bearer ([\w.-]+)$/)?.[1];if(!raw||raw.length>16000)throw denied('Firebase sign-in required');
  const parts=raw.split('.');if(parts.length!==3)throw denied('Invalid Firebase token');
  const header=parse(parts[0]),claims=parse(parts[1]),now=Date.now()/1000;
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw denied('Invalid Firebase token algorithm');
  if(claims.aud!==project||claims.iss!==`https://securetoken.google.com/${project}`||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128
    ||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||!Number.isFinite(claims.auth_time)||claims.auth_time>now+30)throw denied('Expired or invalid Firebase token');
  let jwk=(await keys()).find(k=>k.kid===header.kid);if(!jwk)jwk=(await keys(true)).find(k=>k.kid===header.kid);if(!jwk)throw denied('Unknown Firebase signing key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw denied('Invalid Firebase signature');
  return claims.sub;
}
async function receiptKey(env){const secret=env.TASK_TOKEN_SECRET||env.ARK_API_KEY;if(!secret)throw denied('Worker signing secret missing',503);return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function issueTaskToken(uid,taskId,env){
  const body=encode(encoder.encode(JSON.stringify({uid,taskId,exp:Math.floor(Date.now()/1000)+60*86400})));
  const signature=await crypto.subtle.sign('HMAC',await receiptKey(env),encoder.encode(body));return body+'.'+encode(new Uint8Array(signature));
}
export async function verifyTaskToken(token,uid,taskId,env){
  // Optional one-account migration for tasks created before receipts existed.
  if(!token&&env.LEGACY_TASK_OWNER_UID===uid)return;
  if(typeof token!=='string'||token.length>2048)throw denied('Task ownership receipt required',403);
  const parts=token.split('.');if(parts.length!==2)throw denied('Invalid task receipt',403);
  const claims=parse(parts[0]);
  if(claims.uid!==uid||claims.taskId!==taskId||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000
    ||!await crypto.subtle.verify('HMAC',await receiptKey(env),decode(parts[1]),encoder.encode(parts[0])))throw denied('This task belongs to another user or the receipt expired',403);
}

export async function issueSessionToken(uid,env,role='user'){
  const expiresAt=Date.now()+3600000,body=encode(encoder.encode(JSON.stringify({uid,role,purpose:'membership',exp:Math.floor(expiresAt/1000)})));
  const signature=await crypto.subtle.sign('HMAC',await receiptKey(env),encoder.encode(body));
  return {sessionToken:body+'.'+encode(new Uint8Array(signature)),expiresAt};
}
export async function verifySessionToken(token,uid,env){
  if(typeof token!=='string'||token.length>2048)throw denied('Open My settings and check the Worker connection to refresh membership',403);
  const parts=token.split('.');if(parts.length!==2)throw denied('Invalid membership receipt',403);
  const claims=parse(parts[0]);
  if(claims.uid!==uid||claims.purpose!=='membership'||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000
    ||!await crypto.subtle.verify('HMAC',await receiptKey(env),decode(parts[1]),encoder.encode(parts[0])))throw denied('Membership session expired',403);
  return claims;
}

// Purpose-separated, user-bound receipts for private portrait groups, assets and H5 sessions.
export async function issueResourceToken(uid,purpose,resource,env,ttl=60*86400){
  const claims={uid,purpose,resource,exp:Math.floor(Date.now()/1000)+ttl};
  const body=encode(encoder.encode(JSON.stringify(claims)));
  const signature=await crypto.subtle.sign('HMAC',await receiptKey(env),encoder.encode(body));
  return body+'.'+encode(new Uint8Array(signature));
}
export async function verifyResourceToken(token,uid,purpose,env){
  if(typeof token!=='string'||token.length>8192)throw denied('Portrait ownership receipt required',403);
  const parts=token.split('.');if(parts.length!==2)throw denied('Invalid portrait receipt',403);
  const claims=parse(parts[0]);
  if((uid!==null&&claims.uid!==uid)||claims.purpose!==purpose||!claims.resource||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000
    ||!await crypto.subtle.verify('HMAC',await receiptKey(env),decode(parts[1]),encoder.encode(parts[0])))throw denied('Portrait receipt expired or belongs to another user',403);
  return claims.resource;
}
