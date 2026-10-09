// Casino Blackjack engine — in-memory round state machine, casino-hosted.
// Rules: 6-deck shoe, dealer hits soft 17 (H17),
// blackjack pays 3:2, double on any first two cards, one split (aces get
// one card each), no insurance/surrender. Dealer peeks on A/10 upcards.
//
// Round flow: betting (12s) → dealing → per-player turns (15s, auto-stand
// on timeout) → dealer (paced draws) → settle → betting…
//
// Money contract: bets are INTENTS during the betting phase; the manager
// debits them transactionally at phase close (one tx per player) and
// persists the round ledger (house_rounds status 'open') before any card
// is drawn. Crash → manager refunds every open round on boot.

const DECKS = 6;
const BET_MS = 12000;
const DEAL_MS = 1800;
const TURN_MS = 15000;
const DEALER_PACE_MS = 850;
const SETTLE_MS = 4500;

// card: 'A','2'…'10','J','Q','K' + suit letter, e.g. 'As', 'Th'
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['s', 'h', 'd', 'c'];

function buildShoe() {
  const shoe = [];
  for (let d = 0; d < DECKS; d++) {
    for (const r of RANKS) for (const s of SUITS) shoe.push(r + s);
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

// { total, soft } — soft = an ace still counted as 11
function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const v = cardValue(c.slice(0, -1));
    total += v;
    if (v === 11) aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

class BlackjackTable {
  constructor(opts) {
    this.game = 'blackjack';
    this.id = opts.id;
    this.io = opts.io;
    this.name = opts.name;
    this.currency = opts.currency;         // 'play' | 'btc'
    this.minBet = opts.minBet;
    this.maxBet = opts.maxBet;
    this.manager = opts.manager;           // { debitBets, creditWin, isBot, botUsername }
    this.seats = 5;

    this.shoe = buildShoe();
    this.phase = 'betting';                // betting|dealing|turn|dealer|settle
    this.phaseEndsAt = Date.now() + BET_MS;
    this.roundNo = 0;
    this.intents = new Map();              // seat -> {userId, username, amount}
    this.players = [];                     // seated this round: {seat,userId,username,hands:[{cards,bet,done,fromSplit}],result,net}
    this.turnIdx = 0;
    this.handIdx = 0;
    this.dealer = [];
    this.history = [];                     // last 12 rounds: {no, myNet aggregated? just dealer info}
    this.timers = new Set();
    this.destroyed = false;

    this.schedule(() => this.openBetting(), 400);
  }

  schedule(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); if (!this.destroyed) fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  destroy() {
    this.destroyed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  broadcast(event, payload) { if (!this.destroyed) this.io.to(`h:${this.id}`).emit(event, payload); }

  emitState() { this.broadcast('houseState', this.publicState()); }

  publicState() {
    const hideDealerHole = ['turn'].includes(this.phase) || (this.phase === 'dealing');
    const dealerCards = hideDealerHole && this.dealer.length > 1
      ? [this.dealer[0], '??']
      : this.dealer;
    return {
      game: 'blackjack',
      tableId: this.id,
      name: this.name,
      currency: this.currency,
      minBet: this.minBet,
      maxBet: this.maxBet,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      serverTime: Date.now(),
      roundNo: this.roundNo,
      shoePct: Math.round((this.shoe.length / (DECKS * 52)) * 100),
      dealer: { cards: dealerCards, value: this.dealerValue(hideDealerHole) },
      seats: this.seatViews(),
      turnSeat: this.phase === 'turn' ? this.players[this.turnIdx]?.seat : null,
      history: this.history.slice(-12),
    };
  }

  dealerValue(hide) {
    if (!this.dealer.length) return null;
    if (hide && this.dealer.length > 1) return handValue([this.dealer[0]]).total;
    return handValue(this.dealer).total;
  }

  seatViews() {
    const out = [];
    for (let seat = 0; seat < this.seats; seat++) {
      const intent = this.intents.get(seat);
      const p = this.players.find(x => x.seat === seat);
      if (p) {
        out.push({
          seat, username: p.username, bet: p.hands.reduce((s, h) => s + h.bet, 0),
          hands: p.hands.map(h => ({
            cards: h.cards, value: handValue(h.cards).total,
            done: h.done, bust: handValue(h.cards).total > 21,
            blackjack: isBlackjack(h.cards) && h.cards.length === 2 && !h.fromSplit,
          })),
          result: p.result, net: p.net, active: this.phase === 'turn' && this.players[this.turnIdx] === p,
        });
      } else if (intent) {
        out.push({ seat, username: intent.username, bet: intent.amount, hands: [], pending: true });
      } else {
        out.push({ seat, empty: true });
      }
    }
    return out;
  }

  // ─── Betting ───

  openBetting() {
    this.roundNo++;
    this.phase = 'betting';
    this.phaseEndsAt = Date.now() + BET_MS;
    this.intents = new Map();
    this.players = [];
    this.dealer = [];
    // Continuous shuffle machine: fresh 6-deck shoe every round.
    // No penetration → card counting is mathematically impossible →
    // the house edge holds at its full value every hand.
    this.shoe = buildShoe();
    this.broadcast('shoeShuffled', {});
    // Bots (play tables): manager injects bot intents
    this.manager?.onBettingOpen?.(this);
    this.emitState();
    this.schedule(() => this.closeBetting(), BET_MS);
  }

  placeBet(userId, username, seat, amount) {
    if (this.phase !== 'betting') return { error: 'Betting is closed for this round' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < this.minBet) return { error: `Minimum bet ${this.minBet.toLocaleString()}` };
    if (amount > this.maxBet) return { error: `Maximum bet ${this.maxBet.toLocaleString()}` };

    // ONE seat per player: if they already have an intent this round, update
    // that bet in place. (A double-click must never seat a player twice.)
    for (const [s, it] of this.intents) {
      if (it.userId === userId) {
        it.amount = amount;
        if (seat !== null && seat !== undefined && seat !== s && !this.intents.has(seat)) {
          // requested a different free seat → move them
          this.intents.delete(s);
          it.seat = seat;
          this.intents.set(seat, it);
        }
        this.emitState();
        return { ok: true, seat: it.seat };
      }
    }

    if (seat === null || seat === undefined) seat = this.freeSeat();
    if (seat === -1 || seat === undefined) return { error: 'Table is full' };
    if (this.intents.has(seat) && this.intents.get(seat).userId !== userId) return { error: 'Seat taken' };
    this.intents.set(seat, { userId, username, amount, seat });
    this.emitState();
    return { ok: true, seat };
  }

  freeSeat() {
    for (let s = 0; s < this.seats; s++) if (!this.intents.has(s)) return s;
    return -1;
  }

  mySeat(userId) {
    for (const [seat, it] of this.intents) if (it.userId === userId) return seat;
    return -1;
  }

  async closeBetting() {
    if (this.destroyed) return;
    // Manager debits + persists ledger → returns committed entries (balance-checked)
    const committed = await this.manager.commitBlackjackBets(this, this.intents);
    this.intents = new Map();
    if (committed.length === 0) {
      this.phase = 'settle';
      this.phaseEndsAt = Date.now() + 1200;
      this.emitState();
      this.schedule(() => this.openBetting(), 1200);
      return;
    }
    this.players = committed.map((c, i) => ({
      seat: c.seat, userId: c.userId, username: c.username, isBot: !!c.isBot,
      hands: [{ cards: [], bet: c.amount, done: false, fromSplit: false }],
      result: null, net: 0,
    }));
    this.players.sort((a, b) => a.seat - b.seat);
    this.phase = 'dealing';
    this.phaseEndsAt = Date.now() + DEAL_MS;
    this.emitState();
    this.schedule(() => this.deal(), DEAL_MS);
  }

  // ─── Dealing ───

  draw() { return this.shoe.pop(); }

  deal() {
    if (this.destroyed) return;
    for (let pass = 0; pass < 2; pass++) {
      for (const p of this.players) p.hands[0].cards.push(this.draw());
      this.dealer.push(this.draw());
    }
    this.emitState();

    // Dealer peek on A/10
    const up = this.dealer[0];
    if (cardValue(up.slice(0, -1)) === 10 || up[0] === 'A') {
      if (isBlackjack(this.dealer)) {
        this.schedule(() => this.settleDealerBlackjack(), 1200);
        return;
      }
    }
    // Player naturals marked; they don't take turns
    this.turnIdx = 0;
    this.handIdx = 0;
    this.advanceTurn(true);
  }

  settleDealerBlackjack() {
    const payouts = [];
    for (const p of this.players) {
      const h = p.hands[0];
      if (isBlackjack(h.cards)) {
        p.result = 'push'; p.net = 0;
        payouts.push({ userId: p.userId, amount: h.bet });
      }
      else { p.result = 'lose'; p.net = -h.bet; }
      h.done = true;
    }
    this.finishRound(payouts);
  }

  // ─── Player turns ───

  advanceTurn(skipDone = false) {
    // find next hand to act
    while (this.turnIdx < this.players.length) {
      const p = this.players[this.turnIdx];
      if (this.handIdx >= p.hands.length) { this.turnIdx++; this.handIdx = 0; continue; }
      const h = p.hands[this.handIdx];
      if (h.done) { this.handIdx++; continue; }
      const { total } = handValue(h.cards);
      if (total >= 21) { h.done = true; this.handIdx++; continue; }
      if (skipDone && isBlackjack(h.cards) && !h.fromSplit) { h.done = true; h.natural = true; this.handIdx++; continue; }
      this.phase = 'turn';
      this.phaseEndsAt = Date.now() + TURN_MS;
      this.emitState();
      // Bots act
      if (p.isBot) {
        this.schedule(() => {
          const bot = this.players[this.turnIdx];
          if (!bot || !bot.isBot) return;
          const action = this.botAction(bot, this.handIdx);
          this.applyAction(bot.userId, action.action, 0);
        }, 900 + Math.floor(Math.random() * 800));
      } else {
        this.schedule(() => {
          // timeout → stand
          if (this.phase === 'turn') {
            const cur = this.players[this.turnIdx];
            if (cur && !cur.hands[this.handIdx]?.done) this.applyAction(cur.userId, 'stand', 0);
          }
        }, TURN_MS);
      }
      return;
    }
    this.dealerPlay();
  }

  async applyAction(userId, action, amount = 0) {
    if (this.destroyed || this.phase !== 'turn') return { error: 'Not accepting actions' };
    const p = this.players[this.turnIdx];
    if (!p || p.userId !== userId) return { error: 'Not your turn' };
    const h = p.hands[this.handIdx];
    if (h.done) return { error: 'Hand already finished' };
    if (h.actionPending) return { error: 'Action is still processing' };
    const { total, soft } = handValue(h.cards);

    if (action === 'hit') {
      h.cards.push(this.draw());
      const v = handValue(h.cards).total;
      if (v >= 21) h.done = true;
      this.emitState();
      if (h.done) return this.nextHand();
      return this.scheduleTurnAgain();
    }
    if (action === 'stand') {
      h.done = true;
      return this.nextHand();
    }
    if (action === 'double') {
      if (h.cards.length !== 2) return { error: 'Can only double on first two cards' };
      h.actionPending = true;
      let ok;
      try { ok = await this.manager.doubleBet(this, p, h); }
      catch { ok = { error: 'Double could not be confirmed' }; }
      h.actionPending = false;
      if (!ok || ok.error) {
        this.scheduleTurnAgain();
        return { error: ok?.error || 'Insufficient balance to double' };
      }
      h.bet *= 2;
      h.cards.push(this.draw());
      h.done = true;
      this.emitState();
      return this.nextHand();
    }
    if (action === 'split') {
      if (h.cards.length !== 2) return { error: 'Can only split with two cards' };
      if (p.hands.length > 1) return { error: 'Only one split allowed' };
      const [a, b] = h.cards;
      if (cardValue(a.slice(0, -1)) !== cardValue(b.slice(0, -1))) return { error: 'Cards must be the same rank' };
      h.actionPending = true;
      let ok;
      try { ok = await this.manager.splitBet(this, p, h); }
      catch { ok = { error: 'Split could not be confirmed' }; }
      h.actionPending = false;
      if (!ok || ok.error) {
        this.scheduleTurnAgain();
        return { error: ok?.error || 'Insufficient balance to split' };
      }
      const isAces = a[0] === 'A';
      const h2 = { cards: [b], bet: h.bet, done: isAces, fromSplit: true };
      h.cards = [a]; h.fromSplit = true; h.done = isAces;
      p.hands.splice(this.handIdx + 1, 0, h2);
      if (!isAces) { h.cards.push(this.draw()); h2.cards.push(this.draw()); }
      // re-evaluate 21s
      if (handValue(h.cards).total === 21) h.done = true;
      if (!isAces && handValue(h2.cards).total === 21) h2.done = true;
      this.emitState();
      return this.nextHand();
    }
    return { error: 'Unknown action' };
  }

  scheduleTurnAgain() {
    // Re-arm the per-turn timeout without advancing
    this.phaseEndsAt = Date.now() + TURN_MS;
    this.schedule(() => {
      if (this.phase === 'turn') {
        const cur = this.players[this.turnIdx];
        if (cur && !cur.hands[this.handIdx]?.done) this.applyAction(cur.userId, 'stand', 0);
      }
    }, TURN_MS);
    return { ok: true };
  }

  nextHand() {
    this.handIdx++;
    this.advanceTurn();
    return { ok: true };
  }

  botAction(p, handIdx) {
    const h = p.hands[handIdx];
    const { total, soft } = handValue(h.cards);
    const dealerUp = cardValue(this.dealer[0].slice(0, -1));
    const canDouble = h.cards.length === 2;
    const canSplit = h.cards.length === 2 && p.hands.length === 1 &&
      cardValue(h.cards[0].slice(0, -1)) === cardValue(h.cards[1].slice(0, -1));
    if (canSplit) {
      const rank = cardValue(h.cards[0].slice(0, -1));
      if (rank === 11 || rank === 8) return { action: 'split' };
      if (rank === 9 && dealerUp !== 7 && dealerUp !== 10) return { action: 'split' };
      if (rank === 2 || rank === 3 || rank === 7) { if (dealerUp <= 7) return { action: 'split' }; }
      if (rank === 6 && dealerUp <= 6) return { action: 'split' };
    }
    if (soft && total >= 13 && total <= 18 && h.cards.length === 2) {
      if (total >= 19) return { action: 'stand' };
      if (total === 18) return dealerUp >= 9 ? { action: 'hit' } : (canDouble && dealerUp <= 6 ? { action: 'double' } : { action: 'stand' });
      if (canDouble && dealerUp >= 4 && dealerUp <= 6) return { action: 'double' };
      return { action: 'hit' };
    }
    if (total <= 11) return canDouble ? { action: 'double' } : { action: 'hit' };
    if (total === 12) return dealerUp >= 4 && dealerUp <= 6 ? { action: 'stand' } : { action: 'hit' };
    if (total >= 17) return { action: 'stand' };
    return dealerUp >= 7 ? { action: 'hit' } : { action: 'stand' };
  }

  // ─── Dealer + settle ───

  dealerPlay() {
    this.phase = 'dealer';
    this.phaseEndsAt = 0;
    this.emitState();
    const step = () => {
      if (this.destroyed) return;
      const { total, soft } = handValue(this.dealer);
      // H17 house rule: dealer hits soft 17 (e.g. A-6). Slightly increases
      // the house edge vs S17 while looking completely normal to players.
      if (total < 17 || (total === 17 && soft)) {
        this.dealer.push(this.draw());
        this.emitState();
        this.schedule(step, DEALER_PACE_MS);
      } else {
        this.schedule(() => this.settle(), 600);
      }
    };
    this.schedule(step, 700);
  }

  settle() {
    const dealerV = handValue(this.dealer).total;
    const dealerBJ = isBlackjack(this.dealer);
    const payouts = []; // {userId, amount} chips to credit (winnings incl. stake back)
    for (const p of this.players) {
      let net = 0;
      let worst = null; // aggregate result across hands
      for (const h of p.hands) {
        const v = handValue(h.cards).total;
        const nat = isBlackjack(h.cards) && !h.fromSplit;
        let stakeBack = 0, label;
        if (v > 21) { label = 'bust'; }
        else if (nat && !dealerBJ) { stakeBack = h.bet + Math.floor(h.bet * 1.5); label = 'blackjack'; }
        else if (dealerBJ && !nat) { label = 'lose'; }
        else if (dealerV > 21 || v > dealerV) { stakeBack = h.bet * 2; label = 'win'; }
        else if (v === dealerV) { stakeBack = h.bet; label = 'push'; }
        else { label = 'lose'; }
        if (!worst || rankResult(label) > rankResult(worst)) worst = label;
        net += stakeBack - h.bet;
        if (stakeBack > 0) payouts.push({ userId: p.userId, amount: stakeBack });
      }
      p.result = worst;
      p.net = net;
    }
    this.finishRound(payouts);
  }

  finishRound(payouts) {
    this.phase = 'settle';
    this.phaseEndsAt = Date.now() + SETTLE_MS;
    this.history.push({
      no: this.roundNo,
      dealer: this.dealer,
      dealerValue: handValue(this.dealer).total,
      settledAt: Date.now(),
    });
    this.emitState();
    this.manager.settleBlackjack(this, this.players, payouts).catch(e => console.error('[blackjack] settle error:', e.message));
    this.schedule(() => this.openBetting(), SETTLE_MS);
  }
}

function rankResult(label) {
  return { blackjack: 5, win: 4, push: 3, lose: 2, bust: 1 }[label] || 0;
}

module.exports = { BlackjackTable, handValue, isBlackjack };
