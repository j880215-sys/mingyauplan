/* 雲端同步（模擬 Firebase）：加密存放、舊資料上傳、換裝置、離線、密碼更換、刪除、登出 */
const { chromium } = require('playwright');
const path = require('path');
const H = require('./helpers.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');
const A = H.TESTERS.a;

(async () => {
  const browser = await chromium.launch();
  const errors = []; let failed = 0;
  function ok(c, m) { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); }
  async function device(seedFs, accPw) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    /* 帳號檔在頁面載入時就含測試帳號（才能測「記住登入」） */
    const acc = H.makeAccount(accPw ? Object.assign({}, A, { p: accPw }) : A, 310000);
    await ctx.addInitScript(([a, fs]) => {
      let v; Object.defineProperty(window, 'ACCOUNTS', { configurable: true, get() { return v; }, set(x) { v = x; if (!v.list.some(y => y.u === a.u)) v.list.push(a); } });
      if (fs && !localStorage.getItem('__seeded')) { localStorage.setItem('__fakefs', fs); localStorage.setItem('__seeded', '1'); }
    }, [acc, seedFs || null]);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return { ctx, page };
  }
  async function login(page, pw, expectHome = true) {
    await page.waitForSelector('.lg-panel, .homewrap', { timeout: 20000 });
    if (await page.locator('.homewrap').count()) return;
    await page.evaluate(([u, p]) => window.__FAKE_ADD_USER__(CLOUD.email(u), p), [A.u, pw || A.p]);
    await page.fill('input[aria-label="帳號"]', A.u);
    await page.fill('input[aria-label="密碼"]', pw || A.p);
    await page.click('.lg-btn');
    if (expectHome) await page.waitForSelector('.homewrap', { timeout: 20000 });
  }
  const dump = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakefs')));

  /* ---- 裝置一：原本有存在瀏覽器裡的個案 → 第一次登入加密上傳並刪除本機明文 ---- */
  let d1 = await device();
  let p = d1.page;
  await p.goto(FILE);
  await p.evaluate(u => {
    localStorage.setItem('cpgen.' + u + '.index', JSON.stringify([{ id: 'loc1', kind: 'plan', name: '本機王小明', date: '2026-10-01', updatedAt: 1 }]));
    localStorage.setItem('cpgen.' + u + '.case.loc1', JSON.stringify({ id: 'loc1', updatedAt: 1, f: { name: '本機王小明', visitDate: '2026-10-01', phone: '0912345678' }, changes: [] }));
  }, A.u);
  await p.reload();
  await login(p);
  ok(await p.locator('.caselist >> text=本機王小明').count() === 1, '本機原有個案出現在清單');
  ok((await p.locator('.whoami .syncbadge').innerText()).length > 0, '首頁顯示同步狀態：' + await p.locator('.whoami .syncbadge').innerText());
  await p.waitForTimeout(1500);
  let fs = await dump(p);
  const raw = JSON.stringify(fs.docs);
  ok(Object.keys(fs.docs).some(k => /\/cases\/loc1$/.test(k)), '個案已上傳到雲端');
  ok(!raw.includes('王小明') && !raw.includes('0912345678') && !raw.includes(A.name), '雲端只有密文（找不到姓名、電話、個管員姓名）');
  ok(await p.evaluate(u => localStorage.getItem('cpgen.' + u + '.case.loc1') === null && localStorage.getItem('cpgen.' + u + '.index') === null, A.u), '上傳確認後刪除本機明文');
  ok(Object.keys(fs.docs).some(k => /^users\/[^/]+$/.test(k)) && !JSON.stringify(fs.docs).includes(A.p), '雲端存有包裝後的資料金鑰（不含密碼）');

  /* 新增一筆、修改後雲端更新 */
  await p.click('.mode b:text-is("撰寫計畫")');
  await p.fill('input[aria-label="個案姓名"]', '雲端李大華');
  await p.click('.top button:text-is("儲存")');
  await p.waitForTimeout(2200);
  await p.click('.top >> text=返回首頁');
  await p.waitForTimeout(1200);
  fs = await dump(p);
  ok(Object.keys(fs.docs).filter(k => /\/cases\//.test(k)).length === 2, '新個案自動加密上傳（共 2 筆）');

  /* 重新整理：記住登入，免輸入密碼，資料仍在 */
  await p.reload();
  await p.waitForSelector('.homewrap', { timeout: 20000 });
  ok(await p.locator('.caselist >> text=雲端李大華').count() === 1, '重新整理後免輸入密碼，個案仍在');

  /* ---- 裝置二：同帳號登入，看到同樣的個案 ---- */
  const seed = JSON.stringify(Object.assign(await dump(p), { authUser: null }));
  const d2 = await device(seed);
  await d2.page.goto(FILE);
  await login(d2.page);
  ok(await d2.page.locator('.caselist >> text=雲端李大華').count() === 1 && await d2.page.locator('.caselist >> text=本機王小明').count() === 1, '換裝置登入：看到同樣的 2 筆個案');

  /* ---- 裝置三：第一次登入就沒有網路 ---- */
  const d3 = await device(seed);
  await d3.page.goto(FILE);
  await d3.page.evaluate(() => { window.__FAKE_OFFLINE__ = true; Object.defineProperty(navigator, 'onLine', { get: () => false }); });
  await login(d3.page, null, false);
  await d3.page.waitForSelector('.lg-msg.bad');
  ok((await d3.page.locator('.lg-msg').innerText()).includes('第一次在這台裝置登入需要網路'), '新裝置離線第一次登入：提示需要網路');
  await d3.ctx.close();

  /* ---- 雲端帳號密碼不一致 ---- */
  const d4 = await device(JSON.stringify({ users: {}, docs: {}, authUser: null }));
  await d4.page.goto(FILE);
  await d4.page.evaluate(([u]) => window.__FAKE_ADD_USER__(CLOUD.email(u), 'other-password'), [A.u]);
  await d4.page.fill('input[aria-label="帳號"]', A.u);
  await d4.page.fill('input[aria-label="密碼"]', A.p);
  await d4.page.click('.lg-btn');
  await d4.page.waitForSelector('.lg-msg.bad');
  ok((await d4.page.locator('.lg-msg').innerText()).includes('雲端帳號尚未建立或密碼不一致') && await d4.page.locator('.homewrap').count() === 0, '雲端帳號不存在或密碼不同：無法進入並提示');
  await d4.ctx.close();

  /* ---- 密碼更換：輸入一次舊密碼，重新包裝金鑰 ---- */
  const NEWPW = 'test-pass-NEW1';
  const seed5 = await dump(d2.page);
  seed5.authUser = null;
  seed5.users[await d2.page.evaluate(u => CLOUD.email(u), A.u)].pw = NEWPW;
  const d5 = await device(JSON.stringify(seed5), NEWPW);
  await d5.page.goto(FILE);
  await d5.page.fill('input[aria-label="帳號"]', A.u);
  await d5.page.fill('input[aria-label="密碼"]', NEWPW);
  await d5.page.click('.lg-btn');
  await d5.page.waitForSelector('input[aria-label="舊密碼"]:visible', { timeout: 20000 });
  ok((await d5.page.locator('.lg-msg').innerText()).includes('登入密碼已更換'), '密碼更換後要求輸入一次舊密碼');
  await d5.page.fill('input[aria-label="舊密碼"]', A.p);
  await d5.page.click('.lg-btn');
  await d5.page.waitForSelector('.homewrap', { timeout: 20000 });
  ok(await d5.page.locator('.caselist >> text=雲端李大華').count() === 1, '輸入舊密碼後解開，個案都在');
  await d5.ctx.close();

  /* ---- 刪除個案：雲端同步刪除 ---- */
  await (await H.openCase(p, '本機王小明')).locator('.crow >> text=刪除').click();
  ok((await p.locator('.dialog').innerText()).includes('雲端與你所有裝置'), '刪除提示說明會刪除雲端資料');
  await p.click('.dialog footer >> text=刪除');
  await p.waitForTimeout(1500);
  fs = await dump(p);
  ok(!Object.keys(fs.docs).some(k => /\/cases\/loc1$/.test(k)), '刪除後雲端也刪除');

  /* ---- 登出：刪除本機金鑰，重新整理要輸入密碼 ---- */
  await p.click('.homeacts >> text=登出');
  await p.click('.dialog footer >> text=登出');
  await p.waitForSelector('.lg-panel', { timeout: 20000 });
  const hasKey = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('cpgen-keys', 1); r.onsuccess = () => { const g = r.result.transaction('k').objectStore('k').count(); g.onsuccess = () => res(g.result); }; r.onerror = () => res(-1); }));
  ok(hasKey === 0, '登出後本機不再保存資料金鑰');
  await login(p);
  ok(await p.locator('.caselist >> text=雲端李大華').count() === 1, '再次登入個案仍在');

  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
