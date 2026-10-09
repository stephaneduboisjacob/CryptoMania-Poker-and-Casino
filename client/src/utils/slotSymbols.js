// Slot symbol display config: id → emoji + per-machine theme styling.
// Server machine symbols are ids; the client renders emoji with themed accents.
export const SLOT_SYMBOL_EMOJI = {
  // originals
  BTC: '₿', USD: '$', GOLD: '🪙', SEVEN: '7️⃣', BAR: '🏅', CHERRY: '🍒',
  // book of anubis
  BOOK: '📕', ANUBIS: '🐺', PHARAOH: '🎭', ANKH: '☥', SCARAB: '🪲', PYRAMID: '🔺',
  // gates of crypto
  ZEUS: '⚡', ORB: '🔮', CROWN: '👑', TRIDENT: '🔱', HOURGLASS: '⏳', RING: '💍',
  // sweet satoshi
  Lollipop: '🍭', Candy: '🍬', Strawberry: '🍓', Grape: '🍇', Bell: '🔔', Star: '⭐',
  // big bass bytes
  Fisherman: '🎣', BigBass: '🐟', Fish: '🐠', Tuna: '🐡', Shrimp: '🦐', Bobber: '🔴',
  // starburst nova
  Nova: '🌟', Diamond: '💎', Sapphire: '🔹', Emerald: '💚', Ruby: '❤️‍🔥', Amethyst: '🟣',
  // wolf pack gold
  Wolf: '🐺', Buffalo: '🐃', Eagle: '🦅', Deer: '🦌', Moon: '🌙', Gold: '🪙',
  // gonzos ledger
  Gonzo: '🧭', Idol: '🗿', Ledger: '📒', Compass: '🧭', Map: '🗺️', Temple: '🏛️',
  // money train express
  Train: '🚂', Vault: '🏦', Sheriff: '⭐', Bandit: '🤠', Rail: '🛤️', Coin: '🪙',
  // fruit party palace
  Apple: '🍎', Watermelon: '🍉', Grapes: '🍇', Peach: '🍑', Lemon: '🍋', Strawb: '🍓',
  // dead or alive satoshi
  Outlaw: '🤠', Horse: '🐴', Whiskey: '🥃', Bounty: '💵', Revolver: '🔫',
  // sugar rush satoshi
  Cupcake: '🧁', Donut: '🍩', Gummy: '🐻', Macaron: '🍡', Cake: '🍰', Jelly: '🍮',
  // crypto queen
  Queen: '👸', Crown: '👑', Cobra: '🐍', Scepter: '🪄', Papyrus: '📜', Lotus: '🪷',
  // buffalo ascension
  Alpha: '🐃', Herd: '🦬', Sun: '☀️', Canyon: '⛰️', Talon: '🦅', Storm: '🌩️',
  // ras fortune
  Ra: '☀️', SunDisk: '🌞', Sphinx: '🗿', Obelisk: '🗼', Ankh2: '☥', Scarab2: '🪲',
  // diamond dynasty
  'Crown-jewel': '💎', Pearl: '🦪', Topaz: '🔶', Onyx: '⚫', Jade: '🟢', Opal: '🔮',
  // leprechaun vault
  Leprechaun: '🧝', Pot: '🏺', Clover: '☘️', Harp: '🎼', Rainbow: '🌈', Mushroom: '🍄',
  // panda fortune crypto
  Panda: '🐼', Bamboo: '🎋', Yin: '☯️', Lotus2: '🪷', Coin2: '🪙', Koi: '🐟',
  // razor returns crypto
  Shark: '🦈', Razor: '🗡️', Torpedo: '🚀', Diver: '🤿', Pearl2: '🦪', Anchor: '⚓',
  // jokers crypto millions
  Joker: '🃏', Jester: '🤡', Mask: '🎭', Marbles: '🔮', Cards: '🂡', Bells2: '🔔',
  // thunder zeus 1000
  Zeus1000: '⚡', Bolt: '🌩️', Eagle2: '🦅', Shield: '🛡️', Column: '🏛️', Wreath: '🌿',
  // wild west gold rush
  Prospector: '🤠', Nugget: '🪙', Donkey: '🫏', Pan: '🥣', Saloon: '🤠', Cactus: '🌵',
  // egyptian gold rush
  Cleopatra: '👑', Sarcophagus: '⚱️', Cat: '🐈‍⬛', Fan: '🪭', Uraeus: '🐍', Sand: '🏜️',
};

// Per-machine visual theme for reels + cards (gradients in CSS)
export const SLOT_THEMES = {
  'bitcoin-bonanza':      { grad: 'linear-gradient(160deg,#3a2205,#120a02)', accent: '#f7931a' },
  'heisenberg-special':   { grad: 'linear-gradient(160deg,#1e2b4a,#0e1424)', accent: '#8b5cf6' },
  'cherry-classic':       { grad: 'linear-gradient(160deg,#3a0d12,#1a0508)', accent: '#ef4444' },
  'book-of-anubis':       { grad: 'linear-gradient(160deg,#2e2410,#8a6d1d)', accent: '#eab308' },
  'gates-of-crypto':      { grad: 'linear-gradient(160deg,#1a2a5e,#4c1a5e)', accent: '#a78bfa' },
  'sweet-satoshi':        { grad: 'linear-gradient(160deg,#5e1a4a,#8a2d6d)', accent: '#f472b6' },
  'big-bass-bytes':       { grad: 'linear-gradient(160deg,#0a2e5e,#1d5e8a)', accent: '#38bdf8' },
  'starburst-nova':       { grad: 'linear-gradient(160deg,#0e1a3a,#1a1040)', accent: '#818cf8' },
  'wolf-pack-gold':       { grad: 'linear-gradient(160deg,#26200a,#4a3d12)', accent: '#d97706' },
  'gonzos-ledger':        { grad: 'linear-gradient(160deg,#0a3a26,#0d5034)', accent: '#10b981' },
  'money-train-express':  { grad: 'linear-gradient(160deg,#3a120a,#5e1e10)', accent: '#f87171' },
  'fruit-party-palace':   { grad: 'linear-gradient(160deg,#4a1a0a,#7a2d10)', accent: '#fb923c' },
  'dead-or-alive-satoshi':{ grad: 'linear-gradient(160deg,#33261a,#5e4726)', accent: '#d4a574' },
  'sugar-rush-satoshi':   { grad: 'linear-gradient(160deg,#4a0a3a,#7a1060)', accent: '#e879f9' },
  'crypto-queen':         { grad: 'linear-gradient(160deg,#20103a,#3a1a5e)', accent: '#c084fc' },
  'buffalo-ascension':    { grad: 'linear-gradient(160deg,#33210c,#8b4d13)', accent: '#f6b642' },
  'ras-fortune':          { grad: 'linear-gradient(160deg,#102c37,#9a6a16)', accent: '#f3c969' },
  'diamond-dynasty':      { grad: 'linear-gradient(160deg,#0d264a,#263c72)', accent: '#7dd3fc' },
  'leprechaun-vault':     { grad: 'linear-gradient(160deg,#073524,#126145)', accent: '#7de3a1' },
  'panda-fortune-crypto': { grad: 'linear-gradient(160deg,#27110d,#7c2027)', accent: '#ffcf70' },
  'razor-returns-crypto': { grad: 'linear-gradient(160deg,#092833,#0a6070)', accent: '#67e8f9' },
  'jokers-crypto-millions':{ grad: 'linear-gradient(160deg,#251044,#54206f)', accent: '#e879f9' },
  'thunder-zeus-1000':    { grad: 'linear-gradient(160deg,#09244e,#0e5592)', accent: '#6ee7f9' },
  'wild-west-gold-rush':  { grad: 'linear-gradient(160deg,#332216,#805222)', accent: '#f3be65' },
  'egyptian-gold-rush':   { grad: 'linear-gradient(160deg,#38240b,#936414)', accent: '#f5d36e' },
};

// Keep the cabinet geometry available even if an older API process omits its
// reelCount field. The par-sheet outcomes remain server-authoritative.
export const SLOT_REEL_COUNTS = Object.freeze({
  'bitcoin-bonanza': 3,
  'heisenberg-special': 3,
  'cherry-classic': 3,
  'book-of-anubis': 5,
  'gates-of-crypto': 5,
  'sweet-satoshi': 5,
  'big-bass-bytes': 5,
  'starburst-nova': 5,
  'wolf-pack-gold': 5,
  'gonzos-ledger': 5,
  'money-train-express': 5,
  'fruit-party-palace': 5,
  'dead-or-alive-satoshi': 5,
  'sugar-rush-satoshi': 5,
  'crypto-queen': 5,
  'buffalo-ascension': 5,
  'ras-fortune': 5,
  'diamond-dynasty': 5,
  'leprechaun-vault': 5,
  'panda-fortune-crypto': 5,
  'razor-returns-crypto': 5,
  'jokers-crypto-millions': 5,
  'thunder-zeus-1000': 5,
  'wild-west-gold-rush': 5,
  'egyptian-gold-rush': 5,
});

export function slotReelCount(machineKey, apiReelCount) {
  return SLOT_REEL_COUNTS[machineKey] || Number(apiReelCount) || 3;
}

// The generated covers were copied under several neighboring machine names.
// Keep the presentation mapping explicit so the lobby and cabinet use the
// artwork whose subject matches the selected game.
const SLOT_ARTWORK = {
  'bitcoin-bonanza': '/slot-money-train-express.webp',
  'heisenberg-special': '/slot-fruit-party-palace.webp',
  'cherry-classic': '/slot-dead-or-alive-satoshi.webp',
  'book-of-anubis': '/slot-sugar-rush-satoshi.webp',
  'gates-of-crypto': '/slot-crypto-queen.webp',
  'sweet-satoshi': '/slot-buffalo-ascension.webp',
  'big-bass-bytes': '/slot-ras-fortune.webp',
  'starburst-nova': '/slot-starburst-nova.webp',
  'wolf-pack-gold': '/slot-leprechaun-vault.webp',
  'gonzos-ledger': '/slot-panda-fortune-crypto.webp',
  'money-train-express': '/slot-bitcoin-bonanza.webp',
  'fruit-party-palace': '/slot-heisenberg-special.webp',
  'dead-or-alive-satoshi': '/slot-cherry-classic.webp',
  'sugar-rush-satoshi': '/slot-book-of-anubis.webp',
  'crypto-queen': '/slot-gates-of-crypto.webp',
  'buffalo-ascension': '/slot-sweet-satoshi.webp',
  'ras-fortune': '/slot-big-bass-bytes.webp',
  'diamond-dynasty': '/slot-diamond-dynasty.webp',
  'leprechaun-vault': '/slot-wolf-pack-gold.webp',
  'panda-fortune-crypto': '/slot-gonzos-ledger.webp',
  'razor-returns-crypto': '/slot-razor-returns-crypto.webp',
  'jokers-crypto-millions': '/slot-jokers-crypto-millions.webp',
  'thunder-zeus-1000': '/slot-thunder-zeus-1000.webp',
  'wild-west-gold-rush': '/slot-wild-west-gold-rush.webp',
  'egyptian-gold-rush': '/slot-egyptian-gold-rush.webp',
};

export function slotArtwork(machineKey) {
  return SLOT_ARTWORK[machineKey] || `/slot-${machineKey}.webp`;
}

export function symbolDisplay(id) {
  return SLOT_SYMBOL_EMOJI[id] || id;
}
