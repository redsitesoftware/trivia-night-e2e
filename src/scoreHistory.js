const history = [];

/**
 * Record a player's final score at the end of a game.
 * @param {{ player: string, score: number, date?: string }} entry
 */
function recordScore({ player, score, date }) {
  history.push({
    player,
    score,
    date: date || new Date().toISOString()
  });
}

/**
 * Return up to n top scores sorted by score descending.
 * @param {number} n
 * @returns {Array<{ player: string, score: number, date: string }>}
 */
function getTopScores(n) {
  return [...history]
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores };
