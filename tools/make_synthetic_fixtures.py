#!/usr/bin/env python3
"""Generate labelled synthetic sudoku photos for the vision test harness.

Synthetic fixtures exist so the harness has something to measure from day one and
so regressions are catchable without re-shooting photos. They are NOT a substitute
for real ones - in particular the "handwritten" fixtures are printed glyphs with
jitter, not real handwriting. See tools/fixtures/README.md.

Every fixture carries ground truth for both the board AND the four grid corners in
final-image pixel coordinates, so grid detection (plan 2.3) can be scored directly
instead of only end to end.

Usage:  python3 tools/make_synthetic_fixtures.py [--seed 7] [--out tools/fixtures]

Requires Pillow and numpy (dev only - nothing here ships to the page).
"""

import argparse
import json
import math
import os
import random
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

GRID_PX = 900          # rendered grid, before it is placed on a page
CELL = GRID_PX // 9
OUT_LONG_SIDE = 1100   # saved size; the pipeline downscales to 1024 anyway

FONT_CANDIDATES = [
    "DejaVuSans.ttf", "DejaVuSerif.ttf", "DejaVuSansCondensed.ttf",
    "LiberationSans-Regular.ttf", "LiberationSerif-Regular.ttf",
    "LiberationMono-Regular.ttf", "Lato-Regular.ttf", "Poppins-Regular.ttf",
    "NimbusSans-Regular.otf", "URWBookman-Light.otf", "Carlito-Regular.ttf",
    "C059-Roman.otf", "NimbusRoman-Regular.otf",
]


def find_fonts():
    """Resolve font files by name via fontconfig, keeping only what exists."""
    try:
        listing = subprocess.run(["fc-list"], capture_output=True, text=True, timeout=20).stdout
    except Exception:
        listing = ""
    found = []
    for name in FONT_CANDIDATES:
        for line in listing.splitlines():
            path = line.split(":", 1)[0]
            if path.endswith("/" + name) and os.path.exists(path):
                found.append(path)
                break
    if not found:
        raise SystemExit("no usable fonts found - install fonts-dejavu or pass your own")
    return found


# --------------------------------------------------------------- the puzzle

def solved_grid(rng):
    board = [[0] * 9 for _ in range(9)]

    def ok(r, c, v):
        for i in range(9):
            if board[r][i] == v or board[i][c] == v:
                return False
        br, bc = r - r % 3, c - c % 3
        for i in range(br, br + 3):
            for j in range(bc, bc + 3):
                if board[i][j] == v:
                    return False
        return True

    def fill(pos):
        if pos == 81:
            return True
        r, c = divmod(pos, 9)
        values = list(range(1, 10))
        rng.shuffle(values)
        for v in values:
            if ok(r, c, v):
                board[r][c] = v
                if fill(pos + 1):
                    return True
                board[r][c] = 0
        return False

    fill(0)
    return board


def count_solutions(board, limit=2):
    """How many ways the board can be completed, counting no further than `limit`.

    Picks the most constrained cell rather than the first empty one, which keeps
    this fast enough to run once per removal while digging.
    """
    found = [0]

    def allowed(r, c, v):
        for i in range(9):
            if board[r][i] == v or board[i][c] == v:
                return False
        br, bc = r - r % 3, c - c % 3
        for i in range(br, br + 3):
            for j in range(bc, bc + 3):
                if board[i][j] == v:
                    return False
        return True

    def search():
        if found[0] >= limit:
            return
        best = None
        best_count = 10
        for r in range(9):
            for c in range(9):
                if board[r][c]:
                    continue
                options = [v for v in range(1, 10) if allowed(r, c, v)]
                if not options:
                    return
                if len(options) < best_count:
                    best_count = len(options)
                    best = (r, c, options)
                    if best_count == 1:
                        break
            if best_count == 1:
                break
        if best is None:
            found[0] += 1
            return
        r, c, options = best
        for v in options:
            board[r][c] = v
            search()
            board[r][c] = 0
            if found[0] >= limit:
                return

    search()
    return found[0]


def dig(solution, clues, rng):
    """Remove cells while the board still has exactly one solution.

    Digging at random without this check produces boards with many solutions -
    which are not sudoku puzzles. Every real puzzle has a unique solution, and the
    solver-assisted repair in plan section 5.2 relies on that: it accepts a reading
    only when exactly one candidate board solves uniquely. Fixtures that were merely
    "solvable" made that mechanism untestable, and silently so.

    `clues` is a floor, not a target: digging stops there even if more could go.
    """
    board = [row[:] for row in solution]
    cells = [(r, c) for r in range(9) for c in range(9)]
    rng.shuffle(cells)
    remaining = 81
    for r, c in cells:
        if remaining <= clues:
            break
        saved = board[r][c]
        board[r][c] = 0
        if count_solutions(board) == 1:
            remaining -= 1
        else:
            board[r][c] = saved
    return board


def board_to_string(board):
    return "".join(str(v) if v else "." for row in board for v in row)


# -------------------------------------------------------------- rendering

def digit_tile(digit, font, rng, handwritten):
    """A single digit on white, cropped to its ink, with optional jitter."""
    box = 220
    tile = Image.new("L", (box, box), 255)
    draw = ImageDraw.Draw(tile)
    draw.text((box / 2, box / 2), str(digit), font=font, fill=0, anchor="mm")

    if handwritten:
        # European hand: crossed 7, and a base serif on 1 - exactly the glyphs the
        # plan flags as the likeliest systematic failure for an MNIST-trained model.
        bbox = tile.getbbox() or (0, 0, box, box)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        stroke = max(3, int(h * 0.055))
        # A crossed 7 carries a SHORT bar through the middle of the diagonal. An
        # earlier version ran it past both edges of the glyph, which produced a
        # struck-through dash 2.2x wider than it was tall - a fixture that tested
        # nothing real. Keep the bar inside the glyph's own width.
        if digit == 7 and rng.random() < 0.8:
            y = bbox[1] + h * 0.52
            cx = bbox[0] + w * 0.55
            half = w * 0.30
            draw.line([(cx - half, y), (cx + half, y)], fill=0, width=stroke)
        if digit == 1 and rng.random() < 0.7:
            y = bbox[3]
            cx = bbox[0] + w / 2
            half = max(w * 0.55, h * 0.13)
            draw.line([(cx - half, y), (cx + half, y)], fill=0, width=stroke)

        angle = rng.uniform(-11, 11)
        shear = rng.uniform(-0.18, 0.18)
        tile = tile.rotate(angle, resample=Image.BICUBIC, fillcolor=255)
        tile = tile.transform(
            tile.size, Image.AFFINE, (1, shear, -shear * box / 2, 0, 1, 0),
            resample=Image.BICUBIC, fillcolor=255)
        if rng.random() < 0.5:
            tile = tile.filter(ImageFilter.MinFilter(3))   # thicker stroke

    bbox = tile.getbbox()
    return tile.crop(bbox) if bbox else tile


def render_grid(board, rng, fonts, handwritten, line_scale=1.0):
    """The clean 900x900 grid: lines plus digits, black on white."""
    img = Image.new("L", (GRID_PX, GRID_PX), 255)
    draw = ImageDraw.Draw(img)

    thin = max(1, int(round(2 * line_scale)))
    thick = max(2, int(round(5 * line_scale)))
    for i in range(10):
        p = min(i * CELL, GRID_PX - 1)
        w = thick if i % 3 == 0 else thin
        draw.line([(p, 0), (p, GRID_PX)], fill=0, width=w)
        draw.line([(0, p), (GRID_PX, p)], fill=0, width=w)

    page_font = None if handwritten else ImageFont.truetype(rng.choice(fonts), 150)
    for r in range(9):
        for c in range(9):
            if not board[r][c]:
                continue
            font = ImageFont.truetype(rng.choice(fonts), 150) if handwritten else page_font
            tile = digit_tile(board[r][c], font, rng, handwritten)
            target_h = CELL * (rng.uniform(0.52, 0.68) if handwritten else 0.60)
            scale = target_h / tile.height
            tile = tile.resize(
                (max(1, int(tile.width * scale)), max(1, int(tile.height * scale))),
                Image.LANCZOS)
            jitter = CELL * 0.06 if handwritten else CELL * 0.015
            x = int(c * CELL + (CELL - tile.width) / 2 + rng.uniform(-jitter, jitter))
            y = int(r * CELL + (CELL - tile.height) / 2 + rng.uniform(-jitter, jitter))
            img.paste(tile, (x, y), ImageOps_invert_mask(tile))
    return img


def ImageOps_invert_mask(tile):
    """Paste mask: ink (dark) opaque, paper (white) transparent."""
    return Image.eval(tile, lambda v: 255 - v)


# ------------------------------------------------------------- geometry

def perspective_coeffs(dst_quad, src_quad):
    """Coefficients for Image.transform(PERSPECTIVE), which maps output -> input."""
    rows = []
    for (x, y), (u, v) in zip(dst_quad, src_quad):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    a = np.array(rows, dtype=np.float64)
    b = np.array(src_quad, dtype=np.float64).reshape(8)
    return np.linalg.solve(a, b)


def destination_quad(page_w, page_h, rng, margin, rotation_deg, perspective):
    """Where the grid lands on the page: margin, rotation and corner jitter in one step."""
    side = min(page_w, page_h) * (1 - 2 * margin)
    cx, cy = page_w / 2, page_h / 2
    half = side / 2
    base = [(-half, -half), (half, -half), (half, half), (-half, half)]
    th = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(th), math.sin(th)
    quad = []
    for (x, y) in base:
        rx = x * cos_t - y * sin_t
        ry = x * sin_t + y * cos_t
        rx += rng.uniform(-perspective, perspective) * side
        ry += rng.uniform(-perspective, perspective) * side
        quad.append((cx + rx, cy + ry))
    return quad


def paper(page_w, page_h, rng, base=248, grain=4.0):
    """Off-white page with a little low-frequency mottling."""
    small = rng.normal(0, 1, (8, 8))
    field = np.array(Image.fromarray(((small - small.min()) /
                                      (np.ptp(small) + 1e-6) * 255).astype(np.uint8))
                     .resize((page_w, page_h), Image.BICUBIC), dtype=np.float64) / 255.0
    return np.clip(base - 6 + field * 8 + rng.normal(0, grain, (page_h, page_w)), 0, 255)


def place(grid_img, page_w, page_h, quad, page_array):
    """Warp the grid onto the page along `quad` and composite it."""
    src = [(0, 0), (GRID_PX, 0), (GRID_PX, GRID_PX), (0, GRID_PX)]
    coeffs = perspective_coeffs(quad, src)
    warped = grid_img.transform((page_w, page_h), Image.PERSPECTIVE, coeffs,
                                resample=Image.BICUBIC, fillcolor=255)
    mask = Image.new("L", grid_img.size, 255).transform(
        (page_w, page_h), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC, fillcolor=0)
    m = np.asarray(mask, dtype=np.float64) / 255.0
    return page_array * (1 - m) + np.asarray(warped, dtype=np.float64) * m


# ----------------------------------------------------------- degradations

def remap_bilinear(a, xs, ys):
    h, w = a.shape
    x0 = np.floor(xs).astype(int)
    y0 = np.floor(ys).astype(int)
    fx, fy = xs - x0, ys - y0
    x0c, x1c = np.clip(x0, 0, w - 1), np.clip(x0 + 1, 0, w - 1)
    y0c, y1c = np.clip(y0, 0, h - 1), np.clip(y0 + 1, 0, h - 1)
    return (a[y0c, x0c] * (1 - fx) * (1 - fy) + a[y0c, x1c] * fx * (1 - fy) +
            a[y1c, x0c] * (1 - fx) * fy + a[y1c, x1c] * fx * fy)


def curl(a, quad, amplitude):
    """Page curl: vertical displacement that varies across the page width."""
    h, w = a.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    dy = amplitude * np.sin(math.pi * xs / w)
    out = remap_bilinear(a, xs, ys - dy)
    moved = [(x, y + amplitude * math.sin(math.pi * x / w)) for (x, y) in quad]
    return out, moved


def lighting(a, rng, strength):
    h, w = a.shape
    small = rng.random((5, 5))
    field = np.array(Image.fromarray((small * 255).astype(np.uint8))
                     .resize((w, h), Image.BICUBIC), dtype=np.float64) / 255.0
    return a * (1 - strength * (1 - field))


def gutter(a, rng, depth=0.55):
    h, w = a.shape
    xs = np.arange(w, dtype=np.float64)
    cx = rng.choice([w * 0.06, w * 0.94])
    band = depth * np.exp(-((xs - cx) / (w * 0.10)) ** 2)
    return a * (1 - band)[None, :]


def low_contrast(a, lo=82, hi=172):
    return lo + (a / 255.0) * (hi - lo)


# ------------------------------------------------------------- scenarios
# margin, rotation, perspective, and the degradations to apply.

SCENARIOS = [
    dict(name="screenshot-clean-a", tags=["screenshot", "print"], clues=32,
         margin=0.01, rot=0.0, persp=0.0, bg=255, grain=0.0, notes="crisp app screenshot"),
    dict(name="screenshot-clean-b", tags=["screenshot", "print"], clues=27,
         margin=0.06, rot=0.0, persp=0.0, bg=255, grain=0.0, notes="screenshot with margin"),
    dict(name="screenshot-inverted", tags=["screenshot", "inverted"], clues=30,
         margin=0.03, rot=0.0, persp=0.0, bg=255, grain=0.0, invert=True,
         notes="dark-mode app: white digits on black. KNOWN GAP - the pipeline assumes dark ink."),
    dict(name="flat-print-a", tags=["print", "flat"], clues=30,
         margin=0.08, rot=1.5, persp=0.004, noise=3.5, notes="flat scan"),
    dict(name="flat-print-b", tags=["print", "flat"], clues=24,
         margin=0.12, rot=-2.0, persp=0.006, noise=5.0, light=0.15, notes="flat scan, few clues"),
    dict(name="perspective-mild-a", tags=["print", "perspective"], clues=29,
         margin=0.09, rot=3.0, persp=0.030, noise=4.0, light=0.20),
    dict(name="perspective-mild-b", tags=["print", "perspective"], clues=33,
         margin=0.10, rot=-4.5, persp=0.035, noise=4.0, light=0.18),
    dict(name="perspective-strong-a", tags=["print", "perspective", "hard"], clues=28,
         margin=0.11, rot=6.0, persp=0.070, noise=5.0, light=0.28),
    dict(name="perspective-strong-b", tags=["print", "perspective", "hard"], clues=31,
         margin=0.13, rot=-8.0, persp=0.080, noise=5.0, light=0.30),
    dict(name="rotated-a", tags=["print", "rotation"], clues=30,
         margin=0.16, rot=13.0, persp=0.012, noise=4.0, light=0.18),
    dict(name="rotated-b", tags=["print", "rotation"], clues=26,
         margin=0.17, rot=-16.0, persp=0.012, noise=4.0, light=0.18),
    dict(name="shadow-a", tags=["print", "lighting", "hard"], clues=30,
         margin=0.10, rot=2.0, persp=0.030, noise=5.0, light=0.50),
    dict(name="shadow-b", tags=["print", "lighting", "hard"], clues=28,
         margin=0.10, rot=-3.0, persp=0.040, noise=6.0, light=0.58),
    dict(name="blurred", tags=["print", "blur"], clues=30,
         margin=0.10, rot=2.5, persp=0.025, noise=4.0, light=0.20, blur=2.2),
    dict(name="low-contrast", tags=["print", "lighting", "hard"], clues=29,
         margin=0.10, rot=-2.5, persp=0.025, noise=4.0, contrast=True),
    dict(name="page-curl", tags=["print", "curl", "hard"], clues=30,
         margin=0.12, rot=1.0, persp=0.020, noise=4.0, light=0.25, curl=26),
    dict(name="book-gutter", tags=["print", "lighting", "hard"], clues=31,
         margin=0.11, rot=-2.0, persp=0.030, noise=5.0, light=0.20, gutter=True),
    dict(name="noisy-jpeg", tags=["print", "noise"], clues=27,
         margin=0.10, rot=3.5, persp=0.030, noise=11.0, light=0.22, quality=45),
    dict(name="handwriting-a", tags=["handwriting", "pseudo"], clues=28,
         margin=0.10, rot=2.0, persp=0.025, noise=4.0, light=0.20, hand=True),
    dict(name="handwriting-b", tags=["handwriting", "pseudo", "hard"], clues=31,
         margin=0.11, rot=-5.0, persp=0.045, noise=5.0, light=0.30, hand=True),
    dict(name="handwriting-curl", tags=["handwriting", "pseudo", "curl", "hard"], clues=26,
         margin=0.12, rot=3.0, persp=0.035, noise=5.0, light=0.28, curl=20, hand=True),
]


def build(scenario, rng, np_rng, fonts):
    board = dig(solved_grid(rng), scenario["clues"], rng)
    grid_img = render_grid(board, rng, fonts,
                           handwritten=scenario.get("hand", False),
                           line_scale=scenario.get("line_scale", 1.0))

    page_w = int(GRID_PX * rng.uniform(1.15, 1.35))
    page_h = int(page_w * rng.uniform(0.95, 1.25))
    page = paper(page_w, page_h, np_rng,
                 base=scenario.get("bg", 248), grain=scenario.get("grain", 3.0))

    quad = destination_quad(page_w, page_h, rng, scenario["margin"],
                            scenario["rot"], scenario["persp"])
    a = place(grid_img, page_w, page_h, quad, page)

    if scenario.get("curl"):
        a, quad = curl(a, quad, scenario["curl"])
    if scenario.get("light"):
        a = lighting(a, np_rng, scenario["light"])
    if scenario.get("gutter"):
        a = gutter(a, np_rng)
    if scenario.get("contrast"):
        a = low_contrast(a)
    if scenario.get("invert"):
        a = 255 - a
    if scenario.get("noise"):
        a = a + np_rng.normal(0, scenario["noise"], a.shape)

    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "L")
    if scenario.get("blur"):
        img = img.filter(ImageFilter.GaussianBlur(scenario["blur"]))

    scale = OUT_LONG_SIDE / max(img.width, img.height)
    img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    quad = [(round(x * scale, 1), round(y * scale, 1)) for (x, y) in quad]
    return board, img, quad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "fixtures"))
    args = ap.parse_args()

    fonts = find_fonts()
    os.makedirs(args.out, exist_ok=True)
    entries = []

    for i, scenario in enumerate(SCENARIOS, start=1):
        rng = random.Random(args.seed * 1000 + i)
        np_rng = np.random.default_rng(args.seed * 1000 + i)
        board, img, quad = build(scenario, rng, np_rng, fonts)
        solutions = count_solutions([row[:] for row in board])
        if solutions != 1:
            raise SystemExit("fixture %s has %d solutions - not a puzzle" %
                             (scenario["name"], solutions))
        filename = "syn-%02d-%s.jpg" % (i, scenario["name"])
        img.save(os.path.join(args.out, filename), quality=scenario.get("quality", 82))
        entries.append({
            "file": filename,
            "board": board_to_string(board),
            "corners": [[q[0], q[1]] for q in quad],
            "tags": ["synthetic"] + scenario["tags"],
            "notes": scenario.get("notes", ""),
        })
        print("%-34s %2d clues  %s" % (filename, sum(1 for v in board_to_string(board)
                                                        if v != "."), " ".join(scenario["tags"])))

    manifest = os.path.join(args.out, "manifest.js")
    existing = []
    if os.path.exists(manifest):
        with open(manifest, encoding="utf-8") as fh:
            text = fh.read()
        anchor = text.find("window.SUDOKU_FIXTURES")
        start, end = text.find("[", anchor), text.rfind("]")
        if start != -1 and end != -1:
            existing = [e for e in json.loads(text[start:end + 1])
                        if "synthetic" not in e.get("tags", [])]
            print("kept %d real-photo entries" % len(existing))

    payload = json.dumps(existing + entries, indent=2)
    with open(manifest, "w", encoding="utf-8") as fh:
        fh.write(
            "// Fixture manifest for test-vision.html. Generated entries tagged\n"
            "// \"synthetic\" are rewritten by tools/make_synthetic_fixtures.py;\n"
            "// hand-added real-photo entries are preserved.\n"
            "//\n"
            "// A .js file rather than .json on purpose: a <script> tag loads from\n"
            "// file://, whereas fetch() of a local .json is blocked by Chrome.\n"
            "//\n"
            "// board:   81 chars, row-major, '.' = empty\n"
            "// corners: grid corners in image pixels, in TL, TR, BR, BL order - omit if unknown\n"
            "window.SUDOKU_FIXTURES = " + payload + ";\n")
    print("\nwrote %d fixtures -> %s" % (len(entries), manifest))


if __name__ == "__main__":
    main()
