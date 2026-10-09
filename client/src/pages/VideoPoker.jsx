import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { Home } from 'lucide-react';

const PAYTABLE = [
  ['Royal Flush', 250], ['Straight Flush', 50], ['Four of a Kind', 25],
  ['Full House', 8], ['Flush', 5], ['Straight', 4],
  ['Three of a Kind', 3], ['Two Pair', 2], ['Jacks or Better', 1],
];
const RESULT_LABEL = {
  royal: 'ROYAL FLUSH!', straightflush: 'STRAIGHT FLUSH!', quads: 'FOUR OF A KIND!',
  fullhouse: 'FULL HOUSE', flush: 'FLUSH', straight: 'STRAIGHT',
  trips: 'THREE OF A KIND', twopair: 'TWO PAIR', jacks: 'JACKS OR BETTER', none: null,
};

function PlayingCardView({ card, held, onClick, dim }) {
  const ranks = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
  const v = card ? (ranks[card[0]] || card[0]) : '';
  const s = card ? card[1] : '';
  const suitSym = { s: '♠', h: '♥', d: '♦', c: '♣' }[s] || '';
  const red = s === 'h' || s === 'd';
  return (
    <button onClick={onClick} disabled={!onClick}
      className="w-16 h-24 md:w-20 md:h-28 rounded-xl flex flex-col items-center justify-center font-bold transition-all"
      style={{
        background: card ? '#fff' : 'rgba(255,255,255,0.04)',
        border: held ? '2px solid #f7931a' : '1px solid rgba(255,255,255,0.15)',
        color: red ? '#dc2626' : '#18181b',
        opacity: dim ? 0.45 : 1,
        transform: held ? 'translateY(-6px)' : 'none',
        boxShadow: held ? '0 0 0 1px rgba(247,147,26,0.4)' : 'none',
      }}>
      {card ? (
        <>
          <span className="text-lg leading-none">{v}</span>
          <span className="text-2xl leading-tight">{suitSym}</span>
        </>
      ) : <span className="text-2xl text-white/20">?</span>}
    </button>
  );
}

export default function VideoPoker() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const currency = new URLSearchParams(window.location.search).get('c') === 'btc' ? 'btc' : 'play';
  const machineId = currency === 'btc' ? 'videopoker-btc' : 'videopoker';
  const [bet, setBet] = useState(10);
  const [hand, setHand] = useState([]);
  const [roundId, setRoundId] = useState(null);
  const [hold, setHold] = useState([]);
  const [finalHand, setFinalHand] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    axios.get(`/api/house/vp/${machineId}/current`)
      .then(({ data }) => {
        if (!active || !data.round) return;
        setHand(data.round.hand);
        setRoundId(data.round.roundId);
        setBet(data.round.bet);
      })
      .catch(() => {})
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [machineId]);

  const deal = async () => {
    setBusy(true); setResult(null); setFinalHand(null); setHold([]); setHand([]); setRoundId(null);
    try {
      const res = await axios.post(`/api/house/vp/${machineId}/deal`, { bet });
      setHand(res.data.hand);
      setRoundId(res.data.roundId);
    } catch (err) {
      if (err.response?.status === 409) {
        try {
          const { data } = await axios.get(`/api/house/vp/${machineId}/current`);
          if (data.round) {
            setHand(data.round.hand);
            setRoundId(data.round.roundId);
            setBet(data.round.bet);
          }
        } catch {}
      }
      toast.error(err.response?.data?.error || 'Deal failed');
    } finally { setBusy(false); }
  };

  const draw = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`/api/house/vp/${machineId}/draw`, { roundId, hold });
      setFinalHand(res.data.finalCards);
      setRoundId(null);
      setResult(res.data);
      refreshUser();
      if (res.data.payout > 0) toast.success(`${RESULT_LABEL[res.data.result]} +${fmtP(res.data.payout)}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Draw failed');
    } finally { setBusy(false); }
  };

  const fmtP = (n) => currency === 'btc' ? '$' + (n / 100).toFixed(2) : Number(n).toLocaleString();
  const toggleHold = (i) => {
    if (finalHand) return;
    setHold(h => h.includes(i) ? h.filter(x => x !== i) : [...h, i]);
  };
  const shown = finalHand || hand;
  const inHand = hand.length > 0 && !finalHand;
  const activeResult = result ? RESULT_LABEL[result.result] : null;

  return (
    <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden p-4"
      style={{ backgroundImage: 'url(/table-videopoker.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(9,9,11,0.5) 0%, rgba(9,9,11,0.88) 100%)' }} />
      <div className="absolute top-0 left-0 right-0 croom-topbar">
        <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5"><Home size={14} /> Exit</button>
        <span className="croom-chip">Jacks or Better 8/5 · 97.3% RTP</span>
        <span className="croom-chip">Bal <b>{formatCasinoBalance(user, currency)}</b></span>
      </div>

      <div className="glass-card p-6 rounded-3xl w-full max-w-xl">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[10px] font-mono mb-5 max-w-[260px] mx-auto">
          {PAYTABLE.map(([label, pay]) => {
            const highlight = result && RESULT_LABEL[result.result] && PAYTABLE.find(p => p[0] === label)[0].toUpperCase().startsWith(activeResult.split(' ')[0]?.toUpperCase() || '§');
            return (
              <div key={label} className="flex justify-between" style={{ color: highlight ? '#fbbf24' : '#71717a' }}>
                <span>{label}</span><span className="font-bold">{pay}×</span>
              </div>
            );
          })}
        </div>

        {/* Cards */}
        <div className="flex gap-2 justify-center mb-2">
          {shown.map((c, i) => (
            <motion.div key={i} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06 }}>
              <PlayingCardView card={c} held={hold.includes(i) && inHand} dim={false}
                onClick={inHand ? () => toggleHold(i) : undefined} />
            </motion.div>
          ))}
        </div>
        <p className="text-center text-[10px] text-heisenberg-muted font-mono mb-4 h-4">
          {inHand ? 'Tap cards to HOLD' : activeResult || '\u00A0'}
        </p>

        {/* Controls */}
        <div className="flex gap-2 items-center">
          {!inHand && (
            <>
              <input type="number" min={1} value={bet} onChange={e => setBet(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="input-field w-28 text-center font-mono" disabled={busy || restoring} />
              <button onClick={deal} disabled={busy || restoring} className="flex-1 btn-primary py-3 disabled:opacity-50">
                {restoring ? 'RESTORING…' : busy ? '…' : `DEAL · ${fmtP(bet)}`}
              </button>
            </>
          )}
          {inHand && (
            <button onClick={draw} disabled={busy} className="flex-1 btn-primary py-3 disabled:opacity-50">
              {busy ? '…' : `DRAW · ${hold.length} held`}
            </button>
          )}
        </div>
        {result && (
          <p className={`text-center font-mono text-sm mt-3 ${result.payout > 0 ? 'text-heisenberg-gold' : 'text-heisenberg-red'}`}>
            {result.payout > 0 ? `${RESULT_LABEL[result.result]} — paid ${fmtP(result.payout)}` : 'No qualifying hand'}
          </p>
        )}
      </div>
    </div>
  );
}
