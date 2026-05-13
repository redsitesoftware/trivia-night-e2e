/** In-memory score history store. Survives the process lifetime. */
const history = [];

/**
 * Record a player's final score at game end.
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
 * @param {number} n - Maximum number of entries to return
 * @returns {{ player: string, score: number, date: string }[]}
 */
function getTopScores(n) {
  return history
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores };
