(()=>{
'use strict';
const $=(id)=>document.getElementById(id);
const ui={
  shell:$('chatShell'),sidebar:$('chatSidebar'),drawerBackdrop:$('drawerBackdrop'),conversationList:$('conversationList'),newChat:$('newChatBtn'),menu:$('menuBtn'),closeSidebar:$('closeSidebarBtn'),
  title:$('chatTitle'),messages:$('messages'),empty:$('emptyState'),composer:$('composerForm'),input:$('messageInput'),send:$('sendBtn'),stop:$('stopBtn'),regenerate:$('regenerateBtn'),deleteChat:$('deleteChatBtn'),
  model:$('modelSelect'),settings:$('settingsBtn'),settingsDialog:$('settingsDialog'),settingsForm:$('settingsForm'),endpoint:$('apiEndpointInput'),apiKey:$('apiKeyInput'),apiKeyState:$('apiKeyState'),origin:$('currentOrigin'),settingsCancel:$('settingsCancelBtn'),
  status:$('chatStatus'),sync:$('syncStatus'),conflict:$('syncConflict'),useLocal:$('useLocalConflictBtn'),useRemote:$('useRemoteConflictBtn')
};
let state=null,rawKey=null,syncClient=null,models=[],generationController=null,syncTimer=null,remoteChain=Promise.resolve(),conflictState=null,remoteAvailable=true;
const clone=(value)=>JSON.parse(JSON.stringify(value));
const goLogin=()=>location.replace('index.html');
const goVault=()=>location.replace('sync.html');
function setStatus(text){ui.status.textContent=text||''}
function setSync(text){ui.sync.textContent=text||''}
function applyTheme(){try{document.documentElement.dataset.theme=localStorage.getItem('mangaReaderTheme')==='light'?'light':'dark'}catch(_){}}
function activeConversation(){return state&&state.conversations.find(c=>c.id===state.activeConversationId)||null}
function sameState(a,b){return JSON.stringify(ChatStore.normalizeState(a))===JSON.stringify(ChatStore.normalizeState(b))}
function endpoint(value){
  const url=new URL(String(value||'').trim());
  const localhost=['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&localhost))throw new Error('APIはHTTPS（localhostのみHTTP可）で指定してください。');
  if(url.username||url.password||url.search||url.hash)throw new Error('API URLに認証情報・クエリ・#は含められません。');
  return url.toString().replace(/\/$/,'');
}
async function encryptCurrent(){return ChatStore.encryptState(state,rawKey)}
async function persistLocal(){const envelope=await encryptCurrent();ChatStore.saveEncrypted(envelope);return envelope}
function queueRemoteSync(){
  if(conflictState||!remoteAvailable)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{syncCurrent().catch(()=>{})},700);
}
async function syncCurrent(){
  if(conflictState||!remoteAvailable)return;
  const snapshot=await encryptCurrent();
  remoteChain=remoteChain.then(async()=>{setSync('同期中…');try{await syncClient.saveRemote(snapshot);setSync('同期済み')}catch(error){if(error&&error.code==='CHAT_SYNC_CONFLICT'){await loadConflictFromRemote();return}setSync('同期失敗');throw error}});
  return remoteChain;
}
async function loadConflictFromRemote(){
  try{const localState=clone(state),record=await syncClient.loadRemote();if(!record||!record.payload){setSync('同期競合');return}const remoteState=await ChatStore.decryptState(record.payload,rawKey);conflictState={localState,remoteState};ui.conflict.hidden=false;setSync('同期競合')}
  catch(_){setSync('同期競合')}
}
async function loadInitialState(){
  const localEnvelope=ChatStore.loadEncrypted();
  let localState=null,remoteRecord=null,remoteState=null;
  if(localEnvelope)localState=await ChatStore.decryptState(localEnvelope,rawKey);
  try{remoteRecord=await syncClient.loadRemote();if(remoteRecord&&remoteRecord.payload)remoteState=await ChatStore.decryptState(remoteRecord.payload,rawKey)}catch(error){remoteAvailable=false;setSync('クラウド同期を利用できません');}
  if(localState&&remoteState){
    if(sameState(localState,remoteState)){state=localState;return}
    state=localState;conflictState={localState:clone(localState),remoteState:clone(remoteState)};ui.conflict.hidden=false;setSync('同期競合');return;
  }
  if(remoteState){state=remoteState;ChatStore.saveEncrypted(remoteRecord.payload);setSync('クラウドから復元');return}
  if(localState){state=localState;if(remoteAvailable){try{await syncClient.saveRemote(localEnvelope);setSync('同期済み')}catch(error){if(error&&error.code==='CHAT_SYNC_CONFLICT')await loadConflictFromRemote();else setSync('同期失敗')}}return}
  state=ChatStore.createDefaultState();const encrypted=await persistLocal();
  if(remoteAvailable){try{await syncClient.saveRemote(encrypted);setSync('同期済み')}catch(error){setSync('同期失敗')}}
}
async function apiFetch(path,options={}){
  if(!state.settings.apiEndpoint||!state.settings.apiKey)throw new Error('Chat APIの設定が必要です。');
  const url=endpoint(state.settings.apiEndpoint)+path;
  const doFetch=async(session)=>fetch(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+session.access_token,'X-TestCode-Chat-Key':state.settings.apiKey}});
  let session=MangaVault.loadSession();if(!session||!session.access_token)session=await MangaVault.refreshSession();
  let response=await doFetch(session);
  if(response.status===401){session=await MangaVault.refreshSession();response=await doFetch(session)}
  return response;
}
async function loadModels(){
  if(!state.settings.apiEndpoint||!state.settings.apiKey){models=[];renderModels();return}
  setStatus('モデルを確認中…');
  try{const response=await apiFetch('/v1/models');if(!response.ok)throw new Error('モデル一覧を取得できません ('+response.status+')');const data=await response.json();models=Array.isArray(data.models)?data.models.filter(x=>typeof x==='string'&&x):[];if(!models.length)throw new Error('利用可能なモデルがありません。');if(!models.includes(state.settings.defaultModel)){state.settings.defaultModel=models[0];await persistLocal();queueRemoteSync()}renderModels();setStatus('')}
  catch(error){models=[];renderModels();setStatus(error.message||'Chat APIに接続できません。')}
}
function renderModels(){
  const current=state.settings.defaultModel||'';ui.model.replaceChildren();
  const list=models.length?models:(current?[current]:[]);
  if(!list.length){const option=document.createElement('option');option.value='';option.textContent='モデル未設定';ui.model.append(option);return}
  for(const name of list){const option=document.createElement('option');option.value=name;option.textContent=name;option.selected=name===current;ui.model.append(option)}
}
function renderConversations(){
  ui.conversationList.replaceChildren();
  for(const conversation of state.conversations){
    const button=document.createElement('button');button.type='button';button.className='conversationItem';if(conversation.id===state.activeConversationId)button.classList.add('active');button.dataset.conversationId=conversation.id;
    const title=document.createElement('span');title.className='conversationTitle';title.textContent=conversation.title||'新しいチャット';
    const time=document.createElement('small');time.textContent=conversation.updatedAt?new Date(conversation.updatedAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'}):'';
    button.append(title,time);button.onclick=()=>{state.activeConversationId=conversation.id;persistLocal().then(queueRemoteSync);closeDrawer();render()};ui.conversationList.append(button);
  }
}
function renderMessage(message){
  const row=document.createElement('article');row.className='message '+message.role;row.dataset.messageId=message.id;
  const label=document.createElement('div');label.className='messageLabel';label.textContent=message.role==='user'?'You':'AI';
  const content=document.createElement('div');content.className='messageContent';content.innerHTML=ChatMarkdown.render(message.content);
  row.append(label,content);return row;
}
function renderMessages(){
  ui.messages.replaceChildren();const conversation=activeConversation();const has=conversation&&conversation.messages.length;
  ui.empty.hidden=!!has;
  if(!conversation){ui.title.textContent='Chat';ui.regenerate.hidden=true;ui.deleteChat.disabled=true;return}
  ui.title.textContent=conversation.title||'新しいチャット';ui.deleteChat.disabled=false;
  for(const message of conversation.messages)ui.messages.append(renderMessage(message));
  ui.regenerate.hidden=!conversation.messages.some(m=>m.role==='assistant')||!!generationController;
  requestAnimationFrame(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'}));
}
function render(){renderConversations();renderModels();renderMessages();ui.stop.hidden=!generationController;ui.send.hidden=!!generationController}
function updateStreamingMessage(messageId,content){const node=ui.messages.querySelector('[data-message-id="'+CSS.escape(messageId)+'"] .messageContent');if(node)node.innerHTML=ChatMarkdown.render(content)}
async function createNewChat(){const id=crypto.randomUUID(),created=ChatStore.createConversation(state,id,new Date().toISOString());state=created.state;await persistLocal();queueRemoteSync();closeDrawer();render();ui.input.focus()}
async function removeActiveChat(){const conversation=activeConversation();if(!conversation)return;if(conversation.messages.length&&!confirm('このチャットを削除しますか？'))return;state=ChatStore.deleteConversation(state,conversation.id);await persistLocal();queueRemoteSync();render()}
function messagePayload(conversation){return conversation.messages.filter(m=>['system','user','assistant'].includes(m.role)&&m.content).map(m=>({role:m.role,content:m.content}))}
async function generate(conversationId){
  const conversation=state.conversations.find(c=>c.id===conversationId);if(!conversation||generationController)return;
  const model=state.settings.defaultModel;if(!model){setStatus('モデルを選択してください。');return}
  const requestMessages=messagePayload(conversation);if(!requestMessages.length)return;
  const assistant={id:crypto.randomUUID(),role:'assistant',content:'',createdAt:new Date().toISOString()};state=ChatStore.appendMessage(state,conversationId,assistant);generationController=new AbortController();render();
  try{
    const response=await apiFetch('/v1/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:requestMessages}),signal:generationController.signal});
    if(!response.ok){let detail='';try{detail=(await response.json()).error||''}catch(_){}throw new Error(detail||'生成に失敗しました ('+response.status+')')}
    const reader=response.body&&response.body.getReader();if(!reader)throw new Error('ストリーミング応答を取得できません。');
    const decoder=new TextDecoder();let buffer='';
    while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let split;while((split=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,split).trim();buffer=buffer.slice(split+1);if(!line)continue;let data;try{data=JSON.parse(line)}catch(_){continue}const chunk=data&&data.message&&typeof data.message.content==='string'?data.message.content:'';if(chunk){const target=state.conversations.find(c=>c.id===conversationId)?.messages.find(m=>m.id===assistant.id);if(target){target.content+=chunk;target.updatedAt=new Date().toISOString();updateStreamingMessage(assistant.id,target.content)}}}}
    if(buffer.trim()){try{const data=JSON.parse(buffer);const chunk=data&&data.message&&typeof data.message.content==='string'?data.message.content:'';const target=state.conversations.find(c=>c.id===conversationId)?.messages.find(m=>m.id===assistant.id);if(target&&chunk)target.content+=chunk}catch(_){}}
    setStatus('');
  }catch(error){
    const target=state.conversations.find(c=>c.id===conversationId)?.messages.find(m=>m.id===assistant.id);
    if(error&&error.name==='AbortError'){if(target&&!target.content)target.content='（生成を停止しました）';setStatus('生成を停止しました。')}
    else{if(target&&!target.content)target.content='（回答を取得できませんでした）';setStatus(error.message||'生成に失敗しました。')}
  }finally{generationController=null;await persistLocal();queueRemoteSync();render()}
}
async function sendMessage(event){event.preventDefault();const text=ui.input.value.trim();if(!text||generationController)return;if(!state.settings.apiEndpoint||!state.settings.apiKey){openSettings();setStatus('最初にChat APIを設定してください。');return}let conversation=activeConversation();if(!conversation){await createNewChat();conversation=activeConversation()}state=ChatStore.appendMessage(state,conversation.id,{id:crypto.randomUUID(),role:'user',content:text,createdAt:new Date().toISOString()});ui.input.value='';autoSizeInput();await persistLocal();queueRemoteSync();render();await generate(conversation.id)}
function stopGeneration(){if(generationController)generationController.abort()}
async function regenerate(){
  if(generationController)return;const conversation=activeConversation();if(!conversation)return;let index=-1;for(let i=conversation.messages.length-1;i>=0;i--){if(conversation.messages[i].role==='assistant'){index=i;break}}
  if(index<0)return;const next={...conversation,messages:conversation.messages.slice(0,index),updatedAt:new Date().toISOString()};state=ChatStore.replaceConversation(state,next);await persistLocal();queueRemoteSync();render();await generate(conversation.id)
}
function openSettings(){ui.endpoint.value=state.settings.apiEndpoint||'';ui.apiKey.value='';ui.apiKeyState.textContent=state.settings.apiKey?'APIキーは暗号化保存済みです。変更する場合だけ入力してください。':'APIキーを入力してください。';ui.origin.textContent=location.origin;ui.settingsDialog.showModal()}
async function saveSettings(event){
  event.preventDefault();try{const value=endpoint(ui.endpoint.value);const newKey=ui.apiKey.value.trim();if(!state.settings.apiKey&&!newKey)throw new Error('APIキーを入力してください。');state.settings.apiEndpoint=value;if(newKey)state.settings.apiKey=newKey;await persistLocal();queueRemoteSync();ui.settingsDialog.close();await loadModels();render()}catch(error){setStatus(error.message||'設定を保存できません。')}
}
async function chooseRemote(){if(!conflictState)return;state=ChatStore.normalizeState(conflictState.remoteState);await persistLocal();conflictState=null;ui.conflict.hidden=true;setSync('クラウド版を使用');render();await loadModels()}
async function chooseLocal(){if(!conflictState)return;state=ChatStore.normalizeState(conflictState.localState);try{const envelope=await persistLocal();await syncClient.saveRemote(envelope);conflictState=null;ui.conflict.hidden=true;setSync('この端末の内容を同期');render()}catch(error){setStatus(error.message||'競合を解決できませんでした。')}}
function openDrawer(){ui.sidebar.classList.add('open');ui.drawerBackdrop.hidden=false}
function closeDrawer(){ui.sidebar.classList.remove('open');ui.drawerBackdrop.hidden=true}
function autoSizeInput(){ui.input.style.height='auto';ui.input.style.height=Math.min(ui.input.scrollHeight,180)+'px'}
function wire(){
  ui.newChat.onclick=createNewChat;ui.menu.onclick=openDrawer;ui.closeSidebar.onclick=closeDrawer;ui.drawerBackdrop.onclick=closeDrawer;ui.composer.addEventListener('submit',sendMessage);ui.stop.onclick=stopGeneration;ui.regenerate.onclick=regenerate;ui.deleteChat.onclick=removeActiveChat;ui.settings.onclick=openSettings;ui.settingsForm.addEventListener('submit',saveSettings);ui.settingsCancel.onclick=()=>ui.settingsDialog.close();ui.useRemote.onclick=chooseRemote;ui.useLocal.onclick=chooseLocal;
  ui.model.onchange=async()=>{state.settings.defaultModel=ui.model.value;await persistLocal();queueRemoteSync()};ui.input.addEventListener('input',autoSizeInput);ui.input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ui.composer.requestSubmit()}});
}
async function bootstrap(){
  applyTheme();const session=MangaVault.loadSession();if(!session||!session.refresh_token){goLogin();return}if(!MangaVault.loadActive()){goVault();return}
  try{await MangaVault.refreshSession()}catch(_){MangaVault.saveSession(null);goLogin();return}
  const active=MangaVault.loadActive();if(!active){goVault();return}rawKey=active.rawKey;syncClient=ChatSync.createClient({vault:MangaVault,storage:localStorage});wire();
  try{await loadInitialState()}catch(error){setStatus(error.message||'チャットデータを開けませんでした。');state=ChatStore.createDefaultState()}
  document.documentElement.classList.remove('auth-pending');render();if(state.settings.apiEndpoint&&state.settings.apiKey)await loadModels();else openSettings();
}
bootstrap();
})();
