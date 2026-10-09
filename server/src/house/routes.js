// House games REST: /api/house/*
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { randomUUID } = require('crypto');
const nodeCrypto = require('crypto');
const {
  SLOT_MACHINES, spinSlots, playDice, playPlinko, vpDeal, vpEvaluate, VP_PAYTABLE, minesMultiplier,
} = require('./instant');
const { createSeedPair, floatStream } = require('./fair');
const GAME_LABELS = {
  slots: 'Slots', dice: 'Dice', plinko: 'Plinko', videopoker: 'Video Poker',
  blackjack: 'Blackjack', roulette: 'Roulette', baccarat: 'Baccarat',
};

// Instant machine registry: id -> config (chips = play chips, or USD cents for btc)
const INSTANT_MACHINES = {
  'dice': { game: 'dice', currency: 'play', min: 1, max: 100000, label: 'Dice' },
  'dice-btc': { game: 'dice', currency: 'btc', min: 10, max: 100000, label: 'Dice' },
  'plinko': { game: 'plinko', currency: 'play', min: 1, max: 10000, label: 'Plinko' },
  'plinko-btc': { game: 'plinko', currency: 'btc', min: 10, max: 100000, label: 'Plinko' },
  'videopoker': { game: 'videopoker', currency: 'play', min: 1, max: 5000, label: 'Jacks or Better 8/5' },
  'videopoker-btc': { game: 'videopoker', currency: 'btc', min: 10, max: 50000, label: 'Jacks or Better 8/5' },
};
// Every slot machine gets a play + BTC variant automatically
for (const [mid, m] of Object.entries(SLOT_MACHINES)) {
  INSTANT_MACHINES[`slots-${mid}`] = { game: 'slots', machine: mid, currency: 'play', min: 1, max: 5000, label: m.name };
  INSTANT_MACHINES[`slots-${mid}-btc`] = { game: 'slots', machine: mid, currency: 'btc', min: 10, max: 5000, label: m.name };
}

// ─── Provably fair seed management ───

async function getOrCreateSeeds(userId) {
  let rows = await pool.query(`SELECT * FROM fair_seeds WHERE user_id=$1`, [userId]);
  if (!rows.rows[0]) {
    const { serverSeed, serverSeedHash } = createSeedPair();
    const clientSeed = nodeCrypto.randomBytes(8).toString('hex');
    await pool.query(
      `INSERT INTO fair_seeds(user_id, server_seed, server_seed_hash, client_seed) VALUES($1,$2,$3,$4)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, serverSeed, serverSeedHash, clientSeed]
    );
    rows = await pool.query(`SELECT * FROM fair_seeds WHERE user_id=$1`, [userId]);
  }
  return rows.rows[0];
}

// Consume one nonce and return an unbiased rng() bound to the seed triplet.
// Atomic upsert: creates the committed seed pair on a player's first bet,
// increments the nonce on every bet after that. Race-free, self-sufficient.
async function nextFairRng(client, userId) {
  const { serverSeed, serverSeedHash } = createSeedPair();
  const r = await client.query(
    `INSERT INTO fair_seeds(user_id, server_seed, server_seed_hash, client_seed, nonce)
     VALUES($1, $2, $3, $4, 1)
     ON CONFLICT (user_id) DO UPDATE SET nonce = fair_seeds.nonce + 1
     RETURNING server_seed, server_seed_hash, client_seed, nonce`,
    [userId, serverSeed, serverSeedHash, nodeCrypto.randomBytes(8).toString('hex')]
  );
  const { server_seed, server_seed_hash, client_seed, nonce } = r.rows[0];
  const nextFloat = floatStream(server_seed, client_seed, nonce - 1);
  return { rng: nextFloat, serverSeedHash: server_seed_hash, clientSeed: client_seed, nonce: nonce - 1 };
}

function emitBigWin(io, username, game, payout, multiplier, currency) {
  const threshold = currency === 'btc' ? 5 : 500;
  if (multiplier >= 10 || payout >= threshold) {
    io.emit('casinoWin', { username, game, payout, multiplier, currency, at: Date.now() });
  }
}

module.exports = (houseManager) => {
  const router = express.Router();
  router.get('/tables', authenticate, async (req, res) => {
    try {
      res.json({
        tables: houseManager.tablesList(),
        instant: Object.entries(INSTANT_MACHINES).map(([id, m]) => ({
          id, game: m.game, machine: m.machine || null, label: m.label, currency: m.currency, min: m.min, max: m.max,
          rtp: m.game === 'slots' ? SLOT_MACHINES[m.machine].targetRtp : null,
          reelCount: m.game === 'slots' ? (SLOT_MACHINES[m.machine].reels || 3) : null,
          reelSymbols: m.game === 'slots' ? SLOT_MACHINES[m.machine].symbols : null,
        })),
      });
    } catch (err) {
      console.error('house/tables error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Instant play: atomic debit→RNG→credit→ledger in ONE transaction ───
  router.post('/play/:machineId', authenticate, async (req, res) => {
    const cfg = INSTANT_MACHINES[req.params.machineId];
    if (!cfg || cfg.game === 'videopoker') return res.status(404).json({ error: 'Unknown machine' });
    const bet = Math.floor(Number(req.body?.bet) || 0);
    if (bet < cfg.min) return res.status(400).json({ error: `Minimum bet ${cfg.min.toLocaleString()}` });
    if (bet > cfg.max) return res.status(400).json({ error: `Maximum bet ${cfg.max.toLocaleString()}` });

    // Outcome decided inside the tx — no crash window on money
    let outcome = null, fairness = null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fair = await nextFairRng(client, req.user.id);
      if (cfg.game === 'slots') outcome = spinSlots(cfg.machine, fair.rng);
      else if (cfg.game === 'dice') outcome = playDice(req.body?.params?.target, req.body?.params?.direction, fair.rng);
      else if (cfg.game === 'plinko') outcome = playPlinko(req.body?.params?.risk, fair.rng);
      fairness = fair;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      console.error('[fair] instant fairness error:', err.message);
      return res.status(500).json({ error: 'Fairness error' });
    }
    client.release();
    if (!outcome || outcome.error) return res.status(400).json({ error: outcome?.error || 'Invalid play' });
    const payout = Math.floor(bet * (outcome.pay ?? outcome.multiplier ?? 0) * (outcome.win === false ? 0 : 1));

    const price = cfg.currency === 'btc' ? await houseManager.getPrice() : null;
    if (cfg.currency === 'btc' && !price) return res.status(503).json({ error: 'BTC price unavailable' });

    const moneyClient = await pool.connect();
    try {
      await moneyClient.query('BEGIN');
      const moved = await houseManager.debit(moneyClient, req.user.id, cfg.currency, bet, price);
      if (!moved) { await moneyClient.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
      await houseManager.recordTx(moneyClient, req.user.id, 'entry_fee', cfg.currency, bet,
        { house: cfg.game, machine: req.params.machineId }, price);
      if (payout > 0) {
        await houseManager.credit(moneyClient, req.user.id, cfg.currency, payout, price);
        await houseManager.recordTx(moneyClient, req.user.id, 'winnings', cfg.currency, payout,
          { house: cfg.game, machine: req.params.machineId }, price);
      }
      // Progressive jackpot (play slots only): 1.5% of bet feeds 3 pools;
      // drop odds = 60% of contribution/pool → house retains 40% of the feed.
      let jackpotWin = null;
      if (cfg.game === 'slots' && cfg.currency === 'play') {
        const contribution = Math.floor(bet * 0.015);
        if (contribution > 0) {
          for (const [tier, share] of [['mega', 0.6], ['major', 0.3], ['mini', 0.1]]) {
            const c = Math.floor(contribution * share);
            if (c <= 0) continue;
            const up = await moneyClient.query(
              `UPDATE jackpots SET pool = pool + $2 WHERE tier = $1 RETURNING pool, seed`,
              [tier, c]
            );
            const pool = parseFloat(up.rows[0].pool);
            const dropChance = (0.6 * c) / Math.max(pool - c, 1);
            if (Math.random() < dropChance && payout < pool) {
              // JACKPOT! credit the whole pool, reset to seed
              const won = pool;
              const seed = parseFloat(up.rows[0].seed);
              await moneyClient.query(
                `UPDATE jackpots SET pool=$2, last_winner_user_id=$3, last_winner_username=$4, last_win_amount=$5, last_won_at=NOW() WHERE tier=$1`,
                [tier, seed, req.user.id, req.user.username, won]
              );
              await houseManager.credit(moneyClient, req.user.id, 'play', won, price);
              await houseManager.recordTx(moneyClient, req.user.id, 'winnings', 'play', won,
                { house: 'jackpot', tier, machine: req.params.machineId }, price);
              jackpotWin = { tier, amount: won };
            }
          }
        }
      }
      const ledgerId = randomUUID();
      await moneyClient.query(
        `INSERT INTO house_rounds(id, game, table_id, currency, bets, results, status, settled_at)
         VALUES($1,$2,$3,$4,$5,$6,'settled',NOW())`,
        [ledgerId, cfg.game, req.params.machineId, cfg.currency,
         JSON.stringify([{ userId: req.user.id, username: req.user.username, amount: bet, btc: moved.btc || null }]),
         JSON.stringify({ outcome, bet, payout, jackpotWin, fair: { serverSeedHash: fairness.serverSeedHash, clientSeed: fairness.clientSeed, nonce: fairness.nonce } })]
      );
      await moneyClient.query('COMMIT');
      if (payout > 0) emitBigWin(houseManager.io, req.user.username, cfg.label || cfg.game, payout, payout / bet, cfg.currency);
      if (jackpotWin) {
        houseManager.io.emit('jackpotWon', { username: req.user.username, tier: jackpotWin.tier, amount: jackpotWin.amount, game: cfg.label, at: Date.now() });
        emitBigWin(houseManager.io, req.user.username, jackpotWin.tier.toUpperCase() + ' JACKPOT', jackpotWin.amount, 99, 'play');
      }
      res.json({ ...outcome, bet, payout, net: payout - bet, currency: cfg.currency, fair: { serverSeedHash: fairness.serverSeedHash, clientSeed: fairness.clientSeed, nonce: fairness.nonce }, roundId: ledgerId, jackpotWin });
    } catch (err) {
      await moneyClient.query('ROLLBACK').catch(() => {});
      console.error('instant play error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      moneyClient.release();
    }
  });

  // ─── Video Poker: deal (debit+persist) then draw (evaluate+credit) ───
  router.get('/vp/:machineId/current', authenticate, async (req, res) => {
    const cfg = INSTANT_MACHINES[req.params.machineId];
    if (!cfg || cfg.game !== 'videopoker') return res.status(404).json({ error: 'Unknown machine' });
    try {
      const rows = await pool.query(
        `SELECT id, bets FROM house_rounds
         WHERE game='videopoker' AND table_id=$1 AND status='open'
           AND bets->0->>'userId'=$2
         ORDER BY created_at DESC LIMIT 1`,
        [req.params.machineId, String(req.user.id)]
      );
      const row = rows.rows[0];
      const entry = row?.bets?.[0];
      res.json({ round: row && entry ? {
        roundId: row.id, hand: entry.deal, bet: entry.amount,
      } : null });
    } catch (err) {
      console.error('vp current error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/vp/:machineId/deal', authenticate, async (req, res) => {
    const cfg = INSTANT_MACHINES[req.params.machineId];
    if (!cfg || cfg.game !== 'videopoker') return res.status(404).json({ error: 'Unknown machine' });
    const bet = Math.floor(Number(req.body?.bet) || 0);
    if (bet < cfg.min) return res.status(400).json({ error: `Minimum bet ${cfg.min.toLocaleString()}` });
    if (bet > cfg.max) return res.status(400).json({ error: `Maximum bet ${cfg.max.toLocaleString()}` });

    const price = cfg.currency === 'btc' ? await houseManager.getPrice() : null;
    if (cfg.currency === 'btc' && !price) return res.status(503).json({ error: 'BTC price unavailable' });

    const roundId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize new hands per user and refuse an open hand. Refunding an
      // unfinished hand whenever /deal was called let clients reroll hands
      // for free until they saw a payout hand.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      const open = await client.query(
        `SELECT id FROM house_rounds
         WHERE game='videopoker' AND table_id=$1 AND status='open'
           AND bets->0->>'userId'=$2
         LIMIT 1 FOR UPDATE`,
        [req.params.machineId, String(req.user.id)]
      );
      if (open.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Finish your current hand before dealing again' });
      }
      const fairness = await nextFairRng(client, req.user.id);
      const { dealt: hand, remaining } = vpDeal(fairness.rng);
      const moved = await houseManager.debit(client, req.user.id, cfg.currency, bet, price);
      if (!moved) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
      await houseManager.recordTx(client, req.user.id, 'entry_fee', cfg.currency, bet,
        { house: 'videopoker', machine: req.params.machineId, round: roundId }, price);
      await client.query(
        `INSERT INTO house_rounds(id, game, table_id, currency, bets, status) VALUES($1,'videopoker',$2,$3,$4,'open')`,
        [roundId, req.params.machineId, cfg.currency, JSON.stringify([{
          userId: req.user.id, username: req.user.username, amount: bet, btc: moved.btc || null,
          deal: hand, deck: remaining,
        }])]
      );
      await client.query('COMMIT');
      res.json({ roundId, hand, bet, currency: cfg.currency, paytable: VP_PAYTABLE });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('vp deal error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  router.post('/vp/:machineId/draw', authenticate, async (req, res) => {
    const cfg = INSTANT_MACHINES[req.params.machineId];
    if (!cfg || cfg.game !== 'videopoker') return res.status(404).json({ error: 'Unknown machine' });
    const roundId = req.body?.roundId;
    const hold = Array.isArray(req.body?.hold) ? req.body.hold.map(Number).filter(i => i >= 0 && i < 5) : [];

    const price = cfg.currency === 'btc' ? await houseManager.getPrice() : null;
    if (cfg.currency === 'btc' && !price) return res.status(503).json({ error: 'BTC price unavailable' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query(`SELECT * FROM house_rounds WHERE id=$1 FOR UPDATE`, [roundId]);
      const row = rows.rows[0];
      if (!row || row.currency !== cfg.currency || row.table_id !== req.params.machineId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Hand not found' });
      }
      const entry = (row.bets || [])[0];
      if (!entry || entry.userId !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not your hand' }); }

      // If the server committed a draw but the response was lost, a retry
      // returns the saved result instead of leaving the client stuck or
      // attempting to pay the same hand twice.
      if (row.status === 'settled' && row.results?.finalCards) {
        await client.query('COMMIT');
        return res.json({
          finalCards: row.results.finalCards, result: row.results.result,
          payout: row.results.payout, net: row.results.payout - entry.amount,
          currency: cfg.currency, replayed: true,
        });
      }
      if (row.status !== 'open') {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Hand is no longer available' });
      }

      const deck = [...entry.deck];
      const finalCards = entry.deal.map((c, i) => hold.includes(i) ? c : deck.pop());
      const result = vpEvaluate(finalCards);
      const payout = betSafe(entry.amount) * (VP_PAYTABLE[result] || 0);

      if (payout > 0) {
        await houseManager.credit(client, req.user.id, cfg.currency, payout, price);
        await houseManager.recordTx(client, req.user.id, 'winnings', cfg.currency, payout,
          { house: 'videopoker', machine: req.params.machineId, round: roundId, result }, price);
      }
      await client.query(
        `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
        [roundId, JSON.stringify({ finalCards, result, payout })]
      );
      await client.query('COMMIT');
      res.json({ finalCards, result, payout, net: payout - entry.amount, currency: cfg.currency });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('vp draw error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  function betSafe(v) { return Math.max(0, Number(v) || 0); }

  // ─── Provably fair: seed management & verification ───

  router.get('/fair/current', authenticate, async (req, res) => {
    const s = await getOrCreateSeeds(req.user.id);
    res.json({ serverSeedHash: s.server_seed_hash, clientSeed: s.client_seed, nonce: Number(s.nonce) });
  });

  router.post('/fair/rotate', authenticate, async (req, res) => {
    const clientSeed = typeof req.body?.clientSeed === 'string' && req.body.clientSeed.length <= 64
      ? req.body.clientSeed : nodeCrypto.randomBytes(8).toString('hex');
    const old = await getOrCreateSeeds(req.user.id);
    const { serverSeed, serverSeedHash } = createSeedPair();
    await pool.query(
      `UPDATE fair_seeds SET prev_server_seed=$2, prev_server_seed_hash=$3, prev_nonce=$4,
       rotated_at=NOW(), server_seed=$5, server_seed_hash=$6, client_seed=$7, nonce=0 WHERE user_id=$1`,
      [req.user.id, old.server_seed, old.server_seed_hash, old.nonce, serverSeed, serverSeedHash, clientSeed]
    );
    res.json({
      revealed: { serverSeed: old.server_seed, serverSeedHash: old.server_seed_hash, nonce: Number(old.nonce), clientSeed: old.client_seed },
      next: { serverSeedHash, clientSeed, nonce: 0 },
    });
  });

  // Verify one of YOUR settled instant bets: replays the derivation
  router.get('/fair/verify/:roundId', authenticate, async (req, res) => {
    const rows = await pool.query(`SELECT * FROM house_rounds WHERE id=$1 AND game IN ('slots','dice','plinko') AND status='settled'`, [req.params.roundId]);
    const round = rows.rows[0];
    if (!round || (round.bets || [])[0]?.userId !== req.user.id) return res.status(404).json({ error: 'Bet not found' });
    const fair = round.results?.fair;
    if (!fair) return res.status(400).json({ error: 'Bet predates the fairness system' });

    // Locate the (possibly rotated) seed that matches the hash
    const s = await pool.query(`SELECT * FROM fair_seeds WHERE user_id=$1`, [req.user.id]);
    const seedRow = s.rows[0];
    let serverSeed = null;
    if (seedRow.server_seed_hash === fair.serverSeedHash) serverSeed = seedRow.server_seed;
    else if (seedRow.prev_server_seed_hash === fair.serverSeedHash) serverSeed = seedRow.prev_server_seed;
    if (!serverSeed) return res.json({ ...fair, verifiable: false, note: 'Reveal this seed by rotating fairness seeds, then verify.' });

    const nextFloat = floatStream(serverSeed, fair.clientSeed, fair.nonce);
    let replay = null;
    const cfg = INSTANT_MACHINES[round.table_id];
    if (cfg?.game === 'slots') replay = spinSlots(cfg.machine, nextFloat);
    else if (cfg?.game === 'dice') replay = playDice(round.results.outcome.target, round.results.outcome.direction, nextFloat);
    else if (cfg?.game === 'plinko') replay = playPlinko(round.results.outcome.risk, nextFloat);

    res.json({
      ...fair, verifiable: true, serverSeed,
      derived: replay,
      matches: JSON.stringify(replay?.reels || replay?.roll || replay?.path) === JSON.stringify(round.results.outcome.reels || round.results.outcome.roll || round.results.outcome.path),
      note: 'outcome = f(HMAC_SHA256(serverSeed, clientSeed:nonce:cursor)) — recompute and compare.',
    });
  });

  // ─── Daily bonus (play chips) ───

  router.get('/bonus/status', authenticate, async (req, res) => {
    const r = await pool.query(`SELECT last_claimed, streak FROM daily_bonus WHERE user_id=$1`, [req.user.id]);
    const last = r.rows[0]?.last_claimed ? new Date(r.rows[0].last_claimed).getTime() : 0;
    const COOLDOWN = 24 * 3600 * 1000;
    const since = Date.now() - last;
    res.json({
      claimable: since >= COOLDOWN,
      canClaimIn: since >= COOLDOWN ? 0 : COOLDOWN - since,
      streak: r.rows[0]?.streak || 0,
      amount: 1000,
    });
  });

  router.post('/bonus/claim', authenticate, async (req, res) => {
    const COOLDOWN = 24 * 3600 * 1000;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT last_claimed, streak FROM daily_bonus WHERE user_id=$1 FOR UPDATE`, [req.user.id]);
      const last = r.rows[0]?.last_claimed ? new Date(r.rows[0].last_claimed).getTime() : 0;
      if (Date.now() - last < COOLDOWN) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Bonus already claimed — come back tomorrow' });
      }
      const streak = (r.rows[0]?.streak || 0) + 1;
      await client.query(
        `INSERT INTO daily_bonus(user_id, streak, last_claimed) VALUES($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET streak=$2, last_claimed=NOW()`,
        [req.user.id, streak]
      );
      // Streak bonus: 1000 + 100 per streak day (capped 3000)
      const amount = Math.min(3000, 1000 + (streak - 1) * 100);
      await client.query('UPDATE users SET balance_play = balance_play + $1 WHERE id=$2', [amount, req.user.id]);
      await client.query(
        `INSERT INTO transactions(user_id, type, amount, currency, status, metadata) VALUES($1,'winnings',$2,'PLAY','confirmed',$3)`,
        [req.user.id, amount, JSON.stringify({ house: 'daily-bonus', streak })]
      );
      await client.query('COMMIT');
      res.json({ ok: true, amount, streak });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('bonus claim error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // ─── My bets (unified house history) ───

  router.get('/mybets', authenticate, async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT id, game, table_id, currency, bets, results, settled_at
         FROM house_rounds WHERE status='settled'
         AND bets @> jsonb_build_array(jsonb_build_object('userId', $1::int))
         ORDER BY settled_at DESC NULLS LAST LIMIT 50`,
        [req.user.id]
      );
      const bets = rows.rows.map(r => {
        const mine = (r.bets || []).find(b => b.userId === req.user.id) || {};
        const resl = r.results || {};
        return {
          id: r.id, game: GAME_LABELS[r.game] || r.game, detail: r.table_id,
          currency: r.currency,
          bet: mine.amount ?? resl.bet ?? 0,
          payout: mine.returned ?? resl.payout ?? 0,
          at: r.settled_at || r.created_at,
        };
      }).map(b => ({ ...b, net: b.payout - b.bet }));
      res.json({ bets });
    } catch (err) {
      console.error('mybets error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Casino profile: XP & level from lifetime wagers ───

  router.get('/me', authenticate, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS wagered FROM transactions
         WHERE user_id=$1 AND type='entry_fee' AND currency='PLAY'`,
        [req.user.id]
      );
      const wagered = parseFloat(r.rows[0].wagered || 0);
      const level = Math.floor(Math.sqrt(wagered / 1000)) + 1;
      const nextLevelAt = Math.pow(level, 2) * 1000;
      res.json({ wagered: Math.floor(wagered), level, nextLevelAt });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ─── Progressive jackpots ───
  router.get('/jackpots', async (req, res) => {
    try {
      const r = await pool.query(`SELECT tier, pool, last_winner_username, last_win_amount, last_won_at FROM jackpots ORDER BY pool DESC`);
      res.json({ jackpots: r.rows.map(j => ({ tier: j.tier, pool: parseFloat(j.pool), lastWinner: j.last_winner_username, lastAmount: j.last_win_amount ? parseFloat(j.last_win_amount) : null })) });
    } catch { res.status(500).json({ error: 'Server error' }); }
  });

  // ─── Rakeback: lazy accrual from wagers since last claim ───
  router.get('/rakeback', authenticate, async (req, res) => {
    try {
      const rb = await pool.query(`SELECT * FROM rakeback WHERE user_id=$1`, [req.user.id]);
      const lastClaimed = rb.rows[0]?.last_claimed || null;
      const w = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS wagered FROM transactions
         WHERE user_id=$1 AND type='entry_fee' AND currency='PLAY'
         AND created_at > COALESCE($2::timestamptz, 'epoch')`,
        [req.user.id, lastClaimed]
      );
      const wagered = parseFloat(w.rows[0].wagered);
      const me2 = await pool.query(`SELECT COALESCE(SUM(amount),0) AS wagered FROM transactions WHERE user_id=$1 AND type='entry_fee' AND currency='PLAY'`, [req.user.id]);
      const level = Math.floor(Math.sqrt(parseFloat(me2.rows[0].wagered) / 1000)) + 1;
      const rate = 0.0015 * (1 + (level - 1) * 0.1);  // 0.15% base, +10%/level
      const available = Math.floor(wagered * rate * 100) / 100;
      res.json({ available, wageredSinceClaim: wagered, level, rate, lifetime: parseFloat(rb.rows[0]?.lifetime || 0) });
    } catch (err) { console.error('rakeback error:', err); res.status(500).json({ error: 'Server error' }); }
  });

  router.post('/rakeback/claim', authenticate, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rb = await client.query(`SELECT * FROM rakeback WHERE user_id=$1 FOR UPDATE`, [req.user.id]);
      const lastClaimed = rb.rows[0]?.last_claimed || null;
      const w = await client.query(
        `SELECT COALESCE(SUM(amount),0) AS wagered FROM transactions
         WHERE user_id=$1 AND type='entry_fee' AND currency='PLAY' AND created_at > COALESCE($2::timestamptz, 'epoch')`,
        [req.user.id, lastClaimed]
      );
      const wagered = parseFloat(w.rows[0].wagered);
      const me2 = await client.query(`SELECT COALESCE(SUM(amount),0) AS wagered FROM transactions WHERE user_id=$1 AND type='entry_fee' AND currency='PLAY'`, [req.user.id]);
      const level = Math.floor(Math.sqrt(parseFloat(me2.rows[0].wagered) / 1000)) + 1;
      const rate = 0.0015 * (1 + (level - 1) * 0.1);
      const amount = Math.floor(wagered * rate * 100) / 100;
      if (amount <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nothing to claim yet — place some bets first' }); }
      await client.query('UPDATE users SET balance_play = balance_play + $1 WHERE id=$2', [amount, req.user.id]);
      await client.query(
        `INSERT INTO transactions(user_id, type, amount, currency, status, metadata) VALUES($1,'winnings',$2,'PLAY','confirmed',$3)`,
        [req.user.id, amount, JSON.stringify({ house: 'rakeback', level })]
      );
      await client.query(
        `INSERT INTO rakeback(user_id, available, lifetime, last_claimed) VALUES($1,$2,$2,NOW())
         ON CONFLICT (user_id) DO UPDATE SET available=$2, lifetime=rakeback.lifetime+$2, last_claimed=NOW()`,
        [req.user.id, amount]
      );
      await client.query('COMMIT');
      res.json({ ok: true, amount, level });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('rakeback claim error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally { client.release(); }
  });

  // ─── Daily Wager Race: lazy daily settlement, top 3 paid ───
  router.get('/race', authenticate, async (req, res) => {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const st = await client.query(`SELECT last_settled FROM race_state WHERE id=1 FOR UPDATE`);
        const lastSettled = st.rows[0].last_settled;           // date of the day ALREADY settled
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        let settledInfo = null;
        if (new Date(lastSettled) < new Date(yesterday)) {
          // settle the most recent unfinished day (yesterday)
          const PRIZES = [5000, 2500, 1000];
          const top = await client.query(
            `SELECT user_id, SUM(amount) AS wagered FROM transactions
             WHERE type='entry_fee' AND currency='PLAY' AND created_at::date = $1
             GROUP BY user_id ORDER BY wagered DESC LIMIT 3`,
            [yesterday]
          );
          for (let i = 0; i < top.rows.length; i++) {
            const prize = PRIZES[i];
            await client.query('UPDATE users SET balance_play = balance_play + $1 WHERE id=$2', [prize, top.rows[i].user_id]);
            await client.query(
              `INSERT INTO transactions(user_id, type, amount, currency, status, metadata) VALUES($1,'winnings',$2,'PLAY','confirmed',$3)`,
              [top.rows[i].user_id, prize, JSON.stringify({ house: 'wager-race', day: yesterday, rank: i + 1 })]
            );
          }
          settledInfo = { day: yesterday, winners: top.rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, wagered: parseFloat(r.wagered), prize: PRIZES[i] })) };
        }
        await client.query(`UPDATE race_state SET last_settled = GREATEST($1, $2::date) WHERE id=1`, [lastSettled, yesterday]);
        await client.query('COMMIT');
        if (settledInfo && settledInfo.winners.length) {
          houseManager.io.emit('raceSettled', settledInfo);
        }
      } finally { client.release(); }
      const standings = await pool.query(
        `SELECT u.username, SUM(t.amount) AS wagered
         FROM transactions t JOIN users u ON u.id = t.user_id
         WHERE t.type='entry_fee' AND t.currency='PLAY' AND t.created_at::date = CURRENT_DATE
         GROUP BY u.username ORDER BY wagered DESC LIMIT 10`
      );
      res.json({
        prizes: [5000, 2500, 1000],
        standings: standings.rows.map(r => ({ username: r.username, wagered: parseFloat(r.wagered) })),
        resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      });
    } catch (err) { console.error('race error:', err); res.status(500).json({ error: 'Server error' }); }
  });

  // ─── MINES — interactive provably-fair instant game (3% edge) ───
  router.get('/mines/config', authenticate, (req, res) => {
    res.json({ tiles: 25, maxMines: 24, edge: 0.03 });
  });

  router.get('/mines/current', authenticate, async (req, res) => {
    try {
      const found = await pool.query(
        `SELECT id, bets, results FROM house_rounds
         WHERE game='mines' AND status='open' AND bets->0->>'userId'=$1
         ORDER BY created_at DESC LIMIT 1`,
        [String(req.user.id)]
      );
      const round = found.rows[0];
      if (!round) return res.json({ round: null });
      const data = round.results || {};
      res.json({ round: {
        roundId: round.id,
        minesCount: data.mines?.length || round.bets?.[0]?.mines || 3,
        bet: data.bet || round.bets?.[0]?.amount || 0,
        revealed: data.revealed || [],
        mult: data.mult || 1,
      } });
    } catch (err) {
      console.error('mines current error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/mines/start', authenticate, async (req, res) => {
    const bet = Math.floor(Number(req.body?.bet) || 0);
    const minesCount = Math.round(Number(req.body?.mines) || 3);
    if (!(minesCount >= 1 && minesCount <= 24)) return res.status(400).json({ error: 'Mines must be 1-24' });
    if (bet < 1) return res.status(400).json({ error: 'Minimum bet 1' });
    if (bet > 100000) return res.status(400).json({ error: 'Maximum bet 100000' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fair = await nextFairRng(client, req.user.id);
      // nextFairRng locks this user's seed row, so concurrent starts serialize
      // before we check for an unfinished hand.
      const open = await client.query(
        `SELECT id FROM house_rounds
         WHERE game='mines' AND status='open' AND bets->0->>'userId'=$1
         LIMIT 1 FOR UPDATE`,
        [String(req.user.id)]
      );
      if (open.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Finish or cash out your current Mines round first' });
      }
      // provably-fair mine placement: seeded shuffle of positions
      const positions = Array.from({ length: 25 }, (_, i) => i);
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(fair.rng() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      const mines = positions.slice(0, minesCount);
      const moved = await houseManager.debit(client, req.user.id, 'play', bet, null);
      if (!moved) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
      await houseManager.recordTx(client, req.user.id, 'entry_fee', 'play', bet,
        { house: 'mines', mines: minesCount }, null);
      const roundId = randomUUID();
      await client.query(
        `INSERT INTO house_rounds(id, game, table_id, currency, bets, results, status) VALUES($1,'mines','mines','play',$2,$3,'open')`,
        [roundId, JSON.stringify([{ userId: req.user.id, username: req.user.username, amount: bet, mines: minesCount }]),
         JSON.stringify({ fair: { serverSeedHash: fair.serverSeedHash, clientSeed: fair.clientSeed, nonce: fair.nonce }, mines, revealed: [], mult: 1, bet })]
      );
      await client.query('COMMIT');
      res.json({ roundId, minesCount, bet });
      // NOTE: mine positions are NOT sent to the client until bust/cashout
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('mines start error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally { client.release(); }
  });

  router.post('/mines/reveal', authenticate, async (req, res) => {
    const roundId = req.body?.roundId;
    const tile = Math.round(Number(req.body?.tile));
    if (!(tile >= 0 && tile < 25)) return res.status(400).json({ error: 'Invalid tile' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query(`SELECT * FROM house_rounds WHERE id=$1 AND game='mines' AND status='open' FOR UPDATE`, [roundId]);
      const round = rows.rows[0];
      if (!round || (round.bets || [])[0]?.userId !== req.user.id) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Round not found' }); }
      const results = round.results;
      const { mines, revealed, mult, bet, fair } = results;
      if (revealed.includes(tile)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Tile already revealed' }); }

      if (mines.includes(tile)) {
        // BUST
        await client.query(
          `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
          [roundId, JSON.stringify({ ...results, revealed: [...revealed, tile], bust: true })]
        );
        await client.query('COMMIT');
        return res.json({ bust: true, tile, mines, mult: 0, payout: 0, net: -bet });
      }
      revealed.push(tile);
      const safeTotal = 25 - mines.length;
      const newMult = minesMultiplier(mines.length, revealed.length);
      const finished = revealed.length >= safeTotal;
      let payout = 0;
      if (finished) {
        payout = Math.floor(bet * newMult);
        await houseManager.credit(client, req.user.id, 'play', payout, null);
        await houseManager.recordTx(client, req.user.id, 'winnings', 'play', payout,
          { house: 'mines', round: roundId, mult: newMult, maxWin: true }, null);
      }
      await client.query(
        `UPDATE house_rounds SET status=$3, settled_at=$4, results=$2 WHERE id=$1`,
        [roundId,
         JSON.stringify({ ...results, revealed, mult: newMult, finished }),
         finished ? 'settled' : 'open',
         finished ? new Date().toISOString() : null]
      );
      await client.query('COMMIT');
      res.json({ bust: false, tile, safe: true, mult: newMult, revealed: revealed.length, finished, payout, mines: finished ? mines : undefined });
      if (payout > 0) emitBigWin(houseManager.io, req.user.username, 'Mines', payout, newMult, 'play');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('mines reveal error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally { client.release(); }
  });

  router.post('/mines/cashout', authenticate, async (req, res) => {
    const roundId = req.body?.roundId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query(`SELECT * FROM house_rounds WHERE id=$1 AND game='mines' AND status='open' FOR UPDATE`, [roundId]);
      const round = rows.rows[0];
      if (!round || (round.bets || [])[0]?.userId !== req.user.id) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Round not found' }); }
      const results = round.results;
      const bet = results.bet;
      const payout = Math.floor(bet * (results.mult || 1));
      await houseManager.credit(client, req.user.id, 'play', payout, null);
      await houseManager.recordTx(client, req.user.id, 'winnings', 'play', payout,
        { house: 'mines', round: roundId, mult: results.mult }, null);
      await client.query(
        `UPDATE house_rounds SET status='settled', settled_at=NOW(), results=$2 WHERE id=$1`,
        [roundId, JSON.stringify({ ...results, cashedOut: true, payout })]
      );
      await client.query('COMMIT');
      if (payout > 0) emitBigWin(houseManager.io, req.user.username, 'Mines', payout, results.mult || 1, 'play');
      res.json({ ok: true, mult: results.mult, payout, net: payout - bet, mines: results.mines });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('mines cashout error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally { client.release(); }
  });

  // Recent round history for a table (for stats / audit)
  router.get('/tables/:tableId/history', authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT game, currency, results, created_at, settled_at
         FROM house_rounds WHERE table_id=$1 AND status='settled'
         ORDER BY settled_at DESC LIMIT 25`,
        [req.params.tableId]
      );
      res.json({ rounds: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
};

const pool = require('../db');
