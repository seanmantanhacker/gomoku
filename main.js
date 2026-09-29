const express = require('express');
const path = require('path');
const app = express();

const http = require('http');
const { Server } = require('socket.io');

const SIZE = 15;
const server = http.createServer(app);
const io = new Server(server);  // Attach Socket.IO

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

global_state_player = {
    player1: null,
    player2: null
}
const zeros = new Array(225).fill(0);
information =  {
  state : zeros,
  has_start : false,
  whos_turn : null,
  player1_stone : [5,5,5,5,5],
  player2_stone : [5,5,5,5,5],
  winner : null,
  winningCells : [],
  winningDetails : null
}

// Routes
app.get('/', (req, res) => {
  
  res.render('board',{
    state: information,
    global_player : global_state_player
  });
});

function getSpectatorCount() {
  const total = io.engine ? io.engine.clientsCount : 0;
  let activePlayers = 0;
  if (global_state_player.player1) activePlayers++;
  if (global_state_player.player2) activePlayers++;
  return Math.max(0, total - activePlayers);
}

function broadcastRoomStatus() {
  io.emit('room_status', {
    global: global_state_player,
    information: information,
    spectators: getSpectatorCount()
  });
}

// WebSocket logic
io.on('connection', (socket) => {
  // Send current state to newly connected client
  socket.emit('room_status', {
    global: global_state_player,
    information: information,
    spectators: getSpectatorCount()
  });

  if (global_state_player.player1 != null) {
    socket.emit('broadcast_player', {
      global: global_state_player,
      data: 1
    });
  }
  if (global_state_player.player2 != null) {
    socket.emit('broadcast_player', {
      global: global_state_player,
      data: 2
    });
  }

  // Update spectator count for all
  broadcastRoomStatus();
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    broadcastRoomStatus();
  });

  socket.on('join_player_one', (player_id) => {
    if (global_state_player.player1 == null) {
      if (global_state_player.player2 == player_id) {
        // ignore if already player 2
      } else {
        global_state_player.player1 = player_id;
        let data_to_send = {
          global: global_state_player,
          data: 1
        };
        io.emit('broadcast_player', data_to_send);
        broadcastRoomStatus();
        if (global_state_player.player1 != null && global_state_player.player2 != null) {
          if (information.has_start == false) {
            information.has_start = true;
            io.emit('game_countdown', information);
          }
        }
      } 
    }
  });
  
  socket.on('join_player_two', (player_id) => {
    if (global_state_player.player2 == null) {
      if (global_state_player.player1 == player_id) {
        // ignore if already player 1
      } else {
        global_state_player.player2 = player_id;
        let data_to_send = {
          global: global_state_player,
          data: 2
        };
        io.emit('broadcast_player', data_to_send);
        broadcastRoomStatus();
        if (global_state_player.player1 != null && global_state_player.player2 != null) {
          if (information.has_start == false) {
            information.has_start = true;
            io.emit('game_countdown', information);
          }
        }
      } 
    }
  });

  socket.on('game_start', (test) => {
    if (information.whos_turn == null) {
      information.whos_turn = global_state_player.player1;
      broadcastRoomStatus();
    }
  });

  socket.on('restart', () => {
    const zeros = new Array(225).fill(0);
    information = {
      state: zeros,
      has_start: false,
      whos_turn: null,
      player1_stone: [5, 5, 5, 5, 5],
      player2_stone: [5, 5, 5, 5, 5],
      winner: null,
      winningCells: [],
      winningDetails: null
    };
    global_state_player = {
      player1: null,
      player2: null
    };
    io.emit('game_restarted', {
      information: information,
      global: global_state_player
    });
    broadcastRoomStatus();
  });

  socket.on('my_turn', (data) => {
    if (information.whos_turn == null) return;
    if (information.has_start == false) return;
    if (information.whos_turn != data.whoami) return;
    
    let whos_turn_player = null;
    let cell_block = 0;
    let type = 0;

    if (information.whos_turn == global_state_player.player1) {
      whos_turn_player = "player1_stone";
      cell_block = `w${data.move}`;
      type = 0;
    } else {
      whos_turn_player = "player2_stone";
      cell_block = `b${data.move}`;
      type = 1;
    }
    information[whos_turn_player][data.move - 1] -= 1;
    information.state[data.cell] = cell_block;
    
    if (information.whos_turn == global_state_player.player1) {
      information.whos_turn = global_state_player.player2;
    } else if (information.whos_turn == global_state_player.player2) {
      information.whos_turn = global_state_player.player1;
    }
    
    const for_update = {
      cell: data.cell,
      type: type,
      value: data.move
    };
    const all_data = {
      update: for_update,
      master: information
    };
    const score = calculateScores(information.state);
    if (score.winner == 1) {
      all_data.winner = "white";
      all_data.winningCells = score.winningCells || [];
      all_data.winningDetails = score.winningDetails || null;
      information.winner = "white";
      information.winningCells = score.winningCells || [];
      information.winningDetails = score.winningDetails || null;
    } else if (score.winner == 2) {
      all_data.winner = "black";
      all_data.winningCells = score.winningCells || [];
      all_data.winningDetails = score.winningDetails || null;
      information.winner = "black";
      information.winningCells = score.winningCells || [];
      information.winningDetails = score.winningDetails || null;
    } else {
      all_data.winner = null;
      all_data.winningCells = [];
      all_data.winningDetails = null;
      information.winner = null;
      information.winningCells = [];
      information.winningDetails = null;
    }
    io.emit("update_move", all_data);
    broadcastRoomStatus();
  });
  
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

/**
 * Parse cell string like "b3" or "w2" into { color, value }
 */
function parseCell(cell) {
  if (cell == 0) return null;
  const color = cell[0] === "b" ? "black" : "white";
  const value = parseInt(cell[1], 10);
  return { color, value };
}

function scoreLine(line) {
  let white = 0;
  let black = 0;
  let someone_win = 0;
  for (const cell of line) {
    const parsed = parseCell(cell);
    if (!parsed) continue;
   
    if (parsed.color === "white") {
      white += parsed.value;
      black -= parsed.value;
    } else {
      black += parsed.value;
      white -= parsed.value;
    }
  }
  if (white == 16){
    someone_win = 1;
  } else if (black == 16){
    someone_win = 2;
  }
  return { white, black , someone_win };
}

function buildWinningDetails(winnerNum, indices, boardFlat, lineLabel) {
  const winnerColor = winnerNum === 1 ? 'white' : 'black';
  const winningCells = [];
  const winningStones = [];

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const val = boardFlat[idx];
    if (val && val !== 0) {
      winningCells.push(idx);
      const parsed = parseCell(val);
      if (parsed) winningStones.push(parsed);
    }
  }

  // Format human-friendly mathematical formula showing how stones sum to 16
  const parts = [];
  winningStones.forEach((st, i) => {
    const isWinnerColor = (st.color === winnerColor);
    const sym = st.color === 'white' ? '⚪' : '⚫';
    if (i === 0) {
      parts.push(`${isWinnerColor ? '' : '-'}${sym}${st.value}`);
    } else {
      parts.push(`${isWinnerColor ? '+' : '-'} ${sym}${st.value}`);
    }
  });

  const formula = parts.length > 0 ? `${parts.join(' ')} = 16` : 'Sum = 16';

  return {
    winningCells,
    winningDetails: {
      lineLabel,
      formula,
      winnerColor,
      stonesCount: winningCells.length
    }
  };
}

function calculateScores(boardFlat) {
  const result = {
    rows: [],
    cols: [],
    diagonalsRight: [],
    diagonalsLeft: [],
    winner: 0,
    winningCells: [],
    winningDetails: null
  };

  // Helper to get value from 1D index
  const get = (row, col) => boardFlat[row * SIZE + col];

  // 1. Rows
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    const indices = [];
    for (let c = 0; c < SIZE; c++) {
      row.push(get(r, c));
      indices.push(r * SIZE + c);
    }
    const helper = scoreLine(row);
    if (helper.someone_win == 1 || helper.someone_win == 2) {
      result.winner = helper.someone_win;
      const details = buildWinningDetails(helper.someone_win, indices, boardFlat, `Row ${r + 1}`);
      result.winningCells = details.winningCells;
      result.winningDetails = details.winningDetails;
    }
    result.rows.push(helper);
  }

  // 2. Columns
  for (let c = 0; c < SIZE; c++) {
    const col = [];
    const indices = [];
    for (let r = 0; r < SIZE; r++) {
      col.push(get(r, c));
      indices.push(r * SIZE + c);
    }
    const helper = scoreLine(col);
    if (helper.someone_win == 1 || helper.someone_win == 2) {
      result.winner = helper.someone_win;
      const details = buildWinningDetails(helper.someone_win, indices, boardFlat, `Column ${c + 1}`);
      result.winningCells = details.winningCells;
      result.winningDetails = details.winningDetails;
    }
    result.cols.push(helper);
  }

  // 3. Diagonals (top-left to bottom-right ↘)
  for (let k = 0; k < SIZE * 2 - 1; k++) {
    const diag = [];
    const indices = [];
    for (let r = 0; r < SIZE; r++) {
      let c = k - r;
      if (c >= 0 && c < SIZE) {
        diag.push(get(r, c));
        indices.push(r * SIZE + c);
      }
    }
    const helper = scoreLine(diag);
    if (helper.someone_win == 1 || helper.someone_win == 2) {
      result.winner = helper.someone_win;
      const details = buildWinningDetails(helper.someone_win, indices, boardFlat, 'Diagonal ↘');
      result.winningCells = details.winningCells;
      result.winningDetails = details.winningDetails;
    }
    result.diagonalsRight.push(helper);
  }

  // 4. Diagonals (top-right to bottom-left ↙)
  for (let k = 0; k < SIZE * 2 - 1; k++) {
    const diag = [];
    const indices = [];
    for (let r = 0; r < SIZE; r++) {
      let c = k - (SIZE - 1 - r);
      if (c >= 0 && c < SIZE) {
        diag.push(get(r, c));
        indices.push(r * SIZE + c);
      }
    }
    const helper = scoreLine(diag);
    if (helper.someone_win == 1 || helper.someone_win == 2) {
      result.winner = helper.someone_win;
      const details = buildWinningDetails(helper.someone_win, indices, boardFlat, 'Diagonal ↙');
      result.winningCells = details.winningCells;
      result.winningDetails = details.winningDetails;
    }
    result.diagonalsLeft.push(helper);
  }

  return result;
}

