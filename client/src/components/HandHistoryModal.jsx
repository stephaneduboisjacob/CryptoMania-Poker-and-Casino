import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from './PlayingCard';
import { ChevronLeft, ChevronRight, X, History } from 'lucide-react';

const VAL_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function buildSteps(hand, p1Name, p2Name) {
  const log = hand.hand_log || [];
  const steps = [];
  let pot = 0, p1Bet = 0, p2Bet = 0, community = [];

  for (const entry of log) {
    if (entry.action === 'deal') {
      const { blinds, dealer } = entry;
      steps.push({ desc: `New hand — SB: ${blinds.sb}, BB: ${blinds.bb}`, community: [], pot: blinds.sb + blinds.bb, holeCards: hand.hand_log.find(e => e.action === 'showdown')?.holeCards });
      pot = blinds.sb + blinds.bb;
    } else if (entry.action === 'deal_community') {
      community = [...community, ...entry.cards];
      steps.push({ desc: `${entry.phase.replace('_',' ').toUpperCase()}: ${entry.cards.join(' ')}`, community: [...community], pot });
    } else if (entry.action === 'fold') {
      steps.push({ desc: `${entry.player === 1 ? p1Name : p2Name} folds`, community: [...community], pot });
    } else if (entry.action === 'check') {
      steps.push({ desc: `${entry.player === 1 ? p1Name : p2Name} checks`, community: [...community], pot });
    } else if (entry.action === 'call') {
      pot += entry.amount;
      steps.push({ desc: `${entry.player === 1 ? p1Name : p2Name} calls ${entry.amount}`, community: [...community], pot });
    } else if (entry.action === 'bet' || entry.action === 'raise') {
      pot += entry.amount;
      steps.push({ desc: `${entry.player === 1 ? p1Name : p2Name} ${entry.action}s to ${entry.totalBet}`, community: [...community], pot });
    } else if (entry.action === 'showdown') {
      steps.push({ desc: `Showdown — ${p1Name}: ${entry.result?.h1} | ${p2Name}: ${entry.result?.h2}`, community: [...community], pot, holeCards: entry.holeCards });
    } else if (entry.action === 'award') {
      const winner = entry.winner === 0 ? 'Split pot!' : `${entry.winner === 1 ? p1Name : p2Name} wins ${entry.pot}!`;
      steps.push({ desc: winner, community: [...community], pot: 0, final: true });
    }
  }
  return steps;
}

export default function HandHistoryModal({ hand, p1Name, p2Name, onClose, standalone = false }) {
  const [step, setStep] = useState(0);
  const steps = buildSteps(hand, p1Name || 'P1', p2Name || 'P2');
  const cur = steps[step] || steps[0];

  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-bold text-heisenberg-neon text-sm tracking-widest">
          HAND #{hand.hand_number} REPLAY
        </h3>
        {standalone && (
          <button onClick={onClose} className="text-heisenberg-muted hover:text-white">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex gap-1.5 justify-center mb-4 min-h-16 items-center">
        {cur.community?.length > 0 ? (
          cur.community.map((c, i) => <PlayingCard key={i} card={c} small />)
        ) : (
          <p className="text-heisenberg-muted/40 text-xs font-mono">Pre-flop</p>
        )}
      </div>

      {cur.holeCards && (
        <div className="flex justify-around mb-4">
          <div className="flex flex-col items-center gap-1">
            <p className="text-[10px] text-heisenberg-muted font-mono">{p1Name}</p>
            <div className="flex gap-1">
              {(cur.holeCards.p1 || []).map((c, i) => <PlayingCard key={i} card={c} small />)}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[10px] text-heisenberg-muted font-mono">{p2Name}</p>
            <div className="flex gap-1">
              {(cur.holeCards.p2 || []).map((c, i) => <PlayingCard key={i} card={c} small />)}
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-4">
        <p className="font-mono text-sm" style={{ color: cur.final ? '#fbbf24' : '#f3ede2' }}>{cur.desc}</p>
        {cur.pot > 0 && <p className="text-heisenberg-muted text-xs font-mono mt-1">Pot: {cur.pot.toLocaleString()}</p>}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          className="btn-ghost p-2 rounded-xl disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <span className="text-heisenberg-muted text-xs font-mono">{step + 1} / {steps.length}</span>
        <button onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))} disabled={step === steps.length - 1}
          className="btn-ghost p-2 rounded-xl disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>
    </>
  );

  if (!standalone) return content;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-heisenberg-bg/90 backdrop-blur-md p-4">
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="glass-card p-6 rounded-2xl w-full max-w-md" style={{ border: '1px solid #f7931a22' }}>
        {content}
      </motion.div>
    </motion.div>
  );
}
