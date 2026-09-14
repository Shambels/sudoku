# Photo → Sudoku grid: implementation plan

**Decided constraints**: browser-only (extends the existing static `index.html`), printed **and**
handwritten digits, **zero runtime dependencies**, and the result prefills the editable grid with
low-confidence cells flagged rather than auto-solving.

---

## 1. Why this shape

A photo→grid pipeline is four separable problems: *find the grid*, *rectify it*, *cut 81 cells*,
*classify each cell*. Only the last one needs learning. Hand-writing the first three in plain
canvas JS is roughly 400 lines and removes the only reason people reach for opencv.js (8 MB of
wasm to do four things we can do in a page of code each). The learned part is a ~30 KB CNN whose
weights are embedded as a JS literal — trained offline in Python, shipped as data.

Rejected alternatives:

| Option | Why not |
|---|---|
| tesseract.js | 15 MB+, trained for words in lines; on isolated glyphs it is *worse* than a 30 KB digit CNN and far slower. |
| opencv.js | 8 MB wasm for threshold + contours + warpPerspective. Those are ~150 lines of JS. |
| Cloud vision API | Needs a key, a proxy to hide it, network, and sends photos off-device. Kills the "open index.html and it works" property. |
| Template matching only | Near-perfect on screenshots, falls apart on handwriting — which is in scope. |
| Hough transform for grid lines | More code and more parameters to tune than the largest-blob approach, and no better on phone photos. |

The accuracy strategy is deliberately **not** "make the classifier perfect". It is: a good-enough
classifier + three cheap verification layers that already exist or nearly exist in this repo
(rule conflicts, solvability, human confirmation). See §5 — that is where the real accuracy comes
from.

---

## 2. Pipeline

All steps run on the main thread on a canvas. No Web Worker: Chrome refuses to spawn workers from
`file://`, and the repo is meant to open as a plain file. Total budget ≈ 100–200 ms.

**2.0 Input.** `<input type="file" accept="image/*" capture="environment">` plus paste
(`ClipboardEvent`) and drag-drop. Read the `File` with `FileReader.readAsDataURL` and set it as
`img.src`. *Not* `URL.createObjectURL`: on a `file://` page a blob URL has an opaque origin and
`getImageData` can throw a security error. Data URLs never taint the canvas.

**2.1 Downscale + grayscale.** Draw with the longest side capped at 1024 px. Luma = 0.299R +
0.587G + 0.114B into a `Uint8ClampedArray`. Everything downstream is single-channel.

**2.2 Adaptive threshold** (Bradley–Roth, integral image). Global Otsu fails on any photo with a
shadow or a page curl, which is the normal case for a phone shot of a newspaper. Integral-image
adaptive mean is O(n) with a tiny constant: window ≈ width/12 (odd), pixel is ink if it is below
92 % of its window mean. ~40 lines.

**2.3 Find the grid.** The 9×9 border and its lines form one large connected component. Union-find
(or iterative flood fill) over the binary image, take the component with the largest pixel count
whose bounding box covers >15 % of the frame, then take its four corners as the extremes of
`x+y` (TL/BR) and `x−y` (TR/BL). ~100 lines, no trigonometry.
Sanity gate: the quad must be convex, each side >20 % of the image, and the aspect ratio within
0.6–1.7. If it fails, fall back to the full image rectangle — which is exactly right for an
already-cropped screenshot — and if the fallback also produces garbage, show "couldn't find the
grid" rather than a wrong board.

**2.4 Perspective warp.** Solve the 8×8 linear system for the homography from the detected quad to
a 432×432 square (9 × 48 px cells) by Gaussian elimination, then inverse-map each destination pixel
with bilinear sampling. Homography, not affine: a phone photo has real perspective, and an
affine-only deskew leaves the far row of cells trapezoidal.
Warp the **grayscale**, then re-threshold the warped image. Warping a binary image resamples hard
edges into mush; thresholding after the resample is both cheaper and cleaner.

**2.5 Cut 81 cells.** Each 48×48 cell, inset 12 % per side to drop grid lines. Inside the inset
region, run connected components again and keep the one that overlaps the central 50 % box;
discard components touching the cell border (grid-line remnants and neighbours' ink bleeding in).
Empty if the surviving component has <3 % of the cell's pixels or its bounding box is under ~6 px.
Component-based rather than a raw ink-count threshold — a raw count calls a thick grid line a 1 and
a faint pencil 7 an empty.

**2.6 Normalize to 28×28, MNIST-style.** Crop to the digit's bounding box, scale the longer side to
20 px preserving aspect, then place it in a 28×28 field centred on its **centre of mass**. This is
precisely how MNIST was built; matching it at test time is what makes MNIST-trained weights
actually transfer. Skipping this step is the most common reason these projects report 70 %
accuracy.

---

## 3. The classifier

**Architecture** (hand-written forward pass, ~120 lines: conv / ReLU / maxpool / dense / softmax):

```
28×28×1 → conv3×3×8  → ReLU → maxpool2
       → conv3×3×16 → ReLU → maxpool2
       → flatten(784) → dense 32 → ReLU → dense 10 → softmax
```

≈ 27 k parameters: ~107 KB as float32, **~30 KB quantized to int8** (per-tensor scale, dequantize
at load — 10 lines). Embedded as a base64 string in `digit-model.js`. 81 forward passes ≈ 2–5 ms.

Why a CNN and not an MLP: a 784→32→10 MLP is the same parameter count but tops out near 97–98 % on
MNIST versus ~99.3 % for this CNN, because convolution encodes the translation prior that a dense
layer has to learn from data. Per-cell that gap looks small; across ~30 clues it is the difference
between ~45 % and ~85 % of grids read perfectly.

**10 classes, not 9**: digits 1–9 plus a `background` class trained on grid-line fragments, dust,
and blank crops. The §2.5 ink rule will occasionally hand the model junk; a model with nowhere to
put junk confidently calls it a 1.

**Training data is the real lever**, more than the architecture:
- MNIST (60 k) for handwriting.
- Synthetic printed digits: render 1–9 in ~30 system fonts (DejaVu, Liberation, Arial, Times,
  Verdana, Courier, a few condensed/serif puzzle-book faces) — a few thousand samples.
- Augment both: rotation ±10°, scale 0.85–1.15, shear ±8°, stroke thickness via
  dilate/erode, Gaussian blur, salt noise, and random 1–2 px translation. The augmentation
  distribution should imitate §2.6's output, not generic images.
- **European handwriting matters here**: MNIST is US-collected and under-represents the crossed 7
  and the hooked/serifed 1 that are standard in Belgium and France. Add a few hundred
  hand-labelled samples from your own fixture photos, plus synthetic crossed-7s. This single fix
  removes the most likely systematic failure.

Offline in PyTorch (`tools/train_digits.py`), exported by `tools/export_weights.py`. These are dev
dependencies; nothing ships to the page.

**Test-time augmentation** (optional, ~3× a 3 ms cost): classify each cell at 0° and ±6° and
average the softmax. Measurably steadies digits left slightly skewed by imperfect corner detection.

---

## 4. Confidence

Per cell, keep `p_top1` and `margin = p_top1 − p_top2`. Flag when `p_top1 < 0.90` or
`margin < 0.30` (tune on fixtures). Also keep each cell's top-2 candidates — §5 needs them.

---

## 5. Verification — where the accuracy actually comes from

Three layers, all nearly free because the repo already has the pieces:

1. **Rule conflicts.** Run the existing `findConflicts(grid)` on the extracted board. A misread
   digit very often duplicates a value in its row, column or box. Union those cells into the
   flagged set. Zero new code.
2. **Solver-assisted repair.** If the board has conflicts or no solution, take the *k* lowest-confidence
   cells (k ≤ 4) and search their top-2 candidates — ≤ 16 boards, each solved in milliseconds.
   If exactly one combination yields a solvable board, adopt it silently; if several do, flag them
   all and let the user pick. This needs one small addition to `sudoku.js`: a `countSolutions(grid, 2)`
   that stops at two, so "unique solution" is checkable. This is the highest-leverage item in the
   whole plan — it converts per-cell accuracy into near-perfect grid accuracy.
3. **The human.** Flagged cells render amber and the grid is editable, which it already is. One
   glance at three amber cells beats any amount of model tuning.

---

## 6. UI

- Upload / paste / drop zone above the puzzle grid; a small preview of the **warped** grid so a bad
  detection is obvious at a glance.
- Extracted digits fill the existing inputs. `.uncertain` class = amber background; the existing
  `.conflict` red stays as-is. Clicking an amber cell clears the flag.
- A one-line status: "Read 28 clues, 3 uncertain — check the highlighted cells."
- A "copy as Python board" button emitting an 81-character string, so the same puzzle can go into
  `sudoku.py`. That needs a tiny `parseBoard("...")` helper in `sudoku.py` to replace the 81
  hard-coded assignments in `main()` — worth doing regardless.

---

## 7. Files

```
index.html          + upload UI, preview canvas
style.css           + .uncertain, dropzone
vision.js     (new) image → {grid, confidences, warpedCanvas}   ~450 lines
digit-model.js(new) embedded int8 weights + forward pass        ~150 lines
sudoku.js           + wiring, countSolutions(), repair search
sudoku.py           + parseBoard(str)
tools/train_digits.py     (dev only)
tools/export_weights.py   (dev only)
tools/fixtures/           labelled test photos + expected boards
test-vision.html    (new) runs the pipeline over fixtures, reports per-cell and per-grid accuracy
```

Added page weight: ~30 KB model + ~20 KB JS. Still opens from `file://` with no build step.

---

## 8. Build order

1. `test-vision.html` + 15–20 labelled fixture photos (hard cases: shadow, angle, page curl, thick
   book gutter, handwriting, screenshot). Build the ruler before the thing it measures — every
   threshold in §2 is otherwise guesswork.
2. §2.1–2.4 with the warped preview as the visual check.
3. §2.5–2.6 cell cutting and empty detection, scored as a binary empty/non-empty task on fixtures.
   Target >99.5 % — errors here are unrecoverable downstream.
4. Train and export the model; validate in Python first.
5. JS inference + confidence; per-cell accuracy on fixtures.
6. UI integration, conflicts, solver repair; per-grid accuracy on fixtures.
7. Tune thresholds against the harness.

Realistic target: ~99 % per cell, and with §5 well over 95 % of grids correct with at most a
couple of amber cells to confirm.

---

## Findings from step 2

Three things the fixtures taught us that the plan did not anticipate:

1. **Auto-polarity closes the dark-mode gap for free.** §2.2 assumed dark ink on light
   paper. A light-on-dark screenshot thresholds to ~90 % ink, and the largest blob becomes
   the whole background. Three lines — if the ink fraction exceeds 35 %, invert — bring
   `syn-03-screenshot-inverted` in at 1.7 px, the same as everything else. The polarity
   flag has to be applied again when the *warped* image is thresholded in §2.5; the warp
   carries the original grayscale, so it is still light-on-dark at that point.

2. **A homography cannot flatten a curled page.** It fits four corners exactly, so the
   corner error on `syn-16-page-curl` is a misleading 0.9 px while the interior lines still
   bow by roughly a quarter of a cell. Fixed 1/9 cell splitting will therefore drift out of
   alignment in the middle rows. §2.5 should not assume even divisions: project the warped
   ink onto rows and columns, find the ten strongest lines in each direction, and cut on
   those. The two curl fixtures are the ones that will prove whether it is needed.

3. **A full-frame fallback must require evidence.** As first written it fired whenever
   detection failed, which meant "couldn't find the grid" could never be reported — a blank
   page came back as a confident quad. It now falls back only when a large blob was found
   *and* rejected by the sanity gate; with no blob at all the extraction fails honestly.

## Findings from step 3

1. **Polarity must be decided on the grayscale, never on the binary image.** Flipping
   after thresholding produced 51 false digits in one fixture: on a light-on-dark image
   the local mean around each bright line inks a halo either side of it, leaving an
   untouched island in the middle of every cell that becomes a convincing fake digit once
   flipped. Deciding from the share of above-mean pixels instead separates cleanly —
   normal fixtures never fall below 0.53, the dark-mode one reads 0.09, so the 0.30
   default has about 4x margin either way. It also improved that fixture's corner error.

2. **Ink area is the wrong test for "is this cell empty".** Every miss was a 1 or a 7
   inking 2.0–3.0 % of its cell against a 3 % floor — the two thinnest glyphs, dropped by
   the very rule meant to protect them. Height is the right discriminator: every digit
   from 1 to 9 stands near full cell height, and no speck does. Swapping the test moved
   18 misses to zero.

3. **Tightening the threshold does not thin strokes, it breaks them.** Swept 0.78–0.96
   against counter survival in 4/6/8/9: survival *falls* from 96 % to 63 % as the bias
   tightens, because a broken loop lets its counter leak into the background. The default
   was already near optimal; the lesson is that stroke thickness is not fixable at the
   threshold.

4. **Bitmaps run thicker than MNIST — mean ink 0.17 against MNIST's 0.131.** Since (3)
   rules out fixing it by threshold, the dilate/erode thickness augmentation in §3 is not
   optional; without it, MNIST-trained weights will meet systematically fatter strokes
   than they were trained on.

5. **The synthetic set has stopped discriminating.** Occupancy is 100 % and detection is
   at the ~1 px floor, so further tuning against it would be fitting noise — the blur
   fixture's counters swung on a sample of 14 digits. Real photos are now the blocking
   input, not more code.

6. **A fixture bug wore the costume of a pipeline bug.** Two handwriting "7"s normalised
   to a flat bar. The pipeline was faithful; the generator had drawn the crossbar 2.2x
   wider than the glyph was tall. Worth remembering that when the ruler is also code,
   a bad measurement is as likely as a bad result.

## Findings from step 4

1. **No PyTorch.** The net is 27k parameters; numpy with im2col trains it in ~12 minutes
   on a CPU. That keeps `tools/train_digits.py` runnable without a multi-gigabyte install,
   in the same spirit as the runtime. If the architecture outgrows this, switch frameworks
   rather than scaling the numpy up.

2. **Two parity checks guard the seams.** `tools/digit_pipeline.py` runs the Python
   normalisation against the real vision.js through node (difference: exactly 0), and the
   export is checked by decoding `digit-model.js` back in node and comparing to what
   Python quantised (4.9e-7, pure float32 rounding). Both seams would otherwise fail
   silently and look like a bad model.

3. **`--gradcheck` earned its place immediately.** It failed at 1.6e-1 on the first run and
   caught a maxpool whose argmax was computed on a reshape with the wrong axis order, so
   the backward pass scattered gradients to the wrong inputs. It also taught a second
   lesson: the check has to run in float64, because at float32 the loss carries ~1e-7
   relative noise that swamps a central difference and reports failures that are only the
   precision floor.

4. **Look at the training data before believing any accuracy number.** Two bugs were
   invisible in the loss curve and obvious in a labelled contact sheet: `np.roll` wrapped a
   digit around the frame instead of slicing it, so whole digits were labelled
   "background"; and unrestricted erosion ate thin strokes down to a few pixels that
   normalisation then blew up into solid white squares still labelled as digits. Held-out
   accuracy went 82 % -> 92 % from fixing those two alone. `--dump-samples` now exists so
   this is a habit rather than a rescue.

5. **A plausibility guard beats tuning augmentation ranges.** Rather than hand-tuning how
   hard each transform may push, the builder rejects any augmented sample whose mean ink
   falls outside the range real pipeline output occupies, and retries with a milder
   transform. The threshold is expressed in the same quantity measured off real bitmaps,
   so it stays meaningful if the augmentation changes.

6. **The synthetic held-out score is far more pessimistic than reality**: 93 % against
   98 % on real pipeline bitmaps. It is heavily augmented, includes unseen fonts and a
   deliberately hard background class. Worth keeping as a regression signal, not worth
   reading as the accuracy of anything.

7. **Background samples compete with the digit 1.** Vertical junk fragments and a thin 1
   are genuinely similar, and over-representing background (9000 samples against ~1800 per
   digit) made `1 -> background` the single largest error. Cutting background to 4000 took
   real-bitmap accuracy from 97.5 % to 98.0 % and halved the blurred fixture's errors.
   `1 -> background` is still the joint-largest confusion, which step 5's confidence
   flagging and step 6's solver repair are exactly the mechanisms for.

## 9. Known risks

- **Grid detection on low-contrast or heavily shadowed photos** — mitigated by the sanity gate and
  an honest failure message; worst case the user types the puzzle as today.
- **1 / 7 / 9 confusion in handwriting** — mitigated by the European-handwriting samples and the
  solver repair in §5.
- **Thick grid lines bleeding into cells** — mitigated by the 12 % inset and discarding
  border-touching components; the inset is the first thing to tune if cells read as junk.
- **Non-square (16×16, 6×6) puzzles** — out of scope; the pipeline assumes 9×9.

---

## Progress

- [x] **Step 1** — harness (`test-vision.html`), synthetic fixture generator, fixture manifest,
      labelling tool for real photos, `vision.js` API contract.
- [x] **Step 2** — threshold, grid detection, perspective warp. Mean corner error
      **1.3 px** across all 21 fixtures (range 0.7–1.9), no full-frame fallbacks used,
      60–190 ms per image. Four negative cases (blank page, noise, text, one small box)
      fail honestly instead of warping garbage.
- [x] **Step 3** — cell cutting, empty detection, MNIST normalisation. Occupancy
      **100.0 %** (0 false positives, 0 missed clues over 1701 cells, 21/21 fixtures
      perfect). Grid lines are found by projection, not assumed.
- [x] **Step 4** — trained and exported. **98.0 %** per-cell accuracy on bitmaps cut from
      the fixture photos (int8, what ships), 15/21 grids read with zero wrong cells.
      Quantisation costs 0.16 points. `digit-model.js` is 37 KB, 26,698 parameters.
- [ ] Step 5 — JS inference + confidence
- [ ] Step 6 — UI integration, conflicts, solver repair
- [ ] Step 7 — threshold tuning
