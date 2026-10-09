import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { StickyNote, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PlayerNotes({ username }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!username || !open) return;
    axios.get(`/api/social/notes/${username}`)
      .then(r => { setNote(r.data.note || ''); setSaved(r.data.note || ''); })
      .catch(() => {});
  }, [username, open]);

  const save = async () => {
    setLoading(true);
    try {
      await axios.put(`/api/social/notes/${username}`, { note });
      setSaved(note);
      toast.success('Note saved');
      setOpen(false);
    } catch {
      toast.error('Failed to save note');
    } finally { setLoading(false); }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg transition-colors"
        style={{ color: saved ? '#fbbf24' : '#96897a' }}
        title="Player notes">
        <StickyNote size={13} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute bottom-full right-0 mb-2 w-64 glass-card p-3 rounded-xl shadow-2xl z-50"
            style={{ border: '1px solid #fbbf2433' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-display text-[10px] tracking-widest uppercase text-heisenberg-gold">
                Note on {username}
              </p>
              <button onClick={() => setOpen(false)} className="text-heisenberg-muted hover:text-white">
                <X size={12} />
              </button>
            </div>
            <textarea
              className="w-full input-field text-xs resize-none"
              rows={4}
              placeholder="Private note about this player..."
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={500}
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setOpen(false)} className="flex-1 btn-ghost text-xs py-1.5">Cancel</button>
              <button onClick={save} disabled={loading} className="flex-1 btn-primary text-xs py-1.5 flex items-center justify-center gap-1">
                <Check size={11} /> Save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
