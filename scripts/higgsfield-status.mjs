// Read-only diagnostic: never submits, retries or cancels a generation.
import {config} from 'dotenv';
config({path:new URL('../.env.local',import.meta.url),quiet:true});
const id=process.argv[2];
if(!/^[a-zA-Z0-9_-]{1,180}$/.test(id||''))throw Error('Pass an existing request ID.');
const credentials=process.env.HF_CREDENTIALS;
if(!credentials){console.error('HF_CREDENTIALS is not configured locally.');process.exit(1);}
try{
 const response=await fetch('https://api.higgsfield.ai/requests/'+encodeURIComponent(id)+'/status',{headers:{Authorization:'Key '+credentials},signal:AbortSignal.timeout(30000)});
 const data=await response.json();
 const clean=value=>String(value??'').split(credentials).join('[redacted]').replace(/https?:\/\/\S+/g,'[URL]').slice(0,2000);
 console.log(JSON.stringify({httpStatus:response.status,requestId:id,status:data.status??null,error:clean(typeof data.error==='string'?data.error:data.error?.message??data.detail??'')},null,2));
 if(!response.ok)process.exitCode=1;
}catch{console.error('Status check failed; no generation was submitted.');process.exitCode=1;}
