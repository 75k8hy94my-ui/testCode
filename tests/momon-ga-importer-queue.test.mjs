import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../extensions/momon-ga-importer/queue.js', import.meta.url), 'utf8');
const context = { URL, TextEncoder, crypto: { randomUUID: (() => { let n = 0; return () => `q-${++n}`; })() } };
vm.runInNewContext(source, context);
const create = context.MomonGaImportQueue.create;
function storage() {
  let state = {};
  return { get: async key => ({ [key]: state[key] }), set: async patch => { state = { ...state, ...patch }; }, snapshot: () => state };
}
function candidate(n, pages = 1) {
  return { schemaVersion: 1, title: `T${n}`, author: '', circleName: '', sourceWork: '', tags: [], sourceUrl: `https://momon-ga.com/fanzine/mo${n}/`, pages: Array.from({length: pages}, (_, i) => `https://z1.momon-ga.me/galleries/${n}/${i + 1}.webp`), fallbackPagePattern: null };
}

test('FIFO, stable IDs, canonical duplicate replacement, remove and clear', async () => {
  const queue = create({ storage: storage() });
  const first = await queue.add(candidate(1));
  await queue.add(candidate(2));
  const duplicate = await queue.add({ ...candidate(1), sourceUrl: 'https://momon-ga.com/fanzine/mo1/?utm_source=test#top', title: 'Revised' });
  assert.equal(duplicate.queueId, first.queueId);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), JSON.stringify(['Revised', 'T2']));
  await queue.remove(first.queueId);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), JSON.stringify(['T2']));
  await queue.clear();
  assert.equal((await queue.list()).length, 0);
});

test('500 works allowed; next add rejects without losing queue', async () => {
  const queue = create({ storage: storage() });
  for (let n = 1; n <= 500; n++) await queue.add(candidate(n));
  await assert.rejects(queue.add(candidate(501)), /500/);
  assert.equal((await queue.list()).length, 500);
});

test('3000 pages allowed, 3001 and incomplete page sequences rejected; metadata may be blank', async () => {
  const queue = create({ storage: storage() });
  await queue.add(candidate(1, 3000));
  await assert.rejects(queue.add(candidate(2, 3001)), /3000/);
  await assert.rejects(queue.add({ ...candidate(2, 2), pages: ['https://z1.momon-ga.me/galleries/2/1.webp', 'https://z1.momon-ga.me/galleries/2/3.webp'] }), /page/i);
  assert.equal((await queue.list()).length, 1);
});

test('4 MiB serialized boundary and storage errors preserve previous candidates', async () => {
  const adapter = storage();
  const one = candidate(1);
  const initial = create({ storage: adapter, now: () => 0 });
  await initial.add(one);
  const exactSize = new TextEncoder().encode(JSON.stringify(await initial.list())).length;
  const queue = create({ storage: adapter, maxBytes: exactSize, now: () => 0 });
  await queue.add(one);
  await assert.rejects(queue.add(candidate(2)), /size|bytes/i);
  assert.equal((await queue.list()).length, 1);
  const failing = { get: adapter.get, set: async () => { throw Error('disk failure'); } };
  await assert.rejects(create({ storage: failing }).add(candidate(3)), /disk failure/);
  assert.equal((await queue.list()).length, 1);
});

test('rejects invalid source and empty page list without mutation', async () => {
  const queue = create({ storage: storage() });
  await assert.rejects(queue.add({ ...candidate(1), sourceUrl: 'https://evil-momon-ga.com/fanzine/mo1/' }), /source/i);
  await assert.rejects(queue.add({ ...candidate(1), pages: [] }), /page/i);
  assert.equal((await queue.list()).length, 0);
});

test('overlapping additions serialize instead of overwriting either candidate', async () => {
  const adapter = storage();
  const slow = { get: async key => { await new Promise(resolve => setTimeout(resolve, 2)); return adapter.get(key); }, set: async patch => { await new Promise(resolve => setTimeout(resolve, 2)); return adapter.set(patch); } };
  const queue = create({ storage: slow });
  await Promise.all([queue.add(candidate(1)), queue.add(candidate(2)), queue.add(candidate(3))]);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), '["T1","T2","T3"]');
});

test('overlapping removal and clear do not resurrect or lose later additions', async () => {
  const adapter = storage();
  const slow = { get: async key => { await new Promise(resolve => setTimeout(resolve, 2)); return adapter.get(key); }, set: async patch => { await new Promise(resolve => setTimeout(resolve, 2)); return adapter.set(patch); } };
  const queue = create({ storage: slow });
  const first = await queue.add(candidate(1));
  await Promise.all([queue.remove(first.queueId), queue.add(candidate(2))]);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), '["T2"]');
  await Promise.all([queue.clear(), queue.add(candidate(3))]);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), '["T3"]');
});

test('metadata warnings survive queue read and replacement and are bounded', async () => {
  const queue = create({ storage: storage() });
  await queue.add(candidate(1), ['複数の作者が見つかりました。登録前に確認してください']);
  assert.equal((await queue.list())[0].warnings[0], '複数の作者が見つかりました。登録前に確認してください');
  await queue.add({ ...candidate(1), title: 'Corrected' }, ['作者情報が見つかりません']);
  assert.equal((await queue.list())[0].warnings[0], '作者情報が見つかりません');
  await assert.rejects(queue.add(candidate(2), Array(21).fill('warning')), /warning/i);
  await assert.rejects(queue.add(candidate(2), ['w'.repeat(501)]), /warning/i);
  assert.equal((await queue.list()).length, 1);
});

test('removeMany deletes only selected existing IDs in one storage write', async () => {
  const adapter = storage();
  let writes = 0;
  const tracked = { get: adapter.get, set: async patch => { writes++; await adapter.set(patch); } };
  const queue = create({ storage: tracked });
  const first = await queue.add(candidate(1));
  const second = await queue.add(candidate(2));
  await queue.add(candidate(3));
  const before = writes;
  const removed = await queue.removeMany([first.queueId, 'missing', second.queueId]);
  assert.equal(JSON.stringify(removed), JSON.stringify([first.queueId, second.queueId]));
  assert.equal(writes - before, 1);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), '["T3"]');
});

test('failed removeMany keeps every selected and unselected item intact', async () => {
  const adapter = storage();
  let fail = false;
  const tracked = { get: adapter.get, set: async patch => { if (fail) throw Error('storage unavailable'); await adapter.set(patch); } };
  const queue = create({ storage: tracked });
  const first = await queue.add(candidate(1));
  const second = await queue.add(candidate(2));
  await queue.add(candidate(3));
  fail = true;
  await assert.rejects(queue.removeMany([first.queueId, second.queueId]), /storage unavailable/);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), '["T1","T2","T3"]');
  fail = false;
  await queue.remove(first.queueId);
  assert.equal(JSON.stringify((await queue.list()).map(item => item.candidate.title)), '["T2","T3"]');
});
