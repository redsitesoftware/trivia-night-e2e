'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// ---- rooms ----
const { createRoom, joinRoom, getRoom, rooms } = require('./rooms');

describe('rooms', () => {
  it('createRoom returns a 6-char code and a hostToken', () => {
    const { code, hostToken } = createRoom();
    assert.equal(code.length, 6);
    assert.ok(hostToken);
    rooms.delete(code); // cleanup
  });

  it('joinRoom adds player and returns playerToken', () => {
    const { code } = createRoom();
    const result = joinRoom(code, 'Alice');
    assert.ok(result.playerToken);
    assert.equal(getRoom(code).players.size, 1);
    rooms.delete(code);
  });

  it('joinRoom returns error for unknown room', () => {
    const result = joinRoom('ZZZZZZ', 'Bob');
    assert.equal(result.error, 'Room not found');
  });

  it('joinRoom rejects more than 8 players', () => {
    const { code } = createRoom();
    for (let i = 0; i < 8; i++) joinRoom(code, `Player${i}`);
    const result = joinRoom(code, 'Extra');
    assert.equal(result.error, 'Room is full');
    rooms.delete(code);
  });
});

// ---- questions ----
const { QUESTIONS } = require('./questions');

describe('questions', () => {
  it('has at least 10 questions', () => {
    assert.ok(QUESTIONS.length >= 10);
  });

  it('each question has required fields', () => {
    for (const q of QUESTIONS) {
      assert.ok(q.text, `question ${q.id} missing text`);
      assert.equal(q.options.length, 4, `question ${q.id} must have 4 options`);
      assert.ok(q.answerIndex >= 0 && q.answerIndex <= 3, `question ${q.id} invalid answerIndex`);
      assert.ok(q.category, `question ${q.id} missing category`);
    }
  });

  it('has at least 2 categories', () => {
    const categories = new Set(QUESTIONS.map(q => q.category));
    assert.ok(categories.size >= 2);
  });
});

// ---- game ----
const { computeLeaderboard, submitAnswer } = require('./game');

describe('game', () => {
  it('computeLeaderboard sorts by score descending', () => {
    const players = new Map([
      ['t1', { name: 'Alice', score: 500 }],
      ['t2', { name: 'Bob', score: 900 }],
      ['t3', { name: 'Carol', score: 200 }],
    ]);
    const lb = computeLeaderboard(players);
    assert.equal(lb[0].name, 'Bob');
    assert.equal(lb[1].name, 'Alice');
    assert.equal(lb[2].name, 'Carol');
  });

  it('submitAnswer returns error when no game in progress', () => {
    const { code } = createRoom();
    const room = getRoom(code);
    const result = submitAnswer(room, 'tok', 0, () => {});
    assert.equal(result.error, 'No game in progress');
    rooms.delete(code);
  });

  it('submitAnswer returns error for unknown player', () => {
    const { code } = createRoom();
    const room = getRoom(code);
    room.state = 'in-progress';
    room.game = { questions: [{ id: 1, text: 'Q', options: ['A','B','C','D'], answerIndex: 0, category: 'X' }], currentIndex: 0, answeredPlayers: new Set(), remainingSeconds: 20, timer: null };
    const result = submitAnswer(room, 'unknown', 0, () => {});
    assert.equal(result.error, 'Player not found');
    rooms.delete(code);
  });

  it('correct answer awards points based on remaining time', () => {
    const { code } = createRoom();
    joinRoom(code, 'Dan');
    const room = getRoom(code);
    const [playerToken] = [...room.players.keys()];
    room.state = 'in-progress';
    room.game = { questions: [{ id: 1, text: 'Q', options: ['A','B','C','D'], answerIndex: 2, category: 'X' }], currentIndex: 0, answeredPlayers: new Set(), remainingSeconds: 15, timer: null };
    const result = submitAnswer(room, playerToken, 2, () => {});
    assert.equal(result.correct, true);
    // Math.round(1000 * 15 / 30) = 500
    assert.equal(result.score, 500);
    rooms.delete(code);
  });

  it('wrong answer awards no points', () => {
    const { code } = createRoom();
    joinRoom(code, 'Eve');
    const room = getRoom(code);
    const [playerToken] = [...room.players.keys()];
    room.state = 'in-progress';
    room.game = { questions: [{ id: 1, text: 'Q', options: ['A','B','C','D'], answerIndex: 0, category: 'X' }], currentIndex: 0, answeredPlayers: new Set(), remainingSeconds: 20, timer: null };
    const result = submitAnswer(room, playerToken, 3, () => {});
    assert.equal(result.correct, false);
    assert.equal(result.score, 0);
    rooms.delete(code);
  });
});
