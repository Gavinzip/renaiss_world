#!/usr/bin/env python3
"""
Renaiss Map Poster v6 (Single-Island Glass)
- Render only current region/island
- Bright light theme + subtle iridescent atmosphere
- Spacious layout with larger typography
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "output"

W, H = 3000, 1900

REGIONS = {
    "北境高原": {
        "color": (116, 176, 255),
        "poly": [(90, 44), (162, 42), (176, 64), (155, 82), (104, 82), (84, 66)],
        "locations": ["草原部落", "霜狼哨站", "雪白山莊", "玄冰裂谷"],
        "slots": [(112, 56), (138, 57), (122, 70), (148, 70)],
    },
    "中原核心": {
        "color": (119, 226, 168),
        "poly": [(146, 82), (270, 74), (286, 112), (272, 140), (168, 144), (142, 112)],
        "locations": ["河港鎮", "襄陽城", "龍脊山道", "洛陽城", "墨林古道", "大都", "皇城內廷", "青石關"],
        "slots": [(166, 92), (192, 91), (219, 90), (245, 89), (170, 112), (198, 111), (226, 110), (254, 109)],
    },
    "西域沙海": {
        "color": (250, 204, 129),
        "poly": [(78, 90), (146, 88), (156, 132), (112, 148), (72, 132)],
        "locations": ["敦煌", "喀什爾", "赤沙前哨", "砂輪遺站", "鳴沙廢城"],
        "slots": [(96, 102), (122, 103), (90, 120), (116, 121), (140, 122)],
    },
    "南疆水網": {
        "color": (175, 160, 255),
        "poly": [(170, 124), (266, 118), (286, 158), (236, 182), (182, 176), (160, 146)],
        "locations": ["廣州", "海潮碼頭", "鏡湖渡口", "大理", "雲棧茶嶺", "南疆苗疆", "霧雨古祭壇"],
        "slots": [(184, 136), (210, 135), (236, 134), (262, 133), (191, 156), (218, 155), (246, 154)],
    },
    "群島航線": {
        "color": (255, 162, 205),
        "poly": [(112, 154), (152, 152), (164, 178), (130, 194), (102, 182)],
        "locations": ["星潮港", "珊瑚環礁", "桃花島", "潮汐試煉島", "蓬萊觀測島"],
        "slots": [(114, 166), (136, 165), (121, 177), (143, 176), (129, 186)],
    },
    "隱秘深域": {
        "color": (255, 141, 141),
        "poly": [(214, 152), (254, 150), (272, 172), (250, 194), (216, 188), (202, 170)],
        "locations": ["光明頂", "無光礦坑", "黑木崖", "天機遺都", "死亡之海"],
        "slots": [(220, 162), (245, 161), (214, 178), (240, 178), (262, 177)],
    },
}

PORTAL_HUBS = {"襄陽城", "敦煌", "廣州", "草原部落", "星潮港", "光明頂"}

PA = {
    "bg": (249, 251, 255),
    "text": (25, 36, 57),
    "muted": (94, 109, 132),
    "panel_line": (198, 209, 232, 236),
    "city": (42, 70, 112),
    "portal": (240, 170, 64),
    "current": (212, 154, 34),
}

TEXT = {
    "zh-TW": {
        "title": "RENAISS 海域地圖 · 單島放大版",
        "islandCities": "本島城市列表",
        "legendTitle": "圖例與說明",
        "legendYou": "◉ 目前位置",
        "legendPortal": "◎ 主傳送門",
        "legendCity": "● 城市節點",
        "legendHint": "此版僅呈現當前島嶼，避免畫面擁擠。",
        "footerCurrent": "目前位置",
        "footerRegion": "所在區域",
        "footerPortal": "◎ 主傳送門",
        "footerCity": "● 城市",
        "footerYou": "◉ 你的位置",
        "portalSuffix": "  ◎主傳送門",
    },
    "zh-CN": {
        "title": "RENAISS 海域地图 · 单岛放大版",
        "islandCities": "本岛城市列表",
        "legendTitle": "图例与说明",
        "legendYou": "◉ 目前位置",
        "legendPortal": "◎ 主传送门",
        "legendCity": "● 城市节点",
        "legendHint": "此版仅呈现当前岛屿，避免画面拥挤。",
        "footerCurrent": "目前位置",
        "footerRegion": "所在区域",
        "footerPortal": "◎ 主传送门",
        "footerCity": "● 城市",
        "footerYou": "◉ 你的位置",
        "portalSuffix": "  ◎主传送门",
    },
    "en": {
        "title": "RENAISS Sea Map · Single-Island Focus",
        "islandCities": "Island City List",
        "legendTitle": "Legend",
        "legendYou": "◉ Current Position",
        "legendPortal": "◎ Portal Hub",
        "legendCity": "● City Node",
        "legendHint": "This view only shows the current island to reduce clutter.",
        "footerCurrent": "Current Location",
        "footerRegion": "Current Region",
        "footerPortal": "◎ Portal Hub",
        "footerCity": "● City",
        "footerYou": "◉ Your Position",
        "portalSuffix": "  ◎Portal Hub",
    },
}


def normalize_lang(lang="zh-TW"):
    code = str(lang or "zh-TW").strip()
    if code == "zh-CN":
        return "zh-CN"
    if code == "en":
        return "en"
    return "zh-TW"


def get_map_poster_text(lang="zh-TW"):
    return TEXT.get(normalize_lang(lang), TEXT["zh-TW"])


def load_font(size: int):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for fp in candidates:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_iridescent_background() -> Image.Image:
    base = Image.new("RGBA", (W, H), (252, 253, 255, 255))
    tint = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(tint)
    for y in range(H):
        alpha = int(10 * (1 - y / H))
        td.line((0, y, W, y), fill=(226, 232, 244, alpha), width=1)
    base.alpha_composite(tint)
    return base


def draw_glass_card(
    canvas: Image.Image,
    box: Tuple[int, int, int, int],
    radius: int = 26,
    fill_alpha: int = 182,
    top_gloss_alpha: int = 70,
):
    x1, y1, x2, y2 = box

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x1 + 8, y1 + 10, x2 + 8, y2 + 10), radius=radius, fill=(20, 30, 48, 40))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(shadow)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # Make non-map cards fully opaque to avoid odd transparency artifacts.
    effective_alpha = fill_alpha
    if fill_alpha >= 188:
        effective_alpha = 255
        top_gloss_alpha = 0

    od.rounded_rectangle((x1, y1, x2, y2), radius=radius, fill=(255, 255, 255, effective_alpha), outline=PA["panel_line"], width=2)
    if top_gloss_alpha > 0:
        od.rounded_rectangle((x1 + 2, y1 + 2, x2 - 2, y1 + 28), radius=radius, fill=(255, 255, 255, top_gloss_alpha))
    canvas.alpha_composite(overlay)


def locate_region(city: str):
    for rn, rv in REGIONS.items():
        if city in rv["locations"]:
            return rn
    return "南疆水網"


def fit_region_transform(poly: List[Tuple[int, int]], slots: List[Tuple[int, int]], map_box: Tuple[int, int, int, int]):
    all_pts = poly + slots
    minx = min(p[0] for p in all_pts)
    maxx = max(p[0] for p in all_pts)
    miny = min(p[1] for p in all_pts)
    maxy = max(p[1] for p in all_pts)

    rw = maxx - minx
    rh = maxy - miny

    x1, y1, x2, y2 = map_box
    pad_x = 170
    pad_y = 140
    pw = (x2 - x1) - pad_x * 2
    ph = (y2 - y1) - pad_y * 2
    scale = min(pw / max(rw, 1), ph / max(rh, 1))

    ox = x1 + ((x2 - x1) - rw * scale) / 2 - minx * scale
    oy = y1 + ((y2 - y1) - rh * scale) / 2 - miny * scale

    def tf(pt: Tuple[float, float]) -> Tuple[int, int]:
        return int(pt[0] * scale + ox), int(pt[1] * scale + oy)

    return tf


def draw_single_island(canvas: Image.Image, current_city: str, lang: str = "zh-TW"):
    draw = ImageDraw.Draw(canvas, "RGBA")
    tx = get_map_poster_text(lang)

    region_name = locate_region(current_city)
    region = REGIONS[region_name]
    color = region["color"]

    map_box = (80, 210, 2140, 1640)
    side_box = (2190, 210, 2920, 1260)
    note_box = (2190, 1290, 2920, 1640)

    draw_glass_card(canvas, map_box, radius=32, fill_alpha=106, top_gloss_alpha=60)
    draw_glass_card(canvas, side_box, radius=28, fill_alpha=255, top_gloss_alpha=0)
    draw_glass_card(canvas, note_box, radius=24, fill_alpha=255, top_gloss_alpha=0)

    # clean map-area gradient (no scattered transparent shapes)
    map_grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mgd = ImageDraw.Draw(map_grad)
    mx1, my1, mx2, my2 = map_box
    mh = max(1, my2 - my1)
    for yy in range(my1, my2 + 1):
        t = (yy - my1) / mh
        r = int(232 * (1 - t) + 245 * t)
        g = int(238 * (1 - t) + 232 * t)
        b = int(252 * (1 - t) + 248 * t)
        mgd.line((mx1, yy, mx2, yy), fill=(r, g, b, 86), width=1)
    map_mask = Image.new("L", (W, H), 0)
    mmd = ImageDraw.Draw(map_mask)
    mmd.rounded_rectangle(map_box, radius=32, fill=255)
    canvas.alpha_composite(Image.composite(map_grad, Image.new("RGBA", (W, H), (0, 0, 0, 0)), map_mask))

    tf = fit_region_transform(region["poly"], region["slots"], map_box)

    # island shadow + body
    island_shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(island_shadow)
    pts = [tf(p) for p in region["poly"]]
    sd.polygon([(x + 12, y + 16) for x, y in pts], fill=(28, 38, 56, 76))
    island_shadow = island_shadow.filter(ImageFilter.GaussianBlur(8))
    canvas.alpha_composite(island_shadow)

    island = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    idr = ImageDraw.Draw(island)

    poly_mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(poly_mask)
    md.polygon(pts, fill=255)

    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    x1 = min(x for x, _ in pts)
    x2 = max(x for x, _ in pts)
    y1 = min(y for _, y in pts)
    y2 = max(y for _, y in pts)
    h = max(1, y2 - y1)
    for y in range(y1, y2 + 1):
        t = (y - y1) / h
        r = int(color[0] * (0.86 + 0.16 * (1 - t)))
        g = int(color[1] * (0.86 + 0.16 * (1 - t)))
        b = int(color[2] * (0.90 + 0.10 * t))
        gd.line((x1, y, x2, y), fill=(min(r, 255), min(g, 255), min(b, 255), 238), width=1)

    island.alpha_composite(Image.composite(grad, Image.new("RGBA", (W, H), (0, 0, 0, 0)), poly_mask))
    idr.polygon(pts, outline=(255, 255, 255, 242), width=8)
    canvas.alpha_composite(island)

    # label fonts (larger)
    rt_font = load_font(102)
    node_font = load_font(50)
    idx_font = load_font(42)

    draw.text((map_box[0] + 70, map_box[1] + 36), region_name, font=rt_font, fill=(66, 78, 102, 230))

    for i, city in enumerate(region["locations"]):
        if i >= len(region["slots"]):
            continue

        sx, sy = tf(region["slots"][i])
        is_current = city == current_city
        is_portal = city in PORTAL_HUBS

        if is_portal:
            draw.ellipse((sx - 30, sy - 30, sx + 30, sy + 30), outline=PA["portal"] + (255,), width=4)

        if is_current:
            for rr, aa in [(54, 96), (44, 150), (34, 220)]:
                draw.ellipse((sx - rr, sy - rr, sx + rr, sy + rr), outline=(235, 183, 68, aa), width=5)

        dot_color = PA["current"] if is_current else PA["city"]
        draw.ellipse((sx - 16, sy - 16, sx + 16, sy + 16), fill=dot_color, outline=(36, 54, 80, 255), width=3)

        idx_txt = f"{i+1:02d}"
        bbox = draw.textbbox((0, 0), idx_txt, font=idx_font)
        tw = bbox[2] - bbox[0]
        draw.text((sx - tw // 2, sy - 64), idx_txt, font=idx_font, fill=(24, 36, 56, 235))

        bx = sx + 30
        by = sy - 36
        tb = draw.textbbox((0, 0), city, font=node_font)
        bw = (tb[2] - tb[0]) + 46
        bh = 72
        draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=15, fill=(255, 255, 255, 212), outline=(193, 206, 230, 240), width=2)
        draw.text((bx + 21, by + 10), city, font=node_font, fill=PA["text"])

    # right panel
    draw.text((2232, 244), tx["islandCities"], font=load_font(60), fill=PA["text"])
    draw.text((2232, 320), region_name, font=load_font(48), fill=color)

    y = 402
    for i, city in enumerate(region["locations"], start=1):
        is_current = city == current_city
        c = PA["current"] if is_current else PA["text"]
        mark = "◉" if is_current else "•"
        suffix = tx["portalSuffix"] if city in PORTAL_HUBS else ""
        draw.text((2236, y), f"{mark} {i:02d}  {city}{suffix}", font=load_font(44), fill=c)
        y += 68

    draw.text((2232, 1330), tx["legendTitle"], font=load_font(50), fill=PA["text"])
    draw.text((2232, 1406), tx["legendYou"], font=load_font(42), fill=PA["current"])
    draw.text((2232, 1464), tx["legendPortal"], font=load_font(42), fill=PA["portal"])
    draw.text((2232, 1522), tx["legendCity"], font=load_font(42), fill=PA["city"])
    draw.text((2232, 1588), tx["legendHint"], font=load_font(34), fill=PA["muted"])

    return region_name


def draw_header_footer(canvas: Image.Image, current_city: str, region_name: str, lang: str = "zh-TW"):
    draw = ImageDraw.Draw(canvas, "RGBA")
    tx = get_map_poster_text(lang)

    draw_glass_card(canvas, (60, 34, 2940, 170), radius=26, fill_alpha=255, top_gloss_alpha=0)
    draw.text((108, 60), tx["title"], font=load_font(88), fill=PA["text"])

    draw_glass_card(canvas, (60, 1690, 2940, 1848), radius=24, fill_alpha=255, top_gloss_alpha=0)
    draw.text((112, 1728), tx["footerCurrent"], font=load_font(46), fill=PA["muted"])
    draw.text((330, 1725), current_city, font=load_font(50), fill=PA["current"])
    draw.text((620, 1728), tx["footerRegion"], font=load_font(46), fill=PA["muted"])
    draw.text((824, 1725), region_name, font=load_font(50), fill=REGIONS[region_name]["color"])

    draw.rounded_rectangle((1720, 1712, 2910, 1828), radius=18, fill=(255, 255, 255, 255), outline=(196, 208, 230, 230), width=2)
    draw.text((1756, 1740), tx["footerPortal"], font=load_font(40), fill=PA["portal"])
    draw.text((2072, 1740), tx["footerCity"], font=load_font(40), fill=PA["city"])
    draw.text((2254, 1740), tx["footerYou"], font=load_font(40), fill=PA["current"])


def render(current_city: str, output: Path, lang: str = "zh-TW"):
    all_cities = {c for r in REGIONS.values() for c in r["locations"]}
    if current_city not in all_cities:
        current_city = "廣州"

    canvas = draw_iridescent_background()
    region_name = draw_single_island(canvas, current_city, lang)
    draw_header_footer(canvas, current_city, region_name, lang)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", default="廣州")
    parser.add_argument("--lang", default="zh-TW")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    out = Path(args.output).resolve() if args.output else (OUT_DIR / f"glass_v6_island_{args.current}.png").resolve()
    print(str(render(args.current, out, args.lang)))


if __name__ == "__main__":
    main()
