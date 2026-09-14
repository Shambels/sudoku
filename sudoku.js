// The DOM lookups are guarded so this file can also be loaded by a page that has
// no grid - test-vision.html does exactly that, to measure the real repair code
// rather than a copy of it that could drift away from what the app runs.
var solveBtn = document.getElementById('solveBtn');
var problemGrid = document.getElementById('problem');
var solutionGrid = document.getElementById('solution');
var alert_title = document.getElementById('alert');
var selected;
var i;
var clues = problemGrid ? Array.from(problemGrid.children) : [];
var size = 9;

// The message line under the boards. `kind` picks the colour: ok, error, busy.
function setAlert(text, kind) {
  if (!alert_title) {
    return;
  }
  alert_title.textContent = text || '';
  if (kind) {
    alert_title.dataset.kind = kind;
  } else {
    delete alert_title.dataset.kind;
  }
}

// The solution panel exists only while it shows a solution to the clues that are
// on the board right now. Any edit to the clues makes it stale, so it goes away.
function showSolutionPanel() {
  const panel = document.getElementById('solutionPanel');
  if (!panel) {
    return;
  }
  panel.hidden = false;
  panel.classList.remove('reveal');
  void panel.offsetWidth;   // restart the animation if it is already showing
  panel.classList.add('reveal');
  // On a phone the solution lands below the fold; bring it up without a jump.
  if (panel.scrollIntoView) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function hideSolutionPanel() {
  const panel = document.getElementById('solutionPanel');
  if (!panel || panel.hidden) {
    return;
  }
  panel.hidden = true;
  panel.classList.remove('reveal');
  setAlert('');
}

function displaySolution(grid, given) {
  let solutions = Array.from(solutionGrid.children);
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      const cell = solutions[y + (x * grid.length)];
      cell.textContent = grid[x][y];
      // The clues stay plain; only the digits the solver found light up.
      cell.classList.toggle('given', Boolean(given && given[x][y]));
    }
  }
  showSolutionPanel();
  setAlert('Solved.', 'ok');
}

function getPossibleEntries(grid, i, j) {
  let possibleEntries = [];

  for (let n = 1; n < 10; n++) {
    possibleEntries[n] = 0;
  }

  // Horizontal
  for (let x = 0; x < grid.length; x++) {
    if (grid[i][x] != 0) {
      possibleEntries[grid[i][x]] = 1;
    }
  }
  // Vertical
  for (let y = 0; y < grid.length; y++) {
    if (grid[y][j] != 0) {
      possibleEntries[grid[y][j]] = 1;
    }
  }
  // Squares
  let k = 0;
  let l = 0;
  if (i >= 0 && i <= 2) {
    k = 0;
  } else if (i >= 3 && i <= 5) {
    k = 3;
  } else {
    k = 6;
  }
  if (j >= 0 && j <= 2) {
    l = 0;
  } else if (j >= 3 && j <= 5) {
    l = 3;
  } else {
    l = 6;
  }
  for (let x = k; x < k + 3; x++) {
    for (let y = l; y < l + 3; y++) {
      if (grid[x][y] != 0) {
        possibleEntries[grid[x][y]] = 1;
      }
    }
  }

  for (let n = 1; n < 10; n++) {
    if (possibleEntries[n] == 0) {
      possibleEntries[n] = n;
    } else {
      possibleEntries[n] = 0;
    }
  }
  return possibleEntries;
}

function handleKeyboardEvents(target) {
  target.addEventListener('keydown', keyBindings);
}

function hasEnoughClues(inputs) {
  let clues = [];
  inputs.forEach(spot => {
    if (spot.value.length > 0 && spot.value != 0) {
      clues.push(spot);
    }
  });
  if (clues.length > 16) {
    return true;
  }
  return false;

}

function isEmpty(inputs) {
  let empty = true;
  inputs.forEach(spot => {
    if (spot.value.length > 0) {
      empty = false
    }
  });
  return empty;
}

function isFull(grid) {
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      if (grid[x][y] == 0) {
        return false;
      }
    }
  }
  return true;
}

function readGrid(inputs) {
  let value;
  let grid = new Array(size);

  for (let x = 0; x < grid.length; x++) {
    grid[x] = new Array(size);
    for (let y = 0; y < grid[x].length; y++) {
      value = inputs[y + (x * grid.length)].value
      if (value.length > 0) {
        grid[x][y] = parseInt(value, 10)
      } else {
        grid[x][y] = 0;
      }
    }
  }
  return grid;
}

function keyBindings() {
  event.preventDefault();
  const before = selected.value;
  switch (event.which) {
    // LEFT
    case 37:
      i = (clues.indexOf(selected)) - 1;
      if (i < 0) {
        i = clues.indexOf(selected);
      }
      selectSpot(clues[i]);
      break;
    // UP
    case 38:
      i = (clues.indexOf(selected)) - 9;
      if (i < 0) {
        i = clues.indexOf(selected);
      }
      selectSpot(clues[i]);
      break;
    // RIGHT
    case 39:
      i = (clues.indexOf(selected)) + 1;
      if (i > 80) {
        i = clues.indexOf(selected);
      }
      selectSpot(clues[i]);
      break;
    // DOWN 
    case 40:
      i = (clues.indexOf(selected)) + 9;
      if (i > 80) {
        i = clues.indexOf(selected);
      }
      selectSpot(clues[i]);
      break;
    case 8:
      selected.value = "";
      break;
    case 46:
      selected.value = "";
    default:
      break;
  }
  // NUMBERS
  if (event.key >= 0 && event.key < 10) {
    selected.value = event.key;
  }
  // Setting .value in code fires no 'input' event, so clear here too.
  clearConflicts();
  if (selected.value !== before) {
    hideSolutionPanel();
  }
}

function selectSpot(target) {
  clues.forEach(element => {
    element.classList.remove('selected');
  });
  selected = target;
  selected.style.outline = "none";
  selected.classList.add('selected');
  handleKeyboardEvents(target);
}

// Collects the grid indices (y + x * size) of every clue that breaks a rule:
// a duplicate inside a row, a column or a 3x3 box, or a value outside 1-9.
function findConflicts(grid) {
  let conflicts = new Set();

  function checkGroup(cells) {
    let seen = {};
    cells.forEach(cell => {
      let value = grid[cell[0]][cell[1]];
      if (value == 0 || isNaN(value)) {
        return;
      }
      if (seen[value] === undefined) {
        seen[value] = [];
      }
      seen[value].push(cell);
    });
    for (let value in seen) {
      if (seen[value].length > 1) {
        seen[value].forEach(cell => {
          conflicts.add(cell[1] + (cell[0] * size));
        });
      }
    }
  }

  for (let x = 0; x < size; x++) {
    let row = [];
    let column = [];
    for (let y = 0; y < size; y++) {
      row.push([x, y]);
      column.push([y, x]);
    }
    checkGroup(row);
    checkGroup(column);
  }

  for (let k = 0; k < size; k += 3) {
    for (let l = 0; l < size; l += 3) {
      let box = [];
      for (let x = k; x < k + 3; x++) {
        for (let y = l; y < l + 3; y++) {
          box.push([x, y]);
        }
      }
      checkGroup(box);
    }
  }

  // A value that isn't a digit from 1 to 9 is invalid on its own.
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let value = grid[x][y];
      if (isNaN(value) || value < 0 || value > 9) {
        conflicts.add(y + (x * size));
      }
    }
  }

  return conflicts;
}

function clearConflicts() {
  clues.forEach(spot => {
    spot.classList.remove('conflict');
  });
}

function highlightConflicts(conflicts) {
  conflicts.forEach(index => {
    clues[index].classList.add('conflict');
  });
}

function findEmptySpot(grid) {
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      if (grid[x][y] == 0) {
        return [x, y];
      }
    }
  }
  return null;
}

// Returns true as soon as a solution is found, so the search stops
// at the first solution instead of exploring the whole tree.
function solve(grid) {
  let spot = findEmptySpot(grid);
  if (spot === null) {
    return true;
  }
  let i = spot[0];
  let j = spot[1];

  let possibilities = getPossibleEntries(grid, i, j);
  for (let n = 1; n < 10; n++) {
    if (possibilities[n] != 0) {
      grid[i][j] = possibilities[n];
      if (solve(grid)) {
        return true;
      }
    }
  }
  // BackTrack
  grid[i][j] = 0;
  return false;
}


// ---------------------------------------------------------------------------
// Uniqueness, used by the photo repair below.
//
// solve() above stops at the first solution, which cannot tell a board with one
// solution from a board with hundreds. Counting to two is enough to answer the
// only question that matters: is this reading of the photo the unique one?
//
// This picks the most constrained cell rather than the first empty one. With the
// first-empty order a wrong clue can send the search down a branch that takes
// minutes; with fewest-candidates-first the same board resolves in milliseconds.
// The node budget is the backstop: a search that blows it reports itself as
// unfinished rather than freezing the page.
function countSolutions(grid, limit, budget) {
  let board = grid.map(row => row.slice());
  let found = 0;
  let nodes = 0;
  let exhausted = false;

  function mostConstrained() {
    let best = null;
    let bestCount = 10;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if (board[x][y] !== 0) {
          continue;
        }
        let possible = getPossibleEntries(board, x, y);
        let count = 0;
        for (let n = 1; n < 10; n++) {
          if (possible[n] !== 0) {
            count++;
          }
        }
        if (count === 0) {
          return { dead: true };
        }
        if (count < bestCount) {
          bestCount = count;
          best = { x: x, y: y, possible: possible };
          if (count === 1) {
            return { spot: best };
          }
        }
      }
    }
    return best ? { spot: best } : { full: true };
  }

  function search() {
    if (found >= limit || exhausted) {
      return;
    }
    if (++nodes > budget) {
      exhausted = true;
      return;
    }
    let next = mostConstrained();
    if (next.dead) {
      return;
    }
    if (next.full) {
      found++;
      return;
    }
    let spot = next.spot;
    for (let n = 1; n < 10; n++) {
      if (spot.possible[n] === 0) {
        continue;
      }
      board[spot.x][spot.y] = spot.possible[n];
      search();
      board[spot.x][spot.y] = 0;
      if (found >= limit || exhausted) {
        return;
      }
    }
  }

  search();
  return { count: found, exhausted: exhausted, nodes: nodes };
}

// ---------------------------------------------------------------------------
// Solver-assisted repair (plan section 5.2).
//
// The solver is a second opinion on the photo. A misread digit usually makes the
// board unsolvable, so trying the classifier's runner-up guesses for the cells it
// was least sure about, and keeping the combination that produces exactly one
// solution, turns a good per-cell accuracy into a much better per-grid one.
//
// The rule is deliberately strict: adopt only when exactly one combination gives a
// uniquely solvable board. If several do, the photo genuinely is ambiguous and the
// honest move is to flag them all and let a person look, not to guess.
var REPAIR = {
  cells: 4,          // least-confident cells to reconsider
  maxBoards: 48,     // ceiling on combinations tried
  budget: 150000     // search nodes per uniqueness check
};

function repairBoard(extraction) {
  const base = extraction.grid.map(row => row.slice());
  const clean = { grid: base, changed: [], status: 'unchanged', tried: 0 };

  if (findConflicts(base).size === 0) {
    let check = countSolutions(base, 2, REPAIR.budget);
    if (check.count === 1) {
      clean.status = 'already unique';
      return clean;
    }
    if (check.exhausted) {
      clean.status = 'search budget exhausted';
      return clean;
    }
  }

  // Cells worth reconsidering, least confident first. A cell the classifier called
  // background counts too: its best digit candidate is exactly the missing clue.
  let suspects = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let candidates = extraction.candidates[x][y];
      if (!candidates) {
        continue;
      }
      let alternatives = SudokuVision.digitCandidates(candidates, 2)
        .map(entry => entry[0])
        .filter(digit => digit !== base[x][y]);
      if (!alternatives.length) {
        continue;
      }
      suspects.push({
        x: x, y: y,
        confidence: extraction.confidence[x][y],
        options: [base[x][y]].concat(alternatives.slice(0, 1))
      });
    }
  }
  suspects.sort((a, b) => a.confidence - b.confidence);
  suspects = suspects.slice(0, REPAIR.cells);
  if (!suspects.length) {
    clean.status = 'nothing to reconsider';
    return clean;
  }

  let winners = [];
  let tried = 0;
  const total = suspects.reduce((n, s) => n * s.options.length, 1);

  for (let mask = 0; mask < total && tried < REPAIR.maxBoards; mask++) {
    let rest = mask;
    let trial = base.map(row => row.slice());
    let changes = [];
    for (let i = 0; i < suspects.length; i++) {
      let spot = suspects[i];
      let pick = spot.options[rest % spot.options.length];
      rest = Math.floor(rest / spot.options.length);
      if (pick !== base[spot.x][spot.y]) {
        trial[spot.x][spot.y] = pick;
        changes.push([spot.x, spot.y, base[spot.x][spot.y], pick]);
      }
    }
    if (!changes.length) {
      continue;   // this is the board we already rejected
    }
    tried++;
    if (findConflicts(trial).size > 0) {
      continue;
    }
    let check = countSolutions(trial, 2, REPAIR.budget);
    if (check.count === 1 && !check.exhausted) {
      winners.push({ grid: trial, changed: changes });
    }
  }

  if (winners.length === 1) {
    return { grid: winners[0].grid, changed: winners[0].changed,
             status: 'repaired', tried: tried };
  }
  return { grid: base, changed: [], tried: tried,
           status: winners.length ? 'ambiguous' : 'no repair found',
           ambiguous: winners.length };
}

// ---------------------------------------------------------------------------
// Reading a puzzle from a photo.

function fillGrid(grid) {
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      clues[y + (x * size)].value = grid[x][y] ? String(grid[x][y]) : '';
    }
  }
  hideSolutionPanel();
}

// The photo card holds two canvases that are rarely both in use. It shows only
// while at least one of them has something to show, and never as an empty box.
function setCanvasVisible(id, visible) {
  const canvas = document.getElementById(id);
  if (!canvas) {
    return;
  }
  const figure = canvas.closest('figure');
  if (figure) {
    figure.hidden = !visible;
  } else {
    canvas.hidden = !visible;
  }
  const wrap = document.getElementById('previewWrap');
  if (wrap) {
    const figures = Array.from(wrap.querySelectorAll('figure'));
    const wasHidden = wrap.hidden;
    wrap.hidden = figures.every(f => f.hidden);
    // A card that has just appeared, or that needs four clicks, must be open;
    // otherwise whatever the person chose stays.
    if (!wrap.hidden && (wasHidden || (id === 'picker' && visible))) {
      wrap.open = true;
    }
    const hint = document.getElementById('previewHint');
    if (hint) {
      hint.textContent = id === 'picker' && visible
        ? 'Set the corners'
        : (wrap.hidden ? '' : 'The rectified grid');
    }
  }
}

function clearUncertain() {
  clues.forEach(spot => spot.classList.remove('uncertain'));
}

function markUncertain(list) {
  list.forEach(([x, y]) => clues[y + (x * size)].classList.add('uncertain'));
}

function boardString(grid) {
  let out = '';
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      out += grid[x][y] ? String(grid[x][y]) : '.';
    }
  }
  return out;
}

function showPreview(canvas) {
  const preview = document.getElementById('preview');
  if (!preview || !canvas) {
    return;
  }
  preview.width = canvas.width;
  preview.height = canvas.height;
  preview.getContext('2d').drawImage(canvas, 0, 0);
  setCanvasVisible('preview', true);
}

function readPhoto(source, corners) {
  const status = document.getElementById('importStatus');
  const cornersBtn = document.getElementById('cornersBtn');
  clearConflicts();
  clearUncertain();
  hideSolutionPanel();
  setAlert('');
  status.textContent = 'Reading the photo...';

  SudokuVision.extract(source, corners ? { corners: corners } : {}).then(result => {
    if (!result.ok) {
      // A refusal is honest but not the end of it: someone looking at the photo can
      // see the grid even when the detector cannot, and four clicks are worth more
      // than any amount of further guessing.
      status.textContent = result.reason + ' Or press "Set corners by hand".';
      cornersBtn.hidden = false;
      return;
    }
    cornersBtn.hidden = false;
    showPreview(result.warped);

    const repair = repairBoard(result);
    const grid = repair.grid;
    fillGrid(grid);

    // Two independent reasons to doubt a cell: the classifier was unsure, or the
    // clue breaks a sudoku rule. Neither catches everything on its own; measured
    // against the fixtures, together they catch every wrong cell.
    const doubt = new Set(result.uncertain.map(([x, y]) => y + (x * size)));
    findConflicts(grid).forEach(index => doubt.add(index));
    repair.changed.forEach(([x, y]) => doubt.delete(y + (x * size)));
    markUncertain(Array.from(doubt).map(index => [Math.floor(index / size), index % size]));

    let count = 0;
    grid.forEach(row => row.forEach(v => { if (v) { count++; } }));

    let message = 'Read ' + count + ' clues';
    if (repair.status === 'repaired') {
      message += ', corrected ' + repair.changed.length +
                 (repair.changed.length === 1 ? ' cell' : ' cells') + ' using the solver';
    } else if (repair.status === 'ambiguous') {
      message += ', but ' + repair.ambiguous + ' different readings all solve';
    }
    message += doubt.size
      ? '. Check the ' + doubt.size + ' highlighted ' + (doubt.size === 1 ? 'cell' : 'cells') + '.'
      : '. Nothing looks doubtful.';
    status.textContent = message + (corners ? ' (read from the corners you set.)' : '');
    lastReadBoard = boardString(grid);
  }).catch(err => {
    status.textContent = 'Could not read that image: ' + err.message;
  });
}

var lastReadBoard = null;
var lastPhoto = null;      // the image itself, so corners can be set without reloading
var pickedCorners = [];

// Keep the decoded photo around so corners can be set, and re-set, without
// asking for the file again. A data URL rather than an object URL: on a file://
// page a blob URL has an opaque origin and reading the canvas then throws.
function loadPhoto(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      lastPhoto = img;
      pickedCorners = [];
      setCanvasVisible('picker', false);
      readPhoto(img);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function startCornerPicking() {
  if (!lastPhoto) {
    return;
  }
  const canvas = document.getElementById('picker');
  const status = document.getElementById('importStatus');
  setCanvasVisible('preview', false);
  pickedCorners = [];

  const scale = Math.min(560 / lastPhoto.naturalWidth, 560 / lastPhoto.naturalHeight, 1);
  canvas.width = Math.round(lastPhoto.naturalWidth * scale);
  canvas.height = Math.round(lastPhoto.naturalHeight * scale);
  setCanvasVisible('picker', true);
  canvas.dataset.scale = scale;
  drawPicker();
  status.textContent = 'Click the four corners of the grid: top-left, top-right, ' +
                       'bottom-right, bottom-left.';
}

function drawPicker() {
  const canvas = document.getElementById('picker');
  const ctx = canvas.getContext('2d');
  const scale = parseFloat(canvas.dataset.scale);
  ctx.drawImage(lastPhoto, 0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1f9d55';
  ctx.fillStyle = '#1f9d55';
  ctx.lineWidth = 2;
  ctx.font = '12px system-ui, sans-serif';
  pickedCorners.forEach((point, i) => {
    const x = point.x * scale, y = point.y * scale;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(['TL', 'TR', 'BR', 'BL'][i], x + 8, y - 6);
  });
  if (pickedCorners.length === 4) {
    ctx.beginPath();
    pickedCorners.forEach((point, i) => {
      const x = point.x * scale, y = point.y * scale;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
}

function setupCornerPicking() {
  const canvas = document.getElementById('picker');
  const status = document.getElementById('importStatus');
  if (!canvas) {
    return;
  }
  canvas.addEventListener('click', event => {
    if (!lastPhoto || pickedCorners.length >= 4) {
      return;
    }
    const box = canvas.getBoundingClientRect();
    const scale = parseFloat(canvas.dataset.scale);
    pickedCorners.push({
      x: (event.clientX - box.left) * (canvas.width / box.width) / scale,
      y: (event.clientY - box.top) * (canvas.height / box.height) / scale
    });
    drawPicker();
    if (pickedCorners.length === 4) {
      setCanvasVisible('picker', false);
      readPhoto(lastPhoto, pickedCorners.slice());
    } else {
      status.textContent = 'Now click the ' +
        ['top-left', 'top-right', 'bottom-right', 'bottom-left'][pickedCorners.length] +
        ' corner.';
    }
  });
}

function setupPhotoImport() {
  const picker = document.getElementById('photo');
  const button = document.getElementById('photoBtn');
  const cornersBtn = document.getElementById('cornersBtn');
  const status = document.getElementById('importStatus');
  if (!picker || !button || !cornersBtn || typeof SudokuVision === 'undefined') {
    return;
  }

  button.addEventListener('click', () => picker.click());
  picker.addEventListener('change', event => {
    if (event.target.files[0]) {
      loadPhoto(event.target.files[0]);
    }
  });

  // Drag and drop anywhere on the page, and paste from the clipboard - a phone
  // screenshot is usually already in the clipboard.
  //
  // dragenter/dragleave fire for every element the pointer crosses, so a plain
  // toggle flickers. Counting enters against leaves gives one steady highlight
  // for as long as the file is over the page.
  let dragDepth = 0;
  const draggingFiles = event =>
    event.dataTransfer && Array.from(event.dataTransfer.types).indexOf('Files') !== -1;

  document.addEventListener('dragenter', event => {
    if (!draggingFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth++;
    document.body.classList.add('dropping');
  });
  document.addEventListener('dragover', event => {
    if (!draggingFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', event => {
    if (!draggingFiles(event)) {
      return;
    }
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      document.body.classList.remove('dropping');
    }
  });
  document.addEventListener('drop', event => {
    event.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dropping');
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file && file.type.indexOf('image') === 0) {
      loadPhoto(file);
    } else if (file) {
      status.textContent = 'That is not an image file.';
    }
  });
  document.addEventListener('paste', event => {
    const item = Array.from(event.clipboardData.items)
      .find(entry => entry.type.indexOf('image') === 0);
    if (item) {
      loadPhoto(item.getAsFile());
    }
  });

  cornersBtn.addEventListener('click', () => startCornerPicking());

  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearAll());
  }

  setupCopyButtons();
}

// The solution grid as the same 81-character string the clues use.
function solutionString() {
  return Array.from(solutionGrid.children)
    .map(cell => cell.textContent.trim() || '.')
    .join('');
}

// One copy button per grid: the clues as typed or read, the solution once found.
// Feedback lives on the button itself - a tick and the word "Copied" for a
// moment - so the status lines stay about the photo and the solver.
function setupCopyButtons() {
  const pairs = [
    ['copyPuzzle', () => boardString(readGrid(clues))],
    ['copySolution', solutionString]
  ];
  pairs.forEach(([id, read]) => {
    const btn = document.getElementById(id);
    if (!btn) {
      return;
    }
    let timer = null;
    btn.addEventListener('click', () => {
      const text = read();
      const done = () => {
        btn.classList.add('copied');
        clearTimeout(timer);
        timer = setTimeout(() => btn.classList.remove('copied'), 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text) && done());
      } else if (fallbackCopy(text)) {
        done();
      }
    });
  });
}

// file:// pages in some browsers have no async clipboard; a hidden textarea does.
function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (err) {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

// Back to a blank page: no clues, no solution, no photo, no messages.
function clearAll() {
  clues.forEach(spot => {
    spot.value = '';
    spot.classList.remove('selected', 'conflict', 'uncertain');
  });
  selected = undefined;
  hideSolutionPanel();
  setAlert('');
  lastReadBoard = null;
  lastPhoto = null;
  pickedCorners = [];
  setCanvasVisible('picker', false);
  setCanvasVisible('preview', false);
  const cornersBtn = document.getElementById('cornersBtn');
  const status = document.getElementById('importStatus');
  if (cornersBtn) {
    cornersBtn.hidden = true;
  }
  if (status) {
    status.textContent = 'Pick a photo, drop one anywhere on the page, or paste one.';
  }
}

function setup() {
  if (!problemGrid) {
    return;
  }
  for (let i = 0; i < problemGrid.children.length; i++) {
    const element = problemGrid.children[i];
    element.addEventListener('click', () => {
      selectSpot(element);
    });
    element.addEventListener('focus', () => {
      selectSpot(element);
    });
    element.addEventListener('input', () => {
      clearConflicts();
      hideSolutionPanel();
    });
  }

}

function start() {
  clearConflicts();
  hideSolutionPanel();
  let grid = readGrid(clues);

  // Contradictory clues can never be solved, so report them instead of
  // running the solver on an impossible board.
  let conflicts = findConflicts(grid);
  if (conflicts.size > 0) {
    highlightConflicts(conflicts);
    setAlert('Invalid clues. Check the highlighted cells.', 'error');
    return;
  }

  if (!hasEnoughClues(clues)) {
    setAlert('Not enough clues. A sudoku needs at least 17.', 'error');
    return;
  }

  // The search runs on the main thread. Yielding once lets the browser paint the
  // "solving" state before a hard board locks it up for a moment.
  setAlert('Solving...', 'busy');
  solveBtn.disabled = true;
  const given = grid.map(row => row.slice());
  setTimeout(() => {
    try {
      if (solve(grid)) {
        displaySolution(grid, given);
      } else {
        setAlert('No solution found.', 'error');
      }
    } finally {
      solveBtn.disabled = false;
    }
  }, 30);
}

setup();
setupPhotoImport();
setupCornerPicking();
if (solveBtn) {
  solveBtn.addEventListener('click', () => {
    start();
  });
}