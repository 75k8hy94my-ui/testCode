importScripts('queue.js');
const queue = MomonGaImportQueue.create({ storage: chrome.storage.local });
const momonPage = value => /^https:\/\/momon-ga\.com\/fanzine\/mo\d+\/(?:[?#].*)?$/.test(value || '');
const shelfPage = value => /^https:\/\/75k8hy94my-ui\.github\.io\/testCode\/manga\.html(?:[?#].*)?$/.test(value || '');
const ownsPopup = sender => sender?.id === chrome.runtime.id && !sender.tab;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (!message || message.schemaVersion !== 1) throw new Error('Invalid schema');
    if (message.type === 'MOMON_QUEUE_REQUEST') {
      if (!shelfPage(sender?.url)) throw new Error('Unauthorized sender');
      if (typeof message.requestId !== 'string' || !message.requestId || message.requestId.length > 128) throw new Error('Invalid request ID');
      return { type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: message.requestId, items: await queue.list() };
    }
    if (message.type === 'MOMON_QUEUE_ADD' && momonPage(sender?.url)) return { item: await queue.add(message.candidate, message.warnings) };
    if (ownsPopup(sender)) {
      if (message.type === 'MOMON_QUEUE_LIST') return { items: await queue.list() };
      if (message.type === 'MOMON_QUEUE_REMOVE') { await queue.remove(message.queueId); return { ok: true }; }
      if (message.type === 'MOMON_QUEUE_CLEAR') { await queue.clear(); return { ok: true }; }
    }
    throw new Error(message.type === 'MOMON_QUEUE_REQUEST' ? 'Unauthorized sender' : 'Unknown message');
  })().then(respond, error => respond({ error: error.message }));
  return true;
});
