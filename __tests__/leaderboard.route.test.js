const request = require('supertest');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../server');
  return app;
}

describe('GET /leaderboard', () => {
  it('returns status 200', async () => {
    const app = buildApp();
    const res = await request(app).get('/leaderboard');
    expect(res.status).toBe(200);
  });

  it('response Content-Type includes text/html', async () => {
    const app = buildApp();
    const res = await request(app).get('/leaderboard');
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('response body contains leaderboard HTML content', async () => {
    const app = buildApp();
    const res = await request(app).get('/leaderboard');
    expect(res.text).toMatch(/leaderboard/i);
  });

  it('is accessible without auth or room context', async () => {
    const app = buildApp();
    const res = await request(app).get('/leaderboard');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
