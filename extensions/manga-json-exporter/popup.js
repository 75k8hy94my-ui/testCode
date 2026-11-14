'use strict';
const QUEUE_KEY = 'testcode_manga_json_export_queue_v1';
const $ = (id) => document.getElementById(id);
let busy = false;
function status(message) { $('status').textContent = message; }
async function readQueue() {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
}
async function render() {
  const entries = await readQueue();
  $('count').textContent = entries.length + '件を保存待ち';
  $('items').replaceChildren();
  for (const item of entries) {
    const li = document.createElement('li');
    const title = document.createElement('div'); title.className = 'itemTitle'; title.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'itemMeta'; meta.textContent = item.author + ' · ' + item.url;
    li.append(title, meta); $('items').appendChild(li);
  }
  $('download').disabled = busy || !entries.length;
  $('clear').disabled = busy || !entries.length;
  $('capture').disabled = busy;
}
async function capture() {
  if (busy) return;
  busy = true; await render(); status('ページの情報を確認しています…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\//.test(tab.url || '')) throw new Error('HTTPSの作品ページを開いてください。');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extractor.js'] });
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.TestCodeMangaJsonExtractor.extract(document, location.href) });
    if (!result?.result?.ok) throw new Error((result?.result?.errors || ['抽出に失敗しました。']).join('\n'));
    const item = result.result.item;
    const entries = await readQueue();
    const existing = entries.findIndex(entry => entry.url === item.url || entry.sourceUrl === item.sourceUrl);
    if (existing >= 0) entries[existing] = item;
    else entries.push(item);
    if (entries.length > 500) throw new Error('1ファイルにつき最大500件までです。');
    await chrome.storage.local.set({ [QUEUE_KEY]: entries });
    status(existing >= 0 ? '登録済み作品を更新しました。' : '作品を追加しました。');
  } catch (e) { status(e.message || 'ページを読み取れませんでした。'); }
  finally { busy = false; await render(); }
}
async function download() {
  if (busy) return;
  busy = true; await render();
  let objectUrl = '';
  try {
    const items = await readQueue();
    if (!items.length) throw new Error('保存する作品がありません。');
    const data = { format: 'testcode-manga-import', version: 1, items };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    objectUrl = URL.createObjectURL(blob);
    const date = new Date();
    const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('');
    await chrome.downloads.download({ url: objectUrl, filename: 'testcode-manga-' + stamp + '.json', saveAs: true, conflictAction: 'uniquify' });
    status(items.length + '件のJSONの保存を開始しました。保存後はtestCodeの「JSONを読み込む」から登録できます。');
  } catch (e) { status(e.message || 'JSONを保存できませんでした。'); }
  finally { if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 30000); busy = false; await render(); }
}
$('capture').addEventListener('click', () => void capture());
$('download').addEventListener('click', () => void download());
$('clear').addEventListener('click', async () => {
  if (busy || !confirm('保存待ちの作品をすべて消去しますか？')) return;
  await chrome.storage.local.set({ [QUEUE_KEY]: [] });
  status('保存待ちの作品を消去しました。'); await render();
});
void render();
