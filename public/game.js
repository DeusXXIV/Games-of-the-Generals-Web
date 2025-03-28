// Connect to the Socket.io server
const socket = io();

// Board dimensions: 9 files (columns) × 8 ranks (rows)
const boardCols = 9;  // Files A through I
const boardRows = 8;  // Ranks 8 down to 1
const cellSize = 80;  // Each square is 80x80 pixels

// Global game state variables
let gamePhase = "setup";  // "setup" phase for rearrangements; "play" phase for normal moves
let localReady = false;
let opponentReady = false;  // Now the countdown starts solely from the server signal.
let countdownText; // For displaying the countdown
let countdownTimer;

// Define piece orders for each player (21 pieces per side)
const piecesOrder = [
  "5*G", "4*G", "3*G", "2*G", "1*G", 
  "COL", "LtCol", "MAJ", "CPT", "1LT", "2LT", "SGT",
  "PVT", "PVT", "PVT", "PVT", "PVT", "PVT",
  "SPY", "SPY", "FLG"
];

const blackPieces = [...piecesOrder];
const whitePieces = [...piecesOrder];

// Create an empty board layout (8 rows x 9 columns filled with empty strings)
let initialBoardLayout = [];
for (let r = 0; r < boardRows; r++) {
  initialBoardLayout[r] = Array(boardCols).fill("");
}

// --- Fill Black Deployment Zone ---
// Black deployment zone: Rows 0, 1, 2 (Ranks 8, 7, 6)
// Row 0 (Rank 8): Only columns 3, 4, 5 are occupied.
let bpIndex = 0;
[3, 4, 5].forEach(col => {
  initialBoardLayout[0][col] = blackPieces[bpIndex++];
});
// Row 1 (Rank 7): All columns (0–8) are occupied.
for (let col = 0; col < boardCols; col++) {
  initialBoardLayout[1][col] = blackPieces[bpIndex++];
}
// Row 2 (Rank 6): All columns (0–8) are occupied.
for (let col = 0; col < boardCols; col++) {
  initialBoardLayout[2][col] = blackPieces[bpIndex++];
}

// --- Fill White Deployment Zone ---
// White deployment zone: Rows 5, 6, 7 (Ranks 3, 2, 1)
let wpIndex = 0;
// Row 5 (Rank 3): Occupied only in columns 0, 3, 4, 5, 6.
[0, 3, 4, 5, 6].forEach(col => {
  initialBoardLayout[5][col] = whitePieces[wpIndex++];
});
// Row 6 (Rank 2): Occupied in columns 1, 2, 3, 4, 5, 7, 8.
[1, 2, 3, 4, 5, 7, 8].forEach(col => {
  initialBoardLayout[6][col] = whitePieces[wpIndex++];
});
// Row 7 (Rank 1): All columns occupied.
for (let col = 0; col < boardCols; col++) {
  initialBoardLayout[7][col] = whitePieces[wpIndex++];
}

// -----------------------------------------------------------------
// Phaser game configuration
// -----------------------------------------------------------------
const config = {
  type: Phaser.AUTO,
  width: boardCols * cellSize,
  height: boardRows * cellSize,
  backgroundColor: 0x2d2d2d,
  parent: "gameContainer", // Make sure index.html has a div with id "gameContainer"
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

// Global board state (mirrors initialBoardLayout)
let board = [];

// Preload assets (none needed here)
function preload() {
  // No assets to load since we're using text objects.
}

// Create the game scene
function create() {
  const scene = this;
  
  // Draw grid lines for the board
  const graphics = this.add.graphics();
  graphics.lineStyle(2, 0xffffff, 1);
  for (let i = 0; i <= boardCols; i++) {
    graphics.moveTo(i * cellSize, 0);
    graphics.lineTo(i * cellSize, boardRows * cellSize);
  }
  for (let j = 0; j <= boardRows; j++) {
    graphics.moveTo(0, j * cellSize);
    graphics.lineTo(boardCols * cellSize, j * cellSize);
  }
  graphics.strokePath();
  
  // Initialize board array from initialBoardLayout
  for (let row = 0; row < boardRows; row++) {
    board[row] = [];
    for (let col = 0; col < boardCols; col++) {
      board[row][col] = initialBoardLayout[row][col];
    }
  }
  
  // Render pieces as text objects
  scene.textObjects = [];
  for (let row = 0; row < boardRows; row++) {
    scene.textObjects[row] = [];
    for (let col = 0; col < boardCols; col++) {
      const piece = board[row][col];
      if (piece) {
        // Color-code: Black's pieces (rows 0–2) in blue, White's pieces (rows 5–7) in red,
        // and the middle (rows 3–4) in white.
        const textColor = (row < 3) ? "#0000ff" : (row >= 5 ? "#ff0000" : "#ffffff");
        let text = scene.add.text(
          col * cellSize + cellSize / 2,
          row * cellSize + cellSize / 2,
          piece,
          { font: "24px Arial", fill: textColor }
        );
        text.setOrigin(0.5);
        scene.textObjects[row][col] = text;
      } else {
        scene.textObjects[row][col] = null;
      }
    }
  }
  
  // Setup phase: listen for input clicks
  scene.input.on("pointerdown", function(pointer) {
    let col = Math.floor(pointer.x / cellSize);
    let row = Math.floor(pointer.y / cellSize);
    console.log("Clicked cell:", row, col);
    if (gamePhase === "setup") {
      handleSetupClick(scene, row, col);
    } else if (gamePhase === "play") {
      handlePlayClick(scene, row, col);
    }
  });
  
  // Listen for the synchronized start countdown event from the server.
  socket.on("startCountdown", function(data) {
    console.log("Received startCountdown event with data:", data);
    startCountdown(data.startTime);
  });
  
  // Listen for moves from other clients (for multiplayer)
  socket.on("move", function(data) {
    console.log("Received move from server:", data);
    processMove(scene, data.fromRow, data.fromCol, data.toRow, data.toCol, false);
  });
  
  // Set up the HTML ready button behavior.
  const readyButton = document.getElementById("readyButton");
  readyButton.addEventListener("click", function() {
    if (gamePhase === "setup" && !localReady) {
      localReady = true;
      readyButton.textContent = "Waiting...";
      readyButton.classList.add("waiting");
      socket.emit("ready", { ready: true });
      // The countdown will now be started by the server.
    }
  });
}

// During setup, allow rearrangements in friendly territory only.
// For this prototype, assume local (White) pieces are in rows 5–7.
let selectedPiece = null;
function handleSetupClick(scene, row, col) {
  if (!isFriendly(row)) return;
  
  if (selectedPiece) {
    if (isFriendly(row) && !board[row][col]) {
      movePiece(scene, selectedPiece.row, selectedPiece.col, row, col);
      selectedPiece = null;
    }
  } else {
    if (board[row][col]) {
      selectedPiece = { row, col };
      console.log(`Selected piece ${board[row][col]} at (${row}, ${col})`);
    }
  }
}

// During play, handle piece selection and moves.
function handlePlayClick(scene, row, col) {
  if (selectedPiece) {
    processMove(scene, selectedPiece.row, selectedPiece.col, row, col, true);
    selectedPiece = null;
  } else {
    if (board[row][col] && isFriendly(row)) {
      selectedPiece = { row, col };
      console.log(`Selected piece ${board[row][col]} at (${row}, ${col})`);
    }
  }
}

// For play phase, friendly pieces (local side) are in rows 5–7.
function isFriendly(row) {
  return row >= 5;
}

// Process a move (during play or rearrangement) and optionally broadcast it.
function processMove(scene, fromRow, fromCol, toRow, toCol, broadcast) {
  if (!board[fromRow][fromCol]) {
    console.log("No piece at the selected source cell.");
    return;
  }
  
  // If destination is occupied by an enemy, handle challenge (placeholder logic).
  if (board[toRow][toCol]) {
    if (isEnemy(fromRow, toRow)) {
      removePiece(scene, toRow, toCol);
      movePiece(scene, fromRow, fromCol, toRow, toCol);
    } else {
      console.log("Destination occupied by friendly piece.");
      return;
    }
  } else {
    movePiece(scene, fromRow, fromCol, toRow, toCol);
  }
  
  if (broadcast) {
    socket.emit("move", { fromRow, fromCol, toRow, toCol });
  }
}

// Moves a piece on the board and updates its visual text object.
function movePiece(scene, fromRow, fromCol, toRow, toCol) {
  const piece = board[fromRow][fromCol];
  board[fromRow][fromCol] = "";
  board[toRow][toCol] = piece;
  
  if (scene.textObjects[fromRow][fromCol]) {
    scene.textObjects[fromRow][fromCol].destroy();
    scene.textObjects[fromRow][fromCol] = null;
  }
  
  const textColor = (toRow < 3) ? "#0000ff" : (toRow >= 5 ? "#ff0000" : "#ffffff");
  let text = scene.add.text(
    toCol * cellSize + cellSize / 2,
    toRow * cellSize + cellSize / 2,
    piece,
    { font: "24px Arial", fill: textColor }
  );
  text.setOrigin(0.5);
  scene.textObjects[toRow][toCol] = text;
}

// Removes a piece from the board and destroys its text object.
function removePiece(scene, row, col) {
  board[row][col] = "";
  if (scene.textObjects[row][col]) {
    scene.textObjects[row][col].destroy();
    scene.textObjects[row][col] = null;
  }
}

// For play phase, enemy pieces are on the opposite side.
function isEnemy(fromRow, toRow) {
  return (isFriendly(fromRow) && !isFriendly(toRow)) ||
         (!isFriendly(fromRow) && isFriendly(toRow));
}

// Start the synchronized countdown using the server-provided start time.
function startCountdown(serverStartTime) {
  const scene = game.scene.scenes[0]; // Get the primary scene.
  let counter = Math.ceil((serverStartTime - Date.now()) / 1000);
  if (countdownText) countdownText.destroy();
  countdownText = scene.add.text(
    config.width / 2,
    config.height / 2,
    `Game starts in: ${counter}`,
    { font: "32px Arial", fill: "#ffffff" }
  ).setOrigin(0.5);
  
  countdownTimer = scene.time.addEvent({
    delay: 1000,
    callback: () => {
      let remaining = Math.ceil((serverStartTime - Date.now()) / 1000);
      if (remaining > 0) {
        countdownText.setText(`Game starts in: ${remaining}`);
      } else {
        countdownText.setText("Go!");
        gamePhase = "play";
        scene.time.addEvent({
          delay: 1000,
          callback: () => { countdownText.destroy(); }
        });
        countdownTimer.remove();
      }
    },
    loop: true
  });
}

function update() {
  // Additional game logic updates can go here.
}
