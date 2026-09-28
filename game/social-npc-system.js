(function initCityDaysSocialNpcSystem(global) {
  "use strict";

  function freezeDeep(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeDeep(child);
    return Object.freeze(value);
  }

  const catalog = freezeDeep([
    {
      id:"aoi", name:"アオイ", gender:"female", age:28, jobType:"freelance", color:"#e0a7b5",
      preferredPlaceId:"park", workPlaceId:null,
      personality:{ social:.9, active:.62, curious:.88, routine:.5 },
      schedule:{ workdays:[1,2,3,4,5], workStart:600, workEnd:960, wakeMinute:420, sleepMinute:1380 },
      dialogueStyle:{ tone:"穏やか", topics:["公園の花", "街角の写真", "最近見つけた場所"] }
    },
    {
      id:"sora", name:"ソラ", gender:"male", age:24, jobType:"cafe", color:"#a9c9e3",
      preferredPlaceId:"cafe", workPlaceId:"cafe",
      personality:{ social:.92, active:.7, curious:.68, routine:.82 },
      schedule:{ workdays:[1,2,3,4,5,6], workStart:480, workEnd:960, wakeMinute:390, sleepMinute:1410 },
      dialogueStyle:{ tone:"気さく", topics:["カフェの新メニュー", "常連さんの話", "休憩時間の過ごし方"] }
    },
    {
      id:"mei", name:"メイ", gender:"female", age:22, jobType:"student", color:"#c8b58f",
      preferredPlaceId:"library", workPlaceId:"library",
      personality:{ social:.62, active:.55, curious:.94, routine:.78 },
      schedule:{ workdays:[1,2,3,4,5], workStart:540, workEnd:900, wakeMinute:420, sleepMinute:1410 },
      dialogueStyle:{ tone:"知的で控えめ", topics:["読んでいる本", "授業のこと", "図書館のおすすめ"] }
    },
    {
      id:"takumi", name:"タクミ", gender:"male", age:31, jobType:"office", color:"#90a9a0",
      preferredPlaceId:"store", workPlaceId:null,
      personality:{ social:.55, active:.48, curious:.58, routine:.91 },
      schedule:{ workdays:[1,2,3,4,5], workStart:540, workEnd:1020, wakeMinute:390, sleepMinute:1380 },
      dialogueStyle:{ tone:"落ち着いた", topics:["近所の店", "通勤の道", "週末の予定"] }
    },
    {
      id:"yui", name:"ユイ", gender:"female", age:27, jobType:"retail", color:"#e7a878",
      preferredPlaceId:"cafe", workPlaceId:"store",
      personality:{ social:.86, active:.74, curious:.72, routine:.77 },
      schedule:{ workdays:[1,2,3,4,5,6], workStart:510, workEnd:960, wakeMinute:390, sleepMinute:1410 },
      dialogueStyle:{ tone:"明るく親しみやすい", topics:["商店街の新商品", "おいしいおやつ", "友だちの近況"] }
    },
    {
      id:"rin", name:"リン", gender:"female", age:19, jobType:"student", color:"#9d91c6",
      preferredPlaceId:"library", workPlaceId:"library",
      personality:{ social:.7, active:.61, curious:.9, routine:.72 },
      schedule:{ workdays:[1,2,3,4,5], workStart:540, workEnd:870, wakeMinute:420, sleepMinute:1440 },
      dialogueStyle:{ tone:"好奇心旺盛", topics:["勉強の進み具合", "好きな音楽", "放課後の予定"] }
    },
    {
      id:"ren", name:"レン", gender:"male", age:34, jobType:"gym", color:"#72aaa4",
      preferredPlaceId:"gym", workPlaceId:"gym",
      personality:{ social:.67, active:.98, curious:.62, routine:.86 },
      schedule:{ workdays:[1,2,3,4,5,6], workStart:600, workEnd:1080, wakeMinute:360, sleepMinute:1380 },
      dialogueStyle:{ tone:"率直で快活", topics:["運動のコツ", "体調管理", "公園のランニングコース"] }
    },
    {
      id:"nao", name:"ナオ", gender:"male", age:63, jobType:"retired", color:"#c4a887",
      preferredPlaceId:"park", workPlaceId:null,
      personality:{ social:.73, active:.42, curious:.76, routine:.83 },
      schedule:{ workdays:[], workStart:0, workEnd:0, wakeMinute:450, sleepMinute:1320 },
      dialogueStyle:{ tone:"ゆったりと親切", topics:["昔の街並み", "季節の草花", "散歩道のこと"] }
    },
    {
      id:"kaede", name:"カエデ", gender:"female", age:29, jobType:"cafe", color:"#d88778",
      preferredPlaceId:"cafe", workPlaceId:"cafe",
      personality:{ social:.95, active:.69, curious:.81, routine:.8 },
      schedule:{ workdays:[1,2,3,4,5,6], workStart:660, workEnd:1080, wakeMinute:450, sleepMinute:1440 },
      dialogueStyle:{ tone:"気配り上手", topics:["コーヒーの香り", "小さな喫茶店", "最近うれしかったこと"] }
    },
    {
      id:"yuto", name:"ユウト", gender:"male", age:20, jobType:"student", color:"#73a7c7",
      preferredPlaceId:"park", workPlaceId:"library",
      personality:{ social:.78, active:.79, curious:.86, routine:.62 },
      schedule:{ workdays:[1,2,3,4,5], workStart:570, workEnd:870, wakeMinute:420, sleepMinute:1470 },
      dialogueStyle:{ tone:"気さくで少し照れ屋", topics:["学校のサークル", "ゲームの話", "帰り道に寄る場所"] }
    }
  ]);

  const relationships = freezeDeep([
    { aId:"aoi", bId:"sora", type:"friends", initialAffinity:58 },
    { aId:"aoi", bId:"takumi", type:"neighbors", initialAffinity:42 },
    { aId:"aoi", bId:"nao", type:"friends", initialAffinity:54 },
    { aId:"sora", bId:"mei", type:"friends", initialAffinity:48 },
    { aId:"sora", bId:"kaede", type:"coworkers", initialAffinity:66 },
    { aId:"mei", bId:"rin", type:"study_friends", initialAffinity:72 },
    { aId:"mei", bId:"yui", type:"friends", initialAffinity:45 },
    { aId:"takumi", bId:"ren", type:"friends", initialAffinity:52 },
    { aId:"yui", bId:"kaede", type:"friends", initialAffinity:61 },
    { aId:"ren", bId:"nao", type:"family", initialAffinity:83 },
    { aId:"rin", bId:"yuto", type:"classmates", initialAffinity:56 }
  ]);
  const profilesById = new Map(catalog.map((profile) => [profile.id, profile]));
  const relationshipsByPair = new Map(relationships.map((relationship) => [
    [relationship.aId, relationship.bId].sort().join("|"), relationship
  ]));

  function getProfile(id) {
    return profilesById.get(id) || null;
  }

  function getRelationship(aId, bId) {
    if (!aId || !bId || aId === bId || !profilesById.has(aId) || !profilesById.has(bId)) return null;
    return relationshipsByPair.get([aId, bId].sort().join("|")) || null;
  }

  function createInitialState() {
    const friendship = {};
    const recentTopics = {};
    for (const profile of catalog) {
      friendship[profile.id] = 0;
      recentTopics[profile.id] = null;
    }
    const relationshipState = {};
    for (const relationship of relationships) {
      relationshipState[[relationship.aId, relationship.bId].sort().join("|")] = relationship.initialAffinity;
    }
    return { friendship, relationships:relationshipState, recentTopics };
  }

  const MAX_AFFINITY = 100;
  const MAX_SOCIAL_BIAS = 30;
  const PLACE_NAMES = { park:"公園", cafe:"カフェ", store:"スーパー", gym:"ジム", library:"図書館", home:"家" };
  const RELATIONSHIP_NAMES = {
    friends:"友だち", neighbors:"近所の知り合い", coworkers:"同僚",
    study_friends:"勉強仲間", family:"家族", classmates:"クラスメイト"
  };

  function clamp(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
  }

  function normalizeMinute(value) {
    const minute = Math.floor(Number(value) || 0);
    return ((minute % 1440) + 1440) % 1440;
  }

  function absoluteMinute(day, minute) {
    return (Math.max(1, Math.floor(Number(day) || 1)) - 1) * 1440 + normalizeMinute(minute);
  }

  function inMinuteWindow(minute, start, end) {
    if (start === end) return false;
    if (end > start) return minute >= start && minute < end;
    return minute >= start || minute < end;
  }

  function isSleeping(profile, minute) {
    const wake = normalizeMinute(profile.schedule.wakeMinute);
    const sleep = Number(profile.schedule.sleepMinute);
    if (!Number.isFinite(sleep)) return false;
    if (sleep >= 1440) return minute < wake;
    return minute >= sleep || minute < wake;
  }

  function isScheduledForWork(profile, minute, day) {
    const schedule = profile.schedule;
    const weekday = ((Math.max(1, Math.floor(Number(day) || 1)) - 1) % 7) + 1;
    if (!Array.isArray(schedule.workdays) || !schedule.workdays.includes(weekday)) return false;
    return inMinuteWindow(minute, normalizeMinute(schedule.workStart), normalizeMinute(schedule.workEnd));
  }

  function isSociallyAvailable(profile, minuteValue, day, activityId) {
    if (activityId === "work" || activityId === "sleep") return false;
    const minute = normalizeMinute(minuteValue);
    return !isSleeping(profile, minute) && !isScheduledForWork(profile, minute, day);
  }

  function pairKey(aId, bId) {
    return [aId, bId].sort().join("|");
  }

  function nearbyRelationship(npcId, nearbyIds, relationshipState) {
    for (const otherId of Array.isArray(nearbyIds) ? nearbyIds : []) {
      const relationship = getRelationship(npcId, otherId);
      if (!relationship) continue;
      const key = pairKey(npcId, otherId);
      const affinity = clamp(relationshipState && relationshipState[key] != null
        ? relationshipState[key]
        : relationship.initialAffinity, 0, MAX_AFFINITY);
      return { profile:getProfile(otherId), relationship, key, affinity };
    }
    return null;
  }

  function timePhrase(minute) {
    const hour = Math.floor(normalizeMinute(minute) / 60);
    if (hour < 5) return "夜更けに";
    if (hour < 11) return "朝のうちに";
    if (hour < 17) return "昼下がりに";
    if (hour < 21) return "夕方に";
    return "夜に";
  }

  function getConversation(input) {
    const options = input || {};
    const profile = getProfile(options.npcId);
    if (!profile) return { topic:"近況", line:"またあとで話しましょう。", options:[] };
    const minute = normalizeMinute(options.minute);
    const day = Math.max(1, Math.floor(Number(options.day) || 1));
    const topics = profile.dialogueStyle.topics;
    const seed = day * 3 + Math.floor(minute / 360) + Math.floor(clamp(options.friendship, 0, MAX_AFFINITY) / 3);
    let topicIndex = seed % topics.length;
    if (topics[topicIndex] === options.recentTopic) topicIndex = (topicIndex + 1) % topics.length;
    const topic = topics[topicIndex];
    const nearby = nearbyRelationship(profile.id, options.nearbySocialNpcIds, options.relationships);
    const busy = !isSociallyAvailable(profile, minute, day, options.activityId);
    const activityLine = options.activityId === "work" ? "仕事の合間だけど" : options.activityId === "sleep" ? "起きたばかりで" : "ちょうどひと息ついていたところで";
    const tieLine = nearby
      ? ` ${nearby.profile.name}さんとは${RELATIONSHIP_NAMES[nearby.relationship.type] || "知り合い"}なんです。`
      : "";
    const line = `${profile.name}：「${timePhrase(minute)}${activityLine}、${topic}の話をしませんか？」${tieLine}`;
    const placeName = PLACE_NAMES[profile.preferredPlaceId] || "いつもの場所";
    const friendship = clamp(options.friendship, 0, MAX_AFFINITY);
    return {
      topic,
      line,
      options:[
        { id:"greet", label:"軽く挨拶する", available:true },
        { id:"ask", label:`${topic}について聞く`, available:true },
        { id:"invite", label:`一緒に${placeName}へ行こうと誘う`, available:!busy && friendship > 0 }
      ]
    };
  }

  function getConversationNeedsDelta(optionId, needs) {
    const currentSocial = clamp(needs && needs.social, 0, 100);
    const currentFun = clamp(needs && needs.fun, 0, 100);
    const requested = optionId === "invite" ? { social:9, fun:5 }
      : optionId === "ask" ? { social:6, fun:3 }
        : { social:3, fun:1 };
    return {
      social:Math.min(requested.social, MAX_AFFINITY - currentSocial),
      fun:Math.min(requested.fun, MAX_AFFINITY - currentFun)
    };
  }

  function resolveConversation(input) {
    const options = input || {};
    const profile = getProfile(options.npcId);
    const optionId = ["greet","ask","invite"].includes(options.optionId) ? options.optionId : "greet";
    const friendship = clamp(options.friendship, 0, MAX_AFFINITY);
    const minute = normalizeMinute(options.minute);
    const day = Math.max(1, Math.floor(Number(options.day) || 1));
    const busy = !profile || !isSociallyAvailable(profile, minute, day, options.activityId);
    const topic = profile
      ? getConversation({ ...options, npcId:profile.id }).topic
      : "近況";
    let response = optionId === "ask" ? `その話なら、${topic}のことが気になっているんです。`
      : optionId === "invite" ? "誘ってくれてありがとう。"
        : "声をかけてくれてありがとう。";
    let friendshipDelta = optionId === "ask" ? 1 : optionId === "greet" ? 1 : 0;
    let activityRequest = null;
    if (optionId === "invite") {
      if (busy) {
        response = "ごめんなさい、今は予定があるので、またあとで。";
        friendshipDelta = 0;
      } else if (!profile || friendship < 1) {
        response = "もう少しお話ししてから、一緒に出かけたいです。";
        friendshipDelta = 0;
      } else if (profile.personality.social < .65) {
        response = "ありがとう。今日はひとりで過ごしたいので、また今度。";
        friendshipDelta = 0;
      } else {
        activityRequest = {
          actionId:"socialize",
          placeId:profile.preferredPlaceId,
          expiresAt:absoluteMinute(day, minute) + 90
        };
        friendshipDelta = friendship < MAX_AFFINITY ? 1 : 0;
        response = `いいですね。${PLACE_NAMES[profile.preferredPlaceId] || "いつもの場所"}で少し過ごしましょう。`;
      }
    }
    friendshipDelta = Math.min(friendshipDelta, MAX_AFFINITY - friendship);

    const relationshipChanges = [];
    if (profile && optionId === "ask") {
      const nearby = nearbyRelationship(profile.id, options.nearbySocialNpcIds, options.relationships);
      if (nearby) {
        relationshipChanges.push({
          pairKey:nearby.key,
          delta:nearby.affinity < MAX_AFFINITY ? 1 : 0
        });
      }
    }

    return {
      response,
      friendshipDelta,
      relationshipChanges,
      needsDelta:getConversationNeedsDelta(optionId, options.needs),
      activityRequest,
      topic
    };
  }

  function getSocialActionBias(input) {
    const options = input || {};
    if (options.action !== "socialize") return 0;
    const profile = getProfile(options.npcId);
    if (!profile) return 0;
    let bias = profile.personality.social * 8;
    const nearby = nearbyRelationship(profile.id, options.nearbySocialNpcIds, options.relationships);
    if (nearby) bias += 6 + nearby.affinity * .12;
    return clamp(bias, 0, MAX_SOCIAL_BIAS);
  }

  const api = Object.freeze({
    catalog, relationships, getProfile, getRelationship, createInitialState,
    getConversation, resolveConversation, getSocialActionBias
  });
  global.CityDaysSocialNpcSystem = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
