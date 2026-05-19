'use strict';

// Tests for questionTimeSecs feature (issues #346, #348, #349)

beforeEach(() => {
  jest.resetModules();
});

function getRooms() {
  jest.mock('../../src/questions', () => ({
    getShuffledQuestions: (n) =>
      Array.from({ length: n }, (_, i) => ({
        question: `Q${i}`,
        options: ['A', 'B', 'C', 'D'],
        answer: 0,
        category: 'General'
      }))
  }));
  jest.mock('../../src/scoreHistory', () => ({
    recordScore: jest.fn()
  }));
  return require('../../src/rooms');
}

function mockWs(readyState = 1) {
  return {
    readyState,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

// ─── 1. Default value ────────────────────────────────────────────────────────

describe('Default value', () => {
  it('createRoom sets questionTimeSecs to 30', () => {
    const { createRoom } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    expect(room.questionTimeSecs).toBe(30);
  });

  it('createRoomHttp sets questionTimeSecs to 30', () => {
    const { createRoomHttp } = getRooms();
    const { room } = createRoomHttp('Host');
    expect(room.questionTimeSecs).toBe(30);
  });
});

// ─── 2. Valid boundary values ─────────────────────────────────────────────────

describe('Valid boundaries', () => {
  it('setQuestionTimeSecs(room, 10) succeeds and mutates room', () => {
    const { createRoom, setQuestionTimeSecs } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const result = setQuestionTimeSecs(room, 10);
    expect(result).not.toHaveProperty('error');
    expect(room.questionTimeSecs).toBe(10);
  });

  it('setQuestionTimeSecs(room, 120) succeeds and mutates room', () => {
    const { createRoom, setQuestionTimeSecs } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const result = setQuestionTimeSecs(room, 120);
    expect(result).not.toHaveProperty('error');
    expect(room.questionTimeSecs).toBe(120);
  });
});

// ─── 3. Invalid values ────────────────────────────────────────────────────────

describe('Invalid values', () => {
  const invalidCases = [
    ['9 (below min)', 9],
    ['121 (above max)', 121],
    ['30.5 (non-integer float)', 30.5],
    ['"30" (string)', '30'],
    ['null', null]
  ];

  test.each(invalidCases)('%s is rejected with an error', (_label, value) => {
    const { createRoom, setQuestionTimeSecs } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const before = room.questionTimeSecs;
    const result = setQuestionTimeSecs(room, value);
    expect(result).toHaveProperty('error');
    expect(room.questionTimeSecs).toBe(before); // no mutation
  });
});

// ─── 4. nextQuestion broadcasts timeLimit equal to room.questionTimeSecs ──────

describe('nextQuestion broadcast', () => {
  it('question_start message uses room.questionTimeSecs when set to 60', () => {
    const { createRoom, setQuestionTimeSecs, startGame } = getRooms();
    const hostWs = mockWs();
    const { room } = createRoom(hostWs, 'Host');
    setQuestionTimeSecs(room, 60);

    jest.useFakeTimers();
    startGame(room, jest.fn(), jest.fn());
    jest.useRealTimers();

    const qStart = hostWs.messages.find(m => m.type === 'question_start');
    expect(qStart).toBeDefined();
    expect(qStart.timeLimit).toBe(60);
  });
});

// ─── 5. Countdown uses room.questionTimeSecs ──────────────────────────────────

describe('Countdown uses room value', () => {
  it('onTimerTick receives starting value of room.questionTimeSecs - 1 after 1 tick', () => {
    const { createRoom, setQuestionTimeSecs, startGame } = getRooms();
    const hostWs = mockWs();
    const { room } = createRoom(hostWs, 'Host');
    setQuestionTimeSecs(room, 60);

    jest.useFakeTimers();

    const tickValues = [];
    const onTimerTick = jest.fn((_room, remaining) => tickValues.push(remaining));
    const onTimerEnd = jest.fn();

    startGame(room, onTimerTick, onTimerEnd);

    // Advance by exactly 1 second → first tick fires
    jest.advanceTimersByTime(1000);

    expect(tickValues[0]).toBe(59); // 60 - 1

    jest.useRealTimers();
  });
});
