


#file = open("output.txt","w")

# function to print the board on to a file.
# returns a string variable with the board info
def printFileBoard(board):
    string = ""
    string = string + "---------------------\n"
    for x in range(0, 9):
        if x == 3 or x == 6:
            string = string + "---------------------\n"
        for y in range(0, 9):
            if y == 3 or y == 6:
                string = string + " | "
            string = string + str(board[x][y]) + " "
        string = string + "\n"
    string = string + "---------------------\n"
    return string

# function to print the board on to the console
def printBoard(board):
    print("---------------------")
    for x in range(0, 9):
        if x == 3 or x == 6:
            print("---------------------")
        for y in range(0, 9):
            if y == 3 or y == 6:
                print("|", end=" ")
            print(board[x][y], end=" ")
        print()
    print("---------------------")
    
# function to check if the board is full or not
# returns true if it is full and false if it isn't
# it works on the fact that if it finds at least one 
# zero in the board it returns false
def isFull(board):
    for x in range(0, 9):
        for y in range (0, 9):
            if board[x][y] == 0:
                return False
    return True
    
# Returns a dictionnary with {[x,y][]}
def possibleEntries(board, i, j):
    
    possibilityArray = {}
    
    for n in range (1, 10):
        possibilityArray[n] = 0
    
    #For horizontal entries
    for x in range (0, 9):
        if not board[i][x] == 0: 
            possibilityArray[board[i][x]] = 1
     
    #For vertical entries
    for y in range (0, 9):
        if not board[y][j] == 0: 
            possibilityArray[board[y][j]] = 1
            
    #For squares of three x three
    k = 0
    l = 0
    if i >= 0 and i <= 2:
        k = 0
    elif i >= 3 and i <= 5:
        k = 3
    else:
        k = 6
    if j >= 0 and j <= 2:
        l = 0
    elif j >= 3 and j <= 5:
        l = 3
    else:
        l = 6
    for x in range (k, k + 3):
        for y in range (l, l + 3):
            if not board[x][y] == 0:
                possibilityArray[board[x][y]] = 1          
    
    for x in range (1, 10):
        if possibilityArray[x] == 0:
            possibilityArray[x] = x
        else:
            possibilityArray[x] = 0    
    return possibilityArray

# Collects the (x, y) coordinates of every clue that breaks a rule:
# a duplicate inside a row, a column or a 3x3 box, or a value outside 1-9.
# Returns a set of coordinates, empty when the board is consistent.
def findConflicts(board):
    conflicts = set()

    def checkGroup(cells):
        seen = {}
        for x, y in cells:
            value = board[x][y]
            if value == 0:
                continue
            seen.setdefault(value, []).append((x, y))
        for value, cells in seen.items():
            if len(cells) > 1:
                conflicts.update(cells)

    for x in range(0, 9):
        checkGroup([(x, y) for y in range(0, 9)])
        checkGroup([(y, x) for y in range(0, 9)])

    for k in range(0, 9, 3):
        for l in range(0, 9, 3):
            checkGroup([(x, y) for x in range(k, k + 3)
                        for y in range(l, l + 3)])

    # A value that isn't a digit from 0 to 9 is invalid on its own.
    for x in range(0, 9):
        for y in range(0, 9):
            if not isinstance(board[x][y], int) or not 0 <= board[x][y] <= 9:
                conflicts.add((x, y))

    return conflicts

# prints the board with every conflicting clue marked by a trailing *
def printConflicts(board, conflicts):
    print("---------------------")
    for x in range(0, 9):
        if x == 3 or x == 6:
            print("---------------------")
        for y in range(0, 9):
            if y == 3 or y == 6:
                print("|", end=" ")
            mark = "*" if (x, y) in conflicts else " "
            print(str(board[x][y]) + mark, end="")
        print()
    print("---------------------")

# returns (i, j) of the first vacant spot, or None if the board is full
def findEmptySpot(board):
    for x in range(0, 9):
        for y in range(0, 9):
            if board[x][y] == 0:
                return x, y
    return None

# recursive function which solves the board in place.
# returns True as soon as a solution is found, so the search stops at the
# first solution instead of exploring the whole tree; returns False if this
# branch has no solution.
def sudokuSolver(board):

    spot = findEmptySpot(board)
    if spot is None:
        return True
    i, j = spot

    # get all the possibilities for i,j
    possiblities = possibleEntries(board, i, j)

    # go through all the possibilities and call the function
    # again and again
    for x in range(1, 10):
        if not possiblities[x] == 0:
            board[i][j] = possiblities[x]
            #file.write(printFileBoard(board))
            if sudokuSolver(board):
                return True
    # backtrack
    board[i][j] = 0
    return False

def main():
    SudokuBoard = [[0 for x in range(9)] for x in range(9)]
    SudokuBoard[0][0] = 0
    SudokuBoard[0][1] = 0
    SudokuBoard[0][2] = 8
    SudokuBoard[0][3] = 7
    SudokuBoard[0][4] = 3
    SudokuBoard[0][5] = 4
    SudokuBoard[0][6] = 1
    SudokuBoard[0][7] = 6
    SudokuBoard[0][8] = 0
    SudokuBoard[1][0] = 1
    SudokuBoard[1][1] = 0
    SudokuBoard[1][2] = 0
    SudokuBoard[1][3] = 0
    SudokuBoard[1][4] = 8
    SudokuBoard[1][5] = 5
    SudokuBoard[1][6] = 0
    SudokuBoard[1][7] = 0
    SudokuBoard[1][8] = 0
    SudokuBoard[2][0] = 7
    SudokuBoard[2][1] = 0
    SudokuBoard[2][2] = 0
    SudokuBoard[2][3] = 0
    SudokuBoard[2][4] = 1
    SudokuBoard[2][5] = 9
    SudokuBoard[2][6] = 0
    SudokuBoard[2][7] = 0
    SudokuBoard[2][8] = 0
    SudokuBoard[3][0] = 0
    SudokuBoard[3][1] = 0
    SudokuBoard[3][2] = 3
    SudokuBoard[3][3] = 0
    SudokuBoard[3][4] = 9
    SudokuBoard[3][5] = 0
    SudokuBoard[3][6] = 0
    SudokuBoard[3][7] = 0
    SudokuBoard[3][8] = 0
    SudokuBoard[4][0] = 0
    SudokuBoard[4][1] = 2
    SudokuBoard[4][2] = 0
    SudokuBoard[4][3] = 5
    SudokuBoard[4][4] = 0
    SudokuBoard[4][5] = 0
    SudokuBoard[4][6] = 9
    SudokuBoard[4][7] = 1
    SudokuBoard[4][8] = 3
    SudokuBoard[5][0] = 9
    SudokuBoard[5][1] = 0
    SudokuBoard[5][2] = 0
    SudokuBoard[5][3] = 3
    SudokuBoard[5][4] = 0
    SudokuBoard[5][5] = 0
    SudokuBoard[5][6] = 0
    SudokuBoard[5][7] = 0
    SudokuBoard[5][8] = 7
    SudokuBoard[6][0] = 0
    SudokuBoard[6][1] = 0
    SudokuBoard[6][2] = 6
    SudokuBoard[6][3] = 0
    SudokuBoard[6][4] = 0
    SudokuBoard[6][5] = 3
    SudokuBoard[6][6] = 8
    SudokuBoard[6][7] = 0
    SudokuBoard[6][8] = 1
    SudokuBoard[7][0] = 3
    SudokuBoard[7][1] = 0
    SudokuBoard[7][2] = 0
    SudokuBoard[7][3] = 0
    SudokuBoard[7][4] = 0
    SudokuBoard[7][5] = 0
    SudokuBoard[7][6] = 0
    SudokuBoard[7][7] = 2
    SudokuBoard[7][8] = 0
    SudokuBoard[8][0] = 0
    SudokuBoard[8][1] = 0
    SudokuBoard[8][2] = 0
    SudokuBoard[8][3] = 9
    SudokuBoard[8][4] = 0
    SudokuBoard[8][5] = 0
    SudokuBoard[8][6] = 3
    SudokuBoard[8][7] = 4
    SudokuBoard[8][8] = 0
    printBoard(SudokuBoard)

    # Contradictory clues can never be solved, so report them instead of
    # running the solver on an impossible board.
    conflicts = findConflicts(SudokuBoard)
    if conflicts:
        print("Invalid Clues! " + str(len(conflicts)) +
              " cell(s) break the rules, marked with * below:")
        printConflicts(SudokuBoard, conflicts)
        for x, y in sorted(conflicts):
            print("  row " + str(x + 1) + ", column " + str(y + 1) +
                  ": " + str(SudokuBoard[x][y]))
        return

    if sudokuSolver(SudokuBoard):
        print("Board Solved Successfully!")
        printBoard(SudokuBoard)
    else:
        print("No Solution Found.")
    #file.close()
    
if __name__ == "__main__":
    main()


