# Map Poster Renderer Prototype

Pixel-style poster renderer for regional map visualization.

## Run

```bash
python3 tools/map_poster_renderer/render_poster_map.py --current 廣州
```

Optional output path:

```bash
python3 tools/map_poster_renderer/render_poster_map.py --current 桃花島 --output tools/map_poster_renderer/output/demo_taohua.png
```

## Design notes

- Base canvas is low resolution and then upscaled with nearest-neighbor.
- This keeps the image sharp in a pixel-art style instead of blurry.
- Region colors are fixed and the current location text uses the same region color.
