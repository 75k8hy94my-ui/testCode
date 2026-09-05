const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const background=fs.readFileSync('extension/background.js','utf8');
const toolbar=fs.readFileSync('extension/content/site-toolbar.js','utf8');
const extractor=fs.readFileSync('extension/content/extractor.js','utf8');
const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));

test('registered origins are restored as persistent dynamic content scripts',()=>{assert.match(background,/registerContentScripts/);assert.match(background,/getRegisteredContentScripts/);assert.match(background,/onStartup/);assert.match(background,/onInstalled/)});
test('dynamic script sync updates changed registrations in place',()=>{assert.match(background,/updateContentScripts/);assert.match(background,/staleIds/);assert.match(background,/toRegister/);assert.doesNotMatch(background,/changedIds/)});
test('toolbar injection guard is set only after dependencies are available',()=>{const deps=toolbar.indexOf('if(!RuleLocator||!Extractor||!PickerApi');const guard=toolbar.indexOf('window.__testcodeMangaToolbarMounted=true');assert.ok(deps>=0&&guard>deps,'mount guard must be set after dependency validation')});
test('toolbar marks its host so element picker ignores extension UI',()=>{assert.match(toolbar,/testcodeMangaExtensionHost/)});
test('new mappings default to site-wide rules',()=>{assert.match(toolbar,/function defaultPattern\(\)\{return ['"]\/\*['"]\}/)});
test('image extraction supports common lazy loading attributes and srcset',()=>{for(const token of ['data-src','data-original','data-lazy-src','srcset'])assert.match(extractor,new RegExp(token))});
test('image collection inference avoids a bare img selector',()=>{assert.match(extractor,/buildImageSelector/);assert.doesNotMatch(extractor,/const selector = tag \+ classes/)});
test('extension files referenced by manifest and injector exist',()=>{for(const script of manifest.content_scripts||[])for(const file of script.js||[])assert.ok(fs.existsSync('extension/'+file),file);for(const file of ['content/rule-locator.js','content/extractor.js','content/element-picker.js','content/site-toolbar.js'])assert.ok(fs.existsSync('extension/'+file),file)});
