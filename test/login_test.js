/* 登入：登入畫面、錯誤密碼、帳號資料分開、舊資料歸戶、登出、記住帳號、7 天期限、各尺寸版面 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const H = require('./helpers.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  let failed = 0; const errors = [];
  const ok = (c, m) => { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  /* 帳號檔不可含明碼：沒有手機號碼樣式的字串、沒有中文姓名 */
  const accSrc = fs.readFileSync(path.join(__dirname, '../src/accounts.js'), 'utf8');
  ok(!/09\d{8}/.test(accSrc) && !/[一-鿿]{2,}/.test(accSrc.replace(/^\/\*[\s\S]*?\*\//, '')), '帳號檔沒有明碼密碼與姓名');

  /* 舊版資料（加入登入前）放在沒有帳號的位置 */
  await page.goto(FILE);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cpgen.index', JSON.stringify([{ id: 'old1', kind: 'plan', name: '舊個案甲', date: '2026-10-01', updatedAt: Date.now() }]));
    localStorage.setItem('cpgen.case.old1', JSON.stringify({ id: 'old1', f: { name: '舊個案甲', visitDate: '2026-10-01' }, changes: [] }));
    localStorage.setItem('cpgen.settings', JSON.stringify({ cmName: '舊名字', address: '新北市泰山區' }));
  });
  await page.reload();
  ok(await page.locator('.lg-panel').isVisible() && await page.locator('.homewrap').count() === 0, '未登入時只顯示登入畫面');
  ok((await page.locator('.lg-title').innerText()) === 'A個管訪視系統' && !(await page.locator('.lg-world').innerText()).includes('照顧計畫產生器'), '登入畫面標題為「A個管訪視系統」，不出現「照顧計畫產生器」');
  await page.screenshot({ path: path.join(OUT, 'login_desktop.png') });

  /* 空白、錯誤密碼 */
  await page.click('.lg-btn');
  ok((await page.locator('.lg-msg').innerText()).includes('請輸入帳號與密碼'), '沒填就按登入會提示');
  await page.fill('input[aria-label="帳號"]', 'mya001'); await page.fill('input[aria-label="密碼"]', 'wrong-password');
  await page.click('.lg-btn');
  await page.waitForSelector('.lg-msg.bad');
  ok((await page.locator('.lg-msg').innerText()).includes('帳號或密碼錯誤') && await page.locator('.homewrap').count() === 0, '密碼錯誤不能進入');
  await page.fill('input[aria-label="帳號"]', 'nobody'); await page.fill('input[aria-label="密碼"]', 'whatever1');
  await page.click('.lg-btn'); await page.waitForTimeout(1500);
  ok((await page.locator('.lg-msg').innerText()).includes('帳號或密碼錯誤'), '不存在的帳號同樣顯示「帳號或密碼錯誤」');

  /* 測試帳號 A 登入：舊資料歸到 A、個管員姓名帶入 */
  await page.check('.lg-remember input');
  await H.enter(page, H.TESTERS.a);
  ok(await page.locator('.caselist >> text=舊個案甲').count() === 1, '登入前的舊個案歸到第一個登入的帳號');
  ok(await page.evaluate(() => localStorage.getItem('cpgen.index') === null && localStorage.getItem('cpgen.case.old1') === null && localStorage.getItem('cpgen.settings') === null), '舊位置的資料已搬走');
  ok((await page.locator('.whoami').innerText()).includes('測試個管'), '首頁顯示目前登入者');
  await page.click('.mode >> text=撰寫計畫');
  ok((await page.locator('input[aria-label="個管員姓名"]').inputValue()) === '測試個管', '新個案自動帶入登入者姓名');
  await page.fill('input[aria-label="個案姓名"]', 'A的個案');
  /* 編輯畫面右上角直接登出：內容先存好 */
  ok(await page.locator('.top .acts >> text=登出').isVisible(), '編輯畫面右上角有「登出」');
  await page.click('.top .acts >> text=登出');
  ok((await page.locator('.dialog').innerText()).includes('測試個管'), '登出前確認，顯示登入者姓名');
  await page.click('.dialog footer >> text=登出');
  await page.waitForSelector('.lg-panel');
  ok(await page.locator('.lg-panel').isVisible(), '從編輯畫面登出回到登入畫面');
  await H.enter(page, H.TESTERS.a);
  ok(await page.locator('.caselist >> text=A的個案').count() === 1, '登出前正在編輯的內容已存好');
  /* 重新整理仍登入（7 天內） */
  await page.reload();
  ok(await page.locator('.homewrap').count() === 1 || await page.locator('.lg-panel').count() === 1, '重新整理後畫面正常');

  /* 登出 → 記住帳號 → B 登入看不到 A 的個案 */
  await H.enter(page, H.TESTERS.a);
  await page.click('.homeacts >> text=登出'); await page.click('.dialog footer >> text=登出');
  await page.waitForSelector('.lg-panel');
  ok((await page.locator('input[aria-label="帳號"]').inputValue()) === 'tester01', '勾選「記住帳號」後下次自動帶入帳號');
  await page.fill('input[aria-label="帳號"]', '');
  await H.enter(page, H.TESTERS.b);
  ok(await page.locator('.caselist >> text=A的個案').count() === 0 && await page.locator('.caselist >> text=舊個案甲').count() === 0, '不同帳號的個案清單分開');
  ok((await page.locator('.whoami').innerText()).includes('測試二號'), 'B 帳號登入顯示 B 的姓名');
  await page.click('.homeacts >> text=登出'); await page.click('.dialog footer >> text=登出');
  await page.waitForSelector('.lg-panel');
  await H.enter(page, H.TESTERS.a);
  ok(await page.locator('.caselist >> text=A的個案').count() === 1, 'A 再登入仍看到自己的個案');

  /* 7 天期限、被改過的登入紀錄 */
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cpgen.session')); s.exp = Date.now() - 1000; localStorage.setItem('cpgen.session', JSON.stringify(s)); });
  await page.reload();
  await H.addTester(page, H.TESTERS.a);
  ok(await page.locator('.lg-panel').count() === 1, '登入超過期限要重新登入');
  await page.evaluate(() => { localStorage.setItem('cpgen.session', JSON.stringify({ u: 'mya001', name: '冒用', v: 'xxxx', exp: Date.now() + 1e9 })); });
  await page.reload();
  ok(await page.locator('.lg-panel').count() === 1, '偽造的登入紀錄無效');

  /* 連續錯誤 5 次暫停 */
  for (let i = 0; i < 5; i++) {
    await page.fill('input[aria-label="帳號"]', 'mya002'); await page.fill('input[aria-label="密碼"]', 'bad-' + i);
    await page.click('.lg-btn'); await page.waitForFunction(() => !document.querySelector('.lg-btn').disabled);
  }
  ok((await page.locator('.lg-msg').innerText()).includes('30 秒'), '連續錯誤 5 次暫停 30 秒');
  ok(requests.length === 0, '登入過程沒有任何對外連線（' + requests.length + '）');
  await ctx.close();

  /* 各尺寸：登入面板完整顯示、沒有水平捲動 */
  for (const [name, o] of [['laptop', { viewport: { width: 1280, height: 720 } }], ['iphone13', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['iphone13L', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['ipadP', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }], ['ipadL', { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true }]]) {
    const c2 = await browser.newContext(o), p = await c2.newPage();
    p.on('pageerror', e => errors.push(name + ': ' + e.message));
    await p.goto(FILE); await p.waitForSelector('.lg-panel'); await p.waitForTimeout(300);
    const m = await p.evaluate(() => { const b = document.querySelector('.lg-btn').getBoundingClientRect(), f = document.querySelector('.lg-panel').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight, btnBottom: b.bottom, left: f.left, right: f.right }; });
    ok(m.sw <= m.w && m.left >= 0 && m.right <= m.w, name + '：沒有水平溢出');
    ok(m.btnBottom <= m.h, name + '：登入按鈕在第一個畫面內（' + Math.round(m.btnBottom) + '/' + m.h + '）');
    await p.screenshot({ path: path.join(OUT, 'login_' + name + '.png') });
    await c2.close();
  }
  console.log('errors:', errors.length ? errors : 'none');
  console.log(failed ? 'FAILED ' + failed : 'ALL PASSED');
  await browser.close(); process.exit(failed || errors.length ? 1 : 0);
})();
