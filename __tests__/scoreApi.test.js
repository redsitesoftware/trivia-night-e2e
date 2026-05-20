const request = require('supertest');
const os = require('os');
const path = require('path');
const fs = require('fs');

let tmpFile;

beforeEach(() => {
  jest.resetModules();
  tmpFile = path.join(os.tmpdir(), `scores-test-${Date.now()}-${Math.random()}.json`);
  process.env.SCORES_FILE = tmpFile;
});

afterEach(() => {
  try { fs.unlinkSync(tmpFile); } catch { /* already gone */ }
  delete process.env.SCORES_FILE;
});

function buildApp() {
  return require('../server').app;
}

describe('POST /api/scores', () => {
  it('returns 200 with recorded:true for valid payload', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ playerId: 'p1', score: 42, roomId: 'room1' });
    expect(res.status).toBe(200);
    expect(res.body.recorded).toBe(true);
  });

  it('returns 400 when playerId is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ score: 10, roomId: 'room1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when score is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ playerId: 'p1', roomId: 'room1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when roomId is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ playerId: 'p1', score: 10 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when score is not a number', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ playerId: 'p1', score: 'notanumber', roomId: 'room1' });
    expect(res.status).toBe(400);
  });

  it('returns nickname in response when provided', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ playerId: 'p1', score: 99, roomId: 'room1', nickname: 'QuizMaster' });
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('QuizMaster');
  });

  it('falls back to playerId as nickname when nickname is omitted', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/scores')
      .send({ playerId: 'p1', score: 5, roomId: 'room1' });
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('p1');
  });
});

describe('GET /api/leaderboard', () => {
  it('returns 200 and a JSON array when empty', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns at most 10 entries', async () => {
    const app = buildApp();
    // Post 12 scores
    for (let i = 0; i < 12; i++) {
      await request(app)
        .post('/api/scores')
        .send({ playerId: `player${i}`, score: i, roomId: 'room1' });
    }
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(10);
  });

  it('returns entries sorted by score descending', async () => {
    const app = buildApp();
    await request(app).post('/api/scores').send({ playerId: 'low', score: 5, roomId: 'r1' });
    await request(app).post('/api/scores').send({ playerId: 'high', score: 100, roomId: 'r1' });
    await request(app).post('/api/scores').send({ playerId: 'mid', score: 50, roomId: 'r1' });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    const scores = res.body.map(e => e.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
