const router = require('express').Router();
const axios = require('axios');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { getBtcUsd } = require('./prices');

const BTCPAY_HOST = () => process.env.BTCPAY_HOST;
const BTCPAY_STORE = () => process.env.BTCPAY_STORE_ID;
const BTCPAY_KEY = () => process.env.BTCPAY_API_KEY;

function btcpayHeaders() {
  return { Authorization: `token ${BTCPAY_KEY()}`, 'Content-Type': 'application/json' };
}

// Create deposit invoice (amount in USD)
router.post('/deposit', authenticate, async (req, res) => {
  const { amountUsd } = req.body;
  if (!amountUsd || isNaN(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (amountUsd < 5) return res.status(400).json({ error: 'Minimum deposit: $5' });

  try {
    const btcPrice = await getBtcUsd();
    if (!btcPrice) return res.status(503).json({ error: 'BTC price unavailable' });

    const btcAmount = amountUsd / btcPrice;
    const sats = Math.round(btcAmount * 1e8);

    const response = await axios.post(
      `${BTCPAY_HOST()}/api/v1/stores/${BTCPAY_STORE()}/invoices`,
      {
        amount: sats.toString(),
        currency: 'SATS',
        metadata: { userId: req.user.id, username: req.user.username, type: 'deposit', usdAmount: amountUsd },
        checkout: {
          redirectURL: `${process.env.SITE_URL}/wallet?deposited=1`,
          redirectAutomatically: true,
          expirationMinutes: 60,
        }
      },
      { headers: btcpayHeaders() }
    );

    const invoice = response.data;

    await pool.query(
      `INSERT INTO transactions(user_id, type, amount, btcpay_invoice_id, status) VALUES($1,'deposit',$2,$3,'pending')`,
      [req.user.id, btcAmount, invoice.id]
    );

    res.json({
      invoiceId: invoice.id,
      checkoutUrl: invoice.checkoutLink,
      amountUsd: parseFloat(amountUsd).toFixed(2),
      amountBtc: btcAmount,
      btcPrice,
      expiresAt: invoice.expirationTime,
    });
  } catch (err) {
    console.error('Deposit error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// Initiate withdrawal (amount in USD)
router.post('/withdraw', authenticate, async (req, res) => {
  const { amountUsd, address } = req.body;
  if (!amountUsd || !address) return res.status(400).json({ error: 'Amount and BTC address required' });
  if (parseFloat(amountUsd) < 5) return res.status(400).json({ error: 'Minimum withdrawal: $5' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const btcPrice = await getBtcUsd();
    if (!btcPrice) { await client.query('ROLLBACK'); return res.status(503).json({ error: 'BTC price unavailable' }); }

    const btcAmount = parseFloat(amountUsd) / btcPrice;

    const userRes = await client.query('SELECT balance_btc FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    const bal = parseFloat(userRes.rows[0].balance_btc);
    if (bal < btcAmount) {
      await client.query('ROLLBACK');
      const haveUsd = (bal * btcPrice).toFixed(2);
      return res.status(400).json({ error: `Insufficient balance. You have $${haveUsd}` });
    }

    await client.query('UPDATE users SET balance_btc=balance_btc-$1 WHERE id=$2', [btcAmount, req.user.id]);

    const payoutRes = await axios.post(
      `${BTCPAY_HOST()}/api/v1/stores/${BTCPAY_STORE()}/payouts`,
      { destination: address, amount: btcAmount.toString(), paymentMethod: 'BTC' },
      { headers: btcpayHeaders() }
    );

    const payout = payoutRes.data;
    await client.query(
      `INSERT INTO transactions(user_id,type,amount,btcpay_invoice_id,status,metadata) VALUES($1,'withdrawal',$2,$3,'pending',$4)`,
      [req.user.id, btcAmount, payout.id, JSON.stringify({ address, payoutId: payout.id, usdAmount: amountUsd })]
    );

    await client.query('COMMIT');
    res.json({ ok: true, payoutId: payout.id, amountUsd, amountBtc: btcAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Withdraw error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Withdrawal failed' });
  } finally {
    client.release();
  }
});

// Get user balance and transaction history (with USD values)
router.get('/balance', authenticate, async (req, res) => {
  try {
    const [userRes, txRes, priceRes] = await Promise.all([
      pool.query('SELECT balance_btc, balance_play FROM users WHERE id=$1', [req.user.id]),
      pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
      getBtcUsd().catch(() => null),
    ]);
    const u = userRes.rows[0];
    const btcPrice = priceRes;
    res.json({
      balanceBtc: parseFloat(u.balance_btc),
      balancePlay: parseFloat(u.balance_play),
      balanceUsd: btcPrice ? parseFloat((parseFloat(u.balance_btc) * btcPrice).toFixed(2)) : null,
      btcPrice,
      transactions: txRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
