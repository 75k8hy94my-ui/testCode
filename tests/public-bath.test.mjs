import test from 'node:test';
import assert from 'node:assert/strict';
import publicBath from '../game/public-bath.js';

test('a standard bath is available at opening and applies fixed restorative effects', () => {
  const listed = publicBath.listOptions({ minute:360, cash:520, energy:50, hunger:40 });
  const bath = listed.find((option) => option.id === 'bath');
  assert.deepEqual({ available:bath.available, reason:bath.reason }, { available:true, reason:null });

  const result = publicBath.completeBath({ minute:360, cash:520, energy:50, hunger:40 }, 'bath');
  assert.deepEqual(result, {
    ok:true,
    optionId:'bath',
    duration:45,
    cost:520,
    effects:{ hygiene:100, energy:6, fun:16, social:6, hunger:0 }
  });
});

test('entry is closed before 06:00 and baths must finish by 23:00', () => {
  assert.equal(publicBath.completeBath({ minute:359, cash:1000, energy:80, hunger:80 }, 'bath').reason, 'not-open');
  assert.equal(publicBath.completeBath({ minute:1336, cash:1000, energy:80, hunger:80 }, 'bath').reason, 'closing-time');
  assert.equal(publicBath.completeBath({ minute:1320, cash:1000, energy:80, hunger:80 }, 'sauna').ok, true);
});

test('sauna requires minimum energy and hunger and charges the exact fee once in its result', () => {
  const context = { minute:600, cash:800, energy:35, hunger:20 };
  assert.deepEqual(publicBath.completeBath(context, 'sauna'), {
    ok:true,
    optionId:'sauna',
    duration:60,
    cost:800,
    effects:{ hygiene:100, energy:2, fun:24, social:10, hunger:-5 }
  });
  assert.equal(publicBath.completeBath({ ...context, energy:34 }, 'sauna').reason, 'too-tired');
  assert.equal(publicBath.completeBath({ ...context, hunger:19 }, 'sauna').reason, 'too-hungry');
});

test('unaffordable and unknown choices fail without mutating input context', () => {
  const context = Object.freeze({ minute:600, cash:519, energy:60, hunger:50 });
  assert.equal(publicBath.completeBath(context, 'bath').reason, 'insufficient-funds');
  assert.equal(publicBath.completeBath(context, 'onsen').reason, 'unknown-option');
  assert.deepEqual(context, { minute:600, cash:519, energy:60, hunger:50 });
});
