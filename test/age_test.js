/* 出生年次 → 自動換算年齡：輸入、即時顯示、評估表呈現、舊資料（只有年齡）相容 */
const { chromium } = require('playwright');
const path = require('path');
const H = require('./helpers.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; let failed = 0;
  page.on('pageerror', e => errors.push(e.message));
  function ok(c, m) { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); }
  await page.goto(FILE); await H.enter(page);
  await page.click('.mode >> text=撰寫計畫');
  ok(await page.locator('input[aria-label="出生年次"]').count() === 1 && await page.locator('input[aria-label="年齡"]').count() === 1, '個案有出生年次與年齡兩格');
  await page.evaluate(() => { APP._S.rec.f.visitDate = '2026-11-10'; });
  await page.fill('input[aria-label="出生年次"]', '33');
  let t = await page.locator('input[aria-label="年齡"]').first().inputValue();
  ok(t.indexOf('82') >= 0, '民國33年次 → ' + t);
  ok(await page.evaluate(() => APP._S.rec.f.age) === '82', '同時寫入 age=82');
  await page.fill('input[aria-label="出生年次"]', '1944');
  t = await page.locator('input[aria-label="年齡"]').first().inputValue();
  ok(t.indexOf('82') >= 0, '填西元1944也換算 → ' + t);
  /* 直接填年齡：年次清空 */
  await page.fill('input[aria-label="年齡"]', '79');
  ok(await page.locator('input[aria-label="出生年次"]').first().inputValue() === '' && await page.evaluate(() => APP._S.rec.f.age) === '79', '直接填年齡 79，年次清空');
  ok(/年齡[\s\S]{0,80}79歲/.test(await page.evaluate(() => APP._formHtml(APP._S.rec))), '評估表顯示直接填的 79歲');
  await page.fill('input[aria-label="出生年次"]', '33');
  /* 家庭成員：主要照顧者才顯示出生年次 */
  await page.click('.rail a[data-sec="family"]');
  await page.click('text=新增家庭成員');
  const mem = page.locator('.litem').last();
  await mem.locator('select[aria-label="稱謂"]').selectOption('案女');
  ok(!(await mem.locator('input[aria-label="出生年次"]').isVisible()), '非主要照顧者不顯示年次');
  await mem.locator('[aria-label="角色"] >> text=主要照顧者').click();
  await mem.locator('input[aria-label="出生年次"]').fill('60');
  t = await mem.locator('input[aria-label="年齡"]').inputValue();
  ok(t.indexOf('55') >= 0, '照顧者民國60年次 → ' + t);
  const d = await page.locator('.draftbody').innerText();
  ok(/55歲/.test(d), '家庭草稿寫出 55歲');
  /* 評估表呈現 */
  const html = await page.evaluate(() => APP._formHtml(APP._S.rec));
  ok(html.indexOf('民國33年次（82歲）') >= 0, '評估表：民國33年次（82歲）');
  ok(html.indexOf('民國60年次（55歲）') >= 0, '評估表成員：民國60年次（55歲）');
  /* 舊資料只有 age */
  const old = await page.evaluate(() => APP._formHtml({ id: 'x', kind: 'plan', f: { name: '舊', visitDate: '2026-01-01', age: '90', members: [{ rel: '案子', roles: ['主要照顧者'], age: '60' }] }, changes: [] }));
  ok(/年齡[\s\S]{0,80}90歲/.test(old) && old.indexOf('60歲') >= 0, '舊資料仍顯示年齡');
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
