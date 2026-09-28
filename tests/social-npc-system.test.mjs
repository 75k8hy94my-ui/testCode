import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import socialNpcModule from '../game/social-npc-system.js';

const socialNpc = socialNpcModule;
const html = fs.readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');

test('authored social roster contains ten stable profiles and preserves the original three', () => {
  assert.equal(socialNpc.catalog.length, 10);
  assert.deepEqual(socialNpc.catalog.slice(0, 3).map(({ id, name, age, gender, jobType }) => ({ id, name, age, gender, jobType })), [
    { id:'aoi', name:'アオイ', age:28, gender:'female', jobType:'freelance' },
    { id:'sora', name:'ソラ', age:24, gender:'male', jobType:'cafe' },
    { id:'mei', name:'メイ', age:22, gender:'female', jobType:'student' }
  ]);
  assert.equal(new Set(socialNpc.catalog.map((profile) => profile.id)).size, 10);
  for (const profile of socialNpc.catalog) {
    assert.ok(profile.name);
    assert.ok(profile.color);
    assert.ok(['home','cafe','store','gym','library','park'].includes(profile.preferredPlaceId));
    assert.ok(profile.workPlaceId === null || ['cafe','store','gym','library'].includes(profile.workPlaceId));
    assert.ok(profile.schedule && typeof profile.schedule === 'object');
    assert.ok(profile.personality && typeof profile.personality === 'object');
    assert.ok(profile.dialogueStyle && typeof profile.dialogueStyle === 'object');
  }
});

test('relationship catalog contains unique valid pairs and supports symmetric lookup', () => {
  const ids = new Set(socialNpc.catalog.map((profile) => profile.id));
  const keys = new Set();
  assert.ok(socialNpc.relationships.length >= 9);
  for (const relationship of socialNpc.relationships) {
    assert.ok(ids.has(relationship.aId));
    assert.ok(ids.has(relationship.bId));
    assert.notEqual(relationship.aId, relationship.bId);
    const key = [relationship.aId, relationship.bId].sort().join('|');
    assert.ok(!keys.has(key), `duplicate pair ${key}`);
    keys.add(key);
    assert.equal(socialNpc.getRelationship(relationship.aId, relationship.bId), relationship);
    assert.equal(socialNpc.getRelationship(relationship.bId, relationship.aId), relationship);
    assert.ok(Number.isFinite(relationship.initialAffinity));
    assert.ok(relationship.type);
  }
  assert.equal(socialNpc.getRelationship('aoi', 'aoi'), null);
  assert.equal(socialNpc.getRelationship('unknown', 'aoi'), null);
});

test('initial social state has stable friendship, pair affinity, and recent-topic defaults', () => {
  const state = socialNpc.createInitialState();
  assert.deepEqual(Object.keys(state.friendship).sort(), socialNpc.catalog.map((profile) => profile.id).sort());
  assert.deepEqual(Object.keys(state.recentTopics).sort(), socialNpc.catalog.map((profile) => profile.id).sort());
  assert.equal(Object.keys(state.relationships).length, socialNpc.relationships.length);
  for (const value of Object.values(state.friendship)) assert.equal(value, 0);
  for (const relationship of socialNpc.relationships) {
    assert.equal(state.relationships[[relationship.aId, relationship.bId].sort().join('|')], relationship.initialAffinity);
  }
  for (const topic of Object.values(state.recentTopics)) assert.equal(topic, null);
});

test('social NPC module loads before the game runtime', () => {
  assert.match(html, /social-npc-system\.js\?v=[^\"]+/);
  assert.ok(html.indexOf('social-npc-system.js') < html.indexOf('game.js'));
});
