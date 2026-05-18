'use strict';

// Tests for the early-advance feature (issue #296 / #298 / #301).
// Covers both the positive case (all players answered → advance fires)
// and the negative case (partial answers → advance must NOT fire).

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
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

// ---------------------------------------------------------------------------
// Positive case: last-player answer triggers immediate advance (issue #298)
// ---------------------------------------------------------------------------

describe('Early advance — all players answered (issue #298)', () => {
  it('2 players: second answer triggers onTimerEnd and clears room.timer', () => {
    const { createRoom, joinRoom, startGame, submitAnswer, QUESTION_TIME_SECS } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    const p2Ws = mockWs();
    const { playerId: p2Id } = joinRoom(room.code, p2Ws, 'Player2');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    // First answer — only 1 of 2 players, no early advance yet
    submitAnswer(room, hostId, 0, onTimerTickSpy, onTimerEndSpy);
    expect(onTimerEndSpy).not.toHaveBeenCalled();

    // Second answer — all 2 players answered, should trigger early advance
    submitAnswer(room, p2Id, 0, onTimerTickSpy, onTimerEndSpy);
    expect(onTimerEndSpy).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  it('3 players: third answer triggers onTimerEnd; first and second do not', () => {
    const { createRoom, joinRoom, startGame, submitAnswer } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    const { playerId: p2Id } = joinRoom(room.code, mockWs(), 'Player2');
    const { playerId: p3Id } = joinRoom(room.code, mockWs(), 'Player3');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    submitAnswer(room, hostId, 0, onTimerTickSpy, onTimerEndSpy);
    expect(onTimerEndSpy).not.toHaveBeenCalled();

    submitAnswer(room, p2Id, 0, onTimerTickSpy, onTimerEndSpy);
    expect(onTimerEndSpy).not.toHaveBeenCalled();

    submitAnswer(room, p3Id, 0, onTimerTickSpy, onTimerEndSpy);
    expect(onTimerEndSpy).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Negative case: partial answers must NOT trigger early advance (issue #301)
// ---------------------------------------------------------------------------

describe('Early advance — partial answers must not trigger advance (issue #301)', () => {
  it('3 players: submitting 1 answer does not trigger early advance', () => {
    const { createRoom, joinRoom, startGame, submitAnswer } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    joinRoom(room.code, mockWs(), 'Player2');
    joinRoom(room.code, mockWs(), 'Player3');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    submitAnswer(room, hostId, 0, onTimerTickSpy, onTimerEndSpy);

    // Advance time by a small delta — timer should NOT fire
    jest.advanceTimersByTime(500);

    expect(onTimerEndSpy).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
    expect(room.answeredThisRound.size).toBe(1);
  });

  it('3 players: submitting 2 answers does not trigger early advance', () => {
    const { createRoom, joinRoom, startGame, submitAnswer } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    const { playerId: p2Id } = joinRoom(room.code, mockWs(), 'Player2');
    joinRoom(room.code, mockWs(), 'Player3');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    submitAnswer(room, hostId, 0, onTimerTickSpy, onTimerEndSpy);
    submitAnswer(room, p2Id, 0, onTimerTickSpy, onTimerEndSpy);

    // Advance time by a small delta — timer should NOT fire
    jest.advanceTimersByTime(500);

    expect(onTimerEndSpy).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
    expect(room.answeredThisRound.size).toBe(2);
  });

  it('onTimerEnd spy is NOT called after a non-final answer', () => {
    const { createRoom, joinRoom, startGame, submitAnswer } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    joinRoom(room.code, mockWs(), 'Player2');
    joinRoom(room.code, mockWs(), 'Player3');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    // Submit only the first answer
    submitAnswer(room, hostId, 1, onTimerTickSpy, onTimerEndSpy);

    jest.advanceTimersByTime(1000);

    expect(onTimerEndSpy).not.toHaveBeenCalled();
  });

  it('room.timer remains non-null after partial answers', () => {
    const { createRoom, joinRoom, startGame, submitAnswer } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    const { playerId: p2Id } = joinRoom(room.code, mockWs(), 'Player2');
    joinRoom(room.code, mockWs(), 'Player3');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    submitAnswer(room, hostId, 0, onTimerTickSpy, onTimerEndSpy);
    expect(room.timer).not.toBeNull();

    submitAnswer(room, p2Id, 0, onTimerTickSpy, onTimerEndSpy);
    expect(room.timer).not.toBeNull();
  });

  it('room.answeredThisRound size matches number of submitted answers', () => {
    const { createRoom, joinRoom, startGame, submitAnswer } = getRooms();

    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    const { playerId: p2Id } = joinRoom(room.code, mockWs(), 'Player2');
    joinRoom(room.code, mockWs(), 'Player3');

    const onTimerTickSpy = jest.fn();
    const onTimerEndSpy = jest.fn();

    startGame(room, onTimerTickSpy, onTimerEndSpy);

    expect(room.answeredThisRound.size).toBe(0);

    submitAnswer(room, hostId, 0, onTimerTickSpy, onTimerEndSpy);
    expect(room.answeredThisRound.size).toBe(1);

    submitAnswer(room, p2Id, 0, onTimerTickSpy, onTimerEndSpy);
    expect(room.answeredThisRound.size).toBe(2);
  });
});
