const { v4: uuidv4 } = require('uuid');
const { getShuffledQuestions } = require('./questions');
const { recordScore } = require('./scoreHistory');

const MAX_PLAYERS = 8;
const QUESTION_TIME_SECS = 30;
const rooms = new Map();

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateJoinCode() : code;
}

function createRoom(hostWs, hostName) {
  const code = generateJoinCode();
  const hostId = uuidv4();
  const room = {
    code,
    hostId,
    state: 'lobby',
    players: new Map([[hostId, { id: hostId, name: hostName, score: 0, ws: hostWs }]]),
    questions: [],
    currentQuestion: -1,
    timer: null,
    timerStartedAt: null,
    answeredThisRound: new Set(),
    spectatorModeEnabled: true,
    spectators: new Map()
  };
  rooms.set(code, room);
  return { room, playerId: hostId };
}

/**
 * HTTP-friendly variant: creates a room without requiring a WebSocket connection.
 * The host WebSocket can be attached later via attachPlayerWs().
 */
function createRoomHttp(hostName) {
  return createRoom(null, hostName);
}

function joinRoom(code, ws, playerName, nickname) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'lobby') return { error: 'Game already in progress' };
  if (room.players.size >= MAX_PLAYERS) return { error: 'Room is full' };

  const playerId = uuidv4();
  room.players.set(playerId, { id: playerId, name: playerName, nickname, score: 0, ws });
  return { room, playerId };
}

/**
 * HTTP-friendly variant: joins a room without requiring a WebSocket connection.
 * The player WebSocket can be attached later via attachPlayerWs().
 */
function joinRoomHttp(code, playerName, nickname) {
  return joinRoom(code, null, playerName, nickname);
}

/**
 * Attach (or update) the WebSocket for an existing player in a room.
 */
function attachPlayerWs(playerId, ws) {
  for (const room of rooms.values()) {
    const player = room.players.get(playerId);
    if (player) {
      player.ws = ws;
      return room;
    }
  }
  return null;
}

function getRoom(code) {
  return rooms.get(code.toUpperCase()) || null;
}

function getRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function getLeaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.name, nickname: p.nickname, score: p.score, id: p.id }));
}

function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const player of room.players.values()) {
    if (player.ws && player.ws.readyState === 1) {
      player.ws.send(data);
    }
  }
}

function nextQuestion(room, onTimerTick, onTimerEnd) {
  if (room.timer) clearInterval(room.timer);
  room.currentQuestion++;

  if (room.currentQuestion >= room.questions.length) {
    room.state = 'finished';
    const leaderboard = getLeaderboard(room);
    const finishedAt = new Date().toISOString();
    for (const entry of leaderboard) {
      recordScore({ playerName: entry.name, nickname: entry.nickname, roomId: room.code, score: entry.score, timestamp: finishedAt });
    }
    broadcast(room, { type: 'game_over', leaderboard });
    return;
  }

  const q = room.questions[room.currentQuestion];
  room.timerStartedAt = Date.now();
  room.answeredThisRound = new Set();

  const timeSecs = room.questionTimeSecs ?? QUESTION_TIME_SECS;
  broadcast(room, {
    type: 'question_start',
    index: room.currentQuestion,
    total: room.questions.length,
    question: q.question,
    options: q.options,
    category: q.category,
    timeLimit: timeSecs
  });

  let remaining = timeSecs;
  room.timer = setInterval(() => {
    remaining--;
    onTimerTick(room, remaining);
    if (remaining <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      room.state = 'leaderboard';
      onTimerEnd(room, onTimerTick, onTimerEnd);
    }
  }, 1000);
}

function startGame(room, onTimerTick, onTimerEnd) {
  if (room.state !== 'lobby') return false;
  room.questions = getShuffledQuestions(10);
  room.currentQuestion = -1;
  room.state = 'question';
  nextQuestion(room, onTimerTick, onTimerEnd);
  return true;
}

function submitAnswer(room, playerId, answerIndex, onTimerTick, onTimerEnd) {
  if (room.state !== 'question') return { error: 'No active question' };
  if (room.answeredThisRound && room.answeredThisRound.has(playerId)) {
    return { error: 'Already answered' };
  }

  const q = room.questions[room.currentQuestion];
  const player = room.players.get(playerId);
  if (!player) return { error: 'Player not found' };

  room.answeredThisRound.add(playerId);

  const isCorrect = answerIndex === q.answer;
  let points = 0;
  if (isCorrect) {
    const timeSecs = room.questionTimeSecs ?? QUESTION_TIME_SECS;
    const elapsed = (Date.now() - room.timerStartedAt) / 1000;
    const remainingSeconds = Math.max(0, timeSecs - elapsed);
    points = Math.round(1000 * remainingSeconds / timeSecs);
    player.score += points;
  }

  const allAnswered = allPlayersAnswered(room);
  if (allAnswered && onTimerTick && onTimerEnd) {
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    room.state = 'leaderboard';
    onTimerEnd(room, onTimerTick, onTimerEnd);
  }

  return { correct: isCorrect, points, correctAnswer: q.answer, allAnswered };
}

function joinAsSpectator(room, ws) {
  const spectatorId = uuidv4();
  room.spectators.set(spectatorId, { id: spectatorId, ws });
  return { spectatorId };
}

function removeSpectator(room, spectatorId) {
  room.spectators.delete(spectatorId);
}

function getSpectatorCount(room) {
  return room.spectators.size;
}

function allPlayersAnswered(room) {
  if (!room || room.state !== 'question') return false;
  if (room.players.size === 0) return false;
  return room.answeredThisRound.size >= room.players.size;
}

function disconnectAllSpectators(room, noticeMessage) {
  const notice = JSON.stringify({ type: 'spectator_removed', reason: noticeMessage });
  for (const spectator of room.spectators.values()) {
    if (spectator.ws && spectator.ws.readyState === 1) {
      spectator.ws.send(notice);
      spectator.ws = null;
    }
  }
  room.spectators.clear();
}

function setQuestionTimeSecs(room, value) {
  if (!Number.isInteger(value) || value < 10 || value > 120) {
    return { error: 'questionTimeSecs must be an integer between 10 and 120' };
  }
  room.questionTimeSecs = value;
  return { ok: true };
}

function broadcastToHost(room, message) {
  const host = room.players.get(room.hostId);
  if (host && host.ws && host.ws.readyState === 1) {
    host.ws.send(JSON.stringify(message));
  }
}

/**
 * Delete a room by code, clearing any active timer and removing all associated data.
 * Returns the deleted room object, or null if the room was not found.
 */
function deleteRoom(code) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  rooms.delete(room.code);
  return room;
}

module.exports = {
  rooms,
  createRoom,
  createRoomHttp,
  joinRoom,
  joinRoomHttp,
  attachPlayerWs,
  getRoom,
  getRoomByPlayer,
  getLeaderboard,
  broadcast,
  startGame,
  nextQuestion,
  submitAnswer,
  deleteRoom,
  joinAsSpectator,
  removeSpectator,
  getSpectatorCount,
  allPlayersAnswered,
  disconnectAllSpectators,
  broadcastToHost,
  setQuestionTimeSecs,
  QUESTION_TIME_SECS
};
