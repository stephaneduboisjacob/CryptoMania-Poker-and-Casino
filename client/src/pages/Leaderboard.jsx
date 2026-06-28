import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { Trophy, TrendingUp, ArrowLeft } from 'lucide-react';
import { fmtUsd, btcToUsd } from '../utils/usd';
import { useAuth } from '../context/AuthContext';

export default function Leaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [btcPrice, setBtcPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/stats/leaderboard')
      .then(r => { setRows(r.data.leaderboard); setBtcPrice(r.data.btcPrice); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const medalColor = (rank) => {
    if (rank === 1) return '#ffd700';
    if (rank === 2) return '#c0c0c0';
    if (rank === 3) return '#cd7f32';
    return '#6b6b9a';
  };

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-3xl">

        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-heisenberg-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-heisenberg-card/60">
            <ArrowLeft size={18} />
          </button>
          <Trophy size={24} className="text-heisenberg-gold" />
          <div>
            <h1 className="font-display text-2xl font-black text-white tracking-widest">LEADERBOARD</h1>
            <p className="text-heisenberg-muted text-xs font-mono">Heads-Up · Human vs Human only</p>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-heisenberg-muted font-mono">
            No ranked games yet — be the first to play!
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const isMe = r.username === user?.username;
              const profitBtc = parseFloat(r.profit);
              const profitUsd = btcPrice ? btcToUsd(profitBtc, btcPrice) : null;
              return (
                <motion.div key={r.id}
                  initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`glass-card p-4 rounded-xl flex items-center gap-4 ${isMe ? 'ring-1 ring-heisenberg-neon/40' : ''}`}>

                  {/* Rank */}
                  <div className="w-8 text-center">
                    {r.rank <= 3
                      ? <span className="text-xl">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}</span>
                      : <span className="font-mono text-sm font-bold" style={{ color: medalColor(r.rank) }}>#{r.rank}</span>
                    }
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm shrink-0"
                    style={{ background: 'linear-gradient(135deg, #00d4ff22, #ff6b0022)', border: '1px solid #00d4ff22' }}>
                    {r.username[0].toUpperCase()}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <Link to={`/profile/${r.username}`}
                      className="font-mono text-sm font-bold text-white hover:text-heisenberg-neon transition-colors">
                      {r.username}{isMe && <span className="text-heisenberg-neon ml-1 text-xs font-normal">(you)</span>}
                    </Link>
                    <p className="text-heisenberg-muted text-xs font-mono">{r.games} games</p>
                  </div>

                  {/* Win rate */}
                  <div className="text-center hidden sm:block">
                    <p className="font-mono text-sm font-bold text-heisenberg-gold">{r.winRate}%</p>
                    <p className="text-heisenberg-muted text-xs font-mono">{r.wins}W / {r.games - r.wins}L</p>
                  </div>

                  {/* Profit */}
                  <div className="text-right shrink-0">
                    {profitUsd != null ? (
                      <p className={`font-mono text-sm font-bold flex items-center gap-1 justify-end ${profitUsd >= 0 ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
                        <TrendingUp size={12} />
                        {fmtUsd(profitUsd, { showPlus: true })}
                      </p>
                    ) : (
                      <p className={`font-mono text-sm font-bold flex items-center gap-1 justify-end ${profitBtc >= 0 ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
                        <TrendingUp size={12} />
                        {profitBtc >= 0 ? '+' : ''}{profitBtc.toFixed(5)} BTC
                      </p>
                    )}
                    <p className="text-heisenberg-muted/50 text-[10px] font-mono">
                      {r.wins}W / {r.games - r.wins}L
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
