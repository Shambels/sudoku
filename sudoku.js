function exportToTxt(board) {
  let string = "";
  string = string + "---------------------\n";
  for (let x = 0; x < 9; x++) {
    if (x === 3 || x === 6) {
      string = string + "---------------------\n";
    }
    for (let y = 0; y < 9; y++) {
      if (y === 3 || y === 6) {
        string = string + "|";
      }
      string = string + board[x][y].str() + " ";
    }
    string = string + "\n";
  }
  string = string + "---------------------\n"
  return string
}

function exportToConsole(board) {  
  console.log("---------------------");
  for (let x = 0; x < 9; x++) {
    if (x === 3 || x === 6) {
      console.log("---------------------");
    }
    for (let y = 0; y < 9; y++) {
      if (y === 3 || y === 6) {
        console.log("|");
      }
      console.log(board[x][y]);
    }
    console.log();
  }
  console.log("---------------------");
}

function isFull(board) {
  for (let x = 0; x < 9; x++) {
    for (let y = 0; y < 9; y++) {
      if (board[x][y] == 0) {
        return false;
      }
    }
  }
  return true;
}

function getPossibleEntries(board, i, j) {  
  let possibleEntries = [];

  for (let n = 1; n < 10; n++) {
    possibleEntries[n] = 0;
  }

  // Horizontal
  for (let x = 0; x < 9; x++) {
    if (board[i][x] != 0) {
      possibleEntries[board[i][x]] = 1;
    }
  }
  // Vertical
  for (let y = 0; y < 9; y++) {
    if (board[y][j] != 0) {
      possibleEntries[board[y][j]] = 1;
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
      if (board[x][y] != 0) {
        possibleEntries[board[x][y]] = 1;
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

function solve(board) { 
  // console.log('ENTER'); 
  let i = 0;
  let j = 0;
  if (isFull(board)) {
    console.log("Success");
    exportToConsole(board);
    return;

  } else {
    // Find first vacant spot    
    for (let x = 0; x < 9; x++) {
      for (let y = 0; y < 9; y++) {
        if (board[x][y] == 0) {
          i = x;
          j = y;
          break;
        }
        else {
          continue;
        }
      }
      // break;
    }
    let possibilities = getPossibleEntries(board, i, j);    
    // console.log('possibilities: ',i, j,  possibilities);
    for (let n = 1; n < 10; n++) {
      if (possibilities[n] != 0) {        
        board[i][j] = possibilities[n];
        // setTimeout(() => {
          solve(board);
        // }, 1);
      }
    }
    // BackTrack
    // console.log('backtrack');
    board[i][j] = 0;
  }
  if (board[i][j] != 0) {
    // console.log('EXIT');  
  }
}

function startBoard() {
  let sudokuBoard = new Array(9);
  for (let x = 0; x < 9; x++) {
    sudokuBoard[x] = new Array(9);
  }
  sudokuBoard[0][0] = 0
  sudokuBoard[0][1] = 0
  sudokuBoard[0][2] = 8
  sudokuBoard[0][3] = 7
  sudokuBoard[0][4] = 3
  sudokuBoard[0][5] = 4
  sudokuBoard[0][6] = 1
  sudokuBoard[0][7] = 6
  sudokuBoard[0][8] = 0
  sudokuBoard[1][0] = 1
  sudokuBoard[1][1] = 0
  sudokuBoard[1][2] = 0
  sudokuBoard[1][3] = 0
  sudokuBoard[1][4] = 8
  sudokuBoard[1][5] = 5
  sudokuBoard[1][6] = 0
  sudokuBoard[1][7] = 0
  sudokuBoard[1][8] = 0
  sudokuBoard[2][0] = 7
  sudokuBoard[2][1] = 0
  sudokuBoard[2][2] = 0
  sudokuBoard[2][3] = 0
  sudokuBoard[2][4] = 1
  sudokuBoard[2][5] = 9
  sudokuBoard[2][6] = 0
  sudokuBoard[2][7] = 0
  sudokuBoard[2][8] = 0
  sudokuBoard[3][0] = 0
  sudokuBoard[3][1] = 0
  sudokuBoard[3][2] = 3
  sudokuBoard[3][3] = 0
  sudokuBoard[3][4] = 9
  sudokuBoard[3][5] = 0
  sudokuBoard[3][6] = 0
  sudokuBoard[3][7] = 0
  sudokuBoard[3][8] = 0
  sudokuBoard[4][0] = 0
  sudokuBoard[4][1] = 2
  sudokuBoard[4][2] = 0
  sudokuBoard[4][3] = 5
  sudokuBoard[4][4] = 0
  sudokuBoard[4][5] = 0
  sudokuBoard[4][6] = 9
  sudokuBoard[4][7] = 1
  sudokuBoard[4][8] = 3
  sudokuBoard[5][0] = 9
  sudokuBoard[5][1] = 0
  sudokuBoard[5][2] = 0
  sudokuBoard[5][3] = 3
  sudokuBoard[5][4] = 0
  sudokuBoard[5][5] = 0
  sudokuBoard[5][6] = 0
  sudokuBoard[5][7] = 0
  sudokuBoard[5][8] = 7
  sudokuBoard[6][0] = 0
  sudokuBoard[6][1] = 0
  sudokuBoard[6][2] = 6
  sudokuBoard[6][3] = 0
  sudokuBoard[6][4] = 0
  sudokuBoard[6][5] = 3
  sudokuBoard[6][6] = 8
  sudokuBoard[6][7] = 0
  sudokuBoard[6][8] = 1
  sudokuBoard[7][0] = 3
  sudokuBoard[7][1] = 0
  sudokuBoard[7][2] = 0
  sudokuBoard[7][3] = 0
  sudokuBoard[7][4] = 0
  sudokuBoard[7][5] = 0
  sudokuBoard[7][6] = 0
  sudokuBoard[7][7] = 2
  sudokuBoard[7][8] = 0
  sudokuBoard[8][0] = 0
  sudokuBoard[8][1] = 0
  sudokuBoard[8][2] = 0
  sudokuBoard[8][3] = 9
  sudokuBoard[8][4] = 0
  sudokuBoard[8][5] = 0
  sudokuBoard[8][6] = 3
  sudokuBoard[8][7] = 4
  sudokuBoard[8][8] = 0  
  exportToConsole(sudokuBoard);
  solve(sudokuBoard);
}

startBoard();