import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { UserPlus, Check, X, Swords, Circle, ArrowLeft } from 'lucide-react';

export default function Friends() {
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sent, setSent] = useState([]);
  const [online, setOnline] = useState([]);
  const [addInput, setAddInput] = useState('');
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    const [fr, on] = await Promise.allSettled([
      axios.get('/api/social/friends'),
      axios.get('/api/online'),
    ]);
    if (fr.status === 'fulfilled') {
      setFriends(fr.value.data.friends || []);
      setRequests(fr.value.data.requests || []);
      setSent(fr.value.data.sent || []);
    }
    if (on.status === 'fulfilled') setOnline((on.value.data.players || []).map(p => p.username || p));
  };

  useEffect(() => { load(); }, []);

  const addFriend = async () => {
    if (!addInput.trim()) return;
    setAdding(true);
    try {
      await axios.post(`/api/social/friends/${addInput.trim()}`);
      toast.success('Friend request sent!');
      setAddInput('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send request');
    } finally { setAdding(false); }
  };

  const accept = async (username) => {
    try {
      await axios.put(`/api/social/friends/${username}/accept`);
      toast.success(`${username} is now your friend!`);
      load();
    } catch { toast.error('Failed'); }
  };

  const remove = async (username) => {
    try {
      await axios.delete(`/api/social/friends/${username}`);
      toast.success('Removed');
      load();
    } catch { toast.error('Failed'); }
  };

  const challenge = async (username) => {
    try {
      const res = await axios.post(`/api/social/friends/${username}/challenge`);
      navigate(`/game/${res.data.tournamentId}`);
    } catch { toast.error('Failed to create challenge'); }
  };

  const isOnline = (name) => online.includes(name);

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-heisenberg-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-heisenberg-card/60">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-2xl font-black tracking-widest text-heisenberg-neon">FRIENDS</h1>
        </motion.div>

        {/* Add friend */}
        <div className="glass-card p-4 rounded-xl mb-6 flex gap-3">
          <input
            className="flex-1 input-field"
            placeholder="Enter username to add..."
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFriend()}
          />
          <button onClick={addFriend} disabled={adding || !addInput.trim()}
            className="btn-primary px-5 flex items-center gap-2 shrink-0">
            {adding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserPlus size={15} />}
            Add
          </button>
        </div>

        {/* Incoming requests */}
        <AnimatePresence>
          {requests.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <h2 className="font-display text-xs tracking-widest uppercase text-heisenberg-orange mb-3">
                Pending Requests ({requests.length})
              </h2>
              <div className="space-y-2">
                {requests.map(r => (
                  <div key={r.id} className="glass-card p-4 rounded-xl flex items-center justify-between"
                    style={{ border: '1px solid #ff6b0022' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{r.avatar || '🃏'}</span>
                      <Link to={`/profile/${r.username}`} className="font-mono text-sm hover:text-heisenberg-neon transition-colors">
                        {r.username}
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => accept(r.username)}
                        className="px-3 py-1.5 rounded-xl font-display text-xs tracking-widest uppercase transition-all flex items-center gap-1"
                        style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid #00ff8844', color: '#00ff88' }}>
                        <Check size={12} /> Accept
                      </button>
                      <button onClick={() => remove(r.username)}
                        className="px-3 py-1.5 rounded-xl font-display text-xs tracking-widest uppercase transition-all"
                        style={{ background: 'rgba(255,51,85,0.1)', border: '1px solid #ff335522', color: '#ff3355' }}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sent requests */}
        {sent.length > 0 && (
          <div className="mb-6">
            <h2 className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-3">Sent Requests</h2>
            <div className="space-y-2">
              {sent.map(r => (
                <div key={r.id} className="glass-card p-4 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{r.avatar || '🃏'}</span>
                    <Link to={`/profile/${r.username}`} className="font-mono text-sm hover:text-heisenberg-neon transition-colors">
                      {r.username}
                    </Link>
                  </div>
                  <span className="text-heisenberg-muted text-xs font-mono">Pending...</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        <div>
          <h2 className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-3">
            Friends ({friends.length})
          </h2>
          {friends.length === 0 ? (
            <div className="glass-card p-8 rounded-xl text-center">
              <p className="text-heisenberg-muted font-mono text-sm">No friends yet — add someone to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map(f => {
                const on = isOnline(f.username);
                return (
                  <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="glass-card p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="text-2xl">{f.avatar || '🃏'}</span>
                        {on && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-heisenberg-green border-2 border-heisenberg-bg" />
                        )}
                      </div>
                      <div>
                        <Link to={`/profile/${f.username}`} className="font-mono text-sm hover:text-heisenberg-neon transition-colors">
                          {f.username}
                        </Link>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: on ? '#00ff88' : '#6b6b9a' }}>
                          {on ? '● Online' : '○ Offline'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {on && (
                        <button onClick={() => challenge(f.username)}
                          className="px-3 py-1.5 rounded-xl font-display text-xs tracking-widest uppercase transition-all flex items-center gap-1"
                          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid #8b5cf644', color: '#8b5cf6' }}>
                          <Swords size={12} /> Challenge
                        </button>
                      )}
                      <button onClick={() => remove(f.username)}
                        className="p-1.5 rounded-lg text-heisenberg-muted hover:text-heisenberg-red transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
