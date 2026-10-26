import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('video-playback-privacy.css');

test('each SPA entry applies the persisted video privacy preferences before mounting the library', () => {
  for (const entry of ['home.html', 'manga.html', 'video.html', 'profile.html']) {
    const html = read(entry);
    const stylesheet = html.indexOf('video-playback-privacy.css?v=20261026-video-list-privacy');
    const settings = html.indexOf('video-playback-privacy.js?v=20261026');
    const bootstrap = html.search(/home-profile-spa\.js\?v=[\w-]+/);
    assert.ok(stylesheet >= 0, entry + ' must load the list/player masking CSS');
    assert.ok(settings >= 0 && settings < bootstrap, entry + ' must restore settings before the SPA starts');
  }
  assert.match(read('video-player.html'), /video-playback-privacy\.css\?v=20261026-video-list-privacy/);
});

test('the thumbnail preference hides actual preview descendants but retains the clickable frame and duration', () => {
  assert.match(css, /data-video-mask-video="1"\] #videoListSection \.videoCardThumb/);
  assert.match(css, /data-video-mask-video="1"\] #videoPlayerPage \.videoRelated \.videoCardThumb/);
  assert.match(css, /\.videoCardThumb > :not\(\.videoCardDuration\)/);
  assert.match(css, /background:\s*#000\s*!important/);
  assert.match(css, /visibility:\s*hidden\s*!important/);
  assert.doesNotMatch(css, /#videoListSection\s*\{\s*display:\s*none/);
});

test('text preference hides editable list-card metadata while leaving menus and filters operable', () => {
  for (const field of ['videoCardTitle', 'videoCardMeta', 'videoCardBookmarkDomain', 'videoCardLabels', 'videoCardLabel']) {
    assert.ok(css.includes('.' + field), field + ' must be masked');
  }
  assert.match(css, /data-video-mask-metadata="1"\] #videoListSection \.videoCard/);
  assert.match(css, /-webkit-text-fill-color:\s*transparent\s*!important/);
  assert.match(css, /::selection/);
  assert.doesNotMatch(css, /#videoListSection \.videoCardMenu(?:Button|Action)\s*[{,]/);
  const profile = read('home-profile-spa.js');
  assert.match(profile, /動画一覧・再生ページの黒塗り/);
  assert.match(profile, /再生映像・一覧のサムネイルを黒くする/);
});

test('bookmark cards have no thumbnail and retain click-through behavior', () => {
  const card = read('video-card.js');
  assert.match(card, /if \(!isBookmark\) \{/);
  assert.match(card, /const thumb = doc\.createElement\('div'\); thumb\.className = 'videoCardThumb'/);
  assert.match(card, /if \(options\.openHref\) titleTarget\.href = options\.openHref/);
});
