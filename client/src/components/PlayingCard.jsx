import { motion } from 'framer-motion';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

// 2-color: hearts/diamonds = red, spades/clubs = black
// 4-color: spades=black, hearts=red, diamonds=blue, clubs=green
const SUIT_COLORS_2 = { s: '#111827', h: '#dc2626', d: '#dc2626', c: '#111827' };
const SUIT_COLORS_4 = { s: '#111827', h: '#dc2626', d: '#1d4ed8', c: '#16a34a' };

function displayValue(v) {
  return v === 'T' ? '10' : v;
}

function getSuitColor(suit, fourColor) {
  return (fourColor ? SUIT_COLORS_4 : SUIT_COLORS_2)[suit] || '#111827';
}

// Read 4-color pref from localStorage (set by Settings page)
function useFourColor(override) {
  if (override !== undefined) return override;
  try {
    const p = localStorage.getItem('prefs');
    if (p) return JSON.parse(p).four_color_deck || false;
  } catch {}
  return false;
}

const SIZE_CLASS = { small: 'w-9 h-14', normal: 'w-12 h-[72px] md:w-16 md:h-24' };

export function PlayingCard({ card, hidden = false, small = false, delay = 0, fourColor }) {
  const use4Color = useFourColor(fourColor);
  const sizeClass = small ? SIZE_CLASS.small : SIZE_CLASS.normal;

  if (hidden) {
    return (
      <motion.div
        initial={{ opacity: 0, rotateY: 180, scale: 0.8 }}
        animate={{ opacity: 1, rotateY: 0, scale: 1 }}
        transition={{ delay, duration: 0.4, ease: 'easeOut' }}
        className={`${sizeClass} rounded-xl flex items-center justify-center`}
        style={{
          background: 'linear-gradient(135deg, #1a1a3e 0%, #0d0d2e 100%)',
          border: '2px solid #00d4ff33',
          boxShadow: '0 4px 20px #00000066, inset 0 0 20px #00d4ff11',
        }}
      >
        <div className="text-heisenberg-neon/20 font-display text-3xl">?</div>
      </motion.div>
    );
  }

  if (!card) return null;

  const value  = card.slice(0, -1);
  const suit   = card.slice(-1);
  const color  = getSuitColor(suit, use4Color);
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const label  = displayValue(value);
  const valFontClass = small && label === '10' ? 'text-[9px]' : small ? 'text-xs' : 'text-sm';

  return (
    <motion.div
      initial={{ opacity: 0, y: -30, rotate: -5, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className={`${sizeClass} rounded-xl flex flex-col justify-between relative overflow-hidden select-none`}
      style={{
        background: '#ffffff',
        border: '2px solid rgba(0,0,0,0.15)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.3)',
        color,
      }}
    >
      <div className={`${small ? 'p-0.5 pl-1' : 'p-1 pl-2'} font-black leading-none`} style={{ fontSize: small ? undefined : '0.9rem' }}>
        <div className={`${valFontClass} font-black leading-none`}>{label}</div>
        <div className={`${small ? 'text-[10px]' : 'text-sm'} leading-none`}>{symbol}</div>
      </div>

      {!small && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-4xl font-bold" style={{ opacity: 0.12 }}>{symbol}</span>
        </div>
      )}

      <div className={`${small ? 'p-0.5 pr-1' : 'p-1 pr-2'} font-black leading-none self-end rotate-180`} style={{ fontSize: small ? undefined : '0.9rem' }}>
        <div className={`${valFontClass} font-black leading-none`}>{label}</div>
        <div className={`${small ? 'text-[10px]' : 'text-sm'} leading-none`}>{symbol}</div>
      </div>
    </motion.div>
  );
}

export function CardBack({ small = false, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.3 }}
      className={`${small ? SIZE_CLASS.small : SIZE_CLASS.normal} rounded-xl`}
      style={{
        background: 'linear-gradient(135deg, #1e1e4e, #0a0a2e)',
        border: '2px solid #00d4ff22',
        boxShadow: '0 4px 15px #00000055',
        backgroundImage: 'repeating-linear-gradient(45deg, #00d4ff08 0px, #00d4ff08 1px, transparent 1px, transparent 10px)',
      }}
    />
  );
}
