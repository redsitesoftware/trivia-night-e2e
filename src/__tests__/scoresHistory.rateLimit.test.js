// Rate-limit integration tests for GET /api/scores/history
// Uses a short window via env var so tests don't wait 60 s between runs.
process.env.RATE_LIMIT_WINDOW_MS = '2000';
process.env.RATE_LIMIT_MAX = '60';

const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_SCORES_DIR = path.join(process.cwd(), '.test-data');
let tempScoresFile;

beforeEach(() => {
  fs.mkdirSync(TEST_SCORES_DIR, { recursive: true });
  tempScoresFile = path.join(TEST_SCORES_DIR, `scores-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  process.env.SCORES_FILE = tempScoresFile;
  jest.resetModules();
});

afterEach(() => {
  try { fs.rmSync(tempScoresFile, { force: true }); } catch {}
  try { fs.rmSync(TEST_SCORES_DIR, { recursive: true, force: true }); } catch {}
  delete process.env.SCORES_FILE;
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

describe('GET /api/scores/history rate limiting', () => {
  it('returns 200 for each of the first 60 requests, then 429 on the 61st', async () => {
    const app = buildApp();
    const agent = request(app);

    for (let i = 1; i <= 60; i++) {
      const res = await agent.get('/api/scores/history');
      expect(res.status).toBe(200);
    }

    const res = await agent.get('/api/scores/history');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests' });
  });
});

describe('GET /api/health is NOT rate-limited by scoresHistoryLimiter', () => {
  it('returns 200 for 70+ requests to /api/health', async () => {
    const app = buildApp();
    const agent = request(app);

    for (let i = 1; i <= 70; i++) {
      const res = await agent.get('/api/health');
      expect(res.status).toBe(200);
    }
  });
});
