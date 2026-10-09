// Crash — multiplayer crash-betting game (the Stake/Bustabit classic).
// Rounds: betting (10s) → running (multiplier grows, cash out before it busts)
// → crashed (4s) → repeat.
//
// Provably fair per round: serverSeed is committed (hash broadcast) BEFORE the
// round, revealed at crash. crashPoint = max(1, floor(97/(1-r))/100) where r is
// the first unbiased float from HMAC(serverSeed, 'crash':round) → P(crash ≥ m)
// = 0.97/m → 3% house edge, 1-in-33 rounds bust instantly at 1.00x.
//
// Money: bets debited at round start (ledger 'open'); cashouts credited
// immediately at the live multiplier; crash settles the round (uncashed bets
// keep their debit). Crash safety identical to the other house games.

const BET_MS = 10000;
const CRASHED_MS = 4500;
const TICK_MS = 150;
const GROWTH = 0.00011;              // m(t) = e^(GROWTH·ms): ~3x at 10s, ~9x at 20s
const MAX_MULT = 5000;

const { floatStream } = require('./fair');
const nodeCrypto = require('crypto');

function growthAt(elapsedMs) {
  return Math.exp(GROWTH * elapsedMs);
}

class CrashTable {
  constructor(opts) {
    this.game = 'crash';
    this.id = opts.id;
    this.io = opts.io;
    this.name = opts.name;
    this.currency = opts.currency;
    this.minBet = opts.minBet;
    this.maxBet = opts.maxBet;
    this.manager = opts.manager;

    this.phase = 'betting';           // betting | running | crashed
    this.phaseEndsAt = Date.now() + BET_MS;
    this.roundNo = 0;
    this.intents = new Map();         // userId -> {userId, username, amount, autoCashout, cashedAt, cashedMult}
    this.mult = 1;
    this.crashPoint = null;
    this.serverSeed = null;
    this.serverSeedHash = null;
    this.t0 = 0;
    this.history = [];
    this.tickTimer = null;
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
    if (this.tickTimer) clearInterval(this.tickTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  broadcast(event, payload) { if (!this.destroyed) this.io.to(`h:${this.id}`).emit(event, payload); }

  emitState() {
    if (this.destroyed) return;
    this.broadcast('houseState', this.publicState());
  }

  publicState() {
    return {
      game: 'crash',
      tableId: this.id,
      name: this.name,
      currency: this.currency,
      minBet: this.minBet,
      maxBet: this.maxBet,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      serverTime: Date.now(),
      roundNo: this.roundNo,
      mult: this.mult,
      crashPoint: this.phase === 'crashed' ? this.crashPoint : null,
      serverSeed: this.phase === 'crashed' ? this.serverSeed : null,
      serverSeedHash: this.serverSeedHash,
      players: [...this.intents.values()].map(p => ({
        username: p.username, amount: p.amount,
        cashedAt: p.cashedAt || null, autoCashout: p.autoCashout || null,
      })),
      history: this.history.slice(-16),
    };
  }

  openBetting() {
    this.roundNo++;
    this.phase = 'betting';
    this.phaseEndsAt = Date.now() + BET_MS;
    this.mult = 1;
    this.intents = new Map();
    // Commit the round's fair seed before anything else happens
    this.serverSeed = nodeCrypto.randomBytes(32).toString('hex');
    this.serverSeedHash = nodeCrypto.createHash('sha256').update(this.serverSeed).digest('hex');
    const nextFloat = floatStream(this.serverSeed, 'crash', this.roundNo);
    const r = nextFloat();
    this.crashPoint = Math.min(MAX_MULT, Math.max(1, Math.floor((0.97 / (1 - r)) * 100) / 100));
    this.emitState();
    this.schedule(() => this.launch(), BET_MS);
  }

  placeBet(userId, username, amount, autoCashout) {
    if (this.phase !== 'betting') return { error: 'Round in progress — bet next round' };
    amount = Math.floor(Number(amount) || 0);
    if (amount < this.minBet) return { error: `Minimum bet ${this.minBet.toLocaleString()}` };
    if (amount > this.maxBet) return { error: `Maximum bet ${this.maxBet.toLocaleString()}` };
    const requestedAuto = autoCashout == null || autoCashout === '' ? null : Number(autoCashout);
    if (requestedAuto != null && (!Number.isFinite(requestedAuto) || requestedAuto < 1.01 || requestedAuto > MAX_MULT)) {
      return { error: `Auto cashout must be between 1.01× and ${MAX_MULT.toLocaleString()}×` };
    }
    const existing = this.intents.get(userId);
    if (existing) {
      if (existing.amount + amount > this.maxBet) return { error: `Maximum bet ${this.maxBet.toLocaleString()} per round` };
      existing.amount += amount;
      if (requestedAuto != null) existing.autoCashout = requestedAuto;
    }
    else this.intents.set(userId, {
      userId, username, amount,
      autoCashout: requestedAuto,
      cashedAt: null, cashedMult: 0,
    });
    this.emitState();
    return { ok: true };
  }

  async launch() {
    if (this.destroyed) return;
    try {
      const committed = await this.manager.commitCrashBets(this, this.intents);
      if (committed.length === 0) {
        this.emitState();
        this.schedule(() => this.openBetting(), 600);
        return;
      }
      // keep only committed players
      this.intents = new Map(committed.map(p => [p.userId, { ...p, cashedAt: null, cashedMult: 0 }]));
      this.phase = 'running';
      this.t0 = Date.now();
      this.mult = 1;
      this.ledgerId = this.crashLedgerId;
      this.tickTimer = setInterval(() => this.tick(), TICK_MS);
      this.emitState();
    } catch (err) {
      // Never let one failed round kill the table's schedule chain
      console.error('[crash] launch error:', err.message);
      this.phase = 'betting';
      this.phaseEndsAt = Date.now() + BET_MS;
      this.intents = new Map();
      this.emitState();
      this.schedule(() => this.openBetting(), 1500);
    }
  }

  tick() {
    if (this.destroyed || this.phase !== 'running') return;
    const elapsed = Date.now() - this.t0;
    const live = growthAt(elapsed);
    if (live >= this.crashPoint) {
      this.mult = this.crashPoint;
      // Let a cashout received before the crash finish its ledger transaction.
      if ([...this.intents.values()].some(p => p.pendingCashout)) return;
      this.bust();
      return;
    }
    this.mult = live;
    // auto-cashouts
    for (const p of this.intents.values()) {
      if (!p.cashedAt && p.autoCashout && live >= p.autoCashout && p.autoCashout <= this.crashPoint) {
        this.doCashout(p, p.autoCashout).catch(e => console.error('[crash] auto cashout error:', e.message));
      }
    }
    // throttled broadcast
    this.emitState();
  }

  async doCashout(p, atMult) {
    if (p.cashedAt || p.pendingCashout) return false;
    const requestedAt = Date.now();
    p.pendingCashout = true;
    const payout = Math.floor(p.amount * atMult);
    let credited = false;
    try { credited = await this.manager.creditCrashCashout(this, p, payout, atMult); }
    catch (err) { console.error('[crash] cashout error:', err.message); }
    p.pendingCashout = false;
    if (!credited) {
      this.emitState();
      if (this.phase === 'running' && growthAt(Date.now() - this.t0) >= this.crashPoint) this.bust();
      return false;
    }
    p.cashedAt = requestedAt;
    p.cashedMult = atMult;
    this.broadcast('crashCashed', { username: p.username, mult: atMult, payout });
    if (atMult >= 5 || payout >= (this.currency === 'btc' ? 5 : 500)) {
      this.io.emit('casinoWin', { username: p.username, game: 'Crash', payout, multiplier: atMult, currency: this.currency, at: Date.now() });
    }
    this.emitState();
    if (this.phase === 'running' && growthAt(Date.now() - this.t0) >= this.crashPoint) this.bust();
    return { payout, mult: atMult };
  }

  // Manual cashout from socket
  async cashout(userId) {
    if (this.destroyed || this.phase !== 'running') return { error: 'Round is not running' };
    const p = this.intents.get(userId);
    if (!p) return { error: 'No bet this round' };
    if (p.cashedAt) return { error: 'Already cashed out' };
    if (p.pendingCashout) return { error: 'Cashout is processing' };
    const live = growthAt(Date.now() - this.t0);
    if (live >= this.crashPoint) return { error: 'Too late — busted' };
    const atMult = Math.floor(live * 100) / 100;
    const result = await this.doCashout(p, atMult);
    if (!result) return { error: 'Cashout could not be confirmed' };
    return { ok: true, mult: result.mult, payout: result.payout };
  }

  bust() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.phase = 'crashed';
    this.mult = this.crashPoint;
    this.phaseEndsAt = Date.now() + CRASHED_MS;
    this.history.push(this.crashPoint);
    const results = {
      crashPoint: this.crashPoint, serverSeed: this.serverSeed, serverSeedHash: this.serverSeedHash,
      cashouts: [...this.intents.values()].filter(p => p.cashedAt).map(p => ({
        userId: p.userId, username: p.username, mult: p.cashedMult, payout: Math.floor(p.amount * p.cashedMult),
      })),
    };
    this.emitState();
    this.manager.settleCrash(this, results).catch(e => console.error('[crash] settle error:', e.message));
    this.broadcast('crashBusted', { crashPoint: this.crashPoint, roundNo: this.roundNo });
    this.schedule(() => this.openBetting(), CRASHED_MS);
  }
}

module.exports = { CrashTable, growthAt };
