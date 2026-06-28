const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

// Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [users, tournaments, revenue, active] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE NOT is_admin'),
      pool.query('SELECT COUNT(*) FROM tournaments'),
      pool.query(`SELECT COALESCE(SUM(rake),0) as total FROM tournaments WHERE status IN ('active','completed')`),
      pool.query(`SELECT COUNT(*) FROM tournaments WHERE status='active'`),
    ]);

    const recentTx = await pool.query(`
      SELECT t.*, u.username FROM transactions t
      JOIN users u ON t.user_id=u.id
      ORDER BY t.created_at DESC LIMIT 20
    `);

    const recentGames = await pool.query(`
      SELECT t.*, u1.username as p1, u2.username as p2, u3.username as winner
      FROM tournaments t
      LEFT JOIN users u1 ON t.player1_id=u1.id
      LEFT JOIN users u2 ON t.player2_id=u2.id
      LEFT JOIN users u3 ON t.winner_id=u3.id
      ORDER BY t.created_at DESC LIMIT 20
    `);

    res.json({
      stats: {
        totalUsers: parseInt(users.rows[0].count),
        totalTournaments: parseInt(tournaments.rows[0].count),
        totalRevenue: parseFloat(revenue.rows[0].total),
        activeTournaments: parseInt(active.rows[0].count),
      },
      recentTransactions: recentTx.rows,
      recentGames: recentGames.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All users
router.get('/users', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT id, username, balance_btc, balance_play, is_admin, is_banned, created_at, last_seen
      FROM users
      WHERE username ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [`%${search}%`, limit, offset]);
    const count = await pool.query(`SELECT COUNT(*) FROM users WHERE username ILIKE $1`, [`%${search}%`]);
    res.json({ users: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Ban/unban user
router.post('/users/:id/ban', async (req, res) => {
  const { ban } = req.body;
  try {
    await pool.query('UPDATE users SET is_banned=$1 WHERE id=$2', [!!ban, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Adjust user balance
router.post('/users/:id/balance', async (req, res) => {
  const { btc, play } = req.body;
  try {
    if (btc !== undefined) await pool.query('UPDATE users SET balance_btc=$1 WHERE id=$2', [btc, req.params.id]);
    if (play !== undefined) await pool.query('UPDATE users SET balance_play=$1 WHERE id=$2', [play, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// All tournaments
router.get('/tournaments', async (req, res) => {
  try {
    const { status, tier, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    if (status) { params.push(status); conditions.push(`t.status=$${params.length}`); }
    if (tier) { params.push(tier); conditions.push(`t.tier=$${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await pool.query(`
      SELECT t.*, u1.username as p1, u2.username as p2, u3.username as winner
      FROM tournaments t
      LEFT JOIN users u1 ON t.player1_id=u1.id
      LEFT JOIN users u2 ON t.player2_id=u2.id
      LEFT JOIN users u3 ON t.winner_id=u3.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${params.length+1} OFFSET $${params.length+2}
    `, [...params, limit, offset]);

    res.json({ tournaments: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// All transactions
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(`
      SELECT t.*, u.username FROM transactions t
      JOIN users u ON t.user_id=u.id
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const count = await pool.query('SELECT COUNT(*) FROM transactions');
    res.json({ transactions: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── AI Settings ──────────────────────────────────────────────────────────────

router.get('/ai-settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM ai_settings WHERE id=1');
    const settings = r.rows[0] || {};

    // AI game stats
    const stats = await pool.query(`
      SELECT
        COUNT(*)::int AS total_games,
        COUNT(*) FILTER (WHERE winner_id = (SELECT id FROM users WHERE username='_ai_'))::int AS ai_wins
      FROM tournaments
      WHERE is_ai=true AND status='completed'
    `);

    res.json({
      settings: {
        name:         settings.name         || 'Heisenberg AI',
        difficulty:   settings.difficulty   || 'medium',
        action_delay: settings.action_delay || 'normal',
        emoji:        settings.emoji        || '🤖',
        updated_at:   settings.updated_at,
      },
      aiStats: stats.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/ai-settings', async (req, res) => {
  const { name, difficulty, action_delay, emoji } = req.body;
  const validDiff  = ['easy','medium','hard','insane'];
  const validDelay = ['fast','normal','slow','human'];

  if (name && (typeof name !== 'string' || name.length > 50))
    return res.status(400).json({ error: 'Name must be ≤50 characters' });
  if (difficulty && !validDiff.includes(difficulty))
    return res.status(400).json({ error: 'Invalid difficulty' });
  if (action_delay && !validDelay.includes(action_delay))
    return res.status(400).json({ error: 'Invalid action_delay' });

  try {
    await pool.query(`
      UPDATE ai_settings SET
        name         = COALESCE($1, name),
        difficulty   = COALESCE($2, difficulty),
        action_delay = COALESCE($3, action_delay),
        emoji        = COALESCE($4, emoji),
        updated_at   = NOW()
      WHERE id=1
    `, [name || null, difficulty || null, action_delay || null, emoji || null]);

    // Bust the in-process cache so changes take effect immediately
    require('../game/ai').invalidateSettingsCache();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
