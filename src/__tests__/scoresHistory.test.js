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

  describe('player filter (?player=)', () => {
    it('returns only entries matching the player name (case-insensitive substring)', async () => {
      const app = buildApp();
      await request(app).post('/api/scores').send({ playerId: 'Alice', score: 50, roomId: 'R1' });
      await request(app).post('/api/scores').send({ playerId: 'alice_pro', score: 40, roomId: 'R1' });
      await request(app).post('/api/scores').send({ playerId: 'Bob', score: 60, roomId: 'R1' });

      const res = await request(app).get('/api/scores/history?player=alice');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      res.body.forEach(e => expect(e.playerName.toLowerCase()).toContain('alice'));
    });

    it('returns empty array when no player matches', async () => {
      const app = buildApp();
      await request(app).post('/api/scores').send({ playerId: 'Bob', score: 30, roomId: 'R1' });

      const res = await request(app).get('/api/scores/history?player=zzz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('still sorts results by score descending when filtering by player', async () => {
      const app = buildApp();
      await request(app).post('/api/scores').send({ playerId: 'Alice', score: 20, roomId: 'R1' });
      await request(app).post('/api/scores').send({ playerId: 'Alice', score: 80, roomId: 'R2' });
      await request(app).post('/api/scores').send({ playerId: 'Alice', score: 50, roomId: 'R3' });

      const res = await request(app).get('/api/scores/history?player=Alice');
      expect(res.status).toBe(200);
      expect(res.body.map(e => e.score)).toEqual([80, 50, 20]);
    });
  });

  describe('limit parameter (?limit=)', () => {
    it('respects a custom limit', async () => {
      const app = buildApp();
      for (let i = 1; i <= 8; i++) {
        await request(app).post('/api/scores').send({ playerId: `P${i}`, score: i * 10, roomId: 'R1' });
      }

      const res = await request(app).get('/api/scores/history?limit=3');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].score).toBe(80);
    });

    it('returns 400 for non-numeric limit', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/scores/history?limit=abc');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for limit < 1', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/scores/history?limit=0');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for limit > 50', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/scores/history?limit=51');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('combined player + limit', () => {
    it('filters by player and respects limit', async () => {
      const app = buildApp();
      for (let i = 1; i <= 6; i++) {
        await request(app).post('/api/scores').send({ playerId: 'Alice', score: i * 10, roomId: 'R1' });
      }
      await request(app).post('/api/scores').send({ playerId: 'Bob', score: 999, roomId: 'R1' });

      const res = await request(app).get('/api/scores/history?player=Alice&limit=4');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      res.body.forEach(e => expect(e.playerName).toBe('Alice'));
    });
  });
});
