const request = require('supertest');
const os = require('os');
const fs = require('fs');
const path = require('path');

let tempScoresFile;

beforeEach(() => {
  tempScoresFile = path.join(os.tmpdir(), `scores-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  process.env.SCORES_FILE = tempScoresFile;
  jest.resetModules();
});

afterEach(() => {
  try { fs.unlinkSync(tempScoresFile); } catch { /* already gone */ }
  delete process.env.SCORES_FILE;
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

describe('GET /api/leaderboard', () => {
  it('returns 200 with empty array when no scores exist', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns entries with roomId, playerName, score, timestamp fields', async () => {
    const app = buildApp();

    await request(app).post('/api/scores').send({
      playerId: 'Alice',
      score: 42,
      roomId: 'ROOM1'
    });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const entry = res.body[0];
    expect(entry).toHaveProperty('playerName', 'Alice');
    expect(entry).toHaveProperty('roomId', 'ROOM1');
    expect(entry).toHaveProperty('score', 42);
    expect(entry).toHaveProperty('timestamp');
  });

  it('returns up to 10 entries sorted by score descending', async () => {
    const app = buildApp();

    // Record 12 scores
    for (let i = 1; i <= 12; i++) {
      await request(app).post('/api/scores').send({
        playerId: `Player${i}`,
        score: i * 10,
        roomId: 'ROOM1'
      });
    }

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);

    // First entry should have the highest score (120)
    expect(res.body[0].score).toBe(120);
    // Scores should be in descending order
    for (let i = 0; i < res.body.length - 1; i++) {
      expect(res.body[i].score).toBeGreaterThanOrEqual(res.body[i + 1].score);
    }
  });
});
