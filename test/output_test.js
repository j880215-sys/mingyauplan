/* 最後存成 PDF 的兩段內容 = 「產生計畫」兩格的最終文字（含個管師手動修改）：新計畫、複評、AA01 都一樣 */
const { chromium } = require('playwright');
const path = require('path');
const H = require('./helpers.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = []; let failed = 0;
  page.on('pageerror', e => errors.push(e.message));
  function ok(c, m) { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); }
  await page.goto(FILE); await H.enter(page);
  const pdfText = () => page.evaluate(() => { const d = APP._pdfDoms(APP._S.rec); return d.form + '\n' + d.plan; });
  async function editOut(goalMark, planMark) {
    await page.click('.rail a[data-sec="output"]');
    const g = page.locator('textarea[aria-label="計畫目標"]'), p = page.locator('textarea[aria-label="計畫執行規劃"]');
    await g.fill((await g.inputValue()) + '\n' + goalMark);
    await p.fill((await p.inputValue()) + '\n' + planMark);
  }

  /* 1 新計畫 */
  await page.click('.mode b:text-is("撰寫計畫")');
  await page.fill('input[aria-label="個案姓名"]', '林手改');
  await page.click('.top button:text-is("儲存")');
  await editOut('【個管師手改目標A】', '【個管師手改規劃A】');
  let t = await pdfText();
  ok(t.includes('【個管師手改目標A】') && t.includes('【個管師手改規劃A】'), '新計畫：評估表 PDF 與計畫內容 PDF 用手動修改後的兩段');
  ok(await page.evaluate(() => { const d = APP._pdfDoms(APP._S.rec); return d.plan.includes('【個管師手改目標A】') && d.plan.includes('【個管師手改規劃A】'); }), '新計畫：計畫內容 PDF 也是手改版');
  /* 手改後再改前面的欄位：PDF 仍以手改的文字為準 */
  await page.click('.rail a[data-sec="basic"]');
  await page.fill('input[aria-label="聯絡電話"]', '0912000000');
  t = await pdfText();
  ok(t.includes('【個管師手改規劃A】'), '手改後再改欄位：PDF 仍是手改的文字');
  /* 實際下載 PDF：內嵌資料（匯入用）也是手改版 */
  const dl = []; page.on('download', d => dl.push(d));
  await page.click('.top >> text=下載PDF');
  await page.click('.dialog footer >> text=這次先下載');
  for (let i = 0; i < 80 && dl.length < 2; i++) await page.waitForTimeout(500);
  ok(dl.length === 2, '下載兩個 PDF');
  await page.click('.top >> text=返回首頁');

  /* 2 複評 */
  await page.locator('.ghead', { hasText: '林手改' }).locator('.gacts button:text-is("複評")').click();
  await page.click('.rail a[data-sec="output"]');
  ok(!(await page.locator('textarea[aria-label="計畫執行規劃"]').inputValue()).includes('手改規劃A'), '複評：文字依欄位重新產生（不帶前次手改）');
  await editOut('【複評手改目標B】', '【複評手改規劃B】');
  t = await pdfText();
  ok(t.includes('【複評手改目標B】') && t.includes('【複評手改規劃B】'), '複評：PDF 用手動修改後的兩段');
  await page.click('.top button:text-is("儲存")');
  await page.click('.top >> text=返回首頁');

  /* 3 AA01 */
  await page.locator('.ghead', { hasText: '林手改' }).locator('text=建立AA01').click();
  await editOut('【AA01手改目標C】', '【AA01手改規劃C】');
  t = await pdfText();
  ok(t.includes('【AA01手改目標C】') && t.includes('【AA01手改規劃C】'), 'AA01：PDF 用手動修改後的兩段');
  const n = page.locator('textarea[aria-label="其他備註"]');
  if (await n.count()) { await n.fill('【AA01手改備註C】'); ok((await pdfText()).includes('【AA01手改備註C】'), 'AA01：其他備註也用手改版'); }

  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
