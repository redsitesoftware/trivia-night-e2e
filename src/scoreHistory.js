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
 * Return up to n top scores sorted by score descending, with optional player filter.
 * @param {number|{ limit?: number, player?: string }} nOrOpts
 * @returns {Array<{ playerName: string, roomId: string, score: number, timestamp: string, nickname: string }>}
 */
function getTopScores(nOrOpts) {
  let limit, player;
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
    results = results.filter(e => e.playerName.toLowerCase().includes(needle));
  }

  return results.slice(0, limit);
}

module.exports = { recordScore, getTopScores };
