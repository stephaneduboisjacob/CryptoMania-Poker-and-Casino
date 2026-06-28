import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function SessionStats({ stats }) {
  if (!stats) return null;
  const { handsPlayed, handsWon, startChips, currentChips } = stats;
  const net = (currentChips || 0) - (startChips || 0);
  const winRate = handsPlayed > 0 ? ((handsWon / handsPlayed) * 100).toFixed(0) : '-';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="glass-card p-3 rounded-xl">
      <p className="font-display text-[10px] tracking-widest uppercase text-heisenberg-muted mb-2">Session</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div>
          <p className="font-mono text-lg font-bold text-heisenberg-neon">{handsPlayed || 0}</p>
          <p className="text-[10px] text-heisenberg-muted font-mono">Hands</p>
        </div>
        <div>
          <p className="font-mono text-lg font-bold text-heisenberg-gold">{winRate}%</p>
          <p className="text-[10px] text-heisenberg-muted font-mono">Win Rate</p>
        </div>
        <div className="col-span-2">
          <div className="flex items-center justify-center gap-1.5">
            {net > 0 ? <TrendingUp size={12} className="text-heisenberg-green" /> :
             net < 0 ? <TrendingDown size={12} className="text-heisenberg-red" /> :
             <Minus size={12} className="text-heisenberg-muted" />}
            <p className="font-mono font-bold text-sm" style={{
              color: net > 0 ? '#00ff88' : net < 0 ? '#ff3355' : '#6b6b9a'
            }}>
              {net > 0 ? '+' : ''}{net.toLocaleString()}
            </p>
          </div>
          <p className="text-[10px] text-heisenberg-muted font-mono">Net Chips</p>
        </div>
      </div>
    </motion.div>
  );
}
