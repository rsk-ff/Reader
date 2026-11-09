"""Draw the pixel-aligned 16/20/24px Explorer file icons (design tool, needs Pillow).

Output PNGs are committed under reader/src/assets/icons/small/ and embedded into
file-*.ico by generate-file-association-icons.mjs, so building never needs Python.
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "reader/src/assets/icons/small"
GLYPHS = {
    "P": ["###", "#.#", "###", "#..", "#.."],
    "D": ["##.", "#.#", "#.#", "#.#", "##."],
    "F": ["###", "#..", "##.", "#..", "#.."],
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
}
TYPES = {"pdf": ("PDF", (178, 72, 72)), "markdown": ("MD", (72, 114, 170))}
# Page and tag keep the proportions of the 64-unit master (page x 12-52, tag x 6-50 / y 37-55),
# so the tag sits in the same place at every size. No ginkgo: it cannot fit legibly here.
#        size: page x0,x1,y0,y1, fold, badge x0,x1,y0,y1
LAYOUT = {
    16: dict(page=(3, 13, 1, 15), fold=3, badge=(1, 12, 8, 14)),
    20: dict(page=(4, 16, 1, 18), fold=4, badge=(2, 15, 11, 17)),
    24: dict(page=(4, 19, 1, 22), fold=4, badge=(2, 18, 13, 19)),
}
LINE, PAPER, FOLD, TEXT = (128, 124, 114, 255), (255, 255, 255, 255), (226, 223, 214, 255), (200, 197, 189, 255)


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
    for y in range(y0 + 3, L["badge"][2] - 1, 2):  # faint text lines, like a page of writing
        d.line([(x0 + 2, y), (x1 - (f + 2 if y <= y0 + f else 2), y)], fill=TEXT)
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
