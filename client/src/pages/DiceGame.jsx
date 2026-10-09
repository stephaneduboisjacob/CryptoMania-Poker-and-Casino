import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { Home, Dice5 } from 'lucide-react';

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}

export default function DiceGame() {
  const { currency = 'play' } = { currency: new URLSearchParams(window.location.search).get('c') || 'play' };
  const machineId = currency === 'btc' ? 'dice-btc' : 'dice';
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState('under');
  const [bet, setBet] = useState(10);
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState('50.00');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const animRef = useRef(null);

  const chance = direction === 'under' ? target : 100 - target;
  const multiplier = Math.floor((99 / chance) * 10000) / 10000;
  const profit = Math.floor(bet * multiplier) - bet;

  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    setResult(null);
    animRef.current = setInterval(() => setDisplay((Math.random() * 100).toFixed(2)), 60);
    try {
      const res = await axios.post(`/api/house/play/${machineId}`, { bet, params: { target, direction } });
      // spin animation for ~700ms then land
      setTimeout(() => {
        clearInterval(animRef.current);
        setDisplay(res.data.roll.toFixed(2));
        setRolling(false);
        setResult(res.data);
        setHistory(h => [{ win: res.data.win, roll: res.data.roll }, ...h].slice(0, 12));
        if (res.data.win) toast.success(`+${fmt(res.data.payout, currency)} (${multiplier}×)`);
        refreshUser();
      }, 700);
    } catch (err) {
      clearInterval(animRef.current);
      setRolling(false);
      toast.error(err.response?.data?.error || 'Roll failed');
    }
  };

  useEffect(() => () => clearInterval(animRef.current), []);

  const winZone = direction === 'under' ? r => r < target : r => r > target;

  return (
    <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden p-4"
      style={{ backgroundImage: 'url(/table-dice.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(9,9,11,0.5) 0%, rgba(9,9,11,0.88) 100%)' }} />
      <div className="absolute top-0 left-0 right-0 croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"><Home size={14} /> Exit</button>
        <span className="croom-chip">Dice · 1% house edge</span>
        <span className="croom-chip">Bal <b>{formatCasinoBalance(user, currency)}</b></span>
      </div>

      <div className="glass-card p-6 rounded-3xl w-full max-w-lg">
        {/* Roll display */}
        <div className="text-center mb-6">
          <motion.div key={display} initial={{ scale: rolling ? 0.98 : 1 }} animate={{ scale: 1 }}
            className="font-mono font-bold text-6xl"
            style={{ color: rolling ? '#a1a1aa' : result ? (result.win ? '#10b981' : '#ef4444') : '#fafafa' }}>
            {display}
          </motion.div>
          <AnimatePresence>
            {result && !rolling && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`font-display text-sm tracking-widest uppercase mt-1 ${result.win ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
                {result.win ? `WIN +${fmt(result.payout - result.bet, currency)}` : 'LOST'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Target slider */}
        <div className="mb-2">
          <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#ef4444' }}>
            <div className="absolute inset-y-0" style={{ background: '#10b981', [direction === 'under' ? 'left' : 'right']: 0, width: `${chance}%` }} />
          </div>
          <input type="range" min={2} max={98} value={target} onChange={e => setTarget(Number(e.target.value))}
            className="w-full accent-heisenberg-neon mt-1" disabled={rolling} />
        </div>
        <div className="flex justify-between text-xs font-mono text-heisenberg-muted mb-4">
          <span>Roll <b className="text-white">{direction === 'under' ? '<' : '>'} {target}</b></span>
          <span>Chance <b className="text-white">{chance}.00%</b></span>
          <span>Multiplier <b className="text-heisenberg-gold">{multiplier}×</b></span>
          <span>Profit <b className="text-heisenberg-green">+{fmt(profit, currency)}</b></span>
        </div>

        {/* Direction + bet */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setDirection('under')} disabled={rolling}
            className={`flex-1 py-2.5 rounded-xl font-display text-xs font-bold tracking-widest uppercase ${direction === 'under' ? 'text-white' : 'text-white/40'}`}
            style={{ background: direction === 'under' ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${direction === 'under' ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}` }}>
            Roll Under
          </button>
          <button onClick={() => setDirection('over')} disabled={rolling}
            className={`flex-1 py-2.5 rounded-xl font-display text-xs font-bold tracking-widest uppercase ${direction === 'over' ? 'text-white' : 'text-white/40'}`}
            style={{ background: direction === 'over' ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${direction === 'over' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}` }}>
            Roll Over
          </button>
        </div>
        <div className="flex gap-2 items-center mb-4">
          <input type="number" min={1} value={bet} onChange={e => setBet(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="input-field flex-1 text-center font-mono" disabled={rolling} />
          <button onClick={roll} disabled={rolling} className="btn-primary px-8 py-3 flex items-center gap-2 disabled:opacity-50">
            {rolling ? '…' : <><Dice5 size={15} /> Roll</>}
          </button>
        </div>

        {/* History */}
        <div className="flex gap-1.5 flex-wrap">
          {history.map((h, i) => (
            <span key={i} className="croom-chip !text-[9px]" style={{ color: h.win ? '#10b981' : '#71717a' }}>{h.roll.toFixed(2)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
