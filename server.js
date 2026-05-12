const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const {
  createRoom, joinRoom, getRoomByPlayer, attachPlayerWs, getRoomPublicState,
  getLeaderboard, broadcast, startGame,
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

// POST /api/rooms — create a room; returns join code and host player token
app.post('/api/rooms', (req, res) => {
  const name = (req.body && req.body.name) ? String(req.body.name).trim() : 'Host';
  const { room, playerId } = createRoom(null, name || 'Host');
  res.status(201).json({ code: room.code, playerId, state: getRoomPublicState(room) });
});

// POST /api/rooms/:code/join — join a room by code; returns player token
app.post('/api/rooms/:code/join', (req, res) => {
  const name = req.body && req.body.name ? String(req.body.name).trim() : '';
  if (!name) return res.status(400).json({ error: 'Display name is required' });

  const result = joinRoom(req.params.code, null, name);
  if (result.error) {
    const status = result.error === 'Room not found' ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.status(200).json({ playerId: result.playerId });
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
      case 'identify': {
        const room = attachPlayerWs(msg.playerId, ws);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
          return;
        }
        playerId = msg.playerId;
        roomCode = room.code;
        const playerList = [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score }));
        ws.send(JSON.stringify({
          type: 'identified',
          code: room.code,
          playerId,
          isHost: room.hostId === playerId,
          players: playerList
        }));
        // Notify others that this player has connected
        broadcast(room, { type: 'player_joined', players: playerList });
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
