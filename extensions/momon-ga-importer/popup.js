const status = document.getElementById('status');
const list = document.getElementById('items');
const send = async message => {
  const reply = await chrome.runtime.sendMessage({ schemaVersion: 1, ...message });
  if (reply?.error) throw new Error(reply.error);
  return reply;
};
async function refresh() {
  const { items } = await send({ type: 'MOMON_QUEUE_LIST' });
  list.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = item.candidate.title || item.candidate.sourceUrl;
    const remove = document.createElement('button');
    remove.textContent = '削除';
    remove.addEventListener('click', async () => {
      try { await send({ type: 'MOMON_QUEUE_REMOVE', queueId: item.queueId }); await refresh(); }
      catch (error) { status.textContent = error.message; }
    });
    row.append(name, remove);
    list.append(row);
  }
}
document.getElementById('add').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!/^https:\/\/momon-ga\.com\/fanzine\/mo\d+\//.test(tab?.url || '')) throw new Error('momon:GAの作品ページを開いてください');
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'MOMON_EXTRACT_ACTIVE', schemaVersion: 1 });
    if (result?.error) throw new Error(result.error);
    status.textContent = result.item ? `追加しました。${(result.errors || []).join(' ')}` : (result.errors || []).join(' ');
    await refresh();
  } catch (error) { status.textContent = error.message; }
});
document.getElementById('clear').addEventListener('click', async () => {
  try { await send({ type: 'MOMON_QUEUE_CLEAR' }); await refresh(); }
  catch (error) { status.textContent = error.message; }
});
refresh().catch(error => { status.textContent = error.message; });
