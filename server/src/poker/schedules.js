// Format definitions: cash stakes, blind ladders, SNG/MTT configs, MTT calendar.
// All chip amounts are integers. BTC cash tables denominate chips in USD cents
// (1 chip = $0.01); play tables denominate chips in play chips (1 chip = 1 chip).

// ─── Blind ladders (arrays of [small, big], indexed from level 1) ────────────

const LADDERS = {
  // Standard ladder for regular/turbo SNGs & MTTs (start 10/20)
  standard: [
    [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200],
    [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200], [800, 1600],
    [1200, 2400], [2000, 4000], [3000, 6000], [4000, 8000], [6000, 12000],
    [8000, 16000], [12000, 24000], [20000, 40000],
  ],
  // Aggressive ladder for hyper events (start 25/50)
  hyper: [
    [25, 50], [50, 100], [75, 150], [125, 250], [200, 400], [300, 600],
    [500, 1000], [750, 1500], [1000, 2000], [1500, 3000], [2500, 5000],
    [4000, 8000], [6000, 12000], [10000, 20000],
  ],
  // Gentle early levels for deepstacks (start 25/50, 25000 stack)
  deepstack: [
    [25, 50], [50, 50], [50, 100], [75, 150], [100, 200], [150, 300],
    [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000],
    [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000],
  ],
};

function ladderFor(speed) {
  if (speed === 'hyper') return LADDERS.hyper;
  if (speed === 'deepstack') return LADDERS.deepstack;
  return LADDERS.standard;
}

function levelMinutesFor(speed) {
  switch (speed) {
    case 'hyper': return 3;
    case 'turbo': return 5;
    case 'deepstack': return 15;
    default: return 10; // SNG regular; MTT regular overrides to 12 via formats
  }
}

function blindForLevel(speed, level) {
  const ladder = ladderFor(speed);
  const idx = Math.min(Math.max(level, 1), ladder.length) - 1;
  return { smallBlind: ladder[idx][0], bigBlind: ladder[idx][1] };
}

// ─── Cash game stakes ─────────────────────────────────────────────────────────

// BTC tables: chips = USD cents. Play tables: chips = play chips.
const CASH_STAKES = [
  // Play money tables
  { key: 'play-micro', currency: 'play', sb: 10, bb: 20, min: 2000, max: 6000, name: 'Micro Grind', aiFill: true, maxSeats: [2, 3, 6, 8, 9] },
  { key: 'play-low', currency: 'play', sb: 25, bb: 50, min: 5000, max: 15000, name: 'Low Stakes Lounge', aiFill: true, maxSeats: [2, 3, 6, 8, 9] },
  { key: 'play-mid', currency: 'play', sb: 100, bb: 200, min: 20000, max: 60000, name: 'High Roller Play', aiFill: false, maxSeats: [2, 3, 6, 8, 9] },
  // BTC tables (chips = USD cents: 25/50 = $0.25/$0.50)
  { key: 'btc-025', currency: 'btc', sb: 25, bb: 50, min: 5000, max: 15000, name: 'BTC Dime', aiFill: false, maxSeats: [2, 3, 6, 8, 9] },     // $0.25/$0.50
  { key: 'btc-100', currency: 'btc', sb: 100, bb: 200, min: 20000, max: 60000, name: 'BTC Dollar', aiFill: false, maxSeats: [2, 3, 6, 8, 9] }, // $1/$2
];

// ─── SNG configs ──────────────────────────────────────────────────────────────

// Play SNG buy-ins (play chips) and BTC SNG buy-ins (USD, converted at registration)
const SNG_PLAY_BUYINS = [1000, 5000, 25000];
const SNG_BTC_USD = [1, 5, 10, 25, 100];

// ─── Scheduled MTT calendar (UTC hours) ───────────────────────────────────────

const MTT_CALENDAR = [
  {
    key: 'freeroll-fever',
    name: 'Freeroll Fever',
    hours: Array.from({ length: 24 }, (_, hour) => hour),
    minute: 15, // offset from the hour so it doesn't collide with top-of-hour events
    gameType: 'mtt', maxSeats: 9, speed: 'turbo', currency: 'play',
    entryFee: 0, startingStack: 10000, levelMinutes: 5, lateRegLevels: 2,
    minPlayers: 2, guarantee: 10000, // 10k play chips guaranteed prize pool
    description: 'Free entry · 10,000 play-chip prize pool · Top 3 paid',
  },
  {
    key: 'daily-btc',
    name: 'Heisenberg Daily $5 [BTC Prize Pool]',
    hours: [18],
    minute: 0,
    gameType: 'mtt', maxSeats: 9, speed: 'regular', currency: 'btc',
    entryUsd: 5, startingStack: 15000, levelMinutes: 10, lateRegLevels: 3,
    minPlayers: 2,
    description: '$5 BTC buy-in · BTC prize pool grows with entries · Late registration 3 levels',
  },
  {
    key: 'turbo-btc',
    name: 'Turbo Bitcoin Crash $10 [6-Max]',
    hours: [20],
    minute: 0,
    gameType: 'mtt', maxSeats: 6, speed: 'turbo', currency: 'btc',
    entryUsd: 10, startingStack: 10000, levelMinutes: 6, lateRegLevels: 2,
    minPlayers: 2, guaranteeUsd: 0,
    description: '$10 BTC buy-in · 6-Max turbo · Fast & furious',
  },
  {
    key: 'play-championship',
    name: 'Deepstack Play Championship',
    hours: [21],
    minute: 30,
    gameType: 'mtt', maxSeats: 9, speed: 'deepstack', currency: 'play',
    entryFee: 10000, startingStack: 25000, levelMinutes: 15, lateRegLevels: 2,
    minPlayers: 2, guarantee: 100000,
    description: '10,000 chip entry · 25,000 stack · Deep structure',
  },
  {
    key: 'heads-up-hyper',
    name: 'Heads-Up Hyper Dash',
    hours: [0, 6, 12, 18],
    minute: 45,
    gameType: 'mtt', maxSeats: 2, speed: 'hyper', currency: 'play',
    entryFee: 500, startingStack: 3000, levelMinutes: 3, lateRegLevels: 0,
    minPlayers: 2, guarantee: 0,
    description: 'Heads-up bracket · 500 play-chip entry · Hyper blinds',
  },
  {
    key: 'short-handed-sprint',
    name: 'Short-Handed Turbo Sprint',
    hours: [3, 9, 15, 21],
    minute: 45,
    gameType: 'mtt', maxSeats: 3, speed: 'turbo', currency: 'play',
    entryFee: 2000, startingStack: 5000, levelMinutes: 5, lateRegLevels: 1,
    minPlayers: 2, guarantee: 0,
    description: '3-max turbo · 2,000 play-chip entry',
  },
  {
    key: 'eight-max-deepstack',
    name: 'Eight-Max Deepstack Classic',
    hours: [5, 17],
    minute: 30,
    gameType: 'mtt', maxSeats: 8, speed: 'deepstack', currency: 'play',
    entryFee: 10000, startingStack: 30000, levelMinutes: 15, lateRegLevels: 3,
    minPlayers: 2, guarantee: 50000,
    description: '8-max deepstack · 10,000 play-chip entry · 50,000 guaranteed',
  },
];

module.exports = { LADDERS, ladderFor, levelMinutesFor, blindForLevel, CASH_STAKES, SNG_PLAY_BUYINS, SNG_BTC_USD, MTT_CALENDAR };
