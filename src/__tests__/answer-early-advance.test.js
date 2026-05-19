'use strict';

// Tests for HTTP early-advance trigger in the answer endpoint (issue #314).
// Relates to #295 — when the last player submits via POST /api/rooms/:code/answer,
// the room timer must be cancelled and onTimerEnd must fire immediately.

const request = require('supertest');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { app } = require('../../server');
  return app;
}

function getRoomsModule() {
  return require('../../src/rooms');
}

function mockWs() {
  return {
    readyState: 1,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

// Creates a 2-player room wired up in the active-question state with a live timer.
async function setupTwoPlayerRoom(app) {
  const createRes = await request(app).post('/api/rooms').send({ name: 'Host' });
  const { code, hostToken } = createRes.body;

  const joinRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'Player2' });
  const { playerToken: player2Token } = joinRes.body;

  const { getRoom } = getRoomsModule();
  const room = getRoom(code);

  room.state = 'question';
  room.questions = [{ question: 'Q1?', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Test' }];
  room.currentQuestion = 0;
  room.timerStartedAt = Date.now();
  room.answeredThisRound = new Set();
  room.timer = setInterval(() => {}, 999999);

  return { code, hostToken, player2Token, room };
}

describe('POST /api/rooms/:code/answer — early-advance trigger (issue #314)', () => {
  it('timer is NOT cancelled when not all players have answered', async () => {
    const app = buildApp();
    const { code, hostToken, room } = await setupTwoPlayerRoom(app);

    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    expect(room.timer).not.toBeNull();
  });

  it('room.timer is null after the last player answers via HTTP', async () => {
    const app = buildApp();
    const { code, hostToken, player2Token, room } = await setupTwoPlayerRoom(app);

    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: hostToken, answer: 0 });
    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: player2Token, answer: 0 });

    expect(room.timer).toBeNull();
  });

  it('onTimerEnd fires when all players answer: room.state becomes leaderboard', async () => {
    const app = buildApp();
    const { code, hostToken, player2Token, room } = await setupTwoPlayerRoom(app);

    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: hostToken, answer: 0 });
    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: player2Token, answer: 0 });

    expect(room.state).toBe('leaderboard');
  });

  it('response payload still contains correct, points, and correctAnswer', async () => {
    const app = buildApp();
    const { code, hostToken } = await setupTwoPlayerRoom(app);

    const res = await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('correct');
    expect(res.body).toHaveProperty('points');
    expect(res.body).toHaveProperty('correctAnswer');
  });

  it('score-update broadcast fires before early-advance (question_end)', async () => {
    const app = buildApp();
    const { code, hostToken, player2Token, room } = await setupTwoPlayerRoom(app);
    const { attachPlayerWs } = getRoomsModule();

    const hostWs = mockWs();
    const p2Ws = mockWs();
    attachPlayerWs(hostToken, hostWs);
    attachPlayerWs(player2Token, p2Ws);

    // Player 1 answers — no early advance yet
    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    // Player 2 answers — triggers early advance
    await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: player2Token, answer: 0 });

    const types = hostWs.messages.map(m => m.type);
    const lastScoreUpdateIdx = types.lastIndexOf('score-update');
    const firstQuestionEndIdx = types.indexOf('question_end');

    expect(lastScoreUpdateIdx).toBeGreaterThanOrEqual(0);
    expect(firstQuestionEndIdx).toBeGreaterThanOrEqual(0);
    expect(lastScoreUpdateIdx).toBeLessThan(firstQuestionEndIdx);
  });
});
