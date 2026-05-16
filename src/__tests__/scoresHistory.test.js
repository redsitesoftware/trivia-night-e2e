const request = require('supertest');

// Each test gets a fresh module state
beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

describe('GET /api/scores/history', () => {
  it('returns status 200', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/scores/history');
    expect(res.status).toBe(200);
  });

  it('response Content-Type includes application/json', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/scores/history');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response body is an array', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/scores/history');
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns empty array when no scores have been recorded', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/scores/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns at most 10 entries sorted by score descending after recording 11 scores', async () => {
    const app = buildApp();

    // Record 11 scores
    for (let i = 1; i <= 11; i++) {
      await request(app).post('/api/scores').send({
        playerId: `Player${i}`,
        score: i * 10,
        roomId: 'ROOM1'
      });
    }

    const res = await request(app).get('/api/scores/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);

    // Highest score (110) should be first
    expect(res.body[0].score).toBe(110);

    // Entries must be in descending order
    for (let i = 0; i < res.body.length - 1; i++) {
      expect(res.body[i].score).toBeGreaterThanOrEqual(res.body[i + 1].score);
    }
  });
});
