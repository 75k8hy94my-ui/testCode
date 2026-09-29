(() => {
  "use strict";

  function showRuntimeError(detail) {
    const shell = document.getElementById("gameShell");
    if (!shell) return;
    let errorBox = shell.querySelector(".game-runtime-error");
    if (!errorBox) {
      errorBox = document.createElement("div");
      errorBox.className = "game-runtime-error";
      shell.appendChild(errorBox);
    }
    errorBox.textContent = "ゲームの実行中にエラーが発生しました。" + (detail ? " (" + detail + ")" : "");
  }

  window.addEventListener("error", (event) => {
    showRuntimeError(event.error?.message || event.message || "unknown error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    showRuntimeError(event.reason?.message || String(event.reason || "unknown rejection"));
  });

  const canvas = document.getElementById("gameCanvas");
  const canvasContext = typeof canvas.getContext === "function"
    ? canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d")
    : null;
  const ctx = canvasContext;
  const minimap = document.getElementById("minimap");
  const mctx = typeof minimap.getContext === "function" ? minimap.getContext("2d") : null;

  if (!ctx || !mctx) {
    showRuntimeError("Canvas API を利用できません。Canvas 対応ブラウザで再読み込みしてください。");
    return;
  }

  const requestFrame = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(() => callback(performance.now()), 16);

  const mapModel = globalThis.CityDaysMapModel?.createMapModel?.();
  const weatherSystem = globalThis.CityDaysWeatherSystem;
  const wardrobeModel = globalThis.CityDaysWardrobe;
  const mapErrors = mapModel ? mapModel.validate() : ["MapModel を読み込めません。"];
  if (!mapModel || mapErrors.length) {
    showRuntimeError(mapErrors.join(" / "));
    return;
  }

  if (!wardrobeModel?.createWardrobe || !wardrobeModel?.normalizeWardrobe || !wardrobeModel?.buyOutfit || !wardrobeModel?.equipOutfit || !wardrobeModel?.getOutfit) {
    showRuntimeError("Wardrobe を読み込めません。");
    return;
  }

  const carFuelModel = globalThis.CityDaysCarFuel;
  if (!carFuelModel?.normalizeFuel || !carFuelModel?.consumeFuel) {
    showRuntimeError("CarFuel を読み込めません。");
    return;
  }

  const communityCenterModel = globalThis.CityDaysCommunityCenter;
  if (
    !communityCenterModel?.getSession ||
    !communityCenterModel?.getCourseAvailability ||
    !communityCenterModel?.completeCourse ||
    !communityCenterModel?.getCitizenCourseOpportunity ||
    !communityCenterModel?.isCitizenCourseArrivalValid
  ) {
    showRuntimeError("CommunityCenter を読み込めません。");
    return;
  }

  const deliveryWorkModel = globalThis.DeliveryWork;
  if (!deliveryWorkModel?.normalizeProgress || !deliveryWorkModel?.listOffers || !deliveryWorkModel?.acceptDelivery || !deliveryWorkModel?.completeDelivery || !deliveryWorkModel?.cancelDelivery) {
    showRuntimeError("DeliveryWork を読み込めません。");
    return;
  }

  const communityGardenModel = globalThis.CommunityGarden;
  if (!communityGardenModel?.createProgress || !communityGardenModel?.normalizeProgress || !communityGardenModel?.advance || !communityGardenModel?.absoluteMinute || !communityGardenModel?.buySeedPack || !communityGardenModel?.plant || !communityGardenModel?.water || !communityGardenModel?.harvest || !communityGardenModel?.listPlotStatuses) {
    showRuntimeError("CommunityGarden を読み込めません。");
    return;
  }

  const petCompanionModel = globalThis.PetCompanion;
  if (!petCompanionModel?.createProgress || !petCompanionModel?.normalizeProgress || !petCompanionModel?.isShelterOpen || !petCompanionModel?.getCondition || !petCompanionModel?.adopt || !petCompanionModel?.buyFoodPack || !petCompanionModel?.advance || !petCompanionModel?.feed || !petCompanionModel?.play || !petCompanionModel?.cuddle) {
    showRuntimeError("PetCompanion を読み込めません。");
    return;
  }

  const petWalkModel = globalThis.CityDaysPetWalk;
  if (!petWalkModel?.createWalkState || !petWalkModel?.beginWalk || !petWalkModel?.recordPlayerPosition || !petWalkModel?.advanceFollower || !petWalkModel?.normalizeWalkState) {
    showRuntimeError("PetWalk を読み込めません。");
    return;
  }

  const parkFishingModel = globalThis.ParkFishingModel;
  if (!parkFishingModel?.createProgress || !parkFishingModel?.normalizeProgress || !parkFishingModel?.getFishingWindow || !parkFishingModel?.biteChance || !parkFishingModel?.buyBait || !parkFishingModel?.cast) {
    showRuntimeError("ParkFishing を読み込めません。");
    return;
  }

  const homeCookingModel = globalThis.CityDaysHomeCooking;
  if (!homeCookingModel?.listRecipes || !homeCookingModel?.cookMeal) {
    showRuntimeError("HomeCooking を読み込めません。");
    return;
  }

  const packedMealsModel = globalThis.CityDaysPackedMeals;
  if (!packedMealsModel?.createInventory || !packedMealsModel?.normalizeInventory || !packedMealsModel?.store || !packedMealsModel?.expire || !packedMealsModel?.eat) {
    showRuntimeError("PackedMeals を読み込めません。");
    return;
  }

  const homeCraftingModel = globalThis.CityDaysHomeCrafting;
  if (!homeCraftingModel?.createProgress || !homeCraftingModel?.normalizeProgress || !homeCraftingModel?.buyKitPack || !homeCraftingModel?.craft || !homeCraftingModel?.giveGift) {
    showRuntimeError("HomeCrafting を読み込めません。");
    return;
  }

  const libraryReadingModel = globalThis.CityDaysLibraryReading;
  if (!libraryReadingModel?.BOOKS || !libraryReadingModel?.createProgress || !libraryReadingModel?.normalizeProgress || !libraryReadingModel?.borrow || !libraryReadingModel?.readChapter || !libraryReadingModel?.returnBook) {
    showRuntimeError("LibraryReading を読み込めません。");
    return;
  }

  const homeTelevisionModel = globalThis.CityDaysHomeTelevision;
  if (!homeTelevisionModel?.getProgram || !homeTelevisionModel?.watch) {
    showRuntimeError("HomeTelevision を読み込めません。");
    return;
  }

  const gymTrainingModel = globalThis.CityDaysGymTraining;
  if (!gymTrainingModel?.listWorkouts || !gymTrainingModel?.completeWorkout) {
    showRuntimeError("GymTraining を読み込めません。");
    return;
  }

  const cafeWorkModel = globalThis.CityDaysCafeWork;
  if (!cafeWorkModel?.listShifts || !cafeWorkModel?.completeShift) {
    showRuntimeError("CafeWork を読み込めません。");
    return;
  }

  const publicBathModel = globalThis.CityDaysPublicBath;
  if (!publicBathModel?.listOptions || !publicBathModel?.completeBath) {
    showRuntimeError("PublicBath を読み込めません。");
    return;
  }

  const playerHealthModel = globalThis.CityDaysPlayerHealth;
  if (!playerHealthModel?.advanceHealth || !playerHealthModel?.listTreatments || !playerHealthModel?.completeTreatment || !playerHealthModel?.conditionFor) {
    showRuntimeError("PlayerHealth を読み込めません。");
    return;
  }

  const characterRenderer = globalThis.CityDaysCharacterRenderer;
  if (!characterRenderer?.createAppearance || !characterRenderer?.draw) {
    showRuntimeError("CharacterRenderer を読み込めません。");
    return;
  }

  const trafficOvertake = globalThis.CityDaysTrafficOvertake;
  if (!trafficOvertake?.plan) {
    showRuntimeError("TrafficOvertake を読み込めません。");
    return;
  }

  const areaNameEl = document.getElementById("areaName");
  const worldClockEl = document.getElementById("worldClock");
  const cashText = document.getElementById("cashText");
  const foodText = document.getElementById("foodText");
  const lifeStatus = document.getElementById("lifeStatus");
  const rentText = document.getElementById("rentText");
  const objectiveTitle = document.getElementById("objectiveTitle");
  const objectiveText = document.getElementById("objectiveText");
  const interactionPrompt = document.getElementById("interactionPrompt");
  const interactionText = document.getElementById("interactionText");
  const actionSheet = document.getElementById("actionSheet");
  const actionTitle = document.getElementById("actionTitle");
  const actionDescription = document.getElementById("actionDescription");
  const actionChoices = document.getElementById("actionChoices");
  const actionClose = document.getElementById("actionClose");
  const helpPanel = document.getElementById("helpPanel");
  const helpButton = document.getElementById("helpButton");
  const helpClose = document.getElementById("helpClose");
  const soundButton = document.getElementById("soundButton");
  const toast = document.getElementById("toast");
  const pausedOverlay = document.getElementById("pausedOverlay");
  const smartphoneToggle = document.getElementById("smartphoneToggle");
  const smartphonePanel = document.getElementById("smartphonePanel");
  const SMARTPHONE_REFRESH_INTERVAL = 0.25;
  let phoneSystem = null;
  let smartphoneRefreshElapsed = 0;
  const joystick = document.getElementById("joystick");
  const joystickKnob = document.getElementById("joystickKnob");
  const actionButton = document.getElementById("actionButton");
  const runButton = document.getElementById("runButton");
  const driveHud = document.getElementById("driveHud");
  const speedText = document.getElementById("speedText");
  const driveFuelText = document.getElementById("driveFuelText");
  const driveFuelBar = document.getElementById("driveFuelBar");
  const speedLimitText = document.getElementById("speedLimitText");
  const signalText = document.getElementById("signalText");
  const gapText = document.getElementById("gapText");
  const driveScoreText = document.getElementById("driveScoreText");
  const driveDestinationText = document.getElementById("driveDestinationText");
  const mobileDrivingControls = document.getElementById("mobileDrivingControls");
  const driveBrakeButton = document.getElementById("driveBrakeButton");
  const driveMenuButton = document.getElementById("driveMenuButton");
  const driveAccelButton = document.getElementById("driveAccelButton");

  const needEls = {
    hunger: [document.getElementById("hungerBar"), document.getElementById("hungerText")],
    energy: [document.getElementById("energyBar"), document.getElementById("energyText")],
    hygiene: [document.getElementById("hygieneBar"), document.getElementById("hygieneText")],
    social: [document.getElementById("socialBar"), document.getElementById("socialText")],
    fun: [document.getElementById("funBar"), document.getElementById("funText")],
    health: [document.getElementById("healthBar"), document.getElementById("healthText")]
  };

  const WORLD_SIZE = 10800;
  const COAST = 160;
  const ROAD_GAP = 600;
  const ROAD_WIDTH = 176;
  const ROAD_HALF = ROAD_WIDTH / 2;
  const CROSSWALK_OFFSET = ROAD_HALF + 22;
  const CROSSWALK_DEPTH = 28;
  const STOP_LINE_GAP = 10;
  const STOP_LINE_OFFSET = CROSSWALK_OFFSET + CROSSWALK_DEPTH / 2 + STOP_LINE_GAP;
  const STOP_LINE_CENTER_MARGIN = 8;
  const STOP_LINE_EDGE_MARGIN = 22;
  const VEHICLE_FRONT_OVERHANG = 38;
  const BLOCK_MARGIN = 34;
  const PLAYER_RADIUS = 14;
  const PLAYER_COLLISION_RADIUS = 11;
  const NPC_COLLISION_RADIUS = 6.5;
  const VEHICLE_COLLISION_SCALE = 0.9;
  const WALK_SPEED = 34;
  const RUN_SPEED = 62;
  const SPEED_TO_KMH = 0.16;
  const SIGNAL_CYCLE = 20;
  const PEDESTRIAN_FLASH_SECONDS = 2;
  const PEDESTRIAN_FLASH_INTERVAL = .34;
  const LANE_OFFSET = 38;
  const TURN_RADIUS = 86;
  const ROUTE_SAMPLE_STEP = 16;
  const RAIL_Y = mapModel.stations[1].y;
  const RAIL_MIN_X = ROAD_GAP * 1.5;
  const RAIL_MAX_X = WORLD_SIZE - ROAD_GAP * 1.5;
  const RAIL_TRACK_GAP = 23;
  const RAIL_CORRIDOR_HALF = 62;
  const TRAIN_SPEED = 300;
  const TRAIN_DWELL_SECONDS = 4.5;
  const TRAIN_LENGTH = 212;
  const TRAIN_WIDTH = 31;

  // Sparse Japanese-style street hierarchy. Arterials stay continuous while
  // local streets exist only as selected runs, producing T-junctions and fewer
  // intersections than the old full Manhattan grid.
  const EW_ARTERIALS = new Set([2, 6, 11, 16]);
  const NS_ARTERIALS = new Set([2, 7, 12, 17]);
  const LOCAL_H_RUNS = new Map([
    [4, [[2,7]]],
    [8, [[7,12]]],
    [9, [[7,12]]],
    [13, [[12,17]]]
  ]);
  const LOCAL_V_RUNS = new Map([
    [4, [[2,6]]],
    [5, [[6,11]]],
    [9, [[6,11]]],
    [10, [[6,11]]],
    [14, [[11,16]]],
    [15, [[11,16]]]
  ]);

  const WORLD_TILT_Y = 0.94;
  const WORLD_TILT_X = 1.025;
  const BUILDING_DEPTH_X = 0.18;
  const VISUAL_PALETTES = [
    { wall:"#c8b89c", roof:"#746f69", trim:"#e8dcc5", glass:"#8ba6ad" },
    { wall:"#b6b8b2", roof:"#61696a", trim:"#d8d9d3", glass:"#86a7b3" },
    { wall:"#c79e84", roof:"#725d58", trim:"#ead2bc", glass:"#83a0aa" },
    { wall:"#aaa8b6", roof:"#595967", trim:"#d7d3e2", glass:"#879cab" },
    { wall:"#b9aa8d", roof:"#6a6358", trim:"#ded3bd", glass:"#839faa" }
  ];
  const VEHICLE_TYPES = ["compact","sedan","suv","van"];
  const LEGACY_SAVE_KEY = "testCodeLifeSimSave:v1";
  const RENT = 12000;
  const keys = new Set();
  const buildings = [];
  const traffic = [];
  const junctionReservations = new Map();
  let trafficSimulationClock = 0;
  const pedestrians = [];
  const CITIZEN_COUNT = 76;
  const CITIZEN_GIVEN_NAMES_MALE = [
    "ハル","ユウ","ミナト","レン","マコト","ソウ","リク","カイ","トワ","コウ",
    "ケイ","ショウ","タクミ","レイ","アオ","ナオ"
  ];
  const CITIZEN_GIVEN_NAMES_FEMALE = [
    "リン","カナ","ヒナ","ユイ","ミオ","ナナ","サキ","ミサキ","チヒロ","ユナ",
    "ノゾミ","エマ","サラ","アキ","ハル","レイ"
  ];
  const CITIZEN_FAMILY_NAMES = [
    "佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤",
    "吉田","山田","佐々木","山口","松本","井上","木村","林","斎藤","清水"
  ];
  const CITIZEN_JOB_LABELS = {
    cafe:"カフェ勤務",
    retail:"スーパー勤務",
    gym:"ジム勤務",
    library:"図書館勤務",
    office:"会社員",
    student:"学生",
    freelance:"フリーランス",
    retired:"無職・退職"
  };
  const CITIZEN_ACTIVITY_LABELS = {
    commute_work:"出勤中",
    work:"勤務中",
    sleep:"睡眠",
    eat_home:"自宅で食事",
    shop:"買い物",
    eat_out:"外食",
    park:"公園で休憩",
    gym:"運動",
    library:"読書・勉強",
    community_class:"コミュニティ講座",
    socialize:"交流",
    home_idle:"自宅で休息"
  };
  const touch = { x: 0, y: 0, run: false, driveAccel: false, driveBrake: false, pointerId: null };

  const audioState = {
    enabled:true,
    supported:true,
    context:null,
    master:null,
    noiseBuffer:null,
    engineOsc:null,
    engineHarmonic:null,
    engineGain:null,
    engineFilter:null,
    roadLayer:null,
    rainLayer:null,
    ambientLayer:null,
    brakeLayer:null,
    npcOsc:null,
    npcGain:null,
    npcFilter:null,
    trainOsc:null,
    trainGain:null,
    trainFilter:null,
    footstepTimer:0,
    footstepIndex:0
  };

  function updateSoundButton() {
    if (!soundButton) return;
    if (!audioState.supported) {
      soundButton.textContent = "音 —";
      soundButton.disabled = true;
      soundButton.setAttribute("aria-pressed", "false");
      soundButton.title = "このブラウザでは音声を利用できません";
      return;
    }
    soundButton.disabled = false;
    soundButton.textContent = audioState.enabled ? "音 ON" : "音 OFF";
    soundButton.setAttribute("aria-pressed", audioState.enabled ? "true" : "false");
    soundButton.title = audioState.enabled ? "音声をオフにする" : "音声をオンにする";
  }

  function smoothAudioParam(param, value, timeConstant = .08) {
    const audioContext = audioState.context;
    if (!audioContext || !param) return;
    const now = audioContext.currentTime;
    try {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, Math.max(.01, timeConstant));
    } catch (_) {
      param.value = value;
    }
  }

  function createGameNoiseBuffer(audioContext) {
    const duration = 2;
    const frameCount = Math.floor(audioContext.sampleRate * duration);
    const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * .22 + white * .78;
      data[i] = last;
    }
    return buffer;
  }

  function createNoiseLayer(audioContext, type, frequency, q = .7) {
    const source = audioContext.createBufferSource();
    source.buffer = audioState.noiseBuffer;
    source.loop = true;

    const filter = audioContext.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const gain = audioContext.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioState.master);
    source.start();

    return { source, filter, gain };
  }

  function initGameAudio() {
    if (audioState.context) return true;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      audioState.supported = false;
      updateSoundButton();
      return false;
    }

    try {
      const audioContext = new AudioContextCtor({ latencyHint:"interactive" });
      audioState.context = audioContext;
      audioState.master = audioContext.createGain();
      audioState.master.gain.value = 0;
      audioState.master.connect(audioContext.destination);
      audioState.noiseBuffer = createGameNoiseBuffer(audioContext);

      const engineFilter = audioContext.createBiquadFilter();
      engineFilter.type = "lowpass";
      engineFilter.frequency.value = 520;
      engineFilter.Q.value = .55;
      const engineGain = audioContext.createGain();
      engineGain.gain.value = 0;
      const engineOsc = audioContext.createOscillator();
      engineOsc.type = "sawtooth";
      engineOsc.frequency.value = 52;
      const engineHarmonic = audioContext.createOscillator();
      engineHarmonic.type = "triangle";
      engineHarmonic.frequency.value = 104;
      engineOsc.connect(engineFilter);
      engineHarmonic.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(audioState.master);
      engineOsc.start();
      engineHarmonic.start();
      audioState.engineOsc = engineOsc;
      audioState.engineHarmonic = engineHarmonic;
      audioState.engineGain = engineGain;
      audioState.engineFilter = engineFilter;

      audioState.roadLayer = createNoiseLayer(audioContext, "bandpass", 390, .55);
      audioState.rainLayer = createNoiseLayer(audioContext, "bandpass", 3300, .28);
      audioState.ambientLayer = createNoiseLayer(audioContext, "lowpass", 310, .45);
      audioState.brakeLayer = createNoiseLayer(audioContext, "bandpass", 1350, 2.4);

      audioState.npcFilter = audioContext.createBiquadFilter();
      audioState.npcFilter.type = "lowpass";
      audioState.npcFilter.frequency.value = 360;
      audioState.npcGain = audioContext.createGain();
      audioState.npcGain.gain.value = 0;
      audioState.npcOsc = audioContext.createOscillator();
      audioState.npcOsc.type = "sawtooth";
      audioState.npcOsc.frequency.value = 58;
      audioState.npcOsc.connect(audioState.npcFilter);
      audioState.npcFilter.connect(audioState.npcGain);
      audioState.npcGain.connect(audioState.master);
      audioState.npcOsc.start();

      audioState.trainFilter = audioContext.createBiquadFilter();
      audioState.trainFilter.type = "lowpass";
      audioState.trainFilter.frequency.value = 310;
      audioState.trainGain = audioContext.createGain();
      audioState.trainGain.gain.value = 0;
      audioState.trainOsc = audioContext.createOscillator();
      audioState.trainOsc.type = "triangle";
      audioState.trainOsc.frequency.value = 46;
      audioState.trainOsc.connect(audioState.trainFilter);
      audioState.trainFilter.connect(audioState.trainGain);
      audioState.trainGain.connect(audioState.master);
      audioState.trainOsc.start();

      updateSoundButton();
      return true;
    } catch (error) {
      console.warn("Web Audio initialization failed", error);
      audioState.supported = false;
      audioState.context = null;
      updateSoundButton();
      return false;
    }
  }

  async function unlockGameAudio() {
    if (!initGameAudio()) return false;
    const audioContext = audioState.context;
    if (!audioContext) return false;
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (_) {
        return false;
      }
    }
    return audioContext.state === "running";
  }

  function setSoundEnabled(enabled) {
    audioState.enabled = Boolean(enabled);
    updateSoundButton();
    if (audioState.master && audioState.context) {
      smoothAudioParam(audioState.master.gain, audioState.enabled ? .58 : 0, .025);
    }
  }

  function playUiTick() {
    const audioContext = audioState.context;
    if (!audioContext || audioContext.state !== "running" || !audioState.enabled) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(.018, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .045);
    oscillator.connect(gain);
    gain.connect(audioState.master);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + .05);
  }

  function playFootstep(running = false) {
    const audioContext = audioState.context;
    if (
      !audioContext ||
      audioContext.state !== "running" ||
      !audioState.enabled ||
      !audioState.noiseBuffer
    ) return;

    const now = audioContext.currentTime;
    const alternate = audioState.footstepIndex % 2;
    const strength = running ? 1.32 : 1;

    // Short mid/high-frequency contact gives the shoe strike enough presence
    // to remain audible over traffic and ambience.
    const contact = audioContext.createBufferSource();
    contact.buffer = audioState.noiseBuffer;
    contact.playbackRate.value = (running ? 1.08 : .94) + alternate * .07;

    const contactFilter = audioContext.createBiquadFilter();
    contactFilter.type = "bandpass";
    contactFilter.frequency.value = (running ? 760 : 620) + alternate * 110;
    contactFilter.Q.value = .85;

    const contactGain = audioContext.createGain();
    contactGain.gain.setValueAtTime(.082 * strength, now);
    contactGain.gain.exponentialRampToValueAtTime(.0001, now + (running ? .095 : .115));

    contact.connect(contactFilter);
    contactFilter.connect(contactGain);
    contactGain.connect(audioState.master);

    // A small low thump makes the step feel like weight hitting pavement,
    // rather than only a hiss/click from the noise layer.
    const thump = audioContext.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(running ? 118 : 102, now);
    thump.frequency.exponentialRampToValueAtTime(running ? 72 : 66, now + .075);

    const thumpGain = audioContext.createGain();
    thumpGain.gain.setValueAtTime((running ? .07 : .048), now);
    thumpGain.gain.exponentialRampToValueAtTime(.0001, now + .09);

    thump.connect(thumpGain);
    thumpGain.connect(audioState.master);

    const offset = (audioState.footstepIndex * .173) % 1.8;
    contact.start(now, offset, running ? .11 : .13);
    contact.stop(now + .14);
    thump.start(now);
    thump.stop(now + .095);

    audioState.footstepIndex += 1;
  }

  function nearestMovingTraffic(actor) {
    let best = null;
    for (const car of traffic) {
      if ((car.speed || 0) < 4) continue;
      const d = distance(actor.x, actor.y, car.x, car.y);
      if (!best || d < best.distance) best = { car, distance:d };
    }
    return best;
  }

  function nearestTrainSound(actor) {
    let best = null;
    for (const train of trains) {
      const d = distance(actor.x, actor.y, train.x, train.y);
      if (!best || d < best.distance) best = { train, distance:d };
    }
    return best;
  }

  function updateGameAudio(dt) {
    const audioContext = audioState.context;
    if (!audioContext) return;

    const quiet = !audioState.enabled ||
      state.paused ||
      !actionSheet.hidden ||
      !helpPanel.hidden ||
      document.hidden;
    smoothAudioParam(audioState.master.gain, quiet ? 0 : .58, quiet ? .04 : .12);
    if (quiet || audioContext.state !== "running") return;

    const accelerating = state.player.inVehicle &&
      (touch.driveAccel || keys.has("w") || keys.has("arrowup"));
    const braking = state.player.inVehicle &&
      (touch.driveBrake || keys.has("s") || keys.has("arrowdown") || keys.has(" "));
    const carSpeedRatio = clamp(personalCar.speed / 390, 0, 1);

    const engineGain = state.player.inVehicle
      ? .014 + carSpeedRatio * .034 + (accelerating ? .01 : 0)
      : 0;
    const engineFrequency = 50 + carSpeedRatio * 118 + (accelerating ? 14 : 0);
    smoothAudioParam(audioState.engineGain.gain, engineGain, .055);
    smoothAudioParam(audioState.engineOsc.frequency, engineFrequency, .045);
    smoothAudioParam(audioState.engineHarmonic.frequency, engineFrequency * 2.03, .045);
    smoothAudioParam(audioState.engineFilter.frequency, 430 + carSpeedRatio * 520, .08);

    const roadGain = state.player.inVehicle
      ? Math.pow(carSpeedRatio, 1.35) * .045
      : 0;
    smoothAudioParam(audioState.roadLayer.gain.gain, roadGain, .08);
    smoothAudioParam(audioState.roadLayer.filter.frequency, 300 + carSpeedRatio * 520, .09);

    const brakeGain = braking && personalCar.speed > 34
      ? .008 + carSpeedRatio * .018
      : 0;
    smoothAudioParam(audioState.brakeLayer.gain.gain, brakeGain, .035);
    smoothAudioParam(audioState.brakeLayer.filter.frequency, 1050 + carSpeedRatio * 900, .05);

    const actor = actorPosition();
    const nearbyTraffic = nearestMovingTraffic(actor);
    if (nearbyTraffic && nearbyTraffic.distance < 950) {
      const attenuation = Math.pow(clamp(1 - nearbyTraffic.distance / 950, 0, 1), 1.5);
      const speedRatio = clamp((nearbyTraffic.car.speed || 0) / 300, 0, 1);
      smoothAudioParam(audioState.npcGain.gain, attenuation * (.007 + speedRatio * .023) * (state.player.inHome ? .18 : 1), .12);
      smoothAudioParam(audioState.npcOsc.frequency, 52 + speedRatio * 86, .12);
      smoothAudioParam(audioState.npcFilter.frequency, 270 + speedRatio * 330, .12);
    } else {
      smoothAudioParam(audioState.npcGain.gain, 0, .14);
    }

    const nearbyTrain = nearestTrainSound(actor);
    if (nearbyTrain) {
      const inThisTrain = state.player.inTrain && nearbyTrain.train.id === state.player.trainId;
      const attenuation = inThisTrain
        ? 1
        : Math.pow(clamp(1 - nearbyTrain.distance / 1700, 0, 1), 1.35);
      const speedRatio = clamp((nearbyTrain.train.speed || 0) / TRAIN_SPEED, 0, 1);
      const trainGain = attenuation * (inThisTrain ? .042 : (.004 + speedRatio * .032));
      smoothAudioParam(audioState.trainGain.gain, trainGain, .14);
      smoothAudioParam(audioState.trainOsc.frequency, 43 + speedRatio * 46, .13);
      smoothAudioParam(audioState.trainFilter.frequency, 230 + speedRatio * 260, .14);
    } else {
      smoothAudioParam(audioState.trainGain.gain, 0, .16);
    }

    const raining = state.visual.weather === "rain";
    smoothAudioParam(audioState.rainLayer.gain.gain, raining ? (state.player.inHome ? .012 : .052) : 0, .3);
    smoothAudioParam(audioState.ambientLayer.gain.gain, state.player.inHome ? .003 : (raining ? .007 : .009), .35);

    const movingOnFoot = !state.player.inVehicle &&
      !state.player.inTrain &&
      (
        Math.abs(touch.x) > .08 ||
        Math.abs(touch.y) > .08 ||
        keys.has("w") ||
        keys.has("a") ||
        keys.has("s") ||
        keys.has("d") ||
        keys.has("arrowup") ||
        keys.has("arrowdown") ||
        keys.has("arrowleft") ||
        keys.has("arrowright")
      );
    if (movingOnFoot) {
      const runningOnFoot = touch.run || keys.has("shift");
      audioState.footstepTimer -= dt;
      if (audioState.footstepTimer <= 0) {
        playFootstep(runningOnFoot);
        audioState.footstepTimer = runningOnFoot ? .24 : .39;
      }
    } else {
      audioState.footstepTimer = 0;
    }
  }

  function signalCyclePhaseAt(worldX, worldY) {
    const gx = Math.round(worldX / ROAD_GAP);
    const gy = Math.round(worldY / ROAD_GAP);
    const intersectionOffset = ((gx * 7 + gy * 11) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
    return ((state.drive.signalClock + intersectionOffset) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  }

  function signalStateAt(worldX, worldY, orientation) {
    const phase = signalCyclePhaseAt(worldX, worldY);
    const horizontal = orientation === "h";
    if (horizontal) {
      if (phase < 8) return "green";
      if (phase < 10) return "yellow";
      return "red";
    }
    if (phase < 10) return "red";
    if (phase < 18) return "green";
    if (phase < SIGNAL_CYCLE) return "yellow";
    return "red";
  }

  function pedestrianSignalAt(worldX, worldY, orientation) {
    const phase = signalCyclePhaseAt(worldX, worldY);
    const horizontal = orientation === "h";
    const greenStart = horizontal ? 0 : 10;
    const greenEnd = horizontal ? 8 : 18;

    if (phase < greenStart || phase >= greenEnd) {
      return { state:"stop", lit:false, phase };
    }

    const flashStart = greenEnd - PEDESTRIAN_FLASH_SECONDS;
    if (phase < flashStart) {
      return { state:"walk", lit:true, phase };
    }

    const flashElapsed = phase - flashStart;
    const lit = Math.floor(flashElapsed / PEDESTRIAN_FLASH_INTERVAL) % 2 === 0;
    return { state:"flashing", lit, phase };
  }

  function blockCenter(gx, gy) {
    return { x: gx * ROAD_GAP + ROAD_GAP / 2, y: gy * ROAD_GAP + ROAD_GAP / 2 };
  }

  const placeForGame = (place) => ({
    ...place,
    gx: Math.round(place.x / ROAD_GAP),
    gy: Math.round(place.y / ROAD_GAP)
  });
  const PLACES = mapModel.places.map(placeForGame);
  const HOME = PLACES.find((place) => place.id === "home");
  const CAFE = PLACES.find((place) => place.id === "cafe");
  const STORE = PLACES.find((place) => place.id === "store");
  const PARK = PLACES.find((place) => place.id === "park");
  const GYM = PLACES.find((place) => place.id === "gym");
  const LIBRARY = PLACES.find((place) => place.id === "library");
  const SPECIAL_BLOCKS = new Set(PLACES.map((place) => place.gx + "," + place.gy));

  const HOME_INTERIOR = { width:780, height:500 };
  const HOME_FIXTURES = [
    { id:"bed", label:"ベッド", x:62, y:60, w:190, h:112, interactX:260, interactY:125, range:72 },
    { id:"shower", label:"シャワー", x:70, y:318, w:118, h:118, interactX:208, interactY:372, range:68 },
    { id:"kitchen", label:"キッチン", x:510, y:55, w:205, h:82, interactX:505, interactY:153, range:78 },
    { id:"worktable", label:"作業机", x:176, y:194, w:104, h:62, interactX:228, interactY:268, range:70 },
    { id:"closet", label:"クローゼット", x:42, y:182, w:112, h:78, interactX:140, interactY:278, range:58 },
    { id:"pet", label:"ペット", x:530, y:188, w:132, h:74, interactX:474, interactY:232, range:72 },
    { id:"sofa", label:"ソファ", x:510, y:330, w:205, h:74, interactX:500, interactY:365, range:74 },
    { id:"tv", label:"テレビ", x:520, y:392, w:155, h:70, interactX:475, interactY:425, range:72 },
    { id:"exit", label:"玄関", x:356, y:455, w:68, h:25, interactX:390, interactY:438, range:62 }
  ];
  const HOME_OBSTACLES = [
    ...HOME_FIXTURES.filter((fixture) => fixture.id !== "exit").map((fixture) => ({
      x:fixture.x,
      y:fixture.y,
      w:fixture.w,
      h:fixture.h
    })),
    { x:326, y:88, w:128, h:78 },
    { x:294, y:276, w:168, h:82 }
  ];

  const TRAIN_STATIONS = mapModel.stations.map((station) => ({ ...station }));

  const trains = [
    {
      id:"local-a",
      name:"若葉線 A",
      x:TRAIN_STATIONS[1].x,
      y:RAIL_Y - RAIL_TRACK_GAP,
      stationIndex:1,
      targetIndex:2,
      direction:1,
      dwell:TRAIN_DWELL_SECONDS,
      speed:0
    },
    {
      id:"local-b",
      name:"若葉線 B",
      x:TRAIN_STATIONS[2].x,
      y:RAIL_Y + RAIL_TRACK_GAP,
      stationIndex:2,
      targetIndex:1,
      direction:-1,
      dwell:TRAIN_DWELL_SECONDS * .45,
      speed:0
    }
  ];

  // Fictional compressed city layout inspired by the spatial mix around Kichijoji:
  // dense station frontage, shopping streets, tiny dining alleys, quieter housing,
  // and a large green zone. Exact streets/names are intentionally not reproduced.
  const CITY_CORE = { minGX: 5, maxGX: 11, minGY: 4, maxGY: 10 };
  const STATION_BLOCKS = new Set(["7,5","8,5","9,5","8,6"]);
  const ARCADE_BLOCKS = new Set(["6,5","6,6","7,6","6,7","7,7"]);
  const ALLEY_BLOCKS = new Set(["9,6","10,5","10,6","9,7","10,7"]);
  const RESIDENTIAL_BLOCKS = new Set([
    "4,7","4,8","4,9","5,7","5,8","5,9","5,10","6,9","6,10",
    "10,8","10,9","10,10","11,8","11,9"
  ]);
  const GREEN_EDGE_BLOCKS = new Set(["7,9","8,9","9,9","7,10","8,10","9,10"]);

  function cityBlockStyle(gx, gy) {
    const key = gx + "," + gy;
    if (STATION_BLOCKS.has(key)) return "station";
    if (ARCADE_BLOCKS.has(key)) return "arcade";
    if (ALLEY_BLOCKS.has(key)) return "alley";
    if (GREEN_EDGE_BLOCKS.has(key)) return "green";
    if (RESIDENTIAL_BLOCKS.has(key)) return "residential";
    if (gx >= CITY_CORE.minGX && gx <= CITY_CORE.maxGX && gy >= CITY_CORE.minGY && gy <= CITY_CORE.maxGY) return "mixed-core";
    return "outer";
  }

  function residentialBlockPlan(gx, gy, left, top, bw, bh) {
    const vertical = hash2(gx, gy, 1600) > .43;
    const roadWidth = 32 + Math.floor(hash2(gx, gy, 1601) * 9);
    const roadBias = .40 + hash2(gx, gy, 1602) * .20;
    const through = hash2(gx, gy, 1603) > .26;
    const branch = hash2(gx, gy, 1604) > .54;
    const branchSide = hash2(gx, gy, 1605) > .5 ? 1 : -1;
    const branchRatio = .34 + hash2(gx, gy, 1606) * .32;
    const houses = [];
    const yards = [];
    const parkingPads = [];
    const driveways = [];
    const lotLines = [];

    const roadCenter = vertical
      ? left + bw * roadBias
      : top + bh * roadBias;
    const roadStart = vertical ? top - BLOCK_MARGIN - 8 : left - BLOCK_MARGIN - 8;
    const roadEnd = vertical
      ? (through ? top + bh + BLOCK_MARGIN + 8 : top + bh * (.78 + hash2(gx, gy, 1607) * .1))
      : (through ? left + bw + BLOCK_MARGIN + 8 : left + bw * (.78 + hash2(gx, gy, 1607) * .1));

    const frontageStart = vertical ? top + 8 : left + 8;
    const frontageEnd = vertical ? top + bh - 8 : left + bw - 8;
    const frontageLength = frontageEnd - frontageStart;
    const branchAt = frontageStart + frontageLength * branchRatio;

    function makeSideLots(side, seedBase) {
      const sideAvailable = vertical
        ? (side < 0 ? roadCenter - roadWidth / 2 - left : left + bw - (roadCenter + roadWidth / 2))
        : (side < 0 ? roadCenter - roadWidth / 2 - top : top + bh - (roadCenter + roadWidth / 2));

      if (sideAvailable < 76) return;

      const count = 2 + Math.floor(hash2(gx + side, gy, seedBase) * 2.99);
      const weights = [];
      let totalWeight = 0;
      for (let i = 0; i < count; i += 1) {
        const w = .78 + hash2(gx + i * 3, gy + side * 5, seedBase + 11 + i) * .55;
        weights.push(w);
        totalWeight += w;
      }

      let cursor = frontageStart;
      for (let i = 0; i < count; i += 1) {
        const lotSpan = frontageLength * (weights[i] / totalWeight);
        const lotStart = cursor;
        const lotEnd = i === count - 1 ? frontageEnd : cursor + lotSpan;
        cursor = lotEnd;

        // Leave room where a side street branches on this frontage.
        const branchHalfWidth = roadWidth * .78 / 2 + 8;
        if (
          branch &&
          side === branchSide &&
          lotStart < branchAt + branchHalfWidth &&
          lotEnd > branchAt - branchHalfWidth
        ) continue;

        const sideGap = 5 + hash2(gx + i, gy + side, seedBase + 30) * 7;
        const rearGap = 7 + hash2(gx + i, gy + side, seedBase + 31) * 12;
        const frontSetback = 12 + hash2(gx + i, gy + side, seedBase + 32) * 24;
        const frontageMargin = 5 + hash2(gx + i, gy + side, seedBase + 33) * 8;
        const lotAlong = Math.max(58, lotEnd - lotStart - 5);
        const houseAlong = clamp(lotAlong - frontageMargin * 2, 44, 112);
        const maxDepth = Math.max(48, sideAvailable - sideGap - rearGap - frontSetback);
        const houseDepth = clamp(
          48 + hash2(gx + i, gy + side, seedBase + 34) * 34,
          44,
          maxDepth
        );

        let x;
        let y;
        let w;
        let h;
        let frontage;

        if (vertical) {
          w = houseDepth;
          h = houseAlong;
          y = lotStart + frontageMargin;
          if (side < 0) {
            x = roadCenter - roadWidth / 2 - frontSetback - w;
            frontage = "east";
          } else {
            x = roadCenter + roadWidth / 2 + frontSetback;
            frontage = "west";
          }
        } else {
          w = houseAlong;
          h = houseDepth;
          x = lotStart + frontageMargin;
          if (side < 0) {
            y = roadCenter - roadWidth / 2 - frontSetback - h;
            frontage = "south";
          } else {
            y = roadCenter + roadWidth / 2 + frontSetback;
            frontage = "north";
          }
        }

        if (branch && side === branchSide) {
          const branchHalfWidth = roadWidth * .78 / 2 + 8;
          const crossesBranch = vertical
            ? (y < branchAt + branchHalfWidth && y + h > branchAt - branchHalfWidth)
            : (x < branchAt + branchHalfWidth && x + w > branchAt - branchHalfWidth);
          if (crossesBranch) continue;
        }

        const smallApartment = hash2(gx + i * 7, gy + side * 9, seedBase + 35) > .91 && lotAlong > 92;
        const houseStyle = smallApartment
          ? "small-apartment"
          : hash2(gx + i, gy + side, seedBase + 36) > .54
            ? "gable"
            : "hipped";

        houses.push({
          x, y, w, h, frontage, houseStyle,
          floors: smallApartment ? 3 : (hash2(gx + i, gy + side, seedBase + 37) > .2 ? 2 : 1),
          paletteShift: Math.floor(hash2(gx + i, gy + side, seedBase + 38) * VISUAL_PALETTES.length),
          seed: seedBase + i * 13 + side * 3
        });

        // A small front parking slab or bicycle/car space is common but not universal.
        if (hash2(gx + i, gy + side, seedBase + 39) > .34) {
          if (vertical) {
            const padW = Math.min(30, frontSetback - 4);
            const padH = Math.min(36, houseAlong * .38);
            parkingPads.push({
              x: side < 0 ? x + w + 4 : roadCenter + roadWidth / 2 + 4,
              y: y + 4 + hash2(gx + i, gy + side, seedBase + 40) * Math.max(0, h - padH - 8),
              w: padW,
              h: padH,
              vertical: true
            });
          } else {
            const padH = Math.min(30, frontSetback - 4);
            const padW = Math.min(36, houseAlong * .38);
            parkingPads.push({
              x: x + 4 + hash2(gx + i, gy + side, seedBase + 40) * Math.max(0, w - padW - 8),
              y: side < 0 ? y + h + 4 : roadCenter + roadWidth / 2 + 4,
              w: padW,
              h: padH,
              vertical: false
            });
          }
        }

        // Small garden/backyard strip.
        if (hash2(gx + i, gy + side, seedBase + 41) > .28) {
          if (vertical) {
            yards.push({
              x: side < 0 ? left + 4 : x + w + 5,
              y: y + 4,
              w: Math.max(10, side < 0 ? x - left - 8 : left + bw - (x + w) - 9),
              h: Math.max(20, h - 8)
            });
          } else {
            yards.push({
              x: x + 4,
              y: side < 0 ? top + 4 : y + h + 5,
              w: Math.max(20, w - 8),
              h: Math.max(10, side < 0 ? y - top - 8 : top + bh - (y + h) - 9)
            });
          }
        }

        // Irregular lot boundary hints; not every boundary is fenced.
        if (hash2(gx + i, gy + side, seedBase + 42) > .44) {
          lotLines.push({
            vertical: !vertical,
            x1: vertical ? (side < 0 ? left + 4 : roadCenter + roadWidth / 2 + 4) : lotEnd,
            y1: vertical ? lotEnd : (side < 0 ? top + 4 : roadCenter + roadWidth / 2 + 4),
            x2: vertical ? (side < 0 ? roadCenter - roadWidth / 2 - 4 : left + bw - 4) : lotEnd,
            y2: vertical ? lotEnd : (side < 0 ? roadCenter - roadWidth / 2 - 4 : top + bh - 4)
          });
        }
      }
    }

    makeSideLots(-1, 1620);
    makeSideLots(1, 1680);

    // One occasional flag lot: narrow access strip to a house behind a frontage lot.
    if (hash2(gx, gy, 1740) > .58) {
      const side = hash2(gx, gy, 1741) > .5 ? 1 : -1;
      const sideAvailable = vertical
        ? (side < 0 ? roadCenter - roadWidth / 2 - left : left + bw - (roadCenter + roadWidth / 2))
        : (side < 0 ? roadCenter - roadWidth / 2 - top : top + bh - (roadCenter + roadWidth / 2));
      if (sideAvailable > 125) {
        const along = frontageStart + frontageLength * (.18 + hash2(gx, gy, 1742) * .58);
        const accessWidth = 12;
        if (vertical) {
          const hx = side < 0 ? left + 10 : left + bw - 72;
          const hy = clamp(along - 30, top + 12, top + bh - 72);
          const candidate = {
            x: hx, y: hy, w: 62, h: 58,
            frontage: side < 0 ? "east" : "west",
            houseStyle: "flag-lot",
            floors: 2,
            paletteShift: Math.floor(hash2(gx, gy, 1743) * VISUAL_PALETTES.length),
            seed: 1744
          };
          const blockedByHouse = houses.some((house) =>
            candidate.x < house.x + house.w + 6 &&
            candidate.x + candidate.w + 6 > house.x &&
            candidate.y < house.y + house.h + 6 &&
            candidate.y + candidate.h + 6 > house.y
          );
          const branchHalfWidth = roadWidth * .78 / 2 + 8;
          const blockedByBranch =
            branch &&
            side === branchSide &&
            candidate.y < branchAt + branchHalfWidth &&
            candidate.y + candidate.h > branchAt - branchHalfWidth;
          if (!blockedByHouse && !blockedByBranch) {
            houses.push(candidate);
            driveways.push({
              x: side < 0 ? hx + 62 : roadCenter + roadWidth / 2,
              y: hy + 23,
              w: Math.max(12, side < 0 ? roadCenter - roadWidth / 2 - (hx + 62) : hx - (roadCenter + roadWidth / 2)),
              h: accessWidth
            });
          }
        } else {
          const hx = clamp(along - 30, left + 12, left + bw - 72);
          const hy = side < 0 ? top + 10 : top + bh - 68;
          const candidate = {
            x: hx, y: hy, w: 62, h: 58,
            frontage: side < 0 ? "south" : "north",
            houseStyle: "flag-lot",
            floors: 2,
            paletteShift: Math.floor(hash2(gx, gy, 1743) * VISUAL_PALETTES.length),
            seed: 1744
          };
          const blockedByHouse = houses.some((house) =>
            candidate.x < house.x + house.w + 6 &&
            candidate.x + candidate.w + 6 > house.x &&
            candidate.y < house.y + house.h + 6 &&
            candidate.y + candidate.h + 6 > house.y
          );
          const branchHalfWidth = roadWidth * .78 / 2 + 8;
          const blockedByBranch =
            branch &&
            side === branchSide &&
            candidate.x < branchAt + branchHalfWidth &&
            candidate.x + candidate.w > branchAt - branchHalfWidth;
          if (!blockedByHouse && !blockedByBranch) {
            houses.push(candidate);
            driveways.push({
              x: hx + 24,
              y: side < 0 ? hy + 58 : roadCenter + roadWidth / 2,
              w: accessWidth,
              h: Math.max(12, side < 0 ? roadCenter - roadWidth / 2 - (hy + 58) : hy - (roadCenter + roadWidth / 2))
            });
          }
        }
      }
    }

    return {
      vertical,
      roadWidth,
      roadCenter,
      roadStart,
      roadEnd,
      through,
      branch,
      branchSide,
      branchAt,
      houses,
      yards,
      parkingPads,
      driveways,
      lotLines
    };
  }

  const socialNpcSystem = globalThis.CityDaysSocialNpcSystem;
  const socialNpcState = socialNpcSystem.createInitialState();
  const SOCIAL_NPC_SPAWN_NODES = Object.freeze({ aoi:"park-entrance", sora:"cafe-entrance", mei:"library-entrance" });
  const SOCIAL_NPC_SPAWN_ANCHORS = Object.freeze({
    aoi: { x:PARK.x - 60, y:PARK.y },
    sora: { x:CAFE.x + 72, y:CAFE.y - 58 },
    mei: { x:LIBRARY.x, y:LIBRARY.y - 45 }
  });
  const NPCS = socialNpcSystem.catalog.map((profile, index) => ({
    ...profile,
    ...(SOCIAL_NPC_SPAWN_ANCHORS[profile.id] || { x:HOME.x, y:HOME.y }),
    citizenId: "citizen-" + String(index + 1).padStart(3, "0"),
    friendship:socialNpcState.friendship[profile.id],
    hidden:false
  }));

  const personalCar = {
    x: 9 * ROAD_GAP + LANE_OFFSET,
    y: HOME.y,
    angle: Math.PI / 2,
    speed: 0,
    fuelLiters: carFuelModel.INITIAL_FUEL_LITERS,
    portableCanCount: 0,
    color: "#6f8fac"
  };

  let viewWidth = window.innerWidth;
  let viewHeight = window.innerHeight;
  let dpr = 1;
  let lastFrame = performance.now();
  let actionQueued = false;
  let toastTimer = 0;
  let autosaveTimer = 0;
  let umbrellaDrawCount = 0;

  const state = {
    player: {
      x: HOME.x,
      y: HOME.y,
      facingX: 0,
      facingY: 1,
      inVehicle: false,
      inTrain: false,
      trainId: null,
      inHome: false,
      homeX: HOME_INTERIOR.width / 2,
      homeY: HOME_INTERIOR.height - 76,
      outdoorHomeX: HOME.x,
      outdoorHomeY: HOME.y
    },
    camera: { x: HOME.x - viewWidth / 2, y: HOME.y - viewHeight / 2 },
    day: 1,
    minute: 8 * 60,
    cash: 8000,
    wardrobe:wardrobeModel.createWardrobe(),
    umbrellaOwned:false,
    groceries: 2,
    fitness: 0,
    libraryVisits: 0,
    communityCenter:communityCenterModel.normalizeProgress(null),
    libraryReading:libraryReadingModel.createProgress(),
    deliveryWork:deliveryWorkModel.createProgress(),
    garden:communityGardenModel.createProgress(),
    petCompanion:petCompanionModel.createProgress(),
    petWalk:petWalkModel.createWalkState(),
    fishing:parkFishingModel.createProgress(),
    packedMeals:packedMealsModel.createInventory(),
    homeCrafting:homeCraftingModel.createProgress(),
    shiftsWorked: 0,
    lastShiftDay: 0,
    needs: {
      hunger: 75,
      energy: 85,
      hygiene: 80,
      social: 65,
      fun: 70,
      health: 100
    },
    visual: {
      weather: "clear",
      weatherClock: 0,
      weatherDuration: 42,
      rainPhase: 0,
      cameraLeadX: 0,
      cameraLeadY: 0,
      cameraLagX: 0,
      cameraLagY: 0
    },
    phone: {
      waypoint: null,
      friendWaypointId: null
    },
    drive: {
      route: [],
      routeIndex: 0,
      signals: [],
      destination: null,
      score: 100,
      rating: 100,
      trips: 0,
      signalClock: 0,
      speedingTimer: 0,
      gapTimer: 0,
      collisionCooldown: 0,
      violationKeys: new Set()
    },
    paused: false
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(ax, ay, bx, by) {
    if (typeof ax === "object" && typeof ay === "object") {
      return Math.hypot(ax.x - ay.x, ax.y - ay.y);
    }
    return Math.hypot(ax - bx, ay - by);
  }

  function hash2(x, y, seed = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function segmentInRuns(runs, segmentIndex) {
    if (!runs) return false;
    return runs.some(([start, end]) => segmentIndex >= start && segmentIndex < end);
  }

  function roadEdgeExists(gx, gy, ngx, ngy) {
    const dx = ngx - gx;
    const dy = ngy - gy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    if (gx < 1 || gy < 1 || ngx < 1 || ngy < 1 || gx > 17 || gy > 17 || ngx > 17 || ngy > 17) return false;

    if (dy === 0) {
      const roadIndex = gy;
      const segmentIndex = Math.min(gx, ngx);
      if (EW_ARTERIALS.has(roadIndex)) return true;
      return segmentInRuns(LOCAL_H_RUNS.get(roadIndex), segmentIndex);
    }

    const roadIndex = gx;
    const segmentIndex = Math.min(gy, ngy);
    if (NS_ARTERIALS.has(roadIndex)) return true;
    return segmentInRuns(LOCAL_V_RUNS.get(roadIndex), segmentIndex);
  }

  function roadNeighbors(gx, gy) {
    const out = [];
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ngx = gx + dx;
      const ngy = gy + dy;
      if (roadEdgeExists(gx, gy, ngx, ngy)) out.push({ gx:ngx, gy:ngy, dx, dy });
    }
    return out;
  }

  function intersectionDegree(gx, gy) {
    return roadNeighbors(gx, gy).length;
  }

  function isSignalizedIntersection(gx, gy) {
    const degree = intersectionDegree(gx, gy);
    if (degree < 3) return false;
    const onEW = EW_ARTERIALS.has(gy);
    const onNS = NS_ARTERIALS.has(gx);
    return (onEW && onNS) || (degree >= 3 && (onEW || onNS) && hash2(gx, gy, 1880) > .28);
  }

  function roadSegmentStyle(axis, roadIndex, segmentIndex) {
    if (axis === "h" && EW_ARTERIALS.has(roadIndex)) return "arterial";
    if (axis === "v" && NS_ARTERIALS.has(roadIndex)) return "arterial";

    const styles = axis === "v"
      ? [cityBlockStyle(roadIndex - 1, segmentIndex), cityBlockStyle(roadIndex, segmentIndex)]
      : [cityBlockStyle(segmentIndex, roadIndex - 1), cityBlockStyle(segmentIndex, roadIndex)];

    if (styles.includes("station")) return "station";
    if (styles.includes("arcade") || styles.includes("alley") || styles.includes("mixed-core")) return "commercial";
    if (styles.includes("green")) return "park";
    if (styles.includes("residential")) return "residential";
    return "local";
  }

  function roadWidthForStyle(style) {
    if (style === "arterial") return 216;
    if (style === "station") return 188;
    if (style === "commercial") return 158;
    if (style === "park") return 148;
    if (style === "residential") return 108;
    return 136;
  }

  function roadCurveAmplitude(axis, roadIndex, segmentIndex) {
    const style = roadSegmentStyle(axis, roadIndex, segmentIndex);
    const seed = hash2(roadIndex, segmentIndex, axis === "h" ? 1891 : 1892);

    // Arterials bend only occasionally and with a much larger apparent radius.
    // Local streets curve more often and more strongly.
    if (style === "arterial") {
      if (seed < .72) return 0;
      const sign = hash2(segmentIndex, roadIndex, 1894) > .5 ? 1 : -1;
      return sign * (10 + hash2(roadIndex, segmentIndex, 1895) * 14);
    }

    if (seed < .36) return 0;
    const amount = style === "residential" ? 20 : style === "local" ? 34 : 26;
    return (seed > .68 ? 1 : -1) * (10 + hash2(segmentIndex, roadIndex, 1893) * amount);
  }

  function roadEdgePoint(axis, roadIndex, segmentIndex, t) {
    const amplitude = roadCurveAmplitude(axis, roadIndex, segmentIndex);
    const u = clamp(t, 0, 1);
    // Zero derivative at both ends makes adjacent curved street segments meet
    // without a visible kink at T-junctions/intersections.
    const bump = 16 * u * u * (1 - u) * (1 - u);
    const curve = bump * amplitude;
    if (axis === "h") {
      return {
        x: (segmentIndex + t) * ROAD_GAP,
        y: roadIndex * ROAD_GAP + curve
      };
    }
    return {
      x: roadIndex * ROAD_GAP + curve,
      y: (segmentIndex + t) * ROAD_GAP
    };
  }

  function sampleRoadEdge(axis, roadIndex, segmentIndex, steps = 12) {
    const points = [];
    for (let i = 0; i <= steps; i += 1) points.push(roadEdgePoint(axis, roadIndex, segmentIndex, i / steps));
    return points;
  }

  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    if (length2 < .001) return distance(px, py, ax, ay);
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / length2, 0, 1);
    return distance(px, py, ax + dx * t, ay + dy * t);
  }

  function roadDistanceToEdge(x, y, axis, roadIndex, segmentIndex) {
    const points = sampleRoadEdge(axis, roadIndex, segmentIndex, 8);
    let best = Infinity;
    for (let i = 1; i < points.length; i += 1) {
      best = Math.min(best, pointSegmentDistance(x, y, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y));
    }
    return best;
  }

  function nearestRoadSegmentInfo(x, y, searchRadius = 2) {
    const gx = Math.floor(x / ROAD_GAP);
    const gy = Math.floor(y / ROAD_GAP);
    let best = null;

    for (let ix = gx - searchRadius; ix <= gx + searchRadius; ix += 1) {
      for (let iy = gy - searchRadius; iy <= gy + searchRadius; iy += 1) {
        if (roadEdgeExists(ix, iy, ix + 1, iy)) {
          const d = roadDistanceToEdge(x, y, "h", iy, ix);
          if (!best || d < best.distance) best = { axis:"h", roadIndex:iy, segmentIndex:ix, distance:d };
        }
        if (roadEdgeExists(ix, iy, ix, iy + 1)) {
          const d = roadDistanceToEdge(x, y, "v", ix, iy);
          if (!best || d < best.distance) best = { axis:"v", roadIndex:ix, segmentIndex:iy, distance:d };
        }
      }
    }
    return best;
  }

  function roadDistance(value) {
    const mod = ((value % ROAD_GAP) + ROAD_GAP) % ROAD_GAP;
    return Math.min(mod, ROAD_GAP - mod);
  }

  function isRoad(x, y) {
    return mapModel.isRoad(x, y, { vehicleOnly: true });
  }

  function roadStyleAt(x, y) {
    const hit = mapModel.nearestRoad(x, y, { vehicleOnly: true });
    return hit ? hit.edge.type : "local";
  }

  function speedLimitAt(x, y) {
    const hit = mapModel.nearestRoad(x, y, { vehicleOnly: true });
    return hit ? hit.edge.speedLimit : 30;
  }

  function inWorld(x, y, radius = 0) {
    return x > COAST + radius && y > COAST + radius && x < WORLD_SIZE - COAST - radius && y < WORLD_SIZE - COAST - radius;
  }

  function circleRectCollision(x, y, radius, rect) {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    return distance(x, y, nx, ny) < radius;
  }

  function placeBuildingRect(place) {
    if (!place?.building) return null;
    return {
      x:place.building.x - place.building.w / 2,
      y:place.building.y - place.building.h / 2,
      w:place.building.w,
      h:place.building.h
    };
  }

  function collidesBuilding(x, y, radius) {
    for (const building of buildings) {
      if (
        x + radius < building.x ||
        y + radius < building.y ||
        x - radius > building.x + building.w ||
        y - radius > building.y + building.h
      ) continue;
      if (circleRectCollision(x, y, radius, building)) return true;
    }
    for (const place of PLACES) {
      const facility = placeBuildingRect(place);
      if (!facility) continue;
      if (
        x + radius < facility.x ||
        y + radius < facility.y ||
        x - radius > facility.x + facility.w ||
        y - radius > facility.y + facility.h
      ) continue;
      if (circleRectCollision(x, y, radius, facility)) return true;
    }
    return false;
  }

  function canStand(x, y, radius = PLAYER_RADIUS) {
    return inWorld(x, y, radius) && mapModel.isWalkable(x, y, radius) && !collidesBuilding(x, y, radius);
  }

  function vehicleDimensions(car, owned = false) {
    const type = car?.type || (owned ? "sedan" : "compact");
    if (type === "compact") return { type, length:66, width:36 };
    if (type === "suv") return { type, length:80, width:43 };
    if (type === "van") return { type, length:82, width:42 };
    return { type, length:76, width:39 };
  }

  function vehicleCollisionShape(car, padding = 0) {
    const owned = car === personalCar;
    const dims = vehicleDimensions(car, owned);
    return {
      x:car.x,
      y:car.y,
      angle:car.angle || 0,
      halfLength:dims.length * .5 * VEHICLE_COLLISION_SCALE + padding,
      halfWidth:dims.width * .5 * VEHICLE_COLLISION_SCALE + padding
    };
  }

  function circleIntersectsVehicle(x, y, radius, car, padding = 0) {
    const shape = vehicleCollisionShape(car, padding);
    const dx = x - shape.x;
    const dy = y - shape.y;
    const cos = Math.cos(shape.angle);
    const sin = Math.sin(shape.angle);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    const closestX = clamp(localX, -shape.halfLength, shape.halfLength);
    const closestY = clamp(localY, -shape.halfWidth, shape.halfWidth);
    const ox = localX - closestX;
    const oy = localY - closestY;
    return ox * ox + oy * oy < radius * radius;
  }

  function vehiclesIntersect(a, b, padding = 0) {
    if (!a || !b || a === b) return false;
    const sa = vehicleCollisionShape(a, padding);
    const sb = vehicleCollisionShape(b, padding);
    const axes = [
      { x:Math.cos(sa.angle), y:Math.sin(sa.angle) },
      { x:-Math.sin(sa.angle), y:Math.cos(sa.angle) },
      { x:Math.cos(sb.angle), y:Math.sin(sb.angle) },
      { x:-Math.sin(sb.angle), y:Math.cos(sb.angle) }
    ];
    const delta = { x:sb.x - sa.x, y:sb.y - sa.y };
    const af = { x:Math.cos(sa.angle), y:Math.sin(sa.angle) };
    const as = { x:-Math.sin(sa.angle), y:Math.cos(sa.angle) };
    const bf = { x:Math.cos(sb.angle), y:Math.sin(sb.angle) };
    const bs = { x:-Math.sin(sb.angle), y:Math.cos(sb.angle) };

    for (const axis of axes) {
      const centerDistance = Math.abs(delta.x * axis.x + delta.y * axis.y);
      const ra =
        sa.halfLength * Math.abs(af.x * axis.x + af.y * axis.y) +
        sa.halfWidth * Math.abs(as.x * axis.x + as.y * axis.y);
      const rb =
        sb.halfLength * Math.abs(bf.x * axis.x + bf.y * axis.y) +
        sb.halfWidth * Math.abs(bs.x * axis.x + bs.y * axis.y);
      if (centerDistance >= ra + rb) return false;
    }
    return true;
  }

  function visiblePedestrianColliders() {
    return pedestrians.filter((ped) => ped.visible && ped.state !== "inside");
  }

  function personIntersectsAnyVehicle(x, y, radius, ignoreCar = null) {
    if (personalCar !== ignoreCar && circleIntersectsVehicle(x, y, radius, personalCar, 1)) return personalCar;
    for (const car of traffic) {
      if (car === ignoreCar) continue;
      if (circleIntersectsVehicle(x, y, radius, car, 1)) return car;
    }
    return null;
  }

  function personIntersectsAnotherPerson(x, y, radius, ignorePed = null, includePlayer = true) {
    if (
      includePlayer &&
      !state.player.inVehicle &&
      !state.player.inTrain &&
      !state.player.inHome &&
      distance(x, y, state.player.x, state.player.y) < radius + PLAYER_COLLISION_RADIUS
    ) {
      return { type:"player", target:state.player };
    }

    for (const ped of visiblePedestrianColliders()) {
      if (ped === ignorePed) continue;
      if (distance(x, y, ped.x, ped.y) < radius + NPC_COLLISION_RADIUS) {
        return { type:"pedestrian", target:ped };
      }
    }
    return null;
  }

  function canPlayerOccupy(x, y) {
    if (!canStand(x, y, PLAYER_RADIUS)) return false;
    if (personIntersectsAnyVehicle(x, y, PLAYER_COLLISION_RADIUS)) return false;
    if (personIntersectsAnotherPerson(x, y, PLAYER_COLLISION_RADIUS, null, false)) return false;
    return true;
  }

  function vehicleIntersectsAnyPerson(car) {
    if (
      !state.player.inVehicle &&
      !state.player.inTrain &&
      !state.player.inHome &&
      circleIntersectsVehicle(state.player.x, state.player.y, PLAYER_COLLISION_RADIUS, car, 1)
    ) return { type:"player", target:state.player };

    for (const ped of visiblePedestrianColliders()) {
      if (circleIntersectsVehicle(ped.x, ped.y, NPC_COLLISION_RADIUS, car, 1)) {
        return { type:"pedestrian", target:ped };
      }
    }
    return null;
  }

  function vehicleIntersectsAnyVehicle(car) {
    if (car !== personalCar && vehiclesIntersect(car, personalCar, 1)) return personalCar;
    for (const other of traffic) {
      if (other === car) continue;
      if (vehiclesIntersect(car, other, 1)) return other;
    }
    return null;
  }

  function segmentIntersectsExpandedRect(a, b, rect, pad) {
    const left = rect.x - pad;
    const right = rect.x + rect.w + pad;
    const top = rect.y - pad;
    const bottom = rect.y + rect.h + pad;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t0 = 0;
    let t1 = 1;
    const checks = [
      [-dx, a.x - left],
      [dx, right - a.x],
      [-dy, a.y - top],
      [dy, bottom - a.y]
    ];
    for (const [p, q] of checks) {
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) {
        if (ratio > t1) return false;
        t0 = Math.max(t0, ratio);
      } else {
        if (ratio < t0) return false;
        t1 = Math.min(t1, ratio);
      }
    }
    return true;
  }

  function intersectsRoadNetworkClearance(rect) {
    for (const edge of mapModel.edges) {
      const pad = edge.width / 2 + (edge.vehicle ? 18 : 10);
      for (let i = 1; i < edge.points.length; i += 1) {
        if (segmentIntersectsExpandedRect(edge.points[i - 1], edge.points[i], rect, pad)) return true;
      }
    }
    return false;
  }

  function intersectsRailClearance(rect) {
    if (rect.x + rect.w < RAIL_MIN_X || rect.x > RAIL_MAX_X) return false;

    const corridorTop = RAIL_Y - RAIL_CORRIDOR_HALF;
    const corridorBottom = RAIL_Y + RAIL_CORRIDOR_HALF;
    if (rect.y < corridorBottom && rect.y + rect.h > corridorTop) return true;

    for (const station of TRAIN_STATIONS) {
      const left = station.x - 145;
      const right = station.x + 145;
      const top = RAIL_Y - 118;
      const bottom = RAIL_Y + 145;
      if (rect.x < right && rect.x + rect.w > left && rect.y < bottom && rect.y + rect.h > top) return true;
    }
    return false;
  }

  function generateBuildings() {
    buildings.length = 0;
    for (const site of mapModel.buildingSites || []) {
      buildings.push({
        ...site,
        tint:.76 + hash2(Math.floor(site.x), Math.floor(site.y), 91) * .18,
        palette:Number.isFinite(site.palette) ? site.palette : Math.floor(hash2(Math.floor(site.x), Math.floor(site.y), 407) * VISUAL_PALETTES.length),
        floors:Math.max(1, Math.floor(site.floors || 1)),
        roofDetail:Number.isFinite(site.roofDetail) ? site.roofDetail : Math.floor(hash2(Math.floor(site.x), Math.floor(site.y), 410) * 4),
        facadeBand:Boolean(site.facadeBand),
        balconies:Boolean(site.balconies),
        residentialSeed:site.seed || Math.floor(site.x + site.y)
      });
    }
  }

  function polylineLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i += 1) length += distance(points[i - 1], points[i]);
    return length;
  }

  function pointAndTangentOnPolyline(points, distanceAlong) {
    let remaining = distanceAlong;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const segmentLength = distance(a, b);
      if (remaining <= segmentLength || i === points.length - 1) {
        const t = segmentLength < .001 ? 0 : clamp(remaining / segmentLength, 0, 1);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const magnitude = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { point: { x, y }, tangent: { x: (b.x - a.x) / magnitude, y: (b.y - a.y) / magnitude } };
      }
      remaining -= segmentLength;
    }
    const last = points.at(-1);
    const before = points.at(-2) || last;
    const magnitude = Math.hypot(last.x - before.x, last.y - before.y) || 1;
    return { point: { ...last }, tangent: { x: (last.x - before.x) / magnitude, y: (last.y - before.y) / magnitude } };
  }

  function trafficPoseAt(car, along = car.along) {
    if (car.edgeId) {
      const edge = mapModel.getEdge(car.edgeId);
      if (edge) {
        const hit = pointAndTangentOnPolyline(edge.points, along);
        const directionSign = car.directionSign || 1;
        const tangent = directionSign > 0 ? hit.tangent : { x: -hit.tangent.x, y: -hit.tangent.y };
        const nx = tangent.y;
        const ny = -tangent.x;
        return {
          x: hit.point.x + nx * car.laneOffset,
          y: hit.point.y + ny * car.laneOffset,
          angle: Math.atan2(tangent.y, tangent.x)
        };
      }
    }
    const raw = along / ROAD_GAP;
    const segmentIndex = clamp(Math.floor(raw), 1, 16);
    const t = clamp(raw - segmentIndex, 0, 1);
    const axis = car.orientation;
    const center = roadEdgePoint(axis, car.roadIndex, segmentIndex, t);
    const ta = Math.max(0, t - .015);
    const tb = Math.min(1, t + .015);
    const a = roadEdgePoint(axis, car.roadIndex, segmentIndex, ta);
    const b = roadEdgePoint(axis, car.roadIndex, segmentIndex, tb);
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const mag = Math.hypot(tx, ty) || 1;
    tx /= mag;
    ty /= mag;
    const nx = ty;
    const ny = -tx;
    const baseAngle = Math.atan2(ty, tx);

    return {
      x:center.x + nx * car.laneOffset,
      y:center.y + ny * car.laneOffset,
      angle:car.directionSign > 0 ? baseAngle : angleWrap(baseAngle + Math.PI)
    };
  }

  function edgeOrientation(edge) {
    const from = mapModel.getNode(edge.from);
    const to = mapModel.getNode(edge.to);
    return from && to && Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? "h" : "v";
  }

  function vehicleEdgesAtNode(nodeId) {
    return mapModel.neighbors(nodeId, { mode:"vehicle" }).map(({ edge }) => edge);
  }

  function isSignalizedMapNode(nodeId) {
    const incidentEdges = vehicleEdgesAtNode(nodeId);
    return incidentEdges.length >= 3 && incidentEdges.some((edge) => edge.signalized);
  }

  function signalGeometryAtNode(nodeId, approachEdge) {
    const generated = mapModel.junctionGeometry?.(nodeId, approachEdge?.id);
    if (generated) return generated;

    // Compatibility fallback for older map models. Current maps derive the
    // boundary per approach from the connected road directions and widths.
    const incidentEdges = vehicleEdgesAtNode(nodeId);
    const junctionHalf = incidentEdges.length
      ? Math.min(...incidentEdges.map((edge) => edge.width)) / 2 + 6
      : (approachEdge?.width || ROAD_WIDTH) / 2;
    const crossingDepth = clamp((approachEdge?.width || ROAD_WIDTH) * .18, 22, 30);
    const crossingInnerEdge = junctionHalf + 6;
    const crossingOffset = crossingInnerEdge + crossingDepth / 2;
    const crossingOuterEdge = crossingInnerEdge + crossingDepth;
    return {
      junctionHalf,
      conflictBoundary:junctionHalf,
      crossingDepth,
      crossingInnerEdge,
      crossingOffset,
      crossingOuterEdge,
      crossingNearEdge:crossingOuterEdge,
      pedestrianWaitOffset:crossingOuterEdge + 5,
      stopOffset:crossingOuterEdge + 12,
      yieldOffset:junctionHalf + 10
    };
  }

  function vehicleFrontOverhang(car) {
    const type = car?.type || "sedan";
    if (type === "compact") return 33;
    if (type === "suv") return 40;
    if (type === "van") return 41;
    return 38;
  }

  function trafficGoalNode(car, startNodeId, attempt = 0) {
    const candidates = mapModel.nodes.filter((node) => node.id !== startNodeId && mapModel.neighbors(node.id, { mode: "vehicle" }).length > 0);
    if (!candidates.length) return null;
    const index = Math.floor(hash2(car.seed || 1, (car.routeTrips || 0) + attempt * 17, 717 + attempt * 13) * candidates.length) % candidates.length;
    return candidates[index].id;
  }

  function buildTrafficRoute(car, startNodeId, goalNodeId, avoidFirstEdgeId = null) {
    const route = mapModel.findRoute(startNodeId, goalNodeId, { mode: "vehicle" });
    if (!route || !route.edgeIds.length) return false;

    const alternatives = vehicleEdgesAtNode(startNodeId).filter((edge) => edge.id !== avoidFirstEdgeId);
    if (avoidFirstEdgeId && alternatives.length && route.edgeIds[0] === avoidFirstEdgeId) return false;

    car.routeEdgeIds = route.edgeIds;
    car.routeIndex = 0;
    car.routeGoalNodeId = goalNodeId;
    car.routeTrips = (car.routeTrips || 0) + 1;
    return true;
  }

  function planTrafficRoute(car, startNodeId, avoidFirstEdgeId = car.edgeId) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const goalNodeId = trafficGoalNode(car, startNodeId, attempt);
      if (goalNodeId && buildTrafficRoute(car, startNodeId, goalNodeId, avoidFirstEdgeId)) return true;
    }

    const alternatives = vehicleEdgesAtNode(startNodeId).filter((edge) => edge.id !== avoidFirstEdgeId);
    if (alternatives.length) {
      const pick = alternatives[Math.floor(hash2(car.seed || 1, car.routeTrips || 0, 733) * alternatives.length) % alternatives.length];
      car.routeEdgeIds = [pick.id];
      car.routeIndex = 0;
      car.routeGoalNodeId = pick.from === startNodeId ? pick.to : pick.from;
      car.routeTrips = (car.routeTrips || 0) + 1;
      return true;
    }

    const goalNodeId = trafficGoalNode(car, startNodeId, 99);
    return Boolean(goalNodeId && buildTrafficRoute(car, startNodeId, goalNodeId, null));
  }

  function reverseTrafficAtDeadEnd(car, current) {
    if (!car || !current) return false;
    const nodeId = car.directionSign > 0 ? current.to : current.from;
    const exits = vehicleEdgesAtNode(nodeId);
    if (exits.length !== 1 || exits[0].id !== current.id) return false;

    // A dead-end is a valid route endpoint, not a reason to leave the car
    // frozen forever. Turn around at the endpoint while preserving the same
    // edge and world position; no teleport or arbitrary-node recovery occurs.
    car.directionSign *= -1;
    car.along = car.directionSign > 0 ? 0 : (car.edgeLength || polylineLength(current.points));
    car.routeEdgeIds = [current.id];
    car.routeIndex = 0;
    car.routeGoalNodeId = car.directionSign > 0 ? current.to : current.from;
    car.junctionWait = 0;
    car.collisionYield = 0;
    return true;
  }

  function advanceTrafficRoute(car) {
    const current = mapModel.getEdge(car.edgeId);
    if (!current) return false;
    const nodeId = car.directionSign > 0 ? current.to : current.from;
    let nextId = car.routeEdgeIds?.[car.routeIndex];

    if (!nextId || (nextId === current.id && vehicleEdgesAtNode(nodeId).length > 1)) {
      if (!planTrafficRoute(car, nodeId, current.id)) {
        if (reverseTrafficAtDeadEnd(car, current)) return true;
        return false;
      }
      nextId = car.routeEdgeIds[car.routeIndex];
    }

    let next = mapModel.getEdge(nextId);
    if (!next || (next.from !== nodeId && next.to !== nodeId)) {
      if (!planTrafficRoute(car, nodeId, current.id)) {
        if (reverseTrafficAtDeadEnd(car, current)) return true;
        return false;
      }
      nextId = car.routeEdgeIds[car.routeIndex];
      next = mapModel.getEdge(nextId);
    }
    if (!next || (next.from !== nodeId && next.to !== nodeId)) {
      return reverseTrafficAtDeadEnd(car, current);
    }

    car.edgeId = next.id;
    car.directionSign = next.from === nodeId ? 1 : -1;
    car.edgeLength = polylineLength(next.points);
    car.laneOffset = trafficLaneOffsetForEdge(next, Boolean(car.secondaryLane));
    car.along = car.directionSign > 0 ? 0 : car.edgeLength;
    car.routeIndex += 1;
    return true;
  }

  function trafficLaneOffsetForEdge(edge, secondaryLane = false) {
    // Keep the vehicle body inside the carriageway even on the narrowest
    // two-way street. This still leaves enough separation for two NPC vans.
    const maxOffset = Math.max(18, edge.width / 2 - 20);
    const primaryOffset = Math.min(LANE_OFFSET, maxOffset);
    const extraOffset = secondaryLane && edge.width >= 180
      ? Math.min(28, Math.max(0, maxOffset - primaryOffset))
      : 0;
    return primaryOffset + extraOffset;
  }

  function randomRoadPoint(seedA, seedB, offset = 0) {
    const vehicleEdges = mapModel.edges.filter((edge) => edge.vehicle);
    const edge = vehicleEdges[Math.floor(hash2(seedA, seedB, 8) * vehicleEdges.length) % vehicleEdges.length];
    const directionSign = hash2(seedA, seedB, 19) > .5 ? 1 : -1;
    const edgeLength = polylineLength(edge.points);
    const along = edgeLength * (.12 + hash2(seedA, seedB, 13) * .76);
    const secondaryLane = hash2(seedA, seedB, 23) > .52;
    const laneOffset = trafficLaneOffsetForEdge(edge, secondaryLane) + offset * .05;
    const seedCar = {
      edgeId: edge.id,
      edgeLength,
      directionSign,
      laneOffset,
      secondaryLane,
      along
    };
    const pose = trafficPoseAt(seedCar, along);
    return { ...pose, ...seedCar };
  }

  function generateTraffic() {
    const colors = ["#d5d8da", "#6689ad", "#b26f67", "#c6a35a", "#59635f", "#89769e", "#579079"];
    for (let i = 0; i < 16; i += 1) {
      let car = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const p = randomRoadPoint(i + 2 + attempt * 37, i * 7 + 3 + attempt * 19, 18);
        const cruise = 150 + hash2(i, 4, 22) * 110;
        car = {
          x:p.x,
          y:p.y,
          angle:p.angle,
          edgeId:p.edgeId,
          edgeLength:p.edgeLength,
          orientation:p.orientation,
          roadIndex:p.roadIndex,
          directionSign:p.directionSign,
          laneOffset:p.laneOffset,
          secondaryLane:p.secondaryLane,
          along:p.along,
          speed:cruise * .7,
          cruise,
          color:colors[i % colors.length],
          type:VEHICLE_TYPES[Math.floor(hash2(i, 8, 522) * VEHICLE_TYPES.length) % VEHICLE_TYPES.length],
          brakeGlow:0,
          seed:i + 17,
          routeEdgeIds:[],
          routeIndex:0,
          routeTrips:0,
          overtakePlan:null,
          collisionYield:0,
          junctionWait:0,
          trafficStall:0,
          playerFlowPriority:0,
          stuckRecoveryCooldown:0,
          stuckRecoveryCount:0
        };
        if (!traffic.some((other) => vehiclesIntersect(car, other, 8))) break;
        car = null;
      }

      if (!car) continue;
      const currentEdge = mapModel.getEdge(car.edgeId);
      if (!currentEdge) continue;
      const startNodeId = car.directionSign > 0 ? currentEdge.to : currentEdge.from;
      planTrafficRoute(car, startNodeId, currentEdge.id);
      traffic.push(car);
    }
  }


  function nearestPedestrianNodeId(x, y) {
    const hit = mapModel.nearestRoad(x, y);
    const edge = hit?.edge;
    if (!edge) return HOME?.entranceNodeId || mapModel.nodes[0]?.id || null;
    const from = mapModel.getNode(edge.from);
    const to = mapModel.getNode(edge.to);
    if (!from) return to?.id || null;
    if (!to) return from.id;
    return distance(x, y, from.x, from.y) <= distance(x, y, to.x, to.y) ? from.id : to.id;
  }

  function citizenHomeCandidates() {
    const preferred = (mapModel.buildingSites || []).filter((site) =>
      site.use === "residential" || site.use === "mixed-low"
    );
    const fallback = (mapModel.buildingSites || []).filter((site) => site.use === "mixed");
    const source = preferred.length ? preferred : fallback;
    return source.map((site) => ({
      site,
      nodeId:nearestPedestrianNodeId(site.x + site.w / 2, site.y + site.h / 2)
    })).filter((value) => value.nodeId);
  }

  function citizenWorkCandidates() {
    return (mapModel.buildingSites || [])
      .filter((site) => site.use === "commercial" || site.use === "mixed")
      .map((site) => ({
        site,
        nodeId:nearestPedestrianNodeId(site.x + site.w / 2, site.y + site.h / 2)
      }))
      .filter((value) => value.nodeId);
  }

  function citizenName(index, gender = "male") {
    if (index === 0) return "アオイ";
    if (index === 1) return "ソラ";
    if (index === 2) return "メイ";
    const family = CITIZEN_FAMILY_NAMES[Math.floor(hash2(index, 71, 1601) * CITIZEN_FAMILY_NAMES.length) % CITIZEN_FAMILY_NAMES.length];
    const names = gender === "female" ? CITIZEN_GIVEN_NAMES_FEMALE : CITIZEN_GIVEN_NAMES_MALE;
    const given = names[Math.floor(hash2(index, 79, 1602) * names.length) % names.length];
    return family + " " + given;
  }

  function citizenAgeGroup(age) {
    if (age <= 24) return "young";
    if (age <= 44) return "adult";
    if (age <= 64) return "mature";
    return "senior";
  }

  function personAppearanceFromSeed(index, profile = {}) {
    return characterRenderer.createAppearance(index + 41, profile);
  }

  const PLAYER_APPEARANCE = characterRenderer.createAppearance(9001, { role:"player" });

  function playerAppearance() {
    const outfit = wardrobeModel.getOutfit(state.wardrobe.equippedOutfitId) || wardrobeModel.getOutfit(wardrobeModel.DEFAULT_OUTFIT_ID);
    return {
      ...PLAYER_APPEARANCE,
      id:PLAYER_APPEARANCE.id + "-" + outfit.id,
      top:outfit.top,
      bottom:outfit.bottom,
      accent:outfit.accent,
      topStyle:outfit.topStyle,
      bottomStyle:outfit.bottomStyle,
      bottomGarment:outfit.bottomGarment,
      accessory:outfit.accessory
    };
  }

  function citizenProfile(index, home, workPool) {
    const socialProfile = index < socialNpcSystem.catalog.length ? socialNpcSystem.catalog[index] : null;
    const specialNpcId = socialProfile?.id || null;
    const gender = socialProfile?.gender || (hash2(index, 81, 16025) < .5 ? "male" : "female");
    let age = socialProfile?.age || 18 + Math.floor(hash2(index, 83, 1603) * 64);
    let jobType = socialProfile?.jobType || null;

    if (!jobType && age >= 68) {
      jobType = "retired";
    } else if (!jobType && age <= 22) {
      jobType = "student";
    } else if (!jobType) {
      const roll = hash2(index, 89, 1604);
      jobType = roll < .12 ? "cafe"
        : roll < .23 ? "retail"
          : roll < .31 ? "gym"
            : roll < .39 ? "library"
              : roll < .84 ? "office"
                : "freelance";
    }

    const fixedPlace = jobType === "cafe" ? CAFE
      : jobType === "retail" ? STORE
        : jobType === "gym" ? GYM
          : jobType === "library" || jobType === "student" ? LIBRARY
            : null;

    const genericWork = workPool.length
      ? workPool[Math.floor(hash2(index, 97, 1605) * workPool.length) % workPool.length]
      : null;
    const workNodeId = fixedPlace?.entranceNodeId
      || (jobType === "office" || jobType === "freelance" ? genericWork?.nodeId : null)
      || null;

    const workSchedule = socialProfile?.schedule.find((slot) => /work|shift|study/.test(slot.activity));
    const workStart = workSchedule?.start ?? (jobType === "cafe" || jobType === "retail"
      ? 7 * 60 + Math.floor(hash2(index, 101, 1606) * 150)
      : 8 * 60 + Math.floor(hash2(index, 103, 1607) * 120));
    const workMinutes = workSchedule ? (workSchedule.end - workSchedule.start + 1440) % 1440 : jobType === "freelance"
      ? 300 + Math.floor(hash2(index, 107, 1608) * 180)
      : 420 + Math.floor(hash2(index, 109, 1609) * 100);

    return {
      id:"citizen-" + String(index + 1).padStart(3, "0"),
      name:socialProfile?.name || citizenName(index, gender),
      specialNpcId,
      gender,
      age,
      ageGroup:citizenAgeGroup(age),
      householdId:"household-" + String(Math.floor(index / 2) + 1).padStart(2, "0"),
      homeSiteId:home?.site?.id || null,
      homeNodeId:home?.nodeId || HOME.entranceNodeId,
      jobType,
      jobLabel:CITIZEN_JOB_LABELS[jobType] || "住民",
      workNodeId,
      workPlaceId:fixedPlace?.id || null,
      workStart,
      workEnd:(workStart + workMinutes) % 1440,
      wage:jobType === "office" ? 7800
        : jobType === "cafe" || jobType === "retail" ? 5400
          : jobType === "gym" || jobType === "library" ? 5900
            : jobType === "freelance" ? 4600
              : 0,
      wakeMinute:360 + Math.floor(hash2(index, 113, 1610) * 150),
      sleepMinute:1320 + Math.floor(hash2(index, 127, 1611) * 100),
      personality:{
        social:.55 + hash2(index, 131, 1612) * .9,
        active:.45 + hash2(index, 137, 1613) * 1.0,
        curious:.45 + hash2(index, 139, 1614) * 1.0,
        frugal:.45 + hash2(index, 149, 1615) * 1.0,
        routine:.55 + hash2(index, 151, 1616) * .9
      }
    };
  }

  function citizenIsWorkday(ped) {
    if (!ped.workNodeId || ped.jobType === "retired" || ped.jobType === "student") return false;
    const weekday = (state.day - 1) % 7;
    const offShift = Math.floor(hash2(ped.seed, 157, 1617) * 3);
    if (ped.jobType === "cafe" || ped.jobType === "retail") return weekday !== offShift && weekday !== (offShift + 3) % 7;
    return weekday < 5;
  }

  function citizenClampNeeds(ped) {
    ped.needs.hunger = clamp(ped.needs.hunger, 0, 100);
    ped.needs.energy = clamp(ped.needs.energy, 0, 100);
    ped.needs.social = clamp(ped.needs.social, 0, 100);
    ped.needs.fun = clamp(ped.needs.fun, 0, 100);
    ped.stress = clamp(ped.stress, 0, 100);
    ped.money = Math.max(-5000, ped.money);
    ped.groceries = Math.max(0, Math.floor(ped.groceries));
  }

  function citizenUpdateNeeds(ped, gameMinutes, travelling = false) {
    if (!Number.isFinite(gameMinutes) || gameMinutes <= 0) return;
    const activityFactor = travelling ? 1.15 : .8;
    ped.needs.hunger -= gameMinutes * .026 * activityFactor;
    ped.needs.energy -= gameMinutes * .018 * activityFactor;
    ped.needs.social -= gameMinutes * .007;
    ped.needs.fun -= gameMinutes * .0055;
    if (travelling) ped.stress += gameMinutes * .006;
    citizenClampNeeds(ped);
  }

  function minuteUntil(target, from = state.minute) {
    return (target - from + 1440) % 1440;
  }

  function citizenActivityNode(action, ped) {
    if (action.nodeId) return action.nodeId;
    if (action.placeId) return PLACES.find((place) => place.id === action.placeId)?.entranceNodeId || ped.homeNodeId;
    return ped.homeNodeId;
  }

  function citizenActionCandidates(ped) {
    const minute = state.minute;
    const hungerDeficit = 100 - ped.needs.hunger;
    const energyDeficit = 100 - ped.needs.energy;
    const socialDeficit = 100 - ped.needs.social;
    const funDeficit = 100 - ped.needs.fun;
    const lateNight = minute >= ped.sleepMinute || minute < ped.wakeMinute - 30;
    const workday = citizenIsWorkday(ped);
    const untilWork = minuteUntil(ped.workStart, minute);
    const workEndAbsolute = ped.workEnd > ped.workStart ? ped.workEnd : ped.workEnd + 1440;
    const minuteAbsolute = minute < ped.workStart && ped.workEnd < ped.workStart ? minute + 1440 : minute;
    const onShift = workday && minuteAbsolute >= ped.workStart && minuteAbsolute < workEndAbsolute;
    const alreadyWorked = ped.workedDay === state.day;

    const actions = [];
    const add = (id, score, options = {}) => {
      const noise = (hash2(ped.seed, ped.decisionCount || 0, options.noiseSeed || id.length * 37) - .5) * 12;
      actions.push({
        id,
        label:CITIZEN_ACTIVITY_LABELS[id] || id,
        score:score + noise,
        nodeId:options.nodeId || null,
        placeId:options.placeId || null,
        duration:options.duration || 60,
        indoor:Boolean(options.indoor),
        courseId:options.courseId || null,
        sessionDay:options.sessionDay || null,
        sessionStartAbsoluteMinute:options.sessionStartAbsoluteMinute || null,
        label:options.label || CITIZEN_ACTIVITY_LABELS[id] || id
      });
    };

    add("sleep",
      energyDeficit * 1.55 + (lateNight ? 105 : 0) + (ped.needs.energy < 22 ? 70 : 0),
      {
        nodeId:ped.homeNodeId,
        duration:lateNight ? clamp(minuteUntil(ped.wakeMinute, minute), 120, 510) : 100,
        indoor:true,
        noiseSeed:1701
      }
    );

    if (ped.workNodeId && workday && !alreadyWorked) {
      const scheduleScore = onShift ? 195 : untilWork <= 90 ? 175 - untilWork * .55 : untilWork <= 180 ? 75 - untilWork * .2 : -40;
      const moneyPressure = ped.money < 2500 ? 32 : ped.money < 7000 ? 14 : 0;
      add("work", scheduleScore * ped.personality.routine + moneyPressure, {
        nodeId:ped.workNodeId,
        placeId:ped.workPlaceId,
        duration:onShift ? clamp(workEndAbsolute - minuteAbsolute, 120, 540) : clamp((ped.workEnd - ped.workStart + 1440) % 1440, 240, 540),
        indoor:true,
        noiseSeed:1702
      });
    }

    if (ped.groceries > 0) {
      add("eat_home", hungerDeficit * 1.52 + ped.personality.frugal * 14, {
        nodeId:ped.homeNodeId,
        duration:35,
        indoor:true,
        noiseSeed:1703
      });
    }

    if (ped.money >= 900) {
      add("eat_out", hungerDeficit * 1.35 + (1.5 - ped.personality.frugal) * 20 + socialDeficit * .18, {
        placeId:"cafe",
        duration:45,
        indoor:true,
        noiseSeed:1704
      });
    }

    if (ped.groceries <= 1 && ped.money >= 1200) {
      add("shop", 72 + (1 - ped.groceries) * 25 + hungerDeficit * .28, {
        placeId:"store",
        duration:32,
        indoor:true,
        noiseSeed:1705
      });
    }

    add("park", funDeficit * .78 + socialDeficit * .42 + ped.stress * .72 + ped.personality.active * 12, {
      placeId:"park",
      duration:70,
      indoor:false,
      noiseSeed:1706
    });

    if (ped.money >= 500 && ped.needs.energy > 32 && ped.needs.hunger > 28) {
      add("gym", funDeficit * .48 + ped.stress * .5 + ped.personality.active * 34, {
        placeId:"gym",
        duration:80,
        indoor:true,
        noiseSeed:1707
      });
    }

    add("library", funDeficit * .35 + ped.stress * .42 + ped.personality.curious * 32 + (ped.jobType === "student" ? 82 : 0), {
      placeId:"library",
      duration:ped.jobType === "student" ? 150 : 85,
      indoor:true,
      noiseSeed:1708
    });

    if (ped.money >= 500) {
      const socialPlace = hash2(ped.seed, ped.decisionCount || 0, 1709) > .5 ? "cafe" : "park";
      add("socialize", socialDeficit * 1.06 + funDeficit * .28 + ped.personality.social * 30, {
        placeId:socialPlace,
        duration:65,
        indoor:socialPlace === "cafe",
        noiseSeed:1710
      });
    }

    const classOpportunity = communityCenterModel.getCitizenCourseOpportunity(state.day, minute, {
      money:ped.money,
      onShift,
      lateNight,
      needs:ped.needs,
      personality:ped.personality
    });
    if (classOpportunity) {
      add("community_class", classOpportunity.score, {
        placeId:"community-center",
        duration:classOpportunity.duration,
        indoor:false,
        courseId:classOpportunity.course.id,
        sessionDay:classOpportunity.session.day,
        sessionStartAbsoluteMinute:classOpportunity.session.startAbsoluteMinute,
        label:classOpportunity.session.startAbsoluteMinute > (state.day - 1) * 1440 + minute
          ? classOpportunity.course.skillName + "講座の開始待ち"
          : classOpportunity.course.name + "に参加中",
        noiseSeed:1713
      });
    }

    add("home_idle",
      32 + energyDeficit * .42 + ped.stress * .34 + (minute >= 20 * 60 ? 38 : 0),
      {
        nodeId:ped.homeNodeId,
        duration:80 + Math.floor(hash2(ped.seed, ped.decisionCount || 0, 1711) * 80),
        indoor:true,
        noiseSeed:1712
      }
    );

    if (ped.specialNpcId) {
      const nearbySocialNpcIds = pedestrians
        .filter((other) => other !== ped && other.visible && other.specialNpcId && distance(ped.x, ped.y, other.x, other.y) < 220)
        .map((other) => other.specialNpcId);
      for (const candidate of actions) {
        if (candidate.id !== "socialize") continue;
        candidate.score += socialNpcSystem.getSocialActionBias({
          npcId:ped.specialNpcId,
          action:"social:" + candidate.id,
          minute,
          day:state.day,
          relationships:socialNpcState.relationships,
          nearbySocialNpcIds
        }) * 100;
      }
    }
    actions.sort((a, b) => b.score - a.score);
    return actions;
  }

  function chooseCitizenAction(ped) {
    ped.decisionCount = (ped.decisionCount || 0) + 1;
    const actions = citizenActionCandidates(ped);
    return actions[0] || {
      id:"home_idle",
      label:CITIZEN_ACTIVITY_LABELS.home_idle,
      nodeId:ped.homeNodeId,
      duration:90,
      indoor:true
    };
  }

  function citizenSocialRequestIsValid(ped, request) {
    if (!ped?.specialNpcId || request?.actionId !== "social-meetup" || !Number.isFinite(request.expiresAt)) return false;
    const place = PLACES.find((entry) => entry.id === request.placeId && entry.entranceNodeId);
    const now = (state.day - 1) * 1440 + state.minute;
    if (!place || request.expiresAt <= now || (request.expiresAt - now) > 1440) return false;
    if (ped.currentActivityId === "sleep" || ped.currentActivityId === "work") return false;
    const lateNight = state.minute >= ped.sleepMinute || state.minute < ped.wakeMinute - 30 || ped.needs.energy < 20;
    if (lateNight) return false;
    if (ped.workNodeId && citizenIsWorkday(ped) && ped.workedDay !== state.day) {
      const endAbsolute = ped.workEnd > ped.workStart ? ped.workEnd : ped.workEnd + 1440;
      const minuteAbsolute = state.minute < ped.workStart && ped.workEnd < ped.workStart ? state.minute + 1440 : state.minute;
      const onShift = minuteAbsolute >= ped.workStart && minuteAbsolute < endAbsolute;
      if (onShift || minuteUntil(ped.workStart) <= 90) return false;
    }
    return true;
  }

  function citizenSocialActivityFromRequest(ped) {
    const request = ped.socialActivityRequest;
    if (!request) return null;
    if (!citizenSocialRequestIsValid(ped, request)) {
      ped.socialActivityRequest = null;
      return null;
    }
    const place = PLACES.find((entry) => entry.id === request.placeId);
    return {
      id:request.actionId,
      label:"公園で待ち合わせ",
      placeId:request.placeId,
      nodeId:place.entranceNodeId,
      duration:45,
      indoor:false,
      expiresAt:request.expiresAt
    };
  }

  function requestCitizenSocialActivity(ped, request) {
    if (!citizenSocialRequestIsValid(ped, request)) return false;
    ped.socialActivityRequest = { ...request };
    if (
      !ped.currentActivityId &&
      ped.state !== "walking" &&
      ped.state !== "waiting" &&
      ped.state !== "inside" &&
      ped.state !== "staying"
    ) {
      planCitizenAction(ped, ped.currentNodeId || ped.homeNodeId);
    }
    return true;
  }

  function buildPedestrianPlan(ped, startNodeId, goalNodeId) {
    const route = mapModel.findRoute(startNodeId, goalNodeId, { mode:"pedestrian" });
    if (!route || !route.edgeIds.length) return false;

    const previousState = ped.state;
    const previousPose = (
      ped.visible &&
      (previousState === "walking" || previousState === "waiting" || previousState === "staying") &&
      Number.isFinite(ped.x) &&
      Number.isFinite(ped.y)
    )
      ? { x:ped.x, y:ped.y, angle:Number.isFinite(ped.dir) ? ped.dir : 0 }
      : null;

    ped.routeEdgeIds = route.edgeIds;
    ped.routeIndex = 0;
    ped.targetNodeId = goalNodeId;
    ped.edgeId = route.edgeIds[0];
    const firstEdge = mapModel.getEdge(ped.edgeId);
    if (!firstEdge) return false;
    ped.directionSign = firstEdge.from === startNodeId ? 1 : -1;
    ped.edgeLength = polylineLength(firstEdge.points);
    ped.along = ped.directionSign > 0 ? 0 : ped.edgeLength;

    const firstPose = pedestrianEdgePose(
      firstEdge,
      ped.directionSign,
      ped.along,
      ped.sideSign,
      ped.avoidanceOffset
    );
    ped.junctionTransition = previousPose
      ? makePedestrianTransition(previousPose, firstPose)
      : null;

    ped.state = "walking";
    ped.visible = true;
    ped.waitTimer = 0;
    ped.tripCount = (ped.tripCount || 0) + 1;
    ped.currentNodeId = startNodeId;
    return true;
  }

  function citizenActivityPeerCount(ped, placeId) {
    if (!placeId) return 0;
    return pedestrians.filter((other) =>
      other !== ped &&
      other.currentPlaceId === placeId &&
      (other.state === "inside" || other.state === "staying")
    ).length;
  }

  function beginCitizenActivity(ped, action = ped.pendingActivity) {
    if (!action) {
      action = chooseCitizenAction(ped);
    }
    if (action.id === "social-meetup" && !citizenSocialRequestIsValid(ped, ped.socialActivityRequest)) {
      ped.socialActivityRequest = null;
      ped.pendingActivity = null;
      ped.targetPlaceId = null;
      ped.state = "deciding";
      ped.visible = true;
      planCitizenAction(ped, ped.currentNodeId || ped.homeNodeId);
      return;
    }
    if (action.id === "social-meetup") ped.socialActivityRequest = null;
    if (action.id === "community_class") {
      const course = communityCenterModel.COURSES.find((value) => value.id === action.courseId);
      const now = (state.day - 1) * 1440 + state.minute;
      const sessionStart = Number(action.sessionStartAbsoluteMinute);
      if (
        !course ||
        !communityCenterModel.isCitizenCourseArrivalValid(
          course.id,
          sessionStart,
          state.day,
          state.minute,
          ped.money
        )
      ) {
        ped.pendingActivity = null;
        ped.targetPlaceId = null;
        ped.state = "deciding";
        ped.visible = true;
        planCitizenAction(ped, ped.currentNodeId || ped.homeNodeId);
        return;
      }
      ped.money -= course.cost;
      action = {
        ...action,
        duration:Math.max(8, sessionStart + course.duration - now),
        indoor:false,
        label:now < sessionStart
          ? course.skillName + "講座の開始待ち"
          : course.name + "に参加中"
      };
    }
    ped.pendingActivity = null;
    ped.currentActivityId = action.id;
    ped.currentActivityLabel = action.label || CITIZEN_ACTIVITY_LABELS[action.id] || action.id;
    ped.currentPlaceId = action.placeId || null;
    ped.currentNodeId = citizenActivityNode(action, ped);
    ped.targetNodeId = ped.currentNodeId;
    ped.activityMinutesRemaining = Math.max(8, Number(action.duration) || 60);
    ped.junctionTransition = null;
    ped.avoidanceTarget = 0;
    ped.avoidanceHold = 0;
    ped.state = action.indoor ? "inside" : "staying";
    ped.visible = ped.specialNpcId ? true : !action.indoor;
    ped.speed = ped.baseSpeed;
  }

  function completeCitizenActivity(ped) {
    const peers = citizenActivityPeerCount(ped, ped.currentPlaceId);
    switch (ped.currentActivityId) {
      case "sleep":
        ped.needs.energy += 70;
        ped.needs.hunger -= 7;
        ped.stress -= 24;
        break;
      case "work":
        ped.money += ped.wage;
        ped.needs.energy -= 13;
        ped.needs.hunger -= 14;
        ped.needs.fun -= 7;
        ped.stress += 18;
        ped.workedDay = state.day;
        break;
      case "eat_home":
        if (ped.groceries > 0) ped.groceries -= 1;
        ped.needs.hunger += 64;
        ped.needs.energy += 5;
        ped.stress -= 6;
        break;
      case "shop":
        if (ped.money >= 1200) {
          ped.money -= 1200;
          ped.groceries += 3;
        }
        ped.needs.fun += 2;
        break;
      case "eat_out":
        if (ped.money >= 900) ped.money -= 900;
        ped.needs.hunger += 58;
        ped.needs.social += 8 + Math.min(12, peers * 2);
        ped.needs.fun += 8;
        ped.stress -= 7;
        break;
      case "park":
        ped.needs.fun += 27;
        ped.needs.social += 8 + Math.min(16, peers * 2);
        ped.needs.energy += 5;
        ped.stress -= 28;
        break;
      case "gym":
        if (ped.money >= 500) ped.money -= 500;
        ped.needs.fun += 15;
        ped.needs.energy -= 13;
        ped.needs.hunger -= 9;
        ped.stress -= 18;
        break;
      case "library":
        ped.needs.fun += ped.jobType === "student" ? 8 : 14;
        ped.needs.energy -= 4;
        ped.stress -= 20;
        break;
      case "socialize":
        if (ped.currentPlaceId === "cafe" && ped.money >= 500) ped.money -= 500;
        ped.needs.social += 36 + Math.min(15, peers * 3);
        ped.needs.fun += 18;
        ped.stress -= 16;
        break;
      case "social-meetup":
        ped.needs.social += 30 + Math.min(12, peers * 2);
        ped.needs.fun += 18;
        ped.stress -= 12;
        break;
      case "community_class":
        ped.needs.social += 10 + Math.min(10, peers * 2);
        ped.needs.fun += 14 + Math.min(12, peers * 2);
        ped.needs.energy -= 4;
        ped.stress -= 16;
        break;
      case "home_idle":
        ped.needs.energy += 12;
        ped.needs.fun += 8;
        ped.stress -= 13;
        break;
    }
    citizenClampNeeds(ped);
    ped.currentActivityId = null;
    ped.currentActivityLabel = null;
    ped.currentPlaceId = null;
    ped.activityMinutesRemaining = 0;
    planCitizenAction(ped, ped.currentNodeId || ped.homeNodeId);
  }

  function planCitizenAction(ped, startNodeId) {
    const action = citizenSocialActivityFromRequest(ped) || chooseCitizenAction(ped);
    const targetNodeId = citizenActivityNode(action, ped);
    action.nodeId = targetNodeId;
    ped.pendingActivity = action;
    ped.targetNodeId = targetNodeId;
    ped.targetPlaceId = action.placeId || null;

    if (!targetNodeId || targetNodeId === startNodeId) {
      ped.currentNodeId = startNodeId || targetNodeId || ped.homeNodeId;
      beginCitizenActivity(ped, action);
      return true;
    }

    if (buildPedestrianPlan(ped, startNodeId, targetNodeId)) {
      ped.pendingActivity = action;
      ped.targetPlaceId = action.placeId || null;
      return true;
    }

    if (action.id === "social-meetup") {
      ped.socialActivityRequest = null;
      ped.pendingActivity = null;
      return planCitizenAction(ped, startNodeId);
    }

    if (startNodeId !== ped.homeNodeId && buildPedestrianPlan(ped, startNodeId, ped.homeNodeId)) {
      ped.pendingActivity = {
        id:"home_idle",
        label:CITIZEN_ACTIVITY_LABELS.home_idle,
        nodeId:ped.homeNodeId,
        duration:90,
        indoor:true
      };
      ped.targetPlaceId = null;
      return true;
    }

    ped.currentNodeId = startNodeId || ped.homeNodeId;
    beginCitizenActivity(ped, {
      id:"home_idle",
      label:CITIZEN_ACTIVITY_LABELS.home_idle,
      nodeId:ped.currentNodeId,
      duration:60,
      indoor:true
    });
    return false;
  }

  function pedestrianSidewalkLayout(edge, directionSign = 1) {
    if (!edge?.vehicle) {
      const baseOffset = Math.min(10, edge?.width * .2 || 10);
      return { baseOffset, maxAvoidance:Math.max(8, (edge?.width || 40) * .22) };
    }

    const corridor = mapModel.pedestrianCorridor?.(edge.id);
    const centerOffset = corridor?.centerOffset ?? (edge.width / 2 + 22);
    const outerOffset = corridor?.outerOffset ?? (edge.width / 2 + 40);

    // Opposing pedestrians on the same physical sidewalk use two subtle
    // walking lines. Because the normal reverses with directionSign, changing
    // the radial magnitude by +/-7 separates oncoming people without sending
    // anyone into the carriageway.
    const flowBias = directionSign > 0 ? 7 : -7;
    const baseOffset = centerOffset + flowBias;
    const maxAvoidance = Math.max(
      0,
      outerOffset - baseOffset - NPC_COLLISION_RADIUS - 2
    );
    return { baseOffset, maxAvoidance, corridor };
  }

  function pedestrianEdgePose(edge, directionSign, along, sideSign = 1, avoidanceOffset = 0) {
    const layout = pedestrianSidewalkLayout(edge, directionSign);
    const avoidance = clamp(
      Math.max(0, Number(avoidanceOffset) || 0),
      0,
      layout.maxAvoidance
    );
    const lateralOffset = (layout.baseOffset + avoidance) * (sideSign || 1);
    return mapModel.pedestrianOffsetPose(edge, along, directionSign, lateralOffset);
  }

  function pedestrianCornerControl(fromPose, toPose) {
    const ax = Math.cos(fromPose.angle);
    const ay = Math.sin(fromPose.angle);
    const bx = Math.cos(toPose.angle);
    const by = Math.sin(toPose.angle);
    const cross = ax * by - ay * bx;
    const midpoint = {
      x:(fromPose.x + toPose.x) * .5,
      y:(fromPose.y + toPose.y) * .5
    };
    if (Math.abs(cross) < .08) return midpoint;

    const dx = toPose.x - fromPose.x;
    const dy = toPose.y - fromPose.y;
    const t = (dx * by - dy * bx) / cross;
    const intersection = {
      x:fromPose.x + ax * t,
      y:fromPose.y + ay * t
    };
    const direct = Math.max(1, distance(fromPose.x, fromPose.y, toPose.x, toPose.y));
    if (
      distance(fromPose.x, fromPose.y, intersection.x, intersection.y) > direct * 2.4 + 24 ||
      distance(toPose.x, toPose.y, intersection.x, intersection.y) > direct * 2.4 + 24
    ) {
      return midpoint;
    }
    return intersection;
  }

  function pedestrianQuadraticPoint(from, control, to, t) {
    const inv = 1 - t;
    return {
      x:inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x,
      y:inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y
    };
  }

  function pedestrianQuadraticLength(from, control, to) {
    let total = 0;
    let previous = from;
    for (let i = 1; i <= 8; i += 1) {
      const point = pedestrianQuadraticPoint(from, control, to, i / 8);
      total += distance(previous.x, previous.y, point.x, point.y);
      previous = point;
    }
    return total;
  }

  function makePedestrianTransition(from, to) {
    const direct = distance(from.x, from.y, to.x, to.y);
    if (direct < 1.25) return null;
    const control = pedestrianCornerControl(from, to);
    return {
      from:{ ...from },
      control,
      to:{ ...to },
      length:Math.max(direct, pedestrianQuadraticLength(from, control, to)),
      progress:0
    };
  }

  function pedestrianTransitionPose(transition) {
    const t = transition.length > .001
      ? clamp(transition.progress / transition.length, 0, 1)
      : 1;
    const point = pedestrianQuadraticPoint(transition.from, transition.control, transition.to, t);
    const inv = 1 - t;
    const dx = 2 * inv * (transition.control.x - transition.from.x) +
      2 * t * (transition.to.x - transition.control.x);
    const dy = 2 * inv * (transition.control.y - transition.from.y) +
      2 * t * (transition.to.y - transition.control.y);
    return {
      x:point.x,
      y:point.y,
      angle:Math.hypot(dx, dy) > .001 ? Math.atan2(dy, dx) : transition.to.angle
    };
  }

  function makePedestrianJunctionTransition(ped, currentEdge, nextEdge, nextDirectionSign) {
    const currentAlong = ped.directionSign > 0 ? ped.edgeLength : 0;
    const nextLength = polylineLength(nextEdge.points);
    const nextAlong = nextDirectionSign > 0 ? 0 : nextLength;
    const from = pedestrianEdgePose(
      currentEdge,
      ped.directionSign,
      currentAlong,
      ped.sideSign,
      ped.avoidanceOffset
    );
    const to = pedestrianEdgePose(
      nextEdge,
      nextDirectionSign,
      nextAlong,
      ped.sideSign,
      ped.avoidanceOffset
    );
    return makePedestrianTransition(from, to);
  }

  function pedestrianPoseAt(ped) {
    if (ped.junctionTransition) return pedestrianTransitionPose(ped.junctionTransition);
    const edge = mapModel.getEdge(ped.edgeId);
    if (!edge) return { x:ped.x, y:ped.y, angle:ped.dir };
    return pedestrianEdgePose(
      edge,
      ped.directionSign,
      ped.along,
      ped.sideSign,
      ped.avoidanceOffset
    );
  }

  function pedestrianSignalState(ped) {
    // Once a pedestrian has entered the junction connector, never stop them
    // mid-corner because the signal changed for the next edge.
    if (ped.junctionTransition) return null;
    const edge = mapModel.getEdge(ped.edgeId);
    if (!edge) return null;
    const endpoint = ped.directionSign > 0 ? mapModel.getNode(edge.to) : mapModel.getNode(edge.from);
    if (!endpoint || !isSignalizedMapNode(endpoint.id)) return null;

    const geometry = signalGeometryAtNode(endpoint.id, edge);
    const distanceToSignal = ped.directionSign > 0 ? ped.edgeLength - ped.along : ped.along;
    const waitOffset = geometry.pedestrianWaitOffset;

    if (distanceToSignal > waitOffset + 100) return null;

    const pedestrianSignal = pedestrianSignalAt(endpoint.x, endpoint.y, edgeOrientation(edge));
    const beforeCrosswalk = distanceToSignal >= waitOffset;
    return {
      state:pedestrianSignal.state,
      lit:pedestrianSignal.lit,
      distance:distanceToSignal,
      waitOffset,
      beforeCrosswalk
    };
  }

  function citizenRemainingRouteDistance(ped) {
    const edge = mapModel.getEdge(ped.edgeId);
    if (!edge) return 0;
    let remaining = ped.directionSign > 0 ? ped.edgeLength - ped.along : ped.along;
    if (ped.junctionTransition) {
      remaining += Math.max(0, ped.junctionTransition.length - ped.junctionTransition.progress);
    }
    for (let i = ped.routeIndex + 1; i < (ped.routeEdgeIds?.length || 0); i += 1) {
      const next = mapModel.getEdge(ped.routeEdgeIds[i]);
      if (next) remaining += polylineLength(next.points);
    }
    return Math.max(0, remaining);
  }

  function moveCitizenAlongRoute(ped, distanceUnits) {
    let remaining = Math.max(0, distanceUnits);
    let transitions = 0;
    while (remaining > .001 && transitions < 20) {
      if (ped.junctionTransition) {
        const transition = ped.junctionTransition;
        const transitionRemaining = Math.max(0, transition.length - transition.progress);
        const step = Math.min(remaining, transitionRemaining);
        transition.progress += step;
        remaining -= step;

        if (transition.progress < transition.length - .001) break;
        transition.progress = transition.length;
        ped.junctionTransition = null;
        transitions += 1;
        continue;
      }

      const edge = mapModel.getEdge(ped.edgeId);
      if (!edge) return false;
      const edgeLength = ped.edgeLength || polylineLength(edge.points);
      ped.edgeLength = edgeLength;
      ped.along = clamp(ped.along, 0, edgeLength);
      const endpointDistance = ped.directionSign > 0 ? edgeLength - ped.along : ped.along;

      if (endpointDistance > .001 && remaining < endpointDistance) {
        ped.along = clamp(ped.along + ped.directionSign * remaining, 0, edgeLength);
        remaining = 0;
        break;
      }

      remaining = Math.max(0, remaining - endpointDistance);
      ped.along = ped.directionSign > 0 ? edgeLength : 0;
      const currentNodeId = ped.directionSign > 0 ? edge.to : edge.from;
      ped.currentNodeId = currentNodeId;
      const nextId = ped.routeEdgeIds?.[ped.routeIndex + 1];

      if (!nextId) {
        const pose = pedestrianPoseAt(ped);
        ped.x = pose.x;
        ped.y = pose.y;
        ped.dir = pose.angle;
        if (ped.socialActivityRequest && citizenSocialActivityFromRequest(ped)) {
          planCitizenAction(ped, currentNodeId);
          return true;
        }
        beginCitizenActivity(ped, ped.pendingActivity);
        return true;
      }

      const next = mapModel.getEdge(nextId);
      if (!next || (next.from !== currentNodeId && next.to !== currentNodeId)) {
        planCitizenAction(ped, currentNodeId);
        return false;
      }

      const nextDirectionSign = next.from === currentNodeId ? 1 : -1;
      const junctionTransition = makePedestrianJunctionTransition(
        ped,
        edge,
        next,
        nextDirectionSign
      );

      ped.routeIndex += 1;
      ped.edgeId = next.id;
      ped.directionSign = nextDirectionSign;
      ped.edgeLength = polylineLength(next.points);
      ped.along = ped.directionSign > 0 ? 0 : ped.edgeLength;
      ped.junctionTransition = junctionTransition;
      transitions += 1;
    }

    if (ped.state === "walking" || ped.state === "waiting") {
      const pose = pedestrianPoseAt(ped);
      ped.x = pose.x;
      ped.y = pose.y;
      ped.dir = pose.angle;
    }
    return false;
  }

  function pedestrianSpawnSpacing(edgeId, edgeLength, along) {
    let candidate = along;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const conflict = pedestrians.find((other) =>
        other.edgeId === edgeId && Math.abs(other.along - candidate) < 34
      );
      if (!conflict) break;
      candidate += candidate >= conflict.along ? 38 : -38;
      if (candidate < 8) candidate = Math.min(edgeLength - 8, conflict.along + 38);
      if (candidate > edgeLength - 8) candidate = Math.max(8, conflict.along - 38);
    }
    return clamp(candidate, 8, Math.max(8, edgeLength - 8));
  }

  function generatePedestrians() {
    pedestrians.length = 0;
    const homes = citizenHomeCandidates();
    const workPool = citizenWorkCandidates();
    const fallbackHome = { site:null, nodeId:HOME.entranceNodeId };

    for (let i = 0; i < CITIZEN_COUNT; i += 1) {
      const householdIndex = Math.floor(i / 2);
      const home = homes.length ? homes[householdIndex % homes.length] : fallbackHome;
      const profile = citizenProfile(i, home, workPool);
      const spawnNodeId = SOCIAL_NPC_SPAWN_NODES[profile.specialNpcId] || profile.homeNodeId;
      const ageSpeedFactor = profile.ageGroup === "senior" ? .80 + hash2(i, 82, 16026) * .10
        : profile.ageGroup === "mature" ? .92 + hash2(i, 82, 16026) * .08
          : profile.ageGroup === "young" ? 1.02 + hash2(i, 82, 16026) * .08
            : .97 + hash2(i, 82, 16026) * .08;
      const baseSpeed = (28 + hash2(i, 8, 96) * 14) * ageSpeedFactor;
      const ped = {
        ...profile,
        x:mapModel.getNode(spawnNodeId)?.x || HOME.x,
        y:mapModel.getNode(spawnNodeId)?.y || HOME.y,
        dir:hash2(i, 3, 90) * Math.PI * 2,
        timer:0,
        baseSpeed,
        speed:baseSpeed,
        color:["#c77f66","#718da7","#ba9b58","#8876a8","#71957a","#b26f67","#6f8fac"][i % 7],
        pants:["#394248","#554a45","#2f3b4d","#45464d"][i % 4],
        hair:["#302720","#4a3427","#1f2326","#684b36"][i % 4],
        skin:["#e5b394","#d49b77","#f0c3a4","#b97f62"][i % 4],
        appearance:personAppearanceFromSeed(i, profile),
        phase:hash2(i, 12, 97) * Math.PI * 2,
        seed:i + 41,
        sideSign:hash2(i, 14, 98) > .5 ? 1 : -1,
        money:3500 + Math.floor(hash2(i, 163, 1713) * 24000),
        groceries:1 + Math.floor(hash2(i, 167, 1714) * 4),
        needs:{
          hunger:46 + hash2(i, 173, 1715) * 50,
          energy:50 + hash2(i, 179, 1716) * 47,
          social:38 + hash2(i, 181, 1717) * 58,
          fun:40 + hash2(i, 191, 1718) * 55
        },
        stress:8 + hash2(i, 193, 1719) * 48,
        routeEdgeIds:[],
        routeIndex:0,
        tripCount:0,
        decisionCount:0,
        state:"deciding",
        visible:true,
        waitTimer:0,
        collisionWait:0,
        avoidanceOffset:0,
        avoidanceTarget:0,
        avoidanceHold:0,
        junctionTransition:null,
        stuckTimer:0,
        lastProgressX:null,
        lastProgressY:null,
        stuckRecoveryCount:0,
        stayTimer:0,
        activityMinutesRemaining:0,
        currentActivityId:null,
        currentActivityLabel:null,
        currentPlaceId:null,
        currentNodeId:spawnNodeId,
        targetNodeId:spawnNodeId,
        targetPlaceId:null,
        pendingActivity:null,
        socialActivityRequest:null,
        workedDay:0
      };

      planCitizenAction(ped, spawnNodeId);

      if (ped.state === "walking") {
        const initialAlong = profile.specialNpcId
          ? 0
          : Math.min(ped.edgeLength * (.04 + hash2(i, 197, 1720) * .28), Math.max(1, ped.edgeLength - 1));
        ped.along = ped.directionSign > 0 ? initialAlong : Math.max(0, ped.edgeLength - initialAlong);
        ped.along = pedestrianSpawnSpacing(ped.edgeId, ped.edgeLength, ped.along);
        const pose = pedestrianPoseAt(ped);
        ped.x = pose.x;
        ped.y = pose.y;
        ped.dir = pose.angle;
      }

      pedestrians.push(ped);
    }
  }


  function seedPedestriansNearActor() {
    // Citizens now keep persistent homes, jobs and routes. Do not teleport a
    // subset near the player just to manufacture crowd density.
  }


  function trainById(id) {
    return trains.find((train) => train.id === id) || null;
  }

  function stoppedStationForTrain(train) {
    if (!train || train.dwell <= 0.05) return null;
    return TRAIN_STATIONS[train.stationIndex] || null;
  }

  function nearestRailStationAccess(x, y, maxDistance = 125) {
    let best = null;
    let bestDistance = maxDistance;
    for (const station of TRAIN_STATIONS) {
      const d = distance(x, y, station.accessX, station.accessY);
      if (d < bestDistance) {
        best = station;
        bestDistance = d;
      }
    }
    return best;
  }

  function stoppedTrainAtStation(station) {
    if (!station) return null;
    return trains.find((train) => train.stationIndex === TRAIN_STATIONS.indexOf(station) && train.dwell > .05) || null;
  }

  function updateTrainSystem(dt) {
    for (const train of trains) {
      if (train.dwell > 0) {
        train.dwell = Math.max(0, train.dwell - dt);
        train.speed = 0;
        continue;
      }

      const target = TRAIN_STATIONS[train.targetIndex];
      if (!target) continue;

      const direction = Math.sign(target.x - train.x) || train.direction;
      train.speed += (TRAIN_SPEED - train.speed) * Math.min(1, dt * 2.2);
      const nextX = train.x + direction * train.speed * dt;
      const arrived = direction > 0 ? nextX >= target.x : nextX <= target.x;

      if (arrived) {
        train.x = target.x;
        train.stationIndex = train.targetIndex;
        train.speed = 0;
        train.dwell = TRAIN_DWELL_SECONDS;

        let nextIndex = train.stationIndex + train.direction;
        if (nextIndex < 0 || nextIndex >= TRAIN_STATIONS.length) {
          train.direction *= -1;
          nextIndex = train.stationIndex + train.direction;
        }
        train.targetIndex = nextIndex;
      } else {
        train.x = clamp(nextX, RAIL_MIN_X, RAIL_MAX_X);
      }
    }

    if (state.player.inTrain) {
      const train = trainById(state.player.trainId);
      if (!train) {
        state.player.inTrain = false;
        state.player.trainId = null;
        return;
      }
      state.player.x = train.x;
      state.player.y = train.y;
    }
  }

  function boardTrain(train, station) {
    if (state.petWalk.active) {
      showToast("散歩中は犬と一緒に帰宅してから乗車してください");
      return;
    }
    if (!train || !station || train.dwell <= .05) {
      showToast("電車はまだ到着していません");
      return;
    }
    state.player.inVehicle = false;
    state.player.inTrain = true;
    state.player.trainId = train.id;
    state.player.x = train.x;
    state.player.y = train.y;
    showToast(station.name + "から若葉線に乗車しました");
  }

  function exitTrain() {
    const train = trainById(state.player.trainId);
    const station = stoppedStationForTrain(train);
    if (!train || !station) {
      showToast("駅に停車してから降りてください");
      return;
    }

    state.player.inTrain = false;
    state.player.trainId = null;
    state.player.x = station.accessX;
    state.player.y = station.accessY;
    state.player.facingX = 0;
    state.player.facingY = 1;
    showToast(station.name + "で降りました");
  }

  function actorPosition() {
    if (state.player.inHome) return { x:HOME.x, y:HOME.y };
    if (state.player.inTrain) {
      const train = trainById(state.player.trainId);
      if (train) return { x: train.x, y: train.y };
    }
    return state.player.inVehicle ? { x: personalCar.x, y: personalCar.y } : { x: state.player.x, y: state.player.y };
  }

  function angleWrap(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function closestPointOnRoadEdge(x, y, axis, roadIndex, segmentIndex) {
    const steps = 20;
    const points = sampleRoadEdge(axis, roadIndex, segmentIndex, steps);
    let best = null;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length2 = dx * dx + dy * dy;
      const u = length2 < .001 ? 0 : clamp(((x - a.x) * dx + (y - a.y) * dy) / length2, 0, 1);
      const px = a.x + dx * u;
      const py = a.y + dy * u;
      const d = distance(x, y, px, py);
      if (!best || d < best.distance) {
        best = {
          x:px,
          y:py,
          t:((i - 1) + u) / steps,
          distance:d
        };
      }
    }
    return best;
  }

  function roadSnap(x, y) {
    const gx = Math.floor(x / ROAD_GAP);
    const gy = Math.floor(y / ROAD_GAP);
    let best = null;

    for (let ix = gx - 3; ix <= gx + 3; ix += 1) {
      for (let iy = gy - 3; iy <= gy + 3; iy += 1) {
        if (roadEdgeExists(ix, iy, ix + 1, iy)) {
          const hit = closestPointOnRoadEdge(x, y, "h", iy, ix);
          if (hit && (!best || hit.distance < best.distance)) {
            best = {
              ...hit,
              orientation:"h",
              axis:"h",
              roadIndex:iy,
              segmentIndex:ix,
              a:{ gx:ix, gy:iy },
              b:{ gx:ix + 1, gy:iy }
            };
          }
        }
        if (roadEdgeExists(ix, iy, ix, iy + 1)) {
          const hit = closestPointOnRoadEdge(x, y, "v", ix, iy);
          if (hit && (!best || hit.distance < best.distance)) {
            best = {
              ...hit,
              orientation:"v",
              axis:"v",
              roadIndex:ix,
              segmentIndex:iy,
              a:{ gx:ix, gy:iy },
              b:{ gx:ix, gy:iy + 1 }
            };
          }
        }
      }
    }

    if (!best) {
      return {
        x, y,
        orientation:"h",
        axis:"h",
        roadIndex:Math.round(y / ROAD_GAP),
        segmentIndex:Math.floor(x / ROAD_GAP),
        t:.5,
        a:{ gx:routeGridBounds(Math.floor(x / ROAD_GAP)), gy:routeGridBounds(Math.round(y / ROAD_GAP)) },
        b:{ gx:routeGridBounds(Math.ceil(x / ROAD_GAP)), gy:routeGridBounds(Math.round(y / ROAD_GAP)) },
        distance:Infinity
      };
    }
    best.nearestNode = best.t <= .5 ? best.a : best.b;
    return best;
  }

  function destinationRoadPoint(place) {
    return roadSnap(place.x, place.y);
  }

  function nextIntersectionAhead(start, orientation, direction) {
    if (start && start.a && start.b) {
      if (orientation === "h") return direction.x >= 0 ? start.b : start.a;
      return direction.y >= 0 ? start.b : start.a;
    }
    return start.nearestNode || start.a;
  }

  function cardinalDirection(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
    return { x: 0, y: dy >= 0 ? 1 : -1 };
  }

  function laneNormal(direction) {
    return { x: direction.y, y: -direction.x };
  }

  function lanePoint(point, direction) {
    const normal = laneNormal(direction);
    return {
      x: point.x + normal.x * LANE_OFFSET,
      y: point.y + normal.y * LANE_OFFSET
    };
  }

  function appendLine(points, from, to, step = ROUTE_SAMPLE_STEP) {
    const d = distance(from.x, from.y, to.x, to.y);
    if (d < 0.5) {
      if (!points.length) points.push({ x: to.x, y: to.y });
      return;
    }
    const count = Math.max(1, Math.ceil(d / step));
    for (let i = points.length ? 1 : 0; i <= count; i += 1) {
      const t = i / count;
      points.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      });
    }
  }

  function appendCubic(points, p0, c1, c2, p1) {
    const estimate =
      distance(p0.x, p0.y, c1.x, c1.y) +
      distance(c1.x, c1.y, c2.x, c2.y) +
      distance(c2.x, c2.y, p1.x, p1.y);
    const count = Math.max(7, Math.ceil(estimate / ROUTE_SAMPLE_STEP));
    for (let i = 1; i <= count; i += 1) {
      const t = i / count;
      const u = 1 - t;
      points.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
      });
    }
  }

  function routeGridBounds(value) {
    return clamp(value, 1, Math.floor(WORLD_SIZE / ROAD_GAP) - 1);
  }

  function nextIntersectionAhead(start, orientation, direction) {
    if (orientation === "h") {
      const gx = direction.x > 0
        ? Math.ceil((start.x + 3) / ROAD_GAP)
        : Math.floor((start.x - 3) / ROAD_GAP);
      return { gx: routeGridBounds(gx), gy: routeGridBounds(Math.round(start.y / ROAD_GAP)) };
    }
    const gy = direction.y > 0
      ? Math.ceil((start.y + 3) / ROAD_GAP)
      : Math.floor((start.y - 3) / ROAD_GAP);
    return { gx: routeGridBounds(Math.round(start.x / ROAD_GAP)), gy: routeGridBounds(gy) };
  }

  function gridRoute(startNode, goalNode, initialDirection) {
    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ];
    const dirIndex = directions.findIndex((dir) => dir.x === initialDirection.x && dir.y === initialDirection.y);
    const startKey = startNode.gx + "," + startNode.gy + "," + Math.max(0, dirIndex);
    const open = [{ gx: startNode.gx, gy: startNode.gy, dir: Math.max(0, dirIndex), g: 0, f: 0, key: startKey }];
    const best = new Map([[startKey, 0]]);
    const previous = new Map();
    let goalKey = null;

    const heuristic = (gx, gy) => Math.abs(goalNode.gx - gx) + Math.abs(goalNode.gy - gy);

    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (current.gx === goalNode.gx && current.gy === goalNode.gy) {
        goalKey = current.key;
        break;
      }

      for (let nextDir = 0; nextDir < directions.length; nextDir += 1) {
        const move = directions[nextDir];
        const ngx = current.gx + move.x;
        const ngy = current.gy + move.y;
        if (ngx < 1 || ngy < 1 || ngx > 17 || ngy > 17) continue;
        if (!roadEdgeExists(current.gx, current.gy, ngx, ngy)) continue;

        const reverse = (nextDir + 2) % 4 === current.dir;
        const turn = nextDir !== current.dir;
        const stepCost = reverse ? 8 : turn ? 1.28 : 1;
        const g = current.g + stepCost;
        const key = ngx + "," + ngy + "," + nextDir;
        if (best.has(key) && best.get(key) <= g) continue;

        best.set(key, g);
        previous.set(key, current.key);
        open.push({
          gx: ngx,
          gy: ngy,
          dir: nextDir,
          g,
          f: g + heuristic(ngx, ngy),
          key
        });
      }
    }

    if (!goalKey) return [startNode];

    const nodes = [];
    let key = goalKey;
    while (key) {
      const [gx, gy, dir] = key.split(",").map(Number);
      nodes.push({ gx, gy, dir });
      if (key === startKey) break;
      key = previous.get(key);
    }
    nodes.reverse();
    return nodes;
  }

  function chaikinSmooth(points, iterations = 2) {
    let current = points.slice();
    for (let pass = 0; pass < iterations; pass += 1) {
      if (current.length < 3) break;
      const next = [current[0]];
      for (let i = 0; i < current.length - 1; i += 1) {
        const a = current[i];
        const b = current[i + 1];
        next.push({
          x:a.x * .75 + b.x * .25,
          y:a.y * .75 + b.y * .25
        });
        next.push({
          x:a.x * .25 + b.x * .75,
          y:a.y * .25 + b.y * .75
        });
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  }

  function buildLanePath(centerline) {
    const clean = [];
    for (const point of centerline) {
      const previous = clean[clean.length - 1];
      if (!previous || distance(previous.x, previous.y, point.x, point.y) > 2) clean.push(point);
    }
    if (clean.length < 2) return [{ x:personalCar.x, y:personalCar.y }];

    const smooth = chaikinSmooth(clean, 2);
    const lanePoints = [];

    for (let i = 0; i < smooth.length; i += 1) {
      const previous = smooth[Math.max(0, i - 1)];
      const next = smooth[Math.min(smooth.length - 1, i + 1)];
      let tx = next.x - previous.x;
      let ty = next.y - previous.y;
      const mag = Math.hypot(tx, ty) || 1;
      tx /= mag;
      ty /= mag;
      const nx = ty;
      const ny = -tx;
      const roadHit = mapModel.nearestRoad(smooth[i].x, smooth[i].y, { vehicleOnly: true });
      const laneOffset = roadHit
        ? Math.min(LANE_OFFSET, Math.max(14, roadHit.edge.width / 2 - 18))
        : LANE_OFFSET;
      lanePoints.push({
        x:smooth[i].x + nx * laneOffset,
        y:smooth[i].y + ny * laneOffset
      });
    }

    const points = [{ x:personalCar.x, y:personalCar.y }];
    appendLine(points, points[0], lanePoints[0], 10);
    for (let i = 1; i < lanePoints.length; i += 1) {
      appendLine(points, points[points.length - 1], lanePoints[i], ROUTE_SAMPLE_STEP);
    }
    return points;
  }

  function roadEdgePointsBetweenNodes(a, b, steps = 10) {
    if (a.gy === b.gy && Math.abs(a.gx - b.gx) === 1) {
      const segmentIndex = Math.min(a.gx, b.gx);
      const points = sampleRoadEdge("h", a.gy, segmentIndex, steps);
      return b.gx > a.gx ? points : points.reverse();
    }
    if (a.gx === b.gx && Math.abs(a.gy - b.gy) === 1) {
      const segmentIndex = Math.min(a.gy, b.gy);
      const points = sampleRoadEdge("v", a.gx, segmentIndex, steps);
      return b.gy > a.gy ? points : points.reverse();
    }
    return [
      { x:a.gx * ROAD_GAP, y:a.gy * ROAD_GAP },
      { x:b.gx * ROAD_GAP, y:b.gy * ROAD_GAP }
    ];
  }

  function partialRoadEdgePoints(snap, node, fromSnap) {
    const full = sampleRoadEdge(snap.axis, snap.roadIndex, snap.segmentIndex, 16);
    const nodeIsB = node.gx === snap.b.gx && node.gy === snap.b.gy;

    if (fromSnap) {
      const ordered = nodeIsB ? full : full.slice().reverse();
      const snapIndex = Math.round((nodeIsB ? snap.t : 1 - snap.t) * 16);
      const points = [{ x:snap.x, y:snap.y }];
      for (let i = snapIndex + 1; i < ordered.length; i += 1) points.push(ordered[i]);
      return points;
    }

    const ordered = nodeIsB ? full.slice().reverse() : full;
    const snapIndex = Math.round((nodeIsB ? 1 - snap.t : snap.t) * 16);
    const points = [];
    for (let i = 0; i <= snapIndex; i += 1) points.push(ordered[i]);
    points.push({ x:snap.x, y:snap.y });
    return points;
  }


  function edgeProjectionPointsToNode(edge, hit, nodeId) {
    if (!edge || !hit) return [];
    const segmentIndex = clamp(Math.floor(hit.segmentIndex), 0, edge.points.length - 2);
    if (nodeId === edge.from) {
      return [{ x:hit.point.x, y:hit.point.y }, ...edge.points.slice(0, segmentIndex + 1).reverse()];
    }
    if (nodeId === edge.to) {
      return [{ x:hit.point.x, y:hit.point.y }, ...edge.points.slice(segmentIndex + 1)];
    }
    return [{ x:hit.point.x, y:hit.point.y }];
  }

  function appendDistinctPoints(target, source) {
    for (const point of source) {
      const previous = target[target.length - 1];
      if (!previous || distance(previous.x, previous.y, point.x, point.y) > 1) target.push(point);
    }
  }

  function nearestPathIndex(points, x, y) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const d = distance(points[i].x, points[i].y, x, y);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function buildLegacyDrivingRoute(place) {
    const start = roadSnap(personalCar.x, personalCar.y);
    let initialDirection;
    if (start.orientation === "h") {
      const sign = Math.abs(Math.cos(personalCar.angle)) > 0.25
        ? (Math.cos(personalCar.angle) >= 0 ? 1 : -1)
        : (place.x >= personalCar.x ? 1 : -1);
      initialDirection = { x:sign, y:0 };
    } else {
      const sign = Math.abs(Math.sin(personalCar.angle)) > 0.25
        ? (Math.sin(personalCar.angle) >= 0 ? 1 : -1)
        : (place.y >= personalCar.y ? 1 : -1);
      initialDirection = { x:0, y:sign };
    }

    let firstNode = nextIntersectionAhead(start, start.orientation, initialDirection);
    const end = destinationRoadPoint(place);
    const goalNode = end.nearestNode || end.a;

    let gridNodes = gridRoute(firstNode, goalNode, initialDirection);

    // A saved car may face the dead-end side of a local street. If routing from
    // that endpoint fails, route through the opposite endpoint instead.
    if (
      gridNodes.length === 1 &&
      (firstNode.gx !== goalNode.gx || firstNode.gy !== goalNode.gy)
    ) {
      const alternate = firstNode.gx === start.a.gx && firstNode.gy === start.a.gy ? start.b : start.a;
      const alternateDirection = start.orientation === "h"
        ? { x:alternate.gx > firstNode.gx ? 1 : -1, y:0 }
        : { x:0, y:alternate.gy > firstNode.gy ? 1 : -1 };
      const retry = gridRoute(alternate, goalNode, alternateDirection);
      if (retry.length > 1 || (alternate.gx === goalNode.gx && alternate.gy === goalNode.gy)) {
        firstNode = alternate;
        gridNodes = retry;
        initialDirection = alternateDirection;
      }
    }

    const centerline = [];
    appendDistinctPoints(centerline, partialRoadEdgePoints(start, firstNode, true));

    for (let i = 1; i < gridNodes.length; i += 1) {
      appendDistinctPoints(centerline, roadEdgePointsBetweenNodes(gridNodes[i - 1], gridNodes[i], 10));
    }

    if (gridNodes.length) {
      const lastNode = gridNodes[gridNodes.length - 1];
      if (lastNode.gx === goalNode.gx && lastNode.gy === goalNode.gy) {
        appendDistinctPoints(centerline, partialRoadEdgePoints(end, goalNode, false));
      }
    }

    if (centerline.length < 2) {
      centerline.push({ x:start.x, y:start.y }, { x:end.x, y:end.y });
    }

    const points = buildLanePath(centerline);
    const signals = [];
    for (let i = 0; i < gridNodes.length; i += 1) {
      const node = gridNodes[i];
      if (!isSignalizedIntersection(node.gx, node.gy)) continue;
      const incoming = i > 0
        ? cardinalDirection(node.gx - gridNodes[i - 1].gx, node.gy - gridNodes[i - 1].gy)
        : initialDirection;
      const orientation = incoming.x !== 0 ? "h" : "v";
      const x = node.gx * ROAD_GAP;
      const y = node.gy * ROAD_GAP;
      signals.push({
        x,
        y,
        orientation,
        stopOffset:stopLineOffsetAt(node.gx, node.gy),
        pathIndex:nearestPathIndex(points, x, y)
      });
    }

    return { points, signals };
  }

  function buildDrivingRoute(place) {
    const startHit = mapModel.nearestRoad(personalCar.x, personalCar.y, { vehicleOnly: true });
    const destinationNode = mapModel.getNode(place.roadNodeId);
    if (!startHit || !destinationNode) {
      return { points: [{ x: personalCar.x, y: personalCar.y }, { x: place.x, y: place.y }], signals: [] };
    }

    const edge = startHit.edge;
    const from = mapModel.getNode(edge.from);
    const to = mapModel.getNode(edge.to);
    const fromStartPoints = edgeProjectionPointsToNode(edge, startHit, from.id);
    const toStartPoints = edgeProjectionPointsToNode(edge, startHit, to.id);
    const fromRoute = mapModel.findRoute(from.id, destinationNode.id, { mode: "vehicle" });
    const toRoute = mapModel.findRoute(to.id, destinationNode.id, { mode: "vehicle" });
    const fromCost = fromRoute ? polylineLength(fromStartPoints) + fromRoute.distance : Infinity;
    const toCost = toRoute ? polylineLength(toStartPoints) + toRoute.distance : Infinity;
    const startNode = fromCost <= toCost ? from : to;
    const route = startNode === from ? fromRoute : toRoute;
    if (!route) return { points: [{ x: personalCar.x, y: personalCar.y }, { x: destinationNode.x, y: destinationNode.y }], signals: [] };

    const centerline = [{ x: personalCar.x, y: personalCar.y }];
    appendDistinctPoints(centerline, startNode === from ? fromStartPoints : toStartPoints);

    let currentNodeId = startNode.id;
    for (const edgeId of route.edgeIds) {
      const routeEdge = mapModel.getEdge(edgeId);
      if (!routeEdge) continue;
      const points = currentNodeId === routeEdge.from ? routeEdge.points : routeEdge.points.slice().reverse();
      appendDistinctPoints(centerline, points);
      currentNodeId = currentNodeId === routeEdge.from ? routeEdge.to : routeEdge.from;
    }
    appendDistinctPoints(centerline, [{ x: destinationNode.x, y: destinationNode.y }]);

    const points = buildLanePath(centerline);
    const signals = [];
    for (let i = 1; i < route.nodeIds.length; i += 1) {
      const node = mapModel.getNode(route.nodeIds[i]);
      const previousNode = mapModel.getNode(route.nodeIds[i - 1]);
      const routeEdge = mapModel.getEdge(route.edgeIds[i - 1]);
      if (!node || !previousNode || !routeEdge || !isSignalizedMapNode(node.id)) continue;
      const orientation = Math.abs(node.x - previousNode.x) >= Math.abs(node.y - previousNode.y) ? "h" : "v";
      signals.push({
        x: node.x,
        y: node.y,
        orientation,
        stopOffset: signalGeometryAtNode(node.id, routeEdge).stopOffset,
        pathIndex: nearestPathIndex(points, node.x, node.y)
      });
    }
    return { points, signals };
  }


  function updateRouteProgress() {
    const route = state.drive.route;
    if (!route.length) return;
    const start = Math.max(0, state.drive.routeIndex - 3);
    const end = Math.min(route.length - 1, state.drive.routeIndex + 36);
    let bestIndex = state.drive.routeIndex;
    let bestDistance = Infinity;
    for (let i = start; i <= end; i += 1) {
      const d = distance(personalCar.x, personalCar.y, route[i].x, route[i].y);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    state.drive.routeIndex = Math.max(state.drive.routeIndex, bestIndex);
    while (
      state.drive.routeIndex < route.length - 1 &&
      distance(personalCar.x, personalCar.y, route[state.drive.routeIndex].x, route[state.drive.routeIndex].y) < 22
    ) {
      state.drive.routeIndex += 1;
    }
  }

  function routeLookaheadTarget() {
    const route = state.drive.route;
    if (!route.length) return null;
    const lookahead = 42 + personalCar.speed * .13;
    let index = state.drive.routeIndex;
    let previous = { x:personalCar.x, y:personalCar.y };
    let accumulated = 0;
    while (index < route.length) {
      accumulated += distance(previous.x, previous.y, route[index].x, route[index].y);
      if (accumulated >= lookahead) return route[index];
      previous = route[index];
      index += 1;
    }
    return route[route.length - 1];
  }

  function routeDistanceToIndex(targetIndex) {
    const route = state.drive.route;
    if (!route.length) return Infinity;
    const startIndex = clamp(state.drive.routeIndex, 0, route.length - 1);
    const endIndex = clamp(targetIndex, 0, route.length - 1);

    if (endIndex < startIndex) {
      let behind = 0;
      let previous = { x:personalCar.x, y:personalCar.y };
      for (let i = startIndex; i >= endIndex; i -= 1) {
        behind += distance(previous, route[i]);
        previous = route[i];
      }
      return -behind;
    }

    let total = 0;
    let previous = { x:personalCar.x, y:personalCar.y };
    for (let i = startIndex; i <= endIndex; i += 1) {
      total += distance(previous, route[i]);
      previous = route[i];
    }
    return total;
  }

  function upcomingSignal() {
    let best = null;
    for (const signal of state.drive.signals) {
      if (signal.pathIndex < state.drive.routeIndex - 4) continue;
      if (signal.pathIndex > state.drive.routeIndex + 46) continue;

      const routeDistance = routeDistanceToIndex(signal.pathIndex);
      if (routeDistance > 280 || routeDistance < -70) continue;

      if (!best || signal.pathIndex < best.pathIndex) {
        best = {
          state:signalStateAt(signal.x, signal.y, signal.orientation),
          distance:routeDistance,
          key:Math.round(signal.x) + ":" + Math.round(signal.y) + ":" + signal.orientation,
          stopOffset:signal.stopOffset || STOP_LINE_OFFSET,
          pathIndex:signal.pathIndex
        };
      }
    }
    return best;
  }


  function leadVehicleInfo() {
    const hx = Math.cos(personalCar.angle);
    const hy = Math.sin(personalCar.angle);
    let best = null;
    for (const car of traffic) {
      const dx = car.x - personalCar.x;
      const dy = car.y - personalCar.y;
      const forward = dx * hx + dy * hy;
      if (forward <= 0 || forward > 280) continue;
      const lateral = Math.abs(dx * -hy + dy * hx);
      if (lateral > 72) continue;
      const sameDirection = Math.cos(car.angle) * hx + Math.sin(car.angle) * hy;
      if (sameDirection < .35) continue;
      if (!best || forward < best.distance) best = { car, distance:forward };
    }
    return best;
  }

  function penalizeDriving(amount, message) {
    state.drive.score = clamp(state.drive.score - amount, 0, 100);
    if (message) showToast(message);
  }

  function setDrivingDestination(place) {
    state.drive.destination = place.id;
    const plan = buildDrivingRoute(place);
    state.drive.route = plan.points;
    state.drive.signals = plan.signals;
    state.drive.routeIndex = 0;
    state.drive.score = 100;
    state.drive.speedingTimer = 0;
    state.drive.gapTimer = 0;
    state.drive.violationKeys = new Set();
    showToast(place.name + "へのルートを設定しました。W / ↑ または ACCEL で発進");
    requestAnimationFrame(focusGameCanvas);
  }

  function completeDrivingTrip() {
    const destination = PLACES.find((place) => place.id === state.drive.destination);
    state.drive.trips += 1;
    state.drive.rating = Math.round(((state.drive.rating * (state.drive.trips - 1)) + state.drive.score) / state.drive.trips);
    state.needs.fun += state.drive.score >= 90 ? 5 : 2;
    clampNeeds();
    showToast((destination ? destination.name : "目的地") + "に到着　運転評価 " + state.drive.score);
    state.drive.route = [];
    state.drive.routeIndex = 0;
    state.drive.signals = [];
    if (state.phone?.waypoint === state.drive.destination) state.phone.waypoint = null;
    state.drive.destination = null;
    personalCar.speed = 0;
  }

  function openDrivingMenu() {
    actionTitle.textContent = "カーナビ";
    actionDescription.textContent = "目的地を選ぶとルートは自動で設定されます。運転中は速度だけを操作します。";
    actionChoices.replaceChildren();

    for (const place of PLACES) {
      addChoice(
        place.name,
        state.drive.destination === place.id ? "現在の目的地" : "ルートを設定",
        () => setDrivingDestination(place),
        state.drive.destination === place.id
      );
    }

    addChoice("車から降りる", "完全に停止しているときのみ", () => exitCar(), Math.abs(personalCar.speed) > 8);
    actionSheet.hidden = false;
  }

  function currentDistrict(x, y) {
    return mapModel.districtAt(x, y)?.name || "City Days";
  }

  function clampNeeds() {
    for (const key of Object.keys(state.needs)) state.needs[key] = clamp(state.needs[key], 0, 100);
  }

  function syncWeather(announce = false) {
    const previous = state.visual.weather;
    state.visual.weather = weatherSystem.getWeatherAt(state.day, state.minute);
    if (announce && previous !== state.visual.weather) {
      if (state.visual.weather === "rain") showToast("雨が降ってきました");
      if (state.visual.weather === "clear") showToast("空が晴れてきました");
    }
  }

  function decayNeeds(minutes) {
    state.needs.hunger -= minutes * 0.018;
    state.needs.energy -= minutes * 0.015;
    state.needs.hygiene -= minutes * 0.009;
    state.needs.social -= minutes * 0.004;
    state.needs.fun -= minutes * 0.006;
    state.needs.hygiene -= weatherSystem.getOutdoorHygienePenalty(state.day, state.minute, minutes, {
      sheltered:state.player.inHome || state.player.inVehicle || state.player.inTrain,
      umbrellaOwned:state.umbrellaOwned === true
    });
    state.needs.health = playerHealthModel.advanceHealth(state.needs.health, state.needs, minutes);
    clampNeeds();
  }

  function isPlayerUsingUmbrella() {
    return state.umbrellaOwned === true && state.visual.weather === "rain" &&
      !state.player.inHome && !state.player.inVehicle && !state.player.inTrain;
  }

  function buyUmbrella() {
    if (state.umbrellaOwned === true) return { ok:false, reason:"already-owned" };
    if (state.cash < 600) return { ok:false, reason:"insufficient-funds" };
    state.cash -= 600;
    state.umbrellaOwned = true;
    advanceTime(5);
    updateSmartphone();
    return { ok:true };
  }

  function chargeRentIfNeeded() {
    if (state.day > 1 && (state.day - 1) % 7 === 0) {
      state.cash -= RENT;
      showToast("家賃 ¥" + RENT.toLocaleString("ja-JP") + " を支払いました");
    }
  }

  function advanceTime(minutes, decay = true, updateCitizens = true) {
    if (decay) decayNeeds(minutes);
    state.petCompanion = petCompanionModel.advance(state.petCompanion, minutes);
    state.minute += minutes;
    while (state.minute >= 1440) {
      state.minute -= 1440;
      state.day += 1;
      chargeRentIfNeeded();
    }
    while (state.minute < 0) {
      state.minute += 1440;
      state.day = Math.max(1, state.day - 1);
    }
    syncWeather(true);
    state.garden = communityGardenModel.advance(
      state.garden,
      communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute))
    );
    state.packedMeals = packedMealsModel.expire(
      state.packedMeals,
      communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute))
    );
    if (updateCitizens) fastForwardCitizens(minutes);
  }

  function nextRentDay() {
    return Math.floor((state.day - 1) / 7 + 1) * 7 + 1;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = 2.6;
  }

  function focusGameCanvas() {
    try {
      canvas.focus({ preventScroll: true });
    } catch (_) {
      canvas.focus();
    }
  }

  function closeActionSheet() {
    actionSheet.hidden = true;
    actionChoices.replaceChildren();
    requestAnimationFrame(focusGameCanvas);
  }

  function addChoice(title, detail, handler, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = disabled;
    const b = document.createElement("b");
    b.textContent = title;
    const span = document.createElement("span");
    span.textContent = detail;
    button.append(b, span);
    button.addEventListener("click", () => {
      if (disabled) return;
      handler();
      closeActionSheet();
      });
    actionChoices.appendChild(button);
  }

  function getDeliveryTimeRemaining(active = state.deliveryWork?.active) {
    if (!active) return null;
    return active.deadlineAbsoluteMinute - ((state.day - 1) * 1440 + Math.floor(state.minute));
  }

  function completeActiveDelivery(place) {
    const result = deliveryWorkModel.completeDelivery(state.deliveryWork, state.day, Math.floor(state.minute), place.id);
    if (!result.ok) {
      showToast(result.reason === "wrong-destination" ? "納品先が違います" : "配達中の荷物がありません");
      return;
    }
    state.deliveryWork = result.progress;
    state.cash += result.payout;
    if (state.phone.waypoint === result.offer.destinationPlaceId) state.phone.waypoint = null;
    advanceTime(2);
    showToast((result.late ? "遅延配達 · " : "時間内に配達 · ") + result.offer.parcelName + " +¥" + result.payout.toLocaleString("ja-JP"));
  }

  function placeName(placeId) {
    return PLACES.find((place) => place.id === placeId)?.name || "目的地";
  }

  function canPay(amount) {
    if (state.cash < amount) {
      showToast("お金が足りません");
      return false;
    }
    return true;
  }

  function minutesUntil(hour, minute = 0) {
    const target = hour * 60 + minute;
    if (state.minute < target) return target - state.minute;
    return 1440 - state.minute + target;
  }

  function homeFixtureById(id) {
    return HOME_FIXTURES.find((fixture) => fixture.id === id) || null;
  }

  function canHomeOccupy(x, y, radius = PLAYER_RADIUS) {
    const wall = 28;
    if (
      x - radius < wall ||
      y - radius < wall ||
      x + radius > HOME_INTERIOR.width - wall ||
      y + radius > HOME_INTERIOR.height - wall
    ) return false;

    for (const obstacle of HOME_OBSTACLES) {
      if (circleRectCollision(x, y, radius, obstacle)) return false;
    }
    return true;
  }

  function enterHome() {
    if (state.player.inVehicle || state.player.inTrain) return;
    if (state.petWalk.active) {
      if (distance(state.player.x, state.player.y, state.petWalk.petX, state.petWalk.petY) > 90) {
        showToast((state.petCompanion.pet?.name || "犬") + "が追いつくまで少し待ってください");
        return false;
      }
      const result = petCompanionModel.completeWalk(state.petCompanion, state.petWalk.elapsedMinutes, state.petWalk.distance);
      if (!result.ok) {
        showToast("散歩を完了できません。犬と一緒に帰宅してください");
        return false;
      }
      state.petCompanion = result.progress;
      state.petWalk = petWalkModel.clearWalkState();
      showToast(state.petCompanion.pet.name + (result.quality === "regular" ? "との散歩を終えました" : "と短い散歩を終えました"));
    }
    state.player.outdoorHomeX = state.player.x;
    state.player.outdoorHomeY = state.player.y;
    state.player.inHome = true;
    state.player.homeX = HOME_INTERIOR.width / 2;
    state.player.homeY = HOME_INTERIOR.height - 76;
    state.player.facingX = 0;
    state.player.facingY = -1;
    touch.x = 0;
    touch.y = 0;
    showToast("自宅に入りました");
    return true;
  }

  function startDogWalk() {
    const pet = state.petCompanion.pet;
    if (!state.player.inHome || !pet || pet.speciesId !== "dog" || pet.energy < 15 || state.petWalk.active) {
      showToast(pet?.speciesId === "cat" ? "猫は家の中で遊んであげましょう" : pet?.energy < 15 ? pet.name + "は散歩するには疲れています" : "今は散歩に出られません");
      return false;
    }
    exitHome();
    const result = petWalkModel.beginWalk(state.petWalk, { x:state.player.x, y:state.player.y });
    if (!result.ok) {
      state.player.inHome = true;
      showToast("散歩を始められませんでした");
      return false;
    }
    state.petWalk = result.state;
    showToast(pet.name + "と散歩に出ました。帰宅すると散歩を終えます");
    return true;
  }

  function updatePetWalk(dt, gameMinutes) {
    if (!state.petWalk.active) return;
    if (!state.player.inHome && !state.player.inVehicle && !state.player.inTrain) {
      const lastPoint = state.petWalk.trail[state.petWalk.trail.length - 1];
      const recorded = petWalkModel.recordPlayerPosition(state.petWalk, { x:state.player.x, y:state.player.y });
      if (recorded.distance === state.petWalk.distance && distance(state.player.x, state.player.y, lastPoint.x, lastPoint.y) > petWalkModel.SAMPLE_SPACING) {
        state.player.x = lastPoint.x;
        state.player.y = lastPoint.y;
      } else {
        state.petWalk = recorded;
      }
      state.petWalk = petWalkModel.advanceElapsed(state.petWalk, gameMinutes);
    }
    state.petWalk = petWalkModel.advanceFollower(state.petWalk, dt, 110);
  }

  function exitHome() {
    state.player.inHome = false;
    state.player.x = Number.isFinite(state.player.outdoorHomeX) ? state.player.outdoorHomeX : HOME.x;
    state.player.y = Number.isFinite(state.player.outdoorHomeY) ? state.player.outdoorHomeY : HOME.y;
    state.player.facingX = 0;
    state.player.facingY = 1;
    state.visual.cameraLeadX = 0;
    state.visual.cameraLeadY = 0;
    showToast("外に出ました");
  }

  function updatePlayerAtHome(dt) {
    let x = 0;
    let y = 0;
    const running = touch.run || keys.has("shift");

    if (Math.abs(touch.x) > .03 || Math.abs(touch.y) > .03) {
      x = touch.x;
      y = touch.y;
    } else {
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
    }

    const mag = Math.hypot(x, y);
    if (mag <= .02) return;
    x /= Math.max(1, mag);
    y /= Math.max(1, mag);
    state.player.facingX = x;
    state.player.facingY = y;

    const speed = running ? RUN_SPEED * 1.08 : WALK_SPEED * 1.18;
    const nx = state.player.homeX + x * speed * dt;
    const ny = state.player.homeY + y * speed * dt;
    if (canHomeOccupy(nx, state.player.homeY)) state.player.homeX = nx;
    if (canHomeOccupy(state.player.homeX, ny)) state.player.homeY = ny;
  }

  function nearestHomeInteraction() {
    if (!state.player.inHome) return null;
    let nearest = null;
    let nearestDistance = Infinity;

    for (const fixture of HOME_FIXTURES) {
      if (fixture.id === "pet" && !state.petCompanion.pet) continue;
      const d = distance(state.player.homeX, state.player.homeY, fixture.interactX, fixture.interactY);
      if (d <= fixture.range && d < nearestDistance) {
        nearest = fixture;
        nearestDistance = d;
      }
    }

    if (!nearest) return null;
    return {
      type:"home-fixture",
      target:nearest,
      label:nearest.id === "exit" ? "外へ出る" : nearest.label + "を使う"
    };
  }

  function preparePackedMeal(recipeId) {
    const currentCount = packedMealsModel.portionCount(state.packedMeals);
    if (currentCount >= packedMealsModel.MAX_PORTIONS) {
      showToast("持ち歩ける食事は6食までです");
      return false;
    }
    const result = homeCookingModel.cookMeal(state.communityCenter.skills.cooking, state.groceries, recipeId, state.fishing.fish);
    if (!result.ok) {
      showToast(result.reason === "skill-required" ? "料理技能が足りません" : result.reason === "insufficient-fish" ? "魚がありません。公園で釣れます" : "食料がありません。スーパーで買えます");
      return false;
    }
    state.groceries = result.groceriesRemaining;
    if (Number.isFinite(result.fishRemaining)) state.fishing = { ...state.fishing, fish:result.fishRemaining };
    state.communityCenter.skills.cooking = result.cookingSkill;
    advanceTime(result.recipe.duration);
    const now = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
    const stored = packedMealsModel.store(state.packedMeals, recipeId, now);
    if (!stored.ok) {
      showToast("食事をしまえませんでした");
      return false;
    }
    state.packedMeals = stored.inventory;
    updateSmartphone();
    showToast(result.recipe.name + "を持ち歩き用に作りました");
    return true;
  }

  function consumePackedMeal(mealId) {
    if (state.player.inVehicle || state.player.inTrain) {
      showToast("食事は車や電車を降りてから食べられます");
      return false;
    }
    const now = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
    const result = packedMealsModel.eat(state.packedMeals, mealId, now);
    state.packedMeals = result.inventory;
    if (!result.ok) {
      showToast(result.reason === "expired" ? "この食事は傷んでしまいました" : "その食事はもうありません");
      updateSmartphone();
      return false;
    }
    advanceTime(15);
    for (const [need, amount] of Object.entries(result.recipe.effects)) state.needs[need] += amount;
    clampNeeds();
    updateSmartphone();
    showToast(result.recipe.name + "を食べました");
    return true;
  }

  function craftHomeItem(recipeId) {
    if (!state.player.inHome || nearestHomeInteraction()?.target?.id !== "worktable") {
      showToast("自宅の作業机のそばで作れます");
      return false;
    }
    const result = homeCraftingModel.craft(state.homeCrafting, recipeId, state.communityCenter.skills.craft);
    if (!result.ok) {
      showToast(result.reason === "skill-required" ? "手芸スキルが足りません" : result.reason === "insufficient-kits" ? "手芸キットが足りません" : result.reason === "item-capacity" ? "持ち物がいっぱいです" : "その作品は作れません");
      return false;
    }
    state.homeCrafting = result.progress;
    advanceTime(result.recipe.duration);
    state.communityCenter.skills.craft = result.craftSkill;
    showToast(result.recipe.name + "を作りました");
    return true;
  }

  function applyHomeMeal(result) {
    state.groceries = result.groceriesRemaining;
    if (Number.isFinite(result.fishRemaining)) state.fishing = { ...state.fishing, fish:result.fishRemaining };
    advanceTime(result.recipe.duration);
    for (const [need, amount] of Object.entries(result.recipe.effects)) {
      state.needs[need] += amount;
    }
    state.communityCenter.skills.cooking = result.cookingSkill;
    clampNeeds();
      showToast(result.recipe.name + "を作りました");
  }

  function equipPlayerOutfit(outfitId) {
    if (!state.player.inHome || nearestHomeInteraction()?.target?.id !== "closet") {
      showToast("自宅のクローゼットのそばで着替えられます");
      return false;
    }
    const result = wardrobeModel.equipOutfit(state.wardrobe, outfitId);
    if (!result.ok) {
      showToast(result.reason === "not-owned" ? "このコーデはまだ持っていません" : result.reason === "already-equipped" ? "すでに着ています" : "このコーデには着替えられません");
      return false;
    }
    state.wardrobe = result.wardrobe;
    advanceTime(result.duration);
    queueMicrotask(() => openHomeFixture(HOME_FIXTURES.find((fixture) => fixture.id === "closet")));
    showToast(result.outfit.name + "に着替えました");
    return true;
  }

  function applyLibraryRead(bookId, atLibrary) {
    const result = libraryReadingModel.readChapter(state.libraryReading, bookId);
    if (!result.ok) {
      showToast(result.reason === "book-complete" ? "この本は読み終えています" : "貸出中の本ではありません");
      return false;
    }
    state.libraryReading = result.progress;
    advanceTime(45);
    state.needs.fun += 7;
    if (atLibrary) state.libraryVisits += 1;
    const reward = result.completionReward;
    if (reward) {
      if (reward.skill && Object.hasOwn(state.communityCenter.skills, reward.skill)) {
        state.communityCenter.skills[reward.skill] = clamp(state.communityCenter.skills[reward.skill] + reward.skillGain, 0, 100);
      }
      state.needs.fun += reward.fun;
    }
    clampNeeds();
    const book = libraryReadingModel.BOOKS.find((entry) => entry.id === bookId);
    showToast(result.bookComplete ? "『" + book.title + "』を読み終えました" : "『" + book.title + "』第" + result.chapter + "章を読みました");
    return true;
  }

  function homeShower() {
    advanceTime(20);
    state.needs.hygiene = 100;
    state.needs.energy += 2;
    clampNeeds();
    showToast("シャワーを浴びました");
  }

  function homeSleep() {
    const sleepMinutes = minutesUntil(7, 0);
    advanceTime(sleepMinutes);
    state.needs.energy = 100;
    state.needs.hunger -= 8;
    state.needs.hygiene -= 5;
    state.needs.fun += 3;
    clampNeeds();
    state.player.homeX = HOME_INTERIOR.width / 2;
    state.player.homeY = HOME_INTERIOR.height - 76;
    showToast("よく眠れました");
  }

  function homeRelax() {
    advanceTime(60);
    state.needs.energy += 16;
    state.needs.fun += 18;
    state.needs.social -= 2;
    clampNeeds();
    showToast("ソファでゆっくり過ごしました");
  }

  function homeTelevisionProgramSummary(program) {
    if (!program) return "現在の放送時間を確認できません。";
    const labels = { fun:"楽しさ", social:"交流", energy:"体力" };
    const changes = Object.entries(program.effects).map(([need, amount]) =>
      (labels[need] || need) + (amount >= 0 ? "+" : "") + amount
    );
    if (program.cookingSkillGain) changes.push("料理技能+" + program.cookingSkillGain);
    return "放送中: " + program.title + " / " + program.duration + "分 / " + changes.join(" / ");
  }

  function refreshHomeTelevisionAction() {
    if (!state.player.inHome || actionSheet.hidden || actionTitle.textContent !== "テレビ") return;
    const program = homeTelevisionModel.getProgram(Math.floor(state.minute));
    actionDescription.textContent = homeTelevisionProgramSummary(program);
    const button = actionChoices.querySelector("button");
    const detail = button?.querySelector("span");
    if (detail) detail.textContent = program ? program.title + " / " + program.duration + "分" : "放送はありません";
    if (button) button.disabled = !program;
  }

  function openHomeFixture(fixture) {
    if (!fixture) return;
    if (fixture.id === "exit") {
      exitHome();
      return;
    }

    actionChoices.replaceChildren();
    actionTitle.textContent = fixture.label;

    if (fixture.id === "kitchen") {
      actionDescription.textContent = "料理技能 " + state.communityCenter.skills.cooking + " / 魚 " + state.fishing.fish + "匹 / 食料 " + state.groceries + "個。釣った魚を料理できます。";
      for (const status of homeCookingModel.listRecipes(state.communityCenter.skills.cooking, state.groceries, state.fishing.fish)) {
        const recipe = status.recipe;
        const detail = !status.unlocked
          ? "料理技能 " + recipe.minimumSkill + "で解放 / 現在 " + state.communityCenter.skills.cooking
          : (recipe.fish ? "魚 " + recipe.fish + "匹 / " : "") + "食料 " + recipe.groceries + "個 / " + recipe.duration + "分 / 空腹+" + recipe.effects.hunger +
            " / 料理技能+" + recipe.skillGain + (status.available ? "" : status.reason === "insufficient-fish" ? " / 魚が足りません" : " / 食料が足りません");
        addChoice(recipe.name, detail, () => {
          const result = homeCookingModel.cookMeal(
            state.communityCenter.skills.cooking,
            state.groceries,
            recipe.id,
            state.fishing.fish
          );
          if (!result.ok) {
            showToast(result.reason === "skill-required" ? "料理技能が足りません" : result.reason === "insufficient-fish" ? "魚がありません。公園で釣れます" : "食料がありません。スーパーで買えます");
            return;
          }
          applyHomeMeal(result);
        }, !status.available);
        const capacityFull = packedMealsModel.portionCount(state.packedMeals) >= packedMealsModel.MAX_PORTIONS;
        addChoice("弁当を作る：" + recipe.name,
          !status.available ? detail : capacityFull ? "持ち歩ける食事がいっぱいです / " + packedMealsModel.MAX_PORTIONS + "食まで" :
            (recipe.fish ? "魚 " + recipe.fish + "匹 / " : "") + "食料 " + recipe.groceries + "個 / " + recipe.duration + "分 / 持ち歩いて後で食べる",
          () => preparePackedMeal(recipe.id), !status.available || capacityFull);
      }
    } else if (fixture.id === "closet") {
      const wardrobe = wardrobeModel.normalizeWardrobe(state.wardrobe);
      const equipped = wardrobeModel.getOutfit(wardrobe.equippedOutfitId);
      actionDescription.textContent = "着用中: " + equipped.name + " / 手持ちのコーデに着替えられます。着替えは5分です。";
      for (const outfit of wardrobeModel.CATALOG.filter((item) => wardrobe.ownedOutfitIds.includes(item.id))) {
        addChoice(outfit.name, outfit.id === wardrobe.equippedOutfitId ? "着用中" : "5分 / 能力への影響なし", () => {
          equipPlayerOutfit(outfit.id);
        }, outfit.id === wardrobe.equippedOutfitId);
      }
    } else if (fixture.id === "worktable") {
      const progress = homeCraftingModel.normalizeProgress(state.homeCrafting);
      actionDescription.textContent = "手芸スキル " + state.communityCenter.skills.craft + " / キット " + progress.kits + "個 / 作品 " + homeCraftingModel.itemCount(progress) + " / " + homeCraftingModel.MAX_FINISHED_ITEMS + "個";
      for (const recipe of homeCraftingModel.RECIPES) {
        const locked = state.communityCenter.skills.craft < recipe.minimumSkill;
        const lacksKits = progress.kits < recipe.kits;
        const full = homeCraftingModel.itemCount(progress) >= homeCraftingModel.MAX_FINISHED_ITEMS;
        const detail = locked ? "手芸スキル " + recipe.minimumSkill + "で解放 / 現在 " + state.communityCenter.skills.craft
          : "キット " + recipe.kits + "個 / " + recipe.duration + "分 / 手芸スキル+" + recipe.skillGain +
            (full ? " / 持ち物がいっぱいです" : lacksKits ? " / キットが足りません" : " / 贈り物にできます");
        addChoice(recipe.name, detail, () => craftHomeItem(recipe.id), locked || lacksKits || full);
      }
    } else if (fixture.id === "pet") {
      const pet = state.petCompanion.pet;
      if (!pet) return;
      const condition = petCompanionModel.getCondition(state.petCompanion);
      const species = petCompanionModel.SPECIES[pet.speciesId];
      actionDescription.textContent = condition.label + " / お腹 " + Math.round(pet.hunger) + " / ごきげん " + Math.round(pet.happiness) +
        " / 体力 " + Math.round(pet.energy) + " / なかよし " + Math.round(pet.bond) + " / フード " + state.petCompanion.food + "個";
      if (pet.speciesId === "dog") {
        const canWalk = pet.energy >= 15 && !state.petWalk.active;
        addChoice("犬の散歩へ出る", canWalk ? "街を歩いて一緒に散歩します" : "体力15以上で散歩できます", () => startDogWalk(), !canWalk);
      }
      const feedResult = petCompanionModel.feed(state.petCompanion);
      addChoice("ごはんをあげる", "フード1個 / 5分" + (feedResult.ok ? " / お腹+40" : " / フードがありません"), () => {
        const result = petCompanionModel.feed(state.petCompanion);
        if (!result.ok) {
          showToast(result.reason === "no-food" ? "フードがありません。保護施設で購入できます" : "ペットがいません");
          return;
        }
        state.petCompanion = result.progress;
        advanceTime(result.duration);
        showToast(pet.name + "にごはんをあげました");
      }, !feedResult.ok);
      const playResult = petCompanionModel.play(state.petCompanion);
      addChoice(species.playLabel, "25分 / ごきげん+26 / なかよし+5" + (playResult.ok ? "" : " / 体力が足りません"), () => {
        const result = petCompanionModel.play(state.petCompanion);
        if (!result.ok) {
          showToast(result.reason === "too-tired" ? pet.name + "は休みたがっています" : "ペットがいません");
          return;
        }
        state.petCompanion = result.progress;
        advanceTime(result.duration);
        showToast(pet.name + "と遊びました");
      }, !playResult.ok);
      const cuddleResult = petCompanionModel.cuddle(state.petCompanion);
      addChoice("なでる", "10分 / ごきげん+10 / なかよし+2", () => {
        const result = petCompanionModel.cuddle(state.petCompanion);
        if (!result.ok) {
          showToast("ペットがいません");
          return;
        }
        state.petCompanion = result.progress;
        advanceTime(result.duration);
        showToast(pet.name + "をなでました");
      }, !cuddleResult.ok);
    } else if (fixture.id === "tv") {
      const program = homeTelevisionModel.getProgram(Math.floor(state.minute));
      if (!program) {
        actionDescription.textContent = "現在の放送時間を確認できません。";
      } else {
        actionDescription.textContent = homeTelevisionProgramSummary(program);
        addChoice("現在の番組を見る", program.title + " / " + program.duration + "分", () => {
          const result = homeTelevisionModel.watch(Math.floor(state.minute));
          if (!result.ok) {
            showToast("現在の放送時間を確認できません");
            return;
          }
          advanceTime(result.duration);
          for (const [need, amount] of Object.entries(result.effects)) state.needs[need] += amount;
          state.communityCenter.skills.cooking = Math.min(100, state.communityCenter.skills.cooking + result.cookingSkillGain);
          clampNeeds();
          showToast("「" + result.program.title + "」を見ました");
        });
      }
    } else if (fixture.id === "shower") {
      actionDescription.textContent = "浴室で身支度を整えます。";
      addChoice("シャワーを浴びる", "20分 / 清潔を最大まで回復", homeShower);
    } else if (fixture.id === "bed") {
      actionDescription.textContent = "ベッドで翌朝まで眠れます。";
      addChoice("眠る", "翌朝7:00まで / 体力を最大まで回復", homeSleep);
    } else if (fixture.id === "sofa") {
      const progress = libraryReadingModel.normalizeProgress(state.libraryReading);
      actionDescription.textContent = progress.loans.length
        ? "リビングで休息したり、借りている本を読んだりできます。"
        : "リビングで休息できます。";
      for (const loan of progress.loans) {
        if (loan.chaptersRead >= 3) continue;
        const book = libraryReadingModel.BOOKS.find((entry) => entry.id === loan.bookId);
        if (!book) continue;
        addChoice("『" + book.title + "』を読む", "第" + (loan.chaptersRead + 1) + "章 / 45分 / 楽しさ+7", () => {
          applyLibraryRead(book.id, false);
        });
      }
      addChoice("のんびりする", "60分 / 体力+16 / 楽しさ+18", homeRelax);
    }

    actionSheet.hidden = false;
  }

  function openPlace(place) {
    actionTitle.textContent = place.name;
    actionChoices.replaceChildren();

    if (place.id === "delivery-depot") {
      const active = state.deliveryWork.active;
      if (active) {
        const remaining = getDeliveryTimeRemaining(active);
        const status = remaining < 0 ? "遅延中 " + Math.abs(remaining) + "分" : "残り " + remaining + "分";
        actionDescription.textContent = active.parcelName + "を" + placeName(active.destinationPlaceId) + "へ配達中 · " + status;
        addChoice("納品先を確認", active.parcelName + " → " + placeName(active.destinationPlaceId), () => {
          state.phone.waypoint = active.destinationPlaceId;
          showToast(placeName(active.destinationPlaceId) + "への案内を再開しました");
        });
        addChoice("配達をキャンセル", "この依頼は本日再受注できません", () => {
          const result = deliveryWorkModel.cancelDelivery(state.deliveryWork);
          if (!result.ok) return;
          state.deliveryWork = result.progress;
          if (state.phone.waypoint === active.destinationPlaceId) state.phone.waypoint = null;
          showToast("配達をキャンセルしました");
        });
      } else {
        actionDescription.textContent = "1日3件まで受注できます。徒歩でも車でも配達できます。";
      }
      for (const offer of deliveryWorkModel.listOffers(state.day, state.deliveryWork)) {
        const destination = PLACES.find((candidate) => candidate.id === offer.destinationPlaceId);
        addChoice(offer.parcelName, (destination?.name || "目的地") + " / " + offer.durationMinutes + "分 / ¥" + offer.reward.toLocaleString("ja-JP"), () => {
          const result = deliveryWorkModel.acceptDelivery(state.deliveryWork, state.day, Math.floor(state.minute), offer.id);
          if (!result.ok) {
            showToast(result.reason === "active-delivery" ? "先に配達中の荷物を届けてください" : "この依頼は受注できません");
            return;
          }
          state.deliveryWork = result.progress;
          state.phone.waypoint = offer.destinationPlaceId;
          state.phone.friendWaypointId = null;
          showToast(offer.parcelName + "を受注 · " + (destination?.name || "目的地") + "へ向かいましょう");
        }, Boolean(active));
      }
    }

    if (place.id === "pet-shelter") {
      const open = petCompanionModel.isShelterOpen(Math.floor(state.minute));
      actionDescription.textContent = "犬か猫を1匹迎えられる保護施設です。営業時間 09:00〜19:00。ペットは自宅で待っています。";
      if (state.petCompanion.pet) {
        actionDescription.textContent += "\n" + state.petCompanion.pet.name + "と暮らしています。フードの購入はこちら。";
      }
      const reasonText = (reason) => reason === "closed" ? "営業時間外です（09:00〜19:00）"
        : reason === "already-owned" ? "すでにペットと暮らしています（1匹まで）"
          : reason === "insufficient-funds" ? "所持金が足りません"
            : reason === "inventory-limit" ? "フードをこれ以上持てません"
              : "利用できません";
      for (const species of Object.values(petCompanionModel.SPECIES)) {
        const preview = petCompanionModel.adopt(state.petCompanion, state.cash, species.id, Math.floor(state.minute));
        addChoice(species.label + "を迎える（" + species.name + "）", preview.ok
          ? "¥" + species.adoptionCost.toLocaleString("ja-JP") + " / 20分 / お世話は自宅でできます"
          : reasonText(preview.reason), () => {
          const result = petCompanionModel.adopt(state.petCompanion, state.cash, species.id, Math.floor(state.minute));
          if (!result.ok) {
            showToast(reasonText(result.reason));
            return;
          }
          state.petCompanion = result.progress;
          state.cash = result.cashRemaining;
          advanceTime(result.duration);
          showToast(result.progress.pet.name + "を家族に迎えました");
        }, !preview.ok);
      }
      const foodPreview = petCompanionModel.buyFoodPack(state.petCompanion, state.cash, Math.floor(state.minute));
      addChoice("ペットフードを買う", foodPreview.ok
        ? "3食分 / ¥450 / 所持 " + state.petCompanion.food + "個"
        : reasonText(foodPreview.reason), () => {
        const result = petCompanionModel.buyFoodPack(state.petCompanion, state.cash, Math.floor(state.minute));
        if (!result.ok) {
          showToast(reasonText(result.reason));
          return;
        }
        state.petCompanion = result.progress;
        state.cash = result.cashRemaining;
        showToast("ペットフードを3食分買いました");
      }, !foodPreview.ok);
    }

    if (place.id === "public-bath") {
      actionDescription.textContent = "朝6時から夜11時まで営業。入浴で身支度を整え、サウナでは体調も確認します。";
      const reasonText = (reason) => reason === "not-open" ? "営業時間外です（6:00〜23:00）"
        : reason === "closing-time" ? "閉店までに利用を終えられません"
          : reason === "insufficient-funds" ? "料金が足りません"
            : reason === "too-tired" ? "サウナは体力35以上が必要です"
              : reason === "too-hungry" ? "サウナは空腹20以上が必要です"
                : "利用できません";
      for (const option of publicBathModel.listOptions({
        minute:Math.floor(state.minute),
        cash:state.cash,
        energy:state.needs.energy,
        hunger:state.needs.hunger
      })) {
        const effectText = option.id === "bath" ? "清潔最大 / 体力+6 / 楽しさ+16 / 交流+6" : "清潔最大 / 体力+2 / 楽しさ+24 / 交流+10 / 空腹-5";
        const detail = option.available
          ? option.duration + "分 / ¥" + option.cost.toLocaleString("ja-JP") + " / " + effectText
          : reasonText(option.reason);
        addChoice(option.name, detail, () => {
          const result = publicBathModel.completeBath({
            minute:Math.floor(state.minute),
            cash:state.cash,
            energy:state.needs.energy,
            hunger:state.needs.hunger
          }, option.id);
          if (!result.ok) {
            showToast(reasonText(result.reason));
            return;
          }
          state.cash -= result.cost;
          advanceTime(result.duration);
          for (const [need, change] of Object.entries(result.effects)) {
            if (need === "hygiene") state.needs.hygiene = change;
            else state.needs[need] += change;
          }
          clampNeeds();
          showToast(option.name + "を利用しました −¥" + result.cost.toLocaleString("ja-JP"));
        }, !option.available);
      }
    }

    if (place.id === "clinic") {
      actionDescription.textContent = "南若葉住宅地の診療所です。受付時間は8:00〜20:00。治療を終えてから閉院時刻を過ぎないように利用してください。";
      const reasonText = (reason) => reason === "not-open" ? "診療時間外です（8:00〜20:00）"
        : reason === "closing-time" ? "診療終了までに治療を終えられません"
          : reason === "insufficient-funds" ? "治療費が足りません"
            : reason === "not-needed" ? "この治療を受けるほど体調は悪くありません"
              : "治療を受けられません";
      const treatmentState = () => ({ minute:state.minute, cash:state.cash, health:state.needs.health });
      for (const option of playerHealthModel.listTreatments(treatmentState())) {
        const detail = option.available
          ? "¥" + option.cost.toLocaleString("ja-JP") + " / " + option.duration + "分 / 健康 " + Math.round(state.needs.health) + "→" + Math.round(option.healthAfter)
          : reasonText(option.reason);
        addChoice(option.name, detail, () => {
          const result = playerHealthModel.completeTreatment(treatmentState(), option.id);
          if (!result.ok) {
            showToast(reasonText(result.reason));
            return;
          }
          state.cash -= result.cost;
          advanceTime(result.duration);
          state.needs.health = result.health;
          clampNeeds();
          showToast(option.name + "を受けました −¥" + result.cost.toLocaleString("ja-JP"));
        }, !option.available);
      }
    }

    if (place.id === "home") {
      actionDescription.textContent = "自宅の中では家具を使って、料理・入浴・睡眠・休憩ができます。";
      addChoice("自宅に入る", "屋内マップへ移動します", () => enterHome());
    }

    if (place.id === "store") {
      actionDescription.textContent = "食料品、手芸用品とちょっとした食事を買えます。";
      const kitPurchase = homeCraftingModel.buyKitPack(state.homeCrafting, state.cash);
      addChoice("手芸キットを買う", "3回分 / ¥" + homeCraftingModel.KIT_PACK_COST.toLocaleString("ja-JP") + " / 10分 / 所持 " + state.homeCrafting.kits + "個", () => {
        const result = homeCraftingModel.buyKitPack(state.homeCrafting, state.cash);
        if (!result.ok) {
          showToast(result.reason === "insufficient-funds" ? "手芸キットの購入資金が足りません" : "手芸キットをこれ以上持てません");
          return;
        }
        state.homeCrafting = result.progress;
        state.cash = result.cashRemaining;
        advanceTime(result.duration);
        showToast("手芸キットを3回分買いました");
      }, !kitPurchase.ok);
      addChoice("傘を買う", state.umbrellaOwned ? "購入済み・何度でも使えます" : "¥600 / 5分 / 雨の日の屋外で自動使用", () => {
        const result = buyUmbrella();
        if (!result.ok) {
          showToast(result.reason === "already-owned" ? "傘はすでに持っています" : "傘を買うには¥600必要です");
          return;
        }
        showToast("傘を買いました。雨の日の屋外で自動的に使います");
      }, state.umbrellaOwned || state.cash < 600);
      for (const outfit of wardrobeModel.CATALOG.filter((item) => item.id !== wardrobeModel.DEFAULT_OUTFIT_ID)) {
        const owned = state.wardrobe.ownedOutfitIds.includes(outfit.id);
        const preview = wardrobeModel.buyOutfit(state.wardrobe, state.cash, outfit.id);
        const detail = owned ? "購入済み · 自宅のクローゼットで着替えられます"
          : preview.ok ? "¥" + outfit.price.toLocaleString("ja-JP") + " / 10分 / 自宅で着替え"
            : "¥" + outfit.price.toLocaleString("ja-JP") + " / 所持金が足りません";
        addChoice(outfit.name, detail, () => {
          const result = wardrobeModel.buyOutfit(state.wardrobe, state.cash, outfit.id);
          if (!result.ok) {
            showToast(result.reason === "already-owned" ? "このコーデは購入済みです" : result.reason === "insufficient-funds" ? "衣類を買う資金が足りません" : "このコーデは購入できません");
            return;
          }
          state.wardrobe = result.wardrobe;
          state.cash = result.cashRemaining;
          advanceTime(result.duration);
          queueMicrotask(() => openPlace(PLACES.find((place) => place.id === "store")));
          showToast(outfit.name + "を購入しました。自宅で着替えられます");
        }, !preview.ok);
      }
      addChoice("釣り餌を買う", state.cash < parkFishingModel.BAIT_PACK_COST ? "5回分 / ¥500 / 資金不足" : "5回分 / ¥500 / 所持 " + state.fishing.bait + "個", () => {
        const result = parkFishingModel.buyBait(state.fishing, state.cash);
        if (!result.ok) {
          showToast("釣り餌を買うには¥500必要です");
          return;
        }
        state.fishing = result.progress;
        state.cash = result.cashRemaining;
        showToast("釣り餌を5個買いました");
      }, state.cash < parkFishingModel.BAIT_PACK_COST);
      addChoice("菜園の種を買う", state.cash < communityGardenModel.SEED_PACK_COST ? "¥600 / 資金不足" : "3粒 / ¥600 / 5分", () => {
        const result = communityGardenModel.buySeedPack(state.garden, state.cash);
        if (!result.ok) {
          showToast("種を買うには¥600必要です");
          return;
        }
        state.garden = result.progress;
        state.cash = result.cashRemaining;
        advanceTime(5);
        showToast("菜園の種を3粒買いました");
      }, state.cash < communityGardenModel.SEED_PACK_COST);
      addChoice("食料を3個買う", "¥1,500 / 15分", () => {
        if (!canPay(1500)) return;
        state.cash -= 1500;
        state.groceries += 3;
        advanceTime(15);
        showToast("食料を3個買いました");
      });
      addChoice("惣菜を食べる", "¥750 / 25分 / 空腹+42", () => {
        if (!canPay(750)) return;
        state.cash -= 750;
        advanceTime(25);
        state.needs.hunger += 42;
        state.needs.fun += 3;
        clampNeeds();
        showToast("惣菜を食べました");
      });
      addChoice("コーヒー", "¥450 / 15分 / 体力+18", () => {
        if (!canPay(450)) return;
        state.cash -= 450;
        advanceTime(15);
        state.needs.energy += 18;
        state.needs.fun += 4;
        clampNeeds();
        showToast("コーヒーで一息つきました");
      });
    }

    if (place.id === "fuel-station") {
      const nearbyCar = !state.player.inVehicle && !state.player.inHome && personalCar.speed <= 1 &&
        distance(personalCar.x, personalCar.y, mapModel.getNode(place.roadNodeId).x, mapModel.getNode(place.roadNodeId).y) <= 260;
      actionDescription.textContent = nearbyCar
        ? "給油は停車中の車に行えます。燃料 " + personalCar.fuelLiters.toFixed(1) + " / " + carFuelModel.CAPACITY_LITERS + " L"
        : "給油は車を給油機の近くに停車させてから行います。携行缶は車のそばで使えます。";
      addChoice("10 L給油", "最大10 L / 1 L ¥" + carFuelModel.PRICE_PER_LITER + " / 5分", () => refuelAtStation(10), !nearbyCar || personalCar.fuelLiters >= carFuelModel.CAPACITY_LITERS);
      addChoice("満タンまで給油", "最大 " + carFuelModel.CAPACITY_LITERS + " L / 5分", () => refuelAtStation(carFuelModel.CAPACITY_LITERS - personalCar.fuelLiters), !nearbyCar || personalCar.fuelLiters >= carFuelModel.CAPACITY_LITERS);
      addChoice("携行缶を購入", "5 L / ¥" + carFuelModel.CAN_PRICE.toLocaleString("ja-JP") + " / 1本まで", buyPortableCan, personalCar.portableCanCount >= 1 || state.cash < carFuelModel.CAN_PRICE);
    }

    if (place.id === "cafe") {
      const level = cafeWorkModel.careerLevel(state.shiftsWorked);
      actionDescription.textContent = "勤務経験 " + state.shiftsWorked + "回 / " + level +
        "（一人前5回・ベテラン12回） · 営業 7:00〜18:00 · 1日1シフト";
      for (const status of cafeWorkModel.listShifts({
        day:state.day,
        minute:state.minute,
        lastShiftDay:state.lastShiftDay,
        shiftsWorked:state.shiftsWorked,
        energy:state.needs.energy,
        hunger:state.needs.hunger
      })) {
        const shift = status.shift;
        const detail = status.available
          ? (shift.duration / 60) + "時間 / 給与 ¥" + status.pay.toLocaleString("ja-JP")
          : status.reason === "already-worked" ? "今日は勤務済みです"
            : status.reason === "experience-required" ? "勤務経験 " + shift.minimumExperience + "回で解放 / 現在 " + state.shiftsWorked + "回"
              : status.reason === "too-early" ? "勤務開始は7:00からです"
                : status.reason === "closing-time" ? "閉店までに終わりません"
                  : status.reason === "too-tired" ? "体力20以上が必要です"
                    : "空腹20以上が必要です";
        addChoice(shift.name, detail, () => {
          const result = cafeWorkModel.completeShift({
            day:state.day,
            minute:state.minute,
            lastShiftDay:state.lastShiftDay,
            shiftsWorked:state.shiftsWorked,
            energy:state.needs.energy,
            hunger:state.needs.hunger
          }, shift.id);
          if (!result.ok) {
            const message = result.reason === "already-worked" ? "今日はもう勤務しました"
              : result.reason === "experience-required" ? "ロングシフトには勤務経験が必要です"
                : result.reason === "too-early" ? "勤務開始は7:00からです"
                  : result.reason === "closing-time" ? "閉店までに終わりません"
                    : result.reason === "too-tired" ? "体力を回復してから働きましょう"
                      : "先に食事をとってから働きましょう";
            showToast(message);
            return;
          }
          advanceTime(shift.duration);
          state.cash += result.pay;
          state.needs.social += shift.duration / 24;
          state.needs.fun -= shift.duration / 80;
          state.needs.hygiene -= shift.duration / 30;
          state.needs.energy -= Math.max(0, (shift.duration - 240) / 60 * 1.5);
          state.shiftsWorked = result.shiftsWorked;
          state.lastShiftDay = state.day;
          clampNeeds();
          const promotion = result.careerLevel !== level ? " · " + result.careerLevel + "に昇格" : "";
          showToast(shift.name + "終了 +¥" + result.pay.toLocaleString("ja-JP") + promotion);
        }, !status.available);
      }
      addChoice("ランチ", "¥900 / 30分 / 空腹+45", () => {
        if (!canPay(900)) return;
        state.cash -= 900;
        advanceTime(30);
        state.needs.hunger += 45;
        state.needs.social += 4;
        state.needs.fun += 5;
        clampNeeds();
        showToast("カフェでランチを食べました");
      });
    }

    if (place.id === "park") {
      const fishingWindow = parkFishingModel.getFishingWindow(Math.floor(state.minute));
      const currentChance = parkFishingModel.biteChance(state.fishing, Math.floor(state.minute));
      const fishNames = { crucian:"フナ", bluegill:"ブルーギル", carp:"コイ", catfish:"ナマズ" };
      const fishingSummary = fishingWindow
        ? "釣り餌 " + state.fishing.bait + "個 / 魚 " + state.fishing.fish + "匹 / 釣り技能 " + state.fishing.skill + " / 今は" + fishNames[fishingWindow.fishType] + "が狙えます（成功率 " + Math.round(currentChance * 100) + "%）"
        : "釣り餌 " + state.fishing.bait + "個 / 魚 " + state.fishing.fish + "匹 / 釣り技能 " + state.fishing.skill;
      addChoice("池で釣りをする", fishingWindow ? fishNames[fishingWindow.fishType] + " / 25分 / 成功率 " + Math.round(currentChance * 100) + "%" + (state.fishing.bait < 1 ? " / 釣り餌がありません" : "") : "25分 / 今は魚が食いつきにくい時間です" + (state.fishing.bait < 1 ? " / 釣り餌がありません" : ""), () => {
        const result = parkFishingModel.cast(state.fishing, state.day, Math.floor(state.minute), Math.random());
        if (!result.ok) {
          showToast(result.reason === "no-bait" ? "釣り餌がありません。スーパーで購入できます" : "今は釣りができません");
          return;
        }
        state.fishing = result.progress;
        advanceTime(result.duration);
        showToast(result.caught ? fishNames[result.fishType] + "が釣れました！ 釣り技能が上がりました" : "魚は食いつきませんでした。釣り技能が上がりました");
      }, state.fishing.bait < 1);
      const gardenNow = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
      const plotStatuses = communityGardenModel.listPlotStatuses(state.garden, gardenNow);
      const emptyCount = plotStatuses.filter((plot) => plot.status === "empty").length;
      const plotSummary = plotStatuses.map((plot) => {
        if (plot.status === "empty") return "畝" + (plot.id + 1) + " 空き";
        const crop = communityGardenModel.CROPS[plot.cropId];
        return "畝" + (plot.id + 1) + " " + crop.name + " · 成長あと" + plot.remainingGrowth + "分 · 水分あと" + plot.wetRemaining + "分 · 収穫" + plot.yield + "個";
      }).join(" / ");
      actionDescription.textContent = "無料で休んだり、人と話したりできます。" + fishingSummary + "。菜園の種 " + state.garden.seeds + "粒 / 空き畝 " + emptyCount + "。" + plotSummary;
      for (const crop of Object.values(communityGardenModel.CROPS)) {
        const disabledReason = state.garden.seeds < 1
          ? "種がありません · スーパーで購入"
          : emptyCount < 1 ? "畝が満杯です · 収穫して空ける" : "";
        const detail = crop.name + " / 収穫 " + crop.yield + "個 / 成長 " + crop.growthMinutes + "分" + (disabledReason ? " / " + disabledReason : "");
        addChoice(crop.name + "を植える", detail, () => {
          const now = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
          const preview = communityGardenModel.plant(state.garden, now + 10, crop.id);
          if (!preview.ok) {
            showToast(preview.reason === "no-seeds" ? "先にスーパーで種を買ってください" : "菜園に空き畝がありません");
            return;
          }
          advanceTime(10);
          const result = communityGardenModel.plant(state.garden, communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute)), crop.id);
          if (!result.ok) return;
          state.garden = result.progress;
          showToast(crop.name + "を植えました · 畝" + (result.plotId + 1));
        }, state.garden.seeds < 1 || emptyCount < 1);
      }
      for (const plot of plotStatuses) {
        if (plot.status === "empty") continue;
        const crop = communityGardenModel.CROPS[plot.cropId];
        if (plot.status === "ready") {
          addChoice("畝" + (plot.id + 1) + "を収穫", crop.name + " / 食料 " + plot.yield + "個 / 10分", () => {
            const now = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
            if (!communityGardenModel.harvest(state.garden, now + 10, plot.id).ok) {
              showToast("収穫できる状態ではありません");
              return;
            }
            advanceTime(10);
            const result = communityGardenModel.harvest(state.garden, communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute)), plot.id);
            if (!result.ok) return;
            state.garden = result.progress;
            state.groceries += result.yield;
            showToast(crop.name + "を収穫し、食料が" + result.yield + "個増えました");
          });
        } else if (plot.wetRemaining <= 0) {
          addChoice("畝" + (plot.id + 1) + "に水をやる", crop.name + " · あと" + plot.remainingGrowth + "分 / 5分", () => {
            const now = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
            if (!communityGardenModel.water(state.garden, now + 5, plot.id).ok) {
              showToast("この畝には水をやれません");
              return;
            }
            advanceTime(5);
            const result = communityGardenModel.water(state.garden, communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute)), plot.id);
            if (!result.ok) return;
            state.garden = result.progress;
            showToast(crop.name + "に水をやりました");
          });
        } else {
          addChoice("畝" + (plot.id + 1) + "の様子", crop.name + " · 成長あと" + plot.remainingGrowth + "分 / 水分あと" + plot.wetRemaining + "分", () => {}, true);
        }
      }
      addChoice("ベンチで休む", "60分 / 楽しさ+25 / 体力+9", () => {
        advanceTime(60);
        state.needs.fun += 25;
        state.needs.energy += 9;
        state.needs.hygiene -= 2;
        clampNeeds();
        showToast("公園でのんびりしました");
      });
      addChoice("散歩する", "45分 / 楽しさ+16 / 交流+7", () => {
        advanceTime(45);
        state.needs.fun += 16;
        state.needs.social += 7;
        state.needs.energy -= 5;
        clampNeeds();
        showToast("公園を散歩しました");
      });
    }

    if (place.id === "gym") {
      actionDescription.textContent = "体調に合う運動を選べます。トレーニング経験 " + state.fitness +
        "（5で筋力トレーニング解放）";
      for (const status of gymTrainingModel.listWorkouts(
        state.fitness,
        state.cash,
        state.needs.energy,
        state.needs.hunger
      )) {
        const workout = status.workout;
        const reason = status.reason === "fitness-required" ? "経験 " + workout.minimumFitness + "で解放 / 現在 " + state.fitness
          : status.reason === "insufficient-funds" ? "所持金が足りません"
            : status.reason === "too-tired" ? "体力 " + workout.minimumEnergy + "以上が必要"
              : status.reason === "too-hungry" ? "空腹 " + workout.minimumHunger + "以上が必要"
                : "¥" + workout.cost.toLocaleString("ja-JP") + " / " + workout.duration + "分 / 経験+" + workout.fitnessGain;
        const detail = status.available
          ? "¥" + workout.cost.toLocaleString("ja-JP") + " / " + workout.duration + "分 / 経験+" + workout.fitnessGain
          : reason;
        addChoice(workout.name, detail, () => {
          const result = gymTrainingModel.completeWorkout(
            state.fitness,
            state.cash,
            state.needs.energy,
            state.needs.hunger,
            workout.id
          );
          if (!result.ok) {
            const message = result.reason === "fitness-required" ? "トレーニング経験が足りません"
              : result.reason === "insufficient-funds" ? "所持金が足りません"
                : result.reason === "too-tired" ? "体力を回復してから運動しましょう"
                  : "先に食事をとってから運動しましょう";
            showToast(message);
            return;
          }
          state.cash = result.cashRemaining;
          state.fitness = result.fitness;
          advanceTime(workout.duration);
          for (const [need, amount] of Object.entries(workout.effects)) {
            state.needs[need] += amount;
          }
          clampNeeds();
          showToast(workout.name + "を終えました");
        }, !status.available);
      }
      addChoice("ジムのシャワー", "¥300 / 15分 / 清潔+70", () => {
        if (!canPay(300)) return;
        state.cash -= 300;
        advanceTime(15);
        state.needs.hygiene += 70;
        clampNeeds();
        showToast("シャワーを浴びました");
      });
    }

    if (place.id === "library") {
      const progress = libraryReadingModel.normalizeProgress(state.libraryReading);
      actionDescription.textContent = "本を3冊まで無料で借りられます。図書館や自宅のソファで読めます。貸出中 " + progress.loans.length + " / 3冊。";
      for (const book of libraryReadingModel.BOOKS) {
        const loan = progress.loans.find((entry) => entry.bookId === book.id);
        if (loan) {
          if (loan.chaptersRead < 3) {
            addChoice("『" + book.title + "』を読む", "第" + (loan.chaptersRead + 1) + "章 / 45分 / 楽しさ+7", () => {
              applyLibraryRead(book.id, true);
            });
          }
          addChoice("『" + book.title + "』を返す", "読み進み " + loan.chaptersRead + " / 3章", () => {
            const result = libraryReadingModel.returnBook(state.libraryReading, book.id);
            if (!result.ok) {
              showToast("この本は貸出中ではありません");
              return;
            }
            state.libraryReading = result.progress;
            showToast("『" + book.title + "』を返しました");
          });
        } else {
          addChoice("『" + book.title + "』を借りる", "無料 / 3章 / 完読で報酬", () => {
            const result = libraryReadingModel.borrow(state.libraryReading, book.id);
            if (!result.ok) {
              showToast(result.reason === "loan-limit" ? "貸出は3冊までです" : "この本を借りられません");
              return;
            }
            state.libraryReading = result.progress;
            showToast("『" + book.title + "』を借りました");
          }, progress.loans.length >= 3);
        }
      }
      addChoice("勉強する", "120分 / 将来のための自己投資", () => {
        advanceTime(120);
        state.needs.energy -= 8;
        state.needs.fun += 6;
        state.libraryVisits += 2;
        clampNeeds();
        showToast("しっかり勉強しました");
      });
    }

    if (place.id === "community-center") {
      actionDescription.textContent = "曜日ごとに開かれる講座に参加できます。参加すると技能が上がり、街の人とも交流できます。";
      for (const course of communityCenterModel.COURSES) {
        const availability = communityCenterModel.getCourseAvailability(
          course.id,
          state.day,
          state.minute,
          state.cash,
          state.communityCenter
        );
        const session = availability.session;
        const sessionTime = session
          ? "Day " + session.day + " " + String(Math.floor(course.startMinute / 60)).padStart(2, "0") + ":" + String(course.startMinute % 60).padStart(2, "0")
          : "開催予定なし";
        const reason = availability.reason === "not-open" ? "開始時刻から10分以内に受付"
          : availability.reason === "insufficient-funds" ? "所持金が足りません"
            : availability.reason === "already-attended" ? "この日の講座は参加済み"
              : "";
        const skill = state.communityCenter.skills[course.skill];
        const detail = (session?.accepting ? "受付中" : "次回 " + sessionTime) +
          " / ¥" + course.cost.toLocaleString("ja-JP") + " / " + course.duration + "分 / " +
          course.skillName + "技能 " + skill + "→" + Math.min(100, skill + 5) + (reason ? " / " + reason : "");
        addChoice(course.name, detail, () => {
          const currentAvailability = communityCenterModel.getCourseAvailability(
            course.id,
            state.day,
            state.minute,
            state.cash,
            state.communityCenter
          );
          if (!currentAvailability.available) {
            const message = currentAvailability.reason === "insufficient-funds" ? "参加費が足りません"
              : currentAvailability.reason === "already-attended" ? "この日の講座には参加済みです"
                : "講座の受付時間外です";
            showToast(message);
            return;
          }

          const scheduledSession = currentAvailability.session;
          state.cash -= course.cost;
          advanceTime(course.duration);
          state.communityCenter = communityCenterModel.completeCourse(state.communityCenter, scheduledSession);
          if (course.skill === "cooking") {
            state.needs.hunger += 10;
            state.needs.fun += 14;
          } else if (course.skill === "craft") {
            state.needs.social += 10;
            state.needs.fun += 15;
            state.needs.energy -= 4;
          } else if (course.skill === "exercise") {
            state.needs.energy -= 6;
            state.needs.fun += 12;
            state.needs.hygiene -= 6;
          }
          clampNeeds();
          showToast(course.name + "に参加し、" + course.skillName + "技能が上がりました");
        }, !availability.available);
      }
      actionDescription.textContent += "\n料理 " + state.communityCenter.skills.cooking +
        " / 手芸 " + state.communityCenter.skills.craft +
        " / 体操 " + state.communityCenter.skills.exercise + "（各100まで）";
    }

    if (state.deliveryWork.active?.destinationPlaceId === place.id) {
      actionDescription.textContent += "\n配達中: " + state.deliveryWork.active.parcelName + " · 荷物を届けて報酬を受け取れます。";
      addChoice("荷物を届ける", state.deliveryWork.active.parcelName + " / 報酬 ¥" + state.deliveryWork.active.reward.toLocaleString("ja-JP"), () => completeActiveDelivery(place));
    }

    actionSheet.hidden = false;
  }

  function citizenMoodLabel(ped) {
    const average = (ped.needs.hunger + ped.needs.energy + ped.needs.social + ped.needs.fun) / 4;
    if (ped.stress > 75 || average < 28) return "かなり疲れている";
    if (ped.stress > 55 || average < 45) return "少し余裕がない";
    if (average > 76 && ped.stress < 30) return "機嫌がよさそう";
    return "落ち着いている";
  }

  function citizenStatusText(ped) {
    const activity = ped.currentActivityLabel
      || ped.pendingActivity?.label
      || (ped.state === "waiting" ? "信号待ち" : "移動中");
    return [
      ped.age + "歳",
      ped.jobLabel,
      activity,
      citizenMoodLabel(ped)
    ].join(" / ");
  }

  function openCitizen(ped) {
    actionTitle.textContent = ped.name;
    actionDescription.textContent =
      citizenStatusText(ped) +
      "\n所持金 ¥" + Math.round(ped.money).toLocaleString("ja-JP") +
      " / 食料 " + ped.groceries +
      "\n空腹 " + Math.round(ped.needs.hunger) +
      "・体力 " + Math.round(ped.needs.energy) +
      "・交流 " + Math.round(ped.needs.social) +
      "・楽しさ " + Math.round(ped.needs.fun) +
      "・ストレス " + Math.round(ped.stress);
    actionChoices.replaceChildren();

    addChoice("少し話す", "10分 / 相手の交流とストレスにも影響", () => {
      state.needs.social += 12;
      state.needs.fun += 4;
      ped.needs.social += 16;
      ped.needs.fun += 4;
      ped.stress -= 7;
      citizenClampNeeds(ped);
      clampNeeds();
      advanceTime(10);
      showToast(ped.name + "と少し話しました");
    });

    actionSheet.hidden = false;
  }

  function npcRelationshipContext(npcId) {
    const definition = socialNpcSystem.relationships.find((item) => item.aId === npcId || item.bId === npcId);
    if (!definition) return null;
    const pairId = [definition.aId, definition.bId].sort().join("|");
    return { ...definition, affinity:socialNpcState.relationships[pairId] };
  }

  function performNpcGift(npcId, itemId) {
    if (state.player.inVehicle || state.player.inTrain || state.player.inHome) {
      showToast("贈り物は街で歩いているときに手渡せます");
      return false;
    }
    const interaction = nearestInteraction();
    const npc = NPCS.find((person) => person.id === npcId);
    if (!npc || interaction?.type !== "npc" || interaction.target?.id !== npcId) {
      showToast("相手の近くで贈り物を選んでください");
      return false;
    }
    const result = homeCraftingModel.giveGift(state.homeCrafting, npcId, itemId, state.day);
    if (!result.ok) {
      showToast(result.reason === "already-gifted" ? "この人には今日はもう贈り物を渡しました" : result.reason === "no-item" ? "渡せる作品がありません" : "その贈り物は渡せません");
      return false;
    }
    state.homeCrafting = result.progress;
    advanceTime(10);
    npc.friendship = clamp(npc.friendship + result.friendshipGain, 0, 100);
    socialNpcState.friendship[npcId] = npc.friendship;
    if (result.relationshipAffinityGain) {
      const relationship = npcRelationshipContext(npcId);
      if (relationship) {
        const pairId = [relationship.aId, relationship.bId].sort().join("|");
        socialNpcState.relationships[pairId] = clamp(socialNpcState.relationships[pairId] + result.relationshipAffinityGain, 0, 100);
      }
    }
    showToast(npc.name + result.response);
    return true;
  }

  function performNpcConversation(npc, citizen, optionId) {
    const relationship = npcRelationshipContext(npc.id);
    const result = socialNpcSystem.resolveConversation({
      npcId:npc.id,
      optionId,
      minute:state.minute,
      day:state.day,
      activityId:citizen?.currentActivityId || citizen?.pendingActivity?.id || "",
      friendship:npc.friendship,
      relationship,
      recentTopic:socialNpcState.recentTopics[npc.id],
      needs:citizen?.needs || {}
    });
    if (!result) return;

    const accepted = !result.activityRequest || requestCitizenSocialActivity(citizen, result.activityRequest);
    const duration = optionId === "greet" ? 30 : optionId === "ask" ? 20 : 10;
    advanceTime(duration);
    state.needs.social += optionId === "greet" ? 24 : optionId === "ask" ? 18 : 10;
    state.needs.fun += optionId === "greet" ? 7 : optionId === "ask" ? 9 : 5;
    if (citizen) {
      for (const [need, delta] of Object.entries(result.needsDelta || {})) {
        if (Number.isFinite(citizen.needs[need])) citizen.needs[need] += delta;
      }
      citizen.stress -= optionId === "greet" ? 9 : optionId === "ask" ? 6 : 3;
      citizenClampNeeds(citizen);
    }

    const friendshipDelta = result.activityRequest && !accepted ? 0 : result.friendshipDelta;
    npc.friendship = clamp(npc.friendship + friendshipDelta, 0, 100);
    socialNpcState.friendship[npc.id] = npc.friendship;
    socialNpcState.recentTopics[npc.id] = result.topic;
    if (accepted && relationship && result.relationshipDelta) {
      const pairId = [relationship.aId, relationship.bId].sort().join("|");
      socialNpcState.relationships[pairId] = clamp(
        socialNpcState.relationships[pairId] + result.relationshipDelta,
        0,
        100
      );
    }
    clampNeeds();
    showToast(accepted ? result.response : "今は予定が合わないようです。いつもの行動を続けます。");
  }

  function openNpc(npc) {
    const citizen = pedestrians.find((ped) => ped.id === npc.citizenId || ped.specialNpcId === npc.id);
    const relationship = npcRelationshipContext(npc.id);
    const conversation = socialNpcSystem.getConversation({
      npcId:npc.id,
      minute:state.minute,
      day:state.day,
      activityId:citizen?.currentActivityId || citizen?.pendingActivity?.id || "",
      friendship:npc.friendship,
      relationship,
      recentTopic:socialNpcState.recentTopics[npc.id]
    });
    actionTitle.textContent = npc.name;
    actionDescription.textContent = (citizen ? citizenStatusText(citizen) + "\n" : "") + (conversation?.line || "話題を探しているようだ。");
    actionChoices.replaceChildren();
    const labels = { greet:"少し話す", ask:"近況を聞く", invite:"公園に誘う" };
    for (const option of conversation?.options || []) {
      const detail = option.id === "invite" ? "予定が合えば公園へ向かいます" : option.id === "ask" ? "話題や関係性に応じて会話します" : "30分 / 交流・楽しさが変化します";
      addChoice(labels[option.id] || option.label, detail, () => performNpcConversation(npc, citizen, option.id));
    }
    if (!state.player.inVehicle && !state.player.inTrain && !state.player.inHome) {
      const crafting = homeCraftingModel.normalizeProgress(state.homeCrafting);
      for (const recipe of homeCraftingModel.RECIPES) {
        const count = crafting.items[recipe.id] || 0;
        if (!count) continue;
        const alreadyGifted = crafting.lastGiftDayByNpc[npc.id] === state.day;
        addChoice(recipe.name + "を贈る", alreadyGifted ? "本日は贈り物を渡しました" : "所持 " + count + "個 / 手作り作品を贈る", () => {
          performNpcGift(npc.id, recipe.id);
        }, alreadyGifted);
      }
    }
    if (npc.friendship >= 2) {
      addChoice("一緒に過ごす", "90分 / 交流+38 / 楽しさ+22", () => {
        advanceTime(90);
        state.needs.social += 38;
        state.needs.fun += 22;
        state.needs.hunger -= 5;
        npc.friendship = clamp(npc.friendship + 1, 0, 100);
        socialNpcState.friendship[npc.id] = npc.friendship;
        if (citizen) {
          citizen.needs.social += 32;
          citizen.needs.fun += 18;
          citizen.needs.hunger -= 5;
          citizen.stress -= 14;
          citizenClampNeeds(citizen);
        }
        clampNeeds();
        showToast(npc.name + "と楽しい時間を過ごしました");
      });
    }
    actionSheet.hidden = false;
  }


  function nearestInteraction() {
    if (state.player.inHome) return nearestHomeInteraction();
    const p = actorPosition();

    if (state.player.inTrain) {
      const train = trainById(state.player.trainId);
      const station = stoppedStationForTrain(train);
      return station
        ? { type:"train-exit", target:station, label:station.name + "で降りる" }
        : null;
    }

    if (state.player.inVehicle) {
      return { type: "car-menu", label: state.drive.destination ? "ルート・降車メニュー" : "目的地を選ぶ" };
    }

    const deliveryDestination = state.deliveryWork?.active
      ? PLACES.find((place) => place.id === state.deliveryWork.active.destinationPlaceId)
      : null;
    if (deliveryDestination && distance(p.x, p.y, deliveryDestination.x, deliveryDestination.y) < 105) {
      return { type:"place", target:deliveryDestination, label:"荷物を届ける" };
    }
    const deliveryDepot = PLACES.find((place) => place.id === "delivery-depot");
    if (deliveryDepot && distance(p.x, p.y, deliveryDepot.x, deliveryDepot.y) < 105) {
      return { type:"place", target:deliveryDepot, label:"若葉便 配達受付所を利用" };
    }

    const railStation = nearestRailStationAccess(p.x, p.y);
    if (railStation) {
      const train = stoppedTrainAtStation(railStation);
      return train
        ? { type:"train-enter", target:train, station:railStation, label:railStation.name + "から電車に乗る" }
        : { type:"train-wait", station:railStation, label:railStation.name + "で電車を待つ" };
    }

    if (distance(p.x, p.y, personalCar.x, personalCar.y) < 70) {
      if (personalCar.portableCanCount > 0 && personalCar.fuelLiters < carFuelModel.CAPACITY_LITERS && personalCar.speed <= 1) {
        return { type:"car-refuel", label:"携行缶で車に給油する" };
      }
      return { type: "car-enter", label: "自分の車に乗る" };
    }

    let nearestNpc = null;
    let npcDistance = 72;
    for (const npc of NPCS) {
      if (npc.hidden) continue;
      const d = distance(p.x, p.y, npc.x, npc.y);
      if (d < npcDistance) {
        nearestNpc = npc;
        npcDistance = d;
      }
    }
    if (nearestNpc) return { type:"npc", target:nearestNpc, label:nearestNpc.name + "と話す" };

    let nearestCitizen = null;
    let citizenDistance = 58;
    for (const citizen of pedestrians) {
      if (!citizen.visible || citizen.specialNpcId) continue;
      const d = distance(p.x, p.y, citizen.x, citizen.y);
      if (d < citizenDistance) {
        nearestCitizen = citizen;
        citizenDistance = d;
      }
    }
    if (nearestCitizen) {
      const activity = nearestCitizen.currentActivityLabel
        || nearestCitizen.pendingActivity?.label
        || (nearestCitizen.state === "waiting" ? "信号待ち" : "移動中");
      return {
        type:"citizen",
        target:nearestCitizen,
        label:nearestCitizen.name + "（" + activity + "）"
      };
    }

    let nearestPlace = null;
    let placeDistance = 105;
    for (const place of PLACES) {
      const d = distance(p.x, p.y, place.x, place.y);
      if (d < placeDistance) {
        nearestPlace = place;
        placeDistance = d;
      }
    }
    if (nearestPlace) return {
      type:"place",
      target:nearestPlace,
      label:nearestPlace.id === "home" ? "自宅に入る" : nearestPlace.name + "を利用"
    };

    return null;
  }

  function enterCar() {
    if (state.petWalk.active) {
      showToast("散歩中は犬と一緒に帰宅してから乗車してください");
      return;
    }
    if (personalCar.fuelLiters <= 0) {
      showToast("燃料切れです。携行缶で補給してください");
      return;
    }
    state.player.inTrain = false;
    state.player.trainId = null;
    state.player.inVehicle = true;
    state.player.x = personalCar.x;
    state.player.y = personalCar.y;
    document.body.classList.add("driving");
    showToast("乗車しました。まず目的地を選びます");
    openDrivingMenu();
  }

  function exitCar() {
    if (Math.abs(personalCar.speed) > 8) {
      showToast("完全に停止してから降りてください");
      return;
    }
    const sideX = Math.cos(personalCar.angle + Math.PI / 2) * 48;
    const sideY = Math.sin(personalCar.angle + Math.PI / 2) * 48;
    const spots = [
      [personalCar.x + sideX, personalCar.y + sideY],
      [personalCar.x - sideX, personalCar.y - sideY],
      [personalCar.x - Math.cos(personalCar.angle) * 54, personalCar.y - Math.sin(personalCar.angle) * 54]
    ];
    const spot = spots.find(([x, y]) => canPlayerOccupy(x, y));
    if (!spot) {
      showToast("ここでは降りられません");
      return;
    }
    state.player.x = spot[0];
    state.player.y = spot[1];
    state.player.inVehicle = false;
    state.drive.route = [];
    state.drive.routeIndex = 0;
    state.drive.signals = [];
    state.drive.destination = null;
    personalCar.speed = 0;
    document.body.classList.remove("driving");
  }

  function handleFuelExhaustion() {
    if (personalCar.fuelLiters > 0 || !state.player.inVehicle || personalCar.speed > 8) return false;
    exitCar();
    if (!state.player.inVehicle) showToast("燃料切れです。給油所へ向かい、携行缶で補給してください");
    return true;
  }

  function refuelAtStation(requestedLiters) {
    const station = PLACES.find((place) => place.id === "fuel-station");
    if (!station || state.player.inHome || state.player.inVehicle || distance(state.player.x, state.player.y, station.x, station.y) > 125) {
      showToast("給油所の入口で操作してください");
      return;
    }
    const roadNode = mapModel.getNode(station.roadNodeId);
    if (!roadNode || personalCar.speed > 1 || distance(personalCar.x, personalCar.y, roadNode.x, roadNode.y) > 260) {
      showToast("自分の車を給油機の近くに停車させてください");
      return;
    }
    const result = carFuelModel.refuel(personalCar.fuelLiters, requestedLiters, state.cash);
    if (!result.ok) {
      showToast(result.reason === "tank-full" ? "燃料は満タンです" : result.reason === "insufficient-funds" ? "給油するお金が足りません" : "給油量を確認してください");
      return;
    }
    state.cash = result.cashRemaining;
    personalCar.fuelLiters = result.fuel;
    advanceTime(5);
    showToast(result.liters + " L給油しました −¥" + result.cost.toLocaleString("ja-JP"));
  }

  function buyPortableCan() {
    const result = carFuelModel.buyCan(personalCar.portableCanCount, state.cash);
    if (!result.ok) {
      showToast(result.reason === "can-already-owned" ? "携行缶は1本までです" : "携行缶を買うお金が足りません");
      return;
    }
    state.cash = result.cashRemaining;
    personalCar.portableCanCount = result.count;
    advanceTime(3);
    showToast("5 L携行缶を購入しました −¥" + carFuelModel.CAN_PRICE.toLocaleString("ja-JP"));
  }

  function usePortableCan() {
    if (state.player.inHome || state.player.inVehicle || personalCar.speed > 1 || distance(state.player.x, state.player.y, personalCar.x, personalCar.y) > 76) {
      showToast("停車中の自分の車のそばで使用できます");
      return;
    }
    const result = carFuelModel.useCan(personalCar.fuelLiters, personalCar.portableCanCount);
    if (!result.ok) {
      showToast(result.reason === "no-can" ? "携行缶を持っていません" : "燃料は満タンです");
      return;
    }
    personalCar.fuelLiters = result.fuel;
    personalCar.portableCanCount = result.count;
    advanceTime(5);
    showToast("携行缶から" + result.liters + " L補給しました");
  }

  function performAction() {
    if (!actionSheet.hidden) {
      closeActionSheet();
      return;
    }

    const item = nearestInteraction();
    if (!item) {
      if (state.player.inTrain) showToast("駅に停車してから降りられます");
      else showToast("近くに利用できるものはありません");
      return;
    }

    if (item.type === "car-enter") enterCar();
    if (item.type === "car-refuel") usePortableCan();
    if (item.type === "car-menu") openDrivingMenu();
    if (item.type === "train-enter") boardTrain(item.target, item.station);
    if (item.type === "train-exit") exitTrain();
    if (item.type === "train-wait") showToast("電車が到着したら E / ACTION で乗車できます");
    if (item.type === "place") openPlace(item.target);
    if (item.type === "home-fixture") openHomeFixture(item.target);
    if (item.type === "npc") openNpc(item.target);
    if (item.type === "citizen") openCitizen(item.target);
  }

  function resize() {
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2.25);
    canvas.width = Math.max(1, Math.floor(viewWidth * dpr));
    canvas.height = Math.max(1, Math.floor(viewHeight * dpr));
    canvas.style.width = viewWidth + "px";
    canvas.style.height = viewHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function buildGameSnapshot() {
    // Persistence-neutral snapshot. Future authenticated sync can send this
    // object to the backend without reintroducing browser-local saves.
    return {
        version: 1,
        mapVersion: mapModel.version,
        player: {
          x: state.player.x,
          y: state.player.y,
          facingX: state.player.facingX,
          facingY: state.player.facingY,
          inVehicle: state.player.inVehicle,
          inTrain: state.player.inTrain,
          trainId: state.player.trainId,
          inHome: state.player.inHome,
          homeX: state.player.homeX,
          homeY: state.player.homeY,
          outdoorHomeX: state.player.outdoorHomeX,
          outdoorHomeY: state.player.outdoorHomeY
        },
        car: {
          x: personalCar.x,
          y: personalCar.y,
          angle: personalCar.angle,
          fuelLiters: personalCar.fuelLiters,
          portableCanCount: personalCar.portableCanCount
        },
        trains: trains.map((train) => ({
          id: train.id,
          x: train.x,
          stationIndex: train.stationIndex,
          targetIndex: train.targetIndex,
          direction: train.direction,
          dwell: train.dwell,
          speed: train.speed
        })),
        day: state.day,
        minute: state.minute,
        cash: state.cash,
        umbrellaOwned:state.umbrellaOwned === true,
        wardrobe:wardrobeModel.normalizeWardrobe(state.wardrobe),
        groceries: state.groceries,
        fitness: state.fitness,
        libraryVisits: state.libraryVisits,
        communityCenter:communityCenterModel.normalizeProgress(state.communityCenter),
        libraryReading:libraryReadingModel.normalizeProgress(state.libraryReading),
        packedMeals:packedMealsModel.normalizeInventory(state.packedMeals),
        homeCrafting:homeCraftingModel.normalizeProgress(state.homeCrafting),
        deliveryWork:deliveryWorkModel.normalizeProgress(state.deliveryWork),
        communityGarden:communityGardenModel.normalizeProgress(state.garden),
        petCompanion:petCompanionModel.normalizeProgress(state.petCompanion),
        petWalk:petWalkModel.normalizeWalkState(state.petWalk, { worldSize:WORLD_SIZE, hasDog:state.petCompanion.pet?.speciesId === "dog", playerCanWalk:!state.player.inHome && !state.player.inVehicle && !state.player.inTrain, playerPosition:{ x:state.player.x, y:state.player.y } }),
        fishing:parkFishingModel.normalizeProgress(state.fishing),
        shiftsWorked: state.shiftsWorked,
        lastShiftDay:state.lastShiftDay,
        needs: state.needs,
        phone: {
          waypoint: state.phone?.waypoint || null
        },
        driving: {
          rating: state.drive.rating,
          trips: state.drive.trips
        },
        socialNpc: {
          friendship:{ ...socialNpcState.friendship },
          relationships:{ ...socialNpcState.relationships },
          recentTopics:{ ...socialNpcState.recentTopics }
        },
        friends:{ ...socialNpcState.friendship },
        citizens: pedestrians.map((ped) => ({
          id:ped.id,
          money:ped.money,
          groceries:ped.groceries,
          needs:{ ...ped.needs },
          stress:ped.stress,
          workedDay:ped.workedDay,
          decisionCount:ped.decisionCount,
          tripCount:ped.tripCount,
          state:ped.state,
          visible:ped.visible,
          waitTimer:ped.waitTimer,
          activityMinutesRemaining:ped.activityMinutesRemaining,
          currentActivityId:ped.currentActivityId,
          currentActivityLabel:ped.currentActivityLabel,
          currentPlaceId:ped.currentPlaceId,
          currentNodeId:ped.currentNodeId,
          targetNodeId:ped.targetNodeId,
          targetPlaceId:ped.targetPlaceId,
          pendingActivity:ped.pendingActivity ? { ...ped.pendingActivity } : null,
          edgeId:ped.edgeId,
          edgeLength:ped.edgeLength,
          directionSign:ped.directionSign,
          along:ped.along,
          routeEdgeIds:Array.isArray(ped.routeEdgeIds) ? [...ped.routeEdgeIds] : [],
          routeIndex:ped.routeIndex,
          x:ped.x,
          y:ped.y,
          dir:ped.dir
        })),
        savedAt: Date.now()
      };
  }

  function clearLegacyLocalSave() {
    try {
      localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch (error) {
      console.warn("legacy save cleanup failed", error);
    }
  }


  function migratePlayerToCurrentMap(x, y) {
    if (Number.isFinite(x) && Number.isFinite(y) && canStand(x, y)) return { x, y };
    const entrance = mapModel.getNode(HOME.entranceNodeId);
    return entrance ? { x: entrance.x, y: entrance.y } : { x: HOME.x, y: HOME.y };
  }

  function migrateCarToCurrentRoadIfNeeded() {
    const hit = mapModel.nearestRoad(personalCar.x, personalCar.y, { vehicleOnly: true });
    if (!hit) {
      const fallback = mapModel.nearestRoad(HOME.x, HOME.y, { vehicleOnly: true });
      if (fallback) {
        personalCar.x = fallback.point.x;
        personalCar.y = fallback.point.y;
      }
      personalCar.speed = 0;
      return;
    }
    const edge = hit.edge;
    const a = edge.points[hit.segmentIndex];
    const b = edge.points[hit.segmentIndex + 1];
    const tx = (b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    const ty = (b.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    const savedForward = Math.cos(personalCar.angle) * tx + Math.sin(personalCar.angle) * ty;
    const directionSign = savedForward >= 0 ? 1 : -1;
    const needsSnap = hit.distance > edge.width / 2 + 8;
    const laneOffset = Math.min(LANE_OFFSET, Math.max(14, edge.width / 2 - 18));
    const offset = laneOffset * directionSign;
    personalCar.x = hit.point.x + ty * offset;
    personalCar.y = hit.point.y - tx * offset;
    if (!needsSnap && Number.isFinite(personalCar.x) && Number.isFinite(personalCar.y)) {
      personalCar.x = hit.point.x + ty * offset;
      personalCar.y = hit.point.y - tx * offset;
    }
    personalCar.angle = directionSign > 0 ? Math.atan2(ty, tx) : Math.atan2(-ty, -tx);
    personalCar.speed = 0;
  }

  function restoreCitizenFromSave(ped, stored, mapMatches) {
    if (!stored || stored.id !== ped.id) return;

    if (Number.isFinite(Number(stored.money))) ped.money = Number(stored.money);
    if (Number.isFinite(Number(stored.groceries))) ped.groceries = Math.max(0, Math.floor(Number(stored.groceries)));
    if (stored.needs) {
      for (const key of ["hunger","energy","social","fun"]) {
        if (Number.isFinite(Number(stored.needs[key]))) ped.needs[key] = Number(stored.needs[key]);
      }
    }
    if (Number.isFinite(Number(stored.stress))) ped.stress = Number(stored.stress);
    if (Number.isFinite(Number(stored.workedDay))) ped.workedDay = Math.max(0, Math.floor(Number(stored.workedDay)));
    if (Number.isFinite(Number(stored.decisionCount))) ped.decisionCount = Math.max(0, Math.floor(Number(stored.decisionCount)));
    if (Number.isFinite(Number(stored.tripCount))) ped.tripCount = Math.max(0, Math.floor(Number(stored.tripCount)));
    citizenClampNeeds(ped);

    if (!mapMatches) {
      ped.state = "deciding";
      ped.currentNodeId = ped.homeNodeId;
      ped.pendingActivity = null;
      planCitizenAction(ped, ped.homeNodeId);
      return;
    }

    const allowedStates = new Set(["walking","waiting","inside","staying"]);
    const savedState = allowedStates.has(stored.state) ? stored.state : "deciding";
    const savedCurrentNode = typeof stored.currentNodeId === "string" && mapModel.getNode(stored.currentNodeId)
      ? stored.currentNodeId
      : ped.homeNodeId;
    const savedTargetNode = typeof stored.targetNodeId === "string" && mapModel.getNode(stored.targetNodeId)
      ? stored.targetNodeId
      : savedCurrentNode;

    ped.currentNodeId = savedCurrentNode;
    ped.targetNodeId = savedTargetNode;
    ped.targetPlaceId = typeof stored.targetPlaceId === "string" ? stored.targetPlaceId : null;
    ped.currentPlaceId = typeof stored.currentPlaceId === "string" ? stored.currentPlaceId : null;
    ped.currentActivityId = typeof stored.currentActivityId === "string" ? stored.currentActivityId : null;
    ped.currentActivityLabel = typeof stored.currentActivityLabel === "string" ? stored.currentActivityLabel : null;
    ped.activityMinutesRemaining = Math.max(0, Number(stored.activityMinutesRemaining) || 0);
    ped.waitTimer = Math.max(0, Number(stored.waitTimer) || 0);

    const pending = stored.pendingActivity && typeof stored.pendingActivity === "object"
      ? { ...stored.pendingActivity }
      : null;
    if (pending?.nodeId && !mapModel.getNode(pending.nodeId)) pending.nodeId = ped.homeNodeId;
    ped.pendingActivity = pending;

    if (savedState === "inside" || savedState === "staying") {
      ped.state = savedState;
      ped.visible = ped.specialNpcId ? true : savedState === "staying";
      const node = mapModel.getNode(savedCurrentNode);
      if (node) {
        ped.x = node.x;
        ped.y = node.y;
      }
      if (ped.activityMinutesRemaining <= .001) completeCitizenActivity(ped);
      return;
    }

    const edge = typeof stored.edgeId === "string" ? mapModel.getEdge(stored.edgeId) : null;
    const routeEdgeIds = Array.isArray(stored.routeEdgeIds)
      ? stored.routeEdgeIds.filter((edgeId) => typeof edgeId === "string" && mapModel.getEdge(edgeId))
      : [];
    const routeValid = edge && routeEdgeIds.length && routeEdgeIds.length === (stored.routeEdgeIds?.length || 0);

    if (routeValid) {
      ped.state = savedState === "waiting" ? "waiting" : "walking";
      ped.visible = true;
      ped.routeEdgeIds = routeEdgeIds;
      ped.routeIndex = clamp(Math.floor(Number(stored.routeIndex) || 0), 0, routeEdgeIds.length - 1);
      ped.edgeId = edge.id;
      ped.edgeLength = polylineLength(edge.points);
      ped.directionSign = Number(stored.directionSign) < 0 ? -1 : 1;
      ped.along = clamp(Number(stored.along) || 0, 0, ped.edgeLength);
      const pose = pedestrianPoseAt(ped);
      ped.x = pose.x;
      ped.y = pose.y;
      ped.dir = pose.angle;
      return;
    }

    ped.state = "deciding";
    ped.pendingActivity = null;
    planCitizenAction(ped, savedCurrentNode);
  }

  function applyGameSnapshot(saved) {
    if (!saved || saved.version !== 1) return false;
    try {
      const mapMatches = saved.mapVersion == null || saved.mapVersion === mapModel.version;

      if (saved.player) {
        const x = Number(saved.player.x);
        const y = Number(saved.player.y);
        const playerPosition = mapMatches ? migratePlayerToCurrentMap(x, y) : migratePlayerToCurrentMap(NaN, NaN);
        state.player.x = playerPosition.x;
        state.player.y = playerPosition.y;
        state.player.facingX = Number(saved.player.facingX) || 0;
        state.player.facingY = Number(saved.player.facingY) || 1;
        state.player.inTrain = Boolean(saved.player.inTrain);
        state.player.trainId = typeof saved.player.trainId === "string" ? saved.player.trainId : null;
        state.player.inVehicle = Boolean(saved.player.inVehicle) && !state.player.inTrain;
        state.player.inHome = Boolean(saved.player.inHome) && !state.player.inVehicle && !state.player.inTrain;
        state.player.homeX = Number.isFinite(Number(saved.player.homeX)) ? Number(saved.player.homeX) : state.player.homeX;
        state.player.homeY = Number.isFinite(Number(saved.player.homeY)) ? Number(saved.player.homeY) : state.player.homeY;
        state.player.outdoorHomeX = Number.isFinite(Number(saved.player.outdoorHomeX)) ? Number(saved.player.outdoorHomeX) : state.player.outdoorHomeX;
        state.player.outdoorHomeY = Number.isFinite(Number(saved.player.outdoorHomeY)) ? Number(saved.player.outdoorHomeY) : state.player.outdoorHomeY;
      }

      if (saved.car) {
        const x = Number(saved.car.x);
        const y = Number(saved.car.y);
        if (mapMatches && Number.isFinite(x) && Number.isFinite(y) && inWorld(x, y, 30)) {
          personalCar.x = x;
          personalCar.y = y;
        }
        personalCar.angle = Number(saved.car.angle) || 0;
        personalCar.fuelLiters = carFuelModel.normalizeFuel(saved.car.fuelLiters);
        personalCar.portableCanCount = saved.car.portableCanCount === 1 ? 1 : 0;
      }

      migrateCarToCurrentRoadIfNeeded();
      if (!mapMatches) {
        state.player.inVehicle = false;
        state.player.inTrain = false;
        state.player.trainId = null;
        state.drive.route = [];
        state.drive.routeIndex = 0;
        state.drive.destination = null;
      }

      if (Array.isArray(saved.trains)) {
        for (const stored of saved.trains) {
          const train = trainById(stored && stored.id);
          if (!train) continue;
          const x = Number(stored.x);
          const stationIndex = Math.floor(Number(stored.stationIndex));
          const targetIndex = Math.floor(Number(stored.targetIndex));
          if (Number.isFinite(x)) train.x = clamp(x, RAIL_MIN_X, RAIL_MAX_X);
          if (stationIndex >= 0 && stationIndex < TRAIN_STATIONS.length) train.stationIndex = stationIndex;
          if (targetIndex >= 0 && targetIndex < TRAIN_STATIONS.length) train.targetIndex = targetIndex;
          train.direction = Number(stored.direction) < 0 ? -1 : 1;
          train.dwell = clamp(Number(stored.dwell) || 0, 0, TRAIN_DWELL_SECONDS);
          train.speed = clamp(Number(stored.speed) || 0, 0, TRAIN_SPEED);
        }
      }

      state.day = Math.max(1, Math.floor(Number(saved.day) || 1));
      const savedMinute = Number(saved.minute);
      state.minute = saved.minute != null && Number.isFinite(savedMinute) ? clamp(savedMinute, 0, 1439.99) : 480;
      syncWeather();
      state.cash = Math.floor(Number(saved.cash) || 0);
      state.umbrellaOwned = saved.umbrellaOwned === true;
      state.wardrobe = wardrobeModel.normalizeWardrobe(saved.wardrobe);
      state.groceries = Math.max(0, Math.floor(Number(saved.groceries) || 0));
      state.fitness = Math.max(0, Math.floor(Number(saved.fitness) || 0));
      state.libraryVisits = Math.max(0, Math.floor(Number(saved.libraryVisits) || 0));
      state.communityCenter = communityCenterModel.normalizeProgress(saved.communityCenter);
      state.libraryReading = libraryReadingModel.normalizeProgress(saved.libraryReading);
      state.packedMeals = packedMealsModel.normalizeInventory(saved.packedMeals);
      state.homeCrafting = homeCraftingModel.normalizeProgress(saved.homeCrafting);
      state.deliveryWork = deliveryWorkModel.normalizeProgress(saved.deliveryWork);
      state.garden = communityGardenModel.normalizeProgress(saved.communityGarden);
      state.petCompanion = petCompanionModel.normalizeProgress(saved.petCompanion);
      state.petWalk = petWalkModel.normalizeWalkState(saved.petWalk, {
        worldSize:WORLD_SIZE,
        hasDog:state.petCompanion.pet?.speciesId === "dog",
        playerCanWalk:!state.player.inHome && !state.player.inVehicle && !state.player.inTrain,
        playerPosition:{ x:state.player.x, y:state.player.y }
      });
      state.fishing = parkFishingModel.normalizeProgress(saved.fishing);
      state.shiftsWorked = Math.max(0, Math.floor(Number(saved.shiftsWorked) || 0));
      state.lastShiftDay = Math.max(0, Math.floor(Number(saved.lastShiftDay) || 0));
      if (saved.phone && typeof saved.phone.waypoint === "string" && PLACES.some((place) => place.id === saved.phone.waypoint)) {
        state.phone.waypoint = saved.phone.waypoint;
      } else {
        state.phone.waypoint = null;
      }
      if (state.deliveryWork.active) state.phone.waypoint = state.deliveryWork.active.destinationPlaceId;
      if (saved.driving) {
        state.drive.rating = clamp(Math.round(Number(saved.driving.rating) || 100), 0, 100);
        state.drive.trips = Math.max(0, Math.floor(Number(saved.driving.trips) || 0));
      }

      if (saved.needs) {
        for (const key of Object.keys(state.needs)) {
          if (saved.needs[key] != null && Number.isFinite(Number(saved.needs[key]))) state.needs[key] = Number(saved.needs[key]);
        }
        clampNeeds();
      }

      const restoredSocialState = socialNpcSystem.normalizeState(saved.socialNpc, saved.friends);
      socialNpcState.friendship = restoredSocialState.friendship;
      socialNpcState.relationships = restoredSocialState.relationships;
      socialNpcState.recentTopics = restoredSocialState.recentTopics;
      for (const npc of NPCS) npc.friendship = socialNpcState.friendship[npc.id];

      if (Array.isArray(saved.citizens)) {
        const savedCitizens = new Map(saved.citizens.map((value) => [value?.id, value]));
        for (const ped of pedestrians) {
          const stored = savedCitizens.get(ped.id);
          if (stored) restoreCitizenFromSave(ped, stored, mapMatches);
        }
      }
      syncNamedNpcCitizens();

      if (state.player.inTrain) {
        const train = trainById(state.player.trainId);
        if (train) {
          state.player.inVehicle = false;
          state.player.x = train.x;
          state.player.y = train.y;
        } else {
          state.player.inTrain = false;
          state.player.trainId = null;
        }
      } else if (state.player.inVehicle) {
        state.player.x = personalCar.x;
        state.player.y = personalCar.y;
      }
      return true;
    } catch (error) {
      console.warn("snapshot apply failed", error);
      return false;
    }
  }

  function updatePlayerOnFoot(dt) {
    let x = 0;
    let y = 0;
    let running = touch.run || keys.has("shift");

    if (Math.abs(touch.x) > 0.03 || Math.abs(touch.y) > 0.03) {
      x = touch.x;
      y = touch.y;
    } else {
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
    }

    const mag = Math.hypot(x, y);
    if (mag > 0.02) {
      x /= Math.max(1, mag);
      y /= Math.max(1, mag);
      state.player.facingX = x;
      state.player.facingY = y;

      let speed = running ? RUN_SPEED : WALK_SPEED;
      if (state.needs.energy < 15) speed *= 0.72;
      if (state.needs.hunger < 10) speed *= 0.8;
      if (state.needs.health < 30) speed *= 0.8;

      const nx = state.player.x + x * speed * dt;
      const ny = state.player.y + y * speed * dt;
      if (canPlayerOccupy(nx, state.player.y)) state.player.x = nx;
      if (canPlayerOccupy(state.player.x, ny)) state.player.y = ny;

      if (running) {
        state.needs.energy -= dt * 0.4;
        state.needs.hygiene -= dt * 0.12;
      }
    }
  }

  function updateCar(dt) {
    state.drive.signalClock += dt;
    state.drive.collisionCooldown = Math.max(0, state.drive.collisionCooldown - dt);

    if (!state.drive.destination || !state.drive.route.length) {
      personalCar.speed *= Math.pow(0.72, dt * 10);
      if (personalCar.speed < 1) personalCar.speed = 0;
      state.player.x = personalCar.x;
      state.player.y = personalCar.y;
      handleFuelExhaustion();
      return;
    }

    const motionBefore = {
      x:personalCar.x,
      y:personalCar.y,
      angle:personalCar.angle,
      speed:personalCar.speed
    };

    const accelerating = (touch.driveAccel || keys.has("w") || keys.has("arrowup")) && personalCar.fuelLiters > 0;
    const braking = touch.driveBrake || keys.has("s") || keys.has("arrowdown") || keys.has(" ");

    updateRouteProgress();
    const target = routeLookaheadTarget();
    if (target) {
      const desired = Math.atan2(target.y - personalCar.y, target.x - personalCar.x);
      const diff = angleWrap(desired - personalCar.angle);
      const speedRatio = clamp(personalCar.speed / 340, 0, 1);
      const maxYawRate = 2.4 - speedRatio * 1.15;
      personalCar.angle += clamp(diff, -maxYawRate * dt, maxYawRate * dt);
    }

    if (accelerating && !braking) personalCar.speed += 230 * dt;
    else if (braking) personalCar.speed -= 330 * dt;
    else personalCar.speed *= Math.pow(0.93, dt * 10);

    personalCar.speed = clamp(personalCar.speed, 0, 390);

    const limit = speedLimitAt(personalCar.x, personalCar.y);
    const kmh = personalCar.speed * SPEED_TO_KMH;
    if (kmh > limit + 4) {
      state.drive.speedingTimer += dt;
      if (state.drive.speedingTimer >= 1.5) {
        state.drive.speedingTimer = 0;
        penalizeDriving(2, "速度超過: 制限 " + limit + " km/h");
      }
    } else {
      state.drive.speedingTimer = Math.max(0, state.drive.speedingTimer - dt * 2);
    }

    const signal = upcomingSignal();
    if (
      signal &&
      signal.state === "red" &&
      signal.distance < (signal.stopOffset || STOP_LINE_OFFSET) + vehicleFrontOverhang(personalCar) &&
      personalCar.speed > 18 &&
      !state.drive.violationKeys.has(signal.key)
    ) {
      state.drive.violationKeys.add(signal.key);
      penalizeDriving(18, "赤信号を通過しました");
    }

    const lead = leadVehicleInfo();
    if (lead) {
      const safeDistance = 55 + personalCar.speed * 0.42;
      if (lead.distance < safeDistance) {
        state.drive.gapTimer += dt;
        if (state.drive.gapTimer >= 1.15) {
          state.drive.gapTimer = 0;
          penalizeDriving(2, "車間距離が近すぎます");
        }
      } else {
        state.drive.gapTimer = Math.max(0, state.drive.gapTimer - dt);
      }

      if (lead.distance < 38) {
        personalCar.speed = Math.min(personalCar.speed, Math.max(0, lead.car.speed - 20));
      }
    } else {
      state.drive.gapTimer = 0;
    }

    personalCar.x += Math.cos(personalCar.angle) * personalCar.speed * dt;
    personalCar.y += Math.sin(personalCar.angle) * personalCar.speed * dt;


    const offWorldOrBuilding =
      !inWorld(personalCar.x, personalCar.y, 32) ||
      collidesBuilding(personalCar.x, personalCar.y, 29);

    const hitVehicle = offWorldOrBuilding ? null : vehicleIntersectsAnyVehicle(personalCar);
    const hitPerson = offWorldOrBuilding ? null : vehicleIntersectsAnyPerson(personalCar);

    if (offWorldOrBuilding || hitVehicle || hitPerson) {
      personalCar.x = motionBefore.x;
      personalCar.y = motionBefore.y;
      personalCar.angle = motionBefore.angle;
      personalCar.speed = 0;

      if (state.drive.collisionCooldown <= 0) {
        state.drive.collisionCooldown = 1.6;
        if (hitPerson) penalizeDriving(16, "歩行者に接触しました");
        else if (hitVehicle) penalizeDriving(10, "車両に接触しました");
        else penalizeDriving(8, "路外へ出ました");
      }
    }

    const fuelResult = carFuelModel.consumeFuel(
      personalCar.fuelLiters,
      Math.hypot(personalCar.x - motionBefore.x, personalCar.y - motionBefore.y)
    );
    personalCar.fuelLiters = fuelResult.fuel;

    state.player.x = personalCar.x;
    state.player.y = personalCar.y;

    const destination = state.drive.destination ? PLACES.find((place) => place.id === state.drive.destination) : null;
    const route = state.drive.route;
    const finalPoint = route[route.length - 1];
    if (destination && finalPoint && state.drive.routeIndex >= route.length - 1) {
      const finalDistance = distance(personalCar.x, personalCar.y, finalPoint.x, finalPoint.y);
      if (finalDistance < 58 && personalCar.speed < 8) completeDrivingTrip();
    }
    handleFuelExhaustion();
  }

  function nextTrafficSignal(car) {
    const forward = car.directionSign > 0;
    let nodeIndex = forward
      ? Math.ceil((car.along + 2) / ROAD_GAP)
      : Math.floor((car.along - 2) / ROAD_GAP);

    for (let step = 0; step < 7; step += 1) {
      if (nodeIndex < 1 || nodeIndex > 17) break;
      const gx = car.orientation === "h" ? nodeIndex : car.roadIndex;
      const gy = car.orientation === "h" ? car.roadIndex : nodeIndex;
      if (isSignalizedIntersection(gx, gy)) {
        return {
          x:gx * ROAD_GAP,
          y:gy * ROAD_GAP,
          orientation:car.orientation,
          stopOffset:stopLineOffsetAt(gx, gy),
          distance:Math.abs(nodeIndex * ROAD_GAP - car.along)
        };
      }
      nodeIndex += forward ? 1 : -1;
    }
    return null;
  }

  function updateLegacyTraffic(dt) {
    const minAlong = ROAD_GAP * 1.04;
    const maxAlong = ROAD_GAP * 16.96;

    for (const car of traffic) {
      const nextSignal = nextTrafficSignal(car);
      const roadLimit = 60 / SPEED_TO_KMH;
      let targetSpeed = Math.min(car.cruise, roadLimit * .92);

      if (nextSignal) {
        const signal = signalStateAt(nextSignal.x, nextSignal.y, nextSignal.orientation);
        const stopCenterDistance = (nextSignal.stopOffset || STOP_LINE_OFFSET) + VEHICLE_FRONT_OVERHANG;
        if ((signal === "red" || signal === "yellow") && nextSignal.distance < stopCenterDistance + 75) {
          targetSpeed = Math.max(0, (nextSignal.distance - stopCenterDistance) * 2.5);
        }
      }

      const hx = Math.cos(car.angle);
      const hy = Math.sin(car.angle);
      let leadDistance = Infinity;
      for (const other of traffic) {
        if (other === car) continue;
        if (
          other.orientation !== car.orientation ||
          other.roadIndex !== car.roadIndex ||
          other.directionSign !== car.directionSign ||
          Math.abs(other.laneOffset - car.laneOffset) > 18
        ) continue;

        let forwardDistance = (other.along - car.along) * car.directionSign;
        if (forwardDistance < 0) forwardDistance += maxAlong - minAlong;
        if (forwardDistance > 0 && forwardDistance < 190) leadDistance = Math.min(leadDistance, forwardDistance);
      }

      if (state.player.inVehicle) {
        const dx = personalCar.x - car.x;
        const dy = personalCar.y - car.y;
        const forwardDistance = dx * hx + dy * hy;
        const lateral = Math.abs(dx * -hy + dy * hx);
        const sameDirection = Math.cos(personalCar.angle) * hx + Math.sin(personalCar.angle) * hy;
        if (forwardDistance > 0 && forwardDistance < 180 && lateral < 48 && sameDirection > .55) {
          leadDistance = Math.min(leadDistance, forwardDistance);
        }
      }

      if (leadDistance < 125) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, (leadDistance - 38) * 2.05));
      }

      const brakingNow = targetSpeed < car.speed - 10;
      car.brakeGlow += ((brakingNow ? 1 : 0) - car.brakeGlow) * Math.min(1, dt * 8);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2.4);

      car.along += car.directionSign * car.speed * dt;
      if (car.along < minAlong) car.along = maxAlong;
      if (car.along > maxAlong) car.along = minAlong;

      const pose = trafficPoseAt(car);
      car.x = pose.x;
      car.y = pose.y;
      car.angle = pose.angle;
    }
  }


  function captureTrafficMotion(car) {
    return {
      x:car.x,
      y:car.y,
      angle:car.angle,
      speed:car.speed,
      edgeId:car.edgeId,
      edgeLength:car.edgeLength,
      directionSign:car.directionSign,
      laneOffset:car.laneOffset,
      overtakePlan:car.overtakePlan ? { ...car.overtakePlan } : null,
      along:car.along,
      routeEdgeIds:Array.isArray(car.routeEdgeIds) ? [...car.routeEdgeIds] : [],
      routeIndex:car.routeIndex,
      routeGoalNodeId:car.routeGoalNodeId,
      routeTrips:car.routeTrips
    };
  }

  function restoreTrafficMotion(car, snapshot) {
    car.x = snapshot.x;
    car.y = snapshot.y;
    car.angle = snapshot.angle;
    car.edgeId = snapshot.edgeId;
    car.edgeLength = snapshot.edgeLength;
    car.directionSign = snapshot.directionSign;
    car.laneOffset = snapshot.laneOffset;
    car.overtakePlan = snapshot.overtakePlan ? { ...snapshot.overtakePlan } : null;
    car.along = snapshot.along;
    car.routeEdgeIds = [...snapshot.routeEdgeIds];
    car.routeIndex = snapshot.routeIndex;
    car.routeGoalNodeId = snapshot.routeGoalNodeId;
    car.routeTrips = snapshot.routeTrips;
  }

  function trafficDistanceToEndpoint(car, edge = mapModel.getEdge(car.edgeId)) {
    if (!edge) return Infinity;
    const edgeLength = car.edgeLength || polylineLength(edge.points);
    return car.directionSign > 0 ? edgeLength - car.along : car.along;
  }

  function trafficNextEdgeId(car) {
    return car.routeEdgeIds?.[car.routeIndex] || null;
  }

  function trafficIntersectionSignal(car, timeMs) {
    const edge = mapModel.getEdge(car.edgeId);
    if (!edge) return null;
    const nodeId = car.directionSign > 0 ? edge.to : edge.from;
    const next = mapModel.getEdge(trafficNextEdgeId(car));
    if (!next || (next.from !== nodeId && next.to !== nodeId)) return null;
    const nextDirectionSign = next.from === nodeId ? 1 : -1;
    return trafficOvertake.turnSignalForRoute({
      currentPoints:edge.points,
      currentDirectionSign:car.directionSign,
      nextPoints:next.points,
      nextDirectionSign,
      distanceToJunction:trafficDistanceToEndpoint(car, edge),
      timeMs
    });
  }

  function trafficLeadInfo(car, maxDistance = 320) {
    const edge = mapModel.getEdge(car.edgeId);
    if (!edge) return null;

    let best = null;
    const choose = (other, centerDistance) => {
      if (!(centerDistance > 0) || !Number.isFinite(centerDistance) || centerDistance > maxDistance) return;
      if (!best || centerDistance < best.distance) best = { car:other, distance:centerDistance };
    };

    // Same edge first.
    for (const other of traffic) {
      if (other === car || other.edgeId !== car.edgeId || other.directionSign !== car.directionSign) continue;
      if (Math.abs((other.laneOffset || 0) - (car.laneOffset || 0)) > 20) continue;
      choose(other, (other.along - car.along) * car.directionSign);
    }

    // Then follow the actual route across several short/curved edges. The old
    // logic looked only one edge ahead, so a stopped car two tiny edges beyond
    // a bend disappeared from the follower's perception.
    let nodeId = car.directionSign > 0 ? edge.to : edge.from;
    let accumulated = trafficDistanceToEndpoint(car, edge);
    const routeIds = Array.isArray(car.routeEdgeIds) ? car.routeEdgeIds : [];

    for (let i = car.routeIndex; i < routeIds.length && i < car.routeIndex + 4 && accumulated <= maxDistance; i += 1) {
      const next = mapModel.getEdge(routeIds[i]);
      if (!next || (next.from !== nodeId && next.to !== nodeId)) break;

      const directionSign = next.from === nodeId ? 1 : -1;
      const nextLength = polylineLength(next.points);
      const expectedLaneOffset = trafficLaneOffsetForEdge(next, Boolean(car.secondaryLane));

      for (const other of traffic) {
        if (other === car || other.edgeId !== next.id || other.directionSign !== directionSign) continue;
        if (Math.abs((other.laneOffset || 0) - expectedLaneOffset) > 22) continue;

        const otherLength = other.edgeLength || nextLength;
        const centerFromNode = directionSign > 0 ? other.along : otherLength - other.along;
        choose(other, accumulated + Math.max(0, centerFromNode));
      }

      accumulated += nextLength;
      nodeId = directionSign > 0 ? next.to : next.from;
    }

    return best;
  }

  function personOccupiesVehicleRoad(x, y) {
    const hit = mapModel.nearestRoad(x, y, { vehicleOnly:true });
    if (!hit?.edge) return false;

    // Pedestrians normally walk just outside the paved vehicle surface
    // (edge.width / 2 + ~5). Count them only after they actually enter the
    // carriageway/crosswalk, otherwise a person on the sidewalk at the inside
    // of a curve can make an NPC stop forever.
    const halfWidth = (hit.edge.width || ROAD_WIDTH) / 2;
    return hit.distance <= Math.max(8, halfWidth - 3);
  }

  function projectedObstacleDistance(car, ignorePersonalCar = false) {
    const hx = Math.cos(car.angle);
    const hy = Math.sin(car.angle);
    const dims = vehicleDimensions(car);
    const corridor = dims.width * .5 + 12;
    let best = Infinity;

    const considerPoint = (x, y, radius = 0) => {
      const dx = x - car.x;
      const dy = y - car.y;
      const forward = dx * hx + dy * hy;
      if (forward <= 0 || forward > 165) return;
      const lateral = Math.abs(dx * -hy + dy * hx);
      if (lateral > corridor + radius) return;
      best = Math.min(best, Math.max(0, forward - dims.length * .5 - radius));
    };

    if (
      !state.player.inVehicle &&
      !state.player.inTrain &&
      !state.player.inHome &&
      personOccupiesVehicleRoad(state.player.x, state.player.y)
    ) {
      considerPoint(state.player.x, state.player.y, PLAYER_COLLISION_RADIUS);
    }

    for (const ped of visiblePedestrianColliders()) {
      if (!personOccupiesVehicleRoad(ped.x, ped.y)) continue;
      considerPoint(ped.x, ped.y, NPC_COLLISION_RADIUS);
    }

    if (!ignorePersonalCar) {
      const dx = personalCar.x - car.x;
      const dy = personalCar.y - car.y;
      const forward = dx * hx + dy * hy;
      const lateral = Math.abs(dx * -hy + dy * hx);
      const headingDot = Math.cos(personalCar.angle) * hx + Math.sin(personalCar.angle) * hy;
      const otherDims = vehicleDimensions(personalCar, true);
      if (forward > 0 && forward < 210 && lateral < (dims.width + otherDims.width) * .5 + 10 && headingDot > -.25) {
        best = Math.min(best, Math.max(0, forward - dims.length * .5 - otherDims.length * .5));
      }
    }

    return best;
  }

  function trafficAlongAtRoadHit(edge, hit) {
    if (!edge || !hit || hit.edgeId !== edge.id) return null;
    let along = 0;
    for (let i = 1; i < edge.points.length; i += 1) {
      const segmentLength = distance(edge.points[i - 1], edge.points[i]);
      if (i - 1 === hit.segmentIndex) return along + segmentLength * hit.t;
      along += segmentLength;
    }
    return null;
  }

  function parkedVehicleExtentOnRoad(edge, hit, directionSign, axis = "normal") {
    const a = edge.points[hit.segmentIndex];
    const b = edge.points[hit.segmentIndex + 1];
    if (!a || !b) return Infinity;
    const magnitude = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const tx = (b.x - a.x) / magnitude * directionSign;
    const ty = (b.y - a.y) / magnitude * directionSign;
    const nx = ty;
    const ny = -tx;
    const headingX = Math.cos(personalCar.angle);
    const headingY = Math.sin(personalCar.angle);
    const sideX = -headingY;
    const sideY = headingX;
    const dims = vehicleDimensions(personalCar, true);
    const ax = axis === "normal" ? nx : tx;
    const ay = axis === "normal" ? ny : ty;
    return VEHICLE_COLLISION_SCALE * (
      dims.length * .5 * Math.abs(headingX * ax + headingY * ay) +
      dims.width * .5 * Math.abs(sideX * ax + sideY * ay)
    );
  }

  function trafficParkedCarInfo(car) {
    const edge = mapModel.getEdge(car.edgeId);
    if (!edge || !edge.vehicle || state.player.inVehicle || (personalCar.speed || 0) > 2) return null;
    const parkedHit = mapModel.nearestRoad(personalCar.x, personalCar.y, { vehicleOnly:true });
    if (!parkedHit || parkedHit.edgeId !== edge.id || parkedHit.distance > edge.width / 2 + 36) return null;
    const parkedAlong = trafficAlongAtRoadHit(edge, parkedHit);
    if (!Number.isFinite(parkedAlong)) return null;
    const actualDistance = (parkedAlong - car.along) * car.directionSign;
    if (actualDistance <= 0 || actualDistance > 360) return null;
    const a = edge.points[parkedHit.segmentIndex];
    const b = edge.points[parkedHit.segmentIndex + 1];
    if (!a || !b) return null;
    const magnitude = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const normalX = (b.y - a.y) / magnitude * car.directionSign;
    const normalY = -(b.x - a.x) / magnitude * car.directionSign;
    const obstacleLateral = (personalCar.x - parkedHit.point.x) * normalX + (personalCar.y - parkedHit.point.y) * normalY;
    const carHalfWidth = vehicleDimensions(car).width * VEHICLE_COLLISION_SCALE / 2;
    const obstacleHalfWidth = parkedVehicleExtentOnRoad(edge, parkedHit, car.directionSign);
    const obstacleHalfLength = parkedVehicleExtentOnRoad(edge, parkedHit, car.directionSign, "tangent");
    const blocksLane = trafficOvertake.blocksLane({
      carOffset:car.laneOffset,
      carHalfWidth,
      obstacleLateral,
      obstacleHalfWidth
    });
    const centerGap = actualDistance - vehicleDimensions(car).length * VEHICLE_COLLISION_SCALE / 2 - obstacleHalfLength;
    return { edge, hit:parkedHit, actualDistance, centerGap, obstacleLateral, obstacleHalfWidth, obstacleHalfLength, carHalfWidth, blocksLane };
  }

  function trafficOvertakePlan(car, obstacle) {
    if (!obstacle) return null;
    const { edge, actualDistance, obstacleLateral, obstacleHalfWidth, obstacleHalfLength, carHalfWidth } = obstacle;

    const endpointDistance = trafficDistanceToEndpoint(car, edge);
    const vehicleHalfLength = vehicleDimensions(car).length * VEHICLE_COLLISION_SCALE / 2;
    const opposingVehicles = traffic.filter((other) =>
      other !== car && other.edgeId === edge.id && other.directionSign !== car.directionSign
    ).map((other) => ({
      distance:(other.along - car.along) * car.directionSign,
      halfLength:vehicleDimensions(other).length * VEHICLE_COLLISION_SCALE / 2,
      speed:other.speed,
      cruiseSpeed:other.cruise
    }));
    return trafficOvertake.planForObstacle({
      roadWidth:edge.width,
      carHalfWidth,
      vehicleHalfLength,
      currentOffset:car.laneOffset,
      obstacleDistance:actualDistance,
      minimumDistance:car.speed < 5
        ? trafficOvertake.minimumEmergencyDistance(vehicleHalfLength,obstacleHalfLength)
        : 130,
      obstacleLateral,
      obstacleHalfWidth,
      obstacleHalfLength,
      endpointDistance,
      currentAlong:car.along,
      directionSign:car.directionSign,
      planningSpeed:Math.max(car.speed, 85),
      opposingVehicles
    });
    if (!blocksLane) return null;
  }

  function updateTrafficOvertake(car, dt, stationaryParkedBlock = false) {
    const plan = car.overtakePlan;
    if (!plan || plan.directionSign !== car.directionSign) return false;
    const result = trafficOvertake.offsetAt(plan, car.along, dt, { stationary:stationaryParkedBlock });
    if (Number.isFinite(result.shiftProgress)) plan.shiftProgress = result.shiftProgress;
    if (Number.isFinite(result.stationaryShiftStart)) plan.stationaryShiftStart = result.stationaryShiftStart;
    if (Number.isFinite(result.stationaryShiftElapsed)) plan.stationaryShiftElapsed = result.stationaryShiftElapsed;
    if (Number.isFinite(result.stationaryShiftProgress)) plan.stationaryShiftProgress = result.stationaryShiftProgress;
    car.laneOffset = result.offset;
    if (result.complete) car.overtakePlan = null;
    return result.complete;
  }

  function junctionCoreRadius(endpoint) {
    const generated = mapModel.junctionGeometry?.(endpoint.id);
    if (generated) {
      return clamp(
        Math.max(generated.padRadius + 18, generated.conflictRadius * .58 + 18),
        48,
        108
      );
    }
    const incident = vehicleEdgesAtNode(endpoint.id);
    if (!incident.length) return 52;
    const widest = Math.max(...incident.map((edge) => edge.width || ROAD_WIDTH));
    return clamp(widest * .34 + 20, 48, 82);
  }

  function junctionReleaseRadius(endpoint) {
    return clamp(junctionCoreRadius(endpoint) + 58, 105, 172);
  }

  function trafficApproachDistanceToNode(car, nodeId) {
    const edge = mapModel.getEdge(car.edgeId);
    if (!edge) return Infinity;
    const endpointId = car.directionSign > 0 ? edge.to : edge.from;
    if (endpointId !== nodeId) return Infinity;
    return trafficDistanceToEndpoint(car, edge);
  }

  function trafficSignalAllowsEntry(car, endpoint) {
    const edge = mapModel.getEdge(car.edgeId);
    if (!edge || !isSignalizedMapNode(endpoint.id)) return true;
    const distanceToNode = trafficDistanceToEndpoint(car, edge);
    const geometry = signalGeometryAtNode(endpoint.id, edge);
    const centerStopOffset = geometry.stopOffset + vehicleFrontOverhang(car);
    const gapToStopLine = distanceToNode - centerStopOffset;
    if (gapToStopLine < -2) return true;
    const signal = signalStateAt(endpoint.x, endpoint.y, edgeOrientation(edge));
    return !trafficShouldStopForSignal(car, signal, Math.max(0, gapToStopLine));
  }

  function refreshJunctionReservations() {
    for (const [nodeId, reservation] of junctionReservations) {
      const endpoint = mapModel.getNode(nodeId);
      const owner = reservation?.owner;
      if (!endpoint || !owner || !traffic.includes(owner)) {
        junctionReservations.delete(nodeId);
        continue;
      }

      const releaseRadius = junctionReleaseRadius(endpoint);
      if (distance(owner.x, owner.y, endpoint.x, endpoint.y) <= releaseRadius) {
        reservation.expiresAt = trafficSimulationClock + .45;
      } else if (reservation.expiresAt <= trafficSimulationClock) {
        junctionReservations.delete(nodeId);
      }
    }
  }

  function markPlayerTrafficFlowPriority() {
    for (const car of traffic) car.playerFlowPriority = 0;
    if (!state.player.inVehicle) return [];

    const first = leadVehicleInfo()?.car;
    if (!first) return [];

    const chain = [];
    const seen = new Set();
    let current = first;
    for (let depth = 0; current && depth < 6 && !seen.has(current); depth += 1) {
      seen.add(current);
      chain.push(current);
      current = trafficLeadInfo(current)?.car || null;
    }

    // Every car in the player's immediate queue gets priority over unrelated
    // cross traffic. The front of the queue receives the strongest priority,
    // because moving it releases all following vehicles including the player.
    for (let i = 0; i < chain.length; i += 1) {
      chain[i].playerFlowPriority = 20 + i * 5;
    }
    return chain;
  }

  function trafficCarVisible(car, margin = 120) {
    const sx = car.x - state.camera.x;
    const sy = car.y - state.camera.y;
    return sx >= -margin && sy >= -margin && sx <= viewWidth + margin && sy <= viewHeight + margin;
  }

  function relocateGridlockedTraffic(car) {
    if (!car || trafficCarVisible(car, 180)) return false;

    const actor = state.player.inVehicle ? personalCar : state.player;
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const p = randomRoadPoint((car.seed || 1) + 601 + attempt * 43, (car.routeTrips || 0) + 811 + attempt * 29, 18);
      if (distance(p.x, p.y, actor.x, actor.y) < 620) continue;

      const probe = {
        ...car,
        x:p.x,
        y:p.y,
        angle:p.angle,
        edgeId:p.edgeId,
        edgeLength:p.edgeLength,
        directionSign:p.directionSign,
        laneOffset:p.laneOffset,
        secondaryLane:p.secondaryLane,
        along:p.along
      };
      if (traffic.some((other) => other !== car && vehiclesIntersect(probe, other, 22))) continue;
      if (vehiclesIntersect(probe, personalCar, 28)) continue;

      car.x = p.x;
      car.y = p.y;
      car.angle = p.angle;
      car.edgeId = p.edgeId;
      car.edgeLength = p.edgeLength;
      car.directionSign = p.directionSign;
      car.laneOffset = p.laneOffset;
      car.secondaryLane = p.secondaryLane;
      car.along = p.along;
      car.speed = Math.max(35, Math.min(car.cruise * .55, 95));
      car.collisionYield = 0;
      car.junctionWait = 0;
      car.trafficStall = 0;
      car.routeEdgeIds = [];
      car.routeIndex = 0;

      const edge = mapModel.getEdge(car.edgeId);
      if (edge) {
        const startNodeId = car.directionSign > 0 ? edge.to : edge.from;
        planTrafficRoute(car, startNodeId, edge.id);
      }
      return true;
    }
    return false;
  }

  function relievePlayerTrafficQueue(queue) {
    if (!state.player.inVehicle || queue.length < 3) return;

    // Only the head of a long queue is eligible for emergency cleanup. This
    // avoids cars disappearing immediately in front of the player while still
    // guaranteeing that an off-screen deadlock cannot block the road forever.
    const head = queue[queue.length - 1];
    if ((head.trafficStall || 0) < 6) return;
    relocateGridlockedTraffic(head);
  }

  function releaseCarJunctionReservations(car) {
    for (const [nodeId, reservation] of junctionReservations) {
      if (reservation?.owner === car) junctionReservations.delete(nodeId);
    }
  }

  function replanStuckTraffic(car) {
    const edge = mapModel.getEdge(car.edgeId);
    if (!edge) return false;

    const endpointId = car.directionSign > 0 ? edge.to : edge.from;
    const endpointDistance = trafficDistanceToEndpoint(car, edge);
    if (endpointDistance > 210) return false;

    const alternatives = vehicleEdgesAtNode(endpointId).filter((candidate) => candidate.id !== edge.id);
    if (!alternatives.length) return false;

    releaseCarJunctionReservations(car);
    const replanned = planTrafficRoute(car, endpointId, edge.id);
    if (!replanned) return false;

    car.collisionYield = 0;
    car.junctionWait = 0;
    car.stuckRecoveryCooldown = 2.4;
    car.stuckRecoveryCount = (car.stuckRecoveryCount || 0) + 1;
    car.trafficStall = Math.min(car.trafficStall || 0, 1.4);
    return true;
  }

  function recoverStuckTraffic(dt) {
    for (const car of traffic) {
      car.stuckRecoveryCooldown = Math.max(0, (car.stuckRecoveryCooldown || 0) - dt);
      const stall = car.trafficStall || 0;
      if (stall < 3.8 || car.stuckRecoveryCooldown > 0) continue;

      // Prefer a normal reroute while the vehicle is visible. This keeps
      // recovery believable and avoids cars disappearing in front of the user.
      if (replanStuckTraffic(car)) continue;

      // If an unresolved deadlock remains away from the camera, recycle that
      // single vehicle to a clear road segment. This prevents remote jams from
      // growing until they reach the player.
      if (stall >= 7.5 && !trafficCarVisible(car, 220)) {
        releaseCarJunctionReservations(car);
        if (relocateGridlockedTraffic(car)) {
          car.stuckRecoveryCooldown = 3.5;
          car.stuckRecoveryCount = (car.stuckRecoveryCount || 0) + 1;
        }
      }
    }
  }

  function downstreamLaneClearance(car, endpoint, maxDistance = 260) {
    if (!endpoint) return Infinity;

    let nodeId = endpoint.id;
    let accumulated = 0;
    const routeIds = Array.isArray(car.routeEdgeIds) ? car.routeEdgeIds : [];

    for (let i = car.routeIndex; i < routeIds.length && i < car.routeIndex + 4; i += 1) {
      const edge = mapModel.getEdge(routeIds[i]);
      if (!edge || (edge.from !== nodeId && edge.to !== nodeId)) break;

      const directionSign = edge.from === nodeId ? 1 : -1;
      const edgeLength = polylineLength(edge.points);
      const expectedLaneOffset = trafficLaneOffsetForEdge(edge, Boolean(car.secondaryLane));

      for (const other of traffic) {
        if (other === car || other.edgeId !== edge.id || other.directionSign !== directionSign) continue;
        if (Math.abs((other.laneOffset || 0) - expectedLaneOffset) > 20) continue;

        const otherLength = other.edgeLength || edgeLength;
        const centerFromNode = directionSign > 0 ? other.along : otherLength - other.along;
        if (centerFromNode < -2) continue;

        const rearClearance = accumulated +
          Math.max(0, centerFromNode) -
          vehicleDimensions(other).length * .5;
        if (rearClearance >= 0 && rearClearance <= maxDistance) return rearClearance;
      }

      accumulated += edgeLength;
      if (accumulated >= maxDistance) return Infinity;
      nodeId = directionSign > 0 ? edge.to : edge.from;
    }

    return Infinity;
  }

  function junctionHasExitSpace(car, endpoint) {
    if (!endpoint || vehicleEdgesAtNode(endpoint.id).length < 3) return true;

    const dims = vehicleDimensions(car);
    const coreRadius = junctionCoreRadius(endpoint);
    const requiredClearance =
      coreRadius +
      dims.length +
      30;

    // Use rear-bumper clearance along the actual outgoing route. Requiring a
    // full car length beyond the junction prevents a follower from entering
    // when the lead vehicle is stopped immediately after a bend/merge.
    return downstreamLaneClearance(car, endpoint, requiredClearance + 150) >= requiredClearance;
  }

  function junctionCandidateWins(car, endpoint, gateDistance) {
    const candidates = traffic.filter((other) => {
      const approachDistance = trafficApproachDistanceToNode(other, endpoint.id);
      return approachDistance <= gateDistance && trafficSignalAllowsEntry(other, endpoint);
    });
    if (!candidates.length) return true;

    candidates.sort((a, b) => {
      const flowDelta = (b.playerFlowPriority || 0) - (a.playerFlowPriority || 0);
      if (flowDelta !== 0) return flowDelta;

      const waitDelta = (b.junctionWait || 0) - (a.junctionWait || 0);
      if (Math.abs(waitDelta) > .06) return waitDelta;

      const aDistance = trafficApproachDistanceToNode(a, endpoint.id);
      const bDistance = trafficApproachDistanceToNode(b, endpoint.id);
      if (Math.abs(aDistance - bDistance) > 4) return aDistance - bDistance;

      return (a.seed || 0) - (b.seed || 0);
    });
    return candidates[0] === car;
  }

  function requestJunctionEntry(car, endpoint, endpointDistance, yieldOffset) {
    if (!endpoint || vehicleEdgesAtNode(endpoint.id).length < 3) return true;

    const coreRadius = junctionCoreRadius(endpoint);
    const gateDistance = Math.max(yieldOffset + 38, coreRadius + 58);

    // Once the nose has crossed the yield/stop line, never freeze the car in
    // the junction. Give it the reservation so it can clear the conflict area.
    if (endpointDistance < yieldOffset - 2) {
      junctionReservations.set(endpoint.id, {
        owner:car,
        expiresAt:trafficSimulationClock + .55
      });
      return true;
    }

    if (endpointDistance > gateDistance) return true;

    const current = junctionReservations.get(endpoint.id);
    if (current) {
      if (current.owner === car) {
        current.expiresAt = trafficSimulationClock + .55;
        return true;
      }

      const ownerInCore = current.owner &&
        distance(current.owner.x, current.owner.y, endpoint.x, endpoint.y) <= coreRadius;
      const playerQueueOverride = (car.playerFlowPriority || 0) > 0 &&
        (car.junctionWait || 0) > 2.2 &&
        !ownerInCore;

      if (current.expiresAt > trafficSimulationClock && !playerQueueOverride) return false;
      junctionReservations.delete(endpoint.id);
    }

    // A vehicle physically inside the central conflict area owns it even if
    // its previous reservation has just expired.
    for (const other of traffic) {
      if (other === car) continue;
      if (distance(other.x, other.y, endpoint.x, endpoint.y) <= coreRadius) {
        junctionReservations.set(endpoint.id, {
          owner:other,
          expiresAt:trafficSimulationClock + .55
        });
        return false;
      }
    }

    // The player's car is treated as a physical occupant only while actually
    // inside the junction, so merely waiting nearby cannot freeze NPC traffic.
    if (
      state.player.inVehicle &&
      distance(personalCar.x, personalCar.y, endpoint.x, endpoint.y) <= coreRadius
    ) {
      return false;
    }

    if (!junctionCandidateWins(car, endpoint, gateDistance)) return false;

    junctionReservations.set(endpoint.id, {
      owner:car,
      expiresAt:trafficSimulationClock + .55
    });
    return true;
  }

  function trafficShouldStopForSignal(car, signal, gapToStopLine) {
    if (signal === "red") return true;
    if (signal !== "yellow") return false;
    const comfortableDecel = 260;
    const reactionDistance = Math.max(10, car.speed * .12);
    const stoppingDistance = (car.speed * car.speed) / (2 * comfortableDecel) + reactionDistance;
    return gapToStopLine > stoppingDistance;
  }

  function updateTraffic(dt) {
    trafficSimulationClock += dt;
    refreshJunctionReservations();
    const playerTrafficQueue = markPlayerTrafficFlowPriority();

    for (const car of traffic) {
      car.collisionYield = Math.max(0, (car.collisionYield || 0) - dt);
      const motionBefore = captureTrafficMotion(car);
      const edge = mapModel.getEdge(car.edgeId);
      if (!edge) continue;
      const edgeLength = car.edgeLength || polylineLength(edge.points);
      const roadLimit = (edge.speedLimit || 30) / SPEED_TO_KMH;
      let targetSpeed = Math.min(car.cruise, roadLimit * .92);
      if (car.collisionYield > 0) targetSpeed = 0;
      let activeStop = null;
      let blockReason = null;

      const endpoint = car.directionSign > 0 ? mapModel.getNode(edge.to) : mapModel.getNode(edge.from);
      const endpointDistance = trafficDistanceToEndpoint(car, edge);
      const approachGeometry = endpoint ? signalGeometryAtNode(endpoint.id, edge) : null;
      const yieldLineOffset = approachGeometry?.yieldOffset
        ?? ((edge.width || ROAD_WIDTH) * .5 + 10);

      // This is a center-of-car distance, not a painted-line distance. Keeping
      // the front overhang outside the generated junction boundary prevents a
      // yielding vehicle from blocking cross traffic at unsignalized T-junctions.
      let junctionYieldOffset = yieldLineOffset + vehicleFrontOverhang(car);

      if (endpoint && isSignalizedMapNode(endpoint.id)) {
        const geometry = approachGeometry || signalGeometryAtNode(endpoint.id, edge);
        const signal = signalStateAt(endpoint.x, endpoint.y, edgeOrientation(edge));
        const centerStopOffset = geometry.stopOffset + vehicleFrontOverhang(car);
        const gapToStopLine = endpointDistance - centerStopOffset;
        const stillApproachingLine = gapToStopLine >= -2;
        junctionYieldOffset = centerStopOffset;

        if (stillApproachingLine && trafficShouldStopForSignal(car, signal, Math.max(0, gapToStopLine))) {
          activeStop = { centerStopOffset, endpointId:endpoint.id, reason:"signal" };
          blockReason = "signal";
          car.junctionWait = 0;
          if (gapToStopLine < 130) {
            targetSpeed = Math.min(targetSpeed, Math.max(0, gapToStopLine * 2.2));
          }
        }
      }

      if (endpoint && !activeStop && endpointDistance < junctionYieldOffset + 150) {
        const hasExitSpace = junctionHasExitSpace(car, endpoint);
        const hasPermit = hasExitSpace &&
          requestJunctionEntry(car, endpoint, endpointDistance, junctionYieldOffset);

        if (!hasExitSpace) {
          const gapToYield = endpointDistance - junctionYieldOffset;
          if (gapToYield > -2) {
            activeStop = { centerStopOffset:junctionYieldOffset, endpointId:endpoint.id, reason:"spillback" };
            blockReason = "spillback";
            car.junctionWait = Math.max(0, (car.junctionWait || 0) - dt * 2);
            targetSpeed = Math.min(targetSpeed, Math.max(0, gapToYield * 2.05));
          }
        } else if (!hasPermit) {
          const gapToYield = endpointDistance - junctionYieldOffset;
          if (gapToYield > -2) {
            activeStop = { centerStopOffset:junctionYieldOffset, endpointId:endpoint.id, reason:"junction" };
            blockReason = "junction";
            car.junctionWait = (car.junctionWait || 0) + dt;
            targetSpeed = Math.min(targetSpeed, Math.max(0, gapToYield * 2.05));
          }
        } else {
          car.junctionWait = Math.max(0, (car.junctionWait || 0) - dt * 3);
        }
      } else if (!activeStop) {
        car.junctionWait = Math.max(0, (car.junctionWait || 0) - dt * 2);
      }

      const lead = trafficLeadInfo(car);
      if (lead) {
        const dims = vehicleDimensions(car);
        const leadDims = vehicleDimensions(lead.car);
        const bumperGap = Math.max(0, lead.distance - dims.length * .5 - leadDims.length * .5);
        const desiredGap = 22 + Math.min(62, car.speed * .24);
        if (bumperGap < desiredGap + 70) {
          targetSpeed = Math.min(targetSpeed, Math.max(0, (bumperGap - desiredGap) * 2.25));
          if (bumperGap <= desiredGap + 8 && !blockReason) blockReason = "npc";
        }
      }

      const parkedObstacle = trafficParkedCarInfo(car);
      const parkedGap = parkedObstacle?.blocksLane ? parkedObstacle.centerGap : Infinity;
      const projectedGap = projectedObstacleDistance(car, Boolean(parkedObstacle));
      const obstacleGap = Math.min(projectedGap, parkedGap);
      if (!car.overtakePlan && parkedGap < 180) {
        car.overtakePlan = trafficOvertakePlan(car, parkedObstacle);
      }
      if (obstacleGap < 105) {
        const desiredObstacleGap = 18 + Math.min(38, car.speed * .16);
        targetSpeed = Math.min(targetSpeed, Math.max(0, (obstacleGap - desiredObstacleGap) * 2.4));
        if (obstacleGap <= desiredObstacleGap + 6 && !blockReason) blockReason = "obstacle";
      }

      const stalledByTraffic = car.speed < 3 &&
        targetSpeed < 8 &&
        blockReason !== "signal" &&
        blockReason !== "obstacle" &&
        blockReason !== "spillback";
      if (stalledByTraffic) {
        car.trafficStall = (car.trafficStall || 0) + dt;
      } else {
        car.trafficStall = Math.max(0, (car.trafficStall || 0) - dt * 2.5);
      }

      const brakingNow = targetSpeed < car.speed - 8;
      car.brakeGlow += ((brakingNow ? 1 : 0) - car.brakeGlow) * Math.min(1, dt * 8);
      const response = targetSpeed < car.speed ? 3.5 : 1.8;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * response);
      if (car.speed < .45 && targetSpeed <= .5) car.speed = 0;

      let remaining = car.speed * dt;
      let transitions = 0;
      while (remaining > 0 && transitions < 4) {
        const currentEdge = mapModel.getEdge(car.edgeId);
        if (!currentEdge) break;
        const currentLength = car.edgeLength || polylineLength(currentEdge.points);
        const currentEndpointDistance = car.directionSign > 0 ? currentLength - car.along : car.along;

        if (activeStop && transitions === 0) {
          const allowedToStop = Math.max(0, currentEndpointDistance - activeStop.centerStopOffset);
          if (remaining >= allowedToStop) {
            car.along = car.directionSign > 0
              ? Math.max(0, currentLength - activeStop.centerStopOffset)
              : Math.min(currentLength, activeStop.centerStopOffset);
            car.speed = 0;
            car.brakeGlow = Math.max(car.brakeGlow, .85);
            remaining = 0;
            break;
          }
        }

        if (remaining < Math.max(1, currentEndpointDistance)) {
          car.along += car.directionSign * remaining;
          remaining = 0;
          break;
        }

        remaining = Math.max(0, remaining - Math.max(1, currentEndpointDistance));
        car.along = car.directionSign > 0 ? currentLength : 0;
        if (!advanceTrafficRoute(car)) {
          car.speed = 0;
          remaining = 0;
        }
        transitions += 1;
      }

      const stationaryParkedBlock = car.speed < 5 && blockReason === "obstacle" &&
        parkedObstacle?.blocksLane && parkedGap <= projectedGap;
      updateTrafficOvertake(car, dt, stationaryParkedBlock);
      const steeredPose = trafficPoseAt(car, car.along);
      car.x = steeredPose.x;
      car.y = steeredPose.y;
      car.angle = steeredPose.angle;

      const hitVehicle = vehicleIntersectsAnyVehicle(car);
      const hitPerson = vehicleIntersectsAnyPerson(car);
      if (hitVehicle || hitPerson) {
        restoreTrafficMotion(car, motionBefore);
        car.speed = 0;
        car.brakeGlow = 1;

        if (hitPerson) {
          car.collisionYield = Math.max(car.collisionYield || 0, .34);
        } else if (hitVehicle === personalCar) {
          car.collisionYield = Math.max(car.collisionYield || 0, .48);
        } else if (hitVehicle) {
          // Repeated collision rollback is a real deadlock even when targetSpeed
          // itself is non-zero, so feed it into the general stall detector.
          car.trafficStall = (car.trafficStall || 0) + dt * 1.5;
          const myPriority = car.seed || 0;
          const otherPriority = hitVehicle.seed || 0;
          if (myPriority >= otherPriority) {
            car.collisionYield = Math.max(car.collisionYield || 0, .58);
          }
        }
      }
    }

    relievePlayerTrafficQueue(playerTrafficQueue);
    recoverStuckTraffic(dt);
  }


  function clonePedestrianTransition(transition) {
    if (!transition) return null;
    return {
      from:{ ...transition.from },
      control:{ ...transition.control },
      to:{ ...transition.to },
      length:transition.length,
      progress:transition.progress
    };
  }

  function capturePedestrianMotion(ped) {
    return {
      edgeId:ped.edgeId,
      edgeLength:ped.edgeLength,
      directionSign:ped.directionSign,
      along:ped.along,
      routeIndex:ped.routeIndex,
      currentNodeId:ped.currentNodeId,
      targetNodeId:ped.targetNodeId,
      junctionTransition:clonePedestrianTransition(ped.junctionTransition),
      x:ped.x,
      y:ped.y,
      dir:ped.dir,
      state:ped.state,
      waitTimer:ped.waitTimer
    };
  }

  function restorePedestrianMotion(ped, snapshot) {
    ped.edgeId = snapshot.edgeId;
    ped.edgeLength = snapshot.edgeLength;
    ped.directionSign = snapshot.directionSign;
    ped.along = snapshot.along;
    ped.routeIndex = snapshot.routeIndex;
    ped.currentNodeId = snapshot.currentNodeId;
    ped.targetNodeId = snapshot.targetNodeId;
    ped.junctionTransition = clonePedestrianTransition(snapshot.junctionTransition);
    ped.x = snapshot.x;
    ped.y = snapshot.y;
    ped.dir = snapshot.dir;
    ped.state = snapshot.state;
    ped.waitTimer = snapshot.waitTimer;
  }

  function pedestrianCollision(ped) {
    const car = personIntersectsAnyVehicle(ped.x, ped.y, NPC_COLLISION_RADIUS);
    if (car) return { type:"vehicle", target:car };
    return personIntersectsAnotherPerson(ped.x, ped.y, NPC_COLLISION_RADIUS, ped, true);
  }

  function pedestrianPriority(ped) {
    return Number.isFinite(Number(ped?.seed)) ? Number(ped.seed) : 0;
  }

  function requestPedestrianAvoidance(ped, offset = 16, holdSeconds = .65) {
    if (!ped) return;
    const edge = mapModel.getEdge(ped.edgeId);
    const maxAvoidance = edge
      ? pedestrianSidewalkLayout(edge, ped.directionSign).maxAvoidance
      : Math.max(0, offset);
    const requested = Math.min(Math.max(0, offset), maxAvoidance);
    ped.avoidanceTarget = Math.max(Number(ped.avoidanceTarget) || 0, requested);
    ped.avoidanceHold = Math.max(Number(ped.avoidanceHold) || 0, Math.max(0, holdSeconds));
  }

  function updatePedestrianAvoidance(ped, dt) {
    if (!ped || ped.junctionTransition) return;
    ped.avoidanceHold = Math.max(0, (Number(ped.avoidanceHold) || 0) - dt);
    if (ped.avoidanceHold <= 0) ped.avoidanceTarget = 0;

    const edge = mapModel.getEdge(ped.edgeId);
    if (!edge) return;
    const layout = pedestrianSidewalkLayout(edge, ped.directionSign);
    const current = clamp(Math.max(0, Number(ped.avoidanceOffset) || 0), 0, layout.maxAvoidance);
    const target = clamp(Math.max(0, Number(ped.avoidanceTarget) || 0), 0, layout.maxAvoidance);
    const rate = target > current ? 34 : 22;
    const delta = clamp(target - current, -rate * dt, rate * dt);
    if (Math.abs(delta) < .001) return;

    const nextOffset = clamp(current + delta, 0, layout.maxAvoidance);
    const pose = pedestrianEdgePose(
      edge,
      ped.directionSign,
      ped.along,
      ped.sideSign,
      nextOffset
    );

    // Avoidance is a continuous sidestep on the same sidewalk. If the outward
    // side is blocked, wait in place rather than swapping to the opposite curb.
    if (
      nextOffset > current &&
      (
        !canStand(pose.x, pose.y, NPC_COLLISION_RADIUS) ||
        personIntersectsAnyVehicle(pose.x, pose.y, NPC_COLLISION_RADIUS)
      )
    ) {
      ped.avoidanceTarget = current;
      ped.avoidanceHold = 0;
      return;
    }

    ped.avoidanceOffset = nextOffset;
    if (ped.state === "walking" || ped.state === "waiting") {
      ped.x = pose.x;
      ped.y = pose.y;
      ped.dir = pose.angle;
    }
  }

  function pedestrianFollowingLimit(ped, distanceUnits) {
    const requested = Math.max(0, distanceUnits);
    if (ped.junctionTransition) return requested;
    const minimumGap = 24;
    let allowed = requested;

    // Reserve space on the route before moving. Collision rollback happens
    // after movement and makes a same-direction queue oscillate forever when
    // several pedestrians share a narrow dead-end sidewalk.
    for (const other of visiblePedestrianColliders()) {
      if (other === ped || other.junctionTransition || other.edgeId !== ped.edgeId) continue;
      if (other.directionSign !== ped.directionSign) continue;
      if ((other.sideSign || 1) !== (ped.sideSign || 1)) continue;
      const ahead = (other.along - ped.along) * ped.directionSign;
      if (ahead <= 0 || ahead >= allowed + minimumGap) continue;
      allowed = Math.min(allowed, Math.max(0, ahead - minimumGap));
    }
    return allowed;
  }

  function attemptPedestrianMove(ped, distanceUnits) {
    if (distanceUnits <= .001) return true;
    const safeDistance = pedestrianFollowingLimit(ped, distanceUnits);
    if (safeDistance <= .001) {
      ped.collisionWait = Math.max(ped.collisionWait || 0, .08);
      return false;
    }

    const snapshot = capturePedestrianMotion(ped);
    moveCitizenAlongRoute(ped, safeDistance);

    // Arrival inside a building removes the person from physical street space.
    if (ped.state === "inside" || !ped.visible) return true;

    const collision = pedestrianCollision(ped);
    if (!collision) return true;

    // Roll back route progress first. Collision avoidance is then requested as
    // a gradual sidestep; no collision branch may rewrite sideSign or x/y.
    restorePedestrianMotion(ped, snapshot);

    if (collision.type === "pedestrian") {
      const yieldingPed = pedestrianPriority(ped) < pedestrianPriority(collision.target)
        ? ped
        : collision.target;
      requestPedestrianAvoidance(yieldingPed, 18, .8);
      yieldingPed.collisionWait = Math.max(yieldingPed.collisionWait || 0, .20);
      if (yieldingPed !== ped) {
        ped.collisionWait = Math.max(ped.collisionWait || 0, .08);
      }
    } else if (collision.type === "player") {
      requestPedestrianAvoidance(ped, 18, .75);
      ped.collisionWait = Math.max(ped.collisionWait || 0, .18);
    } else {
      // A vehicle beside a narrow sidewalk should make the pedestrian tuck
      // outward first, not enter an endless stop/retry loop at the curb.
      requestPedestrianAvoidance(ped, 16, .95);
      ped.collisionWait = Math.max(
        ped.collisionWait || 0,
        .08 + hash2(ped.seed || 0, ped.tripCount || 0, 2051) * .10
      );
    }
    return false;
  }

  function pedestrianVisibleOnScreen(ped, margin = 120) {
    const sx = ped.x - state.camera.x;
    const sy = ped.y - state.camera.y;
    return sx >= -margin && sy >= -margin && sx <= viewWidth + margin && sy <= viewHeight + margin;
  }

  function recoverStuckPedestrian(ped) {
    if (!ped || (ped.state !== "walking" && ped.state !== "waiting")) return false;

    // Recovery must never switch sidewalks or rebuild from an arbitrary node.
    // Ask for a larger continuous sidestep on the current sidewalk and wait for
    // nearby traffic to clear. The sidestep itself is rate-limited per frame.
    const edge = mapModel.getEdge(ped.edgeId);
    const room = edge ? pedestrianSidewalkLayout(edge, ped.directionSign).maxAvoidance : 12;
    requestPedestrianAvoidance(ped, room, 1.05);
    ped.collisionWait = .30 + ((ped.seed || 0) % 3) * .08;
    ped.stuckTimer = 0;
    ped.stuckRecoveryCount = (ped.stuckRecoveryCount || 0) + 1;
    return true;
  }

  function updatePedestrians(dt, gameMinutes) {
    const minutes = Math.max(0, Number(gameMinutes) || 0);

    for (const ped of pedestrians) {
      if (ped.socialActivityRequest && !citizenSocialRequestIsValid(ped, ped.socialActivityRequest)) {
        ped.socialActivityRequest = null;
      }
      const travelling = ped.state === "walking" || ped.state === "waiting";
      citizenUpdateNeeds(ped, minutes, travelling);
      ped.collisionWait = Math.max(0, (ped.collisionWait || 0) - dt);
      updatePedestrianAvoidance(ped, dt);

      const walkingNow = ped.state === "walking" || ped.state === "waiting";
      if (walkingNow) {
        const lastX = Number.isFinite(ped.lastProgressX) ? ped.lastProgressX : ped.x;
        const lastY = Number.isFinite(ped.lastProgressY) ? ped.lastProgressY : ped.y;
        const moved = distance(lastX, lastY, ped.x, ped.y);
        const signalState = pedestrianSignalState(ped);
        const legitimatelyWaiting = Boolean(
          signalState &&
          signalState.state !== "walk" &&
          signalState.beforeCrosswalk
        );

        if (moved < .45 && !legitimatelyWaiting) {
          ped.stuckTimer = (ped.stuckTimer || 0) + dt;
        } else {
          ped.stuckTimer = Math.max(0, (ped.stuckTimer || 0) - dt * 2.2);
        }

        ped.lastProgressX = ped.x;
        ped.lastProgressY = ped.y;

        if ((ped.stuckTimer || 0) >= 3.2) {
          recoverStuckPedestrian(ped);
        }
      } else {
        ped.stuckTimer = 0;
        ped.lastProgressX = ped.x;
        ped.lastProgressY = ped.y;
      }

      if (ped.state === "inside" || ped.state === "staying") {
        ped.activityMinutesRemaining = Math.max(0, ped.activityMinutesRemaining - minutes);
        if (ped.state === "staying") ped.phase += dt * .7;
        if (ped.activityMinutesRemaining <= .001) completeCitizenActivity(ped);
        continue;
      }

      if (ped.state !== "walking" && ped.state !== "waiting") {
        planCitizenAction(ped, ped.currentNodeId || ped.homeNodeId);
        continue;
      }

      const signal = pedestrianSignalState(ped);
      const mustWait = Boolean(
        signal &&
        signal.state !== "walk" &&
        signal.beforeCrosswalk
      );

      if (mustWait) {
        const distanceToWaitPoint = Math.max(0, signal.distance - signal.waitOffset);
        const step = Math.min(ped.speed * dt, distanceToWaitPoint);

        if (step > .25) {
          ped.state = "walking";
          ped.waitTimer = 0;
          ped.phase += dt * ped.speed * .12;
          attemptPedestrianMove(ped, step);
        } else {
          ped.state = "waiting";
          ped.waitTimer = Math.min(1.2, ped.waitTimer + dt);
          const edge = mapModel.getEdge(ped.edgeId);
          if (edge) {
            ped.along = ped.directionSign > 0
              ? Math.max(0, ped.edgeLength - signal.waitOffset)
              : Math.min(ped.edgeLength, signal.waitOffset);
            let pose = pedestrianPoseAt(ped);
            ped.x = pose.x;
            ped.y = pose.y;
            ped.dir = pose.angle;

            const waitCollision = pedestrianCollision(ped);
            if (waitCollision && (waitCollision.type === "pedestrian" || waitCollision.type === "player")) {
              requestPedestrianAvoidance(ped, 16, .8);
              ped.collisionWait = Math.max(ped.collisionWait || 0, .12);
            }
          }
        }
        continue;
      }

      // If the signal changes after the pedestrian has entered the crossing,
      // keep moving. Never freeze a person in the middle of the roadway.
      ped.state = "walking";
      ped.waitTimer = 0;
      ped.phase += dt * ped.speed * .12;
      if (ped.collisionWait <= 0) attemptPedestrianMove(ped, ped.speed * dt);
    }

    resolvePedestrianOverlaps();
  }

  function tryNudgeStandingPedestrian(ped, dx, dy) {
    if (!ped || ped.state !== "staying" || !ped.visible) return false;
    const nx = ped.x + dx;
    const ny = ped.y + dy;
    if (!canStand(nx, ny, NPC_COLLISION_RADIUS)) return false;
    if (personIntersectsAnyVehicle(nx, ny, NPC_COLLISION_RADIUS)) return false;
    ped.x = nx;
    ped.y = ny;
    return true;
  }

  function resolvePedestrianOverlaps() {
    const visible = visiblePedestrianColliders();

    // If an outdoor activity begins on top of the player, move the NPC rather
    // than moving the player's controlled character.
    if (!state.player.inVehicle && !state.player.inTrain) {
      for (const ped of visible) {
        if (ped.state !== "staying") continue;
        const dx = ped.x - state.player.x;
        const dy = ped.y - state.player.y;
        const d = Math.hypot(dx, dy);
        const minimum = NPC_COLLISION_RADIUS + PLAYER_COLLISION_RADIUS;
        if (d >= minimum) continue;
        const ux = d > .001 ? dx / d : (hash2(ped.seed || 0, 1, 2052) > .5 ? 1 : -1);
        const uy = d > .001 ? dy / d : 0;
        tryNudgeStandingPedestrian(ped, ux * (minimum - d + 2), uy * (minimum - d + 2));
      }
    }

    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = visible[i];
        const b = visible[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minimum = NPC_COLLISION_RADIUS * 2;
        if (d >= minimum) continue;

        let ux;
        let uy;
        if (d > .001) {
          ux = dx / d;
          uy = dy / d;
        } else {
          const angle = hash2(a.seed || i, b.seed || j, 2053) * Math.PI * 2;
          ux = Math.cos(angle);
          uy = Math.sin(angle);
        }

        const overlap = minimum - d + 1;
        if (a.state === "staying" && b.state === "staying") {
          tryNudgeStandingPedestrian(a, -ux * overlap * .5, -uy * overlap * .5);
          tryNudgeStandingPedestrian(b, ux * overlap * .5, uy * overlap * .5);
        } else if (a.state === "staying") {
          tryNudgeStandingPedestrian(a, -ux * overlap, -uy * overlap);
        } else if (b.state === "staying") {
          tryNudgeStandingPedestrian(b, ux * overlap, uy * overlap);
        } else {
          const yielding = (a.seed || i) >= (b.seed || j) ? a : b;
          requestPedestrianAvoidance(yielding, 18, .7);
          yielding.collisionWait = Math.max(yielding.collisionWait || 0, .10);
        }
      }
    }
  }

  function fastForwardCitizens(gameMinutes) {
    const total = Math.max(0, Number(gameMinutes) || 0);
    if (total <= .001 || !pedestrians.length) return;

    for (const ped of pedestrians) {
      let remaining = total;
      let loops = 0;

      while (remaining > .001 && loops < 18) {
        loops += 1;

        if (ped.state === "walking" || ped.state === "waiting") {
          const travelDistance = citizenRemainingRouteDistance(ped);
          const travelMinutes = Math.max(.05, travelDistance / Math.max(1, ped.speed) * .7);
          const step = Math.min(remaining, travelMinutes);
          citizenUpdateNeeds(ped, step, true);
          moveCitizenAlongRoute(ped, ped.speed * (step / .7));
          remaining -= step;
          continue;
        }

        if (ped.state === "inside" || ped.state === "staying") {
          const duration = Math.max(.05, ped.activityMinutesRemaining || .05);
          const step = Math.min(remaining, duration);
          citizenUpdateNeeds(ped, step, false);
          ped.activityMinutesRemaining = Math.max(0, duration - step);
          remaining -= step;

          if (ped.activityMinutesRemaining <= .001) completeCitizenActivity(ped);
          continue;
        }

        planCitizenAction(ped, ped.currentNodeId || ped.homeNodeId);
      }

      if (remaining > .001) {
        citizenUpdateNeeds(ped, remaining, ped.state === "walking" || ped.state === "waiting");
      }

      if (ped.state === "walking" || ped.state === "waiting") {
        const pose = pedestrianPoseAt(ped);
        ped.x = pose.x;
        ped.y = pose.y;
        ped.dir = pose.angle;
      }
    }
  }


  function update(dt) {
    if (state.paused || !actionSheet.hidden || !helpPanel.hidden) return;

    const gameMinutes = dt * .7;
    updateTrainSystem(dt);

    if (!state.player.inVehicle) state.drive.signalClock += dt;
    if (state.player.inHome) updatePlayerAtHome(dt);
    else if (state.player.inVehicle) updateCar(dt);
    else if (!state.player.inTrain) updatePlayerOnFoot(dt);

    updatePetWalk(dt, gameMinutes);

    updateTraffic(dt);
    advanceTime(gameMinutes, true, false);
    updatePedestrians(dt, gameMinutes);
    syncNamedNpcCitizens();

    state.visual.rainPhase += dt;
    state.visual.weatherClock += dt;

    autosaveTimer += dt;
    if (autosaveTimer >= 5) {
      autosaveTimer = 0;
      }

    const p = actorPosition();
    let desiredLeadX = 0;
    let desiredLeadY = 0;
    if (state.player.inVehicle) {
      const lead = clamp(34 + personalCar.speed * .34, 34, 155);
      desiredLeadX = Math.cos(personalCar.angle) * lead;
      desiredLeadY = Math.sin(personalCar.angle) * lead;
    } else if (state.player.inTrain) {
      const train = trainById(state.player.trainId);
      if (train) desiredLeadX = train.direction * 115;
      desiredLeadY = 0;
    } else {
      desiredLeadX = state.player.facingX * 26;
      desiredLeadY = state.player.facingY * 26;
    }

    const leadBlend = 1 - Math.pow(.9, dt * 60);
    state.visual.cameraLeadX += (desiredLeadX - state.visual.cameraLeadX) * leadBlend;
    state.visual.cameraLeadY += (desiredLeadY - state.visual.cameraLeadY) * leadBlend;

    const targetX = clamp(p.x + state.visual.cameraLeadX - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
    const targetY = clamp(p.y + state.visual.cameraLeadY - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
    const blend = 1 - Math.pow(0.9, dt * 60);
    state.camera.x += (targetX - state.camera.x) * blend;
    state.camera.y += (targetY - state.camera.y) * blend;

    clampNeeds();
  }

  function beginWorldProjection() {
    ctx.save();
    const cx = viewWidth / 2;
    const cy = viewHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(WORLD_TILT_X, WORLD_TILT_Y);
    ctx.translate(-cx, -cy);
  }

  function endWorldProjection() {
    ctx.restore();
  }

  function worldToScreen(x, y) {
    return { x: x - state.camera.x, y: y - state.camera.y };
  }

  function visibleRect(rect, padding = 0) {
    return !(
      rect.x + rect.w < state.camera.x - padding ||
      rect.y + rect.h < state.camera.y - padding ||
      rect.x > state.camera.x + viewWidth + padding ||
      rect.y > state.camera.y + viewHeight + padding
    );
  }

  function visualTime() {
    const t = state.minute / 1440;
    const sun = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));
    const angle = (t - 0.25) * Math.PI * 2;
    return {
      daylight: sun,
      shadowX: Math.cos(angle) * (18 + (1 - sun) * 24),
      shadowY: Math.sin(angle) * (18 + (1 - sun) * 24),
      night: clamp(1 - sun * 1.18, 0, 1)
    };
  }

  function roundedRectPath(context, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  function drawWorldDashedVertical(worldX, dashLength, gapLength, color, lineWidth) {
    const period = dashLength + gapLength;
    const minWorldY = state.camera.y - period;
    const maxWorldY = state.camera.y + viewHeight + period;
    let worldY = Math.floor(minWorldY / period) * period;
    const screenX = worldX - state.camera.x;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (; worldY <= maxWorldY; worldY += period) {
      const sy = worldY - state.camera.y;
      ctx.moveTo(screenX, sy);
      ctx.lineTo(screenX, sy + dashLength);
    }
    ctx.stroke();
  }

  function drawWorldDashedHorizontal(worldY, dashLength, gapLength, color, lineWidth) {
    const period = dashLength + gapLength;
    const minWorldX = state.camera.x - period;
    const maxWorldX = state.camera.x + viewWidth + period;
    let worldX = Math.floor(minWorldX / period) * period;
    const screenY = worldY - state.camera.y;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (; worldX <= maxWorldX; worldX += period) {
      const sx = worldX - state.camera.x;
      ctx.moveTo(sx, screenY);
      ctx.lineTo(sx + dashLength, screenY);
    }
    ctx.stroke();
  }

  function drawRoadCenterSegmentVertical(worldX, worldY1, worldY2, style) {
    if (style === "residential") return;
    const sx = worldX - state.camera.x;
    const sy1 = worldY1 - state.camera.y;
    const sy2 = worldY2 - state.camera.y;
    const solid = style === "arterial";
    ctx.strokeStyle = solid
      ? "rgba(226,164,46,.9)"
      : style === "station"
        ? "rgba(235,190,79,.82)"
        : "rgba(238,240,236,.66)";
    ctx.lineWidth = solid ? 3.2 : style === "station" ? 2.6 : 2;
    if (solid) {
      ctx.beginPath();
      ctx.moveTo(sx, sy1);
      ctx.lineTo(sx, sy2);
      ctx.stroke();
      return;
    }
    const dash = style === "commercial" ? 16 : 22;
    const gap = style === "commercial" ? 24 : 18;
    const period = dash + gap;
    let wy = Math.floor(worldY1 / period) * period;
    ctx.beginPath();
    for (; wy <= worldY2; wy += period) {
      const fromY = Math.max(wy, worldY1) - state.camera.y;
      const toY = Math.min(wy + dash, worldY2) - state.camera.y;
      if (toY <= fromY) continue;
      ctx.moveTo(sx, fromY);
      ctx.lineTo(sx, toY);
    }
    ctx.stroke();
  }

  function drawRoadCenterSegmentHorizontal(worldY, worldX1, worldX2, style) {
    if (style === "residential") return;
    const sy = worldY - state.camera.y;
    const sx1 = worldX1 - state.camera.x;
    const sx2 = worldX2 - state.camera.x;
    const solid = style === "arterial";
    ctx.strokeStyle = solid
      ? "rgba(226,164,46,.9)"
      : style === "station"
        ? "rgba(235,190,79,.82)"
        : "rgba(238,240,236,.66)";
    ctx.lineWidth = solid ? 3.2 : style === "station" ? 2.6 : 2;
    if (solid) {
      ctx.beginPath();
      ctx.moveTo(sx1, sy);
      ctx.lineTo(sx2, sy);
      ctx.stroke();
      return;
    }
    const dash = style === "commercial" ? 16 : 22;
    const gap = style === "commercial" ? 24 : 18;
    const period = dash + gap;
    let wx = Math.floor(worldX1 / period) * period;
    ctx.beginPath();
    for (; wx <= worldX2; wx += period) {
      const fromX = Math.max(wx, worldX1) - state.camera.x;
      const toX = Math.min(wx + dash, worldX2) - state.camera.x;
      if (toX <= fromX) continue;
      ctx.moveTo(fromX, sy);
      ctx.lineTo(toX, sy);
    }
    ctx.stroke();
  }

  function drawRoadArrow(screenX, screenY, angle) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(244,245,240,.76)";
    ctx.beginPath();
    ctx.moveTo(23, 0);
    ctx.lineTo(7, -8);
    ctx.lineTo(7, -3);
    ctx.lineTo(-18, -3);
    ctx.lineTo(-18, 3);
    ctx.lineTo(7, 3);
    ctx.lineTo(7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTactilePad(x, y, vertical = false) {
    ctx.fillStyle = "#d8b736";
    ctx.fillRect(x - (vertical ? 6 : 11), y - (vertical ? 11 : 6), vertical ? 12 : 22, vertical ? 22 : 12);
    ctx.fillStyle = "rgba(103,83,22,.28)";
    for (let ix = -1; ix <= 1; ix += 1) {
      for (let iy = -1; iy <= 1; iy += 1) {
        ctx.beginPath();
        ctx.arc(x + ix * 6, y + iy * 4, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGuardPipe(x1, y1, x2, y2) {
    ctx.strokeStyle = "#eceee9";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    for (let t = .15; t < 1; t += .34) {
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (vertical ? 7 : 0), y + (vertical ? 0 : 7));
      ctx.stroke();
    }
  }

  function intersectionHalfWidth(gx, gy) {
    let half = 54;
    const candidates = [
      [gx, gy - 1, gx, gy, "v", gx, gy - 1],
      [gx, gy, gx, gy + 1, "v", gx, gy],
      [gx - 1, gy, gx, gy, "h", gy, gx - 1],
      [gx, gy, gx + 1, gy, "h", gy, gx]
    ];
    for (const [ax, ay, bx, by, axis, roadIndex, segmentIndex] of candidates) {
      if (!roadEdgeExists(ax, ay, bx, by)) continue;
      half = Math.max(
        half,
        roadWidthForStyle(roadSegmentStyle(axis, roadIndex, segmentIndex)) / 2
      );
    }
    return half;
  }

  function stopLineOffsetAt(gx, gy) {
    return intersectionHalfWidth(gx, gy) + 22 + CROSSWALK_DEPTH / 2 + STOP_LINE_GAP;
  }

  function drawJapaneseIntersectionMarkings(sx, sy, wx, wy) {
    const gx = Math.round(wx / ROAD_GAP);
    const gy = Math.round(wy / ROAD_GAP);
    const north = roadEdgeExists(gx, gy - 1, gx, gy);
    const south = roadEdgeExists(gx, gy, gx, gy + 1);
    const west = roadEdgeExists(gx - 1, gy, gx, gy);
    const east = roadEdgeExists(gx, gy, gx + 1, gy);

    const halfRoad = intersectionHalfWidth(gx, gy);
    const crossingOffset = halfRoad + 22;
    const stopOffset = stopLineOffsetAt(gx, gy);
    const crossingSpan = halfRoad * 2 - 44;
    const stripe = 5;
    const stripeGap = 6;
    const halfSpan = crossingSpan / 2;

    ctx.fillStyle = "rgba(244,245,240,.88)";

    for (let d = -halfSpan; d <= halfSpan; d += stripe + stripeGap) {
      if (north) ctx.fillRect(sx + d, sy - crossingOffset - CROSSWALK_DEPTH / 2, stripe, CROSSWALK_DEPTH);
      if (south) ctx.fillRect(sx + d, sy + crossingOffset - CROSSWALK_DEPTH / 2, stripe, CROSSWALK_DEPTH);
    }

    for (let d = -halfSpan; d <= halfSpan; d += stripe + stripeGap) {
      if (west) ctx.fillRect(sx - crossingOffset - CROSSWALK_DEPTH / 2, sy + d, CROSSWALK_DEPTH, stripe);
      if (east) ctx.fillRect(sx + crossingOffset - CROSSWALK_DEPTH / 2, sy + d, CROSSWALK_DEPTH, stripe);
    }

    const inner = STOP_LINE_CENTER_MARGIN;
    const outer = halfRoad - STOP_LINE_EDGE_MARGIN;
    const lineLength = Math.max(24, outer - inner);
    const lineWidth = 4;
    ctx.fillStyle = "rgba(248,248,244,.96)";

    if (north) ctx.fillRect(sx + inner, sy - stopOffset - lineWidth / 2, lineLength, lineWidth);
    if (south) ctx.fillRect(sx - outer, sy + stopOffset - lineWidth / 2, lineLength, lineWidth);
    if (west) ctx.fillRect(sx - stopOffset - lineWidth / 2, sy - outer, lineWidth, lineLength);
    if (east) ctx.fillRect(sx + stopOffset - lineWidth / 2, sy + inner, lineWidth, lineLength);

    const arrowDistance = stopOffset + 62;
    const lane = Math.min(LANE_OFFSET, halfRoad * .42);
    if (north) drawRoadArrow(sx + lane, sy - arrowDistance, Math.PI / 2);
    if (south) drawRoadArrow(sx - lane, sy + arrowDistance, -Math.PI / 2);
    if (west) drawRoadArrow(sx - arrowDistance, sy - lane, 0);
    if (east) drawRoadArrow(sx + arrowDistance, sy + lane, Math.PI);

    const curb = halfRoad + 14;
    if (north) {
      drawTactilePad(sx - curb, sy - crossingOffset, false);
      drawTactilePad(sx + curb, sy - crossingOffset, false);
    }
    if (south) {
      drawTactilePad(sx - curb, sy + crossingOffset, false);
      drawTactilePad(sx + curb, sy + crossingOffset, false);
    }
    if (west) {
      drawTactilePad(sx - crossingOffset, sy - curb, true);
      drawTactilePad(sx - crossingOffset, sy + curb, true);
    }
    if (east) {
      drawTactilePad(sx + crossingOffset, sy - curb, true);
      drawTactilePad(sx + crossingOffset, sy + curb, true);
    }

    const limit = speedLimitAt(wx, wy);
    if (limit >= 50 && hash2(gx, gy, 1251) > .54) {
      ctx.save();
      ctx.fillStyle = "rgba(242,243,239,.5)";
      ctx.font = "700 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      if (south) ctx.fillText(String(limit), sx - lane, sy + arrowDistance + 54);
      else if (east) ctx.fillText(String(limit), sx + arrowDistance + 54, sy + lane);
      ctx.restore();
    }
  }


  function drawParkingCarTop(x, y, horizontal, seed) {
    const length = 31;
    const width = 14;
    ctx.save();
    ctx.translate(x, y);
    if (!horizontal) ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "rgba(13,17,17,.18)";
    roundedRectPath(ctx, -length / 2 + 2, -width / 2 + 2, length, width, 4);
    ctx.fill();
    const colors = ["#d5d7d4","#6d8495","#a06f62","#7b7e75","#8b7a91"];
    ctx.fillStyle = colors[Math.floor(seed * colors.length) % colors.length];
    roundedRectPath(ctx, -length / 2, -width / 2, length, width, 4);
    ctx.fill();
    ctx.fillStyle = "#81979e";
    ctx.fillRect(-4, -width / 2 + 2, 11, width - 4);
    ctx.restore();
  }

  function drawRoadSegmentTexture(axis, roadIndex, segmentIndex, start, end) {
    const style = roadSegmentStyle(axis, roadIndex, segmentIndex);
    const roadCenter = roadIndex * ROAD_GAP;
    const horizontal = axis === "h";
    const length = end - start;
    if (length <= 0) return;

    const sx = horizontal ? start - state.camera.x : roadCenter - state.camera.x;
    const sy = horizontal ? roadCenter - state.camera.y : start - state.camera.y;
    const sw = horizontal ? length : ROAD_WIDTH;
    const sh = horizontal ? ROAD_WIDTH : length;

    if (style === "arterial") {
      ctx.fillStyle = "rgba(18,22,23,.16)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = "rgba(236,185,69,.22)";
      if (horizontal) {
        ctx.fillRect(sx, sy + ROAD_HALF - 18, sw, 4);
        ctx.fillRect(sx, sy + ROAD_HALF - 12, sw, 2);
      } else {
        ctx.fillRect(sx + ROAD_HALF - 18, sy, 4, sh);
        ctx.fillRect(sx + ROAD_HALF - 12, sy, 2, sh);
      }
      return;
    }

    if (style === "station") {
      ctx.fillStyle = "rgba(72,84,88,.22)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = "rgba(72,111,133,.36)";
      if (horizontal) ctx.fillRect(sx, sy + ROAD_HALF - 28, sw, 18);
      else ctx.fillRect(sx + ROAD_HALF - 28, sy, 18, sh);

      ctx.fillStyle = "rgba(245,246,242,.72)";
      ctx.font = "700 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      if (horizontal && length > 160) {
        ctx.fillText("BUS", sx + length * .5, sy + ROAD_HALF - 15);
      } else if (!horizontal && length > 160) {
        ctx.save();
        ctx.translate(sx + ROAD_HALF - 15, sy + length * .5);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("BUS", 0, 0);
        ctx.restore();
      }
      return;
    }

    if (style === "commercial") {
      ctx.fillStyle = "rgba(46,49,48,.11)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(239,241,236,.28)";
      ctx.lineWidth = 1.5;
      const bayStart = start + 34;
      const bayEnd = end - 34;
      const baySpacing = 74;
      for (let p = bayStart; p < bayEnd - 34; p += baySpacing) {
        const seed = hash2(roadIndex, Math.floor(p / 20), 1510);
        if (seed < .38) continue;
        if (horizontal) {
          const x = p - state.camera.x;
          const y = roadCenter + ROAD_HALF - 23 - state.camera.y;
          ctx.strokeRect(x, y - 12, 48, 24);
          if (seed > .72) drawParkingCarTop(x + 24, y, true, seed);
        } else {
          const x = roadCenter + ROAD_HALF - 23 - state.camera.x;
          const y = p - state.camera.y;
          ctx.strokeRect(x - 12, y, 24, 48);
          if (seed > .72) drawParkingCarTop(x, y + 24, false, seed);
        }
      }
      return;
    }

    if (style === "residential") {
      // Visually narrow the carriageway and add Japanese-style side gutters.
      const inset = 15;
      ctx.fillStyle = "rgba(124,126,120,.28)";
      if (horizontal) {
        ctx.fillRect(sx, sy, sw, inset);
        ctx.fillRect(sx, sy + ROAD_WIDTH - inset, sw, inset);
        ctx.fillStyle = "rgba(51,57,55,.48)";
        ctx.fillRect(sx, sy + inset - 3, sw, 3);
        ctx.fillRect(sx, sy + ROAD_WIDTH - inset, sw, 3);
      } else {
        ctx.fillRect(sx, sy, inset, sh);
        ctx.fillRect(sx + ROAD_WIDTH - inset, sy, inset, sh);
        ctx.fillStyle = "rgba(51,57,55,.48)";
        ctx.fillRect(sx + inset - 3, sy, 3, sh);
        ctx.fillRect(sx + ROAD_WIDTH - inset, sy, 3, sh);
      }
      return;
    }

    if (style === "park") {
      ctx.fillStyle = "rgba(59,73,64,.08)";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = "rgba(74,130,91,.38)";
      if (horizontal) ctx.fillRect(sx, sy - ROAD_HALF + 12, sw, 10);
      else ctx.fillRect(sx - ROAD_HALF + 12, sy, 10, sh);
      return;
    }

    // Local streets get a softer, patched asphalt surface.
    ctx.fillStyle = "rgba(255,255,255,.018)";
    ctx.fillRect(sx, sy, sw, sh);
    const patches = 3;
    for (let n = 0; n < patches; n += 1) {
      const seed = hash2(roadIndex + n, segmentIndex, 1520);
      if (horizontal) {
        const px = sx + 28 + seed * Math.max(20, length - 70);
        const py = sy + 26 + hash2(n, segmentIndex, 1521) * (ROAD_WIDTH - 52);
        ctx.fillStyle = "rgba(18,22,22,.07)";
        ctx.beginPath();
        ctx.ellipse(px, py, 15 + seed * 12, 4 + seed * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const px = sx + 26 + hash2(n, segmentIndex, 1521) * (ROAD_WIDTH - 52);
        const py = sy + 28 + seed * Math.max(20, length - 70);
        ctx.fillStyle = "rgba(18,22,22,.07)";
        ctx.beginPath();
        ctx.ellipse(px, py, 4 + seed * 4, 15 + seed * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function offsetRoadPoints(points, offset) {
    return points.map((point, i) => {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      let tx = next.x - previous.x;
      let ty = next.y - previous.y;
      const mag = Math.hypot(tx, ty) || 1;
      tx /= mag;
      ty /= mag;
      return {
        x:point.x + ty * offset,
        y:point.y - tx * offset
      };
    });
  }

  function strokeWorldRoadPath(points, width, color, dash = null) {
    if (!points.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(points[0].x - state.camera.x, points[0].y - state.camera.y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x - state.camera.x, points[i].y - state.camera.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRoadEdge(axis, roadIndex, segmentIndex) {
    const margin = 180;
    if (axis === "h") {
      const minX = segmentIndex * ROAD_GAP - state.camera.x;
      const maxX = (segmentIndex + 1) * ROAD_GAP - state.camera.x;
      const y = roadIndex * ROAD_GAP - state.camera.y;
      if (maxX < -margin || minX > viewWidth + margin || y < -margin || y > viewHeight + margin) return;
    } else {
      const x = roadIndex * ROAD_GAP - state.camera.x;
      const minY = segmentIndex * ROAD_GAP - state.camera.y;
      const maxY = (segmentIndex + 1) * ROAD_GAP - state.camera.y;
      if (x < -margin || x > viewWidth + margin || maxY < -margin || minY > viewHeight + margin) return;
    }

    const style = roadSegmentStyle(axis, roadIndex, segmentIndex);
    const width = roadWidthForStyle(style);
    const points = sampleRoadEdge(axis, roadIndex, segmentIndex, 14);

    // Sidewalk / shoulder follows the exact curved street.
    const sidewalkExtra =
      style === "arterial" ? 34 :
      style === "station" ? 32 :
      style === "commercial" ? 28 :
      style === "residential" ? 12 :
      22;
    strokeWorldRoadPath(points, width + sidewalkExtra, "#a7a9a3");

    const asphalt =
      style === "arterial" ? "#303638" :
      style === "station" ? "#343a3d" :
      style === "commercial" ? "#373c3d" :
      style === "residential" ? "#444947" :
      style === "park" ? "#3a403f" :
      "#3b4142";
    strokeWorldRoadPath(points, width, asphalt);

    // Edge lines are omitted on the narrowest residential streets.
    if (style !== "residential") {
      const edgeOffset = width / 2 - (style === "arterial" ? 14 : 10);
      strokeWorldRoadPath(offsetRoadPoints(points, edgeOffset), 1.8, "rgba(239,241,237,.62)");
      strokeWorldRoadPath(offsetRoadPoints(points, -edgeOffset), 1.8, "rgba(239,241,237,.62)");
    }

    if (style === "arterial") {
      // Two lanes in each direction.
      strokeWorldRoadPath(points, 3.2, "rgba(226,164,46,.9)");
      const divider = width * .25;
      strokeWorldRoadPath(offsetRoadPoints(points, divider), 1.8, "rgba(239,241,237,.65)", [16, 14]);
      strokeWorldRoadPath(offsetRoadPoints(points, -divider), 1.8, "rgba(239,241,237,.65)", [16, 14]);
    } else if (style === "station") {
      strokeWorldRoadPath(points, 2.2, "rgba(239,241,237,.72)", [18, 17]);
      const busOffset = width / 2 - 25;
      strokeWorldRoadPath(offsetRoadPoints(points, busOffset), 12, "rgba(67,110,137,.34)");
    } else if (style === "commercial") {
      strokeWorldRoadPath(points, 2, "rgba(239,241,237,.68)", [14, 22]);
    } else if (style === "park") {
      strokeWorldRoadPath(points, 2, "rgba(239,241,237,.6)", [20, 18]);
      const bikeOffset = width / 2 - 17;
      strokeWorldRoadPath(offsetRoadPoints(points, -bikeOffset), 8, "rgba(72,133,88,.42)");
    } else if (style === "local") {
      strokeWorldRoadPath(points, 1.8, "rgba(239,241,237,.56)", [20, 22]);
    }

    // Sparse asphalt repair seams make local streets less uniform.
    if (style === "local" || style === "residential" || style === "commercial") {
      const seed = hash2(roadIndex, segmentIndex, axis === "h" ? 1910 : 1911);
      if (seed > .43) {
        const t = .22 + seed * .56;
        const p = roadEdgePoint(axis, roadIndex, segmentIndex, Math.min(.82, t));
        const screen = worldToScreen(p.x, p.y);
        ctx.save();
        ctx.translate(screen.x, screen.y);
        const tangentA = roadEdgePoint(axis, roadIndex, segmentIndex, Math.max(0, t - .02));
        const tangentB = roadEdgePoint(axis, roadIndex, segmentIndex, Math.min(1, t + .02));
        ctx.rotate(Math.atan2(tangentB.y - tangentA.y, tangentB.x - tangentA.x));
        ctx.fillStyle = "rgba(15,19,19,.1)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 + seed * 13, 5 + seed * 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawMapModelIntersectionMarkings() {
    ctx.save();
    ctx.lineCap = "butt";
    for (const node of mapModel.nodes) {
      if (!isSignalizedMapNode(node.id)) continue;
      const incidentEdges = vehicleEdgesAtNode(node.id);
      for (const edge of incidentEdges) {
        const adjacent = edge.from === node.id ? edge.points[1] : edge.points.at(-2);
        if (!adjacent) continue;
        let dx = adjacent.x - node.x;
        let dy = adjacent.y - node.y;
        const magnitude = Math.hypot(dx, dy) || 1;
        dx /= magnitude;
        dy /= magnitude;
        const nx = -dy;
        const ny = dx;
        const geometry = signalGeometryAtNode(node.id, edge);
        const crossingSpan = Math.max(34, edge.width - 34);
        const stripeStep = 12;
        ctx.strokeStyle = "rgba(244,245,240,.88)";
        ctx.lineWidth = 5;
        for (let offset = -crossingSpan / 2; offset <= crossingSpan / 2; offset += stripeStep) {
          const cx = node.x + dx * geometry.crossingOffset + nx * offset;
          const cy = node.y + dy * geometry.crossingOffset + ny * offset;
          const halfDepth = geometry.crossingDepth / 2;
          const a = worldToScreen(cx - dx * halfDepth, cy - dy * halfDepth);
          const b = worldToScreen(cx + dx * halfDepth, cy + dy * halfDepth);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        const stopCenterX = node.x + dx * geometry.stopOffset;
        const stopCenterY = node.y + dy * geometry.stopOffset;
        const laneStart = 5;
        const laneEnd = Math.max(laneStart + 18, edge.width / 2 - 8);
        const stopA = worldToScreen(stopCenterX + nx * laneStart, stopCenterY + ny * laneStart);
        const stopB = worldToScreen(stopCenterX + nx * laneEnd, stopCenterY + ny * laneEnd);
        ctx.strokeStyle = "rgba(248,248,244,.94)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(stopA.x, stopA.y);
        ctx.lineTo(stopB.x, stopB.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawMapModelRoads() {
    const visibleEdges = mapModel.edges.filter((edge) => {
      const points = edge.points.map((point) => worldToScreen(point.x, point.y));
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      return !(maxX < -260 || minX > viewWidth + 260 || maxY < -260 || minY > viewHeight + 260);
    });

    const screenPoints = (edge) => edge.points.map((point) => worldToScreen(point.x, point.y));

    const offsetPoints = (points, offset) => points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      let tx = next.x - previous.x;
      let ty = next.y - previous.y;
      const mag = Math.hypot(tx, ty) || 1;
      tx /= mag;
      ty /= mag;
      return { x:point.x + ty * offset, y:point.y - tx * offset };
    });

    const strokePoints = (points, width, color, dash = [], lineCap = "round") => {
      if (!points.length) return;
      ctx.lineCap = lineCap;
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const strokeEdge = (edge, width, color, dash = [], lineCap = null) => {
      strokePoints(screenPoints(edge), width, color, dash, lineCap || (edge.vehicle ? "butt" : "round"));
    };

    const drawRoadSurfaceDetail = (edge) => {
      if (!edge.vehicle) return;
      const length = polylineLength(edge.points);
      const count = clamp(Math.floor(length / 95), 3, 13);
      const half = edge.width / 2;

      for (let i = 0; i < count; i += 1) {
        const seed = hash2(edge.id.length + i * 17, Math.floor(edge.width) + i * 7, 2137);
        const along = length * ((i + .35 + seed * .3) / count);
        const pose = pointAndTangentOnPolyline(edge.points, along);
        const lateralSeed = hash2(i, edge.id.length, 2138) - .5;
        const lateral = lateralSeed * Math.max(16, edge.width * .68);
        const wx = pose.point.x - pose.tangent.y * lateral;
        const wy = pose.point.y + pose.tangent.x * lateral;
        const p = worldToScreen(wx, wy);
        const angle = Math.atan2(pose.tangent.y, pose.tangent.x);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);

        ctx.fillStyle = seed > .52 ? "rgba(21,27,26,.055)" : "rgba(220,225,216,.035)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 8 + seed * 20, 1.1 + seed * 2.1, 0, 0, Math.PI * 2);
        ctx.fill();

        if (seed > .74) {
          ctx.strokeStyle = "rgba(22,27,27,.10)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-13, 0);
          ctx.lineTo(13 + seed * 8, seed > .87 ? 2 : -1);
          ctx.stroke();
        }

        if (state.visual.weather === "rain" && seed > .44) {
          ctx.fillStyle = "rgba(199,217,220,.055)";
          ctx.beginPath();
          ctx.ellipse(4, -half * .12, 15 + seed * 23, 1.2 + seed * 1.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    };

    const drawJunctionPads = (layer = "surface") => {
      for (const node of mapModel.nodes) {
        const incidentEdges = mapModel.edges.filter((edge) => edge.vehicle && (edge.from === node.id || edge.to === node.id));
        if (incidentEdges.length < 2) continue;
        const point = worldToScreen(node.x, node.y);
        if (point.x < -260 || point.y < -260 || point.x > viewWidth + 260 || point.y > viewHeight + 260) continue;

        // Do not inflate a T-junction to half the widest road. The map model
        // generates only the small center pad needed to join the road strokes;
        // approach-specific overlap is handled by junctionGeometry.
        const generated = mapModel.junctionGeometry?.(node.id);
        const fallbackHalf = Math.min(...incidentEdges.map((edge) => edge.width)) / 2 + 6;
        const baseRadius = generated?.padRadius ?? fallbackHalf;
        const radius = baseRadius + (layer === "shadow" ? 10 : layer === "curb" ? 5 : 0);

        ctx.fillStyle = layer === "shadow"
          ? "rgba(27,34,33,.34)"
          : layer === "curb"
            ? "#999c96"
            : "#626863";
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const pedestrianSurface = (edge) =>
      edge.type === "greenway" ? "#779d70" :
      edge.type === "shopping-walk" ? "#b5aa90" :
      edge.type === "plaza" ? "#b9b5a8" :
      "#aaa9a1";
    // Keep the asphalt itself visually continuous. Road hierarchy is expressed
    // by width, lane markings and roadside context instead of changing the
    // pavement color at every edge/junction boundary.
    const vehicleSurface = () => "#626863";

    for (const edge of visibleEdges) {
      const corridor = edge.vehicle ? mapModel.pedestrianCorridor?.(edge.id) : null;
      const sidewalkWidth = corridor?.width || 0;
      const shadow = edge.vehicle
        ? "rgba(27,34,33,.30)"
        : edge.type === "greenway"
          ? "rgba(58,93,62,.28)"
          : "rgba(70,71,66,.24)";
      strokeEdge(
        edge,
        edge.vehicle ? edge.width + sidewalkWidth * 2 + 10 : edge.width + 10,
        shadow
      );
    }
    drawJunctionPads("shadow");

    // Vehicle streets have a real pedestrian shoulder outside the curb rather
    // than placing walkers on a 5px strip at the asphalt edge.
    for (const edge of visibleEdges) {
      if (!edge.vehicle || !edge.pedestrian) continue;
      const corridor = mapModel.pedestrianCorridor?.(edge.id);
      const sidewalkWidth = corridor?.width || 38;
      strokeEdge(edge, edge.width + sidewalkWidth * 2, "#aaa9a1");
    }

    for (const edge of visibleEdges) {
      if (edge.vehicle) strokeEdge(edge, edge.width + 13, "#9a9d97");
    }
    drawJunctionPads("curb");

    for (const edge of visibleEdges) {
      strokeEdge(edge, edge.width, edge.vehicle ? vehicleSurface(edge) : pedestrianSurface(edge));
    }
    drawJunctionPads("surface");

    // A fine inner curb highlight and asphalt variation give the roadway depth
    // without reintroducing different pavement colors between connected edges.
    for (const edge of visibleEdges) {
      if (!edge.vehicle) continue;
      const points = screenPoints(edge);
      const inner = Math.max(18, edge.width / 2 - 4);
      strokePoints(offsetPoints(points, inner), 1.2, "rgba(236,239,231,.10)", [], "butt");
      strokePoints(offsetPoints(points, -inner), 1.2, "rgba(28,34,33,.14)", [], "butt");
      drawRoadSurfaceDetail(edge);
    }

    for (const edge of visibleEdges) {
      if (!edge.vehicle) continue;
      const points = screenPoints(edge);
      const half = edge.width / 2;

      if (edge.type !== "alley" && edge.width >= 92) {
        const edgeLineOffset = Math.max(half - 8, 22);
        strokePoints(offsetPoints(points, edgeLineOffset), 1.7, "rgba(242,244,238,.66)", [], "butt");
        strokePoints(offsetPoints(points, -edgeLineOffset), 1.7, "rgba(242,244,238,.66)", [], "butt");
      }

      if (edge.type === "arterial") {
        strokePoints(offsetPoints(points, 3), 1.8, "rgba(229,197,95,.9)", [], "butt");
        strokePoints(offsetPoints(points, -3), 1.8, "rgba(229,197,95,.9)", [], "butt");
        const laneOffset = edge.width * .255;
        strokePoints(offsetPoints(points, laneOffset), 1.7, "rgba(238,240,235,.68)", [18,16], "butt");
        strokePoints(offsetPoints(points, -laneOffset), 1.7, "rgba(238,240,235,.68)", [18,16], "butt");
      } else if (edge.type === "collector" && edge.width >= 112) {
        strokePoints(points, 2.1, "rgba(235,232,209,.62)", [16,20], "butt");
      } else if (edge.type === "shopping" && edge.width >= 100) {
        strokePoints(points, 1.5, "rgba(240,240,233,.42)", [10,24], "butt");
      }

      const seed = hash2(edge.id.length, Math.floor(edge.width), 2030);
      if (points.length >= 2 && seed > .34) {
        const index = Math.min(points.length - 1, Math.max(0, Math.floor(seed * points.length)));
        const p = points[index];
        const prev = points[Math.max(0, index - 1)];
        const next = points[Math.min(points.length - 1, index + 1)];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(next.y - prev.y, next.x - prev.x));
        ctx.fillStyle = "rgba(28,31,30,.13)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 18 + seed * 16, 5 + seed * 3, 0, 0, Math.PI * 2);
        ctx.fill();

        if (edge.width >= 100 && seed > .58) {
          ctx.strokeStyle = "rgba(28,31,30,.34)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(9, -edge.width * .18, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(9, -edge.width * .18, 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (state.visual.weather === "rain" && edge.width >= 100) {
        strokePoints(offsetPoints(points, edge.width * .18), 7, "rgba(171,195,202,.07)", [], "butt");
      }
    }

    drawMapModelIntersectionMarkings();
  }


  function drawMapModelJunctions() {
    const convexHull = (points) => {
      const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
      const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lower = [];
      for (const point of sorted) {
        while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
        lower.push(point);
      }
      const upper = [];
      for (const point of sorted.reverse()) {
        while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
        upper.push(point);
      }
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    };

    for (const node of mapModel.nodes) {
      const incidentEdges = mapModel.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
      if (incidentEdges.length <= 1) continue;
      const p = worldToScreen(node.x, node.y);
      if (p.x < -260 || p.y < -260 || p.x > viewWidth + 260 || p.y > viewHeight + 260) continue;
      const vehicleEdges = incidentEdges.filter((edge) => edge.vehicle);
      const usableEdges = vehicleEdges.length ? vehicleEdges : incidentEdges;
      const junctionPoints = [];
      for (const edge of usableEdges) {
        const raw = edge.from === node.id ? edge.points[1] : edge.points.at(-2);
        const dx = raw.x - node.x;
        const dy = raw.y - node.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;
        const halfWidth = edge.width / 2 + 5;
        junctionPoints.push(
          worldToScreen(node.x + nx * halfWidth, node.y + ny * halfWidth),
          worldToScreen(node.x - nx * halfWidth, node.y - ny * halfWidth),
          worldToScreen(node.x + dx / length * halfWidth * 1.45, node.y + dy / length * halfWidth * 1.45)
        );
      }
      const hull = convexHull(junctionPoints);
      if (hull.length < 3) continue;
      const drawHull = () => {
        const cornerRadius = 10;
        const rounded = hull.map((point, index) => {
          const previous = hull[(index + hull.length - 1) % hull.length];
          const next = hull[(index + 1) % hull.length];
          const toPrevious = Math.hypot(previous.x - point.x, previous.y - point.y) || 1;
          const toNext = Math.hypot(next.x - point.x, next.y - point.y) || 1;
          const distance = Math.min(cornerRadius, toPrevious * .35, toNext * .35);
          return {
            point,
            before: { x: point.x + (previous.x - point.x) * distance / toPrevious, y: point.y + (previous.y - point.y) * distance / toPrevious },
            after: { x: point.x + (next.x - point.x) * distance / toNext, y: point.y + (next.y - point.y) * distance / toNext }
          };
        });
        ctx.beginPath();
        ctx.moveTo(rounded[0].after.x, rounded[0].after.y);
        for (let i = 1; i <= rounded.length; i += 1) {
          const current = rounded[i % rounded.length];
          const previous = rounded[(i - 1) % rounded.length];
          ctx.lineTo(current.before.x, current.before.y);
          ctx.quadraticCurveTo(current.point.x, current.point.y, current.after.x, current.after.y);
        }
        ctx.closePath();
      };
      ctx.fillStyle = "rgba(36,45,43,.42)";
      ctx.save();
      ctx.translate(0, 11);
      drawHull();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = vehicleEdges.length ? "#626863" : "#7ca77c";
      drawHull();
      ctx.fill();
    }
  }

  function drawSparseRoadNetwork() {
    drawMapModelRoads();
    return;

    for (let gy = 1; gy <= 17; gy += 1) {
      for (let gx = 1; gx < 17; gx += 1) {
        if (roadEdgeExists(gx, gy, gx + 1, gy)) drawRoadEdge("h", gy, gx);
      }
    }
    for (let gx = 1; gx <= 17; gx += 1) {
      for (let gy = 1; gy < 17; gy += 1) {
        if (roadEdgeExists(gx, gy, gx, gy + 1)) drawRoadEdge("v", gx, gy);
      }
    }

    // Only meaningful, signalized junctions get the full zebra/stop-line treatment.
    const startGX = Math.max(1, Math.floor(state.camera.x / ROAD_GAP) - 2);
    const endGX = Math.min(17, Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 2);
    const startGY = Math.max(1, Math.floor(state.camera.y / ROAD_GAP) - 2);
    const endGY = Math.min(17, Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 2);
    for (let gx = startGX; gx <= endGX; gx += 1) {
      for (let gy = startGY; gy <= endGY; gy += 1) {
        if (!isSignalizedIntersection(gx, gy)) continue;
        drawJapaneseIntersectionMarkings(
          gx * ROAD_GAP - state.camera.x,
          gy * ROAD_GAP - state.camera.y,
          gx * ROAD_GAP,
          gy * ROAD_GAP
        );
      }
    }
  }

  function drawGround() {
    const time = visualTime();
    ctx.fillStyle = "#7f8d78";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Fine world-anchored ground variation prevents large flat green slabs.
    const textureStep = 72;
    const startTX = Math.floor(state.camera.x / textureStep) - 1;
    const endTX = Math.ceil((state.camera.x + viewWidth) / textureStep) + 1;
    const startTY = Math.floor(state.camera.y / textureStep) - 1;
    const endTY = Math.ceil((state.camera.y + viewHeight) / textureStep) + 1;
    for (let tx = startTX; tx <= endTX; tx += 1) {
      for (let ty = startTY; ty <= endTY; ty += 1) {
        const seed = hash2(tx, ty, 2010);
        const px = tx * textureStep - state.camera.x + seed * 38;
        const py = ty * textureStep - state.camera.y + hash2(tx, ty, 2011) * 38;
        ctx.fillStyle = seed > .52 ? "rgba(226,235,211,.055)" : "rgba(40,62,43,.045)";
        ctx.beginPath();
        ctx.arc(px, py, 1.3 + seed * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const edges = {
      left:COAST - state.camera.x,
      top:COAST - state.camera.y,
      right:WORLD_SIZE - COAST - state.camera.x,
      bottom:WORLD_SIZE - COAST - state.camera.y
    };

    ctx.fillStyle = "#4e7d89";
    if (edges.left > 0) ctx.fillRect(0, 0, edges.left, viewHeight);
    if (edges.top > 0) ctx.fillRect(0, 0, viewWidth, edges.top);
    if (edges.right < viewWidth) ctx.fillRect(edges.right, 0, viewWidth - edges.right, viewHeight);
    if (edges.bottom < viewHeight) ctx.fillRect(0, edges.bottom, viewWidth, viewHeight - edges.bottom);

    ctx.strokeStyle = "rgba(220,242,244,.18)";
    ctx.lineWidth = 2;
    for (let y = 28; y < viewHeight; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin((y + state.camera.x) * .012) * 5);
      ctx.lineTo(Math.max(0, edges.left), y);
      ctx.stroke();
      if (edges.right < viewWidth) {
        ctx.beginPath();
        ctx.moveTo(edges.right, y);
        ctx.lineTo(viewWidth, y + Math.cos((y + state.camera.y) * .01) * 4);
        ctx.stroke();
      }
    }

    if (state.visual.weather === "rain") {
      ctx.fillStyle = "rgba(113,148,159,.035)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }

    if (time.daylight < .26) {
      ctx.fillStyle = "rgba(248,224,165,.035)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
  }

  function drawTree(x, y, scale = 1) {
    const p = worldToScreen(x, y);
    if (p.x < -70 || p.y < -80 || p.x > viewWidth + 70 || p.y > viewHeight + 80) return;
    const time = visualTime();
    const seed = hash2(Math.floor(x / 13), Math.floor(y / 13), 2020);
    const sway = Math.sin(state.visual.weatherClock * .7 + seed * 8) * (state.visual.weather === "rain" ? 1.6 : .7) * scale;

    ctx.fillStyle = "rgba(16,25,19,.19)";
    ctx.beginPath();
    ctx.ellipse(
      p.x + time.shadowX * .34,
      p.y + 11 + time.shadowY * .22,
      20 * scale,
      8.5 * scale,
      -.08,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Trunk + a visible fork.
    ctx.strokeStyle = "#604838";
    ctx.lineWidth = 6 * scale;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 14 * scale);
    ctx.lineTo(p.x + sway * .25, p.y - 12 * scale);
    ctx.stroke();
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 5 * scale);
    ctx.lineTo(p.x - 8 * scale + sway, p.y - 17 * scale);
    ctx.moveTo(p.x + 1 * scale, p.y - 7 * scale);
    ctx.lineTo(p.x + 9 * scale + sway, p.y - 20 * scale);
    ctx.stroke();

    const dark = seed > .5 ? "#355f45" : "#3d6848";
    const mid = seed > .5 ? "#477a52" : "#4d7b52";
    const light = seed > .5 ? "#6b9865" : "#719d68";
    const lobes = [
      [-10,-13,14], [8,-16,16], [-2,-27,15], [14,-29,11], [-16,-29,10]
    ];
    ctx.fillStyle = dark;
    for (const [ox, oy, r] of lobes) {
      ctx.beginPath();
      ctx.arc(p.x + (ox + sway) * scale, p.y + oy * scale, r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.arc(p.x - 3 * scale + sway, p.y - 28 * scale, 11 * scale, 0, Math.PI * 2);
    ctx.arc(p.x + 10 * scale + sway, p.y - 20 * scale, 10 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(190,220,159,.34)";
    ctx.beginPath();
    ctx.arc(p.x - 8 * scale + sway, p.y - 35 * scale, 6.5 * scale, 0, Math.PI * 2);
    ctx.arc(p.x + 5 * scale + sway, p.y - 31 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Tiny underside gives the canopy more depth.
    ctx.fillStyle = "rgba(24,54,35,.22)";
    ctx.beginPath();
    ctx.ellipse(p.x + sway * .5, p.y - 11 * scale, 16 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }


  function drawLamp(x, y) {
    const p = worldToScreen(x, y);
    if (p.x < -50 || p.y < -80 || p.x > viewWidth + 50 || p.y > viewHeight + 80) return;
    const time = visualTime();

    // Pole shadow follows the time-of-day sun vector.
    ctx.strokeStyle = "rgba(25,31,30,.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + 1, p.y + 8);
    ctx.lineTo(p.x + time.shadowX * .62, p.y + 8 + time.shadowY * .38);
    ctx.stroke();

    if (time.night > .38) {
      const groundGlow = ctx.createRadialGradient(p.x + 5, p.y + 9, 3, p.x + 5, p.y + 9, 48);
      groundGlow.addColorStop(0, "rgba(255,220,145," + (.12 * time.night).toFixed(2) + ")");
      groundGlow.addColorStop(1, "rgba(255,220,145,0)");
      ctx.fillStyle = groundGlow;
      ctx.beginPath();
      ctx.ellipse(p.x + 5, p.y + 9, 48, 20, 0, 0, Math.PI * 2);
      ctx.fill();

      const glow = ctx.createRadialGradient(p.x + 10, p.y - 29, 2, p.x + 10, p.y - 29, 38);
      glow.addColorStop(0, "rgba(255,224,157,.3)");
      glow.addColorStop(1, "rgba(255,224,157,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x + 10, p.y - 29, 38, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#343b3d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 8);
    ctx.lineTo(p.x, p.y - 28);
    ctx.lineTo(p.x + 10, p.y - 28);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 1, p.y + 5);
    ctx.lineTo(p.x - 1, p.y - 25);
    ctx.stroke();

    ctx.fillStyle = "#252d2d";
    roundedRectPath(ctx, p.x + 5, p.y - 33, 13, 8, 2);
    ctx.fill();
    ctx.fillStyle = time.night > .38 ? "#ffd98a" : "#c5c8c4";
    ctx.fillRect(p.x + 7, p.y - 31, 9, 4);
  }


  function drawWorldPolygon(polygon) {
    if (!polygon?.length) return;
    const first = worldToScreen(polygon[0][0], polygon[0][1]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < polygon.length; i += 1) {
      const point = worldToScreen(polygon[i][0], polygon[i][1]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
  }

  function drawNeighborhoodGround() {
    const districtFill = {
      "station-commercial":"rgba(201,181,143,.18)",
      "park-shrine":"rgba(91,137,91,.18)",
      "library-quarter":"rgba(178,173,145,.16)",
      "west-residential":"rgba(191,186,151,.14)",
      "south-residential":"rgba(194,187,151,.15)",
      "east-commercial":"rgba(194,175,142,.16)",
      "east-residential":"rgba(184,183,149,.14)"
    };

    for (const district of mapModel.districts) {
      ctx.fillStyle = districtFill[district.id] || "rgba(190,185,155,.12)";
      drawWorldPolygon(district.polygon);
      ctx.fill();
    }

    for (const space of mapModel.openSpaces || []) {
      const bounds = space.bounds;
      const screenBounds = { x:bounds.x - state.camera.x, y:bounds.y - state.camera.y, w:bounds.w, h:bounds.h };
      if (screenBounds.x + screenBounds.w < -120 || screenBounds.y + screenBounds.h < -120 ||
          screenBounds.x > viewWidth + 120 || screenBounds.y > viewHeight + 120) continue;

      ctx.fillStyle =
        space.type === "park" ? "#638b61" :
        space.type === "shrine" ? "#547552" :
        space.type === "pocket-park" ? "#73956a" :
        space.type === "schoolyard" ? "#b7a97f" :
        space.type === "parking" ? "#666b67" :
        "#b7b4aa";
      drawWorldPolygon(space.polygon);
      ctx.fill();

      if (space.type === "park" || space.type === "pocket-park" || space.type === "shrine") {
        ctx.save();
        drawWorldPolygon(space.polygon);
        ctx.clip();

        const step = space.type === "park" ? 74 : 88;
        const minGX = Math.floor(bounds.x / step);
        const maxGX = Math.ceil((bounds.x + bounds.w) / step);
        const minGY = Math.floor(bounds.y / step);
        const maxGY = Math.ceil((bounds.y + bounds.h) / step);
        let detailCount = 0;

        for (let gx = minGX; gx <= maxGX && detailCount < 54; gx += 1) {
          for (let gy = minGY; gy <= maxGY && detailCount < 54; gy += 1) {
            const seed = hash2(gx, gy, 2143);
            if (seed < .22) continue;
            const wx = gx * step + hash2(gx, gy, 2144) * step;
            const wy = gy * step + hash2(gx, gy, 2145) * step;
            const p = worldToScreen(wx, wy);

            ctx.fillStyle = seed > .58 ? "rgba(205,222,177,.08)" : "rgba(31,77,41,.075)";
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 2.5 + seed * 5, 1.1 + seed * 2.2, seed * Math.PI, 0, Math.PI * 2);
            ctx.fill();

            if (seed > .77) {
              ctx.strokeStyle = "rgba(45,88,49,.16)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y + 2);
              ctx.lineTo(p.x - 2 + seed * 4, p.y - 4 - seed * 3);
              ctx.stroke();
            }
            detailCount += 1;
          }
        }
        ctx.restore();
      }

      if (space.type === "park" || space.type === "pocket-park") {
        ctx.strokeStyle = "rgba(224,218,184,.72)";
        ctx.lineWidth = space.type === "park" ? 16 : 9;
        ctx.setLineDash(space.type === "park" ? [42,28] : [24,20]);
        drawWorldPolygon(space.polygon);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (space.type === "plaza") {
        ctx.save();
        drawWorldPolygon(space.polygon);
        ctx.clip();
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = 1;
        for (let x = screenBounds.x - 80; x < screenBounds.x + screenBounds.w + 80; x += 34) {
          ctx.beginPath();
          ctx.moveTo(x, screenBounds.y - 40);
          ctx.lineTo(x + 100, screenBounds.y + screenBounds.h + 40);
          ctx.stroke();
        }
        ctx.restore();
      } else if (space.type === "parking") {
        ctx.save();
        drawWorldPolygon(space.polygon);
        ctx.clip();
        ctx.strokeStyle = "rgba(244,244,238,.55)";
        ctx.lineWidth = 2;
        for (let x = screenBounds.x + 22; x < screenBounds.x + screenBounds.w - 12; x += 42) {
          ctx.beginPath();
          ctx.moveTo(x, screenBounds.y + 18);
          ctx.lineTo(x - 8, screenBounds.y + screenBounds.h - 18);
          ctx.stroke();
        }
        ctx.restore();
      } else if (space.type === "schoolyard") {
        const center = worldToScreen(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
        ctx.strokeStyle = "rgba(249,247,229,.55)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, Math.max(60,bounds.w * .34), Math.max(34,bounds.h * .26), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawRailUnderstructure() {
    const left = RAIL_MIN_X - state.camera.x;
    const right = RAIL_MAX_X - state.camera.x;
    const y = RAIL_Y - state.camera.y;
    if (right < -180 || left > viewWidth + 180 || y < -220 || y > viewHeight + 220) return;

    const length = RAIL_MAX_X - RAIL_MIN_X;

    // Ground shadow belongs below pedestrians and cars.
    ctx.fillStyle = "rgba(18,22,22,.18)";
    roundedRectPath(ctx, left + 7, y - 48 + 13, length, 96, 8);
    ctx.fill();

    // Viaduct piers rise from street level and remain behind ground actors.
    ctx.fillStyle = "#626967";
    const firstPier = Math.floor(RAIL_MIN_X / 240) * 240;
    for (let wx = firstPier; wx <= RAIL_MAX_X; wx += 240) {
      if (TRAIN_STATIONS.some((station) => Math.abs(wx - station.x) < 150)) continue;
      const sx = wx - state.camera.x;
      ctx.fillRect(sx - 8, y + 40, 16, 34);
      ctx.fillStyle = "rgba(255,255,255,.09)";
      ctx.fillRect(sx - 6, y + 40, 3, 31);
      ctx.fillStyle = "#626967";
    }
  }

  function drawRailDeck() {
    const left = RAIL_MIN_X - state.camera.x;
    const right = RAIL_MAX_X - state.camera.x;
    const y = RAIL_Y - state.camera.y;
    if (right < -180 || left > viewWidth + 180 || y < -220 || y > viewHeight + 220) return;

    const length = RAIL_MAX_X - RAIL_MIN_X;
    const controlledActor = state.player.inVehicle ? personalCar : state.player;
    const underRail = !state.player.inTrain && controlledActor.x >= RAIL_MIN_X && controlledActor.x <= RAIL_MAX_X &&
      controlledActor.y >= RAIL_Y - RAIL_CORRIDOR_HALF && controlledActor.y <= RAIL_Y + RAIL_CORRIDOR_HALF;

    ctx.save();
    ctx.globalAlpha = underRail ? 0.46 : 1;

    // The deck is drawn after ground actors for depth, but becomes translucent
    // only while the controlled actor is inside the under-rail corridor.
    ctx.fillStyle = "#777d7a";
    roundedRectPath(ctx, left, y - 48, length, 96, 8);
    ctx.fill();

    ctx.fillStyle = "#8a908c";
    ctx.fillRect(left, y - 43, length, 7);
    ctx.fillRect(left, y + 36, length, 7);

    // Sleepers and rails for both tracks.
    for (const offset of [-RAIL_TRACK_GAP, RAIL_TRACK_GAP]) {
      const trackY = y + offset;
      ctx.strokeStyle = "#474c4b";
      ctx.lineWidth = 3;
      const sleeperStart = Math.floor(RAIL_MIN_X / 32) * 32;
      for (let wx = sleeperStart; wx <= RAIL_MAX_X; wx += 32) {
        const sx = wx - state.camera.x;
        ctx.beginPath();
        ctx.moveTo(sx, trackY - 12);
        ctx.lineTo(sx, trackY + 12);
        ctx.stroke();
      }

      ctx.strokeStyle = "#303534";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(left, trackY - 7);
      ctx.lineTo(right, trackY - 7);
      ctx.moveTo(left, trackY + 7);
      ctx.lineTo(right, trackY + 7);
      ctx.stroke();

      ctx.strokeStyle = "#b5b8b5";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(left, trackY - 7);
      ctx.lineTo(right, trackY - 7);
      ctx.moveTo(left, trackY + 7);
      ctx.lineTo(right, trackY + 7);
      ctx.stroke();
    }

    for (const station of TRAIN_STATIONS) {
      const sx = station.x - state.camera.x;
      if (sx < -260 || sx > viewWidth + 260) continue;

      // Elevated side platforms.
      ctx.fillStyle = "#c2c0b8";
      roundedRectPath(ctx, sx - 132, y - 63, 264, 17, 4);
      ctx.fill();
      roundedRectPath(ctx, sx - 132, y + 46, 264, 17, 4);
      ctx.fill();

      ctx.fillStyle = "#d5b73d";
      ctx.fillRect(sx - 124, y - 53, 248, 3);
      ctx.fillRect(sx - 124, y + 50, 248, 3);

      ctx.fillStyle = "rgba(82,94,91,.88)";
      roundedRectPath(ctx, sx - 88, y - 78, 176, 17, 5);
      ctx.fill();
      roundedRectPath(ctx, sx - 88, y + 62, 176, 17, 5);
      ctx.fill();

      ctx.fillStyle = "#565f5c";
      for (const px of [-72, -24, 24, 72]) {
        ctx.fillRect(sx + px - 2, y - 61, 4, 15);
        ctx.fillRect(sx + px - 2, y + 46, 4, 15);
      }

      ctx.fillStyle = "#eef0ec";
      roundedRectPath(ctx, sx - 48, y - 87, 96, 16, 3);
      ctx.fill();
      ctx.fillStyle = "#34423f";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(station.name, sx, y - 76);

      // Station stairs stay attached to the elevated platform and may occlude
      // ground actors where the staircase physically passes in front of them.
      const access = worldToScreen(station.accessX, station.accessY);
      ctx.fillStyle = "#8b8f88";
      ctx.beginPath();
      ctx.moveTo(sx - 22, y + 62);
      ctx.lineTo(sx + 22, y + 62);
      ctx.lineTo(access.x + 16, access.y);
      ctx.lineTo(access.x - 16, access.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.32)";
      ctx.lineWidth = 1;
      for (let n = 0; n < 5; n += 1) {
        const t = (n + 1) / 6;
        const yy = y + 62 + (access.y - (y + 62)) * t;
        const half = 22 - 6 * t;
        ctx.beginPath();
        ctx.moveTo(sx - half, yy);
        ctx.lineTo(sx + half, yy);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(30,39,36,.78)";
      roundedRectPath(ctx, access.x - 42, access.y + 7, 84, 17, 5);
      ctx.fill();
      ctx.fillStyle = "#f4f5f2";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.fillText("若葉線 入口", access.x, access.y + 19);
    }
    ctx.restore();
  }


  function drawTrain(train) {
    const p = worldToScreen(train.x, train.y);
    if (p.x < -TRAIN_LENGTH || p.x > viewWidth + TRAIN_LENGTH || p.y < -100 || p.y > viewHeight + 100) return;

    const movingRight = train.direction > 0;
    const stopped = train.dwell > .05;

    ctx.save();
    ctx.translate(p.x, p.y - 5);

    ctx.fillStyle = "rgba(14,18,18,.24)";
    roundedRectPath(ctx, -TRAIN_LENGTH / 2 + 5, -TRAIN_WIDTH / 2 + 7, TRAIN_LENGTH, TRAIN_WIDTH, 9);
    ctx.fill();

    // Four connected cars.
    const gap = 3;
    const carCount = 4;
    const carLength = (TRAIN_LENGTH - gap * (carCount - 1)) / carCount;
    for (let i = 0; i < carCount; i += 1) {
      const x = -TRAIN_LENGTH / 2 + i * (carLength + gap);
      ctx.fillStyle = "#e2e5e2";
      roundedRectPath(ctx, x, -TRAIN_WIDTH / 2, carLength, TRAIN_WIDTH, i === 0 || i === carCount - 1 ? 8 : 4);
      ctx.fill();

      // Wakaba line stripe.
      ctx.fillStyle = "#4f8a6b";
      ctx.fillRect(x + 2, 1, carLength - 4, 6);

      // Windows.
      ctx.fillStyle = "#75929a";
      for (let w = 0; w < 4; w += 1) {
        const wx = x + 7 + w * ((carLength - 14) / 4);
        ctx.fillRect(wx, -TRAIN_WIDTH / 2 + 5, 7, 8);
      }

      // Doors. Bright when open at station.
      ctx.fillStyle = stopped ? "#b9d8cf" : "#aeb9b6";
      ctx.fillRect(x + carLength * .36, -TRAIN_WIDTH / 2 + 4, 7, TRAIN_WIDTH - 8);
      ctx.fillRect(x + carLength * .62, -TRAIN_WIDTH / 2 + 4, 7, TRAIN_WIDTH - 8);

      ctx.strokeStyle = "rgba(49,57,55,.45)";
      ctx.lineWidth = 1;
      roundedRectPath(ctx, x, -TRAIN_WIDTH / 2, carLength, TRAIN_WIDTH, 6);
      ctx.stroke();
    }

    // Cab windshield and head/tail lights.
    const frontX = movingRight ? TRAIN_LENGTH / 2 - 7 : -TRAIN_LENGTH / 2 + 7;
    ctx.fillStyle = "#385057";
    ctx.fillRect(frontX - 3, -TRAIN_WIDTH / 2 + 5, 6, TRAIN_WIDTH - 10);

    ctx.fillStyle = stopped ? "#d3d3ca" : "#f3e7b0";
    const lightX = movingRight ? TRAIN_LENGTH / 2 - 2 : -TRAIN_LENGTH / 2 + 2;
    ctx.fillRect(lightX - 2, -9, 4, 5);
    ctx.fillRect(lightX - 2, 4, 4, 5);

    if (state.player.inTrain && state.player.trainId === train.id) {
      ctx.strokeStyle = "rgba(116,211,165,.92)";
      ctx.lineWidth = 2;
      roundedRectPath(ctx, -TRAIN_LENGTH / 2 - 4, -TRAIN_WIDTH / 2 - 4, TRAIN_LENGTH + 8, TRAIN_WIDTH + 8, 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCityLandmarks() {
    const station = TRAIN_STATIONS[1];
    const stationScreen = worldToScreen(station.accessX, station.accessY + 34);
    if (stationScreen.x > -400 && stationScreen.y > -400 && stationScreen.x < viewWidth + 400 && stationScreen.y < viewHeight + 400) {
      ctx.fillStyle = "#4a5554";
      roundedRectPath(ctx, stationScreen.x - 92, stationScreen.y - 30, 184, 42, 7);
      ctx.fill();
      ctx.fillStyle = "#dfe5df";
      ctx.fillRect(stationScreen.x - 82, stationScreen.y - 20, 164, 20);
      ctx.fillStyle = "#384340";
      ctx.font = "800 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉駅 南口", stationScreen.x, stationScreen.y - 5);
      ctx.fillStyle = "#5a6864";
      ctx.fillRect(stationScreen.x - 76, stationScreen.y + 11, 10, 42);
      ctx.fillRect(stationScreen.x + 66, stationScreen.y + 11, 10, 42);
    }

    for (const landmark of mapModel.landmarks || []) {
      const p = worldToScreen(landmark.x, landmark.y);
      if (p.x < -220 || p.y < -220 || p.x > viewWidth + 220 || p.y > viewHeight + 220) continue;
      if (landmark.type === "shopping-arch") {
        ctx.strokeStyle = "#56645e";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(p.x - 50, p.y + 26);
        ctx.lineTo(p.x - 50, p.y - 26);
        ctx.lineTo(p.x + 50, p.y - 26);
        ctx.lineTo(p.x + 50, p.y + 26);
        ctx.stroke();
        ctx.fillStyle = "#d9c77b";
        roundedRectPath(ctx, p.x - 44, p.y - 42, 88, 22, 5);
        ctx.fill();
        ctx.fillStyle = "#493f2f";
        ctx.font = "800 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(landmark.label, p.x, p.y - 27);
      } else if (landmark.type === "shrine-gate") {
        ctx.strokeStyle = "#a64f43";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(p.x - 23, p.y + 18);
        ctx.lineTo(p.x - 23, p.y - 26);
        ctx.moveTo(p.x + 23, p.y + 18);
        ctx.lineTo(p.x + 23, p.y - 26);
        ctx.moveTo(p.x - 35, p.y - 22);
        ctx.lineTo(p.x + 35, p.y - 22);
        ctx.moveTo(p.x - 29, p.y - 31);
        ctx.lineTo(p.x + 29, p.y - 31);
        ctx.stroke();
      } else if (landmark.type === "school-sign") {
        ctx.fillStyle = "#e6e2cf";
        roundedRectPath(ctx, p.x - 46, p.y - 18, 92, 28, 4);
        ctx.fill();
        ctx.fillStyle = "#44514b";
        ctx.font = "700 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(landmark.label, p.x, p.y);
      } else if (landmark.type === "bus-terminal") {
        ctx.strokeStyle = "rgba(245,246,240,.7)";
        ctx.lineWidth = 2;
        for (let n = -2; n <= 2; n += 1) ctx.strokeRect(p.x + n * 40 - 16, p.y - 11, 32, 54);
        ctx.fillStyle = "#d7dbd3";
        ctx.font = "700 9px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BUS", p.x, p.y + 58);
      }
    }
  }

  function forEachStreetLamp(callback) {
    for (let edgeIndex = 0; edgeIndex < mapModel.edges.length; edgeIndex += 1) {
      const edge = mapModel.edges[edgeIndex];
      if (!edge.vehicle) continue;
      const stride = edge.type === "arterial" ? 250 : edge.type === "collector" ? 300 : 360;
      const length = polylineLength(edge.points);
      let sampleIndex = 0;
      for (let along = 120; along < length; along += stride) {
        const pose = pointAndTangentOnPolyline(edge.points, along);
        const normal = { x:-pose.tangent.y, y:pose.tangent.x };
        const side = ((edgeIndex + sampleIndex) % 2 === 0 ? 1 : -1);
        const offset = edge.width / 2 + 20;
        callback(pose.point.x + normal.x * offset * side, pose.point.y + normal.y * offset * side, edge, edgeIndex, sampleIndex);
        sampleIndex += 1;
      }
    }
  }

  function drawStreetProps() {
    forEachStreetLamp((x, y) => drawLamp(x, y));
    for (const tree of mapModel.vegetation || []) drawTree(tree.x, tree.y, tree.scale || 1);
  }

  function drawRoute() {
    if (!state.player.inVehicle || !state.drive.route.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(89,190,255,.32)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(personalCar.x - state.camera.x, personalCar.y - state.camera.y);
    for (let i = state.drive.routeIndex; i < state.drive.route.length; i += 1) {
      const point = state.drive.route[i];
      ctx.lineTo(point.x - state.camera.x, point.y - state.camera.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(111,208,255,.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.stroke();
    ctx.restore();
  }

  function drawSignalHead(x, y, orientation, stateName) {
    const horizontal = orientation === "h";
    const w = horizontal ? 34 : 12;
    const h = horizontal ? 12 : 34;
    ctx.fillStyle = "#262b2a";
    roundedRectPath(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.fill();

    const colors = horizontal
      ? [["green", "#3c6651"], ["yellow", "#6a6034"], ["red", "#663b39"]]
      : [["red", "#663b39"], ["yellow", "#6a6034"], ["green", "#3c6651"]];
    const positions = horizontal ? [-10, 0, 10] : [-10, 0, 10];
    for (let i = 0; i < 3; i += 1) {
      const [name, dim] = colors[i];
      ctx.fillStyle = name === stateName
        ? (name === "green" ? "#58c57a" : name === "yellow" ? "#efc74f" : "#e65c55")
        : dim;
      ctx.beginPath();
      ctx.arc(horizontal ? x + positions[i] : x, horizontal ? y : y + positions[i], 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPedestrianSignal(x, y, signal) {
    const signalState = signal?.state || "stop";
    const greenLit = signalState === "walk" || (signalState === "flashing" && signal.lit);
    const redLit = signalState === "stop";

    ctx.fillStyle = "#29302e";
    roundedRectPath(ctx, x - 5, y - 8, 10, 16, 2);
    ctx.fill();

    // Lower lamp: walk. During the final two seconds it flashes instead of
    // changing straight from green to red.
    ctx.fillStyle = greenLit ? "#57ce79" : "#38543f";
    ctx.beginPath();
    ctx.arc(x, y + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Upper lamp: stop. It remains dark while the green lamp is flashing.
    ctx.fillStyle = redLit ? "#e35b55" : "#67413e";
    ctx.beginPath();
    ctx.arc(x, y - 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTrafficLights() {
    for (const node of mapModel.nodes) {
      if (!isSignalizedMapNode(node.id)) continue;
      const incidentEdges = vehicleEdgesAtNode(node.id);
      if (!incidentEdges.length) continue;
      const p = worldToScreen(node.x, node.y);
      if (p.x < -180 || p.y < -180 || p.x > viewWidth + 180 || p.y > viewHeight + 180) continue;
      const hasHorizontal = incidentEdges.some((edge) => {
        const other = mapModel.getNode(edge.from === node.id ? edge.to : edge.from);
        return other && Math.abs(other.x - node.x) >= Math.abs(other.y - node.y);
      });
      const hasVertical = incidentEdges.some((edge) => {
        const other = mapModel.getNode(edge.from === node.id ? edge.to : edge.from);
        return other && Math.abs(other.y - node.y) > Math.abs(other.x - node.x);
      });
      const halfRoad = Math.max(...incidentEdges.map((edge) => edge.width)) / 2;
      const poleOffset = halfRoad + 28;
      const hState = signalStateAt(node.x, node.y, "h");
      const vState = signalStateAt(node.x, node.y, "v");
      ctx.strokeStyle = "#4d5552";
      ctx.lineWidth = 3;
      if (hasHorizontal) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - poleOffset);
        ctx.stroke();
        drawSignalHead(p.x, p.y - poleOffset, "h", hState);
      }
      if (hasVertical) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + poleOffset, p.y);
        ctx.stroke();
        drawSignalHead(p.x + poleOffset, p.y, "v", vState);
      }
      if (hasHorizontal && hasVertical) {
        drawPedestrianSignal(
          p.x - poleOffset,
          p.y - poleOffset,
          pedestrianSignalAt(node.x, node.y, "h")
        );
        drawPedestrianSignal(
          p.x + poleOffset,
          p.y + poleOffset,
          pedestrianSignalAt(node.x, node.y, "v")
        );
      }
    }
    return;

    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;

    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        if (!isSignalizedIntersection(gx, gy)) continue;

        const north = roadEdgeExists(gx, gy - 1, gx, gy);
        const south = roadEdgeExists(gx, gy, gx, gy + 1);
        const west = roadEdgeExists(gx - 1, gy, gx, gy);
        const east = roadEdgeExists(gx, gy, gx + 1, gy);

        const wx = gx * ROAD_GAP;
        const wy = gy * ROAD_GAP;
        const sx = wx - state.camera.x;
        const sy = wy - state.camera.y;
        const hState = signalStateAt(wx, wy, "h");
        const vState = signalStateAt(wx, wy, "v");
        const halfRoad = intersectionHalfWidth(gx, gy);
        const pole = halfRoad + 30;
        const lane = Math.min(LANE_OFFSET, halfRoad * .42);

        ctx.strokeStyle = "#4d5552";
        ctx.lineWidth = 3;

        if (north) {
          ctx.beginPath();
          ctx.moveTo(sx + halfRoad + 11, sy - pole - 18);
          ctx.lineTo(sx + halfRoad + 11, sy - pole);
          ctx.lineTo(sx + lane, sy - pole);
          ctx.stroke();
          drawSignalHead(sx + lane, sy - pole, "h", vState);
        }

        if (south) {
          ctx.beginPath();
          ctx.moveTo(sx - halfRoad - 11, sy + pole + 18);
          ctx.lineTo(sx - halfRoad - 11, sy + pole);
          ctx.lineTo(sx - lane, sy + pole);
          ctx.stroke();
          drawSignalHead(sx - lane, sy + pole, "h", vState);
        }

        if (west) {
          ctx.beginPath();
          ctx.moveTo(sx - pole - 18, sy - halfRoad - 11);
          ctx.lineTo(sx - pole, sy - halfRoad - 11);
          ctx.lineTo(sx - pole, sy - lane);
          ctx.stroke();
          drawSignalHead(sx - pole, sy - lane, "v", hState);
        }

        if (east) {
          ctx.beginPath();
          ctx.moveTo(sx + pole + 18, sy + halfRoad + 11);
          ctx.lineTo(sx + pole, sy + halfRoad + 11);
          ctx.lineTo(sx + pole, sy + lane);
          ctx.stroke();
          drawSignalHead(sx + pole, sy + lane, "v", hState);
        }

        const pedHorizontal = pedestrianSignalAt(wx, wy, "h");
        const pedVertical = pedestrianSignalAt(wx, wy, "v");
        if (north && west) drawPedestrianSignal(sx - halfRoad - 18, sy - halfRoad - 18, pedHorizontal);
        if (south && east) drawPedestrianSignal(sx + halfRoad + 18, sy + halfRoad + 18, pedHorizontal);
        if (north && east) drawPedestrianSignal(sx + halfRoad + 18, sy - halfRoad - 18, pedVertical);
        if (south && west) drawPedestrianSignal(sx - halfRoad - 18, sy + halfRoad + 18, pedVertical);
      }
    }
  }


  function drawResidentialBuilding(building, x, y, palette, time) {
    const apartment = building.houseStyle === "small-apartment";
    const elevation = apartment
      ? clamp(20 + building.floors * 4.8, 28, 38)
      : clamp(14 + building.floors * 4.2, 18, 28);
    const roofDx = -elevation * BUILDING_DEPTH_X;
    const roofDy = -elevation;
    const rx = x + roofDx;
    const ry = y + roofDy;
    const seed = building.residentialSeed || 1800;
    const roofColors = ["#665b55","#555b60","#6f6354","#55564f","#72574f"];
    const roofColor = roofColors[Math.floor(hash2(Math.floor(building.x), Math.floor(building.y), seed) * roofColors.length) % roofColors.length];

    ctx.fillStyle = "rgba(20,25,23," + (0.14 + time.night * .04).toFixed(2) + ")";
    roundedRectPath(ctx, x + time.shadowX * .24, y + time.shadowY * .18, building.w, building.h, 4);
    ctx.fill();

    // Visible wall planes.
    ctx.fillStyle = palette.wall;
    ctx.beginPath();
    ctx.moveTo(rx, ry + building.h);
    ctx.lineTo(rx + building.w, ry + building.h);
    ctx.lineTo(x + building.w, y + building.h);
    ctx.lineTo(x, y + building.h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(45,48,45,.22)";
    ctx.beginPath();
    ctx.moveTo(rx + building.w, ry);
    ctx.lineTo(rx + building.w, ry + building.h);
    ctx.lineTo(x + building.w, y + building.h);
    ctx.lineTo(x + building.w, y);
    ctx.closePath();
    ctx.fill();

    if (apartment) {
      ctx.fillStyle = roofColor;
      roundedRectPath(ctx, rx - 2, ry - 2, building.w + 4, building.h + 4, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.1)";
      ctx.stroke();

      // Small balconies on the visible front facade.
      ctx.strokeStyle = "rgba(63,69,67,.62)";
      ctx.lineWidth = 1;
      for (let n = 0; n < Math.max(2, Math.floor(building.w / 34)); n += 1) {
        const bx = x + 10 + n * ((building.w - 20) / Math.max(1, Math.floor(building.w / 34)));
        ctx.strokeRect(bx, y + building.h - 15, 20, 5);
      }
    } else {
      // Gabled / hipped-looking roof with an overhang and a visible ridge.
      const overhang = 4;
      const rw = building.w + overhang * 2;
      const rh = building.h + overhang * 2;
      const roofX = rx - overhang;
      const roofY = ry - overhang;
      const ridgeAlongX = building.w >= building.h;

      if (ridgeAlongX) {
        const midY = roofY + rh * .5;
        ctx.fillStyle = roofColor;
        ctx.beginPath();
        ctx.moveTo(roofX, roofY);
        ctx.lineTo(roofX + rw, roofY);
        ctx.lineTo(roofX + rw, midY);
        ctx.lineTo(roofX, midY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,.07)";
        ctx.beginPath();
        ctx.moveTo(roofX, midY);
        ctx.lineTo(roofX + rw, midY);
        ctx.lineTo(roofX + rw, roofY + rh);
        ctx.lineTo(roofX, roofY + rh);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(42,44,42,.62)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(roofX + 3, midY);
        ctx.lineTo(roofX + rw - 3, midY);
        ctx.stroke();
      } else {
        const midX = roofX + rw * .5;
        ctx.fillStyle = roofColor;
        ctx.beginPath();
        ctx.moveTo(roofX, roofY);
        ctx.lineTo(midX, roofY);
        ctx.lineTo(midX, roofY + rh);
        ctx.lineTo(roofX, roofY + rh);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,.07)";
        ctx.beginPath();
        ctx.moveTo(midX, roofY);
        ctx.lineTo(roofX + rw, roofY);
        ctx.lineTo(roofX + rw, roofY + rh);
        ctx.lineTo(midX, roofY + rh);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(42,44,42,.62)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(midX, roofY + 3);
        ctx.lineTo(midX, roofY + rh - 3);
        ctx.stroke();
      }

      // Occasional small solar panel.
      if (hash2(Math.floor(building.x), Math.floor(building.y), seed + 1) > .78) {
        ctx.fillStyle = "#31464e";
        const panelW = Math.min(24, building.w * .34);
        const panelH = Math.min(13, building.h * .22);
        ctx.fillRect(rx + building.w * .56 - panelW / 2, ry + building.h * .28 - panelH / 2, panelW, panelH);
        ctx.strokeStyle = "rgba(190,214,218,.38)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + building.w * .56 - panelW / 2, ry + building.h * .28 - panelH / 2, panelW, panelH);
      }
    }

    // Windows on the visible south/front wall. Several rows make apartments
    // and two-storey homes read as actual volumes rather than flat footprints.
    const facadeH = Math.max(10, elevation - 4);
    const cols = apartment ? Math.max(2, Math.floor(building.w / 36)) : Math.max(1, Math.floor(building.w / 45));
    const rows = clamp(apartment ? building.floors : Math.min(2, building.floors), 1, 3);
    for (let row = 0; row < rows; row += 1) {
      const wy = y + building.h - facadeH + 4 + row * Math.max(8, (facadeH - 8) / rows);
      for (let c = 0; c < cols; c += 1) {
        const wx = x + 12 + c * ((building.w - 24) / Math.max(1, cols - 1));
        const lit = time.night > .45 && hash2(Math.floor(building.x) + c, Math.floor(building.y) + row, seed + 2) > .58;
        ctx.fillStyle = "rgba(31,42,44,.22)";
        ctx.fillRect(wx - 7, wy - 1, 14, 10);
        ctx.fillStyle = lit ? "#dcbf78" : palette.glass;
        ctx.fillRect(wx - 5.5, wy, 11, 7);
        ctx.fillStyle = "rgba(255,255,255,.13)";
        ctx.fillRect(wx - 4.5, wy + 1, 1.4, 5);
      }
    }

    ctx.fillStyle = "rgba(28,34,32,.16)";
    ctx.fillRect(x + 4, y + building.h - 3, Math.max(8, building.w - 8), 3);

    // Small entrance cue on the facade closest to the access road when visible.
    ctx.fillStyle = "#39413e";
    if (building.frontage === "south" || building.frontage === "east") {
      const doorX = building.frontage === "east" ? x + building.w - 13 : x + building.w * .5 - 5;
      ctx.fillRect(doorX, y + building.h - Math.min(16, elevation * .7), 10, Math.min(16, elevation * .7));
    }

    // Eaves, rain gutter and the ubiquitous outdoor AC unit add residential scale.
    ctx.strokeStyle = "rgba(44,48,45,.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(rx - 3, ry + building.h + 2);
    ctx.lineTo(rx + building.w + 3, ry + building.h + 2);
    ctx.stroke();

    if (hash2(Math.floor(building.x), Math.floor(building.y), seed + 4) > .38) {
      const acX = x + building.w - 21;
      const acY = y + building.h - 11;
      ctx.fillStyle = "#b9bbb5";
      roundedRectPath(ctx, acX, acY, 14, 9, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(63,68,65,.48)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(acX + 7, acY + 4.5, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBuildingMicroDetails(building, x, y, rx, ry, elevation, palette, time) {
    const seed = hash2(Math.floor(building.x / 7), Math.floor(building.y / 7), 2040);

    // Roof parapet and service equipment.
    ctx.strokeStyle = "rgba(36,42,40,.34)";
    ctx.lineWidth = 1.2;
    roundedRectPath(ctx, rx + 7, ry + 7, Math.max(8, building.w - 14), Math.max(8, building.h - 14), 3);
    ctx.stroke();

    if (building.w > 86 && building.h > 70) {
      const unitCount = seed > .66 ? 2 : 1;
      for (let i = 0; i < unitCount; i += 1) {
        const ux = rx + building.w * (.24 + i * .28);
        const uy = ry + building.h * (.24 + hash2(i, building.palette, 2041) * .28);
        ctx.fillStyle = "#777f7c";
        roundedRectPath(ctx, ux - 11, uy - 7, 22, 14, 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(38,44,43,.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ux, uy, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (building.kind === "tower" || seed > .82) {
      const ax = rx + building.w * .7;
      const ay = ry + building.h * .25;
      ctx.strokeStyle = "#4f5755";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ax, ay + 12);
      ctx.lineTo(ax, ay - 16);
      ctx.moveTo(ax - 6, ay - 9);
      ctx.lineTo(ax + 6, ay - 9);
      ctx.stroke();
    }

    // Ground-floor awning/sign band gives the facade depth and street frontage.
    if (building.w > 72) {
      const awningY = y + building.h - Math.min(10, elevation * .34);
      ctx.fillStyle = "rgba(42,48,46,.26)";
      ctx.fillRect(x + building.w * .18, awningY + 3, building.w * .64, 4);
      ctx.fillStyle = palette.trim;
      ctx.fillRect(x + building.w * .18, awningY, building.w * .64, 3);
    }

    // Small outdoor AC units and drain pipes on visible facade.
    if (seed > .34 && building.w > 70) {
      const acX = x + building.w * .16;
      const acY = y + building.h - Math.min(18, elevation * .62);
      ctx.fillStyle = "#b3b6b0";
      roundedRectPath(ctx, acX, acY, 13, 8, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(56,61,59,.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(acX + 6.5, acY + 4, 2.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(83,88,84,.35)";
      ctx.beginPath();
      ctx.moveTo(acX + 13, acY + 5);
      ctx.lineTo(acX + 20, y + building.h - 2);
      ctx.stroke();
    }

    // Contact shadow and thin facade seams make the extrusion easier to read.
    ctx.fillStyle = "rgba(20,25,23,.14)";
    ctx.fillRect(x + 5, y + building.h - 3, Math.max(8, building.w - 10), 3);
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx + 5, ry + 5);
    ctx.lineTo(rx + Math.max(5, building.w - 5), ry + 5);
    ctx.stroke();

    // A few lit panes get a soft halo at night instead of a flat yellow square.
    if (time.night > .52 && seed > .48) {
      const gx = x + building.w * .72;
      const gy = y + building.h - Math.min(16, elevation * .55);
      const glow = ctx.createRadialGradient(gx, gy, 1, gx, gy, 18);
      glow.addColorStop(0, "rgba(242,202,119,.12)");
      glow.addColorStop(1, "rgba(242,202,119,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(gx, gy, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBuildings() {
    const time = visualTime();
    const visible = buildings
      .filter((building) => visibleRect(building, 120))
      .sort((a, b) => (a.y + a.h) - (b.y + b.h));

    for (const building of visible) {
      const x = building.x - state.camera.x;
      const y = building.y - state.camera.y;
      const palette = VISUAL_PALETTES[building.palette % VISUAL_PALETTES.length];

      if (building.style === "residential") {
        drawResidentialBuilding(building, x, y, palette, time);
        continue;
      }

      const baseElevation =
        building.kind === "tower" ? 34 :
        building.kind === "low" ? 17 :
        22;
      const elevation = clamp(baseElevation + building.floors * 2.2, 19, 48);
      const roofDx = -elevation * BUILDING_DEPTH_X;
      const roofDy = -elevation;
      const rx = x + roofDx;
      const ry = y + roofDy;

      ctx.fillStyle = "rgba(20,25,23," + (0.16 + time.night * .04).toFixed(2) + ")";
      roundedRectPath(
        ctx,
        x + time.shadowX * .32,
        y + time.shadowY * .24,
        building.w,
        building.h,
        5
      );
      ctx.fill();

      ctx.fillStyle = palette.wall;
      ctx.beginPath();
      ctx.moveTo(rx, ry + building.h);
      ctx.lineTo(rx + building.w, ry + building.h);
      ctx.lineTo(x + building.w, y + building.h);
      ctx.lineTo(x, y + building.h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(42,47,45,.28)";
      ctx.beginPath();
      ctx.moveTo(rx + building.w, ry);
      ctx.lineTo(rx + building.w, ry + building.h);
      ctx.lineTo(x + building.w, y + building.h);
      ctx.lineTo(x + building.w, y);
      ctx.closePath();
      ctx.fill();

      const facadeTop = ry + building.h + 5;
      const facadeBottom = y + building.h - 5;
      const facadeHeight = Math.max(8, facadeBottom - facadeTop);
      const windowCols = Math.max(2, Math.floor((building.w - 34) / 42));
      const windowRows = clamp(Math.floor(facadeHeight / 11), 1, 4);
      const windowW = Math.min(18, (building.w - 28) / windowCols - 8);
      const windowH = Math.min(8, Math.max(4, (facadeHeight - 4) / windowRows - 3));

      for (let row = 0; row < windowRows; row += 1) {
        const wy = facadeTop + 2 + row * ((facadeHeight - 3) / windowRows);
        if (row > 0) {
          ctx.strokeStyle = "rgba(41,47,45,.12)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(rx + 7, wy - 2);
          ctx.lineTo(rx + building.w - 7, wy - 2);
          ctx.stroke();
        }

        for (let col = 0; col < windowCols; col += 1) {
          const denominator = Math.max(1, windowCols - 1);
          const wx = rx + 19 + col * ((building.w - 38) / denominator);
          const lit = time.night > .45 && hash2(Math.floor(building.x) + col, Math.floor(building.y) + row, 911) > .5;

          ctx.fillStyle = "rgba(32,40,40,.20)";
          ctx.fillRect(wx - windowW / 2 - 1, wy - 1, windowW + 2, windowH + 2);
          ctx.fillStyle = lit ? "#dcb96c" : palette.glass;
          ctx.fillRect(wx - windowW / 2, wy, windowW, windowH);
          ctx.fillStyle = "rgba(255,255,255,.15)";
          ctx.fillRect(wx - windowW / 2 + 2, wy + 1, 1.8, Math.max(2, windowH - 2));
        }
      }

      const doorW = Math.min(34, building.w * .14);
      const doorH = Math.min(22, elevation * .72);
      ctx.fillStyle = "#35403e";
      ctx.fillRect(x + building.w * .5 - doorW / 2, y + building.h - doorH, doorW, doorH);
      ctx.fillStyle = "rgba(177,205,211,.5)";
      ctx.fillRect(x + building.w * .5 - doorW * .36, y + building.h - doorH + 3, doorW * .72, 7);

      ctx.fillStyle = palette.roof;
      roundedRectPath(ctx, rx, ry, building.w, building.h, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.09)";
      ctx.lineWidth = 1;
      roundedRectPath(ctx, rx + 5, ry + 5, building.w - 10, building.h - 10, 4);
      ctx.stroke();

      if (building.facadeBand) {
        ctx.fillStyle = palette.trim;
        ctx.fillRect(rx + 8, ry + building.h - 12, building.w - 16, 5);
      }

      if (building.roofDetail === 0) {
        ctx.fillStyle = "#747d79";
        roundedRectPath(ctx, rx + building.w - 48, ry + 14, 26, 16, 3);
        ctx.fill();
        ctx.strokeStyle = "#505956";
        ctx.stroke();
      } else if (building.roofDetail === 1) {
        ctx.fillStyle = "#606a66";
        ctx.beginPath();
        ctx.arc(rx + building.w - 34, ry + 22, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.beginPath();
        ctx.arc(rx + building.w - 37, ry + 19, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (building.roofDetail === 2) {
        ctx.strokeStyle = "#56605d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx + building.w - 42, ry + 31);
        ctx.lineTo(rx + building.w - 42, ry + 10);
        ctx.lineTo(rx + building.w - 26, ry + 10);
        ctx.stroke();
      }

      drawBuildingMicroDetails(building, x, y, rx, ry, elevation, palette, time);
    }
  }

  function drawFacilityBuilding(p, w, h, wall, roof, glass) {
    const time = visualTime();
    const elevation = 25;
    const roofDx = -elevation * BUILDING_DEPTH_X;
    const roofDy = -elevation;
    const left = p.x - w / 2;
    const top = p.y - h / 2;
    const rx = left + roofDx;
    const ry = top + roofDy;

    ctx.fillStyle = "rgba(20,26,24,.2)";
    roundedRectPath(ctx, left + time.shadowX * .32, top + time.shadowY * .24, w, h, 8);
    ctx.fill();

    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.moveTo(rx, ry + h);
    ctx.lineTo(rx + w, ry + h);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left, top + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(40,48,45,.28)";
    ctx.beginPath();
    ctx.moveTo(rx + w, ry);
    ctx.lineTo(rx + w, ry + h);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left + w, top);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = roof;
    roundedRectPath(ctx, rx, ry, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.1)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, rx + 6, ry + 6, w - 12, h - 12, 6);
    ctx.stroke();

    ctx.fillStyle = glass;
    ctx.fillRect(p.x - w * .34, top + h - 20, w * .68, 9);
    ctx.fillStyle = "#303a37";
    ctx.fillRect(p.x - 20, top + h - 22, 40, 22);
  }

  function drawCommunityGardenBeds(parkPosition) {
    const now = communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute));
    const plots = communityGardenModel.listPlotStatuses(state.garden, now);
    const left = parkPosition.x - 53;
    const top = parkPosition.y + 34;
    ctx.save();
    ctx.fillStyle = "#8caa72";
    roundedRectPath(ctx, left, top, 106, 38, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(46,75,47,.65)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const plot of plots) {
      const x = parkPosition.x + (plot.id - 1) * 35;
      const y = top + 7;
      ctx.fillStyle = "rgba(29,36,27,.22)";
      roundedRectPath(ctx, x - 15, y + 2, 30, 22, 3);
      ctx.fill();
      ctx.fillStyle = "#967455";
      roundedRectPath(ctx, x - 15, y, 30, 21, 3);
      ctx.fill();
      ctx.fillStyle = plot.status === "empty" ? "#594331" : "#67472f";
      roundedRectPath(ctx, x - 11, y + 3, 22, 15, 2);
      ctx.fill();
      if (plot.status !== "empty") {
        const cropColor = plot.status === "ready"
          ? ({ radish:"#f0e4d1", tomato:"#c95543", "sweet-potato":"#c27b45" }[plot.cropId] || "#dfbb68")
          : "#739b55";
        ctx.strokeStyle = "#56834c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 15);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
        ctx.fillStyle = cropColor;
        ctx.beginPath();
        ctx.ellipse(x - 3, y + 8, 4, 2.4, -.45, 0, Math.PI * 2);
        ctx.ellipse(x + 3, y + 8, 4, 2.4, .45, 0, Math.PI * 2);
        ctx.fill();
        if (plot.status === "ready") {
          ctx.beginPath();
          ctx.arc(x, y + 13, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawParkFishingPond(parkPosition) {
    const x = parkPosition.x + 69;
    const y = parkPosition.y - 43;
    ctx.save();
    ctx.fillStyle = "rgba(37,54,45,.22)";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, 38, 25, -.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b6a77b";
    ctx.beginPath();
    ctx.ellipse(x, y, 38, 25, -.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#71845f";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#4f8585";
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 31, 18, -.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(218,237,218,.48)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(x - 4, y - 1, 15, 6, -.12, .35, 2.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 3, 8, 3, -.12, .2, 2.5);
    ctx.stroke();
    // A short timber landing makes the fishing position legible at a glance.
    ctx.fillStyle = "#80694c";
    roundedRectPath(ctx, x + 27, y - 6, 17, 7, 2);
    ctx.fill();
    ctx.strokeStyle = "#b49a70";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 31, y - 5);
    ctx.lineTo(x + 31, y);
    ctx.moveTo(x + 39, y - 5);
    ctx.lineTo(x + 39, y);
    ctx.stroke();
    ctx.fillStyle = "#f0e7cf";
    ctx.font = "700 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("釣り場", x, y + 35);
    ctx.restore();
  }

  function drawPlace(place) {
    const building = place.building;
    const visualX = building?.x ?? place.x;
    const visualY = building?.y ?? place.y;
    const p = worldToScreen(visualX, visualY);
    const entry = worldToScreen(place.x, place.y);
    const visualOffscreen = p.x < -360 || p.y < -360 || p.x > viewWidth + 360 || p.y > viewHeight + 360;
    const entryOffscreen = entry.x < -80 || entry.y < -80 || entry.x > viewWidth + 80 || entry.y > viewHeight + 80;
    if (visualOffscreen && entryOffscreen) return;

    if (building) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(42,48,45,.2)";
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(entry.x, entry.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = "#aaa9a1";
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(entry.x, entry.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }

    if (place.id === "park") {
      ctx.fillStyle = "#b9b18f";
      roundedRectPath(ctx, p.x - 48, p.y - 24, 96, 48, 9);
      ctx.fill();
      ctx.fillStyle = "#4f6d50";
      ctx.font = "800 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("中央公園", p.x, p.y + 4);
      drawParkFishingPond(p);
      drawCommunityGardenBeds(p);
      drawTree(place.x - 70, place.y - 10, .78);
      drawTree(place.x + 72, place.y - 18, .72);
    } else if (place.id === "home") {
      const homeW = building?.w || 118;
      const homeH = building?.h || 96;
      const homeVisual = {
        x:(building?.x ?? place.x) - homeW / 2,
        y:(building?.y ?? place.y) - homeH / 2,
        w:homeW,
        h:homeH,
        floors:2,
        houseStyle:"detached",
        frontage:"south",
        residentialSeed:7301
      };
      drawResidentialBuilding(
        homeVisual,
        p.x - homeW / 2,
        p.y - homeH / 2,
        { wall:"#d0b68f", roof:"#6d655c", glass:"#8fa8ad", trim:"#a07e5b" },
        visualTime()
      );

      // A compact porch identifies the enterable house without making its
      // footprint visually larger than the neighboring detached homes.
      const porchW = Math.min(34, homeW * .28);
      ctx.fillStyle = "#8c785f";
      roundedRectPath(ctx, p.x - porchW / 2, p.y + homeH * .34, porchW, 8, 2);
      ctx.fill();
      ctx.fillStyle = "#d8c39d";
      ctx.fillRect(p.x - 4, p.y + homeH * .28, 8, 15);
    } else if (place.id === "cafe") {
      drawFacilityBuilding(p, building?.w || 300, building?.h || 270, "#b77a64", "#604f48", "#89a5a9");
      ctx.fillStyle = "#f1d4b0";
      ctx.fillRect(p.x - 112, p.y - 18, 224, 20);
      for (let i = -5; i <= 5; i += 1) {
        ctx.fillStyle = i % 2 ? "#ad5c54" : "#eee1ca";
        ctx.fillRect(p.x + i * 20 - 10, p.y + 3, 20, 25);
      }
      ctx.fillStyle = "#352c29";
      ctx.font = "700 17px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("LUNE", p.x, p.y - 35);
    } else if (place.id === "store") {
      drawFacilityBuilding(p, building?.w || 320, building?.h || 260, "#6f9a82", "#455e55", "#a8c3c4");
      ctx.fillStyle = "#e7ede5";
      ctx.fillRect(p.x - 125, p.y - 55, 250, 32);
      ctx.fillStyle = "#487660";
      ctx.font = "800 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("MARCHÉ", p.x, p.y - 33);
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      for (let i = -2; i <= 2; i += 1) {
        ctx.strokeRect(p.x + i * 45 - 16, p.y + 106, 32, 52);
      }
    } else if (place.id === "gym") {
      drawFacilityBuilding(p, building?.w || 305, building?.h || 265, "#718ead", "#465b70", "#8faebb");
      ctx.fillStyle = "#e3ebee";
      ctx.fillRect(p.x - 118, p.y - 54, 236, 30);
      ctx.fillStyle = "#49657f";
      ctx.font = "800 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("CITY GYM", p.x, p.y - 33);
      ctx.strokeStyle = "#d7e0e3";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x - 28, p.y + 18); ctx.lineTo(p.x + 28, p.y + 18);
      ctx.moveTo(p.x - 35, p.y + 10); ctx.lineTo(p.x - 35, p.y + 26);
      ctx.moveTo(p.x + 35, p.y + 10); ctx.lineTo(p.x + 35, p.y + 26);
      ctx.stroke();
    } else if (place.id === "library") {
      drawFacilityBuilding(p, building?.w || 310, building?.h || 275, "#9d91b4", "#5d5868", "#9eb2bb");
      ctx.fillStyle = "#e3dced";
      ctx.fillRect(p.x - 125, p.y - 62, 250, 28);
      ctx.fillStyle = "#5e566c";
      ctx.font = "700 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("CITY LIBRARY", p.x, p.y - 43);
      ctx.fillStyle = "#ddd9cf";
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(p.x + i * 47 - 5, p.y + 12, 10, 79);
    } else if (place.id === "community-center") {
      drawFacilityBuilding(p, building?.w || 320, building?.h || 280, "#d8c59e", "#6f6958", "#9bb7b5");
      ctx.fillStyle = "#efe4c9";
      roundedRectPath(ctx, p.x - 124, p.y - 60, 248, 34, 4);
      ctx.fill();
      ctx.fillStyle = "#5c5648";
      ctx.font = "800 15px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉コミュニティセンター", p.x, p.y - 38);
      ctx.fillStyle = "#a67f4c";
      ctx.fillRect(p.x - 98, p.y + 4, 196, 6);
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillStyle = i === 0 ? "#715b43" : "#e4d7b9";
        ctx.fillRect(p.x + i * 38 - 12, p.y + 35, 24, 56);
      }
    } else if (place.id === "fuel-station") {
      drawFacilityBuilding(p, building?.w || 340, building?.h || 290, "#e0dfd3", "#59655f", "#9ab7bb");
      ctx.fillStyle = "#f2eee1";
      roundedRectPath(ctx, p.x - 108, p.y - 72, 216, 38, 5);
      ctx.fill();
      ctx.fillStyle = "#3f6251";
      ctx.font = "800 20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉石油", p.x, p.y - 46);
      ctx.fillStyle = "#d7d9ce";
      roundedRectPath(ctx, p.x - 156, p.y + 82, 312, 76, 6);
      ctx.fill();
      ctx.fillStyle = "#d94e3f";
      ctx.fillRect(p.x - 156, p.y + 82, 312, 12);
      ctx.fillStyle = "#35433d";
      ctx.fillRect(p.x - 160, p.y + 150, 320, 10);
      for (const pumpX of [-96, 0, 96]) {
        ctx.fillStyle = "#697d78";
        roundedRectPath(ctx, p.x + pumpX - 20, p.y + 105, 40, 42, 5);
        ctx.fill();
        ctx.fillStyle = "#f3f1e7";
        ctx.fillRect(p.x + pumpX - 13, p.y + 111, 26, 13);
        ctx.strokeStyle = "#343e39";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x + pumpX + 17, p.y + 115);
        ctx.bezierCurveTo(p.x + pumpX + 34, p.y + 124, p.x + pumpX + 28, p.y + 145, p.x + pumpX + 18, p.y + 145);
        ctx.stroke();
      }
      ctx.fillStyle = "#f6f3e8";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.fillText("給油", p.x, p.y + 177);
    } else if (place.id === "delivery-depot") {
      drawFacilityBuilding(p, building?.w || 320, building?.h || 270, "#d7c99f", "#665b46", "#9bb5b4");
      ctx.fillStyle = "#f4ebd0";
      roundedRectPath(ctx, p.x - 133, p.y - 76, 266, 40, 5);
      ctx.fill();
      ctx.fillStyle = "#4d5948";
      ctx.font = "800 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉便", p.x, p.y - 50);
      ctx.fillStyle = "#78694c";
      ctx.fillRect(p.x - 100, p.y + 4, 200, 6);
      ctx.fillStyle = "#eee4cd";
      ctx.fillRect(p.x - 72, p.y + 38, 144, 51);
      ctx.strokeStyle = "#645c4b";
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 72, p.y + 38, 144, 51);
      for (const parcelX of [-42, 0, 42]) {
        ctx.fillStyle = parcelX === 0 ? "#c69a5c" : "#d5ad70";
        ctx.fillRect(p.x + parcelX - 13, p.y + 51, 26, 25);
        ctx.strokeStyle = "#8f7049";
        ctx.strokeRect(p.x + parcelX - 13, p.y + 51, 26, 25);
      }
      ctx.fillStyle = "#f5f0df";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.fillText("配達受付", p.x, p.y + 111);
    } else if (place.id === "public-bath") {
      drawFacilityBuilding(p, building?.w || 340, building?.h || 290, "#91b3a6", "#4e5e55", "#a7c6c2");
      ctx.fillStyle = "#5a5147";
      ctx.beginPath();
      ctx.moveTo(p.x - 150, p.y - 106);
      ctx.lineTo(p.x - 112, p.y - 144);
      ctx.lineTo(p.x + 112, p.y - 144);
      ctx.lineTo(p.x + 150, p.y - 106);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#85725d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x - 132, p.y - 116);
      ctx.lineTo(p.x + 132, p.y - 116);
      ctx.stroke();
      ctx.fillStyle = "#f1e6cd";
      roundedRectPath(ctx, p.x - 98, p.y - 88, 196, 34, 4);
      ctx.fill();
      ctx.fillStyle = "#314f49";
      ctx.font = "800 19px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉湯", p.x, p.y - 64);
      // のれん panels hang above the entrance.
      const norenColors = ["#315b5b", "#416b68", "#315b5b", "#416b68", "#315b5b"];
      norenColors.forEach((color, index) => {
        const panelX = p.x - 62 + index * 25;
        ctx.fillStyle = color;
        ctx.fillRect(panelX, p.y + 4, 24, 50);
        ctx.fillStyle = "rgba(244,235,215,.75)";
        ctx.fillRect(panelX + 3, p.y + 50, 18, 4);
      });
      ctx.fillStyle = "#f2e8d4";
      ctx.font = "700 13px serif";
      ctx.fillText("ゆ", p.x, p.y + 38);
      ctx.fillStyle = "#45524d";
      ctx.fillRect(p.x - 90, p.y + 83, 180, 8);
      ctx.fillStyle = "#d7c39f";
      ctx.fillRect(p.x - 130, p.y + 97, 260, 12);
      for (let index = 0; index < 3; index += 1) {
        const steamX = p.x + 98 + index * 13;
        ctx.strokeStyle = "rgba(241,244,232,.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(steamX, p.y - 150);
        ctx.bezierCurveTo(steamX - 8, p.y - 164, steamX + 8, p.y - 172, steamX, p.y - 184);
        ctx.stroke();
      }
    } else if (place.id === "clinic") {
      drawFacilityBuilding(p, building?.w || 300, building?.h || 260, "#dce6d9", "#657365", "#9ab8bd");
      ctx.fillStyle = "#f4f3e8";
      roundedRectPath(ctx, p.x - 121, p.y - 66, 242, 42, 5);
      ctx.fill();
      ctx.fillStyle = "#415e52";
      ctx.font = "800 17px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉診療所", p.x, p.y - 39);
      ctx.fillStyle = "#b74b45";
      roundedRectPath(ctx, p.x + 82, p.y - 111, 58, 48, 5);
      ctx.fill();
      ctx.fillStyle = "#fff8ec";
      ctx.fillRect(p.x + 105, p.y - 102, 12, 30);
      ctx.fillRect(p.x + 96, p.y - 93, 30, 12);
      ctx.fillStyle = "#eaf0e9";
      ctx.fillRect(p.x - 88, p.y + 23, 48, 61);
      ctx.fillRect(p.x + 40, p.y + 23, 48, 61);
      ctx.fillStyle = "#7e9da0";
      ctx.fillRect(p.x - 82, p.y + 29, 36, 49);
      ctx.fillRect(p.x + 46, p.y + 29, 36, 49);
      ctx.fillStyle = "#4d6055";
      ctx.fillRect(p.x - 19, p.y + 17, 38, 74);
    }

    ctx.fillStyle = "rgba(18,24,21,.76)";
    roundedRectPath(ctx, p.x - 72, p.y - 179, 144, 24, 8);
    ctx.fill();
    ctx.fillStyle = "#f5f7f5";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(place.name, p.x, p.y - 163);

    ctx.fillStyle = "#f7f8f7";
    ctx.beginPath();
    ctx.arc(entry.x, entry.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#26312b";
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.fillText(place.symbol, entry.x, entry.y + 4);
  }

  function characterLodAtScreen(p, scale) {
    if (scale < .9) return "mid";
    const centerDistance = Math.hypot(p.x - viewWidth / 2, p.y - viewHeight / 2);
    const farThreshold = Math.max(viewWidth, viewHeight) * .56;
    return centerDistance > farThreshold ? "mid" : "near";
  }

  function drawPerson(
    x,
    y,
    dir,
    shirt,
    pants,
    hair,
    skin,
    phase,
    scale = 1,
    appearance = null,
    visualState = "walk"
  ) {
    const p = worldToScreen(x, y);
    if (p.x < -70 || p.y < -100 || p.x > viewWidth + 70 || p.y > viewHeight + 100) return;

    const resolvedAppearance = appearance || characterRenderer.createAppearance(
      Math.round(x * 7 + y * 13),
      {}
    );
    characterRenderer.draw(ctx, {
      x:p.x,
      y:p.y,
      direction:dir,
      phase,
      scale,
      appearance:resolvedAppearance,
      state:visualState,
      lod:characterLodAtScreen(p, scale),
      timeMs:performance.now()
    });
  }

  function syncNamedNpcCitizens() {
    for (const npc of NPCS) {
      const citizen = pedestrians.find((ped) => ped.specialNpcId === npc.id);
      if (!citizen) continue;
      npc.x = citizen.x;
      npc.y = citizen.y;
      npc.dir = citizen.dir;
      npc.hidden = citizen.state === "inside" || !citizen.visible;
      npc.activityLabel = citizen.currentActivityLabel
        || citizen.pendingActivity?.label
        || (citizen.state === "waiting" ? "信号待ち" : "移動中");
      npc.citizenId = citizen.id;
      npc.appearance = citizen.appearance;
      npc.pants = citizen.pants;
      npc.hair = citizen.hair;
      npc.skin = citizen.skin;
      npc.phase = citizen.phase;
      npc.state = citizen.state;
      npc.speed = citizen.speed;
    }
  }

  function drawNpc(npc) {
    if (npc.hidden) return;
    drawPerson(
      npc.x,
      npc.y,
      npc.dir ?? -Math.PI / 2,
      npc.color,
      npc.pants || "#394248",
      npc.hair || "#3c2d25",
      npc.skin || "#e7b28f",
      npc.phase ?? performance.now() * .004,
      1.02,
      npc.appearance,
      npc.state || "idle"
    );
    const p = worldToScreen(npc.x, npc.y);
    if (p.x < -40 || p.y < -40 || p.x > viewWidth + 40 || p.y > viewHeight + 40) return;
    ctx.fillStyle = "rgba(12,18,15,.76)";
    roundedRectPath(ctx, p.x - 39, p.y - 78, 78, 20, 8);
    ctx.fill();
    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.arc(p.x - 29, p.y - 68, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f6f5";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("…", p.x - 29, p.y - 64.5);
    ctx.textAlign = "left";
    ctx.fillText(npc.name, p.x - 20, p.y - 64);
  }

  function drawPedestrians() {
    for (const ped of pedestrians) {
      if (!ped.visible || ped.specialNpcId) continue;
      drawPerson(
        ped.x,
        ped.y,
        ped.dir,
        ped.color,
        ped.pants,
        ped.hair,
        ped.skin,
        ped.phase,
        .98,
        ped.appearance,
        ped.state
      );
    }
  }

  function drawCar(car, owned = false) {
    const p = worldToScreen(car.x, car.y);
    if (p.x < -110 || p.y < -110 || p.x > viewWidth + 110 || p.y > viewHeight + 110) return;
    const dims = vehicleDimensions(car, owned);
    const type = dims.type;
    const length = dims.length;
    const width = dims.width;
    const lift = type === "suv" || type === "van" ? 5 : 4;
    const braking = owned
      ? (state.player.inVehicle && (touch.driveBrake || keys.has("s") || keys.has("arrowdown") || keys.has(" ")))
      : Boolean(car.brakeGlow > .15);
    const turnSignalTime = performance.now();
    const turnSignal = owned ? null : car.overtakePlan
      ? trafficOvertake.signalFor(car.overtakePlan, turnSignalTime)
      : trafficIntersectionSignal(car, turnSignalTime);

    const time = visualTime();
    ctx.save();
    ctx.translate(p.x + 3 + time.shadowX * .06, p.y + 6 + time.shadowY * .05);
    ctx.rotate(car.angle);
    ctx.fillStyle = "rgba(10,15,14," + (0.22 + time.night * .04).toFixed(2) + ")";
    roundedRectPath(ctx, -length / 2, -width / 2, length, width, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y - lift);
    ctx.rotate(car.angle);

    if (time.night > .4) {
      const beam = ctx.createLinearGradient(length * .25, 0, length * 1.7, 0);
      beam.addColorStop(0, "rgba(255,240,184," + (.13 * time.night).toFixed(2) + ")");
      beam.addColorStop(1, "rgba(255,240,184,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(length / 2 - 3, -width * .3);
      ctx.lineTo(length * 1.7, -width * .75);
      ctx.lineTo(length * 1.7, width * .75);
      ctx.lineTo(length / 2 - 3, width * .3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#252b2b";
    roundedRectPath(ctx, -length / 2, -width / 2 + 4, length, width, type === "van" ? 7 : 11);
    ctx.fill();

    ctx.fillStyle = "#15191a";
    ctx.fillRect(-length * .31, -width / 2 - 3, 14, 5);
    ctx.fillRect(length * .13, -width / 2 - 3, 14, 5);
    ctx.fillRect(-length * .31, width / 2 - 2, 14, 5);
    ctx.fillRect(length * .13, width / 2 - 2, 14, 5);

    ctx.fillStyle = car.color;
    roundedRectPath(ctx, -length / 2, -width / 2, length, width - 4, type === "van" ? 7 : 11);
    ctx.fill();

    // Lower body shade and a narrow hood highlight make the vehicle read as a
    // rounded object while keeping the existing stylised top-down language.
    const bodyShade = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    bodyShade.addColorStop(0, "rgba(255,255,255,.12)");
    bodyShade.addColorStop(.46, "rgba(255,255,255,0)");
    bodyShade.addColorStop(1, "rgba(14,19,19,.22)");
    ctx.fillStyle = bodyShade;
    roundedRectPath(ctx, -length / 2 + 2, -width / 2 + 2, length - 4, width - 8, type === "van" ? 6 : 10);
    ctx.fill();

    ctx.strokeStyle = "rgba(24,31,31,.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-length * .05, -width * .42);
    ctx.lineTo(-length * .05, width * .34);
    ctx.moveTo(length * .30, -width * .38);
    ctx.lineTo(length * .30, width * .30);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.17)";
    roundedRectPath(ctx, -length / 2 + 5, -width / 2 + 4, length - 10, 7, 4);
    ctx.fill();

    const cabinStart = type === "van" ? -length * .18 : -length * .12;
    const cabinLength = type === "compact" ? length * .46 : length * .42;
    ctx.save();
    ctx.translate(0, -2.5);
    ctx.fillStyle = "#26363b";
    roundedRectPath(ctx, cabinStart, -width * .36, cabinLength, width * .68, 6);
    ctx.fill();
    ctx.fillStyle = "#91adb5";
    roundedRectPath(ctx, cabinStart + 3, -width * .3, cabinLength * .43, width * .55, 3);
    ctx.fill();
    ctx.fillStyle = "#7899a3";
    roundedRectPath(ctx, cabinStart + cabinLength * .52, -width * .3, cabinLength * .41, width * .55, 3);
    ctx.fill();

    // Windshield/roof reflection shifts with daylight.
    const glassSheen = ctx.createLinearGradient(cabinStart, -width * .3, cabinStart + cabinLength, width * .3);
    glassSheen.addColorStop(0, "rgba(255,255,255,.20)");
    glassSheen.addColorStop(.48, "rgba(255,255,255,.03)");
    glassSheen.addColorStop(1, "rgba(210,232,237,.13)");
    ctx.fillStyle = glassSheen;
    roundedRectPath(ctx, cabinStart + 2, -width * .28, cabinLength - 4, width * .18, 2);
    ctx.fill();
    ctx.restore();

    // Side mirrors.
    ctx.fillStyle = car.color;
    roundedRectPath(ctx, length * .08, -width / 2 - 4, 9, 5, 2);
    ctx.fill();
    roundedRectPath(ctx, length * .08, width / 2 - 1, 9, 5, 2);
    ctx.fill();

    // Wheel hubs make the tire silhouettes less blocky.
    ctx.fillStyle = "#89908d";
    for (const wx of [-length * .23, length * .23]) {
      ctx.beginPath();
      ctx.arc(wx, -width / 2 - 1, 2.2, 0, Math.PI * 2);
      ctx.arc(wx, width / 2 - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#eee6c5";
    ctx.fillRect(length / 2 - 7, -width * .32, 5, 8);
    ctx.fillRect(length / 2 - 7, width * .32 - 10, 5, 8);
    ctx.fillStyle = braking ? "#ff4d44" : "#a84843";
    ctx.fillRect(-length / 2 + 2, -width * .32, 5, 8);
    ctx.fillRect(-length / 2 + 2, width * .32 - 10, 5, 8);

    if (braking) {
      ctx.fillStyle = "rgba(255,72,58,.15)";
      ctx.fillRect(-length / 2 - 12, -width / 2, 14, width - 4);
    }

    // Tiny Japanese-style plates front and rear.
    ctx.fillStyle = "#e7eee7";
    ctx.fillRect(length / 2 - 5, -4, 3, 8);
    ctx.fillRect(-length / 2 + 2, -4, 3, 8);
    ctx.fillStyle = "rgba(54,73,61,.7)";
    ctx.fillRect(length / 2 - 4.5, -2, 1.5, 4);
    ctx.fillRect(-length / 2 + 2.5, -2, 1.5, 4);

    if (turnSignal) trafficOvertake.drawSignal(ctx, length, width, turnSignal);

    if (owned) {
      ctx.strokeStyle = "rgba(233,244,249,.82)";
      ctx.lineWidth = 1.5;
      roundedRectPath(ctx, -length / 2 - 3, -width / 2 - 3, length + 6, width + 2, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (state.player.inVehicle || state.player.inTrain) return;
    const dir = Math.atan2(state.player.facingY, state.player.facingX);
    const moving = keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d") || Math.abs(touch.x) > .08 || Math.abs(touch.y) > .08;
    const phase = moving ? performance.now() * .009 : 0;
    drawPerson(
      state.player.x,
      state.player.y,
      dir,
      "#405c50",
      "#313b42",
      "#332a24",
      "#edbea0",
      phase,
      1.08,
      playerAppearance(),
      moving ? "walk" : "idle"
    );
    if (isPlayerUsingUmbrella()) drawPlayerUmbrella();
  }

  function drawPetFollower() {
    if (!state.petWalk.active || state.player.inHome || state.player.inVehicle || state.player.inTrain) return;
    const dogScreen = worldToScreen(state.petWalk.petX, state.petWalk.petY);
    const playerScreen = worldToScreen(state.player.x, state.player.y);
    const x = dogScreen.x;
    const y = dogScreen.y;
    const leashX = playerScreen.x - x;
    const leashY = playerScreen.y - y;
    ctx.save();
    ctx.strokeStyle = "rgba(238,224,193,.88)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + leashX * .55, y + leashY * .55 - 2);
    ctx.lineTo(playerScreen.x, playerScreen.y - 24);
    ctx.stroke();
    ctx.translate(x, y);
    ctx.rotate(state.petWalk.facing);
    ctx.fillStyle = "#74533a";
    ctx.beginPath();
    ctx.ellipse(-1, 1, 13, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#513a2b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, 4); ctx.lineTo(-10, 10);
    ctx.moveTo(-2, 5); ctx.lineTo(-2, 11);
    ctx.moveTo(7, 4); ctx.lineTo(8, 10);
    ctx.stroke();
    ctx.strokeStyle = "#74533a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -1); ctx.quadraticCurveTo(-18, -7, -17, -10);
    ctx.stroke();
    ctx.strokeStyle = "#67aeb0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(5, -4); ctx.lineTo(11, -4);
    ctx.stroke();
    ctx.fillStyle = "#c99466";
    ctx.beginPath();
    ctx.arc(11, -3, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#74533a";
    ctx.beginPath();
    ctx.ellipse(8, -8, 2.3, 4, -.35, 0, Math.PI * 2);
    ctx.ellipse(14, -8, 2.3, 4, .35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ead6bd";
    ctx.beginPath();
    ctx.ellipse(16, -1, 3.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#332a24";
    ctx.beginPath();
    ctx.arc(17, -2, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayerUmbrella() {
    umbrellaDrawCount += 1;
    const screen = worldToScreen(state.player.x, state.player.y);
    ctx.save();
    ctx.translate(screen.x, screen.y - 39);
    ctx.fillStyle = "#4b93b8";
    ctx.beginPath();
    ctx.moveTo(-17, 1);
    ctx.quadraticCurveTo(0, -19, 17, 1);
    ctx.quadraticCurveTo(11, -1, 6, 2);
    ctx.quadraticCurveTo(0, -1, -6, 2);
    ctx.quadraticCurveTo(-11, -1, -17, 1);
    ctx.fill();
    ctx.strokeStyle = "#dcecf1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 17);
    ctx.quadraticCurveTo(0, 21, 4, 19);
    ctx.stroke();
    ctx.restore();
  }

  function homeInteriorViewport() {
    const fitScale = Math.min(
      viewWidth / HOME_INTERIOR.width,
      viewHeight / HOME_INTERIOR.height
    );
    const scale = Math.max(1, fitScale);
    const roomWidth = HOME_INTERIOR.width * scale;
    const roomHeight = HOME_INTERIOR.height * scale;
    const centeredX = viewWidth / 2 - state.player.homeX * scale;
    const centeredY = viewHeight / 2 - state.player.homeY * scale;
    return {
      scale,
      x:roomWidth <= viewWidth
        ? (viewWidth - roomWidth) / 2
        : clamp(centeredX, viewWidth - roomWidth, 0),
      y:roomHeight <= viewHeight
        ? (viewHeight - roomHeight) / 2
        : clamp(centeredY, viewHeight - roomHeight, 0)
    };
  }

  function homeToScreen(x, y) {
    const viewport = homeInteriorViewport();
    return {
      x:viewport.x + x * viewport.scale,
      y:viewport.y + y * viewport.scale,
      scale:viewport.scale
    };
  }

  function drawHomeFurnitureRect(x, y, w, h, fill, radius = 8) {
    const a = homeToScreen(x, y);
    const viewport = homeInteriorViewport();
    ctx.fillStyle = "rgba(24,27,25,.18)";
    roundedRectPath(ctx, a.x + 4 * viewport.scale, a.y + 6 * viewport.scale, w * viewport.scale, h * viewport.scale, radius * viewport.scale);
    ctx.fill();
    ctx.fillStyle = fill;
    roundedRectPath(ctx, a.x, a.y, w * viewport.scale, h * viewport.scale, radius * viewport.scale);
    ctx.fill();
  }

  function drawHomePet(pet) {
    if (!pet) return;
    const species = petCompanionModel.SPECIES[pet.speciesId] || petCompanionModel.SPECIES.dog;
    const center = homeToScreen(585, 222);
    const s = center.scale;
    const fur = species.color || "#c99463";
    // A soft mat and bowls make the pet's home position legible at every zoom.
    ctx.fillStyle = "#bba78d";
    ctx.beginPath(); ctx.ellipse(center.x, center.y + 17*s, 49*s, 22*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#e5ded0";
    ctx.beginPath(); ctx.ellipse(center.x, center.y + 14*s, 43*s, 17*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(center.x, center.y, 22*s, 18*s, 0, 0, Math.PI*2); ctx.fill();
    if (pet.speciesId === "cat") {
      ctx.beginPath(); ctx.moveTo(center.x-17*s,center.y-8*s); ctx.lineTo(center.x-14*s,center.y-28*s); ctx.lineTo(center.x-2*s,center.y-17*s);
      ctx.moveTo(center.x+17*s,center.y-8*s); ctx.lineTo(center.x+14*s,center.y-28*s); ctx.lineTo(center.x+2*s,center.y-17*s); ctx.fill();
    } else {
      ctx.fillStyle = "#8b644e";
      ctx.beginPath(); ctx.ellipse(center.x-20*s,center.y-3*s,7*s,13*s,-.35,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(center.x+20*s,center.y-3*s,7*s,13*s,.35,0,Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.arc(center.x,center.y-7*s,15*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#232522";
    for (const dx of [-5,5]) { ctx.beginPath(); ctx.arc(center.x+dx*s,center.y-9*s,1.6*s,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle = "#6a5145";
    ctx.beginPath(); ctx.arc(center.x,center.y-3*s,2*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#f0eee7";
    ctx.beginPath(); ctx.ellipse(center.x+35*s,center.y+13*s,10*s,6*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#80a5a0";
    ctx.beginPath(); ctx.ellipse(center.x+35*s,center.y+12*s,6*s,3*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#55483b";
    ctx.font = "700 " + Math.max(8,10*s) + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(pet.name || "ペット"),center.x,center.y+44*s);
  }

  function drawHomeInterior() {
    const viewport = homeInteriorViewport();
    const ox = viewport.x;
    const oy = viewport.y;
    const s = viewport.scale;
    const w = HOME_INTERIOR.width * s;
    const h = HOME_INTERIOR.height * s;

    // Background outside the apartment.
    ctx.fillStyle = "#202725";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Apartment drop shadow and timber floor.
    ctx.fillStyle = "rgba(0,0,0,.28)";
    roundedRectPath(ctx, ox + 12, oy + 15, w, h, 18 * s);
    ctx.fill();

    const floor = ctx.createLinearGradient(ox, oy, ox, oy + h);
    floor.addColorStop(0, "#d5c3a3");
    floor.addColorStop(1, "#c7b28e");
    ctx.fillStyle = floor;
    roundedRectPath(ctx, ox, oy, w, h, 16 * s);
    ctx.fill();

    // Floor boards.
    ctx.strokeStyle = "rgba(105,79,50,.12)";
    ctx.lineWidth = Math.max(1, s);
    for (let y = 48; y < HOME_INTERIOR.height - 30; y += 34) {
      const a = homeToScreen(30, y);
      const b = homeToScreen(HOME_INTERIOR.width - 30, y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Walls and room dividers, with generous openings for movement.
    ctx.strokeStyle = "#eee7da";
    ctx.lineWidth = 18 * s;
    ctx.lineCap = "square";
    roundedRectPath(ctx, ox + 9 * s, oy + 9 * s, w - 18 * s, h - 18 * s, 10 * s);
    ctx.stroke();

    ctx.lineWidth = 10 * s;
    const dividerA1 = homeToScreen(294, 30);
    const dividerA2 = homeToScreen(294, 205);
    ctx.beginPath();
    ctx.moveTo(dividerA1.x, dividerA1.y);
    ctx.lineTo(dividerA2.x, dividerA2.y);
    ctx.stroke();

    const dividerB1 = homeToScreen(250, 268);
    const dividerB2 = homeToScreen(250, 445);
    ctx.beginPath();
    ctx.moveTo(dividerB1.x, dividerB1.y);
    ctx.lineTo(dividerB2.x, dividerB2.y);
    ctx.stroke();

    // Rugs define living/dining zones.
    const rug = homeToScreen(454, 265);
    ctx.fillStyle = "#a98e72";
    roundedRectPath(ctx, rug.x, rug.y, 266 * s, 165 * s, 15 * s);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 2 * s;
    roundedRectPath(ctx, rug.x + 8*s, rug.y + 8*s, 250*s, 149*s, 11*s);
    ctx.stroke();

    // Bed.
    drawHomeFurnitureRect(62, 60, 190, 112, "#d8ddd7", 12);
    let p = homeToScreen(70, 68);
    ctx.fillStyle = "#f0eee7";
    roundedRectPath(ctx, p.x, p.y, 174*s, 38*s, 8*s);
    ctx.fill();
    ctx.fillStyle = "#7891a2";
    roundedRectPath(ctx, p.x, p.y + 42*s, 174*s, 58*s, 7*s);
    ctx.fill();

    // Shower / bathroom.
    drawHomeFurnitureRect(70, 318, 118, 118, "#d9e1df", 10);
    p = homeToScreen(84, 332);
    ctx.fillStyle = "#9fbfc5";
    roundedRectPath(ctx, p.x, p.y, 90*s, 90*s, 8*s);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 2*s;
    ctx.beginPath();
    ctx.arc(p.x + 45*s, p.y + 45*s, 18*s, 0, Math.PI*2);
    ctx.stroke();

    // Kitchen counter, sink and cooktop.
    drawHomeFurnitureRect(510, 55, 205, 82, "#9b8b74", 8);
    p = homeToScreen(525, 67);
    ctx.fillStyle = "#d6d8d2";
    roundedRectPath(ctx, p.x, p.y, 58*s, 42*s, 5*s);
    ctx.fill();
    ctx.strokeStyle = "#6c7472";
    ctx.lineWidth = 2*s;
    ctx.stroke();
    ctx.fillStyle = "#333837";
    for (const dx of [104,143]) {
      ctx.beginPath();
      ctx.arc(p.x + dx*s, p.y + 20*s, 11*s, 0, Math.PI*2);
      ctx.fill();
    }

    // Dining table.
    drawHomeFurnitureRect(326, 88, 128, 78, "#9b7657", 10);
    p = homeToScreen(348, 106);
    ctx.fillStyle = "rgba(255,245,224,.72)";
    ctx.beginPath();
    ctx.arc(p.x + 42*s, p.y + 21*s, 13*s, 0, Math.PI*2);
    ctx.fill();

    // Small home worktable and sewing machine.
    drawHomeFurnitureRect(176, 194, 104, 62, "#8d6749", 7);
    p = homeToScreen(191, 207);
    ctx.fillStyle = "#d7ddd7";
    roundedRectPath(ctx, p.x, p.y, 40*s, 29*s, 4*s);
    ctx.fill();
    ctx.fillStyle = "#5a655f";
    ctx.fillRect(p.x + 26*s, p.y + 4*s, 3*s, 22*s);
    ctx.fillRect(p.x + 18*s, p.y + 25*s, 28*s, 3*s);
    ctx.strokeStyle = "#eee4cd";
    ctx.lineWidth = 2*s;
    ctx.strokeRect(p.x + 58*s, p.y + 10*s, 25*s, 17*s);
    ctx.strokeStyle = "#a64d62";
    ctx.beginPath();
    ctx.moveTo(p.x + 60*s, p.y + 24*s);
    ctx.lineTo(p.x + 80*s, p.y + 12*s);
    ctx.stroke();

    // Reachable double-door closet near the entry.
    drawHomeFurnitureRect(42, 182, 112, 78, "#806044", 6);
    p = homeToScreen(51, 190);
    ctx.fillStyle = "#a88764";
    roundedRectPath(ctx, p.x, p.y, 46*s, 61*s, 4*s);
    ctx.fill();
    ctx.fillStyle = "#72543c";
    roundedRectPath(ctx, p.x + 50*s, p.y, 46*s, 61*s, 4*s);
    ctx.fill();
    ctx.strokeStyle = "rgba(238,218,185,.6)";
    ctx.lineWidth = 1.5*s;
    ctx.strokeRect(p.x + 4*s, p.y + 4*s, 38*s, 53*s);
    ctx.strokeRect(p.x + 54*s, p.y + 4*s, 38*s, 53*s);
    ctx.fillStyle = "#dfc99d";
    ctx.beginPath();
    ctx.arc(p.x + 39*s, p.y + 32*s, 2*s, 0, Math.PI*2);
    ctx.arc(p.x + 61*s, p.y + 32*s, 2*s, 0, Math.PI*2);
    ctx.fill();

    // Low table.
    drawHomeFurnitureRect(294, 276, 168, 82, "#8f6c50", 12);

    // Sofa.
    drawHomeFurnitureRect(486, 330, 205, 74, "#657f75", 16);
    p = homeToScreen(500, 340);
    ctx.fillStyle = "#78968a";
    roundedRectPath(ctx, p.x, p.y, 177*s, 21*s, 8*s);
    ctx.fill();

    // TV / media unit.
    drawHomeFurnitureRect(520, 438, 155, 24, "#4d504d", 4);
    p = homeToScreen(548, 403);
    ctx.fillStyle = "#263335";
    roundedRectPath(ctx, p.x, p.y, 99*s, 34*s, 5*s);
    ctx.fill();
    const tvProgram = homeTelevisionModel.getProgram(Math.floor(state.minute));
    const tvScreenColors = {
      "overnight-nature":"#435b50",
      "morning-news":"#567687",
      "travel-variety":"#4d7c82",
      "cooking-show":"#9b6947",
      "prime-time-drama":"#5b516e"
    };
    ctx.fillStyle = tvScreenColors[tvProgram?.id] || "#334546";
    roundedRectPath(ctx, p.x + 4*s, p.y + 4*s, 91*s, 26*s, 3*s);
    ctx.fill();
    if (tvProgram) {
      ctx.fillStyle = "rgba(255,248,226,.92)";
      ctx.font = "700 " + Math.max(5, 7*s) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tvProgram.screenTitle, p.x + 49.5*s, p.y + 17*s, 85*s);
      ctx.textBaseline = "alphabetic";
    }

    // Entrance / genkan.
    p = homeToScreen(338, 442);
    ctx.fillStyle = "#aaa69a";
    roundedRectPath(ctx, p.x, p.y, 104*s, 43*s, 5*s);
    ctx.fill();
    ctx.fillStyle = "#5c625e";
    ctx.fillRect(p.x + 17*s, p.y + 31*s, 70*s, 5*s);

    // Small plants/decor.
    for (const plant of [[455,78],[224,397],[713,270]]) {
      const q = homeToScreen(plant[0], plant[1]);
      ctx.fillStyle = "#806b52";
      ctx.fillRect(q.x-6*s, q.y, 12*s, 12*s);
      ctx.fillStyle = "#527657";
      ctx.beginPath();
      ctx.arc(q.x-5*s,q.y-7*s,8*s,0,Math.PI*2);
      ctx.arc(q.x+5*s,q.y-10*s,9*s,0,Math.PI*2);
      ctx.fill();
    }

    // Warm indoor lighting / night response.
    const time = visualTime();
    const light = ctx.createRadialGradient(
      ox + w*.62, oy + h*.42, 20*s,
      ox + w*.62, oy + h*.42, Math.max(w,h)*.62
    );
    light.addColorStop(0, "rgba(255,238,190," + (0.08 + time.night*.16).toFixed(2) + ")");
    light.addColorStop(1, "rgba(255,238,190,0)");
    ctx.fillStyle = light;
    ctx.fillRect(ox, oy, w, h);

    // Interaction labels when the player is close enough.
    const interaction = nearestHomeInteraction();
    if (interaction) {
      const fixture = interaction.target;
      const q = homeToScreen(fixture.interactX, fixture.interactY);
      ctx.fillStyle = "rgba(21,28,25,.78)";
      roundedRectPath(ctx, q.x - 48*s, q.y - 40*s, 96*s, 24*s, 7*s);
      ctx.fill();
      ctx.fillStyle = "#f4f7f5";
      ctx.font = "700 " + Math.max(10, 11*s) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fixture.id === "exit" ? "玄関" : fixture.label, q.x, q.y - 24*s);
    }

    if (state.petCompanion.pet) drawHomePet(state.petCompanion.pet);
    drawHomePlayer();
  }

  function drawHomePlayer() {
    const p = homeToScreen(state.player.homeX, state.player.homeY);
    const dir = Math.atan2(state.player.facingY, state.player.facingX);
    const moving = keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d") ||
      keys.has("arrowup") || keys.has("arrowdown") || keys.has("arrowleft") || keys.has("arrowright") ||
      Math.abs(touch.x) > .08 || Math.abs(touch.y) > .08;
    const phase = moving ? performance.now() * .009 : 0;
    characterRenderer.draw(ctx, {
      x:p.x,
      y:p.y,
      direction:dir,
      phase,
      scale:1.08 * p.scale,
      appearance:playerAppearance(),
      state:moving ? "walk" : "idle",
      lod:characterLodAtScreen(p, p.scale),
      timeMs:performance.now()
    });
  }

  function drawStreetLightsGlow() {
    const time = visualTime();
    if (time.night < .35) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    forEachStreetLamp((wx, wy) => {
      const p = worldToScreen(wx, wy);
      if (p.x < -80 || p.y < -80 || p.x > viewWidth + 80 || p.y > viewHeight + 80) return;
      const glow = ctx.createRadialGradient(p.x, p.y - 24, 1, p.x, p.y - 24, 54);
      glow.addColorStop(0, "rgba(255,220,145," + (0.22 * time.night).toFixed(2) + ")");
      glow.addColorStop(1, "rgba(255,220,145,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 24, 54, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawAtmosphericGrade() {
    const time = visualTime();

    // Soft sunlight from upper-left keeps daytime from looking uniformly flat.
    if (time.daylight > .08) {
      const sunWash = ctx.createLinearGradient(0, 0, viewWidth, viewHeight);
      sunWash.addColorStop(0, "rgba(255,244,216," + (.055 * time.daylight).toFixed(3) + ")");
      sunWash.addColorStop(.55, "rgba(255,255,255,0)");
      sunWash.addColorStop(1, "rgba(88,111,120," + (.025 * time.daylight).toFixed(3) + ")");
      ctx.fillStyle = sunWash;
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }

    // A tiny vertical haze separates near ground from distant city detail and
    // is intentionally weak enough not to wash out road markings.
    const haze = ctx.createLinearGradient(0, 0, 0, viewHeight);
    haze.addColorStop(0, "rgba(214,226,224," + (.028 * time.daylight).toFixed(3) + ")");
    haze.addColorStop(.48, "rgba(214,226,224,0)");
    haze.addColorStop(1, "rgba(16,24,24," + (.018 + time.night * .018).toFixed(3) + ")");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Slight edge falloff improves depth without touching the HUD/minimap.
    const radius = Math.max(viewWidth, viewHeight) * .72;
    const vignette = ctx.createRadialGradient(
      viewWidth * .5, viewHeight * .45, Math.min(viewWidth, viewHeight) * .18,
      viewWidth * .5, viewHeight * .45, radius
    );
    vignette.addColorStop(0, "rgba(9,15,17,0)");
    vignette.addColorStop(1, "rgba(9,15,17," + (0.045 + time.night * .07).toFixed(3) + ")");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  }

  function drawNightOverlay() {
    const time = visualTime();
    const rain = state.visual.weather === "rain" ? .06 : 0;
    const cloud = state.visual.weather === "cloudy" ? .08 : 0;
    const alpha = clamp(time.night * .48 + rain + cloud, 0, .56);
    if (alpha > .01) {
      ctx.fillStyle = "rgba(12,19,31," + alpha.toFixed(3) + ")";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
    if (time.daylight > .2 && time.daylight < .55) {
      const warm = Math.abs(state.minute - 18 * 60) < 160 || Math.abs(state.minute - 6 * 60) < 120;
      if (warm) {
        ctx.fillStyle = "rgba(236,167,104,.045)";
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }
    }
  }

  function drawWeather() {
    const weather = state.visual.weather;
    if (weather === "clear") return;
    if (weather === "cloudy") {
      ctx.fillStyle = "rgba(105,118,121,.07)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
      return;
    }
    if (weather === "rain") {
      ctx.fillStyle = "rgba(53,70,77,.11)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
      ctx.strokeStyle = "rgba(201,221,228,.42)";
      ctx.lineWidth = 1;
      const phase = state.visual.rainPhase;
      for (let i = 0; i < 150; i += 1) {
        const x = ((i * 83 + phase * 290) % (viewWidth + 80)) - 40;
        const y = ((i * 47 + phase * 520) % (viewHeight + 80)) - 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 15);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(190,213,219,.07)";
      for (let i = 0; i < 22; i += 1) {
        const x = (i * 149 + phase * 90) % viewWidth;
        const y = (i * 97 + phase * 55) % viewHeight;
        ctx.beginPath();
        ctx.ellipse(x, y, 18, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawMapModelMinimap(w, h, p, scale) {
    for (const space of mapModel.openSpaces || []) {
      if (!space.polygon?.length) continue;
      mctx.fillStyle =
        space.type === "park" || space.type === "pocket-park" ? "rgba(93,145,91,.42)" :
        space.type === "shrine" ? "rgba(91,122,79,.4)" :
        space.type === "plaza" ? "rgba(181,181,168,.26)" :
        "rgba(143,137,116,.22)";
      mctx.beginPath();
      mctx.moveTo(w / 2 + (space.polygon[0][0] - p.x) * scale, h / 2 + (space.polygon[0][1] - p.y) * scale);
      for (let i = 1; i < space.polygon.length; i += 1) {
        mctx.lineTo(w / 2 + (space.polygon[i][0] - p.x) * scale, h / 2 + (space.polygon[i][1] - p.y) * scale);
      }
      mctx.closePath();
      mctx.fill();
    }

    for (const edge of mapModel.edges) {
      mctx.strokeStyle = edge.vehicle ? "#747d77" : "#6fa078";
      mctx.lineWidth = Math.max(1.5, edge.width * scale * .75);
      mctx.lineCap = "round";
      mctx.lineJoin = "round";
      mctx.beginPath();
      const first = edge.points[0];
      mctx.moveTo(w / 2 + (first.x - p.x) * scale, h / 2 + (first.y - p.y) * scale);
      for (let i = 1; i < edge.points.length; i += 1) {
        const point = edge.points[i];
        mctx.lineTo(w / 2 + (point.x - p.x) * scale, h / 2 + (point.y - p.y) * scale);
      }
      mctx.stroke();
    }
  }

  function drawMinimap() {
    const w = minimap.width;
    const h = minimap.height;
    const p = actorPosition();
    const range = 1500;
    const scale = w / (range * 2);

    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "#101613";
    mctx.fillRect(0, 0, w, h);

    drawMapModelMinimap(w, h, p, scale);

    function dot(wx, wy, color, radius) {
      const x = w / 2 + (wx - p.x) * scale;
      const y = h / 2 + (wy - p.y) * scale;
      if (x < -8 || y < -8 || x > w + 8 || y > h + 8) return;
      mctx.fillStyle = color;
      mctx.beginPath();
      mctx.arc(x, y, radius, 0, Math.PI * 2);
      mctx.fill();
    }

    if (state.player.inVehicle && state.drive.route.length) {
      mctx.save();
      mctx.strokeStyle = "#68c9ff";
      mctx.lineWidth = 3;
      mctx.beginPath();
      mctx.moveTo(w / 2, h / 2);
      for (let i = state.drive.routeIndex; i < state.drive.route.length; i += 1) {
        const point = state.drive.route[i];
        mctx.lineTo(w / 2 + (point.x - p.x) * scale, h / 2 + (point.y - p.y) * scale);
      }
      mctx.stroke();
      mctx.restore();
    }

    const phoneWaypoint = PLACES.find((place) => place.id === state.phone?.waypoint);
    if (phoneWaypoint && !state.player.inVehicle) {
      const wx = w / 2 + (phoneWaypoint.x - p.x) * scale;
      const wy = h / 2 + (phoneWaypoint.y - p.y) * scale;
      mctx.save();
      mctx.strokeStyle = "rgba(10,132,255,.8)";
      mctx.setLineDash([4, 4]);
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.moveTo(w / 2, h / 2);
      mctx.lineTo(wx, wy);
      mctx.stroke();
      mctx.setLineDash([]);
      if (wx >= -8 && wy >= -8 && wx <= w + 8 && wy <= h + 8) {
        mctx.fillStyle = "#0a84ff";
        mctx.beginPath();
        mctx.arc(wx, wy, 5.5, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = "#fff";
        mctx.lineWidth = 1.5;
        mctx.stroke();
      }
      mctx.restore();
    }

    const friendWaypoint = phoneFriendWaypointTarget();
    if (friendWaypoint && !friendWaypoint.hidden && !state.player.inVehicle && !state.player.inTrain && !state.player.inHome) {
      const wx = w / 2 + (friendWaypoint.x - p.x) * scale;
      const wy = h / 2 + (friendWaypoint.y - p.y) * scale;
      mctx.save();
      mctx.strokeStyle = "rgba(232,120,157,.9)";
      mctx.setLineDash([4, 4]);
      mctx.lineWidth = 1.8;
      mctx.beginPath();
      mctx.moveTo(w / 2, h / 2);
      mctx.lineTo(wx, wy);
      mctx.stroke();
      mctx.setLineDash([]);
      if (wx >= -8 && wy >= -8 && wx <= w + 8 && wy <= h + 8) {
        mctx.fillStyle = "#e8789d";
        mctx.beginPath();
        mctx.arc(wx, wy, 5.5, 0, Math.PI * 2);
        mctx.fill();
        mctx.strokeStyle = "#fff";
        mctx.lineWidth = 1.5;
        mctx.stroke();
      }
      mctx.restore();
    }

    mctx.strokeStyle = "rgba(155,190,174,.8)";
    mctx.lineWidth = 2;
    const railY = h / 2 + (RAIL_Y - p.y) * scale;
    mctx.beginPath();
    mctx.moveTo(w / 2 + (RAIL_MIN_X - p.x) * scale, railY);
    mctx.lineTo(w / 2 + (RAIL_MAX_X - p.x) * scale, railY);
    mctx.stroke();

    for (const station of TRAIN_STATIONS) dot(station.x, station.y, "#77c49b", 3.2);
    for (const train of trains) dot(train.x, train.y, "#e6eee9", 2.4);
    for (const place of PLACES) dot(place.x, place.y, place.color, 4.2);
    dot(personalCar.x, personalCar.y, "#e8edf0", 2.7);

    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.arc(w / 2, h / 2, 4.5, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = "rgba(255,255,255,.24)";
    mctx.lineWidth = 2;
    mctx.strokeRect(4, 4, w - 8, h - 8);
  }

  function needStatusColor(value) {
    if (value < 25) return "#df7772";
    if (value < 50) return "#d8b467";
    return "#9fd4aa";
  }

  function updateObjective() {
    if (state.player.inHome) {
      objectiveTitle.textContent = "自宅";
      objectiveText.textContent = "家具に近づいて ACTION / E で料理・入浴・睡眠・休憩ができます";
      return;
    }
    if (state.player.inTrain) {
      const train = trainById(state.player.trainId);
      const station = stoppedStationForTrain(train);
      objectiveTitle.textContent = station ? "若葉線: " + station.name : "若葉線で移動中";
      if (station) objectiveText.textContent = "E / ACTION で " + station.name + " に降りられます";
      else {
        const next = train ? TRAIN_STATIONS[train.targetIndex] : null;
        objectiveText.textContent = next ? "次は " + next.name : "電車で移動中";
      }
      return;
    }

    if (state.player.inVehicle) {
      const destination = PLACES.find((place) => place.id === state.drive.destination);
      objectiveTitle.textContent = destination ? "運転中: " + destination.name : "目的地を選択";
      if (!destination) objectiveText.textContent = "E / ROUTEから行き先を設定する";
      else {
        const signal = upcomingSignal();
        const lead = leadVehicleInfo();
        if (signal && signal.state === "red" && signal.distance < (signal.stopOffset || STOP_LINE_OFFSET) + 85) objectiveText.textContent = "赤信号です。横断歩道手前の停止線で止まる";
        else if (lead && lead.distance < 130) objectiveText.textContent = "前走車との車間を保つ";
        else objectiveText.textContent = "W / ↑・ACCELで加速、S / ↓・BRAKEで減速";
      }
      return;
    }

    const activeDelivery = state.deliveryWork?.active;
    if (activeDelivery) {
      const remaining = getDeliveryTimeRemaining(activeDelivery);
      objectiveTitle.textContent = "配達中: " + placeName(activeDelivery.destinationPlaceId);
      objectiveText.textContent = "納品先 " + placeName(activeDelivery.destinationPlaceId) + " · " + activeDelivery.parcelName + " · " +
        (remaining < 0 ? "遅延中 " + Math.abs(remaining) + "分" : "残り " + remaining + "分");
      return;
    }

    const phoneWaypoint = PLACES.find((place) => place.id === state.phone?.waypoint);
    if (phoneWaypoint) {
      const p = actorPosition();
      const remaining = distance(p.x, p.y, phoneWaypoint.x, phoneWaypoint.y);
      if (remaining <= 105) {
        state.phone.waypoint = null;
        objectiveTitle.textContent = phoneWaypoint.name;
        objectiveText.textContent = "目的地に到着しました";
      } else {
        objectiveTitle.textContent = "徒歩ナビ: " + phoneWaypoint.name;
        objectiveText.textContent = "あと約" + Math.max(1, Math.round(remaining / 10) * 10) + "m";
        return;
      }
    }

    if (state.phone?.friendWaypointId) {
      const friend = phoneFriendWaypointTarget();
      if (!friend) {
        state.phone.friendWaypointId = null;
      } else if (friend.hidden) {
        objectiveTitle.textContent = friend.name + "は屋内にいます";
        objectiveText.textContent = "安全のため、屋内にいる間は現在地を表示しません";
        return;
      } else {
        const p = actorPosition();
        const remaining = distance(p.x, p.y, friend.x, friend.y);
        if (remaining <= 52) {
          state.phone.friendWaypointId = null;
          objectiveTitle.textContent = friend.name + "の近くです";
          objectiveText.textContent = "周囲を見渡して話しかけてみましょう";
        } else {
          objectiveTitle.textContent = friend.name + "に会いに行く";
          objectiveText.textContent = "現在地まで約" + Math.max(1, Math.round(remaining / 10) * 10) + "m · スマホの『探す』で追跡中";
          return;
        }
      }
    }

    const n = state.needs;
    if (state.cash < 0) {
      objectiveTitle.textContent = "家計を立て直そう";
      objectiveText.textContent = "カフェで働いて赤字を減らす";
      return;
    }
    if (n.energy < 25) {
      objectiveTitle.textContent = "かなり疲れている";
      objectiveText.textContent = "自宅で眠るか休憩しよう";
      return;
    }
    if (n.hunger < 25) {
      objectiveTitle.textContent = "お腹が空いている";
      objectiveText.textContent = state.groceries > 0 ? "自宅で料理する" : "スーパーで食料を買う";
      return;
    }
    if (n.hygiene < 25) {
      objectiveTitle.textContent = "シャワーを浴びたい";
      objectiveText.textContent = "自宅かジムで清潔を回復できる";
      return;
    }
    if (n.social < 25) {
      objectiveTitle.textContent = "誰かと話したい";
      objectiveText.textContent = "公園・カフェ・図書館で知り合いを探す";
      return;
    }
    if (n.fun < 25) {
      objectiveTitle.textContent = "気分転換が必要";
      objectiveText.textContent = "公園、図書館、ジムで自由時間を過ごす";
      return;
    }
    if (state.cash < RENT && nextRentDay() - state.day <= 3) {
      objectiveTitle.textContent = "家賃に備えよう";
      objectiveText.textContent = "カフェの4時間シフトで収入を増やす";
      return;
    }
    objectiveTitle.textContent = "今日はどう過ごす？";
    objectiveText.textContent = "仕事・買い物・運動・読書・交流を自由に選べる";
  }

  function phoneFriendWaypointTarget() {
    const id = state.phone?.friendWaypointId;
    if (!id) return null;
    return NPCS.find((npc) => npc.id === id) || null;
  }

  function phoneStatusMessage() {
    if (state.player.inHome) return "自宅で過ごしています。家具を利用できます。";
    if (state.player.inVehicle) return "運転中です。安全運転で目的地へ向かいましょう。";
    if (state.player.inTrain) return "若葉線で移動中です。";
    const friend = phoneFriendWaypointTarget();
    if (friend && !friend.hidden) return friend.name + "に会いに向かっています。";
    if (friend?.hidden) return friend.name + "は屋内にいます。現在地は表示されません。";
    const waypoint = PLACES.find((place) => place.id === state.phone?.waypoint);
    if (waypoint) return waypoint.name + "へ徒歩で案内中です。";
    return "今日も若葉の街で、自由に過ごしましょう。";
  }

  function phoneModelSnapshot() {
    const p = actorPosition();
    const waypointPlace = PLACES.find((place) => place.id === state.phone?.waypoint);
    const friendWaypoint = phoneFriendWaypointTarget();
    const libraryReading = libraryReadingModel.normalizeProgress(state.libraryReading);
    return {
      day:state.day,
      minute:state.minute,
      cash:state.cash,
      groceries:state.groceries,
      fitness:state.fitness,
      libraryVisits:state.libraryVisits,
      shiftsWorked:state.shiftsWorked,
      needs:{ ...state.needs },
      petCompanion:{ ...petCompanionModel.normalizeProgress(state.petCompanion), condition:petCompanionModel.getCondition(state.petCompanion).label },
      libraryReading:{
        loans:libraryReading.loans.map((loan) => ({
          ...loan,
          title:libraryReadingModel.BOOKS.find((book) => book.id === loan.bookId)?.title || "図書館の本"
        })),
        completedCount:libraryReading.completedBookIds.length
      },
      packedMeals:{
        batches:packedMealsModel.expire(state.packedMeals, communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute))).batches.map((batch) => ({
          ...batch,
          mealId:batch.recipeId + "@" + batch.preparedAt,
          name:homeCookingModel.RECIPES.find((recipe) => recipe.id === batch.recipeId)?.name || "食事",
          freshnessMinutes:Math.max(0, batch.preparedAt + packedMealsModel.FRESHNESS_MINUTES - communityGardenModel.absoluteMinute(state.day, Math.floor(state.minute)))
        })),
        portions:packedMealsModel.portionCount(state.packedMeals),
        capacity:packedMealsModel.MAX_PORTIONS
      },
      district:state.player.inHome ? "自宅・室内" : currentDistrict(p.x, p.y),
      weather:state.visual.weather,
      forecast:weatherSystem.getForecast(state.day, state.minute),
      umbrellaOwned:state.umbrellaOwned === true,
      umbrellaProtecting:isPlayerUsingUmbrella(),
      soundEnabled:audioState.enabled,
      inHome:state.player.inHome,
      inVehicle:state.player.inVehicle,
      inTrain:state.player.inTrain,
      drivingRating:state.drive.rating,
      drivingTrips:state.drive.trips,
      nextRentDay:nextRentDay(),
      rent:RENT,
      statusMessage:phoneStatusMessage(),
      homeDistance:state.player.inHome ? 0 : distance(p.x, p.y, HOME.x, HOME.y),
      carDistance:distance(p.x, p.y, personalCar.x, personalCar.y),
      waypoint:waypointPlace ? {
        id:waypointPlace.id,
        name:waypointPlace.name,
        distance:distance(p.x, p.y, waypointPlace.x, waypointPlace.y)
      } : null,
      friendWaypoint:friendWaypoint ? {
        id:friendWaypoint.id,
        name:friendWaypoint.name,
        hidden:Boolean(friendWaypoint.hidden),
        ...(friendWaypoint.hidden ? {} : {
          distance:distance(p.x, p.y, friendWaypoint.x, friendWaypoint.y)
        })
      } : null,
      places:PLACES.map((place) => ({
        id:place.id,
        name:place.name,
        color:place.color,
        district:currentDistrict(place.x, place.y),
        distance:distance(p.x, p.y, place.x, place.y)
      })),
      npcs:NPCS.map((npc) => ({
        id:npc.id,
        name:npc.name,
        color:npc.color,
        friendship:npc.friendship,
        hidden:Boolean(npc.hidden),
        activity:npc.activityLabel || "移動中",
        distance:npc.hidden ? null : distance(p.x, p.y, npc.x, npc.y),
        mapDX:npc.hidden ? null : npc.x - p.x,
        mapDY:npc.hidden ? null : npc.y - p.y
      })),
      stations:TRAIN_STATIONS.map((station) => ({
        id:station.id,
        name:station.name,
        distance:distance(p.x, p.y, station.accessX, station.accessY)
      })),
      trains:trains.map((train) => ({
        id:train.id,
        stationIndex:train.stationIndex,
        targetIndex:train.targetIndex,
        dwell:train.dwell,
        speed:train.speed
      }))
    };
  }

  function setPhoneWaypoint(placeId) {
    const place = PLACES.find((value) => value.id === placeId);
    if (!place) return;
    state.phone.waypoint = place.id;
    state.phone.friendWaypointId = null;
    if (state.player.inVehicle) {
      setDrivingDestination(place);
    } else {
      showToast(place.name + "への徒歩ナビを開始しました");
    }
    updateSmartphone();
  }

  function setPhoneFriendWaypoint(npcId) {
    const npc = NPCS.find((value) => value.id === npcId && !value.hidden);
    if (!npc) return;
    if (state.player.inHome || state.player.inVehicle || state.player.inTrain) {
      showToast("徒歩で外にいるときに案内できます");
      return;
    }
    state.phone.waypoint = null;
    state.phone.friendWaypointId = npc.id;
    showToast(npc.name + "に会いに行く案内を開始しました");
    updateSmartphone();
  }

  function clearPhoneWaypoint() {
    state.phone.waypoint = null;
    state.phone.friendWaypointId = null;
    if (state.player.inVehicle) {
      state.drive.route = [];
      state.drive.routeIndex = 0;
      state.drive.signals = [];
      state.drive.destination = null;
    }
    showToast("案内を終了しました");
    updateSmartphone();
  }

  function phoneHomeAction() {
    if (state.player.inHome) {
      showToast("自宅で過ごしています");
      return;
    }
    const p = actorPosition();
    if (!state.player.inVehicle && !state.player.inTrain && distance(p.x, p.y, HOME.x, HOME.y) <= 230) {
      enterHome();
      return;
    }
    setPhoneWaypoint("home");
  }

  function capturePhonePhoto() {
    try {
      const thumb = document.createElement("canvas");
      const maxWidth = 360;
      const scale = Math.min(1, maxWidth / Math.max(1, canvas.width));
      thumb.width = Math.max(1, Math.round(canvas.width * scale));
      thumb.height = Math.max(1, Math.round(canvas.height * scale));
      const tctx = thumb.getContext("2d");
      if (!tctx) return null;
      tctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const p = actorPosition();
      return {
        dataUrl:thumb.toDataURL("image/jpeg", .72),
        day:state.day,
        minute:state.minute,
        location:state.player.inHome ? "自宅" : currentDistrict(p.x, p.y)
      };
    } catch (error) {
      console.warn("phone camera capture failed", error);
      return null;
    }
  }

  function setSmartphoneOpen(open) {
    if (!smartphonePanel || !smartphoneToggle) return;
    const isOpen = Boolean(open);
    smartphonePanel.hidden = !isOpen;
    smartphoneToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("smartphone-open", isOpen);
    if (isOpen) {
      updateSmartphone();
      phoneSystem?.open();
    }
  }

  function updateSmartphone() {
    phoneSystem?.update(phoneModelSnapshot());
  }

  function updateHUD() {
    const p = actorPosition();
    areaNameEl.textContent = state.player.inHome ? "自宅・室内" : currentDistrict(p.x, p.y);
    const hours = Math.floor(state.minute / 60);
    const minutes = Math.floor(state.minute % 60);
    worldClockEl.textContent = "Day " + state.day + "  " + String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
    cashText.textContent = "¥" + Math.floor(state.cash).toLocaleString("ja-JP");
    foodText.textContent = "食料 " + state.groceries;

    for (const [key, [bar, text]] of Object.entries(needEls)) {
      const value = clamp(state.needs[key], 0, 100);
      bar.style.width = value + "%";
      bar.style.background = needStatusColor(value);
      text.textContent = Math.round(value);
    }

    const values = Object.values(state.needs);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const minimum = Math.min(...values);
    const generalStatus = minimum < 20 ? "かなりつらい" : average > 75 ? "とても充実" : average > 55 ? "いい感じ" : "少し疲れ気味";
    lifeStatus.textContent = playerHealthModel.conditionFor(state.needs.health) + " · " + generalStatus;
    rentText.textContent = "次の家賃: Day " + nextRentDay() + " / ¥" + RENT.toLocaleString("ja-JP");
    updateObjective();
    updateSmartphone();

    driveHud.hidden = !state.player.inVehicle;
    mobileDrivingControls.hidden = !state.player.inVehicle;
    document.body.classList.toggle("driving", state.player.inVehicle);
    if (minimap?.parentElement) minimap.parentElement.hidden = state.player.inHome;

    if (state.player.inVehicle) {
      const limit = speedLimitAt(personalCar.x, personalCar.y);
      const signal = upcomingSignal();
      const lead = leadVehicleInfo();
      const destination = PLACES.find((place) => place.id === state.drive.destination);
      speedText.textContent = Math.round(personalCar.speed * SPEED_TO_KMH);
      driveFuelText.textContent = personalCar.fuelLiters.toFixed(1) + " / " + carFuelModel.CAPACITY_LITERS + " L";
      driveFuelBar.style.width = (personalCar.fuelLiters / carFuelModel.CAPACITY_LITERS * 100) + "%";
      driveFuelBar.style.background = personalCar.fuelLiters <= 5 ? "#e79b63" : "#86c886";
      speedLimitText.textContent = limit;
      driveScoreText.textContent = state.drive.score;
      driveDestinationText.textContent = destination ? "→ " + destination.name : "目的地を選択";
      signalText.textContent = signal
        ? (signal.state === "green" ? "信号 青" : signal.state === "yellow" ? "信号 黄" : "信号 赤")
        : "信号 —";
      signalText.classList.toggle("route-warning", Boolean(signal && signal.state === "yellow"));
      signalText.classList.toggle("route-danger", Boolean(signal && signal.state === "red"));
      gapText.textContent = lead ? "車間 " + Math.max(0, Math.round(lead.distance / 10)) + "m" : "車間 —";
      gapText.classList.toggle("route-danger", Boolean(lead && lead.distance < 80));
    }

    const interaction = nearestInteraction();
    if (interaction && actionSheet.hidden && helpPanel.hidden) {
      interactionText.textContent = interaction.label;
      interactionPrompt.hidden = false;
    } else {
      interactionPrompt.hidden = true;
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    refreshHomeTelevisionAction();

    if (state.player.inHome) {
      drawHomeInterior();
      updateHUD();
      return;
    }

    ctx.fillStyle = "#74836f";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    beginWorldProjection();
    drawGround();
    drawNeighborhoodGround();
    drawSparseRoadNetwork();
    drawRoute();
    drawStreetProps();
    drawBuildings();
    for (const place of PLACES) drawPlace(place);
    drawRailUnderstructure();
    drawCityLandmarks();
    drawPedestrians();
    for (const npc of NPCS) drawNpc(npc);
    for (const car of traffic) drawCar(car, false);
    drawCar(personalCar, true);
    drawPetFollower();
    drawPlayer();
    drawTrafficLights();
    drawRailDeck();
    for (const train of trains) drawTrain(train);
    drawStreetLightsGlow();
    endWorldProjection();

    drawNightOverlay();
    drawWeather();
    drawAtmosphericGrade();
    drawMinimap();
    updateHUD();
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    if (actionQueued) {
      actionQueued = false;
      performAction();
    }

    update(dt);
    if (smartphonePanel && !smartphonePanel.hidden) {
      smartphoneRefreshElapsed += dt;
      if (smartphoneRefreshElapsed >= SMARTPHONE_REFRESH_INTERVAL) {
        smartphoneRefreshElapsed %= SMARTPHONE_REFRESH_INTERVAL;
        updateSmartphone();
      }
    } else {
      smartphoneRefreshElapsed = 0;
    }
    updateGameAudio(dt);

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.hidden = true;
    }

    render();
    requestFrame(frame);
  }

  function installSocialNpcTestHook() {
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    if (!new URL(location.href).searchParams.has("socialNpcDebug")) return;

    const snapshot = () => {
      const citizens = pedestrians
        .filter((citizen) => citizen.specialNpcId)
        .map((citizen) => ({
          id:citizen.specialNpcId,
          name:socialNpcSystem.getProfile(citizen.specialNpcId)?.name || citizen.name,
          x:citizen.x,
          y:citizen.y,
          state:citizen.state,
          visible:citizen.visible !== false,
          currentActivityId:citizen.currentActivityId,
          pendingActivity:citizen.pendingActivity ? { ...citizen.pendingActivity } : null,
          socialActivityRequest:citizen.socialActivityRequest ? { ...citizen.socialActivityRequest } : null,
          routeEdgeIds:Array.isArray(citizen.routeEdgeIds) ? [...citizen.routeEdgeIds] : [],
          routeIndex:citizen.routeIndex,
          tripCount:citizen.tripCount
        }));
      return JSON.parse(JSON.stringify({
        day:state.day,
        minute:state.minute,
        cash:state.cash,
        player:{ x:state.player.x, y:state.player.y, homeX:state.player.homeX, homeY:state.player.homeY, inHome:state.player.inHome, inVehicle:state.player.inVehicle, inTrain:state.player.inTrain },
        needs:{ ...state.needs },
        weather:state.visual.weather,
        umbrellaOwned:state.umbrellaOwned === true,
        wardrobe:wardrobeModel.normalizeWardrobe(state.wardrobe),
        skills:{ ...state.communityCenter.skills },
        npcFriendship:{ ...socialNpcState.friendship },
        relationships:{ ...socialNpcState.relationships },
        npcPositions:Object.fromEntries(NPCS.map((npc) => [npc.id,{ x:npc.x, y:npc.y }])),
        petCompanion:petCompanionModel.normalizeProgress(state.petCompanion),
        petWalk:petWalkModel.normalizeWalkState(state.petWalk, { worldSize:WORLD_SIZE, hasDog:state.petCompanion.pet?.speciesId === "dog", playerCanWalk:!state.player.inHome && !state.player.inVehicle && !state.player.inTrain, playerPosition:{ x:state.player.x, y:state.player.y } }),
        homeCrafting:homeCraftingModel.normalizeProgress(state.homeCrafting),
        packedMeals:(() => {
          const packedMeals = packedMealsModel.normalizeInventory(state.packedMeals);
          return {
            ...packedMeals,
            portions:packedMealsModel.portionCount(packedMeals),
            batches:packedMeals.batches.map((batch) => ({ ...batch, mealId:batch.recipeId + "@" + batch.preparedAt }))
          };
        })(),
        groceries:state.groceries,
        libraryReading:libraryReadingModel.normalizeProgress(state.libraryReading),
        nearestInteraction:(() => {
          const interaction = nearestInteraction();
          return interaction ? { type:interaction.type, label:interaction.label, targetId:interaction.target?.id || null } : null;
        })(),
        citizens
      }));
    };

    Object.defineProperty(globalThis, "__CityDaysSocialNpcTest", {
      configurable:true,
      value:Object.freeze({
        snapshot,
        equipOutfitForTest(outfitId) { return equipPlayerOutfit(outfitId); },
        playerAppearanceForTest() {
          const appearance = playerAppearance();
          return { outfitId:state.wardrobe.equippedOutfitId, top:appearance.top, bottom:appearance.bottom, accent:appearance.accent, topStyle:appearance.topStyle, accessory:appearance.accessory };
        },
        setPausedForTest(value) { state.paused = Boolean(value); },
        setMinuteForTest(minute) {
          if (!Number.isFinite(minute)) return false;
          state.minute = Math.max(0, Math.min(1439, Math.floor(minute)));
          syncWeather();
          return true;
        },
        setClockForTest(day, minute) {
          if (!Number.isFinite(day) || !Number.isFinite(minute) || day < 1) return false;
          state.day = Math.floor(day);
          state.minute = Math.max(0, Math.min(1439, Math.floor(minute)));
          syncWeather();
          updateSmartphone();
          return true;
        },
        setPlayerContextForTest(context) {
          state.player.inHome = context === "home";
          state.player.inVehicle = context === "car";
          state.player.inTrain = context === "train";
          return isPlayerUsingUmbrella();
        },
        buyUmbrellaForTest() { return buyUmbrella(); },
        setCashForTest(amount) {
          if (!Number.isFinite(amount) || amount < 0) return false;
          state.cash = Math.floor(amount);
          return true;
        },
        isPlayerUsingUmbrella,
        getUmbrellaDrawCount() { return umbrellaDrawCount; },
        applyGameSnapshotForTest(saved) { return applyGameSnapshot(saved); },
        captureGameSnapshotForTest() { return buildGameSnapshot(); },
        attemptCarBoardForTest() {
          enterCar();
          return { inVehicle:state.player.inVehicle, inTrain:state.player.inTrain, walkActive:state.petWalk.active };
        },
        attemptTrainBoardForTest() {
          boardTrain(trains[0], TRAIN_STATIONS[0]);
          return { inVehicle:state.player.inVehicle, inTrain:state.player.inTrain, walkActive:state.petWalk.active };
        },
        decayNeedsForTest(minutes) {
          if (!Number.isFinite(minutes) || minutes < 0) return false;
          const hygieneBefore = state.needs.hygiene;
          decayNeeds(minutes);
          return { ...state.needs, hygieneBefore, hygieneDelta:hygieneBefore - state.needs.hygiene };
        },
        advanceTimeForTest(minutes) {
          if (!Number.isFinite(minutes) || minutes < 0) return false;
          advanceTime(minutes, false, false);
          updateSmartphone();
          return true;
        },
        advanceWorldTimeForTest(minutes) {
          if (!Number.isFinite(minutes) || minutes < 0) return false;
          advanceTime(minutes, false, true);
          updateSmartphone();
          syncNamedNpcCitizens();
          return true;
        },
        eatMealForTest(mealId) {
          return consumePackedMeal(mealId);
        },
        movePlayerNearPlace(placeId, avoidNearbyActors = false) {
          const place = PLACES.find((item) => item.id === placeId);
          if (!place) return false;
          state.player.inHome = false;
          state.player.inVehicle = false;
          state.player.inTrain = false;
          state.player.trainId = null;
          state.player.x = place.x - 22;
          state.player.y = place.y + 10;
          state.player.facingX = 1;
          state.player.facingY = 0;
          if (avoidNearbyActors) {
            const origin = { x:state.player.x, y:state.player.y };
            const candidates = [];
            for (const radius of [82, 92, 100]) {
              for (let step = 0; step < 16; step += 1) {
                const angle = step * Math.PI / 8;
                candidates.push({ x:place.x + Math.cos(angle) * radius, y:place.y + Math.sin(angle) * radius });
              }
            }
            candidates.sort((a, b) => distance(a.x, a.y, origin.x, origin.y) - distance(b.x, b.y, origin.x, origin.y));
            const clearCandidate = candidates.find((candidate) => {
              state.player.x = candidate.x;
              state.player.y = candidate.y;
              return nearestInteraction()?.type === "place" && nearestInteraction()?.target?.id === placeId;
            });
            if (!clearCandidate) {
              state.player.x = origin.x;
              state.player.y = origin.y;
              return false;
            }
            state.player.x = clearCandidate.x;
            state.player.y = clearCandidate.y;
            state.player.facingX = place.x - clearCandidate.x;
            state.player.facingY = place.y - clearCandidate.y;
          }
          state.camera.x = clamp(state.player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
          state.camera.y = clamp(state.player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
          return true;
        },
        movePlayerToHomeFixture(fixtureId) {
          const fixture = HOME_FIXTURES.find((item) => item.id === fixtureId);
          if (!fixture) return false;
          state.player.inHome = true;
          state.player.inVehicle = false;
          state.player.inTrain = false;
          state.player.trainId = null;
          state.player.homeX = fixture.interactX;
          state.player.homeY = fixture.interactY;
          state.player.facingX = 0;
          state.player.facingY = -1;
          return true;
        },
        movePlayerNear(npcId) {
          const citizen = pedestrians.find((item) => item.specialNpcId === npcId);
          const profile = socialNpcSystem.getProfile(npcId);
          const person = NPCS.find((item) => item.id === npcId);
          if (!citizen || !profile || !person || citizen.visible === false || citizen.state === "home" || citizen.state === "inside") return false;
          state.player.inHome = false;
          state.player.inVehicle = false;
          state.player.inTrain = false;
          state.player.trainId = null;
          const origin = { x:state.player.x, y:state.player.y };
          const candidates = [];
          for (const radius of [18, 24, 32, 40]) {
            for (let step = 0; step < 32; step += 1) {
              const angle = step * Math.PI / 16;
              candidates.push({ x:person.x + Math.cos(angle) * radius, y:person.y + Math.sin(angle) * radius, angle });
            }
          }
          candidates.sort((a, b) => distance(a.x, a.y, origin.x, origin.y) - distance(b.x, b.y, origin.x, origin.y));
          const candidate = candidates.find((point) => {
            state.player.x = point.x;
            state.player.y = point.y;
            const interaction = nearestInteraction();
            return interaction?.type === "npc" && interaction.target?.id === npcId;
          });
          if (!candidate) {
            state.player.x = origin.x;
            state.player.y = origin.y;
            return false;
          }
          state.player.x = candidate.x;
          state.player.y = candidate.y;
          state.player.facingX = -Math.cos(candidate.angle);
          state.player.facingY = -Math.sin(candidate.angle);
          state.camera.x = clamp(state.player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
          state.camera.y = clamp(state.player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
          return true;
        },
        giveGiftForTest(npcId, itemId) {
          return performNpcGift(npcId, itemId);
        }
      })
    });
  }

  function togglePause() {
    if (smartphonePanel && !smartphonePanel.hidden) {
      setSmartphoneOpen(false);
      return;
    }
    if (!actionSheet.hidden) {
      closeActionSheet();
      return;
    }
    if (!helpPanel.hidden) {
      helpPanel.hidden = true;
      return;
    }
    state.paused = !state.paused;
    pausedOverlay.hidden = !state.paused;
  }

  function updateJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy);
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    touch.x = dx / max;
    touch.y = dy / max;
    joystickKnob.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  function resetJoystick() {
    touch.x = 0;
    touch.y = 0;
    touch.pointerId = null;
    joystickKnob.style.transform = "translate(0,0)";
  }

  const gameShell = document.getElementById("gameShell");
  gameShell.addEventListener("contextmenu", (event) => event.preventDefault());
  gameShell.addEventListener("selectstart", (event) => event.preventDefault());
  gameShell.addEventListener("pointerdown", () => {
    void unlockGameAudio();
  }, { passive:true });
  gameShell.addEventListener("click", (event) => {
    const button = event.target.closest?.("button");
    if (button && button !== soundButton) playUiTick();
  });

  if (soundButton) {
    soundButton.addEventListener("click", (event) => {
      event.preventDefault();
      const nextEnabled = !audioState.enabled;
      setSoundEnabled(nextEnabled);
      if (nextEnabled) {
        void unlockGameAudio().then((running) => {
          if (running) playUiTick();
        });
      }
    });
  }
  updateSoundButton();

  if (smartphonePanel && globalThis.CityDaysPhoneSystem?.createPhoneSystem) {
    phoneSystem = globalThis.CityDaysPhoneSystem.createPhoneSystem({
      root:smartphonePanel,
      callbacks:{
        close:() => setSmartphoneOpen(false),
        route:(placeId) => setPhoneWaypoint(placeId),
        friendRoute:(npcId) => setPhoneFriendWaypoint(npcId),
        clearRoute:() => clearPhoneWaypoint(),
        capturePhoto:() => capturePhonePhoto(),
        setSound:(enabled) => {
          setSoundEnabled(enabled);
          if (enabled) void unlockGameAudio();
          updateSmartphone();
        },
        homeAction:() => phoneHomeAction(),
        eatMeal:(mealId) => consumePackedMeal(mealId),
        call:(npcId) => {
          const npc = NPCS.find((value) => value.id === npcId);
          showToast((npc?.name || "連絡先") + "に電話しました");
        },
        message:(npcId) => {
          const npc = NPCS.find((value) => value.id === npcId);
          showToast((npc?.name || "連絡先") + "にメッセージを送りました");
        },
        toast:(message) => showToast(message)
      }
    });
    updateSmartphone();
  }

  if (smartphoneToggle) {
    smartphoneToggle.addEventListener("click", () => {
      setSmartphoneOpen(smartphonePanel.hidden);
    });
  }

  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (event) => {
    void unlockGameAudio();
    const key = event.key.toLowerCase();
    if (key === "p" && !event.repeat) {
      setSmartphoneOpen(smartphonePanel?.hidden ?? false);
      return;
    }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "e", "shift"].includes(key)) {
      event.preventDefault();
    }

    if (key === "e" && !event.repeat) {
      actionQueued = true;
      return;
    }
    if (key === "escape" && !event.repeat) {
      togglePause();
      return;
    }

    keys.add(key);
  }, { passive: false });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  window.addEventListener("blur", () => {
    keys.clear();
    resetJoystick();
    touch.run = false;
    touch.driveAccel = false;
    touch.driveBrake = false;
  });

  joystick.addEventListener("pointerdown", (event) => {
    touch.pointerId = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener("pointermove", (event) => {
    if (touch.pointerId === event.pointerId) updateJoystick(event);
  });
  joystick.addEventListener("pointerup", (event) => {
    if (touch.pointerId === event.pointerId) resetJoystick();
  });
  joystick.addEventListener("pointercancel", resetJoystick);

  actionButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    actionQueued = true;
  });

  runButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touch.run = true;
    try {
      runButton.setPointerCapture(event.pointerId);
    } catch (_) {}
  });
  const stopRun = () => { touch.run = false; };
  runButton.addEventListener("pointerup", stopRun);
  runButton.addEventListener("pointercancel", stopRun);
  runButton.addEventListener("lostpointercapture", stopRun);

  const bindHoldButton = (button, key) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      touch[key] = true;
      try {
        button.setPointerCapture(event.pointerId);
      } catch (_) {}
    });
    const stop = () => { touch[key] = false; };
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  };

  bindHoldButton(driveAccelButton, "driveAccel");
  bindHoldButton(driveBrakeButton, "driveBrake");
  driveMenuButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    actionQueued = true;
  });

  actionClose.addEventListener("click", closeActionSheet);
  helpButton.addEventListener("click", () => { helpPanel.hidden = false; });
  helpClose.addEventListener("click", () => { helpPanel.hidden = true; });
  clearLegacyLocalSave();
  generateBuildings();
  generateTraffic();
  generatePedestrians();
  syncNamedNpcCitizens();
  migrateCarToCurrentRoadIfNeeded();
  seedPedestriansNearActor();
  resize();
  if (state.player.inVehicle) {
    personalCar.speed = 0;
    state.drive.route = [];
    state.drive.signals = [];
    state.drive.destination = null;
    document.body.classList.add("driving");
  }

  if (!canStand(state.player.x, state.player.y)) {
    const fallback = migratePlayerToCurrentMap(NaN, NaN);
    state.player.x = fallback.x;
    state.player.y = fallback.y;
    state.player.inVehicle = false;
    state.player.inTrain = false;
    state.player.trainId = null;
  }

  state.camera.x = clamp(state.player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
  state.camera.y = clamp(state.player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));

  installSocialNpcTestHook();
  showToast("CITY DAYSへようこそ。今日は自由に過ごせます");
  requestFrame(frame);
})();
