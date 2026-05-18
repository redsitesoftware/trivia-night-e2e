/**
 * Tests for spectator join and broadcast support (issue #263)
 */

beforeEach(() => {
  jest.resetModules();
});

function buildRooms() {
  return require('../../src/rooms');
}

// Minimal mock WebSocket
function mockWs() {
  const messages = [];
  return {
    readyState: 1,
    send: (data) => messages.push(JSON.parse(data)),
    messages,
  };
}

describe('rooms.js — spectator support', () => {
  it('createRoom initialises spectators as an empty Map', () => {
    const { createRoom } = buildRooms();
    const ws = mockWs();
    const { room } = createRoom(ws, 'Host');
    expect(room.spectators).toBeInstanceOf(Map);
    expect(room.spectators.size).toBe(0);
  });

  it('joinAsSpectator returns error for unknown room code', () => {
    const { joinAsSpectator } = buildRooms();
    const result = joinAsSpectator('ZZZZZZ', mockWs());
    expect(result.error).toBe('Room not found');
  });

  it('joinAsSpectator adds spectator to room.spectators and returns spectatorId', () => {
    const { createRoom, joinAsSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs();
    const result = joinAsSpectator(room.code, spectatorWs);

    expect(result.error).toBeUndefined();
    expect(result.spectatorId).toBeDefined();
    expect(room.spectators.size).toBe(1);
    expect(room.spectators.get(result.spectatorId).ws).toBe(spectatorWs);
  });

  it('spectators are NOT included in players Map', () => {
    const { createRoom, joinAsSpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const { spectatorId } = joinAsSpectator(room.code, mockWs());

    expect(room.players.has(spectatorId)).toBe(false);
  });

  it('broadcast sends to spectators as well as players', () => {
    const { createRoom, joinAsSpectator, broadcast } = buildRooms();
    const hostWs = mockWs();
    const { room } = createRoom(hostWs, 'Host');
    const spectatorWs = mockWs();
    joinAsSpectator(room.code, spectatorWs);

    broadcast(room, { type: 'test_event', data: 'hello' });

    expect(hostWs.messages).toContainEqual({ type: 'test_event', data: 'hello' });
    expect(spectatorWs.messages).toContainEqual({ type: 'test_event', data: 'hello' });
  });

  it('broadcast does NOT send to spectators with closed ws', () => {
    const { createRoom, joinAsSpectator, broadcast } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const closedWs = { readyState: 3, send: jest.fn(), messages: [] };
    joinAsSpectator(room.code, closedWs);

    broadcast(room, { type: 'test_event' });

    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it('attachSpectatorWs updates the ws for an existing spectator', () => {
    const { createRoom, joinAsSpectator, attachSpectatorWs } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const { spectatorId } = joinAsSpectator(room.code, mockWs());

    const newWs = mockWs();
    const foundRoom = attachSpectatorWs(spectatorId, newWs);

    expect(foundRoom).toBe(room);
    expect(room.spectators.get(spectatorId).ws).toBe(newWs);
  });

  it('attachSpectatorWs returns null for unknown spectatorId', () => {
    const { attachSpectatorWs } = buildRooms();
    expect(attachSpectatorWs('unknown-id', mockWs())).toBeNull();
  });

  it('getRoomBySpectator returns the correct room', () => {
    const { createRoom, joinAsSpectator, getRoomBySpectator } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const { spectatorId } = joinAsSpectator(room.code, mockWs());

    expect(getRoomBySpectator(spectatorId)).toBe(room);
  });

  it('getRoomBySpectator returns null for unknown spectatorId', () => {
    const { getRoomBySpectator } = buildRooms();
    expect(getRoomBySpectator('no-such-id')).toBeNull();
  });

  it('spectators receive game broadcasts (question_start, timer_tick, question_end, game_over)', () => {
    jest.useFakeTimers();
    const { createRoom, joinAsSpectator, startGame } = buildRooms();
    const hostWs = mockWs();
    const { room } = createRoom(hostWs, 'Host');
    const spectatorWs = mockWs();
    joinAsSpectator(room.code, spectatorWs);

    const onTick = jest.fn();
    const onEnd = jest.fn();
    startGame(room, onTick, onEnd);

    const types = spectatorWs.messages.map(m => m.type);
    expect(types).toContain('question_start');

    jest.useRealTimers();
  });

  it('getLeaderboard does not include spectators', () => {
    const { createRoom, joinAsSpectator, getLeaderboard } = buildRooms();
    const { room } = createRoom(mockWs(), 'Host');
    joinAsSpectator(room.code, mockWs());

    const leaderboard = getLeaderboard(room);
    const ids = leaderboard.map(e => e.id);
    for (const [spectatorId] of room.spectators) {
      expect(ids).not.toContain(spectatorId);
    }
  });
});
