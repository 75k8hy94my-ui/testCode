const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('extension queues multiple drafts and exports one JSON batch',()=>{
  const toolbar=fs.readFileSync('extension/content/site-toolbar.js','utf8');
  const background=fs.readFileSync('extension/background.js','utf8');
  assert.match(toolbar,/EXPORT_DRAFTS_JSON/);
  assert.match(toolbar,/書き出し待ち/);
  assert.match(background,/mangaExportDraftsV1/);
  assert.match(background,/version:\s*1[\s\S]*items/);
  assert.match(background,/downloads\.download/);
});

test('reader gets a JSON batch import control and uses encrypted persistence',()=>{
  const relay=fs.readFileSync('extension/content/testcode-content.js','utf8');
  const background=fs.readFileSync('extension/background.js','utf8');
  assert.match(relay,/mangaJsonImportInput/);
  assert.match(relay,/JSONから追加/);
  assert.match(relay,/IMPORT_JSON_BATCH/);
  assert.match(background,/MangaVault\.savePayload/);
  assert.match(background,/MangaVaultPayload\.buildFromLocalStorage/);
});

test('batch helper validates all drafts and skips duplicates',()=>{
  const helper=fs.readFileSync('manga-json-batch.js','utf8');
  assert.match(helper,/validateBatch/);
  assert.match(helper,/findDuplicate/);
  assert.match(helper,/importBatch/);
});
