const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { startNewHand, getAiUserId } = require('../game/engine');
const { cancelWaitingTournaments } = require('../game/finance');
const { getBtcUsd } = require('./prices');

// USD buy-in amounts → 5% rake
const TIERS = {
  play: { usd: 0,   currency: 'play' },
  '20':  { usd: 20,  currency: 'USD' },
  '50':  { usd: 50,  currency: 'USD' },
  '100': { usd: 100, currency: 'USD' },
  '250': { usd: 250, currency: 'USD' },
  '500': { usd: 500, currency: 'USD' },
};

async function usdToBtc(usd) {
  const price = await getBtcUsd();
  if (!price) throw new Error('BTC price unavailable');
  return usd / price;
}

// Get open lobbies
router.get('/lobbies', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        u1.username as player1_name,
        u2.username as player2_name
      FROM tournaments t
      LEFT JOIN users u1 ON t.player1_id = u1.id
      LEFT JOIN users u2 ON t.player2_id = u2.id
      WHERE t.status IN ('waiting','active') AND t.is_ai = false
      ORDER BY t.created_at DESC LIMIT 50
    `);
    const btcPrice = await getBtcUsd().catch(() => null);
    res.json({ lobbies: result.rows, btcPrice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join or create a tournament (human vs human)
router.post('/join', authenticate, async (req, res) => {
  const { tier } = req.body;
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tierConfig = TIERS[tier];

    const userRes = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const u = userRes.rows[0];
    const cancellation = await cancelWaitingTournaments(client, u.id, { tier });

    let entryBtc = 0, rakeBtc = 0, prizeBtc = 0;

    if (tier !== 'play') {
      const btcPrice = await getBtcUsd();
      if (!btcPrice) { await client.query('ROLLBACK'); return res.status(503).json({ error: 'BTC price unavailable' }); }
      entryBtc = tierConfig.usd / btcPrice;
      rakeBtc  = entryBtc * 0.05;
      prizeBtc = entryBtc * 0.95;

      const availableBalance = parseFloat(u.balance_btc) + cancellation.refunded;
      if (availableBalance < entryBtc) {
        await client.query('ROLLBACK');
        const need = (tierConfig.usd).toFixed(2);
        return res.status(400).json({ error: `Insufficient balance. Need $${need}` });
      }
    }

    // Find an open waiting table (not created by this user)
    const open = await client.query(
      `SELECT * FROM tournaments WHERE tier=$1 AND status='waiting' AND player1_id!=$2 AND is_ai=false
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [tier, u.id]
    );

    let tournament;

    if (open.rows.length > 0) {
      const t = open.rows[0];

      if (tier !== 'play') {
        await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [entryBtc, u.id]);
        await client.query(`INSERT INTO transactions(user_id,type,amount,status) VALUES($1,'entry_fee',$2,'confirmed')`, [u.id, entryBtc]);
      }

      const netContribution = entryBtc - rakeBtc;
      const result = await client.query(
        `UPDATE tournaments SET player2_id=$1,status='active',started_at=NOW(),
         prize_pool=prize_pool+$2,rake=rake+$3 WHERE id=$4 RETURNING *`,
        [u.id, netContribution, rakeBtc, t.id]
      );
      tournament = result.rows[0];

      await client.query(
        `INSERT INTO game_state(tournament_id,blind_start_time) VALUES($1,NOW()) ON CONFLICT(tournament_id) DO NOTHING`,
        [tournament.id]
      );
      await client.query('COMMIT');

      res.json({ tournament: { id: tournament.id, tier, status: 'active', justStarted: true } });
    } else {
      if (tier !== 'play') {
        await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [entryBtc, u.id]);
        await client.query(`INSERT INTO transactions(user_id,type,amount,status) VALUES($1,'entry_fee',$2,'confirmed')`, [u.id, entryBtc]);
      }

      const result = await client.query(
        `INSERT INTO tournaments(tier,entry_fee,rake,prize_pool,player1_id,status,is_ai) VALUES($1,$2,$3,$4,$5,'waiting',false) RETURNING *`,
        [tier, entryBtc, rakeBtc, prizeBtc, u.id]
      );
      tournament = result.rows[0];
      await client.query('COMMIT');

      res.json({ tournament: { id: tournament.id, tier, status: 'waiting', justStarted: false } });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Join error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Start an AI game (play money only)
router.post('/join-ai', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const aiId = await getAiUserId();
    if (!aiId) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'AI not available' }); }

    await cancelWaitingTournaments(client, req.user.id, { tier: 'play' });

    const result = await client.query(
      `INSERT INTO tournaments(tier,entry_fee,rake,prize_pool,player1_id,player2_id,status,is_ai,started_at)
       VALUES('play',0,0,0,$1,$2,'active',true,NOW()) RETURNING *`,
      [req.user.id, aiId]
    );
    const tournament = result.rows[0];

    await client.query(
      `INSERT INTO game_state(tournament_id,blind_start_time) VALUES($1,NOW())`,
      [tournament.id]
    );
    await client.query('COMMIT');

    res.json({ tournament: { id: tournament.id, tier: 'play', status: 'active', justStarted: true, isAi: true } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('AI join error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get tournament details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
        u1.username as player1_name,
        u2.username as player2_name,
        u3.username as winner_name
      FROM tournaments t
      LEFT JOIN users u1 ON t.player1_id=u1.id
      LEFT JOIN users u2 ON t.player2_id=u2.id
      LEFT JOIN users u3 ON t.winner_id=u3.id
      WHERE t.id=$1
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    const btcPrice = await getBtcUsd().catch(() => null);
    res.json({ tournament: result.rows[0], btcPrice });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave a waiting tournament (refund)
router.post('/:id/leave', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tRes = await client.query('SELECT * FROM tournaments WHERE id=$1 FOR UPDATE', [req.params.id]);
    const t = tRes.rows[0];
    if (!t) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (t.status !== 'waiting') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot leave active game' }); }
    if (t.player1_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Forbidden' }); }

    await cancelWaitingTournaments(client, req.user.id, { tournamentId: t.id });
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get hand history for a tournament
router.get('/:id/hands', authenticate, async (req, res) => {
  try {
    const tRes = await pool.query('SELECT * FROM tournaments WHERE id=$1', [req.params.id]);
    const t = tRes.rows[0];
    if (!t) return res.status(404).json({ error: 'Not found' });
    const isPlayer = t.player1_id === req.user.id || t.player2_id === req.user.id || req.user.is_admin;
    if (!isPlayer) return res.status(403).json({ error: 'Forbidden' });

    const result = await pool.query(
      `SELECT hh.*, u.username AS winner_name
       FROM hand_history hh
       LEFT JOIN users u ON u.id=hh.winner_id
       WHERE hh.tournament_id=$1
       ORDER BY hh.hand_number ASC`,
      [req.params.id]
    );
    res.json({ hands: result.rows, tournament: t });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = (io) => {
  router._io = io;
  return router;
};
