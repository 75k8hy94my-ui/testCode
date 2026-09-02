import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { isAllowedOrigin, extractBearer, verifyChatKey, verifySupabaseToken, validateChatPayload } from './security.mjs';

function envInt(value,fallback){const n=Number(value);return Number.isInteger(n)&&n>0?n:fallback}
export function configFromEnv(env=process.env){
  const allowedOrigins=new Set(String(env.CHAT_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
  return {
    host:env.CHAT_HOST||'127.0.0.1',port:envInt(env.CHAT_PORT,3100),allowedOrigins,
    apiKeySha256:String(env.CHAT_API_KEY_SHA256||'').toLowerCase(),supabaseUrl:String(env.SUPABASE_URL||''),supabasePublishableKey:String(env.SUPABASE_PUBLISHABLE_KEY||''),
    ollamaBaseUrl:String(env.OLLAMA_BASE_URL||'http://127.0.0.1:11434').replace(/\/$/,''),maxBodyBytes:envInt(env.CHAT_MAX_BODY_BYTES,262144),maxMessages:envInt(env.CHAT_MAX_MESSAGES,100),maxMessageChars:envInt(env.CHAT_MAX_MESSAGE_CHARS,65536),maxConcurrentPerUser:envInt(env.CHAT_MAX_CONCURRENT_PER_USER,2)
  };
}
export function validateConfig(config){
  if(config.host!=='127.0.0.1')throw new Error('CHAT_HOST must be 127.0.0.1');
  if(!(config.allowedOrigins instanceof Set)||config.allowedOrigins.size===0)throw new Error('CHAT_ALLOWED_ORIGINS is required');
  if(config.allowedOrigins.has('*'))throw new Error('Wildcard origin is not allowed');
  if(!/^[0-9a-f]{64}$/.test(config.apiKeySha256))throw new Error('CHAT_API_KEY_SHA256 must be a SHA-256 hex digest');
  if(!/^https:\/\//.test(config.supabaseUrl))throw new Error('SUPABASE_URL must use HTTPS');
  if(!config.supabasePublishableKey)throw new Error('SUPABASE_PUBLISHABLE_KEY is required');
  const ollama=new URL(config.ollamaBaseUrl);
  if(!['127.0.0.1','localhost','::1','[::1]'].includes(ollama.hostname))throw new Error('OLLAMA_BASE_URL must point to localhost');
}
function corsHeaders(origin){return{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-TestCode-Chat-Key','Access-Control-Max-Age':'600'}}
function sendJson(res,status,payload,origin){const body=JSON.stringify(payload);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(origin?corsHeaders(origin):{})});res.end(body)}
function statusError(status,message){const error=new Error(message);error.status=status;return error}
async function readJson(req,maxBytes){
  const length=Number(req.headers['content-length']||0);if(Number.isFinite(length)&&length>maxBytes)throw statusError(413,'request too large');
  const chunks=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw statusError(413,'request too large');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch(_){throw statusError(400,'invalid json')}
}
async function listModels(config,fetchImpl,signal){
  const response=await fetchImpl(config.ollamaBaseUrl+'/api/tags',{method:'GET',signal});if(!response.ok)throw statusError(502,'ollama unavailable');
  const data=await response.json().catch(()=>({}));return new Set(Array.isArray(data.models)?data.models.map(x=>x&&x.name).filter(x=>typeof x==='string'&&x):[])
}
async function authenticate(req,config,fetchImpl){
  const origin=req.headers.origin;if(!isAllowedOrigin(origin,config.allowedOrigins))throw statusError(403,'origin denied');
  const token=extractBearer(req.headers.authorization);if(!token)throw statusError(401,'authentication required');
  if(!verifyChatKey(req.headers['x-testcode-chat-key'],config.apiKeySha256))throw statusError(403,'chat key denied');
  const user=await verifySupabaseToken(token,config,fetchImpl);if(!user)throw statusError(401,'invalid session');
  return{origin,user};
}
export function createServer({config=configFromEnv(),fetchImpl=fetch,logger=console}={}){
  validateConfig(config);
  const active=new Map();
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/','http://local');
    if(url.pathname==='/health'&&req.method==='GET')return sendJson(res,200,{ok:true});
    const origin=req.headers.origin;
    if(req.method==='OPTIONS'){
      if(!isAllowedOrigin(origin,config.allowedOrigins))return sendJson(res,403,{error:'origin denied'});
      res.writeHead(204,corsHeaders(origin));return res.end();
    }
    let auth;
    try{
      if(!['/v1/models','/v1/chat'].includes(url.pathname))throw statusError(404,'not found');
      auth=await authenticate(req,config,fetchImpl);
      if(url.pathname==='/v1/models'){
        if(req.method!=='GET')throw statusError(405,'method not allowed');
        const models=await listModels(config,fetchImpl);
        return sendJson(res,200,{models:[...models]},auth.origin);
      }
      if(req.method!=='POST')throw statusError(405,'method not allowed');
      const body=await readJson(req,config.maxBodyBytes);
      const models=await listModels(config,fetchImpl);
      const validation=validateChatPayload(body,config,models);if(validation)throw statusError(400,validation);
      const count=active.get(auth.user.id)||0;if(count>=config.maxConcurrentPerUser)throw statusError(429,'too many concurrent generations');
      active.set(auth.user.id,count+1);
      const controller=new AbortController();
      const abort=()=>controller.abort();req.once('aborted',abort);res.once('close',()=>{if(!res.writableEnded)abort()});
      try{
        const upstream=await fetchImpl(config.ollamaBaseUrl+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:body.model,messages:body.messages,stream:true}),signal:controller.signal});
        if(!upstream.ok||!upstream.body)throw statusError(502,'ollama chat failed');
        res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store',...corsHeaders(auth.origin)});
        const reader=upstream.body.getReader();
        while(true){const {done,value}=await reader.read();if(done)break;if(!res.write(Buffer.from(value)))await new Promise(resolve=>res.once('drain',resolve))}
        res.end();
      }finally{active.set(auth.user.id,Math.max(0,(active.get(auth.user.id)||1)-1));if(active.get(auth.user.id)===0)active.delete(auth.user.id)}
    }catch(error){
      const status=Number(error&&error.status)||500;
      if(!res.headersSent)sendJson(res,status,{error:status>=500?'server error':String(error.message||'request failed')},auth?.origin||(isAllowedOrigin(origin,config.allowedOrigins)?origin:null));
      else res.destroy();
      if(status>=500&&logger&&typeof logger.error==='function')logger.error('chat-api failure',{path:url.pathname,status});
    }
  });
}

const isMain=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(isMain){const config=configFromEnv();validateConfig(config);const server=createServer({config});server.listen(config.port,config.host,()=>console.log('testCode Chat API listening on http://'+config.host+':'+config.port));}
