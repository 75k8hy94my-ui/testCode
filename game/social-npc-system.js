(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CityDaysSocialNpcSystem = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const freezeTree = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeTree);
    return Object.freeze(value);
  };

  const catalog = freezeTree([
    { id:"aoi", name:"アオイ", gender:"female", age:28, jobType:"freelance", color:"#e0a7b5", homePlaceId:"home", workPlaceId:"park", personality:"気さくで好奇心旺盛", schedule:[{ start:360, end:540, activity:"morning-walk", placeId:"park" },{ start:600, end:1020, activity:"freelance-work", placeId:"home" },{ start:1020, end:1200, activity:"park-walk", placeId:"park" }], dialogueStyle:"明るく、散歩や街の小さな発見を話題にする" },
    { id:"sora", name:"ソラ", gender:"male", age:24, jobType:"cafe", color:"#a9c9e3", homePlaceId:"home", workPlaceId:"cafe", personality:"穏やかで聞き上手", schedule:[{ start:390, end:480, activity:"commute", placeId:"cafe" },{ start:480, end:960, activity:"cafe-shift", placeId:"cafe" },{ start:1020, end:1200, activity:"cafe-break", placeId:"park" }], dialogueStyle:"落ち着いた口調で、飲み物や喫茶店の話をする" },
    { id:"mei", name:"メイ", gender:"female", age:22, jobType:"student", color:"#c8b58f", homePlaceId:"home", workPlaceId:"library", personality:"まじめで少し人見知り", schedule:[{ start:450, end:510, activity:"commute", placeId:"library" },{ start:510, end:930, activity:"study", placeId:"library" },{ start:960, end:1080, activity:"reading", placeId:"park" }], dialogueStyle:"丁寧で、読書や勉強の話になると熱心" },
    { id:"ren", name:"レン", gender:"male", age:31, jobType:"office", color:"#86b9a4", homePlaceId:"home", workPlaceId:null, personality:"責任感が強く世話好き", schedule:[{ start:420, end:510, activity:"commute", placeId:null },{ start:510, end:1020, activity:"office-work", placeId:null },{ start:1080, end:1200, activity:"evening-run", placeId:"park" }], dialogueStyle:"簡潔で誠実。仕事や地域行事の話題が多い" },
    { id:"yui", name:"ユイ", gender:"female", age:27, jobType:"retail", color:"#e5a66e", homePlaceId:"home", workPlaceId:"store", personality:"社交的で面倒見がよい", schedule:[{ start:420, end:480, activity:"commute", placeId:"store" },{ start:480, end:960, activity:"shop-shift", placeId:"store" },{ start:1020, end:1140, activity:"shopping", placeId:"store" }], dialogueStyle:"親しみやすく、買い物や近所の人の話をする" },
    { id:"haru", name:"ハル", gender:"male", age:20, jobType:"student", color:"#8ec6c1", homePlaceId:"home", workPlaceId:"library", personality:"好奇心旺盛で少しせっかち", schedule:[{ start:450, end:510, activity:"commute", placeId:"library" },{ start:510, end:900, activity:"study", placeId:"library" },{ start:930, end:1050, activity:"sports", placeId:"gym" }], dialogueStyle:"テンポよく、学校や運動の話をする" },
    { id:"kaori", name:"カオリ", gender:"female", age:42, jobType:"office", color:"#b69bd0", homePlaceId:"home", workPlaceId:null, personality:"頼れる現実派", schedule:[{ start:390, end:480, activity:"commute", placeId:null },{ start:480, end:990, activity:"office-work", placeId:null },{ start:1050, end:1170, activity:"community", placeId:"community-center" }], dialogueStyle:"落ち着いて助言し、地域の予定をよく知っている" },
    { id:"daichi", name:"ダイチ", gender:"male", age:35, jobType:"gym", color:"#d58f83", homePlaceId:"home", workPlaceId:"gym", personality:"朗らかで活動的", schedule:[{ start:420, end:510, activity:"morning-training", placeId:"gym" },{ start:540, end:1020, activity:"gym-work", placeId:"gym" },{ start:1050, end:1170, activity:"park-walk", placeId:"park" }], dialogueStyle:"元気な口調で、運動や健康の話をする" },
    { id:"nana", name:"ナナ", gender:"female", age:30, jobType:"library", color:"#d391ad", homePlaceId:"home", workPlaceId:"library", personality:"静かで観察力がある", schedule:[{ start:420, end:480, activity:"commute", placeId:"library" },{ start:480, end:960, activity:"library-work", placeId:"library" },{ start:1020, end:1140, activity:"reading", placeId:"cafe" }], dialogueStyle:"やわらかな口調で、本や季節の話をする" },
    { id:"toma", name:"トウマ", gender:"male", age:39, jobType:"retail", color:"#b0a16e", homePlaceId:"home", workPlaceId:"store", personality:"気さくで頼りがいがある", schedule:[{ start:390, end:480, activity:"commute", placeId:"store" },{ start:480, end:1020, activity:"shop-shift", placeId:"store" },{ start:1080, end:1200, activity:"cafe-stop", placeId:"cafe" }], dialogueStyle:"気取らず率直。食べ物や昔からの街の話をする" }
  ]);

  const relationships = freezeTree([
    { aId:"aoi", bId:"sora", type:"friend", initialAffinity:48 },
    { aId:"aoi", bId:"mei", type:"friend", initialAffinity:35 },
    { aId:"aoi", bId:"yui", type:"friend", initialAffinity:44 },
    { aId:"aoi", bId:"daichi", type:"friend", initialAffinity:40 },
    { aId:"sora", bId:"ren", type:"friend", initialAffinity:38 },
    { aId:"sora", bId:"nana", type:"coworker", initialAffinity:62 },
    { aId:"sora", bId:"toma", type:"friend", initialAffinity:45 },
    { aId:"mei", bId:"haru", type:"friend", initialAffinity:56 },
    { aId:"mei", bId:"nana", type:"coworker", initialAffinity:50 },
    { aId:"ren", bId:"yui", type:"family", initialAffinity:72 },
    { aId:"ren", bId:"kaori", type:"coworker", initialAffinity:60 },
    { aId:"ren", bId:"daichi", type:"friend", initialAffinity:42 },
    { aId:"yui", bId:"toma", type:"coworker", initialAffinity:67 },
    { aId:"haru", bId:"daichi", type:"friend", initialAffinity:37 },
    { aId:"kaori", bId:"nana", type:"friend", initialAffinity:41 },
    { aId:"kaori", bId:"toma", type:"acquaintance", initialAffinity:24 }
  ]);

  const byId = new Map(catalog.map((profile) => [profile.id, profile]));
  const pairKey = (aId, bId) => [aId, bId].sort().join("|");
  const relationshipByPair = new Map(relationships.map((relationship) => [pairKey(relationship.aId, relationship.bId), relationship]));

  function getConversation({ npcId, minute = 720, day = 1, activityId = "", friendship = 0, relationship = null } = {}) {
    const profile = byId.get(npcId);
    if (!profile) return null;
    const time = Number.isFinite(minute) ? ((Math.floor(minute) % 1440) + 1440) % 1440 : 720;
    const dayNumber = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;
    const activity = String(activityId || "").toLowerCase();
    const busy = /work|shift|study|commute|class/.test(activity);
    const sleeping = /sleep|bed/.test(activity);
    const weekend = ((dayNumber - 1) % 7) >= 5;
    const timeBand = time < 600 ? "morning" : time < 1020 ? "day" : "evening";
    const topic = sleeping ? "rest" : busy ? "work" : weekend ? "weekend" : timeBand;
    const topicLines = {
      rest: `${profile.name}は少し眠そうだ。「ごめんね、そろそろ休ませて。」`,
      work: `${profile.name}は時計を気にした。「今は勤務の途中なんだ。またあとで話そう。」`,
      morning: `${profile.name}は笑顔で朝の挨拶をした。「朝の空気って気持ちいいね。」`,
      day: `${profile.name}は${profile.dialogueStyle.split("。")[0]}様子で話しかけた。「今日はこのあと${profile.schedule.find((slot) => time < slot.end)?.activity || "ゆっくり"}をする予定だよ。」`,
      evening: `${profile.name}はほっとした表情を見せた。「一日おつかれさま。${profile.dialogueStyle.split("。")[0]}の話をしよう。」`,
      weekend: `${profile.name}は休日らしくのんびりしている。「今日は少しゆっくりできそう。」`
    };
    const relationLabel = relationship?.type === "family" ? "家族のことも" : relationship?.type === "coworker" ? "仕事仲間のことも" : null;
    const line = relationLabel && !busy && !sleeping ? `${topicLines[topic]} ${relationLabel}気にかけているよ。` : topicLines[topic];
    const options = [
      { id:"greet", label:"挨拶する" },
      { id:"ask", label:Number(friendship) >= 3 ? "もっと話を聞く" : "近況を聞く" },
      { id:"invite", label:"公園に誘う" }
    ];
    return { topic, line, options };
  }

  function resolveConversation({ npcId, optionId, minute = 720, day = 1, activityId = "", friendship = 0, relationship = null, needs = {} } = {}) {
    const profile = byId.get(npcId);
    if (!profile) return null;
    const currentFriendship = Number.isFinite(Number(friendship)) ? Math.max(0, Math.min(100, Number(friendship))) : 0;
    const activity = String(activityId || "").toLowerCase();
    const sleeping = /sleep|bed/.test(activity);
    const busy = /work|shift|study|commute|class/.test(activity);
    const time = Number.isFinite(minute) ? ((Math.floor(minute) % 1440) + 1440) % 1440 : 720;
    const dayNumber = Number.isFinite(day) ? Math.max(1, Math.floor(day)) : 1;
    let response;
    let desiredDelta = 0;
    let activityRequest = null;
    let needsDelta = {};
    let topic = getConversation({ npcId, minute:time, day:dayNumber, activityId, friendship:currentFriendship, relationship }).topic;

    if (optionId === "greet") {
      response = sleeping ? "小さく会釈を返し、また休み始めた。" : busy ? "「声をかけてくれてありがとう。仕事に戻るね。」" : `${profile.name}は嬉しそうに挨拶を返した。`;
      desiredDelta = sleeping ? 0 : 1;
      needsDelta = { energy:-1 };
    } else if (optionId === "ask") {
      response = busy ? "「あとで落ち着いたら話すね。」" : `${profile.name}は${profile.dialogueStyle.split("。")[0]}調子で、最近の出来事を話してくれた。`;
      desiredDelta = busy ? 0 : 2;
      needsDelta = { social:1 };
    } else if (optionId === "invite") {
      const energy = Number.isFinite(Number(needs?.energy)) ? Number(needs.energy) : 50;
      const late = time >= 23 * 60 || time < 7 * 60;
      const refusal = sleeping ? "「ごめんね、もう休ませて。」" : busy ? "「今は勤務の途中だから、抜けられないんだ。」" : late ? "「今日はもう遅いから、また今度にしよう。」" : energy < 20 ? "「少し疲れているから、今日はゆっくりしたいな。」" : null;
      if (refusal) {
        response = refusal;
      } else {
        response = `${profile.name}は誘いに応じた。「公園で少し話そう。」`;
        desiredDelta = 1;
        needsDelta = { social:2, energy:-2 };
        activityRequest = { actionId:"social-meetup", placeId:"park", expiresAt:(dayNumber - 1) * 1440 + time + 120 };
      }
    } else {
      return null;
    }
    const friendshipDelta = Math.max(-currentFriendship, Math.min(100 - currentFriendship, desiredDelta));
    const relationshipDelta = optionId === "ask" && relationship?.type ? 1 : 0;
    return { response, friendshipDelta, relationshipDelta, needsDelta, activityRequest, topic };
  }

  function getSocialActionBias({ npcId, action, relationships: affinityByPair = {}, nearbySocialNpcIds = [] } = {}) {
    if (!byId.has(npcId) || !String(action || "").startsWith("social:")) return 0;
    const affinity = nearbySocialNpcIds.reduce((best, otherId) => {
      if (!byId.has(otherId) || otherId === npcId) return best;
      const value = Number(affinityByPair[pairKey(npcId, otherId)]);
      return Number.isFinite(value) ? Math.max(best, value) : best;
    }, 0);
    return affinity >= 40 ? Math.min(0.15, 0.03 + (affinity - 40) / 1000) : 0;
  }

  function createInitialState() {
    const friendship = Object.fromEntries(catalog.map(({ id }) => [id, 0]));
    const relationshipState = Object.fromEntries(relationships.map(({ aId, bId, initialAffinity }) => [pairKey(aId, bId), initialAffinity]));
    const recentTopics = Object.fromEntries(catalog.map(({ id }) => [id, null]));
    return { friendship, relationships: relationshipState, recentTopics };
  }

  return Object.freeze({
    catalog,
    relationships,
    getProfile(id) { return byId.get(id) || null; },
    getRelationship(aId, bId) {
      if (!byId.has(aId) || !byId.has(bId) || aId === bId) return null;
      return relationshipByPair.get(pairKey(aId, bId)) || null;
    },
    getConversation,
    resolveConversation,
    getSocialActionBias,
    createInitialState
  });
});
