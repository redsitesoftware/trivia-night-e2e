const request = require('supertest');
const os = require('os');
const fs = require('fs');
const path = require('path');

let tempScoresFile;

beforeEach(() => {
  // Point scoreHistory at a fresh temp file so tests never touch data/scores.json
  tempScoresFile = path.join(os.tmpdir(), `scores-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  process.env.SCORES_FILE = tempScoresFile;
  jest.resetModules();
});

afterEach(() => {
  // Clean up temp file
  try { fs.unlinkSync(tempScoresFile); } catch { /* already gone */ }
  delete process.env.SCORES_FILE;
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

  it('loads scores from a pre-existing JSON file on module init', async () => {
    const preloaded = [
      { playerName: 'Alice', roomId: 'R1', score: 99, timestamp: '2026-01-01T00:00:00.000Z', nickname: 'Alice' },
      { playerName: 'Bob',   roomId: 'R1', score: 55, timestamp: '2026-01-01T00:01:00.000Z', nickname: 'Bob' }
    ];
    fs.writeFileSync(tempScoresFile, JSON.stringify(preloaded), 'utf8');

    // Reset modules so scoreHistory re-reads the file on require
    jest.resetModules();
    const app = buildApp();
    const res = await request(app).get('/api/scores/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].score).toBe(99);
    expect(res.body[1].score).toBe(55);
  });

  it('falls back to empty history when the scores file contains corrupt JSON', async () => {
    fs.writeFileSync(tempScoresFile, '{ this is not valid json !!!', 'utf8');

    jest.resetModules();
    const app = buildApp();
    const res = await request(app).get('/api/scores/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
