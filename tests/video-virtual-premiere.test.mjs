import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const html = read('video-virtual-editor.html');
const core = read('video-virtual-editor.js');
const tools = read('video-virtual-premiere.js');
const css = read('video-virtual-premiere.css');

test('Premiere workspace loads after existing protected editor and parses as JavaScript', () => {
  assert.ok(html.indexOf('video-virtual-editor.js') < html.indexOf('video-virtual-premiere.js'));
  assert.ok(html.indexOf('video-virtual-editor.css') < html.indexOf('video-virtual-premiere.css'));
  assert.doesNotThrow(() => new vm.Script(tools, { filename: 'video-virtual-premiere.js' }));
  assert.doesNotThrow(() => new vm.Script(core, { filename: 'video-virtual-editor.js' }));
});

test('timeline-first controls do not require typing timecodes', () => {
  assert.match(tools, /function addFullSource\(/);
  assert.match(tools, /loadedmetadata/);
  assert.match(tools, /safeDuration\(media\)/);
  assert.match(tools, /start\.value = '0'/);
  assert.match(tools, /end\.value = String\(duration\)/);
  assert.match(tools, /addButton\.click\(\)/);
  assert.match(tools, /data-source-id/);
  assert.match(tools, /dragstart/);
  assert.match(tools, /dragover/);
  assert.match(tools, /drop/);
});

test('transform buttons use existing clip-level rotation model rather than global rotation', () => {
  assert.match(tools, /data-rotate="-90"/);
  assert.match(tools, /data-rotate="90"/);
  assert.match(tools, /data-rotate="180"/);
  assert.match(tools, /originalRotation\.dispatchEvent\(new Event\('change'/);
  assert.match(core, /Edit\.setClipRotation\(edit, selectedIndex/);
  assert.match(tools, /MutationObserver/);
});

test('core editing splits at timeline playhead and snaps nearby boundaries', () => {
  assert.match(core, /Edit\.locateTime\(edit, timelinePosition\)/);
  assert.match(core, /Edit\.splitClip\(edit, where\.clipIndex, second\)/);
  assert.match(core, /let distance = 8 \/ zoom/);
  assert.match(core, /if \(gap < distance\)/);
  assert.match(core, /vveRulerTick/);
});

test('workstation has a real responsive source bin, monitor, transform and V1 track', () => {
  assert.match(css, /vveMediaBin/);
  assert.match(css, /vvePreviewPanel/);
  assert.match(css, /vveRotateBar/);
  assert.match(css, /vveTrackCaption/);
  assert.match(css, /max-width:650px/);
  assert.match(tools, /数値で微調整（任意）/);
  assert.match(tools, /vveRazor/);
  assert.match(tools, /'s':/);
  assert.match(tools, /'i':/);
  assert.match(tools, /'o':/);
});
