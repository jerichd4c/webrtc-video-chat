// Virtual board HTML elements
const boardBtn = document.getElementById('boardBtn');
const boardContainer = document.getElementById('boardContainer');
const closeBoardBtn = document.getElementById('closeBoardBtn');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const clearBoardBtn = document.getElementById('clearBoardBtn');

// Global variables for board control
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Open/close board
boardBtn.addEventListener('click', () => {
    boardContainer.style.display = 'flex';
    resizeCanvas(); 
});

closeBoardBtn.addEventListener('click', () => {
    boardContainer.style.display = 'none';
});

// Function to resize canvas everytime it gets drawn on
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    // Substract toolbar height to avoid overflow
    canvas.height = canvas.parentElement.clientHeight - document.querySelector('.board-toolbar').clientHeight;

    // Initial brush styles
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

// Reajust canvas if window resizes
window.addEventListener('resize', () => {
    if (boardContainer.style.display === 'flex') {
        resizeCanvas();
    }
});

// Clear canvas
clearBoardBtn.addEventListener('click', () => {
    // Delete all from pos 0,0 to canvas full h and w
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tell other user board was erased
    socket.emit('clear-board', ROOM_ID);
});

///////////////////////////
// DRAWING LOGIC (LOCAL) //
///////////////////////////

// 1. First click
canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    // Save coords where click was made
    lastX = e.offsetX;
    lastY = e.offsetY;
});

// 2. Trace event
canvas.addEventListener('mousemove', (e) => {
    // Only draw if boolean is true
    if (!isDrawing) return;

    // Take toolbar values
    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = brushSize.value;

    // Draw trace
    ctx.beginPath();
    ctx.moveTo(lastX, lastY); // From prev pos
    ctx.lineTo(e.offsetX, e.offsetY); // To last pos
    ctx.stroke(); // Make strokeline

    // Emit drawing to server using coords:
    socket.emit('draw', {
        roomId: ROOM_ID,
        x0: lastX,
        y0: lastY,
        x1: e.offsetX,
        y1: e.offsetY,
        color: colorPicker.value,
        size: brushSize.value
    });

    // Update coords for next stroke
    lastX = e.offsetX;
    lastY = e.offsetY;
});

// 3. Let go click
canvas.addEventListener('mouseup', () => {
    isDrawing = false;
});

// 4. Stop drawing if mouse leaves canvas
canvas.addEventListener('mouseout', () => {
    isDrawing = false;
});

////////////////////////////
// DRAWING LOGIC (REMOTE) //
////////////////////////////

// Draw on remote
socket.on('draw', (data) => {
    // Take color and width of user
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;

    // Copy coords
    ctx.beginPath();
    ctx.moveTo(data.x0, data.y0);
    ctx.lineTo(data.x1, data.y1); 
    ctx.stroke();
});

// Listen if someone clears the board
socket.on('clear-board', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
});

//////////////////////////
// TOUCH LOGIC (MOBILE) //
//////////////////////////

// Aux: get touch control coords on phone
function getTouchPos(canvasDom, touchEvent) {
    const rect = canvasDom.getBoundingClientRect();
    return {
        x: touchEvent.touches[0].clientX - rect.left,
        y: touchEvent.touches[0].clientY - rect.top
    };
}

// 1. Finger down event
canvas.addEventListener('touchstart', (e) => {
    // Avoid screen chaging position
    e.preventDefault(); 
    isDrawing = true;
    const pos = getTouchPos(canvas, e);
    lastX = pos.x;
    lastY = pos.y;
}, { passive: false });

// 2. Finger trace event
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;

    const pos = getTouchPos(canvas, e);

    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = brushSize.value;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    socket.emit('draw', {
        roomId: ROOM_ID,
        x0: lastX,
        y0: lastY,
        x1: pos.x,
        y1: pos.y,
        color: colorPicker.value,
        size: brushSize.value
    });

    lastX = pos.x;
    lastY = pos.y;
}, { passive: false });

// 3. Finger up event
canvas.addEventListener('touchend', () => {
    isDrawing = false;
});

