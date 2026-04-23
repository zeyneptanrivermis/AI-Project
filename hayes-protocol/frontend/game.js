/**
 * game.js — Main game loop for KNOCK
 * Manages: character selection → session start → chat → phase transitions
 */

const API = 'https://hayes-protocol-game.vercel.app';

// ── State ─────────────────────────────────────────────────
let selectedChar = 'A'; // Hardcoded default character
let currentPhase = 1;
let isTyping = false;
let isWaiting = false;
let messageHistory = []; // Array of {role, text}
let chatHistory = []; // LLM conversation history sent to backend
let isMuted = localStorage.getItem('hayes_muted') === 'true';
let currentDoorUrl = null;
let intensityHistory = [];
let lastUserSummary = '';

// ── Error Handling ───────────────────────────────────────
let _rateLimitTimer = null;

async function parseErrorResponse(res) {
  try {
    const body = await res.json();
    return body.detail || body;
  } catch {
    return { type: 'server_error', message: `HTTP ${res.status}` };
  }
}

function errorMessage(detail) {
  if (!detail) return 'Connection lost.';
  if (typeof detail === 'string') return 'Something went wrong. Please try again.';
  switch (detail.type) {
    case 'rate_limit': return `__RATE_LIMIT__${detail.retry_after || 60}`;
    case 'auth_error': return 'API key invalid. Contact the developer.';
    case 'no_key': return 'API key not configured. Contact the developer.';
    case 'server_error': return 'Something went wrong on our end. Please try again.';
    default: return 'Something went wrong. Please try again.';
  }
}

function showRateLimitCountdown(seconds, onDone) {
  if (_rateLimitTimer) clearInterval(_rateLimitTimer);
  let remaining = seconds;

  const update = () => {
    const mins = Math.floor(remaining / 60);
    const secs = String(remaining % 60).padStart(2, '0');
    const timeStr = mins > 0 ? `${mins}:${secs}` : `${remaining}s`;
    dialogueText.textContent = `[ AI rate limit reached. The tribunal resumes in ${timeStr}... ]`;
    if (remaining <= 0) {
      clearInterval(_rateLimitTimer);
      _rateLimitTimer = null;
      if (onDone) onDone();
    }
    remaining--;
  };

  update();
  _rateLimitTimer = setInterval(update, 1000);
}

// ── Visual Error Logging ─────────────────────────────────
window.onerror = function (msg, url, line, col, error) {
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
      chatHistory,
      intensity: parseFloat(intensityFill.style.width) / 100 || 0,
      isGameOver: document.body.classList.contains('game-over'),
      isMuted,
      intensityHistory,
      lastUserSummary
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
    setTimeout(() => { if (this.isRunning) this.startAmbient(); }, 600);
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
    if (this.ambientGain) {
      const base = [0.018, 0.032, 0.01][currentPhase - 1] ?? 0.018;
      this.ambientGain.gain.setTargetAtTime(isMuted ? 0 : base + this.intensity * 0.015, this.ctx.currentTime, 0.5);
    }
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
          if (this.isRunning) this.pluck(f * (1 + (Math.random() * 0.005)), 0.35 - (i * 0.04));
        }, i * (40 + Math.random() * 20));
      });

      bar++;
      setTimeout(playStep, beatMs * 2); // Two beats per chord
    };

    playStep();
  },

  update(intensity) {
    this.intensity = intensity;
    if (this.masterGain) {
      const targetVol = isMuted ? 0 : (0.45 + (intensity * 0.2));
      this.masterGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.5);
    }
  },

  ambientGain: null,
  ambientFilter: null,

  startAmbient() {
    if (this.ambientGain) return;
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.value = 280;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = isMuted ? 0 : 0.018;
    src.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    src.start();
  },

  updateAmbient(phase, intensity) {
    if (!this.ambientGain || !this.ambientFilter) return;
    const base = [0.018, 0.032, 0.01][phase - 1] ?? 0.018;
    this.ambientGain.gain.setTargetAtTime(isMuted ? 0 : base + intensity * 0.015, this.ctx.currentTime, 2.5);
    const freq = phase === 3 ? 140 : (phase === 2 ? 380 : 280);
    this.ambientFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 2.5);
  },

  phaseTransitionSound(phase) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const f = phase === 3 ? 52 : 68;
    osc.frequency.setValueAtTime(f, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(f * 0.5, this.ctx.currentTime + 1.8);
    g.gain.setValueAtTime(isMuted ? 0 : 0.22, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.8);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 1.8);
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
    const res = await fetch(`${API}/generate-door`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: lastUserSummary }),
    });
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

      // Remove the red screen and CSS door
      el.classList.remove('css-final');

      const fallback = document.getElementById('door-fallback');
      if (fallback) fallback.remove();

      const overlay = document.getElementById('phase-color-overlay');
      if (overlay) overlay.style.display = 'none';
    }
  } catch (_) {
    // CSS fallback stays
  }
}

/**
 * Apply response data from the judge: phase, dialogue, intensity, lock_look.
 */
async function applyResponse(data) {
  // Safety fallback: if LLM forces phase 3 (e.g. swearing), ensure finished is true
  if (data.phase === 3) data.finished = true;

  const { phase, dialogue, intensity, lock_look } = data;

  // Phase transition
  if (phase !== currentPhase) {
    currentPhase = phase;
    document.body.className = `phase-${phase}`;
    hudPhase.textContent = PHASE_NAMES[phase] || `PHASE ${phase}`;
    switchScene(phase);
    BgmEngine.phaseTransitionSound(phase);

    // JS-only fix: immediately remove red screen and CSS door when phase 3 starts
    if (phase === 3) {
      const scene3 = document.getElementById('scene-3');
      if (scene3) scene3.classList.remove('css-final');
      const fallback = document.getElementById('door-fallback');
      if (fallback) fallback.remove();
      const overlay = document.getElementById('phase-color-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    document.body.classList.add('shaking');
    setTimeout(() => document.body.classList.remove('shaking'), 450);
  }

  // Log to history if not just loading
  if (!data.isRestoring) {
    messageHistory.push({ role: 'judge', text: dialogue });
    logMessage('judge', dialogue);
    intensityHistory.push(intensity);
    if (data.user_summary) lastUserSummary = data.user_summary;
    State.save();
  }

  // Intensity bar
  const pct = Math.round(Math.min(1, Math.max(0, intensity)) * 100);
  intensityFill.style.width = `${pct}%`;

  if (intensity >= 0.7) intensityFill.style.background = 'var(--p3-accent)';

  // Update Music
  BgmEngine.update(intensity);
  BgmEngine.updateAmbient(currentPhase, intensity);

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

    State.save();

    // Start generating the door in the background immediately
    const doorPromise = generateAndShowDoor();

    // Show the door button
    const doorWrap = document.getElementById('door-btn-wrap');
    const btnDoor = document.getElementById('btn-door');
    const doorHint = document.getElementById('door-btn-hint');
    if (doorWrap) doorWrap.classList.add('visible');

    // On button click: wait for door image then transition
    if (btnDoor) {
      btnDoor.onclick = async () => {
        btnDoor.disabled = true;
        btnDoor.textContent = 'OPENING...';
        if (doorHint) doorHint.textContent = 'preparing your door...';

        // Wait for image to be ready (it may already be done)
        await doorPromise;

        if (doorWrap) doorWrap.classList.remove('visible');
        document.body.classList.add('game-over');
        switchScene(3);

        // Show download and report buttons once scene 3 is active
        const btnDownload = document.getElementById('btn-download');
        if (btnDownload) btnDownload.style.display = 'block';

        const btnReport = document.getElementById('btn-report');
        if (btnReport) {
          btnReport.style.display = 'block';
          buildReport(); // Trigger data generation
        }
      };
    }
  }
}


// ── Result Report ─────────────────────────────────────────
function classifyType(hist) {
  const n = hist.length;
  if (!n) return { type: 'THE SEEKER', desc: 'The record is incomplete.' };
  const avg = hist.reduce((a, b) => a + b, 0) / n;
  const first = hist[0], final = hist[n - 1];
  const dropped = first - final > 0.2 && avg < 0.65;
  const rose = final - first > 0.25;
  if (avg < 0.3) return { type: 'THE OPEN SOUL', desc: 'You faced yourself without flinching. The record shows a man with nothing left to hide.' };
  if (dropped) return { type: 'THE REDEEMED', desc: 'The walls came down. What started as resistance ended in honesty. Hayes saw it happen.' };
  if (rose) return { type: 'THE CORNERED', desc: 'You dug in harder as the questions got closer. Truth felt like a threat.' };
  if (avg < 0.5) return { type: 'THE SEEKER', desc: 'You wrestled with it. Pushed back sometimes, opened up in others. Still searching.' };
  if (avg < 0.7) return { type: 'THE CONFLICTED', desc: 'Every honest answer cost you something. The pressure showed where the scars are.' };
  return { type: 'THE DEFIANT', desc: "The walls never came down. Hayes couldn't reach you." };
}

function generateLetter(type, hist, summary) {
  const n = hist.length;
  if (!n) return ['No record was kept.'];
  const p1 = hist.slice(0, Math.min(3, n));
  const p2 = hist.slice(3, Math.min(7, n));
  const last = hist[n - 1];
  const avg1 = p1.reduce((a, b) => a + b, 0) / p1.length;
  const avg2 = p2.length ? p2.reduce((a, b) => a + b, 0) / p2.length : avg1;

  const openings = {
    'THE OPEN SOUL': "I've sat across from a lot of men. You're one of the few who didn't make me work for it.",
    'THE REDEEMED': "You came in with your armor on. Somewhere in the middle, you took it off.",
    'THE CORNERED': "You fought every question like it was a trap. Maybe that's the problem.",
    'THE SEEKER': "You kept looking for the right answer. There wasn't one. That's the point.",
    'THE CONFLICTED': "I've seen men crack clean. You cracked in pieces. That's harder — and more honest.",
    'THE DEFIANT': "You never gave me much. But the way you held back told me everything.",
  };

  const lines = [];
  lines.push(openings[type] || openings['THE CONFLICTED']);

  if (avg1 < 0.35) lines.push("The first questions — you answered them clean. No hedging, no theater.");
  else if (avg1 < 0.55) lines.push("The first questions — you were careful. Every word weighed before it landed.");
  else lines.push("From the start your guard was up. I didn't take it personally.");

  if (p2.length) {
    if (avg2 < 0.35) lines.push("When I pushed deeper, you didn't pull back. That takes something.");
    else if (avg2 < 0.6) lines.push("The harder questions — you pushed back, then relented. The truth was closer than you let on.");
    else lines.push("The weight of it — you felt it. You just weren't ready to set it down.");
  }

  const keywords = summary ? summary.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2) : [];
  if (keywords.length >= 2) lines.push(`You kept coming back to "${keywords[0]}" and "${keywords[1]}". Make of that what you will.`);

  if (last < 0.3) lines.push("You leave this room lighter than you came in. That's rare. Hold onto it.");
  else if (last < 0.55) lines.push("I don't know if you found what you needed here. But you were present. That matters.");
  else lines.push("Whatever you're carrying — you walked out still carrying it. That's yours to put down when you're ready.");

  return lines;
}

function buildJourneySVG(hist) {
  const n = hist.length;
  if (n < 2) return '<p style="font-size:0.7rem;color:rgba(42,31,18,0.5);text-align:center">—</p>';
  const W = 380, H = 20 + (n - 1) * 28 + 30;
  const cx = W / 2;
  const pts = hist.map((val, i) => ({
    x: cx + (val - 0.5) * 240,
    y: 20 + i * 28,
    val, i
  }));
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i];
    const mid = (prev.y + curr.y) / 2;
    d += ` C ${prev.x.toFixed(1)},${mid.toFixed(1)} ${curr.x.toFixed(1)},${mid.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  const dotFill = v => v >= 0.7 ? '#7a1515' : v >= 0.4 ? '#6b4f10' : '#2d4a28';
  const sepY2 = n > 3 ? pts[3].y - 12 : -1;
  const sepY3 = n > 7 ? pts[7].y - 12 : -1;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">
    <line x1="${cx}" y1="8" x2="${cx}" y2="${H - 14}" stroke="rgba(42,31,18,0.12)" stroke-dasharray="3,4"/>
    ${sepY2 > 0 ? `<line x1="28" y1="${sepY2}" x2="${W - 28}" y2="${sepY2}" stroke="rgba(42,31,18,0.18)" stroke-dasharray="4,3"/>
    <text x="28" y="${sepY2 - 2}" fill="rgba(42,31,18,0.38)" font-size="6.5" font-family="Courier Prime,monospace" letter-spacing="1">PHASE II</text>` : ''}
    ${sepY3 > 0 ? `<line x1="28" y1="${sepY3}" x2="${W - 28}" y2="${sepY3}" stroke="rgba(42,31,18,0.18)" stroke-dasharray="4,3"/>
    <text x="28" y="${sepY3 - 2}" fill="rgba(42,31,18,0.38)" font-size="6.5" font-family="Courier Prime,monospace" letter-spacing="1">PHASE III</text>` : ''}
    <text x="28" y="14" fill="rgba(42,31,18,0.38)" font-size="6.5" font-family="Courier Prime,monospace" letter-spacing="1">PHASE I</text>
    <path d="${d}" fill="none" stroke="rgba(42,31,18,0.35)" stroke-width="1.5"/>
    ${pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="${dotFill(p.val)}" stroke="rgba(200,184,152,0.7)" stroke-width="1.2"/>
    <text x="${p.x > cx ? p.x + 9 : p.x - 20}" y="${(p.y + 3.5).toFixed(1)}" fill="rgba(42,31,18,0.4)" font-size="6.5" font-family="Courier Prime,monospace">Q${p.i + 1}</text>`).join('')}
    <text x="14" y="${H - 3}" fill="rgba(42,31,18,0.35)" font-size="6" font-family="Courier Prime,monospace">← honest</text>
    <text x="${W - 58}" y="${H - 3}" fill="rgba(42,31,18,0.35)" font-size="6" font-family="Courier Prime,monospace">evasive →</text>
  </svg>`;
}

function buildReport() {
  const hist = intensityHistory;
  const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
  const peak = hist.length ? Math.max(...hist) : 0;
  const final = hist.length ? hist[hist.length - 1] : 0;

  const { type, desc } = classifyType(hist);
  document.getElementById('report-type').textContent = type;
  document.getElementById('report-desc').textContent = desc;
  document.getElementById('report-stat-avg').textContent = Math.round(avg * 100) + '%';
  document.getElementById('report-stat-peak').textContent = Math.round(peak * 100) + '%';
  document.getElementById('report-stat-final').textContent = Math.round(final * 100) + '%';
  document.getElementById('report-stat-q').textContent = hist.length;

  const letterLines = generateLetter(type, hist, lastUserSummary);
  document.getElementById('report-letter').innerHTML = letterLines
    .map(l => `<p class="report-letter-line">${l}</p>`)
    .join('') + '<p class="report-letter-sig">— Sheriff R. Hayes &nbsp;·&nbsp; Lincoln County, NM &nbsp;·&nbsp; 1881</p>';

  document.getElementById('report-journey').innerHTML = buildJourneySVG(hist);
}

function showReport(summary) {
  buildReport();
  const el = document.getElementById('report-summary-text');
  if (el) el.textContent = summary || '—';
  document.getElementById('report-overlay').classList.add('visible');
}

const btnReport = document.getElementById('btn-report');
if (btnReport) {
  btnReport.addEventListener('click', () => showReport(lastUserSummary));
}
document.getElementById('btn-close-report').addEventListener('click', () => {
  document.getElementById('report-overlay').classList.remove('visible');
});

// Handle Download — fetch directly from backend for reliability
const btnDownload = document.getElementById('btn-download');
if (btnDownload) {
  btnDownload.addEventListener('click', async () => {
    const originalText = btnDownload.textContent;
    btnDownload.textContent = 'DOWNLOADING...';
    btnDownload.disabled = true;

    try {
      const res = await fetch(`${API}/door-image`);
      if (!res.ok) throw new Error('Image not available');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'your_door.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      btnDownload.textContent = 'DOWNLOADED ✓';
    } catch (err) {
      console.error('Download failed:', err);
      btnDownload.textContent = 'DOWNLOAD FAILED';
    } finally {
      setTimeout(() => {
        btnDownload.textContent = originalText;
        btnDownload.disabled = false;
      }, 3000);
    }
  });
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
  chatHistory = [];
  try {
    const res = await fetch(`${API}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: selectedChar }),
    });

    if (!res.ok) {
      const detail = await parseErrorResponse(res);
      const msg = errorMessage(detail);
      const display = msg.startsWith('__RATE_LIMIT__')
        ? `Rate limit reached. Wait ~${msg.split('__RATE_LIMIT__')[1]}s then try again.`
        : msg;
      selectStatus.textContent = display;
      btnBegin.disabled = false;
      btnBegin.textContent = 'TAKE THE STAND';
      showScreen('screen-select');
      return;
    }

    const data = await res.json();
    if (data.history) chatHistory = data.history;

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
    selectStatus.textContent = 'Connection error. Backend unreachable.';
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
      body: JSON.stringify({ message: text, character: selectedChar, history: chatHistory }),
    });

    if (!res.ok) {
      const detail = await parseErrorResponse(res);
      const msg = errorMessage(detail);
      if (msg.startsWith('__RATE_LIMIT__')) {
        const secs = parseInt(msg.split('__RATE_LIMIT__')[1]) || 60;
        showRateLimitCountdown(secs, () => {
          isWaiting = false;
          userInput.disabled = false;
          btnSend.disabled = false;
          userInput.value = text;
          userInput.focus();
        });
        return;
      }
      dialogueText.textContent = `[ ${msg} ]`;
      isWaiting = false;
      if (currentPhase < 3) {
        userInput.disabled = false;
        btnSend.disabled = false;
      }
      return;
    }

    const data = await res.json();
    if (data.history) chatHistory = data.history;

    // Log player message
    messageHistory.push({ role: 'player', text });
    logMessage('player', text);

    await applyResponse(data);

  } catch (err) {
    console.error('Chat error:', err);
    dialogueText.textContent = '[ Connection lost. Check your internet and try again. ]';
  }

  isWaiting = false;
  if (currentPhase < 3) {
    userInput.disabled = false;
    btnSend.disabled = false;
    userInput.focus();
  }
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
    chatHistory = saved.chatHistory || [];

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
    intensityHistory = saved.intensityHistory || [];
    lastUserSummary = saved.lastUserSummary || '';

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
