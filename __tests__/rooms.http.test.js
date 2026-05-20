'use strict';

const request = require('supertest');
const WebSocket = require('ws');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../server');
  return app;
}

function buildServer() {
  jest.resetModules();
  const { server } = require('../server');
  return server;
}

function connectWs(server) {
  const addr = server.address();
  const url = `ws://127.0.0.1:${addr.port}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

function waitForMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for WS message')),
      timeoutMs
    );
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

// ─── POST /api/rooms ──────────────────────────────────────────────────────────

describe('POST /api/rooms', () => {
  it('returns 201 with code, hostToken, state and players', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/rooms').send({ name: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      code: expect.any(String),
      hostToken: expect.any(String),
      state: 'waiting',
      players: [{ id: expect.any(String), name: 'Alice', score: 0 }],
    });
  });

  it('defaults host name to "Host" when no body is sent', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/rooms');

    expect(res.status).toBe(201);
    expect(res.body.players[0].name).toBe('Host');
  });

  it('hostToken equals the host player id in players list', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/rooms').send({ name: 'Bob' });

    expect(res.status).toBe(201);
    const { hostToken, players } = res.body;
    const hostPlayer = players.find((p) => p.id === hostToken);
    expect(hostPlayer).toBeDefined();
  });

  it('players array contains exactly one entry after creation', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/rooms').send({ name: 'Carol' });

    expect(res.status).toBe(201);
    expect(res.body.players).toHaveLength(1);
  });
});

// ─── POST /api/rooms/:code/join ───────────────────────────────────────────────

describe('POST /api/rooms/:code/join', () => {
  async function createRoom(app, name = 'Host') {
    const res = await request(app).post('/api/rooms').send({ name });
    return res.body;
  }

  it('returns 200 with playerToken, code, state and players', async () => {
    const app = buildApp();
    const { code } = await createRoom(app);

    const res = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'Dave' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      playerToken: expect.any(String),
      code,
      state: 'waiting',
      players: expect.any(Array),
    });
  });

  it('includes the joining player in the returned players list', async () => {
    const app = buildApp();
    const { code } = await createRoom(app);

    const res = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'Eve' });

    expect(res.status).toBe(200);
    const names = res.body.players.map((p) => p.name);
    expect(names).toContain('Eve');
  });

  it('returns 400 for an invalid (unknown) room code', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/rooms/ZZZZZZ/join')
      .send({ name: 'Frank' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when the room code is empty/missing in the path', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/rooms/BADCODE/join').send({ name: 'Ghost' });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/rooms/:id ────────────────────────────────────────────────────

describe('DELETE /api/rooms/:id', () => {
  async function createRoom(app, name = 'Host') {
    const res = await request(app).post('/api/rooms').send({ name });
    return res.body;
  }

  it('returns 200 with code, state and players of the deleted room', async () => {
    const app = buildApp();
    const { code } = await createRoom(app);

    const res = await request(app).delete(`/api/rooms/${code}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      code,
      state: expect.any(String),
      players: expect.any(Array),
    });
  });

  it('returns 404 for an unknown room id', async () => {
    const app = buildApp();
    const res = await request(app).delete('/api/rooms/UNKNOWN');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('room is no longer accessible after deletion', async () => {
    const app = buildApp();
    const { code } = await createRoom(app);

    await request(app).delete(`/api/rooms/${code}`);

    const joinRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: 'Latebird' });
    expect(joinRes.status).toBe(400);
  });

  it('players in the deleted room are returned in the response', async () => {
    const app = buildApp();
    const { code } = await createRoom(app, 'DeleteHost');

    const res = await request(app).delete(`/api/rooms/${code}`);

    expect(res.status).toBe(200);
    const names = res.body.players.map((p) => p.name);
    expect(names).toContain('DeleteHost');
  });
});

// ─── WS broadcast: player_joined after HTTP join ─────────────────────────────
// Depends on issue #380 (Broadcast player_joined on HTTP room join) being merged.

describe('POST /api/rooms/:code/join — WS player_joined broadcast', () => {
  let serverInstance;

  beforeEach((done) => {
    jest.resetModules();
    const mod = require('../server');
    serverInstance = mod.server;
    serverInstance.listen(0, '127.0.0.1', done);
  });

  afterEach((done) => {
    serverInstance.close(done);
  });

  // Skipped until issue #380 is resolved (HTTP join handler must call broadcast).
  test.skip('WS-connected host receives player_joined broadcast after HTTP join (#380)', async () => {
    const { app } = require('../server');

    // Create a room via HTTP
    const createRes = await request(app).post('/api/rooms').send({ name: 'WSHost' });
    expect(createRes.status).toBe(201);
    const { code, hostToken } = createRes.body;

    // Connect the host via WebSocket and attach to the room
    const hostWs = await connectWs(serverInstance);
    hostWs.send(JSON.stringify({ type: 'reconnect', playerId: hostToken }));
    await waitForMessage(hostWs, (m) => m.type === 'reconnected');

    // Join the room via HTTP — host WS should receive player_joined
    const joinPromise = waitForMessage(hostWs, (m) => m.type === 'player_joined');
    await request(app).post(`/api/rooms/${code}/join`).send({ name: 'HTTPPlayer' });

    const broadcast = await joinPromise;
    expect(broadcast.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'HTTPPlayer' }),
      ])
    );

    hostWs.close();
  });
});
