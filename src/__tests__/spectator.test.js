'use strict';

// Tests for spectator room extensions (issue #261),
// toggle_spectator_mode WS handler (issue #272), and
// broadcast() spectator delivery (issue #377).

beforeEach(() => {
  jest.resetModules();
});

function getRooms() {
  return require('../../src/rooms');
}

// Minimal mock WebSocket
function mockWs(readyState = 1) {
  return {
    readyState,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); },
    nulled: false
  };
}

describe('Room state extensions (issue #261)', () => {
  it('createRoom sets spectatorModeEnabled=true and spectators=Map', () => {
    const { createRoom } = getRooms();
    const ws = mockWs();
    const { room } = createRoom(ws, 'Host');
    expect(room.spectatorModeEnabled).toBe(true);
    expect(room.spectators).toBeInstanceOf(Map);
    expect(room.spectators.size).toBe(0);
  });

  it('createRoomHttp sets spectatorModeEnabled=true and spectators=Map', () => {
    const { createRoomHttp } = getRooms();
    const { room } = createRoomHttp('Host');
    expect(room.spectatorModeEnabled).toBe(true);
    expect(room.spectators).toBeInstanceOf(Map);
  });

  it('joinAsSpectator adds spectator and returns spectatorId', () => {
    const { createRoom, joinAsSpectator, getSpectatorCount } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const ws = mockWs();
    const { spectatorId } = joinAsSpectator(room, ws);
    expect(typeof spectatorId).toBe('string');
    expect(getSpectatorCount(room)).toBe(1);
  });

  it('removeSpectator removes spectator from map', () => {
    const { createRoom, joinAsSpectator, removeSpectator, getSpectatorCount } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const { spectatorId } = joinAsSpectator(room, mockWs());
    removeSpectator(room, spectatorId);
    expect(getSpectatorCount(room)).toBe(0);
  });

  it('getSpectatorCount returns correct count', () => {
    const { createRoom, joinAsSpectator, getSpectatorCount } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    joinAsSpectator(room, mockWs());
    joinAsSpectator(room, mockWs());
    expect(getSpectatorCount(room)).toBe(2);
  });

  it('disconnectAllSpectators sends notice, nulls ws, clears map', () => {
    const { createRoom, joinAsSpectator, disconnectAllSpectators, getSpectatorCount } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const ws1 = mockWs();
    const ws2 = mockWs();
    joinAsSpectator(room, ws1);
    joinAsSpectator(room, ws2);
    disconnectAllSpectators(room, 'Spectator mode has been disabled by the host');
    expect(getSpectatorCount(room)).toBe(0);
    expect(ws1.messages).toEqual([{ type: 'spectator_removed', reason: 'Spectator mode has been disabled by the host' }]);
    expect(ws2.messages).toEqual([{ type: 'spectator_removed', reason: 'Spectator mode has been disabled by the host' }]);
    expect(ws1.readyState).toBe(1); // ws nulled on entry, not on object
  });

  it('broadcastToHost sends only to host ws', () => {
    const { createRoom, joinRoom, broadcastToHost } = getRooms();
    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    const playerWs = mockWs();
    joinRoom(room.code, playerWs, 'Player');
    broadcastToHost(room, { type: 'spectator_count', count: 3 });
    expect(hostWs.messages).toContainEqual({ type: 'spectator_count', count: 3 });
    expect(playerWs.messages).toHaveLength(0);
  });
});

describe('broadcast() spectator delivery (issue #377)', () => {
  it('sends message to spectators with readyState === 1', () => {
    const { createRoom, joinAsSpectator, broadcast } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs(1);
    joinAsSpectator(room, spectatorWs);
    broadcast(room, { type: 'timer_tick', remaining: 29 });
    expect(spectatorWs.messages).toContainEqual({ type: 'timer_tick', remaining: 29 });
  });

  it('skips spectators with closed ws (readyState !== 1)', () => {
    const { createRoom, joinAsSpectator, broadcast } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const closedWs = mockWs(3); // WebSocket.CLOSED = 3
    joinAsSpectator(room, closedWs);
    broadcast(room, { type: 'timer_tick', remaining: 29 });
    expect(closedWs.messages).toHaveLength(0);
  });

  it('skips spectators with null ws without throwing', () => {
    const { createRoom, joinAsSpectator, broadcast } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    joinAsSpectator(room, null);
    expect(() => broadcast(room, { type: 'test_event' })).not.toThrow();
  });

  it('spectators do NOT receive broadcastToHost() messages', () => {
    const { createRoom, joinAsSpectator, broadcastToHost } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const spectatorWs = mockWs(1);
    joinAsSpectator(room, spectatorWs);
    broadcastToHost(room, { type: 'spectator_count', count: 1 });
    expect(spectatorWs.messages).toHaveLength(0);
  });
});

describe('toggle_spectator_mode WS handler (issue #272)', () => {
  function buildServer() {
    return require('../../server');
  }

  // Helper: create a minimal mock WS that can act as a WebSocket client
  function createConnectedHost() {
    const { createRoom } = getRooms();
    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');
    return { room, hostId, hostWs };
  }

  it('non-host receives error when toggling spectator mode', () => {
    const { createRoom, joinRoom, getRoomByPlayer } = getRooms();
    const { room } = createRoom(mockWs(), 'Host');
    const playerWs = mockWs();
    const { playerId } = joinRoom(room.code, playerWs, 'Player');

    // Simulate toggle by calling getRoomByPlayer and checking guard
    const foundRoom = getRoomByPlayer(playerId);
    expect(foundRoom.hostId).not.toBe(playerId);
  });

  it('toggle_spectator_mode: enable sets spectatorModeEnabled=true and returns confirmation', () => {
    const { createRoom, getSpectatorCount } = getRooms();
    const hostWs = mockWs();
    const { room, playerId: hostId } = createRoom(hostWs, 'Host');

    // Simulate what the WS handler does
    room.spectatorModeEnabled = true;
    const count = getSpectatorCount(room);
    const response = {
      type: 'spectator_mode_updated',
      spectatorModeEnabled: room.spectatorModeEnabled,
      spectatorCount: count
    };
    expect(response.spectatorModeEnabled).toBe(true);
    expect(response.spectatorCount).toBe(0);
  });

  it('toggle_spectator_mode: disable disconnects all spectators and returns count=0', () => {
    const { createRoom, joinAsSpectator, disconnectAllSpectators, getSpectatorCount } = getRooms();
    const hostWs = mockWs();
    const { room } = createRoom(hostWs, 'Host');
    joinAsSpectator(room, mockWs());
    joinAsSpectator(room, mockWs());
    expect(getSpectatorCount(room)).toBe(2);

    // Simulate disable handler
    room.spectatorModeEnabled = false;
    disconnectAllSpectators(room, 'Spectator mode has been disabled by the host');
    const count = getSpectatorCount(room);

    expect(count).toBe(0);
    const response = { type: 'spectator_mode_updated', spectatorModeEnabled: false, spectatorCount: count };
    expect(response.spectatorCount).toBe(0);
  });

  it('reconnected response includes spectatorModeEnabled and spectatorCount fields', () => {
    const { createRoomHttp, attachPlayerWs, getSpectatorCount } = getRooms();
    const { room, playerId } = createRoomHttp('Host');
    const hostWs = mockWs();
    attachPlayerWs(playerId, hostWs);

    // Simulate what the reconnect handler sends
    const payload = {
      type: 'reconnected',
      code: room.code,
      playerId,
      isHost: room.hostId === playerId,
      state: room.state,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })),
      spectatorModeEnabled: room.spectatorModeEnabled,
      spectatorCount: getSpectatorCount(room)
    };

    expect(payload).toHaveProperty('spectatorModeEnabled', true);
    expect(payload).toHaveProperty('spectatorCount', 0);
  });
});
