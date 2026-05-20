const request = require('supertest');
const { version } = require('../package.json');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../server');
  return app;
}

describe('GET /api/health', () => {
  it('returns status 200', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('response Content-Type includes application/json', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response body contains status: ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.body.status).toBe('ok');
  });

  it('response body contains version matching package.json', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/health');
    expect(res.body.version).toBe(version);
  });
});
