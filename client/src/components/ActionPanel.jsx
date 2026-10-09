import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ActionPanel({ gameState, myPos, onAction, myChips }) {
  const [showRaise, setShowRaise] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState('');

  // Only render when it's genuinely our turn
  if (!gameState) return null;
  if (gameState.actionOn !== myPos) return null;
  if (gameState.phase === 'showdown') return null;

  const myBet     = myPos === 1 ? gameState.p1Bet : gameState.p2Bet;
  const callAmt   = Math.max(0, (gameState.currentBet || 0) - (myBet || 0));
  const canCheck  = callAmt === 0;
  const currentBet = gameState.currentBet || 0;
  const bigBlind = gameState.bigBlind || 100;
  const minRaise  = currentBet === 0 ? bigBlind : currentBet + bigBlind;
  const maxBet    = (myChips || 0) + (myBet || 0); // total committed after the action
  const pot       = gameState.pot || 0;
  const canRaise  = maxBet > currentBet;

  const targetForFraction = (fraction) => {
    if (currentBet === 0) return myBet + Math.floor(pot * fraction);
    const potAfterCall = pot + callAmt;
    return currentBet + Math.floor(potAfterCall * fraction);
  };

  const presets = [
    { label: '⅓ Pot', value: targetForFraction(1 / 3) },
    { label: '½ Pot', value: targetForFraction(1 / 2) },
    { label: 'Pot', value: targetForFraction(1) },
    { label: 'All-in', value: maxBet },
  ];

  const confirmRaise = () => {
    const v = parseInt(raiseAmt);
    if (!v || (v < minRaise && v !== maxBet)) return;
    onAction(gameState.currentBet > 0 ? 'raise' : 'bet', v);
    setShowRaise(false);
    setRaiseAmt('');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">

      {/* Raise slider panel */}
      <AnimatePresence>
        {showRaise && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="glass-card p-4 rounded-xl">
            {/* Presets */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {presets.map(p => (
                <button key={p.label}
                  onClick={() => setRaiseAmt(Math.min(Math.max(p.value, Math.min(minRaise, maxBet)), maxBet).toString())}
                  className="py-1.5 rounded-lg text-xs font-display tracking-wider uppercase transition-colors"
                  style={{ border: '1px solid #f7931a33', color: '#f7931a', background: 'rgba(247,147,26,0.08)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Slider */}
            <input type="range" min={Math.min(minRaise, maxBet)} max={maxBet} step={bigBlind}
              value={raiseAmt || Math.min(minRaise, maxBet)}
              onChange={e => setRaiseAmt(e.target.value)}
              className="w-full mb-3 accent-heisenberg-orange" />
            <div className="flex gap-2">
              <input type="number" placeholder={`Min ${minRaise.toLocaleString()}`}
                value={raiseAmt}
                onChange={e => setRaiseAmt(e.target.value)}
                className="flex-1 input-field text-center text-sm py-2" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setShowRaise(false); setRaiseAmt(''); }}
                className="flex-1 btn-ghost text-xs py-2">Cancel</button>
              <button onClick={confirmRaise} className="flex-1 btn-primary text-xs py-2">
                {gameState.currentBet > 0 ? 'Raise' : 'Bet'} {raiseAmt ? Number(raiseAmt).toLocaleString() : ''}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main action buttons */}
      <div className="flex gap-1.5 md:gap-2.5">
        {/* Fold */}
        <button onClick={() => onAction('fold')}
          className="flex-1 py-2.5 md:py-3.5 rounded-xl font-display font-bold text-xs md:text-sm tracking-widest uppercase transition-all active:scale-95"
          style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid #ef444455', color: '#ef4444' }}>
          FOLD
        </button>

        {/* Check / Call */}
        {canCheck ? (
          <button onClick={() => onAction('check')}
            className="flex-1 py-2.5 md:py-3.5 rounded-xl font-display font-bold text-xs md:text-sm tracking-widest uppercase transition-all active:scale-95"
            style={{ background: 'rgba(247,147,26,0.14)', border: '1px solid #f7931a55', color: '#f7931a' }}>
            CHECK
          </button>
        ) : (
          <button onClick={() => onAction('call', callAmt)}
            className="flex-1 py-2.5 md:py-3.5 rounded-xl font-display font-bold text-xs md:text-sm tracking-widest uppercase transition-all active:scale-95"
            style={{ background: 'rgba(247,147,26,0.14)', border: '1px solid #f7931a55', color: '#f7931a' }}>
            CALL
            <span className="block text-xs opacity-60 font-mono font-normal mt-0.5">
              {callAmt.toLocaleString()}
            </span>
          </button>
        )}

        {/* Raise / Bet */}
        <button onClick={() => canRaise && setShowRaise(r => !r)} disabled={!canRaise}
          className="flex-1 py-2.5 md:py-3.5 rounded-xl font-display font-bold text-xs md:text-sm tracking-widest uppercase transition-all active:scale-95"
          style={{
            background: showRaise ? 'rgba(255,176,32,0.25)' : 'rgba(255,176,32,0.14)',
            border: '1px solid #ffb02055',
            color: '#ffb020',
            opacity: canRaise ? 1 : 0.35,
          }}>
          {gameState.currentBet > 0 ? 'RAISE' : 'BET'}
        </button>
      </div>
    </motion.div>
  );
}
