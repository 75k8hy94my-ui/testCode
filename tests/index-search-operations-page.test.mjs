import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('index page exposes sync, AI prompt, and conflict controls', () => {
  const html = read('index-search.html');
  for (const id of ['syncNowBtn', 'syncSummary', 'copyConversionPromptBtn', 'conversionPromptPanel', 'conflictPanel', 'conflictList']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const script of ['index-search-conflicts.js', 'index-search-sync-status.js', 'index-conversion-prompt.js', 'index-search-worker-client.js']) {
    assert.match(html, new RegExp(script.replace('.', '\\.')));
  }
});

test('page uses worker executor and explicit conflict resolution, never automatic merge', () => {
  const page = read('index-search-page.js');
  assert.match(page, /IndexSearchWorkerClient/);
  assert.match(page, /createSearchExecutor/);
  assert.match(page, /IndexSearchConflicts/);
  assert.match(page, /useCloudVersion/);
  assert.match(page, /saveLocalAsSeparate/);
  assert.match(page, /discardMissingRemoteLocal/);
  assert.doesNotMatch(page, /mergeConflict|mergeBooks|autoMerge/i);
});

test('manual sync, retry controller, prompt copy fallback, and weekly cleanup are wired', () => {
  const page = read('index-search-page.js');
  assert.match(page, /createRetryController/);
  assert.match(page, /syncNowBtn/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /IndexConversionPrompt\.buildPrompt/);
  assert.match(page, /mangaReaderIndexCleanupAt:/);
  assert.match(page, /7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(page, /cleanupRemoteTombstones/);
});

test('aggregate sync UI recognizes the global sync error marker', () => {
  const page = read('index-search-page.js');
  assert.match(page, /errorMap\.has\(['"]__global__['"]\)/);
});

test('decrypted user-controlled text is still rendered with textContent rather than dynamic HTML', () => {
  const page = read('index-search-page.js');
  assert.match(page, /textContent\s*=/);
  assert.doesNotMatch(page, /innerHTML\s*=\s*[^'"`]/);
});

test('operations page controller remains valid classic JavaScript', () => {
  new vm.Script(read('index-search-page.js'), { filename: 'index-search-page.js' });
});
