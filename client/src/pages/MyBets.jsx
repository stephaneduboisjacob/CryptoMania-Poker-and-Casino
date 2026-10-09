import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { History, ArrowLeft } from 'lucide-react';

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}

export default function MyBets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bets, setBets] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    axios.get('/api/house/mybets').then(r => setBets(r.data.bets)).catch(() => setBets([]));
  }, []);

  const games = ['all', ...new Set((bets || []).map(b => b.game))];
  const shown = (bets || []).filter(b => filter === 'all' || b.game === filter);

  return (
    <div className="page-root" style={{ backgroundImage: 'url(/lobby-floor.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.88), rgba(9,9,11,0.95))' }} />
      <div className="relative z-10 flex flex-col h-full">
        <Navbar btcPrice={null} />
        <div className="page-scroll">
          <main className="container mx-auto px-4 py-6 max-w-3xl">
            <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 mb-5">
              <ArrowLeft size={13} /> Casino
            </button>
            <div className="flex items-center gap-3 mb-5">
              <History size={24} className="text-heisenberg-neon" />
              <h1 className="font-display text-xl font-bold tracking-widest">My Bets</h1>
            </div>

            <div className="flex gap-2 mb-4 flex-wrap">
              {games.map(g => (
                <button key={g} onClick={() => setFilter(g)}
                  className={`casino-tab !py-1.5 !px-3 !text-[10px] ${filter === g ? 'casino-tab--active' : ''}`}>{g}</button>
              ))}
            </div>

            <div className="glass-card rounded-2xl overflow-hidden">
              {!bets && <div className="empty-note">Loading…</div>}
              {bets && shown.length === 0 && <div className="empty-note">No bets yet — go play something!</div>}
              {shown.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-xs font-mono"
                  style={{ borderBottom: i < shown.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div className="min-w-0">
                    <p className="text-white font-semibold">{b.game}</p>
                    <p className="text-heisenberg-muted text-[9px]">{new Date(b.at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-heisenberg-muted">{fmt(b.bet, b.currency)} → <span className="text-white">{fmt(b.payout, b.currency)}</span></p>
                    <p className={b.net >= 0 ? 'text-heisenberg-green' : 'text-heisenberg-red'}>
                      {b.net >= 0 ? '+' : ''}{fmt(b.net, b.currency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
