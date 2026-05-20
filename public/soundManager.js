/* ===== soundManager =====
 * Manages audio playback and mute state with localStorage persistence.
 */

const STORAGE_KEY = 'trivia_muted';

let _muted = false;

function _loadPersistedState() {
  try {
    _muted = localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (e) {
    _muted = false;
  }
}

function isMuted() {
  return _muted;
}

function mute() {
  _muted = true;
  try { localStorage.setItem(STORAGE_KEY, 'true'); } catch (e) {}
}

function unmute() {
  _muted = false;
  try { localStorage.setItem(STORAGE_KEY, 'false'); } catch (e) {}
}

function play(src) {
  if (_muted) return;
  const audio = new Audio(src);
  audio.play().catch(() => {}); // autoplay guard: silently swallow rejection
}

// Read persisted mute state on load
_loadPersistedState();

/* Export for Node.js (Jest); expose as global in browser */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { play, mute, unmute, isMuted, _loadPersistedState };
} else {
  window.soundManager = { play, mute, unmute, isMuted };
}
