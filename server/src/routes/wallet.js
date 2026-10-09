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
  const amountUsd = Number(req.body?.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (amountUsd < 5) return res.status(400).json({ error: 'Minimum deposit: $5' });

  let client;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    const btcPrice = await getBtcUsd();
    if (!btcPrice) return res.status(503).json({ error: 'BTC price unavailable' });

    const sats = Math.round((amountUsd / btcPrice) * 1e8);
    const btcAmount = sats / 1e8;
    if (!Number.isSafeInteger(sats) || sats <= 0) return res.status(400).json({ error: 'Deposit amount is outside the supported range' });

    // Serialize invoice creation per account so concurrent requests reserve
    // pending deposits against the same daily responsible-play limit.
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);

    const preferences = await client.query(
      `SELECT deposit_limit_btc FROM user_preferences WHERE user_id=$1`,
      [req.user.id]
    );
    const dailyLimit = Number(preferences.rows[0]?.deposit_limit_btc);
    if (Number.isFinite(dailyLimit) && dailyLimit > 0) {
      const usage = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS used
         FROM transactions
         WHERE user_id=$1 AND type='deposit' AND status IN ('pending', 'confirmed')
           AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`,
        [req.user.id]
      );
      const used = Number(usage.rows[0]?.used || 0);
      if (used + btcAmount > dailyLimit + 0.000000005) {
        const remaining = Math.max(0, dailyLimit - used);
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(400).json({
          error: `Daily deposit limit reached. Remaining today: ${remaining.toFixed(8)} BTC.`,
        });
      }
    }

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

    await client.query(
      `INSERT INTO transactions(user_id, type, amount, btcpay_invoice_id, status) VALUES($1,'deposit',$2,$3,'pending')`,
      [req.user.id, btcAmount, invoice.id]
    );

    await client.query('COMMIT');
    transactionOpen = false;

    res.json({
      invoiceId: invoice.id,
      checkoutUrl: invoice.checkoutLink,
      amountUsd: parseFloat(amountUsd).toFixed(2),
      amountBtc: btcAmount,
      btcPrice,
      expiresAt: invoice.expirationTime,
    });
  } catch (err) {
    if (transactionOpen && client) await client.query('ROLLBACK').catch(() => {});
    console.error('Deposit error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create invoice' });
  } finally {
    if (client) client.release();
  }
});

// Native clients use this endpoint to show the invoice payment instructions
// without opening the hosted checkout page. Invoice IDs are scoped to the
// signed-in account before the BTCPay API key is used.
router.get('/deposit/:invoiceId', authenticate, async (req, res) => {
  const invoiceId = String(req.params.invoiceId || '');
  if (!/^[A-Za-z0-9-]{1,100}$/.test(invoiceId)) return res.status(400).json({ error: 'Invalid invoice id' });
  try {
    const owned = await pool.query(
      `SELECT 1 FROM transactions WHERE user_id=$1 AND type='deposit' AND btcpay_invoice_id=$2 LIMIT 1`,
      [req.user.id, invoiceId]
    );
    if (!owned.rows[0]) return res.status(404).json({ error: 'Invoice not found' });

    const headers = btcpayHeaders();
    const [invoiceResponse, methodsResponse] = await Promise.all([
      axios.get(`${BTCPAY_HOST()}/api/v1/stores/${BTCPAY_STORE()}/invoices/${encodeURIComponent(invoiceId)}`, { headers }),
      axios.get(`${BTCPAY_HOST()}/api/v1/invoices/${encodeURIComponent(invoiceId)}/payment-methods`, { headers }),
    ]);
    const invoice = invoiceResponse.data || {};
    const methods = Array.isArray(methodsResponse.data) ? methodsResponse.data : (methodsResponse.data?.paymentMethods || []);
    res.json({
      invoiceId,
      status: invoice.status || 'New',
      amount: invoice.amount || null,
      currency: invoice.currency || 'USD',
      expiresAt: invoice.expirationTime || invoice.expiresAt || null,
      paymentMethods: methods.map(method => ({
        paymentMethodId: method.paymentMethodId || method.id || '',
        destination: method.destination || method.address || null,
        paymentLink: method.paymentLink || method.BOLT11 || method.paymentRequest || null,
        rate: method.rate || null,
        due: method.due || method.totalDue || null,
        paid: method.paid || null,
        cryptoCode: method.cryptoCode || (method.paymentMethodId || '').split('-')[0] || null,
      })),
    });
  } catch (err) {
    console.error('Deposit details error:', err.response?.data || err.message);
    res.status(502).json({ error: 'Could not load payment instructions' });
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
