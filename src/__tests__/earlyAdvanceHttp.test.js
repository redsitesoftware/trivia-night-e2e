'use strict';

// Integration tests: HTTP answer endpoint triggers early advance (issue #305)

const request = require('supertest');

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

function mockWs() {
  return {
    readyState: 1,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

/**
 * Create a room, join `extraPlayerCount` additional players, attach mock WebSockets
 * to all players (so broadcast messages are captured), and start the game.
 *
 * Returns { app, rooms, code, room, allTokens, wsMap }
 *   allTokens[0] = hostToken, allTokens[1..] = joined player tokens
 *   wsMap[token]  = mockWs instance for that player
 */
async function setupGame(extraPlayerCount = 1) {
  const app = require('../../server').app;
  const rooms = require('../../src/rooms');

  const createRes = await request(app).post('/api/rooms').send({ name: 'Host' });
  expect(createRes.status).toBe(201);
  const { code, hostToken } = createRes.body;

  const allTokens = [hostToken];
  const wsMap = {};

  const hostWs = mockWs();
  rooms.attachPlayerWs(hostToken, hostWs);
  wsMap[hostToken] = hostWs;

  for (let i = 0; i < extraPlayerCount; i++) {
    const joinRes = await request(app)
      .post(`/api/rooms/${code}/join`)
      .send({ name: `Player${i + 1}` });
    expect(joinRes.status).toBe(200);
    const token = joinRes.body.playerToken;
    const ws = mockWs();
    rooms.attachPlayerWs(token, ws);
    allTokens.push(token);
    wsMap[token] = ws;
  }

  const room = rooms.getRoom(code);
  rooms.startGame(room, () => {}, () => {});

  return { app, rooms, code, room, allTokens, wsMap };
}

describe('POST /api/rooms/:code/answer — early advance (issue #305)', () => {
  it('last HTTP player answer returns 200 with result AND triggers question_end broadcast', async () => {
    // 2 players total: host + 1 extra
    const { app, room, allTokens, wsMap } = await setupGame(1);
    const correctAnswer = room.questions[room.currentQuestion].answer;

    // First player answers — not the last one yet
    const res1 = await request(app)
      .post(`/api/rooms/${room.code}/answer`)
      .send({ playerToken: allTokens[0], answer: correctAnswer });
    expect(res1.status).toBe(200);

    // No question_end yet
    for (const ws of Object.values(wsMap)) {
      expect(ws.messages.some(m => m.type === 'question_end')).toBe(false);
    }

    // Last player answers via HTTP
    const res2 = await request(app)
      .post(`/api/rooms/${room.code}/answer`)
      .send({ playerToken: allTokens[1], answer: correctAnswer });

    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject({ correct: true, correctAnswer });
    expect(typeof res2.body.points).toBe('number');

    // question_end must have been broadcast to all players
    for (const ws of Object.values(wsMap)) {
      expect(ws.messages.some(m => m.type === 'question_end')).toBe(true);
    }
  });

  it('non-final HTTP player answer does NOT trigger early advance', async () => {
    // 3 players total: host + 2 extra
    const { app, room, allTokens, wsMap } = await setupGame(2);
    const correctAnswer = room.questions[room.currentQuestion].answer;

    // Only the first of three players answers
    const res = await request(app)
      .post(`/api/rooms/${room.code}/answer`)
      .send({ playerToken: allTokens[0], answer: correctAnswer });
    expect(res.status).toBe(200);

    // question_end must NOT have been broadcast
    for (const ws of Object.values(wsMap)) {
      expect(ws.messages.some(m => m.type === 'question_end')).toBe(false);
    }
  });

  it('mixed HTTP + simulated-WS answers: early advance fires when all players answered', async () => {
    // 3 players total: host + p1 + p2
    const { app, rooms, room, allTokens, wsMap } = await setupGame(2);
    const correctAnswer = room.questions[room.currentQuestion].answer;

    // host answers via HTTP (1/3)
    await request(app)
      .post(`/api/rooms/${room.code}/answer`)
      .send({ playerToken: allTokens[0], answer: correctAnswer });

    // p1 answers via rooms.submitAnswer directly — simulates the WS code path
    // recording the answer without going through the server WS handler (2/3)
    rooms.submitAnswer(room, allTokens[1], correctAnswer);

    // No question_end yet: p2 hasn't answered and the early-advance logic in the
    // HTTP handler has not been reached for p1's answer
    for (const ws of Object.values(wsMap)) {
      expect(ws.messages.some(m => m.type === 'question_end')).toBe(false);
    }

    // p2 (last) answers via HTTP (3/3) — HTTP handler sees all answered → fires early advance
    const res = await request(app)
      .post(`/api/rooms/${room.code}/answer`)
      .send({ playerToken: allTokens[2], answer: correctAnswer });
    expect(res.status).toBe(200);

    // question_end must now have been broadcast to all players
    for (const ws of Object.values(wsMap)) {
      expect(ws.messages.some(m => m.type === 'question_end')).toBe(true);
    }
  });
});
