const request = require('supertest');
const { app } = require('../../server');

describe('GET /api/health', () => {
  test('returns 200 with status ok and version 1.0', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0');
  });
});
