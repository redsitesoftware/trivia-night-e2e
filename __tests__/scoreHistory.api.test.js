const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempFiles = [];

function makeTempFile() {
  const file = path.join(os.tmpdir(), `scores-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  tempFiles.push(file);
  return file;
}

function seedScores(file, scores) {
  fs.writeFileSync(file, JSON.stringify(scores), 'utf8');
}

function buildApp() {
  jest.resetModules();
  const { app } = require('../server');
  return app;
}

afterEach(() => {
  delete process.env.SCORES_FILE;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.RATE_LIMIT_WINDOW_MS;
});

afterAll(() => {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
});

describe('GET /api/scores/history', () => {
  describe('basic response', () => {
    it('returns 200 with an array', async () => {
      const file = makeTempFile();
      seedScores(file, []);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns scores sorted by score descending', async () => {
      const file = makeTempFile();
      seedScores(file, [
        { playerName: 'alice', roomId: 'r1', score: 50, timestamp: '2024-01-01T00:00:00Z', nickname: 'alice' },
        { playerName: 'bob', roomId: 'r1', score: 100, timestamp: '2024-01-01T00:00:01Z', nickname: 'bob' },
        { playerName: 'carol', roomId: 'r1', score: 75, timestamp: '2024-01-01T00:00:02Z', nickname: 'carol' },
      ]);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
      expect(res.body[0].score).toBe(100);
      expect(res.body[1].score).toBe(75);
      expect(res.body[2].score).toBe(50);
    });
  });

  describe('limit param', () => {
    it('defaults to 10 when no limit param is provided', async () => {
      const file = makeTempFile();
      const scores = Array.from({ length: 15 }, (_, i) => ({
        playerName: `player${i}`, roomId: 'r1', score: i * 10,
        timestamp: '2024-01-01T00:00:00Z', nickname: `player${i}`,
      }));
      seedScores(file, scores);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(10);
    });

    it('returns at most 5 results with ?limit=5', async () => {
      const file = makeTempFile();
      const scores = Array.from({ length: 10 }, (_, i) => ({
        playerName: `player${i}`, roomId: 'r1', score: i * 10,
        timestamp: '2024-01-01T00:00:00Z', nickname: `player${i}`,
      }));
      seedScores(file, scores);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history?limit=5');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(5);
    });

    it('returns 400 for ?limit=0', async () => {
      const file = makeTempFile();
      seedScores(file, []);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history?limit=0');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for ?limit=51', async () => {
      const file = makeTempFile();
      seedScores(file, []);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history?limit=51');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for ?limit=abc', async () => {
      const file = makeTempFile();
      seedScores(file, []);
      process.env.SCORES_FILE = file;
      const app = buildApp();

      const res = await request(app).get('/api/scores/history?limit=abc');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('player filter', () => {
    let app;

    beforeEach(() => {
      const file = makeTempFile();
      seedScores(file, [
        { playerName: 'alice', roomId: 'r1', score: 100, timestamp: '2024-01-01T00:00:00Z', nickname: 'alice' },
        { playerName: 'Alice_Pro', roomId: 'r1', score: 90, timestamp: '2024-01-01T00:00:01Z', nickname: 'Alice_Pro' },
        { playerName: 'bob', roomId: 'r1', score: 80, timestamp: '2024-01-01T00:00:02Z', nickname: 'bob' },
      ]);
      process.env.SCORES_FILE = file;
      app = buildApp();
    });

    it('filters by ?player=alice (lowercase)', async () => {
      const res = await request(app).get('/api/scores/history?player=alice');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      res.body.forEach(entry => {
        expect(entry.playerName.toLowerCase()).toContain('alice');
      });
    });

    it('filters by ?player=ALICE (case-insensitive)', async () => {
      const res = await request(app).get('/api/scores/history?player=ALICE');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      res.body.forEach(entry => {
        expect(entry.playerName.toLowerCase()).toContain('alice');
      });
    });

    it('returns empty array when no player name matches', async () => {
      const res = await request(app).get('/api/scores/history?player=zzznomatch');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 JSON { error: "Too many requests" } after exceeding RATE_LIMIT_MAX requests', async () => {
      const file = makeTempFile();
      seedScores(file, []);
      process.env.SCORES_FILE = file;
      process.env.RATE_LIMIT_MAX = '3';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
      const app = buildApp();

      for (let i = 0; i < 3; i++) {
        const res = await request(app).get('/api/scores/history');
        expect(res.status).toBe(200);
      }

      const res = await request(app).get('/api/scores/history');
      expect(res.status).toBe(429);
      expect(res.body).toEqual({ error: 'Too many requests' });
    });
  });
});
