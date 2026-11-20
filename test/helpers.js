/* 測試用登入：在頁面上臨時加入一組「測試帳號」再從登入畫面登入。
   測試帳號只存在測試執行的瀏覽器記憶體裡，不會寫進程式，也不需要任何真實密碼。
   雲端：每個測試頁面都自動注入模擬的 Firebase（test/fake_firebase.js），測試不會連到真正的雲端。 */
const crypto = require('crypto');
const fs = require('fs'), path = require('path');
const pw = require('playwright');
const FAKE = fs.readFileSync(path.join(__dirname, 'fake_firebase.js'), 'utf8');
/* 包裝 chromium.launch：之後建立的每個 context／page 都先注入模擬雲端 */
if (!pw.chromium.__fakeCloud) {
  const origLaunch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...a) => {
    const b = await origLaunch(...a);
    const nc = b.newContext.bind(b);
    b.newContext = async (...x) => { const c = await nc(...x); await c.addInitScript(FAKE); return c; };
    const np = b.newPage.bind(b);
    b.newPage = async (...x) => { const p = await np(...x); await p.addInitScript(FAKE); return p; };
    return b;
  };
  pw.chromium.__fakeCloud = true;
}
const TESTERS = {
  a: { u: 'tester01', p: 'test-pass-0001', name: '測試個管' },
  b: { u: 'tester02', p: 'test-pass-0002', name: '測試二號' }
};
const cache = {};
/* 與 tools/make_accounts.js 相同的作法 */
function makeAccount(who, iter) {
  const key = who.u + ':' + who.p + ':' + iter;
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
  /* 模擬雲端也建立同帳號（正式環境由管理者在 Firebase 後台建立） */
  await page.evaluate(([u, p]) => { if (window.__FAKE_ADD_USER__ && window.CLOUD) window.__FAKE_ADD_USER__(CLOUD.email(u), p); }, [who.u, who.p]);
}
/* 頁面載入後呼叫：在登入畫面就用測試帳號登入，已在首頁則不動 */
async function enter(page, who = TESTERS.a) {
  await page.waitForSelector('.lg-panel, .homewrap, .top', { timeout: 15000 });
  if (!(await page.locator('.lg-panel').count())) return;
  await addTester(page, who);
  await page.fill('input[aria-label="帳號"]', who.u);
  await page.fill('input[aria-label="密碼"]', who.p);
  await page.click('.lg-btn');
  await page.waitForSelector('.homewrap', { timeout: 20000 });
}
module.exports = { TESTERS, makeAccount, addTester, enter };
