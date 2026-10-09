const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../db');

// BTCPay webhook - must use raw body for signature verification
router.post('/webhook', async (req, res) => {
  const sig = req.headers['btcpay-sig'];
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('BTCPay webhook rejected: BTCPAY_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  if (!sig) {
    console.warn('BTCPay webhook rejected: missing BTCPay-Sig header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn('BTCPay webhook signature mismatch');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  console.log('BTCPay webhook:', event.type, event.invoiceId);

  try {
    if (event.type === 'InvoiceSettled' || event.type === 'InvoicePaymentSettled') {
      const invoiceId = event.invoiceId;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Claim the pending transaction atomically so BTCPay webhook retries
        // cannot credit the same invoice more than once.
        const txRes = await client.query(
          `UPDATE transactions SET status='confirmed', updated_at=NOW()
           WHERE btcpay_invoice_id=$1 AND type='deposit' AND status='pending'
           RETURNING id, user_id, amount`,
          [invoiceId]
        );
        const tx = txRes.rows[0];
        if (tx) {
          await client.query('UPDATE users SET balance_btc=balance_btc+$1 WHERE id=$2', [tx.amount, tx.user_id]);
          console.log(`Deposit confirmed: user=${tx.user_id} amount=${tx.amount} BTC`);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }

    if (event.type === 'InvoiceExpired' || event.type === 'InvoiceInvalid') {
      await pool.query(`UPDATE transactions SET status='expired', updated_at=NOW() WHERE btcpay_invoice_id=$1 AND type='deposit' AND status='pending'`, [event.invoiceId]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
