import { motion, AnimatePresence } from 'framer-motion';
import { Smile } from 'lucide-react';

const AVATARS = [
  '🃏','🎭','🦅','🐺','🦁','🐲','🎯','💀','🔥','⚡',
  '🌙','🎪','🦊','🐯','🎲','🧿','🦄','🌊','💎','👑',
  '🤠','🥷','🦝','🎸','🚀','🍀','⚔️','🦋','🌸','🎩',
];

export default function AvatarPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {AVATARS.map(a => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all"
          style={{
            background: value === a ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.04)',
            border: `2px solid ${value === a ? '#00d4ff' : '#1e1e3a'}`,
            transform: value === a ? 'scale(1.15)' : 'scale(1)',
          }}>
          {a}
        </button>
      ))}
    </div>
  );
}
