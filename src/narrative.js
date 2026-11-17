/* ============================================================
   文字產生器：把評估表勾選內容組成 CMS「計畫目標」「計畫執行規劃」兩欄文字
   句型、用語依單位提供的十份計畫範例歸納
   ============================================================ */
var NAR = (function () {
  var DAYN = ['', '一', '二', '三', '四', '五', '六', '日'];
  var CNT = ['', '一', '兩', '三', '四', '五', '六', '七'];

  /* ---------- 小工具 ---------- */
  function nz(s) { return (s === undefined || s === null) ? '' : String(s).trim(); }
  function arr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
  function stripEnd(s) { return nz(s).replace(/[。，、；,.;\s]+$/, ''); }
  function joinAnd(list) {
    list = list.filter(Boolean);
    if (list.length <= 1) return list.join('');
    /* 含「及」的項目不放在最後，避免出現「A及B及C」 */
    if (list[list.length - 1].indexOf('及') >= 0) {
      var plain = -1;
      for (var i = list.length - 2; i >= 0; i--) if (list[i].indexOf('及') < 0) { plain = i; break; }
      if (plain >= 0) { list = list.slice(); list.push(list.splice(plain, 1)[0]); }
    }
    return list.slice(0, -1).join('、') + '及' + list[list.length - 1];
  }
  function clause(parts) { return parts.map(stripEnd).filter(Boolean).join('，'); }
  function sent(parts) { var s = clause(arr(parts)); return s ? s + '。' : ''; }
  function splitList(s) { return nz(s).split(/[、,，\/\n]+/).map(nz).filter(Boolean); }
  /* 複選值（去除「其他」標記，並把其他文字併入） */
  function vals(f, id) {
    var a = arr(f[id]).filter(function (v) { return v !== '__other'; });
    if (arr(f[id]).indexOf('__other') >= 0) splitList(f[id + '__other']).forEach(function (x) { a.push(x); });
    return a;
  }
  function has(f, id, v) { return arr(f[id]).indexOf(v) >= 0; }

  /* ---------- 日期（民國） ---------- */
  function roc(dateStr) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(nz(dateStr));
    if (!m) return null;
    return { y: +m[1] - 1911, m: +m[2], d: +m[3] };
  }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function rocLong(s) { var r = roc(s); return r ? r.y + '年' + r.m + '月' + r.d + '日' : ''; }
  function rocDot(s) { var r = roc(s); return r ? r.y + '.' + p2(r.m) + '.' + p2(r.d) : ''; }
  /* 額度區間：自訪視月份起算 12 個月，如 115.11-116.10 */
  function quotaPeriod(s) {
    var r = roc(s); if (!r) return '';
    var em = r.m - 1, ey = r.y + 1; if (em === 0) { em = 12; ey = r.y; }
    return r.y + '.' + p2(r.m) + '-' + ey + '.' + p2(em);
  }

  /* ---------- 壹：訪視與參與者 ---------- */
  function participants(f) {
    var present = [], phone = [];
    if (f.clientJoin !== '否') present.push('個案' + nz(f.name));
    arr(f.attendees).forEach(function (a) {
      var s = nz(a.rel) + nz(a.name); if (!s) return;
      (a.mode === '致電' ? phone : present).push(s);
    });
    if (phone.length) return present.join('、') + (present.length ? '及' : '') + '致電' + joinAnd(phone);
    return joinAnd(present);
  }
  /* 訪視類型：「初評」「出備初評」「複評」「AA01」；複評與 AA01 寫「複評家訪」（舊資料的「複評/AA01」也視為複評） */
  function isReview(f) { return has(f, 'visitType', '複評') || has(f, 'visitType', 'AA01') || has(f, 'visitType', '複評/AA01'); }
  function visitPhrase(f) {
    var d = rocLong(f.visitDate) || '○年○月○日';
    return d + (f.withCM === '是' ? '與照專一同' : '') + (isReview(f) ? '複評家訪' : has(f, 'visitType', '出備初評') ? '出院準備初評家訪' : '家訪');
  }
  function s1(f, st) {
    return '壹、' + st.headGap + '本案於' + visitPhrase(f) + '，與' + (participants(f) || '個案') + '討論照顧計畫/個管' + nz(f.cmName) + '。';
  }

  /* ---------- 貳-1 生理 ---------- */
  var DX_CAT = { '失智症': 1, '腎臟病': 1, '癌症': 1, '骨科疾病': 1, '精神疾病': 1 };
  function dxList(f) {
    var notes = f.dx__note || {};
    var out = arr(f.dx).filter(function (v) { return v !== '__other'; }).map(function (v) {
      var n = nz(notes[v]);
      if (DX_CAT[v] && n) return n;             /* 類別型有備註時直接寫備註，如「攝護腺癌」 */
      return v + (n ? '(' + n + ')' : '');
    });
    splitList(f.dxOther).forEach(function (x) { out.push(x); });
    return out;
  }
  function clinicPhrase(f) {
    var hosp = nz(f.hospital), modes = vals(f, 'transport'), escort = nz(f.escort);
    var freq = nz(f.followN) ? '每' + nz(f.followN) + (f.followUnit === '週' ? '週' : '個月') : '';
    if (!hosp && !modes.length && !freq && !escort) return '';
    var dest = (hosp || '醫院') + '回診領藥';
    var verbs = { '家人開車接送': '開車接送', '計程車': '搭計程車', '復康巴士': '搭復康巴士', '長照交通(DA01)': '搭長照交通車' };
    var self = modes.indexOf('自行前往') >= 0;
    var others = modes.filter(function (m) { return m !== '自行前往'; }).map(function (m) { return verbs[m] || m; });
    var lead = freq || '固定';
    if (!others.length) {
      if (self) return lead + '自行前往' + dest;
      return lead + (escort ? '由' + escort + '陪同' : '') + '至' + dest;
    }
    var how;
    if (escort) how = '由' + escort + others.map(function (v) { return v === '開車接送' ? '開車接送' : '陪同個案' + v; }).join('或');
    else how = others.map(function (v) { return v === '開車接送' ? '由家人開車接送' : v; }).join('或');
    if (self) return (freq || '平時') + '多自行前往' + dest + '，有需要時' + how;
    return lead + how + '至' + dest;
  }
  function medPhrase(f) {
    var h = nz(f.medHelper) || '家屬', out = [];
    if (has(f, 'med', '未服用藥物')) out.push('目前未服用任何藥物');
    if (has(f, 'med', '自行拿取服用')) out.push('藥物可自行拿取服用');
    if (has(f, 'med', '放入藥盒個案自行拿取')) out.push('藥物由' + h + '協助分藥至藥盒後，個案可自行拿取服用');
    if (has(f, 'med', '他人拿藥給個案服用')) out.push('藥物由' + h + '拿給個案服用');
    if (has(f, 'med', '需他人提醒督促')) out.push('藥物需' + h + '提醒督促個案服用');
    if (has(f, 'med', '協助磨粉')) out.push('藥物需協助磨粉');
    if (has(f, 'med', '協助灌藥')) out.push('藥物需協助管灌');
    if (f.medRegular === '規律') out.push('服藥規律');
    if (f.medRegular === '偶爾忘記') out.push('偶爾會有忘記服藥情形');
    if (f.medRegular === '不規律') out.push('藥物服用較不規律');
    if (nz(f.medNote)) out.push(f.medNote);
    return out;
  }
  function physP1(f) {
    var dx = dxList(f), parts = [];
    if (dx.length === 1) parts.push('個案有' + dx[0] + '病史');
    else if (dx.length > 1) parts.push('個案有' + dx.join('、') + '等病史');
    if (nz(f.dxNote)) parts.push(f.dxNote);
    if (f.disCard === '有') {
      var dc = arr(f.disCat), dd = (dc.length ? '新制' + joinAnd(dc) : '') + (f.disLevel || '');
      var dn = [dd, stripEnd(f.disCardNote)].filter(Boolean).join('，');
      parts.push('領有身心障礙證明' + (dn ? '(' + dn + ')' : ''));
    }
    var c = clinicPhrase(f); if (c) parts.push(c);
    medPhrase(f).forEach(function (x) { parts.push(x); });
    var out = [sent(parts)];
    if (out[0] && !/^個案/.test(out[0])) out[0] = '個案' + out[0];
    /* 管路 */
    var t = arr(f.tubes), inst = [], own = [], need = [];
    ['鼻胃管', '鼻腸管', '尿管', '氣切管'].forEach(function (x) { if (t.indexOf(x) >= 0) inst.push(x); });
    ['腸造口', '膀胱造口', '洗腎廔管'].forEach(function (x) { if (t.indexOf(x) >= 0) own.push(x); });
    if (t.indexOf('使用氧氣') >= 0) need.push('使用氧氣');
    if (t.indexOf('抽痰') >= 0) need.push('抽痰');
    if (t.indexOf('傷口換藥') >= 0) need.push('傷口換藥');
    var tp = [];
    if (inst.length) tp.push('裝有' + inst.join('、'));
    if (own.length) tp.push('有' + joinAnd(own));
    if (need.length) tp.push('需' + joinAnd(need));
    if (tp.length || nz(f.tubeNote)) {
      var ts = tp.length ? '個案目前' + tp.join('，') : '';
      out.push(sent([ts, f.tubeNote]));
    }
    /* 疼痛 */
    if (f.painHas === '有') {
      var ps = '個案主訴' + nz(f.painSite) + '疼痛';
      if (f.painScore !== '' && f.painScore !== undefined && f.painScore !== null) ps += '，疼痛指數約' + f.painScore + '分';
      out.push(sent([ps, f.painNote]));
    }
    return out.filter(Boolean).join('');
  }

  function sensoryParts(f) {
    var v = arr(f.vision), hr = arr(f.hearing), parts = [];
    var vOK = v.length === 1 && v[0] === '正常', hOK = hr.length === 1 && hr[0] === '正常';
    if (vOK && hOK) parts.push('視聽力佳');
    else {
      var vp = [];
      var haveL = ['近視', '老花', '白內障', '黃斑部病變'].filter(function (x) { return v.indexOf(x) >= 0; });
      if (v.indexOf('正常') >= 0) vp.push('視力良好');
      if (haveL.length) vp.push('有' + joinAnd(haveL));
      if (v.indexOf('可看清大字/電視') >= 0) vp.push('可看清大字及電視');
      if (v.indexOf('視力模糊') >= 0) vp.push('視力模糊');
      if (v.indexOf('失明') >= 0) vp.push('視力幾乎喪失');
      var hp = [];
      if (hr.indexOf('正常') >= 0) hp.push('聽力良好');
      if (hr.indexOf('重聽') >= 0) hp.push('有重聽，需提高音量對話');
      if (hr.indexOf('使用助聽器') >= 0) hp.push('有配戴助聽器');
      vp.concat(hp).forEach(function (x) { parts.push(x); });
    }
    if (f.conscious === '清醒') parts.push('意識清楚');
    if (f.conscious === '嗜睡') parts.push('意識較嗜睡');
    if (f.conscious === '混亂') parts.push('意識混亂');
    if (f.cognition === '輕微退化') parts.push('認知功能輕微退化');
    if (f.cognition === '失智') parts.push('有失智情形');
    var lg = vals(f, 'lang');
    if (lg.length && !(lg.length === 1 && lg[0] === '國')) {
      var names = lg.map(function (x) { return { '國': '國語', '台': '台語', '客': '客語' }[x] || x; });
      parts.push('慣用' + joinAnd(names) + '溝通');
    }
    var cm = { '可完整回覆': '可與人溝通對話', '簡短回覆': '僅能簡短回覆', '點頭搖頭': '僅能以點頭搖頭回應', '無口語/無法回覆': '無法以口語表達' }[f.comm];
    if (cm) parts.push(cm);
    if (nz(f.sensNote)) parts.push(f.sensNote);
    return parts;
  }
  /* 肌力：上臂、前臂、大腿、小腿（左右各一）；同一肢體兩段分數相同時合寫為「右上肢4分」。舊資料只有上肢／下肢 */
  var MUSCLE = [['rua', '右上臂'], ['rfa', '右前臂'], ['lua', '左上臂'], ['lfa', '左前臂'], ['rth', '右大腿'], ['rca', '右小腿'], ['lth', '左大腿'], ['lca', '左小腿']];
  var MUSCLE_OLD = [['ru', '右上肢'], ['lu', '左上肢'], ['rl', '右下肢'], ['ll', '左下肢']];
  function musclePhrases(mp) {
    mp = mp || {};
    function v(k) { return nz(mp[k]); }
    var out = [];
    [['rua', 'rfa', '右上肢'], ['lua', 'lfa', '左上肢'], ['rth', 'rca', '右下肢'], ['lth', 'lca', '左下肢']].forEach(function (g) {
      var a = v(g[0]), b = v(g[1]);
      if (a !== '' && a === b) { out.push(g[2] + a + '分'); return; }
      MUSCLE.forEach(function (m) { if ((m[0] === g[0] || m[0] === g[1]) && v(m[0]) !== '') out.push(m[1] + v(m[0]) + '分'); });
    });
    MUSCLE_OLD.forEach(function (k) { if (v(k[0]) !== '') out.push(k[1] + v(k[0]) + '分'); });
    return out;
  }
  function mobilityParts(f) {
    var parts = [], l = arr(f.limbs);
    if (l.indexOf('四肢正常') >= 0) parts.push('四肢活動度良好');
    if (l.indexOf('偏癱') >= 0) { var sd = arr(f.hemiSide); parts.push((sd.length === 2 ? '雙' : (sd[0] || '')) + '側偏癱'); }
    if (l.indexOf('肌力退化') >= 0) {
      var wp = arr(f.weakPart);
      parts.push(wp.length === 1 ? wp[0] + '較無力' : '四肢肌力退化');
    }
    var mpl = musclePhrases(f.mp);
    if (mpl.length) parts.push('肌力約' + mpl.join('、'));
    var g = f.gait;
    if (g === '穩') parts.push('可自行行走，步態穩');
    if (g === '尚穩') parts.push('可自行行走，步態尚穩');
    if (g === '不穩需攙扶') parts.push('步態不穩，行走需他人' + ({ '輕': '輕度', '中': '中度', '重': '大量' }[f.gaitAssist] || '') + '攙扶');
    if (g === '輪椅代步') parts.push('行走需以輪椅代步');
    if (g === '臥床') parts.push('目前長期臥床');
    var aid = vals(f, 'walkAid');
    if (aid.indexOf('無需輔具') >= 0) parts.push('無需使用輔具');
    else {
      var aa = aid.filter(function (x) { return !(g === '輪椅代步' && x === '輪椅'); });
      if (aa.length) parts.push((g === '輪椅代步' ? '另備有' : '行走時會使用') + joinAnd(aa));
    }
    if (f.rise === '可自行') parts.push('可自行起身');
    if (f.rise === '需協助') parts.push('翻身及起身需他人協助');
    if (f.transfer === '可自行') parts.push('轉移位可自行完成');
    if (f.transfer === '需人協助') parts.push('轉移位需他人協助');
    if (f.transfer === '需人推輪椅') parts.push('需他人協助推輪椅');
    if (f.stairs === '可自行') parts.push('可自行上下樓梯');
    if (f.stairs === '需攙扶') parts.push('上下樓梯需他人攙扶');
    if (f.stairs === '無法上下樓') parts.push('無法上下樓梯');
    if (f.outdoor === '可自行外出') parts.push('可自行外出');
    if (f.outdoor === '需有人陪同') parts.push('外出需有人陪同');
    if (f.outdoor === '無法外出') parts.push('無法自行外出');
    if (f.fallHas === '有') parts.push('近半年有跌倒紀錄' + (nz(f.fallNote) ? '(' + stripEnd(f.fallNote) + ')' : ''));
    if (f.fallHas === '無') parts.push('近半年無跌倒紀錄');
    if (f.lostHas === '有') parts.push('曾有走失情形' + (nz(f.lostNote) ? '(' + stripEnd(f.lostNote) + ')' : ''));
    if (nz(f.mobNote)) parts.push(f.mobNote);
    return parts;
  }
  function physP2(f) {
    var p = sensoryParts(f).concat(mobilityParts(f));
    return p.length ? '個案' + sent(p) : '';
  }
  function physP3(f) {
    var parts = [];
    var allSelf = f.groom === '自理' && f.dress === '自理' && f.bath === '自行沐浴';
    function pose() {
      if (f.bathPose === '站姿') return '習慣站立沐浴';
      if (f.bathPose === '坐姿') return '沐浴時採坐姿' + (nz(f.bathAid) ? '(使用' + nz(f.bathAid) + ')' : '');
      return '';
    }
    if (allSelf) { parts.push('盥洗、穿脫衣物及沐浴洗頭皆可自理'); if (pose()) parts.push(pose()); }
    else {
      if (f.groom === '自理') parts.push('盥洗可自理');
      if (f.groom === '需部份協助') parts.push('盥洗需他人部分協助' + (nz(f.groomNote) ? '(' + nz(f.groomNote) + ')' : ''));
      if (f.groom === '需完全協助') parts.push('盥洗需他人完全協助');
      if (f.dress === '自理') parts.push('穿脫衣物可自理');
      if (f.dress === '需部份協助') {
        var dh = vals(f, 'dressHelp').map(function (x) { return x === '冷熱不分' ? '冷熱不分需提醒增減衣物' : x; });
        parts.push('穿脫衣物需他人部分協助' + (dh.length ? '(' + dh.join('、') + ')' : ''));
      }
      if (f.dress === '完全需他人協助') parts.push('穿脫衣物完全需他人協助');
      if (f.bath === '自行沐浴') { parts.push('沐浴洗頭可自理'); if (pose()) parts.push(pose()); }
      if (f.bath === '需部份協助') {
        var bp = vals(f, 'bathPart');
        parts.push('沐浴洗頭需他人協助' + (bp.length ? '清洗' + joinAnd(bp) : ''));
      }
      if (f.bath === '完全需他人協助') {
        var bf = vals(f, 'bathFull');
        parts.push('沐浴完全需他人協助' + (bf.length ? '，目前以' + joinAnd(bf) + '方式清潔' : ''));
      }
    }
    if (f.bathClean === '良好') parts.push('身體清潔狀況無礙');
    if (f.bathClean === '欠佳') parts.push('清潔度欠佳');
    /* 排泄 */
    var u = arr(f.urine), st = arr(f.stool);
    var incont = u.indexOf('失禁') >= 0 || u.indexOf('偶有滲尿或不及如廁') >= 0;
    var plain = u.indexOf('尿布') < 0 && u.indexOf('尿管') < 0 && !incont && st.indexOf('便秘') < 0 && st.indexOf('腹瀉') < 0;
    var tl = arr(f.toilet), selfT = tl.indexOf('可自行至廁所') >= 0;
    if (selfT && plain && (u.length || st.length)) parts.push('大小便可自行至廁所如廁，暫無大小便失禁或不及如廁情形');
    else {
      if (selfT) parts.push('可自行至廁所如廁');
      if (tl.indexOf('需他人協助如廁') >= 0) parts.push('如廁需他人協助');
      if (tl.indexOf('使用便盆椅') >= 0) parts.push('平時使用便盆椅如廁');
      if (tl.indexOf('臥床使用尿布') >= 0) parts.push('臥床使用尿布');
      if (u.indexOf('自理') >= 0 && !selfT) parts.push('解尿可自理');
      if (u.indexOf('尿布') >= 0 && tl.indexOf('臥床使用尿布') < 0) parts.push('目前使用尿布');
      if (has(f, 'diaperHelp', '需清潔更換')) parts.push('尿布需他人協助清潔更換');
      if (u.indexOf('尿管') >= 0) parts.push('目前留置尿管');
      if (u.indexOf('頻尿') >= 0) parts.push('有頻尿情形');
      if (u.indexOf('偶有滲尿或不及如廁') >= 0) parts.push('偶有滲尿或不及如廁情形');
      if (u.indexOf('失禁') >= 0) parts.push('有小便失禁情形');
      if (st.indexOf('正常') >= 0) parts.push('排便正常');
      if (st.indexOf('便秘') >= 0) parts.push('有便秘情形');
      if (st.indexOf('腹瀉') >= 0) parts.push('有腹瀉情形');
    }
    if (u.indexOf('頻尿') >= 0 && parts.indexOf('有頻尿情形') < 0) parts.push('有頻尿情形');
    if (tl.indexOf('預防性穿尿片') >= 0) parts.push('平時預防性穿著尿片');
    if (nz(f.urineNote)) parts.push(f.urineNote);
    if (nz(f.stoolNote)) parts.push(f.stoolNote);
    var sk = arr(f.skin);
    if (sk.indexOf('完整') >= 0) parts.push('皮膚完整');
    if (sk.indexOf('乾燥') >= 0) parts.push('皮膚乾燥');
    if (sk.indexOf('壓傷/傷口') >= 0) parts.push(nz(f.skinSite) + '有壓傷或傷口');
    if (nz(f.hygNote)) parts.push(f.hygNote);
    return parts.length ? '個案' + sent(parts) : '';
  }
  function physIADL(f) {
    var parts = [];
    var hw = { '自理': '家務可自理', '部分協助': '家務需他人部分協助', '完全依賴': '家務需他人協助處理' }[f.housework]; if (hw) parts.push(hw);
    if (f.shopping === '自理') parts.push('可自行購物');
    if (f.shopping === '部分協助') parts.push('購物需他人部分協助' + (nz(f.shoppingNote) ? '(' + nz(f.shoppingNote) + ')' : ''));
    if (f.shopping === '完全依賴') parts.push('購物需他人代為處理');
    if (f.finance === '自理') parts.push('財務可自行處理，找算錢能力無礙');
    if (f.finance === '部分協助') parts.push('財務需他人部分協助' + (nz(f.financeNote) ? '(' + nz(f.financeNote) + ')' : ''));
    if (f.finance === '完全依賴') parts.push('財務由他人協助處理');
    var ph = { '自理': '可自行撥接電話', '部分協助': '可接聽電話，撥打需他人協助', '完全依賴': '無法自行使用電話', '可接聽': '可接聽電話，無法自行撥打', '可撥熟悉電話': '可接聽電話及撥打熟悉的電話號碼' }[f.phoneUse]; if (ph) parts.push(ph);
    return parts.length ? '個案' + sent(parts) : '';
  }
  function bmiOf(f) {
    var h = parseFloat(f.height), w = parseFloat(f.weight);
    if (!(h > 0) || !(w > 0)) return '';
    return (w / Math.pow(h / 100, 2)).toFixed(2);
  }
  function bmiCat(b) { b = parseFloat(b); if (!(b > 0)) return ''; return b < 18.5 ? '過輕' : (b < 24 ? '正常' : '過重'); }
  function physP5(f) {
    var parts = [], mb = arr(f.mealBy), src = [];
    if (mb.indexOf('自行準備') >= 0) src.push('自行準備');
    if (mb.indexOf('家屬準備') >= 0) src.push('由' + (nz(f.mealWho) || '家屬') + '準備');
    else if (nz(f.mealWho) && !(f.mealWho === '外看' && mb.indexOf('外看準備') >= 0)) src.push('由' + nz(f.mealWho) + '準備');
    if (mb.indexOf('外看準備') >= 0) src.push('由外看準備');
    if (mb.indexOf('外食/自行購買') >= 0) src.push(src.length ? '個案外出購買' : '為外食或自行外出購買');
    if (mb.indexOf('送餐服務') >= 0) src.push('使用送餐服務');
    if (src.length) parts.push('餐食' + (src.length > 1 ? '多' : '') + src.join('，或是'));
    var e = { '自行進食': '可自行用餐', '需備餐/切碎': '需他人備餐或將食物切碎後可自行進食', '需協助餵食': '需他人協助餵食', '鼻胃管灌食': '目前以鼻胃管灌食' }[f.eat];
    if (e) parts.push(e + (f.eat === '鼻胃管灌食' && nz(f.tubeFeed) ? '(' + stripEnd(f.tubeFeed) + ')' : ''));
    var t = arr(f.teeth);
    if (t.indexOf('正常') >= 0) parts.push('牙口狀況良好');
    if (t.indexOf('缺牙') >= 0) parts.push('有缺牙');
    if (t.indexOf('假牙') >= 0) parts.push('有配戴' + (arr(f.denture).length ? joinAnd(arr(f.denture)) : '假牙'));
    var meal = [];
    if (nz(f.mealsDay)) meal.push('一天' + nz(f.mealsDay) + '餐');
    if (nz(f.portion)) meal.push('每餐約' + nz(f.portion) + '碗分量');
    if (meal.length) parts.push(meal.join('，'));
    var tx = arr(f.texture).map(function (x) { return { '一般': '一般飲食', '軟質': '軟食', '細碎': '細碎飲食', '流質': '流質飲食' }[x] || x; });
    if (tx.length) parts.push('食物質地以' + joinAnd(tx) + '為主');
    if (f.choke === '無') parts.push('無嗆咳情形');
    if (f.choke === '偶爾') parts.push((arr(f.chokeWhen).length ? arr(f.chokeWhen).join('或') + '時' : '') + '偶有嗆咳情形');
    if (f.choke === '頻繁') parts.push((arr(f.chokeWhen).length ? arr(f.chokeWhen).join('或') + '時' : '') + '經常有嗆咳情形');
    if (f.appetite === '良好') parts.push('食慾良好');
    if (f.appetite === '普通') parts.push('食慾普通');
    if (f.appetite === '較差') parts.push('近期食慾較差');
    var b = bmiOf(f);
    if (has(f, 'wtUnknown', '未測量')) parts.push('體重未測量');
    else if (b) parts.push('身高' + nz(f.height) + '公分、體重' + nz(f.weight) + '公斤，BMI' + b);
    else if (nz(f.weight)) parts.push('體重' + nz(f.weight) + '公斤');
    if (f.wtChange === '穩定') parts.push('近期體重穩定');
    if (f.wtChange === '增加' || f.wtChange === '減少') parts.push('近' + (nz(f.wtMonths) || '○') + '個月體重' + f.wtChange + (nz(f.wtKg) || '○') + '公斤');
    if (f.nutrition) parts.push('營養狀況' + f.nutrition);
    if (nz(f.eatNote)) parts.push(f.eatNote);
    return parts.length ? '個案' + sent(parts) : '';
  }
  function phys(f) { return [physP1(f), physP2(f), physP3(f), physIADL(f), physP5(f)].filter(Boolean); }

  /* ---------- 貳-2 心理 ---------- */
  function psych(f) {
    var parts = [];
    var md = arr(f.mood).map(function (x) { return { '平穩/配合': '情緒平穩', '開朗': '情緒開朗', '淡漠': '情緒較淡漠', '憂鬱/低落': '情緒較低落', '焦慮/易怒': '情緒較焦慮易怒' }[x] || x; });
    md.forEach(function (x) { parts.push(x); });
    var spl = arr(f.spirit);
    if (spl.indexOf('佳') >= 0) parts.push('精神狀況良好');
    var spb = spl.filter(function (x) { return x === '疲倦' || x === '嗜睡'; }).map(function (x) { return x === '疲倦' ? '較疲倦' : '嗜睡'; });
    if (spb.length) parts.push('精神' + spb.join('、'));
    var bp = arr(f.bpsd);
    if (bp.indexOf('無') >= 0) parts.push('目前無日夜顛倒或抗拒照顧等情形');
    else if (bp.length) parts.push('有' + joinAnd(bp) + '等情形');
    var fr = { '融洽緊密': '與家人互動融洽', '普通': '與家人互動普通', '疏離/有衝突': '與家人關係較疏離' }[f.familyRel]; if (fr) parts.push(fr);
    var sv = { '樂觀': '對自身體況態度樂觀', '接受現況': '可接受目前體況', '無奈/失落': '對自身體況感到無奈失落', '否認退化': '較無法接受身體退化' }[f.selfView]; if (sv) parts.push(sv);
    if (f.motive === '高') parts.push('接受服務及復能動機高');
    if (f.motive === '普通') parts.push('接受服務動機普通');
    if (f.motive === '抗拒') parts.push('對服務較為抗拒' + (nz(f.motiveWhy) ? '(' + stripEnd(f.motiveWhy) + ')' : ''));
    if (nz(f.psyNote)) parts.push(f.psyNote);
    return parts.length ? '訪視當日個案' + sent(parts) : '';
  }

  /* ---------- 貳-3 家庭 ---------- */
  function memberLine(m, f) {
    var head = (m.co === '同住' ? '同住' : '') + nz(m.rel) + (nz(m.name) ? '(' + nz(m.name) + ')' : '') + nz(m.marital);
    if (m.co !== '同住' && nz(m.place)) head += '住' + nz(m.place);
    var parts = [head];
    var roles = arr(m.roles), main = roles.filter(function (r) { return r !== '同為長照服務使用對象'; });
    if (main.length) {
      var rw = main.map(function (r, i) { return i > 0 ? r.replace(/^主要/, '') : r; });
      parts.push('為個案' + joinAnd(rw));
    }
    if (nz(m.age) && roles.indexOf('主要照顧者') >= 0) parts.push(nz(m.age) + '歲');
    var wk = { '正職工作': '平時有正職工作', '兼職': '有兼職工作', '退休': '已退休', '家管': '為家管', '無業': '目前無業', '就學': '仍在就學中' }[m.work]; if (wk) parts.push(wk);
    if (nz(m.health)) parts.push('本身' + stripEnd(m.health));
    if (roles.indexOf('同為長照服務使用對象') >= 0) parts.push('同為長照服務使用對象');
    if (m.co !== '同住') {
      var vs = { '每天探視': '每天會到案家探視', '經常探視': '經常返家探視', '偶爾探視': '偶爾返家探視', '休假探視': '休假有空會返家探視', '不定期探視': '不定期返家探視', '多以電話聯繫': '平時多以電話聯繫', '幾乎無聯繫': '幾乎無聯繫' }[m.visit]; if (vs) parts.push(vs);
    }
    if (nz(m.note)) parts.push(m.note);
    if (roles.indexOf('主要照顧者') >= 0 && f.burden) {
      parts.push({ '低': '主訴可承受照顧負荷', '中': '主訴照顧負荷中等', '高': '主訴照顧負荷較大' }[f.burden]);
    }
    return sent(parts);
  }
  function family(f) {
    var head = [];
    if (f.marital) {
      var s = nz(f.sons), d = nz(f.daughters), kid = '';
      var ord = nz(f.childOrder), girlFirst = /^女/.test(ord);
      var ks = +s > 0 ? s + '子' : '', kd = +d > 0 ? d + '女' : '';
      if (ks || kd) kid = '育有' + (girlFirst ? kd + ks : ks + kd) + (ord ? '(' + ord + ')' : '');
      else if (f.marital !== '未婚' && (s !== '' || d !== '')) kid = '無子女';
      if (f.marital === '已婚' || f.marital === '離婚' || f.marital === '已婚分居') head.push('個案' + f.marital + kid);
      else { head.push('個案' + f.marital); if (kid) head.push(kid); }
    }
    if (f.living === '獨居') head.push('個案獨居');
    if (f.living === '與家人同住') head.push('個案現與' + (stripEnd(f.livingWith) || '家人') + '同住');
    if (f.foreign === '有') head.push('聘有外籍看護工協助照顧' + (nz(f.foreignNote) ? '(' + stripEnd(f.foreignNote) + ')' : ''));
    var lines = [sent(head)];
    var hasCaregiver = false;
    arr(f.members).forEach(function (m, i) {
      if (!nz(m.rel) && !nz(m.note)) return;
      if (arr(m.roles).indexOf('主要照顧者') >= 0) hasCaregiver = true;
      lines.push('(' + (lines.length) + ') ' + memberLine(m, f));
    });
    var tail = [];
    var inc = arr(f.income);
    if (inc.length || nz(f.incomeNote)) tail.push((inc.length ? '經濟來源為' + joinAnd(inc) : '') + (nz(f.incomeNote) ? (inc.length ? '，' : '') + stripEnd(f.incomeNote) : ''));
    if (nz(f.careShare)) tail.push(f.careShare);
    var hb = arr(f.highBurden);
    if (hb.length) tail.push('照顧者有' + joinAnd(hb) + '等高負荷情形');
    if (f.burden && !hasCaregiver) tail.push({ '低': '主要照顧者主訴可承受照顧負荷', '中': '主要照顧者照顧負荷中等', '高': '主要照顧者照顧負荷較大' }[f.burden]);
    if (has(f, 'burdenRef', '需轉介家照據點')) tail.push('需轉介家庭照顧者支持據點');
    if (has(f, 'burdenRef', '需申請G碼喘息')) tail.push('需申請喘息服務');
    if (f.fcWill === '有意願') tail.push('有意願使用家庭照顧者服務');
    if (f.fcWill === '婉拒') tail.push('暫無意願使用家庭照顧者服務');
    var cm = vals(f, 'community');
    if (cm.length) tail.push('平時有' + joinAnd(cm) + '等社區支持資源');
    if (nz(f.famNote)) tail.push(f.famNote);
    if (f.support) tail.push('家庭支持度' + f.support);
    if (tail.length) lines.push(sent(tail));
    return lines.filter(Boolean);
  }

  /* ---------- 貳-4 居家環境 ---------- */
  function home(f) {
    var parts = [];
    var b = f.building, bs = '';
    if (b === '透天') bs = '透天厝' + (nz(f.floorsTotal) ? '(共' + nz(f.floorsTotal) + '層)' : '');
    else if (b) bs = b + (nz(f.floor) ? nz(f.floor) + '樓' : '');
    var ten = { '自有': '自有', '租賃': '租賃', '借住': '借住', '貸款': '自有(貸款中)' }[f.tenure] || '';
    if (ten || bs) parts.push('案家為' + ten + bs);
    if (b === '透天' && nz(f.floorMain)) parts.push('主要活動空間在' + nz(f.floorMain) + '樓');
    if (f.tenure === '借住' && nz(f.tenureOwner)) parts.push('房屋所有人為' + nz(f.tenureOwner));
    if (f.tenure === '租賃' && nz(f.rent)) parts.push('每月租金約' + nz(f.rent) + '元');
    if (f.tenure === '租賃' && nz(f.utilNote)) parts.push(f.utilNote);
    if (f.tenure === '貸款' && nz(f.loan)) parts.push('每月貸款約' + nz(f.loan) + '元');
    if (f.outside === '平坦無障礙') parts.push('外出動線平坦無障礙');
    if (f.outside === '社區/大門有階梯') {
      var o = '社區或大門口有階梯' + (nz(f.steps) ? '約' + nz(f.steps) + '階' : '');
      parts.push(o);
      if (f.stepPass === '可攙扶上下') parts.push('個案可在攙扶下上下');
      if (f.stepPass === '無法通行') parts.push('個案無法自行通行');
      if (has(f, 'needClimber', '需評估爬梯機')) parts.push('需評估爬梯機');
    }
    if (f.entry === '寬敞無阻礙') parts.push('家中環境寬敞無雜物堆放');
    if (f.entry === '狹窄/堆放雜物') parts.push('家中動線較狹窄且有雜物堆放');
    if (f.threshold === '無高低差') parts.push('主要活動空間無高低差');
    if (f.threshold === '有門檻') parts.push('主要活動空間有門檻' + (nz(f.thresholdCm) ? '約' + nz(f.thresholdCm) + '公分' : '') + (f.thresholdPass ? '，使用輔具' + f.thresholdPass + '通行' : ''));
    if (f.light === '足') parts.push('採光照明充足');
    if (f.light === '暗') parts.push('採光照明較昏暗');
    var bed = arr(f.bed);
    if (bed.length) parts.push('個案臥室使用' + joinAnd(bed));
    if (f.bedRail === '有') parts.push('有床邊扶手');
    if (f.bedRail === '無') parts.push('無床邊扶手');
    if (f.bedFlow === '順暢') parts.push('臥室動線順暢');
    if (f.bedFlow === '狹小') parts.push('臥室動線較狹小');
    var be = arr(f.bathEnv), bp = [];
    if (be.indexOf('乾濕分離') >= 0) bp.push('為乾濕分離');
    if (be.indexOf('無乾濕分離') >= 0) bp.push('無乾濕分離');
    if (be.indexOf('有浴缸') >= 0) bp.push('內有浴缸');
    if (be.indexOf('有門檻') >= 0) bp.push('有門檻');
    var eq = ['有扶手', '有防滑墊'].filter(function (x) { return be.indexOf(x) >= 0; }).map(function (x) { return x.slice(1); });
    if (eq.length) bp.push('設有' + joinAnd(eq));
    if (be.indexOf('無扶手/地面濕滑易跌') >= 0) bp.push('無扶手且地面濕滑易跌');
    if (bp.length) parts.push('衛浴' + bp.join('，'));
    var ah = vals(f, 'aidsHave');
    if (ah.length) parts.push('現家中備有' + joinAnd(ah));
    if (nz(f.homeNote)) parts.push(f.homeNote);
    if (f.aidsNeed === '無') parts.push('暫無輔具及無障礙環境改善需求');
    if (f.aidsNeed === '有') parts.push('討論後有' + (stripEnd(f.aidsNeedNote) || '輔具及無障礙環境改善') + '需求');
    return sent(parts);
  }

  /* ---------- 貳-5 生活作息 ---------- */
  function routine(f) {
    var parts = [];
    if (f.regular === '規律') parts.push('個案作息規律');
    if (f.regular === '不規律') parts.push('個案無規律作息');
    var tm = [];
    if (nz(f.tWake)) tm.push('約' + nz(f.tWake) + '點起床');
    if (nz(f.tBreakfast)) tm.push(nz(f.tBreakfast) + '點早餐');
    if (nz(f.tLunch)) tm.push(nz(f.tLunch) + '點午餐');
    if (nz(f.tNap)) tm.push(nz(f.tNap) + '點午休');
    if (nz(f.tDinner)) tm.push(nz(f.tDinner) + '點晚餐');
    if (nz(f.tSleep)) tm.push(nz(f.tSleep) + '點就寢');
    if (tm.length) parts.push('通常' + tm.join('、'));
    var sl = { '佳': '夜眠狀況佳', '尚可': '夜眠狀況尚可', '不佳': '夜眠狀況不佳', '日夜顛倒': '有日夜顛倒情形' }[f.sleep]; if (sl) parts.push(sl);
    if (nz(f.sleepNote)) parts.push(f.sleepNote);
    var dt = vals(f, 'daytime').map(function (x) { return x === '坐輪椅/椅子上' ? '坐在輪椅或椅子上' : x; });
    if (dt.length) parts.push('平時白天多' + dt.join('、'));
    if (nz(f.interests)) parts.push(f.interests);
    if (nz(f.special)) parts.push(f.special);
    if (nz(f.advice)) parts.push(f.advice);
    var s = sent(parts);
    if (s && !/^個案/.test(s)) s = '個案' + s;
    return s;
  }

  /* ---------- 服務行（肆、服務規劃） ---------- */
  function lineN(l) { return l.mode === 'week' ? (+l.n || 0) : l.mode === 'days' ? arr(l.days).length : l.mode === 'daily' ? 7 : 0; }
  function unitsAuto(l, st) {
    var each = parseFloat(l.each) || 1, n = lineN(l);
    if (l.mode === 'spare') return 1;
    if (!n) return '';
    var fac = (st.weekFactor || {})[n]; if (!fac) return '';
    return Math.round(fac * each * 100) / 100;
  }
  function unitsOf(l, st) { return (l.unitsManual && nz(l.units) !== '') ? nz(l.units) : unitsAuto(l, st); }
  function daysStr(days) {
    var d = arr(days).map(Number).sort(function (a, b) { return a - b; });
    if (d.length >= 3 && d[d.length - 1] - d[0] === d.length - 1) return DAYN[d[0]] + '至' + DAYN[d[d.length - 1]];
    return d.map(function (x) { return DAYN[x]; }).join('');
  }
  function freqText(l) {
    var each = nz(l.each) || '1';
    if (l.mode === 'week' && +l.n) return (+l.n === 7 ? '每日' : '每週' + CNT[+l.n] + '天') + '各' + each + '單位';
    if (l.mode === 'days' && arr(l.days).length) return '每週' + daysStr(l.days) + '各' + each + '單位';
    if (l.mode === 'daily') return '每日各' + each + '單位';
    return '';
  }
  function careLineText(l, st) {
    var u = unitsOf(l, st), paren = [freqText(l), stripEnd(l.note)].filter(Boolean).join('，');
    return nz(l.code) + nz(l.name) + ':' + (u === '' ? '○' : u) + '單位/月' + (paren ? '(' + paren + ')' : '');
  }
  function proLineText(l) {
    var det = [stripEnd(l.note)];
    if (nz(l.period)) det.push('復能期程:' + nz(l.period));
    if (nz(l.goal)) det.push('復能目標:' + stripEnd(l.goal) + '。');
    det = det.filter(Boolean);
    return nz(l.code) + nz(l.name) + (nz(l.unitsText) ? ':' + nz(l.unitsText) : '') + (det.length ? '(' + det.join('，') + ')' : '');
  }
  function aidLineText(l) { return nz(l.code) + nz(l.name) + (nz(l.note) ? '(' + stripEnd(l.note) + ')' : ''); }
  function yearLineText(l) { return nz(l.code) + nz(l.name) + ':' + (nz(l.units) || '○') + '單位/年' + (nz(l.note) ? '(' + stripEnd(l.note) + ')' : ''); }

  function planLines(f, key) { return arr(f[key]).filter(function (l) { return nz(l.code) || nz(l.name); }); }
  function careFlagText(f, hasCare) {
    var fl = arr(f.careFlags), out = [];
    if (fl.indexOf('聘有外籍看護') >= 0) out.push(hasCare ? '個案聘有外籍看護。' : '個案聘有外籍看護，無日照及到宅沐浴車服務需求。');
    if (fl.indexOf('超額服務需求') >= 0) out.push('個案有超額服務需求，若有留用額度可與個管確認並優先使用，若無留用額度，可與案家討論自費使用。');
    if (fl.indexOf('例假日服務需求') >= 0) out.push('個案有例假日服務需求。');
    if (fl.indexOf('晚間服務需求') >= 0) out.push('個案有晚間服務需求。');
    if (nz(f.careFlagNote)) out.push(stripEnd(f.careFlagNote) + '。');
    return out.join('');
  }
  function careBlock(f, st) {
    var care = planLines(f, 'pCare'), flag = careFlagText(f, care.length > 0), out = [];
    out.push('【照顧服務】' + (care.length ? flag : ''));
    if (care.length) care.forEach(function (l) { out.push(careLineText(l, st)); });
    else out.push(flag || '暫無需求。');
    return out;
  }
  function plan(f, st) {
    var out = [];
    out.push('於' + visitPhrase(f) + '，與' + (participants(f) || '個案') + '討論照顧計畫，照顧計畫如下：');
    out.push('照顧計畫');
    out.push('1.照顧及專業服務');
    careBlock(f, st).forEach(function (x) { out.push(x); });
    out.push('【專業服務】');
    var pro = planLines(f, 'pPro');
    if (pro.length) pro.forEach(function (l) { out.push(proLineText(l)); }); else out.push('暫無需求。');
    out.push('2.交通接送服務');
    if (f.pTrans === '使用') {
      var v = vals(f, 'pVendors');
      out.push('DA01交通接送:' + (nz(f.pTransAmt) || st.transAmount) + '元/月' + (v.length ? '(' + v.join('、') + ')' : '') + '。');
    } else out.push('暫無需求。');
    out.push('3.輔具及居家無障礙環境改善服務:');
    var aids = planLines(f, 'pAids');
    if (aids.length) aids.forEach(function (l) { out.push(aidLineText(l)); }); else out.push('暫無需求。');
    var res = planLines(f, 'pRespite');
    out.push('4.喘息服務' + (res.length && nz(f.pRespitePeriod) ? '(喘息額度區間' + nz(f.pRespitePeriod) + ')' : ''));
    if (res.length) res.forEach(function (l) { out.push(yearLineText(l)); }); else out.push('暫無需求。');
    var no = 5, sh = planLines(f, 'pShort');
    if (sh.length) {
      out.push((no++) + '.短照服務' + (nz(f.pShortPeriod) ? '(短照額度區間' + nz(f.pShortPeriod) + ')' : ''));
      sh.forEach(function (l) { out.push(yearLineText(l)); });
    }
    var oth = planLines(f, 'pOther');
    if (oth.length) { out.push((no++) + '.其他'); oth.forEach(function (l) { out.push(careLineText(l, st)); }); }
    if (nz(f.planNote)) out.push(nz(f.planNote));
    out.push('個管員：' + nz(f.cmName));
    return out.join('\n');
  }

  /* ---------- 服務摘要（供貳-6與目標使用） ---------- */
  var BA_WORD = { BA01: '身體清潔', BA02: '基本日常照顧', BA03: '測量生命徵象', BA04: '餵食', BA05: '備餐', BA07: '沐浴洗頭', BA08: '足部照護', BA09: '到宅沐浴',
    BA10: '翻身拍背', BA11: '肢體關節活動', BA12: '上下樓梯', BA13: '陪同外出', BA14: '陪同就醫', BA15: '家務清潔', BA16: '代購物品', BA17: '醫療輔助照護',
    BA18: '安全看視', BA20: '陪伴', BA22: '巡視', BA23: '洗頭', BA24: '如廁排泄' };
  function baKey(code) { var m = /^BA(\d\d)/.exec(nz(code)); return m ? 'BA' + m[1] : ''; }
  function freqWord(n) { return n >= 7 ? '每天' : n > 0 ? '每週' + CNT[n] + '天' : ''; }
  function summary(f) {
    var care = planLines(f, 'pCare'), S = { home: null, day: null, foster: null };
    care.forEach(function (l) {
      var c = nz(l.code), n = lineN(l), grp = /^BA/.test(c) ? 'home' : /^BB/.test(c) ? 'day' : /^BC/.test(c) ? 'foster' : (/^BD/.test(c) ? 'bd' : 'home');
      if (grp === 'bd') return;
      if (!S[grp]) S[grp] = { n: 0, keys: [], spare: [] };
      if (n > S[grp].n) S[grp].n = n;
      var k = baKey(c);
      if (k) { if (l.mode === 'spare' || !n) { if (S[grp].spare.indexOf(k) < 0) S[grp].spare.push(k); } else if (S[grp].keys.indexOf(k) < 0) S[grp].keys.push(k); }
    });
    var pro = planLines(f, 'pPro'), aids = planLines(f, 'pAids'), res = planLines(f, 'pRespite'), sh = planLines(f, 'pShort'), oth = planLines(f, 'pOther');
    return {
      home: S.home, day: S.day, foster: S.foster,
      pro: pro, rehab: pro.filter(function (l) { return /^C[AB]/.test(nz(l.code)); }),
      env: pro.some(function (l) { return /^CC/.test(nz(l.code)); }),
      trans: f.pTrans === '使用', aids: aids, respite: res, short: sh, other: oth,
      foreign: f.foreign === '有' || has(f, 'careFlags', '聘有外籍看護'),
      any: !!(care.length || pro.length || aids.length || res.length || sh.length || oth.length || f.pTrans === '使用')
    };
  }
  function defaultDiscuss(f) {
    var rels = arr(f.attendees).map(function (a) { return nz(a.rel); }).filter(Boolean);
    return rels.length ? joinAnd(rels) : '個案';
  }
  function svc(f) {
    var S = summary(f), out = [];
    if (f.svcStatus === '使用服務中個案') {
      var cur = [];
      if (has(f, 'curCare', '居家服務')) cur.push('居家服務' + (nz(f.curHome) ? '(' + stripEnd(f.curHome) + ')' : ''));
      if (has(f, 'curCare', '日照')) cur.push((nz(f.curDayN) ? '每週' + nz(f.curDayN) + '天' : '') + (f.curDayType || '') + '日照服務' + (arr(f.curDayExtra).length ? '(含' + joinAnd(arr(f.curDayExtra)) + ')' : ''));
      if (has(f, 'curCare', '家庭托顧')) cur.push((nz(f.curFosN) ? '每週' + nz(f.curFosN) + '天' : '') + (f.curFosType || '') + '家庭托顧服務' + (arr(f.curFosExtra).length ? '(含' + joinAnd(arr(f.curFosExtra)) + ')' : ''));
      if (f.curPro === '使用服務中') cur.push('專業服務' + (nz(f.curProNote) ? '(' + stripEnd(f.curProNote) + ')' : ''));
      if (f.curTrans === '回診時使用') cur.push('交通接送服務(回診時使用)');
      if (f.curAids === '使用中') cur.push('輔具及無障礙環境改善服務' + (nz(f.curAidsNote) ? '(' + stripEnd(f.curAidsNote) + ')' : ''));
      if (f.curRespite === '照顧者休息時預約使用') cur.push('喘息服務(照顧者休息時預約使用)');
      vals(f, 'curOther').forEach(function (x) { if (x !== '暫未使用') cur.push(x); });
      var ev = [];
      if (f.evFit === '是') ev.push('案家表示服務內容符合目前期待');
      if (f.evFit === '否') ev.push('案家表示服務內容未符合期待' + (nz(f.evFitWhy) ? '(' + stripEnd(f.evFitWhy) + ')' : ''));
      if (f.evAtt === '是') ev.push('照顧服務人員服務態度良好');
      if (f.evAtt === '否') ev.push('對照顧服務人員服務態度有意見' + (nz(f.evAttWhy) ? '(' + stripEnd(f.evAttWhy) + ')' : ''));
      if (f.evRelief === '是') ev.push('有減輕照顧負荷');
      if (f.evRelief === '否') ev.push('照顧負荷未減輕' + (nz(f.evReliefWhy) ? '(' + stripEnd(f.evReliefWhy) + ')' : ''));
      if (nz(f.evOther)) ev.push(f.evOther);
      out.push(sent([cur.length ? '個案目前使用' + cur.join('、') : '個案目前暫未使用服務'].concat(ev)));
    }
    var w = [], main = [];
    if (S.day) main.push(freqWord(S.day.n) + '日照服務');
    if (S.foster) main.push(freqWord(S.foster.n) + '家庭托顧服務');
    if (S.home && (S.home.keys.length || S.home.n)) main.push(freqWord(S.home.n) + '居家服務');
    var lead = f.svcStatus === '使用服務中個案' ? '後續期望使用' : '期望使用';
    if (main.length) w.push(lead + main.join('及'));
    if (S.home && S.home.keys.length) {
      var words = S.home.keys.map(function (k) { return BA_WORD[k]; }).filter(Boolean);
      if (words.length) w.push((main.length > 1 ? '居家服務' : '') + '協助個案' + joinAnd(words));
    }
    if (S.home && S.home.spare.indexOf('BA14') >= 0 && !S.trans) w.push('另有陪同就醫需求');
    if (S.trans) w.push('另個案有就醫安排，' + (S.home && S.home.spare.indexOf('BA14') >= 0 ? '有陪同就醫及交通車服務需求' : '需使用交通車'));
    if (S.rehab.length) w.push('有復能等專業服務需求');
    if (S.aids.length || S.env) w.push('有輔具及無障礙環境改善需求');
    if (S.respite.length || S.short.length) w.push(S.foreign ? '外看休假時有' + (S.short.length ? '喘息及短照' : '喘息') + '服務需求' : '照顧者需要休息時有喘息服務需求');
    if (S.other.length) w.push('並使用' + joinAnd(S.other.map(function (l) { return nz(l.name); })));
    var none = [];
    if (!S.home && !S.foreign) none.push('居家服務');
    if (!S.day && !S.foreign) none.push('日照服務');
    if (!S.pro.length) none.push('專業服務');
    if (!S.trans) none.push('交通接送');
    if (!S.aids.length && !S.env) none.push('輔具及無障礙環境改善');
    if (!S.respite.length && !S.short.length) none.push('喘息服務');
    var dw = stripEnd(f.discussWith) || defaultDiscuss(f);
    if (S.any || nz(f.svcReason)) {
      out.push(sent(['與' + dw + '討論後', f.svcReason].concat(w)));
      if (S.any && none.length && none.length < 6) out.push('暫無' + joinAnd(none) + '需求。');
    }
    if (nz(f.svcNote)) out.push(sent([f.svcNote]));
    if (isReview(f) && nz(f.rvPlan)) out.push(sent([f.rvPlan]));
    return out.filter(Boolean).join('');
  }

  /* ---------- 參：照顧問題 ---------- */
  function suggestCause(f) {
    if (f.gait === '臥床') return '長期臥床';
    if (has(f, 'vision', '失明') || has(f, 'vision', '視力模糊')) return '視力影響';
    if (f.cognition === '失智' || has(f, 'dx', '失智症')) return '失智症影響';
    if (has(f, 'limbs', '肌力退化')) { var wp = arr(f.weakPart); return wp.length === 1 ? wp[0] + '無力' : '四肢無力'; }
    if (has(f, 'limbs', '偏癱')) return '肢體偏癱';
    if (f.gait === '輪椅代步' || f.gait === '不穩需攙扶') return '下肢無力';
    return '';
  }
  function problemDefault(no, f) {
    var c = nz(f.probCause) || suggestCause(f) || '體況影響';
    var P = '個案' + c + '，';
    var T = {
      1: P + '無法自行進食，需他人協助餵食。',
      2: P + '無法自行清潔背部及下肢，清潔度受限，需他人協助。',
      3: P + '盥洗修容需他人協助。',
      4: P + '穿脫衣物需他人協助。',
      5: '個案有大小便失禁或不及如廁情形，需他人協助清潔更換。',
      6: P + '如廁需他人協助。',
      7: P + '轉移位需他人協助。',
      8: P + '行走步態不穩，需有人一旁看視。',
      9: P + '無法自行上下樓梯。',
      10: P + '無法自行使用電話。',
      11: P + '無法自行外出，有固定就醫安排。',
      12: '個案無法自行備餐，多外出購買餐食。',
      13: P + '無法久走久站，無法自行處理家務。',
      14: '個案無法自行規律服藥，需他人提醒或協助。',
      15: P + '財務需他人協助處理。',
      16: P + '溝通表達受限。',
      17: '個案記憶力不佳，經常忘東忘西。',
      18: '個案長期受疼痛問題困擾，影響日常活動。',
      19: '個案活動量少，有肌力退化及關節攣縮風險。',
      20: '個案皮膚狀況需他人協助照護。',
      21: '個案有傷口，需定期換藥照護。',
      22: '個案食慾較差，營養攝取不足。',
      23: '個案進食有嗆咳情形，有吞嚥困難。',
      24: '個案留有管路，需他人協助照護。',
      26: P + '有跌倒紀錄，為跌倒高風險個案。',
      27: P + '需有人看視安全。',
      28: P + '有步態不穩情形，家中環境阻礙。',
      29: '個案平時多在家中，缺乏社會參與及休閒活動。',
      30: '個案有失智症，平時無規律作息。',
      31: '主要照顧者照顧負荷較大，需喘息服務支持。',
      32: '個案有輔具使用需求，需評估合適輔具。'
    };
    return T[no] || '';
  }
  /* 依評估內容提示可能相關的問題（僅提示，不自動勾選） */
  function suggestProblems(f) {
    var s = {};
    if (f.eat === '需協助餵食' || f.eat === '鼻胃管灌食') s[1] = 1;
    if (f.bath === '需部份協助' || f.bath === '完全需他人協助' || f.bathClean === '欠佳') s[2] = 1;
    if (f.groom === '需部份協助' || f.groom === '需完全協助') s[3] = 1;
    if (f.dress === '需部份協助' || f.dress === '完全需他人協助') s[4] = 1;
    if (has(f, 'urine', '失禁') || has(f, 'urine', '偶有滲尿或不及如廁') || has(f, 'urine', '尿布')) s[5] = 1;
    if (has(f, 'toilet', '需他人協助如廁') || has(f, 'toilet', '使用便盆椅') || has(f, 'toilet', '臥床使用尿布')) s[6] = 1;
    if (f.transfer === '需人協助' || f.transfer === '需人推輪椅' || f.rise === '需協助') s[7] = 1;
    if (f.gait === '不穩需攙扶' || f.gait === '輪椅代步' || f.gait === '臥床') s[8] = 1;
    if (f.stairs === '需攙扶' || f.stairs === '無法上下樓') s[9] = 1;
    if (f.phoneUse === '部分協助' || f.phoneUse === '完全依賴' || f.phoneUse === '可接聽') s[10] = 1;
    if (f.outdoor === '需有人陪同' || f.outdoor === '無法外出' || f.shopping === '部分協助' || f.shopping === '完全依賴') s[11] = 1;
    if (has(f, 'mealBy', '外食/自行購買') || has(f, 'mealBy', '送餐服務')) s[12] = 1;
    if (f.housework === '部分協助' || f.housework === '完全依賴') s[13] = 1;
    if (has(f, 'med', '需他人提醒督促') || has(f, 'med', '他人拿藥給個案服用') || f.medRegular === '不規律' || f.medRegular === '偶爾忘記') s[14] = 1;
    if (f.finance === '部分協助' || f.finance === '完全依賴') s[15] = 1;
    if (f.comm === '點頭搖頭' || f.comm === '無口語/無法回覆' || f.comm === '簡短回覆') s[16] = 1;
    if (f.cognition === '失智' || f.cognition === '輕微退化') s[17] = 1;
    if (f.painHas === '有') s[18] = 1;
    if (f.gait === '臥床') s[19] = 1;
    if (has(f, 'skin', '乾燥')) s[20] = 1;
    if (has(f, 'skin', '壓傷/傷口') || has(f, 'tubes', '傷口換藥')) s[21] = 1;
    if (f.appetite === '較差' || f.wtChange === '減少' || f.nutrition === '不佳') s[22] = 1;
    if (f.choke === '偶爾' || f.choke === '頻繁') s[23] = 1;
    if (arr(f.tubes).some(function (x) { return ['鼻胃管', '鼻腸管', '尿管', '氣切管', '腸造口', '膀胱造口'].indexOf(x) >= 0; })) s[24] = 1;
    if (f.fallHas === '有') s[26] = 1;
    if (f.living === '獨居' || f.lostHas === '有' || f.fallHas === '有') s[27] = 1;
    if (f.threshold === '有門檻' || f.entry === '狹窄/堆放雜物' || has(f, 'bathEnv', '無扶手/地面濕滑易跌') || f.aidsNeed === '有') s[28] = 1;
    var bp = arr(f.bpsd).filter(function (x) { return x !== '無'; });
    if (bp.length) s[30] = 1;
    if (f.burden === '高' || arr(f.highBurden).length) s[31] = 1;
    if (f.aidsNeed === '有') s[32] = 1;
    return s;
  }
  function problems(f) {
    return arr(f.problems).map(function (p, i) {
      var d = stripEnd(p.desc);
      return (i + 1) + '、' + nz(p.name) + '：' + (d ? d + '。' : '');
    });
  }

  /* ---------- 肆：目標（三種寫法，可切換） ---------- */
  function goalsAuto(f) {
    var S = summary(f), v = (+f.goalVar || 0) % 3;
    if (!S.any) return { short: '', mid: '', long: '' };
    function pick(a) { return a[v % a.length]; }
    var k = S.home ? S.home.keys : [], pn = arr(f.problems).map(function (p) { return p.no; });
    function hk(x) { return k.indexOf(x) >= 0; }
    var fallRisk = pn.indexOf(26) >= 0 || pn.indexOf(27) >= 0 || pn.indexOf(8) >= 0 || f.fallHas === '有';
    var care = S.foreign || arr(f.members).some(function (m) { return arr(m.roles).indexOf('主要照顧者') >= 0; });
    var sh = [], names = [], midEff = [], lgEff = [];
    if (S.home && (k.length || S.home.n)) {
      var fq = freqWord(S.home.n), pur = [];
      if (hk('BA01') || hk('BA07') || hk('BA23')) pur.push(pick(['維持個案身體清潔', '協助個案沐浴清潔，維持個人衛生', '確保個案身體清潔與舒適']));
      if (hk('BA02') || hk('BA24')) pur.push(pick(['協助個案如廁及日常照顧', '協助日常起居與如廁需求', '維持個案日常基本照顧']));
      if (hk('BA05') || hk('BA04')) pur.push(pick(['維護用餐營養與飲食衛生', '協助備餐，確保個案規律進食', '確保個案每日餐食與營養攝取']));
      if (hk('BA15')) pur.push(pick(['維護居家環境清潔與安全', '協助居家環境整理，降低環境風險', '維持居住空間整潔安全']));
      if (hk('BA13')) pur.push(pick(['陪同外出活動並看視防跌', '陪同個案外出散步，維持活動量', '陪同外出並留意行走安全']));
      if (hk('BA20')) pur.push(pick(['陪伴並督促個案活動', '陪伴個案並給予情緒支持', '陪伴關懷並鼓勵個案起身活動']));
      if (hk('BA18') || hk('BA22')) pur.push(pick(['確認個案居家安全', '定時看視個案狀況', '留意個案居家安全']));
      sh.push(pick([
        '提供' + fq + '居家服務' + (pur.length ? '，' + pur.join('，') : ''),
        '安排' + fq + '居家服務到宅' + (pur.length ? '，' + pur.join('，並') : ''),
        '個案開始使用' + fq + '居家服務' + (pur.length ? '，由居服員' + pur.join('、') : '')]));
      names.push('居家服務');
      if (hk('BA01') || hk('BA07') || hk('BA23')) midEff.push(pick(['個案個人衛生維持良好', '個案身體清潔狀況改善', '個案清潔度維持穩定']));
      if (hk('BA05') || hk('BA04')) midEff.push(pick(['每日餐食獲得適當安排', '個案飲食規律、營養攝取穩定', '個案三餐正常進食']));
      if (hk('BA15')) midEff.push(pick(['居住環境安全無虞', '居家環境維持整潔', '居家環境無安全疑慮']));
      if (hk('BA13')) midEff.push(pick(['在看視防跌下穩定外出活動', '個案規律外出活動、下肢肌力無退化', '個案外出活動頻率增加']));
      if (hk('BA20')) midEff.push(pick(['個案情緒穩定並維持活動量', '個案獲得穩定的陪伴與情緒支持', '個案情緒平穩']));
      lgEff.push(pick(['個案日常生活照顧需求獲得滿足', '個案生活功能維持穩定', '個案可持續安心居家生活']));
    }
    if (S.day || S.foster) {
      var nm = S.day ? '日照服務' : '家庭托顧服務', act = S.day ? '日照' : '家托', dq = freqWord((S.day || S.foster).n);
      sh.push(pick(['提供' + dq + nm + '，確保個案生活作息規律及日間安全', '安排個案' + dq + '至' + act + '參與活動，建立規律作息', '個案開始使用' + dq + nm + '，增加日間活動與人際互動']));
      names.push(nm);
      midEff.push(pick(['個案規律參與' + act + '活動以穩定作息', '個案適應' + act + '環境並穩定出席', '個案作息趨於規律']));
      lgEff.push(pick(['個案作息保持規律，精神與日常生活功能維持穩定', '個案維持社會參與，延緩功能退化', '個案生活作息與認知功能維持穩定']));
    }
    if (S.rehab.length) {
      var g = stripEnd((S.rehab[0] || {}).goal);
      sh.push(pick(['提供復能服務，透過專業人員訓練' + (g ? '使' + g : '個案日常生活功能'), '連結專業人員到宅指導復能訓練' + (g ? '，目標為' + g : ''), '個案開始接受復能訓練' + (g ? '，朝' + g + '努力' : '')]));
      names.push('復能服務');
      midEff.push(pick(['藉由復能訓練提升個案功能', '個案依訓練計畫規律練習、功能有進步', '復能目標逐步達成']));
      lgEff.push(pick(['個案功能維持或提升不退化', '個案生活自理能力提升', '個案功能維持穩定']));
    }
    if (S.aids.length || S.env) {
      sh.push(pick(['完成居家輔具與無障礙環境改善評估與規劃', '協助申請合適輔具並規劃居家無障礙改善', '完成輔具及無障礙環境改善之評估與申請']));
      names.push('輔具及無障礙環境改善');
      midEff.push(pick(['完成輔具配置與無障礙設施施工並適應使用', '個案可正確使用輔具、居家動線改善', '輔具到位並順利使用']));
      lgEff.push(pick(['居家環境安全無礙', '個案於居家環境中活動安全', '居家環境風險降低']));
    }
    if (S.trans) {
      sh.push(pick(['追蹤個案就醫頻率，提供交通車服務使用', '了解個案回診安排，協助預約交通接送', '個案回診時可使用交通車接送']));
      names.push('交通車服務');
      midEff.push(pick(['外出就醫順利', '個案可依時回診', '就醫交通安排順利']));
      lgEff.push(pick(['外出就醫過程安全順利', '個案規律回診、病況穩定追蹤', '個案就醫無礙']));
    }
    if (S.respite.length || S.short.length) {
      var rn = S.short.length ? (S.respite.length ? '喘息及短照服務' : '短照服務') : '喘息服務';
      sh.push(S.foreign ? pick(['追蹤外籍看護工休假頻率，提供' + (S.short.length && S.respite.length ? '喘息或短照服務' : rn) + '使用', '外看休假時安排' + rn + '銜接照顧', '了解外看休假安排，預先規劃' + rn])
        : pick(['於照顧者需要休息時提供' + rn, '視照顧者需求安排' + rn + '，分擔照顧壓力', '照顧者可於需要時預約使用' + rn]));
      names.push(rn);
      midEff.push(pick(['個案可持續獲得生活照顧，照顧者可獲得喘息空間', '照顧者獲得適度休息', '照顧不中斷、照顧者壓力減輕']));
      lgEff.push(pick(['確保個案日常生活照顧不間斷', '照顧者可長期維持照顧能量', '家庭照顧功能維持穩定']));
    }
    if (S.other.length) {
      var on = joinAnd(S.other.map(function (l) { return nz(l.name); }));
      sh.push('提供' + on + '服務'); names.push(on);
    }
    midEff.push(fallRisk ? pick(['服務期間無跌倒事件發生', '服務過程安全無跌倒', '個案無跌倒或意外事件']) : pick(['服務期間安全', '服務過程順利', '服務使用無礙']));
    var nmAll = joinAnd(names), qol = '提升整體生活品質' + (care ? '，減輕照顧負荷' : '');
    return {
      short: sh.join('；') + '。',
      mid: pick(['追蹤' + nmAll + '使用情形，' + midEff.join('，'), '持續追蹤' + nmAll + '服務狀況，確保' + midEff.join('，'), '個案穩定使用' + nmAll + '，' + midEff.join('，')]) + '。',
      long: pick(['穩定提供' + nmAll + '，' + lgEff.join('，') + '，' + qol, '維持' + nmAll + '穩定使用，使' + lgEff.join('，') + '，進而' + qol, '個案長期穩定接受' + nmAll + '，' + lgEff.join('，') + '，延緩失能並' + qol]) + '。'
    };
  }
  function goals(f) {
    var a = goalsAuto(f);
    return {
      short: f.goalEdited ? nz(f.goalShort) : a.short,
      mid: f.goalEdited ? nz(f.goalMid) : a.mid,
      long: f.goalEdited ? nz(f.goalLong) : a.long
    };
  }

  /* ---------- 組合：計畫目標欄 ---------- */
  function goalText(f, st) {
    var g = st.headGap, out = [];
    out.push(s1(f, st));
    out.push('貳、' + g + '個案摘述：');
    out.push('1、 生理面向：');
    phys(f).forEach(function (p) { out.push(p); });
    out.push('2、 心理面向：' + psych(f));
    var fam = family(f);
    out.push('3、 家庭狀況：' + (fam[0] || ''));
    fam.slice(1).forEach(function (x) { out.push(x); });
    out.push('4、 居家環境：' + home(f));
    out.push('5、 生活作息：' + routine(f));
    out.push('6、 服務使用狀況：' + svc(f));
    out.push('參、' + g + '照顧問題：');
    problems(f).forEach(function (x) { out.push(x); });
    out.push('肆、' + g + '照顧計畫目標：');
    var gl = goals(f);
    out.push('1、短期目標：' + gl.short);
    out.push('2、中期目標：' + gl.mid);
    out.push('3、長期目標：' + gl.long);
    out.push('個管員：' + nz(f.cmName));
    return out.join('\n');
  }

  /* ============================================================
     計畫更新／異動（AA01 計畫更新與計畫異動寫法相同）：
     疊加在 CMS 舊計畫上方的兩段文字。舊計畫只在 CMS，程式看不到，
     所以只寫個管師標記為「新增／調整／維持／取消」的服務。
     ============================================================ */
  var UP_BLOCKS = [['pCare', '照顧服務', 'care'], ['pPro', '專業服務', 'pro'], ['trans', '交通接送服務', 'trans'], ['pAids', '輔具及居家無障礙環境改善服務', 'aid'],
    ['pRespite', '喘息服務', 'year'], ['pShort', '短照服務', 'year'], ['pOther', '其他', 'care']];
  var UP_ACTS = ['新增', '調整', '維持', '取消'];
  function upAct(l) { return UP_ACTS.indexOf(l.act) >= 0 ? l.act : '新增'; }
  /* 這次的單位數（含單位），沒有則空字串 */
  function upVal(l, kind, st) {
    if (kind === 'care') { var u = unitsOf(l, st); return u === '' ? '' : u + '單位/月'; }
    if (kind === 'year') return nz(l.units) ? nz(l.units) + '單位/年' : '';
    if (kind === 'pro') return nz(l.unitsText);
    return '';
  }
  /* 原本的單位數：只填數字時自動補上單位 */
  function upFrom(l, kind) {
    var x = stripEnd(l.from); if (!x) return '';
    if (/^\d+(\.\d+)?$/.test(x)) return x + (kind === 'care' ? '單位/月' : kind === 'year' ? '單位/年' : '');
    return x;
  }
  function upLineText(l, kind, st) {
    if (upAct(l) === '取消') return '取消' + nz(l.code) + nz(l.name) + '。';
    return kind === 'care' ? careLineText(l, st) : kind === 'pro' ? proLineText(l) : kind === 'year' ? yearLineText(l) : aidLineText(l);
  }
  function upTransAct(f) { return UP_ACTS.indexOf(f.upTrans) >= 0 ? f.upTrans : ''; }
  function upTransAmt(f, st) { return nz(f.pTransAmt) || st.transAmount; }
  function upTransLine(f, st) {
    if (upTransAct(f) === '取消') return '取消DA01交通接送。';
    var v = vals(f, 'pVendors');
    return 'DA01交通接送:' + upTransAmt(f, st) + '元/月' + (v.length ? '(' + v.join('、') + ')' : '') + '。';
  }
  /* 「與前次計畫不同之處」的各項 */
  function upDiffItems(f, st) {
    var items = [];
    UP_BLOCKS.forEach(function (b) {
      if (b[2] === 'trans') {
        var ta = upTransAct(f), amt = upTransAmt(f, st) + '元/月', fr = stripEnd(f.upTransFrom);
        if (/^\d+$/.test(fr)) fr += '元/月';
        if (ta === '新增') items.push('新增DA01交通接送(' + amt + ')');
        if (ta === '調整') items.push(fr && fr !== amt ? 'DA01交通接送由' + fr + '調整為' + amt : 'DA01交通接送服務內容調整');
        if (ta === '取消') items.push('取消DA01交通接送');
        return;
      }
      planLines(f, b[0]).forEach(function (l) {
        var a = upAct(l), lab = nz(l.code) + nz(l.name), v = upVal(l, b[2], st), fr = upFrom(l, b[2]);
        if (a === '新增') items.push('新增' + lab + (v ? '(' + v + ')' : ''));
        if (a === '調整') items.push(fr && v ? lab + '由' + fr + '調整為' + v : v ? lab + '調整為' + v : lab + '服務內容調整');
        if (a === '取消') items.push('取消' + lab);
      });
    });
    return items;
  }
  function upWho(f) { return stripEnd(f.upWith) || '個案'; }
  function upLead(f) {
    var d = rocDot(f.visitDate) || '○.○.○', who = upWho(f);
    if (f.upHow === '家訪') return d + '家訪，與' + who + '討論';
    if (f.upHow === '服務單位通報') return d + '經服務單位通報，個管致電' + who + '討論';
    return d + '與' + who + '電訪討論';
  }
  function updateTexts(f, st) {
    var cm = nz(f.cmName), g = [];
    g.push(upLead(f) + (nz(f.upReason) ? '，' + stripEnd(f.upReason) : '') + '，討論後協助計畫異動。');
    if (nz(f.upCond)) g.push('本次體況：' + stripEnd(f.upCond) + '。');
    var items = upDiffItems(f, st);
    if (items.length) g.push('與前次計畫不同之處：' + items.join('，') + (f.upRest === '不寫' ? '' : '，其餘服務維持不變') + '。');
    g.push('個管員:' + cm); g.push('---');
    var d = rocDot(f.visitDate) || '○.○.○', p = [d + '與' + upWho(f) + '討論後協助計畫異動，計畫異動如下:'], any = false;
    UP_BLOCKS.forEach(function (b) {
      if (b[2] === 'trans') { if (upTransAct(f)) { any = true; p.push('【' + b[1] + '】'); p.push(upTransLine(f, st)); } return; }
      var ls = planLines(f, b[0]); if (!ls.length) return;
      any = true;
      var per = b[0] === 'pRespite' ? nz(f.pRespitePeriod) : b[0] === 'pShort' ? nz(f.pShortPeriod) : '';
      p.push('【' + b[1] + '】' + (per ? '(' + (b[0] === 'pRespite' ? '喘息' : '短照') + '額度區間' + per + ')' : ''));
      ls.forEach(function (l) { p.push(upLineText(l, b[2], st)); });
    });
    if (!any) p.push('服務內容維持不變。');
    if (nz(f.planNote)) p.push(nz(f.planNote));
    p.push('個管員:' + cm); p.push('---');
    return { goal: g.join('\n'), plan: p.join('\n') };
  }
  function updateChecks(f) {
    var w = [];
    function add(msg, fid) { w.push({ sec: 'update', msg: msg, fid: fid || '' }); }
    if (!nz(f.visitDate)) add('尚未填寫日期', 'visitDate');
    if (!nz(f.name)) add('尚未填寫個案姓名', 'name');
    if (!nz(f.cmName)) add('尚未填寫個管員姓名', 'cmName');
    if (!nz(f.upWith)) add('尚未填寫討論對象（目前寫成「個案」）', 'upWith');
    var lines = 0;
    UP_BLOCKS.forEach(function (b) {
      if (b[2] === 'trans') { if (upTransAct(f)) lines++; return; }
      planLines(f, b[0]).forEach(function (l) {
        lines++;
        var a = upAct(l);
        if (a === '取消') return;
        if (b[2] === 'care' && unitsOf(l, DEFAULT_ST) === '' && !l.unitsManual) add(nz(l.code) + nz(l.name) + ' 尚未設定頻率或單位數', 'line-' + l.id);
        if (b[2] === 'year' && !nz(l.units)) add(nz(l.code) + nz(l.name) + ' 尚未填寫年度單位數', 'line-' + l.id);
        if (a === '調整' && (b[2] === 'care' || b[2] === 'year' || b[2] === 'pro') && !nz(l.from)) add(nz(l.code) + nz(l.name) + ' 標為「調整」但沒填原本的單位數（會寫成「調整為…」）', 'line-' + l.id);
      });
    });
    if ((upTransAct(f) === '新增' || upTransAct(f) === '調整') && !vals(f, 'pVendors').length) add('交通接送尚未選擇服務單位', 'pVendors');
    if (!lines && !nz(f.upCond)) add('尚未填寫體況變化，也沒有選取任何服務變動', 'upCond');
    return w;
  }

  /* ---------- 複評：與前次紀錄比對 ---------- */
  function lineMap(f, st) {
    var m = {}, order = [];
    function put(key, label, val, full) { m[key] = { label: label, val: val, full: full }; order.push(key); }
    planLines(f, 'pCare').concat(planLines(f, 'pOther')).forEach(function (l) { var u = unitsOf(l, st); put(nz(l.code) + nz(l.name), nz(l.code) + nz(l.name), u === '' ? '' : u + '單位/月', careLineText(l, st)); });
    planLines(f, 'pPro').forEach(function (l) { put(nz(l.code) + nz(l.name), nz(l.code) + nz(l.name), nz(l.unitsText), proLineText(l)); });
    if (f.pTrans === '使用') put('DA01', 'DA01交通接送', (nz(f.pTransAmt) || st.transAmount) + '元/月', 'DA01' + (nz(f.pTransAmt) || st.transAmount) + vals(f, 'pVendors').join('、'));
    planLines(f, 'pAids').forEach(function (l) { put(nz(l.code) + nz(l.name), nz(l.code) + nz(l.name), '', aidLineText(l)); });
    planLines(f, 'pRespite').concat(planLines(f, 'pShort')).forEach(function (l) { put(nz(l.code) + nz(l.name), nz(l.code) + nz(l.name), nz(l.units) ? nz(l.units) + '單位/年' : '', yearLineText(l)); });
    return { m: m, order: order };
  }
  /* 服務內容差異：新增、調整、取消 */
  function planDiff(f, prevF, st) {
    var a = lineMap(prevF, st), b = lineMap(f, st), add = [], chg = [], del = [];
    b.order.forEach(function (k) {
      var n = b.m[k], o = a.m[k];
      if (!o) add.push('新增' + n.label + (n.val ? '(' + n.val + ')' : ''));
      else if (o.full !== n.full) chg.push(o.val && n.val && o.val !== n.val ? n.label + '由' + o.val + '調整為' + n.val : n.label + '服務內容調整');
    });
    a.order.forEach(function (k) { if (!b.m[k]) del.push('取消' + a.m[k].label); });
    var items = add.concat(chg, del);
    if (!items.length) return '與前次計畫相比，服務內容維持不變';
    var same = b.order.some(function (k) { return a.m[k] && a.m[k].full === b.m[k].full; });
    return '與前次計畫相比，' + items.join('，') + (same ? '，其餘服務維持不變' : '');
  }

  /* ---------- 檢核 ---------- */
  function checks(f) {
    var w = [];
    function add(sec, msg, fid) { w.push({ sec: sec, msg: msg, fid: fid || '' }); }
    if (!nz(f.visitDate)) add('basic', '尚未填寫訪視日期', 'visitDate');
    if (!nz(f.name)) add('basic', '尚未填寫個案姓名', 'name');
    if (!nz(f.cmName)) add('basic', '尚未填寫個管員姓名', 'cmName');
    if (!phys(f).length) add('phys', '生理面向尚未填寫', 'dx');
    if (!psych(f)) add('psych', '心理面向尚未填寫', 'mood');
    if (!family(f).length) add('family', '家庭狀況尚未填寫', 'marital');
    if (!home(f)) add('home', '居家環境尚未填寫', 'tenure');
    if (!routine(f)) add('routine', '生活作息尚未填寫', 'regular');
    if (!arr(f.problems).length) add('problems', '尚未勾選照顧問題', 'probgrid');
    arr(f.problems).forEach(function (p) { if (!nz(p.desc)) add('problems', '照顧問題「' + p.name + '」尚未填寫說明', 'prob-' + p.no); });
    var S = summary(f);
    if (!S.any && !has(f, 'careFlags', '聘有外籍看護')) add('plan', '尚未選取任何服務項目', 'blk-pCare');
    planLines(f, 'pCare').concat(planLines(f, 'pOther')).forEach(function (l) {
      if (unitsOf(l, DEFAULT_ST) === '' && !l.unitsManual) add('plan', nz(l.code) + nz(l.name) + ' 尚未設定頻率或單位數', 'line-' + l.id);
    });
    if (f.pTrans === '使用' && !vals(f, 'pVendors').length) add('plan', '交通接送尚未選擇服務單位', 'pVendors');
    if (S.respite.length && !nz(f.pRespitePeriod)) add('plan', '喘息服務尚未填寫額度區間', 'pRespitePeriod');
    S.respite.concat(S.short).forEach(function (l) { if (!nz(l.units)) add('plan', nz(l.code) + nz(l.name) + ' 尚未填寫年度單位數', 'line-' + l.id); });
    if (S.short.length && !nz(f.pShortPeriod)) add('plan', '短照服務尚未填寫額度區間', 'pShortPeriod');
    if (isReview(f) && !nz(f.rvPlan)) add('output', '複評：尚未填寫「與前次計畫不同之處」', 'rvPlan');
    return w;
  }
  /* 喘息／短照：依 CMS 等級的年度額度，照清單順序換算各項可用單位數（已填的先扣除） */
  function quotaFill(lines, kind, cms, Q, overwrite) {
    var total = (Q[kind] || {})[+cms]; if (!total) return null;
    var remain = total, todo = [];
    lines.forEach(function (l) {
      var p = Q.price[nz(l.code)];
      if (!p) return;
      if (!overwrite && nz(l.units) !== '') remain -= p * (parseFloat(l.units) || 0); else todo.push([l, p]);
    });
    todo.forEach(function (x) { var n = Math.max(0, Math.floor(remain / x[1])); x[0].units = String(n); remain -= n * x[1]; });
    return { total: total, remain: remain };
  }
  var DEFAULT_ST = { weekFactor: { 1: 5, 2: 9, 3: 14, 4: 18, 5: 23, 6: 27, 7: 31 } };

  return {
    nz: nz, arr: arr, vals: vals, joinAnd: joinAnd, rocLong: rocLong, rocDot: rocDot, quotaPeriod: quotaPeriod,
    s1: s1, phys: phys, psych: psych, family: family, home: home, routine: routine, svc: svc,
    problems: problems, problemDefault: problemDefault, suggestProblems: suggestProblems, suggestCause: suggestCause,
    goals: goals, goalsAuto: goalsAuto, goalText: goalText, plan: plan, careLineText: careLineText, proLineText: proLineText,
    aidLineText: aidLineText, yearLineText: yearLineText, unitsAuto: unitsAuto, unitsOf: unitsOf, freqText: freqText,
    summary: summary, checks: checks, bmiOf: bmiOf, bmiCat: bmiCat, participants: participants,
    defaultDiscuss: defaultDiscuss, quotaFill: quotaFill, isReview: isReview, planDiff: planDiff, MUSCLE: MUSCLE, MUSCLE_OLD: MUSCLE_OLD,
    updateTexts: updateTexts, updateChecks: updateChecks, upLineText: upLineText, upAct: upAct, UP_ACTS: UP_ACTS
  };
})();
