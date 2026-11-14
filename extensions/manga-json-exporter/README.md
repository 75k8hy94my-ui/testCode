# testCode 漫画 JSON エクスポーター

ChromiumブラウザのManifest V3拡張機能です。

1. Chromeの chrome://extensions/ を開き、デベロッパーモードを有効にする。
2. 「パッケージ化されていない拡張機能を読み込む」から、このフォルダを選ぶ。
3. HTTPSの作品ページで拡張機能を開き、「このページを追加」を押す。
4. 複数作品を収集したら「JSONを保存」を押す。
5. testCodeの漫画ページの「JSONを読み込む」でファイルを選び、作品一覧を確認して登録する。

タイトルはtitle要素、画像URLは#post-meta内の/1.webp、作者はdescription要素の【作者】の内容から取得します。
JSON形式は format="testcode-manga-import"、version=1、items=[{title,author,url,sourceUrl,circleName,sourceWork,tags}] です。
testCodeのReaderは1.webpから連番ページを探索します。作品データはブラウザの拡張機能ストレージに保持され、外部サーバーには送信しません。
