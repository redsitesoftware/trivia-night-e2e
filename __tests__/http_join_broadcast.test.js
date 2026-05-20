'use strict';

const http = require('http');
const WebSocket = require('ws');
const supertest = require('supertest');

function buildServer() {
  jest.resetModules();
  const { server, app } = require('../server');
  return { server, app };
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, predicate, timeoutMs = 2000) {
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

describe('POST /api/rooms/:code/join broadcasts player_joined over WebSocket', () => {
  let server;
  let app;
  let hostWs;
  let roomCode;

  beforeEach(async () => {
    ({ server, app } = buildServer());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;
  });

  afterEach(async () => {
    if (hostWs.readyState === WebSocket.OPEN) hostWs.close();
    await new Promise((resolve) => server.close(resolve));
  });

  test('WS-connected player receives player_joined broadcast when another player joins via HTTP', async () => {
    // A second player joins via WS so they are connected and listening
    const playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player1' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');

    // A third player joins via HTTP
    const broadcastPromise = waitForMessage(playerWs, (m) => m.type === 'player_joined');
    const addr = server.address();
    await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: addr.port, path: `/api/rooms/${roomCode}/join`, method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          res.resume();
          res.on('end', resolve);
        }
      );
      req.on('error', reject);
      req.end(JSON.stringify({ name: 'Player2' }));
    });

    const broadcast = await broadcastPromise;
    expect(broadcast.type).toBe('player_joined');
    expect(Array.isArray(broadcast.players)).toBe(true);
    expect(broadcast.players.some((p) => p.name === 'Player2')).toBe(true);
    expect(broadcast.players[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), score: expect.any(Number) });

    playerWs.close();
  });

  test('host receives player_joined broadcast when a player joins via HTTP', async () => {
    const broadcastPromise = waitForMessage(hostWs, (m) => m.type === 'player_joined');
    const addr = server.address();
    await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: addr.port, path: `/api/rooms/${roomCode}/join`, method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          res.resume();
          res.on('end', resolve);
        }
      );
      req.on('error', reject);
      req.end(JSON.stringify({ name: 'JoiningPlayer' }));
    });

    const broadcast = await broadcastPromise;
    expect(broadcast.players.some((p) => p.name === 'JoiningPlayer')).toBe(true);
  });

  test('HTTP join response still returns 200 with playerToken, code, state, players', async () => {
    const addr = server.address();
    const body = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port: addr.port, path: `/api/rooms/${roomCode}/join`, method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        }
      );
      req.on('error', reject);
      req.end(JSON.stringify({ name: 'TestPlayer' }));
    });

    expect(body.status).toBe(200);
    expect(body.body).toMatchObject({
      playerToken: expect.any(String),
      code: roomCode,
      state: expect.any(String),
      players: expect.any(Array),
    });
  });
});
