import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from '../chat-server/server.mjs';

const key='correct-chat-key-1234567890';
const keyHash=createHash('sha256').update(key).digest('hex');
const baseConfig={host:'127.0.0.1',port:0,allowedOrigins:new Set(['https://app.example']),apiKeySha256:keyHash,supabaseUrl:'https://project.supabase.co',supabasePublishableKey:'publishable',ollamaBaseUrl:'http://127.0.0.1:11434',maxBodyBytes:1024*16,maxMessages:50,maxMessageChars:4096,maxConcurrentPerUser:2};

async function withServer(fetchImpl,work,config={}){
  const server=createServer({config:{...baseConfig,...config},fetchImpl,logger:{info(){},error(){}}});
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
  const {port}=server.address();
  try{return await work(`http://127.0.0.1:${port}`)}finally{await new Promise(resolve=>server.close(resolve))}
}
function authHeaders(extra={}){return{Origin:'https://app.example',Authorization:'Bearer valid-token','X-TestCode-Chat-Key':key,...extra}}
function mockFetch(calls,{validToken=true}={}){return async(url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/auth/v1/user')) return new Response(validToken?JSON.stringify({id:'user-1'}):'bad',{status:validToken?200:401,headers:{'content-type':'application/json'}});
  if(String(url).endsWith('/api/tags')) return new Response(JSON.stringify({models:[{name:'dolphin-mistral:7b'}]}),{status:200,headers:{'content-type':'application/json'}});
  if(String(url).endsWith('/api/chat')) return new Response('{"message":{"content":"hi"},"done":false}\n{"done":true}\n',{status:200,headers:{'content-type':'application/x-ndjson'}});
  throw new Error('unexpected fetch '+url);
}}

test('chat server blocks origin token and api-key failures before Ollama',async()=>{
  for(const scenario of [
    {headers:{Authorization:'Bearer valid-token','X-TestCode-Chat-Key':key},status:403},
    {headers:{Origin:'https://evil.example',Authorization:'Bearer valid-token','X-TestCode-Chat-Key':key},status:403},
    {headers:{Origin:'https://app.example','X-TestCode-Chat-Key':key},status:401},
    {headers:{Origin:'https://app.example',Authorization:'Bearer valid-token'},status:403},
    {headers:{Origin:'https://app.example',Authorization:'Bearer valid-token','X-TestCode-Chat-Key':'wrong'},status:403},
  ]){
    const calls=[];
    await withServer(mockFetch(calls),async(base)=>{
      const response=await fetch(base+'/v1/models',{headers:scenario.headers});
      assert.equal(response.status,scenario.status);
      assert.equal(calls.some(c=>c.url.includes('127.0.0.1:11434')),false);
    });
  }
});

test('chat server verifies Supabase bearer before returning local models',async()=>{
  const calls=[];
  await withServer(mockFetch(calls),async(base)=>{
    const response=await fetch(base+'/v1/models',{headers:authHeaders()});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{models:['dolphin-mistral:7b']});
    assert.ok(calls[0].url.endsWith('/auth/v1/user'));
    assert.equal(calls[0].options.headers.Authorization,'Bearer valid-token');
    assert.equal(calls[0].options.headers.apikey,'publishable');
  });
});

test('chat server rejects invalid model and malformed roles',async()=>{
  for(const body of [
    {model:'not-installed',messages:[{role:'user',content:'hello'}]},
    {model:'dolphin-mistral:7b',messages:[{role:'tool',content:'hello'}]},
  ]){
    const calls=[];
    await withServer(mockFetch(calls),async(base)=>{
      const response=await fetch(base+'/v1/chat',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)});
      assert.equal(response.status,400);
      assert.equal(calls.filter(c=>c.url.endsWith('/api/chat')).length,0);
    });
  }
});

test('chat server enforces body limit before parsing or proxying',async()=>{
  const calls=[];
  await withServer(mockFetch(calls),async(base)=>{
    const response=await fetch(base+'/v1/chat',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({model:'dolphin-mistral:7b',messages:[{role:'user',content:'x'.repeat(500)}]})});
    assert.equal(response.status,413);
    assert.equal(calls.filter(c=>c.url.endsWith('/api/chat')).length,0);
  },{maxBodyBytes:100});
});

test('chat server streams only fixed Ollama chat endpoint after full validation',async()=>{
  const calls=[];
  await withServer(mockFetch(calls),async(base)=>{
    const body={model:'dolphin-mistral:7b',messages:[{role:'user',content:'hello'}]};
    const response=await fetch(base+'/v1/chat',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(body)});
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
    assert.match(await response.text(),/"content":"hi"/);
    const call=calls.find(c=>c.url.endsWith('/api/chat'));
    assert.ok(call);
    assert.equal(call.url,'http://127.0.0.1:11434/api/chat');
    assert.deepEqual(JSON.parse(call.options.body),{model:'dolphin-mistral:7b',messages:body.messages,stream:true});
  });
});


test('chat server rejects an invalid Supabase token before Ollama',async()=>{
  const calls=[];
  await withServer(mockFetch(calls,{validToken:false}),async(base)=>{
    const response=await fetch(base+'/v1/models',{headers:authHeaders()});
    assert.equal(response.status,401);
    assert.equal(calls.filter(c=>c.url.includes('127.0.0.1:11434')).length,0);
  });
});

test('chat server refuses wildcard CORS configuration',()=>{
  assert.throws(()=>createServer({config:{...baseConfig,allowedOrigins:new Set(['*'])},fetchImpl:mockFetch([]),logger:{info(){},error(){}}}),/wildcard|origin/i);
});
