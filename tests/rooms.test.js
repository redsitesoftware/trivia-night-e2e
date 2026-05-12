const request = require('supertest');
const { app } = require('../server');
const { clearRooms } = require('../src/rooms');

beforeEach(() => {
  clearRooms();
});

describe('GET /api/health', () => {
  test('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/rooms', () => {
  test('creates a room and returns a 6-char uppercase join code and hostToken', async () => {
    const res = await request(app).post('/api/rooms').send({ hostName: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(typeof res.body.hostToken).toBe('string');
    expect(res.body.hostToken).toHaveLength(36); // UUID v4
  });

  test('each room gets a unique join code', async () => {
    const codes = new Set();
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/rooms').send({ hostName: 'Host' });
      codes.add(res.body.code);
    }
    expect(codes.size).toBe(10);
  });
});

describe('POST /api/rooms/:code/join', () => {
  let roomCode;

  beforeEach(async () => {
    const res = await request(app).post('/api/rooms').send({ hostName: 'Host' });
    roomCode = res.body.code;
  });

  test('player can join with a display name and receives a playerToken', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ displayName: 'Bob' });
    expect(res.status).toBe(200);
    expect(typeof res.body.playerToken).toBe('string');
    expect(res.body.playerToken).toHaveLength(36);
  });

  test('returns 400 if displayName is missing', async () => {
    const res = await request(app).post(`/api/rooms/${roomCode}/join`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/displayName/i);
  });

  test('returns 400 if displayName is blank', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ displayName: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown room code', async () => {
    const res = await request(app)
      .post('/api/rooms/XXXXXX/join')
      .send({ displayName: 'Carol' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('join code lookup is case-insensitive', async () => {
    const res = await request(app)
      .post(`/api/rooms/${roomCode.toLowerCase()}/join`)
      .send({ displayName: 'Dave' });
    expect(res.status).toBe(200);
  });

  test('up to 8 players can join; 9th is rejected with 409', async () => {
    for (let i = 1; i <= 8; i++) {
      const res = await request(app)
        .post(`/api/rooms/${roomCode}/join`)
        .send({ displayName: `Player${i}` });
      expect(res.status).toBe(200);
    }
    const res9 = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .send({ displayName: 'Player9' });
    expect(res9.status).toBe(409);
    expect(res9.body.error).toMatch(/full/i);
  });
});
