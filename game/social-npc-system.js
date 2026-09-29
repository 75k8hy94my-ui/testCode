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
    { id:"ren", name:"レン", gender:"male", age:31, jobType:"office", color:"#86b9a4", homePlaceId:"home", workPlaceId:"office", personality:"責任感が強く世話好き", schedule:[{ start:420, end:510, activity:"commute", placeId:"office" },{ start:510, end:1020, activity:"office-work", placeId:"office" },{ start:1080, end:1200, activity:"evening-run", placeId:"park" }], dialogueStyle:"簡潔で誠実。仕事や地域行事の話題が多い" },
    { id:"yui", name:"ユイ", gender:"female", age:27, jobType:"retail", color:"#e5a66e", homePlaceId:"home", workPlaceId:"store", personality:"社交的で面倒見がよい", schedule:[{ start:420, end:480, activity:"commute", placeId:"store" },{ start:480, end:960, activity:"shop-shift", placeId:"store" },{ start:1020, end:1140, activity:"shopping", placeId:"store" }], dialogueStyle:"親しみやすく、買い物や近所の人の話をする" },
    { id:"haru", name:"ハル", gender:"male", age:20, jobType:"student", color:"#8ec6c1", homePlaceId:"home", workPlaceId:"library", personality:"好奇心旺盛で少しせっかち", schedule:[{ start:450, end:510, activity:"commute", placeId:"library" },{ start:510, end:900, activity:"study", placeId:"library" },{ start:930, end:1050, activity:"sports", placeId:"gym" }], dialogueStyle:"テンポよく、学校や運動の話をする" },
    { id:"kaori", name:"カオリ", gender:"female", age:42, jobType:"office", color:"#b69bd0", homePlaceId:"home", workPlaceId:"office", personality:"頼れる現実派", schedule:[{ start:390, end:480, activity:"commute", placeId:"office" },{ start:480, end:990, activity:"office-work", placeId:"office" },{ start:1050, end:1170, activity:"community", placeId:"community-center" }], dialogueStyle:"落ち着いて助言し、地域の予定をよく知っている" },
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
    createInitialState
  });
});
