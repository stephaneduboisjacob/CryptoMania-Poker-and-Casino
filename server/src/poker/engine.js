// In-memory No-Limit Texas Hold'em table engine for 2-9 seats.
//
// Design contract (100+ player safety):
//  - applyAction() and all state transitions are SYNCHRONOUS — zero DB, zero
//    awaits in the hot path. Node's single thread makes this race-free.
//  - Money movements (buy-ins, cash-outs, prizes) never happen here; the
//    manager handles them transactionally in Postgres outside the engine.
//  - All timers are registered on the table and cleared on destroy, so a
//    destroyed table can never fire stale emissions.

const { createDeck, shuffle } = require('../game/deck');
const { bestHand, compareRanks } = require('./evaluator-multi');
const { blindForLevel } = require('./schedules');

const TURN_MS = 25000;            // base time to act
const TURN_HYPER_MS = 15000;
const TIMEBANK_START = 30;        // seconds banked per player
const TIMEBANK_CHUNK = 15;        // seconds granted per use
const RUNOUT_DELAY_MS = 900;
const HAND_END_PAUSE_MS = 4500;
const NEXT_HAND_PAUSE_MS = 3500;

// Cash rake: 5% of each pot layer, capped per hand, skipped on tiny pots.
const RAKE_PCT = 0.05;

function rakeForPot(potTotal, bigBlind) {
  if (potTotal < bigBlind * 4) return 0;
  return Math.min(Math.floor(potTotal * RAKE_PCT), Math.max(2 * bigBlind, 100));
}

class Table {
  constructor(opts) {
    this.id = opts.id;                      // table id (room scope)
    this.gameId = opts.gameId || opts.id;   // game id (cash/sng: same as table)
    this.io = opts.io;
    this.maxSeats = opts.maxSeats;          // 2 | 3 | 6 | 8 | 9
    this.currency = opts.currency;          // 'play' | 'btc'
    this.gameType = opts.gameType;          // 'cash' | 'sng' | 'mtt'
    this.speed = opts.speed;
    this.name = opts.name;
    this.isTournament = this.gameType !== 'cash';
    this.manager = opts.manager;            // { onHandEnd(table, summary), computeRake?... }

    this.smallBlind = opts.smallBlind;
    this.bigBlind = opts.bigBlind;
    this.level = opts.level || 1;
    this.levelStartTime = Date.now();
    this.levelMinutes = opts.levelMinutes || 10;

    this.seats = new Array(this.maxSeats).fill(null);
    this.dealerSeat = null;
    this.handNumber = 0;
    this.phase = 'waiting';                 // waiting|preflop|flop|turn|river|showdown
    this.community = [];
    this.pot = 0;                           // collected chips (excludes live street bets)
    this.committed = {};                    // seat -> total committed this hand
    this.bets = {};                         // seat -> committed this street
    this.currentBet = 0;
    this.minRaiseSize = this.bigBlind;
    this.actionOn = null;
    this.actionDeadline = 0;
    this.acted = new Set();                 // seats that acted since last aggression
    this.folded = new Set();
    this.allIn = new Set();
    this.handInProgress = false;
    this.handLog = [];

    this.timers = new Set();
    this.destroyed = false;
  }

  // ─── Seat / player management ───────────────────────────────────────────────

  seatOf(userId) {
    return this.seats.findIndex(p => p && p.userId === userId);
  }

  playerAt(seat) { return this.seats[seat] || null; }

  canSit(seat = null) {
    if (this.handInProgress) {
      // Joining between hands only; a specific seat must be free
      return seat === null ? this.seats.some(s => s === null) : !this.seats[seat];
    }
    return seat === null ? this.seats.some(s => s === null) : !this.seats[seat];
  }

  sitPlayer({ userId, username, avatar, chips, seat = null }) {
    if (this.seatOf(userId) !== -1) return { error: 'Already seated' };
    let target = seat;
    if (target === null || target === undefined) {
      target = this.seats.findIndex(s => s === null);
    }
    if (target < 0 || target >= this.maxSeats || this.seats[target]) return { error: 'Seat taken' };
    this.seats[target] = {
      seat: target, userId, username, avatar: avatar || '🃏',
      chips: Math.floor(chips),
      cards: [], folded: false, allIn: false,
      sittingOut: this.handInProgress, // join mid-hand → wait for next hand
      disconnected: false,
      timebank: TIMEBANK_START, timebankUsed: false,
      lastAction: null,
    };
    this.broadcast('tableSeats', { seats: this.publicSeats() });
    return { seat: target };
  }

  removePlayer(userId) {
    const seat = this.seatOf(userId);
    if (seat === -1) return false;
    const p = this.seats[seat];
    if (this.handInProgress && !p.folded && p.cards.length > 0) {
      // In the middle of a hand: fold them; manager settles the stack at hand end
      this.applyFold(seat, true);
      p.leavingAfterHand = true;
    } else {
      this.seats[seat] = null;
      this.broadcast('tableSeats', { seats: this.publicSeats() });
    }
    return true;
  }

  setSitOut(userId, sitOut) {
    const seat = this.seatOf(userId);
    if (seat === -1) return false;
    this.seats[seat].sittingOut = !!sitOut;
    this.broadcast('tableSeats', { seats: this.publicSeats() });
    return true;
  }

  addChips(userId, amount) {
    const seat = this.seatOf(userId);
    if (seat === -1) return false;
    this.seats[seat].chips += Math.floor(amount);
    this.broadcast('tableSeats', { seats: this.publicSeats() });
    return true;
  }

  // ─── Hand lifecycle ─────────────────────────────────────────────────────────

  eligibleSeats() {
    return this.seats
      .filter(p => p && p.chips > 0 && !p.leavingAfterHand && (!p.sittingOut || this.isTournament))
      .map(p => p.seat);
  }

  canStartHand() { return this.eligibleSeats().length >= 2; }

  maybeStartHand() {
    if (this.destroyed || this.handInProgress) return;
    if (!this.canStartHand()) return;
    this.startHand();
  }

  startHand() {
    if (this.destroyed || this.handInProgress) return;
    const eligible = this.eligibleSeats();
    if (eligible.length < 2) return;

    this.handInProgress = true;
    this.handNumber += 1;
    this.phase = 'preflop';
    this.community = [];
    this.pot = 0;
    this.committed = {};
    this.bets = {};
    this.currentBet = 0;
    this.minRaiseSize = this.bigBlind;
    this.acted = new Set();
    this.folded = new Set();
    this.allIn = new Set();
    this.handLog = [];

    // Tournament blind levels
    if (this.isTournament) {
      const lvl = this.currentLevel();
      const { smallBlind, bigBlind } = blindForLevel(this.speed, lvl);
      this.smallBlind = smallBlind;
      this.bigBlind = bigBlind;
      this.minRaiseSize = bigBlind;
    }

    // Move the button to the next eligible seat (random on hand 1)
    if (this.dealerSeat === null || !eligible.includes(this.dealerSeat)) {
      this.dealerSeat = eligible[Math.floor(Math.random() * eligible.length)];
    } else {
      const idx = eligible.indexOf(this.dealerSeat);
      this.dealerSeat = eligible[(idx + 1) % eligible.length];
    }

    // Deal
    this.deck = shuffle(createDeck());
    for (const seat of eligible) {
      const p = this.seats[seat];
      p.cards = this.deck.splice(0, 2);
      p.folded = false;
      p.allIn = false;
      p.lastAction = null;
      p.timebankUsed = false;
      this.io.to(`t:${this.id}:s${seat}`).emit('myCards', { gameId: this.gameId, tableId: this.id, seat, cards: p.cards });
    }
    this.handLog.push({ action: 'deal', hand: this.handNumber, seats: eligible, dealer: this.dealerSeat });

    // Post blinds (heads-up: dealer is SB). Dead-blind rules simplified:
    // sitting-out players are simply skipped.
    const n = eligible.length;
    let sbSeat, bbSeat;
    if (n === 2) {
      sbSeat = this.dealerSeat;
      bbSeat = eligible.find(s => s !== sbSeat);
    } else {
      bbSeat = this.next(eligible, this.dealerSeat);
      sbSeat = this.next(eligible, bbSeat);
    }
    this.postBlind(sbSeat, this.smallBlind);
    this.postBlind(bbSeat, this.bigBlind);
    this.currentBet = Math.max(this.bets[sbSeat] || 0, this.bets[bbSeat] || 0);
    this.minRaiseSize = this.bigBlind;
    this.pot = 0; // blinds live in `bets` until street close
    this.handLog.push({ action: 'blinds', sb: { seat: sbSeat, amount: this.bets[sbSeat] }, bb: { seat: bbSeat, amount: this.bets[bbSeat] } });

    // Tournament: sitting-out players are blinded off — folded instantly.
    // This keeps inactive stacks bleeding so events always finish.
    const activeSeats = eligible.filter(s => !this.seats[s].sittingOut);
    if (activeSeats.length === 0) {
      // Everyone inactive: blind battle — run the board, cards speak.
      // Folding would just swap blinds back and forth forever; a showdown
      // creates variance so short stacks bust and the event ends.
      for (const s of eligible) this.acted.add(s);
      this.handLog.push({ action: 'blind_battle', seats: [...eligible] });
      this.beginTurn(null);
      this.runoutBoard(eligible);
      return;
    }
    for (const seat of [...eligible]) {
      const p = this.seats[seat];
      if (p?.sittingOut && !this.folded.has(seat)) {
        this.applyFold(seat, true);
        this.handLog.push({ action: 'sitout_fold', seat });
      }
    }
    if (this.liveSeats().length <= 1) return; // award already emitted by applyFold

    // First to act preflop: seat after the big blind (heads-up: the SB/dealer)
    this.acted = new Set();
    const actors = this.canActSeats(eligible);
    let first = n === 2 ? sbSeat : this.next(eligible, bbSeat);
    if (this.folded.has(first)) {
      // blinded-off seat — action passes to the next live actor
      first = actors.find(s => s !== bbSeat) ?? actors[0] ?? null;
    }
    if (actors.length <= 1) {
      // Everyone else all-in from blinds → run out immediately
      this.beginTurn(null);
    } else if (first !== null && first !== undefined) {
      this.beginTurn(first);
    } else {
      this.beginTurn(null);
    }

    this.emitState();
  }

  postBlind(seat, amount) {
    const p = this.seats[seat];
    const post = Math.min(amount, p.chips);
    p.chips -= post;
    p.lastAction = post === amount ? 'blind' : 'all-in blind';
    this.bets[seat] = (this.bets[seat] || 0) + post;
    this.committed[seat] = (this.committed[seat] || 0) + post;
    if (p.chips === 0) {
      p.allIn = true;
      this.allIn.add(seat);
    }
  }

  next(eligible, fromSeat) {
    const idx = eligible.indexOf(fromSeat);
    return eligible[(idx + 1) % eligible.length];
  }

  // Seats who still need to act this street: dealt in, not folded, not all-in
  canActSeats(eligibleArg) {
    const eligible = eligibleArg || this.eligibleSeats();
    return eligible.filter(s => !this.folded.has(s) && !this.allIn.has(s));
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  applyAction(userId, action, amount) {
    if (this.destroyed) return { error: 'Table closed' };
    if (!this.handInProgress) return { error: 'No hand in progress' };
    const seat = this.seatOf(userId);
    if (seat === -1) return { error: 'You are not seated at this table' };
    if (this.actionOn !== seat) return { error: 'Not your turn' };
    const p = this.seats[seat];

    const callAmount = Math.max(0, this.currentBet - (this.bets[seat] || 0));

    switch (action) {
      case 'fold':
        if (callAmount === 0 && this.hasBetThisRound(seat)) {
          // Allowed but discouraged; fold is always legal
        }
        this.applyFold(seat);
        break;
      case 'check':
        if (callAmount > 0) return { error: 'Cannot check — must call, raise or fold' };
        p.lastAction = 'check';
        this.handLog.push({ action: 'check', seat });
        this.acted.add(seat);
        break;
      case 'call': {
        const pay = Math.min(callAmount, p.chips);
        if (callAmount === 0) {
          p.lastAction = 'check';
          this.handLog.push({ action: 'check', seat });
          this.acted.add(seat);
          break;
        }
        p.chips -= pay;
        this.bets[seat] = (this.bets[seat] || 0) + pay;
        this.committed[seat] = (this.committed[seat] || 0) + pay;
        p.lastAction = p.chips === 0 ? 'all-in call' : 'call';
        this.handLog.push({ action: p.chips === 0 ? 'all-in' : 'call', seat, amount: pay });
        if (p.chips === 0) { p.allIn = true; this.allIn.add(seat); }
        this.acted.add(seat);
        break;
      }
      case 'bet':
      case 'raise': {
        const result = this.applyRaise(seat, amount);
        if (result.error) return result;
        break;
      }
      default:
        return { error: 'Unknown action' };
    }

    p.autoFoldCount = 0;
    this.emitState({ action: { seat, action: p.lastAction } });
    this.advanceIfRoundComplete();
    return { success: true };
  }

  applyFold(seat, silent = false) {
    const p = this.seats[seat];
    p.folded = true;
    p.lastAction = 'fold';
    this.folded.add(seat);
    this.acted.add(seat);
    this.handLog.push({ action: 'fold', seat });
    if (!silent) this.emitState({ action: { seat, action: 'fold' } });

    // Everyone else folded → award pot to remaining player(s)
    const live = this.liveSeats();
    if (live.length === 1) {
      this.closeBettingReturnUncalled();
      this.collectBets();
      this.award([[live[0], this.pot]], { folded: true });
    }
  }

  applyRaise(seat, amount) {
    const p = this.seats[seat];
    const myBet = this.bets[seat] || 0;
    const maxTotal = myBet + p.chips;
    const requested = Math.floor(Number(amount) || 0);

    if (!Number.isFinite(requested) || requested <= 0) return { error: 'Invalid bet amount' };
    const total = Math.min(requested, maxTotal);
    const add = total - myBet;
    if (add <= 0) return { error: 'Raise must exceed your current bet' };

    const isAllIn = total === maxTotal;
    const minTotal = this.currentBet === 0
      ? Math.min(this.bigBlind, maxTotal)
      : this.currentBet + this.minRaiseSize;
    if (total < minTotal && !isAllIn) {
      return { error: `Minimum raise to ${minTotal.toLocaleString()}` };
    }

    // Re-raise must be at least the size of the previous raise (full raise rule)
    if (this.currentBet > 0 && total > this.currentBet) {
      const raiseSize = total - this.currentBet;
      if (raiseSize < this.minRaiseSize && !isAllIn) {
        return { error: `Minimum raise to ${(this.currentBet + this.minRaiseSize).toLocaleString()}` };
      }
      this.minRaiseSize = raiseSize;
    }

    p.chips -= add;
    this.bets[seat] = total;
    this.committed[seat] = (this.committed[seat] || 0) + add;
    if (p.chips === 0) { p.allIn = true; this.allIn.add(seat); }
    this.currentBet = Math.max(this.currentBet, total);
    p.lastAction = isAllIn ? 'all-in' : (this.bets[seat] > this.bigBlind && this.phase === 'preflop' && this.currentBet === this.bigBlind ? 'bet' : 'raise');
    this.handLog.push({ action: isAllIn ? 'all-in' : (p.lastAction === 'bet' ? 'bet' : 'raise'), seat, amount: add, total });

    // New aggression: everyone else must act again
    this.acted = new Set([seat]);
    return { success: true };
  }

  hasBetThisRound(seat) { return (this.bets[seat] || 0) > 0; }

  // ─── Round / street progression ─────────────────────────────────────────────

  liveSeats() {
    return this.eligibleSeats().filter(s => !this.folded.has(s));
  }

  roundComplete(eligible) {
    const canAct = this.canActSeats(eligible);
    const live = liveFilter(eligible, this.folded);
    // Round over if ≤1 player can still act (others all-in or folded)
    if (canAct.length <= 1) {
      // The single remaining actor must still act if facing a bet
      if (canAct.length === 1) {
        const s = canAct[0];
        const toCall = Math.max(0, this.currentBet - (this.bets[s] || 0));
        if (toCall > 0 && !this.acted.has(s)) return false;
      }
      return true;
    }
    // All live players acted and bets matched
    for (const s of live) {
      if (!this.acted.has(s)) return false;
      if ((this.bets[s] || 0) !== this.currentBet) return false;
    }
    return true;
  }

  advanceIfRoundComplete() {
    const eligible = this.eligibleSeats();
    const live = liveFilter(eligible, this.folded);
    if (live.length <= 1) return; // award already triggered by fold

    if (!this.roundComplete(eligible)) {
      this.setNextActor(eligible);
      return;
    }

    // Street is over
    this.closeBettingReturnUncalled();
    this.collectBets();
    this.actionOn = null;

    const actors = this.canActSeats(eligible);
    if (live.length === 1) {
      this.award([[live[0], this.pot]], { folded: true });
      return;
    }
    if (actors.length <= 1) {
      // All-in runout (or one player still to act with no bet — that only
      // happens preflop when both blinds are all-in)
      this.runoutBoard(eligible);
      return;
    }
    this.nextStreet(eligible);
  }

  setNextActor(eligible) {
    const canAct = this.canActSeats(eligible);
    // Clockwise from the last actor... standard is clockwise from dealer or
    // from the current actor; using current actor keeps multiway pots honest.
    const from = this.actionOn;
    let nextSeat = null;
    const order = this.orderFrom(from);
    for (const s of order) {
      if (canAct.includes(s) && !this.acted.has(s)) { nextSeat = s; break; }
    }
    if (nextSeat === null) {
      // Everyone who can act has acted — check round complete again
      if (this.roundComplete(eligible)) {
        this.advanceIfRoundComplete();
        return;
      }
      nextSeat = canAct[0] ?? null;
    }
    this.beginTurn(nextSeat);
  }

  orderFrom(seat) {
    const eligible = this.eligibleSeats();
    const idx = eligible.indexOf(seat);
    if (idx === -1) return eligible;
    return [...eligible.slice(idx), ...eligible.slice(0, idx)];
  }

  beginTurn(seat) {
    this.actionOn = seat;
    if (seat === null) {
      this.actionDeadline = 0;
      return;
    }
    const p = this.seats[seat];
    const base = this.speed === 'hyper' ? TURN_HYPER_MS : TURN_MS;
    // Disconnected seats act on a short fuse — never stall the table
    this.actionDeadline = Date.now() + (p.disconnected ? 4000 : base);
    this.manager?.onTurnStart?.(this, seat);
  }

  // Called by the manager tick when a player runs out of time
  handleTimeout(seat) {
    if (this.destroyed || !this.handInProgress || this.actionOn !== seat) return;
    const p = this.seats[seat];
    if (!p) return;
    // Disconnected players: no timebank, fold/check immediately, then sit out
    // (tournaments) so their stack blinds off instead of stalling the table.
    if (p.disconnected) {
      const toCall = Math.max(0, this.currentBet - (this.bets[seat] || 0));
      this.applyAction(p.userId, toCall > 0 ? 'fold' : 'check', 0);
      if (this.isTournament && !p.sittingOut) {
        const p2 = this.seats[seat];
        if (p2) {
          p2.sittingOut = true;
          this.broadcast('playerSittingOut', { seat, username: p2.username, reason: 'disconnect' });
        }
      }
      return;
    }
    if (!p.timebankUsed && p.timebank > 0) {
      p.timebankUsed = true;
      const grant = Math.min(TIMEBANK_CHUNK, p.timebank);
      p.timebank -= grant;
      this.actionDeadline = Date.now() + grant * 1000;
      this.broadcast('timebankUsed', { seat, secondsAdded: grant, remaining: p.timebank });
      return;
    }
    const toCall = Math.max(0, this.currentBet - (this.bets[seat] || 0));
    this.applyAction(p.userId, toCall > 0 ? 'fold' : 'check', 0);
    p.autoFoldCount = (p.autoFoldCount || 0) + 1;
    if (this.isTournament && p.autoFoldCount >= 3 && !p.sittingOut) {
      p.sittingOut = true;
      this.broadcast('playerSittingOut', { seat, username: p.username, reason: 'timeout' });
    }
    this.broadcast('autoAction', { seat, action: toCall > 0 ? 'fold' : 'check', reason: 'timeout' });
  }

  useTimebank(userId) {
    const seat = this.seatOf(userId);
    if (seat === -1 || this.actionOn !== seat) return { error: 'Not your turn' };
    const p = this.seats[seat];
    if (p.timebankUsed) return { error: 'Time bank already used this hand' };
    if (p.timebank <= 0) return { error: 'No time bank remaining' };
    p.timebankUsed = true;
    const grant = Math.min(TIMEBANK_CHUNK, p.timebank);
    p.timebank -= grant;
    this.actionDeadline = Date.now() + grant * 1000;
    this.broadcast('timebankUsed', { seat, secondsAdded: grant, remaining: p.timebank });
    return { success: true };
  }

  // ─── Streets, showdown, awards ──────────────────────────────────────────────

  closeBettingReturnUncalled() {
    // Return the uncalled portion of the largest bet. Folded players' dead
    // money counts toward what was "called" — e.g. a 70 shove facing a 20 call
    // and a 10 blind-fold is uncalled by 50, not 70.
    const eligible = this.eligibleSeats().filter(s => !this.folded.has(s));
    const allCommitted = this.eligibleSeats()
      .map(s => this.committed[s] || 0)
      .filter(c => c > 0)
      .sort((a, b) => b - a);
    const top = allCommitted[0] || 0;
    const second = allCommitted[1] || 0;
    const excess = top - second;
    if (excess > 0) {
      const topSeat = eligible.find(s => (this.committed[s] || 0) === top);
      if (topSeat !== undefined) {
        const refund = Math.min(excess, this.bets[topSeat] || 0);
        if (refund > 0) {
          const p = this.seats[topSeat];
          p.chips += refund;
          this.bets[topSeat] -= refund;
          this.committed[topSeat] -= refund;
          this.handLog.push({ action: 'uncalled_return', seat: topSeat, amount: refund });
          if (p.allIn && p.chips > 0) { p.allIn = false; this.allIn.delete(topSeat); }
        }
      }
    }
  }

  collectBets() {
    for (const seat of Object.keys(this.bets)) {
      this.pot += this.bets[seat];
    }
    this.bets = {};
    this.currentBet = 0;
    this.minRaiseSize = this.bigBlind;
    this.acted = new Set();
  }

  nextStreet(eligible) {
    const map = { preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] };
    const [phase, count] = map[this.phase] || ['river', 0];
    if (count > 0) {
      const cards = this.deck.splice(0, count);
      this.community.push(...cards);
      this.handLog.push({ action: 'deal_community', phase, cards });
    }
    this.phase = phase;
    for (const seat of eligible) {
      const p = this.seats[seat];
      if (p) p.lastAction = null;
    }
    // Postflop action starts left of the dealer
    const canAct = this.canActSeats(eligible);
    let first = null;
    for (const s of this.orderFrom(this.dealerSeat)) {
      if (s === this.dealerSeat) continue;
      if (canAct.includes(s)) { first = s; break; }
    }
    if (first === null && canAct.length > 0) first = canAct[0];
    this.emitState();
    this.beginTurn(first);
  }

  runoutBoard(eligible) {
    // Deal remaining streets with pauses, then showdown
    const runout = () => {
      if (this.destroyed) return;
      const map = { preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] };
      const [phase, count] = map[this.phase] || [null, 0];
      if (phase) {
        const cards = this.deck.splice(0, count);
        this.community.push(...cards);
        this.handLog.push({ action: 'deal_community', phase, cards, allIn: true });
        this.phase = phase;
        this.emitState();
        this.schedule(runout, RUNOUT_DELAY_MS);
        return;
      }
      this.showdown();
    };
    this.schedule(runout, RUNOUT_DELAY_MS);
  }

  showdown() {
    this.phase = 'showdown';
    this.actionOn = null;
    const live = this.liveSeats();
    const board = this.community;

    // Evaluate every live hand
    const evals = {};
    for (const seat of live) {
      const p = this.seats[seat];
      evals[seat] = bestHand(p.cards, board);
    }

    // Build side pots from total committed amounts
    const layers = this.buildSidePots();
    const awards = new Map(); // seat -> amount
    const layerResults = [];

    for (const layer of layers) {
      const contenders = layer.seats.filter(s => live.includes(s));
      if (contenders.length === 0) continue; // dead layer (shouldn't happen)
      let best = [contenders[0]];
      for (let i = 1; i < contenders.length; i++) {
        const cmp = compareRanks(evals[contenders[i]].rank, evals[best[0]].rank);
        if (cmp > 0) best = [contenders[i]];
        else if (cmp === 0) best.push(contenders[i]);
      }
      // Split the layer (rake taken from the main layer only for simplicity
      // is avoided; rake is applied per layer below)
      const rake = this.isTournament ? 0 : rakeForPot(layer.amount, this.bigBlind);
      const awardable = layer.amount - rake;
      const share = Math.floor(awardable / best.length);
      let remainder = awardable - share * best.length;
      // Odd chips: first winner left of dealer
      const order = this.orderFrom(this.dealerSeat);
      const sortedWinners = [...best].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      for (const w of sortedWinners) {
        const amt = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        awards.set(w, (awards.get(w) || 0) + amt);
      }
      layerResults.push({ amount: layer.amount, rake, winners: [...best], eligible: contenders });
      this.handLog.push({ action: 'pot', amount: layer.amount, rake, winners: [...best] });
    }

    // (Stacks are credited inside award() — single crediting point)
    const totalPot = layers.reduce((sum, l) => sum + l.amount, 0);
    const totalRake = layerResults.reduce((sum, l) => sum + l.rake, 0);

    const revealed = {};
    for (const seat of live) {
      revealed[seat] = { cards: this.seats[seat].cards, handName: evals[seat].name };
    }
    this.handLog.push({
      action: 'showdown',
      hands: Object.fromEntries(live.map(s => [s, evals[s].name])),
    });

    this.award(
      [...awards.entries()].map(([seat, amount]) => [seat, amount]),
      { showdown: true, revealed, evaluations: Object.fromEntries(live.map(s => [s, evals[s]])), rake: totalRake, potTotal: totalPot }
    );
  }

  // Build pot layers from committed amounts. Each layer carries the seats
  // eligible to win it (committed ≥ layer top, not folded).
  buildSidePots() {
    const eligible = this.eligibleSeats();
    const players = eligible.map(s => ({ seat: s, committed: this.committed[s] || 0, folded: this.folded.has(s) }));
    const levels = [...new Set(players.filter(p => p.committed > 0).map(p => p.committed))].sort((a, b) => a - b);
    const layers = [];
    let prev = 0;
    for (const level of levels) {
      let amount = 0;
      for (const p of players) {
        amount += Math.max(0, Math.min(p.committed, level) - prev);
      }
      const seats = players.filter(p => !p.folded && p.committed >= level).map(p => p.seat);
      if (amount > 0) layers.push({ amount, seats, top: level });
      prev = level;
    }
    // Merge the top layer if only one player is eligible for it and that
    // player is the top contributor → it's an uncalled bet (already refunded,
    // but fold-aways can leave dead layers) → return to them.
    while (layers.length > 0 && layers[layers.length - 1].seats.length === 1) {
      const layer = layers.pop();
      const seat = layer.seats[0];
      this.seats[seat].chips += layer.amount;
      this.handLog.push({ action: 'dead_pot_return', seat, amount: layer.amount });
      this.pot -= layer.amount;
    }
    return layers;
  }

  award(awards, { showdown = false, revealed = null, evaluations = null, rake = 0, potTotal = null, folded = false } = {}) {
    // Credit winning stacks (single source of truth — callers must not
    // pre-credit; stacks snapshot below happens after crediting)
    for (const [seat, amount] of awards) {
      const p = this.seats[seat];
      if (p && amount > 0) p.chips += amount;
    }

    // Reset live-hand tracking
    this.pot = 0;
    this.bets = {};
    this.committed = {};
    this.handInProgress = false;
    this.actionOn = null;
    this.actionDeadline = 0;
    this.phase = showdown || revealed ? 'showdown' : this.phase;

    const summary = {
      handNumber: this.handNumber,
      awards: awards.map(([seat, amount]) => ({
        seat, amount,
        username: this.seats[seat]?.username,
        handName: revealed?.[seat]?.handName || null,
      })),
      potTotal: potTotal ?? awards.reduce((s, [, a]) => s + a, 0) + (rake || 0),
      rake,
      community: this.community,
      revealed,
      evaluations: evaluations ? Object.fromEntries(Object.entries(evaluations).map(([s, e]) => [s, { name: e.name, rank: e.rank }])) : null,
      foldedWin: folded,
      log: this.handLog,
      stacks: Object.fromEntries(this.eligibleSeats().map(s => [s, this.seats[s].chips])),
    };
    this.handLog.push({ action: 'award', awards: summary.awards });

    this.broadcast('handResult', summary);
    this.io.to(`t:${this.id}`).emit('tableSeats', { seats: this.publicSeats() });

    // Reveal AI cards occasionally on fold-wins (flavor, mirroring legacy)
    this.manager?.onHandEnd?.(this, summary);
  }

  // ─── Tournament level up (manager drives this between hands) ────────────────

  currentLevel() { return this.level; }

  checkLevelUp() {
    if (!this.isTournament) return false;
    const elapsed = Date.now() - this.levelStartTime;
    if (elapsed >= this.levelMinutes * 60 * 1000) {
      this.level += 1;
      this.levelStartTime = Date.now();
      const { smallBlind, bigBlind } = blindForLevel(this.speed, this.level);
      this.smallBlind = smallBlind;
      this.bigBlind = bigBlind;
      this.minRaiseSize = bigBlind;
      this.broadcast('levelUp', { level: this.level, smallBlind, bigBlind });
      return true;
    }
    return false;
  }

  // ─── Emissions & timers ─────────────────────────────────────────────────────

  publicSeats(includeStacks = true) {
    return this.seats.map((p, seat) => {
      if (!p) return { seat, empty: true };
      return {
        seat,
        username: p.username,
        avatar: p.avatar,
        chips: includeStacks ? p.chips : undefined,
        sittingOut: p.sittingOut,
        disconnected: p.disconnected,
        lastAction: p.lastAction,
        inHand: this.handInProgress && p.cards.length > 0 && !p.folded,
        waiting: this.handInProgress && p.cards.length === 0,
        isAi: !!p.isAi,
      };
    });
  }

  publicState() {
    const now = Date.now();
    const levelEndsAt = this.isTournament ? this.levelStartTime + this.levelMinutes * 60 * 1000 : 0;
    return {
      gameId: this.gameId,
      tableId: this.id,
      gameType: this.gameType,
      name: this.name,
      handNumber: this.handNumber,
      phase: this.handInProgress ? this.phase : 'waiting',
      communityCards: this.community,
      pot: this.pot + Object.values(this.bets).reduce((a, b) => a + b, 0),
      potCollected: this.pot,
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet > 0 ? this.currentBet + this.minRaiseSize : Math.min(this.bigBlind, 1e9),
      bigBlind: this.bigBlind,
      smallBlind: this.smallBlind,
      seats: this.publicSeats(),
      seatBets: { ...this.bets },
      playersAlive: this.seats.filter(p => p && p.chips > 0).length,
      dealerSeat: this.dealerSeat,
      actionOn: this.actionOn,
      deadline: this.actionDeadline || 0,
      serverTime: now,
      level: this.level,
      levelEndsAt,
      speed: this.speed,
      inHand: this.handInProgress,
    };
  }

  emitState(extra = {}) {
    this.broadcast('gameState', { ...this.publicState(), ...extra });
  }

  broadcast(event, payload) {
    if (this.destroyed) return;
    this.io.to(`t:${this.id}`).emit(event, payload);
  }

  schedule(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  destroy() {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}

function liveFilter(seats, foldedSet) {
  return seats.filter(s => !foldedSet.has(s));
}

module.exports = { Table, rakeForPot, TURN_MS, TIMEBANK_START };
