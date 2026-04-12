#!/usr/bin/env python3
"""
Pixel-poster map prototype for Renaiss.
- Draws a stylized world poster with per-region colors.
- Highlights current location with a marker and matching color text.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "output"

BASE_W = 384
BASE_H = 216
SCALE = 6  # final 2304 x 1296 (crisp via nearest-neighbor)

PALETTE = {
    "bg": (8, 18, 34),
    "sea_1": (11, 31, 58),
    "sea_2": (17, 40, 68),
    "grid": (20, 44, 74),
    "coast": (232, 220, 190),
    "text": (230, 236, 245),
    "muted": (150, 168, 188),
    "title_bg": (14, 24, 44),
    "panel_bg": (9, 20, 38),
    "portal": (255, 176, 73),
    "current": (255, 240, 110),
}

REGION_COLOR = {
    "北境主島": (97, 180, 255),
    "中原樞紐": (120, 235, 172),
    "西域沙海": (255, 193, 112),
    "南疆水網": (158, 140, 255),
    "桃花群島": (255, 136, 181),
    "俠客群島": (255, 116, 116),
}

LOCATIONS = {
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

PORTALS = {
    "襄陽城",
    "敦煌",
    "廣州",
    "草原部落",
    "俠客島",
    "黑木崖",
}


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for f in candidates:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_pixel_rect(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, color: tuple[int, int, int]) -> None:
    draw.rectangle((x, y, x + w - 1, y + h - 1), fill=color)


def draw_island_blob(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], fill: tuple[int, int, int]) -> None:
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=PALETTE["coast"], width=2)


def draw_background(draw: ImageDraw.ImageDraw) -> None:
    draw_pixel_rect(draw, 0, 0, BASE_W, BASE_H, PALETTE["bg"])

    for y in range(0, BASE_H, 4):
        shade = PALETTE["sea_1"] if (y // 4) % 2 == 0 else PALETTE["sea_2"]
        draw.line((0, y, BASE_W, y), fill=shade, width=1)

    for x in range(0, BASE_W, 16):
        draw.line((x, 24, x, BASE_H - 34), fill=PALETTE["grid"], width=1)
    for y in range(24, BASE_H - 34, 16):
        draw.line((0, y, BASE_W, y), fill=PALETTE["grid"], width=1)

    draw_pixel_rect(draw, 0, 0, BASE_W, 22, PALETTE["title_bg"])
    draw_pixel_rect(draw, 0, BASE_H - 30, BASE_W, 30, PALETTE["panel_bg"])


def draw_regions(draw: ImageDraw.ImageDraw) -> None:
    draw_island_blob(
        draw,
        [(90, 44), (162, 42), (176, 64), (155, 82), (104, 82), (84, 66)],
        REGION_COLOR["北境主島"],
    )
    draw_island_blob(
        draw,
        [(146, 82), (270, 74), (286, 112), (272, 140), (168, 144), (142, 112)],
        REGION_COLOR["中原樞紐"],
    )
    draw_island_blob(
        draw,
        [(78, 90), (146, 88), (156, 132), (112, 148), (72, 132)],
        REGION_COLOR["西域沙海"],
    )
    draw_island_blob(
        draw,
        [(170, 124), (266, 118), (286, 158), (236, 182), (182, 176), (160, 146)],
        REGION_COLOR["南疆水網"],
    )
    draw_island_blob(
        draw,
        [(112, 154), (152, 152), (164, 178), (130, 194), (102, 182)],
        REGION_COLOR["桃花群島"],
    )
    draw_island_blob(
        draw,
        [(214, 152), (254, 150), (272, 172), (250, 194), (216, 188), (202, 170)],
        REGION_COLOR["俠客群島"],
    )


def draw_labels_and_markers(draw: ImageDraw.ImageDraw, current_location: str) -> tuple[str, tuple[int, int, int]]:
    font_small = load_font(10)
    font_tiny = load_font(9)

    for region_name, region_color in REGION_COLOR.items():
        anchor = {
            "北境主島": (101, 38),
            "中原樞紐": (189, 68),
            "西域沙海": (80, 84),
            "南疆水網": (194, 112),
            "桃花群島": (106, 150),
            "俠客群島": (220, 150),
        }[region_name]
        draw.text(anchor, region_name, font=font_small, fill=region_color)

    current_region = "中原樞紐"
    current_color = REGION_COLOR[current_region]

    for name, (x, y, region) in LOCATIONS.items():
        is_current = name == current_location
        is_portal = name in PORTALS

        dot_color = PALETTE["current"] if is_current else PALETTE["text"]
        if is_portal and not is_current:
            dot_color = PALETTE["portal"]

        r = 3 if is_current else 2
        draw.ellipse((x - r, y - r, x + r, y + r), fill=dot_color)

        if is_portal:
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), outline=PALETTE["portal"], width=1)

        if is_current:
            draw.ellipse((x - 8, y - 8, x + 8, y + 8), outline=PALETTE["current"], width=1)
            draw.text((x + 6, y - 10), "@", font=font_small, fill=PALETTE["current"])
            current_region = region
            current_color = REGION_COLOR.get(region, PALETTE["current"])

        draw.text((x + 6, y + 2), name, font=font_tiny, fill=PALETTE["text"])

    return current_region, current_color


def draw_header_footer(draw: ImageDraw.ImageDraw, current_location: str, current_region: str, current_color: tuple[int, int, int]) -> None:
    font_title = load_font(12)
    font_body = load_font(10)
    font_bold = load_font(11)

    draw.text((8, 6), "RENAISS 海域戰略圖（像素風原型）", font=font_title, fill=PALETTE["text"])

    y = BASE_H - 25
    draw.text((8, y), "目前位置:", font=font_body, fill=PALETTE["muted"])
    draw.text((54, y), current_location, font=font_bold, fill=current_color)
    draw.text((114, y), "| 區域:", font=font_body, fill=PALETTE["muted"])
    draw.text((147, y), current_region, font=font_bold, fill=current_color)

    draw.text((216, y), "圖例:", font=font_body, fill=PALETTE["muted"])
    draw.text((241, y), "@玩家", font=font_body, fill=PALETTE["current"])
    draw.text((274, y), "◎傳送門", font=font_body, fill=PALETTE["portal"])
    draw.text((327, y), "●城市", font=font_body, fill=PALETTE["text"])


def render(current_location: str, out_file: Path) -> Path:
    img = Image.new("RGB", (BASE_W, BASE_H), PALETTE["bg"])
    draw = ImageDraw.Draw(img)

    draw_background(draw)
    draw_regions(draw)
    current_region, current_color = draw_labels_and_markers(draw, current_location)
    draw_header_footer(draw, current_location, current_region, current_color)

    final = img.resize((BASE_W * SCALE, BASE_H * SCALE), resample=Image.Resampling.NEAREST)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    final.save(out_file, "PNG")
    return out_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Render pixel-style map poster prototype")
    parser.add_argument("--current", default="廣州", help="Current location name")
    parser.add_argument("--output", default=str(OUT_DIR / "pixel_poster_demo.png"), help="Output PNG path")
    args = parser.parse_args()

    current = args.current if args.current in LOCATIONS else "廣州"
    out = Path(args.output).resolve()
    result = render(current, out)
    print(str(result))


if __name__ == "__main__":
    main()
