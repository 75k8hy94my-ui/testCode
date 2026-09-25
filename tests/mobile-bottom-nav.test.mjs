import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const js = read('mobile-bottom-nav.js');
const css = read('mobile-bottom-nav.css');

test('SPA Liquid Glass nav has four icon-and-label destinations', () => {
  for (const [id, href, label] of [
    ['mobileNavHome','home.html','ホーム'],
    ['mobileNavManga','manga.html','漫画'],
    ['mobileNavVideo','video.html','動画'],
    ['mobileNavProfile','profile.html','プロフィール'],
  ]) {
    assert.ok(js.includes(id), id);
    assert.ok(js.includes(href), href);
    assert.ok(js.includes(label), label);
  }
  assert.match(js, /mobileNavGlyph/);
  assert.match(js, /liquidGlassNavLabel/);
});

test('one movable lens represents the active tab', () => {
  assert.match(js, /createLens\(\)/);
  assert.match(js, /liquidGlassSelection/);
  assert.match(js, /lens\.animate\(/);
  assert.match(js, /state\.lensMetrics/);
  assert.match(js, /cubic-bezier\(\.22,\.86,\.36,1\)/);
  assert.match(css, /\.liquidGlassSelection\{/);
  assert.match(css, /will-change:transform,width/);
});

test('glass responds to touch position, press, scrolling, and accessibility preferences', () => {
  assert.match(js, /pointermove/);
  assert.match(js, /pointerdown/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /--glass-light-x/);
  assert.match(js, /liquidPressed/);
  assert.match(js, /liquidNavCompact/);
  assert.match(js, /document\.addEventListener\('scroll'/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /prefers-reduced-transparency:reduce/);
  assert.match(css, /@supports not \(\(backdrop-filter:blur\(1px\)\)/);
});

test('glass is theme-aware, safe-area-aware, and constrained on phones', () => {
  assert.match(css, /width:min\(360px,calc\(100vw - 32px\)\)/);
  assert.match(css, /bottom:max\(10px,env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /html\[data-theme="light"\] #mobileBottomNav\.liquidGlassNav/);
  assert.match(css, /--glass-fill:/);
  assert.match(css, /blur\(34px\) saturate\(180%\) contrast\(106%\)/);
  assert.match(css, /inset 0 1px 0 var\(--glass-highlight\)/);
});

test('reader keeps its special controls while using the shared glass engine', () => {
  const reader = read('reader.html');
  const template = read('reader-mobile-nav-template.js');
  assert.match(template, /mobileNavManga/);
  assert.match(template, /mobileNavVideo/);
  assert.match(template, /mobileNavMore/);
  assert.ok(reader.indexOf('reader-mobile-nav-template.js') < reader.indexOf('mobile-bottom-nav.js?v=20260925-instagram-persistent-pill'));
  assert.match(js, /readerFallbackTarget/);
  assert.match(js, /nav\.classList\.contains\('reader-mode'\)/);
  assert.match(js, /querySelector\('#mobileNavMore'\)/);
});

test('shared nav is loaded by all target mobile pages', () => {
  for (const page of ['home.html','profile.html','manga.html','video.html','reader.html','video-player.html']) {
    const source = read(page);
    assert.match(source, /mobile-bottom-nav\.css\?v=20260925-instagram-persistent-pill/, page);
    assert.match(source, /mobile-bottom-nav\.js\?v=20260925-instagram-persistent-pill/, page);
  }
});

test('light glass stays translucent instead of becoming a white card', () => {
  assert.match(css, /--glass-fill:rgba\(244,247,251,.24\)/);
  assert.match(css, /--glass-lens:rgba\(229,238,248,.055\)/);
  assert.match(css, /--glass-lens-edge:rgba\(255,255,255,.66\)/);
  assert.match(css, /blur\(10px\) saturate\(165%\) brightness\(1\.035\)/);
});

test('selected lens is edge-driven rather than white-filled', () => {
  assert.match(css, /--glass-lens:rgba\(229,238,248,.055\)/);
  assert.match(css, /\.liquidGlassSelection\{/);
  assert.match(css, /bottom:7px/);
  assert.match(css, /rgba\(75,82,92,.12\)/);
});

test('clear glass remains legible on a flat light background', () => {
  assert.match(css, /Edge-defined clear glass/);
  assert.match(css, /inset 0 1\.4px 0 rgba\(255,255,255,.92\)/);
  assert.match(css, /inset 0 -1\.4px 0 rgba\(91,103,120,.16\)/);
  assert.match(css, /inset 0 1\.5px 0 rgba\(255,255,255,.94\)/);
  assert.match(css, /inset 0 -1\.5px 0 rgba\(83,96,114,.18\)/);
  assert.match(css, /rgba\(102,124,151,.20\)/);
});

test('selection lens is inset inside each tab', () => {
  assert.match(js, /const lensInset = nav\.dataset\.mobileNavKind === 'spa' \? 4 : 3/);
  assert.match(js, /itemRect\.left - navRect\.left \+ lensInset/);
  assert.match(js, /itemRect\.width - lensInset \* 2/);
  assert.match(css, /top:7px;[\s\S]*bottom:7px;/);
});

test('Liquid Glass uses a native-style scroll edge under the floating bar', () => {
  assert.match(js, /function ensureScrollEdge\(\)/);
  assert.match(js, /id = 'liquidGlassScrollEdge'/);
  assert.match(js, /liquidScrollActive/);
  assert.match(css, /\.liquidGlassScrollEdge\{/);
  assert.match(css, /height:132px/);
  assert.match(css, /backdrop-filter:blur\(13px\) saturate\(125%\)/);
  assert.match(css, /mask-image:linear-gradient/);
});

test('selected tab uses iOS-style tint without opaque fill', () => {
  assert.match(css, /--glass-active-tint:#007aff/);
  assert.match(css, /--glass-active-tint:#0a84ff/);
  assert.match(css, /html\[data-theme\] #mobileBottomNav\.liquidGlassNav \.liquidGlassNavItem\.active[\s\S]*color:var\(--glass-active-tint\)!important/);
  assert.doesNotMatch(css, /color:#171a1f!important/);
  assert.match(css, /filter:drop-shadow/);
});

test('scroll edge stays subtle and close to the bottom chrome', () => {
  assert.match(css, /\.liquidGlassScrollEdge\{[\s\S]*height:96px/);
  assert.match(css, /opacity:.30/);
  assert.match(css, /blur\(6px\) saturate\(112%\)/);
  assert.match(css, /\.liquidGlassScrollEdge\.liquidScrollActive[\s\S]*opacity:.56/);
});

test('SPA navigation matches Instagram-style icon-first Liquid Glass', () => {
  assert.match(css, /Instagram-inspired Liquid Glass/);
  assert.match(css, /data-mobile-nav-kind="spa"[\s\S]*min-height:54px/);
  assert.match(css, /data-mobile-nav-kind="spa"[\s\S]*blur\(26px\) saturate\(155%\)/);
  assert.match(css, /\.liquidGlassNavLabel[\s\S]*clip:rect\(0,0,0,0\)/);
  assert.match(css, /\.liquidGlassSelection[\s\S]*display:none!important/);
  assert.match(css, /#mobileNavHome\.active[\s\S]*fill:currentColor/);
  assert.match(css, /#mobileNavVideo\.active[\s\S]*fill:var\(--ig-icon-cutout\)/);
  assert.match(css, /body:has\(#mobileBottomNav\[data-mobile-nav-kind="spa"\]\) \.liquidGlassScrollEdge/);
});

test('SPA active state is monochrome icon fill rather than blue tint', () => {
  assert.match(css, /--glass-text-active:#111318/);
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--glass-text-active:#fff/);
  assert.match(js, /if \(nav\.dataset\.mobileNavKind === 'spa'\)[\s\S]*lens\.style\.opacity = '0'/);
});

test('SPA tab bar supports Instagram-style long-press scrub navigation', () => {
  assert.match(js, /const LONG_PRESS_MS = 160/);
  assert.match(js, /const QUICK_SCRUB_MS = 70/);
  assert.match(js, /function startSpaLongPressDrag/);
  assert.match(js, /function positionDragLens/);
  assert.match(js, /function nearestSpaItem/);
  assert.match(js, /setPointerCapture/);
  assert.match(js, /pointermove/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.match(js, /resetSpaDrag\(nav, state, \{ commit:drag\.active \}\)/);
  assert.match(js, /destination\.click\(\)/);
});

test('long-press drag keeps normal taps and scrolling intact', () => {
  assert.match(js, /Math\.hypot\(event\.clientX - drag\.startX, event\.clientY - drag\.startY\)/);
  assert.match(js, /Math.abs(dx) >= QUICK_SCRUB_X/);
  assert.match(js, /suppressClickUntil = Date\.now\(\) \+ 650/);
  assert.match(css, /touch-action:none/);
  assert.match(css, /-webkit-touch-callout:none/);
});

test('drag mode reveals a movable Instagram-like glass pill', () => {
  assert.match(css, /\.liquidDragMode \.liquidGlassSelection/);
  assert.match(css, /display:block!important/);
  assert.match(css, /backdrop-filter:blur\(18px\) saturate\(145%\)/);
  assert.match(css, /\.liquidDragPreview/);
  assert.match(css, /transform:scale\(1\.055\)/);
});

test('scrub gesture captures immediately and does not lose to vertical page scrolling', () => {
  assert.match(js, /event\.preventDefault\(\);[\s\S]*setPointerCapture\(event\.pointerId\)/);
  assert.match(css, /touch-action:none/);
  assert.match(css, /overscroll-behavior:none/);
  assert.match(js, /pointermove[\s\S]*event\.preventDefault\(\)/);
});

test('scrub activates quickly on hold or horizontal intent', () => {
  assert.match(js, /const LONG_PRESS_MS = 160/);
  assert.match(js, /const QUICK_SCRUB_MS = 70/);
  assert.match(js, /const QUICK_SCRUB_X = 7/);
  assert.match(js, /horizontalIntent/);
  assert.match(js, /elapsed >= QUICK_SCRUB_MS && horizontalIntent/);
});

test('SPA links cannot be lifted or dragged by Safari', () => {
  assert.match(js, /link\.draggable = false/);
  assert.match(js, /setAttribute\('draggable','false'\)/);
  assert.match(js, /addEventListener\('dragstart', blockNativeLinkGesture\)/);
  assert.match(js, /addEventListener\('contextmenu', blockNativeLinkGesture\)/);
  assert.match(js, /addEventListener\('selectstart', blockNativeLinkGesture\)/);
  assert.match(css, /-webkit-user-drag:none/);
  assert.match(css, /-webkit-touch-callout:none/);
});

test('hold gives immediate visual feedback before drag mode begins', () => {
  assert.match(js, /liquidHoldArmed/);
  assert.match(js, /liquidHoldOrigin/);
  assert.match(js, /positionHoldLens/);
  assert.match(css, /\.liquidHoldArmed \.liquidGlassSelection/);
  assert.match(css, /opacity:.48!important/);
  assert.match(css, /\.liquidDragMode \.liquidGlassSelection[\s\S]*rgba\(190,196,204,.42\)/);
});

test('drag preview never changes committed icon color or fill', () => {
  assert.match(css, /Instagram scrub state rule/);
  assert.match(css, /liquidDragMode \.liquidGlassNavItem\.active[\s\S]*color:var\(--glass-text-active\)!important/);
  assert.match(css, /liquidDragMode \.liquidGlassNavItem\.liquidDragPreview[\s\S]*color:var\(--glass-text\)!important/);
  assert.match(css, /#mobileNavHome\.liquidDragPreview:not\(\.active\):not\(\[aria-current="page"\]\)[\s\S]*fill:none!important/);
  assert.match(css, /#mobileNavManga\.liquidDragPreview:not\(\.active\):not\(\[aria-current="page"\]\)[\s\S]*fill:none!important/);
  assert.match(css, /#mobileNavVideo\.liquidDragPreview:not\(\.active\):not\(\[aria-current="page"\]\)[\s\S]*fill:none!important/);
  assert.match(css, /#mobileNavProfile\.liquidDragPreview:not\(\.active\):not\(\[aria-current="page"\]\)[\s\S]*fill:none!important/);
});

test('current page icon remains committed while glass pill moves', () => {
  assert.match(css, /liquidDragMode #mobileNavHome\.active[\s\S]*fill:currentColor!important/);
  assert.match(css, /liquidDragMode #mobileNavManga\.active[\s\S]*fill:currentColor!important/);
  assert.match(css, /liquidDragMode #mobileNavVideo\.active[\s\S]*fill:currentColor!important/);
  assert.match(css, /liquidDragMode #mobileNavProfile\.active[\s\S]*fill:currentColor!important/);
});

test('selection pill is always visible on SPA routes', () => {
  assert.match(css, /Instagram persistent selection pill/);
  assert.match(css, /data-mobile-nav-kind="spa"\] \.liquidGlassSelection\{[\s\S]*display:block!important[\s\S]*opacity:1!important/);
  assert.match(js, /const lensInset = nav\.dataset\.mobileNavKind === 'spa' \? 5 : 3/);
  assert.doesNotMatch(js, /nav\.dataset\.mobileNavKind === 'spa'\)[\s\S]{0,120}lens\.style\.opacity = '0'/);
});

test('ordinary tap slides the same pill before navigation', () => {
  assert.match(js, /function animateSpaLensToItem/);
  assert.match(js, /duration = 210/);
  assert.match(js, /liquidTapTransition/);
  assert.match(js, /function navigateSpaItemAfterLens/);
  assert.match(js, /animateSpaLensToItem\(nav, item, \{ duration \}\)\.finally/);
  assert.match(js, /navigateSpaItemAfterLens\(nav, state, tapItem, \{ duration:210 \}\)/);
});

test('scrub release snaps the persistent pill before changing page', () => {
  assert.match(js, /navigateSpaItemAfterLens\(nav, state, destination, \{ duration:170 \}\)/);
  assert.match(js, /animateSpaLensToItem\(nav, current, \{ duration:150 \}\)/);
  assert.match(css, /liquidDragMode \.liquidGlassSelection/);
  assert.match(css, /liquidDragPreview[\s\S]*transform:none!important/);
});
