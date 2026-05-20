/**
 * @jest-environment jsdom
 *
 * Integration / smoke test: mute toggle button sets correct localStorage value.
 * Uses jsdom so that the real localStorage API is available.
 */
'use strict';

describe('mute toggle button — integration', () => {
  let soundManager;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();

    global.Audio = jest.fn().mockImplementation(() => ({
      play: jest.fn().mockResolvedValue(undefined),
    }));

    soundManager = require('../public/soundManager');

    // Minimal DOM: mute toggle button as it appears in index.html
    document.body.innerHTML = `
      <button id="mute-toggle" onclick="toggleMute()">🔊 Sound On</button>
    `;

    // Provide the toggleMute handler that app.js defines
    global.toggleMute = function () {
      if (soundManager.isMuted()) {
        soundManager.unmute();
        document.getElementById('mute-toggle').textContent = '🔊 Sound On';
      } else {
        soundManager.mute();
        document.getElementById('mute-toggle').textContent = '🔇 Sound Off';
      }
    };
  });

  afterEach(() => {
    delete global.toggleMute;
    delete global.Audio;
  });

  it('clicking the mute toggle mutes and sets trivia_muted="true" in localStorage', () => {
    // Start unmuted
    expect(soundManager.isMuted()).toBe(false);

    document.getElementById('mute-toggle').click();

    expect(soundManager.isMuted()).toBe(true);
    expect(localStorage.getItem('trivia_muted')).toBe('true');
    expect(document.getElementById('mute-toggle').textContent).toBe('🔇 Sound Off');
  });

  it('clicking the mute toggle a second time unmutes and sets trivia_muted="false"', () => {
    document.getElementById('mute-toggle').click(); // mute
    document.getElementById('mute-toggle').click(); // unmute

    expect(soundManager.isMuted()).toBe(false);
    expect(localStorage.getItem('trivia_muted')).toBe('false');
    expect(document.getElementById('mute-toggle').textContent).toBe('🔊 Sound On');
  });
});
