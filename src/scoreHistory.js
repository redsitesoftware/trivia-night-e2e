const history = [];

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
