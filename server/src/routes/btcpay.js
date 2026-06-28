const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../db');

// BTCPay webhook - must use raw body for signature verification
router.post('/webhook', async (req, res) => {
  const sig = req.headers['btcpay-sig1'];
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;

  if (sig && secret) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    if (sig !== expected) {
      console.warn('BTCPay webhook signature mismatch');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = req.body;
  console.log('BTCPay webhook:', event.type, event.invoiceId);

  try {
    if (event.type === 'InvoiceSettled' || event.type === 'InvoicePaymentSettled') {
      const invoiceId = event.invoiceId;

      // Find pending deposit transaction
      const txRes = await pool.query(
        `SELECT * FROM transactions WHERE btcpay_invoice_id=$1 AND type='deposit' AND status='pending'`,
        [invoiceId]
      );
      if (!txRes.rows[0]) return res.json({ ok: true });

      const tx = txRes.rows[0];

      // Credit user balance
      await pool.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [tx.amount, tx.user_id]);
      await pool.query(`UPDATE transactions SET status='confirmed', updated_at=NOW() WHERE id=$1`, [tx.id]);

      console.log(`Deposit confirmed: user=${tx.user_id} amount=${tx.amount} BTC`);
    }

    if (event.type === 'InvoiceExpired' || event.type === 'InvoiceInvalid') {
      await pool.query(`UPDATE transactions SET status='expired', updated_at=NOW() WHERE btcpay_invoice_id=$1`, [event.invoiceId]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
