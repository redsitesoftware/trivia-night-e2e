const request = require('supertest');
const WebSocket = require('ws');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../server');
  return app;
}

// ─── HTTP endpoint tests ───────────────────────────────────────────────────────

describe('POST /api/rooms/:roomId/timer', () => {
  async function createRoomAndGetTokens(app) {
    const res = await request(app).post('/api/rooms').send({ name: 'Host' });
    return { code: res.body.code, hostToken: res.body.hostToken };
  }

  it('returns 404 for unknown room', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/rooms/ZZZZZZ/timer')
      .send({ hostToken: 'fake', duration: 30 });
    expect(res.status).toBe(404);
  });

  it('returns 403 when hostToken is missing', async () => {
    const app = buildApp();
    const { code } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ duration: 30 });
    expect(res.status).toBe(403);
  });

  it('returns 403 when hostToken is wrong', async () => {
    const app = buildApp();
    const { code } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken: 'wrong-token', duration: 30 });
    expect(res.status).toBe(403);
  });

  it('returns 200 with duration when valid', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 60 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duration: 60 });
  });

  it('defaults duration to 30 when not supplied', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duration: 30 });
  });

  it('defaults duration to 30 when null is supplied', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: null });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ duration: 30 });
  });

  it('returns 400 when duration is below 10', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10/);
  });

  it('returns 400 when duration is above 120', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 121 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/120/);
  });

  it('returns 400 when duration is not an integer', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);
    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 30.5 });
    expect(res.status).toBe(400);
  });

  it('accepts boundary values 10 and 120', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoomAndGetTokens(app);

    const res10 = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 10 });
    expect(res10.status).toBe(200);
    expect(res10.body.duration).toBe(10);

    const res120 = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 120 });
    expect(res120.status).toBe(200);
    expect(res120.body.duration).toBe(120);
  });

  it('returns 400 after game has started', async () => {
    const app = buildApp();
    const { rooms } = require('../src/rooms');
    const { code, hostToken } = await createRoomAndGetTokens(app);

    // Force room into started state
    const room = rooms.get(code);
    room.state = 'question';

    const res = await request(app)
      .post(`/api/rooms/${code}/timer`)
      .send({ hostToken, duration: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/started/);
  });
});

// ─── WebSocket handler tests ───────────────────────────────────────────────────

describe('WebSocket set_timer handler', () => {
  let serverInstance;
  let port;

  beforeEach((done) => {
    jest.resetModules();
    const mod = require('../server');
    serverInstance = mod.server;
    serverInstance.listen(0, () => {
      port = serverInstance.address().port;
      done();
    });
  });

  afterEach((done) => {
    serverInstance.close(done);
  });

  function connect() {
    return new WebSocket(`ws://localhost:${port}`);
  }

  function sendAndReceive(ws, msg) {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data)));
      ws.send(JSON.stringify(msg));
    });
  }

  async function createRoomWs(ws) {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data)));
      ws.send(JSON.stringify({ type: 'create_room', name: 'Host' }));
    });
  }

  it('returns error when sender is not the host', (done) => {
    // A WebSocket connection that has not joined any room has no playerId,
    // so getRoomByPlayer(null) returns null → fails host check.
    const ws = connect();
    ws.on('open', () => {
      ws.once('message', (data) => {
        const reply = JSON.parse(data);
        expect(reply.type).toBe('error');
        expect(reply.message).toMatch(/host/i);
        ws.close();
        done();
      });
      ws.send(JSON.stringify({ type: 'set_timer', duration: 60 }));
    });
  }, 10000);

  it('sets the timer and broadcasts timer_updated', (done) => {
    const ws = connect();
    ws.on('open', async () => {
      await createRoomWs(ws);
      const reply = await sendAndReceive(ws, { type: 'set_timer', seconds: 45 });
      expect(reply.type).toBe('timer_updated');
      expect(reply.seconds).toBe(45);
      ws.close();
      done();
    });
  });

  it('rejects set_timer with no seconds field', (done) => {
    const ws = connect();
    ws.on('open', async () => {
      await createRoomWs(ws);
      const reply = await sendAndReceive(ws, { type: 'set_timer' });
      expect(reply.type).toBe('error');
      ws.close();
      done();
    });
  });

  it('returns error for duration below 10', (done) => {
    const ws = connect();
    ws.on('open', async () => {
      await createRoomWs(ws);
      const reply = await sendAndReceive(ws, { type: 'set_timer', duration: 5 });
      expect(reply.type).toBe('error');
      ws.close();
      done();
    });
  });

  it('returns error for duration above 120', (done) => {
    const ws = connect();
    ws.on('open', async () => {
      await createRoomWs(ws);
      const reply = await sendAndReceive(ws, { type: 'set_timer', duration: 999 });
      expect(reply.type).toBe('error');
      ws.close();
      done();
    });
  });

  it('returns error after game has started', (done) => {
    const ws = connect();
    ws.on('open', async () => {
      const created = await createRoomWs(ws);
      const { rooms } = require('../src/rooms');
      const room = rooms.get(created.code);
      room.state = 'question'; // simulate started game

      const reply = await sendAndReceive(ws, { type: 'set_timer', duration: 60 });
      expect(reply.type).toBe('error');
      expect(reply.message).toMatch(/lobby/i);
      ws.close();
      done();
    });
  });
});
