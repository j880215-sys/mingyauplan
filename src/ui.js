/* ============================================================
   介面基礎：DOM 小工具、本機儲存、表單控制項
   ============================================================ */
var UI = (function () {
  'use strict';
  var nz = NAR.nz, arr = NAR.arr;

  /* ---------- DOM ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag), k, v;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    if (kids !== undefined && kids !== null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------- 本機儲存（無法使用時不中斷，改提醒用匯出） ---------- */
  var store = {
    ok: true,
    get: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { store.ok = false; return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { store.ok = false; return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  (function probe() { try { localStorage.setItem('cpgen.probe', '1'); localStorage.removeItem('cpgen.probe'); } catch (e) { store.ok = false; } })();

  /* ---------- 提示訊息、複製、下載 ---------- */
  var toastTimer;
  function toast(msg) {
    var old = document.querySelector('.toast'); if (old) old.remove();
    var t = h('div', { class: 'toast', role: 'status', text: msg }); document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2200);
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0', value: text }); document.body.appendChild(ta);
      ta.focus(); ta.select(); try { ta.setSelectionRange(0, ta.value.length); } catch (e) { } var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { }
      ta.remove(); toast(ok ? (okMsg || '已複製') : '無法自動複製，請手動全選後複製');
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已複製'); }, fallback);
    else fallback();
  }
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function download(filename, text, mime) {
    var blob = text instanceof Blob ? text : new Blob([text], { type: mime || 'application/json' }), url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename }); document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }
  /* 交付多個檔案：iPad／iPhone 走分享選單（可選「儲存到檔案」）；其他裝置逐一下載 */
  function fileObjs(files) {
    try { return files.map(function (f) { return new File([f.blob || f.text], f.name, { type: f.mime }); }); } catch (e) { return null; }
  }
  function canShareFiles(files) { var o = fileObjs(files); return !!(isIOS && o && navigator.canShare && navigator.canShare({ files: o })); }
  function deliverFiles(files, doneMsg) {
    var objs = fileObjs(files);
    if (isIOS && objs && navigator.canShare && navigator.canShare({ files: objs })) {
      navigator.share({ files: objs }).then(function () { toast(doneMsg || '已交給分享選單'); }, function () { });
      return;
    }
    files.forEach(function (f, i) { setTimeout(function () { download(f.name, f.blob || f.text, f.mime); }, i * 400); });
    toast(doneMsg || '已下載 ' + files.length + ' 個檔案');
  }
  /* 個案資料夾帶在存出的 PDF（新版）或「訪視評估表.html」（舊版）裡，匯入時從中取出 */
  function parseCaseFile(text) {
    text = String(text || '').replace(/^﻿/, '');
    if (/^\s*</.test(text)) {
      var m = /<script type="application\/json" id="cpgen-data">([\s\S]*?)<\/script>/.exec(text);
      if (!m) throw new Error('no data');
      return JSON.parse(m[1]);
    }
    return JSON.parse(text);
  }
  function pickFile(cb) {
    var inp = h('input', { type: 'file', accept: '.pdf,.html,.htm,.json,application/pdf,text/html,application/json', style: 'display:none' });
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var b = new Uint8Array(rd.result), obj;
          if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) { obj = PDF.extractData(rd.result); if (!obj) throw new Error('no data'); }   /* %PDF */
          else obj = parseCaseFile(new TextDecoder('utf-8').decode(b));
          cb(obj);
        } catch (e) { toast('這個檔案無法讀取，請選擇本程式存出的 PDF（訪視評估表、計畫內容）或舊版 html 檔'); }
        inp.remove();
      };
      rd.readAsArrayBuffer(file);
    });
    document.body.appendChild(inp); inp.click();
  }

  /* ---------- 對話框 ---------- */
  function dialog(title, body, buttons) {
    var ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    var foot = h('footer');
    (buttons || [{ label: '關閉' }]).forEach(function (b) {
      foot.appendChild(h('button', { type: 'button', class: 'btn' + (b.pri ? ' pri' : '') + (b.danger ? ' danger' : ''), text: b.label, onclick: function () { if (!b.on || b.on() !== false) close(); } }));
    });
    ov.appendChild(h('div', { class: 'dialog' }, [
      h('header', null, [h('h2', { text: title }), h('button', { type: 'button', class: 'iconbtn', 'aria-label': '關閉', text: '✕', onclick: close })]),
      h('div', { class: 'dbody' }, body), foot]));
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    return { close: close, el: ov };
  }
  function confirmBox(title, msg, okLabel, onOk, danger) {
    dialog(title, h('p', { text: msg, style: 'margin:0;white-space:pre-wrap' }), [{ label: '取消' }, { label: okLabel, pri: !danger, danger: danger, on: onOk }]);
  }

  /* ============================================================
     表單控制項
     ctx.changed()：任何值變動後呼叫；ctx.conds：條件顯示清單
     ============================================================ */
  var EXCL = { bpsd: ['無'], curCare: ['暫未使用'], curOther: ['暫未使用'], walkAid: ['無需輔具'], limbs: ['四肢正常'], skin: ['完整'], med: ['未服用藥物'], hearing: ['正常'], teeth: ['正常'], stool: ['正常'] };
  function opts(def) { return (def.options || []).map(function (o) { return typeof o === 'string' ? { v: o, l: o } : { v: o.v, l: o.l || o.v, add: o.add }; }); }

  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight + 2, 72) + 'px'; }

  function textInput(def, obj, ctx) {
    var inp = h('input', { class: 'inp', type: 'text', value: nz(obj[def.id]), placeholder: def.ph || '', inputmode: def.inputmode || (def.type === 'number' ? 'decimal' : null),
      list: def.datalist ? 'dl-' + def.datalist : null, style: def.w ? 'width:' + def.w : null, 'aria-label': def.label || def.aria || def.id, autocomplete: 'off',
      oninput: function () { obj[def.id] = inp.value; ctx.changed(); } });
    if (!def.prefix && !def.suffix) return inp;
    return h('div', { class: 'inwrap' }, [def.prefix ? h('span', { class: 'affix', text: def.prefix }) : null, inp, def.suffix ? h('span', { class: 'affix', text: def.suffix }) : null]);
  }
  /* 出生年次／年齡：兩格擇一填。填年次 → 年齡格自動帶出換算結果（以訪視日期為準）；直接填年齡 → 清掉年次 */
  function byearInput(def, obj, ctx) {
    function ref() { return (obj.visitDate) || (refDate.fn && refDate.fn()) || ''; }
    var by, ag;
    function sync() {
      if (nz(obj.birthYear)) { obj.age = NAR.ageOf(obj, ref()); ag.value = obj.age; ag.classList.add('auto'); }
      else ag.classList.remove('auto');
    }
    by = h('input', { class: 'inp', type: 'text', inputmode: 'numeric', value: nz(obj.birthYear), placeholder: '如 35', style: 'width:4.5em', 'aria-label': '出生年次', autocomplete: 'off',
      oninput: function () { obj.birthYear = by.value.replace(/[^\d]/g, ''); if (!obj.birthYear) { obj.age = ''; ag.value = ''; } sync(); ctx.changed(); } });
    ag = h('input', { class: 'inp agein', type: 'text', inputmode: 'numeric', value: nz(obj.age), placeholder: '歲', style: 'width:4em', 'aria-label': '年齡', autocomplete: 'off',
      oninput: function () { obj.age = ag.value.replace(/[^\d]/g, ''); obj.birthYear = ''; by.value = ''; sync(); ctx.changed(); } });
    sync();
    return h('div', { class: 'inwrap' }, [h('span', { class: 'affix', text: '民國' }), by, h('span', { class: 'affix', text: '年次' }),
      h('span', { class: 'affix or', text: '或' }), ag, h('span', { class: 'affix', text: '歲' })]);
  }
  var refDate = { fn: null };   /* app 設定：回傳目前個案的訪視日期 */
  function dateInput(def, obj, ctx) {
    var inp = h('input', { class: 'inp', type: 'date', value: nz(obj[def.id]), style: 'width:11.5em', 'aria-label': def.label || def.id, onchange: function () { obj[def.id] = inp.value; ctx.changed(); }, oninput: function () { obj[def.id] = inp.value; ctx.changed(); } });
    var roc = h('span', { class: 'help' });
    function sync() { var t = NAR.rocLong(obj[def.id]); roc.textContent = t ? '民國' + t : ''; }
    inp.addEventListener('input', sync); inp.addEventListener('change', sync); sync();
    return h('div', { class: 'inwrap' }, [inp, roc]);
  }
  function textareaInput(def, obj, ctx) {
    var ta = h('textarea', { class: 'inp', rows: def.rows || 2, placeholder: def.ph || '', 'aria-label': def.label || def.id, oninput: function () { obj[def.id] = ta.value; autoGrow(ta); ctx.changed(); } });
    ta.value = nz(obj[def.id]);
    setTimeout(function () { if (ta.value) autoGrow(ta); }, 0);
    return ta;
  }
  function singleInput(def, obj, ctx) {
    var box = h('div', { class: 'chips' + (def.compact ? ' compact' : ''), role: 'radiogroup', 'aria-label': def.label || def.id }), btns = [];
    if (def.prefix) box.appendChild(h('span', { class: 'affix', text: def.prefix }));
    function sync() { btns.forEach(function (p) { p[0].setAttribute('aria-checked', obj[def.id] === p[1] ? 'true' : 'false'); }); }
    opts(def).forEach(function (o) {
      var b = h('button', { type: 'button', class: 'chip', role: 'radio', onclick: function () { obj[def.id] = obj[def.id] === o.v ? '' : o.v; sync(); ctx.changed(); } }, [o.l]);
      btns.push([b, o.v]); box.appendChild(b);
    });
    if (def.suffix) box.appendChild(h('span', { class: 'affix', text: def.suffix }));
    sync(); return box;
  }
  function multiInput(def, obj, ctx) {
    var wrap = h('div'), box = h('div', { class: 'chips' + (def.compact ? ' compact' : ''), role: 'group', 'aria-label': def.label || def.id }), btns = [];
    var notes = h('div', { class: 'notes' }), excl = def.excl || EXCL[def.id] || [];
    function cur() { if (!Array.isArray(obj[def.id])) obj[def.id] = []; return obj[def.id]; }
    function toggle(v) {
      var a = cur(), i = a.indexOf(v);
      if (i >= 0) a.splice(i, 1);
      else {
        if (excl.indexOf(v) >= 0) a.length = 0;
        else excl.forEach(function (x) { var j = a.indexOf(x); if (j >= 0) a.splice(j, 1); });
        a.push(v);
      }
      /* 依選項原順序排列，輸出文字才穩定 */
      var order = opts(def).map(function (o) { return o.v; }).concat(['__other']);
      a.sort(function (x, y) { return order.indexOf(x) - order.indexOf(y); });
      sync(); ctx.changed();
    }
    function sync() {
      var a = cur();
      btns.forEach(function (p) { p[0].setAttribute('aria-checked', a.indexOf(p[1]) >= 0 ? 'true' : 'false'); });
      clear(notes);
      if (def.note) {
        if (!obj[def.id + '__note']) obj[def.id + '__note'] = {};
        var nm = obj[def.id + '__note'];
        a.forEach(function (v) {
          if (v === '__other') return;
          var inp = h('input', { class: 'inp', type: 'text', style: 'width:13em', value: nz(nm[v]), placeholder: '備註（選填）', 'aria-label': v + ' 備註', oninput: function () { nm[v] = inp.value; ctx.changed(); } });
          notes.appendChild(h('label', null, [v, inp]));
        });
      }
      if (def.other && a.indexOf('__other') >= 0) {
        var oi = h('input', { class: 'inp', type: 'text', style: 'width:16em', value: nz(obj[def.id + '__other']), placeholder: '請填寫', 'aria-label': (def.label || def.id) + ' 其他', oninput: function () { obj[def.id + '__other'] = oi.value; ctx.changed(); } });
        notes.appendChild(h('label', null, ['其他：', oi]));
      }
      notes.hidden = !notes.firstChild;
    }
    opts(def).forEach(function (o) {
      var b = h('button', { type: 'button', class: 'chip', role: 'checkbox', onclick: function () { toggle(o.v); } }, [o.l]);
      btns.push([b, o.v]); box.appendChild(b);
    });
    if (def.other) { var ob = h('button', { type: 'button', class: 'chip', role: 'checkbox', text: '其他', onclick: function () { toggle('__other'); } }); btns.push([ob, '__other']); box.appendChild(ob); }
    wrap.appendChild(box); wrap.appendChild(notes);
    if (def.note && def.noteHint) wrap.appendChild(h('div', { class: 'help', text: def.noteHint }));
    sync(); return wrap;
  }
  var SCALE_BG = ['#4aa3e8', '#8fd1fb', '#9dfbe8', '#9af78c', '#63df4c', '#bdf87c', '#fbf07e', '#fbc94c', '#f9a13c', '#f8866e', '#f4564c'];
  function scaleInput(def, obj, ctx) {
    var box = h('div', { class: 'scale', role: 'radiogroup', 'aria-label': def.label }), btns = [];
    function sync() { btns.forEach(function (b, i) { b.setAttribute('aria-checked', String(obj[def.id]) === String(i) ? 'true' : 'false'); }); }
    for (var i = 0; i <= 10; i++) (function (i) {
      var b = h('button', { type: 'button', role: 'radio', text: String(i), style: 'background:' + SCALE_BG[i], onclick: function () { obj[def.id] = String(obj[def.id]) === String(i) ? '' : i; sync(); ctx.changed(); } });
      btns.push(b); box.appendChild(b);
    })(i);
    sync();
    return h('div', null, [box, h('div', { class: 'scalecap' }, [h('span', { text: '0 不痛' }), h('span', { text: '10 最痛' })])]);
  }
  /* ---- 肌力小人圖：上臂、前臂、大腿、小腿（左右各一）。編輯畫面與列印共用同一張圖 ----
     人形面向讀者：畫面左側是個案的右側。座標以 viewBox 0 0 320 300 計。 */
  var BODY = { W: 320, H: 300, bw: 66, bh: 30, lx: 6, rx: 248,
    rows: { ua: 96, fa: 150, th: 206, ca: 262 },
    mid: { rua: [142, 105], rfa: [114, 146], rth: [149, 202], rca: [135, 255], lua: [178, 105], lfa: [206, 146], lth: [171, 202], lca: [185, 255] } };
  function bodyBoxes() {
    return NAR.MUSCLE.map(function (m) {
      var k = m[0], right = k.charAt(0) === 'r';
      return { key: k, label: m[1], x: right ? BODY.lx : BODY.rx, y: BODY.rows[k.slice(1)] - BODY.bh / 2, mid: BODY.mid[k], right: right };
    });
  }
  function escX(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /* mp：{rua:'4',...}；opts.boxes＝畫出分數框（列印用）；編輯畫面由下拉選單蓋在框的位置 */
  function bodySvg(mp, opts) {
    mp = mp || {}; opts = opts || {};
    var ink = opts.ink || '#1d2a28', acc = opts.accent || '#3d7cc0', o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + BODY.W + ' ' + BODY.H + '" class="bodysvg" role="img" aria-label="肌力評估人形圖">');
    var segs = { rua: 'M160 86L124 124', rfa: 'M124 124L104 168', lua: 'M160 86L196 124', lfa: 'M196 124L216 168', rth: 'M160 176L138 228', rca: 'M138 228L132 282', lth: 'M160 176L182 228', lca: 'M182 228L188 282' };
    /* 已評分的肢段加淡色底，對照較清楚 */
    Object.keys(segs).forEach(function (k) { if (nz(mp[k]) !== '') o.push('<path d="' + segs[k] + '" stroke="' + acc + '" stroke-opacity=".28" stroke-width="11" stroke-linecap="round" fill="none"/>'); });
    o.push('<g fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="160" cy="40" r="22"/><path d="M150 48q10 8 20 0"/><path d="M160 62V176"/>' +
      Object.keys(segs).map(function (k) { return '<path d="' + segs[k] + '"/>'; }).join('') +
      '<path d="M132 282H118M188 282H202"/></g>');
    o.push('<g fill="' + ink + '"><circle cx="152" cy="36" r="2.2"/><circle cx="168" cy="36" r="2.2"/><circle cx="124" cy="124" r="3.2"/><circle cx="196" cy="124" r="3.2"/><circle cx="138" cy="228" r="3.2"/><circle cx="182" cy="228" r="3.2"/></g>');
    o.push('<text x="39" y="22" text-anchor="middle" font-size="12" fill="#6b7a80">個案右側</text><text x="281" y="22" text-anchor="middle" font-size="12" fill="#6b7a80">個案左側</text>');
    bodyBoxes().forEach(function (b) {
      var cy = b.y + BODY.bh / 2, ex = b.right ? b.x + BODY.bw : b.x;
      o.push('<path d="M' + ex + ' ' + cy + 'L' + b.mid[0] + ' ' + b.mid[1] + '" stroke="#9aa7ad" stroke-width="1.2" stroke-dasharray="3 3" fill="none"/>');
      o.push('<circle cx="' + b.mid[0] + '" cy="' + b.mid[1] + '" r="2.4" fill="#9aa7ad"/>');
      o.push('<text x="' + (b.x + BODY.bw / 2) + '" y="' + (b.y - 5) + '" text-anchor="middle" font-size="12.5" fill="#44535a">' + b.label + '</text>');
      if (opts.boxes) {
        var v = nz(mp[b.key]);
        o.push('<rect x="' + b.x + '" y="' + b.y + '" width="' + BODY.bw + '" height="' + BODY.bh + '" rx="6" fill="' + (v !== '' ? '#eaf3fc' : '#fff') + '" stroke="' + ink + '" stroke-width="1.3"/>');
        o.push('<text x="' + (b.x + BODY.bw / 2) + '" y="' + (cy + 6) + '" text-anchor="middle" font-size="17" font-weight="700" fill="' + ink + '">' + (v !== '' ? escX(v) + ' 分' : '') + '</text>');
      }
    });
    o.push('</svg>');
    return o.join('');
  }
  var MUSCLE_LEGEND = [['0', '無肌肉收縮'], ['1', '可見肌肉收縮，無關節動作'], ['2', '去除重力下可完成關節活動'], ['3', '可對抗重力完成動作'], ['4', '可對抗部分阻力'], ['5', '正常肌力']];
  function muscleInput(def, obj, ctx) {
    if (!obj.mp || typeof obj.mp !== 'object') obj.mp = {};
    var stage = h('div', { class: 'bodystage' });
    function draw() {
      var old = stage.querySelector('svg'); if (old) stage.removeChild(old);
      var t = document.createElement('div'); t.innerHTML = bodySvg(obj.mp, { ink: '#33464f' });
      stage.insertBefore(t.firstChild, stage.firstChild);
    }
    bodyBoxes().forEach(function (b) {
      var s = h('select', { class: 'inp', 'aria-label': b.label + '肌力', onchange: function () { obj.mp[b.key] = s.value; draw(); ctx.changed(); } });
      ['', '0', '1', '2', '3', '4', '5'].forEach(function (v) { s.appendChild(h('option', { value: v, text: v === '' ? '—' : v + ' 分' })); });
      s.value = nz(obj.mp[b.key]);
      s.style.left = (b.x / BODY.W * 100) + '%'; s.style.top = (b.y / BODY.H * 100) + '%';
      s.style.width = (BODY.bw / BODY.W * 100) + '%'; s.style.height = (BODY.bh / BODY.H * 100) + '%';
      stage.appendChild(s);
    });
    draw();
    var oldVals = NAR.MUSCLE_OLD.filter(function (k) { return nz(obj.mp[k[0]]) !== ''; }).map(function (k) { return k[1] + ' ' + obj.mp[k[0]] + ' 分'; });
    var legend = h('ul', { class: 'mlegend' }, MUSCLE_LEGEND.map(function (l) { return h('li', null, [h('b', { text: l[0] }), l[1]]); }));
    var oldBox = oldVals.length ? h('div', { class: 'help' }, ['舊版紀錄（只分上肢／下肢）：' + oldVals.join('、') + '，仍會寫進計畫文字。 ',
      h('button', { type: 'button', class: 'btn sm', text: '清除舊版分數', onclick: function () { NAR.MUSCLE_OLD.forEach(function (k) { delete obj.mp[k[0]]; }); oldBox.hidden = true; ctx.changed(); } })]) : null;
    return h('div', null, [h('div', { class: 'musclewrap' }, [stage, legend]), oldBox]);
  }
  /* ---- 疼痛評估量表（臉譜＋0–10 色階），列印用 ---- */
  function painSvg(score) {
    var sel = (score === '' || score === undefined || score === null) ? -1 : +score, o = [];
    var face = ['#fde68a', '#fcd34d', '#fbb4a5', '#f99a85', '#f2705f', '#e5483f'], ink = '#5b3a1e';
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 150" class="painsvg" role="img" aria-label="疼痛評估量表' + (sel >= 0 ? '，' + sel + '分' : '') + '">');
    o.push('<defs><clipPath id="pbar"><rect x="0" y="92" width="660" height="34" rx="9"/></clipPath></defs>');
    var mouths = ['<path d="M-12 5Q0 22 12 5Z" fill="#8a3324"/>', '<path d="M-11 6Q0 16 11 6" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
      '<path d="M-9 10h18" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>', '<path d="M-10 13Q0 5 10 13" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
      '<path d="M-11 14Q0 3 11 14" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>', '<path d="M-12 13l4-5 4 5 4-5 4 5 4-5" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linejoin="round"/>'];
    for (var i = 0; i <= 5; i++) {
      var cx = i * 120 + 30, near = sel >= 0 && Math.abs(sel - i * 2) <= 1;
      o.push('<g transform="translate(' + cx + ' 44)" opacity="' + (sel < 0 || near ? 1 : .4) + '">');
      o.push('<circle r="26" fill="' + face[i] + '"' + (near ? ' stroke="#1d2a28" stroke-width="2.2"' : '') + '/>');
      if (i <= 1) o.push('<circle cx="-9" cy="-7" r="3" fill="' + ink + '"/><circle cx="9" cy="-7" r="3" fill="' + ink + '"/>');
      else if (i <= 3) o.push('<path d="M-13 -7h8M5 -7h8" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>');
      else o.push('<path d="M-14 -11l7 4-7 4M14 -11l-7 4 7 4" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
      o.push(mouths[i] + '</g>');
    }
    o.push('<g clip-path="url(#pbar)">');
    for (var j = 0; j <= 10; j++) o.push('<rect x="' + j * 60 + '" y="92" width="60" height="34" fill="' + SCALE_BG[j] + '"/>');
    o.push('</g>');
    for (var k = 0; k <= 10; k++) o.push('<text x="' + (k * 60 + 30) + '" y="115" text-anchor="middle" font-size="15" font-weight="' + (k === sel ? 800 : 600) + '" fill="#1b2430">' + k + '</text>');
    if (sel >= 0 && sel <= 10) o.push('<rect x="' + (sel * 60 + 2) + '" y="90" width="56" height="38" rx="7" fill="none" stroke="#1d2a28" stroke-width="3"/><path d="M' + (sel * 60 + 30) + ' 131l-7 10h14z" fill="#1d2a28"/>');
    o.push('<text x="2" y="146" font-size="11" fill="#6b7a80">0 不痛</text><text x="658" y="146" text-anchor="end" font-size="11" fill="#6b7a80">10 最痛</text>');
    o.push('</svg>');
    return o.join('');
  }
  function bmiInput(def, obj, ctx) {
    var out = h('b', { text: '—' }), cat = h('span', { class: 'help' });
    function sync() { var b = NAR.bmiOf(obj); out.textContent = b || '—'; cat.textContent = b ? '（' + NAR.bmiCat(b) + '）' : ''; }
    var c2 = { changed: function () { sync(); ctx.changed(); }, conds: ctx.conds };
    var el = h('div', { class: 'inline' }, [h('span', { text: '身高' }), textInput({ id: 'height', type: 'number', w: '5.5em', aria: '身高' }, obj, c2), h('span', { text: 'cm ／ 體重' }),
      textInput({ id: 'weight', type: 'number', w: '5.5em', aria: '體重' }, obj, c2), h('span', { text: 'kg ／ BMI' }), out, cat,
      multiInput({ id: 'wtUnknown', options: ['未測量'], compact: 1, label: '體重未測量' }, obj, c2)]);
    sync(); return el;
  }
  function sketchInput(def, obj, ctx) {
    var W = 720, H = 380, cv = h('canvas', { class: 'sketch', width: W, height: H, 'aria-label': def.label }), g = cv.getContext('2d'), drawing = false, last = null, undo = [];
    g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d2a28';
    cv.style.width = 'min(100%, ' + W + 'px)';
    if (obj[def.id]) { var im = new Image(); im.onload = function () { g.drawImage(im, 0, 0, W, H); }; im.src = obj[def.id]; }
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { } undo.push(g.getImageData(0, 0, W, H)); if (undo.length > 15) undo.shift(); drawing = true; last = pos(e); });
    cv.addEventListener('pointermove', function (e) { if (!drawing) return; var p = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; });
    function end() { if (!drawing) return; drawing = false; obj[def.id] = cv.toDataURL('image/png'); ctx.changed(); }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
    var bar = h('div', { class: 'sketchbar' }, [
      h('button', { type: 'button', class: 'btn sm', text: '復原一筆', onclick: function () { var d = undo.pop(); if (d) { g.putImageData(d, 0, 0); obj[def.id] = cv.toDataURL('image/png'); ctx.changed(); } } }),
      h('button', { type: 'button', class: 'btn sm', text: '清除', onclick: function () { undo.push(g.getImageData(0, 0, W, H)); g.clearRect(0, 0, W, H); obj[def.id] = ''; ctx.changed(); } })]);
    return h('div', null, [cv, bar]);
  }
  /* 選單＋自行填寫（稱謂用）：iPad 上是原生滾輪選單，清單沒有的可自行輸入 */
  function choiceInput(def, obj, ctx) {
    var list = def.choices || DATA.relations, lab = def.label || def.aria || def.id;
    var sel = h('select', { class: 'inp', 'aria-label': lab }), custom = false;
    sel.appendChild(h('option', { value: '', text: '請選擇' }));
    list.forEach(function (o) { sel.appendChild(h('option', { value: o, text: o })); });
    sel.appendChild(h('option', { value: '__custom', text: '自行填寫…' }));
    var inp = h('input', { class: 'inp', type: 'text', style: 'width:8.5em', placeholder: '自行填寫', 'aria-label': lab + '（自行填寫）', autocomplete: 'off',
      oninput: function () { obj[def.id] = inp.value; ctx.changed(); } });
    var v = nz(obj[def.id]);
    if (v && list.indexOf(v) < 0) custom = true;
    function sync() {
      var cur = nz(obj[def.id]);
      if (custom) { sel.value = '__custom'; inp.hidden = false; if (document.activeElement !== inp) inp.value = cur; }
      else { sel.value = cur; inp.hidden = true; }
    }
    sel.addEventListener('change', function () {
      if (sel.value === '__custom') { custom = true; obj[def.id] = ''; sync(); inp.focus(); }
      else { custom = false; obj[def.id] = sel.value; sync(); }
      ctx.changed();
    });
    sync();
    return h('div', { class: 'inwrap' }, [sel, inp]);
  }
  function inlineInput(def, obj, ctx) {
    var box = h('div', { class: 'inline' });
    def.parts.forEach(function (p) {
      if (typeof p === 'string') box.appendChild(h('span', { text: p }));
      else box.appendChild(control(p, obj, ctx));
    });
    return box;
  }
  function listInput(def, obj, ctx) {
    var box = h('div', { class: 'list' });
    function cur() { if (!Array.isArray(obj[def.id])) obj[def.id] = []; return obj[def.id]; }
    function render() {
      clear(box);
      cur().forEach(function (item, i) {
        var row = h('div', { class: 'litem' + (def.card ? ' card' : '') });
        if (def.card) row.appendChild(h('span', { class: 'idx', text: '(' + (i + 1) + ')' }));
        def.item.forEach(function (fd) { row.appendChild(field(fd, item, ctx)); });
        var acts = h('div', { class: 'rm', style: 'display:flex;gap:6px' });
        if (def.card && i > 0) acts.appendChild(h('button', { type: 'button', class: 'iconbtn', 'aria-label': '上移', text: '↑', onclick: function () { var a = cur(); a.splice(i - 1, 0, a.splice(i, 1)[0]); render(); ctx.changed(); } }));
        acts.appendChild(h('button', { type: 'button', class: 'iconbtn', 'aria-label': '移除這一列', text: '移除', onclick: function () { cur().splice(i, 1); render(); ctx.changed(); } }));
        row.appendChild(acts);
        box.appendChild(row);
      });
      box.appendChild(h('button', { type: 'button', class: 'btn addbtn', text: '＋ ' + (def.addLabel || '新增'), onclick: function () {
        var it = {}; def.item.forEach(function (fd) { if (fd.def !== undefined) it[fd.id] = fd.def; });
        cur().push(it); render(); ctx.changed();
        var ins = box.querySelectorAll('.litem'); var lastRow = ins[ins.length - 1]; var first = lastRow && lastRow.querySelector('input'); if (first) first.focus();
      } }));
      ctx.refreshConds && ctx.refreshConds();
    }
    render(); return box;
  }
  function control(def, obj, ctx) {
    switch (def.type) {
      case 'text': case 'number': return textInput(def, obj, ctx);
      case 'date': return dateInput(def, obj, ctx);
      case 'byear': return byearInput(def, obj, ctx);
      case 'textarea': return textareaInput(def, obj, ctx);
      case 'single': return singleInput(def, obj, ctx);
      case 'multi': return multiInput(def, obj, ctx);
      case 'scale': return scaleInput(def, obj, ctx);
      case 'muscle': return muscleInput(def, obj, ctx);
      case 'bmi': return bmiInput(def, obj, ctx);
      case 'sketch': return sketchInput(def, obj, ctx);
      case 'inline': return inlineInput(def, obj, ctx);
      case 'list': return listInput(def, obj, ctx);
      case 'choice': return choiceInput(def, obj, ctx);
    }
    return h('span', { text: '?' });
  }
  function isWide(def) { return def.type === 'textarea' || def.type === 'muscle' || def.type === 'list' || def.type === 'sketch' || def.w === '100%' || def.note; }
  function field(def, obj, ctx) {
    var wrap = h('div', { class: 'fld' + (isWide(def) ? ' wide' : ''), 'data-fid': def.id || null });
    if (def.label) wrap.appendChild(h('div', { class: 'fl' }, [def.label]));
    wrap.appendChild(control(def, obj, ctx));
    if (def.showIf) { ctx.conds.push({ el: wrap, fn: def.showIf, obj: obj }); wrap.hidden = !def.showIf(obj); }
    return wrap;
  }
  /* 欄位是否已有值 */
  function hasValue(def, obj) {
    if (def.type === 'inline') return def.parts.some(function (p) { return typeof p !== 'string' && hasValue(p, obj); });
    if (def.type === 'bmi') return !!(nz(obj.height) || nz(obj.weight));
    var v = obj[def.id];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.keys(v).some(function (k) { return nz(v[k]) !== ''; });
    return nz(v) !== '';
  }

  return { h: h, clear: clear, uid: uid, store: store, toast: toast, copyText: copyText, download: download, pickFile: pickFile, dialog: dialog, confirmBox: confirmBox,
    field: field, control: control, deliverFiles: deliverFiles, canShareFiles: canShareFiles, parseCaseFile: parseCaseFile, isIOS: isIOS, textInput: textInput, textareaInput: textareaInput, singleInput: singleInput, multiInput: multiInput, hasValue: hasValue, opts: opts, autoGrow: autoGrow, bodySvg: bodySvg, painSvg: painSvg, MUSCLE_LEGEND: MUSCLE_LEGEND, refDate: refDate };
})();
