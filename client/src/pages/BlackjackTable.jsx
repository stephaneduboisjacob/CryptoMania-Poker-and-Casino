import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { isNative, getToken } from '../utils/tokenStorage';
import { PlayingCard } from '../components/PlayingCard';
import { Home, Wifi, WifiOff, Undo2 } from 'lucide-react';
import { sound } from '../utils/sound';

const CHIP_COLORS = { 1: '#e5e7eb', 5: '#ef4444', 25: '#3b82f6', 100: '#111827', 500: '#8b5cf6', 1000: '#f7931a', 5000: '#f7931a', 10000: '#f7931a' };

function fmt(chips, currency) {
  const n = Number(chips || 0);
  return currency === 'btc' ? '$' + (n / 100).toFixed(2) : n.toLocaleString();
}

function handLabel(h) {
  if (!h) return '';
  if (h.bust) return `${h.value} BUST`;
  if (h.blackjack) return 'BLACKJACK!';
  return String(h.value);
}

function CardRow({ cards, small }) {
  return (
    <div className="flex gap-1">
      {(cards || []).map((c, i) => c === '??'
        ? <div key={i} className="rounded-md border border-white/15 bg-zinc-900 flex items-center justify-center text-white/30 font-bold" style={{ width: small ? 26 : 52, height: small ? 38 : 74 }}>?</div>
        : <PlayingCard key={i} card={c} small={small} />)}
    </div>
  );
}

function ResultBadge({ result }) {
  if (!result) return null;
  const map = {
    blackjack: { t: 'BJ 3:2', c: '#fbbf24' },
    win: { t: 'WIN', c: '#10b981' },
    push: { t: 'PUSH', c: '#a1a1aa' },
    lose: { t: 'LOSE', c: '#71717a' },
    bust: { t: 'BUST', c: '#ef4444' },
  };
  const m = map[result] || { t: result, c: '#a1a1aa' };
  return <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ color: m.c, border: `1px solid ${m.c}55`, background: `${m.c}14` }}>{m.t}</span>;
}

export default function BlackjackTablePage() {
  const { tableId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [betChips, setBetChips] = useState(0);          // pending intent amount (optimistic)
  const [lastBet, setLastBet] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const phase = state?.phase;
  const inBetting = phase === 'betting';
  const mySeat = state?.seats?.find(s => s.username === user?.username && (s.bet || s.pending || s.hands?.length));

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      const socketUrl = isNative() ? (import.meta.env.VITE_SOCKET_URL || 'http://10.0.2.2:3001') : '/';
      const opts = { transports: ['websocket', 'polling'] };
      const token = await getToken();
      if (cancelled) return;
      if (token) opts.auth = { token };
      const sock = io(socketUrl, opts);
      socketRef.current = sock;
      sock.on('connect', () => { setConnected(true); sock.emit('joinHouse', { tableId }); });
      sock.on('disconnect', () => setConnected(false));
      sock.on('houseInit', ({ state }) => {
        serverOffsetRef.current = (state.serverTime || Date.now()) - Date.now();
        setState(state);
      });
      sock.on('houseState', (s) => {
        serverOffsetRef.current = (s.serverTime || Date.now()) - Date.now();
        sound.init();
        setState(prev => {
          // deal sound on new cards for my seat
          if (prev && s.phase !== prev.phase && s.phase === 'turn') sound.cardDeal?.();
          return s;
        });
      });
      sock.on('actionError', ({ message }) => { toast.error(message); setBetChips(0); });
      sock.on('balanceChanged', () => refreshUser());
      sock.on('shoeShuffled', () => toast('Shoe shuffled — fresh 6 decks', { icon: '🔀' }));
    };
    connect();
    return () => { cancelled = true; socketRef.current?.disconnect(); };
  }, [tableId]);

  const placeBet = (amount) => {
    if (!inBetting) return toast.error('Betting closed — wait for next round');
    const total = betChips + amount;
    const requestedTotal = (mySeat?.bet || 0) + total;
    if (state && requestedTotal > state.maxBet) return toast.error(`Table max ${fmt(state.maxBet, state.currency)}`);
    setBetChips(total);
  };

  const betSendingRef = useRef(false);
  const confirmBet = (seat = null, amount = betChips) => {
    if (amount <= 0 || betSendingRef.current) return;
    betSendingRef.current = true;
    sound.chipBet?.();
    socketRef.current?.emit('bjBet', { tableId, amount, seat });
    setLastBet(amount);
    setBetChips(0);
    setTimeout(() => { betSendingRef.current = false; }, 1500);
  };

  const act = (action) => {
    sound.init();
    if (action === 'hit') sound.cardDeal?.();
    socketRef.current?.emit('bjAction', { tableId, action });
  };

  const secondsLeft = state?.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - clockNow - serverOffsetRef.current) / 1000)) : 0;
  const myHand = mySeat?.hands?.[0];
  const isMyTurn = !!mySeat?.active;
  const canDouble = isMyTurn && myHand && myHand.cards?.length === 2;
  const canSplit = isMyTurn && myHand && myHand.cards?.length === 2 &&
    myHand.cards[0][0] === myHand.cards[1][0] && !mySeat.hands?.[1];
  const chipDenoms = state
    ? [state.minBet, state.minBet * 5, state.minBet * 25, state.minBet * 100].filter(v => v <= state.maxBet)
    : [];

  if (!state) {
    return <div className="h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-screen flex flex-col relative overflow-hidden"
      style={{ backgroundImage: 'url(/table-blackjack.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#0d1a0f' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.15) 0%, rgba(9,9,11,0.75) 100%)' }} />

      {/* Top bar */}
      <div className="croom-topbar">
        <button onClick={() => setShowExit(true)} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5">
          <Home size={14} /> Exit
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="croom-chip">{state.name}</span>
          <span className="croom-chip">Limits <b>{fmt(state.minBet, state.currency)}–{fmt(state.maxBet, state.currency)}</b></span>
          <span className="croom-chip">Shoe <b>{state.shoePct}%</b></span>
          <div className={`croom-chip flex items-center gap-1 ${connected ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />} {connected ? 'Live' : '…'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="croom-chip">Bal <b>{formatCasinoBalance(user, state.currency)}</b></span>
        </div>
      </div>

      {/* Dealer */}
      <div className="relative z-10 flex flex-col items-center pt-16 gap-2">
        <span className="text-[10px] tracking-[0.3em] uppercase text-white/50 font-display">Dealer {state.dealer?.value != null && `· ${state.dealer.value}`}</span>
        <CardRow cards={state.dealer?.cards} />
      </div>

      {/* Seats */}
      <div className="relative z-10 flex-1 flex items-center justify-center gap-3 md:gap-6 px-4 flex-wrap">
        {state.seats?.map(s => (
          <div key={s.seat}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2.5 min-w-[120px] border transition-all ${s.active ? 'border-heisenberg-neon shadow-[0_0_0_1px_rgba(247,147,26,0.3)]' : 'border-white/10'} ${s.empty ? 'opacity-40 border-dashed' : ''}`}
            style={{ background: 'rgba(9,9,11,0.75)' }}>
            <div className="text-[11px] font-semibold text-white truncate max-w-[110px]">
              {s.empty ? <span className="text-white/30">Empty seat</span> : `${s.username}${s.username?.startsWith('Bot ') ? ' 🤖' : ''}`}
            </div>
            {s.hands?.length > 0 ? (
              <>
                <div className="flex gap-2">
                  {s.hands.map((h, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <CardRow cards={h.cards} small />
                      <span className="text-[9px] font-mono text-white/70">{handLabel(h)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="croom-chip !py-0.5">{fmt(s.bet, state.currency)}</span>
                  <ResultBadge result={s.result} />
                </div>
              </>
            ) : s.pending ? (
              <span className="croom-chip !py-0.5">Bet {fmt(s.bet, state.currency)}</span>
            ) : (
              <span className="text-[10px] text-white/25 font-mono">—</span>
            )}
          </div>
        ))}
      </div>

      {/* Bottom controls */}
      <div className="relative z-20 mx-auto w-full max-w-2xl px-4 pb-4">
        {/* Phase banner */}
        <div className="flex items-center justify-between mb-2">
          <span className="croom-chip">Round <b>#{state.roundNo}</b></span>
          {inBetting && <span className="croom-chip !text-heisenberg-gold">Betting closes in <b>{secondsLeft}s</b></span>}
          {phase === 'dealing' && <span className="croom-chip">Dealing…</span>}
          {phase === 'turn' && <span className="croom-chip !text-heisenberg-gold">{isMyTurn ? <b>YOUR TURN — {secondsLeft}s</b> : 'Player acting…'}</span>}
          {phase === 'dealer' && <span className="croom-chip">Dealer plays…</span>}
          {phase === 'settle' && <span className="croom-chip">Round complete</span>}
        </div>

        <AnimatePresence>
          {inBetting && !mySeat && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="glass-card p-4 rounded-2xl">
              <div className="flex items-center gap-2 flex-wrap justify-center mb-3">
                {chipDenoms.map(v => (
                  <button key={v} onClick={() => placeBet(v)}
                    className="w-12 h-12 rounded-full font-mono text-[10px] font-bold transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
                    style={{ background: CHIP_COLORS[v] || '#52525b', color: ['#e5e7eb', '#fbbf24'].includes(CHIP_COLORS[v]) ? '#111' : '#fff', border: '3px dashed rgba(255,255,255,0.5)', boxShadow: '0 3px 8px rgba(0,0,0,0.4)' }}>
                    {fmt(v, state.currency)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => setBetChips(0)} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1">
                  <Undo2 size={12} /> Clear
                </button>
                <div className="flex-1 text-center font-mono text-lg font-bold text-heisenberg-gold">
                  {betChips > 0 ? fmt(betChips, state.currency) : '—'}
                </div>
                {lastBet > 0 && (
                  <button onClick={() => confirmBet(null, lastBet)} className="btn-ghost text-xs py-2 px-3">
                    Rebet {fmt(lastBet, state.currency)}
                  </button>
                )}
                <button onClick={() => confirmBet()} disabled={betChips <= 0} className="btn-primary text-xs py-2 px-6 disabled:opacity-40">
                  Deal Me In
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {inBetting && mySeat && (
          <div className="glass-card p-3 rounded-2xl text-center">
            <p className="text-sm text-heisenberg-muted mb-2">Bet placed: <b className="text-heisenberg-gold font-mono">{fmt(mySeat.bet || betChips, state.currency)}</b> — dealing soon</p>
            <div className="flex items-center gap-2 flex-wrap justify-center mb-2">
              {chipDenoms.map(v => (
                <button key={v} onClick={() => placeBet(v)}
                  className="w-10 h-10 rounded-full font-mono text-[9px] font-bold transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
                  style={{ background: CHIP_COLORS[v] || '#52525b', color: ['#e5e7eb', '#fbbf24'].includes(CHIP_COLORS[v]) ? '#111' : '#fff', border: '2px dashed rgba(255,255,255,0.5)' }}>
                  {fmt(v, state.currency)}
                </button>
              ))}
              <span className="croom-chip">Add <b>{fmt(betChips, state.currency)}</b></span>
            </div>
            <button onClick={() => confirmBet(mySeat.seat, mySeat.bet + betChips)} disabled={betChips <= 0}
              className="btn-ghost text-xs py-1.5 px-4 disabled:opacity-40">
              {betChips > 0 ? `Update bet to ${fmt(mySeat.bet + betChips, state.currency)}` : 'Choose chips to add'}
            </button>
          </div>
        )}

        {isMyTurn && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-3 rounded-2xl">
            <div className="flex gap-2">
              <button onClick={() => act('hit')} className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.5)', color: '#10b981' }}>
                Hit
              </button>
              <button onClick={() => act('stand')} className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)', color: '#fafafa' }}>
                Stand
              </button>
              {canDouble && (
                <button onClick={() => act('double')} className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
                  style={{ background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.5)', color: '#f7931a' }}>
                  Double
                </button>
              )}
              {canSplit && (
                <button onClick={() => act('split')} className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
                  style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.5)', color: '#60a5fa' }}>
                  Split
                </button>
              )}
            </div>
            <p className="text-center text-[10px] text-white/30 font-mono mt-1.5">No action in {secondsLeft}s = automatic stand</p>
          </motion.div>
        )}

        {/* History strip */}
        {state.history?.length > 0 && (
          <div className="flex gap-1.5 mt-2 overflow-hidden opacity-70">
            {state.history.slice(-8).map((h, i) => (
              <span key={i} className="croom-chip !px-2 !text-[9px]">#{h.no} D:{h.dealerValue}</span>
            ))}
          </div>
        )}
      </div>

      {/* Exit confirm */}
      <AnimatePresence>
        {showExit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowExit(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
              className="glass-card p-6 rounded-2xl text-center max-w-xs">
              <h3 className="font-display text-sm tracking-widest uppercase mb-2">Leave the table?</h3>
              <p className="text-heisenberg-muted text-xs mb-4">Bets already placed this round still play out.</p>
              <div className="flex gap-2">
                <button onClick={() => setShowExit(false)} className="flex-1 btn-ghost text-xs py-2">Stay</button>
                <button onClick={() => navigate('/casino')} className="flex-1 btn-primary text-xs py-2">Leave</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
