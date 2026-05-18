const WebSocket = require('ws');

beforeEach(() => {
  jest.resetModules();
});

function buildServer() {
  const { server } = require('../../server');
  return server;
}

function mockWs() {
  const sent = [];
  return {
    readyState: 1,
    send: (data) => sent.push(JSON.parse(data)),
    _sent: sent
  };
}

describe('spectator room helpers', () => {
  it('joinAsSpectator adds spectator and returns a spectatorId', () => {
    const { createRoom, joinAsSpectator, getSpectatorCount } = require('../../src/rooms');
    const { room } = createRoom(null, 'Host');
    const ws = mockWs();
    const id = joinAsSpectator(room, ws);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(getSpectatorCount(room)).toBe(1);
  });

  it('removeSpectator removes the spectator', () => {
    const { createRoom, joinAsSpectator, removeSpectator, getSpectatorCount } = require('../../src/rooms');
    const { room } = createRoom(null, 'Host');
    const id = joinAsSpectator(room, mockWs());
    removeSpectator(room, id);
    expect(getSpectatorCount(room)).toBe(0);
  });

  it('getSpectatorCount is independent of players map', () => {
    const { createRoom, joinAsSpectator, getSpectatorCount } = require('../../src/rooms');
    const { room } = createRoom(null, 'Host');
    joinAsSpectator(room, mockWs());
    joinAsSpectator(room, mockWs());
    expect(getSpectatorCount(room)).toBe(2);
    expect(room.players.size).toBe(1); // only the host
  });

  it('broadcastToHost sends only to host ws', () => {
    const { createRoom, broadcastToHost } = require('../../src/rooms');
    const hostWs = mockWs();
    const { room } = createRoom(hostWs, 'Host');
    broadcastToHost(room, { type: 'spectator_count', count: 3 });
    expect(hostWs._sent).toEqual([{ type: 'spectator_count', count: 3 }]);
  });

  it('broadcastToHost is a no-op when host has no ws', () => {
    const { createRoom, broadcastToHost } = require('../../src/rooms');
    const { room } = createRoom(null, 'Host');
    expect(() => broadcastToHost(room, { type: 'spectator_count', count: 0 })).not.toThrow();
  });
});

describe('join_as_spectator WebSocket message', () => {
  let server;
  let wss;
  let port;

  beforeEach((done) => {
    server = buildServer();
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  function connect() {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws.once('open', () => resolve(ws));
    });
  }

  function nextMsg(ws) {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data)));
    });
  }

  it('rejects join_as_spectator when room does not exist', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'join_as_spectator', code: 'NOROOM' }));
    const msg = await nextMsg(ws);
    expect(msg).toEqual({ type: 'error', message: 'Room not found' });
    ws.close();
  });

  it('rejects join_as_spectator when spectatorModeEnabled is false', async () => {
    const { rooms } = require('../../src/rooms');
    // Create a room directly in the store
    const hostWs = await connect();
    hostWs.send(JSON.stringify({ type: 'create_room', name: 'Host' }));
    const created = await nextMsg(hostWs);
    expect(created.type).toBe('room_created');
    const code = created.code;

    // Ensure spectatorModeEnabled is false (default)
    const room = rooms.get(code);
    expect(room.spectatorModeEnabled).toBe(false);

    const spectatorWs = await connect();
    spectatorWs.send(JSON.stringify({ type: 'join_as_spectator', code }));
    const msg = await nextMsg(spectatorWs);
    expect(msg).toEqual({ type: 'error', message: 'Spectator mode is disabled for this session' });

    hostWs.close();
    spectatorWs.close();
  });

  it('accepts join_as_spectator when spectatorModeEnabled is true and notifies host', async () => {
    const { rooms } = require('../../src/rooms');

    const hostWs = await connect();
    hostWs.send(JSON.stringify({ type: 'create_room', name: 'Host' }));
    const created = await nextMsg(hostWs);
    const code = created.code;

    // Enable spectator mode (set by issue #261; we set it directly here)
    const room = rooms.get(code);
    room.spectatorModeEnabled = true;

    const spectatorWs = await connect();
    spectatorWs.send(JSON.stringify({ type: 'join_as_spectator', code }));

    const [spectatorMsg, hostMsg] = await Promise.all([
      nextMsg(spectatorWs),
      nextMsg(hostWs)
    ]);

    expect(spectatorMsg.type).toBe('spectator_joined');
    expect(typeof spectatorMsg.spectatorId).toBe('string');
    expect(spectatorMsg.code).toBe(code);

    expect(hostMsg).toEqual({ type: 'spectator_count', count: 1 });

    hostWs.close();
    spectatorWs.close();
  });

  it('broadcasts updated spectator_count to host when spectator disconnects', async () => {
    const { rooms } = require('../../src/rooms');

    const hostWs = await connect();
    hostWs.send(JSON.stringify({ type: 'create_room', name: 'Host' }));
    const created = await nextMsg(hostWs);
    const code = created.code;

    const room = rooms.get(code);
    room.spectatorModeEnabled = true;

    const spectatorWs = await connect();
    spectatorWs.send(JSON.stringify({ type: 'join_as_spectator', code }));

    // Consume join confirmation and initial count
    await nextMsg(spectatorWs); // spectator_joined
    await nextMsg(hostWs);      // spectator_count: 1

    // Disconnect spectator and wait for host to receive updated count
    const hostCountPromise = nextMsg(hostWs);
    spectatorWs.close();
    const countMsg = await hostCountPromise;

    expect(countMsg).toEqual({ type: 'spectator_count', count: 0 });
    hostWs.close();
  });
});
