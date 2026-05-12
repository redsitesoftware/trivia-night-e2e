const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const {
  createRoom, createRoomHttp,
  joinRoom, joinRoomHttp,
  attachPlayerWs, getRoom,
  getRoomByPlayer, getLeaderboard, broadcast, startGame,
  nextQuestion, submitAnswer
} = require('./src/rooms');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
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

// Timer callbacks
function onTimerTick(room, remaining) {
  broadcast(room, { type: 'timer', remaining });
}

function onTimerEnd(room, onTick, onEnd) {
  const q = room.questions[room.currentQuestion];
  broadcast(room, {
    type: 'question_end',
    correctAnswer: q.answer,
    leaderboard: getLeaderboard(room)
  });
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
          players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }))
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
        // Broadcast updated scores after answer
        broadcast(room, {
          type: 'scores_update',
          leaderboard: getLeaderboard(room)
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (playerId && roomCode) {
      const room = getRoomByPlayer(playerId);
      if (room) {
        const player = room.players.get(playerId);
        if (player) player.ws = null;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Trivia Night server running on port ${PORT}`);
});

module.exports = { app, server };
