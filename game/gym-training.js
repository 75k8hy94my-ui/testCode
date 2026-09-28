(function initCityDaysGymTraining(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysGymTraining = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGymTrainingApi() {
  "use strict";

  const WORKOUTS = Object.freeze([
    Object.freeze({
      id:"mobility",
      name:"コンディショニングストレッチ",
      minimumFitness:0,
      cost:350,
      duration:30,
      minimumEnergy:10,
      minimumHunger:5,
      fitnessGain:1,
      effects:Object.freeze({ energy:2, fun:6, hygiene:-3 })
    }),
    Object.freeze({
      id:"cardio",
      name:"有酸素トレーニング",
      minimumFitness:0,
      cost:450,
      duration:45,
      minimumEnergy:20,
      minimumHunger:15,
      fitnessGain:1,
      effects:Object.freeze({ energy:-8, hunger:-5, hygiene:-9, fun:10 })
    }),
    Object.freeze({
      id:"strength",
      name:"筋力トレーニング",
      minimumFitness:5,
      cost:700,
      duration:60,
      minimumEnergy:30,
      minimumHunger:20,
      fitnessGain:2,
      effects:Object.freeze({ energy:-18, hunger:-12, hygiene:-18, fun:14 })
    })
  ]);

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function safeFitness(value) {
    return Math.max(0, Math.floor(safeNumber(value)));
  }

  function workoutReason(workout, fitness, cash, energy, hunger) {
    if (fitness < workout.minimumFitness) return "fitness-required";
    if (cash < workout.cost) return "insufficient-funds";
    if (energy < workout.minimumEnergy) return "too-tired";
    if (hunger < workout.minimumHunger) return "too-hungry";
    return null;
  }

  function listWorkouts(fitness, cash, energy, hunger) {
    const normalizedFitness = safeFitness(fitness);
    const normalizedCash = safeNumber(cash);
    const normalizedEnergy = safeNumber(energy);
    const normalizedHunger = safeNumber(hunger);
    return WORKOUTS.map((workout) => {
      const reason = workoutReason(workout, normalizedFitness, normalizedCash, normalizedEnergy, normalizedHunger);
      return { workout, available:reason === null, reason };
    });
  }

  function completeWorkout(fitness, cash, energy, hunger, workoutId) {
    const workout = WORKOUTS.find((value) => value.id === workoutId);
    if (!workout) return { ok:false, reason:"unknown-workout" };
    const normalizedFitness = safeFitness(fitness);
    const reason = workoutReason(
      workout,
      normalizedFitness,
      safeNumber(cash),
      safeNumber(energy),
      safeNumber(hunger)
    );
    if (reason) return { ok:false, reason };
    return {
      ok:true,
      workout,
      cashRemaining:safeNumber(cash) - workout.cost,
      fitness:normalizedFitness + workout.fitnessGain
    };
  }

  return Object.freeze({ WORKOUTS, listWorkouts, completeWorkout });
});
