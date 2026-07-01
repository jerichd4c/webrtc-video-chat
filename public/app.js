// Select video HTML elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const shareScreenBtn = document.getElementById('shareScreenBtn');

// Connect to socket server 
const socket = io('/');
const ROOM_ID = 'room-123';

// Global variable to save data stream
let localStream;
let peerConnection; 
let screenStream;

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

/////////////////
// UI CONTROLS //
/////////////////

// Mute/unmute user function 
muteBtn.addEventListener('click', () => {
    // Get audio track from localstream
    const audioTrack = localStream.getAudioTracks()[0];

    // If unmute, mute
    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        muteBtn.textContent = "Unmute Audio";
        muteBtn.classList.add('danger');
    } else {
    // If mute, unmute
        audioTrack.enabled = true;
        muteBtn.textContent = "Mute Audio";
        muteBtn.classList.remove('danger');
    }
});

// Turn camera off/on function
cameraBtn.addEventListener('click', () => {
    // Get video track from locastream
    const videoTrack = localStream.getVideoTracks()[0];
    
    // Turn camera off
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        cameraBtn.textContent = "Turn On Camera";
        cameraBtn.classList.add('danger');
    } else {
    // Turn camera on
        videoTrack.enabled = true;
        cameraBtn.textContent = "Turn Off Camera";
        cameraBtn.classList.remove('danger');
    }
});

/////////////////////
// TEXT CHAT LOGIC //
/////////////////////

// Show message on screen
function showMessage(text, type) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', type); // local/remote
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    
    // Auto-scroll to see most recent message
    chatMessages.scrollTop = chatMessages.scrollHeight
}

// Send message onclick
sendBtn.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (text !== '') {
        showMessage(text, 'local') // show on 'YOU' screen
        socket.emit('chat-message', { roomId: ROOM_ID, message: text }); 
        chatInput.value= ''; 
    }
}); 

// Receive message from other user
socket.on('chat-message', (data) => {
    showMessage(data.message, 'remote'); // show on 'GUEST' screen
});

// Send message when pressing 'Enter'
chatInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendBtn.click();
    }
});

////////////////////////
// SHARE SCREEN LOGIC //
////////////////////////

// Share screen event
shareScreenBtn.addEventListener('click', async () => {
    try {
        if (!screenStream) {
            // 1. Ask browser to screenshare
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            // 2. Find who is sending the video
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');

            // 3. Replace stream with video
            sender.replaceTrack(screenTrack);

            // 4. Update HTML 
            localVideo.srcObject = screenStream;
            shareScreenBtn.textContent = "Stop Sharing";
            shareScreenBtn.classList.add('danger');

            // 5. Listen if user stops screen sharing
            screenTrack.onended = () => {
                stopScreenSharing();
            };
        } else {
            // Si ya estamos compartiendo, detenemos la captura manualmente
            stopScreenSharing();
        }
    } catch (error) {
        console.error("Error al compartir pantalla:", error);
    }
});

// Stop screen sharing function
function stopScreenSharing() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null; 
    }

    // Get original video track 
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');

    // Use camera again
    sender.replaceTrack(videoTrack);

    // Update HTML
    localVideo.srcObject = localStream;
    shareScreenBtn.textContent = "Share Screen";
    shareScreenBtn.classList.remove('danger');
}

startCamera();