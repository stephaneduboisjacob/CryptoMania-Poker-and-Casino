const router = require('express').Router();
const axios = require('axios');

let _cached = null;
let _cacheTime = 0;

async function getBtcUsd() {
  if (_cached && Date.now() - _cacheTime < 60000) return _cached;
  try {
    const res = await axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot', { timeout: 5000 });
    _cached = parseFloat(res.data.data.amount);
    _cacheTime = Date.now();
    return _cached;
  } catch {
    return _cached || null;
  }
}

router.get('/btc-usd', async (req, res) => {
  const price = await getBtcUsd();
  if (!price) return res.status(503).json({ error: 'Price unavailable' });
  res.json({ usd: price, cachedAt: new Date(_cacheTime).toISOString() });
});

module.exports = router;
module.exports.getBtcUsd = getBtcUsd;
