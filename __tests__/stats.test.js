const request = require('supertest');
const { version } = require('../package.json');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../server');
  return app;
}

describe('GET /api/stats', () => {
  it('returns status 200', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
  });

  it('response Content-Type includes application/json', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns totalGames, activePlayers, and version fields', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.body).toHaveProperty('totalGames');
    expect(res.body).toHaveProperty('activePlayers');
    expect(res.body).toHaveProperty('version');
  });

  it('returns numeric totalGames and activePlayers', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/stats');
    expect(typeof res.body.totalGames).toBe('number');
    expect(typeof res.body.activePlayers).toBe('number');
  });

  it('returns correct version from package.json', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.body.version).toBe(version);
  });

  it('reflects rooms created via POST /api/rooms', async () => {
    const app = buildApp();

    const statsBefore = await request(app).get('/api/stats');
    const gamesBefore = statsBefore.body.totalGames;
    const playersBefore = statsBefore.body.activePlayers;

    await request(app).post('/api/rooms').send({ name: 'TestHost' });

    const statsAfter = await request(app).get('/api/stats');
    expect(statsAfter.body.totalGames).toBe(gamesBefore + 1);
    expect(statsAfter.body.activePlayers).toBe(playersBefore + 1);
  });
});
