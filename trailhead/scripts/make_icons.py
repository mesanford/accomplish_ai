"""Draws the maskable app icons from the logo's shapes (app/public/favicon.svg). Run from the trailhead folder:

    .venv/bin/python scripts/make_icons.py

A maskable icon is a full square of color that the phone crops to a circle, squircle or rounded square, so the logo
must sit inside the middle 80 percent (the "safe zone"). This keeps it inside about 60 percent. The icons that are
not maskable (icon-192.png, icon-512.png, apple-touch-icon.png) are left alone.
"""

from pathlib import Path

from PIL import Image, ImageDraw

GREEN, CREAM, GOLD = "#4f6a2e", "#fffdf7", "#e8b655"
# The two tiles of the logo in its 64 x 64 drawing: (x, y, width, height, corner radius, color).
TILES = [(17, 33, 13, 21, 2.5, CREAM), (34, 10, 13, 21, 2.5, GOLD)]
LOGO_BOX = (17, 10, 47, 54)  # the tiles' bounding box in that drawing
OUT = Path(__file__).resolve().parent.parent / "app" / "public"
SIZES = (192, 512)
SCALE_UP = 4  # draw large, then shrink, for smooth edges
SAFE_FRACTION = 0.6  # the logo's height as a share of the icon


def maskable(size: int) -> Image.Image:
    big = size * SCALE_UP
    image = Image.new("RGB", (big, big), GREEN)
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = LOGO_BOX
    unit = big * SAFE_FRACTION / (bottom - top)
    origin_x = (big - (right - left) * unit) / 2 - left * unit
    origin_y = (big - (bottom - top) * unit) / 2 - top * unit
    for x, y, w, h, radius, color in TILES:
        box = (origin_x + x * unit, origin_y + y * unit, origin_x + (x + w) * unit, origin_y + (y + h) * unit)
        draw.rounded_rectangle(box, radius=radius * unit, fill=color)
    return image.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for size in SIZES:
        target = OUT / f"icon-maskable-{size}.png"
        maskable(size).save(target, optimize=True)
        print(f"wrote {target}")
