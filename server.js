const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory state ──────────────────────────────────────────────────────────
const rooms = new Map(); // code → room

// ─── Questions ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { text: 'What planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Mars', 'Earth'], answer: 1, category: 'Science' },
  { text: 'What is the chemical symbol for water?', options: ['O2', 'CO2', 'H2O', 'NaCl'], answer: 2, category: 'Science' },
  { text: 'How many bones are in the adult human body?', options: ['196', '206', '216', '226'], answer: 1, category: 'Science' },
  { text: 'What is the speed of light (approx) in km/s?', options: ['150,000', '300,000', '450,000', '600,000'], answer: 1, category: 'Science' },
  { text: 'What gas do plants absorb during photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], answer: 2, category: 'Science' },
  { text: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], answer: 2, category: 'History' },
  { text: 'Who was the first President of the United States?', options: ['Abraham Lincoln', 'Thomas Jefferson', 'John Adams', 'George Washington'], answer: 3, category: 'History' },
  { text: 'The Great Wall of China was primarily built during which dynasty?', options: ['Tang', 'Song', 'Ming', 'Qing'], answer: 2, category: 'History' },
  { text: 'In which year did the Berlin Wall fall?', options: ['1987', '1988', '1989', '1990'], answer: 2, category: 'History' },
  { text: 'Who wrote "The Art of War"?', options: ['Confucius', 'Sun Tzu', 'Lao Tzu', 'Mencius'], answer: 1, category: 'History' },
  { text: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3, category: 'Science' },
  { text: 'Which ancient wonder was located in Alexandria?', options: ['Colossus of Rhodes', 'Lighthouse of Alexandria', 'Hanging Gardens', 'Temple of Artemis'], answer: 1, category: 'History' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function broadcastPlayerList(room) {
  broadcast(room, {
    type: 'player_list',
    players: room.players.map(p => ({ name: p.name, score: p.score })),
  });
}

function startQuestion(room) {
  if (room.questionIndex >= QUESTIONS.length) {
    endGame(room);
    return;
  }

  const q = QUESTIONS[room.questionIndex];
  room.state = 'question';
  room.timeLeft = 30;
  room.answeredTokens = new Set();

  broadcast(room, {
    type: 'question_start',
    index: room.questionIndex,
    total: QUESTIONS.length,
    text: q.text,
    options: q.options,
    category: q.category,
    timeLeft: room.timeLeft,
  });

  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    broadcast(room, { type: 'timer_tick', remaining: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endQuestion(room);
    }
  }, 1000);
}

function endQuestion(room) {
  room.state = 'leaderboard';
  const q = QUESTIONS[room.questionIndex];

  broadcast(room, {
    type: 'question_end',
    correctIndex: q.answer,
    correctText: q.options[q.answer],
  });

  const leaderboard = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map(p => ({ name: p.name, score: p.score }));

  broadcast(room, { type: 'leaderboard_update', leaderboard });
  room.questionIndex += 1;
}

function endGame(room) {
  room.state = 'finished';
  clearInterval(room.timer);

  const leaderboard = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map(p => ({ name: p.name, score: p.score }));

  broadcast(room, { type: 'game_over', leaderboard });
}

// ─── REST API ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/rooms', (req, res) => {
  const code = generateCode();
  const hostToken = uuidv4();
  rooms.set(code, {
    code,
    hostToken,
    state: 'waiting',
    players: [],
    sockets: new Map(),
    questionIndex: 0,
    timeLeft: 0,
    answeredTokens: new Set(),
    timer: null,
  });
  res.json({ code, hostToken });
});

app.post('/api/rooms/:code/join', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.state !== 'waiting') return res.status(400).json({ error: 'Game already started' });
  if (room.players.length >= 8) return res.status(400).json({ error: 'Room is full' });

  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Display name required' });

  const token = uuidv4();
  room.players.push({ name: name.trim(), token, score: 0 });
  broadcastPlayerList(room);
  res.json({ token, code: room.code });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let room = null;
  let token = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'identify') {
      const r = rooms.get(msg.code);
      if (!r) return ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));

      room = r;
      token = msg.token;
      room.sockets.set(token, ws);

      // Send current state to reconnecting / newly connected client
      if (msg.token === room.hostToken) {
        ws.send(JSON.stringify({
          type: 'identified',
          role: 'host',
          players: room.players.map(p => ({ name: p.name, score: p.score })),
          state: room.state,
        }));
      } else {
        const player = room.players.find(p => p.token === msg.token);
        if (player) {
          ws.send(JSON.stringify({
            type: 'identified',
            role: 'player',
            state: room.state,
            players: room.players.map(p => ({ name: p.name, score: p.score })),
          }));
        }
      }
      return;
    }

    if (!room) return;

    if (msg.type === 'start_game') {
      if (token !== room.hostToken) return;
      if (room.state !== 'waiting') return;
      if (room.players.length === 0) return;
      room.state = 'in-progress';
      broadcast(room, { type: 'game_started' });
      startQuestion(room);
      return;
    }

    if (msg.type === 'next_question') {
      if (token !== room.hostToken) return;
      if (room.state !== 'leaderboard') return;
      startQuestion(room);
      return;
    }

    if (msg.type === 'answer') {
      const player = room.players.find(p => p.token === token);
      if (!player) return;
      if (room.state !== 'question') return;
      if (room.answeredTokens.has(token)) return;

      room.answeredTokens.add(token);
      const q = QUESTIONS[room.questionIndex];
      if (msg.answerIndex === q.answer) {
        player.score += Math.round(1000 * room.timeLeft / 30);
      }

      // If all players answered, end question early
      if (room.answeredTokens.size >= room.players.length) {
        clearInterval(room.timer);
        endQuestion(room);
      }
    }
  });

  ws.on('close', () => {
    if (room && token) room.sockets.delete(token);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Trivia Night server running on http://localhost:${PORT}`));
