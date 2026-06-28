function settleHeadsUpBets({ p1Bet, p2Bet, p1Chips, p2Chips, pot }) {
  const bet1 = Math.max(0, Number(p1Bet) || 0);
  const bet2 = Math.max(0, Number(p2Bet) || 0);
  const matched = Math.min(bet1, bet2);
  const p1Refund = Math.max(0, bet1 - matched);
  const p2Refund = Math.max(0, bet2 - matched);

  return {
    p1Bet: matched,
    p2Bet: matched,
    p1Chips: (Number(p1Chips) || 0) + p1Refund,
    p2Chips: (Number(p2Chips) || 0) + p2Refund,
    pot: Math.max(0, (Number(pot) || 0) - p1Refund - p2Refund),
    refund: p1Refund > 0
      ? { player: 1, amount: p1Refund }
      : p2Refund > 0
        ? { player: 2, amount: p2Refund }
        : null,
  };
}

function getRunoutStreets(communityCount) {
  const streets = [];
  let count = Math.max(0, Number(communityCount) || 0);

  if (count < 3) {
    streets.push({ phase: 'flop', count: 3 - count });
    count = 3;
  }
  if (count < 4) {
    streets.push({ phase: 'turn', count: 1 });
    count = 4;
  }
  if (count < 5) streets.push({ phase: 'river', count: 1 });

  return streets;
}

function normalizeRaise({ amount, myBet, myChips, currentBet, bigBlind }) {
  const committed = Math.max(0, Number(myBet) || 0);
  const stack = Math.max(0, Number(myChips) || 0);
  const tableBet = Math.max(0, Number(currentBet) || 0);
  const blind = Math.max(1, Number(bigBlind) || 1);
  const maxTotal = committed + stack;
  const requested = Math.floor(Number(amount));
  const minTotal = tableBet === 0 ? blind : tableBet + blind;

  if (!Number.isFinite(requested) || requested <= committed) {
    return { error: 'Invalid bet amount' };
  }

  const total = Math.min(requested, maxTotal);
  if (total <= tableBet) return { error: 'Raise must exceed the current bet' };

  const isAllIn = total === maxTotal;
  if (total < minTotal && !isAllIn) {
    return { error: `Minimum raise is ${minTotal}` };
  }

  return { total, addAmount: total - committed, minTotal, maxTotal, isAllIn };
}

function getDealerForNextHand(handNumber, currentDealer) {
  const dealer = Number(currentDealer) === 1 ? 1 : 0;
  return Number(handNumber) === 0 ? dealer : dealer === 0 ? 1 : 0;
}

module.exports = { settleHeadsUpBets, getRunoutStreets, normalizeRaise, getDealerForNextHand };
