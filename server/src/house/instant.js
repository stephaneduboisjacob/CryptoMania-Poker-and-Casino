// Instant house games — pure, server-authoritative RNG outcomes.
// EVERY game's long-run return is below 1.0 (house-favorable); exact RTP is
// verified computationally in test/instant-verify.js before deploy.
//
// Slots use explicit par sheets (weighted outcome tables) — the industry
// approach: RTP is a designed constant, not an accident.

// ─── Slots ──────────────────────────────────────────────────────────────────
// Each machine: symbols + weighted outcome par sheet. 'ANY' fills a random
// non-conflicting symbol at display time. Outcomes checked top-down.

const SLOT_MACHINES = {
  // ── Originals ──
  'bitcoin-bonanza': {
    name: 'Bitcoin Bonanza', targetRtp: 0.96, volatility: 'medium', reels: 3,
    symbols: ['BTC', 'USD', 'GOLD', 'SEVEN', 'BAR', 'CHERRY'],
    sheet: [
      { syms: ['BTC', 'BTC', 'BTC'], pay: 150, w: 3 },
      { syms: ['USD', 'USD', 'USD'], pay: 60, w: 10 },
      { syms: ['GOLD', 'GOLD', 'GOLD'], pay: 25, w: 25 },
      { syms: ['SEVEN', 'SEVEN', 'SEVEN'], pay: 15, w: 35 },
      { syms: ['BAR', 'BAR', 'BAR'], pay: 8, w: 70 },
      { syms: ['CHERRY', 'CHERRY', 'CHERRY'], pay: 5, w: 100 },
      { syms: ['BTC', 'BTC', 'ANY'], pay: 4, w: 60 },
      { syms: ['CHERRY', 'CHERRY', 'ANY'], pay: 2, w: 300 },
      { syms: ['CHERRY', 'ANY', 'ANY'], pay: 1, w: 800 },
    ],
  },
  'heisenberg-special': {
    name: 'Heisenberg Special', targetRtp: 0.93, volatility: 'high', reels: 3,
    symbols: ['BTC', 'USD', 'GOLD', 'SEVEN', 'BAR', 'CHERRY'],
    sheet: [
      { syms: ['BTC', 'BTC', 'BTC'], pay: 500, w: 1 },
      { syms: ['USD', 'USD', 'USD'], pay: 100, w: 4 },
      { syms: ['GOLD', 'GOLD', 'GOLD'], pay: 40, w: 12 },
      { syms: ['SEVEN', 'SEVEN', 'SEVEN'], pay: 20, w: 30 },
      { syms: ['BAR', 'BAR', 'BAR'], pay: 10, w: 60 },
      { syms: ['CHERRY', 'CHERRY', 'CHERRY'], pay: 6, w: 90 },
      { syms: ['BTC', 'BTC', 'ANY'], pay: 5, w: 40 },
      { syms: ['CHERRY', 'CHERRY', 'ANY'], pay: 2, w: 250 },
      { syms: ['CHERRY', 'ANY', 'ANY'], pay: 1, w: 600 },
    ],
  },
  'cherry-classic': {
    name: 'Cherry Classic', targetRtp: 0.94, volatility: 'low', reels: 3,
    symbols: ['SEVEN', 'BAR', 'CHERRY'],
    sheet: [
      { syms: ['SEVEN', 'SEVEN', 'SEVEN'], pay: 50, w: 4 },
      { syms: ['BAR', 'BAR', 'BAR'], pay: 15, w: 20 },
      { syms: ['CHERRY', 'CHERRY', 'CHERRY'], pay: 8, w: 60 },
      { syms: ['BAR', 'BAR', 'ANY'], pay: 4, w: 120 },
      { syms: ['CHERRY', 'CHERRY', 'ANY'], pay: 2, w: 400 },
      { syms: ['CHERRY', 'ANY', 'ANY'], pay: 1, w: 1500 },
    ],
  },
  // ── The popular-lineup 12 ──
  'book-of-anubis': {
    name: 'Book of Anubis', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'egypt',
    symbols: ['BOOK', 'ANUBIS', 'PHARAOH', 'ANKH', 'SCARAB', 'PYRAMID'],
    sheet: [
      { syms: ['BOOK', 'BOOK', 'BOOK', 'BOOK', 'BOOK'], pay: 500, w: 1, feature: '10 FREE SPINS · expanding book' },
      { syms: ['ANUBIS', 'ANUBIS', 'ANUBIS', 'ANUBIS', 'ANUBIS'], pay: 200, w: 3 },
      { syms: ['PHARAOH', 'PHARAOH', 'PHARAOH', 'PHARAOH', 'ANY'], pay: 75, w: 8 },
      { syms: ['ANKH', 'ANKH', 'ANKH', 'ANY', 'ANY'], pay: 25, w: 30 },
      { syms: ['SCARAB', 'SCARAB', 'SCARAB', 'ANY', 'ANY'], pay: 10, w: 90 },
      { syms: ['PYRAMID', 'PYRAMID', 'ANY', 'ANY', 'ANY'], pay: 4, w: 400 },
      { syms: ['BOOK', 'BOOK', 'ANY', 'ANY', 'ANY'], pay: 2, w: 200, feature: '2 scatters — respin' },
      { syms: ['ANKH', 'ANKH', 'ANY', 'ANY', 'ANY'], pay: 1, w: 900 },
    ],
  },
  'gates-of-crypto': {
    name: 'Gates of Crypto', targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'olympus',
    symbols: ['ZEUS', 'ORB', 'CROWN', 'TRIDENT', 'HOURGLASS', 'RING'],
    sheet: [
      { syms: ['ZEUS', 'ZEUS', 'ZEUS', 'ZEUS', 'ZEUS'], pay: 5000, w: 1, feature: 'x500 multiplier' },
      { syms: ['ORB', 'ORB', 'ORB', 'ORB', 'ORB'], pay: 300, w: 2, feature: 'orbs paid' },
      { syms: ['CROWN', 'CROWN', 'CROWN', 'CROWN', 'ANY'], pay: 100, w: 6 },
      { syms: ['TRIDENT', 'TRIDENT', 'TRIDENT', 'ANY', 'ANY'], pay: 30, w: 25 },
      { syms: ['HOURGLASS', 'HOURGLASS', 'HOURGLASS', 'ANY', 'ANY'], pay: 12, w: 80 },
      { syms: ['RING', 'RING', 'ANY', 'ANY', 'ANY'], pay: 5, w: 350 },
      { syms: ['ORB', 'ORB', 'ANY', 'ANY', 'ANY'], pay: 3, w: 250, feature: 'x2 orbs' },
      { syms: ['RING', 'RING', 'ANY', 'ANY', 'ANY'], pay: 2, w: 500 },
    ],
  },
  'sweet-satoshi': {
    name: 'Sweet Satoshi', targetRtp: 0.96, volatility: 'medium', reels: 5,
    theme: 'candy',
    symbols: ['Lollipop', 'Candy', 'Strawberry', 'Grape', 'Bell', 'Star'],
    sheet: [
      { syms: ['Star', 'Star', 'Star', 'Star', 'Star'], pay: 400, w: 1, feature: 'tumble feast' },
      { syms: ['Lollipop', 'Lollipop', 'Lollipop', 'Lollipop', 'ANY'], pay: 80, w: 6 },
      { syms: ['Candy', 'Candy', 'Candy', 'ANY', 'ANY'], pay: 25, w: 35 },
      { syms: ['Strawberry', 'Strawberry', 'Strawberry', 'ANY', 'ANY'], pay: 12, w: 90 },
      { syms: ['Grape', 'Grape', 'ANY', 'ANY', 'ANY'], pay: 5, w: 400 },
      { syms: ['Bell', 'Bell', 'ANY', 'ANY', 'ANY'], pay: 2, w: 800 },
      { syms: ['Star', 'Star', 'ANY', 'ANY', 'ANY'], pay: 3, w: 150, feature: 'x3 tumble' },
      { syms: ['Bell', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1200 },
    ],
  },
  'big-bass-bytes': {
    name: 'Big Bass Bytes', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'fishing',
    symbols: ['Fisherman', 'BigBass', 'Fish', 'Tuna', 'Shrimp', 'Bobber'],
    sheet: [
      { syms: ['Fisherman', 'Fisherman', 'Fisherman', 'Fisherman', 'Fisherman'], pay: 600, w: 1, feature: 'catch the bass' },
      { syms: ['BigBass', 'BigBass', 'BigBass', 'BigBass', 'ANY'], pay: 120, w: 4, feature: 'bass bonus' },
      { syms: ['Fish', 'Fish', 'Fish', 'ANY', 'ANY'], pay: 30, w: 30 },
      { syms: ['Tuna', 'Tuna', 'Tuna', 'ANY', 'ANY'], pay: 12, w: 80 },
      { syms: ['Shrimp', 'Shrimp', 'ANY', 'ANY', 'ANY'], pay: 5, w: 350 },
      { syms: ['Bobber', 'Bobber', 'ANY', 'ANY', 'ANY'], pay: 2, w: 700 },
      { syms: ['Fisherman', 'Fish', 'ANY', 'ANY', 'ANY'], pay: 4, w: 120, feature: 'fisherman catches' },
      { syms: ['Bobber', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1100 },
    ],
  },
  'starburst-nova': {
    name: 'Starburst Nova', targetRtp: 0.96, volatility: 'low', reels: 5,
    theme: 'gems',
    symbols: ['Nova', 'Diamond', 'Sapphire', 'Emerald', 'Ruby', 'Amethyst'],
    sheet: [
      { syms: ['Nova', 'Nova', 'Nova', 'Nova', 'Nova'], pay: 250, w: 3, feature: 'wild re-spins' },
      { syms: ['Diamond', 'Diamond', 'Diamond', 'Diamond', 'ANY'], pay: 60, w: 15 },
      { syms: ['Sapphire', 'Sapphire', 'Sapphire', 'ANY', 'ANY'], pay: 20, w: 60 },
      { syms: ['Emerald', 'Emerald', 'Emerald', 'ANY', 'ANY'], pay: 10, w: 150 },
      { syms: ['Ruby', 'Ruby', 'ANY', 'ANY', 'ANY'], pay: 4, w: 500 },
      { syms: ['Amethyst', 'Amethyst', 'ANY', 'ANY', 'ANY'], pay: 2, w: 900 },
      { syms: ['Nova', 'Nova', 'ANY', 'ANY', 'ANY'], pay: 3, w: 300, feature: 're-spin' },
      { syms: ['Amethyst', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 2000 },
    ],
  },
  'wolf-pack-gold': {
    name: 'Wolf Pack Gold', targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'wilds',
    symbols: ['Wolf', 'Buffalo', 'Eagle', 'Deer', 'Moon', 'Gold'],
    sheet: [
      { syms: ['Wolf', 'Wolf', 'Wolf', 'Wolf', 'Wolf'], pay: 400, w: 1 },
      { syms: ['Buffalo', 'Buffalo', 'Buffalo', 'Buffalo', 'ANY'], pay: 90, w: 5 },
      { syms: ['Eagle', 'Eagle', 'Eagle', 'ANY', 'ANY'], pay: 25, w: 30 },
      { syms: ['Deer', 'Deer', 'Deer', 'ANY', 'ANY'], pay: 10, w: 90 },
      { syms: ['Moon', 'Moon', 'ANY', 'ANY', 'ANY'], pay: 4, w: 380 },
      { syms: ['Gold', 'Gold', 'ANY', 'ANY', 'ANY'], pay: 2, w: 700, feature: 'gold stampede' },
      { syms: ['Moon', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1300 },
    ],
  },
  'gonzos-ledger': {
    name: "Gonzo's Ledger", targetRtp: 0.95, volatility: 'medium', reels: 5,
    theme: 'adventure',
    symbols: ['Gonzo', 'Idol', 'Ledger', 'Compass', 'Map', 'Temple'],
    sheet: [
      { syms: ['Gonzo', 'Gonzo', 'Gonzo', 'Gonzo', 'Gonzo'], pay: 350, w: 1, feature: 'avalanche' },
      { syms: ['Idol', 'Idol', 'Idol', 'Idol', 'ANY'], pay: 80, w: 6 },
      { syms: ['Ledger', 'Ledger', 'Ledger', 'ANY', 'ANY'], pay: 25, w: 35 },
      { syms: ['Compass', 'Compass', 'Compass', 'ANY', 'ANY'], pay: 10, w: 100 },
      { syms: ['Map', 'Map', 'ANY', 'ANY', 'ANY'], pay: 4, w: 420 },
      { syms: ['Temple', 'Temple', 'ANY', 'ANY', 'ANY'], pay: 2, w: 750 },
      { syms: ['Gonzo', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1400 },
    ],
  },
  'money-train-express': {
    name: 'Money Train Express', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'heist',
    symbols: ['Train', 'Vault', 'Sheriff', 'Bandit', 'Rail', 'Coin'],
    sheet: [
      { syms: ['Train', 'Train', 'Train', 'Train', 'Train'], pay: 800, w: 1, feature: 'money cart bonus' },
      { syms: ['Vault', 'Vault', 'Vault', 'Vault', 'ANY'], pay: 150, w: 3, feature: 'vault opened' },
      { syms: ['Sheriff', 'Sheriff', 'Sheriff', 'ANY', 'ANY'], pay: 40, w: 22 },
      { syms: ['Bandit', 'Bandit', 'Bandit', 'ANY', 'ANY'], pay: 15, w: 70 },
      { syms: ['Rail', 'Rail', 'ANY', 'ANY', 'ANY'], pay: 5, w: 400 },
      { syms: ['Coin', 'Coin', 'ANY', 'ANY', 'ANY'], pay: 2, w: 800 },
      { syms: ['Train', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 3, w: 200, feature: 'express x3' },
      { syms: ['Coin', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1500 },
    ],
  },
  'fruit-party-palace': {
    name: 'Fruit Party Palace', targetRtp: 0.95, volatility: 'medium', reels: 5,
    theme: 'fruit',
    symbols: ['Apple', 'Watermelon', 'Grapes', 'Peach', 'Lemon', 'Strawb'],
    sheet: [
      { syms: ['Watermelon', 'Watermelon', 'Watermelon', 'Watermelon', 'Watermelon'], pay: 300, w: 2, feature: 'juicy cluster' },
      { syms: ['Apple', 'Apple', 'Apple', 'Apple', 'ANY'], pay: 70, w: 8 },
      { syms: ['Grapes', 'Grapes', 'Grapes', 'ANY', 'ANY'], pay: 22, w: 45 },
      { syms: ['Peach', 'Peach', 'Peach', 'ANY', 'ANY'], pay: 10, w: 110 },
      { syms: ['Lemon', 'Lemon', 'ANY', 'ANY', 'ANY'], pay: 4, w: 450 },
      { syms: ['Strawb', 'Strawb', 'ANY', 'ANY', 'ANY'], pay: 2, w: 850 },
      { syms: ['Lemon', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1600 },
    ],
  },
  'dead-or-alive-satoshi': {
    name: 'Dead or Alive: Satoshi', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'west',
    symbols: ['Sheriff', 'Outlaw', 'Horse', 'Whiskey', 'Bounty', 'Revolver'],
    sheet: [
      { syms: ['Outlaw', 'Outlaw', 'Outlaw', 'Outlaw', 'Outlaw'], pay: 700, w: 1, feature: 'wanted: dead or alive' },
      { syms: ['Sheriff', 'Sheriff', 'Sheriff', 'Sheriff', 'ANY'], pay: 130, w: 3 },
      { syms: ['Revolver', 'Revolver', 'Revolver', 'ANY', 'ANY'], pay: 35, w: 25 },
      { syms: ['Horse', 'Horse', 'Horse', 'ANY', 'ANY'], pay: 14, w: 75 },
      { syms: ['Whiskey', 'Whiskey', 'ANY', 'ANY', 'ANY'], pay: 5, w: 380 },
      { syms: ['Bounty', 'Bounty', 'ANY', 'ANY', 'ANY'], pay: 2, w: 750, feature: 'bounty hunt' },
      { syms: ['Bounty', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1400 },
    ],
  },
  'sugar-rush-satoshi': {
    name: 'Sugar Rush Satoshi', targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'sweets',
    symbols: ['Cupcake', 'Donut', 'Gummy', 'Macaron', 'Cake', 'Jelly'],
    sheet: [
      { syms: ['Cake', 'Cake', 'Cake', 'Cake', 'Cake'], pay: 450, w: 1, feature: 'sugar explosion' },
      { syms: ['Cupcake', 'Cupcake', 'Cupcake', 'Cupcake', 'ANY'], pay: 90, w: 5 },
      { syms: ['Donut', 'Donut', 'Donut', 'ANY', 'ANY'], pay: 28, w: 30 },
      { syms: ['Gummy', 'Gummy', 'Gummy', 'ANY', 'ANY'], pay: 11, w: 85 },
      { syms: ['Macaron', 'Macaron', 'ANY', 'ANY', 'ANY'], pay: 4, w: 400 },
      { syms: ['Jelly', 'Jelly', 'ANY', 'ANY', 'ANY'], pay: 2, w: 800 },
      { syms: ['Jelly', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1350 },
    ],
  },
  'crypto-queen': {
    name: 'Crypto Queen', targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'egypt-royal',
    symbols: ['Queen', 'Cobra', 'Crown', 'Scepter', 'Papyrus', 'Lotus'],
    sheet: [
      { syms: ['Queen', 'Queen', 'Queen', 'Queen', 'Queen'], pay: 500, w: 1, feature: 'royal decree' },
      { syms: ['Cobra', 'Cobra', 'Cobra', 'Cobra', 'ANY'], pay: 100, w: 4 },
      { syms: ['Crown', 'Crown', 'Crown', 'ANY', 'ANY'], pay: 30, w: 28 },
      { syms: ['Scepter', 'Scepter', 'Scepter', 'ANY', 'ANY'], pay: 12, w: 85 },
      { syms: ['Papyrus', 'Papyrus', 'ANY', 'ANY', 'ANY'], pay: 4, w: 400 },
      { syms: ['Lotus', 'Lotus', 'ANY', 'ANY', 'ANY'], pay: 2, w: 780 },
      { syms: ['Lotus', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1400 },
    ],
  }  , 'buffalo-ascension': {
    name: 'Buffalo Ascension', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'wilds',
    symbols: ['Alpha', 'Herd', 'Sun', 'Canyon', 'Talon', 'Storm'],
    sheet: [
      { syms: ['Alpha', 'Alpha', 'Alpha', 'Alpha', 'Alpha'], pay: 650, w: 1, feature: 'ascension stampede' },
      { syms: ['Herd', 'Herd', 'Herd', 'Herd', 'ANY'], pay: 140, w: 4 },
      { syms: ['Storm', 'Storm', 'Storm', 'ANY', 'ANY'], pay: 35, w: 26 },
      { syms: ['Sun', 'Sun', 'Sun', 'ANY', 'ANY'], pay: 13, w: 82 },
      { syms: ['Canyon', 'Canyon', 'ANY', 'ANY', 'ANY'], pay: 5, w: 390 },
      { syms: ['Talon', 'Talon', 'ANY', 'ANY', 'ANY'], pay: 2, w: 760 },
      { syms: ['Talon', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1450 },
    ],
  },
  'ras-fortune': {
    name: "Ra's Fortune", targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'egypt',
    symbols: ['Ra', 'SunDisk', 'Sphinx', 'Obelisk', 'Ankh2', 'Scarab2'],
    sheet: [
      { syms: ['Ra', 'Ra', 'Ra', 'Ra', 'Ra'], pay: 550, w: 1, feature: 'solar flare' },
      { syms: ['SunDisk', 'SunDisk', 'SunDisk', 'SunDisk', 'ANY'], pay: 110, w: 4 },
      { syms: ['Sphinx', 'Sphinx', 'Sphinx', 'ANY', 'ANY'], pay: 32, w: 27 },
      { syms: ['Obelisk', 'Obelisk', 'Obelisk', 'ANY', 'ANY'], pay: 12, w: 88 },
      { syms: ['Ankh2', 'Ankh2', 'ANY', 'ANY', 'ANY'], pay: 4, w: 410 },
      { syms: ['Scarab2', 'Scarab2', 'ANY', 'ANY', 'ANY'], pay: 2, w: 790 },
      { syms: ['Scarab2', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1420 },
    ],
  },
  'diamond-dynasty': {
    name: 'Diamond Dynasty', targetRtp: 0.96, volatility: 'low', reels: 5,
    theme: 'gems',
    symbols: ['Crown-jewel', 'Pearl', 'Topaz', 'Onyx', 'Jade', 'Opal'],
    sheet: [
      { syms: ['Crown-jewel', 'Crown-jewel', 'Crown-jewel', 'Crown-jewel', 'Crown-jewel'], pay: 220, w: 4, feature: 'dynasty re-spins' },
      { syms: ['Pearl', 'Pearl', 'Pearl', 'Pearl', 'ANY'], pay: 55, w: 18 },
      { syms: ['Topaz', 'Topaz', 'Topaz', 'ANY', 'ANY'], pay: 18, w: 70 },
      { syms: ['Onyx', 'Onyx', 'Onyx', 'ANY', 'ANY'], pay: 9, w: 170 },
      { syms: ['Jade', 'Jade', 'ANY', 'ANY', 'ANY'], pay: 4, w: 550 },
      { syms: ['Opal', 'Opal', 'ANY', 'ANY', 'ANY'], pay: 2, w: 1000 },
      { syms: ['Opal', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 2200 },
    ],
  },
  'leprechaun-vault': {
    name: "Leprechaun's Vault", targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'irish',
    symbols: ['Leprechaun', 'Pot', 'Clover', 'Harp', 'Rainbow', 'Mushroom'],
    sheet: [
      { syms: ['Leprechaun', 'Leprechaun', 'Leprechaun', 'Leprechaun', 'Leprechaun'], pay: 600, w: 1, feature: 'pot of gold raid' },
      { syms: ['Pot', 'Pot', 'Pot', 'Pot', 'ANY'], pay: 120, w: 4, feature: 'vault of gold' },
      { syms: ['Rainbow', 'Rainbow', 'Rainbow', 'ANY', 'ANY'], pay: 30, w: 28 },
      { syms: ['Harp', 'Harp', 'Harp', 'ANY', 'ANY'], pay: 12, w: 85 },
      { syms: ['Clover', 'Clover', 'ANY', 'ANY', 'ANY'], pay: 4, w: 400 },
      { syms: ['Mushroom', 'Mushroom', 'ANY', 'ANY', 'ANY'], pay: 2, w: 770 },
      { syms: ['Clover', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1430 },
    ],
  },
  'panda-fortune-crypto': {
    name: 'Panda Fortune Crypto', targetRtp: 0.95, volatility: 'medium', reels: 5,
    theme: 'asia',
    symbols: ['Panda', 'Bamboo', 'Yin', 'Lotus2', 'Coin2', 'Koi'],
    sheet: [
      { syms: ['Panda', 'Panda', 'Panda', 'Panda', 'Panda'], pay: 320, w: 2, feature: 'lucky panda' },
      { syms: ['Yin', 'Yin', 'Yin', 'Yin', 'ANY'], pay: 75, w: 8 },
      { syms: ['Bamboo', 'Bamboo', 'Bamboo', 'ANY', 'ANY'], pay: 24, w: 40 },
      { syms: ['Koi', 'Koi', 'Koi', 'ANY', 'ANY'], pay: 10, w: 105 },
      { syms: ['Lotus2', 'Lotus2', 'ANY', 'ANY', 'ANY'], pay: 4, w: 430 },
      { syms: ['Coin2', 'Coin2', 'ANY', 'ANY', 'ANY'], pay: 2, w: 820 },
      { syms: ['Coin2', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1550 },
    ],
  },
  'razor-returns-crypto': {
    name: 'Razor Returns Crypto', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'deep-sea',
    symbols: ['Shark', 'Razor', 'Torpedo', 'Diver', 'Pearl2', 'Anchor'],
    sheet: [
      { syms: ['Shark', 'Shark', 'Shark', 'Shark', 'Shark'], pay: 700, w: 1, feature: 'razor shark attack' },
      { syms: ['Razor', 'Razor', 'Razor', 'Razor', 'ANY'], pay: 130, w: 3, feature: 'razor wilds' },
      { syms: ['Torpedo', 'Torpedo', 'Torpedo', 'ANY', 'ANY'], pay: 34, w: 24 },
      { syms: ['Diver', 'Diver', 'Diver', 'ANY', 'ANY'], pay: 13, w: 78 },
      { syms: ['Pearl2', 'Pearl2', 'ANY', 'ANY', 'ANY'], pay: 5, w: 360 },
      { syms: ['Anchor', 'Anchor', 'ANY', 'ANY', 'ANY'], pay: 2, w: 720 },
      { syms: ['Anchor', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1380 },
    ],
  },
  'jokers-crypto-millions': {
    name: "Joker's Crypto Millions", targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'joker',
    symbols: ['Joker', 'Jester', 'Mask', 'Marbles', 'Cards', 'Bells2'],
    sheet: [
      { syms: ['Joker', 'Joker', 'Joker', 'Joker', 'Joker'], pay: 750, w: 1, feature: 'million-dollar grin' },
      { syms: ['Jester', 'Jester', 'Jester', 'Jester', 'ANY'], pay: 125, w: 3 },
      { syms: ['Mask', 'Mask', 'Mask', 'ANY', 'ANY'], pay: 33, w: 25 },
      { syms: ['Cards', 'Cards', 'Cards', 'ANY', 'ANY'], pay: 13, w: 76 },
      { syms: ['Marbles', 'Marbles', 'ANY', 'ANY', 'ANY'], pay: 5, w: 370 },
      { syms: ['Bells2', 'Bells2', 'ANY', 'ANY', 'ANY'], pay: 2, w: 740 },
      { syms: ['Bells2', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1410 },
    ],
  },
  'thunder-zeus-1000': {
    name: 'Thunder Zeus 1000', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'olympus',
    symbols: ['Zeus1000', 'Bolt', 'Eagle2', 'Shield', 'Column', 'Wreath'],
    sheet: [
      { syms: ['Zeus1000', 'Zeus1000', 'Zeus1000', 'Zeus1000', 'Zeus1000'], pay: 1000, w: 1, feature: 'x1000 thunder' },
      { syms: ['Bolt', 'Bolt', 'Bolt', 'Bolt', 'ANY'], pay: 160, w: 3, feature: 'bolts paid' },
      { syms: ['Eagle2', 'Eagle2', 'Eagle2', 'ANY', 'ANY'], pay: 36, w: 23 },
      { syms: ['Shield', 'Shield', 'Shield', 'ANY', 'ANY'], pay: 14, w: 74 },
      { syms: ['Column', 'Column', 'ANY', 'ANY', 'ANY'], pay: 5, w: 350 },
      { syms: ['Wreath', 'Wreath', 'ANY', 'ANY', 'ANY'], pay: 2, w: 710 },
      { syms: ['Wreath', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1360 },
    ],
  },
  'wild-west-gold-rush': {
    name: 'Wild West Gold Rush', targetRtp: 0.95, volatility: 'high', reels: 5,
    theme: 'west',
    symbols: ['Prospector', 'Nugget', 'Donkey', 'Pan', 'Saloon', 'Cactus'],
    sheet: [
      { syms: ['Prospector', 'Prospector', 'Prospector', 'Prospector', 'Prospector'], pay: 620, w: 1, feature: 'gold rush bonus' },
      { syms: ['Nugget', 'Nugget', 'Nugget', 'Nugget', 'ANY'], pay: 115, w: 4, feature: 'nugget frenzy' },
      { syms: ['Donkey', 'Donkey', 'Donkey', 'ANY', 'ANY'], pay: 31, w: 26 },
      { syms: ['Pan', 'Pan', 'Pan', 'ANY', 'ANY'], pay: 12, w: 80 },
      { syms: ['Saloon', 'Saloon', 'ANY', 'ANY', 'ANY'], pay: 4, w: 395 },
      { syms: ['Cactus', 'Cactus', 'ANY', 'ANY', 'ANY'], pay: 2, w: 755 },
      { syms: ['Cactus', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1400 },
    ],
  },
  'egyptian-gold-rush': {
    name: 'Egyptian Gold Rush', targetRtp: 0.96, volatility: 'high', reels: 5,
    theme: 'egypt',
    symbols: ['Cleopatra', 'Sarcophagus', 'Cat', 'Fan', 'Uraeus', 'Sand'],
    sheet: [
      { syms: ['Cleopatra', 'Cleopatra', 'Cleopatra', 'Cleopatra', 'Cleopatra'], pay: 640, w: 1, feature: 'gold rush of the nile' },
      { syms: ['Sarcophagus', 'Sarcophagus', 'Sarcophagus', 'Sarcophagus', 'ANY'], pay: 118, w: 4 },
      { syms: ['Cat', 'Cat', 'Cat', 'ANY', 'ANY'], pay: 30, w: 27 },
      { syms: ['Uraeus', 'Uraeus', 'Uraeus', 'ANY', 'ANY'], pay: 12, w: 84 },
      { syms: ['Fan', 'Fan', 'ANY', 'ANY', 'ANY'], pay: 4, w: 405 },
      { syms: ['Sand', 'Sand', 'ANY', 'ANY', 'ANY'], pay: 2, w: 780 },
      { syms: ['Sand', 'ANY', 'ANY', 'ANY', 'ANY'], pay: 1, w: 1440 },
    ],
  },

};


// Exact-RTP by construction: the losing weight is derived from the target RTP.
for (const m of Object.values(SLOT_MACHINES)) {
  const winW = m.sheet.reduce((s, o) => s + o.w, 0);
  const ret = m.sheet.reduce((s, o) => s + o.w * o.pay, 0);
  m.loseWeight = Math.round(ret / m.targetRtp - winW);
}

function slotRtp(machineId) {
  const m = SLOT_MACHINES[machineId];
  if (!m) return null;
  const winW = m.sheet.reduce((s, o) => s + o.w, 0);
  const ret = m.sheet.reduce((s, o) => s + o.w * o.pay, 0);
  return ret / (winW + m.loseWeight);
}

function spinSlots(machineId, rng = Math.random) {
  const m = SLOT_MACHINES[machineId];
  if (!m) return null;
  const total = m.sheet.reduce((s, o) => s + o.w, 0) + m.loseWeight;
  let roll = rng() * total;
  let outcome = null;
  for (const o of m.sheet) {
    roll -= o.w;
    if (roll <= 0) { outcome = o; break; }
  }
  if (!outcome) {
    return { reels: randomReels(m, null, rng), pay: 0, combo: null };
  }
  // Concrete reels consistent with the outcome (ANY = random non-conflicting)
  const reels = outcome.syms.map((s, i) => {
    if (s !== 'ANY') return s;
    // avoid completing anything richer: exclude symbols already fixed in this outcome
    const fixed = outcome.syms.filter((x, j) => j !== i && x !== 'ANY');
    const pool = m.symbols.filter(sym => !fixed.includes(sym));
    return pool[Math.floor(rng() * pool.length)];
  });
  // lose spin: purely cosmetic random reels guaranteed not to match any win
  if (!outcome) {
    return { reels, pay: 0, combo: null };
  }
  return { reels, pay: outcome.pay, combo: outcome.syms.join(' ') };
}

function randomReels(m, avoid, rng = Math.random) {
  const n = m.reels || 3;
  for (let tries = 0; tries < 50; tries++) {
    const r = Array.from({ length: n }, () => m.symbols[Math.floor(rng() * m.symbols.length)]);
    if (!evaluatesToWin(m, r)) return r;
  }
  // Keep the configured reel count even when an injected/deterministic RNG
  // repeatedly lands on winning-looking cosmetic combinations.
  const total = m.symbols.length ** n;
  for (let value = 0; value < total; value++) {
    let encoded = value;
    const candidate = Array(n);
    for (let i = n - 1; i >= 0; i--) {
      candidate[i] = m.symbols[encoded % m.symbols.length];
      encoded = Math.floor(encoded / m.symbols.length);
    }
    if (!evaluatesToWin(m, candidate)) return candidate;
  }
  throw new Error(`Slot machine ${m.name} has no losing reel combination`);
}

function evaluatesToWin(m, reels) {
  for (const o of m.sheet) {
    if (o.syms.every((s, i) => s === 'ANY' || s === reels[i])) {
      // exact-only entries (triples) must not match via ANY fill duplication
      const anyCount = o.syms.filter(s => s === 'ANY').length;
      if (anyCount === 0) return reels.every((s, i) => s === o.syms[i]);
      return true;
    }
  }
  return false;
}

// ─── Dice (crypto classic) — 1% house edge ──────────────────────────────────
// Roll uniform [0, 100). Player picks target 2-98 and direction.
// multiplier = 99 / winChance  →  EV = chance × 99/chance = 0.99.

function playDice(target, direction, rng = Math.random) {
  target = Math.round(Number(target));
  if (!(target >= 2 && target <= 98)) return { error: 'Target must be 2-98' };
  if (direction !== 'under' && direction !== 'over') return { error: 'Direction must be under|over' };
  const roll = Math.floor(rng() * 10000) / 100; // 0.00–99.99
  const chance = direction === 'under' ? target : 100 - target;
  const multiplier = Math.floor((99 / chance) * 10000) / 10000;
  const win = direction === 'under' ? roll < target : roll > target;
  return { roll, target, direction, win, chance, multiplier };
}

// ─── Video Poker — 8/5 Jacks or Better (~97.3% RTP vs optimal play) ─────────

const VP_PAYTABLE = {
  royal: 250, straightflush: 50, quads: 25, fullhouse: 8,
  flush: 5, straight: 4, trips: 3, twopair: 2, jacks: 1, none: 0,
};

function vpEvaluate(cards) {
  const ranks = '23456789TJQKA';
  const rv = c => ranks.indexOf(c[0]) + 2;
  const suit = c => c[1];
  const values = cards.map(rv).sort((a, b) => a - b);
  const suits = cards.map(suit);
  const flush = suits.every(s => s === suits[0]);
  const uniq = [...new Set(values)];
  let straight = false;
  if (uniq.length === 5) {
    if (values[4] - values[0] === 4) straight = true;
    else if (JSON.stringify(values) === JSON.stringify([2, 3, 4, 5, 14])) straight = true; // wheel
  }
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  const royal = flush && straight && values[0] === 10;

  if (royal) return 'royal';
  if (flush && straight) return 'straightflush';
  if (groups[0] === 4) return 'quads';
  if (groups[0] === 3 && groups[1] === 2) return 'fullhouse';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'trips';
  if (groups[0] === 2 && groups[1] === 2) return 'twopair';
  // Jacks or better
  for (const [v, n] of Object.entries(counts)) {
    if (n === 2 && parseInt(v, 10) >= 11) return 'jacks';
  }
  return 'none';
}

function vpDeck() {
  const deck = [];
  for (const r of '23456789TJQKA') for (const s of 'shdc') deck.push(r + s);
  return deck;
}

function vpDeal(rng = Math.random) {
  // 5-card deal via Fisher-Yates draws; caller can continue the same deck
  const deck = vpDeck();
  const dealt = [];
  for (let i = 0; i < 5; i++) {
    const j = i + Math.floor(rng() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
    dealt.push(deck[i]);
  }
  return { dealt, remaining: deck.slice(5) };
}

// ─── Plinko — 16 rows, 3 risk levels (RTP verified below) ───────────────────

const PLINKO_ROWS = 16;
const PLINKO_TABLES = {
  low:    [16, 5, 2, 1.6, 1.3, 1.1, 1, 0.9, 0.8, 0.9, 1, 1.1, 1.3, 1.6, 2, 5, 16],     // ~96.3%
  medium: [120, 42, 11, 5.5, 3, 1.5, 0.9, 0.5, 0.2, 0.5, 0.9, 1.5, 3, 5.5, 11, 42, 120],  // ~96.0%
  high:   [440, 120, 30, 8, 3, 1, 0.7, 0.4, 0.2, 0.4, 0.7, 1, 3, 8, 30, 120, 440],     // ~96.9%
};

function plinkoRtp(risk) {
  const row = PLINKO_TABLES[risk];
  if (!row) return null;
  let sum = 0;
  for (let k = 0; k <= PLINKO_ROWS; k++) {
    sum += binom(PLINKO_ROWS, k) * row[k];
  }
  return sum / Math.pow(2, PLINKO_ROWS);
}

function binom(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

function minesMultiplier(minesCount, revealed) {
  if (!Number.isInteger(minesCount) || minesCount < 1 || minesCount > 24) return null;
  if (!Number.isInteger(revealed) || revealed < 0 || revealed > 25 - minesCount) return null;
  return Math.floor(0.97 * (binom(25, revealed) / binom(25 - minesCount, revealed)) * 100) / 100;
}

function playPlinko(risk, rng = Math.random) {
  const row = PLINKO_TABLES[risk];
  if (!row) return { error: 'Risk must be low|medium|high' };
  const path = [];
  let pos = 0;
  for (let i = 0; i < PLINKO_ROWS; i++) {
    const right = rng() < 0.5 ? 1 : 0;
    pos += right;
    path.push(right);
  }
  const multiplier = row[pos];
  return { risk, path, bucket: pos, multiplier };
}

// ─── Baccarat (Punto Banco) — used by the live table ────────────────────────
// Payouts: Player 2x (1:1), Banker 1.95x (5% commission), Tie 9x (8:1).
// House edge: Player 1.24%, Banker 1.06%, Tie 14.4%.

function baccaratValue(cards) {
  let total = 0;
  for (const c of cards) {
    const r = c[0];
    if (r === 'A') total += 1;
    else if (['T', 'J', 'Q', 'K'].includes(r)) total += 0;
    else total += parseInt(r, 10);
  }
  return total % 10;
}

// Plays out a full coup from a shuffled deck array (mutates via pop).
// Returns {playerCards, bankerCards, playerTotal, bankerTotal, outcome}
function playBaccaratCoup(drawCard) {
  const playerCards = [drawCard(), drawCard()];
  const bankerCards = [drawCard(), drawCard()];
  let p = baccaratValue(playerCards);
  let b = baccaratValue(bankerCards);

  let playerThird = null;
  if (p < 8 && b < 8) { // natural check — no more cards if either has 8/9
    if (p <= 5) {
      playerThird = drawCard();
      playerCards.push(playerThird);
      p = baccaratValue(playerCards);
    }
    // Banker tableau
    const t = playerThird ? baccaratValue([playerThird]) : null;
    let bankerDraws = false;
    if (!playerThird) {
      bankerDraws = b <= 5;
    } else if (b <= 2) bankerDraws = true;
    else if (b === 3) bankerDraws = t !== 8;
    else if (b === 4) bankerDraws = t >= 2 && t <= 7;
    else if (b === 5) bankerDraws = t >= 4 && t <= 7;
    else if (b === 6) bankerDraws = t === 6 || t === 7;
    if (bankerDraws) {
      bankerCards.push(drawCard());
      b = baccaratValue(bankerCards);
    }
  }

  let outcome; // 'player' | 'banker' | 'tie'
  if (p > b) outcome = 'player';
  else if (b > p) outcome = 'banker';
  else outcome = 'tie';
  return { playerCards, bankerCards, playerTotal: p, bankerTotal: b, outcome };
}

module.exports = {
  SLOT_MACHINES, slotRtp, spinSlots,
  playDice, VP_PAYTABLE, vpEvaluate, vpDeal, vpDeck,
  PLINKO_TABLES, plinkoRtp, playPlinko,
  baccaratValue, playBaccaratCoup, minesMultiplier,
};
