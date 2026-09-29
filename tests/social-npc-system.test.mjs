import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

test('the authored social roster has ten stable complete profiles', () => {
  const social = require(path.join(root, 'game', 'social-npc-system.js'));
  assert.equal(social.catalog.length, 10);
  assert.deepEqual(social.catalog.slice(0, 3).map(({ id, name }) => [id, name]), [
    ['aoi', 'アオイ'], ['sora', 'ソラ'], ['mei', 'メイ']
  ]);
  assert.equal(new Set(social.catalog.map((profile) => profile.id)).size, 10);
  for (const profile of social.catalog) {
    for (const key of ['id', 'name', 'gender', 'age', 'jobType', 'color', 'homePlaceId', 'workPlaceId', 'personality', 'schedule', 'dialogueStyle']) {
      assert.ok(profile[key] !== undefined && profile[key] !== null, `${profile.id} has ${key}`);
    }
    assert.ok(profile.age >= 18 && profile.age <= 90);
    assert.match(profile.color, /^#[\da-f]{6}$/i);
    assert.ok(Array.isArray(profile.schedule) && profile.schedule.length > 0);
  }
});

test('relationships are unique unordered pairs and lookup is symmetric', () => {
  const social = require(path.join(root, 'game', 'social-npc-system.js'));
  const ids = new Set(social.catalog.map(({ id }) => id));
  const keys = new Set();
  for (const relation of social.relationships) {
    assert.ok(ids.has(relation.aId) && ids.has(relation.bId));
    assert.notEqual(relation.aId, relation.bId);
    assert.ok(['family', 'friend', 'coworker', 'acquaintance'].includes(relation.type));
    const key = [relation.aId, relation.bId].sort().join('|');
    assert.ok(!keys.has(key), `duplicate pair ${key}`);
    keys.add(key);
    assert.strictEqual(social.getRelationship(relation.aId, relation.bId), relation);
    assert.strictEqual(social.getRelationship(relation.bId, relation.aId), relation);
  }
  assert.equal(social.getRelationship('aoi', 'aoi'), null);
  assert.equal(social.getRelationship('aoi', 'unknown'), null);
});

test('initial state provides bounded friendship, pair affinity, and recent-topic defaults', () => {
  const social = require(path.join(root, 'game', 'social-npc-system.js'));
  const state = social.createInitialState();
  assert.deepEqual(Object.keys(state.friendship).sort(), social.catalog.map(({ id }) => id).sort());
  assert.equal(state.friendship.aoi, 0);
  assert.equal(state.friendship.sora, 0);
  assert.equal(state.friendship.mei, 0);
  assert.equal(Object.keys(state.relationships).length, social.relationships.length);
  assert.deepEqual(Object.keys(state.recentTopics).sort(), social.catalog.map(({ id }) => id).sort());
  assert.ok(Object.values(state.recentTopics).every((topic) => topic === null));
  state.friendship.aoi = 1;
  assert.equal(social.createInitialState().friendship.aoi, 0);
});

test('the browser loads social data before the game runtime', () => {
  const html = fs.readFileSync(path.join(root, 'game', 'index.html'), 'utf8');
  const socialScript = html.indexOf('src="./social-npc-system.js');
  const gameScript = html.indexOf('src="./game.js');
  assert.ok(socialScript >= 0 && gameScript > socialScript);
});
