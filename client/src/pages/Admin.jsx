import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { Users, Trophy, DollarSign, Activity, RefreshCw, Ban, ChevronRight, Bot, Zap } from 'lucide-react';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass-card p-5 rounded-xl">
      <div className="flex items-center gap-3 mb-2">
        <Icon size={18} style={{ color }} />
        <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase">{label}</p>
      </div>
      <p className="font-mono text-2xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

const DIFFICULTY_INFO = {
  easy:   { label: 'Easy',   color: '#00ff88', desc: 'Basic hand strength, no adaptation. Perfect for new players.' },
  medium: { label: 'Medium', color: '#00d4ff', desc: 'Pot odds, c-bet strategy, position awareness.' },
  hard:   { label: 'Hard',   color: '#ff6b00', desc: 'Range tracking, exploitative adjustments, multi-street planning.' },
  insane: { label: 'Insane', color: '#ff3355', desc: 'Near-GTO. Range vs range equity, polarised rivers, ICM push/fold, alpha-balanced bluffs.' },
};

const DELAY_INFO = {
  fast:  { label: 'Fast (0.3–0.8s)',       desc: 'Lightning quick. Feels like a computer.' },
  normal:{ label: 'Normal (0.7–1.8s)',      desc: 'Default. Slightly faster than human.' },
  slow:  { label: 'Slow (1.5–3.5s)',        desc: 'Takes its time. Realistic feel.' },
  human: { label: 'Human-like (1.2–4.0s)',  desc: 'Randomised variance. Most human-like.' },
};

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [aiSettings, setAiSettings] = useState(null);
  const [aiStats, setAiStats] = useState(null);
  const [aiForm, setAiForm] = useState({ name: '', difficulty: 'medium', action_delay: 'normal', emoji: '🤖' });
  const [savingAi, setSavingAi] = useState(false);
  const [tab, setTab] = useState('overview');
  const [userSearch, setUserSearch] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editBalance, setEditBalance] = useState({ btc: '', play: '' });

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (tab === 'users') fetchUsers(); }, [tab, userSearch]);
  useEffect(() => { if (tab === 'tournaments') fetchTournaments(); }, [tab]);
  useEffect(() => { if (tab === 'transactions') fetchTransactions(); }, [tab]);
  useEffect(() => { if (tab === 'ai') fetchAiSettings(); }, [tab]);

  const fetchData = async () => {
    try {
      const res = await axios.get('/api/admin/stats');
      setStats(res.data.stats);
    } catch {}
  };

  const fetchAiSettings = async () => {
    try {
      const res = await axios.get('/api/admin/ai-settings');
      setAiSettings(res.data.settings);
      setAiStats(res.data.aiStats);
      setAiForm({
        name: res.data.settings.name,
        difficulty: res.data.settings.difficulty,
        action_delay: res.data.settings.action_delay,
        emoji: res.data.settings.emoji,
      });
    } catch {}
  };

  const saveAiSettings = async () => {
    setSavingAi(true);
    try {
      await axios.post('/api/admin/ai-settings', aiForm);
      toast.success('AI settings saved');
      fetchAiSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSavingAi(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`/api/admin/users?search=${userSearch}`);
      setUsers(res.data.users);
    } catch {}
  };

  const fetchTournaments = async () => {
    try {
      const res = await axios.get('/api/admin/tournaments');
      setTournaments(res.data.tournaments);
    } catch {}
  };

  const fetchTransactions = async () => {
    try {
      const res = await axios.get('/api/admin/transactions');
      setTransactions(res.data.transactions);
    } catch {}
  };

  const banUser = async (id, ban) => {
    try {
      await axios.post(`/api/admin/users/${id}/ban`, { ban });
      toast.success(ban ? 'User banned' : 'User unbanned');
      fetchUsers();
    } catch { toast.error('Failed'); }
  };

  const updateBalance = async () => {
    if (!editUser) return;
    try {
      await axios.post(`/api/admin/users/${editUser.id}/balance`, {
        btc: editBalance.btc ? parseFloat(editBalance.btc) : undefined,
        play: editBalance.play ? parseFloat(editBalance.play) : undefined,
      });
      toast.success('Balance updated');
      setEditUser(null);
      fetchUsers();
    } catch { toast.error('Failed'); }
  };

  const TABS = ['overview', 'users', 'tournaments', 'transactions', 'ai'];
  const tierColor = { play: '#6b6b9a', '0.001': '#00d4ff', '0.01': '#ff6b00', '0.1': '#ffd700' };

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-3xl font-bold text-heisenberg-purple tracking-widest">ADMIN PANEL</h1>
          <button onClick={fetchData} className="text-heisenberg-muted hover:text-white transition-colors p-2">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-xl font-display text-xs tracking-widest uppercase font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${tab === t ? 'bg-heisenberg-purple/20 text-heisenberg-purple border border-heisenberg-purple/40' : 'btn-ghost text-xs py-2.5'}`}>
              {t === 'ai' && <Bot size={12} />}
              {t === 'ai' ? 'AI Settings' : t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && stats && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard icon={Users} label="Players" value={stats.totalUsers} color="#00d4ff" />
              <StatCard icon={Trophy} label="Tournaments" value={stats.totalTournaments} color="#ff6b00" />
              <StatCard icon={DollarSign} label="Revenue" value={`₿${stats.totalRevenue.toFixed(6)}`} color="#ffd700" />
              <StatCard icon={Activity} label="Live Games" value={stats.activeTournaments} color="#00ff88" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-muted mb-3">Recent Games</h3>
                <div className="space-y-2">
                  {stats && (
                    <div className="glass-card p-3 rounded-xl text-xs text-heisenberg-muted font-mono">
                      Switch to the Tournaments tab for full game history
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-muted mb-3">Recent Transactions</h3>
                <div className="space-y-2">
                  {stats && (
                    <div className="glass-card p-3 rounded-xl text-xs text-heisenberg-muted font-mono">
                      Switch to the Transactions tab for full history
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <input className="input-field mb-4 max-w-sm" placeholder="Search username..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            {editUser && (
              <div className="glass-card p-4 rounded-xl mb-4">
                <p className="font-display text-sm text-heisenberg-neon mb-3">Edit balance for @{editUser.username}</p>
                <div className="flex gap-3 mb-3">
                  <input className="input-field flex-1" placeholder="BTC balance" value={editBalance.btc} onChange={e => setEditBalance(b => ({ ...b, btc: e.target.value }))} />
                  <input className="input-field flex-1" placeholder="Play chips" value={editBalance.play} onChange={e => setEditBalance(b => ({ ...b, play: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditUser(null)} className="btn-ghost text-sm py-2 px-4">Cancel</button>
                  <button onClick={updateBalance} className="btn-neon text-sm py-2 px-4">Update</button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className={`glass-card p-4 rounded-xl flex items-center justify-between ${u.is_banned ? 'opacity-50' : ''}`}>
                  <div>
                    <p className="font-mono text-sm text-heisenberg-text">{u.username} {u.is_admin && <span className="text-heisenberg-purple text-xs">[admin]</span>}</p>
                    <p className="text-heisenberg-muted text-xs font-mono">₿{parseFloat(u.balance_btc).toFixed(6)} | ⬡{parseFloat(u.balance_play).toLocaleString()} | Joined {new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditUser(u); setEditBalance({ btc: u.balance_btc, play: u.balance_play }); }} className="text-heisenberg-neon hover:text-white p-1.5 transition-colors" title="Edit balance">
                      <ChevronRight size={16} />
                    </button>
                    {!u.is_admin && (
                      <button onClick={() => banUser(u.id, !u.is_banned)} className={`p-1.5 transition-colors ${u.is_banned ? 'text-heisenberg-green' : 'text-heisenberg-red hover:text-white'}`} title={u.is_banned ? 'Unban' : 'Ban'}>
                        <Ban size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tournaments */}
        {tab === 'tournaments' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="space-y-2">
              {tournaments.map(t => (
                <div key={t.id} className="glass-card p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ background: t.status === 'active' ? '#00ff88' : t.status === 'completed' ? '#6b6b9a' : '#ff6b00', boxShadow: t.status === 'active' ? '0 0 6px #00ff88' : 'none' }} />
                      <span className="font-mono text-sm">{t.p1 || '?'} <span className="text-heisenberg-muted">vs</span> {t.p2 || 'Waiting...'}</span>
                      {t.winner && <span className="text-heisenberg-gold text-xs font-mono">→ {t.winner}</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-display tracking-wider" style={{ color: tierColor[t.tier] || '#6b6b9a' }}>{t.tier === 'play' ? 'PLAY' : `${t.tier} BTC`}</span>
                      <span className="text-heisenberg-muted text-xs font-mono">{new Date(t.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
              {tournaments.length === 0 && <p className="text-heisenberg-muted text-sm text-center py-8 font-mono">No tournaments found</p>}
            </div>
          </motion.div>
        )}

        {/* Transactions */}
        {tab === 'transactions' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="glass-card p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm"><span className="text-heisenberg-neon">@{tx.username}</span> — {tx.type.replace('_', ' ')}</p>
                    <p className="text-heisenberg-muted text-xs font-mono mt-0.5">{new Date(tx.created_at).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono font-bold text-sm ${tx.type === 'winnings' ? 'text-heisenberg-green' : tx.type === 'deposit' ? 'text-heisenberg-neon' : 'text-heisenberg-orange'}`}>
                      {parseFloat(tx.amount).toFixed(8)} BTC
                    </p>
                    <p className={`text-xs ${tx.status === 'confirmed' ? 'text-heisenberg-green' : 'text-heisenberg-gold'}`}>{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* AI Settings */}
        {tab === 'ai' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">

            {/* Stats bar */}
            {aiStats && (
              <div className="glass-card p-4 rounded-xl mb-6 flex items-center gap-8">
                <div>
                  <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">Games Played</p>
                  <p className="font-mono text-2xl font-bold text-heisenberg-neon">{aiStats.total_games}</p>
                </div>
                <div className="w-px h-10 bg-heisenberg-border" />
                <div>
                  <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">AI Wins</p>
                  <p className="font-mono text-2xl font-bold text-heisenberg-orange">{aiStats.ai_wins}</p>
                </div>
                <div className="w-px h-10 bg-heisenberg-border" />
                <div>
                  <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">Win Rate</p>
                  <p className="font-mono text-2xl font-bold text-heisenberg-gold">
                    {aiStats.total_games > 0 ? ((aiStats.ai_wins / aiStats.total_games) * 100).toFixed(1) : '—'}%
                  </p>
                </div>
              </div>
            )}

            {/* Name + Emoji */}
            <div className="glass-card p-6 rounded-xl mb-4">
              <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-muted mb-4 flex items-center gap-2">
                <Bot size={14} /> Identity
              </h3>
              <div className="flex gap-3 mb-0">
                <div className="w-20">
                  <label className="text-heisenberg-muted text-xs font-display tracking-widest uppercase block mb-1.5">Emoji</label>
                  <input
                    className="input-field text-center text-xl w-full"
                    value={aiForm.emoji}
                    maxLength={4}
                    onChange={e => setAiForm(f => ({ ...f, emoji: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-heisenberg-muted text-xs font-display tracking-widest uppercase block mb-1.5">Display Name</label>
                  <input
                    className="input-field w-full"
                    placeholder="Heisenberg AI"
                    value={aiForm.name}
                    maxLength={50}
                    onChange={e => setAiForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>
              {aiForm.name && aiForm.emoji && (
                <p className="text-heisenberg-muted text-xs font-mono mt-3">
                  Preview: <span className="text-white">{aiForm.emoji} {aiForm.name}</span>
                </p>
              )}
            </div>

            {/* Difficulty */}
            <div className="glass-card p-6 rounded-xl mb-4">
              <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-muted mb-4 flex items-center gap-2">
                <Zap size={14} /> Difficulty
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(DIFFICULTY_INFO).map(([key, info]) => (
                  <button key={key}
                    onClick={() => setAiForm(f => ({ ...f, difficulty: key }))}
                    className={`p-3 rounded-xl text-left transition-all border ${aiForm.difficulty === key ? 'border-current' : 'border-heisenberg-border'}`}
                    style={{
                      color: aiForm.difficulty === key ? info.color : '#6b7280',
                      background: aiForm.difficulty === key ? `${info.color}15` : 'transparent',
                    }}>
                    <p className="font-display font-bold text-sm tracking-wider">{info.label}</p>
                    <p className="text-xs opacity-70 mt-1 leading-tight">{info.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Action delay */}
            <div className="glass-card p-6 rounded-xl mb-6">
              <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-muted mb-4">Action Speed</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(DELAY_INFO).map(([key, info]) => (
                  <button key={key}
                    onClick={() => setAiForm(f => ({ ...f, action_delay: key }))}
                    className={`p-3 rounded-xl text-left transition-all border ${aiForm.action_delay === key ? 'border-heisenberg-neon bg-heisenberg-neon/10 text-heisenberg-neon' : 'border-heisenberg-border text-heisenberg-muted'}`}>
                    <p className="font-display font-bold text-xs tracking-wider">{info.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{info.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={saveAiSettings}
              disabled={savingAi}
              className="btn-neon w-full py-3 font-display font-bold tracking-widest uppercase flex items-center justify-center gap-2">
              {savingAi
                ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Saving...</>
                : 'Save AI Settings'
              }
            </button>

            {aiSettings?.updated_at && (
              <p className="text-heisenberg-muted text-xs font-mono text-center mt-3">
                Last updated: {new Date(aiSettings.updated_at).toLocaleString()}
              </p>
            )}
          </motion.div>
        )}
      </div>
      </div>
    </div>
  );
}
