#!/usr/bin/env python3
"""建置並打包：dist/照顧計畫產生器/（可直接複製給同事）與 dist/照顧計畫產生器.zip"""
import pathlib, zipfile, datetime, subprocess, sys, shutil
root = pathlib.Path(__file__).parent
subprocess.run([sys.executable, str(root / 'build.py')], check=True)
d = root / 'dist' / '照顧計畫產生器'
ver = datetime.date.today().strftime('%Y.%m.%d')
roc_year = datetime.date.today().year - 1911
# 存檔資料夾：個案存檔／115年度／1月～12月（程式存檔時也會自動建立）
for y in (roc_year, roc_year + 1):
    for m in range(1, 13):
        (d / '個案存檔' / f'{y}年度' / f'{m}月').mkdir(parents=True, exist_ok=True)
old = d / '個案存檔' / '請把匯出的個案檔放在這裡.txt'
if old.exists(): old.unlink()
(d / '個案存檔' / '說明.txt').write_text(
    '按程式右上角「存檔」時，會依訪視日期把兩個 PDF 放進「○○年度／○月」資料夾：\r\n'
    '　○○○訪視評估表.pdf：可列印，也可以用程式首頁「匯入存檔」重新開啟編輯\r\n'
    '　○○○計畫內容.pdf：計畫目標與計畫執行規劃的文字\r\n\r\n'
    '電腦版 Chrome／Edge：第一次存檔時選擇這個「個案存檔」資料夾，之後會自動分類。\r\n'
    'iPad／iPhone：PDF 產生後按「分享／儲存」，選「儲存到檔案」再自行選資料夾。\r\n\r\n'
    '檔案含有個資，請依單位規定保管，勿用通訊軟體或公開雲端傳送。\r\n', encoding='utf-8-sig')
readme = (root / 'docs' / '使用說明.txt').read_text(encoding='utf8').replace('{ver}', ver)
(d / '使用說明.txt').write_text(readme, encoding='utf-8-sig', newline='\r\n')
z = root / 'dist' / '照顧計畫產生器.zip'
if z.exists(): z.unlink()
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in sorted(d.rglob('*')):
        zf.write(f, f.relative_to(d.parent).as_posix())   # 含空資料夾
print('packaged', z, z.stat().st_size // 1024, 'KB')
