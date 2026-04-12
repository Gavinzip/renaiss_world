#!/usr/bin/env python3
"""
Renaiss 高解析海報地圖原型（非像素風）
- 目標：漂亮、可讀、適合 Discord 手機/桌面
- 輸出：PNG
"""

from __future__ import annotations

import argparse
import math
import os
from pathlib import Path
from typing import Dict, Tuple, List

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "output"

W, H = 2400, 1500
MAP_LEFT, MAP_TOP, MAP_RIGHT, MAP_BOTTOM = 70, 120, 2330, 1320

# 使用舊座標系（約 0~384, 0~216）映射到高解析畫布
SRC_W, SRC_H = 384, 216
SCALE = 6.0
OX, OY = 260, 210

PALETTE = {
    "deep_ocean": (6, 20, 44),
    "mid_ocean": (16, 46, 84),
    "shallow_ocean": (37, 87, 137),
    "foam": (205, 230, 255),
    "frame": (152, 192, 235),
    "text": (241, 247, 255),
    "muted": (164, 187, 214),
    "panel_bg": (9, 24, 46, 210),
    "panel_line": (130, 177, 227, 210),
    "portal": (255, 183, 92),
    "city": (226, 235, 248),
    "current": (255, 246, 144),
}

REGIONS = {
    "北境主島": {
        "color": (108, 185, 255),
        "points": [(90, 44), (162, 42), (176, 64), (155, 82), (104, 82), (84, 66)],
    },
    "中原樞紐": {
        "color": (122, 232, 175),
        "points": [(146, 82), (270, 74), (286, 112), (272, 140), (168, 144), (142, 112)],
    },
    "西域沙海": {
        "color": (253, 197, 118),
        "points": [(78, 90), (146, 88), (156, 132), (112, 148), (72, 132)],
    },
    "南疆水網": {
        "color": (162, 146, 255),
        "points": [(170, 124), (266, 118), (286, 158), (236, 182), (182, 176), (160, 146)],
    },
    "桃花群島": {
        "color": (255, 142, 190),
        "points": [(112, 154), (152, 152), (164, 178), (130, 194), (102, 182)],
    },
    "俠客群島": {
        "color": (255, 122, 122),
        "points": [(214, 152), (254, 150), (272, 172), (250, 194), (216, 188), (202, 170)],
    },
}

LOCATIONS: Dict[str, Tuple[int, int, str]] = {
    "雪白山莊": (116, 58, "北境主島"),
    "草原部落": (146, 63, "北境主島"),
    "襄陽城": (170, 103, "中原樞紐"),
    "洛陽城": (198, 98, "中原樞紐"),
    "大都": (228, 90, "中原樞紐"),
    "黑木崖": (258, 88, "中原樞紐"),
    "敦煌": (130, 108, "西域沙海"),
    "喀什爾": (103, 120, "西域沙海"),
    "廣州": (188, 136, "南疆水網"),
    "大理": (215, 140, "南疆水網"),
    "南疆苗疆": (245, 127, "南疆水網"),
    "桃花島": (136, 164, "桃花群島"),
    "俠客島": (236, 166, "俠客群島"),
}

PORTALS = {"襄陽城", "敦煌", "廣州", "草原部落", "俠客島", "黑木崖"}

LABEL_OFFSET = {
    "雪白山莊": (18, -38),
    "草原部落": (20, -12),
    "襄陽城": (22, 18),
    "洛陽城": (20, -28),
    "大都": (22, 12),
    "黑木崖": (22, -24),
    "敦煌": (-110, -16),
    "喀什爾": (-120, 10),
    "廣州": (20, 20),
    "大理": (20, -24),
    "南疆苗疆": (20, 12),
    "桃花島": (-105, 6),
    "俠客島": (24, 8),
}


def txy(x: int, y: int) -> Tuple[int, int]:
    return int(x * SCALE + OX), int(y * SCALE + OY)


def load_font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for fp in candidates:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_ocean_background() -> Image.Image:
    img = Image.new("RGB", (W, H), PALETTE["deep_ocean"])
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(PALETTE["deep_ocean"][0] * (1 - t) + PALETTE["mid_ocean"][0] * t)
        g = int(PALETTE["deep_ocean"][1] * (1 - t) + PALETTE["mid_ocean"][1] * t)
        b = int(PALETTE["deep_ocean"][2] * (1 - t) + PALETTE["mid_ocean"][2] * t)
        for x in range(W):
            px[x, y] = (r, g, b)

    # 光暈
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((140, 90, 2260, 1380), fill=(120, 182, 255, 44))
    gd.ellipse((420, 220, 2040, 1240), fill=(160, 214, 255, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    return Image.alpha_composite(img.convert("RGBA"), glow)


def draw_frame(draw: ImageDraw.ImageDraw):
    draw.rounded_rectangle((MAP_LEFT, MAP_TOP, MAP_RIGHT, MAP_BOTTOM), radius=28, outline=PALETTE["frame"], width=4)
    draw.rounded_rectangle((MAP_LEFT + 18, MAP_TOP + 18, MAP_RIGHT - 18, MAP_BOTTOM - 18), radius=22, outline=(85, 132, 186), width=2)


def draw_regions(base: Image.Image):
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    color_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(color_layer)

    for _, meta in REGIONS.items():
        pts = [txy(x, y) for x, y in meta["points"]]
        shadow_pts = [(x + 16, y + 18) for x, y in pts]
        sd.polygon(shadow_pts, fill=(3, 10, 20, 160))

    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    base.alpha_composite(shadow)

    for _, meta in REGIONS.items():
        pts = [txy(x, y) for x, y in meta["points"]]
        c = meta["color"]
        cd.polygon(pts, fill=(c[0], c[1], c[2], 235))
        cd.line(pts + [pts[0]], fill=(245, 236, 214, 250), width=6, joint="curve")

    # 內層高光
    gloss = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gl = ImageDraw.Draw(gloss)
    for _, meta in REGIONS.items():
        pts = [txy(x, y) for x, y in meta["points"]]
        gl.polygon([(x, y - 6) for x, y in pts], fill=(255, 255, 255, 25))
    gloss = gloss.filter(ImageFilter.GaussianBlur(6))

    base.alpha_composite(color_layer)
    base.alpha_composite(gloss)


def draw_ports_and_cities(draw: ImageDraw.ImageDraw, current: str):
    font_city = load_font(34)
    font_region = load_font(42)

    # 區域標題
    region_anchor = {
        "北境主島": (540, 360),
        "中原樞紐": (950, 520),
        "西域沙海": (430, 610),
        "南疆水網": (980, 870),
        "桃花群島": (520, 1010),
        "俠客群島": (1160, 1010),
    }
    for rn, (ax, ay) in region_anchor.items():
        rc = REGIONS[rn]["color"]
        draw.text((ax + 2, ay + 2), rn, font=font_region, fill=(10, 20, 35, 180))
        draw.text((ax, ay), rn, font=font_region, fill=rc)

    for name, (x, y, region) in LOCATIONS.items():
        sx, sy = txy(x, y)
        is_current = name == current
        is_portal = name in PORTALS

        if is_portal:
            draw.ellipse((sx - 20, sy - 20, sx + 20, sy + 20), outline=PALETTE["portal"], width=5)
            draw.ellipse((sx - 12, sy - 12, sx + 12, sy + 12), outline=(255, 210, 140), width=3)

        if is_current:
            # pulse ring
            for r, a in [(46, 90), (34, 130), (22, 210)]:
                draw.ellipse((sx - r, sy - r, sx + r, sy + r), outline=(255, 245, 150, a), width=4)

        city_color = PALETTE["current"] if is_current else PALETTE["city"]
        draw.ellipse((sx - 7, sy - 7, sx + 7, sy + 7), fill=city_color)
        draw.ellipse((sx - 7, sy - 7, sx + 7, sy + 7), outline=(18, 36, 58), width=2)

        ox, oy = LABEL_OFFSET.get(name, (18, -20))
        tx, ty = sx + ox, sy + oy
        draw.line((sx, sy, tx - 8, ty + 16), fill=(175, 203, 233), width=2)

        # label badge
        badge_w = 170
        badge_h = 44
        draw.rounded_rectangle((tx, ty, tx + badge_w, ty + badge_h), radius=12, fill=(8, 20, 40, 205), outline=(124, 169, 221), width=2)
        draw.text((tx + 14, ty + 8), name, font=font_city, fill=PALETTE["text"])


def draw_title_and_panels(draw: ImageDraw.ImageDraw, current: str):
    title_font = load_font(58)
    sub_font = load_font(30)
    info_font = load_font(38)

    # title
    draw.rounded_rectangle((70, 32, 2330, 102), radius=18, fill=(7, 18, 38, 185), outline=(118, 166, 220), width=2)
    draw.text((154, 47), "RENAISS 群島海域總覽", font=title_font, fill=PALETTE["text"])

    region = LOCATIONS.get(current, LOCATIONS["廣州"])[2]
    rcolor = REGIONS[region]["color"]

    # status panel
    draw.rounded_rectangle((70, 1350, 2330, 1455), radius=20, fill=PALETTE["panel_bg"], outline=PALETTE["panel_line"], width=2)
    draw.text((120, 1388), "目前位置", font=sub_font, fill=PALETTE["muted"])
    draw.text((292, 1382), current, font=info_font, fill=rcolor)
    draw.text((548, 1388), "區域", font=sub_font, fill=PALETTE["muted"])
    draw.text((626, 1382), region, font=info_font, fill=rcolor)

    # legend bottom-right
    draw.rounded_rectangle((1490, 1362, 2310, 1443), radius=14, fill=(8, 22, 44, 190), outline=(115, 163, 217), width=2)
    draw.text((1516, 1386), "圖例", font=load_font(30), fill=PALETTE["text"])

    legend_y = 1382
    draw.text((1590, legend_y), "◎", font=load_font(40), fill=PALETTE["portal"])
    draw.text((1640, legend_y + 4), "主傳送門", font=load_font(28), fill=PALETTE["text"])
    draw.text((1848, legend_y), "●", font=load_font(40), fill=PALETTE["city"])
    draw.text((1896, legend_y + 4), "城市", font=load_font(28), fill=PALETTE["text"])
    draw.text((2048, legend_y), "◉", font=load_font(40), fill=PALETTE["current"])
    draw.text((2096, legend_y + 4), "目前位置", font=load_font(28), fill=PALETTE["text"])


def render(current: str, output: Path):
    if current not in LOCATIONS:
        current = "廣州"

    canvas = make_ocean_background()
    draw = ImageDraw.Draw(canvas, "RGBA")

    draw_frame(draw)
    draw_regions(canvas)
    draw_ports_and_cities(ImageDraw.Draw(canvas, "RGBA"), current)
    draw_title_and_panels(ImageDraw.Draw(canvas, "RGBA"), current)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", default="廣州")
    parser.add_argument("--output", default=str(OUT_DIR / "poster_v2_guangzhou.png"))
    args = parser.parse_args()

    out = Path(args.output).resolve()
    result = render(args.current, out)
    print(str(result))


if __name__ == "__main__":
    main()
