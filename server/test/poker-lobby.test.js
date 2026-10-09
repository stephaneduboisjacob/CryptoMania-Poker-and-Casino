const test = require('node:test');
const assert = require('node:assert/strict');
const { GameManager } = require('../src/poker/manager');
const { Table } = require('../src/poker/engine');
const { CASH_STAKES, MTT_CALENDAR } = require('../src/poker/schedules');

const fakeIo = { to: () => ({ emit() {} }), emit() {} };

test('cash lobby publishes every supported table size and counts occupied seats', () => {
  const manager = new GameManager(fakeIo);
  clearInterval(manager.tick);
  try {
    const stake = CASH_STAKES.find(item => item.key === 'play-micro');
    const record = {
      id: 'cash-test', gameType: 'cash', name: stake.name, maxSeats: 3,
      speed: 'regular', currency: 'play', smallBlind: stake.sb, bigBlind: stake.bb,
      stakeKey: stake.key, players: new Map(),
    };
    manager.games.set(record.id, record);
    const table = manager.createTable(record);
    table.sitPlayer({ userId: 101, username: 'one', chips: 2000, seat: 0 });
    table.sitPlayer({ userId: 102, username: 'two', chips: 2000, seat: 1 });

    const snapshot = manager.lobbySnapshot();
    assert.equal(snapshot.cash.length, CASH_STAKES.length * 5);
    for (const stakeFormat of CASH_STAKES) {
      assert.deepEqual(snapshot.cash.filter(item => item.key === stakeFormat.key).map(item => item.maxSeats), [2, 3, 6, 8, 9]);
    }
    const shortTable = snapshot.cash.find(item => item.key === 'play-micro' && item.maxSeats === 3);
    assert.equal(shortTable.players, 2);
    assert.equal(shortTable.tables[0].maxSeats, 3);
    assert.equal(shortTable.tables[0].seats, 2);
  } finally {
    for (const table of manager.tables.values()) table.destroy();
    clearInterval(manager.tick);
  }
});

test('Sit & Go lobby exposes every seat size, speed, and BTC open count', () => {
  const manager = new GameManager(fakeIo);
  clearInterval(manager.tick);
  try {
    manager.games.set('btc-sng-test', {
      id: 'btc-sng-test', gameType: 'sng', currency: 'btc', entryFee: 0, entryUsd: 5,
      maxSeats: 3, speed: 'hyper', status: 'registering', players: new Map([[201, { userId: 201 }]]),
    });
    const snapshot = manager.lobbySnapshot();
    assert.equal(snapshot.sngs.length, (3 + 5) * 5 * 4);
    const openBtcShort = snapshot.sngs.find(item => item.currency === 'btc' && item.buyin === 5 && item.seats === 3 && item.speed === 'hyper');
    assert.equal(openBtcShort.open, 1);
    assert.deepEqual([...new Set(snapshot.sngs.map(item => item.seats))], [2, 3, 6, 8, 9]);
    assert.deepEqual([...new Set(snapshot.sngs.map(item => item.speed))], ['regular', 'turbo', 'hyper', 'deepstack']);
  } finally {
    clearInterval(manager.tick);
  }
});

test('hourly freeroll calendar covers all UTC hours and tournament tables support 2, 3, and 8 seats', () => {
  const freeroll = MTT_CALENDAR.find(event => event.key === 'freeroll-fever');
  assert.deepEqual(freeroll.hours, Array.from({ length: 24 }, (_, hour) => hour));
  for (const maxSeats of [2, 3, 8]) {
    const table = new Table({
      id: `mtt-${maxSeats}`, maxSeats, currency: 'play', gameType: 'mtt',
      speed: 'turbo', name: `${maxSeats}-max test`, smallBlind: 10, bigBlind: 20,
      io: fakeIo, manager: {},
    });
    try {
      assert.equal(table.seats.length, maxSeats);
      for (let seat = 0; seat < maxSeats; seat++) {
        assert.deepEqual(table.sitPlayer({ userId: 300 + seat, username: `p${seat}`, chips: 1000, seat }), { seat });
      }
      assert.equal(table.sitPlayer({ userId: 999, username: 'extra', chips: 1000 }).error, 'Seat taken');
    } finally { table.destroy(); }
  }
});

test('Sit & Go serializes registration against the full table capacity', async () => {
  const pool = require('../src/db');
  const originalConnect = pool.connect;
  const manager = new GameManager(fakeIo);
  clearInterval(manager.tick);
  let walletUpdates = 0;
  const client = {
    async query(sql) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql.startsWith('SELECT balance_play')) return { rows: [{ balance_play: 100000, balance_btc: 0 }] };
      if (sql.includes('SELECT g.id FROM game_players')) return { rows: [] };
      if (sql === 'SELECT status,max_seats FROM games WHERE id=$1 FOR UPDATE') return { rows: [{ status: 'registering', max_seats: 2 }] };
      if (sql.includes('SELECT COUNT(*)::int AS count FROM game_players')) return { rows: [{ count: 2 }] };
      if (sql.startsWith('UPDATE users')) walletUpdates++;
      throw new Error(`Unexpected test SQL: ${sql}`);
    },
    release() {},
  };
  pool.connect = async () => client;
  const record = {
    id: 'sng-full', gameType: 'sng', status: 'registering', currency: 'play',
    entryFee: 1000, entryUsd: null, maxSeats: 2, speed: 'regular',
    players: new Map([[1, { userId: 1, username: 'one' }]]),
  };
  manager.games.set(record.id, record);

  try {
    const result = await manager.sngJoin(2, 'two', null, { currency: 'play', buyin: 1000, seats: 2, speed: 'regular' });
    assert.match(result.error, /just filled/);
    assert.equal(walletUpdates, 0);
    assert.equal(record.players.size, 1);
    assert.equal(record._registrationsInFlight, 0);
  } finally {
    pool.connect = originalConnect;
    for (const table of manager.tables.values()) table.destroy();
    clearInterval(manager.tick);
  }
});

test('restart recovery restores funded SNG registrants and their wait timer', async () => {
  const pool = require('../src/db');
  const originalQuery = pool.query;
  const manager = new GameManager(fakeIo);
  clearInterval(manager.tick);
  const game = {
    id: 'sng-recovered', game_type: 'sng', name: 'Recovered SNG', max_seats: 3,
    speed: 'turbo', currency: 'play', entry_fee: 5000, entry_usd: null,
    starting_stack: 2250, level_minutes: 5, late_reg_levels: 0, guarantee: 0,
    prize_pool: 0, payout_schedule: [], min_players: 2, status: 'registering', ai_fill: true,
    created_at: new Date(),
  };
  pool.query = async (sql) => {
    if (sql.startsWith('SELECT * FROM games')) return { rows: [game] };
    if (sql.startsWith('SELECT gp.*')) return { rows: [
      { user_id: 42, username: 'recover-me', chips: 0, bought_in: 5000, status: 'registered' },
    ] };
    throw new Error(`Unexpected test SQL: ${sql}`);
  };

  try {
    await manager.recoverRunningGames();
    const recovered = manager.games.get(game.id);
    assert.equal(recovered.players.size, 1);
    assert.equal(recovered.players.get(42).username, 'recover-me');
    assert.equal(recovered._prizeCollected, 5000);
    assert.ok(recovered.startDeadline > Date.now());
  } finally {
    pool.query = originalQuery;
    for (const table of manager.tables.values()) table.destroy();
    clearInterval(manager.tick);
  }
});

test('an expired one-player BTC Sit & Go is cancelled for refund instead of staying open forever', () => {
  const manager = new GameManager(fakeIo);
  clearInterval(manager.tick);
  const record = {
    id: 'btc-sng-alone', gameType: 'sng', status: 'registering', currency: 'btc',
    aiFill: false, minPlayers: 2, startDeadline: Date.now() - 1,
    players: new Map([[1, { userId: 1, username: 'one' }]]),
  };
  manager.games.set(record.id, record);
  let cancelledWith = null;
  manager.cancelGame = async (_record, reason) => { cancelledWith = reason; };

  manager.checkStarts(Date.now());
  assert.equal(cancelledWith, 'Not enough players');
  clearInterval(manager.tick);
});

test('a tournament cannot refund an entry once its start transition is underway', async () => {
  const manager = new GameManager(fakeIo);
  clearInterval(manager.tick);
  manager.games.set('mtt-starting', {
    id: 'mtt-starting', gameType: 'mtt', status: 'registering', _starting: true,
    players: new Map([[17, { userId: 17, username: 'player' }]]),
  });

  const result = await manager.mttUnregister(17, 'mtt-starting');
  assert.match(result.error, /already started/);
  clearInterval(manager.tick);
});
