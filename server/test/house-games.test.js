const test = require('node:test');
const assert = require('node:assert/strict');
const { floatStream, hmacBytes } = require('../src/house/fair');
const { betWins } = require('../src/house/roulette');
const { BaccaratTable } = require('../src/house/baccarat');
const { CrashTable } = require('../src/house/crash');
const { BlackjackTable, isBlackjack } = require('../src/house/blackjack');
const {
  SLOT_MACHINES, slotRtp, spinSlots, playDice, vpDeck, vpDeal, vpEvaluate,
  PLINKO_TABLES, plinkoRtp, playPlinko, baccaratValue, playBaccaratCoup,
  minesMultiplier,
} = require('../src/house/instant');

test('fair float stream preserves the full unsigned 32-bit range', () => {
  const seed = 'known-server-seed';
  let nonce = 0;
  let expected;
  do {
    expected = hmacBytes(seed, 'known-client-seed', nonce, 0).readUInt32BE(0);
    nonce++;
  } while (expected < 0xfa000000 && nonce < 10000);

  assert.ok(expected >= 0xfa000000, 'fixture should exercise the formerly truncated upper range');
  const actual = floatStream(seed, 'known-client-seed', nonce - 1)();
  assert.equal(actual, expected / 2 ** 32);
  assert.ok(actual < 1);
});

test('roulette pays straight zero pockets and zero defeats every outside bet', () => {
  assert.equal(betWins('straight', 0, 0), true);
  assert.equal(betWins('straight', '00', '00'), true);
  for (const bet of ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3']) {
    assert.equal(betWins(bet, null, 0), false, `${bet} should lose on 0`);
    assert.equal(betWins(bet, null, '00'), false, `${bet} should lose on 00`);
  }
  assert.equal(betWins('red', null, 1), true);
  assert.equal(betWins('black', null, 2), true);
});

test('roulette reconnect state restores the requesting user’s current bets', () => {
  const { HouseManager } = require('../src/house/manager');
  const { RouletteTable } = require('../src/house/roulette');
  const table = Object.create(RouletteTable.prototype);
  Object.assign(table, {
    game: 'roulette', id: 'table', name: 'Test', currency: 'play', minBet: 1, maxBet: 100,
    wheelType: 'european', phase: 'betting', phaseEndsAt: Date.now() + 10000, roundNo: 4,
    result: null, spinAngle: 0, intents: new Map([
      ['u1', { userId: 'u1', username: 'one', bets: [{ type: 'red', num: null, amount: 12 }] }],
      ['u2', { userId: 'u2', username: 'two', bets: [{ type: 'black', num: null, amount: 20 }] }],
    ]), history: [], lastWinners: [],
  });
  const manager = Object.create(HouseManager.prototype);
  manager.tables = new Map([['table', table]]);

  assert.deepEqual(manager.stateFor('table', 'u1').myBets, [{ type: 'red', num: null, amount: 12 }]);
  assert.deepEqual(manager.stateFor('table', 'u2').myBets, [{ type: 'black', num: null, amount: 20 }]);
});

test('baccarat public state reveals only cards whose reveal step has passed', () => {
  const table = Object.create(BaccaratTable.prototype);
  Object.assign(table, {
    id: 'table', name: 'Test', currency: 'play', minBet: 1, maxBet: 100,
    phase: 'dealing', phaseEndsAt: 0, roundNo: 1, revealed: 2,
    coup: {
      playerCards: ['As', '2h', '3d'], bankerCards: ['Ks', '5h', '7d'],
      playerTotal: 6, bankerTotal: 2, outcome: 'player',
    },
    intents: new Map(), history: [],
  });

  let state = table.publicState();
  assert.deepEqual(state.cards, { player: ['As', '2h'], banker: [] });
  assert.equal(state.playerTotal, null);
  assert.equal(state.bankerTotal, null);

  table.revealed = 4;
  state = table.publicState();
  assert.deepEqual(state.cards, { player: ['As', '2h'], banker: ['Ks', '5h'] });
  assert.equal(state.bankerTotal, null);

  table.revealed = 5;
  state = table.publicState();
  assert.deepEqual(state.cards.player, ['As', '2h', '3d']);
  assert.equal(state.playerTotal, 6);
  assert.equal(state.cards.banker.length, 2);

  table.phase = 'result';
  table.revealed = 6;
  state = table.publicState();
  assert.deepEqual(state.cards.banker, ['Ks', '5h', '7d']);
  assert.equal(state.outcome, 'player');
});

test('baccarat keeps private bet markers through updates and clears only the caller bets', () => {
  const table = Object.create(BaccaratTable.prototype);
  Object.assign(table, {
    game: 'baccarat', id: 'table', name: 'Test', currency: 'play', minBet: 1, maxBet: 100,
    phase: 'betting', phaseEndsAt: Date.now() + 10000, roundNo: 4, revealed: 0,
    coup: null, intents: new Map(), history: [], emitState() { this.stateEmissions = (this.stateEmissions || 0) + 1; },
  });

  assert.deepEqual(table.placeBet('u1', 'one', 'player', 12), { ok: true, staked: 12 });
  assert.deepEqual(table.placeBet('u2', 'two', 'banker', 20), { ok: true, staked: 20 });
  assert.deepEqual(table.intents.get('u1').bets, [{ side: 'player', amount: 12 }]);
  assert.deepEqual(table.clearBets('u1'), { ok: true });
  assert.equal(table.intents.has('u1'), false);
  assert.deepEqual(table.intents.get('u2').bets, [{ side: 'banker', amount: 20 }]);
  assert.equal(table.stateEmissions, 3);

  table.phase = 'dealing';
  assert.match(table.clearBets('u2').error, /Too late/);
  assert.equal(table.intents.has('u2'), true);
});

test('baccarat reconnect state restores only the requesting user’s active bets', () => {
  const { HouseManager } = require('../src/house/manager');
  const table = Object.create(BaccaratTable.prototype);
  Object.assign(table, {
    game: 'baccarat', id: 'table', name: 'Test', currency: 'play', minBet: 1, maxBet: 100,
    phase: 'betting', phaseEndsAt: Date.now() + 10000, roundNo: 4, revealed: 0,
    coup: null, intents: new Map([
      ['u1', { userId: 'u1', username: 'one', bets: [{ side: 'player', amount: 12 }] }],
      ['u2', { userId: 'u2', username: 'two', bets: [{ side: 'banker', amount: 20 }] }],
    ]), history: [],
  });
  const manager = Object.create(HouseManager.prototype);
  manager.tables = new Map([['table', table]]);

  assert.deepEqual(manager.stateFor('table', 'u1').myBets, [{ side: 'player', amount: 12 }]);
  assert.deepEqual(manager.stateFor('table', 'u2').myBets, [{ side: 'banker', amount: 20 }]);
});

test('crash accepts valid auto cashout and enforces the aggregate round maximum', () => {
  const table = Object.create(CrashTable.prototype);
  Object.assign(table, {
    phase: 'betting', minBet: 10, maxBet: 100, intents: new Map(),
    emitState() {},
  });

  assert.match(table.placeBet('u', 'player', 10, 1.005).error, /Auto cashout/);
  assert.match(table.placeBet('u', 'player', 10, 5001).error, /Auto cashout/);
  assert.deepEqual(table.placeBet('u', 'player', 70, 2), { ok: true });
  assert.match(table.placeBet('u', 'player', 40, 3).error, /Maximum bet/);
  assert.deepEqual(table.placeBet('u', 'player', 30, 3), { ok: true });
  assert.equal(table.intents.get('u').amount, 100);
  assert.equal(table.intents.get('u').autoCashout, 3);
});

test('blackjack waits for the double debit before drawing and rejects a duplicate action', async () => {
  let finishDebit;
  let debitCalls = 0;
  const hand = { cards: ['8s', '3h'], bet: 20, done: false };
  const player = { userId: 'u', hands: [hand] };
  const table = Object.create(BlackjackTable.prototype);
  Object.assign(table, {
    phase: 'turn', turnIdx: 0, handIdx: 0, players: [player], destroyed: false,
    manager: { doubleBet: () => { debitCalls++; return new Promise(resolve => { finishDebit = resolve; }); } },
    draw: () => '2c', emitState() {}, nextHand: () => ({ ok: true }),
    scheduleTurnAgain() { this.rearmed = true; },
  });

  const pending = table.applyAction('u', 'double');
  assert.equal(hand.actionPending, true);
  assert.deepEqual(hand.cards, ['8s', '3h']);
  assert.deepEqual(await table.applyAction('u', 'double'), { error: 'Action is still processing' });
  assert.equal(debitCalls, 1);

  finishDebit({ ok: true });
  assert.deepEqual(await pending, { ok: true });
  assert.equal(hand.actionPending, false);
  assert.equal(hand.bet, 40);
  assert.deepEqual(hand.cards, ['8s', '3h', '2c']);
  assert.equal(hand.done, true);
});

test('blackjack leaves the hand unchanged and rearms its turn after a failed double debit', async () => {
  const hand = { cards: ['8s', '3h'], bet: 20, done: false };
  const player = { userId: 'u', hands: [hand] };
  const table = Object.create(BlackjackTable.prototype);
  Object.assign(table, {
    phase: 'turn', turnIdx: 0, handIdx: 0, players: [player], destroyed: false,
    manager: { async doubleBet() { return { error: 'Insufficient balance' }; } },
    draw() { throw new Error('must not draw without a debit'); }, emitState() {}, nextHand() {},
    scheduleTurnAgain() { this.rearmed = true; },
  });

  assert.deepEqual(await table.applyAction('u', 'double'), { error: 'Insufficient balance' });
  assert.equal(hand.actionPending, false);
  assert.equal(hand.bet, 20);
  assert.deepEqual(hand.cards, ['8s', '3h']);
  assert.equal(table.rearmed, true);
});

test('crash cashout stays pending until its credit is confirmed and blocks duplicates', async () => {
  let confirmCredit;
  const player = { userId: 'u', username: 'player', amount: 100, cashedAt: null, cashedMult: 0 };
  const table = Object.create(CrashTable.prototype);
  Object.assign(table, {
    id: 'crash-test', currency: 'play', phase: 'running', destroyed: false,
    crashPoint: 100, t0: Date.now() - 100, intents: new Map([['u', player]]), history: [],
    manager: { creditCrashCashout: () => new Promise(resolve => { confirmCredit = resolve; }) },
    io: { to: () => ({ emit() {} }), emit() {} },
  });

  const pending = table.cashout('u');
  assert.equal(player.pendingCashout, true);
  assert.equal(player.cashedAt, null);
  assert.deepEqual(await table.cashout('u'), { error: 'Cashout is processing' });
  confirmCredit(true);
  assert.deepEqual(await pending, { ok: true, mult: 1.01, payout: 101 });
  assert.equal(player.pendingCashout, false);
  assert.ok(player.cashedAt > 0);
});

test('blackjack natural pushes against dealer natural return the original wager', () => {
  const table = Object.create(BlackjackTable.prototype);
  const natural = { userId: 'u', hands: [{ cards: ['As', 'Kh'], bet: 50, done: false }] };
  const ordinary = { userId: 'v', hands: [{ cards: ['9s', '7h'], bet: 50, done: false }] };
  let settled;
  Object.assign(table, {
    players: [natural, ordinary], dealer: ['Ah', 'Td'],
    finishRound(payouts) { settled = payouts; },
  });

  assert.equal(isBlackjack(natural.hands[0].cards), true);
  table.settleDealerBlackjack();
  assert.deepEqual(settled, [{ userId: 'u', amount: 50 }]);
  assert.equal(natural.result, 'push');
  assert.equal(ordinary.result, 'lose');
});

test('all slot par sheets produce deterministic playable outcomes below 97% RTP', () => {
  assert.equal(Object.keys(SLOT_MACHINES).length, 25);
  for (const [id, machine] of Object.entries(SLOT_MACHINES)) {
    assert.ok(slotRtp(id) > 0 && slotRtp(id) < 0.97, `${id} RTP must remain house-favorable`);
    const result = spinSlots(id, () => 0);
    assert.equal(result.reels.length, machine.reels || 3, `${id} reel count`);
    assert.ok(result.pay > 0, `${id} should select its first winning par-sheet row`);
  }
  assert.equal(spinSlots('missing-machine'), null);
});

test('slot losing-grid fallback preserves each machine’s reel count', () => {
  for (const [id, machine] of Object.entries(SLOT_MACHINES)) {
    const winWeight = machine.sheet.reduce((sum, row) => sum + row.w, 0);
    const totalWeight = winWeight + machine.loseWeight;
    const firstWin = machine.sheet[0].syms.map((symbol, index, row) => (
      symbol === 'ANY' ? machine.symbols.find(candidate => !row.some((fixed, j) => j !== index && fixed === candidate)) : symbol
    ));
    let calls = 0;
    const rng = () => {
      if (calls++ === 0) return (winWeight + 0.5) / totalWeight; // choose the losing weight
      const reel = (calls - 2) % firstWin.length;
      return (machine.symbols.indexOf(firstWin[reel]) + 0.25) / machine.symbols.length;
    };
    const result = spinSlots(id, rng);
    assert.equal(result.pay, 0, `${id} fallback must remain a losing result`);
    assert.equal(result.reels.length, machine.reels || 3, `${id} fallback reel count`);
  }
});

test('dice validates targets and resolves boundary rolls deterministically', () => {
  assert.match(playDice(1, 'under').error, /2-98/);
  assert.match(playDice(99, 'over').error, /2-98/);
  assert.match(playDice(50, 'sideways').error, /under\|over/);
  assert.equal(playDice(50, 'under', () => 0.4999).win, true);
  assert.equal(playDice(50, 'under', () => 0.5).win, false);
  assert.equal(playDice(50, 'over', () => 0.5001).win, true);
  assert.equal(playDice(50, 'over', () => 0.5).win, false);
});

test('video poker deals five unique cards and recognizes its payout hands', () => {
  assert.equal(vpDeck().length, 52);
  const { dealt, remaining } = vpDeal(() => 0);
  assert.equal(dealt.length, 5);
  assert.equal(new Set(dealt).size, 5);
  assert.equal(remaining.length, 47);
  assert.equal(new Set([...dealt, ...remaining]).size, 52);
  assert.equal(vpEvaluate(['Ts', 'Js', 'Qs', 'Ks', 'As']), 'royal');
  assert.equal(vpEvaluate(['As', '2h', '3d', '4c', '5s']), 'straight');
  assert.equal(vpEvaluate(['Jh', 'Jd', '2c', '5s', '9h']), 'jacks');
  assert.equal(vpEvaluate(['2h', '4d', '6c', '8s', 'Th']), 'none');
});

test('video poker persists one open hand, restores it, and rejects a free reroll', async () => {
  const pool = require('../src/db');
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  let openRound = null;
  let debitCount = 0;
  let fairnessCount = 0;

  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT id FROM users')) return { rows: [{ id: 7 }] };
      if (sql.includes("FROM house_rounds") && sql.includes("status='open'")) {
        return { rows: openRound ? [{ id: openRound.id }] : [] };
      }
      if (sql.includes('INSERT INTO fair_seeds')) {
        fairnessCount++;
        return { rows: [{
          server_seed: 'deterministic-test-seed', server_seed_hash: 'test-hash',
          client_seed: 'test-client', nonce: 1,
        }] };
      }
      if (sql.includes('INSERT INTO house_rounds')) {
        openRound = { id: params[0], bets: JSON.parse(params[3]) };
        return { rows: [] };
      }
      throw new Error(`Unexpected test SQL: ${sql}`);
    },
    release() {},
  };

  pool.connect = async () => client;
  pool.query = async (sql, params = []) => {
    assert.match(sql, /FROM house_rounds/);
    assert.equal(params[0], 'videopoker');
    return { rows: openRound ? [{ id: openRound.id, bets: openRound.bets }] : [] };
  };

  try {
    const manager = {
      async getPrice() { return null; },
      async debit(_client, _userId, currency, amount) {
        assert.equal(currency, 'play');
        debitCount++;
        return { play: amount };
      },
      async recordTx() {},
    };
    const router = require('../src/house/routes')(manager);
    const routeFor = (path) => {
      const layer = router.stack.find(item => item.route?.path === path);
      assert.ok(layer, `missing route ${path}`);
      return layer.route.stack.at(-1).handle;
    };
    const call = async (handler, req) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await handler(req, res);
      return res;
    };

    const deal = routeFor('/vp/:machineId/deal');
    const current = routeFor('/vp/:machineId/current');
    const req = { params: { machineId: 'videopoker' }, body: { bet: 10 }, user: { id: 7, username: 'tester' } };
    const first = await call(deal, req);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.hand.length, 5);
    assert.equal(debitCount, 1);
    assert.equal(fairnessCount, 1);

    const restored = await call(current, { ...req, body: undefined });
    assert.equal(restored.body.round.roundId, first.body.roundId);
    assert.deepEqual(restored.body.round.hand, first.body.hand);
    assert.equal('deck' in restored.body.round, false);

    const duplicate = await call(deal, req);
    assert.equal(duplicate.statusCode, 409);
    assert.equal(debitCount, 1);
    assert.equal(fairnessCount, 1);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test('plinko follows all 16 path steps and resolves its edge buckets', () => {
  for (const risk of Object.keys(PLINKO_TABLES)) assert.ok(plinkoRtp(risk) > 0 && plinkoRtp(risk) < 1);
  const left = playPlinko('low', () => 0.75);
  const right = playPlinko('low', () => 0.25);
  assert.equal(left.path.length, 16);
  assert.equal(left.bucket, 0);
  assert.equal(left.multiplier, PLINKO_TABLES.low[0]);
  assert.equal(right.bucket, 16);
  assert.equal(right.multiplier, PLINKO_TABLES.low[16]);
  assert.match(playPlinko('extreme').error, /low\|medium\|high/);
});

test('baccarat follows third-card rules and handles modulo-ten totals', () => {
  assert.equal(baccaratValue(['9s', '8d']), 7);
  const naturalCards = ['8s', 'Kd', '4s', '4d'];
  let draws = 0;
  const natural = playBaccaratCoup(() => { draws++; return naturalCards.shift(); });
  assert.equal(draws, 4);
  assert.equal(natural.outcome, 'tie');

  const tableauCards = ['As', '5d', 'Ad', '3c', '6h'];
  draws = 0;
  const tableau = playBaccaratCoup(() => { draws++; return tableauCards.shift(); });
  assert.equal(draws, 5);
  assert.equal(tableau.playerCards.length, 2);
  assert.equal(tableau.bankerCards.length, 3);
  assert.equal(tableau.bankerTotal, 0);
});

test('mines multiplier is monotonic for safe picks and rejects impossible inputs', () => {
  assert.equal(minesMultiplier(1, 0), 0.97);
  assert.equal(minesMultiplier(1, 1), 1.01);
  assert.ok(minesMultiplier(5, 4) > minesMultiplier(5, 3));
  assert.equal(minesMultiplier(0, 1), null);
  assert.equal(minesMultiplier(25, 1), null);
  assert.equal(minesMultiplier(5, 21), null);
});

test('mines round starts hidden, restores safe picks, cashes out once, and settles a mine hit', async () => {
  const pool = require('../src/db');
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  let round = null;
  let debits = 0;
  let credits = 0;
  const client = {
    async query(sql, params = []) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql.includes('INSERT INTO fair_seeds')) return { rows: [{
        server_seed: 'known-mines-server-seed', server_seed_hash: 'known-hash',
        client_seed: 'known-client', nonce: 1,
      }] };
      if (sql.includes("SELECT id FROM house_rounds") && sql.includes("game='mines'")) {
        return { rows: round?.status === 'open' ? [{ id: round.id }] : [] };
      }
      if (sql.startsWith('INSERT INTO house_rounds(id, game, table_id, currency, bets, results, status)')) {
        round = {
          id: params[0], game: 'mines', status: 'open',
          bets: JSON.parse(params[1]), results: JSON.parse(params[2]),
        };
        return { rows: [] };
      }
      if (sql.startsWith("SELECT * FROM house_rounds WHERE id=$1 AND game='mines'")) {
        return { rows: round?.id === params[0] && round.status === 'open' ? [round] : [] };
      }
      if (sql.startsWith("UPDATE house_rounds SET status='settled'")) {
        round.results = JSON.parse(params[1]);
        round.status = 'settled';
        return { rows: [] };
      }
      if (sql.startsWith('UPDATE house_rounds SET status=$3')) {
        round.results = JSON.parse(params[1]);
        round.status = params[2];
        return { rows: [] };
      }
      throw new Error(`Unexpected Mines test SQL: ${sql}`);
    },
    release() {},
  };
  pool.connect = async () => client;
  pool.query = async (sql, params = []) => {
    assert.match(sql, /game='mines'.*status='open'/s);
    assert.equal(params[0], '71');
    return { rows: round?.status === 'open' ? [round] : [] };
  };

  try {
    const manager = {
      async debit() { debits++; return { play: 20 }; },
      async credit(_client, _userId, _currency, amount) { credits += amount; },
      async recordTx() {},
      io: { emit() {} },
    };
    const router = require('../src/house/routes')(manager);
    const handlerFor = path => {
      const layer = router.stack.find(item => item.route?.path === path);
      assert.ok(layer, `missing route ${path}`);
      return layer.route.stack.at(-1).handle;
    };
    const call = async (handler, body = {}) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
      };
      await handler({ params: {}, body, user: { id: 71, username: 'mines-test' } }, res);
      return res;
    };
    const start = handlerFor('/mines/start');
    const current = handlerFor('/mines/current');
    const reveal = handlerFor('/mines/reveal');
    const cashout = handlerFor('/mines/cashout');

    const first = await call(start, { bet: 20, mines: 3 });
    assert.equal(first.statusCode, 200);
    assert.equal('mines' in first.body, false, 'the initial response must not reveal mine positions');
    const firstId = first.body.roundId;
    const currentState = await call(current);
    assert.equal(currentState.body.round.roundId, firstId);
    assert.equal('mines' in currentState.body.round, false);

    const safeTile = Array.from({ length: 25 }, (_, i) => i).find(i => !round.results.mines.includes(i));
    const safe = await call(reveal, { roundId: firstId, tile: safeTile });
    assert.equal(safe.body.safe, true);
    assert.equal(safe.body.revealed, 1);
    assert.equal(safe.body.mines, undefined, 'mine positions stay hidden during an open hand');
    assert.equal((await call(current)).body.round.revealed[0], safeTile);
    assert.equal((await call(reveal, { roundId: firstId, tile: safeTile })).statusCode, 400);

    const paid = await call(cashout, { roundId: firstId });
    assert.equal(paid.body.ok, true);
    assert.equal(paid.body.payout, Math.floor(20 * minesMultiplier(3, 1)));
    assert.deepEqual(paid.body.mines, round.results.mines);
    assert.equal(credits, paid.body.payout);
    assert.equal((await call(cashout, { roundId: firstId })).statusCode, 404);

    const second = await call(start, { bet: 20, mines: 3 });
    const mineTile = round.results.mines[0];
    const busted = await call(reveal, { roundId: second.body.roundId, tile: mineTile });
    assert.equal(busted.body.bust, true);
    assert.deepEqual(busted.body.mines, round.results.mines);
    assert.equal(round.status, 'settled');
    assert.equal(debits, 2);
    assert.equal(credits, paid.body.payout);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});
