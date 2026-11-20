/* 測試用的模擬 Firebase（Auth＋Firestore）：資料存在頁面的 localStorage「__fakefs」，
   權限規則與正式版相同（只能讀寫 users/{自己的 uid}/…）。由 test/helpers.js 自動注入，不會進入正式程式。 */
(function () {
  if (window.__FAKE_FIREBASE__) return;
  var KEY = '__fakefs';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, docs: {}, authUser: null }; } catch (e) { return { users: {}, docs: {}, authUser: null }; } }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function Blob(u8) { this._b = Array.prototype.slice.call(u8); }
  Blob.prototype.toUint8Array = function () { return new Uint8Array(this._b); };
  Blob.fromUint8Array = function (u8) { return new Blob(u8); };
  function ser(v) { if (v instanceof Blob) return { __b: v._b }; if (v && typeof v === 'object') { var o = Array.isArray(v) ? [] : {}; for (var k in v) o[k] = ser(v[k]); return o; } return v; }
  function deser(v) { if (v && v.__b) return new Blob(v.__b); if (v && typeof v === 'object') { var o = Array.isArray(v) ? [] : {}; for (var k in v) o[k] = deser(v[k]); return o; } return v; }
  function denied() { var e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; }
  function allowed(path) { var m = /^users\/([^\/]+)/.exec(path), cu = load().authUser; return !!(cu && m && m[1] === cu.uid); }
  var listeners = [];
  var auth = {
    currentUser: null,
    onAuthStateChanged: function (cb) { auth.currentUser = load().authUser; setTimeout(function () { cb(auth.currentUser); }, 0); return function () { }; },
    signInWithEmailAndPassword: function (em, pw) {
      if (window.__FAKE_OFFLINE__) { var n = new Error('offline'); n.code = 'auth/network-request-failed'; return Promise.reject(n); }
      var s = load(), u = s.users[em];
      if (!u || u.pw !== pw) { var e = new Error('bad'); e.code = 'auth/invalid-credential'; return Promise.reject(e); }
      s.authUser = { uid: u.uid, email: em }; save(s); auth.currentUser = s.authUser;
      return Promise.resolve({ user: s.authUser });
    },
    signOut: function () { var s = load(); s.authUser = null; save(s); auth.currentUser = null; return Promise.resolve(); }
  };
  function snapOf(path, d, pending) { return { id: path.split('/').pop(), exists: !!d, data: function () { return deser(d); }, metadata: { hasPendingWrites: !!pending } }; }
  function notify(path, removed) {
    listeners.forEach(function (l) {
      if (path.indexOf(l.prefix) !== 0 || path.slice(l.prefix.length).indexOf('/') >= 0) return;
      var d = load().docs[path];
      setTimeout(function () { l.cb({ docChanges: function () { return [{ type: removed ? 'removed' : 'modified', doc: snapOf(path, d, true) }]; } }); }, 0);
    });
  }
  function docRef(path) {
    return {
      get: function () { if (!allowed(path)) return Promise.reject(denied()); return Promise.resolve(snapOf(path, load().docs[path])); },
      set: function (d) { if (!allowed(path)) return Promise.reject(denied()); var s = load(); s.docs[path] = ser(d); save(s); window.__FAKE_WRITES__ = (window.__FAKE_WRITES__ || 0) + 1; notify(path); return Promise.resolve(); },
      delete: function () { if (!allowed(path)) return Promise.reject(denied()); var s = load(); delete s.docs[path]; save(s); notify(path, true); return Promise.resolve(); }
    };
  }
  function colRef(path) {
    var prefix = path + '/';
    return {
      onSnapshot: function (cb, err) {
        if (!allowed(path)) { setTimeout(function () { err && err(denied()); }, 0); return function () { }; }
        var l = { prefix: prefix, cb: cb }; listeners.push(l);
        setTimeout(function () {
          var docs = load().docs, ch = Object.keys(docs).filter(function (p) { return p.indexOf(prefix) === 0 && p.slice(prefix.length).indexOf('/') < 0; })
            .map(function (p) { return { type: 'added', doc: snapOf(p, docs[p]) }; });
          cb({ docChanges: function () { return ch; } });
        }, 0);
        return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
      }
    };
  }
  var db = { enablePersistence: function () { return Promise.resolve(); }, doc: docRef, collection: colRef };
  var firestore = function () { return db; }; firestore.Blob = Blob;
  window.__FAKE_FIREBASE__ = { initializeApp: function () { return {}; }, auth: function () { return auth; }, firestore: firestore };
  window.__FAKE_ADD_USER__ = function (em, pw) { var s = load(); if (!s.users[em]) s.users[em] = { uid: 'uid_' + em.split('@')[0], pw: pw }; save(s); };
  window.__FAKE_DUMP__ = function () { return load(); };
})();
