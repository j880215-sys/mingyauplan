#!/usr/bin/env python3
"""產生登入畫面素材到 src/assets/login/（只需 Pillow）：
  logo-white.png   明曜 LOGO（白色版，放在深色照片上）
  tile1~8.jpg      背景照片（官網首屏的 8 張服務實拍照，裁成直式並壓縮）
  title.png        標題「A個管訪視系統」：以 Noto Serif TC（OFL 授權）預先畫成透明圖，
                   不必內嵌整套字型，各裝置看到的字型一致
用法：py tools/make_login_assets.py [官網 images 資料夾] [LOGO 檔]
"""
import pathlib, sys
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'src' / 'assets' / 'login'
out.mkdir(parents=True, exist_ok=True)
photos = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / '網頁製作' / '明曜網頁設計' / 'images'
logo_src = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else sorted(root.glob('*LOGO-04*.png'))[0]

# ---- LOGO 白色版：保留透明度，顏色一律改白 ----
lg = Image.open(logo_src).convert('RGBA')
lg = lg.crop(lg.getchannel('A').getbbox())
white = Image.new('RGBA', lg.size, (255, 255, 255, 0))
white.putalpha(lg.getchannel('A'))
w = 600
white = white.resize((w, round(lg.height * w / lg.width)), Image.LANCZOS)
white.save(out / 'logo-white.png', optimize=True)

# ---- 背景照片：依官網首屏順序，裁成 3:4 直式 ----
TILES = [('S__40132699_0.jpg', .5), ('S__40132696_0.jpg', .18), ('S__40132695_0.jpg', .5), ('S__40132700_0.jpg', .5),
         ('S__40132698_0.jpg', .5), ('S__40132697_0.jpg', .5), ('S__40132702_0.jpg', .2), ('S__40132701_0.jpg', .15)]
for i, (name, fy) in enumerate(TILES, 1):
    im = Image.open(photos / name).convert('RGB')
    tw, th = 3, 4
    if im.width / im.height > tw / th:
        nw = round(im.height * tw / th); x = (im.width - nw) // 2; im = im.crop((x, 0, x + nw, im.height))
    else:
        nh = round(im.width * th / tw); y = round((im.height - nh) * fy); im = im.crop((0, y, im.width, y + nh))
    im = im.resize((540, 720), Image.LANCZOS)
    im.save(out / f'tile{i}.jpg', quality=66, optimize=True, progressive=True)

# ---- 標題字：Noto Serif TC 半粗體，白字透明底，3 倍解析度 ----
def find_font():
    for p in [pathlib.Path(r'C:\Windows\Fonts\NotoSerifTC-VF.ttf'), pathlib.Path.home() / 'AppData/Local/Microsoft/Windows/Fonts/NotoSerifTC-VF.ttf']:
        if p.exists(): return p
    raise SystemExit('找不到 Noto Serif TC 字型（NotoSerifTC-VF.ttf）')
def text_png(text, size, track, path, weight=600):
    f = ImageFont.truetype(str(find_font()), size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    sp = round(size * track)
    widths = [f.getbbox(ch)[2] - f.getbbox(ch)[0] if ch.strip() else size // 3 for ch in text]
    asc, desc = f.getmetrics()
    W = sum(widths) + sp * (len(text) - 1) + 8; H = asc + desc + 8
    img = Image.new('RGBA', (W, H), (255, 255, 255, 0)); d = ImageDraw.Draw(img)
    x = 4
    for ch, cw in zip(text, widths):
        bx = f.getbbox(ch)[0] if ch.strip() else 0
        d.text((x - bx, 4), ch, font=f, fill=(255, 255, 255, 255))
        x += cw + sp
    img = img.crop(img.getchannel('A').getbbox())
    img.save(path, optimize=True)
    return img.size
print('title', text_png('A個管訪視系統', 180, .10, out / 'title.png'))
for p in sorted(out.iterdir()): print(p.name, p.stat().st_size // 1024, 'KB')
