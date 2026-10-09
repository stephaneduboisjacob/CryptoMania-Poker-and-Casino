import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { Home } from 'lucide-react';

const ROWS = 16;
const RISK_MULTS = {
  low: [16, 5, 2, 1.6, 1.3, 1.1, 1, 0.9, 0.8, 0.9, 1, 1.1, 1.3, 1.6, 2, 5, 16],
  medium: [120, 42, 11, 5.5, 3, 1.5, 0.9, 0.5, 0.2, 0.5, 0.9, 1.5, 3, 5.5, 11, 42, 120],
  high: [440, 120, 30, 8, 3, 1, 0.7, 0.4, 0.2, 0.4, 0.7, 1, 3, 8, 30, 120, 440],
};

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}
function bucketColor(m) {
  if (m >= 20) return '#ef4444';
  if (m >= 5) return '#f7931a';
  if (m >= 1) return '#fbbf24';
  return '#3f3f46';
}

export default function PlinkoGame() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const currency = new URLSearchParams(window.location.search).get('c') === 'btc' ? 'btc' : 'play';
  const machineId = currency === 'btc' ? 'plinko-btc' : 'plinko';
  const [risk, setRisk] = useState('medium');
  const [bet, setBet] = useState(10);
  const [balls, setBalls] = useState([]);     // active animations {id, path, bucket, multiplier, step}
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const mults = RISK_MULTS[risk];

  const drop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await axios.post(`/api/house/play/${machineId}`, { bet, params: { risk } });
      const id = Date.now() + Math.random();
      setBalls(b => [...b, { id, path: res.data.path, bucket: res.data.bucket, multiplier: res.data.multiplier, step: 0 }]);
      refreshUser();
      // animate through rows
      let step = 0;
      const iv = setInterval(() => {
        step++;
        setBalls(bs => bs.map(b => b.id === id ? { ...b, step } : b));
        if (step >= ROWS) {
          clearInterval(iv);
          setTimeout(() => {
            setBalls(bs => bs.filter(b => b.id !== id));
            setResults(r => [{ m: res.data.multiplier, net: res.data.net }, ...r].slice(0, 12));
            if (res.data.payout > 0) toast.success(`${res.data.multiplier}× — +${fmt(res.data.payout, currency)}`);
            setBusy(false);
          }, 350);
        }
      }, 90);
    } catch (err) {
      setBusy(false);
      toast.error(err.response?.data?.error || 'Drop failed');
    }
  };

  // ball x-position after `step` rows: bucket center interpolation
  const ballPos = (b) => {
    const rights = b.path.slice(0, b.step).reduce((s, x) => s + x, 0);
    return 50 + (rights - b.step / 2) * (86 / ROWS);
  };
  const ballY = (b) => 6 + (b.step / ROWS) * 78;

  return (
    <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden p-4"
      style={{ backgroundImage: 'url(/table-plinko.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 25%, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.88) 100%)' }} />
      <div className="absolute top-0 left-0 right-0 croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"><Home size={14} /> Exit</button>
        <span className="croom-chip">Plinko · 16 rows</span>
        <span className="croom-chip">Bal <b>{formatCasinoBalance(user, currency)}</b></span>
      </div>

      <div className="glass-card p-5 rounded-3xl w-full max-w-lg">
        {/* Board */}
        <div className="relative mx-auto mb-3" style={{ width: '100%', maxWidth: 420, height: 380 }}>
          {/* Pegs */}
          {Array.from({ length: ROWS }).map((_, row) =>
            Array.from({ length: row + 1 }).map((__, i) => (
              <div key={`${row}-${i}`} className="absolute rounded-full bg-white/25"
                style={{
                  width: 4, height: 4,
                  left: `${50 + (i - row / 2) * (86 / ROWS)}%`,
                  top: `${6 + ((row + 1) / ROWS) * 78}%`,
                  transform: 'translate(-50%, -50%)',
                }} />
            ))
          )}
          {/* Balls */}
          <AnimatePresence>
            {balls.map(b => (
              <motion.div key={b.id} className="absolute rounded-full z-10"
                style={{ width: 12, height: 12, background: '#f7931a', boxShadow: '0 0 10px rgba(247,147,26,0.6)' }}
                animate={{ left: `${ballPos(b)}%`, top: `${ballY(b)}%` }}
                transition={{ duration: 0.09, ease: 'linear' }}
                initial={{ left: '50%', top: '4%' }} />
            ))}
          </AnimatePresence>
          {/* Buckets */}
          <div className="absolute bottom-0 left-0 right-0 flex gap-0.5 px-1">
            {mults.map((m, i) => {
              const hit = balls.some(b => b.step >= ROWS && b.bucket === i);
              return (
                <div key={i} className="flex-1 rounded-md flex items-center justify-center font-mono font-bold text-[8px] md:text-[9px] py-1.5"
                  style={{
                    background: bucketColor(m), color: m >= 1 ? '#09090b' : '#fff',
                    opacity: hit ? 1 : 0.75, transform: hit ? 'scale(1.12)' : 'none',
                  }}>
                  {m}×
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-1.5 justify-center mb-2">
          {Object.keys(RISK_MULTS).map(r => (
            <button key={r} onClick={() => setRisk(r)} disabled={busy}
              className={`px-4 py-1.5 rounded-lg font-display text-[10px] font-bold tracking-widest uppercase ${risk === r ? 'text-heisenberg-neon' : 'text-white/40'}`}
              style={{ background: risk === r ? 'rgba(247,147,26,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${risk === r ? 'rgba(247,147,26,0.5)' : 'rgba(255,255,255,0.1)'}` }}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="number" min={1} value={bet} onChange={e => setBet(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="input-field w-28 text-center font-mono" />
          <button onClick={drop} disabled={busy} className="flex-1 btn-primary py-3 disabled:opacity-50">
            {busy ? '…' : `DROP · ${fmt(bet, currency)}`}
          </button>
        </div>

        {/* Recent */}
        <div className="flex gap-1.5 mt-3 flex-wrap min-h-[22px]">
          {results.map((r, i) => (
            <span key={i} className="croom-chip !text-[9px]" style={{ color: r.net >= 0 ? '#10b981' : '#71717a' }}>
              {r.m}× {r.net >= 0 ? '+' : ''}{fmt(r.net, currency)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
