'use strict';

// Tests for early-advance (all-players-answered) behaviour — issue #309

const request = require('supertest');
const WebSocket = require('ws');

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

function mockWs(readyState = 1) {
  return {
    readyState,
    messages: [],
    send(data) { this.messages.push(JSON.parse(data)); }
  };
}

function makeQuestions() {
  return [{ question: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 0, category: 'Test' }];
}

/** Put a room directly into question state without starting a real timer. */
function armQuestion(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.questions = makeQuestions();
  room.state = 'question';
  room.currentQuestion = 0;
  room.timerStartedAt = Date.now();
  room.answeredThisRound = new Set();
}

// ─────────────────────────────────────────────
// Unit tests (rooms module only)
// ─────────────────────────────────────────────

describe('submitAnswer early-advance — unit', () => {
  let rooms;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    rooms = require('../../src/rooms');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function twoPlayerRoom() {
    const hostWs = mockWs();
    const { room, playerId: host } = rooms.createRoom(hostWs, 'Host');
    const { playerId: p2 } = rooms.joinRoom(room.code, mockWs(), 'P2');
    armQuestion(room);
    room.timer = setInterval(() => {}, 1000); // simulate active timer
    return { room, host, p2 };
  }

  it('clears timer and calls onTimerEnd when all players have answered', () => {
    const { room, host, p2 } = twoPlayerRoom();
    const onTimerEnd = jest.fn();
    const onTimerTick = jest.fn();

    rooms.submitAnswer(room, host, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();

    rooms.submitAnswer(room, p2, 0, onTimerTick, onTimerEnd);
    expect(onTimerEnd).toHaveBeenCalledTimes(1);
    expect(room.timer).toBeNull();
  });

  it('does NOT clear timer when not all players have answered', () => {
    const hostWs = mockWs();
    const { room, playerId: host } = rooms.createRoom(hostWs, 'Host');
    const { playerId: p2 } = rooms.joinRoom(room.code, mockWs(), 'P2');
    rooms.joinRoom(room.code, mockWs(), 'P3');
    armQuestion(room);
    room.timer = setInterval(() => {}, 1000);

    const onTimerEnd = jest.fn();

    rooms.submitAnswer(room, host, 0, jest.fn(), onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();

    rooms.submitAnswer(room, p2, 0, jest.fn(), onTimerEnd);
    expect(onTimerEnd).not.toHaveBeenCalled();
    expect(room.timer).not.toBeNull();
  });

  it('allAnswered is true only on the last answer', () => {
    const { room, host, p2 } = twoPlayerRoom();

    const r1 = rooms.submitAnswer(room, host, 0, jest.fn(), jest.fn());
    expect(r1.allAnswered).toBe(false);

    const r2 = rooms.submitAnswer(room, p2, 0, jest.fn(), jest.fn());
    expect(r2.allAnswered).toBe(true);
  });
});

// ─────────────────────────────────────────────
// HTTP integration — early-advance
// ─────────────────────────────────────────────

describe('HTTP integration — early-advance', () => {
  let app;
  let roomsMod;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    ({ app } = require('../../server'));
    roomsMod = require('../../src/rooms');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('2-player room: last HTTP answer triggers question_end broadcast', async () => {
    const createRes = await request(app).post('/api/rooms').send({ name: 'Host' });
    const { code, hostToken } = createRes.body;

    const joinRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'P2' });
    const { playerToken: p2Token } = joinRes.body;

    // Attach mock WebSockets so broadcast() can deliver messages
    const room = roomsMod.getRoom(code);
    const hostWs = mockWs();
    const p2Ws = mockWs();
    room.players.get(hostToken).ws = hostWs;
    room.players.get(p2Token).ws = p2Ws;

    armQuestion(room);

    // Host answers first — no early-advance yet
    const r1 = await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: hostToken, answer: 0 });
    expect(r1.status).toBe(200);
    expect(hostWs.messages.some(m => m.type === 'question_end')).toBe(false);

    // P2 answers last — early-advance should fire
    const r2 = await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: p2Token, answer: 0 });
    expect(r2.status).toBe(200);
    expect(hostWs.messages.some(m => m.type === 'question_end')).toBe(true);
    expect(p2Ws.messages.some(m => m.type === 'question_end')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// WS integration helpers
// ─────────────────────────────────────────────

function startServer() {
  jest.resetModules();
  const { server } = require('../../server');
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

function closeServer(server, openClients = []) {
  // Close all tracked WS clients first so server.close() resolves promptly
  for (const ws of openClients) {
    try { ws.terminate(); } catch { /* already closed */ }
  }
  return new Promise((resolve) => server.close(resolve));
}

function wsConnect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.collected = [];
    ws.on('message', (data) => ws.collected.push(JSON.parse(data.toString())));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, predicate, timeoutMs = 2000) {
  const existing = ws.collected.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const tid = setTimeout(
      () => reject(new Error(`Timeout. Collected: ${JSON.stringify(ws.collected)}`)),
      timeoutMs
    );
    const handler = () => {
      const found = ws.collected.find(predicate);
      if (found) {
        clearTimeout(tid);
        ws.removeListener('message', handler);
        resolve(found);
      }
    };
    ws.on('message', handler);
  });
}

// ─────────────────────────────────────────────
// WS integration — early-advance
// ─────────────────────────────────────────────

describe('WS integration — early-advance', () => {
  let srv;
  let port;
  let roomsMod;
  let openClients;

  beforeEach(async () => {
    openClients = [];
    srv = await startServer();
    port = srv.address().port;
    roomsMod = require('../../src/rooms');
  });

  afterEach(async () => {
    await closeServer(srv, openClients);
  });

  async function connect(p) {
    const ws = await wsConnect(p);
    openClients.push(ws);
    return ws;
  }

  it('2-player room via WS: last submit_answer triggers question_end for both', async () => {
    const hostWsClient = await connect(port);
    const p2WsClient = await connect(port);

    wsSend(hostWsClient, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWsClient, m => m.type === 'room_created');
    const { code } = created;

    wsSend(p2WsClient, { type: 'join_room', code, name: 'P2' });
    await waitForMessage(p2WsClient, m => m.type === 'room_joined');

    // Arm question state directly (bypass start_game to avoid real timer)
    armQuestion(roomsMod.getRoom(code));

    // Host answers — 1 of 2, no early-advance yet
    wsSend(hostWsClient, { type: 'submit_answer', answer: 0 });
    await new Promise(r => setTimeout(r, 50));
    expect(hostWsClient.collected.some(m => m.type === 'question_end')).toBe(false);

    // P2 answers last — triggers early-advance
    wsSend(p2WsClient, { type: 'submit_answer', answer: 0 });
    await waitForMessage(hostWsClient, m => m.type === 'question_end');
    await waitForMessage(p2WsClient, m => m.type === 'question_end');
  });

  it('mixed path (WS + HTTP): early-advance fires exactly once', async () => {
    const hostWsClient = await connect(port);

    wsSend(hostWsClient, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWsClient, m => m.type === 'room_created');
    const { code } = created;

    // P2 joins via HTTP
    const { app } = require('../../server');
    const joinRes = await request(app).post(`/api/rooms/${code}/join`).send({ name: 'P2' });
    const { playerToken: p2Token } = joinRes.body;

    // Attach a mock WS to P2 so they can receive broadcasts
    const room = roomsMod.getRoom(code);
    const p2Ws = mockWs();
    room.players.get(p2Token).ws = p2Ws;

    armQuestion(room);

    // Host answers via WS
    wsSend(hostWsClient, { type: 'submit_answer', answer: 0 });
    await new Promise(r => setTimeout(r, 50));

    // P2 answers via HTTP — triggers early-advance
    const r2 = await request(app)
      .post(`/api/rooms/${code}/answer`)
      .send({ playerToken: p2Token, answer: 0 });
    expect(r2.status).toBe(200);

    // Both receive question_end
    await waitForMessage(hostWsClient, m => m.type === 'question_end');
    expect(p2Ws.messages.some(m => m.type === 'question_end')).toBe(true);

    // question_end is broadcast exactly once
    const qEndCount = hostWsClient.collected.filter(m => m.type === 'question_end').length;
    expect(qEndCount).toBe(1);
  });
});
