// vision.js - photo of a sudoku -> 9x9 board of clues.
//
// Zero dependencies, runs on a canvas, works from file://.
// See docs/photo-to-grid-plan.md; the section numbers in the TODOs below point at it.
//
// STATUS: step 1 of the build order. Only the plumbing, the tunables and the
// helpers are real. Every pipeline stage is a stub that reports notImplemented,
// so test-vision.html scores an honest 0 instead of silently passing.

var SudokuVision = (function () {
  'use strict';

  // Every magic number in the pipeline lives here so the harness can sweep them
  // instead of us guessing. Overridable per call via the options argument.
  var defaults = {
    // 2.1 downscale
    maxSide: 1024,

    // 2.2 adaptive threshold (Bradley-Roth)
    thresholdWindowDivisor: 12,   // window = round(width / divisor), forced odd
    thresholdBias: 0.92,          // ink when pixel < bias * windowMean
    autoPolarity: true,           // dark-mode screenshots are light ink on dark paper
    polarityBrightFraction: 0.30, // below this share of above-mean pixels, invert

    // 2.3 grid detection
    minGridAreaFraction: 0.15,    // largest blob must cover this much of the frame
    minSideFraction: 0.20,        // each quad side, relative to the image's short side
    aspectMin: 0.6,
    aspectMax: 1.7,
    allowFullFrameFallback: true, // screenshots are already cropped

    // 2.4 warp
    cellSize: 48,                 // warped grid is 9 * cellSize square

    // 2.5 cell segmentation
    warpedWindowDivisor: 12,      // threshold window for the warped image
    warpedThresholdBias: 0.93,    // separate from thresholdBias: the warped image is
                                  // about digit shape, the full frame about finding lines.
                                  // Swept 0.78-0.96 against counter survival in 4/6/8/9:
                                  // tightening it does not thin strokes, it breaks the
                                  // loops, so the counters leak away instead of opening.
    lineRunLength: 7,             // ink must run this far along a line to count as one
    minGapRatio: 0.55,            // narrowest cell, as a fraction of a nominal ninth
    maxGapRatio: 1.75,            // widest - hand-drawn grids are not evenly spaced
    spacingPenalty: 1.5,          // mild pull towards regularity, per pixel of deviation
    minLineStrength: 0.25,        // share of the width, for reporting how many were really found
    cellInset: 0.12,              // fraction trimmed off each side of a cell
    centerBoxFraction: 0.50,      // component must overlap this central box
    minInkFraction: 0.010,        // of the inset cell's area
    minDigitHeight: 0.30,         // of the cell's height - every digit is near full height
    minDigitBox: 4,               // px, an absolute floor for very small cells

    // 2.6 normalization
    digitBox: 20,                 // longer side of the digit, MNIST-style
    canvasBox: 28,

    // 4. confidence
    // 0.90 flags about 6% of clues. Pushing it to 0.99 catches one more wrong cell
    // but flags 16% - and measured against the fixtures, confidence AND the rule
    // conflict check together catch every wrong cell even at 0.80, so buying that
    // last cell with three times the amber is a bad trade.
    minConfidence: 0.90,
    // Currently inert: on the fixture set every low-margin cell is also a
    // low-confidence one, so this changes nothing below 0.80. Kept because real
    // photos may not behave that way - but do not assume tuning it does anything
    // until the numbers say so.
    minMargin: 0.30,

    // 3. test-time augmentation - three forward passes instead of one.
    // Measured: 12 wrong cells -> 10, and 15/21 perfect grids -> 16, for +45ms.
    ttaAngles: [-6, 0, 6]
  };

  function options(overrides) {
    var o = {}, k;
    for (k in defaults) { if (Object.prototype.hasOwnProperty.call(defaults, k)) { o[k] = defaults[k]; } }
    for (k in (overrides || {})) { if (Object.prototype.hasOwnProperty.call(overrides, k)) { o[k] = overrides[k]; } }
    return o;
  }

  // ---------------------------------------------------------------- helpers

  function emptyBoard(fill) {
    var g = [], x, y;
    for (x = 0; x < 9; x++) { g[x] = []; for (y = 0; y < 9; y++) { g[x][y] = fill; } }
    return g;
  }

  // '.' and '0' both mean empty. Row-major, 81 characters.
  function parseBoard(str) {
    var clean = String(str).replace(/[^0-9.]/g, '');
    if (clean.length !== 81) { throw new Error('expected 81 cells, got ' + clean.length); }
    var g = emptyBoard(0), i, ch;
    for (i = 0; i < 81; i++) {
      ch = clean.charAt(i);
      g[Math.floor(i / 9)][i % 9] = (ch === '.' || ch === '0') ? 0 : parseInt(ch, 10);
    }
    return g;
  }

  function boardToString(grid, emptyChar) {
    var e = emptyChar === undefined ? '.' : emptyChar;
    var out = '', x, y;
    for (x = 0; x < 9; x++) {
      for (y = 0; y < 9; y++) { out += grid[x][y] ? String(grid[x][y]) : e; }
    }
    return out;
  }

  // Accepts HTMLImageElement, HTMLCanvasElement, ImageBitmap, Blob/File, or a
  // data/object URL string. Always resolves to a canvas we own and can read.
  //
  // Blob/File goes through FileReader.readAsDataURL rather than
  // URL.createObjectURL: on a file:// page a blob URL carries an opaque origin
  // and getImageData then throws a SecurityError. Data URLs never taint.
  function toCanvas(source, maxSide) {
    return new Promise(function (resolve, reject) {
      if (source && source.tagName === 'CANVAS') { return resolve(drawScaled(source, maxSide)); }
      if (typeof Blob !== 'undefined' && source instanceof Blob) {
        var reader = new FileReader();
        reader.onload = function () { loadUrl(reader.result).then(resolve, reject); };
        reader.onerror = function () { reject(new Error('could not read the file')); };
        return reader.readAsDataURL(source);
      }
      if (typeof source === 'string') { return loadUrl(source).then(resolve, reject); }
      if (source && (source.tagName === 'IMG' || (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap))) {
        return resolve(drawScaled(source, maxSide));
      }
      reject(new Error('unsupported image source'));
    });

    function loadUrl(url) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () { res(drawScaled(img, maxSide)); };
        img.onerror = function () { rej(new Error('could not decode the image')); };
        img.src = url;
      });
    }
  }

  function drawScaled(source, maxSide) {
    var w = source.naturalWidth || source.width;
    var h = source.naturalHeight || source.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.sourceWidth = w;
    canvas.sourceHeight = h;
    canvas.sourceScale = scale;   // working px = source px * scale
    return canvas;
  }

  // Throws a clear error rather than a bare SecurityError, because on file://
  // in Chrome this is the single most likely thing to go wrong.
  function readPixels(canvas) {
    try {
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      throw new Error(
        'canvas is tainted - the image came from another origin. Serve the page over http ' +
        '(python3 -m http.server) or pass the image as a File/data URL.');
    }
  }


  // Debug rendering: turn the intermediate buffers into canvases the harness can
  // show. Only built when opts.debug, so the normal path pays nothing.
  function grayToCanvas(img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var ctx = c.getContext('2d'), out = ctx.createImageData(img.width, img.height), i;
    for (i = 0; i < img.gray.length; i++) {
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = img.gray[i];
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }

  function binaryToCanvas(binary, width, height) {
    var c = document.createElement('canvas');
    c.width = width; c.height = height;
    var ctx = c.getContext('2d'), out = ctx.createImageData(width, height), i, v;
    for (i = 0; i < binary.length; i++) {
      v = binary[i] ? 0 : 255;
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return c;
  }

  // ------------------------------------------------------- pipeline stages
  // Each returns its own result object. Implemented one build step at a time.

  // 2.1 -> { width, height, gray: Uint8ClampedArray }
  function toGray(imageData) {
    var d = imageData.data, n = imageData.width * imageData.height;
    var gray = new Uint8ClampedArray(n), i;
    for (i = 0; i < n; i++) {
      gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0;
    }
    return { width: imageData.width, height: imageData.height, gray: gray };
  }

  // 2.2 Bradley-Roth adaptive mean threshold.
  // A global threshold (Otsu) fails on any photo with a shadow or a page curl,
  // which is the normal case. The integral image makes the local mean O(1) per
  // pixel, so this costs one pass regardless of window size.
  // -> { ink: Uint8Array (1 = ink), width, height, inverted, inkFraction }
  function adaptiveThreshold(img, opts) {
    var w = img.width, h = img.height, g = img.gray;

    // Polarity has to be settled here, on the grayscale. Flipping the binary image
    // afterwards does not work: on a light-on-dark image the local mean around each
    // bright line makes a halo of "ink" either side of it, and the untouched island
    // left in the middle of each cell becomes a convincing fake digit once flipped.
    var inverted = false;
    if (opts.autoPolarity && isLightOnDark(g, opts)) {
      var flipped = new Uint8ClampedArray(g.length);
      for (var q = 0; q < g.length; q++) { flipped[q] = 255 - g[q]; }
      g = flipped;
      inverted = true;
    }

    var stride = w + 1;
    var integral = new Float64Array(stride * (h + 1));
    var x, y, i, rowSum;

    for (y = 0; y < h; y++) {
      rowSum = 0;
      for (x = 0; x < w; x++) {
        rowSum += g[y * w + x];
        integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
      }
    }

    var win = Math.max(3, Math.round(w / opts.thresholdWindowDivisor) | 1);
    var r = win >> 1;
    var ink = new Uint8Array(w * h);
    var count = 0, x0, x1, y0, y1, area, sum;

    for (y = 0; y < h; y++) {
      y0 = y - r < 0 ? 0 : y - r;
      y1 = y + r > h - 1 ? h - 1 : y + r;
      for (x = 0; x < w; x++) {
        x0 = x - r < 0 ? 0 : x - r;
        x1 = x + r > w - 1 ? w - 1 : x + r;
        area = (x1 - x0 + 1) * (y1 - y0 + 1);
        sum = integral[(y1 + 1) * stride + (x1 + 1)] - integral[y0 * stride + (x1 + 1)] -
              integral[(y1 + 1) * stride + x0] + integral[y0 * stride + x0];
        i = y * w + x;
        // g * area < mean * area * bias, without the division
        if (g[i] * area < sum * opts.thresholdBias) { ink[i] = 1; count++; }
      }
    }

    return { ink: ink, width: w, height: h, inverted: inverted,
             inkFraction: count / (w * h) };
  }

  // Ink is the minority of any page. If most pixels sit below the mean, the image
  // is light-on-dark. Measured across the fixtures the two populations are far
  // apart - normal images never fall below 0.53, a dark-mode screenshot reads 0.09 -
  // so the 0.30 default has roughly 4x margin in both directions.
  function isLightOnDark(g, opts) {
    var n = g.length, i, sum = 0, above = 0;
    for (i = 0; i < n; i++) { sum += g[i]; }
    var mean = sum / n;
    for (i = 0; i < n; i++) { if (g[i] > mean) { above++; } }
    return above / n < opts.polarityBrightFraction;
  }

  // 2.3 The grid's border and lines form one big 8-connected blob. Label the
  // binary image, take the largest component that covers a plausible share of the
  // frame, and read its corners off the extremes of x+y and x-y.
  // -> { corners: [{x,y}] TL,TR,BR,BL, source, rejected } or null
  function findGrid(binary, opts) {
    var w = binary.width, h = binary.height, ink = binary.ink;
    var blob = largestBlob(ink, w, h, opts.minGridAreaFraction);
    var rejected = null;

    if (blob) {
      var corners = [blob.minSum, blob.maxDiff, blob.maxSum, blob.minDiff]; // TL TR BR BL
      rejected = quadProblem(corners, w, h, opts);
      if (!rejected) {
        return { corners: corners, source: 'blob', blob: blob, rejected: null };
      }
    }

    // An already-cropped screenshot has no margin to find, so the frame itself is
    // the right answer. But only fall back when a big structure was actually found
    // and rejected: with no blob at all there is no evidence of a grid, and
    // returning the frame would turn "nothing here" into a confident wrong answer.
    if (opts.allowFullFrameFallback && blob) {
      return {
        corners: [{ x: 0, y: 0 }, { x: w - 1, y: 0 },
                  { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }],
        source: 'fullFrame', blob: blob,
        rejected: rejected || 'no blob covered enough of the frame'
      };
    }
    return null;
  }

  // Two-pass 8-connected labelling with union-find. 8-connected, not 4: a grid
  // line in a rotated photo is a staircase, and 4-connectivity breaks it apart.
  function largestBlob(ink, w, h, minAreaFraction) {
    var labels = new Int32Array(w * h);
    var parent = [0];
    var next = 1, x, y, i, n, best;

    function find(a) {
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
      return a;
    }
    function union(a, b) {
      a = find(a); b = find(b);
      if (a !== b) { if (a < b) { parent[b] = a; } else { parent[a] = b; } }
    }

    var neighbours = [0, 0, 0, 0];
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!ink[i]) { continue; }
        n = 0;
        if (y > 0 && labels[i - w]) { neighbours[n++] = labels[i - w]; }
        if (x > 0 && labels[i - 1]) { neighbours[n++] = labels[i - 1]; }
        if (y > 0 && x > 0 && labels[i - w - 1]) { neighbours[n++] = labels[i - w - 1]; }
        if (y > 0 && x < w - 1 && labels[i - w + 1]) { neighbours[n++] = labels[i - w + 1]; }
        if (!n) {
          parent[next] = next;
          labels[i] = next++;
        } else {
          var min = neighbours[0], k;
          for (k = 1; k < n; k++) { if (neighbours[k] < min) { min = neighbours[k]; } }
          labels[i] = min;
          for (k = 0; k < n; k++) { union(min, neighbours[k]); }
        }
      }
    }

    var count = new Int32Array(next);
    var minX = new Int32Array(next), maxX = new Int32Array(next);
    var minY = new Int32Array(next), maxY = new Int32Array(next);
    var minSum = new Float64Array(next), maxSum = new Float64Array(next);
    var minDiff = new Float64Array(next), maxDiff = new Float64Array(next);
    var pMinSum = [], pMaxSum = [], pMinDiff = [], pMaxDiff = [];
    minX.fill(w); minY.fill(h); maxX.fill(-1); maxY.fill(-1);
    minSum.fill(Infinity); maxSum.fill(-Infinity);
    minDiff.fill(Infinity); maxDiff.fill(-Infinity);

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!labels[i]) { continue; }
        var root = find(labels[i]);
        count[root]++;
        if (x < minX[root]) { minX[root] = x; }
        if (x > maxX[root]) { maxX[root] = x; }
        if (y < minY[root]) { minY[root] = y; }
        if (y > maxY[root]) { maxY[root] = y; }
        var sum = x + y, diff = x - y;
        if (sum < minSum[root]) { minSum[root] = sum; pMinSum[root] = { x: x, y: y }; }
        if (sum > maxSum[root]) { maxSum[root] = sum; pMaxSum[root] = { x: x, y: y }; }
        if (diff < minDiff[root]) { minDiff[root] = diff; pMinDiff[root] = { x: x, y: y }; }
        if (diff > maxDiff[root]) { maxDiff[root] = diff; pMaxDiff[root] = { x: x, y: y }; }
      }
    }

    var minArea = minAreaFraction * w * h;
    best = 0;
    for (i = 1; i < next; i++) {
      if (!count[i]) { continue; }
      var area = (maxX[i] - minX[i] + 1) * (maxY[i] - minY[i] + 1);
      if (area < minArea) { continue; }
      if (!best || count[i] > count[best]) { best = i; }
    }
    if (!best) { return null; }

    return {
      pixels: count[best],
      bbox: { x: minX[best], y: minY[best],
              w: maxX[best] - minX[best] + 1, h: maxY[best] - minY[best] + 1 },
      minSum: pMinSum[best], maxSum: pMaxSum[best],
      minDiff: pMinDiff[best], maxDiff: pMaxDiff[best]
    };
  }

  // Returns null when the quad looks like a sudoku grid, or a reason when it does not.
  function quadProblem(c, w, h, opts) {
    var shortSide = Math.min(w, h), i;
    var sides = [];
    for (i = 0; i < 4; i++) {
      sides.push(distance(c[i], c[(i + 1) % 4]));
    }
    for (i = 0; i < 4; i++) {
      if (sides[i] < opts.minSideFraction * shortSide) {
        return 'side ' + i + ' is only ' + Math.round(sides[i]) + 'px';
      }
    }
    var aspect = ((sides[0] + sides[2]) / 2) / ((sides[1] + sides[3]) / 2);
    if (aspect < opts.aspectMin || aspect > opts.aspectMax) {
      return 'aspect ratio ' + aspect.toFixed(2);
    }
    var sign = 0;
    for (i = 0; i < 4; i++) {
      var a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
      var cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
      if (cross === 0) { continue; }
      if (!sign) { sign = cross > 0 ? 1 : -1; }
      else if ((cross > 0 ? 1 : -1) !== sign) { return 'quad is not convex'; }
    }
    return null;
  }

  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 2.4 Homography, not an affine deskew: a phone photo has real perspective and
  // an affine fit leaves the far row of cells trapezoidal. The grayscale is
  // warped and re-thresholded later, because resampling a binary image turns
  // hard edges into mush.
  // -> { canvas, gray: {width, height, gray}, size }
  function warpToSquare(img, corners, opts) {
    var size = opts.cellSize * 9;
    var dst = [{ x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }];
    var m = homography(dst, corners);
    if (!m) { return null; }

    var out = new Uint8ClampedArray(size * size);
    var w = img.width, h = img.height, g = img.gray;
    var i, j, u, v, denom, sx, sy;

    for (j = 0; j < size; j++) {
      v = j + 0.5;
      for (i = 0; i < size; i++) {
        u = i + 0.5;
        denom = m[6] * u + m[7] * v + 1;
        sx = (m[0] * u + m[1] * v + m[2]) / denom;
        sy = (m[3] * u + m[4] * v + m[5]) / denom;
        out[j * size + i] = sampleBilinear(g, w, h, sx, sy);
      }
    }

    var gray = { width: size, height: size, gray: out };
    return { canvas: grayToCanvas(gray), gray: gray, size: size };
  }

  function sampleBilinear(g, w, h, x, y) {
    if (x < 0) { x = 0; } else if (x > w - 1) { x = w - 1; }
    if (y < 0) { y = 0; } else if (y > h - 1) { y = h - 1; }
    var x0 = x | 0, y0 = y | 0;
    var x1 = x0 + 1 > w - 1 ? w - 1 : x0 + 1;
    var y1 = y0 + 1 > h - 1 ? h - 1 : y0 + 1;
    var fx = x - x0, fy = y - y0;
    return g[y0 * w + x0] * (1 - fx) * (1 - fy) + g[y0 * w + x1] * fx * (1 - fy) +
           g[y1 * w + x0] * (1 - fx) * fy + g[y1 * w + x1] * fx * fy;
  }

  // Maps dst (u,v) -> src (x,y): the direction the warp needs, so every
  // destination pixel is looked up rather than scattered into.
  function homography(dst, src) {
    var a = [], b = [], i, u, v, x, y;
    for (i = 0; i < 4; i++) {
      u = dst[i].x; v = dst[i].y; x = src[i].x; y = src[i].y;
      a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      a.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    return solve8(a, b);
  }

  // Gaussian elimination with partial pivoting. Eight unknowns, so an explicit
  // solver is smaller and clearer than anything generic.
  function solve8(a, b) {
    var n = 8, i, j, k, pivot, tmp, factor;
    for (i = 0; i < n; i++) {
      pivot = i;
      for (k = i + 1; k < n; k++) {
        if (Math.abs(a[k][i]) > Math.abs(a[pivot][i])) { pivot = k; }
      }
      tmp = a[i]; a[i] = a[pivot]; a[pivot] = tmp;
      tmp = b[i]; b[i] = b[pivot]; b[pivot] = tmp;
      if (Math.abs(a[i][i]) < 1e-10) { return null; }
      for (k = i + 1; k < n; k++) {
        factor = a[k][i] / a[i][i];
        for (j = i; j < n; j++) { a[k][j] -= factor * a[i][j]; }
        b[k] -= factor * b[i];
      }
    }
    var out = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var acc = b[i];
      for (j = i + 1; j < n; j++) { acc -= a[i][j] * out[j]; }
      out[i] = acc / a[i][i];
    }
    return out;
  }

  // 2.5 Cut the warped square into 81 cells and decide which hold a digit.
  // -> { cells: [{row, col, empty, bitmap28, ...}] x81, lines, binary }
  function extractCells(warped, opts) {
    var size = warped.size;
    // Re-threshold after the warp rather than warping the binary image: resampling
    // hard edges turns them to mush. adaptiveThreshold also re-applies the polarity
    // check here, because the warp carries the original grayscale - a dark-mode
    // screenshot is still light-on-dark at this point.
    var cellOpts = options(opts);
    cellOpts.thresholdWindowDivisor = opts.warpedWindowDivisor;
    cellOpts.thresholdBias = opts.warpedThresholdBias;
    var bin = adaptiveThreshold(warped.gray, cellOpts);
    var lines = findGridLines(bin, size, opts);

    var cells = [], r, c;
    for (r = 0; r < 9; r++) {
      for (c = 0; c < 9; c++) {
        cells.push(readCell(bin, size, lines, r, c, opts));
      }
    }
    return { cells: cells, lines: lines, binary: bin };
  }

  // A homography pins the four corners exactly but cannot flatten a curled page,
  // so the interior lines of a real photo drift from their nominal ninths. Snap
  // each line to the nearest peak in the ink projection instead of assuming.
  // A homography straightens perspective, not people. A hand-drawn line can slope
  // or bow by most of a cell from one side of the grid to the other, and giving
  // each line a single coordinate then cuts cells through the middle of digits.
  // So each line is found globally first, then re-measured in vertical (or
  // horizontal) bands and interpolated between them - the line is allowed to bend.
  function findGridLines(bin, size, opts) {
    return {
      rows: fitLines(bin.ink, size, true, opts),
      cols: fitLines(bin.ink, size, false, opts)
    };
  }

  function fitLines(ink, size, horizontal, opts) {
    var thick = thicken(ink, size, horizontal);
    var positions = pickLines(
      runProjection(thick, size, horizontal, opts.lineRunLength, 0, size), size, opts);

    // One coordinate per line, deliberately.
    //
    // A hand-drawn line really can slope by most of a cell across the grid, and two
    // attempts were made to follow it: free per-band placement, and a constrained
    // least-squares slope. Both measured WORSE than this. Per-band placement snapped
    // onto digit strokes (a 7's crossbar has a horizontal run like a line's), and
    // the slope fit found slopes in printed grids that have none, misaligning cells
    // that were previously right: on the printed fixture, 0 wrong cells became 4.
    // The straight model wins on the evidence, so it stays until some photo shows
    // otherwise. `at()` keeps the interface a bending version would need.
    return {
      positions: positions,
      snapped: positions.snapped,
      at: function (k) { return positions[k]; }
    };
  }

  // One pixel of dilation across the line's direction, so a hand-drawn stroke that
  // wanders by a pixel still reads as continuous.
  function thicken(ink, size, horizontal) {
    var out = new Uint8Array(size * size), x, y, i;
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        i = y * size + x;
        if (!ink[i]) { continue; }
        out[i] = 1;
        if (horizontal) {
          if (y > 0) { out[i - size] = 1; }
          if (y < size - 1) { out[i + size] = 1; }
        } else {
          if (x > 0) { out[i - 1] = 1; }
          if (x < size - 1) { out[i + 1] = 1; }
        }
      }
    }
    return out;
  }

  // Ink only counts towards a line if it runs along that line for a while. A plain
  // ink-per-row count also sees digits, and on a grid whose cells are unevenly
  // spaced a row of digits can outscore a genuine line. Requiring a run of ink
  // makes the projection nearly blind to glyphs: a digit has no 7-pixel horizontal
  // stroke, a grid line has one at every point along it.
  //
  // The image is first dilated by one pixel across the line's direction, so a
  // hand-drawn line that wanders by a pixel still reads as continuous.
  function runProjection(thick, size, horizontal, runLength, from, to) {
    var projection = new Int32Array(size);
    var half = runLength >> 1;
    var x, y, d, ok, nx, ny;
    var xFrom = horizontal ? from : 0, xTo = horizontal ? to : size;
    var yFrom = horizontal ? 0 : from, yTo = horizontal ? size : to;
    for (y = yFrom; y < yTo; y++) {
      for (x = xFrom; x < xTo; x++) {
        if (!thick[y * size + x]) { continue; }
        ok = true;
        for (d = -half; d <= half; d++) {
          nx = horizontal ? x + d : x;
          ny = horizontal ? y : y + d;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || !thick[ny * size + nx]) {
            ok = false;
            break;
          }
        }
        if (ok) { projection[horizontal ? y : x]++; }
      }
    }
    return projection;
  }

  // Choose all ten lines at once instead of snapping each to its nominal ninth.
  //
  // Independent snapping cannot work on a hand-drawn grid: a line further from its
  // nominal place than the search window simply is not found, and the fallback puts
  // the cut in the wrong place without any sign that it did. Here the outer borders
  // are pinned (the warp put them at the edges by construction) and the eight
  // interior lines are chosen by dynamic programming to maximise total line
  // evidence, subject to every cell being between minGapRatio and maxGapRatio of a
  // nominal ninth. Uneven spacing is then something the grid is allowed to have
  // rather than an error to be suppressed.
  function pickLines(projection, size, opts) {
    var nominal = size / 9;
    var last = size - 1;
    var minGap = Math.max(2, Math.round(nominal * opts.minGapRatio));
    var maxGap = Math.max(minGap + 1, Math.round(nominal * opts.maxGapRatio));
    var NEG = -1e18;
    var k, i, j, gap, value;

    // dp[k][i]: best evidence with k interior lines placed, the k-th sitting at i
    var dp = [], from = [];
    for (k = 0; k <= 8; k++) {
      dp.push(new Float64Array(size).fill(NEG));
      from.push(new Int32Array(size).fill(-1));
    }
    for (i = minGap; i <= last - minGap; i++) {
      gap = i;
      if (gap >= minGap && gap <= maxGap) {
        dp[0][i] = projection[i] - opts.spacingPenalty * Math.abs(gap - nominal);
      }
    }
    for (k = 1; k <= 7; k++) {
      for (i = minGap; i <= last - minGap; i++) {
        for (j = Math.max(0, i - maxGap); j <= i - minGap; j++) {
          if (dp[k - 1][j] === NEG) { continue; }
          value = dp[k - 1][j] + projection[i] -
                  opts.spacingPenalty * Math.abs(i - j - nominal);
          if (value > dp[k][i]) { dp[k][i] = value; from[k][i] = j; }
        }
      }
    }

    var bestEnd = -1, bestValue = NEG;
    for (j = Math.max(0, last - maxGap); j <= last - minGap; j++) {
      if (dp[7][j] === NEG) { continue; }
      value = dp[7][j] - opts.spacingPenalty * Math.abs(last - j - nominal);
      if (value > bestValue) { bestValue = value; bestEnd = j; }
    }

    var out = new Array(10);
    out[0] = 0;
    out[9] = last;
    if (bestEnd < 0) {
      // no admissible arrangement at all - fall back to even ninths
      for (k = 1; k <= 8; k++) { out[k] = k * nominal; }
      out.snapped = 0;
      return out;
    }
    for (k = 8, i = bestEnd; k >= 1; k--) {
      out[k] = i;
      i = from[k - 1][i];
      if (i < 0 && k > 1) { break; }
    }

    // Sub-pixel: a thick box-boundary line is several pixels wide and its centre
    // matters more than which single pixel scored highest.
    var floor = opts.minLineStrength * size;
    var found = 0;
    for (k = 0; k <= 9; k++) {
      var at = Math.round(out[k]);
      if (projection[at] >= floor) { found++; }
      if (k > 0 && k < 9) {
        out[k] = peakCentre(projection, at, projection[at],
                            Math.max(0, at - 3), Math.min(last, at + 3));
      }
    }
    out.snapped = found;
    return out;
  }

  // Sub-pixel centre: the weighted centroid of the contiguous run around the peak
  // that stays above half its height. A thick box-boundary line is several pixels
  // wide, and its centre matters more than which single pixel scored highest.
  function peakCentre(projection, at, peak, lo, hi) {
    var half = peak * 0.5, i;
    var from = at, to = at;
    while (from > lo && projection[from - 1] >= half) { from--; }
    while (to < hi && projection[to + 1] >= half) { to++; }
    var weight = 0, sum = 0;
    for (i = from; i <= to; i++) { weight += projection[i]; sum += i * projection[i]; }
    return weight ? sum / weight : at;
  }

  function readCell(bin, size, lines, r, c, opts) {
    var x0 = lines.cols.at(c), x1 = lines.cols.at(c + 1);
    var y0 = lines.rows.at(r), y1 = lines.rows.at(r + 1);
    var insetX = (x1 - x0) * opts.cellInset, insetY = (y1 - y0) * opts.cellInset;
    var ax = Math.max(0, Math.round(x0 + insetX));
    var ay = Math.max(0, Math.round(y0 + insetY));
    var bx = Math.min(size - 1, Math.round(x1 - insetX));
    var by = Math.min(size - 1, Math.round(y1 - insetY));

    var cell = { row: r, col: c, empty: true, bitmap28: null, pixels: 0,
                 inkFraction: 0, box: { x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1 },
                 digitBox: null, reason: null };
    if (cell.box.w < 4 || cell.box.h < 4) { cell.reason = 'cell too small'; return cell; }

    var kept = digitMask(bin, size, ax, ay, bx, by, opts);
    cell.pixels = kept.pixels;
    cell.inkFraction = kept.pixels / (cell.box.w * cell.box.h);

    if (!kept.pixels) { cell.reason = 'no component near the centre'; return cell; }
    if (cell.inkFraction < opts.minInkFraction) { cell.reason = 'too little ink'; return cell; }
    // Height, not ink area, is what separates a digit from a speck: a 1 or a 7 inks
    // barely 2% of its cell, but every digit from 1 to 9 stands near full height.
    // Judging by ink alone was dropping exactly those two glyphs.
    if (kept.bbox.h < opts.minDigitHeight * cell.box.h) { cell.reason = 'too short'; return cell; }
    if (kept.bbox.h < opts.minDigitBox) { cell.reason = 'speck'; return cell; }

    cell.empty = false;
    cell.digitBox = kept.bbox;
    cell.bitmap28 = normalizeDigit(kept.mask, cell.box.w, cell.box.h, kept.bbox, opts);
    return cell;
  }

  // Components inside one cell, filtered down to what is plausibly a digit.
  // A raw ink count would call a thick grid line a 1 and a faint pencil 7 an empty,
  // so the decision is made on components instead.
  function digitMask(bin, size, ax, ay, bx, by, opts) {
    var w = bx - ax + 1, h = by - ay + 1;
    var seen = new Uint8Array(w * h);
    var mask = new Uint8Array(w * h);
    var margin = (1 - opts.centerBoxFraction) / 2;
    var cx0 = w * margin, cx1 = w * (1 - margin);
    var cy0 = h * margin, cy1 = h * (1 - margin);
    var stack = new Int32Array(w * h);
    var kept = 0, bbox = null, x, y, i;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (seen[i] || !bin.ink[(ay + y) * size + (ax + x)]) { continue; }

        // flood fill, 8-connected, iterative - recursion would blow the stack on
        // a cell that is mostly ink
        var top = 0, pixels = [], minX = x, maxX = x, minY = y, maxY = y;
        stack[top++] = i; seen[i] = 1;
        while (top) {
          var p = stack[--top];
          var px = p % w, py = (p / w) | 0;
          pixels.push(p);
          if (px < minX) { minX = px; } if (px > maxX) { maxX = px; }
          if (py < minY) { minY = py; } if (py > maxY) { maxY = py; }
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var nx = px + dx, ny = py + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) { continue; }
              var ni = ny * w + nx;
              if (seen[ni] || !bin.ink[(ay + ny) * size + (ax + nx)]) { continue; }
              seen[ni] = 1; stack[top++] = ni;
            }
          }
        }

        // A grid-line remnant runs edge to edge; a digit does not.
        var spansX = minX === 0 && maxX === w - 1;
        var spansY = minY === 0 && maxY === h - 1;
        if (spansX || spansY) { continue; }
        // Must reach into the middle of the cell, or it is a neighbour bleeding in.
        if (maxX < cx0 || minX > cx1 || maxY < cy0 || minY > cy1) { continue; }

        for (var k = 0; k < pixels.length; k++) { mask[pixels[k]] = 1; }
        kept += pixels.length;
        bbox = bbox
          ? { x: Math.min(bbox.x, minX), y: Math.min(bbox.y, minY),
              w: Math.max(bbox.x + bbox.w, maxX + 1) - Math.min(bbox.x, minX),
              h: Math.max(bbox.y + bbox.h, maxY + 1) - Math.min(bbox.y, minY) }
          : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      }
    }
    return { mask: mask, pixels: kept, bbox: bbox };
  }

  // 2.6 MNIST's own recipe: fit the digit's longer side to 20px, then centre it in
  // a 28x28 field by centre of mass. Matching this at test time is what lets
  // MNIST-trained weights transfer at all.
  function normalizeDigit(mask, w, h, bbox, opts) {
    var target = opts.digitBox, box = opts.canvasBox;
    var scale = target / Math.max(bbox.w, bbox.h);
    var nw = Math.max(1, Math.round(bbox.w * scale));
    var nh = Math.max(1, Math.round(bbox.h * scale));
    var small = areaResize(mask, w, h, bbox, nw, nh);

    var sum = 0, sx = 0, sy = 0, x, y, v;
    for (y = 0; y < nh; y++) {
      for (x = 0; x < nw; x++) {
        v = small[y * nw + x];
        sum += v; sx += x * v; sy += y * v;
      }
    }
    var comX = sum ? sx / sum : nw / 2;
    var comY = sum ? sy / sum : nh / 2;
    // (box - 1) / 2, not box / 2: the centre of a 28-index grid is 13.5, and the
    // half-pixel difference is a systematic bias the classifier would have to learn around
    var centre = (box - 1) / 2;
    var offX = Math.round(centre - comX);
    var offY = Math.round(centre - comY);

    var out = new Float32Array(box * box);
    for (y = 0; y < nh; y++) {
      var ty = y + offY;
      if (ty < 0 || ty >= box) { continue; }
      for (x = 0; x < nw; x++) {
        var tx = x + offX;
        if (tx < 0 || tx >= box) { continue; }
        out[ty * box + tx] = small[y * nw + x];
      }
    }
    return out;
  }

  // Box filter, not nearest neighbour: averaging the source footprint is what turns
  // a hard mask into the soft grey strokes MNIST digits actually have.
  function areaResize(mask, w, h, bbox, nw, nh) {
    var out = new Float32Array(nw * nh);
    var sxStep = bbox.w / nw, syStep = bbox.h / nh;
    var ox, oy, x, y, sum, count, x0, x1, y0, y1;
    for (oy = 0; oy < nh; oy++) {
      y0 = Math.floor(bbox.y + oy * syStep);
      y1 = Math.max(y0 + 1, Math.ceil(bbox.y + (oy + 1) * syStep));
      for (ox = 0; ox < nw; ox++) {
        x0 = Math.floor(bbox.x + ox * sxStep);
        x1 = Math.max(x0 + 1, Math.ceil(bbox.x + (ox + 1) * sxStep));
        sum = 0; count = 0;
        for (y = y0; y < y1 && y < h; y++) {
          for (x = x0; x < x1 && x < w; x++) { sum += mask[y * w + x]; count++; }
        }
        out[oy * nw + ox] = count ? sum / count : 0;
      }
    }
    return out;
  }

  // 3 The classifier's forward pass. conv3x3x8 -> pool -> conv3x3x16 -> pool ->
  // dense 32 -> dense 10, run directly rather than via im2col: 81 cells is small
  // enough that avoiding the intermediate allocations is worth more than the
  // matrix-multiply shape.
  //
  // Class 0 is background - junk that got past the empty-cell filter. It is a real
  // answer, not a failure: a model with nowhere to put junk calls it a 1.
  //
  // -> { digit, confidence, candidates: [[digit, p], ...], background }
  function classify(bitmap, opts) {
    var probs = softmax(logits(bitmap, weights()));

    if (opts.ttaAngles && opts.ttaAngles.length > 1) {
      // Averaging a few small rotations steadies digits left slightly skewed by
      // imperfect corner detection. Costs one forward pass per angle.
      var summed = new Float32Array(probs.length), a, i, extra;
      for (a = 0; a < opts.ttaAngles.length; a++) {
        extra = opts.ttaAngles[a] === 0
          ? probs
          : softmax(logits(rotateBitmap(bitmap, opts.ttaAngles[a]), weights()));
        for (i = 0; i < summed.length; i++) { summed[i] += extra[i]; }
      }
      for (i = 0; i < summed.length; i++) { summed[i] /= opts.ttaAngles.length; }
      probs = summed;
    }

    var ranked = [];
    for (var k = 0; k < probs.length; k++) { ranked.push([k, probs[k]]); }
    ranked.sort(function (a, b) { return b[1] - a[1]; });

    return {
      digit: ranked[0][0],
      confidence: ranked[0][1],
      candidates: ranked.slice(0, 3),
      background: ranked[0][0] === 0
    };
  }

  var weightCache = null;

  function weights() {
    if (weightCache) { return weightCache; }
    var model = (typeof SudokuDigitModel !== 'undefined') ? SudokuDigitModel
      : (typeof window !== 'undefined' ? window.SudokuDigitModel : null);
    if (!model) {
      var err = new Error('digit-model.js is not loaded - add it before vision.js');
      err.notImplemented = true;
      err.stage = 'classify';
      throw err;
    }
    weightCache = model.weights();
    return weightCache;
  }

  // Scratch buffers, allocated once. Classifying 81 cells per photo through
  // freshly allocated arrays is most of the cost of the forward pass.
  var buf = {
    a1: new Float32Array(8 * 784), p1: new Float32Array(8 * 196),
    a2: new Float32Array(16 * 196), p2: new Float32Array(16 * 49),
    h3: new Float32Array(32), out: new Float32Array(10)
  };

  function logits(bitmap, w) {
    var a1 = buf.a1, p1 = buf.p1, a2 = buf.a2, p2 = buf.p2, h3 = buf.h3, out = buf.out;
    var o, y, x, i, j, c, sy, sx, sum, base;

    // conv1: 1x28x28 -> 8x28x28, 3x3 with one pixel of zero padding
    for (o = 0; o < 8; o++) {
      base = o * 9;
      for (y = 0; y < 28; y++) {
        for (x = 0; x < 28; x++) {
          sum = w.b1[o];
          for (i = 0; i < 3; i++) {
            sy = y + i - 1;
            if (sy < 0 || sy > 27) { continue; }
            for (j = 0; j < 3; j++) {
              sx = x + j - 1;
              if (sx < 0 || sx > 27) { continue; }
              sum += w.w1[base + i * 3 + j] * bitmap[sy * 28 + sx];
            }
          }
          a1[o * 784 + y * 28 + x] = sum > 0 ? sum : 0;
        }
      }
    }
    maxpool(a1, p1, 8, 28);

    // conv2: 8x14x14 -> 16x14x14
    for (o = 0; o < 16; o++) {
      for (y = 0; y < 14; y++) {
        for (x = 0; x < 14; x++) {
          sum = w.b2[o];
          for (c = 0; c < 8; c++) {
            base = o * 72 + c * 9;
            for (i = 0; i < 3; i++) {
              sy = y + i - 1;
              if (sy < 0 || sy > 13) { continue; }
              for (j = 0; j < 3; j++) {
                sx = x + j - 1;
                if (sx < 0 || sx > 13) { continue; }
                sum += w.w2[base + i * 3 + j] * p1[c * 196 + sy * 14 + sx];
              }
            }
          }
          a2[o * 196 + y * 14 + x] = sum > 0 ? sum : 0;
        }
      }
    }
    maxpool(a2, p2, 16, 14);

    // dense 784 -> 32 -> 10. p2 is laid out channel-major, matching the flatten
    // order the training script used (channel * 49 + y * 7 + x).
    for (o = 0; o < 32; o++) {
      sum = w.b3[o];
      for (i = 0; i < 784; i++) { sum += p2[i] * w.w3[i * 32 + o]; }
      h3[o] = sum > 0 ? sum : 0;
    }
    for (o = 0; o < 10; o++) {
      sum = w.b4[o];
      for (i = 0; i < 32; i++) { sum += h3[i] * w.w4[i * 10 + o]; }
      out[o] = sum;
    }
    return out;
  }

  // 2x2 max pooling, stride 2, over `channels` planes of size `size`.
  function maxpool(src, dst, channels, size) {
    var half = size / 2, c, y, x, o, a, b, cc, d, best;
    for (c = 0; c < channels; c++) {
      for (y = 0; y < half; y++) {
        for (x = 0; x < half; x++) {
          o = c * size * size + (y * 2) * size + x * 2;
          a = src[o]; b = src[o + 1]; cc = src[o + size]; d = src[o + size + 1];
          best = a > b ? a : b;
          if (cc > best) { best = cc; }
          if (d > best) { best = d; }
          dst[c * half * half + y * half + x] = best;
        }
      }
    }
  }

  function softmax(values) {
    var out = new Float32Array(values.length), peak = -Infinity, total = 0, i;
    for (i = 0; i < values.length; i++) { if (values[i] > peak) { peak = values[i]; } }
    for (i = 0; i < values.length; i++) {
      out[i] = Math.exp(values[i] - peak);
      total += out[i];
    }
    for (i = 0; i < values.length; i++) { out[i] /= total; }
    return out;
  }

  // Rotate a 28x28 bitmap about its centre, bilinear, for test-time augmentation.
  function rotateBitmap(bitmap, degrees) {
    var out = new Float32Array(784);
    var rad = degrees * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad), centre = 13.5;
    var x, y, sx, sy, dx, dy;
    for (y = 0; y < 28; y++) {
      for (x = 0; x < 28; x++) {
        dx = x - centre; dy = y - centre;
        sx = centre + dx * cos + dy * sin;
        sy = centre - dx * sin + dy * cos;
        if (sx < 0 || sy < 0 || sx > 27 || sy > 27) { continue; }
        out[y * 28 + x] = sampleBilinear(bitmap, 28, 28, sx, sy);
      }
    }
    return out;
  }

  function notImplemented(name, section) {
    var err = new Error(name + ' is not implemented yet (plan section ' + section + ')');
    err.notImplemented = true;
    err.stage = name;
    return err;
  }

  // ------------------------------------------------------------- public API

  // extract(source, opts) -> Promise<{
  //   ok, reason, notImplemented, stage,
  //   grid:        number[9][9]   0 = empty
  //   confidence:  number[9][9]   0..1
  //   candidates:  [[digit,p],[digit,p]][9][9]   for the solver-assisted repair (plan 5.2)
  //   uncertain:   [[row,col], ...]
  //   corners:     [{x,y} x4] | null
  //   warped:      canvas | null
  //   debug:       { gray, binary, cells } when opts.debug
  //   timings:     { total, gray, threshold, detect, warp, cells, classify }
  // }>
  //
  // Never rejects on a bad photo - a photo it cannot read resolves with
  // ok:false and a reason fit to show the user. It rejects only on programmer
  // error (unsupported source, tainted canvas).
  function extract(source, overrides) {
    var opts = options(overrides);
    var t = {}, t0 = now();

    return toCanvas(source, opts.maxSide).then(function (canvas) {
      var result = {
        ok: false, reason: null, notImplemented: false, stage: null,
        gridSource: null, gridRejected: null,
        grid: emptyBoard(0), confidence: emptyBoard(0), candidates: emptyBoard(null),
        uncertain: [], corners: null, warped: null, debug: null, timings: t,
        input: {
          width: canvas.sourceWidth || canvas.width,
          height: canvas.sourceHeight || canvas.height,
          workingWidth: canvas.width,
          workingHeight: canvas.height,
          scale: canvas.sourceScale || 1
        }
      };

      try {
        var mark = t0;
        var gray = toGray(readPixels(canvas));
        t.gray = lap();
        if (opts.debug) { result.debug = { source: canvas, gray: grayToCanvas(gray) }; }

        var binary = adaptiveThreshold(gray, opts);
        t.threshold = lap();
        if (opts.debug) {
          result.debug.binary = binaryToCanvas(binary.ink, gray.width, gray.height);
          result.debug.inkFraction = binary.inkFraction;
          result.debug.inverted = binary.inverted;
        }

        var grid = findGrid(binary, opts);
        t.detect = lap();
        if (!grid) {
          result.reason = "Couldn't find a sudoku grid in that image. Try a flatter, " +
            "better-lit shot with the whole grid in frame.";
          result.gridRejected = 'no candidate covered enough of the frame';
          return finish(result);
        }
        result.corners = toSourceSpace(grid.corners, result.input.scale);
        result.gridSource = grid.source;
        result.gridRejected = grid.rejected;

        var warped = warpToSquare(gray, grid.corners, opts);
        t.warp = lap();
        if (!warped) {
          result.reason = 'The four corners found are degenerate, so the image cannot be rectified.';
          return finish(result);
        }
        result.warped = warped.canvas;

        var cells = extractCells(warped, opts);
        t.cells = lap();
        if (opts.debug) {
          result.debug.cells = cells.cells;
          // flatten for the harness: the global position of each line, plus how far
          // it bends from one side of the grid to the other
          result.debug.lines = {
            rows: Array.from(cells.lines.rows.positions),
            cols: Array.from(cells.lines.cols.positions),
            rowsSnapped: cells.lines.rows.snapped,
            colsSnapped: cells.lines.cols.snapped
          };
          result.debug.warpedBinary = binaryToCanvas(cells.binary.ink, warped.size, warped.size);
          result.debug.warpedInverted = cells.binary.inverted;
        }

        var i, cell, guess, r, c;
        for (i = 0; i < cells.cells.length; i++) {
          cell = cells.cells[i];
          r = cell.row; c = cell.col;
          if (cell.empty) { result.confidence[r][c] = 1; continue; }
          guess = classify(cell.bitmap28, opts);
          result.confidence[r][c] = guess.confidence;
          result.candidates[r][c] = guess.candidates;
          if (guess.background) {
            // The segmenter found something a digit-shaped; the classifier says it
            // is junk. Leave the cell empty but always flag it: the two stages
            // disagreeing is exactly the case a person should look at, and it is
            // also where a thin 1 gets lost.
            result.grid[r][c] = 0;
            result.uncertain.push([r, c]);
            continue;
          }
          result.grid[r][c] = guess.digit;
          if (isUncertain(guess, opts)) { result.uncertain.push([r, c]); }
        }
        t.classify = lap();

        result.ok = true;
        return finish(result);

        function lap() { var d = now() - mark; mark = now(); return d; }
      } catch (err) {
        if (err.notImplemented) {
          result.notImplemented = true;
          result.stage = err.stage;
          result.reason = err.message;
          return finish(result);
        }
        throw err;
      }

      function finish(r) { t.total = now() - t0; return r; }
    });
  }

  function toSourceSpace(points, scale) {
    if (!scale || scale === 1) { return points; }
    return points.map(function (p) { return { x: p.x / scale, y: p.y / scale }; });
  }

  function isUncertain(guess, opts) {
    var margin = guess.candidates && guess.candidates.length > 1
      ? guess.candidates[0][1] - guess.candidates[1][1]
      : 1;
    return guess.confidence < opts.minConfidence || margin < opts.minMargin;
  }

  // The digit alternatives for one cell, best first, background dropped. This is
  // what the solver-assisted repair in plan 5.2 searches over.
  function digitCandidates(candidates, limit) {
    var out = [], i;
    for (i = 0; i < (candidates || []).length && out.length < (limit || 2); i++) {
      if (candidates[i][0] !== 0) { out.push(candidates[i]); }
    }
    return out;
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  return {
    defaults: defaults,
    extract: extract,
    parseBoard: parseBoard,
    boardToString: boardToString,
    digitCandidates: digitCandidates,
    emptyBoard: emptyBoard,
    toCanvas: toCanvas,
    readPixels: readPixels,
    // exposed for the harness and for step-by-step development
    grayToCanvas: grayToCanvas,
    binaryToCanvas: binaryToCanvas,
    stages: {
      toGray: toGray,
      adaptiveThreshold: adaptiveThreshold,
      findGrid: findGrid,
      warpToSquare: warpToSquare,
      extractCells: extractCells,
      findGridLines: findGridLines,
      runProjection: runProjection,
      pickLines: pickLines,
      normalizeDigit: normalizeDigit,
      classify: classify,
      logits: logits
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = SudokuVision; }
