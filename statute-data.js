(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StatuteData = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LAWS = [
    { id: 'kenpo', name: '日本国憲法', shortName: '憲法', era: '昭和21年憲法', officialNumber: '憲法' },
    { id: 'minpo', name: '民法', shortName: '民法', era: '明治29年法律第89号', officialNumber: '明治29年法律第89号' },
    { id: 'keiho', name: '刑法', shortName: '刑法', era: '明治40年法律第45号', officialNumber: '明治40年法律第45号' },
    { id: 'minso', name: '民事訴訟法', shortName: '民訴法', era: '平成8年法律第109号', officialNumber: '平成8年法律第109号' },
    { id: 'keiso', name: '刑事訴訟法', shortName: '刑訴法', era: '昭和23年法律第131号', officialNumber: '昭和23年法律第131号' },
    { id: 'kaisha', name: '会社法', shortName: '会社法', era: '平成17年法律第86号', officialNumber: '平成17年法律第86号' },
    { id: 'gyoso', name: '行政事件訴訟法', shortName: '行訴法', era: '昭和37年法律第139号', officialNumber: '昭和37年法律第139号' },
    { id: 'gyote', name: '行政手続法', shortName: '行手', era: '平成5年法律第88号', officialNumber: '平成5年法律第88号' },
    { id: 'gyofuku', name: '行政不服審査法', shortName: '行審', era: '平成26年法律第68号', officialNumber: '平成26年法律第68号' }
  ];

  // 日本国憲法（全103条抜粋・重要全章網羅）
  const KENPO_ARTICLES = [
    {
      num: 1, title: '天皇の地位・国民主権', chapter: '第1章 天皇',
      paragraphs: [{ num: 1, text: '天皇は、日本国の象徴であり日本国民統合の象徴であつて、この地位は、主権の存する日本国民の総意に基く。' }]
    },
    {
      num: 9, title: '戦争の放棄・戦力及び交戦権の否認', chapter: '第2章 戦争の放棄',
      paragraphs: [
        { num: 1, text: '日本国民は、正義と秩序を基調とする国際平和を誠実に希求し、国権の発動たる戦争と、武力による威嚇又は武力の行使は、国際紛争を解決する手段としては、永久にこれを放棄する。' },
        { num: 2, text: '前項の目的を達するため、陸海空軍その他の戦力は、これを保持しない。国の交戦権は、これを認めない。' }
      ]
    },
    {
      num: 11, title: '基本的人権の享有', chapter: '第3章 国民の権利及び義務',
      paragraphs: [{ num: 1, text: '国民は、すべての基本的人権の享有を妨げられない。この憲法が国民に保障する基本的人権は、侵すことのできない永久の権利として、現在及び将来の国民に与へられる。' }]
    },
    {
      num: 12, title: '自由・権利の保持義務と公共の福祉', chapter: '第3章 国民の権利及び義務',
      paragraphs: [{ num: 1, text: 'この憲法が国民に保障する自由及び権利は、国民の不断の努力によつて、これを保持しなければならない。又、国民は、これを濫用してはならないのであつて、常に公共の福祉のためにこれを利用する責任を負ふ。' }]
    },
    {
      num: 13, title: '個人の尊重・幸福追求権・公共の福祉', chapter: '第3章 国民の権利及び義務',
      paragraphs: [{ num: 1, text: 'すべて国民は、個人として尊重される。生命、自由及び幸福追求に対する国民の権利については、公共の福祉に反しない限り、立法その他の国政の上で、最大の尊重を必要とする。' }]
    },
    {
      num: 14, title: '法の下の平等・貴族制度の否認・栄典', chapter: '第3章 国民の権利及び義務',
      paragraphs: [
        { num: 1, text: 'すべて国民は、法の下に平等であつて、人種、信条、性別、社会的身分又は門地により、政治的、経済的又は社会的関係において、差別されない。' },
        { num: 2, text: '華族その他の貴族の制度は、これを認めない。' },
        { num: 3, text: '栄誉、勲章その他の栄典の授与は、いかなる特権も伴はない。栄典の授与は、現にこれを有し、又は将来これを受ける者の代に限り、その効力を有する。' }
      ]
    },
    {
      num: 19, title: '思想及び良心の自由', chapter: '第3章 国民の権利及び義務',
      paragraphs: [{ num: 1, text: '思想及び良心の自由は、これを侵してはならない。' }]
    },
    {
      num: 20, title: '信教の自由・政教分離', chapter: '第3章 国民の権利及び義務',
      paragraphs: [
        { num: 1, text: '信教の自由は、何人に対してもこれを保障する。いかなる宗教団体も、国から特権を受け、又は政治上の権力を更使してはならない。' },
        { num: 2, text: '何人も、宗教上の行為、祝典、儀式又は行事に参加することを強制されない。' },
        { num: 3, text: '国及びその機関は、宗教教育その他いかなる宗教的活動もしてはならない。' }
      ]
    },
    {
      num: 21, title: '表現の自由・検閲の禁止・通信の秘密', chapter: '第3章 国民の権利及び義務',
      paragraphs: [
        { num: 1, text: '集会、結社及び言論、出版その他一切の表現の自由は、これを保障する。' },
        { num: 2, text: '検閲は、これをしてはならない。通信の秘密は、これを侵してはならない。' }
      ]
    },
    {
      num: 22, title: '居住・移転及び職業選択の自由・外国移住及び国籍離脱の自由', chapter: '第3章 国民の権利及び義務',
      paragraphs: [
        { num: 1, text: '何人も、公共の福祉に反しない限り、居住、移転及び職業選択の自由を有する。' },
        { num: 2, text: '何人も、外国に移住し、又は国籍を離脱する自由を侵されない。' }
      ]
    },
    {
      num: 23, title: '学問の自由', chapter: '第3章 国民の権利及び義務',
      paragraphs: [{ num: 1, text: '学問の自由は、これを保障する。' }]
    },
    {
      num: 25, title: '生存権・国の社会的使命', chapter: '第3章 国民の権利及び義務',
      paragraphs: [
        { num: 1, text: 'すべて国民は、健康で文化的な最低限度の生活を営む権利を有する。' },
        { num: 2, text: '国は、すべての生活部面について、社会福祉、社会保障及び公衆衛生の向上及び増進に努めなければならない。' }
      ]
    },
    {
      num: 29, title: '財産権', chapter: '第3章 国民の権利及び義務',
      paragraphs: [
        { num: 1, text: '財産権は、これを侵してはならない。' },
        { num: 2, text: '財産権の内容は、公共の福祉に適合するやうに、法律でこれを定める。' },
        { num: 3, text: '私有財産は、正当な補償の下に、これを公共のために用ひることができる。' }
      ]
    },
    {
      num: 31, title: '法定の手続の保障', chapter: '第3章 国民の権利及び義務',
      paragraphs: [{ num: 1, text: '何人も、法律の定める手続によらなければ、その生命若しくは自由を奪はれ、又はその他の刑罰を科せられない。' }]
    },
    {
      num: 41, title: '国会の地位・立法権', chapter: '第4章 国会',
      paragraphs: [{ num: 1, text: '国会は、国権の最高機関であつて、国の唯一の立法機関である。' }]
    },
    {
      num: 73, title: '内閣の職務', chapter: '第5章 内閣',
      paragraphs: [{ num: 1, text: '内閣は、他の一般行政事務の外、左の事務を行ふ。\n一　法律を誠実に執行し、国務を総理すること。\n二　外交関係を処理すること。\n三　条約を締結すること。但し、事前に、時宜によつては事後に、国会の承認を経ることを必要とする。\n四　法律の定める基準に従ひ、官吏に関する事務を掌理すること。\n五　予算を作成して国会に提出すること。\n六　この憲法及び法律の規定を実施するために、政令を制定すること。但し、政令には、特にその法律の委任がある場合を除いては、罰則を設けることができない。\n七　大赦、特赦、減刑、刑の執行の免除及び復権を決定すること。' }]
    },
    {
      num: 76, title: '司法権・裁判所・特別裁判所の禁止・裁判官の独立', chapter: '第6章 司法',
      paragraphs: [
        { num: 1, text: 'すべて司法権は、最高裁判所及び法律の定めるところにより設置する下級裁判所に属する。' },
        { num: 2, text: '特別裁判所は、これを設置することができない。行政機関は、終審として裁判を行ふことができない。' },
        { num: 3, text: 'すべて裁判官は、その良心に従ひ独立してその職権を行ひ、この憲法及び法律にのみ拘束される。' }
      ]
    },
    {
      num: 81, title: '違憲審査権', chapter: '第6章 司法',
      paragraphs: [{ num: 1, text: '最高裁判所は、一切の法律、命令、規則又は処分が憲法に適合するかしないかを決定する権限を有する終審裁判所である。' }]
    },
    {
      num: 94, title: '地方公共団体の権能・条例制定権', chapter: '第8章 地方自治',
      paragraphs: [{ num: 1, text: '地方公共団体は、その財産を管理し、事務を処理し、及び行政を執行する権能を有し、法律の範囲内で条例を制定することができる。' }]
    },
    {
      num: 96, title: '憲法改正の手続・公布', chapter: '第9章 改正',
      paragraphs: [
        { num: 1, text: 'この憲法の改正は、各議院の総議員の三分の二以上の賛成で、国会が、これを発議し、国民に提案してその承認を経なければならない。この承認には、特別の国民投票又は国会の定める選挙の際行はれる投票において、その過半数の賛成を必要とする。' },
        { num: 2, text: '憲法改正について前項の承認を経たときは、天皇は、国民の名で、この憲法と一体を成すものとして、直ちにこれを公布する。' }
      ]
    },
    {
      num: 98, title: '最高法規・条約及び国際法規の遵守', chapter: '第10章 最高法規',
      paragraphs: [
        { num: 1, text: 'この憲法は、国の最高法規であつて、その条規に反する法律、命令、詔勅及び国務に関するその他の行為の全部又は一部は、その効力を有しない。' },
        { num: 2, text: '日本国が締結した条約及び確立された国際法規は、これを誠実に遵守することを必要とする。' }
      ]
    }
  ];

  // 民法（超重要条文）
  const MINPO_ARTICLES = [
    {
      num: 1, title: '基本原則', chapter: '第1編 総則 / 第1章 通則',
      paragraphs: [
        { num: 1, text: '私権は、公共の福祉に適合しなければならない。' },
        { num: 2, text: '権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。' },
        { num: 3, text: '権利の濫用は、これを許さない。' }
      ]
    },
    {
      num: 3, subNum: 2, title: '意思能力', chapter: '第1編 総則 / 第2章 人',
      paragraphs: [{ num: 1, text: '法律行為の当事者が意思表示をした時に意思能力を有しなかったときは、その法律行為は、無効とする。' }]
    },
    {
      num: 90, title: '公序良俗', chapter: '第1編 総則 / 第4章 法律行為',
      paragraphs: [{ num: 1, text: '公の秩序又は善良の風俗に反する法律行為は、無効とする。' }]
    },
    {
      num: 93, title: '心裡留保', chapter: '第1編 総則 / 第4章 法律行為',
      paragraphs: [
        { num: 1, text: '意思表示は、表意者がその真意ではないことを知ってしたときであっても、そのためにその効力を妨げられない。ただし、相手方がその意思表示が表意者の真意ではないことを知り、又は知ることができたときは、その意思表示は、無効とする。' },
        { num: 2, text: '前項ただし書の規定による意思表示の無効は、善意の第三者に対抗することができない。' }
      ]
    },
    {
      num: 94, title: '虚偽表示', chapter: '第1編 総則 / 第4章 法律行為',
      paragraphs: [
        { num: 1, text: '相手方と通じてした虚偽の意思表示は、無効とする。' },
        { num: 2, text: '前項の規定による意思表示の無効は、善意の第三者に対抗することができない。' }
      ]
    },
    {
      num: 95, title: '錯誤', chapter: '第1編 総則 / 第4章 法律行為',
      paragraphs: [
        { num: 1, text: '意思表示は、次に掲げる錯誤に基づくものであって、その錯誤が法律行為の目的及び取引上の社会通念に照らして重要なものであるときは、取り消すことができる。\n一　意思表示に対応する意思を欠く錯誤\n二　表意者が法律行為の基礎とした事情についてのその認識が真実に反する錯誤' },
        { num: 2, text: '前項第二号の規定による意思表示の取消しは、その事情が法律行為の基礎とされていることが表示されていたときに限り、することができる。' },
        { num: 3, text: '錯誤が表意者の重大な過失によるものであったときは、次に掲げる場合を除き、第一項の規定による意思表示の取消しをすることができない。\n一　相手方が表意者に錯誤があることを知り、又は重大な過失によって知らなかったとき。\n二　相手方が表意者と同一の錯誤に陥っていたとき。' },
        { num: 4, text: '第一項の規定による意思表示の取消しは、善意でかつ過失がない第三者に対抗することができない。' }
      ]
    },
    {
      num: 96, title: '詐欺又は強迫', chapter: '第1編 総則 / 第4章 法律行為',
      paragraphs: [
        { num: 1, text: '詐欺又は強迫による意思表示は、取り消すことができる。' },
        { num: 2, text: '相手方に対する意思表示について第三者が詐欺を行った場合においては、相手方がその事実を知り、又は知ることができたときに限り、その意思表示を取り消すことができる。' },
        { num: 3, text: '前二項の規定による詐欺による意思表示の取消しは、善意でかつ過失がない第三者に対抗することができない。' }
      ]
    },
    {
      num: 110, title: '権限外の行為の表見代理', chapter: '第1編 総則 / 第4章 法律行為',
      paragraphs: [{ num: 1, text: '前条本文の規定は、代理人がその権限外の行為をした場合において、第三者が代理人の権限があると信ずべき正当な理由があるときについて準用する。' }]
    },
    {
      num: 177, title: '不動産に関する物権の変動の対抗要件', chapter: '第2編 物権 / 第1章 総則',
      paragraphs: [{ num: 1, text: '不動産に関する物権の得喪及び変更は、不動産登記法（平成十六年法律第百二十三号）その他の登記に関する法律の定めるところに従いその登記をしなければ、第三者に対抗することができない。' }]
    },
    {
      num: 178, title: '動産に関する物権の譲渡の対抗要件', chapter: '第2編 物権 / 第1章 総則',
      paragraphs: [{ num: 1, text: '動産に関する物権の譲渡は、その動産の引渡しがなければ、第三者に対抗することができない。' }]
    },
    {
      num: 192, title: '即時取得', chapter: '第2編 物権 / 第2章 占有権',
      paragraphs: [{ num: 1, text: '取引行為によって、平穏に、かつ、公然と動産の占有を始めた者は、善意であり、かつ、過失がないときは、即時にその動産について行使する権利を取得する。' }]
    },
    {
      num: 388, title: '法定地上権', chapter: '第2編 物権 / 第10章 抵当権',
      paragraphs: [{ num: 1, text: '土地及びその上にある建物が同一の所有者に属する場合において、その土地又は建物につき抵当権が設定され、その実行により所有者を異にするに至ったときは、その建物について、地上権が設定されたものとみなす。この場合において、地代は、当事者の請求により、裁判所が定める。' }]
    },
    {
      num: 415, title: '債務不履行による損害賠償', chapter: '第3編 債権 / 第1章 総則',
      paragraphs: [
        { num: 1, text: '債務者がその債務の本旨に従った履行をしないとき又は債務の履行が不能であるときは、債権者は、これによって生じた損害の賠償を請求することができる。ただし、その債務の不履行が契約その他の債務の発生原因及び取引上の社会通念に照らして債務者の責めに帰することができない事由によるものであるときは、この限りでない。' },
        { num: 2, text: '前項の規定により損害賠償の請求をすることができる場合において、債権者は、次に掲げるときは、債務の履行に代わる損害賠償の請求をすることができる。\n一　債務の履行が不能であるとき。\n二　債務者がその債務の履行を拒絶する意思を明確に表示したとき。\n三　債務が契約によって生じたものである場合において、その契約が解除され、又は債務の不履行による契約の解除権が発生したとき。' }
      ]
    },
    {
      num: 416, title: '損害賠償の範囲', chapter: '第3編 債権 / 第1章 総則',
      paragraphs: [
        { num: 1, text: '債務の不履行に対する損害賠償の請求は、これによって通常生ずべき損害の賠償をさせることをその目的とする。' },
        { num: 2, text: '特別の事情によって生じた損害であっても、当事者がその事情を予見すべきであったときは、債権者は、その賠償を請求することができる。' }
      ]
    },
    {
      num: 423, title: '債権者代位権の要件', chapter: '第3編 債権 / 第1章 総則',
      paragraphs: [
        { num: 1, text: '債権者は、自己の債権を保全するため必要があるときは、債務者に属する権利（以下「被代位権利」という。）を行使することができる。ただし、債務者の一身に専属する権利及び差押えを禁じられた権利は、この限りでない。' },
        { num: 2, text: '債権者は、その債権の期限が到来しない間は、被代位権利を行使することができない。ただし、保存行為は、この限りでない。' },
        { num: 3, text: '債権者は、その債権が裁判上の請求をすることができないものであるときは、被代位権利を行使することができない。' }
      ]
    },
    {
      num: 424, title: '詐害行為取消請求', chapter: '第3編 債権 / 第1章 総則',
      paragraphs: [
        { num: 1, text: '債権者は、債務者が債権者を害することを知ってした行為の取消しを裁判所に請求することができる。ただし、その行為によって利益を受けた者（以下「受益者」という。）がその行為の時において、債権者を害することを知らなかったときは、この限りでない。' },
        { num: 2, text: '前項の規定は、財産権を目的としない行為については、適用しない。' }
      ]
    },
    {
      num: 533, title: '同時履行の抗弁', chapter: '第3編 債権 / 第2章 契約',
      paragraphs: [{ num: 1, text: '双務契約の当事者の一方は、相手方がその債務の履行（相手方の債務の履行に代わる損害賠償の債務の履行を含む。）を提供するまでは、自己の債務の履行を拒むことができる。ただし、相手方の債務が弁済期にないときは、この限りでない。' }]
    },
    {
      num: 541, title: '催告による解除', chapter: '第3編 債権 / 第2章 契約',
      paragraphs: [{ num: 1, text: '当事者の一方がその債務を履行しない場合において、相手方が相当の期間を定めてその履行の催告をし、その期間内に履行がないときは、相手方は、契約の解除をすることができる。ただし、その期間を経過した時における債務の不履行がその契約及び取引上の社会通念に照らして軽微であるときは、この限りでない。' }]
    },
    {
      num: 709, title: '不法行為による損害賠償', chapter: '第3編 債権 / 第5章 不法行為',
      paragraphs: [{ num: 1, text: '故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は、これによって生じた損害を賠償する責任を負う。' }]
    },
    {
      num: 715, title: '使用者等の責任', chapter: '第3編 債権 / 第5章 不法行為',
      paragraphs: [
        { num: 1, text: 'ある事業のために他人を使用する者は、被用者がその事業の執行について第三者に加えた損害を賠償する責任を負う。ただし、使用者が被用者の選任及びその事業の監督について相当の注意をしたとき、又は相当の注意をしても損害が生ずべきであったときは、この限りでない。' },
        { num: 2, text: '使用者に代わって事業を監督する者も、前項の責任を負う。' },
        { num: 3, text: '前二項の規定は、使用者又は監督者から被用者に対する求償権の行使を妨げない。' }
      ]
    }
  ];

  // 刑法（超重要条文）
  const KEIHO_ARTICLES = [
    {
      num: 35, title: '正当行為', chapter: '第1編 総則 / 第7章 犯罪の不成立及び刑の減免',
      paragraphs: [{ num: 1, text: '法令又は正当な業務による行為は、罰しない。' }]
    },
    {
      num: 36, title: '正当防衛', chapter: '第1編 総則 / 第7章 犯罪の不成立及び刑の減免',
      paragraphs: [
        { num: 1, text: '急迫不正の侵害に対して、自己又は他人の権利を防衛するため、やむを得ずにした行為は、罰しない。' },
        { num: 2, text: '防衛の程度を超えた行為は、情状により、その刑を減軽し、又は免除することができる。' }
      ]
    },
    {
      num: 37, title: '緊急避難', chapter: '第1編 総則 / 第7章 犯罪の不成立及び刑の減免',
      paragraphs: [
        { num: 1, text: '自己又は他人の生命、身体、自由又は財産に対する現在の危難を避けるため、やむを得ずにした行為は、これによって生じた害が避けようとした害の程度を超えなかった場合に限り、罰しない。ただし、その程度を超えた行為は、情状により、その刑を減軽し、又は免除することができる。' }
      ]
    },
    {
      num: 38, title: '故意', chapter: '第1編 総則 / 第7章 犯罪の不成立及び刑の減免',
      paragraphs: [
        { num: 1, text: '罪を犯す意思がない行為は、罰しない。ただし、法律に特別の規定がある場合は、この限りでない。' },
        { num: 2, text: '重い罪に当たるべき行為をしたのに、行為の時にその重い罪に当たることとなる事実を知らなかった者は、その重い罪によって処断することはできない。' }
      ]
    },
    {
      num: 43, title: '未遂減免', chapter: '第1編 総則 / 第8章 未遂罪',
      paragraphs: [{ num: 1, text: '犯罪の実行に着手してこれを遂げなかった者は、その刑を減軽することができる。ただし、自己の意思により犯罪を中止したときは、その刑を減軽し、又は免除する。' }]
    },
    {
      num: 60, title: '共同正犯', chapter: '第1編 総則 / 第11章 共犯',
      paragraphs: [{ num: 1, text: '二人以上共同して犯罪を実行した者は、すべて正犯とする。' }]
    },
    {
      num: 61, title: '教唆', chapter: '第1編 総則 / 第11章 共犯',
      paragraphs: [{ num: 1, text: '人を教唆して犯罪を実行させた者には、正犯の刑を科する。' }]
    },
    {
      num: 62, title: '幇助', chapter: '第1編 総則 / 第11章 共犯',
      paragraphs: [{ num: 1, text: '正犯を幇助した者は、従犯とする。' }]
    },
    {
      num: 199, title: '殺人', chapter: '第2編 罪 / 第26章 殺人の罪',
      paragraphs: [{ num: 1, text: '人を殺した者は、死刑又は無期若しくは五年以上の懲役に処する。' }]
    },
    {
      num: 204, title: '傷害', chapter: '第2編 罪 / 第27章 傷害の罪',
      paragraphs: [{ num: 1, text: '人の身体を傷害した者は、十五年以下の懲役又は五十万円以下の罰金に処する。' }]
    },
    {
      num: 235, title: '窃盗', chapter: '第2編 罪 / 第36章 窃盗及び強盗の罪',
      paragraphs: [{ num: 1, text: '他人の財物を窃取した者は、窃盗の罪とし、十年以下の懲役又は五十万円以下の罰金に処する。' }]
    },
    {
      num: 236, title: '強盗', chapter: '第2編 罪 / 第36章 窃盗及び強盗の罪',
      paragraphs: [{ num: 1, text: '暴行又は脅迫を用いて他人の財物を強取した者は、強盗の罪とし、五年以上の有期懲役に処する。' }]
    },
    {
      num: 246, title: '詐欺', chapter: '第2編 罪 / 第37章 詐欺及び恐喝の罪',
      paragraphs: [{ num: 1, text: '人を欺いて財物を交付させた者は、十年以下の懲役に処する。' }]
    },
    {
      num: 252, title: '横領', chapter: '第2編 罪 / 第38章 横領の罪',
      paragraphs: [{ num: 1, text: '自己の占有する他人の物を横領した者は、五年以下の懲役に処する。' }]
    }
  ];

  // 民事訴訟法（超重要条文）
  const MINSO_ARTICLES = [
    {
      num: 134, title: '訴えの提起', chapter: '第2編 第1審の訴訟手続 / 第1章 訴え',
      paragraphs: [{ num: 1, text: '訴えの提起は、訴状を裁判所に提出してしなければならない。' }]
    },
    {
      num: 156, title: '適時提出主義', chapter: '第2編 第1審の訴訟手続 / 第3章 口頭弁論及びその準備',
      paragraphs: [{ num: 1, text: '攻撃又は防御の方法は、訴訟の進行状況に応じ、適切な時期に提出しなければならない。' }]
    },
    {
      num: 159, title: '自白の擬制等', chapter: '第2編 第1審の訴訟手続 / 第3章 口頭弁論及びその準備',
      paragraphs: [
        { num: 1, text: '当事者が口頭弁論において相手方の主張した事実を明白に争わないときは、その事実を自白したものとみなす。' }
      ]
    },
    {
      num: 179, title: '証明を要しない事実', chapter: '第2編 第1審の訴訟手続 / 第4章 証拠',
      paragraphs: [{ num: 1, text: '裁判所において当事者が自白した事実及び顕著な事実については、証明を要しない。' }]
    },
    {
      num: 246, title: '処分権主義', chapter: '第2編 第1審の訴訟手続 / 第5章 判決',
      paragraphs: [{ num: 1, text: '裁判所は、当事者が申し立てていない事項について、判決をすることができない。' }]
    },
    {
      num: 247, title: '自由心証主義', chapter: '第2編 第1審の訴訟手続 / 第5章 判決',
      paragraphs: [{ num: 1, text: '裁判所は、判決をするに際しては、口頭弁論の全趣旨及び証拠調べの結果をしん酌して、自由な心証により、事実についての主張を真実と認めるべきか否かを判断する。' }]
    }
  ];

  // 刑事訴訟法（超重要条文）
  const KEISO_ARTICLES = [
    {
      num: 197, title: '捜査の基本原則', chapter: '第2編 第1審 / 第1章 捜査',
      paragraphs: [
        { num: 1, text: '捜査については、その目的を達するため必要な取調をすることができる。但し、強制の処分は、この法律に特別の定のある場合でなければ、これをすることができない。' }
      ]
    },
    {
      num: 199, title: '逮捕状による逮捕', chapter: '第2編 第1審 / 第1章 捜査',
      paragraphs: [
        { num: 1, text: '検察官、検察事務官又は司法警察職員は、被疑者が罪を犯したことを疑うに足りる相当な理由があるときは、裁判官のあらかじめ発する逮捕状により、これを逮捕することができる。' }
      ]
    },
    {
      num: 212, title: '現行犯人', chapter: '第2編 第1審 / 第1章 捜査',
      paragraphs: [
        { num: 1, text: '現に罪を行ひ、又は現に罪を行ひ終つた者を現行犯人とする。' },
        { num: 2, text: '左の各号の一にあたる者が、罪を行ひ終つてから間がないと明らかに認められるときは、これを現行犯人とみなす。\n一　犯人として追呼されているとき。\n二　贓物又は明らかに犯罪の用に供したと思われる兇器その他の物を所持しているとき。\n三　身体又は被服に犯罪の顕著な証跡があるとき。\n四　誰何されて逃走しようとするとき。' }
      ]
    },
    {
      num: 317, title: '証拠裁判主義', chapter: '第2編 第1審 / 第3章 公判',
      paragraphs: [{ num: 1, text: '事実の認定は、証拠による。' }]
    },
    {
      num: 318, title: '自由心証主義', chapter: '第2編 第1審 / 第3章 公判',
      paragraphs: [{ num: 1, text: '証拠の証明力は、裁判官の自由な判断に委ねる。' }]
    },
    {
      num: 320, title: '伝聞証拠の排除', chapter: '第2編 第1審 / 第3章 公判',
      paragraphs: [{ num: 1, text: '第三百二十一条乃至第三百二十八条に規定する場合を除いては、公判期日における供述に代へて書面を証拠とし、又は公判期日外における他の者の供述を内容とする供述を証拠とすることはできない。' }]
    }
  ];

  // 会社法（超重要条文）
  const KAISHA_ARTICLES = [
    {
      num: 331, title: '取締役の資格等', chapter: '第2編 株式会社 / 第4章 機関',
      paragraphs: [{ num: 1, text: '次に掲げる者は、取締役となることができない。\n一　法人\n二　心身の故障のため職務を適正に執行することができない者\n三　この法律に違反し、刑に処せられ、その執行を終わり、又はその執行を受けることがなくなった日から二年を経過しない者' }]
    },
    {
      num: 355, title: '忠実義務', chapter: '第2編 株式会社 / 第4章 機関',
      paragraphs: [{ num: 1, text: '取締役は、法令及び定款並びに株主総会の決議を遵守し、株式会社のため忠実にその職務を行わなければならない。' }]
    },
    {
      num: 356, title: '競業及び利益相反取引の制限', chapter: '第2編 株式会社 / 第4章 機関',
      paragraphs: [{ num: 1, text: '取締役は、次に掲げる場合には、株主総会において、その取引について重要な事実を開示し、その承認を受けなければならない。\n一　取締役が自己又は第三者のために株式会社の事業の部類に属する取引をしようとするとき。\n二　取締役が自己又は第三者のために株式会社と取引をしようとするとき。' }]
    },
    {
      num: 423, title: '役員等の株式会社に対する損害賠償責任', chapter: '第2編 株式会社 / 第4章 機関',
      paragraphs: [{ num: 1, text: '取締役、会計参与、監査役、執行役又は会計監査人（以下「役員等」という。）は、その任務を怠ったときは、株式会社に対し、これによって生じた損害を賠償する責任を負う。' }]
    }
  ];

  // 行政事件訴訟法（超重要条文）
  const GYOSO_ARTICLES = [
    {
      num: 3, title: '抗告訴訟', chapter: '第1章 総則',
      paragraphs: [
        { num: 1, text: 'この法律において「抗告訴訟」とは、行政庁の公権力の行使に関する不服の訴訟をいう。' },
        { num: 2, text: 'この法律において「処分の取消しの訴え」とは、行政庁の処分その他公権力の行使に当たる行為の取消しを求める訴訟をいう。' },
        { num: 3, text: 'この法律において「裁決の取消しの訴え」とは、審査請求その他の不服申立てに対する行政庁の裁決、決定その他の行為の取消しを求める訴訟をいう。' }
      ]
    },
    {
      num: 9, title: '原告適格', chapter: '第2章 取消訴訟',
      paragraphs: [
        { num: 1, text: '処分の取消しの訴え及び裁決の取消しの訴えは、当該処分又は裁決の取消しを求めるにつき法律上の利益を有する者に限り、提起することができる。' },
        { num: 2, text: '裁判所は、処分又は裁決の相手方以外の者が法律上の利益を有するか否かを判断するに当たっては、当該処分又は裁決の根拠となる法令の規定の趣旨及び目的等をしん酌しなければならない。' }
      ]
    }
  ];

  const BUILTIN_ARTICLES = {
    kenpo: KENPO_ARTICLES,
    minpo: MINPO_ARTICLES,
    keiho: KEIHO_ARTICLES,
    minso: MINSO_ARTICLES,
    keiso: KEISO_ARTICLES,
    kaisha: KAISHA_ARTICLES,
    gyoso: GYOSO_ARTICLES,
    gyote: [
      {
        num: 1, title: '目的等', chapter: '第1章 総則',
        paragraphs: [{ num: 1, text: 'この法律は、処分、行政指導及び届出に関する手続並びに命令等を定める手続に関し、共通する事項を定めることによって、行政運営における公正の確保と透明性の向上を図り、もって国民の権利利益の保護に資することを目的とする。' }]
      },
      {
        num: 12, title: '処分の基準', chapter: '第2章 申請に対する処分',
        paragraphs: [{ num: 1, text: '行政庁は、処分基準を定め、かつ、これを公にしておくよう努めなければならない。' }]
      }
    ],
    gyofuku: [
      {
        num: 1, title: '目的等', chapter: '第1章 総則',
        paragraphs: [{ num: 1, text: 'この法律は、行政庁の違法又は不当な処分その他公権力の行使に当たる行為に関し、国民が簡易迅速かつ公正な手続の下で広く行政庁に対する不服申立てをすることができる制度を定めることを目的とする。' }]
      }
    ]
  };

  const text = (v) => String(v ?? '').trim();

  function formatArticleNum(num, subNum = 0) {
    const main = Number(num) || 0;
    const sub = Number(subNum) || 0;
    return sub > 0 ? `第${main}条の${sub}` : `第${main}条`;
  }

  function statuteKey(lawId, num, subNum = 0) {
    const sub = Number(subNum) || 0;
    return sub > 0 ? `${text(lawId)}:${num}_${sub}` : `${text(lawId)}:${num}`;
  }

  function parseStatuteKey(key) {
    const parts = String(key || '').split(':');
    if (parts.length !== 2) return null;
    const lawId = parts[0];
    const numPart = parts[1];
    if (numPart.includes('_')) {
      const [n, s] = numPart.split('_');
      return { lawId, num: Number(n) || 0, subNum: Number(s) || 0 };
    }
    return { lawId, num: Number(numPart) || 0, subNum: 0 };
  }

  function normalizeArticle(raw, lawId = '') {
    const num = Number(raw && raw.num) || 0;
    const subNum = Number(raw && raw.subNum) || 0;
    const title = text(raw && raw.title);
    const chapter = text(raw && raw.chapter);
    const rawParas = Array.isArray(raw && raw.paragraphs) ? raw.paragraphs : [];
    const paragraphs = rawParas.map((p, idx) => ({
      num: Number(p && p.num) || idx + 1,
      text: text(p && p.text || p)
    })).filter((p) => p.text);

    return {
      lawId: text(lawId || raw && raw.lawId),
      num,
      subNum,
      displayNum: formatArticleNum(num, subNum),
      title,
      chapter,
      paragraphs
    };
  }

  function getLaw(lawId) {
    const target = text(lawId);
    return LAWS.find((l) => l.id === target) || null;
  }

  function getArticlesForLaw(lawId) {
    const list = BUILTIN_ARTICLES[lawId] || [];
    return list.map((a) => normalizeArticle(a, lawId));
  }

  function normalizeLegalSearch(str) {
    return String(str || '').normalize('NFKC')
      .replace(/[\s\u3000]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function filterArticles(articles, options = {}) {
    const articleNum = options.articleNum ? Number(options.articleNum) : null;
    const query = normalizeLegalSearch(options.query);
    const hasNoteOnly = Boolean(options.hasNoteOnly);
    const notesMap = options.notesMap || {};

    return (Array.isArray(articles) ? articles : []).filter((article) => {
      const key = statuteKey(article.lawId, article.num, article.subNum);
      const note = notesMap[key];
      const hasNote = Boolean(note && text(note.text));

      if (hasNoteOnly && !hasNote) return false;
      if (articleNum != null && article.num !== articleNum) return false;

      if (!query) return true;

      const numStr = String(article.num);
      const subStr = article.subNum ? String(article.subNum) : '';
      if (numStr === query || (article.subNum && `${numStr}-${subStr}` === query)) return true;

      const targetText = [
        article.displayNum,
        article.title,
        article.chapter,
        ...article.paragraphs.map((p) => p.text),
        hasNote ? note.text : '',
        hasNote && Array.isArray(note.tags) ? note.tags.join(' ') : ''
      ].join(' ');

      return normalizeLegalSearch(targetText).includes(query);
    });
  }

  return {
    LAWS,
    BUILTIN_ARTICLES,
    formatArticleNum,
    statuteKey,
    parseStatuteKey,
    normalizeArticle,
    getLaw,
    getArticlesForLaw,
    filterArticles,
    normalizeLegalSearch
  };
}));
