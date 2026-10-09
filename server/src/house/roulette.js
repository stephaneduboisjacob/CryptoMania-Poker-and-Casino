// Casino Roulette engine — European (single zero, 2.7% house edge) or
// American (double zero, 5.26% house edge) wheels, casino-hosted.
//
// Round flow: betting (25s) → spinning (4.5s) → result (6s) → betting…
//
// Money contract mirrors blackjack: bets are INTENTS during the betting
// window; the manager debits them transactionally at close and persists the
// ledger (house_rounds 'open') before the spin. Crash → boot-time refund.

const BET_MS = 25000;
const SPIN_MS = 4500;
const RESULT_MS = 6000;

// Pocket layout around the wheel (for animation order)
const EUROPEAN_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const AMERICAN_WHEEL = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const BET_DEFS = {
  straight:  { payout: 35, label: 'Straight' },
  red:       { payout: 1,  label: 'Red' },
  black:     { payout: 1,  label: 'Black' },
  even:      { payout: 1,  label: 'Even' },
  odd:       { payout: 1,  label: 'Odd' },
  low:       { payout: 1,  label: '1-18' },
  high:      { payout: 1,  label: '19-36' },
  dozen1:    { payout: 2,  label: '1st 12' },
  dozen2:    { payout: 2,  label: '2nd 12' },
  dozen3:    { payout: 2,  label: '3rd 12' },
  col1:      { payout: 2,  label: 'Column 1' },
  col2:      { payout: 2,  label: 'Column 2' },
  col3:      { payout: 2,  label: 'Column 3' },
};

function pocketColor(p) {
  if (p === 0 || p === '00') return 'green';
  return RED_NUMBERS.has(p) ? 'red' : 'black';
}

function betWins(type, num, pocket) {
  // Zero pockets only lose outside bets. A straight bet on 0 or 00 must win.
  if ((pocket === 0 || pocket === '00') && type !== 'straight') return false;
  switch (type) {
    case 'straight': return pocket === num;
    case 'red': return pocketColor(pocket) === 'red';
    case 'black': return pocketColor(pocket) === 'black';
    case 'even': return typeof pocket === 'number' && pocket % 2 === 0;
    case 'odd': return typeof pocket === 'number' && pocket % 2 === 1;
    case 'low': return typeof pocket === 'number' && pocket >= 1 && pocket <= 18;
    case 'high': return typeof pocket === 'number' && pocket >= 19 && pocket <= 36;
    case 'dozen1': return pocket >= 1 && pocket <= 12;
    case 'dozen2': return pocket >= 13 && pocket <= 24;
    case 'dozen3': return pocket >= 25 && pocket <= 36;
    case 'col1': return typeof pocket === 'number' && pocket % 3 === 1;
    case 'col2': return typeof pocket === 'number' && pocket % 3 === 2;
    case 'col3': return typeof pocket === 'number' && pocket % 3 === 0;
    default: return false;
  }
}

class RouletteTable {
  constructor(opts) {
    this.game = 'roulette';
    this.id = opts.id;
    this.io = opts.io;
    this.name = opts.name;
    this.currency = opts.currency;
    this.minBet = opts.minBet;
    this.maxBet = opts.maxBet;
    this.wheelType = opts.wheelType || 'european';  // 'european' | 'american'
    this.manager = opts.manager;

    this.wheel = this.wheelType === 'american' ? AMERICAN_WHEEL : EUROPEAN_WHEEL;
    this.phase = 'betting';               // betting|spinning|result
    this.phaseEndsAt = Date.now() + BET_MS;
    this.roundNo = 0;
    this.intents = new Map();             // userId -> {userId, username, bets:[{type,num,amount}]}
    this.spinAngle = 0;
    this.result = null;                   // last winning pocket
    this.history = [];                    // last 18 pockets
    this.lastWinners = [];                // summary of last round payouts
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
    return {
      game: 'roulette',
      tableId: this.id,
      name: this.name,
      currency: this.currency,
      minBet: this.minBet,
      maxBet: this.maxBet,
      wheelType: this.wheelType,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      serverTime: Date.now(),
      roundNo: this.roundNo,
      result: this.phase === 'result' || this.phase === 'betting' ? this.result : null,
      spinAngle: this.spinAngle,
      bets: this.publicBets(),
      history: this.history.slice(-18),
      lastWinners: this.lastWinners,
      myBets: null, // filled per-player by HouseManager.stateFor
    };
  }

  publicBets() {
    // Aggregate placed bets (no usernames — rival tables keep privacy light)
    const agg = {};
    for (const [, p] of this.intents) {
      for (const b of p.bets) {
        const key = `${b.type}:${b.num ?? ''}`;
        agg[key] = (agg[key] || 0) + b.amount;
      }
    }
    return agg;
  }

  openBetting() {
    this.roundNo++;
    this.phase = 'betting';
    this.phaseEndsAt = Date.now() + BET_MS;
    this.intents = new Map();
    this.lastWinners = [];
    this.emitState();
    this.schedule(() => this.closeBetting(), BET_MS);
  }

  // Place (or add to) a bet. Validates limits; funds debited at close.
  placeBet(userId, username, bet) {
    if (this.phase !== 'betting') return { error: 'Betting is closed — wait for the next round' };
    const type = bet?.type, amount = Math.floor(Number(bet?.amount) || 0);
    let num = bet?.num;
    if (!BET_DEFS[type]) return { error: 'Unknown bet type' };
    if (type === 'straight') {
      if (num === '00') { if (this.wheelType !== 'american') return { error: 'No 00 on this wheel' }; }
      else {
        num = parseInt(num, 10);
        if (!(Number.isInteger(num) && num >= 0 && num <= 36)) return { error: 'Invalid number' };
      }
    } else num = null;
    if (amount < this.minBet) return { error: `Minimum bet ${this.minBet.toLocaleString()}` };

    let p = this.intents.get(userId);
    if (!p) { p = { userId, username, bets: [] }; this.intents.set(userId, p); }
    const staked = p.bets.reduce((s, b) => s + b.amount, 0);
    if (staked + amount > this.maxBet) return { error: `Table max ${this.maxBet.toLocaleString()} per round` };
    // merge identical bets
    const existing = p.bets.find(b => b.type === type && b.num === num);
    if (existing) existing.amount += amount;
    else p.bets.push({ type, num, amount });
    this.emitState();
    return { ok: true, staked: staked + amount };
  }

  clearBets(userId) {
    if (this.phase !== 'betting') return { error: 'Too late' };
    this.intents.delete(userId);
    this.emitState();
    return { ok: true };
  }

  async closeBetting() {
    if (this.destroyed) return;
    const committed = await this.manager.commitRouletteBets(this, this.intents);
    this.intents = new Map();
    if (committed.length === 0) {
      // Empty round: quick cycle
      this.phaseEndsAt = Date.now() + 800;
      this.emitState();
      this.schedule(() => this.openBetting(), 800);
      return;
    }
    this.roundBets = committed;
    this.phase = 'spinning';
    this.phaseEndsAt = Date.now() + SPIN_MS;
    const idx = Math.floor(Math.random() * this.wheel.length);
    this.result = this.wheel[idx];
    // animate to the winning pocket
    this.spinAngle = 360 * 4 + (idx * (360 / this.wheel.length));
    this.emitState();
    this.schedule(() => this.showResult(), SPIN_MS);
  }

  showResult() {
    if (this.destroyed) return;
    this.phase = 'result';
    this.phaseEndsAt = Date.now() + RESULT_MS;
    this.history.push(this.result);

    // Payouts
    const payouts = []; // {userId, amount} total returned (stake+winnings)
    const winnerList = [];
    for (const p of this.roundBets || []) {
      let returned = 0;
      for (const b of p.bets) {
        if (betWins(b.type, b.num, this.result)) {
          returned += b.amount * (BET_DEFS[b.type].payout + 1);
        }
      }
      const staked = p.bets.reduce((s, b) => s + b.amount, 0);
      if (returned > 0) payouts.push({ userId: p.userId, amount: returned });
      winnerList.push({ username: p.username, staked, returned, net: returned - staked });
    }
    this.lastWinners = winnerList.filter(w => w.net > 0).sort((a, b) => b.net - a.net).slice(0, 5);
    this.emitState();
    this.manager.settleRoulette(this, this.result, payouts).catch(e => console.error('[roulette] settle error:', e.message));
    this.schedule(() => this.openBetting(), RESULT_MS);
  }
}

module.exports = { RouletteTable, pocketColor, BET_DEFS, betWins, EUROPEAN_WHEEL, AMERICAN_WHEEL };
