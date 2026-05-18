'use strict';

// Mock questions so startGame always has predictable data
jest.mock('../../src/questions', () => ({
  getShuffledQuestions: (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      question: `Q${i + 1}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 0
    }))
}));

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function mockWs() {
  return {
    readyState: 1,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

function noopTick() {}

// Build a room with exactly `count` players and return room + playerIds array
function buildRoom(count) {
  const { createRoom, joinRoom } = require('../../src/rooms');
  const { room, playerId: hostId } = createRoom(mockWs(), 'Host');
  const playerIds = [hostId];
  for (let i = 2; i <= count; i++) {
    const { playerId } = joinRoom(room.code, mockWs(), `Player${i}`);
    playerIds.push(playerId);
  }
  return { room, playerIds };
}

describe('Early-advance boundary check — 2-player room', () => {
  it('submitting 1 answer does NOT advance (timer still running)', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    const onTimerEnd = jest.fn();
    const { room, playerIds } = buildRoom(2);

    startGame(room, noopTick, onTimerEnd);
    submitAnswer(room, playerIds[0], 0, noopTick, onTimerEnd);

    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
  });

  it('submitting the 2nd answer DOES trigger early advance immediately', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    const onTimerEnd = jest.fn();
    const { room, playerIds } = buildRoom(2);

    startGame(room, noopTick, onTimerEnd);
    submitAnswer(room, playerIds[0], 0, noopTick, onTimerEnd);
    submitAnswer(room, playerIds[1], 0, noopTick, onTimerEnd);

    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  it('answeredThisRound.size equals players.size at the moment of early advance', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    let capturedRoom = null;
    const onTimerEnd = jest.fn((r) => { capturedRoom = r; });
    const { room, playerIds } = buildRoom(2);

    startGame(room, noopTick, onTimerEnd);
    for (const pid of playerIds) {
      submitAnswer(room, pid, 0, noopTick, onTimerEnd);
    }

    expect(capturedRoom).not.toBeNull();
    expect(capturedRoom.answeredThisRound.size).toBe(capturedRoom.players.size);
  });
});

describe('Early-advance boundary check — 5-player room', () => {
  it('first 4 answers do NOT advance (timer still running)', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    const onTimerEnd = jest.fn();
    const { room, playerIds } = buildRoom(5);

    startGame(room, noopTick, onTimerEnd);
    for (let i = 0; i < 4; i++) {
      submitAnswer(room, playerIds[i], 0, noopTick, onTimerEnd);
    }

    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
  });

  it('5th answer triggers early advance immediately', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    const onTimerEnd = jest.fn();
    const { room, playerIds } = buildRoom(5);

    startGame(room, noopTick, onTimerEnd);
    for (const pid of playerIds) {
      submitAnswer(room, pid, 0, noopTick, onTimerEnd);
    }

    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  it('answeredThisRound.size equals players.size at the moment of early advance', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    let capturedRoom = null;
    const onTimerEnd = jest.fn((r) => { capturedRoom = r; });
    const { room, playerIds } = buildRoom(5);

    startGame(room, noopTick, onTimerEnd);
    for (const pid of playerIds) {
      submitAnswer(room, pid, 0, noopTick, onTimerEnd);
    }

    expect(capturedRoom).not.toBeNull();
    expect(capturedRoom.answeredThisRound.size).toBe(capturedRoom.players.size);
  });
});

describe('onTimerEnd call count invariant', () => {
  it('onTimerEnd is called exactly once in a 2-player room', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    const onTimerEnd = jest.fn();
    const { room, playerIds } = buildRoom(2);

    startGame(room, noopTick, onTimerEnd);
    for (const pid of playerIds) {
      submitAnswer(room, pid, 0, noopTick, onTimerEnd);
    }

    expect(onTimerEnd).toHaveBeenCalledTimes(1);
  });

  it('onTimerEnd is called exactly once in a 5-player room', () => {
    const { startGame, submitAnswer } = require('../../src/rooms');
    const onTimerEnd = jest.fn();
    const { room, playerIds } = buildRoom(5);

    startGame(room, noopTick, onTimerEnd);
    for (const pid of playerIds) {
      submitAnswer(room, pid, 0, noopTick, onTimerEnd);
    }

    expect(onTimerEnd).toHaveBeenCalledTimes(1);
  });
});
