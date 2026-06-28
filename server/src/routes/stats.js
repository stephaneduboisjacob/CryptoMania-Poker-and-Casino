const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { getBtcUsd } = require('./prices');

// Public leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.username, u.created_at,
        COALESCE(ts.games,0)::int AS games,
        COALESCE(ts.wins,0)::int AS wins,
        COALESCE(xs.total_winnings,0)::float AS total_winnings,
        (COALESCE(xs.total_entry,0)-COALESCE(xs.total_refunds,0))::float AS total_entry
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS games,COUNT(*) FILTER (WHERE winner_id=u.id) AS wins
        FROM tournaments
        WHERE status='completed' AND NOT is_ai AND (player1_id=u.id OR player2_id=u.id)
      ) ts ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          SUM(amount) FILTER (WHERE type='winnings' AND status='confirmed') AS total_winnings,
          SUM(amount) FILTER (WHERE type='entry_fee' AND status='confirmed') AS total_entry,
          SUM(amount) FILTER (WHERE type='refund' AND status='confirmed') AS total_refunds
        FROM transactions WHERE user_id=u.id
      ) xs ON TRUE
      WHERE NOT u.is_admin AND u.username != '_ai_'
        AND COALESCE(ts.games,0) > 0
      ORDER BY wins DESC, total_winnings DESC
      LIMIT 50
    `);
    const btcPrice = await getBtcUsd().catch(() => null);
    res.json({
      btcPrice,
      leaderboard: result.rows.map((r, i) => ({
        rank: i + 1,
        ...r,
        winRate: r.games > 0 ? ((r.wins / r.games) * 100).toFixed(1) : '0.0',
        profit: (parseFloat(r.total_winnings) - parseFloat(r.total_entry)).toFixed(8),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function buildProfile(username, res) {
  const uRes = await pool.query(
    `SELECT id, username, created_at FROM users WHERE username=$1 AND NOT is_admin AND username!='_ai_'`,
    [username]
  );
  if (!uRes.rows[0]) return res.status(404).json({ error: 'Player not found' });
  const u = uRes.rows[0];

  const [stats, recent] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(ts.games,0)::int AS games,COALESCE(ts.wins,0)::int AS wins,
        COALESCE(ts.ai_wins,0)::int AS ai_wins,COALESCE(ts.ai_games,0)::int AS ai_games,
        COALESCE(xs.winnings,0)::float AS winnings,
        (COALESCE(xs.entry_fees,0)-COALESCE(xs.refunds,0))::float AS spent,
        COALESCE(hs.biggest_pot,0)::int AS biggest_pot,COALESCE(hs.hands_played,0)::int AS hands_played
      FROM users u
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE status='completed' AND NOT is_ai) AS games,
          COUNT(*) FILTER (WHERE status='completed' AND NOT is_ai AND winner_id=$1) AS wins,
          COUNT(*) FILTER (WHERE status='completed' AND is_ai) AS ai_games,
          COUNT(*) FILTER (WHERE status='completed' AND is_ai AND winner_id=$1) AS ai_wins
        FROM tournaments WHERE player1_id=$1 OR player2_id=$1
      ) ts ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          SUM(amount) FILTER (WHERE type='winnings' AND status='confirmed') AS winnings,
          SUM(amount) FILTER (WHERE type='entry_fee' AND status='confirmed') AS entry_fees,
          SUM(amount) FILTER (WHERE type='refund' AND status='confirmed') AS refunds
        FROM transactions WHERE user_id=$1
      ) xs ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(hh.pot) FILTER (WHERE hh.winner_id=$1) AS biggest_pot,COUNT(*) AS hands_played
        FROM hand_history hh JOIN tournaments t ON t.id=hh.tournament_id
        WHERE t.player1_id=$1 OR t.player2_id=$1
      ) hs ON TRUE
      WHERE u.id=$1
    `, [u.id]),

    pool.query(`
      SELECT t.id, t.tier, t.status, t.created_at, t.ended_at,
        CASE WHEN t.winner_id=$1 THEN true ELSE false END AS won,
        t.prize_pool, t.is_ai,
        u2.username AS opponent
      FROM tournaments t
      LEFT JOIN users u2 ON u2.id = CASE WHEN t.player1_id=$1 THEN t.player2_id ELSE t.player1_id END
      WHERE (t.player1_id=$1 OR t.player2_id=$1) AND t.status='completed'
      ORDER BY t.ended_at DESC LIMIT 15
    `, [u.id]),
  ]);

  const s = stats.rows[0];
  const btcPrice = await getBtcUsd().catch(() => null);
  const profitBtc = parseFloat(s.winnings) - parseFloat(s.spent);
  res.json({
    btcPrice,
    profile: {
      username: u.username,
      memberSince: u.created_at,
      games: s.games, wins: s.wins,
      losses: s.games - s.wins,
      winRate: s.games > 0 ? ((s.wins / s.games) * 100).toFixed(1) : '0.0',
      winnings: parseFloat(s.winnings), spent: parseFloat(s.spent),
      profit: profitBtc.toFixed(8),
      profitUsd: btcPrice ? (profitBtc * btcPrice).toFixed(2) : null,
      biggestPot: s.biggest_pot,
      handsPlayed: s.hands_played,
      aiGames: s.ai_games, aiWins: s.ai_wins,
    },
    recentGames: recent.rows,
  });
}

// Player profile (public)
router.get('/profile/:username', async (req, res) => {
  try { await buildProfile(req.params.username, res); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Authenticated user's own profile
router.get('/me', authenticate, async (req, res) => {
  try { await buildProfile(req.user.username, res); }
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Error handler for this router
router.use((err, req, res, next) => {
  console.error('Stats route error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = router;
