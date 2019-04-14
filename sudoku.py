


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

# recursive function which solved the board and 
# prints it. 
def sudokuSolver(board):
    
    i = 0
    j = 0
    
    possiblities = {}
    
    # if board is full, there is no need to solve it any further
    if isFull(board):
        print("Board Solved Successfully!")
        printBoard(board)
        return
    else:
        # find the first vacant spot
        for x in range (0, 9):
            for y in range (0, 9):
                if board[x][y] == 0:
                    i = x
                    j = y
                    break
            else:
                continue
            break
        
        # get all the possibilities for i,j
        possiblities = possibleEntries(board, i, j)
        
        # go through all the possibilities and call the the function
        # again and again
        for x in range (1, 10):
            if not possiblities[x] == 0:
                board[i][j] = possiblities[x]
                #file.write(printFileBoard(board))
                sudokuSolver(board)
        # backtrack
        board[i][j] = 0

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
    sudokuSolver(SudokuBoard)
    #file.close()
    
if __name__ == "__main__":
    main()


