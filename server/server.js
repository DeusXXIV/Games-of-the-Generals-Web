const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve static files from the public directory
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Listen for ready events from clients
  socket.on('ready', (data) => {
    console.log(`Player ${socket.id} is ready:`, data);
    // Broadcast ready event to all other connected clients
    socket.broadcast.emit('ready', data);
  });

  // Listen for move events
  socket.on('move', (data) => {
    console.log('Received move:', data);
    socket.broadcast.emit('move', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
