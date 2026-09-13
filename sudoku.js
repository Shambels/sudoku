var solveBtn = document.getElementById('solveBtn');
var problemGrid = document.getElementById('problem');
var solutionGrid = document.getElementById('solution');
var alert_title = document.getElementById('alert');
var selected;
var i;
var clues = Array.from(problemGrid.children);
var size = 9;

function displaySolution(grid) {
  let solutions = Array.from(solutionGrid.children);
  for (let x = 0; x < grid.length; x++) {
    for (let y = 0; y < grid[x].length; y++) {
      solutions[y + (x * grid.length)].innerHTML = grid[x][y];
    }
  }
  alert_title.innerHTML = "Done"
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

function setup() {
  for (let i = 0; i < problemGrid.children.length; i++) {
    const element = problemGrid.children[i];
    element.addEventListener('click', () => {
      selectSpot(element);
    });
    element.addEventListener('input', () => {
      clearConflicts();
    });
  }

}

function start() {
  clearConflicts();
  let grid = readGrid(clues);

  // Contradictory clues can never be solved, so report them instead of
  // running the solver on an impossible board.
  let conflicts = findConflicts(grid);
  if (conflicts.size > 0) {
    highlightConflicts(conflicts);
    alert_title.innerHTML = "Invalid Clues ! Check the highlighted cells.";
    return;
  }

  if (!hasEnoughClues(clues)) {
    alert_title.innerHTML = "Not Enough Clues ! Minimum is 17.";
    return;
  }

  alert_title.innerHTML = "Wait for It...";
  if (solve(grid)) {
    displaySolution(grid);
  } else {
    alert_title.innerHTML = "No Solution Found.";
  }
}

setup();
solveBtn.addEventListener('click', () => {
  start();
})