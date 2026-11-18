/* 產生登入帳號檔 src/accounts.js（不含明碼密碼，也不含姓名明文）
   用法：node tools/make_accounts.js <帳號清單.txt>
   帳號清單每行一組：帳號/密碼/個管員姓名（可用 / 或 ／ 分隔）。
   清單檔含明碼密碼，請放在專案資料夾外，產生完就刪除，切勿上傳。

   作法：PBKDF2-SHA256（ITER 次）由密碼與隨機 salt 導出 64 bytes：
     前 32 bytes＝驗證碼（存進檔案比對用）
     後 32 bytes＝AES-256-GCM 金鑰，用來加密個管員姓名（登入成功才解得開）
   瀏覽器端以 WebCrypto 做同樣的計算（src/auth.js）。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ITER = 310000;
const src = process.argv[2];
if (!src) { console.error('用法：node tools/make_accounts.js <帳號清單.txt>'); process.exit(1); }
const lines = fs.readFileSync(src, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const seen = new Set();
const out = lines.map((line, i) => {
  const [u, p, name] = line.split(/[\/／]/).map(s => (s || '').trim());
  if (!u || !p || !name) throw new Error('第 ' + (i + 1) + ' 行格式錯誤，應為 帳號/密碼/姓名');
  const user = u.toLowerCase();
  if (seen.has(user)) throw new Error('帳號重複：' + user); seen.add(user);
  const salt = crypto.randomBytes(16);
  const bits = crypto.pbkdf2Sync(p, salt, ITER, 64, 'sha256');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', bits.subarray(32), iv);
  const ct = Buffer.concat([c.update(JSON.stringify({ name }), 'utf8'), c.final(), c.getAuthTag()]);
  return { u: user, s: salt.toString('base64'), h: bits.subarray(0, 32).toString('base64'), iv: iv.toString('base64'), n: ct.toString('base64') };
});
const js = '/* 登入帳號（由 tools/make_accounts.js 產生，請勿手改）\n' +
  '   只存加鹽雜湊與加密後的個管員姓名，不含明碼密碼。共 ' + out.length + ' 組。 */\n' +
  'var ACCOUNTS = { iter: ' + ITER + ', list: [\n' + out.map(a => '  ' + JSON.stringify(a)).join(',\n') + '\n] };\n';
const dest = path.join(__dirname, '../src/accounts.js');
fs.writeFileSync(dest, js);
console.log('已產生', dest, '共', out.length, '組帳號：', out.map(a => a.u).join('、'));
