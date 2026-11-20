/* ============================================================
   主程式：個案清單、撰寫計畫（分頁、即時草稿、照顧問題、服務規劃、目標、產出）、計畫更新／異動、列印、設定
   ============================================================ */
var APP = (function () {
  'use strict';
  var h = UI.h, clear = UI.clear, nz = NAR.nz, arr = NAR.arr, store = UI.store;
  /* 儲存位置依登入帳號分開：cpgen.<帳號>.settings／index／case.<id>（登入後由 useAccount 設定） */
  var K = { st: 'cpgen.settings', idx: 'cpgen.index', rec: 'cpgen.case.' };
  var LEGACY = { st: 'cpgen.settings', idx: 'cpgen.index', rec: 'cpgen.case.' };
  function useAccount(u) { K = { st: 'cpgen.' + u + '.settings', idx: 'cpgen.' + u + '.index', rec: 'cpgen.' + u + '.case.' }; }
  /* 雲端模式：登入後 store 換成 CLOUD.store（記憶體明文＋加密上傳）；個案清單由雲端資料重建 */
  var CLOUDON = false;
  function buildIdx() { return CLOUD.ids().map(function (id) { var r = CLOUD.recOf(id); return r && r.f ? metaOf(r) : null; }).filter(Boolean); }
  /* 加入登入功能前，這台裝置上的個案沒有帳號：第一個登入的帳號（且自己還沒有個案）接收這些資料 */
  function migrateLegacy() {
    var res = { cases: 0, settings: false };
    var st = store.get(LEGACY.st);
    if (st) { if (!store.get(K.st)) { store.set(K.st, st); res.settings = true; } store.del(LEGACY.st); }
    var old = store.get(LEGACY.idx);
    if (!Array.isArray(old) || !old.length || (store.get(K.idx) || []).length) return res;
    old.forEach(function (m) { var r = store.get(LEGACY.rec + m.id); if (r && store.set(K.rec + m.id, r)) { store.del(LEGACY.rec + m.id); res.cases++; } });
    store.set(K.idx, old); store.del(LEGACY.idx);
    return res;
  }
  var ORG = '新北市私立明曜居家長照機構社區整合型中心專用';
  var COPYRIGHT = '© 明曜居家長照機構 版權所有，未經授權不得複製、修改或散布';
  var S = { st: null, idx: [], rec: null, sec: 'basic', conds: [], hooks: [], timer: null, draftOpen: false, lastDraft: null };
  var E = {};                       /* 重要節點 */
  var ctx = { changed: changed, conds: null, refreshConds: refreshConds };
  var SECS = SCHEMA.sections;
  var PLAN_GROUPS = [['壹', '訪視資訊'], ['貳', '個案摘述'], ['參', '照顧問題'], ['肆', '照顧計畫'], ['產出', '']];
  var AA_GROUPS = [['壹', '訪視資訊'], ['貳', '個案摘述'], ['參', '照顧問題'], ['肆', '照顧計畫'], ['備註', ''], ['產出', '']];
  var GROUPS = PLAN_GROUPS;

  /* ---------- 設定與資料 ---------- */
  function loadSettings() {
    var d = JSON.parse(JSON.stringify(DATA.defaults)), s = store.get(K.st) || {};
    Object.keys(s).forEach(function (k) { d[k] = s[k]; });
    return migrateSettings(d);
  }
  /* 交通服務單位仍是舊版預設名單（未自行修改過）時，換成新版簡稱名單；自行修改過的名單只把全名換成簡稱 */
  function migrateSettings(st) {
    var v = arr(st.vendors);
    if (DATA.oldVendorLists.some(function (old) { return v.length === old.length && old.every(function (x) { return v.indexOf(x) >= 0; }); })) st.vendors = DATA.defaults.vendors.slice();
    else st.vendors = v.map(function (x) { return DATA.vendorAlias[x] || x; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
    return st;
  }
  /* 舊個案存的交通單位全名換成簡稱（含複評的前次紀錄，避免比對時誤判為異動） */
  function migrateVendors(f) {
    if (!f || !Array.isArray(f.pVendors)) return;
    var out = [];
    f.pVendors.forEach(function (x) { var n = DATA.vendorAlias[x] || x; if (out.indexOf(n) < 0) out.push(n); });
    f.pVendors = out;
  }
  function saveSettings() { store.set(K.st, S.st); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function blankF() {
    return { visitDate: today(), clientJoin: '是', address: S.st.address, cmName: S.st.cmName, attendees: [], members: [], problems: [],
      pCare: [], pPro: [], pAids: [], pRespite: [], pShort: [], pOther: [], pTransAmt: S.st.transAmount };
  }
  function newRecord() { return { id: UI.uid(), createdAt: Date.now(), updatedAt: Date.now(), f: blankF(), changes: [] }; }
  /* 計畫更新／異動：疊加在 CMS 舊計畫上方的一段文字 */
  function newUpdate() {
    return { id: UI.uid(), kind: 'update', createdAt: Date.now(), updatedAt: Date.now(), changes: [],
      f: { visitDate: today(), cmName: S.st.cmName, upHow: '電訪', pCare: [], pPro: [], pAids: [], pRespite: [], pShort: [], pOther: [], pTransAmt: S.st.transAmount } };
  }
  /* AA01：獨立一種紀錄（kind:'aa01'），可從清單裡的個案帶入 */
  function newAA() {
    var f = blankF(); f.problems = [];
    return { id: UI.uid(), kind: 'aa01', createdAt: Date.now(), updatedAt: Date.now(), changes: [], f: f };
  }
  function isAA(rec) { return !!(rec || S.rec) && (rec || S.rec).kind === 'aa01'; }
  var AA_CARRY = ['name', 'cms', 'identity', 'withCM', 'clientJoin', 'attendees', 'address', 'phone', 'cmName', 'problems', 'pCare', 'pPro', 'pTrans', 'pTransAmt', 'pVendors',
    'pAids', 'pRespite', 'pRespitePeriod', 'pShort', 'pShortPeriod', 'pOther', 'careFlags', 'careFlagNote', 'goalVar', 'aaCarerRel', 'aaCarerLoad', 'aaHelp', 'aaHelpNote'];
  /* AA01 參考用的前次照顧問題：建立時帶入的；沒有的話找清單中同姓名最近一筆撰寫計畫 */
  /* 這位個案的撰寫計畫紀錄：建立 AA01 時的來源；沒有的話找清單中同姓名最近一筆 */
  function planRecOf(rec) {
    if (rec.from && rec.from.kind === 'plan') { var r0 = store.get(K.rec + rec.from.id); if (r0) return r0; }
    var name = nz(rec.f.name); if (!name) return null;
    var cand = S.idx.filter(function (m) { return m.id !== rec.id && m.name === name && (m.kind || 'plan') === 'plan'; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })[0];
    return cand ? store.get(K.rec + cand.id) : null;
  }
  function prevProblemsOf(rec) {
    if (rec.prevProblems) return { list: rec.prevProblems, src: rec.from };
    var r = planRecOf(rec);
    return r ? { list: arr(r.f.problems).map(function (p) { return { no: p.no, name: p.name }; }), src: { date: r.f.visitDate || '' } } : null;
  }
  /* 服務沒有改變時，把撰寫計畫的服務規劃整份套入 AA01 */
  var PLAN_KEYS = ['pCare', 'pPro', 'pTrans', 'pTransAmt', 'pVendors', 'pAids', 'pRespite', 'pRespitePeriod', 'pShort', 'pShortPeriod', 'pOther', 'careFlags', 'careFlagNote', 'planNote'];
  function planEmpty(f) { return !NAR.summary(f).any && !arr(f.careFlags).length; }
  function applyPlanFrom(src, f) {
    var c = JSON.parse(JSON.stringify(src.f));
    PLAN_KEYS.forEach(function (k) { if (c[k] !== undefined) f[k] = c[k]; else delete f[k]; });
    arr(f.pCare).concat(arr(f.pPro), arr(f.pAids), arr(f.pRespite), arr(f.pShort), arr(f.pOther)).forEach(function (l) { l.id = UI.uid(); });
  }
  function cloneForAA(rec) {
    var n = newAA(), src = JSON.parse(JSON.stringify(rec.f));
    AA_CARRY.forEach(function (k) { if (src[k] !== undefined) n.f[k] = src[k]; });
    /* 照顧問題不直接勾選：記下前次勾選的項目，在清單上用底色標示，由個管重新勾選排序 */
    n.f.problems = [];
    n.prevProblems = arr(src.problems).map(function (p) { return { no: p.no, name: p.name }; });
    if (!nz(n.f.aaCarerRel)) {
      var mc = arr(src.members).filter(function (m) { return arr(m.roles).indexOf('主要照顧者') >= 0; })[0];
      if (mc) n.f.aaCarerRel = nz(mc.rel); else if (src.foreign === '有') n.f.aaCarerRel = '外籍看護';
    }
    n.f.visitDate = today(); n.f.cmName = nz(src.cmName) || S.st.cmName;
    n.from = { id: rec.id, kind: rec.kind || 'plan', date: src.visitDate || '' };
    openRec(n); saveNow(); UI.toast('已帶入「' + (nz(src.name) || '未命名') + '」的資料，請修改這次有變動的地方');
  }
  UI.refDate.fn = function () { return S.rec && S.rec.f ? S.rec.f.visitDate : ''; };
  function isUpd(rec) { return !!(rec || S.rec) && (rec || S.rec).kind === 'update'; }
  /* 訪視類型為單選「初評」「出備初評」「複評」（AA01 已獨立為首頁的 AA01）：舊資料的「AA01」「複評/AA01」、['初評','AA01'] 等轉成單一值，AA01 視同複評 */
  function migrateVisitType(f) {
    if (!f || f.visitType === undefined) return;
    var v = arr(f.visitType);
    f.visitType = (v.indexOf('複評') >= 0 || v.indexOf('複評/AA01') >= 0 || v.indexOf('AA01') >= 0) ? '複評' : ['出備初評', '初評'].filter(function (x) { return v.indexOf(x) >= 0; })[0] || '';
  }
  /* 改為可複選的欄位：舊資料存的單一字串轉成陣列 */
  function migrateMulti(f) {
    if (!f) return;
    ['toilet', 'spirit'].forEach(function (k) { if (typeof f[k] === 'string') f[k] = f[k] ? [f[k]] : []; });
    /* 身分別改為單選「第一類～第三類」：舊資料 ['三類','身障'] → '第三類'（身障另見身心障礙證明欄） */
    if (Array.isArray(f.identity)) f.identity = ['一類', '二類', '三類'].filter(function (x) { return f.identity.indexOf(x) >= 0; }).map(function (x) { return '第' + x; })[0] || '';
  }
  function normalize(rec) {
    var b = blankF(); rec.f = rec.f || {};
    ['attendees', 'members', 'problems', 'pCare', 'pPro', 'pAids', 'pRespite', 'pShort', 'pOther'].forEach(function (k) { if (!Array.isArray(rec.f[k])) rec.f[k] = b[k]; });
    if (!Array.isArray(rec.changes)) rec.changes = [];
    if (!rec.id) rec.id = UI.uid();
    migrateVendors(rec.f); if (rec.prev) migrateVendors(rec.prev.f);
    migrateVisitType(rec.f); if (rec.prev) migrateVisitType(rec.prev.f);
    migrateMulti(rec.f); if (rec.prev) migrateMulti(rec.prev.f);
    delete rec.f.rvMode; delete rec.f.rvCond; delete rec.draftChange;      /* 複評摘要版、舊的異動草稿已整併到「計畫更新／異動」 */
    return rec;
  }
  function metaOf(rec) { return { id: rec.id, kind: rec.kind || 'plan', name: nz(rec.f.name) || '（未填姓名）', date: rec.f.visitDate || '', updatedAt: rec.updatedAt }; }
  function saveNow() {
    if (!S.rec) return;
    clearTimeout(S.timer); S.timer = null;
    var ok = store.set(K.rec + S.rec.id, S.rec), m = metaOf(S.rec), i = -1;
    S.idx.forEach(function (x, j) { if (x.id === m.id) i = j; });
    if (i >= 0) S.idx[i] = m; else S.idx.unshift(m);
    store.set(K.idx, S.idx);
    setSaveState(ok ? 'saved' : 'fail');
  }
  function scheduleSave() { clearTimeout(S.timer); setSaveState('saving'); S.timer = setTimeout(saveNow, 600); }
  function setSaveState(s) {
    if (!E.save) return;
    E.save.className = 'savestate' + (s === 'fail' || !store.ok ? ' warn' : '');
    E.save.textContent = !store.ok || s === 'fail' ? '此瀏覽器無法自動儲存，離開前請按「存檔」' : s === 'saving' ? '儲存中…' : '已自動儲存在這台裝置';
  }
  /* ---- 訪視評估表版面：存檔的 PDF、列印、舊版 html 共用 ---- */
  /* ---- 訪視評估表（存檔 html 與列印共用的版面）：A4 公文表格風格，樣式全部限定在 .vf 內 ---- */
  var KAI = '"DFKai-SB","BiauKai","標楷體","KaiTi","Kaiti TC","STKaiti","Noto Serif TC",serif';
  var FORM_CSS = '.vf{--ink:#1c2733;--brand:#1f4e79;--head:#dbeafa;--headline:#9cc3e8;--tint:#f2f7fc;--line:#a9bccf;--soft:#d7e2ec;--mute:#8693a0;font:10.5pt/1.6 "Microsoft JhengHei","微軟正黑體","PingFang TC","Noto Sans TC",sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.vf *{box-sizing:border-box}' +
    '.vf .hd{display:grid;grid-template-columns:54px 1fr auto;align-items:center;gap:12px;border-bottom:2.4pt solid var(--brand);padding-bottom:8px;margin-bottom:10px}' +
    '.vf .hd img{width:54px;height:54px;display:block}' +
    '.vf .hd h1{font:700 17pt/1.25 ' + KAI + ';letter-spacing:.08em;margin:0;color:var(--brand)}' +
    '.vf .hd .org{font-size:9pt;color:#4b5b5f;margin-top:2px;letter-spacing:.03em}' +
    '.vf .hd .no{font-size:8.5pt;text-align:right;color:#5d6c70;line-height:1.6;white-space:nowrap}' +
    '.vf .sum{display:grid;grid-template-columns:1.25fr 1.15fr 1fr .8fr 1fr;border:1pt solid var(--brand);border-radius:4px;overflow:hidden;margin-bottom:6px}' +
    '.vf .sum>div{padding:5px 9px;border-right:.75pt solid var(--soft);min-width:0}.vf .sum>div:last-child{border-right:0}' +
    '.vf .sum span{display:block;font-size:8pt;color:var(--mute);letter-spacing:.06em}.vf .sum b{font-size:11pt;font-weight:700}' +
    '.vf h2{display:flex;align-items:baseline;gap:10px;margin:14px 0 0;padding:5px 11px;background:var(--head);color:var(--brand);border:.75pt solid var(--headline);border-left:4pt solid #3d7cc0;border-bottom:0;font:700 11.5pt/1.4 ' + KAI + ';letter-spacing:.06em;border-radius:4px 4px 0 0;break-after:avoid;page-break-after:avoid}' +
    '.vf h2 small{font:400 8.5pt "Microsoft JhengHei",sans-serif;color:#4f6f8f;letter-spacing:0}' +
    '.vf table{width:100%;border-collapse:collapse;table-layout:fixed}' +
    '.vf th,.vf td{border:.75pt solid var(--line);padding:5px 9px;vertical-align:top;text-align:left}' +
    '.vf th{width:18%;background:var(--tint);font-weight:700;font-size:9.8pt;line-height:1.45;color:var(--brand)}' +
    '.vf tr{break-inside:avoid;page-break-inside:avoid}' +
    '.vf .ln{display:grid;grid-template-columns:7.4em 1fr;gap:0 8px;padding:2px 0}.vf .ln.nok{grid-template-columns:1fr}' +
    '.vf .ln+.ln,.vf .ln+.blk,.vf .blk+.ln{border-top:.5pt dotted var(--soft)}' +
    '.vf .k{color:#4b5b5f;font-size:9.4pt;padding-top:1px}' +
    '.vf .o{display:inline-block;margin-right:11px;color:var(--mute)}.vf .o.on{color:var(--ink);font-weight:700}' +
    '.vf .o i{display:inline-block;position:relative;width:.82em;height:.82em;border:1pt solid #9aa7ad;border-radius:2px;margin-right:4px;vertical-align:-.06em;background:#fff}' +
    '.vf .o.on i{background:var(--brand);border-color:var(--brand)}.vf .o.on i:after{content:"";position:absolute;left:.25em;top:.06em;width:.2em;height:.42em;border:solid #fff;border-width:0 1.7pt 1.7pt 0;transform:rotate(45deg)}' +
    '.vf .val{font-weight:600}.vf .blank{color:#b3bec0;letter-spacing:.1em}' +
    '.vf .blk{padding:4px 0}.vf .blk>.k{display:block;margin-bottom:2px}' +
    '.vf .mem{border:.5pt solid var(--soft);border-radius:4px;padding:4px 9px;margin:4px 0;line-height:1.7}.vf .mem b{color:var(--brand);margin-right:6px}' +
    '.vf .mem .kv{display:inline-block;margin-right:12px}.vf .mem .kv span{color:var(--mute);font-size:9pt}' +
    '.vf .fig{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.vf svg.bodysvg{width:250px;height:auto;flex:none}' +
    '.vf .lg{margin:0;padding:0;list-style:none;font-size:9pt;line-height:1.8}.vf .lg b{display:inline-block;width:1.5em;color:var(--brand)}' +
    '.vf .pain{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.vf svg.painsvg{width:100%;max-width:400px;height:auto;display:block}.vf .pain .cap{font-weight:700}' +
    '.vf img.sk{max-width:100%;max-height:220pt;border:.5pt solid var(--soft);border-radius:4px}' +
    '.vf .ptext{white-space:pre-wrap;border:.75pt solid var(--line);border-top:0;padding:9px 11px;line-height:1.8;font-size:10.5pt}' +
    '.vf .sig{display:grid;grid-template-columns:repeat(3,1fr);margin-top:16px;border:.75pt solid var(--line);break-inside:avoid}' +
    '.vf .sig>div{padding:6px 10px;min-height:62px;border-right:.75pt solid var(--line)}.vf .sig>div:last-child{border-right:0}' +
    '.vf .sig span{display:block;font-size:8.5pt;color:var(--mute);letter-spacing:.05em}.vf .sig b{display:block;margin-top:10px;font-weight:600}' +
    '.vf .ft{margin-top:10px;font-size:8pt;color:var(--mute);text-align:center;letter-spacing:.04em}' +
    '.vf .pb{break-before:page;page-break-before:always}' +
    '@media screen and (max-width:640px){.vf .hd h1{font-size:13.5pt;letter-spacing:.04em}.vf .hd h1 span{display:inline-block}.vf h2{font-size:11pt}.vf .sum{grid-template-columns:1fr 1fr}.vf .sum>div{border-bottom:.75pt solid var(--soft)}.vf th{width:26%}.vf .ln{grid-template-columns:1fr}.vf .hd{grid-template-columns:44px 1fr}.vf .hd .no{display:none}}';
  /* 存檔 html 專用：螢幕上像一張 A4 紙，列印時去掉外框 */
  var PAGE_CSS = 'body{margin:0;background:#e7edf3}' +
    '.bar{position:sticky;top:0;z-index:2;display:flex;justify-content:center;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 16px;background:rgba(255,255,255,.92);border-bottom:1px solid #d6dfde;font:13px/1.5 "Microsoft JhengHei",sans-serif;color:#5d6c70}' +
    '.bar button{font:600 14px "Microsoft JhengHei",sans-serif;padding:8px 18px;border:0;border-radius:8px;background:#1f4e79;color:#fff;cursor:pointer}' +
    '.sheet{max-width:210mm;margin:20px auto 40px;background:#fff;padding:13mm 12mm;box-shadow:0 6px 28px rgba(20,40,40,.14);border-radius:2px}' +
    '@media screen and (max-width:640px){.sheet{margin:0;padding:16px 12px;box-shadow:none}}' +
    '@media print{body{background:#fff}.bar{display:none}.sheet{margin:0;padding:0;box-shadow:none;max-width:none}}' +
    '@page{size:A4;margin:12mm 11mm 14mm;@bottom-center{content:"第 " counter(page) " 頁／共 " counter(pages) " 頁";font-size:8pt;color:#8a979c}}';
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function caseName(rec) { return (nz(rec.f.name) || '未命名').replace(/[\\\/:*?"<>|]/g, ''); }
  function outTexts(rec) {
    var f = rec.f, u = isUpd(rec) ? NAR.updateTexts(f, S.st) : null, aa = isAA(rec);
    return {
      goal: f.outGoalEdited ? nz(f.outGoal) : (aa ? NAR.aaGoalText(f, S.st) : u ? u.goal : NAR.goalText(f, S.st)),
      plan: f.outPlanEdited ? nz(f.outPlan) : (aa ? NAR.aaPlan(f, S.st) : u ? u.plan : NAR.plan(f, S.st)),
      note: aa ? (f.outNoteEdited ? nz(f.outNote) : NAR.aaNote(f)) : ''
    };
  }
  /* 檔名：撰寫計畫「○○○訪視評估表」；更新／異動「○○○計畫更新異動_1151115」（同月份可能有好幾筆，加日期避免覆蓋） */
  function fileBase(rec) {
    if (!isUpd(rec) && !isAA(rec)) return caseName(rec) + '訪視評估表';
    var r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(nz(rec.f.visitDate));
    return caseName(rec) + (isAA(rec) ? 'AA01' : '計畫更新異動') + (r ? '_' + (+r[1] - 1911) + ('0' + r[2]).slice(-2) + ('0' + r[3]).slice(-2) : '');
  }
  function formHtml(rec) {
    var data = JSON.stringify({ app: 'care-plan-generator', version: 2, exportedAt: new Date().toISOString(), rec: rec }).replace(/</g, '\\u003c');
    var title = fileBase(rec);
    return '<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
      '<title>' + esc(title) + '</title><style>' + PAGE_CSS + FORM_CSS + '</style></head><body>' +
      '<div class="bar"><button onclick="window.print()">列印／另存 PDF</button><span>本檔可用「照顧計畫產生器」首頁的「匯入存檔」重新開啟編輯</span></div>' +
      '<div class="sheet"><div class="vf">' + buildFormDom(rec).innerHTML + '</div></div>' +
      '\n<script type="application/json" id="cpgen-data">' + data + '<\/script>\n</body></html>\n';
  }
  /* ---- 存檔：兩個 PDF（訪視評估表／計畫更新異動、計畫內容），個案資料夾帶在 PDF 內供匯入 ---- */
  function caseNames(rec) {
    var b = fileBase(rec), n = caseName(rec);
    if (isAA(rec)) return [b + '.pdf'];
    return [b + '.pdf', (isUpd(rec) ? b.replace('計畫更新異動', '計畫更新異動內容') : n + '計畫內容') + '.pdf'];
  }
  function dataJson(rec) { return JSON.stringify({ app: 'care-plan-generator', version: 3, exportedAt: new Date().toISOString(), rec: rec }); }
  /* 計畫內容 PDF：只有兩段要貼到 CMS 的文字 */
  function buildPlanDom(rec) {
    var f = rec.f, t = outTexts(rec), upd = isUpd(rec);
    var p = formHead(upd ? '計畫更新／異動　計畫內容' : '照顧計畫　計畫內容', rec, upd ? [['個案姓名', f.name], ['日期', NAR.rocLong(f.visitDate)], ['方式', f.upHow], ['討論對象', f.upWith], ['個管員', f.cmName]]
      : [['個案姓名', f.name], ['訪視日期', NAR.rocLong(f.visitDate)], ['訪視類型', f.visitType], ['CMS等級', f.cms ? '第' + f.cms + '級' : ''], ['個管員', f.cmName]]);
    p.appendChild(h('h2', null, [upd ? '計畫目標欄' : '計畫目標', h('small', { text: upd ? '貼在 CMS 計畫目標欄最上方，原內容保留在下面' : '貼到 CMS 計畫目標欄' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.goal }));
    p.appendChild(h('h2', null, [upd ? '計畫執行規劃欄' : '計畫執行規劃', h('small', { text: upd ? '貼在 CMS 計畫執行規劃欄最上方' : '貼到 CMS 計畫執行規劃欄' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.plan }));
    arr(rec.changes).forEach(function (c, i) {
      if (i === 0) p.appendChild(h('h2', null, ['計畫異動紀錄', h('small', { text: '舊版程式存的，新的在上' })]));
      p.appendChild(h('div', { class: 'ptext', text: c.goal + '\n\n' + c.plan }));
    });
    p.appendChild(h('div', { class: 'ft', text: ORG + '　本表由照顧計畫產生器產出' }));
    return p;
  }
  function domToPdf(dom, rec, title, progress) {
    var vf = h('div', { class: 'vf' }); while (dom.firstChild) vf.appendChild(dom.firstChild);
    var host = PDF.stage(FORM_CSS, vf);
    return PDF.fromElement(vf, { meta: { title: title, author: nz(rec.f.cmName) }, data: dataJson(rec), footer: title, progress: progress })
      .then(function (blob) { host.remove(); return blob; }, function (e) { host.remove(); throw e; });
  }
  function caseFiles(rec, progress) {
    var names = caseNames(rec);
    progress = progress || function () { };
    if (isAA(rec)) return domToPdf(buildAADom(rec), rec, names[0].replace(/\.pdf$/, ''), progress).then(function (b) { return [{ name: names[0], blob: b, mime: 'application/pdf' }]; });
    return domToPdf(buildFormDom(rec), rec, names[0].replace(/\.pdf$/, ''), function (x) { progress(x * 0.75); }).then(function (b1) {
      return domToPdf(buildPlanDom(rec), rec, names[1].replace(/\.pdf$/, ''), function (x) { progress(0.75 + x * 0.25); }).then(function (b2) {
        return [{ name: names[0], blob: b1, mime: 'application/pdf' }, { name: names[1], blob: b2, mime: 'application/pdf' }];
      });
    });
  }
  /* 依訪視日期決定資料夾：115年度／11月 */
  function folderParts(rec) {
    var m = /^(\d{4})-(\d{1,2})/.exec(nz(rec.f.visitDate) || today());
    return [(+m[1] - 1911) + '年度', (+m[2]) + '月'];
  }
  /* ---- 存檔資料夾（僅電腦版 Chrome／Edge 支援）：資料夾位置記在瀏覽器的 IndexedDB ---- */
  var FS = { ok: typeof window.showDirectoryPicker === 'function', handle: null };
  function idb(mode, fn) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('cpgen-fs', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () {
          try { var tx = rq.result.transaction('kv', mode), r = fn(tx.objectStore('kv')); tx.oncomplete = function () { res(r && r.result !== undefined ? r.result : null); }; tx.onerror = function () { res(null); }; }
          catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  function loadFolder() { if (!FS.ok) return Promise.resolve(null); return idb('readonly', function (st) { return st.get('root'); }).then(function (hd) { FS.handle = hd || null; return FS.handle; }); }
  function chooseFolder() {
    return window.showDirectoryPicker({ mode: 'readwrite', id: 'cpgen-root' }).then(function (hd) {
      FS.handle = hd; return idb('readwrite', function (st) { return st.put(hd, 'root'); }).then(function () { return hd; });
    });
  }
  function ensurePerm(hd) {
    if (!hd.queryPermission) return Promise.resolve(true);
    return hd.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') return true;
      return hd.requestPermission({ mode: 'readwrite' }).then(function (q) { return q === 'granted'; });
    });
  }
  function writeToFolder(root, rec, files) {
    var parts = folderParts(rec);
    return (files ? Promise.resolve(files) : caseFiles(rec)).then(function (fl) {
      files = fl;
      return root.getDirectoryHandle(parts[0], { create: true });
    }).then(function (y) { return y.getDirectoryHandle(parts[1], { create: true }); }).then(function (dir) {
      return files.reduce(function (pr, f) {
        return pr.then(function () { return dir.getFileHandle(f.name, { create: true }); }).then(function (fh) { return fh.createWritable(); })
          .then(function (w) { return w.write(f.blob || f.text).then(function () { return w.close(); }); });
      }, Promise.resolve());
    }).then(function () { return (root.name ? root.name + '／' : '') + parts.join('／'); });
  }
  /* 產生 PDF 時顯示進度（無法關閉，完成後自動收起） */
  function makePdfs(rec) {
    var bar = h('div', { class: 'pbar' }, [h('i')]), msg = h('p', { style: 'margin:0 0 10px', text: isAA(rec) ? '正在產生 AA01 PDF，請稍候…' : '正在產生 PDF（訪視評估表、計畫內容），請稍候…' });
    var ov = h('div', { class: 'overlay busy' }, [h('div', { class: 'dialog', style: 'width:min(420px,100%)' }, [h('div', { style: 'padding:22px' }, [msg, bar])])]);
    document.body.appendChild(ov);
    return caseFiles(rec, function (x) { bar.firstChild.style.width = Math.round(x * 100) + '%'; })
      .then(function (files) { ov.remove(); return files; }, function (e) { ov.remove(); throw e; });
  }
  /* 「存檔」按鈕：有設定資料夾就自動分到年度／月份；否則下載（iPad 走分享選單） */
  function saveCase(rec) {
    rec = rec || S.rec; if (rec === S.rec) saveNow();
    function failed(e) { UI.toast('PDF 產生失敗：' + ((e && e.message) || '請再試一次')); }
    /* 下載或分享：iPad／iPhone 的分享選單必須由使用者再點一次才能打開，所以產生完先跳出「分享」按鈕 */
    function fallback(msg) {
      makePdfs(rec).then(function (files) {
        if (UI.canShareFiles(files)) {
          UI.dialog('PDF 已產生', h('div', null, [h('p', { style: 'margin-top:0', text: '已產生「' + files.map(function (f) { return f.name; }).join('」「') + '」。' }),
            h('p', { class: 'help', text: '按「分享／儲存」後，在分享選單選「儲存到檔案」，放到 ' + folderParts(rec).join('／') + '。' })]),
            [{ label: '取消' }, { label: '分享／儲存', pri: true, on: function () { UI.deliverFiles(files, msg); } }]);
        } else UI.deliverFiles(files, msg);
      }, failed);
    }
    if (!FS.ok) { fallback(UI.isIOS ? '請在分享選單選「儲存到檔案」，放到 ' + folderParts(rec).join('／') : (isAA(rec) ? '已下載 PDF，請放到 ' : '已下載兩個 PDF，請放到 ') + folderParts(rec).join('／') + ' 資料夾'); return; }
    if (!FS.handle) {
      UI.dialog('還沒有設定存檔資料夾', h('div', null, [
        h('p', { style: 'margin-top:0', text: '選一次存檔資料夾（建議選「照顧計畫產生器」裡的「個案存檔」），之後按「存檔」就會自動依訪視日期放進「' + folderParts(rec).join('／') + '」這類年度、月份資料夾。' }),
        h('p', { class: 'help', text: '瀏覽器會詢問是否允許編輯該資料夾，請選允許。' })]),
        [{ label: '這次先下載', on: function () { fallback(); } }, { label: '選擇存檔資料夾', pri: true, on: function () { chooseFolder().then(function () { saveCase(rec); }, function () { }); } }]);
      return;
    }
    ensurePerm(FS.handle).then(function (ok) {
      if (!ok) { fallback('沒有取得資料夾權限，已改為下載'); return; }
      return makePdfs(rec).then(function (files) {
        return writeToFolder(FS.handle, rec, files).then(function (where) { UI.toast('已存入 ' + where + (isAA(rec) ? '' : '（兩個 PDF）')); }, function () { UI.deliverFiles(files, '無法寫入資料夾，已改為下載'); });
      }, failed);
    }).catch(function () { fallback('無法寫入資料夾，已改為下載'); });
  }
  function importRec(obj) {
    var rec = obj && obj.app === 'care-plan-generator' ? obj.rec : null;
    if (!rec || !rec.f) { UI.toast('這個檔案不是本程式存出的檔案'); return; }
    rec = normalize(rec);
    var dup = S.idx.some(function (x) { return x.id === rec.id; });
    function go() { openRec(rec); saveNow(); UI.toast('已匯入個案'); }
    if (dup) UI.dialog('清單裡已有這位個案的這次紀錄', h('p', { style: 'margin:0', text: '要用檔案內容覆蓋清單裡的紀錄，還是另存成一筆新的？' }),
      [{ label: '另存一筆', on: function () { rec.id = UI.uid(); go(); } }, { label: '覆蓋', pri: true, on: go }]);
    else go();
  }

  /* ---------- 變動後更新 ---------- */
  function changed() {
    S.rec.updatedAt = Date.now();
    refreshConds(); S.hooks.forEach(function (fn) { fn(); });
    refreshDraft(); refreshRail(); refreshTop(); scheduleSave();
  }
  function refreshConds() { S.conds.forEach(function (c) { c.el.hidden = !c.fn(c.obj); }); }
  function isDone(id) {
    var f = S.rec.f;
    switch (id) {
      case 'basic': case 'aBasic': return !!(nz(f.name) && nz(f.visitDate) && nz(f.cmName));
      case 'aStatus': return !!NAR.aaStatus(f);
      case 'aCarer': return !!NAR.aaCarer(f);
      case 'aSvc': return !!NAR.aaSvc(f);
      case 'aNote': return !!NAR.aaNote(f);
      case 'phys': return NAR.phys(f).length > 0;
      case 'psych': return !!NAR.psych(f);
      case 'family': return NAR.family(f).length > 0;
      case 'home': return !!NAR.home(f);
      case 'routine': return !!NAR.routine(f);
      case 'svc': return !!nz(f.svcStatus);
      case 'problems': return arr(f.problems).length > 0;
      case 'plan': return NAR.summary(f).any || arr(f.careFlags).length > 0;
      case 'goals': return !!NAR.goals(f).short;
    }
    return false;
  }
  function refreshRail() {
    if (!E.rail) return;
    Array.prototype.forEach.call(E.rail.querySelectorAll('a[data-sec]'), function (a) {
      var id = a.getAttribute('data-sec');
      a.classList.toggle('done', isDone(id));
      a.setAttribute('aria-current', id === S.sec ? 'true' : 'false');
    });
  }
  function refreshTop() {
    if (!E.info) return;
    var f = S.rec.f; clear(E.info);
    E.info.appendChild(h('b', { text: nz(f.name) || '（未填姓名）' }));
    var bits = [];
    if (isUpd()) bits.push('計畫更新／異動');
    if (isAA()) bits.push('AA01');
    if (NAR.rocLong(f.visitDate)) bits.push((isUpd() ? '' : '訪視 ') + NAR.rocLong(f.visitDate));
    if (f.cms) bits.push('CMS 第' + f.cms + '級');
    E.info.appendChild(document.createTextNode(bits.join('　')));
  }
  function draftText(id) {
    var f = S.rec.f, st = S.st, t, a;
    if (isAA()) switch (id) {
      case 'aBasic': return NAR.s1(f, st);
      case 'aStatus': t = NAR.aaStatus(f); return t ? '1、 個案概況：' + t : '';
      case 'aCarer': t = NAR.aaCarer(f); return t ? '2、 照顧者照顧狀況：' + t : '';
      case 'aSvc': t = NAR.aaSvc(f); return t ? '3、 服務使用狀況：' + t : '';
      case 'problems': a = NAR.aaProblems(f); return a.length ? '參、' + st.headGap + '照顧問題：\n' + a.join('\n') : '';
      case 'plan': return NAR.aaPlan(f, st);
      case 'goals': return NAR.goals(f).short ? '肆、' + st.headGap + '照顧計畫目標：\n' + NAR.aaGoalLines(f).join('\n') : '';
      case 'aNote': return NAR.aaNote(f);
      case 'output': return null;
    }
    switch (id) {
      case 'basic': return NAR.s1(f, st);
      case 'phys': a = NAR.phys(f); return a.length ? '1、 生理面向：\n' + a.join('\n') : '';
      case 'psych': t = NAR.psych(f); return t ? '2、 心理面向：' + t : '';
      case 'family': a = NAR.family(f); return a.length ? '3、 家庭狀況：' + a.join('\n') : '';
      case 'home': t = NAR.home(f); return t ? '4、 居家環境：' + t : '';
      case 'routine': t = NAR.routine(f); return t ? '5、 生活作息：' + t : '';
      case 'svc': t = NAR.svc(f); return t ? '6、 服務使用狀況：' + t : '';
      case 'problems': a = NAR.problems(f); return a.length ? '參、' + st.headGap + '照顧問題：\n' + a.join('\n') : '';
      case 'plan': return NAR.plan(f, st);
      case 'goals': var g = NAR.goals(f); return g.short ? '肆、' + st.headGap + '照顧計畫目標：\n1、短期目標：' + g.short + '\n2、中期目標：' + g.mid + '\n3、長期目標：' + g.long : '';
    }
    return null;
  }
  function refreshDraft() {
    if (!E.draft) return;
    var t = draftText(S.sec);
    E.draft.hidden = t === null;
    E.layout.classList.toggle('nodraft', t === null);
    if (t === null) return;
    var empty = !t;
    E.dbody.textContent = empty ? '在左邊點選後，這裡會即時寫出這一段的計畫文字。' : t;
    E.dbody.classList.toggle('empty', empty);
    E.dpeek.textContent = empty ? '尚未填寫' : t.replace(/\n/g, ' ');
    if (S.lastDraft !== null && S.lastDraft !== t && !empty) { E.dbody.classList.remove('flash'); void E.dbody.offsetWidth; E.dbody.classList.add('flash'); }
    S.lastDraft = t;
  }

  /* ============================================================
     首頁（個案清單）
     ============================================================ */
  function renderHome() {
    S.rec = null; E = {};
    var app = clear(document.getElementById('app'));
    var list = h('div', { class: 'caselist' });
    if (!S.idx.length) list.appendChild(h('div', { class: 'emptynote', text: '這台裝置還沒有個案。按上方兩個按鈕開始，或用「匯入存檔」打開之前存的檔案。' }));
    S.idx.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).forEach(function (m) {
      var d = new Date(m.updatedAt || 0), upd = m.kind === 'update', aa = m.kind === 'aa01';
      list.appendChild(h('div', { class: 'crow' }, [
        h('div', null, [h('div', { class: 'cname' }, [m.name, h('span', { class: 'kindtag' + (upd ? ' upd' : aa ? ' aa' : ''), text: upd ? '更新／異動' : aa ? 'AA01' : '撰寫計畫' })]),
          h('div', { class: 'cmeta', text: (NAR.rocLong(m.date) ? (upd ? '日期 ' : '訪視日 ') + NAR.rocLong(m.date) + '　' : '') + '最後修改 ' + d.toLocaleString('zh-TW', { hour12: false }) })]),
        h('div', { class: 'cacts' }, [
          h('button', { type: 'button', class: 'btn pri sm', text: '開啟', onclick: function () { var r = store.get(K.rec + m.id); if (r) openRec(normalize(r)); else UI.toast('找不到這筆資料'); } }),
          upd ? null : h('button', { type: 'button', class: 'btn sm', text: '建立AA01', title: '帶入這位個案的姓名、在場人員、照顧問題與服務規劃，建立一筆新的 AA01', onclick: function () { var r = store.get(K.rec + m.id); if (r) cloneForAA(normalize(r)); } }),
          upd || aa ? null : h('button', { type: 'button', class: 'btn sm', text: '複製為複評', title: '帶入這次的內容，建立一筆新的複評紀錄', onclick: function () { var r = store.get(K.rec + m.id); if (r) cloneForReview(normalize(r)); } }),
          h('button', { type: 'button', class: 'btn sm', text: '存檔', onclick: function () { var r = store.get(K.rec + m.id); if (r) saveCase(normalize(r)); } }),
          h('button', { type: 'button', class: 'btn sm danger', text: '刪除', onclick: function () {
            UI.confirmBox('刪除個案', CLOUDON ? '確定刪除「' + m.name + '」嗎？雲端與你所有裝置上的這筆資料都會刪除，無法復原。' : '確定刪除「' + m.name + '」在這台裝置上的資料嗎？刪除後無法復原。', '刪除', function () { store.del(K.rec + m.id); S.idx = S.idx.filter(function (x) { return x.id !== m.id; }); store.set(K.idx, S.idx); renderHome(); }, true);
          } })
        ])
      ]));
    });
    app.appendChild(h('div', { class: 'homewrap' }, [
      h('div', { class: 'hero' }, [h('span', { class: 'mark', 'aria-hidden': 'true' }), h('div', null, [h('h1', { text: '照顧計畫產生器' }), h('div', { class: 'org', text: ORG })])]),
      h('p', { class: 'lead', text: '家訪時在手機、平板或電腦上點選評估表，程式會同步寫出可貼進衛福部照顧管理系統（CMS）的「計畫目標」與「計畫執行規劃」。' }),
      h('div', { class: 'modes' }, [
        h('button', { type: 'button', class: 'mode', onclick: function () { openRec(newRecord()); } }, [h('b', { text: '撰寫計畫' }), h('span', { text: '初評、出備初評、複評：依訪視評估表從頭寫出完整的計畫目標與計畫執行規劃' })]),
        h('button', { type: 'button', class: 'mode', onclick: function () { openRec(newAA()); } }, [h('b', { text: 'AA01' }), h('span', { text: '舊計畫保留、新內容疊在 CMS 最上方。也可以在下方個案清單按「建立AA01」帶入舊資料' })])
      ]),
      h('div', { class: 'homeacts' }, [
        S.sess ? h('span', { class: 'whoami' }, ['目前登入', h('b', { text: S.sess.name }), '（' + S.sess.u + '）', CLOUDON ? syncBadge() : null]) : null,
        h('button', { type: 'button', class: 'btn', text: '匯入存檔', title: '打開之前存的 PDF（訪視評估表、計畫內容、計畫更新異動）或舊版 html 檔', onclick: function () { UI.pickFile(importRec); } }),
        h('button', { type: 'button', class: 'btn', text: '設定', onclick: openSettings }),
        h('button', { type: 'button', class: 'btn', text: '使用說明', onclick: openHelp }),
        S.sess ? h('button', { type: 'button', class: 'btn', text: '登出', onclick: askLogout }) : null
      ]),
      list,
      h('div', { class: 'privacy' }, [h('b', { text: '個資提醒　' }), CLOUDON
        ? '個案資料在這台裝置上加密後，才同步到雲端（Google Firebase 台灣機房），只有用你的帳號密碼才能解開，其他同仁與雲端業者都看不到內容。沒有網路時照常使用，連線後自動同步。與他人共用裝置時，用完請按「登出」。'
        : '本程式完全離線，不會把任何資料傳到網路。個案資料只存在這台裝置的瀏覽器裡；與他人共用裝置時，請在完成後按「存檔」並刪除清單中的資料。',
        !store.ok ? h('div', { style: 'margin-top:6px;font-weight:600', text: '目前這個瀏覽器無法自動儲存，關閉前請務必按「存檔」保存。' }) : null]),
      h('p', { class: 'copyright', text: COPYRIGHT })
    ]));
    window.scrollTo(0, 0);
  }
  /* 登出：先存好目前編輯的內容；個案留在這台裝置，同一帳號再登入就看得到 */
  function askLogout() {
    if (S.rec) saveNow();
    if (CLOUDON) {
      UI.confirmBox('登出', '要登出「' + S.sess.name + '」嗎？個案已加密同步到雲端，下次在任何裝置用同一個帳號登入就會看到。' + (CLOUD.pending() ? '（目前有修改尚未上傳，連上網路後會自動完成）' : ''), '登出', function () {
        AUTH.logout();
        Promise.race([CLOUD.logout(), new Promise(function (r) { setTimeout(r, 4000); })]).then(function () { location.reload(); });
      });
      return;
    }
    UI.confirmBox('登出', '要登出「' + S.sess.name + '」嗎？目前內容已自動儲存，這台裝置上的個案會保留，下次用同一個帳號登入就會看到。', '登出', function () { AUTH.logout(); location.reload(); });
  }
  function cloneForReview(rec) {
    var n = JSON.parse(JSON.stringify(rec));
    n.id = UI.uid(); n.createdAt = n.updatedAt = Date.now(); n.changes = []; n.draftChange = null;
    /* 保留前次內容供比對（不含手繪圖與已產出的文字，避免檔案過大） */
    var pf = JSON.parse(JSON.stringify(rec.f)); delete pf.genogram; delete pf.outGoal; delete pf.outPlan;
    n.prev = { date: rec.f.visitDate || '', f: pf };
    delete n.f.rvPlan;
    n.f.visitDate = today(); n.f.visitType = '複評'; n.f.svcStatus = '使用服務中個案';
    delete n.f.outGoal; delete n.f.outPlan; n.f.outGoalEdited = false; n.f.outPlanEdited = false;
    openRec(n); saveNow(); UI.toast('已帶入上次內容，請修改有變動的地方');
  }

  /* ============================================================
     編輯畫面
     ============================================================ */
  function openRec(rec) {
    S.rec = rec;
    if (rec.kind === 'update') { S.sec = 'update'; renderUpdate(); return; }
    SECS = rec.kind === 'aa01' ? SCHEMA.aaSections : SCHEMA.sections; GROUPS = rec.kind === 'aa01' ? AA_GROUPS : PLAN_GROUPS;
    S.sec = SECS[0].id; renderEditor();
  }
  /* 設定變更後重畫目前畫面 */
  function rerender() { if (!S.rec) return; if (isUpd()) renderUpdate(); else showSection(S.sec); }
  function topBar(app) {
    E.info = h('div', { class: 'caseinfo' });
    E.save = h('div', { class: 'savestate' });
    function goHome() { saveNow(); S.idx = CLOUDON ? buildIdx() : (store.get(K.idx) || S.idx); renderHome(); }
    app.appendChild(h('header', { class: 'top' }, [
      h('div', { class: 'brand home', role: 'button', tabindex: '0', title: '返回首頁', onclick: goHome, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } } },
        [h('span', { class: 'mark', 'aria-hidden': 'true' }), h('span', { class: 'bt' }, [h('b', { text: '照顧計畫產生器' }), h('small', { text: ORG })])]), E.info, E.save,
      h('div', { class: 'acts' }, [
        h('button', { type: 'button', class: 'btn sm', text: '‹ 返回首頁', title: '回到首頁（個案清單），目前內容會先自動儲存', onclick: goHome }),
        h('button', { type: 'button', class: 'btn sm pri', text: '存檔', title: isAA() ? '存出「AA01」PDF' : isUpd() ? '存出「計畫更新異動」與「計畫更新異動內容」兩個 PDF' : '存出「訪視評估表」與「計畫內容」兩個 PDF', onclick: function () { saveCase(); } }),
        h('button', { type: 'button', class: 'btn sm', text: isUpd() || isAA() ? '列印' : '列印評估表', onclick: printForm }),
        h('button', { type: 'button', class: 'btn sm', text: '設定', onclick: openSettings }),
        S.sess ? h('button', { type: 'button', class: 'btn sm', text: '登出', title: '登出 ' + S.sess.name + '（' + S.sess.u + '）', onclick: askLogout }) : null
      ])
    ]));
    /* 頂列高度會因螢幕寬度換行而改變（手機上兩排）：把實際高度給分頁列、草稿欄當黏貼位置，避免被頂列蓋住 */
    var top = app.lastChild;
    function syncTopH() { document.documentElement.style.setProperty('--toph', Math.round(top.getBoundingClientRect().height) + 'px'); }
    if (window.ResizeObserver) { if (S.topRO) S.topRO.disconnect(); S.topRO = new ResizeObserver(syncTopH); S.topRO.observe(top); }
    setTimeout(syncTopH, 0);
  }
  function renderEditor() {
    var app = clear(document.getElementById('app')); E = {};
    topBar(app);
    E.rail = h('nav', { class: 'rail', 'aria-label': '評估表分頁' });
    GROUPS.forEach(function (g) {
      E.rail.appendChild(h('div', { class: 'grp' }, [h('span', { class: 'sealno' + (g[0].length > 1 ? ' wide' : ''), text: g[0] }), h('span', { class: 'grpname', text: g[1] })]));
      SECS.filter(function (s) { return s.group === g[0]; }).forEach(function (s) {
        E.rail.appendChild(h('a', { href: '#', 'data-sec': s.id, onclick: function (e) { e.preventDefault(); showSection(s.id); } }, [h('span', { class: 'dot' }), s.nav]));
      });
    });
    E.pane = h('main', { class: 'pane' });
    E.dbody = h('div', { class: 'draftbody' });
    E.dpeek = h('span', { class: 'peek' });
    E.draft = h('aside', { class: 'draft', 'aria-label': '本段草稿' }, [
      h('button', { type: 'button', class: 'drafttoggle', onclick: function () { S.draftOpen = !S.draftOpen; E.draft.classList.toggle('open', S.draftOpen); } }, ['本段草稿', E.dpeek, h('span', { text: '展開／收合' })]),
      h('div', { class: 'dwrap' }, [
        h('h2', { text: '本段草稿' }),
        h('div', { class: 'sub', text: '依左邊的點選即時產生，最後會合併成 CMS 的兩個欄位。' }),
        E.dbody,
        h('div', { class: 'dacts' }, [h('button', { type: 'button', class: 'btn sm', text: '複製這一段', onclick: function () { var t = draftText(S.sec); if (t) UI.copyText(t, '已複製這一段'); } })])
      ])
    ]);
    E.layout = h('div', { class: 'layout' }, [E.rail, E.pane, E.draft]);
    app.appendChild(E.layout);
    setSaveState('saved'); refreshTop(); showSection(S.sec);
  }
  /* 跳到指定分頁的指定欄位，並短暫標示 */
  function jumpTo(sec, fid) {
    if (sec !== S.sec) showSection(sec);
    setTimeout(function () {
      var el = fid ? E.pane.querySelector('[data-fid="' + fid + '"]') : null;
      if (!el) { window.scrollTo(0, 0); return; }
      for (var p = el.parentElement; p && p !== E.pane; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
      el.scrollIntoView({ block: 'center' });
      el.classList.remove('attn'); void el.offsetWidth; el.classList.add('attn');
      var t = el.querySelector('input, textarea, select, button'); if (t) try { t.focus({ preventScroll: true }); } catch (e) { }
      setTimeout(function () { el.classList.remove('attn'); }, 2600);
    }, 60);
  }
  function secIndex(id) { for (var i = 0; i < SECS.length; i++) if (SECS[i].id === id) return i; return 0; }
  function showSection(id) {
    S.sec = id; S.conds = []; S.hooks = []; ctx.conds = S.conds; S.lastDraft = null;
    var sec = SECS[secIndex(id)], f = S.rec.f, pane = clear(E.pane);
    pane.appendChild(h('div', { class: 'sechead' }, [h('h1', { text: sec.title })]));
    if (sec.custom) CUSTOM[sec.custom](pane, f);
    else sec.rows.forEach(function (row) { pane.appendChild(buildRow(row, f)); });
    if (CUSTOM[sec.id + 'After']) CUSTOM[sec.id + 'After'](pane, f);
    var i = secIndex(id), nav = h('div', { class: 'stepnav' });
    nav.appendChild(i > 0 ? h('button', { type: 'button', class: 'btn', text: '上一頁：' + SECS[i - 1].nav, onclick: function () { showSection(SECS[i - 1].id); } }) : h('span'));
    if (i < SECS.length - 1) nav.appendChild(h('button', { type: 'button', class: 'btn pri', text: '下一頁：' + SECS[i + 1].nav, onclick: function () { showSection(SECS[i + 1].id); } }));
    pane.appendChild(nav);
    refreshConds(); refreshDraft(); refreshRail();
    window.scrollTo(0, 0);
    var cur = E.rail.querySelector('a[aria-current="true"]'); if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { }
  }
  function buildRow(row, f) {
    /* 所有欄位全部展開（115.11 起取消「更多選填」收合） */
    var fieldsEl = h('div', { class: 'fields' });
    row.fields.forEach(function (fd) { fieldsEl.appendChild(UI.field(fd, f, ctx)); });
    var el = h('div', { class: 'row' }, [h('div', { class: 'rlabel' }, [row.label, row.hint ? h('small', { text: row.hint }) : null]), fieldsEl]);
    if (row.showIf) S.conds.push({ el: el, fn: row.showIf, obj: f });
    return el;
  }
  function block(title, kids, extra) { return h('section', { class: 'block' }, [h('h3', null, [title].concat(extra || []))].concat(kids)); }

  /* ============================================================
     參、照顧問題
     ============================================================ */
  var CUSTOM = {};
  CUSTOM.problems = function (pane, f) {
    var causeInp = UI.textInput({ id: 'probCause', type: 'text', w: '16em', ph: '如：下肢無力', label: '主要失能原因' }, f, ctx);
    var sug = h('span', { class: 'help' });
    function setCause(v) { f.probCause = v; var i = causeInp.tagName === 'INPUT' ? causeInp : causeInp.querySelector('input'); i.value = v; changed(); }
    var quick = h('div', { class: 'chips compact' });
    ['下肢無力', '四肢無力', '視力影響', '失智症影響', '長期臥床', '體況虛弱'].forEach(function (c) { quick.appendChild(h('button', { type: 'button', class: 'chip', text: c, onclick: function () { setCause(c); } })); });
    var aa = isAA();
    if (!aa) pane.appendChild(block('主要失能原因', [
      h('p', { class: 'tip', text: '會用在問題說明的開頭，例如「個案下肢無力，無法自行外出」。之後勾選的問題會自動帶入這個原因。' }),
      h('div', { class: 'inline' }, [causeInp, quick]), sug]));

    var grid = h('div', { class: 'probgrid', role: 'group', 'aria-label': '照顧問題清單', 'data-fid': 'probgrid' }), btns = {};
    var prev = aa ? prevProblemsOf(S.rec) : null, prevNos = prev ? prev.list.map(function (x) { return x.no; }) : [];
    var prevNote = h('p', { class: 'prevnote' });
    function selected(no) { return arr(f.problems).some(function (p) { return p.no === no; }); }
    DATA.problems.forEach(function (p) {
      var b = h('button', { type: 'button', class: 'chip', role: 'checkbox', onclick: function () {
        if (selected(p.no)) f.problems = f.problems.filter(function (x) { return x.no !== p.no; });
        else f.problems.push({ no: p.no, name: p.name, desc: aa ? '' : NAR.problemDefault(p.no, f) });
        drawSel(); changed();
      } }, [h('span', { class: 'no', text: p.no + '.' }), p.name]);
      btns[p.no] = b; grid.appendChild(b);
    });
    var custName = h('input', { class: 'inp', type: 'text', style: 'width:14em', placeholder: '自訂問題名稱', 'aria-label': '自訂問題名稱' });
    pane.appendChild(block('勾選照顧問題', [
      h('p', { class: 'tip', text: aa ? '依 CMS 問題清單勾選，排序前 5 項；下方逐項簡要描述問題改善情形，例如「行走問題：使用助行器可安全行走。」' : '請依 CMS 上照專核定的照顧問題清單勾選。底部有橘色標記的項目，是依前面評估內容判斷可能相關的問題，僅供提醒。第 34 項「其他問題」用於未列在前 33 項的特殊狀況。' }),
      aa ? prevNote : null,
      grid,
      h('div', { class: 'inline', style: 'margin-top:12px' }, [custName, h('button', { type: 'button', class: 'btn sm', text: '加入自訂問題', onclick: function () {
        var n = nz(custName.value); if (!n) return; f.problems.push({ no: 'c' + UI.uid(), name: n, desc: '' }); custName.value = ''; drawSel(); changed(); } })])
    ]));

    var selBox = h('div', { class: 'selprob' }), cnt = h('span', { class: 'cnt' });
    function drawSel() {
      clear(selBox);
      var ps = arr(f.problems);
      cnt.textContent = '已選 ' + ps.length + ' 項，依此順序編號' + (aa && ps.length > 5 ? '（AA01 只需前 5 項）' : '');
      cnt.classList.toggle('over', aa && ps.length > 5);
      if (!ps.length) selBox.appendChild(h('div', { class: 'help', text: '尚未勾選。' }));
      ps.forEach(function (p, i) {
        var ta = h('textarea', { class: 'inp', rows: 2, 'aria-label': p.name + (aa ? ' 改善情形' : ' 說明'), placeholder: aa ? '簡要描述問題改善情形，如：使用助行器可安全行走' : '', oninput: function () { p.desc = ta.value; UI.autoGrow(ta); changed(); } }); ta.value = nz(p.desc);
        setTimeout(function () { UI.autoGrow(ta); }, 0);
        selBox.appendChild(h('div', { class: 'pitem', 'data-fid': 'prob-' + p.no }, [
          h('div', { class: 'pname', text: (i + 1) + '、' + p.name + '：' }), ta,
          h('div', { class: 'pacts' }, [
            i > 0 ? h('button', { type: 'button', class: 'iconbtn', 'aria-label': '上移', text: '↑', onclick: function () { ps.splice(i - 1, 0, ps.splice(i, 1)[0]); drawSel(); changed(); } }) : null,
            i < ps.length - 1 ? h('button', { type: 'button', class: 'iconbtn', 'aria-label': '下移', text: '↓', onclick: function () { ps.splice(i + 1, 0, ps.splice(i, 1)[0]); drawSel(); changed(); } }) : null,
            typeof p.no === 'number' && !aa ? h('button', { type: 'button', class: 'iconbtn', title: '用目前的失能原因重新帶入建議文字', text: '重帶', onclick: function () { p.desc = NAR.problemDefault(p.no, f); drawSel(); changed(); } }) : null,
            h('button', { type: 'button', class: 'iconbtn', text: '移除', onclick: function () { f.problems = f.problems.filter(function (x) { return x !== p; }); drawSel(); changed(); } })
          ])
        ]));
      });
    }
    pane.appendChild(block(aa ? '問題改善情形' : '問題說明', [selBox], [cnt]));
    if (aa) pane.appendChild(block('自由填寫（選填）', [UI.field({ id: 'aaProbFree', type: 'textarea', rows: 2, label: '補充', ph: '會接在照顧問題清單後面' }, f, ctx)]));
    function sync() {
      var hint = aa ? {} : NAR.suggestProblems(f), sc = aa ? '' : NAR.suggestCause(f);
      DATA.problems.forEach(function (p) {
        var was = prevNos.indexOf(p.no) >= 0;
        btns[p.no].setAttribute('aria-checked', selected(p.no) ? 'true' : 'false');
        btns[p.no].classList.toggle('hint', !!hint[p.no] && !selected(p.no));
        btns[p.no].classList.toggle('prev', was && !selected(p.no));
        btns[p.no].title = was ? '前次撰寫計畫勾選的問題' : hint[p.no] ? '依評估內容可能相關' : '';
      });
      if (aa) {
        var extra = prev ? prev.list.filter(function (x) { return typeof x.no !== 'number'; }).map(function (x) { return x.name; }) : [];
        prevNote.textContent = prev && prev.list.length ? '淡藍底色＝前次撰寫計畫' + (prev.src && NAR.rocLong(prev.src.date) ? '（' + NAR.rocLong(prev.src.date) + '）' : '') + '勾選的問題，請依這次狀況重新勾選並排序。' + (extra.length ? '前次另有自訂問題：' + extra.join('、') + '。' : '')
          : '從首頁個案清單按「建立AA01」，或填好個案姓名，這裡會用底色標出前次撰寫計畫勾選的問題。';
      }
      clear(sug);
      if (sc && sc !== nz(f.probCause)) { sug.appendChild(document.createTextNode('依評估內容建議：')); sug.appendChild(h('button', { type: 'button', class: 'btn ghost sm', text: '帶入「' + sc + '」', onclick: function () { setCause(sc); } })); }
    }
    S.hooks.push(sync); drawSel(); sync();
  };

  /* ============================================================
     肆、服務規劃（計畫執行規劃）
     ============================================================ */
  function catItems(cat) {
    var groups = DATA.catalog[cat].map(function (g) { return { group: g.group, items: g.items.slice() }; });
    var cust = arr(S.st.customItems).filter(function (c) { return c.cat === cat && nz(c.code); });
    if (cust.length) groups.push({ group: '自訂項目（設定中新增）', items: cust.map(function (c) { return { code: c.code, name: c.name, src: 'user' }; }) });
    return groups;
  }
  function openPicker(cat, key, title, onDone) {
    var f = S.rec.f, body = h('div'), q = h('input', { class: 'inp', type: 'search', placeholder: '輸入代碼或名稱篩選，如 BA07、沐浴', 'aria-label': '篩選服務項目' });
    var listEl = h('div');
    function inPlan(code) { return arr(f[key]).some(function (l) { return l.code === code; }); }
    function draw() {
      clear(listEl);
      var kw = nz(q.value).toLowerCase(), lvType = f.cms ? +f.cms - 1 : 0;
      catItems(cat).forEach(function (g) {
        var items = g.items.filter(function (it) { return !kw || (it.code + it.name).toLowerCase().indexOf(kw) >= 0; });
        if (!items.length) return;
        listEl.appendChild(h('div', { class: 'pickgrp', text: g.group }));
        var grid = h('div', { class: 'pickgrid' });
        items.forEach(function (it) {
          var b = h('button', { type: 'button', class: 'chip' + (it.dayType && it.dayType === lvType ? ' hint' : ''), role: 'checkbox', 'aria-checked': inPlan(it.code) ? 'true' : 'false',
            title: it.dayType && it.dayType === lvType ? '對應 CMS 第' + f.cms + '級' : '', onclick: function () {
              if (inPlan(it.code)) f[key] = f[key].filter(function (l) { return l.code !== it.code; });
              else f[key].push(newLine(cat, it.code, it.name));
              b.setAttribute('aria-checked', inPlan(it.code) ? 'true' : 'false'); changed();
            } }, h('span', { class: 'pick' }, [h('b', { text: it.code }), h('span', null, [it.name, (it.src === 'ref' || it.src === 'web') ? h('span', { class: 'check', text: '請核對' }) : null])]));
          grid.appendChild(b);
        });
        listEl.appendChild(grid);
      });
      if (!listEl.firstChild) listEl.appendChild(h('p', { class: 'help', text: '沒有符合的項目，可以用下方「自訂項目」加入。' }));
    }
    q.addEventListener('input', draw);
    var cc = h('input', { class: 'inp', type: 'text', style: 'width:8em', placeholder: '代碼', 'aria-label': '自訂代碼' }), cn = h('input', { class: 'inp', type: 'text', style: 'width:18em', placeholder: '項目名稱', 'aria-label': '自訂項目名稱' });
    body.appendChild(q);
    if (cat === 'care' && f.cms) body.appendChild(h('p', { class: 'help', text: '日照與家托依 CMS 第' + f.cms + '級對應第' + (+f.cms - 1) + '型，已用橘色標記（請核對）。' }));
    body.appendChild(listEl);
    body.appendChild(h('div', { class: 'pickgrp', text: '自訂項目（清單中沒有時使用）' }));
    body.appendChild(h('div', { class: 'inline' }, [cc, cn, h('button', { type: 'button', class: 'btn sm', text: '加入', onclick: function () {
      if (!nz(cc.value) && !nz(cn.value)) return; f[key].push(newLine(cat, nz(cc.value), nz(cn.value))); cc.value = ''; cn.value = ''; changed(); UI.toast('已加入'); } })]));
    draw();
    UI.dialog(title, body, [{ label: '完成', pri: true, on: function () { onDone(); } }]);
    setTimeout(function () { q.focus(); }, 50);
  }
  function newLine(cat, code, name) {
    var l = { id: UI.uid(), code: code, name: name, note: '' };
    if (cat === 'care' || cat === 'other') { l.mode = /^BA14/.test(code) ? 'spare' : 'week'; l.n = ''; l.days = []; l.each = '1'; }
    if (cat === 'respite' || cat === 'short') l.units = '';
    if (isUpd()) { l.act = '新增'; l.from = ''; }
    return l;
  }
  /* 更新／異動：每一行標「新增／調整／維持／取消」，調整時填原本的單位數 */
  function actChips(l, redraw) {
    var box = h('div', { class: 'chips compact acts4', role: 'radiogroup', 'aria-label': '這次的變動' });
    NAR.UP_ACTS.forEach(function (a) {
      box.appendChild(h('button', { type: 'button', class: 'chip act-' + a, role: 'radio', 'aria-checked': NAR.upAct(l) === a ? 'true' : 'false', text: a, onclick: function () { l.act = a; redraw(); changed(); } }));
    });
    return miniFld('這次的變動', box);
  }
  function lineHead(l, key, redraw) {
    var evTag = null;
    if (key === 'pAids') { var e = AIDS_EVAL[String(l.code).replace(/-\d$/, '')]; evTag = e === 'free' ? h('span', { class: 'autotag', text: '免評估' }) : e === 'need' ? h('span', { class: 'check', text: '需評估' }) : null; }
    return h('div', { class: 'shead' }, [h('span', { class: 'scode', text: l.code }), h('span', { class: 'sname', text: l.name }), evTag,
      h('button', { type: 'button', class: 'iconbtn', style: 'margin-left:auto', text: '移除', onclick: function () { var f = S.rec.f; f[key] = f[key].filter(function (x) { return x !== l; }); redraw(); changed(); } })]);
  }
  function miniFld(label, el) { return h('div', { class: 'fld' }, [h('div', { class: 'fl', text: label }), el]); }
  function careLine(l, key, redraw) {
    var box = h('div', { class: 'sline', 'data-fid': 'line-' + l.id }), prev = h('div', { class: 'sprev' });
    function draw() {
      clear(box); box.appendChild(lineHead(l, key, redraw));
      var body = h('div', { class: 'sbody' });
      var lc = { changed: function () { draw(); changed(); }, conds: [] }, lc2 = { changed: function () { upd(); changed(); }, conds: [] };
      if (isUpd()) {
        body.appendChild(actChips(l, draw));
        if (NAR.upAct(l) === '取消') { box.appendChild(body); box.appendChild(prev); prev.textContent = NAR.upLineText(l, 'care', S.st); return; }
        if (NAR.upAct(l) === '調整') body.appendChild(miniFld('原本每月單位數', UI.textInput({ id: 'from', type: 'text', w: '6em', ph: '如：14', aria: '原本每月單位數', inputmode: 'decimal' }, l, lc2)));
      }
      if (l.mode === 'daily') { l.mode = 'week'; l.n = 7; }   /* 舊資料「每日」＝每週 7 天，產出文字相同 */
      var modes = [['week', '每週固定天數'], ['days', '指定星期'], ['spare', '需要時使用'], ['grid', '週間排程表']];
      var mbox = h('div', { class: 'chips compact', role: 'radiogroup', 'aria-label': '頻率' });
      modes.forEach(function (m) { mbox.appendChild(h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': l.mode === m[0] ? 'true' : 'false', text: m[1], onclick: function () { l.mode = m[0]; draw(); changed(); } })); });
      body.appendChild(miniFld('頻率', mbox));
      if (l.mode === 'week') {
        var nb = h('div', { class: 'chips compact', role: 'radiogroup', 'aria-label': '每週天數' });
        [1, 2, 3, 4, 5, 6, 7].forEach(function (n) { nb.appendChild(h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': +l.n === n ? 'true' : 'false', text: String(n), onclick: function () { l.n = n; draw(); changed(); } })); });
        body.appendChild(miniFld('每週幾天', nb));
      }
      if (l.mode === 'days') {
        var db = h('div', { class: 'chips compact', role: 'group', 'aria-label': '星期' });
        ['一', '二', '三', '四', '五', '六', '日'].forEach(function (nm, i) {
          var d = i + 1; db.appendChild(h('button', { type: 'button', class: 'chip', role: 'checkbox', 'aria-checked': arr(l.days).indexOf(d) >= 0 ? 'true' : 'false', text: nm, onclick: function () {
            l.days = arr(l.days); var j = l.days.indexOf(d); if (j >= 0) l.days.splice(j, 1); else l.days.push(d); draw(); changed(); } }));
        });
        body.appendChild(miniFld('星期', db));
      }
      if (l.mode === 'grid') { var gf = miniFld('週間排程表（點格子填組數與時間）', gridTable(l, function () { draw(); changed(); })); gf.classList.add('wide'); body.appendChild(gf); }
      if (l.mode !== 'spare' && l.mode !== 'grid') body.appendChild(miniFld('每次單位', UI.textInput({ id: 'each', type: 'number', w: '4.5em', aria: '每次單位' }, l, lc2)));
      var auto = NAR.unitsAuto(l, S.st);
      var ui = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', style: 'width:5.5em', 'aria-label': '每月單位數', value: l.unitsManual ? nz(l.units) : String(auto), oninput: function () {
        if (nz(ui.value) === '') { l.unitsManual = false; l.units = ''; } else { l.unitsManual = true; l.units = ui.value; } upd(); changed(); } });
      var tag = h('span', { class: 'autotag' });
      body.appendChild(miniFld('每月單位數', h('div', { class: 'inwrap' }, [ui, tag])));
      var note = UI.textInput({ id: 'note', type: 'text', w: '100%', ph: '備註，如：協助個案臥室及衛浴地板掃拖', aria: '備註' }, l, lc2);
      var nf = miniFld('備註（寫在括號內）', note); nf.classList.add('wide'); body.appendChild(nf);
      box.appendChild(body); box.appendChild(prev);
      function upd() {
        var a = NAR.unitsAuto(l, S.st);
        if (!l.unitsManual && document.activeElement !== ui) ui.value = String(a);
        tag.textContent = l.unitsManual ? '手動（清空可改回自動）' : '自動計算';
        prev.textContent = isUpd() ? NAR.upLineText(l, 'care', S.st) : NAR.careLineText(l, S.st);
      }
      upd();
    }
    draw(); return box;
  }
  /* 週間排程表：列＝上午／中午／下午，欄＝星期一～日；點格子設定組數（單位）與時間 */
  var WEEKN = ['一', '二', '三', '四', '五', '六', '日'];
  function gridTable(l, redraw) {
    l.grid = l.grid || {};
    var tb = h('table', { class: 'sgrid', 'aria-label': '週間排程表' });
    tb.appendChild(h('thead', null, [h('tr', null, [h('th', { class: 'corner', text: '時段' })].concat(WEEKN.map(function (n) { return h('th', { text: n }); })))]));
    var body = h('tbody');
    NAR.SLOTS.forEach(function (s) {
      var tr = h('tr', null, [h('th', { class: 'slot', text: s[1] })]);
      WEEKN.forEach(function (n, i) {
        var key = (i + 1) + s[0], c = l.grid[key], on = c && parseFloat(c.u) > 0;
        var btn = h('button', { type: 'button', class: 'gcell' + (on ? ' on' : ''), 'aria-label': '星期' + n + s[1] + (on ? '，' + c.u + '組' + (c.t ? '，' + c.t : '') : '，未排'),
          onclick: function () { cellDialog(l, key, '星期' + n + '　' + s[1], redraw); } },
          on ? [h('b', { text: c.u + '組' }), c.t ? h('small', { text: c.t }) : null] : [h('span', { class: 'plus', text: '＋' })]);
        tr.appendChild(h('td', null, [btn]));
      });
      body.appendChild(tr);
    });
    tb.appendChild(body);
    var n = NAR.gridDays(l).length;
    var foot = h('div', { class: 'gfoot' }, [h('span', { class: 'help', text: n ? '共排 ' + n + ' 天' : '尚未排入任何時段' }),
      n ? h('button', { type: 'button', class: 'btn sm', text: '全部清除', onclick: function () { l.grid = {}; redraw(); } }) : null]);
    return h('div', { class: 'sgridwrap' }, [h('div', { class: 'sgridscroll' }, [tb]), foot]);
  }
  /* 「0900」「930」「9」「9:30」「９點半」→「09:00」「09:30」；不合理回傳 '' */
  function normTime(s) {
    s = nz(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/：/g, ':').replace(/\s/g, '');
    if (!s) return '';
    var hh, mm, m;
    if ((m = /^(\d{1,2})[:.點時](\d{0,2})分?$/.exec(s))) { hh = +m[1]; mm = m[2] === '' ? 0 : +m[2]; }
    else if ((m = /^(\d{1,2})點半$/.exec(s))) { hh = +m[1]; mm = 30; }
    else if (/^\d{1,4}$/.test(s)) {
      if (s.length <= 2) { hh = +s; mm = 0; }
      else if (s.length === 3) { hh = +s.slice(0, 1); mm = +s.slice(1); }
      else { hh = +s.slice(0, 2); mm = +s.slice(2); }
    } else return '';
    if (hh > 23 || mm > 59) return '';
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function cellDialog(l, key, title, redraw) {
    var c = l.grid[key] || {}, val = { u: nz(c.u) || '1', t: nz(c.t) };
    var uin = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', value: val.u, style: 'width:5em', 'aria-label': '組數', oninput: function () { val.u = uin.value; syncChips(); } });
    var chips = h('div', { class: 'chips compact', role: 'radiogroup', 'aria-label': '組數選擇' });
    function syncChips() { [].forEach.call(chips.children, function (b) { b.setAttribute('aria-checked', b.textContent === nz(val.u) ? 'true' : 'false'); }); }
    ['1', '2', '3', '4', '5', '6'].forEach(function (v) { chips.appendChild(h('button', { type: 'button', class: 'chip', role: 'radio', text: v, onclick: function () { val.u = v; uin.value = v; syncChips(); } })); });
    syncChips();
    /* 時間可直接打字（0900、930、9、9:30 都可以），也可以按「選擇」用時鐘挑 */
    var hint = h('span', { class: 'help tmhint' });
    function syncHint() { var n = normTime(tin.value); hint.textContent = !nz(tin.value) ? '' : n ? '→ ' + n : '格式不對，例：0900'; hint.classList.toggle('bad', !!nz(tin.value) && !n); }
    var tin = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', value: val.t, placeholder: '如 0900', style: 'width:7em', 'aria-label': '時間', autocomplete: 'off',
      oninput: function () { val.t = tin.value; syncHint(); },
      onblur: function () { var n = normTime(tin.value); if (n) { tin.value = n; val.t = n; } syncHint(); },
      onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); okBtn(); } } });
    var picker = h('input', { type: 'time', tabindex: '-1', 'aria-hidden': 'true', class: 'tmpicker', value: normTime(val.t) || '',
      onchange: function () { tin.value = picker.value; val.t = picker.value; syncHint(); }, oninput: function () { tin.value = picker.value; val.t = picker.value; syncHint(); } });
    var pickBtn = h('button', { type: 'button', class: 'btn sm', text: '🕘 選擇', onclick: function () {
      picker.value = normTime(tin.value) || '09:00';
      try { if (picker.showPicker) { picker.showPicker(); return; } } catch (e) { }
      picker.focus(); picker.click(); } });
    syncHint();
    var body = h('div', { class: 'celldlg' }, [
      miniFld('組數（單位）', h('div', { class: 'inwrap' }, [chips, uin, h('span', { class: 'affix', text: '組' })])),
      miniFld('時間（選填，可直接打 0900）', h('div', { class: 'inwrap tmwrap' }, [tin, hint, pickBtn, picker, h('button', { type: 'button', class: 'btn sm', text: '不填時間', onclick: function () { val.t = ''; tin.value = ''; syncHint(); } })]))]);
    function okBtn() { var b = [].filter.call(dlg.el.querySelectorAll('footer .btn'), function (x) { return x.textContent === '確定'; })[0]; if (b) b.click(); }
    var dlg = UI.dialog(title, body, [
      { label: '清除此格', danger: true, on: function () { delete l.grid[key]; redraw(); } },
      { label: '取消' },
      { label: '確定', pri: true, on: function () {
        var u = nz(val.u).replace(/[^\d.]/g, '');
        var tt = nz(val.t) ? normTime(val.t) : '';
        if (nz(val.t) && !tt) { UI.toast('時間格式不對，請輸入如 0900 或 13:30'); tin.focus(); return false; }
        if (!(parseFloat(u) > 0)) { delete l.grid[key]; } else l.grid[key] = { u: String(parseFloat(u)), t: tt };
        redraw(); } }]);
    dlg.el.querySelector('.dialog').style.maxWidth = '460px';
  }
  function simpleLine(l, key, redraw, kind) {
    var box = h('div', { class: 'sline', 'data-fid': 'line-' + l.id }), prev = h('div', { class: 'sprev' });
    var lc = { changed: function () { upd(); changed(); }, conds: [] };
    var NK = { year: 'year', pro: 'pro', aid: 'aid' }[kind];
    function upd() { prev.textContent = isUpd() ? NAR.upLineText(l, NK, S.st) : kind === 'year' ? NAR.yearLineText(l) : kind === 'pro' ? NAR.proLineText(l) : NAR.aidLineText(l); }
    function draw() {
      clear(box);
      box.appendChild(lineHead(l, key, redraw));
      var body = h('div', { class: 'sbody' });
      if (isUpd()) {
        body.appendChild(actChips(l, draw));
        if (NAR.upAct(l) === '取消') { box.appendChild(body); box.appendChild(prev); upd(); return; }
        if (NAR.upAct(l) === '調整' && kind === 'year') body.appendChild(miniFld('原本年度單位數', UI.textInput({ id: 'from', type: 'text', w: '6em', ph: '如：42', aria: '原本年度單位數', inputmode: 'decimal' }, l, lc)));
        if (NAR.upAct(l) === '調整' && kind === 'pro') body.appendChild(miniFld('原本單位數', UI.textInput({ id: 'from', type: 'text', w: '9em', ph: '如：1單位/月', aria: '原本單位數' }, l, lc)));
      }
      fill(body);
      box.appendChild(body); box.appendChild(prev);
      upd();
    }
    draw(); return box;
    function fill(body) {
      if (kind === 'year') body.appendChild(miniFld('年度單位數', UI.textInput({ id: 'units', type: 'number', w: '6em', aria: '年度單位數' }, l, lc)));
      if (kind === 'pro') {
        body.appendChild(miniFld('單位數（選填）', UI.textInput({ id: 'unitsText', type: 'text', w: '9em', ph: '如：1單位/月', aria: '單位數' }, l, lc)));
        if (/^C[AB]/.test(l.code)) {
          body.appendChild(miniFld('復能期程', UI.textInput({ id: 'period', type: 'text', w: '14em', ph: '如：115.10.21-116.3.9', aria: '復能期程' }, l, lc)));
          var gf = miniFld('復能目標', UI.textInput({ id: 'goal', type: 'text', w: '100%', ph: '如：個案可自行從床上轉移位至床旁便盆椅或輪椅', aria: '復能目標' }, l, lc)); gf.classList.add('wide'); body.appendChild(gf);
        }
      }
      var nf = miniFld('備註（選填）', UI.textInput({ id: 'note', type: 'text', w: '100%', ph: kind === 'pro' ? '如：20周內12單位' : '', aria: '備註' }, l, lc)); nf.classList.add('wide'); body.appendChild(nf);
    }
  }
  function linesBlock(title, key, cat, kind, pickTitle, extraTop, extraBottom, tip) {
    var f = S.rec.f, listEl = h('div');
    function draw() {
      clear(listEl);
      if (!arr(f[key]).length) listEl.appendChild(h('p', { class: 'help', style: 'margin:0 0 10px', text: isUpd() ? '這一類沒有變動就不用選。' : '尚未選取，產出時會寫「暫無需求。」' }));
      arr(f[key]).forEach(function (l) { if (!l.id) l.id = UI.uid(); listEl.appendChild(kind === 'care' ? careLine(l, key, draw) : simpleLine(l, key, draw, kind)); });
      if (extraBottom && extraBottom.info) extraBottom.info();
    }
    if (extraBottom && extraBottom.bind) extraBottom.bind(draw);
    draw();
    var kids = [];
    if (tip) kids.push(h('p', { class: 'tip', text: tip }));
    if (extraTop) kids.push(extraTop);
    kids.push(listEl);
    kids.push(h('button', { type: 'button', class: 'btn addbtn', text: '＋ 選取' + pickTitle, onclick: function () { openPicker(cat, key, '選取' + pickTitle, function () { if (extraBottom && extraBottom.sync) extraBottom.sync(); draw(); changed(); }); } }));
    if (extraBottom) kids.push(extraBottom.el);
    var el = block(title, kids); el.setAttribute('data-fid', 'blk-' + key);
    return el;
  }
  /* 喘息／短照：額度區間＋依 CMS 等級帶入年度單位數上限 */
  function quotaField(id, label, key, kind) {
    var f = S.rec.f, inp = UI.textInput({ id: id, type: 'text', w: '11em', ph: '如：115.11-116.10', aria: label }, f, ctx), real = inp.tagName === 'INPUT' ? inp : inp.querySelector('input');
    var info = h('p', { class: 'help', style: 'margin:10px 0 0' }), redraw = function () { };
    function fill(overwrite) { var r = NAR.quotaFill(arr(f[key]), kind, f.cms, DATA.quota, overwrite); redraw(); return r; }
    function showInfo() {
      var total = (DATA.quota[kind] || {})[+f.cms], name = kind === 'respite' ? '喘息' : '短照';
      if (!total) { info.textContent = '填寫「壹、訪視資訊」的 CMS 等級後，可依額度自動帶入年度單位數。'; return; }
      var used = 0; arr(f[key]).forEach(function (l) { used += (DATA.quota.price[l.code] || 0) * (parseFloat(l.units) || 0); });
      info.textContent = 'CMS 第' + f.cms + '級：' + name + '額度 ' + total.toLocaleString() + ' 元／年，目前已排 ' + used.toLocaleString() + ' 元' + (used > total ? '（超過額度）' : '，剩餘 ' + (total - used).toLocaleString() + ' 元') + '。';
      info.style.color = used > total ? 'var(--seal)' : '';
    }
    var el = h('div', null, [h('div', { class: 'inline', style: 'margin-top:12px', 'data-fid': id }, [h('span', { text: label }), inp,
      h('button', { type: 'button', class: 'btn sm', text: '依訪視月份帶入', onclick: function () { f[id] = NAR.quotaPeriod(f.visitDate); real.value = f[id]; changed(); } }),
      h('button', { type: 'button', class: 'btn sm', text: '依 CMS 等級帶入單位數上限', onclick: function () { if (!f.cms) { UI.toast('請先在「訪視資訊」填 CMS 等級'); return; } fill(true); changed(); } })]), info]);
    return { el: el, info: showInfo, bind: function (d) { redraw = d; },
      sync: function () {
        if (arr(f[key]).length && !nz(f[id])) { f[id] = NAR.quotaPeriod(f.visitDate); real.value = f[id]; }
        if (f.cms) NAR.quotaFill(arr(f[key]), kind, f.cms, DATA.quota, false);      /* 新加入而尚未填單位數的項目自動帶入 */
      } };
  }
  CUSTOM.aSvcAfter = function (pane, f) {
    var row = pane.querySelector('[data-fid="aaUseContent"]');
    if (!row) return;
    row.appendChild(h('div', { class: 'inline', style: 'margin-top:6px' }, [h('button', { type: 'button', class: 'btn sm', text: '依服務規劃帶入', onclick: function () {
      var t = NAR.aaUseFromPlan(f);
      if (!t) { UI.toast('服務規劃還沒有選照顧服務'); return; }
      f.aaUseContent = t; showSection('aSvc'); changed(); } })]));
  };
  CUSTOM.plan = function (pane, f) {
    if (isAA()) {
      var src = planRecOf(S.rec), when = src ? NAR.rocLong(src.f.visitDate) : '';
      /* 服務頻率「維持不變」且這頁還沒有內容：自動套入撰寫計畫的服務規劃 */
      if (src && f.aaFreq === '維持不變' && planEmpty(f)) { applyPlanFrom(src, f); setTimeout(function () { UI.toast('服務沒有調整，已套入' + (when ? when + '的' : '') + '撰寫計畫服務內容'); changed(); }, 0); }
      pane.appendChild(block('前次撰寫計畫', [
        h('p', { class: 'tip', text: src ? '找到這位個案的撰寫計畫' + (when ? '（' + when + '）' : '') + '。服務沒有改變時，按下方按鈕整份套入，再修改有變動的項目；服務頻率選「維持不變」且這頁還空白時會自動套入。'
          : '清單中找不到這位個案的撰寫計畫（請先在「訪視資訊」填個案姓名，或從首頁個案清單按「建立AA01」）。' }),
        src ? h('button', { type: 'button', class: 'btn', text: '套入前次撰寫計畫的服務規劃', onclick: function () {
          function go() { applyPlanFrom(src, f); changed(); showSection('plan'); UI.toast('已套入' + (when ? when + '的' : '') + '撰寫計畫服務內容'); }
          if (planEmpty(f)) go(); else UI.confirmBox('套入前次服務規劃', '這頁已經有內容，套入會以前次撰寫計畫的服務規劃取代，確定嗎？', '套入', go);
        } }) : null]));
    }
    if (f.careFlags === undefined && f.foreign === '有') f.careFlags = ['聘有外籍看護'];
    var flags = h('div', { class: 'fields', style: 'padding:0 0 14px' }, [
      UI.field({ id: 'careFlags', type: 'multi', label: '照顧服務註記（寫在【照顧服務】後面）', options: ['聘有外籍看護', '超額服務需求', '例假日服務需求', '晚間服務需求'] }, f, ctx),
      UI.field({ id: 'careFlagNote', type: 'text', label: '其他註記', w: '100%', ph: '如：個案獨居有例假日服務需求' }, f, ctx)]);
    pane.appendChild(linesBlock('1. 照顧服務', 'pCare', 'care', 'care', '照顧服務項目', flags, null,
      '每月單位數依頻率自動換算（每週1天＝' + S.st.weekFactor[1] + '、2天＝' + S.st.weekFactor[2] + '、3天＝' + S.st.weekFactor[3] + '、5天＝' + S.st.weekFactor[5] + '、每日＝' + S.st.weekFactor[7] + '，可在設定調整），也可以直接改數字。'));
    pane.appendChild(linesBlock('專業服務', 'pPro', 'pro', 'pro', '專業服務項目'));
    var vend = { id: 'pVendors', type: 'multi', label: '服務單位', other: true, options: arr(S.st.vendors) };
    var transBox = h('div', { class: 'fields', style: 'padding:0' }, [
      UI.field({ id: 'pTrans', type: 'single', label: 'DA01 交通接送', options: ['暫無需求', '使用'] }, f, ctx),
      UI.field({ id: 'pTransAmt', type: 'text', label: '額度', suffix: '元/月', w: '6em', showIf: function (x) { return x.pTrans === '使用'; } }, f, ctx),
      UI.field(Object.assign({ showIf: function (x) { return x.pTrans === '使用'; } }, vend), f, ctx)]);
    pane.appendChild(block('2. 交通接送服務', [transBox]));
    var aidNote = h('p', { class: 'help', style: 'margin:10px 0 0' });
    var aidInfo = { el: aidNote, info: function () {
      var need = arr(f.pAids).filter(function (l) { return AIDS_EVAL[String(l.code).replace(/-\d$/, '')] === 'need'; });
      aidNote.textContent = need.length ? '已選項目中有 ' + need.length + ' 項需評估（' + need.map(function (l) { return l.code; }).join('、') + '），須由輔具評估人員出具評估報告後才能給付。' : (arr(f.pAids).length ? '已選項目皆為免評估，可由輔具供應人員逕行提供。' : '');
    } };
    pane.appendChild(linesBlock('3. 輔具及居家無障礙環境改善服務', 'pAids', 'aids', 'aid', '輔具及無障礙項目', null, aidInfo,
      '內建清單是給付辦法附表四、附表四之一的全部項目，選取視窗依「免評估」「需評估」分開。項目多，可輸入代碼或關鍵字篩選。'));
    var qf = quotaField('pRespitePeriod', '喘息額度區間', 'pRespite', 'respite');
    if (isAA()) {
      qf.el.appendChild(h('p', { class: 'help', style: 'margin:8px 0 0', text: 'AA01 會在喘息項目後面依額度區間寫「本案喘息額度自○年○月至○年○月。」' }));
    }
    pane.appendChild(linesBlock('4. 喘息服務', 'pRespite', 'respite', 'year', '喘息服務項目', null, qf));
    pane.appendChild(linesBlock('5. 短照服務（聘有外籍看護時）', 'pShort', 'short', 'year', '短照服務項目', null, quotaField('pShortPeriod', '短照額度區間', 'pShort', 'short')));
    pane.appendChild(linesBlock('其他', 'pOther', 'other', 'care', '其他服務項目'));
    pane.appendChild(block('補充說明', [UI.field({ id: 'planNote', type: 'textarea', rows: 2, ph: '會寫在計畫執行規劃最後、個管員署名之前（選填）' }, f, ctx)]));
  };

  /* ============================================================
     肆、照顧計畫目標
     ============================================================ */
  CUSTOM.goals = function (pane, f) {
    var tas = {}, state = h('span', { class: 'edited' }), reset = h('button', { type: 'button', class: 'btn sm', text: '依服務規劃重新產生', onclick: function () { f.goalEdited = false; fill(true); changed(); } });
    function mk(k, label) {
      var ta = h('textarea', { class: 'inp', rows: 3, 'aria-label': label, oninput: function () { f.goalEdited = true; f.goalShort = tas.short.value; f.goalMid = tas.mid.value; f.goalLong = tas.long.value; UI.autoGrow(ta); sync(); changed(); } });
      tas[k] = ta; return h('div', { class: 'fld wide', style: 'margin-bottom:14px' }, [h('div', { class: 'fl', text: label }), ta]);
    }
    function sync() { state.textContent = f.goalEdited ? '已手動編修，之後更動服務規劃不會自動改寫這裡' : '依服務規劃自動產生，可以直接修改'; reset.hidden = !f.goalEdited; }
    function fill(force) {
      var g = NAR.goals(f);
      ['short', 'mid', 'long'].forEach(function (k) { if (force || document.activeElement !== tas[k]) { tas[k].value = g[k]; UI.autoGrow(tas[k]); } });
      sync();
    }
    var varLab = h('span', { class: 'help' });
    function showVar() { varLab.textContent = '目前是第 ' + (((+f.goalVar || 0) % 3) + 1) + ' 種寫法（共 3 種）'; }
    var vary = h('button', { type: 'button', class: 'btn', text: '換一種寫法', onclick: function () { f.goalVar = ((+f.goalVar || 0) + 1) % 3; f.goalEdited = false; fill(true); showVar(); changed(); } });
    showVar();
    var kids = [h('p', { class: 'tip', text: '短、中、長期目標會依「服務規劃」選取的項目與勾選的照顧問題先擬一版。按「換一種寫法」可切換不同的句型與用語，再依個案狀況調整。' }),
      h('div', { class: 'inline', style: 'margin-bottom:14px' }, [vary, varLab]),
      mk('short', '1、短期目標'), mk('mid', '2、中期目標'), mk('long', '3、長期目標'), h('div', { class: 'inline' }, [state, reset])];
    if (isAA()) {
      var ev = h('div', { class: 'fields', style: 'padding:0' }, [
        UI.field({ id: 'aaEvShort', type: 'single', label: '短期目標', options: NAR.AA_EVAL }, f, ctx),
        UI.field({ id: 'aaEvMid', type: 'single', label: '中期目標', options: NAR.AA_EVAL }, f, ctx),
        UI.field({ id: 'aaEvLong', type: 'single', label: '長期目標', options: NAR.AA_EVAL }, f, ctx),
        UI.field({ id: 'aaEvNote', type: 'text', label: '評值說明（選填）', w: '100%', ph: '如：個案已可持助行器於室內安全行走' }, f, ctx)]);
      pane.appendChild(block('前次目標評值', [h('p', { class: 'tip', text: '依前次（初評）計畫目標評值達成情形，會寫成「前次目標評值：短期目標已達成，…。」放在新目標前面。' }), ev]));
      kids.splice(1, 0, h('p', { class: 'help', style: 'margin:-6px 0 12px', text: '產出時會自動加上期程：短期(1個月)、中期(3個月)、長期(6個月)。' }));
    }
    pane.appendChild(block('目標內容', kids));
    if (isAA()) pane.appendChild(block('自由填寫（選填）', [UI.field({ id: 'aaGoalFree', type: 'textarea', rows: 2, label: '補充', ph: '會接在長期目標後面' }, f, ctx)]));
    setTimeout(function () { fill(true); }, 0);
    S.hooks.push(function () { if (!f.goalEdited) fill(false); });
  };

  /* ============================================================
     產出
     ============================================================ */
  /* 產出框：可直接修改；修改後不再自動更新，按「重新產生」恢復 */
  function outPanel(f, fills, title, sub, editedKey, textKey, gen, small) {
    var ta = h('textarea', { class: 'inp outbox' + (small ? ' small' : ''), 'aria-label': title, spellcheck: 'false' }), cnt = h('span', { class: 'cnt' }), ed = h('span', { class: 'edited' });
    var regen = h('button', { type: 'button', class: 'btn sm', text: '重新產生', onclick: function () { f[editedKey] = false; f[textKey] = ''; fill(); changed(); } });
    function fill() { if (document.activeElement === ta) return; ta.value = f[editedKey] ? nz(f[textKey]) : gen(); sync(); if (small) UI.autoGrow(ta); }
    function sync() { cnt.textContent = '共 ' + ta.value.length + ' 字'; ed.textContent = f[editedKey] ? '已手動編修，前面的勾選變動不會自動更新這裡' : ''; regen.hidden = !f[editedKey]; }
    ta.addEventListener('input', function () { f[editedKey] = true; f[textKey] = ta.value; sync(); if (small) UI.autoGrow(ta); changed(); });
    fill(); fills.push(fill);
    return h('div', null, [
      h('div', { class: 'outhead' }, [h('h3', { style: 'margin:0', text: title }), h('button', { type: 'button', class: 'btn pri sm', text: '複製' + title, onclick: function () { UI.copyText(ta.value, '已複製「' + title + '」，可貼到 CMS'); } }), regen, cnt]),
      h('p', { class: 'tip', text: sub }), ta, ed]);
  }
  CUSTOM.output = function (pane, f) {
    if (isAA()) return aaOutput(pane, f);
    var review = NAR.isReview(f), prev = S.rec.prev && S.rec.prev.f, fills = [];
    if (review) {
      if (prev && f.rvPlan === undefined) f.rvPlan = NAR.planDiff(f, prev, S.st);
      var rc = { changed: function () { changed(); }, conds: S.conds };
      var kids = [h('p', { class: 'tip', text: (prev ? '已和前次紀錄（' + (NAR.rocLong(S.rec.prev.date) || '日期未填') + ' 訪視）的服務規劃比對，自動帶入下面這段，請依實際狀況修改。' : '這筆紀錄不是用「複製為複評」建立的，沒有前次紀錄可以比對，請自行填寫。')
          + '這段會寫在「6、服務使用狀況」最後。只要疊加一段在 CMS 舊計畫上方的，請改用首頁的「計畫更新／異動」。' }),
        h('div', { class: 'fields', style: 'padding:0' }, [
          UI.field({ id: 'rvPlan', type: 'textarea', label: '與前次計畫不同之處', rows: 2, ph: '如：與前次計畫相比，新增BA07協助沐浴及洗頭(9單位/月)，其餘服務維持不變' }, f, rc)])];
      if (prev) kids.push(h('div', { class: 'inline', style: 'margin-top:10px' }, [h('button', { type: 'button', class: 'btn sm', text: '依前次紀錄重新帶入', onclick: function () {
        f.rvPlan = NAR.planDiff(f, prev, S.st); changed(); showSection('output'); } })]));
      pane.appendChild(block('複評', kids));
    }
    var warnBox = h('div');
    function drawWarn() {
      clear(warnBox);
      var warn = NAR.checks(f), wl = h('ul', { class: 'warnlist' });
      warn.forEach(function (w) {
        var sec = SECS[secIndex(w.sec)];
        wl.appendChild(h('li', null, [w.msg, h('button', { type: 'button', class: 'btn sm', text: w.sec === 'output' ? '前往填寫' : '前往「' + sec.nav + '」填寫', onclick: function () { jumpTo(w.sec, w.fid); } })]));
      });
      warnBox.appendChild(warn.length ? wl : h('div', { class: 'okline', text: '必要內容都已填寫。' }));
      if (warn.length) warnBox.appendChild(h('p', { class: 'help', text: '以上只是提醒，仍然可以直接複製下方文字。' }));
    }
    drawWarn(); S.hooks.push(drawWarn);
    pane.appendChild(block('送出前檢查', [warnBox]));
    pane.appendChild(h('section', { class: 'block' }, [h('div', { class: 'outgrid' }, [
      outPanel(f, fills, '計畫目標', '貼到 CMS「綜合問題與建議（A單位專區）」的計畫目標欄。', 'outGoalEdited', 'outGoal', function () { return NAR.goalText(f, S.st); }),
      outPanel(f, fills, '計畫執行規劃', '貼到同一頁的計畫執行規劃欄。', 'outPlanEdited', 'outPlan', function () { return NAR.plan(f, S.st); })
    ])]));
    S.hooks.push(function () { fills.forEach(function (fn) { fn(); }); });
    pane.appendChild(block('留存', [h('div', { class: 'inline' }, [
      h('button', { type: 'button', class: 'btn', text: '列印訪視評估表（可另存 PDF）', onclick: printForm }),
      h('button', { type: 'button', class: 'btn pri', text: '存檔（訪視評估表＋計畫內容）', onclick: function () { saveCase(); } })]),
      h('p', { class: 'help', text: '會存出「' + caseName(S.rec) + '訪視評估表.pdf」與「' + caseName(S.rec) + '計畫內容.pdf」。訪視評估表檔之後可以用首頁的「匯入存檔」重新打開，供複評使用。' })]));
  };

  function aaOutput(pane, f) {
    var fills = [], warnBox = h('div');
    function drawWarn() {
      clear(warnBox);
      var warn = NAR.aaChecks(f), wl = h('ul', { class: 'warnlist' });
      warn.forEach(function (w) { var sec = SECS[secIndex(w.sec)]; wl.appendChild(h('li', null, [w.msg, h('button', { type: 'button', class: 'btn sm', text: '前往「' + sec.nav + '」填寫', onclick: function () { jumpTo(w.sec, w.fid); } })])); });
      warnBox.appendChild(warn.length ? wl : h('div', { class: 'okline', text: '必要內容都已填寫。' }));
      if (warn.length) warnBox.appendChild(h('p', { class: 'help', text: '以上只是提醒，仍然可以直接複製下方文字。' }));
    }
    drawWarn(); S.hooks.push(drawWarn);
    pane.appendChild(block('送出前檢查', [warnBox]));
    pane.appendChild(h('p', { class: 'tip', text: 'AA01 舊計畫內容不刪除：把下面的文字貼在 CMS 各欄位的最上方，最新日期在最上層，與舊紀錄之間以「-----」區隔（已附在文字最後）。' }));
    pane.appendChild(h('section', { class: 'block' }, [h('div', { class: 'outgrid' }, [
      outPanel(f, fills, '計畫目標', '貼在 CMS 計畫目標欄最上方。', 'outGoalEdited', 'outGoal', function () { return NAR.aaGoalText(f, S.st); }),
      outPanel(f, fills, '計畫執行規劃', '貼在 CMS 計畫執行規劃欄最上方。', 'outPlanEdited', 'outPlan', function () { return NAR.aaPlan(f, S.st); })
    ])]));
    pane.appendChild(h('section', { class: 'block' }, [outPanel(f, fills, '其他備註', '貼到 CMS 其他備註欄（沒有勾選項目時為空白，不用貼）。', 'outNoteEdited', 'outNote', function () { return NAR.aaNote(f); }, true)]));
    S.hooks.push(function () { fills.forEach(function (fn) { fn(); }); });
    pane.appendChild(block('留存', [h('div', { class: 'inline' }, [
      h('button', { type: 'button', class: 'btn', text: '列印（可另存 PDF）', onclick: printForm }),
      h('button', { type: 'button', class: 'btn pri', text: '存檔（AA01 PDF）', onclick: function () { saveCase(); } })]),
      h('p', { class: 'help', text: '會存出「' + fileBase(S.rec) + '.pdf」，之後可以用首頁的「匯入存檔」重新打開。' })]));
  }

  /* ============================================================
     計畫更新／異動（AA01 計畫更新、計畫異動）：一頁短表單
     ============================================================ */
  function renderUpdate() {
    var app = clear(document.getElementById('app')); E = {};
    S.sec = 'update'; S.conds = []; S.hooks = []; ctx.conds = S.conds; S.lastDraft = null;
    topBar(app);
    E.pane = h('main', { class: 'pane uppane' });
    app.appendChild(E.pane);
    CUSTOM.update(E.pane, S.rec.f);
    refreshConds(); setSaveState('saved'); refreshTop();
    window.scrollTo(0, 0);
  }
  /* 計畫更新／異動：舊版內容已清除，等待新版設計 */
  CUSTOM.update = function (pane, f) {
    pane.appendChild(h('div', { class: 'sechead' }, [h('h1', { text: '計畫更新／異動' })]));
    pane.appendChild(block('新版製作中', [h('p', { class: 'help', style: 'margin:0', text: '這一頁正在重新設計，內容會陸續加入。' })]));
  };


  /* ============================================================
     列印訪視評估表
     ============================================================ */
  /* ---- 訪視評估表的欄位呈現：勾選項目以 ☑／☐ 列出全部選項（同紙本評估表），已選的加粗 ---- */
  /* 勾選框用畫的（☐ 字元在部分字型和「口」很像，例如腸造口、傷口換藥） */
  function ck(on, t, note) { return h('span', { class: 'o' + (on ? ' on' : '') }, [h('i', { 'aria-label': on ? '已勾選' : '未勾選' }), t + (note ? '（' + note + '）' : '')]); }
  function blankEl(t) { return h('span', { class: 'blank', text: t || '＿＿＿＿' }); }
  function valEl(t, pre, suf) { return nz(t) ? h('span', { class: 'val', text: (pre || '') + nz(t) + (suf || '') }) : blankEl(); }
  /* 出生年次的呈現：「民國35年次（80歲）」；舊資料只有年齡就顯示「80歲」 */
  function byText(o) {
    var a = NAR.ageOf(o, o.visitDate || (S.rec && S.rec.f ? S.rec.f.visitDate : ''));
    if (nz(o.birthYear)) return '民國' + nz(o.birthYear) + '年次' + (a ? '（' + a + '歲）' : '');
    return a ? a + '歲' : '';
  }
  function fkey(def) { return def.label ? def.label.replace(/（.*?）/g, '') : ''; }
  /* 回傳 {k, v:[節點]}（一行）或 {k, blk:節點}（整塊），不顯示時回傳 null */
  function pv(def, obj) {
    if (def.showIf && !def.showIf(obj) && def.type !== 'scale') return null;
    var k = fkey(def), v, sel;
    switch (def.type) {
      case 'single':
        v = UI.opts(def).map(function (o) { return ck(obj[def.id] === o.v, o.l); });
        if (def.prefix) v.unshift(document.createTextNode(def.prefix + ' ')); if (def.suffix) v.push(document.createTextNode(def.suffix));
        return { k: k, v: v };
      case 'multi':
        sel = arr(obj[def.id]);
        v = UI.opts(def).map(function (o) { var n = def.note && obj[def.id + '__note'] ? nz(obj[def.id + '__note'][o.v]) : ''; return ck(sel.indexOf(o.v) >= 0, o.l, sel.indexOf(o.v) >= 0 ? n : ''); });
        if (def.other) v.push(ck(sel.indexOf('__other') >= 0, '其他' + (sel.indexOf('__other') >= 0 && nz(obj[def.id + '__other']) ? '：' + nz(obj[def.id + '__other']) : '')));
        return { k: k, v: v };
      case 'inline':
        v = [];
        def.parts.forEach(function (p) {
          if (typeof p === 'string') { v.push(document.createTextNode(' ' + p + ' ')); return; }
          var r = pv(Object.assign({}, p, { label: '' }), obj); if (r && r.v) v = v.concat(r.v);
        });
        return { k: k, v: v };
      case 'scale':
        var sc = obj[def.id], hasPain = obj.painHas === '有', cap;
        cap = obj.painHas === '無' ? '無疼痛主訴' : hasPain ? (sc === '' || sc === undefined ? '疼痛分數未評' : '疼痛分數 ' + sc + ' 分') : '未評估';
        var box = h('div', { class: 'pain' }); box.innerHTML = UI.painSvg(hasPain ? sc : '');
        box.appendChild(h('div', { class: 'cap', text: cap }));
        return { k: '疼痛評估量表', blk: box };
      case 'muscle':
        var fig = h('div', { class: 'fig' }); fig.innerHTML = UI.bodySvg(obj.mp, { boxes: true });
        fig.appendChild(h('ul', { class: 'lg' }, UI.MUSCLE_LEGEND.map(function (l) { return h('li', null, [h('b', { text: l[0] }), l[1]]); })));
        var olds = NAR.MUSCLE_OLD.filter(function (m) { return nz((obj.mp || {})[m[0]]) !== ''; }).map(function (m) { return m[1] + ' ' + obj.mp[m[0]] + ' 分'; });
        if (olds.length) fig.appendChild(h('div', { class: 'k', text: '舊版紀錄：' + olds.join('、') }));
        return { k: '肌力（0–5分）', blk: fig };
      case 'bmi':
        var b = NAR.bmiOf(obj);
        return { k: '身高體重', v: [document.createTextNode('身高 '), valEl(obj.height), document.createTextNode(' cm　體重 '), valEl(obj.weight), document.createTextNode(' kg　BMI '),
          b ? valEl(b + '（' + NAR.bmiCat(b) + '）') : blankEl(), arr(obj.wtUnknown).length ? document.createTextNode('（未測量）') : null].filter(Boolean) };
      case 'date': return { k: k, v: [NAR.rocLong(obj[def.id]) ? valEl(NAR.rocLong(obj[def.id])) : blankEl('＿＿年＿＿月＿＿日')] };
      case 'byear': return { k: nz(obj.birthYear) ? k : '年齡', v: [byText(obj) ? valEl(byText(obj)) : blankEl()] };
      case 'sketch': return obj[def.id] ? { k: k, blk: h('img', { class: 'sk', src: obj[def.id], alt: '手繪圖' }) } : null;
      case 'list':
        var items = arr(obj[def.id]), wrap = h('div');
        items.forEach(function (it, i) {
          var kids = [h('b', { text: '(' + (i + 1) + ')' })];
          def.item.forEach(function (fd) {
            if (fd.showIf && !fd.showIf(it)) return;
            var t = fd.type === 'multi' ? arr(it[fd.id]).join('、') : fd.type === 'byear' ? byText(it) : nz(it[fd.id]);
            if (!t) return;
            kids.push(h('span', { class: 'kv' }, [h('span', { text: (fd.type === 'byear' && !nz(it.birthYear) ? '年齡' : fkey(fd)) + '：' }), t + (fd.suffix || '')]));
          });
          wrap.appendChild(h('div', { class: 'mem' }, kids));
        });
        if (!items.length) wrap.appendChild(blankEl('（無）'));
        return { k: k, blk: wrap };
      default: return { k: k, v: [valEl(obj[def.id], def.prefix, def.suffix)] };
    }
  }
  function lineEl(r) {
    if (r.blk) return h('div', { class: 'blk' }, [r.k ? h('span', { class: 'k', text: r.k }) : null, r.blk]);
    return h('div', { class: 'ln' + (r.k ? '' : ' nok') }, r.k ? [h('span', { class: 'k', text: r.k }), h('span', null, r.v)] : [h('span', null, r.v)]);
  }
  function formHead(title, rec, cells) {
    var f = rec.f, d = new Date(), today = (d.getFullYear() - 1911) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2);
    var p = h('div');
    p.appendChild(h('div', { class: 'hd' }, [h('img', { src: '__LOGO_MARK__', alt: '' }), h('div', null, [h('h1', null, title.split('　').map(function (x, i) { return h('span', { text: (i ? '　' : '') + x }); })), h('div', { class: 'org', text: ORG })]),
      h('div', { class: 'no' }, ['列印日期　' + today, h('br'), '個管員　' + (nz(f.cmName) || '＿＿＿＿')])]));
    p.appendChild(h('div', { class: 'sum' }, cells.map(function (c) { return h('div', null, [h('span', { text: c[0] }), nz(c[1]) ? h('b', { text: c[1] }) : blankEl()]); })));
    return p;
  }
  function sigBlock(f) {
    return h('div', { class: 'sig' }, [h('div', null, [h('span', { text: '個案管理員簽章' }), h('b', { text: nz(f.cmName) })]), h('div', null, [h('span', { text: '督導審核簽章' })]), h('div', null, [h('span', { text: '審核日期' })])]);
  }
  /* AA01 列印版／PDF：基本資料＋三段要貼到 CMS 的文字 */
  function buildAADom(rec) {
    var f = rec.f, t = outTexts(rec);
    var p = formHead('AA01　照顧計畫', rec, [['個案姓名', f.name], ['訪視日期', NAR.rocLong(f.visitDate)], ['CMS等級', f.cms ? '第' + f.cms + '級' : ''], ['與照專同訪', f.withCM], ['個管員', f.cmName]]);
    p.appendChild(h('h2', null, ['計畫目標', h('small', { text: '貼在 CMS 計畫目標欄最上方，舊內容保留在下面' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.goal }));
    p.appendChild(h('h2', null, ['計畫執行規劃', h('small', { text: '貼在 CMS 計畫執行規劃欄最上方' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.plan }));
    if (nz(t.note)) { p.appendChild(h('h2', null, ['其他備註', h('small', { text: '貼到 CMS 其他備註欄' })])); p.appendChild(h('div', { class: 'ptext', text: t.note })); }
    p.appendChild(sigBlock(f));
    p.appendChild(h('div', { class: 'ft', text: ORG + '　本表由照顧計畫產生器產出' }));
    return p;
  }
  /* 計畫更新／異動的列印版：基本資料＋兩段文字 */
  function buildUpdateDom(rec) {
    var f = rec.f, t = outTexts(rec), p = formHead('計畫更新／異動紀錄', rec, [['個案姓名', f.name], ['日期', NAR.rocLong(f.visitDate)], ['方式', f.upHow], ['討論對象', f.upWith], ['個管員', f.cmName]]);
    var tb = h('table');
    [['原因', nz(f.upReason)], ['本次體況', nz(f.upCond)]].forEach(function (r) { tb.appendChild(h('tr', null, [h('th', { text: r[0] }), h('td', null, [r[1] ? h('span', { text: r[1] }) : blankEl()])])); });
    p.appendChild(h('h2', null, ['異動說明']));
    p.appendChild(tb);
    p.appendChild(h('h2', null, ['CMS 計畫目標欄', h('small', { text: '貼在原內容最上方' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.goal }));
    p.appendChild(h('h2', null, ['CMS 計畫執行規劃欄', h('small', { text: '貼在原內容最上方' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.plan }));
    p.appendChild(sigBlock(f));
    p.appendChild(h('div', { class: 'ft', text: ORG + '　本表由照顧計畫產生器產出' }));
    return p;
  }
  function buildFormDom(rec) {
    if (isUpd(rec)) return buildUpdateDom(rec);
    if (isAA(rec)) return buildAADom(rec);
    var f = rec.f, t = outTexts(rec);
    var p = formHead('A單位個案管理員　家庭訪視評估表', rec, [['個案姓名', f.name], ['訪視日期', NAR.rocLong(f.visitDate)], ['訪視類型', f.visitType], ['CMS等級', f.cms ? '第' + f.cms + '級' : ''], ['與照專同訪', f.withCM]]);
    SCHEMA.sections.forEach(function (sec) {
      if (sec.custom) return;
      var m = /^(.*?)【(.*)】$/.exec(sec.title);
      p.appendChild(h('h2', null, m ? [m[2], h('small', { text: m[1].replace(/、$/, '') })] : [sec.title]));
      var tb = h('table');
      sec.rows.forEach(function (row) {
        if (row.showIf && !row.showIf(f)) return;
        var cell = h('td');
        row.fields.forEach(function (fd) { var r = pv(fd, f); if (r) cell.appendChild(lineEl(r)); });
        tb.appendChild(h('tr', null, [h('th', { text: row.label }), cell]));
      });
      p.appendChild(tb);
    });
    p.appendChild(h('h2', { class: 'pb' }, ['照顧計畫', h('small', { text: 'CMS 計畫目標欄' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.goal }));
    p.appendChild(h('h2', null, ['計畫執行規劃', h('small', { text: 'CMS 計畫執行規劃欄' })]));
    p.appendChild(h('div', { class: 'ptext', text: t.plan }));
    p.appendChild(sigBlock(f));
    p.appendChild(h('div', { class: 'ft', text: ORG + '　本表由照顧計畫產生器產出' }));
    return p;
  }
  function printForm() {
    saveNow();
    var p = clear(document.getElementById('print')), dom = buildFormDom(S.rec), vf = h('div', { class: 'vf' });
    p.appendChild(h('style', { text: FORM_CSS }));
    while (dom.firstChild) vf.appendChild(dom.firstChild);
    p.appendChild(vf);
    setTimeout(function () { window.print(); }, 80);
  }

  /* ============================================================
     設定、說明
     ============================================================ */
  function openSettings() {
    var st = S.st, body = h('div'), tmp = { cmName: st.cmName, address: st.address, transAmount: st.transAmount, vendors: arr(st.vendors).join('\n'), headGap: st.headGap };
    var wf = {}; [1, 2, 3, 4, 5, 6, 7].forEach(function (n) { wf['w' + n] = String(st.weekFactor[n]); });
    var cust = JSON.parse(JSON.stringify(arr(st.customItems)));
    var c = { changed: function () { }, conds: [] };
    function rowEl(label, el) { return [h('div', { class: 'fl', text: label }), h('div', null, el)]; }
    var grid = h('div', { class: 'setgrid' });
    [].concat(
      rowEl('個管員姓名（新個案自動帶入；預設為登入帳號的姓名）', UI.textInput({ id: 'cmName', type: 'text', w: '12em', aria: '個管員姓名' }, tmp, c)),
      rowEl('預設居住地址', UI.textInput({ id: 'address', type: 'text', w: '100%', aria: '預設居住地址' }, tmp, c)),
      rowEl('DA01 交通額度（元/月）', UI.textInput({ id: 'transAmount', type: 'number', w: '8em', aria: '交通額度' }, tmp, c)),
      rowEl('交通服務單位（一行一個，依此順序顯示）', UI.textareaInput({ id: 'vendors', rows: 8, label: '交通服務單位' }, tmp, c)),
      rowEl('每週天數換算每月單位', h('div', { class: 'inline' }, [1, 2, 3, 4, 5, 6, 7].map(function (n) { return h('span', { class: 'inwrap' }, [n + '天', UI.textInput({ id: 'w' + n, type: 'number', w: '4em', aria: '每週' + n + '天換算' }, wf, c)]); }))),
      rowEl('「壹、」後面的間隔', UI.singleInput({ id: 'headGap', options: [{ v: '　', l: '全形空白' }, { v: '\t', l: 'Tab' }, { v: '', l: '不空' }], compact: 1, label: '間隔' }, tmp, c))
    ).forEach(function (el) { grid.appendChild(el); });
    body.appendChild(grid);
    body.appendChild(h('div', { class: 'pickgrp', text: '自訂常用服務項目（會出現在選取視窗）' }));
    var cl = h('div', { class: 'list' });
    var CATS = [['care', '照顧服務'], ['pro', '專業服務'], ['aids', '輔具及無障礙'], ['respite', '喘息'], ['short', '短照'], ['other', '其他']];
    function drawCust() {
      clear(cl);
      cust.forEach(function (it, i) {
        var sel = h('select', { class: 'inp', 'aria-label': '類別', onchange: function () { it.cat = sel.value; } });
        CATS.forEach(function (x) { sel.appendChild(h('option', { value: x[0], text: x[1] })); }); sel.value = it.cat || 'aids';
        cl.appendChild(h('div', { class: 'litem' }, [sel, UI.textInput({ id: 'code', type: 'text', w: '7em', ph: '代碼', aria: '代碼' }, it, c), UI.textInput({ id: 'name', type: 'text', w: '20em', ph: '項目名稱', aria: '項目名稱' }, it, c),
          h('button', { type: 'button', class: 'iconbtn rm', text: '移除', onclick: function () { cust.splice(i, 1); drawCust(); } })]));
      });
      cl.appendChild(h('button', { type: 'button', class: 'btn addbtn', text: '＋ 新增項目', onclick: function () { cust.push({ cat: 'aids', code: '', name: '' }); drawCust(); } }));
    }
    drawCust(); body.appendChild(cl);
    body.appendChild(h('div', { class: 'pickgrp', text: '存檔資料夾' }));
    var fsLab = h('span', { class: 'help' });
    function fsShow() { fsLab.textContent = !FS.ok ? '這個瀏覽器不支援自動存入資料夾（iPad 的 Safari、Firefox 都不支援）；按「存檔」時會改用下載或分享選單，由您選擇位置。' : FS.handle ? '目前：' + FS.handle.name + '（按「存檔」時自動分到「年度／月份」子資料夾）' : '尚未選擇。建議選「照顧計畫產生器」裡的「個案存檔」。'; }
    fsShow();
    body.appendChild(h('div', { class: 'inline' }, [FS.ok ? h('button', { type: 'button', class: 'btn sm', text: '選擇存檔資料夾', onclick: function () { chooseFolder().then(fsShow, function () { }); } }) : null, fsLab]));
    body.appendChild(h('div', { class: 'pickgrp', text: '設定檔與資料' }));
    body.appendChild(h('div', { class: 'inline' }, [
      h('button', { type: 'button', class: 'btn sm', text: '匯出設定檔（給同事用）', onclick: function () { UI.download('照顧計畫產生器_設定.json', JSON.stringify({ app: 'care-plan-generator-settings', st: S.st }, null, 1)); } }),
      h('button', { type: 'button', class: 'btn sm', text: '匯入設定檔', onclick: function () { UI.pickFile(function (o) { if (o && o.app === 'care-plan-generator-settings' && o.st) { S.st = migrateSettings(o.st); saveSettings(); dlg.close(); UI.toast('已套用設定'); rerender(); } else UI.toast('這不是設定檔'); }); } }),
      h('button', { type: 'button', class: 'btn sm danger', text: '清除這個帳號在這台裝置上的全部個案', onclick: function () {
        UI.confirmBox('清除全部個案', CLOUDON ? '這會刪除這個帳號在雲端與所有裝置上的全部個案資料，無法復原。需要保留的請先存檔。' : '這會刪除這個帳號在這台裝置上的所有個案資料，無法復原。需要保留的請先存檔。', '全部清除', function () { S.idx.forEach(function (m) { store.del(K.rec + m.id); }); S.idx = []; store.set(K.idx, S.idx); dlg.close(); renderHome(); }, true);
      } })]));
    var dlg = UI.dialog('設定', body, [{ label: '取消' }, { label: '儲存設定', pri: true, on: function () {
      st.cmName = nz(tmp.cmName); st.address = nz(tmp.address); st.transAmount = nz(tmp.transAmount) || '1840';
      st.vendors = nz(tmp.vendors).split(/[、,，\r\n]+/).map(nz).filter(Boolean); st.headGap = tmp.headGap === undefined ? '　' : tmp.headGap; delete st.showAddTag;
      [1, 2, 3, 4, 5, 6, 7].forEach(function (n) { var v = parseFloat(wf['w' + n]); if (v > 0) st.weekFactor[n] = v; });
      st.customItems = cust.filter(function (x) { return nz(x.code) || nz(x.name); });
      saveSettings(); UI.toast('設定已儲存'); rerender();
    } }]);
  }
  function openHelp() {
    var d = h('div', { class: 'helpdoc' });
    function sec(t, items, ordered) { d.appendChild(h('h3', { text: t })); d.appendChild(h(ordered ? 'ol' : 'ul', null, items.map(function (x) { return h('li', { text: x }); }))); }
    sec('首頁兩個入口', ['「撰寫計畫」：初評、出備初評、複評，依訪視評估表從頭寫出完整計畫。',
      '「AA01」：舊計畫保留，新內容貼在 CMS 各欄位最上方，與舊紀錄以「-----」區隔。']);
    sec('撰寫計畫的流程', [
      '按「撰寫計畫」。複評時可改用清單上的「複製為複評」，會帶入上次內容並比對服務差異。',
      '依左側 壹 → 貳 的分頁點選評估內容。每個分頁右側（平板在底部）會即時顯示這一段的計畫文字。',
      '到「參　照顧問題」依 CMS 核定的問題清單勾選，並調整說明。',
      '到「肆　服務規劃」選取服務碼、頻率與備註；「計畫目標」會自動擬一版短中長期目標。',
      '到「產生計畫」檢查提醒事項，分別複製「計畫目標」「計畫執行規劃」貼到 CMS。',
      '按右上角「存檔」，存出「○○訪視評估表.pdf」與「○○計畫內容.pdf」兩個 PDF。',
      '需要紙本或 PDF 時，按「列印評估表」。'], true);
    sec('AA01 的流程', ['在個案清單按「建立AA01」，會帶入姓名、在場人員與服務規劃（也可以按首頁的「AA01」從空白開始，填好姓名後會找到同姓名的撰寫計畫）。',
      '「個案概況」：生理、心理、居家環境、生活習慣各點「維持／進步／退步」並補充；再填照顧者狀況與服務使用狀況。',
      '「照顧問題」：淡藍底色是前次撰寫計畫勾選的問題，重新勾選排序前 5 項，逐項寫改善情形。',
      '「服務規劃」：服務頻率選「維持不變」時，會自動套入前次撰寫計畫的服務內容；也可以按「套入前次撰寫計畫的服務規劃」。',
      '「計畫目標」：先評值前次目標（已達成／部分達成…），新的短中長期目標自動產生並加上 1／3／6 個月。',
      '「其他備註」：核定 AA08／AA09 或有超額自費需求時勾選填寫。',
      '「產生計畫」複製三段文字，分別貼在 CMS 計畫目標、計畫執行規劃欄最上方及其他備註欄；存檔會存出「○○○AA01_日期.pdf」。'], true);
    sec('存檔與資料夾', ['電腦（Chrome 或 Edge）：第一次按「存檔」時選一次存檔資料夾，之後會自動依訪視日期存進「115年度／11月」這類子資料夾。',
      'iPad（Safari）：按「存檔」會跳出分享選單，請選「儲存到檔案」並自行選資料夾；Safari 無法自動分資料夾。',
      '存出的 PDF 可直接列印或傳給督導；PDF 內夾帶個案資料，在任何一台裝置用首頁的「匯入存檔」選 PDF 就能重新打開編輯（舊版存的 html 檔也可以）。',
      '個案會自動加密同步到雲端（Firebase 台灣機房），換手機、平板、電腦用同一個帳號登入都看得到；首頁帳號旁會顯示「已同步到雲端」或「離線中」。']);
    sec('雲端與離線', ['資料在裝置上加密後才上傳，只有用自己的帳號密碼才能解開，其他同仁與雲端業者都看不到內容。',
      '沒有網路時照常填寫，修改會先加密存在裝置上，連上網路後自動上傳。第一次在新裝置登入需要網路。',
      '與他人共用裝置時，用完請按「登出」：登出會刪除這台裝置上的解密金鑰。',
      '登入密碼若由管理者更換，第一次用新密碼登入時會要求輸入一次舊密碼，以解開原本的資料。']);
    sec('在 iPad 上使用', ['iPad 的 Safari 無法直接開啟「檔案」App 裡的 HTML 檔，開啟方式請見資料夾內的使用說明。']);
    sec('服務碼來源', ['服務碼名稱取自「長期照顧服務申請及給付辦法」附表四、附表四之一（114年6月19日修正）。', '標有「請核對」的是不在附表內的項目（短照 SC 碼、CMS 細分碼），名稱請以 CMS 顯示為準。', '法規修正後若碼別有變，可在「設定」新增自訂項目。']);
    UI.dialog('使用說明', d);
  }

  /* ---------- 啟動 ---------- */
  /* 啟動：已登入（7 天內）直接進首頁，否則顯示登入畫面 */
  function init() {
    var cloud = CLOUD.available();
    if (cloud) AUTH.setConnector(function (sess, pw, oldPw) { return CLOUD.connect(sess.u, pw, oldPw); });
    var sess = AUTH.current();
    if (!sess) { AUTH.render(start); return; }
    if (!cloud) { start(sess); return; }
    loading('正在載入…');
    /* 7 天內免輸入密碼：沿用這台裝置保存的雲端登入與資料金鑰；沒有就重新登入 */
    CLOUD.restore(sess.u).then(function (ok) { if (ok) start(sess); else { AUTH.logout(); AUTH.render(start); } });
  }
  function loading(t) {
    var app = clear(document.getElementById('app'));
    app.appendChild(h('div', { class: 'loadwrap' }, [h('span', { class: 'loadspin', 'aria-hidden': 'true' }), h('p', { text: t })]));
  }
  /* 同步狀態：已同步／同步中／離線 */
  var SYNC = { online: true, pending: 0 };
  function syncText() { return !SYNC.online ? (SYNC.pending ? '離線中，' + SYNC.pending + ' 項修改待上傳' : '離線中，連線後自動同步') : SYNC.pending ? '同步中…' : '已同步到雲端'; }
  function syncBadge() { return h('span', { class: 'syncbadge' + (!SYNC.online ? ' off' : SYNC.pending ? ' busy' : ''), text: syncText() }); }
  function paintSync() { Array.prototype.forEach.call(document.querySelectorAll('.syncbadge'), function (b) { b.textContent = syncText(); b.className = 'syncbadge' + (!SYNC.online ? ' off' : SYNC.pending ? ' busy' : ''); }); }
  /* 其他裝置更新了個案：首頁直接重畫；正在編輯的那一筆不覆蓋 */
  function onRemote(ids) {
    S.idx = buildIdx();
    if (!S.rec) renderHome();
  }
  function startCloud(sess) {
    loading('正在從雲端載入個案…');
    CLOUD.onStatus(function (x) { SYNC = x; paintSync(); });
    CLOUD.load(onRemote).then(function () {
      var local = UI.store, cs = CLOUD.store(K), fresh = !cs.get(K.st) && !local.get(K.st), mig = migrateLegacy(), up = 0, localIds = [];
      /* 這台裝置原本存在瀏覽器裡的個案與設定：加密上傳（雲端已有較新版本的不覆蓋），上傳確認後刪除本機明文 */
      var lst = local.get(K.st);
      if (lst && !cs.get(K.st)) cs.set(K.st, lst);
      (local.get(K.idx) || []).forEach(function (m) {
        var r = local.get(K.rec + m.id); if (!r) return;
        localIds.push(m.id);
        var c = CLOUD.recOf(m.id);
        if (!c || (c.updatedAt || 0) < (r.updatedAt || 0)) { cs.set(K.rec + m.id, r); up++; }
      });
      store = cs; CLOUDON = true;
      S.st = loadSettings(); S.idx = buildIdx(); store.set(K.idx, S.idx);
      if (fresh || !nz(S.st.cmName)) { S.st.cmName = sess.name; saveSettings(); }
      commonStart();
      if (lst || localIds.length) CLOUD.flush().then(function (res) {
        if (res.every(Boolean)) { localIds.forEach(function (id) { local.del(K.rec + id); }); local.del(K.idx); local.del(K.st); }
      });
      if (up || mig.cases) UI.toast('這台裝置原有的 ' + Math.max(up, mig.cases) + ' 筆個案，已加密同步到 ' + sess.name + ' 的雲端帳號');
    });
  }
  function start(sess) {
    S.sess = sess; useAccount(sess.u);
    if (CLOUD.available() && CLOUD._T.key) { startCloud(sess); return; }
    var fresh = !store.get(K.st), mig = migrateLegacy(), moved = mig.cases;
    S.st = loadSettings(); S.idx = store.get(K.idx) || [];
    if (fresh || !nz(S.st.cmName)) { S.st.cmName = sess.name; saveSettings(); }
    commonStart();
    if (moved) UI.toast('這台裝置原有的 ' + moved + ' 筆個案，已歸到 ' + sess.name + ' 的帳號');
  }
  function commonStart() {
    var dl = h('datalist', { id: 'dl-relations' }); DATA.relations.forEach(function (r) { dl.appendChild(h('option', { value: r })); }); document.body.appendChild(dl);
    window.addEventListener('beforeunload', function () { if (S.rec && S.timer) saveNow(); if (CLOUDON) CLOUD.flush(); });
    window.addEventListener('pagehide', function () { if (S.rec && S.timer) saveNow(); if (CLOUDON) CLOUD.flush(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { if (S.rec && S.timer) saveNow(); if (CLOUDON) CLOUD.flush(); } });
    loadFolder();
    /* 經由網址（http/https）開啟時註冊離線快取，讓 iPad「加入主畫面」後可離線使用；直接開檔案時不需要 */
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { try { navigator.serviceWorker.register('sw.js').catch(function () { }); } catch (e) { } }
    renderHome();
  }
  return { init: init, _writeToFolder: writeToFolder, _caseFiles: caseFiles, _caseNames: caseNames, _import: importRec, _jump: jumpTo, _S: S, _open: openRec, _new: newRecord, _show: function (id) { showSection(id); }, _norm: normalize, _formHtml: formHtml };
})();
