import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function PreActionButtons({ gameState, myPos, onAction }) {
  const [preAction, setPreAction] = useState(null); // 'fold'|'check'|'call'|null

  // Execute pre-action when it becomes our turn
  useEffect(() => {
    if (!preAction || !gameState || gameState.actionOn !== myPos) return;
    const myBet = myPos === 1 ? gameState.p1Bet : gameState.p2Bet;
    const callAmt = Math.max(0, (gameState.currentBet || 0) - (myBet || 0));

    if (preAction === 'fold') {
      onAction('fold');
    } else if (preAction === 'check' && callAmt === 0) {
      onAction('check');
    } else if (preAction === 'call') {
      onAction(callAmt === 0 ? 'check' : 'call', callAmt);
    }
    setPreAction(null);
  }, [gameState?.actionOn, myPos]);

  // Don't show when it's our turn (real action buttons take over)
  if (!gameState || gameState.actionOn === myPos || gameState.phase === 'showdown') return null;

  const myBet = myPos === 1 ? gameState.p1Bet : gameState.p2Bet;
  const callAmt = Math.max(0, (gameState.currentBet || 0) - (myBet || 0));
  const canCheck = callAmt === 0;

  const opts = [
    { id: 'fold', label: 'Pre-Fold', color: '#ff3355' },
    canCheck
      ? { id: 'check', label: 'Pre-Check', color: '#00d4ff' }
      : { id: 'call', label: `Pre-Call ${callAmt.toLocaleString()}`, color: '#00d4ff' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex gap-2">
      {opts.map(opt => (
        <button key={opt.id}
          onClick={() => setPreAction(preAction === opt.id ? null : opt.id)}
          className="flex-1 py-2 rounded-xl font-display font-semibold text-[10px] tracking-widest uppercase transition-all"
          style={{
            background: preAction === opt.id ? `${opt.color}22` : 'rgba(17,17,32,0.6)',
            border: `1px solid ${preAction === opt.id ? opt.color : '#1e1e3a'}`,
            color: preAction === opt.id ? opt.color : '#6b6b9a',
          }}>
          {opt.label}
        </button>
      ))}
    </motion.div>
  );
}
