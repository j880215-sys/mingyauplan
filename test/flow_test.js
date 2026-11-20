/* 其他流程：匯出/匯入、計畫更新／異動、複製為複評、設定、列印版面 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const S = require('./samples.js');
const H = require('./helpers.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } }); let failed = 0; const errors = [];
  const ok = (c, m) => { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(FILE); await H.enter(page);
  await page.evaluate(f => { APP._open(APP._norm({ id: 'demo', f: f, changes: [] })); }, S.homeCare);
  /* 存檔：兩個 PDF（未設定資料夾 → 這次先下載） */
  await page.click('.top >> text=存檔');
  const dls = [];
  page.on('download', d => dls.push(d));
  await page.click('.dialog footer >> text=這次先下載');
  ok(await page.locator('.overlay.busy .pbar').count() === 1, '產生 PDF 時顯示進度');
  for (let i = 0; i < 60 && dls.length < 2; i++) await page.waitForTimeout(500);
  const names = dls.map(d => d.suggestedFilename()).sort();
  ok(names.length === 2 && names.includes('王大同訪視評估表.pdf') && names.includes('王大同計畫內容.pdf'), '存檔兩個 PDF：' + names.join('、'));
  const formFile = path.join(OUT, 'form.pdf'); await dls.find(d => /訪視評估表\.pdf$/.test(d.suggestedFilename())).saveAs(formFile);
  const planFile = path.join(OUT, 'plan.pdf'); await dls.find(d => /計畫內容\.pdf$/.test(d.suggestedFilename())).saveAs(planFile);
  const pdfBuf = fs.readFileSync(formFile), pdfTxt = pdfBuf.toString('latin1');
  ok(pdfTxt.startsWith('%PDF-1.7') && /%%EOF\s*$/.test(pdfTxt) && (pdfTxt.match(/\/Type \/Page /g) || []).length >= 2, '訪視評估表 PDF 格式正確，共 ' + (pdfTxt.match(/\/Type \/Page /g) || []).length + ' 頁，' + Math.round(pdfBuf.length / 1024) + ' KB');
  ok(pdfTxt.includes('/EmbeddedFiles') && pdfTxt.includes('(cpgen-data.json)'), 'PDF 夾帶個案資料（匯入用）');
  /* xref 位移正確（PDF 閱讀器才打得開） */
  const sx = +/startxref\n(\d+)/.exec(pdfTxt)[1], xr = pdfTxt.slice(sx, sx + 4), offs = [...pdfTxt.slice(sx).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => +m[1]);
  ok(xr === 'xref' && offs.every((o, i) => pdfTxt.slice(o, o + String(i + 1).length + 6) === (i + 1) + ' 0 obj'), 'PDF 交叉索引表正確（' + offs.length + ' 個物件）');
  ok(fs.statSync(planFile).size > 20000, '計畫內容 PDF 已產生');
  /* 資料夾：用瀏覽器內部檔案系統模擬，確認年度／月份子資料夾 */
  const http = require('http');
  const distDir = path.join(__dirname, '../dist/照顧計畫產生器');
  const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(path.join(distDir, '照顧計畫產生器.html'))); });
  await new Promise(r => srv.listen(8799, '127.0.0.1', r));
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('p2 pageerror: ' + e.message));
  await p2.goto('http://127.0.0.1:8799/'); await H.enter(p2);
  const tree = await p2.evaluate(async (f) => {
    const root = await navigator.storage.getDirectory();
    await APP._writeToFolder(root, { id: 'x', f: f, changes: [] });
    const y = await root.getDirectoryHandle('115年度'); const m = await y.getDirectoryHandle('10月'); const out = [];
    for await (const [n] of m.entries()) out.push(n); return out.sort().join(',');
  }, S.homeCare);
  await p2.close(); srv.close();
  ok(tree.split(',').length === 2 && tree.includes('王大同訪視評估表.pdf') && tree.includes('王大同計畫內容.pdf'), '自動存入 115年度／10月：' + tree);
  /* 回清單 → 刪除 → 匯入訪視評估表檔 */
  await page.click('.top >> text=返回首頁');
  ok(await page.locator('.caselist >> text=王大同').count() === 1, '清單顯示個案');
  await page.click('.caselist >> text=刪除'); await page.click('.dialog footer >> text=刪除');
  ok(await page.locator('.caselist >> text=王大同').count() === 0, '刪除個案');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=匯入存檔')]);
  await fc.setFiles(formFile);
  await page.waitForSelector('input[aria-label="個案姓名"]');
  ok((await page.locator('input[aria-label="個案姓名"]').inputValue()) === '王大同', '從訪視評估表 PDF 匯入後開啟');
  /* 計畫內容 PDF 也可匯入；舊版 html 存檔仍可匯入 */
  await page.click('.top >> text=返回首頁');
  await page.click('.caselist >> text=刪除'); await page.click('.dialog footer >> text=刪除');
  const [fcp] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=匯入存檔')]);
  await fcp.setFiles(planFile);
  await page.waitForSelector('input[aria-label="個案姓名"]');
  ok((await page.locator('input[aria-label="個案姓名"]').inputValue()) === '王大同', '從計畫內容 PDF 匯入後開啟');
  const oldHtml = path.join(OUT, 'old_form.html');
  fs.writeFileSync(oldHtml, await page.evaluate(() => APP._formHtml(APP._S.rec)));
  await page.click('.top >> text=返回首頁');
  await page.click('.caselist >> text=刪除'); await page.click('.dialog footer >> text=刪除');
  const [fch] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=匯入存檔')]);
  await fch.setFiles(oldHtml);
  await page.waitForSelector('input[aria-label="個案姓名"]');
  ok((await page.locator('input[aria-label="個案姓名"]').inputValue()) === '王大同', '舊版 html 存檔仍可匯入');
  ok(await page.locator('.rail a[data-sec="change"]').count() === 0, '撰寫計畫裡已沒有「計畫異動」分頁');
  await page.click('.top >> text=返回首頁');
  /* 設定：改換算表後單位數跟著變 */
  await page.click('.crow:not(:has(.kindtag.upd)):has-text("王大同") >> text=開啟');
  await page.click('.top >> text=設定');
  await page.fill('input[aria-label="每週2天換算"]', '8');
  await page.click('.dialog >> text=儲存設定');
  await page.click('.top >> text=返回首頁');
  await page.click('.crow:not(:has(.kindtag.upd)):has-text("王大同") >> text=開啟');
  await page.click('.rail a[data-sec="plan"]');
  const line = await page.locator('.sline .sprev').first().innerText();
  ok(line === 'BA07協助沐浴及洗頭:8單位/月(每週兩天各1單位)', '設定換算表生效：' + line);
  /* 複製為複評 */
  await page.click('.top >> text=返回首頁');
  await page.click('.crow:not(:has(.kindtag.upd)):has-text("王大同") >> text=複製為複評');
  await page.click('.rail a[data-sec="svc"]');
  ok(await page.locator('[aria-label="使用服務狀況"] .chip[aria-checked="true"]').innerText() === '使用服務中個案', '複製為複評：狀態為使用服務中');
  ok(await page.locator('text=服務評值').count() > 0, '複評顯示服務評值');
  /* 空白個案也能產出，不會出錯 */
  await page.click('.top >> text=返回首頁'); await page.click('.mode >> text=撰寫計畫'); await page.click('.rail a[data-sec="output"]');
  ok((await page.locator('.warnlist li').count()) > 3, '空白個案：檢查清單有提醒');
  /* 列印版面 */
  await page.evaluate(f => { window.print = function () { }; APP._open(APP._norm({ id: 'demo2', f: f, changes: [] })); }, S.dayCare);
  await page.click('.top >> text=列印評估表'); await page.waitForTimeout(200);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(OUT, 'print.pdf'), format: 'A4', printBackground: true });
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.screenshot({ path: path.join(OUT, 'print_p1.png') });
  console.log('errors:', errors.length ? errors : 'none');
  console.log(failed ? 'FAILED ' + failed : 'ALL PASSED');
  await browser.close(); process.exit(failed || errors.length ? 1 : 0);
})();
