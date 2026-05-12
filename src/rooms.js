const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

const MAX_PLAYERS = 8;

function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(hostName) {
  const code = generateJoinCode();
  const hostToken = uuidv4();
  const room = {
    code,
    state: 'waiting',
    host: { token: hostToken, name: hostName },
    players: [],
  };
  rooms.set(code, room);
  return { code, hostToken };
}

function joinRoom(code, displayName) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: 'Room not found', status: 404 };
  if (room.state !== 'waiting') return { error: 'Room is not accepting players', status: 409 };
  if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full', status: 409 };

  const playerToken = uuidv4();
  room.players.push({ token: playerToken, name: displayName });
  return { playerToken };
}

function getRoom(code) {
  return rooms.get(code.toUpperCase()) || null;
}

function clearRooms() {
  rooms.clear();
}

module.exports = { createRoom, joinRoom, getRoom, clearRooms };
