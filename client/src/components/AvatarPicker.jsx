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
            background: value === a ? 'rgba(247,147,26,0.2)' : 'rgba(255,255,255,0.04)',
            border: `2px solid ${value === a ? '#f7931a' : '#2b241a'}`,
            transform: value === a ? 'scale(1.15)' : 'scale(1)',
          }}>
          {a}
        </button>
      ))}
    </div>
  );
}
