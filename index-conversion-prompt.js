(()=>{
'use strict';

const PROMPT = `あなたは法律書の索引画像を、testCodeの索引検索で読み込めるJSONへ変換する担当です。

次のルールを厳守してください。

1. 1冊につき、出力はJSONオブジェクト1個だけにしてください。
2. schemaVersionは必ず1です。
3. Markdownコードフェンスは禁止です。説明文も付けず、JSONのみを出力してください。
4. 書名・著者・科目は、画像やユーザーが与えた資料から確認できる範囲だけを使ってください。読めない内容を推測で補わないでください。
5. 事項索引の親見出しと子見出しは階層構造のまま保存せず、検索可能な独立文字列へflattenしてください。例: 親見出し「債権者代位権」、子見出し「転用」なら term は「債権者代位権 転用」とします。
6. 判例は年月日だけで同一判例と判断しないでください。同じ年月日でも別判例があり得ます。可能な限り裁判所、判決日、判例集、巻、号、掲載頁を分離して抽出し、citationTextにも画像上の引用表記を残してください。
7. 判例集、巻、号、掲載頁のいずれかが違う場合は、安易に別の項目と統合しないでください。
8. 条文索引は、法令名・条・項・号を可能な限り分離してください。画像に項や号がなければ null または空文字を使い、推測で追加しないでください。
9. 教科書内のページ参照は必ず文字列として保存してください。「123」「128-130」「xv」「別冊12」などを数値化・分解しないでください。
10. 事項・判例・条文のいずれかが存在しない場合は、その配列を空配列にしてください。
11. 読めない箇所は推測しないでください。必須項目を確定できない項目は無理に作らず、任意項目は空文字/nullなどschema上安全な値にしてください。
12. 重複らしき項目があっても、判例は年月日だけ、条文は条番号だけ、といった弱い条件で統合しないでください。

出力JSONの形は必ず次です。

{
  "schemaVersion": 1,
  "book": {
    "title": "",
    "authors": [],
    "subjects": []
  },
  "matterEntries": [
    {
      "term": "",
      "pages": [""]
    }
  ],
  "caseEntries": [
    {
      "court": "",
      "date": "",
      "reporter": "",
      "volume": "",
      "issue": "",
      "reportPage": "",
      "citationText": "",
      "pages": [""]
    }
  ],
  "statuteEntries": [
    {
      "statute": "",
      "article": "",
      "paragraph": null,
      "item": null,
      "citationText": "",
      "pages": [""]
    }
  ]
}

補足:
- matterEntries の term は索引語そのものです。親見出し＋子見出しをflattenした場合は両方を含めます。
- caseEntries の date は可能なら YYYY-MM-DD に正規化してください。ただし画像から確実に読める場合だけです。
- reporter は「民集」「判時」「判タ」など判例集名です。volume は巻、issue は号、reportPage は判例集上の掲載頁です。
- pages はその判例・事項・条文がこの教科書の何頁に載っているかを示す索引上のページ参照です。
- statuteEntries の article は「423」のように条番号本体を入れ、paragraph/item は存在するときだけ値を入れてください。

最終出力はJSONのみです。Markdownは禁止です。`;

function buildPrompt() {
  return PROMPT;
}

const api = { buildPrompt };
if (typeof window !== 'undefined') window.IndexConversionPrompt = api;
if (typeof module !== 'undefined') module.exports = api;
})();
