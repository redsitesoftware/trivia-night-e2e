'use strict';

const { createRoom, joinRoom, startGame, submitAnswer, deleteRoom } = require('../src/rooms');

describe('submitAnswer early-advance logic', () => {
  let room, hostId;
  let onTimerTick, onTimerEnd;

  beforeEach(() => {
    jest.useFakeTimers();
    onTimerTick = jest.fn();
    onTimerEnd = jest.fn();
    ({ room, playerId: hostId } = createRoom(null, 'Host'));
  });

  afterEach(() => {
    if (room && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    if (room) deleteRoom(room.code);
    jest.useRealTimers();
  });

  test('2 players: second answer triggers onTimerEnd and room.timer becomes null', () => {
    const { playerId: p2 } = joinRoom(room.code, null, 'Player2');
    startGame(room, onTimerTick, onTimerEnd);

    submitAnswer(room, hostId, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();

    submitAnswer(room, p2, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  test('3 players: early-advance does not fire after 1st or 2nd answer; fires after 3rd', () => {
    const { playerId: p2 } = joinRoom(room.code, null, 'Player2');
    const { playerId: p3 } = joinRoom(room.code, null, 'Player3');
    startGame(room, onTimerTick, onTimerEnd);

    submitAnswer(room, hostId, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();

    submitAnswer(room, p2, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();

    submitAnswer(room, p3, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  test('2 players: onTimerEnd is not double-called when timer expires naturally before second answer', () => {
    const { playerId: p2 } = joinRoom(room.code, null, 'Player2');
    startGame(room, onTimerTick, onTimerEnd);

    // Only first player answers
    submitAnswer(room, hostId, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();

    // Timer expires naturally — interval fires 30 times, clears itself, calls onTimerEnd once
    jest.advanceTimersByTime(30000);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();

    // Second player answers after timer has already expired
    submitAnswer(room, p2, 0, onTimerTick, onTimerEnd);

    // onTimerEnd must NOT be called a second time (room.timer is already null)
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
  });

  test('omitting callbacks: submitAnswer returns normally without throwing', () => {
    const { playerId: p2 } = joinRoom(room.code, null, 'Player2');
    startGame(room, onTimerTick, onTimerEnd);

    expect(() => submitAnswer(room, hostId, 0)).not.toThrow();
    expect(() => submitAnswer(room, p2, 0)).not.toThrow();
  });
});
