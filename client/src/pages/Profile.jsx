import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import HandHistoryModal from '../components/HandHistoryModal';
import { PlayingCard } from '../components/PlayingCard';
import { Trophy, TrendingUp, Zap, Target, Calendar, UserPlus, UserCheck, UserX, Swords, History, StickyNote, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

function StatBox({ icon: Icon, label, value, sub, color = '#00d4ff' }) {
  return (
    <div className="glass-card p-4 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} style={{ color }} />
        <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase">{label}</p>
      </div>
      <p className="font-mono text-xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-heisenberg-muted text-xs font-mono mt-0.5">{sub}</p>}
    </div>
  );
}

const TIER_COLORS = { play:'#6b6b9a','0.00001':'#22d3ee','0.0001':'#00d4ff','0.001':'#38bdf8','0.01':'#ff6b00','0.1':'#ffd700' };

function NotePanel({ username }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    axios.get(`/api/social/notes/${username}`).then(r => setNote(r.data.note || '')).catch(() => {});
  }, [open, username]);
  const save = async () => {
    try { await axios.put(`/api/social/notes/${username}`, { note }); toast.success('Note saved'); setOpen(false); }
    catch { toast.error('Failed'); }
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-display tracking-widest uppercase transition-all"
        style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid #ffd70022', color: '#ffd700' }}>
        <StickyNote size={12} /> Note
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute right-0 top-full mt-2 w-64 glass-card p-3 rounded-xl z-20"
            style={{ border: '1px solid #ffd70033' }}>
            <textarea className="w-full input-field text-xs resize-none mb-2" rows={4}
              placeholder="Private note..." value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 btn-ghost text-xs py-1.5">Cancel</button>
              <button onClick={save} className="flex-1 btn-primary text-xs py-1.5">Save</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [btcPrice, setBtcPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState(null); // null|'accepted'|'sent'|'received'
  const [replayHand, setReplayHand] = useState(null);
  const [recentHands, setRecentHands] = useState([]);
  const [avatar, setAvatar] = useState('🃏');

  const isMe = user?.username === username || (!username && user);
  const displayUsername = username || user?.username;

  useEffect(() => {
    Promise.allSettled([
      axios.get(isMe ? '/api/stats/me' : `/api/stats/profile/${displayUsername}`),
      axios.get('/api/preferences'),
      !isMe ? axios.get('/api/social/friends') : Promise.resolve({ data: {} }),
    ]).then(([profileRes, prefRes, friendsRes]) => {
      if (profileRes.status === 'fulfilled') {
        setData(profileRes.value.data);
        setBtcPrice(profileRes.value.data.btcPrice || null);
      }
      if (isMe && prefRes.status === 'fulfilled') setAvatar(prefRes.value.data.preferences?.avatar || '🃏');
      if (!isMe && friendsRes.status === 'fulfilled') {
        const { friends, requests, sent } = friendsRes.value.data;
        if (friends?.find(f => f.username === displayUsername)) setFriendStatus('accepted');
        else if (sent?.find(f => f.username === displayUsername)) setFriendStatus('sent');
        else if (requests?.find(f => f.username === displayUsername)) setFriendStatus('received');
        else setFriendStatus(null);
      }
    }).finally(() => setLoading(false));
  }, [displayUsername, isMe]);

  const addFriend = async () => {
    try { await axios.post(`/api/social/friends/${displayUsername}`); setFriendStatus('sent'); toast.success('Request sent!'); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };
  const acceptFriend = async () => {
    try { await axios.put(`/api/social/friends/${displayUsername}/accept`); setFriendStatus('accepted'); toast.success('Now friends!'); }
    catch { toast.error('Failed'); }
  };
  const removeFriend = async () => {
    try { await axios.delete(`/api/social/friends/${displayUsername}`); setFriendStatus(null); toast.success('Removed'); }
    catch { toast.error('Failed'); }
  };
  const challenge = async () => {
    try {
      const res = await axios.post(`/api/social/friends/${displayUsername}/challenge`);
      navigate(`/game/${res.data.tournamentId}`);
    } catch { toast.error('Failed'); }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return (
    <div className="page-root">
      <Navbar />
      <div className="flex-1 flex items-center justify-center text-heisenberg-muted font-mono">Player not found</div>
    </div>
  );

  const { profile, recentGames } = data;
  const profitUsd = profile.profitUsd ?? (btcPrice ? (parseFloat(profile.profit) * btcPrice).toFixed(2) : null);

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-4xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
                style={{ background: 'linear-gradient(135deg, #00d4ff15, #ff6b0015)', border: '1px solid #00d4ff22' }}>
                {isMe ? avatar : (profile.avatar || profile.username[0].toUpperCase())}
              </div>
              <div>
                <h1 className="font-display text-3xl font-black text-white tracking-widest">{profile.username}</h1>
                <p className="text-heisenberg-muted text-xs font-mono flex items-center gap-1 mt-1">
                  <Calendar size={11} />
                  Member since {new Date(profile.memberSince).toLocaleDateString()}
                </p>
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {isMe ? (
                <Link to="/settings" className="btn-ghost text-xs py-2 px-4">Edit Settings</Link>
              ) : (
                <>
                  {friendStatus === null && (
                    <button onClick={addFriend}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-display text-xs tracking-widest uppercase transition-all"
                      style={{ background: 'rgba(0,212,255,0.12)', border: '1px solid #00d4ff33', color: '#00d4ff' }}>
                      <UserPlus size={13} /> Add Friend
                    </button>
                  )}
                  {friendStatus === 'sent' && (
                    <span className="text-heisenberg-muted text-xs font-mono flex items-center gap-1">
                      <UserCheck size={13} /> Request Sent
                    </span>
                  )}
                  {friendStatus === 'received' && (
                    <button onClick={acceptFriend}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-display text-xs tracking-widest uppercase transition-all"
                      style={{ background: 'rgba(0,255,136,0.12)', border: '1px solid #00ff8833', color: '#00ff88' }}>
                      <Check size={13} /> Accept Friend Request
                    </button>
                  )}
                  {friendStatus === 'accepted' && (
                    <>
                      <button onClick={challenge}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-display text-xs tracking-widest uppercase transition-all"
                        style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid #8b5cf644', color: '#8b5cf6' }}>
                        <Swords size={13} /> Challenge
                      </button>
                      <button onClick={removeFriend} className="p-2 rounded-xl text-heisenberg-muted hover:text-heisenberg-red transition-colors">
                        <UserX size={14} />
                      </button>
                    </>
                  )}
                  <NotePanel username={displayUsername} />
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatBox icon={Trophy} label="Win Rate" value={`${profile.winRate}%`}
            sub={`${profile.wins}W / ${profile.losses}L`} color="#ffd700" />
          <StatBox icon={Target} label="Games" value={profile.games}
            sub={`${profile.handsPlayed} hands`} color="#00d4ff" />
          <StatBox icon={TrendingUp} label="Profit"
            value={profitUsd != null ? `${parseFloat(profitUsd) >= 0 ? '+' : ''}$${Math.abs(parseFloat(profitUsd)).toFixed(2)}` : `${parseFloat(profile.profit) >= 0 ? '+' : ''}${parseFloat(profile.profit).toFixed(6)} BTC`}
            sub={profitUsd != null ? `₿ ${parseFloat(profile.profit) >= 0 ? '+' : ''}${parseFloat(profile.profit).toFixed(6)}` : undefined}
            color={parseFloat(profile.profit) >= 0 ? '#00ff88' : '#ff3355'} />
          <StatBox icon={Zap} label="Biggest Pot"
            value={profile.biggestPot > 0 ? profile.biggestPot.toLocaleString() : '—'}
            sub="chips" color="#ff6b00" />
        </motion.div>

        {/* vs Heisenberg */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="glass-card p-4 rounded-xl mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Swords size={14} className="text-heisenberg-purple" />
            <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted">vs Heisenberg</p>
          </div>
          <div className="flex gap-6 text-sm font-mono">
            <div><p className="text-heisenberg-muted text-xs">Games</p><p className="text-white font-bold">{profile.aiGames}</p></div>
            <div><p className="text-heisenberg-muted text-xs">Wins</p><p className="text-heisenberg-green font-bold">{profile.aiWins}</p></div>
            <div><p className="text-heisenberg-muted text-xs">Win Rate</p>
              <p className="text-heisenberg-gold font-bold">
                {profile.aiGames > 0 ? ((profile.aiWins / profile.aiGames) * 100).toFixed(1) : '0.0'}%
              </p>
            </div>
          </div>
        </motion.div>

        {/* Recent games */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <h3 className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-3">Recent Games</h3>
          <div className="space-y-2">
            {recentGames.length === 0 && (
              <p className="text-heisenberg-muted text-sm font-mono text-center py-6">No games yet</p>
            )}
            {recentGames.map(g => (
              <div key={g.id} className="glass-card p-3 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold font-display ${g.won ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
                    {g.won ? 'WIN' : 'LOSS'}
                  </span>
                  <div>
                    <p className="font-mono text-sm">
                      vs {g.is_ai ? 'Heisenberg' : (g.opponent || 'Unknown')}
                    </p>
                    <p className="text-heisenberg-muted text-xs font-mono">
                      {g.tier === 'play' ? 'Play Money' : `$${g.tier} buy-in`}
                      {g.ended_at && ` · ${new Date(g.ended_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {g.tier !== 'play' && (
                    <p className={`font-mono text-xs font-bold ${g.won ? 'text-heisenberg-green' : 'text-heisenberg-muted'}`}>
                      {g.won
                        ? `+$${(parseFloat(g.tier) * 0.95).toFixed(2)}`
                        : `-$${g.tier}`}
                    </p>
                  )}
                  {(isMe || true) && (
                    <button onClick={async () => {
                      const res = await axios.get(`/api/tournament/${g.id}/hands`).catch(() => null);
                      if (res?.data?.hands?.length > 0) setReplayHand({ hands: res.data.hands, tournament: res.data.tournament });
                    }}
                    className="p-1.5 rounded-lg text-heisenberg-muted hover:text-heisenberg-neon transition-colors" title="Replay">
                      <History size={13} />
                    </button>
                  )}
                  <div className="w-2 h-2 rounded-full" style={{ background: TIER_COLORS[g.tier] || '#6b6b9a' }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="mt-6 text-center">
          <Link to="/" className="btn-ghost text-sm py-2 px-6">← Back to Lobby</Link>
        </div>
      </div>

      {/* Hand history replay modal */}
      <AnimatePresence>
        {replayHand && (
          <HandHistoryReplayModal
            hands={replayHand.hands}
            tournament={replayHand.tournament}
            onClose={() => setReplayHand(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function HandHistoryReplayModal({ hands, tournament, onClose }) {
  const [handIdx, setHandIdx] = useState(0);
  const hand = hands[handIdx];
  const p1 = tournament.player1_name || 'P1';
  const p2 = tournament.player2_name || 'P2';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-heisenberg-bg/90 backdrop-blur-md p-4">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="glass-card p-5 rounded-2xl w-full max-w-lg" style={{ border: '1px solid #00d4ff22' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setHandIdx(h => Math.max(0, h - 1))} disabled={handIdx === 0}
              className="btn-ghost p-1.5 rounded-xl disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            <span className="font-display text-xs tracking-widest text-heisenberg-muted">
              Hand {handIdx + 1} / {hands.length}
            </span>
            <button onClick={() => setHandIdx(h => Math.min(hands.length - 1, h + 1))} disabled={handIdx === hands.length - 1}
              className="btn-ghost p-1.5 rounded-xl disabled:opacity-30">
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={onClose} className="text-heisenberg-muted hover:text-white"><X size={16} /></button>
        </div>
        <HandHistoryModal hand={hand} p1Name={p1} p2Name={p2} onClose={onClose} />
      </motion.div>
    </motion.div>
  );
}
