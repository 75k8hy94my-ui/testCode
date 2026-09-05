const test = require('node:test');
const assert = require('node:assert/strict');
const bg = require('../extension/background.js');

test('queue keeps a draft until matching acknowledgement arrives', async () => {
  const store = bg.makeMemoryStore();
  const queue = bg.makeQueue(store);
  const id = await queue.enqueue({ title: 'A', url: 'https://cdn/x.jpg' });
  assert.equal((await queue.list()).length, 1);
  await queue.ack(id);
  assert.equal((await queue.list()).length, 0);
});

test('queue preserves FIFO order', async () => {
  const store = bg.makeMemoryStore();
  const queue = bg.makeQueue(store);
  await queue.enqueue({ title: 'A' });
  await queue.enqueue({ title: 'B' });
  assert.deepEqual((await queue.list()).map(x => x.draft.title), ['A','B']);
});

test('serialized flusher shares one in-flight delivery per key', async () => {
  let runs = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const serial = bg.makeSerializedFlusher(async () => { runs += 1; await gate; return runs; });
  const first = serial('tab-1');
  const second = serial('tab-1');
  assert.equal(runs, 1);
  release();
  assert.equal(await first, 1);
  assert.equal(await second, 1);
});