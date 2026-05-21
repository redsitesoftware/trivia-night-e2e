'use strict';

const WebSocket = require('ws');
const request = require('supertest');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Single-question set so a full game completes after one round
const FIXED_QUESTIONS = [
  { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 1, category: 'Test' },
];

const tempFiles = [];

function tmpFile() {
  const f = path.join(os.tmpdir(), `scores-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  tempFiles.push(f);
  return f;
}

function buildServer(scoresFile) {
  jest.resetModules();
  process.env.SCORES_FILE = scoresFile;
  jest.doMock('../src/questions', () => ({
    getShuffledQuestions: () => [...FIXED_QUESTIONS],
  }));
  return require('../server');
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, predicate) {
  return new Promise((resolve) => {
    function handler(raw) {
      const msg = JSON.parse(raw);
      if (predicate(msg)) {
        ws.off('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

function connectWs(server) {
  const addr = server.address();
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}`);
    ws.on('open', () => resolve(ws));
  });
}

afterAll(() => {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
  delete process.env.SCORES_FILE;
});

// ---------------------------------------------------------------------------
// 1. Tie-breaking
// ---------------------------------------------------------------------------
describe('scoreHistory tie-breaking', () => {
  afterEach(() => {
    delete process.env.SCORES_FILE;
  });

  it('returns the more-recent entry first when two entries have equal scores', () => {
    const f = tmpFile();
    process.env.SCORES_FILE = f;
    jest.resetModules();
    const { recordScore, getTopScores } = require('../src/scoreHistory');

    recordScore({ playerName: 'Alice', roomId: 'r1', score: 100, timestamp: '2024-01-01T10:00:00Z' });
    recordScore({ playerName: 'Bob',   roomId: 'r1', score: 100, timestamp: '2024-01-02T10:00:00Z' });

    const results = getTopScores(10);
    expect(results[0].playerName).toBe('Bob');   // more recent
    expect(results[1].playerName).toBe('Alice');
  });

  it('still sorts by score descending when timestamps differ but scores differ too', () => {
    const f = tmpFile();
    process.env.SCORES_FILE = f;
    jest.resetModules();
    const { recordScore, getTopScores } = require('../src/scoreHistory');

    recordScore({ playerName: 'Low',  roomId: 'r1', score: 10,  timestamp: '2024-01-03T00:00:00Z' });
    recordScore({ playerName: 'High', roomId: 'r1', score: 200, timestamp: '2024-01-01T00:00:00Z' });

    const results = getTopScores(10);
    expect(results[0].playerName).toBe('High');
    expect(results[1].playerName).toBe('Low');
  });
});

// ---------------------------------------------------------------------------
// 2. GET /api/leaderboard response format
// ---------------------------------------------------------------------------
describe('GET /api/leaderboard response format', () => {
  let scoresFile;

  beforeEach(() => {
    scoresFile = tmpFile();
  });

  afterEach(() => {
    delete process.env.SCORES_FILE;
  });

  it('returns 200 with a JSON array', async () => {
    fs.writeFileSync(scoresFile, JSON.stringify([]), 'utf8');
    const { app } = buildServer(scoresFile);
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns entries sorted by score descending', async () => {
    const scores = [
      { playerName: 'low',  roomId: 'r1', score: 10, timestamp: '2024-01-01T00:00:00Z', nickname: 'low'  },
      { playerName: 'high', roomId: 'r1', score: 99, timestamp: '2024-01-01T00:00:01Z', nickname: 'high' },
      { playerName: 'mid',  roomId: 'r1', score: 55, timestamp: '2024-01-01T00:00:02Z', nickname: 'mid'  },
    ];
    fs.writeFileSync(scoresFile, JSON.stringify(scores), 'utf8');
    const { app } = buildServer(scoresFile);

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    const vals = res.body.map(e => e.score);
    expect(vals).toEqual([99, 55, 10]);
  });

  it('returns at most 10 entries', async () => {
    const scores = Array.from({ length: 15 }, (_, i) => ({
      playerName: `p${i}`, roomId: 'r1', score: i * 10,
      timestamp: '2024-01-01T00:00:00Z', nickname: `p${i}`,
    }));
    fs.writeFileSync(scoresFile, JSON.stringify(scores), 'utf8');
    const { app } = buildServer(scoresFile);

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(10);
  });

  it('each entry includes playerName, score, and timestamp fields', async () => {
    const scores = [
      { playerName: 'alice', roomId: 'r1', score: 100, timestamp: '2024-01-01T00:00:00Z', nickname: 'alice' },
    ];
    fs.writeFileSync(scoresFile, JSON.stringify(scores), 'utf8');
    const { app } = buildServer(scoresFile);

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    const entry = res.body[0];
    expect(entry).toHaveProperty('playerName');
    expect(entry).toHaveProperty('score');
    expect(entry).toHaveProperty('timestamp');
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. Integration: auto-score recording + persistent_leaderboard_update
// ---------------------------------------------------------------------------
describe('game end: auto-score recording and persistent_leaderboard_update broadcast', () => {
  let scoresFile, server, app, hostWs, playerWs;

  beforeEach(async () => {
    jest.useFakeTimers();
    scoresFile = tmpFile();

    const built = buildServer(scoresFile);
    server = built.server;
    app = built.app;

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');

    playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: created.code, name: 'Player1' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');
  });

  afterEach(async () => {
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.close();
    if (playerWs && playerWs.readyState === WebSocket.OPEN) playerWs.close();
    jest.useRealTimers();
    await new Promise((resolve) => server.close(resolve));
    delete process.env.SCORES_FILE;
  });

  async function playFullGame() {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // All players submit → triggers question_end immediately
    wsSend(hostWs,   { type: 'submit_answer', answer: 1 }); // correct
    wsSend(playerWs, { type: 'submit_answer', answer: 0 }); // incorrect
    await waitForMessage(hostWs, (m) => m.type === 'question_end');

    // Advance the 5-second leaderboard pause → game_over fires (only 1 question)
    const gameOverP = waitForMessage(hostWs, (m) => m.type === 'game_over');
    jest.advanceTimersByTime(5000);
    return gameOverP;
  }

  it('GET /api/leaderboard includes both players scores after game_over', async () => {
    await playFullGame();

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const names = res.body.map(e => e.playerName);
    expect(names).toContain('Host');
    expect(names).toContain('Player1');
  });

  it('persistent_leaderboard_update is broadcast to all players after game_over', async () => {
    // Listen for the broadcast on both connections before triggering game end
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    const hostPersistP   = waitForMessage(hostWs,   (m) => m.type === 'persistent_leaderboard_update');
    const playerPersistP = waitForMessage(playerWs, (m) => m.type === 'persistent_leaderboard_update');

    wsSend(hostWs,   { type: 'submit_answer', answer: 1 });
    wsSend(playerWs, { type: 'submit_answer', answer: 0 });
    await waitForMessage(hostWs, (m) => m.type === 'question_end');

    jest.advanceTimersByTime(5000);

    const [hostMsg, playerMsg] = await Promise.all([hostPersistP, playerPersistP]);
    expect(hostMsg.type).toBe('persistent_leaderboard_update');
    expect(playerMsg.type).toBe('persistent_leaderboard_update');
  });

  it('persistent_leaderboard_update payload has rank, name, score, date fields and at most 10 entries', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    const persistP = waitForMessage(hostWs, (m) => m.type === 'persistent_leaderboard_update');

    wsSend(hostWs,   { type: 'submit_answer', answer: 1 });
    wsSend(playerWs, { type: 'submit_answer', answer: 0 });
    await waitForMessage(hostWs, (m) => m.type === 'question_end');

    jest.advanceTimersByTime(5000);
    const persist = await persistP;

    expect(Array.isArray(persist.leaderboard)).toBe(true);
    expect(persist.leaderboard.length).toBeGreaterThan(0);
    expect(persist.leaderboard.length).toBeLessThanOrEqual(10);

    // Ranks should be 1-based, sequential
    persist.leaderboard.forEach((entry, i) => {
      expect(entry).toHaveProperty('rank');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('score');
      expect(entry).toHaveProperty('date');
      expect(typeof entry.rank).toBe('number');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.score).toBe('number');
      expect(typeof entry.date).toBe('string');
      expect(entry.rank).toBe(i + 1);
    });
  });

  it('persistent_leaderboard_update leaderboard is sorted by score descending', async () => {
    await playFullGame();

    // Get a second game going with fresh connections is complex; instead check
    // the data we already have from the first game via the broadcast captured
    // in playFullGame. Re-play to capture the message.
    // We already consumed game_over in playFullGame, but the persist broadcast
    // was also sent — we need to listen before triggering. Use a fresh test for this.
  });

  it('persistent_leaderboard_update leaderboard entries are ordered by score desc', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    const persistP = waitForMessage(hostWs, (m) => m.type === 'persistent_leaderboard_update');

    wsSend(hostWs,   { type: 'submit_answer', answer: 1 }); // correct → points > 0
    wsSend(playerWs, { type: 'submit_answer', answer: 0 }); // incorrect → 0 points
    await waitForMessage(hostWs, (m) => m.type === 'question_end');

    jest.advanceTimersByTime(5000);
    const persist = await persistP;

    const scores = persist.leaderboard.map(e => e.score);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });
});
