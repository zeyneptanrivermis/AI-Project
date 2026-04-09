/**
 * look.js — Head-turning mechanic
 * ← Arrow: look at jury (left)
 * → Arrow: face the judge (forward)
 * Locked during phase 2 (Vietnam flashback)
 */

const Look = (() => {
  let _direction = 'forward'; // 'forward' | 'left'
  let _locked    = false;

  const _juryPanel  = () => document.getElementById('jury-panel');
  const _judgeWrap  = () => document.getElementById('judge-wrap');
  const _playerSpr  = () => document.getElementById('player-sprite');
  const _lockOv     = () => document.getElementById('lock-overlay');
  const _lookHint   = () => document.getElementById('look-hint');

  function _apply(dir) {
    _direction = dir;
    const jury   = _juryPanel();
    const judge  = _judgeWrap();
    const player = _playerSpr();

    if (dir === 'left') {
      jury.classList.add('visible');
      judge.classList.add('fade-back');
      player.classList.remove('looking-right', 'sprite-idle');
      player.classList.add('looking-left');
    } else {
      jury.classList.remove('visible');
      judge.classList.remove('fade-back');
      player.classList.remove('looking-left', 'looking-right');
      player.classList.add('sprite-idle');
    }
  }

  function setLocked(val) {
    _locked = val;
    const overlay = _lockOv();
    const hint    = _lookHint();

    if (val) {
      overlay.classList.add('visible');
      if (hint) hint.textContent = 'YOU CANNOT LOOK AWAY';
      _apply('forward');
    } else {
      overlay.classList.remove('visible');
      if (hint) hint.textContent = '← JURY    |    JUDGE →';
    }
  }

  function isLocked() { return _locked; }

  function init() {
    document.addEventListener('keydown', (e) => {
      if (_locked) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); _apply('left'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); _apply('forward'); }
    });
  }

  return { init, setLocked, isLocked };
})();
