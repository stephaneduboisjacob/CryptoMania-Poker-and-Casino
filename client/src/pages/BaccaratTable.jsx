import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { isNative, getToken } from '../utils/tokenStorage';
import { PlayingCard } from '../components/PlayingCard';
import { Home, Wifi, WifiOff, Undo2 } from 'lucide-react';

const SIDES = [
  { key: 'player', label: 'PLAYER', payout: '1:1', color: '#3b82f6' },
  { key: 'tie', label: 'TIE', payout: '8:1', color: '#10b981' },
  { key: 'banker', label: 'BANKER', payout: '0.95:1', color: '#ef4444' },
];

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}

function CardRow({ cards, total, label }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] tracking-[0.3em] uppercase text-white/50 font-display">{label}{total != null && ` · ${total}`}</span>
      <div className="flex gap-1.5 min-h-[64px]">
        {(cards || []).map((c, i) => <PlayingCard key={i} card={c} small />)}
      </div>
    </div>
  );
}

export default function BaccaratTable() {
  const { tableId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const roundRef = useRef(null);
  const [state, setState] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [chip, setChip] = useState(0);
  const [mine, setMine] = useState([]); // [{side, amount}]
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const phase = state?.phase;
  const inBetting = phase === 'betting';
  const myStaked = mine.reduce((s, b) => s + b.amount, 0);

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
        roundRef.current = state.roundNo;
        setMine(state.myBets || []);
        setState(state);
      });
      sock.on('houseState', (s) => {
        serverOffsetRef.current = (s.serverTime || Date.now()) - Date.now();
        setState(s);
        if (roundRef.current !== s.roundNo) {
          roundRef.current = s.roundNo;
          setMine([]);
        }
      });
      sock.on('actionError', ({ message }) => {
        toast.error(message);
        // Restore this player's accepted bets after a rejected optimistic bet
        // or clear request.
        sock.emit('joinHouse', { tableId });
      });
      sock.on('balanceChanged', () => refreshUser());
    };
    connect();
    return () => { cancelled = true; socketRef.current?.disconnect(); };
  }, [tableId]);

  const place = (side) => {
    if (!inBetting) return toast.error('Betting closed — wait for the next coup');
    if (!chip) return;
    const staked = myStaked + chip;
    if (state && staked > state.maxBet) return toast.error(`Table max ${fmt(state.maxBet, state.currency)}`);
    setMine(m => {
      const ex = m.find(b => b.side === side);
      if (ex) return m.map(b => b.side === side ? { ...b, amount: b.amount + chip } : b);
      return [...m, { side, amount: chip }];
    });
    socketRef.current?.emit('bcBet', { tableId, side, amount: chip });
  };

  const clearAll = () => {
    if (!inBetting) return;
    setMine([]);
    socketRef.current?.emit('bcClear', { tableId });
  };

  const secondsLeft = state?.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - clockNow - serverOffsetRef.current) / 1000)) : 0;
  const chipDenoms = state ? [state.minBet, state.minBet * 5, state.minBet * 25, state.minBet * 100].filter(v => v <= state.maxBet) : [];
  const myOn = (side) => mine.find(b => b.side === side)?.amount || 0;

  if (!state) {
    return <div className="h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" /></div>;
  }

  const outcomeLabel = state.outcome ? state.outcome.toUpperCase() : null;

  return (
    <div className="h-screen flex flex-col relative overflow-hidden"
      style={{ backgroundImage: 'url(/table-baccarat.webp)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#101a10' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 25%, rgba(0,0,0,0.2) 0%, rgba(9,9,11,0.8) 100%)' }} />

      <div className="croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"><Home size={14} /> Exit</button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="croom-chip">{state.name}</span>
          <span className="croom-chip">P 1:1 · B 0.95:1 · T 8:1</span>
          <div className={`croom-chip flex items-center gap-1 ${connected ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />} {connected ? 'Live' : '…'}
          </div>
        </div>
        <span className="croom-chip">Bal <b>{formatCasinoBalance(user, state.currency)}</b></span>
      </div>

      {/* Table area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 px-4 pb-44">
        {/* Cards */}
        <div className="flex items-center justify-center gap-12 md:gap-20">
          <CardRow cards={state.cards?.player} total={state.playerTotal} label="Player" />
          <div className="text-center">
            <AnimatePresence mode="wait">
              {outcomeLabel ? (
                <motion.div key={outcomeLabel + state.roundNo} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="px-5 py-2.5 rounded-2xl font-display text-xl font-black"
                  style={{
                    background: state.outcome === 'player' ? '#3b82f6' : state.outcome === 'banker' ? '#ef4444' : '#10b981',
                    color: '#fff',
                  }}>
                  {outcomeLabel}
                </motion.div>
              ) : (
                <div className="croom-chip !text-sm !px-5 !py-2">
                  {phase === 'betting' && <>Bet now — <b className="text-heisenberg-gold">{secondsLeft}s</b></>}
                  {phase === 'dealing' && <>🂡 Dealing…</>}
                  {phase === 'result' && <>…</>}
                </div>
              )}
            </AnimatePresence>
            <p className="text-[10px] text-white/30 font-mono mt-2">Coup #{state.roundNo}</p>
          </div>
          <CardRow cards={state.cards?.banker} total={state.bankerTotal} label="Banker" />
        </div>

        {/* History beads */}
        <div className="flex gap-1.5">
          {(state.history || []).slice(-12).map((o, i) => (
            <span key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-mono font-bold text-white"
              style={{ background: o === 'player' ? '#3b82f6' : o === 'banker' ? '#ef4444' : '#10b981', opacity: 0.85 }}>
              {o[0].toUpperCase()}
            </span>
          ))}
        </div>

        {/* Last winners */}
        {state.lastWinners?.length > 0 && phase === 'result' && (
          <p className="text-[10px] text-heisenberg-green font-mono">
            {state.lastWinners.slice(0, 3).map(w => `${w.username} +${fmt(w.net, state.currency)}`).join(' · ')}
          </p>
        )}
      </div>

      {/* Betting dock */}
      <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-4">
        <div className="mx-auto max-w-2xl glass-card p-4 rounded-2xl">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {SIDES.map(s => (
              <button key={s.key} onClick={() => place(s.key)} disabled={!inBetting || !chip}
                className="relative rounded-xl py-3 font-display text-xs font-bold tracking-widest uppercase transition-all hover:brightness-125 disabled:opacity-50"
                style={{ background: `${s.color}22`, border: `1px solid ${s.color}66`, color: s.color }}>
                {s.label}
                <span className="block text-[9px] font-mono text-white/50 mt-0.5">{s.payout}</span>
                {myOn(s.key) > 0 && (
                  <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold"
                    style={{ background: '#f7931a', color: '#09090b' }}>
                    {fmt(myOn(s.key), state.currency)}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="flex items-center gap-2">
              {chipDenoms.map(v => (
                <button key={v} onClick={() => setChip(v)}
                  className="w-10 h-10 rounded-full font-mono text-[9px] font-bold flex items-center justify-center transition-transform hover:scale-110"
                  style={{
                    background: v >= cfg_high(v) ? '#f7931a' : '#27272a', color: '#fff',
                    border: chip === v ? '2px solid #fafafa' : '2px dashed rgba(255,255,255,0.35)',
                  }}>
                  {fmt(v, state.currency)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="croom-chip">Staked <b className={myStaked > 0 ? 'text-heisenberg-gold' : ''}>{fmt(myStaked, state.currency)}</b></span>
              {myStaked > 0 && (
                <button onClick={clearAll} disabled={!inBetting} className="btn-ghost text-[10px] py-1.5 px-3 flex items-center gap-1 disabled:opacity-40"><Undo2 size={11} /> Clear</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cfg_high(v) { return v >= 100; }
