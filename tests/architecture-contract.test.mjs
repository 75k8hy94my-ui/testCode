import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DYNAMIC_OWNERS, dynamicAssetReferences, assertDynamicAssets, assertPageBoundaries } from '../scripts/check-architecture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('current dynamic loaders resolve every statically named local dependency', () => {
  assert.ok(DYNAMIC_OWNERS.includes('manga-list-route.js'));
  assert.ok(DYNAMIC_OWNERS.includes('video-list-route.js'));
  assert.doesNotThrow(() => assertDynamicAssets(root));
});

test('dynamic loader extraction covers calls, paired script arrays, and stylesheet constants', () => {
  const source = [
    "await deps.loadScript('video-library.js?v=1', 'video');",
    "loadBrowserScript('reader-target.js');",
    "['manga-list-entry.js?v=3', 'mangaEntry'],",
    "script.src = 'notice-center.js?v=1';",
    "const STYLESHEET_URL = 'manga-list.css?v=1';",
  ].join('\n');
  assert.deepEqual(dynamicAssetReferences(source).sort(), [
    'manga-list-entry.js?v=3', 'manga-list.css?v=1',
    'notice-center.js?v=1', 'reader-target.js', 'video-library.js?v=1',
  ]);
});

test('a missing dynamically loaded script fails verification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testcode-architecture-'));
  try {
    fs.writeFileSync(path.join(dir, 'entry.js'), "loadScript('absent.js?v=1', 'missing');");
    assert.throws(() => assertDynamicAssets(dir, ['entry.js']), /entry\.js dynamically references missing asset: absent\.js\?v=1/);
    fs.writeFileSync(path.join(dir, 'absent.js'), '(() => {})();');
    assert.doesNotThrow(() => assertDynamicAssets(dir, ['entry.js']));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('standalone Reader and bookshelf preserve independent script boundaries', () => {
  assert.doesNotThrow(() => assertPageBoundaries(root));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testcode-reader-boundary-'));
  try {
    fs.writeFileSync(path.join(dir, 'manga.html'), '<script src="manga-list-route.js"></script>');
    fs.writeFileSync(path.join(dir, 'reader.html'), [
      '<script src="reader-target.js"></script>',
      '<script src="reader-page-source.js"></script>',
      '<script src="reader-progress-repository.js"></script>',
      '<script src="reader-runtime.js"></script>',
      '<script src="manga-list-route.js"></script>',
    ].join('\n'));
    assert.throws(() => assertPageBoundaries(dir), /Reader must not depend on manga-list-route\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
