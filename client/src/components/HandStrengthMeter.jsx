import { motion, AnimatePresence } from 'framer-motion';
import { getHandStrength } from '../utils/handStrength';

const COLORS = [
  [0, 30,  '#ff3355'],
  [30, 50, '#ff6b00'],
  [50, 65, '#ffd700'],
  [65, 80, '#00d4ff'],
  [80, 101,'#00ff88'],
];

function getColor(pct) {
  for (const [lo, hi, c] of COLORS) if (pct >= lo && pct < hi) return c;
  return '#00ff88';
}

export default function HandStrengthMeter({ myCards, community, phase }) {
  if (!myCards || myCards.length < 2 || phase === 'showdown') return null;

  const result = getHandStrength(myCards, community);
  if (!result) return null;

  const color = getColor(result.pct);

  return (
    <AnimatePresence>
      <motion.div
        key={result.label}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col gap-1 w-full max-w-xs"
      >
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-heisenberg-muted uppercase tracking-widest">Hand Strength</span>
          <span style={{ color }} className="font-bold">{result.label}</span>
        </div>
        <div className="h-1.5 bg-heisenberg-dark rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${result.pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ background: `linear-gradient(90deg, ${color}88, ${color})` }}
          />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-heisenberg-muted/50">
          <span>Weak</span>
          <span style={{ color }} className="font-bold">{result.pct}%</span>
          <span>Strong</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
