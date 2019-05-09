var solveBtn = document.getElementById('solveBtn');
var problemGrid = document.getElementById('problem');
var solutionGrid = document.getElementById('solution');
var alert = document.getElementById('alert');
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
  alert.innerHTML = "Done"
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
}

function selectSpot(target) {
  clues.forEach(element => {
    element.style.backgroundColor = " #fff"
  });
  selected = target;
  selected.style.outline = "none";
  selected.style.backgroundColor = "lightgray";
  handleKeyboardEvents(target);
}

function solve(grid) {
  let i = 0;
  let j = 0;
  if (isFull(grid)) {
    displaySolution(grid);
    return;
  } else {
    for (let x = 0; x < grid.length; x++) {
      for (let y = 0; y < grid[x].length; y++) {
        if (grid[x][y] == 0) {
          i = x;
          j = y;
          break;
        } else {
          continue;
        }
      }
    }
    let possibilities = getPossibleEntries(grid, i, j);
    for (let n = 1; n < 10; n++) {
      if (possibilities[n] != 0) {
        grid[i][j] = possibilities[n];
        solve(grid);
      }
    }
    // BackTrack    
    grid[i][j] = 0;
  }
}

function setup() {
  for (let i = 0; i < problemGrid.children.length; i++) {
    const element = problemGrid.children[i];
    element.addEventListener('click', () => {
      selectSpot(element);
    });
  }

}

function start() {
  if (hasEnoughClues(clues)) {
    alert.innerHTML = "Wait for It...";
    let grid = readGrid(clues);
    solve(grid);
  } else {
    alert.innerHTML = "Not Enough Clues ! Minimum is 17."
  }
}

setup();
solveBtn.addEventListener('click', () => {
  start();
})