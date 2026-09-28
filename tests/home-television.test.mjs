import test from 'node:test';
import assert from 'node:assert/strict';
import television from '../game/home-television.js';

test('broadcast schedule switches at every exact boundary, including midnight', () => {
  const cases = [
    [0, 'overnight-nature'], [299, 'overnight-nature'],
    [300, 'morning-news'], [599, 'morning-news'],
    [600, 'travel-variety'], [959, 'travel-variety'],
    [960, 'cooking-show'], [1199, 'cooking-show'],
    [1200, 'prime-time-drama'], [1379, 'prime-time-drama'],
    [1380, 'overnight-nature'], [1439, 'overnight-nature']
  ];
  for (const [minute, id] of cases) assert.equal(television.getProgram(minute)?.id, id, `minute ${minute}`);
});

test('watch returns the exact broadcast duration, effects, and skill gain', () => {
  assert.deepEqual(television.watch(960), {
    ok:true,
    program:television.getProgram(960),
    duration:40,
    effects:{ fun:12 },
    cookingSkillGain:1
  });
  assert.deepEqual(television.watch(480), {
    ok:true,
    program:television.getProgram(480),
    duration:35,
    effects:{ fun:8, social:2, energy:-1 },
    cookingSkillGain:0
  });
  assert.deepEqual(television.watch(660), {
    ok:true,
    program:television.getProgram(660),
    duration:45,
    effects:{ fun:17, energy:-2 },
    cookingSkillGain:0
  });
  assert.deepEqual(television.watch(1260), {
    ok:true,
    program:television.getProgram(1260),
    duration:60,
    effects:{ fun:25, energy:-4 },
    cookingSkillGain:0
  });
  assert.deepEqual(television.watch(60), {
    ok:true,
    program:television.getProgram(60),
    duration:50,
    effects:{ fun:14, energy:-5 },
    cookingSkillGain:0
  });
});

test('invalid times cannot produce a program or watch transition', () => {
  for (const minute of [-1, 1440, 480.5, NaN, Infinity, '480', null]) {
    assert.equal(television.getProgram(minute), null);
    assert.deepEqual(television.watch(minute), { ok:false, reason:'invalid-time' });
  }
});

test('programs and nested effects are immutable and repeated watch results cannot mutate the catalog', () => {
  const program = television.getProgram(960);
  assert.equal(Object.isFrozen(program), true);
  assert.equal(Object.isFrozen(program.effects), true);
  assert.throws(() => { program.effects.fun = 999; }, TypeError);
  const first = television.watch(960);
  const second = television.watch(960);
  assert.notEqual(first, second);
  assert.equal(television.getProgram(960).effects.fun, 12);
});
