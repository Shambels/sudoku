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
2. **Solver-assisted repair.** If the board has conflicts or no unique solution, take the *k*
   lowest-confidence cells (k ≤ 4) and search their top-2 candidates — ≤ 16 boards, each solved in
   milliseconds. If exactly one combination yields a *uniquely* solvable board, adopt it; if several
   do, flag them all and let the user pick. Needs `countSolutions(grid, 2)` in `sudoku.js`.
   *Measured in step 6: this fixed 1 of 7 wrong cells. The claim that once stood here — that it is
   the highest-leverage item in the plan — was wrong; layer 1 does the heavy lifting. Kept because
   it costs 1 ms and broke nothing.*
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

## Findings from step 5

1. **Third parity check, third seam covered.** The JS forward pass agrees with Python on
   all 610 fixture cells - identical predictions, confidences within 2.2e-6 (float32
   accumulation order). Every hand-written crossing in this project now has a check:
   normalisation, weight export, and inference.

2. **Test-time augmentation earns its cost.** Three forward passes at -6/0/+6 degrees take
   wrong cells from 12 to 10 and perfect grids from 15 to 16, for +45 ms. It was listed as
   optional in §3; the measurement promotes it to the default.

3. **`minMargin` does nothing.** Swept across 0.20-0.80 it changes the result not at all:
   on this fixture set every low-margin cell is also a low-confidence one, so the second
   criterion never fires independently. Left in place because real photos may differ, but
   flagged in the code as inert - a knob that appears to work and does not is worse than
   no knob.

4. **The confidence threshold should NOT be maximised.** Raising it from 0.90 to 0.99
   catches one extra wrong cell and flags 16 % of clues instead of 6 % - roughly five amber
   cells per grid instead of under two. Measured against the fixtures, confidence and the
   §5.1 rule-conflict check *together* catch every wrong cell even at 0.80, so the last
   cell is already covered for free. Choosing the threshold in isolation would have bought
   three times the noise for nothing.

5. **"Background" is a real answer, not a failure.** When the segmenter finds something
   digit-shaped and the classifier calls it junk, the cell is left empty and always
   flagged. Two stages disagreeing is exactly what a person should look at - and it is
   where a thin 1 gets lost.

6. Runtime breakdown per photo (no debug canvases): grayscale 14 ms, threshold 23 ms,
   detect 13 ms, warp 6 ms, cells 7 ms, classify 69 ms, total 131 ms - inside the
   100-200 ms budget in §2, with the classifier now the dominant cost.

## Findings from step 6

1. **None of the fixtures was a real sudoku puzzle.** The generator dug clues out at
   random without checking that one solution remained, so all 21 boards had many
   solutions. Solver repair depends entirely on uniqueness, so it could never have worked
   — and it failed *silently*, reporting "no repair found" on grids that were already
   perfect. The generator now digs only while the solution stays unique, and refuses to
   write a fixture that is not a proper puzzle. This bug had been in place since step 1,
   and only step 6 was capable of noticing it.

2. **§5.2 overstated the solver's leverage, and the measurement corrected it.** The plan
   called solver repair "the highest-leverage item in the whole plan". Measured: it fixed
   **1** of 7 wrong cells, turning 16/21 perfect grids into 17/21. Confidence flagging
   caught **7 of 7**. The honest ranking is the reverse of what was written. Repair is
   still worth its 1 ms — it is free accuracy and it broke nothing — but it is a
   supplement, not the foundation.

3. **A wrong digit that leaves the board uniquely solvable is invisible to the solver.**
   `syn-14-blurred` reads one cell wrong and still solves uniquely, so repair never even
   triggers. Only confidence flagging catches that class of error, which is the concrete
   reason the two layers are not redundant.

4. **Reconsidering more cells does not help.** Swept the repair width from 2 to 7 cells:
   identical results at every setting, nothing gained and nothing broken. Four stays.

5. **`countSolutions` needed a different search order from `solve()`.** Picking the most
   constrained cell rather than the first empty one is what makes the uniqueness check
   affordable — a typical board resolves in ~165 nodes. The node budget is the backstop so
   a pathological board reports itself unfinished instead of freezing the page.

6. **`sudoku.js` now loads without the app's DOM.** The harness loads the real solver and
   measures the repair that actually ships, rather than a copy that could quietly drift
   from it.

## Findings from the first real photo

A hand-drawn grid on creased paper, photographed with a phone. It read 24 of 30 clues with
**17 wrong cells**; after the fix below it reads **30 of 30, nothing wrong, nothing
flagged**. Every synthetic fixture is unchanged, so the fix cost nothing.

1. **The synthetic fixtures all had evenly spaced lines, and nothing else did.** Every
   generated grid is drawn on an exact ninth. A person drawing a grid by hand does not do
   that - in this photo the rightmost column is about 1.5x the width of the narrowest.
   Twenty-one fixtures and a 100 % occupancy score had never once exercised uneven spacing.

2. **Independent line snapping cannot survive that, and fails silently.** Each line was
   snapped to the strongest peak within 35 % of its nominal ninth; a line further out than
   that is simply never found, and the code falls back to the nominal position without any
   signal that it did. Only 4 of 10 row lines and 5 of 10 column lines were found, and
   cells were cut up to a third of a cell away from where they belonged - which is why
   whole rows came out shifted sideways.

3. **The fix is to choose all ten lines together, not one at a time.** The outer borders
   are pinned by the warp, and the eight interior lines are placed by dynamic programming
   to maximise total line evidence subject to every cell being between 0.55x and 1.75x a
   nominal ninth. Uneven spacing becomes something the grid is allowed to have rather than
   an error to be suppressed. The same photo now finds 10/10 column lines and 8/10 row
   lines, with column drifts as large as 31 px correctly tracked.

4. **The projection had to stop seeing digits.** Counting ink per row also counts glyphs,
   and on an unevenly spaced grid a row of digits can outscore a real line. Ink now counts
   towards a line only where it runs 7 pixels along it, after a one-pixel dilation across
   the line so a wandering hand-drawn stroke still reads as continuous. A digit has no
   7-pixel horizontal stroke; a grid line has one everywhere along its length.

5. **One "error" was in the label, not the pipeline.** The transcription of the photo had
   a clue one column to the left of where it sits. Worth remembering that with real
   fixtures the ground truth is hand-entered and is itself a thing that can be wrong.

## Findings from the second real photo

A printed grid with handwritten answers, faint erased-pencil ghosting and 50 clues. It read
**perfectly, first time** - the only fixture so far to exercise printed digits, a nearly
full board, and ghost content all at once.

1. **Do not re-encode fixture photos.** Saving it as JPEG at quality 88 cost two cells;
   at quality 70, five; at quality 60, eleven. Almost every induced error was *false ink*:
   compression ringing around the erased pencil crossing the ink threshold. Fixtures now
   store original bytes, and the fixtures README says why.

2. **Two attempts to let grid lines bend both measured worse, and were reverted.**
   `real-01` has a hand-drawn row line that slopes by most of a cell across the grid and
   cuts a digit in half, so following the bend looked obviously right. Free per-band
   placement snapped onto digit strokes instead - a 7's crossbar has the same horizontal
   run as a line - and took the printed fixture from 0 wrong cells to 5. A constrained
   least-squares slope fit was better but still found slopes in printed grids that have
   none: 0 wrong to 4. The straight-line model wins on the evidence and stays. The reason
   is recorded in `vision.js` beside the code, so the idea is not re-attempted blind.

3. **The one remaining real-photo error is a genuinely marginal cell**, and it is flagged.
   `real-01` r1c9 sits where the sloping line clips it; a JPEG copy of the same photo reads
   it correctly and the webp original does not. It is stored as the webp: choosing the
   copy that scores better would be measuring the wrong thing.

## Findings from the third real photo

A newspaper puzzle, out of focus, with page text around the grid. Read 25 of 26 clues with
**4 errors**; now **3**, all flagged. Geometry was never the problem here - line drift was
under 6 px and the warp was clean. Every error was in the cell.

1. **A confident wrong answer came from an L-shaped grid-line corner.** The bottom-left
   cell held two thin strokes meeting at a corner, and the classifier called it a 6 at 98 %
   confidence - the worst failure mode there is, since confidence flagging cannot catch it.
   The through-line test missed it because that only rejects components spanning *opposite*
   edges, and an L spans two adjacent ones.

2. **The fix came from measuring, after two guesses failed.** A component's fill ratio -
   pixels over bounding-box area - separates the two populations: across every fixture,
   real digits never fall below **0.161**, while the junk reaching this point sits at
   0.082, 0.114, 0.149 and 0.172. A bar at 0.15 removes three of the four and costs no
   digit. The margin is thin, so a cell rejected by *this* test alone is flagged rather
   than silently dropped.

3. **Flag the close call, not every rejection.** Flagging any cell that held ink and was
   rejected took the amber count from 42 to 89 - about 13 % of all clues - for no gain.
   Only the fill-ratio rejection is a genuine close call; a speck or a stray mark is not.

4. **Three attempts to recover a digit merged with the border all measured worse, and
   were reverted.** On a blurred photo the grid line spreads past the inset and merges
   with the digit, which then reads as background. Trimming the cell box inward cost 2
   cells; deleting ink runs longer than 0.75 of the cell cost 5; restricting that to
   near-full runs in the outer 30 % cost 1 and gained 0. The reason run length fails is
   measurable: **8 of 706 correctly-read cells contain a full-width run**, so run length
   alone does not identify a line. The two affected cells are flagged. The record is in
   `vision.js` next to the code so a fourth attempt starts from the evidence.

5. **The remaining substitution is the classifier, not the geometry.** A blurred serif 1
   read as a 9 at 0.50 against 0.32. Flagged.

## Findings from the fourth real photo

A folded newspaper on gravel: rotated about 20 degrees, strong perspective, shadow, margin
scribbles, low resolution. It produced **42 clues where there are 28**, only 30 of 81 cells
right - confident nonsense. It is now **refused**, with a reason.

1. **Detection had no way to know it had failed.** The largest ink component was the page
   furniture and the gravel, its quad failed the shape check, and the full-frame fallback
   then warped the entire photograph - gravel included - and read a board out of it. The
   promise in section 2.3 that a bad fallback would be reported was never actually kept,
   because nothing downstream ever checked.

2. **The check was already being computed.** The number of grid lines found inside the
   warped square separates cleanly: every fixture that reads finds **15 to 20 of 20**; this
   photo finds **6**. A bar at 12 sits in the middle of that gap. Extraction now fails with
   "the strongest candidate only had 11 of 20 grid lines" instead of inventing a board.

3. **Detection proposes, warping disposes.** Rather than betting on the largest blob, the
   detector now offers several candidates - each blob's x±y corners, a rotation-invariant
   maximum-area quadrilateral fitted to its convex hull, and the full frame - warps each,
   and keeps whichever contains the most grid lines. Because selection is by measured
   evidence, adding candidates cannot regress a photo that already worked, which is what
   made this safe to attempt after five reverts.

4. **The quad fit helped and was still not enough.** It lifted this photo's best candidate
   from 10 to 11 of 20, below the bar. Cropping to the grid by hand made it *worse* (8/20).
   The grid's own ink is merged with the page border and title, so no quadrilateral of that
   blob is the grid. Separating them needs a different detector, not a better fit.

5. **A refusal is not 81 errors.** The harness counted the refused photo as 28 wrong cells,
   which dropped "wrong and flagged" to 28 % and would have made guessing look better than
   admitting defeat. Refusals are now counted in their own column.

## Findings from the fifth real photo

A full newspaper page photographed at an angle, with a **completed solution grid printed
directly above the puzzle** - two valid sudoku grids in one frame. It read 20 of 24 clues,
all four errors being dropped digits. It now reads **perfectly**.

1. **Two grids in frame, and evidence-based selection picked the right one.** The obvious
   risk of choosing candidates by line evidence is that a *finished* grid scores at least
   as well as the puzzle. The detector picked the puzzle anyway - the solution grid is
   physically smaller, so it loses on blob size before evidence is consulted. That is luck
   rather than design, and worth remembering as a latent failure.

2. **The four missed digits were not missing - they were discarded.** All four touched a
   grid line. The merged component spans the cell edge to edge, and the through-line test
   threw it away along with the line, reporting "no component near the centre" and zero
   ink even though the binary image clearly contained the digit.

3. **The fix is the inverse of the three that failed.** Every earlier attempt tried to
   remove the *line*, and each deleted digit strokes somewhere else. What works is
   refusing to mistake the merge for a line in the first place: a grid line is thin across
   its span, a digit stuck to one is not. Swept 0.15-0.55 with a flat optimum from 0.22;
   at 0.30 the total across all fixtures goes **15 wrong cells to 12**, exact grids 17 to
   18, and this photo goes from 4 wrong to none. It costs one cell on real-01.

4. A reminder of how easily this was missed for four photos: the cell reported *zero ink*,
   which reads like "nothing there" and is actually "everything there was rejected". The
   diagnostic that cracked it was rendering the warped binary and seeing the digits plainly
   present.

## Answering real-04: what the investigation found, and what was built

Five experiments, then two changes. The experiments mattered more than the changes.

**The pipeline CAN read that photo.** A global sweep over position, size and rotation found
the grid's true angle as a sharp spike - 1296 qualifying quads at +24 degrees against a
handful at every other angle. Detection is the only broken part.

**But line evidence is necessary, not sufficient - and that was a real hole.** The best
quad that sweep produced scores **19/20 on grid lines and reads 48 of 81 cells wrong**,
with corners running off the top of the frame. It locked onto periodic structure that is
not the puzzle. Separately, masking the gravel got the photo to 13/20 - past the bar - while
reading 16/81 wrong. The gate as built could be walked straight through.

### Change 1: judge a candidate on whether it could be a sudoku

Rule conflicts separate the populations where line counts do not: every correctly detected
photo reads **0-4** cells into conflict, the 19/20 impostor reads **21**. Candidates are now
accepted only if the board they produce has at most 10 conflicting cells. Note that clue
*count* is not usable as a filter - `real-02` legitimately has 50 clues.

The validating read is the read that is kept, so the ordinary case still costs one warp and
one classification pass. 131 ms -> 160 ms per photo, still inside the section 2 budget.

### Change 2: let a person place the corners

Four clicks, offered automatically whenever extraction is refused. `opts.corners` skips
detection entirely and the gates do not apply - someone pointing at the grid is better
evidence than any heuristic. Validated against the 21 fixtures that carry ground-truth
corners: hand-placed corners give 10 wrong cells against 7 for automatic detection, so the
path is sound rather than merely present.

### Ruled out, each by measurement

- **Better quad fitting on the blob**: 10 -> 11 of 20. Insufficient.
- **Global periodicity detection on the raw binary**: gravel swamps it. Every angle scores
  0.70-0.86 at the minimum spacing; there is no grid signal to find.
- **Page segmentation then detect**: the page is only weakly separable (local sd 11.2 on
  paper against 17.1 on gravel), and the crude version turned an honest refusal into a
  confident 16/81-wrong read. Worse than doing nothing.

### Still open

Automatic detection of a grid whose ink merges with page furniture. The rotation-first
search is the promising route - find the angle with a cheap one-dimensional sweep, then
search centre and size only at that angle - but it is speculative and is now unnecessary
for correctness, because the photo is refused rather than misread and the corners can be
set by hand.

## A regression on real-01, and what it exposed

Reported as "a photo that used to read perfectly now reads two cells wrong". Two different
causes, only one of them recent.

1. **r6c7 (2 read as 9) was mine, from the real-05 fix.** The `lineThinness` rule kept a
   merged digit-and-line component even in cells that still contained a perfectly good
   digit component, and the extra ink changed the answer. The rule was too blunt: it
   applied always, rather than only when needed.

   The fix is to read every cell twice. **Strict** discards anything spanning the cell edge
   to edge - correct when the component really is a grid line. **Lenient** keeps one too
   thick to be a line - correct when a digit has merged with the line. Preferring strict and
   falling back to lenient only when strict finds nothing gets both behaviours, and is the
   same "conservative first, fall back on empty" shape that the candidate search uses.

2. **r1c9 (8 read as 7) was older and more interesting.** The 8 sits under a hand-drawn row
   line that slopes, so the cell boundary cut through it: the digit box came out 21x14,
   wider than tall, and the classifier was guessing on half a glyph at 0.28 confidence. It
   had flipped between blank, 7, 9 and 8 across encodings and code versions - a coin toss,
   correctly flagged every time.

   Measuring that signature across the fixtures made the fix obvious: **11 of 743 cells
   have a digit box wider than tall, and 7 of them were read wrong.** So when a digit looks
   cut, look past the edge that cut it - open up only the boundary the component actually
   touches, re-segment, and keep the result only if it comes back substantially taller.

   **That is the fix for the border-merge problem that three earlier attempts failed at.**
   Those all tried to remove the line; the right framing was that the digit is clipped. It
   rescues 3 cells across the set: real-01 now reads perfectly and real-03 went 3 wrong to 2.

3. **Fixing those re-opened the validity gate**, because the boards the bad detection
   produced now had few enough conflicts to pass. Conflicts had only one count of margin
   anyway (good fixtures reach 6, a bad detection 8). A better-separated signal was already
   being computed: **flags per clue**. Every readable fixture flags at most 0.24 cells per
   clue; the bad detection flags 1.12. A bar at 0.5 has a factor of two either side. Both
   tests are kept - they catch different failures.

Net across the fixture set: 12 wrong cells to **9**, exact grids 18/25 to **19/25**, still
zero false ink, still every wrong cell flagged, 136 ms per photo.

## 9. Known risks

- **Grid detection on low-contrast or heavily shadowed photos** — mitigated by the sanity gate and
  an honest failure message; worst case the user types the puzzle as today.
- **1 / 7 / 9 confusion in handwriting** — mitigated by the European-handwriting samples and the
  solver repair in §5.
- **Thick grid lines bleeding into cells** — mitigated by the 12 % inset and discarding
  border-touching components; the inset is the first thing to tune if cells read as junk.
- **Non-square (16×16, 6×6) puzzles** — out of scope; the pipeline assumes 9×9.
- **A grid whose ink merges with surrounding page furniture** (title, borders, margin
  notes) cannot be isolated by the largest-blob detector, however the quad is fitted.
  `real-04` is the example. It is refused rather than misread; fixing it properly means a
  detector that looks for the grid's periodic line structure rather than its connectivity.

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
- [x] **Step 5** — JS forward pass and confidence. Clue recall **99.7 %**, digit accuracy
      **98.7 %**, zero false ink, **16/21** grids exactly right, 131 ms per photo.
      Predictions match Python on all 610 fixture cells.
- [x] **Step 6** — UI, conflicts, solver repair. Clue recall **99.8 %**, digit accuracy
      **99.0 %**, **7** wrong cells of 610 and **all 7 flagged**, **17/21** grids exactly
      right after repair. Photo import works by file, drag-drop or paste.
- [ ] Step 7 — threshold tuning (still wants more real photos)
