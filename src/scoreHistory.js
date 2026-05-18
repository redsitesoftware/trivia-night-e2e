const fs = require('fs');
const path = require('path');

const SCORES_FILE = process.env.SCORES_FILE || path.join('data', 'scores.json');

let history = [];
let loadedCount = 0;

function init() {
  const dir = path.dirname(SCORES_FILE);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const raw = fs.readFileSync(SCORES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    history = Array.isArray(parsed) ? parsed : [];
  } catch {
    history = [];
  }
  loadedCount = history.length;
}

function persistHistory() {
  fs.writeFileSync(SCORES_FILE, JSON.stringify(history, null, 2), 'utf8');
}

init();

/**
 * Record a player's final score at the end of a game.
 * @param {{ playerName: string, roomId: string, score: number, timestamp?: string, nickname?: string }} entry
 */
function recordScore({ playerName, roomId, score, timestamp, nickname }) {
  history.push({
    playerName,
    roomId,
    score,
    timestamp: timestamp || new Date().toISOString(),
    nickname: nickname || playerName
  });
  persistHistory();
}

/**
 * Return up to n top scores sorted by score descending, with optional player filtering.
 * @param {number|{ limit?: number, player?: string }} nOrOpts
 * @returns {Array<{ playerName: string, roomId: string, score: number, timestamp: string, nickname: string }>}
 */
function getTopScores(nOrOpts) {
  let limit;
  let player;

  if (typeof nOrOpts === 'object' && nOrOpts !== null) {
    limit = nOrOpts.limit ?? 10;
    player = nOrOpts.player ?? null;
  } else {
    limit = nOrOpts ?? 10;
    player = null;
  }

  let results = [...history].sort((a, b) => b.score - a.score);
  if (player) {
    const needle = player.toLowerCase();
    results = results.filter((entry) => entry.playerName.toLowerCase().includes(needle));
  }

  return results.slice(0, limit);
}

function getLoadedCount() {
  return loadedCount;
}

module.exports = { recordScore, getTopScores, getLoadedCount };
