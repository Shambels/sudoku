


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

# Parses an 81-character board: row by row, '.' or '0' for an empty cell.
# The web app's "Copy board" button produces exactly this, so a puzzle read from
# a photo can be pasted straight in here.
def parseBoard(text):
    cells = [c for c in text if c.isdigit() or c == "."]
    if not len(cells) == 81:
        raise ValueError("expected 81 cells, got " + str(len(cells)))
    board = [[0 for x in range(9)] for x in range(9)]
    for index, cell in enumerate(cells):
        board[index // 9][index % 9] = 0 if cell == "." else int(cell)
    return board


def main():
    SudokuBoard = parseBoard(
        "..873416."
        "1...85..."
        "7...19..."
        "..3.9...."
        ".2.5..913"
        "9..3....7"
        "..6..38.1"
        "3......2."
        "...9..34.")
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


