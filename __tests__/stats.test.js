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

  it('activePlayers equals sum of players across multiple rooms', async () => {
    const app = buildApp();

    const statsBefore = await request(app).get('/api/stats');
    const playersBefore = statsBefore.body.activePlayers;
    const gamesBefore = statsBefore.body.totalGames;

    // Create room 1 with host + 2 additional players (3 total)
    const room1Res = await request(app).post('/api/rooms').send({ name: 'HostA' });
    const code1 = room1Res.body.code;
    await request(app).post(`/api/rooms/${code1}/join`).send({ name: 'PlayerA1' });
    await request(app).post(`/api/rooms/${code1}/join`).send({ name: 'PlayerA2' });

    // Create room 2 with host + 1 additional player (2 total)
    const room2Res = await request(app).post('/api/rooms').send({ name: 'HostB' });
    const code2 = room2Res.body.code;
    await request(app).post(`/api/rooms/${code2}/join`).send({ name: 'PlayerB1' });

    const statsAfter = await request(app).get('/api/stats');
    expect(statsAfter.body.totalGames).toBe(gamesBefore + 2);
    // Room 1: 3 players, Room 2: 2 players → net +5
    expect(statsAfter.body.activePlayers).toBe(playersBefore + 5);
  });

  it('activePlayers decreases by room player count when a room is deleted', async () => {
    const app = buildApp();

    // Create a room with host + 2 additional players (3 total)
    const roomRes = await request(app).post('/api/rooms').send({ name: 'HostC' });
    const code = roomRes.body.code;
    await request(app).post(`/api/rooms/${code}/join`).send({ name: 'PlayerC1' });
    await request(app).post(`/api/rooms/${code}/join`).send({ name: 'PlayerC2' });

    const statsBefore = await request(app).get('/api/stats');
    const playersBefore = statsBefore.body.activePlayers;
    const gamesBefore = statsBefore.body.totalGames;

    await request(app).delete(`/api/rooms/${code}`);

    const statsAfter = await request(app).get('/api/stats');
    expect(statsAfter.body.totalGames).toBe(gamesBefore - 1);
    expect(statsAfter.body.activePlayers).toBe(playersBefore - 3);
  });
});
