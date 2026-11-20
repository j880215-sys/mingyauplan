/* 照顧服務「週間排程表」：點格子填組數／時間、每月單位自動計算、計畫文字 */
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

  /* 文字產生（不經畫面） */
  const t = await page.evaluate(() => {
    const st = { weekFactor: { 1: 5, 2: 9, 3: 14, 4: 18, 5: 23, 6: 27, 7: 31 } };
    const mk = g => ({ code: 'BA01', name: '基本身體清潔', mode: 'grid', grid: g });
    const a = mk({ '1am': { u: '3' }, '3am': { u: '3' }, '5am': { u: '3' }, '2am': { u: '2' }, '4am': { u: '2' } });
    const g3 = {}; for (let d = 1; d <= 7; d++) { g3[d + 'am'] = { u: '1', t: '08:00' }; g3[d + 'noon'] = { u: '1', t: '12:00' }; g3[d + 'pm'] = { u: '1', t: '17:30' }; }
    const b = mk(g3);
    const c = mk({ '6pm': { u: '2', t: '14:00' } });
    const d = mk({ '1am': { u: '2' }, '1pm': { u: '1' } });
    return [a, b, c, d].map(l => [NAR.careLineText(l, st), NAR.unitsAuto(l, st)]);
  });
  t.forEach(x => console.log('      ' + x[0]));
  ok(t[0][0] === 'BA01基本身體清潔:60單位/月(每週一三五上午各3單位；二四上午各2單位)', '一三五3組、二四2組');
  ok(t[1][0] === 'BA01基本身體清潔:93單位/月(每日上午8:00、中午12:00、下午17:30各1單位)', '一天三次進場');
  ok(t[2][0] === 'BA01基本身體清潔:10單位/月(每週六下午14:00 2單位)', '單一時段');
  ok(t[3][0] === 'BA01基本身體清潔:15單位/月(每週一上午2單位、下午1單位)', '同日不同組數');

  /* 畫面操作 */
  await page.click('.mode >> text=撰寫計畫');
  await page.click('.rail a[data-sec="plan"]');
  await page.click('text=＋ 選取照顧服務項目');
  await page.fill('input[type=search]', 'BA01');
  await page.click('.pickgrid .chip');
  await page.click('.dialog >> text=完成');
  const line = page.locator('.sline').first();
  await line.locator('[aria-label="頻率"] >> text=週間排程表').click();
  ok(await line.locator('table.sgrid').count() === 1, '出現排程表');
  ok(await line.locator('input[aria-label="每次單位"]').count() === 0, '排程表模式不顯示「每次單位」');
  async function setCell(label, u, time) {
    await line.locator(`button.gcell[aria-label^="${label}"]`).click();
    const dlg = page.locator('.dialog');
    await dlg.locator('input[aria-label="組數"]').fill(u);
    if (time) await dlg.locator('input[aria-label="時間"]').fill(time);
    await dlg.locator('text=確定').click();
  }
  for (const d of ['一', '三', '五']) await setCell('星期' + d + '上午', '3', '09:00');
  for (const d of ['二', '四']) await setCell('星期' + d + '上午', '2', '09:00');
  const prev = await line.locator('.sprev').innerText();
  ok(prev === 'BA01基本身體清潔:60單位/月(每週一三五上午9:00各3單位；二四上午9:00各2單位)', '畫面預覽：' + prev);
  ok(await line.locator('input[aria-label="每月單位數"]').inputValue() === '60', '每月單位數自動 60');
  const cellTxt = await line.locator('button.gcell[aria-label^="星期一上午"]').innerText();
  ok(/3組/.test(cellTxt) && /09:00/.test(cellTxt), '格子顯示組數與時間：' + cellTxt.replace(/\n/g, ' '));
  /* 清除單格 */
  await line.locator('button.gcell[aria-label^="星期四上午"]').click();
  await page.locator('.dialog >> text=清除此格').click();
  ok(/二上午9:00 2單位|；二上午/.test(await line.locator('.sprev').innerText()), '清除星期四後：' + await line.locator('.sprev').innerText());
  /* 時間直接打字：0900 / 930 / 1730 / 9點半 */
  for (const [typed, want] of [['0900', '09:00'], ['930', '09:30'], ['1730', '17:30'], ['9點半', '09:30'], ['14', '14:00']]) {
    await line.locator('button.gcell[aria-label^="星期六下午"]').click();
    const dlg = page.locator('.dialog');
    await dlg.locator('input[aria-label="時間"]').fill(typed);
    const hint = await dlg.locator('.tmhint').innerText();
    await dlg.locator('input[aria-label="時間"]').press('Enter');
    const saved = await page.evaluate(() => APP._S.rec.f.pCare[0].grid['6pm'].t);
    ok(saved === want && hint.indexOf(want) >= 0, `打「${typed}」→ ${saved}（提示 ${hint}）`);
  }
  await line.locator('button.gcell[aria-label^="星期六下午"]').click();
  await page.locator('.dialog input[aria-label="時間"]').fill('2599');
  ok(/格式不對/.test(await page.locator('.dialog .tmhint').innerText()), '錯誤時間顯示提示');
  await page.locator('.dialog >> text=確定').click();
  ok(await page.locator('.dialog').count() === 1, '錯誤時間不會存入、視窗保留');
  await page.locator('.dialog >> text=清除此格').click();
  /* 手機尺寸不溢出 */
  await page.setViewportSize({ width: 390, height: 844 });
  await line.scrollIntoViewIfNeeded();
  const ow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(ow, 'iPhone 寬度頁面不橫向溢出');
  await line.locator('table.sgrid').screenshot({ path: path.join(__dirname, 'shots', 'grid_phone.png') });
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
