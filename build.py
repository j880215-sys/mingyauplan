#!/usr/bin/env python3
"""把 src/ 的樣式與程式合併成單一離線 HTML 檔（不需網路、不需安裝）。"""
import pathlib, datetime, sys
root = pathlib.Path(__file__).parent
src = root / 'src'
out_dir = root / 'dist' / '照顧計畫產生器'
out_dir.mkdir(parents=True, exist_ok=True)
css = (src / 'style.css').read_text(encoding='utf8')
js = '\n'.join((src / f).read_text(encoding='utf8') for f in ['vendor/html2canvas.min.js', 'pdf.js', 'catalog.js', 'data.js', 'schema.js', 'narrative.js', 'ui.js', 'accounts.js', 'auth.js', 'app.js'])
# 明曜 logo（src/assets，由原始 logo 裁切縮小）以 data URI 內嵌，維持單一離線檔
import base64
for key, name in (('__LOGO_FULL__', 'logo-full.png'), ('__LOGO_MARK__', 'logo-mark.png')):
    uri = 'data:image/png;base64,' + base64.b64encode((src / 'assets' / name).read_bytes()).decode('ascii')
    css = css.replace(key, uri); js = js.replace(key, uri)
def data_uri(name):
    return 'data:image/png;base64,' + base64.b64encode((src / 'assets' / name).read_bytes()).decode('ascii')
# 登入畫面素材（tools/make_login_assets.py 產生）：白色 LOGO、標題字、8 張背景照片
login = src / 'assets' / 'login'
for key, name, mime in [('__LOGIN_LOGO__', 'logo-white.png', 'png'), ('__LOGIN_TITLE__', 'title.png', 'png')] + [('__LOGIN_TILE%d__' % i, 'tile%d.jpg' % i, 'jpeg') for i in range(1, 9)]:
    uri = 'data:image/' + mime + ';base64,' + base64.b64encode((login / name).read_bytes()).decode('ascii')
    css = css.replace(key, uri); js = js.replace(key, uri)
APP_NAME = '明曜A訪視專用程式'   # 加入手機／平板主畫面時顯示的名稱
assert '</script' not in js.lower(), 'JS 內不可出現 </script'
ver = datetime.date.today().strftime('%Y.%m.%d')
js = js.replace('__VER__', ver)
html = f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="application-name" content="{APP_NAME}">
<meta name="apple-mobile-web-app-title" content="{APP_NAME}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#eef2f6">
<link rel="icon" type="image/png" href="{data_uri('icon-32.png')}">
<link rel="apple-touch-icon" href="{data_uri('icon-180.png')}">
<title>照顧計畫產生器</title>
<style>
{css}
</style>
</head>
<body>
<div class="watermark" aria-hidden="true"></div>
<div id="app"><noscript>這個程式需要瀏覽器開啟 JavaScript 才能使用。</noscript></div>
<div id="print"></div>
<script>
/* 照顧計畫產生器 版本 {ver}；完全離線，不連線、不上傳任何資料 */
{js}
</script>
<script>APP.init();</script>
</body>
</html>
"""
(out_dir / '照顧計畫產生器.html').write_text(html, encoding='utf8')
print('built', out_dir / '照顧計畫產生器.html', len(html.encode('utf8')) // 1024, 'KB')
