'use strict';

const request = require('supertest');

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function buildApp() {
  const { app } = require('../server');
  return app;
}

async function createRoom(app, opts = {}) {
  const res = await request(app)
    .post('/api/rooms')
    .send({ name: 'Host', ...opts });
  return { code: res.body.code, hostToken: res.body.hostToken };
}

describe('POST /api/rooms/:code/start', () => {
  it('returns 200 with state, code, and questionTimeSecs when host starts the game', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoom(app);

    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'in-progress',
      code,
      questionTimeSecs: expect.any(Number),
    });
  });

  it('returns 403 when hostToken is missing from request body', async () => {
    const app = buildApp();
    const { code } = await createRoom(app);

    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 403 when hostToken does not match the room hostId', async () => {
    const app = buildApp();
    const { code } = await createRoom(app);

    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken: 'wrong-token' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 409 when the room is already in-progress', async () => {
    const app = buildApp();
    const { code, hostToken } = await createRoom(app);

    const first = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty('error');
  });

  it('returns 404 for an unknown room code', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/rooms/ZZZZZZ/start')
      .send({ hostToken: 'any-token' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('cleans up the room after each test to prevent timer leaks', async () => {
    const app = buildApp();
    const { deleteRoom } = require('../src/rooms');
    const { code, hostToken } = await createRoom(app);

    await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken });

    deleteRoom(code);
  });
});
