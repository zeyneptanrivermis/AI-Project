const chatLog = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const intensityFill = document.getElementById('intensity-fill');
const phaseLabel = document.getElementById('phase-label');
const statusText = document.getElementById('status-text');
const hayesPortrait = document.getElementById('hayes-portrait');

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // Add user message to UI
    appendMessage('user', text);
    userInput.value = '';

    // Show typing state
    const typingMsg = appendMessage('assistant', '...', true);

    try {
        const response = await fetch('http://127.0.0.1:8000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        const data = await response.json();

        // Remove typing indicator and add response
        typingMsg.remove();
        appendMessage('assistant', data.dialogue);

        // Update UI State based on Phase and Intensity
        updateUI(data);

    } catch (error) {
        typingMsg.innerText = "CONNECTION BREACHED. RESTABLISH LINK.";
        console.error(error);
    }
}

function appendMessage(role, text, isTyping = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (isTyping) msgDiv.classList.add('typing');
    
    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerText = text;
    
    msgDiv.appendChild(content);
    chatLog.appendChild(msgDiv);
    
    // Scroll to bottom
    chatLog.scrollTop = chatLog.scrollHeight;
    
    return msgDiv;
}

function updateUI(data) {
    // Update body class for thematic colors
    document.body.className = `phase-${data.phase}`;

    // Update phase label
    const phases = ["", "INITIAL ENQUIRY", "PRESSURE INCREASING", "CRITICAL BREAKDOWN"];
    phaseLabel.innerText = phases[data.phase] || "UNKNOWN";

    // Update intensity bar
    intensityFill.style.width = `${data.intensity * 100}%`;

    // Visual feedback for intensity
    if (data.intensity > 0.8) {
        statusText.innerText = "WARNING: HIGH BRAIN STRESS";
        statusText.style.color = "var(--accent-phase-3)";
    } else {
        statusText.innerText = "DECRYPTION ACTIVE";
        statusText.style.color = "#666";
    }

    // Handle "Lock Look" effect
    if (data.lock_look) {
        hayesPortrait.style.filter = "grayscale(0) contrast(1.5) brightness(1.2)";
        hayesPortrait.style.transform = "scale(1.05)";
    } else {
        hayesPortrait.style.filter = "grayscale(0.5) contrast(1.2)";
        hayesPortrait.style.transform = "scale(1)";
    }
}

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
