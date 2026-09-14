#!/usr/bin/env python3
"""Score the trained model on the bitmaps the pipeline actually extracts.

The held-out split inside train_digits.py is synthetic: rendered glyphs and
augmented MNIST. This script scores the model on cells cut out of the fixture
photos by vision.js itself, which is the only number that reflects the whole
chain - detection, warp, threshold, segmentation and normalisation included.

Get the input by opening test-vision.html and pressing "Download bitmaps JSON".

Usage:
  python3 tools/eval_on_fixtures.py --bitmaps ~/Downloads/fixture-bitmaps.json \
                                    --model tools/digit-model.npz
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train_digits import Net, CLASSES


def load_model(path):
    data = np.load(path)
    net = Net(np.random.default_rng(0))
    for k in net.p:
        net.p[k] = data[k]
    return net


def quantised(net):
    """The model as it will actually ship: int8 weights, dequantised back."""
    import copy
    q = copy.deepcopy(net)
    for name in ("w1", "w2", "w3", "w4"):
        t = q.p[name]
        peak = float(np.abs(t).max()) or 1.0
        scale = peak / 127.0
        q.p[name] = (np.clip(np.rint(t / scale), -127, 127) * scale).astype(np.float32)
    return q


def report(title, net, X, Y, files):
    pred = net.predict(X)
    acc = float((pred == Y).mean())
    print("\n%s" % title)
    print("  cells %d   accuracy %.4f   wrong %d" % (len(Y), acc, int((pred != Y).sum())))
    per_file = {}
    for f, t, p in zip(files, Y, pred):
        per_file.setdefault(f, [0, 0])
        per_file[f][0] += 1
        if t != p:
            per_file[f][1] += 1
    perfect = sum(1 for v in per_file.values() if v[1] == 0)
    print("  grids read with zero wrong cells: %d / %d" % (perfect, len(per_file)))
    bad = sorted(((v[1], k, v[0]) for k, v in per_file.items()), reverse=True)[:6]
    for wrong, name, total in bad:
        if wrong:
            print("    %-34s %d/%d wrong" % (name, wrong, total))
    conf = np.zeros((CLASSES, CLASSES), int)
    for t, p in zip(Y, pred):
        conf[t, p] += 1
    worst = sorted(((conf[i, j], i, j) for i in range(CLASSES)
                    for j in range(CLASSES) if i != j), reverse=True)[:5]
    shown = [("%s->%s:%d" % ("bg" if i == 0 else i, "bg" if j == 0 else j, c))
             for c, i, j in worst if c]
    if shown:
        print("  confusions  " + "  ".join(shown))
    return acc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bitmaps", required=True)
    ap.add_argument("--model", default="tools/digit-model.npz")
    args = ap.parse_args()

    cells = json.load(open(args.bitmaps))
    X = np.array([c["bitmap"] for c in cells], np.float32).reshape(-1, 1, 28, 28) / 255.0
    Y = np.array([c["truth"] for c in cells], np.int64)
    files = [c["file"] for c in cells]
    print("loaded %d cells from %d fixtures" % (len(cells), len(set(files))))

    net = load_model(args.model)
    float_acc = report("float32 weights", net, X, Y, files)
    int8_acc = report("int8 weights (what ships)", quantised(net), X, Y, files)
    print("\nquantisation cost: %.4f accuracy (%.2f percentage points)"
          % (float_acc - int8_acc, 100 * (float_acc - int8_acc)))


if __name__ == "__main__":
    main()
