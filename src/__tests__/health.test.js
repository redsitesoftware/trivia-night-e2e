const request = require('supertest');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

describe('GET /api/health', () => {
  test('returns 200 with status ok and version 1.0', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0');
  });

  test('includes uptime field', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
  });
});
