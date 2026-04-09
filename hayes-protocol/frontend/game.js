/**
 * game.js — Main game loop for KNOCK
 * Manages: character selection → session start → chat → phase transitions
 */

const API = 'http://127.0.0.1:8000';

// ── State ─────────────────────────────────────────────────
let selectedChar = null;
let currentPhase = 1;
let isTyping = false;
let isWaiting = false;

// ── DOM refs ──────────────────────────────────────────────
const screenSelect = document.getElementById('screen-select');
const screenLoading = document.getElementById('screen-loading');
const screenGame = document.getElementById('screen-game');

const charCards = document.querySelectorAll('.char-card');
const btnBegin = document.getElementById('btn-begin');
const selectStatus = document.getElementById('select-status');

const userInput = document.getElementById('user-input');
const btnSend = document.getElementById('btn-send');

const dialogueText = document.getElementById('dialogue-text');
const hudPhase = document.getElementById('hud-phase');
const intensityFill = document.getElementById('intensity-fill');

const scenes = [null,
  document.getElementById('scene-1'),
  document.getElementById('scene-2'),
  document.getElementById('scene-3'),
];

const PHASE_NAMES = {
  1: 'PHASE I — WHO YOU WERE',
  2: 'PHASE II — WHO YOU ARE',
  3: 'PHASE III — WHAT WILL YOU DO',
};

// ── Utility ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function typewrite(el, text, speedMs = 28) {
  return new Promise(resolve => {
    el.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
      el.textContent += text[i];
      i++;
      if (i >= text.length) { clearInterval(interval); resolve(); }
    }, speedMs);
  });
}

function switchScene(phase) {
  scenes.forEach((s, i) => {
    if (!s) return;
    s.classList.toggle('active', i === phase);
  });
}

/**
 * Generate final door image with DALL-E using user summary.
 * Called only when game is finished. CSS fallback stays if no OPENAI_KEY.
 */
async function generateAndShowDoor() {
  try {
    const res = await fetch(`${API}/generate-door`, { method: 'POST' });
    if (!res.ok) return;

    const imgRes = await fetch(`${API}/door-image`);
    if (!imgRes.ok || imgRes.status === 204) return;

    const blob = await imgRes.blob();
    const url = URL.createObjectURL(blob);
    const el = document.getElementById('scene-3');
    if (el) {
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    }
  } catch (_) {
    // CSS fallback stays
  }
}

/**
 * Apply response data from the judge: phase, dialogue, intensity, lock_look.
 */
async function applyResponse(data) {
  const { phase, dialogue, intensity, lock_look } = data;

  // Phase transition
  if (phase !== currentPhase) {
    currentPhase = phase;
    document.body.className = `phase-${phase}`;
    hudPhase.textContent = PHASE_NAMES[phase] || `PHASE ${phase}`;
    switchScene(phase);

    document.body.classList.add('shaking');
    setTimeout(() => document.body.classList.remove('shaking'), 450);
  }

  // Intensity bar
  const pct = Math.round(Math.min(1, Math.max(0, intensity)) * 100);
  intensityFill.style.width = `${pct}%`;

  if (intensity >= 0.7) intensityFill.style.background = 'var(--p3-accent)';

  // Lock / unlock look
  Look.setLocked(lock_look);

  // Judge portrait
  const portrait = document.getElementById('judge-portrait');
  if (portrait && data.expression) {
    const map = {
      'neutral': 'serif_normal.png',
      'thoughtful': 'serif_dusunceli.png',
      'sad': 'serif_uzgun.png',
      'happy': 'serif_mutlu.png',
      'tired': 'serif_yorgun.png',
    };
    portrait.src = `assets/${map[data.expression] || 'serif_normal.png'}`;
  }

  // Judge animation
  Sprites.setState('judge-sprite', 'judge', 'talk');
  await typewrite(dialogueText, dialogue, 26);
  Sprites.setState('judge-sprite', 'judge', 'idle');

  // Game over
  if (data.finished) {
    userInput.disabled = true;
    btnSend.disabled = true;
    userInput.placeholder = "THE RECORD IS CLOSED.";
    hudPhase.textContent = "CASE CONCLUDED";
    hudPhase.style.color = "var(--p3-accent)";
    document.body.classList.add('game-over');

    // Generate personalized door — non-blocking
    generateAndShowDoor().catch(err => console.error('Door generation failed:', err));
  }
}

// ── Character selection ───────────────────────────────────
charCards.forEach(card => {
  card.addEventListener('click', () => {
    charCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedChar = card.dataset.char;

    const playerBody = document.getElementById('player-body');
    if (playerBody) playerBody.className = `player-body char-${selectedChar}`;

    btnBegin.disabled = false;
    selectStatus.textContent = `Character selected: ${card.querySelector('.char-title').textContent}`;
  });
});

// ── Begin: start session ──────────────────────────────────
btnBegin.addEventListener('click', async () => {
  if (!selectedChar || btnBegin.disabled) return;

  btnBegin.disabled = true;
  btnBegin.textContent = 'CONNECTING...';
  document.body.classList.remove('game-over');
  userInput.placeholder = "speak your truth...";
  showScreen('screen-loading');

  // Start session
  try {
    const res = await fetch(`${API}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: selectedChar }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    showScreen('screen-game');
    Look.init();

    await new Promise(r => setTimeout(r, 600));
    await applyResponse(data);

    userInput.disabled = false;
    btnSend.disabled = false;
    userInput.focus();

  } catch (err) {
    console.error('Failed to start session:', err);
    selectStatus.textContent = 'Connection error. Is backend running on port 8000?';
    btnBegin.disabled = false;
    btnBegin.textContent = 'TAKE THE STAND';
    showScreen('screen-select');
  }
});

// ── Send message ──────────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isWaiting) return;

  isWaiting = true;
  userInput.disabled = true;
  btnSend.disabled = true;
  userInput.value = '';

  dialogueText.textContent = '';
  const cursor = document.getElementById('dialogue-cursor');
  if (cursor) cursor.style.display = 'inline';

  Sprites.setState('judge-sprite', 'judge', 'idle');

  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, character: selectedChar }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await applyResponse(data);

  } catch (err) {
    console.error('Chat error:', err);
    dialogueText.textContent = '[Connection lost. The tribunal continues in silence.]';
  }

  isWaiting = false;
  userInput.disabled = false;
  btnSend.disabled = false;
  userInput.focus();
}

btnSend.addEventListener('click', sendMessage);
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── Initial state ─────────────────────────────────────────
document.body.className = 'phase-1';