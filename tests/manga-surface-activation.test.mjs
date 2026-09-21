import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-surface-activation.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-surface-activation.js' });
  return context.MangaSurfaceActivationFactory;
}

function validDeps() {
  return {
    activateMangaTab(value) { return ['tab', value]; },
    activateMangaMobileNav(value) { return ['nav', value]; },
    showMangaSection(value) { return ['section', value]; },
  };
}

test('surface activation factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  assert.equal(typeof factory.create, 'function');
});

test('surface activation factory preserves three function dependencies and arguments', () => {
  const factory = loadFactory();
  const deps = validDeps();
  const instance = factory.create(deps);
  assert.deepEqual(Object.keys(instance), ['activateMangaTab', 'activateMangaMobileNav', 'showMangaSection']);
  assert.equal(Object.isFrozen(instance), true);
  assert.equal(instance.activateMangaTab, deps.activateMangaTab);
  assert.equal(instance.activateMangaMobileNav, deps.activateMangaMobileNav);
  assert.equal(instance.showMangaSection, deps.showMangaSection);
  assert.deepEqual(instance.activateMangaTab('a'), ['tab', 'a']);
  assert.deepEqual(instance.activateMangaMobileNav('b'), ['nav', 'b']);
  assert.deepEqual(instance.showMangaSection('c'), ['section', 'c']);
});

test('surface activation factory rejects missing, invalid, and unknown dependencies', () => {
  const factory = loadFactory();
  for (const key of ['activateMangaTab', 'activateMangaMobileNav', 'showMangaSection']) {
    const missing = validDeps();
    delete missing[key];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key));
    for (const value of [undefined, null, 'bad', {}, 1]) {
      const invalid = validDeps();
      invalid[key] = value;
      assert.throws(() => factory.create(invalid), (error) => error.name === 'TypeError' && error.message.includes(key));
    }
  }
  const extra = validDeps();
  extra.unexpected = () => {};
  assert.throws(() => factory.create(extra), (error) => error.name === 'TypeError' && error.message.includes('unexpected'));
});

test('surface activation factory has no browser, persistence, routing, or listener dependencies', () => {
  assert.doesNotMatch(source, /document|window|localStorage|sessionStorage|MangaVault|Supabase|VPN|addEventListener|setTimeout|setInterval|location|history|new Map|new Set|\[\]/);
  assert.doesNotMatch(source, /this\.|\.bind\(|\.call\(|\.apply\(/);
});
