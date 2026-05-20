'use strict';

// Integration tests for spectator broadcast delivery (issue #381).
// Verifies spectators receive game events via the real WebSocket server.

const WebSocket = require('ws');

function buildServer() {
  jest.resetModules();
  const { server } = require('../server');
  return server;
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: no matching WS message within ${timeoutMs}ms`)),
      timeoutMs
    );
    const handler = (raw) => {
      const msg = JSON.parse(raw);
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function connectWs(server) {
  const { port } = server.address();
  const url = `ws://127.0.0.1:${port}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

describe('Spectator broadcast delivery — WS integration (issue #381)', () => {
  let server;
  let hostWs;
  let spectatorWs;
  let roomCode;

  beforeEach(async () => {
    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;

    spectatorWs = await connectWs(server);
    wsSend(spectatorWs, { type: 'join_as_spectator', code: roomCode });
    await waitForMessage(spectatorWs, (m) => m.type === 'spectator_joined');
  });

  afterEach(async () => {
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.close();
    if (spectatorWs && spectatorWs.readyState === WebSocket.OPEN) spectatorWs.close();
    await new Promise((resolve) => server.close(resolve));
  });

  test('spectator receives timer_tick events during a running game', async () => {
    wsSend(hostWs, { type: 'start_game' });
    const msg = await waitForMessage(spectatorWs, (m) => m.type === 'timer_tick', 4000);
    expect(msg).toHaveProperty('remaining');
    expect(typeof msg.remaining).toBe('number');
  }, 8000);

  test('spectator receives question_end and leaderboard_update at round end', async () => {
    wsSend(hostWs, { type: 'start_game' });
    // Wait until game is active before submitting
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // Register listeners before triggering the event
    const questionEndPromise = waitForMessage(spectatorWs, (m) => m.type === 'question_end', 4000);
    const leaderboardUpdatePromise = waitForMessage(spectatorWs, (m) => m.type === 'leaderboard_update', 4000);

    // Host is the only player — submitting one answer triggers early advance
    wsSend(hostWs, { type: 'submit_answer', answer: 0 });

    const [questionEnd, leaderboardUpdate] = await Promise.all([questionEndPromise, leaderboardUpdatePromise]);
    expect(questionEnd.type).toBe('question_end');
    expect(leaderboardUpdate.type).toBe('leaderboard_update');
  }, 8000);

  test('spectator receives game_over at game end', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // Shrink the question set so the current question (index 0) is the last one
    const { rooms } = require('../src/rooms');
    const room = rooms.get(roomCode);
    room.questions = room.questions.slice(0, 1);

    // Submit answer → early advance → onTimerEnd → 5 s timeout → nextQuestion → game_over
    wsSend(hostWs, { type: 'submit_answer', answer: 0 });

    const msg = await waitForMessage(spectatorWs, (m) => m.type === 'game_over', 8000);
    expect(msg.type).toBe('game_over');
    expect(Array.isArray(msg.leaderboard)).toBe(true);
  }, 12000);
});
