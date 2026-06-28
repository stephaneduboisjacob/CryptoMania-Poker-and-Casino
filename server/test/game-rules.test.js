const test = require('node:test');
const assert = require('node:assert/strict');

const { determineWinner } = require('../src/game/evaluator');
const { settleHeadsUpBets, getRunoutStreets, normalizeRaise, getDealerForNextHand } = require('../src/game/rules');

test('an all-in on the flop schedules both turn and river before showdown', () => {
  assert.deepEqual(getRunoutStreets(3), [
    { phase: 'turn', count: 1 },
    { phase: 'river', count: 1 },
  ]);
});

test('a preflop all-in schedules a complete five-card board', () => {
  assert.deepEqual(getRunoutStreets(0), [
    { phase: 'flop', count: 3 },
    { phase: 'turn', count: 1 },
    { phase: 'river', count: 1 },
  ]);
});

test('uncalled all-in chips are returned to the covering stack', () => {
  assert.deepEqual(settleHeadsUpBets({
    p1Bet: 1000,
    p2Bet: 600,
    p1Chips: 0,
    p2Chips: 0,
    pot: 1900,
  }), {
    p1Bet: 600,
    p2Bet: 600,
    p1Chips: 400,
    p2Chips: 0,
    pot: 1500,
    refund: { player: 1, amount: 400 },
  });
});

test('an all-in below the normal minimum raise is legal', () => {
  assert.deepEqual(normalizeRaise({
    amount: 250,
    myBet: 100,
    myChips: 150,
    currentBet: 200,
    bigBlind: 100,
  }), {
    total: 250,
    addAmount: 150,
    minTotal: 300,
    maxTotal: 250,
    isAllIn: true,
  });
});

test('a non-all-in raise below the minimum is rejected', () => {
  assert.equal(normalizeRaise({
    amount: 250,
    myBet: 100,
    myChips: 1000,
    currentBet: 200,
    bigBlind: 100,
  }).error, 'Minimum raise is 300');
});

test('pocket tens are evaluated only against the complete board', () => {
  const result = determineWinner(
    ['Ts', 'Th'],
    ['As', 'Kd'],
    ['2c', '7d', '9h', 'Ac', '3s'],
  );
  assert.equal(result.winner, 2);
  assert.equal(result.h1.name, 'One Pair');
  assert.equal(result.h2.name, 'One Pair');
});

test('board-only hands split the pot', () => {
  const result = determineWinner(
    ['2s', '3s'],
    ['4d', '5d'],
    ['Ah', 'Kh', 'Qh', 'Jh', 'Th'],
  );
  assert.equal(result.winner, 0);
  assert.equal(result.h1.name, 'Straight Flush');
});

test('the drawn dealer starts hand one and then alternates each hand', () => {
  assert.equal(getDealerForNextHand(0, 0), 0);
  assert.equal(getDealerForNextHand(0, 1), 1);
  assert.equal(getDealerForNextHand(1, 0), 1);
  assert.equal(getDealerForNextHand(8, 1), 0);
});
