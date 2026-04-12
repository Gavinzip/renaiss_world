#!/usr/bin/env python3
"""
Renaiss Map Poster v5 (Glass Light Theme)
- Mode A: full city index (all islands/regions)
- Mode B: single-region focus (labels on current region)
"""

from __future__ import annotations

import argparse
import colorsys
import math
import os
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "output"

W, H = 2600, 1600

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
    "bg": (248, 250, 255),
    "text": (22, 33, 52),
    "muted": (95, 110, 132),
    "line": (146, 162, 190),
    "panel": (255, 255, 255, 170),
    "panel_line": (198, 208, 228, 230),
    "city": (44, 69, 106),
    "portal": (240, 169, 64),
    "current": (214, 159, 37),
}


def load_font(size: int):
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
                pass
    return ImageFont.load_default()


def draw_iridescent_background() -> Image.Image:
    base = Image.new("RGBA", (W, H), PA["bg"] + (255,))

    # subtle top-bottom tint
    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        a = int(24 * (1 - y / H))
        gd.line((0, y, W, y), fill=(210, 220, 245, a), width=1)
    base.alpha_composite(grad)

    # rainbow glass blobs
    blobs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blobs)
    centers = [(420, 260), (1020, 420), (1500, 300), (720, 1020), (1320, 1110), (1980, 820)]
    for i, (cx, cy) in enumerate(centers):
        for ring in range(6):
            hue = (i * 0.14 + ring * 0.08) % 1.0
            r, g, b = colorsys.hsv_to_rgb(hue, 0.32, 1.0)
            color = (int(r * 255), int(g * 255), int(b * 255), 32 - ring * 4)
            rr = 220 + ring * 60
            bd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=color)
    blobs = blobs.filter(ImageFilter.GaussianBlur(52))
    base.alpha_composite(blobs)

    return base


def draw_glass_card(canvas: Image.Image, box: Tuple[int, int, int, int], radius: int = 24):
    x1, y1, x2, y2 = box
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x1 + 6, y1 + 8, x2 + 6, y2 + 8), radius=radius, fill=(0, 0, 0, 35))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    canvas.alpha_composite(shadow)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle((x1, y1, x2, y2), radius=radius, fill=PA["panel"], outline=PA["panel_line"], width=2)
    od.rounded_rectangle((x1 + 2, y1 + 2, x2 - 2, y1 + 20), radius=radius, fill=(255, 255, 255, 58))
    canvas.alpha_composite(overlay)


def fit_transform(map_box: Tuple[int, int, int, int]):
    all_pts = []
    for r in REGIONS.values():
        all_pts.extend(r["poly"])
    minx = min(p[0] for p in all_pts)
    maxx = max(p[0] for p in all_pts)
    miny = min(p[1] for p in all_pts)
    maxy = max(p[1] for p in all_pts)
    rw = maxx - minx
    rh = maxy - miny

    x1, y1, x2, y2 = map_box
    pw = (x2 - x1) - 180
    ph = (y2 - y1) - 160
    scale = min(pw / rw, ph / rh)

    ox = x1 + ((x2 - x1) - rw * scale) / 2 - minx * scale
    oy = y1 + ((y2 - y1) - rh * scale) / 2 - miny * scale

    def tf(pt: Tuple[float, float]) -> Tuple[int, int]:
        return int(pt[0] * scale + ox), int(pt[1] * scale + oy)

    return tf


def build_city_index():
    city_idx = {}
    rows = []
    idx = 1
    for rn, r in REGIONS.items():
        for c in r["locations"]:
            city_idx[c] = idx
            rows.append((idx, c, rn))
            idx += 1
    return city_idx, rows


def draw_regions_and_markers(canvas: Image.Image, map_box: Tuple[int, int, int, int], current_city: str, mode: str):
    draw = ImageDraw.Draw(canvas, "RGBA")
    tf = fit_transform(map_box)

    # regions with soft shadow
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    rg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rg)

    for rn, r in REGIONS.items():
        pts = [tf(p) for p in r["poly"]]
        sd.polygon([(x + 8, y + 10) for x, y in pts], fill=(30, 38, 58, 58))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    canvas.alpha_composite(sh)

    for rn, r in REGIONS.items():
        c = r["color"]
        pts = [tf(p) for p in r["poly"]]
        rd.polygon(pts, fill=(c[0], c[1], c[2], 212))
        rd.line(pts + [pts[0]], fill=(250, 250, 252, 250), width=5)
    canvas.alpha_composite(rg)

    region_font = load_font(44)
    city_num_font = load_font(22)
    city_label_font = load_font(28)

    city_idx, _ = build_city_index()

    # region labels
    for rn, r in REGIONS.items():
        cx = sum(p[0] for p in r["poly"]) / len(r["poly"])
        cy = sum(p[1] for p in r["poly"]) / len(r["poly"])
        tx, ty = tf((cx, cy - 26))
        rc = r["color"]
        draw.text((tx + 2, ty + 2), rn, font=region_font, fill=(255, 255, 255, 90))
        draw.text((tx, ty), rn, font=region_font, fill=(max(0, rc[0] - 18), max(0, rc[1] - 18), max(0, rc[2] - 18), 240))

    for rn, r in REGIONS.items():
        for i, city in enumerate(r["locations"]):
            if i >= len(r["slots"]):
                continue
            sx, sy = tf(r["slots"][i])
            is_current = city == current_city
            is_portal = city in PORTAL_HUBS
            idx = city_idx[city]

            # mode behavior
            if mode == "region" and city not in REGIONS[next(k for k,v in REGIONS.items() if current_city in v['locations'])]["locations"]:
                alpha = 120
            else:
                alpha = 255

            if is_portal:
                draw.ellipse((sx - 18, sy - 18, sx + 18, sy + 18), outline=PA["portal"] + (alpha,), width=4)
            if is_current:
                for rr, aa in [(36, 110), (28, 150), (22, 220)]:
                    draw.ellipse((sx - rr, sy - rr, sx + rr, sy + rr), outline=(235, 185, 72, aa), width=4)

            fill = PA["current"] if is_current else PA["city"]
            draw.ellipse((sx - 10, sy - 10, sx + 10, sy + 10), fill=fill + (alpha,), outline=(36, 54, 82, alpha), width=2)

            label = f"{idx:02d}"
            tw = draw.textbbox((0, 0), label, font=city_num_font)[2]
            draw.text((sx - tw // 2, sy - 12), label, font=city_num_font, fill=(34, 49, 78, alpha))

            if mode == "region" and city in REGIONS[next(k for k,v in REGIONS.items() if current_city in v['locations'])]["locations"]:
                # show city names only for current region
                bx, by = sx + 18, sy - 18
                text = city
                tb = draw.textbbox((0,0), text, font=city_label_font)
                bw = (tb[2]-tb[0]) + 28
                bh = 38
                draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=10, fill=(255,255,255,184), outline=(190,200,220,240), width=2)
                draw.text((bx + 14, by + 5), text, font=city_label_font, fill=PA["text"])


def draw_header_and_footer(canvas: Image.Image, current_city: str, mode: str):
    draw = ImageDraw.Draw(canvas, "RGBA")
    title_font = load_font(58)
    body_font = load_font(32)

    draw_glass_card(canvas, (60, 26, 2540, 98), radius=18)
    subtitle = "全城市索引" if mode == "full" else "單島細節（當前區域）"
    draw.text((106, 38), f"RENAISS 海域地圖 · {subtitle}", font=title_font, fill=PA["text"])

    current_region = next((rn for rn, rv in REGIONS.items() if current_city in rv["locations"]), "未知")
    region_color = REGIONS.get(current_region, {}).get("color", (120, 140, 180))

    draw_glass_card(canvas, (60, 1512, 2540, 1572), radius=16)
    draw.text((98, 1528), "目前位置", font=body_font, fill=PA["muted"])
    draw.text((260, 1526), current_city, font=body_font, fill=region_color)
    draw.text((500, 1528), "區域", font=body_font, fill=PA["muted"])
    draw.text((576, 1526), current_region, font=body_font, fill=region_color)

    # legend bottom-right
    draw_glass_card(canvas, (1620, 1520, 2520, 1570), radius=14)
    draw.text((1650, 1530), "◎ 主傳送門", font=load_font(28), fill=PA["portal"])
    draw.text((1870, 1530), "● 城市", font=load_font(28), fill=PA["city"])
    draw.text((2010, 1530), "◉ 目前位置", font=load_font(28), fill=PA["current"])


def draw_side_panel(canvas: Image.Image, current_city: str, mode: str):
    draw = ImageDraw.Draw(canvas, "RGBA")

    if mode == "full":
        panel_box = (1800, 140, 2520, 1490)
        draw_glass_card(canvas, panel_box, radius=20)
        draw.text((1836, 176), "全城市清單（編號對照）", font=load_font(40), fill=PA["text"])

        _, entries = build_city_index()
        y = 236
        for rn, r in REGIONS.items():
            draw.rounded_rectangle((1830, y, 2490, y + 34), radius=10, fill=(255, 255, 255, 170), outline=(195,205,225,220), width=1)
            draw.text((1842, y + 2), rn, font=load_font(30), fill=r["color"])
            y += 40
            for idx, city, rr in entries:
                if rr != rn:
                    continue
                c = PA["current"] if city == current_city else PA["text"]
                mark = "◉" if city == current_city else "•"
                draw.text((1842, y), f"{mark} {idx:02d}  {city}", font=load_font(26), fill=c)
                y += 29
            y += 8

    else:
        panel_box = (1800, 200, 2520, 940)
        draw_glass_card(canvas, panel_box, radius=20)
        current_region = next((rn for rn, rv in REGIONS.items() if current_city in rv["locations"]), "未知")
        rc = REGIONS.get(current_region, {}).get("color", (120, 140, 180))
        draw.text((1836, 236), "當前區域城市", font=load_font(40), fill=PA["text"])
        draw.text((1836, 286), current_region, font=load_font(34), fill=rc)

        city_idx, _ = build_city_index()
        y = 348
        for c in REGIONS.get(current_region, {}).get("locations", []):
            is_current = c == current_city
            color = PA["current"] if is_current else PA["text"]
            mark = "◉" if is_current else "•"
            draw.text((1842, y), f"{mark} {city_idx.get(c,0):02d}  {c}", font=load_font(30), fill=color)
            y += 42

        draw_glass_card(canvas, (1800, 980, 2520, 1280), radius=18)
        draw.text((1836, 1016), "說明", font=load_font(34), fill=PA["text"])
        draw.text((1836, 1062), "這版只放大顯示你所在島嶼的城市名。", font=load_font(26), fill=PA["muted"])
        draw.text((1836, 1100), "其他島只保留節點，不會擁擠。", font=load_font(26), fill=PA["muted"])


def render(current_city: str, mode: str, output: Path):
    if current_city not in {c for r in REGIONS.values() for c in r["locations"]}:
        current_city = "廣州"
    mode = "region" if mode == "region" else "full"

    canvas = draw_iridescent_background()

    # map area (bigger in region mode)
    if mode == "full":
        map_box = (60, 120, 1760, 1500)
    else:
        map_box = (60, 120, 2520, 1500)

    draw_glass_card(canvas, map_box, radius=26)
    draw_regions_and_markers(canvas, map_box, current_city, mode)
    draw_side_panel(canvas, current_city, mode)
    draw_header_and_footer(canvas, current_city, mode)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", default="廣州")
    parser.add_argument("--mode", default="full", choices=["full", "region"])
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    if args.output:
        out = Path(args.output).resolve()
    else:
        out = (OUT_DIR / f"glass_v5_{args.mode}_{args.current}.png").resolve()

    result = render(args.current, args.mode, out)
    print(str(result))


if __name__ == "__main__":
    main()
