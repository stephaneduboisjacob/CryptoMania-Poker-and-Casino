// Multi-way evaluation helpers built on the existing heads-up evaluator.
const { bestHand } = require('../game/evaluator');

// compareRanks mirrors game/evaluator.js internal logic (lexicographic on the
// rank arrays). Exported here so multi-way pots can rank N hands.
function compareRanks(r1, r2) {
  for (let i = 0; i < Math.max(r1.length, r2.length); i++) {
    const a = r1[i] ?? 0, b = r2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

module.exports = { bestHand, compareRanks };
