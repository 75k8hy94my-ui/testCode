import test from 'node:test';
import assert from 'node:assert/strict';
import weather from '../game/weather-system.js';

test('day one weather uses stable three-hour conditions with exact slot boundaries', () => {
  const expected = ['clear','clear','clear','rain','clear','cloudy','clear','clear'];
  for (let slot = 0; slot < expected.length; slot += 1) {
    const start = slot * 180;
    assert.equal(weather.getWeatherAt(1, start), expected[slot], `slot ${slot} start`);
    assert.equal(weather.getWeatherAt(1, start + 179), expected[slot], `slot ${slot} final minute`);
    if (slot > 0) assert.equal(weather.getWeatherAt(1, start - 1), expected[slot - 1], `slot ${slot} previous minute`);
  }
  assert.equal(weather.getWeatherAt(1, 0), 'clear');
  assert.equal(weather.getWeatherAt(1, 180), 'clear');
  assert.equal(weather.getWeatherAt(1, 540), 'rain');
  assert.equal(weather.getWeatherAt(1, 900), 'cloudy');
});

test('forecast rows expose exact time until each transition and roll across midnight', () => {
  assert.deepEqual(weather.getForecast(1, 1430), [
    { day:1, startMinute:1260, offsetMinutes:0, condition:'clear' },
    { day:2, startMinute:0, offsetMinutes:10, condition:'clear' },
    { day:2, startMinute:180, offsetMinutes:190, condition:'rain' },
    { day:2, startMinute:360, offsetMinutes:370, condition:'clear' }
  ]);
});

test('weather inputs normalize invalid clocks and forecast length without throwing', () => {
  assert.equal(weather.getWeatherAt(-5, 0), weather.getWeatherAt(1, 0));
  assert.equal(weather.getWeatherAt(1.9, 180), weather.getWeatherAt(1, 180));
  assert.equal(weather.getWeatherAt(1, -1), weather.getWeatherAt(1, 0));
  assert.equal(weather.getWeatherAt(1, Number.NaN), weather.getWeatherAt(1, 0));
  assert.equal(weather.getWeatherAt(1, 1440), weather.getWeatherAt(2, 0));
  assert.equal(weather.getForecast(1, 480, 0).length, 1);
  assert.equal(weather.getForecast(1, 480, 3.9).length, 3);
  assert.equal(weather.getForecast(1, 480, 100).length, 8);
});

test('outdoor rain exposure counts only rainy minutes across changing weather slots', () => {
  assert.equal(weather.getOutdoorHygienePenalty(1, 500, 100, { sheltered:false, umbrellaOwned:false }), 0.72);
  assert.equal(weather.getOutdoorHygienePenalty(1, 500, 300, { sheltered:false, umbrellaOwned:false }), 2.16);
  assert.equal(weather.getOutdoorHygienePenalty(1, 500, 300, { sheltered:true, umbrellaOwned:false }), 0);
  assert.equal(weather.getOutdoorHygienePenalty(1, 500, 300, { sheltered:false, umbrellaOwned:true }), 0);
  assert.equal(weather.getOutdoorHygienePenalty(1, 0, 180, { sheltered:false, umbrellaOwned:false }), 0);
  assert.equal(weather.getOutdoorHygienePenalty(1, 500, -20, { sheltered:false, umbrellaOwned:false }), 0);
  assert.equal(weather.getOutdoorHygienePenalty(1, 500, Number.NaN, { sheltered:false, umbrellaOwned:false }), 0);
});
