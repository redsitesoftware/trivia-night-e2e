/**
 * Tests for issues #132, #133, #134, #135:
 *  - recordScore parameter fix (playerName/roomId/timestamp)
 *  - nickname field in player model (joinRoom/joinRoomHttp)
 *  - nickname in getLeaderboard entries
 *  - nickname forwarded through recordScore call
 */

beforeEach(() => {
  jest.resetModules();
});

function getRoomsModule() {
  return require('../rooms');
}

function getScoreHistoryModule() {
  return require('../scoreHistory');
}

// ── joinRoom / joinRoomHttp ──────────────────────────────────────────────────

describe('joinRoom nickname support (#133)', () => {
  it('stores nickname on the player object when provided', () => {
    const { createRoomHttp, joinRoomHttp } = getRoomsModule();
    const { room } = createRoomHttp('Host');
    const { playerId } = joinRoomHttp(room.code, 'Alice', 'AliasA');
    const player = room.players.get(playerId);
    expect(player.nickname).toBe('AliasA');
  });

  it('stores undefined nickname when not provided', () => {
    const { createRoomHttp, joinRoomHttp } = getRoomsModule();
    const { room } = createRoomHttp('Host');
    const { playerId } = joinRoomHttp(room.code, 'Bob');
    const player = room.players.get(playerId);
    expect(player.nickname).toBeUndefined();
  });

  it('existing callers without nickname still work', () => {
    const { createRoomHttp, joinRoomHttp } = getRoomsModule();
    const { room } = createRoomHttp('Host');
    const result = joinRoomHttp(room.code, 'Charlie');
    expect(result.error).toBeUndefined();
    expect(result.playerId).toBeDefined();
  });
});

// ── getLeaderboard ───────────────────────────────────────────────────────────

describe('getLeaderboard nickname inclusion (#134)', () => {
  it('includes nickname in each leaderboard entry', () => {
    const { createRoomHttp, joinRoomHttp, getLeaderboard } = getRoomsModule();
    const { room } = createRoomHttp('Host');
    const { playerId } = joinRoomHttp(room.code, 'Alice', 'AliasA');
    room.players.get(playerId).score = 50;

    const board = getLeaderboard(room);
    expect(board[0]).toHaveProperty('nickname', 'AliasA');
  });

  it('allows undefined nickname in leaderboard entry without error', () => {
    const { createRoomHttp, joinRoomHttp, getLeaderboard } = getRoomsModule();
    const { room } = createRoomHttp('Host');
    joinRoomHttp(room.code, 'Bob');

    const board = getLeaderboard(room);
    expect(board[0]).toHaveProperty('nickname', undefined);
  });
});

// ── recordScore parameter correctness (#132) ─────────────────────────────────

describe('recordScore parameters (#132)', () => {
  it('stores playerName, roomId, score, and timestamp correctly', () => {
    const { recordScore, getTopScores } = getScoreHistoryModule();
    const ts = new Date().toISOString();
    recordScore({ playerName: 'Alice', roomId: 'ROOM1', score: 99, timestamp: ts });

    const scores = getTopScores(1);
    expect(scores[0]).toMatchObject({ playerName: 'Alice', roomId: 'ROOM1', score: 99, timestamp: ts });
  });

  it('falls back to current time when timestamp is omitted', () => {
    const { recordScore, getTopScores } = getScoreHistoryModule();
    recordScore({ playerName: 'Bob', roomId: 'ROOM2', score: 10 });
    const scores = getTopScores(1);
    expect(scores[0].timestamp).toBeTruthy();
  });
});

// ── recordScore nickname forwarding (#135) ───────────────────────────────────

describe('recordScore stores nickname (#135)', () => {
  it('persists nickname in score history when provided', () => {
    const { recordScore, getTopScores } = getScoreHistoryModule();
    recordScore({ playerName: 'Alice', nickname: 'AliasA', roomId: 'R1', score: 42, timestamp: new Date().toISOString() });
    const scores = getTopScores(1);
    expect(scores[0]).toHaveProperty('nickname', 'AliasA');
  });

  it('stores undefined nickname gracefully when omitted', () => {
    const { recordScore, getTopScores } = getScoreHistoryModule();
    recordScore({ playerName: 'Bob', roomId: 'R2', score: 10, timestamp: new Date().toISOString() });
    const scores = getTopScores(1);
    expect(scores[0].nickname).toBeUndefined();
  });
});
