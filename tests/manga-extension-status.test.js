const test=require('node:test');
const assert=require('node:assert/strict');
const bg=require('../extension/background.js');

test('summarizes configured fields for the matching rule',()=>{assert.deepEqual(bg.summarizeRuleFields({fields:{title:{},author:{},allPageImages:{}}},8),{configured:3,total:8});});

test('export queue uses its own storage key',async()=>{const store=bg.makeMemoryStore(),queue=bg.makeQueue(store,bg.KEYS.exportDrafts);await queue.enqueue({title:'A',url:'https://cdn/x.jpg'});assert.equal((await queue.list()).length,1);assert.equal((await store.get(bg.KEYS.pending)),undefined);});