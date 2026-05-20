'use strict';

const http = require('http');
const WebSocket = require('ws');
const supertest = require('supertest');

jest.setTimeout(10000);

function buildServer() {
  jest.resetModules();
  const { server } = require('../server');
  return server;
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), timeoutMs);
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw);
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    });
  });
}

function connectWs(server) {
  const addr = server.address();
  const url = `ws://127.0.0.1:${addr.port}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

describe('WS room management', () => {
  let server;
  let openSockets;

  beforeEach(async () => {
    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    openSockets = [];
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    await new Promise((resolve) => server.close(resolve));
  });

  async function connect() {
    const ws = await connectWs(server);
    openSockets.push(ws);
    return ws;
  }

  // ---------------------------------------------------------------------------
  // create_room
  // ---------------------------------------------------------------------------

  test('create_room emits room_created with expected fields', async () => {
    const ws = await connect();
    wsSend(ws, { type: 'create_room', name: 'Alice' });
    const msg = await waitForMessage(ws, (m) => m.type === 'room_created');

    expect(msg.type).toBe('room_created');
    expect(typeof msg.code).toBe('string');
    expect(msg.code.length).toBeGreaterThan(0);
    expect(typeof msg.playerId).toBe('string');
    expect(msg.isHost).toBe(true);
    expect(Array.isArray(msg.players)).toBe(true);
    expect(msg.players.length).toBe(1);
    expect(msg.players[0].name).toBe('Alice');
  });

  // ---------------------------------------------------------------------------
  // join_room
  // ---------------------------------------------------------------------------

  test('join_room emits room_joined to the joining client', async () => {
    const hostWs = await connect();
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');

    const playerWs = await connect();
    wsSend(playerWs, { type: 'join_room', code: created.code, name: 'Bob' });
    const joined = await waitForMessage(playerWs, (m) => m.type === 'room_joined');

    expect(joined.type).toBe('room_joined');
    expect(joined.code).toBe(created.code);
    expect(typeof joined.playerId).toBe('string');
    expect(joined.isHost).toBe(false);
    expect(Array.isArray(joined.players)).toBe(true);
    expect(joined.players.length).toBe(2);
  });

  test('join_room broadcasts player_joined to existing players in the room', async () => {
    const hostWs = await connect();
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');

    const playerWs = await connect();
    wsSend(playerWs, { type: 'join_room', code: created.code, name: 'Carol' });

    const broadcast = await waitForMessage(hostWs, (m) => m.type === 'player_joined');

    expect(broadcast.type).toBe('player_joined');
    expect(Array.isArray(broadcast.players)).toBe(true);
    expect(broadcast.players.length).toBe(2);
    expect(broadcast.players.some((p) => p.name === 'Carol')).toBe(true);
  });

  test('join_room with invalid room code emits error', async () => {
    const ws = await connect();
    wsSend(ws, { type: 'join_room', code: 'INVALID', name: 'Dave' });
    const msg = await waitForMessage(ws, (m) => m.type === 'error');

    expect(msg.type).toBe('error');
    expect(typeof msg.message).toBe('string');
    expect(msg.message.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // reconnect
  // ---------------------------------------------------------------------------

  test('reconnect without playerId emits error "playerId required for reconnect"', async () => {
    const ws = await connect();
    wsSend(ws, { type: 'reconnect' });
    const msg = await waitForMessage(ws, (m) => m.type === 'error');

    expect(msg.message).toBe('playerId required for reconnect');
  });

  test('reconnect with unknown playerId emits error "Player not found"', async () => {
    const ws = await connect();
    wsSend(ws, { type: 'reconnect', playerId: 'non-existent-player-id' });
    const msg = await waitForMessage(ws, (m) => m.type === 'error');

    expect(msg.message).toBe('Player not found');
  });

  test('reconnect with valid playerId re-attaches and emits reconnected with expected fields', async () => {
    const { app } = require('../server');
    const res = await supertest(server).post('/api/rooms').send({ name: 'Host' });
    expect(res.status).toBe(201);
    const { code, hostToken } = res.body;

    const ws = await connect();
    wsSend(ws, { type: 'reconnect', playerId: hostToken });
    const msg = await waitForMessage(ws, (m) => m.type === 'reconnected');

    expect(msg.type).toBe('reconnected');
    expect(msg.code).toBe(code);
    expect(msg.playerId).toBe(hostToken);
    expect(typeof msg.isHost).toBe('boolean');
    expect(msg.isHost).toBe(true);
    expect(typeof msg.state).toBe('string');
    expect(Array.isArray(msg.players)).toBe(true);
    expect(typeof msg.spectatorModeEnabled).toBe('boolean');
    expect(typeof msg.spectatorCount).toBe('number');
  });
});
