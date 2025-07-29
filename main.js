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
  player2_stone : [5,5,5,5,5]
}

// Routes
app.get('/', (req, res) => {
  
  res.render('board',{
    state: information,
    global_player : global_state_player
  });
});

// WebSocket logic
io.on('connection', (socket) => {
  
  // Example broadcast
  if (global_state_player.player1 != null) {
    let data_to_send = {
      global:global_state_player,
      data : 1
    }
   
    socket.emit('broadcast_player',data_to_send );
  }
  if (global_state_player.player2 != null){
    let data_to_send = {
      global:global_state_player,
      data : 2
    }
    socket.emit('broadcast_player',data_to_send );
  }
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

  });

  socket.on('join_player_one', (player_id) => {
    
    if (global_state_player.player1 == null) {// player belum ada
        if (global_state_player.player2 == player_id){
            //ignore
        } else {
            global_state_player.player1 = player_id
            let data_to_send = {
              global:global_state_player,
              data : 1
            }
            io.emit('broadcast_player', data_to_send);
            if (global_state_player.player1 != null && global_state_player.player2 != null){
              if (information.has_start == false){
                information.has_start = true
                io.emit('game_countdown',information)
              }
            }
        } 
    }
  });
  
  socket.on('join_player_two', (player_id) => {
     
    if (global_state_player.player2 == null) {// player belum ada
         if (global_state_player.player1 == player_id){
            //ignore
        } else {
            global_state_player.player2 = player_id
            let data_to_send = {
              global:global_state_player,
              data : 2
            }
            io.emit('broadcast_player', data_to_send);
            if (global_state_player.player1 != null && global_state_player.player2 != null){
              if (information.has_start == false){
                information.has_start = true
                io.emit('game_countdown',information)
              }
            }
        } 
    }

  });

  socket.on('game_start', (test) => {
    if (information.whos_turn == null){
      information.whos_turn = global_state_player.player1
    }
    
  });

   socket.on('restart', () => {
    const zeros = new Array(225).fill(0);
    information =  {
      state : zeros,
      has_start : false,
      whos_turn : null,
      player1_stone : [5,5,5,5,5],
      player2_stone : [5,5,5,5,5]
    }
    global_state_player = {
      player1: null,
      player2: null
    }
   
  });

  socket.on('my_turn',(data)=>{
    
    if (information.whos_turn == null) return
    if (information.has_start == false) return
    if (information.whos_turn != data.whoami) return
    
    let whos_turn_player = null
    let cell_block = 0
    let type = 0

    if (information.whos_turn == global_state_player.player1){
      whos_turn_player = "player1_stone"
      cell_block = `w${data.move}`
      type = 0
    } else {
      whos_turn_player = "player2_stone"
      cell_block = `b${data.move}`
      type = 1
    }
    information[whos_turn_player][data.move -1] -= 1
    information.state[data.cell] = cell_block
    
    if (information.whos_turn == global_state_player.player1){
      information.whos_turn = global_state_player.player2
     

    } else if (information.whos_turn == global_state_player.player2){
      information.whos_turn = global_state_player.player1
    }
    
    const for_update = {
      cell : data.cell,
      type : type,
      value : data.move
    }
    const all_data = {
      update : for_update,
      master : information
    }
    score = calculateScores(information.state)
    if (score.winner == 1){
      all_data.winner = "white"
    } else if (score.winner == 2){
      all_data.winner = "black"
    } else {
      all_data.winner = null
    }
    io.emit("update_move",all_data)
  })
  
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
  let someone_win = 0
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
    someone_win = 1
  } else if (black == 16){
    someone_win = 2
  }
  return { white, black , someone_win };
}
function calculateScores(boardFlat) {
  const result = {
    rows: [],
    cols: [],
    diagonalsRight: [],
    diagonalsLeft: [],
    winner : 0
  };

  // Helper to get value from 1D index
  const get = (row, col) => boardFlat[row * SIZE + col];

  // 1. Rows
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      row.push(get(r, c));
    }
    let helper = scoreLine(row)
    
    if (helper.someone_win == 1) {
      result.winner = 1
    } else if (helper.someone_win == 2){
      result.winner = 2
    }
    result.rows.push(helper);
  }

  // 2. Columns
  for (let c = 0; c < SIZE; c++) {
    const col = [];
    for (let r = 0; r < SIZE; r++) {
      col.push(get(r, c));
    }
     let helper = scoreLine(col)
    
    if (helper.someone_win == 1) {
      result.winner = 1
    } else if (helper.someone_win == 2){
      result.winner = 2
    }
    result.cols.push(helper);
  }

  // 3. Diagonals (top-left to bottom-right ↘)
  for (let k = 0; k < SIZE * 2 - 1; k++) {
    const diag = [];
    for (let r = 0; r < SIZE; r++) {
      let c = k - r;
      if (c >= 0 && c < SIZE) {
        diag.push(get(r, c));
      }
    }
     let helper = scoreLine(diag)
    
    if (helper.someone_win == 1) {
      result.winner = 1
    } else if (helper.someone_win == 2){
      result.winner = 2
    }
    result.diagonalsRight.push(helper);
  }

  // 4. Diagonals (top-right to bottom-left ↙)
  for (let k = 0; k < SIZE * 2 - 1; k++) {
    const diag = [];
    for (let r = 0; r < SIZE; r++) {
      let c = k - (SIZE - 1 - r);
      if (c >= 0 && c < SIZE) {
        diag.push(get(r, c));
      }
    }
     let helper = scoreLine(diag)
    
    if (helper.someone_win == 1) {
      result.winner = 1
    } else if (helper.someone_win == 2){
      result.winner = 2
    }
    result.diagonalsLeft.push(helper);
  }

  return result;
}

