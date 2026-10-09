import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Home, Bomb, Gem } from 'lucide-react';

function fmt(n) { return Number(n || 0).toLocaleString(); }
function minesMult(mines, revealed) {
  let comb = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
  return Math.floor(0.97 * (comb(25, revealed) / comb(25 - mines, revealed)) * 100) / 100;
}

export default function MinesGame() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [bet, setBet] = useState(50);
  const [mines, setMines] = useState(3);
  const [roundId, setRoundId] = useState(null);
  const [revealed, setRevealed] = useState([]);
  const [busted, setBusted] = useState(false);
  const [minePositions, setMinePositions] = useState([]);
  const [mult, setMult] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    axios.get('/api/house/mines/current').then(({ data }) => {
      if (!active || !data.round) return;
      setRoundId(data.round.roundId);
      setBet(data.round.bet);
      setMines(data.round.minesCount);
      setRevealed(data.round.revealed);
      setMult(data.round.mult);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const start = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    setRevealed([]); setBusted(false); setMinePositions([]); setMult(1); setMessage(null);
    try {
      const res = await axios.post('/api/house/mines/start', { bet, mines });
      setRoundId(res.data.roundId);
      toast('Pick tiles — avoid the bombs!', { icon: '💣' });
    } catch (err) { toast.error(err.response?.data?.error || 'Start failed'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const reveal = async (tile) => {
    if (!roundId || busyRef.current || revealed.includes(tile)) return;
    busyRef.current = true;
    try {
      const res = await axios.post('/api/house/mines/reveal', { roundId, tile });
      if (res.data.bust) {
        setBusted(true);
        setMinePositions(res.data.mines);
        setRoundId(null);
        setMessage({ text: `BOOM! You hit a mine — -${fmt(bet)}`, bad: true });
        refreshUser();
      } else {
        setRevealed(r => [...r, tile]);
        setMult(res.data.mult);
        if (res.data.finished) {
          setMinePositions(res.data.mines);
          setRoundId(null);
          setMessage({ text: `PERFECT CLEAR! +${fmt(res.data.payout)}`, bad: false });
          refreshUser();
        }
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Reveal failed'); }
    finally { busyRef.current = false; }
  };

  const cashout = async () => {
    if (!roundId || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const res = await axios.post('/api/house/mines/cashout', { roundId });
      setMinePositions(res.data.mines);
      setRoundId(null);
      setMessage({ text: `Cashed out ${res.data.mult}× — +${fmt(res.data.payout)}`, bad: false });
      refreshUser();
    } catch (err) { toast.error(err.response?.data?.error || 'Cashout failed'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const nextMult = minesMult(mines, revealed.length + 1);
  const inRound = !!roundId;

  return (
    <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden p-4"
      style={{ backgroundImage: 'url(/table-mines.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.88) 100%)' }} />
      <div className="absolute top-0 left-0 right-0 croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"><Home size={14} /> Exit</button>
        <span className="croom-chip">Mines · 3% house edge · provably fair</span>
        <span className="croom-chip">Bal <b>{fmt(user?.balancePlay)}</b></span>
      </div>

      <div className="glass-card p-5 rounded-3xl w-full max-w-md">
        {/* Grid */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {Array.from({ length: 25 }).map((_, i) => {
            const isRevealed = revealed.includes(i);
            const revealMineLayout = busted || Boolean(message);
            const isMine = revealMineLayout && minePositions.includes(i);
            const isUnexplodedMine = revealMineLayout && minePositions.includes(i) && !revealed.includes(i);
            return (
              <motion.button key={i} whileTap={inRound ? { scale: 0.92 } : {}}
                onClick={() => reveal(i)} disabled={!inRound}
                className="aspect-square rounded-xl flex items-center justify-center text-xl font-bold transition-all"
                style={{
                  background: isMine ? 'rgba(239,68,68,0.25)' : isRevealed ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isMine ? 'rgba(239,68,68,0.6)' : isRevealed ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.09)'}`,
                  opacity: (!inRound && !isRevealed && !isMine && !isUnexplodedMine) ? 0.4 : 1,
                  cursor: inRound ? 'pointer' : 'default',
                }}>
                <AnimatePresence>
                  {(isRevealed || isMine || isUnexplodedMine || (busted && minePositions.includes(i))) ? (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      {isMine ? '💣' : <Gem size={20} className="text-heisenberg-green" />}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Status */}
        {inRound && revealed.length > 0 && (
          <div className="flex justify-between text-xs font-mono mb-3 px-1">
            <span className="text-heisenberg-muted">Gems: <b className="text-heisenberg-green">{revealed.length}</b></span>
            <span>Current: <b className="text-heisenberg-gold">{mult}×</b></span>
            <span>Next: <b className="text-white/70">{nextMult}×</b></span>
          </div>
        )}
        <AnimatePresence>
          {message && (
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`text-center font-display text-sm font-bold tracking-wider mb-3 ${message.bad ? 'text-heisenberg-red' : 'text-heisenberg-green'}`}>
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Controls */}
        {!inRound ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input type="number" min={1} value={bet} onChange={e => setBet(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="input-field flex-1 text-center font-mono" placeholder="Bet" />
              <select value={mines} onChange={e => setMines(Number(e.target.value))}
                className="input-field w-28 text-center font-mono">
                {Array.from({ length: 24 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m} 💣</option>
                ))}
              </select>
            </div>
            <button onClick={start} disabled={busy} className="btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50">
              <Bomb size={15} /> {busy ? '…' : `START · ${fmt(bet)}`}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 glass-card rounded-xl py-3 text-center font-mono text-heisenberg-gold font-bold">
              {mult}× · {fmt(Math.floor(bet * mult))}
            </div>
            <button onClick={cashout} disabled={busy || revealed.length === 0}
              className="flex-1 btn-primary py-3 disabled:opacity-40">
              CASH OUT
            </button>
          </div>
        )}
        <p className="text-center text-[9px] text-white/25 font-mono mt-2">
          More bombs = bigger multipliers. Cash out before you click one.
        </p>
      </div>
    </div>
  );
}
