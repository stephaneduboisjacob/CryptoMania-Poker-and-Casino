import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { isNative, getToken } from '../utils/tokenStorage';
import LobbyChat from '../components/LobbyChat';
import Navbar from '../components/Navbar';
import { Swords, Users, Zap, Trophy, Circle, UserCircle2, HelpCircle, Settings, Users2, Spade, Bitcoin, ArrowRight, Sparkles } from 'lucide-react';
import { btcToUsd, fmtUsd } from '../utils/usd';

const RAKE = 0.05;
const TIERS = [
  { id: 'play', label: 'FREE PLAY', usd: 0,   color: '#96897a', glow: '#96897a44' },
  { id: '20',   label: '$20',       usd: 20,  color: '#22d3ee', glow: '#22d3ee33' },
  { id: '50',   label: '$50',       usd: 50,  color: '#f7931a', glow: '#f7931a33' },
  { id: '100',  label: '$100',      usd: 100, color: '#38bdf8', glow: '#38bdf833' },
  { id: '250',  label: '$250',      usd: 250, color: '#ffb020', glow: '#ffb02033' },
  { id: '500',  label: '$500',      usd: 500, color: '#fbbf24', glow: '#fbbf2433' },
];

export default function Lobby() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [lobbies, setLobbies]     = useState([]);
  const [joining, setJoining]     = useState(null);
  const [btcPrice, setBtcPrice]   = useState(null);
  const [online, setOnline]       = useState([]);
  const [aiName, setAiName]       = useState('Heisenberg');
  const [friendChallenge, setFriendChallenge] = useState(null);

  const fetchAll = useCallback(async () => {
    const [lobbiesRes, priceRes, onlineRes, aiRes] = await Promise.allSettled([
      axios.get('/api/tournament/lobbies'),
      axios.get('/api/prices/btc-usd'),
      axios.get('/api/online'),
      axios.get('/api/admin/ai-settings'),
    ]);
    if (lobbiesRes.status === 'fulfilled') setLobbies(lobbiesRes.value.data.lobbies);
    if (priceRes.status === 'fulfilled') setBtcPrice(priceRes.value.data.usd);
    if (onlineRes.status === 'fulfilled') setOnline(onlineRes.value.data.players || []);
    if (aiRes.status === 'fulfilled') {
      const s = aiRes.value.data.settings;
      setAiName(`${s.emoji || '🤖'} ${s.name || 'Heisenberg'}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll();
    const id = setInterval(fetchAll, 6000);

    const connectSocket = async () => {
      const socketUrl = isNative() ? (import.meta.env.VITE_SOCKET_URL || 'http://10.0.2.2:3001') : '/';
      const socketOpts = { transports: ['websocket', 'polling'] };
      const token = await getToken();
      if (cancelled) return;
      if (token) socketOpts.auth = { token };
      const sock = io(socketUrl, socketOpts);
      socketRef.current = sock;
      sock.on('onlinePlayers', (players) => {
        setOnline(Array.isArray(players) ? players.map(p => typeof p === 'string' ? { username: p, avatar: '🃏' } : p) : []);
      });
      sock.on('friendChallenge', ({ from, fromAvatar, tournamentId }) => {
        setFriendChallenge({ from, fromAvatar, tournamentId });
      });
      sock.on('friendOnline', ({ username, avatar }) => {
        toast(`${avatar} ${username} is online!`, { icon: '👋' });
      });
    };
    connectSocket();

    return () => { cancelled = true; clearInterval(id); if (socketRef.current) socketRef.current.disconnect(); };
  }, [fetchAll]);

  const joinHuman = async (tier) => {
    setJoining(`human-${tier}`);
    try {
      const res = await axios.post('/api/tournament/join', { tier });
      const { tournament } = res.data;
      await refreshUser();
      toast.success(tournament.justStarted ? 'Opponent found! Starting...' : 'Waiting for opponent...');
      navigate(`/game/${tournament.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to join');
    } finally { setJoining(null); }
  };

  const joinAI = async () => {
    setJoining('ai');
    try {
      const res = await axios.post('/api/tournament/join-ai');
      await refreshUser();
      toast.success(`${aiName} is ready. Good luck!`);
      navigate(`/game/${res.data.tournament.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start game');
    } finally { setJoining(null); }
  };

  const tierLobbies = (tier) => lobbies.filter(l => l.tier === tier && l.status === 'waiting');
  const activeGames = lobbies.filter(l => l.status === 'active');

  return (
    <div className="page-root" style={{ backgroundImage: 'url(/login-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.5) 0%, rgba(9,9,11,0.62) 100%)' }} />
      <Navbar btcPrice={btcPrice} />
      <div className="page-scroll relative z-10">
        <main className="container mx-auto px-4 pt-5 pb-8 max-w-7xl">

          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, ease: 'easeOut' }}
            className="lobby-hero mb-6" style={{ backgroundImage: 'url(/banner-poker.webp)' }}>
            <div className="lobby-hero__content">
              <div>
                <div className="lobby-hero__eyebrow"><Sparkles size={12} /> CRYPTOMANIA PRIVATE CLUB <span className="opacity-35">/</span> YOUR NEXT HAND STARTS HERE</div>
                <h1 className="lobby-hero__title">Find your table.<br /><em>Make your move.</em></h1>
                <p className="lobby-hero__copy">Settle into a live poker room, explore the casino, or sharpen your game in free practice.</p>
                <div className="crypto-acceptance mt-4"><Bitcoin size={14} /> 2,000+ cryptocurrencies accepted · not just Bitcoin</div>
              </div>
              <div className="lobby-hero__actions">
                <button onClick={joinAI} disabled={Boolean(joining)} className="btn-primary inline-flex items-center gap-2">
                  <Spade size={14} /> {joining === 'ai' ? 'Opening practice table…' : 'Practice for free'} <ArrowRight size={14} />
                </button>
                <button onClick={() => navigate('/casino')} className="btn-ghost inline-flex items-center gap-2">
                  Explore casino <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </motion.section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

              {/* Balance bar */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                className="glass-card p-4 sm:p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4"
                style={{ borderColor: 'rgba(224,190,121,.18)' }}>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase">Balance</p>
                    <p className="text-heisenberg-neon font-mono text-lg font-bold">
                      {btcPrice ? fmtUsd(btcToUsd(user?.balanceBtc || 0, btcPrice)) : '—'}
                    </p>
                    <p className="text-heisenberg-muted/60 text-[10px] font-mono">₿ {parseFloat(user?.balanceBtc || 0).toFixed(6)}</p>
                  </div>
                  <div className="w-px h-8 bg-heisenberg-border" />
                  <div>
                    <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase">Play Chips</p>
                    <p className="text-heisenberg-gold font-mono text-lg font-bold">⬡ {parseFloat(user?.balancePlay || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to="/profile" className="btn-ghost text-xs py-2 px-3 flex items-center gap-1">
                    <UserCircle2 size={13} /> Profile
                  </Link>
                  <button onClick={() => navigate('/wallet')} className="btn-primary text-xs py-2 px-4">
                    Wallet
                  </button>
                </div>
              </motion.div>

              {/* Casino banner */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                className="glass-card rounded-2xl overflow-hidden cursor-pointer group relative"
                style={{ border: '1px solid #fbbf2444', boxShadow: '0 0 30px #fbbf2418' }}
                onClick={() => navigate('/casino')}>
                <div className="h-1" style={{ background: 'linear-gradient(90deg, #fbbf24, #ffb020)' }} />
                <div className="p-5 flex items-center justify-between relative overflow-hidden">
                  <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity"
                    style={{ backgroundImage: 'url(/btc-coin.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="flex items-center gap-4 relative">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid #fbbf2444' }}>
                      <Spade size={22} className="text-heisenberg-gold" />
                    </div>
                    <div>
                      <p className="font-display font-bold text-base tracking-widest text-white">
                        ENTER THE CASINO
                        <span className="text-heisenberg-gold ml-2 text-xs">NEW</span>
                      </p>
                      <p className="text-heisenberg-muted text-xs mt-0.5">
                        Cash Games · Sit & Go · Multi-Table Tournaments · Freerolls
                      </p>
                    </div>
                  </div>
                  <button className="relative flex items-center gap-2 font-display font-bold text-sm tracking-widest uppercase px-5 py-2.5 rounded-xl transition-all"
                    style={{ background: 'rgba(251,191,36,0.2)', border: '1px solid #fbbf2466', color: '#fbbf24' }}>
                    Play
                  </button>
                </div>
              </motion.div>

              {/* Play vs opponent banner */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="glass-card rounded-2xl overflow-hidden cursor-pointer group"
                style={{ border: '1px solid #60a5fa44', boxShadow: '0 0 30px #60a5fa22' }}
                onClick={() => !joining && joinAI()}>
                <div className="h-1" style={{ background: 'linear-gradient(90deg, #60a5fa, #f7931a)' }} />
                <div className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ background: 'rgba(96,165,250,0.2)', border: '1px solid #60a5fa44' }}>
                      <Swords size={22} className="text-heisenberg-purple" />
                    </div>
                    <div>
                      <p className="font-display font-bold text-base tracking-widest text-white">
                        PLAY vs {aiName} <span className="text-heisenberg-purple ml-2 text-xs">FREE</span>
                      </p>
                      <p className="text-heisenberg-muted text-xs mt-0.5">
                        Heads-Up · Free Play · Practice Mode
                      </p>
                    </div>
                  </div>
                  <button
                    className="flex items-center gap-2 font-display font-bold text-sm tracking-widest uppercase px-5 py-2.5 rounded-xl transition-all"
                    style={{ background: 'rgba(96,165,250,0.25)', border: '1px solid #60a5fa66', color: '#60a5fa' }}>
                    {joining === 'ai'
                      ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Starting...</>
                      : <><Zap size={14} />Play</>
                    }
                  </button>
                </div>
              </motion.div>

              {/* Heads-up human tiers */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users size={13} className="text-heisenberg-muted" />
                  <span className="font-display text-xs tracking-widest uppercase text-heisenberg-muted">
                    Heads-Up vs Human — Choose Your Stakes
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {TIERS.map((tier, i) => {
                    const waiting = tierLobbies(tier.id);
                    const key = `human-${tier.id}`;
                    const isJoining = joining === key;

                    return (
                      <motion.div key={tier.id}
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 + 0.2 }}
                        whileHover={{ scale: 1.02, y: -2 }}
                        className="glass-card rounded-2xl overflow-hidden cursor-pointer"
                        style={{ borderColor: `${tier.color}33`, boxShadow: `0 0 18px ${tier.glow}` }}
                        onClick={() => !isJoining && !joining && joinHuman(tier.id)}>

                        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${tier.color}, ${tier.color}44)` }} />
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-display text-sm tracking-widest font-black" style={{ color: tier.color }}>
                              {tier.label}
                            </span>
                            {waiting.length > 0 && (
                              <span className="text-[10px] text-heisenberg-green border border-heisenberg-green/30 bg-heisenberg-green/10 px-1.5 py-0.5 rounded-full font-mono animate-pulse">
                                {waiting.length} open
                              </span>
                            )}
                          </div>

                          {tier.id !== 'play' && (
                            <div className="space-y-1 mb-3 text-xs">
                              <div className="flex justify-between">
                                <span className="text-heisenberg-muted">Buy-in</span>
                                <span className="font-mono text-white font-bold">${tier.usd}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-heisenberg-muted">Prize</span>
                                <span className="font-mono font-bold" style={{ color: tier.color }}>${tier.usd * 2 * (1 - RAKE)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-heisenberg-muted">Rake</span>
                                <span className="font-mono text-heisenberg-muted/60 text-[10px]">${tier.usd * 2 * RAKE}</span>
                              </div>
                            </div>
                          )}
                          {tier.id === 'play' && (
                            <p className="text-heisenberg-muted text-xs font-mono mb-3">Practice · No real money</p>
                          )}

                          <button
                            className="w-full py-2 rounded-xl font-display font-bold text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-1.5"
                            style={{ background: `${tier.color}1a`, border: `1px solid ${tier.color}44`, color: tier.color }}>
                            {isJoining
                              ? <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />Joining...</>
                              : waiting.length > 0 ? 'Join Table' : 'Create Table'
                            }
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Active live tables */}
              <AnimatePresence>
                {activeGames.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-2 flex items-center gap-2">
                      <Circle size={8} className="text-heisenberg-green fill-heisenberg-green" />
                      Live Tables
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {activeGames.slice(0, 6).map(g => (
                        <div key={g.id} className="glass-card p-3 rounded-xl flex items-center justify-between">
                          <div>
                            <p className="font-mono text-sm">{g.player1_name} <span className="text-heisenberg-muted">vs</span> {g.player2_name}</p>
                            <p className="text-xs text-heisenberg-muted font-mono mt-0.5">
                              {g.tier === 'play' ? 'Play Money' : `$${g.tier} buy-in`}
                            </p>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-heisenberg-green animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right column: Online players + quick links */}
            <div className="space-y-4">

              {/* Online players */}
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
                className="glass-card p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted flex items-center gap-1.5">
                    <Circle size={7} className="text-heisenberg-green fill-heisenberg-green" />
                    Online Now
                  </p>
                  <span className="font-mono text-xs text-heisenberg-green">{online.length}</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {online.length === 0 && <p className="text-heisenberg-muted text-xs font-mono">No players online</p>}
                  {online.map(p => {
                    const name = typeof p === 'string' ? p : p.username;
                    const avatar = typeof p === 'string' ? '🃏' : (p.avatar || '🃏');
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-sm leading-none">{avatar}</span>
                        <Link to={`/profile/${name}`} className="font-mono text-xs text-heisenberg-text hover:text-heisenberg-neon transition-colors">
                          {name}
                        </Link>
                        {name === user?.username && <span className="text-[9px] text-heisenberg-muted font-mono">(you)</span>}
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* Quick links */}
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
                className="glass-card p-4 rounded-xl space-y-2">
                <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-2">Quick Links</p>
                <Link to="/leaderboard"
                  className="flex items-center gap-2 text-sm text-heisenberg-text hover:text-heisenberg-neon transition-colors py-1.5">
                  <Trophy size={14} className="text-heisenberg-gold" />
                  Leaderboard
                </Link>
                <Link to={`/profile/${user?.username}`}
                  className="flex items-center gap-2 text-sm text-heisenberg-text hover:text-heisenberg-neon transition-colors py-1.5">
                  <UserCircle2 size={14} className="text-heisenberg-neon" />
                  My Profile & Stats
                </Link>
                <Link to="/friends"
                  className="flex items-center gap-2 text-sm text-heisenberg-text hover:text-heisenberg-neon transition-colors py-1.5">
                  <Users2 size={14} className="text-heisenberg-purple" />
                  Friends
                </Link>
                <Link to="/wallet"
                  className="flex items-center gap-2 text-sm text-heisenberg-text hover:text-heisenberg-neon transition-colors py-1.5">
                  <Zap size={14} className="text-heisenberg-orange" />
                  Deposit / Withdraw
                </Link>
                <Link to="/help"
                  className="flex items-center gap-2 text-sm text-heisenberg-text hover:text-heisenberg-neon transition-colors py-1.5">
                  <HelpCircle size={14} className="text-heisenberg-muted" />
                  Help / FAQ
                </Link>
                <Link to="/settings"
                  className="flex items-center gap-2 text-sm text-heisenberg-text hover:text-heisenberg-neon transition-colors py-1.5">
                  <Settings size={14} className="text-heisenberg-muted" />
                  Settings
                </Link>
              </motion.div>

              {/* Platform info */}
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}
                className="glass-card p-4 rounded-xl">
                <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-3">About</p>
                <div className="space-y-2 text-xs text-heisenberg-muted font-mono">
                  <p>🃏 Heads-Up No Limit Texas Hold'em exclusively</p>
                  <p>₿ Deposits accepted in 2,000+ cryptocurrencies</p>
                  <p>🎯 5% rake on all real money games</p>
                  <p>⏱ Blinds double every 5 minutes</p>
                  <p>🚀 Starting stack: 10,000 chips</p>
                  <p>⚔️ Play vs {aiName} for free</p>
                </div>
              </motion.div>
            </div>
          </div>
        </main>
      </div>

      <footer className="shrink-0 flex items-center justify-between py-2 px-4 text-heisenberg-muted/60 text-xs font-mono border-t border-heisenberg-border/20 bg-heisenberg-bg/60 backdrop-blur-sm">
        <span>Cryptomania Casino — Poker & Games · Deposits accepted in 2,000+ cryptocurrencies</span>
        <LobbyChat socket={socketRef.current} username={user?.username} />
      </footer>

      {/* Friend challenge pop-up */}
      <AnimatePresence>
        {friendChallenge && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-12 right-4 z-50 glass-card p-4 rounded-xl max-w-xs"
            style={{ border: '1px solid #60a5fa44' }}>
            <p className="font-display text-xs tracking-widest uppercase text-heisenberg-purple mb-2">⚔️ Challenge!</p>
            <p className="font-mono text-sm text-white mb-3">
              {friendChallenge.fromAvatar} <strong>{friendChallenge.from}</strong> challenges you to a heads-up match!
            </p>
            <div className="flex gap-2">
              <button onClick={() => { setFriendChallenge(null); navigate(`/game/${friendChallenge.tournamentId}`); }}
                className="flex-1 btn-primary text-xs py-2">Accept ⚔️</button>
              <button onClick={() => setFriendChallenge(null)} className="flex-1 btn-ghost text-xs py-2">Decline</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
