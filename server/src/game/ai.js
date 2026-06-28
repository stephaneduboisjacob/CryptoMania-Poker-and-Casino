/**
 * Heisenberg Rooms — Advanced Poker AI
 *
 * Four difficulty levels:
 *   easy   – basic hand-strength play, no adaptation
 *   medium – pot-odds, position, c-bet strategy
 *   hard   – opponent range modeling, exploitative adjustments, multi-street planning
 *   insane – full range vs range equity, polarised rivers, ICM push/fold, alpha-balanced bluffs
 */

const { bestHand } = require('./evaluator');
const { createDeck } = require('./deck');
const pool = require('../db');

// ─── Constants ─────────────────────────────────────────────────────────────────

const VALUE_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
const VAL_KEYS = Object.keys(VALUE_MAP);

// Preflop hand strength lookup (0–1), heads-up adjusted
const HU_STRENGTHS = (() => {
  const s = {};
  // Pocket pairs
  s['AA']=1.00; s['KK']=0.97; s['QQ']=0.94; s['JJ']=0.90; s['TT']=0.86;
  s['99']=0.82; s['88']=0.78; s['77']=0.74; s['66']=0.70; s['55']=0.66;
  s['44']=0.62; s['33']=0.58; s['22']=0.54;
  // Suited broadways/Ax
  s['AKs']=0.98; s['AQs']=0.88; s['AJs']=0.83; s['ATs']=0.79; s['A9s']=0.73;
  s['A8s']=0.69; s['A7s']=0.66; s['A6s']=0.63; s['A5s']=0.65; s['A4s']=0.63;
  s['A3s']=0.61; s['A2s']=0.59;
  s['KQs']=0.84; s['KJs']=0.79; s['KTs']=0.75; s['K9s']=0.68; s['K8s']=0.62;
  s['K7s']=0.59; s['K6s']=0.57; s['K5s']=0.55; s['K4s']=0.53; s['K3s']=0.51; s['K2s']=0.50;
  s['QJs']=0.76; s['QTs']=0.72; s['Q9s']=0.66; s['Q8s']=0.60; s['Q7s']=0.56; s['Q6s']=0.53;
  s['JTs']=0.73; s['J9s']=0.67; s['J8s']=0.62; s['J7s']=0.57;
  s['T9s']=0.68; s['T8s']=0.63; s['T7s']=0.58;
  s['98s']=0.65; s['97s']=0.60; s['96s']=0.56;
  s['87s']=0.62; s['86s']=0.57; s['76s']=0.60; s['75s']=0.56; s['65s']=0.58; s['54s']=0.55;
  // Offsuit
  s['AKo']=0.93; s['AQo']=0.82; s['AJo']=0.76; s['ATo']=0.71; s['A9o']=0.64; s['A8o']=0.60;
  s['A7o']=0.57; s['A6o']=0.54; s['A5o']=0.57; s['A4o']=0.54; s['A3o']=0.52; s['A2o']=0.50;
  s['KQo']=0.77; s['KJo']=0.72; s['KTo']=0.67; s['K9o']=0.60; s['K8o']=0.55;
  s['QJo']=0.69; s['QTo']=0.64; s['Q9o']=0.58;
  s['JTo']=0.65; s['J9o']=0.59; s['J8o']=0.54;
  s['T9o']=0.60; s['T8o']=0.55; s['98o']=0.56; s['87o']=0.52; s['76o']=0.52;
  return s;
})();

function preflopKey(c1, c2) {
  const v1 = VALUE_MAP[c1[0]], v2 = VALUE_MAP[c2[0]];
  const s1 = c1[1], s2 = c2[1];
  const suited = s1 === s2 ? 's' : 'o';
  const hi = Math.max(v1,v2), lo = Math.min(v1,v2);
  const hiC = VAL_KEYS.find(k => VALUE_MAP[k]===hi);
  const loC = VAL_KEYS.find(k => VALUE_MAP[k]===lo);
  if (hi === lo) return hiC + hiC;
  return hiC + loC + suited;
}

function preflopStrength(hole) {
  return HU_STRENGTHS[preflopKey(hole[0], hole[1])] ?? 0.38;
}

// ─── Difficulty config ────────────────────────────────────────────────────────

const DIFF = {
  easy: {
    dealerOpenRange: 0.52, bbDefendRange: 0.45,
    threebet: 0.10, foldTo3bet: 0.65,
    cbetDry: 0.45, cbetWet: 0.30, cbetSize: 0.55,
    bluffMult: 0.50, valueMult: 0.80,
    exploitMult: 0.0,   // no adaptation
    mcIterations: 200,
    polarizeRiver: false,
    useRangeEquity: false,
    pushFoldAccurate: false,
    randomNoise: 0.14,
  },
  medium: {
    dealerOpenRange: 0.66, bbDefendRange: 0.58,
    threebet: 0.14, foldTo3bet: 0.50,
    cbetDry: 0.65, cbetWet: 0.48, cbetSize: 0.60,
    bluffMult: 0.80, valueMult: 0.90,
    exploitMult: 0.5,
    mcIterations: 400,
    polarizeRiver: false,
    useRangeEquity: false,
    pushFoldAccurate: true,
    randomNoise: 0.08,
  },
  hard: {
    dealerOpenRange: 0.76, bbDefendRange: 0.67,
    threebet: 0.18, foldTo3bet: 0.38,
    cbetDry: 0.70, cbetWet: 0.58, cbetSize: 0.65,
    bluffMult: 1.00, valueMult: 1.00,
    exploitMult: 0.9,
    mcIterations: 600,
    polarizeRiver: true,
    useRangeEquity: true,
    pushFoldAccurate: true,
    randomNoise: 0.04,
  },
  insane: {
    dealerOpenRange: 0.80, bbDefendRange: 0.72,
    threebet: 0.22, foldTo3bet: 0.28,
    cbetDry: 0.75, cbetWet: 0.63, cbetSize: 0.70,
    bluffMult: 1.15, valueMult: 1.05,
    exploitMult: 1.2,
    mcIterations: 800,
    polarizeRiver: true,
    useRangeEquity: true,
    pushFoldAccurate: true,
    randomNoise: 0.02,
  },
};

// ─── Board texture ────────────────────────────────────────────────────────────

function analyzeBoard(community) {
  if (!community.length) return { dry: true, wet: false, paired: false, monotone: false, connected: false };
  const suits = community.map(c => c[1]);
  const vals  = community.map(c => VALUE_MAP[c[0]]);
  const suitCnt = {};
  for (const s of suits) suitCnt[s] = (suitCnt[s]||0) + 1;
  const maxSuit = Math.max(...Object.values(suitCnt));
  const valCnt = {};
  for (const v of vals) valCnt[v] = (valCnt[v]||0) + 1;
  const paired = Object.values(valCnt).some(c => c >= 2);
  const sorted = [...new Set(vals)].sort((a,b) => a-b);
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) gaps += sorted[i] - sorted[i-1];
  const connected = sorted.length >= 2 && gaps <= sorted.length;
  const monotone = maxSuit === community.length;
  const wet = maxSuit >= 2 || connected;
  return { dry: !wet && !paired, wet, paired, monotone, connected };
}

// ─── Monte Carlo equity ───────────────────────────────────────────────────────

function compareRanks(r1, r2) {
  for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
    const a = r1[i]??0, b = r2[i]??0;
    if (a > b) return 1; if (a < b) return -1;
  }
  return 0;
}

function estimateEquity(myHole, community, iterations, oppRangeStrength = null) {
  const known = new Set([...myHole, ...community]);
  const deck = createDeck().filter(c => !known.has(c));
  const needed = 5 - community.length;
  let wins = 0, ties = 0;

  // Build opponent hand pool (filter by estimated range if provided)
  let oppPool = deck;
  if (oppRangeStrength !== null) {
    // Sample only from hands that roughly match opponent's range strength
    // Approximate by preflop strength threshold
    const pairs = [];
    for (let i = 0; i < deck.length - 1; i++)
      for (let j = i+1; j < deck.length; j++) {
        const str = HU_STRENGTHS[preflopKey(deck[i], deck[j])] ?? 0.38;
        if (str >= oppRangeStrength - 0.05) pairs.push([deck[i], deck[j]]);
      }
    oppPool = pairs.length > 10 ? pairs : deck;
  }

  for (let i = 0; i < iterations; i++) {
    // Shuffle deck
    for (let j = deck.length-1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j+1));
      [deck[j], deck[k]] = [deck[k], deck[j]];
    }

    let oppHole;
    if (Array.isArray(oppPool[0])) {
      // Pool of hand pairs
      const pick = oppPool[Math.floor(Math.random() * oppPool.length)];
      oppHole = pick;
    } else {
      oppHole = [deck[0], deck[1]];
    }

    const remaining = deck.filter(c => !oppHole.includes(c));
    const board = [...community, ...remaining.slice(0, needed)];
    const myBest  = bestHand(myHole, board);
    const oppBest = bestHand(oppHole, board);
    const cmp = compareRanks(myBest.rank, oppBest.rank);
    if (cmp > 0) wins++; else if (cmp === 0) ties += 0.5;
  }
  return (wins + ties) / iterations;
}

// ─── Nash equilibrium push/fold for short stacks ─────────────────────────────
//
// Derived from published ICM solver outputs for heads-up no-limit.
// [effBB]: [pushStrengthThreshold, callStrengthThreshold]
// Lower threshold = push/call wider (more hands).
// Strength maps to the HU_STRENGTHS percentile table above.
//
const NASH_TABLE = [
  [2,  0.30, 0.35],
  [3,  0.35, 0.42],
  [4,  0.38, 0.48],
  [5,  0.40, 0.52],
  [6,  0.42, 0.55],
  [7,  0.44, 0.57],
  [8,  0.46, 0.60],
  [9,  0.47, 0.62],
  [10, 0.48, 0.64],
  [12, 0.50, 0.67],
  [15, 0.52, 0.70],
  [20, 0.56, 0.75],
];

function nashLookup(effBB) {
  let best = NASH_TABLE[NASH_TABLE.length - 1];
  for (const row of NASH_TABLE) {
    if (effBB <= row[0]) { best = row; break; }
  }
  return { pushThresh: best[1], callThresh: best[2] };
}

function pushFoldDecision(myHole, myChips, opponentChips, bigBlind, aiPos, state, cfg) {
  const myBB  = myChips / bigBlind;
  const effBB = Math.min(myBB, opponentChips / bigBlind); // effective BB
  const myBet = aiPos === 1 ? state.p1_bet : state.p2_bet;
  const callAmt = Math.max(0, state.current_bet - myBet);
  const str = preflopStrength(myHole);

  // <2BB: shove any two, call anything
  if (effBB < 2) {
    if (callAmt > 0) return { action: 'call', amount: Math.min(callAmt, myChips) };
    return { action: 'raise', amount: myChips + myBet };
  }

  const { pushThresh, callThresh } = cfg.pushFoldAccurate
    ? nashLookup(effBB)
    : { pushThresh: 0.55, callThresh: 0.62 };

  if (callAmt > 0) {
    // Facing a shove
    return str >= callThresh
      ? { action: 'call', amount: Math.min(callAmt, myChips) }
      : { action: 'fold' };
  }

  if (str >= pushThresh) return { action: 'raise', amount: myChips + myBet };
  if (callAmt === 0) return { action: 'check' }; // BB gets a free look
  return { action: 'fold' };
}

// ─── Opponent stats helpers ───────────────────────────────────────────────────

function getOppStats(stats, oppPos) {
  const key = `p${oppPos}`;
  return {
    vpip:      stats?.[key]?.vpip ?? 0.5,
    pfr:       stats?.[key]?.pfr  ?? 0.35,
    foldCbet:  stats?.[key]?.foldCbet ?? 0.45,
    foldBluff: stats?.[key]?.foldBluff ?? 0.50,
    agg:       stats?.[key]?.agg ?? 1.0,
    hands:     stats?.[key]?.hands ?? 0,
  };
}

function rangeFromStats(oppStats, isDealer) {
  // Estimate opponent's range strength threshold based on their VPIP
  // Higher VPIP = wider range = lower minimum hand strength
  const baseRange = isDealer ? 0.62 : 0.58;
  const vpipAdj = (oppStats.vpip - 0.5) * 0.3; // wider VPIP → lower threshold
  return Math.max(0.35, Math.min(0.70, baseRange - vpipAdj));
}

// ─── Main decision function ───────────────────────────────────────────────────

function aiDecide(state, aiPos, difficulty = 'medium', rawStats = null) {
  const cfg = DIFF[difficulty] || DIFF.medium;
  const noise = (base, spread = cfg.randomNoise) => base + (Math.random()*2-1) * spread;

  const myHole    = aiPos === 1 ? (state.hole_cards?.p1||[]) : (state.hole_cards?.p2||[]);
  const oppPos    = aiPos === 1 ? 2 : 1;
  const community = state.community_cards || [];
  const myBet     = aiPos === 1 ? state.p1_bet : state.p2_bet;
  const oppBet    = aiPos === 1 ? state.p2_bet : state.p1_bet;
  const myChips   = aiPos === 1 ? state.p1_chips : state.p2_chips;
  const oppChips  = aiPos === 1 ? state.p2_chips : state.p1_chips;
  const callAmt   = Math.max(0, (state.current_bet||0) - myBet);
  const pot       = state.pot || 0;
  const bb        = state.big_blind || 100;
  const isDealer  = (aiPos === 1 && state.dealer_pos === 0) || (aiPos === 2 && state.dealer_pos === 1);
  const myBBs     = myChips / bb;
  const stats     = rawStats || state.stats || {};
  const oppStats  = getOppStats(stats, oppPos);

  if (!myHole || myHole.length < 2) return { action: 'check' };

  // ── Short-stack push/fold (<15BB for hard+, <10BB otherwise) ──────────────
  const shortThresh = (difficulty === 'hard' || difficulty === 'insane') ? 15 : 10;
  if (myBBs < shortThresh && state.phase === 'preflop') {
    return pushFoldDecision(myHole, myChips, oppChips, bb, aiPos, state, cfg);
  }

  // ── PREFLOP ───────────────────────────────────────────────────────────────
  if (state.phase === 'preflop') {
    const str = noise(preflopStrength(myHole));
    const openRange  = isDealer ? cfg.dealerOpenRange : cfg.bbDefendRange;
    const threebetStr = 1 - cfg.threebet;  // top N% hands 3-bet

    // Exploitative adjustment: if opponent is very loose, tighten slightly
    let openAdj = 0;
    if (cfg.exploitMult > 0 && oppStats.hands >= 3) {
      if (oppStats.vpip < 0.40) openAdj = -0.04; // they're tight, be careful
      if (oppStats.vpip > 0.70) openAdj =  0.05; // they're loose, open wider
    }
    const effectiveOpen = Math.min(0.85, openRange + openAdj);

    if (callAmt === 0) {
      // Option or first to act
      if (str >= threebetStr) {
        const size = Math.min(myChips + myBet, pot + bb * (isDealer ? 2.5 : 3));
        return { action: 'bet', amount: Math.floor(size) };
      }
      if (str >= (1 - effectiveOpen)) return { action: 'check' };
      // Occasionally limp with playable hands as dealer
      if (isDealer && str >= 0.42 && Math.random() < 0.35) return { action: 'check' };
      return { action: 'check' }; // always at least check in BB
    }

    // Facing a raise/3-bet
    const potOdds = callAmt / (pot + callAmt);

    // 3-bet or re-raise
    if (str >= threebetStr && callAmt < myChips * 0.25) {
      const raise = Math.min(myChips + myBet, callAmt * 3 + pot * 0.8);
      if (raise > callAmt * 1.5) return { action: 'raise', amount: Math.floor(raise) };
    }

    // Fold to aggression: adjustable by difficulty
    const foldThresh = cfg.foldTo3bet;
    const adjustedFold = cfg.exploitMult > 0 && oppStats.hands >= 3
      ? foldThresh - (oppStats.pfr - 0.35) * cfg.exploitMult * 0.15
      : foldThresh;

    if (str < (1 - effectiveOpen) * (1 + adjustedFold)) {
      // Occasionally call with suited connectors (bluff-catchers)
      const pfKey = preflopKey(myHole[0], myHole[1]);
      const isSuited = pfKey.endsWith('s');
      if (isSuited && str >= 0.52 && Math.random() < 0.28) {
        return { action: 'call', amount: Math.min(callAmt, myChips) };
      }
      return { action: 'fold' };
    }
    if (str >= potOdds + 0.06) return { action: 'call', amount: Math.min(callAmt, myChips) };
    return { action: 'fold' };
  }

  // ── POSTFLOP ──────────────────────────────────────────────────────────────
  const board = analyzeBoard(community);
  const oppRangeStr = cfg.useRangeEquity ? rangeFromStats(oppStats, !isDealer) : null;
  const equity = estimateEquity(myHole, community, cfg.mcIterations, oppRangeStr);
  const effEq  = noise(equity);
  const potOdds = callAmt > 0 ? callAmt / (pot + callAmt) : 0;

  // Hand category
  const isMonster  = effEq >= 0.82;
  const isStrong   = effEq >= 0.62;
  const isMedium   = effEq >= 0.44;
  const isDraw     = effEq >= 0.36 && effEq < 0.50; // has outs
  const isBluff    = effEq < 0.36;

  // Continuation bet logic (hard+)
  const isCbet = state.phase === 'flop' && isDealer; // dealer usually raised preflop
  const cbetFreq = board.dry ? cfg.cbetDry : cfg.cbetWet;

  // Exploitative adjustments
  let betFreqAdj = 0, callFreqAdj = 0;
  if (cfg.exploitMult > 0 && oppStats.hands >= 3) {
    // If opp folds a lot to bets → bet more
    if (oppStats.foldCbet > 0.65) betFreqAdj  += (oppStats.foldCbet - 0.50) * cfg.exploitMult * 0.3;
    if (oppStats.foldCbet < 0.30) betFreqAdj  -= 0.15; // they call everything → bet only value
    // If opp bluffs a lot → call wider
    if (oppStats.agg > 1.5) callFreqAdj += (oppStats.agg - 1.0) * cfg.exploitMult * 0.04;
  }

  // Alpha (break-even bluff frequency) = call / (call + pot)
  const betSize = Math.floor(pot * cfg.cbetSize);
  const alpha   = betSize > 0 ? betSize / (betSize + pot) : 0.33;
  const bluffFreq = Math.min(0.55, (1 - alpha) * cfg.bluffMult + betFreqAdj);

  // ── River: fully polarised ────────────────────────────────────────────────
  if (state.phase === 'river' && cfg.polarizeRiver) {
    if (callAmt > 0) {
      if (isStrong)  return { action: 'call', amount: Math.min(callAmt, myChips) };
      if (isMonster && callAmt < pot * 0.8 && Math.random() < 0.3)
        return { action: 'raise', amount: Math.min(myChips + myBet, callAmt * 2.2 + pot) };
      if (isDraw || isBluff) {
        const bluffCall = (1 - alpha) * cfg.bluffMult + callFreqAdj;
        return Math.random() < bluffCall
          ? { action: 'call', amount: Math.min(callAmt, myChips) }
          : { action: 'fold' };
      }
      return effEq > potOdds + 0.04
        ? { action: 'call', amount: Math.min(callAmt, myChips) }
        : { action: 'fold' };
    }

    // Bet polarised: strong value or calculated bluff; check medium hands
    if (isMonster) {
      const vBet = Math.min(myChips, Math.floor(pot * 0.85 * cfg.valueMult));
      return { action: 'bet', amount: Math.max(vBet, bb) };
    }
    if (isStrong && effEq >= 0.68) {
      // Thin value bet
      const vBet = Math.min(myChips, Math.floor(pot * 0.65 * cfg.valueMult));
      return Math.random() < 0.70 ? { action: 'bet', amount: Math.max(vBet, bb) } : { action: 'check' };
    }
    if (isMedium) return { action: 'check' }; // never bluff medium hands on river
    if (isBluff && Math.random() < bluffFreq) {
      const bluffBet = Math.min(myChips, Math.floor(pot * 0.70));
      return bluffBet >= bb ? { action: 'bet', amount: bluffBet } : { action: 'check' };
    }
    return { action: 'check' };
  }

  // ── Flop / Turn general strategy ──────────────────────────────────────────
  if (callAmt > 0) {
    // Facing a bet
    if (isMonster) {
      // Raise for value sometimes
      if (callAmt < pot && Math.random() < 0.45 * cfg.valueMult) {
        const raise = Math.min(myChips + myBet, callAmt * 2.5 + pot * 0.6);
        return { action: 'raise', amount: Math.floor(raise) };
      }
      return { action: 'call', amount: Math.min(callAmt, myChips) };
    }
    if (isStrong) return { action: 'call', amount: Math.min(callAmt, myChips) };
    if (isMedium) {
      return effEq > potOdds + 0.06 + callFreqAdj
        ? { action: 'call', amount: Math.min(callAmt, myChips) }
        : { action: 'fold' };
    }
    if (isDraw) {
      // Call if we have the odds
      return effEq > potOdds - 0.02
        ? { action: 'call', amount: Math.min(callAmt, myChips) }
        : { action: 'fold' };
    }
    // Bluff-raise occasionally with air on right boards
    if (isBluff && !board.paired && Math.random() < 0.12 * cfg.bluffMult) {
      const raise = Math.min(myChips + myBet, callAmt * 2 + pot * 0.5);
      return { action: 'raise', amount: Math.floor(raise) };
    }
    return { action: 'fold' };
  }

  // No bet to face — decide whether to bet or check
  if (isMonster) {
    // Slowplay or bet
    if (Math.random() < 0.30 && pot > bb * 3) return { action: 'check' }; // slowplay
    const bet = Math.min(myChips, Math.floor(pot * (board.wet ? 0.75 : 0.65) * cfg.valueMult));
    return { action: 'bet', amount: Math.max(bet, bb) };
  }
  if (isStrong) {
    const bet = Math.min(myChips, Math.floor(pot * 0.60 * cfg.valueMult));
    const dobet = isCbet ? Math.random() < cbetFreq + betFreqAdj : Math.random() < 0.55 + betFreqAdj;
    return dobet && bet >= bb ? { action: 'bet', amount: bet } : { action: 'check' };
  }
  if (isMedium) {
    // Probe/cbet occasionally, mostly check
    const cbet = isCbet && Math.random() < cbetFreq * 0.6 + betFreqAdj;
    if (cbet) {
      const bet = Math.min(myChips, Math.floor(pot * 0.50));
      if (bet >= bb) return { action: 'bet', amount: bet };
    }
    return { action: 'check' };
  }
  if (isDraw) {
    // Semi-bluff
    const semi = Math.random() < 0.42 * cfg.bluffMult + betFreqAdj;
    if (semi) {
      const bet = Math.min(myChips, Math.floor(pot * 0.60));
      if (bet >= bb) return { action: 'bet', amount: bet };
    }
    return { action: 'check' };
  }
  // Bluff
  if (Math.random() < bluffFreq + betFreqAdj) {
    const bet = Math.min(myChips, Math.floor(pot * 0.55));
    if (bet >= bb) return { action: 'bet', amount: bet };
  }
  return { action: 'check' };
}

// ─── Stat tracking (called from engine after each action) ────────────────────

function updateOpponentStats(stats, oppPos, action, phase, facingBet) {
  const key = `p${oppPos}`;
  if (!stats[key]) stats[key] = { vpip:0.5, pfr:0.35, foldCbet:0.45, foldBluff:0.50, agg:1.0, hands:0, _raw:{} };
  const r = stats[key]._raw;

  if (phase === 'preflop') {
    r.hands = (r.hands||0) + 1;
    if (action !== 'fold' && action !== 'check') r.vol = (r.vol||0) + 1;
    if (action === 'raise' || action === 'bet')  r.pfr = (r.pfr||0) + 1;
    stats[key].vpip = (r.vol||0) / r.hands;
    stats[key].pfr  = (r.pfr||0) / r.hands;
    stats[key].hands = r.hands;
  }
  if (facingBet) {
    r.faced = (r.faced||0) + 1;
    if (action === 'fold') r.folded = (r.folded||0) + 1;
    stats[key].foldCbet  = (r.folded||0) / (r.faced||1);
  }
  if (action === 'bet' || action === 'raise') r.agg = (r.agg||0) + 1;
  if (action === 'call')                       r.calls = (r.calls||0) + 1;
  const aggressive = r.agg||0, passive = r.calls||0;
  stats[key].agg = passive > 0 ? aggressive / passive : 1.0;

  return stats;
}

// ─── AI settings loader ───────────────────────────────────────────────────────

let _cachedSettings = null;
let _cacheTime = 0;

async function loadAiSettings() {
  if (_cachedSettings && Date.now() - _cacheTime < 30000) return _cachedSettings;
  try {
    const res = await pool.query('SELECT * FROM ai_settings WHERE id=1');
    _cachedSettings = res.rows[0] || { name:'Heisenberg AI', difficulty:'medium', action_delay:'normal', emoji:'🤖' };
    _cacheTime = Date.now();
    return _cachedSettings;
  } catch {
    return { name:'Heisenberg AI', difficulty:'medium', action_delay:'normal', emoji:'🤖' };
  }
}

function invalidateSettingsCache() { _cachedSettings = null; }

// ─── Action delay by setting ──────────────────────────────────────────────────

function aiActionDelay(setting = 'normal') {
  const ranges = { fast: [300, 800], normal: [4000, 8000], slow: [1500, 3500], human: [1200, 4000] };
  const [min, max] = ranges[setting] || ranges.normal;
  return min + Math.floor(Math.random() * (max - min));
}

module.exports = { aiDecide, aiActionDelay, loadAiSettings, invalidateSettingsCache, updateOpponentStats };
