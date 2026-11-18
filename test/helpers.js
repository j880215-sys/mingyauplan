/* 測試用登入：在頁面上臨時加入一組「測試帳號」再從登入畫面登入。
   測試帳號只存在測試執行的瀏覽器記憶體裡，不會寫進程式，也不需要任何真實密碼。 */
const crypto = require('crypto');
const TESTERS = {
  a: { u: 'tester01', p: 'test-pass-0001', name: '測試個管' },
  b: { u: 'tester02', p: 'test-pass-0002', name: '測試二號' }
};
const cache = {};
/* 與 tools/make_accounts.js 相同的作法 */
function makeAccount(who, iter) {
  const key = who.u + ':' + iter;
  if (cache[key]) return cache[key];
  const salt = crypto.randomBytes(16), bits = crypto.pbkdf2Sync(who.p, salt, iter, 64, 'sha256'), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', bits.subarray(32), iv);
  const ct = Buffer.concat([c.update(JSON.stringify({ name: who.name }), 'utf8'), c.final(), c.getAuthTag()]);
  return (cache[key] = { u: who.u, s: salt.toString('base64'), h: bits.subarray(0, 32).toString('base64'), iv: iv.toString('base64'), n: ct.toString('base64') });
}
async function addTester(page, who) {
  const iter = await page.evaluate(() => ACCOUNTS.iter);
  const acc = makeAccount(who, iter);
  await page.evaluate(a => { if (!ACCOUNTS.list.some(x => x.u === a.u)) ACCOUNTS.list.push(a); }, acc);
}
/* 頁面載入後呼叫：在登入畫面就用測試帳號登入，已在首頁則不動 */
async function enter(page, who = TESTERS.a) {
  await page.waitForSelector('.lg-panel, .homewrap, .top', { timeout: 15000 });
  if (!(await page.locator('.lg-panel').count())) return;
  await addTester(page, who);
  await page.fill('input[aria-label="帳號"]', who.u);
  await page.fill('input[aria-label="密碼"]', who.p);
  await page.click('.lg-btn');
  await page.waitForSelector('.homewrap', { timeout: 15000 });
}
module.exports = { TESTERS, makeAccount, addTester, enter };
