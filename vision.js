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
    polarityInkLimit: 0.35,       // above this ink fraction, the image is inverted

    // 2.3 grid detection
    minGridAreaFraction: 0.15,    // largest blob must cover this much of the frame
    minSideFraction: 0.20,        // each quad side, relative to the image's short side
    aspectMin: 0.6,
    aspectMax: 1.7,
    allowFullFrameFallback: true, // screenshots are already cropped

    // 2.4 warp
    cellSize: 48,                 // warped grid is 9 * cellSize square

    // 2.5 cell segmentation
    cellInset: 0.12,              // fraction trimmed off each side of a cell
    centerBoxFraction: 0.50,      // component must overlap this central box
    minInkFraction: 0.03,         // of the inset cell's area
    minDigitBox: 6,               // px, in warped space

    // 2.6 normalization
    digitBox: 20,                 // longer side of the digit, MNIST-style
    canvasBox: 28,

    // 4. confidence
    minConfidence: 0.90,
    minMargin: 0.30,

    // 3. test-time augmentation
    ttaAngles: [0]                // e.g. [-6, 0, 6]
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

    // A grid plus its clues is a few percent ink. Much more than that means the
    // image is light-on-dark (a dark-mode screenshot), so flip it and carry on
    // rather than handing the detector a frame-filling background blob.
    var fraction = count / (w * h);
    var inverted = false;
    if (opts.autoPolarity && fraction > opts.polarityInkLimit) {
      for (i = 0; i < ink.length; i++) { ink[i] = ink[i] ? 0 : 1; }
      inverted = true;
      fraction = 1 - fraction;
    }

    return { ink: ink, width: w, height: h, inverted: inverted, inkFraction: fraction };
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

  // 2.5 / 2.6 -> { cells: [{ row, col, empty, bitmap28 }] x81 }
  function extractCells(/* warped, opts */) {
    throw notImplemented('extractCells', '2.5');
  }

  // 3 -> { digit, confidence, candidates: [[digit, p], [digit, p]] }
  function classify(/* bitmap28, opts */) {
    throw notImplemented('classify', '3');
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
        if (opts.debug) { result.debug.cells = cells.cells; }

        var i, cell, guess, r, c;
        for (i = 0; i < cells.cells.length; i++) {
          cell = cells.cells[i];
          r = cell.row; c = cell.col;
          if (cell.empty) { result.confidence[r][c] = 1; continue; }
          guess = classify(cell.bitmap28, opts);
          result.grid[r][c] = guess.digit;
          result.confidence[r][c] = guess.confidence;
          result.candidates[r][c] = guess.candidates;
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

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  return {
    defaults: defaults,
    extract: extract,
    parseBoard: parseBoard,
    boardToString: boardToString,
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
      classify: classify
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = SudokuVision; }
