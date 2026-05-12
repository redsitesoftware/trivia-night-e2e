'use strict';

const { QUESTIONS } = require('./questions');

const QUESTION_TIME = 30; // seconds per question

/**
 * Shuffle an array (Fisher-Yates).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Compute leaderboard from players Map.
 * @param {Map<string, {name: string, score: number}>} players
 * @returns {Array<{name: string, score: number}>}
 */
function computeLeaderboard(players) {
  return [...players.values()]
    .map(({ name, score }) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Start a game for a room.
 * Broadcasts WebSocket events: question_start, timer_tick, question_end, leaderboard_update.
 *
 * @param {import('./types').Room} room
 * @param {(event: string, payload: object) => void} broadcast - send to all room clients
 * @returns {void}
 */
function startGame(room, broadcast) {
  if (room.state !== 'waiting') return;

  const questions = shuffle(QUESTIONS);
  room.state = 'in-progress';

  const gameState = {
    questions,
    currentIndex: 0,
    answeredPlayers: new Set(),
    remainingSeconds: QUESTION_TIME,
    timer: null,
  };

  room.game = gameState;

  runQuestion(room, broadcast);
}

/**
 * Run the current question in the game.
 * @param {import('./types').Room} room
 * @param {(event: string, payload: object) => void} broadcast
 */
function runQuestion(room, broadcast) {
  const { game } = room;
  if (!game) return;

  const question = game.questions[game.currentIndex];

  // Send only safe fields to clients (no answerIndex)
  broadcast('question_start', {
    questionNumber: game.currentIndex + 1,
    total: game.questions.length,
    id: question.id,
    text: question.text,
    options: question.options,
    category: question.category,
    timeSeconds: QUESTION_TIME,
  });

  game.answeredPlayers = new Set();
  game.remainingSeconds = QUESTION_TIME;

  game.timer = setInterval(() => {
    game.remainingSeconds -= 1;

    broadcast('timer_tick', { remainingSeconds: game.remainingSeconds });

    if (game.remainingSeconds <= 0) {
      endQuestion(room, broadcast);
    }
  }, 1000);
}

/**
 * End the current question, compute scores and leaderboard, then advance.
 * @param {import('./types').Room} room
 * @param {(event: string, payload: object) => void} broadcast
 */
function endQuestion(room, broadcast) {
  const { game } = room;
  if (!game) return;

  clearInterval(game.timer);
  game.timer = null;

  const question = game.questions[game.currentIndex];

  broadcast('question_end', {
    questionNumber: game.currentIndex + 1,
    correctAnswerIndex: question.answerIndex,
    correctAnswer: question.options[question.answerIndex],
  });

  const leaderboard = computeLeaderboard(room.players);
  broadcast('leaderboard_update', { leaderboard });

  game.currentIndex += 1;

  if (game.currentIndex < game.questions.length) {
    // Short pause before next question
    setTimeout(() => runQuestion(room, broadcast), 3000);
  } else {
    room.state = 'finished';
    broadcast('game_over', { leaderboard });
  }
}

/**
 * Submit an answer for a player.
 * @param {import('./types').Room} room
 * @param {string} playerToken
 * @param {number} answerIndex
 * @param {(event: string, payload: object) => void} broadcast
 * @returns {{ error: string } | { correct: boolean, score: number }}
 */
function submitAnswer(room, playerToken, answerIndex, broadcast) {
  if (room.state !== 'in-progress') return { error: 'No game in progress' };

  const { game } = room;
  if (!game) return { error: 'No game in progress' };

  const player = room.players.get(playerToken);
  if (!player) return { error: 'Player not found' };

  if (game.answeredPlayers.has(playerToken)) {
    return { error: 'Already answered' };
  }

  game.answeredPlayers.add(playerToken);

  const question = game.questions[game.currentIndex];
  const correct = answerIndex === question.answerIndex;

  if (correct) {
    const points = Math.round(1000 * game.remainingSeconds / QUESTION_TIME);
    player.score += points;
  }

  // Auto-advance when all players have answered
  if (game.answeredPlayers.size >= room.players.size) {
    endQuestion(room, broadcast);
  }

  const leaderboard = computeLeaderboard(room.players);
  broadcast('leaderboard_update', { leaderboard });

  return { correct, score: player.score };
}

module.exports = { startGame, submitAnswer, computeLeaderboard };
