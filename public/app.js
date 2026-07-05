// Select video HTML elements
const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('video-grid');
const muteBtn = document.getElementById('muteBtn');
const muteAllBtn = document.getElementById('muteAllBtn');
const cameraBtn = document.getElementById('cameraBtn');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const handBtn = document.getElementById('handBtn');
const localHandIcon = document.getElementById('hand-local');

// Connect to socket server 
const socket = io('/');
const ROOM_ID = 'room-123';

// Global variables
let localStream;
let screenStream;
let isHost = false;
let isHandRaised = false;

// Store multiple users by ID
const peers = {};

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

        // User ask server to join the room
        socket.emit('join-room', ROOM_ID);

    } catch (error) {
        console.error("Error al acceder a los dispositivos multimedia:", error);
        alert("Para que la llamada funcione, debes permitir el acceso a tu camara y microfono.");
    }
}

// Init WebRTC function
function createPeerConnection(userId) {
    // Connection instance using STUN server
    const pc = new RTCPeerConnection(servers);

    // Load stream data to send it to guest
    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    // Gets audio and video from guest
    pc.ontrack = (event) => {
        // Verify if video already exist on screen
        if (!document.getElementById(`video-${userId}`)) {
            const videoContainer = document.createElement('div');
            videoContainer.classList.add('video-container');
            // Use ID for each user
            videoContainer.id = `container-${userId}`;

            const title = document.createElement('h3');
            // Show user ID 
            title.innerText = `Guest (${userId.substring(0,4)})`;

            const video = document.createElement('video');
            video.id = `video-${userId}`;
            video.autoplay = true;
            video.playsInline = true;
            video.srcObject = event.streams[0];

            // Hand raise emote indicator
            const handIcon = document.createElement('div');
            handIcon.id = `hand-${userId}`;
            handIcon.classList.add('hand-indicator');
            handIcon.innerText = '✋';

            videoContainer.appendChild(title);
            videoContainer.appendChild(handIcon);
            videoContainer.appendChild(video);
            videoGrid.appendChild(videoContainer);

            // Admin exclusive buttons
            if (isHost) {
                const adminPanel = document.createElement('div');
                adminPanel.classList.add('admin-controls');

                // Ask unmute button
                const unmuteReqBtn = document.createElement('button');
                unmuteReqBtn.className = 'btn btn-small';
                unmuteReqBtn.style.backgroundColor = '#007bff';
                unmuteReqBtn.innerText = 'Ask to Unmute';
                unmuteReqBtn.onclick = () => socket.emit('request-unmute', { targetId: userId, roomId: ROOM_ID });

                // Kick button
                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn btn-small danger';
                kickBtn.innerText = 'Kick';
                kickBtn.onclick = () => socket.emit('kick-user', { targetId: userId, roomId: ROOM_ID });

                adminPanel.appendChild(unmuteReqBtn);
                adminPanel.appendChild(kickBtn);
                videoContainer.appendChild(adminPanel);
            }
        }
        console.log("Recibiendo el video del otro usuario");
    };

    // ICE process: if theres a candidadte, send route to other user
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                targetId: userId
            });
        }
    };
    
    peers[userId] = pc;
    console.log("Motor WebRTC (PeerConnection) inicializado y listo.");
    return pc;
}

// 1st user connects, creates OFFER
socket.on('user-connected', async (userId) => {
    console.log("Nuevo usuario detectado. Creando y enviado oferta...")
    const peerConnection = createPeerConnection(userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { sdp: offer, targetId: userId });
});

// 2nd user receives offer, creates RESPONSE
socket.on('offer', async (data) => {
    console.log("Oferta recibida. Creando y enviando respuesta...");
    const peerConnection = createPeerConnection(data.senderId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    // 2nd users responds
    socket.emit('answer', { sdp: answer, targetId: data.senderId })
});

// Final answer now supports up to 4 users
socket.on('answer', async (data) => {
    console.log("Respuesta recibida. Conexion P2P en proceso");
    const pc = peers[data.senderId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
});

// Both users trade and save net routes (ICE)
socket.on('ice-candidate', async (data) => {
    const pc = peers[data.senderId];
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error("Error al guardar la ruta de red (ICE)", e);
        }
    }
});

// Delete video if someone disconnects
socket.on('user-disconnected', (userId) => {
    if (peers[userId]) {
        peers[userId].close();
        // Delete id from dictionary
        delete peers[userId];
    }
    const userContainer = document.getElementById(`container-${userId}`);
    if (userContainer) {
        userContainer.remove(); 
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

            // 2. Iterate over each user to send shared screen
            Object.values(peers).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(screenTrack);
                }
            });

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

    // Iterate over each user to stop return user web camera
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        });

    // Update HTML
    localVideo.srcObject = localStream;
    shareScreenBtn.textContent = "Share Screen";
    shareScreenBtn.classList.remove('danger');
}

////////////////////////
// ROLES LOGIC: ADMIN //
////////////////////////

// Receive admin role if user is the first to enter
socket.on('role', (role) => {
    if (role === 'admin') {
        isHost = true;
        muteAllBtn.style.display = 'block';
    } else {
        isHost = false;
    }
});

// Mute all users on click
muteAllBtn.addEventListener('click', () => {
    socket.emit('mute-all', ROOM_ID);
});

// Normal guests get muted
socket.on('force-mute', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    
    // Mute audio track
    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        
        // Update UI
        muteBtn.textContent = "Unmute Audio";
        muteBtn.classList.add('danger');
    }
});

// Unmute specific user 
socket.on('please-unmute', () => {
    // Use alert on browser
    const wantsToUnmute = confirm("Host is asking to unmute your microphone. ¿Proceed?");
    
    if (wantsToUnmute) {
        const audioTrack = localStream.getAudioTracks()[0];
        // Only retrigger is audio is off
        if (audioTrack && !audioTrack.enabled) {
            audioTrack.enabled = true;
            
            // Update UI of admin view
            muteBtn.textContent = "Mute Audio";
            muteBtn.classList.remove('danger');
        }
    }
});

////////////////////////
// WAITING ROOM LOGIC //
////////////////////////

// 1. Join waiting room
socket.emit('request-join', ROOM_ID);

// 2. Show black screen while admind decides
socket.on('waiting-for-admin', () => {
    document.getElementById('waitingScreen').style.display = 'flex';
}); 

// Accepted
socket.on('join-accepted', () => {
    document.getElementById('waitingScreen').style.display = 'none';
    startCamera(); 
});

// Rejected
socket.on('join-rejected', () => {
    const waitingScreen = document.getElementById('waitingScreen');
    waitingScreen.style.display = 'flex';
    waitingScreen.innerHTML = '<h2 style="color: #ff4444;">Admin has rejected you, try again..</h2>';
});

// Force guest kick event
socket.on('you-are-kicked', () => {
    // Turn off camera and mic
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Reuse waiting room screen
    const overlay = document.getElementById('waitingScreen');
    overlay.style.display = 'flex';
    overlay.innerHTML = '<h2 style="color: #ff4444;">You have been kicked by the admin.</h2>';
    
    // Disconnect socket from server
    socket.disconnect();
});

// 3. Admin exclusive event, show new guest notification
socket.on('guest-request', (data) => {
    const notifContainer = document.getElementById('adminNotifications');

    // Create notificacion
    const notif = document.createElement('div');
    notif.classList.add('notification');
    notif.innerHTML = `
        <p>User <strong>${data.guestId.substring(0,4)}</strong> wants to enter the room.</p>
        <div class="notification-btns">
            <button class="btn" style="background-color: #28a745; padding: 8px 15px;" onclick="respondRequest('${data.guestId}', true, this)">Accept</button>
            <button class="btn danger" style="padding: 8px 15px;" onclick="respondRequest('${data.guestId}', false, this)">Reject</button>
        </div>
    `;
    notifContainer.appendChild(notif);
});

// 4. Global function: triggers when admin selects an option (true/false)
window.respondRequest = function(guestId, accept, btnElement) {
    // Send decision to 'server.js'
    socket.emit('admin-response', { guestId: guestId, accept: accept, roomId: ROOM_ID });

    // Remove notification from page
    btnElement.parentElement.parentElement.remove();
};

//////////////////////
// RAISE HAND LOGIC //
//////////////////////

// 1. Click button 
handBtn.addEventListener('click', () => {

    // Check if hand is raised or not
    isHandRaised = !isHandRaised;

    if (isHandRaised) {
        // True
        localHandIcon.style.display = 'block';
        handBtn.textContent = "Lower Hand";
        handBtn.style.backgroundColor = '#f39c12'; 
    } else {
        // False
        localHandIcon.style.display = 'none';
        handBtn.textContent = "Raise Hand";
        handBtn.style.backgroundColor = ''; 
    }

    socket.emit('toggle-hand', { roomId: ROOM_ID, isRaised: isHandRaised });
});

// 2. Receive signal from remote user
socket.on('user-toggled-hand', (data) => {
    const remoteHandIcon = document.getElementById(`hand-${data.userId}`);
    if (remoteHandIcon) {
        remoteHandIcon.style.display = data.isRaised ? 'block' : 'none';
    }
});