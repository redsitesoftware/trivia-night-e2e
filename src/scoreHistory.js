'use strict';

/** @type {{ player: string, score: number, date: string }[]} */
const history = [];

/**
 * Record a player's final score at the end of a game.
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
 * Return up to n top scores sorted by score descending.
 * @param {number} n
 * @returns {{ player: string, score: number, date: string }[]}
 */
function getTopScores(n) {
  return history
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

module.exports = { recordScore, getTopScores };
