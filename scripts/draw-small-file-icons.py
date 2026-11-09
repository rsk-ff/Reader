"""Draw the pixel-aligned 16/20/24px Explorer file icons (design tool, needs Pillow).

Output PNGs are committed under reader/src/assets/icons/small/ and embedded into
file-*.ico by generate-file-association-icons.mjs, so building never needs Python.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "reader/src/assets/icons/small"
GLYPHS = {
    "P": ["###", "#.#", "###", "#..", "#.."],
    "D": ["##.", "#.#", "#.#", "#.#", "##."],
    "F": ["###", "#..", "##.", "#..", "#.."],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
}
TYPES = {"pdf": ("PDF", (178, 72, 72)), "markdown": ("MD", (72, 114, 170))}
#        size: page x0,x1,y0,y1, fold, badge x0,x1,y0,y1, leaf cx,top,width,height
LAYOUT = {
    16: dict(page=(3, 14, 0, 15), fold=4, badge=(0, 12, 8, 14), leaf=(8.5, 1.2, 8.6, 6.4)),
    20: dict(page=(4, 18, 0, 19), fold=5, badge=(0, 14, 10, 17), leaf=(11.0, 1.4, 10.8, 8.0)),
    24: dict(page=(5, 21, 1, 23), fold=6, badge=(1, 16, 12, 20), leaf=(13.0, 2.4, 12.4, 9.2)),
}
LINE, PAPER, FOLD = (128, 124, 114, 255), (255, 255, 255, 255), (226, 223, 214, 255)


def leaf(size, cx, top, width, height):
    """Ginkgo fan: two lobes with a centre notch and a short stem, supersampled."""
    k = 8
    layer = Image.new("RGBA", (size * k, size * k))
    d = ImageDraw.Draw(layer)
    base = (cx * k, (top + height) * k)
    r = height * k * 1.0
    half = width * k / 2
    for side, colour in ((-1, (233, 150, 16, 255)), (1, (248, 184, 44, 255))):
        points = [base]
        for i in range(25):
            a = math.radians(90 + side * (7 + 71 * i / 24))
            points.append((base[0] + side * abs(math.cos(a)) * half, base[1] - math.sin(a) * r))
        points.append((base[0] + side * k * 0.15, base[1] - r * 0.5))  # centre notch
        d.polygon(points, fill=colour)
    d.line([(base[0], base[1] - k), (base[0] - k * 0.3, base[1] + k * 1.0)], fill=(140, 92, 8, 255), width=int(k * 1.3))
    return layer.resize((size, size), Image.LANCZOS)


def draw(size, label, colour):
    L = LAYOUT[size]
    img = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(img)
    x0, x1, y0, y1 = L["page"]
    f = L["fold"]
    d.polygon([(x0, y0), (x1 - f, y0), (x1, y0 + f), (x1, y1), (x0, y1)], fill=PAPER)
    d.line([(x0, y0), (x1 - f, y0), (x1, y0 + f), (x1, y1), (x0, y1), (x0, y0)], fill=LINE)
    d.polygon([(x1 - f, y0), (x1 - f, y0 + f), (x1, y0 + f)], fill=FOLD)
    d.line([(x1 - f, y0), (x1 - f, y0 + f), (x1, y0 + f)], fill=LINE)
    img.alpha_composite(leaf(size, *L["leaf"]))
    bx0, bx1, by0, by1 = L["badge"]
    dark = tuple(int(c * 0.82) for c in colour)
    for y in range(by0, by1 + 1):
        t = (y - by0) / max(1, by1 - by0)
        row = tuple(int(colour[i] * (1 - t) + dark[i] * t) for i in range(3)) + (255,)
        d.line([(bx0 + (y in (by0, by1)), y), (bx1 - (y in (by0, by1)), y)], fill=row)
    glyphs = [GLYPHS[c] for c in label]
    width = sum(len(g[0]) for g in glyphs) + len(glyphs) - 1
    gx = bx0 + (bx1 - bx0 + 1 - width + 1) // 2
    gy = by0 + (by1 - by0 + 1 - 5) // 2
    for g in glyphs:
        for row, line in enumerate(g):
            for col, ch in enumerate(line):
                if ch == "#":
                    img.putpixel((gx + col, gy + row), (255, 255, 255, 255))
        gx += len(g[0]) + 1
    return img


OUT.mkdir(parents=True, exist_ok=True)
for kind, (label, colour) in TYPES.items():
    for size in LAYOUT:
        draw(size, label, colour).save(OUT / f"file-{kind}-{size}.png")
print("Wrote", OUT)
