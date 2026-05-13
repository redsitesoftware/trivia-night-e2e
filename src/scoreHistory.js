/** In-memory score history store (survives process lifetime). */
const history = [];

/**
 * Record a player's final score for a completed game.
 * @param {{ player: string, score: number, date?: string }} entry
 */
function recordScore({ player, score, date }) {
  history.push({
    player: String(player),
    score: Number(score),
    date: date || new Date().toISOString()
  });
}

/**
 * Return the top N scores sorted by score descending.
 * @param {number} n
 * @returns {{ player: string, score: number, date: string }[]}
 */
function getTopScores(n) {
  return history
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores, history };
