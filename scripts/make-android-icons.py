# -*- coding: utf-8 -*-
"""
从 assets/MemoGrad.png 生成 Android 自适应图标全套资源。

问题背景：app.json 把整张方图塞进 adaptiveIcon.foregroundImage，
background 又是 #ffffff，导致手机上"大白底 + 中间一小块图"。

产出：
  assets/adaptive-icon-bg.png    1024²  对角渐变背景（铺满，不透明）
  assets/adaptive-icon.png       1024²  透明底白色发光前景（内容居中 ~58%，落在 66% 安全区内）
  assets/icon.png                1024²  不透明完整图标（legacy / iOS 用，替换原空白白图）
  android/app/src/main/res/mipmap-*/  各密度 ic_launcher / _round / _foreground .webp

用法：python scripts/make-android-icons.py [--preview-only]
"""
import sys
from PIL import Image, ImageChops, ImageDraw

SRC = 'assets/MemoGrad.png'
RES = 'android/app/src/main/res'

# mipmap 密度 → (launcher 边长 px, foreground 边长 px)，基于 48dp / 108dp
DENSITIES = {
    'mdpi': (48, 108),
    'hdpi': (72, 162),
    'xhdpi': (96, 216),
    'xxhdpi': (144, 324),
    'xxxhdpi': (192, 432),
}


def sample_corner(img, xy):
    """取圆角内一点的平均色，避免采到圆角外透明区。"""
    x, y = xy
    box = img.crop((x - 12, y - 12, x + 12, y + 12)).convert('RGB')
    pixels = list(box.getdata())
    n = len(pixels)
    return tuple(sum(p[i] for p in pixels) // n for i in range(3))


def make_gradient(tl, br, size=1024):
    """对角（左上→右下）双色渐变。小图逐像素算好再放大，快且平滑。"""
    small_size = 129
    img = Image.new('RGB', (small_size, small_size))
    px = img.load()
    denom = (small_size - 1) * 2
    for y in range(small_size):
        for x in range(small_size):
            t = (x + y) / denom
            px[x, y] = tuple(int(tl[i] + (br[i] - tl[i]) * t) for i in range(3))
    return img.resize((size, size), Image.BILINEAR)


def extract_white_glow(src):
    """抠出白色发光图形：亮度（min 通道）映射 alpha，颜色统一为白色。"""
    r, g, b, _ = src.split()
    mn = ImageChops.darker(r, ImageChops.darker(g, b))
    # >210 全不透明（描边核心），120~210 线性过渡（青色 glow 软边），<120 透明
    alpha = mn.point(lambda v: 255 if v > 210 else (0 if v < 120 else int((v - 120) * 255 / 90)))
    white = Image.new('RGBA', src.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white


def fit_content(img, canvas, ratio):
    """把图形等比缩放到画布 ratio 比例并居中。"""
    inner = int(canvas * ratio)
    content = img.resize((inner, inner), Image.LANCZOS)
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    off = (canvas - inner) // 2
    out.paste(content, (off, off), content)
    return out


def circle_mask(img):
    """圆形裁剪（round 图标用）。"""
    size = img.size[0]
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main(preview_only=False):
    src = Image.open(SRC).convert('RGBA')
    assert src.size == (2048, 2048), f'源图尺寸异常: {src.size}'

    # 渐变端点取圆角内的对角两点
    tl = sample_corner(src, (220, 220))
    br = sample_corner(src, (1828, 1828))
    print(f'渐变端点: 左上{tl} → 右下{br}')

    bg = make_gradient(tl, br)
    fg_raw = extract_white_glow(src)
    fg = fit_content(fg_raw, 1024, 0.58)

    # legacy 完整图标：渐变底 + 原图圆角方块贴上（同源渐变，边缘过渡自然）
    icon = bg.copy().convert('RGBA')
    full = fit_content(src, 1024, 1.0)
    icon.paste(full, (0, 0), full)

    if preview_only:
        # 合成一张桌面预览：圆形 mask 下 bg+fg 叠加，模拟手机上效果
        composed = Image.alpha_composite(bg.convert('RGBA'), fg)
        preview = Image.new('RGBA', (512, 256), (244, 240, 232, 255))
        preview.paste(circle_mask(composed).resize((224, 224), Image.LANCZOS), (16, 16),
                      circle_mask(composed).resize((224, 224), Image.LANCZOS))
        preview.paste(composed.resize((224, 224), Image.LANCZOS), (272, 16))
        preview.save('assets/_icon_preview.png')
        print('预览已存 assets/_icon_preview.png')
        return

    bg.save('assets/adaptive-icon-bg.png')
    fg.save('assets/adaptive-icon.png')
    icon.convert('RGB').save('assets/icon.png')

    for density, (launcher_px, fg_px) in DENSITIES.items():
        d = f'{RES}/mipmap-{density}'
        icon.resize((launcher_px, launcher_px), Image.LANCZOS) \
            .save(f'{d}/ic_launcher.webp', 'WEBP', quality=90)
        circle_mask(icon.resize((launcher_px, launcher_px), Image.LANCZOS)) \
            .save(f'{d}/ic_launcher_round.webp', 'WEBP', quality=90)
        fg.resize((fg_px, fg_px), Image.LANCZOS) \
            .save(f'{d}/ic_launcher_foreground.webp', 'WEBP', quality=90)
        print(f'mipmap-{density}: launcher {launcher_px}px, foreground {fg_px}px')

    print('全部资源生成完毕')


if __name__ == '__main__':
    main(preview_only='--preview-only' in sys.argv)
