const { allPlayersAnswered } = require('../../src/rooms');

function makeRoom({ state = 'question', playerIds = ['p1'], answeredIds = [] } = {}) {
  return {
    state,
    players: new Map(playerIds.map(id => [id, { id }])),
    answeredThisRound: new Set(answeredIds)
  };
}

describe('allPlayersAnswered', () => {
  it('returns true when all players have answered', () => {
    const room = makeRoom({ playerIds: ['p1', 'p2'], answeredIds: ['p1', 'p2'] });
    expect(allPlayersAnswered(room)).toBe(true);
  });

  it('returns false when only some players have answered', () => {
    const room = makeRoom({ playerIds: ['p1', 'p2'], answeredIds: ['p1'] });
    expect(allPlayersAnswered(room)).toBe(false);
  });

  it('returns false when no players have answered', () => {
    const room = makeRoom({ playerIds: ['p1', 'p2'], answeredIds: [] });
    expect(allPlayersAnswered(room)).toBe(false);
  });

  it('returns false when there are zero players', () => {
    const room = makeRoom({ playerIds: [], answeredIds: [] });
    expect(allPlayersAnswered(room)).toBe(false);
  });

  it('returns false when room state is not "question"', () => {
    const room = makeRoom({ state: 'lobby', playerIds: ['p1'], answeredIds: ['p1'] });
    expect(allPlayersAnswered(room)).toBe(false);
  });

  it('returns false when room state is "finished"', () => {
    const room = makeRoom({ state: 'finished', playerIds: ['p1'], answeredIds: ['p1'] });
    expect(allPlayersAnswered(room)).toBe(false);
  });

  it('returns false for null room', () => {
    expect(allPlayersAnswered(null)).toBe(false);
  });
});
