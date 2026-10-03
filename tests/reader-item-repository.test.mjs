import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { self: {}, console };
const moduleUrl = new URL('../reader-item-repository.js', import.meta.url);
if (fs.existsSync(moduleUrl)) vm.runInNewContext(fs.readFileSync(moduleUrl, 'utf8'), context);
const factory = context.self.ReaderItemRepositoryFactory;

test('reader repository resolves a saved item by itemId only', () => {
  assert.ok(factory, 'ReaderItemRepositoryFactory must be implemented');
  const items = [{ id: 'a', url: 'https://same.test/book' }, { id: 'b', url: 'https://same.test/book' }];
  const repository = factory.create({ readItems: () => items, writeItems() {}, scheduleSync() {} });
  assert.equal(repository.loadItem('b'), items[1]);
  assert.equal(repository.loadItem('missing'), null);
});

test('reader repository updates one item without overwriting neighboring items', () => {
  let items = [{ id: 'a', favorite: false }, { id: 'b', favorite: false }];
  let writes = 0;
  let syncs = 0;
  const repository = factory.create({
    readItems: () => items,
    writeItems: (next) => { items = next; writes += 1; },
    scheduleSync: () => { syncs += 1; },
  });
  assert.equal(repository.updateItem('b', { favorite: true, lastPage: 12 }).id, 'b');
  assert.deepEqual(JSON.parse(JSON.stringify(items)), [{ id: 'a', favorite: false }, { id: 'b', favorite: true, lastPage: 12 }]);
  assert.equal(writes, 1);
  assert.equal(syncs, 1);
  assert.equal(repository.updateItem('missing', { favorite: true }), null);
});

test('reader repository rejects item identity changes', () => {
  const items = [{ id: 'a', favorite: false }];
  const repository = factory.create({ readItems: () => items, writeItems() {}, scheduleSync() {} });
  assert.throws(() => repository.updateItem('a', { id: 'other' }), /identity/);
});

test('reader repository finds the next volume without exposing shelf arrays to the runtime', () => {
  const items = [
    { id: 'later', series: 'series', volume: 3 },
    { id: 'current', series: 'series', volume: 1 },
    { id: 'next', series: 'series', volume: 2 },
  ];
  const repository = factory.create({ readItems: () => items, writeItems() {}, scheduleSync() {} });
  assert.equal(repository.findNextVolume(items[1]).id, 'next');
});
