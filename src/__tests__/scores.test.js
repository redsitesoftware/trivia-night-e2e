const request = require('supertest');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

describe('POST /api/scores — nickname support', () => {
  it('echoes provided nickname in response and returns 200', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/scores').send({
      playerId: 'player-1',
      score: 50,
      roomId: 'ROOM1',
      nickname: 'AcePilot'
    });
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('AcePilot');
    expect(res.body.recorded).toBe(true);
  });

  it('falls back to playerId as nickname when nickname is absent and returns 200', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/scores').send({
      playerId: 'player-2',
      score: 30,
      roomId: 'ROOM1'
    });
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('player-2');
    expect(res.body.recorded).toBe(true);
  });

  it('returns 400 when nickname is not a string', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/scores').send({
      playerId: 'player-3',
      score: 20,
      roomId: 'ROOM1',
      nickname: 42
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('leaderboard entry includes nickname after recording with nickname', async () => {
    const app = buildApp();

    await request(app).post('/api/scores').send({
      playerId: 'player-4',
      score: 99,
      roomId: 'ROOM2',
      nickname: 'TopGun'
    });

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    const entry = res.body.find(e => e.playerName === 'player-4');
    expect(entry).toBeDefined();
    expect(entry.nickname).toBe('TopGun');
  });
});
