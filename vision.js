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

  // 2.2 -> Uint8Array, 1 = ink
  function adaptiveThreshold(/* grayImage, opts */) {
    throw notImplemented('adaptiveThreshold', '2.2');
  }

  // 2.3 -> { corners: [{x,y} x4], source: 'blob' | 'fullFrame' } or null
  function findGrid(/* binary, width, height, opts */) {
    throw notImplemented('findGrid', '2.3');
  }

  // 2.4 -> canvas, 9 * cellSize square
  function warpToSquare(/* grayImage, corners, opts */) {
    throw notImplemented('warpToSquare', '2.4');
  }

  // 2.5 / 2.6 -> { cells: [{ row, col, empty, bitmap28 }] x81 }
  function extractCells(/* warpedCanvas, opts */) {
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
        grid: emptyBoard(0), confidence: emptyBoard(0), candidates: emptyBoard(null),
        uncertain: [], corners: null, warped: null, debug: null, timings: t,
        input: { width: canvas.width, height: canvas.height }
      };

      try {
        var mark = t0;
        var gray = toGray(readPixels(canvas));
        t.gray = lap();
        if (opts.debug) { result.debug = { source: canvas, gray: grayToCanvas(gray) }; }

        var binary = adaptiveThreshold(gray, opts);
        t.threshold = lap();
        if (opts.debug) { result.debug.binary = binaryToCanvas(binary, gray.width, gray.height); }

        var grid = findGrid(binary, gray.width, gray.height, opts);
        t.detect = lap();
        if (!grid) {
          result.reason = "Couldn't find a sudoku grid in that image. Try a flatter, better-lit shot with the whole grid in frame.";
          return finish(result);
        }
        result.corners = grid.corners;

        result.warped = warpToSquare(gray, grid.corners, opts);
        t.warp = lap();

        var cells = extractCells(result.warped, opts);
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
