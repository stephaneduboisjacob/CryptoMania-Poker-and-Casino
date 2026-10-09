// Provably Fair RNG — the standard crypto-casino scheme:
//   1. Server generates serverSeed (secret) and publishes SHA-256(serverSeed) BEFORE any bet.
//   2. Player sets clientSeed (or accepts a random one).
//   3. Every bet increments nonce. Random bytes = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).
//   4. Player can rotate seeds at any time → old serverSeed is REVEALED → every past bet
//      is recomputable and verifiable. The house cannot change outcomes after the fact.
//
// Floats use the full 32-bit output space to cover [0,1) evenly.

const crypto = require('crypto');

function createSeedPair() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  return {
    serverSeed,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
  };
}

// Deterministic byte stream from the seed triplet
function hmacBytes(serverSeed, clientSeed, nonce, cursor) {
  return crypto.createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:${cursor}`)
    .digest();
}

// Uniform 32-bit float stream generator
function floatStream(serverSeed, clientSeed, nonce) {
  let cursor = 0;
  let buf = null;
  let idx = 4;
  return function nextFloat() {
    for (;;) {
      if (!buf || idx + 4 > buf.length) {
        buf = hmacBytes(serverSeed, clientSeed, nonce, cursor++);
        idx = 0;
      }
      const chunk = buf.slice(idx, idx + 4);
      idx += 4;
      const value = chunk.readUInt32BE(0);
      return value / 2 ** 32;
    }
  };
}

// Fisher–Yates shuffle driven by a float stream (for video poker decks)
function seededShuffle(deck, nextFloat) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

module.exports = { createSeedPair, hmacBytes, floatStream, seededShuffle };
