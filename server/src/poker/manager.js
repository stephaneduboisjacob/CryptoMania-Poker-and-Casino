// Casino GameManager: owns every casino table (cash, SNG, MTT), all money
// movements, the MTT scheduler, AI bots, and hand-boundary persistence.
//
// Concurrency model:
//  - Engine hot path is synchronous (see engine.js). This manager performs DB
//    I/O only at boundaries: registration, buy-in/cash-out, hand end, game end.
//  - A single 1-second tick drives: action timeouts (engine handles timebank
//    grant), AI turns (scheduled per turn), blind level ups, SNG countdowns,
//    MTT starts/late-reg expiry, table balancing, and bot filling.
//  - Crash safety: game_players.chips is the durable source of truth for
//    stacks, flushed at every hand end. A crash mid-hand loses only the
//    in-flight hand (stacks revert to last hand boundary — no chip loss).

const { randomUUID } = require('crypto');
const pool = require('../db');
const { Table } = require('./engine');
const botDecide = require('./ai');
const { CASH_STAKES, SNG_PLAY_BUYINS, SNG_BTC_USD, MTT_CALENDAR, levelMinutesFor } = require('./schedules');
const { sngPayouts, mttPayouts, distribute } = require('./payouts');
const { getBtcUsd } = require('../routes/prices');

const SNG_COUNTDOWN_MS = 90 * 1000;
const BOT_FILL_DELAY_MS = 20 * 1000;      // wait before bots fill empty cash seats (play only)
const MTT_REG_GRACE_MS = 60 * 1000;       // registration stays open N s past start if field < min
const BALANCE_INTERVAL_TICKS = 15;        // balance MTT tables every N ticks
const TICK_MS = 1000;

const usdPrice = async () => {
  try { return await getBtcUsd(); } catch { return null; }
};

class GameManager {
  constructor(io) {
    this.io = io;
    this.tables = new Map();      // tableId -> Table
    this.games = new Map();       // gameId -> game record (memory mirror)
    this.seatSockets = new Map(); // tableId -> Map<userId, socketCount>
    this.tickCount = 0;
    this.botCache = [];           // [{userId, username}]
    this.tick = setInterval(() => this.onTick(), TICK_MS);
    this.recovered = false;
  }

  log(...args) { console.log('[casino]', ...args); }

  // ─── Boot: recover running games from DB + start scheduler ──────────────────

  async init() {
    try {
      await this.ensureBots(60);
      await this.recoverRunningGames();
      await this.scheduleUpcomingMtts();
      this.recovered = true;
      this.log(`initialized: ${this.tables.size} tables, ${this.games.size} games`);
    } catch (err) {
      this.log('init error:', err.message);
    }
  }

  async ensureBots(n) {
    if (this.botCache.length >= n) return;
    const res = await pool.query(
      `SELECT id, username FROM users WHERE username LIKE '\\_bot\\_%' ESCAPE '\\' ORDER BY id LIMIT $1`, [n]
    );
    let bots = res.rows;
    for (let i = bots.length; i < n; i++) {
      const ins = await pool.query(
        `INSERT INTO users(username, password_hash, balance_play)
         VALUES($1, 'x', 0) ON CONFLICT(username) DO UPDATE SET balance_play=0 RETURNING id, username`,
        [`_bot_${i + 1}`]
      );
      bots.push(ins.rows[0]);
    }
    this.botCache = bots;
  }

  async recoverRunningGames() {
    const res = await pool.query(`SELECT * FROM games WHERE status IN ('registering','running')`);
    for (const g of res.rows) {
      const players = await pool.query(
        `SELECT gp.*, u.username FROM game_players gp JOIN users u ON u.id=gp.user_id
         WHERE gp.game_id=$1 AND gp.status IN ('registered','seated')`, [g.id]
      );
      const record = {
        id: g.id, gameType: g.game_type, name: g.name, maxSeats: g.max_seats,
        speed: g.speed, currency: g.currency, status: g.status,
        smallBlind: g.small_blind, bigBlind: g.big_blind,
        entryFee: parseFloat(g.entry_fee || 0), entryUsd: g.entry_usd ? parseFloat(g.entry_usd) : null,
        startingStack: g.starting_stack, levelMinutes: g.level_minutes,
        lateRegLevels: g.late_reg_levels, guarantee: parseFloat(g.guarantee || 0),
        prizePool: parseFloat(g.prize_pool || 0), payoutSchedule: g.payout_schedule || [],
        minPlayers: g.min_players, startAt: g.start_at, aiFill: g.ai_fill,
        stakeKey: g.stake_key, buyInMin: g.buy_in_min, buyInMax: g.buy_in_max,
        players: new Map(), // userId -> {userId, username, chips, isBot, tableId, seat, status}
        createdAt: g.created_at,
        recovering: true,
      };
      this.games.set(g.id, record);

      if (g.game_type === 'cash') {
        // One table per cash game row
        const table = this.createTable(record, g.id);
        for (const p of players.rows) {
          record.players.set(p.user_id, { userId: p.user_id, username: p.username, chips: Number(p.chips), isBot: p.username.startsWith('_bot_'), tableId: table.id, seat: null, status: 'seated' });
          if (Number(p.chips) > 0) {
            const seated = table.sitPlayer({ userId: p.user_id, username: p.username, chips: Number(p.chips) });
            if (seated.seat !== undefined) {
              record.players.get(p.user_id).seat = seated.seat;
              table.seats[seated.seat].disconnected = true; // until a socket joins
            }
          }
        }
        table.maybeStartHand();
      } else if (g.status === 'running') {
        // Tournament in progress: seat players across tables round-robin
        const alive = players.rows.filter(p => Number(p.chips) > 0);
        const tableCount = Math.max(1, Math.ceil(alive.length / record.maxSeats));
        for (let i = 0; i < tableCount; i++) this.createTable(record);
        let ti = 0;
        for (const p of alive) {
          const table = this.tablesFor(record)[ti % tableCount]; ti++;
          record.players.set(p.user_id, { userId: p.user_id, username: p.username, chips: Number(p.chips), isBot: p.username.startsWith('_bot_'), tableId: table.id, seat: null, status: 'seated' });
          const seated = table.sitPlayer({ userId: p.user_id, username: p.username, chips: Number(p.chips) });
          if (seated.seat !== undefined) {
            record.players.get(p.user_id).seat = seated.seat;
            table.seats[seated.seat].disconnected = true; // until a socket joins
          }
        }
        this.log(`recovered MTT ${g.name}: ${alive.length} alive on ${tableCount} tables`);
        this.checkTournamentEnd(record);
        for (const table of this.tablesFor(record)) table.maybeStartHand();
      } else if (g.status === 'registering') {
        // Restore the field before the scheduled start or SNG countdown. If
        // this is omitted, a restart makes funded entries invisible to the
        // start logic and they are later refunded as an empty tournament.
        for (const p of players.rows) {
          record.players.set(p.user_id, {
            userId: p.user_id, username: p.username, chips: Number(p.chips) || 0,
            isBot: p.username.startsWith('_bot_'), tableId: null, seat: null,
            status: p.status,
          });
        }
        record._prizeCollected = players.rows.reduce((total, p) => total + Number(p.bought_in || 0), 0);
        if (g.game_type === 'sng' && record.players.size > 0) {
          record.startDeadline = Date.now() + SNG_COUNTDOWN_MS;
        }
      }
      // status 'registering' tournaments just wait for the tick to start them
    }
  }

  async scheduleUpcomingMtts() {
    const now = new Date();
    for (const ev of MTT_CALENDAR) {
      // Create today's remaining events + tomorrow's first events (horizon 26h)
      for (const dayOffset of [0, 1]) {
        for (const hour of ev.hours) {
          const startAt = new Date(now);
          startAt.setUTCDate(now.getUTCDate() + dayOffset);
          startAt.setUTCHours(hour, ev.minute, 0, 0);
          if (startAt.getTime() - now.getTime() < -2 * 60 * 60 * 1000) continue; // >2h in past: skip
          if (startAt.getTime() - now.getTime() > 26 * 60 * 60 * 1000) continue;
          const exists = await pool.query(
            `SELECT 1 FROM games WHERE name=$1 AND start_at=$2 LIMIT 1`, [ev.name, startAt]
          );
          if (exists.rows.length) continue;
          await this.createScheduledMtt(ev, startAt);
        }
      }
    }
  }

  async createScheduledMtt(ev, startAt) {
    const levelMinutes = ev.levelMinutes || levelMinutesFor(ev.speed);
    const ins = await pool.query(
      `INSERT INTO games(game_type, name, max_seats, speed, currency, entry_fee, entry_usd, starting_stack,
       level_minutes, late_reg_levels, guarantee, min_players, start_at, status, ai_fill, created_by, stake_key)
       VALUES('mtt',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'registering',$13,'scheduler',$14) RETURNING *`,
      [ev.name, ev.maxSeats, ev.speed, ev.currency,
       ev.currency === 'play' ? (ev.entryFee || 0) : 0,
       ev.currency === 'btc' ? (ev.entryUsd || 0) : null,
       ev.startingStack, levelMinutes, ev.lateRegLevels || 0,
       ev.currency === 'play' ? (ev.guarantee || 0) : 0, ev.minPlayers || 2, startAt,
       ev.currency === 'play', ev.key]
    );
    const g = ins.rows[0];
    this.games.set(g.id, this.recordFromRow(g));
    this.log(`scheduled MTT "${ev.name}" at ${startAt.toISOString()}`);
    return g.id;
  }

  recordFromRow(g) {
    return {
      id: g.id, gameType: g.game_type, name: g.name, maxSeats: g.max_seats,
      speed: g.speed, currency: g.currency, status: g.status,
      smallBlind: g.small_blind, bigBlind: g.big_blind,
      entryFee: parseFloat(g.entry_fee || 0), entryUsd: g.entry_usd ? parseFloat(g.entry_usd) : null,
      startingStack: g.starting_stack, levelMinutes: g.level_minutes,
      lateRegLevels: g.late_reg_levels, guarantee: parseFloat(g.guarantee || 0),
      prizePool: parseFloat(g.prize_pool || 0), payoutSchedule: g.payout_schedule || [],
      minPlayers: g.min_players, startAt: g.start_at, aiFill: g.ai_fill,
      stakeKey: g.stake_key, buyInMin: g.buy_in_min, buyInMax: g.buy_in_max,
      players: new Map(), createdAt: g.created_at, lateRegClosed: false,
    };
  }

  // ─── Table factory ──────────────────────────────────────────────────────────

  createTable(record, tableId = null) {
    const id = tableId || randomUUID();
    const isCash = record.gameType === 'cash';
    const table = new Table({
      id, gameId: record.id, io: this.io,
      maxSeats: record.maxSeats,
      currency: record.currency,
      gameType: record.gameType,
      speed: record.speed,
      name: record.name,
      smallBlind: isCash ? record.smallBlind : 10,
      bigBlind: isCash ? record.bigBlind : 20,
      levelMinutes: record.levelMinutes || 10,
      level: 1,
      manager: this,
    });
    table.stakeKey = record.stakeKey || null;
    this.tables.set(id, table);
    if (!record.tableIds) record.tableIds = [];
    record.tableIds.push(id);
    return table;
  }

  tablesFor(record) {
    return (record.tableIds || []).map(id => this.tables.get(id)).filter(Boolean);
  }

  isBot(userId) {
    if (typeof userId !== 'number') return false;
    const cached = this.botCache.some(b => b.userId === userId);
    if (cached) return true;
    // Recovery path: bot flag comes from username prefix
    const rec = this.games.get([...this.games.keys()].find(gid => this.games.get(gid).players.get(userId)));
    return false;
  }

  // ─── Public API: lobby snapshot ─────────────────────────────────────────────

  lobbySnapshot() {
    const cash = CASH_STAKES.flatMap(stake => stake.maxSeats.map(maxSeats => {
      const tables = [];
      for (const table of this.tables.values()) {
        if (table.stakeKey !== stake.key || table.maxSeats !== maxSeats) continue;
        tables.push({
          id: table.id, gameId: table.gameId, seats: table.seats.filter(Boolean).length,
          maxSeats: table.maxSeats, waiting: table.seats.filter(s => s && s.waiting).length,
        });
      }
      return {
        key: stake.key, formatKey: `${stake.key}:${maxSeats}`, name: `${stake.name} · ${maxSeats}-max`, currency: stake.currency,
        maxSeats, sb: stake.sb, bb: stake.bb, min: stake.min, max: stake.max,
        aiFill: stake.aiFill, tables,
        players: tables.reduce((s, t) => s + t.seats, 0),
      };
    }));

    const sngs = [];
    const mtts = [];
    for (const g of this.games.values()) {
      if (g.status === 'completed' || g.status === 'cancelled') continue;
      const base = {
        id: g.id, name: g.name, maxSeats: g.maxSeats, speed: g.speed, currency: g.currency,
        registered: g.players.size, minPlayers: g.minPlayers,
        entryFee: g.entryFee, entryUsd: g.entryUsd,
        startingStack: g.startingStack, levelMinutes: g.levelMinutes,
        guarantee: g.guarantee, prizePool: g.prizePool,
        startAt: g.startAt, playersAlive: [...g.players.values()].filter(p => p.chips > 0).length,
      };
      if (g.gameType === 'mtt') {
        mtts.push({ ...base, status: g.status, lateRegLevels: g.lateRegLevels });
      }
    }

    // SNG configs with live counts of open registrations
    const sngOpen = {};
    for (const g of this.games.values()) {
      if (g.gameType !== 'sng' || g.status !== 'registering') continue;
      const buyin = g.currency === 'btc' ? g.entryUsd : g.entryFee;
      const key = `${g.currency}:${buyin}:${g.maxSeats}:${g.speed}`;
      sngOpen[key] = (sngOpen[key] || 0) + 1;
    }
    for (const buyin of SNG_PLAY_BUYINS) {
      for (const seats of [2, 3, 6, 8, 9]) {
        for (const speed of ['regular', 'turbo', 'hyper', 'deepstack']) {
          sngs.push({
            currency: 'play', buyin, seats, speed,
            open: sngOpen[`play:${buyin}:${seats}:${speed}`] || 0,
          });
        }
      }
    }
    for (const usd of SNG_BTC_USD) {
      for (const seats of [2, 3, 6, 8, 9]) {
        for (const speed of ['regular', 'turbo', 'hyper', 'deepstack']) {
          sngs.push({
            currency: 'btc', buyin: usd, seats, speed,
            open: sngOpen[`btc:${usd}:${seats}:${speed}`] || 0,
          });
        }
      }
    }

    return { cash, sngs, mtts: mtts.sort((a, b) => new Date(a.startAt) - new Date(b.startAt)) };
  }

  // ─── Cash games ─────────────────────────────────────────────────────────────

  async cashJoin(userId, username, avatar, stakeKey, requestSeat = null, requestedMaxSeats = 9) {
    const stake = CASH_STAKES.find(s => s.key === stakeKey);
    if (!stake) return { error: 'Unknown stake' };
    const maxSeats = Number(requestedMaxSeats);
    if (!stake.maxSeats.includes(maxSeats)) return { error: 'Unsupported table size' };

    const client = await pool.connect();
    let record, table, seatResult, chips = stake.min, createdRecord = false;
    try {
      await client.query('BEGIN');

      // Lock the player first so two concurrent requests cannot buy two seats.
      const wallet = await client.query(
        'SELECT balance_play, balance_btc FROM users WHERE id=$1 FOR UPDATE', [userId]
      );
      if (!wallet.rows[0]) { await client.query('ROLLBACK'); return { error: 'Player not found' }; }
      const existing = await client.query(
        `SELECT gp.game_id FROM game_players gp JOIN games g ON g.id=gp.game_id
         WHERE gp.user_id=$1 AND g.stake_key=$2 AND gp.status='seated' AND g.status='running' LIMIT 1`,
        [userId, stakeKey]
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        const gameId = existing.rows[0].game_id;
        const current = this.games.get(gameId)?.players.get(userId);
        if (current?.tableId) return { tableId: current.tableId, gameId, already: true };
        return { error: 'You already have a seat at these stakes (reconnecting)' };
      }

      const price = stake.currency === 'btc' ? await usdPrice() : null;
      if (stake.currency === 'btc' && !price) { await client.query('ROLLBACK'); return { error: 'BTC price unavailable' }; }
      const need = stake.currency === 'play' ? chips : chips / 100 / price;
      const balance = Number(stake.currency === 'play' ? wallet.rows[0].balance_play : wallet.rows[0].balance_btc) || 0;
      if (balance < need) {
        await client.query('ROLLBACK');
        return { error: stake.currency === 'play'
          ? `Need at least ${stake.min.toLocaleString()} play chips`
          : `Insufficient balance — need at least $${(stake.min / 100).toFixed(2)}` };
      }

      // Reuse a table with room; otherwise make a fresh table for this exact format.
      record = [...this.games.values()].find(g => {
        if (g.gameType !== 'cash' || g.stakeKey !== stakeKey || g.maxSeats !== maxSeats || g.status !== 'running') return false;
        return this.tablesFor(g).some(t => t.seats.some(s => s === null));
      });
      if (!record) {
        const gins = await client.query(
          `INSERT INTO games(game_type,name,max_seats,speed,currency,small_blind,big_blind,buy_in_min,buy_in_max,status,stake_key,ai_fill,created_by)
           VALUES('cash',$1,$2,'regular',$3,$4,$5,$6,$7,'running',$8,$9,'system') RETURNING *`,
          [`${stake.name} · ${maxSeats}-max`, maxSeats, stake.currency, stake.sb, stake.bb, stake.min, stake.max, stakeKey, stake.aiFill]
        );
        record = this.recordFromRow(gins.rows[0]);
        record.smallBlind = stake.sb; record.bigBlind = stake.bb;
        createdRecord = true;
      } else {
        await client.query('SELECT id FROM games WHERE id=$1 FOR UPDATE', [record.id]);
      }

      const currentTable = record.tableIds?.length ? this.tables.get(record.tableIds[0]) : null;
      const occupiedRows = await client.query(
        `SELECT seat FROM game_players WHERE game_id=$1 AND status='seated' AND seat IS NOT NULL FOR UPDATE`,
        [record.id]
      );
      const occupied = new Set(occupiedRows.rows.map(r => Number(r.seat)));
      currentTable?.seats.forEach((player, i) => { if (player) occupied.add(i); });
      const wantedSeat = requestSeat == null ? null : Number.parseInt(requestSeat, 10);
      const freeSeat = wantedSeat !== null && Number.isInteger(wantedSeat) && wantedSeat >= 0 && wantedSeat < maxSeats && !occupied.has(wantedSeat)
        ? wantedSeat
        : Array.from({ length: maxSeats }, (_, i) => i).find(i => !occupied.has(i));
      if (freeSeat === undefined) {
        await client.query('ROLLBACK');
        return { error: 'No seats available — try again' };
      }

      if (stake.currency === 'play') {
        await client.query('UPDATE users SET balance_play=balance_play-$1 WHERE id=$2', [chips, userId]);
      } else {
        const btc = chips / 100 / price;
        await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [btc, userId]);
        await client.query(
          `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'entry_fee',$2,'confirmed',$3)`,
          [userId, btc, JSON.stringify({ gameId: record.id, stakeKey, usdCents: chips })]
        );
      }
      await client.query(
        `INSERT INTO game_players(game_id,user_id,seat,chips,status,bought_in)
         VALUES($1,$2,$3,$4,'seated',$5)
         ON CONFLICT(game_id,user_id) DO UPDATE SET seat=$3,chips=$4,status='seated',left_at=NULL,bought_in=game_players.bought_in+$5`,
        [record.id, userId, freeSeat, chips, stake.currency === 'play' ? chips : 0]
      );
      await client.query('COMMIT');
      seatResult = freeSeat;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      this.log('cashJoin error:', err.message);
      return { error: 'Server error joining table' };
    } finally {
      client.release();
    }

    if (createdRecord) this.games.set(record.id, record);
    table = this.tablesFor(record)[0] || this.createTable(record);
    const seated = table.sitPlayer({ userId, username, avatar, chips, seat: seatResult });
    if (seated.error) {
      this.log('cashJoin seating error after committed reservation:', seated.error);
      return { error: 'Seat reservation needs recovery — please reconnect' };
    }
    record.players.set(userId, { userId, username, chips, isBot: false, tableId: table.id, seat: seated.seat, status: 'seated' });
    table.maybeStartHand();
    return { tableId: table.id, gameId: record.id, seat: seated.seat, chips };
  }

  tableGameId(tableId) {
    const t = this.tables.get(tableId);
    return t ? t.gameId : null;
  }

  // Leave: cash out chips back to balance. Mid-hand: fold + settle at hand end.
  async cashLeave(userId, tableId) {
    const table = this.tables.get(tableId);
    if (!table) return { error: 'Table not found' };
    const record = this.games.get(table.gameId);
    if (!record) return { error: 'Game not found' };
    const seat = table.seatOf(userId);
    if (seat === -1) return { error: 'Not seated' };
    const player = table.seats[seat];
    const chips = player.chips;

    if (table.handInProgress && player.cards.length > 0) {
      table.removePlayer(userId); // folds + marks leavingAfterHand
      return { ok: true, pending: true, message: 'Hand in progress — chips arrive after this hand' };
    }

    // Out of hand: immediate cash-out
    const moved = await this.cashOutPlayer(record, table, userId, chips);
    if (moved.error) return moved;
    return { ok: true, chips };
  }

  // Settle a player's chips to their balance and remove them from the game.
  async cashOutPlayer(record, table, userId, chips) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stake = CASH_STAKES.find(s => s.key === record.stakeKey);
      if (record.currency === 'play') {
        await client.query('UPDATE users SET balance_play=balance_play+$1 WHERE id=$2', [chips, userId]);
      } else {
        const price = await usdPrice();
        if (!price) throw new Error('BTC price unavailable');
        const btc = chips / 100 / price;
        await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [btc, userId]);
        await client.query(
          `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'cash_out',$2,'confirmed',$3)`,
          [userId, btc, JSON.stringify({ gameId: record.id, usdCents: chips })]
        );
      }
      await client.query(
        `UPDATE game_players SET chips=0, status='left', cashed_out=$3, left_at=NOW() WHERE game_id=$1 AND user_id=$2`,
        [record.id, userId, chips]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      this.log('cashOut error:', err.message);
      return { error: 'Cash-out failed — try again' };
    } finally {
      client.release();
    }
    record.players.delete(userId);
    if (table) {
      const seat = table.seatOf(userId);
      if (seat !== -1) {
        table.seats[seat] = null;
        table.broadcast('tableSeats', { seats: table.publicSeats() });
      }
    }
    return { ok: true };
  }

  // Rebuy / add chips to stack (cash only, at most 2x? no — up to stake max total)
  async cashRebuy(userId, tableId) {
    const table = this.tables.get(tableId);
    if (!table) return { error: 'Table not found' };
    const record = this.games.get(table.gameId);
    const seat = table.seatOf(userId);
    if (seat === -1) return { error: 'Not seated' };
    const p = table.seats[seat];
    const stake = CASH_STAKES.find(s => s.key === record.stakeKey);
    if (p.chips >= stake.bb * 100) return { error: `You still have ${p.chips.toLocaleString()} chips` };
    const add = stake.min;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (record.currency === 'play') {
        const u = await client.query('SELECT balance_play FROM users WHERE id=$1 FOR UPDATE', [userId]);
        if (parseFloat(u.rows[0].balance_play) < add) { await client.query('ROLLBACK'); return { error: 'Insufficient play chips' }; }
        await client.query('UPDATE users SET balance_play=balance_play-$1 WHERE id=$2', [add, userId]);
      } else {
        const price = await usdPrice();
        if (!price) { await client.query('ROLLBACK'); return { error: 'BTC price unavailable' }; }
        const btc = add / 100 / price;
        const u = await client.query('SELECT balance_btc FROM users WHERE id=$1 FOR UPDATE', [userId]);
        if (parseFloat(u.rows[0].balance_btc) < btc) { await client.query('ROLLBACK'); return { error: 'Insufficient balance' }; }
        await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [btc, userId]);
        await client.query(
          `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'entry_fee',$2,'confirmed',$3)`,
          [userId, btc, JSON.stringify({ gameId: record.id, stakeKey: record.stakeKey, rebuy: true })]
        );
      }
      await client.query(
        `UPDATE game_players SET chips=chips+$3, bought_in=bought_in+$3 WHERE game_id=$1 AND user_id=$2`,
        [record.id, userId, add]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      return { error: 'Rebuy failed' };
    } finally {
      client.release();
    }
    table.addChips(userId, add);
    const rec = record.players.get(userId);
    if (rec) rec.chips = p.chips;
    return { ok: true, chips: p.chips };
  }

  // ─── SNG registration ───────────────────────────────────────────────────────

  async sngJoin(userId, username, avatar, { currency, buyin, seats, speed }) {
    currency = String(currency || '');
    buyin = Number(buyin);
    seats = Number(seats);
    if (!['play', 'btc'].includes(currency) || ![2, 3, 6, 8, 9].includes(seats)
      || !['regular', 'turbo', 'hyper', 'deepstack'].includes(speed)) return { error: 'Invalid SNG config' };
    if (currency === 'play' && !SNG_PLAY_BUYINS.includes(buyin)) return { error: 'Invalid buy-in' };
    if (currency === 'btc' && !SNG_BTC_USD.includes(buyin)) return { error: 'Invalid buy-in' };

    const pendingKey = `${userId}:${currency}:${buyin}:${seats}:${speed}`;
    if (!this._sngPending) this._sngPending = new Set();
    if (this._sngPending.has(pendingKey)) return { error: 'Registration is already processing' };
    this._sngPending.add(pendingKey);

    // Join an existing open SNG of this config with a free seat
    let record = [...this.games.values()].find(g =>
      g.gameType === 'sng' && g.status === 'registering' &&
      g.currency === currency && Number(currency === 'btc' ? g.entryUsd : g.entryFee) === buyin &&
      g.maxSeats === seats && g.speed === speed);
    if (record?._starting) {
      this._sngPending.delete(pendingKey);
      return { error: 'Sit & Go is starting — please try again' };
    }
    if (record) {
      if (!record._pendingPlayers) record._pendingPlayers = new Set();
      record._pendingPlayers.add(userId);
      record._registrationsInFlight = (record._registrationsInFlight || 0) + 1;
    }

    let client;
    let gameId;
    let registeredCount = 0;
    let startNow = false;
    let createdRecord = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const wallet = await client.query(
        'SELECT balance_play, balance_btc FROM users WHERE id=$1 FOR UPDATE', [userId]
      );
      if (!wallet.rows[0]) { await client.query('ROLLBACK'); return { error: 'Player not found' }; }
      const duplicate = await client.query(
        `SELECT g.id FROM game_players gp JOIN games g ON g.id=gp.game_id
         WHERE gp.user_id=$1 AND gp.status IN ('registered','seated') AND g.game_type='sng'
           AND g.status='registering' AND g.currency=$2 AND g.max_seats=$3 AND g.speed=$4
           AND (($2='play' AND g.entry_fee=$5) OR ($2='btc' AND g.entry_usd=$5)) LIMIT 1`,
        [userId, currency, seats, speed, buyin]
      );
      if (duplicate.rows.length) {
        await client.query('ROLLBACK');
        return { error: 'You are already registered for this Sit & Go' };
      }

      if (record) {
        const locked = await client.query('SELECT status,max_seats FROM games WHERE id=$1 FOR UPDATE', [record.id]);
        if (locked.rows[0]?.status !== 'registering') {
          await client.query('ROLLBACK');
          return { error: 'Sit & Go is no longer open — refresh the lobby' };
        }
        const count = await client.query(
          `SELECT COUNT(*)::int AS count FROM game_players WHERE game_id=$1 AND status IN ('registered','seated')`,
          [record.id]
        );
        registeredCount = Number(count.rows[0]?.count || 0);
        if (registeredCount >= seats) {
          await client.query('ROLLBACK');
          return { error: 'That Sit & Go just filled — register again for the next one' };
        }
      } else {
        const gins = await client.query(
          `INSERT INTO games(game_type,name,max_seats,speed,currency,entry_fee,entry_usd,starting_stack,level_minutes,min_players,status,ai_fill,created_by)
           VALUES('sng',$1,$2,$3,$4,$5,$6,$7,$8,2,'registering',$9,'system') RETURNING *`,
          [`${seats}-max ${speed} SNG · ${currency === 'play' ? buyin.toLocaleString() + ' chips' : '$' + buyin}`,
           seats, speed, currency,
           currency === 'play' ? buyin : 0,
           currency === 'btc' ? buyin : null,
           Math.round(1500 * (seats / 2)), levelMinutesFor(speed), currency === 'play']
        );
        record = this.recordFromRow(gins.rows[0]);
        record.entryFee = currency === 'play' ? buyin : 0;
        record.entryUsd = currency === 'btc' ? buyin : null;
        record.startingStack = Math.round(1500 * (seats / 2));
        record._registrationsInFlight = 1;
        record._pendingPlayers = new Set([userId]);
        this.games.set(record.id, record);
        createdRecord = true;
      }
      gameId = record.id;

      // Funds
      let btcAmount = 0;
      if (currency === 'play') {
        if (parseFloat(wallet.rows[0].balance_play || 0) < buyin) {
          await client.query('ROLLBACK');
          return { error: 'Not enough play chips' };
        }
        await client.query('UPDATE users SET balance_play=balance_play-$1 WHERE id=$2', [buyin, userId]);
      } else {
        const price = await usdPrice();
        if (!price) { await client.query('ROLLBACK'); return { error: 'BTC price unavailable' }; }
        btcAmount = buyin / price;
        if (parseFloat(wallet.rows[0].balance_btc || 0) < btcAmount) {
          await client.query('ROLLBACK');
          return { error: `Need $${buyin} in BTC` };
        }
        await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [btcAmount, userId]);
        await client.query(
          `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'entry_fee',$2,'confirmed',$3)`,
          [userId, btcAmount, JSON.stringify({ gameId, sng: { buyin, seats, speed } })]
        );
      }

      await client.query(
        `INSERT INTO game_players(game_id,user_id,chips,status,bought_in) VALUES($1,$2,0,'registered',$3)
         ON CONFLICT(game_id,user_id) DO UPDATE SET chips=0,status='registered',left_at=NULL,bought_in=EXCLUDED.bought_in`,
        [gameId, userId, currency === 'play' ? buyin : 0]
      );
      await client.query('COMMIT');
      registeredCount++;
      record.players.set(userId, { userId, username, avatar, chips: 0, isBot: false, tableId: null, seat: null, status: 'registered' });
      if (currency === 'btc' && !record._btcPool) record._btcPool = 0;
      record._prizeCollected = (record._prizeCollected || 0) + (currency === 'play' ? buyin : 0);
      if (registeredCount >= record.maxSeats) {
        startNow = true;
      } else if (registeredCount === 1 && !record.startDeadline) {
        record.startDeadline = Date.now() + SNG_COUNTDOWN_MS;
      }
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (createdRecord && record) this.games.delete(record.id);
      this.log('sngJoin error:', err.message);
      return { error: 'Registration failed' };
    } finally {
      client?.release();
      this._sngPending.delete(pendingKey);
      if (record) {
        record._pendingPlayers?.delete(userId);
        record._registrationsInFlight = Math.max(0, (record._registrationsInFlight || 1) - 1);
      }
    }

    // Full? start now. Otherwise countdown from first registrant.
    if (startNow) {
      this.startTournament(record).catch(e => this.log('sng start error:', e.message));
    }

    return { gameId, registered: registeredCount, needed: record.maxSeats };
  }

  // ─── MTT registration ───────────────────────────────────────────────────────

  async mttRegister(userId, username, avatar, gameId) {
    const record = this.games.get(gameId);
    if (!record || record.gameType !== 'mtt') return { error: 'Tournament not found' };
    if (record.status === 'completed' || record.status === 'cancelled') return { error: 'Tournament is over' };
    if (record._starting) return { error: 'Tournament is starting — please try again' };
    if (record.players.has(userId)) return { error: 'Already registered' };
    if (!record._pendingPlayers) record._pendingPlayers = new Set();
    if (record._pendingPlayers.has(userId)) return { error: 'Registration is already processing' };

    // Late registration window
    if (record.status === 'running') {
      if (record.lateRegClosed) return { error: 'Late registration closed' };
    }

    record._pendingPlayers.add(userId);
    record._registrationsInFlight = (record._registrationsInFlight || 0) + 1;
    let client;
    let latePrizePool = null;
    let latePayoutSchedule = null;
    let lateTable = null;
    let lateSeat = null;
    let lateReservationKey = null;
    let createdLateTableId = null;
    let lateSeatCommitted = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const wallet = await client.query('SELECT balance_play,balance_btc FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (!wallet.rows[0]) { await client.query('ROLLBACK'); return { error: 'Player not found' }; }
      const gameLock = await client.query('SELECT status FROM games WHERE id=$1 FOR UPDATE', [gameId]);
      const dbStatus = gameLock.rows[0]?.status;
      if (!['registering', 'running'].includes(dbStatus) || (dbStatus === 'running' && record.lateRegClosed)) {
        await client.query('ROLLBACK');
        return { error: 'Registration is closed' };
      }
      const duplicate = await client.query(
        `SELECT status FROM game_players WHERE game_id=$1 AND user_id=$2 AND status IN ('registered','seated') FOR UPDATE`,
        [gameId, userId]
      );
      if (duplicate.rows.length) {
        await client.query('ROLLBACK');
        return { error: 'Already registered' };
      }

      const isLateEntry = dbStatus === 'running';
      const entryAmount = record.currency === 'btc' ? Number(record.entryUsd || 0) : Number(record.entryFee || 0);
      if (isLateEntry) {
        if (!record._lateSeatReservations) record._lateSeatReservations = new Set();
        const candidates = this.tablesFor(record).map(table => {
          const occupied = new Set();
          table.seats.forEach((player, seat) => { if (player) occupied.add(seat); });
          for (const reservation of record._lateSeatReservations) {
            const [tableId, seat] = reservation.split(':');
            if (tableId === table.id) occupied.add(Number(seat));
          }
          const free = Array.from({ length: table.maxSeats }, (_, seat) => seat).find(seat => !occupied.has(seat));
          return { table, occupied: occupied.size, free };
        }).filter(candidate => candidate.free !== undefined).sort((a, b) => a.occupied - b.occupied);
        const target = candidates[0];
        if (target) {
          lateTable = target.table;
          lateSeat = target.free;
        } else {
          lateTable = this.createTable(record);
          createdLateTableId = lateTable.id;
          lateSeat = 0;
        }
        lateReservationKey = `${lateTable.id}:${lateSeat}`;
        record._lateSeatReservations.add(lateReservationKey);
      }
      let btcAmount = 0;
      if (record.currency === 'play' && record.entryFee > 0) {
        if (parseFloat(wallet.rows[0].balance_play || 0) < record.entryFee) {
          await client.query('ROLLBACK');
          return { error: `Need ${Number(record.entryFee).toLocaleString()} play chips` };
        }
        await client.query('UPDATE users SET balance_play=balance_play-$1 WHERE id=$2', [record.entryFee, userId]);
      } else if (record.currency === 'btc' && record.entryUsd > 0) {
        const price = await usdPrice();
        if (!price) { await client.query('ROLLBACK'); return { error: 'BTC price unavailable' }; }
        btcAmount = record.entryUsd / price;
        if (parseFloat(wallet.rows[0].balance_btc || 0) < btcAmount) {
          await client.query('ROLLBACK');
          return { error: `Need $${record.entryUsd} in BTC` };
        }
        await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [btcAmount, userId]);
        await client.query(
          `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'entry_fee',$2,'confirmed',$3)`,
          [userId, btcAmount, JSON.stringify({ gameId, mtt: record.name })]
        );
      }
      await client.query(
        `INSERT INTO game_players(game_id,user_id,seat,chips,status,bought_in) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(game_id,user_id) DO UPDATE SET seat=$3,chips=$4,status=$5,bought_in=game_players.bought_in+$6,left_at=NULL`,
        [gameId, userId, lateSeat, isLateEntry ? record.startingStack : 0,
          isLateEntry ? 'seated' : 'registered', record.currency === 'play' ? record.entryFee : 0]
      );

      if (isLateEntry && entryAmount > 0) {
        latePrizePool = Math.max(Number(record.guarantee || 0), Number(record.prizePool || 0) + entryAmount);
        latePayoutSchedule = mttPayouts(record.players.size + 1);
        await client.query(
          'UPDATE games SET prize_pool=$2,payout_schedule=$3 WHERE id=$1',
          [gameId, latePrizePool, JSON.stringify(latePayoutSchedule)]
        );
      }
      await client.query('COMMIT');
      lateSeatCommitted = isLateEntry;
    } catch (err) {
      await client?.query('ROLLBACK').catch(() => {});
      this.log('mttRegister error:', err.message);
      return { error: 'Registration failed' };
    } finally {
      client?.release();
      if (lateReservationKey) record._lateSeatReservations?.delete(lateReservationKey);
      if (createdLateTableId && !lateSeatCommitted) {
        this.tables.get(createdLateTableId)?.destroy();
        this.tables.delete(createdLateTableId);
        record.tableIds = (record.tableIds || []).filter(id => id !== createdLateTableId);
      }
      record._pendingPlayers.delete(userId);
      record._registrationsInFlight = Math.max(0, (record._registrationsInFlight || 1) - 1);
    }

    if (latePrizePool !== null) {
      record.prizePool = latePrizePool;
      record.payoutSchedule = latePayoutSchedule;
      if (record.currency === 'btc') record._prizeUsd = latePrizePool;
    }
    if (lateSeatCommitted) {
      const seated = lateTable.sitPlayer({ userId, username, avatar, chips: record.startingStack, seat: lateSeat });
      if (seated.error) {
        this.log('late MTT seating error after committed entry:', seated.error);
        return { error: 'Registration saved; reconnect to your table' };
      }
      record.players.set(userId, { userId, username, chips: record.startingStack, isBot: false, tableId: lateTable.id, seat: seated.seat, status: 'seated' });
      lateTable.maybeStartHand();
    } else {
      record.players.set(userId, { userId, username, chips: 0, isBot: false, tableId: null, seat: null, status: 'registered' });
    }
    record._prizeCollected = (record._prizeCollected || 0) + (record.currency === 'play' ? Number(record.entryFee) : 0);
    return { gameId, registered: record.players.size };
  }

  async mttUnregister(userId, gameId) {
    const record = this.games.get(gameId);
    if (!record) return { error: 'Tournament not found' };
    if (record.status !== 'registering' || record._starting) return { error: 'Tournament already started' };
    const p = record.players.get(userId);
    if (!p) return { error: 'Not registered' };

    record._registrationsInFlight = (record._registrationsInFlight || 0) + 1;
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const locked = await client.query('SELECT status FROM games WHERE id=$1 FOR UPDATE', [gameId]);
      if (locked.rows[0]?.status !== 'registering' || record._starting) {
        await client.query('ROLLBACK');
        return { error: 'Tournament is starting' };
      }
      if (record.currency === 'play' && Number(record.entryFee) > 0) {
        await client.query('UPDATE users SET balance_play=balance_play+$1 WHERE id=$2', [record.entryFee, userId]);
      } else if (record.currency === 'btc' && record.entryUsd > 0) {
        // Refund the actual BTC that was charged
        const tx = await client.query(
          `SELECT amount FROM transactions WHERE user_id=$1 AND type='entry_fee' AND metadata->>'gameId'=$2 AND status='confirmed' ORDER BY created_at DESC LIMIT 1`,
          [userId, gameId]
        );
        const refund = tx.rows[0]?.amount || 0;
        if (Number(refund) > 0) {
          await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [refund, userId]);
          await client.query(
            `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'refund',$2,'confirmed',$3)`,
            [userId, refund, JSON.stringify({ gameId, reason: 'unregistered' })]
          );
        }
      }
      await client.query(`UPDATE game_players SET status='left', left_at=NOW() WHERE game_id=$1 AND user_id=$2`, [gameId, userId]);
      await client.query('COMMIT');
      record.players.delete(userId);
      record._prizeCollected = Math.max(0, (record._prizeCollected || 0) - (record.currency === 'play' ? Number(record.entryFee) : 0));
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      return { error: 'Unregister failed' };
    } finally {
      client?.release();
      record._registrationsInFlight = Math.max(0, (record._registrationsInFlight || 1) - 1);
    }
    return { ok: true };
  }

  // ─── Tournament start / seating / payouts ───────────────────────────────────

  async startTournament(record, overridePlayers = null) {
    if (record.status === 'running') return;
    if (record._starting) return;
    record._starting = true;
    try {
      while ((record._registrationsInFlight || 0) > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (record.status !== 'registering') return;
      const humans = overridePlayers || [...record.players.values()];
      if (humans.length < 2) { record._starting = false; return; }

      // Prize pool
      let prizePool = record._prizeCollected || 0;
      if (record.currency === 'btc' && record.entryUsd > 0) {
        const price = await usdPrice();
        prizePool = humans.length * record.entryUsd; // USD-denominated pool
        record._prizeUsd = prizePool;
        if (record._btcEntries) record._btcEntries = [];
      }
      if (record.guarantee && prizePool < Number(record.guarantee)) {
        prizePool = Number(record.guarantee); // house tops up (play chips / USD)
      }
      record.prizePool = prizePool;
      const shares = record.gameType === 'sng' ? sngPayouts(humans.length <= record.maxSeats ? humans.length : record.maxSeats)
                                               : mttPayouts(humans.length);
      record.payoutSchedule = shares;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE games SET status='running', started_at=NOW(), prize_pool=$2, payout_schedule=$3,
           blind_start_time=NOW(), current_level=1 WHERE id=$1`,
          [record.id, prizePool, JSON.stringify(shares)]
        );
        // Give everyone their starting stack
        for (const p of humans) {
          await client.query(`UPDATE game_players SET chips=$3, status='seated' WHERE game_id=$1 AND user_id=$2`,
            [record.id, p.userId, record.startingStack]);
        }
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      record.status = 'running';
      record.blindStartTime = Date.now();

      // Seat across tables
      const tableCount = record.gameType === 'sng' ? 1 : Math.max(1, Math.ceil(humans.length / record.maxSeats));
      for (let i = 0; i < tableCount; i++) this.createTable(record);
      const tables = this.tablesFor(record);
      let ti = 0;
      const shuffled = [...humans].sort(() => Math.random() - 0.5);
      for (const p of shuffled) {
        const table = tables[ti % tableCount]; ti++;
        const seated = table.sitPlayer({ userId: p.userId, username: p.username, avatar: p.avatar, chips: record.startingStack });
        const rec = record.players.get(p.userId);
        if (rec) { rec.chips = record.startingStack; rec.status = 'seated'; rec.tableId = table.id; rec.seat = seated.seat ?? null; }
      }

      this.io.emit('lobbyChanged', { gameId: record.id });
      this.log(`started ${record.gameType.toUpperCase()} "${record.name}" — ${humans.length} players on ${tableCount} table(s), pool ${prizePool}`);
      for (const table of tables) table.maybeStartHand();
    } finally {
      record._starting = false;
    }
  }

  // ─── Tick loop ──────────────────────────────────────────────────────────────

  onTick() {
    if (!this.recovered) return;
    const now = Date.now();
    this.tickCount++;

    // 1) Action deadlines + AI
    for (const table of this.tables.values()) {
      if (table.destroyed) continue;
      if (table.actionOn !== null && table.actionDeadline > 0) {
        const actor = table.seats[table.actionOn];
        if (actor?.disconnected && table.actionDeadline - now > 4000) {
          table.actionDeadline = now + 4000;
        }
        if (now >= table.actionDeadline) table.handleTimeout(table.actionOn);
      }
    }

    // 2) Level ups (every 5s check)
    if (this.tickCount % 5 === 0) {
      for (const record of this.games.values()) {
        if (record.status !== 'running' || record.gameType === 'cash') continue;
        for (const table of this.tablesFor(record)) {
          if (!table.handInProgress) table.checkLevelUp();
        }
        // Late registration close
        if (record.gameType === 'mtt' && !record.lateRegClosed && record.lateRegLevels > 0) {
          const startedMs = new Date(record.startedAt || record.startAt).getTime();
          if (now - startedMs > record.lateRegLevels * record.levelMinutes * 60 * 1000) {
            record.lateRegClosed = true;
          }
        }
      }
    }

    // 3) SNG start deadlines + MTT scheduled starts
    if (this.tickCount % 3 === 0) this.checkStarts(now);

    // 4) Bot fill for play cash tables
    if (this.tickCount % 10 === 0) this.fillBots(now);

    // 5) MTT table balancing
    if (this.tickCount % BALANCE_INTERVAL_TICKS === 0) this.balanceMttTables();

    // 6) Refresh MTT calendar horizon hourly-ish
    if (this.tickCount % 1800 === 0) this.scheduleUpcomingMtts().catch(() => {});
  }

  checkStarts(now) {
    for (const record of this.games.values()) {
      if (record.status !== 'registering') continue;
      const registered = record.players.size;

      if (record.gameType === 'sng') {
        if (record.startDeadline && now >= record.startDeadline) {
          if (registered >= record.minPlayers || (record.currency === 'play' && record.aiFill)) this.startSngWithFill(record);
          else this.cancelGame(record, 'Not enough players').catch(() => {});
        }
      } else if (record.gameType === 'mtt' && record.startAt) {
        const startMs = new Date(record.startAt).getTime();
        if (startMs <= now) {
          // Grace: if field < min, wait MTT_REG_GRACE_MS
          if (registered >= record.minPlayers) {
            this.startTournament(record).catch(e => this.log('mtt start error:', e.message));
          } else if (now - startMs > MTT_REG_GRACE_MS) {
            if (registered >= 2) {
              this.startTournament(record).catch(e => this.log('mtt start error:', e.message));
            } else {
              this.cancelGame(record, 'Not enough players').catch(() => {});
            }
          }
        }
      }
    }
  }

  startSngWithFill(record) {
    const registered = [...record.players.values()];
    if (record.currency === 'play' && record.aiFill && registered.length < record.maxSeats) {
      // Fill with bots — play chips only, house-funded
      this.ensureBots(Math.max(60, record.maxSeats)).then(() => {
        const need = record.maxSeats - registered.length;
        const pool_ = this.botCache.filter(b => !record.players.has(b.userId)).slice(0, need);
        for (const b of pool_) {
          record.players.set(b.userId, { userId: b.userId, username: b.username.replace('_bot_', 'Bot '), chips: 0, isBot: true, tableId: null, seat: null, status: 'registered' });
        }
        this.startTournament(record).catch(e => this.log('sng fill start error:', e.message));
      });
      return;
    }
    if (registered.length >= 2) this.startTournament(record).catch(e => this.log('sng start error:', e.message));
    else if (registered.length < record.minPlayers) this.cancelGame(record, 'Not enough players').catch(() => {});
  }

  async cancelGame(record, reason) {
    if (record.status === 'completed' || record.status === 'cancelled') return;
    record.status = 'cancelled'; // set immediately so the tick can't re-cancel
    // Refund all registrants
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query(`SELECT * FROM game_players WHERE game_id=$1 AND status IN ('registered','seated')`, [record.id]);
      for (const row of rows.rows) {
        if (Number(row.bought_in) > 0) {
          if (record.currency === 'play') {
            await client.query('UPDATE users SET balance_play=balance_play+$2 WHERE id=$1', [row.user_id, Number(row.bought_in)]);
          } else if (record.currency === 'btc') {
            const tx = await client.query(
              `SELECT amount FROM transactions WHERE user_id=$1 AND type='entry_fee' AND metadata->>'gameId'=$2 AND status='confirmed' ORDER BY created_at DESC LIMIT 1`,
              [row.user_id, record.id]
            );
            const refund = tx.rows[0]?.amount || 0;
            if (Number(refund) > 0) {
              await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [refund, row.user_id]);
              await client.query(`INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'refund',$2,'confirmed',$3)`,
                [row.user_id, refund, JSON.stringify({ gameId: record.id, reason })]);
            }
          }
        }
        await client.query(`UPDATE game_players SET status='left', left_at=NOW() WHERE id=$1`, [row.id]);
      }
      await client.query(`UPDATE games SET status='cancelled', ended_at=NOW() WHERE id=$1`, [record.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      this.log('cancelGame error:', err.message);
      return;
    } finally {
      client.release();
    }
    for (const tableId of record.tableIds || []) {
      const t = this.tables.get(tableId);
      t?.destroy();
      this.tables.delete(tableId);
    }
    this.io.emit('lobbyChanged', { gameId: record.id });
    this.log(`cancelled "${record.name}": ${reason}`);
  }

  // Bots fill empty seats at play-money cash tables marked aiFill
  fillBots(now) {
    for (const record of this.games.values()) {
      if (record.gameType !== 'cash' || !record.aiFill) continue;
      for (const table of this.tablesFor(record)) {
        const occupied = table.seats.filter(Boolean).length;
        if (occupied === 0) continue;               // don't open dead tables
        if (occupied >= table.maxSeats) continue;
        if (occupied >= 2 && table.seats.filter(s => s && !s.isAi).length === 0) continue;
        const humanSeats = table.seats.filter(s => s && !s.isAi).length;
        if (humanSeats === 0) continue;
        if (!record._botFillAt) record._botFillAt = now + BOT_FILL_DELAY_MS;
        if (now < record._botFillAt) continue;
        record._botFillAt = now + BOT_FILL_DELAY_MS;

        const existingBots = table.seats.filter(s => s && s.isAi).length;
        if (existingBots >= 2) continue;            // cap 2 bots per table
        const usedBots = new Set([...record.players.keys()].filter(uid => this.botCache.some(b => b.userId === uid)));
        const bot = this.botCache.find(b => !usedBots.has(b.userId));
        if (!bot) continue;
        const stake = CASH_STAKES.find(s => s.key === record.stakeKey);
        const chips = stake ? stake.min : 2000;
        // Bot rows: bought_in 0 (house-funded)
        pool.query(
          `INSERT INTO game_players(game_id,user_id,seat,chips,status,bought_in) VALUES($1,$2,$3,$4,'seated',0)
           ON CONFLICT(game_id,user_id) DO UPDATE SET chips=$4, status='seated'`,
          [record.id, bot.userId, chips]
        ).catch(() => {});
        const seated = table.sitPlayer({ userId: bot.userId, username: bot.username.replace('_bot_', 'Bot '), avatar: '🤖', chips });
        if (seated.seat !== undefined) {
          table.seats[seated.seat].isAi = true;
          record.players.set(bot.userId, { userId: bot.userId, username: bot.username, chips, isBot: true, tableId: table.id, seat: seated.seat, status: 'seated' });
        }
      }
    }
  }

  // ─── Engine callbacks ───────────────────────────────────────────────────────

  onTurnStart(table, seat) {
    const p = table.seats[seat];
    if (!p?.isAi) return;
    const think = 600 + Math.floor(Math.random() * 1600);
    table.schedule(() => {
      if (table.destroyed || table.actionOn !== seat) return;
      const decision = botDecide(table, seat);
      // Normalize raise to "raise to" semantics used by engine
      const result = table.applyAction(p.userId, decision.action, decision.amount);
      if (result?.error) table.applyAction(p.userId, 'fold', 0);
    }, think);
  }

  // Hand boundary: persist stacks, handle busts, rake, next hand, game end
  async onHandEnd(table, summary) {
    const record = this.games.get(table.gameId);
    if (!record) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Rake accrual (cash only)
      if (summary.rake > 0) {
        await client.query(`UPDATE games SET rake_collected=rake_collected+$2 WHERE id=$1`, [record.id, summary.rake]);
      }

      // Persist stacks
      for (const [seatStr, chips] of Object.entries(summary.stacks)) {
        const seat = Number(seatStr);
        const p = table.seats[seat];
        if (!p) continue;
        const upd = await client.query(`UPDATE game_players SET chips=$3 WHERE game_id=$1 AND user_id=$2 RETURNING user_id`, [record.id, p.userId, chips]);
        if (upd.rowCount !== 1) this.log(`flush MISS hand=${summary.handNumber} seat=${seat} user=${p.userId} chips=${chips} rows=${upd.rowCount}`);
        const rec = record.players.get(p.userId);
        if (rec) rec.chips = chips;
      }

      await client.query(
        `INSERT INTO hand_history(game_id, hand_number, pot, community_cards, hand_log)
         VALUES($1,$2,$3,$4,$5)`,
        [record.id, summary.handNumber, summary.potTotal, JSON.stringify(summary.community), JSON.stringify(summary.log)]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      this.log('onHandEnd flush error:', err.message);
    } finally {
      client.release();
    }

    // Post-DB: handle leavers (cash), busts (tournaments), next hand
    this.processLeavers(record, table);
    if (record.gameType !== 'cash') this.processBusts(record, table);

    if (record.gameType === 'cash') {
      table.schedule(() => table.maybeStartHand(), 1200);
    } else {
      const ended = this.checkTournamentEnd(record);
      if (!ended) {
        // Rebalance before next hand if this table is short-handed vs others
        if (record.gameType === 'mtt') this.rebalanceIfNeeded(record);
        table.schedule(() => table.maybeStartHand(), 2000);
      }
    }
  }

  processLeavers(record, table) {
    for (const p of table.seats) {
      if (!p || !p.leavingAfterHand) continue;
      const chips = p.chips;
      const userId = p.userId;
      table.seats[p.seat] = null;
      table.broadcast('tableSeats', { seats: table.publicSeats() });
      this.cashOutPlayer(record, table, userId, chips).catch(e => this.log('leaver cashout error:', e.message));
    }
  }

  processBusts(record, table) {
    const busted = [];
    for (const p of table.seats) {
      if (!p) continue;
      if (p.chips <= 0) busted.push(p);
    }
    if (busted.length === 0) return;

    // Alive count from TABLE truth (busting stacks already hit 0 in memory;
    // record chips may lag one hand for players who never flushed a 0 stack).
    const aliveCount = table.seats.filter(p => p && p.chips > 0 && !busted.includes(p)).length;
    busted.sort((a, b) => (record.players.get(b.userId)?.chips || 0) - (record.players.get(a.userId)?.chips || 0));
    let place = aliveCount + busted.length;
    for (const p of busted) {
      const rec = record.players.get(p.userId);
      table.seats[p.seat] = null;
      if (rec) {
        rec.status = 'eliminated';
        rec.place = place;
        rec.prize = this.prizeForPlace(record, place);
      }
      place--;
      p.eliminated = true;
      table.broadcast('playerEliminated', { seat: p.seat, username: p.username, place: rec?.place, prize: rec?.prize });
    }

    // Credit prizes (paid places) immediately
    this.creditEliminationPrizes(record, busted.map(p => p.userId)).catch(e => this.log('prize credit error:', e.message));

    // Clean up player records for busted bots later; humans keep record for lobby "places" display
    for (const p of busted) {
      const rec = record.players.get(p.userId);
      if (rec) rec.chips = 0;
    }
  }

  prizeForPlace(record, place) {
    const shares = record.payoutSchedule || [];
    if (place < 1 || place > shares.length) return 0;
    return distribute(record.prizePool, shares)[place - 1].amount;
  }

  async creditEliminationPrizes(record, userIds) {
    for (const userId of userIds) {
      const rec = record.players.get(userId);
      if (!rec || !rec.prize || Number(rec.prize) <= 0) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (record.currency === 'play') {
          await client.query('UPDATE users SET balance_play=balance_play+$1 WHERE id=$2', [Number(rec.prize), userId]);
          await client.query(
            `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'winnings',$2,'confirmed',$3)`,
            [userId, Number(rec.prize), JSON.stringify({ gameId: record.id, game: record.name, place: rec.place })]
          );
        } else {
          // USD-denominated prize pool → BTC at current rate
          const price = await usdPrice();
          const btc = price ? Number(rec.prize) / price : 0;
          if (btc > 0) {
            await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [btc, userId]);
            await client.query(
              `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'winnings',$2,'confirmed',$3)`,
              [userId, btc, JSON.stringify({ gameId: record.id, game: record.name, place: rec.place, usd: Number(rec.prize) })]
            );
            rec.prizeBtc = btc;
          }
        }
        await client.query(`UPDATE game_players SET prize=$3, place=$4 WHERE game_id=$1 AND user_id=$2`,
          [record.id, userId, rec.prize, rec.place]);
        await client.query('COMMIT');
        // Notify
        this.io.emit('prizeWon', { userId, username: rec.username, game: record.name, place: rec.place, prize: rec.prize, currency: record.currency });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        this.log('creditPrize error:', err.message);
      } finally {
        client.release();
      }
    }
  }

  checkTournamentEnd(record) {
    if (record.status !== 'running') return true;
    const alive = [...record.players.values()].filter(p => p.chips > 0);
    if (alive.length > 1) return false;

    // Winner
    const winner = alive[0];
    record.status = 'completed';
    if (winner) {
      winner.place = 1;
      winner.prize = this.prizeForPlace(record, 1);
    }
    const tables = this.tablesFor(record);
    for (const t of tables) { t.destroy(); }
    for (const id of record.tableIds || []) this.tables.delete(id);

    setImmediate(() => this.finalizeTournament(record, winner).catch(e => this.log('finalize error:', e.message)));
    return true;
  }

  async finalizeTournament(record, winner) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE games SET status='completed', ended_at=NOW() WHERE id=$1`, [record.id]);
      if (winner) {
        await client.query(`UPDATE game_players SET status='finished', place=1, prize=$3 WHERE game_id=$1 AND user_id=$2`,
          [record.id, winner.userId, winner.prize || 0]);
        if (Number(winner.prize) > 0) {
          if (record.currency === 'play') {
            await client.query('UPDATE users SET balance_play=balance_play+$1 WHERE id=$2', [Number(winner.prize), winner.userId]);
            await client.query(
              `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'winnings',$2,'confirmed',$3)`,
              [winner.userId, Number(winner.prize), JSON.stringify({ gameId: record.id, game: record.name, place: 1 })]
            );
          } else {
            const price = await usdPrice();
            const btc = price ? Number(winner.prize) / price : 0;
            if (btc > 0) {
              await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [btc, winner.userId]);
              await client.query(
                `INSERT INTO transactions(user_id,type,amount,status,metadata) VALUES($1,'winnings',$2,'confirmed',$3)`,
                [winner.userId, btc, JSON.stringify({ gameId: record.id, game: record.name, place: 1, usd: Number(winner.prize) })]
              );
            }
          }
        }
        const wrec = record.players.get(winner.userId);
        if (wrec) { wrec.prize = winner.prize; wrec.prizeBtc = record.currency === 'btc' ? (winner.prize / (await usdPrice() || 1)) : undefined; }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      this.log('finalizeTournament error:', err.message);
    } finally {
      client.release();
    }

    this.io.to(`g:${record.id}`).emit('tournamentFinished', {
      gameId: record.id, name: record.name,
      winner: winner ? { userId: winner.userId, username: winner.username, prize: winner.prize, currency: record.currency } : null,
    });
    this.io.emit('lobbyChanged', { gameId: record.id });
    this.log(`completed "${record.name}" — winner: ${winner?.username || 'n/a'}`);
  }

  // ─── MTT table balancing ────────────────────────────────────────────────────

  balanceMttTables() {
    for (const record of this.games.values()) {
      if (record.status !== 'running' || record.gameType !== 'mtt') continue;
      this.rebalanceIfNeeded(record, true);
    }
  }

  rebalanceIfNeeded(record, force = false) {
    const tables = this.tablesFor(record).filter(t => !t.destroyed);
    if (tables.length <= 1) return;
    const counts = tables.map(t => ({ t, n: t.seats.filter(Boolean).length }));
    const maxT = counts.reduce((a, b) => (b.n > a.n ? b : a));
    const minT = counts.reduce((a, b) => (b.n < a.n ? b : a));
    if (maxT.n - minT.n < (force ? 2 : 2)) return;

    // Move one player from the biggest table to the smallest (not mid-hand,
    // not the current actor; prefer bot-free, high-seat players with short stacks last)
    const candidates = maxT.t.seats.filter(p => p && !p.leavingAfterHand && !maxT.t.handInProgress);
    const mover = candidates[candidates.length - 1];
    if (!mover) return;
    const freeSeat = minT.t.seats.findIndex(s => s === null);
    if (freeSeat === -1) return;

    maxT.t.seats[mover.seat] = null;
    const seated = minT.t.sitPlayer({ userId: mover.userId, username: mover.username, avatar: mover.avatar, chips: mover.chips, seat: freeSeat });
    if (seated.error) {
      maxT.t.sitPlayer({ userId: mover.userId, username: mover.username, avatar: mover.avatar, chips: mover.chips, seat: mover.seat });
      return;
    }
    const rec = record.players.get(mover.userId);
    if (rec) { rec.tableId = minT.t.id; rec.seat = seated.seat; }
    this.io.to(`t:${maxT.t.id}`).emit('tableSeats', { seats: maxT.t.publicSeats() });
    this.io.to(`t:${minT.t.id}`).emit('tableSeats', { seats: minT.t.publicSeats() });
    this.io.to(`t:${maxT.t.id}`).emit('seatMoved', { to: minT.t.id });
    maxT.t.maybeStartHand();
    minT.t.maybeStartHand();
  }

  // ─── Socket-facing helpers ──────────────────────────────────────────────────

  tableState(tableId) {
    return this.tables.get(tableId)?.publicState() || null;
  }

  playerView(tableId, userId) {
    const table = this.tables.get(tableId);
    if (!table) return null;
    const state = table.publicState();
    const seat = table.seatOf(userId);
    state.mySeat = seat;
    state.myCards = seat !== -1 ? table.seats[seat].cards : [];
    return state;
  }

  handleConnect(tableId, userId) {
    let m = this.seatSockets.get(tableId);
    if (!m) { m = new Map(); this.seatSockets.set(tableId, m); }
    m.set(userId, (m.get(userId) || 0) + 1);
    const table = this.tables.get(tableId);
    if (table) {
      const seat = table.seatOf(userId);
      if (seat !== -1) table.seats[seat].disconnected = false;
    }
  }

  handleDisconnect(tableId, userId) {
    const m = this.seatSockets.get(tableId);
    if (!m) return;
    const n = (m.get(userId) || 1) - 1;
    if (n <= 0) m.delete(userId); else m.set(userId, n);
    const table = this.tables.get(tableId);
    if (table && !m.has(userId)) {
      const seat = table.seatOf(userId);
      if (seat !== -1) {
        table.seats[seat].disconnected = true;
        table.broadcast('tableSeats', { seats: table.publicSeats() });
      }
    }
  }

  casinoAction(userId, tableId, action, amount) {
    const table = this.tables.get(tableId);
    if (!table) return { error: 'Table not found' };
    return table.applyAction(userId, action, amount);
  }

  sitToggle(userId, tableId, sitOut) {
    const table = this.tables.get(tableId);
    if (!table) return { error: 'Table not found' };
    return { ok: table.setSitOut(userId, sitOut) };
  }

  useTimebank(userId, tableId) {
    const table = this.tables.get(tableId);
    if (!table) return { error: 'Table not found' };
    return table.useTimebank(userId);
  }

  destroy() {
    clearInterval(this.tick);
    for (const t of this.tables.values()) t.destroy();
  }
}

module.exports = { GameManager };
