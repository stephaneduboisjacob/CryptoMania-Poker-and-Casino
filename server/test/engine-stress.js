// Engine stress test: chip conservation across many hands with varied aggression.
const { Table } = require('../src/poker/engine.js');
const bot = require('../src/poker/ai.js');
const fakeIo = { to: () => ({ emit: () => {} }) };
const TOTAL = 6 * 3000;

function makeTable(mode) {
  const t = new Table({
    id: 'tx', gameId: 'gx', io: fakeIo, maxSeats: 6, currency: 'play', gameType: 'cash',
    speed: 'hyper', name: 't', smallBlind: 10, bigBlind: 20, levelMinutes: 10,
    manager: {
      onHandEnd: () => {},
      onTurnStart: (tb, seat) => {
        setTimeout(() => {
          if (tb.destroyed || tb.actionOn !== seat) return;
          let d;
          if (mode === 'random-shoves' && Math.random() < 0.08) {
            d = { action: 'raise', amount: tb.seats[seat].chips + (tb.bets[seat] || 0) };
          } else if (mode === 'uneven-shoves' && Math.random() < 0.3) {
            d = { action: 'raise', amount: Math.floor(tb.seats[seat].chips * (0.25 + Math.random() * 0.75)) + (tb.bets[seat] || 0) };
          } else {
            d = bot.decide(tb, seat);
          }
          const r = tb.applyAction(tb.seats[seat].userId, d.action, d.amount);
          if (r?.error) tb.applyAction(tb.seats[seat].userId, 'fold', 0);
        }, 2);
      },
    },
  });
  return t;
}

(async () => {
  for (const mode of ['bots-only', 'random-shoves', 'uneven-shoves']) {
    const t = makeTable(mode);
    let hands = 0, fails = 0;
    const orig = t.manager.onHandEnd;
    t.manager.onHandEnd = (tb, s) => {
      hands++;
      const stackSum = tb.seats.filter(Boolean).reduce((sum, p) => sum + p.chips, 0);
      if (stackSum + (s.rake || 0) !== TOTAL) {
        fails++;
        console.error(`[${mode}] hand ${hands} FAIL: stacks ${stackSum} + rake ${s.rake} != ${TOTAL} (diff ${TOTAL - stackSum - (s.rake || 0)})`);
        if (fails > 2) process.exit(1);
      }
      orig(tb, s);
      t.schedule(() => t.maybeStartHand(), 60); // manager's real job: keep the table moving
    };
    for (let i = 0; i < 6; i++) t.sitPlayer({ userId: i + 1, username: 'P' + (i + 1), chips: 3000 });
    t.maybeStartHand();
    await new Promise(r => setTimeout(r, 25000));
    console.log(`[${mode}]: ${hands} hands, ${fails} conservation failures ${fails === 0 ? 'PASS' : 'FAIL'}`);
    t.destroy();
  }
  process.exit(0);
})();
