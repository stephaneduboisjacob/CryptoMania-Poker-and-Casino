// HouseManager — owns blackjack + roulette tables and ALL money movement.
//
// Money safety (the "casino can't go bankrupt" guarantees):
//  1. Bets are debited from player balances BEFORE any card/spin outcome
//     exists, in a per-player DB transaction.
//  2. Every committed round is persisted (house_rounds, status 'open')
//     before the outcome is determined. If the server crashes mid-round,
//     boot recovery refunds every open round exactly (BTC amounts stored
//     at debit rate) — players never lose money to a crash, the house
//     never owes an untracked debt.
//  3. Payout odds (3:2 blackjack, 35:1 roulette straight) are structurally
//     below fair odds: long-run EV is positive for the house on every bet
//     type. Max bet caps worst-case single-round exposure.
//  4. Play tables move play chips (infinite house float). BTC tables pay
//     from the store's BTC — table limits bound the drawdown.

const { randomUUID } = require('crypto');
const pool = require('../db');
const { BlackjackTable } = require('./blackjack');
const { RouletteTable } = require('./roulette');
const { BaccaratTable, SIDES } = require('./baccarat');
const { CrashTable } = require('./crash');
const { getBtcUsd } = require('../routes/prices');

const usdPrice = async () => {
  try { return await getBtcUsd(); } catch { return null; }
};

function refundableBets(round) {
  const paidCrashPlayers = new Set(
    round.game === 'crash'
      ? (round.results?.cashouts || []).map(c => String(c.userId))
      : []
  );
  return (round.bets || []).filter(b => !paidCrashPlayers.has(String(b.userId)));
}

// Table floor configuration
const TABLES = [
  // ── Blackjack ──
  { id: 'bj-play-1', game: 'blackjack', name: 'Satellite Blackjack', currency: 'play', minBet: 100, maxBet: 10000, bots: true },
  { id: 'bj-play-2', game: 'blackjack', name: 'High Roller Blackjack', currency: 'play', minBet: 1000, maxBet: 100000, bots: true },
  { id: 'bj-btc-1', game: 'blackjack', name: 'BTC Blackjack', currency: 'btc', minBet: 100, maxBet: 50000, bots: false },   // $1 – $500
  // ── Roulette ──
  { id: 'rl-play-1', game: 'roulette', name: 'Satellite Roulette', currency: 'play', minBet: 10, maxBet: 25000, wheelType: 'american', bots: false },
  { id: 'rl-btc-1', game: 'roulette', name: 'BTC European Roulette', currency: 'btc', minBet: 100, maxBet: 100000, wheelType: 'european', bots: false }, // $1 – $1000
  { id: 'bc-play-1', game: 'baccarat', name: 'Satellite Baccarat', currency: 'play', minBet: 25, maxBet: 50000, bots: false },
  { id: 'bc-btc-1', game: 'baccarat', name: 'BTC Baccarat', currency: 'btc', minBet: 100, maxBet: 100000, bots: false }, // $1 – $1000
  { id: 'crash-play-1', game: 'crash', name: 'Crash', currency: 'play', minBet: 10, maxBet: 50000, bots: false },
  { id: 'crash-btc-1', game: 'crash', name: 'BTC Crash', currency: 'btc', minBet: 10, maxBet: 50000, bots: false }, // $0.10 – $500
];

class HouseManager {
  constructor(io) {
    this.io = io;
    this.tables = new Map();       // tableId -> instance
    this.botCache = [];
    this.recovered = false;
  }

  async init() {
    try {
      await this.ensureBots(40);
      await this.refundOpenRounds();
      for (const cfg of TABLES) {
        if (cfg.game === 'blackjack') {
          this.tables.set(cfg.id, new BlackjackTable({
            id: cfg.id, io: this.io, name: cfg.name, currency: cfg.currency,
            minBet: cfg.minBet, maxBet: cfg.maxBet, manager: this,
          }));
        } else if (cfg.game === 'roulette') {
          this.tables.set(cfg.id, new RouletteTable({
            id: cfg.id, io: this.io, name: cfg.name, currency: cfg.currency,
            minBet: cfg.minBet, maxBet: cfg.maxBet, wheelType: cfg.wheelType, manager: this,
          }));
        } else if (cfg.game === 'baccarat') {
          this.tables.set(cfg.id, new BaccaratTable({
            id: cfg.id, io: this.io, name: cfg.name, currency: cfg.currency,
            minBet: cfg.minBet, maxBet: cfg.maxBet, manager: this,
          }));
        } else if (cfg.game === 'crash') {
          this.tables.set(cfg.id, new CrashTable({
            id: cfg.id, io: this.io, name: cfg.name, currency: cfg.currency,
            minBet: cfg.minBet, maxBet: cfg.maxBet, manager: this,
          }));
        }
      }
      this.recovered = true;
      console.log(`[house] initialized: ${this.tables.size} tables`);
    } catch (err) {
      console.error('[house] init error:', err.message);
    }
  }

  async ensureBots(n) {
    // Bots are house money on play tables: keep a healthy float. They lose
    // slowly to the house edge, so top up whenever one runs low.
    await pool.query(
      `UPDATE users SET balance_play = 1000000 WHERE username LIKE '\\_bot\\_%' ESCAPE '\\' AND balance_play < 1000`
    );
    const res = await pool.query(
      `SELECT id, username FROM users WHERE username LIKE '\\_bot\\_%' ESCAPE '\\' ORDER BY id LIMIT $1`, [n]
    );
    this.botCache = res.rows;
  }

  // ─── Crash recovery: refund every unresolved round exactly ───

  async refundOpenRounds() {
    const open = await pool.query(`SELECT * FROM house_rounds WHERE status='open'`);
    for (const round of open.rows) {
      const bets = refundableBets(round);
      const originalBetCount = (round.bets || []).length;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const b of bets) {
          if (b.btc) {
            await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [b.btc, b.userId]);
          } else if (b.amount) {
            await client.query('UPDATE users SET balance_play=balance_play+$1 WHERE id=$2', [b.amount, b.userId]);
          }
        }
        await client.query(`UPDATE house_rounds SET status='refunded', settled_at=NOW() WHERE id=$1`, [round.id]);
        await client.query('COMMIT');
        console.log(`[house] crash-refunded round ${round.id} (${round.game}): ${bets.length}/${originalBetCount} unpaid bets`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[house] refund error:', err.message);
      } finally {
        client.release();
      }
    }
  }

  // ─── Balance helpers ───

  async debit(client, userId, currency, chips, price) {
    if (currency === 'play') {
      const r = await client.query(
        `UPDATE users SET balance_play=balance_play-$1 WHERE id=$2 AND balance_play >= $1 RETURNING balance_play`,
        [chips, userId]
      );
      return r.rows.length ? { play: chips } : null;
    }
    const btc = chips / 100 / price;
    const r = await client.query(
      `UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2 AND balance_btc >= $1 RETURNING balance_btc`,
      [btc, userId]
    );
    return r.rows.length ? { btc } : null;
  }

  async credit(client, userId, currency, chips, price) {
    if (currency === 'play') {
      await client.query('UPDATE users SET balance_play=balance_play+$1 WHERE id=$2', [chips, userId]);
      return;
    }
    const btc = chips / 100 / price;
    await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [btc, userId]);
  }

  async recordTx(client, userId, type, currency, amountChips, meta, price) {
    const amount = currency === 'play' ? amountChips : amountChips / 100 / price;
    await client.query(
      `INSERT INTO transactions(user_id, type, amount, currency, status, metadata) VALUES($1,$2,$3,$4,'confirmed',$5)`,
      [userId, type, amount, currency === 'play' ? 'PLAY' : 'BTC', JSON.stringify(meta)]
    );
  }

  // ─── Blackjack money hooks ───

  // Debit all betting-phase intents; returns committed entries for the round.
  async commitBlackjackBets(table, intents) {
    const price = table.currency === 'btc' ? await usdPrice() : null;
    if (table.currency === 'btc' && !price) return [];
    const committed = [];
    const ledgerId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [, intent] of intents) {
        const moved = await this.debit(client, intent.userId, table.currency, intent.amount, price);
        if (!moved) {
          console.log(`[house] bj bet bounced: user=${intent.userId} amount=${intent.amount} (insufficient balance)`);
          continue;
        }
        await this.recordTx(client, intent.userId, 'entry_fee', table.currency, intent.amount,
          { house: 'blackjack', table: table.id, round: ledgerId }, price);
        committed.push({ ...intent, isBot: intent.isBot || false, btc: moved.btc || null, ledgerId });
      }
      if (committed.length > 0) {
        await client.query(
          `INSERT INTO house_rounds(id, game, table_id, currency, bets, status) VALUES($1,'blackjack',$2,$3,$4,'open')`,
          [ledgerId, table.id, table.currency, JSON.stringify(committed.map(c => ({
            userId: c.userId, username: c.username, seat: c.seat, amount: c.amount, btc: c.btc,
          })))]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] bj commit error:', err.message);
      return [];
    } finally {
      client.release();
    }
    if (committed.length > 0) table.roundLedgerId = ledgerId;
    return committed;
  }

  // Double / split: debit the extra bet now and append to the ledger.
  async doubleBet(table, player, hand) {
    return this.appendBet(table, player, hand.bet, { kind: 'double' });
  }

  async splitBet(table, player, hand) {
    return this.appendBet(table, player, hand.bet, { kind: 'split' });
  }

  async appendBet(table, player, amount, meta) {
    const price = table.currency === 'btc' ? await usdPrice() : null;
    if (table.currency === 'btc' && !price) return { error: 'Price unavailable' };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const moved = await this.debit(client, player.userId, table.currency, amount, price);
      if (!moved) { await client.query('ROLLBACK'); return { error: 'Insufficient balance' }; }
      await this.recordTx(client, player.userId, 'entry_fee', table.currency, amount,
        { house: 'blackjack', table: table.id, round: table.roundLedgerId, ...meta }, price);
      const btcDelta = moved.btc || null;
      await client.query(
        `UPDATE house_rounds SET bets = bets || $2 WHERE id=$1`,
        [table.roundLedgerId, JSON.stringify([{ userId: player.userId, username: player.username, seat: player.seat, amount, btc: btcDelta }])]
      );
      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] appendBet error:', err.message);
      return { error: 'Server error' };
    } finally {
      client.release();
    }
  }

  async settleBlackjack(table, players, payouts) {
    const ledgerId = table.roundLedgerId;
    const price = table.currency === 'btc' ? await usdPrice() : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of payouts) {
        await this.credit(client, p.userId, table.currency, p.amount, price);
        await this.recordTx(client, p.userId, 'winnings', table.currency, p.amount,
          { house: 'blackjack', table: table.id, round: ledgerId }, price);
      }
      await client.query(
        `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
        [ledgerId, JSON.stringify(players.map(p => ({
          userId: p.userId, username: p.username, result: p.result, net: p.net,
          hands: p.hands.map(h => ({ cards: h.cards, bet: h.bet })),
        })))]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] bj settle error:', err.message);
    } finally {
      client.release();
    }
    table.roundLedgerId = null;
    // notify players of balance change
    for (const userId of new Set(payouts.map(p => p.userId))) {
      this.io.to(`h:${table.id}`).emit('balanceChanged', { userId });
    }
  }

  // ─── Roulette money hooks ───

  async commitRouletteBets(table, intents) {
    const price = table.currency === 'btc' ? await usdPrice() : null;
    if (table.currency === 'btc' && !price) return [];
    const committed = [];
    const ledgerId = randomUUID();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [, p] of intents) {
        const total = p.bets.reduce((s, b) => s + b.amount, 0);
        if (total <= 0) continue;
        const moved = await this.debit(client, p.userId, table.currency, total, price);
        if (!moved) continue;
        await this.recordTx(client, p.userId, 'entry_fee', table.currency, total,
          { house: 'roulette', table: table.id, round: ledgerId, bets: p.bets.length }, price);
        committed.push({ ...p, btc: moved.btc || null });
      }
      if (committed.length > 0) {
        await client.query(
          `INSERT INTO house_rounds(id, game, table_id, currency, bets, status) VALUES($1,'roulette',$2,$3,$4,'open')`,
          [ledgerId, table.id, table.currency, JSON.stringify(committed.flatMap(c => c.bets.map(b => ({
            userId: c.userId, username: c.username, type: b.type, num: b.num, amount: b.amount, btc: c.btc || null,
          }))))]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] rl commit error:', err.message);
      return [];
    } finally {
      client.release();
    }
    if (committed.length > 0) table.roundLedgerId = ledgerId;
    return committed;
  }

  async settleRoulette(table, result, payouts) {
    const ledgerId = table.roundLedgerId;
    const price = table.currency === 'btc' ? await usdPrice() : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of payouts) {
        await this.credit(client, p.userId, table.currency, p.amount, price);
        await this.recordTx(client, p.userId, 'winnings', table.currency, p.amount,
          { house: 'roulette', table: table.id, round: ledgerId, result: String(result) }, price);
      }
      await client.query(
        `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
        [ledgerId, JSON.stringify({ result: String(result), payouts })]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] rl settle error:', err.message);
    } finally {
      client.release();
    }
    table.roundLedgerId = null;
    for (const userId of new Set(payouts.map(p => p.userId))) {
      this.io.to(`h:${table.id}`).emit('balanceChanged', { userId });
    }
  }

  // ─── Blackjack bots (play tables only) ───

  onBettingOpen(table) {
    const cfg = TABLES.find(t => t.id === table.id);
    if (!cfg?.bots) return;
    // 1–2 bots take random free seats with min-to-2x bets
    const botCount = 1 + (Math.random() < 0.5 ? 1 : 0);
    const usedBots = new Set([...table.intents.values()].map(i => i.userId));
    for (let i = 0; i < botCount; i++) {
      const bot = this.botCache.find(b => !usedBots.has(b.id));
      if (!bot) break;
      usedBots.add(bot.id);
      const seat = table.freeSeat();
      if (seat === -1) break;
      const amount = table.minBet * (Math.random() < 0.7 ? 1 : 2 + Math.floor(Math.random() * 3));
      table.intents.set(seat, { userId: bot.id, username: bot.username.replace('_bot_', 'Bot '), amount, seat, isBot: true });
    }
  }

  // ─── Shared helpers for instant-game routes ───

  async getPrice() { return usdPrice(); }

  // ─── Baccarat money hooks ───

  async commitBaccaratBets(table, intents) {
    const price = table.currency === 'btc' ? await usdPrice() : null;
    if (table.currency === 'btc' && !price) return [];
    const committed = [];
    const ledgerId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [, p] of intents) {
        const total = p.bets.reduce((s, b) => s + b.amount, 0);
        if (total <= 0) continue;
        const moved = await this.debit(client, p.userId, table.currency, total, price);
        if (!moved) continue;
        await this.recordTx(client, p.userId, 'entry_fee', table.currency, total,
          { house: 'baccarat', table: table.id, round: ledgerId }, price);
        committed.push({ ...p, btc: moved.btc || null });
      }
      if (committed.length > 0) {
        await client.query(
          `INSERT INTO house_rounds(id, game, table_id, currency, bets, status) VALUES($1,'baccarat',$2,$3,$4,'open')`,
          [ledgerId, table.id, table.currency, JSON.stringify(committed.flatMap(c => c.bets.map(b => ({
            userId: c.userId, username: c.username, side: b.side, amount: b.amount, btc: c.btc || null,
          }))))]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] bc commit error:', err.message);
      return [];
    } finally {
      client.release();
    }
    if (committed.length > 0) table.roundLedgerId = ledgerId;
    return committed;
  }

  async settleBaccarat(table, outcome, payouts) {
    const ledgerId = table.roundLedgerId;
    const price = table.currency === 'btc' ? await usdPrice() : null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of payouts) {
        await this.credit(client, p.userId, table.currency, p.amount, price);
        await this.recordTx(client, p.userId, 'winnings', table.currency, p.amount,
          { house: 'baccarat', table: table.id, round: ledgerId, outcome }, price);
      }
      await client.query(
        `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
        [ledgerId, JSON.stringify({ outcome, payouts })]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] bc settle error:', err.message);
    } finally {
      client.release();
    }
    table.roundLedgerId = null;
    for (const userId of new Set(payouts.map(p => p.userId))) {
      this.io.to(`h:${table.id}`).emit('balanceChanged', { userId });
    }
  }

  // ─── Crash money hooks ───

  async commitCrashBets(table, intents) {
    const price = table.currency === 'btc' ? await usdPrice() : null;
    if (table.currency === 'btc' && !price) return [];
    const committed = [];
    const ledgerId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [, p] of intents) {
        const moved = await this.debit(client, p.userId, table.currency, p.amount, price);
        if (!moved) continue;
        await this.recordTx(client, p.userId, 'entry_fee', table.currency, p.amount,
          { house: 'crash', table: table.id, round: ledgerId }, price);
        committed.push({ ...p, btc: moved.btc || null });
      }
      if (committed.length > 0) {
        await client.query(
          `INSERT INTO house_rounds(id, game, table_id, currency, bets, results, status) VALUES($1,'crash',$2,$3,$4,$5,'open')`,
          [ledgerId, table.id, table.currency,
           JSON.stringify(committed.map(c => ({ userId: c.userId, username: c.username, amount: c.amount, btc: c.btc || null }))),
           JSON.stringify({ serverSeedHash: table.serverSeedHash, round: table.roundNo })]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] crash commit error:', err.message);
      return [];
    } finally {
      client.release();
    }
    if (committed.length > 0) table.crashLedgerId = ledgerId;
    return committed;
  }

  async creditCrashCashout(table, player, payout, mult) {
    const price = table.currency === 'btc' ? await usdPrice() : null;
    if (table.currency === 'btc' && !price) return false;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const round = await client.query(
        `SELECT results FROM house_rounds WHERE id=$1 AND game='crash' AND status='open' FOR UPDATE`,
        [table.crashLedgerId]
      );
      if (!round.rows[0]) {
        await client.query('ROLLBACK');
        return false;
      }
      const results = round.rows[0].results || {};
      const cashouts = results.cashouts || [];
      if (cashouts.some(c => String(c.userId) === String(player.userId))) {
        await client.query('ROLLBACK');
        return false;
      }
      await this.credit(client, player.userId, table.currency, payout, price);
      await this.recordTx(client, player.userId, 'winnings', table.currency, payout,
        { house: 'crash', table: table.id, round: table.crashLedgerId, mult }, price);
      await client.query(
        `UPDATE house_rounds SET results=$2 WHERE id=$1`,
        [table.crashLedgerId, JSON.stringify({
          ...results,
          cashouts: [...cashouts, { userId: player.userId, username: player.username, mult, payout }],
        })]
      );
      await client.query('COMMIT');
      this.io.to(`h:${table.id}`).emit('balanceChanged', { userId: player.userId });
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] crash cashout error:', err.message);
      return false;
    } finally {
      client.release();
    }
  }

  async settleCrash(table, results) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
        [table.crashLedgerId, JSON.stringify({ ...results, bets: [...table.intents.values()].map(p => ({
          userId: p.userId, username: p.username, amount: p.amount, cashedMult: p.cashedMult || null,
        })) })]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[house] crash settle error:', err.message);
    } finally {
      client.release();
    }
    table.crashLedgerId = null;
  }

  // ─── Lobby / socket API ───

  tablesList() {
    return TABLES.map(cfg => {
      const t = this.tables.get(cfg.id);
      return {
        id: cfg.id, game: cfg.game, name: cfg.name, currency: cfg.currency,
        minBet: cfg.minBet, maxBet: cfg.maxBet, wheelType: cfg.wheelType || null,
        players: t ? this.playerCount(t) : 0,
      };
    });
  }

  playerCount(t) {
    if (t.game === 'blackjack') {
      return (t.intents?.size || 0) + (t.players?.length || 0);
    }
    return t.intents?.size || 0;
  }

  stateFor(tableId, userId) {
    const t = this.tables.get(tableId);
    if (!t) return null;
    const state = t.publicState();
    state.mySeat = t.mySeat ? t.mySeat(userId) : -1;
    if (t.game === 'baccarat') {
      state.myBets = (t.intents.get(userId)?.bets || []).map(bet => ({ ...bet }));
    } else if (t.game === 'roulette') {
      state.myBets = (t.intents.get(userId)?.bets || []).map(bet => ({ ...bet }));
    }
    return state;
  }

  destroy() {
    for (const t of this.tables.values()) t.destroy?.();
  }
}

module.exports = { HouseManager, TABLES, refundableBets };
