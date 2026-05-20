const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpFile() {
  return path.join(os.tmpdir(), `scores-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function loadModule(filePath) {
  process.env.SCORES_FILE = filePath;
  jest.resetModules();
  return require('../src/scoreHistory');
}

afterEach(() => {
  delete process.env.SCORES_FILE;
});

describe('recordScore()', () => {
  it('stores an entry so the in-memory list grows', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    expect(getTopScores(50)).toHaveLength(0);
    recordScore({ playerName: 'Alice', roomId: 'r1', score: 100 });
    expect(getTopScores(50)).toHaveLength(1);
  });

  it('stores all supplied fields', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    recordScore({ playerName: 'Bob', roomId: 'r2', score: 42, nickname: 'B-Dog' });
    const [entry] = getTopScores(1);
    expect(entry.playerName).toBe('Bob');
    expect(entry.roomId).toBe('r2');
    expect(entry.score).toBe(42);
    expect(entry.nickname).toBe('B-Dog');
    expect(entry.timestamp).toBeTruthy();
  });

  it('defaults nickname to playerName when omitted', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    recordScore({ playerName: 'Carol', roomId: 'r3', score: 10 });
    const [entry] = getTopScores(1);
    expect(entry.nickname).toBe('Carol');
  });
});

describe('getTopScores(n) — sorted descending, capped at n', () => {
  it('returns results sorted by score descending', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    recordScore({ playerName: 'Low',  roomId: 'r1', score: 10 });
    recordScore({ playerName: 'High', roomId: 'r1', score: 99 });
    recordScore({ playerName: 'Mid',  roomId: 'r1', score: 55 });

    const scores = getTopScores(10).map((e) => e.score);
    expect(scores).toEqual([99, 55, 10]);
  });

  it('caps results at n', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    for (let i = 0; i < 5; i++) {
      recordScore({ playerName: `P${i}`, roomId: 'r1', score: i * 10 });
    }
    expect(getTopScores(3)).toHaveLength(3);
  });

  it('respects limit of 1 (lower boundary)', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    recordScore({ playerName: 'A', roomId: 'r1', score: 20 });
    recordScore({ playerName: 'B', roomId: 'r1', score: 80 });

    const results = getTopScores(1);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(80);
  });

  it('respects limit of 50 (upper boundary)', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    for (let i = 0; i < 60; i++) {
      recordScore({ playerName: `P${i}`, roomId: 'r1', score: i });
    }
    expect(getTopScores(50)).toHaveLength(50);
  });
});

describe('getTopScores({ limit, player }) — player filter', () => {
  it('filters by player name (case-insensitive substring)', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    recordScore({ playerName: 'Alice',   roomId: 'r1', score: 50 });
    recordScore({ playerName: 'ALICE2',  roomId: 'r1', score: 60 });
    recordScore({ playerName: 'Bob',     roomId: 'r1', score: 70 });

    const results = getTopScores({ limit: 10, player: 'alice' });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.playerName.toLowerCase().includes('alice'))).toBe(true);
  });

  it('returns empty array when no player matches', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    recordScore({ playerName: 'Dave', roomId: 'r1', score: 30 });
    expect(getTopScores({ limit: 10, player: 'zzz' })).toHaveLength(0);
  });

  it('applies limit after player filter', () => {
    const f = tmpFile();
    const { recordScore, getTopScores } = loadModule(f);

    for (let i = 0; i < 5; i++) {
      recordScore({ playerName: 'Eve', roomId: 'r1', score: i * 10 });
    }
    expect(getTopScores({ limit: 2, player: 'Eve' })).toHaveLength(2);
  });
});

describe('persistence', () => {
  it('recordScore() writes entries to the JSON file', () => {
    const f = tmpFile();
    const { recordScore } = loadModule(f);

    recordScore({ playerName: 'Frank', roomId: 'r1', score: 77 });

    const written = JSON.parse(fs.readFileSync(f, 'utf8'));
    expect(written).toHaveLength(1);
    expect(written[0].playerName).toBe('Frank');
  });

  it('entries survive a module reload (re-init reads from disk)', () => {
    const f = tmpFile();

    // First load — record a score
    const first = loadModule(f);
    first.recordScore({ playerName: 'Grace', roomId: 'r1', score: 88 });

    // Second load of the same file — entries must be present
    const second = loadModule(f);
    const results = second.getTopScores(10);
    expect(results.some((e) => e.playerName === 'Grace' && e.score === 88)).toBe(true);
  });

  it('accumulates entries across reloads', () => {
    const f = tmpFile();

    loadModule(f).recordScore({ playerName: 'Hank', roomId: 'r1', score: 10 });
    loadModule(f).recordScore({ playerName: 'Ivy',  roomId: 'r1', score: 20 });

    const results = loadModule(f).getTopScores(10);
    expect(results).toHaveLength(2);
  });
});

describe('getLoadedCount()', () => {
  it('returns 0 when the file does not exist yet', () => {
    const f = tmpFile();
    const { getLoadedCount } = loadModule(f);
    expect(getLoadedCount()).toBe(0);
  });

  it('returns the number of entries loaded from disk on init', () => {
    const f = tmpFile();

    // Pre-populate the file
    const seed = [
      { playerName: 'Judy', roomId: 'r1', score: 5, timestamp: new Date().toISOString(), nickname: 'Judy' },
      { playerName: 'Karl', roomId: 'r1', score: 9, timestamp: new Date().toISOString(), nickname: 'Karl' },
    ];
    fs.writeFileSync(f, JSON.stringify(seed, null, 2), 'utf8');

    const { getLoadedCount } = loadModule(f);
    expect(getLoadedCount()).toBe(2);
  });

  it('does not count entries added after init', () => {
    const f = tmpFile();
    const { recordScore, getLoadedCount } = loadModule(f);

    recordScore({ playerName: 'Leo', roomId: 'r1', score: 15 });
    expect(getLoadedCount()).toBe(0);
  });
});
