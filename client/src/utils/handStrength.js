// Client-side hand strength evaluation
const VALUE_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

const PREFLOP_STRENGTH = {
  'AA':1.00,'KK':0.97,'QQ':0.93,'JJ':0.88,'AKs':0.87,'TT':0.83,'AQs':0.82,'AKo':0.80,
  'AJs':0.78,'KQs':0.77,'99':0.76,'ATs':0.75,'AQo':0.74,'KJs':0.72,'88':0.71,'KTs':0.69,
  'QJs':0.68,'AJo':0.67,'77':0.66,'KQo':0.65,'A9s':0.64,'QTs':0.63,'KJo':0.62,'ATo':0.61,
  '66':0.60,'A8s':0.59,'JTs':0.58,'KTo':0.57,'QJo':0.56,'55':0.55,'A7s':0.54,'A9o':0.53,
  'QTo':0.52,'44':0.51,'JTo':0.50,'A6s':0.49,'33':0.47,'A5s':0.46,'A8o':0.45,'A4s':0.44,
  '22':0.43,'A7o':0.42,'A3s':0.41,'A5o':0.40,'A6o':0.39,'A2s':0.38,'A4o':0.37,'A3o':0.35,'A2o':0.33,
};

function cv(card) { return VALUE_MAP[card[0]] || 0; }
function cs(card) { return card[1]; }

function preflopKey(h1, h2) {
  const v1 = cv(h1), v2 = cv(h2);
  const s1 = cs(h1), s2 = cs(h2);
  const hi = v1 >= v2 ? h1 : h2;
  const lo = v1 >= v2 ? h2 : h1;
  const vHi = cv(hi), vLo = cv(lo);
  const suited = s1 === s2;
  const vals = 'A K Q J T 9 8 7 6 5 4 3 2'.split(' ');
  const hv = vals[14 - vHi] || vHi;
  const lv = vals[14 - vLo] || vLo;
  if (vHi === vLo) return `${hv}${hv}`;
  return `${hv}${lv}${suited ? 's' : 'o'}`;
}

function rankCards(fiveCards) {
  const vals = fiveCards.map(cv).sort((a, b) => b - a);
  const suits = fiveCards.map(cs);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const uv = [...new Set(vals)].sort((a, b) => b - a);
  const isStraight = (uv.length >= 5 && uv[0] - uv[4] === 4) ||
    (JSON.stringify(uv.slice(0, 5)) === JSON.stringify([14, 5, 4, 3, 2]));

  if (isFlush && isStraight) return 8;
  if (groups[0] === 4) return 7;
  if (groups[0] === 3 && groups[1] === 2) return 6;
  if (isFlush) return 5;
  if (isStraight) return 4;
  if (groups[0] === 3) return 3;
  if (groups[0] === 2 && groups[1] === 2) return 2;
  if (groups[0] === 2) return 1;
  return 0;
}

function getCombos(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [...getCombos(rest, k - 1).map(c => [first, ...c]), ...getCombos(rest, k)];
}

function bestHandRank(hole, community) {
  const all = [...hole, ...community];
  if (all.length < 5) return -1;
  const combos = getCombos(all, 5);
  return Math.max(...combos.map(rankCards));
}

const RANK_LABELS = ['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
const RANK_STRENGTHS = [10, 28, 42, 55, 65, 72, 82, 92, 100];

export function getHandStrength(myCards, community) {
  if (!myCards || myCards.length < 2) return null;

  // Pre-flop: use lookup table
  if (!community || community.length === 0) {
    const key = preflopKey(myCards[0], myCards[1]);
    const str = PREFLOP_STRENGTH[key];
    return { pct: str != null ? Math.round(str * 100) : 45, label: 'Pre-Flop', rank: -1 };
  }

  const rank = bestHandRank(myCards, community);
  if (rank < 0) return null;
  return {
    pct: RANK_STRENGTHS[rank],
    label: RANK_LABELS[rank],
    rank,
  };
}
