'use strict';

// Unit tests for configurable question timer (issue #354)
// Covers nextQuestion() and submitAnswer() in src/rooms.js

const { createRoom, startGame, submitAnswer, deleteRoom, QUESTION_TIME_SECS } = require('../../src/rooms');

function mockWs(readyState = 1) {
  return {
    readyState,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

// ─── nextQuestion() — question_start broadcast ────────────────────────────────

describe('nextQuestion — question_start timeLimit', () => {
  let room, hostId, hostWs;
  let onTimerTick, onTimerEnd;

  beforeEach(() => {
    jest.useFakeTimers();
    onTimerTick = jest.fn();
    onTimerEnd = jest.fn();
    hostWs = mockWs();
    ({ room, playerId: hostId } = createRoom(hostWs, 'Host'));
  });

  afterEach(() => {
    if (room && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    if (room) deleteRoom(room.code);
    jest.useRealTimers();
  });

  function getQuestionStart() {
    return hostWs.messages.find(m => m.type === 'question_start');
  }

  it('timeLimit defaults to QUESTION_TIME_SECS (30) when questionTimeSecs is not set', () => {
    startGame(room, onTimerTick, onTimerEnd);
    const qs = getQuestionStart();
    expect(qs).toBeDefined();
    expect(qs.timeLimit).toBe(QUESTION_TIME_SECS);
    expect(qs.timeLimit).toBe(30);
  });

  it('timeLimit uses room.questionTimeSecs when set to 60', () => {
    room.questionTimeSecs = 60;
    startGame(room, onTimerTick, onTimerEnd);
    const qs = getQuestionStart();
    expect(qs).toBeDefined();
    expect(qs.timeLimit).toBe(60);
  });

  it('timeLimit uses room.questionTimeSecs when set to minimum (10)', () => {
    room.questionTimeSecs = 10;
    startGame(room, onTimerTick, onTimerEnd);
    const qs = getQuestionStart();
    expect(qs.timeLimit).toBe(10);
  });

  it('timeLimit uses room.questionTimeSecs when set to maximum (120)', () => {
    room.questionTimeSecs = 120;
    startGame(room, onTimerTick, onTimerEnd);
    const qs = getQuestionStart();
    expect(qs.timeLimit).toBe(120);
  });
});

// ─── nextQuestion() — countdown timer behaviour ───────────────────────────────

describe('nextQuestion — countdown uses configured duration', () => {
  let room, hostId, hostWs;
  let onTimerTick, onTimerEnd;

  beforeEach(() => {
    jest.useFakeTimers();
    onTimerTick = jest.fn();
    onTimerEnd = jest.fn();
    hostWs = mockWs();
    ({ room, playerId: hostId } = createRoom(hostWs, 'Host'));
  });

  afterEach(() => {
    if (room && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    if (room) deleteRoom(room.code);
    jest.useRealTimers();
  });

  it('calls onTimerEnd after exactly questionTimeSecs ticks (10s)', () => {
    room.questionTimeSecs = 10;
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(10000);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  it('does not call onTimerEnd before the configured duration elapses (60s timer, 30s passed)', () => {
    room.questionTimeSecs = 60;
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(30000);
    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
  });

  it('calls onTimerEnd after 30s with default duration when questionTimeSecs is not set', () => {
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(30000);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimerEnd early with default duration when only 10s have passed', () => {
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(10000);
    expect(onTimerEnd).not.toHaveBeenCalled();
  });

  it('onTimerTick is called with decrementing remaining values from configured duration', () => {
    room.questionTimeSecs = 10;
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(3000);
    expect(onTimerTick).toHaveBeenCalledTimes(3);
    expect(onTimerTick).toHaveBeenNthCalledWith(1, room, 9);
    expect(onTimerTick).toHaveBeenNthCalledWith(2, room, 8);
    expect(onTimerTick).toHaveBeenNthCalledWith(3, room, 7);
  });
});

// ─── submitAnswer() — points calculation uses configured duration ─────────────

describe('submitAnswer — points use configured questionTimeSecs', () => {
  let room, hostId, hostWs;
  let onTimerTick, onTimerEnd;

  beforeEach(() => {
    jest.useFakeTimers();
    onTimerTick = jest.fn();
    onTimerEnd = jest.fn();
    hostWs = mockWs();
    ({ room, playerId: hostId } = createRoom(hostWs, 'Host'));
  });

  afterEach(() => {
    if (room && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    if (room) deleteRoom(room.code);
    jest.useRealTimers();
  });

  it('yields ~750 points with 60s timer when 15s have elapsed (not ~500 as with 30s timer)', () => {
    room.questionTimeSecs = 60;
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(15000);
    const correctAnswer = room.questions[0].answer;
    const result = submitAnswer(room, hostId, correctAnswer, onTimerTick, onTimerEnd);
    expect(result.correct).toBe(true);
    // 60s timer, 15s elapsed → remaining = 45s → points = round(1000 * 45 / 60) = 750
    expect(result.points).toBe(750);
  });

  it('yields ~500 points with default 30s timer when 15s have elapsed', () => {
    startGame(room, onTimerTick, onTimerEnd);
    jest.advanceTimersByTime(15000);
    const correctAnswer = room.questions[0].answer;
    const result = submitAnswer(room, hostId, correctAnswer, onTimerTick, onTimerEnd);
    expect(result.correct).toBe(true);
    // 30s timer, 15s elapsed → remaining = 15s → points = round(1000 * 15 / 30) = 500
    expect(result.points).toBe(500);
  });

  it('yields 1000 points when answering immediately with a custom duration', () => {
    room.questionTimeSecs = 120;
    startGame(room, onTimerTick, onTimerEnd);
    // No time elapsed — answer immediately
    const correctAnswer = room.questions[0].answer;
    const result = submitAnswer(room, hostId, correctAnswer, onTimerTick, onTimerEnd);
    expect(result.correct).toBe(true);
    // 120s timer, 0s elapsed → remaining = 120s → points = round(1000 * 120 / 120) = 1000
    expect(result.points).toBe(1000);
  });

  it('yields 0 points for an incorrect answer regardless of timer configuration', () => {
    room.questionTimeSecs = 60;
    startGame(room, onTimerTick, onTimerEnd);
    const correctAnswer = room.questions[0].answer;
    const wrongAnswer = (correctAnswer + 1) % 4;
    const result = submitAnswer(room, hostId, wrongAnswer, onTimerTick, onTimerEnd);
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });
});
