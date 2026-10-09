const test = require('node:test');
const assert = require('node:assert/strict');

test('video poker draw retries replay the saved result without a second credit', async () => {
  const pool = require('../src/db');
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const row = {
    id: 'vp-retry', game: 'videopoker', table_id: 'videopoker', currency: 'play', status: 'open',
    bets: [{ userId: 7, username: 'tester', amount: 10, deal: ['Js', 'Jd', '2c', '5s', '9h'], deck: [] }],
    results: null,
  };
  let credits = 0;
  const client = {
    async query(sql, params = []) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql === 'SELECT * FROM house_rounds WHERE id=$1 FOR UPDATE') return { rows: [row] };
      if (sql.startsWith("UPDATE house_rounds SET status='settled'")) {
        row.status = 'settled';
        row.results = JSON.parse(params[1]);
        return { rows: [] };
      }
      throw new Error(`Unexpected test SQL: ${sql}`);
    },
    release() {},
  };
  pool.connect = async () => client;
  pool.query = async () => ({ rows: [] });

  try {
    const router = require('../src/house/routes')({
      async getPrice() { return null; },
      async credit() { credits++; },
      async recordTx() {},
      io: { emit() {} },
    });
    const layer = router.stack.find(item => item.route?.path === '/vp/:machineId/draw');
    assert.ok(layer, 'missing video poker draw route');
    const handler = layer.route.stack.at(-1).handle;
    const call = async () => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await handler({
        params: { machineId: 'videopoker' },
        body: { roundId: row.id, hold: [0, 1, 2, 3, 4] },
        user: { id: 7, username: 'tester' },
      }, res);
      return res;
    };

    const first = await call();
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.result, 'jacks');
    assert.equal(first.body.payout, 10);
    assert.equal(credits, 1);

    const retry = await call();
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.replayed, true);
    assert.deepEqual(retry.body.finalCards, first.body.finalCards);
    assert.equal(retry.body.payout, first.body.payout);
    assert.equal(credits, 1);
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});
