const { createDeck, shuffle, dealCards } = require('./deck');
const { determineWinner } = require('./evaluator');
const { getCurrentBlindLevel } = require('./blinds');
const { aiDecide, aiActionDelay, loadAiSettings, updateOpponentStats } = require('./ai');
const { settleHeadsUpBets, getRunoutStreets, normalizeRaise, getDealerForNextHand } = require('./rules');
const pool = require('../db');

const RUNOUT_DELAY_MS = 850;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const actionLocks = new Set();

async function getGameState(tournamentId) {
  const res = await pool.query('SELECT * FROM game_state WHERE tournament_id = $1', [tournamentId]);
  return res.rows[0] || null;
}

async function getTournament(tournamentId) {
  const res = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
  return res.rows[0] || null;
}

// ─── Emit state to all room participants ───────────────────────────────────────

function emitGameState(tournamentId, state, tournament, io) {
  if (!state) return;
  const holeCards = state.hole_cards || {};
  const base = {
    tournamentId,
    handNumber: state.hand_number,
    phase: state.phase,
    communityCards: state.community_cards || [],
    pot: state.pot,
    currentBet: state.current_bet,
    actionOn: state.action_on,
    smallBlind: state.small_blind,
    bigBlind: state.big_blind,
    p1Chips: state.p1_chips,
    p2Chips: state.p2_chips,
    p1Bet: state.p1_bet,
    p2Bet: state.p2_bet,
    dealerPos: state.dealer_pos,
    blindStartTime: state.blind_start_time,
    p1Timebank: state.p1_timebank || 30,
    p2Timebank: state.p2_timebank || 30,
    p1Sitout: state.p1_sitout || false,
    p2Sitout: state.p2_sitout || false,
  };
  io.to(`${tournamentId}:p1`).emit('gameState', { ...base, myCards: holeCards.p1 || [], myPos: 1 });
  io.to(`${tournamentId}:p2`).emit('gameState', { ...base, myCards: holeCards.p2 || [], myPos: 2 });
  io.to(`${tournamentId}:spectator`).emit('gameState', { ...base, myCards: [], myPos: 0 });
}

// ─── Start a new hand ─────────────────────────────────────────────────────────

async function startNewHand(tournamentId, io) {
  const state = await getGameState(tournamentId);
  const tournament = await getTournament(tournamentId);
  if (!state || !tournament || tournament.status !== 'active') return;

  // Check bust conditions
  if (state.p1_chips <= 0 || state.p2_chips <= 0) {
    await endTournament(tournamentId, state.p1_chips > 0 ? 1 : 2, io);
    return;
  }

  const { small: small_blind, big: big_blind } = getCurrentBlindLevel(state.blind_start_time);

  const deck = shuffle(createDeck());
  const [p1Hole, rem1] = dealCards(deck, 2);
  const [p2Hole, remaining] = dealCards(rem1, 2);

  // In heads-up the dealer is the small blind and acts first preflop.
  // dealer_pos always describes the current hand; flip it only as the next hand starts.
  const dealer = getDealerForNextHand(state.hand_number, state.dealer_pos);
  const sbPlayer = dealer === 0 ? 1 : 2;

  const p1IsSB = sbPlayer === 1;
  const p1Chips = state.p1_chips;
  const p2Chips = state.p2_chips;

  const actualSB = Math.min(small_blind, p1IsSB ? p1Chips : p2Chips);
  const actualBB = Math.min(big_blind, p1IsSB ? p2Chips : p1Chips);

  let newP1Chips = p1Chips;
  let newP2Chips = p2Chips;
  let p1Bet = 0, p2Bet = 0;

  if (p1IsSB) {
    newP1Chips -= actualSB; p1Bet = actualSB;
    newP2Chips -= actualBB; p2Bet = actualBB;
  } else {
    newP2Chips -= actualSB; p2Bet = actualSB;
    newP1Chips -= actualBB; p1Bet = actualBB;
  }

  let pot = p1Bet + p2Bet;
  let currentBet = Math.max(p1Bet, p2Bet);
  // Preflop: SB (dealer) acts first
  let actionOn = sbPlayer;

  // If posting a blind puts either player all-in, only matched chips are live.
  // Any excess blind is immediately returned before the board runs out.
  let blindRefund = null;
  if (newP1Chips === 0 || newP2Chips === 0) {
    const settled = settleHeadsUpBets({ p1Bet, p2Bet, p1Chips: newP1Chips, p2Chips: newP2Chips, pot });
    p1Bet = settled.p1Bet;
    p2Bet = settled.p2Bet;
    newP1Chips = settled.p1Chips;
    newP2Chips = settled.p2Chips;
    pot = settled.pot;
    currentBet = settled.p1Bet;
    actionOn = 0;
    blindRefund = settled.refund;
  }

  // p1_acted/p2_acted: both false preflop (even BB gets to act)
  const handLog = [{ action: 'deal', blinds: { sb: actualSB, bb: actualBB }, dealer: sbPlayer }];
  if (blindRefund) handLog.push({ action: 'uncalled_return', ...blindRefund });

  await pool.query(`
    UPDATE game_state SET
      hand_number    = hand_number + 1,
      dealer_pos     = $1,
      small_blind    = $2,
      big_blind      = $3,
      p1_chips       = $4,
      p2_chips       = $5,
      phase          = 'preflop',
      deck           = $6,
      hole_cards     = $7,
      community_cards = '[]',
      pot            = $8,
      side_pots      = '[]',
      current_bet    = $9,
      p1_bet         = $10,
      p2_bet         = $11,
      action_on      = $12,
      p1_acted       = false,
      p2_acted       = false,
      hand_log       = $13,
      updated_at     = NOW()
    WHERE tournament_id = $14
  `, [
    dealer,
    small_blind, big_blind,
    newP1Chips, newP2Chips,
    JSON.stringify(remaining),
    JSON.stringify({ p1: p1Hole, p2: p2Hole }),
    pot, currentBet, p1Bet, p2Bet,
    actionOn,
    JSON.stringify(handLog),
    tournamentId,
  ]);

  const newState = await getGameState(tournamentId);
  emitGameState(tournamentId, newState, tournament, io);

  if (newState.p1_chips === 0 || newState.p2_chips === 0) {
    await wait(RUNOUT_DELAY_MS);
    return advancePhase(tournamentId, newState, handLog, io);
  }

  // Auto-fold for sitting-out players
  const sitoutPos = newState.p1_sitout ? 1 : newState.p2_sitout ? 2 : null;
  if (sitoutPos && newState.action_on === sitoutPos && !tournament.is_ai) {
    setTimeout(() => processAction(tournamentId, sitoutPos, 'fold', 0, io), 2000);
    return;
  }

  // Trigger AI if it's AI's turn
  if (tournament.is_ai) {
    const aiPos = tournament.player2_id === (await getAiUserId()) ? 2 : 1;
    if (newState.action_on === aiPos) {
      setTimeout(() => triggerAiAction(tournamentId, aiPos, io), aiActionDelay());
    }
  }
}

// ─── Process a player action ──────────────────────────────────────────────────

async function processAction(tournamentId, playerPos, action, amount, io) {
  const key = String(tournamentId);
  if (actionLocks.has(key)) return { error: 'Previous action is still processing' };
  actionLocks.add(key);
  try {
    return await processActionUnlocked(tournamentId, playerPos, action, amount, io);
  } finally {
    actionLocks.delete(key);
  }
}

async function processActionUnlocked(tournamentId, playerPos, action, amount, io) {
  const state = await getGameState(tournamentId);
  const tournament = await getTournament(tournamentId);
  if (!state || !tournament) return { error: 'Game not found' };
  if (tournament.status !== 'active') return { error: 'Tournament is not active' };
  if (state.phase === 'showdown') return { error: 'Hand is over' };
  if (state.action_on !== playerPos) return { error: 'Not your turn' };

  const opponentPos = playerPos === 1 ? 2 : 1;
  const myChips = playerPos === 1 ? state.p1_chips : state.p2_chips;
  const myBet   = playerPos === 1 ? state.p1_bet   : state.p2_bet;
  const callAmount = Math.max(0, state.current_bet - myBet);

  let newP1Chips = state.p1_chips, newP2Chips = state.p2_chips;
  let newP1Bet   = state.p1_bet,   newP2Bet   = state.p2_bet;
  let newPot     = state.pot;
  let newCurrentBet = state.current_bet;
  let newP1Acted = state.p1_acted, newP2Acted = state.p2_acted;

  const setActed = (pos, val) => { if (pos === 1) newP1Acted = val; else newP2Acted = val; };
  const getActed = (pos)      => pos === 1 ? newP1Acted : newP2Acted;

  const handLog = [...(state.hand_log || [])];

  // Track opponent stats for AI games
  let updatedStats = state.stats || {};
  if (tournament.is_ai) {
    const aiId = await getAiUserId();
    const aiPos = tournament.player1_id === aiId ? 1 : 2;
    if (playerPos !== aiPos) {
      const facingBet = callAmount > 0;
      updatedStats = updateOpponentStats({ ...updatedStats }, playerPos, action, state.phase, facingBet);
    }
  }

  // ── FOLD ──
  if (action === 'fold') {
    handLog.push({ action: 'fold', player: playerPos });
    await pool.query(`UPDATE game_state SET hand_log=$1, stats=$2, updated_at=NOW() WHERE tournament_id=$3`,
      [JSON.stringify(handLog), JSON.stringify(updatedStats), tournamentId]);
    await awardPot(tournamentId, opponentPos, newPot, state.hole_cards, state.community_cards, handLog, io);
    return { success: true };
  }

  // ── CHECK ──
  if (action === 'check') {
    if (callAmount > 0) return { error: 'Cannot check — must call or fold' };
    handLog.push({ action: 'check', player: playerPos });
    setActed(playerPos, true);

    // Both have acted and bets are equal → advance phase
    if (getActed(opponentPos) && newP1Bet === newP2Bet) {
      await pool.query(
        `UPDATE game_state SET p1_acted=$1, p2_acted=$2, hand_log=$3, stats=$4, updated_at=NOW() WHERE tournament_id=$5`,
        [newP1Acted, newP2Acted, JSON.stringify(handLog), JSON.stringify(updatedStats), tournamentId]
      );
      return await advancePhase(tournamentId, await getGameState(tournamentId), handLog, io);
    }

    // Pass action to opponent
    await pool.query(
      `UPDATE game_state SET action_on=$1, p1_acted=$2, p2_acted=$3, hand_log=$4, stats=$5, updated_at=NOW() WHERE tournament_id=$6`,
      [opponentPos, newP1Acted, newP2Acted, JSON.stringify(handLog), JSON.stringify(updatedStats), tournamentId]
    );
    const updated = await getGameState(tournamentId);
    emitGameState(tournamentId, updated, tournament, io);

    if (tournament.is_ai) maybeAiAct(tournamentId, opponentPos, tournament, io);
    return { success: true };
  }

  // ── CALL ──
  if (action === 'call') {
    if (callAmount === 0) {
      // Treat as check
      return processActionUnlocked(tournamentId, playerPos, 'check', 0, io);
    }
    const actual = Math.min(callAmount, myChips);
    if (playerPos === 1) { newP1Chips -= actual; newP1Bet += actual; }
    else                 { newP2Chips -= actual; newP2Bet += actual; }
    newPot += actual;
    handLog.push({ action: 'call', player: playerPos, amount: actual });
    setActed(playerPos, true);

    const allIn = newP1Chips === 0 || newP2Chips === 0;

    // Advance if opponent already acted (or all-in)
    if (getActed(opponentPos) || allIn) {
      await pool.query(
        `UPDATE game_state SET p1_chips=$1,p2_chips=$2,p1_bet=$3,p2_bet=$4,pot=$5,p1_acted=$6,p2_acted=$7,hand_log=$8,stats=$9,updated_at=NOW() WHERE tournament_id=$10`,
        [newP1Chips,newP2Chips,newP1Bet,newP2Bet,newPot,newP1Acted,newP2Acted,JSON.stringify(handLog),JSON.stringify(updatedStats),tournamentId]
      );
      return await advancePhase(tournamentId, await getGameState(tournamentId), handLog, io);
    }

    // Opponent hasn't acted yet (e.g. SB calls BB preflop → BB gets option)
    await pool.query(
      `UPDATE game_state SET p1_chips=$1,p2_chips=$2,p1_bet=$3,p2_bet=$4,pot=$5,action_on=$6,p1_acted=$7,p2_acted=$8,hand_log=$9,stats=$10,updated_at=NOW() WHERE tournament_id=$11`,
      [newP1Chips,newP2Chips,newP1Bet,newP2Bet,newPot,opponentPos,newP1Acted,newP2Acted,JSON.stringify(handLog),JSON.stringify(updatedStats),tournamentId]
    );
    const updated = await getGameState(tournamentId);
    emitGameState(tournamentId, updated, tournament, io);

    if (tournament.is_ai) maybeAiAct(tournamentId, opponentPos, tournament, io);
    return { success: true };
  }

  // ── BET / RAISE ──
  if (action === 'bet' || action === 'raise') {
    const raise = normalizeRaise({
      amount,
      myBet,
      myChips,
      currentBet: newCurrentBet,
      bigBlind: state.big_blind || 100,
    });
    if (raise.error) return { error: raise.error };
    const addAmount = raise.addAmount;

    if (playerPos === 1) { newP1Chips -= addAmount; newP1Bet += addAmount; }
    else                 { newP2Chips -= addAmount; newP2Bet += addAmount; }
    newCurrentBet = Math.max(newP1Bet, newP2Bet);
    newPot += addAmount;
    handLog.push({ action, player: playerPos, amount: addAmount, totalBet: playerPos === 1 ? newP1Bet : newP2Bet });

    // Raiser is acted; opponent must respond
    setActed(playerPos, true);
    setActed(opponentPos, false);

    await pool.query(
      `UPDATE game_state SET p1_chips=$1,p2_chips=$2,p1_bet=$3,p2_bet=$4,pot=$5,current_bet=$6,action_on=$7,p1_acted=$8,p2_acted=$9,hand_log=$10,stats=$11,updated_at=NOW() WHERE tournament_id=$12`,
      [newP1Chips,newP2Chips,newP1Bet,newP2Bet,newPot,newCurrentBet,opponentPos,newP1Acted,newP2Acted,JSON.stringify(handLog),JSON.stringify(updatedStats),tournamentId]
    );
    const updated = await getGameState(tournamentId);
    emitGameState(tournamentId, updated, tournament, io);

    if (tournament.is_ai) maybeAiAct(tournamentId, opponentPos, tournament, io);
    return { success: true };
  }

  return { error: 'Unknown action' };
}

// ─── Advance to next street ────────────────────────────────────────────────────

async function advancePhase(tournamentId, state, handLog, io) {
  const tournament = await getTournament(tournamentId);
  let { phase, deck, community_cards, pot, p1_chips, p2_chips, hole_cards } = state;
  let newCommunity = [...(community_cards || [])];
  let newDeck = [...(deck || [])];
  const log = [...handLog];

  const dealCards = (n) => {
    const cards = newDeck.slice(0, n);
    newDeck = newDeck.slice(n);
    newCommunity.push(...cards);
    return cards;
  };

  const allIn = p1_chips === 0 || p2_chips === 0;

  if (allIn) {
    const settled = settleHeadsUpBets({
      p1Bet: state.p1_bet,
      p2Bet: state.p2_bet,
      p1Chips: p1_chips,
      p2Chips: p2_chips,
      pot,
    });
    p1_chips = settled.p1Chips;
    p2_chips = settled.p2Chips;
    pot = settled.pot;
    if (settled.refund) log.push({ action: 'uncalled_return', ...settled.refund });

    const runout = getRunoutStreets(newCommunity.length);
    for (const street of runout) {
      const cards = dealCards(street.count);
      log.push({ action: 'deal_community', cards, phase: street.phase, allIn: true });
      await pool.query(
        `UPDATE game_state SET phase=$1,deck=$2,community_cards=$3,p1_chips=$4,p2_chips=$5,pot=$6,
         p1_bet=0,p2_bet=0,current_bet=0,action_on=0,p1_acted=true,p2_acted=true,hand_log=$7,updated_at=NOW()
         WHERE tournament_id=$8`,
        [street.phase, JSON.stringify(newDeck), JSON.stringify(newCommunity), p1_chips, p2_chips, pot,
         JSON.stringify(log), tournamentId]
      );
      emitGameState(tournamentId, await getGameState(tournamentId), tournament, io);
      await wait(RUNOUT_DELAY_MS);
    }

    const result = determineWinner(hole_cards.p1, hole_cards.p2, newCommunity);
    log.push({ action: 'showdown', result: { winner: result.winner, h1: result.h1.name, h2: result.h2.name }, holeCards: hole_cards });
    await pool.query(
      `UPDATE game_state SET phase='showdown',deck=$1,community_cards=$2,p1_chips=$3,p2_chips=$4,pot=$5,
       p1_bet=0,p2_bet=0,current_bet=0,action_on=0,hand_log=$6,updated_at=NOW() WHERE tournament_id=$7`,
      [JSON.stringify(newDeck), JSON.stringify(newCommunity), p1_chips, p2_chips, pot, JSON.stringify(log), tournamentId]
    );
    emitGameState(tournamentId, await getGameState(tournamentId), tournament, io);
    await wait(350);
    await awardPot(tournamentId, result.winner, pot, hole_cards, newCommunity, log, io, result);
    return { success: true };
  }

  // Determine next phase
  const nextPhaseMap = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };
  let newPhase = nextPhaseMap[phase] || 'showdown';

  if (newPhase === 'flop') {
    const cards = dealCards(3);
    log.push({ action: 'deal_community', cards, phase: 'flop' });
  } else if (newPhase === 'turn' || newPhase === 'river') {
    const cards = dealCards(1);
    log.push({ action: 'deal_community', cards, phase: newPhase });
  }

  if (newPhase === 'showdown') {
    const result = determineWinner(hole_cards.p1, hole_cards.p2, newCommunity);
    log.push({ action: 'showdown', result: { winner: result.winner, h1: result.h1.name, h2: result.h2.name }, holeCards: hole_cards });
    await pool.query(
      `UPDATE game_state SET phase='showdown',deck=$1,community_cards=$2,p1_bet=0,p2_bet=0,current_bet=0,action_on=0,hand_log=$3,updated_at=NOW() WHERE tournament_id=$4`,
      [JSON.stringify(newDeck), JSON.stringify(newCommunity), JSON.stringify(log), tournamentId]
    );
    await awardPot(tournamentId, result.winner, pot, hole_cards, newCommunity, log, io, result);
    return { success: true };
  }

  // Post-flop: non-dealer acts first
  const actionFirst = state.dealer_pos === 0 ? 2 : 1;

  await pool.query(
    `UPDATE game_state SET phase=$1,deck=$2,community_cards=$3,p1_bet=0,p2_bet=0,current_bet=0,action_on=$4,p1_acted=false,p2_acted=false,hand_log=$5,updated_at=NOW() WHERE tournament_id=$6`,
    [newPhase, JSON.stringify(newDeck), JSON.stringify(newCommunity), actionFirst, JSON.stringify(log), tournamentId]
  );

  const updated = await getGameState(tournamentId);
  emitGameState(tournamentId, updated, tournament, io);

  if (tournament.is_ai) maybeAiAct(tournamentId, updated.action_on, tournament, io);
  return { success: true };
}

// ─── Award pot and prepare next hand ─────────────────────────────────────────

async function awardPot(tournamentId, winner, pot, holeCards, community, handLog, io, showdownResult = null) {
  const client = await pool.connect();
  let state;
  let tournament;
  let newP1;
  let newP2;
  let tieNote = '';
  try {
    await client.query('BEGIN');
    const stateResult = await client.query('SELECT * FROM game_state WHERE tournament_id=$1 FOR UPDATE', [tournamentId]);
    const tournamentResult = await client.query('SELECT * FROM tournaments WHERE id=$1', [tournamentId]);
    state = stateResult.rows[0];
    tournament = tournamentResult.rows[0];
    if (!state || !tournament) {
      await client.query('ROLLBACK');
      return;
    }

    newP1 = state.p1_chips;
    newP2 = state.p2_chips;
    if (winner === 0) {
      const half = Math.floor(pot / 2);
      newP1 += half;
      newP2 += half;
      if (pot % 2 !== 0) {
        const oddChipPos = state.dealer_pos === 0 ? 2 : 1;
        if (oddChipPos === 1) newP1 += 1;
        else newP2 += 1;
      }
      tieNote = 'split';
    } else if (winner === 1) {
      newP1 += pot;
    } else {
      newP2 += pot;
    }

    handLog.push({ action: 'award', winner, pot, p1Total: newP1, p2Total: newP2, tie: tieNote });
    await client.query(
      `INSERT INTO hand_history(tournament_id,hand_number,winner_id,pot,community_cards,hand_log) VALUES($1,$2,$3,$4,$5,$6)`,
      [tournamentId, state.hand_number,
       winner === 0 ? null : (winner === 1 ? tournament.player1_id : tournament.player2_id),
       pot, JSON.stringify(community), JSON.stringify(handLog)]
    );
    await client.query(
      `UPDATE game_state SET p1_chips=$1,p2_chips=$2,pot=0,p1_bet=0,p2_bet=0,current_bet=0,
       phase='showdown',action_on=0,hand_log=$3,updated_at=NOW() WHERE tournament_id=$4`,
      [newP1, newP2, JSON.stringify(handLog), tournamentId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Called hands must always be tabled at showdown. Folded hands stay mucked.
  let revealedCards = null;
  if (showdownResult !== null) {
    revealedCards = holeCards;
  }

  // Occasional AI bluff reveal: after winning by fold, AI shows 1 card ~20% of the time
  const aiId2 = await getAiUserId();
  if (tournament.is_ai && showdownResult === null && winner !== 0) {
    const aiPos = tournament.player1_id === aiId2 ? 1 : 2;
    if (winner === aiPos && Math.random() < 0.20) {
      const aiCards = holeCards[`p${aiPos}`] || [];
      if (aiCards.length > 0) {
        const cardToShow = aiCards[Math.floor(Math.random() * aiCards.length)];
        const taunts = ['😏', '👀', '🎭', 'Easy game', 'You had nothing', '¯\\_(ツ)_/¯'];
        const taunt = taunts[Math.floor(Math.random() * taunts.length)];
        setTimeout(() => {
          io.to(tournamentId).emit('showCard', { pos: aiPos, card: cardToShow, taunt });
        }, 1800);
      }
    }
  }

  io.to(tournamentId).emit('handResult', {
    winner, pot,
    holeCards: revealedCards,
    community,
    showdown: showdownResult,
    p1Chips: newP1, p2Chips: newP2,
    handLog,
  });

  if (newP1 <= 0 || newP2 <= 0) {
    // Delay tournament end so players can see the final hand result
    setTimeout(() => endTournament(tournamentId, newP1 > 0 ? 1 : 2, io), 6000);
    return;
  }

  setTimeout(() => startNewHand(tournamentId, io), 4000);
}

// ─── End tournament ───────────────────────────────────────────────────────────

async function endTournament(tournamentId, winnerPos, io) {
  const aiId = await getAiUserId();
  const client = await pool.connect();
  let winnerId;
  let winnerName;
  let prizePool;
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM tournaments WHERE id=$1 FOR UPDATE', [tournamentId]);
    const tournament = result.rows[0];
    if (!tournament || tournament.status !== 'active') {
      await client.query('ROLLBACK');
      return;
    }

    winnerId = winnerPos === 1 ? tournament.player1_id : tournament.player2_id;
    prizePool = parseFloat(tournament.prize_pool);
    await client.query(
      `UPDATE tournaments SET status='completed',winner_id=$1,ended_at=NOW() WHERE id=$2`,
      [winnerId, tournamentId],
    );

    if (tournament.tier !== 'play' && prizePool > 0 && winnerId !== aiId) {
      await client.query(`UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2`, [tournament.prize_pool, winnerId]);
      await client.query(
        `INSERT INTO transactions(user_id,type,amount,status,metadata)
         VALUES($1,'winnings',$2,'confirmed',$3)`,
        [winnerId, tournament.prize_pool, JSON.stringify({ tournamentId })],
      );
    }

    const winnerRes = await client.query('SELECT username FROM users WHERE id=$1', [winnerId]);
    winnerName = winnerRes.rows[0]?.username || 'Unknown';
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  io.to(tournamentId).emit('tournamentEnd', { winner: winnerPos, winnerId, winnerName, prizePool });
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

let _aiUserId = null;
async function getAiUserId() {
  if (_aiUserId) return _aiUserId;
  const res = await pool.query(`SELECT id FROM users WHERE username='_ai_'`);
  _aiUserId = res.rows[0]?.id || null;
  return _aiUserId;
}

function maybeAiAct(tournamentId, actionOn, tournament, io) {
  if (!tournament.is_ai) return;
  loadAiSettings().then(settings => {
    setTimeout(async () => {
      const aiId = await getAiUserId();
      const t = await getTournament(tournamentId);
      if (!t || t.status !== 'active') return;
      const aiPos = t.player1_id === aiId ? 1 : t.player2_id === aiId ? 2 : null;
      if (aiPos === actionOn) {
        await triggerAiAction(tournamentId, aiPos, io);
      }
    }, aiActionDelay(settings.action_delay || 'normal'));
  });
}

async function triggerAiAction(tournamentId, aiPos, io) {
  const state = await getGameState(tournamentId);
  if (!state || state.action_on !== aiPos) return;
  const settings = await loadAiSettings();
  const decision = aiDecide(state, aiPos, settings.difficulty || 'medium', state.stats);
  await processAction(tournamentId, aiPos, decision.action, decision.amount, io);
}

module.exports = { startNewHand, processAction, getGameState, emitGameState, getAiUserId, triggerAiAction, maybeAiAct };
