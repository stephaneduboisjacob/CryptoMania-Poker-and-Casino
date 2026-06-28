const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users(username, password_hash) VALUES($1,$2) RETURNING id, username, is_admin, balance_btc, balance_play',
      [username, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user: { id: user.id, username: user.username, isAdmin: user.is_admin, balanceBtc: user.balance_btc, balancePlay: user.balance_play }, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await pool.query('UPDATE users SET last_seen=NOW() WHERE id=$1', [user.id]);

    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: user.is_admin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user: { id: user.id, username: user.username, isAdmin: user.is_admin, balanceBtc: parseFloat(user.balance_btc), balancePlay: parseFloat(user.balance_play) }, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, username, is_admin, balance_btc, balance_play FROM users WHERE id=$1', [decoded.id]);
    const user = result.rows[0];
    if (!user) return res.json({ user: null });
    res.json({ user: { id: user.id, username: user.username, isAdmin: user.is_admin, balanceBtc: parseFloat(user.balance_btc), balancePlay: parseFloat(user.balance_play) } });
  } catch {
    res.json({ user: null });
  }
});

module.exports = router;
