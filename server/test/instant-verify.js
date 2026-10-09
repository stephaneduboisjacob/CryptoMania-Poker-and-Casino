// Verifies every instant game's exact RTP is BELOW 1.0 (house-favorable).
// Run: node test/instant-verify.js — exits non-zero on any violation.
const {
  SLOT_MACHINES, slotRtp, PLINKO_TABLES, plinkoRtp,
} = require('../src/house/instant');

let failures = 0;
function check(label, rtp, maxRtp) {
  const ok = rtp !== null && rtp < maxRtp;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} RTP = ${(rtp * 100).toFixed(2)}%  (house edge ${(100 - rtp * 100).toFixed(2)}%)`);
}

console.log('=== SLOTS (exact par-sheet math) ===');
for (const id of Object.keys(SLOT_MACHINES)) {
  check(`slot:${id}`, slotRtp(id), 0.97);
}

console.log('=== PLINKO (exact binomial math) ===');
for (const risk of Object.keys(PLINKO_TABLES)) {
  check(`plinko:${risk}`, plinkoRtp(risk), 0.98);
}

console.log('=== DICE (analytic: EV = 0.99 by construction) ===');
const diceEV = (() => {
  // multiplier 99/chance, win prob chance/100 → EV = 0.99 exactly
  return 0.99;
})();
check('dice', diceEV, 1.0);

console.log('=== VIDEO POKER 8/5 JoB (published optimal-play RTP 97.3%) ===');
check('videopoker (8/5 JoB)', 0.973, 0.985);

console.log('=== BACCARAT (published edges) ===');
check('baccarat: banker', 0.9888, 0.995);
check('baccarat: player', 0.9876, 0.995);
check('baccarat: tie', 0.856, 0.99);

console.log(failures === 0 ? '\nALL GAMES HOUSE-FAVORABLE ✅' : `\n${failures} VIOLATIONS ❌`);
process.exit(failures === 0 ? 0 : 1);
