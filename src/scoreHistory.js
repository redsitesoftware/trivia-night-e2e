const history = [];

/**
 * Record a player's final score at game end.
 * @param {object} entry
 * @param {string} entry.player - Player display name
 * @param {number} entry.score  - Final score
 * @param {string} [entry.date] - ISO 8601 date string (defaults to now)
 */
function recordScore({ player, score, date }) {
  history.push({
    player,
    score,
    date: date || new Date().toISOString()
  });
}

/**
 * Return the top n scores sorted by score descending.
 * @param {number} n - Maximum number of entries to return
 * @returns {Array<{player: string, score: number, date: string}>}
 */
function getTopScores(n) {
  return history
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores };
