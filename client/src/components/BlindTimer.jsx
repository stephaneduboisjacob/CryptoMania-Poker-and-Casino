import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

const BLIND_LEVELS = [
  { level: 1, small: 50,   big: 100   },
  { level: 2, small: 100,  big: 200   },
  { level: 3, small: 200,  big: 400   },
  { level: 4, small: 400,  big: 800   },
  { level: 5, small: 800,  big: 1600  },
  { level: 6, small: 1600, big: 3200  },
  { level: 7, small: 3200, big: 6400  },
  { level: 8, small: 6400, big: 12800 },
];

const LEVEL_DURATION = 5 * 60 * 1000;

export default function BlindTimer({ blindStartTime, smallBlind, bigBlind }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    if (!blindStartTime) return;
    const tick = () => {
      const elapsed = Date.now() - new Date(blindStartTime).getTime();
      const lvlIdx = Math.min(Math.floor(elapsed / LEVEL_DURATION), BLIND_LEVELS.length - 1);
      const remaining = lvlIdx >= BLIND_LEVELS.length - 1 ? 0 : LEVEL_DURATION - (elapsed % LEVEL_DURATION);
      setTimeLeft(remaining);
      setLevel(lvlIdx + 1);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blindStartTime]);

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const nextLevel = BLIND_LEVELS[Math.min(level, BLIND_LEVELS.length - 1)];
  const isUrgent = timeLeft < 60000 && timeLeft > 0;

  return (
    <div className="glass-card rounded-xl p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <Timer size={12} className="text-heisenberg-muted" />
        <span className="text-heisenberg-muted text-xs font-display tracking-widest uppercase">Blinds</span>
      </div>
      <p className="font-mono text-lg font-bold text-heisenberg-neon">
        {smallBlind?.toLocaleString()} / {bigBlind?.toLocaleString()}
      </p>
      <p className="text-heisenberg-muted text-xs font-mono mt-1">Level {level}</p>
      {timeLeft > 0 && (
        <p className={`text-xs font-mono mt-1 ${isUrgent ? 'text-heisenberg-red animate-pulse' : 'text-heisenberg-muted'}`}>
          Next: {mins}:{secs.toString().padStart(2, '0')}
          {nextLevel && ` → ${nextLevel.small}/${nextLevel.big}`}
        </p>
      )}
    </div>
  );
}
