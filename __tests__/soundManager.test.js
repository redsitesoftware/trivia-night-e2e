'use strict';

describe('soundManager unit tests', () => {
  let soundManager;
  let mockPlay;
  let localStorageStore;

  beforeEach(() => {
    jest.resetModules();

    localStorageStore = {};
    global.localStorage = {
      getItem: jest.fn(key => localStorageStore[key] ?? null),
      setItem: jest.fn((key, value) => { localStorageStore[key] = String(value); }),
      removeItem: jest.fn(key => { delete localStorageStore[key]; }),
      clear: jest.fn(() => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }),
    };

    mockPlay = jest.fn().mockResolvedValue(undefined);
    global.Audio = jest.fn().mockImplementation(() => ({ play: mockPlay }));

    soundManager = require('../public/soundManager');
  });

  afterEach(() => {
    delete global.localStorage;
    delete global.Audio;
  });

  describe('play()', () => {
    it('calls Audio.play() when not muted', () => {
      soundManager.unmute();
      soundManager.play('/sounds/correct.mp3');

      expect(global.Audio).toHaveBeenCalledWith('/sounds/correct.mp3');
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    it('does NOT call Audio.play() when muted', () => {
      soundManager.mute();
      soundManager.play('/sounds/correct.mp3');

      expect(global.Audio).not.toHaveBeenCalled();
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it('catches promise rejection silently (autoplay guard)', async () => {
      mockPlay.mockRejectedValue(new Error('NotAllowedError'));
      soundManager.unmute();

      expect(() => soundManager.play('/sounds/tick.mp3')).not.toThrow();

      // Allow the rejected promise to settle without causing unhandled rejection
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  describe('mute() / unmute()', () => {
    it('mute() sets isMuted() to true', () => {
      soundManager.unmute();
      soundManager.mute();
      expect(soundManager.isMuted()).toBe(true);
    });

    it('unmute() sets isMuted() to false', () => {
      soundManager.mute();
      soundManager.unmute();
      expect(soundManager.isMuted()).toBe(false);
    });

    it('mute() persists "true" to localStorage', () => {
      soundManager.mute();
      expect(global.localStorage.setItem).toHaveBeenCalledWith('trivia_muted', 'true');
    });

    it('unmute() persists "false" to localStorage', () => {
      soundManager.unmute();
      expect(global.localStorage.setItem).toHaveBeenCalledWith('trivia_muted', 'false');
    });
  });

  describe('isMuted() — persisted state on init', () => {
    it('initialises as muted when localStorage has "true"', () => {
      localStorageStore['trivia_muted'] = 'true';
      jest.resetModules();
      const sm = require('../public/soundManager');
      expect(sm.isMuted()).toBe(true);
    });

    it('initialises as unmuted when localStorage has "false"', () => {
      localStorageStore['trivia_muted'] = 'false';
      jest.resetModules();
      const sm = require('../public/soundManager');
      expect(sm.isMuted()).toBe(false);
    });

    it('initialises as unmuted when localStorage has no entry', () => {
      expect(soundManager.isMuted()).toBe(false);
    });
  });
});
