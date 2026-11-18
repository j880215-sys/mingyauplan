/* ============================================================
   登入：帳號密碼以 PBKDF2 驗證（帳號檔 src/accounts.js 只有雜湊），
   登入後記住 7 天；個管員姓名在帳號檔中加密，登入成功才解開。
   注意：程式在瀏覽器端執行，這道門只擋一般使用者；個案資料本來就只存在各自的裝置。
   ============================================================ */
var AUTH = (function () {
  var h = UI.h, KEY = 'cpgen.session', LAST = 'cpgen.lastUser', DAYS = 7;
  var fails = 0, lockUntil = 0;

  function unb64(s) { var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function find(u) { u = String(u || '').trim().toLowerCase(); return ACCOUNTS.list.filter(function (a) { return a.u === u; })[0] || null; }
  function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  function ready() { return !!(window.crypto && crypto.subtle && window.TextEncoder); }

  function derive(pw, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ACCOUNTS.iter }, k, 512);
    }).then(function (bits) { return new Uint8Array(bits); });
  }
  /* 登入成功回傳 {u, name}；失敗 reject('bad') */
  function login(user, pw) {
    var a = find(user);
    /* 帳號不存在也照樣跑一次運算，不讓人從回應快慢猜出哪些帳號存在 */
    var salt = a ? unb64(a.s) : unb64('AAAAAAAAAAAAAAAAAAAAAA==');
    return derive(String(pw || ''), salt).then(function (bits) {
      if (!a || !same(b64(bits.subarray(0, 32)), a.h)) throw new Error('bad');
      return crypto.subtle.importKey('raw', bits.subarray(32), 'AES-GCM', false, ['decrypt']).then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(a.iv) }, key, unb64(a.n));
      }).then(function (plain) {
        var name = JSON.parse(new TextDecoder().decode(plain)).name;
        var sess = { u: a.u, name: name, v: a.h, exp: Date.now() + DAYS * 864e5 };
        UI.store.set(KEY, sess);
        return sess;
      });
    });
  }
  function current() {
    var s = UI.store.get(KEY), a = s && find(s.u);
    if (!s || !a || s.v !== a.h || !(s.exp > Date.now())) return null;     /* 過期、帳號已刪除或密碼已更換都要重新登入 */
    return s;
  }
  function logout() { UI.store.del(KEY); }

  /* ---------- 登入畫面：明曜官網風格（服務實拍照拼貼＋深石板青、白色 LOGO、玻璃質感輸入框） ---------- */
  var TILES = ['__LOGIN_TILE1__', '__LOGIN_TILE2__', '__LOGIN_TILE3__', '__LOGIN_TILE4__', '__LOGIN_TILE5__', '__LOGIN_TILE6__', '__LOGIN_TILE7__', '__LOGIN_TILE8__'];
  function svg(html, cls) { var d = document.createElement('span'); d.className = cls || 'lg-ico'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = html; return d; }
  var ICON = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.9-3.6 3.9-6 7.5-6s6.6 2.4 7.5 6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.6v2.4"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c5 0 8.6 4.2 9.8 7-0.5 1.1-1.3 2.4-2.4 3.6M6.3 6.3C4.4 7.6 3 9.6 2.2 12c1.2 2.8 4.8 7 9.8 7 1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 12C3.4 9.2 7 5 12 5s8.6 4.2 9.8 7c-1.2 2.8-4.8 7-9.8 7s-8.6-4.2-9.8-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>'
  };
  var WAVES = '<svg viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 120 C240 40 520 40 760 110 C1000 180 1220 170 1440 90 V260 H0Z" fill="rgba(255,255,255,.07)"/>' +
    '<path d="M0 170 C260 110 520 120 780 170 C1040 220 1240 210 1440 150 V260 H0Z" fill="rgba(255,255,255,.08)"/>' +
    '<path d="M0 215 C300 175 600 185 900 215 C1140 238 1300 232 1440 210 V260 H0Z" fill="rgba(160,214,214,.14)"/></svg>';
  function render(onOk) {
    var app = UI.clear(document.getElementById('app'));
    document.body.classList.add('loginmode');
    var user = h('input', { class: 'lg-inp', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-label': '帳號', placeholder: '帳號' });
    var pw = h('input', { class: 'lg-inp', type: 'password', autocomplete: 'current-password', 'aria-label': '密碼', placeholder: '密碼' });
    var eye = h('button', { type: 'button', class: 'lg-eye', 'aria-label': '顯示密碼' });
    eye.appendChild(svg(ICON.eyeOff));
    eye.addEventListener('click', function () {
      var show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
      eye.replaceChild(svg(show ? ICON.eye : ICON.eyeOff), eye.firstChild); eye.setAttribute('aria-label', show ? '隱藏密碼' : '顯示密碼'); pw.focus();
    });
    var remember = h('input', { type: 'checkbox', 'aria-label': '記住帳號' });
    var msg = h('div', { class: 'lg-msg', role: 'alert' });
    var label = h('span', { text: '登入' }), btn = h('button', { type: 'submit', class: 'lg-btn' }, [h('i', { class: 'lg-spin', 'aria-hidden': 'true' }), label, svg(ICON.arrow, 'lg-ico lg-arrow')]);
    var fields = h('div', { class: 'lg-fields' }, [
      h('label', { class: 'lg-field' }, [svg(ICON.user), user]),
      h('label', { class: 'lg-field' }, [svg(ICON.lock), pw, eye])
    ]);
    var last = UI.store.get(LAST); if (last) { user.value = last; remember.checked = true; }

    function say(t, ok) { msg.textContent = t; msg.className = 'lg-msg' + (t ? (ok ? ' ok' : ' bad') : ''); }
    function busy(on) { btn.disabled = on; btn.classList.toggle('busy', on); label.textContent = on ? '登入中' : '登入'; }
    function shake() { fields.classList.remove('shake'); void fields.offsetWidth; fields.classList.add('shake'); }
    function submit(e) {
      e.preventDefault();
      if (Date.now() < lockUntil) { say('嘗試次數過多，請於 ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' 秒後再試。'); return; }
      if (!user.value.trim() || !pw.value) { say('請輸入帳號與密碼。'); shake(); (user.value.trim() ? pw : user).focus(); return; }
      if (!ready()) { say('這個瀏覽器無法登入，請改用 Safari、Chrome 或 Edge 開啟。'); return; }
      busy(true); say('');
      login(user.value, pw.value).then(function (sess) {
        if (remember.checked) UI.store.set(LAST, sess.u); else UI.store.del(LAST);
        say('歡迎回來，' + sess.name, true);
        setTimeout(function () { document.body.classList.remove('loginmode'); onOk(sess); }, 350);
      }, function () {
        fails++; busy(false); shake();
        if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; say('帳號或密碼錯誤次數過多，請於 30 秒後再試。'); }
        else say('帳號或密碼錯誤，請再試一次。');
        pw.value = ''; pw.focus();
      });
    }
    var form = h('form', { class: 'lg-panel', onsubmit: submit, autocomplete: 'on' }, [
      fields,
      h('label', { class: 'lg-remember' }, [remember, h('span', { text: '記住帳號' })]),
      msg,
      btn
    ]);
    var tiles = h('div', { class: 'lg-tiles', 'aria-hidden': 'true' }, TILES.map(function (src) { return h('div', { class: 'lg-tile', style: 'background-image:url(' + src + ')' }); }));
    var waves = h('div', { class: 'lg-waves' }); waves.innerHTML = WAVES;
    app.appendChild(h('div', { class: 'lg-world' }, [
      tiles, h('div', { class: 'lg-shade', 'aria-hidden': 'true' }), h('div', { class: 'lg-arc', 'aria-hidden': 'true' }), waves,
      h('main', { class: 'lg-wrap' }, [
        h('div', { class: 'lg-brand' }, [
          h('img', { class: 'lg-logo', src: '__LOGIN_LOGO__', alt: '明曜居家長照機構 社區整合型服務中心　Brighten Your Life' }),
          h('h1', { class: 'lg-title' }, [h('span', { class: 'lg-sr', text: 'A個管訪視系統' }), h('img', { src: '__LOGIN_TITLE__', alt: '' })]),
          h('div', { class: 'lg-divider', 'aria-hidden': 'true' }, [h('i'), svg(ICON.heart, 'lg-heart'), h('i')])
        ]),
        form,
        h('p', { class: 'lg-foot' }, ['新北市私立明曜居家長照機構社區整合型中心專用　版本 __VER__', h('br'), '© 明曜居家長照機構 版權所有，未經授權不得複製、修改或散布'])
      ])
    ]));
    setTimeout(function () { (user.value ? pw : user).focus(); }, 60);
  }

  return { login: login, current: current, logout: logout, render: render, ready: ready };
})();
