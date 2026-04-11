/**
 * game.js — Main game loop for KNOCK
 * Manages: character selection → session start → chat → phase transitions
 */

const API = 'http://127.0.0.1:8000';

// ── State ─────────────────────────────────────────────────
let selectedChar = 'A'; // Hardcoded default character
let currentPhase = 1;
let isTyping = false;
let isWaiting = false;
let messageHistory = []; // Array of {role, text}
let isMuted = localStorage.getItem('hayes_muted') === 'true'; 

// ── Visual Error Logging ─────────────────────────────────
window.onerror = function(msg, url, line, col, error) {
  const log = document.getElementById('ui-error-log');
  if (log) {
    log.textContent = `CRITICAL ERROR: ${msg} (Line: ${line})`;
  }
  return false;
};

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
  1: 'PHASE I — REMINISCENCE',
  2: 'PHASE II — WHO YOU ARE',
  3: 'PHASE III — WHAT WILL YOU DO',
};

const btnReset = document.getElementById('btn-reset');
const transcriptLog = document.getElementById('transcript-log');

// ── Persistence ───────────────────────────────────────────
const State = {
  KEY: 'hayes_protocol_session',
  save() {
    const data = {
      selectedChar,
      currentPhase,
      messageHistory,
      intensity: parseFloat(intensityFill.style.width) / 100 || 0,
      isGameOver: document.body.classList.contains('game-over'),
      isMuted
    };
    localStorage.setItem(this.KEY, JSON.stringify(data));
    localStorage.setItem('hayes_muted', isMuted);
  },
  load() {
    const raw = localStorage.getItem(this.KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(this.KEY);
    // Force reset all in-memory flags before reload
    document.body.classList.remove('game-over');
    localStorage.clear(); // Nuclear reset
    location.reload();
  }
};

// ── Audio ─────────────────────────────────────────────────
const AudioFX = {
  ctx: null,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },
  click() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 + Math.random() * 100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }
};

// ── BgmEngine (Acoustic 'Heaven's Door' Overhaul) ──────────
const BgmEngine = {
  ctx: null,
  masterGain: null,
  isRunning: false,
  intensity: 0,
  
  init() {
    if (this.isRunning) return;
    this.ctx = AudioFX.ctx || new (window.AudioContext || window.webkitAudioContext)();
    AudioFX.ctx = this.ctx;
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
    
    this.isRunning = true;
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    const targetVol = isMuted ? 0 : 0.45;
    this.masterGain.gain.linearRampToValueAtTime(targetVol, this.ctx.currentTime + 3);
    this.startLoop();
  },

  updateMute() {
    const btn = document.getElementById('btn-music-toggle');
    if (btn) {
      btn.textContent = isMuted ? 'MUSIC: OFF' : 'MUSIC: ON';
      btn.classList.toggle('muted', isMuted);
    }

    if (!this.masterGain) return;
    const targetVol = isMuted ? 0 : (0.45 + (this.intensity * 0.2));
    this.masterGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.5);
  },

  // Karplus-Strong string pluck synthesis
  pluck(freq, velocity = 0.5) {
    const dur = 2.5;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    
    const period = Math.floor(sampleRate / freq);
    for (let i = 0; i < period; i++) {
      data[i] = Math.random() * 2 - 1; // initial noise burst
    }
    
    const damping = 0.994 - (this.intensity * 0.04);
    for (let i = period; i < bufferSize; i++) {
      data[i] = (data[i - period] + data[i - period + 1]) * 0.5 * damping;
    }
    
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(velocity, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
    
    // Corruption effect at high intensity
    if (this.intensity > 0.35) {
      const dist = this.ctx.createWaveShaper();
      dist.curve = this.makeDistortionCurve(this.intensity * 120);
      source.connect(dist);
      dist.connect(g);
    } else {
      source.connect(g);
    }
    
    g.connect(this.masterGain);
    source.start();
  },

  makeDistortionCurve(amount) {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  },

  knock() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    // Wooden percussive sound
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);
    
    g.gain.setValueAtTime(0.5 + (this.intensity * 0.5), this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  },

  startLoop() {
    let bar = 0;
    const bpm = 68;
    const beatMs = (60 / bpm) * 1000;
    
    // G - D - Am / G - D - C (Approx keys)
    const chords = [
      [98.00, 123.47, 146.83, 196.00], // G
      [146.83, 185.00, 220.00, 293.66], // D
      [110.00, 130.81, 164.81, 220.00], // Am
      [130.81, 164.81, 196.00, 261.63]  // C
    ];
    const sequence = [0, 1, 2, 2, 0, 1, 3, 3]; // G-D-Am-Am-G-D-C-C

    const playStep = () => {
      if (!this.isRunning) return;
      
      const chordIdx = sequence[bar % sequence.length];
      const currentChord = chords[chordIdx];
      
      // Knock on every bar start
      this.knock();
      
      // Strum chord
      currentChord.forEach((f, i) => {
        setTimeout(() => {
          if (this.isRunning) this.pluck(f * (1 + (Math.random()*0.005)), 0.35 - (i * 0.04));
        }, i * (40 + Math.random() * 20));
      });
      
      bar++;
      setTimeout(playStep, beatMs * 2); // Two beats per chord
    };
    
    playStep();
  },

  update(intensity) {
    this.intensity = intensity;
    // Master volume respects isMuted flag
    if (this.masterGain) {
      const targetVol = isMuted ? 0 : (0.45 + (intensity * 0.2));
      this.masterGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.5);
    }
  }
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
      if (text[i] !== ' ') AudioFX.click();
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

function logMessage(role, text) {
  if (!transcriptLog) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${role}`;
  entry.innerHTML = `
    <span class="log-label">${role === 'judge' ? 'SHERIFF HAYES' : 'DEFENDANT'}</span>
    <span class="log-content">${text}</span>
  `;
  transcriptLog.appendChild(entry);
  transcriptLog.scrollTop = transcriptLog.scrollHeight;
}

/**
 * Generate final door image with hugging face using user summary.
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

  // Log to history if not just loading
  if (!data.isRestoring) {
    messageHistory.push({ role: 'judge', text: dialogue });
    logMessage('judge', dialogue);
    State.save();
  }

  // Intensity bar
  const pct = Math.round(Math.min(1, Math.max(0, intensity)) * 100);
  intensityFill.style.width = `${pct}%`;

  if (intensity >= 0.7) intensityFill.style.background = 'var(--p3-accent)';

  // Update Music
  BgmEngine.update(intensity);

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

    // Let the player read the final verdict for 5 seconds before showing the door
    await new Promise(r => setTimeout(r, 5000));

    switchScene(3);
    document.body.classList.add('game-over');
    State.save(); // Save AFTER game-over class is added so isGameOver === true

    // Generate personalized door — non-blocking
    generateAndShowDoor().catch(err => console.error('Door generation failed:', err));
  }
}

// (Character selection logic removed per request)

// ── Begin: start session ──────────────────────────────────
btnBegin.addEventListener('click', async (e) => {
  console.log('Take the Stand clicked');
  if (selectStatus) selectStatus.textContent = '[CONNECTING...]';
  if (btnBegin.disabled) return;

  // Clear any leftover session before starting fresh
  localStorage.removeItem(State.KEY);
  messageHistory = [];
  currentPhase = 1;

  btnBegin.disabled = true;
  btnBegin.textContent = 'CONNECTING...';
  document.body.classList.remove('game-over');
  userInput.disabled = false;
  userInput.placeholder = "speak your truth...";
  hudPhase.textContent = 'PHASE I — REMINISCENCE';
  
  // Start Music Engine
  BgmEngine.init();
  
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

    const playerBody = document.getElementById('player-body');
    if (playerBody) playerBody.className = `player-body char-${selectedChar}`;

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
    
    // Log player message
    messageHistory.push({ role: 'player', text });
    logMessage('player', text);
    
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

// ── Session Restoration ──────────────────────────────────
async function init() {
  const saved = State.load();
  
  if (saved && saved.messageHistory && saved.messageHistory.length > 0) {
    console.log('Restoring previous session...');
    selectedChar = saved.selectedChar;
    currentPhase = saved.currentPhase;
    messageHistory = saved.messageHistory;

    // Set visuals
    document.body.className = `phase-${currentPhase}`;
    hudPhase.textContent = PHASE_NAMES[currentPhase] || `PHASE ${currentPhase}`;
    switchScene(currentPhase);
    
    const playerBody = document.getElementById('player-body');
    if (playerBody) playerBody.className = `player-body char-${selectedChar}`;
    
    // Restore intensity
    const intensity = saved.intensity || 0;
    intensityFill.style.width = `${intensity * 100}%`;
    if (intensity >= 0.7) intensityFill.style.background = 'var(--p3-accent)';

    // Restore transcript
    messageHistory.forEach(msg => logMessage(msg.role, msg.text));

    // Show game screen
    showScreen('screen-game');
    Look.init();

    // Clear any finished or broken session (game-over or stuck on phase 3)
    if (saved.isGameOver || saved.currentPhase === 3) {
      localStorage.removeItem(State.KEY);
      document.body.className = 'phase-1';
      return;
    }

    // Restore the last dialogue text
    const lastJudgeMsg = [...messageHistory].reverse().find(m => m.role === 'judge');
    if (lastJudgeMsg) {
      dialogueText.textContent = lastJudgeMsg.text;
    }

    // Restore Music
    BgmEngine.init();
    BgmEngine.update(intensity);

  } else {
    document.body.className = 'phase-1';
  }
}

btnReset.addEventListener('click', () => {
  if (confirm('Are you sure you want to discard this record and start a NEW session?')) {
    State.clear();
  }
});

// Run init and setup mute toggle
init();
document.getElementById('btn-music-toggle').addEventListener('click', () => {
  isMuted = !isMuted;
  BgmEngine.updateMute();
  State.save();
});
BgmEngine.updateMute();
