/* ============================================================
   資料表：服務項目碼、照顧問題清單、稱謂、預設設定
   src 欄位說明：
     'law' = 官方：長期照顧服務申請及給付辦法 附表四、附表四之一（114.06.19 修正）
     'ex'  = 名稱逐字取自單位提供的計畫範例或訪視評估表（CMS 上的寫法）
     'web' = 取自網路上的地方政府公開資料，非法規附表
     'ref' = 推定項目，尚未經單位核對
   介面上 'web' 與 'ref' 會標示「請核對」。
   ============================================================ */
var DATA = (function () {
  function S(code, name, src, extra) {
    var o = { code: code, name: name, src: src || 'ref' };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  /* 依代碼開頭取出官方項目 */
  function official(re, map) {
    return OFFICIAL_CODES.filter(function (c) { return re.test(c[0]); }).map(function (c) {
      var o = S(c[0], c[1], 'law');
      return map ? map(o) : o;
    });
  }
  function dayInfo(o) {
    var n = +o.code.slice(2);
    o.dayType = Math.ceil(n / 2); o.half = n % 2 === 0;      /* 第1型～第7型對應 CMS 第2級～第8級 */
    return o;
  }

  /* 居家服務：BA15、BA16 在 CMS 上分為 -1(自用)、-2(共用) */
  var ba = [];
  official(/^BA/).forEach(function (o) {
    if (o.code === 'BA15') { ba.push(S('BA15-1', '家務協助(自用)', 'ex')); ba.push(S('BA15-2', '家務協助(共用)', 'ref')); }
    else if (o.code === 'BA16') { ba.push(S('BA16-1', '代購或代領或代送服務(自用)', 'ex')); ba.push(S('BA16-2', '代購或代領或代送服務(共用)', 'ref')); }
    else ba.push(o);
  });
  /* 輔具及居家無障礙：依附表四各項說明與通則分為免評估／需評估；EA01 在 CMS 上細分為 -1、-2、-3 */
  function ev(o) { o.ev = AIDS_EVAL[o.code.replace(/-\d$/, '')] || 'na'; return o; }
  var aidsAll = official(/^(E[A-I]|FA)/).map(ev);
  aidsAll.splice(1, 0, ev(S('EA01-1', '馬桶增高器', 'ref')), ev(S('EA01-2', '便盆椅', 'ex')), ev(S('EA01-3', '沐浴椅', 'ex')));
  function aidsBy(evType, re) { return aidsAll.filter(function (o) { return (evType === 'need' ? o.ev !== 'free' : o.ev === 'free') && re.test(o.code); }); }

  var catalog = {
    care: [
      { group: '居家服務（BA）', items: ba },
      { group: '日間照顧（BB）', items: official(/^BB/, dayInfo) },
      { group: '家庭托顧（BC）', items: official(/^BC/, dayInfo) },
      { group: '社區式服務（BD）', items: official(/^BD/) }
    ],
    pro: [
      { group: '專業服務（C碼）', items: official(/^C/) }
    ],
    aids: [
      { group: '免評估｜輔具供應人員可逕行提供（EA、EB01–03、EC01–02、EE、EF）', items: aidsBy('free', /./) },
      { group: '需評估｜行走輔具、輪椅與擺位（EB04、EC03–12）', items: aidsBy('need', /^E[BC]/) },
      { group: '需評估｜移位輔具（ED）', items: aidsBy('need', /^ED/) },
      { group: '需評估｜氣墊床與輪椅座墊（EG）', items: aidsBy('need', /^EG/) },
      { group: '需評估｜照顧床與爬梯機（EH）', items: aidsBy('need', /^EH/) },
      { group: '需評估｜智慧科技輔具（EI，115年7月起，須甲類輔具評估人員評估）', items: aidsBy('need', /^EI/) },
      { group: '需評估｜居家無障礙環境改善（FA，115年7月起新碼）', items: aidsBy('need', /^FA/) }
    ],
    respite: [
      { group: '喘息服務（GA）', items: official(/^GA/) }
    ],
    short: [
      { group: '短照服務（SC）— 不在給付辦法附表內，名稱取自地方政府公開資料', items: [
        S('SC03', '日間照顧中心短照服務--全日', 'web'),
        S('SC04', '日間照顧中心短照服務--半日', 'web'),
        S('SC05', '機構住宿式短照服務', 'web'),
        S('SC06', '小規模多機能服務-夜間短照', 'web'),
        S('SC07', '巷弄長照站短照服務', 'web'),
        S('SC09', '居家短照服務', 'ex')
      ] }
    ],
    other: [
      { group: '地方項目', items: [
        S('OT01', '營養餐飲', 'ex'),
        S('ZF01', '緊急救援通報系統服務', 'ex'),
        S('ZF02', '家庭照顧者服務', 'ex')
      ] }
      /* 政策鼓勵服務（AA03–AA12）115.11 依單位要求自選單移除 */
    ]
  };

  /* 照顧問題清單（34項）— 115.11.14 經單位核對 */
  var problems = ['進食問題', '洗澡問題', '個人修飾問題', '穿脫衣物問題', '大小便控制問題', '上廁所問題', '移位問題', '走路問題', '上下樓梯問題', '使用電話問題',
    '購物或外出問題', '備餐問題', '處理家務問題', '用藥問題', '處理財務問題', '溝通問題', '短期記憶障礙', '疼痛問題', '不動症候群風險', '皮膚照護問題',
    '傷口問題', '水份及營養問題', '吞嚥問題', '管路照顧問題', '其他醫療照護問題', '跌倒風險', '安全疑慮', '居住環境障礙', '社會參與需協助', '困擾行為',
    '照顧負荷過重', '輔具使用問題', '感染問題', '其他問題'].map(function (n, i) { return { no: i + 1, name: n }; });

  /* 喘息額度：給付辦法附表二（第2–6級 32,340 元/年；第7–8級 48,510 元/年）；單價：附表四
     短照額度與單價：不在給付辦法內（第2–6級 87,780 元/年＝SC09 114組；第7–8級 71,610 元/年＝93組；單價比照喘息），115.11.15 經單位確認 */
  var quota = {
    respite: { 2: 32340, 3: 32340, 4: 32340, 5: 32340, 6: 32340, 7: 48510, 8: 48510 },
    short: { 2: 87780, 3: 87780, 4: 87780, 5: 87780, 6: 87780, 7: 71610, 8: 71610 },
    price: { GA03: 1250, GA04: 625, GA05: 2310, GA06: 2000, GA07: 170, GA09: 770, SC03: 1250, SC04: 625, SC05: 2310, SC06: 2000, SC07: 170, SC09: 770 }
  };
  /* 身心障礙類別：身心障礙者權益保障法第5條 */
  var disCats = [
    ['第一類', '神經系統構造及精神、心智功能'], ['第二類', '眼、耳及相關構造與感官功能及疼痛'], ['第三類', '涉及聲音與言語構造及其功能'],
    ['第四類', '循環、造血、免疫與呼吸系統構造及其功能'], ['第五類', '消化、新陳代謝與內分泌系統相關構造及其功能'], ['第六類', '泌尿與生殖系統相關構造及其功能'],
    ['第七類', '神經、肌肉、骨骼之移動相關構造及其功能'], ['第八類', '皮膚與相關構造及其功能']];

  var relations = ['案妻', '案夫', '案子', '案長子', '案次子', '案三子', '案么子', '案女', '案長女', '案次女', '案三女', '案么女',
    '案媳', '案婿', '案孫', '案孫子', '案孫女', '案孫媳', '案父', '案母', '案兄', '案弟', '案姊', '案妹', '案姪', '案姪女', '案外甥', '案外甥女', '外看', '友人', '鄰居'];

  /* 交通接送（DA01）服務單位：取自「114~116年新北市長照特約單位名單1150909（交通接送服務、社區交通接送）」，
     只列可提供服務區域含泰山區（含「新北市全29區」）者，共 21 個。
     115.11.17 依單位要求按鈕與計畫文字一律用簡稱、依單位指定順序；兩家「大豐」分寫為大豐國際、大豐交通。 */
  var vendorPairs = [
    ['亞捷', '亞捷汽車租賃股份有限公司'], ['捷安', '捷安租賃股份有限公司'], ['金永', '金永國際租賃有限公司'], ['北台灣', '北台灣無障礙運輸產業工會'],
    ['好爸爸', '好爸爸無障礙爬梯機接送有限公司'], ['吉盛', '吉盛交通股份有限公司'], ['太豐', '太豐交通有限公司'], ['振生', '社團法人振生長期照顧協會'],
    ['福倫', '福倫交通股份有限公司'], ['勝安', '勝安租賃有限公司'], ['優遊', '優遊小客車租賃有限公司'], ['台灣福祉車', '台灣福祉車租賃有限公司'],
    ['樂康協會', '社團法人台灣樂康協會'], ['小驢駒', '小驢駒小客車租賃有限公司'], ['樂格適', '樂格適小客車租賃有限公司'], ['大豐國際', '大豐國際租賃有限公司'],
    ['駿德', '駿德租賃有限公司'], ['生活', '生活交通有限公司'], ['樂活協會', '社團法人台灣樂活協會'], ['三揚', '三揚國際租賃有限公司'],
    ['大豐交通', '大豐交通有限公司台北市分公司']];
  var vendors = vendorPairs.map(function (p) { return p[0]; });
  /* 舊版存的全名 → 簡稱（開啟舊個案、舊設定時自動換成簡稱） */
  var vendorAlias = {};
  vendorPairs.forEach(function (p) { vendorAlias[p[1]] = p[0]; });
  /* 舊版預設名單（未自行修改過的設定會換成新名單）：最早的六個簡稱、115.9 版 21 個全名 */
  var oldVendorLists = [['亞捷', '捷安', '金永', '北台灣', '好爸爸', '吉盛'], vendorPairs.map(function (p) { return p[1]; })];

  var defaults = {
    cmName: '',
    address: '新北市泰山區',
    transAmount: '1840',
    vendors: vendors,
    /* 每週 N 天 → 每月單位數（1天5、2天9、3天14、4天18、5天23、6天27、每日31；115.11.14 經單位確認） */
    weekFactor: { 1: 5, 2: 9, 3: 14, 4: 18, 5: 23, 6: 27, 7: 31 },
    headGap: '　',
    customItems: []   /* {cat, code, name} 使用者自行新增的服務項目 */
  };

  return { catalog: catalog, problems: problems, relations: relations, defaults: defaults, quota: quota, disCats: disCats, vendorAlias: vendorAlias, oldVendorLists: oldVendorLists };
})();
