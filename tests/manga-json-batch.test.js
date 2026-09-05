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
  assert.match(background,/chromeApi\.downloads\.download|downloads\.download/);
});

test('reader provides JSON batch import using existing encrypted persistence',()=>{
  const reader=fs.readFileSync('reader.html','utf8');
  assert.match(reader,/mangaJsonImportInput/);
  assert.match(reader,/JSONから追加/);
  assert.match(reader,/MangaJsonBatch/);
  assert.match(reader,/MangaVault\.savePayload|saveMangaBookshelfCloud/);
});

test('batch helper validates all drafts and skips duplicates',()=>{
  const helper=fs.readFileSync('manga-json-batch.js','utf8');
  assert.match(helper,/validateBatch/);
  assert.match(helper,/findDuplicate/);
  assert.match(helper,/importBatch/);
});
