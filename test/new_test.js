/* 第二輪新增功能：額度帶入、目標換寫法、跳到未填欄位、複評、身障選項、輔具評估分組、稱謂自行填寫 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const S = require('./samples.js');
const H = require('./helpers.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
(async () => {
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  let failed = 0; const errors = [];
  const ok = (c, m) => { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE); await H.enter(page);
  /* 額度：CMS 2 級 → GA09 42、SC09 114；7 級 → 63、93 */
  const f = { name: '額度測試', cmName: '個管', visitDate: '2026-11-15', cms: '3', foreign: '有', careFlags: ['聘有外籍看護'] };
  await page.evaluate(f => APP._open(APP._norm({ id: 'q', f: f, changes: [] })), f);
  await page.evaluate(() => APP._show('plan'));
  async function pick(btn, code) { await page.click('text=' + btn); await page.fill('input[type=search]', code); await page.click('.pickgrid .chip >> nth=0'); await page.click('.dialog >> text=完成'); }
  await pick('＋ 選取喘息服務項目', 'GA09');
  await pick('＋ 選取短照服務項目', 'SC09');
  let u = await page.evaluate(() => [APP._S.rec.f.pRespite[0].units, APP._S.rec.f.pShort[0].units, APP._S.rec.f.pRespitePeriod]);
  ok(u[0] === '42' && u[1] === '114' && u[2] === '115.11-116.10', 'CMS 第3級自動帶入 GA09 42、SC09 114、區間 115.11-116.10：' + u.join(' / '));
  await page.evaluate(() => { APP._S.rec.f.cms = '7'; APP._show('plan'); });
  await page.click('[data-fid="pRespitePeriod"] >> text=依 CMS 等級帶入單位數上限');
  await page.click('[data-fid="pShortPeriod"] >> text=依 CMS 等級帶入單位數上限');
  u = await page.evaluate(() => [APP._S.rec.f.pRespite[0].units, APP._S.rec.f.pShort[0].units]);
  ok(u[0] === '63' && u[1] === '93', 'CMS 第7級重新帶入 GA09 63、SC09 93（與範例6相同）：' + u.join(' / '));
  /* 輔具：免評估／需評估 */
  await page.click('text=＋ 選取輔具及無障礙項目');
  const groups = await page.locator('.dialog .pickgrp').allInnerTexts();
  ok(groups[0].startsWith('免評估') && groups.some(g => g.startsWith('需評估｜居家無障礙')), '輔具選取視窗分為免評估／需評估：' + groups.length + ' 組');
  await page.fill('input[type=search]', 'FA31'); await page.click('.pickgrid .chip >> nth=0');
  await page.fill('input[type=search]', 'EA01-3'); await page.click('.pickgrid .chip >> nth=0');
  await page.click('.dialog >> text=完成');
  const tags = await page.locator('[data-fid="blk-pAids"] .shead').allInnerTexts();
  ok(tags.some(t => t.includes('FA31') && t.includes('需評估')) && tags.some(t => t.includes('EA01-3') && t.includes('免評估')), '輔具行顯示評估標記');
  /* 目標：三種寫法不同 */
  await page.evaluate(() => { const f = APP._S.rec.f; f.pCare = [{ id: 'a', code: 'BA07', name: '協助沐浴及洗頭', mode: 'week', n: 2, each: '1' }]; f.careFlags = []; f.foreign = ''; APP._show('goals'); });
  await page.waitForTimeout(80);
  const v = [];
  for (let i = 0; i < 3; i++) { v.push(await page.locator('textarea[aria-label="1、短期目標"]').inputValue()); await page.click('button:has-text("換一種寫法")'); await page.waitForTimeout(50); }
  ok(new Set(v).size === 3, '目標三種寫法皆不同：\n      ' + v.join('\n      '));
  /* 跳到未填欄位 */
  await page.evaluate(() => { APP._S.rec.f.cmName = ''; APP._show('output'); });
  await page.click('.warnlist li:has-text("個管員姓名") >> text=前往');
  await page.waitForTimeout(250);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));
  ok(focused === '個管員姓名', '「前往填寫」跳到並聚焦個管員姓名欄：' + focused);
  await page.evaluate(() => APP._show('output'));
  await page.click('.warnlist li:has-text("心理面向") >> text=前往');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => APP._S.sec) === 'psych' && await page.locator('.attn').count() === 1, '跳到心理面向並標示欄位');
  /* 身障類別等級 */
  await page.evaluate(() => APP._show('phys'));
  await page.click('[aria-label="身心障礙證明"] >> text=有');
  await page.click('[aria-label="障礙類別（新制，可複選）"] >> text=第二類');
  await page.click('[aria-label="障礙等級"] >> text=重度');
  let d = await page.locator('.draftbody').innerText();
  ok(d.includes('領有身心障礙證明(新制第二類重度)'), '身障選項寫入草稿');
  /* 稱謂：自行填寫 */
  await page.evaluate(() => APP._show('basic'));
  await page.click('text=＋ 新增參與者');
  await page.selectOption('.litem select[aria-label="稱謂"]', '__custom');
  await page.fill('.litem input[aria-label="稱謂（自行填寫）"]', '案乾女兒');
  d = await page.locator('.draftbody').innerText();
  ok(d.includes('及案乾女兒討論照顧計畫'), '稱謂自行填寫：' + d.slice(0, 60));
  /* 複評 */
  await page.evaluate(f => { APP._open(APP._norm({ id: 'r1', f: f, changes: [] })); }, S.homeCare);
  await page.waitForTimeout(700);
  await page.click('.top >> text=返回首頁');
  ok(await page.locator('text=複製為複評').count() === 0, '個案清單已移除「複製為複評」');
  /* 舊資料中帶有前次紀錄的複評：仍可比對差異 */
  await page.evaluate(f0 => {
    const prev = JSON.parse(JSON.stringify(f0)), f = JSON.parse(JSON.stringify(f0));
    f.visitType = '複評'; f.svcStatus = '使用服務中個案'; f.visitDate = '2026-11-20';
    f.gait = '輪椅代步'; f.pCare = f.pCare.filter(l => l.code !== 'BA20'); f.pCare[0].n = 3;
    APP._open(APP._norm({ id: 'r2', f: f, prev: { date: f0.visitDate, f: prev }, changes: [] })); APP._show('output');
  }, S.homeCare);
  const rp = await page.locator('textarea[aria-label="與前次計畫不同之處"]').inputValue();
  ok(/BA07協助沐浴及洗頭由9單位\/月調整為14單位\/月/.test(rp) && rp.includes('取消BA20陪伴服務'), '複評自動比對差異：' + rp);
  const goal = await page.locator('textarea[aria-label="計畫目標"]').inputValue();
  ok(/^壹、　本案於115年11月\d+日與照專一同複評家訪/.test(goal) && goal.includes('與前次計畫相比'), '複評：開頭為複評家訪、服務使用狀況帶入差異');
  ok(await page.locator('[aria-label="複評寫法"]').count() === 0, '撰寫計畫已不提供摘要版（改由「計畫更新／異動」）');
  /* 訪視類型：四個選項；舊資料轉換 */
  await page.evaluate(() => APP._show('basic'));
  ok(JSON.stringify(await page.locator('[aria-label="訪視類型"] .chip').allInnerTexts()) === JSON.stringify(['初評', '出備初評', '複評']), '訪視類型為「初評」「出備初評」「複評」（AA01 已獨立）');
  const vt = await page.evaluate(() => [['複評'], ['AA01'], ['初評'], ['初評', 'AA01'], '複評/AA01', '出備初評'].map(v => APP._norm({ id: 'vt', f: { visitType: v }, changes: [] }).f.visitType));
  ok(JSON.stringify(vt) === JSON.stringify(['複評', '複評', '初評', '複評', '複評', '出備初評']), '舊資料訪視類型轉換：' + vt.join('、'));
  await page.screenshot({ path: path.join(OUT, 'review_output.png'), fullPage: false });
  /* 交通單位：按鈕與計畫文字用簡稱；舊個案、前次紀錄、設定的全名自動換成簡稱 */
  const mig = await page.evaluate(() => {
    const r = APP._norm({ id: 'mv', f: { name: '車隊測試', pTrans: '使用', pVendors: ['亞捷', '金永國際租賃有限公司', '亞捷汽車租賃股份有限公司', '大豐交通有限公司台北市分公司', '__other'], pVendors__other: '某某車行' }, prev: { date: '2026-10-01', f: { pVendors: ['捷安租賃股份有限公司'] } }, changes: [] });
    return { cur: r.f.pVendors, prev: r.prev.f.pVendors };
  });
  ok(JSON.stringify(mig.cur) === JSON.stringify(['亞捷', '金永', '大豐交通', '__other']) && mig.prev[0] === '捷安', '舊個案全名換成簡稱且不重複：' + mig.cur.join('、') + '；前次：' + mig.prev.join('、'));
  await page.evaluate(() => { APP._open(APP._norm({ id: 'mv2', f: { name: '車隊測試', cmName: '個管', visitDate: '2026-11-15', pTrans: '使用', pVendors: ['吉盛交通股份有限公司'] }, changes: [] })); APP._show('plan'); });
  const chk = await page.locator('[aria-label="服務單位"] .chip[aria-checked="true"]').allInnerTexts();
  ok(chk.length === 1 && chk[0] === '吉盛', '開啟舊個案時選單顯示簡稱已勾選：' + chk.join('、'));
  ok((await page.locator('.draftbody').innerText()).includes('DA01交通接送:1840元/月(吉盛)。'), '產出寫簡稱');
  const vnames = await page.locator('[aria-label="服務單位"] .chip').allInnerTexts();
  const wantV = ['亞捷', '捷安', '金永', '北台灣', '好爸爸', '吉盛', '太豐', '振生', '福倫', '勝安', '優遊', '台灣福祉車', '樂康協會', '小驢駒', '樂格適', '大豐國際', '駿德', '生活', '樂活協會', '三揚', '大豐交通', '其他'];
  ok(JSON.stringify(vnames) === JSON.stringify(wantV), '服務單位依指定順序 21 個簡稱＋其他：' + vnames.join('、'));
  await page.evaluate(() => { APP._S.rec.f.cms = '3'; APP._S.rec.f.pShort = [{ id: 's', code: 'SC09', name: '居家短照服務', units: '' }]; APP._show('plan'); });
  ok(!(await page.locator('[data-fid="blk-pShort"]').innerText()).includes('請以 CMS 為準'), '短照額度不再顯示「請以 CMS 為準」');
  const fullOld = await page.evaluate(() => APP._S.st.vendors.length);
  for (const [st, expectFirst, expectLen, label] of [
    [{ vendors: ['亞捷', '捷安', '金永', '北台灣', '好爸爸', '吉盛'] }, '亞捷', 21, '最早六個簡稱的預設換成新名單'],
    [{ vendors: ['亞捷汽車租賃股份有限公司', '捷安租賃股份有限公司', '金永國際租賃有限公司', '北台灣無障礙運輸產業工會', '好爸爸無障礙爬梯機接送有限公司', '吉盛交通股份有限公司', '太豐交通有限公司', '勝安租賃有限公司', '優遊小客車租賃有限公司', '台灣福祉車租賃有限公司', '社團法人台灣樂康協會', '小驢駒小客車租賃有限公司', '樂格適小客車租賃有限公司', '大豐國際租賃有限公司', '駿德租賃有限公司', '福倫交通股份有限公司', '生活交通有限公司', '社團法人台灣樂活協會', '社團法人振生長期照顧協會', '三揚國際租賃有限公司', '大豐交通有限公司台北市分公司'] }, '亞捷', 21, '115.9 版全名預設換成新簡稱名單'],
    [{ vendors: ['吉盛交通股份有限公司', '自訂車行'] }, '吉盛', 2, '自行修改過的設定保留，全名換成簡稱']]) {
    const p2 = await ctx.newPage();
    await p2.goto(FILE); await H.enter(p2);
    await p2.evaluate(st => {
      localStorage.setItem('cpgen.' + APP._S.sess.u + '.settings', JSON.stringify(st));
      /* 雲端模式：清掉雲端上的設定，讓這台裝置的舊設定重新上傳 */
      const fs = JSON.parse(localStorage.getItem('__fakefs') || 'null');
      if (fs) { Object.keys(fs.docs).forEach(k => { if (/\/meta\/settings$/.test(k)) delete fs.docs[k]; }); localStorage.setItem('__fakefs', JSON.stringify(fs)); }
    }, st);
    await p2.reload(); await H.enter(p2);
    const v2 = await p2.evaluate(() => APP._S.st.vendors);
    ok(v2[0] === expectFirst && v2.length === expectLen && (expectLen !== 21 || v2[7] === '振生'), label + '：' + v2.slice(0, 3).join('、') + '…共 ' + v2.length + ' 個');
    await p2.evaluate(() => localStorage.removeItem('cpgen.' + APP._S.sess.u + '.settings'));
    await p2.close();
  }

  /* ===== 115.11.17 修改：全部展開、肌力小人圖、新選項、AA碼移除、訪視評估表 ===== */
  await page.evaluate(f => { APP._open(APP._norm({ id: 'v3', f: f, changes: [] })); }, S.dayCare);
  for (const sec of ['basic', 'phys', 'psych', 'family', 'home', 'routine', 'svc']) {
    await page.evaluate(s => APP._show(s), sec);
    ok(await page.locator('details.more').count() === 0, '「' + sec + '」沒有收合的「更多選填」');
  }
  await page.evaluate(() => APP._show('phys'));
  ok(await page.locator('[data-fid="lostHas"]').isVisible() && await page.locator('[data-fid="phoneUse"]').isVisible(), '走失史、使用電話直接顯示');
  ok(JSON.stringify(await page.locator('[aria-label="使用電話"] .chip').allInnerTexts()) === JSON.stringify(['自理', '部分協助', '完全依賴', '可接聽', '可撥熟悉電話']), '使用電話新增「可接聽」「可撥熟悉電話」（單選）');
  await page.click('[aria-label="使用電話"] >> text=可撥熟悉電話');
  ok((await page.locator('.draftbody').innerText()).includes('可接聽電話及撥打熟悉的電話號碼'), '使用電話「可撥熟悉電話」寫入草稿');
  /* 肌力：八格 */
  const msel = await page.locator('.bodystage select').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  ok(msel.length === 8 && ['右上臂', '右前臂', '右大腿', '右小腿', '左上臂', '左前臂', '左大腿', '左小腿'].every(n => msel.includes(n + '肌力')), '肌力分上臂、前臂、大腿、小腿左右共八格：' + msel.join('、'));
  await page.selectOption('select[aria-label="右上臂肌力"]', '4'); await page.selectOption('select[aria-label="右前臂肌力"]', '4');
  await page.selectOption('select[aria-label="左大腿肌力"]', '3'); await page.selectOption('select[aria-label="左小腿肌力"]', '2');
  let dd = await page.locator('.draftbody').innerText();
  ok(dd.includes('肌力約右上肢4分、左大腿3分、左小腿2分'), '肌力寫法（同肢兩段相同時合寫）：' + (dd.match(/肌力約[^，。]*/) || [''])[0]);
  const box = await page.locator('.bodystage select[aria-label="右上臂肌力"]').boundingBox(), stage = await page.locator('.bodystage').boundingBox();
  ok(box.x - stage.x < stage.width * 0.1 && box.y > stage.y, '右側肢段的格子在人形左邊（人形面向讀者）');
  /* 如廁可複選＋預防性穿尿片 */
  await page.click('[aria-label="如廁方式（可複選）"] >> text=預防性穿尿片');
  ok(JSON.stringify(await page.evaluate(() => APP._S.rec.f.toilet)) === JSON.stringify(['可自行至廁所', '預防性穿尿片']), '如廁方式可複選');
  ok((await page.locator('.draftbody').innerText()).includes('平時預防性穿著尿片'), '預防性穿尿片寫入草稿');
  ok(JSON.stringify(await page.evaluate(() => APP._norm({ id: 'm', f: { toilet: '使用便盆椅', spirit: '佳' }, changes: [] }).f)).includes('"toilet":["使用便盆椅"],"spirit":["佳"]'), '舊資料如廁、精神狀態轉成複選');
  await page.evaluate(() => APP._show('basic'));
  ok(JSON.stringify(await page.locator('[aria-label="身分別"] .chip').allInnerTexts()) === JSON.stringify(['第一類', '第二類', '第三類']), '身分別只有第一類～第三類（單選）');
  const idv = await page.evaluate(() => [['三類', '身障'], ['身障', '榮民(/眷)'], ['一類']].map(v => APP._norm({ id: 'i', f: { identity: v }, changes: [] }).f.identity));
  ok(JSON.stringify(idv) === JSON.stringify(['第三類', '', '第一類']), '舊資料身分別轉換：' + JSON.stringify(idv));
  await page.evaluate(() => APP._show('phys'));
  /* 備餐者：居服員列在第一個 */
  const mealOpts = await page.locator('select[aria-label="備餐者"] option').allInnerTexts();
  ok(mealOpts[1] === '居服員', '備餐者選單第一個是居服員：' + mealOpts.slice(0, 4).join('、'));
  await page.selectOption('select[aria-label="備餐者"]', '居服員');
  ok((await page.locator('.draftbody').innerText()).includes('由居服員準備'), '備餐者居服員寫入草稿');
  /* 精神狀態可複選 */
  await page.evaluate(() => APP._show('psych'));
  await page.evaluate(() => { APP._S.rec.f.spirit = []; APP._show('psych'); });
  await page.click('[aria-label="精神狀態（可複選）"] >> text=疲倦'); await page.click('[aria-label="精神狀態（可複選）"] >> text=嗜睡');
  ok((await page.locator('.draftbody').innerText()).includes('精神較疲倦、嗜睡'), '精神狀態可複選：' + JSON.stringify(await page.evaluate(() => APP._S.rec.f.spirit)));
  /* 探視：多以電話聯繫 */
  await page.evaluate(() => { APP._S.rec.f.members[1].visit = '多以電話聯繫'; APP._show('family'); });
  ok((await page.locator('.draftbody').innerText()).includes('平時多以電話聯繫'), '探視「多以電話聯繫」寫入草稿');
  ok((await page.locator('[aria-label="探視"] .chip').allInnerTexts()).includes('多以電話聯繫'), '探視新增「多以電話聯繫」選項');
  /* 出備初評 */
  await page.evaluate(() => { APP._S.rec.f.visitType = '出備初評'; APP._show('basic'); });
  ok((await page.locator('.draftbody').innerText()).includes('出院準備初評家訪'), '出備初評寫成「出院準備初評家訪」');
  /* 其他服務項目：AA碼移除 */
  await page.evaluate(() => APP._show('plan'));
  await page.click('text=＋ 選取其他服務項目');
  const otherCodes = await page.locator('.dialog .pickgrid .chip').allInnerTexts();
  ok(otherCodes.length > 0 && !otherCodes.some(t => /AA\d/.test(t)), '其他服務項目沒有 AA 碼：' + otherCodes.map(t => t.split(/\s/)[0]).join('、'));
  await page.click('.dialog >> text=完成');
  /* 訪視評估表：小人圖與疼痛量表 */
  await page.evaluate(() => { const f = APP._S.rec.f; f.painHas = '有'; f.painScore = 6; f.painSite = '右膝'; });
  const form = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = APP._formHtml(APP._S.rec); return { body: d.querySelectorAll('svg.bodysvg').length, pain: d.querySelectorAll('svg.painsvg').length, painLabel: (d.querySelector('svg.painsvg') || {}).getAttribute && d.querySelector('svg.painsvg').getAttribute('aria-label'), boxes: [...d.querySelectorAll('svg.bodysvg text')].map(t => t.textContent).filter(t => /分$/.test(t)), sig: !!d.querySelector('.sig'), sum: d.querySelector('.sum') && d.querySelector('.sum').innerText }; });
  ok(form.body === 1 && form.boxes.join(',') === '4 分,4 分,3 分,2 分', '訪視評估表有肌力小人圖並帶入分數：' + form.boxes.join(','));
  ok(form.pain === 1 && form.painLabel.includes('6分'), '訪視評估表有疼痛量表並標示 6 分');
  ok(form.sig, '訪視評估表有簽章欄');
  /* 列印版面截圖（A4） */
  const fp = await ctx.newPage();
  await fp.setContent(await page.evaluate(() => APP._formHtml(APP._S.rec)));
  await fp.screenshot({ path: path.join(OUT, 'form_screen.png'), fullPage: true });
  await fp.emulateMedia({ media: 'print' });
  await fp.pdf({ path: path.join(OUT, 'form_print.pdf'), format: 'A4', printBackground: true });
  await fp.close();
  console.log('errors:', errors.length ? errors : 'none');
  console.log(failed ? 'FAILED ' + failed : 'ALL PASSED');
  await browser.close(); process.exit(failed || errors.length ? 1 : 0);
})();
