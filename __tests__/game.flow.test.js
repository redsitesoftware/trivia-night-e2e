'use strict';

const WebSocket = require('ws');

// Fixed question set so correct/incorrect answers are deterministic
const FIXED_QUESTIONS = [
  { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 1, category: 'Test' },
  { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 2, category: 'Test' },
  { id: 3, question: 'Q3', options: ['A', 'B', 'C', 'D'], answer: 2, category: 'Test' },
];

function buildServer() {
  jest.resetModules();
  jest.doMock('../src/questions', () => ({
    getShuffledQuestions: () => [...FIXED_QUESTIONS],
  }));
  const { server } = require('../server');
  return server;
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

// No built-in timeout — compatible with jest.useFakeTimers(); Jest test timeout guards against hangs
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
  const url = `ws://127.0.0.1:${addr.port}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

describe('WebSocket game engine full-flow integration', () => {
  let server, hostWs, playerWs;
  let roomCode;

  beforeEach(async () => {
    jest.useFakeTimers();

    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;

    playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player1' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');
  });

  afterEach(async () => {
    if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.close();
    if (playerWs && playerWs.readyState === WebSocket.OPEN) playerWs.close();
    jest.useRealTimers();
    await new Promise((resolve) => server.close(resolve));
  });

  test('non-host player sending start_game receives an error', async () => {
    wsSend(playerWs, { type: 'start_game' });
    const err = await waitForMessage(playerWs, (m) => m.type === 'error');
    expect(err.message).toMatch(/host/i);
  });

  test('start_game triggers question_start broadcast to all players', async () => {
    // Set up listeners before triggering start_game
    const hostQ = waitForMessage(hostWs, (m) => m.type === 'question_start');
    const playerQ = waitForMessage(playerWs, (m) => m.type === 'question_start');

    wsSend(hostWs, { type: 'start_game' });

    const [qHost, qPlayer] = await Promise.all([hostQ, playerQ]);

    expect(qHost).toMatchObject({
      type: 'question_start',
      question: 'Q1',
      options: ['A', 'B', 'C', 'D'],
      index: 0,
      total: 3,
      timeLimit: 30,
    });
    expect(qPlayer.type).toBe('question_start');
    expect(qPlayer.index).toBe(0);
  });

  test('timer_tick events broadcast each second with { remaining }', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // Set up listeners before advancing fake timers
    const hostTick = waitForMessage(hostWs, (m) => m.type === 'timer_tick');
    const playerTick = waitForMessage(playerWs, (m) => m.type === 'timer_tick');

    jest.advanceTimersByTime(1000);

    const [tickHost, tickPlayer] = await Promise.all([hostTick, playerTick]);
    expect(tickHost).toMatchObject({ type: 'timer_tick', remaining: 29 });
    expect(tickPlayer).toMatchObject({ type: 'timer_tick', remaining: 29 });
  });

  test('submit_answer (correct) returns answer_result with correct:true and positive points; broadcasts score-update', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // Set up listeners before submitting
    const answerResultP = waitForMessage(hostWs, (m) => m.type === 'answer_result');
    const scoreUpdateP = waitForMessage(playerWs, (m) => m.type === 'score-update');

    wsSend(hostWs, { type: 'submit_answer', answer: 1 }); // Q1 correct answer is 1

    const answerResult = await answerResultP;
    expect(answerResult.correct).toBe(true);
    expect(answerResult.points).toBeGreaterThan(0);

    const scoreUpdate = await scoreUpdateP;
    expect(Array.isArray(scoreUpdate.leaderboard)).toBe(true);
  });

  test('submit_answer (incorrect) returns answer_result with correct:false, points:0; broadcasts score-update', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    const answerResultP = waitForMessage(playerWs, (m) => m.type === 'answer_result');
    const scoreUpdateP = waitForMessage(hostWs, (m) => m.type === 'score-update');

    wsSend(playerWs, { type: 'submit_answer', answer: 0 }); // Q1 correct is 1, so 0 is wrong

    const answerResult = await answerResultP;
    expect(answerResult.correct).toBe(false);
    expect(answerResult.points).toBe(0);

    const scoreUpdate = await scoreUpdateP;
    expect(Array.isArray(scoreUpdate.leaderboard)).toBe(true);
  });

  test('when all players submit, question_end (with correctAnswer + leaderboard) and leaderboard_update are broadcast immediately; timer is cleared', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // Set up listeners for all expected messages before submitting
    const questionEndP = waitForMessage(hostWs, (m) => m.type === 'question_end');
    const lbUpdateP = waitForMessage(playerWs, (m) => m.type === 'leaderboard_update');

    wsSend(hostWs, { type: 'submit_answer', answer: 1 }); // correct
    wsSend(playerWs, { type: 'submit_answer', answer: 0 }); // incorrect

    const questionEnd = await questionEndP;
    expect(questionEnd.correctAnswer).toBe(1);
    expect(Array.isArray(questionEnd.leaderboard)).toBe(true);

    const lbUpdate = await lbUpdateP;
    expect(Array.isArray(lbUpdate.leaderboard)).toBe(true);

    // Verify the room timer was cleared after early advance
    const { rooms } = require('../src/rooms');
    const room = rooms.get(roomCode);
    expect(room.timer).toBeNull();
  });

  test('after the 5-second leaderboard pause, the next question_start is broadcast automatically', async () => {
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    // Both players submit to trigger question_end
    wsSend(hostWs, { type: 'submit_answer', answer: 1 });
    wsSend(playerWs, { type: 'submit_answer', answer: 0 });
    await waitForMessage(hostWs, (m) => m.type === 'question_end');

    // Set up listener before advancing fake timers
    const nextQStartP = waitForMessage(hostWs, (m) => m.type === 'question_start');
    jest.advanceTimersByTime(5000);

    const q2 = await nextQStartP;
    expect(q2.index).toBe(1);
    expect(q2.total).toBe(3);
  });

  test('after all questions are exhausted, game_over is broadcast with the final leaderboard', async () => {
    wsSend(hostWs, { type: 'start_game' });

    // Wait for the first question_start before the loop; subsequent
    // question_starts are awaited at the end of each non-final iteration to
    // avoid double-consuming the same message.
    await waitForMessage(hostWs, (m) => m.type === 'question_start' && m.index === 0);

    for (let i = 0; i < 3; i++) {
      wsSend(hostWs, { type: 'submit_answer', answer: 1 });
      wsSend(playerWs, { type: 'submit_answer', answer: 1 });
      await waitForMessage(hostWs, (m) => m.type === 'question_end');

      if (i < 2) {
        const nextQP = waitForMessage(hostWs, (m) => m.type === 'question_start' && m.index === i + 1);
        jest.advanceTimersByTime(5000);
        await nextQP;
      }
    }

    // After the last question_end, advance 5s → game_over
    const gameOverP = waitForMessage(hostWs, (m) => m.type === 'game_over');
    jest.advanceTimersByTime(5000);

    const gameOver = await gameOverP;
    expect(Array.isArray(gameOver.leaderboard)).toBe(true);
    expect(gameOver.leaderboard.length).toBe(2);
    for (const entry of gameOver.leaderboard) {
      expect(typeof entry.rank).toBe('number');
      expect(typeof entry.score).toBe('number');
    }
  }, 30_000);
});
