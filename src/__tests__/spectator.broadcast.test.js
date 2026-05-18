'use strict';

/**
 * Tests for issue #270: spectators receive real-time broadcast events alongside players.
 * Verifies that broadcast() delivers timer_tick, question_end, score-update, and
 * question_start payloads to spectators, and that spectator-side payloads contain no
 * answer-submission or actionable fields.
 */

beforeEach(() => {
  jest.resetModules();
});

function buildRooms() {
  return require('../../src/rooms');
}

function mockWs(readyState = 1) {
  return { readyState, send: jest.fn() };
}

describe('broadcast — spectator delivery', () => {
  it('delivers messages to spectators as well as players', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const playerWs = mockWs();
    const { room } = createRoom(playerWs, 'Host');

    const spectatorWs = mockWs();
    joinSpectator(room.code, spectatorWs, 'Watcher');

    const msg = { type: 'timer_tick', remaining: 20 };
    broadcast(room, msg);

    expect(playerWs.send).toHaveBeenCalledWith(JSON.stringify(msg));
    expect(spectatorWs.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('does not send to spectators with closed WebSocket (readyState !== 1)', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');

    const closedWs = mockWs(3); // CLOSED
    joinSpectator(room.code, closedWs, 'Watcher');

    broadcast(room, { type: 'timer_tick', remaining: 5 });

    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it('still delivers to players when no spectators are present', () => {
    const { createRoom, broadcast } = buildRooms();
    const playerWs = mockWs();
    const { room } = createRoom(playerWs, 'Host');

    const msg = { type: 'score-update', leaderboard: [] };
    broadcast(room, msg);

    expect(playerWs.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('timer_tick payload contains no answer-submission fields', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs();
    joinSpectator(room.code, spectatorWs, 'Watcher');

    const msg = { type: 'timer_tick', remaining: 15 };
    broadcast(room, msg);

    const sent = JSON.parse(spectatorWs.send.mock.calls[0][0]);
    expect(sent).not.toHaveProperty('answer');
    expect(sent).not.toHaveProperty('submitUrl');
  });

  it('question_start payload contains no answer-submission fields', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs();
    joinSpectator(room.code, spectatorWs, 'Watcher');

    const msg = {
      type: 'question_start',
      index: 0,
      total: 10,
      question: 'What is 2+2?',
      options: ['1', '2', '4', '8'],
      category: 'Math',
      timeLimit: 30
    };
    broadcast(room, msg);

    const sent = JSON.parse(spectatorWs.send.mock.calls[0][0]);
    expect(sent).not.toHaveProperty('answer');
    expect(sent).not.toHaveProperty('correctAnswer');
    expect(sent).toMatchObject({
      type: 'question_start',
      question: 'What is 2+2?',
      options: ['1', '2', '4', '8']
    });
  });

  it('score-update payload is delivered to spectators', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs();
    joinSpectator(room.code, spectatorWs, 'Watcher');

    const leaderboard = [{ id: '1', name: 'Alice', score: 500 }];
    const msg = { type: 'score-update', leaderboard };
    broadcast(room, msg);

    const sent = JSON.parse(spectatorWs.send.mock.calls[0][0]);
    expect(sent.type).toBe('score-update');
    expect(sent.leaderboard).toEqual(leaderboard);
  });

  it('question_end payload is delivered to spectators', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs();
    joinSpectator(room.code, spectatorWs, 'Watcher');

    const msg = { type: 'question_end', correctAnswer: 2, leaderboard: [] };
    broadcast(room, msg);

    const sent = JSON.parse(spectatorWs.send.mock.calls[0][0]);
    expect(sent.type).toBe('question_end');
    expect(sent.correctAnswer).toBe(2);
  });

  it('multiple spectators all receive the broadcast', () => {
    const { createRoom, broadcast, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');

    const ws1 = mockWs();
    const ws2 = mockWs();
    joinSpectator(room.code, ws1, 'Watcher1');
    joinSpectator(room.code, ws2, 'Watcher2');

    broadcast(room, { type: 'timer_tick', remaining: 10 });

    expect(ws1.send).toHaveBeenCalledTimes(1);
    expect(ws2.send).toHaveBeenCalledTimes(1);
  });
});

describe('joinSpectator', () => {
  it('returns error for unknown room code', () => {
    const { joinSpectator } = buildRooms();
    const result = joinSpectator('ZZZZZZ', mockWs(), 'Watcher');
    expect(result.error).toBe('Room not found');
  });

  it('assigns a unique spectatorId per spectator', () => {
    const { createRoom, joinSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');

    const r1 = joinSpectator(room.code, mockWs(), 'W1');
    const r2 = joinSpectator(room.code, mockWs(), 'W2');

    expect(r1.spectatorId).toBeTruthy();
    expect(r2.spectatorId).toBeTruthy();
    expect(r1.spectatorId).not.toBe(r2.spectatorId);
  });
});
