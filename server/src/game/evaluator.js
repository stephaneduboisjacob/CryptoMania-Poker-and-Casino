// Texas Hold'em hand evaluator

const VALUE_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function cardValue(card) { return VALUE_MAP[card[0]]; }
function cardSuit(card) { return card[1]; }

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, k - 1).map(c => [first, ...c]),
    ...getCombinations(rest, k)
  ];
}

function rankHand(cards) {
  // cards: array of 5 card strings
  const vals = cards.map(cardValue).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = (() => {
    const uv = [...new Set(vals)].sort((a, b) => b - a);
    if (uv.length < 5) return false;
    // Normal straight
    if (uv[0] - uv[4] === 4 && uv.length === 5) return true;
    // Wheel: A-2-3-4-5
    if (JSON.stringify(uv) === JSON.stringify([14, 5, 4, 3, 2])) return true;
    return false;
  })();

  // Straight value (top card), handle wheel
  const straightHigh = (() => {
    const uv = [...new Set(vals)].sort((a, b) => b - a);
    if (JSON.stringify(uv) === JSON.stringify([14, 5, 4, 3, 2])) return 5;
    return uv[0];
  })();

  // Score: [rank, ...tiebreakers]
  if (isFlush && isStraight) return [8, straightHigh];
  if (groups[0] === 4) {
    const quad = +Object.keys(counts).find(k => counts[k] === 4);
    const kick = +Object.keys(counts).find(k => counts[k] === 1);
    return [7, quad, kick];
  }
  if (groups[0] === 3 && groups[1] === 2) {
    const trip = +Object.keys(counts).find(k => counts[k] === 3);
    const pair = +Object.keys(counts).find(k => counts[k] === 2);
    return [6, trip, pair];
  }
  if (isFlush) return [5, ...vals];
  if (isStraight) return [4, straightHigh];
  if (groups[0] === 3) {
    const trip = +Object.keys(counts).find(k => counts[k] === 3);
    const kicks = Object.keys(counts).filter(k => counts[k] === 1).map(Number).sort((a, b) => b - a);
    return [3, trip, ...kicks];
  }
  if (groups[0] === 2 && groups[1] === 2) {
    const pairs = Object.keys(counts).filter(k => counts[k] === 2).map(Number).sort((a, b) => b - a);
    const kick = +Object.keys(counts).find(k => counts[k] === 1);
    return [2, ...pairs, kick];
  }
  if (groups[0] === 2) {
    const pair = +Object.keys(counts).find(k => counts[k] === 2);
    const kicks = Object.keys(counts).filter(k => counts[k] === 1).map(Number).sort((a, b) => b - a);
    return [1, pair, ...kicks];
  }
  return [0, ...vals];
}

function compareRanks(r1, r2) {
  for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
    const a = r1[i] ?? 0, b = r2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

const HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];

function bestHand(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards];
  const combos = getCombinations(all, 5);
  let best = null, bestRank = null;
  for (const combo of combos) {
    const rank = rankHand(combo);
    if (!bestRank || compareRanks(rank, bestRank) > 0) {
      best = combo;
      bestRank = rank;
    }
  }
  return { cards: best, rank: bestRank, name: HAND_NAMES[bestRank[0]] };
}

function determineWinner(p1Hole, p2Hole, community) {
  const h1 = bestHand(p1Hole, community);
  const h2 = bestHand(p2Hole, community);
  const cmp = compareRanks(h1.rank, h2.rank);
  if (cmp > 0) return { winner: 1, h1, h2 };
  if (cmp < 0) return { winner: 2, h1, h2 };
  return { winner: 0, h1, h2 }; // tie
}

module.exports = { bestHand, determineWinner, HAND_NAMES };
