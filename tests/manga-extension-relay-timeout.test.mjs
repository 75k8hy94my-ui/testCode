import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../extension/content/testcode-content.js',import.meta.url),'utf8');
test('reader import has no relay delivery timeout because it imports a local JSON file',()=>{assert.match(source,/mangaJsonImportInput/);assert.doesNotMatch(source,/DELIVERY_TIMEOUT_MS|FLUSH_PENDING/);});