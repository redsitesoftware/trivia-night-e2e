const request = require('supertest');

// Each test gets a fresh module state
beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
