import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create } = require('../reader-page-transition.js');

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('old page and page number remain until prepared frame commits', async () => {
  const commits = [];
  const controller = create({ initialPage: 5, commit: (page, resource) => commits.push([page, resource]) });
  const pending = deferred();
  const request = controller.request(6, () => pending.promise);
  assert.equal(controller.getState().displayedPage, 5);
  assert.equal(controller.getState().requestedPage, 6);
  assert.deepEqual(commits, []);
  pending.resolve({ ready: true });
  assert.equal(await request, true);
  assert.equal(controller.getState().displayedPage, 6);
  assert.deepEqual(commits, [[6, { ready: true }]]);
});

test('stale ordinary or encrypted preparation cannot commit after a newer request', async () => {
  const commits = [];
  const controller = create({ initialPage: 10, commit: (page) => commits.push(page) });
  const old = deferred();
  const older = controller.request(11, () => old.promise);
  const newer = await controller.request(13, async () => ({ ready: true, decoded: true }));
  old.resolve({ ready: true, decoded: true });
  assert.equal(await older, false);
  assert.equal(newer, true);
  assert.deepEqual(commits, [13]);
  assert.equal(controller.getState().displayedPage, 13);
});

test('failed preparation preserves displayed page and allows retry', async () => {
  const commits = [];
  const controller = create({ initialPage: 2, commit: (page) => commits.push(page) });
  assert.equal(await controller.request(3, async () => { throw new Error('decode failed'); }), false);
  assert.equal(controller.getState().displayedPage, 2);
  assert.equal(controller.getState().status, 'failed');
  assert.equal(await controller.request(3, async () => ({ ready: true })), true);
  assert.deepEqual(commits, [3]);
});

test('destroy invalidates pending preparation', async () => {
  const pending = deferred(); const commits = [];
  const controller = create({ initialPage: 1, commit: (page) => commits.push(page) });
  const request = controller.request(2, () => pending.promise);
  controller.destroy(); pending.resolve({ ready: true });
  assert.equal(await request, false);
  assert.deepEqual(commits, []);
});

test('requesting the currently displayed page revokes a pending forward request', async () => {
  const pending = deferred(); const commits = [];
  const controller = create({ initialPage: 4, commit: (page) => commits.push(page) });
  const forward = controller.request(5, () => pending.promise);
  controller.invalidate();
  pending.resolve({ ready: true });
  assert.equal(await forward, false);
  assert.equal(controller.getState().displayedPage, 4);
  assert.deepEqual(commits, []);
});
