#!/usr/bin/env python3
"""The Python mirror of vision.js's digit normalisation (plan 2.6).

Training data has to go through exactly the same normalisation as the runtime, or
the model meets a different distribution at test time than it trained on. Rather
than trusting that two implementations agree, `python3 tools/digit_pipeline.py`
runs a parity check against the real vision.js through node and reports the
largest disagreement. Keep that at zero.

Requires numpy. The parity check additionally needs node.
"""

import json
import math
import os
import subprocess
import sys
import tempfile

import numpy as np

DIGIT_BOX = 20      # opts.digitBox  - the digit's longer side
CANVAS_BOX = 28     # opts.canvasBox - the field it is centred in


def js_round(x):
    """JavaScript's Math.round: half always goes up, including for negatives.

    Python's round() is banker's rounding (round-half-to-even), so round(0.5) is 0
    and round(2.5) is 2. Using it here would shift roughly half the digits by a
    pixel relative to the runtime - a silent train/test mismatch.
    """
    return math.floor(x + 0.5)


def _area_resize_reference(mask, w, h, bbox, nw, nh):
    """Literal transcription of areaResize() in vision.js - the readable one.

    Kept as the definition of correct. area_resize() below computes the same sums
    with an integral image so that building 150k training samples does not take
    an afternoon; the parity check exercises the fast path against the real JS.
    """
    bx, by, bw, bh = bbox
    out = np.zeros((nh, nw), dtype=np.float32)
    sx_step, sy_step = bw / nw, bh / nh
    for oy in range(nh):
        y0 = math.floor(by + oy * sy_step)
        y1 = max(y0 + 1, math.ceil(by + (oy + 1) * sy_step))
        for ox in range(nw):
            x0 = math.floor(bx + ox * sx_step)
            x1 = max(x0 + 1, math.ceil(bx + (ox + 1) * sx_step))
            total = 0.0
            count = 0
            for y in range(y0, min(y1, h)):
                for x in range(x0, min(x1, w)):
                    total += mask[y * w + x]
                    count += 1
            out[oy, ox] = total / count if count else 0.0
    return out


def area_resize(mask, w, h, bbox, nw, nh):
    """Box filter over the same footprints, via an integral image.

    Averaging the source footprint is what turns a hard mask into the soft grey
    strokes MNIST digits have; nearest-neighbour would give aliased edges the model
    never sees at run time. Sums are accumulated in float64 so the result matches
    the reference implementation bit for bit at float32.
    """
    bx, by, bw, bh = bbox
    grid = np.asarray(mask, dtype=np.float64).reshape(h, w)
    integral = np.zeros((h + 1, w + 1), dtype=np.float64)
    np.cumsum(np.cumsum(grid, axis=0), axis=1, out=integral[1:, 1:])

    ox = np.arange(nw)
    oy = np.arange(nh)
    x0 = np.floor(bx + ox * (bw / nw)).astype(np.int64)
    x1 = np.maximum(x0 + 1, np.ceil(bx + (ox + 1) * (bw / nw)).astype(np.int64))
    y0 = np.floor(by + oy * (bh / nh)).astype(np.int64)
    y1 = np.maximum(y0 + 1, np.ceil(by + (oy + 1) * (bh / nh)).astype(np.int64))
    # the JS loops stop at the array edge, which caps the footprint but not its start
    x1 = np.minimum(x1, w)
    y1 = np.minimum(y1, h)

    xs0, xs1 = x0[None, :], x1[None, :]
    ys0, ys1 = y0[:, None], y1[:, None]
    total = (integral[ys1, xs1] - integral[ys0, xs1]
             - integral[ys1, xs0] + integral[ys0, xs0])
    count = np.maximum(0, ys1 - ys0) * np.maximum(0, xs1 - xs0)
    out = np.zeros((nh, nw), dtype=np.float64)
    np.divide(total, count, out=out, where=count > 0)
    return out.astype(np.float32)


def normalize_digit(mask, w, h, bbox, digit_box=DIGIT_BOX, canvas_box=CANVAS_BOX):
    """Mirror of normalizeDigit() in vision.js. Returns a (28, 28) float array."""
    bx, by, bw, bh = bbox
    scale = digit_box / max(bw, bh)
    nw = max(1, js_round(bw * scale))
    nh = max(1, js_round(bh * scale))
    small = area_resize(mask, w, h, bbox, nw, nh)

    total = float(small.sum())
    if total:
        ys, xs = np.mgrid[0:nh, 0:nw]
        com_x = float((xs * small).sum()) / total
        com_y = float((ys * small).sum()) / total
    else:
        com_x, com_y = nw / 2, nh / 2

    centre = (canvas_box - 1) / 2
    off_x = js_round(centre - com_x)
    off_y = js_round(centre - com_y)

    out = np.zeros((canvas_box, canvas_box), dtype=np.float32)
    for y in range(nh):
        ty = y + off_y
        if ty < 0 or ty >= canvas_box:
            continue
        for x in range(nw):
            tx = x + off_x
            if tx < 0 or tx >= canvas_box:
                continue
            out[ty, tx] = small[y, x]
    return out


def normalize_from_image(img, threshold=0.5):
    """Convenience: a 2-D array of ink in 0..1 -> the normalised 28x28 bitmap.

    Crops to the ink's bounding box first, exactly as the runtime crops to the
    digit component's bounding box.
    """
    ink = (np.asarray(img, dtype=np.float32) > threshold).astype(np.float32)
    ys, xs = np.nonzero(ink)
    if not len(ys):
        return np.zeros((CANVAS_BOX, CANVAS_BOX), dtype=np.float32)
    bbox = (int(xs.min()), int(ys.min()),
            int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
    h, w = ink.shape
    return normalize_digit(ink.reshape(-1), w, h, bbox)


# ----------------------------------------------------------------- parity check

PARITY_JS = r"""
global.document = { createElement: function () {
  return { width: 0, height: 0, getContext: function () {
    return { createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
             putImageData: function () {} }; } };
} };
var V = require(process.argv[2]);
var cases = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8'));
var out = cases.map(function (c) {
  var bm = V.stages.normalizeDigit(Float32Array.from(c.mask), c.w, c.h,
    { x: c.bbox[0], y: c.bbox[1], w: c.bbox[2], h: c.bbox[3] }, V.defaults);
  return Array.from(bm);
});
process.stdout.write(JSON.stringify(out));
"""


def check_parity(vision_js, trials=40, seed=3):
    rng = np.random.default_rng(seed)
    cases = []
    for _ in range(trials):
        w = int(rng.integers(18, 46))
        h = int(rng.integers(18, 46))
        mask = np.zeros((h, w), dtype=np.float32)
        # a few random blobs, then crop to their bounding box
        for _ in range(int(rng.integers(1, 4))):
            x0 = int(rng.integers(0, w - 4)); y0 = int(rng.integers(0, h - 6))
            mask[y0:y0 + int(rng.integers(4, h - y0)),
                 x0:x0 + int(rng.integers(3, w - x0))] = 1
        ys, xs = np.nonzero(mask)
        bbox = (int(xs.min()), int(ys.min()),
                int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
        cases.append({"mask": mask.reshape(-1).tolist(), "w": w, "h": h, "bbox": list(bbox)})

    with tempfile.TemporaryDirectory() as tmp:
        script = os.path.join(tmp, "parity.js")
        payload = os.path.join(tmp, "cases.json")
        open(script, "w").write(PARITY_JS)
        json.dump(cases, open(payload, "w"))
        proc = subprocess.run(["node", script, os.path.abspath(vision_js), payload],
                              capture_output=True, text=True)
    if proc.returncode:
        raise SystemExit("node failed:\n" + proc.stderr)

    js = np.array(json.loads(proc.stdout), dtype=np.float32)
    worst = 0.0
    for i, c in enumerate(cases):
        mine = normalize_digit(np.array(c["mask"], dtype=np.float32),
                               c["w"], c["h"], tuple(c["bbox"]))
        worst = max(worst, float(np.abs(mine.reshape(-1) - js[i]).max()))
    return worst, len(cases)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    vision = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, os.pardir, "vision.js")
    worst, n = check_parity(vision)
    print("normalisation parity vs vision.js over %d random masks:" % n)
    print("  largest per-pixel difference: %.10f" % worst)
    if worst > 1e-6:
        raise SystemExit("MISMATCH - training data would not match what the runtime produces")
    print("  OK - the Python mirror and vision.js agree exactly")
