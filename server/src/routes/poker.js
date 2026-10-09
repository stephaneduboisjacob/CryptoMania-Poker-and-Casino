// Casino REST API: /api/poker/*
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { MTT_CALENDAR } = require('../poker/schedules');

// manager is created once in index.js and shared with socket/casino.js
module.exports = (io, manager) => {

  // ─── Lobby ───
  router.get('/lobby', authenticate, async (req, res) => {
    try {
      const snap = manager.lobbySnapshot();
      // My registrations / seats
      const mine = [];
      for (const g of manager.games.values()) {
        if (g.status === 'completed' || g.status === 'cancelled') continue;
        const p = g.players.get(req.user.id);
        if (p) {
          mine.push({
            gameId: g.id, name: g.name, gameType: g.gameType, status: g.status,
            currency: g.currency, tableId: p.tableId, chips: p.chips,
            place: p.place || null, registered: g.players.size, maxSeats: g.maxSeats,
            startAt: g.startAt,
          });
        }
      }
      res.json({ ...snap, mine, calendar: MTT_CALENDAR.map(ev => ({
        key: ev.key, name: ev.name, description: ev.description, currency: ev.currency,
        entryUsd: ev.entryUsd || 0, entryFee: ev.entryFee || 0, speed: ev.speed,
        maxSeats: ev.maxSeats, guarantee: ev.guarantee || ev.guaranteeUsd || 0,
        hours: ev.hours, minute: ev.minute,
      })) });
    } catch (err) {
      console.error('poker/lobby error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Cash games ───
  router.post('/cash/join', authenticate, async (req, res) => {
    const { stakeKey, seat, maxSeats } = req.body || {};
    const result = await manager.cashJoin(req.user.id, req.user.username, req.user.avatar, stakeKey, seat ?? null, maxSeats ?? 9);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  router.post('/cash/leave', authenticate, async (req, res) => {
    const { tableId } = req.body || {};
    const result = await manager.cashLeave(req.user.id, tableId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  router.post('/cash/rebuy', authenticate, async (req, res) => {
    const { tableId } = req.body || {};
    const result = await manager.cashRebuy(req.user.id, tableId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ─── SNG registration ───
  router.post('/sng/join', authenticate, async (req, res) => {
    const { currency, buyin, seats, speed } = req.body || {};
    const result = await manager.sngJoin(req.user.id, req.user.username, req.user.avatar, { currency, buyin, seats, speed });
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ─── MTT registration ───
  router.post('/mtt/register', authenticate, async (req, res) => {
    const { gameId } = req.body || {};
    const result = await manager.mttRegister(req.user.id, req.user.username, req.user.avatar, gameId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  router.post('/mtt/unregister', authenticate, async (req, res) => {
    const { gameId } = req.body || {};
    const result = await manager.mttUnregister(req.user.id, gameId);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ─── Game detail (tournament lobby: players, payouts, my status) ───
  router.get('/game/:gameId', authenticate, async (req, res) => {
    const record = manager.games.get(req.params.gameId);
    if (!record) return res.status(404).json({ error: 'Not found' });
    const players = [...record.players.values()].map(p => ({
      userId: p.userId, username: p.username, chips: p.chips, isBot: p.isBot,
      status: p.status, place: p.place || null, prize: p.prize || null, tableId: p.tableId,
    }));
    players.sort((a, b) => (b.chips - a.chips) || ((a.place || 999) - (b.place || 999)));
    const me = record.players.get(req.user.id);
    res.json({
      game: {
        id: record.id, name: record.name, gameType: record.gameType, status: record.status,
        maxSeats: record.maxSeats, speed: record.speed, currency: record.currency,
        entryFee: record.entryFee, entryUsd: record.entryUsd,
        startingStack: record.startingStack, levelMinutes: record.levelMinutes,
        lateRegLevels: record.lateRegLevels, lateRegClosed: !!record.lateRegClosed,
        guarantee: record.guarantee, prizePool: record.prizePool,
        payoutSchedule: record.payoutSchedule, minPlayers: record.minPlayers,
        startAt: record.startAt, playersAlive: players.filter(p => p.chips > 0).length,
        tables: (record.tableIds || []).length,
      },
      players,
      me: me ? { chips: me.chips, tableId: me.tableId, status: me.status, place: me.place || null } : null,
    });
  });

  // ─── Table snapshot (initial load before socket events arrive) ───
  router.get('/table/:tableId', authenticate, async (req, res) => {
    const state = manager.playerView(req.params.tableId, req.user.id);
    if (!state) return res.status(404).json({ error: 'Table not found' });
    const table = manager.tables.get(req.params.tableId);
    res.json({
      state,
      game: { id: table.gameId, gameType: table.gameType, currency: table.currency, name: table.name, speed: table.speed },
      stake: table.gameType === 'cash' ? { sb: table.smallBlind, bb: table.bigBlind } : null,
    });
  });

  // Recent hand history for a casino game
  router.get('/game/:gameId/hands', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, hand_number, pot, community_cards, hand_log, created_at
         FROM hand_history WHERE game_id=$1 ORDER BY hand_number DESC LIMIT 30`,
        [req.params.gameId]
      );
      res.json({ hands: result.rows.reverse() });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};
