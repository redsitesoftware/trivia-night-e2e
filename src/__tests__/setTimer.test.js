'use strict';

const { createRoom, startGame, setTimer, deleteRoom, QUESTION_TIME_SECS } = require('../../src/rooms');

describe('setTimer', () => {
  let room;

  beforeEach(() => {
    jest.useFakeTimers();
    ({ room } = createRoom(null, 'Host'));
  });

  afterEach(() => {
    if (room && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    if (room) deleteRoom(room.code);
    jest.useRealTimers();
  });

  test('defaults to QUESTION_TIME_SECS', () => {
    expect(room.questionTimeSecs).toBe(QUESTION_TIME_SECS);
  });

  test('sets valid duration in lobby', () => {
    const result = setTimer(room, 60);
    expect(result).toEqual({ duration: 60 });
    expect(room.questionTimeSecs).toBe(60);
  });

  test('accepts boundary values 10 and 120', () => {
    expect(setTimer(room, 10)).toEqual({ duration: 10 });
    expect(setTimer(room, 120)).toEqual({ duration: 120 });
  });

  test('rejects duration below 10', () => {
    const result = setTimer(room, 5);
    expect(result.error).toBeDefined();
    expect(room.questionTimeSecs).toBe(QUESTION_TIME_SECS);
  });

  test('rejects duration above 120', () => {
    const result = setTimer(room, 200);
    expect(result.error).toBeDefined();
    expect(room.questionTimeSecs).toBe(QUESTION_TIME_SECS);
  });

  test('rejects non-integer duration', () => {
    const result = setTimer(room, 30.5);
    expect(result.error).toBeDefined();
  });

  test('rejects setting timer after game has started', () => {
    startGame(room, jest.fn(), jest.fn());
    const result = setTimer(room, 45);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/before the game starts/);
  });

  test('question_start uses the configured timer duration', () => {
    setTimer(room, 45);
    const broadcast = jest.fn();
    // Intercept nextQuestion by mocking broadcast on players
    const messages = [];
    room.players.forEach(p => {
      p.ws = { readyState: 1, send: (data) => messages.push(JSON.parse(data)) };
    });
    startGame(room, jest.fn(), jest.fn());
    const questionStart = messages.find(m => m.type === 'question_start');
    expect(questionStart).toBeDefined();
    expect(questionStart.timeLimit).toBe(45);
  });
});
