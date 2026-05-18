const request = require('supertest');

function buildApp() {
  jest.resetModules();
  const { app } = require('../../server');
  return app;
}

describe('GET /api/health', () => {
  it('returns HTTP 200', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('returns { status: "ok", version: "1.0" }', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.body).toEqual({ status: 'ok', version: '1.0' });
  });

  it('does not include uptime in the response', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.body).not.toHaveProperty('uptime');
  });
});
