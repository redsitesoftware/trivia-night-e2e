/* soundManager — client-side audio module */
const soundManager = (() => {
  const STORAGE_KEY = 'soundMuted';
  const SOUNDS = ['correct', 'wrong', 'tick', 'game-start', 'game-over'];

  let muted = localStorage.getItem(STORAGE_KEY) === 'true';

  const cache = {};
  SOUNDS.forEach(name => {
    const audio = new Audio(`/sounds/${name}.wav`);
    audio.preload = 'auto';
    cache[name] = audio;
  });

  function play(eventName) {
    if (muted) return;
    const audio = cache[eventName];
    if (!audio) return;
    const clone = audio.cloneNode();
    clone.play().catch(() => {});
  }

  function mute() {
    muted = true;
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  function unmute() {
    muted = false;
    localStorage.setItem(STORAGE_KEY, 'false');
  }

  function isMuted() {
    return muted;
  }

  return { play, mute, unmute, isMuted };
})();
