const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const toolbar=fs.readFileSync('extension/content/site-toolbar.js','utf8');
const readerImport=fs.readFileSync('extension/content/testcode-content.js','utf8');

test('toolbar reports export queue count and exposes one-file export',()=>{assert.match(toolbar,/書き出し待ち/);assert.match(toolbar,/JSONを書き出す/);assert.match(toolbar,/GET_EXPORT_STATUS/);});
test('reader import reports added and duplicate counts',()=>{assert.match(readerImport,/追加 \$\{r\.added\}件 \/ 重複 \$\{r\.duplicates\}件/);});