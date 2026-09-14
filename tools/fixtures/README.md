# Vision fixtures

Labelled images for `test-vision.html`, the harness that scores the photo → grid
pipeline. The ruler exists before the thing it measures: every threshold in
`docs/photo-to-grid-plan.md` §2 is otherwise guesswork.

## Manifest

`manifest.js` is the single source of truth. It is a `.js` file rather than `.json`
on purpose — a `<script>` tag loads from `file://`, whereas `fetch()` of a local
`.json` is blocked by Chrome.

```js
window.SUDOKU_FIXTURES = [
  {
    "file": "syn-06-perspective-mild-a.jpg",
    "board": "..3.7..1.9...", // 81 chars, row-major, '.' = empty
    "corners": [[71,88],[980,74],[995,1010],[60,996]], // TL, TR, BR, BL - optional
    "tags": ["synthetic", "print", "perspective"],
    "notes": ""
  }
]
```

`corners` is optional but worth having: it lets grid detection (§2.3) be scored
directly as a corner error in pixels, instead of only end to end where a detection
bug and a classifier bug look the same.

## Synthetic fixtures

`python3 tools/make_synthetic_fixtures.py` regenerates the 21 `syn-*.jpg` files and
rewrites their manifest entries. It **preserves** any entry not tagged `synthetic`,
so real-photo entries survive a regeneration. It is deterministic — same `--seed`,
same images — so a score change means a code change, not a fixture change.

Covered: clean screenshots, dark-mode (inverted) screenshots, flat scans, mild and
strong perspective, rotation up to 16°, soft shadows, blur, low contrast, page curl,
a book gutter, heavy JPEG noise, and three pseudo-handwriting boards.

### What synthetic fixtures do not give you

- **The "handwriting" fixtures are not handwriting.** They are printed glyphs with
  per-digit rotation, shear, stroke-thickness and position jitter, plus a crossed 7
  and a based 1. That exercises slant and stroke variation; it does not exercise
  letterform variation, which is the thing a real hand actually varies. Treat those
  three scores as a smoke test, not as evidence the model reads handwriting.
- **No real sensor noise, no real optics.** No rolling shutter, no chromatic
  aberration, no autofocus miss, no specular glare off a glossy page.
- **No real paper.** No newsprint show-through from the reverse side, no staples,
  no coffee, no puzzle-book bindings that curve in two axes at once.

So: tune on the synthetic set, but **trust only the real one**. A pipeline that
scores 100 % here and 60 % on photos is the expected failure, not a surprise.

## Adding real photos

**Store the original bytes. Do not re-encode.** Re-saving a photo as JPEG changes what
the pipeline sees, and on faint content it changes the answer: re-encoding
`real-02` at quality 88 turns erased-pencil ghosting into false ink and costs two cells;
at quality 60 it costs eleven. `real-01` is kept as the webp it arrived as, even though a
JPEG copy of it happens to read one cell *better* - picking the copy that scores well is
measuring the wrong thing.

1. Drop the image in this folder, in whatever format it arrived. Name it
   `real-NN-something.<ext>`; browsers decode webp, png and jpeg alike.
2. Open `tools/label-fixture.html`, load the image, type the 81 clues, optionally
   click the four grid corners, and copy the generated manifest entry.
3. Paste it into the array in `manifest.js`, anywhere before the synthetic block.

### What real photos have already caught

Two of them, between them, found more than the whole synthetic set:

- **Uneven grid spacing** (`real-01`). Every generated fixture draws its lines on exact
  ninths; a hand-drawn grid does not, and the rightmost column was 1.5x the narrowest.
  Independent per-line snapping could not find lines that far from nominal and silently
  fell back to the nominal position, shifting whole rows sideways. 17 wrong cells.
- **Thin margins on faint content** (`real-02`). Erased pencil and printed ghosting sit
  close enough to the ink threshold that a mild re-encode flips cells.

Aim for 15–20 real photos and bias them toward the cases that break things:
a shot at 30°, one lit by a single lamp, one from a curved puzzle book, one of a
screen, one slightly out of focus, one where the grid touches the frame edge.
Boring, well-lit, flat photos teach the tuner nothing.

## Note on `syn-01`

Its grid sits ~9 px from the frame edge. That is deliberate — a grid that touches
the border is a real case and it breaks naive "largest blob" detection that assumes
a background margin. If it ever becomes the only failing fixture, fix the detector
rather than the fixture.
