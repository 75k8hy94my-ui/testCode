import fs from 'node:fs';

const replaceOnce = (source, from, to, label) => {
  const first = source.indexOf(from);
  if (first === -1) throw new Error(`${label}: target not found`);
  if (source.indexOf(from, first + from.length) !== -1) throw new Error(`${label}: target is not unique`);
  return source.slice(0, first) + to + source.slice(first + from.length);
};

const update = (file, transforms) => {
  let source = fs.readFileSync(file, 'utf8');
  for (const transform of transforms) source = replaceOnce(source, ...transform);
  fs.writeFileSync(file, source);
};

update('home.html', [
  [
    '.headerActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}',
    '.topbarActions{display:grid;gap:8px;justify-items:end}.topActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.headerActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.topActionCurrent{cursor:default;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 34%,var(--glass-border))}.homeShell .topActionCurrent:hover{transform:none}.topActionCurrent:active{transform:none}',
    'home navigation styles',
  ],
  [
    '@media(max-width:640px){.homeHeader{display:block}.headerActions{justify-content:flex-start;margin-top:18px}.headerActions>*{flex:1}',
    '@media(max-width:640px){.homeHeader{display:block}.topbarActions{margin-top:18px;justify-items:stretch}.topActions,.headerActions{justify-content:flex-start}.topActions>*,.headerActions>*{flex:1}',
    'home mobile navigation styles',
  ],
  [
    '    <div class="headerActions"><a class="glassBtn" href="sync.html">保管庫</a><button class="glassBtn" id="editHomeBtn" type="button">カードを編集</button></div>',
    `    <div class="topbarActions">\n      <nav class="topActions" aria-label="主要ページ">\n        <span class="glassBtn topActionCurrent" aria-current="page">ホーム</span>\n        <a class="glassBtn" href="index-search.html">索引検索</a>\n        <a class="glassBtn" href="hyakusen.html">判例百選</a>\n      </nav>\n      <div class="headerActions"><a class="glassBtn" href="sync.html">保管庫</a><button class="glassBtn" id="editHomeBtn" type="button">カードを編集</button></div>\n    </div>`,
    'home header actions',
  ],
]);

update('index-search.html', [
  [
    '.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}',
    '.topbarActions{display:grid;gap:8px;justify-items:end}.topActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.topActionCurrent{cursor:default;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 34%,var(--glass-border))}.indexShell .topActionCurrent:hover{transform:none}.topActionCurrent:active{transform:none}',
    'index navigation styles',
  ],
  [
    '.glassBtn,.tabBtn{min-height:42px;border:1px solid var(--glass-border);border-radius:14px;background:var(--glass);color:var(--text);font-weight:750;padding:0 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 7px 20px var(--shadow);-webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%);cursor:pointer}',
    '.glassBtn,.tabBtn{min-height:42px;border:1px solid var(--glass-border);border-radius:14px;background:var(--glass);color:var(--text);font-weight:750;padding:0 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 7px 20px var(--shadow);-webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%);cursor:pointer}.glassBtn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}',
    'index link button styles',
  ],
  [
    '@media(max-width:640px){.topbar{display:block}.actions{justify-content:flex-start;margin-top:15px}.actions .glassBtn{flex:1}',
    '@media(max-width:640px){.topbar{display:block}.topbarActions{margin-top:15px;justify-items:stretch}.topActions,.actions{justify-content:flex-start}.topActions .glassBtn,.actions .glassBtn{flex:1}',
    'index mobile navigation styles',
  ],
  [
    `    <div class="actions">\n      <button class="glassBtn" id="openImportBtn" type="button">JSONを読み込む</button>\n      <button class="glassBtn" id="openBooksBtn" type="button">書籍管理</button>\n      <button class="glassBtn" id="openSettingsBtn" type="button">検索設定</button>\n      <button class="glassBtn" id="copyConversionPromptBtn" type="button">AI変換用プロンプトをコピー</button>\n    </div>`,
    `    <div class="topbarActions">\n      <nav class="topActions" aria-label="主要ページ">\n        <a class="glassBtn" href="home.html">ホーム</a>\n        <span class="glassBtn topActionCurrent" aria-current="page">索引検索</span>\n        <a class="glassBtn" href="hyakusen.html">判例百選</a>\n      </nav>\n      <div class="actions">\n        <button class="glassBtn" id="openImportBtn" type="button">JSONを読み込む</button>\n        <button class="glassBtn" id="openBooksBtn" type="button">書籍管理</button>\n        <button class="glassBtn" id="openSettingsBtn" type="button">検索設定</button>\n        <button class="glassBtn" id="copyConversionPromptBtn" type="button">AI変換用プロンプトをコピー</button>\n      </div>\n    </div>`,
    'index header actions',
  ],
]);

update('hyakusen.html', [
  [
    '    .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}',
    '    .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}\n    .topbarActions{display:grid;gap:8px;justify-items:end}.topActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.topActionCurrent{cursor:default;color:var(--accent);border-color:color-mix(in srgb,var(--accent) 34%,var(--line))}.shell .topActionCurrent:hover{transform:none}.topActionCurrent:active{transform:none}',
    'hyakusen navigation styles',
  ],
  [
    '    @media(max-width:700px){body{padding:18px 12px 50px}.topbar{align-items:flex-start;flex-direction:column}.controls,.driveRow{grid-template-columns:1fr}.hyakusenRow{grid-template-columns:48px minmax(0,1fr);padding:13px}.hyakusenFile{grid-column:2;text-align:left}}',
    '    @media(max-width:700px){body{padding:18px 12px 50px}.topbar{align-items:flex-start;flex-direction:column}.topbarActions{width:100%;justify-items:stretch}.topActions{justify-content:flex-start}.topActions .glassBtn{flex:1}.controls,.driveRow{grid-template-columns:1fr}.hyakusenRow{grid-template-columns:48px minmax(0,1fr);padding:13px}.hyakusenFile{grid-column:2;text-align:left}}',
    'hyakusen mobile navigation styles',
  ],
  [
    '      <a class="glassBtn" href="index-search.html">索引検索へ戻る</a>',
    `      <div class="topbarActions">\n        <nav class="topActions" aria-label="主要ページ">\n          <a class="glassBtn" href="home.html">ホーム</a>\n          <a class="glassBtn" href="index-search.html">索引検索</a>\n          <span class="glassBtn topActionCurrent" aria-current="page">判例百選</span>\n        </nav>\n      </div>`,
    'hyakusen header actions',
  ],
]);

console.log('Primary navigation applied to home.html, index-search.html, and hyakusen.html');
