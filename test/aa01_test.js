/* AA01：首頁入口、從既有個案帶入、各分頁填寫、三個產出欄位、存檔 PDF 與匯入 */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const H = require('./helpers.js');
const S = require('./samples.js');
const FILE = 'file://' + path.join(__dirname, '../dist/照顧計畫產生器/照顧計畫產生器.html');
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; let failed = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  function ok(c, m) { if (!c) { failed++; console.log('FAIL  ' + m); } else console.log('ok    ' + m); }
  await page.goto(FILE); await H.enter(page);

  ok(await page.locator('.mode b', { hasText: /^AA01$/ }).count() === 1 && await page.locator('.mode >> text=計畫更新／異動').count() === 0, '首頁第二個入口改為 AA01');

  /* 先放一筆撰寫計畫的個案，再從清單「建立AA01」 */
  await page.evaluate(f => { APP._open(APP._norm({ id: 'base1', f: f, changes: [] })); }, S.homeCare);
  await page.click('.top >> text=返回首頁');
  await page.locator('.ghead', { hasText: '王大同' }).locator('text=建立AA01').click();
  await page.click('.top button:text-is("儲存")');
  ok(await page.locator('.rail a[data-sec="aStatus"]').count() === 1 && await page.locator('.rail a[data-sec="phys"]').count() === 0, 'AA01 使用自己的分頁');
  ok(await page.locator('input[aria-label="個案姓名"]').inputValue() === '王大同', '帶入個案姓名');
  const f0 = await page.evaluate(() => APP._S.rec.f);
  ok(f0.pCare.length > 0 && f0.problems.length === 0 && (await page.evaluate(() => APP._S.rec.prevProblems.length)) > 0, '帶入服務規劃；照顧問題不預先勾選，記下前次勾選');

  /* 1 個案概況 */
  await page.click('.rail a[data-sec="aStatus"]');
  await page.click('[data-fid="aaPhys"] >> text=退步');
  await page.fill('input[aria-label="補充說明"] >> nth=0', '下肢較前次無力，室內需持助行器行走');
  for (const id of ['aaPsych', 'aaHome', 'aaHabit']) await page.click(`[data-fid="${id}"] >> text=維持`);
  let d = await page.locator('.draftbody').innerText();
  ok(d === '1、 個案概況：與上次訪視評估相比，生理方面較前次退化，下肢較前次無力，室內需持助行器行走；心理、居家環境及生活習慣方面無明顯變化。', '個案概況：' + d);
  /* 2 照顧者 */
  await page.click('.rail a[data-sec="aCarer"]');
  await page.selectOption('select[aria-label="主要照顧者"]', '案女');
  await page.click('[aria-label="照顧負荷"] >> text=稍有負荷');
  await page.click('[aria-label="可提供協助"] >> text=有');
  await page.fill('input[aria-label="協助內容"]', '案子假日會回家協助陪同就醫');
  d = await page.locator('.draftbody').innerText();
  ok(d === '2、 照顧者照顧狀況：主要照顧者為案女，主訴照顧上稍有負荷，案子假日會回家協助陪同就醫。', '照顧者：' + d);
  /* 3 服務使用狀況 */
  await page.click('.rail a[data-sec="aSvc"]');
  await page.click('[aria-label="這次服務頻率"] >> text=維持不變');
  await page.fill('input[aria-label="使用服務時間"]', '每週二四上午');
  await page.click('text=依服務規劃帶入');
  ok(/BA07協助沐浴及洗頭\(每週兩天各1單位\)/.test(await page.locator('textarea[aria-label="使用服務內容"]').inputValue()), '依服務規劃帶入使用服務內容');
  await page.fill('textarea[aria-label="使用服務內容"]', '協助個案沐浴洗頭及陪同外出');
  await page.click('[aria-label="居服員服務狀況"] >> text=服務狀況良好');
  await page.click('[aria-label="個案配合照顧"] >> text=配合度佳');
  d = await page.locator('.draftbody').innerText();
  ok(d === '3、 服務使用狀況：個案服務頻率無調整，目前每週二四上午使用服務，服務內容為協助個案沐浴洗頭及陪同外出，居服員服務狀況良好，個案配合照顧狀況良好。', '服務使用：' + d);
  /* 照顧問題 */
  await page.click('.rail a[data-sec="problems"]');
  ok(await page.locator('text=主要失能原因').count() === 0, 'AA01 不顯示主要失能原因');
  const prevChips = await page.locator('.probgrid .chip.prev').allInnerTexts();
  ok(prevChips.length > 0 && prevChips.some(t => /洗澡問題/.test(t)), '前次勾選的問題以底色標示：' + prevChips.join('、').replace(/\s+/g, ''));
  ok(/淡藍底色＝前次撰寫計畫/.test(await page.locator('.prevnote').innerText()), '顯示底色說明');
  await page.click('.probgrid .chip.prev:has-text("洗澡問題")');
  ok(await page.locator('.probgrid .chip:has-text("洗澡問題")').getAttribute('aria-checked') === 'true' && await page.locator('.probgrid .chip.prev:has-text("洗澡問題")').count() === 0, '點選後變為勾選（底色移除）');
  const firstProb = page.locator('.pitem textarea').first();
  await firstProb.fill('需他人協助清洗後背及下肢');
  await page.fill('textarea[aria-label="補充"]', '另個案近期有跌倒情形，持續追蹤。');
  d = await page.locator('.draftbody').innerText();
  ok(/^參、.*照顧問題：\n1、洗澡問題：需他人協助清洗後背及下肢。\n另個案近期有跌倒情形，持續追蹤。$/.test(d), '照顧問題：' + d.replace(/\n/g, '⏎'));
  /* 計畫目標 */
  await page.click('.rail a[data-sec="goals"]');
  await page.click('[aria-label="短期目標"] >> text=已達成');
  await page.click('[aria-label="中期目標"] >> text=部分達成');
  await page.click('[aria-label="長期目標"] >> text=持續追蹤');
  await page.waitForTimeout(50);
  d = await page.locator('.draftbody').innerText();
  ok(/前次目標評值：短期目標已達成，中期目標部分達成，長期目標持續追蹤。\n1、短期目標：.+\(1個月\)\n2、中期目標：.+\(3個月\)\n3、長期目標：.+\(6個月\)/.test(d), '目標含評值與期程');
  /* 服務規劃：喘息註記 */
  await page.click('.rail a[data-sec="plan"]');
  await page.evaluate(() => { const f = APP._S.rec.f; f.pRespite = [{ id: 'r1', code: 'GA09', name: '居家喘息服務', units: '42', note: '' }]; f.pRespitePeriod = '114.10-115.09'; });
  await page.click('.rail a[data-sec="plan"]');
  d = await page.locator('.draftbody').innerText();
  ok(d.includes('GA09居家喘息服務:42單位/年\n本案喘息額度自114年10月至115年09月。\n') && /\n-----$/.test(d), '喘息額度註記與 ----- 區隔');
  /* 其他備註 */
  await page.click('.rail a[data-sec="aNote"]');
  await page.click('[aria-label="需註記的項目（可複選）"] >> text=核定AA08');
  await page.click('[aria-label="需註記的項目（可複選）"] >> text=超額自費需求');
  await page.fill('[data-fid="aa08Date"] input', '2026-11-18');
  await page.fill('input[aria-label="提出對象"] >> nth=0', '案女');
  await page.fill('textarea[aria-label="原因（依據 6 大項何項原則）"] >> nth=0', '主要照顧者因病住院，符合第二項原則');
  await page.click('[aria-label="個案是否同意自費使用"] >> text=同意自費');
  d = await page.locator('.draftbody').innerText();
  ok(d === '1、核定AA08：於115年11月18日訪談，由案女提出，原因：主要照顧者因病住院，符合第二項原則。\n2、個案有超額服務需求，若有留用額度可與個管溝通，個案同意自費使用。', '其他備註：' + d.replace(/\n/g, '⏎'));
  /* 產出 */
  await page.click('.rail a[data-sec="output"]');
  const g = await page.locator('textarea[aria-label="計畫目標"]').inputValue();
  const pl = await page.locator('textarea[aria-label="計畫執行規劃"]').inputValue();
  const nt = await page.locator('textarea[aria-label="其他備註"]').inputValue();
  console.log('\n' + g + '\n\n' + pl + '\n\n' + nt + '\n');
  ok(/^壹、.*本案於\d+年\d+月\d+日.*家訪，與.*討論照顧計畫\/個管/.test(g) && g.includes('貳、') && g.includes('參、') && g.includes('肆、') && /個管員：.*\n-----$/.test(g), '計畫目標欄格式');
  ok(pl.startsWith('於') && /\n-----$/.test(pl), '計畫執行規劃欄格式');
  ok(nt.includes('核定AA08'), '其他備註欄');
  await page.screenshot({ path: path.join(OUT, 'aa01_output.png'), fullPage: true });
  /* 存檔 */
  const dl = [];
  page.on('download', x => dl.push(x));
  await page.click('.top >> text=下載PDF');
  await page.click('.dialog footer >> text=這次先下載');
  for (let i = 0; i < 60 && !dl.length; i++) await page.waitForTimeout(500);
  const nm = dl.map(x => x.suggestedFilename());
  ok(nm.length === 1 && /^王大同AA01_\d{7}\.pdf$/.test(nm[0]), 'AA01 存成一個 PDF：' + nm.join('、'));
  const pdfPath = path.join(OUT, 'aa01.pdf'); await dl[0].saveAs(pdfPath);
  await page.click('.top >> text=返回首頁');
  ok(await page.locator('.cgroup').count() === 1 && (await page.locator('.ghead').innerText()).includes('2 筆'), '同一位個案收合成一組（2 筆）');
  ok(await page.locator('.cgroup .gbody').isHidden(), '預設收合，不顯示歷程');
  const grp = await H.openCase(page, '王大同');
  ok(await grp.locator('.crow .kindtag.aa').count() === 1 && await grp.locator('.crow .kindtag:not(.aa)').count() === 1, '展開後看到撰寫歷程：撰寫計畫＋AA01');
  ok(await page.locator('.ghead >> text=建立AA01').count() === 1, '個案分組上有「建立AA01」');
  await grp.locator('.crow:has(.kindtag.aa) >> text=刪除').click(); await page.click('.dialog footer >> text=刪除');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=匯入存檔')]);
  await fc.setFiles(pdfPath);
  await page.waitForSelector('.rail a[data-sec="aStatus"]');
  ok(await page.evaluate(() => APP._S.rec.kind === 'aa01' && APP._S.rec.f.pRespitePeriod === '114.10-115.09'), 'AA01 PDF 可匯入回編輯');
  /* 從首頁 AA01 卡片新建：填姓名後，照顧問題底色與服務規劃都能找到同姓名的撰寫計畫 */
  await page.click('.top >> text=返回首頁');
  await page.locator('.mode', { has: page.locator('b', { hasText: /^AA01$/ }) }).click();
  await page.fill('input[aria-label="個案姓名"]', '王大同');
  await page.click('.rail a[data-sec="problems"]');
  ok(await page.locator('.probgrid .chip.prev').count() > 0, '新建 AA01 填姓名後，照顧問題標出前次勾選');
  await page.click('.rail a[data-sec="aSvc"]');
  await page.click('[aria-label="這次服務頻率"] >> text=維持不變');
  await page.click('.rail a[data-sec="plan"]');
  await page.waitForTimeout(100);
  const pc = await page.evaluate(() => APP._S.rec.f.pCare.map(l => l.code).join(','));
  ok(/BA07/.test(pc) && /BA13/.test(pc), '服務維持不變：自動套入撰寫計畫的服務規劃（' + pc + '）');
  await page.evaluate(() => { APP._S.rec.f.pCare = []; });
  await page.click('.rail a[data-sec="plan"]');
  ok(await page.locator('text=套入前次撰寫計畫的服務規劃').count() === 1, '服務規劃頁有「套入前次撰寫計畫」按鈕');
  /* 手機尺寸 */
  await page.setViewportSize({ width: 390, height: 844 });
  for (const sec of ['aBasic', 'aStatus', 'aCarer', 'aSvc', 'problems', 'goals', 'plan', 'aNote', 'output']) {
    await page.evaluate(s => document.querySelector('.rail a[data-sec="' + s + '"]').click(), sec);
    await page.waitForTimeout(60);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) { failed++; console.log('FAIL  iPhone ' + sec + ' 水平溢出 ' + over + 'px'); }
  }
  await page.evaluate(() => document.querySelector('.rail a[data-sec="aStatus"]').click());
  await page.screenshot({ path: path.join(OUT, 'aa01_phone_status.png'), fullPage: false });
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})();
