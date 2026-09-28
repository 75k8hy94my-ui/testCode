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

test('conversation changes with time, day, activity, and the last topic', () => {
  const morning = socialNpc.getConversation({
    npcId:'aoi', minute:9 * 60, day:1, activityId:'park', friendship:2,
    relationships:{}, recentTopic:null, nearbySocialNpcIds:[]
  });
  assert.deepEqual(morning, socialNpc.getConversation({
    npcId:'aoi', minute:9 * 60, day:1, activityId:'park', friendship:2,
    relationships:{}, recentTopic:null, nearbySocialNpcIds:[]
  }));
  const evening = socialNpc.getConversation({
    npcId:'aoi', minute:19 * 60, day:2, activityId:'home_idle', friendship:2,
    relationships:{}, recentTopic:null, nearbySocialNpcIds:[]
  });
  const avoidingRepeat = socialNpc.getConversation({
    npcId:'aoi', minute:9 * 60, day:1, activityId:'park', friendship:2,
    relationships:{}, recentTopic:morning.topic, nearbySocialNpcIds:[]
  });
  assert.notEqual(morning.line, evening.line);
  assert.notEqual(morning.topic, avoidingRepeat.topic);
  assert.equal(morning.options.length, 3);
  assert.deepEqual(morning.options.map((option) => option.id), ['greet','ask','invite']);
});

test('conversation reflects a nearby person with an authored mutual relationship', () => {
  const result = socialNpc.getConversation({
    npcId:'aoi', minute:12 * 60, day:1, activityId:'park', friendship:2,
    relationships:{'aoi|sora':58}, recentTopic:null, nearbySocialNpcIds:['sora']
  });
  assert.match(result.line, /ソラ/);
});

test('busy and sleeping NPCs decline invitations without receiving an activity request', () => {
  for (const activityId of ['work','sleep']) {
    const result = socialNpc.resolveConversation({
      npcId:'aoi', optionId:'invite', minute:10 * 60, day:1, activityId,
      friendship:10, relationships:{}, nearbySocialNpcIds:[], needs:{ social:50, fun:50 }
    });
    assert.equal(result.activityRequest, null);
    assert.equal(result.friendshipDelta, 0);
    assert.match(result.response, /今は|あとで/);
  }
});

test('authored work schedule changes invitation availability by weekday', () => {
  const makeInvite = (day) => socialNpc.resolveConversation({
    npcId:'aoi', optionId:'invite', minute:10 * 60, day, activityId:'park',
    friendship:10, relationships:{}, nearbySocialNpcIds:[], needs:{ social:40, fun:40 }
  });
  assert.equal(makeInvite(1).activityRequest, null);
  assert.ok(makeInvite(7).activityRequest);
});

test('accepted invitation requests a routed social activity with midnight-safe expiry', () => {
  const result = socialNpc.resolveConversation({
    npcId:'yuto', optionId:'invite', minute:23 * 60 + 30, day:3, activityId:'park',
    friendship:10, relationships:{}, nearbySocialNpcIds:[], needs:{ social:45, fun:40 }
  });
  assert.ok(result.activityRequest);
  assert.equal(result.activityRequest.actionId, 'socialize');
  assert.equal(result.activityRequest.placeId, 'park');
  assert.equal(result.activityRequest.expiresAt, (3 - 1) * 1440 + 23 * 60 + 30 + 90);
  assert.ok(result.friendshipDelta > 0);
});

test('conversation changes mutual affinity only for known nearby pairs and keeps values bounded', () => {
  const result = socialNpc.resolveConversation({
    npcId:'aoi', optionId:'ask', minute:12 * 60, day:1, activityId:'park', friendship:100,
    relationships:{'aoi|sora':100}, nearbySocialNpcIds:['sora','unknown'], needs:{ social:50, fun:50 }
  });
  assert.equal(result.friendshipDelta, 0);
  assert.deepEqual(result.relationshipChanges, [{ pairKey:'aoi|sora', delta:0 }]);
  const unrelated = socialNpc.resolveConversation({
    npcId:'aoi', optionId:'ask', minute:12 * 60, day:1, activityId:'park', friendship:0,
    relationships:{}, nearbySocialNpcIds:['sora'], needs:{ social:50, fun:50 }
  });
  assert.deepEqual(unrelated.relationshipChanges, [{ pairKey:'aoi|sora', delta:1 }]);
});

test('social action bias is bounded and only applies to the socialize candidate', () => {
  const input = { npcId:'aoi', minute:12 * 60, day:1, relationships:{'aoi|sora':70}, nearbySocialNpcIds:['sora'] };
  const socialBias = socialNpc.getSocialActionBias({ ...input, action:'socialize' });
  assert.ok(socialBias > 0 && socialBias <= 30);
  assert.equal(socialNpc.getSocialActionBias({ ...input, action:'work' }), 0);
  assert.equal(socialNpc.getSocialActionBias({ ...input, action:'sleep' }), 0);
});
