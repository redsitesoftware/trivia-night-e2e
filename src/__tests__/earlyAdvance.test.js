'use strict';

// Tests for early-advance logic in submitAnswer() — issue #306

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function getRooms() {
  return require('../../src/rooms');
}

function mockWs(readyState = 1) {
  return {
    readyState,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

function startedRoom(playerCount = 2) {
  const { createRoom, joinRoom, startGame, QUESTION_TIME_SECS } = getRooms();
  const hostWs = mockWs();
  const { room, playerId: hostId } = createRoom(hostWs, 'Host');

  const playerIds = [hostId];
  for (let i = 1; i < playerCount; i++) {
    const { playerId } = joinRoom(room.code, mockWs(), `Player${i}`);
    playerIds.push(playerId);
  }

  const onTimerTick = jest.fn();
  const onTimerEnd = jest.fn();
  startGame(room, onTimerTick, onTimerEnd);

  return { room, playerIds, onTimerTick, onTimerEnd, QUESTION_TIME_SECS };
}

describe('submitAnswer — early-advance (issue #306)', () => {
  it('does not call onTimerEnd when not all players have answered', () => {
    const { room, playerIds, onTimerTick, onTimerEnd } = startedRoom(3);

    require('../../src/rooms').submitAnswer(room, playerIds[0], 0, onTimerTick, onTimerEnd);

    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
  });

  it('calls onTimerEnd and clears timer when all players answer', () => {
    const { room, playerIds, onTimerTick, onTimerEnd } = startedRoom(2);
    const { submitAnswer } = getRooms();

    submitAnswer(room, playerIds[0], 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();

    submitAnswer(room, playerIds[1], 0, onTimerTick, onTimerEnd);

    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(onTimerEnd).toHaveBeenCalledWith(room, onTimerTick, onTimerEnd);
    expect(room.timer).toBeNull();
  });

  it('does not call onTimerEnd when callbacks are not provided (no regression)', () => {
    const { room, playerIds } = startedRoom(2);
    const { submitAnswer } = getRooms();

    submitAnswer(room, playerIds[0], 0);
    submitAnswer(room, playerIds[1], 0);

    // No error thrown, timer still managed by interval
    expect(room.timer).not.toBeNull();
  });

  it('does not double-fire onTimerEnd if timer already expired (timer is null)', () => {
    const { room, playerIds, onTimerTick, onTimerEnd } = startedRoom(2);
    const { submitAnswer } = getRooms();

    // Simulate timer already having fired
    clearInterval(room.timer);
    room.timer = null;

    submitAnswer(room, playerIds[0], 0, onTimerTick, onTimerEnd);
    submitAnswer(room, playerIds[1], 0, onTimerTick, onTimerEnd);

    expect(onTimerEnd).not.toHaveBeenCalled();
  });

  it('works correctly with 8 players (MAX_PLAYERS)', () => {
    const { room, playerIds, onTimerTick, onTimerEnd } = startedRoom(8);
    const { submitAnswer } = getRooms();

    for (let i = 0; i < 7; i++) {
      submitAnswer(room, playerIds[i], 0, onTimerTick, onTimerEnd);
      expect(onTimerEnd).not.toHaveBeenCalled();
    }

    submitAnswer(room, playerIds[7], 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  it('returns correct result when early-advancing', () => {
    const { room, playerIds, onTimerTick, onTimerEnd } = startedRoom(2);
    const { submitAnswer } = getRooms();

    submitAnswer(room, playerIds[0], 0, onTimerTick, onTimerEnd);
    const result = submitAnswer(room, playerIds[1], 0, onTimerTick, onTimerEnd);

    expect(result).toHaveProperty('correct');
    expect(result).toHaveProperty('points');
    expect(result).toHaveProperty('correctAnswer');
    expect(result).not.toHaveProperty('error');
  });

  it('still returns "Already answered" error on duplicate submit', () => {
    const { room, playerIds, onTimerTick, onTimerEnd } = startedRoom(2);
    const { submitAnswer } = getRooms();

    submitAnswer(room, playerIds[0], 0, onTimerTick, onTimerEnd);
    const result = submitAnswer(room, playerIds[0], 0, onTimerTick, onTimerEnd);

    expect(result).toEqual({ error: 'Already answered' });
  });
});
