'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const { createRoom, joinRoom, getRoom } = require('./src/rooms');
const { startGame, submitAnswer } = require('./src/game');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

/** POST /api/rooms — host creates a room */
app.post('/api/rooms', (_req, res) => {
  const { code, hostToken } = createRoom();
  res.status(201).json({ code, hostToken });
});

/** POST /api/rooms/:code/join — player joins a room */
app.post('/api/rooms/:code/join', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const result = joinRoom(req.params.code.toUpperCase(), name.trim());
  if (result.error) {
    return res.status(result.error === 'Room not found' ? 404 : 400).json(result);
  }
  res.status(201).json(result);
});

/** POST /api/rooms/:code/start — host starts the game */
app.post('/api/rooms/:code/start', (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { hostToken } = req.body;
  if (hostToken !== room.hostToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (room.state !== 'waiting') {
    return res.status(400).json({ error: 'Game already started or finished' });
  }

  startGame(room, (event, payload) => broadcastToRoom(room.code, event, payload));
  res.json({ started: true });
});

/** POST /api/rooms/:code/answer — player submits an answer */
app.post('/api/rooms/:code/answer', (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { playerToken, answerIndex } = req.body;
  if (playerToken === undefined || answerIndex === undefined) {
    return res.status(400).json({ error: 'playerToken and answerIndex are required' });
  }

  const result = submitAnswer(
    room,
    playerToken,
    Number(answerIndex),
    (event, payload) => broadcastToRoom(room.code, event, payload),
  );

  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const roomClients = new Map();

/**
 * Broadcast a JSON event to all WebSocket clients in a room.
 * @param {string} code
 * @param {string} event
 * @param {object} payload
 */
function broadcastToRoom(code, event, payload) {
  const clients = roomClients.get(code);
  if (!clients) return;
  const msg = JSON.stringify({ event, ...payload });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  // Clients send { type: 'subscribe', code } to subscribe to a room
  const clientId = uuidv4();
  let subscribedCode = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ event: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (msg.type === 'subscribe' && msg.code) {
      const code = String(msg.code).toUpperCase();
      const room = getRoom(code);
      if (!room) {
        ws.send(JSON.stringify({ event: 'error', message: 'Room not found' }));
        return;
      }

      // Unsubscribe from previous room
      if (subscribedCode && roomClients.has(subscribedCode)) {
        roomClients.get(subscribedCode).delete(ws);
      }

      subscribedCode = code;
      if (!roomClients.has(code)) roomClients.set(code, new Set());
      roomClients.get(code).add(ws);

      ws.send(JSON.stringify({ event: 'subscribed', code }));
    }
  });

  ws.on('close', () => {
    if (subscribedCode && roomClients.has(subscribedCode)) {
      roomClients.get(subscribedCode).delete(ws);
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Trivia Night server running on http://localhost:${PORT}`);
});

module.exports = { app, server }; // for testing
