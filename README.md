# sudoku

A sudoku solver, twice: `sudoku.py` on the command line and a dependency-free web
app (`index.html` + `sudoku.js`) that solves in the browser.

## Running it

- **Web** — open `index.html`. Type the clues, press `=>`.
- **Python** — `python3 sudoku.py`.

Both share the same approach: backtracking that stops at the first solution, with a
pre-flight check that reports contradictory clues instead of searching a board that
can never be solved.

## Reading a puzzle from a photo (in progress)

`docs/photo-to-grid-plan.md` is the design: find the grid, rectify it, cut 81 cells,
classify each one — all in vanilla canvas JS with a ~30 KB embedded digit model, no
runtime dependencies, still openable from `file://`.

Built so far:

| | |
|---|---|
| `vision.js` | the pipeline's API and plumbing; the stages are stubs until step 2 |
| `test-vision.html` | scores the pipeline over every labelled fixture |
| `tools/make_synthetic_fixtures.py` | regenerates the 21 synthetic fixtures |
| `tools/label-fixture.html` | turns a real photo into a manifest entry |
| `tools/fixtures/` | the images, their ground truth, and [notes on their limits](tools/fixtures/README.md) |

To run the harness, serve the folder rather than opening the file directly — Chrome
taints canvases for `file://` images, which stops the page reading fixture pixels:

```
python3 -m http.server
# then open http://localhost:8000/test-vision.html
```

(Opening it as a file still works; the page will offer a folder picker instead.)
