#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import argparse
import json
import os

TILE_STYLE = {
    "░": ((50, 50, 50), (110, 110, 110)),
    "▓": ((15, 15, 15), (35, 35, 35)),
    "█": ((70, 45, 20), (110, 75, 40)),
    "≈": ((15, 50, 130), (40, 100, 220)),
    "♣": ((15, 60, 15), (50, 170, 50)),
    "◉": ((20, 20, 20), (255, 220, 0)),
    "◎": ((20, 20, 20), (255, 170, 60)),
    "●": ((20, 20, 20), (180, 130, 255)),
    "☠": ((20, 20, 20), (220, 50, 50)),
    "◈": ((20, 20, 20), (255, 180, 0)),
    "┌": ((25, 25, 25), (120, 120, 120)),
    "─": ((25, 25, 25), (120, 120, 120)),
    "┐": ((25, 25, 25), (120, 120, 120)),
    "│": ((25, 25, 25), (120, 120, 120)),
    "└": ((25, 25, 25), (120, 120, 120)),
    "┘": ((25, 25, 25), (120, 120, 120)),
}
DEFAULT_STYLE = ((30, 30, 30), (200, 200, 200))

DISPLAY_GLYPH = {
    "◉": "@",   # 玩家位置改成 @
    "♣": "▲",   # 森林改成樹形，避免字型方塊感
}

CELL = 32
FONT_SIZE = 22
PAD = 20
HEADER_H = 56
FOOTER_H = 62
BG_COLOR = (18, 18, 28)


def load_font(font_path: str, size: int):
    candidates = []
    if font_path:
      candidates.append(font_path)
    candidates.extend([
        "NotoSansMonoCJKtc-Regular.otf",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Apple Symbols.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ])
    for candidate in candidates:
        if not candidate:
            continue
        try:
            if os.path.exists(candidate) or "/" not in candidate:
                return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def render_map_image(map_rows, labels=None, zone_name="", status="", output_path="", font_path=""):
    rows = len(map_rows)
    cols = max(len(r) for r in map_rows) if rows > 0 else 1

    w = cols * CELL + PAD * 2
    h = rows * CELL + PAD * 2 + HEADER_H + FOOTER_H
    img = Image.new("RGB", (w, h), BG_COLOR)
    draw = ImageDraw.Draw(img)

    font = load_font(font_path, FONT_SIZE)
    font_head = load_font(font_path, 24)
    font_meta = load_font(font_path, 16)
    font_legend = load_font(font_path, 15)

    draw.rectangle([0, 0, w, HEADER_H], fill=(26, 28, 54))
    draw.line([0, HEADER_H, w, HEADER_H], fill=(80, 80, 120), width=1)
    if zone_name:
        draw.text((PAD, 13), f"{zone_name}", font=font_head, fill=(214, 220, 255))

    map_top = HEADER_H + PAD
    for y, row in enumerate(map_rows):
        for x, char in enumerate(row):
            bg, fg = TILE_STYLE.get(char, DEFAULT_STYLE)
            cx = PAD + x * CELL
            cy = map_top + y * CELL
            draw.rectangle([cx, cy, cx + CELL - 1, cy + CELL - 1], fill=bg)
            glyph = DISPLAY_GLYPH.get(char, char)
            draw.text((cx + 6, cy + 3), glyph, font=font, fill=fg)

    label_items = labels if isinstance(labels, list) else []
    occupied = []
    for idx, item in enumerate(label_items):
        try:
            x = int(item.get("x", -1))
            y = int(item.get("y", -1))
            name = str(item.get("name", "")).strip()
            marker = str(item.get("marker", "")).strip()
            if x < 0 or y < 0 or not name:
                continue
            cx = PAD + x * CELL
            cy = map_top + y * CELL
            text = f"{marker}{name}" if marker else name

            bbox = draw.textbbox((0, 0), text, font=font_meta)
            tw = max(1, bbox[2] - bbox[0])
            th = max(1, bbox[3] - bbox[1])

            candidates = [
                (cx + CELL + 3, cy - 2),        # right top
                (cx + CELL + 3, cy + 11),       # right bottom
                (cx - tw - 6, cy - 2),          # left top
                (cx - tw - 6, cy + 11),         # left bottom
                (cx - tw // 2, cy - th - 6),    # above
                (cx - tw // 2, cy + CELL + 2),  # below
            ]
            # rotate start candidate to distribute shapes
            start = idx % len(candidates)
            ordered = candidates[start:] + candidates[:start]
            chosen = None
            for tx0, ty0 in ordered:
                tx = max(PAD + 1, min(tx0, w - PAD - tw - 2))
                ty = max(map_top + 1, min(ty0, map_top + rows * CELL - th - 2))
                box = [tx - 2, ty - 1, tx + tw + 2, ty + th + 1]
                hit = False
                for ob in occupied:
                    if not (box[2] < ob[0] or box[0] > ob[2] or box[3] < ob[1] or box[1] > ob[3]):
                        hit = True
                        break
                if not hit:
                    chosen = (tx, ty, box)
                    break
            if chosen is None:
                tx = max(PAD + 1, min(cx + CELL + 3, w - PAD - tw - 2))
                ty = max(map_top + 1, min(cy + 11, map_top + rows * CELL - th - 2))
                box = [tx - 2, ty - 1, tx + tw + 2, ty + th + 1]
            else:
                tx, ty, box = chosen

            draw.rectangle(box, fill=(10, 10, 16))
            draw.text((tx, ty), text, font=font_meta, fill=(218, 218, 232))
            occupied.append(box)

        except Exception:
            continue

    footer_y = h - FOOTER_H
    draw.rectangle([0, footer_y, w, h], fill=(20, 22, 44))
    draw.line([0, footer_y, w, footer_y], fill=(80, 80, 120), width=1)
    legend_items = [
        ("@", (255, 220, 0), "目前位置"),
        ("◎", (255, 170, 60), "主傳送門"),
        ("●", (180, 130, 255), "城市"),
        ("▲", (50, 170, 50), "森林"),
    ]
    lx = PAD
    ly = footer_y + 10
    for symbol, color, text in legend_items:
        draw.text((lx, ly), symbol, font=font_legend, fill=color)
        lx += 18
        draw.text((lx, ly + 1), text, font=font_legend, fill=(206, 210, 230))
        lx += 78
    if status:
        draw.text((PAD, footer_y + 34), status, font=font_legend, fill=(185, 185, 185))

    img.save(output_path, format="PNG")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--font", default="")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        payload = json.load(f)

    render_map_image(
        map_rows=payload.get("map_rows", []),
        labels=payload.get("labels", []),
        zone_name=payload.get("zone_name", ""),
        status=payload.get("status", ""),
        output_path=args.output,
        font_path=args.font or "",
    )


if __name__ == "__main__":
    main()
