/* ============================================================
   PDF 產生器（完全離線）：
   以 html2canvas 把評估表逐頁畫成圖，再自行組成 A4 PDF。
   個案資料以附件（cpgen-data.json）夾帶在 PDF 內，「匯入存檔」可再取出編輯。
   ============================================================ */
var PDF = (function () {
  var A4 = { w: 595.28, h: 841.89 };            /* pt */
  var CSS_W = 720;                              /* 內容區寬度（CSS px） */
  var MM = { side: 12, top: 12, bottom: 15 };   /* 頁邊距 mm */
  var SCALE = 2;                                /* 解析度倍數：清楚但檔案不過大 */
  var PX_PER_MM = CSS_W / (210 - MM.side * 2);
  var PAGE_H = Math.floor((297 - MM.top - MM.bottom) * PX_PER_MM);   /* 每頁內容高度（CSS px） */

  /* ---------- 文字轉位元組 ---------- */
  function utf8(s) { return new TextEncoder().encode(s); }
  function latin(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function utf16hex(s) { var o = 'FEFF'; for (var i = 0; i < s.length; i++) o += ('000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4); return '<' + o + '>'; }
  function b64bytes(dataUrl) { var s = atob(dataUrl.split(',')[1]), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

  /* ---------- 組 PDF：每頁一張 JPEG，夾帶 JSON 附件 ---------- */
  function build(pages, meta, dataJson) {
    var objs = [];                                  /* 每個物件：[header字串, 串流位元組?] */
    function add(head, stream) { objs.push([head, stream || null]); return objs.length; }
    var catalog = add(''), pagesId = add('');
    var kids = [];
    pages.forEach(function (pg) {
      var img = add('<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpeg.length + ' >>', pg.jpeg);
      var cs = latin('q ' + A4.w + ' 0 0 ' + A4.h + ' 0 0 cm /Im0 Do Q');
      var content = add('<< /Length ' + cs.length + ' >>', cs);
      kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + A4.w + ' ' + A4.h + '] /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + content + ' 0 R >>'));
    });
    var names = '';
    if (dataJson) {
      var jb = utf8(dataJson);
      var ef = add('<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length ' + jb.length + ' >>', jb);
      var fs = add('<< /Type /Filespec /F (cpgen-data.json) /UF ' + utf16hex('cpgen-data.json') + ' /Desc ' + utf16hex('照顧計畫產生器個案資料（匯入用）') + ' /EF << /F ' + ef + ' 0 R >> >>');
      names = ' /Names << /EmbeddedFiles << /Names [(cpgen-data.json) ' + fs + ' 0 R] >> >>';
    }
    var info = add('<< /Title ' + utf16hex(meta.title || '') + ' /Author ' + utf16hex(meta.author || '') + ' /Creator ' + utf16hex('照顧計畫產生器') + ' /Producer (care-plan-generator) >>');
    objs[catalog - 1][0] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R' + names + ' >>';
    objs[pagesId - 1][0] = '<< /Type /Pages /Count ' + kids.length + ' /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] >>';

    var parts = [latin('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')], len = parts[0].length, offs = [];
    objs.forEach(function (o, i) {
      offs.push(len);
      var head = latin((i + 1) + ' 0 obj\n' + o[0] + (o[1] ? '\nstream\n' : '\nendobj\n'));
      parts.push(head); len += head.length;
      if (o[1]) { var tail = latin('\nendstream\nendobj\n'); parts.push(o[1], tail); len += o[1].length + tail.length; }
    });
    var xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(function (o) { return ('000000000' + o).slice(-10) + ' 00000 n \n'; }).join('') +
      'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + len + '\n%%EOF\n';
    parts.push(latin(xref));
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------- 從 PDF 取出夾帶的個案資料 ---------- */
  function extractData(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    var m = /\/Subtype \/application#2Fjson \/Length (\d+) >>\nstream\n/.exec(s);
    if (!m) return null;
    var start = m.index + m[0].length;
    return JSON.parse(new TextDecoder('utf-8').decode(b.subarray(start, start + (+m[1]))));
  }

  /* ---------- 可分頁的位置（相對於元素頂端，CSS px）：
     每一欄位行、表格列、成員卡片的下緣，大標的上緣（大標不會落單在頁底），長段文字的每一行下緣 ---------- */
  function breakPoints(el) {
    var top = el.getBoundingClientRect().top, pts = [];
    function addY(y) { pts.push(Math.round((y - top) * 2) / 2); }
    el.querySelectorAll('.ln, .blk, .mem, tr, .sum, .hd').forEach(function (e) { addY(e.getBoundingClientRect().bottom + 0.5); });
    el.querySelectorAll('h2, .sig, .ft').forEach(function (e) { addY(e.getBoundingClientRect().top - 1); });
    el.querySelectorAll('.ptext').forEach(function (e) {
      var r = document.createRange(); r.selectNodeContents(e);
      Array.prototype.forEach.call(r.getClientRects(), function (q) { addY(q.bottom + 2); });
    });
    return pts.filter(function (y) { return y > 0; }).sort(function (a, b) { return a - b; });
  }
  function pickCut(pts, start, total) {
    var limit = start + PAGE_H, best = -1;
    if (limit >= total) return total;
    for (var i = 0; i < pts.length; i++) { if (pts[i] > limit) break; if (pts[i] > start + PAGE_H * 0.3) best = pts[i]; }
    return best > 0 ? best : limit;                 /* 找不到合適位置（極長的單一區塊）才硬切 */
  }

  /* ---------- 把一個元素輸出成多頁 PDF ---------- */
  function fromElement(el, opts) {
    opts = opts || {};
    if (typeof html2canvas !== 'function') return Promise.reject(new Error('PDF 元件未載入'));
    var total = Math.ceil(el.scrollHeight), pages = [], start = 0, pts = breakPoints(el);
    var pw = Math.round(210 * PX_PER_MM * SCALE), ph = Math.round(297 * PX_PER_MM * SCALE);
    function footer(g, n) {
      g.fillStyle = '#8693a0'; g.font = (8.5 * SCALE * PX_PER_MM / 2.83) + 'px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
      g.textAlign = 'center';
      g.fillText((opts.footer ? opts.footer + '　' : '') + '第 ' + n + ' 頁', pw / 2, ph - MM.bottom * PX_PER_MM * SCALE * 0.45);
    }
    function next() {
      if (start >= total - 2) return Promise.resolve();
      var end = pickCut(pts, start, total), h = Math.ceil(end - start);
      return html2canvas(el, { y: start, height: h, width: CSS_W, scale: SCALE, backgroundColor: '#ffffff', logging: false, useCORS: false }).then(function (cv) {
        var pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;
        var g = pc.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, pw, ph);
        g.drawImage(cv, Math.round(MM.side * PX_PER_MM * SCALE), Math.round(MM.top * PX_PER_MM * SCALE));
        footer(g, pages.length + 1);
        pages.push({ jpeg: b64bytes(pc.toDataURL('image/jpeg', 0.86)), w: pw, h: ph });
        if (opts.progress) opts.progress(Math.min(1, end / total));
        start = end;
        return next();
      });
    }
    return next().then(function () { return build(pages, opts.meta || {}, opts.data); });
  }

  /* 建一個看不見、但有版面的容器來排版要輸出的內容 */
  function stage(css, inner) {
    var host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-20000px;top:0;width:' + CSS_W + 'px;background:#fff;';
    var st = document.createElement('style'); st.textContent = css; host.appendChild(st);
    host.appendChild(inner);
    document.body.appendChild(host);
    return host;
  }

  return { fromElement: fromElement, extractData: extractData, stage: stage, build: build, CSS_W: CSS_W };
})();
