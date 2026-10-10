import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game/game.js', import.meta.url), 'utf8');

test('community garden harvest feeds household cooking and advertises that connection', () => {
  const garden = game.slice(game.indexOf('const plotStatuses = communityGardenModel.listPlotStatuses'), game.indexOf('if (place.id === "gym")'));
  assert.match(garden, /state\.groceries \+= result\.yield/);
  assert.match(garden, /自宅の料理に使えます/);
  assert.match(game, /homeCookingModel\.listRecipes\(state\.communityCenter\.skills\.cooking, state\.groceries, state\.fishing\.fish\)/);
});

test('community courses grow shared household skills and clubs build resident relationships', () => {
  const community = game.slice(game.indexOf('if (place.id === "community-center")'), game.indexOf('function nearestInteraction()'));
  assert.match(community, /state\.communityCenter = communityCenterModel\.completeCourse/);
  assert.match(community, /state\.communityCenter = communityCenterModel\.attendClub/);
  assert.match(community, /member\.friendship = clamp\(member\.friendship \+ 2/);
  assert.match(game, /homeCookingModel\.listRecipes\(state\.communityCenter\.skills\.cooking/);
  assert.match(game, /homeCraftingModel\.craft\(state\.homeCrafting, recipeId, state\.communityCenter\.skills\.craft\)/);
});

test('handmade gifts consume home craft inventory and change resident relationships', () => {
  const gift = game.slice(game.indexOf('function performNpcGift('), game.indexOf('function performNpcConversation('));
  assert.match(gift, /state\.homeCrafting = result\.progress/);
  assert.match(gift, /npc\.friendship = clamp\(npc\.friendship \+ result\.friendshipGain/);
  assert.match(gift, /relationshipAffinityGain/);
});
