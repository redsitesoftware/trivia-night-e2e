'use strict';

beforeEach(() => {
  jest.resetModules();
});

function buildRooms() {
  return require('../../src/rooms');
}

function makeMockWs(readyState = 1) {
  return { readyState, send: jest.fn() };
}

describe('joinSpectator', () => {
  it('returns error when room code is invalid', () => {
    const { joinSpectator } = buildRooms();
    const result = joinSpectator('NOPE', makeMockWs(), 'Alice');
    expect(result).toEqual({ error: 'Room not found' });
  });

  it('returns error when spectatorsAllowed is false', () => {
    const { createRoom, joinSpectator } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    room.spectatorsAllowed = false;
    const result = joinSpectator(room.code, makeMockWs(), 'Alice');
    expect(result).toEqual({ error: 'Spectator mode is not enabled for this game' });
  });

  it('adds spectator to room.spectators and returns spectatorId', () => {
    const { createRoom, joinSpectator } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    const ws = makeMockWs();
    const result = joinSpectator(room.code, ws, 'Alice');

    expect(result.spectatorId).toBeDefined();
    expect(result.room).toBe(room);
    expect(room.spectators.size).toBe(1);

    const spectator = room.spectators.get(result.spectatorId);
    expect(spectator).toMatchObject({ id: result.spectatorId, displayName: 'Alice', ws });
  });

  it('is case-insensitive for room code lookup', () => {
    const { createRoom, joinSpectator } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    const result = joinSpectator(room.code.toLowerCase(), makeMockWs(), 'Bob');
    expect(result.spectatorId).toBeDefined();
  });

  it('spectators do not count toward MAX_PLAYERS cap', () => {
    const { createRoom, joinSpectator, joinRoom } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');

    // Fill up to MAX_PLAYERS (8 including host already counts 1)
    for (let i = 1; i < 8; i++) {
      joinRoom(room.code, makeMockWs(), `Player${i}`);
    }

    // Room is now full for players — spectator should still be allowed
    const result = joinSpectator(room.code, makeMockWs(), 'Spectator1');
    expect(result.spectatorId).toBeDefined();
  });
});

describe('getRoomBySpectator', () => {
  it('returns the room containing the given spectatorId', () => {
    const { createRoom, joinSpectator, getRoomBySpectator } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    const { spectatorId } = joinSpectator(room.code, makeMockWs(), 'Alice');
    expect(getRoomBySpectator(spectatorId)).toBe(room);
  });

  it('returns null for unknown spectatorId', () => {
    const { getRoomBySpectator } = buildRooms();
    expect(getRoomBySpectator('nonexistent-id')).toBeNull();
  });
});

describe('broadcast includes spectators', () => {
  it('sends messages to both players and spectators', () => {
    const { createRoom, joinSpectator, broadcast } = buildRooms();
    const hostWs = makeMockWs();
    const { room } = createRoom(hostWs, 'Host');
    const spectatorWs = makeMockWs();
    joinSpectator(room.code, spectatorWs, 'Watcher');

    const msg = { type: 'test', data: 'hello' };
    broadcast(room, msg);

    expect(hostWs.send).toHaveBeenCalledWith(JSON.stringify(msg));
    expect(spectatorWs.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('skips spectators with closed WebSocket', () => {
    const { createRoom, joinSpectator, broadcast } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    const closedWs = makeMockWs(3); // readyState 3 = CLOSED
    joinSpectator(room.code, closedWs, 'Ghost');

    broadcast(room, { type: 'test' });
    expect(closedWs.send).not.toHaveBeenCalled();
  });

  it('skips spectators with null ws', () => {
    const { createRoom, joinSpectator, broadcast } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    const { spectatorId } = joinSpectator(room.code, makeMockWs(), 'Ghost');
    room.spectators.get(spectatorId).ws = null;

    // Should not throw
    expect(() => broadcast(room, { type: 'test' })).not.toThrow();
  });
});

describe('getLeaderboard excludes spectators', () => {
  it('does not include spectators in leaderboard results', () => {
    const { createRoom, joinSpectator, getLeaderboard } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    joinSpectator(room.code, makeMockWs(), 'Watcher');

    const leaderboard = getLeaderboard(room);
    const names = leaderboard.map(e => e.name);
    expect(names).not.toContain('Watcher');
    expect(leaderboard).toHaveLength(1); // only the host
  });
});

describe('createRoom spectator defaults', () => {
  it('initializes spectators as empty Map', () => {
    const { createRoom } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    expect(room.spectators).toBeInstanceOf(Map);
    expect(room.spectators.size).toBe(0);
  });

  it('initializes spectatorsAllowed as true', () => {
    const { createRoom } = buildRooms();
    const { room } = createRoom(makeMockWs(), 'Host');
    expect(room.spectatorsAllowed).toBe(true);
  });
});
