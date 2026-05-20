/* ===== soundManager =====
 * Plays named WAV clips from /public/sounds/.
 * Mute state is persisted in localStorage under the key `soundMuted`.
 */
const soundManager = (() => {
  const SOUNDS = {
    'correct':     '/sounds/correct.wav',
    'wrong':       '/sounds/wrong.wav',
    'tick':        '/sounds/tick.wav',
    'round-start': '/sounds/round-start.wav',
    'game-over':   '/sounds/game-over.wav',
  };

  let muted = localStorage.getItem('soundMuted') === 'true';

  function play(eventName) {
    if (muted) return;
    const src = SOUNDS[eventName];
    if (!src) return;
    const audio = new Audio(src);
    audio.play().catch(() => { /* autoplay policy — silently ignore */ });
  }

  function mute() {
    muted = true;
    localStorage.setItem('soundMuted', 'true');
  }

  function unmute() {
    muted = false;
    localStorage.setItem('soundMuted', 'false');
  }

  function isMuted() {
    return muted;
  }

  return { play, mute, unmute, isMuted };
})();
