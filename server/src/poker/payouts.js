// Prize payout schedules.
// All functions return an array of fractional shares (sum ≈ 1) ordered by final
// place (index 0 = 1st). Distribution code floors amounts and gives remainder
// chips to 1st place, so shares only need to be approximately 1.

function sngPayouts(maxSeats) {
  if (maxSeats <= 2) return [1];
  if (maxSeats <= 6) return [0.65, 0.35];
  return [0.5, 0.3, 0.2];
}

// Mainstream-style MTT slider: pays roughly the top 15-20% of the field,
// top-heavy exponential decay. Returns one share per paid place.
function mttPayouts(fieldSize) {
  if (fieldSize <= 1) return [1];
  if (fieldSize === 2) return [0.65, 0.35];
  if (fieldSize <= 4) return [0.6, 0.4];
  if (fieldSize <= 6) return [0.55, 0.3, 0.15];
  if (fieldSize <= 9) return [0.5, 0.3, 0.2];

  const paid = Math.max(3, Math.round(fieldSize * 0.18));
  const shares = [];
  let raw = 0;
  for (let i = 0; i < paid; i++) {
    // Decay so 1st gets ~3x 2nd, 2nd ~2.2x 3rd, flattening out down the list
    const w = Math.pow(0.62, i) * (i === 0 ? 3.2 : i === 1 ? 2.2 : 1);
    shares.push(w);
    raw += w;
  }
  // Normalize; flatten the long tail into integer-friendly steps
  const norm = shares.map(s => s / raw);
  // Merge tail shares smaller than 1% into the smallest paid place
  const min = 0.01;
  let tail = 0;
  const out = [];
  for (const s of norm) {
    if (s < min && out.length >= 3) { tail += s; continue; }
    out.push(s);
  }
  if (out.length > 0) out[out.length - 1] += tail;
  return out;
}

// Distribute `pool` (integer chips or BTC numeric string) by shares.
// Returns array of { place, amount } — 1-indexed places, floored amounts,
// remainder to 1st. For BTC, pool is a Number of BTC (8dp).
function distribute(pool, shares) {
  const out = [];
  let allocated = 0;
  shares.forEach((share, i) => {
    const amount = i === shares.length - 1
      ? pool - allocated // last paid place gets the exact remainder
      : Math.floor(pool * share * 1e8) / 1e8;
    out.push({ place: i + 1, amount });
    allocated += amount;
  });
  return out;
}

module.exports = { sngPayouts, mttPayouts, distribute };
