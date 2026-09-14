#!/usr/bin/env python3
"""Train the digit classifier for vision.js (plan section 3).

Numpy only - no PyTorch. The model is ~27k parameters, which trains comfortably
with im2col convolutions in a few minutes on a CPU, and it keeps this script
runnable without a multi-gigabyte install. If the architecture ever grows past
this size, reach for a framework instead of scaling this up.

Data, all pushed through tools/digit_pipeline.py so that training sees exactly
what vision.js produces at run time:

  * MNIST digits 1-9            - real handwriting
  * printed system fonts        - newspaper and puzzle-book clues
  * handwriting fonts           - extra hand variety beyond MNIST's US sample
  * European variants           - crossed 7 and based 1, drawn onto real samples
  * a background class          - junk that gets past the empty-cell filter

Held out for testing: MNIST's own test split, fonts never seen in training, and
(via tools/eval_on_fixtures.py) the actual bitmaps the pipeline extracts from the
fixture photos.

Usage:
  python3 tools/train_digits.py --cache-dir .cache --hand-fonts .cache/fonts
"""

import argparse
import glob
import gzip
import math
import os
import subprocess
import sys
import time
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import digit_pipeline as dp

CELL = 40           # working resolution, about what a warped cell measures
CLASSES = 10        # 0 = background, 1..9 = digits
MNIST_BASE = "https://raw.githubusercontent.com/fgnt/mnist/master"
MNIST_FILES = ["train-images-idx3-ubyte.gz", "train-labels-idx1-ubyte.gz",
               "t10k-images-idx3-ubyte.gz", "t10k-labels-idx1-ubyte.gz"]


# --------------------------------------------------------------------- data in

def fetch_mnist(cache):
    os.makedirs(cache, exist_ok=True)
    for name in MNIST_FILES:
        path = os.path.join(cache, name)
        if not os.path.exists(path):
            print("  downloading", name)
            urllib.request.urlretrieve(MNIST_BASE + "/" + name, path)

    def read(name, kind):
        with gzip.open(os.path.join(cache, name)) as fh:
            int.from_bytes(fh.read(4), "big")
            n = int.from_bytes(fh.read(4), "big")
            if kind == "img":
                r = int.from_bytes(fh.read(4), "big")
                c = int.from_bytes(fh.read(4), "big")
                return np.frombuffer(fh.read(), np.uint8).reshape(n, r, c)
            return np.frombuffer(fh.read(), np.uint8)

    return (read(MNIST_FILES[0], "img"), read(MNIST_FILES[1], "lab"),
            read(MNIST_FILES[2], "img"), read(MNIST_FILES[3], "lab"))


def system_fonts(limit=80):
    """Printed faces from fontconfig that render every digit 1-9 legibly."""
    try:
        listing = subprocess.run(["fc-list"], capture_output=True, text=True,
                                 timeout=30).stdout
    except Exception:
        return []
    seen, out = set(), []
    for line in listing.splitlines():
        path = line.split(":", 1)[0]
        if not path.lower().endswith((".ttf", ".otf")) or path in seen:
            continue
        seen.add(path)
        if usable_for_digits(path):
            out.append(path)
        if len(out) >= limit:
            break
    return sorted(out)


def usable_for_digits(path):
    try:
        font = ImageFont.truetype(path, 64)
    except Exception:
        return False
    for d in "123456789":
        img = Image.new("L", (128, 128), 0)
        ImageDraw.Draw(img).text((64, 64), d, font=font, fill=255, anchor="mm")
        box = img.getbbox()
        if box is None or box[2] - box[0] < 6 or box[3] - box[1] < 12:
            return False
    return True


# ------------------------------------------------------------ sample synthesis

def render_glyph(font_path, digit, rng):
    """A digit drawn at cell scale: ink is 1, paper is 0, in a CELL x CELL frame."""
    size = int(CELL * rng.uniform(0.62, 0.82))
    try:
        font = ImageFont.truetype(font_path, size)
    except Exception:
        return None
    img = Image.new("L", (CELL, CELL), 0)
    ImageDraw.Draw(img).text((CELL / 2, CELL / 2), str(digit), font=font,
                             fill=255, anchor="mm")
    return np.asarray(img, dtype=np.float32) / 255.0


def mnist_to_cell(sample, rng):
    """MNIST's 28x28 lifted to cell scale, so augmentation happens at run-time scale."""
    target = int(CELL * rng.uniform(0.62, 0.86))
    img = Image.fromarray(sample).resize((target, target), Image.LANCZOS)
    out = Image.new("L", (CELL, CELL), 0)
    off = (CELL - target) // 2
    out.paste(img, (off, off))
    return np.asarray(out, dtype=np.float32) / 255.0


def european_variant(cell, digit, rng):
    """Add a crossed 7 or a based 1.

    MNIST is US-collected and badly under-represents both, which is exactly the
    systematic failure a Belgian puzzle would trigger.
    """
    ys, xs = np.nonzero(cell > 0.4)
    if not len(ys):
        return cell
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    img = Image.fromarray((cell * 255).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    stroke = max(2, int(round(h * 0.07)))
    if digit == 7:
        y = y0 + h * rng.uniform(0.45, 0.60)
        cx = x0 + w * rng.uniform(0.45, 0.62)
        half = w * rng.uniform(0.26, 0.38)
        draw.line([(cx - half, y), (cx + half, y)], fill=255, width=stroke)
    elif digit == 1:
        cx = x0 + w / 2
        half = max(w * rng.uniform(0.5, 0.9), h * 0.12)
        draw.line([(cx - half, y1), (cx + half, y1)], fill=255, width=stroke)
    return np.asarray(img, dtype=np.float32) / 255.0


def shift(a, dy, dx, fill=0.0):
    """Translate with zero fill.

    np.roll wraps, which is wrong for every use here: a digit shifted off one edge
    reappears on the other, so a sample meant to show a fragment shows a whole
    digit again. That mislabels real digits as background and poisons training.
    """
    out = np.full_like(a, fill)
    h, w = a.shape
    ys0, ys1 = max(0, dy), min(h, h + dy)
    xs0, xs1 = max(0, dx), min(w, w + dx)
    if ys0 < ys1 and xs0 < xs1:
        out[ys0:ys1, xs0:xs1] = a[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def dilate(a):
    out = a.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out = np.maximum(out, shift(a, dy, dx))
    return out


def erode(a):
    out = a.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out = np.minimum(out, shift(a, dy, dx, fill=1.0))
    return out


def blur(a, radius):
    k = np.exp(-0.5 * (np.arange(-3, 4) / max(radius, 1e-3)) ** 2)
    k /= k.sum()
    out = np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 0, a)
    return np.apply_along_axis(lambda m: np.convolve(m, k, mode="same"), 1, out)


PLAUSIBLE_INK = (0.05, 0.32)      # digits; measured pipeline output averages 0.17
PLAUSIBLE_INK_BG = (0.03, 0.45)   # junk is allowed to be thinner or fatter


def augmented_bitmap(cell, rng, label):
    """Augment, normalise, and refuse to emit a sample that stopped being a digit.

    Without this guard the aggressive end of the augmentation quietly manufactures
    garbage with a confident label: erosion eats a thin stroke down to a few
    pixels, normalisation scales those few pixels up to fill the field, and the
    model is taught that a solid white square is a 5. The guard is expressed in
    mean ink because that is the same quantity measured off real pipeline output.
    """
    lo, hi = PLAUSIBLE_INK_BG if label == 0 else PLAUSIBLE_INK
    for attempt in range(4):
        bitmap = to_bitmap(augment(cell, rng, mild=attempt >= 2))
        if lo <= float(bitmap.mean()) <= hi:
            return bitmap
    return to_bitmap(cell)


def augment(cell, rng, mild=False):
    """Imitate what the pipeline's own output varies by - not generic image noise.

    Stroke thickness is the one that matters most: measured bitmaps out of the
    pipeline average 0.17 mean ink against MNIST's 0.131, and step 3 established
    that the threshold cannot fix that. So the model has to have met both.
    """
    img = Image.fromarray((np.clip(cell, 0, 1) * 255).astype(np.uint8))
    angle = rng.uniform(-10, 10)
    scale = rng.uniform(0.85, 1.15)
    shear = rng.uniform(-0.14, 0.14)
    img = img.rotate(angle, resample=Image.BILINEAR, fillcolor=0)
    centre = CELL / 2
    img = img.transform((CELL, CELL), Image.AFFINE,
                        (1 / scale, shear, centre * (1 - 1 / scale) - shear * centre,
                         0, 1 / scale, centre * (1 - 1 / scale)),
                        resample=Image.BILINEAR, fillcolor=0)
    out = np.asarray(img, dtype=np.float32) / 255.0

    if not mild:
        roll = rng.random()
        if roll < 0.30:
            out = dilate(out)
            if rng.random() < 0.25:
                out = dilate(out)
        elif roll < 0.42 and out.sum() > 90:
            # Only thin what is thick enough to survive it. Eroding an already
            # hairline stroke does not make it thinner, it deletes it.
            out = erode(out)

        if rng.random() < 0.35:
            out = blur(out, rng.uniform(0.5, 1.4))
    out = shift(out, int(rng.integers(-2, 3)), int(rng.integers(-2, 3)))
    if rng.random() < 0.30:
        out = out + rng.normal(0, rng.uniform(0.02, 0.10), out.shape)
    return np.clip(out, 0, 1)


def background_sample(rng, glyph_source):
    """Junk that survives the empty-cell filter: partial neighbours and line scraps.

    A model with nowhere to put junk confidently calls it a 1, so the class has to
    exist and has to be trained on the junk this pipeline actually leaks.
    """
    cell = np.zeros((CELL, CELL), dtype=np.float32)
    kind = rng.integers(0, 4)
    img = Image.fromarray((cell * 255).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    if kind == 0 and glyph_source is not None:
        # a neighbour's digit sliced by the cell boundary - a FRAGMENT, which is why
        # this must translate with zero fill rather than wrap
        piece = glyph_source()
        if piece is not None:
            amount = int(rng.integers(15, 27)) * (1 if rng.random() < 0.5 else -1)
            moved = (shift(piece, amount, 0) if rng.random() < 0.5
                     else shift(piece, 0, amount))
            # if the slice left almost nothing, it is an empty cell, not junk
            if moved.sum() > 0.15 * piece.sum():
                return np.clip(moved, 0, 1)
            return np.zeros_like(piece)
    if kind == 1:
        # a scrap of grid line: reaches an edge but not the opposite one
        thick = int(rng.integers(2, 5))
        if rng.random() < 0.5:
            y = int(rng.integers(2, CELL - 2))
            draw.line([(0, y), (rng.integers(CELL // 3, CELL - 3), y)], fill=255, width=thick)
        else:
            x = int(rng.integers(2, CELL - 2))
            draw.line([(x, 0), (x, rng.integers(CELL // 3, CELL - 3))], fill=255, width=thick)
    elif kind == 2:
        # a corner where two lines meet
        x = int(rng.integers(3, CELL - 3)); y = int(rng.integers(3, CELL - 3))
        thick = int(rng.integers(2, 5))
        draw.line([(x, y), (x + rng.integers(8, 20), y)], fill=255, width=thick)
        draw.line([(x, y), (x, y + rng.integers(8, 20))], fill=255, width=thick)
    else:
        # blobs, smudges, pencil marks
        for _ in range(int(rng.integers(1, 4))):
            x = int(rng.integers(4, CELL - 8)); y = int(rng.integers(4, CELL - 8))
            draw.ellipse([x, y, x + rng.integers(3, 11), y + rng.integers(3, 14)], fill=255)
    return np.asarray(img, dtype=np.float32) / 255.0


def to_bitmap(cell):
    """Cell-scale ink -> the 28x28 the model sees, via the runtime's own code."""
    return dp.normalize_from_image(cell, threshold=0.5)


# ------------------------------------------------------------- dataset assembly

def build(args):
    rng = np.random.default_rng(args.seed)
    print("fonts...")
    printed = system_fonts()
    hand = sorted(glob.glob(os.path.join(args.hand_fonts, "*.ttf"))) if args.hand_fonts else []
    hand = [p for p in hand if usable_for_digits(p)]
    # Hold out whole faces, not random samples: a model that has seen a font is not
    # being tested on unseen printing, and every real puzzle uses a font we lack.
    printed_test = printed[::5]
    printed_train = [p for p in printed if p not in printed_test]
    hand_test = hand[::4]
    hand_train = [p for p in hand if p not in hand_test]
    print("  printed: %d train / %d held out   handwriting: %d train / %d held out"
          % (len(printed_train), len(printed_test), len(hand_train), len(hand_test)))

    print("mnist...")
    xtr, ytr, xte, yte = fetch_mnist(args.cache_dir)
    keep = ytr > 0
    xtr, ytr = xtr[keep], ytr[keep]
    keep = yte > 0
    xte, yte = xte[keep], yte[keep]
    if args.limit:
        xtr, ytr = xtr[:args.limit], ytr[:args.limit]

    X, Y = [], []

    def add(cell, label):
        X.append((augmented_bitmap(cell, rng, label) * 255).astype(np.uint8))
        Y.append(label)

    print("building training set...")
    t0 = time.time()
    for i in range(len(xtr)):
        cell = mnist_to_cell(xtr[i], rng)
        digit = int(ytr[i])
        if digit in (1, 7) and rng.random() < 0.35:
            cell = european_variant(cell, digit, rng)
        add(cell, digit)
        if i % 12000 == 0 and i:
            print("  mnist %d/%d" % (i, len(xtr)))

    per_font = args.per_font
    for label_fonts, reps in ((printed_train, per_font), (hand_train, per_font * 3)):
        for path in label_fonts:
            for digit in range(1, 10):
                for _ in range(reps):
                    cell = render_glyph(path, digit, rng)
                    if cell is None:
                        continue
                    if digit in (1, 7) and rng.random() < 0.40:
                        cell = european_variant(cell, digit, rng)
                    add(cell, digit)

    glyph_pool = printed_train + hand_train

    def a_glyph():
        return render_glyph(glyph_pool[int(rng.integers(0, len(glyph_pool)))],
                            int(rng.integers(1, 10)), rng)

    for _ in range(args.background):
        add(background_sample(rng, a_glyph), 0)

    X = np.stack(X); Y = np.array(Y, dtype=np.int64)
    print("  %d training samples in %.0fs" % (len(X), time.time() - t0))

    print("building test set...")
    TX, TY = [], []

    def addt(cell, label):
        TX.append((augmented_bitmap(cell, rng, label) * 255).astype(np.uint8))
        TY.append(label)

    for i in range(len(xte)):
        addt(mnist_to_cell(xte[i], rng), int(yte[i]))
    for label_fonts, reps in ((printed_test, per_font), (hand_test, per_font * 3)):
        for path in label_fonts:
            for digit in range(1, 10):
                for _ in range(reps):
                    cell = render_glyph(path, digit, rng)
                    if cell is not None:
                        addt(cell, digit)
    for _ in range(args.background // 4):
        addt(background_sample(rng, a_glyph), 0)

    TX = np.stack(TX); TY = np.array(TY, dtype=np.int64)
    print("  %d test samples" % len(TX))
    print("  mean ink: train %.3f  test %.3f  (MNIST reference 0.131, pipeline ~0.17)"
          % (X.mean() / 255, TX.mean() / 255))
    return X, Y, TX, TY, len(printed_test), len(hand_test)


# ---------------------------------------------------------------------- model

def im2col(x, k, pad):
    n, c, h, w = x.shape
    xp = np.pad(x, ((0, 0), (0, 0), (pad, pad), (pad, pad)))
    cols = np.empty((n, c, k, k, h, w), dtype=x.dtype)
    for i in range(k):
        for j in range(k):
            cols[:, :, i, j] = xp[:, :, i:i + h, j:j + w]
    return cols.reshape(n, c * k * k, h * w)


def col2im(cols, shape, k, pad):
    n, c, h, w = shape
    cols = cols.reshape(n, c, k, k, h, w)
    xp = np.zeros((n, c, h + 2 * pad, w + 2 * pad), dtype=cols.dtype)
    for i in range(k):
        for j in range(k):
            xp[:, :, i:i + h, j:j + w] += cols[:, :, i, j]
    return xp[:, :, pad:pad + h, pad:pad + w]


class Net:
    """conv8 -> pool -> conv16 -> pool -> dense32 -> dense10, about 27k parameters."""

    def __init__(self, rng):
        def he(shape, fan_in):
            return (rng.standard_normal(shape) * math.sqrt(2.0 / fan_in)).astype(np.float32)
        self.p = {
            "w1": he((8, 9), 9), "b1": np.zeros(8, np.float32),
            "w2": he((16, 72), 72), "b2": np.zeros(16, np.float32),
            "w3": he((784, 32), 784), "b3": np.zeros(32, np.float32),
            "w4": he((32, CLASSES), 32), "b4": np.zeros(CLASSES, np.float32),
        }
        self.m = {k: np.zeros_like(v) for k, v in self.p.items()}
        self.v = {k: np.zeros_like(v) for k, v in self.p.items()}
        self.t = 0

    def forward(self, x, train=True):
        p, c = self.p, {}
        n = x.shape[0]
        c["x"] = x
        c["c1"] = im2col(x, 3, 1)
        a1 = np.einsum("of,nfp->nop", p["w1"], c["c1"]) + p["b1"][None, :, None]
        a1 = a1.reshape(n, 8, 28, 28)
        c["r1"] = a1 > 0
        h1 = np.maximum(a1, 0)
        # (n, 8, 14, 2, 14, 2) is (y block, y within, x block, x within); the
        # backward scatter wants (y block, x block, 2, 2), so transpose before
        # flattening the window. Reshaping without the transpose silently pairs
        # each output with the wrong four inputs.
        h1p = h1.reshape(n, 8, 14, 2, 14, 2).transpose(0, 1, 2, 4, 3, 5).reshape(n, 8, 14, 14, 4)
        c["p1arg"] = h1p.argmax(-1)
        h1 = h1p.max(-1)

        c["c2"] = im2col(h1, 3, 1)
        a2 = np.einsum("of,nfp->nop", p["w2"], c["c2"]) + p["b2"][None, :, None]
        a2 = a2.reshape(n, 16, 14, 14)
        c["r2"] = a2 > 0
        h2 = np.maximum(a2, 0)
        h2p = h2.reshape(n, 16, 7, 2, 7, 2).transpose(0, 1, 2, 4, 3, 5).reshape(n, 16, 7, 7, 4)
        c["p2arg"] = h2p.argmax(-1)
        h2 = h2p.max(-1)
        c["conv2in"] = (n, 8, 14, 14)   # conv2's INPUT, which is h1: 8 channels

        flat = h2.reshape(n, -1)
        c["flat"] = flat
        a3 = flat @ p["w3"] + p["b3"]
        c["r3"] = a3 > 0
        h3 = np.maximum(a3, 0)
        c["h3"] = h3
        logits = h3 @ p["w4"] + p["b4"]
        self.cache = c
        return logits

    def backward(self, logits, y):
        p, c = self.p, self.cache
        n = logits.shape[0]
        shift = logits - logits.max(1, keepdims=True)
        exp = np.exp(shift)
        prob = exp / exp.sum(1, keepdims=True)
        loss = -np.log(np.maximum(prob[np.arange(n), y], 1e-12)).mean()

        d = prob.copy()
        d[np.arange(n), y] -= 1
        d /= n
        g = {}
        g["w4"] = c["h3"].T @ d
        g["b4"] = d.sum(0)
        dh3 = (d @ p["w4"].T) * c["r3"]
        g["w3"] = c["flat"].T @ dh3
        g["b3"] = dh3.sum(0)
        dflat = (dh3 @ p["w3"].T).reshape(n, 16, 7, 7)

        dp2 = np.zeros((n, 16, 7, 7, 4), dflat.dtype)
        idx = c["p2arg"]
        np.put_along_axis(dp2, idx[..., None], dflat[..., None], axis=-1)
        dh2 = dp2.reshape(n, 16, 7, 7, 2, 2).transpose(0, 1, 2, 4, 3, 5).reshape(n, 16, 14, 14)
        dh2 = dh2 * c["r2"]
        da2 = dh2.reshape(n, 16, -1)
        g["w2"] = np.einsum("nop,nfp->of", da2, c["c2"])
        g["b2"] = da2.sum(axis=(0, 2))
        dcols2 = np.einsum("of,nop->nfp", p["w2"], da2)
        dh1 = col2im(dcols2, c["conv2in"], 3, 1)

        dp1 = np.zeros((n, 8, 14, 14, 4), dh1.dtype)
        idx = c["p1arg"]
        np.put_along_axis(dp1, idx[..., None], dh1.reshape(n, 8, 14, 14)[..., None], axis=-1)
        da1 = dp1.reshape(n, 8, 14, 14, 2, 2).transpose(0, 1, 2, 4, 3, 5).reshape(n, 8, 28, 28)
        da1 = (da1 * c["r1"]).reshape(n, 8, -1)
        g["w1"] = np.einsum("nop,nfp->of", da1, c["c1"])
        g["b1"] = da1.sum(axis=(0, 2))
        return loss, g

    def step(self, g, lr, b1=0.9, b2=0.999, eps=1e-8):
        self.t += 1
        for k in self.p:
            self.m[k] = b1 * self.m[k] + (1 - b1) * g[k]
            self.v[k] = b2 * self.v[k] + (1 - b2) * (g[k] ** 2)
            mh = self.m[k] / (1 - b1 ** self.t)
            vh = self.v[k] / (1 - b2 ** self.t)
            self.p[k] -= (lr * mh / (np.sqrt(vh) + eps)).astype(np.float32)

    def predict(self, x, batch=512):
        out = []
        for i in range(0, len(x), batch):
            out.append(self.forward(x[i:i + batch], train=False).argmax(1))
        return np.concatenate(out)


def dump_samples(X, Y, path, per_class=16, zoom=2):
    """A labelled contact sheet of the training data.

    Worth looking at before reading any accuracy number: the first version of this
    script mislabelled whole digits as background because a translation wrapped
    around, and no metric said so - the model just quietly learned the wrong thing.
    """
    from PIL import Image, ImageDraw
    rows = []
    for label in range(CLASSES):
        idx = np.flatnonzero(Y == label)[:per_class]
        rows.append((label, X[idx]))
    cell = 28 * zoom + 2
    sheet = Image.new("RGB", (per_class * cell + 40, len(rows) * cell + 4), (18, 18, 22))
    draw = ImageDraw.Draw(sheet)
    for r, (label, samples) in enumerate(rows):
        draw.text((6, r * cell + cell // 2 - 4),
                  "bg" if label == 0 else str(label), fill=(120, 220, 150))
        for c, sample in enumerate(samples):
            img = Image.fromarray(sample).resize((28 * zoom, 28 * zoom), Image.NEAREST)
            sheet.paste(img.convert("RGB"), (40 + c * cell, r * cell + 2))
    sheet.save(path)


def gradcheck(rng, tol=2e-3):
    """Compare the analytic gradient against a finite-difference one.

    A backward pass that is subtly wrong still trains - just to a worse place -
    so it will not announce itself in the loss curve. This is the only cheap way
    to know the derivatives are actually the derivatives.
    """
    net = Net(rng)
    # float64 throughout: at float32 the loss carries ~1e-7 relative noise, which
    # swamps a central difference of 2*eps*grad whenever the gradient is small.
    # Checking in float32 reports failures that are only the precision floor.
    net.p = {k: v.astype(np.float64) for k, v in net.p.items()}
    x = rng.random((4, 1, 28, 28))
    y = rng.integers(0, CLASSES, 4)
    loss, g = net.backward(net.forward(x), y)
    eps, worst, worst_name = 1e-5, 0.0, None
    for name in net.p:
        flat = net.p[name].reshape(-1)
        grad = g[name].reshape(-1)
        here = 0.0
        for idx in rng.choice(len(flat), min(12, len(flat)), replace=False):
            original = flat[idx]
            flat[idx] = original + eps
            up, _ = net.backward(net.forward(x), y)
            flat[idx] = original - eps
            down, _ = net.backward(net.forward(x), y)
            flat[idx] = original
            numeric = (up - down) / (2 * eps)
            scale = max(1e-9, abs(numeric) + abs(grad[idx]))
            here = max(here, abs(numeric - grad[idx]) / scale)
        print("  %-3s max relative error %.2e" % (name, here))
        if here > worst:
            worst, worst_name = here, name
    print("gradient check: largest relative error %.2e in %s  (%s)"
          % (worst, worst_name, "ok" if worst < tol else "FAILED"))
    return worst < tol


def accuracy(net, X, Y):
    return float((net.predict(X) == Y).mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", default=".cache")
    ap.add_argument("--hand-fonts", default="")
    ap.add_argument("--out", default="tools/digit-model.npz")
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=1.5e-3)
    ap.add_argument("--per-font", type=int, default=30)
    ap.add_argument("--background", type=int, default=9000)
    ap.add_argument("--limit", type=int, default=0, help="cap MNIST, for a smoke run")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--gradcheck", action="store_true", help="verify backprop and exit")
    ap.add_argument("--dump-samples", default="", help="write a labelled sample sheet PNG")
    args = ap.parse_args()

    if args.gradcheck:
        raise SystemExit(0 if gradcheck(np.random.default_rng(args.seed)) else 1)

    X, Y, TX, TY, n_pf, n_hf = build(args)

    if args.dump_samples:
        dump_samples(X, Y, args.dump_samples)
        print("wrote %s - check the labels before trusting any accuracy number" %
              args.dump_samples)
    Xf = (X.astype(np.float32) / 255.0).reshape(-1, 1, 28, 28)
    TXf = (TX.astype(np.float32) / 255.0).reshape(-1, 1, 28, 28)

    rng = np.random.default_rng(args.seed)
    net = Net(rng)
    steps = math.ceil(len(Xf) / args.batch)
    print("training: %d samples, %d steps/epoch, %d epochs" % (len(Xf), steps, args.epochs))

    for epoch in range(args.epochs):
        order = rng.permutation(len(Xf))
        lr = args.lr * (0.3 if epoch >= args.epochs * 0.7 else 1.0) \
                     * (0.3 if epoch >= args.epochs * 0.9 else 1.0)
        total, t0 = 0.0, time.time()
        for s in range(steps):
            idx = order[s * args.batch:(s + 1) * args.batch]
            if not len(idx):
                continue
            logits = net.forward(Xf[idx])
            loss, g = net.backward(logits, Y[idx])
            net.step(g, lr)
            total += loss
        print("  epoch %2d  loss %.4f  test %.4f  (%.0fs)"
              % (epoch + 1, total / steps, accuracy(net, TXf, TY), time.time() - t0))

    pred = net.predict(TXf)
    print("\nheld-out accuracy: %.4f  (fonts never seen: %d printed, %d handwriting)"
          % ((pred == TY).mean(), n_pf, n_hf))
    print("per class:")
    for k in range(CLASSES):
        m = TY == k
        if m.sum():
            name = "background" if k == 0 else str(k)
            print("  %-11s %5d samples  %.4f" % (name, m.sum(), (pred[m] == TY[m]).mean()))

    conf = np.zeros((CLASSES, CLASSES), int)
    for t, p_ in zip(TY, pred):
        conf[t, p_] += 1
    worst = sorted(((conf[i, j], i, j) for i in range(CLASSES) for j in range(CLASSES) if i != j),
                   reverse=True)[:6]
    print("top confusions (true -> predicted):")
    for count, i, j in worst:
        if count:
            print("  %s -> %s : %d" % ("bg" if i == 0 else i, "bg" if j == 0 else j, count))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    np.savez(args.out, **net.p)
    print("\nsaved %s" % args.out)


if __name__ == "__main__":
    main()
