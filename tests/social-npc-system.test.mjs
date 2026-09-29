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
  const placeIds = new Set(['home', 'cafe', 'store', 'park', 'gym', 'library', 'community-center', 'fuel-station', 'delivery-depot', 'public-bath', 'clinic']);
  for (const profile of social.catalog) {
    for (const key of ['id', 'name', 'gender', 'age', 'jobType', 'color', 'homePlaceId', 'personality', 'schedule', 'dialogueStyle']) {
      assert.ok(profile[key] !== undefined && profile[key] !== null, `${profile.id} has ${key}`);
    }
    assert.ok(Object.hasOwn(profile, 'workPlaceId'));
    assert.equal(profile.homePlaceId, 'home');
    assert.ok(profile.workPlaceId === null || placeIds.has(profile.workPlaceId), `${profile.id} points to an existing workplace or generic site`);
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

test('conversation topics reflect time, weekday and current activity deterministically', () => {
  const { getConversation } = require(path.join(root, 'game', 'social-npc-system.js'));
  const morning = getConversation({ npcId:'aoi', minute:8 * 60, day:1, activityId:'walking', friendship:0, relationship:null });
  const evening = getConversation({ npcId:'aoi', minute:20 * 60, day:1, activityId:'walking', friendship:0, relationship:null });
  const weekend = getConversation({ npcId:'aoi', minute:8 * 60, day:6, activityId:'walking', friendship:0, relationship:null });
  const atWork = getConversation({ npcId:'sora', minute:10 * 60, day:2, activityId:'cafe-shift', friendship:4, relationship:null });
  assert.notEqual(morning.topic, evening.topic);
  assert.notEqual(morning.topic, weekend.topic);
  assert.deepEqual(morning, getConversation({ npcId:'aoi', minute:8 * 60, day:1, activityId:'walking', friendship:0, relationship:null }));
  assert.ok(atWork.line.includes('勤務'));
  assert.ok(atWork.options.some(({ id }) => id === 'greet'));
});

test('recently repeated topics produce a distinct follow-up line', () => {
  const { getConversation } = require(path.join(root, 'game', 'social-npc-system.js'));
  const first = getConversation({ npcId:'aoi', minute:9 * 60, day:2, activityId:'walking', friendship:2, relationship:null, recentTopic:null });
  const repeated = getConversation({ npcId:'aoi', minute:9 * 60, day:2, activityId:'walking', friendship:2, relationship:null, recentTopic:first.topic });
  assert.equal(repeated.topic, `${first.topic}-followup`);
  assert.notEqual(repeated.line, first.line);
});

test('conversation choices give bounded effects and invitations expire across midnight', () => {
  const { resolveConversation } = require(path.join(root, 'game', 'social-npc-system.js'));
  const greeting = resolveConversation({ npcId:'aoi', optionId:'greet', minute:21 * 60, day:3, activityId:'walking', friendship:99, relationship:null, needs:{ energy:50 } });
  assert.equal(greeting.friendshipDelta, 1);
  assert.ok(greeting.friendshipDelta <= 100 - 99);
  assert.equal(greeting.activityRequest, null);
  const invite = resolveConversation({ npcId:'mei', optionId:'invite', minute:22 * 60 + 30, day:4, activityId:'walking', friendship:8, relationship:null, needs:{ energy:70 } });
  assert.equal(invite.activityRequest.actionId, 'social-meetup');
  assert.equal(invite.activityRequest.placeId, 'park');
  assert.equal(invite.activityRequest.expiresAt, 3 * 1440 + 22 * 60 + 30 + 120);
  const refusal = resolveConversation({ npcId:'sora', optionId:'invite', minute:10 * 60, day:3, activityId:'cafe-shift', friendship:8, relationship:null, needs:{ energy:70 } });
  assert.equal(refusal.activityRequest, null);
  assert.match(refusal.response, /勤務/);
});

test('conversation effects respect affinity floor and sleep and social bias needs an eligible tie', () => {
  const { resolveConversation, getSocialActionBias } = require(path.join(root, 'game', 'social-npc-system.js'));
  const low = resolveConversation({ npcId:'mei', optionId:'greet', minute:12 * 60, day:2, activityId:'walking', friendship:0, relationship:null, needs:{} });
  assert.ok(low.friendshipDelta >= 0);
  const asleep = resolveConversation({ npcId:'aoi', optionId:'invite', minute:23 * 60, day:2, activityId:'sleep', friendship:10, relationship:null, needs:{} });
  assert.equal(asleep.activityRequest, null);
  assert.match(asleep.response, /休ませて/);
  const connected = getSocialActionBias({ npcId:'aoi', action:'social:visit', minute:600, day:2, relationships:{ 'aoi|sora':55 }, nearbySocialNpcIds:['sora'] });
  const unrelated = getSocialActionBias({ npcId:'aoi', action:'social:visit', minute:600, day:2, relationships:{}, nearbySocialNpcIds:['sora'] });
  const nonsocial = getSocialActionBias({ npcId:'aoi', action:'work', minute:600, day:2, relationships:{ 'aoi|sora':55 }, nearbySocialNpcIds:['sora'] });
  assert.ok(connected > 0 && connected <= 0.15);
  assert.equal(unrelated, 0);
  assert.equal(nonsocial, 0);
});

test('new save state takes precedence while legacy friendship migrates and malformed fields clamp safely', () => {
  const { normalizeState } = require(path.join(root, 'game', 'social-npc-system.js'));
  const state = normalizeState({
    friendship:{ aoi:12, sora:'broken', mei:Infinity, ren:250, yui:-4 },
    relationships:{ 'aoi|sora':73, 'aoi|mei':-9 },
    recentTopics:{ aoi:'morning', sora:42 }
  }, { aoi:4, sora:7, mei:8 });
  assert.deepEqual([state.friendship.aoi, state.friendship.sora, state.friendship.mei, state.friendship.ren, state.friendship.yui], [12, 7, 8, 100, 0]);
  assert.equal(state.relationships['aoi|sora'], 73);
  assert.ok(state.relationships['aoi|mei'] >= 0);
  assert.equal(state.recentTopics.aoi, 'morning');
  assert.equal(state.recentTopics.sora, null);
});

test('old friendship values are retained and absent social fields receive catalog defaults', () => {
  const { normalizeState, createInitialState } = require(path.join(root, 'game', 'social-npc-system.js'));
  const legacy = normalizeState(null, { aoi:2, sora:5, mei:1 });
  assert.deepEqual([legacy.friendship.aoi, legacy.friendship.sora, legacy.friendship.mei], [2, 5, 1]);
  const defaults = createInitialState();
  const missing = normalizeState({}, {});
  assert.deepEqual(missing, defaults);
});
