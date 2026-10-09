import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { isNative, getToken } from '../utils/tokenStorage';
import { Home, Wifi, WifiOff, Undo2 } from 'lucide-react';
import { sound } from '../utils/sound';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CHIP_COLORS = { 1: '#e5e7eb', 5: '#ef4444', 25: '#3b82f6', 100: '#111827', 500: '#8b5cf6', 1000: '#f7931a' };

function fmt(chips, currency) {
  const n = Number(chips || 0);
  return currency === 'btc' ? '$' + (n / 100).toFixed(2) : n.toLocaleString();
}

function pocketColor(n) {
  if (n === 0 || n === '00') return '#10b981';
  return RED.has(n) ? '#dc2626' : '#18181b';
}

export default function RouletteTablePage() {
  const { tableId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const roundRef = useRef(null);

  const [state, setState] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [connected, setConnected] = useState(false);
  const [chip, setChip] = useState(0);         // selected chip denomination
  const [mine, setMine] = useState([]);        // my placed bets this round [{type,num,amount}]
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const phase = state?.phase;
  const inBetting = phase === 'betting';
  const myStaked = mine.reduce((s, b) => s + b.amount, 0);

  useEffect(() => { if (state && !chip) setChip(state.minBet); }, [state?.minBet]);

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
        sound.init();
        setState(prev => {
          if (prev && s.phase !== prev.phase) {
            if (s.phase === 'spinning') sound.chipBet?.();
            if (s.phase === 'result') (myNet(s.lastWinners, user?.username) > 0 ? sound.win() : sound.lose?.());
          }
          return s;
        });
        // Roulette broadcasts a state update after every accepted bet. Keep
        // the local markers for those updates and clear them only for a new
        // round (roundNo changes when betting opens).
        if (roundRef.current !== s.roundNo) {
          roundRef.current = s.roundNo;
          setMine([]);
        }
      });
      sock.on('actionError', ({ message }) => {
        toast.error(message);
        // Bets are shown optimistically. Ask for a personalized snapshot after
        // a rejection so an unaccepted chip marker cannot linger on the felt.
        sock.emit('joinHouse', { tableId });
      });
      sock.on('balanceChanged', () => refreshUser());
    };
    connect();
    return () => { cancelled = true; socketRef.current?.disconnect(); };
  }, [tableId]);

  const myNet = (winners, username) => winners?.find(w => w.username === username)?.net || 0;

  const place = (type, num = null) => {
    if (!inBetting) return toast.error('Betting closed — wait for next spin');
    if (!chip) return;
    const staked = myStaked + chip;
    if (state && staked > state.maxBet) return toast.error(`Table max ${fmt(state.maxBet, state.currency)} per round`);
    sound.chipCall?.();
    setMine(current => {
      const currentBet = current.find(b => b.type === type && b.num === num);
      if (currentBet) {
        return current.map(b => b === currentBet ? { ...b, amount: b.amount + chip } : b);
      }
      return [...current, { type, num, amount: chip }];
    });
    socketRef.current?.emit('rlBet', { tableId, type, num, amount: chip });
  };

  const clearAll = () => {
    setMine([]);
    socketRef.current?.emit('rlClear', { tableId });
  };

  const secondsLeft = state?.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - clockNow - serverOffsetRef.current) / 1000)) : 0;
  const chipDenoms = state ? [state.minBet, state.minBet * 5, state.minBet * 25, state.minBet * 100].filter(v => v <= state.maxBet) : [];
  const boardBet = (type, num = null) => mine.find(b => b.type === type && b.num === num)?.amount || 0;

  const numbers = useMemo(() => Array.from({ length: 36 }, (_, i) => i + 1), []);
  if (!state) {
    return <div className="h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" /></div>;
  }

  const chipBtn = (v) => (
    <button key={v} onClick={() => setChip(v)}
      className="w-11 h-11 rounded-full font-mono text-[10px] font-bold flex items-center justify-center transition-transform hover:scale-110"
      style={{
        background: CHIP_COLORS[v] || '#52525b',
        color: [1, 500].includes(v) ? '#111' : '#fff',
        border: chip === v ? '3px solid #f7931a' : '3px dashed rgba(255,255,255,0.45)',
        boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
      }}>
      {fmt(v, state.currency)}
    </button>
  );

  return (
    <div className="h-screen flex flex-col relative overflow-hidden"
      style={{ backgroundImage: 'url(/table-roulette.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#101a10' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(0,0,0,0.2) 0%, rgba(9,9,11,0.82) 100%)' }} />

      {/* Top bar */}
      <div className="croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5">
          <Home size={14} /> Exit
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="croom-chip">{state.name}</span>
          <span className="croom-chip">{state.wheelType === 'american' ? 'Double Zero · 5.26%' : 'Single Zero · 2.7%'}</span>
          <div className={`croom-chip flex items-center gap-1 ${connected ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />} {connected ? 'Live' : '…'}
          </div>
        </div>
        <span className="croom-chip">Bal <b>{formatCasinoBalance(user, state.currency)}</b></span>
      </div>

      {/* Phase + result */}
      <div className="relative z-10 flex items-center justify-center gap-3 pt-16 pb-2">
        <AnimatePresence mode="wait">
          {phase === 'result' && state.result != null ? (
            <motion.div key={state.result + '-' + state.roundNo} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-3 px-6 py-2.5 rounded-2xl border"
              style={{ background: pocketColor(state.result), borderColor: 'rgba(255,255,255,0.2)' }}>
              <span className="font-display text-3xl font-bold text-white">{state.result}</span>
              <span className="text-[10px] uppercase tracking-widest text-white/70 font-display">
                {state.result === 0 || state.result === '00' ? 'Green' : RED.has(state.result) ? 'Red' : 'Black'}
              </span>
            </motion.div>
          ) : (
            <motion.div key={phase + '-' + secondsLeft} className="croom-chip !text-sm !px-5 !py-2">
              {phase === 'betting' && <>Place your bets — <b className="text-heisenberg-gold">{secondsLeft}s</b></>}
              {phase === 'spinning' && <span className="flex items-center gap-2"><motion.img src="/wheel.png" alt="" aria-hidden="true"
                className="w-9 h-9 object-contain" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} /> Wheel spinning…</span>}
              {phase === 'result' && <>Round #{state.roundNo} complete</>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History strip */}
      <div className="relative z-10 flex justify-center gap-1.5 mb-2 px-4 overflow-hidden">
        {state.history?.slice(-14).map((n, i) => (
          <span key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono font-bold text-white shrink-0"
            style={{ background: pocketColor(n), border: '1px solid rgba(255,255,255,0.2)' }}>{n}</span>
        ))}
      </div>

      {/* Betting board */}
      <div className="relative z-10 flex-1 flex items-start justify-center px-3 overflow-y-auto custom-scroll pb-40">
        <div className="glass-card p-3 rounded-2xl select-none">
          {/* Zero row + wheel numbers */}
          <div className="flex gap-1">
            <button onClick={() => place('straight', 0)}
              className="w-10 rounded-lg font-mono font-bold text-white text-sm relative flex items-center justify-center hover:brightness-125"
              style={{ background: pocketColor(0), border: '1px solid rgba(255,255,255,0.15)', height: 116 }}>
              0
              {boardBet('straight', 0) > 0 && <ChipMark amount={boardBet('straight', 0)} currency={state.currency} />}
            </button>
            {state.wheelType === 'american' && (
              <button onClick={() => place('straight', '00')}
                className="w-10 rounded-lg font-mono font-bold text-white text-sm relative flex items-center justify-center hover:brightness-125"
                style={{ background: pocketColor('00'), border: '1px solid rgba(255,255,255,0.15)', height: 116 }}>
                00
                {boardBet('straight', '00') > 0 && <ChipMark amount={boardBet('straight', '00')} currency={state.currency} />}
              </button>
            )}
            <div className="grid grid-rows-3 grid-flow-col gap-1">
              {[2, 1, 0].map(rowOffset =>
                numbers.filter(n => n % 3 === (rowOffset === 0 ? 0 : rowOffset === 1 ? 2 : 1)).map(n => (
                  <button key={n} onClick={() => place('straight', n)}
                    className="w-8 md:w-10 rounded-md font-mono font-bold text-white text-xs relative flex items-center justify-center hover:brightness-125"
                    style={{ background: pocketColor(n), border: '1px solid rgba(255,255,255,0.15)', height: 36 }}>
                    {n}
                    {boardBet('straight', n) > 0 && <ChipMark amount={boardBet('straight', n)} currency={state.currency} />}
                  </button>
                ))
              )}
            </div>
            {/* Columns */}
            {[3, 2, 1].map((col, i) => (
              <button key={col} onClick={() => place('col' + col)}
                className="w-8 md:w-10 rounded-md text-[9px] font-display font-semibold text-white/80 relative flex items-center justify-center hover:brightness-125"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', height: 36, marginTop: i * 0 }}>
                2:1
                {boardBet('col' + col) > 0 && <ChipMark amount={boardBet('col' + col)} currency={state.currency} />}
              </button>
            ))}
          </div>
          {/* Dozens */}
          <div className="flex gap-1 mt-1 ml-11">
            {['dozen1', 'dozen2', 'dozen3'].map((d, i) => (
              <button key={d} onClick={() => place(d)}
                className="flex-1 rounded-md py-2 text-[10px] font-display font-semibold text-white/85 relative hover:brightness-125"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {['1st 12', '2nd 12', '3rd 12'][i]}
                {boardBet(d) > 0 && <ChipMark amount={boardBet(d)} currency={state.currency} />}
              </button>
            ))}
          </div>
          {/* Outside bets */}
          <div className="flex gap-1 mt-1 ml-11">
            {[['low', '1-18'], ['even', 'EVEN'], ['red', 'RED'], ['black', 'BLACK'], ['odd', 'ODD'], ['high', '19-36']].map(([type, label]) => (
              <button key={type} onClick={() => place(type)}
                className="flex-1 rounded-md py-2 text-[10px] font-display font-semibold relative hover:brightness-125"
                style={{
                  background: type === 'red' ? '#dc2626' : type === 'black' ? '#18181b' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)', color: type === 'red' || type === 'black' ? '#fff' : 'rgba(255,255,255,0.85)',
                }}>
                {label}
                {boardBet(type) > 0 && <ChipMark amount={boardBet(type)} currency={state.currency} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom dock */}
      <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-4">
        <div className="mx-auto max-w-2xl glass-card p-3 rounded-2xl">
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <div className="flex items-center gap-2">{chipDenoms.map(chipBtn)}</div>
            <div className="flex items-center gap-3">
              <span className="croom-chip">Staked <b className={myStaked > 0 ? 'text-heisenberg-gold' : ''}>{fmt(myStaked, state.currency)}</b></span>
              {myStaked > 0 && inBetting && (
                <button onClick={clearAll} className="btn-ghost text-[10px] py-1.5 px-3 flex items-center gap-1">
                  <Undo2 size={11} /> Clear
                </button>
              )}
            </div>
          </div>
          {/* Last winners */}
          {state.lastWinners?.length > 0 && phase === 'result' && (
            <p className="text-center text-[10px] text-heisenberg-green font-mono mt-2">
              {state.lastWinners.slice(0, 3).map(w => `${w.username} +${fmt(w.net, state.currency)}`).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChipMark({ amount, currency }) {
  return (
    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-mono font-bold z-10"
      style={{ background: '#f7931a', color: '#09090b', border: '1.5px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
      {currency === 'btc' ? (amount >= 100 ? '$' + Math.round(amount / 100) : '$' + (amount / 100).toFixed(1)) : (amount >= 1000 ? Math.round(amount / 1000) + 'k' : amount)}
    </span>
  );
}
