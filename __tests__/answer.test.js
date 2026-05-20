'use strict';

const WebSocket = require('ws');
const request = require('supertest');

// Mock questions so answer index 0 is always correct and timing is deterministic
jest.mock('../src/questions', () => ({
  getShuffledQuestions: (n) =>
    Array.from({ length: n }, (_, i) => ({
      question: `Q${i}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 0,
      category: 'General'
    }))
}));

function buildServer() {
  jest.resetModules();
  const { server } = require('../server');
  return server;
}

function connectWs(server) {
  const { port } = server.address();
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
  });
}

function waitForMessage(ws, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for WS message')),
      timeoutMs
    );
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw);
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    });
  });
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

describe('POST /api/rooms/:code/answer', () => {
  let server, hostWs, playerWs, roomCode, hostToken, playerToken;

  beforeEach(async () => {
    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    // Create room and join second player via WS (real timers still active here)
    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;
    hostToken = created.playerId;

    playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player' });
    const joined = await waitForMessage(playerWs, (m) => m.type === 'room_joined');
    playerToken = joined.playerId;

    // Freeze timers before starting the game so the interval never fires
    jest.useFakeTimers();

    // Register question_start listeners before the HTTP call to avoid the race
    const hostQStartP = waitForMessage(hostWs, (m) => m.type === 'question_start');
    const playerQStartP = waitForMessage(playerWs, (m) => m.type === 'question_start');

    await request(server)
      .post(`/api/rooms/${roomCode}/start`)
      .send({ hostToken });

    await Promise.all([hostQStartP, playerQStartP]);
  });

  afterEach(async () => {
    const { deleteRoom } = require('../src/rooms');
    deleteRoom(roomCode);
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.close();
    if (playerWs && playerWs.readyState === WebSocket.OPEN) playerWs.close();
    await new Promise((resolve) => server.close(resolve));
    jest.useRealTimers();
  });

  test('correct answer returns correct: true and points > 0', async () => {
    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.points).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('correctAnswer', 0);
  });

  test('incorrect answer returns correct: false and points: 0', async () => {
    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 1 }); // 1 is wrong; correct is 0

    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.points).toBe(0);
    expect(res.body).toHaveProperty('correctAnswer', 0);
  });

  test('score-update is broadcast to all connected players after each answer', async () => {
    const hostUpdateP = waitForMessage(hostWs, (m) => m.type === 'score-update');
    const playerUpdateP = waitForMessage(playerWs, (m) => m.type === 'score-update');

    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    expect(res.status).toBe(200);

    const [hostUpdate, playerUpdate] = await Promise.all([hostUpdateP, playerUpdateP]);
    expect(Array.isArray(hostUpdate.leaderboard)).toBe(true);
    expect(Array.isArray(playerUpdate.leaderboard)).toBe(true);
  });

  test('returns 400 with { error: "Already answered" } on duplicate submission', async () => {
    await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Already answered' });
  });

  test('returns 400 when playerToken is missing', async () => {
    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ answer: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 when answer field is missing', async () => {
    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('last player answer triggers question_end and leaderboard_update broadcasts (early-end)', async () => {
    // Host submits first — not all players have answered yet
    const firstScoreUpdateP = waitForMessage(hostWs, (m) => m.type === 'score-update');
    await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken: hostToken, answer: 0 });
    await firstScoreUpdateP;

    // Register listeners for all three broadcasts from the final submission
    // before sending the HTTP request to avoid any race
    const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');
    const leaderboardUpdateP = waitForMessage(hostWs, (m) => m.type === 'leaderboard_update');
    const lastScoreUpdateP = waitForMessage(hostWs, (m) => m.type === 'score-update');

    // Player 2 is the last to answer — triggers early-end
    const res = await request(server)
      .post(`/api/rooms/${roomCode}/answer`)
      .send({ playerToken, answer: 0 });

    expect(res.status).toBe(200);

    const [questionEnd, leaderboardUpdate] = await Promise.all([
      questionEndP,
      leaderboardUpdateP,
      lastScoreUpdateP
    ]);

    expect(questionEnd).toHaveProperty('correctAnswer', 0);
    expect(Array.isArray(questionEnd.leaderboard)).toBe(true);
    expect(Array.isArray(leaderboardUpdate.leaderboard)).toBe(true);
  });
});
