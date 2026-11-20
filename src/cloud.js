/* ============================================================
   雲端同步（Firebase：Authentication＋Firestore，機房 asia-east1 台灣）
   - 每個帳號只能讀寫 users/{uid}/…（Firestore 權限規則）
   - 個案與設定在裝置上先以 AES-GCM 加密才上傳；雲端與本機快取都只有密文
   - 資料金鑰（DEK）每個帳號一把、隨機產生；用「登入密碼＋隨機鹽」導出的金鑰包起來存在 users/{uid}
     → 換裝置只要密碼就能解開；Google 或拿到資料庫的人都讀不到內容
   - 本機：Firestore 離線快取（IndexedDB，密文）＋解開的資料金鑰（不可匯出的 CryptoKey，存在 IndexedDB）
     → 沒網路照常使用，連線後自動上傳；登出會刪掉本機金鑰
   ============================================================ */
var CLOUD = (function () {
  var CFG = {
    apiKey: 'AIzaSyCje59BHJySNCiU760mTrNjlFuEytiq7dU',
    authDomain: 'mingyauaunit-8bd6d.firebaseapp.com',
    projectId: 'mingyauaunit-8bd6d',
    storageBucket: 'mingyauaunit-8bd6d.firebasestorage.app',
    messagingSenderId: '37387697157',
    appId: '1:37387697157:web:ec71b85e160fa314cf306c'
  };
  /* 帳號 mya001 → 雲端信箱 mya001@<專案網域>（專案自有網域，外人無法註冊或收信） */
  var DOMAIN = 'mingyauaunit-8bd6d.firebaseapp.com';
  var ITER = 310000;
  var T = { app: null, auth: null, db: null, fb: null, uid: null, u: null, key: null,
    mem: {}, settings: null, unsub: null, timers: {}, inflight: 0, failed: 0, online: navigator.onLine !== false, onRemote: null, onStatus: null };

  function FB() { return window.__FAKE_FIREBASE__ || window.firebase; }       /* 測試時以模擬的 firebase 取代 */
  function available() { var f = FB(); return !!(f && f.initializeApp && window.crypto && crypto.subtle && window.indexedDB); }
  function boot() {
    if (T.app) return;
    T.fb = FB();
    T.app = T.fb.apps && T.fb.apps.length ? T.fb.app() : T.fb.initializeApp(CFG);
    T.auth = T.fb.auth();
    T.db = T.fb.firestore();
    try { var p = T.db.enablePersistence({ synchronizeTabs: true }); if (p && p.catch) p.catch(function () { }); } catch (e) { }
    window.addEventListener('online', function () { T.online = true; status(); });
    window.addEventListener('offline', function () { T.online = false; status(); });
  }
  function email(u) { return String(u).trim().toLowerCase() + '@' + DOMAIN; }

  /* ---------- 加解密 ---------- */
  var enc = new TextEncoder(), dec = new TextDecoder();
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function toBytes(u8) { return T.fb.firestore.Blob.fromUint8Array(u8); }
  function fromBytes(b) { return b && b.toUint8Array ? b.toUint8Array() : new Uint8Array(b || []); }
  function kek(pw, salt) {
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ITER }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function importDek(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  function seal(obj) {
    var iv = rand(12);
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, T.key, enc.encode(JSON.stringify(obj))).then(function (ct) { return { iv: toBytes(iv), ct: toBytes(new Uint8Array(ct)) }; });
  }
  function open(d) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBytes(d.iv) }, T.key, fromBytes(d.ct)).then(function (p) { return JSON.parse(dec.decode(p)); });
  }

  /* ---------- 本機金鑰保存（IndexedDB，不可匯出的 CryptoKey） ---------- */
  function idb(mode, fn) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('cpgen-keys', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('k'); };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () {
          try { var tx = rq.result.transaction('k', mode), r = fn(tx.objectStore('k')); tx.oncomplete = function () { res(r && r.result !== undefined ? r.result : null); }; tx.onerror = function () { res(null); }; }
          catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  function keepKey(u, uid, key) { return idb('readwrite', function (s) { return s.put({ uid: uid, key: key }, u); }); }
  function loadKey(u) { return idb('readonly', function (s) { return s.get(u); }); }
  function dropKey(u) { return idb('readwrite', function (s) { return s.delete(u); }); }

  /* ---------- 登入 ---------- */
  function authReady() {
    return new Promise(function (res) { var un = T.auth.onAuthStateChanged(function (user) { if (un) un(); res(user); }); });
  }
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function signIn(u, pw) {
    var em = email(u);
    return authReady().then(function (cur) {
      if (cur && cur.email === em) return cur;                         /* 這台裝置已登入過同一個雲端帳號：離線也能進 */
      if (!navigator.onLine) throw err('offline-first');
      return (cur ? T.auth.signOut() : Promise.resolve()).then(function () { return T.auth.signInWithEmailAndPassword(em, pw); }).then(function (c) { return c.user; });
    }).catch(function (e) {
      var c = (e && e.code) || '';
      if (c === 'offline-first' || c === 'auth/network-request-failed') throw err('offline-first');
      if (c === 'auth/too-many-requests') throw err('too-many');
      if (c === 'auth/user-disabled') throw err('disabled');
      if (/auth\/(invalid-credential|invalid-login-credentials|wrong-password|user-not-found|invalid-email)/.test(c)) throw err('cloud-auth');
      throw err('cloud', (e && e.message) || '');
    });
  }
  /* 取得資料金鑰：第一次使用的帳號產生一把；之後用密碼解開。oldPw：密碼更換後，用舊密碼解開再以新密碼重新包 */
  function unlock(uid, pw, oldPw) {
    var ref = T.db.doc('users/' + uid);
    return ref.get().then(function (snap) {
      if (!snap.exists) {
        if (!navigator.onLine) throw err('offline-first');
        var raw = rand(32), salt = rand(16), iv = rand(12);
        return kek(pw, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, raw); }).then(function (wk) {
          return ref.set({ v: 1, iter: ITER, salt: toBytes(salt), wiv: toBytes(iv), wk: toBytes(new Uint8Array(wk)), created: Date.now() });
        }).then(function () { return importDek(raw); });
      }
      var d = snap.data();
      function tryPw(p) { return kek(p, fromBytes(d.salt)).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBytes(d.wiv) }, k, fromBytes(d.wk)); }); }
      return tryPw(pw).then(importDek, function () {
        if (!oldPw) throw err('rekey');
        return tryPw(oldPw).then(function (raw) {
          var salt = rand(16), iv = rand(12);
          return kek(pw, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, raw); })
            .then(function (wk) { return ref.set({ v: 1, iter: ITER, salt: toBytes(salt), wiv: toBytes(iv), wk: toBytes(new Uint8Array(wk)), rekeyed: Date.now() }); })
            .then(function () { return importDek(raw); });
        }, function () { throw err('rekey-bad'); });
      });
    });
  }
  /* 登入畫面驗證密碼後呼叫：連上雲端帳號並解開資料金鑰 */
  function connect(u, pw, oldPw) {
    boot();
    return signIn(u, pw).then(function (user) {
      return unlock(user.uid, pw, oldPw).then(function (key) {
        T.uid = user.uid; T.u = u; T.key = key;
        return keepKey(u, user.uid, key);
      });
    });
  }
  /* 記住登入（7 天內免輸入密碼）：沿用這台裝置保存的金鑰 */
  function restore(u) {
    boot();
    return Promise.all([authReady(), loadKey(u)]).then(function (r) {
      var user = r[0], k = r[1];
      if (!user || user.email !== email(u) || !k || k.uid !== user.uid || !k.key) return false;
      T.uid = user.uid; T.u = u; T.key = k.key; return true;
    }, function () { return false; });
  }
  function logout() {
    var u = T.u;
    return flush().then(function () {
      if (T.unsub) T.unsub(); T.unsub = null;
      T.mem = {}; T.settings = null; T.key = null; T.uid = null; T.u = null;
      return u ? dropKey(u) : null;
    });
  }

  /* ---------- 資料：記憶體中的明文副本，寫入時加密上傳（離線時排隊） ---------- */
  function col() { return T.db.collection('users/' + T.uid + '/cases'); }
  function caseRef(id) { return T.db.doc('users/' + T.uid + '/cases/' + id); }
  function setRef() { return T.db.doc('users/' + T.uid + '/meta/settings'); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  /* 讀入全部個案並持續接收其他裝置的更新 */
  function load(onRemote) {
    T.onRemote = onRemote || null;
    var first = true;
    var sp = setRef().get().then(function (s) { return s.exists ? open(s.data()).then(function (v) { T.settings = v; }, function () { }) : null; }, function () { });
    var cp = new Promise(function (res) {
      T.unsub = col().onSnapshot(function (snap) {
        var initial = first; first = false;
        var jobs = snap.docChanges().map(function (ch) {
          if (ch.type === 'removed') return Promise.resolve({ id: ch.doc.id, rec: null });
          if (!initial && ch.doc.metadata && ch.doc.metadata.hasPendingWrites) return Promise.resolve(null);   /* 自己剛寫的 */
          var d = ch.doc.data();
          return open(d).then(function (rec) { return { id: ch.doc.id, rec: rec, t: d.t || 0 }; }, function () { return null; });
        });
        Promise.all(jobs).then(function (list) {
          var ids = [];
          list.forEach(function (x) {
            if (!x) return;
            if (!x.rec) { if (T.mem[x.id] && !T.timers[x.id]) { delete T.mem[x.id]; ids.push(x.id); } return; }
            var cur = T.mem[x.id];
            if (T.timers[x.id] || (cur && (cur.updatedAt || 0) > (x.rec.updatedAt || 0))) return;    /* 本機有較新的未上傳修改 */
            T.mem[x.id] = x.rec; ids.push(x.id);
          });
          if (initial) res(); else if (ids.length && T.onRemote) T.onRemote(ids);
        });
      }, function () { if (first) { first = false; res(); } T.failed++; status(); });
    });
    return Promise.all([sp, cp]);
  }
  function schedule(id, fn) {
    clearTimeout(T.timers[id]);
    T.timers[id] = setTimeout(function () { delete T.timers[id]; run(fn); }, 800);
    status();
  }
  function run(fn) {
    T.inflight++; status();
    return fn().then(function () { T.inflight--; status(); return true; }, function () { T.inflight--; T.failed++; status(); return false; });
  }
  function writeCase(id) {
    return function () {
      var rec = T.mem[id];
      if (!rec) return caseRef(id).delete();
      return seal(rec).then(function (d) { d.t = rec.updatedAt || Date.now(); d.v = 1; return caseRef(id).set(d); });
    };
  }
  function writeSettings() { return seal(T.settings || {}).then(function (d) { d.t = Date.now(); d.v = 1; return setRef().set(d); }); }
  /* 立即送出所有排隊中的寫入；有網路時等雲端確認，離線時只等寫進本機快取 */
  function flush() {
    var jobs = Object.keys(T.timers).map(function (id) {
      clearTimeout(T.timers[id]); delete T.timers[id];
      return run(id === '__settings' ? writeSettings : writeCase(id));
    });
    return Promise.all(jobs);
  }
  function pending() { return Object.keys(T.timers).length + T.inflight; }
  function status() { if (T.onStatus) T.onStatus({ online: T.online && navigator.onLine !== false, pending: pending() }); }

  /* app.js 使用的同步介面（與 localStorage 版 UI.store 相同）：K = { st, idx, rec } */
  function store(K) {
    var idx = null;
    return {
      ok: true,
      get: function (k) {
        if (k === K.st) return clone(T.settings);
        if (k === K.idx) return clone(idx);
        if (k.indexOf(K.rec) === 0) return clone(T.mem[k.slice(K.rec.length)]) || null;
        return UI.store.get(k);
      },
      set: function (k, v) {
        if (k === K.st) { T.settings = clone(v); schedule('__settings', writeSettings); return true; }
        if (k === K.idx) { idx = clone(v); return true; }
        if (k.indexOf(K.rec) === 0) { var id = k.slice(K.rec.length); T.mem[id] = clone(v); schedule(id, writeCase(id)); return true; }
        return UI.store.set(k, v);
      },
      del: function (k) {
        if (k.indexOf(K.rec) === 0) { var id = k.slice(K.rec.length); delete T.mem[id]; schedule(id, writeCase(id)); return; }
        if (k === K.idx) { idx = null; return; }
        UI.store.del(k);
      }
    };
  }
  function ids() { return Object.keys(T.mem); }
  function has(id) { return !!T.mem[id]; }
  function recOf(id) { return clone(T.mem[id]); }

  return { available: available, connect: connect, restore: restore, logout: logout, load: load, store: store, flush: flush, ids: ids, has: has, recOf: recOf,
    pending: pending, onStatus: function (fn) { T.onStatus = fn; status(); }, email: email, DOMAIN: DOMAIN, _T: T };
})();
