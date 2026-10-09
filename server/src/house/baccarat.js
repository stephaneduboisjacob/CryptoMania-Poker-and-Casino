// Live Baccarat (Punto Banco) — casino-hosted table game.
// Betting 20s on Player (2x), Banker (1.95x, 5% commission), Tie (9x).
// Punto Banco drawing tableau, paced card reveals.
// House edge: Player 1.24% · Banker 1.06% · Tie 14.4%.

const { playBaccaratCoup } = require('./instant');

const BET_MS = 20000;
const DEAL_PACE_MS = 1100;
const RESULT_MS = 5500;
const SIDES = { player: 2, banker: 1.95, tie: 9 }; // total return per 1 staked

class BaccaratTable {
  constructor(opts) {
    this.game = 'baccarat';
    this.id = opts.id;
    this.io = opts.io;
    this.name = opts.name;
    this.currency = opts.currency;
    this.minBet = opts.minBet;
    this.maxBet = opts.maxBet;
    this.manager = opts.manager;

    this.shoe = [];
    this.phase = 'betting';
    this.phaseEndsAt = Date.now() + BET_MS;
    this.roundNo = 0;
    this.intents = new Map();     // userId -> {userId, username, bets: [{side, amount}]}
    this.coup = null;             // {playerCards, bankerCards, ...} revealed progressively
    this.revealed = 0;            // how many cards shown
    this.history = [];
    this.lastWinners = [];
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

  drawCard() {
    if (this.shoe.length < 10) {
      const deck = [];
      for (const r of 'A23456789TJQK') for (const s of 'shdc') deck.push(r + s);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      this.shoe = deck;
    }
    return this.shoe.pop();
  }

  emitState() { this.broadcast('houseState', this.publicState()); }

  publicState() {
    const revealCount = this.phase === 'betting' ? 0 : this.revealed;
    const cards = { player: [], banker: [] };
    if (this.coup) {
      // Reveal the initial four cards as P, P, B, B, then each third card.
      const dealOrder = [
        ['player', 0], ['player', 1], ['banker', 0], ['banker', 1],
        ['player', 2], ['banker', 2],
      ];
      dealOrder.slice(0, revealCount).forEach(([side, index]) => {
        const card = this.coup[`${side}Cards`][index];
        if (card) cards[side].push(card);
      });
    }
    return {
      game: 'baccarat',
      tableId: this.id,
      name: this.name,
      currency: this.currency,
      minBet: this.minBet,
      maxBet: this.maxBet,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      serverTime: Date.now(),
      roundNo: this.roundNo,
      cards,
      revealCount,
      playerTotal: this.coup && cards.player.length === this.coup.playerCards.length ? this.coup.playerTotal : null,
      bankerTotal: this.coup && cards.banker.length === this.coup.bankerCards.length ? this.coup.bankerTotal : null,
      outcome: this.phase === 'result' ? this.coup?.outcome : null,
      bets: this.publicBets(),
      myBets: null, // filled per-player below via myBetsByUser in stateFor
      history: this.history.slice(-14),
      lastWinners: this.lastWinners,
    };
  }

  publicBets() {
    const agg = { player: 0, banker: 0, tie: 0 };
    for (const [, p] of this.intents) {
      for (const b of p.bets) agg[b.side] += b.amount;
    }
    return agg;
  }

  openBetting() {
    this.roundNo++;
    this.phase = 'betting';
    this.phaseEndsAt = Date.now() + BET_MS;
    this.intents = new Map();
    this.coup = null;
    this.revealed = 0;
    this.lastWinners = [];
    this.emitState();
    this.schedule(() => this.closeBetting(), BET_MS);
  }

  placeBet(userId, username, side, amount) {
    if (this.phase !== 'betting') return { error: 'Betting is closed — wait for the next coup' };
    if (!SIDES[side]) return { error: 'Bet on player, banker or tie' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < this.minBet) return { error: `Minimum bet ${this.minBet.toLocaleString()}` };
    let p = this.intents.get(userId);
    if (!p) { p = { userId, username, bets: [] }; this.intents.set(userId, p); }
    const staked = p.bets.reduce((s, b) => s + b.amount, 0);
    if (staked + amount > this.maxBet) return { error: `Table max ${this.maxBet.toLocaleString()} per coup` };
    const existing = p.bets.find(b => b.side === side);
    if (existing) existing.amount += amount;
    else p.bets.push({ side, amount });
    this.emitState();
    return { ok: true, staked: staked + amount };
  }

  clearBets(userId) {
    if (this.phase !== 'betting') return { error: 'Too late to clear bets' };
    this.intents.delete(userId);
    this.emitState();
    return { ok: true };
  }

  async closeBetting() {
    if (this.destroyed) return;
    const committed = await this.manager.commitBaccaratBets(this, this.intents);
    this.intents = new Map();
    if (committed.length === 0) {
      this.phaseEndsAt = Date.now() + 800;
      this.emitState();
      this.schedule(() => this.openBetting(), 800);
      return;
    }
    this.roundBets = committed;
    this.phase = 'dealing';
    this.phaseEndsAt = 0;
    this.coup = playBaccaratCoup(() => this.drawCard());
    this.revealed = 0;
    this.emitState();

    // Paced reveals: P P B B [P3] [B3]
    const steps = [2, 4, this.coup.playerCards.length > 2 ? 5 : -1, this.coup.bankerCards.length > 2 ? 6 : -1].filter(s => s > 0);
    steps.forEach((count, i) => {
      this.schedule(() => {
        if (this.destroyed) return;
        this.revealed = count;
        this.emitState();
        if (i === steps.length - 1) this.schedule(() => this.showResult(), 900);
      }, 600 + i * DEAL_PACE_MS);
    });
  }

  showResult() {
    if (this.destroyed) return;
    this.phase = 'result';
    this.phaseEndsAt = Date.now() + RESULT_MS;
    this.revealed = 6;
    const { outcome } = this.coup;
    this.history.push(outcome);

    const payouts = [];
    const winners = [];
    for (const p of this.roundBets || []) {
      let returned = 0, staked = 0;
      for (const b of p.bets) {
        staked += b.amount;
        if (outcome === 'tie') {
          // player/banker push; tie pays 9x total
          if (b.side === 'tie') returned += b.amount * SIDES.tie;
          else returned += b.amount;
        } else if (b.side === outcome) {
          returned += b.amount * SIDES[b.side];
        }
      }
      if (returned > 0) payouts.push({ userId: p.userId, amount: returned });
      winners.push({ username: p.username, staked, returned, net: returned - staked });
    }
    this.lastWinners = winners.filter(w => w.net > 0).sort((a, b) => b.net - a.net).slice(0, 5);
    this.emitState();
    this.manager.settleBaccarat(this, outcome, payouts).catch(e => console.error('[baccarat] settle error:', e.message));
    this.schedule(() => this.openBetting(), RESULT_MS);
  }
}

module.exports = { BaccaratTable, SIDES };
