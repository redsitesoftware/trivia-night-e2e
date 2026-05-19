'use strict';

const request = require('supertest');
const { app, server } = require('../../server');
const { deleteRoom, validateTimerSeconds } = require('../rooms');

afterAll(() => server.close());

// ─── validateTimerSeconds unit tests ───────────────────────────────────────────

describe('validateTimerSeconds', () => {
  test('returns null for a valid value (30)', () => {
    expect(validateTimerSeconds(30)).toBeNull();
  });

  test('returns null for boundary value 10', () => {
    expect(validateTimerSeconds(10)).toBeNull();
  });

  test('returns null for boundary value 120', () => {
    expect(validateTimerSeconds(120)).toBeNull();
  });

  test('returns error for value below minimum (9)', () => {
    expect(validateTimerSeconds(9)).toMatch(/between 10 and 120/);
  });

  test('returns error for value above maximum (121)', () => {
    expect(validateTimerSeconds(121)).toMatch(/between 10 and 120/);
  });

  test('returns error for non-integer number (10.5)', () => {
    expect(validateTimerSeconds(10.5)).toMatch(/integer/);
  });

  test('returns error for string', () => {
    expect(validateTimerSeconds('30')).toMatch(/integer/);
  });

  test('returns error for null', () => {
    expect(validateTimerSeconds(null)).toMatch(/integer/);
  });
});

// ─── POST /api/rooms — questionTimeSecs ────────────────────────────────────────

describe('POST /api/rooms with questionTimeSecs', () => {
  const createdCodes = [];

  afterEach(() => {
    for (const code of createdCodes) deleteRoom(code);
    createdCodes.length = 0;
  });

  test('omitting questionTimeSecs creates room with default 30 s (backward-compatible)', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host' });
    expect(res.status).toBe(201);
    createdCodes.push(res.body.code);
  });

  test('setting questionTimeSecs: 45 is accepted', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: 45 });
    expect(res.status).toBe(201);
    createdCodes.push(res.body.code);
  });

  test('setting questionTimeSecs: 10 (min boundary) is accepted', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: 10 });
    expect(res.status).toBe(201);
    createdCodes.push(res.body.code);
  });

  test('setting questionTimeSecs: 120 (max boundary) is accepted', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: 120 });
    expect(res.status).toBe(201);
    createdCodes.push(res.body.code);
  });

  test('setting questionTimeSecs: 9 returns 400', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: 9 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('setting questionTimeSecs: 121 returns 400', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: 121 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('setting questionTimeSecs: 10.5 (non-integer) returns 400', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: 10.5 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('setting questionTimeSecs: "30" (string) returns 400', async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host', questionTimeSecs: '30' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── POST /api/rooms/:code/start ───────────────────────────────────────────────

describe('POST /api/rooms/:code/start', () => {
  let code, hostToken;

  beforeEach(async () => {
    const res = await request(app).post('/api/rooms').send({ name: 'Host' });
    code = res.body.code;
    hostToken = res.body.hostToken;
  });

  afterEach(() => deleteRoom(code));

  test('starts game with default timer when questionTimeSecs omitted', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken });
    expect(res.status).toBe(200);
    expect(res.body.questionTimeSecs).toBe(30);
  });

  test('starts game with custom questionTimeSecs: 45', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken, questionTimeSecs: 45 });
    expect(res.status).toBe(200);
    expect(res.body.questionTimeSecs).toBe(45);
  });

  test('returns 400 for questionTimeSecs: 9', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken, questionTimeSecs: 9 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 for questionTimeSecs: 121', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken, questionTimeSecs: 121 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 for non-integer questionTimeSecs', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken, questionTimeSecs: 30.5 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when hostToken is missing', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 403 when hostToken is wrong', async () => {
    const res = await request(app)
      .post(`/api/rooms/${code}/start`)
      .send({ hostToken: 'wrong-token' });
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 404 for unknown room code', async () => {
    const res = await request(app)
      .post('/api/rooms/XXXXXX/start')
      .send({ hostToken });
    expect(res.status).toBe(404);
  });

  test('returns 409 if game already started', async () => {
    await request(app).post(`/api/rooms/${code}/start`).send({ hostToken });
    const res = await request(app).post(`/api/rooms/${code}/start`).send({ hostToken });
    expect(res.status).toBe(409);
  });
});
