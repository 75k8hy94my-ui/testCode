const test = require('node:test');
const assert = require('node:assert/strict');
const bg = require('../extension/background.js');

test('summarizes configured fields for the matching rule', () => {
  const summary = bg.summarizeRuleFields({ fields: { title:{}, author:{}, allPageImages:{} } }, 8);
  assert.deepEqual(summary, { configured:3, total:8 });
});

test('delivery result distinguishes synced, duplicate, locked and waiting states', () => {
  assert.equal(bg.deliveryStateFromResult({ status:'added' }), 'synced');
  assert.equal(bg.deliveryStateFromResult({ status:'duplicate' }), 'duplicate');
  assert.equal(bg.deliveryStateFromResult({ status:'locked' }), 'locked');
  assert.equal(bg.deliveryStateFromResult(null), 'waiting');
});

test('flush reports the terminal result instead of only a count', async () => {
  const store = bg.makeMemoryStore();
  const queue = bg.makeQueue(store);
  await queue.enqueue({ title:'A', url:'https://cdn/x.jpg' });
  const chromeApi = { tabs: { sendMessage: async () => ({ status:'added', itemId:'i_1' }) } };
  const result = await bg.flushPending(chromeApi, queue, 12);
  assert.equal(result.delivered, 1);
  assert.equal(result.lastResult.status, 'added');
  assert.equal((await queue.list()).length, 0);
});
