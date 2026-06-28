const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@heisenberg.poker',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM user_preferences WHERE user_id=$1`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      await pool.query(`INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [req.user.id]);
      return res.json({ preferences: { avatar: '🃏', four_color_deck: false, sound_enabled: true, sound_volume: 80, deposit_limit_btc: null, session_limit_minutes: null } });
    }
    const p = result.rows[0];
    res.json({ preferences: {
      avatar: p.avatar,
      four_color_deck: p.four_color_deck,
      sound_enabled: p.sound_enabled,
      sound_volume: p.sound_volume,
      deposit_limit_btc: p.deposit_limit_btc,
      session_limit_minutes: p.session_limit_minutes,
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', async (req, res) => {
  const { avatar, four_color_deck, sound_enabled, sound_volume, deposit_limit_btc, session_limit_minutes } = req.body;
  try {
    await pool.query(`
      INSERT INTO user_preferences(user_id, avatar, four_color_deck, sound_enabled, sound_volume, deposit_limit_btc, session_limit_minutes, updated_at)
      VALUES($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        avatar = COALESCE($2, user_preferences.avatar),
        four_color_deck = COALESCE($3, user_preferences.four_color_deck),
        sound_enabled = COALESCE($4, user_preferences.sound_enabled),
        sound_volume = COALESCE($5, user_preferences.sound_volume),
        deposit_limit_btc = $6,
        session_limit_minutes = $7,
        updated_at = NOW()
    `, [req.user.id, avatar, four_color_deck, sound_enabled, sound_volume, deposit_limit_btc || null, session_limit_minutes || null]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Web Push subscription management
router.post('/push-subscribe', async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: 'Subscription required' });
  try {
    await pool.query(`
      INSERT INTO user_preferences(user_id, push_subscription, updated_at) VALUES($1,$2,NOW())
      ON CONFLICT (user_id) DO UPDATE SET push_subscription=$2, updated_at=NOW()
    `, [req.user.id, JSON.stringify(subscription)]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/push-subscribe', async (req, res) => {
  try {
    await pool.query(`UPDATE user_preferences SET push_subscription=NULL WHERE user_id=$1`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// Internal helper used by socket to push notifications
async function sendPushToUser(userId, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  try {
    const result = await pool.query(`SELECT push_subscription FROM user_preferences WHERE user_id=$1`, [userId]);
    const sub = result.rows[0]?.push_subscription;
    if (!sub) return;
    await webpush.sendNotification(typeof sub === 'string' ? JSON.parse(sub) : sub, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410) {
      await pool.query(`UPDATE user_preferences SET push_subscription=NULL WHERE user_id=$1`, [userId]);
    }
  }
}

module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
