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

// Dictionary for admin role
const roomAdmins = {};

// Use 'public' folder
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // Event 0: User lands in waiting room
    socket.on('request-join', (roomId) => {
        // If theres no admin, joins room directly
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            socket.emit('role', 'admin');
            socket.emit('join-accepted');
        } else {
            // Later users are guests
            socket.emit('role', 'guest');
            socket.emit('waiting-for-admin');

            // Tell admin user wants to join
            const adminId = roomAdmins[roomId];
            socket.to(adminId).emit('guest-request', { guestId: socket.id });
        }
    });

    // Evenet 0.5: Admin responds
    socket.on('admin-response', (data) => {
        // params {guestId, accept: boolean, roomId}
        if (data.accept) {
            // True
            socket.to(data.guestId).emit('join-accepted'); 
        } else {
            // False
            socket.to(data.guestId).emit('join-rejected'); 
        }
    });

    // Event 1: join room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        // Store room instance
        socket.roomId = roomId;

        // Make user admin if there isnt any
        if (!roomAdmins[roomId]) {
            roomAdmins[roomId] = socket.id;
            socket.emit('role', 'admin'); 
        } else {
            socket.emit('role', 'guest'); 
        }

        console.log(`Usuario ${socket.id} se unio a la sala: ${roomId}`);
    
        // Notify other users in room that a user connected
        socket.to(roomId).emit('user-connected', socket.id);
    }); 

    // Event 2: resend offer from peer 1 to peer 2
    socket.on('offer', (data) => {
        // params: { sdp, roomId}
        console.log(`Reenviando oferta de ${socket.id} a la sala ${data.targetId}`);
        socket.to(data.targetId).emit('offer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    // Event 3: send the answer from peer 2 to peer 1
    socket.on('answer', (data) => {
        // params: { sdp, roomId}
        console.log(`Reenviando respuesta de ${socket.id} a la sala ${data.targetId}`);
        socket.to(data.targetId).emit('answer', {
            sdp: data.sdp,
            senderId: socket.id
        });
    });

    // Event 4: ICE candidates trade
    socket.on('ice-candidate', (data) => {
        // params: { candidate, roomId}
        console.log(`Reenviando candidato ICE de ${socket.id}`);
        socket.to(data.targetId).emit('ice-candidate', {
            candidate: data.candidate,
            senderId: socket.id
        }); 
    });

    // Event: 5: disconnect event, notify other users when someone leaves the room
    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);

        // Delete admins registry
        if (socket.roomId && roomAdmins[socket.roomId] === socket.id) {
            delete roomAdmins[socket.roomId];
        }

        if (socket.roomId) {
            socket.to(socket.roomId).emit('user-disconnected', socket.id);
        } 
    });

    // Event 6: text chat
    socket.on('chat-message', (data) => {
        // params: {roomId, message}
        console.log(`Reenviando mensaje en la sala ${data.roomId}`);
        socket.to(data.roomId).emit('chat-message', {
            message: data.message,
            senderId: socket.id
        });
    });

    // Event 7: mute all as admin
    socket.on('mute-all', (roomId) => {
        // Verify if its admin sending the request
        if (roomAdmins[roomId] === socket.id) {
            socket.to(roomId).emit('force-mute');
        }
    });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de señalizacion (signaling server) corriendo en http://localhost:${PORT}`);
});