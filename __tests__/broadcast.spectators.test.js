'use strict';

const { createRoom, joinRoom, joinAsSpectator, broadcast, startGame, deleteRoom } = require('../src/rooms');

function makeMockWs(readyState = 1) {
  return { readyState, send: jest.fn() };
}

describe('broadcast() includes spectators', () => {
  let room;

  beforeEach(() => {
    ({ room } = createRoom(null, 'Host'));
  });

  afterEach(() => {
    if (room) deleteRoom(room.code);
  });

  test('spectator with readyState=1 receives broadcast message', () => {
    const ws = makeMockWs(1);
    joinAsSpectator(room, ws);

    broadcast(room, { type: 'test_event' });

    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test_event' }));
  });

  test('spectator with readyState !== 1 does not receive broadcast', () => {
    const ws = makeMockWs(3); // CLOSED
    joinAsSpectator(room, ws);

    broadcast(room, { type: 'test_event' });

    expect(ws.send).not.toHaveBeenCalled();
  });

  test('multiple spectators all receive broadcast', () => {
    const ws1 = makeMockWs(1);
    const ws2 = makeMockWs(1);
    joinAsSpectator(room, ws1);
    joinAsSpectator(room, ws2);

    broadcast(room, { type: 'leaderboard_update', scores: [] });

    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });

  test('players still receive broadcast when spectators are present', () => {
    const playerWs = makeMockWs(1);
    joinRoom(room.code, playerWs, 'Player1');
    const spectatorWs = makeMockWs(1);
    joinAsSpectator(room, spectatorWs);

    broadcast(room, { type: 'question_start' });

    expect(playerWs.send).toHaveBeenCalledTimes(1);
    expect(spectatorWs.send).toHaveBeenCalledTimes(1);
  });
});
