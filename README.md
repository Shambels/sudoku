# sudoku

A sudoku solver, twice: `sudoku.py` on the command line and a dependency-free web
app (`index.html` + `sudoku.js`) that solves in the browser.

## Running it

- **Web** — open `index.html`. Type the clues, press `=>`.
- **Python** — `python3 sudoku.py`.

Both share the same approach: backtracking that stops at the first solution, with a
pre-flight check that reports contradictory clues instead of searching a board that
can never be solved.

## Reading a puzzle from a photo

Open `index.html`, then pick a photo, drop one on the page, or paste one. The grid fills
in, cells the reader is unsure about turn amber, and **Copy board** gives you an
81-character string you can paste into `sudoku.py`.

Find the grid, rectify it, cut 81 cells, classify each one — all in vanilla canvas JS with
a 37 KB embedded digit model, no runtime dependencies, still openable from `file://`.
About 130 ms per photo. `docs/photo-to-grid-plan.md` is the design and the measurements.

| | |
|---|---|
| `vision.js` | the whole pipeline: threshold, detect, warp, segment, classify |
| `sudoku.js` | the solver, plus photo import, uniqueness checking and solver-assisted repair |
| `test-vision.html` | scores the pipeline over every labelled fixture |
| `tools/make_synthetic_fixtures.py` | regenerates the 21 synthetic fixtures |
| `tools/label-fixture.html` | turns a real photo into a manifest entry |
| `tools/fixtures/` | the images, their ground truth, and [notes on their limits](tools/fixtures/README.md) |
| `digit-model.js` | the shipped classifier: int8 weights, ~27k parameters |
| `tools/digit_pipeline.py` | the Python mirror of the runtime's digit normalisation |
| `tools/train_digits.py` | trains the classifier (numpy only, no PyTorch) |
| `tools/export_weights.py` | quantises to int8 and writes `digit-model.js` |
| `tools/eval_on_fixtures.py` | scores a model on bitmaps cut from the fixture photos |

To run the harness, serve the folder rather than opening the file directly — Chrome
taints canvases for `file://` images, which stops the page reading fixture pixels:

```
python3 -m http.server
# then open http://localhost:8000/test-vision.html
```

(Opening it as a file still works; the page will offer a folder picker instead.)

### Retraining the classifier

Needs numpy and Pillow; no PyTorch, and nothing downloads at page load — the weights
are baked into `digit-model.js`.

```
python3 tools/digit_pipeline.py            # prove the Python normalisation matches vision.js
python3 tools/train_digits.py --gradcheck  # prove the hand-written backprop is correct
python3 tools/train_digits.py --cache-dir .cache --hand-fonts .cache/fonts \
        --dump-samples samples.png         # look at samples.png before trusting any number
python3 tools/export_weights.py            # -> digit-model.js
```

Then open `test-vision.html`, press **Download bitmaps JSON**, and score the model on
cells cut from the real photos rather than on synthetic glyphs:

```
python3 tools/eval_on_fixtures.py --bitmaps ~/Downloads/fixture-bitmaps.json
```
