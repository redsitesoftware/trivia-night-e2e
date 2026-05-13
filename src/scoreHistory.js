const scoreHistory = [];

/**
 * Record a player's final score at game end.
 * @param {Object} entry
 * @param {string} entry.player  - Player display name
 * @param {number} entry.score   - Final score
 * @param {string} [entry.date]  - ISO 8601 date string; defaults to now
 */
function recordScore({ player, score, date }) {
  scoreHistory.push({
    player: String(player),
    score: Number(score),
    date: date !== undefined ? String(date) : new Date().toISOString()
  });
}

/**
 * Return up to n entries sorted by score descending.
 * @param {number} n
 * @returns {Array<{player: string, score: number, date: string}>}
 */
function getTopScores(n) {
  return [...scoreHistory]
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores };
