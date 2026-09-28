import test from 'node:test';
import assert from 'node:assert/strict';
import gym from '../game/gym-training.js';

test('beginners can choose mobility or cardio while strength training is gated by fitness', () => {
  assert.deepEqual(gym.listWorkouts(0, 2000, 85, 75).map((entry) => ({
    id:entry.workout.id,
    available:entry.available,
    reason:entry.reason
  })), [
    { id:'mobility', available:true, reason:null },
    { id:'cardio', available:true, reason:null },
    { id:'strength', available:false, reason:'fitness-required' }
  ]);
  assert.equal(gym.listWorkouts(5, 2000, 85, 75)[2].available, true);
});

test('training completion charges the listed fee and returns its exact time and need changes', () => {
  assert.deepEqual(gym.completeWorkout(5, 2000, 85, 75, 'strength'), {
    ok:true,
    workout:{
      id:'strength',
      name:'筋力トレーニング',
      minimumFitness:5,
      cost:700,
      duration:60,
      minimumEnergy:30,
      minimumHunger:20,
      fitnessGain:2,
      effects:{ energy:-18, hunger:-12, hygiene:-18, fun:14 }
    },
    cashRemaining:1300,
    fitness:7
  });
});

test('training is rejected without fees when funds or physical readiness are insufficient', () => {
  assert.deepEqual(gym.completeWorkout(0, 200, 85, 75, 'cardio'), { ok:false, reason:'insufficient-funds' });
  assert.deepEqual(gym.completeWorkout(0, 1000, 19, 75, 'cardio'), { ok:false, reason:'too-tired' });
  assert.deepEqual(gym.completeWorkout(0, 1000, 85, 14, 'cardio'), { ok:false, reason:'too-hungry' });
  assert.deepEqual(gym.completeWorkout(0, 1000, 85, 75, 'unknown'), { ok:false, reason:'unknown-workout' });
});

test('available conditioning remains safe for zero-energy limits and preserves high legacy fitness values', () => {
  assert.equal(gym.listWorkouts(999, 1000, 14, 9)[0].available, true);
  const result = gym.completeWorkout(999, 1000, 14, 9, 'mobility');
  assert.equal(result.fitness, 1000);
  assert.equal(result.cashRemaining, 650);
});
