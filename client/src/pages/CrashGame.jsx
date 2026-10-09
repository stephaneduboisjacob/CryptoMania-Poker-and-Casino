import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { isNative, getToken } from '../utils/tokenStorage';
import { Home, Wifi, WifiOff, TrendingUp } from 'lucide-react';
import { sound } from '../utils/sound';

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}
function crashColor(m) {
  if (m >= 10) return '#ef4444';
  if (m >= 2) return '#f7931a';
  return '#10b981';
}

export default function CrashGame() {
  const { tableId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [state, setState] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [bet, setBet] = useState(10);
  const [autoTarget, setAutoTarget] = useState('');
  const [queued, setQueued] = useState(false);   // bet placed for next round
  const [cashedInfo, setCashedInfo] = useState(null);
  const [myNet, setMyNet] = useState(null);
  const stateRef = useRef(null);
  stateRef.current = state;

  // local live multiplier interpolation between server broadcasts
  const [liveMult, setLiveMult] = useState(1);
  const lastStateRef = useRef({ mult: 1, at: 0 });
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

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
        setState(s);
        lastStateRef.current = { mult: s.mult, at: Date.now() };
        if (s.phase === 'betting') { setQueued(false); setCashedInfo(null); setMyNet(null); }
      });
      sock.on('crashCashed', ({ username, mult, payout }) => {
        if (username === user?.username) { setCashedInfo({ mult, payout }); setMyNet(payout - (stateRef.current?.players.find(p => p.username === username)?.amount || 0)); refreshUser(); }
        else toast(`${username} cashed ${mult}×`, { icon: '✅', duration: 2000 });
      });
      sock.on('crashBusted', () => {
        sound.init(); sound.lose?.();
      });
      sock.on('actionError', ({ message }) => { toast.error(message); setQueued(false); });
      sock.on('balanceChanged', () => refreshUser());
    };
    connect();
    return () => { cancelled = true; socketRef.current?.disconnect(); };
  }, [tableId]);

  // smooth local multiplier
  useEffect(() => {
    const iv = setInterval(() => {
      const s = stateRef.current;
      if (!s) return;
      if (s.phase === 'running') {
        const since = (Date.now() - lastStateRef.current.at) / 1000;
        setLiveMult(s.mult * Math.exp(1.1 * since));
      } else {
        setLiveMult(s.mult);
      }
    }, 60);
    return () => clearInterval(iv);
  }, []);

  const placeBet = () => {
    if (queued) return;
    sound.init(); sound.chipBet?.();
    setQueued(true);
    const auto = parseFloat(autoTarget);
    socketRef.current?.emit('crashBet', { tableId, amount: bet, autoCashout: isNaN(auto) ? null : auto });
  };
  const cashout = () => {
    socketRef.current?.emit('crashCashout', { tableId });
  };

  const phase = state?.phase;
  const me = state?.players?.find(p => p.username === user?.username);
  const displayMult = phase === 'running' ? liveMult : (state?.mult || 1);
  const myStake = me?.amount || 0;
  const potentialWin = Math.floor(myStake * displayMult);

  if (!state) {
    return <div className="h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" /></div>;
  }

  // graph geometry
  const elapsed = phase === 'running' ? Math.min(1, Math.log(displayMult) / Math.log(25)) : (phase === 'crashed' ? 1 : 0);

  return (
    <div className="h-screen flex flex-col items-center relative overflow-hidden"
      style={{ backgroundImage: 'url(/table-crash.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute top-0 left-0 right-0 croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"><Home size={14} /> Exit</button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="croom-chip">{state.name}</span>
          <span className="croom-chip">3% edge · <b>provably fair</b></span>
          <div className={`croom-chip flex items-center gap-1 ${connected ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />} {connected ? 'Live' : '…'}
          </div>
        </div>
        <span className="croom-chip">Bal <b>{formatCasinoBalance(user, state.currency)}</b></span>
      </div>

      {/* Graph */}
      <div className="relative w-full max-w-2xl flex-1 flex items-center justify-center mt-16 mb-2 px-6">
        <svg viewBox="0 0 100 60" className="w-full h-full absolute" preserveAspectRatio="none">
          <line x1="8" y1="54" x2="98" y2="54" stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" />
          <line x1="8" y1="54" x2="8" y2="4" stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" />
          {phase === 'running' && (
            <path d={`M 8 54 Q ${8 + elapsed * 55} ${54 - elapsed * 30}, ${8 + elapsed * 84} ${54 - elapsed * 46}`}
              fill="none" stroke={crashColor(displayMult)} strokeWidth="0.8" strokeLinecap="round" />
          )}
        </svg>

        <div className="text-center z-10">
          <AnimatePresence mode="wait">
            {phase === 'crashed' ? (
              <motion.div key={'bust' + state.roundNo} initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <p className="font-mono font-black text-7xl md:text-8xl text-heisenberg-red" style={{ textShadow: '0 0 40px rgba(239,68,68,0.4)' }}>
                  {state.crashPoint?.toFixed(2)}×
                </p>
                <p className="font-display text-sm tracking-[0.3em] uppercase text-heisenberg-red mt-1">BUSTED</p>
              </motion.div>
            ) : phase === 'running' ? (
              <motion.p key="run" className="font-mono font-black text-7xl md:text-8xl"
                style={{ color: crashColor(displayMult), textShadow: `0 0 40px ${crashColor(displayMult)}55` }}>
                {displayMult.toFixed(2)}×
              </motion.p>
            ) : (
              <motion.div key={'bet' + state.roundNo} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="font-display text-lg tracking-[0.3em] uppercase text-heisenberg-gold">Place your bets</p>
                <p className="font-mono text-white/40 text-sm mt-1">Round #{state.roundNo} · starts in {Math.max(0, Math.ceil((state.phaseEndsAt - clockNow - serverOffsetRef.current) / 1000))}s</p>
              </motion.div>
            )}
          </AnimatePresence>
          {phase === 'running' && me && !me.cashedAt && (
            <p className="font-mono text-sm text-heisenberg-green mt-2">your cashout: {fmt(potentialWin, state.currency)}</p>
          )}
        </div>
      </div>

      {/* History */}
      <div className="flex gap-1.5 mb-3 flex-wrap justify-center px-4">
        {(state.history || []).slice(-10).map((m, i) => (
          <span key={i} className="croom-chip !text-[9px]" style={{ color: crashColor(m) }}>{m.toFixed(2)}×</span>
        ))}
      </div>

      {/* Controls */}
      <div className="glass-card mx-auto w-[94%] max-w-lg p-4 rounded-2xl mb-6">
        {me?.cashedAt && (
          <p className="text-center font-mono text-heisenberg-green text-sm mb-2">
            ✅ Cashed at {me.cashedAt.toFixed?.(2) || me.cashedAt}× — {fmt(Math.floor(myStake * me.cashedAt), state.currency)}
          </p>
        )}
        {phase === 'running' && me && !me.cashedAt && !cashedInfo ? (
          <button onClick={cashout} className="w-full py-4 rounded-xl font-display font-black text-lg tracking-widest uppercase active:scale-[0.98] transition-transform"
            style={{ background: 'linear-gradient(180deg,#f7931a,#e07f0e)', color: '#09090b' }}>
            CASH OUT · {fmt(potentialWin, state.currency)}
          </button>
        ) : (
          <div className="flex gap-2">
            <input type="number" min={state.minBet} max={state.maxBet} value={bet}
              onChange={e => setBet(Math.min(state.maxBet, Math.max(state.minBet, Math.floor(Number(e.target.value) || state.minBet))))}
              className="input-field w-28 text-center font-mono" />
            <input type="number" min={1.01} step="0.1" value={autoTarget} placeholder="Auto (×)"
              onChange={e => setAutoTarget(e.target.value)}
              className="input-field w-24 text-center font-mono" />
            {phase === 'betting' ? (
              <button onClick={placeBet} disabled={queued || myStake > 0}
                className="flex-1 btn-primary py-3 disabled:opacity-40">
                {myStake > 0 ? `In for ${fmt(myStake, state.currency)}` : queued ? 'Queued ✓' : `Bet ${fmt(bet, state.currency)}`}
              </button>
            ) : (
              <button onClick={placeBet} disabled={queued}
                className="flex-1 btn-ghost py-3 disabled:opacity-40">
                {queued ? 'Queued for next round ✓' : 'Queue for next round'}
              </button>
            )}
          </div>
        )}
        <p className="text-center text-[9px] text-white/25 font-mono mt-2">
          Crash point provably fair — hash committed before the round, seed revealed after every bust
        </p>
      </div>

      {/* Players */}
      <div className="w-[94%] max-w-lg mb-6">
        <p className="font-display text-[10px] tracking-widest uppercase text-heisenberg-muted mb-1.5 flex items-center gap-1.5">
          <TrendingUp size={11} /> In this round ({state.players?.length || 0})
        </p>
        <div className="glass-card rounded-xl divide-y divide-white/5 max-h-40 overflow-y-auto custom-scroll">
          {(state.players || []).map((p, i) => (
            <div key={i} className="flex justify-between px-3 py-1.5 text-[11px] font-mono">
              <span className="text-white/80">{p.username}</span>
              <span className="text-heisenberg-muted">{fmt(p.amount, state.currency)}</span>
              <span className={p.cashedAt ? 'text-heisenberg-green' : 'text-white/30'}>
                {p.cashedAt ? `${Number(p.cashedAt).toFixed(2)}× +${fmt(Math.floor(p.amount * p.cashedAt), state.currency)}` : 'riding…'}
              </span>
            </div>
          ))}
          {(!state.players || state.players.length === 0) && <p className="empty-note !py-2">No riders yet</p>}
        </div>
      </div>
    </div>
  );
}
