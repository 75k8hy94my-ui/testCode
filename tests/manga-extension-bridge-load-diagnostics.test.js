const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const readerImport=fs.readFileSync('extension/content/testcode-content.js','utf8');

test('JSON import bypasses the old reader bridge relay',()=>{assert.match(readerImport,/IMPORT_JSON_BATCH/);assert.doesNotMatch(readerImport,/DELIVER_DRAFT|bridge-ready|bridge-timeout/);});