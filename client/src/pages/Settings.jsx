import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import AvatarPicker from '../components/AvatarPicker';
import { Save, Volume2, VolumeX, Shield, Palette, UserCircle2, ArrowLeft } from 'lucide-react';
import { sound } from '../utils/sound';

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserCircle2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'responsible', label: 'Responsible Gaming', icon: Shield },
];

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const [prefs, setPrefs] = useState({
    avatar: '🃏',
    four_color_deck: false,
    sound_enabled: true,
    sound_volume: 80,
    deposit_limit_btc: '',
    session_limit_minutes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/preferences').then(r => {
      const p = r.data.preferences;
      setPrefs({
        avatar: p.avatar || '🃏',
        four_color_deck: p.four_color_deck || false,
        sound_enabled: p.sound_enabled !== false,
        sound_volume: p.sound_volume ?? 80,
        deposit_limit_btc: p.deposit_limit_btc || '',
        session_limit_minutes: p.session_limit_minutes || '',
      });
      sound.setEnabled(p.sound_enabled !== false);
      sound.setVolume(p.sound_volume ?? 80);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put('/api/preferences', {
        ...prefs,
        deposit_limit_btc: prefs.deposit_limit_btc ? parseFloat(prefs.deposit_limit_btc) : null,
        session_limit_minutes: prefs.session_limit_minutes ? parseInt(prefs.session_limit_minutes) : null,
      });
      sound.setEnabled(prefs.sound_enabled);
      sound.setVolume(prefs.sound_volume);
      localStorage.setItem('prefs', JSON.stringify(prefs));
      toast.success('Settings saved!');
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }));
  const navigate = useNavigate();

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/play')} className="text-heisenberg-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-heisenberg-card/60">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-2xl font-black tracking-widest text-heisenberg-neon">SETTINGS</h1>
        </motion.div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-display text-xs tracking-widest uppercase font-semibold transition-all"
                style={{
                  background: tab === t.id ? 'rgba(247,147,26,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tab === t.id ? '#f7931a44' : '#2b241a'}`,
                  color: tab === t.id ? '#f7931a' : '#96897a',
                }}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="glass-card p-6 rounded-2xl">
          {tab === 'profile' && (
            <div>
              <h2 className="font-display font-bold text-sm tracking-widest text-white mb-4">Choose Your Avatar</h2>
              <AvatarPicker value={prefs.avatar} onChange={v => set('avatar', v)} />
              <p className="text-heisenberg-muted text-xs font-mono mt-4">
                Your avatar appears in the lobby, chat, and at the table.
              </p>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-bold text-sm tracking-widest text-white mb-1">4-Color Deck</h2>
                <p className="text-heisenberg-muted text-xs font-mono mb-4">
                  Clubs become green ♣ and diamonds become blue ♦ for easier suit recognition.
                </p>
                <div className="flex gap-3">
                  {[false, true].map(v => (
                    <button key={String(v)} onClick={() => set('four_color_deck', v)}
                      className="flex-1 py-3 rounded-xl font-display text-xs tracking-widest uppercase font-semibold transition-all"
                      style={{
                        background: prefs.four_color_deck === v ? 'rgba(247,147,26,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${prefs.four_color_deck === v ? '#f7931a44' : '#2b241a'}`,
                        color: prefs.four_color_deck === v ? '#f7931a' : '#96897a',
                      }}>
                      {v ? '4 Colors' : '2 Colors (Classic)'}
                    </button>
                  ))}
                </div>
                {prefs.four_color_deck && (
                  <div className="flex gap-4 mt-4 text-2xl">
                    <span>♠ <span className="text-xs font-mono text-heisenberg-muted">Black</span></span>
                    <span style={{ color: '#dc2626' }}>♥ <span className="text-xs font-mono text-heisenberg-muted">Red</span></span>
                    <span style={{ color: '#1d4ed8' }}>♦ <span className="text-xs font-mono text-heisenberg-muted">Blue</span></span>
                    <span style={{ color: '#16a34a' }}>♣ <span className="text-xs font-mono text-heisenberg-muted">Green</span></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'sound' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-bold text-sm tracking-widest text-white mb-4">Sound Effects</h2>
                <div className="flex gap-3 mb-6">
                  {[true, false].map(v => (
                    <button key={String(v)} onClick={() => set('sound_enabled', v)}
                      className="flex-1 py-3 rounded-xl font-display text-xs tracking-widest uppercase font-semibold transition-all flex items-center justify-center gap-2"
                      style={{
                        background: prefs.sound_enabled === v ? 'rgba(247,147,26,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${prefs.sound_enabled === v ? '#f7931a44' : '#2b241a'}`,
                        color: prefs.sound_enabled === v ? '#f7931a' : '#96897a',
                      }}>
                      {v ? <Volume2 size={13} /> : <VolumeX size={13} />}
                      {v ? 'Enabled' : 'Disabled'}
                    </button>
                  ))}
                </div>

                {prefs.sound_enabled && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-heisenberg-muted text-xs font-mono">Volume</label>
                      <span className="text-heisenberg-neon text-xs font-mono">{prefs.sound_volume}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5}
                      value={prefs.sound_volume}
                      onChange={e => { set('sound_volume', Number(e.target.value)); sound.setVolume(Number(e.target.value)); }}
                      className="w-full accent-heisenberg-neon" />
                    <div className="flex gap-3 mt-4 flex-wrap">
                      {[
                        { label: 'Deal', fn: () => { sound.init(); sound.cardDeal(); } },
                        { label: 'Bet', fn: () => { sound.init(); sound.chipBet(); } },
                        { label: 'Win', fn: () => { sound.init(); sound.win(); } },
                        { label: 'Fold', fn: () => { sound.init(); sound.fold(); } },
                        { label: 'Your Turn', fn: () => { sound.init(); sound.yourTurn(); } },
                      ].map(s => (
                        <button key={s.label} onClick={s.fn}
                          className="px-3 py-1.5 rounded-lg btn-ghost text-xs">
                          ▶ {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'responsible' && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display font-bold text-sm tracking-widest text-white mb-1">Responsible Gambling</h2>
                <p className="text-heisenberg-muted text-xs font-mono mb-6">
                  Set limits to keep your play enjoyable and under control.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-heisenberg-muted text-xs font-mono mb-2 uppercase tracking-widest">
                      Daily Deposit Limit (BTC)
                    </label>
                    <input
                      className="input-field"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="e.g. 0.01 (leave blank for no limit)"
                      value={prefs.deposit_limit_btc}
                      onChange={e => set('deposit_limit_btc', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-heisenberg-muted text-xs font-mono mb-2 uppercase tracking-widest">
                      Session Time Limit (minutes)
                    </label>
                    <input
                      className="input-field"
                      type="number"
                      min="0"
                      step="30"
                      placeholder="e.g. 120 (leave blank for no limit)"
                      value={prefs.session_limit_minutes}
                      onChange={e => set('session_limit_minutes', e.target.value)}
                    />
                    <p className="text-heisenberg-muted text-xs font-mono mt-1">
                      You'll be reminded when your session limit is reached.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid #ef444422' }}>
                    <p className="text-heisenberg-red text-xs font-mono font-bold mb-1">Need help?</p>
                    <p className="text-heisenberg-muted text-xs font-mono">
                      If gambling is affecting your life, please visit{' '}
                      <a href="https://www.gamblingtherapy.org" target="_blank" rel="noopener noreferrer"
                        className="text-heisenberg-neon hover:underline">gamblingtherapy.org</a>
                      {' '}or contact us at{' '}
                      <a href="mailto:jacobstephane@outlook.com" className="text-heisenberg-neon hover:underline">
                        jacobstephane@outlook.com
                      </a>
                      {' '}to self-exclude.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={saving}
            className="btn-primary px-8 py-3 flex items-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={15} />}
            Save Settings
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
