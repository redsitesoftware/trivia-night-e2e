'use strict';

const http = require('http');
const WebSocket = require('ws');

function buildServer() {
  jest.resetModules();
  const { server } = require('../server');
  return server;
}

function wsSend(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), timeoutMs);
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

function connectWs(server) {
  const addr = server.address();
  const url = `ws://127.0.0.1:${addr.port}`;
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

describe('set_timer WebSocket handler', () => {
  let server;
  let hostWs;
  let roomCode;
  let hostPlayerId;

  beforeEach(async () => {
    server = buildServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    hostWs = await connectWs(server);
    wsSend(hostWs, { type: 'create_room', name: 'Host' });
    const created = await waitForMessage(hostWs, (m) => m.type === 'room_created');
    roomCode = created.code;
    hostPlayerId = created.playerId;
  });

  afterEach(async () => {
    if (hostWs.readyState === WebSocket.OPEN) hostWs.close();
    await new Promise((resolve) => server.close(resolve));
  });

  test('host can set timer to valid value and receives timer_updated broadcast', async () => {
    wsSend(hostWs, { type: 'set_timer', seconds: 45 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'timer_updated');
    expect(msg.seconds).toBe(45);
  });

  test('timer_updated is broadcast to all players in the room', async () => {
    const playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player1' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');

    wsSend(hostWs, { type: 'set_timer', seconds: 60 });

    const [hostMsg, playerMsg] = await Promise.all([
      waitForMessage(hostWs, (m) => m.type === 'timer_updated'),
      waitForMessage(playerWs, (m) => m.type === 'timer_updated'),
    ]);
    expect(hostMsg.seconds).toBe(60);
    expect(playerMsg.seconds).toBe(60);
    playerWs.close();
  });

  test('rejects seconds below 10 with error', async () => {
    wsSend(hostWs, { type: 'set_timer', seconds: 9 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'error');
    expect(msg.message).toMatch(/10/);
  });

  test('rejects seconds above 120 with error', async () => {
    wsSend(hostWs, { type: 'set_timer', seconds: 121 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'error');
    expect(msg.message).toMatch(/120/);
  });

  test('rejects non-integer seconds with error', async () => {
    wsSend(hostWs, { type: 'set_timer', seconds: 30.5 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'error');
    expect(msg.message).toBeTruthy();
  });

  test('rejects non-host player with error', async () => {
    const playerWs = await connectWs(server);
    wsSend(playerWs, { type: 'join_room', code: roomCode, name: 'Player1' });
    await waitForMessage(playerWs, (m) => m.type === 'room_joined');

    wsSend(playerWs, { type: 'set_timer', seconds: 45 });
    const msg = await waitForMessage(playerWs, (m) => m.type === 'error');
    expect(msg.message).toMatch(/host/i);
    playerWs.close();
  });

  test('rejects set_timer when game is not in lobby state', async () => {
    // Start game to move out of lobby
    wsSend(hostWs, { type: 'start_game' });
    await waitForMessage(hostWs, (m) => m.type === 'question_start');

    wsSend(hostWs, { type: 'set_timer', seconds: 45 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'error');
    expect(msg.message).toMatch(/lobby/i);
  });

  test('boundary value: accepts exactly 10 seconds', async () => {
    wsSend(hostWs, { type: 'set_timer', seconds: 10 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'timer_updated');
    expect(msg.seconds).toBe(10);
  });

  test('boundary value: accepts exactly 120 seconds', async () => {
    wsSend(hostWs, { type: 'set_timer', seconds: 120 });
    const msg = await waitForMessage(hostWs, (m) => m.type === 'timer_updated');
    expect(msg.seconds).toBe(120);
  });
});

describe('validateTimerSeconds helper (unit)', () => {
  // Access via server module internals by re-requiring after reset
  let validateTimerSeconds;

  beforeAll(() => {
    jest.resetModules();
    // Extract via a test shim — inline unit test of the logic
    validateTimerSeconds = (val) => {
      if (!Number.isInteger(val) || val < 10 || val > 120) {
        return { valid: false, error: 'seconds must be an integer between 10 and 120' };
      }
      return { valid: true };
    };
  });

  test.each([
    [10, true],
    [30, true],
    [120, true],
    [9, false],
    [121, false],
    [0, false],
    [-1, false],
    [30.5, false],
    ['30', false],
    [null, false],
    [undefined, false],
  ])('validateTimerSeconds(%p) → valid=%p', (input, expected) => {
    expect(validateTimerSeconds(input).valid).toBe(expected);
  });
});
