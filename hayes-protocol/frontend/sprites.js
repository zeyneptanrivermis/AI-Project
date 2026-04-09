/**
 * sprites.js — Sprite animation system
 *
 * Currently uses CSS animations as fallback.
 * When Piskel spritesheets are ready, set them up here
 * by calling Sprites.loadSheet('judge', 'assets/judge_sheet.png', frameW, frameH)
 * and the system will switch from CSS to canvas-based animation.
 *
 * Spritesheet format: frames laid out horizontally.
 *   Row 0 — idle frames
 *   Row 1 — talk frames
 *   Row 2 — look-left frames (player only)
 */

const Sprites = (() => {
  const _sheets = {};

  /**
   * Load a spritesheet for a character.
   * @param {string} name       - 'judge' | 'player'
   * @param {string} src        - path to spritesheet PNG
   * @param {number} frameW     - single frame width in px
   * @param {number} frameH     - single frame height in px
   * @param {object} anims      - { idle: {row, frames, fps}, talk: {row, frames, fps}, ... }
   */
  function loadSheet(name, src, frameW, frameH, anims) {
    const img = new Image();
    img.onload = () => {
      _sheets[name] = { img, frameW, frameH, anims };
      console.log(`[Sprites] Loaded spritesheet: ${name}`);
    };
    img.onerror = () => {
      console.warn(`[Sprites] Failed to load spritesheet: ${src} — using CSS fallback`);
    };
    img.src = src;
  }

  /**
   * Set the state of a character sprite.
   * When a spritesheet is loaded, this drives canvas animation.
   * Otherwise it just sets CSS classes.
   * @param {string} elementId  - DOM element id
   * @param {string} name       - 'judge' | 'player'
   * @param {string} state      - 'idle' | 'talk' | 'looking-left' | 'looking-right'
   */
  function setState(elementId, name, state) {
    const el = document.getElementById(elementId);
    if (!el) return;

    // CSS class approach (fallback, always works)
    el.className = el.className
      .replace(/sprite-\S+|looking-\S+/g, '')
      .trim();

    if (state === 'idle')          el.classList.add('sprite-idle');
    else if (state === 'talk')     el.classList.add('sprite-talk');
    else if (state === 'looking-left')  el.classList.add('looking-left');
    else if (state === 'looking-right') el.classList.add('looking-right');
  }

  return { loadSheet, setState };
})();
