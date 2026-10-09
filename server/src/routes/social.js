const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Friends ─────────────────────────────────────────────────────────────────

router.get('/friends', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, p.avatar, f.status, f.created_at,
        CASE WHEN f.user_id=$1 THEN 'sent' ELSE 'received' END AS direction
      FROM friends f
      JOIN users u ON u.id = CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END
      LEFT JOIN user_preferences p ON p.user_id=u.id
      WHERE (f.user_id=$1 OR f.friend_id=$1) AND f.status != 'blocked'
      ORDER BY f.status DESC, f.created_at DESC
    `, [req.user.id]);

    const friends = result.rows.filter(r => r.status === 'accepted');
    const requests = result.rows.filter(r => r.status === 'pending' && r.direction === 'received');
    const sent = result.rows.filter(r => r.status === 'pending' && r.direction === 'sent');
    res.json({ friends, requests, sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/friends/:username', async (req, res) => {
  try {
    const target = await pool.query(
      `SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND NOT is_admin AND username!='_ai_'`,
      [req.params.username]
    );
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const friendId = target.rows[0].id;
    if (friendId === req.user.id) return res.status(400).json({ error: 'Cannot friend yourself' });

    const existing = await pool.query(
      `SELECT id, status FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`,
      [req.user.id, friendId]
    );
    if (existing.rows[0]) return res.status(409).json({ error: 'Friend request already exists', status: existing.rows[0].status });

    await pool.query(`INSERT INTO friends(user_id, friend_id) VALUES($1,$2)`, [req.user.id, friendId]);
    res.json({ ok: true, message: 'Friend request sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/friends/:username/accept', async (req, res) => {
  try {
    const target = await pool.query(`SELECT id FROM users WHERE LOWER(username)=LOWER($1)`, [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const result = await pool.query(
      `UPDATE friends SET status='accepted' WHERE user_id=$1 AND friend_id=$2 AND status='pending' RETURNING id`,
      [target.rows[0].id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No pending request found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/friends/:username', async (req, res) => {
  try {
    const target = await pool.query(`SELECT id FROM users WHERE LOWER(username)=LOWER($1)`, [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    await pool.query(
      `DELETE FROM friends WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)`,
      [req.user.id, target.rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Challenge a friend: create play table and notify them via socket
router.post('/friends/:username/challenge', async (req, res) => {
  try {
    const target = await pool.query(`SELECT id, username FROM users WHERE LOWER(username)=LOWER($1)`, [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const friendship = await pool.query(
      `SELECT id FROM friends WHERE status='accepted' AND ((user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)) LIMIT 1`,
      [req.user.id, target.rows[0].id]
    );
    if (!friendship.rows[0]) return res.status(403).json({ error: 'You can only challenge an accepted friend' });

    const t = await pool.query(
      `INSERT INTO tournaments(tier,entry_fee,rake,prize_pool,status,player1_id,player2_id,is_ai,started_at)
       VALUES('play',0,0,0,'active',$1,$2,false,NOW()) RETURNING id`,
      [req.user.id, target.rows[0].id]
    );
    await pool.query(
      `INSERT INTO game_state(tournament_id,blind_start_time) VALUES($1,NOW())`,
      [t.rows[0].id]
    );

    const io = req.app.get('io');
    if (io) {
      const targetSocket = [...io.sockets.sockets.values()].find(socket => socket.username === target.rows[0].username);
      if (targetSocket) targetSocket.emit('friendChallenge', {
        from: req.user.username,
        tournamentId: t.rows[0].id,
      });
    }

    res.json({ tournamentId: t.rows[0].id, challengedUser: target.rows[0].username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Player Notes ─────────────────────────────────────────────────────────────

router.get('/notes/:username', async (req, res) => {
  try {
    const target = await pool.query(`SELECT id FROM users WHERE LOWER(username)=LOWER($1)`, [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    const result = await pool.query(
      `SELECT note, updated_at FROM player_notes WHERE author_id=$1 AND target_id=$2`,
      [req.user.id, target.rows[0].id]
    );
    res.json({ note: result.rows[0]?.note || '', updated_at: result.rows[0]?.updated_at || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notes/:username', async (req, res) => {
  const { note } = req.body;
  if (typeof note !== 'string') return res.status(400).json({ error: 'Note required' });
  const clean = note.trim().slice(0, 500);
  try {
    const target = await pool.query(`SELECT id FROM users WHERE LOWER(username)=LOWER($1)`, [req.params.username]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });

    if (!clean) {
      await pool.query(`DELETE FROM player_notes WHERE author_id=$1 AND target_id=$2`, [req.user.id, target.rows[0].id]);
    } else {
      await pool.query(
        `INSERT INTO player_notes(author_id, target_id, note) VALUES($1,$2,$3)
         ON CONFLICT (author_id, target_id) DO UPDATE SET note=$3, updated_at=NOW()`,
        [req.user.id, target.rows[0].id, clean]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Lobby Chat ───────────────────────────────────────────────────────────────

router.get('/lobby-chat', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lc.id, lc.username, lc.message, lc.created_at,
        COALESCE(p.avatar, '🃏') AS avatar
       FROM lobby_chat lc
       LEFT JOIN users u ON u.username=lc.username
       LEFT JOIN user_preferences p ON p.user_id=u.id
       ORDER BY lc.created_at DESC LIMIT 60`
    );
    res.json({ messages: result.rows.reverse() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
