'use strict';

const { v4: uuidv4 } = require('uuid');

const MAX_PLAYERS = 8;

/** @type {Map<string, import('./types').Room>} */
const rooms = new Map();

/**
 * Generate a unique 6-character uppercase alphanumeric join code.
 * @returns {string}
 */
function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

/**
 * Create a new room.
 * @returns {{ code: string, hostToken: string }}
 */
function createRoom() {
  const code = generateJoinCode();
  const hostToken = uuidv4();

  /** @type {import('./types').Room} */
  const room = {
    code,
    hostToken,
    players: new Map(),
    state: 'waiting',
    game: null,
  };

  rooms.set(code, room);
  return { code, hostToken };
}

/**
 * Join a room as a player.
 * @param {string} code
 * @param {string} name
 * @returns {{ playerToken: string } | { error: string }}
 */
function joinRoom(code, name) {
  const room = rooms.get(code);
  if (!room) return { error: 'Room not found' };
  if (room.state !== 'waiting') return { error: 'Game already in progress' };
  if (room.players.size >= MAX_PLAYERS) return { error: 'Room is full' };

  const playerToken = uuidv4();
  room.players.set(playerToken, { token: playerToken, name, score: 0 });
  return { playerToken };
}

/**
 * Get a room by code.
 * @param {string} code
 * @returns {import('./types').Room | undefined}
 */
function getRoom(code) {
  return rooms.get(code);
}

module.exports = { createRoom, joinRoom, getRoom, rooms };
