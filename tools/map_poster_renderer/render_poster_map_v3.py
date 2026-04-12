#!/usr/bin/env python3
"""
Renaiss 高解析海圖 v3
- 地圖上顯示所有城市編號點位
- 右側完整顯示各島/各區城市清單（含對應編號）
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "output"

W, H = 2600, 1600
MAP_LEFT, MAP_TOP, MAP_RIGHT, MAP_BOTTOM = 90, 90, 1680, 1510
PANEL_LEFT, PANEL_TOP, PANEL_RIGHT, PANEL_BOTTOM = 1730, 90, 2520, 1510

SRC_SCALE = 5.2
OX, OY = 170, 230

PALETTE = {
    "deep": (7, 20, 43),
    "mid": (16, 47, 84),
    "text": (240, 247, 255),
    "muted": (164, 188, 216),
    "frame": (144, 188, 235),
    "line": (119, 166, 217),
    "city": (229, 238, 249),
    "portal": (255, 184, 88),
    "current": (255, 245, 135),
    "badge_bg": (8, 23, 43, 214),
}

REGIONS = {
    "北境高原": {
        "id": "northern_highland",
        "color": (108, 185, 255),
        "poly": [(90, 44), (162, 42), (176, 64), (155, 82), (104, 82), (84, 66)],
        "locations": ["草原部落", "霜狼哨站", "雪白山莊", "玄冰裂谷"],
        "slots": [(112, 56), (138, 57), (122, 70), (148, 70)],
    },
    "中原核心": {
        "id": "central_core",
        "color": (122, 232, 175),
        "poly": [(146, 82), (270, 74), (286, 112), (272, 140), (168, 144), (142, 112)],
        "locations": ["河港鎮", "襄陽城", "龍脊山道", "洛陽城", "墨林古道", "大都", "皇城內廷", "青石關"],
        "slots": [(166, 92), (192, 91), (219, 90), (245, 89), (170, 112), (198, 111), (226, 110), (254, 109)],
    },
    "西域沙海": {
        "id": "west_desert",
        "color": (252, 198, 119),
        "poly": [(78, 90), (146, 88), (156, 132), (112, 148), (72, 132)],
        "locations": ["敦煌", "喀什爾", "赤沙前哨", "砂輪遺站", "鳴沙廢城"],
        "slots": [(96, 102), (122, 103), (90, 120), (116, 121), (140, 122)],
    },
    "南疆水網": {
        "id": "southern_delta",
        "color": (162, 146, 255),
        "poly": [(170, 124), (266, 118), (286, 158), (236, 182), (182, 176), (160, 146)],
        "locations": ["廣州", "海潮碼頭", "鏡湖渡口", "大理", "雲棧茶嶺", "南疆苗疆", "霧雨古祭壇"],
        "slots": [(184, 136), (210, 135), (236, 134), (262, 133), (191, 156), (218, 155), (246, 154)],
    },
    "群島航線": {
        "id": "island_routes",
        "color": (255, 142, 191),
        "poly": [(112, 154), (152, 152), (164, 178), (130, 194), (102, 182)],
        "locations": ["星潮港", "珊瑚環礁", "桃花島", "潮汐試煉島", "蓬萊觀測島"],
        "slots": [(114, 166), (136, 165), (121, 177), (143, 176), (129, 186)],
    },
    "隱秘深域": {
        "id": "hidden_deeps",
        "color": (255, 124, 124),
        "poly": [(214, 152), (254, 150), (272, 172), (250, 194), (216, 188), (202, 170)],
        "locations": ["光明頂", "無光礦坑", "黑木崖", "天機遺都", "死亡之海"],
        "slots": [(220, 162), (245, 161), (214, 178), (240, 178), (262, 177)],
    },
}

PORTAL_HUBS = {"襄陽城", "敦煌", "廣州", "草原部落", "星潮港", "光明頂"}


def txy(x: int, y: int) -> Tuple[int, int]:
    return int(x * SRC_SCALE + OX), int(y * SRC_SCALE + OY)


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


def ocean_bg() -> Image.Image:
    base = Image.new("RGB", (W, H), PALETTE["deep"])
    px = base.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(PALETTE["deep"][0] * (1 - t) + PALETTE["mid"][0] * t)
        g = int(PALETTE["deep"][1] * (1 - t) + PALETTE["mid"][1] * t)
        b = int(PALETTE["deep"][2] * (1 - t) + PALETTE["mid"][2] * t)
        for x in range(W):
            px[x, y] = (r, g, b)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((120, 120, 1640, 1480), fill=(112, 176, 248, 40))
    gd.ellipse((300, 240, 1500, 1360), fill=(170, 214, 255, 20))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    return Image.alpha_composite(base.convert("RGBA"), glow)


def draw_layout_boxes(draw: ImageDraw.ImageDraw):
    draw.rounded_rectangle((MAP_LEFT, MAP_TOP, MAP_RIGHT, MAP_BOTTOM), radius=24, outline=PALETTE["frame"], width=3)
    draw.rounded_rectangle((MAP_LEFT + 16, MAP_TOP + 16, MAP_RIGHT - 16, MAP_BOTTOM - 16), radius=20, outline=(87, 132, 186), width=2)
    draw.rounded_rectangle((PANEL_LEFT, PANEL_TOP, PANEL_RIGHT, PANEL_BOTTOM), radius=24, outline=PALETTE["frame"], width=3)


def draw_regions(base: Image.Image):
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    rg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rg)

    for r in REGIONS.values():
        pts = [txy(x, y) for x, y in r["poly"]]
        spts = [(x + 14, y + 16) for x, y in pts]
        sd.polygon(spts, fill=(3, 10, 20, 150))

    sh = sh.filter(ImageFilter.GaussianBlur(14))
    base.alpha_composite(sh)

    for name, r in REGIONS.items():
        pts = [txy(x, y) for x, y in r["poly"]]
        c = r["color"]
        rd.polygon(pts, fill=(c[0], c[1], c[2], 235))
        rd.line(pts + [pts[0]], fill=(246, 237, 215, 255), width=6)

    base.alpha_composite(rg)

    draw = ImageDraw.Draw(base, "RGBA")
    rf = load_font(44)
    anchors = {
        "北境高原": (560, 420),
        "中原核心": (980, 560),
        "西域沙海": (420, 660),
        "南疆水網": (970, 940),
        "群島航線": (470, 1130),
        "隱秘深域": (1100, 1140),
    }
    for n, (ax, ay) in anchors.items():
        c = REGIONS[n]["color"]
        draw.text((ax + 2, ay + 2), n, font=rf, fill=(8, 18, 32, 180))
        draw.text((ax, ay), n, font=rf, fill=c)


def build_city_index() -> Tuple[Dict[str, int], List[Tuple[int, str, str]]]:
    city_to_idx: Dict[str, int] = {}
    entries: List[Tuple[int, str, str]] = []
    idx = 1
    for region_name, region in REGIONS.items():
        for city in region["locations"]:
            city_to_idx[city] = idx
            entries.append((idx, city, region_name))
            idx += 1
    return city_to_idx, entries


def draw_city_markers(draw: ImageDraw.ImageDraw, current_city: str, city_to_idx: Dict[str, int]):
    num_font = load_font(20)
    badge_font = load_font(22)

    for region_name, region in REGIONS.items():
        slots = region["slots"]
        for i, city in enumerate(region["locations"]):
            if i >= len(slots):
                continue
            sx, sy = txy(*slots[i])
            idx = city_to_idx[city]
            is_current = city == current_city
            is_portal = city in PORTAL_HUBS

            if is_portal:
                draw.ellipse((sx - 18, sy - 18, sx + 18, sy + 18), outline=PALETTE["portal"], width=4)
            if is_current:
                for r, a in [(34, 110), (26, 150), (20, 220)]:
                    draw.ellipse((sx - r, sy - r, sx + r, sy + r), outline=(255, 245, 140, a), width=4)

            fill = PALETTE["current"] if is_current else PALETTE["city"]
            draw.ellipse((sx - 11, sy - 11, sx + 11, sy + 11), fill=fill, outline=(20, 38, 62), width=2)

            label = f"{idx:02d}"
            tw = draw.textbbox((0, 0), label, font=num_font)[2]
            draw.text((sx - tw // 2, sy - 12), label, font=num_font, fill=(8, 20, 40))

            # current city floating name
            if is_current:
                bw, bh = 220, 44
                bx, by = sx + 20, sy - 22
                draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=10, fill=PALETTE["badge_bg"], outline=(138, 186, 238), width=2)
                draw.text((bx + 14, by + 8), f"{label} {city}", font=badge_font, fill=PALETTE["current"])


def draw_title(draw: ImageDraw.ImageDraw, current_city: str):
    tf = load_font(58)
    sf = load_font(30)
    region = "未知"
    for rn, rv in REGIONS.items():
        if current_city in rv["locations"]:
            region = rn
            rcolor = rv["color"]
            break
    else:
        rcolor = PALETTE["current"]

    draw.rounded_rectangle((MAP_LEFT, 24, MAP_RIGHT, 78), radius=16, fill=(7, 18, 38, 180), outline=(118, 165, 220), width=2)
    draw.text((130, 30), "RENAISS 海域全城市地圖", font=tf, fill=PALETTE["text"])

    draw.rounded_rectangle((MAP_LEFT, H - 84, MAP_RIGHT, H - 24), radius=16, fill=(8, 23, 43, 200), outline=(118, 165, 220), width=2)
    draw.text((130, H - 72), "目前位置", font=sf, fill=PALETTE["muted"])
    draw.text((290, H - 72), current_city, font=sf, fill=rcolor)
    draw.text((490, H - 72), "區域", font=sf, fill=PALETTE["muted"])
    draw.text((570, H - 72), region, font=sf, fill=rcolor)
    draw.text((800, H - 72), "說明：地圖編號對應右側完整城市清單", font=sf, fill=PALETTE["muted"])


def draw_city_panel(draw: ImageDraw.ImageDraw, current_city: str, entries: List[Tuple[int, str, str]]):
    h_font = load_font(40)
    item_font = load_font(26)
    region_font = load_font(30)

    draw.text((1760, 120), "各島 / 各區城市清單", font=h_font, fill=PALETTE["text"])

    y = 186
    for region_name, region in REGIONS.items():
        c = region["color"]
        draw.rounded_rectangle((1750, y, 2500, y + 36), radius=10, fill=(10, 28, 52, 210), outline=(110, 160, 212), width=1)
        draw.text((1764, y + 3), region_name, font=region_font, fill=c)
        y += 44

        for city in region["locations"]:
            idx = next(i for i, n, rn in entries if n == city and rn == region_name)
            is_current = city == current_city
            prefix = "◉" if is_current else "•"
            color = PALETTE["current"] if is_current else PALETTE["text"]
            draw.text((1766, y), f"{prefix} {idx:02d}  {city}", font=item_font, fill=color)
            y += 32

        y += 8

    # legend
    draw.rounded_rectangle((1750, 1418, 2500, 1500), radius=10, fill=(10, 28, 52, 210), outline=(110, 160, 212), width=1)
    draw.text((1764, 1434), "圖例：◉目前位置  ◎主傳送門  編號=地圖點位", font=load_font(24), fill=PALETTE["muted"])


def render(current_city: str, out: Path):
    city_to_idx, entries = build_city_index()
    if current_city not in city_to_idx:
        current_city = "廣州"

    canvas = ocean_bg()
    draw = ImageDraw.Draw(canvas, "RGBA")

    draw_layout_boxes(draw)
    draw_regions(canvas)
    draw_city_markers(ImageDraw.Draw(canvas, "RGBA"), current_city, city_to_idx)
    draw_title(ImageDraw.Draw(canvas, "RGBA"), current_city)
    draw_city_panel(ImageDraw.Draw(canvas, "RGBA"), current_city, entries)

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", default="廣州")
    parser.add_argument("--output", default=str(OUT_DIR / "poster_v3_fullcities_guangzhou.png"))
    args = parser.parse_args()
    result = render(args.current, Path(args.output).resolve())
    print(str(result))


if __name__ == "__main__":
    main()
