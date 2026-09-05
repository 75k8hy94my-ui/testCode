const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const toolbar=fs.readFileSync('extension/content/site-toolbar.js','utf8');
const background=fs.readFileSync('extension/background.js','utf8');

test('adding a manga only queues it for export and never starts reader delivery',()=>{assert.match(toolbar,/type:'QUEUE_DRAFT'/);assert.doesNotMatch(toolbar,/FLUSH_PENDING/);assert.doesNotMatch(toolbar,/bridge/);});
test('background exports queued drafts then clears the export queue',()=>{assert.match(background,/EXPORT_DRAFTS_JSON/);assert.match(background,/downloads\.download/);assert.match(background,/set\(KEYS\.exportDrafts,\[\]\)/);});