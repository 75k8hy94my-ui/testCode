const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../manga-extension-bridge.js');

test('buildSavedItem ignores extension id and timestamp', () => {
  const item = bridge.buildSavedItem({ id:'evil', addedAt:1, title:'A', pages:['https://x/1.jpg','https://x/2.jpg'] }, { genId:()=> 'i_safe', now:()=>123 });
  assert.equal(item.id, 'i_safe');
  assert.equal(item.addedAt, 123);
  assert.deepEqual(item.pages, ['https://x/1.jpg','https://x/2.jpg']);
});

test('buildSavedItem converts one page to normal url shape', () => {
  const item = bridge.buildSavedItem({ title:'A', pages:['https://x/1.jpg'] }, { genId:()=> 'i_1', now:()=>1 });
  assert.equal(item.url, 'https://x/1.jpg');
  assert.equal('pages' in item, false);
});

test('findDuplicate checks first page before source page', () => {
  const found = bridge.findDuplicate([{ pages:['https://x/1.jpg'], sourcePageUrl:'https://old.example/' }], { pages:['https://x/1.jpg'], sourcePageUrl:'https://different.example/' });
  assert.ok(found);
});

test('validateDraft rejects non-http page URLs', () => {
  assert.throws(() => bridge.validateDraft({ version:1, pages:['javascript:alert(1)','https://x/2.jpg'] }), /URL/);
});

test('waitForVaultReady retries cross-tab requests until the vault arrives', async () => {
  let ready = false;
  let requests = 0;
  class FakeBroadcastChannel {
    postMessage(message) {
      if (message && message.type === 'vault-request') {
        requests += 1;
        if (requests >= 2) ready = true;
      }
    }
    close() {}
  }
  const target = {
    BroadcastChannel: FakeBroadcastChannel,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {}
  };
  const result = await bridge.waitForVaultReady(target, () => ready, 100, 5);
  assert.equal(result, true);
  assert.ok(requests >= 2);
});

test('importDraft reports locked without mutating', async () => {
  const items = [];
  const result = await bridge.importDraft({version:1,url:'https://x/1.jpg'}, {
    getSavedItems:()=>items, persistItems:()=>{ throw new Error('must not persist'); }, genId:()=> 'i_1', isVaultReady:()=>false
  });
  assert.equal(result.status, 'locked');
  assert.equal(items.length, 0);
});

test('importDraft waits for cross-tab vault handoff before reporting locked', async () => {
  const items = [];
  let ready = false;
  let waits = 0;
  const result = await bridge.importDraft({version:1,title:'A',url:'https://x/1.jpg'}, {
    getSavedItems:()=>items,
    persistItems:()=>{},
    genId:()=> 'i_1',
    now:()=>9,
    isVaultReady:()=>ready,
    awaitVaultReady:async () => { waits += 1; ready = true; return true; }
  });
  assert.equal(waits, 1);
  assert.equal(result.status, 'added');
  assert.equal(items.length, 1);
});

test('importDraft adds through supplied persistence path', async () => {
  const items = []; let persisted = 0;
  const result = await bridge.importDraft({version:1,title:'A',url:'https://x/1.jpg'}, {
    getSavedItems:()=>items, persistItems:()=>{ persisted += 1; }, genId:()=> 'i_1', now:()=>9, isVaultReady:()=>true
  });
  assert.equal(result.status, 'added');
  assert.equal(items[0].id, 'i_1');
  assert.equal(persisted, 1);
});