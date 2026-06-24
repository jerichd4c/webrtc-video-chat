// Select video HTML elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Connect to socket server 
const socket = io('/');
const ROOM_ID = 'room-123';

// Global variable to save data stream
let localStream;
let peerConnection; 

// STUN server config
const servers = {
    iceServers: [
        {
            // Google free/public servers
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
};

// Start camera
async function startCamera() {
    try {
        // Ask browser to access audio and video
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // Save stream to send it to WebRTC 
        localStream = stream;

        // Assign stream <video> tag
        localVideo.srcObject = stream;

        console.log("Camara y microfono capturados con exito");

        // Call init WebRTC function
        createPeerConnection();

        // User tell server to join the room
        socket.emit('join-room', ROOM_ID);

    } catch (error) {
        console.error("Error al acceder a los dispositivos multimedia:", error);
        alert("Para que la llamada funcione, debes permitir el acceso a tu camara y microfono.");
    }
}

// Init WebRTC function
function createPeerConnection() {
    // Connection instance using STUN server
    peerConnection = new RTCPeerConnection(servers);

    // Load stream data to send it to guest
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // Gets audio and video from guest
    peerConnection.ontrack = (event) => {
        console.log("Recibiendo el video del otro usuario");
        // Put receive data in the HTML <video tag>
        remoteVideo.srcObject = event.streams[0];
    };

    // ICE process: if theres a candidadte, send route to other user
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                roomId: ROOM_ID
            });
        }
    };
    console.log("Motor WebRTC (PeerConnection) inicializado y listo.");
}

// 1st user connects, creates OFFER
socket.on('user-connected', async (userId) => {
    console.log("Nuevo usuario detectado. Creando y enviado oferta...")
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { sdp: offer, roomId: ROOM_ID });
});

// 2nd user receives offer, creates RESPONSE
socket.on('offer', async (data) => {
    console.log("Oferta recibida. Creando y enviando respuesta...");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    // 2nd users responds
    socket.emit('answer', { sdp: answer, roomId: ROOM_ID })
});

// 1st user receives the response and close the trade
socket.on('answer', async (data) => {
    console.log("Respuesta recibida. Conexion P2P en proceso");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
});

// Both users trade and save net routes (ICE)
socket.on('ice-candidate', async (data) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
        console.error("Error al guardar la ruta de red (ICE)", e);
    }
});

startCamera();