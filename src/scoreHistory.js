const fs = require('fs');
const path = require('path');

const SCORES_FILE = process.env.SCORES_FILE || path.join(__dirname, '..', 'data', 'scores.json');

function loadHistory() {
  try {
    const raw = fs.readFileSync(SCORES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // File missing or corrupt — start with empty history
  }
  return [];
}

function persistHistory(history) {
  try {
    const dir = path.dirname(SCORES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCORES_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch {
    // Best-effort; don't crash the process on write failure
  }
}

const history = loadHistory();

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
  persistHistory(history);
}

/**
 * Return up to n top scores sorted by score descending.
 * @param {number} n
 * @returns {Array<{ playerName: string, roomId: string, score: number, timestamp: string, nickname: string }>}
 */
function getTopScores(n) {
  return [...history]
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores };
