import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { isNative, getToken } from '../utils/tokenStorage';
import Navbar from '../components/Navbar';
import LobbyChat from '../components/LobbyChat';
import PokerHall from '../components/PokerHall';
import { SLOT_THEMES, slotArtwork } from '../utils/slotSymbols';
import {
  Star, Search, X, Gift, History, ShieldCheck, Flame, Users, Play,
  Dices, Spade, Bomb, Trophy, Coins, Sparkles,
  Bitcoin, ArrowRight,
} from 'lucide-react';

const SLOT_META = {
  'bitcoin-bonanza':        { icon: '₿',  tag: 'Classic' },
  'heisenberg-special':     { icon: '⚗️', tag: 'Signature' },
  'cherry-classic':         { icon: '🍒', tag: 'Retro' },
  'book-of-anubis':         { icon: '📕', tag: 'Adventure' },
  'gates-of-crypto':        { icon: '⚡', tag: 'High Volatility' },
  'sweet-satoshi':          { icon: '🍭', tag: 'Sweet Spins' },
  'big-bass-bytes':         { icon: '🎣', tag: 'Fishing' },
  'starburst-nova':         { icon: '💎', tag: 'Low Volatility' },
  'wolf-pack-gold':         { icon: '🐺', tag: 'Wilds' },
  'gonzos-ledger':          { icon: '🗿', tag: 'Expedition' },
  'money-train-express':    { icon: '🚂', tag: 'Heist' },
  'fruit-party-palace':     { icon: '🍎', tag: 'Fruit' },
  'dead-or-alive-satoshi':  { icon: '🤠', tag: 'Western' },
  'sugar-rush-satoshi':     { icon: '🧁', tag: 'Sweet Spins' },
  'crypto-queen':           { icon: '👑', tag: 'Royal' },
  'buffalo-ascension':      { icon: '🐃', tag: 'Wilds' },
  'ras-fortune':            { icon: '☀️', tag: 'Mythology' },
  'diamond-dynasty':        { icon: '💠', tag: 'Low Volatility' },
  'leprechaun-vault':       { icon: '🍀', tag: 'Adventure' },
  'panda-fortune-crypto':   { icon: '🐼', tag: 'Fortune' },
  'razor-returns-crypto':   { icon: '🦈', tag: 'High Volatility' },
  'jokers-crypto-millions': { icon: '🃏', tag: 'Wilds' },
  'thunder-zeus-1000':      { icon: '⚡', tag: 'High Volatility' },
  'wild-west-gold-rush':    { icon: '🤠', tag: 'Western' },
  'egyptian-gold-rush':     { icon: '𓂀', tag: 'Adventure' },
};

const FEATURED_SLOT_IDS = new Set(['heisenberg-special', 'bitcoin-bonanza', 'money-train-express', 'book-of-anubis']);
const CLASSIC_SLOT_IDS = new Set(['bitcoin-bonanza', 'cherry-classic', 'starburst-nova']);

const TABLE_ART = {
  blackjack: { icon: '♣', image: '/table-blackjack.png', grad: 'linear-gradient(150deg,#0d3a1e,#07210f)', ring: '#22c55e' },
  roulette:  { icon: '◯', image: '/table-roulette.png', grad: 'linear-gradient(150deg,#3a0d0d,#210505)', ring: '#ef4444' },
  baccarat:  { icon: '♦', image: '/table-baccarat.webp', grad: 'linear-gradient(150deg,#0a2536,#061521)', ring: '#38bdf8' },
  crash:     { icon: '🚀', image: '/table-crash.webp', grad: 'linear-gradient(150deg,#3a2005,#5e3208)', ring: '#f7931a' },
};

const CATEGORIES = [
  { key: 'slots',  label: 'Slots',       icon: '🎰', desc: '25 machines · jackpots · big multipliers', grad: 'linear-gradient(135deg,#4a1a08,#7a2d10)', ring: '#f7931a' },
  { key: 'tables', label: 'Table Games', icon: '🎲', desc: 'Blackjack · Roulette · Baccarat · Crash', grad: 'linear-gradient(135deg,#0d2a1e,#0a3a2a)', ring: '#10b981' },
  { key: 'poker',  label: 'Poker',       icon: '♠️', desc: 'Heads-up · Sit & Go · Tournaments', grad: 'linear-gradient(135deg,#1a1040,#31145e)', ring: '#8b5cf6' },
];

function readIdList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function categoryFromRoute(gameId) {
  return CATEGORIES.some(({ key }) => key === gameId) ? gameId : null;
}

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}

function SlotCard({ m, fav, onFav, onClick }) {
  const machineKey = m.machine || m.id?.replace(/^slots-/, '').replace(/-btc$/, '');
  const meta = SLOT_META[machineKey] || { icon: '🎰', tag: '' };
  const theme = SLOT_THEMES[machineKey] || { grad: 'linear-gradient(160deg,#17171a,#101012)', accent: '#f7931a' };
  return (
    <motion.article whileHover={{ y: -5 }} whileTap={{ scale: 0.985 }} onClick={onClick}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      role="button" tabIndex={0} aria-label={`Play ${m.label}`}
      className="slot-gallery-card group relative cursor-pointer overflow-hidden rounded-[20px]">
      <div className="slot-gallery-card__art relative aspect-[1.24/1] overflow-hidden" style={{ background: theme.grad }}>
        <img src={slotArtwork(machineKey)} alt={`${m.label} game cover`} loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.07]"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-black/10 to-black/10" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-md"
          style={{ color: theme.accent, background: 'rgba(7,7,8,.72)', borderColor: `${theme.accent}55` }}>
          <span className="text-[11px] leading-none">{meta.icon}</span>
          <span className="font-display text-[8px] font-bold uppercase tracking-[0.15em]">{meta.tag || 'Video slot'}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); onFav(m.id); }} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/55 text-white/65 backdrop-blur-md transition hover:scale-110 hover:text-amber-300">
          <Star size={14} fill={fav ? '#fbbf24' : 'none'} color={fav ? '#fbbf24' : 'currentColor'} />
        </button>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <div className="rounded-lg border border-white/15 bg-black/55 px-2 py-1 backdrop-blur-md">
            <span className="font-mono text-[8px] font-bold tracking-wider text-white/80">{m.reelCount || 3} REELS</span>
          </div>
          <span className="font-mono text-[8px] font-bold tracking-wider text-white/70">{m.currency === 'btc' ? '₿ BTC' : 'PLAY'}</span>
        </div>
        <div className="slot-gallery-card__launch absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-display text-[9px] font-black tracking-[0.2em] opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          style={{ color: '#140d05', background: `linear-gradient(135deg,${theme.accent},#f4d88a)` }}>
          <Play size={12} fill="currentColor" /> PLAY NOW
        </div>
      </div>
      <div className="slot-gallery-card__details flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[12px] font-extrabold tracking-wide text-white transition-colors group-hover:text-amber-200">{m.label}</h3>
          <p className="mt-1 font-mono text-[8px] tracking-[0.1em] text-white/40">MIN {fmt(m.min, m.currency)} <span className="mx-1 text-white/20">·</span> MAX {fmt(m.max, m.currency)}</p>
        </div>
        <div className="shrink-0 rounded-xl border px-2 py-1.5 text-right" style={{ color: theme.accent, borderColor: `${theme.accent}3f`, background: `${theme.accent}0d` }}>
          <p className="font-mono text-[7px] tracking-[0.15em] opacity-60">RTP</p>
          <p className="font-display text-[11px] font-black">{(m.rtp * 100).toFixed(0)}%</p>
        </div>
      </div>
    </motion.article>
  );
}

function TableCard({ t, fav, onFav, onClick }) {
  const a = TABLE_ART[t.game];
  const limits = t.currency === 'btc'
    ? `$${(t.minBet / 100).toFixed(2)}–$${Math.round(t.maxBet / 100)}`
    : `${t.minBet.toLocaleString()}–${t.maxBet.toLocaleString()}`;
  const sub = {
    blackjack: '3:2 · H17 · 6 decks',
    roulette: t.wheelType === 'american' ? 'Double zero · 35:1' : 'Single zero · 35:1',
    baccarat: 'P 1:1 · B 0.95:1 · T 8:1',
    crash: 'Cash out before the bust · 5000×',
  }[t.game];
  return (
    <motion.div whileHover={{ y: -3 }} onClick={onClick}
      className="glass-card rounded-2xl overflow-hidden cursor-pointer group relative">
      <button onClick={e => { e.stopPropagation(); onFav(t.id); }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/70">
        <Star size={12} fill={fav ? '#fbbf24' : 'none'} color={fav ? '#fbbf24' : '#a1a1aa'} />
      </button>
      <div className="h-32 relative flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: `linear-gradient(180deg,rgba(9,9,11,0.03),rgba(9,9,11,0.55)),url(${a.image})`, backgroundColor: a.grad }}>
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(circle at 70% 25%, rgba(255,255,255,0.28) 0%, transparent 45%)' }} />
        <span className="text-4xl" style={{ color: a.ring }}>{a.icon}</span>
        {t.players > 0 && (
          <span className="absolute bottom-1.5 left-1.5 text-[8px] font-mono text-heisenberg-green flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-heisenberg-green animate-pulse" /> {t.players} playing
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="font-display text-[11px] font-bold tracking-wide truncate group-hover:text-heisenberg-neon transition-colors">{t.name}</p>
        <p className="text-heisenberg-muted text-[9px] font-mono mt-0.5 truncate">{limits} · {sub}</p>
      </div>
    </motion.div>
  );
}

function Section({ title, count, children }) {
  return (
    <div className="mb-6">
      <p className="font-display text-[11px] tracking-[0.2em] uppercase text-heisenberg-muted mb-2.5">
        {title} {count != null && <span className="text-white/25">· {count}</span>}
      </p>
      {children}
    </div>
  );
}

export default function Casino() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { gameId } = useParams();
  const [house, setHouse] = useState(null);
  const [instant, setInstant] = useState(null);
  const [mine, setMine] = useState([]);
  const [pokerLobby, setPokerLobby] = useState({ cash: [], sngs: [], mtts: [] });
  const category = categoryFromRoute(gameId);
  const [query, setQuery] = useState('');
  const [slotFilter, setSlotFilter] = useState('all');
  const [favs, setFavs] = useState(() => readIdList('casino:favs'));
  const [recent, setRecent] = useState(() => readIdList('casino:recent'));
  const [btcMode, setBtcMode] = useState(false);
  const [bonus, setBonus] = useState(null);
  const [me, setMe] = useState(null);
  const [wins, setWins] = useState([]);
  const [jackpots, setJackpots] = useState(null);
  const [race, setRace] = useState(null);
  const [rakeback, setRakeback] = useState(null);
  const socketRef = useRef(null);
  const [casinoSocket, setCasinoSocket] = useState(null);

  const fetchAll = useCallback(async () => {
    const [h, b, m, j, r, rb, poker] = await Promise.allSettled([
      axios.get('/api/house/tables'), axios.get('/api/house/bonus/status'), axios.get('/api/house/me'),
      axios.get('/api/house/jackpots'), axios.get('/api/house/race'), axios.get('/api/house/rakeback'),
      axios.get('/api/poker/lobby'),
    ]);
    if (h.status === 'fulfilled') {
      setHouse(Array.isArray(h.value.data.tables) ? h.value.data.tables : []);
      setInstant(Array.isArray(h.value.data.instant) ? h.value.data.instant : []);
    }
    if (b.status === 'fulfilled') setBonus(b.value.data && typeof b.value.data === 'object' ? b.value.data : null);
    if (m.status === 'fulfilled') setMe(m.value.data && typeof m.value.data === 'object' ? m.value.data : null);
    if (j.status === 'fulfilled') setJackpots(Array.isArray(j.value.data?.jackpots) ? j.value.data.jackpots : []);
    if (r.status === 'fulfilled') {
      const value = r.value.data;
      setRace(value && typeof value === 'object' ? {
        ...value,
        prizes: Array.isArray(value.prizes) ? value.prizes : [],
        standings: Array.isArray(value.standings) ? value.standings : [],
      } : null);
    }
    if (rb.status === 'fulfilled') setRakeback(rb.value.data);
    if (poker.status === 'fulfilled') {
      setPokerLobby(poker.value.data);
      setMine(poker.value.data.mine || []);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 10000);
    let sock;
    let cancelled = false;
    (async () => {
      const socketUrl = isNative() ? (import.meta.env.VITE_SOCKET_URL || 'http://10.0.2.2:3001') : '/';
      const opts = { transports: ['websocket', 'polling'] };
      const token = await getToken();
      if (cancelled) return;
      if (token) opts.auth = { token };
      sock = io(socketUrl, opts);
      socketRef.current = sock;
      setCasinoSocket(sock);
      sock.on('casinoWin', (w) => setWins(prev => [w, ...prev].slice(0, 6)));
    })();
    return () => { cancelled = true; clearInterval(iv); sock?.disconnect(); socketRef.current = null; };
  }, [fetchAll]);

  const openCategory = (key) => {
    navigate(`/casino/game/${key}`);
  };
  const toggleFav = (id) => setFavs(f => {
    const next = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
    localStorage.setItem('casino:favs', JSON.stringify(next));
    return next;
  });
  const trackRecent = (id) => setRecent(r => {
    const next = [id, ...r.filter(x => x !== id)].slice(0, 8);
    localStorage.setItem('casino:recent', JSON.stringify(next));
    return next;
  });
  const claimRakeback = async () => {
    try {
      const res = await axios.post('/api/house/rakeback/claim');
      toast.success(`Rakeback claimed: +${Number(res.data.amount).toLocaleString()} chips (level ${res.data.level})`);
      fetchAll(); refreshUser();
    } catch (err) { toast.error(err.response?.data?.error || 'Claim failed'); }
  };

  const claimBonus = async () => {
    try {
      const res = await axios.post('/api/house/bonus/claim');
      toast.success(`Daily bonus: +${res.data.amount.toLocaleString()} chips (streak ${res.data.streak})`);
      setBonus(b => b ? { ...b, claimable: false } : b);
      refreshUser();
    } catch (err) { toast.error(err.response?.data?.error || 'Claim failed'); }
  };

  const currency = btcMode ? 'btc' : 'play';
  const slotMachines = (Array.isArray(instant) ? instant : []).filter(m => m && m.game === 'slots' && m.currency === currency);
  const tables = (Array.isArray(house) ? house : []).filter(t => t &&
    t.currency === currency && ['blackjack', 'roulette', 'baccarat', 'crash'].includes(t.game)
  );
  const q = query.trim().toLowerCase();
  const matchQ = (s) => !q || String(s || '').toLowerCase().includes(q);
  const filteredSlotMachines = slotMachines.filter(m => {
    const key = m.machine || m.id?.replace(/^slots-/, '').replace(/-btc$/, '');
    if (!matchQ(m.label)) return false;
    if (slotFilter === 'featured') return FEATURED_SLOT_IDS.has(key);
    if (slotFilter === 'high-rtp') return m.rtp >= 0.96;
    if (slotFilter === 'classics') return CLASSIC_SLOT_IDS.has(key);
    return true;
  });
  const bonusHours = bonus && !bonus.claimable ? Math.ceil((Number(bonus.canClaimIn) || 0) / 3600000) : 0;
  const racePrizes = Array.isArray(race?.prizes) ? race.prizes : [];
  const raceStandings = Array.isArray(race?.standings) ? race.standings : [];
  const tableUrl = (t) => t.game === 'blackjack' ? `/casino/blackjack/${t.id}` : t.game === 'roulette' ? `/casino/roulette/${t.id}` : t.game === 'baccarat' ? `/casino/baccarat/${t.id}` : `/casino/crash/${t.id}`;

  return (
    <div className="page-root" style={{ backgroundImage: 'url(/lobby-floor.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.45) 40%, rgba(9,9,11,0.82) 100%)' }} />
      <div className="relative z-10 flex flex-col h-full">
        <Navbar btcPrice={null} />
        <div className="page-scroll">
          <main className="container mx-auto px-4 py-5 max-w-6xl">

            <section className="relative isolate overflow-hidden rounded-[28px] border border-heisenberg-gold/25 min-h-[250px] md:min-h-[290px] mb-5 bg-cover bg-center"
              style={{ backgroundImage: 'url(/banner-jackpot.webp)' }}>
              <div className="absolute inset-0 z-0" style={{ background: 'linear-gradient(90deg,rgba(7,7,9,0.96) 0%,rgba(7,7,9,0.79) 42%,rgba(7,7,9,0.2) 100%),linear-gradient(0deg,rgba(7,7,9,0.78),transparent 65%)' }} />
              <img src="/jackpot-throne.webp" alt="The Bitcoin jackpot throne" className="absolute z-0 right-[-4%] bottom-[-20%] h-[125%] w-[58%] object-contain object-bottom opacity-85 pointer-events-none" />
              <img src="/chips-set.png" alt="" aria-hidden="true" className="absolute z-0 right-[32%] bottom-[-22%] h-[75%] w-[22%] object-contain opacity-40 pointer-events-none" />
              <div className="relative z-10 flex h-full min-h-[250px] md:min-h-[290px] flex-col justify-between gap-7 p-6 md:p-9">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-heisenberg-gold">THE HOUSE IS OPEN · A CRYPTO CASINO</p>
                  <h1 className="font-display text-3xl md:text-5xl font-black tracking-[0.08em] mt-2">HEISENBERG <span className="text-heisenberg-gold">CASINO</span></h1>
                  <p className="text-white/65 text-sm md:text-base mt-2 max-w-lg">Step into the vault. Find a game, review the limits, and choose how you want to play.</p>
                  <div className="crypto-acceptance mt-4"><Bitcoin size={14} /> 2,000+ cryptocurrencies accepted · not just Bitcoin</div>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {(jackpots || []).map(j => (
                      <div key={j.tier} className="rounded-xl border border-heisenberg-gold/25 bg-black/45 backdrop-blur-md px-3 py-2 min-w-[92px]">
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/45">{j.tier} pool</p>
                        <p className="font-display text-sm font-bold text-heisenberg-gold">{Number(j.pool).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => navigate('/wallet')} className="btn-ghost !py-2.5 !px-4 text-xs">Add funds</button>
                    <button onClick={() => openCategory('slots')} className="btn-primary !py-2.5 !px-5 text-xs inline-flex items-center gap-2">Explore games <ArrowRight size={13} /></button>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <div className="glass-card p-3.5 rounded-2xl flex items-center gap-3 md:col-span-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(247,147,26,0.14)', border: '1px solid rgba(247,147,26,0.4)' }}>
                  <Gift size={18} className="text-heisenberg-neon" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-bold tracking-wider">Daily Bonus</p>
                  <p className="text-heisenberg-muted text-[11px] font-mono">
                    {bonus ? (bonus.claimable ? `+${Number(bonus.amount || 0).toLocaleString()} chips · streak ${Number(bonus.streak || 0)}` : `Next in ${bonusHours}h`) : '…'}
                  </p>
                </div>
                {bonus?.claimable
                  ? <button onClick={claimBonus} className="btn-primary text-xs py-2 px-5 flex items-center gap-1.5 shrink-0"><Flame size={13} /> Claim</button>
                  : <span className="croom-chip shrink-0">🔒 {bonusHours}h</span>}
              </div>
              <div className="glass-card p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="font-display text-sm font-bold tracking-wider">Level {me?.level ?? '—'}</p>
                  <p className="text-heisenberg-muted text-[11px] font-mono">{me ? `${Number(me.wagered).toLocaleString()} wagered` : '…'}</p>
                </div>
                <button onClick={() => navigate('/casino/bets')} className="btn-ghost text-[10px] py-2 px-3 flex items-center gap-1">
                  <History size={12} /> My Bets
                </button>
              </div>
            </div>

            <div className="glass-card rounded-xl px-3 py-2 mb-5 flex items-center gap-3 overflow-hidden">
              <span className="flex items-center gap-1.5 text-[10px] font-display font-bold tracking-widest uppercase text-heisenberg-neon shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-heisenberg-neon animate-pulse" /> Live
              </span>
              <div className="flex-1 flex gap-4 overflow-hidden whitespace-nowrap">
                {wins.length === 0 && <span className="text-[10px] text-white/25 font-mono">Waiting for the next big hit…</span>}
                <AnimatePresence initial={false}>
                  {wins.map((w, i) => (
                    <motion.span key={w.at + '' + i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1 - i * 0.12, x: 0 }} exit={{ opacity: 0 }}
                      className="text-[10px] font-mono shrink-0">
                      <b className="text-white">{w.username}</b> <span className="text-heisenberg-muted">{w.game}</span> <span className="text-heisenberg-green">+{w.currency === 'btc' ? '$' + (w.payout / 100).toFixed(2) : Number(w.payout).toLocaleString()}</span>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {!category && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {CATEGORIES.map((c, i) => (
                    <motion.div key={c.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                      whileHover={{ y: -4, scale: 1.02 }}
                      onClick={() => openCategory(c.key)}
                      className="rounded-3xl overflow-hidden cursor-pointer group relative h-52 border border-white/10 hover:border-white/30 transition-colors"
                      style={{ backgroundImage: `url(/banner-${c.key === 'tables' ? 'tables' : c.key}.webp)`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.15) 0%, rgba(9,9,11,0.75) 78%, rgba(9,9,11,0.92) 100%)' }} />
                      <div className="relative h-full flex flex-col justify-between p-5">
                        <span className="text-5xl drop-shadow-lg" style={{ color: c.ring }}>{c.icon}</span>
                        <div>
                          <p className="font-display text-2xl font-black tracking-widest text-white" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>{c.label}</p>
                          <p className="text-white/60 text-[10px] font-mono mt-0.5">{c.desc}</p>
                        </div>
                        <ArrowRightIcon />
                      </div>
                    </motion.div>
                  ))}
                </div>

                {favs.length > 0 && (() => {
                  const allGames = [
                    ...slotMachines.map(m => ({ id: m.id, go: () => navigate(`/casino/slots/${m.id}`), label: m.label })),
                    ...tables.map(t => ({ id: t.id, go: () => navigate(tableUrl(t)), label: t.name })),
                  ];
                  const favGames = allGames.filter(g => favs.includes(g.id));
                  return favGames.length > 0 && (
                    <Section title="⭐ Favorites">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                        {favGames.map(g => (
                          <div key={g.id} onClick={g.go} className="glass-card rounded-xl p-3 cursor-pointer hover:border-heisenberg-neon/40 transition-colors">
                            <p className="font-display text-[10px] font-bold truncate">{g.label}</p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  );
                })()}

                {/* Rewards: rakeback + wager race */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div className="glass-card p-4 rounded-2xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)' }}>
                      <Coins size={18} className="text-heisenberg-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xs font-bold tracking-wider">Rakeback</p>
                      <p className="text-heisenberg-muted text-[10px] font-mono">
                        {rakeback ? `${Number(rakeback.available).toLocaleString()} available · level ${rakeback.level}` : '…'}
                      </p>
                    </div>
                    <button onClick={claimRakeback} disabled={!rakeback || rakeback.available <= 0}
                      className="btn-ghost text-[10px] py-2 px-3 disabled:opacity-40">Claim</button>
                  </div>
                  <div className="glass-card p-4 rounded-2xl relative overflow-hidden">
                    <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'url(/banner-race.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    <div className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-display text-xs font-bold tracking-wider flex items-center gap-1.5"><Trophy size={13} className="text-heisenberg-gold" /> Daily Wager Race</p>
                      <span className="text-[9px] font-mono text-heisenberg-gold">prizes {race ? racePrizes.map(p => Number(p || 0).toLocaleString()).join(' / ') : '…'}</span>
                    </div>
                    {raceStandings.slice(0, 3).map((s, i) => (
                      <div key={i} className="flex justify-between text-[10px] font-mono py-0.5">
                        <span className="text-white/70">#{i + 1} {s?.username || 'Player'}</span>
                        <span className="text-heisenberg-muted">{Number(s?.wagered || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    {(!race || raceStandings.length === 0) && <p className="text-[10px] text-white/25 font-mono">Be the first on today's board — every wager counts</p>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <motion.div whileHover={{ y: -2 }} className="glass-card p-4 rounded-2xl cursor-pointer flex items-center gap-3" onClick={() => navigate('/casino/fair')}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)' }}>
                      <ShieldCheck size={18} className="text-heisenberg-green" />
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-xs font-bold tracking-wider">Fairness Tools</p>
                      <p className="text-heisenberg-muted text-[10px] font-mono">Verify supported instant games</p>
                    </div>
                  </motion.div>
                  <motion.div whileHover={{ y: -2 }} className="glass-card p-4 rounded-2xl cursor-pointer flex items-center gap-3" onClick={() => navigate('/casino/bets')}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.35)' }}>
                      <History size={18} className="text-heisenberg-neon" />
                    </div>
                    <div className="flex-1">
                      <p className="font-display text-xs font-bold tracking-wider">Bet History</p>
                      <p className="text-heisenberg-muted text-[10px] font-mono">Every bet, every game</p>
                    </div>
                  </motion.div>
                </div>
              </>
            )}

            {category && (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <button onClick={() => { setQuery(''); navigate('/casino'); }} className="btn-ghost text-xs py-2 px-3">← Categories</button>
                  {CATEGORIES.filter(c => c.key === category).map(c => (
                    <span key={c.key} className="font-display text-lg font-black tracking-widest" style={{ color: c.ring }}>
                      {c.icon} {c.label.toUpperCase()}
                    </span>
                  ))}
                  <div className="flex-1" />
                  {category === 'slots' && (
                    <>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                          className="input-field !py-1.5 !pl-9 !pr-7 text-xs w-36" />
                        {query && <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30"><X size={12} /></button>}
                      </div>
                      <button onClick={() => setBtcMode(m => !m)} className="casino-tab !py-1.5 !px-3 !text-[10px]"
                        style={btcMode ? { color: '#f7931a', borderColor: 'rgba(247,147,26,0.5)', background: 'rgba(247,147,26,0.08)' } : {}}>
                        {btcMode ? '₿ BTC' : '✦ PLAY CHIPS'}
                      </button>
                    </>
                  )}
                  {category === 'tables' && (
                    <button onClick={() => setBtcMode(m => !m)} className="casino-tab !py-1.5 !px-3 !text-[10px]"
                      style={btcMode ? { color: '#f7931a', borderColor: 'rgba(247,147,26,0.5)', background: 'rgba(247,147,26,0.08)' } : {}}>
                      ₿ BTC {btcMode ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>

                {category === 'slots' ? (
                  <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="slot-vault-hero relative mb-6 overflow-hidden rounded-[26px] border border-heisenberg-gold/25"
                    style={{ backgroundImage: 'url(/banner-slots.webp)' }}>
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,rgba(7,8,9,.98) 0%,rgba(7,8,9,.9) 35%,rgba(7,8,9,.3) 76%,rgba(7,8,9,.12)),linear-gradient(0deg,rgba(7,8,9,.7),transparent 65%)' }} />
                    <div className="relative flex min-h-[220px] flex-col justify-between gap-6 p-5 sm:min-h-[245px] sm:p-7 lg:flex-row lg:items-end">
                      <div className="max-w-2xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-heisenberg-gold/30 bg-black/40 px-3 py-1.5 font-mono text-[8px] tracking-[0.22em] text-heisenberg-gold backdrop-blur">
                          <span className="h-1.5 w-1.5 rounded-full bg-heisenberg-gold shadow-[0_0_10px_#e3bf71]" /> THE SLOT VAULT <span className="text-white/30">/</span> {slotMachines.length} MACHINES
                        </div>
                        <h2 className="font-display text-3xl font-black leading-none tracking-[0.04em] text-white sm:text-4xl">FIND YOUR <span className="text-heisenberg-gold">NEXT SPIN.</span></h2>
                        <p className="mt-3 max-w-lg text-xs leading-relaxed text-white/60 sm:text-sm">From velvet-rope classics to high-volatility adventures. Explore the cabinet, check every game’s return, and choose your own pace.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
                        <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur"><p className="font-mono text-[7px] tracking-[0.18em] text-white/40">MACHINES</p><p className="mt-1 font-display text-lg font-black text-white">{slotMachines.length}</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur"><p className="font-mono text-[7px] tracking-[0.18em] text-white/40">TOP RTP</p><p className="mt-1 font-display text-lg font-black text-heisenberg-gold">{slotMachines.length ? Math.max(...slotMachines.map(m => m.rtp * 100)).toFixed(0) : '—'}%</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur"><p className="font-mono text-[7px] tracking-[0.18em] text-white/40">MODE</p><p className="mt-1 font-display text-lg font-black text-white">{btcMode ? 'BTC' : 'PLAY'}</p></div>
                      </div>
                    </div>
                  </motion.section>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="relative mb-5 h-28 overflow-hidden rounded-2xl border border-white/10 md:h-36"
                    style={{ backgroundImage: `url(/banner-${category === 'tables' ? 'tables' : category}.webp)`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.75), transparent 60%)' }} />
                  </motion.div>
                )}

                {category === 'slots' && (
                  <Section title={slotFilter === 'all' ? 'The full collection' : ({ featured: 'Featured machines', 'high-rtp': 'High return machines', classics: 'Casino classics' }[slotFilter])} count={filteredSlotMachines.length}>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      {[
                        ['all', 'All machines'], ['featured', 'Featured'], ['high-rtp', '96%+ RTP'], ['classics', 'Classics'],
                      ].map(([key, label]) => (
                        <button key={key} onClick={() => setSlotFilter(key)} className={`slot-filter-chip ${slotFilter === key ? 'is-active' : ''}`}>
                          {key === 'featured' && <Sparkles size={11} />}{label}
                        </button>
                      ))}
                      <span className="ml-auto hidden font-mono text-[9px] tracking-wider text-white/35 sm:block">SERVER-SET OUTCOMES · DISPLAYED RTP BY GAME</span>
                    </div>
                    {filteredSlotMachines.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                      {filteredSlotMachines.map(m => (
                        <SlotCard key={m.id} m={m} fav={favs.includes(m.id)} onFav={toggleFav}
                          onClick={() => { trackRecent(m.id); navigate(`/casino/slots/${m.id}`); }} />
                      ))}
                    </div> : <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-12 text-center">
                      <p className="font-display text-sm font-bold tracking-widest text-white/70">NO MACHINES FOUND</p>
                      <p className="mt-1 font-mono text-[10px] text-white/35">Try another search or category.</p>
                    </div>}
                  </Section>
                )}

                {category === 'tables' && (
                  <>
                    <Section title="Live Tables" count={tables.length}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {tables.filter(t => matchQ(t.name)).map(t => (
                          <TableCard key={t.id} t={t} fav={favs.includes(t.id)} onFav={toggleFav}
                            onClick={() => { trackRecent(t.id); navigate(tableUrl(t)); }} />
                        ))}
                      </div>
                    </Section>
                    <Section title="Instant Wins">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {(instant || []).filter(m => m.game !== 'slots' && m.currency === currency).map(m => {
                          const meta = {
                            dice: { icon: <Dices size={18} />, name: 'Dice', sub: '1% edge' },
                            videopoker: { icon: <Spade size={18} />, name: 'Jacks or Better', sub: '8/5 · 97.3%' },
                            plinko: { icon: <Dices size={18} />, name: 'Plinko', sub: '16 rows · three risks' },
                          }[m.game];
                          if (!meta) return null;
                          const image = { dice: '/table-dice.webp', videopoker: '/table-videopoker.webp', plinko: '/table-plinko.webp' }[m.game];
                          const target = m.game === 'dice' ? `/casino/dice?c=${m.currency}` : m.game === 'plinko' ? `/casino/plinko?c=${m.currency}` : `/casino/videopoker?c=${m.currency}`;
                          return (
                            <div key={m.id} onClick={() => navigate(target)}
                              className="glass-card rounded-2xl overflow-hidden cursor-pointer stake-card group">
                              <div className="h-24 bg-cover bg-center relative" style={{ backgroundImage: `linear-gradient(180deg,rgba(9,9,11,0.08),rgba(9,9,11,0.65)),url(${image})` }}>
                                <div className="absolute inset-0 flex items-center justify-center text-white/75 group-hover:scale-110 transition-transform">{meta.icon}</div>
                              </div>
                              <div className="p-3">
                              <p className="font-display text-[10px] font-bold truncate">{meta.name}</p>
                              <p className="text-heisenberg-muted text-[9px] font-mono">{meta.sub} · {m.currency === 'btc' ? 'BTC' : 'Play'}</p>
                              </div>
                            </div>
                          );
                        })}
                        <div onClick={() => navigate('/casino/mines')} className="glass-card rounded-2xl overflow-hidden cursor-pointer stake-card group">
                          <div className="h-24 bg-cover bg-center relative" style={{ backgroundImage: 'linear-gradient(180deg,rgba(9,9,11,0.08),rgba(9,9,11,0.65)),url(/table-mines.webp)' }}>
                            <div className="absolute inset-0 flex items-center justify-center text-heisenberg-gold group-hover:scale-110 transition-transform"><Bomb size={20} /></div>
                          </div>
                          <div className="p-3"><p className="font-display text-[10px] font-bold truncate">Mines</p><p className="text-heisenberg-muted text-[9px] font-mono">Pick safe tiles · Play chips</p></div>
                        </div>
                      </div>
                    </Section>
                  </>
                )}

                {category === 'poker' && (
                  <PokerHall snapshot={pokerLobby} mine={mine} socket={casinoSocket} username={user?.username}
                    onRefresh={fetchAll} refreshUser={refreshUser} />
                )}
              </>
            )}
          </main>
        </div>

        <footer className="shrink-0 flex items-center justify-between py-2 px-4 text-heisenberg-muted/60 text-xs font-mono border-t border-heisenberg-border/20 bg-heisenberg-bg/60 backdrop-blur-sm">
          <span>Heisenberg Casino · Deposits accepted in 2,000+ cryptocurrencies · Live games · Fair-play tools</span>
          {category !== 'poker' && <LobbyChat socket={casinoSocket} username={user?.username} />}
        </footer>
      </div>
    </div>
  );
}

function ArrowRightIcon() {
  return <svg className="absolute top-5 right-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>;
}
