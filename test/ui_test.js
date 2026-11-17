/* 以無頭瀏覽器實測：開啟離線檔、逐頁檢查錯誤、實際點選、截圖 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const S = require('./samples.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const SECS = ['basic', 'phys', 'psych', 'family', 'home', 'routine', 'svc', 'problems', 'plan', 'goals', 'output'];

(async () => {
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  const errors = [];
  let failed = 0;
  function ok(cond, msg) { if (!cond) { failed++; console.log('FAIL  ' + msg); } else console.log('ok    ' + msg); }

  /* ---- 1. 桌機：互動測試 ---- */
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  let page = await ctx.newPage();
  const requests = [];
  page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(FILE);
  ok(await page.locator('.mode >> text=撰寫計畫').count() > 0 && await page.locator('.mode >> text=計畫更新／異動').count() > 0, '首頁顯示兩個入口');
  await page.click('.mode >> text=撰寫計畫');
  await page.fill('input[aria-label="個案姓名"]', '測試阿嬤');
  await page.fill('input[aria-label="個管員姓名"]', '測試個管');
  await page.click('[aria-label="與照專一同家訪"] >> text=是');
  await page.click('text=＋ 新增參與者');
  await page.selectOption('.litem select[aria-label="稱謂"]', '案女');
  await page.fill('.litem input[aria-label="姓名"]', '陳小美');
  let d = await page.locator('.draftbody').innerText();
  ok(/與照專一同家訪，與個案測試阿嬤及案女陳小美討論照顧計畫\/個管測試個管。/.test(d), '壹：草稿即時更新 → ' + d);
  await page.click('.rail a[data-sec="phys"]');
  await page.click('[aria-label="疾病史"] >> text=高血壓');
  await page.click('[aria-label="疾病史"] >> text=糖尿病');
  await page.fill('input[aria-label="糖尿病 備註"]', '口服藥物控制');
  await page.click('[aria-label="視力"] >> text=正常');
  await page.click('[aria-label="聽力"] >> text=正常');
  await page.click('[aria-label="步態"] >> text=不穩需攙扶');
  ok(await page.locator('[aria-label="協助程度"]').isVisible(), '條件欄位：選「不穩需攙扶」後出現協助程度');
  await page.click('[aria-label="協助程度"] >> text=中');
  await page.fill('input[aria-label="身高"]', '160'); await page.fill('input[aria-label="體重"]', '60');
  d = await page.locator('.draftbody').innerText();
  ok(/個案有高血壓、糖尿病\(口服藥物控制\)等病史/.test(d) && /視聽力佳/.test(d) && /行走需他人中度攙扶/.test(d) && /BMI23\.44/.test(d), '生理：草稿內容正確');
  /* 服務規劃：選取 + 頻率 */
  await page.click('.rail a[data-sec="plan"]');
  await page.click('text=＋ 選取照顧服務項目');
  await page.fill('input[type=search]', 'BA07');
  await page.click('.pickgrid .chip');
  await page.click('.dialog >> text=完成');
  await page.click('.sline [aria-label="每週天數"] >> text=3');
  d = await page.locator('.sline .sprev').first().innerText();
  ok(d === 'BA07協助沐浴及洗頭:14單位/月(每週三天各1單位)', '服務行：' + d);
  await page.fill('.sline input[aria-label="每月單位數"]', '15');
  d = await page.locator('.sline .sprev').first().innerText();
  ok(/15單位\/月/.test(d), '手動改單位數：' + d);
  await page.click('[aria-label="DA01 交通接送"] >> text=使用');
  await page.click('[aria-label="服務單位"] >> text=金永');
  await page.click('.rail a[data-sec="goals"]');
  await page.waitForTimeout(100);
  d = await page.locator('textarea[aria-label="1、短期目標"]').inputValue();
  ok(/提供每週三天居家服務/.test(d) && /交通車/.test(d), '目標自動產生：' + d);
  await page.click('.rail a[data-sec="problems"]');
  await page.click('.probgrid >> text=洗澡問題');
  ok(await page.locator('.selprob textarea').count() === 1, '照顧問題：勾選後出現說明欄');
  await page.click('.rail a[data-sec="output"]');
  const goal = await page.locator('textarea[aria-label="計畫目標"]').inputValue();
  const plan = await page.locator('textarea[aria-label="計畫執行規劃"]').inputValue();
  ok(goal.startsWith('壹、') && goal.includes('參、') && goal.includes('肆、') && goal.trim().endsWith('個管員：測試個管'), '產出：計畫目標結構完整');
  ok(plan.includes('BA07協助沐浴及洗頭:15單位/月') && plan.includes('DA01交通接送:1840元/月(金永)。'), '產出：計畫執行規劃內容正確');
  /* 自動儲存後重新整理仍在 */
  await page.waitForTimeout(900);
  await page.reload();
  ok(await page.locator('.caselist >> text=測試阿嬤').count() === 1, '重新整理後個案仍在清單（本機儲存）');
  await page.click('.caselist >> text=開啟');
  ok((await page.locator('input[aria-label="個案姓名"]').inputValue()) === '測試阿嬤', '重新開啟後資料完整');
  ok(requests.length === 0, '沒有任何對外連線（' + requests.length + '）');
  await ctx.close();

  /* ---- 2. 帶入範例資料逐頁截圖（桌機、平板橫、平板直） ---- */
  const sizes = [['desktop', 1440, 900], ['tabletL', 1180, 820], ['tabletP', 820, 1180], ['phone', 390, 800]];
  for (const [name, w, hgt] of sizes) {
    ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1 });
    page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    await page.goto(FILE);
    await page.screenshot({ path: path.join(OUT, name + '_00_home.png') });
    /* 計畫更新／異動頁：各尺寸不可水平溢出 */
    await page.evaluate(() => APP._open(APP._norm({ id: 'up', kind: 'update', changes: [], f: { name: '王大同', visitDate: '2026-11-15', upHow: '電訪', upWith: '案女', cmName: '測試個管', upCond: '個案下肢較無力',
      pCare: [{ id: 'a', code: 'BA07', name: '協助沐浴及洗頭', act: '新增', mode: 'week', n: 2, each: '1' }, { id: 'b', code: 'BA02', name: '基本日常照顧', act: '調整', from: '14', mode: 'week', n: 5, each: '1' }, { id: 'c', code: 'BA20', name: '陪伴服務', act: '取消' }],
      upTrans: '新增', pTransAmt: '1840', pVendors: ['吉盛'] } })));
    await page.waitForTimeout(120);
    const uo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (uo > 1) { failed++; console.log('FAIL  ' + name + ' / 更新異動頁 水平溢出 ' + uo + 'px'); }
    await page.screenshot({ path: path.join(OUT, name + '_update_full.png'), fullPage: true });
    await page.evaluate(f => { APP._open(APP._norm({ id: 'demo', f: f, changes: [] })); }, S.dayCare);
    for (const s of SECS) {
      await page.evaluate(id => APP._show(id), s);
      await page.waitForTimeout(120);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) { failed++; console.log('FAIL  ' + name + ' / ' + s + ' 水平溢出 ' + overflow + 'px'); }
      if (name === 'desktop' || ['basic', 'phys', 'family', 'plan', 'output'].includes(s)) await page.screenshot({ path: path.join(OUT, name + '_' + s + '.png') });
    }
    if (name === 'desktop') {
      await page.evaluate(() => APP._show('phys'));
      await page.screenshot({ path: path.join(OUT, 'desktop_phys_full.png'), fullPage: true });
      await page.evaluate(() => APP._show('plan'));
      await page.screenshot({ path: path.join(OUT, 'desktop_plan_full.png'), fullPage: true });
      await page.evaluate(() => APP._show('family'));
      await page.screenshot({ path: path.join(OUT, 'desktop_family_full.png'), fullPage: true });
    }
    if (name === 'tabletL') {
      /* 手繪家系圖：用指標事件畫一筆，確認有存下來 */
      await page.evaluate(() => APP._show('family'));
      const cv = page.locator('canvas.sketch'); await cv.scrollIntoViewIfNeeded();
      const bb = await cv.boundingBox();
      await page.mouse.move(bb.x + 30, bb.y + 30); await page.mouse.down(); await page.mouse.move(bb.x + 160, bb.y + 110, { steps: 6 }); await page.mouse.up();
      const saved = await page.evaluate(() => (APP._S.rec.f.genogram || '').slice(0, 22));
      if (saved !== 'data:image/png;base64,') { failed++; console.log('FAIL  手繪板未儲存 ' + saved); } else console.log('ok    手繪家系圖可畫並儲存');
    }
    if (name === 'tabletP') {
      await page.evaluate(() => APP._show('phys'));
      await page.click('.drafttoggle');
      await page.screenshot({ path: path.join(OUT, 'tabletP_phys_draftopen.png') });
    }
    await ctx.close();
  }
  console.log('errors:', errors.length ? errors : 'none');
  console.log(failed ? ('FAILED ' + failed) : 'ALL PASSED');
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
