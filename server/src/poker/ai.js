// Multi-way poker AI for the casino tables. Synchronous, in-memory.
// Strategy: preflop hand tiers + pot odds; postflop made-hand strength +
// draw counting + randomized aggression. Deliberately beatable but not stupid.

const { bestHand } = require('./evaluator-multi');

const VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function cardValue(c) { return VALUES[c?.[0]] || 0; }
function cardSuit(c) { return c?.[1]; }

// 0-1 heuristic preflop score for two hole cards
function preflopScore(cards) {
  if (!cards || cards.length < 2) return 0;
  const [a, b] = cards.map(cardValue).sort((x, y) => y - x);
  const suited = cardSuit(cards[0]) === cardSuit(cards[1]);
  const gap = a - b;
  let score = (a / 14) * 0.55 + (b / 14) * 0.35;
  if (a === b) score += 0.25 + (a / 14) * 0.2;           // pairs
  else {
    if (suited) score += 0.08;
    if (gap === 1) score += 0.06;
    else if (gap === 2) score += 0.03;
    else if (gap > 4) score -= 0.06;
    if (a === 14) score += 0.07;                          // ace high
  }
  return Math.min(1, score);
}

// Count strong draws on the current board
function drawStrength(cards, community) {
  if (!community || community.length === 0 || community.length > 4) return 0;
  const suits = {};
  for (const c of [...cards, ...community]) {
    suits[cardSuit(c)] = (suits[cardSuit(c)] || 0) + 1;
  }
  let flushDraw = Object.values(suits).some(n => n === 4) ? 0.5 : 0;
  // Straight draw: 4 distinct values within a 5-window including hole cards
  const vals = [...new Set([...cards, ...community].map(cardValue))].sort((a, b) => a - b);
  let straightDraw = 0;
  for (let i = 0; i < vals.length; i++) {
    const window = vals.filter(v => v >= vals[i] && v <= vals[i] + 4);
    const usesHole = window.some(v => v === cardValue(cards[0]) || v === cardValue(cards[1]));
    if (window.length >= 4 && usesHole && !window.includes(vals[i] + 4)) straightDraw = Math.max(straightDraw, 0.4);
  }
  return Math.min(0.6, flushDraw + straightDraw);
}

const CAT_FLOOR = { 0: 0.0, 1: 0.3, 2: 0.42, 3: 0.52, 4: 0.68, 5: 0.74, 6: 0.85, 7: 0.93, 8: 0.99 };

function decide(table, seat) {
  const me = table.seats[seat];
  if (!me) return { action: 'fold' };

  const callAmount = Math.max(0, table.currentBet - (table.bets[seat] || 0));
  const potNow = table.pot + Object.values(table.bets).reduce((a, b) => a + b, 0);
  const opponents = table.liveSeats().filter(s => s !== seat).length;
  const rand = Math.random();
  const aggression = 0.35 + Math.random() * 0.3; // personality drift per decision

  // ── Preflop ──
  if (table.phase === 'preflop') {
    const score = preflopScore(me.cards);
    // Multiway → tighten
    const threshold = callAmount > 0
      ? Math.min(0.62, 0.38 + (opponents - 1) * 0.07 + (callAmount / Math.max(table.bigBlind, 1)) * 0.01)
      : Math.min(0.5, 0.26 + (opponents - 1) * 0.05);

    if (callAmount === 0) {
      if (score > 0.62 || (score > threshold + 0.12 && rand < aggression + 0.15)) {
        const raiseTo = table.bigBlind * (2.5 + Math.floor(rand * 2));
        return { action: 'raise', amount: Math.min(raiseTo, me.chips + (table.bets[seat] || 0)) };
      }
      return { action: 'check' };
    }
    const potOdds = callAmount / Math.max(potNow + callAmount, 1);
    if (score - 0.25 > potOdds * 2.2) {
      if (score > 0.75 && rand < aggression) {
        const raiseTo = table.currentBet * (2.5 + rand);
        return { action: 'raise', amount: Math.min(Math.floor(raiseTo), me.chips + (table.bets[seat] || 0)) };
      }
      return { action: 'call', amount: callAmount };
    }
    // Cheap limp with speculative hands
    if (callAmount <= table.bigBlind && score > 0.45 && rand < 0.4) {
      return { action: 'call', amount: callAmount };
    }
    return { action: 'fold' };
  }

  // ── Postflop ──
  const evalRes = bestHand(me.cards, table.community);
  const cat = evalRes.rank[0];
  let strength = CAT_FLOOR[cat] ?? 0;
  // Kicker improvement within category (0..1 across the rank array)
  if (evalRes.rank.length > 1) {
    strength += Math.min(0.12, (evalRes.rank[1] / 14) * 0.12);
  }
  strength = Math.min(1, strength + drawStrength(me.cards, table.community));

  const bluffing = rand < 0.10 - Math.min(0.05, opponents * 0.015);
  const effective = strength + (bluffing ? 0.35 : 0) + (aggression - 0.5) * 0.15;

  const betSize = (fraction) => Math.max(table.bigBlind, Math.floor(potNow * fraction));

  if (callAmount === 0) {
    if (effective > 0.62 && rand < 0.85) {
      return { action: 'bet', amount: betSize(rand < 0.5 ? 0.66 : 0.5) };
    }
    if (effective > 0.45 && rand < 0.35) {
      return { action: 'bet', amount: betSize(0.4) };
    }
    return { action: 'check' };
  }

  const potOdds = callAmount / Math.max(potNow + callAmount, 1);
  if (effective > 0.8 && rand < 0.55) {
    // Strong: raise for value
    const raiseTo = table.currentBet + Math.max(table.minRaiseSize, Math.floor(potNow * 0.75));
    return { action: 'raise', amount: Math.min(raiseTo, me.chips + (table.bets[seat] || 0)) };
  }
  if (effective >= potOdds * 2.6) {
    return { action: 'call', amount: callAmount };
  }
  // Small calls with medium strength in position-less spots
  if (effective > 0.4 && callAmount <= potNow * 0.25 && rand < 0.5) {
    return { action: 'call', amount: callAmount };
  }
  return { action: 'fold' };
}

module.exports = { decide };
