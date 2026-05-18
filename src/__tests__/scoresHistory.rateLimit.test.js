// Rate-limit integration tests for GET /api/scores/history
// Uses a short window via env var so tests don't wait 60 s between runs.
process.env.RATE_LIMIT_WINDOW_MS = '2000';
process.env.RATE_LIMIT_MAX = '60';

const request = require('supertest');
const os = require('os');
const fs = require('fs');
const path = require('path');

let tempScoresFile;

// Reload server with the env vars set above.
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
    // Fresh app instance so the request counter from the scores/history tests
    // does not bleed in.
    const app = buildApp();
    const agent = request(app);

    for (let i = 1; i <= 70; i++) {
      const res = await agent.get('/api/health');
      expect(res.status).toBe(200);
    }
  });
});
