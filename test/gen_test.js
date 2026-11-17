/* 以 Node 直接跑文字產生器，檢查輸出 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['catalog.js', 'data.js', 'schema.js', 'narrative.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + '\nthis.DATA=DATA;this.NAR=NAR;this.SCHEMA=SCHEMA;', ctx);
const S = require('./samples.js');
const st = ctx.DATA.defaults;
for (const k of Object.keys(S)) {
  console.log('==================== ' + k + ' ：計畫目標 ====================');
  console.log(ctx.NAR.goalText(S[k], st));
  console.log('-------------------- ' + k + ' ：計畫執行規劃 --------------------');
  console.log(ctx.NAR.plan(S[k], st));
  console.log('-------------------- checks --------------------');
  console.log(ctx.NAR.checks(S[k]).map(x => x.msg).join(' | '));
}
/* 計畫更新／異動：疊加在 CMS 舊計畫上方 */
const up = ctx.NAR.updateTexts({
  name: '王大同', visitDate: '2026-11-15', upHow: '電訪', upWith: '案女', cmName: '測試個管', upReason: '個案近期下肢較無力，服務需求變更',
  upCond: '個案下肢較無力，行走需以輪椅代步，外出需有人陪同',
  pCare: [
    { code: 'BA07', name: '協助沐浴及洗頭', act: '新增', mode: 'week', n: 2, each: '1' },
    { code: 'BA02', name: '基本日常照顧', act: '調整', from: '14', mode: 'week', n: 5, each: '1' },
    { code: 'BA20', name: '陪伴服務', act: '取消' }],
  upTrans: '調整', pTransAmt: '2400', upTransFrom: '1840', pVendors: ['吉盛'],
  pRespite: [{ code: 'GA09', name: '居家喘息服務', act: '維持', units: '42' }], pRespitePeriod: '115.11-116.10'
}, st);
console.log('==================== 計畫更新／異動：計畫目標欄 ====================\n' + up.goal + '\n\n---- 計畫執行規劃欄 ----\n' + up.plan);
