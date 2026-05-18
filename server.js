const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const rateLimit = require('express-rate-limit');
const {
  createRoom, createRoomHttp,
  joinRoom, joinRoomHttp,
  attachPlayerWs, getRoom,
  getRoomByPlayer, getLeaderboard, broadcast, startGame,
  nextQuestion, submitAnswer, deleteRoom,
  joinAsSpectator, removeSpectator, getSpectatorCount,
  disconnectAllSpectators, broadcastToHost
} = require('./src/rooms');
const { getTopScores, recordScore } = require('./src/scoreHistory');
const { version } = require('./package.json');

const pkg = require('./package.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: pkg.version });
});

// GET /api/stats — server-wide stats: total rooms, active players, and app version
app.get('/api/stats', (req, res) => {
  const { rooms } = require('./src/rooms');
  let activePlayers = 0;
  for (const room of rooms.values()) {
    activePlayers += room.players.size;
  }
  res.json({ totalGames: rooms.size, activePlayers, version });
});

// GET /api/scores/history — top 10 all-time scores sorted by score descending (60 req/min per IP)
const scoresHistoryLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 60),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests' })
});
app.get('/api/scores/history', scoresHistoryLimiter, (req, res) => {
  res.json(getTopScores(10));
});

// Validation middleware for POST /api/scores
function validateScorePayload(req, res, next) {
  const { playerId, score, roomId, nickname } = req.body || {};
  if (!playerId || typeof playerId !== 'string') {
    return res.status(400).json({ error: 'playerId is required and must be a string' });
  }
  if (score === undefined || score === null || typeof score !== 'number') {
    return res.status(400).json({ error: 'score is required and must be a number' });
  }
  if (!roomId || typeof roomId !== 'string') {
    return res.status(400).json({ error: 'roomId is required and must be a string' });
  }
  if (nickname !== undefined && typeof nickname !== 'string') {
    return res.status(400).json({ error: 'nickname must be a string' });
  }
  next();
}

// POST /api/scores — record a player's score
app.post('/api/scores', validateScorePayload, (req, res) => {
  const { playerId, score, roomId, nickname } = req.body;
  const resolvedNickname = nickname || playerId;
  recordScore({ playerName: playerId, roomId, score, timestamp: new Date().toISOString(), nickname: resolvedNickname });
  res.status(200).json({ playerId, score, roomId, nickname: resolvedNickname, recorded: true });
});

// GET /api/leaderboard — top 10 scores across all rooms sorted by score descending
app.get('/api/leaderboard', (req, res) => {
  res.json(getTopScores(10));
});

// Map internal room states to the API-facing state names
function apiRoomState(state) {
  if (state === 'lobby') return 'waiting';
  if (state === 'finished') return 'finished';
  return 'in-progress';
}

// POST /api/rooms — create a new room; returns join code and host token
app.post('/api/rooms', (req, res) => {
  const hostName = (req.body && req.body.name) ? String(req.body.name).trim() : 'Host';
  const { room, playerId: hostToken } = createRoomHttp(hostName);
  res.status(201).json({
    code: room.code,
    hostToken,
    state: apiRoomState(room.state),
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
  });
});

// POST /api/rooms/:code/join — join a room by code; returns player token
app.post('/api/rooms/:code/join', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const playerName = (req.body && req.body.name) ? String(req.body.name).trim() : 'Player';

  const result = joinRoomHttp(code, playerName);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const { room, playerId: playerToken } = result;
  res.status(200).json({
    playerToken,
    code: room.code,
    state: apiRoomState(room.state),
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
  });
});

// DELETE /api/rooms/:id — delete a room and all its associated data
app.delete('/api/rooms/:id', (req, res) => {
  const code = String(req.params.id).toUpperCase();
  const deleted = deleteRoom(code);
  if (!deleted) return res.status(404).json({ error: 'Room not found' });

  res.status(200).json({
    code: deleted.code,
    state: apiRoomState(deleted.state),
    players: [...deleted.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
  });
});

// POST /api/rooms/:code/answer — submit a player's answer via HTTP and broadcast score-update
app.post('/api/rooms/:code/answer', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const room = getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { playerToken, answer } = req.body || {};
  if (!playerToken) return res.status(400).json({ error: 'playerToken required' });
  if (answer === undefined || answer === null) return res.status(400).json({ error: 'answer required' });

  const result = submitAnswer(room, playerToken, answer);
  if (result.error) return res.status(400).json({ error: result.error });

  broadcast(room, {
    type: 'score-update',
    leaderboard: getLeaderboard(room).map(({ id, name, score }) => ({ id, name, score }))
  });

  res.json({ correct: result.correct, points: result.points, correctAnswer: result.correctAnswer });
});

// Timer callbacks
function onTimerTick(room, remaining) {
  broadcast(room, { type: 'timer_tick', remaining });
}

function onTimerEnd(room, onTick, onEnd) {
  const q = room.questions[room.currentQuestion];
  const leaderboard = getLeaderboard(room);
  broadcast(room, {
    type: 'question_end',
    correctAnswer: q.answer,
    leaderboard
  });
  broadcast(room, { type: 'leaderboard_update', leaderboard });
  room.state = 'leaderboard';

  // Advance to next question after 5 seconds
  setTimeout(() => {
    if (room.state === 'leaderboard') {
      room.state = 'question';
      nextQuestion(room, onTick, onEnd);
    }
  }, 5000);
}

// WebSocket message handlers
wss.on('connection', (ws) => {
  let playerId = null;
  let roomCode = null;
  let spectatorId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'reconnect': {
        // Allow players created via HTTP to attach their WebSocket session
        if (!msg.playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'playerId required for reconnect' }));
          return;
        }
        const room = attachPlayerWs(msg.playerId, ws);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }
        playerId = msg.playerId;
        roomCode = room.code;
        const isHost = room.hostId === playerId;
        ws.send(JSON.stringify({
          type: 'reconnected',
          code: roomCode,
          playerId,
          isHost,
          state: room.state,
          players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })),
          spectatorModeEnabled: room.spectatorModeEnabled,
          spectatorCount: getSpectatorCount(room)
        }));
        break;
      }

      case 'create_room': {
        const { room, playerId: pid } = createRoom(ws, msg.name || 'Host');
        playerId = pid;
        roomCode = room.code;
        ws.send(JSON.stringify({
          type: 'room_created',
          code: room.code,
          playerId,
          isHost: true,
          players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
        }));
        break;
      }

      case 'join_room': {
        const result = joinRoom(msg.code, ws, msg.name || 'Player');
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', message: result.error }));
          return;
        }
        playerId = result.playerId;
        roomCode = result.room.code;
        const playerList = [...result.room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }));
        ws.send(JSON.stringify({
          type: 'room_joined',
          code: roomCode,
          playerId,
          isHost: false,
          players: playerList
        }));
        // Notify existing players
        broadcast(result.room, { type: 'player_joined', players: playerList });
        break;
      }

      case 'join_as_spectator': {
        const room = getRoom(msg.code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        if (!room.spectatorModeEnabled) {
          ws.send(JSON.stringify({ type: 'error', message: 'Spectator mode is disabled for this session' }));
          return;
        }
        const { spectatorId: sid } = joinAsSpectator(room, ws);
        spectatorId = sid;
        roomCode = room.code;
        ws.send(JSON.stringify({ type: 'spectator_joined', spectatorId, code: roomCode }));
        broadcastToHost(room, { type: 'spectator_count', count: getSpectatorCount(room) });
        break;
      }

      case 'start_game': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can start the game' }));
          return;
        }
        if (!startGame(room, onTimerTick, onTimerEnd)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Cannot start game in current state' }));
        }
        break;
      }

      case 'submit_answer': {
        const room = getRoomByPlayer(playerId);
        if (!room) return;
        const result = submitAnswer(room, playerId, msg.answer);
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', message: result.error }));
          return;
        }
        ws.send(JSON.stringify({ type: 'answer_result', ...result }));
        // Broadcast score-update to all players in the room after each answer
        broadcast(room, {
          type: 'score-update',
          leaderboard: getLeaderboard(room).map(({ id, name, score }) => ({ id, name, score }))
        });
        break;
      }

      case 'toggle_spectator_mode': {
        const room = getRoomByPlayer(playerId);
        if (!room || room.hostId !== playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can toggle spectator mode' }));
          return;
        }
        room.spectatorModeEnabled = !!msg.enabled;
        if (!room.spectatorModeEnabled) {
          disconnectAllSpectators(room, 'Spectator mode has been disabled by the host');
        }
        ws.send(JSON.stringify({
          type: 'spectator_mode_updated',
          spectatorModeEnabled: room.spectatorModeEnabled,
          spectatorCount: getSpectatorCount(room)
        }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (spectatorId && roomCode) {
      const room = getRoom(roomCode);
      if (room) {
        removeSpectator(room, spectatorId);
        broadcastToHost(room, { type: 'spectator_count', count: getSpectatorCount(room) });
      }
    } else if (playerId && roomCode) {
      const room = getRoomByPlayer(playerId);
      if (room) {
        const player = room.players.get(playerId);
        if (player) player.ws = null;
      }
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Trivia Night server running on port ${PORT}`);
  });
}

module.exports = { app, server };
