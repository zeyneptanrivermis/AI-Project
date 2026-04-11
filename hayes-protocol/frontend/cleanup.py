import os

def clean_style():
    path = r'c:\Users\zeynep\Desktop\ProjectAI\hayes-protocol\frontend\style.css'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    start_tag = '/* ── Game Over state ── */'
    idx = content.find(start_tag)
    if idx != -1:
        new_content = content[:idx] + """/* ── Game Over state ── */
body.game-over #judge-wrap, body.game-over #dialogue-wrap { 
  display: none !important; 
}
body.game-over #input-wrap { 
  opacity: 0.1 !important; 
  pointer-events: none; 
}
body.game-over #btn-reset { 
  position: fixed; 
  top: 15px; 
  left: 15px; 
  z-index: 100001; 
  border-color: #fff; 
  color: #fff; 
  background: rgba(0,0,0,0.6); 
  pointer-events: all; 
  opacity: 1 !important;
  display: block !important;
}
body.game-over #hud-phase { 
  position: fixed; 
  top: 2rem; 
  left: 50%; 
  transform: translateX(-50%); 
  font-size: 2rem; 
  letter-spacing: 0.4em; 
  color: #8b1a1a !important; 
  text-shadow: 0 0 30px rgba(0,0,0,1); 
  z-index: 100001; 
  opacity: 1 !important; 
}
#scene-3 { 
  z-index: 1000; 
  background-size: cover !important; 
  background-position: center !important; 
}
#scene-3.active { 
  opacity: 1; 
  display: block; 
}
.settings-btn { 
  position: fixed; 
  top: 15px; 
  right: 15px; 
  z-index: 100001; 
  background: rgba(0, 0, 0, 0.4); 
  border: 1px solid #3a2e22; 
  color: #5a4a34; 
  font-family: 'Courier Prime', monospace; 
  font-size: 0.65rem; 
  padding: 6px 12px; 
  cursor: pointer; 
  transition: all 0.3s ease; 
  backdrop-filter: blur(4px); 
  text-transform: uppercase; 
}
.settings-btn:hover { border-color: #4a6741; color: #d0c0a0; background: rgba(0, 0, 0, 0.7); }
.settings-btn.muted { opacity: 0.6; }
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3a2e22; }
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)

def clean_game():
    path = r'c:\Users\zeynep\Desktop\ProjectAI\hayes-protocol\frontend\game.js'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    start_tag = "btnReset.addEventListener('click'"
    idx = content.find(start_tag)
    if idx != -1:
        new_content = content[:idx] + """btnReset.addEventListener('click', () => {
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
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)

if __name__ == '__main__':
    clean_style()
    clean_game()
    print("Cleanup successful.")
