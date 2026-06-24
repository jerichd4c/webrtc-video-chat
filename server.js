const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initial socket.io config
const io = new Server(server, {
    cors: {
            origin: "*", // Define URL frontend in prod
            methods: ["GET", "POST"]
    }
});

// Use 'public' folder
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // Event 1: join room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`Usuario ${socket.id} se unio a la sala: ${roomId}`);

        // Notify other users in room that a user connected
        socket.to(roomId).emit('user-connected', socket.id);
    }); 

    // Event 2: resend offer from peer 1 to peer 2
    socket.on('offer', (data) => {
        // params: { sdp, roomId}
        console.log(`Reenviando oferta de ${socket.id} a la sala ${data.roomId}`);
        socket.to(data.roomId).emit('offer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    // Event 3: send the answer from peer 2 to peer 1
    socket.on('answer', (data) => {
        // params: { sdp, roomId}
        console.log(`Reenviando respuesta de ${socket.id} a la sala ${data.roomId}`);
        socket.to(data.roomId).emit('answer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    // Event 4: ICE candidates trade
    socket.on('ice-candidate', (data) => {
        // params: { candidate, roomId}
        console.log(`Reenviando candidato ICE de ${socket.id}`);
        socket.to(data.roomId).emit('ice-candidate', {
            candidate: data.candidate,
            senderId: socket.id
        }); 
    });

    // Disconnect event 
    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de señalizacion (signaling server) corriendo en http://localhost:${PORT}`);
});