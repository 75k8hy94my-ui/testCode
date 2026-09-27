(function initCityDaysPhoneSystem(global) {
  "use strict";

  const APPS = [
    ["phone","電話","☎","#34c759"],["messages","メッセージ","●","#34c759"],
    ["maps","マップ","⌖","#4aa3ff"],["camera","カメラ","◎","#d9dde4"],
    ["photos","写真","✿","#ffffff"],["weather","天気","☀","#4aa3ff"],
    ["calendar","カレンダー","17","#ffffff"],["clock","時計","◷","#15171c"],
    ["notes","メモ","≡","#ffd54f"],["reminders","リマインダー","✓","#ffffff"],
    ["wallet","ウォレット","▰","#1b1d22"],["health","ヘルス","♥","#ffffff"],
    ["find","探す","⌾","#55c759"],["transit","交通","🚆","#4267d5"],
    ["mail","メール","✉","#3c8cf5"],["news","ニュース","N","#f5f5f7"],
    ["music","ミュージック","♫","#ef476f"],["calculator","計算機","＋","#ff9f0a"],
    ["home","ホーム","⌂","#ff9f0a"],["settings","設定","⚙","#8e8e93"]
  ];
  const CONTACT_COLORS = {aoi:"#d596aa",sora:"#7ca4c6",mei:"#b6a176"};

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;");
  }
  function yen(value) { return "¥" + Math.floor(Number(value) || 0).toLocaleString("ja-JP"); }
  function timeText(minute) {
    const value = ((Number(minute) || 0) % 1440 + 1440) % 1440;
    return String(Math.floor(value / 60)).padStart(2,"0") + ":" + String(Math.floor(value % 60)).padStart(2,"0");
  }
  function distText(value) {
    const d = Math.max(0, Number(value) || 0);
    return d < 1000 ? Math.round(d) + "m" : (d / 1000).toFixed(d < 3000 ? 1 : 0) + "km";
  }
  function weatherInfo(value) {
    if (value === "rain") return ["雨","☂"];
    if (value === "cloudy") return ["くもり","☁"];
    return ["晴れ","☀"];
  }
  function avgNeeds(needs) {
    const keys = ["hunger","energy","hygiene","social","fun"];
    return Math.round(keys.reduce(function(sum,key){ return sum + Number(needs && needs[key] || 0); },0) / keys.length);
  }

  function createPhoneSystem(options) {
    const root = options && options.root;
    if (!root) throw new Error("phone root required");
    const cb = options.callbacks || {};
    let model = {};
    let app = null;
    let activeContact = null;
    let overlay = null;
    let locked = false;
    let theme = "dark";
    let reduceMotion = false;
    let textScale = 1;
    let calc = "0";
    let noteDraft = "";
    let reminderDraft = "";
    const calls = [];
    const photos = [];
    const notes = [{id:1,title:"買うもの",text:"牛乳\nパン\nコーヒー",day:1}];
    const reminders = [{id:1,text:"家賃の日を確認",done:false}];
    const chats = {
      aoi:[{from:"them",text:"今日は公園にいるよ"}],
      sora:[{from:"them",text:"カフェ、落ち着いてるよ"}],
      mei:[{from:"them",text:"図書館で勉強中"}]
    };

    function statusBar() {
      const battery = Math.max(12,100 - ((model.day || 1) * 3 + Math.floor((model.minute || 0) / 90)) % 70);
      return '<div class="ios-statusbar"><b>' + timeText(model.minute) + '</b>' +
        '<button class="dynamic-island" type="button" data-phone-action="notifications" aria-label="通知"><span></span></button>' +
        '<button class="ios-status-icons" type="button" data-phone-action="control" aria-label="コントロールセンター"><span>▮▮▮</span><span>⌁</span><span class="battery">' + battery + '</span></button></div>';
    }
    function homeIndicator() {
      return '<button class="ios-home-indicator" type="button" data-phone-action="home-screen" aria-label="ホーム"><span></span></button>';
    }
    function appIcon(def) {
      return '<button class="ios-app" type="button" data-phone-app="' + def[0] + '">' +
        '<span class="ios-app-icon" style="--app-color:' + def[3] + '">' + def[2] + '</span><b>' + def[1] + '</b></button>';
    }
    function shell(title,body,right) {
      return '<div class="ios-app-screen">' + statusBar() +
        '<header class="ios-app-header"><button type="button" data-phone-action="home-screen">‹ <span>ホーム</span></button><strong>' +
        esc(title) + '</strong><div>' + (right || '') + '</div></header><main class="ios-app-content">' +
        body + '</main>' + homeIndicator() + '</div>';
    }
    function contactRow(npc,action) {
      const color = CONTACT_COLORS[npc.id] || "#8e8e93";
      return '<button class="ios-contact-row" type="button" data-phone-action="' + action + '" data-contact-id="' + esc(npc.id) + '">' +
        '<span class="ios-avatar" style="--avatar:' + color + '">' + esc((npc.name || "?").slice(0,1)) + '</span>' +
        '<span><b>' + esc(npc.name) + '</b><small>' + esc(npc.activity || "若葉にいます") + ' · 親密度 ' + (npc.friendship || 0) +
        '</small></span><em>›</em></button>';
    }

    function homeScreen() {
      const weather = weatherInfo(model.weather);
      const grid = APPS.filter(function(def){ return !["phone","messages","maps","camera"].includes(def[0]); }).map(appIcon).join("");
      const dock = APPS.filter(function(def){ return ["phone","messages","maps","camera"].includes(def[0]); }).map(appIcon).join("");
      let live = "";
      if (model.waypoint) {
        live = '<button class="ios-live-card" type="button" data-phone-app="maps"><span>⌖</span><div><b>' +
          esc(model.waypoint.name) + '</b><small>徒歩ナビ · ' + distText(model.waypoint.distance) + '</small></div></button>';
      }
      return '<div class="ios-wallpaper">' + statusBar() + '<main class="ios-home">' +
        '<section class="ios-widget-row"><button class="ios-widget ios-clock-widget" type="button" data-phone-app="clock"><small>Day ' +
        (model.day || 1) + '</small><strong>' + timeText(model.minute) + '</strong><span>' + esc(model.district || "若葉") + '</span></button>' +
        '<button class="ios-widget ios-weather-widget" type="button" data-phone-app="weather"><span class="weather-glyph">' + weather[1] +
        '</span><strong>' + weather[0] + '</strong><small>' + esc(model.district || "若葉") + '</small></button></section>' +
        live + '<section class="ios-app-grid">' + grid + '</section><div class="ios-page-dots"><i></i><i></i></div><nav class="ios-dock">' +
        dock + '</nav></main><button class="ios-side-close" type="button" data-phone-action="close">×</button>' + homeIndicator() + '</div>';
    }

    function phoneApp() {
      const npcs = model.npcs || [];
      const history = calls.length ? calls.slice(-6).reverse().map(function(item){
        return '<div class="ios-list-row"><span>↗</span><div><b>' + esc(item.name) + '</b><small>' + esc(item.when) +
          '</small></div></div>';
      }).join("") : '<div class="ios-empty">履歴はありません</div>';
      return shell("電話",'<section class="ios-section"><h3>よく使う項目</h3>' +
        npcs.map(function(n){return contactRow(n,"call");}).join("") + '</section><section class="ios-section"><h3>履歴</h3>' + history + '</section>');
    }
    function messagesApp() {
      const npcs = model.npcs || [];
      if (!activeContact) return shell("メッセージ",'<section class="ios-section">' + npcs.map(function(n){return contactRow(n,"message");}).join("") + '</section>');
      const npc = npcs.find(function(n){return n.id === activeContact;});
      const items = (chats[activeContact] || []).map(function(m){
        return '<div class="ios-bubble ' + (m.from === "me" ? "me" : "them") + '">' + esc(m.text) + '</div>';
      }).join("");
      const body = '<div class="ios-thread">' + items + '</div><div class="ios-quick-replies">' +
        '<button type="button" data-phone-action="quick-message" data-message="今どこ？">今どこ？</button>' +
        '<button type="button" data-phone-action="quick-message" data-message="あとで会おう">あとで会おう</button>' +
        '<button type="button" data-phone-action="quick-message" data-message="ありがとう！">ありがとう！</button></div>';
      return shell(npc ? npc.name : "メッセージ",body,'<button type="button" data-phone-action="messages-list">一覧</button>');
    }
    function mapsApp() {
      const places = model.places || [];
      const rows = places.map(function(place){
        const active = model.waypoint && model.waypoint.id === place.id;
        return '<button class="ios-place-row ' + (active ? "active" : "") + '" type="button" data-phone-action="route" data-place-id="' +
          esc(place.id) + '"><span style="--place:' + esc(place.color || "#42a5f5") + '">●</span><div><b>' + esc(place.name) +
          '</b><small>' + distText(place.distance) + ' · ' + esc(place.district || "") + '</small></div><em>' +
          (active ? "案内中" : "経路") + '</em></button>';
      }).join("");
      return shell("マップ",'<div class="ios-map-card"><div class="ios-map-grid"></div><span class="map-user-dot"></span><div><b>' +
        esc(model.district || "若葉") + '</b><small>現在地</small></div></div><section class="ios-section"><h3>目的地</h3>' +
        rows + '</section>' + (model.waypoint ? '<button class="ios-wide-button destructive" type="button" data-phone-action="clear-route">案内を終了</button>' : ''));
    }
    function cameraApp() {
      return shell("カメラ",'<div class="ios-camera-view"><div class="camera-focus"></div><span>' + esc(model.district || "若葉") +
        '</span><small>現在のゲーム画面を撮影します</small></div><div class="ios-camera-controls"><button class="camera-thumb" type="button" data-phone-app="photos">' +
        (photos[0] ? '<img src="' + photos[0].dataUrl + '" alt="">' : '') +
        '</button><button class="camera-shutter" type="button" data-phone-action="take-photo"><span></span></button>' +
        '<button class="camera-flip" type="button" data-phone-action="camera-info">↻</button></div>');
    }
    function photosApp() {
      const body = photos.length ? '<div class="ios-photo-grid">' + photos.map(function(photo,index){
        return '<button class="ios-photo" type="button" data-phone-action="photo-info" data-photo-index="' + index +
          '"><img src="' + photo.dataUrl + '" alt="' + esc(photo.location) + '"></button>';
      }).join("") + '</div>' : '<div class="ios-empty tall">まだ写真がありません。カメラで街を撮影できます。</div>';
      return shell("写真",body + '<small class="ios-footnote">' + photos.length + '枚の写真</small>');
    }
    function weatherApp() {
      const w = weatherInfo(model.weather);
      const temp = 18 + ((model.day || 1) * 3 + Math.floor((model.minute || 0) / 180)) % 11;
      return shell("天気",'<div class="ios-weather-hero"><small>' + esc(model.district || "若葉") + '</small><strong>' +
        temp + '°</strong><span>' + w[1] + ' ' + w[0] + '</span><em>最高 ' + (temp+3) + '° / 最低 ' + (temp-5) +
        '°</em></div><section class="ios-glass-card"><h3>時間ごとの予報</h3>' +
        '<div class="ios-forecast"><span>現在</span><b>' + w[1] + ' ' + w[0] + '</b><em>' + temp + '°</em></div>' +
        '<div class="ios-forecast"><span>+3時間</span><b>☀ 晴れ</b><em>' + (temp+1) + '°</em></div>' +
        '<div class="ios-forecast"><span>+6時間</span><b>☁ くもり</b><em>' + (temp-1) + '°</em></div></section>');
    }
    function calendarApp() {
      return shell("カレンダー",'<div class="ios-calendar-date"><small>DAY</small><strong>' + (model.day || 1) +
        '</strong><span>' + timeText(model.minute) + '</span></div><section class="ios-section"><h3>予定</h3>' +
        '<div class="ios-event"><time>終日</time><div><b>Day ' + (model.nextRentDay || 8) + ' 家賃</b><small>' + yen(model.rent) +
        '</small></div></div><div class="ios-event"><time>今日</time><div><b>自由時間</b><small>街で好きなことをする</small></div></div></section>');
    }
    function clockApp() {
      return shell("時計",'<div class="ios-world-clock"><strong>' + timeText(model.minute) + '</strong><span>若葉</span><small>Day ' +
        (model.day || 1) + '</small></div><section class="ios-section"><h3>タイマー</h3><div class="ios-button-row">' +
        '<button type="button" data-phone-action="timer" data-minutes="15">15分</button><button type="button" data-phone-action="timer" data-minutes="30">30分</button>' +
        '<button type="button" data-phone-action="timer" data-minutes="60">1時間</button></div></section>');
    }
    function notesApp() {
      const cards = notes.slice().reverse().map(function(n){
        return '<div class="ios-note-card"><b>' + esc(n.title) + '</b><p>' + esc(n.text).replaceAll("\n","<br>") +
          '</p><small>Day ' + n.day + '</small></div>';
      }).join("");
      return shell("メモ",'<textarea class="ios-note-editor" data-phone-input="note" placeholder="新しいメモ">' + esc(noteDraft) +
        '</textarea><button class="ios-wide-button" type="button" data-phone-action="save-note">メモを保存</button><section class="ios-section"><h3>メモ</h3>' +
        cards + '</section>');
    }
    function remindersApp() {
      const rows = reminders.map(function(item){
        return '<button class="ios-reminder ' + (item.done ? "done" : "") + '" type="button" data-phone-action="toggle-reminder" data-reminder-id="' +
          item.id + '"><i>' + (item.done ? "✓" : "") + '</i><span>' + esc(item.text) + '</span></button>';
      }).join("");
      return shell("リマインダー",'<div class="ios-inline-input"><input data-phone-input="reminder" value="' + esc(reminderDraft) +
        '" placeholder="リマインダーを追加"><button type="button" data-phone-action="save-reminder">追加</button></div><section class="ios-section"><h3>今日</h3>' +
        rows + '</section>');
    }
    function walletApp() {
      return shell("ウォレット",'<div class="ios-wallet-card"><small>WAKABA CASH</small><strong>' + yen(model.cash) +
        '</strong><span>•••• 2026</span></div><section class="ios-section"><h3>今後の支払い</h3>' +
        '<div class="ios-list-row"><span>⌂</span><div><b>家賃</b><small>Day ' + (model.nextRentDay || 8) + '</small></div><em>' +
        yen(model.rent) + '</em></div><div class="ios-list-row"><span>▣</span><div><b>食料</b><small>自宅で料理できます</small></div><em>' +
        (model.groceries || 0) + '</em></div></section>');
    }
    function healthApp() {
      const needs = model.needs || {};
      const pairs = [["空腹","hunger"],["体力","energy"],["清潔","hygiene"],["交流","social"],["楽しさ","fun"]];
      const rows = pairs.map(function(pair){
        const value = Math.round(Number(needs[pair[1]]) || 0);
        const color = value < 25 ? "#ff453a" : value < 50 ? "#ff9f0a" : "#30d158";
        return '<div class="ios-health-row"><span>' + pair[0] + '</span><div><i style="width:' + value + '%;background:' + color +
          '"></i></div><b>' + value + '</b></div>';
      }).join("");
      return shell("ヘルス",'<div class="ios-health-ring"><strong>' + avgNeeds(needs) +
        '%</strong><span>総合コンディション</span></div><section class="ios-section">' + rows +
        '</section><section class="ios-metric-grid"><div><small>フィットネス</small><b>' + (model.fitness || 0) +
        '</b></div><div><small>図書館</small><b>' + (model.libraryVisits || 0) + '回</b></div><div><small>運転評価</small><b>' +
        (model.drivingRating || 100) + '</b></div><div><small>シフト</small><b>' + (model.shiftsWorked || 0) + '</b></div></section>');
    }
    function findApp() {
      const friends = (model.npcs || []).map(function(npc){
        return '<div class="ios-list-row"><span class="ios-avatar small" style="--avatar:' + (CONTACT_COLORS[npc.id] || "#8e8e93") + '">' +
          esc((npc.name || "?").slice(0,1)) + '</span><div><b>' + esc(npc.name) + '</b><small>' +
          (npc.hidden ? "屋内" : distText(npc.distance)) + ' · ' + esc(npc.activity || "") + '</small></div></div>';
      }).join("");
      return shell("探す",'<div class="ios-find-map"><span class="find-me"></span><span class="find-car">●</span></div>' +
        '<section class="ios-section"><h3>持ち物</h3><div class="ios-list-row"><span>🚗</span><div><b>マイカー</b><small>' +
        distText(model.carDistance) + '</small></div></div></section><section class="ios-section"><h3>友達</h3>' + friends + '</section>');
    }
    function transitApp() {
      const stations = model.stations || [];
      const trains = model.trains || [];
      const rows = stations.map(function(station,index){
        const stopped = trains.some(function(t){return t.stationIndex === index && t.dwell > .05;});
        return '<div class="ios-transit-row"><i>' + (index+1) + '</i><div><b>' + esc(station.name) + '</b><small>' +
          distText(station.distance) + '</small></div><em>' + (stopped ? "停車中" : "運行中") + '</em></div>';
      }).join("");
      return shell("交通",'<div class="ios-transit-line"><span></span><b>若葉線</b><span></span></div><section class="ios-section"><h3>駅</h3>' + rows + '</section>');
    }
    function mailApp() {
      return shell("メール",'<section class="ios-mail-list"><article><span>若</span><div><b>若葉不動産</b><strong>家賃のお知らせ</strong><p>次回は Day ' +
        (model.nextRentDay || 8) + '、' + yen(model.rent) + 'です。</p></div></article><article><span>C</span><div><b>CITY DAYS</b><strong>今日の街情報</strong><p>' +
        esc(model.district || "若葉") + 'で自由に過ごせます。</p></div></article><article><span>交</span><div><b>若葉交通</b><strong>運行情報</strong><p>若葉線は通常運行です。</p></div></article></section>');
    }
    function newsApp() {
      const w = weatherInfo(model.weather);
      return shell("ニュース",'<div class="ios-news-hero"><small>WAKABA NEWS</small><strong>若葉駅前、人通りは平常</strong><p>' +
        esc(model.district || "市内") + '周辺では交通が流れています。</p></div><section class="ios-section">' +
        '<article class="ios-news-row"><div></div><span><b>今日の天気は' + w[0] + '</b><small>外出前に天気を確認しましょう。</small></span></article>' +
        '<article class="ios-news-row"><div></div><span><b>若葉線は通常運行</b><small>西若葉・若葉・東若葉の3駅を結びます。</small></span></article></section>');
    }
    function musicApp() {
      return shell("ミュージック",'<div class="ios-album-art">CITY<br>DAYS</div><div class="ios-now-playing"><small>再生中</small><strong>若葉 Ambient</strong><span>City Soundscape</span></div>' +
        '<div class="ios-player-controls"><button type="button">‹‹</button><button type="button" data-phone-action="sound-toggle">' +
        (model.soundEnabled ? "Ⅱ" : "▶") + '</button><button type="button">››</button></div><section class="ios-section"><div class="ios-setting-row"><span>ゲーム音声</span>' +
        '<button class="ios-switch ' + (model.soundEnabled ? "on" : "") + '" type="button" data-phone-action="sound-toggle"><i></i></button></div></section>');
    }
    function calcApp() {
      const keys = ["AC","±","%","÷","7","8","9","×","4","5","6","−","1","2","3","+","0",".","="];
      return shell("計算機",'<div class="ios-calc-display">' + esc(calc) + '</div><div class="ios-calc-grid">' +
        keys.map(function(key){return '<button type="button" data-phone-action="calc" data-calc="' + esc(key) + '">' + key + '</button>';}).join("") + '</div>');
    }
    function homeApp() {
      const near = Number(model.homeDistance) <= 230;
      const action = model.inHome ? "自宅の状態を見る" : near ? "自宅に入る" : "自宅まで案内";
      return shell("ホーム",'<div class="ios-home-house"><span>⌂</span><strong>自宅</strong><small>' +
        (model.inHome ? "在宅中" : distText(model.homeDistance)) + '</small></div><section class="ios-section"><h3>クイック操作</h3>' +
        '<button class="ios-setting-row action" type="button" data-phone-action="home-action"><span>' + action +
        '</span><em>›</em></button></section><section class="ios-section"><h3>住環境</h3><div class="ios-list-row"><span>◉</span><div><b>室内</b><small>料理・シャワー・睡眠・休憩</small></div></div></section>');
    }
    function settingsApp() {
      return shell("設定",'<div class="ios-settings-profile"><span>CD</span><div><b>City Days</b><small>ゲーム内端末</small></div></div>' +
        '<section class="ios-section"><div class="ios-setting-row"><span>サウンド</span><button class="ios-switch ' +
        (model.soundEnabled ? "on" : "") + '" type="button" data-phone-action="sound-toggle"><i></i></button></div>' +
        '<div class="ios-setting-row"><span>ライトモード</span><button class="ios-switch ' + (theme === "light" ? "on" : "") +
        '" type="button" data-phone-action="theme-toggle"><i></i></button></div><div class="ios-setting-row"><span>視差効果を減らす</span>' +
        '<button class="ios-switch ' + (reduceMotion ? "on" : "") + '" type="button" data-phone-action="motion-toggle"><i></i></button></div></section>' +
        '<section class="ios-section"><h3>文字サイズ</h3><div class="ios-button-row"><button type="button" data-phone-action="text-size" data-size=".9">小</button>' +
        '<button type="button" data-phone-action="text-size" data-size="1">標準</button><button type="button" data-phone-action="text-size" data-size="1.12">大</button></div></section>' +
        '<section class="ios-section"><button class="ios-setting-row action" type="button" data-phone-action="lock"><span>端末をロック</span><em>›</em></button></section>');
    }

    function appScreen() {
      if (app === "phone") return phoneApp();
      if (app === "messages") return messagesApp();
      if (app === "maps") return mapsApp();
      if (app === "camera") return cameraApp();
      if (app === "photos") return photosApp();
      if (app === "weather") return weatherApp();
      if (app === "calendar") return calendarApp();
      if (app === "clock") return clockApp();
      if (app === "notes") return notesApp();
      if (app === "reminders") return remindersApp();
      if (app === "wallet") return walletApp();
      if (app === "health") return healthApp();
      if (app === "find") return findApp();
      if (app === "transit") return transitApp();
      if (app === "mail") return mailApp();
      if (app === "news") return newsApp();
      if (app === "music") return musicApp();
      if (app === "calculator") return calcApp();
      if (app === "home") return homeApp();
      if (app === "settings") return settingsApp();
      return homeScreen();
    }

    function notifications() {
      const rows = [];
      if (Number(model.needs && model.needs.energy || 100) < 30) rows.push(["ヘルス","体力が低下しています。休息を取りましょう。"]);
      if (Number(model.needs && model.needs.hunger || 100) < 30) rows.push(["ヘルス","空腹です。食事をおすすめします。"]);
      if (Number(model.cash || 0) < Number(model.rent || 0)) rows.push(["ウォレット","次回家賃に対して所持金が不足しています。"]);
      if (model.waypoint) rows.push(["マップ",model.waypoint.name + "まで " + distText(model.waypoint.distance)]);
      rows.push(["天気",weatherInfo(model.weather)[0] + " · " + (model.district || "若葉")]);
      return '<div class="ios-overlay-panel">' + statusBar() + '<header><button type="button" data-phone-action="notifications">閉じる</button><strong>通知センター</strong><span></span></header><main>' +
        rows.map(function(n){return '<article class="ios-notification"><b>' + esc(n[0]) + '</b><p>' + esc(n[1]) + '</p><small>今</small></article>';}).join("") +
        '</main>' + homeIndicator() + '</div>';
    }
    function controlCenter() {
      return '<div class="ios-overlay-panel ios-control-center">' + statusBar() +
        '<header><button type="button" data-phone-action="control">閉じる</button><strong>コントロールセンター</strong><span></span></header><main>' +
        '<div class="ios-control-grid"><button class="' + (model.soundEnabled ? "active" : "") + '" type="button" data-phone-action="sound-toggle"><b>♫</b><span>サウンド</span></button>' +
        '<button class="' + (theme === "light" ? "active" : "") + '" type="button" data-phone-action="theme-toggle"><b>☀</b><span>表示</span></button>' +
        '<button class="' + (reduceMotion ? "active" : "") + '" type="button" data-phone-action="motion-toggle"><b>◌</b><span>視差低減</span></button>' +
        '<button type="button" data-phone-action="lock"><b>⌁</b><span>ロック</span></button></div></main>' + homeIndicator() + '</div>';
    }
    function lockScreen() {
      const w = weatherInfo(model.weather);
      return '<div class="ios-lock-screen">' + statusBar() + '<main><small>Day ' + (model.day || 1) + '</small><strong>' +
        timeText(model.minute) + '</strong><span>' + w[1] + ' ' + w[0] + ' · ' + esc(model.district || "若葉") +
        '</span><div class="ios-lock-notification"><b>City Days</b><p>' + esc(model.statusMessage || "今日も若葉の街で過ごしましょう。") +
        '</p></div></main><button class="ios-unlock" type="button" data-phone-action="unlock">タップして開く</button>' +
        '<button class="ios-side-close" type="button" data-phone-action="close">×</button>' + homeIndicator() + '</div>';
    }

    function render() {
      root.classList.toggle("phone-theme-light",theme === "light");
      root.classList.toggle("phone-reduce-motion",reduceMotion);
      root.style.setProperty("--phone-text-scale",String(textScale));
      root.innerHTML = locked ? lockScreen() : overlay === "notifications" ? notifications() : overlay === "control" ? controlCenter() : appScreen();
    }
    function goHome() { app = null; activeContact = null; overlay = null; render(); }
    function evaluate(expression) {
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) return "エラー";
      try {
        const value = Function('"use strict";return (' + expression + ')')();
        return Number.isFinite(value) ? String(Math.round(value * 1e8) / 1e8) : "エラー";
      } catch (_) { return "エラー"; }
    }
    function calcKey(key) {
      const ops = {"×":"*","÷":"/","−":"-"};
      if (key === "AC") calc = "0";
      else if (key === "=") calc = evaluate(calc);
      else if (key === "±") calc = calc.startsWith("-") ? calc.slice(1) : "-" + calc;
      else if (key === "%") calc = String((Number(calc) || 0) / 100);
      else {
        const value = ops[key] || key;
        calc = calc === "0" && /[0-9.]/.test(value) ? value : calc + value;
        if (calc.length > 28) calc = calc.slice(-28);
      }
    }

    root.addEventListener("input",function(event){
      if (event.target && event.target.dataset.phoneInput === "note") noteDraft = event.target.value;
      if (event.target && event.target.dataset.phoneInput === "reminder") reminderDraft = event.target.value;
    });
    root.addEventListener("dblclick",function(event){
      if (event.target && event.target.closest && event.target.closest(".ios-statusbar")) { overlay = "control"; render(); }
    });
    root.addEventListener("click",function(event){
      const appButton = event.target && event.target.closest ? event.target.closest("[data-phone-app]") : null;
      if (appButton) { app = appButton.dataset.phoneApp; overlay = null; if (app !== "messages") activeContact = null; render(); return; }
      const button = event.target && event.target.closest ? event.target.closest("[data-phone-action]") : null;
      if (!button) return;
      const action = button.dataset.phoneAction;
      if (action === "close") cb.close && cb.close();
      else if (action === "home-screen") goHome();
      else if (action === "unlock") { locked = false; render(); }
      else if (action === "lock") { locked = true; app = null; overlay = null; render(); }
      else if (action === "notifications") { overlay = overlay === "notifications" ? null : "notifications"; render(); }
      else if (action === "control") { overlay = overlay === "control" ? null : "control"; render(); }
      else if (action === "message") { activeContact = button.dataset.contactId; app = "messages"; render(); }
      else if (action === "messages-list") { activeContact = null; render(); }
      else if (action === "quick-message") {
        if (!activeContact) return;
        chats[activeContact] = chats[activeContact] || [];
        chats[activeContact].push({from:"me",text:button.dataset.message || "了解"});
        if (cb.message) cb.message(activeContact,button.dataset.message || "了解");
        render();
      } else if (action === "call") {
        const npc = (model.npcs || []).find(function(n){return n.id === button.dataset.contactId;});
        if (!npc) return;
        calls.push({name:npc.name,when:"Day " + (model.day || 1) + " " + timeText(model.minute)});
        if (cb.call) cb.call(npc.id);
        render();
      } else if (action === "route") { if (cb.route) cb.route(button.dataset.placeId); }
      else if (action === "clear-route") { if (cb.clearRoute) cb.clearRoute(); }
      else if (action === "take-photo") {
        const photo = cb.capturePhoto ? cb.capturePhoto() : null;
        if (photo && photo.dataUrl) { photos.unshift(photo); if (photos.length > 18) photos.pop(); if (cb.toast) cb.toast("写真を保存しました"); render(); }
      } else if (action === "photo-info") {
        const photo = photos[Number(button.dataset.photoIndex)];
        if (photo && cb.toast) cb.toast(photo.location + " · Day " + photo.day + " " + timeText(photo.minute));
      } else if (action === "camera-info") { if (cb.toast) cb.toast("背面カメラ · ゲーム画面キャプチャ"); }
      else if (action === "timer") { if (cb.toast) cb.toast(button.dataset.minutes + "分タイマーを開始しました"); }
      else if (action === "save-note") {
        const text = noteDraft.trim();
        if (text) { notes.push({id:Date.now(),title:text.split("\n")[0].slice(0,24),text:text,day:model.day || 1}); noteDraft = ""; render(); }
      } else if (action === "save-reminder") {
        const text = reminderDraft.trim();
        if (text) { reminders.push({id:Date.now(),text:text,done:false}); reminderDraft = ""; render(); }
      } else if (action === "toggle-reminder") {
        const item = reminders.find(function(r){return String(r.id) === button.dataset.reminderId;});
        if (item) item.done = !item.done;
        render();
      } else if (action === "sound-toggle") { if (cb.setSound) cb.setSound(!model.soundEnabled); }
      else if (action === "theme-toggle") { theme = theme === "dark" ? "light" : "dark"; render(); }
      else if (action === "motion-toggle") { reduceMotion = !reduceMotion; render(); }
      else if (action === "text-size") { textScale = Number(button.dataset.size) || 1; render(); }
      else if (action === "home-action") { if (cb.homeAction) cb.homeAction(); }
      else if (action === "calc") { calcKey(button.dataset.calc); render(); }
    });

    return Object.freeze({
      update:function(next){ model = next || model; if (!root.hidden) render(); },
      open:function(){ render(); },
      home:goHome,
      openApp:function(id){ if (APPS.some(function(def){return def[0] === id;})) { app = id; overlay = null; render(); } },
      getState:function(){ return {app:app,locked:locked,theme:theme,reduceMotion:reduceMotion,textScale:textScale,photoCount:photos.length}; }
    });
  }

  const api = Object.freeze({createPhoneSystem:createPhoneSystem,appCount:APPS.length});
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysPhoneSystem = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
