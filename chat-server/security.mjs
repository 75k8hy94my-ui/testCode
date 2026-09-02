import { createHash, timingSafeEqual } from 'node:crypto';

export function isAllowedOrigin(origin,allowedOrigins){return typeof origin==='string'&&allowedOrigins instanceof Set&&allowedOrigins.has(origin)}
export function extractBearer(value){const match=typeof value==='string'?value.match(/^Bearer\s+([^\s]+)$/):null;return match?match[1]:null}
export function verifyChatKey(provided,expectedHex){
  if(typeof provided!=='string'||!provided||typeof expectedHex!=='string'||!/^[0-9a-f]{64}$/i.test(expectedHex))return false;
  const actual=createHash('sha256').update(provided,'utf8').digest();
  const expected=Buffer.from(expectedHex,'hex');
  return expected.length===actual.length&&timingSafeEqual(actual,expected);
}
export async function verifySupabaseToken(token,config,fetchImpl=fetch){
  const response=await fetchImpl(config.supabaseUrl.replace(/\/$/,'')+'/auth/v1/user',{method:'GET',headers:{apikey:config.supabasePublishableKey,Authorization:'Bearer '+token}});
  if(!response.ok)return null;
  const user=await response.json().catch(()=>null);
  return user&&typeof user.id==='string'&&user.id?user:null;
}
export function validateChatPayload(body,config,models){
  if(!body||typeof body!=='object'||Array.isArray(body))return 'JSON object required';
  if(typeof body.model!=='string'||!models.has(body.model))return 'invalid model';
  if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>config.maxMessages)return 'invalid messages';
  const roles=new Set(['system','user','assistant']);
  for(const message of body.messages){
    if(!message||typeof message!=='object'||!roles.has(message.role)||typeof message.content!=='string'||message.content.length>config.maxMessageChars)return 'invalid message';
  }
  return null;
}
