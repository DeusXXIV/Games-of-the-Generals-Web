const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Track which players are ready.
let readyStates = {};

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Listen for ready events from clients.
  socket.on('ready', (data) => {
    console.log(`Player ${socket.id} is ready:`, data);
    readyStates[socket.id] = true;

    // For this prototype, if 2 players are connected and ready, start the countdown.
    const connectedPlayers = Object.keys(readyStates);
    if (connectedPlayers.length >= 2 && connectedPlayers.every(id => readyStates[id] === true)) {
      // Calculate a start time 5 seconds from now.
      const startTime = Date.now() + 5000;
      io.emit('startCountdown', { startTime: startTime });
      console.log("Both players ready. Starting synchronized countdown.");
    }
  });

  socket.on('move', (data) => {
    console.log('Received move:', data);
    socket.broadcast.emit('move', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove the player's ready state
    delete readyStates[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
